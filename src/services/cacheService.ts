import { db } from '../firebase';
import { doc, deleteDoc, getDocs, collection } from 'firebase/firestore';

export type ServerCacheMode = '10k_smart_ram' | 'zero_live' | 'zero_cache_direct';

export interface CacheEntry<T> {
  data: T;
  expireAt: number;
}

export interface CacheStatsInfo {
  engine: string;
  mode: '10k_smart_ram' | 'zero_live';
  hits: number;
  misses: number;
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
 * 10,000+ Concurrent Users Smart RAM Micro-Cache & Single-Flight Request Coalescing Engine
 * - Single-Flight Coalescing: Merges 1,000s of simultaneous identical requests into 1 upstream call.
 * -Bounded Ephemeral RAM Cache: Short-lived (90s - 5m) in-memory cache with LRU eviction (Max 300 keys).
 * - Zero Disk / Zero LocalStorage / Zero Persistent Stale Files: Never writes `.cache` files or permanent cache.
 */
class CacheService {
  private startTime = Date.now();
  private mode: '10k_smart_ram' | 'zero_live' = '10k_smart_ram';
  private ramStore = new Map<string, CacheEntry<any>>();
  private inFlight = new Map<string, Promise<any>>();
  private readonly maxKeys = 300;
  private readonly defaultTtlMs = 90 * 1000; // 90 seconds default micro-cache

  private hits = 0;
  private misses = 0;
  private coalescedSaves = 0;

  constructor() {
    // Periodic lightweight cleanup of expired RAM entries every 60s
    const timer = setInterval(() => this.pruneExpired(), 60 * 1000);
    if (typeof (timer as any).unref === 'function') {
      (timer as any).unref();
    }
  }

  private pruneExpired(): void {
    const now = Date.now();
    for (const [k, entry] of this.ramStore.entries()) {
      if (now >= entry.expireAt) {
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
    if (now >= entry.expireAt && !allowStale) {
      this.ramStore.delete(key);
      this.misses++;
      return null;
    }

    // Refresh LRU order
    this.ramStore.delete(key);
    this.ramStore.set(key, entry);
    this.hits++;
    return entry.data as T;
  }

  public async set<T>(key: string, data: T, ttlMs: number = this.defaultTtlMs): Promise<void> {
    if (this.mode === 'zero_live' || ttlMs <= 0 || data === undefined || data === null) {
      return;
    }

    // Cap maximum TTL at 10 minutes to strictly prevent stale data buildup
    const safeTtlMs = Math.min(ttlMs, 10 * 60 * 1000);

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

    this.ramStore.set(key, {
      data,
      expireAt: Date.now() + safeTtlMs,
    });
  }

  /**
   * Single-Flight Request Coalescing + Smart RAM Micro-Cache
   * Even in 'zero_live' mode, simultaneous identical requests arriving at the exact same millisecond
   * are coalesced into a single upstream call so 10,000 concurrent users never trigger 429 rate-limits.
   */
  public async getOrFetch<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttlMs: number = this.defaultTtlMs,
    bypassCache = false
  ): Promise<T> {
    if (bypassCache) {
      this.ramStore.delete(key);
    } else if (this.mode === '10k_smart_ram') {
      const cached = await this.get<T>(key);
      if (cached !== null) {
        return cached;
      }
    } else {
      this.misses++;
    }

    // Single-Flight Request Coalescing
    const existingFlight = this.inFlight.get(key);
    if (existingFlight && !bypassCache) {
      this.coalescedSaves++;
      return existingFlight as Promise<T>;
    }

    const flightPromise = (async () => {
      try {
        const result = await fetcher();
        if (this.mode === '10k_smart_ram' && result !== undefined && result !== null) {
          const isEmptyArray = Array.isArray(result) && result.length === 0;
          if (!isEmptyArray) {
            await this.set(key, result, ttlMs);
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

  public async wrap<T>(key: string, ttlMs: number, runner: () => Promise<T>): Promise<T> {
    return this.getOrFetch<T>(key, runner, ttlMs, false);
  }

  public async delete(key: string): Promise<void> {
    this.ramStore.delete(key);
  }

  public async clear(): Promise<void> {
    this.ramStore.clear();
    if (db) {
      try {
        const snap = await getDocs(collection(db, 'server_cache'));
        if (!snap.empty) {
          await Promise.all(
            snap.docs.map((d) => deleteDoc(doc(db, 'server_cache', d.id)).catch(() => {}))
          );
        }
      } catch {}
    }
  }

  public getStats(): CacheStatsInfo {
    this.pruneExpired();
    const total = this.hits + this.misses;
    const hitRatioPercent = total > 0 ? Math.round((this.hits / total) * 100) : 0;
    const keysCount = this.ramStore.size;

    return {
      engine:
        this.mode === '10k_smart_ram'
          ? '10K High-Concurrency Engine (Single-Flight Coalescing + Ephemeral RAM)'
          : 'Direct Live Stream (Single-Flight Coalescing Only — 0% Storage)',
      mode: this.mode,
      hits: this.hits,
      misses: this.misses,
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
