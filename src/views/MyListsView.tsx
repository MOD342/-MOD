import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bookmark, Trash2, Plus, FolderPlus, LogIn, ArrowUpDown, Calendar, CheckCircle2, Star, Tv, Layers } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { listService, CustomList, AnimeEntry, MainListStatus } from '../services/listService';
import { clientCache } from '../utils/clientCache';
import { cleanAnimeTitle } from '../utils/animeTitleCleaner';
import {
  useGlobalLayoutMode,
  LayoutModeToggleButton,
  getLayoutGridClasses,
  getShortTypeCode,
  getArabicSeasonLabel,
} from '../utils/useViewLayoutMode';

interface MyListsViewProps {
  onAnimeClick: (id: string) => void;
}

const MAIN_LISTS: { id: MainListStatus, label: string }[] = [
  { id: 'watching', label: 'أشاهده حالياً' },
  { id: 'completed', label: 'مكتمل' },
  { id: 'plan_to_watch', label: 'أنوي مشاهدته' },
  { id: 'on_hold', label: 'مؤجل' },
  { id: 'dropped', label: 'ملغي' },
];

export default function MyListsView({ onAnimeClick }: MyListsViewProps) {
  const { user, signIn } = useAuth();
  const [activeListId, setActiveListId] = useState<string>('watching');
  const [customLists, setCustomLists] = useState<CustomList[]>(() => {
    return clientCache.get<CustomList[]>('client_mylists_custom') || [];
  });
  const [entries, setEntries] = useState<AnimeEntry[]>(() => {
    return clientCache.get<AnimeEntry[]>('client_mylists_entries') || [];
  });
  const [loading, setLoading] = useState(() => {
    return !clientCache.get('client_mylists_entries');
  });
  const [showAddList, setShowAddList] = useState(false);
  const [newListName, setNewListName] = useState('');
  
  const [sortBy, setSortBy] = useState<'alpha' | 'date' | 'year'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [layoutMode, cycleLayoutMode] = useGlobalLayoutMode();

  useEffect(() => {
    if (user) {
      loadData();
    } else {
      setLoading(false);
    }
  }, [user]);

  const loadData = async () => {
    if (!user) return;
    try {
      const [fetchedCustom, fetchedEntries] = await Promise.all([
        listService.getCustomLists(user.id),
        listService.getAnimeEntries(user.id)
      ]);
      const getMillis = (val: any) => {
        if (!val) return 0;
        if (typeof val.toMillis === 'function') return val.toMillis();
        if (typeof val.toDate === 'function') return val.toDate().getTime();
        if (val.seconds !== undefined) return val.seconds * 1000 + (val.nanoseconds || 0) / 1000000;
        if (val instanceof Date) return val.getTime();
        if (typeof val === 'string' || typeof val === 'number') return new Date(val).getTime();
        return 0;
      };
      const sortedCustom = fetchedCustom.sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt));
      setCustomLists(sortedCustom);
      setEntries(fetchedEntries);
      clientCache.set('client_mylists_custom', sortedCustom, 60 * 60 * 1000);
      clientCache.set('client_mylists_entries', fetchedEntries, 60 * 60 * 1000);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateList = async () => {
    if (!user || !newListName.trim()) return;
    try {
      await listService.createCustomList(user.id, newListName.trim());
      setNewListName('');
      setShowAddList(false);
      loadData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteList = async (listId: string) => {
    if (!user) return;
    try {
      await listService.deleteCustomList(user.id, listId);
      if (activeListId === listId) setActiveListId('watching');
      loadData();
    } catch (e) {
      console.error(e);
    }
  };

  const removeEntry = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) return;
    try {
      await listService.removeAnimeEntry(user.id, id);
      setEntries(prev => prev.filter(a => a.id !== id));
    } catch (err) {
      console.error(err);
    }
  };

  const currentDisplayEntries = useMemo(() => {
    const filtered = entries.filter(e => {
      if (MAIN_LISTS.some(m => m.id === activeListId)) {
        return e.status === activeListId;
      } else {
        return e.customLists?.[activeListId] === true;
      }
    });

    return filtered.sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'alpha') {
        comparison = a.title.localeCompare(b.title, 'ar');
      } else if (sortBy === 'year') {
        comparison = parseInt(a.releaseYear || '0') - parseInt(b.releaseYear || '0');
      } else {
        const getMillis = (val: any) => {
          if (!val) return 0;
          if (typeof val.toMillis === 'function') return val.toMillis();
          if (typeof val.toDate === 'function') return val.toDate().getTime();
          if (val.seconds !== undefined) return val.seconds * 1000 + (val.nanoseconds || 0) / 1000000;
          if (val instanceof Date) return val.getTime();
          if (typeof val === 'string' || typeof val === 'number') return new Date(val).getTime();
          return 0;
        };
        comparison = getMillis(a.addedAt) - getMillis(b.addedAt);
      }
      return sortOrder === 'desc' ? -comparison : comparison;
    });
  }, [entries, activeListId, sortBy, sortOrder]);

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] p-4 text-center">
        <div className="w-16 h-16 rounded-2xl bg-purple-600/20 flex items-center justify-center text-purple-400 mb-5">
          <Bookmark size={28} />
        </div>
        <h2 className="text-xl font-black text-white mb-2">قوائمك المحفوظة</h2>
        <p className="text-xs text-neutral-400 font-bold mb-6 max-w-sm">
          قم بتسجيل الدخول لإنشاء قوائم مخصصة، تتبع ما تشاهده، وحفظ الأنميات المفضلة لديك.
        </p>
        <button 
          onClick={signIn}
          className="bg-purple-600 hover:bg-purple-500 text-white font-black text-xs px-6 py-3 rounded-xl flex items-center gap-2 transition shadow-lg shadow-purple-500/20 cursor-pointer"
        >
          <LogIn size={18} /> تسجيل الدخول باستخدام جوجل
        </button>
      </div>
    );
  }

  const isListMode = layoutMode === 'list';
  const isLargeGrid = layoutMode === 'grid2';

  return (
    <div className="min-h-screen bg-black text-white pb-24" dir="rtl">
      <div className="max-w-7xl mx-auto">
        <div className="bg-black border-b border-white/5 px-3.5 md:px-5 py-3 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <h1 className="font-black text-base md:text-lg text-white">مكتبتي</h1>

            <div className="flex items-center gap-2">
              <div className="flex items-center bg-neutral-900 border border-neutral-800 rounded-xl px-1.5 py-0.5">
                <select 
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="bg-transparent text-[11px] text-white py-1 px-1.5 font-bold outline-none cursor-pointer"
                >
                  <option value="date" className="bg-neutral-900">تاريخ الإضافة</option>
                  <option value="alpha" className="bg-neutral-900">أبجدياً</option>
                  <option value="year" className="bg-neutral-900">سنة الإصدار</option>
                </select>
                <button 
                  onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                  className="p-1 text-neutral-400 hover:text-white transition cursor-pointer"
                  title="عكس الترتيب"
                >
                  <ArrowUpDown size={14} className={sortOrder === 'desc' ? 'rotate-180' : ''} />
                </button>
              </div>

              <LayoutModeToggleButton mode={layoutMode} onToggle={cycleLayoutMode} />
            </div>
          </div>

          <div className="flex gap-1.5 overflow-x-auto hide-scrollbar pb-0.5 pt-0.5">
            {MAIN_LISTS.map(list => (
              <button
                key={list.id}
                onClick={() => setActiveListId(list.id)}
                className={`px-3 py-1 text-[11px] font-bold rounded-lg whitespace-nowrap transition-colors cursor-pointer ${
                  activeListId === list.id 
                    ? 'bg-purple-600 text-white shadow' 
                    : 'bg-neutral-900 text-neutral-400 hover:text-white border border-neutral-800'
                }`}
              >
                {list.label}
              </button>
            ))}
            
            {customLists.length > 0 && (
              <div className="w-px h-6 bg-neutral-800 mx-0.5 shrink-0 self-center" />
            )}
            
            {customLists.map(list => (
              <div key={list.id} className="relative group flex shrink-0">
                <button
                  onClick={() => setActiveListId(list.id)}
                  className={`px-3 py-1 text-[11px] font-bold rounded-lg whitespace-nowrap transition-colors cursor-pointer ${
                    activeListId === list.id 
                      ? 'bg-blue-600 text-white shadow' 
                      : 'bg-neutral-900 text-blue-400/80 hover:text-blue-400 border border-neutral-800'
                  }`}
                >
                  {list.name}
                </button>
                <button 
                  onClick={() => handleDeleteList(list.id)}
                  className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10 cursor-pointer"
                  title="حذف القائمة"
                >
                  <Trash2 size={8} className="text-white" />
                </button>
              </div>
            ))}

            <button
              onClick={() => setShowAddList(!showAddList)}
              className="px-2.5 py-1 text-[11px] font-bold rounded-lg whitespace-nowrap flex items-center gap-1 bg-neutral-900/50 text-neutral-400 hover:text-white border border-dashed border-neutral-700 shrink-0 cursor-pointer"
            >
              <Plus size={12} /> قائمة
            </button>
          </div>

          <AnimatePresence>
            {showAddList && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="flex gap-2 items-center pt-1"
              >
                <input 
                  type="text" 
                  placeholder="اسم القائمة المخصصة..." 
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  className="flex-1 bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-1.5 text-xs text-white focus:border-purple-500 outline-none"
                  autoFocus
                />
                <button 
                  onClick={handleCreateList}
                  className="bg-purple-600 text-white px-3 py-1.5 rounded-xl font-bold text-xs cursor-pointer"
                >
                  حفظ
                </button>
                <button 
                  onClick={() => setShowAddList(false)}
                  className="bg-neutral-800 text-white px-3 py-1.5 rounded-xl font-bold text-xs cursor-pointer"
                >
                  إلغاء
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className={isListMode ? 'p-2 md:p-4' : 'p-0 md:p-4'}>
          {loading ? (
            <div className={getLayoutGridClasses(layoutMode)}>
              {[...Array(14)].map((_, i) => (
                <div
                  key={i}
                  className={`${
                    isListMode ? 'h-32 rounded-xl' : 'aspect-[3/4]'
                  } bg-neutral-900 animate-pulse border border-white/10`}
                />
              ))}
            </div>
          ) : currentDisplayEntries.length > 0 ? (
            <div className={getLayoutGridClasses(layoutMode)}>
              {currentDisplayEntries.map((anime: any, idx) => {
                const cleanTitle = cleanAnimeTitle(anime.title || 'Anime');
                const targetId = anime.animeId || anime.id;
                const statusInfo = MAIN_LISTS.find((m) => m.id === anime.status)?.label || 'محفوظ';
                const shortType = getShortTypeCode(anime.type || 'TV');
                const scoreVal = typeof anime.score === 'number' && anime.score > 0 ? anime.score.toFixed(1) : null;
                const seasonLabel = getArabicSeasonLabel(anime.season, anime.releaseYear);
                const watchedCount = anime.progress || (Array.isArray(anime.watchedEpisodes) ? anime.watchedEpisodes.length : 0);
                const totalEps = anime.episodesCount || 0;

                if (isListMode) {
                  return (
                    <div
                      key={`${anime.id}-${idx}`}
                      onClick={() => onAnimeClick(targetId)}
                      onMouseEnter={() => clientCache.prefetchDetails(targetId)}
                      className="cursor-pointer group flex items-stretch bg-neutral-900/95 border border-neutral-800/90 hover:border-purple-500/60 rounded-xl transition-all overflow-hidden relative shadow-md min-h-[124px] sm:min-h-[132px]"
                    >
                      <div className="w-24 sm:w-28 shrink-0 bg-neutral-950 relative border-l border-white/10 overflow-hidden">
                        <img
                          src={anime.posterUrl || 'https://via.placeholder.com/300x400?text=Anime'}
                          alt={cleanTitle}
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      </div>

                      <div className="flex-1 min-w-0 flex flex-col justify-center items-start text-right gap-1.5 p-2.5 sm:p-3">
                        <h3
                          className="w-full font-black text-sm sm:text-base text-white group-hover:text-purple-400 transition-colors line-clamp-1 leading-snug text-right"
                          dir="auto"
                        >
                          {cleanTitle}
                        </h3>

                        <div className="flex flex-wrap items-center justify-start gap-1.5 text-[10px] sm:text-xs font-bold">
                          {scoreVal && (
                            <span className="bg-yellow-500/15 border border-yellow-500/30 text-yellow-400 px-2 py-0.5 rounded-lg flex items-center gap-1" dir="ltr">
                              <Star size={10} fill="currentColor" />
                              <span>{scoreVal}</span>
                            </span>
                          )}
                          <span className="bg-neutral-800 text-neutral-200 px-2 py-0.5 rounded-lg flex items-center gap-1" dir="ltr">
                            <Tv size={10} className="text-neutral-400" />
                            <span>{shortType}</span>
                          </span>
                          <span className="bg-purple-600/20 border border-purple-500/30 text-purple-300 px-2 py-0.5 rounded-lg flex items-center gap-1">
                            <CheckCircle2 size={10} />
                            <span>{statusInfo}</span>
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center justify-start gap-1.5 text-[10px] text-neutral-400 font-bold">
                          {seasonLabel && (
                            <span className="flex items-center gap-1 bg-neutral-950/90 border border-white/10 text-neutral-300 px-2 py-0.5 rounded-md">
                              <Calendar size={10} className="text-neutral-400" />
                              <span>{seasonLabel}</span>
                            </span>
                          )}
                          {(watchedCount > 0 || totalEps > 0) && (
                            <span className="flex items-center gap-1 bg-neutral-950/90 border border-white/10 text-neutral-300 px-2 py-0.5 rounded-md">
                              <Layers size={10} className="text-neutral-400" />
                              <span>
                                {watchedCount} / {totalEps > 0 ? totalEps : '?'} حلقة
                              </span>
                            </span>
                          )}
                        </div>
                      </div>

                      <button
                        title="حذف من المكتبة"
                        onClick={(e) => removeEntry(anime.id, e)}
                        className="w-9 h-9 self-center rounded-xl bg-neutral-800/80 flex items-center justify-center text-red-400 hover:bg-red-500 hover:text-white transition-colors shrink-0 ml-2.5 cursor-pointer"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  );
                }

                return (
                  <div 
                    key={`${anime.id}-${idx}`} 
                    onClick={() => onAnimeClick(targetId)}
                    onMouseEnter={() => clientCache.prefetchDetails(targetId)}
                    className="cursor-pointer group relative aspect-[3/4] overflow-hidden bg-neutral-950 border-b border-l border-white/10"
                  >
                    <img 
                      src={anime.posterUrl || "https://via.placeholder.com/300x400?text=Anime"} 
                      alt={cleanTitle} 
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                    />

                    <div className="absolute top-1.5 inset-x-1.5 z-10 flex items-center justify-between gap-1" dir="ltr">
                      <div className="flex items-center gap-1 pointer-events-none">
                        <span className="bg-black/80 backdrop-blur-md text-white px-1.5 py-0.5 rounded text-[9px] sm:text-[10px] font-black border border-white/15 uppercase tracking-tight">
                          {shortType}
                        </span>
                        {scoreVal && (
                          <span className="bg-black/80 backdrop-blur-md text-yellow-400 px-1.5 py-0.5 rounded flex items-center gap-0.5 text-[9px] sm:text-[10px] font-black border border-white/15">
                            <Star size={8} fill="currentColor" />
                            <span>{scoreVal}</span>
                          </span>
                        )}
                      </div>

                      <button 
                        title="حذف من المكتبة"
                        onClick={(e) => removeEntry(anime.id, e)}
                        className="w-6 h-6 rounded-md bg-black/80 backdrop-blur-md flex items-center justify-center text-red-400 hover:bg-red-500 hover:text-white transition-colors cursor-pointer border border-white/10"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>

                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/70 to-transparent pt-8 pb-2 px-2 pointer-events-none flex flex-col justify-end">
                      <h3
                        className={`font-black ${
                          isLargeGrid ? 'text-xs sm:text-sm' : 'text-[10px] sm:text-xs'
                        } text-white group-hover:text-purple-400 transition-colors line-clamp-2 text-center leading-tight drop-shadow`}
                        dir="ltr"
                      >
                        {cleanTitle}
                      </h3>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 m-4 text-center border border-neutral-800/40 rounded-2xl bg-neutral-900/20">
              <FolderPlus size={36} className="text-neutral-600 mb-3" />
              <p className="text-neutral-400 font-bold text-sm mb-1">القائمة فارغة</p>
              <p className="text-xs text-neutral-500 max-w-xs leading-relaxed">
                تصفح الأنميات وقم بإضافتها إلى قوائمك من صفحة تفاصيل الأنمي لمتابعتها لاحقاً.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
