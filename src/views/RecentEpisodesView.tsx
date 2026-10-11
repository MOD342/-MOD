import React, { useEffect, useState } from 'react';
import { ChevronRight, ChevronLeft, RefreshCw, Play, Star, Calendar, Tv } from 'lucide-react';
import { clientCache } from '../utils/clientCache';
import { cleanAnimeTitle } from '../utils/animeTitleCleaner';
import {
  useGlobalLayoutMode,
  LayoutModeToggleButton,
  getLayoutGridClasses,
  getShortTypeCode,
  getArabicSeasonLabel,
  normalizeAnimeStatusAr,
} from '../utils/useViewLayoutMode';

export default function RecentEpisodesView({ onBack, onAnimeClick }: { onBack: () => void, onAnimeClick: (id: string, epNum?: string) => void }) {
  const [page, setPage] = useState<number>(1);
  const [hasNext, setHasNext] = useState<boolean>(true);
  const [episodes, setEpisodes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [layoutMode, cycleLayoutMode] = useGlobalLayoutMode();

  const loadEpisodes = async (targetPage = 1, forceBypass = false) => {
    const safePage = Math.max(1, targetPage);
    if (forceBypass) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const ts = Date.now();
      const fetchOpts: RequestInit = {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }
      };

      const queryParams = new URLSearchParams({ page: String(safePage) });
      if (forceBypass) {
        queryParams.set('bypass', 'true');
        queryParams.set('_t', String(ts));
      }

      const r = await fetch(`/api/anime/recent?${queryParams.toString()}`, fetchOpts);
      if (r.ok) {
        const json = await r.json();
        if (json.success && Array.isArray(json.data) && json.data.length > 0) {
          const formatted = json.data.map((ep: any, idx: number) => {
            const rawTitle = ep.title || '';
            const cleanedTitle = rawTitle.includes(' S') ? rawTitle : cleanAnimeTitle(rawTitle);
            const extractedEp = ep.episodeNumber || ep.episode || (rawTitle.match(/الحلقة\s*(\d+)/)?.[1]) || '1';
            const posterImg = ep.posterUrl || ep.imageUrl || ep.thumbnailUrl;
            return {
              _id: ep.id || `scraped-p${safePage}-${ts}-${idx}`,
              episodeNumber: extractedEp,
              title: cleanedTitle,
              type: ep.type || ep.animeId?.type || 'TV',
              status: ep.status || ep.animeId?.status || 'يعرض حالياً',
              rating: ep.rating || ep.score || ep.animeId?.rating || ep.animeId?.score || null,
              season: ep.season || ep.animeId?.season || null,
              year: ep.year || ep.releaseYear || ep.animeId?.releaseYear || null,
              animeId: {
                _id: typeof ep.animeId === 'string' ? ep.animeId : (ep.animeId?._id || `search-${cleanedTitle}`),
                title: cleanedTitle,
                titleAr: cleanedTitle,
                posterUrl: posterImg,
                thumbnailUrl: posterImg,
              }
            };
          });
          setEpisodes(formatted);
          setHasNext(typeof json.hasNext === 'boolean' ? json.hasNext : formatted.length >= 10);
          setRefreshing(false);
          setLoading(false);
          return;
        }
      }

      if (safePage === 1) {
        const rDash = await fetch(`/api/dashboard?bypass=true&_t=${ts}`, fetchOpts);
        if (rDash.ok) {
          const jsonDash = await rDash.json();
          if (jsonDash.success && Array.isArray(jsonDash.data?.recentEpisodes) && jsonDash.data.recentEpisodes.length > 0) {
            const cleanedDash = jsonDash.data.recentEpisodes.map((ep: any) => ({
              ...ep,
              animeId: {
                ...ep.animeId,
                title: cleanAnimeTitle(ep.animeId?.title || ep.title),
                titleAr: cleanAnimeTitle(ep.animeId?.titleAr || ep.title),
              }
            }));
            setEpisodes(cleanedDash);
            setHasNext(true);
            setRefreshing(false);
            setLoading(false);
            return;
          }
        }
      }
    } catch (e) {
      console.warn("Failed to load recent episodes:", e);
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEpisodes(page, false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [page]);

  const handleNextPage = () => {
    if (loading || refreshing || !hasNext) return;
    setPage((prev) => prev + 1);
  };

  const handlePrevPage = () => {
    if (loading || refreshing || page <= 1) return;
    setPage((prev) => Math.max(1, prev - 1));
  };

  const displayEpisodes = episodes || [];
  const isListMode = layoutMode === 'list';
  const isLargeGrid = layoutMode === 'grid2';

  return (
    <div className="min-h-screen bg-black text-white pb-24" dir="rtl">
      {/* شريط العنوان العلوي - مدمج وغير ثابت */}
      <div className="bg-black border-b border-white/5 px-4 py-3 flex items-center justify-between max-w-7xl mx-auto">
        <div className="flex items-center gap-2.5">
          <button 
            onClick={onBack} 
            className="p-2 bg-neutral-900 rounded-xl hover:bg-neutral-800 transition text-neutral-300 hover:text-white cursor-pointer"
            aria-label="الرجوع"
          >
            <ChevronRight size={18} />
          </button>
          <h1 className="font-black text-base md:text-lg text-white">
            أحدث الحلقات
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <LayoutModeToggleButton mode={layoutMode} onToggle={cycleLayoutMode} />
          <button
            onClick={() => loadEpisodes(page, true)}
            disabled={refreshing || loading}
            title="تحديث"
            className="p-2 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white hover:border-neutral-700 transition active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw size={15} className={refreshing ? 'animate-spin text-red-500' : ''} />
          </button>
        </div>
      </div>
      
      {/* عرض الحلقات حسب الوضع المختار */}
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
            displayEpisodes.map((ep: any, idx: number) => {
              const cleanTitle = cleanAnimeTitle(ep.animeId?.title || ep.animeId?.titleAr || ep.title || 'Anime');
              const epPoster = ep.animeId?.posterUrl || ep.thumbnailUrl || ep.posterUrl || ep.animeId?.thumbnailUrl || 'https://via.placeholder.com/200x300?text=Anime';
              const epNumber = ep.episodeNumber || (ep.title && ep.title.match(/الحلقة\s*(\d+)/)?.[1]) || '1';
              const animeTargetId = ep.animeId?._id || ep.animeId?.id || ep.animeId?.mal_id || (cleanTitle ? `search-${cleanTitle}` : 'unknown');
              const shortType = getShortTypeCode(ep.type || ep.animeId?.type || 'TV');
              const ratingVal = ep.rating && ep.rating !== 'N/A' && Number(ep.rating) > 0 ? Number(ep.rating).toFixed(1) : null;
              const seasonLabel = getArabicSeasonLabel(ep.season, ep.year);
              const statusInfo = normalizeAnimeStatusAr(ep.status || 'يعرض حالياً');

              if (isListMode) {
                return (
                  <div
                    key={`recent-p${page}-${ep._id || idx}-${idx}`}
                    onClick={() => onAnimeClick(String(animeTargetId), String(epNumber))}
                    onMouseEnter={() => clientCache.prefetchDetails(animeTargetId)}
                    className="cursor-pointer group flex items-stretch bg-neutral-900/95 border border-neutral-800/90 hover:border-red-500/60 rounded-xl transition-all overflow-hidden shadow-md min-h-[124px] sm:min-h-[132px]"
                  >
                    <div className="w-24 sm:w-28 shrink-0 bg-neutral-950 border-l border-white/10 relative overflow-hidden">
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
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        alt={cleanTitle}
                      />
                      <span className="absolute top-1.5 right-1.5 bg-red-600 text-white px-1.5 py-0.5 rounded text-[9px] font-black shadow" dir="ltr">
                        EP {epNumber}
                      </span>
                    </div>

                    <div className="flex-1 min-w-0 flex flex-col justify-center items-start text-right gap-1.5 p-2.5 sm:p-3">
                      <h5
                        className="w-full font-black text-sm sm:text-base text-white group-hover:text-red-400 transition-colors line-clamp-1 leading-snug text-right"
                        dir="auto"
                      >
                        {cleanTitle}
                      </h5>

                      <div className="flex flex-wrap items-center justify-start gap-1.5 text-[10px] sm:text-xs font-bold">
                        <span className="bg-red-600/20 border border-red-500/30 text-red-300 px-2 py-0.5 rounded-lg font-black">
                          الحلقة {epNumber}
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

                      <div className="flex flex-wrap items-center justify-start gap-1.5 text-[10px] text-neutral-400 font-bold">
                        {statusInfo && (
                          <span className={`border px-2 py-0.5 rounded-md ${statusInfo.colorClass}`}>
                            {statusInfo.label}
                          </span>
                        )}
                        {seasonLabel && (
                          <span className="flex items-center gap-1 bg-neutral-950/90 border border-white/10 text-neutral-300 px-2 py-0.5 rounded-md">
                            <Calendar size={10} className="text-neutral-400" />
                            <span>{seasonLabel}</span>
                          </span>
                        )}
                        <span className="bg-neutral-950/90 border border-white/10 text-neutral-300 px-2 py-0.5 rounded-md">
                          مترجم FHD
                        </span>
                      </div>
                    </div>

                    <div className="w-9 h-9 self-center rounded-xl bg-red-600/15 border border-red-500/30 text-red-400 group-hover:bg-red-600 group-hover:text-white flex items-center justify-center shrink-0 transition-colors ml-2.5">
                      <Play size={15} fill="currentColor" />
                    </div>
                  </div>
                );
              }

              // عرض الشبكة بدون فراغات + الاسم على البوستر + التقييم والنوع باختصار إنجليزي (3 حروف كحد أقصى)
              return (
                <div 
                  key={`recent-p${page}-${ep._id || idx}-${idx}`} 
                  onClick={() => onAnimeClick(String(animeTargetId), String(epNumber))}
                  onMouseEnter={() => clientCache.prefetchDetails(animeTargetId)}
                  className="cursor-pointer group relative aspect-[3/4] overflow-hidden bg-neutral-950 border-b border-l border-white/10"
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
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                    alt={cleanTitle} 
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

                    <span className="bg-red-600/95 backdrop-blur-md text-white px-1.5 py-0.5 rounded text-[9px] sm:text-[10px] font-black shadow">
                      EP {epNumber}
                    </span>
                  </div>

                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/70 to-transparent pt-8 pb-2 px-2 pointer-events-none flex flex-col justify-end">
                    <h5
                      className={`font-black ${
                        isLargeGrid ? 'text-xs sm:text-sm' : 'text-[10px] sm:text-xs'
                      } text-white group-hover:text-red-400 transition-colors line-clamp-2 text-center leading-tight drop-shadow`}
                      dir="ltr"
                    >
                      {cleanTitle}
                    </h5>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* أزرار التنقل بين الصفحات */}
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
            className="flex items-center gap-1.5 px-6 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-xs font-black text-white transition active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            <span>التالي</span>
            <ChevronLeft size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
