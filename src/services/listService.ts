import { db, auth } from '../firebase';
import { collection, doc, getDocs, getDocsFromServer, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp, increment } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../firebaseUtils';
import { clientCache } from '../utils/clientCache';

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

export interface CustomList {
  id: string;
  name: string;
  color?: string;
  createdAt: any;
}

export interface ListColorOption {
  id: string;
  labelAr: string;
  hex: string;
  dotClass: string;
  activeClass: string;
  inactiveClass: string;
}

export const CUSTOM_LIST_COLORS: ListColorOption[] = [
  {
    id: 'indigo',
    labelAr: 'نيلي',
    hex: '#6366f1',
    dotClass: 'bg-indigo-400',
    activeClass: 'bg-indigo-600 text-white border-indigo-400 shadow-lg shadow-indigo-600/25',
    inactiveClass: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30 hover:bg-indigo-500/20',
  },
  {
    id: 'rose',
    labelAr: 'وردي',
    hex: '#f43f5e',
    dotClass: 'bg-rose-400',
    activeClass: 'bg-rose-600 text-white border-rose-400 shadow-lg shadow-rose-600/25',
    inactiveClass: 'bg-rose-500/10 text-rose-300 border-rose-500/30 hover:bg-rose-500/20',
  },
  {
    id: 'emerald',
    labelAr: 'أخضر',
    hex: '#10b981',
    dotClass: 'bg-emerald-400',
    activeClass: 'bg-emerald-600 text-white border-emerald-400 shadow-lg shadow-emerald-600/25',
    inactiveClass: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20',
  },
  {
    id: 'amber',
    labelAr: 'ذهبي',
    hex: '#f59e0b',
    dotClass: 'bg-amber-400',
    activeClass: 'bg-amber-500 text-black border-amber-300 shadow-lg shadow-amber-500/25',
    inactiveClass: 'bg-amber-500/10 text-amber-300 border-amber-500/30 hover:bg-amber-500/20',
  },
  {
    id: 'cyan',
    labelAr: 'سماوي',
    hex: '#06b6d4',
    dotClass: 'bg-cyan-400',
    activeClass: 'bg-cyan-600 text-white border-cyan-400 shadow-lg shadow-cyan-600/25',
    inactiveClass: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30 hover:bg-cyan-500/20',
  },
  {
    id: 'fuchsia',
    labelAr: 'أرجواني',
    hex: '#d946ef',
    dotClass: 'bg-fuchsia-400',
    activeClass: 'bg-fuchsia-600 text-white border-fuchsia-400 shadow-lg shadow-fuchsia-600/25',
    inactiveClass: 'bg-fuchsia-500/10 text-fuchsia-300 border-fuchsia-500/30 hover:bg-fuchsia-500/20',
  },
  {
    id: 'orange',
    labelAr: 'برتقالي',
    hex: '#f97316',
    dotClass: 'bg-orange-400',
    activeClass: 'bg-orange-600 text-white border-orange-400 shadow-lg shadow-orange-600/25',
    inactiveClass: 'bg-orange-500/10 text-orange-300 border-orange-500/30 hover:bg-orange-500/20',
  },
  {
    id: 'blue',
    labelAr: 'أزرق',
    hex: '#3b82f6',
    dotClass: 'bg-blue-400',
    activeClass: 'bg-blue-600 text-white border-blue-400 shadow-lg shadow-blue-600/25',
    inactiveClass: 'bg-blue-500/10 text-blue-300 border-blue-500/30 hover:bg-blue-500/20',
  },
];

export function getCustomListColorOption(colorId?: string): ListColorOption {
  return CUSTOM_LIST_COLORS.find((c) => c.id === colorId) || CUSTOM_LIST_COLORS[0];
}

export type MainListStatus = 'watching' | 'completed' | 'plan_to_watch' | 'on_hold' | 'dropped' | 'none';

export interface AnimeEntry {
  id: string; // Document ID is animeId
  animeId?: string;
  title: string;
  posterUrl: string;
  releaseYear: string;
  status: MainListStatus;
  customLists: Record<string, boolean>;
  score?: number;
  isFavorite?: boolean;
  watchedEpisodes?: number[];
  addedAt: any;
  updatedAt: any;
  episodesCount?: number;
  progress?: number;
}

export function getAnimeRewards(episodesCount: number) {
  const eps = episodesCount > 0 ? episodesCount : 12;
  let xp = 250;
  let coins = 50;

  if (eps <= 1) {
    xp = 80;
    coins = 15;
  } else if (eps <= 5) {
    xp = 130;
    coins = 25;
  } else if (eps <= 13) {
    xp = 250;
    coins = 50;
  } else if (eps <= 26) {
    xp = 450;
    coins = 90;
  } else {
    const extraEps = eps - 26;
    xp = 450 + extraEps * 10;
    coins = 90 + Math.floor(extraEps * 1.5);
    
    if (xp > 5000) xp = 5000;
    if (coins > 1000) coins = 1000;
  }

  return { xp, coins };
}

// Memory caches for scaling and high-performance deduplication (9999+ users ready)
const customListsCache = new Map<string, { data: CustomList[]; expireAt: number }>();
const animeEntriesCache = new Map<string, { data: AnimeEntry[]; expireAt: number }>();
const appRatingCache = new Map<string, { data: { score: number; count: number }; expireAt: number }>();
const statsReconcileThrottle = new Map<string, number>();

