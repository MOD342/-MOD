import { Router, Request, Response } from "express";
import crypto from "crypto";
import { serverCache } from "../../services/cacheService";
import { cleanAnimeTitle } from "../../utils/animeTitleCleaner";
import { scraper, handleAsync } from "../helpers/shared";
import { extractDirectStream, STREAM_UA } from "../helpers/streamExtractors";
import {
  resolveBestDownloadTarget,
  streamResolvedDownloadTarget,
  normalizeQualityTier,
  type PreferredQuality,
  type ResolvedDownloadTarget,
} from "../helpers/downloadResolver";
import {
  isSafePublicHttpUrl,
  parseSafePublicHttpUrl,
  validateSafePublicHttpUrl,
} from "../helpers/urlSafety";

const router = Router();
const recentBypassTimestamps = new Map<number, number>();
const RECENT_BYPASS_COOLDOWN_MS = 60_000;

function unwrapSafeCandidateUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("/api/anime/download") || trimmed.includes("/api/anime/download?")) {
    try {
      const dummyParsed = new URL(trimmed, "https://app.local");
      const inner = dummyParsed.searchParams.get("url") || "";
      if (isSafePublicHttpUrl(inner)) {
        return trimmed;
      }
      return null;
    } catch {
      return null;
    }
  }

  return isSafePublicHttpUrl(trimmed) ? trimmed : null;
}

router.get(
  "/anime/schedule",
  handleAsync(async (req: Request, res: Response) => {
    const day = typeof req.query.day === "string" ? req.query.day : undefined;
    const bypass = req.query.bypass === "true";
    const data = await scraper.getSchedule(day, bypass);
    res.json({ success: true, data });
  }),
);

router.get(
  "/anime/movies",
  handleAsync(async (req: Request, res: Response) => {
    const bypass = req.query.bypass === "true";
    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
    const { items, hasNext } = await scraper.getAnimeMovies(page, bypass);
    res.json({
      success: true,
      page,
      hasNext,
      hasPrev: page > 1,
      data: items || [],
    });
  }),
);

router.get(
  "/anime/top",
  handleAsync(async (req: Request, res: Response) => {
    const bypass = req.query.bypass === "true";
    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
    const { items, hasNext } = await scraper.getTopAnime(page, bypass);
    res.json({
      success: true,
      page,
      hasNext,
      hasPrev: page > 1,
      data: items || [],
    });
  }),
);

// مسار لجلب أحدث الأنميات مع دعم التصفح عبر الصفحات (?page=1, 2, 3...)
// GET /api/anime/recent
router.get(
  "/anime/recent",
  handleAsync(async (req: Request, res: Response) => {
    const rawBypass = req.query.bypass === "true";
    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
    const nowMs = Date.now();
    const lastBypassAt = recentBypassTimestamps.get(page) || 0;
    const bypass = rawBypass && nowMs - lastBypassAt >= RECENT_BYPASS_COOLDOWN_MS;

    if (bypass) {
      recentBypassTimestamps.set(page, nowMs);
      await serverCache.delete("recent_episodes");
      await serverCache.delete(`recent_episodes_okanime_primary_v1_page_${page}`);
      await serverCache.delete(`recent_episodes_animedar_isolated_v3_page_${page}`);
    }
    const rawData = await scraper.getRecentEpisodes(bypass, page);

    if (!rawData || rawData.length === 0) {
      return res.status(404).json({
        success: false,
        message: "لم يتم العثور على أنميات حديثة في هذه الصفحة.",
        page,
        hasNext: false,
        hasPrev: page > 1,
        data: [],
      });
    }

    const data = rawData.map((item) => {
      const rawWithSeason = (item.title || "")
        .replace(/(?:الحلقة|حلقة)\s*\d+.*$/i, "")
        .replace(/مترجم.*$/i, "")
        .replace(/اون\s*لاين.*$/i, "")
        .replace(/^انمي\s+/i, "")
        .trim();
      const cleaned = cleanAnimeTitle(item.title);
      const seasonMatch = (item.title || "").match(/(?:الموسم|موسم|Season)\s*(\d+)/i);
      const displayTitle =
        seasonMatch && !cleaned.includes("الموسم") && !cleaned.toLowerCase().includes("season")
          ? `${cleaned} S${seasonMatch[1]}`
          : cleaned;

      const slugFromId = item.id && item.id.includes("__ep__") ? item.id.split("__ep__")[0] : "";

      return {
        ...item,
        title: displayTitle,
        episodeNumber: item.episode,
        posterUrl: item.imageUrl,
        thumbnailUrl: item.imageUrl,
        animeId: slugFromId || `search-${rawWithSeason || cleaned}`,
      };
    });

    res.json({
      success: true,
      message: "تم جلب الأنميات الحديثة بنجاح.",
      page,
      hasNext: data.length >= 10,
      hasPrev: page > 1,
      data,
    });
  }),
);

