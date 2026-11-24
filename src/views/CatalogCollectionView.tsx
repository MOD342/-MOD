import React, { useEffect, useState } from 'react';
import { ChevronRight, ChevronLeft, RefreshCw, Play, Star, Tv, Film, Crown, AlertCircle } from 'lucide-react';
import { clientCache } from '../utils/clientCache';
import { cloudCatalogService } from '../services/cloudCatalogService';
import { cleanAnimeTitle } from '../utils/animeTitleCleaner';
import PullToRefresh from '../components/PullToRefresh';
import { LongPressCopy } from '../components/LongPressCopy';
import { FALLBACK_POSTER_DATA_URL } from '../utils/posterFallback';
import {
  useGlobalLayoutMode,
  LayoutModeToggleButton,
  getLayoutGridClasses,
  getShortTypeCode,
} from '../utils/useViewLayoutMode';

interface CatalogCollectionViewProps {
  mode: 'movies' | 'top';
  onBack: () => void;
  onAnimeClick: (id: string) => void;
}

export default function CatalogCollectionView({ mode, onBack, onAnimeClick }: CatalogCollectionViewProps) {
  const isMovies = mode === 'movies';
  const pageTitle = isMovies ? 'أفلام الأنمي' : 'أفضل الأنميات';
  const endpointBase = isMovies ? '/api/anime/movies' : '/api/anime/top';

  const [page, setPage] = useState<number>(1);
  const [hasNext, setHasNext] = useState<boolean>(true);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const [layoutMode, cycleLayoutMode] = useGlobalLayoutMode();

  const loadItems = async (targetPage = 1, forceBypass = false) => {
    const safePage = Math.max(1, targetPage);
    setFetchError(false);
    if (forceBypass) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    const cacheKey = `client_catalog_collection_v1_${mode}_p_${safePage}`;
    if (!forceBypass) {
      const cached = clientCache.get<{ items: any[]; hasNext: boolean }>(cacheKey);
      if (cached && Array.isArray(cached.items) && cached.items.length > 0) {
        setItems(cached.items);
        setHasNext(Boolean(cached.hasNext));
        setLoading(false);
        setRefreshing(false);
        return;
      }
    }

    try {
      const bundleKind = isMovies ? 'movies' : 'top';
      const resolved = await cloudCatalogService.getBundleWithCloud<{ items: any[]; hasNext: boolean }>({
        bundleId: `${mode}_p_${safePage}`,
        kind: bundleKind,
        freshTtlMs: isMovies ? 24 * 60 * 60 * 1000 : 12 * 60 * 60 * 1000,
        staleTtlMs: 7 * 24 * 60 * 60 * 1000,
        forceRefresh: forceBypass,
        countItems: (d) => (Array.isArray(d?.items) ? d.items.length : 0),
        fetchLive: async () => {
          const ts = Date.now();
          const queryParams = new URLSearchParams({ page: String(safePage) });
          if (forceBypass) {
            queryParams.set('bypass', 'true');
            queryParams.set('_t', String(ts));
          }
          const r = await fetch(`${endpointBase}?${queryParams.toString()}`, {
            cache: forceBypass ? 'no-store' : 'default',
          });
          if (!r.ok) return null;
          const json = await r.json();
          if (json.success && Array.isArray(json.data) && json.data.length > 0) {
            const formatted = json.data.map((item: any, idx: number) => {
              const cleanTitle = cleanAnimeTitle(item.title || '') || item.title || 'Anime';
              const targetId = item._id || item.slug || item.id || `search-${cleanTitle}`;
              const posterImg = item.posterUrl || item.imageUrl || '';
              return {
                _id: String(targetId),
                slug: item.slug || item.id,
                title: cleanTitle,
                posterUrl: posterImg,
                type: item.type || (isMovies ? 'فيلم' : 'مسلسل'),
                episodesCount: item.episodesCount,
                rating: item.rating || null,
                genres: Array.isArray(item.genres) ? item.genres : [],
                description: item.description ? String(item.description).slice(0, 260) : '',
                rank: (safePage - 1) * 30 + idx + 1,
              };
            });
            const nextFlag = typeof json.hasNext === 'boolean' ? json.hasNext : formatted.length >= 20;
            return { items: formatted, hasNext: nextFlag };
          }
          return null;
        },
        onData: (bundleData) => {
          if (bundleData?.items?.length) {
            setItems(bundleData.items);
            setHasNext(Boolean(bundleData.hasNext));
            clientCache.set(cacheKey, bundleData, 60 * 60 * 1000);
            setLoading(false);
          }
        },
      });

      if (!resolved && items.length === 0) {
        setFetchError(true);
      }
    } catch {
      if (items.length === 0) {
        setFetchError(true);
      }
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    loadItems(page, false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [page, mode]);

  const handleNextPage = () => {
    if (loading || refreshing || !hasNext) return;
    setPage((prev) => prev + 1);
  };

  const handlePrevPage = () => {
    if (loading || refreshing || page <= 1) return;
    setPage((prev) => Math.max(1, prev - 1));
  };

  const isListMode = layoutMode === 'list';
  const isLargeGrid = layoutMode === 'grid2';

  return (
    <PullToRefresh onRefresh={() => loadItems(page, true)}>
      <div className="min-h-screen bg-black text-white pb-24" dir="rtl">
        <div className="bg-black border-b border-white/5 px-4 py-3 flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-2.5">
            <button
              onClick={onBack}
              className="p-2 bg-neutral-900 rounded-xl hover:bg-neutral-800 transition text-neutral-300 hover:text-white cursor-pointer"
              aria-label="الرجوع"
            >
              <ChevronRight size={18} />
            </button>
            <div className="flex items-center gap-2">
              {isMovies ? (
                <Film size={18} className="text-rose-400" />
              ) : (
                <Crown size={18} className="text-amber-400" />
              )}
              <h1 className="font-black text-base md:text-lg text-white">
                {pageTitle}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <LayoutModeToggleButton mode={layoutMode} onToggle={cycleLayoutMode} />
          </div>
        </div>

        <div className={`${isListMode ? 'p-2 md:p-4' : 'p-0 md:p-4'} max-w-7xl mx-auto`}>
          <div className={getLayoutGridClasses(layoutMode)}>
            {loading ? (
              [...Array(18)].map((_, i) => (
                <div
                  key={i}
                  className={`${
                    isListMode ? 'h-32 rounded-xl' : 'aspect-[3/4]'
                  } bg-neutral-900 animate-pulse border border-white/10`}
                />
              ))
            ) : (
              items.map((anime: any, idx: number) => {
                const shortType = getShortTypeCode(anime.type || (isMovies ? 'MOVIE' : 'TV'));
                const ratingVal =
                  anime.rating && anime.rating !== 'N/A' && Number(anime.rating) > 0
                    ? Number(anime.rating).toFixed(1)
                    : null;
                const badgeText = isMovies
                  ? 'فيلم'
                  : anime.episodesCount
                  ? `${anime.episodesCount} حلقة`
                  : `#${anime.rank}`;

                if (isListMode) {
                  return (
                    <div
                      key={`${mode}-p${page}-${anime._id}-${idx}`}
                      onClick={() => onAnimeClick(String(anime._id))}
                      onMouseEnter={() => clientCache.prefetchDetails(anime._id)}
                      className="cursor-pointer group flex items-stretch bg-neutral-900/95 border border-neutral-800/90 hover:border-amber-500/60 rounded-xl transition-all overflow-hidden shadow-md min-h-[124px] sm:min-h-[132px]"
                    >
                      <div className="w-24 sm:w-28 shrink-0 bg-neutral-950 border-l border-white/10 relative overflow-hidden">
                        <img
                          src={anime.posterUrl || FALLBACK_POSTER_DATA_URL}
                          referrerPolicy="no-referrer"
                          loading="lazy"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          alt={anime.title}
                        />
                        {!isMovies && (
                          <span className="absolute top-1.5 right-1.5 bg-amber-500 text-black px-1.5 py-0.5 rounded text-[9px] font-black shadow" dir="ltr">
                            #{anime.rank}
                          </span>
                        )}
                      </div>

                      <div className="flex-1 min-w-0 flex flex-col justify-center items-start text-right gap-1.5 p-2.5 sm:p-3">
                        <h5
                          className="w-full font-black text-sm sm:text-base text-white group-hover:text-amber-400 transition-colors line-clamp-1 leading-snug text-right"
                          dir="auto"
                        >
                          <LongPressCopy text={anime.title}>{anime.title}</LongPressCopy>
                        </h5>

                        <div className="flex flex-wrap items-center justify-start gap-1.5 text-[10px] sm:text-xs font-bold">
                          <span className={`px-2 py-0.5 rounded-lg font-black border ${
                            isMovies
                              ? 'bg-rose-600/20 border-rose-500/30 text-rose-300'
                              : 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                          }`}>
                            {badgeText}
                          </span>
                          <span className="bg-neutral-800 text-neutral-200 px-2 py-0.5 rounded-lg flex items-center gap-1" dir="ltr">
                            <Tv size={10} className="text-neutral-400" />
                            <span>{shortType}</span>
                          </span>
                          {ratingVal && (
                            <span className="bg-yellow-500/15 border border-yellow-500/30 text-yellow-400 px-2 py-0.5 rounded-lg flex items-center gap-1" dir="ltr">
                              <Star size={10} fill="currentColor" />
                              <span>{ratingVal}</span>
                            </span>
                          )}
                        </div>

                        {anime.genres?.length > 0 && (
                          <div className="flex flex-wrap items-center justify-start gap-1 text-[10px] text-neutral-400 font-bold">
                            {anime.genres.slice(0, 3).map((g: string, gIdx: number) => (
                              <span key={gIdx} className="bg-neutral-950/90 border border-white/10 text-neutral-300 px-2 py-0.5 rounded-md">
                                {g}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="w-9 h-9 self-center rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 group-hover:bg-amber-500 group-hover:text-black flex items-center justify-center shrink-0 transition-colors ml-2.5">
                        <Play size={15} fill="currentColor" />
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={`${mode}-p${page}-${anime._id}-${idx}`}
                    onClick={() => onAnimeClick(String(anime._id))}
                    onMouseEnter={() => clientCache.prefetchDetails(anime._id)}
                    className="theme-keep-dark cursor-pointer group relative aspect-[3/4] overflow-hidden bg-neutral-950 border-b border-l border-white/10"
                  >
                    <img
                      src={anime.posterUrl || FALLBACK_POSTER_DATA_URL}
                      referrerPolicy="no-referrer"
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      alt={anime.title}
                    />

                    <div className="absolute top-1.5 inset-x-1.5 z-10 flex items-center justify-between gap-1 pointer-events-none" dir="ltr">
                      <div className="flex items-center gap-1">
                        <span className="bg-black/80 backdrop-blur-md text-white px-1.5 py-0.5 rounded text-[9px] sm:text-[10px] font-black border border-white/15 uppercase tracking-tight">
                          {shortType}
                        </span>
                        {ratingVal && (
                          <span className="bg-black/80 backdrop-blur-md text-yellow-400 px-1.5 py-0.5 rounded flex items-center gap-0.5 text-[9px] sm:text-[10px] font-black border border-white/15">
                            <Star size={8} fill="currentColor" />
                            <span>{ratingVal}</span>
                          </span>
                        )}
                      </div>

                      <span className={`${isMovies ? 'bg-rose-600/95 text-white' : 'bg-amber-500/95 text-black'} backdrop-blur-md px-1.5 py-0.5 rounded text-[9px] sm:text-[10px] font-black shadow`}>
                        {isMovies ? 'MOVIE' : `#${anime.rank}`}
                      </span>
                    </div>

                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/70 to-transparent pt-8 pb-2 px-2 pointer-events-none flex flex-col justify-end">
                      <h5
                        className={`pointer-events-auto font-black ${
                          isLargeGrid ? 'text-xs sm:text-sm' : 'text-[10px] sm:text-xs'
                        } text-white group-hover:text-amber-400 transition-colors line-clamp-2 text-center leading-tight drop-shadow`}
                        dir="ltr"
                      >
                        <LongPressCopy text={anime.title}>{anime.title}</LongPressCopy>
                      </h5>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {!loading && items.length === 0 && (
            <div className="text-center py-16 m-4 bg-neutral-900/20 rounded-2xl border border-neutral-800/40 space-y-3">
              <AlertCircle className={`mx-auto ${fetchError ? 'text-rose-500' : 'text-neutral-500'}`} size={36} />
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-neutral-300">
                  {fetchError ? `تعذر تحميل ${pageTitle}` : 'لا توجد عناصر متوفرة في هذه الصفحة'}
                </h3>
                {fetchError && (
                  <p className="text-xs text-neutral-500">تحقق من اتصالك بالإنترنت ثم أعد المحاولة</p>
                )}
              </div>
              {fetchError && (
                <button
                  onClick={() => loadItems(page, true)}
                  disabled={refreshing}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-black transition active:scale-95 cursor-pointer"
                >
                  <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
                  <span>إعادة المحاولة</span>
                </button>
              )}
            </div>
          )}
        </div>

        <div className="max-w-7xl mx-auto px-4 pt-5 pb-8 flex items-center justify-center gap-3">
          {page > 1 && (
            <button
              onClick={handlePrevPage}
              disabled={loading || refreshing}
              className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-xs font-black text-white transition active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              <ChevronRight size={16} />
              <span>السابق</span>
            </button>
          )}

          <div className="px-3.5 py-1.5 rounded-xl bg-neutral-950 border border-white/10 text-xs font-bold text-neutral-400">
            <span className="text-white font-black">{page}</span>
          </div>

          {hasNext && (
            <button
              onClick={handleNextPage}
              disabled={loading || refreshing}
              className="flex items-center gap-1.5 px-6 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-xs font-black text-black transition active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              <span>التالي</span>
              <ChevronLeft size={16} />
            </button>
          )}
        </div>
      </div>
    </PullToRefresh>
  );
}
