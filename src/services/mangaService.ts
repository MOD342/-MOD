import * as cheerio from "cheerio";
import { serverCache } from "./cacheService";
import { cleanAnimeTitle } from "../utils/animeTitleCleaner";
import { GENRE_TAXONOMY, splitAniListGenresAndTags } from "../utils/genreTaxonomy";
import {
  needsArabicTranslation,
  smartQueryTranslator,
  translateGenresListToArabic,
  translateToArabic,
} from "../api/helpers/translation";

const ANILIST_ENDPOINT = "https://graphql.anilist.co";
const MANGADEX_API = "https://api.mangadex.org";
const inFlightManga = new Map<string, Promise<any>>();

function coalesceManga<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inFlightManga.get(key);
  if (existing) return existing as Promise<T>;
  const p = fn().finally(() => {
    inFlightManga.delete(key);
  });
  inFlightManga.set(key, p);
  return p;
}

export type MangaOriginFilter = "ALL" | "JP" | "KR" | "CN";

export interface MangaListItem {
  _id: string;
  anilistId: number;
  malId?: number | null;
  mangadexId?: string | null;
  mediaType: "manga";
  title: string;
  englishTitle?: string;
  romajiTitle?: string;
  nativeTitle?: string;
  synonyms?: string[];
  posterUrl: string;
  bannerUrl?: string;
  rating: number;
  status: string;
  countryOfOrigin: "JP" | "KR" | "CN" | string;
  mediaFormat: "manga" | "manhwa" | "manhua" | "oneshot";
  originLabel: string;
  defaultReadingMode: "webtoon" | "paged";
  genres: string[];
  chaptersCount?: number | null;
  volumesCount?: number | null;
  releaseYear?: number | null;
  latestChapterLabel?: string;
}

export interface MangaChapterItem {
  id: string;
  num: string;
  chapterNumber: number;
  volume?: string | null;
  title: string;
  language: "ar" | "en";
  languageLabel: string;
  pagesCount: number;
  publishAt: string;
  groupName?: string;
}

const GENRE_AR_TO_EN: Record<string, string> = {
  أكشن: "Action",
  مغامرات: "Adventure",
  كوميدي: "Comedy",
  دراما: "Drama",
  فانتازيا: "Fantasy",
  خيالي: "Fantasy",
  إيسيكاي: "Isekai",
  رعب: "Horror",
  غموض: "Mystery",
  نفسي: "Psychological",
  رومانسي: "Romance",
  "خيال علمي": "Sci-Fi",
  "شريحة من الحياة": "Slice of Life",
  رياضي: "Sports",
  خوارق: "Supernatural",
  "قوى خارقة": "Supernatural",
  إثارة: "Thriller",
  "إثارة وتشويق": "Thriller",
  ميكا: "Mecha",
  "ميكا (آليات)": "Mecha",
  آليات: "Mecha",
  موسيقى: "Music",
  إيتشي: "Ecchi",
  شونين: "Shounen",
  سينين: "Seinen",
  "فنون قتالية": "Martial Arts",
  تاريخي: "Historical",
  مدرسي: "School",
};

export const MANGA_GENRES_LIST = GENRE_TAXONOMY.map((g) => ({
  id: g.id,
  name: g.name,
  nameAr: g.nameAr,
}));

const CURATED_FALLBACK_MANGA: MangaListItem[] = [
  {
    _id: "105398",
    anilistId: 105398,
    malId: 121496,
    mediaType: "manga",
    title: "Solo Leveling",
    englishTitle: "Solo Leveling",
    romajiTitle: "Na Honjaman Level Up",
    posterUrl: "https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx105398-b673Vt5ZSuz3.jpg",
    bannerUrl: "https://s4.anilist.co/file/anilistcdn/media/manga/banner/105398-4UrEUG1F5D6V.jpg",
    rating: 8.7,
    status: "مكتمل",
    countryOfOrigin: "KR",
    mediaFormat: "manhwa",
    originLabel: "مانهوا",
    defaultReadingMode: "webtoon",
    genres: ["أكشن", "مغامرات", "فانتازيا"],
    chaptersCount: 200,
    releaseYear: 2018,
  },
  {
    _id: "30002",
    anilistId: 30002,
    malId: 2,
    mediaType: "manga",
    title: "Berserk",
    englishTitle: "Berserk",
    romajiTitle: "Berserk",
    posterUrl: "https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx30002-7EzO7o21jzeF.jpg",
    bannerUrl: "https://s4.anilist.co/file/anilistcdn/media/manga/banner/30002-75M7wJ922Q28.jpg",
    rating: 9.3,
    status: "مستمر",
    countryOfOrigin: "JP",
    mediaFormat: "manga",
    originLabel: "مانجا",
    defaultReadingMode: "paged",
    genres: ["أكشن", "مغامرات", "دراما", "فانتازيا", "رعب"],
    chaptersCount: null,
    releaseYear: 1989,
  },
  {
    _id: "119257",
    anilistId: 119257,
    malId: 132214,
    mediaType: "manga",
    title: "Omniscient Reader's Viewpoint",
    englishTitle: "Omniscient Reader",
    romajiTitle: "Jeonjijeok Dokja Sijeom",
    posterUrl: "https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx119257-K66b51o8b4z9.jpg",
    bannerUrl: "https://s4.anilist.co/file/anilistcdn/media/manga/banner/119257-6N9c2R6f8T9Z.jpg",
    rating: 8.8,
    status: "مستمر",
    countryOfOrigin: "KR",
    mediaFormat: "manhwa",
    originLabel: "مانهوا",
    defaultReadingMode: "webtoon",
    genres: ["أكشن", "مغامرات", "فانتازيا"],
    chaptersCount: null,
    releaseYear: 2020,
  },
  {
    _id: "30013",
    anilistId: 30013,
    malId: 13,
    mediaType: "manga",
    title: "One Piece",
    englishTitle: "One Piece",
    romajiTitle: "ONE PIECE",
    posterUrl: "https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx30013-ulXvn0SmokeH.png",
    bannerUrl: "https://s4.anilist.co/file/anilistcdn/media/manga/banner/30013-bN30x19d1y2G.jpg",
    rating: 9.1,
    status: "مستمر",
    countryOfOrigin: "JP",
    mediaFormat: "manga",
    originLabel: "مانجا",
    defaultReadingMode: "paged",
    genres: ["أكشن", "مغامرات", "كوميدي", "فانتازيا"],
    chaptersCount: null,
    releaseYear: 1997,
  },
  {
    _id: "105778",
    anilistId: 105778,
    malId: 116778,
    mediaType: "manga",
    title: "Chainsaw Man",
    englishTitle: "Chainsaw Man",
    romajiTitle: "Chainsaw Man",
    posterUrl: "https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx105778-74YTFQggquDo.png",
    bannerUrl: "https://s4.anilist.co/file/anilistcdn/media/manga/banner/105778-8E7kM28n1L7L.jpg",
    rating: 8.6,
    status: "مستمر",
    countryOfOrigin: "JP",
    mediaFormat: "manga",
    originLabel: "مانجا",
    defaultReadingMode: "paged",
    genres: ["أكشن", "رعب", "خوارق"],
    chaptersCount: null,
    releaseYear: 2018,
  },
  {
    _id: "115644",
    anilistId: 115644,
    malId: 121942,
    mediaType: "manga",
    title: "The Beginning After The End",
    englishTitle: "The Beginning After The End",
    romajiTitle: "TBATE",
    posterUrl: "https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx115644-29d7S4jS6x7h.jpg",
    bannerUrl: "",
    rating: 8.5,
    status: "مستمر",
    countryOfOrigin: "KR",
    mediaFormat: "manhwa",
    originLabel: "مانهوا",
    defaultReadingMode: "webtoon",
    genres: ["أكشن", "مغامرات", "فانتازيا"],
    chaptersCount: null,
    releaseYear: 2018,
  },
];

const MANGA_MEDIA_FRAGMENT = `
  id
  idMal
  countryOfOrigin
  format
  status
  chapters
  volumes
  averageScore
  meanScore
  genres
  isAdult
  tags {
    name
  }
  startDate {
    year
    month
    day
  }
  title {
    romaji
    english
    native
  }
  synonyms
  coverImage {
    extraLarge
    large
  }
  bannerImage
  description(asHtml: false)
`;

function normalizeMangaStatus(statusRaw?: string): string {
  const s = String(statusRaw || "").toUpperCase().trim();
  if (s === "FINISHED") return "مكتمل";
  if (s === "RELEASING") return "مستمر";
  if (s === "HIATUS") return "متوقف مؤقتاً";
  if (s === "CANCELLED") return "ملغي";
  if (s === "NOT_YET_RELEASED") return "قادم";
  return "مستمر";
}

function getOriginMeta(countryRaw?: string, formatRaw?: string, tags?: any[]): {
  countryOfOrigin: "JP" | "KR" | "CN";
  mediaFormat: "manga" | "manhwa" | "manhua" | "oneshot";
  originLabel: string;
  defaultReadingMode: "webtoon" | "paged";
} {
  const c = String(countryRaw || "JP").toUpperCase();
  const fmt = String(formatRaw || "").toUpperCase();
  const hasWebtoonTag = Array.isArray(tags)
    ? tags.some((t) => /webtoon|long strip|full color/i.test(String(t?.name || t || "")))
    : false;

  if (c === "KR") {
    return {
      countryOfOrigin: "KR",
      mediaFormat: "manhwa",
      originLabel: "مانهوا",
      defaultReadingMode: "webtoon",
    };
  }
  if (c === "CN" || c === "TW") {
    return {
      countryOfOrigin: "CN",
      mediaFormat: "manhua",
      originLabel: "مانها",
      defaultReadingMode: "webtoon",
    };
  }
  return {
    countryOfOrigin: "JP",
    mediaFormat: fmt === "ONE_SHOT" ? "oneshot" : "manga",
    originLabel: fmt === "ONE_SHOT" ? "ون شوت" : "مانجا",
    defaultReadingMode: hasWebtoonTag ? "webtoon" : "paged",
  };
}