// 2. مسار لجلب سيرفرات المشاهدة لحلقة معينة
// POST /api/anime/servers
router.post(
  "/anime/servers",
  handleAsync(async (req: Request, res: Response) => {
    const { url, animeId, episodeNum, seasonNumber, animeTitle } = req.body;

    if (!url || typeof url !== "string") {
      return res.status(400).json({
        success: false,
        message: "يرجى توفير رابط الحلقة (url) صحيح في جسم الطلب.",
        data: [],
      });
    }

    const data = await scraper.getEpisodeServers(url, animeId, episodeNum, seasonNumber, animeTitle);

    res.json({
      success: true,
      message: "تم جلب سيرفرات المشاهدة بنجاح.",
      data,
    });
  }),
);

router.get(
  "/anime/stream-proxy",
  handleAsync(async (req: Request, res: Response) => {
    const rawUrl = (req.query.url as string) || "";
    const referer = (req.query.referer as string) || "";
    const safeInitialUrl = await validateSafePublicHttpUrl(rawUrl);
    if (!safeInitialUrl) {
      return res.status(400).send("Invalid or unsafe stream URL");
    }

    const safeReferer = referer && isSafePublicHttpUrl(referer) ? referer : "";

    const proxyHeaders: Record<string, string> = {
      "User-Agent": STREAM_UA,
      Accept: "*/*",
    };

    if (safeReferer) {
      proxyHeaders["Referer"] = safeReferer;
    }

    if (req.headers.range) {
      proxyHeaders["Range"] = req.headers.range as string;
    }

    try {
      let currentUrl = safeInitialUrl.toString();
      let upstream: globalThis.Response | null = null;

      for (let hop = 0; hop <= 5; hop += 1) {
        const hopSafe = await validateSafePublicHttpUrl(currentUrl);
        if (!hopSafe) {
          return res.status(400).send("Blocked redirect to unsafe host");
        }
        const hopHeaders: Record<string, string> = {
          "User-Agent": proxyHeaders["User-Agent"],
          Accept: "*/*",
        };
        if (req.headers.range) {
          hopHeaders["Range"] = req.headers.range as string;
        }
        if (safeReferer && !hopSafe.hostname.includes("vidcache.net")) {
          hopHeaders["Referer"] = safeReferer;
        }

        const resp = await fetch(hopSafe.toString(), {
          headers: hopHeaders,
          redirect: "manual",
          signal: AbortSignal.timeout(25_000),
        });

        if (
          (resp.status === 301 ||
            resp.status === 302 ||
            resp.status === 303 ||
            resp.status === 307 ||
            resp.status === 308) &&
          resp.headers.get("location")
        ) {
          try {
            await resp.body?.cancel();
          } catch {}
          currentUrl = new URL(resp.headers.get("location")!, hopSafe.toString()).href;
          continue;
        }

        upstream = resp;
        if (resp.url && isSafePublicHttpUrl(resp.url)) {
          currentUrl = resp.url;
        } else {
          currentUrl = hopSafe.toString();
        }
        break;
      }

      if (!upstream) {
        return res.status(502).send("Too many redirects");
      }

      const finalUpstreamUrl = currentUrl;
      const upstreamCt = (upstream.headers.get("content-type") || "").toLowerCase();
      const isM3u8 =
        upstream.ok &&
        (upstreamCt.includes("mpegurl") ||
          /\.m3u8(?:$|[?#])/i.test(finalUpstreamUrl));

      if (isM3u8) {
        const playlistText = await upstream.text();
        if (playlistText.includes("#EXTM3U")) {
          const toProxied = (refTarget: string) => {
            try {
              const abs = new URL(refTarget.trim(), finalUpstreamUrl).href;
              if (!parseSafePublicHttpUrl(abs)) return "";
              return `/api/anime/stream-proxy?url=${encodeURIComponent(abs)}${
                safeReferer ? `&referer=${encodeURIComponent(safeReferer)}` : ""
              }`;
            } catch {
              return refTarget;
            }
          };

          const rewritten = playlistText
            .split(/\r?\n/)
            .map((line) => {
              const trimmed = line.trim();
              if (!trimmed) return line;
              if (trimmed.startsWith("#")) {
                return line.replace(/URI="([^"]+)"/gi, (_m, uriVal) => `URI="${toProxied(uriVal)}"`);
              }
              return toProxied(trimmed);
            })
            .join("\n");

          res.status(200);
          res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.setHeader("Cache-Control", "no-store");
          return res.send(rewritten);
        }
      }

      res.status(upstream.status);
      const forwardHeaders = [
        "content-type",
        "content-length",
        "content-range",
        "accept-ranges",
      ];
      forwardHeaders.forEach((h) => {
        const val = upstream.headers.get(h);
        if (val) res.setHeader(h, val);
      });
      res.setHeader("Access-Control-Allow-Origin", "*");

      if (!upstream.body) {
        return res.end();
      }

      const reader = upstream.body.getReader();
      let clientClosed = false;
      res.on("close", () => {
        if (!res.writableFinished) {
          clientClosed = true;
          reader.cancel().catch(() => {});
        }
      });

      while (true) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const readRes = await Promise.race([
          reader.read().finally(() => {
            if (timer) clearTimeout(timer);
          }),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error("Upstream stream read timeout")), 25_000);
          }),
        ]);
        const { done, value } = readRes;
        if (done || clientClosed) break;
        if (!res.writableEnded) {
          res.write(Buffer.from(value));
        } else {
          break;
        }
      }
      if (!res.writableEnded) {
        res.end();
      }
    } catch (err) {
      if (!res.headersSent) {
        res.status(502).send("Stream proxy error");
      } else if (!res.writableEnded) {
        res.end();
      }
    }
  })
);

