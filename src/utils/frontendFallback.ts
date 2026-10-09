/**
 * Live Hybrid APK & Client API Engine (محرك الجلب المباشر الحي لتطبيق الـ APK والويب)
 * يضمن ارتباط الواجهة بالإنترنت وقواعد بيانات الأنمي العالمية (AniList GraphQL + Jikan API + Google Translate)
 * مباشرة من هاتف المستخدم داخل الـ APK حتى لو كان الخادم السحابي الوسيط متوقفاً أو محجوباً.
 */

import {
  CURATED_ANIME_LIST,
  CURATED_GENRES_LIST,
  getCuratedRecentEpisodes,
  getCuratedTop5,
  getCuratedSeasonAnime,
  getCuratedAnimeById
} from '../data/curatedAnimeDatabase';

const nativeFetch = typeof window !== 'undefined' ? window.fetch.bind(window) : fetch;

const GENRE_MAP_AR: Record<string, string> = {
  Action: 'أكشن',
  Adventure: 'مغامرات',
  Comedy: 'كوميدي',
  Drama: 'دراما',
  Fantasy: 'فانتازيا',
  Mystery: 'غموض',
  Romance: 'رومانسي',
  'Sci-Fi': 'خيال علمي',
  'Slice of Life': 'شريحة من الحياة',
  Sports: 'رياضي',
  Supernatural: 'خوارق',
  Thriller: 'إثارة',
  Suspense: 'تشويق',
  Horror: 'رعب',
  Mecha: 'ميكا',
  Music: 'موسيقى',
  Psychological: 'نفسي',
  'Mahou Shoujo': 'سحر'
};

let isBackendUnreachable = false;

export function isFallbackActive(): boolean {
  return isBackendUnreachable;
}

export function setFallbackActive(active: boolean) {
  isBackendUnreachable = active;
}

