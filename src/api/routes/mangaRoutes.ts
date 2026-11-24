import { Router, Request, Response } from "express";
import { mangaService, MANGA_GENRES_LIST, MangaOriginFilter } from "../../services/mangaService";
import { handleAsync } from "../helpers/shared";
import { fetchWithSafeRedirects, validateSafePublicHttpUrl } from "../helpers/urlSafety";

const router = Router();

interface CachedProxyImage {
  buffer: Buffer;
  contentType: string;
  expiresAt: number;
}
const proxyImageCache = new Map<string, CachedProxyImage>();
const inFlightProxyImages = new Map<string, Promise<{ status: number; contentType?: string; buffer?: Buffer }>>();
let proxyImageCacheBytes = 0;
const MAX_PROXY_IMAGE_CACHE_BYTES = 32 * 1024 * 1024; // 32MB strict RAM ceiling
const MAX_SINGLE_PROXY_IMAGE_BYTES = 1_500_000; // Skip caching individual images > 1.5MB
const PROXY_IMAGE_TTL_MS = 10 * 60 * 1000;

function getCachedProxyImage(key: string): CachedProxyImage | null {
  const hit = proxyImageCache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    proxyImageCache.delete(key);
    proxyImageCacheBytes = Math.max(0, proxyImageCacheBytes - hit.buffer.byteLength);
    return null;
  }
  proxyImageCache.delete(key);
  proxyImageCache.set(key, hit);
  return hit;
}

function setCachedProxyImage(key: string, entry: CachedProxyImage): void {
  const size = entry.buffer.byteLength;
  if (size <= 0 || size > MAX_SINGLE_PROXY_IMAGE_BYTES) return;
  const prev = proxyImageCache.get(key);
  if (prev) {
    proxyImageCache.delete(key);
    proxyImageCacheBytes = Math.max(0, proxyImageCacheBytes - prev.buffer.byteLength);
  }
  while (proxyImageCacheBytes + size > MAX_PROXY_IMAGE_CACHE_BYTES && proxyImageCache.size > 0) {
    const oldestKey = proxyImageCache.keys().next().value;
    if (oldestKey === undefined) break;
    const oldest = proxyImageCache.get(oldestKey);
    proxyImageCache.delete(oldestKey);
    if (oldest) proxyImageCacheBytes = Math.max(0, proxyImageCacheBytes - oldest.buffer.byteLength);
  }
  proxyImageCache.set(key, entry);
  proxyImageCacheBytes += size;
}

router.get(
  "/manga/hub",
  handleAsync(async (req: Request, res: Response) => {
    const origin = (String(req.query.origin || "ALL").toUpperCase() as MangaOriginFilter) || "ALL";
    const page = Math.max(1, Number(req.query.page) || 1);
    const data = await mangaService.getHub(origin, page);
    return res.json({ success: true, data });
  }),
);

router.get(
  "/manga/trending",
  handleAsync(async (req: Request, res: Response) => {
    const origin = (String(req.query.origin || "ALL").toUpperCase() as MangaOriginFilter) || "ALL";
    const hub = await mangaService.getHub(origin, 1);
    return res.json({ success: true, data: hub.trending || [] });
  }),
);

router.get(
  "/manga/latest",
  handleAsync(async (req: Request, res: Response) => {
    const origin = (String(req.query.origin || "ALL").toUpperCase() as MangaOriginFilter) || "ALL";
    const page = Math.max(1, Number(req.query.page) || 1);
    const hub = await mangaService.getHub(origin, page);
    return res.json({
      success: true,
      data: hub.latest || [],
      pagination: { has_next_page: hub.hasNextPage, current_page: hub.currentPage },
    });
  }),
);

router.get(
  "/manga/search",
  handleAsync(async (req: Request, res: Response) => {
    const { q, origin, genres, status, min_score, order_by, sort, year, page } = req.query;
    const genreList =
      typeof genres === "string" && genres.trim()
        ? genres.split(",").map((g) => g.trim()).filter(Boolean)
        : [];
    const result = await mangaService.searchManga({
      q: typeof q === "string" ? q : "",
      origin: (String(origin || "ALL").toUpperCase() as MangaOriginFilter) || "ALL",
      genres: genreList,
      status: typeof status === "string" ? status : undefined,
      minScore: min_score ? parseFloat(String(min_score)) : undefined,
      year: year ? Number(year) : undefined,
      orderBy: typeof order_by === "string" ? order_by : undefined,
      sort: typeof sort === "string" ? sort : undefined,
      page: page ? Number(page) : 1,
    });
    return res.json({ success: true, ...result });
  }),
);

