import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { resolveApiUrl, resolveAbsoluteApiUrlForExternalIntent } from '../utils/apiUrl';
import { openDownloadManager } from '../utils/externalNavigation';

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
  animeId: string;
  animeTitle: string;
  posterUrl?: string;
  seasonNumber: number;
  episodeNum: string;
  episodeTitle: string;
  episodeUrl: string;
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
    try {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(blob, id);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

async function getBlobOffline(id: string): Promise<Blob | null> {
  const db = await openOfflineDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(id);
      req.onsuccess = () => resolve(req.result instanceof Blob ? req.result : null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function deleteBlobOffline(id: string): Promise<void> {
  const db = await openOfflineDb();
  if (!db) return;
  try {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(id);
  } catch {}
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

class DownloadManagerService {
  private items: DownloadQueueItem[] = [];
  private listeners = new Set<() => void>();
  private activeControllers = new Map<string, AbortController>();
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

  public pauseItem(id: string) {
    const ctrl = this.activeControllers.get(id);
    if (ctrl) {
      try {
        ctrl.abort('paused');
      } catch {}
      this.activeControllers.delete(id);
    }
    this.activeJobIds.delete(id);
    const current = this.items.find((x) => x.id === id);
    if (!current || current.status === 'completed') return;
    this.updateItem(id, { status: 'paused', speedBps: 0 });
  }

  public resumeItem(id: string) {
    const current = this.items.find((x) => x.id === id);
    if (!current || current.status === 'completed') return;
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
    this.updateItem(id, {
      status: 'queued',
      progress: 0,
      downloadedBytes: 0,
      speedBps: 0,
      errorMessage: undefined,
    });
    void this.pumpQueue();
  }

  public removeItem(id: string) {
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
    void deleteBlobOffline(id);
    void this.pumpQueue();
  }

  public pauseAll() {
    for (const item of this.items) {
      if (item.status === 'downloading' || item.status === 'resolving' || item.status === 'queued') {
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
    this.items = this.items.map((item) =>
      item.status === 'paused' || item.status === 'failed'
        ? { ...item, status: 'queued', errorMessage: undefined, speedBps: 0, updatedAt: Date.now() }
        : item,
    );
    this.emit();
    void this.pumpQueue();
  }

  public clearCompleted() {
    const toDelete = this.items.filter((x) => x.status === 'completed');
    this.items = this.items.filter((x) => x.status !== 'completed');
    this.emit();
    toDelete.forEach((x) => void deleteBlobOffline(x.id));
  }

  public async getOfflineVideoUrl(id: string): Promise<string | null> {
    const blob = await getBlobOffline(id);
    if (!blob) return null;
    return URL.createObjectURL(blob);
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
  ): Promise<{
    downloadUrl: string;
    externalDirectUrl?: string | null;
    externalDirectMime?: string | null;
    filename: string;
    sizeBytes?: number | null;
    resolvedQuality: string;
    usedFallbackQuality: boolean;
    serverName?: string | null;
  }> {
    // 1. Fetch episode servers
    const srvResp = await fetch(resolveApiUrl('/api/anime/servers'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: item.episodeUrl,
        animeId: item.animeId,
        animeTitle: item.animeTitle,
        seasonNumber: item.seasonNumber,
        episodeNum: item.episodeNum,
      }),
      signal,
    });
    const srvJson = await srvResp.json();
    const rawServers: any[] = Array.isArray(srvJson?.data) ? srvJson.data : [];
    if (!srvJson?.success || rawServers.length === 0) {
      throw new Error('لم يتم العثور على سيرفرات متاحة لهذه الحلقة حالياً.');
    }

    const dlServers = rawServers.filter((s) => s.category === 'download');
    const watchServers = rawServers.filter((s) => s.category !== 'download');
    const orderedServers = [...dlServers, ...watchServers];
    const serverCandidates = orderedServers.map((s) => ({
      url: s.url,
      quality: s.quality,
      serverName: s.serverName,
      category: s.category,
    }));

    const wantExternal = item.targetMode === 'external' || Capacitor.isNativePlatform();

    // 2. Try requested quality first (server already tries fallback, and we also retry 'auto' if needed)
    const callResolve = async (qual: DownloadQualityPref) => {
      const r = await fetch(resolveApiUrl('/api/anime/resolve-download'), {
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
        signal,
      });
      return r.json();
    };

    let resolvedJson = await callResolve(item.requestedQuality);
    if (!resolvedJson?.success && item.requestedQuality !== 'auto') {
      resolvedJson = await callResolve('auto');
    }

    if (!resolvedJson?.success || !resolvedJson?.downloadUrl) {
      throw new Error(resolvedJson?.message || 'تعذر تجهيز رابط تحميل مباشر لهذه الحلقة.');
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
      externalDirectUrl: resolvedJson.externalDirectUrl || null,
      externalDirectMime: resolvedJson.externalDirectMime || 'video/mp4',
      filename: resolvedJson.filename || item.filename,
      sizeBytes: resolvedJson.sizeBytes || null,
      resolvedQuality: resolvedJson.resolvedQuality || actualTier,
      usedFallbackQuality,
      serverName: resolvedJson.serverName || orderedServers[0]?.serverName || null,
    };
  }

  private async processItem(id: string) {
    const item = this.items.find((x) => x.id === id);
    if (!item || item.status !== 'queued') return;

    const controller = new AbortController();
    this.activeControllers.set(id, controller);

    try {
      this.updateItem(id, { status: 'resolving', speedBps: 0, errorMessage: undefined });

      const resolved = await this.resolveEpisodeWithFallback(item, controller.signal);
      if (controller.signal.aborted) return;

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
        await openDownloadManager(
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

      const resp = await fetch(resolveApiUrl(resolved.downloadUrl), {
        credentials: 'include',
        signal: controller.signal,
      });
      const ct = (resp.headers.get('content-type') || '').toLowerCase();
      if (!resp.ok || ct.includes('text/html') || !resp.body) {
        throw new Error('تعذر بدء تنزيل الملف من المصدر، يرجى المحاولة مجدداً.');
      }

      const totalBytes = Number(resp.headers.get('content-length') || resolved.sizeBytes || 0);
      const reader = resp.body.getReader();
      const chunks: BlobPart[] = [];
      let downloaded = 0;
      let lastUpdate = Date.now();
      let lastBytes = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (controller.signal.aborted) {
          try {
            await reader.cancel();
          } catch {}
          return;
        }
        chunks.push(value);
        downloaded += value.byteLength;

        const now = Date.now();
        const dt = now - lastUpdate;
        if (dt >= 350) {
          const speedBps = Math.max(0, Math.round(((downloaded - lastBytes) * 1000) / dt));
          const progress =
            totalBytes > 0 ? Math.min(99, Math.round((downloaded / totalBytes) * 100)) : 0;
          lastUpdate = now;
          lastBytes = downloaded;
          this.updateItem(
            id,
            {
              downloadedBytes: downloaded,
              totalBytes: totalBytes || downloaded,
              progress,
              speedBps,
            },
            false,
          );
        }
      }

      const blob = new Blob(chunks, { type: ct.startsWith('video/') ? ct : 'video/mp4' });
      const storedOffline = await saveBlobOffline(id, blob);

      // Trigger automatic save to user's Downloads folder
      const blobUrl = URL.createObjectURL(blob);
      triggerBrowserBlobSave(blobUrl, resolved.filename);
      setTimeout(() => {
        try {
          URL.revokeObjectURL(blobUrl);
        } catch {}
      }, 60_000);

      this.updateItem(id, {
        status: 'completed',
        progress: 100,
        downloadedBytes: downloaded || blob.size,
        totalBytes: totalBytes || downloaded || blob.size,
        speedBps: 0,
        hasOfflineFile: storedOffline,
      });
    } catch (err: any) {
      if (controller.signal.aborted) {
        return;
      }
      this.updateItem(id, {
        status: 'failed',
        speedBps: 0,
        errorMessage: err?.message || 'تعذر إكمال تنزيل الحلقة، يمكنك إعادة المحاولة.',
      });
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
