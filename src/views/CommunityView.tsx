import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Crown,
  Sparkles,
  Users,
  Shuffle,
  Star,
  Flame,
  Heart,
  Play,
  Gamepad2,
  Trophy,
  Search,
  Loader2,
  X,
  Calendar,
  Layers,
  Mic,
  Compass,
  Award,
  Zap,
  Brain,
  Smile,
  Clock,
  Ghost,
} from 'lucide-react';
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

interface CommunityViewProps {
  onAnimeClick?: (id: string) => void;
  onNavigate?: (viewName: string, props?: any) => void;
  onUserClick?: (userId: string) => void;
  focusCommentId?: string;
}

const GENRE_TRANSLATIONS: Record<string, string> = {
  Action: 'أكشن',
  Adventure: 'مغامرات',
  Comedy: 'كوميديا',
  Drama: 'دراما',
  Fantasy: 'فانتازيا',
  Horror: 'رعب',
  Mystery: 'غموض',
  Romance: 'رومانسية',
  'Sci-Fi': 'خيال علمي',
  'Slice of Life': 'شريحة من الحياة',
  Sports: 'رياضة',
  Supernatural: 'خارق للطبيعة',
  Suspense: 'إثارة',
  Psychological: 'نفسي',
  Thriller: 'تشويق',
  Historical: 'تاريخي',
  Mecha: 'ميكا',
  School: 'مدرسي',
};

const MOOD_PRESETS = [
  {
    id: 'adrenaline',
    title: 'أكشن وحماس مشتعل',
    subtitle: 'معارك ملحمية وقدرات خارقة ترفع الأدرينالين',
    icon: Flame,
    genreId: '1',
    minScore: '8',
    accent: 'from-rose-500/20 to-orange-500/10 border-rose-500/30 text-rose-400',
    badgeBg: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
  },
  {
    id: 'mindgames',
    title: 'غموض وتلاعب نفسي',
    subtitle: 'حبكات معقدة وألغاز ذكية تحبس الأنفاس',
    icon: Brain,
    genreId: '7',
    minScore: '8',
    accent: 'from-purple-500/20 to-indigo-500/10 border-purple-500/30 text-purple-400',
    badgeBg: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  },
  {
    id: 'fantasy_worlds',
    title: 'عوالم خيالية وسحر',
    subtitle: 'رحلات أسطورية في عوالم موازية وممالك غامضة',
    icon: Sparkles,
    genreId: '10',
    minScore: '7.5',
    accent: 'from-cyan-500/20 to-blue-500/10 border-cyan-500/30 text-cyan-400',
    badgeBg: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
  },
  {
    id: 'emotional',
    title: 'دراما ومشاعر عميقة',
    subtitle: 'قصص إنسانية مؤثرة تترك أثراً لا يُنسى',
    icon: Heart,
    genreId: '8',
    minScore: '8',
    accent: 'from-pink-500/20 to-rose-500/10 border-pink-500/30 text-pink-400',
    badgeBg: 'bg-pink-500/15 text-pink-400 border-pink-500/30',
  },
  {
    id: 'laughter',
    title: 'كوميديا تبهج القلب',
    subtitle: 'مواقف طريفة وشخصيات مرحة لتغيير المزاج',
    icon: Smile,
    genreId: '4',
    minScore: '7.5',
    accent: 'from-amber-500/20 to-yellow-500/10 border-amber-500/30 text-amber-400',
    badgeBg: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  },
  {
    id: 'supernatural',
    title: 'خوارق وأسرار مظلمة',
    subtitle: 'أرواح ولعنات وقوى تتجاوز حدود الطبيعة',
    icon: Ghost,
    genreId: '37',
    minScore: '7.5',
    accent: 'from-emerald-500/20 to-teal-500/10 border-emerald-500/30 text-emerald-400',
    badgeBg: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  },
];

