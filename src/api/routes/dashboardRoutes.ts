import { Router, Request, Response } from "express";
import { serverCache } from "../../services/cacheService";
import { anilistService } from "../../services/anilistService";
import { cleanAnimeTitle } from "../../utils/animeTitleCleaner";
import {
  getCuratedTop5,
  getCuratedRecentEpisodes,
  getCuratedSeasonAnime,
  getCuratedAnimeById,
} from "../../data/curatedAnimeDatabase";
import { IS_EXTERNAL_FETCH_DISABLED, scraper, handleAsync } from "../helpers/shared";
import { fetchWithTimeout, fetchJikan } from "../helpers/jikanClient";

const router = Router();
const dashboardBypassTimestamps = new Map<string, number>();
const DASHBOARD_BYPASS_COOLDOWN_MS = 60_000;

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
        movies: [],
        topAnime: getCuratedTop5(),
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
      const rawBypass = req.query.bypass === "true";
      const excludeRecent = req.query.excludeRecent === "1" || req.query.excludeRecent === "true";
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

      const cacheKey = `dashboard-v8-${currentDay}-${requestedSeason}-${requestedSliderMode}${excludeRecent ? "-norecent" : ""}`;
      const nowMs = Date.now();
      const lastBypassAt = dashboardBypassTimestamps.get(cacheKey) || 0;
      const bypass = rawBypass && nowMs - lastBypassAt >= DASHBOARD_BYPASS_COOLDOWN_MS;

      if (bypass) {
        dashboardBypassTimestamps.set(cacheKey, nowMs);
        await serverCache.delete(cacheKey);
        if (!excludeRecent) {
          await serverCache.delete("recent_episodes");
          await serverCache.delete("recent_episodes_okanime_primary_v1_page_1");
          await serverCache.delete("recent_episodes_animedar_isolated_v3_page_1");
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

      const [sliderListRaw, seasonListRaw, recentList, todayScheduleRaw, trendingTodayRaw, moviesResRaw, topAnimeResRaw] =
        await Promise.all([
          fetchWithTimeout(
            anilistService.getSliderByMode(requestedSliderMode, 15, targetSeasonParam, currentYear).catch(async () => {
              const r = await fetchJikan(seasonUrl).catch(() => ({ data: [] }));
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
          excludeRecent
            ? Promise.resolve([])
            : fetchWithTimeout(
                scraper.getRecentEpisodes(bypass).catch(() => []),
                bypass ? 7500 : 6500,
                []
              ),
          fetchWithTimeout(
            scraper.getScheduleByDayMap(bypass).then(async (weekMap) => {
              const matched = weekMap && Array.isArray(weekMap[currentDay]) ? weekMap[currentDay] : [];
              if (matched.length > 0) return matched;
              const ani = await anilistService.getScheduleByDay(currentDay).catch(() => []);
              if (ani && ani.length > 0) return ani;
              const r = await fetchJikan(`https://api.jikan.moe/v4/schedules?filter=${currentDay}&limit=20`).catch(() => ({ data: [] }));
              return r.data || [];
            }).catch(() => []),
            6000,
            []
          ),
          fetchWithTimeout(
            anilistService.getSliderByMode("trending_season", 20, targetSeasonParam, currentYear).catch(async () => {
              const r = await fetchJikan(seasonUrl).catch(() => ({ data: [] }));
              return r.data || [];
            }),
            3500,
            []
          ),
          fetchWithTimeout(
            scraper.getAnimeMovies(1, bypass).catch(() => ({ items: [], hasNext: false })),
            6000,
            { items: [], hasNext: false }
          ),
          fetchWithTimeout(
            scraper.getTopAnime(1, bypass).catch(() => ({ items: [], hasNext: false })),
            6000,
            { items: [], hasNext: false }
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
            bannerUrl: anime.bannerUrl || anime.bannerImage || "",
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
              bannerUrl: tAnime.bannerUrl || tAnime.bannerImage || "",
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

          const fallbackPoster =
            "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 420'%3E%3Crect width='300' height='420' fill='%2312131c'/%3E%3C/svg%3E";
          const posterUrl = item.imageUrl
            ? item.imageUrl.replace("-thumbnail.", "-poster.")
            : fallbackPoster;
          const thumbnailUrl = item.imageUrl || fallbackPoster;

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
            bannerUrl: anime.bannerUrl || anime.bannerImage || "",
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
          bannerUrl: anime.bannerUrl || anime.bannerImage || "",
          rating: anime.score || 0,
        }));

      const seenScheduleIds = new Set<string>();
      const schedule = (todayScheduleRaw || [])
        .filter((anime: any) => {
          const idKey = String(anime._id || anime.slug || anime.mal_id || anime.title || "").trim();
          if (idKey && !seenScheduleIds.has(idKey)) {
            seenScheduleIds.add(idKey);
            return true;
          }
          return false;
        })
        .map((anime: any) => ({
          _id: String(anime._id || anime.slug || anime.mal_id || ""),
          slug: anime.slug || undefined,
          mal_id: anime.mal_id || undefined,
          title: anime.title_english || anime.title,
          posterUrl:
            anime.posterUrl ||
            anime.imageUrl ||
            anime.images?.jpg?.large_image_url ||
            anime.images?.jpg?.image_url,
          rating: anime.rating || anime.score || 0,
          type: anime.type || "TV",
          episodes: anime.episodes || undefined,
          broadcast: anime.broadcast || undefined,
        }));

      const moviesList = (moviesResRaw?.items || []).slice(0, 18).map((item: any) => ({
        _id: String(item._id || item.slug || item.id || item.title),
        slug: item.slug || item.id,
        title: item.title,
        posterUrl: item.posterUrl || item.imageUrl,
        type: item.type || "فيلم",
        episodesCount: item.episodesCount || 1,
        rating: item.rating || null,
      }));

      const topAnimeList = (topAnimeResRaw?.items || []).slice(0, 18).map((item: any) => ({
        _id: String(item._id || item.slug || item.id || item.title),
        slug: item.slug || item.id,
        title: item.title,
        posterUrl: item.posterUrl || item.imageUrl,
        type: item.type || "مسلسل",
        episodesCount: item.episodesCount || undefined,
        rating: item.rating || null,
      }));

      // If recentEpisodes failed to scrape live, try stale real scraped cache before falling back
      let finalRecent = recentEpisodes;
      if (!excludeRecent && finalRecent.length === 0) {
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
        recentEpisodes: excludeRecent ? [] : finalRecent,
        popular: popular.length > 0 ? popular : getCuratedSeasonAnime(),
        currentSeason: currentSeason.length > 0 ? currentSeason : getCuratedSeasonAnime(),
        schedule: schedule.length > 0 ? schedule : getCuratedTop5(),
        movies: moviesList,
        topAnime: topAnimeList,
      };

      // Only cache for full window when live recentEpisodes succeeded (or excludeRecent is requested)
      if (!excludeRecent && finalRecent.length === 0) {
        setTimeout(() => {
          serverCache.delete(cacheKey).catch(() => {});
        }, 5000);
      }

      return resultPayload;
        },
        5 * 60 * 1000,
        30 * 60 * 1000,
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
        movies: [],
        topAnime: getCuratedTop5(),
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

export default router;
