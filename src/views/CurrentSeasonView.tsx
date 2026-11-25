import React, { useEffect, useState, useCallback } from 'react';
import { ChevronRight, Star, Tv, Calendar, RefreshCw, AlertCircle } from 'lucide-react';
import { clientCache } from '../utils/clientCache';
import { cloudCatalogService } from '../services/cloudCatalogService';
import { LongPressCopy } from '../components/LongPressCopy';
import { getCuratedSeasonAnime } from '../data/curatedAnimeDatabase';
import PullToRefresh from '../components/PullToRefresh';
import { FALLBACK_POSTER_DATA_URL } from '../utils/posterFallback';

const SEASONS = [
  { value: 'now', label: 'الموسم الحالي' },
  { value: 'winter', label: 'شتاء' },
  { value: 'spring', label: 'ربيع' },
  { value: 'summer', label: 'صيف' },
  { value: 'fall', label: 'خريف' }
];

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: currentYear - 1980 + 1 }, (_, i) => currentYear - i);

export default function CurrentSeasonView({ onBack, onAnimeClick }: { onBack: () => void, onAnimeClick: (id: string) => void }) {
  const [selectedSeason, setSelectedSeason] = useState('now');
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [animeList, setAnimeList] = useState<any[]>(() => {
    const cached = clientCache.get<any[]>('client_season_now_' + currentYear);
    return (cached && cached.length > 0) ? cached : getCuratedSeasonAnime();
  });
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState(false);

  // Fetch season data via 3-tier Cloud Catalog (Device -> Shared Cloud -> Live)
  const loadSeasonData = useCallback(async (season: string, year: number, forceBypass = false) => {
    let url = '/api/anime/season';
    if (season !== 'now') {
      url += `?year=${year}&season=${season}`;
    }
    const cacheKey = `client_season_${season}_${year}`;
    const cached = !forceBypass ? clientCache.get<any[]>(cacheKey) : null;
    setFetchError(false);

    if (forceBypass) {
      setRefreshing(true);
    } else if (cached && Array.isArray(cached) && cached.length > 0) {
      setAnimeList(cached);
      setLoading(false);
      setRefreshing(false);
      return;
    } else {
      setLoading(true);
    }

    try {
      const isCurrent = season === 'now';
      const data = await cloudCatalogService.getBundleWithCloud<any[]>({
        bundleId: `season_${season}_${year}`,
        kind: 'season',
        freshTtlMs: isCurrent ? 6 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000,
        staleTtlMs: isCurrent ? 7 * 24 * 60 * 60 * 1000 : 90 * 24 * 60 * 60 * 1000,
        forceRefresh: forceBypass,
        countItems: (arr) => (Array.isArray(arr) ? arr.length : 0),
        fetchLive: async () => {
          const sep = url.includes('?') ? '&' : '?';
          const reqUrl = forceBypass ? `${url}${sep}_t=${Date.now()}` : url;
          const res = await fetch(reqUrl, { cache: forceBypass ? 'no-store' : 'default' });
          if (!res.ok) return null;
          const json = await res.json();
          return json?.success && Array.isArray(json.data) ? json.data : null;
        },
        onData: (list) => {
          if (Array.isArray(list) && list.length > 0) {
            setAnimeList(list);
            setFetchError(false);
            clientCache.set(cacheKey, list, 6 * 60 * 60 * 1000);
          }
          setLoading(false);
          setRefreshing(false);
        },
      });
      if (!data && (!cached || cached.length === 0)) {
        setFetchError(true);
      }
    } catch {
      if (!cached || cached.length === 0) {
        setFetchError(true);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadSeasonData(selectedSeason, selectedYear, false);
  }, [selectedSeason, selectedYear, loadSeasonData]);

  return (
    <PullToRefresh onRefresh={() => loadSeasonData(selectedSeason, selectedYear, true)}>
      <div className="min-h-screen bg-black text-white pb-24" id="current_season_container">
        {/* Header */}
        <div className="sticky top-0 z-50 bg-black/90 backdrop-blur-md border-b border-white/5 p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button id="season_back_btn" onClick={onBack} className="p-2 bg-neutral-900 rounded-full hover:bg-neutral-800 transition cursor-pointer">
                <ChevronRight size={20} />
              </button>
              <div>
                <h1 className="font-black text-lg md:text-xl">تصفح المواسم والأرشيف</h1>
              </div>
            </div>
          </div>

          {/* Dropdowns */}
          <div className="flex items-center gap-2">
            {/* Season Selector */}
            <div className="relative flex-1 md:flex-initial">
              <select
                id="season_select_dropdown"
                value={selectedSeason}
                onChange={(e) => setSelectedSeason(e.target.value)}
                className="w-full md:w-44 bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-purple-500 cursor-pointer appearance-none text-right pr-8"
                style={{ backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'left 8px center', backgroundSize: '12px' }}
              >
                {SEASONS.map(s => (
                  <option key={s.value} value={s.value} className="bg-neutral-900 text-white font-bold">{s.label}</option>
                ))}
              </select>
            </div>

            {/* Year Selector (Only active if not "now" / live season) */}
            {selectedSeason !== 'now' && (
              <div className="relative flex-1 md:flex-initial">
                <select
                  id="year_select_dropdown"
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className="w-full md:w-32 bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-purple-500 cursor-pointer appearance-none text-right pr-8"
                  style={{ backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'left 8px center', backgroundSize: '12px' }}
                >
                  {YEARS.map(y => (
                    <option key={y} value={y} className="bg-neutral-900 text-white font-bold">{y}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
        
        {/* Anime Grid */}
        <div className="p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 max-w-7xl mx-auto">
          {loading ? (
            [...Array(10)].map((_, i) => (
              <div key={i} className="aspect-[3/4] bg-neutral-900 rounded-2xl animate-pulse border border-neutral-800"></div>
            ))
          ) : animeList.length > 0 ? (
            animeList.map((anime: any, idx: number) => (
              <div 
                key={`seasonal-${anime._id}-${idx}`} 
                onClick={() => onAnimeClick(anime._id)}
                onMouseEnter={() => clientCache.prefetchDetails(anime._id)}
                className="theme-keep-dark cursor-pointer relative rounded-2xl overflow-hidden group border border-neutral-800 hover:border-purple-500/50 transition-all duration-300 aspect-[3/4] bg-neutral-900 hover:shadow-lg hover:shadow-purple-500/10"
              >
                <img src={anime.posterUrl || FALLBACK_POSTER_DATA_URL} loading="lazy" className="w-full h-full object-cover group-hover:scale-[1.03] transition-all duration-500" alt="poster" />
                <span className="absolute top-2 right-2 bg-black/65 backdrop-blur-md text-white px-2 py-1 rounded text-xs font-bold shadow-lg flex items-center gap-1 pointer-events-none"><Star size={10} className="text-yellow-400" fill="currentColor" /> {anime.rating || 'N/A'}</span>
                {selectedSeason === 'now' && (
                  <span className="absolute top-2 left-2 bg-purple-600 text-white px-2 py-0.5 rounded text-[10px] font-bold shadow-lg flex items-center gap-1 pointer-events-none"><Tv size={10} /> جديد</span>
                )}
                <div
                  className="absolute inset-x-0 bottom-0 pt-5 pb-2.5 px-3 bg-gradient-to-t from-black/85 via-black/45 to-transparent flex flex-col justify-end pointer-events-none"
                  style={{ textShadow: '0 2px 6px rgba(0,0,0,0.98), 0 0 3px rgba(0,0,0,0.95)' }}
                >
                  {/* Wrap Title in LongPressCopy element so long pressing copies it */}
                  <h5 className="font-bold text-sm text-white line-clamp-2 text-right dir-rtl select-text pointer-events-auto">
                    <LongPressCopy text={anime.title} className="hover:text-purple-300 transition-colors">
                      {anime.title}
                    </LongPressCopy>
                  </h5>
                  {anime.genres?.length > 0 && (
                    <p className="text-[10px] text-neutral-200 mt-0.5 line-clamp-1 text-right">{anime.genres.join(', ')}</p>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="col-span-full py-16 text-center text-neutral-500 flex flex-col items-center justify-center gap-3 bg-neutral-900/20 rounded-2xl border border-neutral-800/40">
              {fetchError ? (
                <AlertCircle size={42} className="text-rose-500" />
              ) : (
                <Calendar size={42} className="text-neutral-700" />
              )}
              <span className="text-sm font-bold text-neutral-300">
                {fetchError ? 'تعذر جلب أنميات الموسم' : 'لا تتوفر أنميات للموسم المحدد حالياً'}
              </span>
              {fetchError && (
                <button
                  onClick={() => loadSeasonData(selectedSeason, selectedYear, true)}
                  disabled={refreshing}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-black transition active:scale-95 cursor-pointer"
                >
                  <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
                  <span>إعادة المحاولة</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </PullToRefresh>
  );
}
