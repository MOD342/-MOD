import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { resolveApiUrl, resolveAbsoluteApiUrlForExternalIntent } from '../utils/apiUrl';
import { openDownloadManager } from '../utils/externalNavigation';
import { cloudCatalogService } from './cloudCatalogService';

export type DownloadQualityPref = 'auto' | 'FHD' | 'HD' | 'SD';
export type DownloadTargetMode = 'internal' | 'external';
export type DownloadItemStatus =
  | 'queued'
  | 'resolving'
  | 'downloading'
  | 'paused'
  | 'completed'
  | 'failed';

export interface DownloadQueueItem {
  id: string;
  itemType?: 'episode' | 'chapter';
  animeId: string;
  animeTitle: string;
  englishTitle?: string;
  posterUrl?: string;
  seasonNumber: number;
  episodeNum: string;
  episodeTitle: string;
  episodeUrl: string;
  mangaId?: string;
  mangadexId?: string | null;
  chapterId?: string;
  chapterNum?: string;
  chapterTitle?: string;
  mediaFormat?: string;
  totalPages?: number;
  downloadedPages?: number;
  requestedQuality: DownloadQualityPref;
  resolvedQuality?: string;
  usedFallbackQuality?: boolean;
  serverName?: string;
  targetMode: DownloadTargetMode;
  status: DownloadItemStatus;
  progress: number;
  downloadedBytes: number;
  totalBytes: number;
  speedBps: number;
  filename: string;
  downloadUrl?: string;
  externalDirectUrl?: string | null;
  externalDirectMime?: string | null;
  hasOfflineFile?: boolean;
  errorMessage?: string;
  createdAt: number;
  updatedAt: number;
}

export interface BatchChapterInput {
  id: string;
  num: string;
  title?: string;
  pagesCount?: number;
  language?: string;
}

export interface BatchMangaInput {
  _id: string;
  mangadexId?: string | null;
  title: string;
  posterUrl?: string;
  mediaFormat?: string;
}

export interface BatchEpisodeInput {
  id?: string;
  link?: string;
  num?: string | number;
  title?: string;
  seasonNumber?: number;
}

export interface BatchAnimeInput {
  _id?: string | number;
  malId?: string | number;
  title?: string;
  englishTitle?: string;
  posterUrl?: string;
  thumbnailUrl?: string;
}

const STORAGE_KEY = 'anime_mod_dl_queue_v1';
const IDB_NAME = 'anime_mod_offline_videos_db';
const IDB_STORE = 'videos';
const CHAPTER_IDB_NAME = 'anime_mod_offline_chapters_db';
const CHAPTER_IDB_STORE = 'chapters';
const MAX_CONCURRENT_JOBS = 2;

