import * as cheerio from 'cheerio';
import { serverCache } from './cacheService';
import { cleanAnimeTitle } from '../utils/animeTitleCleaner';
import {
  CURATED_ANIME_LIST,
  getCuratedAnimeById
} from '../data/curatedAnimeDatabase';
import { isSafePublicHttpUrl, validateSafePublicHttpUrl } from '../api/helpers/urlSafety';

export const IS_EXTERNAL_FETCH_DISABLED = false; // محرك الجلب المزدوج: ww3.okanime.xyz (أساسي #1) + animedar.net (مساعد #2)

const activeScraperJikanLocks = new Map<string, Promise<any>>();

export interface AnimeItem {
  id: string;
  title: string;
  episode?: string;
  link: string;
  imageUrl: string;
  rating?: number;
}

export interface EpisodeServer {
  serverName: string;
  url: string;
  type: 'iframe' | 'direct';
  quality?: '1080p' | '720p' | '480p' | 'multi' | 'auto';
  category?: 'watch' | 'download';
}

export interface SeasonEpisodesGroup {
  seasonId: string;
  seasonTitle: string;
  title?: string;
  seasonNumber: number;
  episodes: { id: string; num: string; title: string; link: string; seasonNumber?: number }[];
}

/**
 * 1. باني روابط سيرفرات المشاهدة والتحميل للموقع المساعد animedar.net (#2 Helper)
 * مستخرج من تحليل ملف jqu.js لقالب animestream
 */
function buildAnimedarServerUrls(
  rawType: string,
  rawId: string,
  rawQuality: string
): {
  serverName: string;
  watchUrl: string;
  downloadUrl: string;
  quality: '1080p' | '720p' | '480p' | 'auto';
} | null {
  const type = (rawType || '').trim().toLowerCase().split(/\s+/)[0];
  let id = (rawId || '').trim();
  const qLower = (rawQuality || '').trim().toLowerCase();
  if (!id) return null;

  let quality: '1080p' | '720p' | '480p' | 'auto' = '1080p';
  if (qLower === 'fhd' || qLower === '1080p' || qLower === '1080') {
    quality = '1080p';
  } else if (qLower === 'hd' || qLower === '720p' || qLower === '720') {
    quality = '720p';
  } else if (qLower === 'sd' || qLower === '480p' || qLower === '480' || qLower === 'ld' || qLower === '360p' || qLower === 'low') {
    quality = '480p';
  }

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
      if (fileMatch) {
        downloadUrl = `https://www.4shared.com/get/${fileMatch[1].slice(0, 10)}`;
      }
    } else if (id.includes('dailymotion')) {
      serverName = 'Dailymotion';
    } else if (id.includes('drive.google')) {
      serverName = 'Google Drive';
      const dMatch = id.match(/\/d\/([A-Za-z0-9_-]+)/);
      if (dMatch) {
        downloadUrl = `https://drive.google.com/u/0/uc?id=${dMatch[1]}&export=download`;
      }
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
      downloadUrl = `https://vk.com/video_ext.php?oid=${id}`;
      break;
    case 'sibnet':
      serverName = 'Sibnet';
      watchUrl = `https://video.sibnet.ru/shell.php?videoid=${id}`;
      downloadUrl = `https://video.sibnet.ru/shell.php?videoid=${id}`;
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
    case 'mailru':
      serverName = 'Mail.ru';
      watchUrl = `https://my.mail.ru/video/embed/${id}`;
      downloadUrl = `https://my.mail.ru/video/embed/${id}`;
      break;
    case 'vid4up':
    case 'vid4upd0':
      serverName = 'Vid4Up';
      watchUrl = `https://cdn2.vid4up.xyz/embedvideo/${id}`;
      downloadUrl = `https://cdn2.vid4up.xyz/video/${id}`;
      break;
    case 'mediafire':
      serverName = 'MediaFire';
      watchUrl = '';
      downloadUrl = `https://www.mediafire.com/file/${id}`;
      break;
    case 'fembed':
    case 'vanfem':
    case 'femax':
      serverName = 'Fembed';
      watchUrl = `https://vanfem.com/v/${id}`;
      downloadUrl = `https://vanfem.com/f/${id}`;
      break;
    case 'vidbem':
    case 'vidbom':
    case 'vedbom':
    case 'vidbm':
    case 'vidbam': {
      serverName = 'VidBom';
      const cleanVbId = id.replace(/^embed-/i, '').replace(/\.html$/i, '');
      watchUrl = `https://vidbam.org/embed-${cleanVbId}.html`;
      downloadUrl = `https://vidbam.org/${cleanVbId}.html`;
      break;
    }
    case 'govid':
    case 'goved': {
      serverName = 'GoVid';
      const cleanGvId = id.replace(/^embed-/i, '').replace(/\.html$/i, '');
      watchUrl = `https://govid.me/embed-${cleanGvId}.html`;
      downloadUrl = `https://govid.me/${cleanGvId}.html`;
      break;
    }
    case 'samaup':
    case 'sama-share': {
      serverName = 'SamaUp';
      const cleanSmId = id.replace(/^embed-/i, '').replace(/\.html$/i, '');
      watchUrl = `https://samaup.cc/embed-${cleanSmId}.html`;
      downloadUrl = `https://sama-share.com/${cleanSmId}`;
      break;
    }
    case 'soraplay':
      serverName = 'SoraPlay';
      watchUrl = `https://soraplay.xyz/embed/${id}`;
      downloadUrl = `https://soraplay.xyz/embed/${id}`;
      break;
    case 'mixdrop':
      serverName = 'Mixdrop';
      watchUrl = `https://mixdrop.to/e/${id}`;
      downloadUrl = `https://mixdrop.to/f/${id}`;
      break;
    case 'upvideo':
      serverName = 'UpVideo';
      watchUrl = `https://upvideo.to/e/${id}`;
      downloadUrl = `https://upvideo.to/v/${id}`;
      break;
    case 'highload':
      serverName = 'HighLoad';
      watchUrl = `https://highload.to/e/${id}`;
      downloadUrl = `https://highload.to/v/${id}`;
      break;
    case 'streamhub':
      serverName = 'StreamHub';
      watchUrl = `https://streamhub.to/e/${id}`;
      downloadUrl = `https://streamhub.to/d/${id}`;
      break;
    case 'yonaplay':
      serverName = 'YonaPlay';
      watchUrl = `https://yonaplay.org/embed.php?id=${id}`;
      downloadUrl = `https://yonaplay.org/embed.php?id=${id}`;
      break;
    default:
      return null;
  }

  return { serverName, watchUrl, downloadUrl, quality };
}

export class ScraperService {
  // 1. الموقع الأساسي الأول (#1 Primary): https://ww3.okanime.xyz
  private readonly primaryOrigin = 'https://ww3.okanime.xyz';

  // 2. الموقع المساعد الاحتياطي (#2 Helper): https://animedar.net
  private readonly helperOrigin = 'https://animedar.net';

