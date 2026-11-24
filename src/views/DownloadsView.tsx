import React, { useMemo, useState } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Download,
  Pause,
  Play,
  RotateCcw,
  Trash2,
  ExternalLink,
  FolderDown,
  PauseCircle,
  PlayCircle,
  X,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Tv,
  BookOpen,
} from 'lucide-react';
import {
  downloadManagerService,
  useDownloadQueue,
  formatBytes,
  formatSpeed,
  formatQualityLabel,
  type DownloadQueueItem,
} from '../services/downloadManagerService';
import ViewportPortal from '../components/ViewportPortal';

interface DownloadsViewProps {
  onBack: () => void;
  onExplore?: () => void;
  onOpenAnime?: (animeId: string) => void;
  onOpenManga?: (mangaId: string) => void;
  onOpenOfflineChapter?: (item: DownloadQueueItem) => void;
}

type FilterKey = 'all' | 'active' | 'completed' | 'paused';
type MediaScope = 'all' | 'anime' | 'manga';

interface WorkGroup {
  groupKey: string;
  itemType: 'episode' | 'chapter';
  workId: string;
  title: string;
  posterUrl?: string;
  items: DownloadQueueItem[];
  activeCount: number;
  completedCount: number;
  pausedCount: number;
  failedCount: number;
  totalBytes: number;
  downloadedBytes: number;
  avgProgress: number;
  latestUpdatedAt: number;
}

function parseNumericOrder(val?: string | number): number {
  const match = String(val || '').match(/(\d+(?:\.\d+)?)/);
  return match ? parseFloat(match[1]) : Number.MAX_SAFE_INTEGER;
}

