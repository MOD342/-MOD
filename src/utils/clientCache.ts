interface CacheWrapper<T> {
  data: T;
  expireAt: number;
  lastAccessed?: number;
}

export interface ClientCacheStats {
  memoryItemsCount: number;
  localStorageKeysCount: number;
  hits: number;
  misses: number;
  hitRatioPercent: number;
  inFlightRequestsCount: number;
}

class ClientCacheManager {
  // Cache version bump automatically invalidates legacy static localStorage & sessionStorage caches
  private readonly CACHE_VERSION = 'v15_clean_real_data';

  // Layer 1: High-Speed In-Memory Cache (0ms latency, zero JSON parsing overhead)
  private memoryCache = new Map<string, CacheWrapper<any>>();
  
  // In-flight request deduplication map to collapse simultaneous calls into 1 network promise
  private inFlight = new Map<string, Promise<any>>();
  
  // Prefetch tracking to prevent duplicate prefetch bursts
  private prefetchedSet = new Set<string>();

  // Diagnostic metrics
  private hits = 0;
  private misses = 0;

  constructor() {
    this.ensureCacheVersion();
  }

  private ensureCacheVersion(): void {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      localStorage.removeItem('is_api_unreachable');
      const currentVer = localStorage.getItem('__anime_cache_version__');
      if (currentVer !== this.CACHE_VERSION) {
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && (k.startsWith('client_') || k.startsWith('servers_') || k.startsWith('anime_') || k.startsWith('recent_') || k === 'is_api_unreachable')) {
            keysToRemove.push(k);
          }
        }
        keysToRemove.forEach((k) => localStorage.removeItem(k));
        try {
          sessionStorage.clear();
        } catch {}
        localStorage.setItem('__anime_cache_version__', this.CACHE_VERSION);
      }
    } catch {}
  }

  /**
   * Get a cached item. Checks Layer 1 (Memory) first, then Layer 2 (LocalStorage).
   * Automatically validates dashboard data integrity and prunes expired keys.
   */
  get<T>(key: string): T | null {
    const now = Date.now();

    // 1. Layer 1: Check In-Memory Map (Fastest, avoids JSON.parse)
    const memEntry = this.memoryCache.get(key);
    if (memEntry) {
      if (now < memEntry.expireAt) {
        memEntry.lastAccessed = now;
        this.hits++;
        return memEntry.data as T;
      } else {
        this.memoryCache.delete(key);
      }
    }

    // 2. Layer 2: Check LocalStorage
    try {
      if (typeof window === 'undefined' || !window.localStorage) {
        this.misses++;
        return null;
      }

      const raw = localStorage.getItem(key);
      if (!raw) {
        this.misses++;
        return null;
      }

      const parsed: CacheWrapper<T> = JSON.parse(raw);
      if (now < parsed.expireAt) {
        // Validation: If it's a dashboard cache, reject only if completely empty
        if (key.includes('dashboard_cache') && parsed.data && typeof parsed.data === 'object') {
          const d = parsed.data as any;
          const hasAnyData = (Array.isArray(d.top5) && d.top5.length > 0) ||
                             (Array.isArray(d.recentEpisodes) && d.recentEpisodes.length > 0) ||
                             (Array.isArray(d.popular) && d.popular.length > 0);
          if (!hasAnyData) {
            console.warn(`[ClientCache] Rejecting empty dashboard cache for key: ${key}`);
            this.delete(key);
            this.misses++;
            return null;
          }
        }

        // Store back in Layer 1 (Memory) for subsequent instant access
        parsed.lastAccessed = now;
        this.memoryCache.set(key, parsed);
        this.hits++;
        return parsed.data;
      } else {
        // Remove expired client item
        this.delete(key);
      }
    } catch (e) {
      console.warn(`[ClientCache] Error reading key "${key}"`, e);
    }

    this.misses++;
    return null;
  }

  /**
   * Set cache item in both Layer 1 (Memory) and Layer 2 (LocalStorage) with configurable TTL.
   * Gracefully handles QuotaExceededError by pruning old entries.
   */
  set<T>(key: string, data: T, ttlMs: number = 60 * 60 * 1000): void {
    const now = Date.now();
    const expireAt = now + ttlMs;
    const wrapper: CacheWrapper<T> = {
      data,
      expireAt,
      lastAccessed: now,
    };

    // 1. Save in Layer 1 (Memory)
    this.memoryCache.set(key, wrapper);

    // Limit memory cache size to 150 items to keep footprint ultra-light
    if (this.memoryCache.size > 150) {
      const oldestKey = this.memoryCache.keys().next().value;
      if (oldestKey) this.memoryCache.delete(oldestKey);
    }

    // 2. Save in Layer 2 (LocalStorage)
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(key, JSON.stringify(wrapper));
      }
    } catch (e: any) {
      console.warn(`[ClientCache] Storage quota or write warning for "${key}", initiating auto-prune...`);
      // Evict expired and oldest entries to free up storage space
      this.clearExpired();
      this.pruneOldest(10);
      try {
        localStorage.setItem(key, JSON.stringify(wrapper));
      } catch {
        // If still full, it safely lives in Layer 1 Memory without crashing the application!
      }
    }
  }

  /**
   * Remove a specific cached item from all tiers
   */
  delete(key: string): void {
    this.memoryCache.delete(key);
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.removeItem(key);
      }
    } catch (e) {
      console.error(e);
    }
  }

  /**
   * Prefetch details for instant viewing experience with request deduplication
   */
  prefetchDetails(id: string | number): void {
    if (!id || id === 'random') return;
    const cacheKey = `client_anime_details_v7_${id}`;
    if (this.get(cacheKey) || this.prefetchedSet.has(String(id))) return;
    
    this.prefetchedSet.add(String(id));

    // Limit prefetched set size
    if (this.prefetchedSet.size > 200) {
      this.prefetchedSet.clear();
    }

    const runFetch = () => {
      fetch(`/api/anime/details/${id}`)
        .then(res => res.json())
        .then(res => {
          if (res.success && res.data) {
            // Cache for 12 hours
            this.set(cacheKey, res.data, 12 * 60 * 60 * 1000);
          }
        })
        .catch(() => {});
    };

    // Use requestIdleCallback if supported by the browser to avoid blocking frame rendering
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      (window as any).requestIdleCallback(runFetch, { timeout: 1500 });
    } else {
      setTimeout(runFetch, 100);
    }
  }

  /**
   * Clears all cache items matching a pattern
   */
  clearPrefix(prefix: string): void {
    // Clear from Memory
    for (const key of this.memoryCache.keys()) {
      if (key.startsWith(prefix)) {
        this.memoryCache.delete(key);
      }
    }

    // Clear from LocalStorage
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(prefix)) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));
    } catch (e) {
      console.error(e);
    }
  }

  /**
   * Clears old, expired items to free up browser storage
   */
  clearExpired(): void {
    const now = Date.now();

    // Clean Memory
    for (const [key, val] of this.memoryCache.entries()) {
      if (now >= val.expireAt) {
        this.memoryCache.delete(key);
      }
    }

    // Clean LocalStorage
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          try {
            const raw = localStorage.getItem(key);
            if (raw) {
              const parsed = JSON.parse(raw);
              if (parsed && typeof parsed.expireAt === 'number' && now >= parsed.expireAt) {
                keysToRemove.push(key);
              }
            }
          } catch {
            // Non-JSON item, leave alone
          }
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));
    } catch (e) {
      console.error(e);
    }
  }

  /**
   * Prune oldest accessed items to keep browser storage healthy
   */
  private pruneOldest(count: number = 10): void {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      const items: { key: string; lastAccessed: number }[] = [];
      
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('client_') || key.startsWith('anime_'))) {
          try {
            const raw = localStorage.getItem(key);
            if (raw) {
              const parsed = JSON.parse(raw);
              items.push({
                key,
                lastAccessed: parsed.lastAccessed || parsed.expireAt || 0,
              });
            }
          } catch {}
        }
      }

      items.sort((a, b) => a.lastAccessed - b.lastAccessed);
      items.slice(0, count).forEach(item => {
        localStorage.removeItem(item.key);
        this.memoryCache.delete(item.key);
      });
    } catch {}
  }

  /**
   * Clear the entire cache
   */
  clear(): void {
    this.memoryCache.clear();
    this.inFlight.clear();
    this.prefetchedSet.clear();
    this.hits = 0;
    this.misses = 0;
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.clear();
      }
    } catch (e) {
      console.error(e);
    }
  }

  /**
   * Helper to perform a fetch with Stale-While-Revalidate pattern and in-flight deduplication.
   * Returns cached data immediately if available, then fetches fresh data in background.
   */
  async fetchWithRevalidate<T>(
    key: string,
    url: string,
    onSuccess: (data: T) => void,
    ttlMs: number = 15 * 60 * 1000
  ): Promise<T | null> {
    const cached = this.get<T>(key);
    
    // If cached data exists, deliver it immediately for 0ms perception
    if (cached !== null) {
      onSuccess(cached);
    }

    // Deduplicate in-flight requests: if another component is already requesting this URL, await it
    let fetchPromise = this.inFlight.get(url);
    if (!fetchPromise) {
      fetchPromise = (async () => {
        try {
          const res = await fetch(url);
          if (!res.ok) throw new Error(`HTTP error ${res.status}`);
          const json = await res.json();
          if (json && json.success && json.data) {
            const freshData = json.data;
            this.set(key, freshData, ttlMs);
            onSuccess(freshData);
            return freshData;
          }
        } catch (err) {
          console.warn(`[ClientCache] Fetch failed for ${url}:`, err);
        } finally {
          this.inFlight.delete(url);
        }
        return cached;
      })();

      this.inFlight.set(url, fetchPromise);
    } else {
      // Attach success handler to in-flight promise
      fetchPromise.then((freshData) => {
        if (freshData) onSuccess(freshData);
      }).catch(() => {});
    }

    // Critical fix: If there was no cached data, await the network request
    // so the UI does not clear loading indicators while data is empty!
    if (cached === null) {
      const freshResult = await fetchPromise;
      return freshResult !== undefined ? freshResult : null;
    }

    return cached;
  }

  /**
   * Diagnostic statistics for client-side cache
   */
  getStats(): ClientCacheStats {
    let lsKeys = 0;
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        lsKeys = localStorage.length;
      }
    } catch {}

    const total = this.hits + this.misses;
    const hitRatio = total > 0 ? Math.round((this.hits / total) * 100) : 0;

    return {
      memoryItemsCount: this.memoryCache.size,
      localStorageKeysCount: lsKeys,
      hits: this.hits,
      misses: this.misses,
      hitRatioPercent: hitRatio,
      inFlightRequestsCount: this.inFlight.size,
    };
  }
}

export const clientCache = new ClientCacheManager();
