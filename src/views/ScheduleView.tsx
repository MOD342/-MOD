import React, { useState, useEffect, useMemo } from 'react';
import { ChevronRight, Loader2, Clock, Search, AlertCircle, Star, Tv, Calendar, Layers } from 'lucide-react';
import { cleanAnimeTitle } from '../utils/animeTitleCleaner';
import {
  useGlobalLayoutMode,
  LayoutModeToggleButton,
  getLayoutGridClasses,
  getShortTypeCode,
  getArabicSeasonLabel,
} from '../utils/useViewLayoutMode';

interface ScheduleViewProps {
  onBack: () => void;
  onAnimeClick: (id: string) => void;
  initialDay?: string;
}

const DAYS = [
  { id: 'saturday', label: 'السبت' },
  { id: 'sunday', label: 'الأحد' },
  { id: 'monday', label: 'الإثنين' },
  { id: 'tuesday', label: 'الثلاثاء' },
  { id: 'wednesday', label: 'الأربعاء' },
  { id: 'thursday', label: 'الخميس' },
  { id: 'friday', label: 'الجمعة' },
];

const GENRE_AR_SCHEDULE_MAP: Record<string, string> = {
  Action: 'أكشن ⚔️',
  Adventure: 'مغامرات 🗺️',
  Comedy: 'كوميديا 🎭',
  Drama: 'دراما 😭',
  Fantasy: 'خيالي 🦄',
  Romance: 'رومانسي 💕',
  'Sci-Fi': 'خيال علمي 🚀',
  'Slice of Life': 'شريحة من الحياة 🌸',
  Supernatural: 'قوى خارقة 🔮',
  Suspense: 'إثارة ⏳',
  Mystery: 'غموض 🔍',
  Sports: 'رياضة ⚽',
  Horror: 'رعب 👻',
  Psychological: 'نفسي 🧠',
  Thriller: 'إثارة 🔥',
  Mecha: 'آليات 🤖',
  Music: 'موسيقى 🎵',
  Historical: 'تاريخي 📜',
};

// Helper to convert JST Broadcast to user's Local timezone
function getLocalBroadcastTime(jstTimeStr?: string, dayId?: string): string {
  try {
    if (!jstTimeStr || !jstTimeStr.includes(':')) {
      return '';
    }

    const [jstHour, jstMin] = jstTimeStr.split(':').map(Number);
    if (isNaN(jstHour) || isNaN(jstMin)) {
      return jstTimeStr;
    }

    const daysOrder = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const targetDayIndex = dayId ? daysOrder.indexOf(dayId) : -1;

    const now = new Date();
    const currentDayIndex = now.getDay();
    const dayDiff = targetDayIndex !== -1 ? targetDayIndex - currentDayIndex : 0;
    const jstDate = new Date(now.getTime() + dayDiff * 24 * 60 * 60 * 1000);

    // UTC Hour = JST Hour - 9
    let utcHour = jstHour - 9;
    let dayShift = 0;
    if (utcHour < 0) {
      utcHour += 24;
      dayShift = -1;
    } else if (utcHour >= 24) {
      utcHour -= 24;
      dayShift = 1;
    }

    jstDate.setUTCHours(utcHour, jstMin, 0, 0);
    if (dayShift !== 0) {
      jstDate.setUTCDate(jstDate.getUTCDate() + dayShift);
    }

    return jstDate.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  } catch {
    return jstTimeStr || '';
  }
}

