import React, { useState, useEffect, useMemo } from 'react';
import {
  ChevronRight,
  Shield,
  ShieldAlert,
  ShieldCheck,
  UserX,
  Users,
  Activity,
  Trash2,
  Check,
  AlertTriangle,
  ExternalLink,
  Search,
  MessageSquare,
  BellRing,
  Settings,
  X,
  Lock,
  Lightbulb,
  LayoutDashboard,
  RefreshCw,
  Copy,
  Send,
  Sliders,
  Coins,
  VolumeX,
  Gamepad2,
  Crown,
  Sparkles,
  CheckCircle2,
  XCircle,
  Clock,
  Filter,
  ArrowUpDown,
  ChevronLeft,
  Server,
  Wrench,
  Eye,
  EyeOff,
  Pin,
  Gift,
  Ticket,
  History,
  Zap
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { moderationService, RoleLevel, GlobalRole, ModPermissions, AuditLogEntry, PromoCodeEntry, isStaffEmail, getAdminAuthHeaders, ServerVerifiedSession } from '../services/moderationService';
import { notificationsService } from '../services/notificationsService';
import { Recommendation } from '../services/animeInteractionService';
import { auth, db } from '../firebase';
import { collection, query, limit, onSnapshot, doc, getDoc, updateDoc, deleteDoc, deleteField, increment, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { AdminDashboardProvider } from './admin/AdminDashboardContext';
import { AdminOverviewTab } from './admin/AdminOverviewTab';
import { AdminModerationTab } from './admin/AdminModerationTab';
import { AdminCommunityTab } from './admin/AdminCommunityTab';
import { AdminBroadcastTab } from './admin/AdminBroadcastTab';
import { AdminPlatformTab } from './admin/AdminPlatformTab';
import ViewportPortal from '../components/ViewportPortal';
import { useDeviceDisplay } from '../hooks/useDeviceDisplay';
import {
  BANNER_STYLE_OPTIONS,
  DEFAULT_DUAL_HOME_CONFIG,
  normalizeDualHomeConfig,
  type AnimeSliderMode,
  type BannerCustomItem,
  type BannerStyle,
  type DualHomeConfig,
  type MangaSliderMode,
} from '../types/platformConfig';

type MainWorkspace = 'overview' | 'moderation' | 'community' | 'broadcast' | 'platform';
type ModerationSubTab = 'live_content' | 'reports' | 'recommendations' | 'suggestions' | 'audit';
type CommunitySubTab = 'members' | 'roles' | 'bans' | 'promos';
type PlatformSubTab = 'slider' | 'homes' | 'curation' | 'links_ads' | 'queue' | 'maintenance';

export default function AdminDashboardView({
  onBack,
  onNavigate,
  initialTab
}: {
  onBack: () => void;
  onNavigate?: (view: string, data?: any) => void;
  initialTab?: string;
}) {
  const { user: authUser, userRole: contextRole } = useAuth();
  const display = useDeviceDisplay();
  const isDirectStaff = isStaffEmail(authUser?.email) || isStaffEmail(auth.currentUser?.email);
  const [role, setRole] = useState<RoleLevel | null>(
    isDirectStaff ? 'owner' : contextRole && contextRole !== 'user' ? contextRole : null
  );
  const [serverSession, setServerSession] = useState<ServerVerifiedSession | null>(null);
  const [isServerVerifying, setIsServerVerifying] = useState<boolean>(true);

  // Navigation State: 5 Clean Workspaces instead of 11 cluttered tabs
  const [workspace, setWorkspace] = useState<MainWorkspace>(() => {
    if (initialTab === 'reports' || initialTab === 'recommendations' || initialTab === 'suggestions_moderation') {
      return 'moderation';
    }
    if (initialTab === 'slider' || initialTab === 'homes' || initialTab === 'links_ads') {
      return 'platform';
    }
    if (initialTab === 'broadcast') return 'broadcast';
    return 'overview';
  });
  const [modSubTab, setModSubTab] = useState<ModerationSubTab>(() => {
    if (initialTab === 'recommendations') return 'recommendations';
    if (initialTab === 'suggestions_moderation') return 'suggestions';
    if (initialTab === 'reports') return 'reports';
    return 'live_content';
  });
  const [commSubTab, setCommSubTab] = useState<CommunitySubTab>('members');
  const [platformSubTab, setPlatformSubTab] = useState<PlatformSubTab>(() => {
    if (initialTab === 'homes') return 'homes';
    if (initialTab === 'links_ads') return 'links_ads';
    return 'slider';
  });

  // Data Collections (Real-time synced with Firestore)
  const [usersInfo, setUsersInfo] = useState<GlobalRole[]>([]);
  const [bannedUsers, setBannedUsers] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [suggestionsList, setSuggestionsList] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [promoCodesList, setPromoCodesList] = useState<PromoCodeEntry[]>([]);
  const [auditTypeFilter, setAuditTypeFilter] = useState<string>('all');

  // Live Content Inspector States (All comments, community posts, arena feed, leaks)
  const [liveComments, setLiveComments] = useState<any[]>([]);
  const [liveArenaPosts, setLiveArenaPosts] = useState<any[]>([]);
  const [liveLeaks, setLiveLeaks] = useState<any[]>([]);
  const [liveContentSource, setLiveContentSource] = useState<'all' | 'anime_comments' | 'community_posts' | 'arena_feed' | 'leaks'>('all');
  const [liveContentSearch, setLiveContentSearch] = useState('');
  const [selectedContentIds, setSelectedContentIds] = useState<string[]>([]);
  const [editingLiveCommentId, setEditingLiveCommentId] = useState<string | null>(null);
  const [editingLiveCommentText, setEditingLiveCommentText] = useState('');

  // Promo Codes & Mass Grant States
  const [newPromoCode, setNewPromoCode] = useState('');
  const [newPromoCoins, setNewPromoCoins] = useState<number>(250);
  const [newPromoXp, setNewPromoXp] = useState<number>(500);
  const [newPromoMaxUses, setNewPromoMaxUses] = useState<number>(50);
  const [isCreatingPromo, setIsCreatingPromo] = useState(false);
  const [massGrantCoins, setMassGrantCoins] = useState<number>(100);
  const [massGrantXp, setMassGrantXp] = useState<number>(200);
  const [massGrantSegment, setMassGrantSegment] = useState<'all' | 'active_30' | 'elite'>('all');
  const [isGrantingMass, setIsGrantingMass] = useState(false);

  // Anime Curation States (Pinning & Hiding)
  const [pinnedAnimeList, setPinnedAnimeList] = useState<any[]>([]);
  const [hiddenAnimeList, setHiddenAnimeList] = useState<any[]>([]);
  const [curationSearchQuery, setCurationSearchQuery] = useState('');
  const [curationSearchResults, setCurationSearchResults] = useState<any[]>([]);
  const [isSearchingCurationAnime, setIsSearchingCurationAnime] = useState(false);
  const [pinEpisodeInput, setPinEpisodeInput] = useState('مُثبت');
  const [isSavingCuration, setIsSavingCuration] = useState(false);
  const [modPerms, setModPerms] = useState<ModPermissions>({
    canBan: false,
    canNotify: false,
    canManageSettings: false,
    canViewRoles: false
  });

  // Moderation & Filter States
  const [reportFilter, setReportFilter] = useState<'pending' | 'resolved' | 'all'>('all');
  const [recStatusFilter, setRecStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [searchRecQuery, setSearchRecQuery] = useState('');
  const [recIdBeingRejected, setRecIdBeingRejected] = useState<string | null>(null);
  const [recRejectionReasonInput, setRecRejectionReasonInput] = useState('');
  const [recIdBeingDeleted, setRecIdBeingDeleted] = useState<string | null>(null);
  const [resolvedAnimeMeta, setResolvedAnimeMeta] = useState<Record<string, { title: string; posterUrl: string }>>({});
  const [suggestionsFilter, setSuggestionsFilter] = useState<'all' | 'suggestion' | 'complaint'>('all');
  const [suggestionBeingDeleted, setSuggestionBeingDeleted] = useState<string | null>(null);
  const [replyingSuggestion, setReplyingSuggestion] = useState<any | null>(null);
  const [suggestionReplyText, setSuggestionReplyText] = useState('');

  // Community & Member Management States
  const [searchUserQuery, setSearchUserQuery] = useState('');
  const [userFilterBy, setUserFilterBy] = useState<'all' | 'muted' | 'gamesRestricted' | 'coinsRestricted' | 'staff'>('all');
  const [userSortBy, setUserSortBy] = useState<'default' | 'coins' | 'level' | 'xp'>('default');
  const [editingUser, setEditingUser] = useState<any>(null);
  const [editingCoins, setEditingCoins] = useState<number>(0);
  const [editingXP, setEditingXP] = useState<number>(0);
  const [editingLevel, setEditingLevel] = useState<number>(1);
  const [editingIsMuted, setEditingIsMuted] = useState<boolean>(false);
  const [editingIsGamesRestricted, setEditingIsGamesRestricted] = useState<boolean>(false);
  const [editingIsCoinsRestricted, setEditingIsCoinsRestricted] = useState<boolean>(false);
  const [isUpdatingUser, setIsUpdatingUser] = useState(false);

  // Roles & Bans States
  const [roleSearchQuery, setRoleSearchQuery] = useState('');
  const [selectedSearchUser, setSelectedSearchUser] = useState<any>(null);
  const [userIdInput, setUserIdInput] = useState('');
  const [roleInput, setRoleInput] = useState<RoleLevel>('moderator');
  const [banReasonInput, setBanReasonInput] = useState('مخالفة قوانين وشروط المنصة');
  const [confirmDemoteUid, setConfirmDemoteUid] = useState<string | null>(null);
  const [editingPermissionsMod, setEditingPermissionsMod] = useState<any>(null);
  const [modCustomPerms, setModCustomPerms] = useState({
    canBan: false,
    canNotify: false,
    canManageSettings: false,
    canViewRoles: false
  });

  // Broadcast & Notification States
  const [notifTitle, setNotifTitle] = useState('');
  const [notifBody, setNotifBody] = useState('');
  const [notifType, setNotifType] = useState('system');
  const [notifImageUrl, setNotifImageUrl] = useState('');
  const [notifTargetChoice, setNotifTargetChoice] = useState<'all' | 'specific'>('all');
  const [notifTargetUid, setNotifTargetUid] = useState('');
  const [interactiveLinkChoice, setInteractiveLinkChoice] = useState<'none' | 'rewards' | 'games' | 'leaderboard' | 'community' | 'anime'>('none');
  const [animeSearchQuery, setAnimeSearchQuery] = useState('');
  const [animeSuggestions, setAnimeSuggestions] = useState<any[]>([]);
  const [isSearchingAnime, setIsSearchingAnime] = useState(false);
  const [selectedNotifAnime, setSelectedNotifAnime] = useState<any>(null);
  const [isSendingNotif, setIsSendingNotif] = useState(false);

  // Platform Settings & Dual Home / Banner States
  const [sliderLimit, setSliderLimit] = useState(5);
  const [sliderSeason, setSliderSeason] = useState('auto');
  const [sliderMode, setSliderMode] = useState<AnimeSliderMode>('best_season');
  const [animeBannerStyle, setAnimeBannerStyle] = useState<BannerStyle>('classic');
  const [customSliderAnime, setCustomSliderAnime] = useState<BannerCustomItem[]>([]);
  const [sliderSearchQuery, setSliderSearchQuery] = useState('');
  const [sliderSearchResults, setSliderSearchResults] = useState<any[]>([]);
  const [isSearchingSliderAnime, setIsSearchingSliderAnime] = useState(false);
  const [sliderSpeed, setSliderSpeed] = useState(4);
  const [globalAnnouncement, setGlobalAnnouncement] = useState('');

  // Manga Banner & Dual Home Config States
  const [mangaBannerStyle, setMangaBannerStyle] = useState<BannerStyle>('split');
  const [mangaBannerLimit, setMangaBannerLimit] = useState(5);
  const [mangaSliderMode, setMangaSliderMode] = useState<MangaSliderMode>('trending');
  const [customMangaBanner, setCustomMangaBanner] = useState<BannerCustomItem[]>([]);
  const [mangaBannerSearchQuery, setMangaBannerSearchQuery] = useState('');
  const [mangaBannerSearchResults, setMangaBannerSearchResults] = useState<any[]>([]);
  const [isSearchingMangaBanner, setIsSearchingMangaBanner] = useState(false);
  const [mangaBannerSpeed, setMangaBannerSpeed] = useState(5);
  const [mangaAnnouncement, setMangaAnnouncement] = useState('');
  const [dualHomeConfig, setDualHomeConfig] = useState<DualHomeConfig>(DEFAULT_DUAL_HOME_CONFIG);

  const [helpTelegramUrl, setHelpTelegramUrl] = useState('https://t.me/+St876s24-2I4N2U0');
  const [groupTelegramUrl, setGroupTelegramUrl] = useState('https://t.me/+pW720892GZRkN2I0');
  const [donateTelegramUrl, setDonateTelegramUrl] = useState('https://t.me/Mod_342');
  const [monetizationMode, setMonetizationMode] = useState<'simulation' | 'direct_link' | 'script' | 'hybrid'>('hybrid');
  const [directLinkUrl, setDirectLinkUrl] = useState('https://uplcm.com/4/11992531');
  const [backupDirectLinkUrl, setBackupDirectLinkUrl] = useState('https://www.profitableratecpmnetwork.com/xw38hehu?key=f928ec53ec71574a775e118d9d0b4f38');
  const [videoAdUrl, setVideoAdUrl] = useState('');
  const [vastTagUrl, setVastTagUrl] = useState('');
  const [admobRewardedId, setAdmobRewardedId] = useState('');
  const [scriptCode, setScriptCode] = useState('');
  const [requireClickVerification, setRequireClickVerification] = useState(true);
  const [adCooldownSeconds, setAdCooldownSeconds] = useState(20);
  const [stayTime, setStayTime] = useState(30);
  const [adRewardCoins, setAdRewardCoins] = useState(35);
  const [adRewardXp, setAdRewardXp] = useState(120);
  const [adDailyLimit, setAdDailyLimit] = useState(20);
  const [customAdsList, setCustomAdsList] = useState<
    Array<{
      id: string;
      sponsor: string;
      title: string;
      bannerUrl: string;
      targetUrl: string;
      buttonText?: string;
    }>
  >([]);
  const [newAdSponsor, setNewAdSponsor] = useState('');
  const [newAdTitle, setNewAdTitle] = useState('');
  const [newAdBannerUrl, setNewAdBannerUrl] = useState('');
  const [newAdTargetUrl, setNewAdTargetUrl] = useState('');
  const [newAdButtonText, setNewAdButtonText] = useState('انضم الآن');
  const [adStatsData, setAdStatsData] = useState<{
    totalViews: number;
    totalCoinsDistributed: number;
    totalXpDistributed: number;
    dailyViews?: Record<string, number>;
    lastViewAt?: string;
  }>({
    totalViews: 0,
    totalCoinsDistributed: 0,
    totalXpDistributed: 0,
    dailyViews: {}
  });
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // Scraper Queue & Maintenance States
  const [queueStatus, setQueueStatus] = useState<any>(null);
  const [queueTaskName, setQueueTaskName] = useState('preWarmDashboard');
  const [queueTaskData, setQueueTaskData] = useState('');
  const [isSubmittingQueueTask, setIsSubmittingQueueTask] = useState(false);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [confirmResetModal, setConfirmResetModal] = useState(false);
  const [isResettingAll, setIsResettingAll] = useState(false);
  const [confirmFactoryWipeModal, setConfirmFactoryWipeModal] = useState(false);
  const [isFactoryWiping, setIsFactoryWiping] = useState(false);

  // Toast Feedback
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const notify = (text: string, type: 'success' | 'error' = 'success') => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Helper: Resolve User Name & Match Search
  const getUserNameByUid = (uid: string) => {
    if (!uid) return 'عضو غير معروف';
    const found = allUsers.find(
      u => u.uid === uid || u.id === uid || (u.username && u.username.toLowerCase() === uid.toLowerCase())
    );
    if (found) return found.displayName || found.username || uid;
    return uid.slice(0, 10);
  };

  const resolveUserByUsernameOrUid = (input: string) => {
    const clean = input.trim().replace(/^@/, '');
    const found = allUsers.find(
      u =>
        (u.username && u.username.toLowerCase() === clean.toLowerCase()) ||
        u.uid === clean ||
        u.id === clean ||
        (u.email && u.email.toLowerCase() === clean.toLowerCase())
    );
    return found ? found.uid : clean;
  };

  const matchesUserSearch = (u: any, q: string) => {
    if (!q.trim()) return true;
    const cleanQ = q.toLowerCase().trim().replace(/^@/, '');
    return (
      (u.displayName || '').toLowerCase().includes(cleanQ) ||
      (u.username || '').toLowerCase().includes(cleanQ) ||
      (u.uid || '').toLowerCase().includes(cleanQ) ||
      (u.email || '').toLowerCase().includes(cleanQ)
    );
  };

  // Cumulative XP / Level Math
  const calculateTotalCumulativeXp = (lvl: number, currentXp: number): number => {
    let total = 0;
    for (let i = 1; i < lvl; i++) {
      total += Math.floor(Math.pow(i, 1.5) * 500) + 500;
    }
    return total + currentXp;
  };

  const calculateLevelAndXpFromTotal = (totalXp: number): { level: number; xp: number } => {
    let lvl = 1;
    let remainingXp = Math.max(0, totalXp);
    let req = Math.floor(Math.pow(lvl, 1.5) * 500) + 500;
    while (remainingXp >= req && lvl < 100) {
      remainingXp -= req;
      lvl++;
      req = Math.floor(Math.pow(lvl, 1.5) * 500) + 500;
    }
    if (lvl >= 100) {
      lvl = 100;
      if (remainingXp > req) remainingXp = req;
    }
    return { level: lvl, xp: remainingXp };
  };

  // Initial Load & Real-Time Firestore Listeners
  useEffect(() => {
    if (isStaffEmail(authUser?.email) || isStaffEmail(auth.currentUser?.email)) {
      setRole('owner');
    } else if (contextRole && contextRole !== 'user') {
      setRole(contextRole);
    }

    let unsubReports: any;
    let unsubBans: any;
    let unsubRoles: any;
    let unsubPerms: any;
    let unsubUsers: any;
    let unsubRecs: any;
    let unsubSuggestions: any;
    let unsubAudit: any;
    let unsubPromos: any;
    let unsubComments: any;
    let unsubArena: any;
    let unsubLeaks: any;

    const initRealtimeSync = async () => {
      try {
        const [sliderCfg, tgCfg, monCfg, curCfg] = await Promise.all([
          moderationService.getGlobalSettings('slider'),
          moderationService.getGlobalSettings('telegramLinks'),
          moderationService.getGlobalSettings('monetization'),
          moderationService.getGlobalSettings('animeCuration')
        ]);
        if (sliderCfg) {
          setSliderLimit(Math.min(10, Math.max(1, Number(sliderCfg.limit) || 5)));
          setSliderSeason(sliderCfg.season || 'auto');
          setSliderMode(sliderCfg.sliderMode || 'best_season');
          setAnimeBannerStyle(sliderCfg.animeBannerStyle || 'classic');
          if (Array.isArray(sliderCfg.customAnime)) setCustomSliderAnime(sliderCfg.customAnime);
          setSliderSpeed(Math.min(15, Math.max(2, Number(sliderCfg.speed) || 4)));
          setGlobalAnnouncement(sliderCfg.globalAnnouncement || '');

          setMangaBannerStyle(sliderCfg.mangaBannerStyle || 'split');
          setMangaBannerLimit(Math.min(10, Math.max(1, Number(sliderCfg.mangaBannerLimit) || 5)));
          setMangaSliderMode(sliderCfg.mangaSliderMode || 'trending');
          if (Array.isArray(sliderCfg.customMangaBanner)) setCustomMangaBanner(sliderCfg.customMangaBanner);
          setMangaBannerSpeed(Math.min(15, Math.max(2, Number(sliderCfg.mangaBannerSpeed) || 5)));
          setMangaAnnouncement(sliderCfg.mangaAnnouncement || '');
          setDualHomeConfig(normalizeDualHomeConfig(sliderCfg.dualHomeConfig));
        }
        if (curCfg) {
          if (Array.isArray(curCfg.pinnedAnime)) setPinnedAnimeList(curCfg.pinnedAnime);
          if (Array.isArray(curCfg.hiddenAnime)) setHiddenAnimeList(curCfg.hiddenAnime);
        }
        if (tgCfg) {
          if (tgCfg.helpTelegramUrl) setHelpTelegramUrl(tgCfg.helpTelegramUrl);
          if (tgCfg.groupTelegramUrl) setGroupTelegramUrl(tgCfg.groupTelegramUrl);
          if (tgCfg.donateTelegramUrl) setDonateTelegramUrl(tgCfg.donateTelegramUrl);
        }
        if (monCfg) {
          if (monCfg.mode) setMonetizationMode(monCfg.mode);
          if (monCfg.directLinkUrl && !monCfg.directLinkUrl.includes('effectivecpmnetwork.com')) {
            setDirectLinkUrl(monCfg.directLinkUrl);
          }
          if (monCfg.backupDirectLinkUrl) setBackupDirectLinkUrl(monCfg.backupDirectLinkUrl);
          if (monCfg.videoAdUrl !== undefined) setVideoAdUrl(monCfg.videoAdUrl);
          if (monCfg.vastTagUrl !== undefined) setVastTagUrl(monCfg.vastTagUrl);
          if (monCfg.admobRewardedId !== undefined) setAdmobRewardedId(monCfg.admobRewardedId);
          if (monCfg.scriptCode !== undefined) setScriptCode(monCfg.scriptCode);
          if (monCfg.requireClickVerification !== undefined) setRequireClickVerification(Boolean(monCfg.requireClickVerification));
          if (monCfg.cooldownSeconds !== undefined) setAdCooldownSeconds(Number(monCfg.cooldownSeconds) || 20);
          if (monCfg.stayTime !== undefined) setStayTime(Math.max(30, Number(monCfg.stayTime) || 30));
          if (monCfg.rewardCoins !== undefined) setAdRewardCoins(Number(monCfg.rewardCoins) || 35);
          if (monCfg.rewardXp !== undefined) setAdRewardXp(Number(monCfg.rewardXp) || 120);
          if (monCfg.dailyLimit !== undefined) setAdDailyLimit(Number(monCfg.dailyLimit) || 20);
          if (Array.isArray(monCfg.customAds)) setCustomAdsList(monCfg.customAds);
        }

        const adStatsCfg = await moderationService.getGlobalSettings('adStats');
        if (adStatsCfg) {
          setAdStatsData({
            totalViews: Number(adStatsCfg.totalViews) || 0,
            totalCoinsDistributed: Number(adStatsCfg.totalCoinsDistributed) || 0,
            totalXpDistributed: Number(adStatsCfg.totalXpDistributed) || 0,
            dailyViews: adStatsCfg.dailyViews || {},
            lastViewAt: adStatsCfg.lastViewAt
          });
        }
      } catch {}

      // Verify session & permissions server-side via Firebase Admin SDK
      setIsServerVerifying(true);
      const verifiedSession = await moderationService.verifyServerAdminSession();
      setIsServerVerifying(false);

      let curRole: RoleLevel = 'user';
      if (verifiedSession) {
        setServerSession(verifiedSession);
        curRole = verifiedSession.role;
        setRole(verifiedSession.role);
        setModPerms(verifiedSession.permissions);
      } else {
        curRole = await moderationService.getCurrentUserRole(authUser);
        setRole(curRole);
        if (auth.currentUser?.uid) {
          const myDoc = await getDoc(doc(db, 'globalRoles', auth.currentUser.uid)).catch(() => null);
          if (myDoc && myDoc.exists()) {
            const d = myDoc.data();
            setModPerms({
              canBan: d.canBan ?? false,
              canNotify: d.canNotify ?? false,
              canManageSettings: d.canManageSettings ?? false,
              canViewRoles: d.canViewRoles ?? false
            });
          }
        }
      }

      if (curRole === 'user' && !isStaffEmail(authUser?.email)) return;

      moderationService.getAllUsers().then(fetched => {
        if (fetched.length > 0) setAllUsers(fetched);
      });

      unsubReports = onSnapshot(query(collection(db, 'reports'), limit(200)), snap => {
        const list: any[] = [];
        snap.forEach(d => list.push({ id: d.id, ...d.data() }));
        list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setReports(list);
      });

      unsubBans = onSnapshot(query(collection(db, 'bannedUsers'), limit(300)), snap => {
        const list: any[] = [];
        snap.forEach(d => list.push({ id: d.id, uid: d.id, ...d.data() }));
        setBannedUsers(list);
      });

      unsubRoles = onSnapshot(query(collection(db, 'globalRoles'), limit(200)), snap => {
        const list: any[] = [];
        snap.forEach(d => list.push({ id: d.id, uid: d.id, ...d.data() }));
        setUsersInfo(list);
      });

      unsubUsers = onSnapshot(query(collection(db, 'users'), limit(300)), snap => {
        const list: any[] = [];
        snap.forEach(d => list.push({ id: d.id, uid: d.id, ...d.data() }));
        setAllUsers(list);
      });

      unsubRecs = onSnapshot(query(collection(db, 'recommendations'), limit(200)), snap => {
        const list: any[] = [];
        snap.forEach(d => list.push({ id: d.id, ...d.data() }));
        list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setRecommendations(list as Recommendation[]);
      });

      unsubSuggestions = onSnapshot(query(collection(db, 'suggestions'), limit(200)), snap => {
        const list: any[] = [];
        snap.forEach(d => list.push({ id: d.id, ...d.data() }));
        list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setSuggestionsList(list);
      });

      unsubAudit = onSnapshot(query(collection(db, 'auditLogs'), limit(120)), snap => {
        const list: any[] = [];
        snap.forEach(d => list.push({ id: d.id, ...d.data() }));
        list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setAuditLogs(list.slice(0, 100));
      });

      unsubPromos = onSnapshot(query(collection(db, 'promoCodes'), limit(150)), snap => {
        const list: any[] = [];
        snap.forEach(d => list.push({ id: d.id, ...d.data() }));
        list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setPromoCodesList(list);
      });

      unsubComments = onSnapshot(query(collection(db, 'comments'), limit(200)), snap => {
        const list: any[] = [];
        snap.forEach(d => list.push({ id: d.id, _collection: 'comments', ...d.data() }));
        list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setLiveComments(list);
      });

      unsubArena = onSnapshot(query(collection(db, 'arenaFeed'), limit(150)), snap => {
        const list: any[] = [];
        snap.forEach(d => list.push({ id: d.id, _collection: 'arenaFeed', ...d.data() }));
        list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setLiveArenaPosts(list);
      });

      unsubLeaks = onSnapshot(query(collection(db, 'otakuLeaks'), limit(150)), snap => {
        const list: any[] = [];
        snap.forEach(d => list.push({ id: d.id, _collection: 'otakuLeaks', ...d.data() }));
        list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setLiveLeaks(list);
      });

      if (auth.currentUser?.uid) {
        unsubPerms = onSnapshot(doc(db, 'globalRoles', auth.currentUser.uid), snap => {
          if (snap.exists()) {
            const d = snap.data();
            setModPerms({
              canBan: d.canBan ?? false,
              canNotify: d.canNotify ?? false,
              canManageSettings: d.canManageSettings ?? false,
              canViewRoles: d.canViewRoles ?? false
            });
          }
        });
      }
    };

    initRealtimeSync();
    return () => {
      if (unsubReports) unsubReports();
      if (unsubBans) unsubBans();
      if (unsubRoles) unsubRoles();
      if (unsubPerms) unsubPerms();
      if (unsubUsers) unsubUsers();
      if (unsubRecs) unsubRecs();
      if (unsubSuggestions) unsubSuggestions();
      if (unsubAudit) unsubAudit();
      if (unsubPromos) unsubPromos();
      if (unsubComments) unsubComments();
      if (unsubArena) unsubArena();
      if (unsubLeaks) unsubLeaks();
    };
  }, [authUser, contextRole]);

  // Poll Scraper Queue when viewing queue sub-tab (authenticated via Firebase Admin SDK token)
  useEffect(() => {
    if (workspace !== 'platform' || platformSubTab !== 'queue') return;
    const fetchStatus = async () => {
      try {
        const headers = await getAdminAuthHeaders();
        const res = await fetch('/api/queue/status', { headers });
        const data = await res.json();
        if (data.success) setQueueStatus(data);
      } catch {}
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, [workspace, platformSubTab]);

  // Real Anime Search for Broadcast Notification Link (Fixed!)
  useEffect(() => {
    const q = animeSearchQuery.trim();
    if (interactiveLinkChoice !== 'anime' || q.length < 2 || selectedNotifAnime) {
      setAnimeSuggestions([]);
      setIsSearchingAnime(false);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setIsSearchingAnime(true);
      try {
        const res = await fetch(`/api/anime/search?q=${encodeURIComponent(q)}`, {
          signal: controller.signal
        });
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          setAnimeSuggestions(json.data.slice(0, 10));
        } else {
          setAnimeSuggestions([]);
        }
      } catch (e: any) {
        if (e?.name !== 'AbortError') setAnimeSuggestions([]);
      } finally {
        if (!controller.signal.aborted) setIsSearchingAnime(false);
      }
    }, 350);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [animeSearchQuery, interactiveLinkChoice, selectedNotifAnime]);

  // Real Anime Search for Custom Slider
  useEffect(() => {
    const q = sliderSearchQuery.trim();
    if (sliderMode !== 'custom' || q.length < 2) {
      setSliderSearchResults([]);
      setIsSearchingSliderAnime(false);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setIsSearchingSliderAnime(true);
      try {
        const res = await fetch(`/api/anime/search?q=${encodeURIComponent(q)}`, {
          signal: controller.signal
        });
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          setSliderSearchResults(json.data.slice(0, 10));
        } else {
          setSliderSearchResults([]);
        }
      } catch (e: any) {
        if (e?.name !== 'AbortError') setSliderSearchResults([]);
      } finally {
        if (!controller.signal.aborted) setIsSearchingSliderAnime(false);
      }
    }, 350);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [sliderSearchQuery, sliderMode]);

  // Real Manga/Manhwa Search for Custom Manga Banner
  useEffect(() => {
    const q = mangaBannerSearchQuery.trim();
    if (mangaSliderMode !== 'custom' || q.length < 2) {
      setMangaBannerSearchResults([]);
      setIsSearchingMangaBanner(false);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setIsSearchingMangaBanner(true);
      try {
        const res = await fetch(`/api/manga/search?q=${encodeURIComponent(q)}`, {
          signal: controller.signal
        });
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          setMangaBannerSearchResults(json.data.slice(0, 10));
        } else {
          setMangaBannerSearchResults([]);
        }
      } catch (e: any) {
        if (e?.name !== 'AbortError') setMangaBannerSearchResults([]);
      } finally {
        if (!controller.signal.aborted) setIsSearchingMangaBanner(false);
      }
    }, 350);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [mangaBannerSearchQuery, mangaSliderMode]);

  // Real Anime Search for Content Curation (Pinning & Hiding)
  useEffect(() => {
    const q = curationSearchQuery.trim();
    if (workspace !== 'platform' || platformSubTab !== 'curation' || q.length < 2) {
      setCurationSearchResults([]);
      setIsSearchingCurationAnime(false);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setIsSearchingCurationAnime(true);
      try {
        const res = await fetch(`/api/anime/search?q=${encodeURIComponent(q)}`, {
          signal: controller.signal
        });
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          setCurationSearchResults(json.data.slice(0, 12));
        } else {
          setCurationSearchResults([]);
        }
      } catch (e: any) {
        if (e?.name !== 'AbortError') setCurationSearchResults([]);
      } finally {
        if (!controller.signal.aborted) setIsSearchingCurationAnime(false);
      }
    }, 350);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [curationSearchQuery, workspace, platformSubTab]);

  // Auto-resolve missing anime titles & posters for older recommendations and self-heal Firestore docs
  useEffect(() => {
    if (recommendations.length === 0) return;

    const missingIds = new Set<string>();
    recommendations.forEach(rec => {
      if (rec.animeId && (!rec.animeTitle || rec.animeTitle === 'أنمي' || !rec.animePosterUrl)) {
        if (!resolvedAnimeMeta[rec.animeId]) missingIds.add(String(rec.animeId));
      }
      if (rec.targetAnimeId && !rec.targetAnimePosterUrl) {
        if (!resolvedAnimeMeta[rec.targetAnimeId]) missingIds.add(String(rec.targetAnimeId));
      }
    });

    if (missingIds.size === 0) return;

    let cancelled = false;
    (async () => {
      const newlyFetched: Record<string, { title: string; posterUrl: string }> = {};
      for (const animeId of Array.from(missingIds)) {
        if (cancelled) break;
        try {
          const res = await fetch(`/api/anime/details/${encodeURIComponent(animeId)}`);
          const json = await res.json();
          const data = json?.data || json;
          if (data && (data.title || data.posterUrl)) {
            newlyFetched[animeId] = {
              title: data.title || animeId,
              posterUrl: data.posterUrl || ''
            };
          }
        } catch {}
      }

      if (cancelled || Object.keys(newlyFetched).length === 0) return;
      setResolvedAnimeMeta(prev => ({ ...prev, ...newlyFetched }));

      // Self-heal Firestore recommendation docs so they permanently store both anime titles & posters
      for (const rec of recommendations) {
        if (!rec.id) continue;
        const patch: Record<string, string> = {};
        const srcMeta = newlyFetched[rec.animeId] || resolvedAnimeMeta[rec.animeId];
        const tgtMeta = newlyFetched[rec.targetAnimeId] || resolvedAnimeMeta[rec.targetAnimeId];

        if ((!rec.animeTitle || rec.animeTitle === 'أنمي') && srcMeta?.title) {
          patch.animeTitle = srcMeta.title;
        }
        if (!rec.animePosterUrl && srcMeta?.posterUrl) {
          patch.animePosterUrl = srcMeta.posterUrl;
        }
        if (!rec.targetAnimePosterUrl && tgtMeta?.posterUrl) {
          patch.targetAnimePosterUrl = tgtMeta.posterUrl;
        }

        if (Object.keys(patch).length > 0) {
          updateDoc(doc(db, 'recommendations', rec.id), patch).catch(() => {});
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [recommendations]);

  const writeAudit = (actionType: string, targetLabel: string, details: string) => {
    const myProfile = allUsers.find(u => u.uid === auth.currentUser?.uid);
    const actorName = myProfile?.displayName || authUser?.displayName || authUser?.email || 'مشرف';
    moderationService.logAuditAction({
      actionType,
      targetLabel,
      details,
      actorName,
      actorRole: role || 'staff'
    });
  };

  // Computed Metrics
  const pendingReportsCount = useMemo(() => reports.filter(r => r.status === 'pending').length, [reports]);
  const pendingRecsCount = useMemo(
    () => recommendations.filter(r => (r.status || 'approved') === 'pending').length,
    [recommendations]
  );
  const totalModerationBadge = pendingReportsCount + pendingRecsCount + suggestionsList.length;

  // Unified Live Content Stream (Comments + Community Posts + Arena Feed + Leaks)
  const unifiedLiveContent = useMemo(() => {
    const items: any[] = [];

    liveComments.forEach(c => {
      const isComm = c.animeId === 'community' || c.animeId === 'community_reply';
      items.push({
        uniqueKey: `comments:${c.id}`,
        id: c.id,
        collectionName: 'comments',
        sourceType: isComm ? 'community_posts' : 'anime_comments',
        sourceLabel: isComm ? (c.animeId === 'community_reply' ? 'رد في المجتمع' : 'منشور مجتمع') : `تعليق أنمي (${c.animeId})`,
        authorId: c.userId || '',
        authorName: c.userDisplayName || getUserNameByUid(c.userId),
        text: c.text || '',
        isSpoiler: !!c.isSpoiler,
        animeId: c.animeId || '',
        likes: c.likes || 0,
        createdAtSec: c.createdAt?.seconds || 0
      });
    });

    liveArenaPosts.forEach(p => {
      items.push({
        uniqueKey: `arenaFeed:${p.id}`,
        id: p.id,
        collectionName: 'arenaFeed',
        sourceType: 'arena_feed',
        sourceLabel: 'منشور ساحة الأوتاكو',
        authorId: p.authorId || '',
        authorName: p.authorName || getUserNameByUid(p.authorId),
        text: p.content || p.text || p.title || '',
        isSpoiler: false,
        animeId: 'arena',
        likes: p.likes || 0,
        createdAtSec: p.createdAt?.seconds || 0
      });
    });

    liveLeaks.forEach(l => {
      items.push({
        uniqueKey: `otakuLeaks:${l.id}`,
        id: l.id,
        collectionName: 'otakuLeaks',
        sourceType: 'leaks',
        sourceLabel: `تسريب / خبر (${l.tag || 'عام'})`,
        authorId: l.authorId || '',
        authorName: l.source || 'ناشر تسريبات',
        text: `${l.title ? l.title + ' — ' : ''}${l.summary || ''}`,
        isSpoiler: false,
        animeId: 'leaks',
        likes: l.likes || 0,
        createdAtSec: l.createdAt?.seconds || 0
      });
    });

    items.sort((a, b) => b.createdAtSec - a.createdAtSec);
    return items;
  }, [liveComments, liveArenaPosts, liveLeaks, allUsers]);

  const filteredLiveContent = useMemo(() => {
    return unifiedLiveContent.filter(item => {
      if (liveContentSource !== 'all' && item.sourceType !== liveContentSource) return false;
      const q = liveContentSearch.toLowerCase().trim();
      if (!q) return true;
      return (
        (item.text || '').toLowerCase().includes(q) ||
        (item.authorName || '').toLowerCase().includes(q) ||
        (item.authorId || '').toLowerCase().includes(q) ||
        (item.sourceLabel || '').toLowerCase().includes(q)
      );
    });
  }, [unifiedLiveContent, liveContentSource, liveContentSearch]);

  const toggleSelectContentItem = (uniqueKey: string) => {
    setSelectedContentIds(prev =>
      prev.includes(uniqueKey) ? prev.filter(k => k !== uniqueKey) : [...prev, uniqueKey]
    );
  };

  const toggleSelectAllVisibleContent = () => {
    const visibleKeys = filteredLiveContent.slice(0, 60).map(i => i.uniqueKey);
    const allSelected = visibleKeys.length > 0 && visibleKeys.every(k => selectedContentIds.includes(k));
    if (allSelected) {
      setSelectedContentIds(prev => prev.filter(k => !visibleKeys.includes(k)));
    } else {
      setSelectedContentIds(Array.from(new Set([...selectedContentIds, ...visibleKeys])));
    }
  };

  const handleDeleteSingleLiveItem = async (item: any) => {
    try {
      await moderationService.authorizeServerModerationAction('delete_content', item.id, {
        collectionName: item.collectionName,
      });
      await deleteDoc(doc(db, item.collectionName, item.id));
      setSelectedContentIds(prev => prev.filter(k => k !== item.uniqueKey));
      writeAudit('report', item.authorName || item.id, `حذف مباشر لـ ${item.sourceLabel}: "${(item.text || '').slice(0, 40)}"`);
      notify('تم حذف المحتوى فوراً');
    } catch (err: any) {
      notify(err?.message || 'تعذر حذف المحتوى', 'error');
    }
  };

  const handleBulkDeleteSelectedContent = async () => {
    if (selectedContentIds.length === 0) return;
    try {
      await moderationService.authorizeServerModerationAction('delete_content', 'bulk_delete', {
        count: selectedContentIds.length,
      });
      const toDelete = unifiedLiveContent.filter(i => selectedContentIds.includes(i.uniqueKey));
      await Promise.all(
        toDelete.map(item => deleteDoc(doc(db, item.collectionName, item.id)).catch(() => {}))
      );
      writeAudit('report', `${toDelete.length} عنصر محتوى`, `حذف جماعي لـ ${toDelete.length} منشور/تعليق محدد`);
      setSelectedContentIds([]);
      notify(`تم حذف ${toDelete.length} عنصر محدد بنجاح`);
    } catch (err: any) {
      notify(err?.message || 'حدث خطأ أثناء الحذف الجماعي', 'error');
    }
  };

  const handleToggleLiveCommentSpoiler = async (item: any) => {
    if (item.collectionName !== 'comments') return;
    try {
      await moderationService.authorizeServerModerationAction('edit_comment', item.id, {
        isSpoiler: !item.isSpoiler,
      });
      await updateDoc(doc(db, 'comments', item.id), {
        isSpoiler: !item.isSpoiler
      });
      notify(!item.isSpoiler ? 'تم وضع علامة حرق (Spoiler) على التعليق' : 'تمت إزالة علامة الحرق');
    } catch (err: any) {
      notify(err?.message || 'تعذر تحديث حالة الحرق', 'error');
    }
  };

  const handleSaveLiveCommentEdit = async (item: any) => {
    if (!editingLiveCommentText.trim() || item.collectionName !== 'comments') return;
    try {
      await moderationService.authorizeServerModerationAction('edit_comment', item.id);
      await updateDoc(doc(db, 'comments', item.id), {
        text: editingLiveCommentText.trim()
      });
      writeAudit('report', item.authorName || item.id, `تعديل نص تعليق إدارياً`);
      setEditingLiveCommentId(null);
      setEditingLiveCommentText('');
      notify('تم حفظ تعديل التعليق بنجاح');
    } catch (err: any) {
      notify(err?.message || 'تعذر تعديل التعليق', 'error');
    }
  };

  const handleQuickMuteAuthor = async (authorId: string, authorName: string) => {
    if (!authorId) return;
    try {
      const targetUser = allUsers.find(u => u.uid === authorId || u.id === authorId);
      const nextMute = !(targetUser?.isMuted);
      await moderationService.restrictMember(authorId, { isMuted: nextMute });
      writeAudit('member_edit', authorName, nextMute ? 'كتم العضو من النشر والتعليق' : 'فك كتم العضو');
      notify(nextMute ? `تم كتم العضو (${authorName}) من التعليق والنشر` : `تم فك الكتم عن (${authorName})`);
    } catch (err: any) {
      notify(err?.message || 'تعذر تطبيق الكتم على العضو', 'error');
    }
  };

  const statsMetrics = useMemo(() => {
    const totalUsersCount = allUsers.length || 1;
    let totalCoins = 0;
    let totalXP = 0;
    let maxLevel = 1;
    let sumLevels = 0;

    allUsers.forEach(u => {
      totalCoins += Number(u.coins || 0);
      totalXP += Number(u.xp || 0);
      const lvl = Number(u.level || 1);
      sumLevels += lvl;
      if (lvl > maxLevel) maxLevel = lvl;
    });

    return {
      totalUsers: allUsers.length,
      totalBans: bannedUsers.length,
      totalStaff: usersInfo.length || 1,
      pendingReports: pendingReportsCount,
      resolvedReports: reports.filter(r => r.status !== 'pending').length,
      pendingRecs: pendingRecsCount,
      approvedRecs: recommendations.filter(r => (r.status || 'approved') === 'approved').length,
      mutedCount: allUsers.filter(u => u.isMuted).length,
      restrictedCount: allUsers.filter(u => u.isGamesRestricted || u.isCoinsRestricted).length,
      totalCoins,
      totalXP,
      maxLevel,
      avgCoins: Math.round(totalCoins / totalUsersCount),
      avgLevel: Math.round((sumLevels / totalUsersCount) * 10) / 10,
      segments: {
        starter: allUsers.filter(u => (u.level || 1) <= 5).length,
        regular: allUsers.filter(u => (u.level || 1) > 5 && (u.level || 1) <= 15).length,
        veteran: allUsers.filter(u => (u.level || 1) > 15 && (u.level || 1) <= 30).length,
        elite: allUsers.filter(u => (u.level || 1) > 30).length
      }
    };
  }, [allUsers, bannedUsers, usersInfo, reports, recommendations, pendingReportsCount, pendingRecsCount]);

  // Handlers
  const handleResolveReport = async (
    report: any,
    resolution: 'deleted_content' | 'dismissed'
  ) => {
    try {
      await moderationService.resolveReport(report.id, resolution, report.contentType, report.contentId);
      writeAudit(
        'report',
        getUserNameByUid(report.authorId || report.reporterId),
        resolution === 'deleted_content' ? `حذف محتوى مخالف (${report.reason})` : `تجاهل وإغلاق بلاغ (${report.reason})`
      );
      notify(resolution === 'deleted_content' ? 'تم حذف المحتوى المخالف وإغلاق البلاغ' : 'تم حفظ وتجاهل البلاغ');
    } catch (err: any) {
      notify(err?.message || 'تعذر معالجة البلاغ', 'error');
    }
  };

  const handleApproveRec = async (rec: any) => {
    try {
      await moderationService.authorizeServerModerationAction('manage_recommendations', rec.id, {
        status: 'approved',
      });
      const recRef = doc(db, 'recommendations', rec.id);
      await updateDoc(recRef, {
        status: 'approved',
        rejectionReason: deleteField()
      });
      if (rec.status !== 'approved' && rec.userId) {
        await updateDoc(doc(db, 'users', rec.userId), {
          approvedRecommendationsCount: increment(1),
          recommendationsAccepted: increment(1)
        }).catch(() => {});
      }
      if (rec.userId) {
        await notificationsService.createUserNotification(rec.userId, {
          title: 'تم اعتماد توصيتك',
          body: `تمت الموافقة على توصيتك لأنمي "${rec.targetAnimeTitle}".`,
          type: 'social',
          imageUrl: rec.targetAnimePosterUrl || rec.animePosterUrl || '',
          linkTo: `anime_details:${rec.animeId}`
        });
      }
      writeAudit('recommendation', rec.targetAnimeTitle || 'توصية', `اعتماد توصية العضو ${getUserNameByUid(rec.userId)}`);
      notify('تم قبول ونشر التوصية');
    } catch (err: any) {
      notify(err?.message || 'فشل في قبول التوصية', 'error');
    }
  };

  const handleRejectRec = async (rec: any, reason: string) => {
    if (!reason.trim()) {
      notify('يرجى كتابة سبب الرفض', 'error');
      return;
    }
    try {
      await moderationService.authorizeServerModerationAction('manage_recommendations', rec.id, {
        status: 'rejected',
      });
      await updateDoc(doc(db, 'recommendations', rec.id), {
        status: 'rejected',
        rejectionReason: reason.trim()
      });
      if (rec.status === 'approved' && rec.userId) {
        await updateDoc(doc(db, 'users', rec.userId), {
          approvedRecommendationsCount: increment(-1),
          recommendationsAccepted: increment(-1)
        }).catch(() => {});
      }
      if (rec.userId) {
        await notificationsService.createUserNotification(rec.userId, {
          title: 'تحديث بخصوص توصيتك',
          body: `لم تتم الموافقة على توصيتك لـ "${rec.targetAnimeTitle}". السبب: ${reason.trim()}`,
          type: 'system',
          imageUrl: rec.targetAnimePosterUrl || rec.animePosterUrl || '',
          linkTo: 'rewards'
        });
      }
      writeAudit('recommendation', rec.targetAnimeTitle || 'توصية', `رفض توصية (${reason.trim()})`);
      setRecIdBeingRejected(null);
      setRecRejectionReasonInput('');
      notify('تم رفض التوصية وإشعار العضو');
    } catch (err: any) {
      notify(err?.message || 'فشل في رفض التوصية', 'error');
    }
  };

  const handleDeleteRec = async (recId: string) => {
    try {
      const rec = recommendations.find(r => r.id === recId);
      await moderationService.deleteRecommendation(recId);
      if (rec && rec.status === 'approved' && rec.userId) {
        await updateDoc(doc(db, 'users', rec.userId), {
          approvedRecommendationsCount: increment(-1),
          recommendationsAccepted: increment(-1)
        }).catch(() => {});
      }
      writeAudit('recommendation', rec?.targetAnimeTitle || recId, 'حذف نهائي للتوصية');
      setRecIdBeingDeleted(null);
      notify('تم حذف التوصية نهائياً');
    } catch (err: any) {
      notify(err?.message || 'فشل حذف التوصية', 'error');
    }
  };

  const handleDeleteSuggestion = async (id: string) => {
    try {
      await moderationService.authorizeServerModerationAction('manage_suggestions', id);
      await deleteDoc(doc(db, 'suggestions', id));
      setSuggestionBeingDeleted(null);
      notify('تمت أرشفة وحذف الرسالة');
    } catch (err: any) {
      notify(err?.message || 'فشل حذف الرسالة', 'error');
    }
  };

  const handleReplyToSuggestion = async (s: any) => {
    if (!suggestionReplyText.trim()) return;
    try {
      await moderationService.authorizeServerModerationAction('manage_suggestions', s.id);
      await updateDoc(doc(db, 'suggestions', s.id), {
        adminReply: suggestionReplyText.trim(),
        repliedAt: serverTimestamp(),
        repliedBy: authUser?.displayName || 'الإدارة',
        status: 'replied'
      });
      if (s.userId && s.userId !== 'guest_user') {
        await notificationsService.createUserNotification(s.userId, {
          title: s.type === 'complaint' ? 'رد الإدارة على تذكرتك / شكواك' : 'رد الإدارة على اقتراحك',
          body: suggestionReplyText.trim(),
          type: 'system',
          linkTo: 'support_suggestions'
        });
      }
      writeAudit('suggestion', s.displayName || 'عضو', `رد على تذكرة: ${suggestionReplyText.trim().slice(0, 60)}`);
      setReplyingSuggestion(null);
      setSuggestionReplyText('');
      notify('تم حفظ الرد على التذكرة وإرساله لإشعارات العضو');
    } catch (err: any) {
      notify(err?.message || 'تعذر إرسال الرد', 'error');
    }
  };

  const handleUpdateSuggestionStatus = async (s: any, newStatus: 'pending' | 'in_progress' | 'replied' | 'resolved') => {
    try {
      await moderationService.authorizeServerModerationAction('manage_suggestions', s.id, {
        status: newStatus,
      });
      await updateDoc(doc(db, 'suggestions', s.id), {
        status: newStatus
      });
      notify('تم تحديث حالة التذكرة');
    } catch (err: any) {
      notify(err?.message || 'تعذر تحديث حالة التذكرة', 'error');
    }
  };

  const handleUpdateUserStats = async () => {
    if (!editingUser) return;
    try {
      setIsUpdatingUser(true);
      const { level: finalLevel, xp: finalXp } = calculateLevelAndXpFromTotal(editingXP);
      await moderationService.updateUserCoinsAndXP(editingUser.uid, editingCoins, finalXp, finalLevel);
      await moderationService.restrictMember(editingUser.uid, {
        isMuted: editingIsMuted,
        isGamesRestricted: editingIsGamesRestricted,
        isCoinsRestricted: editingIsCoinsRestricted
      });
      writeAudit(
        'member_edit',
        editingUser.displayName || editingUser.username || editingUser.uid,
        `تعديل الرصيد (${editingCoins} كوينز، Lvl ${finalLevel})${editingIsMuted ? ' + كتم' : ''}`
      );
      setEditingUser(null);
      notify('تم تحديث بيانات وصلاحيات العضو');
    } catch (err: any) {
      notify(err?.message || 'فشل تحديث بيانات العضو', 'error');
    } finally {
      setIsUpdatingUser(false);
    }
  };

  const handleAssignRole = async () => {
    if (!userIdInput.trim()) {
      notify('يرجى اختيار عضو أو كتابة المعرّف أولاً', 'error');
      return;
    }
    try {
      const resolvedUid = resolveUserByUsernameOrUid(userIdInput);
      await moderationService.assignRole(resolvedUid, roleInput);
      writeAudit('role', getUserNameByUid(resolvedUid), `تغيير الرتبة إلى ${roleInput}`);
      setUserIdInput('');
      setSelectedSearchUser(null);
      setRoleSearchQuery('');
      notify('تم تحديث رتبة العضو بنجاح');
    } catch (err: any) {
      notify(err?.message || 'تعذر تعيين الرتبة', 'error');
    }
  };

  const handleDemoteStaff = async (uid: string) => {
    try {
      await moderationService.assignRole(uid, 'user');
      writeAudit('role', getUserNameByUid(uid), 'سحب الصلاحيات وإعادته لرتبة عضو');
      setConfirmDemoteUid(null);
      notify('تم سحب الصلاحيات وإعادة العضو إلى رتبة مستخدم');
    } catch (err: any) {
      notify(err?.message || 'فشل سحب الصلاحيات', 'error');
    }
  };

  const handleSaveModCustomPermissions = async () => {
    if (!editingPermissionsMod) return;
    try {
      await moderationService.authorizeServerModerationAction(
        'manage_mod_permissions',
        editingPermissionsMod.uid,
        modCustomPerms
      );
      await updateDoc(doc(db, 'globalRoles', editingPermissionsMod.uid), {
        canBan: modCustomPerms.canBan,
        canNotify: modCustomPerms.canNotify,
        canManageSettings: modCustomPerms.canManageSettings,
        canViewRoles: modCustomPerms.canViewRoles
      });
      writeAudit('role', getUserNameByUid(editingPermissionsMod.uid), 'تحديث الصلاحيات الفرعية للمشرف');
      setEditingPermissionsMod(null);
      notify('تم حفظ صلاحيات المشرف');
    } catch (err: any) {
      notify(err?.message || 'فشل حفظ الصلاحيات', 'error');
    }
  };

  const handleBan = async (directUid?: string) => {
    const targetInput = directUid || userIdInput;
    if (!targetInput.trim()) {
      notify('يرجى تحديد معرّف العضو المراد حظره', 'error');
      return;
    }
    try {
      const resolvedUid = resolveUserByUsernameOrUid(targetInput);
      const reason = banReasonInput.trim() || 'مخالفة شروط المنصة';
      await moderationService.banUser(resolvedUid, reason);
      writeAudit('ban', getUserNameByUid(resolvedUid), `حظر الحساب — السبب: ${reason}`);
      setUserIdInput('');
      notify('تم حظر الحساب وإضافته لقائمة المبعدين');
    } catch (err: any) {
      notify(err?.message || 'تعذر حظر الحساب', 'error');
    }
  };

  const handleUnban = async (uid: string) => {
    try {
      await moderationService.unbanUser(uid);
      writeAudit('ban', getUserNameByUid(uid), 'رفع الحظر عن الحساب');
      notify('تم رفع الحظر عن الحساب');
    } catch (err: any) {
      notify(err?.message || 'تعذر رفع الحظر', 'error');
    }
  };

  const handleCreatePromoCode = async () => {
    const clean = newPromoCode.trim().toUpperCase().replace(/\s+/g, '');
    if (!clean) {
      notify('يرجى كتابة رمز الكود أولاً (مثل OTAKU500)', 'error');
      return;
    }
    try {
      setIsCreatingPromo(true);
      await moderationService.createPromoCode({
        code: clean,
        rewardCoins: newPromoCoins,
        rewardXp: newPromoXp,
        maxUses: newPromoMaxUses
      });
      writeAudit('promo', clean, `إنشاء كود هدية (+${newPromoCoins} كوينز، +${newPromoXp} XP، لـ ${newPromoMaxUses} عضو)`);
      setNewPromoCode('');
      notify(`تم إنشاء كود المكافأة (${clean}) بنجاح`);
    } catch {
      notify('تعذر إنشاء كود المكافأة', 'error');
    } finally {
      setIsCreatingPromo(false);
    }
  };

  const handleTogglePromo = async (promo: PromoCodeEntry) => {
    try {
      await moderationService.togglePromoCode(promo.id, !promo.active);
      writeAudit('promo', promo.code, promo.active ? 'إيقاف كود المكافأة مؤقتاً' : 'إعادة تفعيل كود المكافأة');
      notify(promo.active ? 'تم إيقاف الكود مؤقتاً' : 'تم تفعيل الكود');
    } catch {
      notify('فشل تحديث حالة الكود', 'error');
    }
  };

  const handleDeletePromo = async (codeId: string) => {
    try {
      await moderationService.deletePromoCode(codeId);
      writeAudit('promo', codeId, 'حذف كود المكافأة نهائياً');
      notify('تم حذف كود المكافأة');
    } catch {
      notify('فشل حذف الكود', 'error');
    }
  };

  const handleMassGrant = async () => {
    if (massGrantCoins <= 0 && massGrantXp <= 0) {
      notify('يرجى تحديد قيمة الكوينز أو الخبرة المراد إهداؤها', 'error');
      return;
    }
    try {
      setIsGrantingMass(true);
      const count = await moderationService.massGrantReward({
        coins: massGrantCoins,
        xp: massGrantXp,
        segment: massGrantSegment
      });
      await notificationsService.createGlobalNotification({
        title: '🎁 هدية جماعية من الإدارة!',
        body: `تم منح +${massGrantCoins} كوينز و +${massGrantXp} XP لحسابك بمناسبة فعاليات المنصة!`,
        type: 'reward',
        linkTo: 'rewards'
      });
      writeAudit(
        'promo',
        `إهداء جماعي (${count} عضو)`,
        `منح +${massGrantCoins} كوينز و +${massGrantXp} XP لشريحة (${massGrantSegment})`
      );
      notify(`تم إهداء المكافأة بنجاح إلى ${count} عضو وإرسال إشعار عام!`);
    } catch {
      notify('تعذر تنفيذ الإهداء الجماعي', 'error');
    } finally {
      setIsGrantingMass(false);
    }
  };

  const saveAnimeCuration = async (nextPinned?: any[], nextHidden?: any[]) => {
    const pList = nextPinned !== undefined ? nextPinned : pinnedAnimeList;
    const hList = nextHidden !== undefined ? nextHidden : hiddenAnimeList;
    try {
      setIsSavingCuration(true);
      const payload = {
        pinnedAnime: pList,
        hiddenAnime: hList,
        updatedAt: new Date().toISOString()
      };
      await moderationService.updateGlobalSettings('animeCuration', payload);
      localStorage.setItem('adminAnimeCuration', JSON.stringify(payload));
      writeAudit(
        'settings',
        'تخصيص وتثبيت الأنميات',
        `تحديث القائمة (${pList.length} أنمي مثبت، ${hList.length} أنمي مخفي)`
      );
      notify('تم حفظ وتطبيق إعدادات تثبيت وإخفاء الأنميات فوراً');
    } catch {
      notify('تعذر حفظ إعدادات الفلترة والتثبيت', 'error');
    } finally {
      setIsSavingCuration(false);
    }
  };

  const handleSendNotification = async () => {
    if (!notifTitle.trim() || !notifBody.trim()) return;
    try {
      setIsSendingNotif(true);
      await moderationService.authorizeServerModerationAction(
        'send_broadcast',
        notifTargetChoice === 'all' ? 'all' : notifTargetUid
      );
      let finalLink = '';
      if (interactiveLinkChoice === 'rewards') finalLink = 'rewards';
      else if (interactiveLinkChoice === 'games') finalLink = 'games';
      else if (interactiveLinkChoice === 'leaderboard') finalLink = 'leaderboard';
      else if (interactiveLinkChoice === 'community') finalLink = 'community';
      else if (interactiveLinkChoice === 'anime' && selectedNotifAnime) {
        const targetId = selectedNotifAnime._id || selectedNotifAnime.mal_id || selectedNotifAnime.id;
        finalLink = `anime_details:${targetId}`;
      }

      const imageToUse =
        notifImageUrl.trim() ||
        (interactiveLinkChoice === 'anime' && selectedNotifAnime?.posterUrl ? selectedNotifAnime.posterUrl : undefined);

      if (notifTargetChoice === 'specific') {
        if (!notifTargetUid.trim()) {
          notify('يرجى إدخال اسم المستخدم أو UID للمستلم', 'error');
          return;
        }
        const resolvedUid = resolveUserByUsernameOrUid(notifTargetUid);
        await notificationsService.createUserNotification(resolvedUid, {
          title: notifTitle.trim(),
          body: notifBody.trim(),
          type: notifType as any,
          imageUrl: imageToUse,
          linkTo: finalLink || undefined
        });
      } else {
        await notificationsService.createGlobalNotification({
          title: notifTitle.trim(),
          body: notifBody.trim(),
          type: notifType as any,
          imageUrl: imageToUse,
          linkTo: finalLink || undefined
        });
      }

      writeAudit(
        'broadcast',
        notifTargetChoice === 'all' ? 'جميع الأعضاء' : getUserNameByUid(notifTargetUid),
        `إرسال إشعار: "${notifTitle.trim()}"`
      );
      setNotifTitle('');
      setNotifBody('');
      setNotifImageUrl('');
      setSelectedNotifAnime(null);
      setAnimeSearchQuery('');
      setAnimeSuggestions([]);
      setInteractiveLinkChoice('none');
      notify('تم بث وإرسال الإشعار بنجاح');
    } catch (err: any) {
      notify(err?.message || 'حدث خطأ أثناء إرسال الإشعار', 'error');
    } finally {
      setIsSendingNotif(false);
    }
  };

  const saveSliderSettings = async () => {
    try {
      setIsSavingSettings(true);
      const clampedAnimeLimit = Math.min(10, Math.max(1, Number(sliderLimit) || 5));
      const clampedMangaLimit = Math.min(10, Math.max(1, Number(mangaBannerLimit) || 5));
      const clampedAnimeSpeed = Math.min(15, Math.max(2, Number(sliderSpeed) || 4));
      const clampedMangaSpeed = Math.min(15, Math.max(2, Number(mangaBannerSpeed) || 5));
      const safeDualHome: DualHomeConfig = {
        ...dualHomeConfig,
        enableAnimeHome: dualHomeConfig.enableAnimeHome || !dualHomeConfig.enableMangaHome,
        enableMangaHome: dualHomeConfig.enableMangaHome,
        defaultVisitorHome:
          !dualHomeConfig.enableMangaHome
            ? 'anime'
            : !dualHomeConfig.enableAnimeHome
            ? 'manga'
            : dualHomeConfig.defaultVisitorHome,
      };
      setSliderLimit(clampedAnimeLimit);
      setMangaBannerLimit(clampedMangaLimit);
      setSliderSpeed(clampedAnimeSpeed);
      setMangaBannerSpeed(clampedMangaSpeed);
      setDualHomeConfig(safeDualHome);

      const payload = {
        limit: clampedAnimeLimit,
        season: sliderSeason,
        sliderMode,
        animeBannerStyle,
        customAnime: customSliderAnime.slice(0, 10),
        speed: clampedAnimeSpeed,
        globalAnnouncement,
        mangaBannerStyle,
        mangaBannerLimit: clampedMangaLimit,
        mangaSliderMode,
        customMangaBanner: customMangaBanner.slice(0, 10),
        mangaBannerSpeed: clampedMangaSpeed,
        mangaAnnouncement,
        dualHomeConfig: safeDualHome,
        updatedAt: new Date().toISOString()
      };
      await moderationService.updateGlobalSettings('slider', payload);
      localStorage.setItem('adminSliderSettings', JSON.stringify(payload));

      await moderationService.updateGlobalSettings('telegramLinks', {
        helpTelegramUrl,
        groupTelegramUrl,
        donateTelegramUrl,
        updatedAt: new Date().toISOString()
      });

      await moderationService.updateGlobalSettings('monetization', {
        mode: monetizationMode,
        directLinkUrl,
        backupDirectLinkUrl,
        videoAdUrl,
        vastTagUrl,
        admobRewardedId,
        scriptCode,
        requireClickVerification,
        cooldownSeconds: adCooldownSeconds,
        stayTime,
        rewardCoins: adRewardCoins,
        rewardXp: adRewardXp,
        dailyLimit: adDailyLimit,
        customAds: customAdsList,
        updatedAt: new Date().toISOString()
      });

      writeAudit(
        'settings',
        'إعدادات الشاشتين والبانرات',
        `تحديث بانر الأنمي (${animeBannerStyle}/${clampedAnimeLimit}) وبانر المانجا (${mangaBannerStyle}/${clampedMangaLimit}) وإعدادات الشاشتين`
      );
      notify('تم حفظ ومزامنة إعدادات الشاشتين والبانرات والمنصة بنجاح');
    } catch (err: any) {
      notify(err?.message || 'فشل حفظ الإعدادات', 'error');
    } finally {
      setIsSavingSettings(false);
    }
  };

  const [cacheStats, setCacheStats] = useState<any>(null);
  const [isUpdatingCacheMode, setIsUpdatingCacheMode] = useState(false);

  const loadCacheEngineStats = async () => {
    try {
      const headers = await getAdminAuthHeaders();
      const res = await fetch('/api/cache/stats', { headers });
      const data = await res.json();
      if (data.success && data.data) {
        setCacheStats(data.data.stats);
      }
    } catch {}
  };

  useEffect(() => {
    if (workspace === 'platform' && platformSubTab === 'maintenance') {
      loadCacheEngineStats();
      const t = setInterval(loadCacheEngineStats, 4000);
      return () => clearInterval(t);
    }
  }, [workspace, platformSubTab]);

  const handleToggleServerCacheMode = async (newMode: '10k_smart_ram' | 'zero_live') => {
    try {
      setIsUpdatingCacheMode(true);
      const headers = await getAdminAuthHeaders();
      const res = await fetch('/api/cache/mode', {
        method: 'POST',
        headers,
        body: JSON.stringify({ mode: newMode })
      });
      const data = await res.json();
      if (data.success && data.data?.stats) {
        setCacheStats(data.data.stats);
        notify(
          newMode === '10k_smart_ram'
            ? 'تم تفعيل محرك 10,000+ مستخدم (دمج الطلبات المتزامنة + ذاكرة RAM اللحظية بدون ملفات)'
            : 'تم التحويل إلى وضع الاتصال المباشر الحي 100% (Zero-Cache Live)'
        );
      } else {
        notify(data?.message || 'تعذر تغيير وضع محرك التخزين اللحظي', 'error');
      }
    } catch (err: any) {
      notify(err?.message || 'تعذر تغيير وضع محرك التخزين اللحظي', 'error');
    } finally {
      setIsUpdatingCacheMode(false);
    }
  };

  const handlePurgeRamCacheNow = async () => {
    try {
      setIsUpdatingCacheMode(true);
      const headers = await getAdminAuthHeaders();
      const res = await fetch('/api/cache/clear', { method: 'POST', headers });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.message || 'رفض الخادم تفريغ الذاكرة');
      }
      await loadCacheEngineStats();
      notify('تم تفريغ ذاكرة RAM اللحظية بالكامل بنجاح');
    } catch (err: any) {
      notify(err?.message || 'تعذر تفريغ ذاكرة RAM اللحظية', 'error');
    } finally {
      setIsUpdatingCacheMode(false);
    }
  };

  const handleAddQueueJob = async () => {
    try {
      setIsSubmittingQueueTask(true);
      let parsedData = {};
      if (queueTaskData.trim()) {
        if (queueTaskName === 'fetchAnimeDetails') parsedData = { animeId: queueTaskData.trim() };
        else if (queueTaskName === 'fetchEpisodeServers') parsedData = { episodeId: queueTaskData.trim() };
        else {
          try {
            parsedData = JSON.parse(queueTaskData.trim());
          } catch {
            parsedData = { rawInput: queueTaskData.trim() };
          }
        }
      }
      const headers = await getAdminAuthHeaders();
      const res = await fetch('/api/queue/add', {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: queueTaskName, data: parsedData, maxRetries: 2 })
      });
      const data = await res.json();
      if (data.success) {
        notify(`تمت جدولة المهمة (${data.jobId})`);
        setQueueTaskData('');
        const stRes = await fetch('/api/queue/status', { headers });
        const stData = await stRes.json();
        if (stData.success) setQueueStatus(stData);
      } else {
        notify(data.message || 'تعذر جدولة المهمة', 'error');
      }
    } catch (err: any) {
      notify(err?.message || 'فشل الاتصال بمحرك المهام', 'error');
    } finally {
      setIsSubmittingQueueTask(false);
    }
  };

  const handleClearQueueLogs = async () => {
    try {
      const headers = await getAdminAuthHeaders();
      const res = await fetch('/api/queue/clear', { method: 'POST', headers });
      const data = await res.json();
      if (data.success) {
        notify('تم تصفية سجل المهام');
        setQueueStatus((prev: any) =>
          prev ? { ...prev, jobs: [], stats: { pending: 0, active: 0, completed: 0, failed: 0, total: 0 } } : null
        );
      } else {
        notify(data?.message || 'فشل تصفية السجل', 'error');
      }
    } catch (err: any) {
      notify(err?.message || 'فشل تصفية السجل', 'error');
    }
  };

  const [isPurgingAllCaches, setIsPurgingAllCaches] = useState(false);

  const handlePurgeAllSystemCaches = async () => {
    try {
      setIsPurgingAllCaches(true);
      await moderationService.authorizeServerModerationAction('manage_cache_queue');
      const headers = await getAdminAuthHeaders();
      // 1. Purge Server Multi-Tier Cache (node-cache + .cache/*.json + Redis)
      await fetch('/api/cache/clear', { method: 'POST', headers }).catch(() => {});

      // 2. Purge Client Memory + LocalStorage Caches
      const { clientCache } = await import('../utils/clientCache');
      clientCache.clearPrefix('client_');
      clientCache.clearPrefix('servers_');
      clientCache.clearPrefix('anime_');
      clientCache.clearPrefix('recent_');
      clientCache.clearPrefix('schedule_');
      clientCache.clearPrefix('season_');
      clientCache.clearPrefix('explore_');

      try {
        sessionStorage.clear();
      } catch {}

      // 3. Purge Browser CacheStorage & Service Workers
      if (typeof window !== 'undefined' && 'caches' in window) {
        const names = await caches.keys();
        await Promise.all(names.map((name) => caches.delete(name)));
      }

      writeAudit('settings', 'تخزين المنصة (Cache)', 'تفريغ شامل لجميع طبقات التخزين المؤقت في الخادم والمتصفح');
      notify('تم تفريغ جميع البيانات القديمة والتخزين المؤقت من الخادم والمتصفح بنجاح!');
    } catch (err: any) {
      notify(err?.message || 'حدث خطأ أثناء تفريغ التخزين المؤقت', 'error');
    } finally {
      setIsPurgingAllCaches(false);
    }
  };

  const handleResetAllAccounts = async () => {
    try {
      setIsResettingAll(true);
      await moderationService.resetAllAccounts();
      setConfirmResetModal(false);
      notify('تم تصفير وإعادة تهيئة حسابات المنصة بالكامل');
    } catch (err: any) {
      notify(err?.message || 'فشلت عملية تصفير الحسابات', 'error');
    } finally {
      setIsResettingAll(false);
    }
  };

  const handleFactoryWipeForLaunch = async () => {
    try {
      setIsFactoryWiping(true);
      // 1. Wipe all Firestore collections, accounts, subcollections, and cloud caches (validates server-side Owner role first)
      const resStats = await moderationService.factoryWipeForLaunch();

      // 2. Wipe Server Multi-Tier Cache (.cache/*.json, node-cache, Redis, ScraperQueue) with Admin SDK token
      const headers = await getAdminAuthHeaders();
      await fetch('/api/system/factory-reset', { method: 'POST', headers }).catch(() => {});

      // 3. Wipe Client Memory, LocalStorage, SessionStorage, and Service Worker Caches
      const { clientCache } = await import('../utils/clientCache');
      clientCache.clear();
      try {
        sessionStorage.clear();
      } catch {}
      if (typeof window !== 'undefined' && 'caches' in window) {
        try {
          const names = await caches.keys();
          await Promise.all(names.map((name) => caches.delete(name)));
        } catch {}
      }

      setConfirmFactoryWipeModal(false);
      notify(
        `تم تنظيف الخوادم وحذف ${resStats.deletedUsers} حساب و ${resStats.deletedDocs} سجل وجميع النسخ والكاشات بنجاح — التطبيق جاهز للإطلاق!`
      );
    } catch (err: any) {
      notify(err?.message || 'حدث خطأ أثناء التنظيف الشامل للإطلاق', 'error');
    } finally {
      setIsFactoryWiping(false);
    }
  };

  // Loading & Unauthorized States
  if (role === null) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center p-6" dir="rtl">
        <div className="flex flex-col items-center gap-3">
          <div className="w-9 h-9 border-2 border-[#FF1744] border-t-transparent rounded-full animate-spin" />
          <p className="text-zinc-400 text-xs font-bold">جاري التحقق من صلاحيات الإدارة...</p>
        </div>
      </div>
    );
  }

  if (role === 'user' && !isDirectStaff) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center p-6" dir="rtl">
        <div className="bg-[#121215] border border-zinc-800/80 p-7 rounded-2xl text-center max-w-sm w-full space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mx-auto text-rose-500">
            <ShieldAlert size={24} />
          </div>
          <div className="space-y-1">
            <h2 className="text-white text-base font-black">منطقة مخصصة للإدارة</h2>
            <p className="text-zinc-400 text-xs leading-relaxed">
              لا تملك صلاحيات الوصول إلى مركز التحكم والإشراف.
            </p>
          </div>
          <button
            onClick={onBack}
            className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-2.5 rounded-xl text-xs transition cursor-pointer"
          >
            العودة للرئيسية
          </button>
        </div>
      </div>
    );
  }

  const canAccessBroadcast = role === 'owner' || role === 'admin' || modPerms.canNotify;
  const canAccessPlatform = role === 'owner' || role === 'admin' || modPerms.canManageSettings;

  const mainNavItems: {
    id: MainWorkspace;
    label: string;
    icon: React.ElementType;
    badge?: number;
    hidden?: boolean;
  }[] = [
    { id: 'overview', label: 'نظرة عامة', icon: LayoutDashboard },
    { id: 'moderation', label: 'الرقابة والمحتوى', icon: ShieldAlert, badge: totalModerationBadge },
    { id: 'community', label: 'الأعضاء والرتب', icon: Users },
    { id: 'broadcast', label: 'الإشعارات والبث', icon: BellRing, hidden: !canAccessBroadcast },
    { id: 'platform', label: 'إعدادات المنصة', icon: Sliders, hidden: !canAccessPlatform }
  ];

  const suggestedRoleUsers =
    roleSearchQuery.trim().length > 0
      ? allUsers.filter(u => matchesUserSearch(u, roleSearchQuery)).slice(0, 8)
      : allUsers.slice(0, 6);

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 pb-24 font-sans" dir="rtl">
      {/* Top Command Bar */}
      <header
        className="sticky top-0 z-40 bg-[#09090b]/95 backdrop-blur-md border-b border-zinc-800/80"
        style={{ paddingTop: 'var(--safe-top, 0px)' }}
      >
        <div className={`max-w-7xl mx-auto ${display.isCoverScreen ? 'px-3' : 'px-4 md:px-6'} min-h-[60px] py-2 flex items-center justify-between gap-2.5`}>
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              onClick={onBack}
              className="w-11 h-11 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-300 hover:text-white hover:border-zinc-700 transition cursor-pointer shrink-0"
              title="رجوع"
            >
              <ChevronRight size={19} />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-sm md:text-base font-black text-white tracking-tight truncate">مركز الإدارة والإعدادات</h1>
                <span className="text-[11px] font-bold text-amber-400 shrink-0">
                  · {role === 'owner' ? 'المالك' : role === 'admin' ? 'مدير' : 'مشرف'}
                </span>
              </div>
              <p className="text-[11px] text-zinc-500 hidden sm:block truncate">
                إدارة فورية متزامنة مع قاعدة البيانات
              </p>
            </div>
          </div>

          {/* Quick KPI Triggers in Header */}
          <div className="flex items-center gap-2 shrink-0">
            {pendingReportsCount > 0 && (
              <button
                onClick={() => {
                  setWorkspace('moderation');
                  setModSubTab('reports');
                }}
                className="min-h-[40px] flex items-center gap-1.5 px-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-400 text-xs font-bold tabular-nums cursor-pointer hover:bg-rose-500/15 transition"
              >
                <ShieldAlert size={14} />
                <span>{pendingReportsCount} بلاغ</span>
              </button>
            )}
            {pendingRecsCount > 0 && !display.isCoverScreen && (
              <button
                onClick={() => {
                  setWorkspace('moderation');
                  setModSubTab('recommendations');
                  setRecStatusFilter('pending');
                }}
                className="min-h-[40px] flex items-center gap-1.5 px-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-400 text-xs font-bold tabular-nums cursor-pointer hover:bg-amber-500/15 transition"
              >
                <Lightbulb size={14} />
                <span>{pendingRecsCount} توصية</span>
              </button>
            )}
            <div className="hidden md:flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-400 font-semibold">
              <ShieldCheck size={14} className={serverSession ? 'text-emerald-400' : 'text-amber-400'} />
              <span>
                {isServerVerifying
                  ? 'جاري التحقق...'
                  : serverSession
                    ? 'حماية Firebase Admin'
                    : 'متصل لحظياً'}
              </span>
            </div>
          </div>
        </div>

        {/* Main 5-Workspace Navigation Bar */}
        <div className={`max-w-7xl mx-auto ${display.isCoverScreen ? 'px-3' : 'px-4 md:px-6'} border-t border-zinc-900/80`}>
          <div className="flex items-center gap-1.5 overflow-x-auto hide-scrollbar py-2">
            {mainNavItems
              .filter(item => !item.hidden)
              .map(item => {
                const Icon = item.icon;
                const active = workspace === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setWorkspace(item.id)}
                    className={`min-h-[44px] flex items-center gap-2 px-3.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                      active
                        ? 'bg-[#FF1744] text-white shadow-[0_2px_12px_rgba(255,23,68,0.3)]'
                        : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900'
                    }`}
                  >
                    <Icon size={15} />
                    <span>{item.label}</span>
                    {item.badge !== undefined && item.badge > 0 && (
                      <span className="text-[11px] font-black font-mono tabular-nums opacity-90">
                        ({item.badge})
                      </span>
                    )}
                  </button>
                );
              })}
          </div>
        </div>
      </header>

      {/* Floating Toast Notification */}
      <ViewportPortal>
        <AnimatePresence>
          {toast && (
            <motion.div
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              style={{ top: 'calc(var(--safe-top, 0px) + 1rem)' }}
              className="fixed left-1/2 -translate-x-1/2 z-[9999] max-w-md w-[92%]"
            >
              <div
                className={`px-4 py-3 rounded-xl border shadow-2xl flex items-center justify-between gap-3 text-xs font-bold backdrop-blur-md ${
                  toast.type === 'error'
                    ? 'bg-rose-950/90 border-rose-500/40 text-rose-200'
                    : 'bg-emerald-950/90 border-emerald-500/40 text-emerald-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  {toast.type === 'error' ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}
                  <span>{toast.text}</span>
                </div>
                <button onClick={() => setToast(null)} className="w-8 h-8 flex items-center justify-center opacity-70 hover:opacity-100 cursor-pointer">
                  <X size={15} />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </ViewportPortal>

      {/* Main Content Container */}
      <main className={`max-w-7xl mx-auto ${display.isCoverScreen ? 'px-3' : 'px-4 md:px-6'} pt-5`}>
        <AdminDashboardProvider
          value={{
            onBack,
            onNavigate,
            authUser,
            isDirectStaff,
            role,
            setRole,
            serverSession,
            setServerSession,
            isServerVerifying,
            setIsServerVerifying,
            workspace,
            setWorkspace,
            modSubTab,
            setModSubTab,
            commSubTab,
            setCommSubTab,
            platformSubTab,
            setPlatformSubTab,
            usersInfo,
            setUsersInfo,
            bannedUsers,
            setBannedUsers,
            reports,
            setReports,
            allUsers,
            setAllUsers,
            recommendations,
            setRecommendations,
            suggestionsList,
            setSuggestionsList,
            auditLogs,
            setAuditLogs,
            promoCodesList,
            setPromoCodesList,
            auditTypeFilter,
            setAuditTypeFilter,
            liveComments,
            setLiveComments,
            liveArenaPosts,
            setLiveArenaPosts,
            liveLeaks,
            setLiveLeaks,
            liveContentSource,
            setLiveContentSource,
            liveContentSearch,
            setLiveContentSearch,
            selectedContentIds,
            setSelectedContentIds,
            editingLiveCommentId,
            setEditingLiveCommentId,
            editingLiveCommentText,
            setEditingLiveCommentText,
            newPromoCode,
            setNewPromoCode,
            newPromoCoins,
            setNewPromoCoins,
            newPromoXp,
            setNewPromoXp,
            newPromoMaxUses,
            setNewPromoMaxUses,
            isCreatingPromo,
            setIsCreatingPromo,
            massGrantCoins,
            setMassGrantCoins,
            massGrantXp,
            setMassGrantXp,
            massGrantSegment,
            setMassGrantSegment,
            isGrantingMass,
            setIsGrantingMass,
            pinnedAnimeList,
            setPinnedAnimeList,
            hiddenAnimeList,
            setHiddenAnimeList,
            curationSearchQuery,
            setCurationSearchQuery,
            curationSearchResults,
            setCurationSearchResults,
            isSearchingCurationAnime,
            setIsSearchingCurationAnime,
            pinEpisodeInput,
            setPinEpisodeInput,
            isSavingCuration,
            setIsSavingCuration,
            modPerms,
            setModPerms,
            reportFilter,
            setReportFilter,
            recStatusFilter,
            setRecStatusFilter,
            searchRecQuery,
            setSearchRecQuery,
            recIdBeingRejected,
            setRecIdBeingRejected,
            recRejectionReasonInput,
            setRecRejectionReasonInput,
            recIdBeingDeleted,
            setRecIdBeingDeleted,
            resolvedAnimeMeta,
            setResolvedAnimeMeta,
            suggestionsFilter,
            setSuggestionsFilter,
            suggestionBeingDeleted,
            setSuggestionBeingDeleted,
            replyingSuggestion,
            setReplyingSuggestion,
            suggestionReplyText,
            setSuggestionReplyText,
            searchUserQuery,
            setSearchUserQuery,
            userFilterBy,
            setUserFilterBy,
            userSortBy,
            setUserSortBy,
            editingUser,
            setEditingUser,
            editingCoins,
            setEditingCoins,
            editingXP,
            setEditingXP,
            editingLevel,
            setEditingLevel,
            editingIsMuted,
            setEditingIsMuted,
            editingIsGamesRestricted,
            setEditingIsGamesRestricted,
            editingIsCoinsRestricted,
            setEditingIsCoinsRestricted,
            isUpdatingUser,
            setIsUpdatingUser,
            roleSearchQuery,
            setRoleSearchQuery,
            selectedSearchUser,
            setSelectedSearchUser,
            userIdInput,
            setUserIdInput,
            roleInput,
            setRoleInput,
            banReasonInput,
            setBanReasonInput,
            confirmDemoteUid,
            setConfirmDemoteUid,
            editingPermissionsMod,
            setEditingPermissionsMod,
            modCustomPerms,
            setModCustomPerms,
            notifTitle,
            setNotifTitle,
            notifBody,
            setNotifBody,
            notifType,
            setNotifType,
            notifImageUrl,
            setNotifImageUrl,
            notifTargetChoice,
            setNotifTargetChoice,
            notifTargetUid,
            setNotifTargetUid,
            interactiveLinkChoice,
            setInteractiveLinkChoice,
            animeSearchQuery,
            setAnimeSearchQuery,
            animeSuggestions,
            setAnimeSuggestions,
            isSearchingAnime,
            setIsSearchingAnime,
            selectedNotifAnime,
            setSelectedNotifAnime,
            isSendingNotif,
            setIsSendingNotif,
            sliderLimit,
            setSliderLimit,
            sliderSeason,
            setSliderSeason,
            sliderMode,
            setSliderMode,
            animeBannerStyle,
            setAnimeBannerStyle,
            customSliderAnime,
            setCustomSliderAnime,
            sliderSearchQuery,
            setSliderSearchQuery,
            sliderSearchResults,
            setSliderSearchResults,
            isSearchingSliderAnime,
            setIsSearchingSliderAnime,
            sliderSpeed,
            setSliderSpeed,
            globalAnnouncement,
            setGlobalAnnouncement,
            mangaBannerStyle,
            setMangaBannerStyle,
            mangaBannerLimit,
            setMangaBannerLimit,
            mangaSliderMode,
            setMangaSliderMode,
            customMangaBanner,
            setCustomMangaBanner,
            mangaBannerSearchQuery,
            setMangaBannerSearchQuery,
            mangaBannerSearchResults,
            setMangaBannerSearchResults,
            isSearchingMangaBanner,
            setIsSearchingMangaBanner,
            mangaBannerSpeed,
            setMangaBannerSpeed,
            mangaAnnouncement,
            setMangaAnnouncement,
            dualHomeConfig,
            setDualHomeConfig,
            bannerStyleOptions: BANNER_STYLE_OPTIONS,
            helpTelegramUrl,
            setHelpTelegramUrl,
            groupTelegramUrl,
            setGroupTelegramUrl,
            donateTelegramUrl,
            setDonateTelegramUrl,
            monetizationMode,
            setMonetizationMode,
            directLinkUrl,
            setDirectLinkUrl,
            backupDirectLinkUrl,
            setBackupDirectLinkUrl,
            videoAdUrl,
            setVideoAdUrl,
            vastTagUrl,
            setVastTagUrl,
            admobRewardedId,
            setAdmobRewardedId,
            scriptCode,
            setScriptCode,
            requireClickVerification,
            setRequireClickVerification,
            adCooldownSeconds,
            setAdCooldownSeconds,
            stayTime,
            setStayTime,
            adRewardCoins,
            setAdRewardCoins,
            adRewardXp,
            setAdRewardXp,
            adDailyLimit,
            setAdDailyLimit,
            customAdsList,
            setCustomAdsList,
            newAdSponsor,
            setNewAdSponsor,
            newAdTitle,
            setNewAdTitle,
            newAdBannerUrl,
            setNewAdBannerUrl,
            newAdTargetUrl,
            setNewAdTargetUrl,
            newAdButtonText,
            setNewAdButtonText,
            adStatsData,
            setAdStatsData,
            isSavingSettings,
            setIsSavingSettings,
            queueStatus,
            setQueueStatus,
            queueTaskName,
            setQueueTaskName,
            queueTaskData,
            setQueueTaskData,
            isSubmittingQueueTask,
            setIsSubmittingQueueTask,
            expandedJobId,
            setExpandedJobId,
            confirmResetModal,
            setConfirmResetModal,
            isResettingAll,
            setIsResettingAll,
            confirmFactoryWipeModal,
            setConfirmFactoryWipeModal,
            isFactoryWiping,
            setIsFactoryWiping,
            toast,
            setToast,
            notify,
            getUserNameByUid,
            resolveUserByUsernameOrUid,
            matchesUserSearch,
            calculateTotalCumulativeXp,
            calculateLevelAndXpFromTotal,
            writeAudit,
            pendingReportsCount,
            pendingRecsCount,
            totalModerationBadge,
            unifiedLiveContent,
            filteredLiveContent,
            toggleSelectContentItem,
            toggleSelectAllVisibleContent,
            handleDeleteSingleLiveItem,
            handleBulkDeleteSelectedContent,
            handleToggleLiveCommentSpoiler,
            handleSaveLiveCommentEdit,
            handleQuickMuteAuthor,
            statsMetrics,
            handleResolveReport,
            handleApproveRec,
            handleRejectRec,
            handleDeleteRec,
            handleDeleteSuggestion,
            handleReplyToSuggestion,
            handleUpdateSuggestionStatus,
            handleUpdateUserStats,
            handleAssignRole,
            handleDemoteStaff,
            handleSaveModCustomPermissions,
            handleBan,
            handleUnban,
            handleCreatePromoCode,
            handleTogglePromo,
            handleDeletePromo,
            handleMassGrant,
            saveAnimeCuration,
            handleSendNotification,
            saveSliderSettings,
            cacheStats,
            setCacheStats,
            isUpdatingCacheMode,
            setIsUpdatingCacheMode,
            loadCacheEngineStats,
            handleToggleServerCacheMode,
            handlePurgeRamCacheNow,
            handleAddQueueJob,
            handleClearQueueLogs,
            isPurgingAllCaches,
            setIsPurgingAllCaches,
            handlePurgeAllSystemCaches,
            handleResetAllAccounts,
            handleFactoryWipeForLaunch,
            canAccessBroadcast,
            canAccessPlatform,
            suggestedRoleUsers
          }}
        >
          <AdminOverviewTab />
          <AdminModerationTab />
          <AdminCommunityTab />
          <AdminBroadcastTab />
          <AdminPlatformTab />
        </AdminDashboardProvider>
      </main>
    </div>
  );
}