router.post(
  "/anime/resolve-download",
  handleAsync(async (req: Request, res: Response) => {
    const { url, fallbackUrls, serverCandidates, preferredQuality, title, ep, preferExternal } = req.body || {};
    const serverMetaMap: Record<string, { quality?: string; serverName?: string }> = {};
    const candidateFromObjects: string[] = [];

    if (Array.isArray(serverCandidates)) {
      for (const item of serverCandidates) {
        if (item && typeof item.url === "string" && item.url.trim()) {
          const safeCandidate = unwrapSafeCandidateUrl(item.url);
          if (!safeCandidate) continue;
          candidateFromObjects.push(safeCandidate);
          serverMetaMap[safeCandidate] = {
            quality: typeof item.quality === "string" ? item.quality : undefined,
            serverName: typeof item.serverName === "string" ? item.serverName : undefined,
          };
        }
      }
    }

    const candidates: string[] = [
      ...(unwrapSafeCandidateUrl(url) ? [unwrapSafeCandidateUrl(url)!] : []),
      ...(Array.isArray(fallbackUrls)
        ? fallbackUrls
            .map((u: any) => unwrapSafeCandidateUrl(u))
            .filter((u): u is string => Boolean(u))
        : []),
      ...candidateFromObjects,
    ];

    if (candidates.length === 0) {
      return res.status(400).json({ success: false, message: "لا توجد روابط سيرفرات عامة صالحة للتحميل." });
    }

    const normalizedPref: PreferredQuality =
      preferredQuality === "auto" || !preferredQuality
        ? "auto"
        : normalizeQualityTier(String(preferredQuality)) || "auto";

    const isDirectEntry = typeof url === "string" && url.includes("/api/anime/download");
    const wantPublicExternal = Boolean(preferExternal || isDirectEntry);
    const { primary: resolved, publicExternal } = await resolveBestDownloadTarget(
      candidates,
      String(title || "Anime"),
      String(ep || "1"),
      wantPublicExternal,
      !wantPublicExternal,
      normalizedPref,
      serverMetaMap,
    );

    if (!resolved) {
      return res.json({
        success: false,
        message: "لم يتم العثور على رابط مباشر لهذه الحلقة حالياً.",
      });
    }

    const token = `dl_${crypto.randomBytes(12).toString("hex")}`;
    await serverCache.set(`download_token:${token}`, resolved, 60 * 60 * 1000);

    const extTarget =
      publicExternal && publicExternal.mode === "mp4" && publicExternal.publicNoReferer
        ? publicExternal
        : resolved.publicNoReferer && resolved.mode === "mp4"
        ? resolved
        : null;

    const resolvedQuality = resolved.resolvedQuality || "HD";
    const usedFallbackQuality =
      normalizedPref !== "auto" && resolvedQuality !== normalizedPref;

    res.json({
      success: true,
      mode: resolved.mode,
      token,
      downloadUrl: `/api/anime/download-stream?token=${token}`,
      externalDirectUrl: extTarget ? extTarget.streamUrl : null,
      externalDirectMime: extTarget ? (extTarget.mimeType || "video/mp4") : null,
      filename: resolved.filename,
      sizeBytes: resolved.sizeBytes || null,
      resolvedQuality,
      requestedQuality: normalizedPref,
      usedFallbackQuality,
      serverName: resolved.serverName || null,
    });
  }),
);