export function formatQualityLabel(q?: string | null): string {
  if (!q || q === 'auto') return 'الأفضل تلقائياً';
  const u = q.toUpperCase();
  if (u === 'FHD' || u.includes('1080')) return '1080p (FHD)';
  if (u === 'HD' || u.includes('720')) return '720p (HD)';
  if (u === 'SD' || u.includes('480') || u.includes('360')) return '480p (SD)';
  return q;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(2)} GB`;
  }
  return `${mb.toFixed(1)} MB`;
}

export function formatSpeed(bps: number): string {
  if (!Number.isFinite(bps) || bps <= 0) return '';
  const mbps = bps / (1024 * 1024);
  if (mbps >= 1) {
    return `${mbps.toFixed(1)} MB/s`;
  }
  const kbps = bps / 1024;
  return `${Math.round(kbps)} KB/s`;
}

function normalizeQualityCode(raw?: string | null): 'FHD' | 'HD' | 'SD' | null {
  const l = String(raw || '').toLowerCase();
  if (!l) return null;
  if (l.includes('1080') || l.includes('fhd')) return 'FHD';
  if (l.includes('720') || l.includes('hd')) return 'HD';
  if (l.includes('480') || l.includes('360') || l.includes('sd')) return 'SD';
  return null;
}

function openOfflineDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function saveBlobOffline(id: string, blob: Blob): Promise<boolean> {
  const db = await openOfflineDb();
  if (!db) return false;
  return new Promise((resolve) => {
    const finish = (ok: boolean) => {
      try {
        db.close();
      } catch {}
      resolve(ok);
    };
    try {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(blob, id);
      tx.oncomplete = () => finish(true);
      tx.onerror = () => finish(false);
      tx.onabort = () => finish(false);
    } catch {
      finish(false);
    }
  });
}

async function getBlobOffline(id: string): Promise<Blob | null> {
  const db = await openOfflineDb();
  if (!db) return null;
  return new Promise((resolve) => {
    const finish = (val: Blob | null) => {
      try {
        db.close();
      } catch {}
      resolve(val);
    };
    try {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(id);
      req.onsuccess = () => finish(req.result instanceof Blob ? req.result : null);
      req.onerror = () => finish(null);
      tx.onabort = () => finish(null);
    } catch {
      finish(null);
    }
  });
}

async function deleteBlobOffline(id: string): Promise<void> {
  const db = await openOfflineDb();
  if (!db) return;
  try {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(id);
    tx.oncomplete = () => {
      try {
        db.close();
      } catch {}
    };
    tx.onerror = () => {
      try {
        db.close();
      } catch {}
    };
  } catch {
    try {
      db.close();
    } catch {}
  }
}

function openOfflineChapterDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(CHAPTER_IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(CHAPTER_IDB_STORE)) {
          db.createObjectStore(CHAPTER_IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function saveChapterPackOffline(id: string, pages: Blob[]): Promise<boolean> {
  const db = await openOfflineChapterDb();
  if (!db) return false;
  return new Promise((resolve) => {
    const finish = (ok: boolean) => {
      try {
        db.close();
      } catch {}
      resolve(ok);
    };
    try {
      const tx = db.transaction(CHAPTER_IDB_STORE, 'readwrite');
      tx.objectStore(CHAPTER_IDB_STORE).put({ pages, pageCount: pages.length, savedAt: Date.now() }, id);
      tx.oncomplete = () => finish(true);
      tx.onerror = () => finish(false);
      tx.onabort = () => finish(false);
    } catch {
      finish(false);
    }
  });
}

async function getChapterPackOffline(id: string): Promise<Blob[] | null> {
  const db = await openOfflineChapterDb();
  if (!db) return null;
  return new Promise((resolve) => {
    const finish = (val: Blob[] | null) => {
      try {
        db.close();
      } catch {}
      resolve(val);
    };
    try {
      const tx = db.transaction(CHAPTER_IDB_STORE, 'readonly');
      const req = tx.objectStore(CHAPTER_IDB_STORE).get(id);
      req.onsuccess = () => {
        const val = req.result;
        if (val && Array.isArray(val.pages) && val.pages.length > 0) {
          finish(val.pages);
        } else {
          finish(null);
        }
      };
      req.onerror = () => finish(null);
      tx.onabort = () => finish(null);
    } catch {
      finish(null);
    }
  });
}

async function deleteChapterPackOffline(id: string): Promise<void> {
  const db = await openOfflineChapterDb();
  if (!db) return;
  try {
    const tx = db.transaction(CHAPTER_IDB_STORE, 'readwrite');
    tx.objectStore(CHAPTER_IDB_STORE).delete(id);
    tx.oncomplete = () => {
      try {
        db.close();
      } catch {}
    };
    tx.onerror = () => {
      try {
        db.close();
      } catch {}
    };
  } catch {
    try {
      db.close();
    } catch {}
  }
}

function triggerBrowserBlobSave(blobUrl: string, filename: string) {
  if (typeof document === 'undefined') return;
  try {
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } catch {}
}

let browserSaveQueue: Promise<void> = Promise.resolve();
function queueBrowserBlobSave(blobUrl: string, filename: string, revokeAfterMs = 60_000): Promise<void> {
  const job = browserSaveQueue.then(async () => {
    triggerBrowserBlobSave(blobUrl, filename);
    await new Promise((r) => setTimeout(r, 550));
    if (revokeAfterMs > 0 && blobUrl.startsWith('blob:')) {
      setTimeout(() => {
        try {
          URL.revokeObjectURL(blobUrl);
        } catch {}
      }, revokeAfterMs);
    }
  });
  browserSaveQueue = job.catch(() => {});
  return job;
}

let externalLaunchQueue: Promise<boolean> = Promise.resolve(false);
function queueExternalDownloadLaunch(url: string, filename: string, mimeType: string): Promise<boolean> {
  const job = externalLaunchQueue.then(async () => {
    const ok = await openDownloadManager(url, filename, mimeType);
    await new Promise((r) => setTimeout(r, 380));
    return ok;
  });
  externalLaunchQueue = job.catch(() => false);
  return job;
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  parentSignal: AbortSignal,
  timeoutMs: number,
  timeoutMessage = 'انتهت مهلة الاتصال بالخادم، أعد المحاولة.',
): Promise<Response> {
  const stageCtrl = new AbortController();
  let timedOut = false;

  const onParentAbort = () => {
    stageCtrl.abort(parentSignal.reason);
  };
  if (parentSignal.aborted) {
    stageCtrl.abort(parentSignal.reason);
  } else {
    parentSignal.addEventListener('abort', onParentAbort, { once: true });
  }

  const timer = setTimeout(() => {
    timedOut = true;
    stageCtrl.abort(new Error('TIMEOUT'));
  }, timeoutMs);

  try {
    return await fetch(input, { ...init, signal: stageCtrl.signal });
  } catch (err: any) {
    if (timedOut) {
      throw new Error(timeoutMessage);
    }
    throw err;
  } finally {
    clearTimeout(timer);
    parentSignal.removeEventListener('abort', onParentAbort);
  }
}

async function readChunkWithTimeout(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal: AbortSignal,
  idleTimeoutMs = 30_000,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  if (signal.aborted) {
    try {
      await reader.cancel();
    } catch {}
    throw new Error('ABORTED');
  }

  return new Promise<ReadableStreamReadResult<Uint8Array>>((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
    };
    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reader.cancel().catch(() => {});
      reject(new Error('ABORTED'));
    };
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reader.cancel().catch(() => {});
      reject(new Error('انقطع تدفق البيانات لفترة طويلة، أعد المحاولة.'));
    }, idleTimeoutMs);

    signal.addEventListener('abort', onAbort, { once: true });

    reader.read().then(
      (res) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(res);
      },
      (err) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(err);
      },
    );
  });
}

async function safeReadJson(resp: Response): Promise<any> {
  try {
    return await resp.json();
  } catch {
    return null;
  }
}

class DownloadManagerService {
  private items: DownloadQueueItem[] = [];
  private listeners = new Set<() => void>();
  private activeControllers = new Map<string, AbortController>();
  private manualAbortReasons = new Map<string, 'paused' | 'removed'>();
  private activeJobIds = new Set<string>();
  private pumping = false;

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage() {
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        this.items = parsed.map((item: DownloadQueueItem) => ({
          ...item,
          status:
            item.status === 'downloading' || item.status === 'resolving'
              ? 'paused'
              : item.status,
          speedBps: 0,
        }));
      }
    } catch {
      this.items = [];
    }
  }

  private persistToStorage() {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.items.slice(0, 120)));
    } catch {}
  }

  private emit() {
    this.persistToStorage();
    this.listeners.forEach((cb) => {
      try {
        cb();
      } catch {}
    });
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getSnapshot(): DownloadQueueItem[] {
    return this.items;
  }

  private updateItem(id: string, patch: Partial<DownloadQueueItem>, persist = true) {
    const idx = this.items.findIndex((x) => x.id === id);
    if (idx === -1) return;
    this.items = [
      ...this.items.slice(0, idx),
      { ...this.items[idx], ...patch, updatedAt: Date.now() },
      ...this.items.slice(idx + 1),
    ];
    if (persist) {
      this.emit();
    } else {
      this.listeners.forEach((cb) => cb());
    }
  }

  public enqueueBatch(
    anime: BatchAnimeInput,
    episodes: BatchEpisodeInput[],
    requestedQuality: DownloadQualityPref = 'auto',
    targetMode: DownloadTargetMode = 'internal',
  ): DownloadQueueItem[] {
    const animeId = String(anime?._id || anime?.malId || 'anime');
    const animeTitle = anime?.title || anime?.englishTitle || 'أنمي';
    const posterUrl = anime?.posterUrl || anime?.thumbnailUrl || '';
    const now = Date.now();
    const added: DownloadQueueItem[] = [];

    const nextItems = [...this.items];

    for (let i = 0; i < episodes.length; i++) {
      const ep = episodes[i];
      const epNum = String(ep.num ?? i + 1);
      const seasonNumber = Number(ep.seasonNumber || 1);
      const itemId = `${animeId}__s${seasonNumber}__ep${epNum}`;
      const cleanNameBase = (anime?.englishTitle || animeTitle || 'Anime')
        .replace(/[^\w\u0600-\u06FF\s-]/gi, '')
        .trim() || 'Anime';

      const existingIdx = nextItems.findIndex((x) => x.id === itemId);
      const existing = existingIdx >= 0 ? nextItems[existingIdx] : null;

      if (existing && (existing.status === 'downloading' || existing.status === 'resolving' || existing.status === 'queued')) {
        added.push(existing);
        continue;
      }

      const newItem: DownloadQueueItem = {
        id: itemId,
        animeId,
        animeTitle,
        englishTitle: anime?.englishTitle || anime?.title || undefined,
        posterUrl,
        seasonNumber,
        episodeNum: epNum,
        episodeTitle: ep.title || `الحلقة ${epNum}`,
        episodeUrl: ep.id || ep.link || `${animeId}-episode-${epNum}`,
        requestedQuality,
        targetMode,
        status: 'queued',
        progress: 0,
        downloadedBytes: 0,
        totalBytes: 0,
        speedBps: 0,
        filename: `${cleanNameBase}-Ep-${epNum}.mp4`,
        createdAt: now + i,
        updatedAt: now + i,
      };

      if (existingIdx >= 0) {
        nextItems[existingIdx] = newItem;
      } else {
        nextItems.unshift(newItem);
      }
      added.push(newItem);
    }

    this.items = nextItems;
    this.emit();
    void this.pumpQueue();
    return added;
  }

  public enqueueMangaBatch(
    manga: BatchMangaInput,
    chapters: BatchChapterInput[],
  ): DownloadQueueItem[] {
    const mangaId = String(manga._id);
    const title = manga.title || 'مانجا';
    const posterUrl = manga.posterUrl || '';
    const now = Date.now();
    const added: DownloadQueueItem[] = [];
    const nextItems = [...this.items];

    for (let i = 0; i < chapters.length; i++) {
      const ch = chapters[i];
      const chNum = String(ch.num || i + 1);
      const itemId = `manga__${mangaId}__ch_${ch.id}`;
      const existingIdx = nextItems.findIndex((x) => x.id === itemId);
      const existing = existingIdx >= 0 ? nextItems[existingIdx] : null;

      if (
        existing &&
        (existing.status === 'downloading' ||
          existing.status === 'resolving' ||
          existing.status === 'queued')
      ) {
        added.push(existing);
        continue;
      }

      const newItem: DownloadQueueItem = {
        id: itemId,
        itemType: 'chapter',
        animeId: mangaId,
        animeTitle: title,
        posterUrl,
        seasonNumber: 1,
        episodeNum: chNum,
        episodeTitle: ch.title || `الفصل ${chNum}`,
        episodeUrl: ch.id,
        mangaId,
        mangadexId: manga.mangadexId || null,
        chapterId: ch.id,
        chapterNum: chNum,
        chapterTitle: ch.title || `الفصل ${chNum}`,
        mediaFormat: manga.mediaFormat || 'manga',
        totalPages: Number(ch.pagesCount || 0),
        downloadedPages: 0,
        requestedQuality: 'HD',
        resolvedQuality: ch.language === 'en' ? 'إنجليزي' : 'عربي',
        targetMode: 'internal',
        status: 'queued',
        progress: 0,
        downloadedBytes: 0,
        totalBytes: 0,
        speedBps: 0,
        filename: `${title}-Ch-${chNum}`,
        createdAt: now + i,
        updatedAt: now + i,
      };

      if (existingIdx >= 0) {
        nextItems[existingIdx] = newItem;
      } else {
        nextItems.unshift(newItem);
      }
      added.push(newItem);
    }

    this.items = nextItems;
    this.emit();
    void this.pumpQueue();
    return added;
  }

  public pauseItem(id: string) {
    this.manualAbortReasons.set(id, 'paused');
    const ctrl = this.activeControllers.get(id);
    if (ctrl) {
      try {
        ctrl.abort('paused');
      } catch {}
      this.activeControllers.delete(id);
    }
    this.activeJobIds.delete(id);
    const current = this.items.find((x) => x.id === id);
    if (!current || current.status === 'completed') {
      this.manualAbortReasons.delete(id);
      return;
    }
    this.updateItem(id, { status: 'paused', speedBps: 0 });
  }

  public resumeItem(id: string) {
    const current = this.items.find((x) => x.id === id);
    if (!current || current.status === 'completed') return;
    this.manualAbortReasons.delete(id);
    this.updateItem(id, {
      status: 'queued',
      errorMessage: undefined,
      speedBps: 0,
    });
    void this.pumpQueue();
  }

  public retryItem(id: string) {
    const current = this.items.find((x) => x.id === id);
    if (!current) return;
    this.manualAbortReasons.delete(id);
    this.updateItem(id, {
      status: 'queued',
      progress: 0,
      downloadedBytes: 0,
      downloadedPages: 0,
      speedBps: 0,
      errorMessage: undefined,
    });
    void this.pumpQueue();
  }

  public retryAllFailed() {
    let changed = false;
    this.items = this.items.map((item) => {
      if (item.status === 'failed') {
        changed = true;
        this.manualAbortReasons.delete(item.id);
        return {
          ...item,
          status: 'queued' as const,
          progress: 0,
          downloadedBytes: 0,
          downloadedPages: 0,
          speedBps: 0,
          errorMessage: undefined,
          updatedAt: Date.now(),
        };
      }
      return item;
    });
    if (changed) {
      this.emit();
      void this.pumpQueue();
    }
  }

  public removeItem(id: string) {
    const target = this.items.find((x) => x.id === id);
    this.manualAbortReasons.set(id, 'removed');
    const ctrl = this.activeControllers.get(id);
    if (ctrl) {
      try {
        ctrl.abort('removed');
      } catch {}
      this.activeControllers.delete(id);
    }
    this.activeJobIds.delete(id);
    this.items = this.items.filter((x) => x.id !== id);
    this.emit();
    if (target?.itemType === 'chapter') {
      void deleteChapterPackOffline(id);
    } else {
      void deleteBlobOffline(id);
    }
    void this.pumpQueue();
  }

  public pauseAll() {
    for (const item of this.items) {
      if (item.status === 'downloading' || item.status === 'resolving' || item.status === 'queued') {
        this.manualAbortReasons.set(item.id, 'paused');
        const ctrl = this.activeControllers.get(item.id);
        if (ctrl) {
          try {
            ctrl.abort('paused');
          } catch {}
          this.activeControllers.delete(item.id);
        }
        this.activeJobIds.delete(item.id);
      }
    }
    this.items = this.items.map((item) =>
      item.status === 'downloading' || item.status === 'resolving' || item.status === 'queued'
        ? { ...item, status: 'paused', speedBps: 0, updatedAt: Date.now() }
        : item,
    );
    this.emit();
  }

  public resumeAll() {
    this.items = this.items.map((item) => {
      if (item.status === 'paused' || item.status === 'failed') {
        this.manualAbortReasons.delete(item.id);
        return {
          ...item,
          status: 'queued' as const,
          errorMessage: undefined,
          speedBps: 0,
          updatedAt: Date.now(),
        };
      }
      return item;
    });
    this.emit();
    void this.pumpQueue();
  }

  public clearCompleted() {
    const toDelete = this.items.filter((x) => x.status === 'completed');
    this.items = this.items.filter((x) => x.status !== 'completed');
    this.emit();
    toDelete.forEach((x) => {
      if (x.itemType === 'chapter') void deleteChapterPackOffline(x.id);
      else void deleteBlobOffline(x.id);
    });
  }

  public async getOfflineVideoUrl(id: string): Promise<string | null> {
    const blob = await getBlobOffline(id);
    if (!blob) return null;
    return URL.createObjectURL(blob);
  }

  public async getOfflineChapterPages(id: string): Promise<string[] | null> {
    const pages = await getChapterPackOffline(id);
    if (!pages || pages.length === 0) return null;
    return pages.map((b) => URL.createObjectURL(b));
  }

  public async saveItemToDevice(id: string): Promise<boolean> {
    const item = this.items.find((x) => x.id === id);
    if (!item) return false;
    const blob = await getBlobOffline(id);
    if (blob) {
      const objUrl = URL.createObjectURL(blob);
      triggerBrowserBlobSave(objUrl, item.filename);
      setTimeout(() => {
        try {
          URL.revokeObjectURL(objUrl);
        } catch {}
      }, 60_000);
      return true;
    }
    if (item.downloadUrl) {
      triggerBrowserBlobSave(resolveApiUrl(item.downloadUrl), item.filename);
      return true;
    }
    return false;
  }

  public async sendItemToExternalManager(id: string): Promise<boolean> {
    const item = this.items.find((x) => x.id === id);
    if (!item) return false;
    const target =
      item.externalDirectUrl ||
      (item.downloadUrl ? resolveAbsoluteApiUrlForExternalIntent(item.downloadUrl) : '');
    if (!target) return false;
    return openDownloadManager(target, item.filename, item.externalDirectMime || 'video/mp4');
  }

  private async pumpQueue() {
    if (this.pumping) return;
    this.pumping = true;
    try {
      while (this.activeJobIds.size < MAX_CONCURRENT_JOBS) {
        const queuedList = this.items.filter(
          (x) => x.status === 'queued' && !this.activeJobIds.has(x.id),
        );
        if (queuedList.length === 0) break;
        // Process oldest queued first so Episode 1 starts before Episode 2
        const nextItem = queuedList.reduce((oldest, curr) =>
          curr.createdAt < oldest.createdAt ? curr : oldest,
        );
        this.activeJobIds.add(nextItem.id);
        void this.processItem(nextItem.id).finally(() => {
          this.activeJobIds.delete(nextItem.id);
          this.activeControllers.delete(nextItem.id);
          void this.pumpQueue();
        });
      }
    } finally {
      this.pumping = false;
    }
  }

  private async resolveEpisodeWithFallback(
    item: DownloadQueueItem,
    signal: AbortSignal,
    forceFresh = false,
  ): Promise<{
    downloadUrl: string;
    mode?: string;
    externalDirectUrl?: string | null;
    externalDirectMime?: string | null;
    filename: string;
    sizeBytes?: number | null;
    resolvedQuality: string;
    usedFallbackQuality: boolean;
    serverName?: string | null;
  }> {
    const serverLookup = {
      url: item.episodeUrl,
      animeId: item.animeId,
      animeTitle: item.animeTitle,
      englishTitle: item.englishTitle,
      seasonNumber: item.seasonNumber,
      episodeNum: item.episodeNum,
    };

    const fetchLiveServers = async (): Promise<any[]> => {
      const srvResp = await fetchWithTimeout(
        resolveApiUrl('/api/anime/servers'),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: item.episodeUrl,
            animeId: item.animeId,
            animeTitle: item.animeTitle,
            englishTitle: item.englishTitle,
            seasonNumber: item.seasonNumber,
            episodeNum: item.episodeNum,
          }),
        },
        signal,
        25_000,
        'استغرق البحث عن سيرفرات الحلقة وقتاً طويلاً، أعد المحاولة.',
      );
      const srvJson = await safeReadJson(srvResp);
      const list = Array.isArray(srvJson?.data) ? srvJson.data : [];
      if (!srvResp.ok || !srvJson?.success || list.length === 0) {
        throw new Error(srvJson?.message || 'لم يتم العثور على سيرفرات متاحة لهذه الحلقة حالياً.');
      }
      void cloudCatalogService.cacheResolvedEpisodeServers(serverLookup, list);
      return list;
    };

    let rawServers: any[] = [];
    let usedCache = false;
    if (!forceFresh) {
      const cached = await cloudCatalogService.tryReadEpisodeServersCacheOrCloud(serverLookup);
      if (cached && cached.length > 0) {
        rawServers = cached;
        usedCache = true;
      }
    } else {
      await cloudCatalogService.invalidateEpisodeServersCache(serverLookup).catch(() => {});
    }

    if (rawServers.length === 0) {
      rawServers = await fetchLiveServers();
    }

    const wantExternal = item.targetMode === 'external' || Capacitor.isNativePlatform();

    const tryResolveWithServers = async (servers: any[]) => {
      const dlServers = servers.filter((s) => s.category === 'download');
      const watchServers = servers.filter((s) => s.category !== 'download');
      const orderedServers = [...dlServers, ...watchServers];
      const serverCandidates = orderedServers.map((s) => ({
        url: s.url,
        quality: s.quality,
        serverName: s.serverName,
        category: s.category,
      }));

      const callResolve = async (qual: DownloadQualityPref) => {
        const r = await fetchWithTimeout(
          resolveApiUrl('/api/anime/resolve-download'),
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              url: orderedServers[0]?.url || '',
              fallbackUrls: orderedServers.slice(1).map((s) => s.url),
              serverCandidates,
              preferredQuality: qual,
              title: item.animeTitle,
              ep: item.episodeNum,
              preferExternal: wantExternal,
            }),
          },
          signal,
          44_000,
          'استغرق تجهيز رابط الحلقة وقتاً طويلاً، أعد المحاولة.',
        );
        const json = await safeReadJson(r);
        return json || { success: false, message: 'تعذر قراءة استجابة السيرفر.' };
      };

      let resolvedJson = await callResolve(item.requestedQuality);
      if (!resolvedJson?.success && item.requestedQuality !== 'auto' && !signal.aborted) {
        resolvedJson = await callResolve('auto');
      }
      return { resolvedJson, orderedServers };
    };

    let { resolvedJson, orderedServers } = await tryResolveWithServers(rawServers);

    // If cached servers failed to yield a working download URL, purge cache & re-fetch live servers once
    if ((!resolvedJson?.success || !resolvedJson?.downloadUrl) && usedCache && !signal.aborted) {
      await cloudCatalogService.invalidateEpisodeServersCache(serverLookup).catch(() => {});
      try {
        const freshServers = await fetchLiveServers();
        if (freshServers.length > 0) {
          ({ resolvedJson, orderedServers } = await tryResolveWithServers(freshServers));
        }
      } catch {}
    }

    if (!resolvedJson?.success || !resolvedJson?.downloadUrl) {
      if (orderedServers[0]?.url) {
        void cloudCatalogService.recordServerOutcome(serverLookup, orderedServers[0].url, false);
      }
      throw new Error(resolvedJson?.message || 'تعذر تجهيز رابط تحميل مباشر لهذه الحلقة.');
    }

    const matchedServer =
      orderedServers.find((s) => s?.serverName && resolvedJson.serverName && s.serverName === resolvedJson.serverName) ||
      orderedServers[0];
    if (matchedServer?.url) {
      void cloudCatalogService.recordServerOutcome(serverLookup, matchedServer.url, true);
    }

    const reqTier = normalizeQualityCode(item.requestedQuality);
    const actualTier =
      normalizeQualityCode(resolvedJson.resolvedQuality) ||
      normalizeQualityCode(orderedServers[0]?.quality) ||
      'HD';
    const usedFallbackQuality =
      Boolean(resolvedJson.usedFallbackQuality) ||
      Boolean(reqTier && actualTier !== reqTier);

    return {
      downloadUrl: resolvedJson.downloadUrl,
      mode: resolvedJson.mode || 'mp4',
      externalDirectUrl: resolvedJson.externalDirectUrl || null,
      externalDirectMime: resolvedJson.externalDirectMime || 'video/mp4',
      filename: resolvedJson.filename || item.filename,
      sizeBytes: resolvedJson.sizeBytes || null,
      resolvedQuality: resolvedJson.resolvedQuality || actualTier,
      usedFallbackQuality,
      serverName: resolvedJson.serverName || orderedServers[0]?.serverName || null,
    };
  }

  private async downloadHlsPlaylistToBlob(
    initialPlaylistText: string,
    playlistUrl: string,
    signal: AbortSignal,
    onProgress: (downloadedBytes: number, totalBytes: number, progress: number, speedBps: number) => void,
  ): Promise<{ blob: Blob; totalBytes: number }> {
    const resolvePlaylistRef = (ref: string, base: string) => {
      const trimmed = ref.trim();
      if (trimmed.startsWith('/api/')) return resolveApiUrl(trimmed);
      try {
        return resolveApiUrl(new URL(trimmed, base).toString());
      } catch {
        return resolveApiUrl(trimmed);
      }
    };

    let mediaText = initialPlaylistText;
    let mediaUrl = playlistUrl;

    // If master playlist, pick highest bandwidth variant
    if (mediaText.includes('#EXT-X-STREAM-INF')) {
      const lines = mediaText.split(/\r?\n/);
      let bestBw = -1;
      let bestUri = '';
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('#EXT-X-STREAM-INF')) {
          const bw = Number(line.match(/BANDWIDTH=(\d+)/i)?.[1] || 0);
          for (let j = i + 1; j < lines.length; j++) {
            const nextLine = lines[j].trim();
            if (nextLine && !nextLine.startsWith('#')) {
              if (bw >= bestBw) {
                bestBw = bw;
                bestUri = nextLine;
              }
              break;
            }
          }
        }
      }
      if (!bestUri) {
        throw new Error('لم يتم العثور على مسار بث صالح في قائمة HLS.');
      }
      mediaUrl = resolvePlaylistRef(bestUri, playlistUrl);
      const varResp = await fetchWithTimeout(
        mediaUrl,
        {},
        signal,
        24_000,
        'انتهت مهلة تحميل قائمة أجزاء الفيديو.',
      );
      if (!varResp.ok) {
        throw new Error('تعذر جلب قائمة أجزاء الفيديو.');
      }
      mediaText = await varResp.text();
    }

    const lines = mediaText.split(/\r?\n/);
    const segmentUrls: string[] = [];
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;
      if (line.startsWith('#EXT-X-KEY') && /METHOD=AES-128/i.test(line)) {
        throw new Error('هذا السيرفر يستخدم تشفير HLS غير مدعوم للتنزيل الداخلي؛ جرب التحميل الخارجي.');
      }
      if (line.startsWith('#EXT-X-MAP')) {
        const mapUri = line.match(/URI="([^"]+)"/i)?.[1];
        if (mapUri) segmentUrls.push(resolvePlaylistRef(mapUri, mediaUrl));
        continue;
      }
      if (!line.startsWith('#')) {
        segmentUrls.push(resolvePlaylistRef(line, mediaUrl));
      }
    }

    if (segmentUrls.length === 0) {
      throw new Error('لم يتم العثور على مقاطع فيديو صالحة للتنزيل.');
    }

    const segBuffers: (ArrayBuffer | null)[] = new Array(segmentUrls.length).fill(null);
    let nextIdx = 0;
    let completed = 0;
    let downloadedBytes = 0;
    const startedAt = Date.now();
    const concurrency = Math.min(3, segmentUrls.length);

    const workers = Array.from({ length: concurrency }, async () => {
      while (true) {
        if (signal.aborted) return;
        const idx = nextIdx++;
        if (idx >= segmentUrls.length) return;
        const segUrl = segmentUrls[idx];
        let buf: ArrayBuffer | null = null;
        for (let attempt = 0; attempt < 2 && !buf; attempt++) {
          if (signal.aborted) return;
          try {
            const segResp = await fetchWithTimeout(
              segUrl,
              {},
              signal,
              25_000,
              'انتهت مهلة تنزيل مقطع فيديو.',
            );
            if (segResp.ok) {
              const ab = await segResp.arrayBuffer();
              if (ab.byteLength > 0) buf = ab;
            }
          } catch {}
        }
        if (!buf) {
          throw new Error(`تعذر تحميل مقطع الفيديو (${idx + 1}/${segmentUrls.length})، أعد المحاولة.`);
        }
        segBuffers[idx] = buf;
        completed++;
        downloadedBytes += buf.byteLength;
        const elapsedSec = Math.max(0.25, (Date.now() - startedAt) / 1000);
        const speedBps = Math.round(downloadedBytes / elapsedSec);
        const estimatedTotal = Math.round((downloadedBytes / completed) * segmentUrls.length);
        const progress = Math.min(99, Math.max(1, Math.round((completed / segmentUrls.length) * 100)));
        onProgress(downloadedBytes, estimatedTotal, progress, speedBps);
      }
    });

    await Promise.all(workers);
    if (signal.aborted) {
      throw new Error('ABORTED');
    }

    const validParts = segBuffers.filter((b): b is ArrayBuffer => Boolean(b && b.byteLength > 0));
    if (validParts.length !== segmentUrls.length) {
      throw new Error('لم تكتمل جميع مقاطع الفيديو، أعد المحاولة.');
    }

    const blob = new Blob(validParts, { type: 'video/mp2t' });
    return { blob, totalBytes: downloadedBytes };
  }

  private async processChapterItem(item: DownloadQueueItem, controller: AbortController) {
    const id = item.id;
    const chapterId = item.chapterId || item.episodeUrl;
    let pageEntries: Array<{ index?: number; url: string; fallbackUrl?: string }> =
      (await cloudCatalogService.tryReadChapterPagesCacheOrCloud(chapterId, 'high')) || [];

    if (pageEntries.length === 0) {
      const pagesResp = await fetchWithTimeout(
        resolveApiUrl(`/api/manga/pages?chapterId=${encodeURIComponent(chapterId)}&quality=high`),
        {},
        controller.signal,
        20_000,
        'استغرق جلب صفحات الفصل وقتاً طويلاً، أعد المحاولة.',
      );
      const pagesJson = await safeReadJson(pagesResp);
      pageEntries = Array.isArray(pagesJson?.data?.pages) ? pagesJson.data.pages : [];
      if (!pagesResp.ok || pageEntries.length === 0) {
        throw new Error(pagesJson?.message || 'تعذر تجهيز صفحات هذا الفصل للتنزيل.');
      }
      void cloudCatalogService.cacheResolvedChapterPages(
        chapterId,
        item.mangaId,
        'high',
        pageEntries.map((p, idx) => ({
          index: Number(p.index || idx + 1),
          url: p.url,
          fallbackUrl: p.fallbackUrl,
        })),
        pagesJson?.data?.source,
      );
    }

    const totalPages = pageEntries.length;
    this.updateItem(id, {
      status: 'downloading',
      totalPages,
      downloadedPages: 0,
      progress: 0,
      downloadedBytes: 0,
    });

    const blobs: (Blob | null)[] = new Array(totalPages).fill(null);
    let completedCount = 0;
    let totalBytes = 0;
    let nextIndex = 0;
    const concurrency = Math.min(3, totalPages);

    const downloadOnePage = async (index: number) => {
      const entry = pageEntries[index];
      const startedAt = Date.now();
      const candidates = [resolveApiUrl(entry.url), entry.fallbackUrl].filter(Boolean) as string[];
      let blob: Blob | null = null;

      for (let attempt = 0; attempt < 2 && !blob; attempt++) {
        for (const candidateUrl of candidates) {
          if (controller.signal.aborted) return;
          try {
            const r = await fetchWithTimeout(
              candidateUrl,
              {},
              controller.signal,
              18_000,
              `انتهت مهلة تحميل الصفحة ${index + 1}`,
            );
            if (r.ok) {
              const ct = (r.headers.get('content-type') || '').toLowerCase();
              if (!ct.includes('text/html')) {
                const b = await r.blob();
                if (b.size > 200) {
                  blob = b;
                  break;
                }
              }
            }
          } catch {}
        }
      }

      if (controller.signal.aborted) return;
      if (!blob) {
        void cloudCatalogService.reportBrokenChapterPages(chapterId, 'high');
        throw new Error(`تعذر تحميل الصفحة ${index + 1} من ${totalPages}، أعد المحاولة.`);
      }

      blobs[index] = blob;
      completedCount++;
      totalBytes += blob.size;
      const elapsedSec = Math.max(0.15, (Date.now() - startedAt) / 1000);
      const speedBps = Math.round(blob.size / elapsedSec);
      const progress = Math.min(99, Math.round((completedCount / totalPages) * 100));

      this.updateItem(
        id,
        {
          downloadedPages: completedCount,
          totalPages,
          downloadedBytes: totalBytes,
          totalBytes,
          progress,
          speedBps,
        },
        false,
      );
    };

    const workers = Array.from({ length: concurrency }, async () => {
      while (true) {
        if (controller.signal.aborted) return;
        const currentIndex = nextIndex++;
        if (currentIndex >= totalPages) return;
        await downloadOnePage(currentIndex);
      }
    });

    await Promise.all(workers);

    if (controller.signal.aborted) return;
    const validBlobs = blobs.filter((b): b is Blob => b instanceof Blob && b.size > 0);
    if (validBlobs.length !== totalPages) {
      throw new Error('لم تكتمل جميع صفحات الفصل، أعد المحاولة.');
    }

    const saved = await saveChapterPackOffline(id, validBlobs);
    if (!saved) {
      throw new Error('تعذر حفظ صور الفصل في مساحة التخزين المحلية.');
    }

    this.updateItem(id, {
      status: 'completed',
      progress: 100,
      downloadedPages: totalPages,
      totalPages,
      downloadedBytes: totalBytes,
      totalBytes,
      speedBps: 0,
      hasOfflineFile: true,
    });
  }

  private async processItem(id: string) {
    const item = this.items.find((x) => x.id === id);
    if (!item || item.status !== 'queued') return;

    this.manualAbortReasons.delete(id);
    const controller = new AbortController();
    this.activeControllers.set(id, controller);

    try {
      this.updateItem(id, { status: 'resolving', speedBps: 0, errorMessage: undefined });

      if (item.itemType === 'chapter') {
        await this.processChapterItem(item, controller);
        return;
      }

      let resolved = await this.resolveEpisodeWithFallback(item, controller.signal);
      if (this.manualAbortReasons.has(id)) return;
      if (controller.signal.aborted) {
        throw new Error('تعذر إكمال تجهيز الحلقة، أعد المحاولة.');
      }

      this.updateItem(id, {
        downloadUrl: resolved.downloadUrl,
        externalDirectUrl: resolved.externalDirectUrl,
        externalDirectMime: resolved.externalDirectMime,
        filename: resolved.filename,
        totalBytes: resolved.sizeBytes || 0,
        resolvedQuality: resolved.resolvedQuality,
        usedFallbackQuality: resolved.usedFallbackQuality,
        serverName: resolved.serverName || undefined,
      });

      // External Download Manager handoff mode
      if (item.targetMode === 'external') {
        const directTarget =
          resolved.externalDirectUrl ||
          resolveAbsoluteApiUrlForExternalIntent(resolved.downloadUrl);
        await queueExternalDownloadLaunch(
          directTarget,
          resolved.filename,
          resolved.externalDirectMime || 'video/mp4',
        );
        this.updateItem(id, {
          status: 'completed',
          progress: 100,
          speedBps: 0,
        });
        return;
      }

      // Internal Download Manager streaming download
      this.updateItem(id, { status: 'downloading', progress: 0, downloadedBytes: 0 });

      let streamUrl = resolveApiUrl(resolved.downloadUrl);
      let resp = await fetchWithTimeout(
        streamUrl,
        {},
        controller.signal,
        35_000,
        'تأخر سيرفر التحميل في الاستجابة، أعد المحاولة.',
      );

      // Token may have expired or rotated between Edge isolates: re-resolve once cleanly
      if ((resp.status === 404 || resp.status === 401 || resp.status === 403) && !controller.signal.aborted) {
        try {
          await resp.body?.cancel();
        } catch {}
        resolved = await this.resolveEpisodeWithFallback(item, controller.signal, true);
        streamUrl = resolveApiUrl(resolved.downloadUrl);
        this.updateItem(id, {
          downloadUrl: resolved.downloadUrl,
          externalDirectUrl: resolved.externalDirectUrl,
          externalDirectMime: resolved.externalDirectMime,
          filename: resolved.filename,
          totalBytes: resolved.sizeBytes || 0,
          resolvedQuality: resolved.resolvedQuality,
          usedFallbackQuality: resolved.usedFallbackQuality,
          serverName: resolved.serverName || undefined,
        });
        resp = await fetchWithTimeout(
          streamUrl,
          {},
          controller.signal,
          35_000,
          'تأخر سيرفر التحميل في الاستجابة، أعد المحاولة.',
        );
      }

      const ct = (resp.headers.get('content-type') || '').toLowerCase();
      if (!resp.ok || ct.includes('text/html') || !resp.body) {
        let serverMsg = '';
        try {
          if (ct.includes('application/json')) {
            const errJson = await resp.json();
            serverMsg = errJson?.message || '';
          }
        } catch {}
        throw new Error(serverMsg || 'تعذر بدء تنزيل الملف من المصدر، يرجى المحاولة مجدداً.');
      }

      const isHlsResponse =
        resolved.mode === 'hls' ||
        ct.includes('mpegurl') ||
        resp.headers.get('x-edge-media-mode') === 'hls';

      let blob: Blob;
      let finalFilename = resolved.filename;
      let downloaded = 0;
      let totalBytes = 0;

      if (isHlsResponse) {
        const playlistText = await resp.text();
        if (!playlistText.includes('#EXTM3U')) {
          throw new Error('استجابة البث غير صالحة للتنزيل، أعد المحاولة.');
        }
        const hlsResult = await this.downloadHlsPlaylistToBlob(
          playlistText,
          streamUrl,
          controller.signal,
          (dlBytes, estTotal, progress, speedBps) => {
            this.updateItem(
              id,
              {
                downloadedBytes: dlBytes,
                totalBytes: estTotal,
                progress,
                speedBps,
              },
              false,
            );
          },
        );
        blob = hlsResult.blob;
        downloaded = hlsResult.totalBytes;
        totalBytes = hlsResult.totalBytes;
        finalFilename = finalFilename.replace(/\.(mp4|mkv|webm)$/i, '.ts');
      } else {
        const headerLen = Number(resp.headers.get('content-length') || 0);
        totalBytes = headerLen > 0 ? headerLen : Number(resolved.sizeBytes || 0);
        const reader = resp.body.getReader();
        const chunks: BlobPart[] = [];
        let lastUpdate = Date.now();
        let lastBytes = 0;

        while (true) {
          const { done, value } = await readChunkWithTimeout(reader, controller.signal, 30_000);
          if (done) break;
          if (this.manualAbortReasons.has(id) || controller.signal.aborted) {
            try {
              await reader.cancel();
            } catch {}
            if (this.manualAbortReasons.has(id)) return;
            throw new Error('توقف تنزيل الحلقة، أعد المحاولة.');
          }
          chunks.push(value);
          downloaded += value.byteLength;

          const now = Date.now();
          const dt = now - lastUpdate;
          if (dt >= 350) {
            const speedBps = Math.max(0, Math.round(((downloaded - lastBytes) * 1000) / dt));
            const progress =
              totalBytes > 0
                ? Math.min(99, Math.max(1, Math.round((downloaded / totalBytes) * 100)))
                : Math.min(92, Math.max(5, Math.round((downloaded / (downloaded + 90 * 1024 * 1024)) * 92)));
            lastUpdate = now;
            lastBytes = downloaded;
            this.updateItem(
              id,
              {
                downloadedBytes: downloaded,
                totalBytes,
                progress,
                speedBps,
              },
              false,
            );
          }
        }

        if (downloaded <= 0) {
          throw new Error('استُلم ملف فارغ من السيرفر، أعد المحاولة.');
        }

        blob = new Blob(chunks, { type: ct.startsWith('video/') ? ct : 'video/mp4' });
      }

      if (blob.size <= 0) {
        throw new Error('استُلم ملف فارغ من السيرفر، أعد المحاولة.');
      }
      const storedOffline = await saveBlobOffline(id, blob);

      // Trigger staggered save to user's Downloads folder so browsers do not drop batch downloads
      const blobUrl = URL.createObjectURL(blob);
      await queueBrowserBlobSave(blobUrl, finalFilename, 60_000);

      this.updateItem(id, {
        status: 'completed',
        progress: 100,
        filename: finalFilename,
        downloadedBytes: downloaded || blob.size,
        totalBytes: totalBytes || downloaded || blob.size,
        speedBps: 0,
        hasOfflineFile: storedOffline,
      });
    } catch (err: any) {
      if (this.manualAbortReasons.has(id)) {
        return;
      }
      this.updateItem(id, {
        status: 'failed',
        speedBps: 0,
        errorMessage:
          err?.name === 'AbortError'
            ? 'انتهت مهلة الاتصال أو انقطع التنزيل، أعد المحاولة.'
            : err?.message || 'تعذر إكمال تنزيل الحلقة، يمكنك إعادة المحاولة.',
      });
    } finally {
      this.manualAbortReasons.delete(id);
    }
  }
}

export const downloadManagerService = new DownloadManagerService();

export function useDownloadQueue(): DownloadQueueItem[] {
  const [items, setItems] = useState<DownloadQueueItem[]>(() =>
    downloadManagerService.getSnapshot(),
  );

  useEffect(() => {
    setItems(downloadManagerService.getSnapshot());
    return downloadManagerService.subscribe(() => {
      setItems([...downloadManagerService.getSnapshot()]);
    });
  }, []);

  return items;
}
