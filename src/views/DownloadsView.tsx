import React, { useMemo, useState } from 'react';
import {
  ChevronRight,
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
}

type FilterKey = 'all' | 'active' | 'completed' | 'paused';

export default function DownloadsView({ onBack, onExplore, onOpenAnime }: DownloadsViewProps) {
  const items = useDownloadQueue();
  const [filter, setFilter] = useState<FilterKey>('all');
  const [playingOffline, setPlayingOffline] = useState<{
    title: string;
    url: string;
  } | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const counts = useMemo(() => {
    let active = 0;
    let completed = 0;
    let paused = 0;
    for (const item of items) {
      if (item.status === 'queued' || item.status === 'resolving' || item.status === 'downloading') {
        active++;
      } else if (item.status === 'completed') {
        completed++;
      } else {
        paused++;
      }
    }
    return { all: items.length, active, completed, paused };
  }, [items]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (filter === 'all') return true;
      if (filter === 'active') {
        return item.status === 'queued' || item.status === 'resolving' || item.status === 'downloading';
      }
      if (filter === 'completed') return item.status === 'completed';
      return item.status === 'paused' || item.status === 'failed';
    });
  }, [items, filter]);

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

  const renderStatusText = (item: DownloadQueueItem) => {
    switch (item.status) {
      case 'queued':
        return 'في انتظار الدور';
      case 'resolving':
        return 'جاري تجهيز أفضل جودة متاحة...';
      case 'downloading': {
        const parts: string[] = [`${item.progress}%`];
        if (item.downloadedBytes > 0) {
          parts.push(
            item.totalBytes > 0
              ? `${formatBytes(item.downloadedBytes)} / ${formatBytes(item.totalBytes)}`
              : formatBytes(item.downloadedBytes),
          );
        }
        const spd = formatSpeed(item.speedBps);
        if (spd) parts.push(spd);
        return parts.join(' · ');
      }
      case 'paused':
        return 'متوقف مؤقتاً';
      case 'completed':
        return item.targetMode === 'external'
          ? 'تم الإرسال للتنزيل الخارجي'
          : item.totalBytes > 0
          ? `مكتمل · ${formatBytes(item.totalBytes)}`
          : 'اكتمل التنزيل';
      case 'failed':
        return item.errorMessage || 'تعذر التنزيل';
    }
  };

  return (
    <div
      className="min-h-[var(--vv-height,100dvh)] bg-black text-neutral-100 pb-24 font-sans"
      dir="rtl"
    >
      {/* Top Bar */}
      <header className="sticky top-0 z-30 bg-black/90 backdrop-blur-md border-b border-white/10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={onBack}
              aria-label="رجوع"
              className="min-w-[44px] min-h-[44px] rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 flex items-center justify-center text-neutral-200 transition cursor-pointer shrink-0"
            >
              <ChevronRight size={20} />
            </button>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-black text-white truncate">
                مدير التنزيلات
              </h1>
              <p className="text-xs text-neutral-400 tabular-nums truncate">
                {counts.active} قيد التنزيل · {counts.completed} مكتمل · {counts.all} إجمالي
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
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

      <main className="max-w-5xl mx-auto px-4 sm:px-6 pt-5 space-y-5">
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

        {/* Filter Segmented Bar */}
        <div className="grid grid-cols-4 bg-neutral-900/90 border border-neutral-800/80 rounded-xl p-1 gap-1">
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
                className={`min-h-[40px] px-2 rounded-lg text-[11px] sm:text-xs font-black transition cursor-pointer whitespace-nowrap truncate tabular-nums ${
                  active
                    ? 'bg-[#1a1a22] text-white shadow-sm'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Queue Items */}
        {filteredItems.length === 0 ? (
          <div className="bg-[#0f0f13] border border-neutral-800/80 rounded-2xl p-10 text-center flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-neutral-900 border border-neutral-800 flex items-center justify-center text-neutral-400">
              <Download size={26} />
            </div>
            <h2 className="text-base font-black text-white">لا توجد تنزيلات في هذه القائمة</h2>
            <p className="text-xs text-neutral-400 max-w-md leading-relaxed">
              يمكنك فتح أي أنمي والضغط على «تنزيل عدة حلقات» لاختيار الحلقات والجودة المناسبة، وسيتولى مدير التنزيلات تحميلها تلقائياً.
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
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
            {filteredItems.map((item) => {
              const isBusy =
                item.status === 'queued' ||
                item.status === 'resolving' ||
                item.status === 'downloading';
              const isCompleted = item.status === 'completed';
              const isFailed = item.status === 'failed';

              return (
                <article
                  key={item.id}
                  className="bg-[#0f0f13] border border-neutral-800/90 rounded-2xl p-4 flex flex-col gap-3.5"
                >
                  <div className="flex items-start gap-3">
                    {/* Poster Thumbnail */}
                    <button
                      type="button"
                      onClick={() => onOpenAnime && onOpenAnime(item.animeId)}
                      className="w-14 h-20 rounded-xl bg-neutral-900 border border-neutral-800 overflow-hidden shrink-0 cursor-pointer flex items-center justify-center"
                    >
                      {item.posterUrl ? (
                        <img
                          src={item.posterUrl}
                          alt={item.animeTitle}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Tv size={20} className="text-neutral-600" />
                      )}
                    </button>

                    {/* Title & Clean Unboxed Metadata */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-sm font-black text-white truncate">
                          {item.animeTitle}
                        </h3>
                        <span className="shrink-0 text-neutral-400">
                          {isCompleted ? (
                            <CheckCircle2 size={17} className="text-emerald-400" />
                          ) : isFailed ? (
                            <AlertTriangle size={17} className="text-amber-400" />
                          ) : isBusy ? (
                            <Loader2 size={17} className="text-[#FF1744] animate-spin" />
                          ) : (
                            <Pause size={17} className="text-neutral-400" />
                          )}
                        </span>
                      </div>

                      <div className="text-xs font-bold text-neutral-300 mt-0.5 tabular-nums truncate">
                        {item.episodeTitle || `الحلقة ${item.episodeNum}`}
                        {item.seasonNumber > 1 ? ` · الموسم ${item.seasonNumber}` : ''}
                      </div>

                      <div className="text-[11px] text-neutral-400 mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 tabular-nums">
                        <span>
                          الجودة:{' '}
                          <strong className="text-neutral-200 font-bold">
                            {item.resolvedQuality
                              ? formatQualityLabel(item.resolvedQuality)
                              : formatQualityLabel(item.requestedQuality)}
                          </strong>
                        </span>
                        {item.usedFallbackQuality && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-amber-400 font-semibold">
                              بديل تلقائي (بدلاً من {formatQualityLabel(item.requestedQuality)})
                            </span>
                          </>
                        )}
                        {item.serverName && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{item.serverName}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Progress & Live Metrics */}
                  <div className="space-y-1.5">
                    <div className="w-full h-2 bg-neutral-900 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          isCompleted
                            ? 'bg-emerald-500'
                            : isFailed
                            ? 'bg-amber-500'
                            : item.status === 'paused'
                            ? 'bg-neutral-500'
                            : 'bg-[#FF1744]'
                        }`}
                        style={{
                          width: `${
                            isCompleted
                              ? 100
                              : item.status === 'resolving'
                              ? 12
                              : Math.max(0, Math.min(100, item.progress || 0))
                          }%`,
                        }}
                      />
                    </div>
                    <div className="text-[11px] font-bold text-neutral-400 tabular-nums truncate">
                      {renderStatusText(item)}
                    </div>
                  </div>

                  {/* Item Action Row */}
                  <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-white/5">
                    {isBusy && (
                      <button
                        type="button"
                        onClick={() => downloadManagerService.pauseItem(item.id)}
                        className="min-h-[40px] px-3 py-1.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-xs font-bold text-neutral-200 flex items-center gap-1.5 transition cursor-pointer"
                      >
                        <Pause size={14} />
                        <span>إيقاف مؤقت</span>
                      </button>
                    )}

                    {item.status === 'paused' && (
                      <button
                        type="button"
                        onClick={() => downloadManagerService.resumeItem(item.id)}
                        className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-[#FF1744] hover:bg-red-600 text-xs font-black text-white flex items-center gap-1.5 transition cursor-pointer"
                      >
                        <Play size={14} />
                        <span>استئناف</span>
                      </button>
                    )}

                    {isFailed && (
                      <button
                        type="button"
                        onClick={() => downloadManagerService.retryItem(item.id)}
                        className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-xs font-black text-white flex items-center gap-1.5 transition cursor-pointer"
                      >
                        <RotateCcw size={14} />
                        <span>إعادة المحاولة</span>
                      </button>
                    )}

                    {isCompleted && item.hasOfflineFile && (
                      <button
                        type="button"
                        onClick={() => void handlePlayOffline(item)}
                        className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-black text-white flex items-center gap-1.5 transition cursor-pointer"
                      >
                        <Play size={14} fill="currentColor" />
                        <span>تشغيل</span>
                      </button>
                    )}

                    {isCompleted && item.targetMode === 'internal' && (
                      <button
                        type="button"
                        onClick={() => void handleSaveDevice(item)}
                        className="min-h-[40px] px-3 py-1.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-xs font-bold text-neutral-200 flex items-center gap-1.5 transition cursor-pointer"
                      >
                        <FolderDown size={14} />
                        <span>حفظ على الجهاز</span>
                      </button>
                    )}

                    {(item.externalDirectUrl || item.downloadUrl) && (
                      <button
                        type="button"
                        onClick={() => void handleExternalHandoff(item)}
                        className="min-h-[40px] px-3 py-1.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-xs font-bold text-neutral-300 flex items-center gap-1.5 transition cursor-pointer"
                      >
                        <ExternalLink size={14} />
                        <span>تنزيل خارجي</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => downloadManagerService.removeItem(item.id)}
                      aria-label="حذف"
                      className="min-h-[40px] min-w-[40px] mr-auto px-2.5 py-1.5 rounded-xl bg-neutral-900 hover:bg-red-950/50 border border-neutral-800 hover:border-red-500/40 text-xs font-bold text-neutral-400 hover:text-red-400 flex items-center justify-center transition cursor-pointer"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </article>
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
