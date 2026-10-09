import * as cheerio from 'cheerio';
import { serverCache } from './cacheService';
import { cleanAnimeTitle } from '../utils/animeTitleCleaner';
import {
  CURATED_ANIME_LIST,
  getCuratedAnimeById
} from '../data/curatedAnimeDatabase';

export const IS_EXTERNAL_FETCH_DISABLED = false; // محرك الجلب المزدوج: animedar.net (أساسي #1) + ristoanime.me (ثانوي #2)

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
  quality?: '1080p' | '720p' | '480p' | 'auto';
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
 * 1. باني روابط سيرفرات المشاهدة والتحميل لموقع animedar.net (الموقع الأساسي #1)
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
  const type = (rawType || '').trim().toLowerCase();
  const id = (rawId || '').trim();
  const qLower = (rawQuality || '').trim().toLowerCase();
  if (!id) return null;

  let quality: '1080p' | '720p' | '480p' | 'auto' = '1080p';
  if (qLower === 'fhd' || qLower === '1080p' || qLower === '1080') {
    quality = '1080p';
  } else if (qLower === 'hd' || qLower === '720p' || qLower === '720') {
    quality = '720p';
  } else if (qLower === 'sd' || qLower === '480p' || qLower === '480' || qLower === 'low') {
    quality = '480p';
  }

  let serverName = type.toUpperCase();
  let watchUrl = '';
  let downloadUrl = '';

  if (id.startsWith('http://') || id.startsWith('https://')) {
    watchUrl = id;
    downloadUrl = id;
    if (id.includes('mega.nz')) serverName = 'Mega';
    else if (id.includes('ok.ru')) serverName = 'Ok.ru';
    else if (id.includes('videa.hu')) serverName = 'Videa';
    else if (id.includes('mp4upload')) serverName = 'MP4Upload';
    else if (id.includes('4shared')) serverName = '4Shared';
    else if (id.includes('dailymotion')) serverName = 'Dailymotion';
    else if (id.includes('drive.google')) serverName = 'Google Drive';
    else if (id.includes('vidmoly')) serverName = 'Vidmoly';
    else if (id.includes('uqload')) serverName = 'Uqload';
    else if (id.includes('filemoon')) serverName = 'Filemoon';
    else if (id.includes('dood') || id.includes('d000')) serverName = 'DoodStream';
    else if (id.includes('wish') || id.includes('asnwish')) serverName = 'Streamwish';
    return { serverName, watchUrl, downloadUrl, quality };
  }

  switch (type) {
    case 'mega':
      serverName = 'Mega';
      watchUrl = `https://mega.nz/embed/${id}`;
      downloadUrl = `https://mega.nz/file/${id}`;
      break;
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
    case 'mp4upload':
      serverName = 'MP4Upload';
      watchUrl = `https://www.mp4upload.com/embed-${id}.html`;
      downloadUrl = `https://www.mp4upload.com/${id}`;
      break;
    case '4shared':
      serverName = '4Shared';
      watchUrl = `https://www.4shared.com/web/embed/file/${id}`;
      downloadUrl = `https://www.4shared.com/video/${id}`;
      break;
    case 'asnwish':
    case 'streamwish':
    case 'wish':
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
    case 'drive':
      serverName = 'Google Drive';
      watchUrl = `https://drive.google.com/file/d/${id}/preview`;
      downloadUrl = `https://drive.google.com/uc?id=${id}&export=download`;
      break;
    case 'uqload':
      serverName = 'Uqload';
      watchUrl = `https://uqload.io/embed-${id}.html`;
      downloadUrl = `https://uqload.io/${id}.html`;
      break;
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
    case 'vidmoly':
      serverName = 'Vidmoly';
      watchUrl = `https://vidmoly.to/embed-${id}.html`;
      downloadUrl = `https://vidmoly.to/${id}.html`;
      break;
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
    default:
      return null;
  }

  return { serverName, watchUrl, downloadUrl, quality };
}

export class ScraperService {
  // 1. الموقع الأساسي الأول (#1 Primary): https://animedar.net
  private readonly primaryOrigin = 'https://animedar.net';

  // 2. الموقع الثانوي الاحتياطي (#2 Secondary): https://ristoanime.me (ومرآته ristoanime.co)
  private readonly secondaryMirrors = [
    'https://ristoanime.me',
    'https://ristoanime.co'
  ];

