import { Router, Request, Response } from "express";
import { serverCache } from "../../services/cacheService";
import { schedulerService } from "../../services/schedulerService";
import { requireServerAdminAuth } from "../adminAuth";
import { handleAsync } from "../helpers/shared";
import {
  fetchWithSafeRedirects,
  isSafePublicHttpUrl,
  validateSafePublicHttpUrl,
} from "../helpers/urlSafety";

const router = Router();

router.get(
  "/system/health",
  handleAsync(async (req: Request, res: Response) => {
    const stats = serverCache.getStats();
    const jobs = schedulerService.getJobsStatus();
    res.json({
      success: true,
      data: {
        status: "ok",
        runtime: process.env.VERCEL ? "vercel-serverless" : "node-express",
        uptimeSeconds: Math.round(process.uptime()),
        cache: {
          engine: stats.engine,
          mode: stats.mode,
          keysCount: stats.keysCount,
          hits: stats.hits,
          staleHits: stats.staleHits,
          misses: stats.misses,
          hitRatioPercent: stats.hitRatioPercent,
        },
        scheduler: {
          totalJobs: jobs.length,
          jobs: jobs.map((j) => ({
            id: j.id,
            nameArabic: j.nameArabic,
            cronExpression: j.cronExpression,
            status: j.status,
            runCount: j.runCount,
            lastRunAt: j.lastRunAt,
            lastDurationMs: j.lastDurationMs,
          })),
        },
      },
    });
  }),
);

// -------------------------------------------------------------
// مسارات إدارة ومراقبة التخزين المؤقت (node-cache Caching Engine) - محمية بـ Firebase Admin SDK
// -------------------------------------------------------------
router.get(
  "/cache/stats",
  requireServerAdminAuth("moderator", "access_dashboard"),
  handleAsync(async (req: Request, res: Response) => {
    const stats = serverCache.getStats();
    const keys = serverCache.getKeys();
    res.json({
      success: true,
      data: {
        stats,
        activeKeysCount: keys.length,
        sampleKeys: keys.slice(0, 20),
      },
    });
  }),
);

router.post(
  "/cache/mode",
  requireServerAdminAuth("moderator", "manage_cache_queue"),
  handleAsync(async (req: Request, res: Response) => {
    const { mode } = req.body;
    const targetMode =
      mode === "zero_live" || mode === "zero_cache_direct"
        ? "zero_live"
        : "10k_smart_ram";
    serverCache.setMode(targetMode);
    const currentStats = serverCache.getStats();
    res.json({
      success: true,
      mode: targetMode,
      stats: currentStats,
      data: {
        mode: targetMode,
        stats: currentStats,
      },
      message:
        targetMode === "10k_smart_ram"
          ? "تم تفعيل محرك الـ 10,000 مستخدم (دمج الطلبات + ذاكرة RAM اللحظية)"
          : "تم تفعيل وضع البث المباشر النقي (0 ثانية)",
    });
  }),
);

router.post(
  "/cache/clear",
  requireServerAdminAuth("moderator", "manage_cache_queue"),
  handleAsync(async (req: Request, res: Response) => {
    await serverCache.clear();
    try {
      const { ScraperQueue } = await import("../../services/queueService");
      ScraperQueue.clearJobs();
    } catch {}
    res.json({
      success: true,
      message: "تم تفريغ كافة مستويات التخزين المؤقت بنجاح (node-cache / Redis / Disk / Queue).",
    });
  }),
);

router.post(
  "/system/factory-reset",
  requireServerAdminAuth("owner", "factory_wipe"),
  handleAsync(async (req: Request, res: Response) => {
    await serverCache.clear();
    try {
      const { ScraperQueue } = await import("../../services/queueService");
      ScraperQueue.clearJobs();
    } catch {}
    res.json({
      success: true,
      message: "تم تنظيف الخادم، حذف النسخ المؤقتة (.cache)، وتصفير قوائم الانتظار والذاكرة بنجاح.",
      timestamp: Date.now(),
    });
  }),
);

// -------------------------------------------------------------
// مسارات مجدول المهام التلقائي (node-cron Task Scheduler) - محمية بـ Firebase Admin SDK
// -------------------------------------------------------------
router.get(
  "/scheduler/status",
  requireServerAdminAuth("moderator", "access_dashboard"),
  handleAsync(async (req: Request, res: Response) => {
    const jobs = schedulerService.getJobsStatus();
    res.json({
      success: true,
      data: {
        totalJobs: jobs.length,
        jobs,
      },
    });
  }),
);

router.post(
  "/scheduler/run/:jobId",
  requireServerAdminAuth("moderator", "manage_cache_queue"),
  handleAsync(async (req: Request, res: Response) => {
    const { jobId } = req.params;
    const result = await schedulerService.triggerJob(jobId);
    if (!result.success) {
      return res.status(400).json({ success: false, message: result.message });
    }
    res.json({
      success: true,
      message: result.message,
      durationMs: result.durationMs,
    });
  }),
);

