import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Download,
  X,
  CheckSquare,
  Square,
  ExternalLink,
  Smartphone,
} from 'lucide-react';
import ViewportPortal from './ViewportPortal';
import {
  downloadManagerService,
  type BatchAnimeInput,
  type BatchEpisodeInput,
  type DownloadQualityPref,
  type DownloadTargetMode,
  formatQualityLabel,
} from '../services/downloadManagerService';

interface BatchDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  anime: BatchAnimeInput & { seasonsList?: any[] };
  episodes: BatchEpisodeInput[];
  seasonNumber?: number;
  isEpisodeWatched?: (epNum: number) => boolean;
  onStartDownloads: () => void;
}

const QUALITY_OPTIONS: { id: DownloadQualityPref; label: string; sub: string }[] = [
  { id: 'auto', label: 'تلقائي', sub: 'أفضل جودة متاحة' },
  { id: 'FHD', label: '1080p', sub: 'جودة عالية جداً' },
  { id: 'HD', label: '720p', sub: 'جودة متوازنة' },
  { id: 'SD', label: '480p', sub: 'حجم موفر' },
];

export default function BatchDownloadModal({
  isOpen,
  onClose,
  anime,
  episodes,
  seasonNumber = 1,
  isEpisodeWatched,
  onStartDownloads,
}: BatchDownloadModalProps) {
  const normalizedEpisodes = useMemo(() => {
    return (episodes || []).map((ep, idx) => {
      const rawNum = ep.num ?? idx + 1;
      const numVal = parseInt(String(rawNum).replace(/[^\d]/g, ''), 10);
      const epNum = !isNaN(numVal) && numVal > 0 ? numVal : idx + 1;
      return {
        ...ep,
        epNum,
        seasonNumber: Number(ep.seasonNumber || seasonNumber || 1),
        key: `${ep.id || ''}-${epNum}-${idx}`,
      };
    });
  }, [episodes, seasonNumber]);

  const [selectedNums, setSelectedNums] = useState<number[]>(() =>
    normalizedEpisodes.slice(0, Math.min(5, normalizedEpisodes.length)).map((e) => e.epNum),
  );
  const [qualityPref, setQualityPref] = useState<DownloadQualityPref>('auto');
  const [targetMode, setTargetMode] = useState<DownloadTargetMode>('internal');
  const [rangeStart, setRangeStart] = useState<string>(() =>
    normalizedEpisodes[0] ? String(normalizedEpisodes[0].epNum) : '1',
  );
  const [rangeEnd, setRangeEnd] = useState<string>(() =>
    normalizedEpisodes[normalizedEpisodes.length - 1]
      ? String(normalizedEpisodes[normalizedEpisodes.length - 1].epNum)
      : '12',
  );

  const selectedSet = useMemo(() => new Set(selectedNums), [selectedNums]);

  const toggleEpisode = (epNum: number) => {
    setSelectedNums((prev) =>
      prev.includes(epNum) ? prev.filter((n) => n !== epNum) : [...prev, epNum],
    );
  };

  const handleSelectAll = () => {
    setSelectedNums(normalizedEpisodes.map((e) => e.epNum));
  };

  const handleClearAll = () => {
    setSelectedNums([]);
  };

  const handleSelectUnwatched = () => {
    if (!isEpisodeWatched) {
      handleSelectAll();
      return;
    }
    const unwatched = normalizedEpisodes
      .filter((e) => !isEpisodeWatched(e.epNum))
      .map((e) => e.epNum);
    setSelectedNums(unwatched);
  };

  const handleApplyRange = () => {
    const min = parseInt(rangeStart, 10);
    const max = parseInt(rangeEnd, 10);
    if (isNaN(min) || isNaN(max)) return;
    const low = Math.min(min, max);
    const high = Math.max(min, max);
    const inRange = normalizedEpisodes
      .filter((e) => e.epNum >= low && e.epNum <= high)
      .map((e) => e.epNum);
    setSelectedNums(inRange);
  };

  const handleConfirmDownload = () => {
    const chosen = normalizedEpisodes.filter((e) => selectedSet.has(e.epNum));
    if (chosen.length === 0) return;

    downloadManagerService.enqueueBatch(
      anime,
      chosen.map((e) => ({
        id: e.id,
        link: e.link,
        num: e.epNum,
        title: e.title || `الحلقة ${e.epNum}`,
        seasonNumber: e.seasonNumber,
      })),
      qualityPref,
      targetMode,
    );

    onClose();
    onStartDownloads();
  };

  return (
    <ViewportPortal>
      <AnimatePresence>
        {isOpen && (
          <div
            className="fixed inset-0 z-[130] flex items-end sm:items-center justify-center sm:p-4 font-sans"
            style={{
              height: 'var(--vv-height, 100dvh)',
            }}
            dir="rtl"
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />

            <motion.div
              initial={{ opacity: 0, y: 28 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 24 }}
              transition={{ duration: 0.2 }}
              className="relative w-full sm:max-w-2xl max-h-[88dvh] bg-[#0f0f13] border border-neutral-800 rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden z-10"
            >
              {/* Drag handle for mobile bottom sheet feel */}
              <div className="sm:hidden w-10 h-1.5 bg-neutral-700 rounded-full mx-auto mt-3 shrink-0" />

              {/* Header */}
              <div className="px-5 py-4 border-b border-neutral-800/80 flex items-center justify-between gap-3 shrink-0">
                <div className="min-w-0">
                  <h2 className="text-base sm:text-lg font-black text-white truncate">
                    تنزيل عدة حلقات
                  </h2>
                  <p className="text-xs text-neutral-400 truncate mt-0.5">
                    {anime?.title || 'الأنمي'}
                    {anime?.seasonsList && anime.seasonsList.length > 1
                      ? ` · الموسم ${seasonNumber}`
                      : ''}
                    {` · ${normalizedEpisodes.length} حلقة متاحة`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="إغلاق"
                  className="min-w-[44px] min-h-[44px] rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 flex items-center justify-center transition cursor-pointer shrink-0"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Scrollable Body */}
              <div className="flex-1 overflow-y-auto p-5 space-y-5 customize-scroll">
                {/* Quality Selection */}
                <section className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-xs sm:text-sm font-black text-white">اختر الجودة المطلوبة</h3>
                    <span className="text-[11px] text-neutral-400">
                      بديل تلقائي عند عدم التوفر
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {QUALITY_OPTIONS.map((q) => {
                      const active = qualityPref === q.id;
                      return (
                        <button
                          key={q.id}
                          type="button"
                          onClick={() => setQualityPref(q.id)}
                          className={`min-h-[52px] px-3 py-2 rounded-xl border text-right transition flex flex-col justify-center cursor-pointer ${
                            active
                              ? 'bg-[#FF1744]/15 border-[#FF1744] text-white'
                              : 'bg-neutral-900/70 border-neutral-800 text-neutral-300 hover:bg-neutral-800/80'
                          }`}
                        >
                          <span className="text-xs sm:text-sm font-black tabular-nums">
                            {q.label}
                          </span>
                          <span className="text-[10px] text-neutral-400">{q.sub}</span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-neutral-400 leading-relaxed">
                    في حال عدم توفر الجودة المطلوبة لإحدى الحلقات، يقوم النظام تلقائياً باختيار أفضل جودة متاحة وإكمال التنزيل دون توقف.
                  </p>
                </section>

                {/* Download Manager Target */}
                <section className="space-y-2">
                  <h3 className="text-xs sm:text-sm font-black text-white">طريقة التنزيل</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setTargetMode('internal')}
                      className={`min-h-[48px] px-3.5 py-2.5 rounded-xl border flex items-center gap-2.5 text-right transition cursor-pointer ${
                        targetMode === 'internal'
                          ? 'bg-purple-600/15 border-purple-500 text-white'
                          : 'bg-neutral-900/70 border-neutral-800 text-neutral-300 hover:bg-neutral-800'
                      }`}
                    >
                      <Smartphone size={18} className="text-purple-400 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs font-black">مدير التنزيلات الداخلي</div>
                        <div className="text-[10px] text-neutral-400">
                          إدارة الطابور، الإيقاف المؤقت، والتشغيل بدون إنترنت
                        </div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setTargetMode('external')}
                      className={`min-h-[48px] px-3.5 py-2.5 rounded-xl border flex items-center gap-2.5 text-right transition cursor-pointer ${
                        targetMode === 'external'
                          ? 'bg-indigo-600/15 border-indigo-500 text-white'
                          : 'bg-neutral-900/70 border-neutral-800 text-neutral-300 hover:bg-neutral-800'
                      }`}
                    >
                      <ExternalLink size={18} className="text-indigo-400 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs font-black">إرسال لمدير تنزيل خارجي</div>
                        <div className="text-[10px] text-neutral-400">
                          تجهيز الروابط المباشرة وتمريرها للتطبيق الخارجي
                        </div>
                      </div>
                    </button>
                  </div>
                </section>

                {/* Quick Selection Tools */}
                <section className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-xs sm:text-sm font-black text-white">
                      اختر الحلقات ({selectedNums.length})
                    </h3>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={handleSelectAll}
                        className="min-h-[36px] px-3 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-xs font-bold text-neutral-200 transition cursor-pointer whitespace-nowrap"
                      >
                        تحديد الكل
                      </button>
                      {isEpisodeWatched && (
                        <button
                          type="button"
                          onClick={handleSelectUnwatched}
                          className="min-h-[36px] px-3 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-xs font-bold text-neutral-200 transition cursor-pointer whitespace-nowrap"
                        >
                          غير المشاهدة
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleClearAll}
                        className="min-h-[36px] px-3 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-xs font-bold text-neutral-400 transition cursor-pointer whitespace-nowrap"
                      >
                        إلغاء الكل
                      </button>
                    </div>
                  </div>

                  {/* Range Picker */}
                  {normalizedEpisodes.length > 6 && (
                    <div className="flex flex-wrap items-center gap-2 bg-neutral-900/50 border border-neutral-800/80 rounded-xl p-2.5">
                      <span className="text-xs font-bold text-neutral-400">نطاق سريع:</span>
                      <input
                        type="number"
                        min={1}
                        value={rangeStart}
                        onChange={(e) => setRangeStart(e.target.value)}
                        aria-label="من الحلقة"
                        className="w-20 min-h-[38px] bg-black/50 border border-neutral-800 rounded-lg px-2.5 text-xs font-bold text-white text-center tabular-nums focus:outline-none focus:border-[#FF1744]"
                      />
                      <span className="text-xs text-neutral-500">إلى</span>
                      <input
                        type="number"
                        min={1}
                        value={rangeEnd}
                        onChange={(e) => setRangeEnd(e.target.value)}
                        aria-label="إلى الحلقة"
                        className="w-20 min-h-[38px] bg-black/50 border border-neutral-800 rounded-lg px-2.5 text-xs font-bold text-white text-center tabular-nums focus:outline-none focus:border-[#FF1744]"
                      />
                      <button
                        type="button"
                        onClick={handleApplyRange}
                        className="min-h-[38px] px-3.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-black transition cursor-pointer whitespace-nowrap"
                      >
                        تطبيق النطاق
                      </button>
                    </div>
                  )}

                  {/* Episodes Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                    {normalizedEpisodes.map((ep) => {
                      const isSelected = selectedSet.has(ep.epNum);
                      const watched = isEpisodeWatched ? isEpisodeWatched(ep.epNum) : false;
                      return (
                        <button
                          key={ep.key}
                          type="button"
                          onClick={() => toggleEpisode(ep.epNum)}
                          className={`min-h-[48px] px-3 py-2 rounded-xl border flex items-center justify-between gap-2 text-right transition cursor-pointer ${
                            isSelected
                              ? 'bg-[#FF1744]/15 border-[#FF1744]/70 text-white'
                              : 'bg-neutral-900/60 border-neutral-800/90 text-neutral-300 hover:bg-neutral-800/80'
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="text-xs font-black tabular-nums truncate">
                              الحلقة {ep.epNum}
                            </div>
                            {watched && (
                              <div className="text-[10px] text-emerald-400 font-semibold">
                                تمت المشاهدة
                              </div>
                            )}
                          </div>
                          {isSelected ? (
                            <CheckSquare size={17} className="text-[#FF1744] shrink-0" />
                          ) : (
                            <Square size={17} className="text-neutral-500 shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </section>
              </div>

              {/* Sticky Bottom CTA */}
              <div
                className="px-5 py-4 border-t border-neutral-800 bg-[#0c0c10] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0"
                style={{ paddingBottom: 'calc(var(--safe-bottom, 0px) + 1rem)' }}
              >
                <div className="text-xs text-neutral-300 font-bold tabular-nums">
                  <span>{selectedNums.length} حلقات محددة</span>
                  <span className="mx-1.5 text-neutral-600">·</span>
                  <span className="text-neutral-400">{formatQualityLabel(qualityPref)}</span>
                </div>
                <button
                  type="button"
                  disabled={selectedNums.length === 0}
                  onClick={handleConfirmDownload}
                  className="min-h-[48px] px-6 py-2.5 rounded-xl bg-[#FF1744] hover:bg-red-600 disabled:opacity-40 disabled:pointer-events-none text-white font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-red-600/20 transition cursor-pointer whitespace-nowrap"
                >
                  <Download size={17} />
                  <span>
                    بدء التنزيل ({selectedNums.length})
                  </span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </ViewportPortal>
  );
}