export default function CommunityView({ onAnimeClick, onNavigate }: CommunityViewProps) {
  const [layoutMode, cycleLayoutMode] = useGlobalLayoutMode();
  const isListMode = layoutMode === 'list';

  const [activeTab, setActiveTab] = useState<'discover' | 'hall_of_fame' | 'characters'>('discover');

  // --- Tab 1: Smart Discovery & Mood Randomizer ---
  const [selectedMood, setSelectedMood] = useState<string>('adrenaline');
  const [moodAnimeList, setMoodAnimeList] = useState<any[]>([]);
  const [loadingMood, setLoadingMood] = useState<boolean>(true);
  const [spotlightAnime, setSpotlightAnime] = useState<any | null>(null);
  const [spinningRoulette, setSpinningRoulette] = useState<boolean>(false);

  // --- Tab 2: Hall of Fame (Top All-Time / Most Popular / Top Airing) ---
  const [fameFilter, setFameFilter] = useState<'score' | 'popularity' | 'airing'>('score');
  const [fameAnimeList, setFameAnimeList] = useState<any[]>([]);
  const [loadingFame, setLoadingFame] = useState<boolean>(false);

  // --- Tab 3: Legendary Characters ---
  const [charactersList, setCharactersList] = useState<any[]>([]);
  const [loadingCharacters, setLoadingCharacters] = useState<boolean>(false);
  const [characterSearch, setCharacterSearch] = useState<string>('');
  const [debouncedCharSearch, setDebouncedCharSearch] = useState<string>('');
  const [selectedCharacter, setSelectedCharacter] = useState<any | null>(null);

  // Debounce character search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedCharSearch(characterSearch.trim());
    }, 400);
    return () => clearTimeout(timer);
  }, [characterSearch]);

  // Fetch Mood Anime
  useEffect(() => {
    if (activeTab !== 'discover') return;
    const preset = MOOD_PRESETS.find((m) => m.id === selectedMood) || MOOD_PRESETS[0];
    const cacheKey = `elite_mood_v2_${preset.id}`;

    const cached = clientCache.get<any[]>(cacheKey);
    if (cached && cached.length > 0) {
      setMoodAnimeList(cached);
      if (!spotlightAnime) {
        setSpotlightAnime(cached[Math.floor(Math.random() * cached.length)]);
      }
      setLoadingMood(false);
      return;
    }

    setLoadingMood(true);
    fetch(
      `/api/anime/search?genres=${preset.genreId}&min_score=${preset.minScore}&order_by=score&sort=desc&page=1`
    )
      .then((res) => res.json())
      .then((res) => {
        if (res.success && Array.isArray(res.data) && res.data.length > 0) {
          clientCache.set(cacheKey, res.data, 10 * 60 * 1000);
          setMoodAnimeList(res.data);
          setSpotlightAnime(res.data[Math.floor(Math.random() * res.data.length)]);
        }
      })
      .catch((err) => console.error('Mood fetch error:', err))
      .finally(() => setLoadingMood(false));
  }, [selectedMood, activeTab]);

  // Spin Roulette Pick
  const handleSpinRandomPick = () => {
    if (moodAnimeList.length === 0) return;
    setSpinningRoulette(true);
    setTimeout(() => {
      const candidates = moodAnimeList.filter((a) => a._id !== spotlightAnime?._id);
      const pool = candidates.length > 0 ? candidates : moodAnimeList;
      const randomItem = pool[Math.floor(Math.random() * pool.length)];
      setSpotlightAnime(randomItem);
      setSpinningRoulette(false);
    }, 350);
  };

  // Fetch Hall of Fame Anime
  useEffect(() => {
    if (activeTab !== 'hall_of_fame') return;
    const cacheKey = `elite_fame_v2_${fameFilter}`;

    const cached = clientCache.get<any[]>(cacheKey);
    if (cached && cached.length > 0) {
      setFameAnimeList(cached);
      setLoadingFame(false);
      return;
    }

    setLoadingFame(true);
    let url = `/api/anime/search?order_by=score&sort=desc&page=1`;
    if (fameFilter === 'popularity') {
      url = `/api/anime/search?order_by=popularity&sort=asc&page=1`;
    } else if (fameFilter === 'airing') {
      url = `/api/anime/search?status=airing&order_by=score&sort=desc&page=1`;
    }

    fetch(url)
      .then((res) => res.json())
      .then((res) => {
        if (res.success && Array.isArray(res.data)) {
          clientCache.set(cacheKey, res.data, 15 * 60 * 1000);
          setFameAnimeList(res.data);
        }
      })
      .catch((err) => console.error('Hall of fame error:', err))
      .finally(() => setLoadingFame(false));
  }, [activeTab, fameFilter]);

  // Fetch Legendary Characters
  useEffect(() => {
    if (activeTab !== 'characters') return;
    const cacheKey = `elite_chars_v2_${debouncedCharSearch || 'all'}`;

    const cached = clientCache.get<any[]>(cacheKey);
    if (cached && cached.length > 0) {
      setCharactersList(cached);
      setLoadingCharacters(false);
      return;
    }

    setLoadingCharacters(true);
    const url = debouncedCharSearch
      ? `/api/anime/characters?q=${encodeURIComponent(debouncedCharSearch)}&page=1`
      : `/api/anime/characters?page=1`;

    fetch(url)
      .then((res) => res.json())
      .then((res) => {
        if (res.success && Array.isArray(res.data)) {
          clientCache.set(cacheKey, res.data, 15 * 60 * 1000);
          setCharactersList(res.data);
        }
      })
      .catch((err) => console.error('Characters fetch error:', err))
      .finally(() => setLoadingCharacters(false));
  }, [activeTab, debouncedCharSearch]);

  const activeMoodPreset = useMemo(
    () => MOOD_PRESETS.find((m) => m.id === selectedMood) || MOOD_PRESETS[0],
    [selectedMood]
  );

  // Unified Anime Card Renderer (supports List Mode & Zero-Gap Grid Modes + optional Rank Badge)
  const renderAnimeCard = (anime: any, idx: number, showRankBadge: boolean = false) => {
    const cleanTitle = cleanAnimeTitle(anime.title);
    const typeCode = getShortTypeCode(anime.type);
    const ratingVal =
      anime.rating && Number(anime.rating) > 0 ? Number(anime.rating).toFixed(1) : '';
    const seasonLabel = getArabicSeasonLabel(anime.season, anime.releaseYear || anime.year);
    const statusInfo = normalizeAnimeStatusAr(anime.status);
    const rankNum = idx + 1;

    const getRankBadgeStyle = (rank: number) => {
      if (rank === 1)
        return 'bg-gradient-to-br from-amber-300 via-yellow-500 to-amber-600 text-black border-amber-200 shadow-[0_0_12px_rgba(245,158,11,0.5)]';
      if (rank === 2)
        return 'bg-gradient-to-br from-slate-200 via-slate-300 to-slate-400 text-black border-white shadow-[0_0_10px_rgba(203,213,225,0.4)]';
      if (rank === 3)
        return 'bg-gradient-to-br from-amber-600 via-orange-700 to-amber-800 text-white border-amber-400/50 shadow-[0_0_10px_rgba(180,83,9,0.4)]';
      return 'bg-black/80 text-neutral-200 border-white/15';
    };

    if (isListMode) {
      return (
        <div
          key={`${anime._id}-${idx}`}
          onClick={() => onAnimeClick && onAnimeClick(String(anime._id))}
          className="cursor-pointer group flex items-stretch bg-[#111216] hover:bg-[#171920] border border-white/5 hover:border-purple-500/30 rounded-2xl overflow-hidden transition-all shadow-md"
        >
          <div className="w-28 sm:w-32 shrink-0 relative overflow-hidden bg-neutral-900 self-stretch">
            <img
              src={anime.posterUrl}
              alt={cleanTitle}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              loading="lazy"
              referrerPolicy="no-referrer"
            />
            {showRankBadge && (
              <span
                className={`absolute top-1.5 right-1.5 min-w-[24px] h-6 px-1.5 rounded-lg text-[10px] font-black flex items-center justify-center border ${getRankBadgeStyle(
                  rankNum
                )}`}
              >
                #{rankNum}
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0 p-3 flex flex-col justify-between text-right">
            <h3
              className="text-sm sm:text-base font-black text-white group-hover:text-purple-400 transition-colors line-clamp-2 leading-snug text-right"
              dir="auto"
            >
              {cleanTitle}
            </h3>

            <div className="flex flex-wrap items-center justify-start gap-1.5 mt-2">
              <span className="bg-purple-600/20 text-purple-400 border border-purple-500/30 text-[10px] font-black px-2 py-0.5 rounded-md flex items-center gap-1">
                {typeCode}
              </span>
              {ratingVal && (
                <span className="bg-yellow-500/15 text-yellow-400 border border-yellow-500/25 text-[10px] font-black px-2 py-0.5 rounded-md flex items-center gap-1">
                  <Star size={10} className="fill-yellow-400" />
                  {ratingVal}
                </span>
              )}
              {seasonLabel && (
                <span className="bg-white/5 text-neutral-300 border border-white/10 text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1">
                  <Calendar size={10} className="text-blue-400" />
                  {seasonLabel}
                </span>
              )}
              {anime.episodesCount ? (
                <span className="bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1">
                  <Layers size={10} />
                  {anime.episodesCount} حلقة
                </span>
              ) : null}
              {statusInfo && (
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${statusInfo.colorClass}`}
                >
                  {statusInfo.label}
                </span>
              )}
            </div>

            {anime.genres && anime.genres.length > 0 && (
              <div className="flex flex-wrap items-center justify-start gap-1 mt-2">
                {anime.genres.slice(0, 3).map((g: string, gi: number) => (
                  <span
                    key={gi}
                    className="text-[10px] font-bold text-neutral-400 bg-black/40 px-2 py-0.5 rounded border border-white/5"
                  >
                    {GENRE_TRANSLATIONS[g] || g}
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
        key={`${anime._id}-${idx}`}
        onClick={() => onAnimeClick && onAnimeClick(String(anime._id))}
        className="cursor-pointer group relative aspect-[2/3] w-full overflow-hidden bg-neutral-900 border-[0.5px] border-black/40"
      >
        <img
          src={anime.posterUrl}
          alt={cleanTitle}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          loading="lazy"
          referrerPolicy="no-referrer"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/30 to-transparent" />

        <div
          className="absolute top-1.5 inset-x-1.5 flex items-center justify-between pointer-events-none"
          dir="ltr"
        >
          <div className="flex items-center gap-1">
            {showRankBadge && (
              <span
                className={`px-1.5 py-0.5 rounded text-[9px] font-black border leading-none ${getRankBadgeStyle(
                  rankNum
                )}`}
              >
                #{rankNum}
              </span>
            )}
            <span className="bg-black/80 backdrop-blur-md text-white text-[9px] font-black px-1.5 py-0.5 rounded border border-white/15 uppercase tracking-wider leading-none">
              {typeCode}
            </span>
          </div>
          {ratingVal && (
            <span className="bg-black/80 backdrop-blur-md text-yellow-400 text-[9px] font-black px-1.5 py-0.5 rounded border border-yellow-500/30 flex items-center gap-0.5 leading-none">
              ★ {ratingVal}
            </span>
          )}
        </div>

        <div className="absolute bottom-0 inset-x-0 p-2 text-right pointer-events-none">
          <h3
            className="text-[11px] sm:text-xs font-black text-white line-clamp-2 leading-tight drop-shadow-[0_2px_4px_rgba(0,0,0,0.95)] group-hover:text-purple-300 transition-colors"
            dir="ltr"
          >
            {cleanTitle}
          </h3>
        </div>
      </div>
    );
  };

  return (
    <div
      className="min-h-screen bg-[#0b0c10] text-white font-sans pb-28 select-none"
      dir="rtl"
    >
      {/* 1. الشريط العلوي المدمج (بنفس نمط الصفحات الأربع) */}
      <div className="bg-[#0b0c10] border-b border-white/5 px-4 pt-4 pb-3">
        <div className="max-w-7xl mx-auto space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-purple-600/25 to-amber-500/20 border border-purple-500/30 flex items-center justify-center text-amber-400 shadow-md">
                <Crown size={18} />
              </div>
              <div>
                <h1 className="text-base md:text-lg font-black tracking-tight text-white">
                  نخبة وعالم الأنمي
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {/* أزرار سريعة لساحة الألعاب ولوحة المتصدرين حتى لا يفقد المستخدم أي ميزة */}
              {onNavigate && (
                <>
                  <button
                    onClick={() => onNavigate('games')}
                    title="ساحة الألعاب والتحديات"
                    className="h-9 px-2.5 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/25 flex items-center gap-1.5 text-[11px] font-black transition cursor-pointer active:scale-95"
                  >
                    <Gamepad2 size={15} />
                    <span className="hidden sm:inline">الألعاب</span>
                  </button>
                  <button
                    onClick={() => onNavigate('leaderboard')}
                    title="لوحة المتصدرين"
                    className="h-9 px-2.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/25 flex items-center gap-1.5 text-[11px] font-black transition cursor-pointer active:scale-95"
                  >
                    <Trophy size={15} />
                    <span className="hidden sm:inline">المتصدرين</span>
                  </button>
                </>
              )}

              {/* زر تبديل العرض الموحد */}
              <LayoutModeToggleButton
                mode={layoutMode}
                onToggle={cycleLayoutMode}
              />
            </div>
          </div>

          {/* التبويبات الثلاثة الرئيسية */}
          <div className="grid grid-cols-3 gap-1.5 bg-[#12141c] p-1 rounded-2xl border border-white/5">
            {[
              { id: 'discover', label: 'بوصلة المزاج', icon: Compass },
              { id: 'hall_of_fame', label: 'قاعة الأساطير', icon: Crown },
              { id: 'characters', label: 'نجوم الأنمي', icon: Users },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`py-2 px-2 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    isActive
                      ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md'
                      : 'text-neutral-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <Icon size={14} />
                  <span className="truncate">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* محتوى التبويبات */}
      <div className="max-w-7xl mx-auto">
        {/* ================= التبويب الأول: بوصلة المزاج والاكتشاف الذكي ================= */}
        {activeTab === 'discover' && (
          <div className="space-y-4">
            {/* شبكة اختيار المزاج */}
            <div className="px-3 pt-3 md:px-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                {MOOD_PRESETS.map((mood) => {
                  const Icon = mood.icon;
                  const isSelected = selectedMood === mood.id;
                  return (
                    <button
                      key={mood.id}
                      onClick={() => setSelectedMood(mood.id)}
                      className={`p-3 rounded-2xl border text-right transition-all cursor-pointer flex flex-col justify-between gap-2 relative overflow-hidden ${
                        isSelected
                          ? `bg-gradient-to-br ${mood.accent} shadow-lg scale-[1.01]`
                          : 'bg-[#12141c] border-white/5 text-neutral-400 hover:border-white/15 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <div
                          className={`w-8 h-8 rounded-xl flex items-center justify-center border ${
                            isSelected ? mood.badgeBg : 'bg-white/5 border-white/10 text-neutral-400'
                          }`}
                        >
                          <Icon size={16} />
                        </div>
                        {isSelected && (
                          <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-white/10 text-white">
                            نشط
                          </span>
                        )}
                      </div>
                      <div>
                        <h3 className="text-xs font-black text-white line-clamp-1">{mood.title}</h3>
                        <p className="text-[10px] text-neutral-400 line-clamp-1 mt-0.5">
                          {mood.subtitle}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* بطاقة الاقتراح الفوري (روليت المزاج) */}
            {spotlightAnime && (
              <div className="px-3 md:px-4">
                <motion.div
                  key={spotlightAnime._id}
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="relative rounded-2xl overflow-hidden border border-purple-500/25 bg-[#12141c] shadow-xl"
                >
                  {/* خلفية ضبابية من البوستر */}
                  <div className="absolute inset-0 opacity-20 pointer-events-none">
                    <img
                      src={spotlightAnime.posterUrl}
                      alt=""
                      className="w-full h-full object-cover blur-2xl scale-110"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-gradient-to-l from-[#12141c] via-[#12141c]/90 to-transparent" />
                  </div>

                  <div className="relative z-10 flex items-stretch gap-3 p-3 sm:p-4">
                    <div
                      onClick={() => onAnimeClick && onAnimeClick(String(spotlightAnime._id))}
                      className="w-24 sm:w-28 aspect-[2/3] rounded-xl overflow-hidden shrink-0 border border-white/15 shadow-lg cursor-pointer group"
                    >
                      <img
                        src={spotlightAnime.posterUrl}
                        alt={spotlightAnime.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        referrerPolicy="no-referrer"
                      />
                    </div>

                    <div className="flex-1 min-w-0 flex flex-col justify-between text-right">
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                            <Zap size={11} className="fill-purple-400 text-purple-400" />
                            اختيار الذكاء لمزاجك
                          </span>

                          <button
                            onClick={handleSpinRandomPick}
                            disabled={spinningRoulette}
                            className="inline-flex items-center gap-1 text-[11px] font-black px-2.5 py-1 rounded-xl bg-white/10 hover:bg-white/15 text-white border border-white/10 transition cursor-pointer active:scale-95"
                          >
                            <Shuffle
                              size={12}
                              className={spinningRoulette ? 'animate-spin text-purple-400' : 'text-purple-400'}
                            />
                            <span>اقترح غيره</span>
                          </button>
                        </div>

                        <h2
                          onClick={() => onAnimeClick && onAnimeClick(String(spotlightAnime._id))}
                          className="text-sm sm:text-base font-black text-white hover:text-purple-400 transition cursor-pointer line-clamp-1"
                          dir="auto"
                        >
                          {cleanAnimeTitle(spotlightAnime.title)}
                        </h2>

                        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                          <span className="bg-purple-600/20 text-purple-300 border border-purple-500/30 text-[10px] font-black px-2 py-0.5 rounded">
                            {getShortTypeCode(spotlightAnime.type)}
                          </span>
                          {spotlightAnime.rating > 0 && (
                            <span className="bg-yellow-500/15 text-yellow-400 border border-yellow-500/30 text-[10px] font-black px-2 py-0.5 rounded flex items-center gap-1">
                              <Star size={10} className="fill-yellow-400" />
                              {Number(spotlightAnime.rating).toFixed(1)}
                            </span>
                          )}
                          {getArabicSeasonLabel(
                            spotlightAnime.season,
                            spotlightAnime.releaseYear || spotlightAnime.year
                          ) && (
                            <span className="bg-white/5 text-neutral-300 border border-white/10 text-[10px] font-bold px-2 py-0.5 rounded">
                              {getArabicSeasonLabel(
                                spotlightAnime.season,
                                spotlightAnime.releaseYear || spotlightAnime.year
                              )}
                            </span>
                          )}
                          {spotlightAnime.episodesCount && (
                            <span className="bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[10px] font-bold px-2 py-0.5 rounded">
                              {spotlightAnime.episodesCount} حلقة
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2 mt-3">
                        <div className="flex flex-wrap gap-1">
                          {(spotlightAnime.genres || []).slice(0, 3).map((g: string, i: number) => (
                            <span
                              key={i}
                              className="text-[10px] font-bold text-neutral-300 bg-black/50 px-2 py-0.5 rounded border border-white/5"
                            >
                              {GENRE_TRANSLATIONS[g] || g}
                            </span>
                          ))}
                        </div>

                        <button
                          onClick={() => onAnimeClick && onAnimeClick(String(spotlightAnime._id))}
                          className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-black flex items-center gap-1.5 shadow-lg cursor-pointer shrink-0 active:scale-95 transition"
                        >
                          <Play size={12} className="fill-current" />
                          <span>استعراض ومشاهدة</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              </div>
            )}

            {/* قائمة أنميات المزاج المختار */}
            <div className={isListMode ? 'p-2 md:p-4' : 'p-0 md:p-4'}>
              <div className="flex items-center justify-between px-3 mb-2">
                <div className="flex items-center gap-2">
                  <Sparkles size={15} className="text-purple-400" />
                  <h3 className="text-xs sm:text-sm font-black text-white">
                    أفضل اختيارات: {activeMoodPreset.title}
                  </h3>
                </div>
                <span className="text-[11px] font-bold text-neutral-500">
                  {moodAnimeList.length} عمل مختار
                </span>
              </div>

              {loadingMood ? (
                <div className={getLayoutGridClasses(layoutMode)}>
                  {[...Array(12)].map((_, i) => (
                    <div
                      key={i}
                      className={
                        isListMode
                          ? 'h-32 bg-[#12141c] rounded-2xl animate-pulse'
                          : 'aspect-[2/3] bg-[#12141c] animate-pulse border-[0.5px] border-black/40'
                      }
                    />
                  ))}
                </div>
              ) : (
                <div className={getLayoutGridClasses(layoutMode)}>
                  {moodAnimeList.map((anime, idx) => renderAnimeCard(anime, idx, false))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================= التبويب الثاني: قاعة الأساطير (Hall of Fame) ================= */}
        {activeTab === 'hall_of_fame' && (
          <div className="space-y-3">
            {/* فلاتر قاعة الأساطير */}
            <div className="px-3 pt-3 md:px-4 flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                {[
                  { id: 'score', label: 'الأعلى تقييماً بالتاريخ', icon: Crown },
                  { id: 'popularity', label: 'الأكثر شعبية عالمياً', icon: Flame },
                  { id: 'airing', label: 'أفضل المستمر حالياً', icon: Zap },
                ].map((f) => {
                  const Icon = f.icon;
                  const active = fameFilter === f.id;
                  return (
                    <button
                      key={f.id}
                      onClick={() => setFameFilter(f.id as any)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap border ${
                        active
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm'
                          : 'bg-[#12141c] text-neutral-400 border-white/5 hover:text-white'
                      }`}
                    >
                      <Icon size={13} />
                      <span>{f.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className={isListMode ? 'p-2 md:p-4' : 'p-0 md:p-4'}>
              {loadingFame ? (
                <div className={getLayoutGridClasses(layoutMode)}>
                  {[...Array(15)].map((_, i) => (
                    <div
                      key={i}
                      className={
                        isListMode
                          ? 'h-32 bg-[#12141c] rounded-2xl animate-pulse'
                          : 'aspect-[2/3] bg-[#12141c] animate-pulse border-[0.5px] border-black/40'
                      }
                    />
                  ))}
                </div>
              ) : (
                <div className={getLayoutGridClasses(layoutMode)}>
                  {fameAnimeList.map((anime, idx) => renderAnimeCard(anime, idx, true))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================= التبويب الثالث: نجوم وشخصيات الأنمي ================= */}
        {activeTab === 'characters' && (
          <div className="space-y-3">
            {/* شريط البحث عن شخصية */}
            <div className="px-3 pt-3 md:px-4">
              <div className="relative">
                <input
                  type="text"
                  value={characterSearch}
                  onChange={(e) => setCharacterSearch(e.target.value)}
                  placeholder="ابحث عن شخصيتك المفضلة بالإنجليزية (مثال: Levi, Luffy, Gojo, Killua)..."
                  className="w-full bg-[#12141c] border border-white/10 focus:border-purple-500/50 rounded-xl py-2.5 pr-10 pl-9 text-xs sm:text-sm text-white placeholder:text-neutral-500 focus:outline-none transition"
                />
                <Search
                  size={16}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none"
                />
                {characterSearch && (
                  <button
                    onClick={() => setCharacterSearch('')}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white"
                  >
                    <X size={15} />
                  </button>
                )}
              </div>
            </div>

            {/* عرض الشخصيات */}
            <div className={isListMode ? 'p-2 md:p-4' : 'p-0 md:p-4'}>
              {loadingCharacters ? (
                <div className={getLayoutGridClasses(layoutMode)}>
                  {[...Array(15)].map((_, i) => (
                    <div
                      key={i}
                      className={
                        isListMode
                          ? 'h-32 bg-[#12141c] rounded-2xl animate-pulse'
                          : 'aspect-[2/3] bg-[#12141c] animate-pulse border-[0.5px] border-black/40'
                      }
                    />
                  ))}
                </div>
              ) : charactersList.length === 0 ? (
                <div className="text-center py-16 text-neutral-500">
                  <Users size={40} className="mx-auto mb-2 opacity-40" />
                  <p className="text-xs font-bold">لم يتم العثور على شخصيات مطابقة</p>
                </div>
              ) : (
                <div className={getLayoutGridClasses(layoutMode)}>
                  {charactersList.map((char, idx) => {
                    const favCount =
                      char.favorites >= 1000
                        ? `${(char.favorites / 1000).toFixed(1)}K`
                        : String(char.favorites || 0);

                    if (isListMode) {
                      return (
                        <div
                          key={`${char.id}-${idx}`}
                          onClick={() => setSelectedCharacter(char)}
                          className="cursor-pointer group flex items-stretch bg-[#111216] hover:bg-[#171920] border border-white/5 hover:border-purple-500/30 rounded-2xl overflow-hidden transition-all shadow-md"
                        >
                          <div className="w-28 sm:w-32 shrink-0 relative overflow-hidden bg-neutral-900 self-stretch">
                            <img
                              src={char.imageUrl}
                              alt={char.name}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                              loading="lazy"
                              referrerPolicy="no-referrer"
                            />
                            <span className="absolute top-1.5 right-1.5 bg-black/85 text-amber-400 border border-amber-500/30 text-[10px] font-black px-1.5 py-0.5 rounded-md">
                              #{char.rank || idx + 1}
                            </span>
                          </div>

                          <div className="flex-1 min-w-0 p-3 flex flex-col justify-between text-right">
                            <div>
                              <h3
                                className="text-sm sm:text-base font-black text-white group-hover:text-purple-400 transition-colors line-clamp-1"
                                dir="auto"
                              >
                                {char.name}
                              </h3>
                              {char.nativeName && (
                                <p className="text-[11px] text-neutral-400 font-bold line-clamp-1 mt-0.5">
                                  {char.nativeName}
                                </p>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-1.5 mt-2">
                              <span className="bg-rose-500/15 text-rose-400 border border-rose-500/30 text-[10px] font-black px-2 py-0.5 rounded-md flex items-center gap-1">
                                <Heart size={10} className="fill-rose-400" />
                                {favCount} معجب
                              </span>
                              {char.role && (
                                <span className="bg-purple-500/15 text-purple-300 border border-purple-500/30 text-[10px] font-bold px-2 py-0.5 rounded-md">
                                  {char.role}
                                </span>
                              )}
                              {char.voiceActor?.name && (
                                <span className="bg-white/5 text-neutral-300 border border-white/10 text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1">
                                  <Mic size={10} className="text-cyan-400" />
                                  {char.voiceActor.name}
                                </span>
                              )}
                            </div>

                            {char.anime?.title && (
                              <div className="mt-2 pt-1.5 border-t border-white/5 flex items-center justify-between gap-2">
                                <span className="text-[10px] font-bold text-neutral-400 truncate">
                                  العمل: <strong className="text-neutral-200">{cleanAnimeTitle(char.anime.title)}</strong>
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={`${char.id}-${idx}`}
                        onClick={() => setSelectedCharacter(char)}
                        className="cursor-pointer group relative aspect-[2/3] w-full overflow-hidden bg-neutral-900 border-[0.5px] border-black/40"
                      >
                        <img
                          src={char.imageUrl}
                          alt={char.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          loading="lazy"
                          referrerPolicy="no-referrer"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/25 to-transparent" />

                        <div
                          className="absolute top-1.5 inset-x-1.5 flex items-center justify-between pointer-events-none"
                          dir="ltr"
                        >
                          <span className="bg-black/80 backdrop-blur-md text-amber-400 text-[9px] font-black px-1.5 py-0.5 rounded border border-amber-500/30 leading-none">
                            #{char.rank || idx + 1}
                          </span>
                          <span className="bg-black/80 backdrop-blur-md text-rose-400 text-[9px] font-black px-1.5 py-0.5 rounded border border-rose-500/30 flex items-center gap-0.5 leading-none">
                            ♥ {favCount}
                          </span>
                        </div>

                        <div className="absolute bottom-0 inset-x-0 p-2 text-right pointer-events-none">
                          <h3
                            className="text-[11px] sm:text-xs font-black text-white line-clamp-1 leading-tight drop-shadow-[0_2px_4px_rgba(0,0,0,0.95)] group-hover:text-purple-300 transition-colors"
                            dir="ltr"
                          >
                            {char.name}
                          </h3>
                          {char.anime?.title && (
                            <p
                              className="text-[9px] font-bold text-neutral-400 line-clamp-1 mt-0.5"
                              dir="ltr"
                            >
                              {cleanAnimeTitle(char.anime.title)}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* نافذة تفاصيل الشخصية ومؤدي الصوت والعمل المرتبط */}
      <AnimatePresence>
        {selectedCharacter && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelectedCharacter(null)}
            className="fixed inset-0 z-[120] bg-black/85 backdrop-blur-md flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.92, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.92, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md bg-[#12141d] border border-white/10 rounded-3xl overflow-hidden shadow-2xl relative"
              dir="rtl"
            >
              <button
                onClick={() => setSelectedCharacter(null)}
                className="absolute top-3 left-3 z-20 w-8 h-8 rounded-full bg-black/70 text-white flex items-center justify-center border border-white/10 hover:bg-black cursor-pointer"
              >
                <X size={16} />
              </button>

              <div className="flex items-stretch gap-3.5 p-4 bg-gradient-to-b from-purple-950/30 to-transparent">
                <div className="w-28 sm:w-32 aspect-[2/3] rounded-2xl overflow-hidden shrink-0 border border-white/15 shadow-xl bg-neutral-900">
                  <img
                    src={selectedCharacter.imageUrl}
                    alt={selectedCharacter.name}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>

                <div className="flex-1 min-w-0 flex flex-col justify-between text-right py-1">
                  <div>
                    <div className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-400 border border-amber-500/30 mb-1.5">
                      <Award size={11} />
                      المركز العالمي #{selectedCharacter.rank}
                    </div>
                    <h2 className="text-base sm:text-lg font-black text-white leading-snug" dir="auto">
                      {selectedCharacter.name}
                    </h2>
                    {selectedCharacter.nativeName && (
                      <p className="text-xs text-neutral-400 font-bold mt-0.5">
                        {selectedCharacter.nativeName}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1.5 mt-3">
                    <span className="bg-rose-500/15 text-rose-400 border border-rose-500/30 text-[10px] font-black px-2.5 py-1 rounded-lg flex items-center gap-1">
                      <Heart size={11} className="fill-rose-400" />
                      {(selectedCharacter.favorites || 0).toLocaleString()} محب
                    </span>
                    {selectedCharacter.role && (
                      <span className="bg-purple-500/15 text-purple-300 border border-purple-500/30 text-[10px] font-bold px-2.5 py-1 rounded-lg">
                        {selectedCharacter.role}
                      </span>
                    )}
                    {selectedCharacter.age && (
                      <span className="bg-white/5 text-neutral-300 border border-white/10 text-[10px] font-bold px-2.5 py-1 rounded-lg">
                        العمر: {selectedCharacter.age}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="px-4 pb-4 space-y-3">
                {/* مؤدي الصوت الياباني */}
                {selectedCharacter.voiceActor && (
                  <div className="flex items-center justify-between bg-black/40 border border-white/5 rounded-2xl p-2.5">
                    <div className="flex items-center gap-2.5">
                      {selectedCharacter.voiceActor.imageUrl && (
                        <img
                          src={selectedCharacter.voiceActor.imageUrl}
                          alt={selectedCharacter.voiceActor.name}
                          className="w-10 h-10 rounded-xl object-cover border border-white/10"
                          referrerPolicy="no-referrer"
                        />
                      )}
                      <div className="text-right">
                        <span className="text-[10px] font-bold text-cyan-400 flex items-center gap-1">
                          <Mic size={10} /> مؤدي الصوت الياباني (Seiyuu)
                        </span>
                        <p className="text-xs font-black text-white">
                          {selectedCharacter.voiceActor.name}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* نبذة مختصرة */}
                {selectedCharacter.about && (
                  <div className="bg-black/30 border border-white/5 rounded-2xl p-3 max-h-32 overflow-y-auto">
                    <p
                      className="text-xs text-neutral-300 leading-relaxed font-medium"
                      dir="auto"
                    >
                      {selectedCharacter.about}
                    </p>
                  </div>
                )}

                {/* الأنمي المرتبط لفتحه مباشرة */}
                {selectedCharacter.anime && (
                  <div
                    onClick={() => {
                      const targetId = selectedCharacter.anime.id;
                      setSelectedCharacter(null);
                      if (onAnimeClick && targetId) onAnimeClick(String(targetId));
                    }}
                    className="flex items-center justify-between gap-3 bg-gradient-to-r from-purple-600/20 to-indigo-600/15 hover:from-purple-600/30 hover:to-indigo-600/25 border border-purple-500/30 rounded-2xl p-2.5 cursor-pointer transition group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <img
                        src={selectedCharacter.anime.posterUrl}
                        alt={selectedCharacter.anime.title}
                        className="w-11 h-14 rounded-xl object-cover shrink-0 border border-white/10"
                        referrerPolicy="no-referrer"
                      />
                      <div className="min-w-0 text-right">
                        <span className="text-[10px] font-black text-purple-300 block">
                          الظهور الأبرز في أنمي:
                        </span>
                        <h4
                          className="text-xs sm:text-sm font-black text-white truncate group-hover:text-purple-300 transition"
                          dir="auto"
                        >
                          {cleanAnimeTitle(selectedCharacter.anime.title)}
                        </h4>
                      </div>
                    </div>

                    <div className="px-3 py-1.5 rounded-xl bg-purple-600 text-white text-xs font-black flex items-center gap-1 shrink-0 shadow">
                      <Play size={12} className="fill-current" />
                      <span>شاهد</span>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