  private readonly defaultHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'ar-EG,ar;q=0.9,en-US;q=0.8,en;q=0.7',
  };

  /**
   * جلب HTML من الموقع الأساسي animedar.net
   */
  private async fetchAnimedarHtml(path: string, timeoutMs = 5500): Promise<string> {
    if (IS_EXTERNAL_FETCH_DISABLED) {
      throw new Error('External web scraping is paused.');
    }
    let cleanPath = path.startsWith('/') ? path : '/' + path;
    if (cleanPath.startsWith('/anime/')) {
      cleanPath = cleanPath.replace(/^\/anime\//, '/anime-p/');
    }

    const res = await fetch(`${this.primaryOrigin}${cleanPath}`, {
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

  /**
   * جلب HTML من الموقع الثانوي الاحتياطي RistoAnime (ristoanime.me / ristoanime.co)
   */
  private async fetchRistoHtml(path: string, timeoutMs = 5500): Promise<{ html: string; baseUrl: string }> {
    if (IS_EXTERNAL_FETCH_DISABLED) {
      throw new Error('External web scraping is paused.');
    }
    const cleanPath = path.startsWith('/') ? path : '/' + path;
    let lastError: any = null;

    for (const baseUrl of this.secondaryMirrors) {
      try {
        const res = await fetch(`${baseUrl}${cleanPath}`, {
          headers: this.defaultHeaders,
          signal: AbortSignal.timeout(timeoutMs)
        });
        if (res.ok) {
          const text = await res.text();
          if (text.length > 5000) {
            return { html: text, baseUrl };
          }
        }
      } catch (err: any) {
        lastError = err;
      }
    }

    throw new Error(`RistoAnime secondary mirrors failed: ${lastError?.message || lastError}`);
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
      const animeIdx = parts.findIndex(p => p === 'anime-p' || p === 'anime' || p === 'series');
      if (animeIdx !== -1 && parts[animeIdx + 1]) {
        return parts[animeIdx + 1];
      }
      return parts.pop() || '';
    } catch {
      return href.split('/').filter(Boolean).pop() || '';
    }
  }

  /**
   * تحليل صفحة أنمي من الموقع الأساسي animedar.net
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
          if (!watchServers.some(s => s.url === built.watchUrl)) {
            watchServers.push({
              serverName: built.serverName,
              url: built.watchUrl,
              type: 'iframe',
              quality: built.quality,
              category: 'watch'
            });
          }
          if (!downloadServers.some(s => s.url === built.downloadUrl && s.quality === built.quality)) {
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
          link: `${this.primaryOrigin}/anime-p/${rawSlug}/?ep=${epNum}`,
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
   * استخراج سيرفرات المشاهدة والتحميل من الموقع الثانوي الاحتياطي RistoAnime
   */
  private async extractRistoServersBySlug(epSlug: string): Promise<{ watch: EpisodeServer[]; download: EpisodeServer[] }> {
    const watch: EpisodeServer[] = [];
    const download: EpisodeServer[] = [];

    const cleanSlug = epSlug.replace(/^\/+|\/+$/g, '').replace(/\/(watch|download)$/i, '');
    if (!cleanSlug) return { watch, download };

    const [watchRes, dlRes] = await Promise.allSettled([
      this.fetchRistoHtml(`/${cleanSlug}/watch`, 4500),
      this.fetchRistoHtml(`/${cleanSlug}/download`, 4500)
    ]);

    if (watchRes.status === 'fulfilled' && watchRes.value?.html) {
      const $w = cheerio.load(watchRes.value.html);
      $w('[data-watch], [data-ep-url]').each((idx, el) => {
        let serverUrl = ($w(el).attr('data-watch') || $w(el).attr('data-ep-url') || '').trim();
        if (!serverUrl || !serverUrl.startsWith('http')) return;
        const lowerUrl = serverUrl.toLowerCase();

        // تنظيف الروابط في RistoAnime
        if (lowerUrl.includes('mega.nz') && serverUrl.endsWith('.html')) {
          serverUrl = serverUrl.replace(/\.html$/i, '');
        }
        if (lowerUrl.includes('uqload.') && serverUrl.includes('?')) {
          serverUrl = serverUrl.split('?')[0];
          if (!serverUrl.endsWith('.html')) serverUrl += '.html';
        }

        let serverName = `Server ${idx + 1}`;
        let quality: '1080p' | '720p' | '480p' | 'auto' = '1080p';

        if (lowerUrl.includes('vidmoly')) { serverName = 'Vidmoly'; quality = '1080p'; }
        else if (lowerUrl.includes('mega.nz')) { serverName = 'Mega'; quality = '1080p'; }
        else if (lowerUrl.includes('upns.online') || lowerUrl.includes('risto')) { serverName = 'Risto'; quality = '1080p'; }
        else if (lowerUrl.includes('sendvid')) { serverName = 'Sendvid'; quality = '720p'; }
        else if (lowerUrl.includes('mp4upload')) { serverName = 'MP4Upload'; quality = '720p'; }
        else if (lowerUrl.includes('uqload')) { serverName = 'Uqload'; quality = '720p'; }
        else if (lowerUrl.includes('streamwish') || lowerUrl.includes('awish') || lowerUrl.includes('swish')) { serverName = 'Streamwish'; quality = '720p'; }
        else if (lowerUrl.includes('filemoon')) { serverName = 'Filemoon'; quality = '1080p'; }
        else if (lowerUrl.includes('ok.ru')) { serverName = 'Ok.ru'; quality = '720p'; }
        else if (lowerUrl.includes('drive.google')) { serverName = 'Google Drive'; quality = '1080p'; }

        if (!watch.some(s => s.url === serverUrl)) {
          watch.push({
            serverName,
            url: serverUrl,
            type: 'iframe',
            quality,
            category: 'watch'
          });
        }
      });
    }

    if (dlRes.status === 'fulfilled' && dlRes.value?.html) {
      const $d = cheerio.load(dlRes.value.html);
      $d('a[href^="http"]').each((_, el) => {
        const href = ($d(el).attr('href') || '').trim();
        if (!href) return;
        const lowerHref = href.toLowerCase();
        if (
          lowerHref.includes('ristoanime.') ||
          lowerHref.includes('facebook.') ||
          lowerHref.includes('twitter.') ||
          lowerHref.includes('t.me') ||
          lowerHref.includes('discord') ||
          lowerHref.includes('wordpress.')
        ) {
          return;
        }

        let hostName = 'Download';
        let quality: '1080p' | '720p' | '480p' | 'auto' = '1080p';
        if (lowerHref.includes('mega.nz')) { hostName = 'Mega'; quality = '1080p'; }
        else if (lowerHref.includes('mp4upload')) { hostName = 'MP4Upload'; quality = '1080p'; }
        else if (lowerHref.includes('vidmoly')) { hostName = 'Vidmoly'; quality = '1080p'; }
        else if (lowerHref.includes('uqload')) { hostName = 'Uqload'; quality = '720p'; }
        else if (lowerHref.includes('mediafire')) { hostName = 'MediaFire'; quality = '720p'; }
        else if (lowerHref.includes('drive.google')) { hostName = 'Google Drive'; quality = '1080p'; }

        if (!download.some(s => s.url === href)) {
          download.push({
            serverName: hostName,
            url: href,
            type: 'direct',
            quality,
            category: 'download'
          });
        }
      });
    }

    return { watch, download };
  }

  /**
   * البحث في الموقع الثانوي RistoAnime عن أنمي أو حلقة
   */
  private async searchRistoAnime(query: string): Promise<string | null> {
    try {
      const { html } = await this.fetchRistoHtml(`/?s=${encodeURIComponent(query.trim())}`, 4500);
      const $ = cheerio.load(html);
      let foundSeriesSlug: string | null = null;
      let foundEpSlug: string | null = null;

      $('.MovieItem a, .BlocksHolder a').each((_, el) => {
        const href = $(el).attr('href') || '';
        if (!href.startsWith('http')) return;
        if (href.includes('/genre/') || href.includes('/anime-type/') || href.includes('/release-year/')) return;
        const slug = href.split('/').filter(Boolean).pop() || '';
        if (!slug) return;
        if (href.includes('/series/') && !foundSeriesSlug) {
          foundSeriesSlug = slug;
        } else if (!foundEpSlug) {
          foundEpSlug = slug;
        }
      });

      return foundSeriesSlug || foundEpSlug;
    } catch {
      return null;
    }
  }

  /**
   * فك تشفير صندوق "الأكثر شعبية اليوم" (#hot-widget-wrapper[data-encrypted]) من الموقع الأساسي animedar.net
   * معزول تماماً عن قسم أحدث الحلقات لمنع أي تداخل بين الأقسام
   */
  public async getPopularToday(forceBypass = false): Promise<AnimeItem[]> {
    const cacheKey = 'popular_today_animedar_v1';
    if (!forceBypass) {
      const cached = await this.getCached<AnimeItem[]>(cacheKey);
      if (cached && cached.length > 0) return cached;
    }

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
          link: `${this.primaryOrigin}/anime-p/${slug}/`,
          imageUrl: img,
          rating: 8.8
        });
      });

      if (items.length > 0) {
        await this.setCache(cacheKey, items, 30 * 60 * 1000);
      }
      return items;
    } catch {
      return [];
    }
  }

  /**
   * 1. أحدث الحلقات المترجمة (معزولة بنسبة 100% من صندوق .bixbox.ongoing فقط في animedar.net)
   * تدعم التصفح عبر الصفحات (page = 1, 2, 3...) تماماً مثل زر "التالي" و"السابق" في الموقع الرئيسي
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

    const cacheKey = `recent_episodes_animedar_isolated_v3_page_${safePage}`;
    if (forceBypass) {
      await serverCache.delete(cacheKey);
      if (safePage === 1) {
        await serverCache.delete('recent_episodes');
      }
    } else {
      const cached = await this.getCached<AnimeItem[]>(cacheKey);
      if (cached && Array.isArray(cached) && cached.length > 0) return cached;
    }

    try {
      // 1. الجلب المباشر من الموقع الأساسي #1 (animedar.net) للصفحة المطلوبة (/ أو /page/N/)
      const targetDarPath = safePage > 1 ? `/page/${safePage}/` : '/';
      const darHtml = await this.fetchAnimedarHtml(targetDarPath, 5500).catch(() => '');
      const validItems: AnimeItem[] = [];
      const seenSlugs = new Set<string>();

      if (darHtml) {
        const $dar = cheerio.load(darHtml);
        // استهداف حصري لصندوق .bixbox.ongoing (الانمي المستمر) وتجاهل #hot-widget-wrapper وصندوق التوصية
        $dar('.bixbox.ongoing article.bs').each((_, el) => {
          const href = $dar(el).find('a').first().attr('href') || '';
          const slug = this.extractAnimeSlugFromUrl(href);
          if (!slug || seenSlugs.has(slug)) return;

          const dataStatus = ($dar(el).find('.typez').attr('data-status') || '').trim();
          const btText = $dar(el).find('.bt, .status, .epx').text().trim();
          const typeText = $dar(el).find('.typez').text().trim();

          // استبعاد الأنميات القادمة والأفلام بشكل قاطع
          if (
            dataStatus.includes('قادم') ||
            btText.includes('قادم') ||
            typeText.includes('فيلم') ||
            typeText.toLowerCase().includes('movie')
          ) {
            return;
          }

          // قراءة رقم الحلقة الحقيقي مباشرة من .ep-number span
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
            link: `${this.primaryOrigin}/anime-p/${slug}/?ep=${epNum}`,
            imageUrl: img,
            rating: 8.5
          });
        });
      }

      // 2. إذا تعذر الوصول للموقع الأساسي فقط، نستخدم الموقع الثانوي الاحتياطي #2 (ristoanime.me)
      if (validItems.length === 0) {
        const targetRistoPath = safePage > 1 ? `/page/${safePage}/` : '/';
        const ristoHome = await this.fetchRistoHtml(targetRistoPath, 5000);
        const $r = cheerio.load(ristoHome.html);
        $r('.MovieItem a').each((_, el) => {
          const link = ($r(el).attr('href') || '').trim();
          if (!link || link.includes('/series/') || link.includes('/movies/')) return;

          const rawTitle =
            $r(el).attr('title') ||
            $r(el).find('h4, h3, .title').first().text().trim() ||
            '';
          if (!rawTitle) return;

          const epMatch = rawTitle.match(/الحلقة\s*(\d+)/) || decodeURIComponent(link).match(/الحلقة-(\d+)/);
          if (!epMatch) return;

          const epNum = epMatch[1];
          const cleanedTitle = cleanAnimeTitle(
            rawTitle
              .replace(/^مشاهدة\s*/i, '')
              .replace(/^انمي\s*/i, '')
              .replace(/الحلقة\s*\d+.*$/i, '')
              .trim()
          );
          if (!cleanedTitle || cleanedTitle.length < 2) return;

          const styleAttr = $r(el).find('[style*="background"]').attr('style') || $r(el).attr('style') || '';
          const bgMatch = styleAttr.match(/url\(['"]?(.*?)['"]?\)/);
          const img = bgMatch ? bgMatch[1] : ($r(el).find('img').attr('src') || $r(el).find('img').attr('data-src') || '');

          const ristoEpSlug = link.split('/').filter(Boolean).pop() || '';
          if (!ristoEpSlug || seenSlugs.has(ristoEpSlug)) return;

          seenSlugs.add(ristoEpSlug);
          validItems.push({
            id: `risto__${ristoEpSlug}`,
            title: cleanedTitle,
            episode: epNum,
            link,
            imageUrl: img,
            rating: 8.4
          });
        });
      }

      if (validItems.length > 0) {
        await this.setCache(cacheKey, validItems, 15 * 60 * 1000);
        if (safePage === 1) {
          await this.setCache('recent_episodes', validItems, 15 * 60 * 1000);
        }
        return validItems;
      }

      throw new Error('No recent episodes found from Animedar or RistoAnime');
    } catch (error: any) {
      if (safePage > 1) return [];
      return CURATED_ANIME_LIST.map((anime) => ({
        id: String(anime.mal_id),
        title: anime.title_english || anime.title,
        episode: String(anime.latestEpisode),
        link: `/anime/${anime.mal_id}/episode/${anime.latestEpisode}`,
        imageUrl: anime.posterUrl,
        rating: anime.rating
      }));
    }
  }

  /**
   * 2. جدول المواعيد
   */
  public async getSchedule(): Promise<AnimeItem[]> {
    const cacheKey = 'schedule_animedar_v1';
    const cached = await this.getCached<AnimeItem[]>(cacheKey);
    if (cached && cached.length > 0) return cached;

    try {
      const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const currentDay = days[new Date().getDay()];
      const { anilistService } = await import('./anilistService');
      const aniSchedule = await anilistService.getScheduleByDay(currentDay).catch(() => []);
      if (aniSchedule && aniSchedule.length > 0) {
        const items: AnimeItem[] = aniSchedule.map((anime: any) => ({
          id: String(anime.mal_id),
          title: anime.title_english || anime.title,
          episode: String(anime.EpisodeNumber || 1),
          link: `/anime/${anime.mal_id}/`,
          imageUrl: anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url || '',
          rating: anime.score || 8.0
        }));
        await this.setCache(cacheKey, items, 30 * 60 * 1000);
        return items;
      }
    } catch {}

    return [];
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

  /**
   * 3. البحث الذكي في الموقع الأساسي animedar.net أولاً، ثم الموقع الثانوي ristoanime.me كاحتياطي
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
    const cacheKey = `search_animedar_v1:${normalizedKey}`;
    const cached = await this.getCached<string | null>(cacheKey);
    if (cached !== null) return cached;

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
        // محاولة البحث في الموقع الثانوي RistoAnime
        const ristoMatch = await this.searchRistoAnime(query);
        if (ristoMatch) {
          const tagged = `risto__${ristoMatch}`;
          await this.setCache(cacheKey, tagged, 12 * 60 * 60 * 1000);
          return tagged;
        }
        return null;
      }

      const cleanQuery = this.cleanQueryForSearch(query).toLowerCase().replace(/[^a-z0-9\s\u0600-\u06FF]/g, '').trim() || query.toLowerCase().trim();
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

      if (bestSlug) {
        await this.setCache(cacheKey, bestSlug, 24 * 60 * 60 * 1000);
      }
      return bestSlug;
    } catch {
      const ristoMatch = await this.searchRistoAnime(query);
      return ristoMatch ? `risto__${ristoMatch}` : null;
    }
  }

  /**
   * 4. جلب تفاصيل الأنمي والحلقات من الموقع الأساسي animedar.net (مع دعم الموقع الثانوي RistoAnime)
   */
  public async getAnimeDetails(animeId: string, preferredSeasonNum?: number): Promise<any> {
    if (IS_EXTERNAL_FETCH_DISABLED) {
      return getCuratedAnimeById(animeId);
    }

    let cleanSlug = animeId;
    if (cleanSlug.startsWith('risto__')) {
      cleanSlug = cleanSlug.replace(/^risto__/, '');
    }
    if (cleanSlug.includes('__ep__')) {
      cleanSlug = cleanSlug.split('__ep__')[0];
    }
    if (cleanSlug.startsWith('http')) {
      cleanSlug = this.extractAnimeSlugFromUrl(cleanSlug);
    }
    cleanSlug = cleanSlug.replace(/^\/+|\/+$/g, '');

    const cacheKey = `anime_animedar_v1:${cleanSlug}:s${preferredSeasonNum || 'auto'}`;
    const cached = await this.getCached<any>(cacheKey);
    if (cached) return cached;

    // 1. المحاولة من الموقع الأساسي #1: animedar.net
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

        // حفظ سيرفرات كل حلقة مسبقاً في الكاش لفتح فوري (0ms)
        for (const [epNum, epServers] of parsed.episodeServersByNum.entries()) {
          if (epServers.length > 0) {
            const epCompositeId = `${cleanSlug}__ep__${epNum}`;
            await this.setCache(`animedar_ep_servers:${epCompositeId}`, epServers, 6 * 60 * 60 * 1000);
            await this.setCache(`animedar_ep_servers:${cleanSlug}:${epNum}`, epServers, 6 * 60 * 60 * 1000);
          }
        }

        const statusRaw = parsed.infoMap['الحالة'] || $('.status').first().text().trim() || 'مستمر';
        let status = 'مستمر';
        if (statusRaw.includes('مكتمل') || statusRaw.toLowerCase().includes('completed')) status = 'مكتمل';
        else if (statusRaw.includes('قادم') || statusRaw.toLowerCase().includes('upcoming')) status = 'قادم';

        const result = {
          _id: cleanSlug,
          title: parsed.title,
          posterUrl: parsed.posterUrl || 'https://via.placeholder.com/300x400?text=No+Poster',
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

    // 2. الاحتياطي الثانوي #2: RistoAnime
    try {
      let ristoFetched: { html: string; baseUrl: string };
      try {
        ristoFetched = await this.fetchRistoHtml(`/series/${cleanSlug}/`);
      } catch {
        ristoFetched = await this.fetchRistoHtml(`/${cleanSlug}/`);
      }

      const $r = cheerio.load(ristoFetched.html);
      const rawTitle = $r('meta[property="og:title"]').attr('content') || $r('h1').first().text().trim() || cleanSlug;
      const title = cleanAnimeTitle(rawTitle.replace(/^RISTO/i, '').trim());
      if (!title || title.length <= 1) return null;

      const episodes: { id: string; num: string; title: string; link: string; seasonNumber?: number }[] = [];
      $r('.EpisodesList a, div.EpisodesList a').each((_, el) => {
        const href = $r(el).attr('href') || '';
        const txt = $r(el).text().replace(/\s+/g, ' ').trim();
        const m = txt.match(/(\d+)/);
        const num = m ? m[1] : '1';
        const epSlug = href.split('/').filter(Boolean).pop() || '';
        if (epSlug && !episodes.some(e => e.num === num)) {
          episodes.push({
            id: `risto__${epSlug}`,
            num,
            title: `الحلقة ${num}`,
            link: href,
            seasonNumber: preferredSeasonNum || 1
          });
        }
      });

      episodes.sort((a, b) => (parseInt(a.num, 10) || 0) - (parseInt(b.num, 10) || 0));

      const result = {
        _id: cleanSlug,
        title,
        posterUrl: $r('meta[property="og:image"]').attr('content') || '',
        description: $r('.Story, .story, .SingleStory').first().text().trim() || '',
        episodes,
        seasonsList: episodes.length > 0 ? [{
          seasonId: cleanSlug,
          seasonTitle: `الموسم ${preferredSeasonNum || 1}`,
          title: `الموسم ${preferredSeasonNum || 1}`,
          seasonNumber: preferredSeasonNum || 1,
          episodes
        }] : [],
        genres: ['أكشن', 'فانتازيا'],
        rating: 8.4,
        status: 'مستمر',
        type: 'TV',
        episodesCount: String(episodes.length || 12),
        releaseYear: '2025',
        season: '2025'
      };

      await this.setCache(cacheKey, result, 30 * 60 * 1000);
      return result;
    } catch {
      return null;
    }
  }

  /**
   * 5. استخراج سيرفرات المشاهدة والتحميل للحلقة:
   * - أولاً: من الموقع الأساسي #1 (animedar.net - فك تشفير #ServerList1 المباشر)
   * - ثانياً: من الموقع الثانوي #2 (ristoanime.me - سحب /watch و /download)
   * - ثالثاً: سيرفرات عالمية احتياطية إضافية
   */
  public async getEpisodeServers(
    episodeId: string,
    animeId?: string,
    episodeNum?: string | number,
    seasonNumber?: number | string,
    animeTitle?: string
  ): Promise<EpisodeServer[]> {
    let jikanId = animeId ? String(animeId) : '';
    let epNum = episodeNum ? String(episodeNum) : '1';
    const explicitSeason = seasonNumber ? Number(seasonNumber) : undefined;

    if (episodeId.includes('__ep__')) {
      const [slugPart, numPart] = episodeId.split('__ep__');
      if (numPart) epNum = numPart;
      if (slugPart && (!animeId || /^\d+$/.test(String(animeId)))) {
        animeId = slugPart;
      }
    } else if (episodeId.includes('-episode-')) {
      const match = episodeId.match(/^(\d+)-episode-(\d+)$/);
      if (match) {
        if (!jikanId) jikanId = match[1];
        if (!episodeNum) epNum = match[2];
      }
    }

    const cacheKey = `servers_animedar_risto_v1:${episodeId}:${jikanId}:${explicitSeason || 1}:${epNum}`;
    const cached = await this.getCached<EpisodeServer[]>(cacheKey);
    if (cached && cached.length > 0) return cached;

    try {
      let resolvedAnimedarSlug = '';
      let resolvedRistoEpSlug = '';

      if (episodeId.startsWith('risto__')) {
        resolvedRistoEpSlug = episodeId.replace(/^risto__/, '');
      } else if (episodeId.includes('__ep__')) {
        resolvedAnimedarSlug = episodeId.split('__ep__')[0];
      } else if (episodeId.startsWith('http')) {
        if (episodeId.includes('ristoanime.')) {
          resolvedRistoEpSlug = episodeId.split('/').filter(Boolean).pop() || '';
        } else {
          resolvedAnimedarSlug = this.extractAnimeSlugFromUrl(episodeId);
        }
      } else if (animeId && !/^\d+$/.test(String(animeId)) && !String(animeId).startsWith('search-')) {
        resolvedAnimedarSlug = String(animeId);
      }

      let resolvedAnilistId = '';
      let candidateTitles: string[] = [];

      if (jikanId || animeTitle || !resolvedAnimedarSlug) {
        try {
          const { anilistService } = await import('./anilistService');
          const aniDetails = jikanId && /^\d+$/.test(jikanId)
            ? await anilistService.getAnimeFullDetails(jikanId).catch(() => null)
            : animeTitle
            ? await anilistService.getAnimeFullDetails(animeTitle).catch(() => null)
            : null;

          if (aniDetails?.anime?.anilist_id) {
            resolvedAnilistId = String(aniDetails.anime.anilist_id);
          }
          if (aniDetails?.anime?.mal_id && (!jikanId || !/^\d+$/.test(jikanId))) {
            jikanId = String(aniDetails.anime.mal_id);
          }

          const enTitle = aniDetails?.anime?.title_english || animeTitle || '';
          const romajiTitle = aniDetails?.anime?.title || '';
          candidateTitles = Array.from(new Set([romajiTitle, enTitle, animeTitle || ''].filter(Boolean)));

          if (!resolvedAnimedarSlug) {
            for (const cand of candidateTitles) {
              const foundSlug = await this.searchAnime(cand).catch(() => null);
              if (foundSlug) {
                if (foundSlug.startsWith('risto__')) {
                  resolvedRistoEpSlug = foundSlug.replace(/^risto__/, '');
                } else {
                  resolvedAnimedarSlug = foundSlug;
                }
                break;
              }
            }
          }
        } catch {}
      }

      const watchServers: EpisodeServer[] = [];
      const downloadServers: EpisodeServer[] = [];

      // 1. الجلب من الموقع الأساسي #1: animedar.net
      if (resolvedAnimedarSlug) {
        let darServers =
          await this.getCached<EpisodeServer[]>(`animedar_ep_servers:${resolvedAnimedarSlug}__ep__${epNum}`) ||
          await this.getCached<EpisodeServer[]>(`animedar_ep_servers:${resolvedAnimedarSlug}:${epNum}`);

        if (!darServers || darServers.length === 0) {
          try {
            const html = await this.fetchAnimedarHtml(`/anime-p/${resolvedAnimedarSlug}/`);
            const $ = cheerio.load(html);
            const parsed = this.parseAnimedarDocument($, resolvedAnimedarSlug);

            for (const [eNum, eSrvs] of parsed.episodeServersByNum.entries()) {
              if (eSrvs.length > 0) {
                await this.setCache(`animedar_ep_servers:${resolvedAnimedarSlug}__ep__${eNum}`, eSrvs, 6 * 60 * 60 * 1000);
                await this.setCache(`animedar_ep_servers:${resolvedAnimedarSlug}:${eNum}`, eSrvs, 6 * 60 * 60 * 1000);
              }
            }

            darServers = parsed.episodeServersByNum.get(String(epNum)) || [];
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
      }

      // 2. الجلب التكميلي أو الاحتياطي من الموقع الثانوي #2: RistoAnime
      if (watchServers.length === 0 || resolvedRistoEpSlug) {
        if (!resolvedRistoEpSlug && candidateTitles.length > 0) {
          for (const titleCand of candidateTitles) {
            const rSeriesSlug = await this.searchRistoAnime(titleCand);
            if (rSeriesSlug) {
              const rDetails = await this.getAnimeDetails(`risto__${rSeriesSlug}`, explicitSeason);
              const matchedEp = rDetails?.episodes?.find((e: any) => String(e.num) === String(epNum));
              if (matchedEp?.id) {
                resolvedRistoEpSlug = String(matchedEp.id).replace(/^risto__/, '');
                break;
              }
            }
          }
        }

        if (resolvedRistoEpSlug) {
          const ristoExtracted = await this.extractRistoServersBySlug(resolvedRistoEpSlug);
          for (const w of ristoExtracted.watch) {
            if (!watchServers.some(s => s.url === w.url)) watchServers.push(w);
          }
          for (const d of ristoExtracted.download) {
            if (!downloadServers.some(s => s.url === d.url)) downloadServers.push(d);
          }
        }
      }

      const activeJikanId = jikanId || '21';
      const activeAnilistId = resolvedAnilistId || activeJikanId;
      const activeEpNum = epNum || '1';

      // 3. سيرفرات البث العالمية الإضافية
      const globalBackupWatch: EpisodeServer[] = [
        {
          serverName: 'VidLink',
          url: `https://vidlink.pro/anime/${activeAnilistId}/${activeEpNum}/sub`,
          type: 'iframe',
          quality: '1080p',
          category: 'watch'
        },
        {
          serverName: 'VidSrc',
          url: `https://vidsrc.icu/embed/anime/${activeAnilistId}/${activeEpNum}/0`,
          type: 'iframe',
          quality: '1080p',
          category: 'watch'
        },
        {
          serverName: '2Embed',
          url: `https://www.2embed.cc/embedanime/${activeJikanId}&ep=${activeEpNum}`,
          type: 'iframe',
          quality: '720p',
          category: 'watch'
        }
      ];

      const globalBackupDownload: EpisodeServer[] = [
        {
          serverName: 'VidLink',
          url: `https://vidlink.pro/anime/${activeAnilistId}/${activeEpNum}/sub`,
          type: 'direct',
          quality: '1080p',
          category: 'download'
        },
        {
          serverName: 'VidSrc',
          url: `https://vidsrc.icu/embed/anime/${activeAnilistId}/${activeEpNum}/0`,
          type: 'direct',
          quality: '720p',
          category: 'download'
        }
      ];

      const finalServers: EpisodeServer[] = [
        ...watchServers,
        ...globalBackupWatch,
        ...downloadServers,
        ...(downloadServers.length === 0 ? globalBackupDownload : [])
      ];

      await this.setCache(cacheKey, finalServers, 2 * 60 * 60 * 1000);
      return finalServers;
    } catch {
      const activeJikanId = jikanId || '21';
      const activeEpNum = epNum || '1';
      return [
        {
          serverName: 'VidLink',
          url: `https://vidlink.pro/anime/${activeJikanId}/${activeEpNum}/sub`,
          type: 'iframe',
          quality: '1080p',
          category: 'watch'
        },
        {
          serverName: 'VidSrc',
          url: `https://vidsrc.icu/embed/anime/${activeJikanId}/${activeEpNum}/0`,
          type: 'iframe',
          quality: '1080p',
          category: 'watch'
        },
        {
          serverName: '2Embed',
          url: `https://www.2embed.cc/embedanime/${activeJikanId}&ep=${activeEpNum}`,
          type: 'iframe',
          quality: '720p',
          category: 'watch'
        },
        {
          serverName: 'VidLink',
          url: `https://vidlink.pro/anime/${activeJikanId}/${activeEpNum}/sub`,
          type: 'direct',
          quality: '1080p',
          category: 'download'
        }
      ];
    }
  }
}
