import { serverCache } from "./cacheService";
import { cleanAnimeTitle } from "../utils/animeTitleCleaner";

const ANILIST_ENDPOINT = "https://graphql.anilist.co";
const inFlightAniList = new Map<string, Promise<any>>();

async function queryAniList(query: string, variables: Record<string, any> = {}, ttlMs = 60 * 60 * 1000): Promise<any> {
  const cacheKey = `anilist_gql_v4_${Buffer.from(JSON.stringify({ q: query.trim().slice(0, 120), v: variables })).toString("base64")}`;

  // 1. Check fresh cache
  const fresh = await serverCache.get(cacheKey, false);
  if (fresh !== null) return fresh;

  // 2. Check stale cache (SWR)
  const stale = await serverCache.get(cacheKey, true);
  if (stale !== null) {
    if (!inFlightAniList.has(cacheKey)) {
      const bg = executeGraphQL(query, variables, cacheKey, ttlMs).finally(() => {
        inFlightAniList.delete(cacheKey);
      });
      inFlightAniList.set(cacheKey, bg);
    }
    return stale;
  }

  // 3. Deduplicate concurrent in-flight requests
  const existing = inFlightAniList.get(cacheKey);
  if (existing) return existing;

  const promise = executeGraphQL(query, variables, cacheKey, ttlMs).finally(() => {
    inFlightAniList.delete(cacheKey);
  });
  inFlightAniList.set(cacheKey, promise);
  return promise;
}

async function executeGraphQL(query: string, variables: Record<string, any>, cacheKey: string, ttlMs: number): Promise<any> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(ANILIST_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0",
        },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(4500),
      });

      if (res.status === 429) {
        await new Promise((r) => setTimeout(r, 1200 * attempt));
        continue;
      }

      if (!res.ok) {
        throw new Error(`AniList HTTP ${res.status}`);
      }

      const json = await res.json();
      if (json && json.data) {
        await serverCache.set(cacheKey, json.data, ttlMs);
        return json.data;
      }
    } catch (err: any) {
      if (attempt === 2) {
        const fallback = await serverCache.get(cacheKey, true);
        if (fallback !== null) return fallback;
        throw err;
      }
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  return null;
}

const MEDIA_FRAGMENT = `
  id
  idMal
  title {
    romaji
    english
    native
  }
  coverImage {
    extraLarge
    large
  }
  bannerImage
  description(asHtml: false)
  episodes
  status
  season
  seasonYear
  averageScore
  meanScore
  genres
  format
  duration
  startDate {
    year
    month
    day
  }
  studios(isMain: true) {
    nodes {
      name
    }
  }
  nextAiringEpisode {
    episode
    airingAt
    timeUntilAiring
  }
`;

