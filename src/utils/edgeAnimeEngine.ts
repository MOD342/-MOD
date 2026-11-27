import { cleanAnimeTitle } from './animeTitleCleaner';
import { GENRE_TAXONOMY, splitAniListGenresAndTags, translateGenreToArabic } from './genreTaxonomy';

export interface EdgeRuntimeEnv {
  EDGE_TOKEN_SECRET?: string;
  PUBLIC_APP_URL?: string;
}

export const EDGE_STREAM_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const EDGE_API_UA = 'OtakuModApp/1.0';

export const EDGE_CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Cache-Control, Pragma, Range',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Content-Disposition, Accept-Ranges',
};

const OKANIME_ORIGIN = 'https://ww3.okanime.xyz';
const ANIMEDAR_ORIGIN = 'https://animedar.net';
const ANIMERCO_ORIGIN = 'https://animerco.org';
const ANILIST_ENDPOINT = 'https://graphql.anilist.co';

const VIDEO_EXT_RE = /\.(?:mp4|m4v|webm|mkv|mov)(?:$|[?#])/i;

type PreferredQuality = 'auto' | 'FHD' | 'HD' | 'SD';
type QualityTier = 'FHD' | 'HD' | 'SD';

export interface EdgeEpisodeServer {
  serverName: string;
  url: string;
  type: 'iframe' | 'direct';
  quality?: '1080p' | '720p' | '480p' | 'multi' | 'auto';
  category?: 'watch' | 'download';
}

export interface EdgeResolvedTarget {
  streamUrl: string;
  referer: string;
  filename: string;
  mode: 'mp4' | 'hls';
  sizeBytes?: number | null;
  serverName?: string;
  resolvedQuality?: QualityTier;
  publicNoReferer?: boolean;
  mimeType?: string;
}

export interface EdgeSignedTokenPayload {
  u: string;
  r: string;
  f: string;
  m: string;
  k: 'mp4' | 'hls';
  s?: number | null;
  exp: number;
}

let isolateRandomKeyBytes: Uint8Array | null = null;
const memoryTokenStore = new Map<string, { payload: EdgeSignedTokenPayload; expiresAt: number }>();

function edgeJson(data: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...EDGE_CORS_HEADERS,
      ...extraHeaders,
    },
  });
}

// ============================================================================
// Security: Strict SSRF URL Validation & Safe Redirect Fetcher
// ============================================================================
export function isDisallowedPrivateHost(hostname: string): boolean {
  const h = hostname.trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (!h) return true;
  if (
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h === '::1' ||
    h === '0.0.0.0' ||
    h.endsWith('.local') ||
    h.endsWith('.internal') ||
    h.endsWith('.localhost')
  ) {
    return true;
  }
  if (/^\d+$/.test(h) || /^0x[0-9a-f]+$/i.test(h)) return true;
  if (/^127\./.test(h) || /^0\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h)) {
    return true;
  }
  const match172 = h.match(/^172\.(\d+)\./);
  if (match172) {
    const second = Number(match172[1]);
    if (second >= 16 && second <= 31) return true;
  }
  const match100 = h.match(/^100\.(\d+)\./);
  if (match100) {
    const second = Number(match100[1]);
    if (second >= 64 && second <= 127) return true;
  }
  if (/^(?:fc|fd)[0-9a-f]{2}:/i.test(h) || /^fe80:/i.test(h) || /^::ffff:(?:127\.|10\.|192\.168\.|169\.254\.)/i.test(h)) {
    return true;
  }
  return false;
}

export function parseSafeHttpUrl(rawUrl: string | null | undefined): URL | null {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    if (isDisallowedPrivateHost(parsed.hostname)) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function fetchEdgeTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 7000,
): Promise<Response> {
  const safe = parseSafeHttpUrl(url);
  if (!safe) {
    throw new Error('Blocked unsafe URL');
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(safe.toString(), {
      ...init,
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWithSafeRedirects(
  rawUrl: string,
  headers: Record<string, string>,
  timeoutMs = 18000,
  method: 'GET' | 'HEAD' = 'GET',
): Promise<{ response: Response; finalUrl: string }> {
  let currentUrl = rawUrl;
  for (let hop = 0; hop <= 5; hop++) {
    const safe = parseSafeHttpUrl(currentUrl);
    if (!safe) {
      throw new Error('Blocked unsafe redirect host');
    }
    const hopHeaders: Record<string, string> = { ...headers };
    if (hopHeaders.Referer && (safe.hostname.includes('vidcache.net') || safe.hostname.includes('googleusercontent.com'))) {
      delete hopHeaders.Referer;
    }
    const resp = await fetchEdgeTimeout(
      safe.toString(),
      {
        method,
        headers: hopHeaders,
        redirect: 'manual',
      },
      timeoutMs,
    );
    if (
      (resp.status === 301 || resp.status === 302 || resp.status === 303 || resp.status === 307 || resp.status === 308) &&
      resp.headers.get('location')
    ) {
      try {
        await resp.body?.cancel();
      } catch {}
      currentUrl = new URL(resp.headers.get('location')!, safe.toString()).href;
      continue;
    }
    return { response: resp, finalUrl: safe.toString() };
  }
  throw new Error('Too many redirects');
}

// ============================================================================
// Stateless HMAC-SHA256 Signed Media Tokens (WebCrypto)
// ============================================================================
function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  const bin = atob(b64 + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

async function getHmacKey(env: EdgeRuntimeEnv): Promise<CryptoKey> {
  const configured = (env.EDGE_TOKEN_SECRET || '').trim();
  let keyBytes: Uint8Array;
  if (configured.length >= 16) {
    keyBytes = new TextEncoder().encode(configured);
  } else {
    if (!isolateRandomKeyBytes) {
      isolateRandomKeyBytes = crypto.getRandomValues(new Uint8Array(32));
    }
    keyBytes = isolateRandomKeyBytes;
  }
  const keyCopy = new Uint8Array(keyBytes.length);
  keyCopy.set(keyBytes);
  return crypto.subtle.importKey(
    'raw',
    keyCopy.buffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export async function signEdgeMediaToken(
  target: EdgeResolvedTarget,
  env: EdgeRuntimeEnv,
  ttlMs = 3 * 3600 * 1000,
): Promise<string> {
  const payload: EdgeSignedTokenPayload = {
    u: target.streamUrl,
    r: target.referer || '',
    f: target.filename || 'episode.mp4',
    m: target.mimeType || (target.mode === 'hls' ? 'application/vnd.apple.mpegurl' : 'video/mp4'),
    k: target.mode,
    s: target.sizeBytes || null,
    exp: Date.now() + ttlMs,
  };
  const encodedPayload = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await getHmacKey(env);
  const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(encodedPayload));
  const token = `ew1.${encodedPayload}.${toBase64Url(new Uint8Array(sigBuf))}`;

  if (memoryTokenStore.size > 300) {
    const now = Date.now();
    for (const [k, v] of memoryTokenStore.entries()) {
      if (v.expiresAt <= now) memoryTokenStore.delete(k);
    }
  }
  memoryTokenStore.set(token, { payload, expiresAt: payload.exp });
  return token;
}

export async function verifyEdgeMediaToken(
  token: string,
  env: EdgeRuntimeEnv,
): Promise<EdgeResolvedTarget | null> {
  if (!token) return null;

  const memHit = memoryTokenStore.get(token);
  if (memHit && memHit.expiresAt > Date.now() && parseSafeHttpUrl(memHit.payload.u)) {
    return {
      streamUrl: memHit.payload.u,
      referer: memHit.payload.r,
      filename: memHit.payload.f,
      mimeType: memHit.payload.m,
      mode: memHit.payload.k,
      sizeBytes: memHit.payload.s || null,
    };
  }

  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'ew1') return null;
  const [, payloadB64, sigB64] = parts;
  try {
    const key = await getHmacKey(env);
    const sigBytes = fromBase64Url(sigB64);
    const sigCopy = new Uint8Array(sigBytes.length);
    sigCopy.set(sigBytes);
    const dataBytes = new TextEncoder().encode(payloadB64);
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      sigCopy.buffer,
      dataBytes,
    );
    if (!valid) return null;

    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(payloadB64))) as EdgeSignedTokenPayload;
    if (!payload || typeof payload.exp !== 'number' || payload.exp <= Date.now()) return null;
    if (!parseSafeHttpUrl(payload.u)) return null;

    return {
      streamUrl: payload.u,
      referer: String(payload.r || ''),
      filename: String(payload.f || 'episode.mp4'),
      mimeType: String(payload.m || 'video/mp4'),
      mode: payload.k === 'hls' ? 'hls' : 'mp4',
      sizeBytes: payload.s || null,
    };
  } catch {
    return null;
  }
}

// ============================================================================
// Pure-JS String & HTML Parsing Helpers (Zero Node / Cheerio)
// ============================================================================
function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n)))
    .replace(/\\u0026/g, '&')
    .replace(/\\u003d/g, '=')
    .replace(/\\u002f/g, '/');
}

