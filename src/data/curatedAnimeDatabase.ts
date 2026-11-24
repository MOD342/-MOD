// قاعدة بيانات الأنميات الحديثة - لضمان أحدث الحلقات وأسماء الأنمي الصافية
export interface CuratedAnime {
  mal_id: number;
  title: string;
  title_english: string;
  posterUrl: string;
  bannerUrl?: string;
  rating: number;
  genres: string[];
  status: string;
  episodes: number;
  latestEpisode: number;
  synopsis: string;
  releaseYear: string;
  season: string;
  broadcastDay: string;
  characters?: Array<{ name: string; imageUrl?: string }>;
}

// وضع الاتصال المباشر الحي 100%: تم تفريغ وحذف جميع قوائم الأنمي الثابتة القديمة من المشروع
export const CURATED_ANIME_LIST: CuratedAnime[] = [];

import { GENRE_TAXONOMY } from "../utils/genreTaxonomy";

export const CURATED_GENRES_LIST = GENRE_TAXONOMY.map((g) => ({
  mal_id: g.mal_id,
  name: g.name,
  nameAr: g.nameAr,
}));

export function getCuratedRecentEpisodes(): any[] {
  return CURATED_ANIME_LIST.map((anime, index) => ({
    _id: `recent-curated-${anime.mal_id}-${index}`,
    id: `${anime.mal_id}-episode-${anime.latestEpisode}`,
    title: anime.title_english || anime.title,
    episode: String(anime.latestEpisode),
    episodeNumber: String(anime.latestEpisode),
    imageUrl: anime.posterUrl,
    posterUrl: anime.posterUrl,
    thumbnailUrl: anime.posterUrl,
    link: `/anime/${anime.mal_id}`,
    animeId: {
      _id: String(anime.mal_id),
      id: String(anime.mal_id),
      mal_id: anime.mal_id,
      title: anime.title_english || anime.title,
      titleAr: anime.title_english || anime.title,
      posterUrl: anime.posterUrl,
      thumbnailUrl: anime.posterUrl,
    },
  }));
}

export function getCuratedTop5(): any[] {
  return CURATED_ANIME_LIST.slice(0, 8).map((anime) => ({
    _id: String(anime.mal_id),
    title: anime.title_english || anime.title,
    posterUrl: anime.posterUrl,
    rating: anime.rating,
    genres: anime.genres,
  }));
}

export function getCuratedSeasonAnime(season?: string, year?: string | number): any[] {
  let list = CURATED_ANIME_LIST;
  if (season && season !== 'now' && season !== 'auto') {
    const filtered = list.filter(a => a.season.toLowerCase() === season.toLowerCase());
    if (filtered.length > 0) list = filtered;
  }
  if (year && season !== 'now' && season !== 'auto') {
    const filteredYear = list.filter(a => a.releaseYear === String(year));
    if (filteredYear.length > 0) list = filteredYear;
  }
  return list.map((anime) => ({
    _id: String(anime.mal_id),
    title: anime.title_english || anime.title,
    posterUrl: anime.posterUrl,
    rating: anime.rating,
    genres: anime.genres,
    status: anime.status,
    releaseYear: anime.releaseYear,
    season: anime.season,
  }));
}

export function getCuratedAnimeById(id: string | number): any {
  const idStr = String(id || '').trim();
  return {
    _id: idStr,
    title: '',
    englishTitle: '',
    posterUrl: '',
    bannerUrl: '',
    description: '',
    episodes: [],
    genres: [],
    rating: 0,
    status: 'مستمر',
    type: 'TV',
    episodesCount: '0',
    releaseYear: '',
    season: '',
    characters: [],
    related: [],
    jikanRecommendations: [],
    pictures: []
  };
}

