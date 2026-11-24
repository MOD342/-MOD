import { Router, Request, Response, NextFunction } from 'express';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';
import { anilistService } from '../services/anilistService';
import { mangaService } from '../services/mangaService';
import { cleanAnimeTitle } from '../utils/animeTitleCleaner';
import { translateGenresListToArabic } from './helpers/translation';

const router = Router();
let aiInstance: GoogleGenAI | null = null;
let lastLoadedKey: string | null = null;

function getAi(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }
  if (!aiInstance || lastLoadedKey !== apiKey) {
    try {
      aiInstance = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });
      lastLoadedKey = apiKey;
    } catch (e: any) {
      console.error("Failed to initialize GoogleGenAI:", e.message);
      return null;
    }
  }
  return aiInstance;
}

// ============================================================================
// HIGH-CONCURRENCY MULTI-USER SCALING & CACHING ENGINE
// ============================================================================

// 1. Per-User / Per-IP Sliding Window Rate Limiter (protects global API quota)
const userRateMap = new Map<string, { timestamps: number[] }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_CHAT_REQ_PER_MIN = 20; // Generous limit for natural multi-turn conversations

function checkRateLimit(identifier: string): { allowed: boolean; retryAfterSec?: number } {
  const now = Date.now();
  const entry = userRateMap.get(identifier) || { timestamps: [] };
  entry.timestamps = entry.timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);

  if (entry.timestamps.length >= MAX_CHAT_REQ_PER_MIN) {
    const oldest = entry.timestamps[0];
    const retryAfterSec = Math.max(1, Math.ceil((RATE_LIMIT_WINDOW_MS - (now - oldest)) / 1000));
    userRateMap.set(identifier, entry);
    return { allowed: false, retryAfterSec };
  }

  entry.timestamps.push(now);
  userRateMap.set(identifier, entry);

  // Periodic cleanup to prevent memory leaks under high user volume
  if (userRateMap.size > 5000) {
    for (const [k, v] of userRateMap.entries()) {
      if (v.timestamps.every((t) => now - t >= RATE_LIMIT_WINDOW_MS)) {
        userRateMap.delete(k);
      }
    }
  }

  return { allowed: true };
}

// 2. Multi-User Games & Anti-Cheat Pool Cache (prevents calling Gemini on every game start)
const gamesPoolCache = new Map<string, { questions: any[]; expiresAt: number; refreshing: boolean }>();
const antiCheatCache = new Map<string, { data: any; expiresAt: number }>();
const GAMES_CACHE_TTL_MS = 20 * 60 * 1000; // 20 minutes shared pool per game type

export interface ChatAnimeCard {
  id: string;
  mediaType?: 'anime' | 'manga';
  originLabel?: string;
  title: string;
  posterUrl: string;
  rating: number | null;
  type: string;
  episodes: number | null;
  year: number | null;
  genres: string[];
}

async function resolveSuggestedAnimeCards(
  animeTitles: string[],
  mangaTitles: string[] = [],
): Promise<ChatAnimeCard[]> {
  const cleanedAnimes = Array.from(
    new Set(
      (animeTitles || [])
        .map((t) => String(t || '').trim())
        .filter((t) => t.length >= 2 && t.length <= 120)
    )
  ).slice(0, 4);

  const cleanedMangas = Array.from(
    new Set(
      (mangaTitles || [])
        .map((t) => String(t || '').trim())
        .filter((t) => t.length >= 2 && t.length <= 120)
    )
  ).slice(0, 4);

  if (cleanedAnimes.length === 0 && cleanedMangas.length === 0) return [];

  const lookupAnime = async (query: string): Promise<ChatAnimeCard | null> => {
    try {
      const res = await anilistService.searchAnime({ q: query, page: 1 });
      const first = res?.data?.[0];
      if (!first) return null;
      const id = String(first.mal_id || first.anilist_id || '');
      if (!id) return null;
      const posterUrl = first.images?.jpg?.large_image_url || first.images?.jpg?.image_url || '';
      const rawTitle = first.title_english || first.title || query;
      const genres = translateGenresListToArabic(first.genres || []).slice(0, 2);

      return {
        id,
        mediaType: 'anime',
        title: cleanAnimeTitle(rawTitle) || rawTitle,
        posterUrl,
        rating: typeof first.score === 'number' ? first.score : null,
        type: String(first.type || 'TV'),
        episodes: typeof first.episodes === 'number' ? first.episodes : null,
        year: typeof first.year === 'number' ? first.year : null,
        genres,
      };
    } catch {
      return null;
    }
  };

  const lookupManga = async (query: string): Promise<ChatAnimeCard | null> => {
    try {
      const res = await mangaService.searchManga({ q: query, page: 1 });
      const first = res?.data?.[0];
      if (!first) return null;
      return {
        id: String(first._id),
        mediaType: 'manga',
        originLabel: first.originLabel || 'مانجا',
        title: first.title || query,
        posterUrl: first.posterUrl || '',
        rating: typeof first.rating === 'number' ? first.rating : null,
        type: first.originLabel || 'مانجا',
        episodes: typeof first.chaptersCount === 'number' ? first.chaptersCount : null,
        year: typeof first.releaseYear === 'number' ? first.releaseYear : null,
        genres: Array.isArray(first.genres) ? first.genres.slice(0, 2) : [],
      };
    } catch {
      return null;
    }
  };

  try {
    const resolved = await Promise.race([
      Promise.all([
        ...cleanedAnimes.map((t) => lookupAnime(t)),
        ...cleanedMangas.map((t) => lookupManga(t)),
      ]),
      new Promise<Array<ChatAnimeCard | null>>((resolve) =>
        setTimeout(() => resolve([]), 3000)
      ),
    ]);
    const seenKeys = new Set<string>();
    const cards: ChatAnimeCard[] = [];
    for (const item of resolved) {
      const key = item ? `${item.mediaType || 'anime'}:${item.id}` : '';
      if (item && key && !seenKeys.has(key)) {
        seenKeys.add(key);
        cards.push(item);
      }
    }
    return cards;
  } catch {
    return [];
  }
}