// تجهيز رابط بث مباشر قابل للتشغيل الفوري في المشغلات الخارجية (MX Player / VLC / مشغل النظام)
router.post(
  "/anime/resolve-play",
  handleAsync(async (req: Request, res: Response) => {
    const { url, fallbackUrls, serverCandidates, preferredQuality, title, ep } = req.body || {};
    const serverMetaMap: Record<string, { quality?: string; serverName?: string }> = {};
    const candidateFromObjects: string[] = [];

    if (Array.isArray(serverCandidates)) {
      for (const item of serverCandidates) {
        if (item && typeof item.url === "string" && item.url.trim()) {
          const safeCandidate = unwrapSafeCandidateUrl(item.url);
          if (!safeCandidate) continue;
          candidateFromObjects.push(safeCandidate);
          serverMetaMap[safeCandidate] = {
            quality: typeof item.quality === "string" ? item.quality : undefined,
            serverName: typeof item.serverName === "string" ? item.serverName : undefined,
          };
        }
      }
    }

    const candidates: string[] = [
      ...(unwrapSafeCandidateUrl(url) ? [unwrapSafeCandidateUrl(url)!] : []),
      ...(Array.isArray(fallbackUrls)
        ? fallbackUrls
            .map((u: any) => unwrapSafeCandidateUrl(u))
            .filter((u): u is string => Boolean(u))
        : []),
      ...candidateFromObjects,
    ];

    if (candidates.length === 0) {
      return res.status(400).json({ success: false, message: "لا توجد روابط عامة صالحة للتشغيل الخارجي." });
    }

    const normalizedPref: PreferredQuality =
      preferredQuality === "auto" || !preferredQuality
        ? "auto"
        : normalizeQualityTier(String(preferredQuality)) || "auto";

    const { primary: resolved, publicExternal } = await resolveBestDownloadTarget(
      candidates,
      String(title || "Anime"),
      String(ep || "1"),
      true,
      false,
      normalizedPref,
      serverMetaMap,
    );

    if (!resolved) {
      return res.json({
        success: false,
        message: "تعذر تجهيز رابط التشغيل المباشر، يرجى تجربة خيار آخر.",
      });
    }

    const resolvedQuality = resolved.resolvedQuality || "HD";

    // الأولوية القصوى للروابط المباشرة من الـ CDN التي لا تتطلب Referer ولا تمر عبر بوابة مصادقة التطبيق
    const directPublic = publicExternal || (resolved.publicNoReferer ? resolved : null);
    if (directPublic && directPublic.publicNoReferer) {
      return res.json({
        success: true,
        isDirectCdn: true,
        mode: directPublic.mode === "hls-remux" ? "hls" : directPublic.mode,
        streamUrl: directPublic.streamUrl,
        mimeType:
          directPublic.mimeType ||
          (directPublic.mode === "hls-remux" ? "application/vnd.apple.mpegurl" : "video/mp4"),
        filename:
          directPublic.mode === "hls-remux"
            ? directPublic.filename.replace(/\.mp4$/i, ".m3u8")
            : directPublic.filename,
        resolvedQuality: directPublic.resolvedQuality || resolvedQuality,
        requestedQuality: normalizedPref,
      });
    }

    const token = `pl_${crypto.randomBytes(12).toString("hex")}`;
    await serverCache.set(`play_token:${token}`, resolved, 6 * 60 * 60 * 1000);
    const safeFile = encodeURIComponent(resolved.filename || "episode.mp4");

    res.json({
      success: true,
      isDirectCdn: false,
      mode: resolved.mode,
      streamUrl: `/api/anime/play-stream/${token}/${safeFile}`,
      mimeType: resolved.mimeType || "video/mp4",
      filename: resolved.filename,
      resolvedQuality,
      requestedQuality: normalizedPref,
    });
  }),
);