function mapAniListMangaItem(media: any): MangaListItem | null {
  if (!media || media.isAdult) return null;
  const aniId = Number(media.id);
  if (!aniId) return null;

  const rawTitle = media.title?.english || media.title?.romaji || media.title?.native || "Manga";
  const score = media.averageScore
    ? Number((media.averageScore / 10).toFixed(1))
    : media.meanScore
      ? Number((media.meanScore / 10).toFixed(1))
      : 8.0;

  const meta = getOriginMeta(media.countryOfOrigin, media.format, media.tags);

  const synonyms = Array.isArray(media.synonyms)
    ? media.synonyms
        .map((s: any) => String(s || "").trim())
        .filter((s: string) => s.length >= 2 && s.length <= 120)
        .slice(0, 8)
    : [];

  return {
    _id: String(aniId),
    anilistId: aniId,
    malId: media.idMal || null,
    mediaType: "manga",
    title: cleanAnimeTitle(rawTitle) || rawTitle,
    englishTitle: media.title?.english || rawTitle,
    romajiTitle: media.title?.romaji || "",
    nativeTitle: media.title?.native || "",
    synonyms,
    posterUrl: media.coverImage?.extraLarge || media.coverImage?.large || "",
    bannerUrl: media.bannerImage || "",
    rating: score,
    status: normalizeMangaStatus(media.status),
    countryOfOrigin: meta.countryOfOrigin,
    mediaFormat: meta.mediaFormat,
    originLabel: meta.originLabel,
    defaultReadingMode: meta.defaultReadingMode,
    genres: translateGenresListToArabic(media.genres || []).slice(0, 6),
    chaptersCount: typeof media.chapters === "number" ? media.chapters : null,
    volumesCount: typeof media.volumes === "number" ? media.volumes : null,
    releaseYear: media.startDate?.year || null,
  };
}

async function queryAniListManga(query: string, variables: Record<string, any> = {}, ttlMs = 45 * 60 * 1000): Promise<any> {
  const cacheKey = `anilist_manga_v1_${Buffer.from(JSON.stringify({ q: query.slice(0, 90), v: variables })).toString("base64")}`;
  const cached = await serverCache.get<any>(cacheKey, false);
  if (cached !== null) return cached;

  return coalesceManga(cacheKey, async () => {

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(ANILIST_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/125.0.0.0",
        },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(5500),
      });
      if (res.status === 429) {
        await new Promise((r) => setTimeout(r, 900 * attempt));
        continue;
      }
      if (!res.ok) throw new Error(`AniList HTTP ${res.status}`);
      const json = await res.json();
      if (json?.data) {
        await serverCache.set(cacheKey, json.data, ttlMs);
        return json.data;
      }
    } catch (err) {
      if (attempt === 2) {
        const stale = await serverCache.get<any>(cacheKey, true);
        if (stale !== null) return stale;
        throw err;
      }
      await new Promise((r) => setTimeout(r, 350));
    }
  }
  return null;
  });
}

export function buildImageProxyUrl(rawUrl: string): string {
  if (!rawUrl) return "";
  if (rawUrl.startsWith("/api/manga/image-proxy")) return rawUrl;
  return `/api/manga/image-proxy?url=${encodeURIComponent(rawUrl)}`;
}