const FALLBACK_GAMES: Record<string, any[]> = {
  quotes: [
    {
      text: "أنا لست بطلاً لأنني أريد ذلك، بل لأنني يجب أن أكون كذلك!",
      options: ['سون غوكو', 'مونكي دي لوفي', 'ميدوريا إيزوكو', 'أوزوماكي ناروتو'],
      correct: 1,
      anime: 'ون بيس'
    },
    {
      text: "الخوف ليس سيئاً، بل يخبرك بما هي نقاط ضعفك الحقيقية.",
      options: ['جراي فورستار', 'جيلدارتس كليف', 'ماكاروف', 'ناتسو دراغنيل'],
      correct: 1,
      anime: 'فيفي تيل'
    },
    {
      text: "إذا كنت لا تشارك شخصًا ما ألمه، فلن تفهمه أبدًا.",
      options: ['هاتاكي كاكاشي', 'أوتشيها إيتاتشي', 'باين (ناغاتو)', 'أوزوماكي ناروتو'],
      correct: 2,
      anime: 'ناروتو شيبودن'
    },
    {
      text: "البشر لديهم الحق في البحث عن السعادة، لكن الصعوبة تكمن في العثور عليها وتثبيتها.",
      options: ['جيرايا (الناسك المنحرف)', 'سينجو توبيراما', 'أوروتشيمارو', 'أوتشيها مادارا'],
      correct: 0,
      anime: 'ناروتو'
    },
    {
      text: "الاستسلام هو ما يقتل الناس، عندما يرفض الناس الاستسلام... يكتسبون الحق في تجاوز حدودهم!",
      options: ['أوسوب', 'رورونوا زورو', 'مونكي دي لوفي', 'نامي'],
      correct: 2,
      anime: 'ون بيس'
    }
  ],
  imposter: [
    {
      anime: 'ناروتو شيبودن',
      options: ['أوزوماكي ناروتو', 'أوتشيها ساسكي', 'هارونو ساكورا', 'مونكي دي لوفي'],
      correct: 3
    },
    {
      anime: 'هجوم العمالقة',
      options: ['ليفاي أكرمان', 'ميكاسا أكرمان', 'إرين ييغر', 'سون غوكو'],
      correct: 3
    },
    {
      anime: 'قاتل الشياطين',
      options: ['كامادو تانجيرو', 'كامادو نيزوكو', 'أوتشيها إيتاتشي', 'أغنيس زينيتسو'],
      correct: 2
    },
    {
      anime: 'مذكرة الموت',
      options: ['إل (L)', 'ياغامي لايت', 'ريوك', 'كيلوا زولديك'],
      correct: 3
    },
    {
      anime: 'هنتر x هنتر',
      options: ['غون فريكس', 'كيلوا زولديك', 'كورابيكا', 'هاتاكي كاكاشي'],
      correct: 3
    }
  ],
  emoji: [
    {
      emojis: '☠️ 🍖 👒 ⚔️',
      options: ['دراغون بول', 'ون بيس', 'ناروتو', 'بليتش'],
      correct: 1
    },
    {
      emojis: '📓 🍎 🧠 🕵️‍♂️',
      options: ['مذكرة الموت', 'المحقق كونان', 'طوكيو غول', 'هجوم العمالقة'],
      correct: 0
    },
    {
      emojis: '🦊 🧡 🍥 🌀',
      options: ['قاتل الشياطين', 'ناروتو شيبودن', 'هنتر x هنتر', 'ون بيس'],
      correct: 1
    },
    {
      emojis: '🗡️ 🐗 ⚡ 👹',
      options: ['ون بيس', 'بليتش', 'قاتل الشياطين', 'جوجوتسو كايسن'],
      correct: 2
    },
    {
      emojis: '🧑‍🦲 👊 💥 🦸‍♂️',
      options: ['ون بنش مان', 'أكاديمية بطلي', 'موب سايكو 100', 'دراغون بول Z'],
      correct: 0
    }
  ],
  lyrics: [
    {
      text: "شرف الوطن، أغلى من شرف حياتي... عهد الأصدقاء مرسوم في وجداني",
      options: ['عهد الأصدقاء', 'روبن هود', 'صقور الأرض', 'دروب ريمي'],
      correct: 0
    },
    {
      text: "قد تلمع صور في مخيلتنا تلوح معلنة أن روح الأمل ما زالت حية لم تمت",
      options: ['أنا وأخي', 'أبطال الديجيتال', 'سابق ولاحق', 'سيف النار'],
      correct: 1
    },
    {
      text: "حلمنا نهار، نهارنا عمل... نملك الخيار وخيارنا الأمل",
      options: ['أبطال الديجيتال', 'القناص (Hunter x Hunter)', 'فرسان الأرض', 'صقور الأرض'],
      correct: 1
    },
    {
      text: "في جعبتي حكاية، يرويها حكيم... عن قصص قديمة، من زمن قديم",
      options: ['في جعبتي حكاية', 'سندباد', 'ماوكلي فتى الكهوف', 'أمينة الأنيقة'],
      correct: 0
    },
    {
      text: "لا تبكِ يا صغيري، لا انظر نحو السماء... يمنحنا الدفء ويزيل عنا العناء",
      options: ['أنا وأخي', 'دروب ريمي', 'عهد الأصدقاء', 'سالي القديمة'],
      correct: 1
    }
  ],
  trivia: [
    {
      text: "لوفي استغرق سنتين كاملتين للتدريب برفقة سيلفرز رايلي في جزيرة روسكاينا المهجورة لتعلم الهاكي.",
      isTrue: true,
      explanation: "صحيح، لوفي اعتزل العالم برفقة رايلي للتدريب الشاق لمدة عامين كاملين قبل العودة إلى أرخبيل شابوندي."
    },
    {
      text: "مانغا وأنمي 'مذكرة الموت' (Death Note) من تأليف الكاتب الأسطوري والرسام إيتشيرو أودا.",
      isTrue: false,
      explanation: "خاطئ تماماً، إيتشيرو أودا هو مؤلف ون بيس. بينما مؤلف مذكرة الموت هو تسوغومي أوبا والرسام هو تاكيشي أوباتا."
    },
    {
      text: "هاتاكي كاكاشي تم تعيينه كالهوكاجي الخامس لقرية كونوها بعد نهاية حرب النينجا العظمى مباشرة.",
      isTrue: false,
      explanation: "خاطئ، تسونادي هي من تولت منصب الهوكاجي الخامس، كاكاشي تم تعيينه الهوكاجي السادس، وناروتو الأوزوماكي هو السابع."
    },
    {
      text: "نجح غون فريكس في المرة المئة فقط من اجتياز اختبار الصيادين المهيب بعد مواجهات ملحمية مع هيسوكا.",
      isTrue: false,
      explanation: "خاطئ، غون نجح في المرة الأولى التي تقدم فيها للبطولة والامتحان بينما كيلوا نجح في المحاولة الثانية بعد استبعاد سابقتها."
    },
    {
      text: "في عالم جوجوتسو كايسن، ريومين سوكونا المشهور بملك اللعنات يمتلك بالكامل 20 إصبعاً تم تفريقها وختمها عبر العصور.",
      isTrue: true,
      explanation: "صحيح، كل إصبع يحتوي على جزء غامض من طاقة سوكونا، وابتلاع يوجي إيتادوري لإصبع واحد منه جعله وعاءً لملك اللعنات."
    }
  ],
  math: [
    {
      text: "عدد كرات التنين في كوكبة الأرض (7) كرات + عدد السيوف التي يحملها رورونوا زورو دائماً في قتالاته (3)",
      answer: 10,
      options: [7, 8, 10, 12],
      correct: 2
    },
    {
      text: "أقصى عدد من البوابات الثمانية التي يستطيع مايت غاي فتحها (8) - رتبة الهوكاجي لناروتو أوزوماكي كمنصب رسمي (7)",
      answer: 1,
      options: [0, 1, 2, 3],
      correct: 1
    },
    {
      text: "عدد أعضاء فريق السبعة الأسطوري الأصليين (3) أفراد + عدد الأعين التي تملكها البومة العملاقة في طاقم كاكاشي (1)",
      answer: 4,
      options: [2, 3, 4, 5],
      correct: 2
    },
    {
      text: "عدد أفراد طاقم قبعة القش حتى نهاية أرك وانو بما فيهم جينبي (10) * عدد عيون ليفاي أكرمان السليمة تماماً بالقصة (1)",
      answer: 10,
      options: [10, 20, 5, 0],
      correct: 0
    },
    {
      text: "الحلقة التي ظهر فيها الجير فايف للوفي لأول مرة (1071) - الرقم المطابق لسنة تأسيس الاستوديو توي أنيميشن بالكامل (1956)",
      answer: 885,
      options: [885, 915, 1071, 1000],
      correct: 0
    }
  ],
  timeline: [
    {
      e1: "قيام إيتاتشي أوتشيها بالقضاء على العشيرة لإنقاذ قرية كونوها وتأمين حماية ساسكي",
      e2: "مواجهة ساسكي أوتشيها لإيتاتشي بغرض الثأر والانتقام في المقر السري",
      first: 1
    },
    {
      e1: "انفجار سفينة الجوينج ميري واحتراقها بصورة مؤلمة بعد إنقاذ الطاقم من إينيس لوبي",
      e2: "بناء سفينة الثاوزند ساني (Thousand Sunny) على يد فرانكي ودخولها المياه الإقليمية",
      first: 1
    },
    {
      e1: "إعدام ملك القراصنة غول دي روجر وإعلانه عن الكنز الأسطوري ون بيس",
      e2: "انطلاق مونكي دي لوفي في رحلته بعمر 17 عاماً للحصول على طاقم قراصنة خاص به",
      first: 1
    },
    {
      e1: "انضمام غراي فولستار لنقابة فيري تيل كطفل يتيم يبحث عن معلمة",
      e2: "لقاء ناتسو دراغنيل بلوسي هارتفيليا وعرض الانضمام إلى نقابة فيري تيل الشهيرة",
      first: 1
    },
    {
      e1: "اجتياز غون فريكس لامتحان الصيادين الصعب وامتلاك رخصة صيد مرخصة",
      e2: "صعود غون وكيلوا لبرج السماء (Heavens Arena) لتعلم أسرار الطاقة والنين قتالياً",
      first: 1
    }
  ]
};

