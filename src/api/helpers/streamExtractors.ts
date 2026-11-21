import type { Request, Response } from "express";
import crypto from "crypto";
import { spawn } from "child_process";
import * as cheerio from "cheerio";
import { serverCache } from "../../services/cacheService";
import { fetchWithTimeout } from "./jikanClient";

export const STREAM_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

// 1. مفكك حزم جافاسكريبت الشهيرة لفك أكواد Mp4Upload, Streamwish, Filemoon, Vidmoly, Uqload وغيرها بجميع أنظمة العد (Radix 10..62)
function unpackDeanEdwards(packed: string): string {
  try {
    const startIdx = packed.search(/\}\s*\(\s*['"]/);
    if (startIdx === -1) return "";

    // Locate the first quoted string `p` respecting escaped quotes (e.g. \' or \")
    let i = packed.indexOf("(", startIdx) + 1;
    while (i < packed.length && /\s/.test(packed[i])) i++;
    const pQuote = packed[i];
    if (pQuote !== "'" && pQuote !== '"') return "";
    i++;
    let pRaw = "";
    while (i < packed.length) {
      const ch = packed[i];
      if (ch === "\\" && i + 1 < packed.length) {
        pRaw += ch + packed[i + 1];
        i += 2;
        continue;
      }
      if (ch === pQuote) {
        i++;
        break;
      }
      pRaw += ch;
      i++;
    }

    const rest = packed.slice(i);
    const argsMatch = rest.match(
      /^\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(['"])([\s\S]*?)\3\.split\s*\(\s*['"]\|['"]\s*\)/,
    );
    if (!argsMatch) return "";

    const a = parseInt(argsMatch[1], 10);
    const c = parseInt(argsMatch[2], 10);
    const kRawEsc = argsMatch[4];

    const unescapeJsString = (str: string): string =>
      str
        .replace(/\\'/g, "'")
        .replace(/\\"/g, '"')
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r")
        .replace(/\\t/g, "\t")
        .replace(/\\\\/g, "\\");

    const p = unescapeJsString(pRaw);
    const k = unescapeJsString(kRawEsc).split("|");

    const encodeBase = (val: number, radix: number): string => {
      if (radix <= 36) return val.toString(radix);
      const prefix = val < radix ? "" : encodeBase(Math.floor(val / radix), radix);
      const rem = val % radix;
      return prefix + (rem > 35 ? String.fromCharCode(rem + 29) : rem.toString(36));
    };

    const dict: Record<string, string> = {};
    let count = c;
    while (count--) {
      const key = encodeBase(count, a);
      dict[key] = k[count] || key;
    }

    return p.replace(/\b(\w+)\b/g, (word) =>
      Object.prototype.hasOwnProperty.call(dict, word) ? dict[word] : word,
    );
  } catch {
    return "";
  }
}

// 2. محلل ثغرات Streamtape المتطور لدمج سلاسل العناوين مع فك دالة substring
function extractStreamtapeLink(html: string): string | null {
  try {
    const match =
      html.match(/id=['"]robotlink['"]\s*>([\s\S]*?)<\/div>/i) ||
      html.match(
        /(?:document\.getElementById|_\$)\(['"]robotlink['"]\)\.innerHTML\s*=\s*(['"][\s\S]+?);/i,
      );
    if (match) {
      const rawExpression = match[1];
      const terms = rawExpression.split("+");
      let url = "";
      for (let term of terms) {
        term = term.trim();
        const strMatch = term.match(/^['"]([^'"]*)['"]$/);
        if (strMatch) {
          url += strMatch[1];
          continue;
        }
        const subMatch = term.match(
          /^\s*\(\s*['"]([^'"]*)['"]\s*\)\s*\.\s*substring\s*\(\s*(\d+)\s*\)\s*$/,
        );
        if (subMatch) {
          url += subMatch[1].substring(parseInt(subMatch[2], 10));
          continue;
        }
        const subMatch2 = term.match(
          /^\s*['"]([^'"]*)['"]\s*\.\s*substring\s*\(\s*(\d+)\s*\)\s*$/,
        );
        if (subMatch2) {
          url += subMatch2[1].substring(parseInt(subMatch2[2], 10));
          continue;
        }
        const plainStr = term.match(/['"]([^'"]*)['"]/);
        if (plainStr) {
          url += plainStr[1];
        }
      }
      if (url) {
        if (url.startsWith("//")) url = "https:" + url;
        return url;
      }
    }
  } catch (_) {}
  return null;
}

// 3. مستخرج روابط Doodstream و d000d عبر تتبع طلبات المفتاح المباشر pass_md5
async function extractDoodstreamLink(
  targetUrl: string,
  html: string,
  customHeaders: Record<string, string>,
): Promise<string | null> {
  try {
    const md5Match = html.match(/\/(pass_md5\/[A-Za-z0-9_.-]*)/);
    if (md5Match) {
      const parsedUrl = new URL(targetUrl);
      const host = `${parsedUrl.protocol}//${parsedUrl.host}`;
      const md5Url = `${host}/${md5Match[1]}`;

      const passHeaders = {
        ...customHeaders,
        Referer: targetUrl,
        Accept: "*/*",
      };

      const resp = await fetchWithTimeout(
        md5Url,
        { headers: passHeaders },
        1500,
      );
      if (resp.ok) {
        const tokenVal = await resp.text();
        const tokenKey = md5Url.split("/").pop() || "";

        // توليد 10 أحرف عشوائية كقناع أمان يفرضه سيرفر Doodstream
        const chars =
          "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        let randStr = "";
        for (let i = 0; i < 10; i++) {
          randStr += chars.charAt(Math.floor(Math.random() * chars.length));
        }

        const finalDirect = `${tokenVal}${randStr}?token=${tokenKey}&expiry=${Date.now()}`;
        return finalDirect;
      }
    }
  } catch (e) {
    // Quietly ignore Doodstream sub-resolver failures
  }
  return null;
}

function videaRc4(data: Buffer, key: Buffer): Buffer {
  const S = Array.from({ length: 256 }, (_, i) => i);
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + S[i] + key[i % key.length]) & 255;
    const tmp = S[i];
    S[i] = S[j];
    S[j] = tmp;
  }
  const out = Buffer.alloc(data.length);
  let i = 0;
  j = 0;
  for (let k = 0; k < data.length; k++) {
    i = (i + 1) & 255;
    j = (j + S[i]) & 255;
    const tmp = S[i];
    S[i] = S[j];
    S[j] = tmp;
    out[k] = data[k] ^ S[(S[i] + S[j]) & 255];
  }
  return out;
}

export async function extractVideaDirectSources(
  videaUrl: string,
): Promise<{ file: string; label: string; type: string; mimeType: string }[]> {
  try {
    const vMatch =
      videaUrl.match(/[?&]v=([A-Za-z0-9_-]+)/) ||
      videaUrl.match(/videa\.hu\/(?:player|videok\/[^/]+)\/([A-Za-z0-9_-]+)/i);
    if (!vMatch) return [];
    const vcode = vMatch[1];

    const playerResp = await fetchWithTimeout(
      `https://videa.hu/player?v=${encodeURIComponent(vcode)}`,
      { headers: { "User-Agent": STREAM_UA } },
      5000,
    );
    if (!playerResp.ok) return [];
    const html = await playerResp.text();
    const xtMatch = html.match(/var\s+_xt\s*=\s*["']([^"']+)["']/);
    if (!xtMatch || xtMatch[1].length < 64) return [];
    const xt = xtMatch[1];

    const staticSecret = await serverCache.getOrFetch<string>(
      "videa_player_secret_v1",
      async () => {
        try {
          const jsPath = html.match(/src=["'](\/static\/uis\/player\/js\/VideaPlayerClasses\.min\.js[^"']*)["']/)?.[1];
          if (jsPath) {
            const jr = await fetchWithTimeout(`https://videa.hu${jsPath}`, { headers: { "User-Agent": STREAM_UA } }, 4500);
            if (jr.ok) {
              const jt = await jr.text();
              const sec = jt.match(/processEmbedParams\([^,]+,[^,]+,[^,]+,\s*["']([A-Za-z0-9_-]{64})["']\)/)?.[1];
              if (sec) return sec;
            }
          }
        } catch (_) {}
        return "xHb0ZvME5q8CBcoQi6AngerDu3FGO9fkUlwPmLVY_RTzj2hJIS4NasXWKy1td7p";
      },
      12 * 60 * 60 * 1000,
    );

    const seed = crypto.randomBytes(6).toString("base64url").slice(0, 8);
    let rKeys = ["e", "a", "g", "j", "d", "c", "h", "i", "b", "f"];
    const c: Record<string, string> = {};
    for (let i = 0; i < xt.length; i++) {
      const k = rKeys[Math.floor(i / 8) + 1];
      if (i % 8 === 0) c[k] = "";
      c[k] += xt[i];
    }
    c.e = seed;

    const d = (c.a || "") + (c.g || "") + (c.j || "") + (c.d || "");
    const u = (c.c || "") + (c.h || "") + (c.i || "") + (c.b || "");
    let mixed = "";
    for (let i = 0; i < d.length; i++) {
      const idx = i - (staticSecret.indexOf(d.charAt(i)) - 31);
      mixed += u.charAt(idx);
    }
    rKeys = ["f", "h", "c", "b", "i"];
    for (let i = 0; i < mixed.length; i++) {
      const k = rKeys[Math.floor(i / 8) + 1];
      if (i % 8 === 0) c[k] = "";
      c[k] += mixed.charAt(i);
    }

    const xmlUrl = `https://videa.hu/player/xml?v=${encodeURIComponent(vcode)}&_s=${encodeURIComponent(c.e)}&_t=${encodeURIComponent((c.h || "") + (c.c || ""))}`;
    const xmlResp = await fetchWithTimeout(
      xmlUrl,
      { headers: { "User-Agent": STREAM_UA, Referer: `https://videa.hu/player?v=${vcode}` } },
      5000,
    );
    if (!xmlResp.ok) return [];
    const xs = xmlResp.headers.get("x-videa-xs") || "";
    const rawBody = await xmlResp.text();
    let plainXml = rawBody;
    if (!rawBody.trim().startsWith("<") && xs) {
      c.f = xs;
      const rc4Key = Buffer.from((c.b || "") + (c.i || "") + (c.e || "") + c.f, "utf8");
      plainXml = videaRc4(Buffer.from(rawBody, "base64"), rc4Key).toString("utf8");
    }

    const results: { file: string; label: string; type: string; mimeType: string; resScore: number }[] = [];
    const srcRegex = /<video_source([^>]*)>([^<]+)<\/video_source>/gi;
    let m: RegExpExecArray | null;
    while ((m = srcRegex.exec(plainXml)) !== null) {
      const attrs = m[1];
      let srcPath = m[2].trim().replace(/&amp;/g, "&");
      const name = attrs.match(/name=["']([^"']+)["']/i)?.[1] || "360p";
      const exp = attrs.match(/exp=["']([^"']+)["']/i)?.[1] || "";
      const mimeType = attrs.match(/mimetype=["']([^"']+)["']/i)?.[1] || "video/mp4";
      const hashMatch = plainXml.match(new RegExp(`<hash_value_${name}>([^<]+)</hash_value_${name}>`, "i"));
      const md5 = hashMatch?.[1]?.trim() || "";
      if (srcPath.startsWith("//")) srcPath = `https:${srcPath}`;
      else if (srcPath.startsWith("/")) srcPath = `https://videa.hu${srcPath}`;
      const sep = srcPath.includes("?") ? "&" : "?";
      const finalUrl = md5 && exp ? `${srcPath}${sep}md5=${encodeURIComponent(md5)}&expires=${encodeURIComponent(exp)}` : srcPath;

      const numRes = parseInt(name.replace(/\D+/g, "") || "360", 10);
      const mp4Bonus = mimeType.includes("mp4") ? 1000 : 0;
      results.push({
        file: finalUrl,
        label: name,
        type: "mp4",
        mimeType,
        resScore: mp4Bonus + numRes,
      });
    }

    results.sort((a, b) => b.resScore - a.resScore);
    return results.map(({ file, label, type, mimeType }) => ({ file, label, type, mimeType }));
  } catch {
    return [];
  }
}

// دالة متطورة لتتبع السيرفرات واستخراج الروابط المباشرة (M3U8 / MP4) مع نظام حماية فوري للخادم
export async function extractDirectStream(
  targetUrl: string,
  depth = 0,
): Promise<{
  directUrl: string;
  type: "direct" | "hls" | "iframe";
  sources?: { file: string; label: string; type: string }[];
}> {
  try {
    const buildProxyUrl = (mediaUrl: string, refererUrl: string) =>
      `/api/anime/stream-proxy?url=${encodeURIComponent(mediaUrl)}&referer=${encodeURIComponent(refererUrl)}`;

    // MegaMax / Share4Max multi-resolution direct mirror extraction (تخطي الإعلانات المنبثقة وتشغيل الجودة المتعددة مباشرة)
    if (
      depth === 0 &&
      (targetUrl.toLowerCase().includes("megamax.") || targetUrl.toLowerCase().includes("share4max."))
    ) {
      try {
        const u = new URL(targetUrl);
        const idMatch = u.pathname.match(/\/(?:iframe|e|d)\/([A-Za-z0-9_-]+)/i);
        if (idMatch) {
          const hashId = idMatch[1];
          const origin = `${u.protocol}//${u.host}`;
          const iframeUrl = `${origin}/iframe/${hashId}`;
          const cleanNtUrl = `${iframeUrl}?nt=1`;

          const pageResp = await fetchWithTimeout(
            iframeUrl,
            { headers: { "User-Agent": STREAM_UA, Referer: `${origin}/` } },
            4500,
          );
          if (pageResp.ok) {
            const pageHtml = await pageResp.text();
            const versionMatch = pageHtml.match(/"version"\s*:\s*"([a-f0-9]+)"/i);
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
              5000,
            );

            if (partialResp.ok) {
              const json: any = await partialResp.json();
              const streamGroups: any[] = Array.isArray(json?.props?.streams?.data)
                ? json.props.streams.data
                : [];

              const preferredDrivers = [
                "mixdrop",
                "videa",
                "sendvid",
                "mp4upload",
                "lulustream",
                "earnvids",
                "streamwish",
                "uqload",
                "filemoon",
                "dood",
              ];

              const extractedSources: { file: string; label: string; type: string; rank: number }[] = [];

              // Resolve up to 3 resolution tiers in parallel (e.g. 1080p, 720p, 480p)
              await Promise.all(
                streamGroups.slice(0, 4).map(async (grp) => {
                  const rawLabel = String(grp?.label || "HD");
                  const resMatch = rawLabel.match(/(1080p|720p|480p|360p)/i);
                  const cleanLabel = resMatch ? resMatch[1].toLowerCase() : rawLabel.replace(/\s*\(source\)/i, "").trim() || "HD";
                  const resNum = parseInt(cleanLabel.replace(/\D+/g, "") || "720", 10);

                  const mirrors: any[] = Array.isArray(grp?.mirrors) ? grp.mirrors : [];
                  const sortedMirrors = [...mirrors].sort((a, b) => {
                    const da = String(a?.driver || "").toLowerCase();
                    const db = String(b?.driver || "").toLowerCase();
                    const ia = preferredDrivers.findIndex((p) => da.includes(p));
                    const ib = preferredDrivers.findIndex((p) => db.includes(p));
                    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
                  });

                  for (const m of sortedMirrors.slice(0, 3)) {
                    let link = String(m?.link || "").trim();
                    if (!link) continue;
                    if (link.startsWith("//")) link = `https:${link}`;
                    if (!link.startsWith("http")) continue;
                    const dLower = String(m?.driver || link).toLowerCase();
                    if (!preferredDrivers.some((p) => dLower.includes(p) || link.toLowerCase().includes(p))) {
                      continue;
                    }
                    const sub = await extractDirectStream(link, 1).catch(() => null);
                    if (sub && (sub.type === "direct" || sub.type === "hls") && sub.directUrl) {
                      extractedSources.push({
                        file: sub.directUrl,
                        label: cleanLabel,
                        type: sub.type === "hls" ? "hls" : "mp4",
                        rank: resNum + (sub.type === "direct" ? 5 : 0),
                      });
                      break;
                    }
                  }
                }),
              );

              if (extractedSources.length > 0) {
                extractedSources.sort((a, b) => b.rank - a.rank);
                const cleanSources = extractedSources.map(({ file, label, type }) => ({ file, label, type }));
                const primary = cleanSources[0];
                return {
                  directUrl: primary.file,
                  type: primary.type === "hls" ? "hls" : "direct",
                  sources: cleanSources,
                };
              }
            }
          }

          return {
            directUrl: cleanNtUrl,
            type: "iframe",
            sources: [{ file: cleanNtUrl, label: "multi", type: "iframe" }],
          };
        }
      } catch (_) {}
    }

    const headers: Record<string, string> = {
      "User-Agent": STREAM_UA,
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Accept-Language": "ar,en-US;q=0.9,en;q=0.8",
    };

    // ضبط الـ Referer ديناميكياً لتجاوز حماية الروابط الساخنة بدون إرسال Origin غير قياسي في طلبات GET
    const setDynamicHeaders = (urlStr: string) => {
      try {
        const parsed = new URL(urlStr);
        const hostLower = parsed.hostname.toLowerCase();
        delete headers["Origin"];
        if (
          hostLower.includes("lulustream") ||
          hostLower.includes("morencius") ||
          hostLower.includes("earnvids") ||
          hostLower.includes("vidhide") ||
          hostLower.includes("filelions")
        ) {
          headers["Referer"] = "https://megamax.me/";
        } else {
          headers["Referer"] = `${parsed.protocol}//${parsed.hostname}/`;
        }
      } catch (_) {}
    };

    setDynamicHeaders(targetUrl);

    // Google Drive direct stream extraction
    if (
      targetUrl.includes("drive.google.com") ||
      targetUrl.includes("gdrive")
    ) {
      const driveIdMatch =
        targetUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) ||
        targetUrl.match(/id=([a-zA-Z0-9_-]+)/);
      if (driveIdMatch) {
        const previewDriveUrl = `https://drive.google.com/file/d/${driveIdMatch[1]}/preview`;
        const directDriveUrl = `https://drive.google.com/uc?export=download&id=${driveIdMatch[1]}`;
        return {
          directUrl: previewDriveUrl,
          type: "iframe",
          sources: [
            { file: previewDriveUrl, label: "FHD", type: "iframe" },
            { file: directDriveUrl, label: "HD", type: "mp4" },
          ],
        };
      }
    }

    // دالة مساعدة سريعة للتحقق من نوع محتوى البث المباشر لمنع تحميل الملفات الثنائية العملاقة
    const isMediaContentType = (
      contentType: string,
      contentLengthHeader?: string,
    ): boolean => {
      const ct = contentType.toLowerCase();
      const length = parseInt(contentLengthHeader || "0", 10);
      return (
        ct.startsWith("video/") ||
        ct.startsWith("audio/") ||
        ct.includes("mpegurl") ||
        ct.includes("application/vnd.apple.mpegurl") ||
        ct.includes("application/x-mpegurl") ||
        ct.includes("video/mp4") ||
        ct.includes("video/x-matroska") ||
        // إذا كان حجم الملف كبيراً (أكبر من 5 ميجابايت) ونوع المحتوى مبهم، فمن المؤكد أنها ميديا مباشرة
        (ct.includes("application/octet-stream") && length > 5 * 1024 * 1024)
      );
    };

    // 1. فحص فوري وسريع للامتدادات في الرابط لحماية فائقة السرعة قبل الاتصال (Pre-fetch Fast Path)
    try {
      const urlObj = new URL(targetUrl);
      const pathname = urlObj.pathname.toLowerCase();
      const search = urlObj.search.toLowerCase();

      const isDirectExtension =
        pathname.endsWith(".mp4") ||
        pathname.endsWith(".m3u8") ||
        pathname.endsWith(".mkv") ||
        pathname.endsWith(".webm") ||
        pathname.endsWith(".avi") ||
        pathname.endsWith(".mov") ||
        pathname.includes("manifest.m3u8") ||
        pathname.includes("playlist.m3u8") ||
        search.includes(".mp4") ||
        search.includes(".m3u8") ||
        search.includes(".mkv");

      if (isDirectExtension) {
        const isHls = pathname.includes(".m3u8") || search.includes(".m3u8");
        return {
          directUrl: targetUrl,
          type: isHls ? "hls" : "direct",
          sources: [
            {
              file: targetUrl,
              label: "بث مباشر فوري (HD)",
              type: isHls ? "hls" : "mp4",
            },
          ],
        };
      }
    } catch (_) {
      if (/\.(?:mp4|m3u8|mkv)(?:$|[?#])/i.test(targetUrl)) {
        const isHls = /\.m3u8(?:$|[?#])/i.test(targetUrl);
        return {
          directUrl: targetUrl,
          type: isHls ? "hls" : "direct",
          sources: [
            {
              file: targetUrl,
              label: "سيرفر البث المباشر (HD)",
              type: isHls ? "hls" : "mp4",
            },
          ],
        };
      }
    }

    const response = await fetchWithTimeout(
      targetUrl,
      { headers, method: "GET" },
      4500,
    );
    if (!response.ok) {
      return {
        directUrl: targetUrl,
        type: "iframe",
        sources: [{ file: targetUrl, label: "FHD", type: "iframe" }],
      };
    }

    // 2. التحقق الفوري من ترويسة Content-Type لتجنب تحميل ملف الفيديو الثنائي بالذاكرة مطلقاً
    const contentType = response.headers.get("content-type") || "";
    const contentLength = response.headers.get("content-length") || "";
    if (isMediaContentType(contentType, contentLength)) {
      const isHls =
        contentType.toLowerCase().includes("mpegurl") ||
        targetUrl.toLowerCase().includes("m3u8");
      return {
        directUrl: targetUrl,
        type: isHls ? "hls" : "direct",
        sources: [
          {
            file: targetUrl,
            label: "بث مباشر ذكي (HD)",
            type: isHls ? "hls" : "mp4",
          },
        ],
      };
    }

    let html = await response.text();
    let currentHtml = html;
    let currentUrl = targetUrl;
    let nestedIframeUrl = "";

    // تتبع الـ iframe المتداخل للحصول على كود البث النظيف بدلاً من إطار الموقع الخارجي
    for (let depth = 0; depth < 2; depth++) {
      const $ = cheerio.load(currentHtml);
      let iframeSrc =
        $(
          'iframe[src*="embed"], iframe[src*="video"], iframe[src*="player"], iframe[src*="ok.ru"], iframe[src*="govid"], iframe[src*="stream"], iframe[src*="v="], iframe[src*="dood"], iframe[src*="tape"]',
        )
          .first()
          .attr("src") ||
        $("iframe").first().attr("src") ||
        $("iframe").first().attr("data-src");

      if (iframeSrc) {
        if (iframeSrc.startsWith("//")) {
          iframeSrc = "https:" + iframeSrc;
        } else if (iframeSrc.startsWith("/")) {
          try {
            const parsed = new URL(currentUrl);
            iframeSrc = `${parsed.protocol}//${parsed.hostname}${iframeSrc}`;
          } catch (_) {}
        }

        if (
          iframeSrc &&
          iframeSrc !== currentUrl &&
          iframeSrc.startsWith("http")
        ) {
          try {
            // فحص سريع لامتداد رابط الـ iframe المقترح مباشرة قبل طلبه لحماية الذاكرة
            const nestedLower = iframeSrc.toLowerCase();
            if (
              nestedLower.includes(".mp4") ||
              nestedLower.includes(".m3u8") ||
              nestedLower.includes(".mkv")
            ) {
              const isHls = nestedLower.includes(".m3u8");
              return {
                directUrl: iframeSrc,
                type: isHls ? "hls" : "direct",
                sources: [
                  {
                    file: iframeSrc,
                    label: "بث مباشر مكتشف (HD)",
                    type: isHls ? "hls" : "mp4",
                  },
                ],
              };
            }

            nestedIframeUrl = iframeSrc;
            setDynamicHeaders(iframeSrc);
            const nextResp = await fetchWithTimeout(
              iframeSrc,
              { headers, method: "GET" },
              4500,
            );
            if (nextResp.ok) {
              const nextContentType =
                nextResp.headers.get("content-type") || "";
              const nextContentLength =
                nextResp.headers.get("content-length") || "";

              if (isMediaContentType(nextContentType, nextContentLength)) {
                const isHls =
                  nextContentType.toLowerCase().includes("mpegurl") ||
                  iframeSrc.toLowerCase().includes("m3u8");
                return {
                  directUrl: iframeSrc,
                  type: isHls ? "hls" : "direct",
                  sources: [
                    {
                      file: iframeSrc,
                      label: "بث مباشر ذكي من الإطار (HD)",
                      type: isHls ? "hls" : "mp4",
                    },
                  ],
                };
              }

              const nextHtml = await nextResp.text();
              currentUrl = iframeSrc;
              currentHtml = nextHtml;
              html = nextHtml; // تحديث كود الـ html للتنقيب التابع أدناه
            }
          } catch (e) {
            // Quietly ignore nested iframe fetching failures
          }
        }
      } else {
        break;
      }
    }

    const sources: { file: string; label: string; type: string }[] = [];

    // 1. القشط الداخلي والتحليل ذو الكفاءة العالية لكود الصفحة المفككة من حزم Packer
    const scriptBlocks: string[] = [];
    const $ = cheerio.load(html);
    $("script").each((_, el) => {
      const scriptText = $(el).html();
      if (scriptText) {
        scriptBlocks.push(scriptText);
        // التحقق من تعبئة دالة Dean Edwards
        if (scriptText.includes("eval") && scriptText.includes("p,a,c,k,e,d")) {
          try {
            const unpacked = unpackDeanEdwards(scriptText);
            if (unpacked) {
              scriptBlocks.push(unpacked);
            }
          } catch (_) {}
        }
      }
    });

    const combinedCodeToScan = scriptBlocks.join("\n\n") + "\n\n" + html;

    // 2. تتبع وفك سيرفرات Ok.ru الشهيرة واستخراج الجودات بالكامل
    if (currentUrl.includes("ok.ru")) {
      const match =
        html.match(/data-options="([^"]+)"/) ||
        html.match(/OK\.Player\.initPlayer\([^,]+,\s*([^)]+)\)/);
      if (match) {
        try {
          const decodedOptions = match[1]
            .replace(/&quot;/g, '"')
            .replace(/&amp;/g, "&")
            .replace(/\\"/g, '"')
            .replace(/\\u0022/g, '"');
          const json = JSON.parse(decodedOptions);
          const videos = json?.flashvars?.metadata
            ? JSON.parse(json.flashvars.metadata)?.videos
            : json?.videos;
          if (Array.isArray(videos)) {
            videos.forEach((vid: any) => {
              if (vid.url && vid.name) {
                let qualityLabel = "SD";
                if (vid.name === "mobile") qualityLabel = "144p";
                else if (vid.name === "lowest") qualityLabel = "240p";
                else if (vid.name === "low") qualityLabel = "360p";
                else if (vid.name === "sd") qualityLabel = "480p";
                else if (vid.name === "hd") qualityLabel = "720p";
                else if (vid.name === "full") qualityLabel = "1080p";

                sources.push({
                  file: vid.url,
                  label: qualityLabel,
                  type: "mp4",
                });
              }
            });
          }
        } catch (_) {}
      }
    }

    // 2.5. دعم سيرفر Videa.hu واستخراج روابط MP4/WebM المباشرة (بدون Referer أو إعلانات)
    if (currentUrl.includes("videa.hu")) {
      const videaSrcs = await extractVideaDirectSources(currentUrl);
      for (const vs of videaSrcs) {
        sources.push({ file: vs.file, label: vs.label, type: vs.type });
      }
    }

    // 3. دعم سيرفر Streamtape المتميز تلقائياً باستخدام محلل السلاسل المطور
    if (currentUrl.includes("streamtape.com") || currentUrl.includes("tape")) {
      const direct = extractStreamtapeLink(combinedCodeToScan);
      if (direct) {
        sources.push({
          file: direct,
          label: "سيرفر Streamtape المباشر (HD)",
          type: "mp4",
        });
      }
    }

    // 3.5. دعم إضافي للسيرفرات الشهيرة (4Shared, Uqload, Sibnet, Vidmoly, Filemoon, Streamwish, CloudStream, Sendvid, MP4Upload, YourUpload)
    // 4Shared Direct MP4 Extraction (بث مباشر فوري بدون عداد الانتظار 10 ثوانٍ وبدون إعلانات)
    if (currentUrl.includes("4shared.com")) {
      const sharedMp4Match =
        html.match(/<source\s+src=["'](https?:[^"']+\.mp4[^"']*)["']/i) ||
        combinedCodeToScan.match(/(https?:\/\/dc\d+\.4shared\.com\/[^\s'"]+\.mp4[^\s'"]*)/i);
      if (sharedMp4Match) {
        return {
          directUrl: sharedMp4Match[1],
          type: "direct",
          sources: [
            {
              file: sharedMp4Match[1],
              label: "FHD",
              type: "mp4",
            },
          ],
        };
      }
    }

    // Streamwish / AsnWish / CloudStream (hgcloud / dhcplay): فك حزمة Dean Edwards واستخراج رابط HLS المباشر لتجاوز خطأ Sandboxed embed والإعلانات نهائياً
    if (
      currentUrl.includes("asnwish") ||
      currentUrl.includes("streamwish") ||
      currentUrl.includes("awish") ||
      currentUrl.includes("swish") ||
      currentUrl.includes("sfastwish") ||
      currentUrl.includes("flaswish") ||
      currentUrl.includes("obeywish") ||
      currentUrl.includes("cdnwish") ||
      currentUrl.includes("hgcloud") ||
      currentUrl.includes("dhcplay")
    ) {
      let wishCode = combinedCodeToScan;
      if (currentUrl.includes("hgcloud") || currentUrl.includes("dhcplay")) {
        const idMatch = currentUrl.match(/\/e\/([A-Za-z0-9_-]+)/);
        if (idMatch) {
          try {
            const asnResp = await fetchWithTimeout(
              `https://asnwish.com/e/${idMatch[1]}`,
              { headers: { ...headers, Referer: "https://asnwish.com/" } },
              3500
            );
            if (asnResp.ok) {
              const asnHtml = await asnResp.text();
              const unpackedAsn = unpackDeanEdwards(asnHtml);
              wishCode = unpackedAsn + "\n" + asnHtml;
            }
          } catch (_) {}
        }
      }

      const hls2Match =
        wishCode.match(/["']hls2["']\s*:\s*["'](https?:[^"']+\.m3u8[^"']*)["']/i) ||
        wishCode.match(/file\s*:\s*["'](https?:[^"']+\.m3u8[^"']*)["']/i) ||
        wishCode.match(/(https?:\/\/[^\s'"]+\/hls2\/[^\s'"]+\.m3u8[^\s'"]*)/i);

      if (hls2Match && hls2Match[1]) {
        return {
          directUrl: hls2Match[1],
          type: "hls",
          sources: [
            {
              file: hls2Match[1],
              label: "FHD",
              type: "hls",
            },
          ],
        };
      }
    }

    // Uqload Direct HLS/MP4 Extraction (تجاوز جدار الـ Sandbox والإعلانات المنبثقة)
    if (currentUrl.includes("uqload")) {
      const uqHlsMatch =
        combinedCodeToScan.match(/file\s*:\s*["'](https?:[^"']+\.m3u8[^"']*)["']/i) ||
        combinedCodeToScan.match(/(https?:\/\/[^\s'"]*uqload[^\s'"]+\.m3u8[^\s'"]*)/i);
      if (uqHlsMatch && uqHlsMatch[1]) {
        return {
          directUrl: uqHlsMatch[1],
          type: "hls",
          sources: [
            {
              file: uqHlsMatch[1],
              label: "FHD",
              type: "hls",
            },
          ],
        };
      }

      const uqMp4Match =
        html.match(/sources\s*:\s*\[\s*['"](https?:[^'"]+\.mp4[^'"]*)['"]/i) ||
        combinedCodeToScan.match(/file\s*:\s*['"](https?:[^'"]+\.mp4[^'"]*)['"]/i);
      if (uqMp4Match && uqMp4Match[1]) {
        return {
          directUrl: uqMp4Match[1],
          type: "direct",
          sources: [
            {
              file: uqMp4Match[1],
              label: "HD",
              type: "mp4",
            },
          ],
        };
      }
    }

    // Vidmoly Direct HLS Extraction (تجاوز الإعلانات المنبثقة وتشغيل البث على مشغل التطبيق)
    if (currentUrl.includes("vidmoly")) {
      const molyMatch =
        html.match(/file\s*:\s*['"](https?:[^'"]+\.m3u8[^'"]*)['"]/i) ||
        combinedCodeToScan.match(/file\s*:\s*['"](https?:[^'"]+\.m3u8[^'"]*)['"]/i) ||
        combinedCodeToScan.match(/(https?:\/\/[^\s'"]+\/master\.m3u8[^\s'"]*)/i);
      if (molyMatch && molyMatch[1]) {
        return {
          directUrl: molyMatch[1],
          type: "hls",
          sources: [
            {
              file: molyMatch[1],
              label: "FHD",
              type: "hls",
            },
          ],
        };
      }
    }

    // Sendvid Direct MP4 Extraction (supports /embed/ and standard page)
    if (currentUrl.includes("sendvid")) {
      const svMatch =
        html.match(/var\s+video_source\s*=\s*["'](https?:[^"']+\.mp4[^"']*)["']/i) ||
        html.match(/<source[^>]+src=["'](https?:[^"']+\.mp4[^"']*)["']/i) ||
        combinedCodeToScan.match(/(https?:\/\/[^\s"'<>]*sendvid\.com\/[^\s"'<>]*\.mp4[^\s"'<>]*)/i);
      if (svMatch && svMatch[1]) {
        const proxiedUrl = `/api/anime/stream-proxy?url=${encodeURIComponent(svMatch[1])}&referer=${encodeURIComponent("https://sendvid.com/")}`;
        return {
          directUrl: proxiedUrl,
          type: "direct",
          sources: [
            {
              file: proxiedUrl,
              label: "HD",
              type: "mp4",
            },
            {
              file: svMatch[1],
              label: "Direct",
              type: "mp4",
            },
          ],
        };
      }
    }

    // YourUpload Direct MP4 Extraction via Server Stream Proxy (لتمرير Referer وتخطي كافة الإعلانات)
    if (currentUrl.includes("yourupload.com")) {
      const yuMatch =
        html.match(/property=["']og:video["']\s+content=["'](https?:[^"']+\.mp4[^"']*)["']/i) ||
        html.match(/file\s*:\s*['"](https?:\/\/vidcache\.net[^'"]+\.mp4[^'"]*)['"]/i);
      if (yuMatch && yuMatch[1]) {
        const proxiedUrl = `/api/anime/stream-proxy?url=${encodeURIComponent(yuMatch[1])}&referer=${encodeURIComponent("https://www.yourupload.com/")}`;
        return {
          directUrl: proxiedUrl,
          type: "direct",
          sources: [
            {
              file: proxiedUrl,
              label: "FHD",
              type: "mp4",
            },
          ],
        };
      }
    }

    // MP4Upload Direct MP4 Extraction via Server Stream Proxy (لتمرير Referer وتخطي الإعلانات)
    if (currentUrl.includes("mp4upload.com")) {
      const mp4uMatch =
        combinedCodeToScan.match(/player\.src\s*\(\s*\{[^}]*src\s*:\s*["'](https?:\/\/[^"']+\.mp4[^"']*)["']/i) ||
        combinedCodeToScan.match(/src\s*:\s*["'](https?:\/\/[^"']+mp4upload\.com[^"']+\.mp4[^"']*)["']/i) ||
        combinedCodeToScan.match(/(https?:\/\/[a-z0-9]+\.mp4upload\.com(?::\d+)?\/d\/[^"'\s]+\/[^"'\s]+\.mp4)/i);
      if (mp4uMatch && mp4uMatch[1]) {
        const proxiedUrl = `/api/anime/stream-proxy?url=${encodeURIComponent(mp4uMatch[1])}&referer=${encodeURIComponent("https://www.mp4upload.com/")}`;
        return {
          directUrl: proxiedUrl,
          type: "direct",
          sources: [
            {
              file: proxiedUrl,
              label: "FHD",
              type: "mp4",
            },
          ],
        };
      }
    }

    // Filemoon Direct Extraction
    if (currentUrl.includes("filemoon")) {
      const fmMatch =
        html.match(/file\s*:\s*['"](https?:[^'"]+?\.m3u8[^'"]*)['"]/i) ||
        html.match(/src\s*:\s*['"](https?:[^'"]+?\.m3u8[^'"]*)['"]/i) ||
        combinedCodeToScan.match(
          /file\s*:\s*['"](https?:[^'"]+?\.m3u8[^'"]*)['"]/i,
        ) ||
        combinedCodeToScan.match(/(https?:\/\/[^\s'"]+?\.m3u8[^\s'"]*)/i);
      if (fmMatch) {
        sources.push({
          file: fmMatch[1],
          label: "FHD",
          type: "hls",
        });
      }
    }

    // Sibnet Direct Extraction
    if (currentUrl.includes("sibnet")) {
      const sibMatch =
        html.match(
          /['"]?file['"]?\s*:\s*['"](\/video\/[^'"]+\.mp4[^'"]*)['"]/i,
        ) ||
        html.match(/src\s*:\s*['"](https?:[^'"]+\.mp4[^'"]*)['"]/i) ||
        combinedCodeToScan.match(
          /src\s*:\s*['"](https?:[^'"]+\.mp4[^'"]*)['"]/i,
        );
      if (sibMatch) {
        const fileUrl = sibMatch[1].startsWith("/")
          ? `https://video.sibnet.ru${sibMatch[1]}`
          : sibMatch[1];
        sources.push({
          file: fileUrl,
          label: "HD",
          type: "mp4",
        });
      }
    }

    // LuluStream / EarnVids / Morencius Direct HLS Extraction via Referer Proxy
    if (
      currentUrl.includes("lulustream") ||
      currentUrl.includes("morencius") ||
      currentUrl.includes("earnvids") ||
      currentUrl.includes("vidhide") ||
      currentUrl.includes("filelions")
    ) {
      const refOrigin = (() => {
        try {
          const u = new URL(currentUrl);
          return `${u.protocol}//${u.host}/`;
        } catch {
          return "https://lulustream.com/";
        }
      })();
      const hlsMatch =
        combinedCodeToScan.match(/["']hls[234]?["']\s*:\s*["']((?:https?:)?\/\/[^"']+\.m3u8[^"']*)["']/i) ||
        combinedCodeToScan.match(/file\s*:\s*["']((?:https?:)?\/\/[^"']+\.m3u8[^"']*)["']/i) ||
        combinedCodeToScan.match(/((?:https?:)?\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/i);
      if (hlsMatch && hlsMatch[1]) {
        let hlsUrl = hlsMatch[1];
        if (hlsUrl.startsWith("//")) hlsUrl = `https:${hlsUrl}`;
        const proxiedHls = buildProxyUrl(hlsUrl, refOrigin);
        return {
          directUrl: proxiedHls,
          type: "hls",
          sources: [
            {
              file: proxiedHls,
              label: "FHD",
              type: "hls",
            },
          ],
        };
      }
    }

    // Mixdrop Direct Extraction via Referer Stream Proxy
    if (currentUrl.includes("mixdrop")) {
      const refOrigin = (() => {
        try {
          const u = new URL(currentUrl);
          return `${u.protocol}//${u.host}/`;
        } catch {
          return "https://mixdrop.ag/";
        }
      })();
      const mixMatch =
        combinedCodeToScan.match(
          /(?:MDCore\.wurl|wurl|remp|delivery)\s*=\s*["']([^"']+)["']/i,
        ) ||
        combinedCodeToScan.match(
          /((?:https?:)?\/\/[^\s"'<>]*mxcontent\.net[^\s"'<>]*\.mp4[^\s"'<>]*)/i,
        ) ||
        combinedCodeToScan.match(
          /((?:https?:)?\/\/[^\s"'<>]+?mixdrop[^\s"'<>]+?\.mp4[^\s"'<>]*)/i,
        );
      if (mixMatch && mixMatch[1]) {
        let fileUrl = mixMatch[1].trim();
        if (fileUrl.startsWith("//")) fileUrl = "https:" + fileUrl;
        if (fileUrl.startsWith("http")) {
          const proxiedMp4 = buildProxyUrl(fileUrl, refOrigin);
          return {
            directUrl: proxiedMp4,
            type: "direct",
            sources: [
              {
                file: proxiedMp4,
                label: "HD",
                type: "mp4",
              },
            ],
          };
        }
      }
    }

    // Vidoza Direct Extraction
    if (currentUrl.includes("vidoza")) {
      const vidozaMatch =
        html.match(/<source\s+src=["'](https?:[^"']+\.mp4[^"']*)["']/i) ||
        combinedCodeToScan.match(
          /src\s*:\s*["'](https?:[^"']+\.mp4[^"']*)["']/i,
        ) ||
        combinedCodeToScan.match(
          /file\s*:\s*["'](https?:[^"']+\.mp4[^"']*)["']/i,
        );
      if (vidozaMatch) {
        sources.push({
          file: vidozaMatch[1],
          label: "HD",
          type: "mp4",
        });
      }
    }

    // VOE Direct Extraction
    if (currentUrl.includes("voe")) {
      const voeMatch =
        combinedCodeToScan.match(
          /["']hls["']\s*:\s*["'](https?:[^"']+\.m3u8[^"']*)["']/i,
        ) ||
        combinedCodeToScan.match(
          /["']mp4["']\s*:\s*["'](https?:[^"']+\.mp4[^"']*)["']/i,
        ) ||
        html.match(/["'](https?:[^"']+\.m3u8[^"']*)["']/i);
      if (voeMatch) {
        const fileUrl = voeMatch[1];
        const isHls = fileUrl.includes(".m3u8");
        sources.push({
          file: fileUrl,
          label: "HD",
          type: isHls ? "hls" : "mp4",
        });
      }
    }

    // 4. دعم سيرفر Doodstream و d000d تلقائياً بقراءة الـ MD5 الراجع
    if (currentUrl.includes("dood") || currentUrl.includes("d000d")) {
      const direct = await extractDoodstreamLink(
        currentUrl,
        combinedCodeToScan,
        headers,
      );
      if (direct) {
        sources.push({
          file: direct,
          label: "HD",
          type: "mp4",
        });
      }
    }

    // 5. فحص مشغلات jwplayer و videojs في السيرفرات المتنوعة
    const jwConfigRegex = /sources\s*:\s*(\[[^\]]+\])/gi;
    let jwMatch;
    while ((jwMatch = jwConfigRegex.exec(combinedCodeToScan)) !== null) {
      try {
        const cleanedArr = jwMatch[1]
          .replace(/'/g, '"')
          .replace(/(\w+)\s*:/g, '"$1":');
        const parsed = JSON.parse(cleanedArr);
        if (Array.isArray(parsed)) {
          parsed.forEach((src: any) => {
            const fileUrl = src.file || src.src;
            if (fileUrl) {
              sources.push({
                file: fileUrl,
                label: src.label || src.type || "FHD",
                type: fileUrl.includes(".m3u8") ? "hls" : "mp4",
              });
            }
          });
        }
      } catch (_) {}
    }

    // 6. استخراج مباشر للمصفوفات وعينات التنسيقات المباشرة (M3U8 / MP4) لتحديث القشط
    const m3u8Regex = /(https?:\/\/[^\s'"]+?\.m3u8[^\s'"]*)/gi;
    const mp4Regex = /(https?:\/\/[^\s'"]+?\.mp4[^\s'"]*)/gi;

    const m3u8MatchesRaw = combinedCodeToScan.match(m3u8Regex) || [];
    const mp4MatchesRaw = combinedCodeToScan.match(mp4Regex) || [];

    const m3u8Matches: string[] = Array.from(new Set(m3u8MatchesRaw)).filter(
      (url) =>
        !url.includes("google") &&
        !url.includes("facebook") &&
        !url.includes("analytics"),
    );
    const mp4Matches: string[] = Array.from(new Set(mp4MatchesRaw)).filter(
      (url) =>
        !url.includes("google") &&
        !url.includes("facebook") &&
        !url.includes("analytics") &&
        !url.includes("placeholder"),
    );

    m3u8Matches.forEach((url) => {
      sources.push({ file: url, label: "FHD", type: "hls" });
    });

    mp4Matches.forEach((url) => {
      sources.push({
        file: url,
        label: "HD",
        type: "mp4",
      });
    });

    if (sources.length > 0) {
      const hlsSource = sources.find((s) => s.type === "hls");
      const mp4Source = sources.find((s) => s.type === "mp4");

      const primary = hlsSource || mp4Source || sources[0];
      return {
        directUrl: primary.file,
        type: primary.type === "hls" ? "hls" : "direct",
        sources,
      };
    }

    // If no direct MP4/M3U8 was unpacked from the host, return the actual embed/nested iframe URL so the player renders the real server!
    const embedFallbackUrl = nestedIframeUrl || currentUrl || targetUrl;
    return {
      directUrl: embedFallbackUrl,
      type: "iframe",
      sources: [
        {
          file: embedFallbackUrl,
          label: "FHD",
          type: "iframe",
        },
      ],
    };
  } catch (error) {
    return {
      directUrl: targetUrl,
      type: "iframe",
      sources: [
        {
          file: targetUrl,
          label: "FHD",
          type: "iframe",
        },
      ],
    };
  }
}