function stripTags(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

function extractSlugFromPath(href: string): string {
  if (!href) return '';
  try {
    const u = href.startsWith('http') ? new URL(href) : new URL(href, OKANIME_ORIGIN);
    const parts = u.pathname.split('/').filter(Boolean);
    const idx = parts.findIndex((p) => p === 'anime' || p === 'anime-p' || p === 'series');
    if (idx !== -1 && parts[idx + 1]) return parts[idx + 1];
    const epIdx = parts.findIndex((p) => p === 'episode');
    if (epIdx !== -1 && parts[epIdx + 1]) return parts[epIdx + 1].replace(/-episode-\d+.*$/i, '');
    return parts.pop() || '';
  } catch {
    return '';
  }
}

function normalizeOkanimeHostName(raw: string, url: string): string {
  const h = `${raw} ${url}`.toLowerCase();
  if (/\bvk\b/i.test(raw) || h.includes('vk.com') || h.includes('vkvideo') || h.includes('vk video')) return 'VK Video';
  if (h.includes('mega.nz') || raw.trim().toLowerCase() === 'mega' || h.includes('meganz')) return 'Mega';
  if (h.includes('mp4upload')) return 'MP4Upload';
  if (h.includes('drive.google') || h.includes('gdrive')) return 'Google Drive';
  if (h.includes('mediafire')) return 'MediaFire';
  if (h.includes('sendvid')) return 'Sendvid';
  if (h.includes('uqload')) return 'Uqload';
  if (h.includes('4shared')) return '4Shared';
  if (h.includes('videa')) return 'Videa';
  if (h.includes('ok.ru')) return 'Ok.ru';
  if (h.includes('dailymotion')) return 'Dailymotion';
  if (h.includes('vidmoly')) return 'Vidmoly';
  if (h.includes('streamwish') || h.includes('asnwish')) return 'Streamwish';
  if (h.includes('share4max') || h.includes('megamax')) return 'MegaMax';
  if (h.includes('yourupload')) return 'YourUpload';
  if (h.includes('mixdrop')) return 'Mixdrop';
  if (h.includes('vidoza')) return 'Vidoza';
  if (h.includes('filemoon')) return 'Filemoon';
  if (h.includes('dood') || h.includes('d000d')) return 'DoodStream';
  return raw ? raw.trim() : 'Direct Server';
}

function isMultiQualityWatchHost(serverName: string, url: string): boolean {
  const lower = `${serverName} ${url}`.toLowerCase();
  return (
    lower.includes('vk video') ||
    lower.includes('vk.com') ||
    lower.includes('vkvideo') ||
    lower.includes('ok.ru') ||
    lower.includes('dailymotion') ||
    lower.includes('videa') ||
    lower.includes('megamax') ||
    lower.includes('share4max')
  );
}

function mapOkanimeQuality(raw: string): '1080p' | '720p' | '480p' {
  const q = (raw || '').toUpperCase();
  if (q.includes('FHD') || q.includes('1080')) return '1080p';
  if (q.includes('SD') || q.includes('480') || q.includes('360')) return '480p';
  return '720p';
}

function getServerReliabilityScore(server: EdgeEpisodeServer): number {
  const lowerName = (server.serverName || '').toLowerCase();
  const lowerUrl = (server.url || '').toLowerCase();
  if (lowerName.includes('vk') || lowerUrl.includes('vk.com') || lowerUrl.includes('vkvideo')) return 130;
  if (lowerName.includes('ok.ru') || lowerUrl.includes('ok.ru')) return 122;
  if (lowerName.includes('dailymotion') || lowerUrl.includes('dailymotion.com')) return 118;
  if (lowerName.includes('videa') || lowerUrl.includes('videa.hu')) return 115;
  if (lowerName.includes('megamax') || lowerUrl.includes('megamax') || lowerUrl.includes('share4max')) return 112;
  if (lowerName.includes('mega') && !lowerName.includes('megamax') && !lowerUrl.includes('share4max')) return 100;
  if (lowerUrl.includes('mega.nz')) return 100;
  if (lowerName.includes('sendvid') || lowerUrl.includes('sendvid.com')) return 95;
  if (lowerName.includes('mp4upload') || lowerUrl.includes('mp4upload.com')) return 90;
  if (lowerName.includes('drive') || lowerUrl.includes('drive.google')) return 85;
  if (lowerName.includes('uqload') || lowerUrl.includes('uqload.')) return 75;
  if (lowerName.includes('streamwish') || lowerUrl.includes('asnwish') || lowerUrl.includes('filemoon')) return 70;
  if (lowerName.includes('vidmoly') || lowerUrl.includes('vidmoly')) return 20;
  if (lowerName.includes('sibnet') || lowerUrl.includes('sibnet')) return 10;
  return 50;
}

function isAdShortenerUrl(u: string): boolean {
  if (!u) return true;
  const lower = u.toLowerCase();
  return (
    lower.includes('cuty.io') ||
    lower.includes('ouo.io') ||
    lower.includes('ouo.press') ||
    lower.includes('shrinkme.') ||
    lower.includes('exe.io') ||
    lower.includes('linkvertise.') ||
    lower.includes('adfly') ||
    lower.includes('adf.ly') ||
    lower.includes('shortner') ||
    lower.includes('shortlink') ||
    lower.includes('clicksfly') ||
    lower.includes('sh.st')
  );
}

// ============================================================================
// OkAnime + AnimeDar Direct Edge Scrapers
// ============================================================================
async function fetchSiteHtml(url: string, timeoutMs = 6000): Promise<string> {
  const res = await fetchEdgeTimeout(
    url,
    {
      headers: {
        'User-Agent': EDGE_STREAM_UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ar-EG,ar;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    },
    timeoutMs,
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  if (text.length < 1500) throw new Error('Response too short');
  return text;
}

function parseOkanimeAnimeHtml(html: string, slug: string) {
  const withoutAside = html.replace(/<aside[\s\S]*?<\/aside>/gi, '');
  const h1Match =
    html.match(/<h1[^>]*class="[^"]*animepage-h1[^"]*"[^>]*>([\s\S]*?)<\/h1>/i) ||
    html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) ||
    html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  let rawTitle = h1Match ? stripTags(h1Match[1]) : slug.replace(/-/g, ' ');
  rawTitle = rawTitle
    .replace(/-\s*أوك انمي.*$/i, '')
    .replace(/-\s*OkAnime.*$/i, '')
    .replace(/^جميع\s*حلقات\s*/i, '')
    .replace(/^انمي\s+/i, '')
    .replace(/\s*مترجم.*$/i, '')
    .trim();

  const posterMatch =
    html.match(/<img[^>]*class="[^"]*animepage-poster[^"]*"[^>]+(?:src|data-src)=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
  const posterUrl = posterMatch ? decodeHtmlEntities(posterMatch[1].trim()) : '';

  const descMatch =
    html.match(/class="[^"]*synopsis-text[^"]*"[^>]*>([\s\S]*?)<\/[^>]+>/i) ||
    html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
  const description = descMatch ? stripTags(descMatch[1]) : '';

  const mainColMatch = withoutAside.match(/class="[^"]*animepage-main-col[^"]*"[\s\S]*$/i);
  const epSearchZone = mainColMatch ? mainColMatch[0] : withoutAside;

  const episodes: { id: string; num: string; title: string; link: string; seasonNumber: number }[] = [];
  const anchorRegex = /<a\b[^>]*href=["']([^"']*\/episode\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = anchorRegex.exec(epSearchZone)) !== null) {
    const href = decodeHtmlEntities(m[1].trim());
    const text = stripTags(m[2]);
    const numMatch = href.match(/-episode-(\d+)(?:$|\/|\?|#)/i) || text.match(/(\d+)/);
    if (!numMatch || !numMatch[1]) continue;
    const epNum = String(parseInt(numMatch[1], 10));
    if (!epNum || epNum === 'NaN') continue;
    const fullLink = href.startsWith('http')
      ? href
      : `${OKANIME_ORIGIN}${href.startsWith('/') ? href : `/${href}`}`;
    if (!episodes.some((e) => e.num === epNum)) {
      episodes.push({
        id: `${slug}__ep__${epNum}`,
        num: epNum,
        title: `الحلقة ${epNum}`,
        link: fullLink,
        seasonNumber: 1,
      });
    }
  }

  episodes.sort((a, b) => (parseInt(a.num, 10) || 0) - (parseInt(b.num, 10) || 0));
  const statusMatch = withoutAside.match(/الحالة[\s\S]{0,80}?(مستمر|يعرض|مكتمل|قادم|Ongoing|Completed|Upcoming)/i);
  const statusRaw = statusMatch ? statusMatch[1].toLowerCase() : '';
  const status =
    statusRaw.includes('مكتمل') || statusRaw.includes('completed')
      ? 'مكتمل'
      : statusRaw.includes('قادم') || statusRaw.includes('upcoming')
      ? 'قادم'
      : 'مستمر';

  return {
    slug,
    title: cleanAnimeTitle(rawTitle) || rawTitle,
    rawTitle,
    posterUrl,
    description,
    status,
    episodes,
  };
}

function cleanQueryForSearch(query: string): string {
  return query
    .replace(/الموسم\s*\d+/gi, '')
    .replace(/الجزء\s*\d+/gi, '')
    .replace(/الموسم\s*(?:الأول|الثاني|الثالث|الرابع|الخامس)/gi, '')
    .replace(/الجزء\s*(?:الأول|الثاني|الثالث|الرابع|الخامس)/gi, '')
    .replace(/جميع\s*حلقات/gi, '')
    .replace(/انمي/gi, '')
    .replace(/مترجم.*/gi, '')
    .replace(/اون\s*لاين/gi, '')
    .replace(/الحلقة\s*\d+/gi, '')
    .replace(/[\s\-\\\/:]+/g, ' ')
    .trim();
}

function scoreSearchCandidates(
  query: string,
  results: { slug: string; title: string; isUpcoming?: boolean }[],
): string | null {
  if (!results.length) return null;
  const cleanQuery = cleanQueryForSearch(query).toLowerCase().replace(/[^a-z0-9\s\u0600-\u06FF]/g, '').trim() || query.toLowerCase().trim();
  const queryWords = cleanQuery.split(/\s+/).filter((w) => w.length >= 2);
  const querySlug = cleanQuery.replace(/\s+/g, '-');
  const specialKeywords = ['movie', 'special', 'ova', 'ona', 'film', 'فيلم', 'فلم', 'خاصة', 'أوفا'];
  const queryHasSpecial = specialKeywords.some((kw) => query.toLowerCase().includes(kw));

  let bestSlug: string | null = null;
  let bestScore = -999999;

  for (const item of results) {
    const cleanT = cleanQueryForSearch(item.title).toLowerCase().replace(/[^a-z0-9\s\u0600-\u06FF]/g, '').trim();
    const engT = cleanQueryForSearch(item.title).toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
    const words = cleanT.split(/\s+/).filter(Boolean);
    const decodedSlug = item.slug.toLowerCase();
    const overlap = queryWords.filter((w) => words.includes(w) || decodedSlug.includes(w)).length;
    const hasSub =
      (cleanQuery.length >= 3 && (cleanT.includes(cleanQuery) || decodedSlug.includes(querySlug))) ||
      (cleanT.length >= 3 && cleanQuery.includes(cleanT));
    if (overlap === 0 && !hasSub) continue;

    let score = 0;
    if (cleanT === cleanQuery || (engT && engT === cleanQuery)) score += 1200;
    if (hasSub) score += 500 - Math.abs((engT || cleanT).length - cleanQuery.length) * 4;
    if (queryWords.length > 0 && overlap / queryWords.length > 0.35) score += (overlap / queryWords.length) * 450;
    if (decodedSlug.includes(querySlug)) score += 450;
    if (item.isUpcoming) score -= 800;
    const itemHasSpecial = specialKeywords.some((kw) => item.title.toLowerCase().includes(kw) || decodedSlug.includes(kw));
    if (itemHasSpecial && !queryHasSpecial) score -= 900;

    if (score > bestScore) {
      bestScore = score;
      bestSlug = item.slug;
    }
  }
  return bestSlug || results[0]?.slug || null;
}

async function searchEdgeOkanimeSlug(query: string): Promise<string | null> {
  const cleanQ = cleanQueryForSearch(query);
  if (!cleanQ) return null;
  try {
    const html = await fetchSiteHtml(`${OKANIME_ORIGIN}/search?q=${encodeURIComponent(cleanQ)}`, 4500);
    const withoutAside = html.replace(/<aside[\s\S]*?<\/aside>/gi, '');
    const results: { slug: string; title: string; isUpcoming?: boolean }[] = [];
    const cardRe = /<a\b[^>]*href=["']([^"']*\/anime\/([^"'/?#]+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let m: RegExpExecArray | null;
    while ((m = cardRe.exec(withoutAside)) !== null) {
      const slug = m[2]?.trim();
      if (!slug || slug.includes('${') || results.some((r) => r.slug === slug)) continue;
      const anchorInner = m[3] || '';
      const altMatch = anchorInner.match(/alt=["']([^"']+)["']/i);
      const text = stripTags(anchorInner) || altMatch?.[1] || slug.replace(/-/g, ' ');
      const context = withoutAside.slice(Math.max(0, m.index - 80), m.index + 320);
      const isUpcoming = /قادم|upcoming/i.test(context);
      results.push({ slug, title: text, isUpcoming });
    }
    return scoreSearchCandidates(query, results);
  } catch {
    return null;
  }
}

function buildAnimedarServerUrlsEdge(
  rawType: string,
  rawId: string,
  rawQuality: string,
): { serverName: string; watchUrl: string; downloadUrl: string; quality: '1080p' | '720p' | '480p' | 'auto' } | null {
  const type = (rawType || '').trim().toLowerCase().split(/\s+/)[0];
  const id = (rawId || '').trim();
  const qLower = (rawQuality || '').trim().toLowerCase();
  if (!id) return null;

  let quality: '1080p' | '720p' | '480p' | 'auto' = '1080p';
  if (qLower === 'fhd' || qLower === '1080p' || qLower === '1080') quality = '1080p';
  else if (qLower === 'hd' || qLower === '720p' || qLower === '720') quality = '720p';
  else if (qLower === 'sd' || qLower === '480p' || qLower === '480' || qLower === 'ld' || qLower === '360p' || qLower === 'low') quality = '480p';

  let serverName = type.toUpperCase();
  let watchUrl = '';
  let downloadUrl = '';

  if (id.startsWith('http://') || id.startsWith('https://')) {
    watchUrl = id;
    downloadUrl = id;
    if (id.includes('mega.nz')) {
      serverName = 'Mega';
      const cleanMega = id.replace(/\.html$/i, '');
      watchUrl = cleanMega;
      downloadUrl = cleanMega.replace('/embed/', '/file/');
    } else if (id.includes('ok.ru')) {
      serverName = 'Ok.ru';
      downloadUrl = id.replace('/videoembed/', '/video/');
    } else if (id.includes('videa.hu')) {
      serverName = 'Videa';
    } else if (id.includes('mp4upload')) {
      serverName = 'MP4Upload';
      downloadUrl = id.replace('/embed-', '/').replace(/\.html$/i, '');
    } else if (id.includes('4shared')) {
      serverName = '4Shared';
      const fileMatch = id.match(/\/file\/([A-Za-z0-9_-]+)/);
      if (fileMatch) downloadUrl = `https://www.4shared.com/get/${fileMatch[1].slice(0, 10)}`;
    } else if (id.includes('dailymotion')) {
      serverName = 'Dailymotion';
    } else if (id.includes('drive.google')) {
      serverName = 'Google Drive';
      const dMatch = id.match(/\/d\/([A-Za-z0-9_-]+)/);
      if (dMatch) downloadUrl = `https://drive.google.com/u/0/uc?id=${dMatch[1]}&export=download`;
    } else if (id.includes('vidmoly')) {
      serverName = 'Vidmoly';
      downloadUrl = id.replace('/embed-', '/');
    } else if (id.includes('uqload')) {
      serverName = 'Uqload';
      downloadUrl = id.replace('/embed-', '/').replace('/e/', '/');
    } else if (id.includes('filemoon')) {
      serverName = 'Filemoon';
      downloadUrl = id.replace('/e/', '/d/');
    } else if (id.includes('dood') || id.includes('d000')) {
      serverName = 'DoodStream';
      downloadUrl = id.replace('/e/', '/d/');
    } else if (id.includes('wish') || id.includes('asnwish')) {
      serverName = 'Streamwish';
      downloadUrl = id.replace('/e/', '/f/');
    }
    return { serverName, watchUrl, downloadUrl, quality };
  }

  switch (type) {
    case 'mega': {
      serverName = 'Mega';
      const cleanId = id.replace(/^:?\/?mega\.nz\/embed#?!?/i, '').replace(/\.html$/i, '');
      watchUrl = `https://mega.nz/embed/${cleanId}`;
      downloadUrl = `https://mega.nz/file/${cleanId}`;
      break;
    }
    case 'ok':
      serverName = 'Ok.ru';
      watchUrl = `https://www.ok.ru/videoembed/${id}`;
      downloadUrl = `https://www.ok.ru/video/${id}`;
      break;
    case 'videa':
      serverName = 'Videa';
      watchUrl = `https://videa.hu/player?v=${id}`;
      downloadUrl = `https://videa.hu/player?v=${id}`;
      break;
    case 'mp4upload': {
      serverName = 'MP4Upload';
      const cleanMp4Id = id.replace(/^embed-/i, '').replace(/\.html$/i, '');
      watchUrl = `https://www.mp4upload.com/embed-${cleanMp4Id}.html`;
      downloadUrl = `https://www.mp4upload.com/${cleanMp4Id}`;
      break;
    }
    case '4shared': {
      serverName = '4Shared';
      const sharedId = id.slice(0, 10);
      watchUrl = `https://www.4shared.com/web/embed/file/${sharedId}`;
      downloadUrl = `https://www.4shared.com/get/${sharedId}`;
      break;
    }
    case 'asnwish':
    case 'streamwish':
    case 'wish':
    case 'watchsb':
    case 'sblanh':
      serverName = 'Streamwish';
      watchUrl = `https://asnwish.com/e/${id}`;
      downloadUrl = `https://asnwish.com/f/${id}`;
      break;
    case 'dood':
    case 'doodstream':
      serverName = 'DoodStream';
      watchUrl = `https://d000d.com/e/${id}`;
      downloadUrl = `https://d000d.com/d/${id}`;
      break;
    case 'dailymotion':
      serverName = 'Dailymotion';
      watchUrl = `https://www.dailymotion.com/embed/video/${id}`;
      downloadUrl = `https://www.dailymotion.com/video/${id}`;
      break;
    case 'gdrive':
    case 'drive': {
      serverName = 'Google Drive';
      const cleanDriveId = id.split('/p')[0].split('%2F')[0].replace(/\/preview.*$/i, '');
      watchUrl = `https://drive.google.com/file/d/${cleanDriveId}/preview`;
      downloadUrl = `https://drive.google.com/u/0/uc?id=${cleanDriveId}&export=download`;
      break;
    }
    case 'uqload': {
      serverName = 'Uqload';
      const cleanUqId = id.replace(/^embed-/i, '').replace(/\.html$/i, '');
      watchUrl = `https://uqload.vc/embed-${cleanUqId}.html`;
      downloadUrl = `https://uqload.vc/${cleanUqId}.html`;
      break;
    }
    case 'filemoon':
      serverName = 'Filemoon';
      watchUrl = `https://filemoon.sx/e/${id}`;
      downloadUrl = `https://filemoon.sx/d/${id}`;
      break;
    case 'lulustream':
      serverName = 'LuluStream';
      watchUrl = `https://lulustream.com/e/${id}`;
      downloadUrl = `https://lulustream.com/d/${id}`;
      break;
    case 'filelions':
    case 'vidhide':
      serverName = 'VidHide';
      watchUrl = `https://filelions.to/v/${id}`;
      downloadUrl = `https://filelions.to/d/${id}`;
      break;
    case 'vk':
      serverName = 'VK Video';
      watchUrl = `https://vk.com/video_ext.php?oid=${id}`;
      downloadUrl = watchUrl;
      break;
    case 'sibnet':
      serverName = 'Sibnet';
      watchUrl = `https://video.sibnet.ru/shell.php?videoid=${id}`;
      downloadUrl = watchUrl;
      break;
    case 'streamtape':
      serverName = 'Streamtape';
      watchUrl = `https://streamtape.com/e/${id}`;
      downloadUrl = `https://streamtape.com/v/${id}`;
      break;
    case 'vidmoly': {
      serverName = 'Vidmoly';
      const cleanMolyId = id.replace(/^embed-/i, '').replace(/\.html$/i, '');
      watchUrl = `https://vidmoly.org/embed-${cleanMolyId}.html`;
      downloadUrl = `https://vidmoly.org/${cleanMolyId}.html`;
      break;
    }
    case 'sendvid':
      serverName = 'Sendvid';
      watchUrl = `https://sendvid.com/embed/${id}`;
      downloadUrl = `https://sendvid.com/${id}`;
      break;
    case 'yourupload':
      serverName = 'YourUpload';
      watchUrl = `https://www.yourupload.com/embed/${id}`;
      downloadUrl = `https://www.yourupload.com/watch/${id}`;
      break;
    case 'mixdrop':
      serverName = 'Mixdrop';
      watchUrl = `https://mixdrop.to/e/${id}`;
      downloadUrl = `https://mixdrop.to/f/${id}`;
      break;
    default:
      return null;
  }
  return { serverName, watchUrl, downloadUrl, quality };
}

function parseAnimedarServersAndEpisodes(html: string, slug: string) {
  const episodes: { id: string; num: string; title: string; link: string; seasonNumber: number }[] = [];
  const episodeServersByNum = new Map<string, EdgeEpisodeServer[]>();

  const epListIdx = html.indexOf('id="EpList1"');
  const epListEnd = epListIdx !== -1 ? html.indexOf('id="ServerList1"', epListIdx) : -1;
  const epZone = epListIdx !== -1 ? html.slice(epListIdx, epListEnd !== -1 ? epListEnd : epListIdx + 40000) : '';

  const srvListIdx = html.indexOf('id="ServerList1"');
  const srvZone = srvListIdx !== -1 ? html.slice(srvListIdx, srvListIdx + 120000) : '';

  const epMatches: { epNum: string; idsb: string }[] = [];
  const epRe = /<div\b([^>]*(?:data-episode|id=["']IDSB\d+["'])[^>]*)>([\s\S]*?)<\/div>/gi;
  let em: RegExpExecArray | null;
  while ((em = epRe.exec(epZone)) !== null) {
    const attrs = em[1] || '';
    const inner = stripTags(em[2] || '');
    const dataEp = attrs.match(/data-episode=["']([^"']+)["']/i)?.[1] || '';
    const idAttr = attrs.match(/id=["']([^"']+)["']/i)?.[1] || '';
    const numMatch =
      dataEp.match(/\d+/) ||
      inner.match(/الحلقة\s*(\d+)/) ||
      inner.match(/(\d+)/) ||
      idAttr.match(/IDSB(\d+)/i);
    if (!numMatch) continue;
    const epNum = String(parseInt(numMatch[1] || numMatch[0], 10));
    const idsb = idAttr.replace(/^IDSB/i, '') || epNum;
    if (!epMatches.some((x) => x.epNum === epNum)) {
      epMatches.push({ epNum, idsb });
      episodes.push({
        id: `${slug}__ep__${epNum}`,
        num: epNum,
        title: `الحلقة ${epNum}`,
        link: `${ANIMEDAR_ORIGIN}/anime-p/${slug}/?ep=${epNum}`,
        seasonNumber: 1,
      });
    }
  }

  const divBoxes = srvZone.split(/<div\b[^>]*class=["'][^"']*divv11[^"']*["']/i);
  for (let i = 1; i < divBoxes.length; i++) {
    const chunk = divBoxes[i];
    const headerAttrsEnd = chunk.indexOf('>');
    if (headerAttrsEnd === -1) continue;
    const headerAttrs = chunk.slice(0, headerAttrsEnd);
    const body = chunk.slice(headerAttrsEnd + 1);
    const classEpMatch = headerAttrs.match(/\be(\d+)\b/) || headerAttrs.match(/data-ep=["'](\d+)["']/i);
    const epNum = classEpMatch?.[1] || epMatches[i - 1]?.epNum || String(i);

    const list: EdgeEpisodeServer[] = [];
    const liRe = /<li\b([^>]*)>([\s\S]*?)<\/li>/gi;
    let lm: RegExpExecArray | null;
    while ((lm = liRe.exec(body)) !== null) {
      const a = lm[1] || '';
      const srvType =
        a.match(/\btype=["']([^"']+)["']/i)?.[1] ||
        a.match(/data-type=["']([^"']+)["']/i)?.[1] ||
        stripTags(lm[2] || '');
      const srvId =
        a.match(/\bdata=["']([^"']+)["']/i)?.[1] ||
        a.match(/data-id=["']([^"']+)["']/i)?.[1] ||
        '';
      const srvQuality =
        a.match(/quality-data=["']([^"']+)["']/i)?.[1] ||
        a.match(/data-quality=["']([^"']+)["']/i)?.[1] ||
        'HD';
      const built = buildAnimedarServerUrlsEdge(srvType, srvId, srvQuality);
      if (!built) continue;
      if (built.watchUrl && !list.some((s) => s.url === built.watchUrl && s.category === 'watch')) {
        list.push({
          serverName: built.serverName,
          url: built.watchUrl,
          type: 'iframe',
          quality: isMultiQualityWatchHost(built.serverName, built.watchUrl) ? 'multi' : built.quality,
          category: 'watch',
        });
      }
      if (built.downloadUrl && !list.some((s) => s.url === built.downloadUrl && s.category === 'download')) {
        list.push({
          serverName: built.serverName,
          url: built.downloadUrl,
          type: 'direct',
          quality: built.quality,
          category: 'download',
        });
      }
    }
    if (list.length > 0) {
      episodeServersByNum.set(String(epNum), list);
    }
  }

  episodes.sort((a, b) => (parseInt(a.num, 10) || 0) - (parseInt(b.num, 10) || 0));
  return { episodes, episodeServersByNum };
}

async function searchEdgeAnimedarSlug(query: string): Promise<string | null> {
  const cleanQ = cleanQueryForSearch(query);
  if (!cleanQ) return null;
  try {
    const html = await fetchSiteHtml(`${ANIMEDAR_ORIGIN}/?s=${encodeURIComponent(cleanQ)}`, 4500);
    const results: { slug: string; title: string }[] = [];
    const artRe = /<a\b[^>]*href=["']([^"']*\/anime-p\/([^"'/?#]+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let m: RegExpExecArray | null;
    while ((m = artRe.exec(html)) !== null) {
      const slug = m[2]?.trim();
      if (!slug || results.some((r) => r.slug === slug)) continue;
      const title = stripTags(m[3] || '') || slug.replace(/-/g, ' ');
      results.push({ slug, title });
    }
    return scoreSearchCandidates(query, results);
  } catch {
    return null;
  }
}

async function searchEdgeAnimercoAndExtract(
  candidateTitles: string[],
  epNum: string,
  seasonNumber = 1,
): Promise<EdgeEpisodeServer[]> {
  const cleanEp = String(parseInt(String(epNum), 10) || epNum).trim();
  if (!cleanEp) return [];

  const queries: string[] = [];
  for (const t of candidateTitles) {
    const cleaned = cleanQueryForSearch(t);
    if (cleaned && cleaned.length >= 2 && !queries.includes(cleaned)) {
      queries.push(cleaned);
    }
  }

  let matchedAnimeUrl = '';
  for (const q of queries.slice(0, 3)) {
    try {
      const html = await fetchSiteHtml(`${ANIMERCO_ORIGIN}/?s=${encodeURIComponent(q)}`, 4500);
      const animeRe = /<a\b[^>]*href=["'](https?:\/\/[^"']*animerco\.org\/(?:animes|movies)\/([^"'/?#]+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
      const results: { slug: string; title: string; href: string }[] = [];
      let m: RegExpExecArray | null;
      while ((m = animeRe.exec(html)) !== null) {
        const href = decodeHtmlEntities(m[1]).trim();
        const slug = decodeURIComponent(m[2] || '').replace(/^انمي[_-]/i, '').trim();
        if (!parseSafeHttpUrl(href) || results.some((r) => r.href === href)) continue;
        const innerText = stripTags(m[3] || '');
        const altMatch = (m[0] || '').match(/alt=["']([^"']+)["']/i);
        const title = innerText || altMatch?.[1] || slug.replace(/[-_]/g, ' ');
        results.push({ slug: m[2], title, href });
      }
      if (results.length > 0) {
        const bestSlug = scoreSearchCandidates(q, results);
        const chosen = results.find((r) => r.slug === bestSlug) || results[0];
        if (chosen?.href) {
          matchedAnimeUrl = chosen.href;
          break;
        }
      }
    } catch {}
  }

  if (!matchedAnimeUrl) return [];

  let epPageUrl = '';
  try {
    if (matchedAnimeUrl.includes('/movies/')) {
      epPageUrl = matchedAnimeUrl;
    } else {
      const animeHtml = await fetchSiteHtml(matchedAnimeUrl, 4500);
      const epHrefRegex = new RegExp(
        `href=["'](https?:\\/\\/[^"']*animerco\\.org\\/episodes\\/[^"']*-(?:%d8%a7%d9%84%d8%ad%d9%84%d9%82%d8%a9|الحلقة|episode)-0*${cleanEp}(?:\\/|\\?|#|$)[^"']*)["']`,
        'i',
      );
      const directMatch = animeHtml.match(epHrefRegex);
      if (directMatch?.[1]) {
        epPageUrl = decodeHtmlEntities(directMatch[1]).trim();
      } else {
        const seasonLinks: string[] = [];
        const seasonRe = /href=["'](https?:\/\/[^"']*animerco\.org\/seasons\/[^"']+)["']/gi;
        let sm: RegExpExecArray | null;
        while ((sm = seasonRe.exec(animeHtml)) !== null) {
          const sUrl = decodeHtmlEntities(sm[1]).trim();
          if (parseSafeHttpUrl(sUrl) && !seasonLinks.includes(sUrl)) {
            seasonLinks.push(sUrl);
          }
        }
        if (seasonLinks.length > 0) {
          const targetSeason = Math.max(1, Number(seasonNumber) || 1);
          const targetSeasonUrl =
            seasonLinks.find((u) => new RegExp(`(?:-|season-|s)${targetSeason}(?:\\/|$)`, 'i').test(u)) ||
            seasonLinks[targetSeason - 1] ||
            seasonLinks[0];
          const seasonHtml = await fetchSiteHtml(targetSeasonUrl, 4500);
          const epMatch = seasonHtml.match(epHrefRegex);
          if (epMatch?.[1]) {
            epPageUrl = decodeHtmlEntities(epMatch[1]).trim();
          }
        }
      }
    }
  } catch {}

  if (!epPageUrl || !parseSafeHttpUrl(epPageUrl)) return [];

  try {
    const epHtml = await fetchSiteHtml(epPageUrl, 4500);
    const embeds: { embedUrl: string; label: string }[] = [];
    const anchorRe = /<a\b([^>]*data-embed-url=["']([^"']+)["'][^>]*)>([\s\S]*?)<\/a>/gi;
    let am: RegExpExecArray | null;
    while ((am = anchorRe.exec(epHtml)) !== null) {
      const embedUrl = decodeHtmlEntities(am[2] || '').trim();
      const label = stripTags(am[3] || '');
      if (!embedUrl || !parseSafeHttpUrl(embedUrl)) continue;
      if (/\bhqq\b|hqq\.|netu|waaw/i.test(label)) continue;
      if (!embeds.some((e) => e.embedUrl === embedUrl)) {
        embeds.push({ embedUrl, label });
      }
    }

    const resolved = await Promise.allSettled(
      embeds.slice(0, 6).map(async ({ embedUrl, label }) => {
        const res = await fetchEdgeTimeout(
          embedUrl,
          {
            headers: {
              'User-Agent': EDGE_STREAM_UA,
              Referer: epPageUrl,
              Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
            },
          },
          3500,
        );
        if (!res.ok) return null;
        const playerHtml = await res.text();
        const iframeMatch = playerHtml.match(/<iframe[^>]+src=["']([^"']+)["']/i);
        const iframeSrc = iframeMatch?.[1] ? decodeHtmlEntities(iframeMatch[1]).trim() : '';
        if (!iframeSrc || !parseSafeHttpUrl(iframeSrc)) return null;
        if (isAdShortenerUrl(iframeSrc) || iframeSrc.includes('hqq.') || iframeSrc.includes('waaw.')) return null;

        const serverName = normalizeOkanimeHostName(label, iframeSrc);
        const quality: EdgeEpisodeServer['quality'] = isMultiQualityWatchHost(serverName, iframeSrc)
          ? 'multi'
          : mapOkanimeQuality(label);
        return {
          serverName,
          url: iframeSrc,
          type: 'iframe',
          quality,
          category: 'watch',
        } as EdgeEpisodeServer;
      }),
    );

    const out: EdgeEpisodeServer[] = [];
    for (const r of resolved) {
      if (r.status === 'fulfilled' && r.value && !out.some((x) => x.url === r.value!.url)) {
        out.push(r.value);
      }
    }
    return out;
  } catch {
    return [];
  }
}

// ============================================================================
// AniList GraphQL + Translation on Edge
// ============================================================================
const EDGE_MEDIA_DETAILS_FRAGMENT = `
  id
  idMal
  title { romaji english native }
  coverImage { extraLarge large }
  bannerImage
  description(asHtml: false)
  episodes
  status
  season
  seasonYear
  averageScore
  genres
  format
  duration
  studios(isMain: true) { nodes { name } }
  nextAiringEpisode { episode airingAt }
  streamingEpisodes { thumbnail }
  characters(sort: [ROLE, RELEVANCE], page: 1, perPage: 20) {
    edges {
      role
      node { id name { full } image { large } }
      voiceActors(language: JAPANESE, sort: [RELEVANCE]) {
        id name { full } image { large }
      }
    }
  }
  recommendations(sort: RATING_DESC, perPage: 8) {
    nodes {
      mediaRecommendation {
        id idMal
        title { romaji english }
        coverImage { large extraLarge }
      }
    }
  }
  relations {
    edges {
      relationType(version: 2)
      node {
        id idMal type format episodes seasonYear
        title { romaji english }
        coverImage { large extraLarge }
      }
    }
  }
`;

async function queryAniListEdge(query: string, variables: Record<string, any> = {}): Promise<any> {
  const res = await fetchEdgeTimeout(
    ANILIST_ENDPOINT,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': EDGE_API_UA,
      },
      body: JSON.stringify({ query, variables }),
    },
    5000,
  );
  if (!res.ok) throw new Error(`AniList HTTP ${res.status}`);
  const json: any = await res.json();
  return json?.data || null;
}

function mapJikanToEdgeMedia(j: any): any | null {
  if (!j || !j.mal_id) return null;
  const statusStr = String(j.status || '').toLowerCase();
  const status = statusStr.includes('finish')
    ? 'FINISHED'
    : statusStr.includes('not yet')
    ? 'NOT_YET_RELEASED'
    : 'RELEASING';
  return {
    id: j.mal_id,
    idMal: j.mal_id,
    title: {
      romaji: j.title || j.title_english || '',
      english: j.title_english || j.title || '',
      native: j.title_japanese || '',
    },
    coverImage: {
      extraLarge: j.images?.jpg?.large_image_url || j.images?.jpg?.image_url || '',
      large: j.images?.jpg?.image_url || '',
    },
    bannerImage: j.images?.jpg?.large_image_url || '',
    description: j.synopsis || '',
    episodes: j.episodes || null,
    status,
    season: j.season ? String(j.season).toUpperCase() : 'WINTER',
    seasonYear: j.year || j.aired?.prop?.from?.year || new Date().getFullYear(),
    averageScore: j.score ? Math.round(Number(j.score) * 10) : 84,
    genres: Array.isArray(j.genres) ? j.genres.map((g: any) => g.name).filter(Boolean) : [],
    format: j.type || 'TV',
    duration: parseInt(String(j.duration || '24'), 10) || 24,
    studios: { nodes: Array.isArray(j.studios) ? j.studios.map((s: any) => ({ name: s.name })) : [] },
    synonyms: Array.isArray(j.title_synonyms) ? j.title_synonyms : [],
    streamingEpisodes: [],
    characters: { edges: [] },
    recommendations: { nodes: [] },
    relations: { edges: [] },
  };
}

function mapKitsuToEdgeMedia(k: any, explicitMalId?: number): any | null {
  const attr = k?.attributes;
  if (!attr) return null;
  const rawStatus = String(attr.status || '').toLowerCase();
  const status = rawStatus === 'finished' ? 'FINISHED' : rawStatus === 'upcoming' ? 'NOT_YET_RELEASED' : 'RELEASING';
  const year = attr.startDate ? Number(String(attr.startDate).slice(0, 4)) : new Date().getFullYear();
  return {
    id: explicitMalId || Number(k.id) || 0,
    idMal: explicitMalId || undefined,
    title: {
      romaji: attr.titles?.en_jp || attr.canonicalTitle || '',
      english: attr.titles?.en || attr.canonicalTitle || '',
      native: attr.titles?.ja_jp || '',
    },
    coverImage: {
      extraLarge: attr.posterImage?.original || attr.posterImage?.large || '',
      large: attr.posterImage?.large || attr.posterImage?.medium || '',
    },
    bannerImage: attr.coverImage?.original || attr.coverImage?.large || '',
    description: attr.synopsis || attr.description || '',
    episodes: attr.episodeCount || null,
    status,
    season: 'WINTER',
    seasonYear: Number.isFinite(year) ? year : new Date().getFullYear(),
    averageScore: attr.averageRating ? Math.round(Number(attr.averageRating)) : 82,
    genres: ['Action', 'Fantasy'],
    format: String(attr.subtype || 'TV').toUpperCase(),
    duration: attr.episodeLength || 24,
    studios: { nodes: [] },
    synonyms: Array.isArray(attr.abbreviatedTitles) ? attr.abbreviatedTitles : [],
    streamingEpisodes: [],
    characters: { edges: [] },
    recommendations: { nodes: [] },
    relations: { edges: [] },
  };
}

async function fetchFallbackAnimeMetadataEdge(idOrQuery: string): Promise<any | null> {
  const clean = String(idOrQuery || '').trim();
  if (!clean) return null;
  const isNum = /^\d+$/.test(clean);

  try {
    const jikanUrl = isNum
      ? `https://api.jikan.moe/v4/anime/${clean}/full`
      : `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(clean)}&limit=1&sfw=true`;
    const res = await fetchEdgeTimeout(
      jikanUrl,
      { headers: { 'User-Agent': EDGE_API_UA, Accept: 'application/json' } },
      3800,
    );
    if (res.ok) {
      const json: any = await res.json();
      const raw = isNum ? json?.data : json?.data?.[0];
      const mapped = mapJikanToEdgeMedia(raw);
      if (mapped) return mapped;
    }
  } catch {}

  if (!isNum) {
    try {
      const kitsuUrl = `https://kitsu.io/api/edge/anime?filter[text]=${encodeURIComponent(clean)}&page[limit]=1`;
      const res = await fetchEdgeTimeout(
        kitsuUrl,
        { headers: { 'User-Agent': EDGE_API_UA, Accept: 'application/vnd.api+json' } },
        3800,
      );
      if (res.ok) {
        const json: any = await res.json();
        const item = json?.data?.[0];
        const mapped = mapKitsuToEdgeMedia(item);
        if (mapped) return mapped;
      }
    } catch {}
  } else {
    try {
      const kitMapUrl = `https://kitsu.io/api/edge/mappings?filter[externalSite]=myanimelist/anime&filter[externalId]=${clean}&include=item`;
      const res = await fetchEdgeTimeout(
        kitMapUrl,
        { headers: { 'User-Agent': EDGE_API_UA, Accept: 'application/vnd.api+json' } },
        3800,
      );
      if (res.ok) {
        const json: any = await res.json();
        const included = Array.isArray(json?.included) ? json.included : [];
        const animeItem = included.find((x: any) => x?.type === 'anime') || included[0];
        const mapped = mapKitsuToEdgeMedia(animeItem, Number(clean));
        if (mapped) return mapped;
      }
    } catch {}
  }
  return null;
}

async function translateSynopsisEdge(text: string): Promise<string> {
  if (!text || !text.trim()) return '';
  const cleaned = text
    .replace(/<[^>]*>/g, ' ')
    .replace(/\[Written by.*?\]/gi, '')
    .replace(/\(Source:.*?\)/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (/[\u0600-\u06FF]/.test(cleaned)) return cleaned;

  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ar&dt=t&q=${encodeURIComponent(cleaned.slice(0, 1400))}`;
    const res = await fetchEdgeTimeout(url, { headers: { 'User-Agent': EDGE_STREAM_UA } }, 3500);
    if (res.ok) {
      const json: any = await res.json();
      if (Array.isArray(json) && Array.isArray(json[0])) {
        const translated = json[0].map((p: any) => p?.[0] || '').join('').trim();
        if (translated && /[\u0600-\u06FF]/.test(translated)) return translated;
      }
    }
  } catch {}
  return cleaned;
}

function normalizeArabicStatus(raw?: string | null): 'مكتمل' | 'مستمر' | 'قادم' {
  const s = String(raw || '').toLowerCase();
  if (s.includes('finish') || s.includes('complete') || s.includes('مكتمل') || s.includes('منتهي')) {
    return 'مكتمل';
  }
  if (s.includes('not_yet') || s.includes('not yet') || s.includes('upcoming') || s.includes('قادم')) {
    return 'قادم';
  }
  return 'مستمر';
}

export async function handleEdgeAnimeDetails(rawId: string): Promise<Response> {
  const decodedId = decodeURIComponent(String(rawId || '')).trim();
  const cleanIdPart = decodedId.split('__ep__')[0].replace(/^\/+|\/+$/g, '');
  const isPureNum = /^\d+$/.test(cleanIdPart);
  const numId = isPureNum ? Number(cleanIdPart) : 0;

  let media: any = null;
  let okanimeData: ReturnType<typeof parseOkanimeAnimeHtml> | null = null;
  let animedarEps: { id: string; num: string; title: string; link: string; seasonNumber: number }[] = [];

  try {
    if (cleanIdPart === 'random') {
      const page = Math.floor(Math.random() * 15) + 1;
      const randData = await queryAniListEdge(
        `query ($p: Int) { Page(page: $p, perPage: 20) { media(type: ANIME, sort: POPULARITY_DESC, isAdult: false) { ${EDGE_MEDIA_DETAILS_FRAGMENT} } } }`,
        { p: page },
      ).catch(() => null);
      const list = randData?.Page?.media || [];
      if (list.length > 0) {
        media = list[Math.floor(Math.random() * list.length)];
      }
    } else if (isPureNum && numId > 0) {
      const d = await queryAniListEdge(
        `query ($idMal: Int) { Media(idMal: $idMal, type: ANIME) { ${EDGE_MEDIA_DETAILS_FRAGMENT} } }`,
        { idMal: numId },
      ).catch(() => null);
      media = d?.Media || null;
      if (!media) {
        const dByAni = await queryAniListEdge(
          `query ($id: Int) { Media(id: $id, type: ANIME) { ${EDGE_MEDIA_DETAILS_FRAGMENT} } }`,
          { id: numId },
        ).catch(() => null);
        media = dByAni?.Media || null;
      }
      if (!media) {
        media = await fetchFallbackAnimeMetadataEdge(cleanIdPart).catch(() => null);
      }
    } else {
      const cleanSearchTitle = cleanIdPart.replace(/^search-/i, '').replace(/-/g, ' ').trim();
      const [okHtmlRes, aniSearchRes] = await Promise.allSettled([
        cleanIdPart.startsWith('search-')
          ? Promise.reject(new Error('search prefix'))
          : fetchSiteHtml(`${OKANIME_ORIGIN}/anime/${cleanIdPart}`, 5000),
        queryAniListEdge(
          `query ($s: String) { Media(search: $s, type: ANIME, isAdult: false) { ${EDGE_MEDIA_DETAILS_FRAGMENT} } }`,
          { s: cleanSearchTitle },
        ),
      ]);
      if (okHtmlRes.status === 'fulfilled') {
        okanimeData = parseOkanimeAnimeHtml(okHtmlRes.value, cleanIdPart);
      }
      if (aniSearchRes.status === 'fulfilled') {
        media = aniSearchRes.value?.Media || null;
      }
      if (!media) {
        const fallbackTitle = okanimeData?.title || cleanSearchTitle;
        if (fallbackTitle) {
          const d2 = await queryAniListEdge(
            `query ($s: String) { Media(search: $s, type: ANIME, isAdult: false) { ${EDGE_MEDIA_DETAILS_FRAGMENT} } }`,
            { s: fallbackTitle },
          ).catch(() => null);
          media = d2?.Media || null;
          if (!media) {
            media = await fetchFallbackAnimeMetadataEdge(fallbackTitle).catch(() => null);
          }
        }
      }
    }

    // If we still don't have OkAnime scraped episodes, search OkAnime / AnimeDar in parallel
    if (!okanimeData || okanimeData.episodes.length === 0) {
      const searchTitle =
        okanimeData?.title ||
        media?.title?.english ||
        media?.title?.romaji ||
        (!isPureNum ? cleanIdPart.replace(/^search-/i, '').replace(/-/g, ' ') : '');

      if (searchTitle) {
        const directSlug = !isPureNum && !cleanIdPart.startsWith('search-') ? cleanIdPart : '';
        const [okSlugRes, darSlugRes] = await Promise.all([
          directSlug ? Promise.resolve(directSlug) : searchEdgeOkanimeSlug(searchTitle).catch(() => null),
          directSlug ? Promise.resolve(directSlug) : searchEdgeAnimedarSlug(searchTitle).catch(() => null),
        ]);

        const candidateOkSlug = okSlugRes || '';
        const candidateDarSlug = darSlugRes || candidateOkSlug || '';

        const [okPageRes, darPageRes] = await Promise.allSettled([
          candidateOkSlug ? fetchSiteHtml(`${OKANIME_ORIGIN}/anime/${candidateOkSlug}`, 4500) : Promise.reject(new Error('no slug')),
          candidateDarSlug ? fetchSiteHtml(`${ANIMEDAR_ORIGIN}/anime-p/${candidateDarSlug}/`, 4500) : Promise.reject(new Error('no slug')),
        ]);

        if (okPageRes.status === 'fulfilled') {
          const parsedOk = parseOkanimeAnimeHtml(okPageRes.value, candidateOkSlug);
          if (parsedOk.episodes.length > 0 || !okanimeData) {
            okanimeData = parsedOk;
          }
        }
        if ((!okanimeData || okanimeData.episodes.length === 0) && darPageRes.status === 'fulfilled') {
          const parsedDar = parseAnimedarServersAndEpisodes(darPageRes.value, candidateDarSlug);
          if (parsedDar.episodes.length > 0) {
            animedarEps = parsedDar.episodes;
          }
        }
      }
    }
  } catch {}

  if (!media && !okanimeData && animedarEps.length === 0) {
    return edgeJson({
      success: false,
      hybridFallback: true,
      message: 'تعذر جلب تفاصيل الأنمي حالياً.',
    }, 200, { 'X-Hybrid-Fallback': '1' });
  }

  const resolvedMalId = media?.idMal || media?.id || (numId > 0 ? numId : undefined);
  const title = media?.title?.english || media?.title?.romaji || okanimeData?.title || cleanIdPart;
  const englishTitle = media?.title?.english || media?.title?.romaji || okanimeData?.title || title;
  const posterUrl = media?.coverImage?.extraLarge || media?.coverImage?.large || okanimeData?.posterUrl || '';
  const bannerUrl = media?.bannerImage || posterUrl;
  const statusAr = media?.status
    ? normalizeArabicStatus(media.status)
    : normalizeArabicStatus(okanimeData?.status);

  const realScrapedEps =
    okanimeData && okanimeData.episodes.length > 0
      ? okanimeData.episodes
      : animedarEps.length > 0
      ? animedarEps
      : [];

  const preferredSlug =
    okanimeData?.slug ||
    (!isPureNum && !cleanIdPart.startsWith('search-') ? cleanIdPart : String(resolvedMalId || cleanIdPart));

  let finalEpisodes: any[] = [];
  if (statusAr === 'قادم') {
    finalEpisodes = [];
  } else if (realScrapedEps.length > 0) {
    finalEpisodes = realScrapedEps;
  } else if (statusAr === 'مستمر') {
    // STRICT: Never use planned season total (12/24/25) for ongoing anime!
    const nextEp = Number(media?.nextAiringEpisode?.episode || 0);
    const airedCount = nextEp > 1
      ? nextEp - 1
      : Math.max(1, Array.isArray(media?.streamingEpisodes) ? media.streamingEpisodes.length : 1);
    const capped = Math.min(airedCount, 1200);
    finalEpisodes = Array.from({ length: capped }, (_, idx) => ({
      id: `${preferredSlug}__ep__${idx + 1}`,
      num: String(idx + 1),
      title: `الحلقة ${idx + 1}`,
      seasonNumber: 1,
      link: `/anime/${preferredSlug}/episode/${idx + 1}`,
    }));
  } else {
    const finishedTotal = Math.min(Math.max(Number(media?.episodes || 0), 1), 1200);
    finalEpisodes = Array.from({ length: finishedTotal }, (_, idx) => ({
      id: `${preferredSlug}__ep__${idx + 1}`,
      num: String(idx + 1),
      title: `الحلقة ${idx + 1}`,
      seasonNumber: 1,
      link: `/anime/${preferredSlug}/episode/${idx + 1}`,
    }));
  }

  const rawDesc = media?.description || okanimeData?.description || 'قصة هذا الأنمي متوفرة ومحدثة.';
  const description = await translateSynopsisEdge(rawDesc);

  const relFormatMap: Record<string, string> = {
    PREQUEL: 'Prequel',
    SEQUEL: 'Sequel',
    PARENT: 'Parent story',
    SIDE_STORY: 'Side story',
    SPIN_OFF: 'Spin-off',
    ALTERNATIVE: 'Alternative version',
    SUMMARY: 'Summary',
    FULL_STORY: 'Full story',
    OTHER: 'Other',
  };
  const related = (media?.relations?.edges || [])
    .filter((e: any) => e?.node?.type === 'ANIME' && e.relationType !== 'CHARACTER' && e.relationType !== 'ADAPTATION')
    .map((e: any) => ({
      relation: relFormatMap[String(e.relationType || '').toUpperCase()] || 'Related',
      name: e.node.title?.english || e.node.title?.romaji || 'Anime',
      romajiTitle: e.node.title?.romaji || '',
      englishTitle: e.node.title?.english || '',
      mal_id: e.node.idMal || e.node.id,
      anilistId: e.node.id,
      type: e.node.format || 'TV',
      format: e.node.format || 'TV',
      episodes: e.node.episodes || null,
      year: e.node.seasonYear || '',
      posterUrl: e.node.coverImage?.extraLarge || e.node.coverImage?.large || posterUrl,
    }));

  const characters = (media?.characters?.edges || []).map((c: any) => ({
    id: c.node?.id,
    name: c.node?.name?.full || 'شخصية',
    role: c.role === 'MAIN' ? 'رئيسي (Main)' : 'مساند (Supporting)',
    imageUrl: c.node?.image?.large || posterUrl,
    voiceActor: c.voiceActors?.[0]
      ? { name: c.voiceActors[0].name?.full || '', imageUrl: c.voiceActors[0].image?.large || '' }
      : null,
  }));

  const jikanRecommendations = (media?.recommendations?.nodes || [])
    .map((n: any) => n?.mediaRecommendation)
    .filter(Boolean)
    .map((rec: any) => ({
      id: rec.idMal || rec.id,
      title: rec.title?.english || rec.title?.romaji || 'Anime',
      posterUrl: rec.coverImage?.extraLarge || rec.coverImage?.large || posterUrl,
    }));

  const pictures = Array.from(
    new Set(
      [
        posterUrl,
        media?.bannerImage,
        ...(media?.streamingEpisodes || []).slice(0, 24).map((ep: any) => ep?.thumbnail),
      ].filter(Boolean),
    ),
  );

  const genresRaw: string[] = Array.isArray(media?.genres) && media.genres.length > 0
    ? media.genres
    : ['Action', 'Fantasy'];
  const genres = genresRaw.map((g) => translateGenreToArabic(g));

  const payload = {
    _id: String(resolvedMalId || preferredSlug),
    malId: resolvedMalId ? String(resolvedMalId) : undefined,
    anilistId: media?.id,
    okanimeSlug: okanimeData?.slug || (!isPureNum ? preferredSlug : undefined),
    title,
    englishTitle,
    romajiTitle: media?.title?.romaji || undefined,
    posterUrl,
    bannerUrl,
    description,
    episodes: finalEpisodes,
    seasonsList: finalEpisodes.length > 0
      ? [
          {
            seasonNumber: 1,
            title: 'الموسم 1',
            malId: resolvedMalId,
            posterUrl,
            episodesCount: finalEpisodes.length,
            episodes: finalEpisodes,
          },
        ]
      : [],
    activeSeason: 1,
    genres,
    rating: media?.averageScore ? Number((media.averageScore / 10).toFixed(1)) : 8.4,
    status: statusAr,
    type: media?.format || 'TV',
    episodesCount: statusAr === 'قادم' ? 0 : finalEpisodes.length,
    releaseYear: String(media?.seasonYear || 2025),
    season: `${media?.season || 'WINTER'} ${media?.seasonYear || 2025}`,
    studio: media?.studios?.nodes?.[0]?.name || 'Studio',
    duration: media?.duration ? `${media.duration} دقيقة` : '24 دقيقة',
    characters,
    related,
    relatedGraphVersion: 2,
    catalogSchemaVersion: 3,
    jikanRecommendations,
    pictures,
  };

  return edgeJson({
    success: true,
    resolvedId: payload._id,
    data: payload,
  });
}

// ============================================================================
// Episode Servers Extraction on Edge
// ============================================================================
function parseOkanimeEpisodeServersHtml(html: string): {
  watch: EdgeEpisodeServer[];
  download: EdgeEpisodeServer[];
} {
  const watch: EdgeEpisodeServer[] = [];
  const download: EdgeEpisodeServer[] = [];
  if (!html) return { watch, download };

  // Parse all [data-server] buttons / tags regardless of attribute order
  const serverTagRe = /<(?:button|a|li|div|span)\b([^>]*data-server=[^>]*)>([\s\S]*?)<\/(?:button|a|li|div|span)>/gi;
  let m: RegExpExecArray | null;
  while ((m = serverTagRe.exec(html)) !== null) {
    const attrs = m[1] || '';
    const inner = stripTags(m[2] || '');
    const rawServer = attrs.match(/data-server=["']([^"']+)["']/i)?.[1]?.trim() || '';
    const setSrvMatch = attrs.match(/setServer\(\s*['"]([^'"]+)['"]\s*\)/i);
    if (!setSrvMatch || !setSrvMatch[1]) continue;

    const embedUrl = decodeHtmlEntities(setSrvMatch[1]).trim();
    if (!embedUrl.startsWith('http')) continue;

    const serverName = normalizeOkanimeHostName(rawServer, embedUrl);
    const quality: EdgeEpisodeServer['quality'] = isMultiQualityWatchHost(serverName, embedUrl)
      ? 'multi'
      : mapOkanimeQuality(inner);

    const megaMatch = embedUrl.match(/https?:\/\/[^/]*(?:megamax|share4max)[^/]*\/(?:iframe|e)\/([A-Za-z0-9_-]+)/i);
    if (megaMatch) {
      const canonicalMega = embedUrl.replace(/\/e\/([A-Za-z0-9_-]+)/i, '/iframe/$1');
      const existingIdx = watch.findIndex((s) => s.url.includes(megaMatch[1]));
      if (existingIdx !== -1) {
        if (embedUrl.includes('/iframe/')) watch[existingIdx].url = canonicalMega;
        continue;
      }
      watch.push({ serverName, url: canonicalMega, type: 'iframe', quality: 'multi', category: 'watch' });
      continue;
    }

    if (!watch.some((s) => s.url === embedUrl)) {
      watch.push({ serverName, url: embedUrl, type: 'iframe', quality, category: 'watch' });
    }
  }

  // Sweep any remaining setServer('https://...') calls unconditionally
  const fallbackSetRe = /setServer\(\s*['"](https?:[^'"]+)['"]\s*\)/gi;
  let fm: RegExpExecArray | null;
  while ((fm = fallbackSetRe.exec(html)) !== null) {
    const embedUrl = decodeHtmlEntities(fm[1]).trim();
    if (!embedUrl.startsWith('http') || watch.some((s) => s.url === embedUrl)) continue;
    const serverName = normalizeOkanimeHostName('', embedUrl);
    watch.push({
      serverName,
      url: embedUrl,
      type: 'iframe',
      quality: isMultiQualityWatchHost(serverName, embedUrl) ? 'multi' : '720p',
      category: 'watch',
    });
  }

  // Parse download links (a.ep-link / a[data-umami-event-host])
  const dlRe = /<a\b([^>]*href=["'](https?:\/\/[^"']+)["'][^>]*)>([\s\S]*?)<\/a>/gi;
  let dm: RegExpExecArray | null;
  while ((dm = dlRe.exec(html)) !== null) {
    const attrs = dm[1] || '';
    const href = decodeHtmlEntities(dm[2] || '').trim();
    if (!href || href.includes('okanime.xyz')) continue;
    if (!/ep-link|data-umami-event-host/i.test(attrs)) continue;
    const hostAttr = attrs.match(/data-umami-event-host=["']([^"']+)["']/i)?.[1] || '';
    const inner = stripTags(dm[3] || '');
    const serverName = normalizeOkanimeHostName(hostAttr, href);
    const quality = mapOkanimeQuality(inner);
    if (!download.some((s) => s.url === href)) {
      download.push({ serverName, url: href, type: 'direct', quality, category: 'download' });
    }
  }

  return { watch, download };
}

export async function handleEdgeAnimeServers(body: any): Promise<Response> {
  const rawInput = String(body?.url || '').trim();
  let animeId = body?.animeId ? String(body.animeId).trim() : '';
  const animeTitle = String(body?.animeTitle || '').trim();
  const englishTitle = String(body?.englishTitle || '').trim();
  const romajiTitle = String(body?.romajiTitle || '').trim();
  const okanimeSlugInput = String(body?.okanimeSlug || '').trim();
  const seasonNumber = Math.max(1, Number(body?.seasonNumber || 1) || 1);
  let epNum = body?.episodeNum ? String(body.episodeNum).trim() : '1';
  let directEpPath = '';

  if (rawInput.includes('/episode/')) {
    try {
      const u = rawInput.startsWith('http') ? new URL(rawInput) : new URL(rawInput, OKANIME_ORIGIN);
      directEpPath = u.pathname;
      const epMatch = directEpPath.match(/-episode-(\d+)/i);
      if (epMatch && !body?.episodeNum) epNum = epMatch[1];
    } catch {}
  }

  if (rawInput.includes('__ep__')) {
    const [slugPart, numPart] = rawInput.split('__ep__');
    if (numPart) epNum = numPart;
    if (slugPart && (!animeId || /^\d+$/.test(animeId))) animeId = slugPart;
  } else if (rawInput.includes('-episode-') && !rawInput.startsWith('http')) {
    const m = rawInput.match(/^(.+?)-episode-(\d+)$/);
    if (m) {
      if (!animeId || /^\d+$/.test(animeId)) animeId = m[1];
      if (!body?.episodeNum) epNum = m[2];
    }
  }

  let resolvedPrimarySlug = '';
  if (okanimeSlugInput && !/^\d+$/.test(okanimeSlugInput) && !okanimeSlugInput.startsWith('search-')) {
    resolvedPrimarySlug = okanimeSlugInput;
  } else if (rawInput.includes('__ep__')) {
    resolvedPrimarySlug = rawInput.split('__ep__')[0];
  } else if (rawInput.startsWith('http') || rawInput.includes('/episode/')) {
    resolvedPrimarySlug = extractSlugFromPath(rawInput);
  } else if (animeId && !/^\d+$/.test(animeId) && !animeId.startsWith('search-')) {
    resolvedPrimarySlug = animeId;
  }

  const candidateTitles: string[] = [];
  const pushCandidateTitle = (raw: unknown) => {
    const cleanT = typeof raw === 'string' ? raw.trim() : '';
    if (!cleanT) return;
    if (!candidateTitles.includes(cleanT)) candidateTitles.push(cleanT);
    const colonParts = cleanT.split(/[:\-–]/).map((s) => s.trim()).filter((s) => s.length >= 3);
    for (const part of colonParts) {
      if (!candidateTitles.includes(part)) candidateTitles.push(part);
    }
  };

  for (const t of [romajiTitle, englishTitle, animeTitle, resolvedPrimarySlug.replace(/-/g, ' ')]) {
    pushCandidateTitle(t);
  }

  const paddedEp = epNum.padStart(2, '0');
  const tryFetchOkanimeEpFromSlug = async (slugVal: string): Promise<string> => {
    if (!slugVal) return '';
    const epCandidates = [
      `/episode/${slugVal}-episode-${epNum}`,
      ...(paddedEp !== epNum ? [`/episode/${slugVal}-episode-${paddedEp}`] : []),
    ];
    for (const epPath of epCandidates) {
      try {
        const html = await fetchSiteHtml(`${OKANIME_ORIGIN}${epPath}`, 4000);
        if (html.includes('setServer(') || html.includes('data-server') || html.includes('ep-link')) {
          return html;
        }
      } catch {}
    }
    try {
      const animeHtml = await fetchSiteHtml(`${OKANIME_ORIGIN}/anime/${slugVal}`, 4000);
      const epMatch = animeHtml.match(
        new RegExp(`href=["']([^"']*\\/episode\\/[^"']*-episode-0*${epNum}(?:$|\\?|#|\\/))["']`, 'i'),
      );
      if (epMatch?.[1]) {
        const full = epMatch[1].startsWith('http') ? epMatch[1] : `${OKANIME_ORIGIN}${epMatch[1]}`;
        const html = await fetchSiteHtml(full, 4000);
        if (html.includes('setServer(') || html.includes('data-server') || html.includes('ep-link')) {
          return html;
        }
      }
    } catch {}
    return '';
  };

  const epPaths: string[] = [];
  if (directEpPath && directEpPath.includes('/episode/') && !/^\d+$/.test(extractSlugFromPath(directEpPath))) {
    epPaths.push(directEpPath);
  }
  const slugsToTry: string[] = [];
  if (resolvedPrimarySlug) slugsToTry.push(resolvedPrimarySlug);
  for (const t of candidateTitles) {
    const norm = t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    if (norm && !slugsToTry.includes(norm)) slugsToTry.push(norm);
  }
  for (const s of slugsToTry.slice(0, 4)) {
    const p = `/episode/${s}-episode-${epNum}`;
    if (!epPaths.includes(p)) epPaths.push(p);
  }

  let epHtml = '';
  if (epPaths.length > 0) {
    const probed = await Promise.allSettled(
      epPaths.map(async (epPath) => {
        const html = await fetchSiteHtml(`${OKANIME_ORIGIN}${epPath}`, 3500);
        if (html.includes('setServer(') || html.includes('data-server') || html.includes('ep-link')) {
          return html;
        }
        throw new Error('no servers');
      }),
    );
    const hit = probed.find((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled' && Boolean(r.value));
    if (hit) epHtml = hit.value;
  }

  // If direct slug failed, resolve full AniList (with Jikan/Kitsu fallback) to obtain Romaji/English/synonyms!
  if (!epHtml && (/^\d+$/.test(animeId) || candidateTitles.length > 0)) {
    try {
      const aniData = /^\d+$/.test(animeId)
        ? await queryAniListEdge(
            `query ($idMal: Int) { Media(idMal: $idMal, type: ANIME) { title { romaji english } synonyms } }`,
            { idMal: Number(animeId) },
          ).catch(() => null)
        : await queryAniListEdge(
            `query ($s: String) { Media(search: $s, type: ANIME, isAdult: false) { title { romaji english } synonyms } }`,
            { s: candidateTitles[0] },
          ).catch(() => null);

      let resolvedMedia = aniData?.Media || null;
      if (!resolvedMedia) {
        resolvedMedia = await fetchFallbackAnimeMetadataEdge(
          /^\d+$/.test(animeId) ? animeId : candidateTitles[0] || '',
        ).catch(() => null);
      }

      const mTitle = resolvedMedia?.title;
      const syns: string[] = Array.isArray(resolvedMedia?.synonyms) ? resolvedMedia.synonyms.slice(0, 3) : [];
      for (const extraTitle of [mTitle?.romaji, mTitle?.english, ...syns]) {
        pushCandidateTitle(extraTitle);
      }

      const extraSlugs: string[] = [];
      for (const extraTitle of [mTitle?.romaji, mTitle?.english, ...syns]) {
        if (!extraTitle) continue;
        const norm = String(extraTitle).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        if (norm && !slugsToTry.includes(norm) && !extraSlugs.includes(norm)) {
          slugsToTry.push(norm);
          extraSlugs.push(norm);
        }
      }

      if (extraSlugs.length > 0) {
        const extraResults = await Promise.allSettled(
          extraSlugs.slice(0, 4).map(async (slugVal) => {
            const html = await tryFetchOkanimeEpFromSlug(slugVal);
            if (!html) throw new Error('no ep html');
            return { slugVal, html };
          }),
        );
        const foundExtra = extraResults.find(
          (r): r is PromiseFulfilledResult<{ slugVal: string; html: string }> => r.status === 'fulfilled',
        );
        if (foundExtra) {
          epHtml = foundExtra.value.html;
          if (!resolvedPrimarySlug) resolvedPrimarySlug = foundExtra.value.slugVal;
        }
      }
    } catch {}
  }

  if (!epHtml && candidateTitles.length > 0) {
    for (const cand of candidateTitles.slice(0, 3)) {
      const foundSlug = await searchEdgeOkanimeSlug(cand).catch(() => null);
      if (!foundSlug) continue;
      if (!resolvedPrimarySlug) resolvedPrimarySlug = foundSlug;
      epHtml = await tryFetchOkanimeEpFromSlug(foundSlug);
      if (epHtml) break;
    }
  }

  const parsedOk = parseOkanimeEpisodeServersHtml(epHtml);
  const watchServers = [...parsedOk.watch];
  const downloadServers = [...parsedOk.download];

  // Helper #2: AnimeDar when OkAnime returned nothing (fast parallel lookup)
  if (watchServers.length === 0 && downloadServers.length === 0) {
    let darTried = false;
    const pullDarFromSlug = async (slugToTry: string) => {
      if (!slugToTry) return false;
      try {
        const darHtml = await fetchSiteHtml(`${ANIMEDAR_ORIGIN}/anime-p/${slugToTry}/`, 3200);
        const parsedDar = parseAnimedarServersAndEpisodes(darHtml, slugToTry);
        const list = parsedDar.episodeServersByNum.get(String(epNum)) || [];
        for (const srv of list) {
          if (srv.category === 'watch' && !watchServers.some((s) => s.url === srv.url)) watchServers.push(srv);
          if (srv.category === 'download' && !downloadServers.some((s) => s.url === srv.url && s.quality === srv.quality)) {
            downloadServers.push(srv);
          }
        }
        return watchServers.length > 0 || downloadServers.length > 0;
      } catch {
        return false;
      }
    };

    if (resolvedPrimarySlug) {
      darTried = await pullDarFromSlug(resolvedPrimarySlug);
    }
    if (!darTried && candidateTitles.length > 0) {
      for (const cand of candidateTitles.slice(0, 2)) {
        const searchedDarSlug = await searchEdgeAnimedarSlug(cand).catch(() => null);
        if (searchedDarSlug && searchedDarSlug !== resolvedPrimarySlug) {
          if (await pullDarFromSlug(searchedDarSlug)) break;
        }
      }
    }
  }

  // Helper #3: Animerco (animerco.org / jet.animerco.org) when OkAnime & AnimeDar returned empty
  if (watchServers.length === 0 && downloadServers.length === 0 && candidateTitles.length > 0) {
    const animercoServers = await searchEdgeAnimercoAndExtract(candidateTitles, epNum, seasonNumber).catch(() => []);
    for (const srv of animercoServers) {
      if (!watchServers.some((s) => s.url === srv.url)) {
        watchServers.push(srv);
      }
    }
  }

  // Derive downloadable URLs from watch embed URLs
  for (const w of watchServers) {
    const lower = w.url.toLowerCase();
    let dlUrl = '';
    if (lower.includes('mega.nz/embed/')) dlUrl = w.url.replace('/embed/', '/file/');
    else if (lower.includes('4shared.com/web/embed/file/')) dlUrl = w.url.replace('/web/embed/file/', '/get/');
    else if (lower.includes('mp4upload.com/embed-')) dlUrl = w.url.replace('/embed-', '/').replace(/\.html$/i, '');
    else if (lower.includes('asnwish.com/e/')) dlUrl = w.url.replace('/e/', '/f/');
    else if (lower.includes('ok.ru/videoembed/')) dlUrl = w.url.replace('/videoembed/', '/video/');
    else if (lower.includes('drive.google.com/file/d/')) {
      const dm = w.url.match(/\/d\/([A-Za-z0-9_-]+)/);
      if (dm) dlUrl = `https://drive.google.com/u/0/uc?id=${dm[1]}&export=download`;
    } else if (lower.includes('videa.hu/player')) dlUrl = w.url;
    else if (lower.includes('vidmoly') && lower.includes('/embed-')) dlUrl = w.url.replace('/embed-', '/');
    else if (lower.includes('uqload') && lower.includes('/embed-')) dlUrl = w.url.replace('/embed-', '/');
    else if (lower.includes('yourupload.com/embed/')) dlUrl = w.url.replace('/embed/', '/watch/');

    if (dlUrl && !downloadServers.some((d) => d.url === dlUrl)) {
      downloadServers.push({
        serverName: w.serverName,
        url: dlUrl,
        type: 'direct',
        quality: w.quality,
        category: 'download',
      });
    }
  }

  watchServers.sort((a, b) => getServerReliabilityScore(b) - getServerReliabilityScore(a));
  const cleanDownloads = downloadServers
    .filter((d) => !isAdShortenerUrl(d.url))
    .sort((a, b) => getServerReliabilityScore(b) - getServerReliabilityScore(a));

  const isDirectMp4Host = (u: string) => {
    const l = u.toLowerCase();
    return (
      l.includes('sendvid') ||
      l.includes('videa') ||
      l.includes('mp4upload') ||
      l.includes('mega.nz') ||
      l.includes('ok.ru') ||
      l.includes('yourupload') ||
      l.includes('uqload') ||
      l.includes('4shared') ||
      l.includes('drive.google') ||
      l.includes('streamtape') ||
      l.includes('dood') ||
      l.includes('d000d') ||
      l.includes('vidoza') ||
      l.includes('sibnet') ||
      l.includes('mixdrop')
    );
  };
  const bestDirectWatch =
    watchServers.find((s) => isDirectMp4Host(s.url))?.url ||
    cleanDownloads.find((s) => isDirectMp4Host(s.url))?.url ||
    watchServers[0]?.url ||
    '';
  const safeTitle = (animeTitle || candidateTitles[0] || 'Anime').replace(/["'<>]/g, '').trim();
  const extraDownloads: EdgeEpisodeServer[] = bestDirectWatch
    ? [
        {
          serverName: 'تحميل مباشر',
          url: `/api/anime/download?url=${encodeURIComponent(bestDirectWatch)}&title=${encodeURIComponent(safeTitle)}&ep=${epNum}`,
          type: 'direct',
          quality: '1080p',
          category: 'download',
        },
      ]
    : [];

  const finalServers: EdgeEpisodeServer[] = [...watchServers, ...extraDownloads, ...cleanDownloads];
  if (finalServers.length === 0) {
    return edgeJson(
      {
        success: false,
        hybridFallback: true,
        message: 'لا تتوفر خيارات مشاهدة لهذه الحلقة حالياً.',
        data: [],
      },
      200,
      { 'X-Hybrid-Fallback': '1' },
    );
  }
  return edgeJson({
    success: true,
    message: 'تم جلب سيرفرات المشاهدة بنجاح.',
    data: finalServers,
  });
}

// ============================================================================
// Pure Web Stream Extractors + Direct Binary Probe
// ============================================================================
function unpackDeanEdwards(packed: string): string {
  try {
    const startIdx = packed.search(/\}\s*\(\s*['"]/);
    if (startIdx === -1) return '';
    let i = packed.indexOf('(', startIdx) + 1;
    while (i < packed.length && /\s/.test(packed[i])) i++;
    const pQuote = packed[i];
    if (pQuote !== "'" && pQuote !== '"') return '';
    i++;
    let pRaw = '';
    while (i < packed.length) {
      const ch = packed[i];
      if (ch === '\\' && i + 1 < packed.length) {
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
    const argsMatch = rest.match(/^\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(['"])([\s\S]*?)\3\.split\s*\(\s*['"]\|['"]\s*\)/);
    if (!argsMatch) return '';
    const a = parseInt(argsMatch[1], 10);
    const c = parseInt(argsMatch[2], 10);
    const unesc = (str: string) =>
      str.replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t').replace(/\\\\/g, '\\');
    const p = unesc(pRaw);
    const k = unesc(argsMatch[4]).split('|');
    const encodeBase = (val: number, radix: number): string => {
      if (radix <= 36) return val.toString(radix);
      const prefix = val < radix ? '' : encodeBase(Math.floor(val / radix), radix);
      const rem = val % radix;
      return prefix + (rem > 35 ? String.fromCharCode(rem + 29) : rem.toString(36));
    };
    const dict: Record<string, string> = {};
    let count = c;
    while (count--) {
      const key = encodeBase(count, a);
      dict[key] = k[count] || key;
    }
    return p.replace(/\b(\w+)\b/g, (word) => (Object.prototype.hasOwnProperty.call(dict, word) ? dict[word] : word));
  } catch {
    return '';
  }
}

function videaRc4Bytes(data: Uint8Array, key: Uint8Array): Uint8Array {
  const S = Array.from({ length: 256 }, (_, idx) => idx);
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + S[i] + key[i % key.length]) & 255;
    const tmp = S[i];
    S[i] = S[j];
    S[j] = tmp;
  }
  const out = new Uint8Array(data.length);
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

async function extractVideaDirectEdge(
  videaUrl: string,
): Promise<{ file: string; label: string; type: string; mimeType: string }[]> {
  try {
    const vMatch =
      videaUrl.match(/[?&]v=([A-Za-z0-9_-]+)/) ||
      videaUrl.match(/videa\.hu\/(?:player|videok\/[^/]+)\/([A-Za-z0-9_-]+)/i);
    if (!vMatch) return [];
    const vcode = vMatch[1];

    const playerResp = await fetchEdgeTimeout(
      `https://videa.hu/player?v=${encodeURIComponent(vcode)}`,
      { headers: { 'User-Agent': EDGE_STREAM_UA } },
      5000,
    );
    if (!playerResp.ok) return [];
    const html = await playerResp.text();
    const xt = html.match(/var\s+_xt\s*=\s*["']([^"']+)["']/)?.[1];
    if (!xt || xt.length < 64) return [];

    let staticSecret = 'xHb0ZvME5q8CBcoQi6AngerDu3FGO9fkUlwPmLVY_RTzj2hJIS4NasXWKy1td7p';
    try {
      const jsPath = html.match(/src=["'](\/static\/uis\/player\/js\/VideaPlayerClasses\.min\.js[^"']*)["']/)?.[1];
      if (jsPath) {
        const jr = await fetchEdgeTimeout(`https://videa.hu${jsPath}`, { headers: { 'User-Agent': EDGE_STREAM_UA } }, 3500);
        if (jr.ok) {
          const jt = await jr.text();
          const sec = jt.match(/processEmbedParams\([^,]+,[^,]+,[^,]+,\s*["']([A-Za-z0-9_-]{64})["']\)/)?.[1];
          if (sec) staticSecret = sec;
        }
      }
    } catch {}

    const rndBytes = crypto.getRandomValues(new Uint8Array(6));
    const seed = toBase64Url(rndBytes).slice(0, 8);
    let rKeys = ['e', 'a', 'g', 'j', 'd', 'c', 'h', 'i', 'b', 'f'];
    const c: Record<string, string> = {};
    for (let i = 0; i < xt.length; i++) {
      const k = rKeys[Math.floor(i / 8) + 1];
      if (i % 8 === 0) c[k] = '';
      c[k] += xt[i];
    }
    c.e = seed;

    const d = (c.a || '') + (c.g || '') + (c.j || '') + (c.d || '');
    const u = (c.c || '') + (c.h || '') + (c.i || '') + (c.b || '');
    let mixed = '';
    for (let i = 0; i < d.length; i++) {
      const idx = i - (staticSecret.indexOf(d.charAt(i)) - 31);
      mixed += u.charAt(idx);
    }
    rKeys = ['f', 'h', 'c', 'b', 'i'];
    for (let i = 0; i < mixed.length; i++) {
      const k = rKeys[Math.floor(i / 8) + 1];
      if (i % 8 === 0) c[k] = '';
      c[k] += mixed.charAt(i);
    }

    const xmlUrl = `https://videa.hu/player/xml?v=${encodeURIComponent(vcode)}&_s=${encodeURIComponent(c.e)}&_t=${encodeURIComponent((c.h || '') + (c.c || ''))}`;
    const xmlResp = await fetchEdgeTimeout(
      xmlUrl,
      { headers: { 'User-Agent': EDGE_STREAM_UA, Referer: `https://videa.hu/player?v=${vcode}` } },
      5000,
    );
    if (!xmlResp.ok) return [];
    const xs = xmlResp.headers.get('x-videa-xs') || '';
    const rawBody = await xmlResp.text();
    let plainXml = rawBody;
    if (!rawBody.trim().startsWith('<') && xs) {
      c.f = xs;
      const binStr = atob(rawBody);
      const rawBytes = new Uint8Array(binStr.length);
      for (let i = 0; i < binStr.length; i++) rawBytes[i] = binStr.charCodeAt(i);
      const keyBytes = new TextEncoder().encode((c.b || '') + (c.i || '') + (c.e || '') + c.f);
      plainXml = new TextDecoder().decode(videaRc4Bytes(rawBytes, keyBytes));
    }

    const results: { file: string; label: string; type: string; mimeType: string; score: number }[] = [];
    const srcRe = /<video_source([^>]*)>([^<]+)<\/video_source>/gi;
    let m: RegExpExecArray | null;
    while ((m = srcRe.exec(plainXml)) !== null) {
      const attrs = m[1];
      let srcPath = m[2].trim().replace(/&amp;/g, '&');
      const name = attrs.match(/name=["']([^"']+)["']/i)?.[1] || '360p';
      const exp = attrs.match(/exp=["']([^"']+)["']/i)?.[1] || '';
      const mimeType = attrs.match(/mimetype=["']([^"']+)["']/i)?.[1] || 'video/mp4';
      const md5 = plainXml.match(new RegExp(`<hash_value_${name}>([^<]+)</hash_value_${name}>`, 'i'))?.[1]?.trim() || '';
      if (srcPath.startsWith('//')) srcPath = `https:${srcPath}`;
      else if (srcPath.startsWith('/')) srcPath = `https://videa.hu${srcPath}`;
      const sep = srcPath.includes('?') ? '&' : '?';
      const finalUrl = md5 && exp ? `${srcPath}${sep}md5=${encodeURIComponent(md5)}&expires=${encodeURIComponent(exp)}` : srcPath;
      const numRes = parseInt(name.replace(/\D+/g, '') || '360', 10);
      results.push({
        file: finalUrl,
        label: name,
        type: 'mp4',
        mimeType,
        score: (mimeType.includes('mp4') ? 1000 : 0) + numRes,
      });
    }
    results.sort((a, b) => b.score - a.score);
    return results.map(({ file, label, type, mimeType }) => ({ file, label, type, mimeType }));
  } catch {
    return [];
  }
}

function extractStreamtapeLinkEdge(html: string): string | null {
  try {
    const match =
      html.match(/id=['"]robotlink['"]\s*>([\s\S]*?)<\/div>/i) ||
      html.match(/(?:document\.getElementById|_\$)\(['"]robotlink['"]\)\.innerHTML\s*=\s*(['"][\s\S]+?);/i);
    if (!match) return null;
    const terms = match[1].split('+');
    let url = '';
    for (const rawTerm of terms) {
      const term = rawTerm.trim();
      const s1 = term.match(/^['"]([^'"]*)['"]$/);
      if (s1) { url += s1[1]; continue; }
      const s2 = term.match(/^\s*\(\s*['"]([^'"]*)['"]\s*\)\s*\.\s*substring\s*\(\s*(\d+)\s*\)\s*$/) ||
        term.match(/^\s*['"]([^'"]*)['"]\s*\.\s*substring\s*\(\s*(\d+)\s*\)\s*$/);
      if (s2) { url += s2[1].substring(parseInt(s2[2], 10)); continue; }
      const s3 = term.match(/['"]([^'"]*)['"]/);
      if (s3) url += s3[1];
    }
    if (url.startsWith('//')) url = `https:${url}`;
    return url || null;
  } catch {
    return null;
  }
}

export async function extractEdgeDirectStream(
  targetUrl: string,
  depth = 0,
): Promise<{
  directUrl: string;
  type: 'direct' | 'hls' | 'iframe';
  sources?: { file: string; label: string; type: string }[];
}> {
  try {
    const safeInitial = parseSafeHttpUrl(targetUrl);
    if (!safeInitial) {
      return { directUrl: targetUrl, type: 'iframe', sources: [] };
    }

    const buildProxyUrl = (mediaUrl: string, refererUrl: string) =>
      `/api/anime/stream-proxy?url=${encodeURIComponent(mediaUrl)}&referer=${encodeURIComponent(refererUrl)}`;

    if (
      depth === 0 &&
      (targetUrl.toLowerCase().includes('megamax.') || targetUrl.toLowerCase().includes('share4max.'))
    ) {
      try {
        const u = safeInitial;
        const idMatch = u.pathname.match(/\/(?:iframe|e|d)\/([A-Za-z0-9_-]+)/i);
        if (idMatch) {
          const origin = `${u.protocol}//${u.host}`;
          const iframeUrl = `${origin}/iframe/${idMatch[1]}`;
          const pageResp = await fetchEdgeTimeout(
            iframeUrl,
            { headers: { 'User-Agent': EDGE_STREAM_UA, Referer: `${origin}/` } },
            4500,
          );
          if (pageResp.ok) {
            const pageHtml = await pageResp.text();
            const inertiaVersion = pageHtml.match(/"version"\s*:\s*"([a-f0-9]+)"/i)?.[1] || '';
            const partialResp = await fetchEdgeTimeout(
              iframeUrl,
              {
                headers: {
                  'User-Agent': EDGE_STREAM_UA,
                  'X-Inertia': 'true',
                  ...(inertiaVersion ? { 'X-Inertia-Version': inertiaVersion } : {}),
                  'X-Inertia-Partial-Component': 'files/mirror/video',
                  'X-Inertia-Partial-Data': 'streams',
                  'X-Requested-With': 'XMLHttpRequest',
                  Referer: iframeUrl,
                },
              },
              5000,
            );
            if (partialResp.ok) {
              const json: any = await partialResp.json();
              const streamGroups: any[] = Array.isArray(json?.props?.streams?.data) ? json.props.streams.data : [];
              const preferredDrivers = ['videa', 'sendvid', 'mp4upload', 'mixdrop', 'lulustream', 'earnvids', 'streamwish', 'uqload', 'filemoon', 'dood'];
              const extractedSources: { file: string; label: string; type: string; rank: number }[] = [];

              await Promise.all(
                streamGroups.slice(0, 4).map(async (grp) => {
                  const rawLabel = String(grp?.label || 'HD');
                  const cleanLabel = rawLabel.match(/(1080p|720p|480p|360p)/i)?.[1]?.toLowerCase() || 'HD';
                  const resNum = parseInt(cleanLabel.replace(/\D+/g, '') || '720', 10);
                  const mirrors: any[] = Array.isArray(grp?.mirrors) ? grp.mirrors : [];
                  mirrors.sort((a, b) => {
                    const da = String(a?.driver || '').toLowerCase();
                    const db = String(b?.driver || '').toLowerCase();
                    const ia = preferredDrivers.findIndex((p) => da.includes(p));
                    const ib = preferredDrivers.findIndex((p) => db.includes(p));
                    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
                  });
                  for (const mr of mirrors.slice(0, 3)) {
                    let link = String(mr?.link || '').trim();
                    if (!link) continue;
                    if (link.startsWith('//')) link = `https:${link}`;
                    if (!parseSafeHttpUrl(link)) continue;
                    const sub = await extractEdgeDirectStream(link, 1).catch(() => null);
                    if (sub && (sub.type === 'direct' || sub.type === 'hls') && sub.directUrl) {
                      extractedSources.push({
                        file: sub.directUrl,
                        label: cleanLabel,
                        type: sub.type === 'hls' ? 'hls' : 'mp4',
                        rank: resNum + (sub.type === 'direct' ? 15 : 0),
                      });
                      break;
                    }
                  }
                }),
              );

              if (extractedSources.length > 0) {
                extractedSources.sort((a, b) => b.rank - a.rank);
                const clean = extractedSources.map(({ file, label, type }) => ({ file, label, type }));
                return {
                  directUrl: clean[0].file,
                  type: clean[0].type === 'hls' ? 'hls' : 'direct',
                  sources: clean,
                };
              }
            }
          }
          return {
            directUrl: `${iframeUrl}?nt=1`,
            type: 'iframe',
            sources: [{ file: `${iframeUrl}?nt=1`, label: 'multi', type: 'iframe' }],
          };
        }
      } catch {}
    }

    if (targetUrl.includes('drive.google.com') || targetUrl.includes('gdrive')) {
      const driveId = targetUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/)?.[1] || targetUrl.match(/id=([a-zA-Z0-9_-]+)/)?.[1];
      if (driveId) {
        const preview = `https://drive.google.com/file/d/${driveId}/preview`;
        const direct = `https://drive.usercontent.google.com/download?id=${driveId}&export=download&confirm=t`;
        return {
          directUrl: preview,
          type: 'iframe',
          sources: [
            { file: preview, label: 'FHD', type: 'iframe' },
            { file: direct, label: 'HD', type: 'mp4' },
          ],
        };
      }
    }

    if (VIDEO_EXT_RE.test(safeInitial.pathname) || VIDEO_EXT_RE.test(safeInitial.search) || /\.m3u8(?:$|[?#])/i.test(targetUrl)) {
      const isHls = /\.m3u8(?:$|[?#])/i.test(targetUrl);
      return {
        directUrl: targetUrl,
        type: isHls ? 'hls' : 'direct',
        sources: [{ file: targetUrl, label: 'HD', type: isHls ? 'hls' : 'mp4' }],
      };
    }

    const reqHeaders: Record<string, string> = {
      'User-Agent': EDGE_STREAM_UA,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8',
      Referer: `${safeInitial.protocol}//${safeInitial.hostname}/`,
    };
    const hostLower = safeInitial.hostname.toLowerCase();
    if (/lulustream|morencius|earnvids|vidhide|filelions/.test(hostLower)) {
      reqHeaders.Referer = 'https://megamax.me/';
    }

    const resp = await fetchEdgeTimeout(targetUrl, { headers: reqHeaders }, 5000);
    if (!resp.ok) {
      return { directUrl: targetUrl, type: 'iframe', sources: [{ file: targetUrl, label: 'FHD', type: 'iframe' }] };
    }
    const ct = (resp.headers.get('content-type') || '').toLowerCase();
    const cl = parseInt(resp.headers.get('content-length') || '0', 10);
    if (
      ct.startsWith('video/') ||
      ct.startsWith('audio/') ||
      ct.includes('mpegurl') ||
      (ct.includes('octet-stream') && cl > 5 * 1024 * 1024)
    ) {
      const isHls = ct.includes('mpegurl') || targetUrl.toLowerCase().includes('.m3u8');
      return {
        directUrl: targetUrl,
        type: isHls ? 'hls' : 'direct',
        sources: [{ file: targetUrl, label: 'HD', type: isHls ? 'hls' : 'mp4' }],
      };
    }

    let currentHtml = await resp.text();
    let currentUrl = targetUrl;
    let nestedIframeUrl = '';

    // Follow up to 2 nested iframes
    for (let hop = 0; hop < 2; hop++) {
      const iframeSrcRaw =
        currentHtml.match(/<iframe[^>]+src=["']([^"']*(?:embed|video|player|ok\.ru|govid|stream|v=|dood|tape)[^"']*)["']/i)?.[1] ||
        currentHtml.match(/<iframe[^>]+(?:src|data-src)=["']([^"']+)["']/i)?.[1] ||
        '';
      let iframeSrc = decodeHtmlEntities(iframeSrcRaw.trim());
      if (iframeSrc.startsWith('//')) iframeSrc = `https:${iframeSrc}`;
      else if (iframeSrc.startsWith('/')) {
        try {
          const p = new URL(currentUrl);
          iframeSrc = `${p.protocol}//${p.host}${iframeSrc}`;
        } catch {}
      }
      if (!iframeSrc || iframeSrc === currentUrl || !parseSafeHttpUrl(iframeSrc)) break;

      const nestedLower = iframeSrc.toLowerCase();
      if (VIDEO_EXT_RE.test(nestedLower) || nestedLower.includes('.m3u8')) {
        const isHls = nestedLower.includes('.m3u8');
        return {
          directUrl: iframeSrc,
          type: isHls ? 'hls' : 'direct',
          sources: [{ file: iframeSrc, label: 'HD', type: isHls ? 'hls' : 'mp4' }],
        };
      }

      try {
        nestedIframeUrl = iframeSrc;
        const nParsed = new URL(iframeSrc);
        const nr = await fetchEdgeTimeout(
          iframeSrc,
          { headers: { ...reqHeaders, Referer: `${nParsed.protocol}//${nParsed.host}/` } },
          4500,
        );
        if (!nr.ok) break;
        const nct = (nr.headers.get('content-type') || '').toLowerCase();
        const ncl = parseInt(nr.headers.get('content-length') || '0', 10);
        if (nct.startsWith('video/') || nct.includes('mpegurl') || (nct.includes('octet-stream') && ncl > 5 * 1024 * 1024)) {
          const isHls = nct.includes('mpegurl') || nestedLower.includes('.m3u8');
          return {
            directUrl: iframeSrc,
            type: isHls ? 'hls' : 'direct',
            sources: [{ file: iframeSrc, label: 'HD', type: isHls ? 'hls' : 'mp4' }],
          };
        }
        currentHtml = await nr.text();
        currentUrl = iframeSrc;
      } catch {
        break;
      }
    }

    const html = currentHtml;
    const scriptBlocks: string[] = [];
    const scriptRe = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
    let sm: RegExpExecArray | null;
    while ((sm = scriptRe.exec(html)) !== null) {
      const code = sm[1] || '';
      if (!code) continue;
      scriptBlocks.push(code);
      if (code.includes('eval') && code.includes('p,a,c,k,e,d')) {
        const unpacked = unpackDeanEdwards(code);
        if (unpacked) scriptBlocks.push(unpacked);
      }
    }
    const combinedCode = `${scriptBlocks.join('\n\n')}\n\n${html}`;
    const sources: { file: string; label: string; type: string }[] = [];

    if (currentUrl.includes('ok.ru')) {
      const match =
        html.match(/data-options="([^"]+)"/) ||
        html.match(/OK\.Player\.initPlayer\([^,]+,\s*([^)]+)\)/);
      if (match) {
        try {
          const decodedOptions = decodeHtmlEntities(match[1]).replace(/\\"/g, '"').replace(/\\u0022/g, '"');
          const json = JSON.parse(decodedOptions);
          const videos = json?.flashvars?.metadata ? JSON.parse(json.flashvars.metadata)?.videos : json?.videos;
          if (Array.isArray(videos)) {
            const labelMap: Record<string, string> = {
              mobile: '144p', lowest: '240p', low: '360p', sd: '480p', hd: '720p', full: '1080p',
            };
            videos.forEach((v: any) => {
              if (v?.url && v?.name) {
                sources.push({ file: v.url, label: labelMap[v.name] || 'HD', type: 'mp4' });
              }
            });
          }
        } catch {}
      }
    }

    if (currentUrl.includes('videa.hu')) {
      const videaSrcs = await extractVideaDirectEdge(currentUrl);
      videaSrcs.forEach((vs) => sources.push({ file: vs.file, label: vs.label, type: vs.type }));
    }

    if (currentUrl.includes('streamtape') || currentUrl.includes('tape')) {
      const direct = extractStreamtapeLinkEdge(combinedCode);
      if (direct) sources.push({ file: direct, label: 'HD', type: 'mp4' });
    }

    if (currentUrl.includes('4shared.com')) {
      const sMatch =
        html.match(/<source\s+src=["'](https?:[^"']+\.mp4[^"']*)["']/i) ||
        combinedCode.match(/(https?:\/\/dc\d+\.4shared\.com\/[^\s'"]+\.mp4[^\s'"]*)/i);
      if (sMatch?.[1]) {
        return { directUrl: sMatch[1], type: 'direct', sources: [{ file: sMatch[1], label: 'FHD', type: 'mp4' }] };
      }
    }

    if (/asnwish|streamwish|awish|swish|sfastwish|flaswish|obeywish|cdnwish|hgcloud|dhcplay/.test(currentUrl)) {
      let wishCode = combinedCode;
      if (currentUrl.includes('hgcloud') || currentUrl.includes('dhcplay')) {
        const idM = currentUrl.match(/\/e\/([A-Za-z0-9_-]+)/);
        if (idM) {
          try {
            const ar = await fetchEdgeTimeout(`https://asnwish.com/e/${idM[1]}`, { headers: { ...reqHeaders, Referer: 'https://asnwish.com/' } }, 3500);
            if (ar.ok) {
              const ah = await ar.text();
              wishCode = `${unpackDeanEdwards(ah)}\n${ah}`;
            }
          } catch {}
        }
      }
      const hm =
        wishCode.match(/["']hls2["']\s*:\s*["'](https?:[^"']+\.m3u8[^"']*)["']/i) ||
        wishCode.match(/file\s*:\s*["'](https?:[^"']+\.m3u8[^"']*)["']/i) ||
        wishCode.match(/(https?:\/\/[^\s'"]+\/hls2\/[^\s'"]+\.m3u8[^\s'"]*)/i);
      if (hm?.[1]) return { directUrl: hm[1], type: 'hls', sources: [{ file: hm[1], label: 'FHD', type: 'hls' }] };
    }

    if (currentUrl.includes('uqload')) {
      const uqHls =
        combinedCode.match(/file\s*:\s*["'](https?:[^"']+\.m3u8[^"']*)["']/i) ||
        combinedCode.match(/(https?:\/\/[^\s'"]*uqload[^\s'"]+\.m3u8[^\s'"]*)/i);
      if (uqHls?.[1]) return { directUrl: uqHls[1], type: 'hls', sources: [{ file: uqHls[1], label: 'FHD', type: 'hls' }] };
      const uqMp4 =
        html.match(/sources\s*:\s*\[\s*['"](https?:[^'"]+\.mp4[^'"]*)['"]/i) ||
        combinedCode.match(/file\s*:\s*['"](https?:[^'"]+\.mp4[^'"]*)['"]/i);
      if (uqMp4?.[1]) return { directUrl: uqMp4[1], type: 'direct', sources: [{ file: uqMp4[1], label: 'HD', type: 'mp4' }] };
    }

    if (currentUrl.includes('vidmoly')) {
      const mm =
        html.match(/file\s*:\s*['"](https?:[^'"]+\.m3u8[^'"]*)['"]/i) ||
        combinedCode.match(/file\s*:\s*['"](https?:[^'"]+\.m3u8[^'"]*)['"]/i) ||
        combinedCode.match(/(https?:\/\/[^\s'"]+\/master\.m3u8[^\s'"]*)/i);
      if (mm?.[1]) return { directUrl: mm[1], type: 'hls', sources: [{ file: mm[1], label: 'FHD', type: 'hls' }] };
    }

    if (currentUrl.includes('sendvid')) {
      const svm =
        html.match(/var\s+video_source\s*=\s*["'](https?:[^"']+\.mp4[^"']*)["']/i) ||
        html.match(/<source[^>]+src=["'](https?:[^"']+\.mp4[^"']*)["']/i) ||
        combinedCode.match(/(https?:\/\/[^\s"'<>]*sendvid\.com\/[^\s"'<>]*\.mp4[^\s"'<>]*)/i);
      if (svm?.[1]) {
        const prox = buildProxyUrl(svm[1], 'https://sendvid.com/');
        return {
          directUrl: prox,
          type: 'direct',
          sources: [
            { file: prox, label: 'HD', type: 'mp4' },
            { file: svm[1], label: 'Direct', type: 'mp4' },
          ],
        };
      }
    }

    if (currentUrl.includes('yourupload.com')) {
      const yum =
        html.match(/property=["']og:video["']\s+content=["'](https?:[^"']+\.mp4[^"']*)["']/i) ||
        html.match(/file\s*:\s*['"](https?:\/\/vidcache\.net[^'"]+\.mp4[^'"]*)['"]/i);
      if (yum?.[1]) {
        const prox = buildProxyUrl(yum[1], 'https://www.yourupload.com/');
        return { directUrl: prox, type: 'direct', sources: [{ file: prox, label: 'FHD', type: 'mp4' }] };
      }
    }

    if (currentUrl.includes('mp4upload.com')) {
      const m4 =
        combinedCode.match(/player\.src\s*\(\s*\{[^}]*src\s*:\s*["'](https?:\/\/[^"']+\.mp4[^"']*)["']/i) ||
        combinedCode.match(/src\s*:\s*["'](https?:\/\/[^"']+mp4upload\.com[^"']+\.mp4[^"']*)["']/i) ||
        combinedCode.match(/(https?:\/\/[a-z0-9]+\.mp4upload\.com(?::\d+)?\/d\/[^"'\s]+\/[^"'\s]+\.mp4)/i);
      if (m4?.[1]) {
        const prox = buildProxyUrl(m4[1], 'https://www.mp4upload.com/');
        return { directUrl: prox, type: 'direct', sources: [{ file: prox, label: 'FHD', type: 'mp4' }] };
      }
    }

    if (/lulustream|morencius|earnvids|vidhide|filelions/.test(currentUrl)) {
      const refOrigin = (() => {
        try { const u = new URL(currentUrl); return `${u.protocol}//${u.host}/`; } catch { return 'https://lulustream.com/'; }
      })();
      const hm =
        combinedCode.match(/["']hls[234]?["']\s*:\s*["']((?:https?:)?\/\/[^"']+\.m3u8[^"']*)["']/i) ||
        combinedCode.match(/file\s*:\s*["']((?:https?:)?\/\/[^"']+\.m3u8[^"']*)["']/i) ||
        combinedCode.match(/((?:https?:)?\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/i);
      if (hm?.[1]) {
        const hUrl = hm[1].startsWith('//') ? `https:${hm[1]}` : hm[1];
        const prox = buildProxyUrl(hUrl, refOrigin);
        return { directUrl: prox, type: 'hls', sources: [{ file: prox, label: 'FHD', type: 'hls' }] };
      }
    }

    if (currentUrl.includes('mixdrop')) {
      const refOrigin = (() => {
        try { const u = new URL(currentUrl); return `${u.protocol}//${u.host}/`; } catch { return 'https://mixdrop.ag/'; }
      })();
      const mm =
        combinedCode.match(/(?:MDCore\.wurl|wurl|remp|delivery)\s*=\s*["']([^"']+)["']/i) ||
        combinedCode.match(/((?:https?:)?\/\/[^\s"'<>]*mxcontent\.net[^\s"'<>]*\.mp4[^\s"'<>]*)/i) ||
        combinedCode.match(/((?:https?:)?\/\/[^\s"'<>]+?mixdrop[^\s"'<>]+?\.mp4[^\s"'<>]*)/i);
      if (mm?.[1]) {
        const fUrl = mm[1].trim().startsWith('//') ? `https:${mm[1].trim()}` : mm[1].trim();
        if (fUrl.startsWith('http')) {
          const prox = buildProxyUrl(fUrl, refOrigin);
          return { directUrl: prox, type: 'direct', sources: [{ file: prox, label: 'HD', type: 'mp4' }] };
        }
      }
    }

    if (currentUrl.includes('dood') || currentUrl.includes('d000d')) {
      const md5Match = combinedCode.match(/\/(pass_md5\/[A-Za-z0-9_.-]*)/);
      if (md5Match) {
        try {
          const pu = new URL(currentUrl);
          const md5Url = `${pu.protocol}//${pu.host}/${md5Match[1]}`;
          const dr = await fetchEdgeTimeout(md5Url, { headers: { ...reqHeaders, Referer: currentUrl, Accept: '*/*' } }, 2000);
          if (dr.ok) {
            const tokVal = await dr.text();
            const tokKey = md5Url.split('/').pop() || '';
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
            let rnd = '';
            for (let i = 0; i < 10; i++) rnd += chars.charAt(Math.floor(Math.random() * chars.length));
            sources.push({ file: `${tokVal}${rnd}?token=${tokKey}&expiry=${Date.now()}`, label: 'HD', type: 'mp4' });
          }
        } catch {}
      }
    }

    const m3u8Matches = Array.from(new Set(combinedCode.match(/(https?:\/\/[^\s'"]+?\.m3u8[^\s'"]*)/gi) || []))
      .filter((u) => !/google|facebook|analytics/i.test(u));
    const mp4Matches = Array.from(new Set(combinedCode.match(/(https?:\/\/[^\s'"]+?\.mp4[^\s'"]*)/gi) || []))
      .filter((u) => !/google|facebook|analytics|placeholder/i.test(u));

    mp4Matches.forEach((u) => sources.push({ file: u, label: 'HD', type: 'mp4' }));
    m3u8Matches.forEach((u) => sources.push({ file: u, label: 'FHD', type: 'hls' }));

    if (sources.length > 0) {
      const mp4Src = sources.find((s) => s.type === 'mp4');
      const hlsSrc = sources.find((s) => s.type === 'hls');
      const primary = mp4Src || hlsSrc || sources[0];
      return { directUrl: primary.file, type: primary.type === 'hls' ? 'hls' : 'direct', sources };
    }

    const embedFallback = nestedIframeUrl || currentUrl || targetUrl;
    return {
      directUrl: embedFallback,
      type: 'iframe',
      sources: [{ file: embedFallback, label: 'FHD', type: 'iframe' }],
    };
  } catch {
    return {
      directUrl: targetUrl,
      type: 'iframe',
      sources: [{ file: targetUrl, label: 'FHD', type: 'iframe' }],
    };
  }
}

// ============================================================================
// Binary Probe + Best Download / Play Resolution on Edge
// ============================================================================
function normalizeQualityTier(raw?: string | null): QualityTier | null {
  const l = String(raw || '').toLowerCase();
  if (!l) return null;
  if (l.includes('1080') || l.includes('fhd')) return 'FHD';
  if (l.includes('720') || l.includes('hd')) return 'HD';
  if (l.includes('480') || l.includes('360') || l.includes('sd') || l.includes('low')) return 'SD';
  return null;
}

function scoreQualityMatch(tier: QualityTier | null | undefined, preferred: PreferredQuality): number {
  if (!tier) return 0;
  if (preferred === 'auto') return tier === 'FHD' ? 20 : tier === 'HD' ? 15 : 10;
  if (tier === preferred) return 220;
  if (preferred === 'FHD') return tier === 'HD' ? 75 : 30;
  if (preferred === 'HD') return tier === 'FHD' ? 70 : 40;
  return tier === 'HD' ? 75 : 30;
}

function getHostReferer(url: string): string {
  const l = url.toLowerCase();
  if (l.includes('mp4upload')) return 'https://www.mp4upload.com/';
  if (l.includes('sendvid')) return 'https://sendvid.com/';
  if (l.includes('yourupload')) return 'https://www.yourupload.com/';
  if (l.includes('uqload')) return 'https://uqload.vc/';
  if (l.includes('vidmoly')) return 'https://vidmoly.org/';
  if (l.includes('streamtape')) return 'https://streamtape.com/';
  if (l.includes('dood') || l.includes('d000d')) return 'https://d000d.com/';
  if (l.includes('mixdrop')) return 'https://mixdrop.ag/';
  if (l.includes('lulustream') || l.includes('morencius') || l.includes('earnvids')) return 'https://lulustream.com/';
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}/`;
  } catch {
    return '';
  }
}

async function verifyBinaryVideoUrl(
  videoUrl: string,
  referer: string,
): Promise<{ ok: boolean; sizeBytes?: number | null }> {
  try {
    const hdrs: Record<string, string> = {
      'User-Agent': EDGE_STREAM_UA,
      Range: 'bytes=0-4095',
      Accept: '*/*',
    };
    if (referer) hdrs.Referer = referer;
    const { response } = await fetchWithSafeRedirects(videoUrl, hdrs, 6500, 'GET');
    try { await response.body?.cancel(); } catch {}
    if (!response.ok) return { ok: false };
    const ct = (response.headers.get('content-type') || '').toLowerCase();
    if (ct.includes('text/html') || ct.includes('application/json') || ct.includes('text/plain')) {
      return { ok: false };
    }
    const contentRange = response.headers.get('content-range') || '';
    const crMatch = contentRange.match(/\/(\d+)\s*$/);
    const totalFromRange = crMatch ? parseInt(crMatch[1], 10) : 0;
    const cl = parseInt(response.headers.get('content-length') || '0', 10);
    const sizeBytes = totalFromRange > 0 ? totalFromRange : cl > 4096 ? cl : null;
    if (sizeBytes !== null && sizeBytes < 250 * 1024) return { ok: false };
    const looksLikeVideo =
      ct.startsWith('video/') ||
      ct.includes('application/octet-stream') ||
      ct.includes('binary/octet-stream') ||
      VIDEO_EXT_RE.test(videoUrl);
    return { ok: looksLikeVideo, sizeBytes };
  } catch {
    return { ok: false };
  }
}

function unwrapSafeCandidateUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('/api/anime/download') || trimmed.includes('/api/anime/download?')) {
    try {
      const dummy = new URL(trimmed, 'https://app.local');
      const inner = dummy.searchParams.get('url') || '';
      return parseSafeHttpUrl(inner) ? trimmed : null;
    } catch {
      return null;
    }
  }
  return parseSafeHttpUrl(trimmed) ? trimmed : null;
}

async function resolveSingleCandidateEdge(
  rawUrl: string,
  filename: string,
  preferredQuality: PreferredQuality,
  serverQualityHint: QualityTier | null,
): Promise<{ mp4?: EdgeResolvedTarget; hls?: EdgeResolvedTarget }> {
  if (!parseSafeHttpUrl(rawUrl)) return {};

  if (rawUrl.toLowerCase().includes('videa.hu')) {
    const videaSources = await extractVideaDirectEdge(rawUrl);
    videaSources.sort((a, b) => {
      const qa = normalizeQualityTier(a.label) || serverQualityHint || null;
      const qb = normalizeQualityTier(b.label) || serverQualityHint || null;
      return scoreQualityMatch(qb, preferredQuality) - scoreQualityMatch(qa, preferredQuality);
    });
    for (const vs of videaSources) {
      const check = await verifyBinaryVideoUrl(vs.file, '');
      if (check.ok) {
        const isWebm = vs.mimeType.includes('webm');
        return {
          mp4: {
            streamUrl: vs.file,
            referer: '',
            filename: isWebm ? filename.replace(/\.mp4$/i, '.webm') : filename,
            mode: 'mp4',
            sizeBytes: check.sizeBytes,
            serverName: 'Videa',
            resolvedQuality: normalizeQualityTier(vs.label) || serverQualityHint || 'HD',
            publicNoReferer: true,
            mimeType: vs.mimeType || 'video/mp4',
          },
        };
      }
    }
    return {};
  }

  if (rawUrl.includes('drive.google.com') || rawUrl.includes('gdrive')) {
    const id = rawUrl.match(/\/d\/([A-Za-z0-9_-]+)/)?.[1] || rawUrl.match(/id=([A-Za-z0-9_-]+)/)?.[1];
    if (id) {
      const gUrl = `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`;
      const check = await verifyBinaryVideoUrl(gUrl, '');
      if (check.ok) {
        return {
          mp4: {
            streamUrl: gUrl,
            referer: '',
            filename,
            mode: 'mp4',
            sizeBytes: check.sizeBytes,
            serverName: 'Google Drive',
            resolvedQuality: serverQualityHint || 'HD',
            publicNoReferer: true,
            mimeType: 'video/mp4',
          },
        };
      }
    }
  }

  if (rawUrl.toLowerCase().includes('megamax.') || rawUrl.toLowerCase().includes('share4max.')) {
    const mm = await extractEdgeDirectStream(rawUrl, 0);
    let hlsBackup: EdgeResolvedTarget | undefined;
    for (const src of mm.sources || []) {
      if (!src.file || src.type === 'iframe') continue;
      let streamUrl = src.file;
      let referer = getHostReferer(rawUrl);
      if (streamUrl.startsWith('/api/anime/stream-proxy')) {
        try {
          const u = new URL(streamUrl, 'https://app.local');
          streamUrl = u.searchParams.get('url') || '';
          referer = u.searchParams.get('referer') || referer;
        } catch {}
      }
      if (!parseSafeHttpUrl(streamUrl)) continue;
      if (src.type === 'hls' || /\.m3u8(?:$|[?#])/i.test(streamUrl)) {
        if (!hlsBackup) {
          hlsBackup = {
            streamUrl,
            referer,
            filename,
            mode: 'hls',
            serverName: 'MegaMax',
            resolvedQuality: normalizeQualityTier(src.label) || serverQualityHint || 'HD',
            publicNoReferer: !referer,
            mimeType: 'application/vnd.apple.mpegurl',
          };
        }
        continue;
      }
      const check = await verifyBinaryVideoUrl(streamUrl, referer);
      if (check.ok) {
        const noRef = referer ? await verifyBinaryVideoUrl(streamUrl, '') : check;
        return {
          mp4: {
            streamUrl,
            referer,
            filename,
            mode: 'mp4',
            sizeBytes: check.sizeBytes,
            serverName: 'MegaMax',
            resolvedQuality: normalizeQualityTier(src.label) || serverQualityHint || 'HD',
            publicNoReferer: noRef.ok,
            mimeType: 'video/mp4',
          },
        };
      }
    }
    return hlsBackup ? { hls: hlsBackup } : {};
  }

  let extractInput = rawUrl;
  if (extractInput.includes('uqload') && !extractInput.includes('/embed-')) {
    const um = extractInput.match(/(https?:\/\/[^/]+\/)(?:e\/|embed-)?([A-Za-z0-9_-]+)/i);
    if (um) extractInput = `${um[1]}embed-${um[2]}.html`;
  }
  if (extractInput.includes('mp4upload.com/') && !extractInput.includes('/embed-')) {
    extractInput = extractInput.replace(/mp4upload\.com\/([A-Za-z0-9_-]+)/i, 'mp4upload.com/embed-$1.html');
  }
  if (extractInput.includes('vidmoly') && !extractInput.includes('/embed-')) {
    extractInput = extractInput.replace(/(vidmoly\.[a-z]+\/)([A-Za-z0-9_-]+)/i, '$1embed-$2');
  }
  if (/asnwish|streamwish|awish|swish/.test(extractInput) && extractInput.includes('/f/')) {
    extractInput = extractInput.replace('/f/', '/e/');
  }
  if (extractInput.includes('ok.ru/video/')) {
    extractInput = extractInput.replace('/video/', '/videoembed/');
  }
  if (extractInput.includes('yourupload.com/watch/')) {
    extractInput = extractInput.replace('/watch/', '/embed/');
  }

  const candidateUrls: { streamUrl: string; referer: string; isHls: boolean; qTier: QualityTier | null }[] = [];
  if (VIDEO_EXT_RE.test(extractInput)) {
    candidateUrls.push({
      streamUrl: extractInput,
      referer: getHostReferer(extractInput),
      isHls: false,
      qTier: serverQualityHint || normalizeQualityTier(extractInput),
    });
  } else {
    const extracted = await extractEdgeDirectStream(extractInput);
    const allSources = [
      ...(extracted.directUrl
        ? [{ file: extracted.directUrl, label: 'Primary', type: extracted.type === 'hls' ? 'hls' : extracted.type === 'direct' ? 'mp4' : 'iframe' }]
        : []),
      ...(extracted.sources || []),
    ];
    for (const src of allSources) {
      if (!src.file || src.type === 'iframe') continue;
      let sUrl = src.file;
      let ref = getHostReferer(extractInput);
      if (sUrl.startsWith('/api/anime/stream-proxy')) {
        try {
          const u = new URL(sUrl, 'https://app.local');
          sUrl = u.searchParams.get('url') || '';
          ref = u.searchParams.get('referer') || ref;
        } catch {}
      }
      if (!parseSafeHttpUrl(sUrl)) continue;
      const isHls = src.type === 'hls' || /\.m3u8(?:$|[?#])/i.test(sUrl);
      const qTier = normalizeQualityTier(src.label) || serverQualityHint || null;
      if (!candidateUrls.some((c) => c.streamUrl === sUrl)) {
        candidateUrls.push({ streamUrl: sUrl, referer: ref, isHls, qTier });
      }
    }
  }

  candidateUrls.sort((a, b) => scoreQualityMatch(b.qTier, preferredQuality) - scoreQualityMatch(a.qTier, preferredQuality));
  let hlsFallback: EdgeResolvedTarget | undefined;

  for (const cand of candidateUrls) {
    if (cand.isHls) {
      if (!hlsFallback) {
        try {
          const hr = await fetchEdgeTimeout(
            cand.streamUrl,
            { headers: { 'User-Agent': EDGE_STREAM_UA, ...(cand.referer ? { Referer: cand.referer } : {}) } },
            3500,
          );
          if (hr.ok) {
            const txt = await hr.text();
            if (txt.includes('#EXTM3U')) {
              let pub = !cand.referer;
              if (cand.referer) {
                try {
                  const nr = await fetchEdgeTimeout(cand.streamUrl, { headers: { 'User-Agent': EDGE_STREAM_UA } }, 2500);
                  if (nr.ok && (await nr.text()).includes('#EXTM3U')) pub = true;
                } catch {}
              }
              hlsFallback = {
                streamUrl: cand.streamUrl,
                referer: cand.referer,
                filename,
                mode: 'hls',
                serverName: 'HLS Direct',
                resolvedQuality: cand.qTier || serverQualityHint || 'HD',
                publicNoReferer: pub,
                mimeType: 'application/vnd.apple.mpegurl',
              };
            }
          }
        } catch {}
      }
      continue;
    }

    const check = await verifyBinaryVideoUrl(cand.streamUrl, cand.referer);
    if (check.ok) {
      const noRef = cand.referer ? await verifyBinaryVideoUrl(cand.streamUrl, '') : check;
      return {
        mp4: {
          streamUrl: cand.streamUrl,
          referer: cand.referer,
          filename,
          mode: 'mp4',
          sizeBytes: check.sizeBytes,
          resolvedQuality: cand.qTier || serverQualityHint || 'HD',
          publicNoReferer: noRef.ok,
          mimeType: 'video/mp4',
        },
      };
    }
  }
  return hlsFallback ? { hls: hlsFallback } : {};
}

async function resolveBestDownloadEdge(
  rawCandidates: string[],
  title: string,
  ep: string,
  preferPublicExternal: boolean,
  preferredQuality: PreferredQuality,
  serverMetaMap: Record<string, { quality?: string; serverName?: string }> = {},
): Promise<{ primary: EdgeResolvedTarget | null; publicExternal: EdgeResolvedTarget | null }> {
  const cleanTitle = (title || 'Anime').replace(/[^\w\u0600-\u06FF\s-]/gi, '').trim() || 'Anime';
  const safeFilename = `${cleanTitle}-Ep-${ep}.mp4`;

  const expanded: string[] = [];
  const expandedMeta: Record<string, { quality?: string; serverName?: string }> = { ...serverMetaMap };
  for (const c of rawCandidates) {
    if (!c) continue;
    if (c.startsWith('/api/anime/download') || c.includes('/api/anime/download?')) {
      try {
        const u = new URL(c, 'https://app.local');
        const inner = u.searchParams.get('url') || '';
        if (parseSafeHttpUrl(inner) && !expanded.includes(inner)) {
          expanded.push(inner);
          if (expandedMeta[c] && !expandedMeta[inner]) expandedMeta[inner] = expandedMeta[c];
        }
      } catch {}
      continue;
    }
    if (parseSafeHttpUrl(c) && !expanded.includes(c)) expanded.push(c);
  }

  const getHostPriority = (u: string): number => {
    const l = u.toLowerCase();
    if (l.includes('mediafire') || l.includes('mega.nz')) return -10;
    if (preferPublicExternal) {
      if (l.includes('sendvid')) return 100;
      if (l.includes('drive.google')) return 98;
      if (l.includes('videa')) return 96;
      if (l.includes('uqload')) return 94;
      if (l.includes('4shared')) return 92;
      if (l.includes('megamax') || l.includes('share4max')) return 90;
      if (l.includes('wish')) return 88;
      if (l.includes('vidmoly')) return 86;
      if (l.includes('ok.ru')) return 82;
      if (l.includes('mp4upload')) return 60;
      return 45;
    }
    if (l.includes('sendvid')) return 100;
    if (l.includes('videa')) return 98;
    if (l.includes('mp4upload')) return 96;
    if (l.includes('ok.ru')) return 92;
    if (l.includes('megamax') || l.includes('share4max')) return 90;
    if (l.includes('yourupload')) return 85;
    if (l.includes('uqload')) return 80;
    if (l.includes('4shared')) return 75;
    if (l.includes('drive.google')) return 72;
    if (l.includes('streamtape')) return 65;
    if (l.includes('dood') || l.includes('d000d')) return 60;
    if (l.includes('sibnet') || l.includes('vidoza') || l.includes('mixdrop')) return 55;
    return 40;
  };

  const ordered = expanded
    .filter((u) => getHostPriority(u) > 0)
    .sort((a, b) => {
      const qa = normalizeQualityTier(expandedMeta[a]?.quality);
      const qb = normalizeQualityTier(expandedMeta[b]?.quality);
      return (getHostPriority(b) + scoreQualityMatch(qb, preferredQuality)) - (getHostPriority(a) + scoreQualityMatch(qa, preferredQuality));
    })
    .slice(0, 14);

  let firstMp4: EdgeResolvedTarget | null = null;
  let firstHls: EdgeResolvedTarget | null = null;
  let firstPubMp4: EdgeResolvedTarget | null = null;
  let firstPubHls: EdgeResolvedTarget | null = null;

  const startedAt = Date.now();
  for (let i = 0; i < ordered.length; i += 3) {
    if (Date.now() - startedAt > 19000 && (firstMp4 || firstHls)) break;
    const batch = ordered.slice(i, i + 3);
    const results = await Promise.all(
      batch.map((u) => {
        const meta = expandedMeta[u];
        const qHint = normalizeQualityTier(meta?.quality);
        return Promise.race([
          resolveSingleCandidateEdge(u, safeFilename, preferredQuality, qHint),
          new Promise<{ mp4?: EdgeResolvedTarget; hls?: EdgeResolvedTarget }>((r) => setTimeout(() => r({}), 11000)),
        ])
          .then((res) => {
            if (res.mp4 && meta?.serverName && !res.mp4.serverName) res.mp4.serverName = meta.serverName;
            if (res.hls && meta?.serverName && !res.hls.serverName) res.hls.serverName = meta.serverName;
            return res;
          })
          .catch((): { mp4?: EdgeResolvedTarget; hls?: EdgeResolvedTarget } => ({}));
      }),
    );

    for (const r of results) {
      if (r.mp4) {
        if (!firstMp4 || (preferredQuality !== 'auto' && r.mp4.resolvedQuality === preferredQuality && firstMp4.resolvedQuality !== preferredQuality)) {
          firstMp4 = r.mp4;
        }
        if (r.mp4.publicNoReferer && (!firstPubMp4 || (preferredQuality !== 'auto' && r.mp4.resolvedQuality === preferredQuality && firstPubMp4.resolvedQuality !== preferredQuality))) {
          firstPubMp4 = r.mp4;
        }
      }
      if (r.hls) {
        if (!firstHls) firstHls = r.hls;
        if (r.hls.publicNoReferer && !firstPubHls) firstPubHls = r.hls;
      }
    }

    if (preferPublicExternal) {
      if (firstPubMp4 && (preferredQuality === 'auto' || firstPubMp4.resolvedQuality === preferredQuality || i >= 3)) break;
    } else if (firstMp4 && firstPubMp4 && (preferredQuality === 'auto' || firstMp4.resolvedQuality === preferredQuality || i >= 3)) {
      break;
    }
  }

  const publicExternal = firstPubMp4 || firstPubHls;
  const primary = preferPublicExternal ? publicExternal || firstMp4 || firstHls : firstMp4 || firstHls;
  return { primary, publicExternal };
}

function parseCandidateBody(body: any) {
  const { url, fallbackUrls, serverCandidates, preferredQuality, title, ep, preferExternal } = body || {};
  const serverMetaMap: Record<string, { quality?: string; serverName?: string }> = {};
  const candidateFromObjects: string[] = [];

  if (Array.isArray(serverCandidates)) {
    for (const item of serverCandidates) {
      if (item && typeof item.url === 'string' && item.url.trim()) {
        const safe = unwrapSafeCandidateUrl(item.url);
        if (!safe) continue;
        candidateFromObjects.push(safe);
        serverMetaMap[safe] = {
          quality: typeof item.quality === 'string' ? item.quality : undefined,
          serverName: typeof item.serverName === 'string' ? item.serverName : undefined,
        };
      }
    }
  }

  const candidates: string[] = [
    ...(unwrapSafeCandidateUrl(url) ? [unwrapSafeCandidateUrl(url)!] : []),
    ...(Array.isArray(fallbackUrls)
      ? fallbackUrls.map((u: any) => unwrapSafeCandidateUrl(u)).filter((u): u is string => Boolean(u))
      : []),
    ...candidateFromObjects,
  ];

  const normalizedPref: PreferredQuality =
    preferredQuality === 'auto' || !preferredQuality
      ? 'auto'
      : normalizeQualityTier(String(preferredQuality)) || 'auto';

  return {
    candidates,
    serverMetaMap,
    normalizedPref,
    title: String(title || 'Anime'),
    ep: String(ep || '1'),
    preferExternal: Boolean(preferExternal || (typeof url === 'string' && url.includes('/api/anime/download'))),
  };
}

export async function handleEdgeResolveDownload(request: Request, env: EdgeRuntimeEnv): Promise<Response> {
  const body = await request.json().catch(() => ({}));
  const parsed = parseCandidateBody(body);
  if (parsed.candidates.length === 0) {
    return edgeJson({ success: false, message: 'لا توجد روابط سيرفرات عامة صالحة للتحميل.' }, 400);
  }

  const { primary: resolved, publicExternal } = await resolveBestDownloadEdge(
    parsed.candidates,
    parsed.title,
    parsed.ep,
    parsed.preferExternal,
    parsed.normalizedPref,
    parsed.serverMetaMap,
  );

  if (!resolved) {
    return edgeJson({ success: false, message: 'لم يتم العثور على رابط مباشر لهذه الحلقة حالياً.' });
  }

  const token = await signEdgeMediaToken(resolved, env);
  const extTarget =
    publicExternal && publicExternal.mode === 'mp4' && publicExternal.publicNoReferer
      ? publicExternal
      : resolved.publicNoReferer && resolved.mode === 'mp4'
      ? resolved
      : null;

  const resolvedQuality = resolved.resolvedQuality || 'HD';
  return edgeJson({
    success: true,
    mode: resolved.mode,
    token,
    downloadUrl: `/api/anime/download-stream?token=${encodeURIComponent(token)}`,
    externalDirectUrl: extTarget ? extTarget.streamUrl : null,
    externalDirectMime: extTarget ? (extTarget.mimeType || 'video/mp4') : null,
    filename: resolved.filename,
    sizeBytes: resolved.sizeBytes || null,
    resolvedQuality,
    requestedQuality: parsed.normalizedPref,
    usedFallbackQuality: parsed.normalizedPref !== 'auto' && resolvedQuality !== parsed.normalizedPref,
    serverName: resolved.serverName || null,
  });
}

export async function handleEdgeResolvePlay(request: Request, env: EdgeRuntimeEnv): Promise<Response> {
  const body = await request.json().catch(() => ({}));
  const parsed = parseCandidateBody(body);
  if (parsed.candidates.length === 0) {
    return edgeJson({ success: false, message: 'لا توجد روابط عامة صالحة للتشغيل الخارجي.' }, 400);
  }

  const { primary: resolved, publicExternal } = await resolveBestDownloadEdge(
    parsed.candidates,
    parsed.title,
    parsed.ep,
    true,
    parsed.normalizedPref,
    parsed.serverMetaMap,
  );

  if (!resolved) {
    return edgeJson({ success: false, message: 'تعذر تجهيز رابط التشغيل المباشر، يرجى تجربة خيار آخر.' });
  }

  const resolvedQuality = resolved.resolvedQuality || 'HD';
  const directPublic = publicExternal || (resolved.publicNoReferer ? resolved : null);
  if (directPublic && directPublic.publicNoReferer) {
    return edgeJson({
      success: true,
      isDirectCdn: true,
      mode: directPublic.mode,
      streamUrl: directPublic.streamUrl,
      mimeType: directPublic.mimeType || (directPublic.mode === 'hls' ? 'application/vnd.apple.mpegurl' : 'video/mp4'),
      filename: directPublic.mode === 'hls' ? directPublic.filename.replace(/\.mp4$/i, '.m3u8') : directPublic.filename,
      resolvedQuality: directPublic.resolvedQuality || resolvedQuality,
      requestedQuality: parsed.normalizedPref,
    });
  }

  const token = await signEdgeMediaToken(resolved, env, 6 * 3600 * 1000);
  const safeFile = encodeURIComponent(resolved.filename || 'episode.mp4');
  return edgeJson({
    success: true,
    isDirectCdn: false,
    mode: resolved.mode,
    streamUrl: `/api/anime/play-stream/${encodeURIComponent(token)}/${safeFile}`,
    mimeType: resolved.mimeType || 'video/mp4',
    filename: resolved.filename,
    resolvedQuality,
    requestedQuality: parsed.normalizedPref,
  });
}

function sanitizeHeaderFilename(rawName: string, fallback = 'episode.mp4'): string {
  const cleaned = String(rawName || '')
    .replace(/[\r\n"\\;/]/g, '_')
    .replace(/[^\x20-\x7E\u0600-\u06FF.\-_ ()]/g, '')
    .trim();
  return cleaned || fallback;
}

function rewriteHlsManifest(playlistText: string, finalUpstreamUrl: string, referer: string): string {
  const toProxied = (refTarget: string) => {
    try {
      const abs = new URL(refTarget.trim(), finalUpstreamUrl).href;
      if (!parseSafeHttpUrl(abs)) return '';
      return `/api/anime/stream-proxy?url=${encodeURIComponent(abs)}${referer ? `&referer=${encodeURIComponent(referer)}` : ''}`;
    } catch {
      return refTarget;
    }
  };
  return playlistText
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith('#')) {
        return line.replace(/URI="([^"]+)"/gi, (_m, u) => `URI="${toProxied(u)}"`);
      }
      return toProxied(trimmed);
    })
    .join('\n');
}

async function streamTargetResponse(
  target: EdgeResolvedTarget,
  request: Request,
  asAttachment: boolean,
): Promise<Response> {
  const hdrs: Record<string, string> = {
    'User-Agent': EDGE_STREAM_UA,
    Accept: '*/*',
  };
  if (target.referer) hdrs.Referer = target.referer;
  const reqRange = request.headers.get('range');
  if (reqRange) hdrs.Range = reqRange;

  try {
    const { response: upstream, finalUrl } = await fetchWithSafeRedirects(
      target.streamUrl,
      hdrs,
      25000,
      request.method === 'HEAD' ? 'HEAD' : 'GET',
    );
    if (!upstream.ok && upstream.status !== 206) {
      return new Response('تعذر سحب ملف الفيديو من السيرفر', { status: 502, headers: EDGE_CORS_HEADERS });
    }
    const ct = (upstream.headers.get('content-type') || '').toLowerCase();
    if (ct.includes('text/html')) {
      try { await upstream.body?.cancel(); } catch {}
      return new Response('السيرفر أعاد صفحة HTML بدلاً من ملف الفيديو', { status: 502, headers: EDGE_CORS_HEADERS });
    }

    if (target.mode === 'hls' || ct.includes('mpegurl') || /\.m3u8(?:$|[?#])/i.test(finalUrl)) {
      const text = await upstream.text();
      if (text.includes('#EXTM3U')) {
        const rewritten = rewriteHlsManifest(text, finalUrl, target.referer);
        return new Response(rewritten, {
          status: 200,
          headers: {
            ...EDGE_CORS_HEADERS,
            'Content-Type': 'application/vnd.apple.mpegurl',
            'Cache-Control': 'no-store',
            'X-Edge-Media-Mode': 'hls',
          },
        });
      }
    }

    const cleanName = sanitizeHeaderFilename(target.filename, 'episode.mp4');
    const asciiFallback = cleanName.replace(/[^\x20-\x7E]/g, '_').replace(/["\\;\r\n]/g, '') || 'episode.mp4';
    const outHeaders = new Headers(EDGE_CORS_HEADERS);
    outHeaders.set('Content-Type', ct.startsWith('video/') ? ct : 'video/mp4');
    outHeaders.set(
      'Content-Disposition',
      `${asAttachment ? 'attachment' : 'inline'}; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(cleanName)}`,
    );
    const cl = upstream.headers.get('content-length');
    if (cl) outHeaders.set('Content-Length', cl);
    const cr = upstream.headers.get('content-range');
    if (cr) outHeaders.set('Content-Range', cr);
    outHeaders.set('Accept-Ranges', upstream.headers.get('accept-ranges') || 'bytes');

    return new Response(request.method === 'HEAD' ? null : upstream.body, {
      status: upstream.status,
      headers: outHeaders,
    });
  } catch {
    return new Response('تعذر الاتصال بسيرفر التحميل', { status: 502, headers: EDGE_CORS_HEADERS });
  }
}

export async function handleEdgeDownloadStream(request: Request, url: URL, env: EdgeRuntimeEnv): Promise<Response> {
  const token = url.searchParams.get('token') || '';
  if (!token) {
    return edgeJson({ success: false, message: 'Missing download token' }, 400);
  }
  const target = await verifyEdgeMediaToken(token, env);
  if (!target) {
    return edgeJson({ success: false, code: 'TOKEN_EXPIRED', message: 'انتهت صلاحية رابط التحميل، أعد المحاولة.' }, 404);
  }
  return streamTargetResponse(target, request, true);
}

export async function handleEdgePlayStream(request: Request, token: string, env: EdgeRuntimeEnv): Promise<Response> {
  const target = await verifyEdgeMediaToken(decodeURIComponent(token || ''), env);
  if (!target) {
    return new Response('انتهت صلاحية رابط البث', { status: 404, headers: EDGE_CORS_HEADERS });
  }
  return streamTargetResponse(target, request, false);
}

export async function handleEdgeStreamProxy(request: Request, url: URL): Promise<Response> {
  const rawUrl = url.searchParams.get('url') || '';
  const referer = url.searchParams.get('referer') || '';
  const safeTarget = parseSafeHttpUrl(rawUrl);
  if (!safeTarget) {
    return new Response('Invalid or unsafe stream URL', { status: 400, headers: EDGE_CORS_HEADERS });
  }
  const safeRef = referer && parseSafeHttpUrl(referer) ? referer : '';
  const hdrs: Record<string, string> = { 'User-Agent': EDGE_STREAM_UA, Accept: '*/*' };
  if (safeRef) hdrs.Referer = safeRef;
  const reqRange = request.headers.get('range');
  if (reqRange) hdrs.Range = reqRange;

  try {
    const { response: upstream, finalUrl } = await fetchWithSafeRedirects(safeTarget.toString(), hdrs, 25000, 'GET');
    const ct = (upstream.headers.get('content-type') || '').toLowerCase();
    if (upstream.ok && (ct.includes('mpegurl') || /\.m3u8(?:$|[?#])/i.test(finalUrl))) {
      const playlist = await upstream.text();
      if (playlist.includes('#EXTM3U')) {
        return new Response(rewriteHlsManifest(playlist, finalUrl, safeRef), {
          status: 200,
          headers: {
            ...EDGE_CORS_HEADERS,
            'Content-Type': 'application/vnd.apple.mpegurl',
            'Cache-Control': 'no-store',
          },
        });
      }
    }
    const headers = new Headers(EDGE_CORS_HEADERS);
    for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
      const v = upstream.headers.get(h);
      if (v) headers.set(h, v);
    }
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch {
    return new Response('Stream proxy error', { status: 502, headers: EDGE_CORS_HEADERS });
  }
}

export async function handleEdgeDirectDownloadGet(request: Request, url: URL): Promise<Response> {
  const rawUrl = url.searchParams.get('url') || '';
  const title = url.searchParams.get('title') || 'Anime';
  const ep = url.searchParams.get('ep') || '1';
  if (!parseSafeHttpUrl(rawUrl)) {
    return new Response('رابط التحميل غير صالح أو غير مسموح', { status: 400, headers: EDGE_CORS_HEADERS });
  }
  const { primary: resolved } = await resolveBestDownloadEdge([rawUrl], title, ep, false, 'auto');
  if (!resolved) {
    return new Response('تعذر تجهيز ملف الفيديو المباشر حالياً', { status: 404, headers: EDGE_CORS_HEADERS });
  }
  return streamTargetResponse(resolved, request, true);
}

export async function handleEdgeExtractPost(request: Request): Promise<Response> {
  const body: any = await request.json().catch(() => ({}));
  const rawUrl = body?.url;
  if (!parseSafeHttpUrl(rawUrl)) {
    return edgeJson({ success: false, message: 'رابط غير صالح أو غير مسموح' }, 400);
  }
  const extracted = await extractEdgeDirectStream(String(rawUrl));
  return edgeJson({
    success: true,
    message: 'تم تجهيز رابط المشاهدة بنجاح.',
    data: {
      directUrl: extracted.directUrl,
      type: extracted.type,
      sources: extracted.sources || [],
    },
  });
}

// ============================================================================
// Native Edge Catalog Routes (Dashboard, Recent, Search, Season, Top, Movies, Schedule)
// ============================================================================
const EDGE_CARD_FRAGMENT = `
  id
  idMal
  title { romaji english }
  coverImage { extraLarge large }
  bannerImage
  description(asHtml: false)
  episodes
  status
  season
  seasonYear
  averageScore
  genres
  format
  nextAiringEpisode { episode airingAt }
`;

function mapAniListCardEdge(m: any) {
  const id = String(m.idMal || m.id || '');
  const rawTitle = m.title?.english || m.title?.romaji || 'Anime';
  const title = cleanAnimeTitle(rawTitle) || rawTitle;
  const posterUrl = m.coverImage?.extraLarge || m.coverImage?.large || '';
  const rating = m.averageScore ? Number((m.averageScore / 10).toFixed(1)) : 8.4;
  const genres = Array.isArray(m.genres) ? m.genres.map((g: string) => translateGenreToArabic(g)) : ['أكشن'];
  const status =
    m.status === 'FINISHED' ? 'مكتمل' : m.status === 'NOT_YET_RELEASED' ? 'قادم' : 'مستمر';
  const nextEp = Number(m.nextAiringEpisode?.episode || 0);
  const episodesCount =
    status === 'قادم'
      ? 0
      : status === 'مستمر'
      ? nextEp > 1
        ? nextEp - 1
        : undefined
      : m.episodes || undefined;
  return {
    _id: id,
    id,
    mal_id: Number(id) || undefined,
    title,
    title_english: rawTitle,
    posterUrl,
    imageUrl: posterUrl,
    thumbnailUrl: posterUrl,
    bannerUrl: m.bannerImage || '',
    rating,
    score: rating,
    genres,
    status,
    type: m.format === 'MOVIE' ? 'فيلم' : m.format || 'TV',
    episodesCount,
    episodeNumber: nextEp > 1 ? String(nextEp - 1) : undefined,
    season: m.season ? String(m.season).toLowerCase() : null,
    releaseYear: m.seasonYear ? String(m.seasonYear) : null,
    description: m.description ? String(m.description).replace(/<[^>]*>/g, ' ').trim().slice(0, 260) : '',
  };
}

function getEdgeSeasonWindow(season?: string, year?: number): { season: string; year: number } {
  const now = new Date();
  const y = year && year > 1970 ? year : now.getFullYear();
  const sUpper = (season || '').toUpperCase();
  if (sUpper === 'WINTER' || sUpper === 'SPRING' || sUpper === 'SUMMER' || sUpper === 'FALL') {
    return { season: sUpper, year: y };
  }
  const m = now.getMonth() + 1;
  if (m >= 4 && m <= 6) return { season: 'SPRING', year: y };
  if (m >= 7 && m <= 9) return { season: 'SUMMER', year: y };
  if (m >= 10 && m <= 12) return { season: 'FALL', year: y };
  return { season: 'WINTER', year: y };
}

function parseOkanimeRecentEpisodesHtml(html: string) {
  const items: any[] = [];
  if (!html) return items;
  const epCardRe = /<a\b[^>]*href=["']([^"']*\/episode\/([^"'/?#]+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = epCardRe.exec(html)) !== null) {
    const href = decodeHtmlEntities(m[1]).trim();
    const epSlugFull = decodeURIComponent(m[2] || '').trim();
    if (!epSlugFull || items.length >= 36) continue;
    const epMatch = epSlugFull.match(/^(.+?)-episode-(\d+)$/i);
    if (!epMatch) continue;
    const animeSlug = epMatch[1];
    const epNum = String(parseInt(epMatch[2], 10));
    const itemId = `${animeSlug}__ep__${epNum}`;
    if (items.some((it) => it.id === itemId)) continue;

    const surrounding = html.slice(Math.max(0, m.index - 500), Math.min(html.length, m.index + m[0].length + 500));
    const imgMatch =
      m[3].match(/<img[^>]+(?:data-src|src)=["']([^"']+)["']/i) ||
      surrounding.match(/<img[^>]+(?:data-src|src)=["']([^"']+)["']/i);
    let imageUrl = imgMatch?.[1] ? decodeHtmlEntities(imgMatch[1]).trim() : '';
    if (imageUrl.startsWith('/')) imageUrl = `${OKANIME_ORIGIN}${imageUrl}`;

    const rawAnchorTitle = stripTags(m[3]) || animeSlug.replace(/-/g, ' ');
    const cleaned = cleanAnimeTitle(rawAnchorTitle) || cleanAnimeTitle(animeSlug.replace(/-/g, ' ')) || animeSlug;
    const posterUrl = imageUrl.replace('-thumbnail.', '-poster.');

    items.push({
      _id: itemId,
      id: itemId,
      title: cleaned,
      episode: epNum,
      episodeNumber: epNum,
      imageUrl: imageUrl || posterUrl,
      posterUrl: posterUrl || imageUrl,
      thumbnailUrl: imageUrl || posterUrl,
      link: href.startsWith('http') ? href : `${OKANIME_ORIGIN}${href.startsWith('/') ? href : `/${href}`}`,
      animeId: {
        _id: animeSlug,
        title: cleaned,
        titleAr: cleaned,
        posterUrl: posterUrl || imageUrl,
        thumbnailUrl: imageUrl || posterUrl,
        episodeLink: itemId,
      },
    });
  }
  return items;
}

async function fetchEdgeRecentEpisodesList(page = 1): Promise<any[]> {
  try {
    const url = page <= 1 ? `${OKANIME_ORIGIN}/` : `${OKANIME_ORIGIN}/?page=${page}`;
    const html = await fetchSiteHtml(url, 4800);
    const parsed = parseOkanimeRecentEpisodesHtml(html);
    if (parsed.length > 0) return parsed;
  } catch {}

  try {
    const aniData = await queryAniListEdge(
      `query ($p: Int) { Page(page: $p, perPage: 24) { media(type: ANIME, status: RELEASING, sort: [UPDATED_AT_DESC, TRENDING_DESC], isAdult: false) { ${EDGE_CARD_FRAGMENT} } } }`,
      { p: page },
    );
    const list: any[] = aniData?.Page?.media || [];
    return list.map((m) => {
      const card = mapAniListCardEdge(m);
      const epNum = String(card.episodeNumber || Math.max(1, Number(m.nextAiringEpisode?.episode || 2) - 1));
      return {
        _id: `${card._id}-ep-${epNum}`,
        id: `${card._id}-episode-${epNum}`,
        title: card.title,
        episode: epNum,
        episodeNumber: epNum,
        imageUrl: card.posterUrl,
        posterUrl: card.posterUrl,
        thumbnailUrl: card.posterUrl,
        link: `/anime/${card._id}`,
        animeId: {
          _id: card._id,
          title: card.title,
          titleAr: card.title,
          posterUrl: card.posterUrl,
          thumbnailUrl: card.posterUrl,
          episodeLink: `${card._id}-episode-${epNum}`,
        },
      };
    });
  } catch {
    return [];
  }
}

export async function handleEdgeAnimeRecent(url: URL): Promise<Response> {
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
  const data = await fetchEdgeRecentEpisodesList(page);
  if (data.length === 0) {
    return edgeJson(
      {
        success: false,
        hybridFallback: true,
        page,
        hasNext: false,
        hasPrev: page > 1,
        data: [],
      },
      200,
      { 'X-Hybrid-Fallback': '1' },
    );
  }
  return edgeJson({
    success: true,
    page,
    hasNext: data.length >= 10,
    hasPrev: page > 1,
    data,
  });
}

export async function handleEdgeAnimeGenres(): Promise<Response> {
  return edgeJson({
    success: true,
    data: GENRE_TAXONOMY.map((g) => ({ mal_id: g.mal_id, name: g.name, nameAr: g.nameAr })),
  });
}

export async function handleEdgeAnimeSearch(url: URL): Promise<Response> {
  const q = (url.searchParams.get('q') || '').trim();
  const genresParam = (url.searchParams.get('genres') || '').trim();
  const minScoreRaw = parseFloat(url.searchParams.get('min_score') || '0');
  const statusParam = (url.searchParams.get('status') || '').toLowerCase().trim();
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
  const orderBy = (url.searchParams.get('order_by') || '').toLowerCase();
  const sort = (url.searchParams.get('sort') || 'desc').toLowerCase();
  const yearNum = parseInt(url.searchParams.get('year') || '0', 10) || 0;

  const genreTokens = genresParam ? genresParam.split(',').map((t) => t.trim()).filter(Boolean) : [];
  const splitGenres = splitAniListGenresAndTags(genreTokens);

  let aniSort = q ? 'SEARCH_MATCH' : 'POPULARITY_DESC';
  if (orderBy === 'score') aniSort = sort === 'asc' ? 'SCORE' : 'SCORE_DESC';
  else if (orderBy === 'popularity') aniSort = sort === 'asc' ? 'POPULARITY' : 'POPULARITY_DESC';
  else if (orderBy === 'start_date') aniSort = sort === 'asc' ? 'START_DATE' : 'START_DATE_DESC';
  else if (orderBy === 'title') aniSort = sort === 'asc' ? 'TITLE_ROMAJI' : 'TITLE_ROMAJI_DESC';

  const statusMap: Record<string, string> = {
    airing: 'RELEASING',
    releasing: 'RELEASING',
    complete: 'FINISHED',
    finished: 'FINISHED',
    upcoming: 'NOT_YET_RELEASED',
  };

  try {
    const vars: Record<string, any> = { page, sort: [aniSort] };
    if (q) vars.search = q;
    if (splitGenres.genreIn.length > 0) vars.genre_in = splitGenres.genreIn;
    if (splitGenres.tagIn.length > 0) vars.tag_in = splitGenres.tagIn;
    if (minScoreRaw > 0) vars.averageScore_greater = Math.round(minScoreRaw * 10);
    if (statusMap[statusParam]) vars.status = statusMap[statusParam];
    if (yearNum > 1970) vars.seasonYear = yearNum;

    const aniData = await queryAniListEdge(
      `query ($page: Int, $search: String, $genre_in: [String], $tag_in: [String], $averageScore_greater: Int, $status: MediaStatus, $seasonYear: Int, $sort: [MediaSort]) {
        Page(page: $page, perPage: 24) {
          pageInfo { hasNextPage currentPage }
          media(type: ANIME, isAdult: false, search: $search, genre_in: $genre_in, tag_in: $tag_in, averageScore_greater: $averageScore_greater, status: $status, seasonYear: $seasonYear, sort: $sort) {
            ${EDGE_CARD_FRAGMENT}
          }
        }
      }`,
      vars,
    );
    const list: any[] = aniData?.Page?.media || [];
    if (list.length > 0 || !q) {
      return edgeJson({
        success: true,
        data: list.map(mapAniListCardEdge),
        pagination: {
          has_next_page: Boolean(aniData?.Page?.pageInfo?.hasNextPage),
          current_page: aniData?.Page?.pageInfo?.currentPage || page,
        },
      });
    }
  } catch {}

  if (q) {
    try {
      const kitRes = await fetchEdgeTimeout(
        `https://kitsu.io/api/edge/anime?filter[text]=${encodeURIComponent(q)}&page[limit]=20`,
        { headers: { 'User-Agent': EDGE_API_UA, Accept: 'application/vnd.api+json' } },
        4000,
      );
      if (kitRes.ok) {
        const kitJson: any = await kitRes.json();
        const items: any[] = Array.isArray(kitJson?.data) ? kitJson.data : [];
        if (items.length > 0) {
          const mapped = items
            .map((it) => mapKitsuToEdgeMedia(it))
            .filter(Boolean)
            .map((m) => mapAniListCardEdge(m));
          return edgeJson({
            success: true,
            data: mapped,
            pagination: { has_next_page: false, current_page: page },
          });
        }
      }
    } catch {}
  }

  return edgeJson(
    {
      success: false,
      hybridFallback: true,
      data: [],
      pagination: { has_next_page: false, current_page: page },
    },
    200,
    { 'X-Hybrid-Fallback': '1' },
  );
}

export async function handleEdgeAnimeSeason(url: URL): Promise<Response> {
  const rawSeason = (url.searchParams.get('season') || '').trim();
  const rawYear = parseInt(url.searchParams.get('year') || '0', 10) || 0;
  const win = getEdgeSeasonWindow(rawSeason === 'auto' || rawSeason === 'now' ? '' : rawSeason, rawYear);

  try {
    const aniData = await queryAniListEdge(
      `query ($season: MediaSeason, $year: Int) {
        Page(page: 1, perPage: 30) {
          media(type: ANIME, season: $season, seasonYear: $year, sort: [POPULARITY_DESC, SCORE_DESC], isAdult: false) {
            ${EDGE_CARD_FRAGMENT}
          }
        }
      }`,
      { season: win.season, year: win.year },
    );
    const list: any[] = aniData?.Page?.media || [];
    if (list.length > 0) {
      return edgeJson({ success: true, data: list.map(mapAniListCardEdge) });
    }
  } catch {}

  return edgeJson({ success: false, hybridFallback: true, data: [] }, 200, { 'X-Hybrid-Fallback': '1' });
}

export async function handleEdgeAnimeCollection(kind: 'top' | 'movies', url: URL): Promise<Response> {
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
  try {
    const aniData = await queryAniListEdge(
      kind === 'movies'
        ? `query ($p: Int) { Page(page: $p, perPage: 28) { pageInfo { hasNextPage } media(type: ANIME, format: MOVIE, sort: [SCORE_DESC, POPULARITY_DESC], isAdult: false) { ${EDGE_CARD_FRAGMENT} } } }`
        : `query ($p: Int) { Page(page: $p, perPage: 28) { pageInfo { hasNextPage } media(type: ANIME, sort: [SCORE_DESC, POPULARITY_DESC], isAdult: false) { ${EDGE_CARD_FRAGMENT} } } }`,
      { p: page },
    );
    const list: any[] = aniData?.Page?.media || [];
    if (list.length > 0) {
      return edgeJson({
        success: true,
        page,
        hasNext: Boolean(aniData?.Page?.pageInfo?.hasNextPage),
        hasPrev: page > 1,
        data: list.map(mapAniListCardEdge),
      });
    }
  } catch {}

  return edgeJson(
    { success: false, hybridFallback: true, page, hasNext: false, hasPrev: page > 1, data: [] },
    200,
    { 'X-Hybrid-Fallback': '1' },
  );
}

async function fetchEdgeScheduleForDay(dayParam: string): Promise<any[]> {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const day = days.includes(dayParam.toLowerCase()) ? dayParam.toLowerCase() : days[new Date().getDay()];
  try {
    const aniData = await queryAniListEdge(
      `query {
        Page(page: 1, perPage: 45) {
          airingSchedules(notYetAired: true, sort: TIME) {
            airingAt
            episode
            media {
              ${EDGE_CARD_FRAGMENT}
            }
          }
        }
      }`,
      {},
    );
    const schedules: any[] = aniData?.Page?.airingSchedules || [];
    const matched = schedules
      .filter((s) => s?.media && !s.media.isAdult)
      .filter((s) => {
        const d = new Date(Number(s.airingAt || 0) * 1000);
        return days[d.getUTCDay()] === day;
      })
      .map((s) => {
        const card = mapAniListCardEdge(s.media);
        const dt = new Date(Number(s.airingAt || 0) * 1000);
        const jstDt = new Date(dt.getTime() + 9 * 3600 * 1000);
        const hh = String(jstDt.getUTCHours()).padStart(2, '0');
        const mm = String(jstDt.getUTCMinutes()).padStart(2, '0');
        return {
          ...card,
          images: { jpg: { large_image_url: card.posterUrl, image_url: card.posterUrl } },
          score: card.rating,
          episodes: card.episodesCount || s.episode || undefined,
          year: Number(card.releaseYear) || new Date().getFullYear(),
          broadcast: { time: `${hh}:${mm}`, day },
          genres: card.genres.map((g: string) => ({ name: g })),
        };
      });
    if (matched.length > 0) return matched;
  } catch {}
  return [];
}

export async function handleEdgeAnimeSchedule(url: URL): Promise<Response> {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const day = (url.searchParams.get('day') || days[new Date().getDay()]).toLowerCase();
  const data = await fetchEdgeScheduleForDay(day);
  if (data.length === 0) {
    return edgeJson({ success: false, hybridFallback: true, data: [] }, 200, { 'X-Hybrid-Fallback': '1' });
  }
  return edgeJson({ success: true, data });
}

export async function handleEdgeDashboard(url: URL): Promise<Response> {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const userDay = (url.searchParams.get('day') || '').toLowerCase();
  const currentDay = days.includes(userDay) ? userDay : days[new Date().getDay()];
  const excludeRecent = url.searchParams.get('excludeRecent') === '1' || url.searchParams.get('excludeRecent') === 'true';
  const requestedSeason = (url.searchParams.get('season') || 'auto').toLowerCase();
  const sliderMode = (url.searchParams.get('sliderMode') || 'best_season').toLowerCase();
  const win = getEdgeSeasonWindow(
    ['winter', 'spring', 'summer', 'fall'].includes(requestedSeason) ? requestedSeason : '',
    new Date().getFullYear(),
  );

  const sliderSort =
    sliderMode === 'all_time_best' || sliderMode === 'classic_historical'
      ? '[SCORE_DESC, POPULARITY_DESC]'
      : sliderMode === 'trending_season'
      ? '[TRENDING_DESC, POPULARITY_DESC]'
      : '[SCORE_DESC, POPULARITY_DESC]';
  const sliderFilter =
    sliderMode === 'all_time_best' || sliderMode === 'classic_historical'
      ? 'type: ANIME, isAdult: false'
      : `type: ANIME, season: ${win.season}, seasonYear: ${win.year}, isAdult: false`;

  const [aniBundle, recentEpisodes, schedule] = await Promise.all([
    queryAniListEdge(
      `query ($season: MediaSeason, $year: Int) {
        slider: Page(page: 1, perPage: 14) {
          media(${sliderFilter}, sort: ${sliderSort}) { ${EDGE_CARD_FRAGMENT} }
        }
        trending: Page(page: 1, perPage: 20) {
          media(type: ANIME, status: RELEASING, sort: [TRENDING_DESC, POPULARITY_DESC], isAdult: false) { ${EDGE_CARD_FRAGMENT} }
        }
        season: Page(page: 1, perPage: 24) {
          media(type: ANIME, season: $season, seasonYear: $year, sort: [POPULARITY_DESC, SCORE_DESC], isAdult: false) { ${EDGE_CARD_FRAGMENT} }
        }
        movies: Page(page: 1, perPage: 18) {
          media(type: ANIME, format: MOVIE, sort: [SCORE_DESC, POPULARITY_DESC], isAdult: false) { ${EDGE_CARD_FRAGMENT} }
        }
        topAnime: Page(page: 1, perPage: 18) {
          media(type: ANIME, sort: [SCORE_DESC, POPULARITY_DESC], isAdult: false) { ${EDGE_CARD_FRAGMENT} }
        }
      }`,
      { season: win.season, year: win.year },
    ).catch(() => null),
    excludeRecent ? Promise.resolve([]) : fetchEdgeRecentEpisodesList(1).catch(() => []),
    fetchEdgeScheduleForDay(currentDay).catch(() => []),
  ]);

  if (!aniBundle && recentEpisodes.length === 0) {
    return edgeJson({ success: false, hybridFallback: true }, 200, { 'X-Hybrid-Fallback': '1' });
  }

  const top5 = (aniBundle?.slider?.media || []).slice(0, 12).map(mapAniListCardEdge);
  const popular = (aniBundle?.trending?.media || []).slice(0, 14).map((m: any) => ({
    ...mapAniListCardEdge(m),
    isDailyTrending: true,
  }));
  const currentSeason = (aniBundle?.season?.media || []).map(mapAniListCardEdge);
  const movies = (aniBundle?.movies?.media || []).map(mapAniListCardEdge);
  const topAnime = (aniBundle?.topAnime?.media || []).map(mapAniListCardEdge);

  return edgeJson({
    success: true,
    data: {
      top5: top5.length > 0 ? top5 : currentSeason.slice(0, 10),
      recentEpisodes: excludeRecent ? [] : recentEpisodes,
      popular: popular.length > 0 ? popular : currentSeason.slice(0, 12),
      currentSeason,
      schedule: schedule.length > 0 ? schedule : popular.slice(0, 10),
      movies,
      topAnime,
    },
  });
}
