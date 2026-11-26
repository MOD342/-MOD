import {
  Play,
  Star,
  RefreshCw,
  ChevronLeft,
  Quote,
  Tv,
  Sparkles,
  X,
  Flame,
  CalendarDays,
  Trash2,
  Clock,
  AlertCircle,
  Shuffle,
  Film,
  Crown
} from 'lucide-react';
import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { clientCache } from '../utils/clientCache';
import { cloudCatalogService, recentEpisodesLocal } from '../services/cloudCatalogService';
import { db } from '../firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../firebaseUtils';
import { cleanAnimeTitle } from '../utils/animeTitleCleaner';
import PullToRefresh from '../components/PullToRefresh';
import { useAuth } from '../contexts/AuthContext';
import { listService, watchHistoryService } from '../services/listService';
import { useDeviceDisplay } from '../hooks/useDeviceDisplay';
import CinematicHeroBanner from '../components/CinematicHeroBanner';
import { LongPressCopy } from '../components/LongPressCopy';
import {
  DEFAULT_DUAL_HOME_CONFIG,
  normalizeDualHomeConfig,
  type BannerStyle,
  type DualHomeConfig,
} from '../types/platformConfig';
import { FALLBACK_POSTER_DATA_URL } from '../utils/posterFallback';

interface HomeViewProps {
  onAnimeClick?: (animeId: string, epNum?: string) => void;
  onMangaClick?: (mangaId: string) => void;
  onNavigateToMangaHub?: () => void;
  onReadMangaChapter?: (params: {
    manga: any;
    chapter: any;
    chapters: any[];
    initialPage?: number;
  }) => void;
  onSearchCategory?: (category: string) => void;
  onNavigateToSchedule?: (targetDay?: string) => void;
  onNavigateToRecent?: () => void;
  onNavigateToSeason?: () => void;
  onNavigateToMovies?: () => void;
  onNavigateToTopAnime?: () => void;
}

interface LegendaryAnimeQuote {
  id: string;
  quoteAr: string;
  characterAr: string;
  animeTitle: string;
  animeId: string;
  accentColor: string;
}

const LEGENDARY_ANIME_QUOTES: LegendaryAnimeQuote[] = [
  {
    id: 'q-luffy',
    quoteAr: 'لا يهم مدى استحالة الأمر، لا تفقد أبداً شغفك وابتسامتك في وجه العاصفة.',
    characterAr: 'مونكي دي لوفي',
    animeTitle: 'One Piece',
    animeId: '21',
    accentColor: '#FF1744'
  },
  {
    id: 'q-jinwoo',
    quoteAr: 'عندما تقف وحيداً أمام الهاوية، إما أن يبتلعك الظلام أو تصبح أنت سيّد الظلال.',
    characterAr: 'سونغ جين وو',
    animeTitle: 'Solo Leveling',
    animeId: '56163',
    accentColor: '#A855F7'
  },
  {
    id: 'q-ichigo',
    quoteAr: 'إذا كان القدر حجر رحى يسحقنا، فسنحطّمه بنصلنا ونصنع طريقنا بأيدينا.',
    characterAr: 'كوروساكي إيتشيغو',
    animeTitle: 'Bleach: Thousand-Year Blood War',
    animeId: '41467',
    accentColor: '#F59E0B'
  },
  {
    id: 'q-tanjiro',
    quoteAr: 'مهما انكسرت روحك، أشعل قلبك من جديد وانهض، فالضعفاء لا يملكون رفاهية الاستسلام.',
    characterAr: 'كامادو تانجيرو',
    animeTitle: 'Demon Slayer',
    animeId: '38000',
    accentColor: '#10B981'
  },
  {
    id: 'q-isagi',
    quoteAr: 'البطل لا ينتظر الفرصة لتسقط أمامه، بل يلتهم الملعب ويعيد تشكيل الواقع لصالحه.',
    characterAr: 'إيساغي يويتشي',
    animeTitle: 'Blue Lock',
    animeId: '58514',
    accentColor: '#3B82F6'
  },
  {
    id: 'q-subaru',
    quoteAr: 'حتى لو نسي الجميع كم مرة سقطت ونزفت لأجلهم، سأعيد المحاولة حتى أصل للنهاية السعيدة.',
    characterAr: 'ناتسوكي سوبارو',
    animeTitle: 'Re:ZERO',
    animeId: '54857',
    accentColor: '#EC4899'
  }
];

const WEEK_DAYS = [
  { key: 'sunday', labelAr: 'الأحد' },
  { key: 'monday', labelAr: 'الإثنين' },
  { key: 'tuesday', labelAr: 'الثلاثاء' },
  { key: 'wednesday', labelAr: 'الأربعاء' },
  { key: 'thursday', labelAr: 'الخميس' },
  { key: 'friday', labelAr: 'الجمعة' },
  { key: 'saturday', labelAr: 'السبت' }
];