// In-flight promise caches to completely deduplicate parallel reads
const customListsPromises = new Map<string, Promise<CustomList[]>>();
const animeEntriesPromises = new Map<string, Promise<AnimeEntry[]>>();
const appRatingPromises = new Map<string, Promise<{ score: number; count: number }>>();

export const ACTIVE_LIST_STATUSES: MainListStatus[] = [
  'watching',
  'completed',
  'plan_to_watch',
  'on_hold',
  'dropped',
];

export function isActiveLibraryEntry(entry?: Partial<AnimeEntry> | null): boolean {
  if (!entry) return false;
  if (entry.status && ACTIVE_LIST_STATUSES.includes(entry.status)) return true;
  if (entry.customLists && Object.values(entry.customLists).some(Boolean)) return true;
  return false;
}

export function computeLibraryStats(entries: AnimeEntry[], userData?: any) {
  const statusCounts = {
    watching: 0,
    completed: 0,
    plan_to_watch: 0,
    on_hold: 0,
    dropped: 0,
  };
  let customOnlyCount = 0;
  let sumEpisodes = 0;
  const scores: number[] = [];
  const genreCounts: Record<string, number> = {};

  entries.forEach((e: any) => {
    const status = e.status as MainListStatus;
    const hasMainStatus = Boolean(status && status in statusCounts);
    const hasCustomList = Boolean(e.customLists && Object.values(e.customLists).some(Boolean));

    if (hasMainStatus) {
      statusCounts[status as keyof typeof statusCounts] += 1;
    } else if (hasCustomList) {
      customOnlyCount += 1;
    }

    if (status === 'completed') {
      const eps = Number(e.episodesCount) || Number(e.progress) || (Array.isArray(e.watchedEpisodes) ? e.watchedEpisodes.length : 0) || 12;
      sumEpisodes += eps;
    } else if (Array.isArray(e.watchedEpisodes) && e.watchedEpisodes.length > 0) {
      sumEpisodes += e.watchedEpisodes.length;
    } else if (typeof e.progress === 'number' && e.progress > 0) {
      sumEpisodes += e.progress;
    }

    if (typeof e.score === 'number' && e.score > 0) {
      scores.push(e.score);
    }

    let gs: string[] = [];
    if (Array.isArray(e.genres)) gs = e.genres;
    else if (typeof e.genres === 'string') gs = e.genres.split(',').map((s: string) => s.trim());
    else if (e.animeDetails?.genres) {
      gs = Array.isArray(e.animeDetails.genres)
        ? e.animeDetails.genres
        : String(e.animeDetails.genres).split(',').map((s: string) => s.trim());
    }
    gs.forEach((g) => {
      if (g) genreCounts[g] = (genreCounts[g] || 0) + 1;
    });
  });

  const mainListCount =
    statusCounts.watching +
    statusCounts.completed +
    statusCounts.plan_to_watch +
    statusCounts.on_hold +
    statusCounts.dropped;

  const totalListCount = mainListCount + customOnlyCount;
  const avgScore = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : '0.0';
  const totalEpisodesWatched = Math.max(sumEpisodes, Number(userData?.totalEpisodesWatched || 0));
  const watchDays = ((totalEpisodesWatched * 24) / 1440).toFixed(1);

  const favoriteGenres = Object.entries(genreCounts)
    .map(([name, count]) => ({
      name,
      count,
      percent: Math.round((count / Math.max(1, totalListCount)) * 100),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);

  return {
    listCount: statusCounts,
    customOnlyCount,
    mainListCount,
    totalListCount,
    completedAnimeCount: statusCounts.completed,
    sumEpisodesFromEntries: sumEpisodes,
    totalEpisodesWatched,
    avgScore,
    watchDays,
    favoriteGenres,
  };
}

function normalizeEntry(docId: string, raw: any): AnimeEntry {
  const watchedArr = Array.isArray(raw?.watchedEpisodes)
    ? Array.from(new Set<number>(raw.watchedEpisodes.map((n: any) => Number(n)).filter((n: number) => !isNaN(n) && n > 0))).sort((a, b) => a - b)
    : [];
  const rawStatus = String(raw?.status || 'none') as MainListStatus;
  const normalizedStatus: MainListStatus = ACTIVE_LIST_STATUSES.includes(rawStatus) ? rawStatus : 'none';
  const episodesCount = typeof raw?.episodesCount === 'number' ? raw.episodesCount : (parseInt(String(raw?.episodesCount || '0'), 10) || 0);
  const progress =
    typeof raw?.progress === 'number' && raw.progress > 0
      ? raw.progress
      : normalizedStatus === 'completed' && episodesCount > 0
      ? episodesCount
      : watchedArr.length;

  return {
    ...raw,
    id: docId,
    animeId: raw?.animeId || docId,
    title: raw?.title && raw.title !== 'Unknown Title' ? raw.title : (raw?.animeTitle || `أنمي #${docId}`),
    posterUrl: raw?.posterUrl || '',
    releaseYear: raw?.releaseYear ? String(raw.releaseYear) : '',
    status: normalizedStatus,
    customLists: raw?.customLists && typeof raw.customLists === 'object' ? raw.customLists : {},
    watchedEpisodes: watchedArr,
    episodesCount: episodesCount > 0 ? episodesCount : undefined,
    progress,
    addedAt: raw?.addedAt || raw?.updatedAt || null,
    updatedAt: raw?.updatedAt || raw?.addedAt || null,
  } as AnimeEntry;
}

function notifyLibraryUpdated(userId: string, animeId?: string) {
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent('otaku:library-updated', { detail: { userId, animeId } }));
    } catch {}
  }
}

