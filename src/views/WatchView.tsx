import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  ChevronRight,
  MessageSquare,
  Download,
  Server,
  Play,
  ListVideo,
  Tv,
  ThumbsUp,
  Trash2,
  Send,
  Loader2,
  Lock,
  Copy,
  Check,
  AlertCircle,
  ExternalLink,
  FolderDown
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { isStaffEmail } from '../services/moderationService';
import { recordEpisodeWatch } from '../services/gamificationService';
import { db } from '../firebase';
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  serverTimestamp,
  doc,
  updateDoc
} from 'firebase/firestore';
import { STORE_ITEMS_SORTED, getAvatarShapeClass } from '../data/storeItems';
import { clientCache } from '../utils/clientCache';
import {
  resolveApiUrl,
  resolveAbsoluteApiUrlForExternalIntent,
} from '../utils/apiUrl';
import { openDownloadManager, openExternalPlayer } from '../utils/externalNavigation';
import { downloadManagerService } from '../services/downloadManagerService';
import { useDeviceDisplay } from '../hooks/useDeviceDisplay';

interface WatchViewProps {
  onBack: () => void;
  episode?: any;
  anime?: any;
  onEpisodeSelect?: (ep: any) => void;
  onAnimeClick?: () => void;
  onOpenDownloads?: () => void;
}

