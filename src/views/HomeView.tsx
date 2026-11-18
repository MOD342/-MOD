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
  Loader2,
  Shuffle,
  Film,
  Crown
} from 'lucide-react';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence, useMotionValue, animate } from 'motion/react';
import { clientCache } from '../utils/clientCache';
import { db } from '../firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../firebaseUtils';
import { cleanAnimeTitle } from '../utils/animeTitleCleaner';
import PullToRefresh from '../components/PullToRefresh';
import { useAuth } from '../contexts/AuthContext';
import { listService } from '../services/listService';
import { useDeviceDisplay } from '../hooks/useDeviceDisplay';

interface HomeViewProps {
  onAnimeClick?: (animeId: string, epNum?: string) => void;
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
  onSearchCategory,
  onNavigateToSchedule,
  onNavigateToRecent,
  onNavigateToSeason,
  onNavigateToMovies,
  onNavigateToTopAnime
}: HomeViewProps) {
  const { user } = useAuth();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [dashboardError, setDashboardError] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  // Selected schedule day on Home View (defaults to today)
  const todayKey = WEEK_DAYS[new Date().getDay()].key;
  const [selectedScheduleDay, setSelectedScheduleDay] = useState<string>(todayKey);
  const [scheduleDayLoading, setScheduleDayLoading] = useState(false);
  const [customDaySchedule, setCustomDaySchedule] = useState<Record<string, any[]>>({});

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
  }>(() => getFallbackDashboard());

  const watchHistoryKey = `local_watch_history_${user?.id || 'guest'}`;

  const [history, setHistory] = useState<any[]>(() => {
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(`local_watch_history_${user?.id || 'guest'}`);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
      }
    } catch {}
    return [];
  });
  const [animeCuration, setAnimeCuration] = useState<{
    pinnedAnime: any[];
    hiddenAnime: any[];
  }>({ pinnedAnime: [], hiddenAnime: [] });

  const [sliderSettings, setSliderSettings] = useState<{
    limit: number;
    season: string;
    sliderMode: string;
    customAnime: any[];
    speed: number;
    globalAnnouncement: string;
  }>({
    limit: 5,
    season: 'auto',
    sliderMode: 'best_season',
    customAnime: [],
    speed: 3,
    globalAnnouncement: ''
  });

  // Hero Slider Live Drag-Follow & Snap State
  const sliderContainerRef = useRef<HTMLDivElement>(null);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isDraggingSlider, setIsDraggingSlider] = useState(false);
  const dragPreventClickRef = useRef(false);
  const sliderX = useMotionValue(0);

  const displayTop5 =
    sliderSettings.sliderMode === 'custom' &&
    Array.isArray(sliderSettings.customAnime) &&
    sliderSettings.customAnime.length > 0
      ? sliderSettings.customAnime
      : dashboard.top5 && dashboard.top5.length > 0
      ? dashboard.top5
      : [];
  const clampedAdminLimit = Math.min(10, Math.max(3, Number(sliderSettings.limit) || 5));
  const topVisibleLimit = Math.min(displayTop5.length || 1, clampedAdminLimit);

  // Sync sliderX smoothly with currentSlide & container resize
  useEffect(() => {
    const syncSliderPosition = (instant = false) => {
      const width = sliderContainerRef.current?.offsetWidth || window.innerWidth;
      const targetX = -currentSlide * width;
      if (instant) {
        sliderX.set(targetX);
      } else {
        animate(sliderX, targetX, {
          type: 'spring',
          stiffness: 280,
          damping: 30,
          mass: 0.85
        });
      }
    };

    syncSliderPosition(false);

    const handleResize = () => syncSliderPosition(true);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [currentSlide, topVisibleLimit, sliderX]);

  const fetchDashboard = async (customSeason?: string, customSliderMode?: string) => {
    setIsRefreshing(true);
    try {
      const daysMap = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const clientDay = daysMap[new Date().getDay()];
      const activeSeason = customSeason || sliderSettings.season || 'auto';
      const activeMode = customSliderMode || sliderSettings.sliderMode || 'best_season';
      const cacheKey = `direct_dashboard_v5_${activeSeason}_${activeMode}_${clientDay}`;

      const applyDashboardData = async (data: any) => {
        if (!data) return;
        const hasAnyContent =
          data.top5?.length > 0 ||
          data.recentEpisodes?.length > 0 ||
          data.popular?.length > 0 ||
          data.currentSeason?.length > 0 ||
          data.schedule?.length > 0 ||
          data.movies?.length > 0 ||
          data.topAnime?.length > 0;
        if (hasAnyContent) {
          setDashboard(data);
          setDashboardError(false);
        }

        if (!Array.isArray(data.recentEpisodes) || data.recentEpisodes.length === 0) {
          try {
            const recentRes = await fetch(`/api/anime/recent?_t=${Date.now()}`, { cache: 'no-store' }).then((r) => r.json());
            if (recentRes?.success && Array.isArray(recentRes.data) && recentRes.data.length > 0) {
              const mappedRecent = recentRes.data.map((ep: any, idx: number) => {
                const rawTitle = ep.title || '';
                const cleanedTitle = rawTitle.includes(' S') ? rawTitle : cleanAnimeTitle(rawTitle);
                const extractedEp = ep.episodeNumber || ep.episode || rawTitle.match(/الحلقة\s*(\d+)/)?.[1] || '1';
                const posterImg = ep.posterUrl || ep.imageUrl || ep.thumbnailUrl;
                return {
                  _id: ep.id || `recent-${idx}`,
                  episodeNumber: extractedEp,
                  title: cleanedTitle,
                  link: ep.link || '',
                  animeId: {
                    _id: typeof ep.animeId === 'string' ? ep.animeId : ep.animeId?._id || `search-${cleanedTitle}`,
                    title: cleanedTitle,
                    titleAr: cleanedTitle,
                    posterUrl: posterImg,
                    thumbnailUrl: posterImg,
                    episodeLink: ep.link || ''
                  }
                };
              });
              const nextData = { ...data, recentEpisodes: mappedRecent };
              clientCache.set(cacheKey, nextData, 10 * 60 * 1000);
              setDashboard(nextData);
              setDashboardError(false);
            }
          } catch {}
        }
      };

      let lastAppliedRef: any = null;
      const safeApply = async (data: any) => {
        if (!data || data === lastAppliedRef) return;
        lastAppliedRef = data;
        await applyDashboardData(data);
      };

      const freshData = await clientCache.fetchWithRevalidate<any>(
        cacheKey,
        `/api/dashboard?day=${clientDay}&season=${activeSeason}&sliderMode=${activeMode}`,
        (data) => {
          void safeApply(data);
        },
        60 * 60 * 1000,
        {
          onError: () => {
            setDashboardError(true);
          }
        }
      );
      if (freshData) {
        await safeApply(freshData);
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

  const handleOnDemandRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      const daysMap = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const clientDay = daysMap[new Date().getDay()];
      const activeSeason = sliderSettings.season || 'auto';
      const activeMode = sliderSettings.sliderMode || 'best_season';
      const cacheKey = `direct_dashboard_v5_${activeSeason}_${activeMode}_${clientDay}`;

      const ts = Date.now();
      const [dashRes, recentRes] = await Promise.all([
        fetch(`/api/dashboard?day=${clientDay}&season=${activeSeason}&sliderMode=${activeMode}&bypass=true&_t=${ts}`, {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' }
        })
          .then((r) => r.json())
          .catch(() => null),
        fetch(`/api/anime/recent?bypass=true&_t=${ts}`, {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' }
        })
          .then((r) => r.json())
          .catch(() => null)
      ]);

      let freshRecent: any[] = [];
      if (recentRes?.success && Array.isArray(recentRes.data) && recentRes.data.length > 0) {
        freshRecent = recentRes.data.map((ep: any, idx: number) => {
          const rawTitle = ep.title || '';
          const cleanedTitle = rawTitle.includes(' S') ? rawTitle : cleanAnimeTitle(rawTitle);
          const extractedEp =
            ep.episodeNumber || ep.episode || rawTitle.match(/الحلقة\s*(\d+)/)?.[1] || '1';
          const posterImg = ep.posterUrl || ep.imageUrl || ep.thumbnailUrl;
          return {
            _id: ep.id || `scraped-${ts}-${idx}`,
            episodeNumber: extractedEp,
            title: cleanedTitle,
            link: ep.link || '',
            animeId: {
              _id:
                typeof ep.animeId === 'string'
                  ? ep.animeId
                  : ep.animeId?._id || `search-${cleanedTitle}`,
              title: cleanedTitle,
              titleAr: cleanedTitle,
              posterUrl: posterImg,
              thumbnailUrl: posterImg,
              episodeLink: ep.link || ''
            }
          };
        });
      }

      if (dashRes?.success && dashRes.data) {
        const updatedDashboard = {
          ...dashRes.data,
          recentEpisodes:
            freshRecent.length > 0 ? freshRecent : dashRes.data.recentEpisodes || []
        };
        clientCache.set(cacheKey, updatedDashboard, 10 * 60 * 1000);
        setDashboard(updatedDashboard);
        setDashboardError(false);
      } else if (freshRecent.length > 0) {
        setDashboard((prev) => {
          const next = { ...prev, recentEpisodes: freshRecent };
          clientCache.set(cacheKey, next, 10 * 60 * 1000);
          return next;
        });
        setDashboardError(false);
      }
    } catch (e) {
      console.warn('On-demand refresh fallback:', e);
    } finally {
      setIsRefreshing(false);
      setInitialLoading(false);
    }
  };

  // Load Continue Watching from scoped localStorage and cloud entries when signed in
  useEffect(() => {
    let active = true;
    const syncHistory = async () => {
      let localList: any[] = [];
      try {
        if (typeof localStorage !== 'undefined') {
          let raw = localStorage.getItem(watchHistoryKey);
          // Migrate legacy unscoped watch history once for guest session only
          if (!raw && !user?.id) {
            const legacy = localStorage.getItem('local_watch_history');
            if (legacy) {
              localStorage.setItem(watchHistoryKey, legacy);
              localStorage.removeItem('local_watch_history');
              raw = legacy;
            }
          }
          const parsed = raw ? JSON.parse(raw) : [];
          if (Array.isArray(parsed)) localList = parsed;
        }
      } catch {}

      if (active) setHistory(localList);

      if (user?.id) {
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

          const mergedMap = new Map<string, any>();
          [...cloudItems, ...localList].forEach((item) => {
            const key = String(item.id);
            const prev = mergedMap.get(key);
            if (!prev || (item.updatedAt || 0) > (prev.updatedAt || 0)) {
              mergedMap.set(key, item);
            }
          });
          const merged = Array.from(mergedMap.values())
            .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
            .slice(0, 20);
          if (active) setHistory(merged);
          return;
        } catch {}
      }

      if (active) setHistory(localList);
    };

    void syncHistory();
    return () => {
      active = false;
    };
  }, [user?.id, watchHistoryKey]);

  // Load schedule for a specific day when user clicks a day chip in HomeView
  const handleSelectScheduleDay = async (dayKey: string) => {
    setSelectedScheduleDay(dayKey);
    if (dayKey === todayKey || customDaySchedule[dayKey]) return;

    setScheduleDayLoading(true);
    try {
      const res = await fetch(`/api/dashboard?day=${dayKey}&season=${sliderSettings.season || 'auto'}`, {
        cache: 'no-store'
      })
        .then((r) => r.json())
        .catch(() => null);
      if (res?.success && Array.isArray(res.data?.schedule) && res.data.schedule.length > 0) {
        setCustomDaySchedule((prev) => ({ ...prev, [dayKey]: res.data.schedule }));
      }
    } catch {} finally {
      setScheduleDayLoading(false);
    }
  };

  const handleRemoveHistoryItem = (e: React.MouseEvent, itemId: string | number) => {
    e.stopPropagation();
    setHistory((prev) => {
      const next = prev.filter((h) => String(h.id) !== String(itemId));
      try {
        localStorage.setItem(watchHistoryKey, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const handleClearAllHistory = () => {
    setHistory([]);
    try {
      localStorage.removeItem(watchHistoryKey);
    } catch {}
  };

  useEffect(() => {
    // Load dashboard immediately without waiting for Firestore round-trip
    void fetchDashboard('auto', 'best_season');

    let lastFetchedConfigKey = 'auto|best_season';

    const unsub = onSnapshot(
      doc(db, 'globalSettings', 'slider'),
      (snap) => {
        if (snap.exists()) {
          const fireConfigs = snap.data() as any;
          setSliderSettings((prev) => ({ ...prev, ...fireConfigs }));
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

  // Slider auto-scroll logic (pauses while user is actively dragging)
  useEffect(() => {
    if (topVisibleLimit <= 1 || isDraggingSlider) return;

    const intervalTime = (sliderSettings.speed || 3) * 1000;
    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % topVisibleLimit);
    }, intervalTime);

    return () => clearInterval(interval);
  }, [topVisibleLimit, sliderSettings.speed, isDraggingSlider]);

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
    dashboard.recentEpisodes && dashboard.recentEpisodes.length > 0
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

  // Compute displayed schedule for selectedScheduleDay
  const displaySchedule = useMemo(() => {
    if (selectedScheduleDay === todayKey && dashboard.schedule && dashboard.schedule.length > 0) {
      return dashboard.schedule;
    }
    if (customDaySchedule[selectedScheduleDay] && customDaySchedule[selectedScheduleDay].length > 0) {
      return customDaySchedule[selectedScheduleDay];
    }
    return [];
  }, [selectedScheduleDay, todayKey, dashboard.schedule, customDaySchedule]);

  const display = useDeviceDisplay();

  return (
    <PullToRefresh onRefresh={handleOnDemandRefresh}>
    <div className="pb-8 space-y-5 md:space-y-7">

      {/* Global alert banner if configured by admins */}
      {sliderSettings.globalAnnouncement && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mx-3 sm:mx-4 md:mx-8 p-3 bg-gradient-to-r from-purple-500/10 via-pink-500/10 to-purple-500/10 border border-purple-500/15 rounded-2xl flex items-center gap-2.5 text-xs text-purple-200 justify-center font-bold text-center leading-relaxed"
        >
          <Sparkles size={14} className="text-pink-400 shrink-0" />
          <span>{sliderSettings.globalAnnouncement}</span>
        </motion.div>
      )}

      {/* 1. Top Banner Slider — Kept exactly as designed, with 1:1 live drag tracking & immediate release snap */}
      {displayTop5 && displayTop5.length > 0 ? (
        <section
          ref={sliderContainerRef}
          className="relative overflow-hidden w-full select-none touch-pan-y"
          id="home_hero_slider"
        >
          <motion.div
            drag="x"
            style={{ x: sliderX }}
            dragConstraints={{
              left: -(
                (topVisibleLimit - 1) *
                (sliderContainerRef.current?.offsetWidth ||
                  (typeof window !== 'undefined' ? window.innerWidth : 1000))
              ),
              right: 0
            }}
            dragElastic={0.14}
            dragMomentum={false}
            onDragStart={() => {
              setIsDraggingSlider(true);
              dragPreventClickRef.current = false;
            }}
            onDrag={(_, info) => {
              if (Math.abs(info.offset.x) > 8) {
                dragPreventClickRef.current = true;
              }
            }}
            onDragEnd={(_, info) => {
              setIsDraggingSlider(false);
              const width = sliderContainerRef.current?.offsetWidth || window.innerWidth;
              const currentX = sliderX.get();
              // Combine actual dragged position with velocity so it snaps naturally the moment you release
              const projectedX = currentX + info.velocity.x * 0.16;
              let targetIndex = Math.round(-projectedX / width);

              // Also allow a quick flick or drag threshold to advance at least 1 slide
              if (targetIndex === currentSlide) {
                const dragThreshold = Math.min(width * 0.14, 65);
                if (info.offset.x < -dragThreshold || info.velocity.x < -280) {
                  targetIndex = currentSlide + 1;
                } else if (info.offset.x > dragThreshold || info.velocity.x > 280) {
                  targetIndex = currentSlide - 1;
                }
              }

              const clampedIndex = Math.max(0, Math.min(topVisibleLimit - 1, targetIndex));
              if (clampedIndex !== currentSlide) {
                setCurrentSlide(clampedIndex);
              } else {
                animate(sliderX, -clampedIndex * width, {
                  type: 'spring',
                  stiffness: 280,
                  damping: 30,
                  mass: 0.85
                });
              }

              setTimeout(() => {
                dragPreventClickRef.current = false;
              }, 60);
            }}
            className="flex w-full cursor-grab active:cursor-grabbing will-change-transform"
            dir="ltr"
          >
            {displayTop5.slice(0, topVisibleLimit).map((anime: any, idx: number) => (
              <div
                key={`top5-${anime._id}-${idx}`}
                onClick={() => {
                  if (dragPreventClickRef.current) return;
                  onAnimeClick?.(anime._id);
                }}
                className={`theme-keep-dark w-full flex-[0_0_100%] cursor-pointer relative group ${
                  display.isCoverScreen
                    ? 'aspect-[3/4] max-h-[58vh]'
                    : display.isLandscape && display.isPhone
                    ? 'aspect-[21/9] max-h-[75vh]'
                    : 'aspect-[4/5] sm:aspect-[16/9] md:aspect-[21/9] max-h-[560px]'
                }`}
                dir="rtl"
              >
                <img
                  src={
                    anime.posterUrl ||
                    'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=1200&auto=format&fit=crop'
                  }
                  referrerPolicy="no-referrer"
                  draggable={false}
                  className="w-full h-full object-cover pointer-events-none select-none"
                  alt={anime.title}
                />
                <div className={`absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent flex flex-col justify-end pointer-events-none ${
                  display.isCoverScreen ? 'p-4 pb-9' : 'p-6 md:p-12 pb-10'
                }`}>
                  <div className="w-full max-w-5xl mx-auto flex flex-col gap-2 sm:gap-3">
                    <span className="self-start bg-yellow-500 text-black text-[11px] sm:text-xs md:text-sm font-black px-2.5 sm:px-3 py-1 rounded-full shadow-lg border border-yellow-400">
                      #{idx + 1}{' '}
                      {sliderSettings.sliderMode === 'custom'
                        ? 'مختارات السلايدر'
                        : sliderSettings.sliderMode === 'trending_season'
                        ? 'الرائج هذا الموسم'
                        : sliderSettings.sliderMode === 'all_time_best'
                        ? 'الأفضل على الإطلاق'
                        : sliderSettings.sliderMode === 'classic_historical'
                        ? 'الأنميات التاريخية'
                        : 'الأفضل هذا الموسم'}
                    </span>
                    <h4 className={`${display.isCoverScreen ? 'text-xl leading-tight' : 'text-2xl sm:text-3xl md:text-5xl'} text-white font-black drop-shadow-lg truncate`}>
                      {anime.title}
                    </h4>
                    <div className="flex items-center gap-2.5 sm:gap-3">
                      <span className="text-xs sm:text-sm bg-black/50 backdrop-blur text-yellow-400 px-2 py-1 rounded-lg font-bold flex items-center gap-1 tabular-nums">
                        <Star size={14} fill="currentColor" /> {anime.rating || 0}
                      </span>
                      <span className="text-xs sm:text-sm text-neutral-200 drop-shadow-md font-bold truncate">
                        {anime.genres?.[0] || 'أنمي'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </motion.div>

          {/* Dots indicators */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5 z-40">
            {displayTop5.slice(0, topVisibleLimit).map((_, idx) => (
              <button
                key={idx}
                id={`slider_dot_${idx}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setCurrentSlide(idx);
                }}
                className={`w-2 h-2 rounded-full transition-all duration-300 cursor-pointer ${
                  currentSlide === idx
                    ? 'bg-purple-500 w-5 md:w-6'
                    : 'bg-white/40 hover:bg-white/70'
                }`}
              />
            ))}
          </div>
        </section>
      ) : initialLoading ? (
        <div className="pt-4 px-4 md:px-8">
          <div className="aspect-[3/4] md:aspect-[21/9] rounded-2xl bg-neutral-900 animate-pulse border border-neutral-800 w-full"></div>
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
      <section className="px-4 md:px-8 space-y-3">
        <div className="flex gap-2.5 overflow-x-auto hide-scrollbar pb-1 pt-1 max-w-7xl mx-auto">
          {categories.map((cat, idx) => (
            <motion.button
              key={idx}
              onClick={() => onSearchCategory?.(cat)}
              whileHover={{ scale: 1.05, y: -2 }}
              whileTap={{ scale: 0.95 }}
              className="flex-shrink-0 px-4 py-2 bg-neutral-900/60 border border-neutral-800 hover:border-purple-500 hover:bg-neutral-800 hover:text-white rounded-full text-xs font-bold text-neutral-300 transition whitespace-nowrap cursor-pointer gpu-accelerated"
            >
              {cat}
            </motion.button>
          ))}
        </div>
      </section>

      {/* 3. History (Continue Watching) with Progress Bar & Quick Delete */}
      <AnimatePresence>
        {history.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0 }}
            className="px-4 md:px-8"
          >
            <div className="flex justify-between items-end mb-3 max-w-7xl mx-auto">
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
            <div className="flex gap-3.5 overflow-x-auto pb-4 hide-scrollbar max-w-7xl mx-auto">
              {history.map((item: any, idx: number) => {
                const progressPct = Math.min(
                  95,
                  Math.max(22, Number(item.progress) || ((Number(item.lastEpisode || 1) * 19) % 75) + 20)
                );
                return (
                  <motion.div
                    key={`history-${item.id}-${idx}`}
                    onClick={() => onAnimeClick?.(item.id, item.lastEpisode)}
                    onMouseEnter={() => prefetchDetails(item.id)}
                    whileHover={{ y: -6, scale: 1.02, borderColor: '#3b82f6' }}
                    whileTap={{ scale: 0.98 }}
                    className={`theme-keep-dark cursor-pointer ${display.isCoverScreen ? 'w-[155px]' : 'w-[175px] md:w-[230px] lg:w-[260px]'} flex-shrink-0 relative rounded-2xl overflow-hidden group border border-neutral-800 transition-all duration-300 aspect-[16/9] bg-neutral-900 gpu-accelerated shadow-lg`}
                  >
                    <img
                      src={item.posterUrl || 'https://via.placeholder.com/300x168?text=Anime'}
                      referrerPolicy="no-referrer"
                      loading="lazy"
                      className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500"
                      alt="poster"
                    />
                    {/* Quick Remove Button */}
                    <button
                      type="button"
                      onClick={(e) => handleRemoveHistoryItem(e, item.id)}
                      title="إزالة من متابعة المشاهدة"
                      className="absolute top-2 left-2 z-20 w-6 h-6 rounded-full bg-black/70 hover:bg-red-600 text-neutral-300 hover:text-white border border-white/15 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                    >
                      <X size={12} />
                    </button>

                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/45 to-transparent flex flex-col justify-end p-3">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="flex items-center gap-1.5">
                          <div className="w-6 h-6 rounded-full bg-blue-500 shadow-md shadow-blue-500/40 flex items-center justify-center">
                            <Play size={10} fill="white" className="ml-0.5 text-white" />
                          </div>
                          <span className="text-blue-300 text-[11px] font-black">
                            الحلقة {item.lastEpisode || 1}
                          </span>
                        </div>
                        <span className="text-[10px] text-neutral-400 font-mono flex items-center gap-1">
                          <Clock size={10} />
                          {progressPct}%
                        </span>
                      </div>
                      <h5 className="font-bold text-xs md:text-sm text-white truncate drop-shadow mb-2">
                        {item.title}
                      </h5>
                      {/* Visual Episode Progress Bar */}
                      <div className="w-full h-1 bg-white/15 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full transition-all duration-500"
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* 4. Latest Episodes */}
      <section className="px-4 md:px-8">
        <div className="flex justify-between items-end mb-3 max-w-7xl mx-auto">
          <div className="flex items-center gap-2">
            <h3 className="text-white font-black text-lg border-r-4 border-red-500 pr-2">
              أحدث الحلقات
            </h3>
          </div>
          <button
            onClick={onNavigateToRecent}
            className="text-[10px] md:text-xs font-bold text-neutral-400 hover:text-white flex items-center gap-1 group cursor-pointer"
          >
            عرض الكل <ChevronLeft size={14} className="transition-transform group-hover:-translate-x-1" />
          </button>
        </div>

        <div className="flex gap-3.5 overflow-x-auto pb-4 hide-scrollbar max-w-7xl mx-auto items-stretch">
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
              'https://via.placeholder.com/200x300?text=Anime';
            const epNumber =
              ep.episodeNumber || (ep.title && ep.title.match(/الحلقة\s*(\d+)/)?.[1]) || '1';

            return (
              <motion.div
                key={`recent-${ep._id}-${idx}`}
                onClick={() => onAnimeClick?.(String(animeTargetId))}
                onMouseEnter={() => prefetchDetails(animeTargetId)}
                whileHover={{ y: -4, scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className={`cursor-pointer ${display.isCoverScreen ? 'w-[114px]' : 'w-[128px] sm:w-[150px] md:w-[170px] lg:w-[188px]'} flex-shrink-0 flex flex-col group`}
              >
                <div className="theme-keep-dark relative aspect-[3/4] rounded-2xl overflow-hidden border border-neutral-800/80 group-hover:border-red-500/60 transition-all duration-300 bg-neutral-900 shadow-md group-hover:shadow-red-950/20">
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
                    className="w-full h-full object-cover group-hover:scale-105 transition-all duration-500"
                    alt={cleanTitle}
                  />

                  <div className="absolute top-2 right-2 z-10 pointer-events-none">
                    <span className="bg-red-600/95 backdrop-blur-md text-white border border-red-500/30 px-2 py-0.5 rounded-lg text-[10px] md:text-xs font-black shadow-lg">
                      حلقة {epNumber}
                    </span>
                  </div>
                </div>

                <div className="pt-2 px-1 text-center">
                  <h5
                    className="font-bold text-xs md:text-sm text-neutral-200 group-hover:text-red-400 transition-colors line-clamp-1 truncate"
                    dir="ltr"
                  >
                    {cleanTitle}
                  </h5>
                </div>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* 5. Daily Trending Today — رائج اليوم */}
      <section className="px-4 md:px-8">
        <div className="flex justify-between items-end mb-3 max-w-7xl mx-auto">
          <div className="flex items-center gap-2">
            <h3 className="text-white font-black text-lg border-r-4 border-orange-500 pr-2">
              رائج اليوم
            </h3>
            <Flame size={17} className="text-orange-500" />
          </div>
        </div>
        <div className="flex gap-3.5 overflow-x-auto pb-4 hide-scrollbar max-w-7xl mx-auto">
          {displayPopular.map((anime: any, idx: number) => {
            const rank = idx + 1;
            const isTop3 = rank <= 3;
            return (
              <motion.div
                key={`trending-today-${anime._id}-${idx}`}
                onClick={() => onAnimeClick?.(anime._id)}
                onMouseEnter={() => prefetchDetails(anime._id)}
                whileHover={{ y: -6, scale: 1.02, borderColor: '#f97316' }}
                whileTap={{ scale: 0.98 }}
                className={`theme-keep-dark cursor-pointer ${display.isCoverScreen ? 'w-[122px]' : 'w-[140px] md:w-[185px] lg:w-[215px]'} flex-shrink-0 relative rounded-2xl overflow-hidden group border border-neutral-800 transition-all duration-300 aspect-[3/4] bg-neutral-900 gpu-accelerated shadow-lg`}
              >
                <img
                  src={anime.posterUrl || 'https://via.placeholder.com/200x300?text=Anime'}
                  referrerPolicy="no-referrer"
                  loading="lazy"
                  className="w-full h-full object-cover opacity-95 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500"
                  alt={anime.title}
                />

                {/* Top Rank Badge */}
                <div className="absolute top-2 right-2 z-10 pointer-events-none">
                  <span
                    className={`px-2.5 py-0.5 rounded-lg text-[11px] font-black shadow-lg border ${
                      rank === 1
                        ? 'bg-gradient-to-r from-orange-500 to-amber-400 text-black border-yellow-200'
                        : rank === 2
                        ? 'bg-gradient-to-r from-slate-200 to-slate-400 text-black border-white'
                        : rank === 3
                        ? 'bg-gradient-to-r from-amber-600 to-orange-700 text-white border-amber-400/50'
                        : 'bg-black/75 backdrop-blur-md text-orange-400 border-orange-500/30'
                    }`}
                  >
                    #{rank}
                  </span>
                </div>

                {/* Rating Pill on Top Left */}
                {anime.rating && (
                  <div className="absolute top-2 left-2 z-10 pointer-events-none">
                    <span className="bg-black/70 backdrop-blur-md text-white px-2 py-0.5 rounded-lg text-[10px] font-bold flex items-center gap-1 border border-white/10">
                      <Star size={10} className="text-yellow-400" fill="currentColor" />
                      {anime.rating}
                    </span>
                  </div>
                )}

                {/* Giant Decorative Rank Watermark */}
                <span
                  className={`absolute bottom-8 left-2 font-black text-5xl md:text-6xl leading-none select-none pointer-events-none transition-transform duration-300 group-hover:scale-110 ${
                    isTop3 ? 'text-orange-400/25' : 'text-white/15'
                  }`}
                  style={{ WebkitTextStroke: '1.5px rgba(255,255,255,0.28)' }}
                >
                  {rank}
                </span>

                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/35 to-transparent flex flex-col justify-end p-3 pointer-events-none">
                  <h5 className="font-bold text-xs md:text-sm text-white truncate drop-shadow text-right">
                    {anime.title}
                  </h5>
                </div>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* 7. Current Season */}
      <section className="px-4 md:px-8">
        <div className="flex justify-between items-end mb-3 max-w-7xl mx-auto">
          <h3 className="text-white font-black text-lg border-r-4 border-purple-500 pr-2">
            انميات الموسم الحالي
          </h3>
          <button
            onClick={onNavigateToSeason}
            className="text-[10px] md:text-xs font-bold text-neutral-400 hover:text-white flex items-center gap-1 group cursor-pointer"
          >
            عرض الكل <ChevronLeft size={14} className="transition-transform group-hover:-translate-x-1" />
          </button>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-4 hide-scrollbar max-w-7xl mx-auto">
          {displayCurrentSeason.map((anime: any, idx: number) => (
            <motion.div
              key={`current-${anime._id}-${idx}`}
              onClick={() => onAnimeClick?.(anime._id)}
              onMouseEnter={() => prefetchDetails(anime._id)}
              whileHover={{ y: -6, scale: 1.02, borderColor: '#a855f7' }}
              whileTap={{ scale: 0.98 }}
              className={`theme-keep-dark cursor-pointer ${display.isCoverScreen ? 'w-[118px]' : 'w-[130px] md:w-[180px] lg:w-[220px]'} flex-shrink-0 relative rounded-2xl overflow-hidden group border border-neutral-800 transition-all duration-300 aspect-[3/4] bg-neutral-900 gpu-accelerated`}
            >
              <img
                src={anime.posterUrl || 'https://via.placeholder.com/200x300?text=Anime'}
                referrerPolicy="no-referrer"
                loading="lazy"
                className="w-full h-full object-cover opacity-95 group-hover:opacity-100 group-hover:scale-[1.03] transition-all duration-500"
                alt="poster"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent flex flex-col justify-end p-3 pointer-events-none">
                <span className="absolute top-2 right-2 bg-black/60 backdrop-blur-md text-white px-2 py-1 rounded text-[10px] font-bold shadow-lg flex items-center gap-1">
                  <Star size={10} className="text-yellow-400" /> {anime.rating || 'N/A'}
                </span>
                <span className="absolute top-2 left-2 bg-purple-600 text-white px-2 py-0.5 rounded text-[10px] font-bold shadow-lg flex items-center gap-1">
                  <Tv size={10} /> جديد
                </span>
                <h5 className="font-bold text-xs md:text-sm text-white drop-shadow line-clamp-2 text-right dir-rtl">
                  {anime.title}
                </h5>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* 7.5. Top Anime Section */}
      {displayTopAnime.length > 0 && (
        <section className="px-4 md:px-8">
          <div className="flex justify-between items-end mb-3 max-w-7xl mx-auto">
            <h3 className="text-white font-black text-lg border-r-4 border-amber-500 pr-2 flex items-center gap-2">
              <Crown size={18} className="text-amber-400" />
              <span>أفضل الأنميات</span>
            </h3>
            <button
              onClick={onNavigateToTopAnime}
              className="text-[10px] md:text-xs font-bold text-neutral-400 hover:text-white flex items-center gap-1 group cursor-pointer"
            >
              عرض الكل <ChevronLeft size={14} className="transition-transform group-hover:-translate-x-1" />
            </button>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-4 hide-scrollbar max-w-7xl mx-auto">
            {displayTopAnime.map((anime: any, idx: number) => {
              const targetId = String(anime._id || anime.slug || anime.id || `search-${anime.title}`);
              return (
                <motion.div
                  key={`top-anime-${targetId}-${idx}`}
                  onClick={() => onAnimeClick?.(targetId)}
                  onMouseEnter={() => prefetchDetails(targetId)}
                  whileHover={{ y: -6, scale: 1.02, borderColor: '#f59e0b' }}
                  whileTap={{ scale: 0.98 }}
                  className={`theme-keep-dark cursor-pointer ${display.isCoverScreen ? 'w-[118px]' : 'w-[130px] md:w-[180px] lg:w-[220px]'} flex-shrink-0 relative rounded-2xl overflow-hidden group border border-neutral-800 transition-all duration-300 aspect-[3/4] bg-neutral-900 gpu-accelerated`}
                >
                  <img
                    src={anime.posterUrl || 'https://via.placeholder.com/200x300?text=Anime'}
                    referrerPolicy="no-referrer"
                    loading="lazy"
                    className="w-full h-full object-cover opacity-95 group-hover:opacity-100 group-hover:scale-[1.03] transition-all duration-500"
                    alt={anime.title}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/25 to-transparent flex flex-col justify-end p-3 pointer-events-none">
                    <span className="absolute top-2 right-2 bg-amber-500 text-black px-2 py-0.5 rounded text-[10px] font-black shadow-lg">
                      #{idx + 1}
                    </span>
                    {anime.episodesCount && (
                      <span className="absolute top-2 left-2 bg-black/70 backdrop-blur-md text-white px-2 py-0.5 rounded text-[10px] font-bold border border-white/10">
                        {anime.episodesCount} حلقة
                      </span>
                    )}
                    <h5 className="font-bold text-xs md:text-sm text-white drop-shadow line-clamp-2 text-right dir-rtl">
                      {anime.title}
                    </h5>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </section>
      )}

      {/* 7.6. Anime Movies Section */}
      {displayMovies.length > 0 && (
        <section className="px-4 md:px-8">
          <div className="flex justify-between items-end mb-3 max-w-7xl mx-auto">
            <h3 className="text-white font-black text-lg border-r-4 border-rose-500 pr-2 flex items-center gap-2">
              <Film size={18} className="text-rose-400" />
              <span>أفلام الأنمي</span>
            </h3>
            <button
              onClick={onNavigateToMovies}
              className="text-[10px] md:text-xs font-bold text-neutral-400 hover:text-white flex items-center gap-1 group cursor-pointer"
            >
              عرض الكل <ChevronLeft size={14} className="transition-transform group-hover:-translate-x-1" />
            </button>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-4 hide-scrollbar max-w-7xl mx-auto">
            {displayMovies.map((anime: any, idx: number) => {
              const targetId = String(anime._id || anime.slug || anime.id || `search-${anime.title}`);
              return (
                <motion.div
                  key={`movie-anime-${targetId}-${idx}`}
                  onClick={() => onAnimeClick?.(targetId)}
                  onMouseEnter={() => prefetchDetails(targetId)}
                  whileHover={{ y: -6, scale: 1.02, borderColor: '#f43f5e' }}
                  whileTap={{ scale: 0.98 }}
                  className={`theme-keep-dark cursor-pointer ${display.isCoverScreen ? 'w-[118px]' : 'w-[130px] md:w-[180px] lg:w-[220px]'} flex-shrink-0 relative rounded-2xl overflow-hidden group border border-neutral-800 transition-all duration-300 aspect-[3/4] bg-neutral-900 gpu-accelerated`}
                >
                  <img
                    src={anime.posterUrl || 'https://via.placeholder.com/200x300?text=Anime'}
                    referrerPolicy="no-referrer"
                    loading="lazy"
                    className="w-full h-full object-cover opacity-95 group-hover:opacity-100 group-hover:scale-[1.03] transition-all duration-500"
                    alt={anime.title}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/25 to-transparent flex flex-col justify-end p-3 pointer-events-none">
                    <span className="absolute top-2 left-2 bg-rose-600 text-white px-2 py-0.5 rounded text-[10px] font-black shadow-lg">
                      فيلم
                    </span>
                    <h5 className="font-bold text-xs md:text-sm text-white drop-shadow line-clamp-2 text-right dir-rtl">
                      {anime.title}
                    </h5>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </section>
      )}

      {/* 8. Interactive Broadcast Schedule with Instant Day Switcher */}
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
              onClick={() => onNavigateToSchedule?.(selectedScheduleDay)}
              className="text-[10px] md:text-xs font-bold text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1 bg-blue-500/10 hover:bg-blue-500/20 px-3 py-1.5 rounded-lg border border-blue-500/20 cursor-pointer"
            >
              عرض الجدول الكامل <ChevronLeft size={14} />
            </button>
          </div>

          {/* Instant Day Switcher Bar */}
          <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-1">
            {WEEK_DAYS.map((day) => {
              const isSelected = selectedScheduleDay === day.key;
              const isToday = day.key === todayKey;
              return (
                <button
                  key={day.key}
                  type="button"
                  onClick={() => handleSelectScheduleDay(day.key)}
                  className={`flex-shrink-0 px-3.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 border ${
                    isSelected
                      ? 'bg-blue-600 text-white border-blue-400 shadow-lg shadow-blue-600/25'
                      : 'bg-neutral-900/70 text-neutral-400 border-neutral-800 hover:border-neutral-700 hover:text-white'
                  }`}
                >
                  <span>{day.labelAr}</span>
                  {isToday && (
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        isSelected ? 'bg-white' : 'bg-blue-400'
                      }`}
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* Day Anime Cards */}
          <div className="relative">
            {scheduleDayLoading && (
              <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] z-20 rounded-2xl flex items-center justify-center">
                <Loader2 size={20} className="animate-spin text-blue-400" />
              </div>
            )}
            <div className="flex gap-3 overflow-x-auto pb-4 hide-scrollbar">
              {displaySchedule.map((anime: any, idx: number) => {
                const targetId = String(anime._id || anime.slug || anime.mal_id || `search-${anime.title}`);
                return (
                  <motion.div
                    key={`schedule-${selectedScheduleDay}-${targetId}-${idx}`}
                    onClick={() => onAnimeClick?.(targetId)}
                    onMouseEnter={() => prefetchDetails(targetId)}
                    whileHover={{ y: -6, scale: 1.02, borderColor: '#3b82f6' }}
                    whileTap={{ scale: 0.98 }}
                    className={`theme-keep-dark cursor-pointer ${display.isCoverScreen ? 'w-[118px]' : 'w-[130px] md:w-[180px] lg:w-[220px]'} flex-shrink-0 relative rounded-2xl overflow-hidden group border border-neutral-800 transition-all duration-300 aspect-[3/4] bg-neutral-900 gpu-accelerated`}
                  >
                    <img
                      src={anime.posterUrl || 'https://via.placeholder.com/200x300?text=Anime'}
                      referrerPolicy="no-referrer"
                      loading="lazy"
                      className="w-full h-full object-cover opacity-95 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500"
                      alt={anime.title}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent flex flex-col justify-end p-3 pointer-events-none">
                      {anime.broadcast?.time && (
                        <span className="absolute top-2 left-2 bg-blue-600/90 backdrop-blur-md text-white px-2 py-0.5 rounded text-[10px] font-black shadow flex items-center gap-1">
                          <Clock size={9} />
                          <span>{anime.broadcast.time}</span>
                        </span>
                      )}
                      <h5 className="font-bold text-xs md:text-sm text-white truncate drop-shadow text-center">
                        {anime.title}
                      </h5>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

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
    </div>
    </PullToRefresh>
  );
}
