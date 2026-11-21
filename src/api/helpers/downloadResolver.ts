import type { Request, Response } from "express";
import crypto from "crypto";
import { spawn } from "child_process";
import * as cheerio from "cheerio";
import { serverCache } from "../../services/cacheService";
import { fetchWithTimeout } from "./jikanClient";
import { extractDirectStream, extractVideaDirectSources, STREAM_UA } from "./streamExtractors";

export interface ResolvedDownloadTarget {
  streamUrl: string;
  referer: string;
  filename: string;
  mode: "mp4" | "hls-remux" | "mega";
  sizeBytes?: number;
  serverName?: string;
  resolvedQuality?: "FHD" | "HD" | "SD";
  megaKeyHex?: string;
  megaNonceHex?: string;
  publicNoReferer?: boolean;
  mimeType?: string;
}

export type PreferredQuality = "FHD" | "HD" | "SD" | "auto";

export function normalizeQualityTier(raw?: string | null): "FHD" | "HD" | "SD" | null {
  const l = String(raw || "").toLowerCase();
  if (!l) return null;
  if (l.includes("1080") || l.includes("fhd") || l.includes("full")) return "FHD";
  if (l.includes("720") || l.includes("hd")) return "HD";
  if (l.includes("480") || l.includes("360") || l.includes("240") || l.includes("sd")) return "SD";
  return null;
}

function scoreQualityMatch(
  candidateQuality: "FHD" | "HD" | "SD" | null,
  preferred: PreferredQuality,
): number {
  if (!candidateQuality) {
    return preferred === "auto" ? 40 : 20;
  }
  if (preferred === "auto") {
    if (candidateQuality === "FHD") return 120;
    if (candidateQuality === "HD") return 90;
    return 50;
  }
  if (candidateQuality === preferred) return 300;
  // Automatic fallback order when exact requested quality isn't present:
  // Always prefer the highest quality alternative available (FHD > HD > SD)
  if (preferred === "FHD") {
    return candidateQuality === "HD" ? 180 : 100;
  }
  if (preferred === "HD") {
    return candidateQuality === "FHD" ? 170 : 140;
  }
  // preferred === "SD"
  return candidateQuality === "HD" ? 170 : 120;
}

