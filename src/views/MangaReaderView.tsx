import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ChevronRight,
  ChevronLeft,
  SlidersHorizontal,
  MessageCircle,
  Send,
  Loader2,
  AlertCircle,
  RefreshCw,
  X,
  ZoomIn,
  ZoomOut,
  Columns2,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { mangaListService } from '../services/mangaListService';
import { recordChapterRead } from '../services/gamificationService';
import { downloadManagerService } from '../services/downloadManagerService';
import { cloudCatalogService } from '../services/cloudCatalogService';
import { getComments, addComment, type Comment } from '../services/animeInteractionService';
import ViewportPortal from '../components/ViewportPortal';
import AnimeCommentItem from '../components/AnimeCommentItem';
import { useDeviceDisplay } from '../hooks/useDeviceDisplay';
import { getDataSaverEnabled } from '../utils/appPreferences';

type ReaderMode = 'webtoon' | 'paged-rtl' | 'paged-ltr';
type ReaderBg = 'amoled' | 'dark' | 'sepia';
type ReaderQuality = 'high' | 'saver';

interface ReaderPrefs {
  mode: ReaderMode;
  bg: ReaderBg;
  quality: ReaderQuality;
  brightness: number;
  keepAwake: boolean;
  doublePage?: boolean;
}

const PREFS_KEY = 'manga_reader_prefs_v1';

interface MangaReaderViewProps {
  manga: any;
  chapter: any;
  chapters: any[];
  initialPage?: number;
  offlineItemId?: string;
  onBack: () => void;
  onSelectChapter: (chapter: any) => void;
  onUserClick?: (userId: string) => void;
}