// ترجمة فورية للقصة إلى العربية مباشرة من الهاتف عبر Google Translate GTX
async function translateTextToArabicClient(text: string): Promise<string> {
  if (!text || !text.trim()) return '';
  const cleaned = text
    .replace(/<[^>]*>/g, '')
    .replace(/\(Source:.*?\)/gi, '')
    .replace(/\[Written by.*?\]/gi, '')
    .trim();

  if (/[\u0600-\u06FF]/.test(cleaned)) return cleaned;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ar&dt=t&q=${encodeURIComponent(cleaned.slice(0, 1400))}`;
    const res = await nativeFetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (res.ok) {
      const json = await res.json();
      if (Array.isArray(json) && Array.isArray(json[0])) {
        const translated = json[0].map((part: any) => part[0]).join('').trim();
        if (translated && /[\u0600-\u06FF]/.test(translated)) {
          return translated;
        }
      }
    }
  } catch {}
  return cleaned;
}

// استعلام مباشر من AniList GraphQL عبر إنترنت الهاتف في الـ APK
async function queryAniListDirect(query: string, variables: Record<string, any> = {}): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await nativeFetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`AniList HTTP ${res.status}`);
    const json = await res.json();
    return json?.data || null;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

const ANILIST_CARD_FRAGMENT = `
  id
  idMal
  title {
    romaji
    english
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
  genres
  format
  nextAiringEpisode {
    episode
    airingAt
  }
`;

function mapMediaToCard(m: any, idx = 0) {
  const id = String(m.idMal || m.id);
  const title = m.title?.english || m.title?.romaji || 'Anime';
  const posterUrl = m.coverImage?.extraLarge || m.coverImage?.large || '';
  const rating = m.averageScore ? Number((m.averageScore / 10).toFixed(1)) : 8.4;
  const genres = (m.genres || []).map((g: string) => GENRE_MAP_AR[g] || g);
  const latestEp = m.nextAiringEpisode?.episode
    ? Math.max(1, m.nextAiringEpisode.episode - 1)
    : m.episodes || 12;

  return {
    _id: id,
    id: `${id}-episode-${latestEp}`,
    mal_id: Number(id),
    title,
    title_english: title,
    posterUrl,
    imageUrl: posterUrl,
    thumbnailUrl: posterUrl,
    bannerUrl: m.bannerImage || posterUrl,
    rating,
    score: rating,
    genres,
    status: m.status === 'RELEASING' ? 'مستمر' : 'مكتمل',
    episodes: m.episodes || 12,
    episodesCount: m.episodes || 12,
    episode: String(latestEp),
    episodeNumber: String(latestEp),
    releaseYear: String(m.seasonYear || 2025),
    season: (m.season || 'winter').toLowerCase(),
    animeId: {
      _id: id,
      id,
      mal_id: Number(id),
      title,
      titleAr: title,
      posterUrl,
      thumbnailUrl: posterUrl
    }
  };
}

export async function handleFrontendFallback(path: string, options?: any): Promise<Response | null> {
  const urlObj = new URL(path, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
  const cleanPath = urlObj.pathname;

  try {
    // ========================================================================
    // 1. LIVE DASHBOARD (تغذية الصفحة الرئيسية مباشرة من الإنترنت في الـ APK)
    // ========================================================================
    if (cleanPath === '/api/dashboard') {
      try {
        const gql = `
          query {
            trending: Page(page: 1, perPage: 8) {
              media(type: ANIME, sort: TRENDING_DESC, isAdult: false) {
                ${ANILIST_CARD_FRAGMENT}
              }
            }
            releasing: Page(page: 1, perPage: 20) {
              media(type: ANIME, status: RELEASING, sort: POPULARITY_DESC, isAdult: false) {
                ${ANILIST_CARD_FRAGMENT}
              }
            }
            popular: Page(page: 1, perPage: 16) {
              media(type: ANIME, sort: POPULARITY_DESC, isAdult: false) {
                ${ANILIST_CARD_FRAGMENT}
              }
            }
          }
        `;
        const data = await queryAniListDirect(gql);
        if (data?.trending?.media?.length > 0) {
          const top5 = data.trending.media.map(mapMediaToCard);
          const recentEpisodes = (data.releasing?.media || []).map(mapMediaToCard);
          const popular = (data.popular?.media || []).map(mapMediaToCard);
          return createSimulatedResponse({
            success: true,
            data: {
              top5,
              recentEpisodes: recentEpisodes.length > 0 ? recentEpisodes : getCuratedRecentEpisodes(),
              popular: popular.length > 0 ? popular : getCuratedSeasonAnime().slice(0, 10),
              currentSeason: recentEpisodes.length > 0 ? recentEpisodes : getCuratedSeasonAnime(),
              schedule: top5
            }
          });
        }
      } catch {}

      return createSimulatedResponse({
        success: true,
        data: {
          top5: getCuratedTop5(),
          recentEpisodes: getCuratedRecentEpisodes(),
          popular: getCuratedSeasonAnime().slice(0, 10),
          currentSeason: getCuratedSeasonAnime(),
          schedule: getCuratedTop5()
        }
      });
    }

    // ========================================================================
    // 2. RECENT EPISODES & SEASON ANIME (حلقات ومواسم حية)
    // ========================================================================
    if (cleanPath === '/api/anime/recent') {
      try {
        const gql = `
          query {
            Page(page: 1, perPage: 24) {
              media(type: ANIME, status: RELEASING, sort: UPDATED_AT_DESC, isAdult: false) {
                ${ANILIST_CARD_FRAGMENT}
              }
            }
          }
        `;
        const data = await queryAniListDirect(gql);
        if (data?.Page?.media?.length > 0) {
          return createSimulatedResponse({
            success: true,
            data: data.Page.media.map(mapMediaToCard)
          });
        }
      } catch {}

      return createSimulatedResponse({
        success: true,
        data: getCuratedRecentEpisodes()
      });
    }

    if (cleanPath === '/api/anime/season') {
      const season = (urlObj.searchParams.get('season') || '').toUpperCase();
      const year = Number(urlObj.searchParams.get('year')) || undefined;
      try {
        const validSeasons = ['WINTER', 'SPRING', 'SUMMER', 'FALL'];
        const isSpecific = validSeasons.includes(season) && year;
        const gql = isSpecific
          ? `
            query ($season: MediaSeason, $year: Int) {
              Page(page: 1, perPage: 30) {
                media(type: ANIME, season: $season, seasonYear: $year, sort: POPULARITY_DESC, isAdult: false) {
                  ${ANILIST_CARD_FRAGMENT}
                }
              }
            }
          `
          : `
            query {
              Page(page: 1, perPage: 30) {
                media(type: ANIME, status: RELEASING, sort: POPULARITY_DESC, isAdult: false) {
                  ${ANILIST_CARD_FRAGMENT}
                }
              }
            }
          `;
        const data = await queryAniListDirect(gql, isSpecific ? { season, year } : {});
        if (data?.Page?.media?.length > 0) {
          return createSimulatedResponse({
            success: true,
            data: data.Page.media.map(mapMediaToCard)
          });
        }
      } catch {}

      return createSimulatedResponse({
        success: true,
        data: getCuratedSeasonAnime(season, year)
      });
    }

    // ========================================================================
    // 3. LIVE SEARCH (بحث حي شامل في آلاف الأنميات من داخل الـ APK)
    // ========================================================================
    if (cleanPath === '/api/anime/search') {
      const q = (urlObj.searchParams.get('q') || '').trim();
      const statusParam = (urlObj.searchParams.get('status') || '').toLowerCase();
      const yearParam = urlObj.searchParams.get('year') || '';

      try {
        const gql = `
          query ($search: String, $status: MediaStatus, $seasonYear: Int) {
            Page(page: 1, perPage: 28) {
              media(type: ANIME, search: $search, status: $status, seasonYear: $seasonYear, sort: POPULARITY_DESC, isAdult: false) {
                ${ANILIST_CARD_FRAGMENT}
              }
            }
          }
        `;
        const vars: Record<string, any> = {};
        if (q) vars.search = q;
        if (statusParam === 'airing') vars.status = 'RELEASING';
        if (statusParam === 'complete') vars.status = 'FINISHED';
        if (yearParam && !isNaN(Number(yearParam))) vars.seasonYear = Number(yearParam);

        const data = await queryAniListDirect(gql, vars);
        if (data?.Page?.media?.length > 0) {
          return createSimulatedResponse({
            success: true,
            data: data.Page.media.map(mapMediaToCard),
            pagination: { has_next_page: false, current_page: 1 }
          });
        }
      } catch {}

      const lowerQ = q.toLowerCase();
      const filtered = CURATED_ANIME_LIST.filter(a =>
        !lowerQ ||
        a.title.toLowerCase().includes(lowerQ) ||
        a.title_english.toLowerCase().includes(lowerQ) ||
        a.synopsis.toLowerCase().includes(lowerQ)
      ).map(a => ({
        _id: String(a.mal_id),
        title: a.title_english || a.title,
        posterUrl: a.posterUrl,
        rating: a.rating,
        genres: a.genres,
        episodesCount: a.episodes || 12,
        status: a.status
      }));

      return createSimulatedResponse({
        success: true,
        data: filtered,
        pagination: { has_next_page: false, current_page: 1 }
      });
    }

    // ========================================================================
    // 4. LIVE ANIME DETAILS + ARABIC SYNOPSIS + RELATIONS + CHARACTERS
    // ========================================================================
    if (cleanPath.startsWith('/api/anime/details/')) {
      const rawId = cleanPath.replace('/api/anime/details/', '');
      const numId = Number(String(rawId).split('-')[0]);

      if (!isNaN(numId) && numId > 0) {
        try {
          const gql = `
            query ($idMal: Int) {
              Media(idMal: $idMal, type: ANIME) {
                ${ANILIST_CARD_FRAGMENT}
                relations {
                  edges {
                    relationType(version: 2)
                    node {
                      id
                      idMal
                      type
                      format
                      title {
                        romaji
                        english
                      }
                      coverImage {
                        large
                      }
                      episodes
                      seasonYear
                    }
                  }
                }
                charactersPage1: characters(sort: [ROLE, RELEVANCE], page: 1, perPage: 25) {
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
                }
                charactersPage2: characters(sort: [ROLE, RELEVANCE], page: 2, perPage: 25) {
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
                }
                charactersPage3: characters(sort: [ROLE, RELEVANCE], page: 3, perPage: 25) {
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
                }
                streamingEpisodes {
                  thumbnail
                }
                recommendations(sort: RATING_DESC, perPage: 8) {
                  nodes {
                    mediaRecommendation {
                      id
                      idMal
                      title {
                        romaji
                        english
                      }
                      coverImage {
                        large
                      }
                    }
                  }
                }
              }
            }
          `;
          const data = await queryAniListDirect(gql, { idMal: numId });
          const media = data?.Media;
          if (media) {
            const title = media.title?.english || media.title?.romaji || 'Anime';
            const posterUrl = media.coverImage?.extraLarge || media.coverImage?.large || '';
            const totalEps = Math.min(
              media.episodes || (media.nextAiringEpisode?.episode ? media.nextAiringEpisode.episode - 1 : 12) || 12,
              1200
            );
            const episodesList = Array.from({ length: Math.max(1, totalEps) }, (_, i) => ({
              id: `${numId}-episode-${i + 1}`,
              num: String(i + 1),
              title: `الحلقة ${i + 1}`,
              seasonNumber: 1,
              link: `/anime/${numId}/episode/${i + 1}`
            }));

            const arabicDesc = await translateTextToArabicClient(media.description || '');

            const related = (media.relations?.edges || [])
              .filter((e: any) => {
                if (!e?.node || e.node.type !== 'ANIME') return false;
                const rt = String(e.relationType || '').toUpperCase();
                if (rt === 'CHARACTER' || rt === 'ADAPTATION') return false;
                return true;
              })
              .map((e: any) => ({
                relation: e.relationType ? e.relationType.replace(/_/g, ' ') : 'Sequel',
                name: e.node.title?.english || e.node.title?.romaji || 'Anime',
                mal_id: e.node.idMal || e.node.id,
                type: e.node.format || 'TV',
                format: e.node.format || 'TV',
                year: e.node.seasonYear || '',
                posterUrl: e.node.coverImage?.large || posterUrl
              }));

            const allCharEdges = [
              ...(media.charactersPage1?.edges || []),
              ...(media.charactersPage2?.edges || []),
              ...(media.charactersPage3?.edges || []),
              ...(media.characters?.edges || [])
            ];
            const seenCharIds = new Set<any>();
            const characters = allCharEdges
              .filter((c: any) => {
                const cid = c?.node?.id;
                if (!cid || seenCharIds.has(cid)) return false;
                seenCharIds.add(cid);
                return true;
              })
              .map((c: any) => ({
                id: c.node?.id,
                name: c.node?.name?.full || 'شخصية',
                role: c.role === 'MAIN' ? 'رئيسي (Main)' : 'مساند (Supporting)',
                imageUrl: c.node?.image?.large || posterUrl,
                voiceActor: c.voiceActors?.[0]
                  ? {
                      name: c.voiceActors[0].name?.full || '',
                      imageUrl: c.voiceActors[0].image?.large || ''
                    }
                  : null
              }));

            const mediaPictures = Array.from(
              new Set(
                [
                  posterUrl,
                  media.bannerImage,
                  ...(media.streamingEpisodes || []).slice(0, 36).map((ep: any) => ep?.thumbnail)
                ].filter(Boolean)
              )
            );

            const jikanRecommendations = (media.recommendations?.nodes || [])
              .map((n: any) => n?.mediaRecommendation)
              .filter(Boolean)
              .map((rec: any) => ({
                id: rec.idMal || rec.id,
                title: rec.title?.english || rec.title?.romaji || 'Anime',
                posterUrl: rec.coverImage?.large || posterUrl
              }));

            return createSimulatedResponse({
              success: true,
              data: {
                _id: String(numId),
                malId: numId,
                anilistId: media.id,
                title,
                englishTitle: title,
                posterUrl,
                bannerUrl: media.bannerImage || posterUrl,
                description: arabicDesc || 'قصة هذا الأنمي متوفرة ومحدثة.',
                episodes: episodesList,
                seasonsList: [
                  {
                    seasonNumber: 1,
                    title: 'الموسم 1',
                    malId: numId,
                    posterUrl,
                    episodesCount: episodesList.length,
                    episodes: episodesList
                  }
                ],
                activeSeason: 1,
                genres: (media.genres || []).map((g: string) => GENRE_MAP_AR[g] || g),
                rating: media.averageScore ? Number((media.averageScore / 10).toFixed(1)) : 8.5,
                status: media.status === 'RELEASING' ? 'مستمر' : 'مكتمل',
                type: media.format || 'TV',
                episodesCount: String(totalEps),
                releaseYear: String(media.seasonYear || 2025),
                season: `${media.season || 'WINTER'} ${media.seasonYear || 2025}`,
                characters,
                related,
                jikanRecommendations,
                pictures: mediaPictures
              }
            });
          }
        } catch {}
      }

      return createSimulatedResponse({
        success: true,
        data: getCuratedAnimeById(rawId)
      });
    }

    // ========================================================================
    // 5. SYNOPSIS TRANSLATION ENDPOINT FOR APK
    // ========================================================================
    if (cleanPath === '/api/anime/translate-synopsis') {
      let bodyObj: any = {};
      try {
        if (options?.body) {
          bodyObj = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
        }
      } catch {}
      const translated = await translateTextToArabicClient(bodyObj?.text || '');
      return createSimulatedResponse({
        success: true,
        translated
      });
    }

    if (cleanPath.startsWith('/api/anime/poster/')) {
      const animeId = cleanPath.replace('/api/anime/poster/', '');
      const details = getCuratedAnimeById(animeId);
      return createSimulatedResponse({
        success: true,
        posterUrl: details.posterUrl
      });
    }

    // ========================================================================
    // 6. SCHEDULE TIMETABLE
    // ========================================================================
    if (cleanPath === '/api/anime/jikan-schedule' || cleanPath === '/api/anime/schedule') {
      const day = (urlObj.searchParams.get('day') || 'sunday').toLowerCase();
      const filtered = CURATED_ANIME_LIST.filter(a => a.broadcastDay === day);
      const list = (filtered.length > 0 ? filtered : CURATED_ANIME_LIST).map((a, idx) => ({
        mal_id: a.mal_id,
        title: a.title_english || a.title,
        title_english: a.title_english || a.title,
        images: { jpg: { large_image_url: a.posterUrl, image_url: a.posterUrl } },
        score: a.rating,
        episodes: a.episodes,
        year: Number(a.releaseYear) || 2025,
        broadcast: { time: `${17 + (idx % 6)}:00`, day: a.broadcastDay },
        genres: a.genres.map(g => ({ name: g })),
        studios: [{ name: 'MAPPA / Ufotable' }],
        synopsis: a.synopsis
      }));
      return createSimulatedResponse({
        success: true,
        data: list
      });
    }

    // ========================================================================
    // 7. PICTURES GALLERY (صور خاصة بالأنمي المفتوح فقط بدون أنميات أخرى)
    // ========================================================================
    if (cleanPath.startsWith('/api/anime/pictures/')) {
      const animeId = cleanPath.replace('/api/anime/pictures/', '');
      const numId = Number(String(animeId).split('-')[0]);
      if (!isNaN(numId) && numId > 0) {
        try {
          const jikanRes = await nativeFetch(`https://api.jikan.moe/v4/anime/${numId}/pictures`);
          if (jikanRes.ok) {
            const jikanJson = await jikanRes.json();
            const pics = (jikanJson?.data || [])
              .map((p: any) => p.jpg?.large_image_url || p.jpg?.image_url || p.large_image_url)
              .filter(Boolean);
            if (pics.length > 0) {
              return createSimulatedResponse({
                success: true,
                pictures: Array.from(new Set(pics))
              });
            }
          }
        } catch {}
      }
      const details = getCuratedAnimeById(animeId);
      return createSimulatedResponse({
        success: true,
        pictures: details.pictures || [details.posterUrl]
      });
    }

    // ========================================================================
    // 8. STREAMING & DOWNLOAD SERVERS FOR EPISODES
    // ========================================================================
    if (cleanPath === '/api/anime/servers') {
      const serversList = [
        {
          serverName: 'Vidmoly',
          url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
          type: 'direct',
          quality: '1080p',
          category: 'watch'
        },
        {
          serverName: 'Mega',
          url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
          type: 'direct',
          quality: '1080p',
          category: 'watch'
        },
        {
          serverName: 'Risto',
          url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
          type: 'direct',
          quality: '720p',
          category: 'watch'
        },
        {
          serverName: 'MP4Upload',
          url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
          type: 'direct',
          quality: '720p',
          category: 'watch'
        },
        {
          serverName: 'Uqload',
          url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4',
          type: 'direct',
          quality: '480p',
          category: 'watch'
        },
        {
          serverName: 'Sendvid',
          url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoy.mp4',
          type: 'direct',
          quality: '480p',
          category: 'watch'
        },
        {
          serverName: 'Mega',
          url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
          type: 'direct',
          quality: '1080p',
          category: 'download'
        },
        {
          serverName: 'MP4Upload',
          url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
          type: 'direct',
          quality: '1080p',
          category: 'download'
        },
        {
          serverName: 'MediaFire',
          url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
          type: 'direct',
          quality: '720p',
          category: 'download'
        },
        {
          serverName: 'Uqload',
          url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
          type: 'direct',
          quality: '480p',
          category: 'download'
        }
      ];

      return createSimulatedResponse({
        success: true,
        data: serversList
      });
    }

    if (cleanPath === '/api/anime/extract') {
      let bodyObj: any = {};
      try {
        if (options?.body) {
          bodyObj = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
        }
      } catch {}
      const targetUrl = bodyObj?.url || '';
      const isDirectVideo = targetUrl.includes('.mp4') || targetUrl.includes('.m3u8');
      const finalStream = isDirectVideo
        ? targetUrl
        : 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4';

      return createSimulatedResponse({
        success: true,
        data: {
          directUrl: finalStream,
          type: finalStream.includes('.m3u8') ? 'hls' : 'direct',
          sources: [
            { file: finalStream, label: 'FHD', type: 'mp4' },
            { file: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4', label: 'HD', type: 'mp4' },
            { file: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4', label: 'SD', type: 'mp4' }
          ]
        }
      });
    }

    // ========================================================================
    // 9. GENRES LIST
    // ========================================================================
    if (cleanPath === '/api/anime/genres') {
      return createSimulatedResponse({
        success: true,
        data: CURATED_GENRES_LIST
      });
    }

    // ========================================================================
    // 10. ANTI-CHEAT QUIZ
    // ========================================================================
    if (cleanPath === '/api/ai/anti-cheat') {
      const title = urlObj.searchParams.get('title') || 'الأنمي';
      return createSimulatedResponse({
        success: true,
        data: {
          question: `ما هو الدافع الأساسي لأحداث أنمي "${title}"؟`,
          options: [
            'حماية الأصدقاء وتجاوز العقبات المستحيلة لتحقيق الهدف الأسمى ⚔️',
            'البحث عن وظيفة مكتبية تقليدية فقط 💼',
            'برنامج طبخ وثائقي قديم 🍲',
            'لا توجد أي حبكة أو صراع في القصة 💤'
          ],
          correct: 0
        }
      });
    }
  } catch (err) {
    console.error(`[FrontendFallback] Error handling ${cleanPath}:`, err);
  }

  return null;
}

function createSimulatedResponse(data: any): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'X-Simulated-Frontend-Proxy': 'true'
    }
  });
}
