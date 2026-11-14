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
const STORAGE_SCHEMA_VERSION = 'otaku_clean_v2026_2';

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
        const isApkShell =
          window.location.protocol === 'file:' ||
          window.location.protocol === 'capacitor:' ||
          Boolean((window as any).Capacitor) ||
          Boolean((window as any).cordova) ||
          (window.location.hostname === 'localhost' && !window.location.port);
        if (
          customHost.includes('ais-dev-') ||
          customHost.includes('your-public-deployed') ||
          customHost.includes('example.com') ||
          (!isApkShell && (customHost.includes('.run.app') || customHost.includes('ais-pre-')))
        ) {
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
              k.startsWith('last_ad_ts_'))
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

      // Purge stale Firestore document IndexedDB cache (preserving firebaseLocalStorageDb auth tokens)
      if (typeof indexedDB !== 'undefined' && typeof indexedDB.databases === 'function') {
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
    } catch {}
  }

  public purgeAllBrowserStorage(): void {
    this.memoryCache.clear();
    this.purgeLegacyStorageData();
  }

  get<T>(key: string): T | null {
    const entry = this.memoryCache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.memoryCache.delete(key);
      return null;
    }
    this.hits++;
    return entry.data as T;
  }

  set<T>(key: string, data: T, ttlMs: number = 10 * 60 * 1000): void {
    if (this.memoryCache.size > 200) {
      const oldestKey = this.memoryCache.keys().next().value;
      if (oldestKey) this.memoryCache.delete(oldestKey);
    }
    this.memoryCache.set(key, {
      data,
      expiresAt: Date.now() + ttlMs,
    });
  }

  delete(key: string): void {
    this.memoryCache.delete(key);
  }

  prefetchDetails(id: string | number): void {
    if (!id || id === 'random' || id === 'unknown') return;
    const cacheKey = `client_anime_details_v8_${id}`;
    if (this.memoryCache.has(cacheKey) || this.inFlight.has(`/api/anime/details/${id}`)) return;
    this.fetchWithRevalidate(cacheKey, `/api/anime/details/${id}`, () => {}, 10 * 60 * 1000).catch(() => {});
  }

  clearPrefix(prefix: string): void {
    for (const k of this.memoryCache.keys()) {
      if (k.startsWith(prefix)) {
        this.memoryCache.delete(k);
      }
    }
  }

  clearExpired(): void {
    const now = Date.now();
    for (const [k, v] of this.memoryCache.entries()) {
      if (now > v.expiresAt) {
        this.memoryCache.delete(k);
      }
    }
  }

  clear(): void {
    this.inFlight.clear();
    this.memoryCache.clear();
    this.hits = 0;
    this.misses = 0;
    this.purgeAllBrowserStorage();
  }

  async fetchWithRevalidate<T>(
    key: string,
    url: string,
    onSuccess: (data: T) => void,
    ttlMs: number = 10 * 60 * 1000
  ): Promise<T | null> {
    const cached = this.get<T>(key);
    if (cached !== null) {
      onSuccess(cached);
    } else {
      this.misses++;
    }

    let fetchPromise = this.inFlight.get(url);
    if (!fetchPromise) {
      fetchPromise = (async () => {
        try {
          const sep = url.includes('?') ? '&' : '?';
          const liveUrl = `${url}${sep}_live=${Date.now()}`;
          const res = await fetch(liveUrl, {
            cache: 'no-store',
            headers: {
              'Cache-Control': 'no-cache, no-store, must-revalidate',
              Pragma: 'no-cache',
            },
          });
          if (!res.ok) throw new Error(`HTTP error ${res.status}`);
          const json = await res.json();
          if (json && json.success && json.data !== undefined) {
            this.set(key, json.data, ttlMs);
            onSuccess(json.data);
            return json.data;
          }
        } catch (err) {
          console.warn(`[DirectFetch] Live request failed for ${url}:`, err);
        } finally {
          this.inFlight.delete(url);
        }
        return cached;
      })();

      this.inFlight.set(url, fetchPromise);
    } else {
      fetchPromise
        .then((freshData) => {
          if (freshData) onSuccess(freshData);
        })
        .catch(() => {});
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