export function mapAniListToJikan(media: any): any {
  if (!media) return null;
  const malId = media.idMal || media.id;
  const score = media.averageScore ? Number((media.averageScore / 10).toFixed(2)) : media.meanScore ? Number((media.meanScore / 10).toFixed(2)) : 8.2;
  const statusMap: Record<string, string> = {
    FINISHED: "Finished Airing",
    RELEASING: "Currently Airing",
    NOT_YET_RELEASED: "Not yet aired",
    CANCELLED: "Cancelled",
    HIATUS: "On Hiatus",
  };

  const rawTitle = media.title?.english || media.title?.romaji || "Anime";
  const cleanRomaji = media.title?.romaji || rawTitle;
  const cleanEnglish = media.title?.english || cleanRomaji;

  // Determine broadcast day/time from nextAiringEpisode or startDate
  let broadcastDay = "sunday";
  let broadcastTime = "18:00";
  const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  if (media.nextAiringEpisode?.airingAt) {
    const d = new Date(media.nextAiringEpisode.airingAt * 1000);
    broadcastDay = days[d.getUTCDay()];
    const hrs = String(d.getUTCHours()).padStart(2, "0");
    const mins = String(d.getUTCMinutes()).padStart(2, "0");
    broadcastTime = `${hrs}:${mins}`;
  } else if (media.startDate?.year && media.startDate?.month && media.startDate?.day) {
    const d = new Date(Date.UTC(media.startDate.year, media.startDate.month - 1, media.startDate.day));
    if (!isNaN(d.getTime())) {
      broadcastDay = days[d.getUTCDay()];
    }
  }

  const synopsisClean = (media.description || "")
    .replace(/<[^>]*>/g, "")
    .replace(/\(Source:.*?\)/gi, "")
    .replace(/\[Written by.*?\]/gi, "")
    .trim();

  return {
    mal_id: malId,
    anilist_id: media.id,
    title: cleanRomaji,
    title_english: cleanEnglish,
    images: {
      jpg: {
        large_image_url: media.coverImage?.extraLarge || media.coverImage?.large || "",
        image_url: media.coverImage?.large || media.coverImage?.extraLarge || "",
      },
    },
    bannerUrl: media.bannerImage || media.coverImage?.extraLarge || "",
    synopsis: synopsisClean || "قصة هذا الأنمي متوفرة ومحدثة.",
    score,
    status: statusMap[media.status] || "Currently Airing",
    airing: media.status === "RELEASING",
    episodes: media.episodes || (media.nextAiringEpisode?.episode ? Math.max(12, media.nextAiringEpisode.episode) : 12),
    latestEpisode:
      media.status === "NOT_YET_RELEASED"
        ? 0
        : media.nextAiringEpisode?.episode
        ? Math.max(0, media.nextAiringEpisode.episode - 1)
        : media.status === "RELEASING"
        ? 1
        : media.episodes || 12,
    nextAiringEpisode: media.nextAiringEpisode || null,
    year: media.seasonYear || media.startDate?.year || 2025,
    season: media.season ? media.season.toLowerCase() : "winter",
    type: media.format || "TV",
    duration: media.duration ? `${media.duration} min per ep` : "24 min per ep",
    genres: (media.genres || []).map((g: string, idx: number) => ({ mal_id: idx + 1, name: g })),
    studios: (media.studios?.nodes || []).map((s: any) => ({ name: s.name })),
    broadcast: {
      day: broadcastDay,
      time: broadcastTime,
      timezone: "UTC",
      string: `${broadcastDay} at ${broadcastTime}`,
    },
  };
}

