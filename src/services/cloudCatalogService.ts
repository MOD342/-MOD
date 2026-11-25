import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { handleFirestoreError, OperationType } from '../firebaseUtils';
import { cleanAnimeTitle } from '../utils/animeTitleCleaner';

// ============================================================================
// Constants & Quotas
// ============================================================================
const IDB_NAME = 'otaku_device_catalog_db';
const IDB_STORE = 'entries';
const WRITE_BUDGET_KEY = 'otaku_cloud_write_budget_v1';
const QUOTA_BREAKER_KEY = 'otaku_cloud_quota_breaker_v1';
const PREF_SERVER_KEY = 'otaku_pref_server_host_v1';
const RECENT_LOCAL_KEY = 'otaku_recent_episodes_device_v1';

const MAX_DAILY_CLOUD_WRITES = 150;
const SEGMENT_CHUNK_SIZE = 350;

export type BundleKind = 'dashboard' | 'manga_hub' | 'movies' | 'top' | 'season' | 'schedule';

export interface CloudCatalogResult<T> {
  data: T;
  source: 'ram' | 'idb' | 'cloud' | 'live';
  isStale: boolean;
  fetchedAt: number;
}

async function safeParseJsonResponse(res: Response | null | undefined): Promise<any | null> {
  if (!res) return null;
  try {
    const text = await res.text();
    if (!text) return null;
    const trimmed = text.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null;
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

export interface RecentEpisodesDeviceState {
  items: any[];
  hasNext: boolean;
  fetchedAt: number;
}

// ============================================================================
// Deterministic Canonical Keys & Safe Firestore Serialization
// ============================================================================

/**
 * Produces an ASCII-safe Firestore document ID strictly matching `^[a-zA-Z0-9_\-]+$` (<= 112 chars).
 */
export function toCanonicalKey(prefix: string, rawId: string | number): string {
  const cleanPrefix = String(prefix || 'item')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '')
    .slice(0, 18) || 'item';

  const normalized = String(rawId || 'unknown').trim().toLowerCase();

  // Dual 32-bit FNV-1a hash (64-bit hex = 16 chars)
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= ch + (i << 1);
    h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
  }
  const hashHex = h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');

  const slug = normalized
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_')
    .slice(0, 64);

  const key = slug ? `${cleanPrefix}_${slug}_${hashHex}` : `${cleanPrefix}_${hashHex}`;
  return key.slice(0, 120);
}

/**
 * Computes a fast deterministic 64-bit hex hash of any JSON-serializable object for deduplicating cloud writes.
 */
export function computeContentHash(val: unknown): string {
  let str = '';
  try {
    str = JSON.stringify(val) || '';
  } catch {
    str = String(val || '');
  }
  let h1 = 0x811c9dc5;
  let h2 = 0x846ca68b;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= ch + ((i & 7) << 2);
    h2 = Math.imul(h2, 0x27d4eb2d) >>> 0;
  }
  return `${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`;
}

/**
 * Strips `undefined`, functions, `NaN`/`Infinity`, and prevents illegal nested arrays-inside-arrays for Firestore.
 */
export function sanitizeFirestoreData<T = any>(value: T, depth = 0): T {
  if (depth > 18) return null as any;
  if (value === null || value === undefined) return null as any;

  const t = typeof value;
  if (t === 'string' || t === 'boolean') return value;
  if (t === 'number') {
    return (Number.isFinite(value as number) ? value : null) as any;
  }
  if (t === 'function' || t === 'symbol' || t === 'bigint') {
    return (t === 'bigint' ? String(value) : null) as any;
  }

  if (Array.isArray(value)) {
    const out: any[] = [];
    for (let i = 0; i < value.length; i++) {
      const item = value[i];
      if (item === undefined || typeof item === 'function' || typeof item === 'symbol') continue;
      if (Array.isArray(item)) {
        // Wrap nested array to prevent Firestore "Nested arrays are not supported" error
        out.push({ items: sanitizeFirestoreData(item, depth + 1) });
      } else {
        out.push(sanitizeFirestoreData(item, depth + 1));
      }
    }
    return out as any;
  }

  if (value instanceof Date) {
    return value.toISOString() as any;
  }

  if (typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value as Record<string, any>)) {
      if (!k || v === undefined || typeof v === 'function' || typeof v === 'symbol') continue;
      out[k] = sanitizeFirestoreData(v, depth + 1);
    }
    return out as T;
  }

  return null as any;
}

// ============================================================================
// Tier 1: Device Memory + IndexedDB Catalog Cache (No 350KB localStorage Cap)
// ============================================================================
interface LocalCatalogRecord<T = any> {
  key: string;
  data: T;
  freshUntil: number;
  staleUntil: number;
  contentHash: string;
  updatedAt: number;
}

const ramCatalog = new Map<string, LocalCatalogRecord>();
const inFlightRequests = new Map<string, Promise<any>>();

function ramGet<T>(key: string): LocalCatalogRecord<T> | null {
  const hit = ramCatalog.get(key);
  if (!hit) return null;
  if (Date.now() > hit.staleUntil) {
    ramCatalog.delete(key);
    return null;
  }
  // LRU bump
  ramCatalog.delete(key);
  ramCatalog.set(key, hit);
  return hit;
}

function ramSet<T>(record: LocalCatalogRecord<T>): void {
  if (ramCatalog.has(record.key)) {
    ramCatalog.delete(record.key);
  } else if (ramCatalog.size >= 250) {
    const oldest = ramCatalog.keys().next().value;
    if (oldest) ramCatalog.delete(oldest);
  }
  ramCatalog.set(record.key, record);
}

let idbInstancePromise: Promise<IDBDatabase | null> | null = null;

function openCatalogDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (idbInstancePromise) return idbInstancePromise;
  idbInstancePromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const database = req.result;
        if (!database.objectStoreNames.contains(IDB_STORE)) {
          database.createObjectStore(IDB_STORE, { keyPath: 'key' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        idbInstancePromise = null;
        resolve(null);
      };
    } catch {
      idbInstancePromise = null;
      resolve(null);
    }
  });
  return idbInstancePromise;
}

