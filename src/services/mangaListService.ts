import { db, auth } from '../firebase';
import {
  collection,
  doc,
  getDocs,
  getDocsFromServer,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  increment,
} from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../firebaseUtils';
import { clientCache } from '../utils/clientCache';
import { MainListStatus, ACTIVE_LIST_STATUSES } from './listService';

function isAuthenticatedOwner(id: string): boolean {
  return Boolean(auth.currentUser && auth.currentUser.uid === id);
}

function readLocalJson<T>(key: string, fallback: T): T {
  try {
    if (typeof localStorage === 'undefined') return fallback;
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocalJson<T>(key: string, value: T): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export interface MangaEntry {
  id: string;
  mangaId?: string;
  title: string;
  posterUrl: string;
  mediaFormat?: string;
  countryOfOrigin?: string;
  releaseYear: string;
  status: MainListStatus;
  customLists: Record<string, boolean>;
  score?: number;
  isFavorite?: boolean;
  readChapters?: number[];
  lastReadChapter?: number;
  lastReadPage?: number;
  chaptersCount?: number;
  progress?: number;
  addedAt: any;
  updatedAt: any;
}

export interface ReadingHistoryItem {
  mangaId: string;
  mangadexId?: string | null;
  title: string;
  posterUrl: string;
  mediaFormat?: string;
  originLabel?: string;
  chapterId: string;
  chapterNum: string;
  chapterTitle?: string;
  pageIndex: number;
  totalPages: number;
  updatedAt: number;
}

const mangaEntriesCache = new Map<string, { data: MangaEntry[]; expireAt: number }>();
const mangaRatingCache = new Map<string, { data: { score: number; count: number }; expireAt: number }>();
const mangaEntriesPromises = new Map<string, Promise<MangaEntry[]>>();
const mangaRatingPromises = new Map<string, Promise<{ score: number; count: number }>>();

function normalizeMangaEntry(docId: string, raw: any): MangaEntry {
  const readArr = Array.isArray(raw?.readChapters)
    ? Array.from(
        new Set<number>(
          raw.readChapters
            .map((n: any) => Number(n))
            .filter((n: number) => !isNaN(n) && n >= 0),
        ),
      ).sort((a, b) => a - b)
    : [];

  const rawStatus = String(raw?.status || 'none') as MainListStatus;
  const normalizedStatus: MainListStatus = ACTIVE_LIST_STATUSES.includes(rawStatus)
    ? rawStatus
    : 'none';
  const chaptersCount =
    typeof raw?.chaptersCount === 'number'
      ? raw.chaptersCount
      : parseInt(String(raw?.chaptersCount || '0'), 10) || 0;
  const progress =
    typeof raw?.progress === 'number' && raw.progress > 0
      ? raw.progress
      : normalizedStatus === 'completed'
        ? chaptersCount || readArr.length || 1
        : readArr.length;

  return {
    id: docId,
    mangaId: raw?.mangaId || docId,
    title: raw?.title || `عمل #${docId}`,
    posterUrl: raw?.posterUrl || '',
    mediaFormat: raw?.mediaFormat || 'manga',
    countryOfOrigin: raw?.countryOfOrigin || 'JP',
    releaseYear: raw?.releaseYear ? String(raw.releaseYear) : '',
    status: normalizedStatus,
    customLists:
      raw?.customLists && typeof raw.customLists === 'object' ? raw.customLists : {},
    score: typeof raw?.score === 'number' ? raw.score : undefined,
    isFavorite: Boolean(raw?.isFavorite),
    readChapters: readArr,
    lastReadChapter:
      typeof raw?.lastReadChapter === 'number' ? raw.lastReadChapter : undefined,
    lastReadPage: typeof raw?.lastReadPage === 'number' ? raw.lastReadPage : undefined,
    chaptersCount,
    progress,
    addedAt: raw?.addedAt || null,
    updatedAt: raw?.updatedAt || null,
  };
}

function notifyMangaLibraryUpdated(userId: string, mangaId?: string) {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(
      new CustomEvent('manga-library-updated', { detail: { userId, mangaId } }),
    );
  } catch {}
}

export function computeMangaStats(entries: MangaEntry[], userData?: any) {
  const statusCounts = {
    watching: 0,
    completed: 0,
    plan_to_watch: 0,
    on_hold: 0,
    dropped: 0,
  };
  let customOnlyCount = 0;
  let sumChapters = 0;
  const scores: number[] = [];

  entries.forEach((e) => {
    const status = e.status;
    const hasMain = Boolean(status && status in statusCounts);
    const hasCustom = Boolean(e.customLists && Object.values(e.customLists).some(Boolean));
    if (hasMain) {
      statusCounts[status as keyof typeof statusCounts] += 1;
    } else if (hasCustom) {
      customOnlyCount += 1;
    }

    if (Array.isArray(e.readChapters) && e.readChapters.length > 0) {
      sumChapters += e.readChapters.length;
    } else if (typeof e.progress === 'number' && e.progress > 0) {
      sumChapters += e.progress;
    }

    if (typeof e.score === 'number' && e.score > 0) {
      scores.push(e.score);
    }
  });

  const mainListCount =
    statusCounts.watching +
    statusCounts.completed +
    statusCounts.plan_to_watch +
    statusCounts.on_hold +
    statusCounts.dropped;

  const totalListCount = mainListCount + customOnlyCount;
  const totalChaptersRead = Math.max(sumChapters, Number(userData?.totalChaptersRead || 0));
  const avgScore =
    scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : '0.0';

  return {
    listCount: statusCounts,
    customOnlyCount,
    mainListCount,
    totalListCount,
    completedMangaCount: statusCounts.completed,
    totalChaptersRead,
    avgScore,
  };
}

export const mangaListService = {
  invalidateUserCache: (userId: string, mangaId?: string) => {
    if (userId) {
      mangaEntriesCache.delete(userId);
      clientCache.delete(`client_manga_entries_${userId}`);
    }
    if (mangaId) {
      mangaRatingCache.delete(mangaId);
    }
    notifyMangaLibraryUpdated(userId, mangaId);
  },

  getReadingHistory: (userId?: string | null): ReadingHistoryItem[] => {
    const uid = userId || 'guest';
    const raw = readLocalJson<ReadingHistoryItem[]>(`local_reading_history_${uid}`, []);
    if (!Array.isArray(raw)) return [];
    return raw.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 12);
  },

  recordReadingHistory: (userId: string | null | undefined, item: ReadingHistoryItem) => {
    const uid = userId || 'guest';
    const current = readLocalJson<ReadingHistoryItem[]>(`local_reading_history_${uid}`, []);
    const filtered = (Array.isArray(current) ? current : []).filter(
      (x) => String(x.mangaId) !== String(item.mangaId),
    );
    const next = [{ ...item, updatedAt: Date.now() }, ...filtered].slice(0, 16);
    writeLocalJson(`local_reading_history_${uid}`, next);
    if (typeof window !== 'undefined') {
      try {
        window.dispatchEvent(new CustomEvent('manga-history-updated'));
      } catch {}
    }
  },

  getMangaEntries: async (id: string, forceRefresh = false): Promise<MangaEntry[]> => {
    if (!id) return [];

    if (!isAuthenticatedOwner(id)) {
      const localEntries = readLocalJson<MangaEntry[]>(`local_manga_entries_${id}`, []);
      return localEntries.map((e) => normalizeMangaEntry(e.id, e));
    }

    const now = Date.now();
    if (!forceRefresh) {
      const mem = mangaEntriesCache.get(id);
      if (mem && now < mem.expireAt) return mem.data;

      const lsCached = clientCache.get<MangaEntry[]>(`client_manga_entries_${id}`);
      if (lsCached && Array.isArray(lsCached)) {
        const normalized = lsCached.map((e) => normalizeMangaEntry(e.id, e));
        mangaEntriesCache.set(id, { data: normalized, expireAt: now + 3 * 60 * 1000 });
        return normalized;
      }
    }

    let activePromise = !forceRefresh ? mangaEntriesPromises.get(id) : undefined;
    if (!activePromise) {
      activePromise = (async () => {
        try {
          const ref = collection(db, 'users', id, 'mangaEntries');
          const snap = forceRefresh ? await getDocsFromServer(ref) : await getDocs(ref);
          const data = snap.docs.map((d) => normalizeMangaEntry(d.id, d.data()));
          mangaEntriesCache.set(id, { data, expireAt: Date.now() + 3 * 60 * 1000 });
          clientCache.set(`client_manga_entries_${id}`, data, 60 * 60 * 1000);
          return data;
        } catch (error) {
          handleFirestoreError(error, OperationType.LIST, `users/${id}/mangaEntries`);
          return readLocalJson<MangaEntry[]>(`local_manga_entries_${id}`, []).map((e) =>
            normalizeMangaEntry(e.id, e),
          );
        } finally {
          mangaEntriesPromises.delete(id);
        }
      })();
      if (!forceRefresh) mangaEntriesPromises.set(id, activePromise);
    }
    return activePromise;
  },

  getMangaAppRating: async (mangaId: string): Promise<{ score: number; count: number }> => {
    const now = Date.now();
    const cached = mangaRatingCache.get(mangaId);
    if (cached && now < cached.expireAt) return cached.data;

    let activePromise = mangaRatingPromises.get(mangaId);
    if (!activePromise) {
      activePromise = (async () => {
        try {
          const { collectionGroup, query, where } = await import('firebase/firestore');
          const q = query(collectionGroup(db, 'mangaEntries'), where('mangaId', '==', mangaId));
          const snap = await getDocs(q);
          let total = 0;
          let count = 0;
          snap.forEach((d) => {
            const val = d.data();
            if (typeof val.score === 'number' && val.score > 0) {
              total += val.score;
              count++;
            }
          });
          const data = {
            score: count > 0 ? Number((total / count).toFixed(2)) : 0,
            count,
          };
          mangaRatingCache.set(mangaId, { data, expireAt: Date.now() + 5 * 60 * 1000 });
          return data;
        } catch {
          return { score: 0, count: 0 };
        } finally {
          mangaRatingPromises.delete(mangaId);
        }
      })();
      mangaRatingPromises.set(mangaId, activePromise);
    }
    return activePromise;
  },

  saveMangaEntry: async (
    userId: string,
    mangaId: string,
    data: {
      title: string;
      posterUrl: string;
      mediaFormat?: string;
      countryOfOrigin?: string;
      releaseYear?: string;
      status?: MainListStatus;
      customLists?: Record<string, boolean>;
      score?: number;
      isFavorite?: boolean;
      readChapters?: number[];
      lastReadChapter?: number;
      lastReadPage?: number;
      chaptersCount?: number;
      progress?: number;
    },
  ): Promise<void> => {
    if (!isAuthenticatedOwner(userId)) {
      const entries = readLocalJson<MangaEntry[]>(`local_manga_entries_${userId}`, []);
      const idx = entries.findIndex((e) => e.id === mangaId);
      const existing = idx >= 0 ? entries[idx] : null;
      const nowIso = new Date().toISOString();
      const updatedEntry: MangaEntry = {
        id: mangaId,
        mangaId,
        title: data.title || existing?.title || `عمل #${mangaId}`,
        posterUrl: data.posterUrl || existing?.posterUrl || '',
        mediaFormat: data.mediaFormat || existing?.mediaFormat || 'manga',
        countryOfOrigin: data.countryOfOrigin || existing?.countryOfOrigin || 'JP',
        releaseYear: data.releaseYear || existing?.releaseYear || '',
        status: data.status !== undefined ? data.status : existing?.status || 'none',
        customLists:
          data.customLists !== undefined ? data.customLists : existing?.customLists || {},
        score: data.score !== undefined ? data.score : existing?.score,
        isFavorite: data.isFavorite !== undefined ? data.isFavorite : existing?.isFavorite,
        readChapters:
          data.readChapters !== undefined ? data.readChapters : existing?.readChapters,
        lastReadChapter:
          data.lastReadChapter !== undefined
            ? data.lastReadChapter
            : existing?.lastReadChapter,
        lastReadPage:
          data.lastReadPage !== undefined ? data.lastReadPage : existing?.lastReadPage,
        chaptersCount:
          data.chaptersCount !== undefined ? data.chaptersCount : existing?.chaptersCount,
        progress: data.progress !== undefined ? data.progress : existing?.progress,
        addedAt: existing?.addedAt || nowIso,
        updatedAt: nowIso,
      };
      if (idx >= 0) entries[idx] = updatedEntry;
      else entries.push(updatedEntry);
      writeLocalJson(`local_manga_entries_${userId}`, entries);
      mangaListService.invalidateUserCache(userId, mangaId);
      return;
    }

    try {
      const ref = doc(db, 'users', userId, 'mangaEntries', mangaId);
      const snap = await getDoc(ref);
      const existingData = snap.exists() ? snap.data() : null;

      const prevStatus = existingData ? existingData.status || 'none' : 'none';
      const nextStatus: MainListStatus =
        data.status !== undefined
          ? data.status
          : (existingData?.status as MainListStatus) || 'none';

      const payload: any = {
        mangaId,
        title: data.title || existingData?.title || `عمل #${mangaId}`,
        posterUrl: data.posterUrl || existingData?.posterUrl || '',
        updatedAt: serverTimestamp(),
      };

      if (data.mediaFormat) payload.mediaFormat = data.mediaFormat;
      if (data.countryOfOrigin) payload.countryOfOrigin = data.countryOfOrigin;
      if (data.releaseYear) payload.releaseYear = String(data.releaseYear);
      if (data.status !== undefined) payload.status = data.status;
      if (data.customLists !== undefined) payload.customLists = data.customLists;
      if (data.score !== undefined) payload.score = data.score;
      if (data.isFavorite !== undefined) payload.isFavorite = data.isFavorite;
      if (data.readChapters !== undefined) payload.readChapters = data.readChapters;
      if (data.lastReadChapter !== undefined) payload.lastReadChapter = data.lastReadChapter;
      if (data.lastReadPage !== undefined) payload.lastReadPage = data.lastReadPage;

      const chCount =
        typeof data.chaptersCount === 'number'
          ? data.chaptersCount
          : Number(existingData?.chaptersCount || 0);
      if (chCount > 0) payload.chaptersCount = chCount;

      if (data.progress !== undefined) {
        payload.progress = data.progress;
      } else if (data.readChapters !== undefined) {
        payload.progress = data.readChapters.length;
      } else if (existingData?.readChapters) {
        payload.progress = existingData.readChapters.length;
      } else {
        payload.progress = 0;
      }

      if (!existingData) {
        payload.addedAt = serverTimestamp();
      }

      await setDoc(ref, payload, { merge: true });

      const userProfileUpdates: Record<string, any> = {};
      if (prevStatus !== 'completed' && nextStatus === 'completed') {
        userProfileUpdates.completedMangaCount = increment(1);
      } else if (prevStatus === 'completed' && nextStatus !== 'completed') {
        userProfileUpdates.completedMangaCount = increment(-1);
      }
      if (Object.keys(userProfileUpdates).length > 0) {
        updateDoc(doc(db, 'users', userId), userProfileUpdates).catch(() => {});
      }

      mangaListService.invalidateUserCache(userId, mangaId);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${userId}/mangaEntries/${mangaId}`);
      throw error;
    }
  },

  removeMangaEntry: async (userId: string, mangaId: string): Promise<void> => {
    if (!isAuthenticatedOwner(userId)) {
      const entries = readLocalJson<MangaEntry[]>(`local_manga_entries_${userId}`, []);
      writeLocalJson(
        `local_manga_entries_${userId}`,
        entries.filter((e) => e.id !== mangaId),
      );
      mangaListService.invalidateUserCache(userId, mangaId);
      return;
    }

    try {
      const ref = doc(db, 'users', userId, 'mangaEntries', mangaId);
      const snap = await getDoc(ref);
      const existingData = snap.exists() ? snap.data() : null;
      await deleteDoc(ref);

      if (existingData?.status === 'completed') {
        updateDoc(doc(db, 'users', userId), {
          completedMangaCount: increment(-1),
        }).catch(() => {});
      }
      mangaListService.invalidateUserCache(userId, mangaId);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `users/${userId}/mangaEntries/${mangaId}`);
      throw error;
    }
  },
};