export default function MangaReaderView({
  manga,
  chapter,
  chapters,
  initialPage = 1,
  offlineItemId,
  onBack,
  onSelectChapter,
  onUserClick,
}: MangaReaderViewProps) {
  const { user, userData, signIn } = useAuth();
  const display = useDeviceDisplay();
  const isWideScreen = display.isWideOrUnfolded;

  const [prefs, setPrefs] = useState<ReaderPrefs>(() => {
    const defaultMode: ReaderMode =
      manga?.defaultReadingMode === 'webtoon' ? 'webtoon' : 'paged-rtl';
    const defaultQuality: ReaderQuality = getDataSaverEnabled() ? 'saver' : 'high';
    try {
      const saved = localStorage.getItem(PREFS_KEY);
      if (saved) {
        return {
          mode: defaultMode,
          bg: 'amoled',
          quality: defaultQuality,
          brightness: 100,
          keepAwake: true,
          doublePage: false,
          ...JSON.parse(saved),
        };
      }
    } catch {}
    return {
      mode: defaultMode,
      bg: 'amoled',
      quality: defaultQuality,
      brightness: 100,
      keepAwake: true,
      doublePage: false,
    };
  });

  const [pages, setPages] = useState<Array<{ index: number; url: string; fallbackUrl?: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(Math.max(1, initialPage));
  const [hudVisible, setHudVisible] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [zoomed, setZoomed] = useState(false);

  const [usedFallbackSet, setUsedFallbackSet] = useState<Record<number, boolean>>({});
  const [brokenPageSet, setBrokenPageSet] = useState<Record<number, boolean>>({});
  const [retrySeedMap, setRetrySeedMap] = useState<Record<number, number>>({});

  // Chapter comments state
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [isSpoiler, setIsSpoiler] = useState(false);
  const [submittingComment, setSubmittingComment] = useState(false);

  const mainScrollRef = useRef<HTMLElement | null>(null);
  const webtoonRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const recordedRef = useRef<string | null>(null);
  const blobUrlsRef = useRef<string[]>([]);

  const isDoublePageActive = Boolean(prefs.doublePage && prefs.mode !== 'webtoon' && isWideScreen);

  const updatePrefs = (patch: Partial<ReaderPrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  // WakeLock best-effort
  useEffect(() => {
    if (!prefs.keepAwake || typeof navigator === 'undefined' || !(navigator as any).wakeLock) return;
    let lock: any = null;
    (navigator as any).wakeLock
      .request('screen')
      .then((l: any) => {
        lock = l;
      })
      .catch(() => {});
    return () => {
      try {
        lock?.release?.();
      } catch {}
    };
  }, [prefs.keepAwake]);

  const [fetchedChapters, setFetchedChapters] = useState<any[]>([]);

  useEffect(() => {
    if ((chapters && chapters.length > 0) || !manga?._id) return;
    let cancelled = false;
    void cloudCatalogService.getMangaChaptersOnlyWithCloud(manga).then((list) => {
      if (!cancelled && Array.isArray(list) && list.length > 0) {
        setFetchedChapters(list);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [chapters, manga?._id, manga?.mangadexId, manga?.title, manga?.englishTitle]);

  const activeChaptersList = useMemo(
    () => (chapters && chapters.length > 0 ? chapters : fetchedChapters),
    [chapters, fetchedChapters],
  );

  const sortedChapters = useMemo(() => {
    return [...activeChaptersList].sort(
      (a, b) => (Number(a.chapterNumber) || 0) - (Number(b.chapterNumber) || 0),
    );
  }, [activeChaptersList]);

  const currentIdx = useMemo(
    () =>
      sortedChapters.findIndex(
        (c) => c.id === chapter?.id || String(c.num) === String(chapter?.num),
      ),
    [sortedChapters, chapter?.id, chapter?.num],
  );
  const prevChapter = currentIdx > 0 ? sortedChapters[currentIdx - 1] : null;
  const nextChapter =
    currentIdx >= 0 && currentIdx < sortedChapters.length - 1
      ? sortedChapters[currentIdx + 1]
      : null;

  const revokeBlobUrls = () => {
    blobUrlsRef.current.forEach((u) => {
      try {
        URL.revokeObjectURL(u);
      } catch {}
    });
    blobUrlsRef.current = [];
  };

  const selfHealedRef = useRef<string | null>(null);

  const loadPages = useCallback(async (forceRefresh = false) => {
    revokeBlobUrls();
    setLoading(true);
    setErrorMsg(null);
    setUsedFallbackSet({});
    setBrokenPageSet({});
    setRetrySeedMap({});
    if (!forceRefresh) {
      setCurrentPage(Math.max(1, initialPage));
    }

    try {
      // Check offline pack first when requested or available
      const resolvedOfflineId =
        offlineItemId ||
        downloadManagerService
          .getSnapshot()
          .find(
            (q) =>
              q.itemType === 'chapter' &&
              q.status === 'completed' &&
              q.hasOfflineFile &&
              q.chapterId === String(chapter.id),
          )?.id;

      if (resolvedOfflineId) {
        const offlineUrls = await downloadManagerService.getOfflineChapterPages(resolvedOfflineId);
        if (offlineUrls && offlineUrls.length > 0) {
          blobUrlsRef.current = offlineUrls;
          setPages(offlineUrls.map((u, idx) => ({ index: idx + 1, url: u })));
          setLoading(false);
          return;
        }
      }

      const loadedPages = await cloudCatalogService.getChapterPagesWithCloud(
        String(chapter.id),
        String(manga?._id || 'unknown'),
        prefs.quality,
        forceRefresh,
      );
      if (Array.isArray(loadedPages) && loadedPages.length > 0) {
        setPages(loadedPages);
      } else {
        setErrorMsg('تعذر تحميل صفحات هذا الفصل حالياً.');
      }
    } catch {
      setErrorMsg('انقطع الاتصال مؤقتاً أثناء تحميل صفحات الفصل.');
    } finally {
      setLoading(false);
    }
  }, [chapter?.id, manga?._id, offlineItemId, prefs.quality, initialPage]);

  useEffect(() => {
    void loadPages();
    return () => {
      revokeBlobUrls();
    };
  }, [loadPages]);

  // Preload next upcoming pages cleanly (throttled when Data Saver is active)
  useEffect(() => {
    if (pages.length === 0) return;
    const dataSaver = getDataSaverEnabled() || prefs.quality === 'saver';
    const count = dataSaver ? 1 : isDoublePageActive ? 4 : 3;
    for (let offset = 1; offset <= count; offset++) {
      const target = pages[currentPage - 1 + offset];
      if (target?.url && !target.url.startsWith('blob:')) {
        const img = new Image();
        img.referrerPolicy = 'no-referrer';
        img.src = target.url;
      }
    }
  }, [currentPage, pages, isDoublePageActive, prefs.quality]);

  // Persist reading progress & award chapter XP at >= 80% progress
  useEffect(() => {
    if (!manga || !chapter || pages.length === 0) return;
    mangaListService.recordReadingHistory(user?.id, {
      mangaId: String(manga._id),
      mangadexId: manga.mangadexId || null,
      title: manga.title,
      posterUrl: manga.posterUrl || '',
      mediaFormat: manga.mediaFormat,
      originLabel: manga.originLabel,
      chapterId: chapter.id,
      chapterNum: String(chapter.num),
      chapterTitle: chapter.title,
      pageIndex: currentPage,
      totalPages: pages.length,
      updatedAt: Date.now(),
    });

    const thresholdPage = Math.max(1, Math.floor(pages.length * 0.8));
    if (currentPage >= thresholdPage && user?.id && recordedRef.current !== chapter.id) {
      recordedRef.current = chapter.id;
      void recordChapterRead(
        user.id,
        {
          _id: String(manga._id),
          title: manga.title,
          posterUrl: manga.posterUrl || '',
          mediaFormat: manga.mediaFormat,
          countryOfOrigin: manga.countryOfOrigin,
          releaseYear: manga.releaseYear,
          chaptersCount: manga.chaptersCount || sortedChapters.length,
        },
        Number(chapter.chapterNumber || chapter.num || 1),
        currentPage,
      );
    }
  }, [currentPage, pages.length, manga, chapter, user?.id, sortedChapters.length]);

  // Webtoon scroll observer scoped inside pinned mainScrollRef
  useEffect(() => {
    if (prefs.mode !== 'webtoon' || pages.length === 0) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const pIdx = Number((entry.target as HTMLElement).dataset.pageIndex);
            if (pIdx > 0) setCurrentPage(pIdx);
          }
        }
      },
      { root: mainScrollRef.current, threshold: 0.35 },
    );

    Object.values(webtoonRefs.current).forEach((el) => {
      if (el instanceof HTMLElement) obs.observe(el);
    });
    return () => obs.disconnect();
  }, [prefs.mode, pages]);

  const pageStep = isDoublePageActive ? 2 : 1;

  const goNextPage = useCallback(() => {
    const lastVisiblePage = isDoublePageActive ? Math.min(pages.length, currentPage + 1) : currentPage;
    if (lastVisiblePage < pages.length) {
      setCurrentPage((p) => Math.min(pages.length, p + pageStep));
      setZoomed(false);
    } else if (nextChapter) {
      onSelectChapter(nextChapter);
    }
  }, [currentPage, isDoublePageActive, nextChapter, onSelectChapter, pageStep, pages.length]);

  const goPrevPage = useCallback(() => {
    if (currentPage > 1) {
      setCurrentPage((p) => Math.max(1, p - pageStep));
      setZoomed(false);
    } else if (prevChapter) {
      onSelectChapter(prevChapter);
    }
  }, [currentPage, onSelectChapter, pageStep, prevChapter]);

  // Keyboard navigation in paged modes
  useEffect(() => {
    if (prefs.mode === 'webtoon') return;
    const onKey = (e: KeyboardEvent) => {
      if (showComments || showSettings) return;
      const isRtl = prefs.mode === 'paged-rtl';
      if (e.key === 'ArrowLeft') {
        isRtl ? goNextPage() : goPrevPage();
      } else if (e.key === 'ArrowRight') {
        isRtl ? goPrevPage() : goNextPage();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prefs.mode, showComments, showSettings, goNextPage, goPrevPage]);

  const handleToggleDoublePage = () => {
    if (isDoublePageActive) {
      updatePrefs({ doublePage: false });
    } else {
      updatePrefs({
        doublePage: true,
        mode: prefs.mode === 'webtoon' ? 'paged-rtl' : prefs.mode,
      });
    }
  };

  const commentThreadId = `m:${String(manga?._id || '').slice(0, 48)}:ch:${String(chapter?.num || '1').slice(0, 16)}`;

  const loadChapterComments = useCallback(async () => {
    setCommentsLoading(true);
    try {
      const list = await getComments(commentThreadId);
      setComments(list);
    } finally {
      setCommentsLoading(false);
    }
  }, [commentThreadId]);

  useEffect(() => {
    if (showComments) {
      void loadChapterComments();
    }
  }, [showComments, loadChapterComments]);

  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return signIn();
    if (!newComment.trim() || submittingComment) return;
    setSubmittingComment(true);
    try {
      await addComment({
        animeId: commentThreadId,
        userId: user.id,
        userDisplayName: userData?.displayName || user.displayName || 'قارئ أوتاكو',
        userPhotoUrl: user.photoURL || undefined,
        text: newComment.trim(),
        likes: 0,
        dislikes: 0,
        isSpoiler,
        equippedAvatar: userData?.equippedAvatar || null,
        equippedFrame: userData?.equippedFrame || null,
        equippedTitle: userData?.equippedTitle || null,
        equippedBadge: userData?.equippedBadge || null,
      });
      setNewComment('');
      setIsSpoiler(false);
      void loadChapterComments();
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleReplyComment = async (parentId: string, text: string, spoiler: boolean) => {
    if (!user) return signIn();
    await addComment({
      animeId: commentThreadId,
      parentCommentId: parentId,
      userId: user.id,
      userDisplayName: userData?.displayName || user.displayName || 'قارئ أوتاكو',
      userPhotoUrl: user.photoURL || undefined,
      text: text.trim(),
      likes: 0,
      dislikes: 0,
      isSpoiler: spoiler,
      equippedAvatar: userData?.equippedAvatar || null,
      equippedFrame: userData?.equippedFrame || null,
      equippedTitle: userData?.equippedTitle || null,
      equippedBadge: userData?.equippedBadge || null,
    });
    void loadChapterComments();
  };

  const topLevelComments = useMemo(
    () => comments.filter((c) => !c.parentCommentId),
    [comments],
  );
  const repliesByParent = useMemo(() => {
    const map: Record<string, Comment[]> = {};
    comments.forEach((c) => {
      if (c.parentCommentId) {
        if (!map[c.parentCommentId]) map[c.parentCommentId] = [];
        map[c.parentCommentId].push(c);
      }
    });
    return map;
  }, [comments]);

  const bgClass =
    prefs.bg === 'sepia'
      ? 'bg-[#f5f1e8] text-stone-900'
      : prefs.bg === 'dark'
        ? 'bg-[#141418] text-white'
        : 'theme-keep-dark bg-black text-white';

  const getPageSrc = (p: { index: number; url: string; fallbackUrl?: string }) => {
    const base = usedFallbackSet[p.index] && p.fallbackUrl ? p.fallbackUrl : p.url;
    const seed = retrySeedMap[p.index];
    if (!seed || base.startsWith('blob:')) return base;
    return `${base}${base.includes('?') ? '&' : '?'}r=${seed}`;
  };

  const handlePageError = (p: { index: number; fallbackUrl?: string }) => {
    if (!usedFallbackSet[p.index] && p.fallbackUrl) {
      setUsedFallbackSet((prev) => ({ ...prev, [p.index]: true }));
      return;
    }
    setBrokenPageSet((prev) => {
      const next = { ...prev, [p.index]: true };
      const brokenCount = Object.values(next).filter(Boolean).length;
      if (brokenCount >= 2 && chapter?.id && selfHealedRef.current !== String(chapter.id)) {
        selfHealedRef.current = String(chapter.id);
        void cloudCatalogService
          .reportBrokenChapterPages(String(chapter.id), prefs.quality)
          .then(() => loadPages(true));
      }
      return next;
    });
  };

  const handleRetryPage = (pageIdx: number) => {
    setBrokenPageSet((prev) => ({ ...prev, [pageIdx]: false }));
    setRetrySeedMap((prev) => ({ ...prev, [pageIdx]: Date.now() }));
  };

  const scrollToWebtoonPage = (pageIdx: number) => {
    setCurrentPage(pageIdx);
    const el = webtoonRefs.current[pageIdx];
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const activePagedObj = pages[currentPage - 1];
  const secondPagedObj = isDoublePageActive ? pages[currentPage] : undefined;
  const pageRangeText =
    isDoublePageActive && secondPagedObj
      ? `${currentPage}-${currentPage + 1}`
      : `${currentPage}`;

  const renderPagedSlot = (pageObj: { index: number; url: string; fallbackUrl?: string }) => {
    if (brokenPageSet[pageObj.index]) {
      return (
        <div
          onClick={(e) => e.stopPropagation()}
          className="flex flex-col items-center justify-center gap-3 p-6 w-full h-full"
        >
          <p className="text-xs font-bold opacity-80 tabular-nums">
            تعذر تحميل الصفحة {pageObj.index}
          </p>
          <button
            type="button"
            onClick={() => handleRetryPage(pageObj.index)}
            className="min-h-[42px] px-5 rounded-xl bg-[#FF1744] text-white text-xs font-black flex items-center gap-2 cursor-pointer"
          >
            <RefreshCw size={14} />
            <span>إعادة المحاولة</span>
          </button>
        </div>
      );
    }

    return (
      <img
        src={getPageSrc(pageObj)}
        alt={`صفحة ${pageObj.index}`}
        referrerPolicy="no-referrer"
        onError={() => handlePageError(pageObj)}
        className={
          zoomed
            ? 'max-w-4xl w-full h-auto object-contain select-none'
            : 'max-w-full max-h-full w-auto h-auto object-contain select-none'
        }
      />
    );
  };

  return (
    <div
      className={`h-[var(--vv-height,100dvh)] w-full ${bgClass} relative overflow-hidden select-none`}
      style={{ filter: prefs.brightness !== 100 ? `brightness(${prefs.brightness}%)` : undefined }}
      dir="rtl"
    >
      {/* Top Pinned Dynamic Bar */}
      <AnimatePresence>
        {hudVisible && (
          <motion.header
            initial={{ opacity: 0, y: -18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -18 }}
            transition={{ duration: 0.16 }}
            style={{ paddingTop: 'calc(var(--safe-top, 0px) + 0.45rem)' }}
            className="theme-keep-dark fixed top-0 inset-x-0 z-40 bg-black/90 backdrop-blur-md border-b border-white/10 px-3 sm:px-5 pb-2.5"
          >
            <div className="max-w-6xl mx-auto flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <button
                  type="button"
                  onClick={onBack}
                  aria-label="رجوع"
                  className="min-w-[42px] min-h-[42px] rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-white/10 text-white flex items-center justify-center shrink-0 cursor-pointer"
                >
                  <ChevronRight size={20} />
                </button>
                <div className="min-w-0">
                  <h1 className="text-xs sm:text-sm font-black text-white truncate">
                    {manga?.title}
                  </h1>
                  <p className="text-[11px] text-neutral-400 font-bold tabular-nums truncate">
                    الفصل {chapter?.num}
                    {pages.length > 0 ? ` · صفحة ${pageRangeText} من ${pages.length}` : ''}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {isWideScreen && (
                  <button
                    type="button"
                    onClick={handleToggleDoublePage}
                    title="العرض المزدوج (صفحتان معاً)"
                    aria-label="العرض المزدوج للشاشة الكبيرة"
                    aria-pressed={isDoublePageActive}
                    className={`min-h-[42px] px-2.5 sm:px-3 rounded-xl border text-xs font-black flex items-center gap-1.5 transition cursor-pointer ${
                      isDoublePageActive
                        ? 'bg-[#FF1744] border-[#FF1744] text-white shadow-md shadow-rose-950/40'
                        : 'bg-neutral-900 hover:bg-neutral-800 border-white/10 text-neutral-200 hover:text-white'
                    }`}
                  >
                    <Columns2 size={17} strokeWidth={2.2} />
                    <span className="hidden md:inline">عرض مزدوج</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setZoomed((z) => !z)}
                  aria-label="تكبير أو تصغير"
                  className="min-w-[42px] min-h-[42px] rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-white/10 text-white flex items-center justify-center cursor-pointer"
                >
                  {zoomed ? <ZoomOut size={18} /> : <ZoomIn size={18} />}
                </button>

                <button
                  type="button"
                  onClick={() => setShowComments(true)}
                  aria-label="تعليقات الفصل"
                  className="min-w-[42px] min-h-[42px] rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-white/10 text-white flex items-center justify-center cursor-pointer"
                >
                  <MessageCircle size={18} />
                </button>

                <button
                  type="button"
                  onClick={() => setShowSettings(true)}
                  aria-label="إعدادات القراءة"
                  className="min-w-[42px] min-h-[42px] rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-white/10 text-white flex items-center justify-center cursor-pointer"
                >
                  <SlidersHorizontal size={18} />
                </button>
              </div>
            </div>
          </motion.header>
        )}
      </AnimatePresence>

      {/* Main Reader Canvas — Tap anywhere to toggle Top/Bottom HUD */}
      <main
        ref={mainScrollRef}
        onClick={() => setHudVisible((v) => !v)}
        className={`w-full h-full relative flex flex-col ${
          prefs.mode === 'webtoon'
            ? 'overflow-y-auto overflow-x-hidden overscroll-contain'
            : zoomed
              ? 'overflow-auto'
              : 'overflow-hidden'
        }`}
      >
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 py-16">
            <Loader2 className="animate-spin text-[#FF1744]" size={36} />
            <span className="text-xs font-bold opacity-75">جاري تحميل صفحات الفصل...</span>
          </div>
        ) : errorMsg ? (
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center"
          >
            <AlertCircle className="text-rose-500" size={40} />
            <p className="text-sm font-black">{errorMsg}</p>
            <button
              type="button"
              onClick={() => void loadPages(true)}
              className="min-h-[44px] px-5 rounded-xl bg-[#FF1744] text-white text-xs font-black flex items-center gap-2 cursor-pointer"
            >
              <RefreshCw size={14} />
              <span>إعادة المحاولة</span>
            </button>
          </div>
        ) : prefs.mode === 'webtoon' ? (
          <div
            className={`w-full ${zoomed ? 'max-w-5xl' : 'max-w-3xl'} mx-auto pt-14 pb-20 transition-all`}
          >
            {pages.map((p) => (
              <div
                key={p.index}
                data-page-index={p.index}
                ref={(el) => {
                  webtoonRefs.current[p.index] = el;
                }}
                className="w-full"
              >
                {brokenPageSet[p.index] ? (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="py-16 border-y border-white/10 flex flex-col items-center justify-center gap-2"
                  >
                    <p className="text-xs font-bold opacity-80 tabular-nums">
                      تعذر تحميل الصفحة {p.index}
                    </p>
                    <button
                      type="button"
                      onClick={() => handleRetryPage(p.index)}
                      className="min-h-[40px] px-4 rounded-xl bg-[#FF1744] text-white text-xs font-black flex items-center gap-1.5 cursor-pointer"
                    >
                      <RefreshCw size={13} />
                      <span>إعادة المحاولة</span>
                    </button>
                  </div>
                ) : (
                  <img
                    src={getPageSrc(p)}
                    alt={`صفحة ${p.index}`}
                    referrerPolicy="no-referrer"
                    onError={() => handlePageError(p)}
                    className="w-full h-auto block select-none"
                  />
                )}
              </div>
            ))}

            {/* Next Chapter End Bar */}
            <div
              onClick={(e) => e.stopPropagation()}
              className="p-6 flex items-center justify-center gap-3"
            >
              {prevChapter && (
                <button
                  type="button"
                  onClick={() => onSelectChapter(prevChapter)}
                  className="min-h-[46px] px-4 rounded-xl bg-neutral-900 border border-white/10 text-white text-xs font-black cursor-pointer"
                >
                  الفصل السابق ({prevChapter.num})
                </button>
              )}
              {nextChapter && (
                <button
                  type="button"
                  onClick={() => onSelectChapter(nextChapter)}
                  className="min-h-[46px] px-5 rounded-xl bg-[#FF1744] text-white text-xs font-black cursor-pointer"
                >
                  الفصل التالي ({nextChapter.num})
                </button>
              )}
            </div>
          </div>
        ) : (
          /* Paged RTL or LTR View (Single or Dual-Page Spread on Large Screens) */
          <div className="relative w-full h-full flex-1 min-h-0 flex items-center justify-center px-2 py-2 sm:px-3">
            {isDoublePageActive && activePagedObj && secondPagedObj ? (
              <div
                dir={prefs.mode === 'paged-rtl' ? 'rtl' : 'ltr'}
                className="w-full max-w-6xl h-full min-h-0 grid grid-cols-2 gap-1.5 md:gap-3 items-center justify-items-center"
              >
                <div className="w-full h-full min-h-0 flex items-center justify-center overflow-hidden">
                  {renderPagedSlot(activePagedObj)}
                </div>
                <div className="w-full h-full min-h-0 flex items-center justify-center overflow-hidden">
                  {renderPagedSlot(secondPagedObj)}
                </div>
              </div>
            ) : activePagedObj ? (
              <div className="w-full h-full min-h-0 flex items-center justify-center">
                {renderPagedSlot(activePagedObj)}
              </div>
            ) : null}

            {/* Left & Right Tap Zones for Paged Turning */}
            <button
              type="button"
              aria-label="تنقل يمين"
              onClick={(e) => {
                e.stopPropagation();
                prefs.mode === 'paged-rtl' ? goPrevPage() : goNextPage();
              }}
              className="absolute inset-y-16 right-0 w-1/4 cursor-pointer opacity-0"
            />
            <button
              type="button"
              aria-label="تنقل يسار"
              onClick={(e) => {
                e.stopPropagation();
                prefs.mode === 'paged-rtl' ? goNextPage() : goPrevPage();
              }}
              className="absolute inset-y-16 left-0 w-1/4 cursor-pointer opacity-0"
            />
          </div>
        )}
      </main>

      {/* Bottom Pinned Dynamic Bar */}
      <AnimatePresence>
        {hudVisible && pages.length > 0 && (
          <motion.footer
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 18 }}
            transition={{ duration: 0.16 }}
            style={{ paddingBottom: 'calc(var(--safe-bottom, 0px) + 0.45rem)' }}
            className="theme-keep-dark fixed bottom-0 inset-x-0 z-40 bg-black/90 backdrop-blur-md border-t border-white/10 px-3 sm:px-5 pt-2.5"
          >
            <div className="max-w-6xl mx-auto flex items-center gap-3">
              <button
                type="button"
                disabled={!prevChapter}
                onClick={() => prevChapter && onSelectChapter(prevChapter)}
                className="min-h-[42px] px-3 rounded-xl bg-neutral-900 hover:bg-neutral-800 disabled:opacity-35 border border-white/10 text-xs font-black text-white flex items-center gap-1 shrink-0 cursor-pointer"
              >
                <ChevronRight size={15} />
                <span className="hidden sm:inline">السابق</span>
              </button>

              <div className="flex-1 flex items-center gap-2.5">
                <input
                  type="range"
                  min={1}
                  max={pages.length}
                  value={currentPage}
                  onChange={(e) => {
                    const p = Number(e.target.value);
                    if (prefs.mode === 'webtoon') scrollToWebtoonPage(p);
                    else setCurrentPage(p);
                  }}
                  aria-label="شريط التنقل بين الصفحات"
                  className="flex-1 accent-[#FF1744] h-2 cursor-pointer"
                />
                <span className="text-xs font-black text-white tabular-nums shrink-0 min-w-[58px] text-center">
                  {pageRangeText} / {pages.length}
                </span>
              </div>

              <button
                type="button"
                disabled={!nextChapter}
                onClick={() => nextChapter && onSelectChapter(nextChapter)}
                className="min-h-[42px] px-3 rounded-xl bg-[#FF1744] hover:bg-red-600 disabled:opacity-35 text-xs font-black text-white flex items-center gap-1 shrink-0 cursor-pointer"
              >
                <span className="hidden sm:inline">التالي</span>
                <ChevronLeft size={15} />
              </button>
            </div>
          </motion.footer>
        )}
      </AnimatePresence>

      {/* Reader Settings Sheet */}
      <ViewportPortal>
        <AnimatePresence>
          {showSettings && (
            <div
              className="fixed inset-0 z-[130] flex items-end sm:items-center justify-center sm:p-4 font-sans"
              style={{ height: 'var(--vv-height, 100dvh)' }}
              dir="rtl"
            >
              <div
                onClick={() => setShowSettings(false)}
                className="absolute inset-0 bg-black/80 backdrop-blur-sm"
              />
              <motion.div
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 24 }}
                className="relative w-full sm:max-w-md bg-[#0f0f13] border border-neutral-800 rounded-t-3xl sm:rounded-3xl p-5 space-y-5 z-10 max-h-[85dvh] overflow-y-auto"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-black text-white">إعدادات القراءة</h3>
                  <button
                    type="button"
                    onClick={() => setShowSettings(false)}
                    className="min-w-[40px] min-h-[40px] rounded-xl bg-neutral-900 text-neutral-400 flex items-center justify-center cursor-pointer"
                  >
                    <X size={18} />
                  </button>
                </div>

                {/* Reading Mode */}
                <div className="space-y-2">
                  <span className="text-xs font-black text-neutral-300">نمط القراءة</span>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'webtoon', label: 'عمودي متصل' },
                      { id: 'paged-rtl', label: 'من اليمين' },
                      { id: 'paged-ltr', label: 'من اليسار' },
                    ].map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => updatePrefs({ mode: m.id as ReaderMode })}
                        className={`min-h-[44px] px-2 rounded-xl border text-xs font-black cursor-pointer transition ${
                          prefs.mode === m.id
                            ? 'bg-[#FF1744] border-[#FF1744] text-white'
                            : 'bg-neutral-900 border-neutral-800 text-neutral-300'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Large-screen Double Page Toggle */}
                {isWideScreen && (
                  <div className="space-y-2">
                    <span className="text-xs font-black text-neutral-300">العرض للشاشة الكبيرة</span>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => updatePrefs({ doublePage: false })}
                        className={`min-h-[44px] px-3 rounded-xl border text-xs font-black cursor-pointer transition ${
                          !isDoublePageActive
                            ? 'bg-[#FF1744] border-[#FF1744] text-white'
                            : 'bg-neutral-900 border-neutral-800 text-neutral-300'
                        }`}
                      >
                        صفحة واحدة
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          updatePrefs({
                            doublePage: true,
                            mode: prefs.mode === 'webtoon' ? 'paged-rtl' : prefs.mode,
                          })
                        }
                        className={`min-h-[44px] px-3 rounded-xl border text-xs font-black cursor-pointer transition flex items-center justify-center gap-1.5 ${
                          isDoublePageActive
                            ? 'bg-[#FF1744] border-[#FF1744] text-white'
                            : 'bg-neutral-900 border-neutral-800 text-neutral-300'
                        }`}
                      >
                        <Columns2 size={15} />
                        <span>صفحتان معاً</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Canvas Background */}
                <div className="space-y-2">
                  <span className="text-xs font-black text-neutral-300">خلفية القارئ</span>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'amoled', label: 'أسود أموليد' },
                      { id: 'dark', label: 'داكن مريح' },
                      { id: 'sepia', label: 'ورقي دافئ' },
                    ].map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => updatePrefs({ bg: b.id as ReaderBg })}
                        className={`min-h-[44px] px-2 rounded-xl border text-xs font-black cursor-pointer transition ${
                          prefs.bg === b.id
                            ? 'bg-[#FF1744] border-[#FF1744] text-white'
                            : 'bg-neutral-900 border-neutral-800 text-neutral-300'
                        }`}
                      >
                        {b.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Image Quality */}
                <div className="space-y-2">
                  <span className="text-xs font-black text-neutral-300">دقة الصفحات</span>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: 'high', label: 'جودة أصلية عالية' },
                      { id: 'saver', label: 'توفير البيانات' },
                    ].map((q) => (
                      <button
                        key={q.id}
                        type="button"
                        onClick={() => updatePrefs({ quality: q.id as ReaderQuality })}
                        className={`min-h-[44px] px-3 rounded-xl border text-xs font-black cursor-pointer transition ${
                          prefs.quality === q.id
                            ? 'bg-[#FF1744] border-[#FF1744] text-white'
                            : 'bg-neutral-900 border-neutral-800 text-neutral-300'
                        }`}
                      >
                        {q.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Brightness */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-black text-neutral-300 tabular-nums">
                    <span>السطوع</span>
                    <span>{prefs.brightness}%</span>
                  </div>
                  <input
                    type="range"
                    min={60}
                    max={110}
                    value={prefs.brightness}
                    onChange={(e) => updatePrefs({ brightness: Number(e.target.value) })}
                    className="w-full accent-[#FF1744]"
                  />
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </ViewportPortal>

      {/* Chapter Comments Drawer */}
      <ViewportPortal>
        <AnimatePresence>
          {showComments && (
            <div
              className="fixed inset-0 z-[130] flex items-end sm:items-center justify-center sm:p-4 font-sans"
              style={{ height: 'var(--vv-height, 100dvh)' }}
              dir="rtl"
            >
              <div
                onClick={() => setShowComments(false)}
                className="absolute inset-0 bg-black/80 backdrop-blur-sm"
              />
              <motion.div
                initial={{ opacity: 0, y: 28 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 24 }}
                className="relative w-full sm:max-w-xl max-h-[86dvh] bg-[#0f0f13] border border-neutral-800 rounded-t-3xl sm:rounded-3xl flex flex-col overflow-hidden z-10"
              >
                <div className="px-5 py-4 border-b border-neutral-800 flex items-center justify-between shrink-0">
                  <h3 className="text-sm font-black text-white">
                    تعليقات الفصل {chapter?.num}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setShowComments(false)}
                    className="min-w-[40px] min-h-[40px] rounded-xl bg-neutral-900 text-neutral-400 flex items-center justify-center cursor-pointer"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {commentsLoading ? (
                    <div className="py-10 flex justify-center">
                      <Loader2 className="animate-spin text-[#FF1744]" size={24} />
                    </div>
                  ) : topLevelComments.length === 0 ? (
                    <p className="text-center text-xs text-neutral-400 font-bold py-8">
                      لا توجد تعليقات على هذا الفصل بعد.
                    </p>
                  ) : (
                    topLevelComments.map((c) => (
                      <AnimeCommentItem
                        key={c.id}
                        comment={c}
                        user={user}
                        replies={repliesByParent[c.id || ''] || []}
                        onAddReply={handleReplyComment}
                        onUserClick={onUserClick}
                        onDeleteLocally={(cid: string) =>
                          setComments((prev) => prev.filter((item) => item.id !== cid))
                        }
                      />
                    ))
                  )}
                </div>

                <form
                  onSubmit={handlePostComment}
                  className="p-3.5 border-t border-neutral-800 bg-[#0c0c10] space-y-2 shrink-0"
                >
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      placeholder={user ? 'اكتب تعليقك على الفصل...' : 'سجل دخولك للتعليق'}
                      className="flex-1 min-h-[44px] bg-black/50 border border-neutral-800 rounded-xl px-3 text-xs text-white focus:outline-none focus:border-[#FF1744]"
                    />
                    <button
                      type="submit"
                      disabled={submittingComment || !newComment.trim()}
                      className="min-h-[44px] px-4 rounded-xl bg-[#FF1744] disabled:opacity-40 text-white text-xs font-black flex items-center gap-1 cursor-pointer"
                    >
                      <Send size={14} />
                      <span>إرسال</span>
                    </button>
                  </div>
                  <label className="flex items-center gap-2 text-[11px] text-neutral-400 font-bold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isSpoiler}
                      onChange={(e) => setIsSpoiler(e.target.checked)}
                      className="accent-[#FF1744]"
                    />
                    <span>حرق أحداث</span>
                  </label>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </ViewportPortal>
    </div>
  );
}