async function idbGet<T>(key: string): Promise<LocalCatalogRecord<T> | null> {
  const database = await openCatalogDb();
  if (!database) return null;
  return new Promise((resolve) => {
    try {
      const tx = database.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => {
        const res = req.result as LocalCatalogRecord<T> | undefined;
        if (!res || typeof res.staleUntil !== 'number') {
          resolve(null);
          return;
        }
        if (Date.now() > res.staleUntil) {
          void idbDelete(key);
          resolve(null);
          return;
        }
        ramSet(res);
        resolve(res);
      };
      req.onerror = () => resolve(null);
      tx.onabort = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbSet<T>(record: LocalCatalogRecord<T>): Promise<void> {
  ramSet(record);
  const database = await openCatalogDb();
  if (!database) return;
  return new Promise((resolve) => {
    try {
      const tx = database.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

async function idbDelete(key: string): Promise<void> {
  ramCatalog.delete(key);
  const database = await openCatalogDb();
  if (!database) return;
  return new Promise((resolve) => {
    try {
      const tx = database.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

const MAX_IDB_ENTRIES = 600;
let devicePruneScheduled = false;

export async function pruneExpiredDeviceCatalog(): Promise<number> {
  const database = await openCatalogDb();
  if (!database) return 0;

  return new Promise((resolve) => {
    try {
      const now = Date.now();
      const tx = database.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      const req = store.getAll();
      let deletedCount = 0;

      req.onsuccess = () => {
        const all: LocalCatalogRecord[] = Array.isArray(req.result) ? req.result : [];
        const valid: LocalCatalogRecord[] = [];

        for (const rec of all) {
          if (!rec || !rec.key || typeof rec.staleUntil !== 'number' || now > rec.staleUntil) {
            if (rec?.key) {
              store.delete(rec.key);
              ramCatalog.delete(rec.key);
              deletedCount++;
            }
          } else {
            valid.push(rec);
          }
        }

        if (valid.length > MAX_IDB_ENTRIES) {
          valid.sort((a, b) => Number(a.updatedAt || 0) - Number(b.updatedAt || 0));
          const excess = valid.length - MAX_IDB_ENTRIES;
          for (let i = 0; i < excess; i++) {
            const victim = valid[i];
            if (victim?.key) {
              store.delete(victim.key);
              ramCatalog.delete(victim.key);
              deletedCount++;
            }
          }
        }
      };

      tx.oncomplete = () => resolve(deletedCount);
      tx.onerror = () => resolve(0);
      tx.onabort = () => resolve(0);
    } catch {
      resolve(0);
    }
  });
}

if (typeof window !== 'undefined' && !devicePruneScheduled) {
  devicePruneScheduled = true;
  setTimeout(() => {
    if (typeof (window as any).requestIdleCallback === 'function') {
      (window as any).requestIdleCallback(() => void pruneExpiredDeviceCatalog(), { timeout: 5000 });
    } else {
      void pruneExpiredDeviceCatalog();
    }
  }, 8500);
}

// ============================================================================
// Write Budget, Verified Auth & Quota Protection
// ============================================================================

function getTodayDateStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function isQuotaTripped(): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    const raw = localStorage.getItem(QUOTA_BREAKER_KEY);
    if (!raw) return false;
    const until = Number(raw);
    if (Number.isFinite(until) && Date.now() < until) return true;
    localStorage.removeItem(QUOTA_BREAKER_KEY);
  } catch {}
  return false;
}

function tripQuotaBreaker(hours = 4): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(QUOTA_BREAKER_KEY, String(Date.now() + hours * 3600 * 1000));
  } catch {}
}

function canSpendWriteBudget(): boolean {
  if (isQuotaTripped()) return false;
  try {
    if (typeof localStorage === 'undefined') return true;
    const today = getTodayDateStr();
    const raw = localStorage.getItem(WRITE_BUDGET_KEY);
    if (!raw) return true;
    const parsed = JSON.parse(raw) as { date?: string; count?: number };
    if (parsed?.date !== today) return true;
    return Number(parsed.count || 0) < MAX_DAILY_CLOUD_WRITES;
  } catch {
    return true;
  }
}

function consumeWriteBudget(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const today = getTodayDateStr();
    const raw = localStorage.getItem(WRITE_BUDGET_KEY);
    let count = 0;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.date === today) count = Number(parsed.count || 0);
    }
    localStorage.setItem(WRITE_BUDGET_KEY, JSON.stringify({ date: today, count: count + 1 }));
  } catch {}
}

function canAttemptCloudWrite(): boolean {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return false;
  return canSpendWriteBudget();
}

function isQuotaOrOfflineError(err: unknown): boolean {
  const msg = String((err as any)?.message || err || '').toLowerCase();
  return (
    msg.includes('quota') ||
    msg.includes('resource-exhausted') ||
    msg.includes('offline') ||
    msg.includes('unavailable')
  );
}

function reportCloudErrorSilently(err: unknown, op: OperationType, path: string): void {
  if (isQuotaOrOfflineError(err)) {
    const msg = String((err as any)?.message || err || '').toLowerCase();
    if (msg.includes('quota') || msg.includes('resource-exhausted')) {
      tripQuotaBreaker(6);
    }
    return;
  }
  try {
    handleFirestoreError(err, op, path);
  } catch {
    // Graceful fallback: never crash app UX on background catalog sync errors
  }
}

async function safeCloudGet(collectionName: string, docId: string): Promise<any | null> {
  if (isQuotaTripped()) return null;
  if (!/^[a-zA-Z0-9_\-]+$/.test(docId) || docId.length > 128) return null;
  const path = `${collectionName}/${docId}`;
  try {
    const snap = await getDoc(doc(db, collectionName, docId));
    if (!snap.exists()) return null;
    return snap.data();
  } catch (err) {
    reportCloudErrorSilently(err, OperationType.GET, path);
    return null;
  }
}

async function safeCloudGetSegment(animeKey: string, segId: string): Promise<any | null> {
  if (isQuotaTripped()) return null;
  const path = `catalog_anime/${animeKey}/segments/${segId}`;
  try {
    const snap = await getDoc(doc(db, 'catalog_anime', animeKey, 'segments', segId));
    if (!snap.exists()) return null;
    return snap.data();
  } catch (err) {
    reportCloudErrorSilently(err, OperationType.GET, path);
    return null;
  }
}

async function safeCloudSet(collectionName: string, docId: string, payload: Record<string, any>): Promise<boolean> {
  if (!canAttemptCloudWrite()) return false;
  const uid = auth.currentUser?.uid;
  if (!uid) return false;
  const path = `${collectionName}/${docId}`;
  try {
    consumeWriteBudget();
    await setDoc(doc(db, collectionName, docId), {
      ...payload,
      updatedAt: serverTimestamp(),
      updatedBy: uid,
    });
    return true;
  } catch (err) {
    reportCloudErrorSilently(err, OperationType.WRITE, path);
    return false;
  }
}

async function safeCloudReportFail(collectionName: string, docId: string, currentFailReports: number): Promise<void> {
  if (!canAttemptCloudWrite()) return;
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  const nextCount = Math.min(50, Math.max(1, (Number(currentFailReports) || 0) + 1));
  const path = `${collectionName}/${docId}`;
  try {
    consumeWriteBudget();
    await updateDoc(doc(db, collectionName, docId), {
      failReports: nextCount,
      updatedAt: serverTimestamp(),
      updatedBy: uid,
    });
  } catch (err) {
    reportCloudErrorSilently(err, OperationType.UPDATE, path);
  }
}

// ============================================================================
// Status Helpers (Ongoing vs Completed Adaptive TTLs)
// ============================================================================
function detectIsOngoing(status?: string): boolean {
  const s = String(status || '').toLowerCase();
  if (!s) return true; // Err on shorter TTL when unknown
  return (
    s.includes('يعرض') ||
    s.includes('مستمر') ||
    s.includes('airing') ||
    s.includes('ongoing') ||
    s.includes('releasing') ||
    s.includes('hiatus') ||
    s.includes('upcoming') ||
    s.includes('قادم') ||
    s.includes('لم يُعرض')
  );
}

// ============================================================================
// Domain 1: Public Aggregated Bundles (`catalog_bundles`)
// ============================================================================
export interface GetBundleOptions<T> {
  bundleId: string;
  kind: BundleKind;
  fetchLive: () => Promise<T | null>;
  countItems: (data: T) => number;
  freshTtlMs: number;
  staleTtlMs: number;
  forceRefresh?: boolean;
  onData?: (data: T, source: 'ram' | 'idb' | 'cloud' | 'live') => void;
}

export function peekBundleRam<T>(kind: BundleKind, bundleId: string): T | null {
  const docId = toCanonicalKey(kind, bundleId);
  const localKey = `bundle:${docId}`;
  const hit = ramGet<T>(localKey);
  return hit ? hit.data : null;
}

export async function getBundleWithCloud<T>(opts: GetBundleOptions<T>): Promise<T | null> {
  const docId = toCanonicalKey(opts.kind, opts.bundleId);
  const localKey = `bundle:${docId}`;
  const force = opts.forceRefresh === true;

  // 1. Check Tier 1 (RAM -> IDB) unless forceRefresh
  if (!force) {
    const ramHit = ramGet<T>(localKey);
    if (ramHit && opts.countItems(ramHit.data) > 0) {
      opts.onData?.(ramHit.data, 'ram');
      if (Date.now() < ramHit.freshUntil) {
        return ramHit.data;
      }
      // Stale hit: serve immediately and revalidate in background
      void revalidateBundleInBackground(opts, docId, localKey, ramHit.data);
      return ramHit.data;
    }

    const idbHit = await idbGet<T>(localKey);
    if (idbHit && opts.countItems(idbHit.data) > 0) {
      opts.onData?.(idbHit.data, 'idb');
      if (Date.now() < idbHit.freshUntil) {
        return idbHit.data;
      }
      void revalidateBundleInBackground(opts, docId, localKey, idbHit.data);
      return idbHit.data;
    }
  }

  // Coalesce identical in-flight bundle fetches
  const flightKey = `${localKey}${force ? '::force' : ''}`;
  const existingFlight = inFlightRequests.get(flightKey);
  if (existingFlight) {
    const res = await existingFlight;
    if (res && opts.countItems(res) > 0) opts.onData?.(res, 'cloud');
    return res;
  }

  const run = (async (): Promise<T | null> => {
    // 2. Check Tier 2 (Shared Cloud Firestore) with fast 1.1s race so cold WebChannel never stalls live API
    let cloudDoc: any = null;
    let pendingCloudPromise: Promise<any | null> | undefined;
    if (!force) {
      pendingCloudPromise = safeCloudGet('catalog_bundles', docId);
      const raced = await Promise.race([
        pendingCloudPromise,
        new Promise<'__timeout__'>((resolve) => setTimeout(() => resolve('__timeout__'), 1100)),
      ]);
      if (raced !== '__timeout__') {
        cloudDoc = raced;
      }
      if (cloudDoc && cloudDoc.payload && Number(cloudDoc.itemCount) > 0) {
        const cloudData = (
          '__wrappedList' in cloudDoc.payload && Array.isArray(cloudDoc.payload.items)
            ? cloudDoc.payload.items
            : cloudDoc.payload
        ) as T;

        if (opts.countItems(cloudData) > 0) {
          const now = Date.now();
          const freshUntil = Number(cloudDoc.freshUntil) || now + opts.freshTtlMs;
          const staleUntil = Number(cloudDoc.staleUntil) || now + opts.staleTtlMs;
          const record: LocalCatalogRecord<T> = {
            key: localKey,
            data: cloudData,
            freshUntil,
            staleUntil,
            contentHash: String(cloudDoc.contentHash || ''),
            updatedAt: now,
          };
          await idbSet(record);
          opts.onData?.(cloudData, 'cloud');

          // If cloud doc is within fresh window and not flagged broken, stop here (ZERO backend calls!)
          if (now < freshUntil && Number(cloudDoc.failReports || 0) === 0) {
            return cloudData;
          }
          // Otherwise stale cloud doc -> refresh silently from live in background
          void fetchLiveAndSyncBundle(opts, docId, localKey, cloudDoc);
          return cloudData;
        }
      }
    }

    // 3. Tier 3: Live Server Fetch & Write-Back
    return await fetchLiveAndSyncBundle(
      opts,
      docId,
      localKey,
      cloudDoc,
      cloudDoc ? undefined : pendingCloudPromise,
    );
  })();

  inFlightRequests.set(flightKey, run);
  try {
    return await run;
  } finally {
    inFlightRequests.delete(flightKey);
  }
}

async function revalidateBundleInBackground<T>(
  opts: GetBundleOptions<T>,
  docId: string,
  localKey: string,
  _cached: T,
): Promise<void> {
  const flightKey = `bg:${localKey}`;
  if (inFlightRequests.has(flightKey)) return;
  const p = (async () => {
    const cloudDoc = await safeCloudGet('catalog_bundles', docId);
    const now = Date.now();
    if (
      cloudDoc &&
      cloudDoc.payload &&
      Number(cloudDoc.itemCount) > 0 &&
      now < Number(cloudDoc.freshUntil || 0) &&
      Number(cloudDoc.failReports || 0) === 0
    ) {
      const cloudData = (
        '__wrappedList' in cloudDoc.payload && Array.isArray(cloudDoc.payload.items)
          ? cloudDoc.payload.items
          : cloudDoc.payload
      ) as T;
      if (opts.countItems(cloudData) > 0) {
        await idbSet({
          key: localKey,
          data: cloudData,
          freshUntil: Number(cloudDoc.freshUntil),
          staleUntil: Number(cloudDoc.staleUntil),
          contentHash: String(cloudDoc.contentHash || ''),
          updatedAt: now,
        });
        opts.onData?.(cloudData, 'cloud');
        return;
      }
    }
    await fetchLiveAndSyncBundle(opts, docId, localKey, cloudDoc);
  })();
  inFlightRequests.set(flightKey, p);
  try {
    await p;
  } finally {
    inFlightRequests.delete(flightKey);
  }
}

async function fetchLiveAndSyncBundle<T>(
  opts: GetBundleOptions<T>,
  docId: string,
  localKey: string,
  existingCloudDoc: any | null,
  pendingCloudPromise?: Promise<any | null>,
): Promise<T | null> {
  try {
    const liveData = await opts.fetchLive();
    if (!liveData) return null;
    const itemCount = opts.countItems(liveData);
    if (itemCount <= 0) return null;

    const now = Date.now();
    const sanitizedRaw = sanitizeFirestoreData(liveData);
    const payloadMap = Array.isArray(sanitizedRaw)
      ? { __wrappedList: true, items: sanitizedRaw.slice(0, 2000) }
      : (sanitizedRaw as Record<string, any>);

    const hash = computeContentHash(payloadMap);
    const freshUntil = now + opts.freshTtlMs;
    const staleUntil = now + opts.staleTtlMs;

    await idbSet({
      key: localKey,
      data: liveData,
      freshUntil,
      staleUntil,
      contentHash: hash,
      updatedAt: now,
    });
    opts.onData?.(liveData, 'live');

    // Sync to shared cloud in background (resolve pending read if raced so we never write duplicates)
    void (async () => {
      try {
        const resolvedCloudDoc =
          existingCloudDoc ?? (pendingCloudPromise ? await pendingCloudPromise.catch(() => null) : null);
        const prevHash = resolvedCloudDoc?.contentHash;
        const prevFreshUntil = Number(resolvedCloudDoc?.freshUntil || 0);
        const prevFail = Number(resolvedCloudDoc?.failReports || 0);
        const shouldWriteCloud =
          !resolvedCloudDoc ||
          (canAttemptCloudWrite() &&
            (prevFail >= 1 || now >= prevFreshUntil) &&
            (hash !== prevHash || prevFail >= 1));

        if (shouldWriteCloud && itemCount <= 2000) {
          const estSize = JSON.stringify(payloadMap).length;
          if (estSize < 850_000) {
            void safeCloudSet('catalog_bundles', docId, {
              bundleId: docId,
              kind: opts.kind,
              payload: payloadMap,
              itemCount,
              contentHash: hash,
              freshUntil,
              staleUntil,
              failReports: 0,
            });
          }
        }
      } catch {}
    })();

    return liveData;
  } catch {
    return null;
  }
}

// ============================================================================
// Domain 2: Unified Anime Details + Episodes Segmentation (`catalog_anime`)
// ============================================================================
function compactAnimeForCloud(anime: any): Record<string, any> {
  const sanitized = sanitizeFirestoreData(anime) || {};
  // Keep top fields lean; episodes are stored compactly (or segmented)
  if (Array.isArray(sanitized.episodes)) {
    sanitized.episodes = sanitized.episodes.map((ep: any, idx: number) => ({
      id: String(ep?.id || ep?.link || `${idx + 1}`),
      link: ep?.link ? String(ep.link) : undefined,
      num: ep?.num !== undefined ? ep.num : idx + 1,
      title: ep?.title ? String(ep.title).slice(0, 180) : undefined,
      seasonNumber: ep?.seasonNumber !== undefined ? Number(ep.seasonNumber) : undefined,
      isFiller: ep?.isFiller ? true : undefined,
    }));
  }
  return sanitizeFirestoreData(sanitized);
}

export async function getAnimeDetailsWithCloud(
  id: string,
  options?: {
    forceRefresh?: boolean;
    onData?: (data: any, source: 'ram' | 'idb' | 'cloud' | 'live') => void;
    onError?: (err: unknown) => void;
  },
): Promise<any | null> {
  if (!id || id === 'random' || id === 'unknown') return null;

  const docId = toCanonicalKey('anime', id);
  const localKey = `anime_v2:${docId}`;
  const force = options?.forceRefresh === true;

  if (!force) {
    const ramHit = ramGet<any>(localKey);
    if (ramHit?.data) {
      options?.onData?.(ramHit.data, 'ram');
      if (Date.now() < ramHit.freshUntil && Number(ramHit.data.relatedGraphVersion || 0) >= 2) {
        return ramHit.data;
      }
      void syncAnimeBackground(id, docId, localKey, options?.onData);
      return ramHit.data;
    }

    const idbHit = await idbGet<any>(localKey);
    if (idbHit?.data) {
      options?.onData?.(idbHit.data, 'idb');
      if (Date.now() < idbHit.freshUntil && Number(idbHit.data.relatedGraphVersion || 0) >= 2) {
        return idbHit.data;
      }
      void syncAnimeBackground(id, docId, localKey, options?.onData);
      return idbHit.data;
    }
  }

  const flightKey = `${localKey}${force ? '::force' : ''}`;
  const existingFlight = inFlightRequests.get(flightKey);
  if (existingFlight) {
    const d = await existingFlight;
    if (d) options?.onData?.(d, 'cloud');
    return d;
  }

  const run = (async (): Promise<any | null> => {
    let cloudDoc: any = null;
    if (!force) {
      cloudDoc = await safeCloudGet('catalog_anime', docId);
      if (cloudDoc && cloudDoc.data && (cloudDoc.data.title || cloudDoc.data._id)) {
        const assembled = await reassembleAnimeFromCloudDoc(docId, cloudDoc);
        if (assembled) {
          const now = Date.now();
          const freshUntil = Number(cloudDoc.freshUntil) || now + 3 * 3600 * 1000;
          const staleUntil = Number(cloudDoc.staleUntil) || now + 7 * 24 * 3600 * 1000;
          const hasV2Graph = Number(assembled.relatedGraphVersion || 0) >= 2;
          if (hasV2Graph) {
            await idbSet({
              key: localKey,
              data: assembled,
              freshUntil,
              staleUntil,
              contentHash: String(cloudDoc.contentHash || ''),
              updatedAt: now,
            });
          }
          options?.onData?.(assembled, 'cloud');
          if (hasV2Graph && now < freshUntil && Number(cloudDoc.failReports || 0) === 0) {
            return assembled;
          }
          // Stale cloud entry or pre-v2 relations graph -> refresh silently in background
          void fetchLiveAnimeAndSync(id, docId, localKey, cloudDoc, force, options?.onData);
          return assembled;
        }
      }
    }

    return await fetchLiveAnimeAndSync(id, docId, localKey, cloudDoc, force, options?.onData, options?.onError);
  })();

  inFlightRequests.set(flightKey, run);
  try {
    return await run;
  } finally {
    inFlightRequests.delete(flightKey);
  }
}

async function reassembleAnimeFromCloudDoc(animeKey: string, cloudDoc: any): Promise<any | null> {
  const baseData = { ...cloudDoc.data };
  const segmentsCount = Number(cloudDoc.segmentsCount || 0);
  if (segmentsCount > 0) {
    const segPromises: Promise<any>[] = [];
    for (let i = 0; i < Math.min(segmentsCount, 40); i++) {
      segPromises.push(safeCloudGetSegment(animeKey, `seg_${i}`));
    }
    const segDocs = await Promise.all(segPromises);
    const mergedEps: any[] = [];
    for (const s of segDocs) {
      if (s && Array.isArray(s.episodes)) {
        mergedEps.push(...s.episodes);
      }
    }
    if (mergedEps.length > 0) {
      baseData.episodes = mergedEps;
    }
  }
  return baseData;
}

async function syncAnimeBackground(
  rawId: string,
  docId: string,
  localKey: string,
  onData?: (data: any, source: 'ram' | 'idb' | 'cloud' | 'live') => void,
): Promise<void> {
  const bgKey = `bg:${localKey}`;
  if (inFlightRequests.has(bgKey)) return;
  const p = (async () => {
    const cloudDoc = await safeCloudGet('catalog_anime', docId);
    const now = Date.now();
    if (
      cloudDoc?.data &&
      now < Number(cloudDoc.freshUntil || 0) &&
      Number(cloudDoc.failReports || 0) === 0
    ) {
      const assembled = await reassembleAnimeFromCloudDoc(docId, cloudDoc);
      if (assembled && Number(assembled.relatedGraphVersion || 0) >= 2) {
        await idbSet({
          key: localKey,
          data: assembled,
          freshUntil: Number(cloudDoc.freshUntil),
          staleUntil: Number(cloudDoc.staleUntil),
          contentHash: String(cloudDoc.contentHash || ''),
          updatedAt: now,
        });
        onData?.(assembled, 'cloud');
        return;
      }
    }
    await fetchLiveAnimeAndSync(rawId, docId, localKey, cloudDoc, false, onData);
  })();
  inFlightRequests.set(bgKey, p);
  try {
    await p;
  } finally {
    inFlightRequests.delete(bgKey);
  }
}

async function fetchLiveAnimeAndSync(
  rawId: string,
  docId: string,
  localKey: string,
  existingCloudDoc: any | null,
  forceRefresh: boolean,
  onData?: (data: any, source: 'ram' | 'idb' | 'cloud' | 'live') => void,
  onError?: (err: unknown) => void,
): Promise<any | null> {
  try {
    const qs = forceRefresh ? `?bypass=true&_t=${Date.now()}` : '';
    const res = await fetch(`/api/anime/details/${encodeURIComponent(rawId)}${qs}`, {
      cache: forceRefresh ? 'no-store' : 'default',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await safeParseJsonResponse(res);
    const data = json?.data;
    if (!json?.success || !data || (!data.title && !data._id)) {
      throw new Error(json?.message || 'Empty anime details');
    }

    const isOngoing = detectIsOngoing(data.status);
    const freshTtl = isOngoing ? 3 * 3600 * 1000 : 21 * 24 * 3600 * 1000;
    const staleTtl = isOngoing ? 7 * 24 * 3600 * 1000 : 45 * 24 * 3600 * 1000;
    const now = Date.now();
    const freshUntil = now + freshTtl;
    const staleUntil = now + staleTtl;

    await idbSet({
      key: localKey,
      data,
      freshUntil,
      staleUntil,
      contentHash: computeContentHash(data),
      updatedAt: now,
    });
    onData?.(data, 'live');

    // Also store under resolved _id / malId alias locally if different
    if (data._id && String(data._id) !== String(rawId)) {
      const aliasKey = `anime_v2:${toCanonicalKey('anime', String(data._id))}`;
      void idbSet({
        key: aliasKey,
        data,
        freshUntil,
        staleUntil,
        contentHash: computeContentHash(data),
        updatedAt: now,
      });
    }

    void syncCompactAnimeToCloud(docId, data, isOngoing, freshUntil, staleUntil, existingCloudDoc);
    return data;
  } catch (err) {
    onError?.(err);
    return null;
  }
}

async function syncCompactAnimeToCloud(
  docId: string,
  data: any,
  isOngoing: boolean,
  freshUntil: number,
  staleUntil: number,
  existingCloudDoc: any | null,
): Promise<void> {
  if (!canAttemptCloudWrite()) return;
  const uid = auth.currentUser?.uid;
  if (!uid) return;

  const compacted = compactAnimeForCloud(data);
  const allEpisodes: any[] = Array.isArray(compacted.episodes) ? compacted.episodes : [];
  const episodesCount = allEpisodes.length;
  const hash = computeContentHash(compacted);
  const now = Date.now();

  const canOverwrite =
    !existingCloudDoc ||
    Number(existingCloudDoc.failReports || 0) >= 1 ||
    now >= Number(existingCloudDoc.freshUntil || 0) ||
    episodesCount >= Number(existingCloudDoc.episodesCount || 0);

  if (!canOverwrite) return;
  if (existingCloudDoc && existingCloudDoc.contentHash === hash && Number(existingCloudDoc.failReports || 0) === 0) {
    return;
  }

  let segmentsCount = 0;
  let mainData = compacted;
  const segmentChunks: any[][] = [];

  if (episodesCount > SEGMENT_CHUNK_SIZE) {
    for (let i = 0; i < allEpisodes.length; i += SEGMENT_CHUNK_SIZE) {
      segmentChunks.push(allEpisodes.slice(i, i + SEGMENT_CHUNK_SIZE));
    }
    segmentsCount = segmentChunks.length;
    mainData = { ...compacted, episodes: [] };
  }

  const mainOk = await safeCloudSet('catalog_anime', docId, {
    canonicalId: docId,
    data: mainData,
    episodesCount,
    segmentsCount,
    isOngoing,
    contentHash: hash,
    freshUntil,
    staleUntil,
    failReports: 0,
  });

  if (mainOk && segmentsCount > 0) {
    for (let i = 0; i < segmentChunks.length; i++) {
      if (!canAttemptCloudWrite()) break;
      const segId = `seg_${i}`;
      try {
        consumeWriteBudget();
        await setDoc(doc(db, 'catalog_anime', docId, 'segments', segId), {
          parentKey: docId,
          segmentIndex: i,
          episodes: segmentChunks[i],
          updatedAt: serverTimestamp(),
          updatedBy: uid,
        });
      } catch (err) {
        reportCloudErrorSilently(err, OperationType.WRITE, `catalog_anime/${docId}/segments/${segId}`);
      }
    }
  }
}

/**
 * Updates cached Arabic description on both Device IDB & Cloud when translated after initial fetch.
 */
export async function updateCachedAnimeSynopsis(rawId: string, translatedDesc: string): Promise<void> {
  if (!rawId || !translatedDesc || !/[\u0600-\u06FF]/.test(translatedDesc)) return;
  const docId = toCanonicalKey('anime', rawId);
  const localKey = `anime_v2:${docId}`;
  const existingLocal = ramGet<any>(localKey) || (await idbGet<any>(localKey));
  if (existingLocal?.data) {
    const updated = { ...existingLocal.data, description: translatedDesc };
    await idbSet({
      ...existingLocal,
      data: updated,
      contentHash: computeContentHash(updated),
      updatedAt: Date.now(),
    });
  }
}

// ============================================================================
// Domain 3: Unified Manga & Chapters (`catalog_manga`)
// ============================================================================
const MANGA_CLOUD_SCHEMA_VERSION = 4;

function isMangaCacheIncomplete(details: any, chapters: any[], cloudData?: any): boolean {
  if (!Array.isArray(chapters) || chapters.length === 0) return true;
  if (cloudData && Number(cloudData?.schemaVersion || 0) < MANGA_CLOUD_SCHEMA_VERSION) {
    return true;
  }
  const expected = Number(details?.chaptersCount || 0);
  if (expected >= 15 && chapters.length < Math.floor(expected * 0.72)) {
    return true;
  }
  const positiveNums = chapters
    .map((c) => Number(c?.chapterNumber))
    .filter((n) => Number.isFinite(n) && n >= 0);
  if (chapters.length >= 10 && positiveNums.length > 0 && Math.min(...positiveNums) > 3) {
    return true;
  }
  return false;
}

function compactMangaPayload(details: any, chapters: any[]): Record<string, any> {
  const cleanDetails = sanitizeFirestoreData(details) || {};
  const compactChapters = (Array.isArray(chapters) ? chapters : []).slice(0, 5000).map((ch: any) => ({
    id: String(ch?.id || ''),
    num: ch?.num !== undefined ? String(ch.num) : '1',
    chapterNumber: Number(ch?.chapterNumber || 0),
    title: ch?.title ? String(ch.title).slice(0, 140) : undefined,
    pagesCount: ch?.pagesCount ? Number(ch.pagesCount) : undefined,
    language: ch?.language ? String(ch.language).slice(0, 16) : undefined,
    publishedAt: ch?.publishedAt ? String(ch.publishedAt).slice(0, 40) : undefined,
  }));
  return sanitizeFirestoreData({
    schemaVersion: MANGA_CLOUD_SCHEMA_VERSION,
    details: cleanDetails,
    chapters: compactChapters,
  });
}

export async function getMangaWithCloud(
  mangaId: string,
  options?: {
    forceRefresh?: boolean;
    onDetails?: (details: any, source: 'ram' | 'idb' | 'cloud' | 'live') => void;
    onChapters?: (chapters: any[], mangadexId?: string, source?: string) => void;
    onError?: () => void;
  },
): Promise<{ details: any | null; chapters: any[] }> {
  const docId = toCanonicalKey('mangav3', mangaId);
  const localKey = `manga_v7:${docId}`;
  const force = options?.forceRefresh === true;

  if (force) {
    await idbDelete(localKey);
  } else {
    const localHit =
      ramGet<{ details: any; chapters: any[] }>(localKey) ||
      (await idbGet<{ details: any; chapters: any[] }>(localKey));
    if (localHit?.data?.details) {
      const cachedChapters = Array.isArray(localHit.data.chapters) ? localHit.data.chapters : [];
      const incomplete = isMangaCacheIncomplete(localHit.data.details, cachedChapters);
      options?.onDetails?.(localHit.data.details, ramCatalog.has(localKey) ? 'ram' : 'idb');
      if (cachedChapters.length > 0) {
        options?.onChapters?.(cachedChapters, localHit.data.details.mangadexId, 'local');
        if (!incomplete && Date.now() < localHit.freshUntil) {
          return localHit.data;
        }
        const safeKnownDetails = incomplete
          ? { ...localHit.data.details, mangadexId: undefined }
          : localHit.data.details;
        // Stale or incomplete local entry -> revalidate in background
        void fetchLiveMangaAndSync(mangaId, docId, localKey, null, incomplete, options, safeKnownDetails);
        return localHit.data;
      }
      // Cached entry had 0 chapters -> NEVER return empty synchronously; await live chapter fetch
      return await fetchLiveMangaAndSync(mangaId, docId, localKey, null, false, options, localHit.data.details);
    }
  }

  let cloudDoc: any = null;
  if (!force) {
    cloudDoc = await safeCloudGet('catalog_manga', docId);
    if (cloudDoc?.data?.details) {
      const details = cloudDoc.data.details;
      const chapters = Array.isArray(cloudDoc.data.chapters) ? cloudDoc.data.chapters : [];
      const now = Date.now();
      const freshUntil = Number(cloudDoc.freshUntil) || now + 2 * 3600 * 1000;
      const staleUntil = Number(cloudDoc.staleUntil) || now + 14 * 24 * 3600 * 1000;
      const incomplete = isMangaCacheIncomplete(details, chapters, cloudDoc.data);

      if (chapters.length > 0) {
        if (!incomplete) {
          await idbSet({
            key: localKey,
            data: { details, chapters },
            freshUntil,
            staleUntil,
            contentHash: String(cloudDoc.contentHash || ''),
            updatedAt: now,
          });
        }
        options?.onDetails?.(details, 'cloud');
        options?.onChapters?.(chapters, details.mangadexId, 'cloud');
        if (!incomplete && now < freshUntil && Number(cloudDoc.failReports || 0) === 0) {
          return { details, chapters };
        }
      } else {
        options?.onDetails?.(details, 'cloud');
      }

      // If details arrived from cloud but chapters missing, stale, or incomplete -> fetch live (re-resolving details/UUID when incomplete)
      const safeKnownDetails = incomplete ? undefined : details;
      return await fetchLiveMangaAndSync(mangaId, docId, localKey, cloudDoc, incomplete || force, options, safeKnownDetails);
    }
  }

  return await fetchLiveMangaAndSync(mangaId, docId, localKey, cloudDoc, force, options);
}

async function fetchLiveMangaAndSync(
  mangaId: string,
  docId: string,
  localKey: string,
  existingCloudDoc: any | null,
  force: boolean,
  options?: {
    onDetails?: (details: any, source: 'ram' | 'idb' | 'cloud' | 'live') => void;
    onChapters?: (chapters: any[], mangadexId?: string, source?: string) => void;
    onError?: () => void;
  },
  knownDetails?: any,
): Promise<{ details: any | null; chapters: any[] }> {
  try {
    let details = knownDetails || null;
    if (!details || force) {
      try {
        const res = await fetch(
          `/api/manga/details/${encodeURIComponent(String(mangaId))}${force ? `?refresh=1&_t=${Date.now()}` : ''}`,
          force ? { cache: 'no-store' } : undefined,
        );
        const json = await safeParseJsonResponse(res);
        if (res.ok && json?.success && json?.data) {
          details = json.data;
          options?.onDetails?.(details, 'live');
        }
      } catch {}
      if (!details) {
        options?.onError?.();
        return { details: null, chapters: [] };
      }
    }

    const qs = new URLSearchParams({
      mangaId: String(details._id || mangaId),
      title: String(details.englishTitle || details.title || ''),
    });
    if (details.mangadexId) qs.set('mangadexId', String(details.mangadexId));
    if (details.romajiTitle) qs.set('altTitle', String(details.romajiTitle));
    if (Array.isArray(details.synonyms) && details.synonyms.length > 0) {
      const usableSyns = details.synonyms
        .filter((s: any) => typeof s === 'string' && /[a-zA-Z0-9\u0600-\u06FF]/.test(s))
        .slice(0, 8);
      if (usableSyns.length > 0) qs.set('synonyms', usableSyns.join('||'));
    }
    if (force) {
      qs.set('refresh', '1');
      qs.set('_t', String(Date.now()));
    }

    const chRes = await fetch(`/api/manga/chapters?${qs.toString()}`, force ? { cache: 'no-store' } : undefined);
    const chJson = await safeParseJsonResponse(chRes);
    const chapters: any[] = chJson?.success && Array.isArray(chJson.chapters) ? chJson.chapters : [];
    const resolvedMdId = chJson?.mangadexId || details.mangadexId;
    if (resolvedMdId && details.mangadexId !== resolvedMdId) {
      details = { ...details, mangadexId: resolvedMdId };
    }
    options?.onChapters?.(chapters, resolvedMdId, 'live');

    if (chapters.length === 0) {
      return { details, chapters: [] };
    }

    const isOngoing = detectIsOngoing(details.status);
    const now = Date.now();
    const freshTtl = isOngoing ? 2 * 3600 * 1000 : 14 * 24 * 3600 * 1000;
    const staleTtl = isOngoing ? 7 * 24 * 3600 * 1000 : 30 * 24 * 3600 * 1000;
    const freshUntil = now + freshTtl;
    const staleUntil = now + staleTtl;

    const bundled = { details, chapters };
    await idbSet({
      key: localKey,
      data: bundled,
      freshUntil,
      staleUntil,
      contentHash: computeContentHash(bundled),
      updatedAt: now,
    });

    if (chapters.length > 0) {
      const compactData = compactMangaPayload(details, chapters);
      const hash = computeContentHash(compactData);
      const prevCount = Number(existingCloudDoc?.chaptersCount || 0);
      const prevFail = Number(existingCloudDoc?.failReports || 0);
      const prevFresh = Number(existingCloudDoc?.freshUntil || 0);
      const prevSchema = Number(existingCloudDoc?.data?.schemaVersion || 0);
      const canWrite =
        !existingCloudDoc ||
        (canAttemptCloudWrite() &&
          (prevSchema < MANGA_CLOUD_SCHEMA_VERSION ||
            prevFail >= 1 ||
            now >= prevFresh ||
            chapters.length >= prevCount) &&
          hash !== existingCloudDoc?.contentHash);

      if (canWrite && JSON.stringify(compactData).length < 850_000) {
        void safeCloudSet('catalog_manga', docId, {
          canonicalId: docId,
          data: compactData,
          chaptersCount: chapters.length,
          isOngoing,
          contentHash: hash,
          freshUntil,
          staleUntil,
          failReports: 0,
        });
      }
    }

    return bundled;
  } catch {
    if (!knownDetails) options?.onError?.();
    return { details: knownDetails || null, chapters: [] };
  }
}

export async function getMangaChaptersOnlyWithCloud(
  manga: any,
): Promise<any[]> {
  const mangaId = String(manga?._id || manga?.id || '');
  if (!mangaId) return [];
  const docId = toCanonicalKey('mangav3', mangaId);
  const localKey = `manga_v7:${docId}`;

  const localHit =
    ramGet<{ details: any; chapters: any[] }>(localKey) ||
    (await idbGet<{ details: any; chapters: any[] }>(localKey));
  if (localHit?.data?.chapters?.length && !isMangaCacheIncomplete(localHit.data.details || manga, localHit.data.chapters)) {
    return localHit.data.chapters;
  }

  const cloudDoc = await safeCloudGet('catalog_manga', docId);
  if (
    cloudDoc?.data?.chapters?.length &&
    !isMangaCacheIncomplete(cloudDoc.data.details || manga, cloudDoc.data.chapters, cloudDoc.data)
  ) {
    return cloudDoc.data.chapters;
  }

  const qs = new URLSearchParams({
    mangaId,
    title: String(manga.englishTitle || manga.title || ''),
  });
  if (manga.romajiTitle) qs.set('altTitle', String(manga.romajiTitle));
  if (Array.isArray(manga.synonyms) && manga.synonyms.length > 0) {
    const usableSyns = manga.synonyms
      .filter((s: any) => typeof s === 'string' && /[a-zA-Z0-9\u0600-\u06FF]/.test(s))
      .slice(0, 8);
    if (usableSyns.length > 0) qs.set('synonyms', usableSyns.join('||'));
  }
  const res = await fetch(`/api/manga/chapters?${qs.toString()}`)
    .then((r) => safeParseJsonResponse(r))
    .catch(() => null);
  return Array.isArray(res?.chapters) ? res.chapters : [];
}

// ============================================================================
// Domain 4: Manga Chapter Pages Manifest + Self-Healing (`catalog_chapter_pages`)
// ============================================================================
export interface ChapterPageEntry {
  index: number;
  url: string;
  fallbackUrl?: string;
}

export async function getChapterPagesWithCloud(
  chapterId: string,
  mangaId?: string,
  quality: 'high' | 'saver' = 'high',
  forceRefresh = false,
): Promise<ChapterPageEntry[]> {
  if (!chapterId) return [];
  const chapterKey = toCanonicalKey('chv2', `${chapterId}_${quality}`);
  const mangaKey = toCanonicalKey('mangav2', mangaId || 'unknown');
  const localKey = `chpages_v2:${chapterKey}`;

  if (!forceRefresh) {
    const localHit = ramGet<ChapterPageEntry[]>(localKey) || (await idbGet<ChapterPageEntry[]>(localKey));
    if (localHit?.data?.length && Date.now() < localHit.freshUntil) {
      return localHit.data;
    }

    const cloudDoc = await safeCloudGet('catalog_chapter_pages', chapterKey);
    if (
      cloudDoc &&
      Array.isArray(cloudDoc.pages) &&
      cloudDoc.pages.length > 0 &&
      Number(cloudDoc.failReports || 0) === 0
    ) {
      const now = Date.now();
      const freshUntil = Number(cloudDoc.freshUntil) || now + 7 * 24 * 3600 * 1000;
      const staleUntil = Number(cloudDoc.staleUntil) || now + 30 * 24 * 3600 * 1000;
      await idbSet({
        key: localKey,
        data: cloudDoc.pages,
        freshUntil,
        staleUntil,
        contentHash: String(cloudDoc.contentHash || ''),
        updatedAt: now,
      });
      return cloudDoc.pages;
    }
  }

  const res = await fetch(
    `/api/manga/pages?chapterId=${encodeURIComponent(String(chapterId))}&quality=${quality}${forceRefresh ? `&_t=${Date.now()}` : ''}`,
    { cache: forceRefresh ? 'no-store' : 'default' },
  );
  const json = await safeParseJsonResponse(res);
  const pages: ChapterPageEntry[] = json?.success && Array.isArray(json.data?.pages) ? json.data.pages : [];
  if (pages.length === 0) return [];

  const sanitizedPages = sanitizeFirestoreData(
    pages.slice(0, 500).map((p, idx) => ({
      index: Number(p.index || idx + 1),
      url: String(p.url || ''),
      ...(p.fallbackUrl ? { fallbackUrl: String(p.fallbackUrl) } : {}),
    })),
  );

  const now = Date.now();
  const freshUntil = now + 7 * 24 * 3600 * 1000;
  const staleUntil = now + 30 * 24 * 3600 * 1000;
  const hash = computeContentHash(sanitizedPages);

  await idbSet({
    key: localKey,
    data: sanitizedPages,
    freshUntil,
    staleUntil,
    contentHash: hash,
    updatedAt: now,
  });

  if (canAttemptCloudWrite()) {
    void safeCloudSet('catalog_chapter_pages', chapterKey, {
      chapterKey,
      mangaKey,
      pages: sanitizedPages,
      pagesCount: sanitizedPages.length,
      source: String(json?.data?.source || (chapterId.startsWith('azora::') ? 'azoramoon' : 'mangadex')).slice(0, 60),
      contentHash: hash,
      freshUntil,
      staleUntil,
      failReports: 0,
    });
  }

  return sanitizedPages;
}

export async function tryReadChapterPagesCacheOrCloud(
  chapterId: string,
  quality: 'high' | 'saver' = 'high',
): Promise<ChapterPageEntry[] | null> {
  if (!chapterId) return null;
  const chapterKey = toCanonicalKey('chv2', `${chapterId}_${quality}`);
  const localKey = `chpages_v2:${chapterKey}`;

  const localHit = ramGet<ChapterPageEntry[]>(localKey) || (await idbGet<ChapterPageEntry[]>(localKey));
  if (localHit?.data?.length && Date.now() < localHit.freshUntil) {
    return localHit.data;
  }

  const cloudDoc = await safeCloudGet('catalog_chapter_pages', chapterKey);
  if (
    cloudDoc &&
    Array.isArray(cloudDoc.pages) &&
    cloudDoc.pages.length > 0 &&
    Number(cloudDoc.failReports || 0) === 0
  ) {
    const now = Date.now();
    const freshUntil = Number(cloudDoc.freshUntil) || now + 7 * 24 * 3600 * 1000;
    const staleUntil = Number(cloudDoc.staleUntil) || now + 30 * 24 * 3600 * 1000;
    await idbSet({
      key: localKey,
      data: cloudDoc.pages,
      freshUntil,
      staleUntil,
      contentHash: String(cloudDoc.contentHash || ''),
      updatedAt: now,
    });
    return cloudDoc.pages;
  }

  return null;
}

export async function cacheResolvedChapterPages(
  chapterId: string,
  mangaId: string | undefined,
  quality: 'high' | 'saver',
  pages: ChapterPageEntry[],
  sourceName?: string,
): Promise<void> {
  if (!chapterId || !Array.isArray(pages) || pages.length === 0) return;
  const chapterKey = toCanonicalKey('chv2', `${chapterId}_${quality}`);
  const mangaKey = toCanonicalKey('mangav2', mangaId || 'unknown');
  const localKey = `chpages_v2:${chapterKey}`;

  const sanitizedPages = sanitizeFirestoreData(
    pages.slice(0, 500).map((p, idx) => ({
      index: Number(p.index || idx + 1),
      url: String(p.url || ''),
      ...(p.fallbackUrl ? { fallbackUrl: String(p.fallbackUrl) } : {}),
    })),
  );

  const now = Date.now();
  const freshUntil = now + 7 * 24 * 3600 * 1000;
  const staleUntil = now + 30 * 24 * 3600 * 1000;
  const hash = computeContentHash(sanitizedPages);

  await idbSet({
    key: localKey,
    data: sanitizedPages,
    freshUntil,
    staleUntil,
    contentHash: hash,
    updatedAt: now,
  });

  if (canAttemptCloudWrite()) {
    void safeCloudSet('catalog_chapter_pages', chapterKey, {
      chapterKey,
      mangaKey,
      pages: sanitizedPages,
      pagesCount: sanitizedPages.length,
      source: String(sourceName || (chapterId.startsWith('azora::') ? 'azoramoon' : 'mangadex')).slice(0, 60),
      contentHash: hash,
      freshUntil,
      staleUntil,
      failReports: 0,
    });
  }
}

export async function reportBrokenChapterPages(
  chapterId: string,
  quality: 'high' | 'saver' = 'high',
): Promise<void> {
  if (!chapterId) return;
  const chapterKey = toCanonicalKey('chv2', `${chapterId}_${quality}`);
  await idbDelete(`chpages_v2:${chapterKey}`);
  const existing = await safeCloudGet('catalog_chapter_pages', chapterKey);
  if (existing) {
    await safeCloudReportFail('catalog_chapter_pages', chapterKey, Number(existing.failReports || 0));
  }
}

// ============================================================================
// Domain 5: Crowd-Scored Episode Server Intelligence (`server_intelligence`)
// ============================================================================
function extractHostKey(urlOrName: string): string {
  try {
    const u = new URL(urlOrName);
    return u.hostname.replace(/^www\./, '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48);
  } catch {
    return String(urlOrName || 'srv').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48) || 'srv';
  }
}

export function getPreferredServerHost(): string | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(PREF_SERVER_KEY) : null;
  } catch {
    return null;
  }
}

export function setPreferredServerHost(url: string): void {
  try {
    if (typeof localStorage !== 'undefined' && url) {
      localStorage.setItem(PREF_SERVER_KEY, extractHostKey(url));
    }
  } catch {}
}

function isMultiQualityWatchServer(srv: any): boolean {
  if (!srv || srv.category === 'download') return false;
  const h = `${srv.serverName || ''} ${srv.url || ''}`.toLowerCase();
  return (
    h.includes('vk video') ||
    h.includes('vk.com') ||
    h.includes('vkvideo') ||
    h.includes('ok.ru') ||
    h.includes('dailymotion') ||
    h.includes('videa') ||
    h.includes('megamax') ||
    h.includes('share4max')
  );
}

function getBaseServerPriority(srv: any): number {
  const n = (srv?.serverName || '').toLowerCase();
  const u = (srv?.url || '').toLowerCase();
  if (n.includes('vk') || u.includes('vk.com') || u.includes('vkvideo')) return 35;
  if (n.includes('ok.ru') || u.includes('ok.ru')) return 28;
  if (n.includes('dailymotion') || u.includes('dailymotion.com')) return 24;
  if (n.includes('videa') || u.includes('videa.hu')) return 22;
  if (n.includes('megamax') || u.includes('megamax') || u.includes('share4max')) return 20;
  if (n.includes('mega') && !n.includes('megamax')) return 12;
  if (n.includes('sendvid') || u.includes('sendvid')) return 10;
  if (n.includes('mp4upload') || u.includes('mp4upload')) return 8;
  if (n.includes('drive') || u.includes('drive.google')) return 6;
  return 0;
}

function rankServersByIntelligence(servers: any[], scores: Record<string, { ok: number; fail: number }>): any[] {
  const prefHost = getPreferredServerHost();
  return [...servers]
    .map((s) => (isMultiQualityWatchServer(s) ? { ...s, quality: 'multi' } : s))
    .sort((a, b) => {
      const hostA = extractHostKey(a?.url || a?.serverName || '');
      const hostB = extractHostKey(b?.url || b?.serverName || '');
      const prefBoostA = prefHost && hostA === prefHost ? 12 : 0;
      const prefBoostB = prefHost && hostB === prefHost ? 12 : 0;
      const scA = scores[hostA];
      const scB = scores[hostB];
      const netA = (scA ? scA.ok * 2 - scA.fail * 4 : 0) + prefBoostA + getBaseServerPriority(a);
      const netB = (scB ? scB.ok * 2 - scB.fail * 4 : 0) + prefBoostB + getBaseServerPriority(b);
      return netB - netA;
    });
}

export interface ServerLookupParams {
  url: string;
  animeId?: string | number;
  animeTitle?: string;
  seasonNumber?: number;
  episodeNum?: string | number;
}

export async function getEpisodeServersWithCloud(
  params: ServerLookupParams,
  options?: {
    forceRefresh?: boolean;
    onData?: (servers: any[], source: 'ram' | 'idb' | 'cloud' | 'live') => void;
  },
): Promise<any[]> {
  const rawEpKey = `${params.animeId || 'unknown'}_s${params.seasonNumber || 1}_ep${params.episodeNum || params.url || '1'}`;
  const epKey = toCanonicalKey('ep', rawEpKey);
  const localKey = `servers_v2:${epKey}`;
  const force = options?.forceRefresh === true;

  if (!force) {
    const localHit = ramGet<any[]>(localKey) || (await idbGet<any[]>(localKey));
    if (localHit?.data?.length) {
      options?.onData?.(localHit.data, ramCatalog.has(localKey) ? 'ram' : 'idb');
      if (Date.now() < localHit.freshUntil) return localHit.data;
    }

    const cloudDoc = await safeCloudGet('server_intelligence', epKey);
    if (
      cloudDoc &&
      Array.isArray(cloudDoc.servers) &&
      cloudDoc.servers.length > 0 &&
      Number(cloudDoc.failReports || 0) < 3
    ) {
      const now = Date.now();
      const freshUntil = Number(cloudDoc.freshUntil) || now + 4 * 3600 * 1000;
      const staleUntil = Number(cloudDoc.staleUntil) || now + 24 * 3600 * 1000;
      const ranked = rankServersByIntelligence(cloudDoc.servers, cloudDoc.scores || {});
      await idbSet({
        key: localKey,
        data: ranked,
        freshUntil,
        staleUntil,
        contentHash: String(cloudDoc.contentHash || ''),
        updatedAt: now,
      });
      options?.onData?.(ranked, 'cloud');
      if (now < freshUntil && Number(cloudDoc.failReports || 0) === 0) {
        return ranked;
      }
    }
  }

  const res = await fetch('/api/anime/servers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const json = await safeParseJsonResponse(res);
  const list: any[] = json?.success && Array.isArray(json.data) ? json.data : [];
  if (list.length === 0) return [];

  const sanitizedServers = sanitizeFirestoreData(list.slice(0, 40));
  const now = Date.now();
  const freshUntil = now + 4 * 3600 * 1000;
  const staleUntil = now + 24 * 3600 * 1000;
  const ranked = rankServersByIntelligence(sanitizedServers, {});
  const hash = computeContentHash(sanitizedServers);

  await idbSet({
    key: localKey,
    data: ranked,
    freshUntil,
    staleUntil,
    contentHash: hash,
    updatedAt: now,
  });
  options?.onData?.(ranked, 'live');

  if (canAttemptCloudWrite()) {
    void safeCloudSet('server_intelligence', epKey, {
      epKey,
      servers: sanitizedServers,
      serversCount: sanitizedServers.length,
      scores: {},
      contentHash: hash,
      freshUntil,
      staleUntil,
      failReports: 0,
    });
  }

  return ranked;
}

export async function tryReadEpisodeServersCacheOrCloud(
  params: ServerLookupParams,
): Promise<any[] | null> {
  const rawEpKey = `${params.animeId || 'unknown'}_s${params.seasonNumber || 1}_ep${params.episodeNum || params.url || '1'}`;
  const epKey = toCanonicalKey('ep', rawEpKey);
  const localKey = `servers_v2:${epKey}`;

  const localHit = ramGet<any[]>(localKey) || (await idbGet<any[]>(localKey));
  if (localHit?.data?.length && Date.now() < localHit.freshUntil) {
    return localHit.data;
  }

  const cloudDoc = await safeCloudGet('server_intelligence', epKey);
  if (
    cloudDoc &&
    Array.isArray(cloudDoc.servers) &&
    cloudDoc.servers.length > 0 &&
    Number(cloudDoc.failReports || 0) < 3
  ) {
    const now = Date.now();
    const freshUntil = Number(cloudDoc.freshUntil) || now + 4 * 3600 * 1000;
    const staleUntil = Number(cloudDoc.staleUntil) || now + 24 * 3600 * 1000;
    const ranked = rankServersByIntelligence(cloudDoc.servers, cloudDoc.scores || {});
    await idbSet({
      key: localKey,
      data: ranked,
      freshUntil,
      staleUntil,
      contentHash: String(cloudDoc.contentHash || ''),
      updatedAt: now,
    });
    if (now < freshUntil && Number(cloudDoc.failReports || 0) === 0) {
      return ranked;
    }
  }

  return null;
}

export async function cacheResolvedEpisodeServers(
  params: ServerLookupParams,
  servers: any[],
): Promise<void> {
  if (!Array.isArray(servers) || servers.length === 0) return;
  const rawEpKey = `${params.animeId || 'unknown'}_s${params.seasonNumber || 1}_ep${params.episodeNum || params.url || '1'}`;
  const epKey = toCanonicalKey('ep', rawEpKey);
  const localKey = `servers_v2:${epKey}`;

  const sanitizedServers = sanitizeFirestoreData(servers.slice(0, 40));
  const now = Date.now();
  const freshUntil = now + 4 * 3600 * 1000;
  const staleUntil = now + 24 * 3600 * 1000;
  const ranked = rankServersByIntelligence(sanitizedServers, {});
  const hash = computeContentHash(sanitizedServers);

  await idbSet({
    key: localKey,
    data: ranked,
    freshUntil,
    staleUntil,
    contentHash: hash,
    updatedAt: now,
  });

  if (canAttemptCloudWrite()) {
    void safeCloudSet('server_intelligence', epKey, {
      epKey,
      servers: sanitizedServers,
      serversCount: sanitizedServers.length,
      scores: {},
      contentHash: hash,
      freshUntil,
      staleUntil,
      failReports: 0,
    });
  }
}

export async function recordServerOutcome(
  params: ServerLookupParams,
  serverUrl: string,
  success: boolean,
): Promise<void> {
  if (!serverUrl) return;
  if (success) {
    setPreferredServerHost(serverUrl);
  }
  if (!canAttemptCloudWrite()) return;

  const rawEpKey = `${params.animeId || 'unknown'}_s${params.seasonNumber || 1}_ep${params.episodeNum || params.url || '1'}`;
  const epKey = toCanonicalKey('ep', rawEpKey);
  const hostKey = extractHostKey(serverUrl);
  const uid = auth.currentUser?.uid;
  if (!uid) return;

  try {
    const existing = await safeCloudGet('server_intelligence', epKey);
    if (!existing) return;
    const prevScores = existing.scores && typeof existing.scores === 'object' ? { ...existing.scores } : {};
    const cur = prevScores[hostKey] || { ok: 0, fail: 0, updatedAt: Date.now() };
    prevScores[hostKey] = {
      ok: success ? Math.min(5000, Number(cur.ok || 0) + 1) : Number(cur.ok || 0),
      fail: !success ? Math.min(5000, Number(cur.fail || 0) + 1) : Number(cur.fail || 0),
      updatedAt: Date.now(),
    };
    consumeWriteBudget();
    await updateDoc(doc(db, 'server_intelligence', epKey), {
      scores: prevScores,
      ...(!success ? { failReports: Math.min(50, Number(existing.failReports || 0) + 1) } : {}),
      updatedAt: serverTimestamp(),
      updatedBy: uid,
    });
  } catch (err) {
    reportCloudErrorSilently(err, OperationType.UPDATE, `server_intelligence/${epKey}`);
  }
}

// ============================================================================
// Strictly Device-Only Recent Episodes Service (NEVER touches Firestore)
// ============================================================================
function normalizeRecentList(rawList: any[], prefix = 'recent'): any[] {
  return (rawList || []).map((ep: any, idx: number) => {
    const rawTitle = ep.animeId?.title || ep.title || '';
    const cleanedTitle = rawTitle.includes(' S') ? rawTitle : cleanAnimeTitle(rawTitle);
    const extractedEp =
      ep.episodeNumber || ep.episode || rawTitle.match(/الحلقة\s*(\d+)/)?.[1] || '1';
    const posterImg =
      ep.animeId?.posterUrl || ep.posterUrl || ep.imageUrl || ep.thumbnailUrl || '';
    const animeTargetId =
      typeof ep.animeId === 'string'
        ? ep.animeId
        : ep.animeId?._id || `search-${cleanedTitle}`;
    return {
      _id: ep.id || ep._id || `${prefix}-${idx}`,
      episodeNumber: extractedEp,
      title: cleanedTitle,
      type: ep.type || ep.animeId?.type || 'TV',
      status: ep.status || ep.animeId?.status || 'يعرض حالياً',
      rating: ep.rating || ep.score || ep.animeId?.rating || ep.animeId?.score || null,
      season: ep.season || ep.animeId?.season || null,
      year: ep.year || ep.releaseYear || ep.animeId?.releaseYear || null,
      link: ep.link || ep.id || '',
      animeId: {
        _id: animeTargetId,
        title: cleanedTitle,
        titleAr: cleanedTitle,
        posterUrl: posterImg,
        thumbnailUrl: posterImg,
        episodeLink: ep.link || ep.id || '',
      },
    };
  });
}

export const recentEpisodesLocal = {
  getCached(page = 1): RecentEpisodesDeviceState | null {
    try {
      if (typeof localStorage === 'undefined') return null;
      const raw = localStorage.getItem(`${RECENT_LOCAL_KEY}_p${page}`);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as RecentEpisodesDeviceState;
      if (!parsed || !Array.isArray(parsed.items) || parsed.items.length === 0) return null;
      return parsed;
    } catch {
      return null;
    }
  },

  saveCached(page: number, items: any[], hasNext: boolean): RecentEpisodesDeviceState {
    const state: RecentEpisodesDeviceState = {
      items,
      hasNext,
      fetchedAt: Date.now(),
    };
    try {
      if (typeof localStorage !== 'undefined' && page <= 3 && items.length > 0) {
        localStorage.setItem(`${RECENT_LOCAL_KEY}_p${page}`, JSON.stringify(state));
      }
    } catch {}
    return state;
  },

  async refreshFromLive(page = 1, bypass = true): Promise<RecentEpisodesDeviceState | null> {
    const safePage = Math.max(1, page);
    const ts = Date.now();
    const qs = new URLSearchParams({ page: String(safePage) });
    if (bypass) {
      qs.set('bypass', 'true');
      qs.set('_t', String(ts));
    }

    const r = await fetch(
      `/api/anime/recent?${qs.toString()}`,
      bypass
        ? { cache: 'no-store', headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' } }
        : undefined,
    );
    if (!r.ok) return null;
    const json = await r.json();
    if (json?.success && Array.isArray(json.data) && json.data.length > 0) {
      const formatted = normalizeRecentList(json.data, `recent-p${safePage}-${ts}`);
      const hasNext = typeof json.hasNext === 'boolean' ? json.hasNext : formatted.length >= 10;
      return this.saveCached(safePage, formatted, hasNext);
    }
    return null;
  },

  formatRelativeTimeAr(fetchedAt?: number | null): string {
    if (!fetchedAt) return 'منذ لحظات';
    const diffSec = Math.max(0, Math.floor((Date.now() - fetchedAt) / 1000));
    if (diffSec < 45) return 'منذ لحظات';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `منذ ${diffMin} د`;
    const diffHrs = Math.floor(diffMin / 60);
    if (diffHrs < 24) return `منذ ${diffHrs} س`;
    const diffDays = Math.floor(diffHrs / 24);
    return `منذ ${diffDays} ي`;
  },
};

/**
 * Phase-2 bridge helper: maps user list/progress IDs onto unified cloud catalog document keys
 * without changing existing user entry Firestore document rules.
 */
export function resolveCanonicalId(type: 'anime' | 'manga', rawId: string | number): string {
  return toCanonicalKey(type, rawId);
}

export const cloudCatalogService = {
  toCanonicalKey,
  resolveCanonicalId,
  peekBundleRam,
  getBundleWithCloud,
  getAnimeDetailsWithCloud,
  updateCachedAnimeSynopsis,
  getMangaWithCloud,
  getMangaChaptersOnlyWithCloud,
  getChapterPagesWithCloud,
  tryReadChapterPagesCacheOrCloud,
  cacheResolvedChapterPages,
  reportBrokenChapterPages,
  getEpisodeServersWithCloud,
  tryReadEpisodeServersCacheOrCloud,
  cacheResolvedEpisodeServers,
  setPreferredServerHost,
  getPreferredServerHost,
  recordServerOutcome,
  recentEpisodesLocal,
  pruneExpiredDeviceCatalog,
  clearLocalDeviceCatalog: async () => {
    ramCatalog.clear();
    const database = await openCatalogDb();
    if (database) {
      try {
        const tx = database.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).clear();
      } catch {}
    }
  },
};
