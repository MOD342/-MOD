import { Router, Request, Response } from "express";
import { serverCache } from "../../services/cacheService";
import { anilistService } from "../../services/anilistService";
import { cleanAnimeTitle } from "../../utils/animeTitleCleaner";
import {
  CURATED_ANIME_LIST,
  CURATED_GENRES_LIST,
  getCuratedRecentEpisodes,
  getCuratedTop5,
  getCuratedSeasonAnime,
  getCuratedAnimeById,
} from "../../data/curatedAnimeDatabase";
import { IS_EXTERNAL_FETCH_DISABLED, scraper, handleAsync } from "../helpers/shared";
import { fetchWithTimeout, fetchJikan } from "../helpers/jikanClient";
import {
  translateToArabic,
  getArabicTitle,
  translateTitleToEnglish,
  translateItemsList,
  translateGenresListToArabic,
  translateDescriptionInBackground,
  smartQueryTranslator,
} from "../helpers/translation";

const router = Router();



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

// مسار لجلب تفاصيل الأنمي بناءً على الـ ID (Hybrid AniList + OkAnime/AnimeDar + Jikan)
const RANDOM_ANIME_POOL = [
  "21", "11061", "1535", "5114", "16498", "30276", "31964", "38000",
  "40028", "44511", "1735", "20", "269", "1575", "2904", "52991",
  "52299", "58567", "40748", "51009", "37521", "49387", "9253", "19",
  "1", "2001", "20583", "32281", "33352", "37999", "38524", "41467",
  "42249", "43608", "48569", "50265", "51179", "53887", "54865", "56163",
  "57658", "31240", "39535", "35849", "34599", "41084", "37779", "35790",
  "36456", "37430", "40591", "42938", "47778", "48583", "49596", "50602",
  "52034", "53446", "55701", "199", "15417", "21939", "28851", "23273",
  "11757", "13601", "18679", "24833", "31043", "32937"
];

function raceTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

