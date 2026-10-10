import { db } from '../firebase';
import { doc, deleteDoc, getDocs, collection } from 'firebase/firestore';

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
 * Direct Zero-Cache Service (وضع الاتصال المباشر الحي بدون أي تخزين مؤقت)
 * تم إلغاء وحذف جميع وحدات التخزين (node-cache / Disk .cache / Redis / Cloud Cache)
 * ليعمل التطبيق بشكل مباشر وفوري 100% من المصادر الحية دون أي بيانات قديمة.
 */
class CacheService {
  private startTime = Date.now();
  private directRequests = 0;

  constructor() {
    // No memory, disk, or Redis cache initialized — 100% live direct mode
  }

  public async get<T>(_key: string, _allowStale = false): Promise<T | null> {
    this.directRequests++;
    return null;
  }

  public async set<T>(_key: string, _data: T, _ttlMs?: number): Promise<void> {
    // No-op: Direct live mode does not store any cache
  }

  public async delete(_key: string): Promise<void> {
    // No-op
  }

  public async clear(): Promise<void> {
    if (db) {
      try {
        const snap = await getDocs(collection(db, 'server_cache'));
        if (!snap.empty) {
          await Promise.all(snap.docs.map(d => deleteDoc(doc(db, 'server_cache', d.id)).catch(() => {})));
        }
      } catch {}
    }
  }

  public async wrap<T>(_key: string, _ttlMs: number, runner: () => Promise<T>): Promise<T> {
    this.directRequests++;
    return await runner();
  }

  public getStats(): CacheStatsInfo {
    return {
      engine: 'Direct Live Stream (Zero-Cache Mode — بدون أي تخزين مؤقت)',
      hits: 0,
      misses: this.directRequests,
      keysCount: 0,
      ksize: 0,
      vsize: 0,
      hitRatioPercent: 0,
      defaultTtlSeconds: 0,
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
    };
  }

  public getKeys(): string[] {
    return [];
  }
}

export const serverCache = new CacheService();
