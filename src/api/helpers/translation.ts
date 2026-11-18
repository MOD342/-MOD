import crypto from "crypto";
import { GoogleGenAI } from "@google/genai";
import { serverCache } from "../../services/cacheService";
import { CURATED_GENRES_LIST } from "../../data/curatedAnimeDatabase";
import { fetchWithTimeout } from "./jikanClient";

let aiTranslateInstance: GoogleGenAI | null = null;
let lastTranslateKey: string | null = null;
function getAiTranslate(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }
  if (!aiTranslateInstance || lastTranslateKey !== apiKey) {
    try {
      aiTranslateInstance = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });
      lastTranslateKey = apiKey;
    } catch (e: any) {
      console.error("Failed to initialize GoogleGenAI client:", e.message);
      return null;
    }
  }
  return aiTranslateInstance;
}

export async function translateToArabicFree(text: string): Promise<string> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);
    const response = await fetch(
      `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ar&dt=t&q=${encodeURIComponent(text)}`,
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);
    if (response.ok) {
      const json = await response.json();
      if (Array.isArray(json) && Array.isArray(json[0])) {
        const translatedText = json[0].map((item: any) => item[0]).join('').trim();
        if (translatedText) return translatedText;
      }
    }
  } catch (err: any) {
    console.warn("[FreeTranslation] Google Translate backend failed:", err.message);
  }
  return text;
}

export async function translateToArabic(text: string): Promise<string> {
  if (!text || !text.trim()) return text;

  const cleanInput = text.replace(/\[Written by MAL Rewrite\]/gi, "").replace(/\(Source:.*?\)/gi, "").trim();
  const cacheKey = `ar_trans_${crypto.createHash("md5").update(cleanInput).digest("hex")}`;

  try {
    const cached = await serverCache.get<string>(cacheKey);
    if (cached && /[\u0600-\u06FF]/.test(cached)) {
      return cached;
    }
  } catch (e: any) {
    console.warn(`[TranslationCache] Error checking cache:`, e.message);
  }

  // 1. Primary ultra-fast translation (~200ms) via Google Translate API so synopsis is NEVER returned in English
  let translatedText = await translateToArabicFree(cleanInput);

  // 2. Fallback to Gemini if free translation didn't return Arabic characters
  if (!translatedText || !/[\u0600-\u06FF]/.test(translatedText)) {
    const client = getAiTranslate();
    if (client) {
      const modelsToTry = ["gemini-3.1-flash-lite", "gemini-4-hydrogen"];
      for (const model of modelsToTry) {
        try {
          const response = await client.models.generateContent({
            model,
            contents: `ترجم القصة التالية للأنمي إلى لغة عربية فصيحة ومشوقة لمحبين الأنمي، بدون أي مقدمات:\n\n${cleanInput}`,
          });
          if (response?.text && /[\u0600-\u06FF]/.test(response.text)) {
            translatedText = response.text.trim();
            break;
          }
        } catch (error: any) {
          console.warn(`Translation using ${model} failed:`, error.message || error);
        }
      }
    }
  }

  if (translatedText && /[\u0600-\u06FF]/.test(translatedText)) {
    try {
      await serverCache.set<string>(
        cacheKey,
        translatedText,
        30 * 24 * 60 * 60 * 1000,
      ); // 30 days cache
    } catch (cacheErr) {}
    return translatedText;
  }

  return cleanInput;
}

export async function getArabicTitle(enTitle: string): Promise<string> {
  try {
    if (!enTitle) return "";
    const lower = enTitle.toLowerCase().trim();

    // 1. Check local reverse map
    for (const [ar, en] of Object.entries(LOCAL_ANIME_MAP)) {
      if (en.toLowerCase().trim() === lower) {
        return ar;
      }
    }

    // 2. Try server cache
    const cacheKey = `title_ar_${crypto.createHash("md5").update(lower).digest("hex")}`;
    try {
      const cached = await serverCache.get<string>(cacheKey);
      if (cached) return cached;
    } catch {}

    // 3. Fast Google Translate in background to prevent API blocking!
    // Return English title immediately so pages load instantly (under 100ms).
    // The translation will be fetched in background and cached for the subsequent requests.
    translateAndCacheInBackground(enTitle, cacheKey);
  } catch (err: any) {
    console.warn(`[getArabicTitle] failed for "${enTitle}":`, err.message);
  }
  return enTitle;
}