router.get(
  "/manga/genres",
  handleAsync(async (_req: Request, res: Response) => {
    return res.json({ success: true, data: MANGA_GENRES_LIST });
  }),
);

router.get(
  "/manga/details/:id",
  handleAsync(async (req: Request, res: Response) => {
    const bypassCache = req.query.refresh === "1" || req.query.refresh === "true";
    const details = await mangaService.getMangaDetails(req.params.id, bypassCache);
    if (!details) {
      return res.status(404).json({ success: false, message: "لم يتم العثور على هذا العمل." });
    }
    return res.json({ success: true, data: details });
  }),
);

router.get(
  "/manga/chapters",
  handleAsync(async (req: Request, res: Response) => {
    const mangaId = typeof req.query.mangaId === "string" ? req.query.mangaId : undefined;
    const mangadexId = typeof req.query.mangadexId === "string" ? req.query.mangadexId : undefined;
    const title = typeof req.query.title === "string" ? req.query.title : undefined;
    const altTitle = typeof req.query.altTitle === "string" ? req.query.altTitle : undefined;
    const synonymsRaw = typeof req.query.synonyms === "string" ? req.query.synonyms : "";
    const synonyms = synonymsRaw
      ? synonymsRaw
          .split("||")
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined;

    const bypassCache = req.query.refresh === "1" || req.query.refresh === "true";

    const result = await mangaService.getMangaChapters({
      mangaId,
      mangadexId,
      title,
      altTitle,
      synonyms,
      bypassCache,
    });
    return res.json({ success: true, ...result });
  }),
);

router.get(
  "/manga/pages",
  handleAsync(async (req: Request, res: Response) => {
    const chapterId = String(req.query.chapterId || "").trim();
    const quality = req.query.quality === "saver" ? "saver" : "high";
    if (!chapterId) {
      return res.status(400).json({ success: false, message: "معرف الفصل مطلوب." });
    }
    try {
      const data = await mangaService.getChapterPages(chapterId, quality);
      return res.json({ success: true, data });
    } catch (err: any) {
      return res.status(502).json({
        success: false,
        message: err?.message || "تعذر تحميل صفحات الفصل حالياً.",
      });
    }
  }),
);

router.get(
  "/manga/image-proxy",
  handleAsync(async (req: Request, res: Response) => {
    const rawUrl = String(req.query.url || "").trim();
    const parsed = await validateSafePublicHttpUrl(rawUrl);
    if (!parsed) {
      return res.status(400).json({ success: false, message: "رابط الصورة غير صالح." });
    }

    const targetUrl = parsed.toString();
    const cached = getCachedProxyImage(targetUrl);
    if (cached) {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Content-Type", cached.contentType);
      res.setHeader("Cache-Control", "public, max-age=86400, immutable");
      res.setHeader("Content-Length", String(cached.buffer.byteLength));
      return res.status(200).send(cached.buffer);
    }

    try {
      let flight = inFlightProxyImages.get(targetUrl);
      if (!flight) {
        flight = (async () => {
          const hostLower = parsed.hostname.toLowerCase();
          const referer = hostLower.includes("olympustaff")
            ? "https://olympustaff.com/"
            : hostLower.includes("azorafly") || hostLower.includes("azoramoon")
              ? "https://azoramoon.com/"
              : hostLower.includes("3asq")
                ? "https://3asq.online/"
                : `${parsed.origin}/`;

          const upstream = await fetchWithSafeRedirects(targetUrl, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/125.0.0.0",
              Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
              Referer: referer,
            },
            signal: AbortSignal.timeout(15_000),
          });

          if (!upstream.ok) {
            return { status: upstream.status };
          }

          const contentType = upstream.headers.get("content-type") || "image/jpeg";
          if (contentType.includes("text/html")) {
            return { status: 502 };
          }

          const arrayBuf = await upstream.arrayBuffer();
          const buffer = Buffer.from(arrayBuf);
          if (buffer.byteLength === 0) {
            return { status: 502 };
          }

          setCachedProxyImage(targetUrl, {
            buffer,
            contentType,
            expiresAt: Date.now() + PROXY_IMAGE_TTL_MS,
          });
          return { status: 200, contentType, buffer };
        })().finally(() => {
          inFlightProxyImages.delete(targetUrl);
        });
        inFlightProxyImages.set(targetUrl, flight);
      }

      const result = await flight;
      if (result.status !== 200 || !result.buffer) {
        return res.status(result.status).end();
      }

      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Content-Type", result.contentType || "image/jpeg");
      res.setHeader("Cache-Control", "public, max-age=86400, immutable");
      res.setHeader("Content-Length", String(result.buffer.byteLength));
      return res.status(200).send(result.buffer);
    } catch {
      return res.status(504).end();
    }
  }),
);

export default router;
