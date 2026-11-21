import { Router, Request, Response } from "express";
import { mangaService, MANGA_GENRES_LIST, MangaOriginFilter } from "../../services/mangaService";
import { handleAsync } from "../helpers/shared";

const router = Router();

function isSafeExternalImageUrl(rawUrl: string): URL | null {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    const host = parsed.hostname.toLowerCase();
    // Block loopback, RFC1918 private ranges, and link-local metadata endpoints
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "0.0.0.0" ||
      host === "::1" ||
      host.startsWith("10.") ||
      host.startsWith("192.168.") ||
      host.startsWith("169.254.") ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
      host.endsWith(".local")
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
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
    const details = await mangaService.getMangaDetails(req.params.id);
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
    const parsed = isSafeExternalImageUrl(rawUrl);
    if (!parsed) {
      return res.status(400).json({ success: false, message: "رابط الصورة غير صالح." });
    }

    try {
      const hostLower = parsed.hostname.toLowerCase();
      const referer = hostLower.includes("olympustaff")
        ? "https://olympustaff.com/"
        : hostLower.includes("azorafly") || hostLower.includes("azoramoon")
          ? "https://azoramoon.com/"
          : hostLower.includes("3asq")
            ? "https://3asq.online/"
            : `${parsed.origin}/`;

      const upstream = await fetch(parsed.toString(), {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/125.0.0.0",
          Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
          Referer: referer,
        },
        signal: AbortSignal.timeout(15_000),
      });

      if (!upstream.ok) {
        return res.status(upstream.status).end();
      }

      const contentType = upstream.headers.get("content-type") || "image/jpeg";
      if (contentType.includes("text/html")) {
        return res.status(502).end();
      }

      const arrayBuf = await upstream.arrayBuffer();
      const buffer = Buffer.from(arrayBuf);
      if (buffer.byteLength === 0) {
        return res.status(502).end();
      }

      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "public, max-age=86400, immutable");
      res.setHeader("Content-Length", String(buffer.byteLength));
      return res.status(200).send(buffer);
    } catch {
      return res.status(504).end();
    }
  }),
);

export default router;