export const listService = {
  getCustomLists: async (id: string): Promise<CustomList[]> => {
    if (!isAuthenticatedOwner(id)) {
      return readLocalJson<CustomList[]>(`local_custom_lists_${id}`, []);
    }

    const now = Date.now();
    const cached = customListsCache.get(id);
    if (cached && now < cached.expireAt) {
      return cached.data;
    }

    let activePromise = customListsPromises.get(id);
    if (!activePromise) {
      activePromise = (async () => {
        try {
          const q = collection(db, 'users', id, 'customLists');
          const snapshot = await getDocs(q);
          const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as CustomList));
          customListsCache.set(id, { data, expireAt: Date.now() + 15 * 1000 });
          clientCache.set(`client_mylists_custom_${id}`, data, 60 * 60 * 1000);
          return data;
        } catch (e) {
          handleFirestoreError(e, OperationType.LIST, `users/${id}/customLists`);
          throw e;
        } finally {
          customListsPromises.delete(id);
        }
      })();
      customListsPromises.set(id, activePromise);
    }
    return activePromise;
  },

  createCustomList: async (id: string, name: string, color?: string): Promise<string> => {
    const cleanName = String(name || '').trim().slice(0, 100);
    const cleanColor = color ? String(color).trim().slice(0, 32) : CUSTOM_LIST_COLORS[0].id;
    if (!isAuthenticatedOwner(id)) {
      const listId = 'list_' + Date.now();
      const lists = readLocalJson<CustomList[]>(`local_custom_lists_${id}`, []);
      lists.push({ id: listId, name: cleanName, color: cleanColor, createdAt: new Date().toISOString() });
      writeLocalJson(`local_custom_lists_${id}`, lists);
      customListsCache.delete(id);
      notifyLibraryUpdated(id);
      return listId;
    }

    try {
      const listId = 'list_' + Date.now();
      const ref = doc(db, 'users', id, 'customLists', listId);
      await setDoc(ref, {
        name: cleanName,
        color: cleanColor,
        createdAt: serverTimestamp(),
      });
      customListsCache.delete(id);
      notifyLibraryUpdated(id);
      return listId;
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, `users/${id}/customLists`);
      throw e;
    }
  },

  updateCustomList: async (id: string, listId: string, name: string, color?: string): Promise<void> => {
    const cleanName = String(name || '').trim().slice(0, 100);
    if (!cleanName) return;
    const cleanColor = color ? String(color).trim().slice(0, 32) : CUSTOM_LIST_COLORS[0].id;

    if (!isAuthenticatedOwner(id)) {
      const lists = readLocalJson<CustomList[]>(`local_custom_lists_${id}`, []);
      const next = lists.map((l) => (l.id === listId ? { ...l, name: cleanName, color: cleanColor } : l));
      writeLocalJson(`local_custom_lists_${id}`, next);
      customListsCache.delete(id);
      notifyLibraryUpdated(id);
      return;
    }

    try {
      await updateDoc(doc(db, 'users', id, 'customLists', listId), {
        name: cleanName,
        color: cleanColor,
      });
      customListsCache.delete(id);
      notifyLibraryUpdated(id);
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `users/${id}/customLists/${listId}`);
      throw e;
    }
  },

  deleteCustomList: async (id: string, listId: string): Promise<void> => {
    if (!isAuthenticatedOwner(id)) {
      const lists = readLocalJson<CustomList[]>(`local_custom_lists_${id}`, []);
      writeLocalJson(`local_custom_lists_${id}`, lists.filter(l => l.id !== listId));
      customListsCache.delete(id);
      notifyLibraryUpdated(id);
      return;
    }

    try {
      await deleteDoc(doc(db, 'users', id, 'customLists', listId));
      customListsCache.delete(id);
      notifyLibraryUpdated(id);
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `users/${id}/customLists/${listId}`);
      throw e;
    }
  },

  getAnimeEntries: async (id: string): Promise<AnimeEntry[]> => {
    if (!isAuthenticatedOwner(id)) {
      const local = readLocalJson<AnimeEntry[]>(`local_anime_entries_${id}`, []);
      return local.map((item) => normalizeEntry(item.id, item));
    }

    const now = Date.now();
    const cached = animeEntriesCache.get(id);
    if (cached && now < cached.expireAt) {
      return cached.data;
    }

    let activePromise = animeEntriesPromises.get(id);
    if (!activePromise) {
      activePromise = (async () => {
        try {
          const q = collection(db, 'users', id, 'animeEntries');
          const snapshot = await getDocs(q);
          const data = snapshot.docs.map(d => normalizeEntry(d.id, d.data()));
          animeEntriesCache.set(id, { data, expireAt: Date.now() + 10 * 1000 });
          clientCache.set(`client_mylists_entries_${id}`, data, 60 * 60 * 1000);
          return data;
        } catch (e) {
          handleFirestoreError(e, OperationType.LIST, `users/${id}/animeEntries`);
          throw e;
        } finally {
          animeEntriesPromises.delete(id);
        }
      })();
      animeEntriesPromises.set(id, activePromise);
    }
    return activePromise;
  },

  reconcileUserStats: async (userId: string, entries?: AnimeEntry[], currentUserData?: any, force = false): Promise<void> => {
    if (!isAuthenticatedOwner(userId)) return;
    const now = Date.now();
    const lastRun = statsReconcileThrottle.get(userId) || 0;
    if (!force && now - lastRun < 15000) return;
    statsReconcileThrottle.set(userId, now);

    try {
      const resolvedEntries = entries || await listService.getAnimeEntries(userId);
      const userRef = doc(db, 'users', userId);
      const existingData = currentUserData || (await getDoc(userRef)).data();
      if (!existingData) return;

      const computed = computeLibraryStats(resolvedEntries, existingData);
      const updates: Record<string, any> = {};

      if ((existingData.listCount ?? -1) !== computed.totalListCount) {
        updates.listCount = computed.totalListCount;
      }
      if ((existingData.completedAnimeCount ?? -1) !== computed.completedAnimeCount) {
        updates.completedAnimeCount = computed.completedAnimeCount;
      }
      if ((existingData.totalEpisodesWatched ?? 0) < computed.sumEpisodesFromEntries) {
        updates.totalEpisodesWatched = computed.sumEpisodesFromEntries;
      }

      if (Object.keys(updates).length > 0) {
        await updateDoc(userRef, updates);
      }
    } catch {}
  },

  getAnimeAppRating: async (animeId: string): Promise<{score: number, count: number}> => {
    const now = Date.now();
    const cached = appRatingCache.get(animeId);
    if (cached && now < cached.expireAt) {
      return cached.data;
    }

    let activePromise = appRatingPromises.get(animeId);
    if (!activePromise) {
      activePromise = (async () => {
        try {
          const { collectionGroup, query, where, getDocs } = await import('firebase/firestore');
          const q = query(collectionGroup(db, 'animeEntries'), where('animeId', '==', animeId));
          const snap = await getDocs(q);
          let total = 0;
          let count = 0;
          snap.forEach(d => {
            const val = d.data();
            if (typeof val.score === 'number' && val.score > 0) {
              total += val.score;
              count++;
            }
          });
          const data = {
            score: count > 0 ? Number((total / count).toFixed(2)) : 0,
            count
          };
          appRatingCache.set(animeId, { data, expireAt: Date.now() + 5 * 60 * 1000 });
          return data;
        } catch (error) {
          console.error("Error getting app rating:", error);
          return { score: 0, count: 0 };
        } finally {
          appRatingPromises.delete(animeId);
        }
      })();
      appRatingPromises.set(animeId, activePromise);
    }
    return activePromise;
  },

  saveAnimeEntry: async (
    id: string, 
    animeId: string, 
    data: { 
      title: string, 
      posterUrl: string, 
      releaseYear: string, 
      status?: MainListStatus, 
      customLists?: Record<string, boolean>, 
      score?: number, 
      isFavorite?: boolean, 
      watchedEpisodes?: number[],
      episodesCount?: number,
      progress?: number,
      extraXp?: number,
      extraCoins?: number
    }
  ): Promise<void> => {
    if (!isAuthenticatedOwner(id)) {
      const entries = readLocalJson<AnimeEntry[]>(`local_anime_entries_${id}`, []);
      const idx = entries.findIndex(e => e.id === animeId);
      const existing = idx >= 0 ? entries[idx] : null;
      const nowIso = new Date().toISOString();
      const updatedEntry: AnimeEntry = {
        id: animeId,
        title: data.title || existing?.title || `أنمي #${animeId}`,
        posterUrl: data.posterUrl || existing?.posterUrl || '',
        releaseYear: data.releaseYear || existing?.releaseYear || '',
        status: data.status !== undefined ? data.status : (existing?.status || 'none'),
        customLists: data.customLists !== undefined ? data.customLists : (existing?.customLists || {}),
        score: data.score !== undefined ? data.score : existing?.score,
        isFavorite: data.isFavorite !== undefined ? data.isFavorite : existing?.isFavorite,
        watchedEpisodes: data.watchedEpisodes !== undefined ? data.watchedEpisodes : existing?.watchedEpisodes,
        episodesCount: data.episodesCount !== undefined ? data.episodesCount : existing?.episodesCount,
        progress: data.progress !== undefined ? data.progress : existing?.progress,
        addedAt: existing?.addedAt || nowIso,
        updatedAt: nowIso
      };
      if (idx >= 0) {
        entries[idx] = updatedEntry;
      } else {
        entries.push(updatedEntry);
      }
      writeLocalJson(`local_anime_entries_${id}`, entries);
      animeEntriesCache.delete(id);
      clientCache.set(`client_mylists_entries_${id}`, entries, 60 * 60 * 1000);
      notifyLibraryUpdated(id, animeId);
      return;
    }

    try {
      const ref = doc(db, 'users', id, 'animeEntries', animeId);
      const snap = await getDoc(ref);
      const existingData = snap.exists() ? snap.data() : null;

      const prevActive = existingData ? isActiveLibraryEntry(existingData as any) : false;
      const prevStatus = existingData ? (existingData.status || 'none') : 'none';

      const nextStatus: MainListStatus =
        data.status !== undefined ? data.status : ((existingData?.status as MainListStatus) || 'none');
      const nextCustomLists =
        data.customLists !== undefined ? data.customLists : (existingData?.customLists || {});
      const nextActive = isActiveLibraryEntry({ status: nextStatus, customLists: nextCustomLists });

      const userProfileUpdates: Record<string, any> = {};

      const payload: any = {
        animeId: animeId,
        title: data.title || existingData?.title || `أنمي #${animeId}`,
        posterUrl: data.posterUrl || existingData?.posterUrl || '',
        updatedAt: serverTimestamp(),
      };
      if (data.releaseYear) payload.releaseYear = data.releaseYear;
      if (data.status !== undefined) payload.status = data.status;
      if (data.customLists !== undefined) payload.customLists = data.customLists;
      if (data.score !== undefined) payload.score = data.score;
      if (data.isFavorite !== undefined) payload.isFavorite = data.isFavorite;
      if (data.watchedEpisodes !== undefined) payload.watchedEpisodes = data.watchedEpisodes;

      const rawEpisodesCount = data.episodesCount !== undefined
        ? data.episodesCount
        : (existingData?.episodesCount || 0);

      let finalEpisodesCount = 0;
      if (typeof rawEpisodesCount === 'number') {
        finalEpisodesCount = rawEpisodesCount;
      } else if (typeof rawEpisodesCount === 'string') {
        finalEpisodesCount = parseInt(rawEpisodesCount, 10) || 0;
      }

      if (finalEpisodesCount > 0) {
        payload.episodesCount = finalEpisodesCount;
      }

      if (data.progress !== undefined) {
        payload.progress = typeof data.progress === 'number'
          ? data.progress
          : (parseInt(String(data.progress), 10) || 0);
      } else if (nextStatus === 'completed') {
        payload.progress = finalEpisodesCount > 0 ? finalEpisodesCount : 12;
      } else if (data.watchedEpisodes !== undefined) {
        payload.progress = data.watchedEpisodes.length;
      } else if (existingData?.watchedEpisodes !== undefined) {
        payload.progress = Array.isArray(existingData.watchedEpisodes) ? existingData.watchedEpisodes.length : 0;
      }

      let newlyCompleted = false;

      if (!snap.exists()) {
        payload.addedAt = serverTimestamp();
        payload.status = payload.status || 'none';
        if (payload.status === 'completed') {
          newlyCompleted = true;
          payload.completedXpClaimed = true;
        }
        await setDoc(ref, payload);
      } else {
        const alreadyClaimed = existingData?.completedXpClaimed;
        if (nextStatus === 'completed' && prevStatus !== 'completed' && !alreadyClaimed) {
          newlyCompleted = true;
          payload.completedXpClaimed = true;
        }
        await updateDoc(ref, payload);
      }

      // Sync user counters accurately
      if (!prevActive && nextActive) {
        userProfileUpdates.listCount = increment(1);
      } else if (prevActive && !nextActive) {
        userProfileUpdates.listCount = increment(-1);
      }

      if (prevStatus !== 'completed' && nextStatus === 'completed') {
        userProfileUpdates.completedAnimeCount = increment(1);
      } else if (prevStatus === 'completed' && nextStatus !== 'completed') {
        userProfileUpdates.completedAnimeCount = increment(-1);
      }

      animeEntriesCache.delete(id);
      if (data.score !== undefined) {
        appRatingCache.delete(animeId);
      }

      let customXpGranted = 0;
      let customCoinsGranted = 0;

      if (newlyCompleted) {
        const rewards = getAnimeRewards(finalEpisodesCount);
        customXpGranted = rewards.xp;
        customCoinsGranted = rewards.coins;
      }

      const finalAwardAmount = (data.extraXp || 0) + customXpGranted + (!snap.exists() && nextActive ? 20 : 0);
      const finalCoinsAmount = (data.extraCoins || 0) + customCoinsGranted;

      if (finalAwardAmount > 0) {
        const { awardXP } = await import('./gamificationService');
        const coinsParam = finalCoinsAmount > 0 ? finalCoinsAmount : true;
        await awardXP(id, finalAwardAmount, coinsParam, userProfileUpdates);
      } else if (Object.keys(userProfileUpdates).length > 0) {
        try {
          const userRef = doc(db, 'users', id);
          await updateDoc(userRef, userProfileUpdates);
        } catch (_) {}
      }

      // Refresh & reconcile cache in background
      listService.getAnimeEntries(id).then((fresh) => {
        clientCache.set(`client_mylists_entries_${id}`, fresh, 60 * 60 * 1000);
        void listService.reconcileUserStats(id, fresh, undefined, true);
      }).catch(() => {});

      notifyLibraryUpdated(id, animeId);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `users/${id}/animeEntries/${animeId}`);
      throw e;
    }
  },

  removeAnimeEntry: async (id: string, animeId: string): Promise<void> => {
    if (!isAuthenticatedOwner(id)) {
      const entries = readLocalJson<AnimeEntry[]>(`local_anime_entries_${id}`, []);
      const filtered = entries.filter(e => e.id !== animeId);
      writeLocalJson(`local_anime_entries_${id}`, filtered);
      animeEntriesCache.delete(id);
      clientCache.set(`client_mylists_entries_${id}`, filtered, 60 * 60 * 1000);
      notifyLibraryUpdated(id, animeId);
      return;
    }

    try {
      await deleteDoc(doc(db, 'users', id, 'animeEntries', animeId));
      animeEntriesCache.delete(id);
      appRatingCache.delete(animeId);

      // Recalculate exact stats cleanly from remaining entries
      try {
        const remaining = await listService.getAnimeEntries(id);
        clientCache.set(`client_mylists_entries_${id}`, remaining, 60 * 60 * 1000);
        await listService.reconcileUserStats(id, remaining, undefined, true);
      } catch (_) {}

      notifyLibraryUpdated(id, animeId);
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `users/${id}/animeEntries/${animeId}`);
      throw e;
    }
  },

  invalidateUserCache: (id: string, animeId?: string) => {
    animeEntriesCache.delete(id);
    customListsCache.delete(id);
    if (animeId) {
      appRatingCache.delete(animeId);
    }
  },

  clearInMemoryCaches: () => {
    customListsCache.clear();
    animeEntriesCache.clear();
    customListsPromises.clear();
    animeEntriesPromises.clear();
    statsReconcileThrottle.clear();
  },

  migrateGuestDataToCloud: async (userId: string): Promise<{ listsMigrated: number; entriesMigrated: number }> => {
    if (!isAuthenticatedOwner(userId) || typeof localStorage === 'undefined') {
      return { listsMigrated: 0, entriesMigrated: 0 };
    }

    let listsMigrated = 0;
    let entriesMigrated = 0;

    try {
      const keysToRemove: string[] = [];
      const customListKeys: string[] = [];
      const entryKeys: string[] = [];

      const isAllowedCustomKey = (k: string) =>
        k === 'local_custom_lists_guest' ||
        k.startsWith('local_custom_lists_otaku_guest_') ||
        k === `local_custom_lists_${userId}`;
      const isAllowedEntryKey = (k: string) =>
        k === 'local_anime_entries_guest' ||
        k.startsWith('local_anime_entries_otaku_guest_') ||
        k === `local_anime_entries_${userId}`;

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;
        if (isAllowedCustomKey(key)) customListKeys.push(key);
        else if (isAllowedEntryKey(key)) entryKeys.push(key);
      }

      if (customListKeys.length === 0 && entryKeys.length === 0) {
        return { listsMigrated: 0, entriesMigrated: 0 };
      }

      const [remoteListsSnap, remoteEntriesSnap] = await Promise.all([
        getDocs(collection(db, 'users', userId, 'customLists')).catch(() => null),
        getDocs(collection(db, 'users', userId, 'animeEntries')).catch(() => null),
      ]);

      const existingListIds = new Set<string>(remoteListsSnap ? remoteListsSnap.docs.map(d => d.id) : []);
      const existingEntriesMap = new Map<string, any>();
      if (remoteEntriesSnap) {
        remoteEntriesSnap.docs.forEach(d => existingEntriesMap.set(d.id, d.data()));
      }

      for (const key of customListKeys) {
        const guestLists = readLocalJson<CustomList[]>(key, []);
        for (const list of guestLists) {
          if (!list?.id || !list?.name || existingListIds.has(list.id)) continue;
          try {
            await setDoc(doc(db, 'users', userId, 'customLists', list.id), {
              name: String(list.name).slice(0, 100),
              ...(list.color ? { color: String(list.color).slice(0, 32) } : {}),
              createdAt: serverTimestamp(),
            });
            existingListIds.add(list.id);
            listsMigrated++;
          } catch {}
        }
        keysToRemove.push(key);
      }

      for (const key of entryKeys) {
        const guestEntries = readLocalJson<AnimeEntry[]>(key, []);
        for (const entry of guestEntries) {
          const animeId = entry?.id;
          if (!animeId) continue;
          try {
            const existingRemote = existingEntriesMap.get(animeId);
            if (!existingRemote) {
              await setDoc(doc(db, 'users', userId, 'animeEntries', animeId), {
                animeId,
                title: entry.title || `أنمي #${animeId}`,
                posterUrl: entry.posterUrl || '',
                releaseYear: entry.releaseYear || '',
                status: entry.status || 'none',
                customLists: entry.customLists || {},
                ...(typeof entry.score === 'number' ? { score: entry.score } : {}),
                ...(typeof entry.isFavorite === 'boolean' ? { isFavorite: entry.isFavorite } : {}),
                ...(Array.isArray(entry.watchedEpisodes) ? { watchedEpisodes: entry.watchedEpisodes } : {}),
                ...(typeof entry.episodesCount === 'number' ? { episodesCount: entry.episodesCount } : {}),
                ...(typeof entry.progress === 'number' ? { progress: entry.progress } : {}),
                addedAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              });
              entriesMigrated++;
            } else {
              const mergedWatched = Array.from(
                new Set([
                  ...(Array.isArray(existingRemote.watchedEpisodes) ? existingRemote.watchedEpisodes : []),
                  ...(Array.isArray(entry.watchedEpisodes) ? entry.watchedEpisodes : []),
                ])
              ).sort((a, b) => Number(a) - Number(b));
              const mergedCustomLists = {
                ...(entry.customLists || {}),
                ...(existingRemote.customLists || {}),
              };
              const hasExtraWatched =
                mergedWatched.length > (Array.isArray(existingRemote.watchedEpisodes) ? existingRemote.watchedEpisodes.length : 0);
              const hasExtraLists =
                Object.keys(mergedCustomLists).length > Object.keys(existingRemote.customLists || {}).length;

              if (hasExtraWatched || hasExtraLists) {
                await updateDoc(doc(db, 'users', userId, 'animeEntries', animeId), {
                  ...(hasExtraWatched ? { watchedEpisodes: mergedWatched, progress: mergedWatched.length } : {}),
                  ...(hasExtraLists ? { customLists: mergedCustomLists } : {}),
                  updatedAt: serverTimestamp(),
                });
                entriesMigrated++;
              }
            }
          } catch {}
        }
        keysToRemove.push(key);
      }

      keysToRemove.forEach((k) => {
        try {
          localStorage.removeItem(k);
        } catch {}
      });

      if (listsMigrated > 0 || entriesMigrated > 0) {
        customListsCache.delete(userId);
        animeEntriesCache.delete(userId);
      }
    } catch (e) {
      console.warn('Guest-to-cloud migration skipped:', e);
    }

    return { listsMigrated, entriesMigrated };
  },

  forceCloudSync: async (userId: string): Promise<{
    listsCount: number;
    entriesCount: number;
    migratedLists: number;
    migratedEntries: number;
    syncedAt: number;
  }> => {
    if (!isAuthenticatedOwner(userId)) {
      throw new Error('يجب تسجيل الدخول بحساب فعلي لتفعيل المزامنة السحابية.');
    }

    const migration = await listService.migrateGuestDataToCloud(userId);
    listService.invalidateUserCache(userId);

    const listsCol = collection(db, 'users', userId, 'customLists');
    const entriesCol = collection(db, 'users', userId, 'animeEntries');

    const [listsSnap, entriesSnap] = await Promise.all([
      getDocsFromServer(listsCol).catch(() => getDocs(listsCol)),
      getDocsFromServer(entriesCol).catch(() => getDocs(entriesCol)),
    ]);

    const fetchedCustom = listsSnap.docs.map(d => ({ id: d.id, ...d.data() } as CustomList));
    const fetchedEntries = entriesSnap.docs.map(d => normalizeEntry(d.id, d.data()));

    customListsCache.set(userId, { data: fetchedCustom, expireAt: Date.now() + 30 * 1000 });
    animeEntriesCache.set(userId, { data: fetchedEntries, expireAt: Date.now() + 30 * 1000 });
    clientCache.set(`client_mylists_custom_${userId}`, fetchedCustom, 60 * 60 * 1000);
    clientCache.set(`client_mylists_entries_${userId}`, fetchedEntries, 60 * 60 * 1000);

    const syncedAt = Date.now();
    await listService.reconcileUserStats(userId, fetchedEntries, undefined, true);
    try {
      await updateDoc(doc(db, 'users', userId), { lastSyncedAt: syncedAt });
    } catch {}

    notifyLibraryUpdated(userId);

    return {
      listsCount: fetchedCustom.length,
      entriesCount: fetchedEntries.length,
      migratedLists: migration.listsMigrated,
      migratedEntries: migration.entriesMigrated,
      syncedAt,
    };
  },

  boostUserToMaxLevel: async (id: string): Promise<void> => {
    try {
      const userRef = doc(db, 'users', id);
      await updateDoc(userRef, {
        xp: 500000,
        level: 100,
        coins: 150000,
        modPoints: 9999
      });
    } catch (e) {
      console.error("Error boosting user account:", e);
      throw e;
    }
  }
};