export default function ScheduleView({ onBack, onAnimeClick, initialDay }: ScheduleViewProps) {
  const [selectedDay, setSelectedDay] = useState(() => {
    if (initialDay) return initialDay;
    const d = new Date().getDay();
    const map = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    return map[d];
  });

  const [schedule, setSchedule] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'daily' | 'all-week'>('daily');
  const [allWeekData, setAllWeekData] = useState<Record<string, any[]>>({});
  const [weekLoading, setWeekLoading] = useState(false);
  const [layoutMode, cycleLayoutMode] = useGlobalLayoutMode();

  useEffect(() => {
    let active = true;
    const fetchSchedule = async () => {
      if (active) setLoading(true);
      try {
        const res = await fetch(`/api/anime/jikan-schedule?day=${selectedDay}`, {
          cache: 'no-store'
        });
        const json = await res.json();
        if (json.success && json.data && active) {
          setSchedule(json.data);
        }
      } catch (e) {
        console.error(e);
      }
      if (active) setLoading(false);
    };

    if (viewMode === 'daily') {
      fetchSchedule();
    }
    return () => {
      active = false;
    };
  }, [selectedDay, viewMode]);

  useEffect(() => {
    let active = true;
    if (viewMode === 'all-week' && Object.keys(allWeekData).length === 0) {
      const fetchFullWeek = async () => {
        setWeekLoading(true);
        const dataMap: Record<string, any[]> = {};
        try {
          await Promise.all(
            DAYS.map(async (day) => {
              try {
                const res = await fetch(`/api/anime/jikan-schedule?day=${day.id}`, {
                  cache: 'no-store'
                });
                const json = await res.json();
                dataMap[day.id] = json.success && json.data ? json.data : [];
              } catch {
                dataMap[day.id] = [];
              }
            })
          );
          if (active) {
            setAllWeekData(dataMap);
          }
        } catch (e) {
          console.error('Failed loading full week', e);
        } finally {
          if (active) setWeekLoading(false);
        }
      };
      fetchFullWeek();
    }
    return () => {
      active = false;
    };
  }, [viewMode]);

  const filteredSchedule = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return schedule;
    return schedule.filter((anime: any) => {
      return (
        anime.title?.toLowerCase().includes(q) ||
        anime.title_english?.toLowerCase().includes(q)
      );
    });
  }, [schedule, searchQuery]);

  const isListMode = layoutMode === 'list';
  const isLargeGrid = layoutMode === 'grid2';

  const renderAnimeItem = (anime: any, idx: number, dayId: string, keyPrefix: string) => {
    const localTime = getLocalBroadcastTime(anime.broadcast?.time, dayId);
    const cleanTitle = cleanAnimeTitle(anime.title_english || anime.title || 'Anime');
    const poster =
      anime.images?.jpg?.large_image_url ||
      anime.images?.jpg?.image_url ||
      anime.posterUrl ||
      'https://via.placeholder.com/200x300?text=Anime';
    const dayLabel = DAYS.find((d) => d.id === dayId)?.label || '';
    const score = anime.score && Number(anime.score) > 0 ? Number(anime.score).toFixed(1) : null;
    const shortType = getShortTypeCode(anime.type || 'TV');
    const seasonLabel = getArabicSeasonLabel(anime.season, anime.year || anime.aired?.prop?.from?.year);
    const episodesCount = anime.episodes ? `${anime.episodes} حلقة` : null;
    const genresList = Array.isArray(anime.genres)
      ? anime.genres
          .slice(0, 3)
          .map((g: any) => {
            const gName = typeof g === 'string' ? g : g?.name || '';
            return GENRE_AR_SCHEDULE_MAP[gName] || gName;
          })
          .filter(Boolean)
      : [];

    if (isListMode) {
      return (
        <div
          key={`${keyPrefix}-${anime.mal_id || idx}-${idx}`}
          onClick={() => onAnimeClick(String(anime.mal_id || anime._id))}
          className="cursor-pointer group flex items-stretch bg-neutral-900/95 border border-neutral-800/90 hover:border-blue-500/60 rounded-xl transition-all overflow-hidden shadow-md min-h-[124px] sm:min-h-[132px]"
        >
          <div className="w-24 sm:w-28 shrink-0 bg-neutral-950 relative border-l border-white/10 overflow-hidden">
            <img
              src={poster}
              loading="lazy"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              alt={cleanTitle}
            />
          </div>

          <div className="flex-1 min-w-0 flex flex-col justify-center items-start text-right gap-1.5 p-2.5 sm:p-3">
            <h3
              className="w-full font-black text-sm sm:text-base text-white group-hover:text-blue-400 transition-colors line-clamp-1 leading-snug text-right"
              dir="auto"
            >
              {cleanTitle}
            </h3>

            <div className="flex flex-wrap items-center justify-start gap-1.5 text-[10px] sm:text-xs font-bold">
              {score && (
                <span className="bg-yellow-500/15 border border-yellow-500/30 text-yellow-400 px-2 py-0.5 rounded-lg flex items-center gap-1" dir="ltr">
                  <Star size={10} fill="currentColor" />
                  <span>{score}</span>
                </span>
              )}
              <span className="bg-neutral-800 text-neutral-200 px-2 py-0.5 rounded-lg flex items-center gap-1" dir="ltr">
                <Tv size={10} className="text-neutral-400" />
                <span>{shortType}</span>
              </span>
              {localTime && (
                <span className="bg-blue-600/20 border border-blue-500/30 text-blue-300 px-2 py-0.5 rounded-lg flex items-center gap-1">
                  <Clock size={10} />
                  <span>{localTime}</span>
                </span>
              )}
              {dayLabel && (
                <span className="bg-neutral-800 text-neutral-300 px-2 py-0.5 rounded-lg">
                  {dayLabel}
                </span>
              )}
              {seasonLabel && (
                <span className="flex items-center gap-1 bg-neutral-950/90 border border-white/10 text-neutral-300 px-2 py-0.5 rounded-lg">
                  <Calendar size={10} className="text-neutral-400" />
                  <span>{seasonLabel}</span>
                </span>
              )}
              {episodesCount && (
                <span className="flex items-center gap-1 bg-neutral-950/90 border border-white/10 text-neutral-300 px-2 py-0.5 rounded-lg">
                  <Layers size={10} className="text-neutral-400" />
                  <span>{episodesCount}</span>
                </span>
              )}
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
        key={`${keyPrefix}-${anime.mal_id || idx}-${idx}`}
        onClick={() => onAnimeClick(String(anime.mal_id || anime._id))}
        className="cursor-pointer group relative aspect-[3/4] overflow-hidden bg-neutral-950 border-b border-l border-white/10"
      >
        <img
          src={poster}
          loading="lazy"
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          alt={cleanTitle}
        />

        <div className="absolute top-1.5 inset-x-1.5 z-10 flex items-center justify-between gap-1 pointer-events-none" dir="ltr">
          <div className="flex items-center gap-1">
            <span className="bg-black/80 backdrop-blur-md text-white px-1.5 py-0.5 rounded text-[9px] sm:text-[10px] font-black border border-white/15 uppercase tracking-tight">
              {shortType}
            </span>
            {score && (
              <span className="bg-black/80 backdrop-blur-md text-yellow-400 px-1.5 py-0.5 rounded flex items-center gap-0.5 text-[9px] sm:text-[10px] font-black border border-white/15">
                <Star size={8} fill="currentColor" />
                <span>{score}</span>
              </span>
            )}
          </div>

          {localTime && (
            <span className="bg-blue-600/95 backdrop-blur-md text-white px-1.5 py-0.5 rounded text-[9px] sm:text-[10px] font-black shadow flex items-center gap-0.5">
              <Clock size={8} />
              <span>{localTime}</span>
            </span>
          )}
        </div>

        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/70 to-transparent pt-8 pb-2 px-2 pointer-events-none flex flex-col justify-end">
          <h3
            className={`font-black ${
              isLargeGrid ? 'text-xs sm:text-sm' : 'text-[10px] sm:text-xs'
            } text-white group-hover:text-blue-400 transition-colors line-clamp-2 text-center leading-tight drop-shadow`}
            dir="ltr"
          >
            {cleanTitle}
          </h3>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-black flex flex-col font-sans text-white pb-20" dir="rtl">
      <div className="bg-black border-b border-white/5 px-4 py-3 flex items-center justify-between max-w-7xl w-full mx-auto">
        <div className="flex items-center gap-2.5">
          <button
            onClick={onBack}
            className="p-2 bg-neutral-900 rounded-xl hover:bg-neutral-800 transition text-neutral-300 hover:text-white cursor-pointer"
            aria-label="الرجوع"
          >
            <ChevronRight size={18} />
          </button>
          <h1 className="font-black text-base md:text-lg text-white">
            جدول البث
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <LayoutModeToggleButton mode={layoutMode} onToggle={cycleLayoutMode} />
          <div className="flex bg-neutral-900 p-1 rounded-xl text-xs font-bold">
            <button
              onClick={() => setViewMode('daily')}
              className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                viewMode === 'daily'
                  ? 'bg-blue-600 text-white'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              يومي
            </button>
            <button
              onClick={() => setViewMode('all-week')}
              className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                viewMode === 'all-week'
                  ? 'bg-blue-600 text-white'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              الأسبوع
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl w-full mx-auto px-4 pt-3 pb-2 space-y-2.5">
        {viewMode === 'daily' && (
          <div className="flex overflow-x-auto hide-scrollbar gap-2 pb-1">
            {DAYS.map((day) => (
              <button
                key={day.id}
                onClick={() => setSelectedDay(day.id)}
                className={`px-4 py-1.5 font-bold text-xs rounded-xl whitespace-nowrap transition cursor-pointer ${
                  selectedDay === day.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-neutral-900 text-neutral-400 hover:text-white'
                }`}
              >
                {day.label}
              </button>
            ))}
          </div>
        )}

        <div className="relative">
          <Search size={15} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-500" />
          <input
            type="text"
            placeholder="ابحث عن أنمي في الجدول..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-neutral-900/90 border border-neutral-800 rounded-xl pr-9 pl-3 py-2 text-xs font-bold text-white placeholder-neutral-500 focus:outline-none focus:border-blue-500 transition"
          />
        </div>
      </div>

      <div className={`flex-1 ${isListMode ? 'p-3 md:p-5' : 'p-0 md:p-4'} max-w-7xl w-full mx-auto`}>
        {(loading && viewMode === 'daily') || (weekLoading && viewMode === 'all-week') ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <Loader2 className="animate-spin text-blue-500" size={30} />
            <span className="text-xs font-bold text-neutral-400">جاري تحميل الجدول...</span>
          </div>
        ) : viewMode === 'all-week' ? (
          <div className="space-y-6">
            {DAYS.map((day) => {
              const dayItems = allWeekData[day.id] || [];
              const q = searchQuery.trim().toLowerCase();
              const filteredDayItems = !q
                ? dayItems
                : dayItems.filter(
                    (anime: any) =>
                      anime.title?.toLowerCase().includes(q) ||
                      anime.title_english?.toLowerCase().includes(q)
                  );

              if (filteredDayItems.length === 0) return null;

              return (
                <div key={day.id} className="space-y-2.5">
                  <h2 className="text-sm font-black text-white border-r-4 border-blue-500 pr-2 mr-3 md:mr-0">
                    {day.label}
                  </h2>

                  <div className={getLayoutGridClasses(layoutMode)}>
                    {filteredDayItems.map((anime: any, idx: number) =>
                      renderAnimeItem(anime, idx, day.id, day.id)
                    )}
                  </div>
                </div>
              );
            })}

            {Object.keys(allWeekData).length > 0 &&
              Object.values(allWeekData).flat().length === 0 && (
                <div className="text-center py-20 text-neutral-500 text-xs font-bold">
                  لا توجد بيانات متاحة حالياً.
                </div>
              )}
          </div>
        ) : filteredSchedule.length > 0 ? (
          <div className={getLayoutGridClasses(layoutMode)}>
            {filteredSchedule.map((anime: any, idx: number) =>
              renderAnimeItem(anime, idx, selectedDay, 'daily')
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-24 text-center text-neutral-500">
            <AlertCircle className="text-neutral-600 mb-2" size={32} />
            <h4 className="font-bold text-sm text-neutral-400">لا توجد نتائج مطابقة</h4>
          </div>
        )}
      </div>
    </div>
  );
}