  private readonly defaultHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'ar-EG,ar;q=0.9,en-US;q=0.8,en;q=0.7',
  };

  private inFlightScrape = new Map<string, Promise<any>>();

  private coalesceScrape<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = this.inFlightScrape.get(key);
    if (existing) return existing as Promise<T>;
    const p = fn().finally(() => {
      this.inFlightScrape.delete(key);
    });
    this.inFlightScrape.set(key, p);
    return p;
  }

  /**
   * جلب HTML من الموقع الأساسي #1: OkAnime (ww3.okanime.xyz)
   */
  private async fetchOkanimeHtml(path: string, timeoutMs = 8000): Promise<string> {
    if (IS_EXTERNAL_FETCH_DISABLED) {
      throw new Error('External web scraping is paused.');
    }
    const cleanPath = path.startsWith('http')
      ? path
      : `${this.primaryOrigin}${path.startsWith('/') ? path : '/' + path}`;

    const res = await fetch(cleanPath, {
      headers: this.defaultHeaders,
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (!res.ok) {
      throw new Error(`OkAnime HTTP ${res.status}`);
    }
    const text = await res.text();
    if (text.length < 3000) {
      throw new Error('OkAnime response too short');
    }
    return text;
  }

  /**
   * جلب HTML من الموقع المساعد #2: AnimeDar (animedar.net)
   */
  private async fetchAnimedarHtml(path: string, timeoutMs = 8000): Promise<string> {
    if (IS_EXTERNAL_FETCH_DISABLED) {
      throw new Error('External web scraping is paused.');
    }
    let cleanPath = path.startsWith('/') ? path : '/' + path;
    if (cleanPath.startsWith('/anime/')) {
      cleanPath = cleanPath.replace(/^\/anime\//, '/anime-p/');
    }

    const res = await fetch(`${this.helperOrigin}${cleanPath}`, {
      headers: this.defaultHeaders,
      signal: AbortSignal.timeout(timeoutMs)
    });

    if (!res.ok) {
      throw new Error(`Animedar HTTP ${res.status}`);
    }

    const text = await res.text();
    if (text.length < 5000) {
      throw new Error('Animedar response too short');
    }
    return text;
  }

  private mapOkanimeQuality(raw: string): '1080p' | '720p' | '480p' | 'auto' {
    const q = (raw || '').toUpperCase();
    if (q.includes('FHD') || q.includes('1080')) return '1080p';
    if (q.includes('SD') || q.includes('480') || q.includes('360')) return '480p';
    if (q.includes('HD') || q.includes('720')) return '720p';
    return '720p';
  }

  private normalizeOkanimeHostName(raw: string, url: string): string {
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

  private isMultiQualityWatchHost(serverName: string, url: string): boolean {
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

  private async searchOkanimeSlug(query: string): Promise<string | null> {
    const cleanQ = (query || '').trim();
    if (!cleanQ) return null;
    return serverCache.getOrFetch<string | null>(
      `okanime_search_v1:${cleanQ.toLowerCase()}`,
      async () => {
        try {
          const html = await this.fetchOkanimeHtml(`/search?q=${encodeURIComponent(cleanQ)}`, 4000);
          const $ = cheerio.load(html);
          const qTokens = cleanQ.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(t => t.length > 2);
          let bestSlug: string | null = null;
          let bestScore = -1;

          $('a[href*="/anime/"]').each((_, el) => {
            const href = ($(el).attr('href') || '').trim();
            const m = href.match(/\/anime\/([^/?#]+)/i);
            if (!m) return;
            const slug = m[1];
            const slugLower = slug.toLowerCase();
            let score = 0;
            for (const tok of qTokens) {
              if (slugLower.includes(tok)) score += 10;
            }
            if (slugLower === cleanQ.toLowerCase().replace(/[^a-z0-9]+/g, '-')) score += 50;
            if (score > bestScore) {
              bestScore = score;
              bestSlug = slug;
            }
          });
          return bestSlug;
        } catch {
          return null;
        }
      },
      2 * 60 * 60 * 1000
    );
  }

  private async extractOkanimeEpisodeServers(
    animeSlug: string,
    epNum: string | number,
    candidateTitles: string[],
    directEpisodePath?: string
  ): Promise<{ watch: EpisodeServer[]; download: EpisodeServer[] }> {
    const watch: EpisodeServer[] = [];
    const download: EpisodeServer[] = [];
    if (IS_EXTERNAL_FETCH_DISABLED) return { watch, download };

    const epStr = String(epNum).trim();
    let html = '';

    // 1. بناء قائمة مسارات الحلقة المباشرة والمحاولة بالتوازي السريع
    const epPaths: string[] = [];
    if (directEpisodePath && directEpisodePath.includes('/episode/')) {
      epPaths.push(directEpisodePath);
    }

    const slugsToTry: string[] = [];
    if (animeSlug) {
      slugsToTry.push(animeSlug);
    }
    for (const t of candidateTitles) {
      const normalized = t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      if (normalized && !slugsToTry.includes(normalized)) {
        slugsToTry.push(normalized);
      }
    }

    for (const slug of slugsToTry.slice(0, 4)) {
      const p = `/episode/${slug}-episode-${epStr}`;
      if (!epPaths.includes(p)) epPaths.push(p);
      const padded = epStr.padStart(2, '0');
      if (padded !== epStr) {
        const pp = `/episode/${slug}-episode-${padded}`;
        if (!epPaths.includes(pp)) epPaths.push(pp);
      }
    }

    for (const epPath of epPaths) {
      try {
        const fetched = await this.fetchOkanimeHtml(epPath, 4000);
        if (fetched && (fetched.includes('setServer(') || fetched.includes('data-server') || fetched.includes('ep-link'))) {
          html = fetched;
          break;
        }
      } catch {}
    }

    // 2. إن لم ينجح المسار المباشر، نبحث عن الأنمي داخل ww3.okanime.xyz ونجلب رابط الحلقة الفعلي
    if (!html) {
      const padded = epStr.padStart(2, '0');
      for (const titleCand of candidateTitles.slice(0, 4)) {
        const foundSlug = await this.searchOkanimeSlug(titleCand);
        if (!foundSlug) continue;
        for (const candNum of (padded !== epStr ? [epStr, padded] : [epStr])) {
          try {
            const fetched = await this.fetchOkanimeHtml(`/episode/${foundSlug}-episode-${candNum}`, 4000);
            if (fetched && (fetched.includes('setServer(') || fetched.includes('data-server') || fetched.includes('ep-link'))) {
              html = fetched;
              break;
            }
          } catch {}
        }
        if (html) break;
        try {
          const animePageHtml = await this.fetchOkanimeHtml(`/anime/${foundSlug}`, 4000);
          const $a = cheerio.load(animePageHtml);
          let matchedEpHref = '';
          $a('a[href*="/episode/"]').each((_, el) => {
            if (matchedEpHref) return;
            const href = ($a(el).attr('href') || '').trim();
            if (new RegExp(`-episode-0*${epStr}(?:$|\\?|#|/)`, 'i').test(href)) {
              matchedEpHref = href;
            }
          });
          if (matchedEpHref) {
            html = await this.fetchOkanimeHtml(matchedEpHref, 4000);
            if (html) break;
          }
        } catch {}
      }
    }

    if (!html) return { watch, download };

    const $ = cheerio.load(html);

    // أ. استخراج سيرفرات المشاهدة من [data-server] و @click / x-on:click="setServer('...')"
    $('[data-server]').each((_, el) => {
      const rawServer = ($(el).attr('data-server') || '').trim();
      const clickAttr = $(el).attr('@click') || $(el).attr('x-on:click') || $(el).attr('onclick') || '';
      const urlMatch = clickAttr.match(/setServer\(['"]([^'"]+)['"]\)/i);
      if (!urlMatch || !urlMatch[1]) return;

      const embedUrl = urlMatch[1]
        .replace(/\\u0026/g, '&')
        .replace(/&amp;/g, '&')
        .trim();
      if (!embedUrl.startsWith('http')) return;

      const qText = $(el).find('span').first().text().trim() || $(el).text().trim();
      const serverName = this.normalizeOkanimeHostName(rawServer, embedUrl);
      const quality: EpisodeServer['quality'] = this.isMultiQualityWatchHost(serverName, embedUrl)
        ? 'multi'
        : this.mapOkanimeQuality(qText);

      // Deduplicate MegaMax entries sharing the same hashId (preferring /iframe/)
      const megaMatch = embedUrl.match(/https?:\/\/[^/]*(?:megamax|share4max)[^/]*\/(?:iframe|e)\/([A-Za-z0-9_-]+)/i);
      if (megaMatch) {
        const canonicalMegaUrl = embedUrl.replace(/\/e\/([A-Za-z0-9_-]+)/i, '/iframe/$1');
        const existingIdx = watch.findIndex((s) => s.url.includes(megaMatch[1]));
        if (existingIdx !== -1) {
          if (embedUrl.includes('/iframe/')) {
            watch[existingIdx].url = canonicalMegaUrl;
          }
          return;
        }
        watch.push({
          serverName,
          url: canonicalMegaUrl,
          type: 'iframe',
          quality: 'multi',
          category: 'watch',
        });
        return;
      }

      if (!watch.some(s => s.url === embedUrl)) {
        watch.push({
          serverName,
          url: embedUrl,
          type: 'iframe',
          quality,
          category: 'watch'
        });
      }
    });

    // التقط أي استدعاءات setServer متبقية لم يشملها [data-server]
    const setServerRegex = /setServer\(\s*['"](https?:[^'"]+)['"]\s*\)/gi;
    let setMatch: RegExpExecArray | null;
    while ((setMatch = setServerRegex.exec(html)) !== null) {
      const embedUrl = setMatch[1].replace(/\\u0026/g, '&').replace(/&amp;/g, '&').trim();
      if (!embedUrl.startsWith('http') || watch.some(s => s.url === embedUrl)) continue;
      const serverName = this.normalizeOkanimeHostName('', embedUrl);
      watch.push({
        serverName,
        url: embedUrl,
        type: 'iframe',
        quality: this.isMultiQualityWatchHost(serverName, embedUrl) ? 'multi' : '720p',
        category: 'watch',
      });
    }

    // ب. استخراج روابط التحميل الحقيقية المرفقة بالحلقة (Mega / MP4Upload / Google Drive / MediaFire...)
    $('a.ep-link[href^="http"], a[data-umami-event-host][href^="http"]').each((_, el) => {
      const href = ($(el).attr('href') || '').trim();
      if (!href || href.includes('okanime.xyz')) return;
      const hostAttr = ($(el).attr('data-umami-event-host') || '').trim();
      const spanQual = $(el).find('span').first().text().trim() || $(el).text().trim();
      const quality = this.mapOkanimeQuality(spanQual);
      const serverName = this.normalizeOkanimeHostName(hostAttr, href);

      if (!download.some(s => s.url === href)) {
        download.push({
          serverName,
          url: href,
          type: 'direct',
          quality,
          category: 'download'
        });
      }
    });

    return { watch, download };
  }

  private jikanQueuePromise: Promise<void> = Promise.resolve();

  private async safeFetchJikan(url: string, retries = 3, ttlMs = 15 * 60 * 1000): Promise<any> {
    if (IS_EXTERNAL_FETCH_DISABLED) {
      const cached = await this.getCached<any>(url);
      if (cached) return cached;
      const stale = await serverCache.get<any>(url, true);
      if (stale) return stale;
      return null;
    }
    const isRandom = url.includes('random');

    let finalTtl = ttlMs;
    if (ttlMs === 15 * 60 * 1000 || ttlMs === 30 * 60 * 1000) {
      if (url.includes('/schedules') || url.includes('/watch/episodes')) {
        finalTtl = 6 * 60 * 60 * 1000;
      } else if (url.includes('/anime/') && (url.includes('/full') || url.includes('/characters') || url.includes('/relations'))) {
        finalTtl = 24 * 60 * 60 * 1000;
      } else {
        finalTtl = 2 * 60 * 60 * 1000;
      }
    }

    if (!isRandom) {
      const fresh = await this.getCached<any>(url);
      if (fresh) return fresh;

      const stale = await serverCache.get<any>(url, true);
      if (stale) {
        if (!activeScraperJikanLocks.has(url)) {
          const bgPromise = this.performRawJikanFetch(url, retries, finalTtl)
            .then((data) => {
              activeScraperJikanLocks.delete(url);
              return data;
            })
            .catch(() => {
              activeScraperJikanLocks.delete(url);
            });
          activeScraperJikanLocks.set(url, bgPromise);
        }
        return stale;
      }
    }

    let pendingPromise = activeScraperJikanLocks.get(url);
    if (pendingPromise) return pendingPromise;

    const freshFetchPromise = this.performRawJikanFetch(url, retries, finalTtl)
      .then((data) => {
        activeScraperJikanLocks.delete(url);
        return data;
      })
      .catch((err) => {
        activeScraperJikanLocks.delete(url);
        throw err;
      });

    activeScraperJikanLocks.set(url, freshFetchPromise);
    return freshFetchPromise;
  }

  private async performRawJikanFetch(url: string, retries: number, finalTtl: number): Promise<any> {
    const isRandom = url.includes('random');

    for (let attempt = 1; attempt <= retries; attempt++) {
      await this.jikanQueuePromise;
      let resolveQueue: () => void = () => {};
      this.jikanQueuePromise = new Promise(resolve => {
        resolveQueue = resolve;
      });

      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(5000) });

        if (response.status === 429) {
          setTimeout(resolveQueue, 2500);
          await new Promise(r => setTimeout(r, 2000 * attempt));
          continue;
        }

        if (response.status === 504 || response.status === 502 || response.status === 503) {
          setTimeout(resolveQueue, 500);
          const staleFallback = await serverCache.get(url, true);
          if (staleFallback !== null) return staleFallback;
          return null;
        }

        setTimeout(resolveQueue, 500);

        if (!response.ok) {
          throw new Error(`Jikan status ${response.status}`);
        }

        const data = await response.json();
        if (data) {
          if (!isRandom) {
            await this.setCache(url, data, finalTtl);
          }
          return data;
        }
      } catch (err: any) {
        setTimeout(resolveQueue, 500);
        if (attempt === retries) {
          const staleFallback = await serverCache.get(url, true);
          if (staleFallback !== null) return staleFallback;
          return null;
        }
        await new Promise(r => setTimeout(r, 500 * attempt));
      }
    }
    return null;
  }

  private async getCached<T>(key: string): Promise<T | null> {
    return serverCache.get<T>(key);
  }

  private async setCache<T>(key: string, data: T, ttlMs: number): Promise<void> {
    await serverCache.set<T>(key, data, ttlMs);
  }

  private extractAnimeSlugFromUrl(href: string): string {
    if (!href) return '';
    try {
      const u = href.startsWith('http') ? new URL(href) : new URL(href, this.primaryOrigin);
      const parts = u.pathname.split('/').filter(Boolean);
      const animeIdx = parts.findIndex(p => p === 'anime' || p === 'anime-p' || p === 'series');
      if (animeIdx !== -1 && parts[animeIdx + 1]) {
        return parts[animeIdx + 1];
      }
      const epIdx = parts.findIndex(p => p === 'episode');
      if (epIdx !== -1 && parts[epIdx + 1]) {
        return parts[epIdx + 1].replace(/-episode-\d+.*$/i, '');
      }
      return parts.pop() || '';
    } catch {
      return href.split('/').filter(Boolean).pop() || '';
    }
  }

  /**
   * تحليل صفحة أنمي من الموقع الأساسي OkAnime (ww3.okanime.xyz)
   */
  private parseOkanimeDocument($: cheerio.CheerioAPI, rawSlug: string) {
    let rawTitle =
      $('h1.animepage-h1').first().text().trim() ||
      $('h1').first().text().trim() ||
      $('meta[property="og:title"]').attr('content') ||
      rawSlug;

    rawTitle = rawTitle
      .replace(/-\s*أوك انمي.*$/i, '')
      .replace(/-\s*OkAnime.*$/i, '')
      .replace(/^جميع\s*حلقات\s*/i, '')
      .replace(/^انمي\s+/i, '')
      .replace(/\s*مترجم.*$/i, '')
      .trim();

    const title = cleanAnimeTitle(rawTitle) || rawTitle;

    const posterUrl =
      $('img.animepage-poster').first().attr('src') ||
      $('img.animepage-poster').first().attr('data-src') ||
      $('meta[property="og:image"]').attr('content') ||
      '';

    const description =
      $('.animepage-synopsis .synopsis-text').first().text().trim() ||
      $('meta[property="og:description"]').attr('content') ||
      '';

    const infoMap: Record<string, string> = {};
    const knownKeys = ['النوع', 'الحالة', 'الموسم', 'سنة العرض', 'عدد الحلقات', 'مدة الحلقة', 'تقييم MAL'];
    $('.animepage-meta > *').each((_, el) => {
      const txt = $(el).text().replace(/\s+/g, ' ').trim();
      if (!txt) return;
      for (const k of knownKeys) {
        if (txt.startsWith(k)) {
          const val = txt.slice(k.length).replace(/^[:\s]+/, '').trim();
          if (val) infoMap[k] = val;
          break;
        }
      }
    });

    const genres: string[] = [];
    $('.animepage-genres a.genre-tag, .animepage-genres a').each((_, el) => {
      const g = $(el).text().trim();
      if (g && !genres.includes(g)) genres.push(g);
    });

    const ratingMatch = (infoMap['تقييم MAL'] || '').match(/(\d+(?:\.\d+)?)/);
    const rating = ratingMatch ? Math.min(10, parseFloat(ratingMatch[1])) : 8.5;

    const episodes: {
      id: string;
      num: string;
      title: string;
      link: string;
      seasonNumber?: number;
      serversCount: number;
    }[] = [];

    const epAnchorNodes = $('.animepage-main-col a[href*="/episode/"]').length > 0
      ? $('.animepage-main-col a[href*="/episode/"]')
      : $('a[href*="/episode/"]').filter((_, el) => $(el).closest('aside').length === 0);

    epAnchorNodes.each((_, el) => {
      const href = ($(el).attr('href') || '').trim();
      if (!href) return;
      const numMatch = href.match(/-episode-(\d+)(?:$|\/|\?|#)/i) || $(el).text().match(/(\d+)/);
      if (!numMatch || !numMatch[1]) return;

      const epNum = numMatch[1];
      const fullLink = href.startsWith('http')
        ? href
        : `${this.primaryOrigin}${href.startsWith('/') ? href : '/' + href}`;

      if (!episodes.some(e => e.num === epNum)) {
        episodes.push({
          id: `${rawSlug}__ep__${epNum}`,
          num: epNum,
          title: `الحلقة ${epNum}`,
          link: fullLink,
          seasonNumber: 1,
          serversCount: 1
        });
      }
    });

    episodes.sort((a, b) => (parseInt(a.num, 10) || 0) - (parseInt(b.num, 10) || 0));

    return {
      slug: rawSlug,
      title,
      rawTitle,
      posterUrl,
      description,
      infoMap,
      genres,
      rating,
      episodes
    };
  }

  /**
   * تحليل صفحة أنمي من الموقع المساعد animedar.net
   * يستخرج الحلقات من #EpList1 وجميع السيرفرات من #ServerList1 .divv11
   */
  private parseAnimedarDocument($: cheerio.CheerioAPI, rawSlug: string) {
    let rawTitle =
      $('h1.entry-title').first().text().trim() ||
      $('.infox h1').first().text().trim() ||
      $('meta[property="og:title"]').attr('content') ||
      rawSlug;

    rawTitle = rawTitle
      .replace(/-\s*انمي دار.*$/i, '')
      .replace(/-\s*AnimeDar.*$/i, '')
      .replace(/-\s*انمي ليك.*$/i, '')
      .replace(/^جميع\s*حلقات\s*/i, '')
      .replace(/^انمي\s+/i, '')
      .replace(/\s*مترجم\s*اون\s*لاين.*$/i, '')
      .replace(/\s*مترجم.*$/i, '')
      .trim();

    const title = cleanAnimeTitle(rawTitle) || rawTitle;

    const posterUrl =
      $('.thumbook .thumb img, .thumb img').first().attr('src') ||
      $('meta[property="og:image"]').attr('content') ||
      '';

    let description =
      $('.synp .entry-content p, .entry-content p, .desc p').first().text().trim() ||
      $('meta[property="og:description"]').attr('content') ||
      '';

    const infoMap: Record<string, string> = {};
    $('.info-content .spe span, .spe span').each((_, el) => {
      const fullText = $(el).text().replace(/\s+/g, ' ').trim();
      const bText = $(el).find('b').text().replace(':', '').trim();
      if (bText) {
        const val = fullText.replace($(el).find('b').text(), '').replace(/^:\s*/, '').trim();
        if (val) infoMap[bText] = val;
      } else if (fullText.includes(':')) {
        const [k, ...rest] = fullText.split(':');
        if (k && rest.length > 0) infoMap[k.trim()] = rest.join(':').trim();
      }
    });

    const genres: string[] = [];
    $('.genxed a, a[href*="/genres/"]').each((_, el) => {
      const g = $(el).text().trim();
      if (g && !genres.includes(g)) genres.push(g);
    });

    const ratingStr = $('.rating strong').first().text().replace(/[^0-9.]/g, '').trim();
    const rating = parseFloat(ratingStr) || 8.4;

    const episodes: {
      id: string;
      num: string;
      title: string;
      link: string;
      seasonNumber?: number;
      serversCount: number;
    }[] = [];

    const episodeServersByNum = new Map<string, EpisodeServer[]>();

    $('#EpList1 > div[data-episode], #EpList1 > div[id^="IDSB"]').each((idx, epEl) => {
      const dataEp = $(epEl).attr('data-episode') || '';
      const idAttr = $(epEl).attr('id') || '';
      const epText = $(epEl).text().replace(/\s+/g, ' ').trim();

      const numMatch =
        dataEp.match(/\d+/) ||
        epText.match(/الحلقة\s*(\d+)/) ||
        epText.match(/(\d+)/) ||
        idAttr.match(/IDSB(\d+)/i);

      const epNum = numMatch ? numMatch[1] || numMatch[0] : String(idx + 1);
      const idsbIndex = idAttr.replace(/^IDSB/i, '') || String(idx + 1);

      let serverBox = $(`#ServerList1 .divv11.e${epNum}`).first();
      if (serverBox.length === 0) {
        serverBox = $(`#ServerList1 .divv11[id="${idsbIndex}"], #ServerList1 .divv11[data-ep="${epNum}"]`).first();
      }
      if (serverBox.length === 0) {
        serverBox = $('#ServerList1 .divv11').eq(idx);
      }

      const watchServers: EpisodeServer[] = [];
      const downloadServers: EpisodeServer[] = [];

      serverBox.find('li').each((_, srvEl) => {
        const srvType =
          $(srvEl).attr('type') ||
          $(srvEl).attr('data-type') ||
          $(srvEl).attr('class') ||
          $(srvEl).text().trim();
        const srvId =
          $(srvEl).attr('data') ||
          $(srvEl).attr('data-id') ||
          '';
        const srvQuality =
          $(srvEl).attr('quality-data') ||
          $(srvEl).attr('data-quality') ||
          $(srvEl).closest('ul').attr('data-quality') ||
          'HD';

        const built = buildAnimedarServerUrls(srvType, srvId, srvQuality);
        if (built) {
          if (built.watchUrl && !watchServers.some(s => s.url === built.watchUrl)) {
            watchServers.push({
              serverName: built.serverName,
              url: built.watchUrl,
              type: 'iframe',
              quality: built.quality,
              category: 'watch'
            });
          }
          if (built.downloadUrl && !downloadServers.some(s => s.url === built.downloadUrl && s.quality === built.quality)) {
            downloadServers.push({
              serverName: built.serverName,
              url: built.downloadUrl,
              type: 'direct',
              quality: built.quality,
              category: 'download'
            });
          }
        }
      });

      const combinedEpServers = [...watchServers, ...downloadServers];
      episodeServersByNum.set(String(epNum), combinedEpServers);

      const epCompositeId = `${rawSlug}__ep__${epNum}`;
      if (!episodes.some(e => e.num === String(epNum))) {
        episodes.push({
          id: epCompositeId,
          num: String(epNum),
          title: epText.includes('الحلقة') ? epText : `الحلقة ${epNum}`,
          link: `${this.helperOrigin}/anime-p/${rawSlug}/?ep=${epNum}`,
          seasonNumber: 1,
          serversCount: watchServers.length
        });
      }
    });

    episodes.sort((a, b) => (parseInt(a.num, 10) || 0) - (parseInt(b.num, 10) || 0));

    return {
      slug: rawSlug,
      title,
      rawTitle,
      posterUrl,
      description,
      infoMap,
      genres,
      rating,
      episodes,
      episodeServersByNum
    };
  }

  /**
   * فك وتجميع قائمة "الأكثر شعبية اليوم":
   * - أولاً: من الموقع الأساسي #1 OkAnime (ww3.okanime.xyz/state/currently-airing)
   * - ثانياً (مساعد): فك تشفير صندوق #hot-widget-wrapper[data-encrypted] من animedar.net
   */
  public async getPopularToday(forceBypass = false): Promise<AnimeItem[]> {
    const cacheKey = 'popular_today_okanime_v1';
    if (!forceBypass) {
      const cached = await this.getCached<AnimeItem[]>(cacheKey);
      if (cached && cached.length > 0) return cached;
    }

    return this.coalesceScrape(cacheKey, async () => {
      if (!forceBypass) {
        const cached = await this.getCached<AnimeItem[]>(cacheKey);
        if (cached && cached.length > 0) return cached;
      }

    try {
      const html = await this.fetchOkanimeHtml('/state/currently-airing', 6000);
      const $ = cheerio.load(html);
      const items: AnimeItem[] = [];
      const seen = new Set<string>();

      $('.anime-card:not(.episode-card)').each((_, el) => {
        if ($(el).closest('aside').length > 0) return;
        const href = $(el).find('a[href*="/anime/"]').first().attr('href') || '';
        const slug = this.extractAnimeSlugFromUrl(href);
        if (!slug || seen.has(slug)) return;

        const rawTitle = $(el).find('h4 a span, h4 a, h4, .anime-title').first().text().replace(/\s+/g, ' ').trim();
        if (!rawTitle) return;

        const badgeText = $(el).find('.ep-number-badge, .badge').text().trim();
        const epMatch = badgeText.match(/(\d+)/);
        const epNum = epMatch ? epMatch[1] : '1';
        const img = $(el).find('img').first().attr('src') || $(el).find('img').first().attr('data-src') || '';

        seen.add(slug);
        items.push({
          id: slug,
          title: cleanAnimeTitle(rawTitle) || rawTitle,
          episode: epNum,
          link: `${this.primaryOrigin}/anime/${slug}`,
          imageUrl: img,
          rating: 8.7
        });
      });

      if (items.length > 0) {
        await this.setCache(cacheKey, items, 30 * 60 * 1000);
        return items;
      }
    } catch {}

    // احتياطي مساعد (#2 AnimeDar)
    try {
      const html = await this.fetchAnimedarHtml('/', 5000);
      const $ = cheerio.load(html);
      const enc = $('#hot-widget-wrapper').attr('data-encrypted') || '';
      if (!enc) return [];

      const decodedHtml = decodeURIComponent(escape(Buffer.from(enc, 'base64').toString('binary')));
      const $hot = cheerio.load(decodedHtml);
      const items: AnimeItem[] = [];

      $hot('article.bs').each((_, el) => {
        const href = $hot(el).find('a').first().attr('href') || '';
        const slug = this.extractAnimeSlugFromUrl(href);
        if (!slug) return;

        const rawTitle = $hot(el).find('h2[itemprop="headline"], .tt h2').first().text().replace(/\s+/g, ' ').trim();
        const epSpan = $hot(el).find('.ep-number span').text().trim();
        const epMatch = epSpan.match(/(\d+)/);
        const epNum = epMatch ? epMatch[1] : '1';
        const img = $hot(el).find('img').first().attr('src') || '';

        items.push({
          id: slug,
          title: cleanAnimeTitle(rawTitle) || rawTitle,
          episode: epNum,
          link: `${this.helperOrigin}/anime-p/${slug}/`,
          imageUrl: img,
          rating: 8.6
        });
      });

      if (items.length > 0) {
        await this.setCache(cacheKey, items, 60 * 60 * 1000);
      }
      return items;
    } catch {
      return [];
    }
    });
  }

  /**
   * 1. أحدث الحلقات المترجمة:
   * - أولاً (الأساسي #1): من ww3.okanime.xyz/recently-uploaded-episodes
   * - ثانياً (المساعد #2): من صندوق .bixbox.ongoing في animedar.net عند تعذر الأساسي
   */
  public async getRecentEpisodes(forceBypass = false, page = 1): Promise<AnimeItem[]> {
    const safePage = Math.max(1, Math.floor(Number(page) || 1));
    if (IS_EXTERNAL_FETCH_DISABLED) {
      return CURATED_ANIME_LIST.map((anime) => ({
        id: String(anime.mal_id),
        title: anime.title_english || anime.title,
        episode: String(anime.latestEpisode),
        link: `/anime/${anime.mal_id}/episode/${anime.latestEpisode}`,
        imageUrl: anime.posterUrl,
        rating: anime.rating
      }));
    }

    const cacheKey = `recent_episodes_okanime_primary_v1_page_${safePage}`;
    if (!forceBypass) {
      const cached = await this.getCached<AnimeItem[]>(cacheKey);
      if (cached && cached.length > 0) return cached;
    } else {
      await serverCache.delete(cacheKey);
      if (safePage === 1) {
        await serverCache.delete('recent_episodes');
      }
    }

    return this.coalesceScrape(`${cacheKey}${forceBypass ? ':force' : ''}`, async () => {

    try {
      const validItems: AnimeItem[] = [];
      const seenSlugs = new Set<string>();

      // 1. الجلب المباشر من الموقع الأساسي #1 (ww3.okanime.xyz)
      const okPath = safePage > 1 ? `/recently-uploaded-episodes?page=${safePage}` : '/recently-uploaded-episodes';
      const okHtml = await this.fetchOkanimeHtml(okPath, 7500).catch(() => '');

      if (okHtml) {
        const $ok = cheerio.load(okHtml);
        $ok('[data-track-card="episode"]').each((_, el) => {
          if ($ok(el).closest('aside').length > 0) return;
          const href = $ok(el).find('a[href*="/episode/"]').first().attr('href') || '';
          const trackSlug = ($ok(el).attr('data-track-anime') || '').trim();
          const slug = trackSlug || this.extractAnimeSlugFromUrl(href);
          if (!slug || seenSlugs.has(slug)) return;

          const epAttr = ($ok(el).attr('data-umami-event-episode_number') || '').trim();
          const badgeText = $ok(el).find('.ep-number-badge').text().trim();
          const epMatch = epAttr.match(/^(\d+)$/) || href.match(/-episode-(\d+)/i) || badgeText.match(/(\d+)/);
          if (!epMatch || !epMatch[1]) return;

          const epNum = epMatch[1];
          let rawTitle =
            $ok(el).find('.anime-title h4, .anime-title a, .anime-title').first().text().replace(/\s+/g, ' ').trim() ||
            $ok(el).find('img').first().attr('alt') ||
            slug.replace(/-/g, ' ');
          rawTitle = rawTitle
            .replace(/\s*الحلقة\s*\d+.*$/i, '')
            .replace(/\s*مترجمة.*$/i, '')
            .trim();

          const img =
            $ok(el).find('.episode-image img, img').first().attr('src') ||
            $ok(el).find('.episode-image img, img').first().attr('data-src') ||
            '';

          const fullLink = href.startsWith('http')
            ? href
            : `${this.primaryOrigin}/episode/${slug}-episode-${epNum}`;

          seenSlugs.add(slug);
          validItems.push({
            id: `${slug}__ep__${epNum}`,
            title: cleanAnimeTitle(rawTitle) || rawTitle,
            episode: epNum,
            link: fullLink,
            imageUrl: img,
            rating: 8.6
          });
        });
      }

      // 2. الموقع المساعد #2 (animedar.net) كاحتياطي عند تعذر الأساسي أو فراغ النتائج
      if (validItems.length === 0) {
        const targetDarPath = safePage > 1 ? `/page/${safePage}/` : '/';
        const darHtml = await this.fetchAnimedarHtml(targetDarPath, 8000).catch(() => '');

        if (darHtml) {
          const $dar = cheerio.load(darHtml);
          $dar('.bixbox.ongoing article.bs').each((_, el) => {
            const href = $dar(el).find('a').first().attr('href') || '';
            const slug = this.extractAnimeSlugFromUrl(href);
            if (!slug || seenSlugs.has(slug)) return;

            const dataStatus = ($dar(el).find('.typez').attr('data-status') || '').trim();
            const btText = $dar(el).find('.bt, .status, .epx').text().trim();
            const typeText = $dar(el).find('.typez').text().trim();

            if (
              dataStatus.includes('قادم') ||
              btText.includes('قادم') ||
              typeText.includes('فيلم') ||
              typeText.toLowerCase().includes('movie')
            ) {
              return;
            }

            const epSpanText = $dar(el).find('.ep-number span').text().trim();
            const epMatch = epSpanText.match(/الحلقة\s*(\d+)/) || epSpanText.match(/(\d+)/);
            if (!epMatch) return;

            const epNum = epMatch[1];
            const rawTitle = $dar(el).find('h2[itemprop="headline"], .tt h2').first().text().replace(/\s+/g, ' ').trim();
            const img = $dar(el).find('img').first().attr('src') || $dar(el).find('img').first().attr('data-src') || '';

            seenSlugs.add(slug);
            validItems.push({
              id: `${slug}__ep__${epNum}`,
              title: cleanAnimeTitle(rawTitle) || rawTitle,
              episode: epNum,
              link: `${this.helperOrigin}/anime-p/${slug}/?ep=${epNum}`,
              imageUrl: img,
              rating: 8.5
            });
          });
        }
      }

      if (validItems.length > 0) {
        await this.setCache(cacheKey, validItems, 5 * 60 * 1000);
        if (safePage === 1) {
          await this.setCache('recent_episodes', validItems, 5 * 60 * 1000);
        }
        return validItems;
      }

      throw new Error('No recent episodes found from OkAnime or Animedar');
    } catch {
      const stale = await serverCache.get<AnimeItem[]>(cacheKey, true);
      if (stale && stale.length > 0) return stale;
      if (safePage === 1) {
        const stalePage1 = await serverCache.get<AnimeItem[]>('recent_episodes', true);
        if (stalePage1 && stalePage1.length > 0) return stalePage1;
      }
      if (safePage > 1) return [];
      return [];
    }
    });
  }

  /**
   * 2. جدول البث المباشر المطابق للمصدر الأساسي ww3.okanime.xyz/schedule
   */
  public async getScheduleByDayMap(forceBypass = false): Promise<Record<string, any[]>> {
    const cacheKey = 'schedule_okanime_week_v2';
    if (!forceBypass) {
      const cached = await this.getCached<Record<string, any[]>>(cacheKey);
      if (cached && Object.keys(cached).length > 0) return cached;
    } else {
      await serverCache.delete(cacheKey);
    }

    return this.coalesceScrape(`${cacheKey}${forceBypass ? ':force' : ''}`, async () => {

    const sectionDayMap: Record<string, string> = {
      schedule_day_5: 'saturday',
      schedule_day_6: 'sunday',
      schedule_day_0: 'monday',
      schedule_day_1: 'tuesday',
      schedule_day_2: 'wednesday',
      schedule_day_3: 'thursday',
      schedule_day_4: 'friday',
    };

    try {
      const html = await this.fetchOkanimeHtml('/schedule', 7000);
      const $ = cheerio.load(html);
      const weekMap: Record<string, any[]> = {
        saturday: [],
        sunday: [],
        monday: [],
        tuesday: [],
        wednesday: [],
        thursday: [],
        friday: [],
      };

      $('[data-track-section^="schedule_day_"]').each((_, secEl) => {
        const secAttr = ($(secEl).attr('data-track-section') || '').trim();
        let dayKey = sectionDayMap[secAttr];
        if (!dayKey) {
          const heading = $(secEl).find('h2, h3, .schedule-day-title').first().text();
          if (heading.includes('السبت')) dayKey = 'saturday';
          else if (heading.includes('الأحد') || heading.includes('الاحد')) dayKey = 'sunday';
          else if (heading.includes('الإثنين') || heading.includes('الاثنين')) dayKey = 'monday';
          else if (heading.includes('الثلاثاء')) dayKey = 'tuesday';
          else if (heading.includes('الأربعاء') || heading.includes('الاربعاء')) dayKey = 'wednesday';
          else if (heading.includes('الخميس')) dayKey = 'thursday';
          else if (heading.includes('الجمعة')) dayKey = 'friday';
        }
        if (!dayKey) return;

        $(secEl).find('.schedule-row').each((__, rowEl) => {
          const href = ($(rowEl).attr('href') || '').trim();
          const slug = ($(rowEl).attr('data-track-anime') || this.extractAnimeSlugFromUrl(href)).trim();
          const malAttr = ($(rowEl).attr('data-umami-event-mal_id') || '').trim();
          const malNum = /^\d+$/.test(malAttr) ? Number(malAttr) : undefined;
          const posterUrl =
            $(rowEl).find('img.schedule-poster, img').first().attr('src') ||
            $(rowEl).find('img.schedule-poster, img').first().attr('data-src') ||
            '';
          const rawTitle = $(rowEl).find('.schedule-row-title').first().text().replace(/\s+/g, ' ').trim();
          if (!rawTitle && !slug) return;
          const title = cleanAnimeTitle(rawTitle) || rawTitle || slug;
          const type = $(rowEl).find('.schedule-type-badge').first().text().replace(/\s+/g, ' ').trim() || 'TV';
          const timeStr = $(rowEl).find('.schedule-row-time').first().text().trim();

          let epCount: number | undefined;
          let ratingScore: number | undefined;
          $(rowEl).find('span').each((___, spEl) => {
            const spTxt = $(spEl).text().trim();
            const epM = spTxt.match(/(\d+)\s*حلقة/);
            if (epM && !epCount) epCount = parseInt(epM[1], 10);
            const rateM = spTxt.match(/★\s*(\d+(?:\.\d+)?)/);
            if (rateM && !ratingScore) ratingScore = parseFloat(rateM[1]);
          });

          const targetId = slug || (malNum ? String(malNum) : title);
          if (!weekMap[dayKey].some((item) => String(item._id) === String(targetId))) {
            weekMap[dayKey].push({
              _id: targetId,
              id: targetId,
              slug,
              mal_id: malNum,
              title,
              title_english: title,
              posterUrl,
              imageUrl: posterUrl,
              images: {
                jpg: {
                  large_image_url: posterUrl,
                  image_url: posterUrl,
                },
              },
              rating: ratingScore || null,
              score: ratingScore || 0,
              episodes: epCount || undefined,
              episodesCount: epCount ? String(epCount) : undefined,
              type,
              broadcast: {
                time: timeStr || '',
                day: dayKey,
              },
              link: href || `${this.primaryOrigin}/anime/${slug}`,
            });
          }
        });
      });

      const hasAny = Object.values(weekMap).some((arr) => arr.length > 0);
      if (hasAny) {
        await this.setCache(cacheKey, weekMap, 2 * 60 * 60 * 1000);
        return weekMap;
      }
    } catch {}

    const stale = await serverCache.get<Record<string, any[]>>(cacheKey, true);
    if (stale && Object.keys(stale).length > 0) return stale;
    return {};
    });
  }

  public async getSchedule(day?: string, forceBypass = false): Promise<AnimeItem[]> {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const targetDay = (day && days.includes(day.toLowerCase()) ? day.toLowerCase() : days[new Date().getDay()]);

    const weekMap = await this.getScheduleByDayMap(forceBypass).catch(() => ({} as Record<string, any[]>));
    if (weekMap && Array.isArray(weekMap[targetDay]) && weekMap[targetDay].length > 0) {
      return weekMap[targetDay];
    }

    try {
      const { anilistService } = await import('./anilistService');
      const aniSchedule = await anilistService.getScheduleByDay(targetDay).catch(() => []);
      if (aniSchedule && aniSchedule.length > 0) {
        return aniSchedule.map((anime: any) => ({
          id: String(anime.mal_id),
          title: anime.title_english || anime.title,
          episode: String(anime.EpisodeNumber || 1),
          link: `/anime/${anime.mal_id}/`,
          imageUrl: anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url || '',
          rating: anime.score || 8.0
        }));
      }
    } catch {}

    return [];
  }

  private async parseOkanimeCatalogListing(
    pathWithQuery: string,
    defaultType: string
  ): Promise<{ items: any[]; hasNext: boolean }> {
    const html = await this.fetchOkanimeHtml(pathWithQuery, 7000);
    const $ = cheerio.load(html);
    const items: any[] = [];
    const seen = new Set<string>();

    $('.anime-card').each((_, el) => {
      if ($(el).closest('aside').length > 0) return;
      const href = ($(el).find('a[href*="/anime/"]').first().attr('href') || '').trim();
      const slug = this.extractAnimeSlugFromUrl(href);
      if (!slug || seen.has(slug)) return;

      const rawTitle = (
        $(el).find('.anime-title h4 a, .anime-title h4, h4 a, h4').first().text() ||
        $(el).find('img').first().attr('alt') ||
        slug.replace(/-/g, ' ')
      ).replace(/\s+/g, ' ').trim();
      if (!rawTitle) return;

      const posterUrl =
        $(el).find('img').first().attr('src') ||
        $(el).find('img').first().attr('data-src') ||
        '';
      const epText = $(el).find('.anime-title h5, h5').first().text().trim();
      const epMatch = epText.match(/(\d+)/);
      const episodesCount = epMatch ? parseInt(epMatch[1], 10) : undefined;
      const type = $(el).find('.anime-details small').first().text().replace(/\s+/g, ' ').trim() || defaultType;
      const genres = $(el)
        .find('.anime-details ul li')
        .map((__, li) => $(li).text().replace(/\s+/g, ' ').trim())
        .get()
        .filter(Boolean);
      const description = $(el).find('.anime-details p').first().text().replace(/\s+/g, ' ').trim();

      seen.add(slug);
      items.push({
        _id: slug,
        id: slug,
        slug,
        title: cleanAnimeTitle(rawTitle) || rawTitle,
        posterUrl,
        imageUrl: posterUrl,
        type,
        episodesCount: episodesCount || (defaultType === 'فيلم' ? 1 : undefined),
        genres,
        description,
        link: href.startsWith('http') ? href : `${this.primaryOrigin}/anime/${slug}`,
      });
    });

    const pageMatch = pathWithQuery.match(/[?&]page=(\d+)/);
    const currentPage = pageMatch ? parseInt(pageMatch[1], 10) : 1;
    let hasNext = false;
    $('.pagination a').each((_, aEl) => {
      const aHref = ($(aEl).attr('href') || '').trim();
      const rel = ($(aEl).attr('rel') || '').toLowerCase();
      if (rel === 'next' || aHref.includes(`page=${currentPage + 1}`)) {
        hasNext = true;
      }
    });
    if (!hasNext && items.length >= 28) hasNext = true;

    return { items, hasNext };
  }

  public async getAnimeMovies(page = 1, forceBypass = false): Promise<{ items: any[]; hasNext: boolean }> {
    const safePage = Math.max(1, Math.floor(Number(page) || 1));
    const cacheKey = `okanime_movies_v1_p_${safePage}`;
    if (!forceBypass) {
      const cached = await this.getCached<{ items: any[]; hasNext: boolean }>(cacheKey);
      if (cached && cached.items?.length > 0) return cached;
    } else {
      await serverCache.delete(cacheKey);
    }

    return this.coalesceScrape(`${cacheKey}${forceBypass ? ':force' : ''}`, async () => {
    try {
      const path = safePage > 1 ? `/anime-movies?page=${safePage}` : '/anime-movies';
      const result = await this.parseOkanimeCatalogListing(path, 'فيلم');
      if (result.items.length > 0) {
        await this.setCache(cacheKey, result, 60 * 60 * 1000);
        return result;
      }
    } catch {}

    const stale = await serverCache.get<{ items: any[]; hasNext: boolean }>(cacheKey, true);
    if (stale && stale.items?.length > 0) return stale;
    return { items: [], hasNext: false };
    });
  }

  public async getTopAnime(page = 1, forceBypass = false): Promise<{ items: any[]; hasNext: boolean }> {
    const safePage = Math.max(1, Math.floor(Number(page) || 1));
    const cacheKey = `okanime_top_v1_p_${safePage}`;
    if (!forceBypass) {
      const cached = await this.getCached<{ items: any[]; hasNext: boolean }>(cacheKey);
      if (cached && cached.items?.length > 0) return cached;
    } else {
      await serverCache.delete(cacheKey);
    }

    return this.coalesceScrape(`${cacheKey}${forceBypass ? ':force' : ''}`, async () => {
    try {
      const path = safePage > 1 ? `/top-anime?page=${safePage}` : '/top-anime';
      const result = await this.parseOkanimeCatalogListing(path, 'مسلسل');
      if (result.items.length > 0) {
        await this.setCache(cacheKey, result, 60 * 60 * 1000);
        return result;
      }
    } catch {}

    const stale = await serverCache.get<{ items: any[]; hasNext: boolean }>(cacheKey, true);
    if (stale && stale.items?.length > 0) return stale;
    return { items: [], hasNext: false };
    });
  }

  private cleanQueryForSearch(query: string): string {
    let q = query;
    q = q.replace(/الموسم\s*\d+/gi, '');
    q = q.replace(/الجزء\s*\d+/gi, '');
    q = q.replace(/الموسم\s*(?:الأول|الثاني|الثالث|الرابع|الخامس)/gi, '');
    q = q.replace(/الجزء\s*(?:الأول|الثاني|الثالث|الرابع|الخامس)/gi, '');
    q = q.replace(/جميع\s*حلقات/gi, '');
    q = q.replace(/انمي/gi, '');
    q = q.replace(/مترجم.*/gi, '');
    q = q.replace(/اون\s*لاين/gi, '');
    q = q.replace(/الحلقة\s*\d+/gi, '');
    q = q.replace(/حلقة\s*\d+/gi, '');
    q = q.replace(/[\s\-\\\/:]+/g, ' ');
    return q.trim();
  }

  private extractTargetSeasonNumber(query: string): number {
    const q = (query || '').toLowerCase();
    const sMatch =
      q.match(/(?:season|s|part|cour)\s*(\d+)/i) ||
      q.match(/(\d+)(?:nd|rd|th)\s*season/i) ||
      q.match(/الموسم\s*(\d+)/i) ||
      q.match(/الجزء\s*(\d+)/i) ||
      q.match(/\s+(ii|iii|iv)\b/i);
    if (sMatch && sMatch[1]) {
      const val = sMatch[1].toLowerCase();
      if (val === 'ii') return 2;
      if (val === 'iii') return 3;
      if (val === 'iv') return 4;
      const n = parseInt(val, 10);
      if (!isNaN(n) && n >= 1 && n <= 20) return n;
    }
    if (q.includes('الموسم الثاني') || q.includes('الجزء الثاني') || q.includes('second season') || q.includes('2nd season')) return 2;
    if (q.includes('الموسم الثالث') || q.includes('الجزء الثالث') || q.includes('third season') || q.includes('3rd season')) return 3;
    if (q.includes('الموسم الرابع') || q.includes('الجزء الرابع') || q.includes('fourth season') || q.includes('4th season') || q.includes('final season')) return 4;
    return 1;
  }

  private scoreSearchCandidates(
    query: string,
    results: { slug: string; title: string; href: string; isUpcoming?: boolean }[]
  ): { slug: string | null; score: number } {
    if (!results || results.length === 0) return { slug: null, score: -999999 };

    const cleanQuery =
      this.cleanQueryForSearch(query)
        .toLowerCase()
        .replace(/[^a-z0-9\s\u0600-\u06FF]/g, '')
        .trim() || query.toLowerCase().trim();
    const queryWords = cleanQuery.split(' ').filter(w => w.length >= 2);
    const querySlug = cleanQuery.replace(/\s+/g, '-');
    const targetSeason = this.extractTargetSeasonNumber(query);

    const specialKeywords = ['movie', 'special', 'ova', 'ona', 'film', 'heroines', 'episode of', 'heart of gold', 'فيلم', 'فلم', 'خاصة', 'أوفا'];
    const queryHasSpecial = specialKeywords.some(kw => query.toLowerCase().includes(kw));

    let bestSlug: string | null = null;
    let highestScore = -999999;

    for (const item of results) {
      const cleanTitle = this.cleanQueryForSearch(item.title).toLowerCase().replace(/[^a-z0-9\s\u0600-\u06FF]/g, '').trim();
      const englishOnlyTitle = this.cleanQueryForSearch(item.title).toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
      const titleWords = cleanTitle.split(' ').filter(Boolean);
      const decodedSlug = (() => {
        try { return decodeURIComponent(item.slug).toLowerCase(); } catch { return item.slug.toLowerCase(); }
      })();

      const overlapCount = queryWords.filter(w => titleWords.includes(w) || decodedSlug.includes(w)).length;
      const hasSubstring =
        (cleanQuery.length >= 3 && (cleanTitle.includes(cleanQuery) || decodedSlug.includes(querySlug))) ||
        (cleanTitle.length >= 3 && cleanQuery.includes(cleanTitle));

      if (overlapCount === 0 && !hasSubstring) continue;

      let score = 0;
      if (cleanTitle === cleanQuery || (englishOnlyTitle && englishOnlyTitle === cleanQuery)) {
        score += 1200;
      }
      if (hasSubstring) {
        const refLen = englishOnlyTitle ? englishOnlyTitle.length : cleanTitle.length;
        score += 500 - Math.abs(refLen - cleanQuery.length) * 4;
      }

      const overlapRatio = queryWords.length > 0 ? overlapCount / queryWords.length : 0;
      if (overlapRatio > 0.35) score += overlapRatio * 450;
      if (decodedSlug.includes(querySlug)) score += 450;

      if (item.isUpcoming) {
        score -= 800;
      }

      const itemSeason = this.extractTargetSeasonNumber(item.title + ' ' + decodedSlug);
      if (itemSeason === targetSeason) {
        score += 450;
      } else {
        score -= 250;
      }

      const itemHasSpecial = specialKeywords.some(kw => item.title.toLowerCase().includes(kw) || decodedSlug.includes(kw));
      if (itemHasSpecial && !queryHasSpecial) {
        score -= 900;
      }

      if (score > highestScore) {
        highestScore = score;
        bestSlug = item.slug;
      }
    }

    if (!bestSlug && results.length > 0) {
      bestSlug = results[0].slug;
    }

    return { slug: bestSlug, score: highestScore };
  }

  /**
   * 3. البحث الذكي في الموقع الأساسي ww3.okanime.xyz أولاً، ثم الموقع المساعد animedar.net كاحتياطي
   */
  public async searchAnime(query: string): Promise<string | null> {
    if (!query || !query.trim()) return null;
    if (IS_EXTERNAL_FETCH_DISABLED) {
      const q = query.toLowerCase().trim();
      const match = CURATED_ANIME_LIST.find(a =>
        a.title.toLowerCase().includes(q) ||
        a.title_english.toLowerCase().includes(q)
      );
      return match ? String(match.mal_id) : String(CURATED_ANIME_LIST[0].mal_id);
    }

    const normalizedKey = query.toLowerCase().trim();
    const cacheKey = `search_okanime_primary_v1:${normalizedKey}`;
    const cached = await this.getCached<string | null>(cacheKey);
    if (cached !== null) return cached;

    return this.coalesceScrape(cacheKey, async () => {

    // 1. البحث في الموقع الأساسي #1: ww3.okanime.xyz
    try {
      const okHtml = await this.fetchOkanimeHtml(`/search?q=${encodeURIComponent(query.trim())}`, 5500);
      const $ok = cheerio.load(okHtml);
      const okResults: { slug: string; title: string; href: string; isUpcoming?: boolean }[] = [];

      $ok('.anime-card').each((_, el) => {
        if ($ok(el).closest('aside').length > 0) return;
        const href = $ok(el).find('a[href*="/anime/"]').first().attr('href') || '';
        if (!href || href.includes('${')) return;
        const slug = this.extractAnimeSlugFromUrl(href);
        if (!slug) return;

        const title = (
          $ok(el).find('.anime-title h4 a, .anime-title h4, h4 a, h4').first().text() ||
          $ok(el).find('img').attr('alt') ||
          ''
        ).replace(/\s+/g, ' ').trim();

        const badge = $ok(el).text();
        const isUpcoming = badge.includes('قادم') || badge.toLowerCase().includes('upcoming');

        if (title && !okResults.some(r => r.slug === slug)) {
          okResults.push({ slug, title, href, isUpcoming });
        }
      });

      if (okResults.length > 0) {
        const scored = this.scoreSearchCandidates(query, okResults);
        if (scored.slug) {
          await this.setCache(cacheKey, scored.slug, 24 * 60 * 60 * 1000);
          return scored.slug;
        }
      }
    } catch {}

    // 2. البحث في الموقع المساعد #2: animedar.net
    try {
      const html = await this.fetchAnimedarHtml(`/?s=${encodeURIComponent(query.trim())}`);
      const $ = cheerio.load(html);
      const results: { slug: string; title: string; href: string; isUpcoming?: boolean }[] = [];

      $('article.bs, .listupd article').each((_, el) => {
        const href = $(el).find('a').first().attr('href') || '';
        if (!href) return;
        const slug = this.extractAnimeSlugFromUrl(href);
        if (!slug) return;

        let title =
          $(el).find('h2[itemprop="headline"], .tt h2').first().text().trim() ||
          $(el).find('.tt').first().text().trim() ||
          $(el).find('img').attr('alt') ||
          '';

        const statusBadge = $(el).find('.status, .epx, .bt').text().trim();
        const isUpcoming = statusBadge.includes('قادم') || statusBadge.toLowerCase().includes('upcoming');

        title = title.replace(/\s+/g, ' ').trim();
        if (title && slug && !results.some(r => r.slug === slug)) {
          results.push({ slug, title, href, isUpcoming });
        }
      });

      if (results.length === 0) {
        const cleaned = this.cleanQueryForSearch(query);
        if (cleaned && cleaned !== query && cleaned.length >= 2) {
          const fallbackSlug = await this.searchAnime(cleaned);
          if (fallbackSlug) {
            await this.setCache(cacheKey, fallbackSlug, 24 * 60 * 60 * 1000);
            return fallbackSlug;
          }
        }
        return null;
      }

      const scored = this.scoreSearchCandidates(query, results);
      if (scored.slug) {
        await this.setCache(cacheKey, scored.slug, 24 * 60 * 60 * 1000);
      }
      return scored.slug;
    } catch {
      return null;
    }
    });
  }

  /**
   * 4. جلب تفاصيل الأنمي والحلقات من الموقع الأساسي ww3.okanime.xyz أولاً، ثم الموقع المساعد animedar.net
   */
  public async getAnimeDetails(animeId: string, preferredSeasonNum?: number): Promise<any> {
    if (IS_EXTERNAL_FETCH_DISABLED) {
      return getCuratedAnimeById(animeId);
    }

    let cleanSlug = animeId;
    if (cleanSlug.includes('__ep__')) {
      cleanSlug = cleanSlug.split('__ep__')[0];
    }
    if (cleanSlug.startsWith('http')) {
      cleanSlug = this.extractAnimeSlugFromUrl(cleanSlug);
    }
    cleanSlug = cleanSlug.replace(/^\/+|\/+$/g, '');

    const cacheKey = `anime_okanime_primary_v1:${cleanSlug}:s${preferredSeasonNum || 'auto'}`;
    const cached = await this.getCached<any>(cacheKey);
    if (cached) return cached;

    return this.coalesceScrape(cacheKey, async () => {

    // 1. المحاولة من الموقع الأساسي #1: ww3.okanime.xyz
    try {
      const okHtml = await this.fetchOkanimeHtml(`/anime/${cleanSlug}`, 7500);
      const $ok = cheerio.load(okHtml);
      const parsed = this.parseOkanimeDocument($ok, cleanSlug);

      if (parsed.title && parsed.title.length > 1) {
        const seasonNumber = this.extractTargetSeasonNumber(parsed.rawTitle + ' ' + cleanSlug) || preferredSeasonNum || 1;
        const formattedEpisodes = parsed.episodes.map(ep => ({
          id: ep.id,
          num: ep.num,
          title: ep.title,
          link: ep.link,
          seasonNumber
        }));

        const seasonsData: SeasonEpisodesGroup[] = [];
        if (formattedEpisodes.length > 0) {
          seasonsData.push({
            seasonId: cleanSlug,
            seasonTitle: `الموسم ${seasonNumber}`,
            title: `الموسم ${seasonNumber}`,
            seasonNumber,
            episodes: formattedEpisodes
          });
        }

        const statusRaw = parsed.infoMap['الحالة'] || 'مستمر';
        let status = 'مستمر';
        if (statusRaw.includes('مكتمل') || statusRaw.toLowerCase().includes('completed')) status = 'مكتمل';
        else if (statusRaw.includes('قادم') || statusRaw.toLowerCase().includes('upcoming')) status = 'قادم';

        const result = {
          _id: cleanSlug,
          title: parsed.title,
          posterUrl: parsed.posterUrl || 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 300 420%22%3E%3Crect width=%22300%22 height=%22420%22 fill=%22%2312131c%22/%3E%3C/svg%3E',
          description: parsed.description,
          episodes: formattedEpisodes,
          seasonsList: seasonsData,
          genres: parsed.genres.length > 0 ? parsed.genres : ['أكشن', 'فانتازيا'],
          rating: parsed.rating,
          status,
          type: parsed.infoMap['النوع'] || 'TV',
          episodesCount: formattedEpisodes.length > 0 ? String(formattedEpisodes.length) : (parsed.infoMap['عدد الحلقات'] || '0'),
          releaseYear: parsed.infoMap['سنة العرض'] || '2025',
          season: parsed.infoMap['الموسم'] || '2025',
          duration: parsed.infoMap['مدة الحلقة'] || '24 د',
          studio: 'Studio'
        };

        await this.setCache(cacheKey, result, 30 * 60 * 1000);
        return result;
      }
    } catch {}

    // 2. الاحتياطي المساعد #2: animedar.net
    try {
      const html = await this.fetchAnimedarHtml(`/anime-p/${cleanSlug}/`);
      const $ = cheerio.load(html);
      const parsed = this.parseAnimedarDocument($, cleanSlug);

      if (parsed.title && parsed.title.length > 1) {
        const seasonNumber = this.extractTargetSeasonNumber(parsed.rawTitle + ' ' + cleanSlug) || preferredSeasonNum || 1;
        const formattedEpisodes = parsed.episodes.map(ep => ({
          id: ep.id,
          num: ep.num,
          title: ep.title,
          link: ep.link,
          seasonNumber
        }));

        const seasonsData: SeasonEpisodesGroup[] = [];
        if (formattedEpisodes.length > 0) {
          seasonsData.push({
            seasonId: cleanSlug,
            seasonTitle: `الموسم ${seasonNumber}`,
            title: `الموسم ${seasonNumber}`,
            seasonNumber,
            episodes: formattedEpisodes
          });
        }

        // حفظ سيرفرات كل حلقة مسبقاً في الكاش لفتح فوري
        for (const [epNum, epServers] of parsed.episodeServersByNum.entries()) {
          if (epServers.length > 0) {
            const epCompositeId = `${cleanSlug}__ep__${epNum}`;
            await this.setCache(`animedar_ep_servers_v2:${epCompositeId}`, epServers, 6 * 60 * 60 * 1000);
            await this.setCache(`animedar_ep_servers_v2:${cleanSlug}:${epNum}`, epServers, 6 * 60 * 60 * 1000);
          }
        }

        const statusRaw = parsed.infoMap['الحالة'] || $('.status').first().text().trim() || 'مستمر';
        let status = 'مستمر';
        if (statusRaw.includes('مكتمل') || statusRaw.toLowerCase().includes('completed')) status = 'مكتمل';
        else if (statusRaw.includes('قادم') || statusRaw.toLowerCase().includes('upcoming')) status = 'قادم';

        const result = {
          _id: cleanSlug,
          title: parsed.title,
          posterUrl: parsed.posterUrl || 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 300 420%22%3E%3Crect width=%22300%22 height=%22420%22 fill=%22%2312131c%22/%3E%3C/svg%3E',
          description: parsed.description,
          episodes: formattedEpisodes,
          seasonsList: seasonsData,
          genres: parsed.genres.length > 0 ? parsed.genres : ['أكشن', 'فانتازيا'],
          rating: parsed.rating,
          status,
          type: parsed.infoMap['النوع'] || 'TV',
          episodesCount: formattedEpisodes.length > 0 ? String(formattedEpisodes.length) : (parsed.infoMap['الحلقات'] || '0'),
          releaseYear: parsed.infoMap['تم الإصدار'] || parsed.infoMap['تاريخ الانتاج'] || '2025',
          season: parsed.infoMap['الموسم'] || '2025',
          studio: parsed.infoMap['الاستوديو'] || parsed.infoMap['الأستوديو'] || 'Studio'
        };

        await this.setCache(cacheKey, result, 30 * 60 * 1000);
        return result;
      }
    } catch {}

    return null;
    });
  }

  /**
   * البحث في الموقع المساعد animedar.net عن Slug عند اختلاف التسمية
   */
  private async searchAnimedarHelperSlug(query: string): Promise<string | null> {
    if (!query || !query.trim()) return null;
    try {
      const html = await this.fetchAnimedarHtml(`/?s=${encodeURIComponent(query.trim())}`, 5000);
      const $ = cheerio.load(html);
      const results: { slug: string; title: string; href: string; isUpcoming?: boolean }[] = [];
      $('article.bs, .listupd article').each((_, el) => {
        const href = $(el).find('a').first().attr('href') || '';
        const slug = this.extractAnimeSlugFromUrl(href);
        if (!slug) return;
        const title = ($(el).find('h2[itemprop="headline"], .tt h2').first().text() || '').replace(/\s+/g, ' ').trim();
        if (title && !results.some(r => r.slug === slug)) {
          results.push({ slug, title, href });
        }
      });
      return this.scoreSearchCandidates(query, results).slug;
    } catch {
      return null;
    }
  }

  private async extractAnimercoEpisodeServers(
    candidateTitles: string[],
    epNum: string | number,
    seasonNumber = 1
  ): Promise<EpisodeServer[]> {
    if (IS_EXTERNAL_FETCH_DISABLED) return [];
    const cleanEp = String(parseInt(String(epNum), 10) || epNum).trim();
    if (!cleanEp) return [];

    const queries: string[] = [];
    for (const t of candidateTitles) {
      const cleaned = this.cleanQueryForSearch(t);
      if (cleaned && cleaned.length >= 2 && !queries.includes(cleaned)) {
        queries.push(cleaned);
      }
    }

    const fetchAnimercoText = async (targetUrl: string, timeoutMs = 4500, referer?: string): Promise<string> => {
      const safe = await validateSafePublicHttpUrl(targetUrl);
      if (!safe) throw new Error('Unsafe Animerco URL');
      const headers: Record<string, string> = { ...this.defaultHeaders };
      if (referer) headers['Referer'] = referer;
      const res = await fetch(safe.toString(), {
        headers,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw new Error(`Animerco HTTP ${res.status}`);
      return await res.text();
    };

    let matchedAnimeUrl = '';
    for (const q of queries.slice(0, 3)) {
      try {
        const searchHtml = await fetchAnimercoText(`https://animerco.org/?s=${encodeURIComponent(q)}`, 4500);
        const $s = cheerio.load(searchHtml);
        const results: { slug: string; title: string; href: string }[] = [];
        $s('a[href*="/animes/"], a[href*="/movies/"]').each((_, el) => {
          const href = ($s(el).attr('href') || '').trim();
          if (!isSafePublicHttpUrl(href) || !href.includes('animerco.org')) return;
          const slug = this.extractAnimeSlugFromUrl(href);
          if (!slug || results.some(r => r.href === href)) return;
          const title = ($s(el).text() || $s(el).attr('title') || $s(el).find('img').attr('alt') || '').replace(/\s+/g, ' ').trim();
          results.push({ slug, title: title || slug, href });
        });
        if (results.length > 0) {
          const scored = this.scoreSearchCandidates(q, results);
          const chosen = results.find(r => r.slug === scored.slug) || results[0];
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
        const animeHtml = await fetchAnimercoText(matchedAnimeUrl, 4500);
        const $a = cheerio.load(animeHtml);
        const epRegex = new RegExp(`-(?:%d8%a7%d9%84%d8%ad%d9%84%d9%82%d8%a9|الحلقة|episode)-0*${cleanEp}(?:\\/|\\?|#|$)`, 'i');
        $a('a[href*="/episodes/"]').each((_, el) => {
          if (epPageUrl) return;
          const href = ($a(el).attr('href') || '').trim();
          let decoded = href;
          try { decoded = decodeURIComponent(href); } catch {}
          if ((epRegex.test(href) || epRegex.test(decoded)) && isSafePublicHttpUrl(href)) {
            epPageUrl = href;
          }
        });

        if (!epPageUrl) {
          const seasonLinks: string[] = [];
          $a('a[href*="/seasons/"]').each((_, el) => {
            const href = ($a(el).attr('href') || '').trim();
            if (href && isSafePublicHttpUrl(href) && !seasonLinks.includes(href)) {
              seasonLinks.push(href);
            }
          });
          if (seasonLinks.length > 0) {
            const targetSeason = Math.max(1, Number(seasonNumber) || 1);
            const targetSeasonUrl =
              seasonLinks.find(u => new RegExp(`(?:-|season-|s)${targetSeason}(?:\\/|$)`, 'i').test(u)) ||
              seasonLinks[targetSeason - 1] ||
              seasonLinks[0];
            const seasonHtml = await fetchAnimercoText(targetSeasonUrl, 4500);
            const $se = cheerio.load(seasonHtml);
            $se('a[href*="/episodes/"]').each((_, el) => {
              if (epPageUrl) return;
              const href = ($se(el).attr('href') || '').trim();
              let decoded = href;
              try { decoded = decodeURIComponent(href); } catch {}
              if ((epRegex.test(href) || epRegex.test(decoded)) && isSafePublicHttpUrl(href)) {
                epPageUrl = href;
              }
            });
          }
        }
      }
    } catch {}

    if (!epPageUrl || !isSafePublicHttpUrl(epPageUrl)) return [];

    try {
      const epHtml = await fetchAnimercoText(epPageUrl, 4500);
      const $e = cheerio.load(epHtml);
      const embeds: { embedUrl: string; label: string }[] = [];
      $e('a[data-embed-url]').each((_, el) => {
        const embedUrl = ($e(el).attr('data-embed-url') || '').replace(/&amp;/g, '&').trim();
        const label = $e(el).text().replace(/\s+/g, ' ').trim();
        if (!embedUrl || !isSafePublicHttpUrl(embedUrl)) return;
        if (/\bhqq\b|hqq\.|netu|waaw/i.test(label)) return;
        if (!embeds.some(e => e.embedUrl === embedUrl)) {
          embeds.push({ embedUrl, label });
        }
      });

      const resolved = await Promise.allSettled(
        embeds.slice(0, 6).map(async ({ embedUrl, label }) => {
          const playerHtml = await fetchAnimercoText(embedUrl, 3500, epPageUrl);
          const $p = cheerio.load(playerHtml);
          const iframeSrc = ($p('iframe').first().attr('src') || '').trim();
          if (!iframeSrc || !(await validateSafePublicHttpUrl(iframeSrc))) return null;
          if (iframeSrc.includes('hqq.') || iframeSrc.includes('waaw.')) return null;

          const serverName = this.normalizeOkanimeHostName(label, iframeSrc);
          const quality: EpisodeServer['quality'] = this.isMultiQualityWatchHost(serverName, iframeSrc)
            ? 'multi'
            : this.mapOkanimeQuality(label);
          return {
            serverName,
            url: iframeSrc,
            type: 'iframe',
            quality,
            category: 'watch',
          } as EpisodeServer;
        })
      );

      const out: EpisodeServer[] = [];
      for (const r of resolved) {
        if (r.status === 'fulfilled' && r.value && !out.some(x => x.url === r.value!.url)) {
          out.push(r.value);
        }
      }
      return out;
    } catch {
      return [];
    }
  }

  /**
   * 5. استخراج سيرفرات المشاهدة والتحميل للحلقة:
   * - أولاً (الأساسي #1): من ww3.okanime.xyz (سيرفرات المشاهدة [data-server] + روابط التحميل الحقيقية FHD/HD/SD)
   * - ثانياً (المساعد #2): الدمج التكميلي من animedar.net (فك تشفير #ServerList1 لضمان توفر أكبر قدر من المرايا البديلة)
   * - ثالثاً (البديل #3): animerco.org / jet.animerco.org عند تعذر المصدرين السابقين
   */
  public async getEpisodeServers(
    episodeId: string,
    animeId?: string,
    episodeNum?: string | number,
    seasonNumber?: number | string,
    animeTitle?: string,
    englishTitle?: string,
    romajiTitle?: string,
    okanimeSlug?: string
  ): Promise<EpisodeServer[]> {
    const rawInput = String(episodeId || '').trim();
    let jikanId = animeId ? String(animeId) : '';
    let epNum = episodeNum ? String(episodeNum) : '1';
    const explicitSeason = seasonNumber ? Number(seasonNumber) : 1;
    let directEpPath = '';

    if (rawInput.includes('/episode/')) {
      try {
        const u = rawInput.startsWith('http') ? new URL(rawInput) : new URL(rawInput, this.primaryOrigin);
        directEpPath = u.pathname;
        const epMatch = directEpPath.match(/-episode-(\d+)/i);
        if (epMatch && !episodeNum) epNum = epMatch[1];
      } catch {}
    }

    if (rawInput.includes('__ep__')) {
      const [slugPart, numPart] = rawInput.split('__ep__');
      if (numPart) epNum = numPart;
      if (slugPart && (!animeId || /^\d+$/.test(String(animeId)))) {
        animeId = slugPart;
      }
    } else if (rawInput.includes('-episode-') && !rawInput.startsWith('http')) {
      const match = rawInput.match(/^(.+?)-episode-(\d+)$/);
      if (match) {
        if (/^\d+$/.test(match[1]) && !jikanId) {
          jikanId = match[1];
        } else if (!animeId || /^\d+$/.test(String(animeId))) {
          animeId = match[1];
        }
        if (!episodeNum) epNum = match[2];
      }
    }

    const cacheKey = `servers_v9_okanime_fast:${episodeId}:${jikanId}:${okanimeSlug || ''}:${romajiTitle || animeTitle || englishTitle || ''}:${explicitSeason}:${epNum}`;
    const cachedServers = await this.getCached<EpisodeServer[]>(cacheKey);
    if (cachedServers && Array.isArray(cachedServers) && cachedServers.length > 0) {
      return cachedServers;
    }

    return this.coalesceScrape(cacheKey, async () => {
    try {
      let resolvedPrimarySlug = '';

      if (okanimeSlug && !/^\d+$/.test(String(okanimeSlug)) && !String(okanimeSlug).startsWith('search-')) {
        resolvedPrimarySlug = String(okanimeSlug).trim();
      } else if (rawInput.includes('__ep__')) {
        resolvedPrimarySlug = rawInput.split('__ep__')[0];
      } else if (rawInput.startsWith('http') || rawInput.includes('/episode/')) {
        resolvedPrimarySlug = this.extractAnimeSlugFromUrl(rawInput);
      } else if (animeId && !/^\d+$/.test(String(animeId)) && !String(animeId).startsWith('search-')) {
        resolvedPrimarySlug = String(animeId);
      }

      const candidateTitles: string[] = [];
      const pushCandidateTitle = (raw: unknown) => {
        const cleanT = typeof raw === 'string' ? raw.trim() : '';
        if (!cleanT) return;
        if (!candidateTitles.includes(cleanT)) candidateTitles.push(cleanT);
        const parts = cleanT.split(/[:\-–]/).map(s => s.trim()).filter(s => s.length >= 3);
        for (const part of parts) {
          if (!candidateTitles.includes(part)) candidateTitles.push(part);
        }
      };

      pushCandidateTitle(romajiTitle);
      pushCandidateTitle(englishTitle);
      pushCandidateTitle(animeTitle);
      if (resolvedPrimarySlug) {
        pushCandidateTitle(resolvedPrimarySlug.replace(/-/g, ' '));
      }

      const watchServers: EpisodeServer[] = [];
      const downloadServers: EpisodeServer[] = [];

      // 1. الجلب السريع والفوري من ww3.okanime.xyz (بدون انتظار AniList إذا توفر slug أو عنوان أو رابط مباشر)
      const [okanimeDirectResult, animedarCached] = await Promise.all([
        (resolvedPrimarySlug || directEpPath || candidateTitles.length > 0)
          ? this.extractOkanimeEpisodeServers(
              resolvedPrimarySlug,
              epNum,
              candidateTitles,
              directEpPath
            ).catch(() => ({ watch: [], download: [] }))
          : Promise.resolve({ watch: [] as EpisodeServer[], download: [] as EpisodeServer[] }),
        resolvedPrimarySlug
          ? this.getCached<EpisodeServer[]>(`animedar_ep_servers_v2:${resolvedPrimarySlug}__ep__${epNum}`)
              .then(res => res || this.getCached<EpisodeServer[]>(`animedar_ep_servers_v2:${resolvedPrimarySlug}:${epNum}`))
              .catch(() => null)
          : Promise.resolve(null)
      ]);

      for (const w of okanimeDirectResult.watch) {
        if (!watchServers.some(s => s.url === w.url)) watchServers.push(w);
      }
      for (const d of okanimeDirectResult.download) {
        if (!downloadServers.some(s => s.url === d.url && s.quality === d.quality)) downloadServers.push(d);
      }

      // 2. إذا لم نعثر على سيرفرات مشاهدة بعد، نحسم Romaji / Synonyms عبر AniList ثم نبحث في المصدر الأساسي
      if (watchServers.length === 0 && (jikanId || animeTitle || englishTitle)) {
        try {
          const { anilistService } = await import('./anilistService');
          const aniDetails = await Promise.race([
            jikanId && /^\d+$/.test(jikanId)
              ? anilistService.getAnimeFullDetails(jikanId).catch(() => null)
              : (englishTitle || animeTitle)
              ? anilistService.getAnimeFullDetails(String(englishTitle || animeTitle)).catch(() => null)
              : Promise.resolve(null),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 3500))
          ]);

          if (aniDetails?.anime?.mal_id && (!jikanId || !/^\d+$/.test(jikanId))) {
            jikanId = String(aniDetails.anime.mal_id);
          }

          const enTitle = aniDetails?.anime?.title_english || animeTitle || '';
          const aniRomaji = aniDetails?.anime?.title || '';
          const syns: string[] = Array.isArray(aniDetails?.anime?.title_synonyms) ? aniDetails.anime.title_synonyms : [];
          for (const t of [aniRomaji, enTitle, animeTitle || '', ...syns.slice(0, 3)]) {
            pushCandidateTitle(t);
          }

          if (!resolvedPrimarySlug) {
            for (const cand of candidateTitles.slice(0, 4)) {
              const foundSlug = await this.searchOkanimeSlug(cand).catch(() => null);
              if (foundSlug) {
                resolvedPrimarySlug = foundSlug;
                break;
              }
            }
          }

          const secondTry = await this.extractOkanimeEpisodeServers(
            resolvedPrimarySlug,
            epNum,
            candidateTitles,
            directEpPath
          ).catch(() => ({ watch: [], download: [] }));

          for (const w of secondTry.watch) {
            if (!watchServers.some(s => s.url === w.url)) watchServers.push(w);
          }
          for (const d of secondTry.download) {
            if (!downloadServers.some(s => s.url === d.url && s.quality === d.quality)) downloadServers.push(d);
          }
        } catch {}
      }

      // 3. دمج كاش animedar السريع إذا توفر، أو جلبه (بمهلة قصيرة 3 ثوانٍ) فقط عند غياب سيرفرات المشاهدة من الأساسي
      let darServers = animedarCached;
      if ((!darServers || darServers.length === 0) && watchServers.length === 0) {
        const darSlug = resolvedPrimarySlug;
        const tryFetchDar = async (slugToTry: string): Promise<EpisodeServer[]> => {
          if (!slugToTry) return [];
          const html = await this.fetchAnimedarHtml(`/anime-p/${slugToTry}/`, 3000);
          const $ = cheerio.load(html);
          const parsed = this.parseAnimedarDocument($, slugToTry);
          if (parsed.title && !candidateTitles.includes(parsed.title)) {
            candidateTitles.unshift(parsed.title);
          }
          for (const [eNum, eSrvs] of parsed.episodeServersByNum.entries()) {
            if (eSrvs.length > 0) {
              await this.setCache(`animedar_ep_servers_v2:${slugToTry}__ep__${eNum}`, eSrvs, 6 * 60 * 60 * 1000);
              await this.setCache(`animedar_ep_servers_v2:${slugToTry}:${eNum}`, eSrvs, 6 * 60 * 60 * 1000);
            }
          }
          return parsed.episodeServersByNum.get(String(epNum)) || [];
        };

        try {
          if (darSlug) {
            darServers = await tryFetchDar(darSlug).catch(() => []);
          }
          if ((!darServers || darServers.length === 0) && candidateTitles.length > 0) {
            const searchedDarSlug = await Promise.race([
              this.searchAnimedarHelperSlug(candidateTitles[0]).catch(() => null),
              new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000))
            ]);
            if (searchedDarSlug && searchedDarSlug !== darSlug) {
              darServers = await tryFetchDar(searchedDarSlug).catch(() => []);
            }
          }
        } catch {}
      }

      if (darServers && darServers.length > 0) {
        for (const srv of darServers) {
          if (srv.category === 'watch' && !watchServers.some(s => s.url === srv.url)) {
            watchServers.push(srv);
          } else if (srv.category === 'download' && !downloadServers.some(s => s.url === srv.url && s.quality === srv.quality)) {
            downloadServers.push(srv);
          }
        }
      }

      // 4. المصدر الثالث #3: animerco.org / jet.animerco.org عند فشل OkAnime و AnimeDar
      if (watchServers.length === 0 && downloadServers.length === 0 && candidateTitles.length > 0) {
        const animercoServers = await this.extractAnimercoEpisodeServers(
          candidateTitles,
          epNum,
          explicitSeason
        ).catch(() => []);
        for (const srv of animercoServers) {
          if (!watchServers.some(s => s.url === srv.url)) {
            watchServers.push(srv);
          }
        }
      }

      const isAdShortenerUrl = (u: string): boolean => {
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
          lower.includes('earn') ||
          lower.includes('clicksfly') ||
          lower.includes('sh.st')
        );
      };

      for (const w of watchServers) {
        if (this.isMultiQualityWatchHost(w.serverName, w.url)) {
          w.quality = 'multi';
        }
      }

      const getServerReliabilityScore = (server: EpisodeServer): number => {
        const lowerName = (server.serverName || '').toLowerCase();
        const lowerUrl = (server.url || '').toLowerCase();

        // Multi-quality in-player servers appear first at the top
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
      };

      for (const w of watchServers) {
        const lower = w.url.toLowerCase();
        let dlUrl = '';
        if (lower.includes('mega.nz/embed/')) dlUrl = w.url.replace('/embed/', '/file/');
        else if (lower.includes('4shared.com/web/embed/file/')) dlUrl = w.url.replace('/web/embed/file/', '/get/');
        else if (lower.includes('mp4upload.com/embed-')) dlUrl = w.url.replace('/embed-', '/').replace(/\.html$/i, '');
        else if (lower.includes('asnwish.com/e/')) dlUrl = w.url.replace('/e/', '/f/');
        else if (lower.includes('ok.ru/videoembed/')) dlUrl = w.url.replace('/videoembed/', '/video/');
        else if (lower.includes('drive.google.com/file/d/')) {
          const m = w.url.match(/\/d\/([A-Za-z0-9_-]+)/);
          if (m) dlUrl = `https://drive.google.com/u/0/uc?id=${m[1]}&export=download`;
        } else if (lower.includes('videa.hu/player')) dlUrl = w.url;
        else if (lower.includes('vidmoly') && lower.includes('/embed-')) dlUrl = w.url.replace('/embed-', '/');
        else if (lower.includes('uqload') && lower.includes('/embed-')) dlUrl = w.url.replace('/embed-', '/');
        else if (lower.includes('yourupload.com/embed/')) dlUrl = w.url.replace('/embed/', '/watch/');

        if (dlUrl && !downloadServers.some(d => d.url === dlUrl)) {
          downloadServers.push({
            serverName: w.serverName,
            url: dlUrl,
            type: 'direct',
            quality: w.quality,
            category: 'download'
          });
        }
      }

      watchServers.sort((a, b) => getServerReliabilityScore(b) - getServerReliabilityScore(a));

      const cleanDownloadServers = downloadServers
        .filter(d => !isAdShortenerUrl(d.url))
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
        watchServers.find(s => isDirectMp4Host(s.url))?.url ||
        cleanDownloadServers.find(s => isDirectMp4Host(s.url))?.url ||
        watchServers[0]?.url ||
        '';
      const safeTitle = (animeTitle || candidateTitles[0] || 'Anime').replace(/["'<>]/g, '').trim();
      const extraDownloads: EpisodeServer[] = bestDirectWatch
        ? [
            {
              serverName: 'تحميل مباشر',
              url: `/api/anime/download?url=${encodeURIComponent(bestDirectWatch)}&title=${encodeURIComponent(safeTitle)}&ep=${epNum}`,
              type: 'direct',
              quality: '1080p',
              category: 'download'
            }
          ]
        : [];

      const finalServers: EpisodeServer[] = [
        ...watchServers,
        ...extraDownloads,
        ...cleanDownloadServers
      ];

      if (finalServers.length > 0) {
        await this.setCache(cacheKey, finalServers, 10 * 60 * 1000);
      }
      return finalServers;
    } catch {
      return [];
    }
    });
  }
}
