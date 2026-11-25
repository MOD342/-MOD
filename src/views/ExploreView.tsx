import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Search, Filter, Star, Loader2, ChevronDown, Calendar, Tv, Layers, RefreshCw, AlertCircle, BookOpen, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clientCache } from '../utils/clientCache';
import { cleanAnimeTitle } from '../utils/animeTitleCleaner';
import PullToRefresh from '../components/PullToRefresh';
import { LongPressCopy } from '../components/LongPressCopy';
import { useDeviceDisplay } from '../hooks/useDeviceDisplay';
import {
  GENRE_TAXONOMY,
  resolveGenreTaxonomyItem,
  translateGenreToArabic,
} from '../utils/genreTaxonomy';
import {
  useGlobalLayoutMode,
  LayoutModeToggleButton,
  getLayoutGridClasses,
  getShortTypeCode,
  getArabicSeasonLabel,
  normalizeAnimeStatusAr,
} from '../utils/useViewLayoutMode';
import { FALLBACK_POSTER_DATA_URL } from '../utils/posterFallback';

interface ExploreViewProps {
  onAnimeClick: (id: string) => void;
  onMangaClick?: (id: string) => void;
  initialQuery?: string;
  initialGenre?: string;
  initialMediaKind?: 'anime' | 'manga';
  initialOrigin?: 'ALL' | 'JP' | 'KR' | 'CN';
  onNavigate?: (view: string, props?: any) => void;
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
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full min-h-[40px] bg-neutral-900 border border-neutral-800 hover:border-neutral-700 text-white rounded-xl py-2 px-3 flex items-center justify-between text-xs font-bold transition-colors cursor-pointer"
      >
        <span className="truncate">{selectedOption ? selectedOption.label : 'الكل'}</span>
        <ChevronDown size={14} className={`text-neutral-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            className="absolute top-full mt-1 left-0 right-0 max-h-52 overflow-y-auto bg-neutral-900 border border-neutral-800 rounded-xl shadow-xl shadow-black z-50 hide-scrollbar"
          >
            {options.map((opt: any, idx: number) => (
              <button
                key={`${opt.value || ''}-${idx}`}
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setIsOpen(false);
                }}
                className={`w-full text-right px-3 py-2.5 text-xs font-bold transition-colors cursor-pointer ${
                  value === opt.value
                    ? 'bg-purple-600 text-white'
                    : 'text-neutral-300 hover:bg-neutral-800 hover:text-white'
                }`}
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

function computeInitialFilterState(props: {
  initialQuery?: string;
  initialGenre?: string;
  initialMediaKind?: 'anime' | 'manga';
  initialOrigin?: 'ALL' | 'JP' | 'KR' | 'CN';
}) {
  const kind: 'anime' | 'manga' = props.initialMediaKind === 'manga' ? 'manga' : 'anime';
  const origin: 'ALL' | 'JP' | 'KR' | 'CN' = props.initialOrigin || 'ALL';
  const genreSource = (props.initialGenre || '').trim() || (props.initialQuery || '').trim();
  const matchedGenre = genreSource ? resolveGenreTaxonomyItem(genreSource) : null;

  if (matchedGenre) {
    return {
      kind,
      origin,
      queryText: '',
      animeGenres: kind === 'anime' ? [matchedGenre.mal_id] : [],
      mangaGenres: kind === 'manga' ? [matchedGenre.id] : [],
    };
  }

  return {
    kind,
    origin,
    queryText: (props.initialQuery || '').trim(),
    animeGenres: [] as number[],
    mangaGenres: [] as string[],
  };
}

export default function ExploreView({
  onAnimeClick,
  onMangaClick,
  initialQuery,
  initialGenre,
  initialMediaKind,
  initialOrigin,
  onNavigate,
}: ExploreViewProps) {
  const display = useDeviceDisplay();
  const initialState = useMemo(
    () =>
      computeInitialFilterState({
        initialQuery,
        initialGenre,
        initialMediaKind,
        initialOrigin,
      }),
    [initialQuery, initialGenre, initialMediaKind, initialOrigin],
  );

  const [mediaKind, setMediaKind] = useState<'anime' | 'manga'>(initialState.kind);
  const [mangaOrigin, setMangaOrigin] = useState<'ALL' | 'JP' | 'KR' | 'CN'>(initialState.origin);
  const [query, setQuery] = useState(initialState.queryText);
  const [debouncedQuery, setDebouncedQuery] = useState(initialState.queryText);
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(true);

  const [showFilters, setShowFilters] = useState(false);
  const [genres, setGenres] = useState<{ mal_id: number; name: string; nameAr?: string }[]>(
    () => GENRE_TAXONOMY.map((g) => ({ mal_id: g.mal_id, name: g.name, nameAr: g.nameAr })),
  );
  const [mangaGenres, setMangaGenres] = useState<{ id: string; name: string; nameAr: string }[]>(
    () => GENRE_TAXONOMY.map((g) => ({ id: g.id, name: g.name, nameAr: g.nameAr })),
  );

  const [selectedGenres, setSelectedGenres] = useState<number[]>(initialState.animeGenres);
  const [selectedMangaGenres, setSelectedMangaGenres] = useState<string[]>(initialState.mangaGenres);
  const [minScore, setMinScore] = useState('');
  const [status, setStatus] = useState('');
  const [year, setYear] = useState('');
  const [orderBy, setOrderBy] = useState('');
  const [sortOrder, setSortOrder] = useState('desc');
  const [layoutMode, cycleLayoutMode] = useGlobalLayoutMode();

  const fetchSeqRef = useRef(0);
  const activeAbortRef = useRef<AbortController | null>(null);

  // Sync if user re-enters Explore with a different category or mediaKind
  useEffect(() => {
    setMediaKind(initialState.kind);
    setMangaOrigin(initialState.origin);
    setQuery(initialState.queryText);
    setDebouncedQuery(initialState.queryText);
    setSelectedGenres(initialState.animeGenres);
    setSelectedMangaGenres(initialState.mangaGenres);
  }, [initialState]);

  useEffect(() => {
    clientCache.fetchWithRevalidate<{ mal_id: number; name: string; nameAr?: string }[]>(
      'client_genres_cache_v3',
      '/api/anime/genres',
      (data) => {
        if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object' && data[0]?.mal_id) {
          setGenres(data);
        }
      },
      7 * 24 * 60 * 60 * 1000,
    );
    clientCache.fetchWithRevalidate<{ id: string; name: string; nameAr: string }[]>(
      'client_manga_genres_cache_v2',
      '/api/manga/genres',
      (data) => {
        if (Array.isArray(data) && data.length > 0) {
          setMangaGenres(data);
        }
      },
      7 * 24 * 60 * 60 * 1000,
    );
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 480);
    return () => clearTimeout(timer);
  }, [query]);

  const fetchResults = useCallback(
    async (reset: boolean = false, forceBypass: boolean = false) => {
      const currentPage = reset ? 1 : page + 1;
      let url = '';
      if (mediaKind === 'manga') {
        url = `/api/manga/search?page=${currentPage}&origin=${mangaOrigin}`;
        if (debouncedQuery.trim()) url += `&q=${encodeURIComponent(debouncedQuery.trim())}`;
        if (selectedMangaGenres.length > 0) url += `&genres=${encodeURIComponent(selectedMangaGenres.join(','))}`;
        if (minScore) url += `&min_score=${minScore}`;
        if (status) url += `&status=${encodeURIComponent(status)}`;
        if (year) url += `&year=${year}`;
        if (orderBy) url += `&order_by=${orderBy}`;
        if (sortOrder) url += `&sort=${sortOrder}`;
      } else {
        url = `/api/anime/search?page=${currentPage}`;
        if (debouncedQuery.trim()) url += `&q=${encodeURIComponent(debouncedQuery.trim())}`;
        if (selectedGenres.length > 0) url += `&genres=${selectedGenres.join(',')}`;
        if (minScore) url += `&min_score=${minScore}`;
        if (status) url += `&status=${status}`;
        if (year) url += `&year=${year}`;
        if (orderBy) url += `&order_by=${orderBy}`;
        if (sortOrder) url += `&sort=${sortOrder}`;
      }

      const seqId = ++fetchSeqRef.current;
      if (activeAbortRef.current) {
        activeAbortRef.current.abort();
      }
      const controller = new AbortController();
      activeAbortRef.current = controller;

      const cacheKey = `client_explore_results_v5_${url}`;
      const networkUrl = forceBypass ? `${url}&bypass=true&_t=${Date.now()}` : url;

      if (reset) {
        setFetchError(false);
        if (forceBypass) {
          setRefreshing(true);
        }
        const cached = !forceBypass ? clientCache.get<any>(cacheKey) : null;
        if (cached && Array.isArray(cached.data) && cached.data.length > 0) {
          setResults(cached.data);
          setHasNextPage(cached.hasNextPage ?? false);
          setLoading(false);
          setRefreshing(false);
          setPage(1);
          return;
        }
        if (!forceBypass) {
          setLoading(true);
        }
        setPage(1);
      } else {
        setLoadingMore(true);
      }

      try {
        const res = await fetch(networkUrl, {
          cache: forceBypass ? 'no-store' : undefined,
          signal: controller.signal,
        });
        const data = await res.json();
        if (seqId !== fetchSeqRef.current) return;

        if (data?.success && Array.isArray(data.data)) {
          if (reset) {
            setResults(data.data);
            if (data.data.length > 0) {
              clientCache.set(
                cacheKey,
                {
                  data: data.data,
                  hasNextPage: data.pagination?.has_next_page || false,
                },
                30 * 60 * 1000,
              );
            }
          } else {
            setResults((prev) => {
              const seen = new Set(prev.map((x) => String(x._id)));
              const extra = data.data.filter((x: any) => !seen.has(String(x._id)));
              return [...prev, ...extra];
            });
          }
          setHasNextPage(data.pagination?.has_next_page || false);
          setFetchError(false);
          if (!reset) setPage(currentPage);
        } else if (reset) {
          setResults([]);
          setHasNextPage(false);
          setFetchError(true);
        }
      } catch (err: any) {
        if (err?.name === 'AbortError' || seqId !== fetchSeqRef.current) return;
        console.error(err);
        if (reset) {
          setFetchError(true);
        }
      } finally {
        if (seqId === fetchSeqRef.current) {
          setLoading(false);
          setRefreshing(false);
          setLoadingMore(false);
        }
      }
    },
    [
      mediaKind,
      mangaOrigin,
      debouncedQuery,
      selectedGenres,
      selectedMangaGenres,
      minScore,
      status,
      year,
      orderBy,
      sortOrder,
      page,
    ],
  );

  useEffect(() => {
    void fetchResults(true);
    return () => {
      activeAbortRef.current?.abort();
    };
  }, [mediaKind, mangaOrigin, debouncedQuery, selectedGenres, selectedMangaGenres, minScore, status, year, orderBy, sortOrder]);

  const switchMediaKind = (kind: 'anime' | 'manga') => {
    if (kind === mediaKind) return;
    setMediaKind(kind);
    setStatus('');
    setOrderBy('');
    setYear('');
    setMinScore('');
    setSelectedGenres([]);
    setSelectedMangaGenres([]);
    setResults([]);
    setPage(1);
    setHasNextPage(true);
  };

  const toggleGenre = (id: number) => {
    setSelectedGenres((prev) =>
      prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id],
    );
  };

  const toggleMangaGenre = (id: string) => {
    setSelectedMangaGenres((prev) =>
      prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id],
    );
  };

  const resetAllFilters = () => {
    setQuery('');
    setDebouncedQuery('');
    setSelectedGenres([]);
    setSelectedMangaGenres([]);
    setMangaOrigin('ALL');
    setStatus('');
    setMinScore('');
    setYear('');
    setOrderBy('');
    setSortOrder('desc');
  };

  const activeFiltersCount =
    (mediaKind === 'manga' ? selectedMangaGenres.length : selectedGenres.length) +
    (mediaKind === 'manga' && mangaOrigin !== 'ALL' ? 1 : 0) +
    (status ? 1 : 0) +
    (year ? 1 : 0) +
    (minScore ? 1 : 0) +
    (orderBy ? 1 : 0);

  const isListMode = layoutMode === 'list';
  const isLargeGrid = layoutMode === 'grid2';

  const animeQuickGenres = [
    { id: 1, label: 'أكشن ⚔️' },
    { id: 62, label: 'إيسيكاي 🌌' },
    { id: 10, label: 'فانتازيا 🔮' },
    { id: 2, label: 'مغامرات 🗺️' },
    { id: 4, label: 'كوميدي 🎭' },
    { id: 22, label: 'رومانسي 💕' },
    { id: 36, label: 'شريحة من الحياة 🌸' },
    { id: 24, label: 'خيال علمي 🚀' },
    { id: 30, label: 'رياضي ⚽' },
    { id: 7, label: 'غموض 🔍' },
    { id: 27, label: 'شونين 🔥' },
  ];

  const mangaQuickGenres = [
    { id: 'Action', label: 'أكشن ⚔️' },
    { id: 'Fantasy', label: 'فانتازيا 🔮' },
    { id: 'Isekai', label: 'إيسيكاي 🌌' },
    { id: 'Romance', label: 'رومانسي 💕' },
    { id: 'Drama', label: 'دراما 🎬' },
    { id: 'Comedy', label: 'كوميدي 🎭' },
    { id: 'Mystery', label: 'غموض 🔍' },
    { id: 'Psychological', label: 'نفسي 🧠' },
  ];

  return (
    <PullToRefresh onRefresh={() => fetchResults(true, true)}>
      <div className="min-h-screen bg-black text-white pb-24" dir="rtl">
        <div className="max-w-7xl mx-auto">
          {/* شريط العنوان والبحث العلوي */}
          <div className="bg-black border-b border-white/5 px-3.5 md:px-5 py-3 space-y-2.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h1 className={`font-black ${display.isCoverScreen ? 'text-sm' : 'text-base md:text-lg'} text-white`}>
                {mediaKind === 'manga' ? 'استكشف المانجا والمانهوا' : 'استكشف الأنمي'}
              </h1>

              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center bg-neutral-900 border border-neutral-800 rounded-xl p-0.5">
                  <button
                    type="button"
                    onClick={() => switchMediaKind('anime')}
                    className={`min-h-[38px] px-3 rounded-lg text-xs font-black transition cursor-pointer flex items-center gap-1.5 ${
                      mediaKind === 'anime' ? 'bg-purple-600 text-white shadow' : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    <Tv size={13} />
                    <span>الأنمي</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => switchMediaKind('manga')}
                    className={`min-h-[38px] px-3 rounded-lg text-xs font-black transition cursor-pointer flex items-center gap-1.5 ${
                      mediaKind === 'manga' ? 'bg-amber-500 text-black shadow' : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    <BookOpen size={13} />
                    <span>{display.isCoverScreen ? 'مانجا' : 'مانجا ومانهوا'}</span>
                  </button>
                </div>
                <LayoutModeToggleButton mode={layoutMode} onToggle={cycleLayoutMode} />
              </div>
            </div>

            <div className="flex gap-2 items-center">
              <div className="relative flex-1">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none" size={16} />
                <input
                  type="text"
                  placeholder={mediaKind === 'manga' ? 'ابحث باسم المانجا أو المانهوا...' : 'ابحث باسم الأنمي (عربي أو إنجليزي)...'}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="w-full min-h-[44px] bg-neutral-900 border border-neutral-800 text-white rounded-xl py-2 pr-9 pl-9 focus:outline-none focus:border-purple-500/60 text-xs sm:text-sm transition"
                />
                {query.trim().length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery('');
                      setDebouncedQuery('');
                    }}
                    aria-label="مسح نص البحث"
                    className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white flex items-center justify-center transition cursor-pointer"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => setShowFilters(!showFilters)}
                aria-label="فلاتر البحث والتصنيفات"
                className={`min-w-[44px] min-h-[44px] px-3 rounded-xl transition-all border cursor-pointer flex items-center justify-center gap-1.5 relative ${
                  showFilters || activeFiltersCount > 0
                    ? mediaKind === 'manga'
                      ? 'bg-amber-500 border-amber-400 text-black shadow-lg'
                      : 'bg-purple-600 border-purple-500 text-white shadow-lg'
                    : 'bg-neutral-900 border-neutral-800 text-neutral-300 hover:text-white'
                }`}
                title="فلاتر البحث"
              >
                <Filter size={16} />
                {activeFiltersCount > 0 && (
                  <span className="text-[11px] font-black tabular-nums">{activeFiltersCount}</span>
                )}
              </button>
            </div>

            {/* شرائح الفلترة والتصنيفات السريعة */}
            {mediaKind === 'manga' ? (
              <div className="flex items-center gap-1.5 overflow-x-auto hide-scrollbar pb-0.5 pt-0.5">
                {(
                  [
                    { id: 'ALL', label: 'الكل' },
                    { id: 'JP', label: 'مانجا يابانية' },
                    { id: 'KR', label: 'مانهوا كورية' },
                    { id: 'CN', label: 'مانها صينية' },
                  ] as const
                ).map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setMangaOrigin(o.id)}
                    className={`min-h-[36px] px-3 py-1 rounded-xl text-[11px] font-bold transition whitespace-nowrap cursor-pointer ${
                      mangaOrigin === o.id
                        ? 'bg-amber-500 text-black shadow'
                        : 'bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white'
                    }`}
                  >
                    {o.label}
                  </button>
                ))}

                <button
                  type="button"
                  onClick={() => {
                    setOrderBy(orderBy === 'score' ? '' : 'score');
                    setSortOrder('desc');
                  }}
                  className={`min-h-[36px] px-3 py-1 rounded-xl text-[11px] font-bold transition whitespace-nowrap cursor-pointer ${
                    orderBy === 'score'
                      ? 'bg-purple-600 text-white shadow'
                      : 'bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white'
                  }`}
                >
                  أعلى تقييم ⭐
                </button>

                <button
                  type="button"
                  onClick={() => setStatus(status === 'RELEASING' ? '' : 'RELEASING')}
                  className={`min-h-[36px] px-3 py-1 rounded-xl text-[11px] font-bold transition whitespace-nowrap cursor-pointer ${
                    status === 'RELEASING'
                      ? 'bg-purple-600 text-white shadow'
                      : 'bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white'
                  }`}
                >
                  مستمر 🔴
                </button>

                {mangaQuickGenres.map((qg) => (
                  <button
                    key={qg.id}
                    type="button"
                    onClick={() => toggleMangaGenre(qg.id)}
                    className={`min-h-[36px] px-3 py-1 rounded-xl text-[11px] font-bold transition whitespace-nowrap cursor-pointer ${
                      selectedMangaGenres.includes(qg.id)
                        ? 'bg-amber-500 text-black shadow'
                        : 'bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white'
                    }`}
                  >
                    {qg.label}
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-1.5 overflow-x-auto hide-scrollbar pb-0.5 pt-0.5">
                {onNavigate && (
                  <>
                    <button
                      type="button"
                      onClick={() => onNavigate('top_anime')}
                      className="min-h-[36px] px-3 py-1 rounded-xl text-[11px] font-black transition whitespace-nowrap cursor-pointer bg-amber-500/15 border border-amber-500/30 text-amber-300 hover:bg-amber-500/25"
                    >
                      أفضل الأنميات
                    </button>
                    <button
                      type="button"
                      onClick={() => onNavigate('anime_movies')}
                      className="min-h-[36px] px-3 py-1 rounded-xl text-[11px] font-black transition whitespace-nowrap cursor-pointer bg-rose-500/15 border border-rose-500/30 text-rose-300 hover:bg-rose-500/25"
                    >
                      أفلام الأنمي
                    </button>
                  </>
                )}

                <button
                  type="button"
                  onClick={resetAllFilters}
                  className={`min-h-[36px] px-3 py-1 rounded-xl text-[11px] font-bold transition whitespace-nowrap cursor-pointer ${
                    !query && selectedGenres.length === 0 && !minScore && !status && !year && !orderBy
                      ? 'bg-purple-600 text-white shadow'
                      : 'bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white'
                  }`}
                >
                  الكل
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setOrderBy(orderBy === 'score' ? '' : 'score');
                    setSortOrder('desc');
                  }}
                  className={`min-h-[36px] px-3 py-1 rounded-xl text-[11px] font-bold transition whitespace-nowrap cursor-pointer ${
                    orderBy === 'score'
                      ? 'bg-purple-600 text-white shadow'
                      : 'bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white'
                  }`}
                >
                  أعلى تقييم ⭐
                </button>

                <button
                  type="button"
                  onClick={() => setStatus(status === 'airing' ? '' : 'airing')}
                  className={`min-h-[36px] px-3 py-1 rounded-xl text-[11px] font-bold transition whitespace-nowrap cursor-pointer ${
                    status === 'airing'
                      ? 'bg-purple-600 text-white shadow'
                      : 'bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white'
                  }`}
                >
                  يعرض حالياً 🔴
                </button>

                {animeQuickGenres.map((qg) => (
                  <button
                    key={qg.id}
                    type="button"
                    onClick={() => toggleGenre(qg.id)}
                    className={`min-h-[36px] px-3 py-1 rounded-xl text-[11px] font-bold transition whitespace-nowrap cursor-pointer ${
                      selectedGenres.includes(qg.id)
                        ? 'bg-purple-600 text-white shadow'
                        : 'bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white'
                    }`}
                  >
                    {qg.label}
                  </button>
                ))}
              </div>
            )}

            {/* شريط عرض الفلاتر النشطة لوضوح التصفية عند إغلاق القائمة المتقدمة */}
            {activeFiltersCount > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px]">
                {mediaKind === 'anime' &&
                  selectedGenres.map((gid) => {
                    const gObj = genres.find((g) => g.mal_id === gid);
                    const label = gObj?.nameAr || translateGenreToArabic(gObj?.name || String(gid));
                    return (
                      <button
                        key={`act-ag-${gid}`}
                        type="button"
                        onClick={() => toggleGenre(gid)}
                        className="min-h-[30px] inline-flex items-center gap-1 bg-purple-600/20 border border-purple-500/40 text-purple-200 px-2.5 py-0.5 rounded-lg font-bold cursor-pointer hover:bg-purple-600/35 transition"
                      >
                        <span>{label}</span>
                        <X size={11} />
                      </button>
                    );
                  })}

                {mediaKind === 'manga' &&
                  selectedMangaGenres.map((gid) => {
                    const gObj = mangaGenres.find((g) => g.id === gid);
                    const label = gObj?.nameAr || translateGenreToArabic(gid);
                    return (
                      <button
                        key={`act-mg-${gid}`}
                        type="button"
                        onClick={() => toggleMangaGenre(gid)}
                        className="min-h-[30px] inline-flex items-center gap-1 bg-amber-500/20 border border-amber-500/40 text-amber-200 px-2.5 py-0.5 rounded-lg font-bold cursor-pointer hover:bg-amber-500/35 transition"
                      >
                        <span>{label}</span>
                        <X size={11} />
                      </button>
                    );
                  })}

                {year && (
                  <button
                    type="button"
                    onClick={() => setYear('')}
                    className="min-h-[30px] inline-flex items-center gap-1 bg-neutral-900 border border-neutral-700 text-neutral-200 px-2.5 py-0.5 rounded-lg font-bold cursor-pointer tabular-nums"
                  >
                    <span>سنة {year}</span>
                    <X size={11} />
                  </button>
                )}

                {minScore && (
                  <button
                    type="button"
                    onClick={() => setMinScore('')}
                    className="min-h-[30px] inline-flex items-center gap-1 bg-neutral-900 border border-neutral-700 text-yellow-300 px-2.5 py-0.5 rounded-lg font-bold cursor-pointer tabular-nums"
                  >
                    <span>تقييم {minScore}+</span>
                    <X size={11} />
                  </button>
                )}

                <button
                  type="button"
                  onClick={resetAllFilters}
                  className="min-h-[30px] px-2.5 py-0.5 rounded-lg text-rose-400 hover:text-rose-300 font-black cursor-pointer"
                >
                  مسح الفلاتر
                </button>
              </div>
            )}

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
                      <h3 className="text-[11px] font-bold text-neutral-400 mb-2">جميع التصنيفات</h3>
                      <div className="flex flex-wrap gap-1.5 max-h-44 overflow-y-auto hide-scrollbar">
                        {mediaKind === 'manga'
                          ? mangaGenres.map((g, idx) => (
                              <button
                                key={`mgenre-${g.id}-${idx}`}
                                type="button"
                                onClick={() => toggleMangaGenre(g.id)}
                                className={`min-h-[34px] px-3 py-1 rounded-xl text-[11px] font-bold transition-all cursor-pointer ${
                                  selectedMangaGenres.includes(g.id)
                                    ? 'bg-amber-500 text-black shadow'
                                    : 'bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white'
                                }`}
                              >
                                {g.nameAr || translateGenreToArabic(g.name, true)}
                              </button>
                            ))
                          : genres.map((g, idx) => (
                              <button
                                key={`genre-${g?.mal_id || idx}-${idx}`}
                                type="button"
                                onClick={() => toggleGenre(g.mal_id)}
                                className={`min-h-[34px] px-3 py-1 rounded-xl text-[11px] font-bold transition-all cursor-pointer ${
                                  selectedGenres.includes(g.mal_id)
                                    ? 'bg-purple-600 text-white shadow'
                                    : 'bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white'
                                }`}
                              >
                                {g.nameAr || translateGenreToArabic(g.name, true)}
                              </button>
                            ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5 relative z-40">
                      <CustomSelect
                        label="ترتيب حسب"
                        value={orderBy}
                        onChange={setOrderBy}
                        options={[
                          { label: 'تلقائي', value: '' },
                          { label: 'التقييم', value: 'score' },
                          { label: 'الشعبية', value: 'popularity' },
                          { label: 'الأحدث إصداراً', value: 'start_date' },
                          { label: 'الأبجدية', value: 'title' },
                        ]}
                      />

                      <CustomSelect
                        label="نوع الترتيب"
                        value={sortOrder}
                        onChange={setSortOrder}
                        options={[
                          { label: 'تنازلي', value: 'desc' },
                          { label: 'تصاعدي', value: 'asc' },
                        ]}
                      />

                      <CustomSelect
                        label="الحد الأدنى للتقييم"
                        value={minScore}
                        onChange={setMinScore}
                        options={[
                          { label: 'الكل', value: '' },
                          { label: '8.5+ ⭐ ممتاز', value: '8.5' },
                          { label: '8.0+ ⭐ رائع', value: '8' },
                          { label: '7.0+ ⭐ جيد جداً', value: '7' },
                          { label: '6.0+ ⭐ مقبول', value: '6' },
                        ]}
                      />

                      <CustomSelect
                        label="سنة الإصدار"
                        value={year}
                        onChange={setYear}
                        options={[
                          { label: 'الكل', value: '' },
                          ...Array.from(
                            { length: new Date().getFullYear() - 1980 + 1 },
                            (_, i) => new Date().getFullYear() - i,
                          ).map((y) => ({ label: String(y), value: String(y) })),
                        ]}
                      />

                      <CustomSelect
                        label="الحالة"
                        value={status}
                        onChange={setStatus}
                        options={
                          mediaKind === 'manga'
                            ? [
                                { label: 'الكل', value: '' },
                                { label: 'مستمر', value: 'RELEASING' },
                                { label: 'مكتمل', value: 'FINISHED' },
                                { label: 'متوقف', value: 'HIATUS' },
                              ]
                            : [
                                { label: 'الكل', value: '' },
                                { label: 'مستمر', value: 'airing' },
                                { label: 'مكتمل', value: 'complete' },
                                { label: 'قادم', value: 'upcoming' },
                              ]
                        }
                      />
                    </div>

                    <div className="flex justify-end pt-1">
                      <button
                        type="button"
                        onClick={resetAllFilters}
                        className="min-h-[36px] text-[11px] font-bold text-neutral-300 hover:text-white transition px-4 py-1.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 cursor-pointer"
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
                    const isManga = mediaKind === 'manga' || anime.mediaType === 'manga';
                    const cleanTitle = cleanAnimeTitle(anime.title || anime.titleAr || 'Anime');
                    const ratingVal =
                      anime.rating && anime.rating !== 'N/A' && Number(anime.rating) > 0
                        ? Number(anime.rating).toFixed(1)
                        : null;
                    const shortType = isManga
                      ? anime.originLabel || 'مانجا'
                      : getShortTypeCode(anime.type || 'TV');
                    const seasonLabel = isManga
                      ? anime.releaseYear
                        ? `عام ${anime.releaseYear}`
                        : ''
                      : getArabicSeasonLabel(anime.season, anime.releaseYear || anime.year);
                    const statusInfo = normalizeAnimeStatusAr(anime.status);
                    const unitsTotal = isManga
                      ? anime.chaptersCount || null
                      : anime.episodesCount || anime.totalEpisodes || null;
                    const genresList = Array.isArray(anime.genres)
                      ? anime.genres.slice(0, 3).map((g: string) => translateGenreToArabic(g))
                      : [];
                    const handleItemClick = () => {
                      if (isManga) {
                        if (onMangaClick) onMangaClick(String(anime._id));
                        else onNavigate?.('manga_details');
                      } else {
                        onAnimeClick(anime._id);
                      }
                    };

                    if (isListMode) {
                      return (
                        <div
                          key={`search-${anime._id}-${idx}`}
                          onClick={handleItemClick}
                          onMouseEnter={() => {
                            if (!isManga) clientCache.prefetchDetails(anime._id);
                          }}
                          className="cursor-pointer group flex items-stretch bg-neutral-900/95 border border-neutral-800/90 hover:border-purple-500/60 rounded-xl transition-all overflow-hidden shadow-md min-h-[124px] sm:min-h-[132px]"
                        >
                          <div className="w-24 sm:w-28 shrink-0 bg-neutral-950 relative border-l border-white/10 overflow-hidden">
                            <img
                              src={anime.posterUrl || FALLBACK_POSTER_DATA_URL}
                              alt={cleanTitle}
                              loading="lazy"
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                if (e.currentTarget.src !== FALLBACK_POSTER_DATA_URL) {
                                  e.currentTarget.src = FALLBACK_POSTER_DATA_URL;
                                }
                              }}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                          </div>

                          <div className="flex-1 min-w-0 flex flex-col justify-center items-start text-right gap-1.5 p-2.5 sm:p-3">
                            <h5
                              className="w-full font-black text-sm sm:text-base text-white group-hover:text-purple-400 transition-colors line-clamp-1 leading-snug text-right"
                              dir="auto"
                            >
                              <LongPressCopy text={cleanTitle}>{cleanTitle}</LongPressCopy>
                            </h5>

                            <div className="flex flex-wrap items-center justify-start gap-1.5 text-[10px] sm:text-xs font-bold">
                              {ratingVal && (
                                <span
                                  className="bg-yellow-500/15 border border-yellow-500/30 text-yellow-400 px-2 py-0.5 rounded-lg flex items-center gap-1 tabular-nums"
                                  dir="ltr"
                                >
                                  <Star size={10} fill="currentColor" /> {ratingVal}
                                </span>
                              )}
                              <span className="bg-neutral-800 text-neutral-200 px-2 py-0.5 rounded-lg flex items-center gap-1">
                                {isManga ? (
                                  <BookOpen size={10} className="text-amber-400" />
                                ) : (
                                  <Tv size={10} className="text-neutral-400" />
                                )}
                                <span>{shortType}</span>
                              </span>
                              {statusInfo && (
                                <span className={`border px-2 py-0.5 rounded-lg ${statusInfo.colorClass}`}>
                                  {statusInfo.label}
                                </span>
                              )}
                              {seasonLabel && (
                                <span className="flex items-center gap-1 bg-neutral-950/90 border border-white/10 text-neutral-300 px-2 py-0.5 rounded-lg tabular-nums">
                                  <Calendar size={10} className="text-neutral-400" />
                                  <span>{seasonLabel}</span>
                                </span>
                              )}
                              {unitsTotal ? (
                                <span className="flex items-center gap-1 bg-neutral-950/90 border border-white/10 text-neutral-300 px-2 py-0.5 rounded-lg tabular-nums">
                                  <Layers size={10} className="text-neutral-400" />
                                  <span>
                                    {unitsTotal} {isManga ? 'فصل' : 'حلقة'}
                                  </span>
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

                    return (
                      <div
                        key={`search-${anime._id}-${idx}`}
                        onClick={handleItemClick}
                        onMouseEnter={() => {
                          if (!isManga) clientCache.prefetchDetails(anime._id);
                        }}
                        className="theme-keep-dark cursor-pointer group relative aspect-[3/4] overflow-hidden bg-neutral-950 border-b border-l border-white/10"
                      >
                        <img
                          src={anime.posterUrl || FALLBACK_POSTER_DATA_URL}
                          alt={cleanTitle}
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            if (e.currentTarget.src !== FALLBACK_POSTER_DATA_URL) {
                              e.currentTarget.src = FALLBACK_POSTER_DATA_URL;
                            }
                          }}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />

                        <div
                          className="absolute top-1.5 inset-x-1.5 z-10 flex items-center justify-between gap-1 pointer-events-none"
                          dir="ltr"
                        >
                          <span className="bg-black/80 backdrop-blur-md text-white px-1.5 py-0.5 rounded text-[9px] sm:text-[10px] font-black border border-white/15 uppercase tracking-tight">
                            {shortType}
                          </span>
                          {ratingVal && (
                            <span className="bg-black/80 backdrop-blur-md text-yellow-400 px-1.5 py-0.5 rounded flex items-center gap-0.5 text-[9px] sm:text-[10px] font-black border border-white/15 shadow tabular-nums">
                              <Star size={8} fill="currentColor" /> {ratingVal}
                            </span>
                          )}
                        </div>

                        <div
                          className="absolute inset-x-0 bottom-0 pt-5 pb-2 px-2 bg-gradient-to-t from-black/85 via-black/45 to-transparent pointer-events-none flex flex-col justify-end"
                          style={{ textShadow: '0 2px 6px rgba(0,0,0,0.98), 0 0 3px rgba(0,0,0,0.95)' }}
                        >
                          <h5
                            className={`pointer-events-auto font-black ${
                              isLargeGrid ? 'text-xs sm:text-sm' : 'text-[10px] sm:text-xs'
                            } text-white group-hover:text-purple-400 transition-colors line-clamp-2 text-center leading-tight`}
                            dir="auto"
                          >
                            <LongPressCopy text={cleanTitle}>{cleanTitle}</LongPressCopy>
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
                      type="button"
                      onClick={() => fetchResults(false)}
                      disabled={loadingMore}
                      className="min-h-[44px] bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 text-white text-xs font-black py-2.5 px-6 rounded-xl transition flex items-center gap-2 cursor-pointer"
                    >
                      {loadingMore ? (
                        <>
                          <Loader2 size={15} className="animate-spin" /> جاري التحميل...
                        </>
                      ) : (
                        'عرض المزيد'
                      )}
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-16 m-4 bg-neutral-900/20 rounded-2xl border border-neutral-800/40 space-y-3">
                {fetchError ? (
                  <AlertCircle className="mx-auto text-rose-500" size={36} />
                ) : (
                  <Search className="mx-auto text-neutral-600" size={36} />
                )}
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-neutral-300">
                    {fetchError ? 'تعذر جلب البيانات من الخادم' : 'لم يتم العثور على نتائج'}
                  </h3>
                  <p className="text-xs text-neutral-500">
                    {fetchError
                      ? 'تحقق من اتصالك بالإنترنت ثم أعد المحاولة'
                      : 'جرب البحث بكلمات أخرى أو تغيير التصنيفات والفلاتر'}
                  </p>
                </div>
                {fetchError ? (
                  <button
                    type="button"
                    onClick={() => fetchResults(true, true)}
                    className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-black transition active:scale-95 cursor-pointer"
                  >
                    <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
                    <span>إعادة المحاولة</span>
                  </button>
                ) : (
                  activeFiltersCount > 0 && (
                    <button
                      type="button"
                      onClick={resetAllFilters}
                      className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-200 text-xs font-black transition cursor-pointer"
                    >
                      <span>إعادة ضبط الفلاتر</span>
                    </button>
                  )
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </PullToRefresh>
  );
}
