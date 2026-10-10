import {
  Play,
  Star,
  RefreshCw,
  ChevronLeft,
  Quote,
  Dices,
  Tv,
  Sparkles,
  X,
  Swords,
  Trophy,
  Flame,
  CalendarDays,
  Trash2,
  Clock
} from 'lucide-react';
import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence, useMotionValue, animate } from 'motion/react';
import { clientCache } from '../utils/clientCache';
import { db } from '../firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../firebaseUtils';
import {
  CURATED_ANIME_LIST,
  getCuratedTop5,
  getCuratedRecentEpisodes,
  getCuratedSeasonAnime
} from '../data/curatedAnimeDatabase';
import { cleanAnimeTitle } from '../utils/animeTitleCleaner';
import { getActiveNonOverlappingEvent } from '../services/arenaCalendarEngine';
import ThreeHeaderTrophyEmblem from '../components/ThreeHeaderTrophyEmblem';
import {
  ANIME_WORLD_BACKGROUNDS,
  VISUAL_ANIME_GAMES
} from '../components/VisualAnimeGamesSpace';

interface HomeViewProps {
  onAnimeClick?: (animeId: string, epNum?: string) => void;
  onNavigateToGames?: () => void;
  onSearchCategory?: (category: string) => void;
  onNavigateToSchedule?: (targetDay?: string) => void;
  onNavigateToRecent?: () => void;
  onNavigateToSeason?: () => void;
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
  onNavigateToGames,
  onSearchCategory,
  onNavigateToSchedule,
  onNavigateToRecent,
  onNavigateToSeason
}: HomeViewProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeUsersCount] = useState(14208);
  const activeArenaEvent = useMemo(() => getActiveNonOverlappingEvent(), []);

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
    schedule: []
  });

  const [dashboard, setDashboard] = useState<{
    top5: any[];
    recentEpisodes: any[];
    popular: any[];
    currentSeason: any[];
    schedule: any[];
  }>(() => getFallbackDashboard());

  const [history, setHistory] = useState<any[]>([]);
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

      const freshData = await clientCache.fetchWithRevalidate<any>(
        `direct_dashboard_${activeSeason}_${activeMode}_${clientDay}`,
        `/api/dashboard?day=${clientDay}&season=${activeSeason}&sliderMode=${activeMode}`,
        (data) => {
          if (data && (data.top5?.length > 0 || data.recentEpisodes?.length > 0)) {
            setDashboard(data);
          }
        }
      );
      if (freshData && (freshData.top5?.length > 0 || freshData.recentEpisodes?.length > 0)) {
        setDashboard(freshData);
      }
    } catch (e) {
      console.warn('Direct dashboard fetch notice:', e);
    } finally {
      setIsRefreshing(false);
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
        setDashboard(updatedDashboard);
      } else if (freshRecent.length > 0) {
        setDashboard((prev) => ({ ...prev, recentEpisodes: freshRecent }));
      }
    } catch (e) {
      console.warn('On-demand refresh fallback:', e);
    } finally {
      setIsRefreshing(false);
    }
  };

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
    setHistory((prev) => prev.filter((h) => String(h.id) !== String(itemId)));
  };

  const handleClearAllHistory = () => {
    setHistory([]);
  };

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'globalSettings', 'slider'),
      (snap) => {
        if (snap.exists()) {
          const fireConfigs = snap.data() as any;
          setSliderSettings((prev) => ({ ...prev, ...fireConfigs }));
          fetchDashboard(fireConfigs.season || 'auto', fireConfigs.sliderMode || 'best_season');
        } else {
          fetchDashboard('auto', 'best_season');
        }
      },
      (err) => {
        console.warn('Failed to query real-time slider configs, using direct fetch:', err);
        fetchDashboard();
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
      : getCuratedRecentEpisodes();

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
        : getCuratedSeasonAnime().slice(0, 10);
    return list.filter((a: any) => !isHiddenByAdmin(a));
  }, [dashboard.popular, animeCuration]);

  const displayCurrentSeason = useMemo(() => {
    const list =
      dashboard.currentSeason && dashboard.currentSeason.length > 0
        ? dashboard.currentSeason
        : getCuratedSeasonAnime();
    return list.filter((a: any) => !isHiddenByAdmin(a));
  }, [dashboard.currentSeason, animeCuration]);

  // Compute displayed schedule for selectedScheduleDay
  const displaySchedule = useMemo(() => {
    if (selectedScheduleDay === todayKey && dashboard.schedule && dashboard.schedule.length > 0) {
      return dashboard.schedule;
    }
    if (customDaySchedule[selectedScheduleDay] && customDaySchedule[selectedScheduleDay].length > 0) {
      return customDaySchedule[selectedScheduleDay];
    }
    const dayFiltered = CURATED_ANIME_LIST.filter(
      (a) => a.broadcastDay.toLowerCase() === selectedScheduleDay.toLowerCase()
    ).map((anime) => ({
      _id: String(anime.mal_id),
      title: anime.title_english || anime.title,
      posterUrl: anime.posterUrl,
      rating: anime.rating,
      genres: anime.genres
    }));
    return dayFiltered.length > 0 ? dayFiltered : getCuratedTop5();
  }, [selectedScheduleDay, todayKey, dashboard.schedule, customDaySchedule]);

  return (
    <div className="pb-8 space-y-5 md:space-y-7">
      {/* Global alert banner if configured by admins */}
      {sliderSettings.globalAnnouncement && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mx-4 md:mx-8 p-3 bg-gradient-to-r from-purple-500/10 via-pink-500/10 to-purple-500/10 border border-purple-500/15 rounded-2xl flex items-center gap-2.5 text-xs text-purple-200 justify-center font-bold text-center leading-relaxed"
        >
          <Sparkles size={14} className="text-pink-400 animate-pulse shrink-0" />
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
                className="w-full flex-[0_0_100%] cursor-pointer relative aspect-[4/5] sm:aspect-[16/9] md:aspect-[21/9] group"
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
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent flex flex-col justify-end p-6 md:p-12 pb-10 pointer-events-none">
                  <div className="w-full max-w-5xl mx-auto flex flex-col gap-3">
                    <span className="self-start bg-yellow-500 text-black text-xs md:text-sm font-black px-3 py-1 rounded-full shadow-lg border border-yellow-400">
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
                    <h4 className="text-3xl md:text-5xl text-white font-black drop-shadow-lg truncate">
                      {anime.title}
                    </h4>
                    <div className="flex items-center gap-3">
                      <span className="text-sm bg-black/50 backdrop-blur text-yellow-400 px-2 py-1 rounded-lg font-bold flex items-center gap-1">
                        <Star size={14} fill="currentColor" /> {anime.rating || 0}
                      </span>
                      <span className="text-sm text-neutral-200 drop-shadow-md font-bold">
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
      ) : (
        <div className="pt-24 px-4 md:px-8">
          <div className="aspect-[3/4] md:aspect-[21/9] rounded-none bg-neutral-900 animate-pulse border-b border-neutral-800 w-full"></div>
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
                    className="cursor-pointer w-[175px] md:w-[230px] lg:w-[260px] flex-shrink-0 relative rounded-2xl overflow-hidden group border border-neutral-800 transition-all duration-300 aspect-[16/9] bg-neutral-900 gpu-accelerated shadow-lg"
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
            <button
              onClick={handleOnDemandRefresh}
              className={`text-neutral-400 hover:text-white transition p-1.5 rounded-full hover:bg-neutral-800 cursor-pointer ${
                isRefreshing ? 'animate-spin text-purple-500' : ''
              }`}
              title="تحديث الحلقات الآن"
            >
              <RefreshCw size={14} />
            </button>
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
                className="cursor-pointer w-[125px] sm:w-[150px] md:w-[170px] lg:w-[185px] flex-shrink-0 flex flex-col group"
              >
                <div className="relative aspect-[3/4] rounded-2xl overflow-hidden border border-neutral-800/80 group-hover:border-red-500/60 transition-all duration-300 bg-neutral-900 shadow-md group-hover:shadow-red-950/20">
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

      {/* 5. Live 3D Arena & Standalone 2D Games Portal (Elevated Showcase) */}
      <section className="px-4 md:px-8 max-w-7xl mx-auto">
        <div
          onClick={() => onNavigateToGames?.()}
          className="relative rounded-3xl overflow-hidden border border-white/15 hover:border-[#FF1744]/70 transition-all duration-500 cursor-pointer shadow-2xl group"
        >
          {/* Custom Anime Colosseum World Artwork Background */}
          <img
            src={ANIME_WORLD_BACKGROUNDS.colosseum}
            alt="Otaku Colosseum World"
            className="absolute inset-0 w-full h-full object-cover opacity-45 group-hover:scale-105 group-hover:opacity-60 transition-all duration-700 pointer-events-none"
          />
          <div className="absolute inset-0 bg-gradient-to-l from-black/95 via-black/80 to-black/65 pointer-events-none" />

          <div className="relative z-10 p-5 md:p-7 flex flex-col lg:flex-row items-center justify-between gap-6">
            {/* Right Side: Event Info + Standalone 2D Games Preview */}
            <div className="flex flex-col sm:flex-row items-center sm:items-start text-center sm:text-right gap-4 flex-1 min-w-0">
              {/* Interactive 3D Low-Poly Rotating Trophy Emblem */}
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  onNavigateToGames?.();
                }}
                className="relative shrink-0 rounded-2xl bg-black/65 border border-amber-400/35 p-1.5 shadow-[0_0_30px_rgba(255,23,68,0.28)]"
              >
                <ThreeHeaderTrophyEmblem mode="tournaments" size={76} />
              </div>

              <div className="space-y-2 min-w-0 flex-1">
                <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap">
                  <span className="bg-[#FF1744] text-white text-[10px] md:text-xs font-black px-3 py-0.5 rounded-full shadow-lg flex items-center gap-1">
                    <Flame size={12} />
                    {activeArenaEvent.tierBadgeAr}
                  </span>
                  <span className="bg-amber-500/15 text-amber-300 border border-amber-400/30 text-[10px] md:text-xs font-black px-3 py-0.5 rounded-full">
                    الجائزة الكبرى {activeArenaEvent.prizePoolCoins.toLocaleString()} كوينز • مضاعف ×
                    {activeArenaEvent.rewardMultiplier}
                  </span>
                  <span className="bg-purple-500/20 text-purple-200 border border-purple-400/30 text-[10px] font-black px-2.5 py-0.5 rounded-full">
                    8 ألعاب 2D مستقلة
                  </span>
                </div>

                <h3 className="text-white text-lg md:text-2xl font-black tracking-tight">
                  {activeArenaEvent.titleAr} — حلبة الأوتاكو وعوالم الألعاب 2D
                </h3>
                <p className="text-xs md:text-sm text-neutral-300 max-w-2xl leading-relaxed">
                  {activeArenaEvent.subtitleAr} • اختر مقاتلك وادخل عوالم الألعاب الحركية المستقلة مع
                  الضربات القاضية، الجسيمات ثلاثية الأبعاد، ومكافآت الكوينز الفورية!
                </p>

                {/* Quick Mini Game World Chips */}
                <div className="flex items-center justify-center sm:justify-start gap-2 pt-1 flex-wrap">
                  {VISUAL_ANIME_GAMES.slice(0, 4).map((g) => (
                    <span
                      key={g.id}
                      className="text-[10px] font-bold px-2.5 py-1 rounded-xl bg-white/5 border border-white/10 text-neutral-200 flex items-center gap-1.5"
                    >
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: g.accent }}
                      />
                      {g.titleAr}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Left CTA Button */}
            <motion.button
              type="button"
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              onClick={(e) => {
                e.stopPropagation();
                onNavigateToGames?.();
              }}
              className="w-full lg:w-auto bg-gradient-to-r from-[#FF1744] via-rose-600 to-amber-500 text-white font-black text-xs md:text-sm px-6 py-3.5 rounded-2xl flex items-center justify-center gap-2 shrink-0 shadow-[0_10px_28px_rgba(255,23,68,0.4)] cursor-pointer border border-white/20"
            >
              <Swords size={16} />
              <span>دخول الحلبة والألعاب 2D</span>
              <ChevronLeft size={16} />
            </motion.button>
          </div>
        </div>
      </section>

      {/* 6. Daily Trending Today — رائج اليوم */}
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
                className="cursor-pointer w-[140px] md:w-[185px] lg:w-[215px] flex-shrink-0 relative rounded-2xl overflow-hidden group border border-neutral-800 transition-all duration-300 aspect-[3/4] bg-neutral-900 gpu-accelerated shadow-lg"
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
              className="cursor-pointer w-[130px] md:w-[180px] lg:w-[220px] flex-shrink-0 relative rounded-2xl overflow-hidden group border border-neutral-800 transition-all duration-300 aspect-[3/4] bg-neutral-900 gpu-accelerated"
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
                <RefreshCw size={20} className="animate-spin text-blue-400" />
              </div>
            )}
            <div className="flex gap-3 overflow-x-auto pb-4 hide-scrollbar">
              {[...displaySchedule].reverse().map((anime: any, idx: number) => (
                <motion.div
                  key={`schedule-${selectedScheduleDay}-${anime._id}-${idx}`}
                  onClick={() => onAnimeClick?.(anime._id || `search-${anime.title}`)}
                  onMouseEnter={() => prefetchDetails(anime._id || `search-${anime.title}`)}
                  whileHover={{ y: -6, scale: 1.02, borderColor: '#3b82f6' }}
                  whileTap={{ scale: 0.98 }}
                  className="cursor-pointer w-[130px] md:w-[180px] lg:w-[220px] flex-shrink-0 relative rounded-2xl overflow-hidden group border border-neutral-800 transition-all duration-300 aspect-[3/4] bg-neutral-900 gpu-accelerated"
                >
                  <img
                    src={anime.posterUrl || 'https://via.placeholder.com/200x300?text=Anime'}
                    referrerPolicy="no-referrer"
                    loading="lazy"
                    className="w-full h-full object-cover opacity-95 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500"
                    alt="poster"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent flex flex-col justify-end p-3 pointer-events-none">
                    <h5 className="font-bold text-xs md:text-sm text-white truncate drop-shadow text-center">
                      {anime.title}
                    </h5>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 9. Social Indicator Banner */}
      <section className="px-4 md:px-8 max-w-7xl mx-auto" id="social_indicator_banner">
        <div className="bg-gradient-to-r from-neutral-900 to-zinc-950 border border-neutral-800/80 rounded-3xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-right">
            <h4 className="text-white text-xs font-black">
              أكبر مجتمع أوتاكو عربي تفاعلي والسرعة رقم #1 ⚡
            </h4>
            <p className="text-[10px] text-neutral-400 mt-1">
              تصفّح وشاهد الأنمي وخض البطولات التنافسية مع آلاف المتابعين الآن بأحدث التقنيات.
            </p>
          </div>
          <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-3.5 py-1.5 rounded-2xl flex items-center gap-2 text-xs font-bold leading-none">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span>
              نشط الآن:{' '}
              <strong className="font-extrabold font-mono text-white">
                {activeUsersCount.toLocaleString()}
              </strong>{' '}
              أوتاكو متصل
            </span>
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
                <RefreshCw size={12} />
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

                  <button
                    type="button"
                    onClick={() => onNavigateToGames?.()}
                    className="text-xs md:text-sm bg-neutral-800 hover:bg-neutral-700 text-white font-bold px-3.5 py-2 md:px-4 md:py-2.5 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer border border-white/10"
                  >
                    <span>ألعاب الأنمي 2D</span>
                    <Dices size={14} className="text-purple-400" />
                  </button>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </section>
    </div>
  );
}
