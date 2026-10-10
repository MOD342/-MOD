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
  History
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { moderationService, RoleLevel, GlobalRole, ModPermissions, AuditLogEntry, PromoCodeEntry, isStaffEmail } from '../services/moderationService';
import { notificationsService } from '../services/notificationsService';
import { Recommendation } from '../services/animeInteractionService';
import { auth, db } from '../firebase';
import { collection, onSnapshot, doc, getDoc, updateDoc, deleteDoc, deleteField, increment } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';

type MainWorkspace = 'overview' | 'moderation' | 'community' | 'broadcast' | 'platform';
type ModerationSubTab = 'live_content' | 'reports' | 'recommendations' | 'suggestions' | 'audit';
type CommunitySubTab = 'members' | 'roles' | 'bans' | 'promos';
type PlatformSubTab = 'slider' | 'curation' | 'links_ads' | 'queue' | 'maintenance';

export default function AdminDashboardView({
  onBack,
  onNavigate
}: {
  onBack: () => void;
  onNavigate?: (view: string, data?: any) => void;
}) {
  const { user: authUser, userRole: contextRole } = useAuth();
  const isDirectStaff = isStaffEmail(authUser?.email) || isStaffEmail(auth.currentUser?.email);
  const [role, setRole] = useState<RoleLevel | null>(
    isDirectStaff ? 'owner' : contextRole && contextRole !== 'user' ? contextRole : null
  );

  // Navigation State: 5 Clean Workspaces instead of 11 cluttered tabs
  const [workspace, setWorkspace] = useState<MainWorkspace>('overview');
  const [modSubTab, setModSubTab] = useState<ModerationSubTab>('live_content');
  const [commSubTab, setCommSubTab] = useState<CommunitySubTab>('members');
  const [platformSubTab, setPlatformSubTab] = useState<PlatformSubTab>('slider');

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

  // Platform Settings & Slider States
  const [sliderLimit, setSliderLimit] = useState(5);
  const [sliderSeason, setSliderSeason] = useState('auto');
  const [sliderMode, setSliderMode] = useState<'best_season' | 'trending_season' | 'all_time_best' | 'classic_historical' | 'custom'>('best_season');
  const [customSliderAnime, setCustomSliderAnime] = useState<any[]>([]);
  const [sliderSearchQuery, setSliderSearchQuery] = useState('');
  const [sliderSearchResults, setSliderSearchResults] = useState<any[]>([]);
  const [isSearchingSliderAnime, setIsSearchingSliderAnime] = useState(false);
  const [sliderSpeed, setSliderSpeed] = useState(3);
  const [globalAnnouncement, setGlobalAnnouncement] = useState('');
  const [helpTelegramUrl, setHelpTelegramUrl] = useState('https://t.me/+St876s24-2I4N2U0');
  const [groupTelegramUrl, setGroupTelegramUrl] = useState('https://t.me/+pW720892GZRkN2I0');
  const [donateTelegramUrl, setDonateTelegramUrl] = useState('https://t.me/Mod_342');
  const [monetizationMode, setMonetizationMode] = useState<'simulation' | 'direct_link' | 'script' | 'hybrid'>('hybrid');
  const [directLinkUrl, setDirectLinkUrl] = useState('https://uplcm.com/4/11992531');
  const [backupDirectLinkUrl, setBackupDirectLinkUrl] = useState('https://www.profitableratecpmnetwork.com/xw38hehu?key=f928ec53ec71574a775e118d9d0b4f38');
  const [scriptCode, setScriptCode] = useState('');
  const [requireClickVerification, setRequireClickVerification] = useState(true);
  const [adCooldownSeconds, setAdCooldownSeconds] = useState(20);
  const [stayTime, setStayTime] = useState(15);
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

    // Load local slider settings first
    try {
      const saved = JSON.parse(
        localStorage.getItem('adminSliderSettings') ||
          '{"limit": 5, "season": "auto", "sliderMode": "best_season", "customAnime": [], "speed": 3, "globalAnnouncement": ""}'
      );
      setSliderLimit(Math.min(10, Math.max(3, Number(saved.limit) || 5)));
      setSliderSeason(saved.season || 'auto');
      setSliderMode(saved.sliderMode || 'best_season');
      if (Array.isArray(saved.customAnime)) setCustomSliderAnime(saved.customAnime);
      setSliderSpeed(saved.speed ?? 3);
      setGlobalAnnouncement(saved.globalAnnouncement || '');
    } catch {}

    try {
      const savedCur = JSON.parse(localStorage.getItem('adminAnimeCuration') || '{"pinnedAnime":[],"hiddenAnime":[]}');
      if (Array.isArray(savedCur.pinnedAnime)) setPinnedAnimeList(savedCur.pinnedAnime);
      if (Array.isArray(savedCur.hiddenAnime)) setHiddenAnimeList(savedCur.hiddenAnime);
    } catch {}

    const initRealtimeSync = async () => {
      try {
        const [sliderCfg, tgCfg, monCfg, curCfg] = await Promise.all([
          moderationService.getGlobalSettings('slider'),
          moderationService.getGlobalSettings('telegramLinks'),
          moderationService.getGlobalSettings('monetization'),
          moderationService.getGlobalSettings('animeCuration')
        ]);
        if (sliderCfg) {
          setSliderLimit(Math.min(10, Math.max(3, Number(sliderCfg.limit) || 5)));
          setSliderSeason(sliderCfg.season || 'auto');
          setSliderMode(sliderCfg.sliderMode || 'best_season');
          if (Array.isArray(sliderCfg.customAnime)) setCustomSliderAnime(sliderCfg.customAnime);
          setSliderSpeed(sliderCfg.speed ?? 3);
          setGlobalAnnouncement(sliderCfg.globalAnnouncement || '');
          localStorage.setItem('adminSliderSettings', JSON.stringify(sliderCfg));
        }
        if (curCfg) {
          if (Array.isArray(curCfg.pinnedAnime)) setPinnedAnimeList(curCfg.pinnedAnime);
          if (Array.isArray(curCfg.hiddenAnime)) setHiddenAnimeList(curCfg.hiddenAnime);
          localStorage.setItem('adminAnimeCuration', JSON.stringify(curCfg));
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
          if (monCfg.scriptCode !== undefined) setScriptCode(monCfg.scriptCode);
          if (monCfg.requireClickVerification !== undefined) setRequireClickVerification(Boolean(monCfg.requireClickVerification));
          if (monCfg.cooldownSeconds !== undefined) setAdCooldownSeconds(Number(monCfg.cooldownSeconds) || 20);
          if (monCfg.stayTime !== undefined) setStayTime(Number(monCfg.stayTime) || 15);
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

      const curRole = await moderationService.getCurrentUserRole(authUser);
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

      if (curRole === 'user' && !isStaffEmail(authUser?.email)) return;

      moderationService.getAllUsers().then(fetched => {
        if (fetched.length > 0) setAllUsers(fetched);
      });

      unsubReports = onSnapshot(collection(db, 'reports'), snap => {
        const list: any[] = [];
        snap.forEach(d => list.push({ id: d.id, ...d.data() }));
        list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setReports(list);
      });

      unsubBans = onSnapshot(collection(db, 'bannedUsers'), snap => {
        const list: any[] = [];
        snap.forEach(d => list.push({ id: d.id, uid: d.id, ...d.data() }));
        setBannedUsers(list);
      });

      unsubRoles = onSnapshot(collection(db, 'globalRoles'), snap => {
        const list: any[] = [];
        snap.forEach(d => list.push({ id: d.id, uid: d.id, ...d.data() }));
        setUsersInfo(list);
      });

      unsubUsers = onSnapshot(collection(db, 'users'), snap => {
        const list: any[] = [];
        snap.forEach(d => list.push({ id: d.id, uid: d.id, ...d.data() }));
        setAllUsers(list);
      });

      unsubRecs = onSnapshot(collection(db, 'recommendations'), snap => {
        const list: any[] = [];
        snap.forEach(d => list.push({ id: d.id, ...d.data() }));
        list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setRecommendations(list as Recommendation[]);
      });

      unsubSuggestions = onSnapshot(collection(db, 'suggestions'), snap => {
        const list: any[] = [];
        snap.forEach(d => list.push({ id: d.id, ...d.data() }));
        list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setSuggestionsList(list);
      });

      unsubAudit = onSnapshot(collection(db, 'auditLogs'), snap => {
        const list: any[] = [];
        snap.forEach(d => list.push({ id: d.id, ...d.data() }));
        list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setAuditLogs(list.slice(0, 100));
      });

      unsubPromos = onSnapshot(collection(db, 'promoCodes'), snap => {
        const list: any[] = [];
        snap.forEach(d => list.push({ id: d.id, ...d.data() }));
        list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setPromoCodesList(list);
      });

      unsubComments = onSnapshot(collection(db, 'comments'), snap => {
        const list: any[] = [];
        snap.forEach(d => list.push({ id: d.id, _collection: 'comments', ...d.data() }));
        list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setLiveComments(list);
      });

      unsubArena = onSnapshot(collection(db, 'arenaFeed'), snap => {
        const list: any[] = [];
        snap.forEach(d => list.push({ id: d.id, _collection: 'arenaFeed', ...d.data() }));
        list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setLiveArenaPosts(list);
      });

      unsubLeaks = onSnapshot(collection(db, 'otakuLeaks'), snap => {
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

  // Poll Scraper Queue when viewing queue sub-tab
  useEffect(() => {
    if (workspace !== 'platform' || platformSubTab !== 'queue') return;
    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/queue/status');
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
      await deleteDoc(doc(db, item.collectionName, item.id));
      setSelectedContentIds(prev => prev.filter(k => k !== item.uniqueKey));
      writeAudit('report', item.authorName || item.id, `حذف مباشر لـ ${item.sourceLabel}: "${(item.text || '').slice(0, 40)}"`);
      notify('تم حذف المحتوى فوراً');
    } catch {
      notify('تعذر حذف المحتوى', 'error');
    }
  };

  const handleBulkDeleteSelectedContent = async () => {
    if (selectedContentIds.length === 0) return;
    try {
      const toDelete = unifiedLiveContent.filter(i => selectedContentIds.includes(i.uniqueKey));
      await Promise.all(
        toDelete.map(item => deleteDoc(doc(db, item.collectionName, item.id)).catch(() => {}))
      );
      writeAudit('report', `${toDelete.length} عنصر محتوى`, `حذف جماعي لـ ${toDelete.length} منشور/تعليق محدد`);
      setSelectedContentIds([]);
      notify(`تم حذف ${toDelete.length} عنصر محدد بنجاح`);
    } catch {
      notify('حدث خطأ أثناء الحذف الجماعي', 'error');
    }
  };

  const handleToggleLiveCommentSpoiler = async (item: any) => {
    if (item.collectionName !== 'comments') return;
    try {
      await updateDoc(doc(db, 'comments', item.id), {
        isSpoiler: !item.isSpoiler
      });
      notify(!item.isSpoiler ? 'تم وضع علامة حرق (Spoiler) على التعليق' : 'تمت إزالة علامة الحرق');
    } catch {
      notify('تعذر تحديث حالة الحرق', 'error');
    }
  };

  const handleSaveLiveCommentEdit = async (item: any) => {
    if (!editingLiveCommentText.trim() || item.collectionName !== 'comments') return;
    try {
      await updateDoc(doc(db, 'comments', item.id), {
        text: editingLiveCommentText.trim()
      });
      writeAudit('report', item.authorName || item.id, `تعديل نص تعليق إدارياً`);
      setEditingLiveCommentId(null);
      setEditingLiveCommentText('');
      notify('تم حفظ تعديل التعليق بنجاح');
    } catch {
      notify('تعذر تعديل التعليق', 'error');
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
    } catch {
      notify('تعذر تطبيق الكتم على العضو', 'error');
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
    } catch {
      notify('تعذر معالجة البلاغ', 'error');
    }
  };

  const handleApproveRec = async (rec: any) => {
    try {
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
    } catch {
      notify('فشل في قبول التوصية', 'error');
    }
  };

  const handleRejectRec = async (rec: any, reason: string) => {
    if (!reason.trim()) {
      notify('يرجى كتابة سبب الرفض', 'error');
      return;
    }
    try {
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
    } catch {
      notify('فشل في رفض التوصية', 'error');
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
    } catch {
      notify('فشل حذف التوصية', 'error');
    }
  };

  const handleDeleteSuggestion = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'suggestions', id));
      setSuggestionBeingDeleted(null);
      notify('تمت أرشفة وحذف الرسالة');
    } catch {
      notify('فشل حذف الرسالة', 'error');
    }
  };

  const handleReplyToSuggestion = async (s: any) => {
    if (!suggestionReplyText.trim()) return;
    try {
      await updateDoc(doc(db, 'suggestions', s.id), {
        adminReply: suggestionReplyText.trim(),
        repliedAt: serverTimestamp(),
        repliedBy: user?.displayName || 'الإدارة',
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
    } catch {
      notify('تعذر إرسال الرد', 'error');
    }
  };

  const handleUpdateSuggestionStatus = async (s: any, newStatus: 'pending' | 'in_progress' | 'replied' | 'resolved') => {
    try {
      await updateDoc(doc(db, 'suggestions', s.id), {
        status: newStatus
      });
      notify('تم تحديث حالة التذكرة');
    } catch {
      notify('تعذر تحديث حالة التذكرة', 'error');
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
    } catch {
      notify('فشل تحديث بيانات العضو', 'error');
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
    } catch {
      notify('تعذر تعيين الرتبة', 'error');
    }
  };

  const handleDemoteStaff = async (uid: string) => {
    try {
      await moderationService.assignRole(uid, 'user');
      writeAudit('role', getUserNameByUid(uid), 'سحب الصلاحيات وإعادته لرتبة عضو');
      setConfirmDemoteUid(null);
      notify('تم سحب الصلاحيات وإعادة العضو إلى رتبة مستخدم');
    } catch {
      notify('فشل سحب الصلاحيات', 'error');
    }
  };

  const handleSaveModCustomPermissions = async () => {
    if (!editingPermissionsMod) return;
    try {
      await updateDoc(doc(db, 'globalRoles', editingPermissionsMod.uid), {
        canBan: modCustomPerms.canBan,
        canNotify: modCustomPerms.canNotify,
        canManageSettings: modCustomPerms.canManageSettings,
        canViewRoles: modCustomPerms.canViewRoles
      });
      writeAudit('role', getUserNameByUid(editingPermissionsMod.uid), 'تحديث الصلاحيات الفرعية للمشرف');
      setEditingPermissionsMod(null);
      notify('تم حفظ صلاحيات المشرف');
    } catch {
      notify('فشل حفظ الصلاحيات', 'error');
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
    } catch {
      notify('تعذر حظر الحساب', 'error');
    }
  };

  const handleUnban = async (uid: string) => {
    try {
      await moderationService.unbanUser(uid);
      writeAudit('ban', getUserNameByUid(uid), 'رفع الحظر عن الحساب');
      notify('تم رفع الحظر عن الحساب');
    } catch {
      notify('تعذر رفع الحظر', 'error');
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
    } catch {
      notify('حدث خطأ أثناء إرسال الإشعار', 'error');
    } finally {
      setIsSendingNotif(false);
    }
  };

  const saveSliderSettings = async () => {
    try {
      setIsSavingSettings(true);
      const clampedLimit = Math.min(10, Math.max(3, Number(sliderLimit) || 5));
      setSliderLimit(clampedLimit);
      const payload = {
        limit: clampedLimit,
        season: sliderSeason,
        sliderMode,
        customAnime: customSliderAnime.slice(0, 10),
        speed: sliderSpeed,
        globalAnnouncement,
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

      writeAudit('settings', 'إعدادات المنصة والسلايدر', `حفظ إعدادات السلايدر (${sliderMode}) والروابط`);
      notify('تم حفظ ومزامنة إعدادات المنصة بنجاح');
    } catch {
      notify('فشل حفظ الإعدادات', 'error');
    } finally {
      setIsSavingSettings(false);
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
      const res = await fetch('/api/queue/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: queueTaskName, data: parsedData, maxRetries: 2 })
      });
      const data = await res.json();
      if (data.success) {
        notify(`تمت جدولة المهمة (${data.jobId})`);
        setQueueTaskData('');
        const stRes = await fetch('/api/queue/status');
        const stData = await stRes.json();
        if (stData.success) setQueueStatus(stData);
      } else {
        notify(data.message || 'تعذر جدولة المهمة', 'error');
      }
    } catch {
      notify('فشل الاتصال بمحرك المهام', 'error');
    } finally {
      setIsSubmittingQueueTask(false);
    }
  };

  const handleClearQueueLogs = async () => {
    try {
      const res = await fetch('/api/queue/clear', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        notify('تم تصفية سجل المهام');
        setQueueStatus((prev: any) =>
          prev ? { ...prev, jobs: [], stats: { pending: 0, active: 0, completed: 0, failed: 0, total: 0 } } : null
        );
      }
    } catch {
      notify('فشل تصفية السجل', 'error');
    }
  };

  const [isPurgingAllCaches, setIsPurgingAllCaches] = useState(false);

  const handlePurgeAllSystemCaches = async () => {
    try {
      setIsPurgingAllCaches(true);
      // 1. Purge Server Multi-Tier Cache (node-cache + .cache/*.json + Redis)
      await fetch('/api/cache/clear', { method: 'POST' }).catch(() => {});

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
    } catch {
      notify('حدث خطأ أثناء تفريغ التخزين المؤقت', 'error');
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
    } catch {
      notify('فشلت عملية تصفير الحسابات', 'error');
    } finally {
      setIsResettingAll(false);
    }
  };

  const handleFactoryWipeForLaunch = async () => {
    try {
      setIsFactoryWiping(true);
      // 1. Wipe all Firestore collections, accounts, subcollections, and cloud caches
      const resStats = await moderationService.factoryWipeForLaunch();

      // 2. Wipe Server Multi-Tier Cache (.cache/*.json, node-cache, Redis, ScraperQueue)
      await fetch('/api/system/factory-reset', { method: 'POST' }).catch(() => {});

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
    } catch {
      notify('حدث خطأ أثناء التنظيف الشامل للإطلاق', 'error');
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
      <header className="sticky top-0 z-40 bg-[#09090b]/90 backdrop-blur-md border-b border-zinc-800/80">
        <div className="max-w-7xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="w-9 h-9 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white hover:border-zinc-700 transition cursor-pointer"
              title="رجوع"
            >
              <ChevronRight size={18} />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm md:text-base font-black text-white tracking-tight">مركز القيادة والإشراف</h1>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                    role === 'owner'
                      ? 'bg-rose-500/10 text-rose-400 border-rose-500/25'
                      : role === 'admin'
                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/25'
                        : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/25'
                  }`}
                >
                  {role === 'owner' ? 'المالك' : role === 'admin' ? 'مدير' : 'مشرف'}
                </span>
              </div>
              <p className="text-[10px] text-zinc-500 hidden sm:block">
                إدارة فورية متزامنة مع قاعدة البيانات
              </p>
            </div>
          </div>

          {/* Quick KPI Pills in Header */}
          <div className="flex items-center gap-2">
            {pendingReportsCount > 0 && (
              <button
                onClick={() => {
                  setWorkspace('moderation');
                  setModSubTab('reports');
                }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-400 text-[11px] font-bold cursor-pointer hover:bg-rose-500/15 transition"
              >
                <ShieldAlert size={13} />
                <span>{pendingReportsCount} بلاغ</span>
              </button>
            )}
            {pendingRecsCount > 0 && (
              <button
                onClick={() => {
                  setWorkspace('moderation');
                  setModSubTab('recommendations');
                  setRecStatusFilter('pending');
                }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-400 text-[11px] font-bold cursor-pointer hover:bg-amber-500/15 transition"
              >
                <Lightbulb size={13} />
                <span>{pendingRecsCount} توصية</span>
              </button>
            )}
            <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-400 font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>متصل لحظياً</span>
            </div>
          </div>
        </div>

        {/* Main 5-Workspace Navigation Bar */}
        <div className="max-w-7xl mx-auto px-4 md:px-6 border-t border-zinc-900/80">
          <div className="flex items-center gap-1 overflow-x-auto hide-scrollbar py-2">
            {mainNavItems
              .filter(item => !item.hidden)
              .map(item => {
                const Icon = item.icon;
                const active = workspace === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setWorkspace(item.id)}
                    className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                      active
                        ? 'bg-[#FF1744] text-white shadow-[0_2px_12px_rgba(255,23,68,0.3)]'
                        : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900'
                    }`}
                  >
                    <Icon size={15} />
                    <span>{item.label}</span>
                    {item.badge !== undefined && item.badge > 0 && (
                      <span
                        className={`text-[10px] font-black px-1.5 py-0.2 rounded-full ${
                          active ? 'bg-black/30 text-white' : 'bg-rose-500/20 text-rose-400'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
          </div>
        </div>
      </header>

      {/* Floating Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="fixed top-20 left-1/2 -translate-x-1/2 z-50 max-w-md w-[92%]"
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
              <button onClick={() => setToast(null)} className="opacity-70 hover:opacity-100">
                <X size={14} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content Container */}
      <main className="max-w-7xl mx-auto px-4 md:px-6 pt-6">
        {/* =========================================================
            WORKSPACE 1: OVERVIEW (نظرة عامة)
           ========================================================= */}
        {workspace === 'overview' && (
          <div className="space-y-6">
            {/* Primary KPI Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
              <button
                onClick={() => {
                  setWorkspace('community');
                  setCommSubTab('members');
                }}
                className="bg-[#121215] hover:bg-zinc-900/80 border border-zinc-800/80 rounded-2xl p-4 text-right transition cursor-pointer group"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold text-zinc-400">إجمالي الأعضاء</span>
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                    <Users size={16} />
                  </div>
                </div>
                <div className="text-2xl font-black text-white">{statsMetrics.totalUsers}</div>
                <div className="text-[10px] text-zinc-500 mt-1 flex items-center justify-between">
                  <span>متوسط المستوى: Lvl {statsMetrics.avgLevel}</span>
                  <ChevronLeft size={12} className="group-hover:-translate-x-0.5 transition-transform" />
                </div>
              </button>

              <button
                onClick={() => {
                  setWorkspace('moderation');
                  setModSubTab('reports');
                }}
                className="bg-[#121215] hover:bg-zinc-900/80 border border-zinc-800/80 rounded-2xl p-4 text-right transition cursor-pointer group"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold text-zinc-400">البلاغات المعلّقة</span>
                  <div className="w-8 h-8 rounded-xl bg-rose-500/10 text-rose-400 flex items-center justify-center">
                    <ShieldAlert size={16} />
                  </div>
                </div>
                <div className="text-2xl font-black text-white">{statsMetrics.pendingReports}</div>
                <div className="text-[10px] text-zinc-500 mt-1 flex items-center justify-between">
                  <span>تمت معالجة {statsMetrics.resolvedReports} بلاغ</span>
                  <ChevronLeft size={12} className="group-hover:-translate-x-0.5 transition-transform" />
                </div>
              </button>

              <button
                onClick={() => {
                  setWorkspace('moderation');
                  setModSubTab('recommendations');
                  setRecStatusFilter('pending');
                }}
                className="bg-[#121215] hover:bg-zinc-900/80 border border-zinc-800/80 rounded-2xl p-4 text-right transition cursor-pointer group"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold text-zinc-400">توصيات بانتظار الاعتماد</span>
                  <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
                    <Lightbulb size={16} />
                  </div>
                </div>
                <div className="text-2xl font-black text-white">{statsMetrics.pendingRecs}</div>
                <div className="text-[10px] text-zinc-500 mt-1 flex items-center justify-between">
                  <span>{statsMetrics.approvedRecs} توصية معتمدة</span>
                  <ChevronLeft size={12} className="group-hover:-translate-x-0.5 transition-transform" />
                </div>
              </button>

              <button
                onClick={() => {
                  setWorkspace('moderation');
                  setModSubTab('suggestions');
                }}
                className="bg-[#121215] hover:bg-zinc-900/80 border border-zinc-800/80 rounded-2xl p-4 text-right transition cursor-pointer group"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold text-zinc-400">المقترحات والشكاوى</span>
                  <div className="w-8 h-8 rounded-xl bg-sky-500/10 text-sky-400 flex items-center justify-center">
                    <MessageSquare size={16} />
                  </div>
                </div>
                <div className="text-2xl font-black text-white">{suggestionsList.length}</div>
                <div className="text-[10px] text-zinc-500 mt-1 flex items-center justify-between">
                  <span>رسائل الأعضاء المباشرة</span>
                  <ChevronLeft size={12} className="group-hover:-translate-x-0.5 transition-transform" />
                </div>
              </button>
            </div>

            {/* Two-Column Actionable Summary */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {/* Pending Tasks & Quick Actions */}
              <div className="lg:col-span-2 bg-[#121215] border border-zinc-800/80 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
                  <h2 className="text-sm font-black text-white flex items-center gap-2">
                    <Activity size={16} className="text-[#FF1744]" />
                    <span>المهام العاجلة والوصول السريع</span>
                  </h2>
                  <span className="text-[10px] text-zinc-500 font-bold">تحديث فوري</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    onClick={() => {
                      setWorkspace('platform');
                      setPlatformSubTab('slider');
                    }}
                    className="flex items-center justify-between p-3.5 rounded-xl bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-800/80 transition cursor-pointer text-right"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-[#FF1744]/10 text-[#FF1744] flex items-center justify-center shrink-0">
                        <Sliders size={17} />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-white">تخصيص السلايدر العلوي</div>
                        <div className="text-[10px] text-zinc-400 mt-0.5">
                          الوضع الحالي:{' '}
                          {sliderMode === 'custom'
                            ? `مخصص (${customSliderAnime.length})`
                            : sliderMode === 'best_season'
                              ? 'الأفضل هذا الموسم'
                              : sliderMode === 'trending_season'
                                ? 'الرائج هذا الموسم'
                                : sliderMode === 'all_time_best'
                                  ? 'الأفضل على الإطلاق'
                                  : 'الأنميات التاريخية'}
                        </div>
                      </div>
                    </div>
                    <ChevronLeft size={15} className="text-zinc-500" />
                  </button>

                  <button
                    onClick={() => setWorkspace('broadcast')}
                    className="flex items-center justify-between p-3.5 rounded-xl bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-800/80 transition cursor-pointer text-right"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center shrink-0">
                        <BellRing size={17} />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-white">إرسال إشعار عام أو خاص</div>
                        <div className="text-[10px] text-zinc-400 mt-0.5">مع ربط مباشر بأي أنمي أو قسم</div>
                      </div>
                    </div>
                    <ChevronLeft size={15} className="text-zinc-500" />
                  </button>

                  <button
                    onClick={() => {
                      setWorkspace('community');
                      setCommSubTab('roles');
                    }}
                    className="flex items-center justify-between p-3.5 rounded-xl bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-800/80 transition cursor-pointer text-right"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-violet-500/10 text-violet-400 flex items-center justify-center shrink-0">
                        <Crown size={17} />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-white">طاقم الإشراف والرتب</div>
                        <div className="text-[10px] text-zinc-400 mt-0.5">{statsMetrics.totalStaff} مشرفين ومديرين</div>
                      </div>
                    </div>
                    <ChevronLeft size={15} className="text-zinc-500" />
                  </button>

                  <button
                    onClick={() => {
                      setWorkspace('community');
                      setCommSubTab('bans');
                    }}
                    className="flex items-center justify-between p-3.5 rounded-xl bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-800/80 transition cursor-pointer text-right"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-red-500/10 text-red-400 flex items-center justify-center shrink-0">
                        <UserX size={17} />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-white">سجل الحظر والقيود</div>
                        <div className="text-[10px] text-zinc-400 mt-0.5">
                          {statsMetrics.totalBans} محظور • {statsMetrics.mutedCount} مكتوم
                        </div>
                      </div>
                    </div>
                    <ChevronLeft size={15} className="text-zinc-500" />
                  </button>

                  <button
                    onClick={() => {
                      setWorkspace('community');
                      setCommSubTab('promos');
                    }}
                    className="flex items-center justify-between p-3.5 rounded-xl bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-800/80 transition cursor-pointer text-right"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0">
                        <Gift size={17} />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-white">أكواد الهدايا والإهداء الجماعي</div>
                        <div className="text-[10px] text-zinc-400 mt-0.5">
                          {promoCodesList.filter(p => p.active).length} كود نشط حالياً
                        </div>
                      </div>
                    </div>
                    <ChevronLeft size={15} className="text-zinc-500" />
                  </button>

                  <button
                    onClick={() => {
                      setWorkspace('platform');
                      setPlatformSubTab('curation');
                    }}
                    className="flex items-center justify-between p-3.5 rounded-xl bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-800/80 transition cursor-pointer text-right"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
                        <Pin size={17} />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-white">تثبيت وإخفاء الأنميات</div>
                        <div className="text-[10px] text-zinc-400 mt-0.5">
                          {pinnedAnimeList.length} مثبت • {hiddenAnimeList.length} مخفي
                        </div>
                      </div>
                    </div>
                    <ChevronLeft size={15} className="text-zinc-500" />
                  </button>
                </div>

                {/* Economy & Activity Summary Bar */}
                <div className="grid grid-cols-3 gap-3 pt-2">
                  <div className="bg-zinc-950/70 border border-zinc-800/70 rounded-xl p-3">
                    <span className="text-[10px] text-zinc-500 font-bold block">الكوينز المتداولة</span>
                    <span className="text-sm font-black text-amber-400 mt-0.5 block">
                      {statsMetrics.totalCoins.toLocaleString()}
                    </span>
                  </div>
                  <div className="bg-zinc-950/70 border border-zinc-800/70 rounded-xl p-3">
                    <span className="text-[10px] text-zinc-500 font-bold block">مجموع نقاط الخبرة</span>
                    <span className="text-sm font-black text-sky-400 mt-0.5 block">
                      {statsMetrics.totalXP.toLocaleString()} XP
                    </span>
                  </div>
                  <div className="bg-zinc-950/70 border border-zinc-800/70 rounded-xl p-3">
                    <span className="text-[10px] text-zinc-500 font-bold block">أعلى مستوى مسجل</span>
                    <span className="text-sm font-black text-emerald-400 mt-0.5 block">
                      Lvl {statsMetrics.maxLevel}
                    </span>
                  </div>
                </div>
              </div>

              {/* Level Distribution Card */}
              <div className="bg-[#121215] border border-zinc-800/80 rounded-2xl p-5 space-y-4">
                <div className="border-b border-zinc-800/80 pb-3 flex items-center justify-between">
                  <h2 className="text-sm font-black text-white">توزيع مستويات الأعضاء</h2>
                  <span className="text-[10px] text-zinc-500 font-bold">{statsMetrics.totalUsers} عضو</span>
                </div>

                <div className="space-y-3.5 text-xs">
                  {[
                    { label: 'مبتدئ (1 - 5)', count: statsMetrics.segments.starter, color: 'bg-rose-500' },
                    { label: 'نشط (6 - 15)', count: statsMetrics.segments.regular, color: 'bg-amber-500' },
                    { label: 'خبير (16 - 30)', count: statsMetrics.segments.veteran, color: 'bg-sky-500' },
                    { label: 'نخبة (30+)', count: statsMetrics.segments.elite, color: 'bg-emerald-500' }
                  ].map((seg, i) => {
                    const pct = Math.round((seg.count / Math.max(1, statsMetrics.totalUsers)) * 100);
                    return (
                      <div key={i} className="space-y-1.5">
                        <div className="flex justify-between text-[11px]">
                          <span className="text-zinc-400 font-semibold">{seg.label}</span>
                          <span className="text-zinc-200 font-bold">
                            {seg.count} ({pct}%)
                          </span>
                        </div>
                        <div className="h-2 bg-zinc-900 rounded-full overflow-hidden">
                          <div className={`h-full ${seg.color} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* =========================================================
            WORKSPACE 2: MODERATION (الرقابة والمحتوى)
           ========================================================= */}
        {workspace === 'moderation' && (
          <div className="space-y-5">
            {/* Sub-Tabs Selector */}
            <div className="flex flex-wrap items-center gap-2 bg-[#121215] border border-zinc-800/80 p-1.5 rounded-2xl w-fit">
              <button
                onClick={() => setModSubTab('live_content')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                  modSubTab === 'live_content' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Activity size={14} className="text-violet-400" />
                <span>المراقبة الحية للمحتوى</span>
                <span className="bg-violet-500/20 text-violet-300 text-[10px] font-black px-1.5 py-0.2 rounded-full">
                  {unifiedLiveContent.length}
                </span>
              </button>

              <button
                onClick={() => setModSubTab('reports')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                  modSubTab === 'reports' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                <ShieldAlert size={14} className="text-rose-400" />
                <span>البلاغات</span>
                {pendingReportsCount > 0 && (
                  <span className="bg-rose-500 text-white text-[10px] font-black px-1.5 py-0.2 rounded-full">
                    {pendingReportsCount}
                  </span>
                )}
              </button>

              <button
                onClick={() => setModSubTab('recommendations')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                  modSubTab === 'recommendations' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Lightbulb size={14} className="text-amber-400" />
                <span>توصيات الأعضاء</span>
                {recommendations.length > 0 && (
                  <span className="bg-amber-500 text-black text-[10px] font-black px-1.5 py-0.2 rounded-full">
                    {pendingRecsCount > 0 ? `${pendingRecsCount} جديد` : recommendations.length}
                  </span>
                )}
              </button>

              <button
                onClick={() => setModSubTab('suggestions')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                  modSubTab === 'suggestions' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                <MessageSquare size={14} className="text-sky-400" />
                <span>المقترحات والشكاوى</span>
                {suggestionsList.length > 0 && (
                  <span className="bg-sky-500/20 text-sky-300 text-[10px] font-black px-1.5 py-0.2 rounded-full">
                    {suggestionsList.length}
                  </span>
                )}
              </button>

              <button
                onClick={() => setModSubTab('audit')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                  modSubTab === 'audit' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                <History size={14} className="text-emerald-400" />
                <span>سجل نشاط المشرفين</span>
                {auditLogs.length > 0 && (
                  <span className="bg-emerald-500/20 text-emerald-300 text-[10px] font-black px-1.5 py-0.2 rounded-full">
                    {auditLogs.length}
                  </span>
                )}
              </button>
            </div>

            {/* SUB-TAB 2.0: LIVE CONTENT INSPECTOR (المراقبة الحية للمحتوى والتحديد المتعدد) */}
            {modSubTab === 'live_content' && (
              <div className="bg-[#121215] border border-zinc-800/80 rounded-2xl p-5 space-y-4">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-zinc-800/80 pb-4">
                  <div>
                    <h2 className="text-sm font-black text-white">المراقبة الحية للمحتوى المنشور (تحديد وإدارة فورية)</h2>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      جميع تعليقات الأنمي، منشورات المجتمع، ساحة الأوتاكو، والتسريبات في مكان واحد دون انتظار بلاغ
                    </p>
                  </div>

                  {/* Source Filter Pills */}
                  <div className="flex flex-wrap gap-1.5 bg-zinc-950 p-1 rounded-xl border border-zinc-800">
                    {[
                      { id: 'all', label: `الكل (${unifiedLiveContent.length})` },
                      {
                        id: 'anime_comments',
                        label: `تعليقات الأنمي (${unifiedLiveContent.filter(i => i.sourceType === 'anime_comments').length})`
                      },
                      {
                        id: 'community_posts',
                        label: `المجتمع (${unifiedLiveContent.filter(i => i.sourceType === 'community_posts').length})`
                      },
                      {
                        id: 'arena_feed',
                        label: `ساحة الأوتاكو (${unifiedLiveContent.filter(i => i.sourceType === 'arena_feed').length})`
                      },
                      {
                        id: 'leaks',
                        label: `التسريبات (${unifiedLiveContent.filter(i => i.sourceType === 'leaks').length})`
                      }
                    ].map(f => (
                      <button
                        key={f.id}
                        onClick={() => {
                          setLiveContentSource(f.id as any);
                          setSelectedContentIds([]);
                        }}
                        className={`px-3 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                          liveContentSource === f.id ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Search & Bulk Selection Action Bar */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                  <div className="relative flex-1">
                    <Search size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                    <input
                      type="text"
                      value={liveContentSearch}
                      onChange={e => setLiveContentSearch(e.target.value)}
                      placeholder="ابحث في نص التعليق، المنشور، اسم الكاتب، أو معرّف الأنمي..."
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pr-9 pl-3 py-2 text-xs text-white focus:outline-none focus:border-zinc-700"
                    />
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={toggleSelectAllVisibleContent}
                      className="px-3 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[11px] font-bold text-zinc-200 cursor-pointer transition flex items-center gap-1.5"
                    >
                      <Check size={13} className="text-violet-400" />
                      <span>
                        {filteredLiveContent.slice(0, 60).length > 0 &&
                        filteredLiveContent.slice(0, 60).every(i => selectedContentIds.includes(i.uniqueKey))
                          ? 'إلغاء تحديد الكل'
                          : 'تحديد المعروض'}
                      </span>
                    </button>

                    {selectedContentIds.length > 0 && (
                      <button
                        onClick={handleBulkDeleteSelectedContent}
                        className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-black cursor-pointer transition flex items-center gap-1.5 shadow-lg shadow-rose-600/20"
                      >
                        <Trash2 size={13} />
                        <span>حذف المحدد ({selectedContentIds.length})</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Live Content Feed List */}
                {filteredLiveContent.length === 0 ? (
                  <div className="text-center py-12 text-zinc-500 space-y-2">
                    <MessageSquare size={32} className="mx-auto text-zinc-700" />
                    <p className="text-xs font-bold text-zinc-300">لا توجد منشورات أو تعليقات مطابقة</p>
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-[600px] overflow-y-auto pr-1">
                    {filteredLiveContent.slice(0, 60).map(item => {
                      const isSelected = selectedContentIds.includes(item.uniqueKey);
                      const authorUser = allUsers.find(u => u.uid === item.authorId || u.id === item.authorId);
                      const isAuthorMuted = !!authorUser?.isMuted;

                      return (
                        <div
                          key={item.uniqueKey}
                          onClick={() => toggleSelectContentItem(item.uniqueKey)}
                          className={`rounded-xl p-3.5 border transition cursor-pointer ${
                            isSelected
                              ? 'bg-violet-500/10 border-violet-500/40'
                              : 'bg-zinc-950/70 border-zinc-800/80 hover:border-zinc-700'
                          }`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                            <div className="flex items-center gap-2.5">
                              {/* Checkbox */}
                              <div
                                className={`w-4 h-4 rounded flex items-center justify-center border transition ${
                                  isSelected
                                    ? 'bg-violet-500 border-violet-500 text-white'
                                    : 'border-zinc-700 bg-zinc-900'
                                }`}
                              >
                                {isSelected && <Check size={11} strokeWidth={3} />}
                              </div>

                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                                  item.sourceType === 'anime_comments'
                                    ? 'bg-sky-500/10 text-sky-400 border-sky-500/20'
                                    : item.sourceType === 'community_posts'
                                      ? 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                                      : item.sourceType === 'arena_feed'
                                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                        : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                }`}
                              >
                                {item.sourceLabel}
                              </span>

                              {item.isSpoiler && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-400 border border-rose-500/30">
                                  حرق (Spoiler)
                                </span>
                              )}

                              <span className="text-xs font-black text-white">{item.authorName}</span>
                              {isAuthorMuted && (
                                <span className="text-[9px] bg-rose-500/20 text-rose-300 px-1.5 py-0.2 rounded font-bold">
                                  مكتوم 🔇
                                </span>
                              )}
                            </div>

                            <span className="text-[10px] text-zinc-500 font-mono">
                              {item.createdAtSec
                                ? new Date(item.createdAtSec * 1000).toLocaleString('ar-EG', {
                                    month: 'short',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })
                                : ''}
                            </span>
                          </div>

                          {/* Content Text or Inline Editor */}
                          {editingLiveCommentId === item.uniqueKey ? (
                            <div
                              onClick={e => e.stopPropagation()}
                              className="bg-zinc-900 border border-violet-500/40 rounded-xl p-2.5 space-y-2 my-2"
                            >
                              <textarea
                                rows={2}
                                value={editingLiveCommentText}
                                onChange={e => setEditingLiveCommentText(e.target.value)}
                                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-xs text-white focus:outline-none"
                              />
                              <div className="flex justify-end gap-2">
                                <button
                                  onClick={() => setEditingLiveCommentId(null)}
                                  className="px-2.5 py-1 rounded-lg bg-zinc-800 text-zinc-300 text-[10px] font-bold cursor-pointer"
                                >
                                  إلغاء
                                </button>
                                <button
                                  onClick={() => handleSaveLiveCommentEdit(item)}
                                  className="px-3 py-1 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-[10px] font-bold cursor-pointer"
                                >
                                  حفظ التعديل
                                </button>
                              </div>
                            </div>
                          ) : (
                            <p className="text-xs text-zinc-200 bg-zinc-900/60 border border-zinc-800/60 rounded-xl p-2.5 leading-relaxed whitespace-pre-wrap">
                              {item.text || '(بدون نص)'}
                            </p>
                          )}

                          {/* Action Buttons Row */}
                          <div
                            onClick={e => e.stopPropagation()}
                            className="flex flex-wrap items-center justify-between gap-2 pt-2.5 mt-2 border-t border-zinc-900"
                          >
                            <div className="flex flex-wrap items-center gap-1.5">
                              {onNavigate && item.collectionName === 'comments' && (
                                <button
                                  onClick={() => {
                                    if (item.animeId === 'community' || item.animeId === 'community_reply') {
                                      onNavigate('community', { focusCommentId: item.id });
                                    } else {
                                      onNavigate('anime_comments', {
                                        animeId: item.animeId,
                                        focusCommentId: item.id
                                      });
                                    }
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[10px] font-bold text-zinc-300 flex items-center gap-1 cursor-pointer"
                                >
                                  <Eye size={11} />
                                  <span>معاينة بالموقع</span>
                                </button>
                              )}

                              {item.collectionName === 'comments' && (
                                <>
                                  <button
                                    onClick={() => handleToggleLiveCommentSpoiler(item)}
                                    className="px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[10px] font-bold text-amber-400 flex items-center gap-1 cursor-pointer"
                                  >
                                    <EyeOff size={11} />
                                    <span>{item.isSpoiler ? 'إلغاء الحرق' : 'تحديد كحرق'}</span>
                                  </button>

                                  <button
                                    onClick={() => {
                                      setEditingLiveCommentId(item.uniqueKey);
                                      setEditingLiveCommentText(item.text || '');
                                    }}
                                    className="px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[10px] font-bold text-sky-400 cursor-pointer"
                                  >
                                    تعديل النص
                                  </button>
                                </>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-1.5 mr-auto">
                              {item.authorId && (
                                <>
                                  <button
                                    onClick={() => handleQuickMuteAuthor(item.authorId, item.authorName)}
                                    className="px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-400 text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                                  >
                                    <VolumeX size={11} />
                                    <span>{isAuthorMuted ? 'فك الكتم' : 'كتم الكاتب'}</span>
                                  </button>

                                  {(role === 'owner' || role === 'admin' || modPerms.canBan) && (
                                    <button
                                      onClick={() => handleBan(item.authorId)}
                                      className="px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                                    >
                                      <UserX size={11} />
                                      <span>حظر الكاتب</span>
                                    </button>
                                  )}
                                </>
                              )}

                              <button
                                onClick={() => handleDeleteSingleLiveItem(item)}
                                className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                              >
                                <Trash2 size={11} />
                                <span>حذف</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* SUB-TAB 2.1: REPORTS */}
            {modSubTab === 'reports' && (
              <div className="bg-[#121215] border border-zinc-800/80 rounded-2xl p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 pb-4">
                  <div>
                    <h2 className="text-sm font-black text-white">مراجعة البلاغات والمخالفات</h2>
                    <p className="text-[11px] text-zinc-400 mt-0.5">التحقق من التعليقات والتوصيات المبلّغ عنها مع جلب تلقائي للنص والكاتب</p>
                  </div>
                  <div className="flex gap-1.5 bg-zinc-950 p-1 rounded-xl border border-zinc-800">
                    {[
                      { id: 'pending', label: `معلّقة (${pendingReportsCount})` },
                      { id: 'resolved', label: `معالجة (${reports.length - pendingReportsCount})` },
                      { id: 'all', label: `الكل (${reports.length})` }
                    ].map(f => (
                      <button
                        key={f.id}
                        onClick={() => setReportFilter(f.id as any)}
                        className={`px-3 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                          reportFilter === f.id ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                {(() => {
                  const filtered = reports.filter(r =>
                    reportFilter === 'all'
                      ? true
                      : reportFilter === 'pending'
                        ? r.status === 'pending'
                        : r.status !== 'pending'
                  );
                  if (filtered.length === 0) {
                    return (
                      <div className="text-center py-12 text-zinc-500 space-y-2">
                        <ShieldCheck size={32} className="mx-auto text-emerald-500/60" />
                        <p className="text-xs font-bold text-zinc-300">لا توجد بلاغات في هذا القسم</p>
                      </div>
                    );
                  }
                  return (
                    <div className="space-y-3">
                      {filtered.map(report => {
                        // Dynamic fallback lookup if report was created before metadata enrichment
                        const liveCommentMatch =
                          report.contentType === 'comment'
                            ? liveComments.find(c => c.id === report.contentId)
                            : null;
                        const liveRecMatch =
                          report.contentType === 'recommendation'
                            ? recommendations.find(r => r.id === report.contentId)
                            : null;

                        const resolvedText =
                          report.contentText ||
                          liveCommentMatch?.text ||
                          liveRecMatch?.reason ||
                          'المحتوى غير متوفر أو تم حذفه مسبقاً';
                        const resolvedAuthorId =
                          report.authorId || liveCommentMatch?.userId || liveRecMatch?.userId || '';
                        const resolvedAuthorName =
                          report.authorName ||
                          liveCommentMatch?.userDisplayName ||
                          (resolvedAuthorId ? getUserNameByUid(resolvedAuthorId) : 'غير معروف');
                        const resolvedAnimeId =
                          report.animeId || liveCommentMatch?.animeId || liveRecMatch?.animeId || '';

                        return (
                          <div
                            key={report.id}
                            className="bg-zinc-950/60 border border-zinc-800/80 rounded-xl p-4 space-y-3"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                              <span
                                className={`px-2 py-0.5 rounded-md font-bold ${
                                  report.status === 'pending'
                                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                    : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                }`}
                              >
                                {report.status === 'pending' ? 'بانتظار المراجعة' : 'تمت المعالجة'}
                              </span>
                              <div className="flex flex-wrap items-center gap-3 text-zinc-400">
                                <span>المبلّغ: {getUserNameByUid(report.reporterId)}</span>
                                <span className="text-rose-400 font-bold">
                                  صاحب المحتوى: {resolvedAuthorName}
                                </span>
                              </div>
                            </div>

                            <div className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-3 space-y-1.5">
                              <div className="text-[10px] text-zinc-400 font-bold">
                                سبب البلاغ: <span className="text-amber-300">{report.reason}</span>
                              </div>
                              <p className="text-xs text-zinc-100 leading-relaxed whitespace-pre-wrap">
                                {resolvedText}
                              </p>
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                              {onNavigate && resolvedAnimeId && (
                                <button
                                  onClick={() => {
                                    if (report.contentType === 'comment') {
                                      if (resolvedAnimeId === 'community' || resolvedAnimeId === 'community_reply') {
                                        onNavigate('community', { focusCommentId: report.contentId });
                                      } else {
                                        onNavigate('anime_comments', {
                                          animeId: resolvedAnimeId,
                                          focusCommentId: report.contentId
                                        });
                                      }
                                    } else {
                                      onNavigate('anime_details', { id: resolvedAnimeId });
                                    }
                                  }}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[11px] font-bold text-zinc-300 cursor-pointer transition"
                                >
                                  <Eye size={13} />
                                  <span>معاينة الموقع</span>
                                </button>
                              )}

                              {report.status === 'pending' && (
                                <div className="flex flex-wrap items-center gap-2 mr-auto">
                                  {resolvedAuthorId && (
                                    <button
                                      onClick={() => handleQuickMuteAuthor(resolvedAuthorId, resolvedAuthorName)}
                                      className="px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-[11px] font-bold text-amber-400 cursor-pointer transition flex items-center gap-1"
                                    >
                                      <VolumeX size={12} />
                                      <span>كتم الكاتب</span>
                                    </button>
                                  )}
                                  <button
                                    onClick={() => handleResolveReport(report, 'dismissed')}
                                    className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-[11px] font-bold text-zinc-300 cursor-pointer transition"
                                  >
                                    تجاهل وحفظ
                                  </button>
                                  <button
                                    onClick={() => handleResolveReport(report, 'deleted_content')}
                                    className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-[11px] font-bold text-white cursor-pointer transition flex items-center gap-1"
                                  >
                                    <Trash2 size={12} />
                                    <span>حذف المحتوى المخالف</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* SUB-TAB 2.2: RECOMMENDATIONS */}
            {modSubTab === 'recommendations' && (
              <div className="bg-[#121215] border border-zinc-800/80 rounded-2xl p-5 space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-zinc-800/80 pb-4">
                  <div>
                    <h2 className="text-sm font-black text-white">مراجعة واعتماد توصيات الأنمي</h2>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      قبول أو رفض التوصيات المقدمة من الأعضاء مع إشعار فوري للموصي
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {[
                      {
                        id: 'all',
                        label: 'الكل',
                        count: recommendations.length
                      },
                      {
                        id: 'pending',
                        label: 'قيد المراجعة',
                        count: recommendations.filter(r => (r.status || 'approved') === 'pending').length
                      },
                      {
                        id: 'approved',
                        label: 'معتمدة',
                        count: recommendations.filter(r => (r.status || 'approved') === 'approved').length
                      },
                      {
                        id: 'rejected',
                        label: 'مرفوضة',
                        count: recommendations.filter(r => (r.status || 'approved') === 'rejected').length
                      }
                    ].map(tab => (
                      <button
                        key={tab.id}
                        onClick={() => setRecStatusFilter(tab.id as any)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                          recStatusFilter === tab.id
                            ? 'bg-zinc-800 text-white border border-zinc-700'
                            : 'bg-zinc-950 text-zinc-400 border border-zinc-800/80 hover:text-white'
                        }`}
                      >
                        <span>{tab.label}</span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-zinc-900 text-zinc-300">
                          {tab.count}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Search Input */}
                <div className="relative">
                  <Search size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                  <input
                    type="text"
                    value={searchRecQuery}
                    onChange={e => setSearchRecQuery(e.target.value)}
                    placeholder="ابحث باسم الأنمي، سبب التوصية، أو اسم العضو..."
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pr-9 pl-3 py-2 text-xs text-white focus:outline-none focus:border-zinc-700"
                  />
                </div>

                {(() => {
                  const list = recommendations.filter(rec => {
                    const st = rec.status || 'approved';
                    if (recStatusFilter !== 'all' && st !== recStatusFilter) return false;
                    const q = searchRecQuery.toLowerCase().trim();
                    if (!q) return true;
                    const resolvedSrcTitle =
                      (rec.animeTitle && rec.animeTitle !== 'أنمي' ? rec.animeTitle : resolvedAnimeMeta[rec.animeId]?.title) ||
                      rec.animeId ||
                      '';
                    return (
                      (rec.targetAnimeTitle || '').toLowerCase().includes(q) ||
                      resolvedSrcTitle.toLowerCase().includes(q) ||
                      (rec.reason || '').toLowerCase().includes(q) ||
                      getUserNameByUid(rec.userId).toLowerCase().includes(q)
                    );
                  });

                  if (list.length === 0) {
                    return (
                      <div className="text-center py-12 text-zinc-500 text-xs font-bold">
                        لا توجد توصيات في هذه القائمة حالياً
                      </div>
                    );
                  }

                  return (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {list.map(rec => {
                        const userName = getUserNameByUid(rec.userId);
                        const currentStatus = rec.status || 'approved';
                        const srcTitle =
                          (rec.animeTitle && rec.animeTitle !== 'أنمي'
                            ? rec.animeTitle
                            : resolvedAnimeMeta[rec.animeId]?.title) || `أنمي #${rec.animeId}`;
                        const srcPoster = rec.animePosterUrl || resolvedAnimeMeta[rec.animeId]?.posterUrl || '';
                        const tgtTitle =
                          rec.targetAnimeTitle ||
                          resolvedAnimeMeta[rec.targetAnimeId]?.title ||
                          `أنمي #${rec.targetAnimeId}`;
                        const tgtPoster = rec.targetAnimePosterUrl || resolvedAnimeMeta[rec.targetAnimeId]?.posterUrl || '';

                        return (
                          <div
                            key={rec.id}
                            className="bg-zinc-950/80 border border-zinc-800/90 rounded-2xl p-4 flex flex-col justify-between gap-3.5 shadow-lg"
                          >
                            {/* Header: Status Badge & Natural Arabic Summary */}
                            <div className="flex flex-col gap-2 border-b border-zinc-800/70 pb-3">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[11px] font-bold text-zinc-400">
                                  اقتراح من العضو: <strong className="text-white">{userName}</strong>
                                </span>
                                <span
                                  className={`text-[10px] font-black px-2.5 py-0.5 rounded-full border ${
                                    currentStatus === 'pending'
                                      ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                                      : currentStatus === 'approved'
                                      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                      : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                                  }`}
                                >
                                  {currentStatus === 'pending'
                                    ? 'قيد المراجعة'
                                    : currentStatus === 'approved'
                                    ? 'منشورة ومعتمدة'
                                    : 'مرفوضة'}
                                </span>
                              </div>

                              <p className="text-xs text-zinc-300 leading-relaxed bg-zinc-900/60 border border-zinc-800/70 rounded-xl px-3 py-2">
                                عند تصفح أنمي{' '}
                                <strong className="text-sky-400 font-black">«{srcTitle}»</strong>، يوصي بمشاهدة أنمي مشابه له وهو{' '}
                                <strong className="text-amber-400 font-black">«{tgtTitle}»</strong>
                              </p>
                            </div>

                            {/* Visual Side-by-Side Comparison */}
                            <div className="grid grid-cols-2 gap-2.5">
                              {/* Box 1: Source Anime (Where user was browsing) */}
                              <div
                                onClick={() => {
                                  if (onNavigate && rec.animeId) {
                                    onNavigate('anime_details', { id: String(rec.animeId) });
                                  }
                                }}
                                className="bg-zinc-900/50 hover:bg-zinc-900 border border-zinc-800/80 hover:border-sky-500/40 rounded-xl p-2.5 flex items-center gap-2.5 cursor-pointer transition group"
                                title="اضغط لفتح صفحة هذا الأنمي"
                              >
                                {srcPoster ? (
                                  <img
                                    src={srcPoster}
                                    alt={srcTitle}
                                    referrerPolicy="no-referrer"
                                    className="w-11 h-16 rounded-lg object-cover shrink-0 bg-zinc-950 border border-zinc-800"
                                  />
                                ) : (
                                  <div className="w-11 h-16 rounded-lg bg-zinc-950 border border-zinc-800 flex items-center justify-center shrink-0 text-[9px] text-zinc-500 font-bold text-center px-1">
                                    بدون غلاف
                                  </div>
                                )}
                                <div className="min-w-0 flex-1">
                                  <span className="text-[9px] font-black text-sky-400 bg-sky-500/10 border border-sky-500/20 px-1.5 py-0.5 rounded inline-block mb-1">
                                    ١. صفحة الأنمي الأصلية
                                  </span>
                                  <p className="text-xs font-black text-white line-clamp-2 leading-snug group-hover:text-sky-300 transition">
                                    {srcTitle}
                                  </p>
                                </div>
                              </div>

                              {/* Box 2: Recommended Target Anime */}
                              <div
                                onClick={() => {
                                  if (onNavigate && rec.targetAnimeId) {
                                    onNavigate('anime_details', { id: String(rec.targetAnimeId) });
                                  }
                                }}
                                className="bg-amber-500/5 hover:bg-amber-500/10 border border-amber-500/25 hover:border-amber-500/50 rounded-xl p-2.5 flex items-center gap-2.5 cursor-pointer transition group"
                                title="اضغط لفتح صفحة الأنمي المُوصى به"
                              >
                                {tgtPoster ? (
                                  <img
                                    src={tgtPoster}
                                    alt={tgtTitle}
                                    referrerPolicy="no-referrer"
                                    className="w-11 h-16 rounded-lg object-cover shrink-0 bg-zinc-950 border border-amber-500/30"
                                  />
                                ) : (
                                  <div className="w-11 h-16 rounded-lg bg-zinc-950 border border-zinc-800 flex items-center justify-center shrink-0 text-[9px] text-zinc-500 font-bold text-center px-1">
                                    بدون غلاف
                                  </div>
                                )}
                                <div className="min-w-0 flex-1">
                                  <span className="text-[9px] font-black text-amber-300 bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 rounded inline-block mb-1">
                                    ٢. الأنمي المُوصى به
                                  </span>
                                  <p className="text-xs font-black text-white line-clamp-2 leading-snug group-hover:text-amber-300 transition">
                                    {tgtTitle}
                                  </p>
                                </div>
                              </div>
                            </div>

                            {/* Reason Box */}
                            <div className="bg-zinc-900/40 p-3 rounded-xl border border-zinc-800/60 space-y-1">
                              <span className="text-[10px] font-black text-zinc-400 block">
                                سبب التوصية (لماذا يتشابه العملان؟):
                              </span>
                              <p className="text-xs text-zinc-200 leading-relaxed font-medium">
                                "{rec.reason}"
                              </p>
                            </div>

                            {recIdBeingRejected === rec.id ? (
                              <div className="bg-zinc-900 border border-rose-500/30 p-2.5 rounded-xl space-y-2">
                                <input
                                  type="text"
                                  value={recRejectionReasonInput}
                                  onChange={e => setRecRejectionReasonInput(e.target.value)}
                                  placeholder="اكتب سبب الرفض لإرساله للعضو..."
                                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none"
                                />
                                <div className="flex justify-end gap-2">
                                  <button
                                    onClick={() => setRecIdBeingRejected(null)}
                                    className="px-2.5 py-1 rounded-lg bg-zinc-800 text-zinc-300 text-[10px] font-bold cursor-pointer"
                                  >
                                    إلغاء
                                  </button>
                                  <button
                                    onClick={() => handleRejectRec(rec, recRejectionReasonInput)}
                                    className="px-3 py-1 rounded-lg bg-rose-600 text-white text-[10px] font-bold cursor-pointer"
                                  >
                                    تأكيد الرفض
                                  </button>
                                </div>
                              </div>
                            ) : recIdBeingDeleted === rec.id ? (
                              <div className="bg-zinc-900 border border-rose-500/30 p-2.5 rounded-xl flex items-center justify-between">
                                <span className="text-[11px] text-zinc-200 font-bold">تأكيد الحذف النهائي؟</span>
                                <div className="flex gap-1.5">
                                  <button
                                    onClick={() => setRecIdBeingDeleted(null)}
                                    className="px-2.5 py-1 rounded-lg bg-zinc-800 text-zinc-300 text-[10px] font-bold cursor-pointer"
                                  >
                                    تراجع
                                  </button>
                                  <button
                                    onClick={() => handleDeleteRec(rec.id)}
                                    className="px-2.5 py-1 rounded-lg bg-rose-600 text-white text-[10px] font-bold cursor-pointer"
                                  >
                                    نعم، احذف
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between pt-2 border-t border-zinc-900 text-[11px]">
                                <span className="text-[10px] text-zinc-500">
                                  تظهر التوصية في صفحتي العملين بعد الاعتماد
                                </span>
                                <div className="flex items-center gap-1.5">
                                  {currentStatus !== 'approved' && (
                                    <button
                                      onClick={() => handleApproveRec(rec)}
                                      className="px-3 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/25 font-bold cursor-pointer transition"
                                    >
                                      قبول ونشر
                                    </button>
                                  )}
                                  {currentStatus !== 'rejected' && (
                                    <button
                                      onClick={() => {
                                        setRecIdBeingRejected(rec.id);
                                        setRecRejectionReasonInput('');
                                      }}
                                      className="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 font-bold cursor-pointer transition"
                                    >
                                      رفض
                                    </button>
                                  )}
                                  <button
                                    onClick={() => setRecIdBeingDeleted(rec.id)}
                                    className="p-1.5 rounded-lg bg-zinc-900 hover:bg-rose-500/15 text-zinc-400 hover:text-rose-400 border border-zinc-800 cursor-pointer transition"
                                    title="حذف نهائي"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* SUB-TAB 2.3: SUGGESTIONS & COMPLAINTS */}
            {modSubTab === 'suggestions' && (
              <div className="bg-[#121215] border border-zinc-800/80 rounded-2xl p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 pb-4">
                  <div>
                    <h2 className="text-sm font-black text-white">صندوق المقترحات والشكاوى</h2>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      الرسائل المرسلة من الأعضاء مع إمكانية الرد المباشر عبر الإشعارات
                    </p>
                  </div>
                  <div className="flex gap-1.5 bg-zinc-950 p-1 rounded-xl border border-zinc-800">
                    {[
                      { id: 'all', label: `الكل (${suggestionsList.length})` },
                      {
                        id: 'suggestion',
                        label: `مقترحات (${suggestionsList.filter(s => s.type === 'suggestion').length})`
                      },
                      {
                        id: 'complaint',
                        label: `شكاوى (${suggestionsList.filter(s => s.type === 'complaint').length})`
                      }
                    ].map(f => (
                      <button
                        key={f.id}
                        onClick={() => setSuggestionsFilter(f.id as any)}
                        className={`px-3 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                          suggestionsFilter === f.id ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                {suggestionsList.length === 0 ? (
                  <div className="text-center py-12 text-zinc-500 text-xs font-bold">
                    لا توجد مقترحات أو شكاوى حالياً
                  </div>
                ) : (
                  <div className="space-y-3">
                    {suggestionsList
                      .filter(s => (suggestionsFilter === 'all' ? true : s.type === suggestionsFilter))
                      .map((s: any) => (
                        <div
                          key={s.id}
                          className="bg-zinc-950/60 border border-zinc-800/80 rounded-xl p-4 space-y-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                                  s.type === 'complaint'
                                    ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                                    : 'bg-sky-500/10 text-sky-400 border-sky-500/20'
                                }`}
                              >
                                {s.type === 'complaint' ? 'تذكرة / مشكلة' : 'اقتراح تطوير'}
                              </span>
                              {s.category && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-300">
                                  {s.category}
                                </span>
                              )}
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                                  s.status === 'replied' || s.status === 'resolved'
                                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                    : s.status === 'in_progress'
                                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                    : 'bg-zinc-900 text-zinc-400 border-zinc-800'
                                }`}
                              >
                                {s.status === 'replied'
                                  ? 'تم الرد'
                                  : s.status === 'resolved'
                                  ? 'مكتملة'
                                  : s.status === 'in_progress'
                                  ? 'قيد المعالجة'
                                  : 'جديدة'}
                              </span>
                              <span className="text-xs font-bold text-white">{s.displayName || 'عضو'}</span>
                              {s.email && <span className="text-[10px] text-zinc-500 font-mono">({s.email})</span>}
                            </div>
                            <span className="text-[10px] text-zinc-500">
                              {s.createdAt?.seconds
                                ? new Date(s.createdAt.seconds * 1000).toLocaleDateString('ar-EG')
                                : ''}
                            </span>
                          </div>

                          {s.subject && (
                            <div className="text-xs font-black text-white">{s.subject}</div>
                          )}

                          <p className="text-xs text-zinc-200 bg-zinc-900/60 p-3 rounded-xl border border-zinc-800/60 leading-relaxed whitespace-pre-wrap">
                            {s.message}
                          </p>

                          {s.adminReply && (
                            <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-3 space-y-1">
                              <div className="flex items-center justify-between text-[10px] text-emerald-400 font-bold">
                                <span>رد الإدارة ({s.repliedBy || 'المشرف'}):</span>
                              </div>
                              <p className="text-xs text-zinc-200 leading-relaxed whitespace-pre-wrap">
                                {s.adminReply}
                              </p>
                            </div>
                          )}

                          {replyingSuggestion?.id === s.id ? (
                            <div className="bg-zinc-900 border border-zinc-700 p-3 rounded-xl space-y-2">
                              <input
                                type="text"
                                value={suggestionReplyText}
                                onChange={e => setSuggestionReplyText(e.target.value)}
                                placeholder="اكتب رد الإدارة ليظهر في صفحة تذاكر العضو ويصله كإشعار..."
                                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none"
                              />
                              <div className="flex justify-end gap-2">
                                <button
                                  onClick={() => setReplyingSuggestion(null)}
                                  className="px-3 py-1 rounded-lg bg-zinc-800 text-zinc-300 text-[11px] font-bold cursor-pointer"
                                >
                                  إلغاء
                                </button>
                                <button
                                  onClick={() => handleReplyToSuggestion(s)}
                                  className="px-3 py-1 rounded-lg bg-[#FF1744] text-white text-[11px] font-bold cursor-pointer flex items-center gap-1"
                                >
                                  <Send size={12} />
                                  <span>حفظ وإرسال الرد</span>
                                </button>
                              </div>
                            </div>
                          ) : suggestionBeingDeleted === s.id ? (
                            <div className="flex items-center justify-between bg-zinc-900 p-2.5 rounded-xl border border-rose-500/30">
                              <span className="text-xs text-zinc-200 font-bold">هل تريد حذف وأرشفة هذه التذكرة؟</span>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => setSuggestionBeingDeleted(null)}
                                  className="px-2.5 py-1 rounded-lg bg-zinc-800 text-zinc-300 text-[10px] font-bold cursor-pointer"
                                >
                                  تراجع
                                </button>
                                <button
                                  onClick={() => handleDeleteSuggestion(s.id)}
                                  className="px-3 py-1 rounded-lg bg-rose-600 text-white text-[10px] font-bold cursor-pointer"
                                >
                                  تأكيد الحذف
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                              <div className="flex items-center gap-1.5">
                                {s.status !== 'in_progress' && s.status !== 'resolved' && (
                                  <button
                                    onClick={() => handleUpdateSuggestionStatus(s, 'in_progress')}
                                    className="px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 text-[10px] font-bold cursor-pointer transition"
                                  >
                                    قيد المعالجة
                                  </button>
                                )}
                                {s.status !== 'resolved' && (
                                  <button
                                    onClick={() => handleUpdateSuggestionStatus(s, 'resolved')}
                                    className="px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold cursor-pointer transition"
                                  >
                                    إغلاق كمكتملة
                                  </button>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => {
                                    setReplyingSuggestion(s);
                                    setSuggestionReplyText(s.adminReply || '');
                                  }}
                                  className="px-3 py-1.5 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/20 text-[11px] font-bold cursor-pointer transition"
                                >
                                  {s.adminReply ? 'تعديل الرد' : 'الرد على التذكرة'}
                                </button>
                                <button
                                  onClick={() => setSuggestionBeingDeleted(s.id)}
                                  className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-rose-500/15 text-zinc-400 hover:text-rose-400 border border-zinc-800 text-[11px] font-bold cursor-pointer transition"
                                >
                                  حذف
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                  </div>
                )}
              </div>
            )}

            {/* SUB-TAB 2.4: AUDIT LOGS (سجل نشاط المشرفين) */}
            {modSubTab === 'audit' && (
              <div className="bg-[#121215] border border-zinc-800/80 rounded-2xl p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 pb-4">
                  <div>
                    <h2 className="text-sm font-black text-white">سجل نشاط المشرفين والعمليات (Audit Log)</h2>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      توثيق لحظي لكل إجراء إداري (حظر، قبول توصية، تعديل رصيد، أكواد هدايا، إعدادات)
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5 bg-zinc-950 p-1 rounded-xl border border-zinc-800">
                    {[
                      { id: 'all', label: 'الكل' },
                      { id: 'report', label: 'البلاغات' },
                      { id: 'recommendation', label: 'التوصيات' },
                      { id: 'ban', label: 'الحظر' },
                      { id: 'member_edit', label: 'الأعضاء' },
                      { id: 'promo', label: 'الهدايا' },
                      { id: 'settings', label: 'الإعدادات' }
                    ].map(f => (
                      <button
                        key={f.id}
                        onClick={() => setAuditTypeFilter(f.id)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                          auditTypeFilter === f.id ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                {(() => {
                  const filtered = auditLogs.filter(l =>
                    auditTypeFilter === 'all' ? true : l.actionType === auditTypeFilter
                  );
                  if (filtered.length === 0) {
                    return (
                      <div className="text-center py-12 text-zinc-500 text-xs font-bold">
                        لا توجد سجلات نشاط مسجلة في هذا التصنيف حتى الآن
                      </div>
                    );
                  }
                  return (
                    <div className="space-y-2.5 max-h-[520px] overflow-y-auto pr-1">
                      {filtered.map((log, idx) => (
                        <div
                          key={log.id || idx}
                          className="bg-zinc-950/60 border border-zinc-800/80 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                        >
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                                  log.actionType === 'ban'
                                    ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                                    : log.actionType === 'promo'
                                      ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                      : log.actionType === 'recommendation'
                                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                        : 'bg-sky-500/10 text-sky-400 border-sky-500/20'
                                }`}
                              >
                                {log.actorName} ({log.actorRole === 'owner' ? 'المالك' : log.actorRole === 'admin' ? 'مدير' : 'مشرف'})
                              </span>
                              <span className="text-xs font-bold text-white">{log.details}</span>
                            </div>
                            <div className="text-[11px] text-zinc-400">
                              الهدف: <strong className="text-zinc-200">{log.targetLabel}</strong>
                            </div>
                          </div>
                          <span className="text-[10px] text-zinc-500 font-mono shrink-0">
                            {log.createdAt?.seconds
                              ? new Date(log.createdAt.seconds * 1000).toLocaleString('ar-EG', {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })
                              : 'الآن'}
                          </span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        )}

        {/* =========================================================
            WORKSPACE 3: COMMUNITY & STAFF (الأعضاء والرتب)
           ========================================================= */}
        {workspace === 'community' && (
          <div className="space-y-5">
            {/* Sub-Tabs Selector */}
            <div className="flex flex-wrap items-center gap-2 bg-[#121215] border border-zinc-800/80 p-1.5 rounded-2xl w-fit">
              <button
                onClick={() => setCommSubTab('members')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                  commSubTab === 'members' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Users size={14} className="text-emerald-400" />
                <span>دليل الأعضاء ({allUsers.length})</span>
              </button>

              {(role === 'owner' || role === 'admin' || modPerms.canViewRoles) && (
                <button
                  onClick={() => setCommSubTab('roles')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                    commSubTab === 'roles' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <Crown size={14} className="text-violet-400" />
                  <span>الرتب والمشرفون ({usersInfo.length})</span>
                </button>
              )}

              {(role === 'owner' || role === 'admin' || modPerms.canBan) && (
                <button
                  onClick={() => setCommSubTab('bans')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                    commSubTab === 'bans' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <UserX size={14} className="text-rose-400" />
                  <span>قائمة الحظر ({bannedUsers.length})</span>
                </button>
              )}

              {(role === 'owner' || role === 'admin' || modPerms.canManageSettings) && (
                <button
                  onClick={() => setCommSubTab('promos')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                    commSubTab === 'promos' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <Gift size={14} className="text-amber-400" />
                  <span>أكواد المكافآت والإهداء ({promoCodesList.length})</span>
                </button>
              )}
            </div>

            {/* SUB-TAB 3.1: MEMBERS DIRECTORY */}
            {commSubTab === 'members' && (
              <div className="bg-[#121215] border border-zinc-800/80 rounded-2xl p-5 space-y-4">
                {/* Search & Filters */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="relative">
                    <Search size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                    <input
                      type="text"
                      value={searchUserQuery}
                      onChange={e => setSearchUserQuery(e.target.value)}
                      placeholder="ابحث بالاسم، @username، البريد، أو UID..."
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pr-9 pl-3 py-2 text-xs text-white focus:outline-none focus:border-zinc-700"
                    />
                  </div>

                  <select
                    value={userFilterBy}
                    onChange={e => setUserFilterBy(e.target.value as any)}
                    className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-200 font-bold focus:outline-none"
                  >
                    <option value="all">جميع الأعضاء ({allUsers.length})</option>
                    <option value="staff">طاقم الإدارة والإشراف</option>
                    <option value="muted">الأعضاء المكتومون ({statsMetrics.mutedCount})</option>
                    <option value="gamesRestricted">مقيدو الألعاب</option>
                    <option value="coinsRestricted">مجمدو الكوينز</option>
                  </select>

                  <select
                    value={userSortBy}
                    onChange={e => setUserSortBy(e.target.value as any)}
                    className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-200 font-bold focus:outline-none"
                  >
                    <option value="default">الترتيب الافتراضي</option>
                    <option value="coins">الأعلى رصيد كوينز</option>
                    <option value="level">الأعلى مستوى (Level)</option>
                    <option value="xp">الأعلى خبرة (XP)</option>
                  </select>
                </div>

                {/* Member Edit Drawer / Panel */}
                {editingUser && (
                  <div className="bg-zinc-950 border border-[#FF1744]/40 rounded-2xl p-4 space-y-4">
                    <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-zinc-800 overflow-hidden flex items-center justify-center text-xs font-bold">
                          {editingUser.photoURL ? (
                            <img src={editingUser.photoURL} alt="" className="w-full h-full object-cover" />
                          ) : (
                            (editingUser.displayName || 'U')[0]
                          )}
                        </div>
                        <div>
                          <h3 className="text-xs font-black text-white">
                            تعديل بيانات وصلاحيات: {editingUser.displayName || 'عضو'}
                          </h3>
                          <span className="text-[10px] text-zinc-500 font-mono">@{editingUser.username || editingUser.uid}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => setEditingUser(null)}
                        className="p-1.5 rounded-lg bg-zinc-900 text-zinc-400 hover:text-white cursor-pointer"
                      >
                        <X size={15} />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[10px] text-zinc-400 font-bold mb-1">رصيد الكوينز</label>
                        <input
                          type="number"
                          value={editingCoins}
                          onChange={e => setEditingCoins(Number(e.target.value))}
                          className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-2 px-3 text-xs font-bold text-amber-400 text-center focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-zinc-400 font-bold mb-1">إجمالي الخبرة (XP)</label>
                        <input
                          type="number"
                          value={editingXP}
                          onChange={e => {
                            const val = Math.max(0, Number(e.target.value));
                            setEditingXP(val);
                            setEditingLevel(calculateLevelAndXpFromTotal(val).level);
                          }}
                          className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-2 px-3 text-xs font-bold text-sky-400 text-center focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-zinc-400 font-bold mb-1">المستوى (1 - 100)</label>
                        <input
                          type="number"
                          min={1}
                          max={100}
                          value={editingLevel}
                          onChange={e => {
                            const lvl = Math.max(1, Math.min(100, Number(e.target.value)));
                            setEditingLevel(lvl);
                            setEditingXP(calculateTotalCumulativeXp(lvl, 0));
                          }}
                          className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-2 px-3 text-xs font-bold text-emerald-400 text-center focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <button
                        type="button"
                        onClick={() => setEditingIsMuted(!editingIsMuted)}
                        className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-between cursor-pointer transition ${
                          editingIsMuted
                            ? 'bg-rose-500/15 border-rose-500/30 text-rose-400'
                            : 'bg-zinc-900 border-zinc-800 text-zinc-400'
                        }`}
                      >
                        <span className="flex items-center gap-1.5">
                          <VolumeX size={14} /> كتم التعليقات
                        </span>
                        <span>{editingIsMuted ? 'مفعّل' : 'غير مفعّل'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setEditingIsGamesRestricted(!editingIsGamesRestricted)}
                        className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-between cursor-pointer transition ${
                          editingIsGamesRestricted
                            ? 'bg-rose-500/15 border-rose-500/30 text-rose-400'
                            : 'bg-zinc-900 border-zinc-800 text-zinc-400'
                        }`}
                      >
                        <span className="flex items-center gap-1.5">
                          <Gamepad2 size={14} /> تقييد الألعاب
                        </span>
                        <span>{editingIsGamesRestricted ? 'مفعّل' : 'غير مفعّل'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setEditingIsCoinsRestricted(!editingIsCoinsRestricted)}
                        className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-between cursor-pointer transition ${
                          editingIsCoinsRestricted
                            ? 'bg-rose-500/15 border-rose-500/30 text-rose-400'
                            : 'bg-zinc-900 border-zinc-800 text-zinc-400'
                        }`}
                      >
                        <span className="flex items-center gap-1.5">
                          <Coins size={14} /> تجميد الكوينز
                        </span>
                        <span>{editingIsCoinsRestricted ? 'مفعّل' : 'غير مفعّل'}</span>
                      </button>
                    </div>

                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        onClick={() => setEditingUser(null)}
                        className="px-4 py-2 rounded-xl bg-zinc-900 text-zinc-400 text-xs font-bold cursor-pointer"
                      >
                        إلغاء
                      </button>
                      <button
                        onClick={handleUpdateUserStats}
                        disabled={isUpdatingUser}
                        className="px-5 py-2 rounded-xl bg-[#FF1744] hover:bg-rose-600 text-white text-xs font-bold cursor-pointer transition"
                      >
                        {isUpdatingUser ? 'جاري الحفظ...' : 'حفظ التغييرات'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Members List */}
                <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
                  {(() => {
                    const filtered = allUsers
                      .filter(u => {
                        if (!matchesUserSearch(u, searchUserQuery)) return false;
                        const memberRoleObj = usersInfo.find(r => r.uid === u.uid || r.id === u.uid);
                        const memberRole = isStaffEmail(u.email) ? 'owner' : memberRoleObj?.role || u.role || 'user';
                        if (userFilterBy === 'staff') return memberRole !== 'user';
                        if (userFilterBy === 'muted') return u.isMuted === true;
                        if (userFilterBy === 'gamesRestricted') return u.isGamesRestricted === true;
                        if (userFilterBy === 'coinsRestricted') return u.isCoinsRestricted === true;
                        return true;
                      })
                      .sort((a, b) => {
                        if (userSortBy === 'coins') return (b.coins || 0) - (a.coins || 0);
                        if (userSortBy === 'level') return (b.level || 1) - (a.level || 1);
                        if (userSortBy === 'xp') return (b.xp || 0) - (a.xp || 0);
                        return 0;
                      });

                    if (filtered.length === 0) {
                      return (
                        <div className="text-center py-10 text-zinc-500 text-xs font-bold">
                          لا يوجد أعضاء مطابقون للبحث
                        </div>
                      );
                    }

                    return filtered.slice(0, 60).map(u => {
                      const memberRoleObj = usersInfo.find(r => r.uid === u.uid || r.id === u.uid);
                      const memberRole = isStaffEmail(u.email) ? 'owner' : memberRoleObj?.role || u.role || 'user';
                      return (
                        <div
                          key={u.uid}
                          className="bg-zinc-950/60 border border-zinc-800/70 hover:border-zinc-700/80 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center font-bold text-xs text-zinc-300 overflow-hidden shrink-0">
                              {u.photoURL ? (
                                <img src={u.photoURL} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                              ) : (
                                (u.displayName || 'U')[0].toUpperCase()
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-xs font-bold text-white truncate">{u.displayName || 'عضو'}</span>
                                {memberRole !== 'user' && (
                                  <span
                                    className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                                      memberRole === 'owner'
                                        ? 'bg-rose-500/15 text-rose-400 border border-rose-500/25'
                                        : memberRole === 'admin'
                                          ? 'bg-amber-500/15 text-amber-400 border border-amber-500/25'
                                          : 'bg-violet-500/15 text-violet-400 border border-violet-500/25'
                                    }`}
                                  >
                                    {memberRole === 'owner' ? 'المالك' : memberRole === 'admin' ? 'مدير' : 'مشرف'}
                                  </span>
                                )}
                                <span className="text-[10px] bg-zinc-900 text-zinc-300 px-1.5 py-0.5 rounded font-bold">
                                  Lvl {u.level || 1}
                                </span>
                                <span className="text-[10px] bg-amber-500/10 text-amber-400 px-1.5 py-0.5 rounded font-bold">
                                  {u.coins || 0} كوينز
                                </span>
                                {u.isMuted && (
                                  <span className="text-[9px] bg-rose-500/15 text-rose-400 px-1.5 py-0.5 rounded font-bold">
                                    مكتوم
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-zinc-500 font-mono truncate mt-0.5">
                                @{u.username || u.uid} {u.email ? `• ${u.email}` : ''}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
                            <button
                              onClick={() => {
                                setEditingUser(u);
                                setEditingCoins(u.coins || 0);
                                setEditingXP(calculateTotalCumulativeXp(u.level || 1, u.xp || 0));
                                setEditingLevel(u.level || 1);
                                setEditingIsMuted(u.isMuted || false);
                                setEditingIsGamesRestricted(u.isGamesRestricted || false);
                                setEditingIsCoinsRestricted(u.isCoinsRestricted || false);
                              }}
                              className="px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 text-[11px] font-bold cursor-pointer transition"
                            >
                              تعديل
                            </button>

                            {(role === 'owner' || role === 'admin') && (
                              <button
                                onClick={() => {
                                  setSelectedSearchUser(u);
                                  setUserIdInput(u.username || u.uid);
                                  setCommSubTab('roles');
                                }}
                                className="px-2.5 py-1.5 rounded-lg bg-violet-500/10 hover:bg-violet-500/20 border border-violet-500/20 text-violet-300 text-[11px] font-bold cursor-pointer transition"
                              >
                                الرتبة
                              </button>
                            )}

                            <button
                              onClick={() => {
                                const idStr = u.username || u.uid;
                                navigator.clipboard.writeText(idStr);
                                notify(`تم نسخ المعرّف: ${idStr}`);
                              }}
                              className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-white cursor-pointer transition"
                              title="نسخ المعرّف"
                            >
                              <Copy size={13} />
                            </button>

                            {u.uid !== auth.currentUser?.uid && !isStaffEmail(u.email) && (
                              <button
                                onClick={() => handleBan(u.uid)}
                                className="px-2.5 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 text-[11px] font-bold cursor-pointer transition"
                              >
                                حظر
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            )}

            {/* SUB-TAB 3.2: ROLES & STAFF PERMISSIONS */}
            {commSubTab === 'roles' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Assign Role Card */}
                <div className="bg-[#121215] border border-zinc-800/80 rounded-2xl p-5 space-y-4">
                  <div>
                    <h2 className="text-sm font-black text-white">تعيين أو تعديل رتبة عضو</h2>
                    <p className="text-[11px] text-zinc-400 mt-0.5">ترقية عضو إلى مشرف أو مدير أو سحب الرتبة</p>
                  </div>

                  <div className="space-y-3">
                    <div className="relative">
                      <Search size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                      <input
                        type="text"
                        value={roleSearchQuery}
                        onChange={e => {
                          setRoleSearchQuery(e.target.value);
                          setSelectedSearchUser(null);
                        }}
                        placeholder="ابحث عن العضو بالاسم أو @username..."
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pr-9 pl-3 py-2 text-xs text-white focus:outline-none"
                      />
                    </div>

                    {!selectedSearchUser && (
                      <div className="bg-zinc-950 border border-zinc-800/80 rounded-xl divide-y divide-zinc-900 max-h-44 overflow-y-auto">
                        {suggestedRoleUsers.map(u => (
                          <button
                            type="button"
                            key={u.uid}
                            onClick={() => {
                              setSelectedSearchUser(u);
                              setUserIdInput(u.username || u.uid);
                            }}
                            className="w-full p-2.5 hover:bg-zinc-900 flex items-center justify-between text-xs cursor-pointer transition text-right"
                          >
                            <div>
                              <span className="font-bold text-white block">{u.displayName || 'عضو'}</span>
                              <span className="text-[10px] text-zinc-500 font-mono">@{u.username || u.uid}</span>
                            </div>
                            <span className="text-[10px] text-[#FF1744] font-bold">اختيار</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {selectedSearchUser && (
                      <div className="flex items-center justify-between bg-zinc-900 border border-zinc-700 p-2.5 rounded-xl text-xs">
                        <div>
                          <span className="text-zinc-400">العضو المختار: </span>
                          <strong className="text-white">{selectedSearchUser.displayName}</strong>
                        </div>
                        <button
                          onClick={() => {
                            setSelectedSearchUser(null);
                            setUserIdInput('');
                          }}
                          className="text-rose-400 text-[11px] font-bold cursor-pointer"
                        >
                          تغيير
                        </button>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <select
                        value={roleInput}
                        onChange={e => setRoleInput(e.target.value as RoleLevel)}
                        className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-xs text-white font-bold focus:outline-none"
                      >
                        <option value="moderator">مشرف (Moderator)</option>
                        {role === 'owner' && <option value="admin">مدير (Admin)</option>}
                        <option value="user">عضو عادي (سحب الرتبة)</option>
                      </select>

                      <button
                        onClick={handleAssignRole}
                        className="bg-[#FF1744] hover:bg-rose-600 text-white font-bold py-2.5 px-4 rounded-xl text-xs transition cursor-pointer"
                      >
                        حفظ وتطبيق الرتبة
                      </button>
                    </div>
                  </div>
                </div>

                {/* Current Staff List */}
                <div className="bg-[#121215] border border-zinc-800/80 rounded-2xl p-5 space-y-4">
                  <div>
                    <h2 className="text-sm font-black text-white">طاقم الإشراف الحالي</h2>
                    <p className="text-[11px] text-zinc-400 mt-0.5">التحكم في الصلاحيات الفرعية أو إعفاء المشرفين</p>
                  </div>

                  <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
                    {usersInfo.map(u => {
                      const profile = allUsers.find(m => m.uid === u.uid) || { displayName: 'مشرف', username: u.uid };
                      return (
                        <div
                          key={u.uid}
                          className="bg-zinc-950/60 border border-zinc-800/80 rounded-xl p-3 space-y-2.5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-white">{profile.displayName}</span>
                                <span
                                  className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                                    u.role === 'owner'
                                      ? 'bg-rose-500/15 text-rose-400'
                                      : u.role === 'admin'
                                        ? 'bg-amber-500/15 text-amber-400'
                                        : 'bg-violet-500/15 text-violet-400'
                                  }`}
                                >
                                  {u.role === 'owner' ? 'المالك' : u.role === 'admin' ? 'مدير' : 'مشرف'}
                                </span>
                              </div>
                              <span className="text-[10px] text-zinc-500 font-mono block mt-0.5">
                                @{profile.username || u.uid}
                              </span>
                            </div>

                            {u.role !== 'owner' && (
                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={async () => {
                                    const docS = await getDoc(doc(db, 'globalRoles', u.uid));
                                    const d = docS.exists() ? docS.data() : {};
                                    setEditingPermissionsMod(u);
                                    setModCustomPerms({
                                      canBan: d.canBan ?? false,
                                      canNotify: d.canNotify ?? false,
                                      canManageSettings: d.canManageSettings ?? false,
                                      canViewRoles: d.canViewRoles ?? false
                                    });
                                  }}
                                  className="px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 text-[11px] font-bold cursor-pointer"
                                >
                                  الصلاحيات
                                </button>

                                {role === 'owner' && (
                                  <button
                                    onClick={() => setConfirmDemoteUid(u.uid)}
                                    className="px-2.5 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 text-[11px] font-bold cursor-pointer"
                                  >
                                    إعفاء
                                  </button>
                                )}
                              </div>
                            )}
                          </div>

                          {confirmDemoteUid === u.uid && (
                            <div className="flex items-center justify-between bg-zinc-900 p-2.5 rounded-lg border border-rose-500/30">
                              <span className="text-[11px] text-zinc-200 font-bold">
                                تأكيد سحب الإشراف من {profile.displayName}؟
                              </span>
                              <div className="flex gap-1.5">
                                <button
                                  onClick={() => setConfirmDemoteUid(null)}
                                  className="px-2.5 py-1 rounded bg-zinc-800 text-zinc-300 text-[10px] font-bold cursor-pointer"
                                >
                                  تراجع
                                </button>
                                <button
                                  onClick={() => handleDemoteStaff(u.uid)}
                                  className="px-2.5 py-1 rounded bg-rose-600 text-white text-[10px] font-bold cursor-pointer"
                                >
                                  تأكيد الإعفاء
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Moderator Custom Permissions Editor */}
                  {editingPermissionsMod && (
                    <div className="bg-zinc-950 border border-zinc-700 rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold text-white">تخصيص صلاحيات المشرف</h4>
                        <button
                          onClick={() => setEditingPermissionsMod(null)}
                          className="text-zinc-400 hover:text-white text-xs cursor-pointer"
                        >
                          <X size={15} />
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        {[
                          { key: 'canBan', label: 'حظر وفك حظر الأعضاء' },
                          { key: 'canNotify', label: 'إرسال الإشعارات العامة' },
                          { key: 'canManageSettings', label: 'تعديل إعدادات السلايدر' },
                          { key: 'canViewRoles', label: 'الاطلاع على سجل الرتب' }
                        ].map(perm => {
                          const active = (modCustomPerms as any)[perm.key];
                          return (
                            <button
                              key={perm.key}
                              type="button"
                              onClick={() =>
                                setModCustomPerms(prev => ({ ...prev, [perm.key]: !(prev as any)[perm.key] }))
                              }
                              className={`p-2.5 rounded-lg border flex items-center justify-between font-bold cursor-pointer transition ${
                                active
                                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                                  : 'bg-zinc-900 border-zinc-800 text-zinc-400'
                              }`}
                            >
                              <span>{perm.label}</span>
                              <span>{active ? '✓' : '×'}</span>
                            </button>
                          );
                        })}
                      </div>
                      <button
                        onClick={handleSaveModCustomPermissions}
                        className="w-full bg-[#FF1744] hover:bg-rose-600 text-white font-bold py-2 rounded-xl text-xs cursor-pointer transition"
                      >
                        حفظ الصلاحيات
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* SUB-TAB 3.3: BANS MANAGEMENT */}
            {commSubTab === 'bans' && (
              <div className="bg-[#121215] border border-zinc-800/80 rounded-2xl p-5 space-y-5">
                <div>
                  <h2 className="text-sm font-black text-white">إدارة الحظر وفك القيود</h2>
                  <p className="text-[11px] text-zinc-400 mt-0.5">حظر الحسابات المخالفة أو استعادة الحسابات المحظورة</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 bg-zinc-950/60 p-3.5 rounded-xl border border-zinc-800/80">
                  <input
                    type="text"
                    value={userIdInput}
                    onChange={e => setUserIdInput(e.target.value)}
                    placeholder="اسم المستخدم (@username) أو UID..."
                    className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                  />
                  <input
                    type="text"
                    value={banReasonInput}
                    onChange={e => setBanReasonInput(e.target.value)}
                    placeholder="سبب الحظر..."
                    className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                  />
                  <button
                    onClick={() => handleBan()}
                    className="bg-rose-600 hover:bg-rose-500 text-white font-bold py-2 px-4 rounded-xl text-xs cursor-pointer transition"
                  >
                    تنفيذ الحظر
                  </button>
                </div>

                <div className="space-y-2">
                  {bannedUsers.length === 0 ? (
                    <div className="text-center py-10 text-zinc-500 text-xs font-bold">
                      لا توجد حسابات محظورة حالياً
                    </div>
                  ) : (
                    bannedUsers.map(b => (
                      <div
                        key={b.uid}
                        className="bg-zinc-950/60 border border-zinc-800/80 rounded-xl p-3 flex items-center justify-between gap-3"
                      >
                        <div>
                          <span className="text-xs font-bold text-white block">{getUserNameByUid(b.uid)}</span>
                          <span className="text-[10px] text-zinc-500 block mt-0.5">
                            السبب: {b.reason || 'مخالفة شروط الاستخدام'}
                          </span>
                        </div>
                        <button
                          onClick={() => handleUnban(b.uid)}
                          className="px-3 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/25 text-emerald-400 text-xs font-bold cursor-pointer transition"
                        >
                          فك الحظر
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* SUB-TAB 3.4: PROMO CODES & MASS GRANTS (أكواد المكافآت والإهداء الجماعي) */}
            {commSubTab === 'promos' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* Create Promo Code + Active Codes List */}
                <div className="lg:col-span-2 bg-[#121215] border border-zinc-800/80 rounded-2xl p-5 space-y-5">
                  <div className="border-b border-zinc-800/80 pb-3">
                    <h2 className="text-sm font-black text-white flex items-center gap-2">
                      <Ticket size={16} className="text-amber-400" />
                      <span>إنشاء وإدارة أكواد الهدايا (Promo Codes)</span>
                    </h2>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      يمكن للأعضاء استرداد الكود من صفحة الجوائز للحصول على كوينز و XP فورية
                    </p>
                  </div>

                  {/* Create Form */}
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 bg-zinc-950/70 p-3.5 rounded-xl border border-zinc-800">
                    <div>
                      <label className="block text-[10px] text-zinc-400 font-bold mb-1">رمز الكود</label>
                      <input
                        type="text"
                        dir="ltr"
                        value={newPromoCode}
                        onChange={e => setNewPromoCode(e.target.value.toUpperCase())}
                        placeholder="OTAKU500"
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs font-mono font-black text-amber-400 uppercase text-center focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-zinc-400 font-bold mb-1">الكوينز الممنوحة</label>
                      <input
                        type="number"
                        min={0}
                        value={newPromoCoins}
                        onChange={e => setNewPromoCoins(Number(e.target.value))}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs font-bold text-white text-center focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-zinc-400 font-bold mb-1">نقاط الخبرة (XP)</label>
                      <input
                        type="number"
                        min={0}
                        value={newPromoXp}
                        onChange={e => setNewPromoXp(Number(e.target.value))}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs font-bold text-white text-center focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-zinc-400 font-bold mb-1">الحد الأقصى للاستخدام</label>
                      <input
                        type="number"
                        min={1}
                        value={newPromoMaxUses}
                        onChange={e => setNewPromoMaxUses(Number(e.target.value))}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs font-bold text-white text-center focus:outline-none"
                      />
                    </div>
                  </div>

                  <button
                    onClick={handleCreatePromoCode}
                    disabled={isCreatingPromo || !newPromoCode.trim()}
                    className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black font-black py-2.5 rounded-xl text-xs transition cursor-pointer"
                  >
                    {isCreatingPromo ? 'جاري الإنشاء...' : '+ إنشاء ونشر كود المكافأة'}
                  </button>

                  {/* Codes List */}
                  <div className="space-y-2.5 pt-2">
                    {promoCodesList.length === 0 ? (
                      <div className="text-center py-8 text-zinc-500 text-xs font-bold">
                        لا توجد أكواد هدايا مضافة حالياً
                      </div>
                    ) : (
                      promoCodesList.map(promo => {
                        const isExhausted = (promo.usedCount || 0) >= (promo.maxUses || 1);
                        return (
                          <div
                            key={promo.id}
                            className="bg-zinc-950/70 border border-zinc-800/80 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                          >
                            <div className="flex items-center gap-3">
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(promo.code);
                                  notify(`تم نسخ الكود: ${promo.code}`);
                                }}
                                className="px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 font-mono font-black text-xs flex items-center gap-1.5 cursor-pointer"
                                title="نسخ الكود"
                              >
                                <span>{promo.code}</span>
                                <Copy size={12} />
                              </button>
                              <div>
                                <div className="flex items-center gap-2 text-xs font-bold text-white">
                                  <span className="text-amber-400">+{promo.rewardCoins} كوينز</span>
                                  <span>•</span>
                                  <span className="text-sky-400">+{promo.rewardXp} XP</span>
                                </div>
                                <div className="text-[10px] text-zinc-500 mt-0.5">
                                  الاستخدام: <strong className="text-zinc-300">{promo.usedCount || 0}</strong> من{' '}
                                  <strong className="text-zinc-300">{promo.maxUses}</strong> عضو
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 self-end sm:self-auto">
                              <button
                                onClick={() => handleTogglePromo(promo)}
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border cursor-pointer transition ${
                                  promo.active && !isExhausted
                                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25'
                                    : 'bg-zinc-900 text-zinc-400 border-zinc-800'
                                }`}
                              >
                                {isExhausted ? 'مكتمل العدد' : promo.active ? 'نشط (إيقاف)' : 'متوقف (تفعيل)'}
                              </button>
                              <button
                                onClick={() => handleDeletePromo(promo.id)}
                                className="p-1.5 rounded-lg bg-zinc-900 hover:bg-rose-500/15 text-zinc-400 hover:text-rose-400 border border-zinc-800 cursor-pointer transition"
                                title="حذف الكود"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Mass Grant Card */}
                <div className="bg-[#121215] border border-zinc-800/80 rounded-2xl p-5 space-y-4 h-fit">
                  <div className="border-b border-zinc-800/80 pb-3">
                    <h3 className="text-sm font-black text-white flex items-center gap-2">
                      <Gift size={16} className="text-[#FF1744]" />
                      <span>إهداء جماعي فوري</span>
                    </h3>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      منح كوينز أو نقاط خبرة لجميع الأعضاء أو شريحة محددة بضغطة واحدة مع إشعار عام
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-[11px] text-zinc-400 font-bold mb-1">الشريحة المستهدفة</label>
                      <select
                        value={massGrantSegment}
                        onChange={e => setMassGrantSegment(e.target.value as any)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white font-bold focus:outline-none"
                      >
                        <option value="all">جميع أعضاء المنصة ({allUsers.length})</option>
                        <option value="active_30">الأعضاء النشطون (Lvl 3 فأعلى)</option>
                        <option value="elite">نخبة المنصة (Lvl 15 فأعلى)</option>
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[11px] text-zinc-400 font-bold mb-1">كوينز لكل عضو</label>
                        <input
                          type="number"
                          min={0}
                          value={massGrantCoins}
                          onChange={e => setMassGrantCoins(Number(e.target.value))}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs font-bold text-amber-400 text-center focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-zinc-400 font-bold mb-1">خبرة (XP) لكل عضو</label>
                        <input
                          type="number"
                          min={0}
                          value={massGrantXp}
                          onChange={e => setMassGrantXp(Number(e.target.value))}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs font-bold text-sky-400 text-center focus:outline-none"
                        />
                      </div>
                    </div>

                    <button
                      onClick={handleMassGrant}
                      disabled={isGrantingMass}
                      className="w-full bg-[#FF1744] hover:bg-rose-600 disabled:opacity-40 text-white font-black py-3 rounded-xl text-xs transition cursor-pointer"
                    >
                      {isGrantingMass ? 'جاري توزيع المكافآت...' : 'إرسال المكافأة الجماعية الآن'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* =========================================================
            WORKSPACE 4: BROADCAST & NOTIFICATIONS (الإشعارات والبث)
           ========================================================= */}
        {workspace === 'broadcast' && canAccessBroadcast && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Composer Form */}
            <div className="lg:col-span-2 bg-[#121215] border border-zinc-800/80 rounded-2xl p-5 space-y-4">
              <div className="border-b border-zinc-800/80 pb-3">
                <h2 className="text-sm font-black text-white">إرسال إشعار تفاعلي</h2>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  بث تنبيه لجميع المستخدمين أو لعضو محدد مع إمكانية ربطه بأنمي أو صفحة داخلية
                </p>
              </div>

              {/* Target Audience */}
              <div className="grid grid-cols-2 gap-2.5 bg-zinc-950 p-1.5 rounded-xl border border-zinc-800">
                <button
                  type="button"
                  onClick={() => setNotifTargetChoice('all')}
                  className={`py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                    notifTargetChoice === 'all' ? 'bg-[#FF1744] text-white' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  بث عام لجميع الأعضاء
                </button>
                <button
                  type="button"
                  onClick={() => setNotifTargetChoice('specific')}
                  className={`py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                    notifTargetChoice === 'specific' ? 'bg-[#FF1744] text-white' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  إرسال لعضو محدد
                </button>
              </div>

              {notifTargetChoice === 'specific' && (
                <div>
                  <label className="block text-[11px] text-zinc-400 font-bold mb-1">معرّف المستلم (@username أو UID)</label>
                  <input
                    type="text"
                    value={notifTargetUid}
                    onChange={e => setNotifTargetUid(e.target.value)}
                    placeholder="اكتب اسم المستخدم أو الـ UID..."
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                  />
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-zinc-400 font-bold mb-1">عنوان الإشعار</label>
                  <input
                    type="text"
                    value={notifTitle}
                    onChange={e => setNotifTitle(e.target.value)}
                    placeholder="مثال: حلقة جديدة متوفرة الآن"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-zinc-400 font-bold mb-1">تصنيف الإشعار</label>
                  <select
                    value={notifType}
                    onChange={e => setNotifType(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white font-bold focus:outline-none"
                  >
                    <option value="system">تنبيه نظام</option>
                    <option value="episode">حلقة جديدة</option>
                    <option value="anime">أنمي جديد</option>
                    <option value="tournament">بطولة وفعاليات</option>
                    <option value="reward">مكافآت وجوائز</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-zinc-400 font-bold mb-1">محتوى الإشعار</label>
                <textarea
                  rows={3}
                  value={notifBody}
                  onChange={e => setNotifBody(e.target.value)}
                  placeholder="اكتب نص الإشعار..."
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-xs text-white focus:outline-none resize-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-zinc-400 font-bold mb-1">وجهة الانتقال عند النقر</label>
                  <select
                    value={interactiveLinkChoice}
                    onChange={e => {
                      setInteractiveLinkChoice(e.target.value as any);
                      setSelectedNotifAnime(null);
                      setAnimeSearchQuery('');
                      setAnimeSuggestions([]);
                    }}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white font-bold focus:outline-none"
                  >
                    <option value="none">بدون انتقال</option>
                    <option value="anime">صفحة أنمي محدد</option>
                    <option value="rewards">صفحة الجوائز والمكافآت</option>
                    <option value="games">ساحة الألعاب</option>
                    <option value="leaderboard">قائمة المتصدرين</option>
                    <option value="community">منتدى المجتمع</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] text-zinc-400 font-bold mb-1">رابط صورة مرفقة (اختياري)</label>
                  <input
                    type="text"
                    value={notifImageUrl}
                    onChange={e => setNotifImageUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                  />
                </div>
              </div>

              {/* Working Anime Search Linker */}
              {interactiveLinkChoice === 'anime' && (
                <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3.5 space-y-2.5">
                  <label className="block text-[11px] text-zinc-300 font-bold">
                    ابحث عن الأنمي لربط الإشعار به (بالعربية أو الإنجليزية)
                  </label>
                  {!selectedNotifAnime ? (
                    <div className="space-y-2">
                      <div className="relative">
                        <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                        <input
                          type="text"
                          value={animeSearchQuery}
                          onChange={e => setAnimeSearchQuery(e.target.value)}
                          placeholder="اكتب اسم الأنمي..."
                          className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pr-9 pl-3 py-2 text-xs text-white focus:outline-none"
                        />
                      </div>

                      {animeSearchQuery.trim().length >= 2 && (
                        <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-h-48 overflow-y-auto divide-y divide-zinc-800/60">
                          {isSearchingAnime ? (
                            <div className="py-4 text-center text-xs text-zinc-400">جاري البحث...</div>
                          ) : animeSuggestions.length > 0 ? (
                            animeSuggestions.map((a, idx) => (
                              <button
                                type="button"
                                key={`${a._id || idx}`}
                                onClick={() => {
                                  setSelectedNotifAnime(a);
                                  setAnimeSearchQuery(a.title);
                                  setAnimeSuggestions([]);
                                }}
                                className="w-full p-2 hover:bg-zinc-800 flex items-center gap-2.5 text-right cursor-pointer transition"
                              >
                                <img
                                  src={a.posterUrl}
                                  alt=""
                                  referrerPolicy="no-referrer"
                                  className="w-8 h-11 rounded object-cover shrink-0 bg-zinc-950"
                                />
                                <span className="text-xs font-bold text-white truncate">{a.title}</span>
                              </button>
                            ))
                          ) : (
                            <div className="py-4 text-center text-xs text-zinc-500">لا توجد نتائج مطابقة</div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center justify-between bg-zinc-900 border border-emerald-500/30 p-2.5 rounded-xl">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <img
                          src={selectedNotifAnime.posterUrl}
                          alt=""
                          referrerPolicy="no-referrer"
                          className="w-9 h-12 rounded object-cover shrink-0"
                        />
                        <span className="text-xs font-bold text-emerald-400 truncate">{selectedNotifAnime.title}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedNotifAnime(null);
                          setAnimeSearchQuery('');
                        }}
                        className="text-xs text-rose-400 font-bold px-2 py-1 cursor-pointer"
                      >
                        تغيير
                      </button>
                    </div>
                  )}
                </div>
              )}

              <button
                onClick={handleSendNotification}
                disabled={
                  isSendingNotif ||
                  !notifTitle.trim() ||
                  !notifBody.trim() ||
                  (interactiveLinkChoice === 'anime' && !selectedNotifAnime)
                }
                className="w-full bg-[#FF1744] hover:bg-rose-600 disabled:opacity-40 text-white font-black py-3 rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-2"
              >
                <Send size={14} />
                <span>{isSendingNotif ? 'جاري الإرسال...' : 'إرسال الإشعار الآن'}</span>
              </button>
            </div>

            {/* Live Notification Card Preview */}
            <div className="bg-[#121215] border border-zinc-800/80 rounded-2xl p-5 space-y-4 h-fit">
              <div className="border-b border-zinc-800/80 pb-3">
                <h3 className="text-sm font-black text-white">معاينة حية للإشعار</h3>
                <p className="text-[11px] text-zinc-400 mt-0.5">كيف سيظهر الإشعار في صفحة إشعارات العضو</p>
              </div>

              <div className="bg-[#141414] border border-neutral-800 rounded-2xl p-3.5 flex items-start gap-3">
                {notifImageUrl || selectedNotifAnime?.posterUrl ? (
                  <img
                    src={notifImageUrl || selectedNotifAnime?.posterUrl}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="w-11 h-14 rounded-xl object-cover shrink-0 bg-neutral-900 border border-neutral-800"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-xl bg-[#FF1744]/10 border border-[#FF1744]/20 flex items-center justify-center text-[#FF1744] shrink-0">
                    <BellRing size={18} />
                  </div>
                )}
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-white truncate">
                      {notifTitle.trim() || 'عنوان الإشعار يظهر هنا'}
                    </span>
                    <span className="text-[10px] text-[#FF1744] font-bold shrink-0">جديد · الآن</span>
                  </div>
                  <p className="text-[11px] text-neutral-400 leading-relaxed line-clamp-3">
                    {notifBody.trim() || 'محتوى الرسالة التنبيهية سيظهر هنا بنفس تنسيق صفحة الإشعارات.'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* =========================================================
            WORKSPACE 5: PLATFORM SETTINGS (إعدادات المنصة)
           ========================================================= */}
        {workspace === 'platform' && canAccessPlatform && (
          <div className="space-y-5">
            {/* Sub-Tabs Selector */}
            <div className="flex flex-wrap items-center gap-2 bg-[#121215] border border-zinc-800/80 p-1.5 rounded-2xl w-fit">
              <button
                onClick={() => setPlatformSubTab('slider')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                  platformSubTab === 'slider' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Sliders size={14} className="text-[#FF1744]" />
                <span>السلايدر والشريط الإعلاني</span>
              </button>

              <button
                onClick={() => setPlatformSubTab('curation')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                  platformSubTab === 'curation' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Pin size={14} className="text-emerald-400" />
                <span>تثبيت وإخفاء الأنميات</span>
              </button>

              <button
                onClick={() => setPlatformSubTab('links_ads')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                  platformSubTab === 'links_ads' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Coins size={14} className="text-amber-400" />
                <span>روابط التواصل والإعلانات</span>
              </button>

              {(role === 'owner' || role === 'admin') && (
                <>
                  <button
                    onClick={() => setPlatformSubTab('queue')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                      platformSubTab === 'queue' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    <Server size={14} className="text-sky-400" />
                    <span>مهام السحب (Queue)</span>
                  </button>

                  <button
                    onClick={() => setPlatformSubTab('maintenance')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                      platformSubTab === 'maintenance' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    <Wrench size={14} className="text-rose-400" />
                    <span>صيانة قاعدة البيانات</span>
                  </button>
                </>
              )}
            </div>

            {/* SUB-TAB 5.1: SLIDER & ANNOUNCEMENT */}
            {platformSubTab === 'slider' && (
              <div className="bg-[#121215] border border-zinc-800/80 rounded-2xl p-5 space-y-5">
                <div className="border-b border-zinc-800/80 pb-3">
                  <h2 className="text-sm font-black text-white">إعدادات السلايدر العلوي والشريط الإعلاني</h2>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    تحديد نوع محتوى السلايدر، عدد الشرائح (3 إلى 10)، ورسالة الشريط العلوي
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                  <div>
                    <label className="block text-[11px] text-zinc-400 font-bold mb-1">محتوى السلايدر العلوي</label>
                    <select
                      value={sliderMode}
                      onChange={e => setSliderMode(e.target.value as any)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-xs text-white font-bold focus:outline-none"
                    >
                      <option value="best_season">الأفضل هذا الموسم</option>
                      <option value="trending_season">الرائج هذا الموسم</option>
                      <option value="all_time_best">الأفضل على الإطلاق</option>
                      <option value="classic_historical">الأنميات التاريخية</option>
                      <option value="custom">مخصص (اختيار يدوي)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] text-zinc-400 font-bold mb-1">عدد الشرائح (3 - 10)</label>
                    <select
                      value={sliderLimit}
                      onChange={e => setSliderLimit(Math.min(10, Math.max(3, Number(e.target.value))))}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-xs text-white font-bold focus:outline-none"
                    >
                      {[3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                        <option key={n} value={n}>
                          {n} أنميات
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] text-zinc-400 font-bold mb-1">فلتر قسم أنميات الموسم</label>
                    <select
                      value={sliderSeason}
                      onChange={e => setSliderSeason(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-xs text-white font-bold focus:outline-none"
                    >
                      <option value="auto">تلقائي (الموسم الحالي)</option>
                      <option value="winter">شتاء (Winter)</option>
                      <option value="spring">ربيع (Spring)</option>
                      <option value="summer">صيف (Summer)</option>
                      <option value="fall">خريف (Fall)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] text-zinc-400 font-bold mb-1">سرعة التبديل (ثواني)</label>
                    <input
                      type="number"
                      min={2}
                      max={15}
                      value={sliderSpeed}
                      onChange={e => setSliderSpeed(Number(e.target.value))}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-xs text-white font-bold focus:outline-none"
                    />
                  </div>
                </div>

                {/* Custom Slider Picker */}
                {sliderMode === 'custom' && (
                  <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 space-y-3.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white">
                        الأنميات المختارة للسلايدر ({customSliderAnime.length} / {sliderLimit})
                      </span>
                      {customSliderAnime.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setCustomSliderAnime([])}
                          className="text-[11px] text-rose-400 font-bold cursor-pointer"
                        >
                          مسح القائمة
                        </button>
                      )}
                    </div>

                    <div className="relative">
                      <Search size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                      <input
                        type="text"
                        value={sliderSearchQuery}
                        onChange={e => setSliderSearchQuery(e.target.value)}
                        placeholder="ابحث عن أنمي بالعربية أو الإنجليزية لإضافته للسلايدر..."
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pr-9 pl-3 py-2 text-xs text-white focus:outline-none"
                      />
                    </div>

                    {sliderSearchQuery.trim().length >= 2 && (
                      <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-h-52 overflow-y-auto divide-y divide-zinc-800/60">
                        {isSearchingSliderAnime ? (
                          <div className="py-4 text-center text-xs text-zinc-400">جاري البحث...</div>
                        ) : sliderSearchResults.length > 0 ? (
                          sliderSearchResults.map((animeItem: any) => {
                            const animeIdStr = String(animeItem._id || animeItem.mal_id || animeItem.id);
                            const alreadyAdded = customSliderAnime.some(a => String(a._id) === animeIdStr);
                            const poster =
                              animeItem.posterUrl ||
                              animeItem.images?.jpg?.large_image_url ||
                              animeItem.images?.jpg?.image_url ||
                              '';
                            const titleStr = animeItem.title || animeItem.title_english || 'Anime';
                            return (
                              <button
                                type="button"
                                key={animeIdStr}
                                onClick={() => {
                                  if (alreadyAdded) return;
                                  if (customSliderAnime.length >= 10) {
                                    notify('الحد الأقصى هو 10 أنميات', 'error');
                                    return;
                                  }
                                  setCustomSliderAnime(prev => [
                                    ...prev,
                                    {
                                      _id: animeIdStr,
                                      title: titleStr,
                                      posterUrl: poster,
                                      rating: animeItem.rating || animeItem.score || 8.5,
                                      genres: Array.isArray(animeItem.genres)
                                        ? animeItem.genres.map((g: any) => (typeof g === 'string' ? g : g.name)).filter(Boolean)
                                        : ['أنمي']
                                    }
                                  ]);
                                  setSliderSearchQuery('');
                                  setSliderSearchResults([]);
                                }}
                                className="w-full p-2.5 hover:bg-zinc-800 flex items-center justify-between gap-2 text-xs cursor-pointer transition text-right"
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <img
                                    src={poster}
                                    alt=""
                                    referrerPolicy="no-referrer"
                                    className="w-8 h-11 rounded object-cover shrink-0 bg-zinc-950"
                                  />
                                  <span className="font-bold text-white truncate">{titleStr}</span>
                                </div>
                                <span
                                  className={`text-[10px] px-2.5 py-1 rounded-lg font-bold shrink-0 ${
                                    alreadyAdded ? 'bg-zinc-800 text-zinc-500' : 'bg-[#FF1744] text-white'
                                  }`}
                                >
                                  {alreadyAdded ? 'مضاف' : '+ إضافة'}
                                </span>
                              </button>
                            );
                          })
                        ) : (
                          <div className="py-4 text-center text-xs text-zinc-500">لا توجد نتائج مطابقة</div>
                        )}
                      </div>
                    )}

                    {customSliderAnime.length > 0 && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5 pt-1">
                        {customSliderAnime.map((item, idx) => (
                          <div
                            key={`${item._id}-${idx}`}
                            className="relative rounded-xl overflow-hidden border border-zinc-800 bg-zinc-900 aspect-[3/4]"
                          >
                            <img
                              src={item.posterUrl}
                              alt={item.title}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent flex flex-col justify-end p-2">
                              <span className="absolute top-1.5 right-1.5 bg-yellow-500 text-black text-[9px] font-black px-1.5 py-0.5 rounded">
                                #{idx + 1}
                              </span>
                              <button
                                type="button"
                                onClick={() => setCustomSliderAnime(prev => prev.filter((_, i) => i !== idx))}
                                className="absolute top-1.5 left-1.5 w-5 h-5 rounded-full bg-rose-600 text-white flex items-center justify-center text-xs cursor-pointer"
                              >
                                ×
                              </button>
                              <span className="text-[10px] font-bold text-white truncate">{item.title}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <label className="block text-[11px] text-zinc-400 font-bold mb-1">
                    شريط الإعلان العلوي في الصفحة الرئيسية (اتركه فارغاً لإخفائه)
                  </label>
                  <textarea
                    rows={2}
                    value={globalAnnouncement}
                    onChange={e => setGlobalAnnouncement(e.target.value)}
                    placeholder="اكتب إعلاناً عاماً ليظهر أعلى الصفحة الرئيسية لجميع الزوار..."
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-xs text-white focus:outline-none resize-none"
                  />
                </div>

                <button
                  onClick={saveSliderSettings}
                  disabled={isSavingSettings}
                  className="w-full bg-[#FF1744] hover:bg-rose-600 text-white font-black py-3 rounded-xl text-xs transition cursor-pointer"
                >
                  {isSavingSettings ? 'جاري الحفظ...' : 'حفظ ونشر إعدادات السلايدر'}
                </button>
              </div>
            )}

            {/* SUB-TAB 5.1B: ANIME CURATION (تثبيت وإخفاء الأنميات) */}
            {platformSubTab === 'curation' && (
              <div className="bg-[#121215] border border-zinc-800/80 rounded-2xl p-5 space-y-5">
                <div className="border-b border-zinc-800/80 pb-3">
                  <h2 className="text-sm font-black text-white">تثبيت وإخفاء الأنميات في الموقع</h2>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    ابحث عن أي أنمي لتثبيته في مقدمة «أحدث الحلقات» أو إخفائه تماماً من قوائم العرض الرئيسية
                  </p>
                </div>

                {/* Search & Action Bar */}
                <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                    <div className="md:col-span-2 relative">
                      <Search size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                      <input
                        type="text"
                        value={curationSearchQuery}
                        onChange={e => setCurationSearchQuery(e.target.value)}
                        placeholder="ابحث عن الأنمي بالعربية أو الإنجليزية..."
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pr-9 pl-3 py-2 text-xs text-white focus:outline-none"
                      />
                    </div>
                    <div>
                      <input
                        type="text"
                        value={pinEpisodeInput}
                        onChange={e => setPinEpisodeInput(e.target.value)}
                        placeholder="وسم الحلقة عند التثبيت (مثال: 12 أو خاص)"
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                      />
                    </div>
                  </div>

                  {curationSearchQuery.trim().length >= 2 && (
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-h-56 overflow-y-auto divide-y divide-zinc-800/60">
                      {isSearchingCurationAnime ? (
                        <div className="py-4 text-center text-xs text-zinc-400">جاري البحث...</div>
                      ) : curationSearchResults.length > 0 ? (
                        curationSearchResults.map((animeItem: any) => {
                          const animeIdStr = String(animeItem._id || animeItem.mal_id || animeItem.id);
                          const poster =
                            animeItem.posterUrl ||
                            animeItem.images?.jpg?.large_image_url ||
                            animeItem.images?.jpg?.image_url ||
                            '';
                          const titleStr = animeItem.title || animeItem.title_english || 'Anime';
                          const isPinned = pinnedAnimeList.some(p => String(p._id) === animeIdStr);
                          const isHidden = hiddenAnimeList.some(h => String(h._id) === animeIdStr);

                          return (
                            <div
                              key={animeIdStr}
                              className="p-2.5 hover:bg-zinc-800/60 flex items-center justify-between gap-2 text-xs transition"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <img
                                  src={poster}
                                  alt=""
                                  referrerPolicy="no-referrer"
                                  className="w-8 h-11 rounded object-cover shrink-0 bg-zinc-950"
                                />
                                <span className="font-bold text-white truncate">{titleStr}</span>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  disabled={isPinned}
                                  onClick={() => {
                                    const nextPinned = [
                                      ...pinnedAnimeList,
                                      {
                                        _id: animeIdStr,
                                        title: titleStr,
                                        posterUrl: poster,
                                        pinnedEpisode: pinEpisodeInput.trim() || 'مُثبت'
                                      }
                                    ];
                                    setPinnedAnimeList(nextPinned);
                                    saveAnimeCuration(nextPinned, hiddenAnimeList);
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 disabled:opacity-40 text-emerald-400 border border-emerald-500/25 text-[11px] font-bold cursor-pointer flex items-center gap-1"
                                >
                                  <Pin size={12} />
                                  <span>{isPinned ? 'مثبت' : 'تثبيت بالأول'}</span>
                                </button>
                                <button
                                  type="button"
                                  disabled={isHidden}
                                  onClick={() => {
                                    const nextHidden = [
                                      ...hiddenAnimeList,
                                      {
                                        _id: animeIdStr,
                                        title: titleStr,
                                        posterUrl: poster
                                      }
                                    ];
                                    setHiddenAnimeList(nextHidden);
                                    saveAnimeCuration(pinnedAnimeList, nextHidden);
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 disabled:opacity-40 text-rose-400 border border-rose-500/25 text-[11px] font-bold cursor-pointer flex items-center gap-1"
                                >
                                  <EyeOff size={12} />
                                  <span>{isHidden ? 'مخفي' : 'إخفاء'}</span>
                                </button>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="py-4 text-center text-xs text-zinc-500">لا توجد نتائج مطابقة</div>
                      )}
                    </div>
                  )}
                </div>

                {/* Pinned & Hidden Lists */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Pinned List */}
                  <div className="bg-zinc-950/70 border border-zinc-800/80 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
                      <span className="text-xs font-black text-emerald-400 flex items-center gap-1.5">
                        <Pin size={14} />
                        <span>أنميات مثبتة في الصدارة ({pinnedAnimeList.length})</span>
                      </span>
                    </div>
                    {pinnedAnimeList.length === 0 ? (
                      <div className="py-8 text-center text-zinc-500 text-xs">لا توجد أنميات مثبتة حالياً</div>
                    ) : (
                      <div className="space-y-2">
                        {pinnedAnimeList.map((item, idx) => (
                          <div
                            key={`${item._id}-${idx}`}
                            className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-2.5 flex items-center justify-between gap-2"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <img
                                src={item.posterUrl}
                                alt=""
                                referrerPolicy="no-referrer"
                                className="w-8 h-11 rounded object-cover shrink-0 bg-zinc-950"
                              />
                              <div className="min-w-0">
                                <span className="text-xs font-bold text-white truncate block">{item.title}</span>
                                <span className="text-[10px] text-emerald-400 font-bold">
                                  حلقة: {item.pinnedEpisode || 'مُثبت'}
                                </span>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                const next = pinnedAnimeList.filter((_, i) => i !== idx);
                                setPinnedAnimeList(next);
                                saveAnimeCuration(next, hiddenAnimeList);
                              }}
                              className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-rose-500/20 text-zinc-300 hover:text-rose-400 text-[11px] font-bold cursor-pointer"
                            >
                              إلغاء التثبيت
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Hidden List */}
                  <div className="bg-zinc-950/70 border border-zinc-800/80 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
                      <span className="text-xs font-black text-rose-400 flex items-center gap-1.5">
                        <EyeOff size={14} />
                        <span>أنميات مخفية من العرض ({hiddenAnimeList.length})</span>
                      </span>
                    </div>
                    {hiddenAnimeList.length === 0 ? (
                      <div className="py-8 text-center text-zinc-500 text-xs">لا توجد أنميات مخفية حالياً</div>
                    ) : (
                      <div className="space-y-2">
                        {hiddenAnimeList.map((item, idx) => (
                          <div
                            key={`${item._id}-${idx}`}
                            className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-2.5 flex items-center justify-between gap-2"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <img
                                src={item.posterUrl}
                                alt=""
                                referrerPolicy="no-referrer"
                                className="w-8 h-11 rounded object-cover shrink-0 bg-zinc-950 opacity-60"
                              />
                              <span className="text-xs font-bold text-zinc-300 truncate">{item.title}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                const next = hiddenAnimeList.filter((_, i) => i !== idx);
                                setHiddenAnimeList(next);
                                saveAnimeCuration(pinnedAnimeList, next);
                              }}
                              className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-emerald-500/20 text-zinc-300 hover:text-emerald-400 text-[11px] font-bold cursor-pointer"
                            >
                              إظهار مجدداً
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* SUB-TAB 5.2: LINKS & MONETIZATION */}
            {platformSubTab === 'links_ads' && (
              <div className="space-y-5">
                {/* Live Ad Performance & Views Counter */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
                  <div className="bg-[#121215] border border-zinc-800/80 rounded-2xl p-4">
                    <span className="text-[11px] text-zinc-400 font-bold block">مشاهدات الإعلانات اليوم</span>
                    <span className="text-2xl font-black text-amber-400 mt-1 block font-mono">
                      {adStatsData.dailyViews?.[new Date().toISOString().split('T')[0]] || 0}
                    </span>
                    <span className="text-[10px] text-zinc-500 mt-0.5 block">مشاهدة مكتملة اليوم</span>
                  </div>
                  <div className="bg-[#121215] border border-zinc-800/80 rounded-2xl p-4">
                    <span className="text-[11px] text-zinc-400 font-bold block">إجمالي المشاهدات الكلي</span>
                    <span className="text-2xl font-black text-white mt-1 block font-mono">
                      {(adStatsData.totalViews || 0).toLocaleString()}
                    </span>
                    <span className="text-[10px] text-zinc-500 mt-0.5 block">منذ تفعيل العداد</span>
                  </div>
                  <div className="bg-[#121215] border border-zinc-800/80 rounded-2xl p-4">
                    <span className="text-[11px] text-zinc-400 font-bold block">كوينز موزعة من الإعلانات</span>
                    <span className="text-2xl font-black text-emerald-400 mt-1 block font-mono">
                      {(adStatsData.totalCoinsDistributed || 0).toLocaleString()}
                    </span>
                    <span className="text-[10px] text-zinc-500 mt-0.5 block">شاملة مكافآت السلسلة</span>
                  </div>
                  <div className="bg-[#121215] border border-zinc-800/80 rounded-2xl p-4">
                    <span className="text-[11px] text-zinc-400 font-bold block">خبرة (XP) موزعة</span>
                    <span className="text-2xl font-black text-sky-400 mt-1 block font-mono">
                      {(adStatsData.totalXpDistributed || 0).toLocaleString()}
                    </span>
                    <span className="text-[10px] text-zinc-500 mt-0.5 block">نقاط خبرة مكتسبة</span>
                  </div>
                </div>

                <div className="bg-[#121215] border border-zinc-800/80 rounded-2xl p-5 space-y-5">
                  <div className="border-b border-zinc-800/80 pb-3">
                    <h2 className="text-sm font-black text-white">روابط تليجرام وإعدادات الإعلانات والمكافآت</h2>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      تحكم كامل في روابط القنوات الرسمية، مكافآت الإعلانات (كوينز + XP)، الحد اليومي، والإعلانات المخصصة
                    </p>
                  </div>

                  {/* Telegram Links */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                    <div>
                      <label className="block text-[11px] text-zinc-400 font-bold mb-1">رابط المساعدة والشكاوى</label>
                      <input
                        type="text"
                        dir="ltr"
                        value={helpTelegramUrl}
                        onChange={e => setHelpTelegramUrl(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-zinc-400 font-bold mb-1">رابط مجموعة الدردشة</label>
                      <input
                        type="text"
                        dir="ltr"
                        value={groupTelegramUrl}
                        onChange={e => setGroupTelegramUrl(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-zinc-400 font-bold mb-1">رابط تواصل المالك / الدعم</label>
                      <input
                        type="text"
                        dir="ltr"
                        value={donateTelegramUrl}
                        onChange={e => setDonateTelegramUrl(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Ad Mode & Economy Controls */}
                  <div className="border-t border-zinc-800/80 pt-4 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
                      <div className="lg:col-span-2">
                        <label className="block text-[11px] text-zinc-400 font-bold mb-1">نمط الإعلانات والربح</label>
                        <select
                          value={monetizationMode}
                          onChange={e => setMonetizationMode(e.target.value as any)}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white font-bold focus:outline-none"
                        >
                          <option value="hybrid">🔥 مدمج بأعلى ربح (Smartlink + بانر مصغر)</option>
                          <option value="direct_link">رابط ربح مباشر (Direct Link / Smartlink)</option>
                          <option value="script">بانر إعلاني مصغر (Script 300x250 / 320x50)</option>
                          <option value="simulation">إعلانات الرعاة والمجتمع الداخلية</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] text-zinc-400 font-bold mb-1">مدة المشاهدة (ث)</label>
                        <input
                          type="number"
                          min={5}
                          max={60}
                          value={stayTime}
                          onChange={e => setStayTime(Number(e.target.value))}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white font-bold text-center focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] text-amber-400 font-bold mb-1">مكافأة الكوينز</label>
                        <input
                          type="number"
                          min={5}
                          max={500}
                          value={adRewardCoins}
                          onChange={e => setAdRewardCoins(Number(e.target.value))}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-amber-400 font-bold text-center focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] text-sky-400 font-bold mb-1">مكافأة XP</label>
                        <input
                          type="number"
                          min={10}
                          max={1000}
                          value={adRewardXp}
                          onChange={e => setAdRewardXp(Number(e.target.value))}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-sky-400 font-bold text-center focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] text-emerald-400 font-bold mb-1">الحد اليومي</label>
                        <input
                          type="number"
                          min={1}
                          max={100}
                          value={adDailyLimit}
                          onChange={e => setAdDailyLimit(Number(e.target.value))}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-emerald-400 font-bold text-center focus:outline-none"
                        />
                      </div>
                    </div>

                    {/* Policy & Anti-Fraud Protection Controls */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-zinc-950/80 border border-zinc-800/80 rounded-xl p-3.5">
                      <label className="flex items-center justify-between gap-3 cursor-pointer">
                        <div>
                          <span className="text-xs font-black text-white block">
                            التحقق من فتح رابط الراعي قبل منح المكافأة
                          </span>
                          <span className="text-[10px] text-zinc-400 block mt-0.5">
                            يضمن أن العضو فتح صفحة الـ Smartlink فعلياً للحصول على أعلى عائد (CPM)
                          </span>
                        </div>
                        <input
                          type="checkbox"
                          checked={requireClickVerification}
                          onChange={e => setRequireClickVerification(e.target.checked)}
                          className="w-4 h-4 accent-[#FF1744] rounded cursor-pointer"
                        />
                      </label>

                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <span className="text-xs font-black text-white block">
                            فاصل الأمان بين كل إعلانين (بالثواني)
                          </span>
                          <span className="text-[10px] text-zinc-400 block mt-0.5">
                            يحمي حسابك في شركات الإعلانات من حظر النقرات المتتالية السريعة (Anti-Bot)
                          </span>
                        </div>
                        <input
                          type="number"
                          min={5}
                          max={120}
                          value={adCooldownSeconds}
                          onChange={e => setAdCooldownSeconds(Number(e.target.value))}
                          className="w-20 bg-zinc-900 border border-zinc-800 rounded-xl px-2.5 py-1.5 text-xs text-amber-400 font-bold text-center focus:outline-none"
                        />
                      </div>
                    </div>

                    {(monetizationMode === 'direct_link' || monetizationMode === 'hybrid') && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] text-amber-400 font-bold mb-1">
                            رابط الربح المباشر الأساسي (Primary Smartlink - مثل Adsterra أو Monetag)
                          </label>
                          <input
                            type="text"
                            dir="ltr"
                            value={directLinkUrl}
                            onChange={e => setDirectLinkUrl(e.target.value)}
                            placeholder="https://www.effectivecpmnetwork.com/..."
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-sky-400 font-bold mb-1">
                            رابط ربح احتياطي للتناوب (Secondary Smartlink - اختياري لمضاعفة الـ eCPM)
                          </label>
                          <input
                            type="text"
                            dir="ltr"
                            value={backupDirectLinkUrl}
                            onChange={e => setBackupDirectLinkUrl(e.target.value)}
                            placeholder="https://otieu.com/... (يتناوب تلقائياً مع الرابط الأساسي)"
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none"
                          />
                        </div>
                      </div>
                    )}

                    {(monetizationMode === 'script' || monetizationMode === 'hybrid') && (
                      <div>
                        <label className="block text-[11px] text-amber-400 font-bold mb-1">
                          كود البانر المصغر (HTML / Script — مقاس 300x250 أو 320x50)
                        </label>
                        <textarea
                          rows={4}
                          dir="ltr"
                          value={scriptCode}
                          onChange={e => setScriptCode(e.target.value)}
                          placeholder="<script type='text/javascript'>atOptions = { 'key' : '...', 'format' : 'iframe', 'height' : 250, 'width' : 300, 'params' : {} };</script><script type='text/javascript' src='...'></script>"
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-xs text-white font-mono focus:outline-none resize-none"
                        />
                      </div>
                    )}

                    {/* High-Yield Ad Networks & Policy Compliance Guide */}
                    <div className="bg-gradient-to-l from-amber-500/10 via-zinc-950 to-zinc-950 border border-amber-500/25 rounded-2xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-black text-amber-400 flex items-center gap-1.5">
                          <Sparkles size={14} />
                          <span>دليل تحقيق أعلى ربح من أصغر إعلان (متوافق 100% مع شروط الشبكات)</span>
                        </h3>
                        <span className="text-[10px] bg-amber-500/15 text-amber-300 px-2.5 py-0.5 rounded-full font-bold">
                          أفضل استراتيجية
                        </span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px] text-zinc-300 leading-relaxed">
                        <div className="bg-zinc-900/70 border border-zinc-800/80 rounded-xl p-3 space-y-1">
                          <strong className="text-white block">1. لماذا نمط (Hybrid) هو الأعلى ربحاً؟</strong>
                          <p className="text-zinc-400">
                            يدمج بين <strong>Smartlink</strong> (أعلى عائد لكل نقرة وظهور يصل إلى $3-$12 لكل 1000 زيارة) وبين <strong>بانر صغير 300x250</strong> يظهر داخل نفس البطاقة أثناء العد التنازلي، فتحصل على ربح مزدوج من حركة واحدة.
                          </p>
                        </div>
                        <div className="bg-zinc-900/70 border border-zinc-800/80 rounded-xl p-3 space-y-1">
                          <strong className="text-white block">2. أفضل الشبكات لمواقع الأنمي:</strong>
                          <p className="text-zinc-400">
                            • <strong>Adsterra</strong>: اطلب (Direct Link) + بانر (300x250). قبول فوري ودفعات من $5.<br />
                            • <strong>Monetag</strong>: اطلب (Direct Link / Smartlink) وضع رابطه في خانة الرابط الاحتياطي للتناوب.<br />
                            • <strong>A-Ads</strong>: بانر صغير بدون كوكيز يدفع بالعملات الرقمية فوراً.
                          </p>
                        </div>
                        <div className="bg-zinc-900/70 border border-zinc-800/80 rounded-xl p-3 space-y-1">
                          <strong className="text-white block">3. الحماية من إغلاق الحساب:</strong>
                          <p className="text-zinc-400">
                            يمنع جوجل AdSense إعلانات المكافآت (Incentivized Traffic) ومحتوى الأنمي، بينما <strong>تسمح بها Adsterra و Monetag رسمياً في روابط الـ Direct Link</strong> بشرط عدم فتح نوافذ إجبارية مخفية، وهو ما يطبقه هذا النظام تلقائياً.
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Custom Sponsor & Community Ads Builder */}
                    {monetizationMode === 'simulation' && (
                      <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800 pb-3">
                          <div>
                            <h3 className="text-xs font-black text-white flex items-center gap-1.5">
                              <Sparkles size={14} className="text-amber-400" />
                              <span>إعلانات الرعاة والمجتمع المخصصة ({customAdsList.length})</span>
                            </h3>
                            <p className="text-[10px] text-zinc-400 mt-0.5">
                              أضف بطاقات إعلانية لقناتك على تليجرام، سيرفر ديسكورد، بطولة جديدة، أو أي راعٍ خارجي مع صورة وزر انتقال مباشر
                            </p>
                          </div>
                        </div>

                        {/* Add Custom Ad Form */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
                          <input
                            type="text"
                            value={newAdSponsor}
                            onChange={e => setNewAdSponsor(e.target.value)}
                            placeholder="اسم الراعي أو القسم (مثال: قناة تليجرام)"
                            className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                          />
                          <input
                            type="text"
                            value={newAdTitle}
                            onChange={e => setNewAdTitle(e.target.value)}
                            placeholder="نص الإعلان الجذاب..."
                            className="lg:col-span-2 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                          />
                          <input
                            type="text"
                            dir="ltr"
                            value={newAdBannerUrl}
                            onChange={e => setNewAdBannerUrl(e.target.value)}
                            placeholder="رابط صورة البانر (اختياري)"
                            className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                          />
                          <input
                            type="text"
                            dir="ltr"
                            value={newAdTargetUrl}
                            onChange={e => setNewAdTargetUrl(e.target.value)}
                            placeholder="رابط الوجهة عند النقر (https://...)"
                            className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                          />
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-zinc-400 font-bold">نص الزر:</span>
                            <input
                              type="text"
                              value={newAdButtonText}
                              onChange={e => setNewAdButtonText(e.target.value)}
                              placeholder="زيارة الرابط الآن"
                              className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1 text-xs text-white w-36 focus:outline-none"
                            />
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              if (!newAdSponsor.trim() || !newAdTitle.trim()) {
                                notify('يرجى كتابة اسم الراعي ونص الإعلان', 'error');
                                return;
                              }
                              const nextAds = [
                                ...customAdsList,
                                {
                                  id: `ad_${Date.now()}`,
                                  sponsor: newAdSponsor.trim(),
                                  title: newAdTitle.trim(),
                                  bannerUrl: newAdBannerUrl.trim(),
                                  targetUrl: newAdTargetUrl.trim(),
                                  buttonText: newAdButtonText.trim() || 'زيارة الرابط الآن'
                                }
                              ];
                              setCustomAdsList(nextAds);
                              setNewAdSponsor('');
                              setNewAdTitle('');
                              setNewAdBannerUrl('');
                              setNewAdTargetUrl('');
                              notify('تمت إضافة الإعلان للقائمة — اضغط حفظ بالأسفل لاعتماده');
                            }}
                            className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs cursor-pointer transition"
                          >
                            + إضافة بطاقة إعلانية
                          </button>
                        </div>

                        {/* Custom Ads List */}
                        {customAdsList.length === 0 ? (
                          <div className="text-center py-4 text-[11px] text-zinc-500">
                            لا توجد إعلانات مخصصة مضافة حالياً (يتم عرض الإعلانات الافتراضية تلقائياً إلى حين إضافة إعلاناتك الخاصة)
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-1">
                            {customAdsList.map((ad, idx) => (
                              <div
                                key={ad.id || idx}
                                className="bg-zinc-900/90 border border-zinc-800 rounded-xl p-3 flex items-center justify-between gap-3"
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  {ad.bannerUrl && (
                                    <img
                                      src={ad.bannerUrl}
                                      alt=""
                                      referrerPolicy="no-referrer"
                                      className="w-12 h-12 rounded-lg object-cover shrink-0 bg-zinc-950"
                                    />
                                  )}
                                  <div className="min-w-0">
                                    <span className="text-[10px] font-bold text-amber-400 block truncate">
                                      {ad.sponsor}
                                    </span>
                                    <p className="text-xs font-bold text-white truncate">{ad.title}</p>
                                    {ad.targetUrl && (
                                      <span className="text-[10px] text-zinc-500 font-mono truncate block" dir="ltr">
                                        {ad.targetUrl}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setCustomAdsList(prev => prev.filter((_, i) => i !== idx))}
                                  className="p-1.5 rounded-lg bg-zinc-950 hover:bg-rose-500/20 text-zinc-400 hover:text-rose-400 border border-zinc-800 cursor-pointer shrink-0"
                                  title="حذف الإعلان"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <button
                    onClick={saveSliderSettings}
                    disabled={isSavingSettings}
                    className="w-full bg-[#FF1744] hover:bg-rose-600 text-white font-black py-3 rounded-xl text-xs transition cursor-pointer"
                  >
                    {isSavingSettings ? 'جاري الحفظ...' : 'حفظ الروابط وإعدادات الإعلانات'}
                  </button>
                </div>
              </div>
            )}

            {/* SUB-TAB 5.3: SCRAPER QUEUE */}
            {platformSubTab === 'queue' && (
              <div className="bg-[#121215] border border-zinc-800/80 rounded-2xl p-5 space-y-5">
                <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
                  <div>
                    <h2 className="text-sm font-black text-white">محرك مهام السحب والـ Caching</h2>
                    <p className="text-[11px] text-zinc-400 mt-0.5">جدولة وتحديث بيانات الأنمي والحلقات في الخلفية</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handlePurgeAllSystemCaches}
                      disabled={isPurgingAllCaches}
                      className="px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-xs font-bold cursor-pointer transition"
                    >
                      {isPurgingAllCaches ? 'جاري التفريغ...' : 'تفريغ الكاش القديم بالكامل'}
                    </button>
                    <button
                      onClick={handleClearQueueLogs}
                      className="px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs font-bold cursor-pointer transition"
                    >
                      مسح السجل
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-zinc-950 border border-zinc-800/80 rounded-xl p-3 text-center">
                    <span className="text-[10px] text-zinc-500 font-bold block">بالانتظار</span>
                    <span className="text-lg font-black text-zinc-300">{queueStatus?.stats?.pending || 0}</span>
                  </div>
                  <div className="bg-zinc-950 border border-zinc-800/80 rounded-xl p-3 text-center">
                    <span className="text-[10px] text-amber-400 font-bold block">قيد التنفيذ</span>
                    <span className="text-lg font-black text-amber-400">{queueStatus?.stats?.active || 0}</span>
                  </div>
                  <div className="bg-zinc-950 border border-zinc-800/80 rounded-xl p-3 text-center">
                    <span className="text-[10px] text-emerald-400 font-bold block">مكتملة</span>
                    <span className="text-lg font-black text-emerald-400">{queueStatus?.stats?.completed || 0}</span>
                  </div>
                  <div className="bg-zinc-950 border border-zinc-800/80 rounded-xl p-3 text-center">
                    <span className="text-[10px] text-rose-400 font-bold block">فاشلة</span>
                    <span className="text-lg font-black text-rose-400">{queueStatus?.stats?.failed || 0}</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-zinc-950 p-3.5 rounded-xl border border-zinc-800">
                  <select
                    value={queueTaskName}
                    onChange={e => setQueueTaskName(e.target.value)}
                    className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white font-bold focus:outline-none"
                  >
                    <option value="preWarmDashboard">تحديث الصفحة الرئيسية (preWarmDashboard)</option>
                    <option value="fetchAnimeDetails">سحب تفاصيل أنمي (fetchAnimeDetails)</option>
                    <option value="fetchEpisodeServers">سحب سيرفرات حلقة (fetchEpisodeServers)</option>
                  </select>
                  <input
                    type="text"
                    disabled={queueTaskName === 'preWarmDashboard'}
                    value={queueTaskData}
                    onChange={e => setQueueTaskData(e.target.value)}
                    placeholder={
                      queueTaskName === 'preWarmDashboard' ? 'لا يتطلب مدخلات' : 'أدخل معرّف الأنمي أو الحلقة...'
                    }
                    className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none disabled:opacity-40"
                  />
                  <button
                    onClick={handleAddQueueJob}
                    disabled={isSubmittingQueueTask || (queueTaskName !== 'preWarmDashboard' && !queueTaskData.trim())}
                    className="bg-[#FF1744] hover:bg-rose-600 disabled:opacity-40 text-white font-bold py-2 px-4 rounded-xl text-xs cursor-pointer transition"
                  >
                    {isSubmittingQueueTask ? 'جاري الإرسال...' : 'تشغيل المهمة'}
                  </button>
                </div>

                {queueStatus?.jobs?.length > 0 && (
                  <div className="space-y-2 max-h-72 overflow-y-auto">
                    {queueStatus.jobs.map((job: any) => (
                      <div key={job.id} className="bg-zinc-950 border border-zinc-800/80 rounded-xl p-3 text-xs space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-white">
                            {job.name} <span className="text-zinc-500 font-mono">({job.id})</span>
                          </span>
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                job.status === 'completed'
                                  ? 'bg-emerald-500/15 text-emerald-400'
                                  : job.status === 'failed'
                                    ? 'bg-rose-500/15 text-rose-400'
                                    : 'bg-amber-500/15 text-amber-400'
                              }`}
                            >
                              {job.status} ({job.progress}%)
                            </span>
                            <button
                              onClick={() => setExpandedJobId(expandedJobId === job.id ? null : job.id)}
                              className="text-[10px] text-zinc-400 hover:text-white cursor-pointer"
                            >
                              {expandedJobId === job.id ? 'إخفاء السجل' : 'عرض السجل'}
                            </button>
                          </div>
                        </div>
                        {expandedJobId === job.id && (
                          <pre className="bg-zinc-900 p-2.5 rounded-lg text-[10px] text-zinc-300 font-mono overflow-x-auto text-left">
                            {(job.logs || []).join('\n') || 'لا توجد سجلات'}
                          </pre>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* SUB-TAB 5.4: DATABASE MAINTENANCE */}
            {platformSubTab === 'maintenance' && (
              <div className="space-y-4">
                {/* 1. Reset Season XP & Coins */}
                <div className="bg-[#121215] border border-amber-500/30 rounded-2xl p-5 space-y-4">
                  <div>
                    <h2 className="text-sm font-black text-amber-400 flex items-center gap-2">
                      <RefreshCw size={16} />
                      <span>تصفير نقاط الخبرة والكوينز لموسم جديد</span>
                    </h2>
                    <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                      يقوم هذا الإجراء بإعادة تعيين نقاط الخبرة (XP) والمستويات والكوينز وقوائم الأنمي لجميع الحسابات إلى الصفر مع الإبقاء على الحسابات المسجلة.
                    </p>
                  </div>

                  {!confirmResetModal ? (
                    <button
                      onClick={() => setConfirmResetModal(true)}
                      className="px-5 py-2.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/35 text-amber-300 text-xs font-bold cursor-pointer transition"
                    >
                      بدء إجراء تصفير إحصائيات الموسم...
                    </button>
                  ) : (
                    <div className="bg-zinc-950 border border-amber-500/40 rounded-xl p-4 space-y-3">
                      <p className="text-xs font-bold text-amber-300">
                        هل أنت متأكد؟ سيتم تصفير الكوينز والمستويات لجميع الأعضاء الحاليين.
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setConfirmResetModal(false)}
                          className="px-4 py-2 rounded-xl bg-zinc-800 text-zinc-300 text-xs font-bold cursor-pointer"
                        >
                          إلغاء
                        </button>
                        <button
                          onClick={handleResetAllAccounts}
                          disabled={isResettingAll}
                          className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-black cursor-pointer"
                        >
                          {isResettingAll ? 'جاري التصفير...' : 'نعم، تأكيد تصفير الإحصائيات'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. Full Factory Wipe for Official Launch / Post-Beta */}
                <div className="bg-[#121215] border border-rose-500/40 rounded-2xl p-5 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-sm font-black text-rose-400 flex items-center gap-2">
                        <AlertTriangle size={16} />
                        <span>التنظيف الشامل للإطلاق الرسمي (حذف جميع الحسابات والبيانات والكاشات)</span>
                      </h2>
                      <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">
                        يقوم هذا الإجراء بتنظيف المنصة بالكامل كأنها تثبيت جديد تماماً (Clean Slate) من أجل الإطلاق الرسمي أو بعد انتهاء المرحلة التجريبية، ويشمل:
                      </p>
                      <ul className="text-[11px] text-zinc-300 mt-2.5 space-y-1 list-disc list-inside">
                        <li>حذف جميع حسابات الأعضاء وملفاتهم وقوائمهم وأسمائهم المحجوزة وإشعاراتهم من التخزين السحابي.</li>
                        <li>حذف جميع التعليقات، التوصيات، التقييمات، البلاغات، التذاكر، الأكواد، وغرف ومنشورات الحلبة.</li>
                        <li>مسح جميع ملفات النسخ الاحتياطي والكاش على الخادم (`.cache` + `node-cache` + `Redis` + `server_cache`).</li>
                        <li>تفريغ التخزين المؤقت في المتصفح (`localStorage` + `sessionStorage` + `CacheStorage`).</li>
                      </ul>
                    </div>
                  </div>

                  {!confirmFactoryWipeModal ? (
                    <button
                      onClick={() => setConfirmFactoryWipeModal(true)}
                      className="px-5 py-2.5 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/50 text-rose-300 text-xs font-black cursor-pointer transition flex items-center gap-2"
                    >
                      <Trash2 size={14} />
                      <span>تنظيف شامل للمنصة والخوادم (تهيئة الإطلاق الرسمي)...</span>
                    </button>
                  ) : (
                    <div className="bg-zinc-950 border border-rose-500/50 rounded-xl p-4 space-y-3">
                      <p className="text-xs font-black text-rose-400">
                        تحذير نهائي: سيتم حذف كافة الحسابات، المنشورات، التعليقات، النسخ الاحتياطية، والتخزين السحابي والمؤقت بشكل كامل ولا يمكن التراجع عن ذلك!
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => setConfirmFactoryWipeModal(false)}
                          disabled={isFactoryWiping}
                          className="px-4 py-2 rounded-xl bg-zinc-800 text-zinc-300 text-xs font-bold cursor-pointer"
                        >
                          إلغاء العملية
                        </button>
                        <button
                          onClick={handleFactoryWipeForLaunch}
                          disabled={isFactoryWiping}
                          className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-black cursor-pointer flex items-center gap-1.5"
                        >
                          <Trash2 size={14} />
                          <span>
                            {isFactoryWiping
                              ? 'جاري تنظيف الخوادم وحذف الحسابات والكاشات...'
                              : 'نعم، احذف كل شيء وابدأ صفحة بيضاء للإطلاق'}
                          </span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
