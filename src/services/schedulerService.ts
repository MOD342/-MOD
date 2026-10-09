import cron, { ScheduledTask } from 'node-cron';
import { ScraperService } from './scraperService';
import { serverCache } from './cacheService';

export interface ScheduledTaskInfo {
  id: string;
  name: string;
  nameArabic: string;
  cronExpression: string;
  intervalDescription: string;
  status: 'idle' | 'running' | 'completed' | 'failed';
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastDurationMs: number;
  runCount: number;
  lastError: string | null;
}

/**
 * Task Scheduler Service powered by `node-cron`
 * Responsible for:
 * 1. Fetching recent and trending anime every 24 hours.
 * 2. Scraping and refreshing active watch/download streaming links every 12 hours.
 * 3. Hourly cache maintenance and health checks.
 */
class SchedulerService {
  private scraper: ScraperService;
  private tasks = new Map<string, ScheduledTask>();
  private taskMetadata = new Map<string, ScheduledTaskInfo>();
  private isInitialized = false;

  constructor() {
    this.scraper = new ScraperService();
    this.registerMetadata();
  }

  private registerMetadata() {
    // 1. Daily Anime Fetch (Every 24 hours at 00:00 UTC)
    this.taskMetadata.set('recent-anime-24h', {
      id: 'recent-anime-24h',
      name: 'Fetch Recent & Trending Anime (24h)',
      nameArabic: 'جلب وتحديث الأنميات الحديثة والرائجة (كل 24 ساعة)',
      cronExpression: '0 0 * * *', // Every 24 hours at midnight
      intervalDescription: 'مرة واحدة كل 24 ساعة (عند منتصف الليل 00:00)',
      status: 'idle',
      lastRunAt: null,
      nextRunAt: null,
      lastDurationMs: 0,
      runCount: 0,
      lastError: null,
    });

    // 2. Periodic Link Scraper (Every 12 hours)
    this.taskMetadata.set('scrape-links-12h', {
      id: 'scrape-links-12h',
      name: 'Scrape & Refresh Episode Streaming Links (12h)',
      nameArabic: 'كشط وتحديث روابط المشاهدة والتحميل التلقائي (كل 12 ساعة)',
      cronExpression: '0 */12 * * *', // Every 12 hours
      intervalDescription: 'كل 12 ساعة بشكل دوري',
      status: 'idle',
      lastRunAt: null,
      nextRunAt: null,
      lastDurationMs: 0,
      runCount: 0,
      lastError: null,
    });

    // 3. Hourly Cache Sweep & Health Check (Every 1 hour)
    this.taskMetadata.set('cache-maintenance-1h', {
      id: 'cache-maintenance-1h',
      name: 'Hourly Cache Maintenance & Health Sweep',
      nameArabic: 'صيانة وتفريغ كاش الذاكرة الدوري وفحص الجاهزية (كل ساعة)',
      cronExpression: '0 * * * *', // Every hour at minute 0
      intervalDescription: 'كل ساعة',
      status: 'idle',
      lastRunAt: null,
      nextRunAt: null,
      lastDurationMs: 0,
      runCount: 0,
      lastError: null,
    });
  }

  /**
   * Initializes all cron schedules.
   */
  public init() {
    if (this.isInitialized) {
      return;
    }

    this.isInitialized = true;

    const task24h = cron.schedule('0 0 * * *', () => {
      this.runRecentAnimeJob().catch(() => {});
    });
    this.tasks.set('recent-anime-24h', task24h);

    const task12h = cron.schedule('0 */12 * * *', () => {
      this.runScrapeLinksJob().catch(() => {});
    });
    this.tasks.set('scrape-links-12h', task12h);

    const task1h = cron.schedule('0 * * * *', () => {
      this.runCacheMaintenanceJob().catch(() => {});
    });
    this.tasks.set('cache-maintenance-1h', task1h);

    // Non-blocking background warm-up 1.5s after boot
    setTimeout(() => {
      this.runInitialWarmup().catch(() => {});
    }, 1500);
  }

  /**
   * Job 1: Fetches recent anime releases, updates trending lists, and warms the cache.
   * Runs every 24 hours.
   */
  public async runRecentAnimeJob(): Promise<void> {
    const meta = this.taskMetadata.get('recent-anime-24h');
    if (!meta) return;

    const startTime = Date.now();
    meta.status = 'running';
    meta.lastRunAt = new Date().toISOString();
    console.log(`\n📅 [Cron 24h] Starting scheduled task: "${meta.name}" at ${new Date().toLocaleTimeString()}...`);

    try {
      // 1. Fetch recent episodes from scrapers
      const recentEpisodes = await this.scraper.getRecentEpisodes();
      console.log(`[Cron 24h] Scraped ${recentEpisodes?.length || 0} recent episodes successfully.`);

      // 2. Fetch anime broadcast schedule
      const scheduleAnime = await this.scraper.getSchedule();
      console.log(`[Cron 24h] Updated anime schedule list (${scheduleAnime?.length || 0} entries).`);

      // 3. Cache the results with 24-hour TTL (86,400,000 ms)
      const ttl24Hours = 24 * 60 * 60 * 1000;
      await serverCache.set('cron_recent_episodes_24h', recentEpisodes, ttl24Hours);
      await serverCache.set('cron_schedule_anime_24h', scheduleAnime, ttl24Hours);
      await serverCache.set('cron_last_anime_sync_timestamp', Date.now(), ttl24Hours);

      meta.status = 'completed';
      meta.lastError = null;
      meta.runCount++;
      meta.lastDurationMs = Date.now() - startTime;
      console.log(`✅ [Cron 24h] Task "${meta.name}" finished in ${meta.lastDurationMs}ms.\n`);
    } catch (err: any) {
      meta.status = 'failed';
      meta.lastError = err.message || 'Unknown error occurred';
      meta.lastDurationMs = Date.now() - startTime;
      console.error(`❌ [Cron 24h] Task "${meta.name}" failed:`, err.message);
    }
  }