function translateAndCacheInBackground(enTitle: string, cacheKey: string) {
  // Fire and forget so we never block client response time under rate-limiting
  translateToArabicFree(enTitle).then((translated) => {
    if (translated && translated !== enTitle) {
      serverCache.set<string>(cacheKey, translated, 30 * 24 * 60 * 60 * 1000).catch(() => {});
    }
  }).catch((err: any) => {
    console.warn(`[BackgroundTranslation] Failed for ${enTitle}:`, err.message);
  });
}

// دالة الترجمة لخلفية الويب لأسماء الأنمي لضمان عدم حدوث أي حصر للـ event loop
function translateTitleToEnglishInBackground(title: string, cacheKey: string) {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=ar&tl=en&dt=t&q=${encodeURIComponent(title)}`;
  fetch(url)
    .then((res) => {
      if (res.ok) return res.json();
      throw new Error("HTTP Status " + res.status);
    })
    .then((json) => {
      if (Array.isArray(json) && Array.isArray(json[0])) {
        const translatedText = json[0].map((item: any) => item[0]).join('').trim();
        if (translatedText && translatedText !== title) {
          serverCache.set<string>(cacheKey, translatedText, 30 * 24 * 60 * 60 * 1000).catch(() => {});
        }
      }
    })
    .catch((err) => {
      console.warn("[BackgroundTitleTranslation] Google Translate background failed:", err.message);
    });
}

export async function translateTitleToEnglish(title: string): Promise<string> {
  try {
    if (!title) return "";

    // If it is already in standard English/romanized letters and doesn't contain Japanese or Arabic characters, return directly
    if (
      /^[a-zA-Z0-9\s\-,.:'!()&?]+$/.test(title) &&
      !/[\u0600-\u06FF\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f\u4e00-\u9faf]/.test(
        title,
      )
    ) {
      return title;
    }

    const normalized = normalizeArabic(title);
    if (LOCAL_ANIME_MAP[normalized]) {
      return LOCAL_ANIME_MAP[normalized];
    }

    // Check if any key from LOCAL_ANIME_MAP is inside the title
    for (const [arKey, enVal] of Object.entries(LOCAL_ANIME_MAP)) {
      if (normalized.includes(arKey)) {
        return enVal;
      }
    }

    // Try server cache
    const cacheKey = `title_en_${crypto.createHash("md5").update(title.toLowerCase().trim()).digest("hex")}`;
    try {
      const cached = await serverCache.get<string>(cacheKey);
      if (cached) return cached;
    } catch {}

    // Fast, simple local formatting & cleanup of common prefixes or episode keywords to return instantly
    let cleaned = title
      .replace(/انمي|موسم|حلقة|فيلم|أفلام|مسلسل/gi, "")
      .replace(/\s+/g, " ")
      .trim();

    const instantResult = cleaned || title;

    // Trigger translation in background to populate server cache for subsequent requests
    translateTitleToEnglishInBackground(title, cacheKey);

    return instantResult;
  } catch (error) {
    return title;
  }
}

export async function translateItemsList(items: any[]): Promise<any[]> {
  if (!items || !Array.isArray(items)) return [];
  return Promise.all(
    items.map(async (item) => {
      if (item && item.title) {
        const enTitle = await translateTitleToEnglish(item.title);
        return { ...item, title: enTitle };
      }
      return item;
    }),
  );
}

export const GENRE_AR_MAP: Record<string, string> = {
  action: "أكشن",
  adventure: "مغامرات",
  comedy: "كوميدي",
  drama: "دراما",
  fantasy: "فانتازيا",
  mystery: "غموض",
  romance: "رومانسي",
  "sci-fi": "خيال علمي",
  "science fiction": "خيال علمي",
  "slice of life": "شريحة من الحياة",
  sports: "رياضي",
  supernatural: "خوارق",
  suspense: "إثارة",
  thriller: "إثارة وتشويق",
  psychological: "نفسي",
  horror: "رعب",
  isekai: "إيسيكاي",
  "martial arts": "فنون قتالية",
  historical: "تاريخي",
  mecha: "ميكا (آليات)",
  music: "موسيقى",
  school: "مدرسي",
  military: "عسكري",
  shounen: "شونين",
  seinen: "سينين",
  shoujo: "شوجو",
  josei: "جوسي",
  parody: "محاكاة ساخرة",
  superpower: "قوى خارقة",
  "super power": "قوى خارقة",
  demons: "شياطين",
  vampire: "مصاصي دماء",
  space: "فضاء",
  game: "ألعاب",
  samurai: "ساموراي",
  magic: "سحر",
  police: "شرطة",
  detective: "تحقيق",
  mythology: "أساطير",
  gore: "دموي",
  award_winning: "حائز على جوائز",
  "award winning": "حائز على جوائز",
  gourmet: "طهي",
  mahou_shoujo: "فتيات سحريات",
  "mahou shoujo": "فتيات سحريات",
  ecchi: "إيتشي",
  avant_garde: "طليعي",
  "avant garde": "طليعي",
};

export function translateGenreToArabic(genre: string): string {
  if (!genre) return "";
  const trimmed = String(genre).trim();
  if (/[\u0600-\u06FF]/.test(trimmed)) return trimmed;
  const lower = trimmed.toLowerCase();
  if (GENRE_AR_MAP[lower]) return GENRE_AR_MAP[lower];
  const fromCurated = CURATED_GENRES_LIST.find(
    (g) => g.name.toLowerCase() === lower
  );
  if (fromCurated?.nameAr) return fromCurated.nameAr;
  return trimmed;
}

export function translateGenresListToArabic(genres: any[]): string[] {
  if (!Array.isArray(genres)) return ["أكشن", "فانتازيا"];
  const mapped = genres
    .map((g) => (typeof g === "string" ? translateGenreToArabic(g) : translateGenreToArabic(g?.name || "")))
    .filter(Boolean);
  return Array.from(new Set(mapped));
}
// دالة الترجمة غير الحاصرة في الخلفية للقصة لضمان تجربة مستخدم فائقة السرعة
export function translateDescriptionInBackground(id: string, description: string) {
  if (!description || !/[a-zA-Z]{5,}/.test(description)) return;
  translateToArabic(description)
    .then(async (translated) => {
      if (translated && translated !== description) {
        const cacheKey = `anime-details-v8-${id}`;
        const cached = await serverCache.get<any>(cacheKey);
        if (cached) {
          cached.description = translated;
          await serverCache.set(cacheKey, cached, 24 * 60 * 60 * 1000);
          console.log(`[BackgroundTranslation] Synopsis translated and cached successfully for ${id}`);
        }
      }
    })
    .catch((err) => {
      console.warn(`[BackgroundTranslation] Failed for anime ${id}:`, err.message);
    });
}

export const LOCAL_ANIME_MAP: Record<string, string> = {
  "ون بيس": "One Piece",
  ونبيس: "One Piece",
  ناروتو: "Naruto",
  "ناروتو شيبودن": "Naruto Shippuden",
  "ناروتو شيبودين": "Naruto Shippuden",
  "هجوم العمالقه": "Attack on Titan",
  "هجوم العمالقة": "Attack on Titan",
  اتاك: "Attack on Titan",
  "اتاك اون تايتن": "Attack on Titan",
  "مذكره الموت": "Death Note",
  "مذكرة الموت": "Death Note",
  "دفتر الموت": "Death Note",
  "ديث نوت": "Death Note",
  "قاتل الشياطين": "Kimetsu no Yaiba",
  "ديمون سلاير": "Kimetsu no Yaiba",
  بليتش: "Bleach",
  هنتر: "Hunter x Hunter",
  القناص: "Hunter x Hunter",
  "هنتر x هنتر": "Hunter x Hunter",
  "جوجوتسو كايسن": "Jujutsu Kaisen",
  جوجوتسو: "Jujutsu Kaisen",
  جوجيتسو: "Jujutsu Kaisen",
  "طوكيو غول": "Tokyo Ghoul",
  "توكيو غول": "Tokyo Ghoul",
  "دراغون بول": "Dragon Ball",
  "دراغون بول زد": "Dragon Ball Z",
  "دراغون بول سوبر": "Dragon Ball Super",
  "ماي هيرو اكاديميا": "My Hero Academia",
  "بوكو نو هيرو": "My Hero Academia",
  "اكاديميه بطلي": "My Hero Academia",
  "اكاديمية بطلي": "My Hero Academia",
  "سورد ارت اونلاين": "Sword Art Online",
  "بوابه شتاينز": "Steins;Gate",
  "بوابة شتاينز": "Steins;Gate",
  "شتاينز غيت": "Steins;Gate",
  "فول ميتال": "Fullmetal Alchemist",
  فولميتال: "Fullmetal Alchemist",
  "الخيميائي الفولاذي": "Fullmetal Alchemist",
  "كود غياس": "Code Geass",
  "كود جياس": "Code Geass",
  "سولو ليفيلينغ": "Solo Leveling",
  "سولو ليفيلنج": "Solo Leveling",
  "موب سايكو": "Mob Psycho 100",
  "ون بنش مان": "One Punch Man",
  "رجل لكمه واحده": "One Punch Man",
  "رجل لكمة واحدة": "One Punch Man",
  "ون بنش": "One Punch Man",
  "رجل المنشار": "Chainsaw Man",
  "شينسو مان": "Chainsaw Man",
  "فينلاندا ساغا": "Vinland Saga",
  "فينلاند ساغا": "Vinland Saga",
  فينلاند: "Vinland Saga",
  "دكتور ستون": "Dr. Stone",
  "بلاك كلوفر": "Black Clover",
  "البرسيم الاسود": "Black Clover",
  "البرسيم الأسود": "Black Clover",
  هايكو: "Haikyuu",
  هايكيو: "Haikyuu",
  هايكيوو: "Haikyuu",
  جوندام: "Gundam",
  اوفرلورد: "Overlord",
  سلايم: "Tensura",
  "نيون جينيسيس": "Neon Genesis Evangelion",
  ايفانجيليون: "Neon Genesis Evangelion",
  سلايرز: "Slayers",
  كونان: "Detective Conan",
  "المحقق كونان": "Detective Conan",
  دراغون: "Dragon",
  ليفاي: "Levi Ackerman",
  ميكاسا: "Mikasa Ackerman",
  ايرين: "Eren Yeager",
  إيرين: "Eren Yeager",
  غوكو: "Goku",
  لوفي: "Luffy",
  زورو: "Zoro",
  سنجي: "Sanji",
  ايتاتشي: "Itachi Uchiha",
  ساسكي: "Sasuke Uchiha",
  مادارا: "Madara Uchiha",
  غوجو: "Gojo Satoru",
  جوجو: "JoJo's Bizarre Adventure",
};

export function normalizeArabic(str: string): string {
  return str
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/[ة]/g, "ه")
    .replace(/\s+/g, " ");
}

export async function smartQueryTranslator(queryStr: string): Promise<string> {
  const trimmed = queryStr.trim();
  // Check if query contains Arabic text. If not, return immediately.
  if (!/[\u0600-\u06FF]/.test(trimmed)) {
    return trimmed;
  }

  // 1. Check local mapper with normalized query
  const normalizedQuery = normalizeArabic(trimmed);
  if (LOCAL_ANIME_MAP[normalizedQuery]) {
    console.log(
      `[Smart Translation] Local Map Hit: "${trimmed}" -> "${LOCAL_ANIME_MAP[normalizedQuery]}"`,
    );
    return LOCAL_ANIME_MAP[normalizedQuery];
  }

  // Check direct keys
  if (LOCAL_ANIME_MAP[trimmed]) {
    console.log(
      `[Smart Translation] Local Map Direct Hit: "${trimmed}" -> "${LOCAL_ANIME_MAP[trimmed]}"`,
    );
    return LOCAL_ANIME_MAP[trimmed];
  }

  // 2. Check persistence server cache for already translated queries to conserve API quota
  const cacheKey = `trans_q_${Buffer.from(normalizedQuery).toString("base64").replace(/=/g, "")}`;
  try {
    const cached = await serverCache.get<string>(cacheKey);
    if (cached) {
      console.log(`[Smart Translation] Cache Hit: "${trimmed}" -> "${cached}"`);
      return cached;
    }
  } catch (err: any) {
    console.warn("[Smart Translation] Cache lookup warning:", err.message);
  }

  // 3. Fast Google Translate (ar -> en) for immediate Arabic anime title resolution (~150ms)
  try {
    const gtUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=ar&tl=en&dt=t&q=${encodeURIComponent(trimmed)}`;
    const gtRes = await fetchWithTimeout(gtUrl, {}, 2500);
    if (gtRes && gtRes.ok) {
      const gtJson = await gtRes.json();
      if (Array.isArray(gtJson) && Array.isArray(gtJson[0])) {
        const gtTranslated = gtJson[0]
          .map((item: any) => item[0])
          .join("")
          .trim();
        if (gtTranslated && /[a-zA-Z]/.test(gtTranslated)) {
          await serverCache.set(cacheKey, gtTranslated, 7 * 24 * 60 * 60 * 1000).catch(() => {});
          return gtTranslated;
        }
      }
    }
  } catch {}

  // 4. Fallback to Gemini with active models
  const client = getAiTranslate();
  if (!client) {
    return trimmed;
  }

  const modelsToTry = [
    "gemini-3.1-flash-lite",
    "gemini-4-hydrogen",
  ];
  const prompt = `You are an intelligent search processor for an anime streaming application.
The user entered an Arabic anime or character search description: "${trimmed}".
Your job is to translate and expand this search query so that it successfully matches standard worldwide databases (like MyAnimeList).
Examples:
- "ون بيس" -> "One Piece"
- "شخصية ليفاي" -> "Levi Ackerman"
- "زورو" -> "Zoro"
- "مذكرة الموت" -> "Death Note"
- "قاتل الشياطين" -> "Kimetsu no Yaiba"
- "ناروتو شيبودن" -> "Naruto Shippuden"
- "ايتاتشي" -> "Itachi Uchiha"
- "طوكيو غول" -> "Tokyo Ghoul"
- "غوكو" -> "Goku"

Respond with ONLY the plain English translated title or character name. Do NOT include any additional labels, quotes, explanation, or markdown.`;

  for (const model of modelsToTry) {
    try {
      const response = await client.models.generateContent({
        model: model,
        contents: prompt,
      });

      if (response?.text) {
        const result = response.text.trim();
        console.log(
          `Smart Search Query translator using ${model}: "${trimmed}" -> "${result}"`,
        );

        // Cache the resolved result for 7 days to preserve resources and maintain instant speed
        try {
          await serverCache.set(cacheKey, result, 7 * 24 * 60 * 60 * 1000);
        } catch (_) {}

        return result;
      }
    } catch (err: any) {
      console.warn(
        `Gemini query translator using ${model} failed (trying next fallback):`,
        err.message || err,
      );
    }
  }

  console.warn(
    "All search query translation models bypassed. Returning original input query.",
  );
  return trimmed;
}
