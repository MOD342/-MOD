import NodeCache from 'node-cache';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import IORedis from 'ioredis';
import { db } from '../firebase';
import { doc, getDoc, setDoc, deleteDoc, getDocs, collection, writeBatch } from 'firebase/firestore';

export interface CacheEntry<T> {
  data: T;
  expireAt: number;
}

export interface CacheStatsInfo {
  engine: string;
  hits: number;
  misses: number;
  keysCount: number;
  ksize: number;
  vsize: number;
  hitRatioPercent: number;
  defaultTtlSeconds: number;
  uptimeSeconds: number;
}

/**
 * High-Performance Multi-Tier Caching Service
 * Powered by node-cache (In-Memory Layer 1) with automatic TTL expiration,
 * Redis (Distributed Layer 2) and File-System (Persistent Layer 3).
 */
class CacheService {
  // Bump schema version whenever data structures or episode/server logic changes to auto-evict stale .cache/*.json files
  private readonly CACHE_SCHEMA_VERSION = 'v15_clean_real_data';

  // Layer 1: High-Speed In-Memory Cache powered by node-cache
  // Default TTL: 3600 seconds (1 hour) as per system specifications
  private nodeCache: NodeCache;
  private staleMemoryCache = new Map<string, CacheEntry<any>>();

  // Layer 2 & 3 configurations
  private cacheDir: string;
  private isFsAvailable = false;
  private enableCloud = false; // Preserves Firestore quota
  private isRedisAvailable = false;
  private redisClient: IORedis | null = null;
  private startTime = Date.now();

  constructor() {
    // 1. Initialize node-cache with 1-hour default TTL and 2-minute periodic eviction sweep
    this.nodeCache = new NodeCache({
      stdTTL: 3600, // 1 hour default TTL
      checkperiod: 120, // Check for expired keys every 2 minutes
      useClones: false, // Maximum throughput without cloning penalty
      deleteOnExpire: true,
    });

    // Register node-cache event handlers
    this.nodeCache.on('expired', (key: string, value: any) => {
      // Keep a stale copy in memory for emergency fallback if network/API goes down
      if (value !== undefined && value !== null) {
        this.staleMemoryCache.set(key, {
          data: value,
          expireAt: Date.now(),
        });
        // Limit stale cache size to 500 items max to conserve memory
        if (this.staleMemoryCache.size > 500) {
          const firstKey = this.staleMemoryCache.keys().next().value;
          if (firstKey) this.staleMemoryCache.delete(firstKey);
        }
      }
    });

    this.nodeCache.on('flush', () => {
      this.staleMemoryCache.clear();
      console.log('[CacheService] node-cache in-memory store flushed.');
    });

    // 2. Initialize disk cache directory and purge stale schema versions
    this.cacheDir = path.join(process.cwd(), '.cache');
    try {
      if (!fs.existsSync(this.cacheDir)) {
        fs.mkdirSync(this.cacheDir, { recursive: true });
      }
      this.isFsAvailable = true;

      // Check and enforce disk cache schema version
      const versionFile = path.join(this.cacheDir, '__schema_version__.txt');
      const existingVersion = fs.existsSync(versionFile) ? fs.readFileSync(versionFile, 'utf-8').trim() : '';
      if (existingVersion !== this.CACHE_SCHEMA_VERSION) {
        const files = fs.readdirSync(this.cacheDir);
        let removedCount = 0;
        for (const file of files) {
          if (file.endsWith('.json')) {
            try {
              fs.unlinkSync(path.join(this.cacheDir, file));
              removedCount++;
            } catch {}
          }
        }
        fs.writeFileSync(versionFile, this.CACHE_SCHEMA_VERSION, 'utf-8');
        console.log(`[CacheService] Purged ${removedCount} legacy disk cache files for schema ${this.CACHE_SCHEMA_VERSION}`);
      }

      console.log(`[CacheService] node-cache & file persistence ready at: ${this.cacheDir}`);
    } catch (error: any) {
      console.warn('[CacheService] File-system caching unavailable, running memory-only mode:', error.message);
    }

    // 3. Initialize Redis if configured
    this.initRedisCache();
  }