export default function HomeView({
  onAnimeClick,
  onMangaClick,
  onNavigateToMangaHub,
  onReadMangaChapter,
  onSearchCategory,
  onNavigateToSchedule,
  onNavigateToRecent,
  onNavigateToSeason,
  onNavigateToMovies,
  onNavigateToTopAnime
}: HomeViewProps) {
  const { user, userData } = useAuth();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshingRecent, setRefreshingRecent] = useState(false);
  const [recentDeviceState, setRecentDeviceState] = useState<{ items: any[]; fetchedAt: number }>(() => {
    const cached = recentEpisodesLocal.getCached(1);
    return cached ? { items: cached.items, fetchedAt: cached.fetchedAt } : { items: [], fetchedAt: 0 };
  });
  const todayKey = WEEK_DAYS[new Date().getDay()].key;
  const ramSeedDashboard = useMemo(
    () => cloudCatalogService.peekBundleRam<any>('dashboard', `dash_v8_${todayKey}_auto_best_season`),
    [todayKey],
  );
  const [dashboardError, setDashboardError] = useState(false);
  const [initialLoading, setInitialLoading] = useState(() => !ramSeedDashboard);

  // Today's schedule on Home View
  const selectedScheduleDay = todayKey;

  // Interactive Anime Quotes State
  const [quoteIndex, setQuoteIndex] = useState<number>(0);
  const currentQuote = LEGENDARY_ANIME_QUOTES[quoteIndex % LEGENDARY_ANIME_QUOTES.length];

  const prefetchDetails = (id: string | number) => clientCache.prefetchDetails(id);

  const getFallbackDashboard = () => ({
    top5: [],
    recentEpisodes: [],
    popular: [],
    currentSeason: [],
    schedule: [],
    movies: [],
    topAnime: []
  });

  const [dashboard, setDashboard] = useState<{
    top5: any[];
    recentEpisodes: any[];
    popular: any[];
    currentSeason: any[];
    schedule: any[];
    movies: any[];
    topAnime: any[];
  }>(() => ramSeedDashboard || getFallbackDashboard());

  const [history, setHistory] = useState<any[]>(() =>
    watchHistoryService.getLocalHistory(user?.id, userData?.privacySettings)
  );
  const [animeCuration, setAnimeCuration] = useState<{
    pinnedAnime: any[];
    hiddenAnime: any[];
  }>({ pinnedAnime: [], hiddenAnime: [] });

  const [sliderSettings, setSliderSettings] = useState<{
    limit: number;
    season: string;
    sliderMode: string;
    animeBannerStyle: BannerStyle;
    customAnime: any[];
    speed: number;
    globalAnnouncement: string;
    dualHomeConfig: DualHomeConfig;
  }>({
    limit: 5,
    season: 'auto',
    sliderMode: 'best_season',
    animeBannerStyle: 'classic',
    customAnime: [],
    speed: 4,
    globalAnnouncement: '',
    dualHomeConfig: DEFAULT_DUAL_HOME_CONFIG,
  });

  const displayTop5 =
    sliderSettings.sliderMode === 'custom' &&
    Array.isArray(sliderSettings.customAnime) &&
    sliderSettings.customAnime.length > 0
      ? sliderSettings.customAnime
      : dashboard.top5 && dashboard.top5.length > 0
      ? dashboard.top5
      : [];
  const clampedAdminLimit = Math.min(10, Math.max(1, Number(sliderSettings.limit) || 5));
  const animeSec = sliderSettings.dualHomeConfig.animeSections;

  const fetchDashboard = async (customSeason?: string, customSliderMode?: string, forceBypass = false) => {
    setIsRefreshing(true);
    try {
      const daysMap = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const clientDay = daysMap[new Date().getDay()];
      const activeSeason = customSeason || sliderSettings.season || 'auto';
      const activeMode = customSliderMode || sliderSettings.sliderMode || 'best_season';
      const bundleId = `dash_v8_${clientDay}_${activeSeason}_${activeMode}`;

      const applyDashboardData = (data: any) => {
        if (!data) return;
        const hasAnyContent =
          data.top5?.length > 0 ||
          data.popular?.length > 0 ||
          data.currentSeason?.length > 0 ||
          data.schedule?.length > 0 ||
          data.movies?.length > 0 ||
          data.topAnime?.length > 0;
        if (hasAnyContent) {
          setDashboard(data);
          setDashboardError(false);
        }
      };

      const freshData = await cloudCatalogService.getBundleWithCloud<any>({
        bundleId,
        kind: 'dashboard',
        freshTtlMs: 6 * 60 * 60 * 1000,
        staleTtlMs: 36 * 60 * 60 * 1000,
        forceRefresh: forceBypass,
        countItems: (d) =>
          (Array.isArray(d?.top5) ? d.top5.length : 0) +
          (Array.isArray(d?.popular) ? d.popular.length : 0) +
          (Array.isArray(d?.currentSeason) ? d.currentSeason.length : 0) +
          (Array.isArray(d?.schedule) ? d.schedule.length : 0),
        fetchLive: async () => {
          const ts = forceBypass ? `&_t=${Date.now()}` : '';
          const res = await fetch(
            `/api/dashboard?day=${clientDay}&season=${activeSeason}&sliderMode=${activeMode}&excludeRecent=1${forceBypass ? '&bypass=true' : ''}${ts}`,
            forceBypass ? { cache: 'no-store' } : undefined,
          );
          if (!res.ok) return null;
          const json = await res.json();
          return json?.success && json?.data ? json.data : null;
        },
        onData: (data) => applyDashboardData(data),
      });

      if (freshData) {
        applyDashboardData(freshData);
      } else {
        setDashboardError(true);
      }
    } catch (e) {
      console.warn('Direct dashboard fetch notice:', e);
      setDashboardError(true);
    } finally {
      setIsRefreshing(false);
      setInitialLoading(false);
    }
  };

  const handleRefreshRecentOnly = async (forceBypass = false) => {
    if (refreshingRecent) return;
    setRefreshingRecent(true);
    try {
      const updated = await recentEpisodesLocal.refreshFromLive(1, forceBypass);
      if (updated && updated.items.length > 0) {
        setRecentDeviceState({ items: updated.items, fetchedAt: updated.fetchedAt });
      }
    } catch {
      // Keep previously stored device episodes silently
    } finally {
      setRefreshingRecent(false);
    }
  };

  const handleOnDemandRefresh = async () => {
    if (isRefreshing) return;
    await Promise.all([
      fetchDashboard(undefined, undefined, true),
      handleRefreshRecentOnly(true),
    ]);
  };

  const cachedCloudHistoryRef = React.useRef<{ uid: string; items: any[] } | null>(null);
  const privacyKey = useMemo(() => JSON.stringify(userData?.privacySettings || null), [userData?.privacySettings]);

  // Load Continue Watching from scoped localStorage and cloud entries when signed in (respecting cleared/dismissed ledger)
  useEffect(() => {
    let active = true;
    const cloudPrivacy = userData?.privacySettings;
    const buildMerged = (cloudItems: any[], localList: any[], uid?: string) => {
      const filteredCloud = watchHistoryService.filterItems(cloudItems, uid, cloudPrivacy);
      const mergedMap = new Map<string, any>();
      [...filteredCloud, ...localList].forEach((item) => {
        const key = String(item.id);
        const prev = mergedMap.get(key);
        if (!prev || (item.updatedAt || 0) > (prev.updatedAt || 0)) {
          mergedMap.set(key, item);
        }
      });
      return watchHistoryService
        .filterItems(Array.from(mergedMap.values()), uid, cloudPrivacy)
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
        .slice(0, 20);
    };

    const syncHistory = async () => {
      const localList = watchHistoryService.getLocalHistory(user?.id, cloudPrivacy);

      if (active) setHistory(localList);

      if (user?.id) {
        if (cachedCloudHistoryRef.current?.uid === user.id) {
          if (active) setHistory(buildMerged(cachedCloudHistoryRef.current.items, localList, user.id));
          return;
        }
        try {
          const entries = await listService.getAnimeEntries(user.id);
          const cloudItems = entries
            .filter((e) => (Array.isArray(e.watchedEpisodes) && e.watchedEpisodes.length > 0) || e.status === 'watching')
            .map((e) => {
              const watched = Array.isArray(e.watchedEpisodes) ? e.watchedEpisodes : [];
              const lastEp = watched.length > 0 ? Math.max(...watched.map(Number).filter((n) => !isNaN(n))) : (e.progress || 1);
              const total = Number(e.episodesCount || 0);
              const pct = total > 0 ? Math.min(95, Math.max(15, Math.round((lastEp / total) * 100))) : 35;
              const ts = typeof e.updatedAt?.toMillis === 'function'
                ? e.updatedAt.toMillis()
                : (e.updatedAt?.seconds ? e.updatedAt.seconds * 1000 : new Date(e.updatedAt || 0).getTime() || 0);
              return {
                id: String((e as any).animeId || e.id),
                title: e.title,
                posterUrl: e.posterUrl,
                lastEpisode: String(lastEp || 1),
                progress: pct,
                updatedAt: ts
              };
            });

          cachedCloudHistoryRef.current = { uid: user.id, items: cloudItems };
          if (active) setHistory(buildMerged(cloudItems, localList, user.id));
          return;
        } catch {}
      } else {
        cachedCloudHistoryRef.current = null;
      }

      if (active) setHistory(localList);
    };

    void syncHistory();
    return () => {
      active = false;
    };
  }, [user?.id, privacyKey]);

  const handleRemoveHistoryItem = (e: React.MouseEvent, itemId: string | number) => {
    e.stopPropagation();
    const target = history.find((h) => String(h.id) === String(itemId));
    setHistory((prev) => prev.filter((h) => String(h.id) !== String(itemId)));
    watchHistoryService.removeItem(user?.id, itemId, target?.updatedAt, userData?.privacySettings);
  };

  const handleClearAllHistory = () => {
    const snapshot = history;
    setHistory([]);
    watchHistoryService.clearAll(user?.id, snapshot);
  };

  useEffect(() => {
    // Load dashboard immediately via 3-tier Cloud Catalog (Device -> Shared Cloud -> Live Server)
    void fetchDashboard('auto', 'best_season');

    // Device-only Recent Episodes: auto-fetch from fast server cache ONLY if device has zero stored episodes yet
    if (!recentEpisodesLocal.getCached(1)) {
      void handleRefreshRecentOnly(false);
    }

    let lastFetchedConfigKey = 'auto|best_season';

    const unsub = onSnapshot(
      doc(db, 'globalSettings', 'slider'),
      (snap) => {
        if (snap.exists()) {
          const fireConfigs = snap.data() as any;
          setSliderSettings((prev) => ({
            ...prev,
            ...fireConfigs,
            animeBannerStyle: fireConfigs.animeBannerStyle || prev.animeBannerStyle || 'classic',
            dualHomeConfig: normalizeDualHomeConfig(fireConfigs.dualHomeConfig),
          }));
          const nextSeason = fireConfigs.season || 'auto';
          const nextMode = fireConfigs.sliderMode || 'best_season';
          const nextKey = `${nextSeason}|${nextMode}`;
          if (nextKey !== lastFetchedConfigKey) {
            lastFetchedConfigKey = nextKey;
            void fetchDashboard(nextSeason, nextMode);
          }
        }
      },
      (err) => {
        console.warn('Failed to query real-time slider configs:', err);
        try {
          handleFirestoreError(err, OperationType.GET, 'globalSettings/slider');
        } catch {}
      }
    );

    const unsubCuration = onSnapshot(
      doc(db, 'globalSettings', 'animeCuration'),
      (snap) => {
        if (snap.exists()) {
          const d = snap.data();
          const cur = {
            pinnedAnime: Array.isArray(d.pinnedAnime) ? d.pinnedAnime : [],
            hiddenAnime: Array.isArray(d.hiddenAnime) ? d.hiddenAnime : []
          };
          setAnimeCuration(cur);
        }
      },
      () => {}
    );

    return () => {
      unsub();
      unsubCuration();
    };
  }, []);

  const categories = [
    'أكشن',
    'شريحة من الحياة',
    'إيسيكاي',
    'رومانسي',
    'كوميدي',
    'خيال علمي',
    'رياضي',
    'شونين',
    'غموض'
  ];

  const isHiddenByAdmin = (idOrItem: any, titleStr?: string) => {
    if (!animeCuration.hiddenAnime.length) return false;
    const targetId = String(
      idOrItem?.animeId?._id ||
        idOrItem?.animeId?.id ||
        idOrItem?._id ||
        idOrItem?.id ||
        idOrItem ||
        ''
    ).toLowerCase();
    const t = String(
      titleStr ||
        idOrItem?.animeId?.title ||
        idOrItem?.title ||
        ''
    )
      .toLowerCase()
      .trim();
    return animeCuration.hiddenAnime.some(
      (h: any) =>
        (h._id && String(h._id).toLowerCase() === targetId) ||
        (h.title && t && String(h.title).toLowerCase().trim() === t)
    );
  };

  const rawRecentEpisodes =
    recentDeviceState.items && recentDeviceState.items.length > 0
      ? recentDeviceState.items
      : dashboard.recentEpisodes && dashboard.recentEpisodes.length > 0
      ? dashboard.recentEpisodes
      : [];

  const displayRecentEpisodes = useMemo(() => {
    const filtered = rawRecentEpisodes.filter((ep: any) => !isHiddenByAdmin(ep));
    if (!animeCuration.pinnedAnime.length) return filtered;
    const pinnedFormatted = animeCuration.pinnedAnime.map((p: any, idx: number) => ({
      _id: `pinned-${p._id}-${idx}`,
      episodeNumber: p.pinnedEpisode || 'مُثبت',
      title: p.title,
      isPinned: true,
      animeId: {
        _id: p._id,
        title: p.title,
        titleAr: p.title,
        posterUrl: p.posterUrl,
        thumbnailUrl: p.posterUrl
      }
    }));
    const pinnedIds = new Set(animeCuration.pinnedAnime.map((p: any) => String(p._id)));
    const rest = filtered.filter(
      (ep: any) => !pinnedIds.has(String(ep.animeId?._id || ep._id))
    );
    return [...pinnedFormatted, ...rest];
  }, [rawRecentEpisodes, animeCuration]);

  const displayPopular = useMemo(() => {
    const list =
      dashboard.popular && dashboard.popular.length > 0
        ? dashboard.popular
        : [];
    return list.filter((a: any) => !isHiddenByAdmin(a));
  }, [dashboard.popular, animeCuration]);

  const displayCurrentSeason = useMemo(() => {
    const list =
      dashboard.currentSeason && dashboard.currentSeason.length > 0
        ? dashboard.currentSeason
        : [];
    return list.filter((a: any) => !isHiddenByAdmin(a));
  }, [dashboard.currentSeason, animeCuration]);

  const displayTopAnime = useMemo(() => {
    const list =
      dashboard.topAnime && dashboard.topAnime.length > 0
        ? dashboard.topAnime
        : [];
    return list.filter((a: any) => !isHiddenByAdmin(a));
  }, [dashboard.topAnime, animeCuration]);

  const displayMovies = useMemo(() => {
    const list =
      dashboard.movies && dashboard.movies.length > 0
        ? dashboard.movies
        : [];
    return list.filter((a: any) => !isHiddenByAdmin(a));
  }, [dashboard.movies, animeCuration]);

  // Compute displayed schedule for today
  const displaySchedule = useMemo(() => {
    return dashboard.schedule && dashboard.schedule.length > 0 ? dashboard.schedule : [];
  }, [dashboard.schedule]);

  const display = useDeviceDisplay();

  return (
    <PullToRefresh onRefresh={handleOnDemandRefresh}>
    <div className="pb-6 space-y-3 md:space-y-4">

      {/* Global alert banner if configured by admins */}
      {sliderSettings.globalAnnouncement && (
        <div className="pt-[calc(var(--safe-top,0px)+4.1rem)] md:pt-3 px-3 sm:px-4 md:px-8 max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-3 bg-gradient-to-r from-purple-500/10 via-pink-500/10 to-purple-500/10 border border-purple-500/15 rounded-2xl flex items-center gap-2.5 text-xs text-purple-200 justify-center font-bold text-center leading-relaxed"
          >
            <Sparkles size={14} className="text-pink-400 shrink-0" />
            <span>{sliderSettings.globalAnnouncement}</span>
          </motion.div>
        </div>
      )}

      {/* 1. Multi-Style Top Banner Slider */}
      {displayTop5 && displayTop5.length > 0 ? (
        <div id="home_hero_slider">
          <CinematicHeroBanner
            items={displayTop5}
            bannerStyle={sliderSettings.animeBannerStyle || 'classic'}
            accent="anime"
            limit={clampedAdminLimit}
            speedSeconds={sliderSettings.speed || 5}
            isHomeMode={!sliderSettings.globalAnnouncement}
            modeLabel={
              sliderSettings.sliderMode === 'custom'
                ? 'مختارات السلايدر'
                : sliderSettings.sliderMode === 'trending_season'
                ? 'الرائج هذا الموسم'
                : sliderSettings.sliderMode === 'all_time_best'
                ? 'الأفضل على الإطلاق'
                : sliderSettings.sliderMode === 'classic_historical'
                ? 'الأنميات التاريخية'
                : 'الأفضل هذا الموسم'
            }
            onItemClick={(item) => onAnimeClick?.(String(item._id))}
          />
        </div>
      ) : initialLoading ? (
        <div className="pt-[calc(var(--safe-top,0px)+4.35rem)] md:pt-4 px-4 md:px-8 max-w-7xl mx-auto">
          <div className="h-[260px] sm:h-[340px] md:h-[400px] rounded-[24px] sm:rounded-[28px] bg-neutral-900 animate-pulse border border-white/10 w-full"></div>
        </div>
      ) : (
        <div className="pt-4 px-4 md:px-8">
          <div className="rounded-2xl bg-neutral-900/50 border border-white/10 p-6 text-center space-y-3 max-w-5xl mx-auto">
            <AlertCircle className={`mx-auto ${dashboardError ? 'text-rose-500' : 'text-amber-400'}`} size={32} />
            <div className="space-y-1">
              <h4 className="text-sm font-black text-white">
                {dashboardError ? 'تعذر تحميل الواجهة الرئيسية حالياً' : 'لا تتوفر بيانات للعرض حالياً'}
              </h4>
              <p className="text-xs text-neutral-400">
                {dashboardError
                  ? 'تحقق من اتصالك بالإنترنت ثم أعد المحاولة'
                  : 'لم يتم العثور على عناصر للعرض في هذا القسم حالياً'}
              </p>
            </div>
            {dashboardError && (
              <button
                type="button"
                onClick={handleOnDemandRefresh}
                disabled={isRefreshing}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-black transition active:scale-95 cursor-pointer"
              >
                <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
                <span>إعادة المحاولة</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* 2. Quick Navigation / Categories */}
      <section className="px-3.5 sm:px-4 md:px-8 space-y-3">
        <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-1 pt-1 max-w-7xl mx-auto snap-x snap-proximity">
          {categories.map((cat, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => onSearchCategory?.(cat)}
              className="snap-start flex-shrink-0 min-h-[38px] px-4 py-1.5 bg-neutral-900/75 border border-neutral-800 hover:border-purple-500 hover:bg-neutral-800 hover:text-white rounded-full text-xs font-bold text-neutral-300 transition-transform duration-150 hover:-translate-y-0.5 active:scale-95 whitespace-nowrap cursor-pointer"
            >
              {cat}
            </button>
          ))}
        </div>
      </section>

      {/* 3. History (Continue Watching) with Progress Bar & Quick Delete */}
      <AnimatePresence>
        {animeSec.continueWatching && history.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0 }}
            className="px-4 md:px-8"
          >
            <div className="flex justify-between items-end mb-2 max-w-7xl mx-auto">
              <div className="flex items-center gap-2">
                <h3 className="text-white font-black text-lg border-r-4 border-blue-500 pr-2 flex items-center gap-2">
                  <span>متابعة المشاهدة</span>
                  <span className="text-[11px] bg-blue-500/15 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded-full font-mono">
                    {history.length}
                  </span>
                </h3>
              </div>
              <button
                onClick={handleClearAllHistory}
                className="text-[11px] text-neutral-400 hover:text-red-400 flex items-center gap-1 transition cursor-pointer"
              >
                <Trash2 size={12} />
                <span>مسح السجل</span>
              </button>
            </div>
            <div className="flex gap-3.5 overflow-x-auto pb-1.5 hide-scrollbar max-w-7xl mx-auto snap-x snap-mandatory">
              {history.map((item: any, idx: number) => {
                const progressPct = Math.min(
                  95,
                  Math.max(22, Number(item.progress) || ((Number(item.lastEpisode || 1) * 19) % 75) + 20)
                );
                return (
                  <div
                    key={`history-${item.id}-${idx}`}
                    onClick={() => onAnimeClick?.(item.id, item.lastEpisode)}
                    onMouseEnter={() => prefetchDetails(item.id)}
                    className={`snap-start theme-keep-dark cursor-pointer ${display.isCoverScreen ? 'w-[172px]' : 'w-[205px] sm:w-[232px] md:w-[258px] lg:w-[280px] xl:w-[295px]'} flex-shrink-0 relative rounded-2xl overflow-hidden group border border-neutral-800 hover:border-blue-500 transition-transform duration-200 hover:-translate-y-1 active:scale-[0.98] aspect-[16/9] bg-neutral-900 shadow-lg`}
                  >
                    <img
                      src={item.posterUrl || FALLBACK_POSTER_DATA_URL}
                      referrerPolicy="no-referrer"
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      alt="poster"
                    />
                    {/* Quick Remove Button */}
                    <button
                      type="button"
                      onClick={(e) => handleRemoveHistoryItem(e, item.id)}
                      onPointerDown={(e) => e.stopPropagation()}
                      title="إزالة من متابعة المشاهدة"
                      aria-label="إزالة من متابعة المشاهدة"
                      className="absolute top-2 left-2 z-20 w-7 h-7 rounded-full bg-black/80 hover:bg-red-600 text-neutral-200 hover:text-white border border-white/20 flex items-center justify-center opacity-90 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity cursor-pointer"
                    >
                      <X size={13} strokeWidth={2.5} />
                    </button>

                    <div
                      className="absolute inset-x-0 bottom-0 pt-6 pb-2.5 px-3 bg-gradient-to-t from-black/85 via-black/45 to-transparent flex flex-col justify-end pointer-events-none"
                      style={{ textShadow: '0 2px 6px rgba(0,0,0,0.98), 0 0 3px rgba(0,0,0,0.95)' }}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="flex items-center gap-1.5">
                          <div className="w-5 h-5 rounded-full bg-blue-500 shadow-md shadow-blue-500/40 flex items-center justify-center">
                            <Play size={9} fill="white" className="ml-0.5 text-white" />
                          </div>
                          <span className="text-blue-300 text-[11px] font-black">
                            الحلقة {item.lastEpisode || 1}
                          </span>
                        </div>
                        <span className="text-[10px] text-neutral-200 font-mono flex items-center gap-1 tabular-nums">
                          <Clock size={10} />
                          {progressPct}%
                        </span>
                      </div>
                      <h5 className="pointer-events-auto font-bold text-xs md:text-sm text-white truncate mb-1.5">
                        <LongPressCopy text={item.title}>{item.title}</LongPressCopy>
                      </h5>
                      {/* Visual Episode Progress Bar */}
                      <div className="w-full h-1 bg-white/20 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full"
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* 4. Latest Episodes (Device-Only + Manual Refresh) */}
      {animeSec.latestEpisodes && (
      <section className="px-4 md:px-8">
        <div className="flex flex-nowrap justify-between items-center gap-2 mb-2 max-w-7xl mx-auto">
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="text-white font-black text-base sm:text-lg border-r-4 border-red-500 pr-2 whitespace-nowrap">
              أحدث الحلقات
            </h3>
            {recentDeviceState.fetchedAt > 0 && (
              <span className="text-[11px] font-bold text-neutral-400 whitespace-nowrap truncate">
                {recentEpisodesLocal.formatRelativeTimeAr(recentDeviceState.fetchedAt)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => void handleRefreshRecentOnly(true)}
              disabled={refreshingRecent}
              title="تحديث أحدث الحلقات"
              aria-label="تحديث أحدث الحلقات"
              className="p-1.5 rounded-full bg-transparent border-0 hover:bg-white/5 text-red-400 hover:text-red-300 flex items-center justify-center transition active:scale-90 disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw size={19} strokeWidth={2.35} className={refreshingRecent ? 'animate-spin text-red-400' : 'text-red-400'} />
            </button>
            <button
              type="button"
              onClick={onNavigateToRecent}
              title="عرض الكل"
              aria-label="عرض كل أحدث الحلقات"
              className="p-1.5 rounded-full bg-transparent border-0 hover:bg-white/5 text-neutral-300 hover:text-white flex items-center justify-center transition active:scale-90 group cursor-pointer"
            >
              <ChevronLeft size={23} strokeWidth={2.4} className="transition-transform group-hover:-translate-x-0.5" />
            </button>
          </div>
        </div>

        <div className="flex gap-3.5 overflow-x-auto pb-1.5 hide-scrollbar max-w-7xl mx-auto items-stretch snap-x snap-mandatory">
          {displayRecentEpisodes.map((ep: any, idx: number) => {
            const cleanTitle = cleanAnimeTitle(
              ep.animeId?.title || ep.animeId?.titleAr || ep.title || 'Anime'
            );
            const animeTargetId =
              ep.animeId?._id ||
              ep.animeId?.id ||
              ep.animeId?.mal_id ||
              (cleanTitle ? `search-${cleanTitle}` : 'unknown');
            const epPoster =
              ep.animeId?.posterUrl ||
              ep.posterUrl ||
              ep.thumbnailUrl ||
              ep.animeId?.thumbnailUrl ||
              FALLBACK_POSTER_DATA_URL;
            const epNumber =
              ep.episodeNumber || (ep.title && ep.title.match(/الحلقة\s*(\d+)/)?.[1]) || '1';

            return (
              <div
                key={`recent-${ep._id}-${idx}`}
                onClick={() => onAnimeClick?.(String(animeTargetId))}
                onMouseEnter={() => prefetchDetails(animeTargetId)}
                className={`snap-start theme-keep-dark cursor-pointer ${display.isCoverScreen ? 'w-[126px]' : 'w-[152px] sm:w-[176px] md:w-[196px] lg:w-[214px] xl:w-[228px]'} flex-shrink-0 relative aspect-[3/4] rounded-2xl overflow-hidden border border-neutral-800/80 hover:border-red-500/70 transition-transform duration-200 hover:-translate-y-1 active:scale-[0.98] bg-neutral-900 shadow-md group`}
              >
                <img
                  src={epPoster}
                  onError={(e) => {
                    const target = e.currentTarget;
                    if (target.src && target.src.includes('-poster.')) {
                      target.src = target.src.replace('-poster.', '-thumbnail.');
                    }
                  }}
                  referrerPolicy="no-referrer"
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  alt={cleanTitle}
                />

                <div className="absolute top-2 right-2 z-10 pointer-events-none">
                  <span className="bg-red-600 text-white border border-red-400/40 px-2 py-0.5 rounded-lg text-[10px] md:text-xs font-black shadow-lg tabular-nums">
                    حلقة {epNumber}
                  </span>
                </div>

                <div
                  className="absolute inset-x-0 bottom-0 pt-5 pb-2.5 px-2.5 bg-gradient-to-t from-black/85 via-black/45 to-transparent flex flex-col justify-end pointer-events-none"
                  style={{ textShadow: '0 2px 6px rgba(0,0,0,0.98), 0 0 3px rgba(0,0,0,0.95)' }}
                >
                  <h5
                    className="pointer-events-auto font-bold text-xs md:text-sm text-white group-hover:text-red-300 transition-colors line-clamp-2 text-center"
                    dir="ltr"
                  >
                    <LongPressCopy text={cleanTitle}>{cleanTitle}</LongPressCopy>
                  </h5>
                </div>
              </div>
            );
          })}
        </div>
      </section>
      )}

      {/* 5. Daily Trending Today — رائج اليوم */}
      {animeSec.trending && (
      <section className="px-4 md:px-8">
        <div className="flex justify-between items-end mb-2 max-w-7xl mx-auto">
          <div className="flex items-center gap-2">
            <h3 className="text-white font-black text-lg border-r-4 border-orange-500 pr-2">
              رائج اليوم
            </h3>
            <Flame size={17} className="text-orange-500" />
          </div>
        </div>
        <div className="flex gap-3.5 overflow-x-auto pb-1.5 hide-scrollbar max-w-7xl mx-auto snap-x snap-mandatory">
          {displayPopular.map((anime: any, idx: number) => {
            const rank = idx + 1;
            const isTop3 = rank <= 3;
            return (
              <div
                key={`trending-today-${anime._id}-${idx}`}
                onClick={() => onAnimeClick?.(anime._id)}
                onMouseEnter={() => prefetchDetails(anime._id)}
                className={`snap-start theme-keep-dark cursor-pointer ${display.isCoverScreen ? 'w-[130px]' : 'w-[156px] sm:w-[180px] md:w-[202px] lg:w-[220px] xl:w-[235px]'} flex-shrink-0 relative rounded-2xl overflow-hidden group border border-neutral-800 hover:border-orange-500 transition-transform duration-200 hover:-translate-y-1 active:scale-[0.98] aspect-[3/4] bg-neutral-900 shadow-lg`}
              >
                <img
                  src={anime.posterUrl || FALLBACK_POSTER_DATA_URL}
                  referrerPolicy="no-referrer"
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  alt={anime.title}
                />

                {/* Top Rank Badge */}
                <div className="absolute top-2 right-2 z-10 pointer-events-none">
                  <span
                    className={`px-2.5 py-0.5 rounded-lg text-[11px] font-black shadow-lg border tabular-nums ${
                      rank === 1
                        ? 'bg-gradient-to-r from-orange-500 to-amber-400 text-black border-yellow-200'
                        : rank === 2
                        ? 'bg-gradient-to-r from-slate-200 to-slate-400 text-black border-white'
                        : rank === 3
                        ? 'bg-gradient-to-r from-amber-600 to-orange-700 text-white border-amber-400/50'
                        : 'bg-black/85 text-orange-400 border-orange-500/35'
                    }`}
                  >
                    #{rank}
                  </span>
                </div>

                {/* Rating Pill on Top Left */}
                {anime.rating && (
                  <div className="absolute top-2 left-2 z-10 pointer-events-none">
                    <span className="bg-black/85 text-white px-2 py-0.5 rounded-lg text-[10px] font-bold flex items-center gap-1 border border-white/15 tabular-nums">
                      <Star size={10} className="text-yellow-400" fill="currentColor" />
                      {anime.rating}
                    </span>
                  </div>
                )}

                {/* Giant Decorative Rank Watermark */}
                <span
                  className={`absolute bottom-8 left-2 font-black text-5xl md:text-6xl leading-none select-none pointer-events-none transition-transform duration-200 group-hover:scale-105 ${
                    isTop3 ? 'text-orange-400/25' : 'text-white/15'
                  }`}
                  style={{ WebkitTextStroke: '1.5px rgba(255,255,255,0.28)' }}
                >
                  {rank}
                </span>

                <div
                  className="absolute inset-x-0 bottom-0 pt-5 pb-2.5 px-3 bg-gradient-to-t from-black/85 via-black/45 to-transparent flex flex-col justify-end pointer-events-none"
                  style={{ textShadow: '0 2px 6px rgba(0,0,0,0.98), 0 0 3px rgba(0,0,0,0.95)' }}
                >
                  <h5 className="pointer-events-auto font-bold text-xs md:text-sm text-white truncate text-right">
                    <LongPressCopy text={anime.title}>{anime.title}</LongPressCopy>
                  </h5>
                </div>
              </div>
            );
          })}
        </div>
      </section>
      )}

      {/* 7. Current Season */}
      {animeSec.currentSeason && (
      <section className="px-4 md:px-8">
        <div className="flex justify-between items-center mb-2 max-w-7xl mx-auto">
          <h3 className="text-white font-black text-lg border-r-4 border-purple-500 pr-2">
            انميات الموسم الحالي
          </h3>
          <button
            type="button"
            onClick={onNavigateToSeason}
            title="عرض الكل"
            aria-label="عرض كل انميات الموسم الحالي"
            className="min-w-[36px] min-h-[36px] p-1.5 rounded-full bg-transparent border-0 hover:bg-white/5 text-neutral-300 hover:text-white flex items-center justify-center transition active:scale-90 group cursor-pointer"
          >
            <ChevronLeft size={23} strokeWidth={2.4} className="transition-transform group-hover:-translate-x-0.5" />
          </button>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-1.5 hide-scrollbar max-w-7xl mx-auto snap-x snap-mandatory">
          {displayCurrentSeason.map((anime: any, idx: number) => (
            <div
              key={`current-${anime._id}-${idx}`}
              onClick={() => onAnimeClick?.(anime._id)}
              onMouseEnter={() => prefetchDetails(anime._id)}
              className={`snap-start theme-keep-dark cursor-pointer ${display.isCoverScreen ? 'w-[126px]' : 'w-[152px] sm:w-[176px] md:w-[198px] lg:w-[216px] xl:w-[235px]'} flex-shrink-0 relative rounded-2xl overflow-hidden group border border-neutral-800 hover:border-purple-500 transition-transform duration-200 hover:-translate-y-1 active:scale-[0.98] aspect-[3/4] bg-neutral-900`}
            >
              <img
                src={anime.posterUrl || FALLBACK_POSTER_DATA_URL}
                referrerPolicy="no-referrer"
                loading="lazy"
                decoding="async"
                className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                alt="poster"
              />
              <span className="absolute top-2 right-2 bg-black/80 text-white px-2 py-0.5 rounded text-[10px] font-bold shadow-lg flex items-center gap-1 pointer-events-none tabular-nums">
                <Star size={10} className="text-yellow-400" fill="currentColor" /> {anime.rating || 'N/A'}
              </span>
              <span className="absolute top-2 left-2 bg-purple-600 text-white px-2 py-0.5 rounded text-[10px] font-bold shadow-lg flex items-center gap-1 pointer-events-none">
                <Tv size={10} /> جديد
              </span>
              <div
                className="absolute inset-x-0 bottom-0 pt-5 pb-2.5 px-2.5 bg-gradient-to-t from-black/85 via-black/45 to-transparent flex flex-col justify-end pointer-events-none"
                style={{ textShadow: '0 2px 6px rgba(0,0,0,0.98), 0 0 3px rgba(0,0,0,0.95)' }}
              >
                <h5 className="pointer-events-auto font-bold text-xs md:text-sm text-white line-clamp-2 text-right dir-rtl">
                  <LongPressCopy text={anime.title}>{anime.title}</LongPressCopy>
                </h5>
              </div>
            </div>
          ))}
        </div>
      </section>
      )}

      {/* 7.5. Top Anime Section */}
      {animeSec.topAnime && displayTopAnime.length > 0 && (
        <section className="px-4 md:px-8">
          <div className="flex justify-between items-center mb-2 max-w-7xl mx-auto">
            <h3 className="text-white font-black text-lg border-r-4 border-amber-500 pr-2 flex items-center gap-2">
              <Crown size={18} className="text-amber-400" />
              <span>أفضل الأنميات</span>
            </h3>
            <button
              type="button"
              onClick={onNavigateToTopAnime}
              title="عرض الكل"
              aria-label="عرض كل أفضل الأنميات"
              className="min-w-[36px] min-h-[36px] p-1.5 rounded-full bg-transparent border-0 hover:bg-white/5 text-neutral-300 hover:text-white flex items-center justify-center transition active:scale-90 group cursor-pointer"
            >
              <ChevronLeft size={23} strokeWidth={2.4} className="transition-transform group-hover:-translate-x-0.5" />
            </button>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1.5 hide-scrollbar max-w-7xl mx-auto snap-x snap-mandatory">
            {displayTopAnime.map((anime: any, idx: number) => {
              const targetId = String(anime._id || anime.slug || anime.id || `search-${anime.title}`);
              return (
                <div
                  key={`top-anime-${targetId}-${idx}`}
                  onClick={() => onAnimeClick?.(targetId)}
                  onMouseEnter={() => prefetchDetails(targetId)}
                  className={`snap-start theme-keep-dark cursor-pointer ${display.isCoverScreen ? 'w-[126px]' : 'w-[152px] sm:w-[176px] md:w-[198px] lg:w-[216px] xl:w-[235px]'} flex-shrink-0 relative rounded-2xl overflow-hidden group border border-neutral-800 hover:border-amber-500 transition-transform duration-200 hover:-translate-y-1 active:scale-[0.98] aspect-[3/4] bg-neutral-900`}
                >
                  <img
                    src={anime.posterUrl || FALLBACK_POSTER_DATA_URL}
                    referrerPolicy="no-referrer"
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                    alt={anime.title}
                  />
                  <span className="absolute top-2 right-2 bg-amber-500 text-black px-2 py-0.5 rounded text-[10px] font-black shadow-lg pointer-events-none tabular-nums">
                    #{idx + 1}
                  </span>
                  {anime.episodesCount && (
                    <span className="absolute top-2 left-2 bg-black/80 text-white px-2 py-0.5 rounded text-[10px] font-bold border border-white/15 pointer-events-none tabular-nums">
                      {anime.episodesCount} حلقة
                    </span>
                  )}
                  <div
                    className="absolute inset-x-0 bottom-0 pt-5 pb-2.5 px-2.5 bg-gradient-to-t from-black/85 via-black/45 to-transparent flex flex-col justify-end pointer-events-none"
                    style={{ textShadow: '0 2px 6px rgba(0,0,0,0.98), 0 0 3px rgba(0,0,0,0.95)' }}
                  >
                    <h5 className="pointer-events-auto font-bold text-xs md:text-sm text-white line-clamp-2 text-right dir-rtl">
                      <LongPressCopy text={anime.title}>{anime.title}</LongPressCopy>
                    </h5>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 7.6. Anime Movies Section */}
      {animeSec.movies && displayMovies.length > 0 && (
        <section className="px-4 md:px-8">
          <div className="flex justify-between items-center mb-2 max-w-7xl mx-auto">
            <h3 className="text-white font-black text-lg border-r-4 border-rose-500 pr-2 flex items-center gap-2">
              <Film size={18} className="text-rose-400" />
              <span>أفلام الأنمي</span>
            </h3>
            <button
              type="button"
              onClick={onNavigateToMovies}
              title="عرض الكل"
              aria-label="عرض كل أفلام الأنمي"
              className="min-w-[36px] min-h-[36px] p-1.5 rounded-full bg-transparent border-0 hover:bg-white/5 text-neutral-300 hover:text-white flex items-center justify-center transition active:scale-90 group cursor-pointer"
            >
              <ChevronLeft size={23} strokeWidth={2.4} className="transition-transform group-hover:-translate-x-0.5" />
            </button>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1.5 hide-scrollbar max-w-7xl mx-auto snap-x snap-mandatory">
            {displayMovies.map((anime: any, idx: number) => {
              const targetId = String(anime._id || anime.slug || anime.id || `search-${anime.title}`);
              return (
                <div
                  key={`movie-anime-${targetId}-${idx}`}
                  onClick={() => onAnimeClick?.(targetId)}
                  onMouseEnter={() => prefetchDetails(targetId)}
                  className={`snap-start theme-keep-dark cursor-pointer ${display.isCoverScreen ? 'w-[126px]' : 'w-[152px] sm:w-[176px] md:w-[198px] lg:w-[216px] xl:w-[235px]'} flex-shrink-0 relative rounded-2xl overflow-hidden group border border-neutral-800 hover:border-rose-500 transition-transform duration-200 hover:-translate-y-1 active:scale-[0.98] aspect-[3/4] bg-neutral-900`}
                >
                  <img
                    src={anime.posterUrl || FALLBACK_POSTER_DATA_URL}
                    referrerPolicy="no-referrer"
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                    alt={anime.title}
                  />
                  <span className="absolute top-2 left-2 bg-rose-600 text-white px-2 py-0.5 rounded text-[10px] font-black shadow-lg pointer-events-none">
                    فيلم
                  </span>
                  <div
                    className="absolute inset-x-0 bottom-0 pt-5 pb-2.5 px-2.5 bg-gradient-to-t from-black/85 via-black/45 to-transparent flex flex-col justify-end pointer-events-none"
                    style={{ textShadow: '0 2px 6px rgba(0,0,0,0.98), 0 0 3px rgba(0,0,0,0.95)' }}
                  >
                    <h5 className="pointer-events-auto font-bold text-xs md:text-sm text-white line-clamp-2 text-right dir-rtl">
                      <LongPressCopy text={anime.title}>{anime.title}</LongPressCopy>
                    </h5>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 8. Interactive Broadcast Schedule */}
      {animeSec.schedule && (
      <section className="px-4 md:px-8">
        <div className="max-w-7xl mx-auto space-y-3">
          <div className="flex flex-wrap justify-between items-center gap-2 border-b border-white/5 pb-2.5">
            <div className="flex items-center gap-2">
              <h3
                className="text-white font-black text-lg border-r-4 border-blue-500 pr-2 cursor-pointer hover:text-blue-400 transition flex items-center gap-2"
                onClick={() => onNavigateToSchedule?.(selectedScheduleDay)}
              >
                <CalendarDays size={18} className="text-blue-400" />
                <span>
                  جدول البث ({WEEK_DAYS.find((d) => d.key === selectedScheduleDay)?.labelAr})
                </span>
                {selectedScheduleDay === todayKey && (
                  <span className="text-[10px] bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded-full">
                    اليوم
                  </span>
                )}
              </h3>
            </div>
            <button
              type="button"
              onClick={() => onNavigateToSchedule?.(selectedScheduleDay)}
              title="عرض الجدول الكامل"
              aria-label="عرض الجدول الكامل"
              className="w-9 h-9 rounded-full bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/30 text-blue-400 hover:text-blue-300 flex items-center justify-center transition active:scale-90 group cursor-pointer shrink-0"
            >
              <ChevronLeft size={21} strokeWidth={2.5} className="transition-transform group-hover:-translate-x-0.5" />
            </button>
          </div>

          {/* Day Anime Cards */}
          <div className="relative">
            <div className="flex gap-3 overflow-x-auto pb-1.5 hide-scrollbar snap-x snap-mandatory">
              {displaySchedule.map((anime: any, idx: number) => {
                const targetId = String(anime._id || anime.slug || anime.mal_id || `search-${anime.title}`);
                return (
                  <div
                    key={`schedule-${selectedScheduleDay}-${targetId}-${idx}`}
                    onClick={() => onAnimeClick?.(targetId)}
                    onMouseEnter={() => prefetchDetails(targetId)}
                    className={`snap-start theme-keep-dark cursor-pointer ${display.isCoverScreen ? 'w-[126px]' : 'w-[152px] sm:w-[176px] md:w-[198px] lg:w-[216px] xl:w-[235px]'} flex-shrink-0 relative rounded-2xl overflow-hidden group border border-neutral-800 hover:border-blue-500 transition-transform duration-200 hover:-translate-y-1 active:scale-[0.98] aspect-[3/4] bg-neutral-900`}
                  >
                    <img
                      src={anime.posterUrl || FALLBACK_POSTER_DATA_URL}
                      referrerPolicy="no-referrer"
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      alt={anime.title}
                    />
                    {anime.broadcast?.time && (
                      <span className="absolute top-2 left-2 bg-blue-600/95 text-white px-2 py-0.5 rounded text-[10px] font-black shadow flex items-center gap-1 pointer-events-none tabular-nums">
                        <Clock size={9} />
                        <span>{anime.broadcast.time}</span>
                      </span>
                    )}
                    <div
                      className="absolute inset-x-0 bottom-0 pt-5 pb-2.5 px-2.5 bg-gradient-to-t from-black/85 via-black/45 to-transparent flex flex-col justify-end pointer-events-none"
                      style={{ textShadow: '0 2px 6px rgba(0,0,0,0.98), 0 0 3px rgba(0,0,0,0.95)' }}
                    >
                      <h5 className="pointer-events-auto font-bold text-xs md:text-sm text-white truncate text-center">
                        <LongPressCopy text={anime.title}>{anime.title}</LongPressCopy>
                      </h5>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>
      )}

      {/* Community Banner */}
      <section className="px-4 md:px-8 max-w-7xl mx-auto" id="social_indicator_banner">
        <div className="bg-gradient-to-r from-neutral-900 to-zinc-950 border border-neutral-800/80 rounded-3xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-right">
            <h4 className="text-white text-xs font-black">
              مجتمع الأوتاكو ومشاهدة الأنمي المباشرة ⚡
            </h4>
            <p className="text-[10px] text-neutral-400 mt-1">
              تصفّح أحدث الحلقات، تابع جدول البث، وشارك تقييماتك وآراءك مع مجتمع الأوتاكو من أي جهاز.
            </p>
          </div>
        </div>
      </section>

      {/* 10. Dynamic Legendary Anime Quotes Engine */}
      {animeSec.quotes && (
      <section className="px-4 md:px-8 pb-4">
        <div className="bg-gradient-to-br from-neutral-900 via-neutral-950 to-black border border-neutral-800 hover:border-purple-500/40 rounded-3xl p-6 md:p-8 relative overflow-hidden transition-all duration-300 shadow-xl max-w-5xl mx-auto">
          <Quote
            className="absolute top-4 left-4 md:top-6 md:left-6 text-neutral-800 opacity-25 rotate-180 pointer-events-none"
            size={84}
          />
          <div className="relative z-10 flex flex-col gap-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  className="text-[10px] md:text-xs font-black px-2.5 py-1 rounded-lg border"
                  style={{
                    backgroundColor: `${currentQuote.accentColor}20`,
                    borderColor: `${currentQuote.accentColor}45`,
                    color: currentQuote.accentColor
                  }}
                >
                  اقتباسات خالدة • {currentQuote.animeTitle}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setQuoteIndex((prev) => (prev + 1) % LEGENDARY_ANIME_QUOTES.length)}
                className="text-[11px] font-bold text-neutral-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition cursor-pointer"
              >
                <Shuffle size={12} />
                <span>اقتباس آخر</span>
              </button>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={currentQuote.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.22 }}
                className="space-y-3"
              >
                <p className="text-sm md:text-xl md:leading-relaxed font-black text-white leading-relaxed max-w-2xl">
                  "{currentQuote.quoteAr}"
                </p>
                <div className="flex flex-wrap justify-between items-center gap-3 pt-1">
                  <div
                    onClick={() => onAnimeClick?.(currentQuote.animeId)}
                    className="cursor-pointer group flex items-center gap-2"
                  >
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: currentQuote.accentColor }}
                    />
                    <span className="text-xs md:text-sm text-yellow-400 font-black group-hover:underline">
                      {currentQuote.characterAr}
                    </span>
                    <span className="text-xs text-neutral-400">
                      — {currentQuote.animeTitle}
                    </span>
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </section>
      )}
    </div>
    </PullToRefresh>
  );
}