// بث ملف الفيديو مباشرة في وضع Inline للمشغلات الخارجية مع دعم كامل للتقديم والتأخير (Range)
router.get(
  "/anime/play-stream/:token/:filename",
  handleAsync(async (req: Request, res: Response) => {
    const token = req.params.token || "";
    if (!token) {
      return res.status(400).send("Missing stream token");
    }
    const target = await serverCache.get<ResolvedDownloadTarget>(`play_token:${token}`);
    if (!target) {
      return res.status(404).send("انتهت صلاحية رابط البث، يرجى الضغط مجدداً");
    }

    await streamResolvedDownloadTarget(target, req, res, false);
  }),
);

// بث ملف الفيديو مباشرة كملف مرفق للتنزيل الفوري عبر Token موثق
router.get(
  "/anime/download-stream",
  handleAsync(async (req: Request, res: Response) => {
    const token = (req.query.token as string) || "";
    if (!token) {
      return res.status(400).send("Missing download token");
    }
    const target = await serverCache.get<ResolvedDownloadTarget>(`download_token:${token}`);
    if (!target) {
      return res.status(404).send("انتهت صلاحية رابط التحميل، يرجى الضغط على تنزيل مجدداً");
    }

    await streamResolvedDownloadTarget(target, req, res, true);
  }),
);

// مسار التحميل المباشر الذكي لحلقات الأنمي (MOD Direct Downloader) — لا يعيد أبداً ملف HTML
router.get(
  "/anime/download",
  handleAsync(async (req: Request, res: Response) => {
    const rawUrl = (req.query.url as string) || "";
    const title = (req.query.title as string) || "Anime";
    const ep = (req.query.ep as string) || "1";

    if (!rawUrl || !(await validateSafePublicHttpUrl(rawUrl))) {
      return res.status(400).send("رابط التحميل غير صالح أو غير مسموح");
    }

    const { primary: resolved } = await resolveBestDownloadTarget([rawUrl], title, ep, false);
    if (!resolved) {
      return res
        .status(404)
        .send("تعذر تجهيز ملف الفيديو المباشر حالياً، يرجى تجربة خيار آخر.");
    }

    await streamResolvedDownloadTarget(resolved, req, res, true);
  }),
);

router.post(
  "/anime/extract",
  handleAsync(async (req: Request, res: Response) => {
    const { url } = req.body;
    if (!url || typeof url !== "string" || !(await validateSafePublicHttpUrl(url))) {
      return res.status(400).json({ success: false, message: "رابط غير صالح أو غير مسموح" });
    }

    const extractKey = `extract_stream_v6:${url}`;
    const extracted = await serverCache.getOrFetch(
      extractKey,
      () => extractDirectStream(url),
      5 * 60 * 1000
    );

    res.json({
      success: true,
      message: "تم تجهيز رابط المشاهدة بنجاح.",
      data: {
        directUrl: extracted.directUrl,
        type: extracted.type,
        sources: extracted.sources || [],
      },
    });
  }),
);

export default router;
