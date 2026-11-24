import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Settings, ChevronLeft, ChevronRight, Lock, ChevronDown,
  ListVideo, Flame, Trophy, PlayCircle, BarChart3,
  Shield, User, ThumbsUp, ThumbsDown, MessageSquare, CheckSquare, Paintbrush,
  AlertCircle, UserPlus, LogIn, Swords, Cloud, HardDrive, CheckCircle2, Loader2, Award, BookOpen
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { listService, AnimeEntry, computeLibraryStats } from '../services/listService';
import { mangaListService, MangaEntry, computeMangaStats } from '../services/mangaListService';
import { STORE_ITEMS_SORTED, getAvatarShapeClass } from '../data/storeItems';
import { isStaffEmail } from '../services/moderationService';
import { doc, getDoc, getDocFromServer } from 'firebase/firestore';
import { db } from '../firebase';
import { DYNAMIC_ACHIEVEMENTS, CATEGORY_LABELS } from '../data/dynamicAchievements';
import PullToRefresh from '../components/PullToRefresh';
import { useDeviceDisplay } from '../hooks/useDeviceDisplay';
import ImageLightboxModal from '../components/ImageLightboxModal';

interface ProfileViewProps {
  onAdminClick?: () => void;
  onRewardsClick?: () => void;
  onLevelPerksClick?: () => void;
  onOpenAccountSettings?: () => void;
  onOpenAppearance?: () => void;
  onChallengeUser?: (targetUser: { id: string; displayName?: string; username?: string }) => void;
  userId?: string;
  onBack?: () => void;
  openSettingsInitially?: boolean;
}

type ProfileSectionTab = 'overview' | 'stats' | 'achievements';

