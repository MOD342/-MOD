import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ChevronRight,
  History,
  Play,
  BookOpen,
  Trash2,
  Tv,
  AlertTriangle,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { watchHistoryService, type LocalWatchHistoryItem } from '../services/listService';
import { mangaListService, type ReadingHistoryItem } from '../services/mangaListService';
import { FALLBACK_POSTER_DATA_URL } from '../utils/posterFallback';

interface HistoryViewProps {
  onBack: () => void;
  onResumeAnime: (id: string, epNum?: string) => void;
  onResumeMangaDetails: (id: string) => void;
  onReadMangaChapter: (params: {
    manga: any;
    chapter: any;
    chapters: any[];
    initialPage?: number;
  }) => void;
}

type HistoryFilter = 'all' | 'anime' | 'manga';

type UnifiedHistoryEntry =
  | {
      kind: 'anime';
      key: string;
      updatedAt: number;
      data: LocalWatchHistoryItem;
    }
  | {
      kind: 'manga';
      key: string;
      updatedAt: number;
      data: ReadingHistoryItem;
    };

function formatRelativeTimeAr(timestamp?: number): string {
  if (!timestamp || timestamp <= 0) return 'الآن';
  const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSec < 60) return 'الآن';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `منذ ${diffMin} د`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `منذ ${diffHr} س`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `منذ ${diffDay} ي`;
  try {
    return new Date(timestamp).toLocaleDateString('ar-EG', {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '';
  }
}

export default function HistoryView({
  onBack,
  onResumeAnime,
  onResumeMangaDetails,
  onReadMangaChapter,
}: HistoryViewProps) {
  const { user, userData } = useAuth();
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [animeHistory, setAnimeHistory] = useState<LocalWatchHistoryItem[]>([]);
  const [mangaHistory, setMangaHistory] = useState<ReadingHistoryItem[]>([]);

  const reloadHistory = useCallback(() => {
    const uid = user?.id;
    const privacy = userData?.privacySettings;
    setAnimeHistory(watchHistoryService.getLocalHistory(uid, privacy));
    setMangaHistory(mangaListService.getReadingHistory(uid, privacy));
  }, [user?.id, userData?.privacySettings]);

  useEffect(() => {
    reloadHistory();
    const handleUpdate = () => reloadHistory();
    window.addEventListener('manga-history-updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);
    window.addEventListener('focus', handleUpdate);
    return () => {
      window.removeEventListener('manga-history-updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
      window.removeEventListener('focus', handleUpdate);
    };
  }, [reloadHistory]);

  const unifiedEntries = useMemo<UnifiedHistoryEntry[]>(() => {
    const items: UnifiedHistoryEntry[] = [
      ...animeHistory.map((item) => ({
        kind: 'anime' as const,
        key: `anime-${item.id}`,
        updatedAt: Number(item.updatedAt) || 0,
        data: item,
      })),
      ...mangaHistory.map((item) => ({
        kind: 'manga' as const,
        key: `manga-${item.mangaId}`,
        updatedAt: Number(item.updatedAt) || 0,
        data: item,
      })),
    ];
    return items.sort((a, b) => b.updatedAt - a.updatedAt);
  }, [animeHistory, mangaHistory]);

  const filteredEntries = useMemo(() => {
    if (filter === 'anime') return unifiedEntries.filter((e) => e.kind === 'anime');
    if (filter === 'manga') return unifiedEntries.filter((e) => e.kind === 'manga');
    return unifiedEntries;
  }, [unifiedEntries, filter]);

  const handleRemoveEntry = (entry: UnifiedHistoryEntry) => {
    const uid = user?.id;
    const privacy = userData?.privacySettings;
    if (entry.kind === 'anime') {
      watchHistoryService.removeItem(uid, entry.data.id, entry.data.updatedAt, privacy);
    } else {
      mangaListService.removeReadingHistoryItem(uid, entry.data.mangaId, entry.data.updatedAt, privacy);
    }
    reloadHistory();
  };

  const handleClearAllConfirmed = () => {
    const uid = user?.id;
    if (filter === 'all' || filter === 'anime') {
      watchHistoryService.clearAll(uid, animeHistory);
    }
    if (filter === 'all' || filter === 'manga') {
      mangaListService.clearReadingHistory(uid, mangaHistory);
    }
    setConfirmClearAll(false);
    reloadHistory();
  };

  const handleResumeManga = (item: ReadingHistoryItem) => {
    if (!item.chapterId) {
      onResumeMangaDetails(item.mangaId);
      return;
    }
    onReadMangaChapter({
      manga: {
        _id: item.mangaId,
        mangadexId: item.mangadexId || undefined,
        title: item.title,
        posterUrl: item.posterUrl,
        mediaFormat: item.mediaFormat,
        defaultReadingMode:
          item.mediaFormat === 'manhwa' || item.mediaFormat === 'manhua' ? 'webtoon' : 'paged',
      },
      chapter: {
        id: item.chapterId,
        num: item.chapterNum,
        chapterNumber: Number(item.chapterNum || 1),
        title: item.chapterTitle || `الفصل ${item.chapterNum}`,
      },
      chapters: [],
      initialPage: item.pageIndex || 1,
    });
  };

  const totalCount = unifiedEntries.length;

  return (
    <div className="min-h-screen bg-black text-white pb-24" dir="rtl" id="view_history_root">
      {/* شريط العنوان المدمج */}
      <header className="sticky top-0 z-20 bg-black/95 backdrop-blur-md border-b border-white/10">
        <div className="max-w-5xl mx-auto px-3.5 md:px-6 h-14 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={onBack}
              aria-label="رجوع"
              className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-neutral-200 hover:text-white transition cursor-pointer shrink-0"
            >
              <ChevronRight size={20} />
            </button>
            <div className="min-w-0">
              <h1 className="text-base font-black text-white flex items-center gap-2 truncate">
                <History size={18} className="text-[#FF1744] shrink-0" />
                <span>السجل</span>
              </h1>
              <p className="text-[11px] text-neutral-400 truncate">استكمال المشاهدة والقراءة</p>
            </div>
          </div>

          {filteredEntries.length > 0 && !confirmClearAll && (
            <button
              type="button"
              onClick={() => setConfirmClearAll(true)}
              className="min-h-[44px] px-3.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-[#FF1744] text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shrink-0"
            >
              <Trash2 size={14} />
              <span>مسح السجل</span>
            </button>
          )}
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-3.5 md:px-6 pt-4 space-y-4">
        {/* تأكيد المسح داخل الصفحة */}
        {confirmClearAll && (
          <div className="bg-[#111115] border border-red-500/30 rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-xs text-neutral-200">
              <AlertTriangle size={18} className="text-[#FF1744] shrink-0" />
              <span className="font-bold">
                {filter === 'anime'
                  ? 'هل تريد مسح سجل مشاهدة الأنمي بالكامل؟'
                  : filter === 'manga'
                  ? 'هل تريد مسح سجل قراءة المانجا بالكامل؟'
                  : 'هل تريد مسح سجل المشاهدة والقراءة بالكامل؟'}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleClearAllConfirmed}
                className="min-h-[44px] px-4 rounded-xl bg-[#FF1744] hover:bg-red-600 text-white text-xs font-black transition cursor-pointer"
              >
                تأكيد المسح
              </button>
              <button
                type="button"
                onClick={() => setConfirmClearAll(false)}
                className="min-h-[44px] px-4 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-300 text-xs font-bold transition cursor-pointer"
              >
                إلغاء
              </button>
            </div>
          </div>
        )}

        {/* أزرار التصفية */}
        <div className="grid grid-cols-3 gap-2 bg-[#111115] border border-white/5 p-1.5 rounded-2xl">
          <button
            type="button"
            onClick={() => {
              setFilter('all');
              setConfirmClearAll(false);
            }}
            className={`min-h-[44px] rounded-xl text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5 tabular-nums ${
              filter === 'all'
                ? 'bg-[#FF1744] text-white'
                : 'text-neutral-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <span>الكل ({totalCount})</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setFilter('anime');
              setConfirmClearAll(false);
            }}
            className={`min-h-[44px] rounded-xl text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5 tabular-nums ${
              filter === 'anime'
                ? 'bg-[#FF1744] text-white'
                : 'text-neutral-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Tv size={14} />
            <span>الأنمي ({animeHistory.length})</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setFilter('manga');
              setConfirmClearAll(false);
            }}
            className={`min-h-[44px] rounded-xl text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5 tabular-nums ${
              filter === 'manga'
                ? 'bg-amber-500 text-black font-black'
                : 'text-neutral-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <BookOpen size={14} />
            <span>المانجا ({mangaHistory.length})</span>
          </button>
        </div>

        {/* قائمة السجل */}
        {filteredEntries.length === 0 ? (
          <div className="bg-[#111115] border border-white/5 rounded-2xl py-16 px-4 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-white/5 mx-auto flex items-center justify-center text-neutral-400">
              <History size={24} />
            </div>
            <h2 className="text-sm font-black text-white">السجل فارغ حالياً</h2>
            <p className="text-xs text-neutral-400 max-w-xs mx-auto leading-relaxed">
              ابدأ بمشاهدة أي حلقة أنمي أو قراءة أي فصل مانجا ليظهر هنا تلقائياً للاستكمال السريع.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredEntries.map((entry) => {
              if (entry.kind === 'anime') {
                const item = entry.data;
                const progressPct = Math.min(100, Math.max(8, Number(item.progress) || 35));
                return (
                  <article
                    key={entry.key}
                    className="bg-[#111115] border border-white/5 hover:border-white/15 rounded-2xl p-3 flex gap-3 transition-colors"
                  >
                    <button
                      type="button"
                      onClick={() => onResumeAnime(item.id, item.lastEpisode)}
                      className="w-20 h-28 rounded-xl overflow-hidden bg-zinc-900 shrink-0 cursor-pointer block"
                      aria-label={item.title}
                    >
                      <img
                        src={item.posterUrl || FALLBACK_POSTER_DATA_URL}
                        alt={item.title}
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src = FALLBACK_POSTER_DATA_URL;
                        }}
                        className="w-full h-full object-cover"
                      />
                    </button>

                    <div className="flex-1 min-w-0 flex flex-col justify-between">
                      <div className="space-y-1.5">
                        <h3 className="text-sm font-bold text-white line-clamp-2 leading-snug">
                          {item.title}
                        </h3>
                        <p className="text-[11px] text-neutral-400 tabular-nums truncate">
                          أنمي · الحلقة {item.lastEpisode} · {formatRelativeTimeAr(item.updatedAt)}
                        </p>
                        <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[#FF1744] rounded-full"
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-2">
                        <button
                          type="button"
                          onClick={() => onResumeAnime(item.id, item.lastEpisode)}
                          className="flex-1 min-h-[44px] px-3 rounded-xl bg-[#FF1744] hover:bg-red-600 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer tabular-nums"
                        >
                          <Play size={14} className="fill-white" />
                          <span>استكمال الحلقة {item.lastEpisode}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveEntry(entry)}
                          aria-label={`حذف ${item.title} من السجل`}
                          className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl bg-white/5 hover:bg-red-500/15 text-neutral-400 hover:text-[#FF1744] flex items-center justify-center transition cursor-pointer shrink-0"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </article>
                );
              }

              const mItem = entry.data;
              const originAr =
                mItem.originLabel ||
                (mItem.mediaFormat === 'manhwa'
                  ? 'مانهوا'
                  : mItem.mediaFormat === 'manhua'
                  ? 'مانها'
                  : 'مانجا');
              const pct =
                mItem.totalPages > 0
                  ? Math.min(100, Math.max(8, Math.round(((mItem.pageIndex || 1) / mItem.totalPages) * 100)))
                  : 25;

              return (
                <article
                  key={entry.key}
                  className="bg-[#111115] border border-white/5 hover:border-white/15 rounded-2xl p-3 flex gap-3 transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => onResumeMangaDetails(mItem.mangaId)}
                    className="w-20 h-28 rounded-xl overflow-hidden bg-zinc-900 shrink-0 cursor-pointer block"
                    aria-label={mItem.title}
                  >
                    <img
                      src={mItem.posterUrl || FALLBACK_POSTER_DATA_URL}
                      alt={mItem.title}
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src = FALLBACK_POSTER_DATA_URL;
                      }}
                      className="w-full h-full object-cover"
                    />
                  </button>

                  <div className="flex-1 min-w-0 flex flex-col justify-between">
                    <div className="space-y-1.5">
                      <h3 className="text-sm font-bold text-white line-clamp-2 leading-snug">
                        {mItem.title}
                      </h3>
                      <p className="text-[11px] text-neutral-400 tabular-nums truncate">
                        {originAr} · الفصل {mItem.chapterNum}
                        {mItem.pageIndex > 0 ? ` · صفحة ${mItem.pageIndex}` : ''} · {formatRelativeTimeAr(mItem.updatedAt)}
                      </p>
                      <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-amber-400 rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => handleResumeManga(mItem)}
                        className="flex-1 min-h-[44px] px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-black flex items-center justify-center gap-1.5 transition cursor-pointer tabular-nums"
                      >
                        <BookOpen size={14} />
                        <span>استكمال الفصل {mItem.chapterNum}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveEntry(entry)}
                        aria-label={`حذف ${mItem.title} من السجل`}
                        className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl bg-white/5 hover:bg-red-500/15 text-neutral-400 hover:text-[#FF1744] flex items-center justify-center transition cursor-pointer shrink-0"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
