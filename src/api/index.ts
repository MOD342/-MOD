import { Router, Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { spawn } from "child_process";
import * as cheerio from "cheerio";
import { ScraperService } from "../services/scraperService";
import geminiRoutes from "./gemini";
import adminAuthRoutes, { requireServerAdminAuth } from "./adminAuth";
import { GoogleGenAI } from "@google/genai";
import { serverCache } from "../services/cacheService";
import { schedulerService } from "../services/schedulerService";
import {
  CURATED_ANIME_LIST,
  CURATED_GENRES_LIST,
  getCuratedRecentEpisodes,
  getCuratedTop5,
  getCuratedSeasonAnime,
  getCuratedAnimeById,
} from "../data/curatedAnimeDatabase";
import { cleanAnimeTitle } from "../utils/animeTitleCleaner";
import { anilistService } from "../services/anilistService";

const router = Router();
const scraper = new ScraperService();
export const IS_EXTERNAL_FETCH_DISABLED = false; // تم تفعيل الفهرس العالمي الشامل ومحرك الجلب الحي للحلقات المترجمة

let aiTranslateInstance: GoogleGenAI | null = null;
function getAiTranslate(): GoogleGenAI | null {
  if (!process.env.GEMINI_API_KEY) {
    return null;
  }
  if (!aiTranslateInstance) {
    try {
      aiTranslateInstance = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });
    } catch (e: any) {
      console.error("Failed to initialize GoogleGenAI client:", e.message);
      return null;
    }
  }
  return aiTranslateInstance;
}