export default function ProfileView({
  onAdminClick,
  onRewardsClick,
  onLevelPerksClick,
  onOpenAccountSettings,
  onOpenAppearance,
  onChallengeUser,
  userId,
  onBack,
  openSettingsInitially = false
}: ProfileViewProps) {
  const {
    user,
    signIn,
    signInWithGoogleAdaptive,
    userData: currentUserData,
    userRole,
  } = useAuth();
  const display = useDeviceDisplay();

  const [entries, setEntries] = useState<AnimeEntry[]>([]);
  const [mangaEntries, setMangaEntries] = useState<MangaEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshingProfile, setRefreshingProfile] = useState(false);
  const [profileError, setProfileError] = useState(false);
  const [targetUserData, setTargetUserData] = useState<any>(null);

  const targetId = userId || user?.id;
  const isCurrentUser = !userId || userId === user?.id;
  const isCloudAccount = Boolean(
    user && !user.id.startsWith('otaku_guest_') && user.providerIds?.[0] !== 'custom'
  );
  const isStaff = isCurrentUser && (isStaffEmail(user?.email) || userRole === 'owner' || userRole === 'admin' || userRole === 'moderator');
  const userData = isCurrentUser ? currentUserData : targetUserData;

  const [activeTab, setActiveTab] = useState<ProfileSectionTab>('overview');
  const [activeAchievementTab, setActiveAchievementTab] = useState<'all' | 'completed' | 'locked'>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [achievementsLimit, setAchievementsLimit] = useState<number>(30);
  const [lightboxImage, setLightboxImage] = useState<{ src: string; caption?: string } | null>(null);

  useEffect(() => {
    if (openSettingsInitially && isCurrentUser && onOpenAccountSettings) {
      onOpenAccountSettings();
    }
  }, [openSettingsInitially, isCurrentUser, onOpenAccountSettings]);

  const fetchProfile = useCallback(async (forceBypass = false) => {
    if (!targetId) return;
    setProfileError(false);
    if (forceBypass) setRefreshingProfile(true);
    else setLoading(true);
    try {
      if (forceBypass) {
        listService.invalidateUserCache(targetId);
      }
      if (!isCurrentUser) {
        const userRef = doc(db, 'users', targetId);
        const userDoc = forceBypass
          ? await getDocFromServer(userRef).catch(() => getDoc(userRef))
          : await getDoc(userRef);
        if (userDoc.exists()) {
          setTargetUserData(userDoc.data());
        }
      } else if (forceBypass && isCloudAccount && user) {
        await listService.forceCloudSync(user.id).catch(() => {});
      }

      const [uEntries, mEntries] = await Promise.all([
        listService.getAnimeEntries(targetId),
        mangaListService.getMangaEntries(targetId, forceBypass).catch(() => []),
      ]);
      setEntries(uEntries);
      setMangaEntries(mEntries);
      if (isCurrentUser && user) {
        void listService.reconcileUserStats(user.id, uEntries, currentUserData);
      }
    } catch (err) {
      console.error('Failed to load profile logs:', err);
      setProfileError(true);
    } finally {
      setLoading(false);
      setRefreshingProfile(false);
    }
  }, [targetId, isCurrentUser, isCloudAccount, user, currentUserData]);

  useEffect(() => {
    fetchProfile(false);
  }, [fetchProfile]);

  useEffect(() => {
    if (!targetId) return;
    const handleLibraryUpdated = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      if (!detail?.userId || detail.userId === targetId) {
        listService.getAnimeEntries(targetId).then(setEntries).catch(() => {});
      }
    };
    const handleMangaLibraryUpdated = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      if (!detail?.userId || detail.userId === targetId) {
        mangaListService.getMangaEntries(targetId).then(setMangaEntries).catch(() => {});
      }
    };
    window.addEventListener('otaku:library-updated', handleLibraryUpdated);
    window.addEventListener('manga-library-updated', handleMangaLibraryUpdated);
    return () => {
      window.removeEventListener('otaku:library-updated', handleLibraryUpdated);
      window.removeEventListener('manga-library-updated', handleMangaLibraryUpdated);
    };
  }, [targetId]);

  const stats = useMemo(() => {
    return computeLibraryStats(entries, userData);
  }, [entries, userData]);

  const mangaStats = useMemo(() => {
    return computeMangaStats(mangaEntries, userData);
  }, [mangaEntries, userData]);

  const currentLevel = userData?.level || 1;
  const nextLevel = currentLevel + 1;
  const xpNeededForNext = Math.floor(Math.pow(currentLevel, 1.5) * 500) + 500;
  const levelProgress = useMemo(() => {
    return Math.min(100, Math.max(0, ((userData?.xp || 0) / xpNeededForNext) * 100));
  }, [userData?.xp, xpNeededForNext]);

  const showStats = isCurrentUser || userData?.privacySettings?.showStats !== false;
  const showHistory = isCurrentUser || userData?.privacySettings?.showHistory !== false;
  const showStore = isCurrentUser || userData?.privacySettings?.showStore !== false;

  const equipped = useMemo(() => {
    const bannerId = showStore ? userData?.equippedBanner : null;
    const avatarId = showStore ? userData?.equippedAvatar : null;
    const frameId = showStore ? userData?.equippedFrame : null;
    const auraId = showStore ? userData?.equippedAura : null;
    const commentCardId = showStore ? userData?.equippedCommentCard : null;
    const titleId = showStore ? userData?.equippedTitle : null;
    const badgeId = showStore ? userData?.equippedBadge : null;

    return {
      banner: STORE_ITEMS_SORTED.find(i => i.id === bannerId),
      avatar: STORE_ITEMS_SORTED.find(i => i.id === avatarId),
      frame: STORE_ITEMS_SORTED.find(i => i.id === frameId),
      aura: STORE_ITEMS_SORTED.find(i => i.id === auraId),
      commentCard: STORE_ITEMS_SORTED.find(i => i.id === commentCardId),
      title: STORE_ITEMS_SORTED.find(i => i.id === titleId),
      badge: STORE_ITEMS_SORTED.find(i => i.id === badgeId),
    };
  }, [userData, showStore]);

  const bannerImg = equipped.banner?.img || '';
  const avatarImg = equipped.avatar?.img || (isCurrentUser ? user?.photoURL : userData?.photoURL) || "https://api.dicebear.com/7.x/avataaars/svg?seed=Felix";

  const userAchievements = useMemo(() => {
    const mapped = DYNAMIC_ACHIEVEMENTS.map((ach) => {
      const unlocked = ach.condition(userData, stats);
      const rawProg = typeof ach.progress === 'function' ? Number(ach.progress(userData, stats)) : 0;
      const clampedProg = Math.min(ach.max, Math.max(0, rawProg));
      const ratio = clampedProg / Math.max(1, ach.max);
      const remaining = Math.max(0, ach.max - clampedProg);
      return { ach, unlocked, clampedProg, ratio, remaining };
    });

    const completed = mapped
      .filter((x) => x.unlocked)
      .sort((a, b) => b.ach.max - a.ach.max);

    const locked = mapped
      .filter((x) => !x.unlocked)
      .sort((a, b) => {
        if (Math.abs(b.ratio - a.ratio) > 0.0001) return b.ratio - a.ratio;
        if (a.remaining !== b.remaining) return a.remaining - b.remaining;
        return a.ach.max - b.ach.max;
      });

    return { completed, locked, all: [...completed, ...locked] };
  }, [userData, stats]);

  const latestThreeAchievements = useMemo(() => {
    const result = [...userAchievements.completed.slice(0, 2)];
    if (userAchievements.locked.length > 0) {
      result.push(...userAchievements.locked.slice(0, Math.max(1, 3 - result.length)));
    }
    return result.slice(0, 3);
  }, [userAchievements]);

  const filteredAchievements = useMemo(() => {
    const list =
      activeAchievementTab === 'completed'
        ? userAchievements.completed
        : activeAchievementTab === 'locked'
        ? userAchievements.locked
        : userAchievements.all;
    if (selectedCategory === 'all') return list;
    return list.filter((item) => item.ach.category === selectedCategory);
  }, [activeAchievementTab, selectedCategory, userAchievements]);

  const avatarAlignment = userData?.avatarAlignment || 'right';
  const avatarShape = equipped.frame?.avatarShape || 'circle';
  const bannerSize = userData?.bannerSize || 'normal';

  const isCentered = avatarAlignment === 'center';
  const isLeft = avatarAlignment === 'left';

  const bannerHeightClass = bannerSize === 'compact' ? 'h-36' : bannerSize === 'cinematic' ? 'h-60' : 'h-44';
  const avatarShapeClass = getAvatarShapeClass(avatarShape);

  if (isCurrentUser && !user) {
    return (
      <div className="bg-[#000000] min-h-screen text-xs font-sans text-right select-none max-w-2xl mx-auto border-x border-[#1a1a1a] relative pb-12 pt-16 px-5 flex flex-col items-center justify-center gap-5" dir="rtl">
        {onBack && (
          <div className="theme-keep-dark absolute top-4 right-4 z-40">
            <button
              type="button"
              onClick={onBack}
              aria-label="رجوع"
              className="w-10 h-10 bg-[#0a0a0c]/85 backdrop-blur-md rounded-xl hover:bg-[#141418] border border-white/10 active:scale-95 transition text-white flex items-center justify-center cursor-pointer"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        )}
        <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-[#FF1744]/20 to-purple-600/20 border border-[#FF1744]/30 flex items-center justify-center text-[#FF1744] shadow-xl">
          <User size={36} />
        </div>
        <div className="text-center space-y-2 max-w-sm">
          <h1 className="text-lg font-black text-white">تسجيل الدخول وإدارة الحساب</h1>
          <p className="text-xs text-neutral-400 leading-relaxed">
            سجل دخولك لحفظ مكتبتك سحابياً، مزامنة تقدمك بين الأجهزة، وتخصيص ملفك الشخصي.
          </p>
        </div>
        <div className="w-full max-w-xs space-y-2.5">
          <button
            onClick={signInWithGoogleAdaptive}
            className="w-full min-h-[46px] bg-white hover:bg-neutral-100 text-zinc-900 font-black py-3 rounded-xl text-xs transition flex items-center justify-center gap-2 cursor-pointer shadow-lg"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4">
              <path fill="#EA4335" d="M12 5c1.6 0 3 .6 4.1 1.7l3.1-3.1C17.3 1.8 14.8 1 12 1 7.4 1 3.5 3.6 1.6 7.4l3.7 2.8C6.2 7.2 8.9 5 12 5z" />
              <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.6l3.7 2.9c2.2-2 3.7-5 3.7-8.7z" />
              <path fill="#FBBC05" d="M5.3 14.8c-.2-.8-.4-1.6-.4-2.5s.2-1.7.4-2.5L1.6 7C.6 9 0 11.2 0 13.5s.6 4.5 1.6 6.5l3.7-2.9z" />
              <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3.1 0-5.8-2.1-6.7-5l-3.7 2.8C3.5 21.4 7.4 24 12 24z" />
            </svg>
            <span>متابعة باستخدام Google</span>
          </button>

          <button
            onClick={() => signIn('login')}
            className="w-full min-h-[46px] bg-gradient-to-r from-[#FF1744] to-purple-600 hover:opacity-95 text-white font-black py-3 rounded-xl text-xs transition flex items-center justify-center gap-2 cursor-pointer shadow-lg"
          >
            <LogIn size={15} />
            <span>تسجيل الدخول بالبريد وكلمة المرور</span>
          </button>
          <button
            onClick={() => signIn('register')}
            className="w-full min-h-[46px] bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-white font-black py-3 rounded-xl text-xs transition flex items-center justify-center gap-2 cursor-pointer"
          >
            <UserPlus size={15} />
            <span>إنشاء حساب جديد مجاناً</span>
          </button>
        </div>
      </div>
    );
  }

  const useTwoPaneProfile = (display.isBookPosture || display.isWideOrUnfolded) && !display.isCoverScreen;

  return (
    <PullToRefresh onRefresh={() => fetchProfile(true)}>
      <div className="bg-[#000000] min-h-screen text-xs font-sans text-right select-none w-full max-w-6xl mx-auto border-x border-[#1a1a1a]/70 relative pb-12 overflow-x-hidden" dir="rtl">

        {/* Top Floating Controls */}
        {onBack && (
          <div className="theme-keep-dark absolute top-4 right-4 z-40">
            <button
              onClick={onBack}
              className="w-10 h-10 bg-[#0a0a0c]/85 backdrop-blur-md rounded-xl hover:bg-[#141418] border border-white/10 active:scale-95 transition text-white flex items-center justify-center cursor-pointer"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        )}

        {isCurrentUser && onOpenAccountSettings && (
          <div className="theme-keep-dark absolute top-4 left-4 z-40">
            <button
              onClick={onOpenAccountSettings}
              title="إعدادات الحساب"
              className="w-10 h-10 bg-[#0a0a0c]/85 backdrop-blur-md rounded-xl hover:bg-[#141418] border border-white/10 active:scale-95 transition text-white flex items-center justify-center cursor-pointer"
            >
              <Settings size={17} />
            </button>
          </div>
        )}

        {/* Banner */}
        <div
          onClick={() => {
            if (bannerImg) {
              setLightboxImage({
                src: bannerImg,
                caption: equipped.banner?.name || 'غلاف الملف الشخصي',
              });
            }
          }}
          className={`theme-keep-dark relative ${bannerHeightClass} w-full overflow-hidden bg-[#060609] border-b border-white/5 select-none z-10 ${
            bannerImg ? 'cursor-zoom-in' : ''
          }`}
        >
          {bannerImg ? (
            <img
              src={bannerImg}
              alt={equipped.banner?.name || 'غلاف الملف الشخصي'}
              referrerPolicy="no-referrer"
              className={`absolute inset-0 w-full h-full object-cover object-center ${equipped.banner?.imageStyle || ''}`}
            />
          ) : (
            <div className="absolute inset-0 w-full h-full bg-gradient-to-tr from-[#06060b] via-[#130d20] to-[#06060b]" />
          )}
          <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black via-black/55 to-transparent z-10 pointer-events-none" />
        </div>

        {/* Responsive Split Grid: Identity Column + Main Content Column (hinge-safe in book mode) */}
        <div
          className={useTwoPaneProfile ? 'grid grid-cols-1 lg:grid-cols-12 px-4 md:px-6 items-start' : ''}
          style={display.isBookPosture ? { gap: 'var(--fold-hinge-gap, 24px)' } : useTwoPaneProfile ? { gap: '24px' } : undefined}
        >

        {/* Identity Header */}
        <div className={`relative -mt-12 pb-4 z-20 flex flex-col ${
          useTwoPaneProfile ? 'lg:col-span-5 xl:col-span-4 lg:sticky lg:top-4 lg:bg-[#07070b]/90 lg:border lg:border-white/[0.08] lg:rounded-2xl lg:p-4 lg:mt-4' : 'px-4'
        } ${
          isCentered ? 'items-center text-center' : isLeft ? 'items-end text-left' : 'items-start text-right'
        }`}>
          <div className={`flex items-end justify-between w-full gap-3 ${
            isCentered ? 'flex-col items-center' : isLeft ? 'flex-row-reverse' : 'flex-row'
          }`}>
            {/* Avatar */}
            <button
              type="button"
              aria-label="تكبير الصورة الشخصية"
              onClick={() =>
                setLightboxImage({
                  src: avatarImg,
                  caption: userData?.displayName || (isCurrentUser ? user?.displayName : undefined) || 'الصورة الشخصية',
                })
              }
              className="relative shrink-0 cursor-zoom-in group focus:outline-none"
            >
              {equipped.aura && (
                <div className={`absolute -inset-2 ${avatarShapeClass} pointer-events-none z-0 opacity-85 ${equipped.aura.auraStyle || ''} bg-gradient-to-tr ${equipped.aura.auraGradient || 'from-purple-500/40 to-amber-500/40'} blur-[3px]`} />
              )}
              <div className={`w-20 h-20 ${avatarShapeClass} border-4 border-black bg-[#0c0c0e] overflow-hidden relative z-10 shadow-xl group-hover:brightness-110 transition`}>
                <img src={avatarImg} alt="Avatar" className={`w-full h-full object-cover ${equipped.avatar?.imageStyle || ''}`} referrerPolicy="no-referrer" />
              </div>
              {equipped.frame?.frameStyle && (
                <div className={`absolute inset-[-4px] pointer-events-none z-20 ${equipped.frame.frameStyle} ${avatarShapeClass}`} />
              )}
              <div className="absolute -bottom-1 -right-1 bg-gradient-to-tr from-[#9333ea] to-[#ec4899] text-white font-black text-[11px] w-7 h-7 rounded-full flex items-center justify-center border-2 border-black shadow-lg font-mono tabular-nums z-30">
                {currentLevel}
              </div>
            </button>

            {/* Clean inline currency & streak summary */}
            {showHistory && (
              <div className="flex items-center gap-3 bg-[#09090d] border border-white/10 rounded-xl px-3 py-2 text-xs font-bold tabular-nums">
                <div className="flex items-center gap-1.5 text-amber-400">
                  <Trophy size={14} />
                  <span>{userData?.coins || 0}</span>
                </div>
                <span className="text-neutral-700">|</span>
                <div className="flex items-center gap-1.5 text-rose-400">
                  <Flame size={14} />
                  <span>{userData?.streakDays || 0} يوم</span>
                </div>
              </div>
            )}
          </div>

          {/* Name, handle, and title */}
          <div className={`mt-3 space-y-1 w-full ${
            isCentered ? 'text-center' : isLeft ? 'text-left' : 'text-right'
          }`}>
            <h1 className={`text-base font-black flex items-center gap-1.5 tracking-tight ${
              isCentered ? 'justify-center' : isLeft ? 'justify-end' : 'justify-start'
            } ${equipped.title ? equipped.title.color : 'text-white'}`}>
              <span>{userData?.displayName || (isCurrentUser ? user?.displayName : 'أوتاكو غامض')}</span>
              {equipped.title?.icon && <equipped.title.icon size={13} className="shrink-0" />}
              {equipped.badge?.icon && (
                <span title={equipped.badge.name} className="inline-flex items-center">
                  {React.createElement(equipped.badge.icon, { size: 13, className: equipped.badge.color })}
                </span>
              )}
            </h1>

            <div className={`flex items-center gap-2 text-[11px] text-neutral-400 flex-wrap ${
              isCentered ? 'justify-center' : isLeft ? 'justify-end' : 'justify-start'
            }`}>
              {userData?.username && <span className="font-mono">@{userData.username}</span>}
              {equipped.title && (
                <span className={`font-bold ${equipped.title.color}`}>· {equipped.title.name}</span>
              )}
              {isStaff && (
                <span className="inline-flex items-center gap-1 text-rose-300 font-bold">
                  <Shield size={11} className="text-rose-400" /> الإدارة
                </span>
              )}
              {isCurrentUser && user && !user.emailVerified && user.email && (
                <button
                  onClick={() => onOpenAccountSettings?.()}
                  className="text-amber-300 hover:underline font-bold cursor-pointer inline-flex items-center gap-1"
                >
                  <AlertCircle size={12} /> تفعيل البريد
                </button>
              )}
              {isCurrentUser && user?.emailVerified && (
                <span className="text-emerald-400 inline-flex items-center gap-1 font-bold">
                  <CheckCircle2 size={11} /> موثق
                </span>
              )}
            </div>
          </div>

          {/* Challenge button for visiting other profiles */}
          {!isCurrentUser && targetId && onChallengeUser && (
            <button
              onClick={() =>
                onChallengeUser({
                  id: targetId,
                  displayName: userData?.displayName || 'مقاتل أوتاكو',
                  username: userData?.username
                })
              }
              className="mt-3 w-full min-h-[44px] bg-gradient-to-r from-[#FF1744] to-rose-600 hover:opacity-95 text-white font-black py-2.5 px-4 rounded-xl text-xs transition flex items-center justify-center gap-2 cursor-pointer shadow-lg"
            >
              <Swords size={15} />
              <span>منازلة في الحلبة</span>
            </button>
          )}

          {/* Clean Level XP Bar */}
          <div className="mt-3.5 w-full bg-[#09090d] border border-white/10 rounded-xl p-3 relative overflow-hidden">
            {!showHistory && (
              <div className="absolute inset-0 bg-black/90 z-30 flex items-center justify-center gap-1.5">
                <Lock size={13} className="text-amber-400" />
                <span className="text-neutral-300 font-bold text-[11px]">التقدم مخفي بناءً على رغبة المستخدم</span>
              </div>
            )}
            <div className="flex items-center justify-between text-[11px] font-bold mb-1.5">
              <span className="text-purple-300 font-mono">LV {currentLevel}</span>
              <span className="text-neutral-300 font-mono tabular-nums">
                {userData?.xp || 0} / {xpNeededForNext} XP
              </span>
              <span className="text-pink-400 font-mono">LV {nextLevel}</span>
            </div>
            <div className="h-2 w-full bg-neutral-900 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#9333ea] to-[#ec4899] rounded-full transition-all duration-500"
                style={{ width: `${levelProgress}%` }}
              />
            </div>
          </div>

          {/* Conditional Retry Banner ONLY when loading fails */}
          {profileError && (
            <div className="mt-3 w-full bg-rose-500/10 border border-rose-500/30 rounded-xl p-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-right min-w-0">
                <AlertCircle size={17} className="text-rose-400 shrink-0" />
                <p className="text-xs font-black text-white truncate">تعذر تحديث بيانات الملف</p>
              </div>
              <button
                onClick={() => fetchProfile(true)}
                disabled={refreshingProfile}
                className="min-h-[36px] px-3 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-black shrink-0 flex items-center gap-1.5 cursor-pointer"
              >
                {refreshingProfile && <Loader2 size={13} className="animate-spin" />}
                <span>إعادة المحاولة</span>
              </button>
            </div>
          )}
        </div>

        {/* End/Main Content Column */}
        <div className={useTwoPaneProfile ? 'lg:col-span-7 xl:col-span-8 pt-1 lg:pt-4' : ''}>
        {/* 3 Clean Primary Tabs */}
        <div className={`${useTwoPaneProfile ? 'mb-4' : 'px-4 mb-4'}`}>
          <div className="grid grid-cols-3 gap-1.5 p-1 bg-[#09090d] border border-white/10 rounded-xl">
            {[
              { id: 'overview', label: 'نظرة عامة' },
              { id: 'stats', label: 'الإحصائيات' },
              { id: 'achievements', label: `الإنجازات (${userAchievements.completed.length})` },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as ProfileSectionTab)}
                className={`min-h-[42px] px-2 rounded-lg text-xs font-black transition cursor-pointer truncate ${
                  activeTab === tab.id
                    ? 'bg-[#FF1744] text-white shadow-md'
                    : 'text-neutral-400 hover:text-white hover:bg-white/5'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        <div className={useTwoPaneProfile ? '' : 'px-4'}>
          <AnimatePresence mode="wait">
            {activeTab === 'overview' && (
              <motion.div
                key="tab_overview"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.16 }}
                className="space-y-3"
              >
                {/* Compact Snapshot Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  <div className="bg-[#09090d] border border-white/10 rounded-xl p-3 flex items-center justify-between">
                    <div>
                      <span className="text-[11px] text-neutral-400 font-bold block">حلقات مشاهدة</span>
                      <span className="text-base font-black text-white font-mono tabular-nums mt-0.5 block">
                        {showHistory ? stats.totalEpisodesWatched : '—'}
                      </span>
                    </div>
                    <PlayCircle size={20} className="text-sky-400 shrink-0" />
                  </div>
                  <div className="bg-[#09090d] border border-white/10 rounded-xl p-3 flex items-center justify-between">
                    <div>
                      <span className="text-[11px] text-neutral-400 font-bold block">فصول مقروءة</span>
                      <span className="text-base font-black text-white font-mono tabular-nums mt-0.5 block">
                        {showHistory ? mangaStats.totalChaptersRead : '—'}
                      </span>
                    </div>
                    <BookOpen size={20} className="text-amber-400 shrink-0" />
                  </div>
                  <div className="col-span-2 sm:col-span-1 bg-[#09090d] border border-white/10 rounded-xl p-3 flex items-center justify-between">
                    <div>
                      <span className="text-[11px] text-neutral-400 font-bold block">أعمال بالمكتبة</span>
                      <span className="text-base font-black text-white font-mono tabular-nums mt-0.5 block">
                        {showStats ? stats.totalListCount + mangaStats.totalListCount : '—'}
                      </span>
                    </div>
                    <ListVideo size={20} className="text-emerald-400 shrink-0" />
                  </div>
                </div>

                {/* Cloud Storage Status */}
                {isCurrentUser && user && (
                  <div className="bg-[#09090d] border border-white/10 rounded-xl p-3 flex items-center justify-between gap-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                        isCloudAccount
                          ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                          : 'bg-amber-500/15 border-amber-500/30 text-amber-400'
                      }`}>
                        {isCloudAccount ? <Cloud size={16} /> : <HardDrive size={16} />}
                      </div>
                      <div className="text-right min-w-0">
                        <h3 className="font-black text-white text-xs truncate">
                          {isCloudAccount ? 'مكتبتك محفوظة سحابياً' : 'حفظ محلي (وضع الضيف)'}
                        </h3>
                        <p className="text-[11px] text-neutral-400 mt-0.5 truncate tabular-nums">
                          {isCloudAccount
                            ? `${stats.totalListCount} أنمي · ${stats.completedAnimeCount} مكتمل`
                            : 'اربط حسابك لحفظ مكتبتك على السحابة'}
                        </p>
                      </div>
                    </div>
                    {!isCloudAccount && (
                      <button
                        onClick={() => signInWithGoogleAdaptive()}
                        className="min-h-[36px] px-3 rounded-lg text-xs font-black bg-amber-400 hover:bg-amber-300 text-black shrink-0 cursor-pointer transition"
                      >
                        ربط الحساب
                      </button>
                    )}
                  </div>
                )}

                {/* Quick Navigation Actions */}
                {isCurrentUser && (
                  <div className="space-y-2">
                    {isStaff && onAdminClick && (
                      <button
                        onClick={onAdminClick}
                        className="w-full min-h-[48px] bg-gradient-to-r from-rose-950/50 to-zinc-950 border border-rose-500/30 hover:border-rose-500/60 rounded-xl px-3.5 py-2.5 flex items-center justify-between text-white cursor-pointer transition"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-rose-600 flex items-center justify-center text-white">
                            <Shield size={15} />
                          </div>
                          <span className="text-xs font-black">لوحة الإدارة المركزية</span>
                        </div>
                        <ChevronLeft size={16} className="text-rose-400" />
                      </button>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {onRewardsClick && (
                        <button
                          onClick={onRewardsClick}
                          className="w-full min-h-[46px] bg-[#09090d] hover:bg-[#121218] border border-amber-500/20 rounded-xl px-3.5 py-2.5 flex items-center justify-between text-white cursor-pointer transition"
                        >
                          <div className="flex items-center gap-2.5">
                            <Trophy size={16} className="text-amber-400 shrink-0" />
                            <span className="text-xs font-bold">المكافآت والمهام</span>
                          </div>
                          <ChevronLeft size={15} className="text-neutral-500" />
                        </button>
                      )}
                      {onLevelPerksClick && (
                        <button
                          onClick={onLevelPerksClick}
                          className="w-full min-h-[46px] bg-[#09090d] hover:bg-[#121218] border border-white/10 rounded-xl px-3.5 py-2.5 flex items-center justify-between text-white cursor-pointer transition"
                        >
                          <div className="flex items-center gap-2.5">
                            <Award size={16} className="text-purple-400 shrink-0" />
                            <span className="text-xs font-bold">امتيازات المستويات</span>
                          </div>
                          <ChevronLeft size={15} className="text-neutral-500" />
                        </button>
                      )}
                      {onOpenAccountSettings && (
                        <button
                          onClick={onOpenAccountSettings}
                          className="w-full min-h-[46px] bg-[#09090d] hover:bg-[#121218] border border-white/10 rounded-xl px-3.5 py-2.5 flex items-center justify-between text-white cursor-pointer transition"
                        >
                          <div className="flex items-center gap-2.5">
                            <Settings size={16} className="text-sky-400 shrink-0" />
                            <span className="text-xs font-bold">الحساب والأمان</span>
                          </div>
                          <ChevronLeft size={15} className="text-neutral-500" />
                        </button>
                      )}
                      {onOpenAppearance && (
                        <button
                          onClick={onOpenAppearance}
                          className="w-full min-h-[46px] bg-[#09090d] hover:bg-[#121218] border border-white/10 rounded-xl px-3.5 py-2.5 flex items-center justify-between text-white cursor-pointer transition"
                        >
                          <div className="flex items-center gap-2.5">
                            <Paintbrush size={16} className="text-pink-400 shrink-0" />
                            <span className="text-xs font-bold">المظهر والألقاب</span>
                          </div>
                          <ChevronLeft size={15} className="text-neutral-500" />
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Top 3 Achievements Preview */}
                <div className="bg-[#09090d] border border-white/10 rounded-xl p-3.5 space-y-2.5">
                  <button
                    onClick={() => setActiveTab('achievements')}
                    className="w-full flex items-center justify-between cursor-pointer text-right"
                  >
                    <span className="text-xs font-black text-white flex items-center gap-1.5">
                      <Trophy size={14} className="text-amber-400" />
                      أبرز الإنجازات
                    </span>
                    <span className="text-[11px] font-bold text-purple-400 flex items-center gap-1 tabular-nums" aria-label="عرض كل الإنجازات">
                      <span>{userAchievements.completed.length}/{DYNAMIC_ACHIEVEMENTS.length}</span>
                      <ChevronLeft size={14} />
                    </span>
                  </button>

                  <div className="space-y-2">
                    {latestThreeAchievements.map(({ ach, unlocked, clampedProg, ratio }) => {
                      const pct = Math.round(ratio * 100);
                      return (
                        <button
                          key={ach.id}
                          onClick={() => setActiveTab('achievements')}
                          className={`w-full text-right p-2.5 rounded-xl border ${
                            unlocked
                              ? 'bg-amber-500/5 border-amber-500/25'
                              : 'bg-black/40 border-white/10'
                          } transition cursor-pointer flex items-center justify-between gap-2.5 text-white`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <div className={`p-1.5 rounded-lg ${unlocked ? 'bg-amber-500/15 text-amber-400' : 'bg-neutral-800 text-neutral-400'} shrink-0`}>
                              {unlocked ? <Trophy size={14} /> : <Lock size={13} />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-black truncate">{ach.title}</div>
                              {!unlocked && (
                                <div className="mt-1 flex items-center gap-2">
                                  <div className="flex-1 h-1.5 bg-neutral-900 rounded-full overflow-hidden">
                                    <div className="h-full bg-purple-500 rounded-full" style={{ width: `${pct}%` }} />
                                  </div>
                                  <span className="text-[11px] font-mono text-purple-300 tabular-nums shrink-0">{pct}%</span>
                                </div>
                              )}
                            </div>
                          </div>
                          <span className="text-[11px] font-mono text-neutral-300 shrink-0 tabular-nums">
                            {unlocked ? '✓ مكتمل' : `${clampedProg}/${ach.max}`}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'stats' && (
              <motion.div
                key="tab_stats"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.16 }}
                className="space-y-4"
              >
                {/* Social Engagement Summary */}
                <div className={`grid gap-2 ${display.isCoverScreen ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4'}`}>
                  {[
                    { label: 'التعليقات', val: userData?.commentsCount || 0, icon: MessageSquare, color: 'text-purple-400' },
                    { label: 'المعتمدة', val: userData?.approvedRecommendationsCount || 0, icon: CheckSquare, color: 'text-amber-400' },
                    { label: 'الإعجابات', val: userData?.likesReceived || 0, icon: ThumbsUp, color: 'text-emerald-400' },
                    { label: 'سلبية', val: userData?.dislikesReceived || 0, icon: ThumbsDown, color: 'text-rose-400' },
                  ].map((s) => (
                    <div key={s.label} className="bg-[#09090d] border border-white/10 rounded-xl p-2.5 flex flex-col items-center justify-center text-center">
                      <s.icon size={15} className={`${s.color} mb-1`} />
                      <span className="text-xs font-black text-white font-mono tabular-nums">{s.val}</span>
                      <span className="text-[11px] text-neutral-400 font-bold mt-0.5">{s.label}</span>
                    </div>
                  ))}
                </div>

                {!showStats ? (
                  <div className="bg-[#09090d] border border-white/10 rounded-2xl p-8 text-center text-white">
                    <Lock className="text-rose-400 mx-auto mb-2" size={22} />
                    <h3 className="font-black text-xs">الملخص الإحصائي خاص</h3>
                    <p className="text-neutral-400 text-[11px] mt-1">قام المستخدم بإخفاء تفاصيل قائمته.</p>
                  </div>
                ) : (
                  <>
                    {/* Library Donut & 5 Statuses */}
                    <div className="bg-[#09090d] border border-white/10 rounded-2xl p-4 flex flex-col items-center gap-4">
                      <div className="relative w-28 h-28 flex items-center justify-center shrink-0">
                        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                          <circle cx="50" cy="50" r="40" className="stroke-[#14141b] fill-none" strokeWidth="9" />
                          {(() => {
                            let currentOffset = 0;
                            const circ = 2 * Math.PI * 40;
                            return [
                              { count: stats.listCount.watching, color: '#38bdf8' },
                              { count: stats.listCount.completed, color: '#10b981' },
                              { count: stats.listCount.plan_to_watch, color: '#eab308' },
                              { count: stats.listCount.on_hold, color: '#f97316' },
                              { count: stats.listCount.dropped, color: '#6b7280' }
                            ].filter(s => s.count > 0).map((s, i) => {
                              const pct = s.count / Math.max(1, stats.totalListCount);
                              const startOffset = currentOffset * circ;
                              const segmentLength = pct * circ;
                              currentOffset += pct;
                              return (
                                <circle
                                  key={i}
                                  cx="50" cy="50" r="40"
                                  className="fill-none stroke-current"
                                  strokeWidth="9"
                                  strokeDasharray={`0 ${startOffset} ${segmentLength} ${circ}`}
                                  strokeDashoffset={0}
                                  style={{ color: s.color }}
                                  strokeLinecap={pct === 1 ? "butt" : "round"}
                                />
                              );
                            });
                          })()}
                        </svg>
                        <div className="absolute flex flex-col items-center leading-none text-center">
                          <span className="text-base font-black text-white font-mono tabular-nums">{stats.totalListCount}</span>
                          <span className="text-[11px] text-neutral-400 mt-1 font-bold">المجموع</span>
                        </div>
                      </div>

                      <div className={`grid gap-1.5 w-full ${display.isCoverScreen ? 'grid-cols-2' : 'grid-cols-3 sm:grid-cols-5'}`}>
                        {[
                          { label: 'أشاهد', count: stats.listCount.watching, color: 'text-sky-400' },
                          { label: 'مكتمل', count: stats.listCount.completed, color: 'text-emerald-400' },
                          { label: 'مخطط', count: stats.listCount.plan_to_watch, color: 'text-yellow-400' },
                          { label: 'متوقف', count: stats.listCount.on_hold, color: 'text-orange-400' },
                          { label: 'ملغي', count: stats.listCount.dropped, color: 'text-neutral-400' }
                        ].map(item => (
                          <div key={item.label} className="bg-black/40 border border-white/10 rounded-xl p-2 flex flex-col items-center text-center">
                            <span className="text-[11px] font-bold text-neutral-300">{item.label}</span>
                            <span className={`text-xs font-black font-mono tabular-nums ${item.color} mt-0.5`}>{item.count}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Favorite Genres */}
                    <div className="bg-[#09090d] border border-white/10 rounded-2xl p-4">
                      <h4 className="text-xs font-black text-white flex items-center gap-1.5 mb-3">
                        <BarChart3 size={14} className="text-purple-400" />
                        <span>التصنيفات المفضلة</span>
                      </h4>
                      {stats.favoriteGenres.length > 0 ? (
                        <div className="space-y-3">
                          {stats.favoriteGenres.map((g, idx) => (
                            <div key={idx} className="space-y-1">
                              <div className="flex justify-between items-center text-[11px] font-bold text-neutral-300">
                                <span>{g.name}</span>
                                <span className="font-mono text-neutral-400 tabular-nums">{g.count} عمل ({g.percent}%)</span>
                              </div>
                              <div className="h-1.5 bg-neutral-900 rounded-full overflow-hidden">
                                <div className="h-full bg-gradient-to-r from-[#9333ea] to-[#ec4899] rounded-full" style={{ width: `${g.percent}%` }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[11px] text-neutral-400 text-center py-4">أضف أعمالاً لقائمتك لعرض تصنيفاتك المفضلة.</p>
                      )}
                    </div>
                  </>
                )}
              </motion.div>
            )}

            {activeTab === 'achievements' && (
              <motion.div
                key="tab_achievements"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.16 }}
                className="space-y-4"
              >
                {/* Sub-tabs */}
                <div className="grid grid-cols-3 gap-1.5 p-1 bg-[#09090d] border border-white/10 rounded-xl">
                  <button
                    onClick={() => { setActiveAchievementTab('all'); setAchievementsLimit(30); }}
                    className={`min-h-[38px] px-2 rounded-lg text-xs font-black transition cursor-pointer ${
                      activeAchievementTab === 'all' ? 'bg-amber-500 text-black' : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    الكل
                  </button>
                  <button
                    onClick={() => { setActiveAchievementTab('completed'); setAchievementsLimit(30); }}
                    className={`min-h-[38px] px-2 rounded-lg text-xs font-black transition cursor-pointer ${
                      activeAchievementTab === 'completed' ? 'bg-emerald-600 text-white' : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    أنجزتها ({userAchievements.completed.length})
                  </button>
                  <button
                    onClick={() => { setActiveAchievementTab('locked'); setAchievementsLimit(30); }}
                    className={`min-h-[38px] px-2 rounded-lg text-xs font-black transition cursor-pointer ${
                      activeAchievementTab === 'locked' ? 'bg-purple-600 text-white' : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    الأقرب ({userAchievements.locked.length})
                  </button>
                </div>

                {/* Category Filter */}
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => { setSelectedCategory(key); setAchievementsLimit(30); }}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition cursor-pointer border ${
                        selectedCategory === key
                          ? 'bg-[#1a1a24] text-white border-purple-500/40'
                          : 'bg-black/40 text-neutral-400 border-white/10 hover:text-white'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {filteredAchievements.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {filteredAchievements.slice(0, achievementsLimit).map(({ ach, unlocked, clampedProg, ratio }) => {
                      const percentValue = Math.round(ratio * 100);
                      return (
                        <div
                          key={ach.id}
                          className={`border rounded-xl p-3 flex flex-col justify-between gap-2 text-right bg-[#09090d] ${
                            unlocked ? 'border-amber-500/35' : 'border-white/10'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <span className="text-[11px] font-bold text-neutral-400 block">
                                {CATEGORY_LABELS[ach.category as keyof typeof CATEGORY_LABELS]}
                              </span>
                              <h4 className={`text-xs font-black leading-snug mt-0.5 ${unlocked ? 'text-amber-400' : 'text-white'}`}>
                                {ach.title}
                              </h4>
                            </div>
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                              unlocked ? 'bg-amber-500/15 text-amber-400' : 'bg-neutral-800 text-neutral-400'
                            }`}>
                              {unlocked ? <Trophy size={14} /> : <Lock size={14} />}
                            </div>
                          </div>

                          <p className="text-[11px] text-neutral-400 leading-relaxed">{ach.req}</p>

                          <div className="space-y-1">
                            <div className="flex justify-between items-center text-[11px] font-mono">
                              <span className="text-neutral-300 font-sans font-bold">
                                {unlocked ? 'مكتمل' : `متبقي ${ach.max - clampedProg}`}
                              </span>
                              <span className={`${unlocked ? 'text-emerald-400' : 'text-purple-400'} font-bold tabular-nums`}>
                                {clampedProg}/{ach.max} ({percentValue}%)
                              </span>
                            </div>
                            <div className="h-1.5 w-full bg-black rounded-full overflow-hidden">
                              <div
                                className={`h-full ${unlocked ? 'bg-emerald-500' : 'bg-purple-500'}`}
                                style={{ width: `${percentValue}%` }}
                              />
                            </div>
                          </div>

                          <div className="border-t border-white/10 pt-2 flex items-center justify-between text-[11px]">
                            <span className="text-neutral-400 font-bold">المكافأة</span>
                            <span className="font-mono font-black tabular-nums">
                              {ach.rewardType === 'coins' ? (
                                <span className="text-amber-400">+{ach.rewardVal} كوينز</span>
                              ) : ach.rewardType === 'xp' ? (
                                <span className="text-purple-400">+{ach.rewardVal} XP</span>
                              ) : (
                                <span className="text-emerald-400">+{ach.rewardVal} نقطة</span>
                              )}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-8 bg-[#09090d] border border-white/10 rounded-xl text-center">
                    <p className="text-xs text-neutral-300 font-bold">لا توجد إنجازات مطابقة لهذا التصنيف حالياً.</p>
                  </div>
                )}

                {filteredAchievements.length > achievementsLimit && (
                  <div className="flex justify-center pt-1">
                    <button
                      onClick={() => setAchievementsLimit(prev => prev + 30)}
                      className="min-h-[40px] px-5 bg-[#111118] hover:bg-[#191923] border border-white/10 rounded-xl text-xs font-black text-white transition flex items-center gap-2 cursor-pointer"
                    >
                      <span>عرض المزيد ({filteredAchievements.length - achievementsLimit}+)</span>
                      <ChevronDown size={14} />
                    </button>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        </div>
        </div>

        {loading && entries.length === 0 && (
          <div className="px-4 py-6 flex justify-center">
            <Loader2 size={18} className="animate-spin text-neutral-500" />
          </div>
        )}
        <ImageLightboxModal
          src={lightboxImage?.src || null}
          alt={lightboxImage?.caption || 'صورة مكبرة'}
          caption={lightboxImage?.caption}
          onClose={() => setLightboxImage(null)}
        />
      </div>
    </PullToRefresh>
  );
}