const handleAsync = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) => (req: Request, res: Response, next: NextFunction) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

router.post('/chat', handleAsync(async (req: Request, res: Response) => {
  const { messages, userId, userName, userLevel, favoriteAnimes } = req.body;
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ success: false, message: 'Invalid messages array.' });
  }

  // 1. Fair multi-user rate limit
  const clientId = String(userId || req.headers['x-forwarded-for'] || req.ip || 'anon');
  const rateCheck = checkRateLimit(clientId);
  if (!rateCheck.allowed) {
    return res.status(429).json({
      success: false,
      rateLimited: true,
      retryAfterSec: rateCheck.retryAfterSec,
      message: `مهلاً! أرسل الرسائل بهدوء، انتظر ${rateCheck.retryAfterSec} ثانية فقط.`,
    });
  }

  const cleanUserName = String(userName || '').trim().slice(0, 60);
  const librarySample = Array.isArray(favoriteAnimes)
    ? favoriteAnimes.map((t: any) => String(t || '').trim()).filter(Boolean).slice(0, 8)
    : [];

  // Keep rich conversational memory (up to last 14 turns) with zero static cache
  const recentMessages = messages
    .slice(-14)
    .map((m: any) => ({
      sender: m.sender === 'user' ? 'user' : 'bot',
      text: String(m.text || '').slice(0, 1400).trim(),
    }))
    .filter((m: any) => m.text.length > 0);

  const lastUserMsg = [...recentMessages].reverse().find((m) => m.sender === 'user')?.text || '';
  if (!lastUserMsg) {
    return res.status(400).json({ success: false, message: 'Message text is required.' });
  }

  const ai = getAi();
  if (!ai) {
    return res.status(503).json({
      success: false,
      aiMissingKey: true,
      message: 'مفتاح GEMINI_API_KEY غير مضبوط على الخادم الحالي. يرجى التحقق من إعدادات الأسرار في الخادم.',
    });
  }

  try {
    const identityContext = cleanUserName
      ? `صديقك الذي تتحدث معه الآن اسمه المعروض في حسابه: "${cleanUserName}"${userLevel ? ` (مستواه في التطبيق ${userLevel})` : ''}.`
      : 'صديقك يتصفح حالياً كزائر بدون اسم عرض مسجل.';

    const tasteContext =
      librarySample.length > 0
        ? `من الأنميات الموجودة في قائمته/مفضلته حالياً: ${librarySample.join('، ')}. استخدم هذه المعلومة بذكاء وعفوية فقط إذا ناسب السياق لتفهم ذوقه أو تفاجئه بتوصية قريبة من جوه.`
        : '';

    const systemInstruction = `أنت "مود" (MOD)، المساعد الذكي والصديق الأوتاكو المقرّب داخل تطبيق «أوتاكو MOD». تتحدث بعفوية وذكاء وخفة دم كصاحب حقيقي شغوف بالأنمي والمانجا والمانهوا والمانها، ولست روبوت دعم جامداً.

معلومات صديقك:
${identityContext}
${tasteContext}

معرفتك الكاملة بميزات وتحديثات تطبيق «أوتاكو MOD» الحالية (أجب بدقة إذا سألك المستخدم عن أي ميزة في التطبيق):
- **شاشتان رئيسيتان (الأنمي + المانجا والمانهوا)**: يمكن للمستخدم التبديل الفوري بين «رئيسية الأنمي» و«رئيسية المانجا والمانهوا» عبر الضغط على شعار «أوتاكو MOD» في الشريط العلوي بجوار صورة الملف الشخصي، أو اختيار الشاشة الافتراضية من الإعدادات أو شاشة البداية الأولى.
- **قارئ المانجا والمانهوا والمانها المتكامل**: يدعم وضع الويب تون (التمرير العمودي المتصل للمانهوا) ووضع الصفحة المفردة ووضع العرض المزدوج (صفحتين معاً) للشاشات الكبيرة والتابلت والأجهزة القابلة للطي، مع شريطين علوي وسفلي ديناميكيين يظهران ويختفيان بلمسة في منتصف الشاشة، وحفظ تقدم القراءة تلقائياً، وتنزيل الفصول للقراءة دون إنترنت.
- **التنزيلات المجمّعة**: في شاشة التنزيلات يتم تجميع الحلقات التابعة لأنمي واحد أو الفصول التابعة لمانجا/مانهوا واحدة في قائمة مرتبة تحت عنوان العمل نفسه لسهولة التصفح والإدارة.
- **البانرات السينمائية المتعددة**: تدعم الواجهتان الرئيسيتان عدة أشكال للبانرات السينمائية في الأعلى وتبويبات التصفية (الكل، مانجا يابانية، مانهوا كورية، مانها صينية) أسفل البانر في شاشة المانجا.
- **المظهر والإشعارات والملف الشخصي**: 4 أوضاع للمظهر (فاتح، داكن، أموليد أسود نقي، تلقائي)، وإشعارات داخلية قابلة للإزاحة بالسحب، وإشعارات خارجية ذكية للحلقات والفصول والأعمال الجديدة، وسجل مشاهدة وقراءة قابل للحذف الفردي أو الكلي، والانتقال السريع للملف الشخصي بالضغط على صورة البروفايل.
- **حلبة الأوتاكو والمتجر والمستويات**: تحديات وألعاب، متجر إطارات وشارات وألقاب، وتوصيات تفاعلية داخل المجتمع.

أسلوبك في الكلام:
- ${
      cleanUserName
        ? `نادِ صديقك باسمه المعروض "${cleanUserName}" أحياناً بشكل طبيعي ودافئ، ولا تنادِه أبداً بمعرّف الحساب (@) أو الـ ID أو الأرقام أو البريد.`
        : 'نادِ صديقك بعبارات ودية مثل "يا صديقي" أو "يا صاحبي" دون استخدام أي معرّفات أو أرقام.'
    }
- تفاعل مع كلامه بنفس طاقته وروحه: إذا رحّب بك بعفوية أو سألك سؤالاً سريعاً، جارِه بنفس العفوية وخفة الدم دون خطب مكررة.
- تحدث بعربية حية وبسيطة وقريبة من القلب، ونوّع أسلوبك حسب السياق: رد سريع للسوالف الخفيفة، ونقاش عميق ومفصل وقت النظريات والترشيحات.
- ممنوع تماماً القوالب المكررة أو العبارات الآلية مثل "أهلاً بك يا بطل الأوتاكو" أو "بصفتي مساعدك" أو "بخصوص سؤالك حول" أو "كيف يمكنني مساعدتك اليوم؟".
- تجنّب الحرق إلا إذا طلب صديقك صراحةً التعمق في الأحداث.

قواعد البطاقات التفاعلية (مهم جداً):
- أخرج ردك دائماً بصيغة JSON مطابقة للـ schema:
  1. "reply": نص ردك الطبيعي الكامل لصديقك (يمكنك استخدام **الخط العريض** لتمييز أسماء الأعمال فقط عند الحاجة).
  2. "suggestedAnimes": مصفوفة تحتوي فقط على الأسماء الإنجليزية أو الرومانجية الدقيقة للأنميات التي رشّحتها أو ركّزت الحديث عليها في ردك (بحد أقصى 4 أنميات، مثال: ["Steins;Gate", "Monster"]) ليتم عرض بطاقتها التفاعلية للانتقال السريع. إذا لم تذكر أنمي اتركها [].
  3. "suggestedMangas": مصفوفة تحتوي فقط على الأسماء الإنجليزية أو الرومانجية الدقيقة لأعمال المانجا أو المانهوا أو المانها التي رشّحتها أو طلبها صديقك (بحد أقصى 4 أعمال، مثال: ["Solo Leveling", "Berserk", "Omniscient Reader's Viewpoint"]). إذا لم تذكر مانجا أو مانهوا اتركها [].`;

    const historyMessages = recentMessages.slice(0, -1).map((m: any) => ({
      role: m.sender === 'user' ? 'user' : 'model',
      parts: [{ text: m.text }],
    }));

    const chatSchema = {
      type: Type.OBJECT,
      properties: {
        reply: {
          type: Type.STRING,
          description: 'Full natural conversational reply as an Otaku friend in Arabic',
        },
        suggestedAnimes: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: 'Up to 4 exact English/Romaji titles of anime specifically recommended or discussed so interactive cards can be attached',
        },
        suggestedMangas: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: 'Up to 4 exact English/Romaji titles of manga, manhwa, or manhua specifically recommended or discussed',
        },
      },
      required: ['reply', 'suggestedAnimes', 'suggestedMangas'],
    };

    const candidates: Array<{ model: string; thinkingLevel: ThinkingLevel; timeoutMs: number }> = [
      { model: 'gemini-3.1-flash-lite', thinkingLevel: ThinkingLevel.MINIMAL, timeoutMs: 11_000 },
      { model: 'gemini-4-hydrogen', thinkingLevel: ThinkingLevel.LOW, timeoutMs: 10_000 },
    ];

    let parsedPayload: { reply: string; suggestedAnimes: string[]; suggestedMangas: string[] } | null = null;
    let usedModel = 'gemini-3.1-flash-lite';
    let lastErr: any = null;

    for (const candidate of candidates) {
      try {
        const chat = ai.chats.create({
          model: candidate.model,
          history: historyMessages,
          config: {
            systemInstruction,
            thinkingConfig: { thinkingLevel: candidate.thinkingLevel },
            responseMimeType: 'application/json',
            responseSchema: chatSchema,
            abortSignal: AbortSignal.timeout(candidate.timeoutMs),
          },
        });

        const response = await chat.sendMessage({ message: lastUserMsg });
        const raw = (response?.text ?? '').trim();
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed.reply === 'string' && parsed.reply.trim()) {
              parsedPayload = {
                reply: parsed.reply.trim(),
                suggestedAnimes: Array.isArray(parsed.suggestedAnimes)
                  ? parsed.suggestedAnimes.map((x: any) => String(x || '').trim()).filter(Boolean)
                  : [],
                suggestedMangas: Array.isArray(parsed.suggestedMangas)
                  ? parsed.suggestedMangas.map((x: any) => String(x || '').trim()).filter(Boolean)
                  : [],
              };
              usedModel = candidate.model;
              break;
            }
          } catch {
            // If model returned plain text despite json mime, preserve it cleanly
            parsedPayload = { reply: raw, suggestedAnimes: [], suggestedMangas: [] };
            usedModel = candidate.model;
            break;
          }
        }
      } catch (err: any) {
        lastErr = err;
        const status = Number(err?.status || err?.code || 0);
        const msg = String(err?.message || err || '');
        console.warn(`[Otaku AI Friend] ${candidate.model} error (${status}):`, msg);
        if (
          status === 400 ||
          status === 401 ||
          status === 403 ||
          msg.includes('API_KEY_INVALID') ||
          msg.includes('PERMISSION_DENIED')
        ) {
          throw err;
        }
      }
    }

    if (!parsedPayload) {
      throw lastErr || new Error('Empty response from Gemini models');
    }

    const animeCards = await resolveSuggestedAnimeCards(
      parsedPayload.suggestedAnimes,
      parsedPayload.suggestedMangas,
    );

    return res.json({
      success: true,
      engine: usedModel,
      text: parsedPayload.reply,
      animes: animeCards,
    });
  } catch (error: any) {
    const status = Number(error?.status || error?.code || 502);
    const errText = String(error?.message || error || '');
    console.error('[Gemini Chat Error]:', status, errText);

    if (
      status === 400 ||
      status === 401 ||
      status === 403 ||
      errText.includes('API_KEY_INVALID') ||
      errText.includes('PERMISSION_DENIED')
    ) {
      return res.status(401).json({
        success: false,
        aiInvalidKey: true,
        message: 'مفتاح Gemini API غير صالح أو مرفوض. يرجى مراجعة المفتاح في إعدادات البيئة والأسرار.',
      });
    }

    if (status === 429 || errText.includes('RESOURCE_EXHAUSTED')) {
      return res.status(429).json({
        success: false,
        rateLimited: true,
        retryAfterSec: 8,
        message: 'تم الوصول للحد المؤقت لطلبات الذكاء الاصطناعي. انتظر بضع ثوانٍ ثم أعد المحاولة.',
      });
    }

    return res.status(502).json({
      success: false,
      message: 'تعذر الحصول على رد من خدمة Gemini حالياً. يرجى إعادة المحاولة.',
    });
  }
}));