export default function DownloadsView({
  onBack,
  onExplore,
  onOpenAnime,
  onOpenManga,
  onOpenOfflineChapter,
}: DownloadsViewProps) {
  const items = useDownloadQueue();
  const [filter, setFilter] = useState<FilterKey>('all');
  const [mediaScope, setMediaScope] = useState<MediaScope>('all');
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [playingOffline, setPlayingOffline] = useState<{
    title: string;
    url: string;
  } | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const counts = useMemo(() => {
    let active = 0;
    let completed = 0;
    let paused = 0;
    let failed = 0;
    let animeCount = 0;
    let mangaCount = 0;
    for (const item of items) {
      if (item.itemType === 'chapter') mangaCount++;
      else animeCount++;
      if (item.status === 'queued' || item.status === 'resolving' || item.status === 'downloading') {
        active++;
      } else if (item.status === 'completed') {
        completed++;
      } else {
        paused++;
        if (item.status === 'failed') failed++;
      }
    }
    return { all: items.length, active, completed, paused, failed, animeCount, mangaCount };
  }, [items]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (mediaScope === 'anime' && item.itemType === 'chapter') return false;
      if (mediaScope === 'manga' && item.itemType !== 'chapter') return false;
      if (filter === 'all') return true;
      if (filter === 'active') {
        return item.status === 'queued' || item.status === 'resolving' || item.status === 'downloading';
      }
      if (filter === 'completed') return item.status === 'completed';
      return item.status === 'paused' || item.status === 'failed';
    });
  }, [items, filter, mediaScope]);

  const groupedWorks = useMemo<WorkGroup[]>(() => {
    const map = new Map<string, WorkGroup>();

    for (const item of filteredItems) {
      const isChapter = item.itemType === 'chapter';
      const workId = String(isChapter ? item.mangaId || item.animeId : item.animeId || item.animeTitle);
      const groupKey = `${isChapter ? 'manga' : 'anime'}:${workId || item.animeTitle}`;

      let group = map.get(groupKey);
      if (!group) {
        group = {
          groupKey,
          itemType: isChapter ? 'chapter' : 'episode',
          workId,
          title: item.animeTitle || (isChapter ? 'مانجا' : 'أنمي'),
          posterUrl: item.posterUrl,
          items: [],
          activeCount: 0,
          completedCount: 0,
          pausedCount: 0,
          failedCount: 0,
          totalBytes: 0,
          downloadedBytes: 0,
          avgProgress: 0,
          latestUpdatedAt: item.updatedAt || item.createdAt || 0,
        };
        map.set(groupKey, group);
      }

      if (!group.posterUrl && item.posterUrl) group.posterUrl = item.posterUrl;
      group.items.push(item);
      group.latestUpdatedAt = Math.max(group.latestUpdatedAt, item.updatedAt || item.createdAt || 0);

      if (item.status === 'queued' || item.status === 'resolving' || item.status === 'downloading') {
        group.activeCount++;
      } else if (item.status === 'completed') {
        group.completedCount++;
      } else if (item.status === 'failed') {
        group.failedCount++;
        group.pausedCount++;
      } else {
        group.pausedCount++;
      }

      const itemSize = item.totalBytes > 0 ? item.totalBytes : item.downloadedBytes || 0;
      group.totalBytes += itemSize;
      group.downloadedBytes += item.downloadedBytes || 0;
    }

    const groups = Array.from(map.values());
    for (const g of groups) {
      g.items.sort((a, b) => {
        if ((a.seasonNumber || 1) !== (b.seasonNumber || 1)) {
          return (a.seasonNumber || 1) - (b.seasonNumber || 1);
        }
        return (
          parseNumericOrder(a.chapterNum || a.episodeNum) -
          parseNumericOrder(b.chapterNum || b.episodeNum)
        );
      });
      const sumPct = g.items.reduce(
        (acc, it) => acc + (it.status === 'completed' ? 100 : Math.max(0, it.progress || 0)),
        0,
      );
      g.avgProgress = g.items.length > 0 ? Math.round(sumPct / g.items.length) : 0;
    }

    groups.sort((a, b) => {
      if (a.activeCount > 0 && b.activeCount === 0) return -1;
      if (b.activeCount > 0 && a.activeCount === 0) return 1;
      return b.latestUpdatedAt - a.latestUpdatedAt;
    });

    return groups;
  }, [filteredItems]);

  const isGroupExpanded = (group: WorkGroup, index: number): boolean => {
    if (Object.prototype.hasOwnProperty.call(expandedGroups, group.groupKey)) {
      return expandedGroups[group.groupKey];
    }
    return group.activeCount > 0 || index === 0 || groupedWorks.length <= 2;
  };

  const toggleGroup = (group: WorkGroup, index: number) => {
    const current = isGroupExpanded(group, index);
    setExpandedGroups((prev) => ({ ...prev, [group.groupKey]: !current }));
  };

  const handleRemoveGroup = (group: WorkGroup) => {
    for (const item of group.items) {
      downloadManagerService.removeItem(item.id);
    }
  };

  const handlePlayOffline = async (item: DownloadQueueItem) => {
    const objUrl = await downloadManagerService.getOfflineVideoUrl(item.id);
    if (!objUrl) {
      setFeedback('تم حفظ الحلقة على جهازك؛ يمكنك تشغيلها مباشرة من مجلد التنزيلات في الجهاز.');
      setTimeout(() => setFeedback(null), 4000);
      return;
    }
    setPlayingOffline({
      title: `${item.animeTitle} · الحلقة ${item.episodeNum}`,
      url: objUrl,
    });
  };

  const closeOfflinePlayer = () => {
    if (playingOffline?.url) {
      try {
        URL.revokeObjectURL(playingOffline.url);
      } catch {}
    }
    setPlayingOffline(null);
  };

  const handleSaveDevice = async (item: DownloadQueueItem) => {
    const ok = await downloadManagerService.saveItemToDevice(item.id);
    if (!ok) {
      setFeedback('تعذر العثور على الملف المحفوظ، يرجى إعادة المحاولة.');
      setTimeout(() => setFeedback(null), 3500);
    }
  };

  const handleExternalHandoff = async (item: DownloadQueueItem) => {
    const ok = await downloadManagerService.sendItemToExternalManager(item.id);
    if (!ok) {
      setFeedback('الرابط غير متاح للتمرير الخارجي حالياً.');
      setTimeout(() => setFeedback(null), 3500);
    }
  };

  const renderRowSubtitle = (item: DownloadQueueItem): string => {
    const isChapter = item.itemType === 'chapter';
    const qualityOrLang = isChapter
      ? item.resolvedQuality || 'عربي'
      : formatQualityLabel(item.resolvedQuality || item.requestedQuality);

    switch (item.status) {
      case 'queued':
        return `${qualityOrLang} · في الانتظار`;
      case 'resolving':
        return isChapter ? 'جاري تجهيز الصفحات...' : 'جاري تجهيز الرابط...';
      case 'downloading': {
        const parts: string[] = [
          !isChapter && item.totalBytes <= 0 && item.progress > 0
            ? `~${item.progress}%`
            : `${item.progress}%`,
        ];
        if (isChapter) {
          parts.push(`${item.downloadedPages || 0}/${item.totalPages || '?'} صفحة`);
        } else if (item.downloadedBytes > 0) {
          parts.push(
            item.totalBytes > 0
              ? `${formatBytes(item.downloadedBytes)} / ${formatBytes(item.totalBytes)}`
              : formatBytes(item.downloadedBytes),
          );
        }
        const spd = formatSpeed(item.speedBps);
        if (spd && !isChapter) parts.push(spd);
        return parts.join(' · ');
      }
      case 'paused':
        return `${qualityOrLang} · متوقف مؤقتاً`;
      case 'completed':
        if (isChapter) {
          return item.totalPages
            ? `${qualityOrLang} · ${item.totalPages} صفحة`
            : `${qualityOrLang} · مكتمل`;
        }
        if (item.targetMode === 'external') return `${qualityOrLang} · عبر تنزيل خارجي`;
        return item.totalBytes > 0
          ? `${qualityOrLang} · ${formatBytes(item.totalBytes)}`
          : `${qualityOrLang} · مكتمل`;
      case 'failed':
        return item.errorMessage || 'تعذر التنزيل';
    }
  };

  return (
    <div
      className="min-h-[var(--vv-height,100dvh)] bg-black text-neutral-100 pb-24 font-sans"
      dir="rtl"
    >
      {/* Top App Bar */}
      <header className="sticky top-0 z-30 bg-black/90 backdrop-blur-md border-b border-white/10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={onBack}
              aria-label="رجوع"
              className="min-w-[44px] min-h-[44px] rounded-full bg-transparent hover:bg-white/5 flex items-center justify-center text-neutral-200 transition cursor-pointer shrink-0"
            >
              <ChevronRight size={22} strokeWidth={2.3} />
            </button>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-black text-white truncate">
                مدير التنزيلات
              </h1>
              <p className="text-xs text-neutral-400 tabular-nums truncate">
                {groupedWorks.length} عمل · {counts.active} نشط · {counts.completed} مكتمل
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {counts.active > 0 && (
              <button
                type="button"
                onClick={() => downloadManagerService.pauseAll()}
                className="min-h-[40px] px-3 py-1.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-xs font-bold text-neutral-200 flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap"
              >
                <PauseCircle size={15} />
                <span className="hidden sm:inline">إيقاف الكل</span>
              </button>
            )}
            {counts.failed > 0 && (
              <button
                type="button"
                onClick={() => downloadManagerService.retryAllFailed()}
                className="min-h-[40px] px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-xs font-black text-white flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap"
              >
                <RotateCcw size={15} />
                <span className="hidden sm:inline">إعادة الفاشلة ({counts.failed})</span>
              </button>
            )}
            {counts.paused > 0 && (
              <button
                type="button"
                onClick={() => downloadManagerService.resumeAll()}
                className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[#FF1744] hover:bg-red-600 text-xs font-black text-white flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap"
              >
                <PlayCircle size={15} />
                <span className="hidden sm:inline">استئناف الكل</span>
              </button>
            )}
            {counts.completed > 0 && (
              <button
                type="button"
                onClick={() => downloadManagerService.clearCompleted()}
                className="min-h-[40px] px-3 py-1.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-xs font-bold text-neutral-400 hover:text-white transition cursor-pointer whitespace-nowrap"
              >
                مسح المكتملة
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 pt-4 space-y-4">
        {feedback && (
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-xs font-bold text-neutral-200 flex items-center justify-between gap-3">
            <span>{feedback}</span>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="text-neutral-400 hover:text-white cursor-pointer"
            >
              <X size={15} />
            </button>
          </div>
        )}

        {/* Filter Controls */}
        <div className="flex flex-col sm:flex-row gap-2.5">
          <div className="flex-1 grid grid-cols-4 bg-neutral-900/90 border border-neutral-800/80 rounded-xl p-1 gap-1">
            {(
              [
                { id: 'all', label: `الكل (${counts.all})` },
                { id: 'active', label: `النشطة (${counts.active})` },
                { id: 'completed', label: `المكتملة (${counts.completed})` },
                { id: 'paused', label: `المتوقفة (${counts.paused})` },
              ] as { id: FilterKey; label: string }[]
            ).map((tab) => {
              const active = filter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilter(tab.id)}
                  className={`min-h-[38px] px-2 rounded-lg text-[11px] sm:text-xs font-black transition cursor-pointer whitespace-nowrap truncate tabular-nums ${
                    active
                      ? 'bg-[#1f1f29] text-white shadow-sm'
                      : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {counts.animeCount > 0 && counts.mangaCount > 0 && (
            <div className="grid grid-cols-3 bg-neutral-900/90 border border-neutral-800/80 rounded-xl p-1 gap-1 sm:w-56">
              {(
                [
                  { id: 'all', label: 'الكل' },
                  { id: 'anime', label: 'أنمي' },
                  { id: 'manga', label: 'مانجا' },
                ] as { id: MediaScope; label: string }[]
              ).map((scope) => (
                <button
                  key={scope.id}
                  type="button"
                  onClick={() => setMediaScope(scope.id)}
                  className={`min-h-[38px] px-2 rounded-lg text-[11px] font-black transition cursor-pointer whitespace-nowrap ${
                    mediaScope === scope.id
                      ? 'bg-[#FF1744] text-white'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  {scope.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Grouped Works List */}
        {groupedWorks.length === 0 ? (
          <div className="bg-[#0f0f13] border border-neutral-800/80 rounded-2xl p-10 text-center flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-neutral-900 border border-neutral-800 flex items-center justify-center text-neutral-400">
              <Download size={26} />
            </div>
            <h2 className="text-base font-black text-white">لا توجد تنزيلات في هذه القائمة</h2>
            <p className="text-xs text-neutral-400 max-w-md leading-relaxed">
              عند تنزيل حلقات أنمي أو فصول مانجا ومانهوا ستتجمع هنا مرتبة تحت عنوان كل عمل لسهولة الوصول والتشغيل أوفلاين.
            </p>
            {onExplore && (
              <button
                type="button"
                onClick={onExplore}
                className="min-h-[44px] mt-1 px-5 py-2 rounded-xl bg-[#FF1744] hover:bg-red-600 text-white text-xs font-black transition cursor-pointer"
              >
                تصفح الأنميات
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {groupedWorks.map((group, groupIdx) => {
              const expanded = isGroupExpanded(group, groupIdx);
              const isChapterGroup = group.itemType === 'chapter';
              const unitSingular = isChapterGroup ? 'فصل' : 'حلقة';
              const unitPlural = isChapterGroup ? 'فصول' : 'حلقات';
              const countLabel =
                group.items.length === 1
                  ? `${unitSingular} واحد`
                  : group.items.length === 2
                    ? isChapterGroup
                      ? 'فصلان'
                      : 'حلقتان'
                    : group.items.length <= 10
                      ? `${group.items.length} ${unitPlural}`
                      : `${group.items.length} ${unitSingular}`;

              const metaParts = [
                isChapterGroup ? 'مانجا ومانهوا' : 'أنمي',
                countLabel,
              ];
              if (group.completedCount > 0 && group.completedCount < group.items.length) {
                metaParts.push(`${group.completedCount} مكتمل`);
              } else if (group.completedCount === group.items.length) {
                metaParts.push('مكتمل');
              }
              if (group.activeCount > 0) {
                metaParts.push(`جاري التنزيل ${group.avgProgress}%`);
              }
              if (group.totalBytes > 0) {
                metaParts.push(formatBytes(group.totalBytes));
              }

              return (
                <section
                  key={group.groupKey}
                  className="bg-[#0f0f13] border border-neutral-800/90 rounded-2xl overflow-hidden"
                >
                  {/* Series / Work Group Header */}
                  <div className="flex items-center gap-3 p-3.5 sm:p-4">
                    <button
                      type="button"
                      onClick={() => {
                        if (isChapterGroup) {
                          onOpenManga?.(group.workId);
                        } else {
                          onOpenAnime?.(group.workId);
                        }
                      }}
                      aria-label={`فتح صفحة ${group.title}`}
                      className="w-12 h-16 rounded-xl bg-neutral-900 border border-white/10 overflow-hidden shrink-0 cursor-pointer flex items-center justify-center"
                    >
                      {group.posterUrl ? (
                        <img
                          src={group.posterUrl}
                          alt={group.title}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      ) : isChapterGroup ? (
                        <BookOpen size={18} className="text-neutral-500" />
                      ) : (
                        <Tv size={18} className="text-neutral-500" />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => toggleGroup(group, groupIdx)}
                      aria-expanded={expanded}
                      className="flex-1 min-w-0 text-right cursor-pointer py-1"
                    >
                      <h2 className="text-sm sm:text-base font-black text-white truncate">
                        {group.title}
                      </h2>
                      <p className="text-xs text-neutral-400 mt-1 tabular-nums truncate">
                        {metaParts.join(' · ')}
                      </p>
                      {group.activeCount > 0 && (
                        <div className="w-full h-1 bg-neutral-800 rounded-full overflow-hidden mt-2">
                          <div
                            className="h-full bg-[#FF1744] rounded-full transition-all duration-300"
                            style={{ width: `${Math.max(4, group.avgProgress)}%` }}
                          />
                        </div>
                      )}
                    </button>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleRemoveGroup(group)}
                        title="حذف تنزيلات هذا العمل"
                        aria-label={`حذف تنزيلات ${group.title}`}
                        className="min-w-[40px] min-h-[40px] rounded-full hover:bg-red-950/50 text-neutral-400 hover:text-red-400 flex items-center justify-center transition cursor-pointer"
                      >
                        <Trash2 size={17} />
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleGroup(group, groupIdx)}
                        aria-label={expanded ? 'طي القائمة' : 'عرض القائمة'}
                        className="min-w-[40px] min-h-[40px] rounded-full hover:bg-white/5 text-neutral-300 hover:text-white flex items-center justify-center transition cursor-pointer"
                      >
                        <ChevronDown
                          size={20}
                          className={`transition-transform duration-200 ${
                            expanded ? 'rotate-180' : ''
                          }`}
                        />
                      </button>
                    </div>
                  </div>

                  {/* Clean Expandable Simple List of Episodes / Chapters */}
                  {expanded && (
                    <div className="border-t border-white/[0.06] bg-black/35 divide-y divide-white/[0.06]">
                      {group.items.map((item) => {
                        const isBusy =
                          item.status === 'queued' ||
                          item.status === 'resolving' ||
                          item.status === 'downloading';
                        const isCompleted = item.status === 'completed';
                        const isFailed = item.status === 'failed';
                        const isChapter = item.itemType === 'chapter';

                        const rowTitle = isChapter
                          ? item.chapterTitle || `الفصل ${item.chapterNum || item.episodeNum}`
                          : `${item.episodeTitle || `الحلقة ${item.episodeNum}`}${
                              item.seasonNumber > 1 ? ` · الموسم ${item.seasonNumber}` : ''
                            }`;

                        return (
                          <div
                            key={item.id}
                            className="px-3.5 sm:px-4 py-2.5 flex items-center justify-between gap-3"
                          >
                            {/* Row Label & Status */}
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                              <span className="shrink-0">
                                {isCompleted ? (
                                  <CheckCircle2 size={16} className="text-emerald-400" />
                                ) : isFailed ? (
                                  <AlertTriangle size={16} className="text-amber-400" />
                                ) : isBusy ? (
                                  <Loader2 size={16} className="text-[#FF1744] animate-spin" />
                                ) : (
                                  <Pause size={16} className="text-neutral-400" />
                                )}
                              </span>

                              <div className="min-w-0 flex-1">
                                <div className="text-xs sm:text-sm font-bold text-neutral-100 truncate tabular-nums">
                                  {rowTitle}
                                </div>
                                <div className="text-[11px] text-neutral-400 truncate tabular-nums mt-0.5">
                                  {renderRowSubtitle(item)}
                                </div>
                                {!isCompleted && (
                                  <div className="w-full h-1 bg-neutral-900 rounded-full overflow-hidden mt-1.5">
                                    <div
                                      className={`h-full rounded-full transition-all duration-300 ${
                                        isFailed
                                          ? 'bg-amber-500'
                                          : item.status === 'paused'
                                            ? 'bg-neutral-500'
                                            : 'bg-[#FF1744]'
                                      }`}
                                      style={{
                                        width: `${
                                          item.status === 'resolving'
                                            ? 12
                                            : Math.max(0, Math.min(100, item.progress || 0))
                                        }%`,
                                      }}
                                    />
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Simple Inline Actions */}
                            <div className="flex items-center gap-1.5 shrink-0">
                              {isBusy && (
                                <button
                                  type="button"
                                  onClick={() => downloadManagerService.pauseItem(item.id)}
                                  title="إيقاف مؤقت"
                                  aria-label="إيقاف مؤقت"
                                  className="min-w-[38px] min-h-[38px] rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-200 flex items-center justify-center transition cursor-pointer"
                                >
                                  <Pause size={15} />
                                </button>
                              )}

                              {item.status === 'paused' && (
                                <button
                                  type="button"
                                  onClick={() => downloadManagerService.resumeItem(item.id)}
                                  title="استئناف"
                                  aria-label="استئناف"
                                  className="min-w-[38px] min-h-[38px] rounded-xl bg-[#FF1744] hover:bg-red-600 text-white flex items-center justify-center transition cursor-pointer"
                                >
                                  <Play size={15} fill="currentColor" />
                                </button>
                              )}

                              {isFailed && (
                                <button
                                  type="button"
                                  onClick={() => downloadManagerService.retryItem(item.id)}
                                  title="إعادة المحاولة"
                                  aria-label="إعادة المحاولة"
                                  className="min-h-[38px] px-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-xs font-black text-white flex items-center gap-1 transition cursor-pointer"
                                >
                                  <RotateCcw size={14} />
                                  <span className="hidden sm:inline">إعادة</span>
                                </button>
                              )}

                              {isCompleted && item.hasOfflineFile && isChapter && (
                                <button
                                  type="button"
                                  onClick={() => onOpenOfflineChapter?.(item)}
                                  className="min-h-[38px] px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-black text-white flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap"
                                >
                                  <BookOpen size={14} />
                                  <span>قراءة</span>
                                </button>
                              )}

                              {isCompleted && item.hasOfflineFile && !isChapter && (
                                <button
                                  type="button"
                                  onClick={() => void handlePlayOffline(item)}
                                  className="min-h-[38px] px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-black text-white flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap"
                                >
                                  <Play size={14} fill="currentColor" />
                                  <span>تشغيل</span>
                                </button>
                              )}

                              {isCompleted && item.targetMode === 'internal' && !isChapter && (
                                <button
                                  type="button"
                                  onClick={() => void handleSaveDevice(item)}
                                  title="حفظ على الجهاز"
                                  aria-label="حفظ على الجهاز"
                                  className="min-w-[38px] min-h-[38px] rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-200 flex items-center justify-center transition cursor-pointer"
                                >
                                  <FolderDown size={15} />
                                </button>
                              )}

                              {!isChapter && (item.externalDirectUrl || item.downloadUrl) && (
                                <button
                                  type="button"
                                  onClick={() => void handleExternalHandoff(item)}
                                  title="تنزيل خارجي"
                                  aria-label="تنزيل خارجي"
                                  className="min-w-[38px] min-h-[38px] rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 flex items-center justify-center transition cursor-pointer"
                                >
                                  <ExternalLink size={15} />
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => downloadManagerService.removeItem(item.id)}
                                title="حذف"
                                aria-label="حذف"
                                className="min-w-[38px] min-h-[38px] rounded-full hover:bg-red-950/50 text-neutral-400 hover:text-red-400 flex items-center justify-center transition cursor-pointer"
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </main>

      {/* Offline Video Player Overlay */}
      <ViewportPortal>
        {playingOffline && (
          <div
            className="theme-keep-dark fixed inset-0 z-[150] bg-black/95 flex flex-col items-center justify-center p-4"
            dir="rtl"
          >
            <div className="w-full max-w-4xl flex items-center justify-between gap-3 mb-3">
              <h3 className="text-sm sm:text-base font-black text-white truncate">
                {playingOffline.title}
              </h3>
              <button
                type="button"
                onClick={closeOfflinePlayer}
                aria-label="إغلاق المشغل"
                className="min-w-[44px] min-h-[44px] rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-white flex items-center justify-center cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>
            <video
              key={playingOffline.url}
              src={playingOffline.url}
              controls
              autoPlay
              playsInline
              className="w-full max-w-4xl aspect-video bg-black rounded-2xl border border-white/10"
            />
          </div>
        )}
      </ViewportPortal>
    </div>
  );
}
