import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ChevronRight,
  Star,
  Flame,
  BookOpen,
  Loader2,
  AlertCircle,
  RefreshCw,
  Trash2,
  X,
  Sparkles,
  Layers,
  Clock,
  Search,
} from 'lucide-react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { clientCache } from '../utils/clientCache';
import { cloudCatalogService } from '../services/cloudCatalogService';
import PullToRefresh from '../components/PullToRefresh';
import { LongPressCopy } from '../components/LongPressCopy';
import { resolveGenreTaxonomyItem, translateGenreToArabic } from '../utils/genreTaxonomy';
import { useDeviceDisplay } from '../hooks/useDeviceDisplay';
import { computeCutoutBarGeometry } from '../utils/viewportMetrics';
import { useAuth } from '../contexts/AuthContext';
import { mangaListService, type ReadingHistoryItem } from '../services/mangaListService';
import {
  useGlobalLayoutMode,
  LayoutModeToggleButton,
  getLayoutGridClasses,
} from '../utils/useViewLayoutMode';
import CinematicHeroBanner from '../components/CinematicHeroBanner';
import {
  DEFAULT_DUAL_HOME_CONFIG,
  normalizeDualHomeConfig,
  type BannerCustomItem,
  type BannerStyle,
  type DualHomeConfig,
  type MangaSliderMode,
} from '../types/platformConfig';

interface MangaHubViewProps {
  onBack?: () => void;
  onMangaClick: (id: string) => void;
  onReadMangaChapter?: (params: {
    manga: any;
    chapter: any;
    chapters: any[];
    initialPage?: number;
  }) => void;
  onOpenSearch?: (params?: { genre?: string; query?: string; origin?: OriginTab }) => void;
  isHomeMode?: boolean;
}

type OriginTab = 'ALL' | 'JP' | 'KR' | 'CN';

const ORIGIN_TABS: { id: OriginTab; label: string; shortLabel: string }[] = [
  { id: 'ALL', label: 'الكل', shortLabel: 'الكل' },
  { id: 'JP', label: 'مانجا يابانية', shortLabel: 'مانجا' },
  { id: 'KR', label: 'مانهوا كورية', shortLabel: 'مانهوا' },
  { id: 'CN', label: 'مانها صينية', shortLabel: 'مانها' },
];

const QUICK_GENRES = [
  'الكل',
  'أكشن',
  'فانتازيا',
  'إيسيكاي',
  'مغامرات',
  'رومانسي',
  'دراما',
  'غموض',
  'كوميدي',
  'خوارق',
];

