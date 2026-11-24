export type ServerCacheMode = '10k_smart_ram' | 'zero_live' | 'zero_cache_direct';

export interface CacheEntry<T> {
  data: T;
  expireAt: number;
  staleUntil: number;
}

export interface CacheStatsInfo {
  engine: string;
  mode: '10k_smart_ram' | 'zero_live';
  hits: number;
  misses: number;
  staleHits: number;
  keys: number;
  keysCount: number;
  maxKeys: number;
  coalescedSaves: number;
  inFlightRequests: number;
  ksize: number;
  vsize: number;
  hitRatioPercent: number;
  defaultTtlSeconds: number;
  uptimeSeconds: number;
}

/**
 * High-Concurrency Smart RAM Micro-Cache with Single-Flight Coalescing & Stale-While-Revalidate (SWR)
 * - Fresh hit: returns immediately (<1ms)
 * - Stale hit (expired fresh window, within staleUntil): returns stale data immediately (<1ms) and triggers 1 background refresh
 * - Cold miss: coalesces simultaneous requests into 1 upstream call
 */
class CacheService {
  private startTime = Date.now();
  private mode: '10k_smart_ram' | 'zero_live' = '10k_smart_ram';
  private ramStore = new Map<string, CacheEntry<any>>();
  private inFlight = new Map<string, Promise<any>>();
  private readonly maxKeys = 3000;
  private readonly defaultTtlMs = 120 * 1000; // 2 minutes fresh window

  private hits = 0;
  private staleHits = 0;
  private misses = 0;
  private coalescedSaves = 0;

  constructor() {
    if (!process.env.VERCEL) {
      const timer = setInterval(() => this.pruneExpired(), 60 * 1000);
      if (typeof (timer as any).unref === 'function') {
        (timer as any).unref();
      }
    }
  }

  private pruneExpired(): void {
    const now = Date.now();
    for (const [k, entry] of this.ramStore.entries()) {
      if (now >= entry.staleUntil) {
        this.ramStore.delete(k);
      }
    }
  }

  public setMode(newMode: ServerCacheMode): void {
    if (newMode === 'zero_live' || newMode === 'zero_cache_direct') {
      this.mode = 'zero_live';
      this.ramStore.clear();
    } else {
      this.mode = '10k_smart_ram';
    }
  }

  public getMode(): '10k_smart_ram' | 'zero_live' {
    return this.mode;
  }

  public async get<T>(key: string, allowStale = false): Promise<T | null> {
    if (this.mode === 'zero_live') {
      this.misses++;
      return null;
    }

    const entry = this.ramStore.get(key);
    if (!entry) {
      this.misses++;
      return null;
    }

    const now = Date.now();
    if (now >= entry.expireAt) {
      if (!allowStale || now >= entry.staleUntil) {
        if (now >= entry.staleUntil) {
          this.ramStore.delete(key);
        }
        this.misses++;
        return null;
      }
      this.staleHits++;
    } else {
      this.hits++;
    }

    // Refresh LRU order
    this.ramStore.delete(key);
    this.ramStore.set(key, entry);
    return entry.data as T;
  }

  public async set<T>(
    key: string,
    data: T,
    ttlMs: number = this.defaultTtlMs,
    staleWindowMs?: number
  ): Promise<void> {
    if (this.mode === 'zero_live' || ttlMs <= 0 || data === undefined || data === null) {
      return;
    }

    // Cap fresh TTL at 24 hours; retain stale fallback window up to 72 hours for instant SWR
    const safeTtlMs = Math.min(ttlMs, 24 * 60 * 60 * 1000);
    const safeStaleMs = Math.min(
      Math.max(staleWindowMs ?? Math.max(safeTtlMs * 4, 10 * 60 * 1000), safeTtlMs),
      72 * 60 * 60 * 1000
    );

    if (this.ramStore.has(key)) {
      this.ramStore.delete(key);
    } else if (this.ramStore.size >= this.maxKeys) {
      this.pruneExpired();
      if (this.ramStore.size >= this.maxKeys) {
        const oldestKey = this.ramStore.keys().next().value;
        if (oldestKey !== undefined) {
          this.ramStore.delete(oldestKey);
        }
      }
    }

    const now = Date.now();
    this.ramStore.set(key, {
      data,
      expireAt: now + safeTtlMs,
      staleUntil: now + safeStaleMs,
    });
  }

