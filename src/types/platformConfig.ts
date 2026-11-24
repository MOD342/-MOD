export type BannerStyle = 'classic' | 'split' | 'glass' | 'spotlight';

export type AnimeSliderMode =
  | 'best_season'
  | 'trending_season'
  | 'all_time_best'
  | 'classic_historical'
  | 'custom';

export type MangaSliderMode =
  | 'trending'
  | 'latest'
  | 'manhwa_kr'
  | 'manga_jp'
  | 'manhua_cn'
  | 'custom';

export interface BannerCustomItem {
  _id: string;
  title: string;
  posterUrl: string;
  bannerUrl?: string;
  rating?: number;
  genres?: string[];
  originLabel?: string;
  chaptersCount?: number | null;
  status?: string;
  badgeText?: string;
}

export interface AnimeSectionsVisibility {
  continueWatching: boolean;
  latestEpisodes: boolean;
  trending: boolean;
  currentSeason: boolean;
  topAnime: boolean;
  movies: boolean;
  schedule: boolean;
  quotes: boolean;
}

export interface MangaSectionsVisibility {
  continueReading: boolean;
  trending: boolean;
  latestCatalog: boolean;
}

export interface DualHomeConfig {
  defaultVisitorHome: 'anime' | 'manga';
  enableAnimeHome: boolean;
  enableMangaHome: boolean;
  animeSections: AnimeSectionsVisibility;
  mangaSections: MangaSectionsVisibility;
}

export interface PlatformSliderConfig {
  // Anime Banner
  limit: number;
  season: string;
  sliderMode: AnimeSliderMode;
  animeBannerStyle: BannerStyle;
  customAnime: BannerCustomItem[];
  speed: number;
  globalAnnouncement: string;
  // Manga Banner
  mangaBannerLimit: number;
  mangaSliderMode: MangaSliderMode;
  mangaBannerStyle: BannerStyle;
  customMangaBanner: BannerCustomItem[];
  mangaBannerSpeed: number;
  mangaAnnouncement: string;
  // Dual Homes
  dualHomeConfig: DualHomeConfig;
}

export const DEFAULT_DUAL_HOME_CONFIG: DualHomeConfig = {
  defaultVisitorHome: 'anime',
  enableAnimeHome: true,
  enableMangaHome: true,
  animeSections: {
    continueWatching: true,
    latestEpisodes: true,
    trending: true,
    currentSeason: true,
    topAnime: true,
    movies: true,
    schedule: true,
    quotes: true,
  },
  mangaSections: {
    continueReading: true,
    trending: true,
    latestCatalog: true,
  },
};

export const DEFAULT_PLATFORM_SLIDER_CONFIG: PlatformSliderConfig = {
  limit: 5,
  season: 'auto',
  sliderMode: 'best_season',
  animeBannerStyle: 'classic',
  customAnime: [],
  speed: 4,
  globalAnnouncement: '',
  mangaBannerLimit: 5,
  mangaSliderMode: 'trending',
  mangaBannerStyle: 'split',
  customMangaBanner: [],
  mangaBannerSpeed: 5,
  mangaAnnouncement: '',
  dualHomeConfig: DEFAULT_DUAL_HOME_CONFIG,
};

export const BANNER_STYLE_OPTIONS: {
  id: BannerStyle;
  label: string;
  description: string;
}[] = [
  {
    id: 'classic',
    label: 'المسرح الكامل',
    description: 'عرض سينمائي موحّد كامل الحافة يندمج بسلاسة مع الشريط العلوي',
  },
  {
    id: 'split',
    label: 'البطاقة التحريرية',
    description: 'غلاف بارز أمام خلفية من عمل الأنمي نفسه بتفاصيل نظيفة',
  },
  {
    id: 'glass',
    label: 'دوار البطاقات الزجاجي',
    description: 'شريط بطاقات عمودية متناسقة مع لمحة من البطاقات المجاورة',
  },
  {
    id: 'spotlight',
    label: 'المعرض وشريط الأغلفة',
    description: 'مسرح سينمائي موحّد في الأعلى مع شريط أغلفة عمودية للتنقل',
  },
];

export function normalizeDualHomeConfig(raw?: Partial<DualHomeConfig> | null): DualHomeConfig {
  return {
    defaultVisitorHome: raw?.defaultVisitorHome === 'manga' ? 'manga' : 'anime',
    enableAnimeHome: raw?.enableAnimeHome !== false,
    enableMangaHome: raw?.enableMangaHome !== false,
    animeSections: {
      ...DEFAULT_DUAL_HOME_CONFIG.animeSections,
      ...(raw?.animeSections || {}),
    },
    mangaSections: {
      ...DEFAULT_DUAL_HOME_CONFIG.mangaSections,
      ...(raw?.mangaSections || {}),
    },
  };
}
