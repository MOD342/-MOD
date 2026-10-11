import { useState, useEffect, useRef } from 'react';
import { Search, Filter, Star, Loader2, ChevronDown, Calendar, Tv, Layers } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
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

const GENRE_ARABIC_MAP: Record<string, string> = {
  'Action': 'أكشن ⚔️',
  'Adventure': 'مغامرات 🗺️',
  'Comedy': 'كوميديا 🎭',
  'Drama': 'دراما 😭',
  'Fantasy': 'خيالي 🦄',
  'Romance': 'رومانسي 💕',
  'Sci-Fi': 'خيال علمي 🚀',
  'Slice of Life': 'شريحة من الحياة 🌸',
  'Supernatural': 'قوى خارقة 🔮',
  'Suspense': 'إثارة ⏳',
  'Mystery': 'غموض 🔍',
  'Sports': 'رياضة ⚽',
  'Horror': 'رعب 👻',
  'Gourmet': 'طهي وطعام 🍜',
  'Award Winning': 'حائز على جوائز 🏆',
  'Boys Love': 'رومانسية شباب',
  'Girls Love': 'رومانسية فتيات',
  'Ecchi': 'إيتشي 🔞',
  'Avant Garde': 'طليعي / غريب 🎨',
  'Erotica': 'عمل للبالغين 🔞',
  'Hentai': 'محتوى للبالغين 🔞',
  'Workplace': 'بيئة عمل 💼',
  'Psychological': 'نفسي 🧠',
  'Thriller': 'إثارة وتشويق 🔥',
  'Mecha': 'آليات 🤖',
  'Music': 'موسيقى 🎵',
  'Mahou Shoujo': 'فتيات سحريات ✨',
  'Historical': 'تاريخي 📜',
  'Military': 'عسكري 🎖️',
  'School': 'مدرسي 🏫',
  'Shounen': 'شونين 🔥',
  'Seinen': 'سينين 🗡️',
  'Shoujo': 'شوجو 🌸',
  'Josei': 'جوسي 💫',
  'Isekai': 'إيسيكاي 🌌',
};

interface ExploreViewProps {
  onAnimeClick: (id: string) => void;
  initialQuery?: string;
}

