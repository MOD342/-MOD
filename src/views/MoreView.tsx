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
  Download
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../contexts/AuthContext';
import { moderationService, isStaffEmail } from '../services/moderationService';
import { STORE_ITEMS_SORTED, getAvatarShapeClass } from '../data/storeItems';
import { getActiveNonOverlappingEvent } from '../services/arenaCalendarEngine';
import { Swords } from 'lucide-react';

interface MoreViewProps {
  onNavigate: (view: string, props?: any) => void;
}

export default function MoreView({ onNavigate }: MoreViewProps) {
  const { user, signIn, logout, userData, userRole } = useAuth();
  const isDirectStaff = isStaffEmail(user?.email);
  const [isAdmin, setIsAdmin] = useState(() => isDirectStaff || userRole === 'admin' || userRole === 'owner' || userRole === 'moderator');
  const userLevel = userData?.level || 1;

  // الحالات والتعريفات الخاصة بتطبيق الويب التقدمي وحفظ التثبيت (PWA)
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [isAlreadyInstalled, setIsAlreadyInstalled] = useState(false);

  useEffect(() => {
    // التحقق مما إذا كان الموقع قد جرى فتحه بالفعل كتطبيق منفصل مثبت مسبقاً
    if (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone) {
      setIsAlreadyInstalled(true);
    }

    // التحقق مما إذا كان الحدث موجوداً مسبقاً في كائن النافذة الكلي
    if ((window as any).deferredPrompt) {
      setDeferredPrompt((window as any).deferredPrompt);
      setIsInstallable(true);
    }

    const handlePwaInstallable = (e: any) => {
      setDeferredPrompt((window as any).deferredPrompt || e.detail);
      setIsInstallable(true);
    };

    window.addEventListener('pwa-installable', handlePwaInstallable);
    
    return () => {
      window.removeEventListener('pwa-installable', handlePwaInstallable);
    };
  }, []);

  const handleInstallClick = async () => {
    const promptEvent = (window as any).deferredPrompt || deferredPrompt;
    if (promptEvent) {
      promptEvent.prompt();
      const { outcome } = await promptEvent.userChoice;
      console.log(`PWA Installation outcome: ${outcome}`);
      if (outcome === 'accepted') {
        (window as any).deferredPrompt = null;
        setDeferredPrompt(null);
        setIsInstallable(false);
        setIsAlreadyInstalled(true);
        setShowInstallModal(false);
      }
    } else {
      setShowInstallModal(true);
    }
  };

  const isIOS = useMemo(() => {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) || 
           (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }, []);

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

  // تصنيفات مرتبة ومنسقة بأسماء مختصرة (كلمة أو كلمتين كحد أقصى) بدون فراغات
  const categories = [
    {
      title: 'حسابي',
      items: [
        { id: 'profile', label: 'ملفي', icon: UserCircle, color: 'text-sky-400', bg: 'bg-sky-500/10' },
        { id: 'account_settings', label: 'الأمان', icon: Lock, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
        { id: 'favorites', label: 'المفضلة', icon: Heart, color: 'text-rose-400', bg: 'bg-rose-500/10' },
        { id: 'notifications', label: 'الإشعارات', icon: Bell, color: 'text-indigo-400', bg: 'bg-indigo-500/10' },
        { id: 'rewards', label: 'المكافآت', icon: Gift, color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
        { id: 'level_perks', label: 'الامتيازات', icon: Zap, color: 'text-amber-400', bg: 'bg-amber-500/10' },
      ]
    },
    {
      title: 'الترفيه والمتجر',
      items: [
        { id: 'games', label: 'الألعاب', icon: Gamepad2, color: 'text-purple-400', bg: 'bg-purple-500/10' },
        { id: 'tournaments', label: 'البطولات', icon: Trophy, color: 'text-red-400', bg: 'bg-red-500/10' },
        { id: 'leaderboard', label: 'المتصدرون', icon: Crown, color: 'text-yellow-500', bg: 'bg-yellow-500/10' },
        { id: 'suggestions_hub', label: 'الساحة', icon: Sparkles, color: 'text-pink-400', bg: 'bg-pink-500/10' },
        { id: 'store', label: 'المتجر', icon: ShoppingCart, color: 'text-orange-400', bg: 'bg-orange-500/10' },
        { id: 'schedule', label: 'المواعيد', icon: CalendarDays, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
      ]
    },
    {
      title: 'النظام والدعم',
      items: [
        { id: 'support_help', label: 'الدعم', icon: HelpCircle, color: 'text-red-400', bg: 'bg-[#FF1744]/15' },
        { id: 'diagnostics', label: 'الشبكة', icon: LayoutGrid, color: 'text-amber-400', bg: 'bg-amber-500/10' },
        { id: 'pwa_install', label: 'تثبيت التطبيق', icon: Smartphone, color: 'text-violet-400', bg: 'bg-violet-500/10' },
        ...(isAdmin || isDirectStaff || isStaffEmail(user?.email) || userRole === 'admin' || userRole === 'owner' || userRole === 'moderator'
          ? [{ id: 'admin', label: 'الإدارة', icon: Shield, color: 'text-red-500', bg: 'bg-red-500/10' }]
          : [])
      ]
    }
  ];

  return (
    <div className="pb-24 pt-4 px-3.5 md:px-6 space-y-4 max-w-3xl mx-auto font-sans text-right" dir="rtl" id="container_more_view">
      
      {/* شريط عنوان مدمج وأنيق */}
      <div className="flex items-center justify-between border-b border-white/5 pb-3">
        <div className="flex items-center gap-2">
          <LayoutGrid className="text-[#FF1744]" size={20} />
          <h1 className="text-lg font-black text-white">المزيد</h1>
        </div>
        {!isAlreadyInstalled && (
          <button
            onClick={() => setShowInstallModal(true)}
            className="flex items-center gap-1.5 bg-[#FF1744]/15 hover:bg-[#FF1744]/25 border border-[#FF1744]/30 text-[#FF1744] px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer"
            id="btn_trigger_pwa_banner"
          >
            <Download size={13} />
            <span>تثبيت التطبيق</span>
          </button>
        )}
      </div>
      
      {/* بطاقة الحساب المدمجة */}
      <AnimatePresence mode="wait">
        {user ? (
          <motion.div 
            key="logged_in_card"
            initial={{ opacity: 0, y: 8 }} 
            animate={{ opacity: 1, y: 0 }} 
            exit={{ opacity: 0, y: -8 }}
            className="bg-[#111115] border border-white/5 rounded-2xl p-3.5 flex flex-col gap-3 shadow-lg"
            id="user_authenticated_profile"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                {/* الصورة الشخصية */}
                <div className="relative shrink-0">
                  {equipped.frame ? (
                    <div className={`p-1 ${equipped.frame.frameStyle} ${getAvatarShapeClass(equipped.frame.avatarShape)} relative flex items-center justify-center overflow-hidden w-14 h-14 bg-black`}>
                      <img 
                        src={avatarImg} 
                        className={`w-full h-full object-cover ${getAvatarShapeClass(equipped.frame.avatarShape)}`} 
                        referrerPolicy="no-referrer"
                        alt="" 
                      />
                    </div>
                  ) : (
                    <div className="w-14 h-14 rounded-full ring-2 ring-neutral-800 bg-black overflow-hidden flex items-center justify-center p-0.5">
                      <img 
                        src={avatarImg} 
                        className="w-full h-full object-cover rounded-full" 
                        referrerPolicy="no-referrer"
                        alt="" 
                      />
                    </div>
                  )}
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
              onClick={signIn} 
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
        className={`w-full bg-gradient-to-r ${activeArenaEvent.bannerGradient} border border-white/10 hover:border-[#FF1744]/50 rounded-2xl p-3.5 flex items-center justify-between gap-3 text-right transition-all active:scale-[0.99] cursor-pointer shadow-lg`}
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
      <div className="space-y-4">
        {categories.map((cat, catIdx) => {
          const visibleItems = cat.items.filter((item) => {
            const requiresLogin = ['profile', 'account_settings', 'games', 'leaderboard', 'store', 'admin', 'tournaments', 'notifications', 'rewards', 'level_perks'].includes(item.id);
            return Boolean(user || !requiresLogin);
          });

          if (visibleItems.length === 0) return null;

          return (
            <div key={catIdx} className="bg-[#111115] border border-white/5 rounded-2xl p-3 space-y-2.5">
              <h4 className="text-xs font-bold text-neutral-400 flex items-center gap-1.5 px-1 select-none">
                <span className="w-1 h-3 bg-[#FF1744] rounded-full" />
                <span>{cat.title}</span>
              </h4>

              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                {visibleItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      if (item.id === 'pwa_install') {
                        setShowInstallModal(true);
                      } else if (item.id === 'account_settings') {
                        onNavigate('profile', { openSettingsInitially: true });
                      } else {
                        onNavigate(item.id);
                      }
                    }}
                    className="group bg-[#18181f] hover:bg-[#202029] border border-white/5 hover:border-[#FF1744]/40 rounded-xl py-2.5 px-2 flex flex-col items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                    id={`btn_more_menu_${item.id}`}
                  >
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${item.bg} group-hover:scale-105 transition-transform`}>
                      <item.icon className={item.color} size={18} />
                    </div>
                    <span className="text-white font-semibold text-xs group-hover:text-[#FF1744] transition-colors truncate max-w-full">
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

      {/* PWA Installation Modal */}
      <AnimatePresence>
        {showInstallModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 font-sans" id="pwa_install_modal_wrapper">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowInstallModal(false)}
              className="absolute inset-0 bg-black/85 backdrop-blur-md"
              id="pwa_install_modal_backdrop"
            />

            {/* Modal Box */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-[#0a0a0c] border border-neutral-800 rounded-3xl p-6 shadow-2xl overflow-hidden text-right z-10"
              id="pwa_install_modal_box"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-red-600/5 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute bottom-0 left-0 w-32 h-32 bg-indigo-600/5 rounded-full blur-3xl pointer-events-none" />

              {/* Close Button */}
              <button
                onClick={() => setShowInstallModal(false)}
                className="absolute top-4 left-4 w-8 h-8 rounded-full bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white flex items-center justify-center transition cursor-pointer font-bold text-xs"
              >
                ✕
              </button>

              <div className="flex flex-col items-center text-center gap-4 mb-6">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-[#FF1744]/15 to-red-600/5 border border-[#FF1744]/20 flex items-center justify-center p-0.5 shadow-lg">
                  <img src="/app_icon.png" className="w-14 h-14 rounded-xl object-cover" alt="أنمي MOD" referrerPolicy="no-referrer" />
                </div>
                <div>
                  <h3 className="text-white font-black text-lg">تثبيت منصة أنمي MOD</h3>
                  <p className="text-xs text-neutral-400 font-sans mt-0.5">تطبيق فوري فائق الخفة - بدون تكلفة وبدون متجر تطبيقات</p>
                </div>
              </div>

              {isInstallable ? (
                /* Native PWA Prompt available (Android Chrome, PC Edge/Chrome, etc.) */
                <div className="space-y-4" id="native_prompt_layout">
                  <p className="text-xs text-neutral-300 leading-relaxed text-right font-sans">
                    متصفحك الحالي يدعم التثبيت الفوري بنقرة واحدة كاختصار مستقل على شاشتك بمظهر التطبيق الرسمي وبدون استهلاك للإنترنت بعد التنزيل.
                  </p>
                  
                  <button
                    onClick={handleInstallClick}
                    className="w-full bg-gradient-to-r from-[#FF1744] to-red-600 hover:scale-[1.02] active:scale-98 text-white font-black py-3 rounded-2xl text-xs transition shadow-[0_4px_25px_rgba(255,23,68,0.35)] flex items-center justify-center gap-2 cursor-pointer mt-2"
                  >
                    <Download size={16} />
                    <span>ابدأ التثبيت التلقائي المباشر 🚀</span>
                  </button>
                </div>
              ) : isIOS ? (
                /* iOS Safari instructions */
                <div className="space-y-5" id="ios_safari_instructions">
                  <p className="text-xs text-[#FF1744] font-black border border-[#FF1744]/20 bg-[#FF1744]/5 p-3 rounded-xl leading-relaxed text-right font-sans">
                    لأنك تستخدم متصفح Safari على نظام iOS، اتبع الإرشادات السريعة التالية لتثبيت منصة أنمي MOD:
                  </p>

                  <div className="space-y-3.5 pr-2.5 border-r border-neutral-900">
                    <div className="flex gap-3 text-right">
                      <span className="w-5 h-5 rounded-full bg-neutral-900 border border-neutral-800 text-[#FF1744] text-[10px] font-black flex items-center justify-center shrink-0">١</span>
                      <p className="text-xs text-neutral-300 font-sans leading-relaxed flex-1">
                        اضغط على زر المشاركة <span className="inline-flex bg-neutral-900 px-1.5 py-0.5 rounded-md text-white border border-neutral-800 mx-0.5 text-[10px]">📤 مشاركة / Share</span> الموجود في متصفح Safari بالأسفل.
                      </p>
                    </div>

                    <div className="flex gap-3 text-right">
                      <span className="w-5 h-5 rounded-full bg-neutral-900 border border-neutral-800 text-[#FF1744] text-[10px] font-black flex items-center justify-center shrink-0">٢</span>
                      <p className="text-xs text-neutral-400 font-sans leading-relaxed flex-1">
                        قم بالتمرير للأسفل في القائمة ثم اضغط على خيار <span className="text-white font-black">"إضافة إلى الشاشة الرئيسية"</span> أو <span className="font-mono text-white text-[10px] bg-neutral-950 px-1 py-0.5 rounded border border-neutral-850">Add to Home Screen ➕</span>.
                      </p>
                    </div>

                    <div className="flex gap-3 text-right">
                      <span className="w-5 h-5 rounded-full bg-neutral-900 border border-neutral-800 text-[#FF1744] text-[10px] font-black flex items-center justify-center shrink-0">٣</span>
                      <p className="text-xs text-neutral-400 font-sans leading-relaxed flex-1">
                        اكتب الاسم "أنمي MOD" ثم اضغط على زر <span className="text-[#FF1744] font-black">"إضافة"</span> أو <span className="text-[#FF1744] font-black">Add</span> بالزاوية العلوية اليسرى.
                      </p>
                    </div>
                  </div>

                  <p className="text-[10px] text-neutral-500 text-center font-sans mt-3">
                    بمجرد الإضافة، ستظهر أيقونة التطبيق على شاشتك الرئيسية بجانب تطبيقاتك وسيتصرف كتطبيق فوري بالكامل!
                  </p>
                </div>
              ) : (
                /* General manual guidance */
                <div className="space-y-5" id="generic_manual_guidance">
                  <p className="text-xs text-neutral-300 leading-relaxed text-right font-sans">
                    لتثبيت منصة الأنمي كاختصار مستقل على جهازك بدون متجر للتطبيقات، يرجى القيام بالتالي:
                  </p>

                  <div className="space-y-3.5 pr-2.5 border-r border-neutral-900">
                    <div className="flex gap-3 text-right">
                      <span className="w-5 h-5 rounded-full bg-neutral-900 border border-neutral-800 text-[#FF1744] text-[10px] font-black flex items-center justify-center shrink-0">١</span>
                      <p className="text-xs text-neutral-300 font-sans leading-relaxed flex-1">
                        اضغط على قائمة خيارات المتصفح ثلاثية النقاط <span className="font-black text-white">⋮</span> أو <span className="font-black text-white">☰</span> بالزاوية.
                      </p>
                    </div>

                    <div className="flex gap-3 text-right">
                      <span className="w-5 h-5 rounded-full bg-neutral-900 border border-neutral-800 text-[#FF1744] text-[10px] font-black flex items-center justify-center shrink-0">٢</span>
                      <p className="text-xs text-neutral-400 font-sans leading-relaxed flex-1">
                        ابحث واضغط على خيار <span className="text-white font-black">"تثبيت التطبيق"</span> أو <span className="text-white font-black">"إضافة للشاشة الرئيسية"</span>.
                      </p>
                    </div>

                    <div className="flex gap-3 text-right">
                      <span className="w-5 h-5 rounded-full bg-neutral-900 border border-neutral-800 text-[#FF1744] text-[10px] font-black flex items-center justify-center shrink-0">٣</span>
                      <p className="text-xs text-neutral-400 font-sans leading-relaxed flex-1">
                        أكّد الرغبة بالضغط على <span className="text-emerald-400 font-black">تثبيت / إضافة</span> وسيتم إضافته فوراً!
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <button
                onClick={() => setShowInstallModal(false)}
                className="w-full mt-6 bg-neutral-900 hover:bg-neutral-850 border border-neutral-800 text-neutral-400 hover:text-white font-black py-2.5 rounded-xl text-xs transition cursor-pointer text-center"
              >
                تحديث / إغلاق
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