export default function MangaHubView({
  onBack,
  onMangaClick,
  onReadMangaChapter,
  onOpenSearch,
  isHomeMode = false,
}: MangaHubViewProps) {
  const { user, userData } = useAuth();
  const display = useDeviceDisplay();
  const [layoutMode, cycleLayoutMode] = useGlobalLayoutMode();
  const [origin, setOrigin] = useState<OriginTab>('ALL');
  const [selectedGenre, setSelectedGenre] = useState<string>('الكل');
  const [trending, setTrending] = useState<any[]>([]);
  const [latest, setLatest] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [fetchError, setFetchError] = useState(false);

  // Admin-configurable Manga Banner & Dual Home Settings
  const [bannerCfg, setBannerCfg] = useState<{
    mangaBannerStyle: BannerStyle;
    mangaBannerLimit: number;
    mangaSliderMode: MangaSliderMode;
    customMangaBanner: BannerCustomItem[];
    mangaBannerSpeed: number;
    mangaAnnouncement: string;
    dualHomeConfig: DualHomeConfig;
  }>({
    mangaBannerStyle: 'split',
    mangaBannerLimit: 5,
    mangaSliderMode: 'trending',
    customMangaBanner: [],
    mangaBannerSpeed: 5,
    mangaAnnouncement: '',
    dualHomeConfig: DEFAULT_DUAL_HOME_CONFIG,
  });

  const [dedicatedOriginBannerItems, setDedicatedOriginBannerItems] = useState<any[]>([]);

  const [readingHistory, setReadingHistory] = useState<ReadingHistoryItem[]>(() =>
    mangaListService.getReadingHistory(user?.id, userData?.privacySettings),
  );

  useEffect(() => {
    const syncReading = () => {
      setReadingHistory(mangaListService.getReadingHistory(user?.id, userData?.privacySettings));
    };
    syncReading();
    window.addEventListener('manga-history-updated', syncReading);
    return () => window.removeEventListener('manga-history-updated', syncReading);
  }, [user?.id, userData?.privacySettings]);

  // Listen to real-time Firestore banner & section settings
  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'globalSettings', 'slider'),
      (snap) => {
        if (!snap.exists()) return;
        const d = snap.data() as any;
        setBannerCfg({
          mangaBannerStyle: d.mangaBannerStyle || 'split',
          mangaBannerLimit: Math.min(10, Math.max(1, Number(d.mangaBannerLimit) || 5)),
          mangaSliderMode: d.mangaSliderMode || 'trending',
          customMangaBanner: Array.isArray(d.customMangaBanner) ? d.customMangaBanner : [],
          mangaBannerSpeed: Math.max(2, Number(d.mangaBannerSpeed) || 5),
          mangaAnnouncement: String(d.mangaAnnouncement || ''),
          dualHomeConfig: normalizeDualHomeConfig(d.dualHomeConfig),
        });
      },
      () => {},
    );
    return () => unsub();
  }, []);

  // If admin configured banner source to a dedicated origin (KR/JP/CN), fetch that list independently
  useEffect(() => {
    const mode = bannerCfg.mangaSliderMode;
    if (mode !== 'manhwa_kr' && mode !== 'manga_jp' && mode !== 'manhua_cn') {
      setDedicatedOriginBannerItems([]);
      return;
    }
    const target = mode === 'manhwa_kr' ? 'KR' : mode === 'manga_jp' ? 'JP' : 'CN';
    let cancelled = false;
    void clientCache.fetchWithRevalidate<any[]>(
      `client_manga_trending_origin_${target}`,
      `/api/manga/trending?origin=${target}`,
      (items) => {
        if (!cancelled && Array.isArray(items)) {
          setDedicatedOriginBannerItems(items);
        }
      },
      45 * 60 * 1000,
    );
    return () => {
      cancelled = true;
    };
  }, [bannerCfg.mangaSliderMode]);

  const handleRemoveReadingHistoryItem = (e: React.MouseEvent, mangaId: string) => {
    e.stopPropagation();
    const target = readingHistory.find((h) => String(h.mangaId) === String(mangaId));
    setReadingHistory((prev) => prev.filter((h) => String(h.mangaId) !== String(mangaId)));
    mangaListService.removeReadingHistoryItem(
      user?.id,
      mangaId,
      target?.updatedAt,
      userData?.privacySettings,
    );
  };

  const handleClearReadingHistory = () => {
    const snapshot = readingHistory;
    setReadingHistory([]);
    mangaListService.clearReadingHistory(user?.id, snapshot);
  };

  const loadHub = useCallback(
    async (targetOrigin: OriginTab, forceBypass = false) => {
      const cacheKey = `client_manga_hub_v1_${targetOrigin}`;
      setFetchError(false);

      if (!forceBypass) {
        const cached = clientCache.get<any>(cacheKey);
        if (cached && (cached.trending?.length || cached.latest?.length)) {
          setTrending(cached.trending || []);
          setLatest(cached.latest || []);
          setHasNextPage(Boolean(cached.hasNextPage));
          setPage(1);
          setLoading(false);
          return;
        }
        setLoading(true);
      } else {
        setLoading(latest.length === 0 && trending.length === 0);
      }

      try {
        const data = await cloudCatalogService.getBundleWithCloud<any>({
          bundleId: `manga_hub_${targetOrigin}_p1`,
          kind: 'manga_hub',
          freshTtlMs: 3 * 60 * 60 * 1000,
          staleTtlMs: 24 * 60 * 60 * 1000,
          forceRefresh: forceBypass,
          countItems: (d) => (d?.trending?.length || 0) + (d?.latest?.length || 0),
          fetchLive: async () => {
            const res = await fetch(
              `/api/manga/hub?origin=${targetOrigin}&page=1${forceBypass ? `&_t=${Date.now()}` : ''}`,
            );
            const json = await res.json();
            return json?.success && json?.data ? json.data : null;
          },
          onData: (d) => {
            if (d) {
              setTrending(Array.isArray(d.trending) ? d.trending : []);
              setLatest(Array.isArray(d.latest) ? d.latest : []);
              setHasNextPage(Boolean(d.hasNextPage));
              setPage(1);
              setLoading(false);
              clientCache.set(cacheKey, d, 3 * 60 * 60 * 1000);
            }
          },
        });
        if (!data && trending.length === 0 && latest.length === 0) {
          setFetchError(true);
        }
      } catch {
        if (trending.length === 0 && latest.length === 0) {
          setFetchError(true);
        }
      } finally {
        setLoading(false);
      }
    },
    [latest.length, trending.length],
  );

  useEffect(() => {
    void loadHub(origin, false);
  }, [origin]);

  const handleLoadMore = async () => {
    if (loadingMore || !hasNextPage) return;
    setLoadingMore(true);
    const nextPage = page + 1;
    try {
      const res = await fetch(`/api/manga/latest?origin=${origin}&page=${nextPage}`);
      const json = await res.json();
      if (json?.success && Array.isArray(json.data)) {
        setLatest((prev) => {
          const seen = new Set(prev.map((m) => String(m._id)));
          const extra = json.data.filter((m: any) => !seen.has(String(m._id)));
          return [...prev, ...extra];
        });
        setPage(nextPage);
        setHasNextPage(Boolean(json.pagination?.has_next_page));
      }
    } catch {
      // ignore load more error silently
    } finally {
      setLoadingMore(false);
    }
  };

  // Resolve Manga Banner slides based on admin mode & count
  const bannerItems = useMemo(() => {
    const mode = bannerCfg.mangaSliderMode;
    if (mode === 'custom' && bannerCfg.customMangaBanner.length > 0) {
      return bannerCfg.customMangaBanner;
    }
    if (mode === 'manhwa_kr' || mode === 'manga_jp' || mode === 'manhua_cn') {
      const targetCode = mode === 'manhwa_kr' ? 'KR' : mode === 'manga_jp' ? 'JP' : 'CN';
      if (dedicatedOriginBannerItems.length > 0) {
        return dedicatedOriginBannerItems;
      }
      const matched = trending.filter(
        (m) => String(m.countryOfOrigin || '').toUpperCase() === targetCode,
      );
      if (matched.length > 0) return matched;
    }
    if (mode === 'latest' && latest.length > 0) {
      return latest;
    }
    return trending.length > 0 ? trending : latest;
  }, [bannerCfg, dedicatedOriginBannerItems, trending, latest]);

  const bannerModeLabel = useMemo(() => {
    switch (bannerCfg.mangaSliderMode) {
      case 'custom':
        return 'مختارات الإدارة';
      case 'latest':
        return 'أحدث الإصدارات';
      case 'manhwa_kr':
        return 'نخبة المانهوا الكورية';
      case 'manga_jp':
        return 'روائع المانجا اليابانية';
      case 'manhua_cn':
        return 'أشهر المانها الصينية';
      default:
        return 'الأكثر قراءة';
    }
  }, [bannerCfg.mangaSliderMode]);

  const filteredLatest = useMemo(() => {
    if (selectedGenre === 'الكل') return latest;
    const targetTax = resolveGenreTaxonomyItem(selectedGenre);
    return latest.filter((item) =>
      Array.isArray(item.genres)
        ? item.genres.some((g: string) => {
            const gStr = String(g);
            if (gStr.includes(selectedGenre)) return true;
            if (!targetTax) return false;
            const gTax = resolveGenreTaxonomyItem(gStr);
            return gTax ? gTax.id === targetTax.id : false;
          })
        : false,
    );
  }, [latest, selectedGenre]);

  const isListMode = layoutMode === 'list';
  const mangaSec = bannerCfg.dualHomeConfig.mangaSections;

  return (
    <PullToRefresh onRefresh={() => loadHub(origin, true)}>
      <div
        className={`${isHomeMode ? 'pb-10' : 'min-h-screen pb-24'} bg-black text-white font-sans`}
        dir="rtl"
      >
        {/* Top Bar for standalone Manga Hub navigation */}
        {!isHomeMode && (() => {
          const barGeo = computeCutoutBarGeometry(display);
          const isFlankCenter = !display.isWideOrUnfolded && barGeo.mode === 'flank-center';
          return (
            <header
              style={{
                paddingTop: `${barGeo.headerTopPx}px`,
                paddingBottom: '8px',
                paddingLeft: `${barGeo.paddingLeftPx}px`,
                paddingRight: `${barGeo.paddingRightPx}px`,
              }}
              className="sticky top-0 z-30 bg-black/[0.97] border-b border-white/10 shadow-lg"
            >
              <div
                dir="ltr"
                className="max-w-7xl mx-auto flex items-center justify-between gap-2 min-h-[44px]"
              >
                <div
                  style={isFlankCenter ? { width: `${barGeo.leftZoneWidth}px` } : undefined}
                  className="flex items-center justify-start shrink-0"
                >
                  <LayoutModeToggleButton mode={layoutMode} onToggle={cycleLayoutMode} />
                </div>

                {isFlankCenter && (
                  <div
                    aria-hidden="true"
                    className="shrink-0 pointer-events-none"
                    style={{ width: `${barGeo.cutoutSpacerWidth}px`, height: '1px' }}
                  />
                )}

                <div
                  dir="rtl"
                  style={isFlankCenter ? { width: `${barGeo.rightZoneWidth}px` } : undefined}
                  className="flex items-center justify-start gap-2 min-w-0"
                >
                  {onBack && (
                    <button
                      type="button"
                      onClick={onBack}
                      aria-label="رجوع"
                      className="min-w-[44px] min-h-[44px] rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 flex items-center justify-center text-neutral-200 transition cursor-pointer shrink-0"
                    >
                      <ChevronRight size={20} />
                    </button>
                  )}
                  <div className="min-w-0">
                    <h1 className="font-black text-sm md:text-lg text-white truncate">
                      {isFlankCenter ? 'المانجا' : 'عالم المانجا والمانهوا'}
                    </h1>
                    {!isFlankCenter && (
                      <p className="hidden sm:block text-[11px] text-neutral-400 truncate">
                        أحدث الفصول المترجمة والمانهوا الملونة للقراءة أونلاين أو دون اتصال
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </header>
          );
        })()}

        {/* Admin Manga Announcement Banner */}
        {bannerCfg.mangaAnnouncement && (
          <div className={`px-3.5 md:px-6 ${isHomeMode ? 'pt-[calc(var(--cutout-band-top,calc(var(--safe-top,0px)+3.5rem))+0.35rem)] lg:pt-3' : 'pt-3'} max-w-7xl mx-auto`}>
            <div className="p-3 bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center justify-center gap-2 text-xs font-bold text-amber-200 text-center">
              <Sparkles size={14} className="text-amber-400 shrink-0" />
              <span>{bannerCfg.mangaAnnouncement}</span>
            </div>
          </div>
        )}

        {loading && bannerItems.length === 0 ? (
          <div className="max-w-7xl mx-auto p-4 space-y-6 pt-[calc(var(--cutout-band-top,calc(var(--safe-top,0px)+3.5rem))+0.5rem)] md:pt-4">
            <div className="h-[245px] sm:h-[315px] md:h-[365px] rounded-[24px] sm:rounded-[28px] bg-neutral-900 animate-pulse border border-white/10 w-full" />
            <div className="flex gap-2 overflow-hidden">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-10 w-24 rounded-xl bg-neutral-900 animate-pulse" />
              ))}
            </div>
            <div className="flex gap-3 overflow-hidden">
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  className="w-[140px] md:w-[175px] aspect-[3/4] rounded-2xl bg-neutral-900 animate-pulse shrink-0"
                />
              ))}
            </div>
            <div className={getLayoutGridClasses(layoutMode)}>
              {[...Array(10)].map((_, i) => (
                <div
                  key={i}
                  className={`${isListMode ? 'h-32 rounded-xl' : 'aspect-[3/4]'} bg-neutral-900 animate-pulse border border-white/10`}
                />
              ))}
            </div>
          </div>
        ) : fetchError && trending.length === 0 && latest.length === 0 ? (
          <div className="max-w-7xl mx-auto text-center py-16 m-4 mt-20 lg:mt-6 bg-neutral-900/30 rounded-2xl border border-neutral-800/50 space-y-3">
            <AlertCircle className="mx-auto text-rose-500" size={36} />
            <div className="space-y-1">
              <h3 className="text-sm font-black text-white">تعذر تحميل مكتبة القراءة حالياً</h3>
              <p className="text-xs text-neutral-400">تحقق من اتصالك بالإنترنت ثم أعد المحاولة</p>
            </div>
            <button
              type="button"
              onClick={() => void loadHub(origin, true)}
              className="min-h-[44px] inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-black transition cursor-pointer"
            >
              <RefreshCw size={14} />
              <span>إعادة المحاولة</span>
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* 1. Cinematic Multi-Style Banner (At the Top!) */}
            {bannerItems.length > 0 && (
              <CinematicHeroBanner
                items={bannerItems}
                bannerStyle={bannerCfg.mangaBannerStyle || 'split'}
                accent="manga"
                limit={bannerCfg.mangaBannerLimit || 5}
                speedSeconds={bannerCfg.mangaBannerSpeed || 5}
                modeLabel={bannerModeLabel}
                isHomeMode={isHomeMode && !bannerCfg.mangaAnnouncement}
                onItemClick={(item) => onMangaClick(String(item._id))}
              />
            )}

            {/* 2. Origin Filter Tabs Directly BELOW Cinematic Banner */}
            <section className="px-3.5 md:px-6 max-w-7xl mx-auto">
              <div className="bg-neutral-950/90 border border-white/10 rounded-2xl p-1.5 flex items-center justify-between gap-2 shadow-lg">
                <div className="flex items-center gap-1.5 overflow-x-auto hide-scrollbar flex-1 snap-x snap-proximity">
                  {ORIGIN_TABS.map((tab) => {
                    const active = origin === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => {
                          setOrigin(tab.id);
                          setSelectedGenre('الكل');
                        }}
                        className={`snap-start min-h-[42px] px-4 py-2 rounded-xl text-xs sm:text-[13px] font-black whitespace-nowrap shrink-0 transition-all cursor-pointer ${
                          active
                            ? 'bg-gradient-to-r from-amber-400 to-orange-400 text-black shadow-md shadow-amber-500/20'
                            : 'bg-transparent text-neutral-300 hover:text-white hover:bg-white/5'
                        }`}
                      >
                        {display.isCoverScreen ? tab.shortLabel : tab.label}
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center gap-1.5 shrink-0 pl-0.5">
                  {onOpenSearch && (
                    <button
                      type="button"
                      onClick={() =>
                        onOpenSearch({
                          origin,
                          genre: selectedGenre !== 'الكل' ? selectedGenre : undefined,
                        })
                      }
                      aria-label="بحث في المانجا والمانهوا"
                      title="بحث وتصنيفات المانجا والمانهوا"
                      className="min-w-[40px] min-h-[40px] px-2.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-amber-400 hover:text-amber-300 flex items-center justify-center gap-1.5 text-xs font-black transition cursor-pointer"
                    >
                      <Search size={15} />
                      {!display.isCoverScreen && <span className="hidden sm:inline">بحث</span>}
                    </button>
                  )}
                  {isHomeMode && (
                    <LayoutModeToggleButton mode={layoutMode} onToggle={cycleLayoutMode} />
                  )}
                </div>
              </div>
            </section>

            {/* 3. Continue Reading Strip */}
            <AnimatePresence>
              {mangaSec.continueReading && readingHistory.length > 0 && (
                <motion.section
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  className="px-3.5 md:px-6 max-w-7xl mx-auto"
                >
                  <div className="flex justify-between items-center mb-3">
                    <div className="flex items-center gap-2">
                      <h2 className="text-white font-black text-base md:text-lg border-r-4 border-amber-400 pr-2 flex items-center gap-2">
                        <span>استمر في القراءة</span>
                        <span className="text-[11px] bg-amber-500/15 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full font-mono tabular-nums">
                          {readingHistory.length}
                        </span>
                      </h2>
                    </div>
                    <button
                      type="button"
                      onClick={handleClearReadingHistory}
                      className="min-h-[36px] text-[11px] text-neutral-400 hover:text-red-400 flex items-center gap-1 transition cursor-pointer"
                    >
                      <Trash2 size={13} />
                      <span>مسح السجل</span>
                    </button>
                  </div>

                  <div className="flex gap-3.5 overflow-x-auto pb-2 hide-scrollbar snap-x snap-mandatory">
                    {readingHistory.map((item, idx) => {
                      const pct = item.totalPages
                        ? Math.min(100, Math.max(8, Math.round(((item.pageIndex || 1) / item.totalPages) * 100)))
                        : 40;
                      return (
                        <div
                          key={`reading-hub-${item.mangaId}-${idx}`}
                          onClick={() => {
                            if (onReadMangaChapter && item.chapterId) {
                              onReadMangaChapter({
                                manga: {
                                  _id: item.mangaId,
                                  mangadexId: item.mangadexId,
                                  title: item.title,
                                  posterUrl: item.posterUrl,
                                  mediaFormat: item.mediaFormat,
                                  originLabel: item.originLabel,
                                  defaultReadingMode:
                                    item.mediaFormat === 'manhwa' || item.mediaFormat === 'manhua'
                                      ? 'webtoon'
                                      : 'paged',
                                },
                                chapter: {
                                  id: item.chapterId,
                                  num: item.chapterNum,
                                  chapterNumber: Number(item.chapterNum || 1),
                                  title: item.chapterTitle || `الفصل ${item.chapterNum}`,
                                },
                                chapters: [],
                                initialPage: item.pageIndex || 1,
                              });
                            } else {
                              onMangaClick(item.mangaId);
                            }
                          }}
                          className={`snap-start theme-keep-dark cursor-pointer ${
                            display.isCoverScreen ? 'w-[162px]' : 'w-[185px] sm:w-[215px] md:w-[240px] lg:w-[260px]'
                          } flex-shrink-0 group relative rounded-2xl overflow-hidden border border-neutral-800 hover:border-amber-400/70 transition-transform duration-200 hover:-translate-y-1 active:scale-[0.98] aspect-[16/9] bg-neutral-900 shadow-lg`}
                        >
                          {item.posterUrl ? (
                            <img
                              src={item.posterUrl}
                              referrerPolicy="no-referrer"
                              loading="lazy"
                              decoding="async"
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              alt={item.title}
                            />
                          ) : (
                            <div className="w-full h-full bg-neutral-900 flex items-center justify-center text-neutral-600">
                              <BookOpen size={22} />
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={(e) => handleRemoveReadingHistoryItem(e, item.mangaId)}
                            onPointerDown={(e) => e.stopPropagation()}
                            title="إزالة من استمر في القراءة"
                            aria-label="إزالة من استمر في القراءة"
                            className="absolute top-2 left-2 z-20 w-7 h-7 rounded-full bg-black/80 hover:bg-red-600 text-neutral-200 hover:text-white border border-white/20 flex items-center justify-center opacity-90 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity cursor-pointer"
                          >
                            <X size={13} strokeWidth={2.5} />
                          </button>

                          <span className="absolute top-2 right-2 z-10 pointer-events-none bg-amber-500 text-black px-2 py-0.5 rounded-lg text-[10px] font-black shadow flex items-center gap-1 tabular-nums">
                            <BookOpen size={10} />
                            الفصل {item.chapterNum || 1}
                          </span>

                          <div
                            className="absolute bottom-1 inset-x-0 pt-5 pb-1.5 px-2.5 bg-gradient-to-t from-black/85 via-black/45 to-transparent flex items-center justify-between gap-2"
                            style={{ textShadow: '0 2px 6px rgba(0,0,0,0.98), 0 0 3px rgba(0,0,0,0.95)' }}
                          >
                            <h3 className="font-bold text-xs md:text-sm text-white group-hover:text-amber-300 transition-colors truncate flex-1">
                              <LongPressCopy text={item.title}>{item.title}</LongPressCopy>
                            </h3>
                            <span className="text-[10px] text-neutral-200 font-mono flex items-center gap-1 tabular-nums shrink-0">
                              <Clock size={10} />
                              {item.pageIndex}/{item.totalPages || '?'}
                            </span>
                          </div>

                          <div className="absolute bottom-0 inset-x-0 h-1 bg-white/20 overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-amber-400 to-orange-500"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </motion.section>
              )}
            </AnimatePresence>

            {/* 4. Trending Strip with Rank Badges */}
            {mangaSec.trending && trending.length > 0 && (
              <section className="px-3.5 md:px-6 max-w-7xl mx-auto space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-white font-black text-base md:text-lg border-r-4 border-orange-500 pr-2 flex items-center gap-2">
                    <span>الأكثر رواجاً الآن</span>
                    <Flame size={17} className="text-orange-500" />
                  </h2>
                </div>

                <div className="flex gap-3.5 overflow-x-auto pb-2 hide-scrollbar snap-x snap-mandatory">
                  {trending.map((item, idx) => {
                    const rank = idx + 1;
                    return (
                      <button
                        key={`trend-${item._id}-${idx}`}
                        type="button"
                        onClick={() => onMangaClick(String(item._id))}
                        className={`snap-start theme-keep-dark ${
                          display.isCoverScreen ? 'w-[122px]' : 'w-[144px] sm:w-[168px] md:w-[186px] lg:w-[202px] xl:w-[218px]'
                        } shrink-0 text-right group cursor-pointer relative aspect-[3/4] rounded-2xl overflow-hidden bg-neutral-900 border border-white/10 hover:border-amber-400/60 transition-transform duration-200 hover:-translate-y-1 active:scale-[0.98] shadow-lg`}
                      >
                        {item.posterUrl ? (
                          <img
                            src={item.posterUrl}
                            alt={item.title}
                            loading="lazy"
                            decoding="async"
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-neutral-900 to-neutral-800 flex items-center justify-center text-neutral-600">
                            <BookOpen size={26} />
                          </div>
                        )}

                        {/* Rank Pill */}
                        <span
                          className={`absolute top-2 right-2 px-2 py-0.5 rounded-lg text-[11px] font-black shadow-lg tabular-nums ${
                            rank === 1
                              ? 'bg-amber-400 text-black'
                              : rank === 2
                              ? 'bg-slate-200 text-black'
                              : rank === 3
                              ? 'bg-orange-600 text-white'
                              : 'bg-black/85 text-amber-300 border border-white/15'
                          }`}
                        >
                          #{rank}
                        </span>

                        {item.rating > 0 && (
                          <span className="absolute top-2 left-2 bg-black/85 text-yellow-400 px-2 py-0.5 rounded-lg text-[10px] font-bold flex items-center gap-0.5 border border-white/15 tabular-nums">
                            <Star size={10} fill="currentColor" />
                            {Number(item.rating).toFixed(1)}
                          </span>
                        )}

                        <div
                          className="absolute inset-x-0 bottom-0 pt-5 pb-2 px-2 bg-gradient-to-t from-black/85 via-black/45 to-transparent text-center"
                          style={{ textShadow: '0 2px 6px rgba(0,0,0,0.98), 0 0 3px rgba(0,0,0,0.95)' }}
                        >
                          <span className="text-[10px] text-amber-300 font-bold block">
                            {item.originLabel || 'مانجا'}
                          </span>
                          <h3 className="text-xs sm:text-sm font-black text-white group-hover:text-amber-300 transition-colors line-clamp-1 truncate">
                            <LongPressCopy text={item.title}>{item.title}</LongPressCopy>
                          </h3>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {/* 5. Latest & Popular Catalog with Quick Genre Filter */}
            {mangaSec.latestCatalog && (
              <section className="space-y-3.5 max-w-7xl mx-auto">
                <div className="px-3.5 md:px-6 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h2 className="text-white font-black text-base md:text-lg border-r-4 border-emerald-400 pr-2 flex items-center gap-2">
                      <Layers size={17} className="text-emerald-400" />
                      <span>أحدث التحديثات والإصدارات</span>
                    </h2>
                    <span className="text-xs text-neutral-400 font-bold tabular-nums">
                      {filteredLatest.length} عمل
                    </span>
                  </div>

                  {/* Quick Genre Filter Chips */}
                  <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar pb-0.5 snap-x snap-proximity">
                    {QUICK_GENRES.map((genre) => {
                      const active = selectedGenre === genre;
                      return (
                        <button
                          key={genre}
                          type="button"
                          onClick={() => setSelectedGenre(genre)}
                          className={`snap-start min-h-[34px] px-3 py-1 rounded-full text-[11px] font-bold whitespace-nowrap transition cursor-pointer border ${
                            active
                              ? 'bg-white text-black border-white'
                              : 'bg-neutral-900/75 border-neutral-800 text-neutral-400 hover:text-white'
                          }`}
                        >
                          {genre}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {filteredLatest.length === 0 ? (
                  <div className="mx-3.5 md:mx-6 p-8 rounded-2xl bg-neutral-900/40 border border-neutral-800/80 text-center space-y-3">
                    <p className="text-xs font-bold text-neutral-300">
                      لا توجد أعمال مطابقة لتصنيف «{selectedGenre}» في الصفحة الحالية
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      {onOpenSearch && selectedGenre !== 'الكل' && (
                        <button
                          type="button"
                          onClick={() => onOpenSearch({ origin, genre: selectedGenre })}
                          className="min-h-[40px] px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-black flex items-center gap-1.5 cursor-pointer transition"
                        >
                          <Search size={14} />
                          <span>بحث شامل عن تصنيف «{selectedGenre}»</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setSelectedGenre('الكل')}
                        className="min-h-[40px] px-4 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-black cursor-pointer transition"
                      >
                        عرض الكل
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className={isListMode ? 'px-3 md:px-6' : 'px-0 md:px-6'}>
                    <div className={getLayoutGridClasses(layoutMode, display.isCoverScreen)}>
                      {filteredLatest.map((item, idx) => {
                        if (isListMode) {
                          return (
                            <button
                              key={`latest-list-${item._id}-${idx}`}
                              type="button"
                              onClick={() => onMangaClick(String(item._id))}
                              className="w-full cursor-pointer group flex items-stretch bg-neutral-900/95 border border-neutral-800/90 hover:border-amber-500/60 rounded-xl transition-colors overflow-hidden text-right min-h-[124px]"
                            >
                              <div className="w-24 sm:w-28 shrink-0 bg-neutral-950 border-l border-white/10 overflow-hidden flex items-center justify-center">
                                {item.posterUrl ? (
                                  <img
                                    src={item.posterUrl}
                                    alt={item.title}
                                    loading="lazy"
                                    decoding="async"
                                    referrerPolicy="no-referrer"
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                  />
                                ) : (
                                  <BookOpen size={22} className="text-neutral-600" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0 flex flex-col justify-center gap-1.5 p-3">
                                <h3 className="font-black text-sm sm:text-base text-white group-hover:text-amber-400 transition-colors line-clamp-1">
                                  <LongPressCopy text={item.title}>{item.title}</LongPressCopy>
                                </h3>
                                <div className="text-xs text-neutral-400 font-bold flex flex-wrap items-center gap-1.5 tabular-nums">
                                  <span className="text-amber-300">{item.originLabel || 'مانجا'}</span>
                                  {item.rating > 0 && (
                                    <>
                                      <span aria-hidden="true">·</span>
                                      <span className="text-yellow-400 inline-flex items-center gap-0.5">
                                        <Star size={11} fill="currentColor" />
                                        {Number(item.rating).toFixed(1)}
                                      </span>
                                    </>
                                  )}
                                  {item.status && (
                                    <>
                                      <span aria-hidden="true">·</span>
                                      <span>{item.status}</span>
                                    </>
                                  )}
                                  {item.chaptersCount ? (
                                    <>
                                      <span aria-hidden="true">·</span>
                                      <span>{item.chaptersCount} فصل</span>
                                    </>
                                  ) : null}
                                </div>
                                {Array.isArray(item.genres) && item.genres.length > 0 && (
                                  <p className="text-[11px] text-neutral-400 truncate">
                                    {item.genres.slice(0, 3).map((g: string) => translateGenreToArabic(g)).join(' · ')}
                                  </p>
                                )}
                              </div>
                            </button>
                          );
                        }

                        return (
                          <button
                            key={`latest-grid-${item._id}-${idx}`}
                            type="button"
                            onClick={() => onMangaClick(String(item._id))}
                            className="theme-keep-dark cursor-pointer group relative aspect-[3/4] w-full bg-neutral-950 border-b border-l border-white/10 text-right overflow-hidden"
                          >
                            {item.posterUrl ? (
                              <img
                                src={item.posterUrl}
                                alt={item.title}
                                loading="lazy"
                                decoding="async"
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              />
                            ) : (
                              <div className="w-full h-full bg-gradient-to-br from-neutral-900 to-neutral-800 flex items-center justify-center text-neutral-600">
                                <BookOpen size={24} />
                              </div>
                            )}

                            <div
                              className="absolute inset-x-0 bottom-0 pt-6 pb-2 px-2 bg-gradient-to-t from-black/85 via-black/45 to-transparent flex flex-col justify-end gap-0.5 text-center"
                              style={{ textShadow: '0 2px 6px rgba(0,0,0,0.98), 0 0 3px rgba(0,0,0,0.95)' }}
                            >
                              <div className="text-[10px] font-bold text-neutral-200 flex items-center justify-center gap-1 tabular-nums">
                                <span className="text-amber-300">{item.originLabel || 'مانجا'}</span>
                                {item.rating > 0 && (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <span className="text-yellow-400 inline-flex items-center gap-0.5">
                                      <Star size={9} fill="currentColor" />
                                      {Number(item.rating).toFixed(1)}
                                    </span>
                                  </>
                                )}
                              </div>
                              <h3 className="font-black text-xs text-white group-hover:text-amber-300 transition-colors line-clamp-2 text-center leading-tight">
                                <LongPressCopy text={item.title}>{item.title}</LongPressCopy>
                              </h3>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {hasNextPage && (
                  <div className="flex justify-center pt-4 pb-2">
                    <button
                      type="button"
                      onClick={handleLoadMore}
                      disabled={loadingMore}
                      className="min-h-[44px] px-6 py-2.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-xs font-black text-white flex items-center gap-2 transition cursor-pointer"
                    >
                      {loadingMore ? (
                        <>
                          <Loader2 size={15} className="animate-spin" />
                          <span>جاري التحميل...</span>
                        </>
                      ) : (
                        <span>عرض المزيد</span>
                      )}
                    </button>
                  </div>
                )}
              </section>
            )}
          </div>
        )}
      </div>
    </PullToRefresh>
  );
}