router.get(
  "/anime/details/:id",
  handleAsync(async (req: Request, res: Response) => {
    try {
      let { id } = req.params;
      if (IS_EXTERNAL_FETCH_DISABLED) {
        return res.json({ success: true, data: getCuratedAnimeById(id) });
      }

      const isRandomRequest = id === "random";
      if (isRandomRequest) {
        const excludeRaw = String(req.query.exclude || "");
        const excludedIds = excludeRaw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        const excludeSet = new Set(excludedIds);

        // Harvest any numeric IDs already warmed in RAM cache so random pool grows organically
        const poolSet = new Set<string>(RANDOM_ANIME_POOL);
        for (const k of serverCache.getKeys()) {
          if (k.startsWith("anime-details-v8-")) {
            const candidate = k.replace("anime-details-v8-", "");
            if (/^\d+$/.test(candidate)) poolSet.add(candidate);
          }
        }

        const allPool = Array.from(poolSet);
        let available = allPool.filter((cid) => !excludeSet.has(cid));
        if (available.length === 0) {
          const lastSeen = excludedIds[excludedIds.length - 1];
          available = allPool.filter((cid) => cid !== lastSeen);
          if (available.length === 0) available = allPool;
        }

        // Check which available IDs are already cached in RAM for ultra-fast instant responses
        const cachedCandidates: string[] = [];
        const availableSet = new Set(available);
        for (const k of serverCache.getKeys()) {
          if (k.startsWith("anime-details-v8-")) {
            const candidate = k.replace("anime-details-v8-", "");
            if (availableSet.has(candidate)) {
              cachedCandidates.push(candidate);
            }
          }
        }

        // Prefer cached pool 60% of the time when >= 3 cached options exist so consecutive clicks never stall, while keeping fresh discovery 40%
        if (cachedCandidates.length >= 3 && Math.random() < 0.6) {
          id = cachedCandidates[Math.floor(Math.random() * cachedCandidates.length)];
        } else {
          id = available[Math.floor(Math.random() * available.length)];
        }
      }

      // Now check cache AFTER resolving random ID!
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
          const translated = await raceTimeout(translateToArabic(cleanedDesc), 2500, "");
          if (translated && /[\u0600-\u06FF]/.test(translated)) {
            cached.description = translated;
            await serverCache.set(`anime-details-v8-${id}`, cached, 12 * 60 * 60 * 1000);
          }
        }
        return res.json({ success: true, resolvedId: cached._id || id, data: cached });
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

      const scraperSearchTimeout = isRandomRequest ? 3500 : 6000;
      const scraperDetailsTimeout = isRandomRequest ? 4500 : 8000;

      if (/^\d+$/.test(id)) {
        // 1. Fetch rich metadata from AniList (fast ~250ms, no rate limit) with Jikan fallback
        const aniRes = await anilistService.getAnimeFullDetails(id).catch(() => null);
        if (aniRes && aniRes.anime) {
          catalogData = aniRes.anime;
          characters = aniRes.characters || [];
          related = aniRes.related || [];
          jikanRecommendations = aniRes.recommendations || [];
          aniPictures = aniRes.pictures || [];
          if (aniRes.sourceManga) {
            catalogData.sourceManga = aniRes.sourceManga;
          }
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
              candidates.map((c) => raceTimeout(scraper.searchAnime(c).catch(() => null), scraperSearchTimeout, null))
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
          raceTimeout(scraper.searchAnime(titleQuery).catch(() => null), scraperSearchTimeout, null),
          anilistService.getAnimeFullDetails(titleQuery).catch(() => null),
        ]);

        if (searchedId) animelekId = searchedId;
        if (aniRes && aniRes.anime) {
          catalogData = aniRes.anime;
          characters = aniRes.characters || [];
          related = aniRes.related || [];
          jikanRecommendations = aniRes.recommendations || [];
          aniPictures = aniRes.pictures || [];
          if (aniRes.sourceManga) {
            catalogData.sourceManga = aniRes.sourceManga;
          }
          if (!searchedId && (catalogData.title || catalogData.title_english)) {
            const retrySlug = await raceTimeout(
              scraper.searchAnime(catalogData.title || catalogData.title_english).catch(() => null),
              scraperSearchTimeout,
              null
            );
            if (retrySlug) animelekId = retrySlug;
          }
        }
      } else {
        // Direct slug from OkAnime / AnimeDar or recent episodes
        requestedSeasonNum = extractSeasonNumFromText(decodeURIComponent(id));
      }

      // 2. Scrape real Arabic series/episodes/seasons from OkAnime (#1) + AnimeDar (#2) with strict timeout
      let data: any = null;
      try {
        if (animelekId && animelekId !== "random" && !/^\d+$/.test(animelekId)) {
          data = await raceTimeout(
            scraper.getAnimeDetails(animelekId, requestedSeasonNum),
            scraperDetailsTimeout,
            null
          );
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
          if (aniRes.sourceManga) {
            catalogData.sourceManga = aniRes.sourceManga;
          }
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
        if (!data.title || data.title === "Anime") {
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
        if (catalogData.sourceManga) {
          data.sourceManga = catalogData.sourceManga;
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
        const resolvedKeyId = data._id && data._id !== "random" ? String(data._id) : id;
        if (resolvedKeyId && resolvedKeyId !== "random") {
          await serverCache.set(
            `anime-details-v8-${resolvedKeyId}`,
            data,
            12 * 60 * 60 * 1000,
          );
        }
        const requestParamId = req.params.id;
        if (requestParamId && requestParamId !== "random" && requestParamId !== resolvedKeyId) {
          await serverCache.set(
            `anime-details-v8-${requestParamId}`,
            data,
            12 * 60 * 60 * 1000,
          );
        }
        if (data.malId && String(data.malId) !== resolvedKeyId) {
          await serverCache.set(
            `anime-details-v8-${data.malId}`,
            data,
            12 * 60 * 60 * 1000,
          );
        }
      }

      res.json({ success: true, resolvedId: data?._id || id, data });
    } catch (error) {
      console.warn("API Warning details:", error);
      res.status(500).json({ success: false, message: "فشل في جلب التفاصيل." });
    }
  }),
);

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
    const bypass = req.query.bypass === "true";
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
      const cacheKey = `schedule_okanime_hybrid_v2_${day}`;
      if (!bypass) {
        const cached = await serverCache.get<any[]>(cacheKey);
        if (cached && Array.isArray(cached) && cached.length > 0) {
          return res.json({ success: true, data: cached });
        }
      } else {
        await serverCache.delete(cacheKey);
      }

      const weekMap = await scraper.getScheduleByDayMap(bypass).catch(() => ({} as Record<string, any[]>));
      let scheduleList: any[] =
        weekMap && Array.isArray(weekMap[day]) && weekMap[day].length > 0
          ? weekMap[day]
          : [];

      if (!scheduleList || scheduleList.length === 0) {
        scheduleList = await anilistService.getScheduleByDay(day).catch(() => []);
      }
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