export default function WatchView({ onBack, episode: initialEpisode, anime, onEpisodeSelect, onAnimeClick, onOpenDownloads }: WatchViewProps) {
  const [episode, setEpisode] = useState(initialEpisode);
  const [activeTab, setActiveTab] = useState<'servers' | 'episodes' | 'comments'>('servers');
  const [serverSubTab, setServerSubTab] = useState<'watch' | 'download'>('watch');
  const [servers, setServers] = useState<any[]>([]);
  const [activeServerUrl, setActiveServerUrl] = useState<string | null>(null);
  const [extractedStream, setExtractedStream] = useState<{ url: string; type: string } | null>(null);
  const [loadingServers, setLoadingServers] = useState(false);
  const [copiedDownloadUrl, setCopiedDownloadUrl] = useState<string | null>(null);
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);
  const [launchingExternalPlayer, setLaunchingExternalPlayer] = useState(false);
  const [launchingExternalDownload, setLaunchingExternalDownload] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [downloadFeedback, setDownloadFeedback] = useState<{
    type: 'error' | 'success';
    text: string;
    actionUrl?: string;
    actionLabel?: string;
  } | null>(null);
  const activeBlobUrlRef = React.useRef<string | null>(null);
  const extractAbortRef = React.useRef<AbortController | null>(null);
  const { user, userData, userRole } = useAuth();
  const display = useDeviceDisplay();
  const [confirmDeleteChatId, setConfirmDeleteChatId] = useState<string | null>(null);
  const MIN_COMMENT_LEVEL = 5;
  const userLevel = userData?.level || 1;
  const isMod = userRole === 'owner' || userRole === 'admin' || userRole === 'moderator' || isStaffEmail(user?.email);

  // Real-time Watchroom Live Chat States
  const [liveComments, setLiveComments] = useState<any[]>([]);
  const [newChatText, setNewChatText] = useState('');
  const [sendingChat, setSendingChat] = useState(false);
  const [episodeSearchQuery, setEpisodeSearchQuery] = useState('');
  const [watchSeasonNum] = useState<number>(() => {
    return Number(initialEpisode?.seasonNumber || anime?.activeSeason || anime?.seasonsList?.[0]?.seasonNumber || 1);
  });

  const currentSeasonEpisodes = React.useMemo(() => {
    if (Array.isArray(anime?.seasonsList) && anime.seasonsList.length > 0) {
      const found = anime.seasonsList.find((s: any) => Number(s.seasonNumber) === Number(watchSeasonNum));
      if (found && Array.isArray(found.episodes) && found.episodes.length > 0) {
        return found.episodes;
      }
    }
    return anime?.episodes || [];
  }, [anime, watchSeasonNum]);
  
  useEffect(() => {
    if (anime && episode) {
      const parseEpisodeNumber = (numVal: any, titleStr: string): number => {
        if (numVal !== undefined && numVal !== null && !isNaN(Number(numVal))) return Number(numVal);
        const text = String(numVal || titleStr || '');
        const match = text.match(/\d+/);
        if (match) {
          const parsed = parseInt(match[0], 10);
          if (!isNaN(parsed)) return parsed;
        }
        return 1;
      };
      const epNum = parseEpisodeNumber(episode?.num, episode?.title || '');

      // Save to user-scoped Continue Watching history immediately (works for guests & cloud users without leaking across accounts)
      try {
        if (typeof localStorage !== 'undefined' && anime?._id) {
          const watchHistoryKey = `local_watch_history_${user?.id || 'guest'}`;
          const raw = localStorage.getItem(watchHistoryKey);
          const list = raw ? JSON.parse(raw) : [];
          const filtered = Array.isArray(list)
            ? list.filter((item: any) => String(item.id) !== String(anime._id))
            : [];
          const totalEps = Number(anime?.episodesCount || anime?.episodes?.length || 0);
          const pct = totalEps > 0 ? Math.min(95, Math.max(15, Math.round((epNum / totalEps) * 100))) : 35;
          const entry = {
            id: String(anime._id),
            title: anime.title || 'أنمي',
            posterUrl: anime.posterUrl || anime.thumbnailUrl || '',
            lastEpisode: String(epNum),
            progress: pct,
            updatedAt: Date.now()
          };
          localStorage.setItem(watchHistoryKey, JSON.stringify([entry, ...filtered].slice(0, 20)));
        }
      } catch {}

      if (user) {
        recordEpisodeWatch(user.id, anime, epNum).catch(console.error);
      }
    }

    // Fetch Servers with clientCache instant fallback
    if (episode) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      const activeSeasonNumber = episode?.seasonNumber || watchSeasonNum || 1;
      const serversCacheKey = `servers_v13_${anime?._id || 'unknown'}_s_${activeSeasonNumber}_ep_${episode?.num || episode?.id || '1'}`;
      const cachedServers = clientCache.get<any[]>(serversCacheKey);

      if (cachedServers && Array.isArray(cachedServers) && cachedServers.length > 0) {
        setServers(cachedServers);
        setLoadingServers(false);
        const firstWatch = cachedServers.find((s: any) => s.category !== 'download') || cachedServers[0];
        if (firstWatch?.url) handleServerSelect(firstWatch.url);
      } else {
        setLoadingServers(true);
        setServers([]);
        setActiveServerUrl(null);
        setExtractedStream(null);
      }

      fetch('/api/anime/servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: episode.id || episode.link || '',
          animeId: anime?._id || anime?.malId,
          animeTitle: anime?.englishTitle || anime?.title,
          seasonNumber: activeSeasonNumber,
          episodeNum: episode?.num
        })
      })
      .then(r => r.json())
      .then(data => {
        if (data && data.success && data.data && Array.isArray(data.data) && data.data.length > 0) {
          setServers(data.data);
          clientCache.set(serversCacheKey, data.data, 2 * 60 * 60 * 1000);
          if (!cachedServers || cachedServers.length === 0) {
            const firstWatch = data.data.find((s: any) => s.category !== 'download') || data.data[0];
            if (firstWatch?.url) handleServerSelect(firstWatch.url);
          }
        } else if (!cachedServers || cachedServers.length === 0) {
          setServers([]);
          setActiveServerUrl(null);
        }
      })
      .catch(console.error)
      .finally(() => setLoadingServers(false));
    }
  }, [anime, episode]);

  // Read comments in real time for specific watch room
  useEffect(() => {
    if (!anime || !episode) return;
    
    setLiveComments([]); // reset
    
    const epCommentsId = `${anime._id}-ep-${episode.num}`;
    const q = query(
      collection(db, 'comments'),
      where('animeId', '==', epCommentsId)
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      // Sort chronologically on the client to circumvent custom index requirements
      list.sort((a: any, b: any) => {
        const timeA = a.createdAt?.seconds || 0;
        const timeB = b.createdAt?.seconds || 0;
        return timeA - timeB;
      });
      setLiveComments(list);
    }, (error) => {
      console.error("Real-time watchroom comments snapshot error", error);
    });
    
    return () => unsubscribe();
  }, [anime, episode]);

  // دالة تنظيف اسم السيرفر ليعرض الاسم الرئيسي فقط بدون أي نصوص إضافية أو رموز
  const getCleanServerMainName = (rawName: string, urlStr: string, idx: number): string => {
    const lowerUrl = (urlStr || '').toLowerCase();
    if (lowerUrl.includes('vidmoly')) return 'Vidmoly';
    if (lowerUrl.includes('mega.nz')) return 'Mega';
    if (lowerUrl.includes('videa.hu')) return 'Videa';
    if (lowerUrl.includes('4shared.com')) return '4Shared';
    if (lowerUrl.includes('dailymotion.com')) return 'Dailymotion';
    if (lowerUrl.includes('upns.online')) return 'Direct Mirror';
    if (lowerUrl.includes('sendvid')) return 'Sendvid';
    if (lowerUrl.includes('mp4upload')) return 'MP4Upload';
    if (lowerUrl.includes('uqload')) return 'Uqload';
    if (lowerUrl.includes('streamwish') || lowerUrl.includes('asnwish') || lowerUrl.includes('awish') || lowerUrl.includes('swish') || lowerUrl.includes('sfastwish') || lowerUrl.includes('flaswish') || lowerUrl.includes('obeywish') || lowerUrl.includes('cdnwish')) return 'Streamwish';
    if (lowerUrl.includes('filemoon')) return 'Filemoon';
    if (lowerUrl.includes('lulustream')) return 'LuluStream';
    if (lowerUrl.includes('filelions') || lowerUrl.includes('vidhide')) return 'VidHide';
    if (lowerUrl.includes('hgcloud') || lowerUrl.includes('dhcplay')) return 'CloudStream';
    if (lowerUrl.includes('ok.ru')) return 'Ok.ru';
    if (lowerUrl.includes('drive.google') || lowerUrl.includes('gdrive')) return 'Google Drive';
    if (lowerUrl.includes('dood') || lowerUrl.includes('d000d')) return 'DoodStream';
    if (lowerUrl.includes('streamtape')) return 'Streamtape';
    if (lowerUrl.includes('sibnet')) return 'Sibnet';
    if (lowerUrl.includes('voe')) return 'VOE';
    if (lowerUrl.includes('vidoza')) return 'Vidoza';
    if (lowerUrl.includes('mixdrop')) return 'Mixdrop';
    if (lowerUrl.includes('mediafire')) return 'MediaFire';
    if (lowerUrl.includes('vidlink')) return 'VidLink';
    if (lowerUrl.includes('2embed')) return '2Embed';
    if (lowerUrl.includes('autoembed')) return 'AutoEmbed';
    if (lowerUrl.includes('multiembed')) return 'MultiEmbed';
    if (lowerUrl.includes('vidsrc')) return 'VidSrc';
    if (lowerUrl.includes('pixeldrain')) return 'PixelDrain';
    if (lowerUrl.includes('gofile')) return 'GoFile';
    if (lowerUrl.includes('workupload')) return 'WorkUpload';
    if (lowerUrl.includes('krakenfiles')) return 'KrakenFiles';
    if (lowerUrl.includes('hexupload') || lowerUrl.includes('hexload')) return 'HexUpload';
    if (lowerUrl.includes('megamax') || lowerUrl.includes('share4max')) return 'MegaMax';
    if (lowerUrl.includes('yourupload')) return 'YourUpload';
    if (lowerUrl.includes('drop.download')) return 'DropDownload';
    if (lowerUrl.includes('megaup')) return 'MegaUp';

    const cleaned = (rawName || '')
      .replace(/\(.*?\)/g, '')
      .replace(/\[.*?\]/g, '')
      .replace(/سيرفر|مشغل|تحميل|تنزيل|عبر|مباشر|السريع|السحابي|الرئيسي|العالمي|المتعدد|الاحتياطي|مترجم|عربي|بث|جودة|خارقة|عالية|متوسطة|فائق|السرعة/gi, '')
      .replace(/\b(?:1080p|720p|480p|360p|fhd|hd|sd)\b/gi, '')
      .replace(/[🔥☁️⚡🎬🚀🌟📺📁📥🌐]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    return cleaned || `سيرفر ${idx + 1}`;
  };

  // دالة توحيد رمز الجودة ليكون فقط FHD أو HD أو SD بدون أي أرقام
  const getCleanQualityLabel = (q?: string): 'FHD' | 'HD' | 'SD' => {
    const lower = String(q || '').toLowerCase();
    if (lower.includes('1080') || lower.includes('fhd')) return 'FHD';
    if (lower.includes('480') || lower.includes('360') || lower.includes('sd')) return 'SD';
    return 'HD';
  };

  // حظر صامت للنوافذ المنبثقة والإعلانات غير المرغوبة
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const originalOpen = window.open;
    const AD_BLOCK_KEYWORDS = [
      'pop', 'adserver', 'ads.', '/ads', 'click', 'traffic', 'bet', 'casino',
      'bonus', 'cash', 'doubleclick', 'googlesyndication', 'propeller', 'exoclick',
      'adsterra', 'monetag', 'hilltopads', 'juicyads', 'onclick', 'acscdn',
      'adtng', 'cuty.io', 'ouo.io', 'exe.io', 'clk.sh', 'linkvertise', 'shorte.st',
      'adf.ly', 'bc.vc', 'shrink', 'redirect', 'tracker', 'telemetry'
    ];

    window.open = function(url?: string | URL, target?: string, features?: string) {
      const urlStr = String(url || '').toLowerCase();
      if (!urlStr || urlStr === 'about:blank' || AD_BLOCK_KEYWORDS.some(k => urlStr.includes(k))) {
        return null;
      }
      return originalOpen.call(window, url, target, features);
    };

    return () => {
      window.open = originalOpen;
      if (extractAbortRef.current) {
        try { extractAbortRef.current.abort(); } catch (_) {}
      }
      if (activeBlobUrlRef.current) {
        try { URL.revokeObjectURL(activeBlobUrlRef.current); } catch (_) {}
        activeBlobUrlRef.current = null;
      }
    };
  }, []);

  const handleServerSelect = (url: string) => {
    setActiveServerUrl(url);
    setExtractedStream(null);
    if (extractAbortRef.current) {
      try { extractAbortRef.current.abort(); } catch (_) {}
      extractAbortRef.current = null;
    }

    const lower = (url || '').toLowerCase();
    const isExtractableHost =
      lower.includes('sendvid') ||
      lower.includes('mp4upload') ||
      lower.includes('yourupload') ||
      lower.includes('videa.hu') ||
      lower.includes('vidmoly') ||
      lower.includes('mixdrop') ||
      lower.includes('vidoza') ||
      lower.includes('filemoon') ||
      lower.includes('dood') ||
      lower.includes('d000d') ||
      lower.includes('lulustream') ||
      lower.includes('streamtape') ||
      lower.includes('ok.ru');

    if (isExtractableHost && typeof AbortController !== 'undefined') {
      const ctrl = new AbortController();
      extractAbortRef.current = ctrl;
      fetch('/api/anime/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
        signal: ctrl.signal
      })
        .then(r => r.json())
        .then(res => {
          if (ctrl.signal.aborted) return;
          const directUrl = res?.data?.directUrl;
          const streamType = res?.data?.type;
          if (
            res?.success &&
            typeof directUrl === 'string' &&
            (directUrl.startsWith('http') || directUrl.startsWith('/api/')) &&
            streamType === 'direct'
          ) {
            setExtractedStream({ url: resolveApiUrl(directUrl), type: streamType });
          }
        })
        .catch(() => {});
    }
  };

  const triggerHiddenAnchor = (hrefUrl: string, downloadName?: string) => {
    const a = document.createElement('a');
    a.href = hrefUrl;
    if (downloadName) a.download = downloadName;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const downloadViaAuthenticatedFetch = async (
    downloadUrl: string,
    filename: string,
    expectedSizeBytes?: number | null,
  ) => {
    setDownloadFeedback({
      type: 'success',
      text: 'جاري تجهيز الملف للتحميل...',
    });

    const resp = await fetch(downloadUrl, { credentials: 'include' });
    const ct = (resp.headers.get('content-type') || '').toLowerCase();
    if (!resp.ok || ct.includes('text/html') || !resp.body) {
      throw new Error('تعذر بدء تحميل الملف، يرجى تجربة خيار آخر.');
    }

    const totalBytes = Number(resp.headers.get('content-length') || expectedSizeBytes || 0);
    const reader = resp.body.getReader();

    const formatProgress = (loaded: number) => {
      const loadedMb = (loaded / (1024 * 1024)).toFixed(1);
      if (totalBytes > 0) {
        const totalMb = (totalBytes / (1024 * 1024)).toFixed(1);
        const pct = Math.min(99, Math.round((loaded / totalBytes) * 100));
        return `جاري التنزيل: ${pct}% (${loadedMb} / ${totalMb} MB)...`;
      }
      return `جاري التنزيل: ${loadedMb} MB...`;
    };

    // استخدام File System Access API إن توفر لحفظ الملف مباشرة على القرص بدون استهلاك الذاكرة
    if (typeof (window as any).showSaveFilePicker === 'function') {
      try {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: filename,
          types: [{ description: 'MP4 Video', accept: { 'video/mp4': ['.mp4'] } }],
        });
        const writable = await handle.createWritable();
        let loaded = 0;
        let lastUiUpdate = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          await writable.write(value);
          loaded += value.byteLength;
          const now = Date.now();
          if (now - lastUiUpdate > 350) {
            lastUiUpdate = now;
            setDownloadFeedback({ type: 'success', text: formatProgress(loaded) });
          }
        }
        await writable.close();
        setDownloadFeedback({ type: 'success', text: `تم حفظ الحلقة بنجاح: ${filename}` });
        setTimeout(() => setDownloadFeedback(null), 6000);
        return;
      } catch (pickerErr: any) {
        if (pickerErr?.name === 'AbortError') {
          try { await reader.cancel(); } catch (_) {}
          setDownloadFeedback(null);
          return;
        }
        // Fallback to Blob if showSaveFilePicker is blocked inside iframe
      }
    }

    const chunks: BlobPart[] = [];
    let loaded = 0;
    let lastUiUpdate = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.byteLength;
      const now = Date.now();
      if (now - lastUiUpdate > 350) {
        lastUiUpdate = now;
        setDownloadFeedback({ type: 'success', text: formatProgress(loaded) });
      }
    }

    if (activeBlobUrlRef.current) {
      try { URL.revokeObjectURL(activeBlobUrlRef.current); } catch (_) {}
      activeBlobUrlRef.current = null;
    }

    const blob = new Blob(chunks, { type: ct.startsWith('video/') ? ct : 'video/mp4' });
    const blobUrl = URL.createObjectURL(blob);
    activeBlobUrlRef.current = blobUrl;
    triggerHiddenAnchor(blobUrl, filename);

    const finalMb = (loaded / (1024 * 1024)).toFixed(1);
    setDownloadFeedback({
      type: 'success',
      text: `اكتمل التجهيز (${finalMb} MB): ${filename}`,
      actionUrl: blobUrl,
      actionLabel: `حفظ الملف الآن (${finalMb} MB)`,
    });
  };

  const handleDirectDownload = async (primaryUrl: string, keyId: string) => {
    if (downloadingKey) return;
    setDownloadingKey(keyId);
    setDownloadFeedback(null);

    try {
      const candidateUrls = Array.from(
        new Set([
          primaryUrl,
          ...servers.filter((s) => s.category === 'download').map((s) => s.url),
          ...servers.filter((s) => s.category !== 'download').map((s) => s.url),
        ])
      ).filter(Boolean);

      const isAndroid = /Android/i.test(navigator.userAgent);
      const isInIframe = typeof window !== 'undefined' && window.self !== window.top;
      const isLocalNativeOrigin =
        window.location.protocol === 'capacitor:' ||
        window.location.protocol === 'file:' ||
        (window.location.hostname === 'localhost' && !window.location.port);
      const isRestrictedPreviewContext = isInIframe || isLocalNativeOrigin;

      const resp = await fetch('/api/anime/resolve-download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: primaryUrl,
          fallbackUrls: candidateUrls,
          title: anime?.englishTitle || anime?.title || 'Anime',
          ep: episode?.num || 1,
          preferExternal: isAndroid && primaryUrl.includes('/api/anime/download'),
        }),
      });

      const data = await resp.json();
      if (!data?.success || !data?.downloadUrl) {
        setDownloadFeedback({
          type: 'error',
          text: data?.message || 'تعذر تجهيز رابط التحميل لهذه الحلقة، يرجى تجربة خيار آخر.',
        });
        return;
      }

      const filename = data.filename || `Anime-Ep-${episode?.num || 1}.mp4`;
      const resolvedDownloadUrl = resolveApiUrl(data.downloadUrl);

      if (!isRestrictedPreviewContext) {
        triggerHiddenAnchor(resolvedDownloadUrl, filename);
        setDownloadFeedback({
          type: 'success',
          text: `بدأ التحميل: ${filename}`,
          actionUrl: resolvedDownloadUrl,
          actionLabel: 'إعادة التحميل',
        });
        return;
      }

      if (isAndroid) {
        const directTargetUrl =
          (data.externalDirectUrl as string | null) ||
          resolveAbsoluteApiUrlForExternalIntent(data.downloadUrl);
        const admMime = data.externalDirectMime || 'video/mp4';
        if (directTargetUrl && /^https?:\/\//i.test(directTargetUrl)) {
          const launched = await openDownloadManager(directTargetUrl, filename, admMime);
          if (launched) {
            setDownloadFeedback({
              type: 'success',
              text: `تم بدء التحميل: ${filename}`,
              actionUrl: directTargetUrl,
              actionLabel: 'إعادة المحاولة',
            });
            return;
          }
        }
      }

      await downloadViaAuthenticatedFetch(resolvedDownloadUrl, filename, data.sizeBytes);
    } catch {
      setDownloadFeedback({
        type: 'error',
        text: 'تعذر إكمال التحميل، يرجى المحاولة مرة أخرى أو اختيار خيار آخر.',
      });
    } finally {
      setDownloadingKey(null);
    }
  };

  const handleLaunchExternalPlayer = async () => {
    if (launchingExternalPlayer) return;
    setActionNotice(null);

    if (extractedStream?.url && extractedStream.type === 'direct') {
      const absUrl = resolveAbsoluteApiUrlForExternalIntent(extractedStream.url);
      const epTitle = `${anime?.title || 'أنمي'} - ${episode?.title || `الحلقة ${episode?.num || 1}`}`;
      const ok = await openExternalPlayer(absUrl, epTitle, 'video/*');
      if (!ok) {
        setActionNotice('تعذر فتح المشغل الخارجي على هذا الجهاز.');
      }
      return;
    }

    const candidates = Array.from(
      new Set([
        ...(activeServerUrl ? [activeServerUrl] : []),
        ...servers.filter((s) => s.category !== 'download').map((s) => s.url),
        ...servers.filter((s) => s.category === 'download').map((s) => s.url),
      ]),
    ).filter(Boolean);

    if (candidates.length === 0) {
      setActionNotice('لا تتوفر روابط تشغيل حالياً.');
      return;
    }

    setLaunchingExternalPlayer(true);
    try {
      const resp = await fetch('/api/anime/resolve-play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: candidates[0],
          fallbackUrls: candidates.slice(1),
          title: anime?.englishTitle || anime?.title || 'Anime',
          ep: episode?.num || 1,
        }),
      });
      const data = await resp.json();
      const epTitle = `${anime?.title || 'أنمي'} - ${episode?.title || `الحلقة ${episode?.num || 1}`}`;
      if (data?.success && data?.streamUrl) {
        const targetUrl = resolveAbsoluteApiUrlForExternalIntent(data.streamUrl);
        await openExternalPlayer(targetUrl, epTitle, data.mimeType || 'video/*');
      } else if (activeServerUrl) {
        await openExternalPlayer(activeServerUrl, epTitle, 'video/*');
      } else {
        setActionNotice('تعذر تجهيز رابط التشغيل الخارجي، يرجى تجربة سيرفر آخر.');
      }
    } catch {
      if (activeServerUrl) {
        await openExternalPlayer(activeServerUrl, anime?.title || 'Anime', 'video/*');
      } else {
        setActionNotice('تعذر فتح المشغل الخارجي، يرجى المحاولة مجدداً.');
      }
    } finally {
      setLaunchingExternalPlayer(false);
    }
  };

  const handleLaunchExternalDownload = async () => {
    if (launchingExternalDownload) return;
    setActionNotice(null);

    const dlCandidates = servers.filter((s) => s.category === 'download').map((s) => s.url);
    const watchCandidates = servers.filter((s) => s.category !== 'download').map((s) => s.url);
    const candidates = Array.from(new Set([...dlCandidates, ...watchCandidates])).filter(Boolean);

    if (candidates.length === 0) {
      setActionNotice('لا تتوفر روابط تنزيل لهذه الحلقة حالياً.');
      return;
    }

    setLaunchingExternalDownload(true);
    try {
      const resp = await fetch('/api/anime/resolve-download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: candidates[0],
          fallbackUrls: candidates.slice(1),
          serverCandidates: servers.map((s) => ({
            url: s.url,
            quality: s.quality,
            serverName: s.serverName,
            category: s.category,
          })),
          preferredQuality: 'auto',
          title: anime?.englishTitle || anime?.title || 'Anime',
          ep: episode?.num || 1,
          preferExternal: true,
        }),
      });
      const data = await resp.json();
      if (!data?.success || !data?.downloadUrl) {
        setActionNotice(data?.message || 'تعذر تجهيز رابط التنزيل الخارجي، يرجى المحاولة مجدداً.');
        return;
      }
      const filename = data.filename || `Anime-Ep-${episode?.num || 1}.mp4`;
      const targetUrl =
        (data.externalDirectUrl as string | null) ||
        resolveAbsoluteApiUrlForExternalIntent(data.downloadUrl);
      await openDownloadManager(targetUrl, filename, data.externalDirectMime || 'video/mp4');
    } catch {
      setActionNotice('تعذر بدء التنزيل الخارجي، يرجى المحاولة مرة أخرى.');
    } finally {
      setLaunchingExternalDownload(false);
    }
  };

  const handleQueueCurrentEpisode = () => {
    if (!episode) return;
    downloadManagerService.enqueueBatch(
      {
        _id: anime?._id || anime?.malId || 'anime',
        malId: anime?.malId,
        title: anime?.title || 'أنمي',
        englishTitle: anime?.englishTitle,
        posterUrl: anime?.posterUrl || anime?.thumbnailUrl,
      },
      [
        {
          id: episode.id,
          link: episode.link,
          num: episode.num || 1,
          title: episode.title || `الحلقة ${episode.num || 1}`,
          seasonNumber: watchSeasonNum,
        },
      ],
      'auto',
      'internal',
    );
    if (onOpenDownloads) {
      onOpenDownloads();
    } else {
      setActionNotice('تمت إضافة الحلقة إلى مدير التنزيلات الداخلي.');
    }
  };

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!newChatText.trim()) return;
    if (userLevel < MIN_COMMENT_LEVEL) return;
    
    setSendingChat(true);
    try {
      const epCommentsId = `${anime._id}-ep-${episode.num}`;
      const commentPayload: any = {
        animeId: epCommentsId,
        userId: user.id,
        userDisplayName: userData?.displayName || user.displayName || 'نينجا مجهول',
        text: newChatText.trim(),
        likes: 0,
        dislikes: 0,
        createdAt: serverTimestamp()
      };
      
      // Inject cosmetics if they are present
      if (user.photoURL) commentPayload.userPhotoUrl = user.photoURL;
      if (userData?.equippedAvatar) commentPayload.equippedAvatar = userData.equippedAvatar;
      if (userData?.equippedFrame) commentPayload.equippedFrame = userData.equippedFrame;
      if (userData?.equippedTitle) commentPayload.equippedTitle = userData.equippedTitle;
      if (userData?.equippedBadge) commentPayload.equippedBadge = userData.equippedBadge;

      await addDoc(collection(db, 'comments'), commentPayload);
      setNewChatText('');
      
      // Increment gamification points
      try {
        const { incrementInteraction } = await import('../services/gamificationService');
        await incrementInteraction(user.id, 'comment');
      } catch (err) {}
    } catch (err) {
      console.error("Failed to post watchroom chat", err);
    } finally {
      setSendingChat(false);
    }
  };

  const handleLikeComment = async (chatId: string, currentLikes: number) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'comments', chatId), {
        likes: currentLikes + 1
      });
    } catch (e) {
      console.error("Error liking comment", e);
    }
  };

  const handleDeleteComment = async (chatId: string) => {
    try {
      const { moderationService } = await import('../services/moderationService');
      await moderationService.deleteComment(chatId);
      setConfirmDeleteChatId(null);
    } catch (e) {
      console.error("Error deleting comment", e);
    }
  };

  // Find next and previous episode in the current season list
  const getAdjacentEpisodes = () => {
    const episodesList = currentSeasonEpisodes;
    if (!episodesList || episodesList.length <= 1) return { prevEpisode: null, nextEpisode: null };
    const currentIdx = episodesList.findIndex(
      (ep: any) => ep.id === episode?.id || String(ep.num) === String(episode?.num)
    );
    if (currentIdx === -1) return { prevEpisode: null, nextEpisode: null };

    const isDescending =
      parseInt(episodesList[0]?.num || 0, 10) >
      parseInt(episodesList[episodesList.length - 1]?.num || 0, 10);

    if (isDescending) {
      return {
        nextEpisode: currentIdx > 0 ? episodesList[currentIdx - 1] : null,
        prevEpisode: currentIdx < episodesList.length - 1 ? episodesList[currentIdx + 1] : null,
      };
    } else {
      return {
        prevEpisode: currentIdx > 0 ? episodesList[currentIdx - 1] : null,
        nextEpisode: currentIdx < episodesList.length - 1 ? episodesList[currentIdx + 1] : null,
      };
    }
  };

  const { prevEpisode, nextEpisode } = getAdjacentEpisodes();
  const isSplitWatchLayout = !display.isTabletopPosture && (display.isBookPosture || display.isDesktop || display.viewportWidth >= 1024);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className={`bg-[#050505] min-h-[var(--vv-height,100dvh)] ${
        isSplitWatchLayout
          ? 'grid grid-cols-12 items-start max-w-[1600px] mx-auto px-4 lg:px-6 pt-4 pb-10'
          : 'flex flex-col'
      }`}
      style={
        isSplitWatchLayout
          ? { columnGap: 'calc(var(--fold-hinge-gap, 0px) + 1.25rem)' }
          : undefined
      }
      dir="rtl"
    >
      {/* Video Player Column / Tabletop Upper Pane */}
      <div
        className={
          isSplitWatchLayout
            ? `${display.isBookPosture ? 'col-span-6' : 'col-span-7 xl:col-span-8'} sticky top-4 space-y-4`
            : 'contents'
        }
      >
        <div
          className={`w-full bg-black border-b border-neutral-900 shadow-2xl ${
            isSplitWatchLayout
              ? 'rounded-2xl overflow-hidden border border-white/10'
              : 'sticky top-0 z-50'
          }`}
          style={{
            paddingTop: isSplitWatchLayout ? '0px' : 'var(--safe-top, 0px)',
            height: display.isTabletopPosture ? 'var(--fold-top-pane, 46dvh)' : undefined,
          }}
        >
          <div className={`theme-keep-dark w-full bg-black relative flex flex-col justify-between overflow-hidden group ${
            display.isTabletopPosture ? 'h-full' : 'aspect-video'
          }`}>
            <button onClick={onBack} className="absolute top-3 right-3 w-10 h-10 bg-black/60 backdrop-blur-md rounded-full flex items-center justify-center text-white z-20 border border-white/10 hover:bg-white/20 transition-all opacity-90 sm:opacity-75 group-hover:opacity-100 shadow-lg select-none cursor-pointer">
              <ChevronRight size={22} className="-translate-x-0.5" />
            </button>

            <div className="absolute inset-0 flex items-center justify-center bg-neutral-950">
              {loadingServers ? (
                <div className="flex flex-col items-center gap-3 px-4 text-center">
                  <div className="w-10 h-10 rounded-full border-2 border-purple-500 border-t-transparent animate-spin" />
                  <span className="text-xs sm:text-sm font-bold text-neutral-400">جاري تجهيز الحلقة...</span>
                </div>
              ) : extractedStream && extractedStream.type === 'direct' ? (
                <div className="w-full h-full relative bg-black">
                  <video
                    key={extractedStream.url}
                    src={extractedStream.url}
                    controls
                    autoPlay
                    playsInline
                    onError={() => setExtractedStream(null)}
                    className="w-full h-full bg-black"
                  />
                </div>
              ) : activeServerUrl ? (
                <div className="w-full h-full relative bg-black">
                  <iframe
                    key={activeServerUrl}
                    src={resolveApiUrl(activeServerUrl)}
                    title={episode?.title || `الحلقة ${episode?.num}`}
                    className="w-full h-full border-0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
                    allowFullScreen
                    referrerPolicy="no-referrer"
                    sandbox="allow-scripts allow-same-origin allow-forms allow-presentation"
                  />
                </div>
              ) : (
                <div className="text-center">
                  <div className="w-14 h-14 mx-auto rounded-full bg-neutral-900/80 border border-neutral-800 flex items-center justify-center mb-3">
                    <Play size={22} fill="currentColor" className="text-neutral-500 ml-1" />
                  </div>
                  <p className="text-neutral-500 font-bold text-xs sm:text-sm">لا تتوفر خيارات تشغيل حالياً</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Info, Controls, Servers, Episodes & Chat Column */}
      <div
        className={
          isSplitWatchLayout
            ? `${display.isBookPosture ? 'col-span-6' : 'col-span-5 xl:col-span-4'} overflow-y-auto max-h-[calc(var(--vv-height,100dvh)-2.5rem)] pb-10 pr-1`
            : 'p-3.5 sm:p-4 flex-1 overflow-y-auto pb-24 transition-all duration-300'
        }
      >
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-white leading-tight mb-1 tracking-tight">
              {episode?.title || `الحلقة ${episode?.num}`}
            </h1>
            <button
              type="button"
              onClick={() => {
                if (onAnimeClick) onAnimeClick();
                else onBack();
              }}
              className="text-xs sm:text-sm text-neutral-400 hover:text-purple-400 font-bold transition inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Tv size={13} className="text-purple-400" />
              <span>{anime?.title || 'أنمي'}</span>
              {anime?.seasonsList?.length > 1 ? ` • الموسم ${watchSeasonNum}` : ''}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!prevEpisode}
              onClick={() => {
                if (prevEpisode) {
                  setEpisode(prevEpisode);
                  if (onEpisodeSelect) onEpisodeSelect(prevEpisode);
                }
              }}
              className="px-3.5 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 disabled:opacity-35 disabled:pointer-events-none border border-neutral-800 text-xs font-black text-neutral-200 transition cursor-pointer"
            >
              الحلقة السابقة
            </button>
            <button
              type="button"
              disabled={!nextEpisode}
              onClick={() => {
                if (nextEpisode) {
                  setEpisode(nextEpisode);
                  if (onEpisodeSelect) onEpisodeSelect(nextEpisode);
                }
              }}
              className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-35 disabled:pointer-events-none text-xs font-black text-white shadow-md shadow-purple-600/20 transition cursor-pointer"
            >
              الحلقة التالية
            </button>
          </div>
        </div>

        {/* Quick Actions: External Player, Anime Page, External Download */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <button
            type="button"
            disabled={launchingExternalPlayer}
            onClick={handleLaunchExternalPlayer}
            className="min-h-[44px] px-2.5 py-2 rounded-xl bg-neutral-900/90 hover:bg-neutral-800 border border-neutral-800 text-neutral-100 text-[11px] sm:text-xs font-black flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-60 whitespace-nowrap"
          >
            {launchingExternalPlayer ? (
              <Loader2 size={14} className="animate-spin text-purple-400 shrink-0" />
            ) : (
              <ExternalLink size={14} className="text-purple-400 shrink-0" />
            )}
            <span className="truncate">المشغل الخارجي</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (onAnimeClick) onAnimeClick();
              else onBack();
            }}
            className="min-h-[44px] px-2.5 py-2 rounded-xl bg-neutral-900/90 hover:bg-neutral-800 border border-neutral-800 text-neutral-100 text-[11px] sm:text-xs font-black flex items-center justify-center gap-1.5 transition cursor-pointer whitespace-nowrap"
          >
            <Tv size={14} className="text-rose-400 shrink-0" />
            <span className="truncate">صفحة الأنمي</span>
          </button>

          <button
            type="button"
            disabled={launchingExternalDownload}
            onClick={handleLaunchExternalDownload}
            className="min-h-[44px] px-2.5 py-2 rounded-xl bg-neutral-900/90 hover:bg-neutral-800 border border-neutral-800 text-neutral-100 text-[11px] sm:text-xs font-black flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-60 whitespace-nowrap"
          >
            {launchingExternalDownload ? (
              <Loader2 size={14} className="animate-spin text-indigo-400 shrink-0" />
            ) : (
              <Download size={14} className="text-indigo-400 shrink-0" />
            )}
            <span className="truncate">التنزيل الخارجي</span>
          </button>
        </div>

        {actionNotice && (
          <div className="mb-4 px-3.5 py-2.5 rounded-xl bg-neutral-900 border border-neutral-800 text-xs font-bold text-neutral-300 flex items-center justify-between gap-2">
            <span>{actionNotice}</span>
            <button
              type="button"
              onClick={() => setActionNotice(null)}
              className="text-neutral-500 hover:text-white text-xs font-black cursor-pointer"
            >
              إغلاق
            </button>
          </div>
        )}

        {/* Tabs */}
        <div className="flex bg-neutral-900/80 backdrop-blur-md rounded-xl p-1 mb-6 shadow-inner border border-neutral-800/50">
          <button 
            onClick={() => setActiveTab('episodes')}
            className={`flex-1 py-1.5 md:py-2.5 text-[10px] md:text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all duration-300 ${activeTab === 'episodes' ? 'bg-[#151515] text-white shadow-sm ring-1 ring-white/10' : 'text-neutral-500 hover:text-neutral-300'}`}
          >
            <ListVideo size={14} /> الحلقات
          </button>
          <button 
            onClick={() => setActiveTab('servers')}
            className={`flex-1 py-1.5 md:py-2.5 text-[10px] md:text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all duration-300 ${activeTab === 'servers' ? 'bg-[#151515] text-white shadow-sm ring-1 ring-white/10' : 'text-neutral-500 hover:text-neutral-300'}`}
          >
            <Server size={14} /> السيرفرات
          </button>
          <button 
            onClick={() => setActiveTab('comments')}
            className={`flex-1 overflow-hidden relative py-1.5 md:py-2.5 text-[10px] md:text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all duration-300 ${activeTab === 'comments' ? 'bg-[#151515] text-white shadow-sm ring-1 ring-white/10' : 'text-neutral-500 hover:text-neutral-300'}`}
          >
            <MessageSquare size={14} /> التعليقات
          </button>
        </div>

        {/* Active Tab Content */}
        <motion.div
           key={activeTab}
           initial={{ opacity: 0, y: 10 }}
           animate={{ opacity: 1, y: 0 }}
           transition={{ duration: 0.2 }}
        >
          {activeTab === 'comments' && (
             <div className="w-full">
               {userLevel < MIN_COMMENT_LEVEL ? (
                 <div className="bg-neutral-900/30 border border-neutral-800/50 rounded-2xl p-8 text-center flex flex-col items-center">
                    <Lock size={44} className="text-neutral-700 mb-3" />
                    <h3 className="text-white font-bold mb-1.5">غرفة الدردشة مقفلة</h3>
                    <p className="text-neutral-500 text-xs mb-4 max-w-sm leading-relaxed">
                      يجب أن تصل إلى المستوى {MIN_COMMENT_LEVEL} لفتح ميزة الدردشة والتعليق في غرف المشاهدة المباشرة للحلقات.
                    </p>
                    <span className="bg-neutral-800 text-neutral-400 text-[10px] font-black px-4 py-1.5 rounded-full border border-neutral-700/50">
                       مستواك الحالي: {userLevel}
                    </span>
                 </div>
               ) : (
                 <div className="bg-neutral-950/60 border border-neutral-900 rounded-2xl p-4 flex flex-col h-[500px]">
                    {/* Chat Header */}
                    <div className="flex items-center justify-between border-b border-neutral-900 pb-3 mb-3 shrink-0">
                       <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                          <span className="text-xs font-black text-white/95">الدردشة الحية للحلقة</span>
                       </div>
                       <span className="text-[10px] text-[#FF1744] font-bold bg-red-500/10 border border-red-500/20 px-2.5 py-1 rounded-full">
                          {liveComments.length} تعليق نشط
                       </span>
                    </div>

                    {/* Chat Message Scroll Panel */}
                    <div 
                      className="flex-1 overflow-y-auto space-y-4 mb-4 pr-1 scrollbar-thin scrollbar-thumb-neutral-800 scroll-smooth flex flex-col" 
                      dir="rtl"
                      ref={(el) => {
                        if (el) {
                          el.scrollTop = el.scrollHeight;
                        }
                      }}
                    >
                       {liveComments.length === 0 ? (
                         <div className="flex-1 flex flex-col items-center justify-center text-center p-6 my-auto">
                            <MessageSquare size={36} className="text-neutral-800 mb-3 animate-bounce" />
                            <h4 className="text-xs font-black text-neutral-400 mb-1">هدوء في الغرفة...</h4>
                            <p className="text-[10px] text-neutral-600 max-w-xs leading-relaxed">كن أول من يعلق أو يشارك أفكاره حول هذه الحلقة مع بقية المتابعين!</p>
                         </div>
                       ) : (
                         liveComments.map((chat: any, cIdx: number) => {
                           const chatAvatar = STORE_ITEMS_SORTED.find(i => i.id === chat.equippedAvatar);
                           const chatFrame = STORE_ITEMS_SORTED.find(i => i.id === chat.equippedFrame);
                           const chatTitle = STORE_ITEMS_SORTED.find(i => i.id === chat.equippedTitle);
                           const chatBadge = STORE_ITEMS_SORTED.find(i => i.id === chat.equippedBadge);
                           
                           return (
                             <div key={`${chat.id || cIdx}-${cIdx}`} className="flex gap-2.5 items-start group">
                                {/* Cosmetic Avatar Container */}
                                <div className="relative p-0.5 shrink-0">
                                   <div className={`w-8 h-8 ${getAvatarShapeClass(chatFrame?.avatarShape)} overflow-hidden border border-neutral-800 bg-neutral-900 flex items-center justify-center`}>
                                      <img 
                                        src={chatAvatar?.img || chat.userPhotoUrl || "https://api.dicebear.com/7.x/avataaars/svg?seed=" + chat.userId} 
                                        className={`w-full h-full object-cover ${chatAvatar?.imageStyle || ''}`} 
                                        alt="chat-avatar"
                                        referrerPolicy="no-referrer"
                                      />
                                   </div>
                                   {chatFrame && (
                                      <div className={`absolute inset-0 ${getAvatarShapeClass(chatFrame.avatarShape)} pointer-events-none ${chatFrame.frameStyle}`} />
                                   )}
                                </div>

                                {/* Message block */}
                                <div className="flex-1 text-right">
                                   <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className={`text-[11px] font-black ${chatTitle ? chatTitle.color : 'text-neutral-200'}`}>
                                         {chat.userDisplayName}
                                      </span>
                                      {chatBadge && (
                                         <span className="p-0.5 bg-yellow-500/10 border border-yellow-500/20 rounded-full inline-flex items-center justify-center" title={chatBadge.name}>
                                            {React.createElement(chatBadge.icon, { size: 8, className: chatBadge.color })}
                                         </span>
                                      )}
                                      {chatTitle && (
                                         <span className={`text-[8px] font-black tracking-wide uppercase px-1 bg-purple-950/20 border border-purple-500/10 rounded-md ${chatTitle.color}`}>
                                            {chatTitle.name}
                                         </span>
                                      )}
                                   </div>
                                   
                                   <p className="text-xs text-neutral-300 mt-1 bg-neutral-900/40 p-2.5 rounded-2xl rounded-tr-none border border-neutral-900 inline-block max-w-full break-words leading-relaxed text-right">
                                      {chat.text}
                                   </p>
                                   
                                   {/* Micro interactions */}
                                   <div className={`flex items-center gap-3 mt-1.5 transition-opacity ${
                                     confirmDeleteChatId === chat.id ? 'opacity-100' : 'opacity-85 md:opacity-0 md:group-hover:opacity-100'
                                   }`}>
                                      <button 
                                        onClick={() => handleLikeComment(chat.id, chat.likes || 0)} 
                                        className="min-h-[32px] px-1.5 text-[10px] font-bold text-neutral-400 hover:text-blue-400 transition flex items-center gap-1 cursor-pointer tabular-nums"
                                      >
                                         <ThumbsUp size={11} /> {chat.likes || 0}
                                      </button>
                                      {isMod && (
                                         confirmDeleteChatId === chat.id ? (
                                           <div className="flex items-center gap-1.5">
                                             <span className="text-[10px] font-bold text-rose-400">تأكيد الحذف؟</span>
                                             <button
                                               onClick={() => handleDeleteComment(chat.id)}
                                               className="min-h-[28px] px-2 rounded-md bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-black cursor-pointer"
                                             >
                                               حذف
                                             </button>
                                             <button
                                               onClick={() => setConfirmDeleteChatId(null)}
                                               className="min-h-[28px] px-2 rounded-md bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[10px] font-bold cursor-pointer"
                                             >
                                               إلغاء
                                             </button>
                                           </div>
                                         ) : (
                                           <button 
                                             onClick={() => setConfirmDeleteChatId(chat.id)} 
                                             className="min-h-[32px] px-1.5 text-[10px] font-bold text-neutral-400 hover:text-red-500 transition flex items-center gap-1 cursor-pointer"
                                           >
                                              <Trash2 size={11} /> حذف
                                           </button>
                                         )
                                      )}
                                   </div>
                                </div>
                             </div>
                           );
                         })
                       )}
                    </div>

                    {/* Message submission interface */}
                    <form onSubmit={handleSendChat} className="flex gap-2 mt-auto shrink-0 relative z-10">
                       <input 
                         type="text" 
                         value={newChatText}
                         onChange={e => setNewChatText(e.target.value)}
                         placeholder="اكتب رسالة لغرفة المشاهدة..." 
                         className="flex-1 bg-[#101010] border border-neutral-800 text-xs text-neutral-200 rounded-xl px-4 py-3 focus:outline-none focus:border-purple-600 transition text-right" 
                         disabled={sendingChat}
                       />
                       <button 
                         type="submit" 
                         disabled={sendingChat || !newChatText.trim()}
                         className="bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white font-extrabold text-xs px-5 rounded-xl transition flex items-center justify-center shrink-0 shadow-lg shadow-purple-500/10"
                       >
                          {sendingChat ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                       </button>
                    </form>
                 </div>
               )}
             </div>
          )}

          {activeTab === 'episodes' && (
            <div className="space-y-3">
               {currentSeasonEpisodes.length > 8 && (
                 <div className="relative">
                   <input
                     type="text"
                     value={episodeSearchQuery}
                     onChange={(e) => setEpisodeSearchQuery(e.target.value)}
                     placeholder="ابحث برقم الحلقة للانتقال السريع..."
                     className="w-full bg-[#0d0d0d] border border-neutral-800 rounded-xl px-4 py-2.5 text-xs font-bold text-white placeholder-neutral-500 focus:outline-none focus:border-purple-500 transition text-right"
                   />
                 </div>
               )}

               <div className="grid gap-2 max-h-[420px] overflow-y-auto pr-1">
                 {currentSeasonEpisodes
                   .filter((ep: any) => {
                     if (!episodeSearchQuery.trim()) return true;
                     const q = episodeSearchQuery.trim().toLowerCase();
                     return String(ep.num || '').includes(q) || String(ep.title || '').toLowerCase().includes(q);
                   })
                   .map((ep: any, idx: number) => {
                     const isActive = ep.id === episode?.id || (String(ep.num) === String(episode?.num) && Number(ep.seasonNumber || 1) === Number(episode?.seasonNumber || 1));
                     return (
                       <button 
                         key={`${ep.id}-${idx}`}
                         onClick={() => setEpisode(ep)}
                         className={`flex items-center justify-between p-3.5 rounded-xl border transition-all duration-200 cursor-pointer ${isActive ? 'bg-purple-900/20 border-purple-500/50 ring-1 ring-purple-500/50 shadow-[0_0_15px_rgba(168,85,247,0.15)]' : 'bg-neutral-900/30 border-neutral-800/50 hover:bg-neutral-800/80 hover:border-neutral-700'}`}
                       >
                         <div className="flex items-center gap-3">
                           <div className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${isActive ? 'bg-purple-600 text-white shadow-md' : 'bg-neutral-800 text-neutral-400'}`}>
                             <Play size={14} fill={isActive ? "currentColor" : "none"} />
                           </div>
                           <div className="text-right">
                             <h4 className={`font-bold text-sm ${isActive ? 'text-purple-50' : 'text-neutral-200'}`}>
                               {ep.title || `الحلقة ${ep.num}`}
                             </h4>
                             <span className="text-[10px] text-neutral-400">
                               {anime?.seasonsList?.length > 1 ? `الموسم ${watchSeasonNum} • ` : ''}الحلقة {ep.num} مترجمة للعربية
                             </span>
                           </div>
                         </div>
                         {isActive && (
                           <span className="text-[10px] font-black bg-purple-600/20 text-purple-300 border border-purple-500/30 px-2.5 py-1 rounded-lg">
                             قيد التشغيل الآن
                           </span>
                         )}
                       </button>
                     );
                   })}
               </div>
            </div>
          )}

          {activeTab === 'servers' && (
            <div className="flex flex-col gap-4">
              {/* Sub-tabs selection */}
              <div className="grid grid-cols-2 bg-[#0a0a0a] border border-neutral-900 rounded-xl p-1">
                <button
                  type="button"
                  onClick={() => setServerSubTab('watch')}
                  className={`py-2 px-3 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    serverSubTab === 'watch' 
                      ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/10' 
                      : 'text-neutral-400 hover:text-neutral-200 bg-transparent'
                  }`}
                >
                  <span className="text-sm">📺</span>
                  <span>مشاهدة</span>
                </button>
                <button
                  type="button"
                  onClick={() => setServerSubTab('download')}
                  className={`py-2 px-3 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    serverSubTab === 'download' 
                      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/10' 
                      : 'text-neutral-400 hover:text-neutral-200 bg-transparent'
                  }`}
                >
                  <span className="text-sm">📥</span>
                  <span>تحميل</span>
                </button>
              </div>

              {serverSubTab === 'download' && (
                <div className="flex flex-wrap items-center justify-between gap-2 bg-[#0d0d12] border border-neutral-800/80 rounded-xl p-3">
                  <button
                    type="button"
                    onClick={handleQueueCurrentEpisode}
                    className="min-h-[40px] flex-1 px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-black flex items-center justify-center gap-1.5 transition cursor-pointer whitespace-nowrap"
                  >
                    <FolderDown size={15} />
                    <span>إضافة لمدير التنزيلات</span>
                  </button>
                  {onOpenDownloads && (
                    <button
                      type="button"
                      onClick={onOpenDownloads}
                      className="min-h-[40px] px-3.5 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-200 text-xs font-bold transition cursor-pointer whitespace-nowrap"
                    >
                      فتح المدير
                    </button>
                  )}
                </div>
              )}

              {loadingServers ? (
                <div className="flex flex-col items-center justify-center py-12 text-neutral-500 gap-3">
                   <div className="h-0.5 w-16 bg-neutral-800 rounded overflow-hidden">
                     <div className="h-full bg-purple-500 animate-pulse" style={{ width: '60%'}}></div>
                   </div>
                   <span className="text-xs font-bold tracking-wide">جاري تحميل خيارات المشاهدة...</span>
                </div>
              ) : (() => {
                const displayList = servers.filter(s => {
                  if (serverSubTab === 'download') {
                    return s.category === 'download';
                  } else {
                    return s.category !== 'download';
                  }
                });

                if (displayList.length === 0) {
                  return (
                    <div className="text-center text-neutral-400 font-bold p-8 border border-neutral-800/80 rounded-2xl bg-[#0f0f0f]/40">
                      {serverSubTab === 'download'
                        ? 'لا تتوفر روابط تحميل حالياً.'
                        : 'لا تتوفر خيارات مشاهدة لهذه الحلقة حالياً.'}
                    </div>
                  );
                }

                return (
                  <div className="space-y-3">
                    {serverSubTab === 'download' && downloadFeedback && (
                      <div
                        className={`p-3 rounded-xl text-xs font-bold flex flex-wrap items-center justify-between gap-2 border ${
                          downloadFeedback.type === 'success'
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                            : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {downloadFeedback.type === 'success' ? (
                            <Check size={15} className="shrink-0" />
                          ) : (
                            <AlertCircle size={15} className="shrink-0" />
                          )}
                          <span>{downloadFeedback.text}</span>
                        </div>
                        {downloadFeedback.actionUrl && (
                          <a
                            href={downloadFeedback.actionUrl}
                            download={
                              downloadFeedback.actionUrl.startsWith('blob:') || downloadFeedback.actionUrl.startsWith('/')
                                ? `${anime?.englishTitle || anime?.title || 'Anime'}-Ep-${episode?.num || 1}.mp4`
                                : undefined
                            }
                            onClick={(e) => {
                              if (downloadFeedback.actionUrl && /^https?:\/\//i.test(downloadFeedback.actionUrl)) {
                                e.preventDefault();
                                void openDownloadManager(
                                  downloadFeedback.actionUrl,
                                  `${anime?.englishTitle || anime?.title || 'Anime'}-Ep-${episode?.num || 1}.mp4`
                                );
                              }
                            }}
                            target={downloadFeedback.actionUrl.startsWith('http') ? '_blank' : undefined}
                            rel="noopener noreferrer"
                            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-black shrink-0 transition"
                          >
                            {downloadFeedback.actionLabel || 'حفظ الملف'}
                          </a>
                        )}
                      </div>
                    )}

                    <div className={`grid gap-2.5 ${display.isCoverScreen ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'}`}>
                      {displayList.map((s, i) => {
                        const isActive = activeServerUrl === s.url && serverSubTab === 'watch';
                        const mainName = getCleanServerMainName(s.serverName, s.url, i);
                        const cleanQuality = getCleanQualityLabel(s.quality);

                        let qualityBadgeColor = 'bg-amber-500/15 text-amber-400 border border-amber-500/30';
                        if (cleanQuality === 'FHD') {
                          qualityBadgeColor = 'bg-red-500/15 text-red-400 border border-red-500/30';
                        } else if (cleanQuality === 'SD') {
                          qualityBadgeColor = 'bg-blue-500/15 text-blue-400 border border-blue-500/30';
                        }

                        if (serverSubTab === 'download') {
                          const isPrimaryDirect = s.url.startsWith('/api/anime/download');
                          const keyId = `dl_${i}_${s.url}`;
                          const isThisDownloading = downloadingKey === keyId;
                          return (
                            <div
                              key={i}
                              className={`w-full relative overflow-hidden rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 group transition-all duration-300 border ${
                                isPrimaryDirect
                                  ? 'col-span-2 bg-gradient-to-r from-indigo-950/40 via-purple-950/30 to-[#0f0f0f] border-indigo-500/40 shadow-lg shadow-indigo-950/20'
                                  : 'bg-[#0f0f0f] border-neutral-800/80 hover:bg-[#151515] hover:border-indigo-500/50'
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className={`p-2.5 rounded-xl transition-colors shrink-0 ${
                                  isPrimaryDirect
                                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                                    : 'bg-neutral-800 text-indigo-400 group-hover:bg-indigo-600 group-hover:text-white'
                                }`}>
                                  <Download size={18} />
                                </div>
                                <div className="flex flex-col min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-black text-xs sm:text-sm text-neutral-100 group-hover:text-white truncate">
                                      {isPrimaryDirect ? 'تحميل مباشر' : mainName}
                                    </span>
                                    {isPrimaryDirect && (
                                      <span className="bg-amber-500/20 text-amber-300 text-[9px] font-black px-1.5 py-0.5 rounded border border-amber-500/30">
                                        موصى به
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-[10px] text-neutral-400">
                                    {isPrimaryDirect ? 'تحميل الحلقة مباشرة بصيغة MP4' : 'تنزيل مباشر بصيغة MP4'}
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                                <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${qualityBadgeColor}`}>
                                  {cleanQuality}
                                </span>

                                <button
                                  type="button"
                                  onClick={() => {
                                    const fullUrl = s.url.startsWith('/') ? `${window.location.origin}${s.url}` : s.url;
                                    if (navigator?.clipboard?.writeText) {
                                      navigator.clipboard.writeText(fullUrl).then(() => {
                                        setCopiedDownloadUrl(s.url);
                                        setTimeout(() => setCopiedDownloadUrl(null), 2000);
                                      }).catch(() => {});
                                    }
                                  }}
                                  className="p-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition border border-neutral-700/50 cursor-pointer"
                                  title="نسخ الرابط"
                                >
                                  {copiedDownloadUrl === s.url ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                                </button>

                                <button
                                  type="button"
                                  disabled={Boolean(downloadingKey)}
                                  onClick={() => handleDirectDownload(s.url, keyId)}
                                  className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white font-black text-xs transition shadow-md shadow-indigo-600/20 flex items-center gap-1.5 cursor-pointer"
                                >
                                  {isThisDownloading ? (
                                    <>
                                      <Loader2 size={14} className="animate-spin" />
                                      <span>جاري التجهيز...</span>
                                    </>
                                  ) : (
                                    <>
                                      <Download size={14} />
                                      <span>تنزيل</span>
                                    </>
                                  )}
                                </button>
                              </div>
                            </div>
                          );
                        }

                      return (
                        <button
                          key={i}
                          type="button"
                          onClick={() => handleServerSelect(s.url)}
                          className={`w-full relative overflow-hidden rounded-xl p-3.5 flex items-center justify-between group transition-all duration-300 border cursor-pointer ${
                            isActive 
                              ? 'bg-purple-900/15 border-purple-500 ring-1 ring-purple-500 shadow-[0_0_20px_rgba(168,85,247,0.12)]'
                              : 'bg-[#0f0f0f] border-neutral-800/80 hover:bg-[#151515] hover:border-neutral-700'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className={`p-2 rounded-lg transition-colors shrink-0 ${
                              isActive 
                                ? 'bg-purple-500 shadow-lg shadow-purple-500/30 text-white' 
                                : 'bg-neutral-800 text-neutral-400 group-hover:bg-neutral-700 group-hover:text-white'
                            }`}>
                              <Server size={16} />
                            </div>
                            <span className={`font-black text-xs sm:text-sm truncate transition-colors ${
                              isActive ? 'text-white' : 'text-neutral-200 group-hover:text-white'
                            }`}>
                              {mainName}
                            </span>
                          </div>
                          <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md shrink-0 ${qualityBadgeColor}`}>
                            {cleanQuality}
                          </span>
                        </button>
                      );
                    })}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </motion.div>
      </div>
    </motion.div>
  );
}
