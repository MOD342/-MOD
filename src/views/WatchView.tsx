import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  ChevronRight, 
  Settings, 
  MessageSquare, 
  Download, 
  Share2, 
  Server, 
  Play, 
  ListVideo, 
  Tv, 
  ThumbsUp, 
  Trash2, 
  Send, 
  Loader2, 
  Lock 
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { isStaffEmail } from '../services/moderationService';
import { recordEpisodeWatch } from '../services/gamificationService';
import CustomVideoPlayer from '../components/CustomVideoPlayer';
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

interface WatchViewProps {
  onBack: () => void;
  episode?: any;
  anime?: any;
  onEpisodeSelect?: (ep: any) => void;
}

export default function WatchView({ onBack, episode: initialEpisode, anime, onEpisodeSelect }: WatchViewProps) {
  const [episode, setEpisode] = useState(initialEpisode);
  const [activeTab, setActiveTab] = useState<'servers' | 'episodes' | 'comments'>('servers');
  const [serverSubTab, setServerSubTab] = useState<'watch' | 'download'>('watch');
  const [useAdBlocker, setUseAdBlocker] = useState(true);
  const [servers, setServers] = useState<any[]>([]);
  const [activeServerUrl, setActiveServerUrl] = useState<string | null>(null);
  const [loadingServers, setLoadingServers] = useState(false);
  const [extractedUrl, setExtractedUrl] = useState<string | null>(null);
  const [extractedType, setExtractedType] = useState<'direct' | 'hls' | 'iframe'>('iframe');
  const [extractedSources, setExtractedSources] = useState<any[]>([]);
  const [extracting, setExtracting] = useState(false);
  const { user, userData, userRole } = useAuth();
  const MIN_COMMENT_LEVEL = 5;
  const userLevel = userData?.level || 1;
  const isMod = userRole === 'owner' || userRole === 'admin' || userRole === 'moderator' || isStaffEmail(user?.email);

  // Real-time Watchroom Live Chat States
  const [liveComments, setLiveComments] = useState<any[]>([]);
  const [newChatText, setNewChatText] = useState('');
  const [sendingChat, setSendingChat] = useState(false);
  const [isCinemaMode, setIsCinemaMode] = useState(false);
  const [selectedQualityFilter, setSelectedQualityFilter] = useState<'ALL' | '1080p' | '720p' | '480p'>('ALL');
  const [copiedServerUrl, setCopiedServerUrl] = useState<string | null>(null);
  const [episodeSearchQuery, setEpisodeSearchQuery] = useState('');
  const [watchSeasonNum, setWatchSeasonNum] = useState<number>(() => {
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
      try {
        const history = JSON.parse(localStorage.getItem('animeHistory') || '[]');
        const updated = history.filter((h: any) => h.id !== anime._id);
        updated.unshift({
          id: anime._id,
          title: anime.title,
          posterUrl: anime.posterUrl,
          lastEpisode: episode.num,
          watchedAt: new Date().toISOString()
        });
        // Keep only last 20
        localStorage.setItem('animeHistory', JSON.stringify(updated.slice(0, 20)));
      } catch (e) {}

      if (user) {
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
        recordEpisodeWatch(user.id, anime, epNum).catch(console.error);
      }
    }

    // Fetch Servers with clientCache instant fallback
    if (episode) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      const activeSeasonNumber = episode?.seasonNumber || watchSeasonNum || 1;
      const serversCacheKey = `servers_v7_${anime?._id || 'unknown'}_s_${activeSeasonNumber}_ep_${episode?.num || episode?.id || '1'}`;
      const cachedServers = clientCache.get<any[]>(serversCacheKey);
      
      if (cachedServers && Array.isArray(cachedServers) && cachedServers.length > 0) {
        setServers(cachedServers);
        setLoadingServers(false);
        handleServerSelect(cachedServers[0].url);
      } else {
        setLoadingServers(true);
        setServers([]);
        setActiveServerUrl(null);
      }

      setExtractedUrl(null);
      setExtractedSources([]);
      setExtracting(false);
      
      fetch('/api/anime/servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          url: episode.id || episode.link,
          animeId: anime?.malId || anime?._id,
          animeTitle: anime?.englishTitle || anime?.title,
          seasonNumber: activeSeasonNumber,
          episodeNum: episode?.num
        })
      })
      .then(r => r.json())
      .then(data => {
        if (data && data.success && data.data && Array.isArray(data.data) && data.data.length > 0) {
          setServers(data.data);
          clientCache.set(serversCacheKey, data.data, 2 * 60 * 60 * 1000); // 2 hours cache
          if (!cachedServers || cachedServers.length === 0) {
            handleServerSelect(data.data[0].url);
          }
        } else if (!cachedServers) {
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
    if (lowerUrl.includes('upns.online') || lowerUrl.includes('risto')) return 'Risto';
    if (lowerUrl.includes('sendvid')) return 'Sendvid';
    if (lowerUrl.includes('mp4upload')) return 'MP4Upload';
    if (lowerUrl.includes('uqload')) return 'Uqload';
    if (lowerUrl.includes('streamwish') || lowerUrl.includes('asnwish') || lowerUrl.includes('awish') || lowerUrl.includes('swish')) return 'Streamwish';
    if (lowerUrl.includes('filemoon')) return 'Filemoon';
    if (lowerUrl.includes('lulustream')) return 'LuluStream';
    if (lowerUrl.includes('filelions')) return 'VidHide';
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

    const cleaned = (rawName || '')
      .replace(/\(.*?\)/g, '')
      .replace(/\[.*?\]/g, '')
      .replace(/سيرفر|مشغل|تحميل|تنزيل|عبر|مباشر|السريع|السحابي|الرئيسي|العالمي|المتعدد|الاحتياطي|مترجم|عربي|بث|جودة|خارقة|عالية|متوسطة|فائق|السرعة/gi, '')
      .replace(/\b(?:1080p|720p|480p|360p|fhd|hd|sd)\b/gi, '')
      .replace(/[🔥☁️⚡🎬🚀🌟📺📁📥🌐]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    return cleaned || `Server ${idx + 1}`;
  };

  // دالة توحيد رمز الجودة ليكون فقط FHD أو HD أو SD بدون أي أرقام
  const getCleanQualityLabel = (q?: string): 'FHD' | 'HD' | 'SD' => {
    const lower = String(q || '').toLowerCase();
    if (lower.includes('1080') || lower.includes('fhd')) return 'FHD';
    if (lower.includes('480') || lower.includes('360') || lower.includes('sd')) return 'SD';
    return 'HD';
  };

  const handleServerSelect = async (url: string) => {
    setActiveServerUrl(url);
    setExtractedUrl(null);
    setExtractedSources([]);

    const lowerUrl = (url || '').toLowerCase();

    // 1. فحص الروابط المباشرة (.mp4 / .m3u8) لتعمل فوراً على مشغل التطبيق الداخلي
    const isDirectURL =
      lowerUrl.split('?')[0].endsWith('.mp4') ||
      lowerUrl.split('?')[0].endsWith('.m3u8') ||
      lowerUrl.includes('manifest.m3u8');

    if (isDirectURL) {
      const isM3u8 = lowerUrl.includes('.m3u8');
      setExtractedUrl(url);
      setExtractedType(isM3u8 ? 'hls' : 'direct');
      setExtractedSources([{ file: url, label: 'FHD', type: isM3u8 ? 'hls' : 'mp4' }]);
      setExtracting(false);
      return;
    }

    // 2. السيرفرات المضمنة المباشرة (Mega, Videa, 4Shared, Dailymotion, Ok.ru, Drive, VidLink, VidSrc, 2Embed...)
    // تعمل فوراً عبر مشغل السيرفر الحقيقي المدمج بدون تأخير أو فيديوهات تجريبية وهمية
    const isKnownEmbedHost =
      lowerUrl.includes('mega.nz') ||
      lowerUrl.includes('videa.hu') ||
      lowerUrl.includes('4shared.com/web/embed') ||
      lowerUrl.includes('dailymotion.com/embed') ||
      lowerUrl.includes('vk.com/video_ext') ||
      lowerUrl.includes('lulustream.com/e/') ||
      lowerUrl.includes('upns.online') ||
      lowerUrl.includes('vidlink.') ||
      lowerUrl.includes('vidsrc.') ||
      lowerUrl.includes('2embed.') ||
      lowerUrl.includes('autoembed.') ||
      lowerUrl.includes('multiembed.') ||
      lowerUrl.includes('drive.google.com') ||
      lowerUrl.includes('ok.ru/videoembed') ||
      lowerUrl.includes('sendvid.com/embed') ||
      lowerUrl.includes('dhcplay.com') ||
      lowerUrl.includes('hgcloud.to');

    if (isKnownEmbedHost) {
      setExtractedUrl(url);
      setExtractedType('iframe');
      setExtractedSources([{ file: url, label: 'FHD', type: 'iframe' }]);
      setExtracting(false);
      return;
    }

    // 3. فحص التخزين المؤقت للاستخراج المباشر (للسيرفرات القابلة للاستخراج مثل Uqload, MP4Upload, Streamwish, Filemoon, Sibnet)
    try {
      const cached = sessionStorage.getItem(`client_extracted_v3_${url}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.directUrl && !String(parsed.directUrl).includes('commondatastorage.googleapis.com')) {
          setExtractedUrl(parsed.directUrl);
          setExtractedType(parsed.type === 'hls' ? 'hls' : parsed.type === 'direct' ? 'direct' : 'iframe');
          setExtractedSources(parsed.sources || []);
          setExtracting(false);
          return;
        }
      }
    } catch (e) {}

    // 4. محاولة استخراج رابط MP4/M3U8 خام من السيرفر، وإذا كان محمياً يتم تشغيله مباشرة كـ Embed حقيقي
    setExtracting(true);
    try {
      const res = await fetch('/api/anime/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      const json = await res.json();
      if (
        json.success &&
        json.data?.directUrl &&
        !String(json.data.directUrl).includes('commondatastorage.googleapis.com')
      ) {
        const resolvedStream = json.data.directUrl;
        const resolvedType: 'direct' | 'hls' | 'iframe' =
          json.data.type === 'hls'
            ? 'hls'
            : json.data.type === 'direct'
            ? 'direct'
            : 'iframe';
        const resolvedSources = Array.isArray(json.data.sources) ? json.data.sources : [];
        setExtractedUrl(resolvedStream);
        setExtractedType(resolvedType);
        setExtractedSources(resolvedSources);
        try {
          sessionStorage.setItem(
            `client_extracted_v3_${url}`,
            JSON.stringify({
              directUrl: resolvedStream,
              type: resolvedType,
              sources: resolvedSources
            })
          );
        } catch (e) {}
      } else {
        setExtractedUrl(url);
        setExtractedType('iframe');
        setExtractedSources([{ file: url, label: 'FHD', type: 'iframe' }]);
      }
    } catch (e) {
      setExtractedUrl(url);
      setExtractedType('iframe');
      setExtractedSources([{ file: url, label: 'FHD', type: 'iframe' }]);
    } finally {
      setExtracting(false);
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
    if (!window.confirm("هل أنت متأكد من حذف هذا التعليق؟")) return;
    try {
      const { moderationService } = await import('../services/moderationService');
      await moderationService.deleteComment(chatId);
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

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.98, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ duration: 0.3 }}
      className="bg-[#050505] min-h-screen flex flex-col"
    >
      {/* Cinema mode exit floating toggle */}
      {isCinemaMode && (
        <button 
          onClick={() => setIsCinemaMode(false)}
          className="fixed bottom-6 right-6 z-[60] bg-purple-600 hover:bg-purple-700 text-white font-extrabold text-xs px-5 py-3 rounded-full shadow-2xl flex items-center gap-2 border border-purple-500/30 transition-all scale-100 hover:scale-105 active:scale-95"
        >
          <span className="w-2 h-2 rounded-full bg-white animate-ping" />
          إلغاء نمط السينما
        </button>
      )}

      {/* Video Player Area */}
      <div className="w-full aspect-video bg-black relative flex flex-col justify-between border-b border-neutral-900 sticky top-0 z-50 overflow-hidden group shadow-2xl">
        <button onClick={onBack} className="absolute top-4 right-4 w-10 h-10 bg-black/60 backdrop-blur-md rounded-full flex items-center justify-center text-white z-20 border border-white/10 hover:bg-white/20 transition-all opacity-0 group-hover:opacity-100 shadow-lg select-none">
          <ChevronRight size={22} className="-translate-x-0.5" />
        </button>
        
        {/* Actual Player: Always uses App CustomVideoPlayer */}
        <div className="absolute inset-0 flex items-center justify-center bg-neutral-950">
          {loadingServers || extracting ? (
              <div className="flex flex-col items-center gap-3">
                 <div className="w-12 h-12 rounded-full border-2 border-purple-500 border-t-transparent animate-spin"/>
                 <span className="text-sm font-bold text-neutral-400">{extracting ? 'جاري تجهيز البث المباشر على مشغل التطبيق...' : 'جاري جلب السيرفرات...'}</span>
              </div>
          ) : (extractedUrl || activeServerUrl) ? (
            extractedType === 'iframe' ? (
              <div className="w-full h-full relative bg-black">
                <iframe
                  key={extractedUrl || activeServerUrl}
                  src={extractedUrl || activeServerUrl || ''}
                  title={episode?.title || `الحلقة ${episode?.num}`}
                  className="w-full h-full border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
                  allowFullScreen
                  referrerPolicy="origin"
                />
              </div>
            ) : (
              <CustomVideoPlayer 
                url={extractedUrl || activeServerUrl || ''} 
                type={extractedType === 'hls' ? 'hls' : 'direct'}
                sources={extractedSources}
                poster={anime?.posterUrl}
                episodeTitle={episode?.title || `الحلقة ${episode?.num}`}
                onFallback={() => setExtractedType('iframe')}
                hasNextEpisode={!!nextEpisode}
                onNextEpisode={() => {
                  if (nextEpisode) {
                    setEpisode(nextEpisode);
                    if (onEpisodeSelect) onEpisodeSelect(nextEpisode);
                  }
                }}
              />
            )
          ) : (
            <div className="text-center">
              <div className="w-16 h-16 mx-auto rounded-full bg-neutral-900/80 backdrop-blur-md border border-neutral-800 flex items-center justify-center mb-4 transition-all duration-300">
                <Play size={24} fill="currentColor" className="text-neutral-500 ml-1" />
              </div>
              <p className="text-neutral-500 font-bold text-sm">لا توجد سيرفرات متاحة</p>
            </div>
          )}
        </div>
      </div>

      {/* Info & Controls */}
      <div className={`p-4 flex-1 overflow-y-auto pb-24 transition-all duration-500 ${isCinemaMode ? 'opacity-10 pointer-events-none filter blur-[1.5px]' : 'opacity-100'}`}>

        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-white leading-tight mb-1 tracking-tight">
              {episode?.title || `الحلقة ${episode?.num}`}
            </h1>
            <p className="text-xs sm:text-sm text-neutral-400 font-bold">
              {anime?.title || 'أنمي'}
              {anime?.seasonsList?.length > 1 ? ` • الموسم ${watchSeasonNum}` : ''}
            </p>
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

        {(extractedUrl || activeServerUrl) && (
           <div className="grid grid-cols-3 gap-2 mb-6">
              <a 
                href={`intent:${extractedUrl || activeServerUrl}#Intent;package=com.mxtech.videoplayer.ad;S.title=${encodeURIComponent(`${anime?.title || 'Anime'}_Ep${episode?.num || 1}`)};end`}
                className="bg-[#1a4b9c] rounded-xl p-3 flex items-center justify-center gap-1.5 text-white text-xs font-bold shadow-lg hover:bg-[#133878] transition"
              >
                 <Play size={15} /> MX Player
              </a>
              <a 
                href={`intent:${extractedUrl || activeServerUrl}#Intent;package=org.videolan.vlc;S.title=${encodeURIComponent(`${anime?.title || 'Anime'}_Ep${episode?.num || 1}`)};end`}
                className="bg-[#e85d00] rounded-xl p-3 flex items-center justify-center gap-1.5 text-white text-xs font-bold shadow-lg hover:bg-[#c44f00] transition"
              >
                 <Play size={15} /> VLC Player
              </a>
              <a 
                href={`intent:${extractedUrl || activeServerUrl}#Intent;package=com.dv.adm;S.title=${encodeURIComponent(`${anime?.title || 'Anime'}_Ep${episode?.num || 1}`)};end`}
                className="bg-[#d84e20] rounded-xl p-3 flex items-center justify-center gap-1.5 text-white text-xs font-bold shadow-lg hover:bg-[#b03d17] transition"
              >
                 <Download size={15} /> ADM
              </a>
           </div>
        )}

        <div className="grid grid-cols-3 gap-3 mb-8">
          <button
            type="button"
            onClick={() => {
              try {
                navigator.clipboard.writeText(window.location.href);
              } catch {}
            }}
            className="flex flex-col items-center justify-center gap-2 p-3 rounded-2xl bg-neutral-900/50 hover:bg-neutral-800 border border-neutral-800/50 text-neutral-400 hover:text-white transition group cursor-pointer"
          >
            <Share2 size={22} className="group-hover:scale-110 transition-transform" />
            <span className="text-[11px] font-bold">مشاركة</span>
          </button>
          
          <button 
            type="button"
            onClick={() => setIsCinemaMode(!isCinemaMode)}
            className={`flex flex-col items-center justify-center gap-2 p-3 rounded-2xl border transition group cursor-pointer ${isCinemaMode ? 'bg-purple-900/40 border-purple-500 text-purple-400 font-bold shadow-lg shadow-purple-500/10' : 'bg-neutral-900/50 hover:bg-neutral-800 border-neutral-800/50 text-neutral-400 hover:text-white'}`}
          >
            <Tv size={22} className={`transition-transform ${isCinemaMode ? 'scale-110 animate-pulse' : 'group-hover:scale-110'}`} />
            <span className="text-[11px] font-bold">نمط السينما</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('servers');
              setServerSubTab('download');
            }}
            className={`flex flex-col items-center justify-center gap-2 p-3 rounded-2xl border transition group cursor-pointer ${
              activeTab === 'servers' && serverSubTab === 'download'
                ? 'bg-indigo-900/40 border-indigo-500 text-indigo-300 font-bold shadow-lg shadow-indigo-500/10'
                : 'bg-neutral-900/50 hover:bg-neutral-800 border-neutral-800/50 text-neutral-400 hover:text-white'
            }`}
          >
            <Download size={22} className="group-hover:scale-110 transition-transform text-indigo-400" />
            <span className="text-[11px] font-bold">تحميل الحلقة (SD/HD)</span>
          </button>
        </div>

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
                         liveComments.map((chat: any) => {
                           const chatAvatar = STORE_ITEMS_SORTED.find(i => i.id === chat.equippedAvatar);
                           const chatFrame = STORE_ITEMS_SORTED.find(i => i.id === chat.equippedFrame);
                           const chatTitle = STORE_ITEMS_SORTED.find(i => i.id === chat.equippedTitle);
                           const chatBadge = STORE_ITEMS_SORTED.find(i => i.id === chat.equippedBadge);
                           
                           return (
                             <div key={chat.id} className="flex gap-2.5 items-start group">
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
                                   <div className="flex items-center gap-3 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                      <button 
                                        onClick={() => handleLikeComment(chat.id, chat.likes || 0)} 
                                        className="text-[9px] font-bold text-neutral-500 hover:text-blue-400 transition flex items-center gap-1"
                                      >
                                         <ThumbsUp size={10} /> {chat.likes || 0}
                                      </button>
                                      {isMod && (
                                         <button 
                                           onClick={() => handleDeleteComment(chat.id)} 
                                           className="text-[9px] font-bold text-neutral-500 hover:text-red-500 transition flex items-center gap-1"
                                         >
                                            <Trash2 size={10} /> حذف
                                         </button>
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
                  <span>سيرفرات المشاهدة ({servers.filter(s => s.category !== 'download').length})</span>
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
                  <span>روابط التحميل والتنزيل ({servers.filter(s => s.category === 'download').length})</span>
                </button>
              </div>

              {loadingServers ? (
                <div className="flex flex-col items-center justify-center py-12 text-neutral-500 gap-3">
                   <div className="h-0.5 w-16 bg-neutral-800 rounded overflow-hidden">
                     <div className="h-full bg-purple-500 animate-pulse" style={{ width: '60%'}}></div>
                   </div>
                   <span className="text-xs font-bold tracking-wide">جاري فحص السيرفرات المتوفرة...</span>
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
                        ? 'جاري تجهيز روابط التحميل المباشرة...' 
                        : 'عذراً، لا توجد سيرفرات بث مباشر متاحة حالياً.'}
                    </div>
                  );
                }

                return (
                  <div className="grid grid-cols-2 gap-3">
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
                        return (
                          <a
                            key={i}
                            href={s.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full relative overflow-hidden rounded-xl p-3.5 flex items-center justify-between group transition-all duration-300 border bg-[#0f0f0f] border-neutral-800/80 hover:bg-[#151515] hover:border-indigo-500/60 cursor-pointer"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="p-2 rounded-lg transition-colors bg-neutral-800 text-indigo-400 group-hover:bg-indigo-600 group-hover:text-white shrink-0">
                                <Download size={16} />
                              </div>
                              <span className="font-black text-xs sm:text-sm text-neutral-200 group-hover:text-white truncate">
                                {mainName}
                              </span>
                            </div>
                            <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md shrink-0 ${qualityBadgeColor}`}>
                              {cleanQuality}
                            </span>
                          </a>
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
                );
              })()}
            </div>
          )}
        </motion.div>
      </div>
    </motion.div>
  );
}