export const anilistService = {
  async getTopPopular(limit = 15): Promise<any[]> {
    const q = `
      query ($perPage: Int) {
        Page(page: 1, perPage: $perPage) {
          media(type: ANIME, sort: POPULARITY_DESC, isAdult: false) {
            ${MEDIA_FRAGMENT}
          }
        }
      }
    `;
    const data = await queryAniList(q, { perPage: limit }, 6 * 60 * 60 * 1000);
    return (data?.Page?.media || []).map(mapAniListToJikan).filter(Boolean);
  },

  async getSeasonAnime(season?: string, year?: number, limit = 30): Promise<any[]> {
    const validSeasons = ["WINTER", "SPRING", "SUMMER", "FALL"];
    const upperSeason = season ? season.toUpperCase() : "";
    const isSpecific = validSeasons.includes(upperSeason) && year;

    const q = isSpecific
      ? `
        query ($season: MediaSeason, $year: Int, $perPage: Int) {
          Page(page: 1, perPage: $perPage) {
            media(type: ANIME, season: $season, seasonYear: $year, sort: POPULARITY_DESC, isAdult: false) {
              ${MEDIA_FRAGMENT}
            }
          }
        }
      `
      : `
        query ($perPage: Int) {
          Page(page: 1, perPage: $perPage) {
            media(type: ANIME, status: RELEASING, sort: POPULARITY_DESC, isAdult: false) {
              ${MEDIA_FRAGMENT}
            }
          }
        }
      `;

    const vars = isSpecific ? { season: upperSeason, year: Number(year), perPage: limit } : { perPage: limit };
    const data = await queryAniList(q, vars, 3 * 60 * 60 * 1000);
    return (data?.Page?.media || []).map(mapAniListToJikan).filter(Boolean);
  },

  async getSliderByMode(mode: string, limit = 10): Promise<any[]> {
    const normalizedMode = (mode || "best_season").toLowerCase();

    if (normalizedMode === "all_time_best") {
      const q = `
        query ($perPage: Int) {
          Page(page: 1, perPage: $perPage) {
            media(type: ANIME, sort: SCORE_DESC, isAdult: false) {
              ${MEDIA_FRAGMENT}
            }
          }
        }
      `;
      const data = await queryAniList(q, { perPage: limit }, 12 * 60 * 60 * 1000);
      return (data?.Page?.media || []).map(mapAniListToJikan).filter(Boolean);
    }

    if (normalizedMode === "classic_historical") {
      const q = `
        query ($perPage: Int) {
          Page(page: 1, perPage: $perPage) {
            media(type: ANIME, endDate_lesser: 20160101, sort: [POPULARITY_DESC, SCORE_DESC], isAdult: false) {
              ${MEDIA_FRAGMENT}
            }
          }
        }
      `;
      const data = await queryAniList(q, { perPage: limit }, 12 * 60 * 60 * 1000);
      return (data?.Page?.media || []).map(mapAniListToJikan).filter(Boolean);
    }

    if (normalizedMode === "trending_season") {
      const q = `
        query ($perPage: Int) {
          Page(page: 1, perPage: $perPage) {
            media(type: ANIME, status: RELEASING, sort: [TRENDING_DESC, POPULARITY_DESC], isAdult: false) {
              ${MEDIA_FRAGMENT}
            }
          }
        }
      `;
      const data = await queryAniList(q, { perPage: limit }, 2 * 60 * 60 * 1000);
      return (data?.Page?.media || []).map(mapAniListToJikan).filter(Boolean);
    }

    // Default: best_season (الأفضل هذا الموسم)
    const q = `
      query ($perPage: Int) {
        Page(page: 1, perPage: $perPage) {
          media(type: ANIME, status: RELEASING, sort: [SCORE_DESC, POPULARITY_DESC], isAdult: false) {
            ${MEDIA_FRAGMENT}
          }
        }
      }
    `;
    const data = await queryAniList(q, { perPage: limit }, 2 * 60 * 60 * 1000);
    return (data?.Page?.media || []).map(mapAniListToJikan).filter(Boolean);
  },

  async getScheduleByDay(dayName: string): Promise<any[]> {
    const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    const targetDayIdx = days.indexOf(dayName.toLowerCase());

    // Fetch current releasing anime with airing schedules
    const q = `
      query {
        Page(page: 1, perPage: 50) {
          media(type: ANIME, status: RELEASING, sort: POPULARITY_DESC, isAdult: false) {
            ${MEDIA_FRAGMENT}
          }
        }
      }
    `;
    const data = await queryAniList(q, {}, 2 * 60 * 60 * 1000);
    const allReleasing = (data?.Page?.media || []).map(mapAniListToJikan).filter(Boolean);

    if (targetDayIdx === -1) return allReleasing.slice(0, 20);

    const matched = allReleasing.filter((item: any) => item.broadcast?.day?.toLowerCase() === dayName.toLowerCase());
    if (matched.length >= 4) return matched;

    // If few matches on that exact UTC day, distribute popular releasing anime deterministically by day
    const distributed = allReleasing.filter((item: any, idx: number) => idx % 7 === targetDayIdx);
    return [...matched, ...distributed.filter((d: any) => !matched.some((m: any) => m.mal_id === d.mal_id))];
  },

  async searchAnime(params: {
    q?: string;
    genres?: string[];
    minScore?: number;
    status?: string;
    year?: number;
    orderBy?: string;
    sort?: string;
    page?: number;
  }): Promise<{ data: any[]; hasNextPage: boolean; currentPage: number }> {
    const page = Number(params.page) || 1;
    let sortVal = "POPULARITY_DESC";
    const isAsc = params.sort === "asc";

    if (params.orderBy === "score") sortVal = isAsc ? "SCORE" : "SCORE_DESC";
    else if (params.orderBy === "title") sortVal = isAsc ? "TITLE_ENGLISH" : "TITLE_ENGLISH_DESC";
    else if (params.orderBy === "start_date") sortVal = isAsc ? "START_DATE" : "START_DATE_DESC";
    else if (params.orderBy === "popularity") sortVal = isAsc ? "POPULARITY" : "POPULARITY_DESC";

    let statusVal: string | undefined;
    if (params.status === "airing") statusVal = "RELEASING";
    else if (params.status === "complete") statusVal = "FINISHED";
    else if (params.status === "upcoming") statusVal = "NOT_YET_RELEASED";

    const variables: Record<string, any> = {
      page,
      perPage: 24,
      sort: [sortVal],
    };

    if (params.q && params.q.trim()) variables.search = params.q.trim();
    if (params.genres && params.genres.length > 0) variables.genre_in = params.genres;
    if (params.minScore && params.minScore > 0) variables.averageScore_greater = Math.round(params.minScore * 10);
    if (statusVal) variables.status = statusVal;
    if (params.year && !isNaN(Number(params.year))) variables.seasonYear = Number(params.year);

    const gql = `
      query (
        $page: Int,
        $perPage: Int,
        $search: String,
        $genre_in: [String],
        $averageScore_greater: Int,
        $status: MediaStatus,
        $seasonYear: Int,
        $sort: [MediaSort]
      ) {
        Page(page: $page, perPage: $perPage) {
          pageInfo {
            hasNextPage
            currentPage
          }
          media(
            type: ANIME,
            isAdult: false,
            search: $search,
            genre_in: $genre_in,
            averageScore_greater: $averageScore_greater,
            status: $status,
            seasonYear: $seasonYear,
            sort: $sort
          ) {
            ${MEDIA_FRAGMENT}
          }
        }
      }
    `;

    const resData = await queryAniList(gql, variables, 30 * 60 * 1000);
    const list = (resData?.Page?.media || []).map(mapAniListToJikan).filter(Boolean);
    return {
      data: list,
      hasNextPage: Boolean(resData?.Page?.pageInfo?.hasNextPage),
      currentPage: resData?.Page?.pageInfo?.currentPage || page,
    };
  },

  async getAnimeFullDetails(idOrQuery: string | number): Promise<{
    anime: any;
    characters: any[];
    related: any[];
    recommendations: any[];
    pictures: string[];
  } | null> {
    const str = String(idOrQuery).trim();
    const isNumeric = /^\d+$/.test(str);

    const characterEdgeFields = `
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
        voiceActors(language: JAPANESE, sort: [RELEVANCE]) {
          id
          name {
            full
          }
          image {
            large
          }
        }
      }
    `;

    const fullFields = `
      ${MEDIA_FRAGMENT}
      charactersPage1: characters(sort: [ROLE, RELEVANCE], page: 1, perPage: 25) {
        ${characterEdgeFields}
      }
      charactersPage2: characters(sort: [ROLE, RELEVANCE], page: 2, perPage: 25) {
        ${characterEdgeFields}
      }
      charactersPage3: characters(sort: [ROLE, RELEVANCE], page: 3, perPage: 25) {
        ${characterEdgeFields}
      }
      charactersPage4: characters(sort: [ROLE, RELEVANCE], page: 4, perPage: 25) {
        ${characterEdgeFields}
      }
      streamingEpisodes {
        thumbnail
      }
      relations {
        edges {
          relationType(version: 2)
          node {
            id
            idMal
            type
            format
            status
            episodes
            title {
              english
              romaji
            }
            coverImage {
              large
              extraLarge
            }
            seasonYear
            relations {
              edges {
                relationType(version: 2)
                node {
                  id
                  idMal
                  type
                  format
                  status
                  episodes
                  title {
                    english
                    romaji
                  }
                  coverImage {
                    large
                    extraLarge
                  }
                  seasonYear
                }
              }
            }
          }
        }
      }
      recommendations(sort: [RATING_DESC], perPage: 12) {
        nodes {
          mediaRecommendation {
            id
            idMal
            title {
              english
              romaji
            }
            coverImage {
              large
              extraLarge
            }
            averageScore
          }
        }
      }
    `;

    let media: any = null;

    if (isNumeric) {
      const numId = Number(str);
      // Try by idMal first (since our platform uses MAL IDs as canonical numeric IDs)
      try {
        const qMal = `query ($idMal: Int) { Media(idMal: $idMal, type: ANIME) { ${fullFields} } }`;
        const dMal = await queryAniList(qMal, { idMal: numId }, 12 * 60 * 60 * 1000);
        if (dMal?.Media) media = dMal.Media;
      } catch {}

      // If not found by idMal, try by AniList id
      if (!media) {
        try {
          const qId = `query ($id: Int) { Media(id: $id, type: ANIME) { ${fullFields} } }`;
          const dId = await queryAniList(qId, { id: numId }, 12 * 60 * 60 * 1000);
          if (dId?.Media) media = dId.Media;
        } catch {}
      }
    } else {
      const cleanQ = cleanAnimeTitle(str.replace(/^search-/, ""));
      try {
        const qSearch = `query ($search: String) { Media(search: $search, type: ANIME, isAdult: false) { ${fullFields} } }`;
        const dSearch = await queryAniList(qSearch, { search: cleanQ || str }, 12 * 60 * 60 * 1000);
        if (dSearch?.Media) media = dSearch.Media;
      } catch {}
    }

    if (!media) return null;

    const mappedAnime = mapAniListToJikan(media);

    const allCharacterEdges = [
      ...(media.charactersPage1?.edges || []),
      ...(media.charactersPage2?.edges || []),
      ...(media.charactersPage3?.edges || []),
      ...(media.charactersPage4?.edges || []),
      ...(media.characters?.edges || []),
    ];
    const seenCharIds = new Set<string | number>();
    const characters: any[] = [];
    allCharacterEdges.forEach((edge: any) => {
      const charId = edge?.node?.id;
      if (!charId || seenCharIds.has(charId)) return;
      seenCharIds.add(charId);
      const va = edge.voiceActors?.[0];
      characters.push({
        id: charId,
        name: edge.node?.name?.full || "Character",
        role: edge.role === "MAIN" ? "رئيسي (Main)" : "مساند (Supporting)",
        imageUrl: edge.node?.image?.large || "",
        voiceActor: va
          ? {
              name: va.name?.full || "",
              imageUrl: va.image?.large || "",
            }
          : null,
      });
    });

    const relationFormatMap: Record<string, string> = {
      PREQUEL: "Prequel",
      SEQUEL: "Sequel",
      PARENT: "Parent story",
      SIDE_STORY: "Side story",
      SPIN_OFF: "Spin-off",
      ALTERNATIVE: "Alternative version",
      SUMMARY: "Summary",
      FULL_STORY: "Full story",
      OTHER: "Other",
    };

    // استخراج الكلمات المفتاحية الأساسية لاسم الأنمي لمنع اختلاط أنميات أخرى (مثل الكروس أوفر مع دراغون بول أو توريكو أو سازاي سان)
    const getFranchiseKeywords = (...titles: (string | undefined)[]): string[] => {
      const stopWords = new Set([
        "the", "and", "of", "in", "to", "a", "an", "no", "ni", "wa", "ga", "wo", "o",
        "season", "part", "cour", "movie", "film", "ova", "ona", "special", "tv",
        "series", "animation", "anime", "episode", "chapter", "arc", "saga", "story",
        "new", "final", "second", "third", "fourth", "first", "2nd", "3rd", "4th"
      ]);
      const words = new Set<string>();
      for (const t of titles) {
        if (!t) continue;
        const cleaned = t
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, " ")
          .split(/\s+/)
          .filter((w) => w.length >= 3 && !stopWords.has(w) && !/^\d+$/.test(w));
        cleaned.forEach((w) => words.add(w));
      }
      return Array.from(words);
    };

    const baseKeywords = getFranchiseKeywords(
      media.title?.english,
      media.title?.romaji
    );

    const sharesFranchiseKeyword = (node: any): boolean => {
      if (baseKeywords.length === 0) return true;
      const candidateText = `${node?.title?.english || ""} ${node?.title?.romaji || ""}`.toLowerCase();
      return baseKeywords.some((kw) => candidateText.includes(kw));
    };

    const isCrossoverNoise = (node: any, relType: string): boolean => {
      if (!node || node.type !== "ANIME") return true;
      // استبعاد علاقات الشخصيات والتجارية والمانجا تماماً
      if (relType === "CHARACTER" || relType === "ADAPTATION") return true;

      const fullTitle = `${node.title?.english || ""} ${node.title?.romaji || ""}`.toLowerCase();
      // استبعاد حلقات الكروس أوفر المشتركة مع سلاسل أخرى مثل Toriko x One Piece x Dragon Ball
      if (/\bx\b|crossover|dream 9|kyutai panic|nisshin|cup noodle|hungry days/i.test(fullTitle)) {
        return true;
      }

      // إذا كانت العلاقة OTHER أو SPIN_OFF أو ALTERNATIVE أو SIDE_STORY، يجب أن تشترك في اسم السلسلة إذا كانت العلاقة غير مباشرة أو عامة
      if (relType === "OTHER" && !sharesFranchiseKeyword(node)) {
        return true;
      }

      return false;
    };

    const seenRelIds = new Set<number>();
    const currentIdMal = Number(media.idMal || media.id);
    if (currentIdMal) seenRelIds.add(currentIdMal);

    const related: any[] = [];
    const addRelationEdge = (edge: any, overrideRelation?: string) => {
      const relType = String(edge?.relationType || "").toUpperCase();
      if (!edge?.node || isCrossoverNoise(edge.node, relType)) return;

      const relId = Number(edge.node.idMal || edge.node.id);
      if (!relId || seenRelIds.has(relId)) return;
      seenRelIds.add(relId);

      related.push({
        relation: overrideRelation || relationFormatMap[relType] || relType || "Related",
        name: edge.node.title?.english || edge.node.title?.romaji || "Anime",
        romajiTitle: edge.node.title?.romaji || "",
        englishTitle: edge.node.title?.english || "",
        mal_id: relId,
        type: edge.node.format || "TV",
        format: edge.node.format || "TV",
        episodes: edge.node.episodes || 12,
        posterUrl: edge.node.coverImage?.extraLarge || edge.node.coverImage?.large || "",
        year: edge.node.seasonYear || "",
      });
    };

    // المستوى الأول: العلاقات المباشرة للأنمي المفتوح
    const firstHopEdges = media.relations?.edges || [];
    firstHopEdges.forEach((edge: any) => {
      addRelationEdge(edge);
    });

    // المستوى الثاني: نتتبع فقط سلسلة المواسم المباشرة (PREQUEL / SEQUEL / PARENT) التي تنتمي لنفس الأنمي
    firstHopEdges.forEach((edge: any) => {
      const firstRelType = String(edge?.relationType || "").toUpperCase();
      if (
        firstRelType !== "PREQUEL" &&
        firstRelType !== "SEQUEL" &&
        firstRelType !== "PARENT"
      ) {
        return;
      }
      if (!edge?.node || !sharesFranchiseKeyword(edge.node)) {
        return;
      }

      (edge.node.relations?.edges || []).forEach((subEdge: any) => {
        const subRelType = String(subEdge?.relationType || "").toUpperCase();
        if (
          subRelType !== "PREQUEL" &&
          subRelType !== "SEQUEL" &&
          subRelType !== "PARENT" &&
          subRelType !== "SIDE_STORY"
        ) {
          return;
        }
        if (!subEdge?.node || !sharesFranchiseKeyword(subEdge.node)) {
          return;
        }
        // الحفاظ على اتجاه العلاقة الزمنية بالنسبة للأنمي المفتوح
        let inheritedRelation = relationFormatMap[subRelType] || "Related";
        if (firstRelType === "PREQUEL" && (subRelType === "PREQUEL" || subRelType === "PARENT")) {
          inheritedRelation = "Prequel";
        } else if (firstRelType === "SEQUEL" && subRelType === "SEQUEL") {
          inheritedRelation = "Sequel";
        }
        addRelationEdge(subEdge, inheritedRelation);
      });
    });

    const recommendations = (media.recommendations?.nodes || [])
      .map((n: any) => n.mediaRecommendation)
      .filter(Boolean)
      .map((rec: any) => ({
        id: rec.idMal || rec.id,
        title: rec.title?.english || rec.title?.romaji || "Anime",
        posterUrl: rec.coverImage?.extraLarge || rec.coverImage?.large || "",
        rating: rec.averageScore ? Number((rec.averageScore / 10).toFixed(1)) : 8.0,
      }));

    const pictures: string[] = [];
    if (media.coverImage?.extraLarge) pictures.push(media.coverImage.extraLarge);
    if (media.coverImage?.large && !pictures.includes(media.coverImage.large)) pictures.push(media.coverImage.large);
    if (media.bannerImage && !pictures.includes(media.bannerImage)) pictures.push(media.bannerImage);
    if (Array.isArray(media.streamingEpisodes)) {
      media.streamingEpisodes.slice(0, 36).forEach((ep: any) => {
        if (ep?.thumbnail && !pictures.includes(ep.thumbnail)) {
          pictures.push(ep.thumbnail);
        }
      });
    }

    return {
      anime: mappedAnime,
      characters,
      related,
      recommendations,
      pictures,
    };
  },
};