export interface LocalWatchHistoryItem {
  id: string;
  title: string;
  posterUrl: string;
  lastEpisode: string;
  progress: number;
  updatedAt: number;
}

function getWatchKeys(userId?: string | null) {
  const uid = userId || 'guest';
  return {
    uid,
    historyKey: `local_watch_history_${uid}`,
    clearedKey: `local_watch_history_cleared_at_${uid}`,
    dismissedKey: `local_watch_history_dismissed_${uid}`,
  };
}

export const watchHistoryService = {
  getClearedAt: (userId?: string | null, cloudPrivacy?: any): number => {
    const { clearedKey } = getWatchKeys(userId);
    let localVal = 0;
    try {
      if (typeof localStorage !== 'undefined') {
        localVal = Number(localStorage.getItem(clearedKey) || 0) || 0;
      }
    } catch {}
    const cloudVal = Number(cloudPrivacy?.watchHistoryClearedAt || 0) || 0;
    return Math.max(localVal, cloudVal);
  },

  getDismissedMap: (userId?: string | null, cloudPrivacy?: any): Record<string, number> => {
    const { dismissedKey } = getWatchKeys(userId);
    const localMap = readLocalJson<Record<string, number>>(dismissedKey, {});
    const cloudMap =
      cloudPrivacy?.watchDismissedMap && typeof cloudPrivacy.watchDismissedMap === 'object'
        ? (cloudPrivacy.watchDismissedMap as Record<string, number>)
        : {};
    const merged: Record<string, number> = {};
    const keys = new Set([...Object.keys(cloudMap), ...(localMap && typeof localMap === 'object' ? Object.keys(localMap) : [])]);
    keys.forEach((k) => {
      const v = Math.max(Number(cloudMap[k] || 0) || 0, Number(localMap?.[k] || 0) || 0);
      if (v > 0) merged[k] = v;
    });
    return merged;
  },

  filterItems: <T extends { id: string | number; updatedAt?: number }>(
    items: T[],
    userId?: string | null,
    cloudPrivacy?: any,
  ): T[] => {
    const clearedAt = watchHistoryService.getClearedAt(userId, cloudPrivacy);
    const dismissedMap = watchHistoryService.getDismissedMap(userId, cloudPrivacy);
    return (Array.isArray(items) ? items : []).filter((item) => {
      const ts = Number(item?.updatedAt) || 0;
      if (clearedAt > 0 && ts <= clearedAt) return false;
      const dTs = Number(dismissedMap[String(item?.id)] || 0);
      if (dTs > 0 && ts <= dTs) return false;
      return true;
    });
  },

  getLocalHistory: (userId?: string | null, cloudPrivacy?: any): LocalWatchHistoryItem[] => {
    const { historyKey } = getWatchKeys(userId);
    const clearedAt = watchHistoryService.getClearedAt(userId, cloudPrivacy);
    let localList: LocalWatchHistoryItem[] = [];
    try {
      if (typeof localStorage !== 'undefined') {
        let raw = localStorage.getItem(historyKey);
        if (!raw && !userId) {
          const legacy = localStorage.getItem('local_watch_history');
          if (legacy) {
            if (clearedAt === 0) {
              localStorage.setItem(historyKey, legacy);
              raw = legacy;
            }
            localStorage.removeItem('local_watch_history');
          }
        }
        const parsed = raw ? JSON.parse(raw) : [];
        if (Array.isArray(parsed)) localList = parsed;
      }
    } catch {}
    return watchHistoryService.filterItems(localList, userId, cloudPrivacy);
  },

  recordWatch: (userId: string | null | undefined, item: Omit<LocalWatchHistoryItem, 'updatedAt'> & { updatedAt?: number }) => {
    const { uid, historyKey, dismissedKey } = getWatchKeys(userId);
    const clearedAt = watchHistoryService.getClearedAt(userId);
    const nowTs = Math.max(Date.now(), clearedAt + 1000);

    try {
      if (typeof localStorage !== 'undefined') {
        const list = readLocalJson<LocalWatchHistoryItem[]>(historyKey, []);
        const filtered = (Array.isArray(list) ? list : []).filter(
          (entry) => String(entry.id) !== String(item.id),
        );
        const nextItem: LocalWatchHistoryItem = {
          id: String(item.id),
          title: item.title || 'أنمي',
          posterUrl: item.posterUrl || '',
          lastEpisode: String(item.lastEpisode || '1'),
          progress: Number(item.progress || 35),
          updatedAt: nowTs,
        };
        writeLocalJson(historyKey, [nextItem, ...filtered].slice(0, 20));

        const dismissed = readLocalJson<Record<string, number>>(dismissedKey, {});
        if (dismissed && Object.prototype.hasOwnProperty.call(dismissed, String(item.id))) {
          delete dismissed[String(item.id)];
          writeLocalJson(dismissedKey, dismissed);
          if (userId && isAuthenticatedOwner(uid)) {
            updateDoc(doc(db, 'users', uid), {
              'privacySettings.watchDismissedMap': dismissed,
            }).catch(() => {});
          }
        }
      }
    } catch {}
  },

  removeItem: (userId: string | null | undefined, itemId: string | number, itemUpdatedAt?: number, cloudPrivacy?: any) => {
    const { uid, historyKey, dismissedKey } = getWatchKeys(userId);
    const dismissTs = Math.max(Date.now(), Number(itemUpdatedAt) || 0) + 1000;
    const idStr = String(itemId);

    const removeFromKey = (hKey: string, dKey: string) => {
      const current = readLocalJson<LocalWatchHistoryItem[]>(hKey, []);
      if (Array.isArray(current)) {
        writeLocalJson(
          hKey,
          current.filter((h) => String(h.id) !== idStr),
        );
      }
      const dMap = readLocalJson<Record<string, number>>(dKey, {});
      const nextMap = { ...(dMap && typeof dMap === 'object' ? dMap : {}), [idStr]: dismissTs };
      writeLocalJson(dKey, nextMap);
      return nextMap;
    };

    try {
      if (typeof localStorage !== 'undefined') {
        const nextMap = removeFromKey(historyKey, dismissedKey);
        if (uid !== 'guest') {
          removeFromKey('local_watch_history_guest', 'local_watch_history_dismissed_guest');
        }
        localStorage.removeItem('local_watch_history');

        if (userId && isAuthenticatedOwner(uid)) {
          const mergedCloudMap = {
            ...(cloudPrivacy?.watchDismissedMap && typeof cloudPrivacy.watchDismissedMap === 'object'
              ? cloudPrivacy.watchDismissedMap
              : {}),
            ...nextMap,
          };
          updateDoc(doc(db, 'users', uid), {
            'privacySettings.watchDismissedMap': mergedCloudMap,
          }).catch(() => {});
        }
      }
    } catch {}
  },

  clearAll: (userId: string | null | undefined, currentItems: Array<{ id: string | number; updatedAt?: number }> = []) => {
    const { uid, historyKey, clearedKey, dismissedKey } = getWatchKeys(userId);
    const maxItemTs = currentItems.reduce((mx, it) => Math.max(mx, Number(it?.updatedAt) || 0), 0);
    const prevCleared = watchHistoryService.getClearedAt(userId);
    const clearedAt = Math.max(Date.now(), maxItemTs, prevCleared) + 1000;

    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(historyKey);
        localStorage.removeItem('local_watch_history_guest');
        localStorage.removeItem('local_watch_history');
        localStorage.setItem(clearedKey, String(clearedAt));
        localStorage.setItem('local_watch_history_cleared_at_guest', String(clearedAt));
        localStorage.removeItem(dismissedKey);
        localStorage.removeItem('local_watch_history_dismissed_guest');

        if (userId && isAuthenticatedOwner(uid)) {
          updateDoc(doc(db, 'users', uid), {
            'privacySettings.watchHistoryClearedAt': clearedAt,
            'privacySettings.watchDismissedMap': {},
          }).catch(() => {});
        }
      }
    } catch {}
  },
};
