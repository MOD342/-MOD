import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ChevronRight,
  BookOpen,
  Star,
  Heart,
  Download,
  List,
  Plus,
  Check,
  CheckCircle2,
  Tv,
  MessageCircle,
  Send,
  Loader2,
  AlertCircle,
  RefreshCw,
  X,
  ArrowUpDown,
  Search,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { mangaListService, type MangaEntry } from '../services/mangaListService';
import { listService, type CustomList, type MainListStatus, isActiveLibraryEntry, getCustomListColorOption } from '../services/listService';
import { getComments, addComment, type Comment } from '../services/animeInteractionService';
import { downloadManagerService, useDownloadQueue } from '../services/downloadManagerService';
import { clientCache } from '../utils/clientCache';
import { cloudCatalogService } from '../services/cloudCatalogService';
import { useDeviceDisplay } from '../hooks/useDeviceDisplay';
import ViewportPortal from '../components/ViewportPortal';
import PullToRefresh from '../components/PullToRefresh';
import AnimeCommentItem from '../components/AnimeCommentItem';
import BatchChapterDownloadModal from '../components/BatchChapterDownloadModal';
import ImageLightboxModal from '../components/ImageLightboxModal';
import { LongPressCopy } from '../components/LongPressCopy';
import { translateGenreToArabic } from '../utils/genreTaxonomy';

interface MangaDetailsViewProps {
  mangaId: string;
  onBack: () => void;
  onMangaClick: (id: string) => void;
  onAnimeClick: (id: string) => void;
  onReadChapter: (params: {
    manga: any;
    chapter: any;
    chapters: any[];
    initialPage?: number;
    offlineItemId?: string;
  }) => void;
  onNavigateDownloads: () => void;
  onUserClick?: (userId: string) => void;
  onNavigate?: (view: string, props?: any) => void;
}

const READING_LISTS: { id: MainListStatus; label: string }[] = [
  { id: 'watching', label: 'أقرأه حالياً' },
  { id: 'completed', label: 'مكتمل' },
  { id: 'plan_to_watch', label: 'أنوي قراءته' },
  { id: 'on_hold', label: 'مؤجل' },
  { id: 'dropped', label: 'ملغي' },
];

