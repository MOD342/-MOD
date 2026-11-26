import React, { useState, useEffect, useMemo } from 'react';
import { 
  UserCircle, 
  Gamepad2, 
  CalendarDays, 
  Trophy, 
  ShoppingCart, 
  Shield, 
  LogOut, 
  ChevronLeft, 
  Heart, 
  Lock, 
  Settings,
  Bell,
  Sparkles,
  Coins,
  Star,
  Gift,
  Crown,
  Zap,
  ChevronRight,
  Flame,
  LayoutGrid,
  Tv,
  HelpCircle,
  MessageSquare,
  CreditCard,
  Users,
  Newspaper,
  Smartphone,
  Download,
  Paintbrush,
  HeartHandshake,
  Bot,
  Film,
  FolderDown,
  BookOpen,
  Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../contexts/AuthContext';
import { moderationService, isStaffEmail } from '../services/moderationService';
import { STORE_ITEMS_SORTED, getAvatarShapeClass } from '../data/storeItems';
import { getActiveNonOverlappingEvent } from '../services/arenaCalendarEngine';
import { Swords } from 'lucide-react';
import { useDeviceDisplay } from '../hooks/useDeviceDisplay';
import { useDownloadQueue } from '../services/downloadManagerService';

interface MoreViewProps {
  onNavigate: (view: string, props?: any) => void;
}

export default function MoreView({ onNavigate }: MoreViewProps) {
  const { user, signIn, logout, userData, userRole } = useAuth();
  const display = useDeviceDisplay();
  const downloadQueue = useDownloadQueue();
  const activeDownloadsCount = useMemo(
    () =>
      downloadQueue.filter(
        (d) => d.status === 'queued' || d.status === 'resolving' || d.status === 'downloading',
      ).length,
    [downloadQueue],
  );
  const isDirectStaff = isStaffEmail(user?.email);
  const [isAdmin, setIsAdmin] = useState(() => isDirectStaff || userRole === 'admin' || userRole === 'owner' || userRole === 'moderator');

  useEffect(() => {
    const checkAdmin = async () => {
      if (user) {
        if (isStaffEmail(user.email) || userRole === 'admin' || userRole === 'owner' || userRole === 'moderator') {
          setIsAdmin(true);
          return;
        }
        try {
          const role = await moderationService.getCurrentUserRole(user);
          setIsAdmin(role === 'admin' || role === 'owner' || role === 'moderator' || isStaffEmail(user.email));
        } catch (e) {
          console.error("Error fetching role on More screen:", e);
        }
      } else {
        setIsAdmin(false);
      }
    };
    checkAdmin();
  }, [user, userRole]);

  const handleLogout = async () => {
    try {
      await logout();
      onNavigate('home');
    } catch(e) {
      console.error(e);
    }
  };

  // Safe equipped items calculations
  const equipped = useMemo(() => {
    const avatarId = userData?.equippedAvatar || null;
    const frameId = userData?.equippedFrame || null;
    const titleId = userData?.equippedTitle || null;
    const badgeId = userData?.equippedBadge || null;

    return {
      avatar: STORE_ITEMS_SORTED.find(i => i.id === avatarId),
      frame: STORE_ITEMS_SORTED.find(i => i.id === frameId),
      title: STORE_ITEMS_SORTED.find(i => i.id === titleId),
      badge: STORE_ITEMS_SORTED.find(i => i.id === badgeId),
    };
  }, [userData]);

  const currentLevel = userData?.level || 1;
  const xpNeededForNext = Math.floor(Math.pow(currentLevel, 1.5) * 500) + 500;
  const currentXp = userData?.xp || 0;
  const levelProgress = Math.min(100, Math.max(0, (currentXp / xpNeededForNext) * 100));

  const avatarImg = equipped.avatar?.img || user?.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.id || 'Felix'}`;
  const activeArenaEvent = useMemo(() => getActiveNonOverlappingEvent(), []);

  // تصنيفات مرتبة ومنسقة بتسميات موجزة من كلمة واحدة لتتسع بثلاثة أعمدة بوضوح
  const categories = [
    {
      title: 'حسابي',
      items: [
        { id: 'profile', label: 'ملفي', icon: UserCircle, color: 'text-sky-400', bg: 'bg-sky-500/10' },
        { id: 'account_settings', label: 'الإعدادات', icon: Settings, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
        { id: 'profile_appearance', label: 'المظهر', icon: Paintbrush, color: 'text-pink-400', bg: 'bg-pink-500/10' },
        { id: 'favorites', label: 'المفضلة', icon: Heart, color: 'text-rose-400', bg: 'bg-rose-500/10' },
        { id: 'downloads', label: activeDownloadsCount > 0 ? `التنزيلات (${activeDownloadsCount})` : 'التنزيلات', icon: FolderDown, color: 'text-purple-400', bg: 'bg-purple-500/10' },
        { id: 'notifications', label: 'الإشعارات', icon: Bell, color: 'text-indigo-400', bg: 'bg-indigo-500/10' },
        { id: 'rewards', label: 'المكافآت', icon: Gift, color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
        { id: 'level_perks', label: 'الامتيازات', icon: Zap, color: 'text-amber-400', bg: 'bg-amber-500/10' },
      ]
    },
    {
      title: 'الترفيه والمتجر',
      items: [
        { id: 'manga_hub', label: 'المانجا', icon: BookOpen, color: 'text-amber-400', bg: 'bg-amber-500/10' },
        { id: 'ai_chat', label: 'مود', icon: Bot, color: 'text-rose-400', bg: 'bg-rose-500/10' },
        { id: 'games', label: 'الحلبة', icon: Swords, color: 'text-purple-400', bg: 'bg-purple-500/10' },
        { id: 'store', label: 'المتجر', icon: ShoppingCart, color: 'text-orange-400', bg: 'bg-orange-500/10' },
        { id: 'schedule', label: 'المواعيد', icon: CalendarDays, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
        { id: 'top_anime', label: 'الأفضل', icon: Crown, color: 'text-amber-400', bg: 'bg-amber-500/10' },
        { id: 'anime_movies', label: 'الأفلام', icon: Film, color: 'text-rose-400', bg: 'bg-rose-500/10' },
      ]
    },
    {
      title: 'النظام والدعم',
      items: [
        { id: 'ad_support', label: 'ادعمنا', icon: HeartHandshake, color: 'text-amber-400', bg: 'bg-amber-500/10' },
        { id: 'support_help', label: 'المساعدة', icon: HelpCircle, color: 'text-red-400', bg: 'bg-[#FF1744]/15' },
        { id: 'legal_about', label: 'حول التطبيق', icon: Info, color: 'text-purple-400', bg: 'bg-purple-500/10' },
        { id: 'app_permissions', label: 'الأذونات', icon: Bell, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
        ...(isAdmin || isDirectStaff || isStaffEmail(user?.email) || userRole === 'admin' || userRole === 'owner' || userRole === 'moderator'
          ? [
              { id: 'diagnostics', label: 'التشخيص', icon: LayoutGrid, color: 'text-amber-400', bg: 'bg-amber-500/10' },
              { id: 'admin', label: 'الإدارة', icon: Shield, color: 'text-red-500', bg: 'bg-red-500/10' },
            ]
          : [])
      ]
    }
  ];

  return (
    <div className="pb-24 pt-4 px-3.5 md:px-6 space-y-4 max-w-5xl mx-auto font-sans text-right" dir="rtl" id="container_more_view">
      
      {/* شريط عنوان مدمج وأنيق */}
      <div className="flex items-center justify-between border-b border-white/5 pb-3">
        <div className="flex items-center gap-2">
          <LayoutGrid className="text-[#FF1744]" size={20} />
          <h1 className="text-lg font-black text-white">المزيد</h1>
        </div>
      </div>
      
      {/* بطاقة الحساب المدمجة */}
      <AnimatePresence mode="wait">
        {user ? (
          <motion.div 
            key="logged_in_card"
            initial={{ opacity: 0, y: 8 }} 
            animate={{ opacity: 1, y: 0 }} 
            exit={{ opacity: 0, y: -8 }}
            onClick={() => onNavigate('profile')}
            className="bg-[#111115] hover:bg-[#16161c] border border-white/5 hover:border-white/15 rounded-2xl p-3.5 flex flex-col gap-3 shadow-lg cursor-pointer transition-colors"
            id="user_authenticated_profile"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                {/* الصورة الشخصية */}
                <div className="relative shrink-0">
                  {(() => {
                    const resolvedShape = getAvatarShapeClass(userData?.avatarShape || equipped.frame?.avatarShape || 'circle');
                    return equipped.frame ? (
                      <div className={`p-1 ${equipped.frame.frameStyle} ${resolvedShape} relative flex items-center justify-center overflow-hidden w-14 h-14 bg-black`}>
                        <img
                          src={avatarImg}
                          className={`w-full h-full object-cover ${resolvedShape}`}
                          referrerPolicy="no-referrer"
                          alt=""
                        />
                      </div>
                    ) : (
                      <div className={`w-14 h-14 ${resolvedShape} ring-2 ring-neutral-800 bg-black overflow-hidden flex items-center justify-center p-0.5`}>
                        <img
                          src={avatarImg}
                          className={`w-full h-full object-cover ${resolvedShape}`}
                          referrerPolicy="no-referrer"
                          alt=""
                        />
                      </div>
                    );
                  })()}
                  <div className="absolute -bottom-1 -left-1 bg-[#FF1744] text-white text-[9px] font-black px-1.5 py-0.5 rounded-full border border-black flex items-center gap-0.5">
                    <Star size={8} className="fill-white" />
                    <span>{currentLevel}</span>
                  </div>
                </div>

                {/* الاسم واللقب */}
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <h3 className="text-white font-bold text-sm truncate">{user.displayName || 'أوتاكو مميز'}</h3>
                    {equipped.badge && (
                      <span className="text-[9px] font-bold text-yellow-400">
                        • {equipped.badge.name}
                      </span>
                    )}
                  </div>
                  {equipped.title ? (
                    <p className="text-[11px] font-bold text-amber-400 truncate">
                      ★ {equipped.title.name}
                    </p>
                  ) : (
                    <p className="text-[11px] text-neutral-400 truncate">{user.email}</p>
                  )}
                </div>
              </div>

              {/* الكوينز */}
              <div className="shrink-0 bg-yellow-500/10 border border-yellow-500/20 px-2.5 py-1.5 rounded-xl flex items-center gap-1 text-yellow-400">
                <Coins size={13} />
                <span className="text-xs font-black tabular-nums">{userData?.coins || 0}</span>
              </div>
            </div>

            {/* شريط الخبرة المدمج */}
            <div className="flex items-center gap-2.5 pt-2 border-t border-white/5">
              <span className="text-[10px] text-neutral-400 font-medium shrink-0">المستوى {currentLevel}</span>
              <div className="flex-1 h-2 bg-black rounded-full overflow-hidden border border-white/5">
                <div 
                  className="h-full rounded-full bg-gradient-to-r from-[#FF1744] to-rose-500 transition-all duration-500"
                  style={{ width: `${levelProgress}%` }}
                />
              </div>
              <span className="text-[10px] text-neutral-400 font-mono tabular-nums shrink-0">{currentXp}/{xpNeededForNext} XP</span>
            </div>
          </motion.div>
        ) : (
          <motion.div 
            key="logged_out_card"
            initial={{ opacity: 0, y: 8 }} 
            animate={{ opacity: 1, y: 0 }} 
            exit={{ opacity: 0, y: -8 }}
            className="bg-[#111115] border border-white/5 rounded-2xl p-4 flex items-center justify-between gap-3 shadow-lg"
            id="user_anonymous_welcome"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-xl bg-[#FF1744]/10 border border-[#FF1744]/20 flex items-center justify-center text-[#FF1744] shrink-0">
                <UserCircle size={24} />
              </div>
              <div className="min-w-0">
                <h3 className="text-white font-bold text-sm">حساب الزائر</h3>
                <p className="text-[11px] text-neutral-400 truncate">سجل دخولك لحفظ المفضلة والمشاركة</p>
              </div>
            </div>

            <button
              id="btn_sign_in_more"
              onClick={() => signIn('login')}
              className="shrink-0 bg-[#FF1744] hover:bg-red-600 text-white font-bold py-2 px-4 rounded-xl transition cursor-pointer text-xs"
            >
              دخول
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* بطاقة الحدث الحي وساحة الأوتاكو الموحدة */}
      <button
        onClick={() => onNavigate('games')}
        className={`theme-keep-dark w-full bg-gradient-to-r ${activeArenaEvent.bannerGradient} border border-white/10 hover:border-[#FF1744]/50 rounded-2xl p-3.5 flex items-center justify-between gap-3 text-right transition-all active:scale-[0.99] cursor-pointer shadow-lg`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-black/40 border border-white/15 flex items-center justify-center text-[#FF1744] shrink-0">
            <Swords size={20} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[9px] font-black bg-[#FF1744] text-white px-2 py-0.5 rounded-full">
                {activeArenaEvent.tierBadgeAr}
              </span>
              <span className="text-[9px] font-black text-amber-300 bg-black/40 px-2 py-0.5 rounded-full border border-amber-400/20">
                مكافآت ×{activeArenaEvent.rewardMultiplier}
              </span>
            </div>
            <h3 className="text-white font-black text-xs sm:text-sm truncate mt-1">{activeArenaEvent.titleAr}</h3>
            <p className="text-[10px] text-neutral-300 truncate">{activeArenaEvent.subtitleAr}</p>
          </div>
        </div>
        <div className="shrink-0 bg-white text-black font-black text-[10px] px-3 py-2 rounded-xl flex items-center gap-1">
          <span>الحلبة</span>
          <ChevronLeft size={13} />
        </div>
      </button>

      {/* الأقسام والأزرار المدمجة بدون فراغات وبعناوين من كلمة أو كلمتين */}
      <div
        className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start"
        style={display.isBookPosture ? { gap: 'var(--fold-hinge-gap, 24px)' } : undefined}
      >
        {categories.map((cat, catIdx) => {
          const visibleItems = cat.items.filter((item) => {
            const requiresLogin = ['profile', 'profile_appearance', 'games', 'leaderboard', 'store', 'admin', 'tournaments', 'notifications', 'rewards', 'level_perks'].includes(item.id);
            return Boolean(user || !requiresLogin);
          });

          if (visibleItems.length === 0) return null;

          return (
            <div key={catIdx} className="bg-[#111115] border border-white/5 rounded-2xl p-3 space-y-2.5 h-full">
              <h4 className="text-xs font-bold text-neutral-400 flex items-center gap-1.5 px-1 select-none">
                <span className="w-1 h-3 bg-[#FF1744] rounded-full" />
                <span>{cat.title}</span>
              </h4>

              <div className={`grid ${display.isCoverScreen ? 'grid-cols-2' : 'grid-cols-3'} gap-1.5 sm:gap-2`}>
                {visibleItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      if (item.id === 'app_permissions') {
                        window.dispatchEvent(new CustomEvent('open-permissions-modal'));
                      } else {
                        onNavigate(item.id);
                      }
                    }}
                    className="group min-h-[76px] bg-[#18181f] hover:bg-[#202029] border border-white/5 hover:border-[#FF1744]/40 rounded-xl py-2.5 px-1.5 flex flex-col items-center justify-center gap-1.5 transition-colors active:scale-95 cursor-pointer"
                    id={`btn_more_menu_${item.id}`}
                  >
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${item.bg} group-hover:scale-105 transition-transform`}>
                      <item.icon className={item.color} size={18} />
                    </div>
                    <span className="text-white font-semibold text-[11px] sm:text-xs group-hover:text-[#FF1744] transition-colors truncate max-w-full">
                      {item.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* زر تسجيل الخروج المختصر */}
      {user && (
        <button 
          onClick={handleLogout}
          className="w-full bg-red-500/10 hover:bg-red-500/15 text-[#FF1744] border border-red-500/20 py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 font-bold transition-all text-xs cursor-pointer"
          id="btn_logout_more"
        >
          <LogOut size={15} /> 
          <span>تسجيل الخروج</span>
        </button>
      )}
    </div>
  );
}