router.get(
  "/queue/status",
  requireServerAdminAuth("moderator", "access_dashboard"),
  handleAsync(async (req: Request, res: Response) => {
    const { ScraperQueue } = await import("../../services/queueService");
    const status = ScraperQueue.getStatus();
    res.json({ success: true, ...status });
  }),
);

router.post(
  "/queue/add",
  requireServerAdminAuth("moderator", "manage_cache_queue"),
  handleAsync(async (req: Request, res: Response) => {
    const { name, data = {}, maxRetries = 2 } = req.body;
    if (!name) {
      return res
        .status(400)
        .json({ success: false, message: "اسم المهمة مطلوب" });
    }
    const { ScraperQueue } = await import("../../services/queueService");
    const jobId = await ScraperQueue.addJob(name, data, maxRetries);
    res.json({
      success: true,
      message:
        "تمت جدولة عملية الـ Scraping وإضافتها لصف الانتظار للعمل بشكل غير متزامن.",
      jobId,
    });
  }),
);

router.post(
  "/queue/clear",
  requireServerAdminAuth("moderator", "manage_cache_queue"),
  handleAsync(async (req: Request, res: Response) => {
    const { ScraperQueue } = await import("../../services/queueService");
    ScraperQueue.clearJobs();
    res.json({
      success: true,
      message: "تم تصفية سجل صفوف العمل المكتملة والمعلقة.",
    });
  }),
);

async function resolveVastXmlRecursive(
  vastUrl: string,
  depth = 0,
): Promise<{
  videoUrl: string;
  clickThroughUrl: string;
  durationSeconds: number;
  title: string;
  impressions: string[];
}> {
  if (depth > 2 || !(await validateSafePublicHttpUrl(vastUrl))) {
    throw new Error("Invalid or unsupported VAST URL");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const resp = await fetchWithSafeRedirects(vastUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/124.0 Mobile Safari/537.36",
        Accept: "application/xml, text/xml, */*",
      },
    });
    if (!resp.ok) throw new Error(`VAST HTTP ${resp.status}`);
    const xml = await resp.text();
    const { load } = await import("cheerio");
    const $ = load(xml, { xmlMode: true });

    const wrapperTagUri = $("VASTAdTagURI").first().text().trim();
    if (wrapperTagUri && isSafePublicHttpUrl(wrapperTagUri)) {
      const wrapped = await resolveVastXmlRecursive(wrapperTagUri, depth + 1);
      const localImpressions = $("Impression")
        .map((_, el) => $(el).text().trim())
        .get()
        .filter((u) => isSafePublicHttpUrl(u));
      return {
        ...wrapped,
        impressions: [...localImpressions, ...wrapped.impressions],
      };
    }

    const mediaFiles = $("MediaFile")
      .map((_, el) => ({
        url: $(el).text().trim(),
        type: ($(el).attr("type") || "").toLowerCase(),
        delivery: ($(el).attr("delivery") || "").toLowerCase(),
      }))
      .get()
      .filter((m) => isSafePublicHttpUrl(m.url));

    const mp4 =
      mediaFiles.find((m) => m.type.includes("mp4") && m.delivery === "progressive") ||
      mediaFiles.find((m) => m.type.includes("mp4")) ||
      mediaFiles.find((m) => m.type.includes("webm")) ||
      mediaFiles[0];

    const durationRaw = $("Duration").first().text().trim();
    let durationSeconds = 30;
    const durMatch = durationRaw.match(/^(\d{2}):(\d{2}):(\d{2})/);
    if (durMatch) {
      durationSeconds =
        Number(durMatch[1]) * 3600 + Number(durMatch[2]) * 60 + Number(durMatch[3]);
    }

    const clickThroughUrl = $("ClickThrough").first().text().trim();
    const title = $("AdTitle").first().text().trim() || "إعلان راعي الفيديو";
    const impressions = $("Impression")
      .map((_, el) => $(el).text().trim())
      .get()
      .filter((u) => isSafePublicHttpUrl(u));

    return {
      videoUrl: mp4?.url || "",
      clickThroughUrl: isSafePublicHttpUrl(clickThroughUrl) ? clickThroughUrl : "",
      durationSeconds: Math.max(15, Math.min(90, durationSeconds || 30)),
      title,
      impressions,
    };
  } finally {
    clearTimeout(timeout);
  }
}

router.get(
  "/ads/resolve-vast",
  handleAsync(async (req: Request, res: Response) => {
    const rawUrl = String(req.query.url || "").trim();
    if (!rawUrl || !isSafePublicHttpUrl(rawUrl)) {
      return res.status(400).json({ success: false, message: "رابط VAST غير صالح." });
    }
    try {
      const data = await resolveVastXmlRecursive(rawUrl);
      if (!data.videoUrl) {
        return res.status(404).json({ success: false, message: "لم يتم العثور على ملف فيديو داخل استجابة VAST." });
      }
      res.json({ success: true, data });
    } catch (err: any) {
      res.status(502).json({
        success: false,
        message: err?.message || "تعذر جلب إعلان الفيديو.",
      });
    }
  }),
);

export default router;