router.get('/games/generate', handleAsync(async (req: Request, res: Response) => {
  const { type } = req.query; // 'quotes', 'lyrics', 'imposter', 'emoji', etc.
  if (!type) return res.status(400).json({ success: false, message: 'Missing type.' });

  const gameType = String(type);
  const now = Date.now();

  // Check multi-user shared pool cache first so 1,000 concurrent players don't trigger 1,000 Gemini calls
  const cachedPool = gamesPoolCache.get(gameType);
  if (cachedPool && cachedPool.expiresAt > now && cachedPool.questions.length >= 5) {
    const shuffled = [...cachedPool.questions].sort(() => Math.random() - 0.5).slice(0, 5);
    return res.json({ success: true, cached: true, data: shuffled });
  }

  const ai = getAi();
  if (!ai) {
    const fallbackQuestions = FALLBACK_GAMES[gameType] || FALLBACK_GAMES.quotes;
    return res.json({ success: true, data: fallbackQuestions });
  }

  try {
    let schemaProperties: Record<string, any> = {};
    let prompt = "";

    const randomSeed = Math.floor(Math.random() * 10000);
    switch(gameType) {
      case 'quotes':
        prompt = `قم بتوليد 5 أسئلة 'من القائل' لاقتباسات مشهورة من أنميات متنوعة. اجعلها متوسطة إلى صعبة. أرقام عشوائية لإجبار التنويع: ${randomSeed}`;
        schemaProperties = {
          questions: {
             type: Type.ARRAY,
             items: {
               type: Type.OBJECT,
               properties: {
                 text: { type: Type.STRING, description: "The quote in Arabic" },
                 options: { type: Type.ARRAY, items: { type: Type.STRING }, description: "4 options for characters" },
                 correct: { type: Type.INTEGER, description: "Index of the correct option (0-3)" },
                 anime: { type: Type.STRING, description: "The anime name" }
               },
               required: ["text", "options", "correct", "anime"]
             }
          }
        };
        break;
      case 'imposter':
        prompt = `قم بتوليد 5 أسئلة لعبة الجاسوس. حيث تعطي 3 شخصيات من نفس الأنمي وشخصية رابعة من أنمي مختلف. على اللاعب إيجاد الشخصية الغريبة. أرقام عشوائية لإجبار التنويع: ${randomSeed}`;
        schemaProperties = {
          questions: {
             type: Type.ARRAY,
             items: {
               type: Type.OBJECT,
               properties: {
                 anime: { type: Type.STRING, description: "The anime the other 3 belong to" },
                 options: { type: Type.ARRAY, items: { type: Type.STRING }, description: "4 character names" },
                 correct: { type: Type.INTEGER, description: "Index of the imposter character (0-3)" }
               },
               required: ["anime", "options", "correct"]
             }
          }
        };
        break;
      case 'emoji':
        prompt = `قم بتوليد 5 أسئلة عن أنمي ممثل باستخدام الإيموجي فقط. أرقام عشوائية لإجبار التنويع: ${randomSeed}`;
        schemaProperties = {
          questions: {
             type: Type.ARRAY,
             items: {
               type: Type.OBJECT,
               properties: {
                 emojis: { type: Type.STRING, description: "3-5 emojis" },
                 options: { type: Type.ARRAY, items: { type: Type.STRING }, description: "4 anime names" },
                 correct: { type: Type.INTEGER, description: "Index of correct anime (0-3)" }
               },
               required: ["emojis", "options", "correct"]
             }
          }
        };
        break;
      case 'lyrics':
        prompt = `قم بتوليد 5 أسئلة 'تخمين الأنمي من شارة البداية أو النهاية (أغنية الأوبينينغ)'. أكتب سطراً مشهوراً من الأغنية (بالعربية المترجمة أو بالحروف الإنجليزية)، واجعلها خيارات متعددة. أرقام عشوائية لإجبار التنويع: ${randomSeed}`;
        schemaProperties = {
          questions: {
             type: Type.ARRAY,
             items: {
               type: Type.OBJECT,
               properties: {
                 text: { type: Type.STRING, description: "A famous line from the anime opening/ending song" },
                 options: { type: Type.ARRAY, items: { type: Type.STRING }, description: "4 anime names along with the song name" },
                 correct: { type: Type.INTEGER, description: "Index of correct anime (0-3)" }
               },
               required: ["text", "options", "correct"]
             }
          }
        };
        break;
      case 'trivia':
        prompt = `قم بتوليد 5 معلومات عامة (تريفيا) عن الأنميات المشهورة ليكون نصفها صحيح ونصفها خاطئ بوضوح لمن تابعه. أرقام عشوائية لإجبار التنويع: ${randomSeed}`;
        schemaProperties = {
          questions: {
             type: Type.ARRAY,
             items: {
               type: Type.OBJECT,
               properties: {
                 text: { type: Type.STRING, description: "A trivia fact about an anime" },
                 isTrue: { type: Type.BOOLEAN, description: "Whether the fact is true or false" },
                 explanation: { type: Type.STRING, description: "A short explanation of why it is true or false" }
               },
               required: ["text", "isTrue", "explanation"]
             }
          }
        };
        break;
      case 'math':
        prompt = `قم بتوليد 5 أسئلة 'رياضيات الأنمي'. مثال: (عدد ذيول الكيوبي + عدد أفراد طاقم قبعة القش). اجعلها ذكية ومتنوعة. أرقام عشوائية: ${randomSeed}`;
        schemaProperties = {
          questions: {
             type: Type.ARRAY,
             items: {
               type: Type.OBJECT,
               properties: {
                 text: { type: Type.STRING, description: "The math equation using anime elements (in Arabic)" },
                 answer: { type: Type.INTEGER, description: "The correct numerical answer" },
                 options: { type: Type.ARRAY, items: { type: Type.INTEGER }, description: "4 integer options" },
                 correct: { type: Type.INTEGER, description: "Index of the correct option (0-3)" }
               },
               required: ["text", "answer", "options", "correct"]
             }
          }
        };
        break;
      case 'timeline':
        prompt = `قم بتوليد 5 أسئلة 'أي الفعاليات حدثت أولاً في عالم الأنمي؟'. اذكر حدثين من نفس الأنمي أو أنميات مختلفة واطلب تحديد من حدث قبل الآخر حسب القصة المعترف بها. أرقام عشوائية: ${randomSeed}`;
        schemaProperties = {
          questions: {
             type: Type.ARRAY,
             items: {
               type: Type.OBJECT,
               properties: {
                 e1: { type: Type.STRING, description: "First event description" },
                 e2: { type: Type.STRING, description: "Second event description" },
                 first: { type: Type.INTEGER, description: "Which event happened first chronologically in the anime world? must be 1 or 2" }
               },
               required: ["e1", "e2", "first"]
             }
          }
        };
        break;
      default:
        return res.status(400).json({ success: false, message: 'Unknown type.' });
    }

    let response;
    const candidates: Array<{ model: string; thinkingLevel: ThinkingLevel }> = [
      { model: 'gemini-3.1-flash-lite', thinkingLevel: ThinkingLevel.MINIMAL },
      { model: 'gemini-4-hydrogen', thinkingLevel: ThinkingLevel.LOW },
    ];
    let success = false;
    for (const candidate of candidates) {
      try {
        response = await ai.models.generateContent({
          model: candidate.model,
          contents: prompt,
          config: {
            thinkingConfig: { thinkingLevel: candidate.thinkingLevel },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: schemaProperties,
              required: ["questions"]
            }
          }
        });
        if (response?.text) {
          success = true;
          break;
        }
      } catch (err: any) {
        console.warn(`[Gemini Games] Generation failed with ${candidate.model}: ${err.message || err}. Trying next fallback...`);
      }
    }

    if (!success) {
      throw new Error("All active Gemini models experienced high demand.");
    }

    const parsed = JSON.parse(response?.text || '{}');
    const generatedQuestions = parsed.questions || [];
    const fallbackList = FALLBACK_GAMES[gameType] || FALLBACK_GAMES.quotes;
    const combinedPool = [...generatedQuestions, ...fallbackList];

    gamesPoolCache.set(gameType, {
      questions: combinedPool,
      expiresAt: Date.now() + GAMES_CACHE_TTL_MS,
      refreshing: false,
    });

    res.json({ success: true, data: generatedQuestions.length > 0 ? generatedQuestions : fallbackList });

  } catch (error: any) {
    console.warn(`[Gemini Games fallback] Serving high-quality offline fallback questions.`);
    const fallbackQuestions = FALLBACK_GAMES[gameType] || FALLBACK_GAMES.quotes;
    res.json({ success: true, data: fallbackQuestions });
  }
}));