  private initRedisCache() {
    const redisHost = process.env.REDIS_HOST;
    if (!redisHost) {
      this.isRedisAvailable = false;
      return;
    }
    const redisPort = parseInt(process.env.REDIS_PORT || '6379');

    try {
      this.redisClient = new IORedis({
        host: redisHost,
        port: redisPort,
        connectTimeout: 2000,
        maxRetriesPerRequest: 1,
        lazyConnect: true,
        retryStrategy: (times) => {
          if (times > 3) return null; // Stop retrying after 3 failed attempts
          return Math.min(times * 1000, 3000);
        }
      });

      // Bind error listener first to avoid unhandled error events
      this.redisClient.on('error', (err: any) => {
        this.isRedisAvailable = false;
      });

      this.redisClient.connect().then(() => {
        this.isRedisAvailable = true;
        console.log(`[CacheService] Redis Cache connected successfully at redis://${redisHost}:${redisPort} ✔`);
      }).catch((err: any) => {
        this.isRedisAvailable = false;
      });
    } catch (err: any) {
      this.isRedisAvailable = false;
    }
  }

  /**
   * Generates a safe, fixed-length 32-character MD5 hash for any key.
   */
  private getCacheDocId(key: string): string {
    return crypto.createHash('md5').update(key).digest('hex');
  }

  private getFilePath(keyDocId: string): string {
    return path.join(this.cacheDir, `${keyDocId}.json`);
  }

  /**
   * Retrieves data from the cache.
   * Checks Layer 1 (node-cache), Layer 2 (Redis), and Layer 3 (Disk).
   * Supports `allowStale` for fallback resilience during upstream network outages.
   */
  public async get<T>(key: string, allowStale = false): Promise<T | null> {
    const keyDocId = this.getCacheDocId(key);

    // 1. Layer 1: Check node-cache (Sub-millisecond access)
    const memVal = this.nodeCache.get<T>(keyDocId);
    if (memVal !== undefined && memVal !== null) {
      return memVal;
    }

    // Check stale fallback if allowed
    if (allowStale) {
      const stale = this.staleMemoryCache.get(keyDocId);
      if (stale) {
        return stale.data as T;
      }
    }

    const now = Date.now();

    // 2. Layer 2: Check Redis if available (~1-2ms)
    if (this.isRedisAvailable && this.redisClient) {
      try {
        const redisKey = `cache:${keyDocId}`;
        const raw = await this.redisClient.get(redisKey);
        if (raw) {
          const entry: CacheEntry<T> = JSON.parse(raw);
          if (allowStale || now < entry.expireAt) {
            const ttlSec = Math.max(Math.ceil((entry.expireAt - now) / 1000), 60);
            this.nodeCache.set(keyDocId, entry.data, ttlSec);
            return entry.data;
          } else {
            this.redisClient.del(redisKey).catch(() => {});
          }
        }
      } catch (e: any) {
        // Fall through to disk
      }
    }

    // 3. Layer 3: Check disk if available (~3-5ms)
    if (this.isFsAvailable) {
      const filePath = this.getFilePath(keyDocId);
      try {
        if (fs.existsSync(filePath)) {
          const raw = fs.readFileSync(filePath, 'utf-8');
          const entry: CacheEntry<T> = JSON.parse(raw);
          
          if (allowStale || now < entry.expireAt) {
            const ttlSec = Math.max(Math.ceil((entry.expireAt - now) / 1000), 60);
            this.nodeCache.set(keyDocId, entry.data, ttlSec);
            return entry.data;
          } else {
            fs.unlinkSync(filePath);
          }
        }
      } catch (e: any) {
        // Quiet failure on corrupted disk file
      }
    }

    // 4. Layer 4: Cloud Firestore if enabled
    if (this.enableCloud && db) {
      try {
        const docRef = doc(db, 'server_cache', keyDocId);
        const snapshot = await getDoc(docRef);
        if (snapshot.exists()) {
          const entry = snapshot.data() as CacheEntry<T>;
          if (allowStale || now < entry.expireAt) {
            const ttlSec = Math.max(Math.ceil((entry.expireAt - now) / 1000), 60);
            this.nodeCache.set(keyDocId, entry.data, ttlSec);
            return entry.data;
          }
        }
      } catch (e) {}
    }

    return null;
  }

