import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Download,
  X,
  CheckSquare,
  Square,
  BookOpen,
} from 'lucide-react';
import ViewportPortal from './ViewportPortal';
import {
  downloadManagerService,
  type BatchMangaInput,
  type BatchChapterInput,
} from '../services/downloadManagerService';

interface BatchChapterDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  manga: BatchMangaInput;
  chapters: BatchChapterInput[];
  isChapterRead?: (chapterNum: string | number) => boolean;
  onStartDownloads: () => void;
}

export default function BatchChapterDownloadModal({
  isOpen,
  onClose,
  manga,
  chapters,
  isChapterRead,
  onStartDownloads,
}: BatchChapterDownloadModalProps) {
  const orderedChapters = useMemo(() => {
    return [...(chapters || [])].sort(
      (a, b) => parseFloat(String(a.num || 0)) - parseFloat(String(b.num || 0)),
    );
  }, [chapters]);

  const contextKey = `${manga?._id || 'manga'}__${orderedChapters.length}`;
  const lastContextRef = useRef<string>('');

  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    orderedChapters.slice(0, Math.min(5, orderedChapters.length)).map((c) => c.id),
  );
  const [rangeStart, setRangeStart] = useState<string>(() =>
    orderedChapters[0] ? String(orderedChapters[0].num) : '1',
  );
  const [rangeEnd, setRangeEnd] = useState<string>(() =>
    orderedChapters[orderedChapters.length - 1]
      ? String(orderedChapters[orderedChapters.length - 1].num)
      : '10',
  );

  useEffect(() => {
    if (orderedChapters.length === 0) {
      setSelectedIds([]);
      return;
    }
    const validIds = new Set(orderedChapters.map((c) => c.id));
    if (lastContextRef.current !== contextKey) {
      lastContextRef.current = contextKey;
      setRangeStart(String(orderedChapters[0].num || '1'));
      setRangeEnd(String(orderedChapters[orderedChapters.length - 1].num || '10'));
      setSelectedIds((prev) => {
        const preserved = prev.filter((id) => validIds.has(id));
        if (preserved.length > 0) return preserved;
        return orderedChapters.slice(0, Math.min(5, orderedChapters.length)).map((c) => c.id);
      });
    } else if (isOpen) {
      setSelectedIds((prev) => {
        const preserved = prev.filter((id) => validIds.has(id));
        if (preserved.length > 0) return preserved;
        return orderedChapters.slice(0, Math.min(5, orderedChapters.length)).map((c) => c.id);
      });
    }
  }, [isOpen, contextKey, orderedChapters]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const toggleChapter = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleSelectAll = () => {
    setSelectedIds(orderedChapters.map((c) => c.id));
  };

  const handleClearAll = () => {
    setSelectedIds([]);
  };

  const handleSelectUnread = () => {
    if (!isChapterRead) {
      handleSelectAll();
      return;
    }
    setSelectedIds(
      orderedChapters.filter((c) => !isChapterRead(c.num)).map((c) => c.id),
    );
  };

  const handleApplyRange = () => {
    const min = parseFloat(rangeStart);
    const max = parseFloat(rangeEnd);
    if (isNaN(min) || isNaN(max)) return;
    const low = Math.min(min, max);
    const high = Math.max(min, max);
    setSelectedIds(
      orderedChapters
        .filter((c) => {
          const val = parseFloat(String(c.num || 0));
          return !isNaN(val) && val >= low && val <= high;
        })
        .map((c) => c.id),
    );
  };

  const handleConfirm = () => {
    const chosen = orderedChapters.filter((c) => selectedSet.has(c.id));
    if (chosen.length === 0) return;

    downloadManagerService.enqueueMangaBatch(manga, chosen);
    onClose();
    onStartDownloads();
  };

  return (
    <ViewportPortal>
      <AnimatePresence>
        {isOpen && (
          <div
            className="fixed inset-0 z-[130] flex items-end sm:items-center justify-center sm:p-4 font-sans"
            style={{ height: 'var(--vv-height, 100dvh)' }}
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
              <div className="sm:hidden w-10 h-1.5 bg-neutral-700 rounded-full mx-auto mt-3 shrink-0" />

              {/* Header */}
              <div className="px-5 py-4 border-b border-neutral-800/80 flex items-center justify-between gap-3 shrink-0">
                <div className="min-w-0">
                  <h2 className="text-base sm:text-lg font-black text-white truncate">
                    تنزيل عدة فصول للقراءة أوفلاين
                  </h2>
                  <p className="text-xs text-neutral-400 truncate mt-0.5 tabular-nums">
                    {manga.title} · {orderedChapters.length} فصل متاح
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

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4 customize-scroll">
                <div className="bg-neutral-900/60 border border-neutral-800/90 rounded-2xl p-3.5 flex items-center gap-3">
                  <BookOpen size={18} className="text-[#FF1744] shrink-0" />
                  <p className="text-xs text-neutral-300 leading-relaxed">
                    يتم حفظ صفحات الفصول المحددة داخل الجهاز لتتمكن من قراءتها لاحقاً في أي وقت بدون إنترنت.
                  </p>
                </div>

                {/* Quick Controls */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-xs sm:text-sm font-black text-white tabular-nums">
                    اختر الفصول ({selectedIds.length})
                  </h3>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleSelectAll}
                      className="min-h-[38px] px-3 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-xs font-bold text-neutral-200 transition cursor-pointer whitespace-nowrap"
                    >
                      تحديد الكل
                    </button>
                    {isChapterRead && (
                      <button
                        type="button"
                        onClick={handleSelectUnread}
                        className="min-h-[38px] px-3 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-xs font-bold text-neutral-200 transition cursor-pointer whitespace-nowrap"
                      >
                        غير المقروءة فقط
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleClearAll}
                      className="min-h-[38px] px-3 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-xs font-bold text-neutral-400 transition cursor-pointer whitespace-nowrap"
                    >
                      إلغاء التحديد
                    </button>
                  </div>
                </div>

                {/* Range Selector */}
                {orderedChapters.length > 6 && (
                  <div className="flex flex-wrap items-center gap-2 bg-neutral-900/50 border border-neutral-800/80 rounded-xl p-2.5">
                    <span className="text-xs font-bold text-neutral-400">نطاق سريع:</span>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={rangeStart}
                      onChange={(e) => setRangeStart(e.target.value)}
                      aria-label="من فصل"
                      className="w-20 min-h-[38px] bg-black/50 border border-neutral-800 rounded-lg px-2.5 text-xs font-bold text-white text-center tabular-nums focus:outline-none focus:border-[#FF1744]"
                    />
                    <span className="text-xs text-neutral-500">إلى</span>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={rangeEnd}
                      onChange={(e) => setRangeEnd(e.target.value)}
                      aria-label="إلى فصل"
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

                {/* Chapter Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                  {orderedChapters.map((ch) => {
                    const isSelected = selectedSet.has(ch.id);
                    const read = isChapterRead ? isChapterRead(ch.num) : false;
                    return (
                      <button
                        key={ch.id}
                        type="button"
                        onClick={() => toggleChapter(ch.id)}
                        className={`min-h-[52px] px-3 py-2 rounded-xl border flex items-center justify-between gap-2 text-right transition cursor-pointer ${
                          isSelected
                            ? 'bg-[#FF1744]/15 border-[#FF1744]/70 text-white'
                            : 'bg-neutral-900/60 border-neutral-800/90 text-neutral-300 hover:bg-neutral-800/80'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-black tabular-nums truncate">
                            الفصل {ch.num}
                          </div>
                          <div className="text-[10px] text-neutral-400 tabular-nums truncate">
                            {ch.language === 'en' ? 'إنجليزي' : 'عربي'}
                            {ch.pagesCount ? ` · ${ch.pagesCount} صفحة` : ''}
                            {read ? ' · مقروء' : ''}
                          </div>
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
              </div>

              {/* Sticky Footer */}
              <div
                className="px-5 py-4 border-t border-neutral-800 bg-[#0c0c10] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0"
                style={{ paddingBottom: 'calc(var(--safe-bottom, 0px) + 1rem)' }}
              >
                <div className="text-xs text-neutral-300 font-bold tabular-nums">
                  {selectedIds.length} فصول محددة للحفظ دون اتصال
                </div>
                <button
                  type="button"
                  disabled={selectedIds.length === 0}
                  onClick={handleConfirm}
                  className="min-h-[48px] px-6 py-2.5 rounded-xl bg-[#FF1744] hover:bg-red-600 disabled:opacity-40 disabled:pointer-events-none text-white font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-red-600/20 transition cursor-pointer whitespace-nowrap"
                >
                  <Download size={17} />
                  <span>بدء تنزيل {selectedIds.length} فصل</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </ViewportPortal>
  );
}