const CustomSelect = ({ label, value, options, onChange }: any) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const selectedOption = options.find((o: any) => o.value === value);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  return (
    <div className="relative" ref={dropdownRef}>
      <h3 className="text-xs font-bold text-neutral-400 mb-1.5">{label}</h3>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-neutral-900 border border-neutral-800 hover:border-neutral-700 text-white rounded-lg py-2 px-3 flex items-center justify-between text-xs font-bold transition-colors"
      >
        <span className="truncate">{selectedOption ? selectedOption.label : 'الكل'}</span>
        <ChevronDown size={14} className={`text-neutral-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}
            className="absolute top-[full] mt-1 left-0 right-0 max-h-48 overflow-y-auto bg-neutral-900 border border-neutral-800 rounded-lg shadow-xl shadow-black z-50 hide-scrollbar"
          >
            {options.map((opt: any, idx: number) => (
              <button
                key={`${opt.value || ''}-${idx}`}
                onClick={() => { onChange(opt.value); setIsOpen(false); }}
                className={`w-full text-right px-3 py-2 text-xs font-bold transition-colors ${value === opt.value ? 'bg-purple-600 text-white' : 'text-neutral-300 hover:bg-neutral-800 hover:text-white'}`}
              >
                {opt.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default function ExploreView({ onAnimeClick, initialQuery }: ExploreViewProps) {
  const [query, setQuery] = useState(initialQuery || '');
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery || '');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(true);
  
  const [showFilters, setShowFilters] = useState(false);
  const [genres, setGenres] = useState<{mal_id: number, name: string}[]>([
    { mal_id: 1, name: "Action" },
    { mal_id: 2, name: "Adventure" },
    { mal_id: 4, name: "Comedy" },
    { mal_id: 8, name: "Drama" },
    { mal_id: 10, name: "Fantasy" },
    { mal_id: 7, name: "Mystery" },
    { mal_id: 22, name: "Romance" },
    { mal_id: 24, name: "Sci-Fi" },
    { mal_id: 36, name: "Slice of Life" },
    { mal_id: 30, name: "Sports" },
    { mal_id: 37, name: "Supernatural" },
    { mal_id: 41, name: "Suspense" }
  ]);
  
  const [selectedGenres, setSelectedGenres] = useState<number[]>([]);
  const [minScore, setMinScore] = useState('');
  const [status, setStatus] = useState('');
  const [year, setYear] = useState('');
  const [orderBy, setOrderBy] = useState('');
  const [sortOrder, setSortOrder] = useState('desc');
  const [layoutMode, cycleLayoutMode] = useGlobalLayoutMode();

  useEffect(() => {
    clientCache.fetchWithRevalidate<{ mal_id: number; name: string }[]>(
      'client_genres_cache_v2',
      '/api/anime/genres',
      (data) => {
        if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object' && data[0]?.mal_id) {
          setGenres(data);
        }
      },
      7 * 24 * 60 * 60 * 1000
    );
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    fetchResults(true);
  }, [debouncedQuery, selectedGenres, minScore, status, year, orderBy, sortOrder]);

  const fetchResults = async (reset: boolean = false) => {
    const currentPage = reset ? 1 : page + 1;
    let url = `/api/anime/search?page=${currentPage}`;
    if (debouncedQuery) url += `&q=${encodeURIComponent(debouncedQuery)}`;
    if (selectedGenres.length > 0) url += `&genres=${selectedGenres.join(',')}`;
    if (minScore) url += `&min_score=${minScore}`;
    if (status) url += `&status=${status}`;
    if (year) url += `&year=${year}`;
    if (orderBy) url += `&order_by=${orderBy}`;
    if (sortOrder) url += `&sort=${sortOrder}`;

    const cacheKey = `client_explore_results_v3_${url}`;

    if (reset) {
      const cached = clientCache.get<any>(cacheKey);
      if (cached && Array.isArray(cached.data)) {
        setResults(cached.data || []);
        setHasNextPage(cached.hasNextPage ?? false);
        setLoading(false);
      } else {
        setLoading(true);
      }
      setPage(1);
    } else {
      setLoadingMore(true);
    }

    try {
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        if (reset) {
          setResults(data.data);
          clientCache.set(cacheKey, {
            data: data.data,
            hasNextPage: data.pagination?.has_next_page || false
          }, 30 * 60 * 1000);
        } else {
          setResults(prev => [...prev, ...data.data]);
        }
        setHasNextPage(data.pagination?.has_next_page || false);
        if (!reset) setPage(currentPage);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const toggleGenre = (id: number) => {
    setSelectedGenres(prev => 
      prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id]
    );
  };

  const isListMode = layoutMode === 'list';
  const isLargeGrid = layoutMode === 'grid2';

  return (
    <div className="min-h-screen bg-black text-white pb-24" dir="rtl">
      <div className="max-w-7xl mx-auto">
        {/* شريط العنوان والبحث العلوي - غير ثابت ومدمج */}
        <div className="bg-black border-b border-white/5 px-3.5 md:px-5 py-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <h1 className="font-black text-base md:text-lg text-white">استكشف الأنمي</h1>
            <LayoutModeToggleButton mode={layoutMode} onToggle={cycleLayoutMode} />
          </div>

          <div className="flex gap-2 items-center">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500" size={16} />
              <input 
                type="text" 
                placeholder="ابحث عن أنمي..." 
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full bg-neutral-900 border border-neutral-800 text-white rounded-xl py-2 pr-9 pl-3 focus:outline-none focus:border-purple-500/50 text-xs sm:text-sm transition"
              />
            </div>
            <button 
              onClick={() => setShowFilters(!showFilters)}
              className={`p-2 rounded-xl transition-all border cursor-pointer ${showFilters ? 'bg-purple-600 border-purple-500 text-white shadow-lg' : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white'}`}
              title="فلاتر البحث"
            >
              <Filter size={16} />
            </button>
          </div>

          {/* شرائح الفلترة السريعة */}
          <div className="flex items-center gap-1.5 overflow-x-auto hide-scrollbar pb-0.5 pt-0.5">
            <button
              onClick={() => {
                setQuery('');
                setSelectedGenres([]);
                setMinScore('');
                setStatus('');
                setOrderBy('');
                setSortOrder('desc');
              }}
              className={`px-3 py-1 rounded-lg text-[11px] font-bold transition whitespace-nowrap cursor-pointer ${
                !query && selectedGenres.length === 0 && !minScore && !status && !orderBy
                  ? 'bg-purple-600 text-white shadow'
                  : 'bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white'
              }`}
            >
              الكل
            </button>
            <button
              onClick={() => {
                setOrderBy(orderBy === 'score' ? '' : 'score');
                setSortOrder('desc');
              }}
              className={`px-3 py-1 rounded-lg text-[11px] font-bold transition whitespace-nowrap cursor-pointer ${
                orderBy === 'score'
                  ? 'bg-purple-600 text-white shadow'
                  : 'bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white'
              }`}
            >
              أعلى تقييم ⭐
            </button>
            <button
              onClick={() => {
                setStatus(status === 'airing' ? '' : 'airing');
              }}
              className={`px-3 py-1 rounded-lg text-[11px] font-bold transition whitespace-nowrap cursor-pointer ${
                status === 'airing'
                  ? 'bg-purple-600 text-white shadow'
                  : 'bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white'
              }`}
            >
              يعرض حالياً 🔴
            </button>
            <button
              onClick={() => toggleGenre(1)}
              className={`px-3 py-1 rounded-lg text-[11px] font-bold transition whitespace-nowrap cursor-pointer ${
                selectedGenres.includes(1)
                  ? 'bg-purple-600 text-white shadow'
                  : 'bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white'
              }`}
            >
              أكشن ⚔️
            </button>
            <button
              onClick={() => toggleGenre(2)}
              className={`px-3 py-1 rounded-lg text-[11px] font-bold transition whitespace-nowrap cursor-pointer ${
                selectedGenres.includes(2)
                  ? 'bg-purple-600 text-white shadow'
                  : 'bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white'
              }`}
            >
              مغامرة 🗺️
            </button>
            <button
              onClick={() => toggleGenre(4)}
              className={`px-3 py-1 rounded-lg text-[11px] font-bold transition whitespace-nowrap cursor-pointer ${
                selectedGenres.includes(4)
                  ? 'bg-purple-600 text-white shadow'
                  : 'bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white'
              }`}
            >
              كوميديا 😂
            </button>
            <button
              onClick={() => toggleGenre(10)}
              className={`px-3 py-1 rounded-lg text-[11px] font-bold transition whitespace-nowrap cursor-pointer ${
                selectedGenres.includes(10)
                  ? 'bg-purple-600 text-white shadow'
                  : 'bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white'
              }`}
            >
              خيالي 🔮
            </button>
          </div>
          
          {/* لوحة الفلاتر المتقدمة */}
          <AnimatePresence>
            {showFilters && (
              <motion.div 
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="pt-3 pb-2 space-y-4 border-t border-white/5 mt-2">
                  <div>
                    <h3 className="text-[11px] font-bold text-neutral-500 mb-2">التصنيفات</h3>
                    <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto hide-scrollbar">
                      {genres.map((g, idx) => (
                        <button
                          key={`genre-${g?.mal_id || idx}-${idx}`}
                          onClick={() => toggleGenre(g.mal_id)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                            selectedGenres.includes(g.mal_id) 
                              ? 'bg-purple-600 text-white shadow' 
                              : 'bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white'
                          }`}
                        >
                          {GENRE_ARABIC_MAP[g.name] || g.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 relative z-40">
                    <CustomSelect 
                      label="ترتيب حسب" 
                      value={orderBy} 
                      onChange={setOrderBy}
                      options={[
                        { label: 'تلقائي', value: '' },
                        { label: 'التقييم', value: 'score' },
                        { label: 'الأبجدية', value: 'title' },
                        { label: 'العام', value: 'start_date' },
                        { label: 'الشعبية', value: 'popularity' }
                      ]}
                    />

                    <CustomSelect 
                      label="نوع الترتيب" 
                      value={sortOrder} 
                      onChange={setSortOrder}
                      options={[
                        { label: 'تنازلي', value: 'desc' },
                        { label: 'تصاعدي', value: 'asc' }
                      ]}
                    />

                    <CustomSelect 
                      label="سنة الإصدار" 
                      value={year} 
                      onChange={setYear}
                      options={[
                        { label: 'الكل', value: '' },
                        ...Array.from({ length: new Date().getFullYear() - 1980 + 1 }, (_, i) => new Date().getFullYear() - i).map(y => ({ label: String(y), value: String(y) }))
                      ]}
                    />

                    <CustomSelect 
                      label="الحالة" 
                      value={status} 
                      onChange={setStatus}
                      options={[
                        { label: 'الكل', value: '' },
                        { label: 'مستمر', value: 'airing' },
                        { label: 'مكتمل', value: 'complete' },
                        { label: 'قادم', value: 'upcoming' }
                      ]}
                    />
                  </div>
                  
                  <div className="flex justify-end pt-1">
                    <button 
                      onClick={() => {
                        setSelectedGenres([]);
                        setStatus('');
                        setMinScore('');
                        setYear('');
                        setOrderBy('');
                        setSortOrder('desc');
                      }}
                      className="text-[11px] font-bold text-neutral-400 hover:text-white transition px-3 py-1 rounded-lg bg-neutral-900 hover:bg-neutral-800 cursor-pointer"
                    >
                      إعادة الافتراضي
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* عرض النتائج حسب الوضع المختار */}
        <div className={isListMode ? 'p-2 md:p-4' : 'p-0 md:p-4'}>
          {loading ? (
            <div className={getLayoutGridClasses(layoutMode)}>
              {[...Array(21)].map((_, i) => (
                <div
                  key={i}
                  className={`${
                    isListMode ? 'h-32 rounded-xl' : 'aspect-[3/4]'
                  } bg-neutral-900 animate-pulse border border-white/10`}
                />
              ))}
            </div>
          ) : results.length > 0 ? (
            <>
              <div className={getLayoutGridClasses(layoutMode)}>
                {results.map((anime, idx) => {
                  const cleanTitle = cleanAnimeTitle(anime.title || anime.titleAr || 'Anime');
                  const ratingVal = anime.rating && anime.rating !== 'N/A' && Number(anime.rating) > 0
                    ? Number(anime.rating).toFixed(1)
                    : null;
                  const shortType = getShortTypeCode(anime.type || 'TV');
                  const seasonLabel = getArabicSeasonLabel(anime.season, anime.releaseYear || anime.year);
                  const statusInfo = normalizeAnimeStatusAr(anime.status);
                  const episodesTotal = anime.episodesCount || anime.totalEpisodes || null;
                  const genresList = Array.isArray(anime.genres)
                    ? anime.genres.slice(0, 3).map((g: string) => GENRE_ARABIC_MAP[g] || g)
                    : [];

                  if (isListMode) {
                    return (
                      <div
                        key={`search-${anime._id}-${idx}`}
                        onClick={() => onAnimeClick(anime._id)}
                        onMouseEnter={() => clientCache.prefetchDetails(anime._id)}
                        className="cursor-pointer group flex items-stretch bg-neutral-900/95 border border-neutral-800/90 hover:border-purple-500/60 rounded-xl transition-all overflow-hidden shadow-md min-h-[124px] sm:min-h-[132px]"
                      >
                        {/* البوستر يملأ الجانب بالكامل من الحافة للحافة */}
                        <div className="w-24 sm:w-28 shrink-0 bg-neutral-950 relative border-l border-white/10 overflow-hidden">
                          <img
                            src={anime.posterUrl || 'https://via.placeholder.com/300x400?text=Anime'}
                            alt={cleanTitle}
                            loading="lazy"
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        </div>

                        {/* تفاصيل البطاقة محاذية لليمين بجانب البوستر مباشرة بدون أي فراغ */}
                        <div className="flex-1 min-w-0 flex flex-col justify-center items-start text-right gap-1.5 p-2.5 sm:p-3">
                          <h5
                            className="w-full font-black text-sm sm:text-base text-white group-hover:text-purple-400 transition-colors line-clamp-1 leading-snug text-right"
                            dir="auto"
                          >
                            {cleanTitle}
                          </h5>

                          <div className="flex flex-wrap items-center justify-start gap-1.5 text-[10px] sm:text-xs font-bold">
                            {ratingVal && (
                              <span className="bg-yellow-500/15 border border-yellow-500/30 text-yellow-400 px-2 py-0.5 rounded-lg flex items-center gap-1" dir="ltr">
                                <Star size={10} fill="currentColor" /> {ratingVal}
                              </span>
                            )}
                            <span className="bg-neutral-800 text-neutral-200 px-2 py-0.5 rounded-lg flex items-center gap-1" dir="ltr">
                              <Tv size={10} className="text-neutral-400" />
                              <span>{shortType}</span>
                            </span>
                            {statusInfo && (
                              <span className={`border px-2 py-0.5 rounded-lg ${statusInfo.colorClass}`}>
                                {statusInfo.label}
                              </span>
                            )}
                            {seasonLabel && (
                              <span className="flex items-center gap-1 bg-neutral-950/90 border border-white/10 text-neutral-300 px-2 py-0.5 rounded-lg">
                                <Calendar size={10} className="text-neutral-400" />
                                <span>{seasonLabel}</span>
                              </span>
                            )}
                            {episodesTotal ? (
                              <span className="flex items-center gap-1 bg-neutral-950/90 border border-white/10 text-neutral-300 px-2 py-0.5 rounded-lg">
                                <Layers size={10} className="text-neutral-400" />
                                <span>{episodesTotal} حلقة</span>
                              </span>
                            ) : null}
                          </div>

                          {genresList.length > 0 && (
                            <div className="flex flex-wrap items-center justify-start gap-1 overflow-hidden pt-0.5">
                              {genresList.map((g: string, i: number) => (
                                <span
                                  key={i}
                                  className="text-[10px] text-neutral-300 bg-neutral-950/80 px-2 py-0.5 rounded-md border border-white/5 truncate"
                                >
                                  {g}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  }

                  // عرض الشبكة بدون فراغات + الاسم على البوستر + التقييم والنوع باختصار إنجليزي 3 حروف
                  return (
                    <div 
                      key={`search-${anime._id}-${idx}`}
                      onClick={() => onAnimeClick(anime._id)}
                      onMouseEnter={() => clientCache.prefetchDetails(anime._id)}
                      className="cursor-pointer group relative aspect-[3/4] overflow-hidden bg-neutral-950 border-b border-l border-white/10"
                    >
                      <img 
                        src={anime.posterUrl || 'https://via.placeholder.com/300x400?text=Anime'} 
                        alt={cleanTitle} 
                        loading="lazy" 
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                      />

                      {/* شريط علوي فوق البوستر: النوع (3 حروف) + التقييم */}
                      <div className="absolute top-1.5 inset-x-1.5 z-10 flex items-center justify-between gap-1 pointer-events-none" dir="ltr">
                        <span className="bg-black/80 backdrop-blur-md text-white px-1.5 py-0.5 rounded text-[9px] sm:text-[10px] font-black border border-white/15 uppercase tracking-tight">
                          {shortType}
                        </span>
                        {ratingVal && (
                          <span className="bg-black/80 backdrop-blur-md text-yellow-400 px-1.5 py-0.5 rounded flex items-center gap-0.5 text-[9px] sm:text-[10px] font-black border border-white/15 shadow">
                            <Star size={8} fill="currentColor" /> {ratingVal}
                          </span>
                        )}
                      </div>

                      {/* تدرج سفلي والاسم فوق البوستر */}
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/70 to-transparent pt-8 pb-2 px-2 pointer-events-none flex flex-col justify-end">
                        <h5
                          className={`font-black ${
                            isLargeGrid ? 'text-xs sm:text-sm' : 'text-[10px] sm:text-xs'
                          } text-white group-hover:text-purple-400 transition-colors line-clamp-2 text-center leading-tight drop-shadow`}
                          dir="ltr"
                        >
                          {cleanTitle}
                        </h5>
                      </div>
                    </div>
                  );
                })}
              </div>
              
              {/* زر عرض المزيد */}
              {hasNextPage && (
                <div className="flex justify-center mt-6 pb-4">
                  <button 
                    onClick={() => fetchResults(false)}
                    disabled={loadingMore}
                    className="bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 text-white text-xs font-black py-2.5 px-6 rounded-xl transition flex items-center gap-2 cursor-pointer"
                  >
                    {loadingMore ? <><Loader2 size={15} className="animate-spin" /> جاري التحميل...</> : 'عرض المزيد'}
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-16 m-4 bg-neutral-900/20 rounded-2xl border border-neutral-800/40">
              <Search className="mx-auto text-neutral-600 mb-3" size={36} />
              <h3 className="text-sm font-bold text-neutral-400 mb-1">لم يتم العثور على نتائج</h3>
              <p className="text-xs text-neutral-500">جرب البحث بكلمات أخرى أو تغيير الفلاتر</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