router.get('/anti-cheat', handleAsync(async (req: Request, res: Response) => {
  const { title, englishTitle, season, episodesCount, synopsis, characters } = req.query;
  if (!title) return res.status(400).json({ success: false, message: 'Missing anime title.' });

  const rawTitle = String(title).trim();
  const rawEngTitle = String(englishTitle || '').trim();
  const seasonNum = Math.max(1, parseInt(String(season || '1'), 10) || 1);
  const epsCount = parseInt(String(episodesCount || '12'), 10) || 12;
  const cleanTitle = `${rawTitle.toLowerCase()} ${rawEngTitle.toLowerCase()}`.trim();
  const cacheKey = `${cleanTitle}_s${seasonNum}`;

  // Check multi-user Anti-Cheat cache first (stores an array of questions so retries get fresh questions)
  const cachedQuiz = antiCheatCache.get(cacheKey);
  if (cachedQuiz && cachedQuiz.expiresAt > Date.now() && Array.isArray(cachedQuiz.data) && cachedQuiz.data.length > 0) {
    const picked = cachedQuiz.data[Math.floor(Math.random() * cachedQuiz.data.length)];
    return res.json({ success: true, cached: true, data: picked });
  }

  let localPool: any[] | null = null;

  // 1. فحص فوري ومحلي لأسئلة مرتبطة بالموسم وأحداثه النهائية للأعمال الشهيرة
  if (cleanTitle.includes('attack') || cleanTitle.includes('titan') || cleanTitle.includes('shingeki') || cleanTitle.includes('هجوم العمالقة')) {
    if (seasonNum === 1) {
      localPool = [
        {
          question: 'في نهاية الموسم الأول من هجوم العمالقة، من تبيّن أنها العملاقة الأنثى التي قاتلت إيرين داخل سور سينا (مقاطعة ستوهيس)؟',
          options: ['آني ليونهارت (Annie Leonhart)', 'ميكاسا أكرمان', 'هيستوريا ريس', 'ساشا براوس'],
          correct: 0
        },
        {
          question: 'ماذا اكتشف فيلق الاستطلاع داخل سور سينا في المشهد الختامي من الموسم الأول بعد تبلور آني؟',
          options: ['وجود عملاق ضخم حي مدفون داخل الجدار نفسه', 'بوابة سرية تقود إلى القبو', 'مختبر لصناعة مصل العمالقة', 'سلاح مدفعي قديم'],
          correct: 0
        }
      ];
    } else if (seasonNum === 2) {
      localPool = [
        {
          question: 'في الموسم الثاني من هجوم العمالقة، من كشف عن هويته فوق الجدار بأنه العملاق المدرع والعملاق الضخم؟',
          options: ['راينر براون وبيرتولت هوفر', 'زيكي ييغر وبيك فينغر', 'إيروين سميث وليفاي', 'كوني سبرينغر وجان كيرشتاين'],
          correct: 0
        },
        {
          question: 'ما هي القدرة التي فعلها إيرين لأول مرة في الحلقة الأخيرة من الموسم الثاني عندما لمس العملاقة المبتسمة (دينا فريتز)؟',
          options: ['قدرة الإحداثي (التحكم بالعمالقة وتوجيههم)', 'التصلب الكامل للجسد', 'الطيران عبر عدة المناورة', 'استدعاء عملاق المطرقة'],
          correct: 0
        }
      ];
    } else if (seasonNum === 3) {
      localPool = [
        {
          question: 'في نهاية معركة استعادة شيغانشينا في الموسم الثالث، من الذي تم اختياره لحقنه بمصل العملاق ليرث العملاق الضخم؟',
          options: ['أرمين أرليرت (Armin Arlert)', 'إيروين سميث (Erwin Smith)', 'هانجي زوي', 'جان كيرشتاين'],
          correct: 0
        }
      ];
    } else {
      localPool = [
        {
          question: 'في الموسم الرابع (الأخير) من هجوم العمالقة، ما هو اسم الخطة الكارثية التي أطلقها إيرين ييغر بعد دخوله مسارات يمير؟',
          options: ['دك الأرض (The Rumbling)', 'خطة القتل الرحيم', 'عملية تحرير ليبيريو', 'مشروع السور الحديدي'],
          correct: 0
        }
      ];
    }
  } else if (cleanTitle.includes('demon slayer') || cleanTitle.includes('kimetsu') || cleanTitle.includes('قاتل الشياطين')) {
    if (seasonNum === 1) {
      localPool = [
        {
          question: 'في نهاية الموسم الأول من قاتل الشياطين (جبل ناتاغومو)، من هو القمر السفلي الخامس الذي قاتله تانجيرو وأيقظ ضده رقصة إله النار؟',
          options: ['روي (Rui) شيطان العناكب', 'إنمو (Enmu)', 'أكازا (Akaza)', 'غيوتارو (Gyutaro)'],
          correct: 0
        }
      ];
    } else if (seasonNum === 2) {
      localPool = [
        {
          question: 'في الموسم الثاني من قاتل الشياطين (حي الترفيه)، من هو الهاشيرا الذي قاد المهمة بجانب تانجيرو ضد القمر العلوي السادس (داكي وغيوتارو)؟',
          options: ['تينغين أوزوي (هاشيرا الصوت)', 'كيوجيرو رينغوكو (هاشيرا اللهب)', 'ميتسوري كانروجي (هاشيرا الحب)', 'مويتشيرو توكيتو (هاشيرا الضباب)'],
          correct: 0
        }
      ];
    } else if (seasonNum === 3) {
      localPool = [
        {
          question: 'ما هي المعجزة غير المسبوقة التي حدثت لنيزوكو في الحلقة الأخيرة من الموسم الثالث (قرية صانعي السيوف)؟',
          options: ['تمكنت من المشي تحت أشعة الشمس والتحدث دون أن تحترق', 'تحولت إلى هاشيرا رسمي في الفيلق', 'استعادت ذاكرتها البشرية بالكامل وعادت إنسانة', 'هزمت موزان بمفردها'],
          correct: 0
        }
      ];
    } else {
      localPool = [
        {
          question: 'بماذا انتهت الحلقة الأخيرة من موسم تدريب الهاشيرا في أنمي قاتل الشياطين؟',
          options: ['سقوط تانجيرو والهاشيرا جميعاً داخل قلعة اللانهاية الخاصة بموزان', 'انتصار الفيلق في غابة الضباب', 'اعتزال غيو توميوكا القتال', 'تتويج زينيتسو كهاشيرا للرعد'],
          correct: 0
        }
      ];
    }
  } else if (cleanTitle.includes('jujutsu') || cleanTitle.includes('جوجوتسو')) {
    if (seasonNum === 1) {
      localPool = [
        {
          question: 'في نهاية الموسم الأول من جوجوتسو كايسن، أي تقنية عالية المستوى نجح ميغومي فوشيغورو في تفعيلها لأول مرة لهزيمة اللعنة حاملة إصبع سوكونا؟',
          options: ['توسيع المجال: حديقة الظلال الخيالية (Chimera Shadow Garden)', 'استدعاء الجنرال ماهوراغا', 'وميض أسود رباعي', 'التقنية الملعونة العكسية'],
          correct: 0
        }
      ];
    } else {
      localPool = [
        {
          question: 'في الموسم الثاني من جوجوتسو كايسن (حادثة شيبويا)، ما هي الأداة الملعونة الخاصة التي استُخدمت لختم ساتورو غوجو؟',
          options: ['بوابة سجن العالم (Prison Realm)', 'رمح السماء المقلوب', 'سيف ترويض الأرواح', 'حبل التدفق الأسود'],
          correct: 0
        }
      ];
    }
  } else if (cleanTitle.includes('death note') || cleanTitle.includes('مذكرة الموت')) {
    localPool = [
      {
        question: 'في الحلقة الأخيرة من أنمي مذكرة الموت، من هو المحقق الذي نجح في كشف تلاعب لايت ياغامي بالمذكرة في المستودع الأصفر؟',
        options: ['نير (Near) بفضل تضحية ميلو وتهور ميكامي', 'إل (L Lawliet)', 'واتاري', 'ماتسودا بمفرده'],
        correct: 0
      },
      {
        question: 'من الذي كتب اسم "لايت ياغامي" في مذكرة الموت في المشهد الأخير لينهي حياته كما وعده في بداية القصة؟',
        options: ['الشينيغامي ريوك (Ryuk)', 'الشينيغامي ريم (Rem)', 'نير (Near)', 'تيرو ميكامي'],
        correct: 0
      }
    ];
  } else if (cleanTitle.includes('solo leveling') || cleanTitle.includes('سولو ليفلينج')) {
    localPool = [
      {
        question: 'في نهاية الموسم الأول من أنمي Solo Leveling، ما هي المهنة السرية واللقب الذي حصل عليه سونغ جين-وو بعد اجتياز مهمة تغيير المهنة وهزيمة إغريس؟',
        options: ['عاهل الظلال (Shadow Monarch)', 'ملك التنانين', 'سيد اللهب الأبيض', 'إمبراطور الجليد'],
        correct: 0
      }
    ];
  } else if (cleanTitle.includes('hunter') || cleanTitle.includes('هنتر')) {
    localPool = [
      {
        question: 'في نهاية آرك نمل الكيميرا في أنمي Hunter x Hunter، كيف هزم الرئيس نيتيرو ملك النمل ميرويم في النهاية؟',
        options: ['بتفجير قنبلة "وردة الرجل الفقير" السامة المزروعة في قلبه', 'بضربة البوديساتفا المئة القاضية', 'بختم النين الخاص به للأبد', 'بتدخل غون البالغ في اللحظة الأخيرة'],
        correct: 0
      }
    ];
  } else if (cleanTitle.includes('fullmetal') || cleanTitle.includes('الخيميائي المعدني')) {
    localPool = [
      {
        question: 'في نهاية أنمي الخيميائي المعدني (Brotherhood)، بماذا ضحى إدوارد إلريك أمام بوابة الحقيقة لاستعادة جسد شقيقه ألفونس بالكامل؟',
        options: ['ببوابتة الخيميائية وقدرته على استخدام الخيمياء للأبد', 'بذراعه وساقه مرة أخرى', 'بحجر الفلاسفة الأحمر', 'بذاكرته عن رحلته الطويلة'],
        correct: 0
      }
    ];
  } else if (cleanTitle.includes('code geass') || cleanTitle.includes('كود غياس')) {
    localPool = [
      {
        question: 'ما هو اسم الخطة النهائية في ختام أنمي Code Geass التي جمع فيها لولوش كراهية العالم كله نحوه ثم جعل سوزاكو يقتله في زي "زيرو"؟',
        options: ['مرثية زيرو (Zero Requiem)', 'التمرد الأسود', 'أمر راغناروك', 'مشروع السلام الإمبراطوري'],
        correct: 0
      }
    ];
  }

  if (localPool && localPool.length > 0) {
    antiCheatCache.set(cacheKey, {
      data: localPool,
      expiresAt: Date.now() + 60 * 60 * 1000,
    });
    const picked = localPool[Math.floor(Math.random() * localPool.length)];
    return res.json({ success: true, data: picked });
  }

  // Helper to build a tailored fallback quiz from synopsis & characters if AI is unavailable
  const buildMetadataFallback = () => {
    const seasonLabel = seasonNum > 1 ? ` (الموسم ${seasonNum})` : '';
    const charList = String(characters || '').split(',').map(s => s.trim()).filter(Boolean);
    if (charList.length >= 2) {
      const mainChar = charList[0];
      const secondChar = charList[1];
      return {
        question: `للتحقق من إكمالك لمشاهدة "${rawTitle}"${seasonLabel} حتى الحلقة ${epsCount}: أي من الشخصيات التالية كان لها دور محوري في أحداث هذا الموسم وحسم صراعاته؟`,
        options: [
          `${mainChar} و ${secondChar}`,
          'تاتسوماكي وكينغ من عالم البطولة',
          'غينتوكي ساكاتا وكاغورا',
          'إدوارد نيغيت وماركو العنقاء'
        ],
        correct: 0
      };
    }
    return {
      question: `للتحقق من مشاهدتك الكاملة لأنمي "${rawTitle}"${seasonLabel} (${epsCount} حلقة): كيف انتهت الذروة الدرامية لأحداث هذا الموسم؟`,
      options: [
        'بحسم المواجهة الرئيسية في الحلقات الأخيرة وكشف مصير الأبطال للمرحلة القادمة',
        'بتحول القصة إلى برنامج مسابقات رياضي مدرسي بدون أي صراع',
        'بإلغاء جميع الأحداث السابقة واكتشاف أن الموسم كله مجرد إعلان تجاري',
        'بعدم ظهور الشخصية الرئيسية طوال حلقات النصف الثاني من الموسم'
      ],
      correct: 0
    };
  };

  const ai = getAi();
  if (!ai) {
    return res.json({ success: true, data: buildMetadataFallback() });
  }

  try {
    const seasonText = seasonNum > 1 ? `الموسم ${seasonNum}` : 'الموسم الأول / الكامل';
    const contextParts: string[] = [
      `اسم الأنمي: "${rawTitle}"${rawEngTitle ? ` (${rawEngTitle})` : ''}`,
      `الموسم المطلوب التحقق منه: ${seasonText} (عدد الحلقات: ${epsCount})`
    ];
    if (characters) contextParts.push(`أبرز الشخصيات: ${characters}`);
    if (synopsis) contextParts.push(`نبذة عن القصة: ${synopsis}`);

    const prompt = `أنت نظام منع غش صارم في تطبيق أنمي. يريد المستخدم إضافة الأنمي التالي إلى قائمة "مكتمل":
${contextParts.join('\n')}

المطلوب:
قم بتوليد 3 أسئلة مختلفة باللغة العربية الفصحى، كل سؤال يركز تحديداً على أحداث ${seasonText} من هذا الأنمي (وخاصة النصف الثاني أو الحلقات الأخيرة/النهاية من هذا الموسم تحديداً) للتحقق من أن المستخدم قد شاهد ${seasonText} بالكامل فعلاً.
- تجنب الأسئلة السطحية أو البديهية التي تُعرف من البوستر أو الحلقة الأولى فقط.
- اجعل الخيارات الأربعة منطقية ومن نفس أجواء العمل بحيث لا يعرف الإجابة الصحيحة إلا من شاهد الموسم بالكامل.`;

    const candidates: Array<{ model: string; thinkingLevel: ThinkingLevel }> = [
      { model: 'gemini-3.1-flash-lite', thinkingLevel: ThinkingLevel.MINIMAL },
      { model: 'gemini-4-hydrogen', thinkingLevel: ThinkingLevel.LOW },
    ];
    let response;
    let success = false;

    for (const candidate of candidates) {
      try {
        response = await ai.models.generateContent({
          model: candidate.model,
          contents: prompt,
          config: {
            thinkingConfig: { thinkingLevel: candidate.thinkingLevel },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                questions: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      question: { type: Type.STRING, description: "Season-specific anti-cheat question in Arabic" },
                      options: { type: Type.ARRAY, items: { type: Type.STRING }, description: "4 plausible options in Arabic" },
                      correct: { type: Type.INTEGER, description: "Index of the correct option (0-3)" }
                    },
                    required: ["question", "options", "correct"]
                  }
                }
              },
              required: ["questions"]
            }
          }
        });
        if (response?.text) {
          success = true;
          break;
        }
      } catch (err: any) {
        console.warn(`[Gemini Anti-Cheat] Failed with ${candidate.model}: ${err.message || err}. Trying next fallback...`);
      }
    }

    if (!success) {
      throw new Error("All active Gemini models experienced high-demand.");
    }

    const parsed = JSON.parse(response?.text || '{}');
    const questionsList = Array.isArray(parsed.questions) && parsed.questions.length > 0
      ? parsed.questions
      : (parsed.question ? [parsed] : [buildMetadataFallback()]);

    antiCheatCache.set(cacheKey, {
      data: questionsList,
      expiresAt: Date.now() + 60 * 60 * 1000, // Cache quiz pool per anime + season for 1 hour
    });
    const picked = questionsList[Math.floor(Math.random() * questionsList.length)];
    res.json({ success: true, data: picked });
  } catch (error: any) {
    res.json({ success: true, data: buildMetadataFallback() });
  }
}));