function isDirectVideoFileUrl(u: string): boolean {
  try {
    const p = new URL(u).pathname.toLowerCase();
    return p.endsWith(".mp4") || p.endsWith(".mkv") || p.endsWith(".webm");
  } catch {
    return /\.(?:mp4|mkv|webm)(?:$|[?#])/i.test(u);
  }
}

function getHostReferer(sourceUrl: string): string {
  try {
    const u = new URL(sourceUrl);
    if (u.hostname.includes("yourupload")) return "https://www.yourupload.com/";
    if (u.hostname.includes("mp4upload")) return "https://www.mp4upload.com/";
    if (u.hostname.includes("sendvid")) return "https://sendvid.com/";
    if (u.hostname.includes("ok.ru")) return "https://ok.ru/";
    return `${u.protocol}//${u.hostname}/`;
  } catch {
    return "";
  }
}

function decodeMegaBase64Url(b64: string): Buffer {
  const norm = b64.replace(/-/g, "+").replace(/_/g, "/");
  const pad = "==".slice(0, (4 - (norm.length % 4)) % 4);
  return Buffer.from(norm + pad, "base64");
}

async function resolveMegaTarget(
  megaUrl: string,
  fallbackFilename: string,
): Promise<ResolvedDownloadTarget | null> {
  try {
    const m =
      megaUrl.match(/mega\.nz\/(?:file|embed)\/([^#/?]+)#([A-Za-z0-9_-]+)/i) ||
      megaUrl.match(/mega\.nz\/#!([^!/?]+)!([A-Za-z0-9_-]+)/i);
    if (!m) return null;
    const fileId = m[1];
    const keyB64 = m[2];
    const rawKey = decodeMegaBase64Url(keyB64);
    if (rawKey.length < 32) return null;

    const aesKey = Buffer.alloc(16);
    for (let i = 0; i < 16; i++) {
      aesKey[i] = rawKey[i] ^ rawKey[i + 16];
    }
    const nonce = rawKey.subarray(16, 24);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    let apiData: any;
    try {
      const apiResp = await fetch("https://g.api.mega.co.nz/cs?id=1", {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": STREAM_UA },
        body: JSON.stringify([{ a: "g", g: 1, p: fileId }]),
        signal: controller.signal,
      });
      if (!apiResp.ok) return null;
      const arr = await apiResp.json();
      apiData = Array.isArray(arr) ? arr[0] : null;
    } finally {
      clearTimeout(timer);
    }

    if (!apiData || typeof apiData !== "object" || !apiData.g || !apiData.s) {
      return null;
    }

    const sizeBytes = Number(apiData.s);
    if (!Number.isFinite(sizeBytes) || sizeBytes < 100 * 1024) return null;

    let finalName = fallbackFilename;
    if (typeof apiData.at === "string") {
      try {
        const atBuf = decodeMegaBase64Url(apiData.at);
        const attrDec = crypto.createDecipheriv("aes-128-cbc", aesKey, Buffer.alloc(16));
        attrDec.setAutoPadding(false);
        const attrRaw = Buffer.concat([attrDec.update(atBuf), attrDec.final()])
          .toString("utf8")
          .replace(/\0+$/, "");
        if (attrRaw.startsWith("MEGA{")) {
          const parsedAttr = JSON.parse(attrRaw.slice(4));
          if (parsedAttr?.n && /\.(mp4|mkv|webm)$/i.test(parsedAttr.n)) {
            const cleanAttrName = String(parsedAttr.n).replace(/[^\w\u0600-\u06FF.\s-]/gi, "").trim();
            if (cleanAttrName) finalName = cleanAttrName;
          }
        }
      } catch (_) {}
    }

    return {
      streamUrl: String(apiData.g),
      referer: "https://mega.nz/",
      filename: fallbackFilename || finalName,
      mode: "mega",
      sizeBytes,
      serverName: "Mega",
      megaKeyHex: aesKey.toString("hex"),
      megaNonceHex: nonce.toString("hex"),
    };
  } catch {
    return null;
  }
}

async function fetchUpstreamFollowRedirect(
  targetUrl: string,
  referer: string,
  rangeHeader?: string,
  timeoutMs = 8000,
): Promise<globalThis.Response> {
  const headers: Record<string, string> = {
    "User-Agent": STREAM_UA,
    Accept: "*/*",
  };
  if (referer) {
    headers["Referer"] = referer;
    try {
      const refObj = new URL(referer);
      headers["Origin"] = `${refObj.protocol}//${refObj.host}`;
    } catch (_) {}
  }
  if (rangeHeader) {
    headers["Range"] = rangeHeader;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let upstream = await fetch(targetUrl, {
      headers,
      redirect: "manual",
      signal: controller.signal,
    });

    if (
      (upstream.status === 301 ||
        upstream.status === 302 ||
        upstream.status === 303 ||
        upstream.status === 307 ||
        upstream.status === 308) &&
      upstream.headers.get("location")
    ) {
      const nextUrl = new URL(upstream.headers.get("location")!, targetUrl).href;
      const nextHeaders: Record<string, string> = {
        "User-Agent": STREAM_UA,
        Accept: "*/*",
      };
      if (rangeHeader) nextHeaders["Range"] = rangeHeader;
      if (referer && !nextUrl.includes("vidcache.net")) {
        nextHeaders["Referer"] = referer;
      }
      upstream = await fetch(nextUrl, {
        headers: nextHeaders,
        redirect: "follow",
        signal: controller.signal,
      });
    }

    return upstream;
  } finally {
    clearTimeout(timer);
  }
}

async function verifyBinaryVideoUrl(
  candidateStreamUrl: string,
  referer: string,
): Promise<{ ok: boolean; sizeBytes?: number }> {
  try {
    const resp = await fetchUpstreamFollowRedirect(
      candidateStreamUrl,
      referer,
      "bytes=0-4095",
      6000,
    );
    try {
      await resp.body?.cancel();
    } catch (_) {}

    if (!resp.ok) return { ok: false };
    const ct = (resp.headers.get("content-type") || "").toLowerCase();
    if (
      ct.includes("text/html") ||
      ct.includes("application/xhtml") ||
      ct.includes("application/json") ||
      ct.includes("text/plain")
    ) {
      return { ok: false };
    }

    let sizeBytes: number | undefined;
    const contentRange = resp.headers.get("content-range") || "";
    const rangeMatch = contentRange.match(/\/(\d+)$/);
    if (rangeMatch) {
      sizeBytes = parseInt(rangeMatch[1], 10);
    } else if (resp.headers.get("content-length")) {
      const cl = parseInt(resp.headers.get("content-length") || "0", 10);
      if (cl > 0) sizeBytes = cl;
    }

    if (
      ct.startsWith("video/") ||
      ct.includes("application/octet-stream") ||
      ct.includes("binary/octet-stream") ||
      (sizeBytes !== undefined && sizeBytes > 500 * 1024)
    ) {
      return { ok: true, sizeBytes };
    }
    return { ok: false };
  } catch {
    return { ok: false };
  }
}

async function readChunkWithTimeout(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  timeoutMs = 25_000,
): Promise<{ done: boolean; value?: Uint8Array }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    reader.read().finally(() => {
      if (timer) clearTimeout(timer);
    }),
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Upstream read idle timeout")), timeoutMs);
    }),
  ]);
}

async function extractMegaMaxMirrors(
  rawUrl: string,
  preferredQuality: PreferredQuality,
): Promise<Array<{ url: string; qualityTier: "FHD" | "HD" | "SD" | null; sizeBytes?: number }>> {
  try {
    const u = new URL(rawUrl);
    const idMatch = u.pathname.match(/\/(?:iframe|e|d)\/([A-Za-z0-9_-]+)/i);
    if (!idMatch) return [];
    const hashId = idMatch[1];
    const origin = `${u.protocol}//${u.host}`;
    const iframeUrl = `${origin}/iframe/${hashId}`;

    const pageResp = await fetchWithTimeout(
      iframeUrl,
      { headers: { "User-Agent": STREAM_UA, Referer: `${origin}/` } },
      4500,
    );
    if (!pageResp.ok) return [];
    const html = await pageResp.text();
    const versionMatch = html.match(/"version"\s*:\s*"([a-f0-9]+)"/i);
    const inertiaVersion = versionMatch?.[1] || "";

    const partialResp = await fetchWithTimeout(
      iframeUrl,
      {
        headers: {
          "User-Agent": STREAM_UA,
          "X-Inertia": "true",
          ...(inertiaVersion ? { "X-Inertia-Version": inertiaVersion } : {}),
          "X-Inertia-Partial-Component": "files/mirror/video",
          "X-Inertia-Partial-Data": "streams",
          "X-Requested-With": "XMLHttpRequest",
          Referer: iframeUrl,
        },
      },
      5500,
    );
    if (!partialResp.ok) return [];
    const json: any = await partialResp.json();
    const streamGroups: any[] = Array.isArray(json?.props?.streams?.data)
      ? json.props.streams.data
      : [];
    if (streamGroups.length === 0) return [];

    const sortedGroups = [...streamGroups].sort(
      (a, b) =>
        scoreQualityMatch(normalizeQualityTier(b?.label), preferredQuality) -
        scoreQualityMatch(normalizeQualityTier(a?.label), preferredQuality),
    );

    const mirrorList: Array<{ url: string; qualityTier: "FHD" | "HD" | "SD" | null; sizeBytes?: number }> = [];
    const preferredDrivers = ["mixdrop", "lulustream", "videa", "sendvid", "mp4upload", "uqload", "streamwish", "dood"];

    for (const grp of sortedGroups) {
      const qTier = normalizeQualityTier(grp?.label) || null;
      const sizeBytes = Number(grp?.size) > 0 ? Number(grp.size) : undefined;
      const mirrors: any[] = Array.isArray(grp?.mirrors) ? grp.mirrors : [];
      const sortedMirrors = [...mirrors].sort((a, b) => {
        const da = String(a?.driver || "").toLowerCase();
        const db = String(b?.driver || "").toLowerCase();
        const ia = preferredDrivers.findIndex((p) => da.includes(p));
        const ib = preferredDrivers.findIndex((p) => db.includes(p));
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      });
      for (const m of sortedMirrors) {
        let link = String(m?.link || "").trim();
        if (!link) continue;
        if (link.startsWith("//")) link = `https:${link}`;
        if (!link.startsWith("http")) continue;
        const dLower = String(m?.driver || link).toLowerCase();
        if (
          dLower.includes("mixdrop") ||
          dLower.includes("lulustream") ||
          dLower.includes("videa") ||
          dLower.includes("sendvid") ||
          dLower.includes("mp4upload") ||
          dLower.includes("uqload") ||
          dLower.includes("wish") ||
          dLower.includes("dood")
        ) {
          mirrorList.push({ url: link, qualityTier: qTier, sizeBytes });
        }
      }
    }
    return mirrorList;
  } catch {
    return [];
  }
}

async function resolveSingleCandidateToVideo(
  rawUrl: string,
  filename: string,
  preferredQuality: PreferredQuality = "auto",
  serverQualityHint?: "FHD" | "HD" | "SD" | null,
): Promise<{ mp4?: ResolvedDownloadTarget; hls?: ResolvedDownloadTarget }> {
  if (!rawUrl || !rawUrl.startsWith("http")) return {};

  // Videa.hu public no-referer MP4/WebM direct CDN stream
  if (rawUrl.toLowerCase().includes("videa.hu")) {
    const vSrcs = await serverCache.getOrFetch(
      `videa_direct_v1:${rawUrl}`,
      () => extractVideaDirectSources(rawUrl),
      15 * 60 * 1000,
    );
    const orderedVidea = [...vSrcs].sort((a, b) => {
      const qa = normalizeQualityTier((a as any).label || (a as any).quality) || serverQualityHint || null;
      const qb = normalizeQualityTier((b as any).label || (b as any).quality) || serverQualityHint || null;
      return scoreQualityMatch(qb, preferredQuality) - scoreQualityMatch(qa, preferredQuality);
    });
    for (const vs of orderedVidea) {
      const check = await verifyBinaryVideoUrl(vs.file, "");
      if (check.ok) {
        const isWebm = vs.mimeType.includes("webm");
        const finalName = isWebm ? filename.replace(/\.mp4$/i, ".webm") : filename;
        const resolvedQuality =
          normalizeQualityTier((vs as any).label || (vs as any).quality) ||
          serverQualityHint ||
          "HD";
        return {
          mp4: {
            streamUrl: vs.file,
            referer: "",
            filename: finalName,
            mode: "mp4",
            sizeBytes: check.sizeBytes,
            serverName: "Videa",
            resolvedQuality,
            publicNoReferer: true,
            mimeType: vs.mimeType || "video/mp4",
          },
        };
      }
    }
    return {};
  }

  // Mega.nz direct API + AES-128-CTR decrypt stream
  if (rawUrl.toLowerCase().includes("mega.nz/")) {
    const megaTarget = await serverCache.getOrFetch(
      `mega_target_v1:${rawUrl}`,
      () => resolveMegaTarget(rawUrl, filename),
      30 * 60 * 1000,
    );
    if (megaTarget) {
      return {
        mp4: {
          ...megaTarget,
          filename,
          resolvedQuality: serverQualityHint || "HD",
          publicNoReferer: false,
          mimeType: "video/mp4",
        },
      };
    }
    return {};
  }

  // Google Drive direct binary download (bypasses virus scan HTML page)
  if (rawUrl.includes("drive.google.com") || rawUrl.includes("gdrive")) {
    const dMatch =
      rawUrl.match(/\/d\/([A-Za-z0-9_-]+)/) ||
      rawUrl.match(/id=([A-Za-z0-9_-]+)/);
    if (dMatch) {
      const gUrl = `https://drive.usercontent.google.com/download?id=${dMatch[1]}&export=download&confirm=t`;
      const check = await verifyBinaryVideoUrl(gUrl, "");
      if (check.ok) {
        return {
          mp4: {
            streamUrl: gUrl,
            referer: "",
            filename,
            mode: "mp4",
            sizeBytes: check.sizeBytes,
            serverName: "Google Drive",
            resolvedQuality: serverQualityHint || "HD",
            publicNoReferer: true,
            mimeType: "video/mp4",
          },
        };
      }
    }
  }

  // MegaMax / Share4Max multi-resolution mirror expansion
  if (rawUrl.toLowerCase().includes("megamax.") || rawUrl.toLowerCase().includes("share4max.")) {
    const mirrors = await serverCache.getOrFetch(
      `megamax_mirrors_v1:${rawUrl}:${preferredQuality}`,
      () => extractMegaMaxMirrors(rawUrl, preferredQuality),
      5 * 60 * 1000,
    );
    let hlsBackup: ResolvedDownloadTarget | undefined;
    for (const mirror of mirrors.slice(0, 5)) {
      const sub = await resolveSingleCandidateToVideo(
        mirror.url,
        filename,
        preferredQuality,
        mirror.qualityTier || serverQualityHint || null,
      ).catch((): { mp4?: ResolvedDownloadTarget; hls?: ResolvedDownloadTarget } => ({}));
      if (sub.mp4) {
        if (!sub.mp4.sizeBytes && mirror.sizeBytes) sub.mp4.sizeBytes = mirror.sizeBytes;
        return { mp4: sub.mp4 };
      }
      if (sub.hls && !hlsBackup) {
        hlsBackup = sub.hls;
      }
    }
    return hlsBackup ? { hls: hlsBackup } : {};
  }

  const candidateUrlsToTry: {
    streamUrl: string;
    referer: string;
    isHls: boolean;
    qualityTier: "FHD" | "HD" | "SD" | null;
  }[] = [];

  if (isDirectVideoFileUrl(rawUrl)) {
    candidateUrlsToTry.push({
      streamUrl: rawUrl,
      referer: getHostReferer(rawUrl),
      isHls: false,
      qualityTier: serverQualityHint || normalizeQualityTier(rawUrl),
    });
  } else {
    // Normalize non-embed URLs to embed URLs where scrapers give direct streams
    let extractInput = rawUrl;
    if (extractInput.includes("uqload")) {
      const uqMatch = extractInput.match(/(https?:\/\/[^/]+\/)(?:e\/|embed-)?([A-Za-z0-9_-]+)/i);
      if (uqMatch && !extractInput.includes("/embed-")) {
        extractInput = `${uqMatch[1]}embed-${uqMatch[2]}.html`;
      }
    }
    if (extractInput.includes("mp4upload.com/") && !extractInput.includes("/embed-")) {
      extractInput = extractInput.replace(/mp4upload\.com\/([A-Za-z0-9_-]+)/i, "mp4upload.com/embed-$1.html");
    }
    if (extractInput.includes("vidmoly") && !extractInput.includes("/embed-")) {
      extractInput = extractInput.replace(/(vidmoly\.[a-z]+\/)([A-Za-z0-9_-]+)/i, "$1embed-$2");
    }
    if (
      (extractInput.includes("asnwish") ||
        extractInput.includes("streamwish") ||
        extractInput.includes("awish") ||
        extractInput.includes("swish")) &&
      extractInput.includes("/f/")
    ) {
      extractInput = extractInput.replace("/f/", "/e/");
    }
    if (extractInput.includes("ok.ru/video/")) {
      extractInput = extractInput.replace("/video/", "/videoembed/");
    }
    if (extractInput.includes("yourupload.com/watch/")) {
      extractInput = extractInput.replace("/watch/", "/embed/");
    }

    const extracted = await serverCache.getOrFetch(
      `extract_stream_v7:${extractInput}`,
      () => extractDirectStream(extractInput),
      5 * 60 * 1000,
    );

    const allSources = [
      ...(extracted.directUrl
        ? [{ file: extracted.directUrl, label: "Primary", type: extracted.type === "hls" ? "hls" : extracted.type === "direct" ? "mp4" : "iframe" }]
        : []),
      ...(extracted.sources || []),
    ];

    for (const src of allSources) {
      if (!src.file || src.type === "iframe") continue;
      let streamUrl = src.file;
      let referer = getHostReferer(extractInput);

      if (streamUrl.startsWith("/api/anime/stream-proxy")) {
        const u = new URL(streamUrl, "http://localhost");
        streamUrl = u.searchParams.get("url") || "";
        referer = u.searchParams.get("referer") || referer;
      }
      if (!streamUrl.startsWith("http")) continue;

      const isHls = src.type === "hls" || /\.m3u8(?:$|[?#])/i.test(streamUrl);
      const qTier = normalizeQualityTier((src as any).label) || serverQualityHint || null;
      if (!candidateUrlsToTry.some((c) => c.streamUrl === streamUrl)) {
        candidateUrlsToTry.push({ streamUrl, referer, isHls, qualityTier: qTier });
      }
    }
  }

  candidateUrlsToTry.sort(
    (a, b) => scoreQualityMatch(b.qualityTier, preferredQuality) - scoreQualityMatch(a.qualityTier, preferredQuality),
  );

  let hlsFallback: ResolvedDownloadTarget | undefined;

  for (const cand of candidateUrlsToTry) {
    if (cand.isHls) {
      if (!hlsFallback) {
        let isValidHls = false;
        let isPublicHls = false;
        try {
          const rWithRef = await fetchWithTimeout(
            cand.streamUrl,
            { headers: { "User-Agent": STREAM_UA, ...(cand.referer ? { Referer: cand.referer } : {}) } },
            4000,
          );
          if (rWithRef.ok) {
            const txt = await rWithRef.text();
            if (txt.includes("#EXTM3U")) {
              isValidHls = true;
              if (!cand.referer) isPublicHls = true;
            }
          }
        } catch (_) {}
        if (isValidHls && cand.referer) {
          try {
            const rNoRef = await fetchWithTimeout(cand.streamUrl, { headers: { "User-Agent": STREAM_UA } }, 3000);
            if (rNoRef.ok) {
              const txt = await rNoRef.text();
              if (txt.includes("#EXTM3U")) isPublicHls = true;
            }
          } catch (_) {}
        }
        if (isValidHls) {
          hlsFallback = {
            streamUrl: cand.streamUrl,
            referer: cand.referer,
            filename,
            mode: "hls-remux",
            serverName: "HLS Direct",
            resolvedQuality: cand.qualityTier || serverQualityHint || "HD",
            publicNoReferer: isPublicHls,
            mimeType: "application/vnd.apple.mpegurl",
          };
        }
      }
      continue;
    }

    const check = await verifyBinaryVideoUrl(cand.streamUrl, cand.referer);
    if (check.ok) {
      const noRefCheck = cand.referer
        ? await verifyBinaryVideoUrl(cand.streamUrl, "")
        : check;
      return {
        mp4: {
          streamUrl: cand.streamUrl,
          referer: cand.referer,
          filename,
          mode: "mp4",
          sizeBytes: check.sizeBytes,
          resolvedQuality: cand.qualityTier || serverQualityHint || "HD",
          publicNoReferer: noRefCheck.ok,
          mimeType: "video/mp4",
        },
      };
    }
  }

  return hlsFallback ? { hls: hlsFallback } : {};
}

export async function resolveBestDownloadTarget(
  rawCandidates: string[],
  title: string,
  ep: string,
  preferPublicExternal = false,
  keepPrimaryFirst = false,
  preferredQuality: PreferredQuality = "auto",
  serverMetaMap: Record<string, { quality?: string; serverName?: string }> = {},
): Promise<{
  primary: ResolvedDownloadTarget | null;
  publicExternal: ResolvedDownloadTarget | null;
}> {
  const cleanTitle =
    (title || "Anime").replace(/[^\w\u0600-\u06FF\s-]/gi, "").trim() || "Anime";
  const safeFilename = `${cleanTitle}-Ep-${ep}.mp4`;

  // Unwrap nested /api/anime/download?url=... links & deduplicate
  const expanded: string[] = [];
  const expandedMeta: Record<string, { quality?: string; serverName?: string }> = { ...serverMetaMap };
  for (const c of rawCandidates) {
    if (!c) continue;
    if (c.startsWith("/api/anime/download") || c.includes("/api/anime/download?")) {
      try {
        const u = new URL(c, "http://localhost");
        const inner = u.searchParams.get("url");
        if (inner && inner.startsWith("http") && !expanded.includes(inner)) {
          expanded.push(inner);
          if (expandedMeta[c] && !expandedMeta[inner]) {
            expandedMeta[inner] = expandedMeta[c];
          }
        }
      } catch (_) {}
      continue;
    }
    if (c.startsWith("http") && !expanded.includes(c)) {
      expanded.push(c);
    }
  }

  const getHostPriority = (url: string): number => {
    const l = url.toLowerCase();
    if (l.includes("mediafire")) return -10;
    if (preferPublicExternal) {
      if (l.includes("sendvid")) return 100;
      if (l.includes("drive.google")) return 98;
      if (l.includes("videa")) return 96;
      if (l.includes("uqload")) return 94;
      if (l.includes("4shared")) return 92;
      if (l.includes("wish")) return 88;
      if (l.includes("vidmoly")) return 86;
      if (l.includes("filemoon") || l.includes("voe")) return 84;
      if (l.includes("ok.ru")) return 82;
      if (l.includes("streamtape") || l.includes("dood") || l.includes("d000d")) return 78;
      if (l.includes("mp4upload")) return 50;
      if (l.includes("mega.nz")) return 45;
      return 40;
    }
    if (l.includes("sendvid")) return 100;
    if (l.includes("videa")) return 98;
    if (l.includes("mp4upload")) return 96;
    if (l.includes("ok.ru")) return 92;
    if (l.includes("mega.nz")) return 90;
    if (l.includes("yourupload")) return 85;
    if (l.includes("uqload")) return 80;
    if (l.includes("4shared")) return 75;
    if (l.includes("drive.google")) return 72;
    if (l.includes("streamtape")) return 65;
    if (l.includes("dood") || l.includes("d000d")) return 60;
    if (l.includes("sibnet") || l.includes("vidoza") || l.includes("mixdrop")) return 55;
    if (l.includes("wish") || l.includes("filemoon") || l.includes("vidmoly") || l.includes("voe")) return 40;
    return 40;
  };

  const getTotalPriority = (url: string): number => {
    const hostScore = getHostPriority(url);
    if (hostScore <= 0) return hostScore;
    const meta = expandedMeta[url];
    const qTier = normalizeQualityTier(meta?.quality);
    return hostScore + scoreQualityMatch(qTier, preferredQuality);
  };

  const validCandidates = expanded.filter((u) => getHostPriority(u) > 0);
  const ordered =
    keepPrimaryFirst && validCandidates.length > 0 && preferredQuality === "auto"
      ? [
          validCandidates[0],
          ...validCandidates.slice(1).sort((a, b) => getTotalPriority(b) - getTotalPriority(a)),
        ].slice(0, 14)
      : validCandidates.sort((a, b) => getTotalPriority(b) - getTotalPriority(a)).slice(0, 14);

  let firstMp4: ResolvedDownloadTarget | null = null;
  let firstHlsFallback: ResolvedDownloadTarget | null = null;
  let firstPublicMp4: ResolvedDownloadTarget | null = null;
  let firstPublicHls: ResolvedDownloadTarget | null = null;

  const resolveStart = Date.now();
  for (let i = 0; i < ordered.length; i += 3) {
    if (Date.now() - resolveStart > 19_000 && (firstMp4 || firstHlsFallback)) {
      break;
    }
    const batch = ordered.slice(i, i + 3);
    const results = await Promise.all(
      batch.map((u) => {
        const meta = expandedMeta[u];
        const qHint = normalizeQualityTier(meta?.quality);
        return Promise.race([
          resolveSingleCandidateToVideo(u, safeFilename, preferredQuality, qHint),
          new Promise<{ mp4?: ResolvedDownloadTarget; hls?: ResolvedDownloadTarget }>((resolve) =>
            setTimeout(() => resolve({}), 12_000),
          ),
        ])
          .then((res) => {
            if (res.mp4 && meta?.serverName && !res.mp4.serverName) {
              res.mp4.serverName = meta.serverName;
            }
            if (res.hls && meta?.serverName && !res.hls.serverName) {
              res.hls.serverName = meta.serverName;
            }
            return res;
          })
          .catch((): { mp4?: ResolvedDownloadTarget; hls?: ResolvedDownloadTarget } => ({}));
      }),
    );
    for (const r of results) {
      if (r.mp4) {
        if (!firstMp4 || (preferredQuality !== "auto" && r.mp4.resolvedQuality === preferredQuality && firstMp4.resolvedQuality !== preferredQuality)) {
          firstMp4 = r.mp4;
        }
        if (r.mp4.publicNoReferer && (!firstPublicMp4 || (preferredQuality !== "auto" && r.mp4.resolvedQuality === preferredQuality && firstPublicMp4.resolvedQuality !== preferredQuality))) {
          firstPublicMp4 = r.mp4;
        }
      }
      if (r.hls) {
        if (!firstHlsFallback) firstHlsFallback = r.hls;
        if (r.hls.publicNoReferer && !firstPublicHls) firstPublicHls = r.hls;
      }
    }

    if (preferPublicExternal) {
      if (firstPublicMp4 && (preferredQuality === "auto" || firstPublicMp4.resolvedQuality === preferredQuality || i >= 3)) break;
      if (firstPublicHls && i >= 3) break;
    } else if (firstMp4 && firstPublicMp4 && (preferredQuality === "auto" || firstMp4.resolvedQuality === preferredQuality || i >= 3)) {
      break;
    } else if ((firstMp4 || firstHlsFallback) && i >= 6) {
      break;
    }
  }

  const publicExternal = firstPublicMp4 || firstPublicHls;
  const primary = preferPublicExternal
    ? (publicExternal || firstMp4 || firstHlsFallback)
    : (firstMp4 || firstHlsFallback);

  return { primary, publicExternal };
}

function sendVideoHeaders(
  res: Response,
  filename: string,
  contentType: string,
  asAttachment: boolean,
  contentLength?: string | number | null,
) {
  const asciiFallback = filename.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "") || "episode.mp4";
  res.setHeader(
    "Content-Disposition",
    `${asAttachment ? "attachment" : "inline"}; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
  );
  res.setHeader("Content-Type", contentType || "video/mp4");
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (contentLength) {
    res.setHeader("Content-Length", String(contentLength));
  }
}

async function streamMegaTarget(
  target: ResolvedDownloadTarget,
  req: Request,
  res: Response,
  asAttachment: boolean,
) {
  const totalSize = target.sizeBytes || 0;
  if (!totalSize || !target.megaKeyHex || !target.megaNonceHex) {
    return res.status(502).send("بيانات ملف Mega غير مكتملة");
  }

  const aesKey = Buffer.from(target.megaKeyHex, "hex");
  const nonce = Buffer.from(target.megaNonceHex, "hex");

  let start = 0;
  let end = totalSize - 1;
  let isRange = false;

  const rangeHeader = (req.headers.range as string | undefined) || "";
  if (rangeHeader) {
    const m = rangeHeader.match(/bytes=(\d*)-(\d*)/i);
    if (m) {
      isRange = true;
      start = m[1] ? parseInt(m[1], 10) : 0;
      end = m[2] ? parseInt(m[2], 10) : totalSize - 1;
      if (isNaN(start) || start < 0) start = 0;
      if (isNaN(end) || end >= totalSize) end = totalSize - 1;
      if (start > end) {
        res.status(416).setHeader("Content-Range", `bytes */${totalSize}`);
        return res.end();
      }
    }
  }

  const responseLength = end - start + 1;
  res.status(isRange ? 206 : 200);
  sendVideoHeaders(res, target.filename, "video/mp4", asAttachment, responseLength);
  res.setHeader("Accept-Ranges", "bytes");
  if (isRange) {
    res.setHeader("Content-Range", `bytes ${start}-${end}/${totalSize}`);
  }

  if (req.method === "HEAD") {
    return res.end();
  }

  const alignedStart = Math.floor(start / 16) * 16;
  const skipBytes = start - alignedStart;
  const blockIdx = BigInt(alignedStart / 16);

  const iv = Buffer.alloc(16);
  nonce.copy(iv, 0);
  iv.writeBigUInt64BE(blockIdx, 8);

  const rangeSuffix = `/${alignedStart}-${end}`;
  const megaCtrl = new AbortController();
  const megaTimer = setTimeout(() => megaCtrl.abort(), 20_000);
  let upstream: globalThis.Response;
  try {
    upstream = await fetch(`${target.streamUrl}${rangeSuffix}`, {
      headers: { "User-Agent": STREAM_UA },
      signal: megaCtrl.signal,
    });
  } finally {
    clearTimeout(megaTimer);
  }

  if (!upstream.ok || !upstream.body) {
    if (!res.headersSent) return res.status(502).send("تعذر سحب الملف من خادم Mega");
    return res.end();
  }

  const decipher = crypto.createDecipheriv("aes-128-ctr", aesKey, iv);
  let remainingSkip = skipBytes;
  const reader = upstream.body.getReader();
  let clientAborted = false;

  res.on("close", () => {
    if (!res.writableFinished) {
      clientAborted = true;
      reader.cancel().catch(() => {});
    }
  });

  try {
    while (true) {
      const { done, value } = await readChunkWithTimeout(reader, 25_000);
      if (done || clientAborted || !value) break;
      let plain = decipher.update(Buffer.from(value));
      if (remainingSkip > 0) {
        if (plain.length <= remainingSkip) {
          remainingSkip -= plain.length;
          continue;
        }
        plain = plain.subarray(remainingSkip);
        remainingSkip = 0;
      }
      if (!res.writableEnded && plain.length > 0) {
        res.write(plain);
      } else if (res.writableEnded) {
        break;
      }
    }
    const tail = decipher.final();
    if (tail.length > 0 && !res.writableEnded) {
      res.write(tail);
    }
  } catch (_) {}

  if (!res.writableEnded) {
    res.end();
  }
}

export async function streamResolvedDownloadTarget(
  target: ResolvedDownloadTarget,
  req: Request,
  res: Response,
  asAttachment = true,
) {
  if (target.mode === "mega") {
    return streamMegaTarget(target, req, res, asAttachment);
  }

  if (target.mode === "hls-remux") {
    if (req.method === "HEAD") {
      sendVideoHeaders(res, target.filename, "video/mp4", asAttachment);
      return res.end();
    }
    const ffArgs: string[] = [
      "-rw_timeout",
      "15000000",
      "-reconnect",
      "1",
      "-reconnect_streamed",
      "1",
      "-reconnect_delay_max",
      "4",
    ];
    if (target.referer) {
      ffArgs.push("-headers", `Referer: ${target.referer}\r\nUser-Agent: ${STREAM_UA}\r\n`);
    } else {
      ffArgs.push("-user_agent", STREAM_UA);
    }
    ffArgs.push(
      "-i",
      target.streamUrl,
      "-c",
      "copy",
      "-bsf:a",
      "aac_adtstoasc",
      "-movflags",
      "frag_keyframe+empty_moov",
      "-f",
      "mp4",
      "pipe:1",
    );

    const ff = spawn("ffmpeg", ffArgs, { stdio: ["ignore", "pipe", "pipe"] });
    let headersCommitted = false;
    let ended = false;

    const startupTimer = setTimeout(() => {
      if (!headersCommitted && !ended) {
        ended = true;
        try {
          ff.kill("SIGKILL");
        } catch (_) {}
        if (!res.headersSent) {
          res.status(504).send("انتهت مهلة بدء معالجة البث");
        } else if (!res.writableEnded) {
          res.end();
        }
      }
    }, 15_000);

    res.on("close", () => {
      if (!res.writableFinished) {
        ended = true;
        clearTimeout(startupTimer);
        try {
          ff.kill("SIGKILL");
        } catch (_) {}
      }
    });

    ff.stdout.on("data", (chunk: Buffer) => {
      if (ended || res.writableEnded) return;
      if (!headersCommitted) {
        headersCommitted = true;
        clearTimeout(startupTimer);
        sendVideoHeaders(res, target.filename, "video/mp4", asAttachment);
      }
      res.write(chunk);
    });

    ff.stdout.on("end", () => {
      clearTimeout(startupTimer);
      if (ended) return;
      ended = true;
      if (!headersCommitted && !res.headersSent) {
        res.status(502).send("تعذر استخراج بيانات الفيديو من البث");
      } else if (!res.writableEnded) {
        res.end();
      }
    });

    ff.on("error", () => {
      clearTimeout(startupTimer);
      if (ended) return;
      ended = true;
      if (!res.headersSent) res.status(502).send("Video remux failed");
      else if (!res.writableEnded) res.end();
    });

    ff.on("close", () => {
      clearTimeout(startupTimer);
      if (!headersCommitted && !ended) {
        ended = true;
        if (!res.headersSent) {
          res.status(502).send("تعذر سحب ملف الفيديو من هذا السيرفر");
        } else if (!res.writableEnded) {
          res.end();
        }
      }
    });
    return;
  }

  const upstream = await fetchUpstreamFollowRedirect(
    target.streamUrl,
    target.referer,
    req.headers.range as string | undefined,
    25000,
  );

  if (!upstream.ok || !upstream.body) {
    return res.status(502).send("تعذر سحب ملف الفيديو من السيرفر");
  }

  const upstreamCt = (upstream.headers.get("content-type") || "").toLowerCase();
  if (upstreamCt.includes("text/html")) {
    try {
      await upstream.body.cancel();
    } catch (_) {}
    return res.status(502).send("السيرفر أعاد صفحة HTML بدلاً من ملف الفيديو");
  }

  res.status(upstream.status);
  sendVideoHeaders(
    res,
    target.filename,
    upstreamCt.startsWith("video/") ? upstreamCt : "video/mp4",
    asAttachment,
    upstream.headers.get("content-length"),
  );
  const contentRange = upstream.headers.get("content-range");
  if (contentRange) res.setHeader("Content-Range", contentRange);
  res.setHeader("Accept-Ranges", upstream.headers.get("accept-ranges") || "bytes");

  if (req.method === "HEAD") {
    try {
      await upstream.body.cancel();
    } catch (_) {}
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

  try {
    while (true) {
      const { done, value } = await readChunkWithTimeout(reader, 25_000);
      if (done || clientAbortedOrClosed(clientClosed) || !value) break;
      if (!res.writableEnded) {
        res.write(Buffer.from(value));
      } else {
        break;
      }
    }
  } catch (_) {}
  if (!res.writableEnded) {
    res.end();
  }
}

function clientAbortedOrClosed(closed: boolean): boolean {
  return closed;
}

