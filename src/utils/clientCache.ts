import { isEphemeralCloudHost } from './apiUrl';
import { cloudCatalogService } from '../services/cloudCatalogService';

export interface ClientCacheStats {
  memoryItemsCount: number;
  localStorageKeysCount: number;
  hits: number;
  misses: number;
  hitRatioPercent: number;
  inFlightRequestsCount: number;
}

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

/**
 * Smart Hybrid Client Cache Manager (محرك الجلب الذكي مع حماية بيانات المستخدم في الويب والـ APK)
 * يحافظ على جلسات تسجيل الدخول وحساب المستخدم وتقدم الألعاب والإعدادات في localStorage،
 * مع تخزين مؤقت خفيف في الذاكرة (RAM) لتسريع التنقل الفوري ومنع إعادة الطلبات المكررة.
 */
const STORAGE_SCHEMA_VERSION = 'otaku_clean_v2026_4';
const SWR_PERSIST_PREFIX = 'otaku_swr_';

class ClientCacheManager {
  private memoryCache = new Map<string, CacheEntry<any>>();
  private inFlight = new Map<string, Promise<any>>();
  private hits = 0;
  private misses = 0;

  constructor() {
    this.cleanLegacyCacheOnly();
  }

  /**
   * ينظف مفاتيح الكاش المؤقتة والبيانات القديمة المرتبطة بالمتصفح أو المنصة عند التحديث
   * دون المساس بجلسة مصادقة Firebase الحقيقية للمستخدم.
   */
  public cleanLegacyCacheOnly(): void {
    try {
      if (typeof window === 'undefined') return;

      // 1. Unregister legacy Service Workers & clear CacheStorage
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker
          .getRegistrations()
          .then((registrations) => {
            for (const reg of registrations) {
              reg.unregister().catch(() => {});
            }
          })
          .catch(() => {});
      }

      if (typeof localStorage !== 'undefined') {
        const currentVer = localStorage.getItem('otaku_storage_version');
        if (currentVer !== STORAGE_SCHEMA_VERSION) {
          this.purgeLegacyStorageData();
          localStorage.setItem('otaku_storage_version', STORAGE_SCHEMA_VERSION);
        }
      }
    } catch {}
  }

  public purgeLegacyStorageData(): void {
    try {
      if (typeof window === 'undefined') return;

      if (window.localStorage) {
        const customHost = localStorage.getItem('custom_api_host') || '';
        if (isEphemeralCloudHost(customHost)) {
          localStorage.removeItem('custom_api_host');
        }

        const exactKeysToRemove = [
          'is_api_unreachable',
          'animeHistory',
          'adminSliderSettings',
          'adminAnimeCuration',
          'fallback_active_session',
          'apk_google_email',
          'otaku_chat_history',
          'otaku_widget_chat_v2',
        ];
        exactKeysToRemove.forEach((k) => {
          try {
            localStorage.removeItem(k);
          } catch {}
        });

        const prefixKeysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (
            k &&
            (k.startsWith('client_') ||
              k.startsWith('direct_') ||
              k.startsWith('servers_v') ||
              k.startsWith('elite_') ||
              k.startsWith('mod_user_data_') ||
              k.startsWith('local_custom_lists_') ||
              k.startsWith('local_anime_entries_') ||
              k.startsWith('last_ad_ts_') ||
              k.startsWith(SWR_PERSIST_PREFIX))
          ) {
            prefixKeysToRemove.push(k);
          }
        }
        prefixKeysToRemove.forEach((k) => {
          try {
            localStorage.removeItem(k);
          } catch {}
        });
      }

      try {
        sessionStorage.clear();
      } catch {}

      if ('caches' in window) {
        caches
          .keys()
          .then((names) => Promise.all(names.map((name) => caches.delete(name))))
          .catch(() => {});
      }

      // Purge stale local catalog & Firestore document IndexedDB cache (preserving firebaseLocalStorageDb auth tokens)
      try {
        if (typeof indexedDB !== 'undefined') {
          indexedDB.deleteDatabase('otaku_device_catalog_db');
          if (typeof indexedDB.databases === 'function') {
            indexedDB
              .databases()
              .then((dbs) => {
                for (const dbInfo of dbs) {
                  if (dbInfo.name && dbInfo.name.startsWith('firestore/')) {
                    try {
                      indexedDB.deleteDatabase(dbInfo.name);
                    } catch {}
                  }
                }
              })
              .catch(() => {});
          }
        }
      } catch {}
    } catch {}
  }

  public purgeAllBrowserStorage(): void {
    this.memoryCache.clear();
    this.purgeLegacyStorageData();
  }

  private readPersisted<T>(key: string): T | null {
    if (typeof localStorage === 'undefined') return null;
    try {
      const raw = localStorage.getItem(`${SWR_PERSIST_PREFIX}${key}`);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as CacheEntry<T>;
      if (!parsed || typeof parsed.expiresAt !== 'number') return null;
      if (Date.now() > parsed.expiresAt) {
        localStorage.removeItem(`${SWR_PERSIST_PREFIX}${key}`);
        return null;
      }
      this.memoryCache.set(key, parsed);
      return parsed.data as T;
    } catch {
      return null;
    }
  }

  private writePersisted<T>(key: string, entry: CacheEntry<T>): void {
    if (typeof localStorage === 'undefined') return;
    if (!key.startsWith('direct_') && !key.startsWith('client_')) return;
    try {
      const serialized = JSON.stringify(entry);
      if (serialized.length > 350_000) return;
      localStorage.setItem(`${SWR_PERSIST_PREFIX}${key}`, serialized);
    } catch {}
  }

  get<T>(key: string): T | null {
    const entry = this.memoryCache.get(key);
    if (entry) {
      if (Date.now() > entry.expiresAt) {
        this.memoryCache.delete(key);
        try {
          localStorage.removeItem(`${SWR_PERSIST_PREFIX}${key}`);
        } catch {}
        return null;
      }
      this.hits++;
      return entry.data as T;
    }

    const persisted = this.readPersisted<T>(key);
    if (persisted !== null) {
      this.hits++;
      return persisted;
    }
    return null;
  }

  set<T>(key: string, data: T, ttlMs: number = 15 * 60 * 1000): void {
    if (this.memoryCache.size > 200) {
      const oldestKey = this.memoryCache.keys().next().value;
      if (oldestKey) this.memoryCache.delete(oldestKey);
    }
    const entry: CacheEntry<T> = {
      data,
      expiresAt: Date.now() + ttlMs,
    };
    this.memoryCache.set(key, entry);
    this.writePersisted(key, entry);
  }

  delete(key: string): void {
    this.memoryCache.delete(key);
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(`${SWR_PERSIST_PREFIX}${key}`);
      }
    } catch {}
  }

  prefetchDetails(id: string | number): void {
    if (!id || id === 'random' || id === 'unknown') return;
    const strId = String(id);
    if (this.inFlight.has(`prefetch:${strId}`)) return;
    const p = cloudCatalogService
      .getAnimeDetailsWithCloud(strId)
      .catch(() => null)
      .finally(() => {
        this.inFlight.delete(`prefetch:${strId}`);
      });
    this.inFlight.set(`prefetch:${strId}`, p);
  }

  clearPrefix(prefix: string): void {
    for (const k of this.memoryCache.keys()) {
      if (k.startsWith(prefix)) {
        this.memoryCache.delete(k);
      }
    }
    try {
      if (typeof localStorage !== 'undefined') {
        const toDelete: string[] = [];
        const fullPrefix = `${SWR_PERSIST_PREFIX}${prefix}`;
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith(fullPrefix)) toDelete.push(k);
        }
        toDelete.forEach((k) => localStorage.removeItem(k));
      }
    } catch {}
  }

  clearExpired(): void {
    const now = Date.now();
    for (const [k, v] of this.memoryCache.entries()) {
      if (now > v.expiresAt) {
        this.memoryCache.delete(k);
      }
    }
  }

  /**
   * يمسح كاش القوائم والبيانات الخاصة بالمستخدم فقط عند تسجيل الخروج أو تبديل الحساب،
   * مع الإبقاء على كاش كتالوج الأنمي العام والسيرفرات مشتركاً لتخفيف الأحمال بين الأعضاء.
   */
  clearUserPrivateCaches(): void {
    this.clearPrefix('client_mylists_');
    this.clearPrefix('direct_mylists_');
    this.clearPrefix('client_user_');
    for (const reqKey of Array.from(this.inFlight.keys())) {
      if (reqKey.includes('mylists') || reqKey.includes('/users/')) {
        this.inFlight.delete(reqKey);
      }
    }
  }

  clear(): void {
    this.inFlight.clear();
    this.memoryCache.clear();
    this.hits = 0;
    this.misses = 0;
    this.purgeAllBrowserStorage();
    void cloudCatalogService.clearLocalDeviceCatalog();
  }

  private isMeaningfulData(data: any): boolean {
    if (data === null || data === undefined) return false;
    if (Array.isArray(data)) return data.length > 0;
    if (typeof data === 'object') {
      if ('top5' in data || 'recentEpisodes' in data || 'popular' in data || 'currentSeason' in data) {
        return Boolean(
          (Array.isArray(data.top5) && data.top5.length > 0) ||
          (Array.isArray(data.recentEpisodes) && data.recentEpisodes.length > 0) ||
          (Array.isArray(data.popular) && data.popular.length > 0) ||
          (Array.isArray(data.currentSeason) && data.currentSeason.length > 0) ||
          (Array.isArray(data.schedule) && data.schedule.length > 0)
        );
      }
    }
    return true;
  }

  async fetchWithRevalidate<T>(
    key: string,
    url: string,
    onSuccess: (data: T) => void,
    ttlMs: number = 15 * 60 * 1000,
    options?: { forceRefresh?: boolean; onError?: (err: unknown) => void }
  ): Promise<T | null> {
    const forceRefresh = options?.forceRefresh === true;
    const rawCached = forceRefresh ? null : this.get<T>(key);
    const cached = rawCached !== null && this.isMeaningfulData(rawCached) ? rawCached : null;

    if (cached !== null) {
      onSuccess(cached);
    } else {
      this.misses++;
    }

    const requestKey = forceRefresh ? `${url}::force` : url;
    let fetchPromise = this.inFlight.get(requestKey);
    if (!fetchPromise) {
      fetchPromise = (async () => {
        try {
          const res = await fetch(url, forceRefresh ? { cache: 'no-store' } : undefined);
          if (!res.ok) throw new Error(`HTTP error ${res.status}`);
          const json = await res.json();
          if (json && json.success && json.data !== undefined && this.isMeaningfulData(json.data)) {
            this.set(key, json.data, ttlMs);
            onSuccess(json.data);
            return json.data;
          }
          if (!cached && options?.onError) {
            options.onError(new Error(json?.message || 'Empty response payload'));
          }
        } catch (err) {
          console.warn(`[DirectFetch] Background request failed for ${url}:`, err);
          if (!cached && options?.onError) {
            options.onError(err);
          }
        } finally {
          this.inFlight.delete(requestKey);
        }
        return cached;
      })();

      this.inFlight.set(requestKey, fetchPromise);
    } else {
      fetchPromise
        .then((freshData) => {
          if (freshData && this.isMeaningfulData(freshData)) onSuccess(freshData);
        })
        .catch(() => {});
    }

    // في حال توفر بيانات مخزنة مسبقاً ولم يُطلب تحديث قسري، نعيدها فوراً دون حجب الواجهة بينما تتحدث البيانات بالخلفية
    if (cached !== null && !forceRefresh) {
      void fetchPromise;
      return cached;
    }

    const result = await fetchPromise;
    return result !== undefined ? result : cached;
  }

  getStats(): ClientCacheStats {
    const total = this.hits + this.misses;
    return {
      memoryItemsCount: this.memoryCache.size,
      localStorageKeysCount: typeof localStorage !== 'undefined' ? localStorage.length : 0,
      hits: this.hits,
      misses: this.misses,
      hitRatioPercent: total > 0 ? Math.round((this.hits / total) * 100) : 0,
      inFlightRequestsCount: this.inFlight.size,
    };
  }
}

export const clientCache = new ClientCacheManager();