async function fetchJsonSafe(url: string, timeoutMs = 6500): Promise<any> {
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "AnimeModReader/1.0",
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} from ${url}`);
  }
  const text = await res.text();
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    throw new Error(`Non-JSON response from ${url}`);
  }
  return JSON.parse(trimmed);
}

function normalizeTitleKey(str: string): string {
  return String(str || "")
    .toLowerCase()
    .replace(/['’"`.,:;!?()[\]{}\-–—_/\\]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export const mangaService = {
  async getHub(origin: MangaOriginFilter = "ALL", page = 1) {
    const cacheKey = `manga_hub_v2_${origin}_p${page}`;
    const cached = await serverCache.get<any>(cacheKey, false);
    if (cached) return cached;

    return coalesceManga(cacheKey, async () => {
    try {
      const countryVar = origin !== "ALL" ? origin : undefined;
      const gql = `
        query ($page: Int, $country: CountryCode) {
          trending: Page(page: 1, perPage: 16) {
            media(
              type: MANGA,
              format_in: [MANGA, ONE_SHOT],
              countryOfOrigin: $country,
              sort: [TRENDING_DESC, POPULARITY_DESC],
              isAdult: false
            ) {
              ${MANGA_MEDIA_FRAGMENT}
            }
          }
          latest: Page(page: $page, perPage: 24) {
            pageInfo {
              hasNextPage
              currentPage
            }
            media(
              type: MANGA,
              format_in: [MANGA, ONE_SHOT],
              countryOfOrigin: $country,
              status_in: [RELEASING, FINISHED],
              popularity_greater: 5000,
              sort: [UPDATED_AT_DESC, POPULARITY_DESC],
              isAdult: false
            ) {
              ${MANGA_MEDIA_FRAGMENT}
            }
          }
          topRated: Page(page: 1, perPage: 16) {
            media(
              type: MANGA,
              format_in: [MANGA, ONE_SHOT],
              countryOfOrigin: $country,
              sort: [SCORE_DESC, POPULARITY_DESC],
              isAdult: false
            ) {
              ${MANGA_MEDIA_FRAGMENT}
            }
          }
        }
      `;

      const data = await queryAniListManga(gql, { page, country: countryVar }, 20 * 60 * 1000);
      const trending = (data?.trending?.media || []).map(mapAniListMangaItem).filter(Boolean);
      const latest = (data?.latest?.media || []).map(mapAniListMangaItem).filter(Boolean);
      const topRated = (data?.topRated?.media || []).map(mapAniListMangaItem).filter(Boolean);

      const payload = {
        trending,
        latest,
        topRated,
        hasNextPage: Boolean(data?.latest?.pageInfo?.hasNextPage),
        currentPage: Number(data?.latest?.pageInfo?.currentPage || page),
      };

      if (trending.length > 0 || latest.length > 0) {
        await serverCache.set(cacheKey, payload, 45 * 60 * 1000);
        return payload;
      }
    } catch (err: any) {
      console.warn("[MangaHub] AniList fetch fallback triggered:", err?.message || err);
    }

    const filteredFallback =
      origin === "ALL"
        ? CURATED_FALLBACK_MANGA
        : CURATED_FALLBACK_MANGA.filter((m) => m.countryOfOrigin === origin);

    return {
      trending: filteredFallback,
      latest: filteredFallback,
      topRated: filteredFallback,
      hasNextPage: false,
      currentPage: 1,
    };
    });
  },

  async searchManga(params: {
    q?: string;
    origin?: MangaOriginFilter;
    genres?: string[];
    status?: string;
    minScore?: number;
    year?: number;
    orderBy?: string;
    sort?: string;
    page?: number;
  }) {
    const page = Math.max(1, Number(params.page) || 1);
    const origin = (params.origin || "ALL").toUpperCase() as MangaOriginFilter;
    const rawQuery = (params.q || "").trim();
    const translatedQuery = rawQuery ? await smartQueryTranslator(rawQuery) : "";

    let sortVal = "POPULARITY_DESC";
    const isAsc = params.sort === "asc";
    if (params.orderBy === "score") sortVal = isAsc ? "SCORE" : "SCORE_DESC";
    else if (params.orderBy === "title") sortVal = isAsc ? "TITLE_ENGLISH" : "TITLE_ENGLISH_DESC";
    else if (params.orderBy === "start_date") sortVal = isAsc ? "START_DATE" : "START_DATE_DESC";
    else if (params.orderBy === "trending") sortVal = "TRENDING_DESC";
    else if (params.orderBy === "updated_at") sortVal = "UPDATED_AT_DESC";
    else if (params.orderBy === "popularity") sortVal = isAsc ? "POPULARITY" : "POPULARITY_DESC";

    const stLower = String(params.status || "").trim().toLowerCase();
    let statusVal: string | undefined;
    if (stLower === "releasing" || stLower === "airing") statusVal = "RELEASING";
    else if (stLower === "finished" || stLower === "complete") statusVal = "FINISHED";
    else if (stLower === "hiatus") statusVal = "HIATUS";

    const rawGenres = (params.genres || [])
      .map((g) => GENRE_AR_TO_EN[g.trim()] || g.trim())
      .filter(Boolean);
    const splitGenres = splitAniListGenresAndTags(rawGenres);

    const variables: Record<string, any> = {
      page,
      perPage: 24,
      sort: [sortVal],
    };
    if (translatedQuery) variables.search = translatedQuery;
    if (origin !== "ALL") variables.country = origin;
    if (splitGenres.genreIn.length > 0) variables.genre_in = splitGenres.genreIn;
    if (splitGenres.tagIn.length > 0) variables.tag_in = splitGenres.tagIn;
    if (statusVal) variables.status = statusVal;
    if (params.minScore && params.minScore > 0) {
      variables.averageScore_greater = Math.round(params.minScore * 10);
    }
    if (params.year && !isNaN(Number(params.year)) && Number(params.year) > 1950) {
      const y = Number(params.year);
      variables.startDate_greater = y * 10000;
      variables.startDate_lesser = (y + 1) * 10000;
    }

    const gql = `
      query (
        $page: Int,
        $perPage: Int,
        $search: String,
        $country: CountryCode,
        $genre_in: [String],
        $tag_in: [String],
        $status: MediaStatus,
        $averageScore_greater: Int,
        $startDate_greater: FuzzyDateInt,
        $startDate_lesser: FuzzyDateInt,
        $sort: [MediaSort]
      ) {
        Page(page: $page, perPage: $perPage) {
          pageInfo {
            hasNextPage
            currentPage
          }
          media(
            type: MANGA,
            format_in: [MANGA, ONE_SHOT],
            search: $search,
            countryOfOrigin: $country,
            genre_in: $genre_in,
            tag_in: $tag_in,
            status: $status,
            averageScore_greater: $averageScore_greater,
            startDate_greater: $startDate_greater,
            startDate_lesser: $startDate_lesser,
            sort: $sort,
            isAdult: false
          ) {
            ${MANGA_MEDIA_FRAGMENT}
          }
        }
      }
    `;

    try {
      const data = await queryAniListManga(gql, variables, 20 * 60 * 1000);
      const mapped = (data?.Page?.media || []).map(mapAniListMangaItem).filter(Boolean);
      return {
        data: mapped,
        pagination: {
          has_next_page: Boolean(data?.Page?.pageInfo?.hasNextPage),
          current_page: Number(data?.Page?.pageInfo?.currentPage || page),
        },
      };
    } catch (err: any) {
      console.warn("[MangaSearch] Error:", err?.message || err);
      const qLower = (translatedQuery || rawQuery).toLowerCase();
      const filtered = CURATED_FALLBACK_MANGA.filter((m) => {
        if (origin !== "ALL" && m.countryOfOrigin !== origin) return false;
        if (params.year && m.releaseYear && Number(m.releaseYear) !== Number(params.year)) return false;
        if (qLower && !`${m.title} ${m.englishTitle || ""} ${m.romajiTitle || ""}`.toLowerCase().includes(qLower)) {
          return false;
        }
        return true;
      });
      return {
        data: filtered,
        pagination: { has_next_page: false, current_page: 1 },
      };
    }
  },

  async resolveMangaDexUuid(
    titles: string[],
    anilistId?: number | string | null,
    releaseYear?: number | string | null,
  ): Promise<string | null> {
    const cleanTitles = Array.from(
      new Set(titles.map((t) => cleanAnimeTitle(String(t || "")).trim()).filter((t) => t.length >= 2)),
    );
    if (cleanTitles.length === 0) return null;

    const cacheKey = `md_uuid_v2_${anilistId || normalizeTitleKey(cleanTitles[0])}`;
    const cached = await serverCache.get<string>(cacheKey, false);
    if (cached) return cached === "NONE" ? null : cached;

    return coalesceManga(cacheKey, async () => {
    const variantEditionRegex =
      /\(\s*(?:official\s+)?colored\s*\)|digital\s+colored|fan\s+colored|\bcolored\b|\bdoujinshi\b|\banthology\b|\bspin[\s-]?off\b|\bside\s+stor(?:y|ies)\b|\bgaiden\b|\bspecial\s+one[\s-]?shot\b/i;
    const requestWantsVariant = cleanTitles.some((t) => variantEditionRegex.test(t));
    const targetKeys = cleanTitles.map(normalizeTitleKey).filter(Boolean);
    const targetYearNum = releaseYear ? Number(releaseYear) : 0;

    let globalBest: { id: string; score: number } | null = null;

    for (const qTitle of cleanTitles.slice(0, 3)) {
      try {
        const url = `${MANGADEX_API}/manga?title=${encodeURIComponent(qTitle)}&limit=12&order[relevance]=desc&contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica`;
        const json = await fetchJsonSafe(url, 6500);
        const list: any[] = Array.isArray(json?.data) ? json.data : [];
        if (list.length === 0) continue;

        const scored = list
          .map((m) => {
            const primaryPool: string[] = [];
            const titleObj = m?.attributes?.title || {};
            Object.values(titleObj).forEach((v) => v && primaryPool.push(String(v)));

            const altPool: string[] = [];
            const altArr = Array.isArray(m?.attributes?.altTitles) ? m.attributes.altTitles : [];
            altArr.forEach((obj: any) =>
              Object.values(obj || {}).forEach((v) => v && altPool.push(String(v))),
            );

            const normPrimary = primaryPool.map(normalizeTitleKey).filter(Boolean);
            const normAlt = altPool.map(normalizeTitleKey).filter(Boolean);
            const normPool = [...normPrimary, ...normAlt];

            let score = 0;
            for (const tk of targetKeys) {
              if (normPrimary.includes(tk)) score = Math.max(score, 115);
              else if (normPool.includes(tk)) score = Math.max(score, 95);
              else if (normPool.some((np) => np.includes(tk) || tk.includes(np))) score = Math.max(score, 60);
            }

            const isPrimaryVariant = primaryPool.some((pt) => variantEditionRegex.test(pt));
            const matchesAl = Boolean(anilistId && String(m?.attributes?.links?.al || "") === String(anilistId));

            // MangaDex sometimes puts the AniList ID on the "(Official Colored)" entry instead of the main manga
            if (matchesAl) {
              score += isPrimaryVariant && !requestWantsVariant ? 20 : 110;
            }
            if (isPrimaryVariant && !requestWantsVariant) {
              score -= 95;
            }

            const mdYear = Number(m?.attributes?.year || 0);
            if (targetYearNum > 1950 && mdYear > 1950 && Math.abs(mdYear - targetYearNum) <= 1) {
              score += 18;
            }

            const langs: string[] = Array.isArray(m?.attributes?.availableTranslatedLanguages)
              ? m.attributes.availableTranslatedLanguages
              : [];
            if (langs.includes("ar")) score += 15;
            else if (langs.includes("en")) score += 5;

            return { id: m.id, score };
          })
          .sort((a, b) => b.score - a.score);

        if (scored[0] && (!globalBest || scored[0].score > globalBest.score)) {
          globalBest = scored[0];
        }
        // Only stop searching extra titles if we found a confident non-variant match
        if (globalBest && globalBest.score >= 100) {
          break;
        }
      } catch (err) {
        console.warn(`[MangaDexResolve] error searching "${qTitle}":`, (err as any)?.message || err);
      }
    }

    if (globalBest && globalBest.score >= 45) {
      await serverCache.set(cacheKey, globalBest.id, 12 * 60 * 60 * 1000);
      return globalBest.id;
    }

    await serverCache.set(cacheKey, "NONE", 30 * 60 * 1000);
    return null;
    });
  },

  async getMangaDetails(idOrQuery: string, bypassCache = false) {
    const rawId = decodeURIComponent(String(idOrQuery || "").trim());
    if (!rawId) return null;

    const cacheKey = `manga_details_v4_${rawId}`;
    if (!bypassCache) {
      const cached = await serverCache.get<any>(cacheKey, false);
      if (cached) return cached;
    }

    return coalesceManga(`${cacheKey}${bypassCache ? ":force" : ""}`, async () => {

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawId);
    const isNumeric = /^\d+$/.test(rawId);

    const detailsFields = `
      ${MANGA_MEDIA_FRAGMENT}
      staff(sort: [RELEVANCE], page: 1, perPage: 10) {
        edges {
          role
          node {
            id
            name {
              full
            }
          }
        }
      }
      characters(sort: [ROLE, RELEVANCE], page: 1, perPage: 18) {
        edges {
          role
          node {
            id
            name {
              full
            }
            image {
              large
            }
          }
        }
      }
      relations {
        edges {
          relationType(version: 2)
          node {
            id
            idMal
            type
            format
            countryOfOrigin
            status
            episodes
            chapters
            averageScore
            title {
              english
              romaji
            }
            coverImage {
              large
              extraLarge
            }
            startDate {
              year
            }
            seasonYear
          }
        }
      }
      recommendations(sort: [RATING_DESC], perPage: 10) {
        nodes {
          mediaRecommendation {
            id
            idMal
            type
            format
            countryOfOrigin
            averageScore
            title {
              english
              romaji
            }
            coverImage {
              large
              extraLarge
            }
          }
        }
      }
    `;

    let media: any = null;
    try {
      if (isNumeric) {
        const num = Number(rawId);
        const qById = `query ($id: Int) { Media(id: $id, type: MANGA) { ${detailsFields} } }`;
        const d1 = await queryAniListManga(qById, { id: num }, 6 * 60 * 60 * 1000).catch(() => null);
        if (d1?.Media) media = d1.Media;

        if (!media) {
          const qByMal = `query ($idMal: Int) { Media(idMal: $idMal, type: MANGA) { ${detailsFields} } }`;
          const d2 = await queryAniListManga(qByMal, { idMal: num }, 6 * 60 * 60 * 1000).catch(() => null);
          if (d2?.Media) media = d2.Media;
        }
      } else if (!isUuid) {
        const queryTitle = cleanAnimeTitle(rawId.replace(/^search-/, ""));
        const qSearch = `query ($search: String) { Media(search: $search, type: MANGA, isAdult: false) { ${detailsFields} } }`;
        const d3 = await queryAniListManga(qSearch, { search: queryTitle }, 6 * 60 * 60 * 1000).catch(() => null);
        if (d3?.Media) media = d3.Media;
      }
    } catch (err) {
      console.warn("[MangaDetails] AniList query error:", (err as any)?.message || err);
    }

    // Fallback when navigated directly with a MangaDex UUID
    if (!media && isUuid) {
      try {
        const mdRes = await fetchJsonSafe(
          `${MANGADEX_API}/manga/${rawId}?includes[]=cover_art&includes[]=author&includes[]=artist`,
        );
        const m = mdRes?.data;
        if (m) {
          const alId = m?.attributes?.links?.al;
          if (alId && /^\d+$/.test(String(alId))) {
            return this.getMangaDetails(String(alId));
          }
          const titleObj = m?.attributes?.title || {};
          const title = titleObj.en || titleObj["ja-ro"] || Object.values(titleObj)[0] || "Manga";
          const coverRel = (m?.relationships || []).find((r: any) => r.type === "cover_art");
          const fileName = coverRel?.attributes?.fileName;
          const posterUrl = fileName
            ? buildImageProxyUrl(`https://uploads.mangadex.org/covers/${m.id}/${fileName}.512.jpg`)
            : "";
          const rawDesc = m?.attributes?.description?.ar || m?.attributes?.description?.en || "";
          const translatedDesc = rawDesc
            ? /[\u0600-\u06FF]/.test(rawDesc)
              ? rawDesc
              : await translateToArabic(rawDesc).catch(() => rawDesc)
            : "لا توجد قصة متاحة.";
          const langCode = String(m?.attributes?.originalLanguage || "ja").toLowerCase();
          const originCode = langCode === "ko" ? "KR" : langCode === "zh" || langCode === "zh-hk" ? "CN" : "JP";
          const meta = getOriginMeta(originCode, "MANGA");

          const detailPayload = {
            _id: m.id,
            anilistId: 0,
            malId: null,
            mangadexId: m.id,
            mediaType: "manga",
            title: String(title),
            englishTitle: String(title),
            romajiTitle: "",
            posterUrl,
            bannerUrl: "",
            description: translatedDesc,
            rating: 8.2,
            status: normalizeMangaStatus(m?.attributes?.status),
            countryOfOrigin: meta.countryOfOrigin,
            mediaFormat: meta.mediaFormat,
            originLabel: meta.originLabel,
            defaultReadingMode: meta.defaultReadingMode,
            genres: ["أكشن", "فانتازيا"],
            authors: [],
            characters: [],
            related: [],
            recommendations: [],
            adaptedAnime: null,
            chaptersCount: null,
            releaseYear: m?.attributes?.year || null,
          };
          await serverCache.set(cacheKey, detailPayload, 6 * 60 * 60 * 1000);
          return detailPayload;
        }
      } catch {}
    }

    if (!media) {
      const fb = CURATED_FALLBACK_MANGA.find((m) => m._id === rawId || String(m.malId) === rawId);
      if (!fb) return null;
      return {
        ...fb,
        description: "عمل شهير متوفر للقراءة باللغة العربية والإنجليزية داخل المنصة.",
        authors: [],
        characters: [],
        related: [],
        recommendations: [],
        adaptedAnime: null,
      };
    }

    const mapped = mapAniListMangaItem(media)!;
    let description = String(media.description || "")
      .replace(/<[^>]*>/g, " ")
      .replace(/\(Source:.*?\)/gi, "")
      .replace(/\s+/g, " ")
      .trim();

    if (description && needsArabicTranslation(description)) {
      description = await Promise.race([
        translateToArabic(description).catch(() => description),
        new Promise<string>((r) => setTimeout(() => r(description), 4500)),
      ]);
    }

    const authors = (media.staff?.edges || [])
      .filter((e: any) => /story|art|author|original creator/i.test(String(e?.role || "")))
      .slice(0, 4)
      .map((e: any) => ({
        name: e?.node?.name?.full || "",
        role: /art/i.test(String(e?.role || ""))
          ? "رسام"
          : /story/i.test(String(e?.role || ""))
            ? "مؤلف"
            : "القصة والرسم",
      }))
      .filter((a: any) => a.name);

    const characters = (media.characters?.edges || []).map((e: any) => ({
      id: e?.node?.id,
      name: e?.node?.name?.full || "Character",
      role: e?.role === "MAIN" ? "رئيسي" : "مساند",
      imageUrl: e?.node?.image?.large || "",
    }));

    let adaptedAnime: any = null;
    const related: any[] = [];
    const seenRel = new Set<number>();

    (media.relations?.edges || []).forEach((edge: any) => {
      const node = edge?.node;
      if (!node) return;
      const relType = String(edge?.relationType || "").toUpperCase();
      if (node.type === "ANIME" && !adaptedAnime && (relType === "ADAPTATION" || relType === "SOURCE")) {
        adaptedAnime = {
          id: String(node.idMal || node.id),
          title: node.title?.english || node.title?.romaji || "Anime",
          posterUrl: node.coverImage?.extraLarge || node.coverImage?.large || "",
          format: node.format || "TV",
          episodes: node.episodes || null,
          year: node.seasonYear || null,
        };
      } else if (node.type === "MANGA" && relType !== "CHARACTER") {
        const rid = Number(node.id);
        if (!rid || seenRel.has(rid)) return;
        seenRel.add(rid);
        const rMeta = getOriginMeta(node.countryOfOrigin, node.format);
        related.push({
          id: String(rid),
          title: node.title?.english || node.title?.romaji || "Manga",
          posterUrl: node.coverImage?.extraLarge || node.coverImage?.large || "",
          originLabel: rMeta.originLabel,
          relation:
            relType === "SEQUEL"
              ? "تكملة"
              : relType === "PREQUEL"
                ? "قصة سابقة"
                : relType === "SPIN_OFF"
                  ? "عمل فرعي"
                  : relType === "SIDE_STORY"
                    ? "قصة جانبية"
                    : "عمل مرتبط",
          year: node.startDate?.year || null,
        });
      }
    });

    const recommendations = (media.recommendations?.nodes || [])
      .map((n: any) => n?.mediaRecommendation)
      .filter((r: any) => r && r.type === "MANGA")
      .map((rec: any) => {
        const meta = getOriginMeta(rec.countryOfOrigin, rec.format);
        return {
          _id: String(rec.id),
          title: rec.title?.english || rec.title?.romaji || "Manga",
          posterUrl: rec.coverImage?.extraLarge || rec.coverImage?.large || "",
          rating: rec.averageScore ? Number((rec.averageScore / 10).toFixed(1)) : 8.0,
          originLabel: meta.originLabel,
        };
      });

    // Resolve MangaDex UUID in background / fast race so details load quickly
    const mdSearchPool = [
      mapped.englishTitle || "",
      mapped.romajiTitle || "",
      mapped.title,
      ...(mapped.synonyms || []).filter((s: string) => /[a-zA-Z]{3,}/.test(s)).slice(0, 2),
    ].filter(Boolean);

    const mangadexId = await Promise.race([
      this.resolveMangaDexUuid(mdSearchPool, mapped.anilistId, mapped.releaseYear).catch(() => null),
      new Promise<null>((r) => setTimeout(() => r(null), 2600)),
    ]);

    const result = {
      ...mapped,
      mangadexId,
      description: description || "لا توجد قصة متاحة لهذا العمل حالياً.",
      authors,
      characters,
      related,
      recommendations,
      adaptedAnime,
    };

    await serverCache.set(cacheKey, result, 6 * 60 * 60 * 1000);
    return result;
    });
  },

  async getMangaChapters(params: {
    mangaId?: string;
    mangadexId?: string;
    title?: string;
    altTitle?: string;
    synonyms?: string[];
    bypassCache?: boolean;
  }): Promise<{ mangadexId: string | null; chapters: MangaChapterItem[] }> {
    let mdId = params.mangadexId?.trim() || null;
    const rawId = params.mangaId?.trim() || "";
    const bypassCache = params.bypassCache === true;
    if (!mdId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawId)) {
      mdId = rawId;
    }

    // Fast path: check numeric AniList chapter cache immediately before any upstream call
    if (!bypassCache && rawId && /^\d+$/.test(rawId)) {
      const fastCached = await serverCache.get<MangaChapterItem[]>(`manga_chapters_v9_al_${rawId}`, false);
      if (fastCached && fastCached.length > 0) {
        return { mangadexId: mdId, chapters: fastCached };
      }
    }

    const candidateSet = new Set<string>();
    const pushTitle = (t?: string) => {
      const s = String(t || "").trim();
      if (s.length >= 2) candidateSet.add(s);
    };

    pushTitle(params.title);
    pushTitle(params.altTitle);
    if (Array.isArray(params.synonyms)) {
      params.synonyms.forEach((s) => pushTitle(s));
    }

    let detailsYear: number | null = null;
    if (rawId && /^\d+$/.test(rawId)) {
      const cachedDetails = bypassCache ? null : await serverCache.get<any>(`manga_details_v4_${rawId}`, true);
      const details =
        cachedDetails ||
        (bypassCache || candidateSet.size < 3 || !mdId
          ? await this.getMangaDetails(rawId, bypassCache).catch(() => null)
          : null);
      if (details) {
        if (details.mangadexId) mdId = details.mangadexId;
        if (details.releaseYear) detailsYear = Number(details.releaseYear) || null;
        pushTitle(details.englishTitle || details.title);
        pushTitle(details.romajiTitle);
        if (Array.isArray(details.synonyms)) {
          details.synonyms.forEach((s: string) => pushTitle(s));
        }
      }
    }

    const candidateTitles = Array.from(candidateSet);

    if (!mdId && candidateTitles.length > 0) {
      mdId = await Promise.race([
        this.resolveMangaDexUuid(
          candidateTitles.filter((t) => /[a-zA-Z0-9]/.test(t)).slice(0, 3),
          /^\d+$/.test(rawId) ? rawId : null,
          detailsYear,
        ).catch(() => null),
        new Promise<null>((r) => setTimeout(() => r(null), 2600)),
      ]);
    }

    const keySuffix = rawId && /^\d+$/.test(rawId) ? `al_${rawId}` : (mdId || normalizeTitleKey(candidateTitles[0] || rawId));
    if (!keySuffix) {
      return { mangadexId: null, chapters: [] };
    }

    const cacheKey = `manga_chapters_v9_${keySuffix}`;
    if (!bypassCache) {
      const cached = await serverCache.get<MangaChapterItem[]>(cacheKey, false);
      if (cached && cached.length > 0) {
        return { mangadexId: mdId, chapters: cached };
      }
    }

    return coalesceManga(`${cacheKey}${bypassCache ? ":force" : ""}`, async () => {

    // Fetch MangaDex feed up to 5 batches (limit=500 -> up to 2,500 releases) keeping partial progress if deadline nears
    const fetchLangFeed = async (lang: "ar" | "en", maxBatches = 5): Promise<any[]> => {
      if (!mdId) return [];
      const collected: any[] = [];
      const deadlineAt = Date.now() + 10500;
      let total = 0;
      let fetchedCount = 0;

      for (let b = 0; b < maxBatches; b++) {
        const remaining = deadlineAt - Date.now();
        if (remaining < 1200) break;
        const offset = b * 500;
        const url = `${MANGADEX_API}/manga/${mdId}/feed?limit=500&offset=${offset}&translatedLanguage[]=${lang}&order[chapter]=desc&includes[]=scanlation_group&contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica`;
        const json = await fetchJsonSafe(url, Math.min(7000, remaining)).catch(() => null);
        const batch: any[] = Array.isArray(json?.data) ? json.data : [];
        if (typeof json?.total === "number" && json.total > 0) total = json.total;
        if (batch.length === 0) break;
        collected.push(...batch);
        fetchedCount += batch.length;
        if (batch.length < 500) break;
        if (total > 0 && offset + batch.length >= total) break;
      }

      // If descending feed hit the batch cap on a very long work and still didn't reach early chapters, fetch 1 ascending batch for chapters 1+
      if (total > fetchedCount && Date.now() < deadlineAt - 1500) {
        const readableNums = collected
          .filter((ch) => Number(ch?.attributes?.pages || 0) > 0 && !ch?.attributes?.externalUrl)
          .map((ch) => parseFloat(String(ch?.attributes?.chapter || "")))
          .filter((n) => Number.isFinite(n) && n >= 0);
        const minCollected = readableNums.length > 0 ? Math.min(...readableNums) : Infinity;
        if (minCollected > 3) {
          const ascUrl = `${MANGADEX_API}/manga/${mdId}/feed?limit=500&offset=0&translatedLanguage[]=${lang}&order[chapter]=asc&includes[]=scanlation_group&contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica`;
          const ascJson = await fetchJsonSafe(ascUrl, Math.min(6000, deadlineAt - Date.now())).catch(() => null);
          if (Array.isArray(ascJson?.data) && ascJson.data.length > 0) {
            const seenIds = new Set(collected.map((c) => c.id));
            for (const item of ascJson.data) {
              if (!seenIds.has(item.id)) collected.push(item);
            }
          }
        }
      }

      return collected;
    };

    const [arRaw, enRaw, arabicDirect] = await Promise.all([
      fetchLangFeed("ar", 5).catch(() => []),
      fetchLangFeed("en", 5).catch(() => []),
      candidateTitles.length > 0
        ? this.fetchArabicProviderChapters(candidateTitles, bypassCache).catch(() => [])
        : Promise.resolve([]),
    ]);

    const toCanonKey = (chStr: string, chNum: number, fallbackId: string): string => {
      if (Number.isFinite(chNum) && chStr) {
        return Number.isInteger(chNum) ? String(chNum) : String(parseFloat(chStr));
      }
      return chStr || fallbackId;
    };

    const byChapterKey = new Map<string, MangaChapterItem>();

    const ingest = (rawList: any[], lang: "ar" | "en") => {
      for (const ch of rawList) {
        const attr = ch?.attributes;
        if (!attr) continue;
        // Skip external-only chapters that have 0 readable images (e.g., MangaPlus redirects)
        const pagesCount = Number(attr.pages || 0);
        if (pagesCount <= 0 || attr.externalUrl) continue;

        const chStr = attr.chapter ? String(attr.chapter).trim() : "";
        const chNum = chStr ? parseFloat(chStr) : 0;
        if (Number.isNaN(chNum) && !chStr) continue;

        const dedupKey = toCanonKey(chStr, chNum, ch.id);
        const existing = byChapterKey.get(dedupKey);
        // Always prefer Arabic over English, or higher page count within same language
        if (existing) {
          if (existing.language === "ar" && lang !== "ar") continue;
          if (existing.language === lang && existing.pagesCount >= pagesCount) continue;
        }

        const groupRel = (ch?.relationships || []).find((r: any) => r.type === "scanlation_group");
        const chTitle = attr.title ? String(attr.title).trim() : "";

        byChapterKey.set(dedupKey, {
          id: ch.id,
          num: chStr || "0",
          chapterNumber: Number.isFinite(chNum) ? chNum : 0,
          volume: attr.volume || null,
          title: chTitle || `الفصل ${chStr || "الخاص"}`,
          language: lang,
          languageLabel: lang === "ar" ? "عربي" : "إنجليزي",
          pagesCount,
          publishAt: attr.publishAt || attr.readableAt || new Date().toISOString(),
          groupName: groupRel?.attributes?.name || undefined,
        });
      }
    };

    ingest(arRaw, "ar");
    // Merge direct Arabic provider chapters whenever missing or when replacing English chapters
    for (const ch of arabicDirect) {
      const dedupKey = toCanonKey(ch.num, ch.chapterNumber, ch.id);
      const existing = byChapterKey.get(dedupKey);
      if (!existing || existing.language !== "ar") {
        byChapterKey.set(dedupKey, ch);
      }
    }
    ingest(enRaw, "en");

    const chapters = Array.from(byChapterKey.values()).sort(
      (a, b) => b.chapterNumber - a.chapterNumber,
    );

    if (chapters.length > 0) {
      await serverCache.set(cacheKey, chapters, 30 * 60 * 1000);
    }

    return { mangadexId: mdId, chapters };
    });
  },

  async fetchArabicProviderChapters(titles: string[], bypassCache = false): Promise<MangaChapterItem[]> {
    const sequelTermsRegex = /\b(ragnarok|arise|sequel|after story|side story|spin off|gaiden|part\s*\d+|season\s*\d+|boruto|shippuden|zero)\b/i;
    const expanded: string[] = [];
    for (const raw of titles) {
      const cleaned = cleanAnimeTitle(String(raw || "")).trim();
      if (!cleaned || cleaned.length < 3) continue;
      // Skip non-Latin/non-Arabic scripts (Kana, Kanji, Hangul, Thai) that Arabic manga sites never index
      if (!/[a-zA-Z0-9\u0600-\u06FF]/.test(cleaned)) continue;
      expanded.push(cleaned);
      const colonParts = cleaned.split(/\s*[:–—]\s*/);
      const basePart = colonParts[0].trim();
      const subPart = colonParts.slice(1).join(" ").trim();
      if (
        basePart &&
        basePart.length >= 4 &&
        basePart !== cleaned &&
        !sequelTermsRegex.test(subPart)
      ) {
        expanded.push(basePart);
      }
      // Also push secondary Romaji/English title after colon (e.g. "Demon Slayer: Kimetsu no Yaiba" -> "Kimetsu no Yaiba")
      if (
        subPart &&
        subPart.length >= 5 &&
        subPart !== cleaned &&
        !sequelTermsRegex.test(subPart) &&
        !/^\d+$/.test(subPart)
      ) {
        expanded.push(subPart);
      }
    }

    const cleanTitles = Array.from(new Set(expanded)).slice(0, 6);
    if (cleanTitles.length === 0) return [];

    const normTargets = Array.from(new Set(cleanTitles.map(normalizeTitleKey).filter((k) => k.length >= 3)));
    if (normTargets.length === 0) return [];

    const cacheKey = `ar_chapters_v7_${normTargets.slice(0, 4).join("|")}`;
    if (!bypassCache) {
      const cached = await serverCache.get<MangaChapterItem[]>(cacheKey, false);
      if (cached && cached.length > 0) return cached;
    }

    return coalesceManga(`${cacheKey}${bypassCache ? ":force" : ""}`, async () => {

    const spinoffMarkers = [
      "ragnarok",
      "arise",
      "novel",
      "side story",
      "spin off",
      "doujinshi",
      "after story",
      "gaiden",
    ];

    const scoreTitleMatch = (candidateTitle: string, extraPenaltyTerms: string[] = []): number => {
      const cNorm = normalizeTitleKey(candidateTitle);
      if (!cNorm || cNorm.length < 3) return 0;
      const cWords = cNorm.split(" ").filter(Boolean);
      let best = 0;
      for (const tNorm of normTargets) {
        if (cNorm === tNorm) {
          best = Math.max(best, 120);
          continue;
        }
        const tWords = tNorm.split(" ").filter(Boolean);
        // Guard single-word titles like "Berserk" from matching unrelated multi-word titles like "Berserk of Gluttony"
        if (tWords.length === 1 && cWords.length >= 2 && cWords[0] === tWords[0]) {
          const rest = cWords.slice(1).join(" ");
          if (/^(manga|manhwa|manhua|colored|ar|en|\d+)$/i.test(rest)) {
            best = Math.max(best, 95);
          }
          continue;
        }
        const minLen = Math.min(cNorm.length, tNorm.length);
        const maxLen = Math.max(cNorm.length, tNorm.length);
        const lenRatio = minLen / Math.max(1, maxLen);

        if (minLen >= 5 && lenRatio >= 0.45 && (cNorm.startsWith(tNorm) || tNorm.startsWith(cNorm))) {
          const diff = Math.abs(cNorm.length - tNorm.length);
          const extraWords = Math.abs(cWords.length - tWords.length);
          best = Math.max(best, Math.max(45, 96 - diff - extraWords * 10));
        } else if (minLen >= 5 && lenRatio >= 0.5 && (cNorm.includes(tNorm) || tNorm.includes(cNorm))) {
          best = Math.max(best, 64);
        }
      }
      const penaltyTerms = [...spinoffMarkers, ...extraPenaltyTerms];
      for (const term of penaltyTerms) {
        const candHas = cNorm.includes(term);
        const targetHas = normTargets.some((t) => t.includes(term));
        if (candHas !== targetHas && (candHas || spinoffMarkers.includes(term))) {
          best -= 65;
        }
      }
      return best;
    };

    const browserHeaders = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0.0.0",
    };

    const providerDeadlineAt = Date.now() + 14500;

    const tryAzora = async (): Promise<{ score: number; items: MangaChapterItem[] }> => {
      const detectAzoraSeasonSplit = (
        postTitle: string,
      ): { baseNorm: string; seasonNum: number } | null => {
        const cNorm = normalizeTitleKey(postTitle);
        const m = cNorm.match(/^(.+?)\s+(?:s|season|part)\s*(\d{1,2})$/i);
        if (!m) return null;
        return { baseNorm: m[1].trim(), seasonNum: Number(m[2]) };
      };

      const targetHasSeasonMarker = normTargets.some((t) => /\b(?:s|season|part)\s*\d+\b/i.test(t));

      const searchAzoraPosts = async (
        qTitle: string,
      ): Promise<{ post: any; score: number; seasonNum?: number }[]> => {
        try {
          const qRes = await fetchJsonSafe(
            `https://azoramoon.com/api/query?searchTerm=${encodeURIComponent(qTitle)}&perPage=12`,
            5500,
          );
          const posts: any[] = Array.isArray(qRes?.posts) ? qRes.posts : [];
          const ranked = posts
            .filter((p) => {
              // Skip text-only web novels so they never masquerade as comic chapters
              if (String(p?.seriesType || "").toUpperCase() === "NOVEL") return false;
              const genreNames = Array.isArray(p?.genres)
                ? p.genres.map((g: any) => String(g?.name || "").trim().toLowerCase())
                : [];
              if (genreNames.some((g: string) => g === "رواية" || g === "روايات" || g === "novel")) {
                return false;
              }
              return true;
            })
            .map((p) => {
              const alts = [p.postTitle, ...(Array.isArray(p.alternativeTitles) ? p.alternativeTitles : [])].filter(Boolean);
              let maxScore = Math.max(0, ...alts.map((a) => scoreTitleMatch(String(a))));
              let seasonNum: number | undefined;

              if (!targetHasSeasonMarker) {
                for (const a of alts) {
                  const split = detectAzoraSeasonSplit(String(a));
                  if (split && normTargets.includes(split.baseNorm)) {
                    maxScore = Math.max(maxScore, 112);
                    seasonNum = split.seasonNum;
                  }
                }
              }

              return { post: p, score: maxScore, seasonNum };
            })
            .filter((x) => x.score >= 58)
            .sort((a, b) => b.score - a.score);
          return ranked;
        } catch {
          return [];
        }
      };

      const fetchAzoraChapters = async (bestPost: any): Promise<MangaChapterItem[]> => {
        if (!bestPost?.id || !bestPost?.slug) return [];
        const mapped: MangaChapterItem[] = [];
        const seenSlugs = new Set<string>();
        const take = 500;

        for (let skip = 0; skip < 2000; skip += take) {
          const remaining = providerDeadlineAt - Date.now();
          if (remaining < 1000) break;
          const chRes = await fetchJsonSafe(
            `https://azoramoon.com/api/chapters?postId=${bestPost.id}&take=${take}${skip > 0 ? `&skip=${skip}` : ""}`,
            Math.min(6000, remaining),
          ).catch(() => null);
          const rawChaps: any[] = Array.isArray(chRes?.post?.chapters) ? chRes.post.chapters : [];
          if (rawChaps.length === 0) break;

          for (const ch of rawChaps) {
            if (
              ch.isLocked ||
              ch.isAccessible === false ||
              ch.isPermanentlyLocked ||
              ch.isShortLinkLocked ||
              Number(ch.price || 0) > 0
            ) {
              continue;
            }
            const chSlug = String(ch.slug || "");
            if (seenSlugs.has(chSlug)) continue;
            seenSlugs.add(chSlug);
            const numVal = Number(ch.number);
            if (!Number.isFinite(numVal)) continue;
            const numStr = String(ch.number);
            mapped.push({
              id: `azora::${bestPost.slug}::${chSlug}`,
              num: numStr,
              chapterNumber: numVal,
              volume: null,
              title: ch.title ? String(ch.title).trim() : `الفصل ${numStr}`,
              language: "ar",
              languageLabel: "عربي",
              pagesCount: 20,
              publishAt: ch.createdAt || new Date().toISOString(),
            });
          }

          if (rawChaps.length < take) break;
        }
        return mapped;
      };

      const resolveFromRanked = async (
        ranked: { post: any; score: number; seasonNum?: number }[],
      ): Promise<{ score: number; items: MangaChapterItem[] } | null> => {
        if (ranked.length === 0) return null;

        // Detect split-season siblings (e.g. Tower of God S1, S2, S3)
        const seasonSiblings = ranked.filter(
          (r) => typeof r.seasonNum === "number" && r.score >= 100,
        );
        const uniqueSeasons = new Map<number, { post: any; score: number; seasonNum: number }>();
        for (const s of seasonSiblings) {
          if (s.seasonNum && !uniqueSeasons.has(s.seasonNum)) {
            uniqueSeasons.set(s.seasonNum, s as any);
          }
        }

        if (uniqueSeasons.size >= 2) {
          const orderedSeasons = Array.from(uniqueSeasons.values()).sort(
            (a, b) => a.seasonNum - b.seasonNum,
          );
          const fetchedAll = await Promise.all(
            orderedSeasons.map(async (entry) => ({
              seasonNum: entry.seasonNum,
              score: entry.score,
              items: await fetchAzoraChapters(entry.post),
            })),
          );
          const nonEmpty = fetchedAll.filter((x) => x.items.length > 0);
          if (nonEmpty.length > 0) {
            const combined: MangaChapterItem[] = [];
            let cumulativeOffset = 0;

            for (let idx = 0; idx < nonEmpty.length; idx++) {
              const seg = nonEmpty[idx];
              const sortedAsc = [...seg.items].sort((a, b) => a.chapterNumber - b.chapterNumber);
              const segMin = sortedAsc[0]?.chapterNumber ?? 0;
              const segMax = sortedAsc[sortedAsc.length - 1]?.chapterNumber ?? 0;

              // Reset-per-season numbering if later season restarts near 0/1 rather than continuing sequentially
              const resetsNumbering = idx > 0 && segMin <= 2 && cumulativeOffset > 5;
              const appliedOffset = resetsNumbering ? cumulativeOffset : 0;

              for (const ch of sortedAsc) {
                const rawNum = ch.chapterNumber;
                const mappedNum =
                  appliedOffset > 0
                    ? rawNum <= 0
                      ? appliedOffset + 0.5
                      : appliedOffset + rawNum
                    : rawNum;
                const mappedNumStr = Number.isInteger(mappedNum)
                  ? String(mappedNum)
                  : String(Number(mappedNum.toFixed(2)));
                combined.push({
                  ...ch,
                  num: mappedNumStr,
                  chapterNumber: mappedNum,
                  title: `الموسم ${seg.seasonNum} · ${ch.title || `الفصل ${ch.num}`}`,
                });
              }

              if (resetsNumbering || idx === 0) {
                cumulativeOffset = (appliedOffset > 0 ? appliedOffset : 0) + Math.max(Math.floor(segMax), sortedAsc.length);
              } else {
                cumulativeOffset = Math.max(cumulativeOffset, Math.floor(segMax));
              }
            }

            return { score: Math.max(...nonEmpty.map((s) => s.score)), items: combined };
          }
        }

        const primary = ranked[0];
        if (primary?.post) {
          const ch = await fetchAzoraChapters(primary.post);
          if (ch.length > 0) return { score: primary.score, items: ch };
        }
        return null;
      };

      // Stage 1: primary title alone (single fast request, avoids rate-limit bursts)
      const firstRanked = await searchAzoraPosts(cleanTitles[0]);
      const firstResolved = await resolveFromRanked(firstRanked);
      if (firstResolved) return firstResolved;

      // Stage 2: remaining synonyms in batches of 2
      for (let i = 1; i < cleanTitles.length; i += 2) {
        if (Date.now() > providerDeadlineAt - 1500) break;
        const batch = await Promise.all(cleanTitles.slice(i, i + 2).map(searchAzoraPosts));
        const mergedRanked = batch.flat().sort((a, b) => b.score - a.score);
        const resolved = await resolveFromRanked(mergedRanked);
        if (resolved) return resolved;
      }
      return { score: 0, items: [] };
    };

    const tryOlympus = async (): Promise<{ score: number; items: MangaChapterItem[] }> => {
      const searchOlympusSeries = async (qTitle: string): Promise<{ href: string; slug: string; score: number } | null> => {
        try {
          const cleanSearchQ = qTitle.replace(/[:'’"`]+/g, " ").replace(/\s+/g, " ").trim();
          const searchRes = await fetch(
            `https://olympustaff.com/ajax/search?keyword=${encodeURIComponent(cleanSearchQ)}`,
            {
              headers: browserHeaders,
              signal: AbortSignal.timeout(5500),
            },
          );
          if (!searchRes.ok) return null;
          const html = await searchRes.text();
          const $ = cheerio.load(html);
          const candidates: { href: string; slug: string; score: number }[] = [];
          $("a[href*='/series/']").each((_, el) => {
            const href = $(el).attr("href") || "";
            const m = href.match(/\/series\/([^/?#]+)\/?$/);
            if (!m) return;
            const slug = m[1];
            const fullCardText = $(el).text().replace(/\s+/g, " ").trim();
            if (/رواية/.test(fullCardText)) return;
            const txt =
              $(el).find("h4, h3, .font-bold, span").first().text().trim() ||
              fullCardText;
            const score = scoreTitleMatch(txt);
            if (score >= 58) candidates.push({ href, slug, score });
          });
          candidates.sort((a, b) => b.score - a.score);
          return candidates[0] || null;
        } catch {
          return null;
        }
      };

      const fetchOlympusChapters = async (chosen: { slug: string }): Promise<MangaChapterItem[]> => {
        const parsePage = async (
          pageNum: number,
          timeoutMs = 5500,
        ): Promise<{ items: MangaChapterItem[]; lockedNums: Set<string>; maxPage: number }> => {
          const url =
            pageNum === 1
              ? `https://olympustaff.com/series/${chosen.slug}`
              : `https://olympustaff.com/series/${chosen.slug}?page=${pageNum}`;
          const r = await fetch(url, {
            headers: browserHeaders,
            signal: AbortSignal.timeout(timeoutMs),
          });
          if (!r.ok) return { items: [], lockedNums: new Set(), maxPage: 1 };
          const pageHtml = await r.text();
          const $p = cheerio.load(pageHtml);
          let maxPage = 1;
          $p("a[href*='?page=']").each((_, el) => {
            const pm = ($p(el).attr("href") || "").match(/[?&]page=(\d+)/);
            if (pm) maxPage = Math.max(maxPage, Number(pm[1]));
          });

          // Skip early-access / VIP locked chapter cards (`href="#"`) and never trust `.inepcx` top promo links
          const lockedNums = new Set<string>();
          const items: MangaChapterItem[] = [];
          const seenOnPage = new Set<string>();

          const chapterCards = $p(".chapter-card");
          if (chapterCards.length > 0) {
            chapterCards.each((_, card) => {
              const link = $p(card).find("a.chapter-link, a").first();
              const href = (link.attr("href") || "").trim();
              const cardText = $p(card).text().replace(/\s+/g, " ").trim();
              const cm = href.match(/\/series\/[^/]+\/(\d+(?:\.\d+)?)\/?$/);
              if (!cm || href === "#") {
                const lockedMatch = cardText.match(/الفصل\s+(\d+(?:\.\d+)?)/) || cardText.match(/(\d+(?:\.\d+)?)/);
                if (lockedMatch) lockedNums.add(lockedMatch[1]);
                return;
              }
              const numStr = cm[1];
              const chNum = parseFloat(numStr);
              if (!Number.isFinite(chNum) || seenOnPage.has(numStr)) return;
              seenOnPage.add(numStr);
              items.push({
                id: `olympus::${chosen.slug}::${numStr}`,
                num: numStr,
                chapterNumber: chNum,
                volume: null,
                title: `الفصل ${numStr}`,
                language: "ar",
                languageLabel: "عربي",
                pagesCount: 20,
                publishAt: new Date().toISOString(),
              });
            });
          } else {
            $p(`a.chapter-link[href*="/series/${chosen.slug}/"]`).each((_, el) => {
              const href = ($p(el).attr("href") || "").trim();
              const cm = href.match(/\/series\/[^/]+\/(\d+(?:\.\d+)?)\/?$/);
              if (!cm) return;
              const numStr = cm[1];
              const chNum = parseFloat(numStr);
              if (!Number.isFinite(chNum) || seenOnPage.has(numStr)) return;
              seenOnPage.add(numStr);
              items.push({
                id: `olympus::${chosen.slug}::${numStr}`,
                num: numStr,
                chapterNumber: chNum,
                volume: null,
                title: `الفصل ${numStr}`,
                language: "ar",
                languageLabel: "عربي",
                pagesCount: 20,
                publishAt: new Date().toISOString(),
              });
            });
          }
          return { items, lockedNums, maxPage };
        };

        const first = await parsePage(1, Math.min(5500, Math.max(1500, providerDeadlineAt - Date.now())));
        const allItems = [...first.items];
        const allLocked = new Set<string>(first.lockedNums);
        const totalPagesToFetch = Math.min(first.maxPage, 30);

        // Fetch remaining pages in gentle batches of 4 so long manhwas load cleanly without upstream bursts or losing partial results
        for (let startP = 2; startP <= totalPagesToFetch; startP += 4) {
          const remaining = providerDeadlineAt - Date.now();
          if (remaining < 1000) break;
          const batchNums: number[] = [];
          for (let p = startP; p < startP + 4 && p <= totalPagesToFetch; p++) {
            batchNums.push(p);
          }
          const results = await Promise.all(
            batchNums.map((p) =>
              parsePage(p, Math.min(5000, remaining)).catch(() => ({
                items: [],
                lockedNums: new Set<string>(),
                maxPage: 1,
              })),
            ),
          );
          results.forEach((res) => {
            allItems.push(...res.items);
            res.lockedNums.forEach((n) => allLocked.add(n));
          });
        }
        return allItems.filter((item) => !allLocked.has(item.num));
      };

      const firstHit = await searchOlympusSeries(cleanTitles[0]);
      if (firstHit) {
        const ch = await fetchOlympusChapters(firstHit);
        if (ch.length > 0) return { score: firstHit.score, items: ch };
      }

      for (let i = 1; i < cleanTitles.length; i += 2) {
        if (Date.now() > providerDeadlineAt - 1500) break;
        const batch = await Promise.all(cleanTitles.slice(i, i + 2).map(searchOlympusSeries));
        const hit = batch.filter(Boolean).sort((a, b) => (b?.score || 0) - (a?.score || 0))[0];
        if (hit) {
          const ch = await fetchOlympusChapters(hit);
          if (ch.length > 0) return { score: hit.score, items: ch };
        }
      }
      return { score: 0, items: [] };
    };

    const try3asq = async (): Promise<{ score: number; items: MangaChapterItem[] }> => {
      const parse3asqChaptersHtml = (
        html: string,
        slug: string,
      ): { items: MangaChapterItem[]; maxPage: number } => {
        const $c = cheerio.load(html);
        const list: MangaChapterItem[] = [];
        const seenNum = new Set<string>();
        const targetSlugNorm = (() => {
          try {
            return decodeURIComponent(slug).toLowerCase();
          } catch {
            return slug.toLowerCase();
          }
        })();

        let maxPage = 1;
        $c(".pagination a[data-page], .pagination a[href*='t=']").each((_, el) => {
          const dp = Number($c(el).attr("data-page") || 0);
          if (dp > maxPage) maxPage = dp;
          const hm = ($c(el).attr("href") || "").match(/[?&]t=(\d+)/);
          if (hm && Number(hm[1]) > maxPage) maxPage = Number(hm[1]);
        });

        $c("li.wp-manga-chapter a").each((_, el) => {
          const href = ($c(el).attr("href") || "").trim();
          const linkText = $c(el).text().replace(/\s+/g, " ").trim();
          const m = href.match(/\/manga\/([^/?#]+)\/([^/?#]+)\/?/);
          if (!m) return;
          const matchedSlug = m[1];
          const chSlug = m[2];
          let matchedNorm = matchedSlug.toLowerCase();
          try {
            matchedNorm = decodeURIComponent(matchedSlug).toLowerCase();
          } catch {}
          if (matchedNorm !== targetSlugNorm) return;
          const numMatch = linkText.match(/(\d+(?:\.\d+)?)/) || chSlug.match(/(\d+(?:\.\d+)?)/);
          if (!numMatch) return;
          const numStr = numMatch[1];
          const chNum = parseFloat(numStr);
          if (!Number.isFinite(chNum) || seenNum.has(numStr)) return;
          seenNum.add(numStr);
          const cleanTitle = linkText.replace(/^\d+(?:\.\d+)?\s*[-–—:]\s*/, "").trim();
          list.push({
            id: `3asq::${slug}::${chSlug}`,
            num: numStr,
            chapterNumber: chNum,
            volume: null,
            title: cleanTitle || `الفصل ${numStr}`,
            language: "ar",
            languageLabel: "عربي",
            pagesCount: 20,
            publishAt: new Date().toISOString(),
          });
        });
        return { items: list, maxPage };
      };

      const fetch3asqSeriesChapters = async (seriesUrl: string, slug: string): Promise<MangaChapterItem[]> => {
        const cleanUrl = seriesUrl.replace(/\/+$/, "");
        try {
          const remaining = providerDeadlineAt - Date.now();
          if (remaining < 1000) return [];
          const ajaxRes = await fetch(`${cleanUrl}/ajax/chapters/`, {
            method: "POST",
            headers: {
              ...browserHeaders,
              Referer: `${cleanUrl}/`,
            },
            signal: AbortSignal.timeout(Math.min(5500, remaining)),
          });
          if (ajaxRes.ok) {
            const ajaxHtml = await ajaxRes.text();
            const first = parse3asqChaptersHtml(ajaxHtml, slug);
            if (first.items.length > 0) {
              const allItems = [...first.items];
              const maxT = Math.min(first.maxPage, 25);
              for (let startT = 2; startT <= maxT; startT += 4) {
                const rem = providerDeadlineAt - Date.now();
                if (rem < 1000) break;
                const pageNums: number[] = [];
                for (let t = startT; t < startT + 4 && t <= maxT; t++) {
                  pageNums.push(t);
                }
                const pageResults = await Promise.all(
                  pageNums.map(async (t) => {
                    try {
                      const r = await fetch(`${cleanUrl}/ajax/chapters/?t=${t}`, {
                        method: "POST",
                        headers: {
                          ...browserHeaders,
                          Referer: `${cleanUrl}/`,
                        },
                        signal: AbortSignal.timeout(Math.min(4800, rem)),
                      });
                      if (!r.ok) return [];
                      const h = await r.text();
                      return parse3asqChaptersHtml(h, slug).items;
                    } catch {
                      return [];
                    }
                  }),
                );
                let anyAdded = false;
                for (const list of pageResults) {
                  if (list.length > 0) {
                    allItems.push(...list);
                    anyAdded = true;
                  }
                }
                if (!anyAdded) break;
              }
              return allItems;
            }
          }
        } catch {}

        try {
          const pageRes = await fetch(`${cleanUrl}/`, {
            headers: browserHeaders,
            signal: AbortSignal.timeout(5000),
          });
          if (pageRes.ok) {
            const pageHtml = await pageRes.text();
            const parsed = parse3asqChaptersHtml(pageHtml, slug);
            if (parsed.items.length > 0) return parsed.items;
          }
        } catch {}
        return [];
      };

      const search3asq = async (
        qTitle: string,
      ): Promise<{ href: string; slug: string; score: number; latestNum: number }[]> => {
        try {
          const searchRes = await fetch(
            `https://3asq.org/?s=${encodeURIComponent(qTitle)}&post_type=wp-manga`,
            {
              headers: browserHeaders,
              signal: AbortSignal.timeout(5500),
            },
          );
          if (!searchRes.ok) return [];
          const html = await searchRes.text();
          const $ = cheerio.load(html);
          const candidates: { href: string; slug: string; score: number; latestNum: number; hasDupSuffix: boolean }[] = [];

          $(".c-tabs-item__content .post-title a, .tab-content-wrap .post-title a").each((_, el) => {
            const href = ($(el).attr("href") || "").trim();
            const titleText = $(el).text().replace(/\s+/g, " ").trim();
            const m = href.match(/\/manga\/([^/?#]+)\/?$/);
            if (!m) return;
            const slug = m[1];
            const score = scoreTitleMatch(titleText, ["french", "english", "colored", "episode a", "crossover"]);
            if (score < 58) return;

            const card = $(el).closest(".c-tabs-item__content, .row, .tab-summary");
            let latestNum = 0;
            card.find(`a[href*="/manga/${slug}/"]`).each((__, chEl) => {
              const chHref = $(chEl).attr("href") || "";
              const lm = chHref.match(new RegExp(`/manga/${slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/(\\d+(?:\\.\\d+)?)`));
              if (lm) latestNum = Math.max(latestNum, parseFloat(lm[1]) || 0);
            });
            const hasDupSuffix = /-\d+$/.test(slug);
            candidates.push({ href, slug, score, latestNum, hasDupSuffix });
          });

          candidates.sort((a, b) => {
            if (Math.abs(b.score - a.score) > 15) return b.score - a.score;
            if (b.latestNum !== a.latestNum) return b.latestNum - a.latestNum;
            if (a.hasDupSuffix !== b.hasDupSuffix) return a.hasDupSuffix ? 1 : -1;
            return b.score - a.score;
          });
          return candidates;
        } catch {
          return [];
        }
      };

      const merge3asqHits = async (
        hits: { href: string; slug: string; score: number; latestNum: number }[],
      ): Promise<{ score: number; items: MangaChapterItem[] }> => {
        if (hits.length === 0) return { score: 0, items: [] };
        const primary = hits[0];
        const chapters = await fetch3asqSeriesChapters(primary.href, primary.slug);
        if (chapters.length === 0) {
          if (hits[1]) {
            const altCh = await fetch3asqSeriesChapters(hits[1].href, hits[1].slug);
            if (altCh.length > 0) return { score: hits[1].score, items: altCh };
          }
          return { score: 0, items: [] };
        }
        // If a secondary tied result exists and primary doesn't start near chapter 1, also pull missing chapters from secondary
        const minPrimary = Math.min(...chapters.map((c) => c.chapterNumber).filter(Number.isFinite));
        if (hits[1] && hits[1].score >= primary.score - 10 && minPrimary > 3 && Date.now() < providerDeadlineAt - 2000) {
          const extra = await fetch3asqSeriesChapters(hits[1].href, hits[1].slug);
          const have = new Set(chapters.map((c) => c.num));
          for (const c of extra) {
            if (!have.has(c.num)) {
              have.add(c.num);
              chapters.push(c);
            }
          }
        }
        return { score: primary.score, items: chapters };
      };

      const firstHits = await search3asq(cleanTitles[0]);
      if (firstHits.length > 0) {
        const res = await merge3asqHits(firstHits);
        if (res.items.length > 0) return res;
      }

      const directSlug = cleanTitles[0]
        .toLowerCase()
        .replace(/['’"`.,:;!?]+/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

      const [extraSearchHits, directHits] = await Promise.all([
        cleanTitles.length > 1
          ? Promise.all(cleanTitles.slice(1, 4).map(search3asq))
          : Promise.resolve([]),
        directSlug.length >= 4
          ? fetch3asqSeriesChapters(`https://3asq.online/manga/${directSlug}`, directSlug)
          : Promise.resolve([]),
      ]);

      if (directHits.length > 0) return { score: 110, items: directHits };

      const flatExtra = extraSearchHits.flat().sort((a, b) => {
        if (Math.abs(b.score - a.score) > 15) return b.score - a.score;
        return b.latestNum - a.latestNum;
      });
      if (flatExtra.length > 0) {
        const res = await merge3asqHits(flatExtra);
        if (res.items.length > 0) return res;
      }

      return { score: 0, items: [] };
    };

    const emptyRes = { score: 0, items: [] as MangaChapterItem[] };
    const providerResults = await Promise.all([
      tryAzora().catch(() => emptyRes),
      tryOlympus().catch(() => emptyRes),
      try3asq().catch(() => emptyRes),
    ]);
    providerResults.sort((a, b) => b.score - a.score);

    const merged = new Map<string, MangaChapterItem>();
    for (const group of providerResults) {
      for (const ch of group.items) {
        const k = Number.isFinite(ch.chapterNumber)
          ? (Number.isInteger(ch.chapterNumber) ? String(ch.chapterNumber) : String(parseFloat(ch.num) || ch.chapterNumber))
          : ch.num;
        if (!merged.has(k)) merged.set(k, ch);
      }
    }
    const finalItems = Array.from(merged.values()).sort((a, b) => b.chapterNumber - a.chapterNumber);
    if (finalItems.length > 0) {
      await serverCache.set(cacheKey, finalItems, 30 * 60 * 1000);
    }
    return finalItems;
    });
  },

  async getChapterPages(chapterId: string, quality: "high" | "saver" = "high") {
    const cleanId = String(chapterId || "").trim();
    if (!cleanId) throw new Error("معرف الفصل مطلوب.");

    const cacheKey = `manga_pages_v3_${cleanId}_${quality}`;
    const cached = await serverCache.get<any>(cacheKey, false);
    if (cached && Array.isArray(cached.pages) && cached.pages.length > 0) {
      return cached;
    }

    return coalesceManga(cacheKey, async () => {

    if (cleanId.startsWith("azora::")) {
      const [, slug, chSlug] = cleanId.split("::");
      if (!slug || !chSlug) throw new Error("معرف الفصل غير صالح.");
      const res = await fetch(`https://azoramoon.com/series/${slug}/${chSlug}`, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/125.0.0.0",
          Referer: "https://azoramoon.com/",
        },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) throw new Error("تعذر فتح صفحات الفصل حالياً.");
      const html = await res.text();
      const $ = cheerio.load(html);
      const rawImgs: string[] = [];
      const addAzoraImg = (raw: string) => {
        const s = String(raw || "").replace(/\\u002F/gi, "/").replace(/\\\//g, "/").trim();
        if (
          s &&
          /^https?:\/\//i.test(s) &&
          !/\/upload\/(?:chapter|series)\/featured\//i.test(s) &&
          !/\/public\/upload\//i.test(s) &&
          !/cover\.png|logo|avatar|discord|offer\.jpg|banner|favicon/i.test(s) &&
          !rawImgs.includes(s)
        ) {
          rawImgs.push(s);
        }
      };

      $(".image-container img, figure.image-container img, .reading-content img").each((_, el) => {
        addAzoraImg($(el).attr("src") || $(el).attr("data-src") || $(el).attr("data-lazy-src") || "");
      });

      if (rawImgs.length === 0) {
        const wpMatches =
          html.match(/https?:\/\/[^"'\\\s<>]+\/WP-manga\/data\/[^"'\\\s<>]+\.(?:jpg|jpeg|png|webp|avif)(?:\?[^"'\\\s<>]*)?/gi) ||
          [];
        for (const m of wpMatches) {
          addAzoraImg(m);
        }
      }

      if (rawImgs.length === 0) {
        $('link[rel="preload"][as="image"]').each((_, el) => {
          const href = $(el).attr("href") || "";
          if (/storage\.azorafly\.com\/(?:upload\/series\/(?!featured\/)|WP-manga\/data\/)/i.test(href)) {
            addAzoraImg(href);
          }
        });
      }

      if (rawImgs.length === 0) {
        const seriesMatches =
          html.match(/https?:\/\/storage\.azorafly\.com\/upload\/series\/(?!featured\/)[^"'\\\s<>]+\.(?:jpg|jpeg|png|webp|avif)/gi) || [];
        for (const m of seriesMatches) {
          addAzoraImg(m);
        }
      }

      if (rawImgs.length === 0) throw new Error("تعذر العثور على صور هذا الفصل حالياً.");
      const pages = rawImgs.map((directUrl, idx) => ({
        index: idx + 1,
        url: buildImageProxyUrl(directUrl),
        fallbackUrl: directUrl,
      }));
      const payload = { chapterId: cleanId, totalPages: pages.length, pages };
      await serverCache.set(cacheKey, payload, 20 * 60 * 1000);
      return payload;
    }

    if (cleanId.startsWith("olympus::")) {
      const [, slug, chNum] = cleanId.split("::");
      if (!slug || !chNum) throw new Error("معرف الفصل غير صالح.");
      const targetUrl = `https://olympustaff.com/series/${slug}/${chNum}`;
      const res = await fetch(targetUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/125.0.0.0",
          Referer: "https://olympustaff.com/",
        },
        signal: AbortSignal.timeout(8500),
      });
      if (!res.ok) throw new Error("تعذر فتح صفحات الفصل حالياً.");
      // Locked VIP chapters redirect back to `/series/<slug>` without `/<chNum>`
      if (res.url && !res.url.includes(`/${chNum}`)) {
        throw new Error("هذا الفصل مقفل أو غير متاح حالياً من المصدر.");
      }
      const html = await res.text();
      const $ = cheerio.load(html);
      const rawImgs: string[] = [];
      $(".image_list img, .reading-content img").each((_, el) => {
        const s = ($(el).attr("src") || $(el).attr("data-src") || $(el).attr("data-lazy-src") || "").trim();
        if (s && /^https?:\/\//i.test(s) && !/TeamX\.(png|jpg|webp)|\/images\/logo/i.test(s)) {
          if (!rawImgs.includes(s)) rawImgs.push(s);
        }
      });
      if (rawImgs.length === 0) throw new Error("تعذر العثور على صور هذا الفصل حالياً.");
      const pages = rawImgs.map((directUrl, idx) => ({
        index: idx + 1,
        url: buildImageProxyUrl(directUrl),
        fallbackUrl: directUrl,
      }));
      const payload = { chapterId: cleanId, totalPages: pages.length, pages };
      await serverCache.set(cacheKey, payload, 20 * 60 * 1000);
      return payload;
    }

    if (cleanId.startsWith("3asq::")) {
      const [, slug, chSlug] = cleanId.split("::");
      if (!slug || !chSlug) throw new Error("معرف الفصل غير صالح.");
      const rawImgs: string[] = [];
      for (const baseHost of ["https://3asq.online", "https://3asq.org"]) {
        if (rawImgs.length > 0) break;
        try {
          const res = await fetch(`${baseHost}/manga/${encodeURIComponent(slug)}/${encodeURIComponent(chSlug)}/`, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0.0.0",
              Referer: `${baseHost}/`,
            },
            signal: AbortSignal.timeout(10000),
          });
          if (!res.ok) continue;
          const html = await res.text();
          const $ = cheerio.load(html);
          $(".reading-content img").each((_, el) => {
            const s = (
              $(el).attr("data-src") ||
              $(el).attr("data-lazy-src") ||
              $(el).attr("data-cfsrc") ||
              $(el).attr("src") ||
              ""
            ).trim();
            if (
              s &&
              /^https?:\/\//i.test(s) &&
              !/logo|avatar|discord|banner|favicon|spinner|loading/i.test(s) &&
              !rawImgs.includes(s)
            ) {
              rawImgs.push(s);
            }
          });
        } catch {}
      }
      if (rawImgs.length === 0) throw new Error("تعذر العثور على صور هذا الفصل حالياً.");
      const pages = rawImgs.map((directUrl, idx) => ({
        index: idx + 1,
        url: buildImageProxyUrl(directUrl),
        fallbackUrl: directUrl,
      }));
      const payload = { chapterId: cleanId, totalPages: pages.length, pages };
      await serverCache.set(cacheKey, payload, 20 * 60 * 1000);
      return payload;
    }

    const json = await fetchJsonSafe(`${MANGADEX_API}/at-home/server/${cleanId}`, 8000);
    const baseUrl = String(json?.baseUrl || "").replace(/\/$/, "");
    const hash = json?.chapter?.hash;
    const files: string[] =
      quality === "saver" && Array.isArray(json?.chapter?.dataSaver) && json.chapter.dataSaver.length > 0
        ? json.chapter.dataSaver
        : Array.isArray(json?.chapter?.data)
          ? json.chapter.data
          : [];

    if (!baseUrl || !hash || files.length === 0) {
      throw new Error("تعذر جلب صفحات هذا الفصل حالياً.");
    }

    const folder =
      quality === "saver" && Array.isArray(json?.chapter?.dataSaver) && json.chapter.dataSaver.length > 0
        ? "data-saver"
        : "data";

    const pages = files.map((file, idx) => {
      const directUrl = `${baseUrl}/${folder}/${hash}/${file}`;
      return {
        index: idx + 1,
        url: buildImageProxyUrl(directUrl),
        fallbackUrl: directUrl,
      };
    });

    const payload = {
      chapterId: cleanId,
      totalPages: pages.length,
      pages,
    };

    await serverCache.set(cacheKey, payload, 12 * 60 * 1000);
    return payload;
    });
  },
};
