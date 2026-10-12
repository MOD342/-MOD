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
class ClientCacheManager {
  private memoryCache = new Map<string, CacheEntry<any>>();
  private inFlight = new Map<string, Promise<any>>();
  private hits = 0;
  private misses = 0;

  constructor() {
    this.cleanLegacyCacheOnly();
  }

  /**
   * ينظف فقط مفاتيح الكاش المؤقتة القديمة دون المساس ببيانات المستخدم أو حساباته أو إعدادات التطبيق
   */
  public cleanLegacyCacheOnly(): void {
    try {
      if (typeof window === 'undefined') return;

      // Unregister old legacy service workers that might serve stale HTML
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
    } catch {}
  }

  public purgeAllBrowserStorage(): void {
    this.memoryCache.clear();
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        // Only remove temporary API cache keys, NEVER remove user/auth/game/settings keys
        if (
          k &&
          (k.startsWith('client_') ||
            k.startsWith('direct_') ||
            k.startsWith('servers_v') ||
            k.startsWith('elite_'))
        ) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach((k) => {
        try {
          localStorage.removeItem(k);
        } catch {}
      });
    } catch {}
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