  /**
   * Sets data in the cache with configurable TTL in milliseconds.
   * If ttlMs is not passed, defaults to 1 hour (3600000 ms).
   */
  public async set<T>(key: string, data: T, ttlMs?: number): Promise<void> {
    const durationMs = ttlMs && ttlMs > 0 ? ttlMs : 3600 * 1000; // Default: 1 hour (3600s)
    const ttlSeconds = Math.max(Math.ceil(durationMs / 1000), 1);
    const expireAt = Date.now() + durationMs;
    const entry: CacheEntry<T> = { data, expireAt };
    const keyDocId = this.getCacheDocId(key);

    // 1. Save in node-cache (Layer 1)
    this.nodeCache.set(keyDocId, data, ttlSeconds);

    // 2. Save in Redis (Layer 2)
    if (this.isRedisAvailable && this.redisClient) {
      const redisKey = `cache:${keyDocId}`;
      try {
        const redisTtl = Math.max(ttlSeconds * 2, 120);
        await this.redisClient.set(redisKey, JSON.stringify(entry), 'EX', redisTtl);
      } catch (e: any) {}
    }

    // 3. Save on disk (Layer 3)
    if (this.isFsAvailable) {
      const filePath = this.getFilePath(keyDocId);
      try {
        fs.writeFileSync(filePath, JSON.stringify(entry), 'utf-8');
      } catch (e: any) {}
    }

    // 4. Save in Cloud Firestore if enabled
    if (this.enableCloud && db) {
      try {
        const docRef = doc(db, 'server_cache', keyDocId);
        await setDoc(docRef, entry);
      } catch (e: any) {}
    }
  }

  /**
   * Deletes a specific key from all cache tiers.
   */
  public async delete(key: string): Promise<void> {
    const keyDocId = this.getCacheDocId(key);
    this.nodeCache.del(keyDocId);
    this.staleMemoryCache.delete(keyDocId);

    if (this.isRedisAvailable && this.redisClient) {
      const redisKey = `cache:${keyDocId}`;
      try {
        await this.redisClient.del(redisKey);
      } catch (e: any) {}
    }

    if (this.isFsAvailable) {
      const filePath = this.getFilePath(keyDocId);
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (e: any) {}
    }

    if (this.enableCloud && db) {
      try {
        const docRef = doc(db, 'server_cache', keyDocId);
        await deleteDoc(docRef);
      } catch (e: any) {}
    }
  }

  /**
   * Clears all cached items across all tiers.
   */
  public async clear(): Promise<void> {
    this.nodeCache.flushAll();
    this.staleMemoryCache.clear();

    if (this.isRedisAvailable && this.redisClient) {
      try {
        let cursor = '0';
        do {
          const reply = await this.redisClient.scan(cursor, 'MATCH', 'cache:*', 'COUNT', 100);
          cursor = reply[0];
          const keys = reply[1];
          if (keys && keys.length > 0) {
            await this.redisClient.del(...keys);
          }
        } while (cursor !== '0');
      } catch (e: any) {}
    }

    if (this.isFsAvailable) {
      try {
        const files = fs.readdirSync(this.cacheDir);
        for (const file of files) {
          if (file.endsWith('.json')) {
            fs.unlinkSync(path.join(this.cacheDir, file));
          }
        }
      } catch (e: any) {}
    }

    console.log('[CacheService] Multi-tier cache cleared successfully.');
  }

  /**
   * Helper utility to perform automatic caching on any async operation.
   * If cache hit, returns it. If cache miss, executes the runner, caches, and returns.
   */
  public async wrap<T>(key: string, ttlMs: number, runner: () => Promise<T>): Promise<T> {
    try {
      const cached = await this.get<T>(key);
      if (cached !== null && cached !== undefined) {
        return cached;
      }
    } catch (err: any) {
      console.warn(`[CacheService] Wrap check failed for ${key}:`, err.message);
    }

    // Execute runner operation
    const result = await runner();

    try {
      if (result !== undefined && result !== null) {
        await this.set<T>(key, result, ttlMs);
      }
    } catch (err: any) {
      console.warn(`[CacheService] Wrap set failed for ${key}:`, err.message);
    }

    return result;
  }

  /**
   * Returns live metrics and performance statistics from node-cache.
   */
  public getStats(): CacheStatsInfo {
    const stats = this.nodeCache.getStats();
    const totalRequests = stats.hits + stats.misses;
    const hitRatio = totalRequests > 0 ? (stats.hits / totalRequests) * 100 : 0;

    return {
      engine: 'node-cache (In-Memory) + File & Redis Fallback',
      hits: stats.hits,
      misses: stats.misses,
      keysCount: stats.keys,
      ksize: stats.ksize,
      vsize: stats.vsize,
      hitRatioPercent: parseFloat(hitRatio.toFixed(2)),
      defaultTtlSeconds: 3600, // 1 hour
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000)
    };
  }

  /**
   * Returns list of cached keys currently in memory.
   */
  public getKeys(): string[] {
    return this.nodeCache.keys();
  }
}

export const serverCache = new CacheService();
