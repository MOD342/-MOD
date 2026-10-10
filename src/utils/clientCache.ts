export interface ClientCacheStats {
  memoryItemsCount: number;
  localStorageKeysCount: number;
  hits: number;
  misses: number;
  hitRatioPercent: number;
  inFlightRequestsCount: number;
}

/**
 * Direct Zero-Storage Client Manager (وضع الجلب المباشر الفوري بدون أي تخزين محلي أو مؤقت)
 * يقوم بتنظيف وحذف أي بيانات قديمة مخزنة في المتصفح (localStorage / sessionStorage / CacheStorage / ServiceWorker)
 * ويعمل بشكل مباشر 100% من الخادم والإنترنت دون تخزين أي بيانات.
 */
class ClientCacheManager {
  private inFlight = new Map<string, Promise<any>>();
  private directRequests = 0;

  constructor() {
    this.purgeAllBrowserStorage();
  }

  public purgeAllBrowserStorage(): void {
    try {
      if (typeof window === 'undefined') return;

      // 1. Wipe localStorage completely (except active Firebase auth session if needed, or full wipe of app keys)
      if (window.localStorage) {
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && !k.startsWith('firebase:authUser:')) {
            keysToRemove.push(k);
          }
        }
        keysToRemove.forEach((k) => {
          try {
            localStorage.removeItem(k);
          } catch {}
        });
      }

      // 2. Wipe sessionStorage completely
      if (window.sessionStorage) {
        try {
          sessionStorage.clear();
        } catch {}
      }

      // 3. Wipe Browser CacheStorage API
      if ('caches' in window) {
        caches
          .keys()
          .then((names) => {
            names.forEach((name) => caches.delete(name));
          })
          .catch(() => {});
      }

      // 4. Unregister any old Service Workers so they never serve cached responses
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

  get<T>(_key: string): T | null {
    return null;
  }

  set<T>(_key: string, _data: T, _ttlMs?: number): void {
    // No-op: Direct live mode does not store any cache in memory or localStorage
  }

  delete(_key: string): void {
    // No-op
  }

  prefetchDetails(_id: string | number): void {
    // No-op in zero-storage direct mode
  }

  clearPrefix(_prefix: string): void {
    this.purgeAllBrowserStorage();
  }

  clearExpired(): void {
    this.purgeAllBrowserStorage();
  }

  clear(): void {
    this.inFlight.clear();
    this.directRequests = 0;
    this.purgeAllBrowserStorage();
  }

  async fetchWithRevalidate<T>(
    _key: string,
    url: string,
    onSuccess: (data: T) => void,
    _ttlMs?: number
  ): Promise<T | null> {
    this.directRequests++;

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
            onSuccess(json.data);
            return json.data;
          }
        } catch (err) {
          console.warn(`[DirectFetch] Live request failed for ${url}:`, err);
        } finally {
          this.inFlight.delete(url);
        }
        return null;
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
    return result !== undefined ? result : null;
  }

  getStats(): ClientCacheStats {
    return {
      memoryItemsCount: 0,
      localStorageKeysCount: 0,
      hits: 0,
      misses: this.directRequests,
      hitRatioPercent: 0,
      inFlightRequestsCount: this.inFlight.size,
    };
  }
}

export const clientCache = new ClientCacheManager();