  private launchInFlight<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttlMs: number,
    staleWindowMs?: number
  ): Promise<T> {
    const existingFlight = this.inFlight.get(key);
    if (existingFlight) {
      this.coalescedSaves++;
      return existingFlight as Promise<T>;
    }

    const flightPromise = (async () => {
      try {
        const result = await fetcher();
        if (this.mode === '10k_smart_ram' && result !== undefined && result !== null) {
          const isEmptyArray = Array.isArray(result) && result.length === 0;
          if (!isEmptyArray) {
            await this.set(key, result, ttlMs, staleWindowMs);
          }
        }
        return result;
      } finally {
        this.inFlight.delete(key);
      }
    })();

    this.inFlight.set(key, flightPromise);
    return flightPromise;
  }

  /**
   * Single-Flight Request Coalescing + Smart RAM Micro-Cache
   */
  public async getOrFetch<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttlMs: number = this.defaultTtlMs,
    bypassCache = false
  ): Promise<T> {
    if (bypassCache) {
      this.ramStore.delete(key);
      return this.launchInFlight(key, fetcher, ttlMs);
    }

    if (this.mode === '10k_smart_ram') {
      const entry = this.ramStore.get(key);
      if (entry) {
        const now = Date.now();
        if (now < entry.expireAt) {
          this.hits++;
          this.ramStore.delete(key);
          this.ramStore.set(key, entry);
          return entry.data as T;
        }
        if (now < entry.staleUntil) {
          // Stale-While-Revalidate: serve cached data immediately and refresh silently in background
          this.staleHits++;
          this.ramStore.delete(key);
          this.ramStore.set(key, entry);
          void this.launchInFlight(key, fetcher, ttlMs).catch(() => {});
          return entry.data as T;
        }
      }
      this.misses++;
    } else {
      this.misses++;
    }

    return this.launchInFlight(key, fetcher, ttlMs);
  }

  /**
   * Explicit Stale-While-Revalidate helper with custom fresh and stale durations
   */
  public async getOrFetchSWR<T>(
    key: string,
    fetcher: () => Promise<T>,
    freshTtlMs: number = this.defaultTtlMs,
    staleWindowMs: number = 15 * 60 * 1000,
    bypassCache = false
  ): Promise<T> {
    if (bypassCache) {
      this.ramStore.delete(key);
      return this.launchInFlight(key, fetcher, freshTtlMs, staleWindowMs);
    }

    if (this.mode === '10k_smart_ram') {
      const entry = this.ramStore.get(key);
      if (entry) {
        const now = Date.now();
        if (now < entry.expireAt) {
          this.hits++;
          this.ramStore.delete(key);
          this.ramStore.set(key, entry);
          return entry.data as T;
        }
        if (now < entry.staleUntil) {
          this.staleHits++;
          this.ramStore.delete(key);
          this.ramStore.set(key, entry);
          void this.launchInFlight(key, fetcher, freshTtlMs, staleWindowMs).catch(() => {});
          return entry.data as T;
        }
      }
    }

    this.misses++;
    return this.launchInFlight(key, fetcher, freshTtlMs, staleWindowMs);
  }

  public async wrap<T>(key: string, ttlMs: number, runner: () => Promise<T>): Promise<T> {
    return this.getOrFetch<T>(key, runner, ttlMs, false);
  }

  public async delete(key: string): Promise<void> {
    this.ramStore.delete(key);
  }

  public async clear(): Promise<void> {
    this.ramStore.clear();
  }

  public getStats(): CacheStatsInfo {
    this.pruneExpired();
    const effectiveHits = this.hits + this.staleHits;
    const total = effectiveHits + this.misses;
    const hitRatioPercent = total > 0 ? Math.round((effectiveHits / total) * 100) : 0;
    const keysCount = this.ramStore.size;

    return {
      engine:
        this.mode === '10k_smart_ram'
          ? '10K High-Concurrency SWR Engine (Single-Flight + Stale-While-Revalidate RAM)'
          : 'Direct Live Stream (Single-Flight Coalescing Only — 0% Storage)',
      mode: this.mode,
      hits: this.hits,
      misses: this.misses,
      staleHits: this.staleHits,
      keys: keysCount,
      keysCount,
      maxKeys: this.maxKeys,
      coalescedSaves: this.coalescedSaves,
      inFlightRequests: this.inFlight.size,
      ksize: keysCount * 64,
      vsize: keysCount * 2048,
      hitRatioPercent,
      defaultTtlSeconds: this.mode === '10k_smart_ram' ? Math.round(this.defaultTtlMs / 1000) : 0,
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
    };
  }

  public getKeys(): string[] {
    this.pruneExpired();
    return Array.from(this.ramStore.keys());
  }
}

export const serverCache = new CacheService();