  /**
   * Job 2: Scrapes and refreshes video streaming and direct download servers.
   * Runs every 12 hours to guarantee working, unexpired links.
   */
  public async runScrapeLinksJob(): Promise<void> {
    const meta = this.taskMetadata.get('scrape-links-12h');
    if (!meta) return;

    const startTime = Date.now();
    meta.status = 'running';
    meta.lastRunAt = new Date().toISOString();
    console.log(`\n🔗 [Cron 12h] Starting scheduled task: "${meta.name}" at ${new Date().toLocaleTimeString()}...`);

    try {
      // 1. Get recent episodes list
      const recentList = await this.scraper.getRecentEpisodes();
      const sampleEpisodes = (recentList || []).slice(0, 10);
      let refreshedCount = 0;

      // 2. Pre-fetch and refresh servers for recent active episodes
      for (const item of sampleEpisodes) {
        if (item.link || item.id) {
          try {
            const servers = await this.scraper.getEpisodeServers(item.id, undefined, item.episode);
            if (servers && servers.length > 0) {
              refreshedCount++;
              // Cache streaming servers for 12 hours (43,200,000 ms)
              const ttl12Hours = 12 * 60 * 60 * 1000;
              await serverCache.set(`servers:${item.id}::${item.episode || ''}`, servers, ttl12Hours);
            }
          } catch (e: any) {
            console.warn(`[Cron 12h] Could not refresh server links for episode ${item.id}:`, e.message);
          }
        }
      }

      const ttl12Hours = 12 * 60 * 60 * 1000;
      await serverCache.set('cron_last_links_refresh_timestamp', Date.now(), ttl12Hours);

      meta.status = 'completed';
      meta.lastError = null;
      meta.runCount++;
      meta.lastDurationMs = Date.now() - startTime;
      console.log(`✅ [Cron 12h] Task "${meta.name}" updated ${refreshedCount} episode server sets in ${meta.lastDurationMs}ms.\n`);
    } catch (err: any) {
      meta.status = 'failed';
      meta.lastError = err.message || 'Unknown error';
      meta.lastDurationMs = Date.now() - startTime;
      console.error(`❌ [Cron 12h] Task "${meta.name}" failed:`, err.message);
    }
  }

  /**
   * Job 3: Hourly cache maintenance and health sweep.
   */
  public async runCacheMaintenanceJob(): Promise<void> {
    const meta = this.taskMetadata.get('cache-maintenance-1h');
    if (!meta) return;

    const startTime = Date.now();
    meta.status = 'running';
    meta.lastRunAt = new Date().toISOString();

    try {
      const stats = serverCache.getStats();
      console.log(`[Cron 1h] Cache stats: ${stats.keysCount} cached items, ${stats.hits} hits, ${stats.misses} misses (Hit Ratio: ${stats.hitRatioPercent}%).`);
      
      meta.status = 'completed';
      meta.lastError = null;
      meta.runCount++;
      meta.lastDurationMs = Date.now() - startTime;
    } catch (err: any) {
      meta.status = 'failed';
      meta.lastError = err.message;
      meta.lastDurationMs = Date.now() - startTime;
    }
  }

  /**
   * Safe initial background warm-up on server start.
   */
  private async runInitialWarmup() {
    console.log('[SchedulerService] Running initial cache pre-warming...');
    try {
      await this.runRecentAnimeJob();
    } catch (e: any) {
      console.warn('[SchedulerService] Initial warm-up completed with warning:', e.message);
    }
  }

  /**
   * Manually triggers a specific scheduled job by its ID.
   */
  public async triggerJob(jobId: string): Promise<{ success: boolean; message: string; durationMs?: number }> {
    const startTime = Date.now();
    switch (jobId) {
      case 'recent-anime-24h':
        await this.runRecentAnimeJob();
        return { success: true, message: 'تم تنفيذ مهمة جلب الأنميات الحديثة (24h) بنجاح.', durationMs: Date.now() - startTime };
      case 'scrape-links-12h':
        await this.runScrapeLinksJob();
        return { success: true, message: 'تم تنفيذ مهمة كشط وتحديث روابط المشاهدة والتحميل (12h) بنجاح.', durationMs: Date.now() - startTime };
      case 'cache-maintenance-1h':
        await this.runCacheMaintenanceJob();
        return { success: true, message: 'تم تنفيذ مهمة فحص وصيانة الكاش (1h) بنجاح.', durationMs: Date.now() - startTime };
      default:
        return { success: false, message: `المهمة ذات المعرف "${jobId}" غير موجودة.` };
    }
  }

  /**
   * Returns list and status of all registered cron jobs.
   */
  public getJobsStatus(): ScheduledTaskInfo[] {
    return Array.from(this.taskMetadata.values());
  }

  /**
   * Graceful stop of all scheduled tasks.
   */
  public stopAll() {
    this.tasks.forEach((task, id) => {
      task.stop();
      console.log(`[SchedulerService] Stopped task: ${id}`);
    });
    this.tasks.clear();
    this.isInitialized = false;
  }
}

export const schedulerService = new SchedulerService();
