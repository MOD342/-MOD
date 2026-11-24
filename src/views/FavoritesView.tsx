import React, { useEffect, useState, useCallback } from 'react';
import { ChevronRight, Heart, AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { AnimeEntry, listService } from '../services/listService';
import { clientCache } from '../utils/clientCache';
import PullToRefresh from '../components/PullToRefresh';
import { LongPressCopy } from '../components/LongPressCopy';
import { FALLBACK_POSTER_DATA_URL } from '../utils/posterFallback';

export default function FavoritesView({ onBack, onAnimeClick }: { onBack: () => void; onAnimeClick: (id: string) => void }) {
  const { user } = useAuth();
  const [favorites, setFavorites] = useState<AnimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);

  const fetchFavs = useCallback(async (forceRefresh = false) => {
    if (!user) {
      setFavorites([]);
      setLoading(false);
      return;
    }
    setFetchError(false);
    try {
      if (forceRefresh) {
        listService.invalidateUserCache(user.id);
      }
      const allEntries = await listService.getAnimeEntries(user.id);
      setFavorites(allEntries.filter((e) => e.isFavorite === true));
    } catch (e) {
      console.error(e);
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void fetchFavs(false);
  }, [fetchFavs]);

  useEffect(() => {
    if (!user) return;
    const onLibraryUpdated = (ev: Event) => {
      const detail = (ev as CustomEvent)?.detail;
      if (!detail?.userId || detail.userId === user.id) {
        void fetchFavs(false);
      }
    };
    window.addEventListener('otaku:library-updated', onLibraryUpdated);
    return () => window.removeEventListener('otaku:library-updated', onLibraryUpdated);
  }, [user, fetchFavs]);

  return (
    <PullToRefresh onRefresh={() => fetchFavs(true)}>
      <div className="bg-black min-h-screen pb-24 text-white" dir="rtl">
        <div
          style={{ paddingTop: 'calc(var(--safe-top, 0px) + 0.75rem)' }}
          className="sticky top-0 bg-black/90 backdrop-blur-md z-40 px-4 pb-3 border-b border-neutral-800 flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="p-2 bg-neutral-900 rounded-xl text-white hover:bg-neutral-800 transition cursor-pointer"
              aria-label="رجوع"
            >
              <ChevronRight size={20} />
            </button>
            <h1 className="text-lg font-black text-white flex items-center gap-2">
              <Heart size={18} className="text-[#FF1744] drop-shadow-[0_0_8px_rgba(255,23,68,0.6)]" fill="#FF1744" />
              <span>المفضلة</span>
            </h1>
          </div>
          {!loading && favorites.length > 0 && (
            <span className="text-xs font-bold text-neutral-400 tabular-nums">{favorites.length} أنمي</span>
          )}
        </div>

        <div className="p-4 max-w-6xl mx-auto">
          {loading ? (
            <div className="flex justify-center p-10">
              <div className="w-8 h-8 rounded-full border-2 border-[#FF1744] border-t-transparent animate-spin" />
            </div>
          ) : favorites.length > 0 ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
              {favorites.map((anime, idx) => {
                const targetId = anime.animeId || anime.id;
                return (
                  <div
                    key={`${anime.id || idx}-${idx}`}
                    onClick={() => onAnimeClick(targetId)}
                    onMouseEnter={() => clientCache.prefetchDetails(targetId)}
                    className="cursor-pointer group relative"
                  >
                    <div className="theme-keep-dark aspect-[3/4] rounded-xl overflow-hidden bg-[#121212] border border-neutral-800 group-hover:border-[#FF1744] transition-colors relative">
                      <img
                        src={anime.posterUrl || FALLBACK_POSTER_DATA_URL}
                        alt={anime.title}
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          if (e.currentTarget.src !== FALLBACK_POSTER_DATA_URL) {
                            e.currentTarget.src = FALLBACK_POSTER_DATA_URL;
                          }
                        }}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/85 to-transparent" />
                      <div className="absolute bottom-2 left-2 right-2 text-center text-[10px] sm:text-xs font-bold text-white line-clamp-2">
                        <LongPressCopy text={anime.title}>{anime.title}</LongPressCopy>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center text-neutral-400 bg-neutral-900/30 border border-white/5 rounded-2xl space-y-3">
              {fetchError ? (
                <AlertCircle size={40} className="text-rose-500" />
              ) : (
                <Heart size={42} className="text-neutral-700" />
              )}
              <p className="font-bold text-sm text-neutral-300">
                {fetchError ? 'تعذر تحميل قائمة المفضلة' : 'ليس لديك أنميات في المفضلة بعد.'}
              </p>
              {fetchError && (
                <button
                  onClick={() => void fetchFavs(true)}
                  className="px-4 py-2 rounded-xl bg-[#FF1744] hover:bg-red-600 text-white text-xs font-black transition cursor-pointer"
                >
                  إعادة المحاولة
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </PullToRefresh>
  );
}