router.get('/diagnostics/health', (req: Request, res: Response) => {
  const ai = getAi();
  res.json({
    success: true,
    data: {
      aiConfigured: Boolean(ai),
      model: 'gemini-3.1-flash-lite',
      runtime: process.env.VERCEL ? 'vercel-serverless' : 'node-express',
      nodeVersion: process.version,
      uptimeSeconds: Math.round(process.uptime()),
    },
  });
});

router.post('/analyze-diagnostics', handleAsync(async (req: Request, res: Response) => {
  const { environment, tests, telemetryErrors } = req.body || {};
  const startedAt = Date.now();

  if (!environment && !Array.isArray(tests) && !Array.isArray(telemetryErrors)) {
    return res.status(400).json({
      success: false,
      message: 'يرجى إرسال نتائج الاختبارات وسجل الأخطاء لتحليلها.',
    });
  }

  const ai = getAi();
  if (!ai) {
    return res.status(503).json({
      success: false,
      aiMissingKey: true,
      message: 'مفتاح GEMINI_API_KEY غير متوفر على الخادم الحالي.',
    });
  }

  const sanitizedTests = Array.isArray(tests)
    ? tests.slice(0, 20).map((t: any) => ({
        name: String(t.name || '').slice(0, 120),
        category: String(t.category || '').slice(0, 40),
        status: String(t.status || 'idle'),
        latencyMs: typeof t.latency === 'number' ? t.latency : null,
        details: String(t.details || '').slice(0, 500),
      }))
    : [];

  const sanitizedErrors = Array.isArray(telemetryErrors)
    ? telemetryErrors.slice(0, 25).map((e: any) => ({
        source: String(e.source || ''),
        severity: String(e.severity || ''),
        title: String(e.title || '').slice(0, 150),
        message: String(e.message || '').slice(0, 300),
        url: String(e.url || '').slice(0, 200),
        statusCode: e.statusCode ?? null,
        count: e.count || 1,
      }))
    : [];

  const prompt = `أنت مهندس برمجيات وتشخيص أعطال خبير (Full-Stack + Vercel + Capacitor + Firebase + Scraping).
حلل بيانات التشخيص التالية لتطبيق "أوتاكو MOD" واكتشف أين يكمن الشذوذ تحديداً ولماذا قد تفشل بعض الوظائف عند النشر على Vercel أو في المتصفح:

[بيئة التشغيل]:
${JSON.stringify(environment || {})}

[نتائج الاختبارات]:
${JSON.stringify(sanitizedTests)}

[الأخطاء المسجلة]:
${JSON.stringify(sanitizedErrors)}

المطلوب تحليل دقيق وصادق وموجز باللغة العربية بناءً على المعطيات الفعلية أعلاه فقط (لا تخترع أعطالاً غير موجودة في البيانات).`;

  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      overallStatus: {
        type: Type.STRING,
        description: 'One of: healthy, degraded, critical',
      },
      healthScore: {
        type: Type.INTEGER,
        description: 'Health score between 0 and 100',
      },
      summary: {
        type: Type.STRING,
        description: 'Executive summary in Arabic explaining the overall state and main findings',
      },
      vercelDiagnosis: {
        type: Type.STRING,
        description: 'Specific diagnosis regarding Vercel hosting compatibility and serverless/API behavior in Arabic',
      },
      priorityAction: {
        type: Type.STRING,
        description: 'The single highest-priority fix step to perform first in Arabic',
      },
      anomalies: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            severity: { type: Type.STRING, description: 'critical, warning, or info' },
            affectedArea: { type: Type.STRING },
            rootCause: { type: Type.STRING },
            fixSteps: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
          required: ['title', 'severity', 'affectedArea', 'rootCause', 'fixSteps'],
        },
      },
      recommendedActions: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
      },
    },
    required: [
      'overallStatus',
      'healthScore',
      'summary',
      'vercelDiagnosis',
      'priorityAction',
      'anomalies',
      'recommendedActions',
    ],
  };

  const candidates: Array<{ model: string; thinkingLevel: ThinkingLevel; timeoutMs: number }> = [
    { model: 'gemini-3.1-flash-lite', thinkingLevel: ThinkingLevel.MINIMAL, timeoutMs: 7500 },
    { model: 'gemini-4-hydrogen', thinkingLevel: ThinkingLevel.LOW, timeoutMs: 8500 },
  ];

  const attemptErrors: string[] = [];

  for (const candidate of candidates) {
    try {
      const response = await ai.models.generateContent({
        model: candidate.model,
        contents: prompt,
        config: {
          abortSignal: AbortSignal.timeout(candidate.timeoutMs),
          thinkingConfig: { thinkingLevel: candidate.thinkingLevel },
          systemInstruction:
            'أنت خبير تشخيص أعطال تطبيقات React/Express/Vercel/Firebase. التزم بالدقة والوضوح والإيجاز العملي باللغة العربية.',
          responseMimeType: 'application/json',
          responseSchema,
        },
      });

      const rawText = (response.text ?? '').trim();
      if (rawText) {
        const parsed = JSON.parse(rawText);
        return res.json({
          success: true,
          engine: candidate.model,
          durationMs: Date.now() - startedAt,
          data: parsed,
        });
      }
      attemptErrors.push(`${candidate.model}: empty response text`);
    } catch (err: any) {
      const errMsg = err?.cause?.message || err?.message || String(err);
      attemptErrors.push(`${candidate.model}: ${errMsg}`);
      console.warn(`[Diagnostics AI Analyze] ${candidate.model} failed (${Date.now() - startedAt}ms):`, errMsg);
    }
  }

  return res.status(502).json({
    success: false,
    durationMs: Date.now() - startedAt,
    message: `تعذر إتمام التحليل عبر Gemini (${attemptErrors.join(' | ')})`,
  });
}));

export default router;


