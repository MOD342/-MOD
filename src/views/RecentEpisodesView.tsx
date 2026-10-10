import React, { useEffect, useState } from 'react';
import { ChevronRight, ChevronLeft, RefreshCw } from 'lucide-react';
import { clientCache } from '../utils/clientCache';
import { getCuratedRecentEpisodes } from '../data/curatedAnimeDatabase';
import { cleanAnimeTitle } from '../utils/animeTitleCleaner';

export default function RecentEpisodesView({ onBack, onAnimeClick }: { onBack: () => void, onAnimeClick: (id: string, epNum?: string) => void }) {
  const [page, setPage] = useState<number>(1);
  const [hasNext, setHasNext] = useState<boolean>(true);
  const [episodes, setEpisodes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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

      // 1. استعلام مسار الحلقات الأحدث للصفحة المحددة مباشرة
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

      // 2. استعلام مسار لوحة التحكم كبديل موثوق للصفحة الأولى فقط
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

  return (
    <div className="min-h-screen bg-black text-white pb-28">
      {/* شريط العنوان العلوي */}
      <div className="sticky top-0 z-50 bg-black/85 backdrop-blur-xl border-b border-white/5 px-4 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button 
            onClick={onBack} 
            className="p-2 bg-neutral-900/90 rounded-full hover:bg-neutral-800 transition text-neutral-300 hover:text-white"
            aria-label="الرجوع"
          >
            <ChevronRight size={20} />
          </button>
          <div>
            <h1 className="font-black text-lg md:text-xl flex items-center gap-2">
              <span>أحدث الحلقات</span>
              <span className="text-xs bg-red-600/20 text-red-400 border border-red-500/30 px-2 py-0.5 rounded-full font-bold">
                صفحة {page} • {displayEpisodes.length} حلقة
              </span>
            </h1>
          </div>
        </div>

        <button
          onClick={() => loadEpisodes(page, true)}
          disabled={refreshing || loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-900 border border-neutral-800 text-xs font-bold text-neutral-300 hover:text-white hover:border-neutral-700 transition active:scale-95 disabled:opacity-50"
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin text-red-500' : ''} />
          <span>{refreshing ? 'جاري التحديث...' : 'تحديث'}</span>
        </button>
      </div>
      
      {/* شبكة الحلقات: رقم الحلقة في الأعلى + اسم الأنمي فقط أسفل البوستر */}
      <div className="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3.5 md:gap-4 max-w-7xl mx-auto">
        {loading ? (
          [...Array(20)].map((_, i) => (
            <div key={i} className="aspect-[3/4] bg-neutral-900 rounded-2xl animate-pulse border border-neutral-800"></div>
          ))
        ) : (
          displayEpisodes.map((ep: any, idx: number) => {
            const cleanTitle = cleanAnimeTitle(ep.animeId?.title || ep.animeId?.titleAr || ep.title || 'Anime');
            const epPoster = ep.animeId?.posterUrl || ep.thumbnailUrl || ep.posterUrl || ep.animeId?.thumbnailUrl || 'https://via.placeholder.com/200x300?text=Anime';
            const epNumber = ep.episodeNumber || (ep.title && ep.title.match(/الحلقة\s*(\d+)/)?.[1]) || '1';
            const animeTargetId = ep.animeId?._id || ep.animeId?.id || ep.animeId?.mal_id || (cleanTitle ? `search-${cleanTitle}` : 'unknown');
            
            return (
              <div 
                key={`recent-p${page}-${ep._id || idx}-${idx}`} 
                onClick={() => onAnimeClick(String(animeTargetId), String(epNumber))}
                onMouseEnter={() => clientCache.prefetchDetails(animeTargetId)}
                className="cursor-pointer group flex flex-col"
              >
                {/* حاوية البوستر وبداخلها رقم الحلقة بالأعلى */}
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
                    className="w-full h-full object-cover opacity-95 group-hover:scale-105 transition-all duration-500" 
                    alt={cleanTitle} 
                  />
                  
                  {/* شارة رقم الحلقة بالأعلى حصراً */}
                  <div className="absolute top-2 right-2 z-10 pointer-events-none">
                    <span className="bg-red-600/95 backdrop-blur-md text-white border border-red-500/30 px-2 py-0.5 rounded-lg text-[10px] md:text-xs font-black shadow-lg">
                      حلقة {epNumber}
                    </span>
                  </div>
                </div>
                
                {/* اسم الأنمي فقط أسفل البوستر دون أي نصوص زائدة */}
                <div className="pt-2 px-1 text-center">
                  <h5 className="font-bold text-xs md:text-sm text-neutral-200 group-hover:text-red-400 transition-colors line-clamp-1 truncate" dir="ltr">
                    {cleanTitle}
                  </h5>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* أزرار التنقل بين الصفحات (السابق / التالي) أسفل قسم أحدث الحلقات بنفس وظيفة الموقع الرئيسي */}
      <div className="max-w-7xl mx-auto px-4 pt-4 pb-8 flex items-center justify-center gap-3">
        {page > 1 && (
          <button
            onClick={handlePrevPage}
            disabled={loading || refreshing}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 hover:border-neutral-700 text-sm font-black text-white transition active:scale-95 disabled:opacity-50 shadow-lg"
          >
            <ChevronRight size={18} />
            <span>السابق</span>
          </button>
        )}

        <div className="px-4 py-2 rounded-xl bg-neutral-950 border border-white/10 text-xs font-bold text-neutral-400">
          صفحة <span className="text-white font-black">{page}</span>
        </div>

        {hasNext && (
          <button
            onClick={handleNextPage}
            disabled={loading || refreshing}
            className="flex items-center gap-2 px-7 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 border border-red-500/40 text-sm font-black text-white transition active:scale-95 disabled:opacity-50 shadow-lg shadow-red-950/40"
          >
            <span>التالي</span>
            <ChevronLeft size={18} />
          </button>
        )}
      </div>
    </div>
  );
}