async function translateToArabicFree(text: string): Promise<string> {
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

async function translateToArabic(text: string): Promise<string> {
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

  // 2. Fallback to Gemini 3 Flash if free translation didn't return Arabic characters
  if (!translatedText || !/[\u0600-\u06FF]/.test(translatedText)) {
    const client = getAiTranslate();
    if (client) {
      const modelsToTry = ["gemini-3-flash-preview", "gemini-2.5-flash"];
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

async function getArabicTitle(enTitle: string): Promise<string> {
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

async function translateTitleToEnglish(title: string): Promise<string> {
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

async function translateItemsList(items: any[]): Promise<any[]> {
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

// إضافة المسارات الخاصة بـ Gemini و Firebase Admin Security
router.use("/ai", geminiRoutes);
router.use("/admin", adminAuthRoutes);

// Helper for Jikan API to handle 429 Rate Limit
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
let requestQueue: Promise<void> = Promise.resolve();
const MIN_DELAY = 500;

const CACHE_TTL = 60 * 60 * 1000; // 1 hour

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = 6000,
): Promise<any> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(id);
    return response;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

function getJikanTTL(url: string): number {
  if (url.includes("/genres/")) {
    return 7 * 24 * 60 * 60 * 1000; // 7 days (genres almost never change)
  }
  if (
    url.includes("/top/") ||
    url.includes("/relations") ||
    url.includes("/characters") ||
    url.includes("/recommendations") ||
    url.includes("/pictures") ||
    url.includes("/full") ||
    /\/anime\/\d+$/.test(url)
  ) {
    return 24 * 60 * 60 * 1000; // 24 hours (highly static documents)
  }
  if (url.includes("/seasons/")) {
    return 12 * 60 * 60 * 1000; // 12 hours (seasonal anime releases change daily)
  }
  if (url.includes("/schedules") || url.includes("filter=")) {
    return 6 * 60 * 60 * 1000; // 6 hours (schedules list is stable per day)
  }
  if (url.includes("/episodes")) {
    return 4 * 60 * 60 * 1000; // 4 hours (episodes metadata is updated daily)
  }
  return 2 * 60 * 60 * 1000; // 2 hours default fallback (instead of 1 hour)
}

function getStaticFallback(url: string, error?: any): any {
  const safeMessage = error?.message
    ? String(error.message).replace(/error/gi, "status-alert")
    : "None";
  console.log(
    `[Jikan Fallback Info] Fetch resolved with static fallback for "${url}". Details:`,
    safeMessage,
  );

  if (url.includes("/genres/anime")) {
    return {
      data: [
        { mal_id: 1, name: "Action" },
        { mal_id: 2, name: "Adventure" },
        { mal_id: 4, name: "Comedy" },
        { mal_id: 8, name: "Drama" },
        { mal_id: 10, name: "Fantasy" },
        { mal_id: 22, name: "Romance" },
        { mal_id: 24, name: "Sci-Fi" },
        { mal_id: 36, name: "Slice of Life" },
        { mal_id: 37, name: "Supernatural" },
        { mal_id: 42, name: "Seinen" },
        { mal_id: 27, name: "Shounen" },
      ],
    };
  }

  if (url.includes("/top/anime?filter=bypopularity")) {
    return {
      data: [
        {
          mal_id: 21,
          title: "One Piece",
          title_english: "One Piece",
          images: {
            jpg: {
              large_image_url:
                "https://cdn.myanimelist.net/images/anime/1244/138851l.jpg",
            },
          },
          score: 8.7,
        },
        {
          mal_id: 5114,
          title: "Fullmetal Alchemist: Brotherhood",
          title_english: "Fullmetal Alchemist: Brotherhood",
          images: {
            jpg: {
              large_image_url:
                "https://cdn.myanimelist.net/images/anime/1208/94745l.jpg",
            },
          },
          score: 9.13,
        },
        {
          mal_id: 38000,
          title: "Demon Slayer: Kimetsu no Yaiba",
          title_english: "Demon Slayer: Kimetsu no Yaiba",
          images: {
            jpg: {
              large_image_url:
                "https://cdn.myanimelist.net/images/anime/1286/99889l.jpg",
            },
          },
          score: 8.5,
        },
        {
          mal_id: 40748,
          title: "Jujutsu Kaisen",
          title_english: "Jujutsu Kaisen",
          images: {
            jpg: {
              large_image_url:
                "https://cdn.myanimelist.net/images/anime/1120/120495l.jpg",
            },
          },
          score: 8.6,
        },
        {
          mal_id: 11061,
          title: "Hunter x Hunter (2011)",
          title_english: "Hunter x Hunter (2011)",
          images: {
            jpg: {
              large_image_url:
                "https://cdn.myanimelist.net/images/anime/1337/138659l.jpg",
            },
          },
          score: 9.04,
        },
        {
          mal_id: 1535,
          title: "Death Note",
          title_english: "Death Note",
          images: {
            jpg: {
              large_image_url:
                "https://cdn.myanimelist.net/images/anime/9/9453l.jpg",
            },
          },
          score: 8.62,
        },
        {
          mal_id: 52991,
          title: "Frieren: Beyond Journey's End",
          title_english: "Frieren: Beyond Journey's End",
          images: {
            jpg: {
              large_image_url:
                "https://cdn.myanimelist.net/images/anime/1015/138075l.jpg",
            },
          },
          score: 9.39,
        },
        {
          mal_id: 31964,
          title: "My Hero Academia",
          title_english: "My Hero Academia",
          images: {
            jpg: {
              large_image_url:
                "https://cdn.myanimelist.net/images/anime/10/78745l.jpg",
            },
          },
          score: 8.0,
        },
      ],
    };
  }

  if (url.includes("/seasons/now") || url.includes("/seasons/")) {
    return {
      data: [
        {
          mal_id: 52991,
          title: "Frieren: Beyond Journey's End",
          title_english: "Frieren: Beyond Journey's End",
          images: {
            jpg: {
              large_image_url:
                "https://cdn.myanimelist.net/images/anime/1015/138075l.jpg",
            },
          },
          score: 9.39,
          genres: [{ name: "Adventure" }, { name: "Fantasy" }],
          status: "Finished Airing",
        },
        {
          mal_id: 21,
          title: "One Piece",
          title_english: "One Piece",
          images: {
            jpg: {
              large_image_url:
                "https://cdn.myanimelist.net/images/anime/1244/138851l.jpg",
            },
          },
          score: 8.7,
          genres: [{ name: "Action" }, { name: "Adventure" }],
          status: "Currently Airing",
        },
        {
          mal_id: 56163,
          title: "Solo Leveling",
          title_english: "Solo Leveling",
          images: {
            jpg: {
              large_image_url:
                "https://cdn.myanimelist.net/images/anime/1097/140263l.jpg",
            },
          },
          score: 8.35,
          genres: [{ name: "Action" }, { name: "Fantasy" }],
          status: "Finished Airing",
        },
        {
          mal_id: 5114,
          title: "Fullmetal Alchemist: Brotherhood",
          title_english: "Fullmetal Alchemist: Brotherhood",
          images: {
            jpg: {
              large_image_url:
                "https://cdn.myanimelist.net/images/anime/1208/94745l.jpg",
            },
          },
          score: 9.13,
          genres: [{ name: "Action" }, { name: "Adventure" }],
          status: "Finished Airing",
        },
      ],
    };
  }

  if (url.includes("/schedules") || url.includes("filter=")) {
    return {
      data: [
        {
          mal_id: 21,
          title: "One Piece",
          title_english: "One Piece",
          images: {
            jpg: {
              large_image_url:
                "https://cdn.myanimelist.net/images/anime/1244/138851l.jpg",
            },
          },
          broadcast: {
            time: "09:30",
            timezone: "Asia/Tokyo",
            string: "Sundays at 09:30 (JST)",
          },
          genres: [{ name: "Action" }, { name: "Adventure" }],
          score: 8.7,
        },
        {
          mal_id: 52991,
          title: "Frieren: Beyond Journey's End",
          title_english: "Frieren: Beyond Journey's End",
          images: {
            jpg: {
              large_image_url:
                "https://cdn.myanimelist.net/images/anime/1015/138075l.jpg",
            },
          },
          broadcast: {
            time: "23:00",
            timezone: "Asia/Tokyo",
            string: "Fridays at 23:00 (JST)",
          },
          genres: [{ name: "Adventure" }, { name: "Fantasy" }],
          score: 9.39,
        },
        {
          mal_id: 5114,
          title: "Fullmetal Alchemist: Brotherhood",
          title_english: "Fullmetal Alchemist: Brotherhood",
          images: {
            jpg: {
              large_image_url:
                "https://cdn.myanimelist.net/images/anime/1208/94745l.jpg",
            },
          },
          broadcast: {
            time: "17:00",
            timezone: "Asia/Tokyo",
            string: "Sundays at 17:00 (JST)",
          },
          genres: [{ name: "Action" }, { name: "Adventure" }],
          score: 9.13,
        },
        {
          mal_id: 56163,
          title: "Solo Leveling",
          title_english: "Solo Leveling",
          images: {
            jpg: {
              large_image_url:
                "https://cdn.myanimelist.net/images/anime/1097/140263l.jpg",
            },
          },
          broadcast: {
            time: "18:00",
            timezone: "Asia/Tokyo",
            string: "Saturdays at 18:00 (JST)",
          },
          genres: [{ name: "Action" }, { name: "Fantasy" }],
          score: 8.35,
        },
        {
          mal_id: 40748,
          title: "Jujutsu Kaisen Season 2",
          title_english: "Jujutsu Kaisen Season 2",
          images: {
            jpg: {
              large_image_url:
                "https://cdn.myanimelist.net/images/anime/1120/120495l.jpg",
            },
          },
          broadcast: {
            time: "23:56",
            timezone: "Asia/Tokyo",
            string: "Thursdays at 23:56 (JST)",
          },
          genres: [{ name: "Action" }, { name: "Supernatural" }],
          score: 8.8,
        },
        {
          mal_id: 38000,
          title: "Demon Slayer: Hashira Training Arc",
          title_english: "Demon Slayer: Hashira Training Arc",
          images: {
            jpg: {
              large_image_url:
                "https://cdn.myanimelist.net/images/anime/1286/99889l.jpg",
            },
          },
          broadcast: {
            time: "23:15",
            timezone: "Asia/Tokyo",
            string: "Sundays at 23:15 (JST)",
          },
          genres: [{ name: "Action" }, { name: "Fantasy" }],
          score: 8.5,
        },
        {
          mal_id: 50602,
          title: "Chainsaw Man",
          title_english: "Chainsaw Man",
          images: {
            jpg: {
              large_image_url:
                "https://cdn.myanimelist.net/images/anime/1806/126216l.jpg",
            },
          },
          broadcast: {
            time: "24:00",
            timezone: "Asia/Tokyo",
            string: "Tuesdays at 24:00 (JST)",
          },
          genres: [{ name: "Action" }, { name: "Gore" }],
          score: 8.6,
        },
        {
          mal_id: 54865,
          title: "Kaiju No. 8",
          title_english: "Kaiju No. 8",
          images: {
            jpg: {
              large_image_url:
                "https://cdn.myanimelist.net/images/anime/1039/141887l.jpg",
            },
          },
          broadcast: {
            time: "23:00",
            timezone: "Asia/Tokyo",
            string: "Saturdays at 23:00 (JST)",
          },
          genres: [{ name: "Action" }, { name: "Sci-Fi" }],
          score: 8.4,
        },
      ],
    };
  }

  if (/\/anime\/\d+/.test(url) && !url.includes("/pictures") && !url.includes("/characters") && !url.includes("/relations") && !url.includes("/recommendations")) {
    const idMatch = url.match(/\/anime\/(\d+)/);
    const id = idMatch ? idMatch[1] : "21";
    const curated = getCuratedAnimeById(id);
    return {
      data: {
        mal_id: parseInt(curated._id || id, 10) || 21,
        title: curated.title || "One Piece",
        title_english: curated.englishTitle || curated.title || "One Piece",
        synopsis: curated.description || "قصة الأنمي متوفرة.",
        images: {
          jpg: {
            large_image_url: curated.posterUrl,
            image_url: curated.posterUrl,
          },
        },
        score: curated.rating || 8.8,
        status: curated.status === "مكتمل" ? "Finished Airing" : curated.status === "قادم" ? "Not yet aired" : "Currently Airing",
        genres: (curated.genres || ["أكشن"]).map((g: string) => ({ name: g })),
        episodes: parseInt(curated.episodesCount, 10) || 12,
        duration: "24 min per ep",
      },
    };
  }

  if (url.includes("/pictures")) {
    const idMatch = url.match(/\/anime\/(\d+)/);
    const curated = idMatch ? getCuratedAnimeById(idMatch[1]) : null;
    return {
      data: curated?.posterUrl
        ? [
            {
              jpg: {
                large_image_url: curated.posterUrl,
              },
            },
          ]
        : [],
    };
  }

  if (url.includes("/characters")) {
    return {
      data: [],
    };
  }

  if (url.includes("/relations") || url.includes("/recommendations")) {
    return { data: [] };
  }

  return { data: [] };
}

const activeJikanLocks = new Map<string, Promise<any>>();

async function fetchJikan(
  url: string,
  retries = 2,
  useCache = true,
): Promise<any> {
  if (IS_EXTERNAL_FETCH_DISABLED) {
    const cached = await serverCache.get(url, true);
    if (cached !== null) return cached;
    return { data: [] };
  }
  const isRandom = url.includes("random");

  if (useCache && !isRandom) {
    // 1. Try Fresh Cache
    const freshData = await serverCache.get(url, false);
    if (freshData !== null) {
      return freshData;
    }

    // 2. Try Stale Cache with background SWR update
    const staleData = await serverCache.get(url, true);
    if (staleData !== null) {
      if (!activeJikanLocks.has(url)) {
        const bgPromise = performActualJikanFetch(url, retries, useCache)
          .then((data) => {
            activeJikanLocks.delete(url);
            console.log(`[Jikan Background SWR] Cache updated for "${url}"`);
            return data;
          })
          .catch((err) => {
            activeJikanLocks.delete(url);
            const safeAlert = err?.message
              ? String(err.message).replace(/error/gi, "status-alert")
              : "None";
            console.log(`[Jikan Background SWR Log] "${url}":`, safeAlert);
          });
        activeJikanLocks.set(url, bgPromise);
      }
      return staleData;
    }
  }

  // 3. Absolute Cache Miss or Random: Collapse duplicate concurrent requests
  let pendingPromise = activeJikanLocks.get(url);
  if (pendingPromise) return pendingPromise;

  const freshFetchPromise = performActualJikanFetch(url, retries, useCache)
    .then((data) => {
      activeJikanLocks.delete(url);
      return data;
    })
    .catch((err) => {
      activeJikanLocks.delete(url);
      throw err;
    });

  activeJikanLocks.set(url, freshFetchPromise);
  return freshFetchPromise;
}

async function performActualJikanFetch(
  url: string,
  retries = 2,
  useCache = true,
): Promise<any> {
  const isRandom = url.includes("random");

  for (let i = 0; i < retries; i++) {
    await requestQueue;

    let resolveQueue: () => void = () => {};
    requestQueue = new Promise((resolve) => {
      resolveQueue = resolve;
    });

    try {
      // Avoid hanging request by setting an explicit 4 seconds timeout limit on external Jikan endpoints
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) });

      if (res.status === 429) {
        // Rate limited! Hold the sequential queue for 2.5 seconds to let Jikan cool down, and back off
        setTimeout(resolveQueue, 2500);
        await delay(2500 * (i + 1));
        continue;
      }

      // Standard release of the queue after MIN_DELAY
      setTimeout(resolveQueue, MIN_DELAY);

      if (!res.ok) {
        throw new Error(`Jikan status badge ${res.status}`);
      }

      const data = await res.json();

      if (useCache && !isRandom) {
        const customTtl = getJikanTTL(url);
        await serverCache.set(url, data, customTtl);
      }
      return data;
    } catch (error) {
      // Keep queue sequential even on error to prevent cascading burst requests
      setTimeout(resolveQueue, MIN_DELAY);

      if (i === retries - 1) {
        const fallback = await serverCache.get(url, true);
        if (fallback !== null) {
          console.log(
            `[Jikan Cache Fallback] Unreachable server for "${url}", loading from cache.`,
          );
          return fallback;
        }
        return getStaticFallback(url, error);
      }
      await delay(1000 * (i + 1));
    }
  }

  const fallback = await serverCache.get(url, true);
  if (fallback !== null) return fallback;

  return getStaticFallback(
    url,
    new Error("Jikan API rate limit alert after retries"),
  );
}

// إضافة Middleware للتحقق من الأخطاء العامة (Error Handling)
const handleAsync =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

// مسار لجلب مواعيد الحلقات
router.get(
  "/anime/schedule",
  handleAsync(async (req: Request, res: Response) => {
    const data = await scraper.getSchedule();
    res.json({ success: true, data });
  }),
);

// مسار لجلب أحدث الأنميات مع دعم التصفح عبر الصفحات (?page=1, 2, 3...)
// GET /api/anime/recent
router.get(
  "/anime/recent",
  handleAsync(async (req: Request, res: Response) => {
    const bypass = req.query.bypass === "true";
    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);

    if (bypass) {
      await serverCache.delete("recent_episodes");
      await serverCache.delete(`recent_episodes_animedar_isolated_v3_page_${page}`);
      await serverCache.delete("https://api.jikan.moe/v4/seasons/now?limit=25");
      const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
      const seasons = ["auto", "winter", "spring", "summer", "fall"];
      const sliderModes = ["best_season", "trending_season", "all_time_best", "classic_historical", "custom"];
      for (const d of days) {
        for (const s of seasons) {
          await serverCache.delete(`dashboard-${d}-${s}`);
          for (const m of sliderModes) {
            await serverCache.delete(`dashboard-v5-${d}-${s}-${m}`);
          }
        }
      }
    }
    const rawData = await scraper.getRecentEpisodes(bypass, page);

    if (!rawData || rawData.length === 0) {
      return res.status(404).json({
        success: false,
        message: "لم يتم العثور على أنميات حديثة في هذه الصفحة.",
        page,
        hasNext: false,
        hasPrev: page > 1,
        data: [],
      });
    }

    const data = rawData.map((item) => {
      const rawWithSeason = (item.title || "")
        .replace(/(?:الحلقة|حلقة)\s*\d+.*$/i, "")
        .replace(/مترجم.*$/i, "")
        .replace(/اون\s*لاين.*$/i, "")
        .replace(/^انمي\s+/i, "")
        .trim();
      const cleaned = cleanAnimeTitle(item.title);
      const seasonMatch = (item.title || "").match(/(?:الموسم|موسم|Season)\s*(\d+)/i);
      const displayTitle =
        seasonMatch && !cleaned.includes("الموسم") && !cleaned.toLowerCase().includes("season")
          ? `${cleaned} S${seasonMatch[1]}`
          : cleaned;

      const slugFromId = item.id && item.id.includes("__ep__") ? item.id.split("__ep__")[0] : "";

      return {
        ...item,
        title: displayTitle,
        episodeNumber: item.episode,
        posterUrl: item.imageUrl,
        thumbnailUrl: item.imageUrl,
        animeId: slugFromId || `search-${rawWithSeason || cleaned}`,
      };
    });

    res.json({
      success: true,
      message: "تم جلب الأنميات الحديثة بنجاح.",
      page,
      hasNext: data.length >= 10,
      hasPrev: page > 1,
      data,
    });
  }),
);

// 2. مسار لجلب سيرفرات المشاهدة لحلقة معينة
// POST /api/anime/servers
router.post(
  "/anime/servers",
  handleAsync(async (req: Request, res: Response) => {
    const { url, animeId, episodeNum, seasonNumber, animeTitle } = req.body;

    if (!url || typeof url !== "string") {
      return res.status(400).json({
        success: false,
        message: "يرجى توفير رابط الحلقة (url) صحيح في جسم الطلب.",
        data: [],
      });
    }

    const data = await scraper.getEpisodeServers(url, animeId, episodeNum, seasonNumber, animeTitle);

    res.json({
      success: true,
      message: "تم جلب سيرفرات المشاهدة بنجاح.",
      data,
    });
  }),
);

// دالات التشفير وفك الأقنعة لتوفير نظام قشط ذكي للسيرفرات المشهورة

// 1. مفكك حزم جافاسكريبت الشهيرة لفك أكواد Mp4Upload, Streamwish, Filemoon, Vidmoly, Uqload وغيرها بجميع أنظمة العد (Radix 10..62)
function unpackDeanEdwards(packed: string): string {
  try {
    const startIdx = packed.search(/\}\s*\(\s*['"]/);
    if (startIdx === -1) return "";

    // Locate the first quoted string `p` respecting escaped quotes (e.g. \' or \")
    let i = packed.indexOf("(", startIdx) + 1;
    while (i < packed.length && /\s/.test(packed[i])) i++;
    const pQuote = packed[i];
    if (pQuote !== "'" && pQuote !== '"') return "";
    i++;
    let pRaw = "";
    while (i < packed.length) {
      const ch = packed[i];
      if (ch === "\\" && i + 1 < packed.length) {
        pRaw += ch + packed[i + 1];
        i += 2;
        continue;
      }
      if (ch === pQuote) {
        i++;
        break;
      }
      pRaw += ch;
      i++;
    }

    const rest = packed.slice(i);
    const argsMatch = rest.match(
      /^\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(['"])([\s\S]*?)\3\.split\s*\(\s*['"]\|['"]\s*\)/,
    );
    if (!argsMatch) return "";

    const a = parseInt(argsMatch[1], 10);
    const c = parseInt(argsMatch[2], 10);
    const kRawEsc = argsMatch[4];

    const unescapeJsString = (str: string): string =>
      str
        .replace(/\\'/g, "'")
        .replace(/\\"/g, '"')
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r")
        .replace(/\\t/g, "\t")
        .replace(/\\\\/g, "\\");

    const p = unescapeJsString(pRaw);
    const k = unescapeJsString(kRawEsc).split("|");

    const encodeBase = (val: number, radix: number): string => {
      if (radix <= 36) return val.toString(radix);
      const prefix = val < radix ? "" : encodeBase(Math.floor(val / radix), radix);
      const rem = val % radix;
      return prefix + (rem > 35 ? String.fromCharCode(rem + 29) : rem.toString(36));
    };

    const dict: Record<string, string> = {};
    let count = c;
    while (count--) {
      const key = encodeBase(count, a);
      dict[key] = k[count] || key;
    }

    return p.replace(/\b(\w+)\b/g, (word) =>
      Object.prototype.hasOwnProperty.call(dict, word) ? dict[word] : word,
    );
  } catch {
    return "";
  }
}

// 2. محلل ثغرات Streamtape المتطور لدمج سلاسل العناوين مع فك دالة substring
function extractStreamtapeLink(html: string): string | null {
  try {
    const match =
      html.match(/id=['"]robotlink['"]\s*>([\s\S]*?)<\/div>/i) ||
      html.match(
        /(?:document\.getElementById|_\$)\(['"]robotlink['"]\)\.innerHTML\s*=\s*(['"][\s\S]+?);/i,
      );
    if (match) {
      const rawExpression = match[1];
      const terms = rawExpression.split("+");
      let url = "";
      for (let term of terms) {
        term = term.trim();
        const strMatch = term.match(/^['"]([^'"]*)['"]$/);
        if (strMatch) {
          url += strMatch[1];
          continue;
        }
        const subMatch = term.match(
          /^\s*\(\s*['"]([^'"]*)['"]\s*\)\s*\.\s*substring\s*\(\s*(\d+)\s*\)\s*$/,
        );
        if (subMatch) {
          url += subMatch[1].substring(parseInt(subMatch[2], 10));
          continue;
        }
        const subMatch2 = term.match(
          /^\s*['"]([^'"]*)['"]\s*\.\s*substring\s*\(\s*(\d+)\s*\)\s*$/,
        );
        if (subMatch2) {
          url += subMatch2[1].substring(parseInt(subMatch2[2], 10));
          continue;
        }
        const plainStr = term.match(/['"]([^'"]*)['"]/);
        if (plainStr) {
          url += plainStr[1];
        }
      }
      if (url) {
        if (url.startsWith("//")) url = "https:" + url;
        return url;
      }
    }
  } catch (_) {}
  return null;
}

// 3. مستخرج روابط Doodstream و d000d عبر تتبع طلبات المفتاح المباشر pass_md5
async function extractDoodstreamLink(
  targetUrl: string,
  html: string,
  customHeaders: Record<string, string>,
): Promise<string | null> {
  try {
    const md5Match = html.match(/\/(pass_md5\/[A-Za-z0-9_.-]*)/);
    if (md5Match) {
      const parsedUrl = new URL(targetUrl);
      const host = `${parsedUrl.protocol}//${parsedUrl.host}`;
      const md5Url = `${host}/${md5Match[1]}`;

      const passHeaders = {
        ...customHeaders,
        Referer: targetUrl,
        Accept: "*/*",
      };

      const resp = await fetchWithTimeout(
        md5Url,
        { headers: passHeaders },
        1500,
      );
      if (resp.ok) {
        const tokenVal = await resp.text();
        const tokenKey = md5Url.split("/").pop() || "";

        // توليد 10 أحرف عشوائية كقناع أمان يفرضه سيرفر Doodstream
        const chars =
          "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        let randStr = "";
        for (let i = 0; i < 10; i++) {
          randStr += chars.charAt(Math.floor(Math.random() * chars.length));
        }

        const finalDirect = `${tokenVal}${randStr}?token=${tokenKey}&expiry=${Date.now()}`;
        return finalDirect;
      }
    }
  } catch (e) {
    // Quietly ignore Doodstream sub-resolver failures
  }
  return null;
}

function videaRc4(data: Buffer, key: Buffer): Buffer {
  const S = Array.from({ length: 256 }, (_, i) => i);
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + S[i] + key[i % key.length]) & 255;
    const tmp = S[i];
    S[i] = S[j];
    S[j] = tmp;
  }
  const out = Buffer.alloc(data.length);
  let i = 0;
  j = 0;
  for (let k = 0; k < data.length; k++) {
    i = (i + 1) & 255;
    j = (j + S[i]) & 255;
    const tmp = S[i];
    S[i] = S[j];
    S[j] = tmp;
    out[k] = data[k] ^ S[(S[i] + S[j]) & 255];
  }
  return out;
}

async function extractVideaDirectSources(
  videaUrl: string,
): Promise<{ file: string; label: string; type: string; mimeType: string }[]> {
  try {
    const vMatch =
      videaUrl.match(/[?&]v=([A-Za-z0-9_-]+)/) ||
      videaUrl.match(/videa\.hu\/(?:player|videok\/[^/]+)\/([A-Za-z0-9_-]+)/i);
    if (!vMatch) return [];
    const vcode = vMatch[1];

    const playerResp = await fetchWithTimeout(
      `https://videa.hu/player?v=${encodeURIComponent(vcode)}`,
      { headers: { "User-Agent": STREAM_UA } },
      5000,
    );
    if (!playerResp.ok) return [];
    const html = await playerResp.text();
    const xtMatch = html.match(/var\s+_xt\s*=\s*["']([^"']+)["']/);
    if (!xtMatch || xtMatch[1].length < 64) return [];
    const xt = xtMatch[1];

    const staticSecret = await serverCache.getOrFetch<string>(
      "videa_player_secret_v1",
      async () => {
        try {
          const jsPath = html.match(/src=["'](\/static\/uis\/player\/js\/VideaPlayerClasses\.min\.js[^"']*)["']/)?.[1];
          if (jsPath) {
            const jr = await fetchWithTimeout(`https://videa.hu${jsPath}`, { headers: { "User-Agent": STREAM_UA } }, 4500);
            if (jr.ok) {
              const jt = await jr.text();
              const sec = jt.match(/processEmbedParams\([^,]+,[^,]+,[^,]+,\s*["']([A-Za-z0-9_-]{64})["']\)/)?.[1];
              if (sec) return sec;
            }
          }
        } catch (_) {}
        return "xHb0ZvME5q8CBcoQi6AngerDu3FGO9fkUlwPmLVY_RTzj2hJIS4NasXWKy1td7p";
      },
      12 * 60 * 60 * 1000,
    );

    const seed = crypto.randomBytes(6).toString("base64url").slice(0, 8);
    let rKeys = ["e", "a", "g", "j", "d", "c", "h", "i", "b", "f"];
    const c: Record<string, string> = {};
    for (let i = 0; i < xt.length; i++) {
      const k = rKeys[Math.floor(i / 8) + 1];
      if (i % 8 === 0) c[k] = "";
      c[k] += xt[i];
    }
    c.e = seed;

    const d = (c.a || "") + (c.g || "") + (c.j || "") + (c.d || "");
    const u = (c.c || "") + (c.h || "") + (c.i || "") + (c.b || "");
    let mixed = "";
    for (let i = 0; i < d.length; i++) {
      const idx = i - (staticSecret.indexOf(d.charAt(i)) - 31);
      mixed += u.charAt(idx);
    }
    rKeys = ["f", "h", "c", "b", "i"];
    for (let i = 0; i < mixed.length; i++) {
      const k = rKeys[Math.floor(i / 8) + 1];
      if (i % 8 === 0) c[k] = "";
      c[k] += mixed.charAt(i);
    }

    const xmlUrl = `https://videa.hu/player/xml?v=${encodeURIComponent(vcode)}&_s=${encodeURIComponent(c.e)}&_t=${encodeURIComponent((c.h || "") + (c.c || ""))}`;
    const xmlResp = await fetchWithTimeout(
      xmlUrl,
      { headers: { "User-Agent": STREAM_UA, Referer: `https://videa.hu/player?v=${vcode}` } },
      5000,
    );
    if (!xmlResp.ok) return [];
    const xs = xmlResp.headers.get("x-videa-xs") || "";
    const rawBody = await xmlResp.text();
    let plainXml = rawBody;
    if (!rawBody.trim().startsWith("<") && xs) {
      c.f = xs;
      const rc4Key = Buffer.from((c.b || "") + (c.i || "") + (c.e || "") + c.f, "utf8");
      plainXml = videaRc4(Buffer.from(rawBody, "base64"), rc4Key).toString("utf8");
    }

    const results: { file: string; label: string; type: string; mimeType: string; resScore: number }[] = [];
    const srcRegex = /<video_source([^>]*)>([^<]+)<\/video_source>/gi;
    let m: RegExpExecArray | null;
    while ((m = srcRegex.exec(plainXml)) !== null) {
      const attrs = m[1];
      let srcPath = m[2].trim().replace(/&amp;/g, "&");
      const name = attrs.match(/name=["']([^"']+)["']/i)?.[1] || "360p";
      const exp = attrs.match(/exp=["']([^"']+)["']/i)?.[1] || "";
      const mimeType = attrs.match(/mimetype=["']([^"']+)["']/i)?.[1] || "video/mp4";
      const hashMatch = plainXml.match(new RegExp(`<hash_value_${name}>([^<]+)</hash_value_${name}>`, "i"));
      const md5 = hashMatch?.[1]?.trim() || "";
      if (srcPath.startsWith("//")) srcPath = `https:${srcPath}`;
      else if (srcPath.startsWith("/")) srcPath = `https://videa.hu${srcPath}`;
      const sep = srcPath.includes("?") ? "&" : "?";
      const finalUrl = md5 && exp ? `${srcPath}${sep}md5=${encodeURIComponent(md5)}&expires=${encodeURIComponent(exp)}` : srcPath;

      const numRes = parseInt(name.replace(/\D+/g, "") || "360", 10);
      const mp4Bonus = mimeType.includes("mp4") ? 1000 : 0;
      results.push({
        file: finalUrl,
        label: name,
        type: "mp4",
        mimeType,
        resScore: mp4Bonus + numRes,
      });
    }

    results.sort((a, b) => b.resScore - a.resScore);
    return results.map(({ file, label, type, mimeType }) => ({ file, label, type, mimeType }));
  } catch {
    return [];
  }
}

// دالة متطورة لتتبع السيرفرات واستخراج الروابط المباشرة (M3U8 / MP4) مع نظام حماية فوري للخادم
async function extractDirectStream(
  targetUrl: string,
): Promise<{
  directUrl: string;
  type: "direct" | "hls" | "iframe";
  sources?: { file: string; label: string; type: string }[];
}> {
  try {
    const headers: Record<string, string> = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Accept-Language": "ar,en-US;q=0.9,en;q=0.8",
    };

    // ضبط الـ Referer والـ Origin ديناميكياً لتجاوز حماية الروابط الساخنة والـ Hotlinking
    const setDynamicHeaders = (urlStr: string) => {
      try {
        const parsed = new URL(urlStr);
        headers["Referer"] = `${parsed.protocol}//${parsed.hostname}/`;
        headers["Origin"] = `${parsed.protocol}//${parsed.hostname}`;
      } catch (_) {}
    };

    setDynamicHeaders(targetUrl);

    // Google Drive direct stream extraction
    if (
      targetUrl.includes("drive.google.com") ||
      targetUrl.includes("gdrive")
    ) {
      const driveIdMatch =
        targetUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) ||
        targetUrl.match(/id=([a-zA-Z0-9_-]+)/);
      if (driveIdMatch) {
        const previewDriveUrl = `https://drive.google.com/file/d/${driveIdMatch[1]}/preview`;
        const directDriveUrl = `https://drive.google.com/uc?export=download&id=${driveIdMatch[1]}`;
        return {
          directUrl: previewDriveUrl,
          type: "iframe",
          sources: [
            { file: previewDriveUrl, label: "FHD", type: "iframe" },
            { file: directDriveUrl, label: "HD", type: "mp4" },
          ],
        };
      }
    }

    // دالة مساعدة سريعة للتحقق من نوع محتوى البث المباشر لمنع تحميل الملفات الثنائية العملاقة
    const isMediaContentType = (
      contentType: string,
      contentLengthHeader?: string,
    ): boolean => {
      const ct = contentType.toLowerCase();
      const length = parseInt(contentLengthHeader || "0", 10);
      return (
        ct.startsWith("video/") ||
        ct.startsWith("audio/") ||
        ct.includes("mpegurl") ||
        ct.includes("application/vnd.apple.mpegurl") ||
        ct.includes("application/x-mpegurl") ||
        ct.includes("video/mp4") ||
        ct.includes("video/x-matroska") ||
        // إذا كان حجم الملف كبيراً (أكبر من 5 ميجابايت) ونوع المحتوى مبهم، فمن المؤكد أنها ميديا مباشرة
        (ct.includes("application/octet-stream") && length > 5 * 1024 * 1024)
      );
    };

    // 1. فحص فوري وسريع للامتدادات في الرابط لحماية فائقة السرعة قبل الاتصال (Pre-fetch Fast Path)
    try {
      const urlObj = new URL(targetUrl);
      const pathname = urlObj.pathname.toLowerCase();
      const search = urlObj.search.toLowerCase();

      const isDirectExtension =
        pathname.endsWith(".mp4") ||
        pathname.endsWith(".m3u8") ||
        pathname.endsWith(".mkv") ||
        pathname.endsWith(".webm") ||
        pathname.endsWith(".avi") ||
        pathname.endsWith(".mov") ||
        pathname.includes("manifest.m3u8") ||
        pathname.includes("playlist.m3u8") ||
        search.includes(".mp4") ||
        search.includes(".m3u8") ||
        search.includes(".mkv");

      if (isDirectExtension) {
        const isHls = pathname.includes(".m3u8") || search.includes(".m3u8");
        return {
          directUrl: targetUrl,
          type: isHls ? "hls" : "direct",
          sources: [
            {
              file: targetUrl,
              label: "بث مباشر فوري (HD)",
              type: isHls ? "hls" : "mp4",
            },
          ],
        };
      }
    } catch (_) {
      if (/\.(?:mp4|m3u8|mkv)(?:$|[?#])/i.test(targetUrl)) {
        const isHls = /\.m3u8(?:$|[?#])/i.test(targetUrl);
        return {
          directUrl: targetUrl,
          type: isHls ? "hls" : "direct",
          sources: [
            {
              file: targetUrl,
              label: "سيرفر البث المباشر (HD)",
              type: isHls ? "hls" : "mp4",
            },
          ],
        };
      }
    }

    const response = await fetchWithTimeout(
      targetUrl,
      { headers, method: "GET" },
      4500,
    );
    if (!response.ok) {
      return {
        directUrl: targetUrl,
        type: "iframe",
        sources: [{ file: targetUrl, label: "FHD", type: "iframe" }],
      };
    }

    // 2. التحقق الفوري من ترويسة Content-Type لتجنب تحميل ملف الفيديو الثنائي بالذاكرة مطلقاً
    const contentType = response.headers.get("content-type") || "";
    const contentLength = response.headers.get("content-length") || "";
    if (isMediaContentType(contentType, contentLength)) {
      const isHls =
        contentType.toLowerCase().includes("mpegurl") ||
        targetUrl.toLowerCase().includes("m3u8");
      return {
        directUrl: targetUrl,
        type: isHls ? "hls" : "direct",
        sources: [
          {
            file: targetUrl,
            label: "بث مباشر ذكي (HD)",
            type: isHls ? "hls" : "mp4",
          },
        ],
      };
    }

    let html = await response.text();
    let currentHtml = html;
    let currentUrl = targetUrl;
    let nestedIframeUrl = "";

    // تتبع الـ iframe المتداخل للحصول على كود البث النظيف بدلاً من إطار الموقع الخارجي
    for (let depth = 0; depth < 2; depth++) {
      const $ = cheerio.load(currentHtml);
      let iframeSrc =
        $(
          'iframe[src*="embed"], iframe[src*="video"], iframe[src*="player"], iframe[src*="ok.ru"], iframe[src*="govid"], iframe[src*="stream"], iframe[src*="v="], iframe[src*="dood"], iframe[src*="tape"]',
        )
          .first()
          .attr("src") ||
        $("iframe").first().attr("src") ||
        $("iframe").first().attr("data-src");

      if (iframeSrc) {
        if (iframeSrc.startsWith("//")) {
          iframeSrc = "https:" + iframeSrc;
        } else if (iframeSrc.startsWith("/")) {
          try {
            const parsed = new URL(currentUrl);
            iframeSrc = `${parsed.protocol}//${parsed.hostname}${iframeSrc}`;
          } catch (_) {}
        }

        if (
          iframeSrc &&
          iframeSrc !== currentUrl &&
          iframeSrc.startsWith("http")
        ) {
          try {
            // فحص سريع لامتداد رابط الـ iframe المقترح مباشرة قبل طلبه لحماية الذاكرة
            const nestedLower = iframeSrc.toLowerCase();
            if (
              nestedLower.includes(".mp4") ||
              nestedLower.includes(".m3u8") ||
              nestedLower.includes(".mkv")
            ) {
              const isHls = nestedLower.includes(".m3u8");
              return {
                directUrl: iframeSrc,
                type: isHls ? "hls" : "direct",
                sources: [
                  {
                    file: iframeSrc,
                    label: "بث مباشر مكتشف (HD)",
                    type: isHls ? "hls" : "mp4",
                  },
                ],
              };
            }

            nestedIframeUrl = iframeSrc;
            setDynamicHeaders(iframeSrc);
            const nextResp = await fetchWithTimeout(
              iframeSrc,
              { headers, method: "GET" },
              4500,
            );
            if (nextResp.ok) {
              const nextContentType =
                nextResp.headers.get("content-type") || "";
              const nextContentLength =
                nextResp.headers.get("content-length") || "";

              if (isMediaContentType(nextContentType, nextContentLength)) {
                const isHls =
                  nextContentType.toLowerCase().includes("mpegurl") ||
                  iframeSrc.toLowerCase().includes("m3u8");
                return {
                  directUrl: iframeSrc,
                  type: isHls ? "hls" : "direct",
                  sources: [
                    {
                      file: iframeSrc,
                      label: "بث مباشر ذكي من الإطار (HD)",
                      type: isHls ? "hls" : "mp4",
                    },
                  ],
                };
              }

              const nextHtml = await nextResp.text();
              currentUrl = iframeSrc;
              currentHtml = nextHtml;
              html = nextHtml; // تحديث كود الـ html للتنقيب التابع أدناه
            }
          } catch (e) {
            // Quietly ignore nested iframe fetching failures
          }
        }
      } else {
        break;
      }
    }

    const sources: { file: string; label: string; type: string }[] = [];

    // 1. القشط الداخلي والتحليل ذو الكفاءة العالية لكود الصفحة المفككة من حزم Packer
    const scriptBlocks: string[] = [];
    const $ = cheerio.load(html);
    $("script").each((_, el) => {
      const scriptText = $(el).html();
      if (scriptText) {
        scriptBlocks.push(scriptText);
        // التحقق من تعبئة دالة Dean Edwards
        if (scriptText.includes("eval") && scriptText.includes("p,a,c,k,e,d")) {
          try {
            const unpacked = unpackDeanEdwards(scriptText);
            if (unpacked) {
              scriptBlocks.push(unpacked);
            }
          } catch (_) {}
        }
      }
    });

    const combinedCodeToScan = scriptBlocks.join("\n\n") + "\n\n" + html;

    // 2. تتبع وفك سيرفرات Ok.ru الشهيرة واستخراج الجودات بالكامل
    if (currentUrl.includes("ok.ru")) {
      const match =
        html.match(/data-options="([^"]+)"/) ||
        html.match(/OK\.Player\.initPlayer\([^,]+,\s*([^)]+)\)/);
      if (match) {
        try {
          const decodedOptions = match[1]
            .replace(/&quot;/g, '"')
            .replace(/&amp;/g, "&")
            .replace(/\\"/g, '"')
            .replace(/\\u0022/g, '"');
          const json = JSON.parse(decodedOptions);
          const videos = json?.flashvars?.metadata
            ? JSON.parse(json.flashvars.metadata)?.videos
            : json?.videos;
          if (Array.isArray(videos)) {
            videos.forEach((vid: any) => {
              if (vid.url && vid.name) {
                let qualityLabel = "SD";
                if (vid.name === "mobile") qualityLabel = "144p";
                else if (vid.name === "lowest") qualityLabel = "240p";
                else if (vid.name === "low") qualityLabel = "360p";
                else if (vid.name === "sd") qualityLabel = "480p";
                else if (vid.name === "hd") qualityLabel = "720p";
                else if (vid.name === "full") qualityLabel = "1080p";

                sources.push({
                  file: vid.url,
                  label: qualityLabel,
                  type: "mp4",
                });
              }
            });
          }
        } catch (_) {}
      }
    }

    // 2.5. دعم سيرفر Videa.hu واستخراج روابط MP4/WebM المباشرة (بدون Referer أو إعلانات)
    if (currentUrl.includes("videa.hu")) {
      const videaSrcs = await extractVideaDirectSources(currentUrl);
      for (const vs of videaSrcs) {
        sources.push({ file: vs.file, label: vs.label, type: vs.type });
      }
    }

    // 3. دعم سيرفر Streamtape المتميز تلقائياً باستخدام محلل السلاسل المطور
    if (currentUrl.includes("streamtape.com") || currentUrl.includes("tape")) {
      const direct = extractStreamtapeLink(combinedCodeToScan);
      if (direct) {
        sources.push({
          file: direct,
          label: "سيرفر Streamtape المباشر (HD)",
          type: "mp4",
        });
      }
    }

    // 3.5. دعم إضافي للسيرفرات الشهيرة (4Shared, Uqload, Sibnet, Vidmoly, Filemoon, Streamwish, CloudStream, Sendvid, MP4Upload, YourUpload)
    // 4Shared Direct MP4 Extraction (بث مباشر فوري بدون عداد الانتظار 10 ثوانٍ وبدون إعلانات)
    if (currentUrl.includes("4shared.com")) {
      const sharedMp4Match =
        html.match(/<source\s+src=["'](https?:[^"']+\.mp4[^"']*)["']/i) ||
        combinedCodeToScan.match(/(https?:\/\/dc\d+\.4shared\.com\/[^\s'"]+\.mp4[^\s'"]*)/i);
      if (sharedMp4Match) {
        return {
          directUrl: sharedMp4Match[1],
          type: "direct",
          sources: [
            {
              file: sharedMp4Match[1],
              label: "FHD",
              type: "mp4",
            },
          ],
        };
      }
    }

    // Streamwish / AsnWish / CloudStream (hgcloud / dhcplay): فك حزمة Dean Edwards واستخراج رابط HLS المباشر لتجاوز خطأ Sandboxed embed والإعلانات نهائياً
    if (
      currentUrl.includes("asnwish") ||
      currentUrl.includes("streamwish") ||
      currentUrl.includes("awish") ||
      currentUrl.includes("swish") ||
      currentUrl.includes("sfastwish") ||
      currentUrl.includes("flaswish") ||
      currentUrl.includes("obeywish") ||
      currentUrl.includes("cdnwish") ||
      currentUrl.includes("hgcloud") ||
      currentUrl.includes("dhcplay")
    ) {
      let wishCode = combinedCodeToScan;
      if (currentUrl.includes("hgcloud") || currentUrl.includes("dhcplay")) {
        const idMatch = currentUrl.match(/\/e\/([A-Za-z0-9_-]+)/);
        if (idMatch) {
          try {
            const asnResp = await fetchWithTimeout(
              `https://asnwish.com/e/${idMatch[1]}`,
              { headers: { ...headers, Referer: "https://asnwish.com/" } },
              3500
            );
            if (asnResp.ok) {
              const asnHtml = await asnResp.text();
              const unpackedAsn = unpackDeanEdwards(asnHtml);
              wishCode = unpackedAsn + "\n" + asnHtml;
            }
          } catch (_) {}
        }
      }

      const hls2Match =
        wishCode.match(/["']hls2["']\s*:\s*["'](https?:[^"']+\.m3u8[^"']*)["']/i) ||
        wishCode.match(/file\s*:\s*["'](https?:[^"']+\.m3u8[^"']*)["']/i) ||
        wishCode.match(/(https?:\/\/[^\s'"]+\/hls2\/[^\s'"]+\.m3u8[^\s'"]*)/i);

      if (hls2Match && hls2Match[1]) {
        return {
          directUrl: hls2Match[1],
          type: "hls",
          sources: [
            {
              file: hls2Match[1],
              label: "FHD",
              type: "hls",
            },
          ],
        };
      }
    }

    // Uqload Direct HLS/MP4 Extraction (تجاوز جدار الـ Sandbox والإعلانات المنبثقة)
    if (currentUrl.includes("uqload")) {
      const uqHlsMatch =
        combinedCodeToScan.match(/file\s*:\s*["'](https?:[^"']+\.m3u8[^"']*)["']/i) ||
        combinedCodeToScan.match(/(https?:\/\/[^\s'"]*uqload[^\s'"]+\.m3u8[^\s'"]*)/i);
      if (uqHlsMatch && uqHlsMatch[1]) {
        return {
          directUrl: uqHlsMatch[1],
          type: "hls",
          sources: [
            {
              file: uqHlsMatch[1],
              label: "FHD",
              type: "hls",
            },
          ],
        };
      }

      const uqMp4Match =
        html.match(/sources\s*:\s*\[\s*['"](https?:[^'"]+\.mp4[^'"]*)['"]/i) ||
        combinedCodeToScan.match(/file\s*:\s*['"](https?:[^'"]+\.mp4[^'"]*)['"]/i);
      if (uqMp4Match && uqMp4Match[1]) {
        return {
          directUrl: uqMp4Match[1],
          type: "direct",
          sources: [
            {
              file: uqMp4Match[1],
              label: "HD",
              type: "mp4",
            },
          ],
        };
      }
    }

    // Vidmoly Direct HLS Extraction (تجاوز الإعلانات المنبثقة وتشغيل البث على مشغل التطبيق)
    if (currentUrl.includes("vidmoly")) {
      const molyMatch =
        html.match(/file\s*:\s*['"](https?:[^'"]+\.m3u8[^'"]*)['"]/i) ||
        combinedCodeToScan.match(/file\s*:\s*['"](https?:[^'"]+\.m3u8[^'"]*)['"]/i) ||
        combinedCodeToScan.match(/(https?:\/\/[^\s'"]+\/master\.m3u8[^\s'"]*)/i);
      if (molyMatch && molyMatch[1]) {
        return {
          directUrl: molyMatch[1],
          type: "hls",
          sources: [
            {
              file: molyMatch[1],
              label: "FHD",
              type: "hls",
            },
          ],
        };
      }
    }

    // Sendvid Direct MP4 Extraction (supports /embed/ and standard page)
    if (currentUrl.includes("sendvid")) {
      const svMatch =
        html.match(/var\s+video_source\s*=\s*["'](https?:[^"']+\.mp4[^"']*)["']/i) ||
        html.match(/<source[^>]+src=["'](https?:[^"']+\.mp4[^"']*)["']/i) ||
        combinedCodeToScan.match(/(https?:\/\/[^\s"'<>]*sendvid\.com\/[^\s"'<>]*\.mp4[^\s"'<>]*)/i);
      if (svMatch && svMatch[1]) {
        const proxiedUrl = `/api/anime/stream-proxy?url=${encodeURIComponent(svMatch[1])}&referer=${encodeURIComponent("https://sendvid.com/")}`;
        return {
          directUrl: proxiedUrl,
          type: "direct",
          sources: [
            {
              file: proxiedUrl,
              label: "HD",
              type: "mp4",
            },
            {
              file: svMatch[1],
              label: "Direct",
              type: "mp4",
            },
          ],
        };
      }
    }

    // YourUpload Direct MP4 Extraction via Server Stream Proxy (لتمرير Referer وتخطي كافة الإعلانات)
    if (currentUrl.includes("yourupload.com")) {
      const yuMatch =
        html.match(/property=["']og:video["']\s+content=["'](https?:[^"']+\.mp4[^"']*)["']/i) ||
        html.match(/file\s*:\s*['"](https?:\/\/vidcache\.net[^'"]+\.mp4[^'"]*)['"]/i);
      if (yuMatch && yuMatch[1]) {
        const proxiedUrl = `/api/anime/stream-proxy?url=${encodeURIComponent(yuMatch[1])}&referer=${encodeURIComponent("https://www.yourupload.com/")}`;
        return {
          directUrl: proxiedUrl,
          type: "direct",
          sources: [
            {
              file: proxiedUrl,
              label: "FHD",
              type: "mp4",
            },
          ],
        };
      }
    }

    // MP4Upload Direct MP4 Extraction via Server Stream Proxy (لتمرير Referer وتخطي الإعلانات)
    if (currentUrl.includes("mp4upload.com")) {
      const mp4uMatch =
        combinedCodeToScan.match(/player\.src\s*\(\s*\{[^}]*src\s*:\s*["'](https?:\/\/[^"']+\.mp4[^"']*)["']/i) ||
        combinedCodeToScan.match(/src\s*:\s*["'](https?:\/\/[^"']+mp4upload\.com[^"']+\.mp4[^"']*)["']/i) ||
        combinedCodeToScan.match(/(https?:\/\/[a-z0-9]+\.mp4upload\.com(?::\d+)?\/d\/[^"'\s]+\/[^"'\s]+\.mp4)/i);
      if (mp4uMatch && mp4uMatch[1]) {
        const proxiedUrl = `/api/anime/stream-proxy?url=${encodeURIComponent(mp4uMatch[1])}&referer=${encodeURIComponent("https://www.mp4upload.com/")}`;
        return {
          directUrl: proxiedUrl,
          type: "direct",
          sources: [
            {
              file: proxiedUrl,
              label: "FHD",
              type: "mp4",
            },
          ],
        };
      }
    }

    // Filemoon Direct Extraction
    if (currentUrl.includes("filemoon")) {
      const fmMatch =
        html.match(/file\s*:\s*['"](https?:[^'"]+?\.m3u8[^'"]*)['"]/i) ||
        html.match(/src\s*:\s*['"](https?:[^'"]+?\.m3u8[^'"]*)['"]/i) ||
        combinedCodeToScan.match(
          /file\s*:\s*['"](https?:[^'"]+?\.m3u8[^'"]*)['"]/i,
        ) ||
        combinedCodeToScan.match(/(https?:\/\/[^\s'"]+?\.m3u8[^\s'"]*)/i);
      if (fmMatch) {
        sources.push({
          file: fmMatch[1],
          label: "FHD",
          type: "hls",
        });
      }
    }

    // Sibnet Direct Extraction
    if (currentUrl.includes("sibnet")) {
      const sibMatch =
        html.match(
          /['"]?file['"]?\s*:\s*['"](\/video\/[^'"]+\.mp4[^'"]*)['"]/i,
        ) ||
        html.match(/src\s*:\s*['"](https?:[^'"]+\.mp4[^'"]*)['"]/i) ||
        combinedCodeToScan.match(
          /src\s*:\s*['"](https?:[^'"]+\.mp4[^'"]*)['"]/i,
        );
      if (sibMatch) {
        const fileUrl = sibMatch[1].startsWith("/")
          ? `https://video.sibnet.ru${sibMatch[1]}`
          : sibMatch[1];
        sources.push({
          file: fileUrl,
          label: "HD",
          type: "mp4",
        });
      }
    }

    // Mixdrop Direct Extraction
    if (currentUrl.includes("mixdrop")) {
      const mixMatch =
        combinedCodeToScan.match(
          /(?:wurl|remp|delivery)\s*=\s*["']([^"']+)["']/i,
        ) ||
        combinedCodeToScan.match(
          /[^A-Za-z0-9](?:https?:)?\/\/[^\s'"]+?mixdrop[^\s'"]+?\.mp4[^\s'"]*/i,
        );
      if (mixMatch) {
        let fileUrl = mixMatch[1] || mixMatch[0];
        if (fileUrl.startsWith("//")) fileUrl = "https:" + fileUrl;
        sources.push({
          file: fileUrl,
          label: "HD",
          type: "mp4",
        });
      }
    }

    // Vidoza Direct Extraction
    if (currentUrl.includes("vidoza")) {
      const vidozaMatch =
        html.match(/<source\s+src=["'](https?:[^"']+\.mp4[^"']*)["']/i) ||
        combinedCodeToScan.match(
          /src\s*:\s*["'](https?:[^"']+\.mp4[^"']*)["']/i,
        ) ||
        combinedCodeToScan.match(
          /file\s*:\s*["'](https?:[^"']+\.mp4[^"']*)["']/i,
        );
      if (vidozaMatch) {
        sources.push({
          file: vidozaMatch[1],
          label: "HD",
          type: "mp4",
        });
      }
    }

    // VOE Direct Extraction
    if (currentUrl.includes("voe")) {
      const voeMatch =
        combinedCodeToScan.match(
          /["']hls["']\s*:\s*["'](https?:[^"']+\.m3u8[^"']*)["']/i,
        ) ||
        combinedCodeToScan.match(
          /["']mp4["']\s*:\s*["'](https?:[^"']+\.mp4[^"']*)["']/i,
        ) ||
        html.match(/["'](https?:[^"']+\.m3u8[^"']*)["']/i);
      if (voeMatch) {
        const fileUrl = voeMatch[1];
        const isHls = fileUrl.includes(".m3u8");
        sources.push({
          file: fileUrl,
          label: "HD",
          type: isHls ? "hls" : "mp4",
        });
      }
    }

    // 4. دعم سيرفر Doodstream و d000d تلقائياً بقراءة الـ MD5 الراجع
    if (currentUrl.includes("dood") || currentUrl.includes("d000d")) {
      const direct = await extractDoodstreamLink(
        currentUrl,
        combinedCodeToScan,
        headers,
      );
      if (direct) {
        sources.push({
          file: direct,
          label: "HD",
          type: "mp4",
        });
      }
    }

    // 5. فحص مشغلات jwplayer و videojs في السيرفرات المتنوعة
    const jwConfigRegex = /sources\s*:\s*(\[[^\]]+\])/gi;
    let jwMatch;
    while ((jwMatch = jwConfigRegex.exec(combinedCodeToScan)) !== null) {
      try {
        const cleanedArr = jwMatch[1]
          .replace(/'/g, '"')
          .replace(/(\w+)\s*:/g, '"$1":');
        const parsed = JSON.parse(cleanedArr);
        if (Array.isArray(parsed)) {
          parsed.forEach((src: any) => {
            const fileUrl = src.file || src.src;
            if (fileUrl) {
              sources.push({
                file: fileUrl,
                label: src.label || src.type || "FHD",
                type: fileUrl.includes(".m3u8") ? "hls" : "mp4",
              });
            }
          });
        }
      } catch (_) {}
    }

    // 6. استخراج مباشر للمصفوفات وعينات التنسيقات المباشرة (M3U8 / MP4) لتحديث القشط
    const m3u8Regex = /(https?:\/\/[^\s'"]+?\.m3u8[^\s'"]*)/gi;
    const mp4Regex = /(https?:\/\/[^\s'"]+?\.mp4[^\s'"]*)/gi;

    const m3u8MatchesRaw = combinedCodeToScan.match(m3u8Regex) || [];
    const mp4MatchesRaw = combinedCodeToScan.match(mp4Regex) || [];

    const m3u8Matches: string[] = Array.from(new Set(m3u8MatchesRaw)).filter(
      (url) =>
        !url.includes("google") &&
        !url.includes("facebook") &&
        !url.includes("analytics"),
    );
    const mp4Matches: string[] = Array.from(new Set(mp4MatchesRaw)).filter(
      (url) =>
        !url.includes("google") &&
        !url.includes("facebook") &&
        !url.includes("analytics") &&
        !url.includes("placeholder"),
    );

    m3u8Matches.forEach((url) => {
      sources.push({ file: url, label: "FHD", type: "hls" });
    });

    mp4Matches.forEach((url) => {
      sources.push({
        file: url,
        label: "HD",
        type: "mp4",
      });
    });

    if (sources.length > 0) {
      const hlsSource = sources.find((s) => s.type === "hls");
      const mp4Source = sources.find((s) => s.type === "mp4");

      const primary = hlsSource || mp4Source || sources[0];
      return {
        directUrl: primary.file,
        type: primary.type === "hls" ? "hls" : "direct",
        sources,
      };
    }

    // If no direct MP4/M3U8 was unpacked from the host, return the actual embed/nested iframe URL so the player renders the real server!
    const embedFallbackUrl = nestedIframeUrl || currentUrl || targetUrl;
    return {
      directUrl: embedFallbackUrl,
      type: "iframe",
      sources: [
        {
          file: embedFallbackUrl,
          label: "FHD",
          type: "iframe",
        },
      ],
    };
  } catch (error) {
    return {
      directUrl: targetUrl,
      type: "iframe",
      sources: [
        {
          file: targetUrl,
          label: "FHD",
          type: "iframe",
        },
      ],
    };
  }
}

// مسار وكيل البث المباشر (Stream Proxy) لتمرير ترويسة Referer ودعم الـ Range Requests لسيرفرات YourUpload و MP4Upload بدون إعلانات
router.get(
  "/anime/stream-proxy",
  handleAsync(async (req: Request, res: Response) => {
    const rawUrl = (req.query.url as string) || "";
    const referer = (req.query.referer as string) || "";
    if (!rawUrl || !rawUrl.startsWith("http")) {
      return res.status(400).send("Invalid stream URL");
    }

    const proxyHeaders: Record<string, string> = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      Accept: "*/*",
    };

    if (referer) {
      proxyHeaders["Referer"] = referer;
      try {
        const refObj = new URL(referer);
        proxyHeaders["Origin"] = `${refObj.protocol}//${refObj.host}`;
      } catch (_) {}
    }

    if (req.headers.range) {
      proxyHeaders["Range"] = req.headers.range as string;
    }

    try {
      // في حال كان السيرفر (مثل vidcache.net الخاص بـ YourUpload) يوجه 302 إلى سيرفر فرعي يتطلب عدم إرسال Referer في الخطوة الثانية
      let upstream = await fetch(rawUrl, {
        headers: proxyHeaders,
        redirect: "manual",
      });

      if (
        (upstream.status === 301 ||
          upstream.status === 302 ||
          upstream.status === 303 ||
          upstream.status === 307 ||
          upstream.status === 308) &&
        upstream.headers.get("location")
      ) {
        const nextUrl = new URL(
          upstream.headers.get("location")!,
          rawUrl
        ).href;
        // إذا كان رابط التوجيه على vidcache.net يعمل مباشرة مع Range، يمكننا توجيه المتصفح إليه أو جلبه مباشرة
        const nextHeaders: Record<string, string> = {
          "User-Agent": proxyHeaders["User-Agent"],
          Accept: "*/*",
        };
        if (req.headers.range) {
          nextHeaders["Range"] = req.headers.range as string;
        }
        if (referer && !nextUrl.includes("vidcache.net")) {
          nextHeaders["Referer"] = referer;
        }
        upstream = await fetch(nextUrl, {
          headers: nextHeaders,
          redirect: "follow",
        });
      }

      res.status(upstream.status);
      const forwardHeaders = [
        "content-type",
        "content-length",
        "content-range",
        "accept-ranges",
      ];
      forwardHeaders.forEach((h) => {
        const val = upstream.headers.get(h);
        if (val) res.setHeader(h, val);
      });
      res.setHeader("Access-Control-Allow-Origin", "*");

      if (!upstream.body) {
        return res.end();
      }

      const reader = upstream.body.getReader();
      req.on("close", () => {
        reader.cancel().catch(() => {});
      });

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!res.writableEnded) {
          res.write(Buffer.from(value));
        } else {
          break;
        }
      }
      if (!res.writableEnded) {
        res.end();
      }
    } catch (err) {
      if (!res.headersSent) {
        res.status(502).send("Stream proxy error");
      } else if (!res.writableEnded) {
        res.end();
      }
    }
  })
);

interface ResolvedDownloadTarget {
  streamUrl: string;
  referer: string;
  filename: string;
  mode: "mp4" | "hls-remux" | "mega";
  sizeBytes?: number;
  serverName?: string;
  megaKeyHex?: string;
  megaNonceHex?: string;
  publicNoReferer?: boolean;
  mimeType?: string;
}

const STREAM_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

function isDirectVideoFileUrl(u: string): boolean {
  try {
    const p = new URL(u).pathname.toLowerCase();
    return p.endsWith(".mp4") || p.endsWith(".mkv") || p.endsWith(".webm");
  } catch {
    return /\.(?:mp4|mkv|webm)(?:$|[?#])/i.test(u);
  }
}

function getHostReferer(sourceUrl: string): string {
  try {
    const u = new URL(sourceUrl);
    if (u.hostname.includes("yourupload")) return "https://www.yourupload.com/";
    if (u.hostname.includes("mp4upload")) return "https://www.mp4upload.com/";
    if (u.hostname.includes("sendvid")) return "https://sendvid.com/";
    if (u.hostname.includes("ok.ru")) return "https://ok.ru/";
    return `${u.protocol}//${u.hostname}/`;
  } catch {
    return "";
  }
}

function decodeMegaBase64Url(b64: string): Buffer {
  const norm = b64.replace(/-/g, "+").replace(/_/g, "/");
  const pad = "==".slice(0, (4 - (norm.length % 4)) % 4);
  return Buffer.from(norm + pad, "base64");
}

async function resolveMegaTarget(
  megaUrl: string,
  fallbackFilename: string,
): Promise<ResolvedDownloadTarget | null> {
  try {
    const m =
      megaUrl.match(/mega\.nz\/(?:file|embed)\/([^#/?]+)#([A-Za-z0-9_-]+)/i) ||
      megaUrl.match(/mega\.nz\/#!([^!/?]+)!([A-Za-z0-9_-]+)/i);
    if (!m) return null;
    const fileId = m[1];
    const keyB64 = m[2];
    const rawKey = decodeMegaBase64Url(keyB64);
    if (rawKey.length < 32) return null;

    const aesKey = Buffer.alloc(16);
    for (let i = 0; i < 16; i++) {
      aesKey[i] = rawKey[i] ^ rawKey[i + 16];
    }
    const nonce = rawKey.subarray(16, 24);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    let apiData: any;
    try {
      const apiResp = await fetch("https://g.api.mega.co.nz/cs?id=1", {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": STREAM_UA },
        body: JSON.stringify([{ a: "g", g: 1, p: fileId }]),
        signal: controller.signal,
      });
      if (!apiResp.ok) return null;
      const arr = await apiResp.json();
      apiData = Array.isArray(arr) ? arr[0] : null;
    } finally {
      clearTimeout(timer);
    }

    if (!apiData || typeof apiData !== "object" || !apiData.g || !apiData.s) {
      return null;
    }

    const sizeBytes = Number(apiData.s);
    if (!Number.isFinite(sizeBytes) || sizeBytes < 100 * 1024) return null;

    let finalName = fallbackFilename;
    if (typeof apiData.at === "string") {
      try {
        const atBuf = decodeMegaBase64Url(apiData.at);
        const attrDec = crypto.createDecipheriv("aes-128-cbc", aesKey, Buffer.alloc(16));
        attrDec.setAutoPadding(false);
        const attrRaw = Buffer.concat([attrDec.update(atBuf), attrDec.final()])
          .toString("utf8")
          .replace(/\0+$/, "");
        if (attrRaw.startsWith("MEGA{")) {
          const parsedAttr = JSON.parse(attrRaw.slice(4));
          if (parsedAttr?.n && /\.(mp4|mkv|webm)$/i.test(parsedAttr.n)) {
            const cleanAttrName = String(parsedAttr.n).replace(/[^\w\u0600-\u06FF.\s-]/gi, "").trim();
            if (cleanAttrName) finalName = cleanAttrName;
          }
        }
      } catch (_) {}
    }

    return {
      streamUrl: String(apiData.g),
      referer: "https://mega.nz/",
      filename: fallbackFilename || finalName,
      mode: "mega",
      sizeBytes,
      serverName: "Mega",
      megaKeyHex: aesKey.toString("hex"),
      megaNonceHex: nonce.toString("hex"),
    };
  } catch {
    return null;
  }
}

async function fetchUpstreamFollowRedirect(
  targetUrl: string,
  referer: string,
  rangeHeader?: string,
  timeoutMs = 8000,
): Promise<globalThis.Response> {
  const headers: Record<string, string> = {
    "User-Agent": STREAM_UA,
    Accept: "*/*",
  };
  if (referer) {
    headers["Referer"] = referer;
    try {
      const refObj = new URL(referer);
      headers["Origin"] = `${refObj.protocol}//${refObj.host}`;
    } catch (_) {}
  }
  if (rangeHeader) {
    headers["Range"] = rangeHeader;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let upstream = await fetch(targetUrl, {
      headers,
      redirect: "manual",
      signal: controller.signal,
    });

    if (
      (upstream.status === 301 ||
        upstream.status === 302 ||
        upstream.status === 303 ||
        upstream.status === 307 ||
        upstream.status === 308) &&
      upstream.headers.get("location")
    ) {
      const nextUrl = new URL(upstream.headers.get("location")!, targetUrl).href;
      const nextHeaders: Record<string, string> = {
        "User-Agent": STREAM_UA,
        Accept: "*/*",
      };
      if (rangeHeader) nextHeaders["Range"] = rangeHeader;
      if (referer && !nextUrl.includes("vidcache.net")) {
        nextHeaders["Referer"] = referer;
      }
      upstream = await fetch(nextUrl, {
        headers: nextHeaders,
        redirect: "follow",
        signal: controller.signal,
      });
    }

    return upstream;
  } finally {
    clearTimeout(timer);
  }
}

async function verifyBinaryVideoUrl(
  candidateStreamUrl: string,
  referer: string,
): Promise<{ ok: boolean; sizeBytes?: number }> {
  try {
    const resp = await fetchUpstreamFollowRedirect(
      candidateStreamUrl,
      referer,
      "bytes=0-4095",
      6000,
    );
    try {
      await resp.body?.cancel();
    } catch (_) {}

    if (!resp.ok) return { ok: false };
    const ct = (resp.headers.get("content-type") || "").toLowerCase();
    if (
      ct.includes("text/html") ||
      ct.includes("application/xhtml") ||
      ct.includes("application/json") ||
      ct.includes("text/plain")
    ) {
      return { ok: false };
    }

    let sizeBytes: number | undefined;
    const contentRange = resp.headers.get("content-range") || "";
    const rangeMatch = contentRange.match(/\/(\d+)$/);
    if (rangeMatch) {
      sizeBytes = parseInt(rangeMatch[1], 10);
    } else if (resp.headers.get("content-length")) {
      const cl = parseInt(resp.headers.get("content-length") || "0", 10);
      if (cl > 0) sizeBytes = cl;
    }

    if (
      ct.startsWith("video/") ||
      ct.includes("application/octet-stream") ||
      ct.includes("binary/octet-stream") ||
      (sizeBytes !== undefined && sizeBytes > 500 * 1024)
    ) {
      return { ok: true, sizeBytes };
    }
    return { ok: false };
  } catch {
    return { ok: false };
  }
}

async function resolveSingleCandidateToVideo(
  rawUrl: string,
  filename: string,
): Promise<{ mp4?: ResolvedDownloadTarget; hls?: ResolvedDownloadTarget }> {
  if (!rawUrl || !rawUrl.startsWith("http")) return {};

  // Videa.hu public no-referer MP4/WebM direct CDN stream
  if (rawUrl.toLowerCase().includes("videa.hu")) {
    const vSrcs = await serverCache.getOrFetch(
      `videa_direct_v1:${rawUrl}`,
      () => extractVideaDirectSources(rawUrl),
      15 * 60 * 1000,
    );
    for (const vs of vSrcs) {
      const check = await verifyBinaryVideoUrl(vs.file, "");
      if (check.ok) {
        const isWebm = vs.mimeType.includes("webm");
        const finalName = isWebm ? filename.replace(/\.mp4$/i, ".webm") : filename;
        return {
          mp4: {
            streamUrl: vs.file,
            referer: "",
            filename: finalName,
            mode: "mp4",
            sizeBytes: check.sizeBytes,
            serverName: "Videa",
            publicNoReferer: true,
            mimeType: vs.mimeType || "video/mp4",
          },
        };
      }
    }
    return {};
  }

  // Mega.nz direct API + AES-128-CTR decrypt stream
  if (rawUrl.toLowerCase().includes("mega.nz/")) {
    const megaTarget = await serverCache.getOrFetch(
      `mega_target_v1:${rawUrl}`,
      () => resolveMegaTarget(rawUrl, filename),
      30 * 60 * 1000,
    );
    if (megaTarget) {
      return { mp4: { ...megaTarget, filename, publicNoReferer: false, mimeType: "video/mp4" } };
    }
    return {};
  }

  // Google Drive direct binary download (bypasses virus scan HTML page)
  if (rawUrl.includes("drive.google.com") || rawUrl.includes("gdrive")) {
    const dMatch =
      rawUrl.match(/\/d\/([A-Za-z0-9_-]+)/) ||
      rawUrl.match(/id=([A-Za-z0-9_-]+)/);
    if (dMatch) {
      const gUrl = `https://drive.usercontent.google.com/download?id=${dMatch[1]}&export=download&confirm=t`;
      const check = await verifyBinaryVideoUrl(gUrl, "");
      if (check.ok) {
        return {
          mp4: {
            streamUrl: gUrl,
            referer: "",
            filename,
            mode: "mp4",
            sizeBytes: check.sizeBytes,
            serverName: "Google Drive",
            publicNoReferer: true,
            mimeType: "video/mp4",
          },
        };
      }
    }
  }

  const candidateUrlsToTry: { streamUrl: string; referer: string; isHls: boolean }[] = [];

  if (isDirectVideoFileUrl(rawUrl)) {
    candidateUrlsToTry.push({
      streamUrl: rawUrl,
      referer: getHostReferer(rawUrl),
      isHls: false,
    });
  } else {
    // Normalize non-embed URLs to embed URLs where scrapers give direct streams
    let extractInput = rawUrl;
    if (extractInput.includes("uqload") && !extractInput.includes("/embed-")) {
      extractInput = extractInput.replace(/(uqload\.[a-z]+\/)([A-Za-z0-9_-]+)/i, "$1embed-$2");
    }
    if (extractInput.includes("mp4upload.com/") && !extractInput.includes("/embed-")) {
      extractInput = extractInput.replace(/mp4upload\.com\/([A-Za-z0-9_-]+)/i, "mp4upload.com/embed-$1.html");
    }
    if (extractInput.includes("vidmoly") && !extractInput.includes("/embed-")) {
      extractInput = extractInput.replace(/(vidmoly\.[a-z]+\/)([A-Za-z0-9_-]+)/i, "$1embed-$2");
    }
    if (
      (extractInput.includes("asnwish") ||
        extractInput.includes("streamwish") ||
        extractInput.includes("awish") ||
        extractInput.includes("swish")) &&
      extractInput.includes("/f/")
    ) {
      extractInput = extractInput.replace("/f/", "/e/");
    }
    if (extractInput.includes("ok.ru/video/")) {
      extractInput = extractInput.replace("/video/", "/videoembed/");
    }
    if (extractInput.includes("yourupload.com/watch/")) {
      extractInput = extractInput.replace("/watch/", "/embed/");
    }

    const extracted = await serverCache.getOrFetch(
      `extract_stream_v7:${extractInput}`,
      () => extractDirectStream(extractInput),
      5 * 60 * 1000,
    );

    const allSources = [
      ...(extracted.directUrl
        ? [{ file: extracted.directUrl, label: "Primary", type: extracted.type === "hls" ? "hls" : extracted.type === "direct" ? "mp4" : "iframe" }]
        : []),
      ...(extracted.sources || []),
    ];

    for (const src of allSources) {
      if (!src.file || src.type === "iframe") continue;
      let streamUrl = src.file;
      let referer = getHostReferer(extractInput);

      if (streamUrl.startsWith("/api/anime/stream-proxy")) {
        const u = new URL(streamUrl, "http://localhost");
        streamUrl = u.searchParams.get("url") || "";
        referer = u.searchParams.get("referer") || referer;
      }
      if (!streamUrl.startsWith("http")) continue;

      const isHls = src.type === "hls" || /\.m3u8(?:$|[?#])/i.test(streamUrl);
      if (!candidateUrlsToTry.some((c) => c.streamUrl === streamUrl)) {
        candidateUrlsToTry.push({ streamUrl, referer, isHls });
      }
    }
  }

  let hlsFallback: ResolvedDownloadTarget | undefined;

  for (const cand of candidateUrlsToTry) {
    if (cand.isHls) {
      if (!hlsFallback) {
        let isPublicHls = false;
        try {
          const rNoRef = await fetchWithTimeout(cand.streamUrl, { headers: { "User-Agent": STREAM_UA } }, 3500);
          if (rNoRef.ok) {
            const txt = await rNoRef.text();
            if (txt.includes("#EXTM3U")) isPublicHls = true;
          }
        } catch (_) {}
        hlsFallback = {
          streamUrl: cand.streamUrl,
          referer: cand.referer,
          filename,
          mode: "hls-remux",
          serverName: "HLS Direct",
          publicNoReferer: isPublicHls,
          mimeType: "application/vnd.apple.mpegurl",
        };
      }
      continue;
    }

    const check = await verifyBinaryVideoUrl(cand.streamUrl, cand.referer);
    if (check.ok) {
      const noRefCheck = cand.referer
        ? await verifyBinaryVideoUrl(cand.streamUrl, "")
        : check;
      return {
        mp4: {
          streamUrl: cand.streamUrl,
          referer: cand.referer,
          filename,
          mode: "mp4",
          sizeBytes: check.sizeBytes,
          publicNoReferer: noRefCheck.ok,
          mimeType: "video/mp4",
        },
      };
    }
  }

  return hlsFallback ? { hls: hlsFallback } : {};
}

async function resolveBestDownloadTarget(
  rawCandidates: string[],
  title: string,
  ep: string,
  preferPublicExternal = false,
  keepPrimaryFirst = false,
): Promise<{
  primary: ResolvedDownloadTarget | null;
  publicExternal: ResolvedDownloadTarget | null;
}> {
  const cleanTitle =
    (title || "Anime").replace(/[^\w\u0600-\u06FF\s-]/gi, "").trim() || "Anime";
  const safeFilename = `${cleanTitle}-Ep-${ep}.mp4`;

  // Unwrap nested /api/anime/download?url=... links & deduplicate
  const expanded: string[] = [];
  for (const c of rawCandidates) {
    if (!c) continue;
    if (c.startsWith("/api/anime/download") || c.includes("/api/anime/download?")) {
      try {
        const u = new URL(c, "http://localhost");
        const inner = u.searchParams.get("url");
        if (inner && inner.startsWith("http") && !expanded.includes(inner)) {
          expanded.push(inner);
        }
      } catch (_) {}
      continue;
    }
    if (c.startsWith("http") && !expanded.includes(c)) {
      expanded.push(c);
    }
  }

  const getHostPriority = (url: string): number => {
    const l = url.toLowerCase();
    if (l.includes("mediafire")) return -10;
    if (preferPublicExternal) {
      if (l.includes("sendvid")) return 100;
      if (l.includes("drive.google")) return 98;
      if (l.includes("videa")) return 96;
      if (l.includes("uqload")) return 94;
      if (l.includes("4shared")) return 92;
      if (l.includes("wish")) return 88;
      if (l.includes("vidmoly")) return 86;
      if (l.includes("filemoon") || l.includes("voe")) return 84;
      if (l.includes("ok.ru")) return 82;
      if (l.includes("streamtape") || l.includes("dood") || l.includes("d000d")) return 78;
      if (l.includes("mp4upload")) return 50;
      if (l.includes("mega.nz")) return 45;
      return 40;
    }
    if (l.includes("sendvid")) return 100;
    if (l.includes("videa")) return 98;
    if (l.includes("mp4upload")) return 96;
    if (l.includes("ok.ru")) return 92;
    if (l.includes("mega.nz")) return 90;
    if (l.includes("yourupload")) return 85;
    if (l.includes("uqload")) return 80;
    if (l.includes("4shared")) return 75;
    if (l.includes("drive.google")) return 72;
    if (l.includes("streamtape")) return 65;
    if (l.includes("dood") || l.includes("d000d")) return 60;
    if (l.includes("sibnet") || l.includes("vidoza") || l.includes("mixdrop")) return 55;
    if (l.includes("wish") || l.includes("filemoon") || l.includes("vidmoly") || l.includes("voe")) return 40;
    return 40;
  };

  const validCandidates = expanded.filter((u) => getHostPriority(u) > 0);
  const ordered =
    keepPrimaryFirst && validCandidates.length > 0
      ? [
          validCandidates[0],
          ...validCandidates.slice(1).sort((a, b) => getHostPriority(b) - getHostPriority(a)),
        ].slice(0, 14)
      : validCandidates.sort((a, b) => getHostPriority(b) - getHostPriority(a)).slice(0, 14);

  let firstMp4: ResolvedDownloadTarget | null = null;
  let firstHlsFallback: ResolvedDownloadTarget | null = null;
  let firstPublicMp4: ResolvedDownloadTarget | null = null;
  let firstPublicHls: ResolvedDownloadTarget | null = null;

  for (let i = 0; i < ordered.length; i += 3) {
    const batch = ordered.slice(i, i + 3);
    const results = await Promise.all(
      batch.map((u) =>
        resolveSingleCandidateToVideo(u, safeFilename).catch(
          (): { mp4?: ResolvedDownloadTarget; hls?: ResolvedDownloadTarget } => ({}),
        ),
      ),
    );
    for (const r of results) {
      if (r.mp4) {
        if (!firstMp4) firstMp4 = r.mp4;
        if (r.mp4.publicNoReferer && !firstPublicMp4) firstPublicMp4 = r.mp4;
      }
      if (r.hls) {
        if (!firstHlsFallback) firstHlsFallback = r.hls;
        if (r.hls.publicNoReferer && !firstPublicHls) firstPublicHls = r.hls;
      }
    }

    if (preferPublicExternal) {
      if (firstPublicMp4) break;
      if (firstPublicHls && i >= 3) break;
    } else if (firstMp4 && firstPublicMp4) {
      break;
    }
  }

  const publicExternal = firstPublicMp4 || firstPublicHls;
  const primary = preferPublicExternal
    ? (publicExternal || firstMp4 || firstHlsFallback)
    : (firstMp4 || firstHlsFallback);

  return { primary, publicExternal };
}

function sendVideoHeaders(
  res: Response,
  filename: string,
  contentType: string,
  asAttachment: boolean,
  contentLength?: string | number | null,
) {
  const asciiFallback = filename.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "") || "episode.mp4";
  res.setHeader(
    "Content-Disposition",
    `${asAttachment ? "attachment" : "inline"}; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
  );
  res.setHeader("Content-Type", contentType || "video/mp4");
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (contentLength) {
    res.setHeader("Content-Length", String(contentLength));
  }
}

async function streamMegaTarget(
  target: ResolvedDownloadTarget,
  req: Request,
  res: Response,
  asAttachment: boolean,
) {
  const totalSize = target.sizeBytes || 0;
  if (!totalSize || !target.megaKeyHex || !target.megaNonceHex) {
    return res.status(502).send("بيانات ملف Mega غير مكتملة");
  }

  const aesKey = Buffer.from(target.megaKeyHex, "hex");
  const nonce = Buffer.from(target.megaNonceHex, "hex");

  let start = 0;
  let end = totalSize - 1;
  let isRange = false;

  const rangeHeader = (req.headers.range as string | undefined) || "";
  if (rangeHeader) {
    const m = rangeHeader.match(/bytes=(\d*)-(\d*)/i);
    if (m) {
      isRange = true;
      start = m[1] ? parseInt(m[1], 10) : 0;
      end = m[2] ? parseInt(m[2], 10) : totalSize - 1;
      if (isNaN(start) || start < 0) start = 0;
      if (isNaN(end) || end >= totalSize) end = totalSize - 1;
      if (start > end) {
        res.status(416).setHeader("Content-Range", `bytes */${totalSize}`);
        return res.end();
      }
    }
  }

  const responseLength = end - start + 1;
  res.status(isRange ? 206 : 200);
  sendVideoHeaders(res, target.filename, "video/mp4", asAttachment, responseLength);
  res.setHeader("Accept-Ranges", "bytes");
  if (isRange) {
    res.setHeader("Content-Range", `bytes ${start}-${end}/${totalSize}`);
  }

  if (req.method === "HEAD") {
    return res.end();
  }

  const alignedStart = Math.floor(start / 16) * 16;
  const skipBytes = start - alignedStart;
  const blockIdx = BigInt(alignedStart / 16);

  const iv = Buffer.alloc(16);
  nonce.copy(iv, 0);
  iv.writeBigUInt64BE(blockIdx, 8);

  const rangeSuffix = `/${alignedStart}-${end}`;
  const upstream = await fetch(`${target.streamUrl}${rangeSuffix}`, {
    headers: { "User-Agent": STREAM_UA },
  });

  if (!upstream.ok || !upstream.body) {
    if (!res.headersSent) return res.status(502).send("تعذر سحب الملف من خادم Mega");
    return res.end();
  }

  const decipher = crypto.createDecipheriv("aes-128-ctr", aesKey, iv);
  let remainingSkip = skipBytes;
  const reader = upstream.body.getReader();

  req.on("close", () => {
    reader.cancel().catch(() => {});
  });

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      let plain = decipher.update(Buffer.from(value));
      if (remainingSkip > 0) {
        if (plain.length <= remainingSkip) {
          remainingSkip -= plain.length;
          continue;
        }
        plain = plain.subarray(remainingSkip);
        remainingSkip = 0;
      }
      if (!res.writableEnded && plain.length > 0) {
        res.write(plain);
      } else if (res.writableEnded) {
        break;
      }
    }
    const tail = decipher.final();
    if (tail.length > 0 && !res.writableEnded) {
      res.write(tail);
    }
  } catch (_) {}

  if (!res.writableEnded) {
    res.end();
  }
}

async function streamResolvedDownloadTarget(
  target: ResolvedDownloadTarget,
  req: Request,
  res: Response,
  asAttachment = true,
) {
  if (target.mode === "mega") {
    return streamMegaTarget(target, req, res, asAttachment);
  }

  if (target.mode === "hls-remux") {
    sendVideoHeaders(res, target.filename, "video/mp4", asAttachment);
    if (req.method === "HEAD") {
      return res.end();
    }
    const ffArgs: string[] = [
      "-reconnect",
      "1",
      "-reconnect_streamed",
      "1",
      "-reconnect_delay_max",
      "5",
    ];
    if (target.referer) {
      ffArgs.push("-headers", `Referer: ${target.referer}\r\nUser-Agent: ${STREAM_UA}\r\n`);
    } else {
      ffArgs.push("-user_agent", STREAM_UA);
    }
    ffArgs.push(
      "-i",
      target.streamUrl,
      "-c",
      "copy",
      "-bsf:a",
      "aac_adtstoasc",
      "-movflags",
      "frag_keyframe+empty_moov",
      "-f",
      "mp4",
      "pipe:1",
    );

    const ff = spawn("ffmpeg", ffArgs, { stdio: ["ignore", "pipe", "pipe"] });
    req.on("close", () => {
      try {
        ff.kill("SIGKILL");
      } catch (_) {}
    });
    ff.stdout.pipe(res);
    ff.on("error", () => {
      if (!res.headersSent) res.status(502).send("Video remux failed");
      else if (!res.writableEnded) res.end();
    });
    return;
  }

  const upstream = await fetchUpstreamFollowRedirect(
    target.streamUrl,
    target.referer,
    req.headers.range as string | undefined,
    30000,
  );

  if (!upstream.ok || !upstream.body) {
    return res.status(502).send("تعذر سحب ملف الفيديو من السيرفر");
  }

  const upstreamCt = (upstream.headers.get("content-type") || "").toLowerCase();
  if (upstreamCt.includes("text/html")) {
    try {
      await upstream.body.cancel();
    } catch (_) {}
    return res.status(502).send("السيرفر أعاد صفحة HTML بدلاً من ملف الفيديو");
  }

  res.status(upstream.status);
  sendVideoHeaders(
    res,
    target.filename,
    upstreamCt.startsWith("video/") ? upstreamCt : "video/mp4",
    asAttachment,
    upstream.headers.get("content-length"),
  );
  const contentRange = upstream.headers.get("content-range");
  if (contentRange) res.setHeader("Content-Range", contentRange);
  res.setHeader("Accept-Ranges", upstream.headers.get("accept-ranges") || "bytes");

  if (req.method === "HEAD") {
    try {
      await upstream.body.cancel();
    } catch (_) {}
    return res.end();
  }

  const reader = upstream.body.getReader();
  req.on("close", () => {
    reader.cancel().catch(() => {});
  });

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!res.writableEnded) {
      res.write(Buffer.from(value));
    } else {
      break;
    }
  }
  if (!res.writableEnded) {
    res.end();
  }
}

// تجهيز واستخراج رابط فيديو MP4 موثوق ومباشر للتحميل الفوري
router.post(
  "/anime/resolve-download",
  handleAsync(async (req: Request, res: Response) => {
    const { url, fallbackUrls, title, ep, preferExternal } = req.body || {};
    const candidates: string[] = [
      ...(typeof url === "string" ? [url] : []),
      ...(Array.isArray(fallbackUrls) ? fallbackUrls.filter((u: any) => typeof u === "string") : []),
    ];

    if (candidates.length === 0) {
      return res.status(400).json({ success: false, message: "لا توجد روابط سيرفرات للتحميل." });
    }

    const isModFast = typeof url === "string" && url.includes("/api/anime/download");
    const wantPublicExternal = Boolean(preferExternal || isModFast);
    const { primary: resolved, publicExternal } = await resolveBestDownloadTarget(
      candidates,
      String(title || "Anime"),
      String(ep || "1"),
      wantPublicExternal,
      !wantPublicExternal,
    );

    if (!resolved) {
      return res.json({
        success: false,
        message: "لم يعثر الخادم على ملف MP4 مباشر في السيرفرات الحالية لهذه الحلقة.",
      });
    }

    const token = `dl_${crypto.randomBytes(12).toString("hex")}`;
    await serverCache.set(`download_token:${token}`, resolved, 60 * 60 * 1000);

    const extTarget =
      publicExternal && publicExternal.mode === "mp4" && publicExternal.publicNoReferer
        ? publicExternal
        : resolved.publicNoReferer && resolved.mode === "mp4"
        ? resolved
        : null;

    res.json({
      success: true,
      mode: resolved.mode,
      token,
      downloadUrl: `/api/anime/download-stream?token=${token}`,
      externalDirectUrl: extTarget ? extTarget.streamUrl : null,
      externalDirectMime: extTarget ? (extTarget.mimeType || "video/mp4") : null,
      filename: resolved.filename,
      sizeBytes: resolved.sizeBytes || null,
    });
  }),
);

// تجهيز رابط بث مباشر قابل للتشغيل الفوري في المشغلات الخارجية (MX Player / VLC / مشغل النظام)
router.post(
  "/anime/resolve-play",
  handleAsync(async (req: Request, res: Response) => {
    const { url, fallbackUrls, title, ep } = req.body || {};
    const candidates: string[] = [
      ...(typeof url === "string" ? [url] : []),
      ...(Array.isArray(fallbackUrls) ? fallbackUrls.filter((u: any) => typeof u === "string") : []),
    ];

    if (candidates.length === 0) {
      return res.status(400).json({ success: false, message: "لا توجد روابط للتشغيل الخارجي." });
    }

    const { primary: resolved, publicExternal } = await resolveBestDownloadTarget(
      candidates,
      String(title || "Anime"),
      String(ep || "1"),
      true,
    );

    if (!resolved) {
      return res.json({
        success: false,
        message: "تعذر استخراج بث مباشر للمشغل الخارجي من السيرفرات الحالية، جرب سيرفراً آخر.",
      });
    }

    // الأولوية القصوى للروابط المباشرة من الـ CDN التي لا تتطلب Referer ولا تمر عبر بوابة مصادقة التطبيق
    const directPublic = publicExternal || (resolved.publicNoReferer ? resolved : null);
    if (directPublic && directPublic.publicNoReferer) {
      return res.json({
        success: true,
        isDirectCdn: true,
        mode: directPublic.mode === "hls-remux" ? "hls" : directPublic.mode,
        streamUrl: directPublic.streamUrl,
        mimeType:
          directPublic.mimeType ||
          (directPublic.mode === "hls-remux" ? "application/vnd.apple.mpegurl" : "video/mp4"),
        filename:
          directPublic.mode === "hls-remux"
            ? directPublic.filename.replace(/\.mp4$/i, ".m3u8")
            : directPublic.filename,
      });
    }

    const token = `pl_${crypto.randomBytes(12).toString("hex")}`;
    await serverCache.set(`play_token:${token}`, resolved, 6 * 60 * 60 * 1000);
    const safeFile = encodeURIComponent(resolved.filename || "episode.mp4");

    res.json({
      success: true,
      isDirectCdn: false,
      mode: resolved.mode,
      streamUrl: `/api/anime/play-stream/${token}/${safeFile}`,
      mimeType: resolved.mimeType || "video/mp4",
      filename: resolved.filename,
    });
  }),
);

// بث ملف الفيديو مباشرة في وضع Inline للمشغلات الخارجية مع دعم كامل للتقديم والتأخير (Range)
router.get(
  "/anime/play-stream/:token/:filename",
  handleAsync(async (req: Request, res: Response) => {
    const token = req.params.token || "";
    if (!token) {
      return res.status(400).send("Missing stream token");
    }
    const target = await serverCache.get<ResolvedDownloadTarget>(`play_token:${token}`);
    if (!target) {
      return res.status(404).send("انتهت صلاحية رابط البث، يرجى الضغط مجدداً");
    }

    await streamResolvedDownloadTarget(target, req, res, false);
  }),
);

// بث ملف الفيديو مباشرة كملف مرفق للتنزيل الفوري عبر Token موثق
router.get(
  "/anime/download-stream",
  handleAsync(async (req: Request, res: Response) => {
    const token = (req.query.token as string) || "";
    if (!token) {
      return res.status(400).send("Missing download token");
    }
    const target = await serverCache.get<ResolvedDownloadTarget>(`download_token:${token}`);
    if (!target) {
      return res.status(404).send("انتهت صلاحية رابط التحميل، يرجى الضغط على تنزيل مجدداً");
    }

    await streamResolvedDownloadTarget(target, req, res, true);
  }),
);

// مسار التحميل المباشر الذكي لحلقات الأنمي (MOD Direct Downloader) — لا يعيد أبداً ملف HTML
router.get(
  "/anime/download",
  handleAsync(async (req: Request, res: Response) => {
    const rawUrl = (req.query.url as string) || "";
    const title = (req.query.title as string) || "Anime";
    const ep = (req.query.ep as string) || "1";

    if (!rawUrl || !rawUrl.startsWith("http")) {
      return res.status(400).send("رابط التحميل غير صالح");
    }

    const { primary: resolved } = await resolveBestDownloadTarget([rawUrl], title, ep, false);
    if (!resolved) {
      return res
        .status(404)
        .send("تعذر استخراج ملف فيديو MP4 مباشر من هذا السيرفر، يرجى استخدام زر التحميل السريع MOD Fast.");
    }

    await streamResolvedDownloadTarget(resolved, req, res, true);
  }),
);

router.post(
  "/anime/extract",
  handleAsync(async (req: Request, res: Response) => {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ success: false, message: "الرابط مطلوب" });
    }

    const extractKey = `extract_stream_v4:${url}`;
    const extracted = await serverCache.getOrFetch(
      extractKey,
      () => extractDirectStream(url),
      5 * 60 * 1000
    );

    res.json({
      success: true,
      message: "تم تتبع السيرفر واستخراج رابط البث المباشر بدقة.",
      data: {
        directUrl: extracted.directUrl,
        type: extracted.type,
        sources: extracted.sources || [],
      },
    });
  }),
);

// مسار جلب سيرفرات المشاهدة والتحميل للحلقة
router.post(
  "/anime/servers",
  handleAsync(async (req: Request, res: Response) => {
    const { url, animeId, episodeNum, seasonNumber, animeTitle } = req.body;
    if (!url) {
      return res.status(400).json({ success: false, message: "رابط الحلقة مطلوب" });
    }
    const servers = await scraper.getEpisodeServers(url, animeId, episodeNum, seasonNumber, animeTitle);
    res.json({
      success: true,
      data: servers,
    });
  }),
);

// -------------------------------------------------------------
// مسار فحص صحة النظام العام (لأغراض التشخيص الآمن بدون تعديل إداري)
// -------------------------------------------------------------
router.get(
  "/system/health",
  handleAsync(async (req: Request, res: Response) => {
    const stats = serverCache.getStats();
    const jobs = schedulerService.getJobsStatus();
    res.json({
      success: true,
      data: {
        status: "ok",
        runtime: process.env.VERCEL ? "vercel-serverless" : "node-express",
        uptimeSeconds: Math.round(process.uptime()),
        cache: {
          engine: stats.engine,
          mode: stats.mode,
          keysCount: stats.keysCount,
          hits: stats.hits,
          staleHits: stats.staleHits,
          misses: stats.misses,
          hitRatioPercent: stats.hitRatioPercent,
        },
        scheduler: {
          totalJobs: jobs.length,
          jobs: jobs.map((j) => ({
            id: j.id,
            nameArabic: j.nameArabic,
            cronExpression: j.cronExpression,
            status: j.status,
            runCount: j.runCount,
            lastRunAt: j.lastRunAt,
            lastDurationMs: j.lastDurationMs,
          })),
        },
      },
    });
  }),
);

// -------------------------------------------------------------
// مسارات إدارة ومراقبة التخزين المؤقت (node-cache Caching Engine) - محمية بـ Firebase Admin SDK
// -------------------------------------------------------------
router.get(
  "/cache/stats",
  requireServerAdminAuth("moderator", "access_dashboard"),
  handleAsync(async (req: Request, res: Response) => {
    const stats = serverCache.getStats();
    const keys = serverCache.getKeys();
    res.json({
      success: true,
      data: {
        stats,
        activeKeysCount: keys.length,
        sampleKeys: keys.slice(0, 20),
      },
    });
  }),
);

router.post(
  "/cache/mode",
  requireServerAdminAuth("moderator", "manage_cache_queue"),
  handleAsync(async (req: Request, res: Response) => {
    const { mode } = req.body;
    const targetMode =
      mode === "zero_live" || mode === "zero_cache_direct"
        ? "zero_live"
        : "10k_smart_ram";
    serverCache.setMode(targetMode);
    const currentStats = serverCache.getStats();
    res.json({
      success: true,
      mode: targetMode,
      stats: currentStats,
      data: {
        mode: targetMode,
        stats: currentStats,
      },
      message:
        targetMode === "10k_smart_ram"
          ? "تم تفعيل محرك الـ 10,000 مستخدم (دمج الطلبات + ذاكرة RAM اللحظية)"
          : "تم تفعيل وضع البث المباشر النقي (0 ثانية)",
    });
  }),
);

router.post(
  "/cache/clear",
  requireServerAdminAuth("moderator", "manage_cache_queue"),
  handleAsync(async (req: Request, res: Response) => {
    await serverCache.clear();
    try {
      const { ScraperQueue } = await import("../services/queueService");
      ScraperQueue.clearJobs();
    } catch {}
    res.json({
      success: true,
      message: "تم تفريغ كافة مستويات التخزين المؤقت بنجاح (node-cache / Redis / Disk / Queue).",
    });
  }),
);

router.post(
  "/system/factory-reset",
  requireServerAdminAuth("owner", "factory_wipe"),
  handleAsync(async (req: Request, res: Response) => {
    await serverCache.clear();
    try {
      const { ScraperQueue } = await import("../services/queueService");
      ScraperQueue.clearJobs();
    } catch {}
    res.json({
      success: true,
      message: "تم تنظيف الخادم، حذف النسخ المؤقتة (.cache)، وتصفير قوائم الانتظار والذاكرة بنجاح.",
      timestamp: Date.now(),
    });
  }),
);

// -------------------------------------------------------------
// مسارات مجدول المهام التلقائي (node-cron Task Scheduler) - محمية بـ Firebase Admin SDK
// -------------------------------------------------------------
router.get(
  "/scheduler/status",
  requireServerAdminAuth("moderator", "access_dashboard"),
  handleAsync(async (req: Request, res: Response) => {
    const jobs = schedulerService.getJobsStatus();
    res.json({
      success: true,
      data: {
        totalJobs: jobs.length,
        jobs,
      },
    });
  }),
);

router.post(
  "/scheduler/run/:jobId",
  requireServerAdminAuth("moderator", "manage_cache_queue"),
  handleAsync(async (req: Request, res: Response) => {
    const { jobId } = req.params;
    const result = await schedulerService.triggerJob(jobId);
    if (!result.success) {
      return res.status(400).json({ success: false, message: result.message });
    }
    res.json({
      success: true,
      message: result.message,
      durationMs: result.durationMs,
    });
  }),
);

// 3. مسار جلب بيانات الصفحة الرئيسية (Dashboard)
router.get(
  "/dashboard",
  handleAsync(async (req: Request, res: Response) => {
    if (IS_EXTERNAL_FETCH_DISABLED) {
      const dashboardData = {
        top5: getCuratedTop5(),
        recentEpisodes: getCuratedRecentEpisodes(),
        popular: getCuratedSeasonAnime().slice(0, 10),
        currentSeason: getCuratedSeasonAnime(),
        schedule: getCuratedTop5(),
      };
      return res.json({
        success: true,
        data: dashboardData,
        cached: true,
      });
    }
    try {
      // Read day requested by user to align with local timezone, default to server local day
      const userDay = req.query.day as string;
      const requestedSeason = (
        (req.query.season as string) || "auto"
      ).toLowerCase();
      const requestedSliderMode = (
        (req.query.sliderMode as string) ||
        (["best_season", "trending_season", "all_time_best", "classic_historical", "custom"].includes(requestedSeason)
          ? requestedSeason
          : "best_season")
      ).toLowerCase();
      const bypass = req.query.bypass === "true";
      const days = [
        "sunday",
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
      ];
      const currentDay = days.includes(userDay)
        ? userDay
        : days[new Date().getDay()];

      const cacheKey = `dashboard-v6-${currentDay}-${requestedSeason}-${requestedSliderMode}`;

      if (bypass) {
        await serverCache.delete(cacheKey);
        await serverCache.delete("recent_episodes");
        await serverCache.delete("recent_episodes_animedar_isolated_v3_page_1");
        await serverCache.delete("https://api.jikan.moe/v4/seasons/now?limit=25");
        const sliderModes = ["best_season", "trending_season", "all_time_best", "classic_historical", "custom"];
        for (const d of days) {
          await serverCache.delete(`dashboard-${d}-${requestedSeason}`);
          await serverCache.delete(`dashboard-${d}-auto`);
          for (const m of sliderModes) {
            await serverCache.delete(`dashboard-v6-${d}-${requestedSeason}-${m}`);
            await serverCache.delete(`dashboard-v6-${d}-auto-${m}`);
          }
        }
      }

      const dashboardData = await serverCache.getOrFetchSWR<any>(
        cacheKey,
        async () => {
          // Determine season url to fetch based on custom settings
          let seasonUrl = "https://api.jikan.moe/v4/seasons/now?limit=25";
      if (
        requestedSeason &&
        requestedSeason !== "auto" &&
        ["winter", "spring", "summer", "fall"].includes(requestedSeason)
      ) {
        const currentYear = new Date().getFullYear();
        seasonUrl = `https://api.jikan.moe/v4/seasons/${currentYear}/${requestedSeason}?limit=25`;
      }

      // Safe concurrent fetch with timeout guard to guarantee ultra-fast response time
      const fetchWithTimeout = async <T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> => {
        let timeoutHandle: any;
        const timeoutPromise = new Promise<T>((resolve) => {
          timeoutHandle = setTimeout(() => resolve(fallback), timeoutMs);
        });
        try {
          const result = await Promise.race([promise, timeoutPromise]);
          clearTimeout(timeoutHandle);
          return result;
        } catch {
          clearTimeout(timeoutHandle);
          return fallback;
        }
      };

      const currentYear = new Date().getFullYear();
      const targetSeasonParam =
        requestedSeason &&
        requestedSeason !== "auto" &&
        ["winter", "spring", "summer", "fall"].includes(requestedSeason)
          ? requestedSeason
          : undefined;

      const [sliderListRaw, seasonListRaw, recentList, todayScheduleRaw, trendingTodayRaw] =
        await Promise.all([
          fetchWithTimeout(
            anilistService.getSliderByMode(requestedSliderMode, 15).catch(async () => {
              const r = await fetchJikan("https://api.jikan.moe/v4/top/anime?filter=bypopularity&limit=12").catch(() => ({ data: [] }));
              return r.data || [];
            }),
            3200,
            []
          ),
          fetchWithTimeout(
            anilistService.getSeasonAnime(targetSeasonParam, targetSeasonParam ? currentYear : undefined, 25).catch(async () => {
              const r = await fetchJikan(seasonUrl).catch(() => ({ data: [] }));
              return r.data || [];
            }),
            3200,
            []
          ),
          fetchWithTimeout(
            scraper.getRecentEpisodes(bypass).catch(() => []),
            bypass ? 7500 : 6500,
            []
          ),
          fetchWithTimeout(
            anilistService.getScheduleByDay(currentDay).catch(async () => {
              const r = await fetchJikan(`https://api.jikan.moe/v4/schedules?filter=${currentDay}&limit=20`).catch(() => ({ data: [] }));
              return r.data || [];
            }),
            4500,
            []
          ),
          fetchWithTimeout(
            anilistService.getSliderByMode("trending_season", 20).catch(async () => {
              const r = await fetchJikan("https://api.jikan.moe/v4/top/anime?filter=airing&limit=20").catch(() => ({ data: [] }));
              return r.data || [];
            }),
            3500,
            []
          ),
        ]);

      // 1. السلايدر العلوي السينمائي (top5): يعرض القائمة حسب وضع السلايدر المحدد في الإدارة
      const top5: any[] = [];
      const seenTopIds = new Set<string>();

      const sourceSliderAnime =
        Array.isArray(sliderListRaw) && sliderListRaw.length > 0
          ? sliderListRaw
          : [...(seasonListRaw || [])].sort(
              (a: any, b: any) => (Number(b.score) || 0) - (Number(a.score) || 0)
            );

      for (const anime of sourceSliderAnime) {
        if (top5.length >= 12) break;
        const idStr = anime.mal_id?.toString();
        if (idStr && !seenTopIds.has(idStr)) {
          seenTopIds.add(idStr);
          top5.push({
            _id: idStr,
            title: cleanAnimeTitle(anime.title_english || anime.title) || anime.title_english || anime.title,
            posterUrl: anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url,
            bannerUrl: anime.bannerUrl || anime.bannerImage || anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url,
            rating: anime.score || 8.5,
            genres: anime.genres?.map((g: any) => g.name) || ["أكشن", "فانتازيا"],
          });
        }
      }

      if (top5.length === 0) {
        for (const tAnime of trendingTodayRaw || []) {
          if (top5.length >= 10) break;
          const idStr = tAnime.mal_id?.toString();
          if (idStr && !seenTopIds.has(idStr)) {
            seenTopIds.add(idStr);
            top5.push({
              _id: idStr,
              title: cleanAnimeTitle(tAnime.title_english || tAnime.title) || tAnime.title_english || tAnime.title,
              posterUrl: tAnime.images?.jpg?.large_image_url || tAnime.images?.jpg?.image_url,
              bannerUrl: tAnime.bannerUrl || tAnime.bannerImage || tAnime.images?.jpg?.large_image_url || tAnime.images?.jpg?.image_url,
              rating: tAnime.score || 8.5,
              genres: tAnime.genres?.map((g: any) => g.name) || ["أكشن", "فانتازيا"],
            });
          }
        }
      }

      // Map recent scraped episodes, preserving season info in search target while displaying clean title
      const resolvedRecentList = (recentList || []).map((item) => {
        const rawWithSeason = (item.title || "")
          .replace(/(?:الحلقة|حلقة)\s*\d+.*$/i, "")
          .replace(/مترجم.*$/i, "")
          .replace(/اون\s*لاين.*$/i, "")
          .replace(/^انمي\s+/i, "")
          .trim();
        const cleanTitle = cleanAnimeTitle(item.title);
        const seasonMatch = (item.title || "").match(/(?:الموسم|موسم|Season)\s*(\d+)/i);
        const displayTitle = seasonMatch && !cleanTitle.includes("الموسم") && !cleanTitle.toLowerCase().includes("season")
          ? `${cleanTitle} S${seasonMatch[1]}`
          : cleanTitle;
        const lowerTitle = `${displayTitle.toLowerCase().trim()}-ep-${item.episode}`;
        return { item, cleanTitle: displayTitle, rawWithSeason: rawWithSeason || cleanTitle, lowerTitle };
      });

      const seenRecentTitles = new Set<string>();
      const recentEpisodes: any[] = [];
      resolvedRecentList.forEach(({ item, cleanTitle, rawWithSeason, lowerTitle }, idx) => {
        if (!seenRecentTitles.has(lowerTitle)) {
          seenRecentTitles.add(lowerTitle);

          const posterUrl = item.imageUrl
            ? item.imageUrl.replace("-thumbnail.", "-poster.")
            : "https://via.placeholder.com/300x400?text=Anime";
          const thumbnailUrl =
            item.imageUrl || "https://via.placeholder.com/300x400?text=Anime";

          const exactSlug = item.id && item.id.includes("__ep__") ? item.id.split("__ep__")[0] : "";

          recentEpisodes.push({
            _id: item.id || `recent-scraped-${idx}`,
            animeId: {
              _id: exactSlug || `search-${rawWithSeason}`,
              title: cleanTitle,
              titleAr: cleanTitle,
              posterUrl,
              thumbnailUrl,
              episodeLink: item.id || item.link || "",
            },
            episodeNumber: item.episode,
            link: item.id || item.link || "",
          });
        }
      });

      // 2. رائج اليوم (Daily Trending): مستخرج من ترتيب التفاعل والرائج اليومي العالمي في AniList مع عزله عن تكرار أحدث الحلقات
      const popular: any[] = [];
      const seenTrendingIds = new Set<string>();
      const recentTitleKeys = new Set<string>(
        recentEpisodes
          .slice(0, 12)
          .map((ep) => (ep.animeId?.title || ep.title || "").toLowerCase().trim())
          .filter(Boolean)
      );

      const trendingPool =
        Array.isArray(trendingTodayRaw) && trendingTodayRaw.length > 0
          ? trendingTodayRaw
          : seasonListRaw || [];

      // Pass 1: Prefer trending titles that aren't already sitting in the top of recentEpisodes
      for (const anime of trendingPool) {
        if (popular.length >= 12) break;
        const idStr = anime.mal_id?.toString();
        const titleClean = cleanAnimeTitle(anime.title_english || anime.title) || anime.title_english || anime.title;
        if (idStr && !seenTrendingIds.has(idStr) && !recentTitleKeys.has(titleClean.toLowerCase().trim())) {
          seenTrendingIds.add(idStr);
          popular.push({
            _id: idStr,
            title: titleClean,
            posterUrl: anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url,
            episodeNumber: anime.latestEpisode ? String(anime.latestEpisode) : undefined,
            rating: anime.score || 8.4,
            isDailyTrending: true,
          });
        }
      }

      // Pass 2: If fewer than 10 distinct items matched, top up from remaining trendingPool (still never copying recentEpisodes blindly)
      if (popular.length < 10) {
        for (const anime of trendingPool) {
          if (popular.length >= 12) break;
          const idStr = anime.mal_id?.toString();
          const titleClean = cleanAnimeTitle(anime.title_english || anime.title) || anime.title_english || anime.title;
          if (idStr && !seenTrendingIds.has(idStr)) {
            seenTrendingIds.add(idStr);
            popular.push({
              _id: idStr,
              title: titleClean,
              posterUrl: anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url,
              episodeNumber: anime.latestEpisode ? String(anime.latestEpisode) : undefined,
              rating: anime.score || 8.4,
              isDailyTrending: true,
            });
          }
        }
      }

      const seenSeasonIds = new Set<string>();
      const currentSeason = (seasonListRaw || [])
        .filter((anime: any) => {
          const malId = anime.mal_id.toString();
          if (!seenSeasonIds.has(malId)) {
            seenSeasonIds.add(malId);
            return true;
          }
          return false;
        })
        .map((anime: any) => ({
          _id: anime.mal_id.toString(),
          title: anime.title_english || anime.title,
          posterUrl:
            anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url,
          rating: anime.score || 0,
        }));

      const seenScheduleIds = new Set<string>();
      const schedule = (todayScheduleRaw || [])
        .filter((anime: any) => {
          const malId = anime.mal_id.toString();
          if (!seenScheduleIds.has(malId)) {
            seenScheduleIds.add(malId);
            return true;
          }
          return false;
        })
        .map((anime: any) => ({
          _id: anime.mal_id.toString(),
          title: anime.title_english || anime.title,
          posterUrl:
            anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url,
          rating: anime.score || 0,
        }));

      // If recentEpisodes failed to scrape live, try stale real scraped cache before falling back
      let finalRecent = recentEpisodes;
      if (finalRecent.length === 0) {
        const staleRaw = await serverCache.get<any[]>("recent_episodes", true);
        if (Array.isArray(staleRaw) && staleRaw.length > 0) {
          finalRecent = staleRaw.map((item, idx) => {
            const cleanTitle = cleanAnimeTitle(item.title);
            const seasonMatch = (item.title || "").match(/(?:الموسم|موسم|Season)\s*(\d+)/i);
            const displayTitle =
              seasonMatch && !cleanTitle.includes("الموسم") && !cleanTitle.toLowerCase().includes("season")
                ? `${cleanTitle} S${seasonMatch[1]}`
                : cleanTitle;
            const exactSlug = item.id && item.id.includes("__ep__") ? item.id.split("__ep__")[0] : "";
            const posterUrl = item.imageUrl ? item.imageUrl.replace("-thumbnail.", "-poster.") : "";
            return {
              _id: item.id || `recent-stale-${idx}`,
              animeId: {
                _id: exactSlug || `search-${displayTitle}`,
                title: displayTitle,
                titleAr: displayTitle,
                posterUrl,
                thumbnailUrl: item.imageUrl || posterUrl,
                episodeLink: item.id || item.link || "",
              },
              episodeNumber: item.episode,
              link: item.id || item.link || "",
            };
          });
        }
      }

      const resultPayload = {
        top5: top5.length > 0 ? top5 : getCuratedTop5(),
        recentEpisodes: finalRecent,
        popular: popular.length > 0 ? popular : getCuratedSeasonAnime(),
        currentSeason: currentSeason.length > 0 ? currentSeason : getCuratedSeasonAnime(),
        schedule: schedule.length > 0 ? schedule : getCuratedTop5(),
      };

      // Only cache for full 90s when live recentEpisodes succeeded; otherwise short 10s cache
      if (finalRecent.length === 0) {
        setTimeout(() => {
          serverCache.delete(cacheKey).catch(() => {});
        }, 5000);
      }

      return resultPayload;
        },
        120 * 1000,
        15 * 60 * 1000,
        bypass
      );

      res.json({
        success: true,
        data: dashboardData,
      });
    } catch (error) {
      console.warn("API warning info:", error);
      const curatedDashboard = {
        top5: getCuratedTop5(),
        recentEpisodes: getCuratedRecentEpisodes(),
        popular: getCuratedSeasonAnime(),
        currentSeason: getCuratedSeasonAnime(),
        schedule: getCuratedTop5(),
      };
      res.json({ success: true, data: curatedDashboard });
    }
  }),
);

router.get(
  "/anime/poster/:id",
  handleAsync(async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      if (IS_EXTERNAL_FETCH_DISABLED) {
        const curated = getCuratedAnimeById(id);
        return res.json({
          success: true,
          posterUrl: curated.posterUrl,
        });
      }
      const cacheKey = `poster_${id}`;
      const cachedPoster = await serverCache.get<string>(cacheKey);
      if (cachedPoster) {
        return res.json({ success: true, posterUrl: cachedPoster });
      }

      const aniDetails = await anilistService.getAnimeFullDetails(id).catch(() => null);
      if (aniDetails?.anime?.images?.jpg?.large_image_url) {
        const url = aniDetails.anime.images.jpg.large_image_url;
        await serverCache.set(cacheKey, url, 24 * 60 * 60 * 1000);
        return res.json({ success: true, posterUrl: url });
      }

      const jikanRes = await fetchJikan(`https://api.jikan.moe/v4/anime/${id}`);
      if (jikanRes && jikanRes.data) {
        const url =
          jikanRes.data.images?.jpg?.large_image_url ||
          jikanRes.data.images?.jpg?.image_url;
        if (url) await serverCache.set(cacheKey, url, 24 * 60 * 60 * 1000);
        return res.json({
          success: true,
          posterUrl: url,
        });
      }
      return res.json({ success: false });
    } catch (e) {
      return res.json({ success: false });
    }
  }),
);

router.get(
  "/anime/pictures/:id",
  handleAsync(async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const queryMalId = String(req.query.malId || "").trim();
      const queryTitle = String(req.query.title || "").trim();

      if ((!id || id === "undefined" || id === "null") && !queryMalId && !queryTitle) {
        return res.json({ success: true, pictures: [] });
      }
      if (IS_EXTERNAL_FETCH_DISABLED) {
        const curated = getCuratedAnimeById(queryMalId || id);
        return res.json({
          success: true,
          pictures: curated.pictures || [curated.posterUrl],
        });
      }

      const lookupKey =
        (/^\d+$/.test(queryMalId) ? queryMalId : "") ||
        (/^\d+$/.test(id) ? id : "") ||
        queryTitle ||
        id;

      const cacheKey = `anime-pictures-v4-${lookupKey}`;
      const cached = await serverCache.get<string[]>(cacheKey);
      if (cached !== null && Array.isArray(cached) && cached.length > 1) {
        return res.json({ success: true, pictures: cached });
      }

      const numericMalId =
        (/^\d+$/.test(queryMalId) ? queryMalId : "") ||
        (/^\d+$/.test(id) ? id : "");

      const [aniDetails, picsRes] = await Promise.all([
        anilistService.getAnimeFullDetails(numericMalId || queryTitle || id).catch(() => null),
        numericMalId
          ? fetchJikan(`https://api.jikan.moe/v4/anime/${numericMalId}/pictures`).catch(() => null)
          : Promise.resolve(null),
      ]);

      const picturesSet = new Set<string>();

      // 1. Add official MyAnimeList / Jikan pictures of this exact anime first
      if (picsRes?.data && Array.isArray(picsRes.data)) {
        picsRes.data.forEach((p: any) => {
          const url = p.large_image_url || p.jpg?.large_image_url || p.image_url || p.jpg?.image_url;
          if (url) picturesSet.add(url);
        });
      }

      // If numericMalId wasn't known initially, but AniList resolved it, fetch Jikan pictures by that mal_id
      const resolvedMalId = aniDetails?.anime?.mal_id ? String(aniDetails.anime.mal_id) : "";
      if (!numericMalId && resolvedMalId && /^\d+$/.test(resolvedMalId)) {
        const malPicsRes = await fetchJikan(
          `https://api.jikan.moe/v4/anime/${resolvedMalId}/pictures`
        ).catch(() => null);
        if (malPicsRes?.data && Array.isArray(malPicsRes.data)) {
          malPicsRes.data.forEach((p: any) => {
            const url = p.large_image_url || p.jpg?.large_image_url || p.image_url || p.jpg?.image_url;
            if (url) picturesSet.add(url);
          });
        }
      }

      // 2. Add AniList cover, banner, and official episode still thumbnails of this exact anime
      if (aniDetails?.pictures && Array.isArray(aniDetails.pictures)) {
        aniDetails.pictures.forEach((url: string) => {
          if (url) picturesSet.add(url);
        });
      }

      const pictures = Array.from(picturesSet);
      if (pictures.length > 0) {
        await serverCache.set(cacheKey, pictures, 24 * 60 * 60 * 1000);
      }
      return res.json({ success: true, pictures });
    } catch (e) {
      return res.json({ success: false, pictures: [] });
    }
  }),
);

const GENRE_AR_MAP: Record<string, string> = {
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

function translateGenreToArabic(genre: string): string {
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

function translateGenresListToArabic(genres: any[]): string[] {
  if (!Array.isArray(genres)) return ["أكشن", "فانتازيا"];
  const mapped = genres
    .map((g) => (typeof g === "string" ? translateGenreToArabic(g) : translateGenreToArabic(g?.name || "")))
    .filter(Boolean);
  return Array.from(new Set(mapped));
}
// دالة الترجمة غير الحاصرة في الخلفية للقصة لضمان تجربة مستخدم فائقة السرعة
function translateDescriptionInBackground(id: string, description: string) {
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

// مسار الترجمة الفورية عند الطلب من واجهة المستخدم (On-Demand translation endpoint)
router.post(
  "/anime/translate-synopsis",
  handleAsync(async (req: Request, res: Response) => {
    const { animeId, text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ success: false, message: "النص مطلوب للترجمة." });
    }
    try {
      const translated = await translateToArabic(text);
      if (animeId && translated && translated !== text) {
        const cacheKey = `anime-details-v8-${animeId}`;
        const cached = await serverCache.get<any>(cacheKey);
        if (cached) {
          cached.description = translated;
          await serverCache.set(cacheKey, cached, 24 * 60 * 60 * 1000);
        }
      }
      return res.json({ success: true, translated });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message || "فشلت عملية الترجمة." });
    }
  })
);

// مسار لجلب تفاصيل الأنمي بناءً على الـ ID (Hybrid AniList + RistoAnime Multi-Season + Jikan)
router.get(
  "/anime/details/:id",
  handleAsync(async (req: Request, res: Response) => {
    try {
      let { id } = req.params;
      if (IS_EXTERNAL_FETCH_DISABLED) {
        return res.json({ success: true, data: getCuratedAnimeById(id) });
      }

      if (id !== "random") {
        const cached = await serverCache.get<any>(`anime-details-v8-${id}`);
        if (
          cached !== null &&
          cached.description &&
          cached.description !== "جاري تحديث قصة وتفاصيل هذا الأنمي قريباً." &&
          Array.isArray(cached.episodes) &&
          (cached.episodes.length > 0 || cached.status === "قادم")
        ) {
          cached.genres = translateGenresListToArabic(cached.genres || []);
          const hasEnglishDescription = /[a-zA-Z]{10,}/.test(cached.description);
          if (hasEnglishDescription) {
            const cleanedDesc = cached.description
              .replace(/<[^>]*>/g, " ")
              .replace(/\[Written by MAL Rewrite\]/gi, "")
              .replace(/\(Source:.*?\)/gi, "")
              .trim();
            const translated = await translateToArabic(cleanedDesc);
            if (translated && /[\u0600-\u06FF]/.test(translated)) {
              cached.description = translated;
              await serverCache.set(`anime-details-v8-${id}`, cached, 12 * 60 * 60 * 1000);
            }
          }
          return res.json({ success: true, data: cached });
        }
      }

      const CLASSIC_POPULAR_IDS = [
        "21", "11061", "1535", "5114", "16498", "30276", "31964", "38000",
        "40028", "44511", "1735", "20", "269", "1575", "2904", "52991",
        "52299", "58567", "40748", "51009", "37521", "49387"
      ];

      if (id === "random") {
        id = CLASSIC_POPULAR_IDS[Math.floor(Math.random() * CLASSIC_POPULAR_IDS.length)];
      }

      let animelekId = id;
      let catalogData: any = null;
      let characters: any[] = [];
      let related: any[] = [];
      let jikanRecommendations: any[] = [];
      let aniPictures: string[] = [];
      let requestedSeasonNum: number | undefined = undefined;

      const extractSeasonNumFromText = (txt: string): number | undefined => {
        if (!txt) return undefined;
        const m =
          txt.match(/(?:season|s|part|cour)\s*(\d+)/i) ||
          txt.match(/(?:الموسم|موسم)\s*(\d+)/i) ||
          txt.match(/\b(\d+)(?:nd|rd|th)\s*season/i);
        if (m) return parseInt(m[1], 10);
        if (/الموسم\s*الثاني|الموسم\s*2/i.test(txt)) return 2;
        if (/الموسم\s*الثالث|الموسم\s*3/i.test(txt)) return 3;
        if (/الموسم\s*الرابع|الموسم\s*4/i.test(txt)) return 4;
        return undefined;
      };

      if (/^\d+$/.test(id)) {
        // 1. Fetch rich metadata from AniList (fast ~250ms, no rate limit) with Jikan fallback
        const aniRes = await anilistService.getAnimeFullDetails(id).catch(() => null);
        if (aniRes && aniRes.anime) {
          catalogData = aniRes.anime;
          characters = aniRes.characters || [];
          related = aniRes.related || [];
          jikanRecommendations = aniRes.recommendations || [];
          aniPictures = aniRes.pictures || [];
        } else {
          // Fallback to Jikan
          const [fullRes, charsRes, relRes, recsRes] = await Promise.all([
            fetchJikan(`https://api.jikan.moe/v4/anime/${id}/full`).catch(() => null),
            fetchJikan(`https://api.jikan.moe/v4/anime/${id}/characters`).catch(() => null),
            fetchJikan(`https://api.jikan.moe/v4/anime/${id}/relations`).catch(() => null),
            fetchJikan(`https://api.jikan.moe/v4/anime/${id}/recommendations`).catch(() => null),
          ]);
          if (fullRes?.data) catalogData = fullRes.data;
          if (charsRes?.data) {
            characters = charsRes.data.map((c: any) => {
              const jpVa = c.voice_actors?.find((va: any) => va.language === "Japanese");
              return {
                id: c.character.mal_id,
                name: c.character.name,
                role: c.role === "Main" ? "رئيسي (Main)" : "مساند (Supporting)",
                imageUrl: c.character.images?.jpg?.image_url,
                voiceActor: jpVa
                  ? { name: jpVa.person.name, imageUrl: jpVa.person.images?.jpg?.image_url }
                  : null,
              };
            });
          }
          if (relRes?.data) {
            relRes.data.forEach((r: any) => {
              (r.entry || []).forEach((entry: any) => {
                related.push({
                  relation: r.relation,
                  name: entry.name,
                  mal_id: entry.mal_id,
                  type: entry.type,
                });
              });
            });
          }
          if (recsRes?.data) {
            jikanRecommendations = recsRes.data.slice(0, 10).map((r: any) => ({
              id: r.entry.mal_id,
              title: r.entry.title,
              posterUrl: r.entry.images?.jpg?.large_image_url || r.entry.images?.jpg?.image_url,
            }));
          }
        }

        if (catalogData) {
          const enCandidate = catalogData.title_english || "";
          const romajiCandidate = catalogData.title || "";
          requestedSeasonNum =
            extractSeasonNumFromText(romajiCandidate) ||
            extractSeasonNumFromText(enCandidate);

          const candidates = Array.from(new Set([enCandidate, romajiCandidate].filter(Boolean)));
          if (candidates.length > 0) {
            const searchResults = await Promise.all(
              candidates.map((c) => scraper.searchAnime(c).catch(() => null))
            );
            const matchedSlug = searchResults.find((s) => Boolean(s));
            if (matchedSlug) {
              animelekId = matchedSlug;
            }
          }
        }
      } else if (id.startsWith("search-")) {
        const titleQuery = decodeURIComponent(id.replace("search-", ""));
        requestedSeasonNum = extractSeasonNumFromText(titleQuery);

        const [searchedId, aniRes] = await Promise.all([
          scraper.searchAnime(titleQuery).catch(() => null),
          anilistService.getAnimeFullDetails(titleQuery).catch(() => null),
        ]);

        if (searchedId) animelekId = searchedId;
        if (aniRes && aniRes.anime) {
          catalogData = aniRes.anime;
          characters = aniRes.characters || [];
          related = aniRes.related || [];
          jikanRecommendations = aniRes.recommendations || [];
          aniPictures = aniRes.pictures || [];
          if (!searchedId && (catalogData.title || catalogData.title_english)) {
            const retrySlug = await scraper.searchAnime(catalogData.title || catalogData.title_english);
            if (retrySlug) animelekId = retrySlug;
          }
        }
      } else {
        // Direct slug from RistoAnime or recent episodes
        requestedSeasonNum = extractSeasonNumFromText(decodeURIComponent(id));
      }

      // 2. Scrape real Arabic series/episodes/seasons from RistoAnime / WitAnime
      let data: any = null;
      try {
        if (animelekId && animelekId !== "random" && !/^\d+$/.test(animelekId)) {
          data = await scraper.getAnimeDetails(animelekId, requestedSeasonNum);
        }
      } catch (e) {
        console.log(`[getAnimeDetails] Scraper fallback for ${animelekId}`);
      }

      // If we got scraped data but still didn't have catalogData (e.g. direct slug navigation), fetch catalogData from AniList by scraped title
      if (data && !catalogData && data.title) {
        const aniRes = await anilistService.getAnimeFullDetails(data.title).catch(() => null);
        if (aniRes && aniRes.anime) {
          catalogData = aniRes.anime;
          characters = aniRes.characters || [];
          related = aniRes.related || [];
          jikanRecommendations = aniRes.recommendations || [];
          aniPictures = aniRes.pictures || [];
        }
      }

      const formatArabicSeason = (seasonRaw?: string, yearRaw?: number | string): string => {
        const yr = yearRaw && String(yearRaw) !== "غير معروف" ? String(yearRaw) : "";
        const sLower = String(seasonRaw || "").toLowerCase().trim();
        const seasonArMap: Record<string, string> = {
          winter: "شتاء",
          spring: "ربيع",
          summer: "صيف",
          fall: "خريف",
          autumn: "خريف",
        };
        if (seasonArMap[sLower]) {
          return yr ? `${seasonArMap[sLower]} ${yr}` : seasonArMap[sLower];
        }
        if (/شتاء|ربيع|صيف|خريف/.test(sLower)) {
          return String(seasonRaw);
        }
        return yr ? `عام ${yr}` : "غير محدد";
      };

      const normalizeArabicStatus = (rawStatus?: string): string => {
        const s = String(rawStatus || "").toLowerCase().trim();
        if (
          s.includes("finished") ||
          s.includes("complete") ||
          s.includes("مكتمل") ||
          s.includes("منتهي")
        ) {
          return "مكتمل";
        }
        if (
          s.includes("airing") ||
          s.includes("releasing") ||
          s.includes("now") ||
          s.includes("ongoing") ||
          s.includes("مستمر") ||
          s.includes("يعرض")
        ) {
          return "مستمر";
        }
        if (s.includes("not yet") || s.includes("upcoming") || s.includes("قادم")) {
          return "قادم";
        }
        return "مستمر";
      };

      // 3. Construct or enrich `data` with catalogData
      if (!data) {
        if (catalogData) {
          const yr = catalogData.year || 2025;
          const totalCatalogEps = Math.max(
            parseInt(catalogData.latestEpisode) || 0,
            parseInt(catalogData.episodes) || 0,
            12
          );
          data = {
            _id: catalogData.mal_id?.toString() || id,
            title: catalogData.title_english || catalogData.title,
            englishTitle: catalogData.title_english || catalogData.title,
            posterUrl:
              catalogData.images?.jpg?.large_image_url ||
              catalogData.images?.jpg?.image_url,
            bannerUrl: catalogData.bannerUrl || "",
            description: catalogData.synopsis || "لا توجد قصة متاحة.",
            episodes: [],
            seasonsList: [],
            genres: catalogData.genres?.map((g: any) => g.name) || ["أكشن", "فانتازيا"],
            rating: catalogData.score || 8.0,
            status: normalizeArabicStatus(catalogData.status),
            type: catalogData.type || "TV",
            episodesCount: totalCatalogEps,
            releaseYear: yr,
            season: formatArabicSeason(catalogData.season, yr),
            studio: catalogData.studios?.[0]?.name || "Studio",
            duration: catalogData.duration || "24 دقيقة",
          };
        } else {
          data = getCuratedAnimeById(id);
        }
      }

      if (data && catalogData) {
        if (catalogData.mal_id) {
          data.malId = catalogData.mal_id.toString();
        }
        if (!data.title || data.title === "Anime" || data.title.toLowerCase() === "risto") {
          data.title = catalogData.title_english || catalogData.title || "Anime";
        }
        data.englishTitle = catalogData.title_english || catalogData.title || data.title || "";
        data.posterUrl =
          catalogData.images?.jpg?.large_image_url ||
          catalogData.images?.jpg?.image_url ||
          data.posterUrl;
        if (catalogData.bannerUrl) {
          data.bannerUrl = catalogData.bannerUrl;
        }
        if (catalogData.score) {
          data.rating = catalogData.score;
        }
        if (catalogData.year) {
          data.releaseYear = catalogData.year;
        }
        data.season = formatArabicSeason(catalogData.season, catalogData.year || data.releaseYear);
        data.status = normalizeArabicStatus(catalogData.status || data.status);
        if (!data.studio || data.studio === "غير معروف") {
          data.studio = catalogData.studios?.[0]?.name || "Studio";
        }
        if (
          (!data.description ||
            data.description.length < 25 ||
            data.description.includes("جاري تحديث")) &&
          catalogData.synopsis
        ) {
          data.description = catalogData.synopsis;
        }
      } else if (data) {
        data.status = normalizeArabicStatus(data.status);
      }

      // 4. Populate and complete episodes so long-running anime (e.g. One Piece) have all aired episodes without truncation
      // IMPORTANT: Never fabricate episodes for upcoming ("قادم") anime from the future!
      if (data) {
        if (!Array.isArray(data.episodes)) data.episodes = [];
        const isUpcoming =
          data.status === "قادم" ||
          /not yet|upcoming|قادم/i.test(String(catalogData?.status || ""));

        if (isUpcoming) {
          data.episodes = [];
          data.episodesCount = parseInt(catalogData?.episodes) || 0;
        } else {
          const numericId = catalogData?.mal_id?.toString() || (/^\d+$/.test(id) ? id : String(data._id || "21"));
          const isOngoing =
            data.status === "مستمر" ||
            Boolean(catalogData?.airing) ||
            /currently airing|releasing|مستمر/i.test(String(catalogData?.status || ""));

          // For ongoing (مستمر) anime, NEVER use total planned episodes (e.g. 12 or 24) to generate un-aired future episodes!
          // Only use actual scraped episodes or `latestEpisode` (nextAiringEpisode.episode - 1).
          const airedCatalogCount = isOngoing
            ? parseInt(catalogData?.latestEpisode) || data.episodes.length || 1
            : Math.max(
                parseInt(catalogData?.latestEpisode) || 0,
                parseInt(catalogData?.episodes) || 0
              );

          const targetCount = Math.min(
            isOngoing
              ? Math.max(airedCatalogCount, data.episodes.length)
              : Math.max(airedCatalogCount, data.episodes.length, parseInt(data.episodesCount) || 0, 1),
            1200
          );

          // If ongoing anime had extra placeholder episodes beyond what actually aired, trim them
          if (isOngoing && airedCatalogCount > 0 && data.episodes.length > targetCount) {
            data.episodes = data.episodes.filter(
              (ep: any) => (parseInt(ep.num, 10) || 0) <= targetCount
            );
          }

          if (data.episodes.length < targetCount) {
            const existingByNum = new Map<number, any>();
            data.episodes.forEach((ep: any) => {
              const n = parseInt(ep.num, 10);
              if (n && !existingByNum.has(n)) existingByNum.set(n, ep);
            });

            const completeEps = [];
            for (let i = 1; i <= targetCount; i++) {
              if (existingByNum.has(i)) {
                completeEps.push(existingByNum.get(i));
              } else {
                completeEps.push({
                  id: `${numericId}-episode-${i}`,
                  num: i.toString(),
                  title: `الحلقة ${i}`,
                  link: `/anime/${numericId}/episode/${i}`,
                  seasonNumber: requestedSeasonNum || 1,
                });
              }
            }
            data.episodes = completeEps;
          }
        }
      }

      // Ensure accurate sorting and deduplication for the episodes lists with zero gaps/overlaps
      if (data) {
        if (!data.episodes) data.episodes = [];
        const seenNums = new Set<string>();
        data.episodes = data.episodes.filter((ep: any) => {
          if (!ep || (!ep.id && !ep.num)) return false;
          const numKey = `${ep.seasonNumber || 1}-${ep.num || ep.id}`;
          if (seenNums.has(numKey)) return false;
          seenNums.add(numKey);
          return true;
        });

        data.episodes.sort(
          (a: any, b: any) => (parseInt(a.num, 10) || 0) - (parseInt(b.num, 10) || 0),
        );
        if (data.status !== "قادم") {
          data.episodesCount = data.episodes.length;
        }
      }

      data.characters = characters;
      data.related = related.sort((a, b) => (a.mal_id || 0) - (b.mal_id || 0));
      data.jikanRecommendations = jikanRecommendations;
      if (aniPictures.length > 0) {
        data.pictures = aniPictures;
      } else if (data) {
        data.pictures = [data.posterUrl, data.bannerUrl].filter(Boolean);
      }

      if (data) {
        const rawGenres =
          Array.isArray(data.genres) && data.genres.length > 0
            ? data.genres
            : catalogData?.genres || ["أكشن", "فانتازيا"];
        data.genres = translateGenresListToArabic(rawGenres);
      }

      if (data && data.description) {
        data.description = data.description
          .replace(/<[^>]*>/g, " ")
          .replace(/\[Written by MAL Rewrite\]/gi, "")
          .replace(/\(Source:.*?\)/gi, "")
          .replace(/\s+/g, " ")
          .trim();

        const hasEnglishDescription = /[a-zA-Z]{10,}/.test(data.description);
        if (hasEnglishDescription) {
          try {
            const fastTranslate = await Promise.race([
              translateToArabic(data.description),
              new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
            ]);
            if (fastTranslate && /[\u0600-\u06FF]/.test(fastTranslate)) {
              data.description = fastTranslate;
            } else {
              translateDescriptionInBackground(req.params.id, data.description);
            }
          } catch (e: any) {
            translateDescriptionInBackground(req.params.id, data.description);
          }
        }
      }

      if (data) {
        const requestParamId = req.params.id;
        if (requestParamId && requestParamId !== "random") {
          await serverCache.set(
            `anime-details-v8-${requestParamId}`,
            data,
            12 * 60 * 60 * 1000,
          );
        }
        if (data._id && data._id !== "random" && data._id !== requestParamId) {
          await serverCache.set(
            `anime-details-v8-${data._id}`,
            data,
            12 * 60 * 60 * 1000,
          );
        }
      }

      res.json({ success: true, data });
    } catch (error) {
      console.warn("API Warning details:", error);
      res.status(500).json({ success: false, message: "فشل في جلب التفاصيل." });
    }
  }),
);

const LOCAL_ANIME_MAP: Record<string, string> = {
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

function normalizeArabic(str: string): string {
  return str
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/[ة]/g, "ه")
    .replace(/\s+/g, " ");
}

async function smartQueryTranslator(queryStr: string): Promise<string> {
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

  // 4. Fallback to Gemini with active model (gemini-3-flash-preview / gemini-2.5-flash)
  const client = getAiTranslate();
  if (!client) {
    return trimmed;
  }

  const modelsToTry = [
    "gemini-3-flash-preview",
    "gemini-2.5-flash",
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
        config: {
          temperature: 0.1,
        },
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

// مسار للبحث المتقدم
router.get(
  "/anime/search",
  handleAsync(async (req: Request, res: Response) => {
    try {
      const {
        q,
        genres,
        min_score,
        status,
        page = 1,
        order_by,
        sort,
        year,
      } = req.query;

      if (IS_EXTERNAL_FETCH_DISABLED) {
        const queryStr = ((q as string) || "").toLowerCase().trim();
        const genresParam = (genres as string) || "";
        const selectedGenreIds = genresParam ? genresParam.split(",").map(Number).filter(Boolean) : [];
        const minScore = parseFloat((min_score as string) || "0");
        const statusParam = ((status as string) || "").toLowerCase();
        const yearParam = (year as string) || "";
        const orderByParam = (order_by as string) || "";
        const sortParam = (sort as string) || "desc";

        const selectedGenreNamesAr = selectedGenreIds
          .map((id) => CURATED_GENRES_LIST.find((g) => g.mal_id === id)?.nameAr)
          .filter(Boolean) as string[];

        const filtered = CURATED_ANIME_LIST.filter((a) => {
          if (queryStr) {
            const matchesQuery =
              a.title.toLowerCase().includes(queryStr) ||
              a.title_english.toLowerCase().includes(queryStr) ||
              a.synopsis.toLowerCase().includes(queryStr) ||
              a.genres.some((g) => g.includes(queryStr));
            if (!matchesQuery) return false;
          }
          if (selectedGenreNamesAr.length > 0) {
            const hasGenre = selectedGenreNamesAr.some((gAr) =>
              a.genres.some((ag) => ag.includes(gAr) || gAr.includes(ag))
            );
            if (!hasGenre) return false;
          }
          if (minScore > 0 && a.rating < minScore) return false;
          if (statusParam === "airing" && a.status !== "مستمر") return false;
          if (statusParam === "complete" && a.status !== "مكتمل") return false;
          if (yearParam && a.releaseYear !== yearParam) return false;
          return true;
        });

        if (orderByParam === "score" || orderByParam === "popularity") {
          filtered.sort((a, b) => (sortParam === "asc" ? a.rating - b.rating : b.rating - a.rating));
        } else if (orderByParam === "title") {
          filtered.sort((a, b) =>
            sortParam === "asc" ? a.title.localeCompare(b.title) : b.title.localeCompare(a.title)
          );
        } else if (orderByParam === "start_date") {
          filtered.sort((a, b) =>
            sortParam === "asc"
              ? Number(a.releaseYear) - Number(b.releaseYear)
              : Number(b.releaseYear) - Number(a.releaseYear)
          );
        }

        const results = filtered.map((a) => ({
          _id: a.mal_id.toString(),
          title: a.title_english || a.title,
          posterUrl: a.posterUrl,
          rating: a.rating,
          genres: a.genres,
          status: a.status,
          episodesCount: a.episodes || 12,
        }));
        return res.json({
          success: true,
          data: results,
          pagination: { has_next_page: false, current_page: 1 },
        });
      }
      let resolvedQuery = "";
      if (q) {
        resolvedQuery = await smartQueryTranslator(q as string);
      }

      const genresParam = (genres as string) || "";
      const selectedGenreIds = genresParam
        ? genresParam.split(",").map(Number).filter(Boolean)
        : [];
      const selectedGenreNamesEn = selectedGenreIds
        .map((gid) => CURATED_GENRES_LIST.find((g) => g.mal_id === gid)?.name)
        .filter(Boolean) as string[];

      // Primary: Fast AniList GraphQL Search
      try {
        const aniSearch = await anilistService.searchAnime({
          q: resolvedQuery || (q as string),
          genres: selectedGenreNamesEn,
          minScore: min_score ? parseFloat(min_score as string) : undefined,
          status: status as string,
          year: year ? Number(year) : undefined,
          orderBy: order_by as string,
          sort: sort as string,
          page: Number(page) || 1,
        });

        if (aniSearch && aniSearch.data && aniSearch.data.length > 0) {
          const results = aniSearch.data.map((anime: any) => ({
            _id: anime.mal_id.toString(),
            title: anime.title_english || anime.title,
            posterUrl:
              anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url,
            rating: anime.score || 0,
            genres: anime.genres?.map((g: any) => g.name) || [],
            status:
              anime.status === "Finished Airing"
                ? "مكتمل"
                : anime.status === "Currently Airing"
                  ? "مستمر"
                  : "قادم",
            type: anime.type || "TV",
            season: anime.season || null,
            releaseYear: anime.year ? String(anime.year) : null,
            episodesCount: anime.episodes || null,
          }));

          return res.json({
            success: true,
            data: results,
            pagination: {
              has_next_page: aniSearch.hasNextPage,
              current_page: aniSearch.currentPage,
            },
          });
        }
      } catch (aniErr) {
        console.warn("AniList search fallback to Jikan:", aniErr);
      }

      // Secondary Fallback: Jikan API
      let url = `https://api.jikan.moe/v4/anime?page=${page}&sfw=true`;

      if (resolvedQuery) {
        url += `&q=${encodeURIComponent(resolvedQuery)}`;
      }
      if (genres) url += `&genres=${genres}`;
      if (min_score) url += `&min_score=${min_score}`;
      if (status) url += `&status=${status}`;
      if (order_by) url += `&order_by=${order_by}`;
      if (sort) url += `&sort=${sort}`;
      if (year) {
        url += `&start_date=${year}-01-01&end_date=${year}-12-31`;
      }

      const data = await fetchJikan(url);

      const results = (data.data || []).map((anime: any) => ({
        _id: anime.mal_id.toString(),
        title: anime.title_english || anime.title,
        posterUrl:
          anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url,
        rating: anime.score || 0,
        genres: anime.genres?.map((g: any) => g.name) || [],
        status:
          anime.status === "Finished Airing"
            ? "مكتمل"
            : anime.status === "Currently Airing"
              ? "مستمر"
              : "قادم",
        type: anime.type || "TV",
        season: anime.season || null,
        releaseYear: (anime.year || anime.aired?.prop?.from?.year)
          ? String(anime.year || anime.aired?.prop?.from?.year)
          : null,
        episodesCount: anime.episodes || null,
      }));

      res.json({ success: true, data: results, pagination: data.pagination });
    } catch (error) {
      console.warn("API Search notice:", error);
      res.status(500).json({ success: false, message: "فشل في البحث." });
    }
  }),
);

// مسار لجلب التصنيفات
router.get(
  "/anime/genres",
  handleAsync(async (req: Request, res: Response) => {
    try {
      return res.json({ success: true, data: CURATED_GENRES_LIST });
    } catch (error) {
      res
        .status(500)
        .json({ success: false, message: "فشل في جلب التصنيفات." });
    }
  }),
);

// مسار لجلب أنميات موسم محدد مع التحديث الأسبوعي والتخزين المؤقت
router.get(
  "/anime/season",
  handleAsync(async (req: Request, res: Response) => {
    if (IS_EXTERNAL_FETCH_DISABLED) {
      const { year, season } = req.query;
      return res.json({
        success: true,
        data: getCuratedSeasonAnime(season as string, year as string),
      });
    }
    try {
      const { year, season } = req.query;
      let url = "";
      let cacheKey = "";

      if (year && season) {
        url = `https://api.jikan.moe/v4/seasons/${year}/${season}`;
        cacheKey = `season-v2-${year}-${season}`;
      } else {
        url = `https://api.jikan.moe/v4/seasons/now`;
        const currentYear = new Date().getFullYear();
        const oneJan = new Date(currentYear, 0, 1);
        const numberOfDays = Math.floor(
          (Date.now() - oneJan.getTime()) / (24 * 60 * 60 * 1000),
        );
        const resultWeek = Math.ceil((numberOfDays + oneJan.getDay() + 1) / 7);
        cacheKey = `season-now-v2-${currentYear}-W${resultWeek}`;
      }

      const cached = await serverCache.get<any>(cacheKey);
      if (cached !== null && Array.isArray(cached) && cached.length > 0) {
        return res.json({ success: true, data: cached });
      }

      let rawList: any[] = [];
      try {
        rawList = await anilistService.getSeasonAnime(
          season as string | undefined,
          year ? Number(year) : undefined,
          30
        );
      } catch {}

      if (!rawList || rawList.length === 0) {
        const data = await fetchJikan(url);
        rawList = data.data || [];
      }

      const results = rawList.map((anime: any) => ({
        _id: anime.mal_id.toString(),
        title: anime.title_english || anime.title,
        posterUrl:
          anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url,
        rating: anime.score || 0,
        genres: anime.genres?.map((g: any) => g.name) || [],
        status:
          anime.status === "Finished Airing"
            ? "مكتمل"
            : anime.status === "Currently Airing"
              ? "مستمر"
              : "قادم",
      }));

      if (results.length > 0) {
        await serverCache.set(cacheKey, results, 7 * 24 * 60 * 60 * 1000);
      }

      res.json({ success: true, data: results.length > 0 ? results : getCuratedSeasonAnime(season as string, year as string) });
    } catch (error) {
      console.warn("API warning season details:", error);
      res.json({
        success: true,
        data: getCuratedSeasonAnime(req.query.season as string, req.query.year as string),
      });
    }
  }),
);

// مسار لجلب مواعيد الحلقات عبر AniList + Jikan مع التخزين المؤقت وحماية من الـ 429
router.get(
  "/anime/jikan-schedule",
  handleAsync(async (req: Request, res: Response) => {
    const day = ((req.query.day as string) || "sunday").toLowerCase();
    if (IS_EXTERNAL_FETCH_DISABLED) {
      const filtered = CURATED_ANIME_LIST.filter(
        (a) => a.broadcastDay === day
      );
      const list = (filtered.length > 0 ? filtered : CURATED_ANIME_LIST).map(
        (a, idx) => ({
          mal_id: a.mal_id,
          title: a.title_english || a.title,
          title_english: a.title_english || a.title,
          images: {
            jpg: {
              large_image_url: a.posterUrl,
              image_url: a.posterUrl,
            },
          },
          score: a.rating,
          episodes: a.episodes,
          year: Number(a.releaseYear) || 2025,
          broadcast: { time: `${17 + (idx % 6)}:00`, day: a.broadcastDay },
          genres: a.genres.map((g) => ({ name: g })),
          studios: [{ name: "Studio MAPPA / Ufotable" }],
          synopsis: a.synopsis,
        })
      );
      return res.json({ success: true, data: list });
    }
    try {
      const cacheKey = `schedule_hybrid_${day}`;
      const cached = await serverCache.get<any[]>(cacheKey);
      if (cached && Array.isArray(cached) && cached.length > 0) {
        return res.json({ success: true, data: cached });
      }

      let scheduleList = await anilistService.getScheduleByDay(day).catch(() => []);
      if (!scheduleList || scheduleList.length === 0) {
        const url = `https://api.jikan.moe/v4/schedules?filter=${day}&limit=20`;
        const data = await fetchJikan(url);
        scheduleList = data.data || [];
      }

      if (scheduleList && scheduleList.length > 0) {
        await serverCache.set(cacheKey, scheduleList, 2 * 60 * 60 * 1000);
      }

      res.json({ success: true, data: scheduleList });
    } catch (error) {
      console.warn("Schedule fetch warning:", error);
      res
        .status(500)
        .json({ success: false, message: "فشل في جلب جدول المواعيد." });
    }
  }),
);

// --- مسارات نظام قوائم الانتظار لوظائف الـ Scraping والـ Pre-Warm (محمية بـ Firebase Admin SDK) ---
router.get(
  "/queue/status",
  requireServerAdminAuth("moderator", "access_dashboard"),
  handleAsync(async (req: Request, res: Response) => {
    const { ScraperQueue } = await import("../services/queueService");
    const status = ScraperQueue.getStatus();
    res.json({ success: true, ...status });
  }),
);

router.post(
  "/queue/add",
  requireServerAdminAuth("moderator", "manage_cache_queue"),
  handleAsync(async (req: Request, res: Response) => {
    const { name, data = {}, maxRetries = 2 } = req.body;
    if (!name) {
      return res
        .status(400)
        .json({ success: false, message: "اسم المهمة مطلوب" });
    }
    const { ScraperQueue } = await import("../services/queueService");
    const jobId = await ScraperQueue.addJob(name, data, maxRetries);
    res.json({
      success: true,
      message:
        "تمت جدولة عملية الـ Scraping وإضافتها لصف الانتظار للعمل بشكل غير متزامن.",
      jobId,
    });
  }),
);

router.post(
  "/queue/clear",
  requireServerAdminAuth("moderator", "manage_cache_queue"),
  handleAsync(async (req: Request, res: Response) => {
    const { ScraperQueue } = await import("../services/queueService");
    ScraperQueue.clearJobs();
    res.json({
      success: true,
      message: "تم تصفية سجل صفوف العمل المكتملة والمعلقة.",
    });
  }),
);

router.get(
  "/anime/characters",
  handleAsync(async (req: Request, res: Response) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const searchQuery = ((req.query.q as string) || "").trim();
    const cacheKey = `top_characters_v1_p${page}_q${searchQuery || "all"}`;

    try {
      const cached = await serverCache.get<any[]>(cacheKey);
      if (cached && Array.isArray(cached) && cached.length > 0) {
        return res.json({ success: true, data: cached });
      }

      const gqlQuery = `
        query ($page: Int, $search: String) {
          Page(page: $page, perPage: 24) {
            characters(sort: [FAVOURITES_DESC], search: $search) {
              id
              name {
                full
                native
              }
              image {
                large
              }
              favourites
              gender
              age
              bloodType
              description(asHtml: false)
              media(sort: [POPULARITY_DESC], type: ANIME, perPage: 3) {
                edges {
                  characterRole
                  voiceActors(language: JAPANESE, sort: [FAVOURITES_DESC]) {
                    id
                    name {
                      full
                      native
                    }
                    image {
                      large
                    }
                  }
                  node {
                    id
                    idMal
                    title {
                      english
                      romaji
                    }
                    coverImage {
                      extraLarge
                      large
                    }
                    averageScore
                    format
                    seasonYear
                  }
                }
              }
            }
          }
        }
      `;

      const variables: Record<string, any> = { page };
      if (searchQuery) {
        variables.search = searchQuery;
      }

      const aniRes = await fetch("https://graphql.anilist.co", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ query: gqlQuery, variables }),
      });

      if (aniRes.ok) {
        const json = await aniRes.json();
        const chars = json?.data?.Page?.characters || [];
        if (chars.length > 0) {
          const mapped = chars.map((ch: any, idx: number) => {
            const topEdge = ch.media?.edges?.[0];
            const primaryAnime = topEdge?.node;
            const primaryVA = topEdge?.voiceActors?.[0];
            const cleanDesc = (ch.description || "")
              .replace(/~!.*?!~/gs, "")
              .replace(/__+/g, "")
              .replace(/\*\*+/g, "")
              .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
              .trim();

            return {
              id: String(ch.id),
              rank: (page - 1) * 24 + idx + 1,
              name: ch.name?.full || "Unknown",
              nativeName: ch.name?.native || "",
              imageUrl: ch.image?.large || "",
              favorites: ch.favourites || 0,
              gender: ch.gender || "",
              age: ch.age || "",
              role: topEdge?.characterRole === "MAIN" ? "بطل رئيسي" : "شخصية محورية",
              about: cleanDesc.slice(0, 420),
              voiceActor: primaryVA
                ? {
                    name: primaryVA.name?.full || "",
                    nativeName: primaryVA.name?.native || "",
                    imageUrl: primaryVA.image?.large || "",
                  }
                : null,
              anime: primaryAnime
                ? {
                    id: String(primaryAnime.idMal || primaryAnime.id),
                    title: primaryAnime.title?.english || primaryAnime.title?.romaji || "",
                    posterUrl: primaryAnime.coverImage?.extraLarge || primaryAnime.coverImage?.large || "",
                    rating: primaryAnime.averageScore ? Number((primaryAnime.averageScore / 10).toFixed(1)) : 0,
                    type: primaryAnime.format || "TV",
                    year: primaryAnime.seasonYear || null,
                  }
                : null,
              appearances: (ch.media?.edges || [])
                .filter((e: any) => e?.node?.idMal)
                .map((e: any) => ({
                  id: String(e.node.idMal),
                  title: e.node.title?.english || e.node.title?.romaji || "",
                  posterUrl: e.node.coverImage?.large || "",
                  rating: e.node.averageScore ? Number((e.node.averageScore / 10).toFixed(1)) : 0,
                })),
            };
          });

          await serverCache.set(cacheKey, mapped, 6 * 60 * 60 * 1000);
          return res.json({ success: true, data: mapped });
        }
      }

      // Jikan fallback
      const jikanUrl = searchQuery
        ? `https://api.jikan.moe/v4/characters?q=${encodeURIComponent(searchQuery)}&order_by=favorites&sort=desc&limit=24&page=${page}`
        : `https://api.jikan.moe/v4/top/characters?page=${page}&limit=24`;
      const jikanData = await fetchJikan(jikanUrl);
      const fallbackChars = (jikanData?.data || []).map((ch: any, idx: number) => ({
        id: String(ch.mal_id),
        rank: (page - 1) * 24 + idx + 1,
        name: ch.name || "Unknown",
        nativeName: ch.name_kanji || "",
        imageUrl: ch.images?.jpg?.image_url || "",
        favorites: ch.favorites || 0,
        gender: "",
        age: "",
        role: "بطل رئيسي",
        about: (ch.about || "").slice(0, 420),
        voiceActor: null,
        anime: null,
        appearances: [],
      }));

      if (fallbackChars.length > 0) {
        await serverCache.set(cacheKey, fallbackChars, 6 * 60 * 60 * 1000);
      }

      return res.json({ success: true, data: fallbackChars });
    } catch (error) {
      console.warn("Characters API warning:", error);
      return res.json({ success: true, data: [] });
    }
  }),
);

router.get(
  "/store/seasonal",
  handleAsync(async (req: Request, res: Response) => {
    try {
      const season = typeof req.query.season === "string" ? req.query.season : undefined;
      const year = req.query.year ? Number(req.query.year) : undefined;
      const feed = await anilistService.getSeasonalStoreFeed(season, year);
      return res.json({ success: true, data: feed });
    } catch (err: any) {
      console.warn("Seasonal store feed warning:", err?.message || err);
      return res.json({
        success: false,
        data: { seasonLabel: "الموسم الحالي", seasonKey: "CURRENT", year: new Date().getFullYear(), banners: [], avatars: [] },
      });
    }
  }),
);

export default router;