export default function MangaDetailsView({
  mangaId,
  onBack,
  onMangaClick,
  onAnimeClick,
  onReadChapter,
  onNavigateDownloads,
  onUserClick,
  onNavigate,
}: MangaDetailsViewProps) {
  const { user, userData, signIn } = useAuth();
  const display = useDeviceDisplay();
  const downloadQueue = useDownloadQueue();

  const [manga, setManga] = useState<any>(() =>
    clientCache.get(`client_manga_details_v7_${mangaId}`),
  );
  const [chapters, setChapters] = useState<any[]>(() => {
    const cached = clientCache.get(`client_manga_chapters_v7_${mangaId}`);
    return Array.isArray(cached) && cached.length > 0 ? cached : [];
  });
  const [loading, setLoading] = useState(() => !clientCache.get(`client_manga_details_v7_${mangaId}`));
  const [chaptersLoading, setChaptersLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [activeTab, setActiveTab] = useState<'info' | 'chapters' | 'comments'>('info');
  const [chapterQuery, setChapterQuery] = useState('');
  const [sortDesc, setSortDesc] = useState(true);

  const [userEntry, setUserEntry] = useState<MangaEntry | null>(null);
  const [customLists, setCustomLists] = useState<CustomList[]>([]);
  const [appRating, setAppRating] = useState<{ score: number; count: number }>({ score: 0, count: 0 });
  const [hoverRating, setHoverRating] = useState(0);

  const [showListModal, setShowListModal] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<{ src: string; caption?: string } | null>(null);

  // Comments tab state
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [isSpoiler, setIsSpoiler] = useState(false);
  const [submittingComment, setSubmittingComment] = useState(false);

  const commentThreadId = `manga:${mangaId}`;

  const loadUserState = useCallback(async () => {
    if (!user) {
      setUserEntry(null);
      setCustomLists([]);
      return;
    }
    try {
      const [entries, customs] = await Promise.all([
        mangaListService.getMangaEntries(user.id),
        listService.getCustomLists(user.id),
      ]);
      const found = entries.find((e) => e.id === String(mangaId) || e.mangaId === String(mangaId));
      setUserEntry(found || null);
      setCustomLists(customs);
    } catch {}
  }, [user, mangaId]);

  const fetchAll = useCallback(
    async (forceBypass = false) => {
      const detailsCacheKey = `client_manga_details_v7_${mangaId}`;
      const chaptersCacheKey = `client_manga_chapters_v7_${mangaId}`;

      // Clean up legacy v5 client caches for this manga if present
      clientCache.delete(`client_manga_details_v5_${mangaId}`);
      clientCache.delete(`client_manga_chapters_v5_${mangaId}`);

      if (forceBypass) {
        clientCache.delete(detailsCacheKey);
        clientCache.delete(chaptersCacheKey);
      } else {
        const cachedDetails = clientCache.get<any>(detailsCacheKey);
        const cachedChapters = clientCache.get<any[]>(chaptersCacheKey);
        if (cachedDetails && Array.isArray(cachedChapters) && cachedChapters.length > 0) {
          const expected = Number(cachedDetails?.chaptersCount || 0);
          const nums = cachedChapters
            .map((c: any) => Number(c?.chapterNumber))
            .filter((n: number) => Number.isFinite(n) && n >= 0);
          const looksIncomplete =
            (expected >= 15 && cachedChapters.length < Math.floor(expected * 0.72)) ||
            (cachedChapters.length >= 10 && nums.length > 0 && Math.min(...nums) > 3);

          setManga(cachedDetails);
          setChapters(cachedChapters);
          setLoading(false);
          void mangaListService.getMangaAppRating(String(cachedDetails._id || mangaId)).then(setAppRating);

          if (!looksIncomplete) {
            setChaptersLoading(false);
            return;
          }
          forceBypass = true;
        }
      }

      if (!manga) setLoading(true);
      setLoadError(false);
      setChaptersLoading(true);

      try {
        await cloudCatalogService.getMangaWithCloud(String(mangaId), {
          forceRefresh: forceBypass,
          onDetails: (details) => {
            setManga(details);
            clientCache.set(detailsCacheKey, details, 6 * 60 * 60 * 1000);
            setLoading(false);
            void mangaListService.getMangaAppRating(String(details._id || mangaId)).then(setAppRating);
          },
          onChapters: (chList, resolvedMdId) => {
            const safeList = Array.isArray(chList) ? chList : [];
            setChapters(safeList);
            if (safeList.length > 0) {
              clientCache.set(chaptersCacheKey, safeList, 30 * 60 * 1000);
            }
            if (resolvedMdId) {
              setManga((prev: any) =>
                prev && !prev.mangadexId ? { ...prev, mangadexId: resolvedMdId } : prev,
              );
            }
            setChaptersLoading(false);
          },
          onError: () => {
            if (!manga) setLoadError(true);
          },
        });
      } catch {
        if (!manga) setLoadError(true);
      } finally {
        setLoading(false);
        setChaptersLoading(false);
      }
    },
    [mangaId],
  );

  useEffect(() => {
    const cachedDetails = clientCache.get<any>(`client_manga_details_v7_${mangaId}`);
    const cachedChapters = clientCache.get<any[]>(`client_manga_chapters_v7_${mangaId}`);
    setManga(cachedDetails || null);
    setChapters(Array.isArray(cachedChapters) && cachedChapters.length > 0 ? cachedChapters : []);
    void fetchAll(false);
  }, [mangaId]);

  useEffect(() => {
    void loadUserState();
    const onLibUpdate = () => void loadUserState();
    window.addEventListener('manga-library-updated', onLibUpdate);
    return () => window.removeEventListener('manga-library-updated', onLibUpdate);
  }, [loadUserState]);

  const loadCommentsList = useCallback(async () => {
    setCommentsLoading(true);
    try {
      const list = await getComments(commentThreadId);
      setComments(list);
    } finally {
      setCommentsLoading(false);
    }
  }, [commentThreadId]);

  useEffect(() => {
    if (activeTab === 'comments') {
      void loadCommentsList();
    }
  }, [activeTab, loadCommentsList]);

  const ascSortedChapters = useMemo(() => {
    return [...chapters].sort(
      (a, b) => (Number(a.chapterNumber) || 0) - (Number(b.chapterNumber) || 0),
    );
  }, [chapters]);

  const displayedChapters = useMemo(() => {
    let list = [...ascSortedChapters];
    if (sortDesc) list.reverse();
    if (chapterQuery.trim()) {
      const q = chapterQuery.trim().toLowerCase();
      list = list.filter(
        (c) =>
          String(c.num || '').toLowerCase().includes(q) ||
          String(c.title || '').toLowerCase().includes(q),
      );
    }
    return list;
  }, [ascSortedChapters, sortDesc, chapterQuery]);

  const offlineMap = useMemo(() => {
    const map = new Map<string, string>();
    downloadQueue.forEach((item) => {
      if (
        item.itemType === 'chapter' &&
        item.status === 'completed' &&
        item.hasOfflineFile &&
        item.chapterId
      ) {
        map.set(item.chapterId, item.id);
      }
    });
    return map;
  }, [downloadQueue]);

  const isChapterRead = useCallback(
    (num: string | number) => {
      if (userEntry?.status === 'completed') return true;
      const n = Number(num);
      return Boolean(userEntry?.readChapters?.some((c) => Number(c) === n));
    },
    [userEntry],
  );

  const localHistoryItem = useMemo(() => {
    const history = mangaListService.getReadingHistory(user?.id);
    return history.find((h) => String(h.mangaId) === String(mangaId)) || null;
  }, [mangaId, user?.id, chapters.length]);

  const effectiveLastReadChapter =
    userEntry?.lastReadChapter !== undefined
      ? Number(userEntry.lastReadChapter)
      : localHistoryItem
        ? Number(localHistoryItem.chapterNum)
        : undefined;

  const effectiveLastReadPage =
    userEntry?.lastReadChapter !== undefined
      ? userEntry?.lastReadPage || 1
      : localHistoryItem?.pageIndex || 1;

  const resumeChapter = useMemo(() => {
    if (ascSortedChapters.length === 0) return null;
    if (effectiveLastReadChapter !== undefined) {
      const match = ascSortedChapters.find(
        (c) => Number(c.chapterNumber) === effectiveLastReadChapter,
      );
      if (match) return match;
    }
    return ascSortedChapters[0];
  }, [ascSortedChapters, effectiveLastReadChapter]);

  const handleToggleFavorite = async () => {
    if (!user) return signIn();
    if (!manga) return;
    const nextFav = !userEntry?.isFavorite;
    setUserEntry((prev) =>
      prev
        ? { ...prev, isFavorite: nextFav }
        : {
            id: String(manga._id),
            mangaId: String(manga._id),
            title: manga.title,
            posterUrl: manga.posterUrl,
            releaseYear: String(manga.releaseYear || ''),
            status: 'none',
            customLists: {},
            isFavorite: nextFav,
            addedAt: null,
            updatedAt: null,
          },
    );
    await mangaListService.saveMangaEntry(user.id, String(manga._id), {
      title: manga.title,
      posterUrl: manga.posterUrl,
      mediaFormat: manga.mediaFormat,
      countryOfOrigin: manga.countryOfOrigin,
      releaseYear: String(manga.releaseYear || ''),
      chaptersCount: manga.chaptersCount || chapters.length || undefined,
      isFavorite: nextFav,
    });
  };

  const handleSelectListStatus = async (status: MainListStatus) => {
    if (!user) return signIn();
    if (!manga) return;
    const nextStatus = userEntry?.status === status ? 'none' : status;
    setShowListModal(false);
    await mangaListService.saveMangaEntry(user.id, String(manga._id), {
      title: manga.title,
      posterUrl: manga.posterUrl,
      mediaFormat: manga.mediaFormat,
      countryOfOrigin: manga.countryOfOrigin,
      releaseYear: String(manga.releaseYear || ''),
      chaptersCount: manga.chaptersCount || chapters.length || undefined,
      status: nextStatus,
      customLists: userEntry?.customLists || {},
    });
    void loadUserState();
  };

  const handleToggleCustomList = async (listId: string) => {
    if (!user) return signIn();
    if (!manga) return;
    const map = { ...(userEntry?.customLists || {}) };
    if (map[listId]) delete map[listId];
    else map[listId] = true;
    setShowListModal(false);
    await mangaListService.saveMangaEntry(user.id, String(manga._id), {
      title: manga.title,
      posterUrl: manga.posterUrl,
      mediaFormat: manga.mediaFormat,
      countryOfOrigin: manga.countryOfOrigin,
      releaseYear: String(manga.releaseYear || ''),
      chaptersCount: manga.chaptersCount || chapters.length || undefined,
      status: userEntry?.status || 'none',
      customLists: map,
    });
    void loadUserState();
  };

  const handleCreateCustomList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !manga || !newListName.trim()) return;
    const id = await listService.createCustomList(user.id, newListName.trim());
    setNewListName('');
    await handleToggleCustomList(id);
  };

  const handleRate = async (score: number) => {
    if (!user) return signIn();
    if (!manga) return;
    const nextScore = userEntry?.score === score ? 0 : score;
    await mangaListService.saveMangaEntry(user.id, String(manga._id), {
      title: manga.title,
      posterUrl: manga.posterUrl,
      mediaFormat: manga.mediaFormat,
      countryOfOrigin: manga.countryOfOrigin,
      releaseYear: String(manga.releaseYear || ''),
      score: nextScore,
    });
    const fresh = await mangaListService.getMangaAppRating(String(manga._id));
    setAppRating(fresh);
    void loadUserState();
  };

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
      void loadCommentsList();
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleAddReply = async (parentId: string, text: string, spoiler: boolean) => {
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
    void loadCommentsList();
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

  if (loading && !manga) {
    return (
      <div className="bg-black min-h-screen flex flex-col items-center justify-center gap-3 text-neutral-400" dir="rtl">
        <Loader2 className="animate-spin text-[#FF1744]" size={38} />
        <span className="text-xs font-bold">جاري تحميل بيانات العمل...</span>
      </div>
    );
  }

  if (!manga || loadError) {
    return (
      <div className="bg-black min-h-screen flex flex-col items-center justify-center p-6 text-center gap-4" dir="rtl">
        <AlertCircle className="text-rose-500" size={44} />
        <div className="space-y-1 max-w-sm">
          <h2 className="text-base font-black text-white">تعذر تحميل تفاصيل العمل</h2>
          <p className="text-xs text-neutral-400">تحقق من اتصالك بالإنترنت ثم أعد المحاولة</p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => void fetchAll(true)}
            className="min-h-[44px] inline-flex items-center gap-2 px-4 rounded-xl bg-[#FF1744] text-white text-xs font-black cursor-pointer"
          >
            <RefreshCw size={14} />
            <span>إعادة المحاولة</span>
          </button>
          <button
            type="button"
            onClick={onBack}
            className="min-h-[44px] inline-flex items-center gap-1.5 px-4 rounded-xl bg-neutral-900 border border-white/10 text-neutral-200 text-xs font-black cursor-pointer"
          >
            <ChevronRight size={14} />
            <span>رجوع</span>
          </button>
        </div>
      </div>
    );
  }

  const isSaved = isActiveLibraryEntry(userEntry as any);
  const currentStatusLabel =
    READING_LISTS.find((l) => l.id === userEntry?.status)?.label ||
    (isSaved ? 'في قائمتك' : 'أضف لقائمتي');

  return (
    <PullToRefresh onRefresh={() => fetchAll(true)}>
      <div className="bg-black min-h-[var(--vv-height,100dvh)] pb-24 text-white font-sans" dir="rtl">
        {/* Top Floating Controls */}
        <div
          style={{
            paddingTop: 'calc(var(--safe-top, 0px) + 0.75rem)',
            paddingLeft: 'calc(var(--safe-left, 0px) + 1rem)',
            paddingRight: 'calc(var(--safe-right, 0px) + 1rem)',
          }}
          className="theme-keep-dark fixed top-0 inset-x-0 max-w-6xl mx-auto flex items-center justify-between z-50 pointer-events-none"
        >
          <button
            type="button"
            onClick={onBack}
            aria-label="رجوع"
            className="min-w-[44px] min-h-[44px] rounded-xl bg-black/65 backdrop-blur-md border border-white/15 text-white flex items-center justify-center pointer-events-auto cursor-pointer hover:bg-black/85 transition"
          >
            <ChevronRight size={22} />
          </button>

          <button
            type="button"
            onClick={handleToggleFavorite}
            aria-label="المفضلة"
            className="min-w-[44px] min-h-[44px] rounded-xl bg-black/65 backdrop-blur-md border border-white/15 flex items-center justify-center pointer-events-auto cursor-pointer hover:bg-black/85 transition"
          >
            <Heart
              size={20}
              fill={userEntry?.isFavorite ? '#FF1744' : 'none'}
              className={userEntry?.isFavorite ? 'text-[#FF1744]' : 'text-white'}
            />
          </button>
        </div>

        {/* Full-bleed Hero */}
        <div
          onClick={() => {
            const cover = manga.bannerUrl || manga.posterUrl;
            if (cover) setLightboxImage({ src: cover, caption: manga.title });
          }}
          className={`theme-keep-dark relative w-full bg-[#0c0c10] overflow-hidden cursor-zoom-in ${
            display.isCoverScreen ? 'h-[42vh] min-h-[280px]' : 'h-[48vh] min-h-[340px] max-h-[460px]'
          }`}
        >
          {(manga.bannerUrl || manga.posterUrl) && (
            <img
              src={manga.bannerUrl || manga.posterUrl}
              alt={manga.title}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          )}

          <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-black/80 via-black/35 to-transparent pointer-events-none z-10" />

          <div
            className="absolute bottom-5 inset-x-4 max-w-6xl mx-auto z-20 flex items-end gap-4 md:gap-6 pointer-events-none"
            style={{ textShadow: '0 2px 12px rgba(0,0,0,0.95), 0 1px 4px rgba(0,0,0,0.9)' }}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (manga.posterUrl) {
                  setLightboxImage({ src: manga.posterUrl, caption: manga.title });
                }
              }}
              aria-label="تكبير غلاف العمل"
              className="w-24 sm:w-28 md:w-32 aspect-[3/4] rounded-2xl overflow-hidden border border-white/15 hover:border-white/40 bg-neutral-900 shadow-2xl shrink-0 pointer-events-auto cursor-zoom-in transition"
            >
              {manga.posterUrl ? (
                <img
                  src={manga.posterUrl}
                  alt={manga.title}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-neutral-600">
                  <BookOpen size={28} />
                </div>
              )}
            </button>

            <div className="flex-1 min-w-0 space-y-1.5 text-right">
              <div className="flex items-center flex-wrap gap-1.5 text-xs font-bold text-neutral-300 tabular-nums">
                <span className="text-[#FF1744] font-black">{manga.originLabel || 'مانجا'}</span>
                {manga.rating > 0 && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-yellow-400 inline-flex items-center gap-1">
                      <Star size={12} fill="currentColor" />
                      {Number(manga.rating).toFixed(1)}
                    </span>
                  </>
                )}
                {manga.status && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{manga.status}</span>
                  </>
                )}
                {(manga.chaptersCount || chapters.length > 0) && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{manga.chaptersCount || chapters.length} فصل</span>
                  </>
                )}
              </div>

              <h1
                onClick={(e) => e.stopPropagation()}
                className="pointer-events-auto text-xl sm:text-2xl md:text-3xl font-black text-white leading-tight line-clamp-2"
              >
                <LongPressCopy text={manga.title}>{manga.title}</LongPressCopy>
              </h1>

              {manga.englishTitle && manga.englishTitle !== manga.title && (
                <p
                  onClick={(e) => e.stopPropagation()}
                  className="pointer-events-auto text-[11px] sm:text-xs text-neutral-300 font-semibold truncate"
                >
                  <LongPressCopy text={manga.englishTitle}>{manga.englishTitle}</LongPressCopy>
                </p>
              )}

              {manga.releaseYear && (
                <p className="text-xs text-neutral-300 tabular-nums">
                  الإصدار: {manga.releaseYear}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="max-w-6xl mx-auto px-4 md:px-6 pt-5 space-y-5">
          {/* Primary Action Bar */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              disabled={!resumeChapter}
              onClick={() =>
                resumeChapter &&
                onReadChapter({
                  manga,
                  chapter: resumeChapter,
                  chapters: ascSortedChapters,
                  initialPage:
                    effectiveLastReadChapter === Number(resumeChapter.chapterNumber)
                      ? effectiveLastReadPage
                      : 1,
                  offlineItemId: offlineMap.get(resumeChapter.id),
                })
              }
              className="flex-1 min-w-[180px] min-h-[48px] px-5 rounded-xl bg-[#FF1744] hover:bg-red-600 disabled:opacity-40 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-red-600/20 transition cursor-pointer"
            >
              <BookOpen size={18} />
              <span>
                {resumeChapter
                  ? effectiveLastReadChapter !== undefined
                    ? `استكمال الفصل ${resumeChapter.num}`
                    : `ابدأ القراءة · الفصل ${resumeChapter.num}`
                  : chaptersLoading
                    ? 'جاري تجهيز الفصول...'
                    : 'لا توجد فصول متاحة'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => (user ? setShowListModal(true) : signIn())}
              className="min-h-[48px] px-4 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-white text-xs font-black flex items-center gap-2 transition cursor-pointer whitespace-nowrap"
            >
              {isSaved ? <Check size={16} className="text-emerald-400" /> : <Plus size={16} />}
              <span>{currentStatusLabel}</span>
            </button>

            {chapters.length > 0 && (
              <button
                type="button"
                onClick={() => setShowBatchModal(true)}
                className="min-h-[48px] px-4 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-200 text-xs font-black flex items-center gap-2 transition cursor-pointer whitespace-nowrap"
              >
                <Download size={16} />
                <span>تنزيل عدة فصول</span>
              </button>
            )}

            {manga.adaptedAnime?.id && (
              <button
                type="button"
                onClick={() => onAnimeClick(String(manga.adaptedAnime.id))}
                className="min-h-[48px] px-4 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/40 text-purple-300 text-xs font-black flex items-center gap-2 transition cursor-pointer whitespace-nowrap"
              >
                <Tv size={16} />
                <span>شاهد الأنمي</span>
              </button>
            )}
          </div>

          {/* Tabs */}
          <div className="grid grid-cols-3 gap-1.5 p-1 bg-[#0f0f13] border border-neutral-800 rounded-xl">
            {[
              { id: 'info', label: 'البيانات' },
              { id: 'chapters', label: `الفصول (${chapters.length})` },
              { id: 'comments', label: 'التعليقات' },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id as any)}
                className={`min-h-[44px] px-3 rounded-lg text-xs font-black transition cursor-pointer tabular-nums whitespace-nowrap ${
                  activeTab === t.id
                    ? 'bg-[#FF1744] text-white'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Info Tab */}
          {activeTab === 'info' && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                <div className="lg:col-span-8 bg-[#0f0f13] border border-neutral-800/90 rounded-2xl p-4 sm:p-5 space-y-3">
                  <h2 className="text-sm font-black text-white">القصة</h2>
                  <p className="text-xs sm:text-sm text-neutral-300 leading-relaxed">
                    {manga.description || 'لا توجد قصة متاحة لهذا العمل حالياً.'}
                  </p>
                  {Array.isArray(manga.genres) && manga.genres.length > 0 && (
                    <div className="pt-2 border-t border-white/5 flex flex-wrap items-center gap-1.5">
                      {manga.genres.map((g: string, gIdx: number) => (
                        <button
                          key={`${g}-${gIdx}`}
                          type="button"
                          onClick={() =>
                            onNavigate?.('watch', {
                              initialGenre: g,
                              initialMediaKind: 'manga',
                            })
                          }
                          className="min-h-[32px] text-[11px] bg-black/60 border border-white/10 hover:border-amber-400/60 hover:text-amber-300 px-3 py-1 rounded-full text-neutral-200 font-bold transition cursor-pointer"
                        >
                          {translateGenreToArabic(g)}
                        </button>
                      ))}
                    </div>
                  )}
                  {Array.isArray(manga.authors) && manga.authors.length > 0 && (
                    <div className="text-xs text-neutral-400 font-bold">
                      فريق العمل:{' '}
                      <span className="text-neutral-200">
                        {manga.authors.map((a: any) => `${a.name} (${a.role})`).join(' · ')}
                      </span>
                    </div>
                  )}
                </div>

                {/* App Community Score */}
                <div className="lg:col-span-4 bg-[#0f0f13] border border-neutral-800/90 rounded-2xl p-4 sm:p-5 space-y-3">
                  <h2 className="text-sm font-black text-white">تقييم القراء</h2>
                  <div className="flex items-center gap-4">
                    <div className="min-w-[76px] p-3 rounded-xl bg-black/50 border border-yellow-500/20 text-center">
                      <div className="text-2xl font-black text-yellow-400 tabular-nums">
                        {appRating.score || '?'}
                      </div>
                      <div className="text-[11px] text-neutral-400 tabular-nums">
                        من {appRating.count} تقييم
                      </div>
                    </div>
                    <div className="flex-1 space-y-2">
                      <div
                        className="flex items-center gap-0.5"
                        onMouseLeave={() => setHoverRating(0)}
                      >
                        {[...Array(10)].map((_, idx) => {
                          const val = idx + 1;
                          const active = hoverRating ? val <= hoverRating : val <= (userEntry?.score || 0);
                          return (
                            <button
                              key={val}
                              type="button"
                              onMouseEnter={() => setHoverRating(val)}
                              onClick={() => void handleRate(val)}
                              className="p-0.5 cursor-pointer"
                              aria-label={`تقييم ${val} من 10`}
                            >
                              <Star
                                size={15}
                                fill={active ? 'currentColor' : 'none'}
                                className={active ? 'text-yellow-400' : 'text-neutral-600'}
                              />
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-[11px] text-neutral-400 font-bold tabular-nums">
                        {userEntry?.score
                          ? `تقييمك الحالي: ${userEntry.score} / 10`
                          : 'اضغط على النجوم لتقييم العمل'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Related Works */}
              {Array.isArray(manga.related) && manga.related.length > 0 && (
                <section className="space-y-3">
                  <h3 className="text-sm font-black text-white">أعمال مرتبطة</h3>
                  <div className="flex gap-3 overflow-x-auto pb-2 hide-scrollbar snap-x snap-mandatory">
                    {manga.related.map((rel: any, idx: number) => (
                      <button
                        key={`rel-${rel.id}-${idx}`}
                        type="button"
                        onClick={() => onMangaClick(String(rel.id))}
                        className="snap-start theme-keep-dark w-[126px] sm:w-[148px] shrink-0 text-right group cursor-pointer relative aspect-[3/4] rounded-xl overflow-hidden bg-neutral-900 border border-white/10 hover:border-amber-400/60 transition-colors"
                      >
                        {rel.posterUrl ? (
                          <img
                            src={rel.posterUrl}
                            alt={rel.title}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-neutral-600">
                            <BookOpen size={22} />
                          </div>
                        )}
                        <div
                          className="absolute inset-x-0 bottom-0 pt-5 pb-2 px-2 bg-gradient-to-t from-black/85 via-black/45 to-transparent text-center"
                          style={{ textShadow: '0 2px 6px rgba(0,0,0,0.98), 0 0 3px rgba(0,0,0,0.95)' }}
                        >
                          <span className="text-[10px] text-neutral-200 font-bold block">
                            {rel.relation} · {rel.originLabel}
                          </span>
                          <span className="text-xs font-black text-white group-hover:text-amber-300 transition-colors line-clamp-2 block">
                            <LongPressCopy text={rel.title}>{rel.title}</LongPressCopy>
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {/* Recommendations */}
              {Array.isArray(manga.recommendations) && manga.recommendations.length > 0 && (
                <section className="space-y-3">
                  <h3 className="text-sm font-black text-white">أعمال مشابهة قد تعجبك</h3>
                  <div className="flex gap-3 overflow-x-auto pb-2 hide-scrollbar snap-x snap-mandatory">
                    {manga.recommendations.map((rec: any, idx: number) => (
                      <button
                        key={`rec-${rec._id}-${idx}`}
                        type="button"
                        onClick={() => onMangaClick(String(rec._id))}
                        className="snap-start theme-keep-dark w-[126px] sm:w-[148px] shrink-0 text-right group cursor-pointer relative aspect-[3/4] rounded-xl overflow-hidden bg-neutral-900 border border-white/10 hover:border-amber-400/60 transition-colors"
                      >
                        {rec.posterUrl ? (
                          <img
                            src={rec.posterUrl}
                            alt={rec.title}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-neutral-600">
                            <BookOpen size={22} />
                          </div>
                        )}
                        <div
                          className="absolute inset-x-0 bottom-0 pt-5 pb-2 px-2 bg-gradient-to-t from-black/85 via-black/45 to-transparent text-center"
                          style={{ textShadow: '0 2px 6px rgba(0,0,0,0.98), 0 0 3px rgba(0,0,0,0.95)' }}
                        >
                          <span className="text-[10px] text-amber-300 font-bold tabular-nums block">
                            {rec.originLabel} · {rec.rating}
                          </span>
                          <span className="text-xs font-black text-white group-hover:text-amber-300 transition-colors line-clamp-2 block">
                            <LongPressCopy text={rec.title}>{rec.title}</LongPressCopy>
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}

          {/* Chapters Tab */}
          {activeTab === 'chapters' && (
            <div className="space-y-3">
              {chapters.length > 0 && (
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <div className="relative flex-1">
                    <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                    <input
                      type="text"
                      value={chapterQuery}
                      onChange={(e) => setChapterQuery(e.target.value)}
                      placeholder="ابحث برقم الفصل أو عنوانه..."
                      className="w-full min-h-[44px] bg-[#0f0f13] border border-neutral-800 rounded-xl pr-9 pl-3 text-xs font-bold text-white placeholder-neutral-500 focus:outline-none focus:border-[#FF1744]"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void fetchAll(true)}
                      disabled={chaptersLoading}
                      title="تحديث قائمة الفصول"
                      aria-label="تحديث قائمة الفصول"
                      className="min-h-[44px] px-3 rounded-xl bg-[#0f0f13] hover:bg-neutral-800 border border-neutral-800 text-xs font-black text-neutral-200 flex items-center gap-1.5 cursor-pointer whitespace-nowrap disabled:opacity-50"
                    >
                      <RefreshCw size={14} className={chaptersLoading ? 'animate-spin text-[#FF1744]' : ''} />
                      <span>تحديث</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSortDesc((p) => !p)}
                      className="min-h-[44px] px-3.5 rounded-xl bg-[#0f0f13] hover:bg-neutral-800 border border-neutral-800 text-xs font-black text-neutral-200 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                    >
                      <ArrowUpDown size={14} />
                      <span>{sortDesc ? 'الأحدث أولاً' : 'الأقدم أولاً'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowBatchModal(true)}
                      className="min-h-[44px] px-4 rounded-xl bg-[#FF1744] hover:bg-red-600 text-white text-xs font-black flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                    >
                      <Download size={14} />
                      <span>تنزيل متعدد</span>
                    </button>
                  </div>
                </div>
              )}

              {chaptersLoading ? (
                <div className="space-y-2">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="h-16 rounded-xl bg-neutral-900 animate-pulse" />
                  ))}
                </div>
              ) : displayedChapters.length === 0 ? (
                <div className="bg-[#0f0f13] border border-neutral-800 rounded-2xl p-8 text-center space-y-3">
                  <p className="text-xs text-neutral-400 font-bold">
                    {chapterQuery.trim()
                      ? 'لا توجد فصول مطابقة لبحثك حالياً.'
                      : 'لا توجد فصول متاحة حالياً لهذا العمل.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => (chapterQuery.trim() ? setChapterQuery('') : void fetchAll(true))}
                    className="min-h-[44px] px-4 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-xs font-black text-white inline-flex items-center gap-2 cursor-pointer transition"
                  >
                    <RefreshCw size={14} />
                    <span>{chapterQuery.trim() ? 'مسح البحث' : 'تحديث الفصول'}</span>
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {displayedChapters.map((ch) => {
                    const read = isChapterRead(ch.num);
                    const offlineId = offlineMap.get(ch.id);
                    return (
                      <div
                        key={ch.id}
                        className={`bg-[#0f0f13] border rounded-xl p-3 flex items-center justify-between gap-2 transition ${
                          read ? 'border-emerald-500/30 opacity-85' : 'border-neutral-800 hover:border-[#FF1744]/50'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            onReadChapter({
                              manga,
                              chapter: ch,
                              chapters: ascSortedChapters,
                              offlineItemId: offlineId,
                            })
                          }
                          className="flex-1 min-w-0 text-right min-h-[44px] flex flex-col justify-center cursor-pointer"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-black text-white tabular-nums truncate">
                              الفصل {ch.num}
                            </span>
                            {read && (
                              <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
                            )}
                          </div>
                          <span className="text-[11px] text-neutral-400 truncate tabular-nums">
                            {ch.languageLabel || 'عربي'} · {ch.pagesCount || '?'} صفحة
                            {offlineId ? ' · محفوظ أوفلاين' : ''}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            downloadManagerService.enqueueMangaBatch(manga, [ch]);
                            onNavigateDownloads();
                          }}
                          aria-label={`تنزيل الفصل ${ch.num}`}
                          className="min-w-[44px] min-h-[44px] rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 hover:text-white flex items-center justify-center shrink-0 cursor-pointer transition"
                        >
                          <Download size={16} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Comments Tab */}
          {activeTab === 'comments' && (
            <div className="space-y-4">
              <form
                onSubmit={handlePostComment}
                className="bg-[#0f0f13] border border-neutral-800 rounded-2xl p-4 space-y-3"
              >
                <textarea
                  rows={2}
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder={user ? 'شارك رأيك أو نظرياتك حول هذا العمل...' : 'سجل دخولك لكتابة تعليق...'}
                  className="w-full bg-black/50 border border-neutral-800 rounded-xl p-3 text-xs sm:text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-[#FF1744] resize-none"
                />
                <div className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-2 text-xs text-neutral-300 font-bold cursor-pointer select-none min-h-[40px]">
                    <input
                      type="checkbox"
                      checked={isSpoiler}
                      onChange={(e) => setIsSpoiler(e.target.checked)}
                      className="rounded accent-[#FF1744]"
                    />
                    <span>يحتوي على حرق أحداث</span>
                  </label>
                  <button
                    type="submit"
                    disabled={submittingComment || !newComment.trim()}
                    className="min-h-[44px] px-5 rounded-xl bg-[#FF1744] hover:bg-red-600 disabled:opacity-40 text-white text-xs font-black flex items-center gap-2 cursor-pointer"
                  >
                    <Send size={14} />
                    <span>إرسال</span>
                  </button>
                </div>
              </form>

              {commentsLoading ? (
                <div className="py-10 flex justify-center">
                  <Loader2 className="animate-spin text-[#FF1744]" size={24} />
                </div>
              ) : topLevelComments.length === 0 ? (
                <div className="bg-[#0f0f13] border border-neutral-800 rounded-2xl p-8 text-center text-xs text-neutral-400 font-bold">
                  لا توجد تعليقات حتى الآن. كن أول من يشارك رأيه!
                </div>
              ) : (
                <div className="space-y-3">
                  {topLevelComments.map((c) => (
                    <AnimeCommentItem
                      key={c.id}
                      comment={c}
                      user={user}
                      replies={repliesByParent[c.id || ''] || []}
                      onAddReply={handleAddReply}
                      onUserClick={onUserClick}
                      onDeleteLocally={(cid: string) =>
                        setComments((prev) => prev.filter((item) => item.id !== cid))
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Reading List Selection Modal */}
        <ViewportPortal>
          <AnimatePresence>
            {showListModal && (
              <div
                className="fixed inset-0 z-[130] flex items-end sm:items-center justify-center sm:p-4 font-sans"
                style={{ height: 'var(--vv-height, 100dvh)' }}
                dir="rtl"
              >
                <div
                  onClick={() => setShowListModal(false)}
                  className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                />
                <motion.div
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 24 }}
                  className="relative w-full sm:max-w-md bg-[#0f0f13] border border-neutral-800 rounded-t-3xl sm:rounded-3xl p-5 space-y-4 z-10 max-h-[85dvh] overflow-y-auto"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-black text-white">إضافة إلى مكتبة القراءة</h3>
                    <button
                      type="button"
                      onClick={() => setShowListModal(false)}
                      className="min-w-[40px] min-h-[40px] rounded-xl bg-neutral-900 flex items-center justify-center text-neutral-400 cursor-pointer"
                    >
                      <X size={18} />
                    </button>
                  </div>

                  <div className="space-y-2">
                    {READING_LISTS.map((l) => {
                      const active = userEntry?.status === l.id;
                      return (
                        <button
                          key={l.id}
                          type="button"
                          onClick={() => void handleSelectListStatus(l.id)}
                          className={`w-full min-h-[46px] px-4 rounded-xl border flex items-center justify-between text-xs font-black transition cursor-pointer ${
                            active
                              ? 'bg-[#FF1744]/15 border-[#FF1744] text-white'
                              : 'bg-neutral-900/70 border-neutral-800 text-neutral-300 hover:bg-neutral-800'
                          }`}
                        >
                          <span>{l.label}</span>
                          {active && <Check size={16} className="text-[#FF1744]" />}
                        </button>
                      );
                    })}
                  </div>

                  {customLists.length > 0 && (
                    <div className="pt-2 border-t border-white/10 space-y-2">
                      <div className="text-xs font-bold text-neutral-400">قوائمك المخصصة</div>
                      {customLists.map((cl) => {
                        const checked = Boolean(userEntry?.customLists?.[cl.id]);
                        const colorOpt = getCustomListColorOption(cl.color);
                        return (
                          <button
                            key={cl.id}
                            type="button"
                            onClick={() => void handleToggleCustomList(cl.id)}
                            className={`w-full min-h-[44px] px-4 rounded-xl border flex items-center justify-between text-xs font-bold transition cursor-pointer ${
                              checked
                                ? colorOpt.inactiveClass
                                : 'bg-neutral-900/60 border-neutral-800 text-neutral-300'
                            }`}
                          >
                            <span className="flex items-center gap-2 min-w-0">
                              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${colorOpt.dotClass}`} />
                              <span className="truncate">{cl.name}</span>
                            </span>
                            {checked && <Check size={15} className="text-white shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <form onSubmit={handleCreateCustomList} className="flex gap-2 pt-2">
                    <input
                      type="text"
                      value={newListName}
                      onChange={(e) => setNewListName(e.target.value)}
                      placeholder="إنشاء قائمة جديدة..."
                      className="flex-1 min-h-[44px] bg-black/50 border border-neutral-800 rounded-xl px-3 text-xs text-white focus:outline-none focus:border-[#FF1744]"
                    />
                    <button
                      type="submit"
                      className="min-h-[44px] px-4 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-black cursor-pointer"
                    >
                      إنشاء
                    </button>
                  </form>
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        </ViewportPortal>

        <BatchChapterDownloadModal
          isOpen={showBatchModal}
          onClose={() => setShowBatchModal(false)}
          manga={{
            _id: String(manga._id),
            mangadexId: manga.mangadexId || null,
            title: manga.title,
            posterUrl: manga.posterUrl,
            mediaFormat: manga.mediaFormat,
          }}
          chapters={ascSortedChapters}
          isChapterRead={isChapterRead}
          onStartDownloads={onNavigateDownloads}
        />
        <ImageLightboxModal
          src={lightboxImage?.src || null}
          alt={manga.title}
          caption={lightboxImage?.caption}
          onClose={() => setLightboxImage(null)}
        />
      </div>
    </PullToRefresh>
  );
}
