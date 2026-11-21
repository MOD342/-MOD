import React, { useEffect, useState, useCallback } from 'react';
import { motion } from 'motion/react';
import {
  ChevronRight,
  Star,
  Flame,
  BookOpen,
  Loader2,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { clientCache } from '../utils/clientCache';
import { cloudCatalogService } from '../services/cloudCatalogService';
import PullToRefresh from '../components/PullToRefresh';
import { useDeviceDisplay } from '../hooks/useDeviceDisplay';
import {
  useGlobalLayoutMode,
  LayoutModeToggleButton,
  getLayoutGridClasses,
} from '../utils/useViewLayoutMode';

interface MangaHubViewProps {
  onBack?: () => void;
  onMangaClick: (id: string) => void;
}

type OriginTab = 'ALL' | 'JP' | 'KR' | 'CN';

const ORIGIN_TABS: { id: OriginTab; label: string }[] = [
  { id: 'ALL', label: 'الكل' },
  { id: 'JP', label: 'مانجا يابانية' },
  { id: 'KR', label: 'مانهوا كورية' },
  { id: 'CN', label: 'مانها صينية' },
];

export default function MangaHubView({ onBack, onMangaClick }: MangaHubViewProps) {
  const display = useDeviceDisplay();
  const [layoutMode, cycleLayoutMode] = useGlobalLayoutMode();
  const [origin, setOrigin] = useState<OriginTab>('ALL');
  const [trending, setTrending] = useState<any[]>([]);
  const [latest, setLatest] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [fetchError, setFetchError] = useState(false);

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
        } else {
          setLoading(true);
        }
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

  const isListMode = layoutMode === 'list';

  return (
    <PullToRefresh onRefresh={() => loadHub(origin, true)}>
      <div className="min-h-screen bg-black text-white pb-24 font-sans" dir="rtl">
        <div className="max-w-7xl mx-auto">
          {/* Header & Origin Switcher */}
          <div className="bg-black border-b border-white/5 px-3.5 md:px-6 py-3.5 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
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
                  <h1 className="font-black text-base md:text-lg text-white truncate">
                    عالم المانجا والمانهوا
                  </h1>
                  <p className="text-[11px] text-neutral-400 truncate">
                    اكتشف أحدث الأعمال المترجمة والمشهورة للقراءة أونلاين أو دون اتصال
                  </p>
                </div>
              </div>

              <LayoutModeToggleButton mode={layoutMode} onToggle={cycleLayoutMode} />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto hide-scrollbar pb-0.5">
              {ORIGIN_TABS.map((tab) => {
                const active = origin === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setOrigin(tab.id)}
                    className={`min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-black whitespace-nowrap shrink-0 transition cursor-pointer ${
                      active
                        ? 'bg-[#FF1744] text-white shadow'
                        : 'bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          {loading ? (
            <div className="p-4 space-y-6">
              <div className="flex gap-3 overflow-hidden">
                {[...Array(5)].map((_, i) => (
                  <div
                    key={i}
                    className="w-[140px] md:w-[175px] aspect-[3/4] rounded-2xl bg-neutral-900 animate-pulse shrink-0"
                  />
                ))}
              </div>
              <div className={getLayoutGridClasses(layoutMode)}>
                {[...Array(12)].map((_, i) => (
                  <div
                    key={i}
                    className={`${isListMode ? 'h-32 rounded-xl' : 'aspect-[3/4]'} bg-neutral-900 animate-pulse border border-white/10`}
                  />
                ))}
              </div>
            </div>
          ) : fetchError && trending.length === 0 && latest.length === 0 ? (
            <div className="text-center py-16 m-4 bg-neutral-900/30 rounded-2xl border border-neutral-800/50 space-y-3">
              <AlertCircle className="mx-auto text-rose-500" size={36} />
              <div className="space-y-1">
                <h3 className="text-sm font-black text-white">تعذر تحميل مكتبة القراءة حالياً</h3>
                <p className="text-xs text-neutral-400">تحقق من اتصالك بالإنترنت ثم أعد المحاولة</p>
              </div>
              <button
                type="button"
                onClick={() => void loadHub(origin, true)}
                className="min-h-[44px] inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-[#FF1744] hover:bg-red-600 text-white text-xs font-black transition cursor-pointer"
              >
                <RefreshCw size={14} />
                <span>إعادة المحاولة</span>
              </button>
            </div>
          ) : (
            <div className="space-y-6 pt-4">
              {/* Trending Strip */}
              {trending.length > 0 && (
                <section className="px-3.5 md:px-6 space-y-3">
                  <div className="flex items-center gap-2">
                    <Flame size={17} className="text-orange-500" />
                    <h2 className="text-white font-black text-base md:text-lg">الأكثر رواجاً الآن</h2>
                  </div>

                  <div className="flex gap-3.5 overflow-x-auto pb-2 hide-scrollbar">
                    {trending.map((item, idx) => (
                      <motion.button
                        key={`trend-${item._id}-${idx}`}
                        type="button"
                        onClick={() => onMangaClick(String(item._id))}
                        whileHover={{ y: -4 }}
                        whileTap={{ scale: 0.98 }}
                        className={`theme-keep-dark ${
                          display.isCoverScreen ? 'w-[122px]' : 'w-[138px] md:w-[175px] lg:w-[195px]'
                        } shrink-0 text-right group cursor-pointer`}
                      >
                        <div className="relative aspect-[3/4] rounded-2xl overflow-hidden bg-neutral-900 border border-white/10">
                          {item.posterUrl ? (
                            <img
                              src={item.posterUrl}
                              alt={item.title}
                              loading="lazy"
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                            />
                          ) : (
                            <div className="w-full h-full bg-gradient-to-br from-neutral-900 to-neutral-800 flex items-center justify-center text-neutral-600">
                              <BookOpen size={26} />
                            </div>
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/35 to-transparent flex flex-col justify-end p-2.5">
                            <div className="flex items-center gap-1 text-[10px] text-neutral-300 font-bold mb-0.5 tabular-nums">
                              <span className="text-amber-400">#{idx + 1}</span>
                              <span aria-hidden="true">·</span>
                              <span>{item.originLabel}</span>
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
                            <h3 className="text-xs sm:text-sm font-black text-white line-clamp-2 leading-tight">
                              {item.title}
                            </h3>
                          </div>
                        </div>
                      </motion.button>
                    ))}
                  </div>
                </section>
              )}

              {/* Latest & Popular Catalog */}
              <section className="space-y-3">
                <div className="px-3.5 md:px-6 flex items-center justify-between">
                  <h2 className="text-white font-black text-base md:text-lg">
                    أحدث التحديثات والإصدارات
                  </h2>
                  <span className="text-xs text-neutral-400 font-bold tabular-nums">
                    {latest.length} عمل
                  </span>
                </div>

                <div className={isListMode ? 'px-3 md:px-6' : 'px-0 md:px-6'}>
                  <div className={getLayoutGridClasses(layoutMode)}>
                    {latest.map((item, idx) => {
                      if (isListMode) {
                        return (
                          <button
                            key={`latest-list-${item._id}-${idx}`}
                            type="button"
                            onClick={() => onMangaClick(String(item._id))}
                            className="w-full cursor-pointer group flex items-stretch bg-neutral-900/95 border border-neutral-800/90 hover:border-[#FF1744]/50 rounded-xl transition-all overflow-hidden text-right min-h-[124px]"
                          >
                            <div className="w-24 sm:w-28 shrink-0 bg-neutral-950 border-l border-white/10 overflow-hidden flex items-center justify-center">
                              {item.posterUrl ? (
                                <img
                                  src={item.posterUrl}
                                  alt={item.title}
                                  loading="lazy"
                                  referrerPolicy="no-referrer"
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                />
                              ) : (
                                <BookOpen size={22} className="text-neutral-600" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0 flex flex-col justify-center gap-1.5 p-3">
                              <h3 className="font-black text-sm sm:text-base text-white group-hover:text-[#FF1744] transition-colors line-clamp-1">
                                {item.title}
                              </h3>
                              <div className="text-xs text-neutral-400 font-bold flex flex-wrap items-center gap-1.5 tabular-nums">
                                <span>{item.originLabel || 'مانجا'}</span>
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
                                  {item.genres.slice(0, 3).join(' · ')}
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
                          className="theme-keep-dark cursor-pointer group relative aspect-[3/4] overflow-hidden bg-neutral-950 border-b border-l border-white/10 text-right"
                        >
                          {item.posterUrl ? (
                            <img
                              src={item.posterUrl}
                              alt={item.title}
                              loading="lazy"
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                            />
                          ) : (
                            <div className="w-full h-full bg-gradient-to-br from-neutral-900 to-neutral-800 flex items-center justify-center text-neutral-600">
                              <BookOpen size={24} />
                            </div>
                          )}

                          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/65 to-transparent pt-10 pb-2.5 px-2.5 flex flex-col justify-end gap-0.5">
                            <div className="text-[10px] font-bold text-neutral-300 flex items-center justify-center gap-1 tabular-nums">
                              <span>{item.originLabel || 'مانجا'}</span>
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
                            <h3 className="font-black text-xs text-white group-hover:text-[#FF1744] transition-colors line-clamp-2 text-center leading-tight">
                              {item.title}
                            </h3>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

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
            </div>
          )}
        </div>
      </div>
    </PullToRefresh>
  );
}
