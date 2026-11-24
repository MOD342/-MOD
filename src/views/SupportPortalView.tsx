import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ChevronRight,
  HelpCircle,
  MessageSquare,
  Send,
  CreditCard,
  Users,
  ExternalLink,
  CheckCircle2,
  Play,
  Tv,
  Coins,
  Gift,
  Clock,
  AlertTriangle,
  Copy,
  Check,
  Ticket,
  KeyRound,
  Sparkles,
  ChevronDown,
  ShieldCheck,
  HeartHandshake,
  Lightbulb,
  Bug,
  Film,
  UserCheck,
  Trash2,
  MessageCircle,
  Zap,
  PlayCircle
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import {
  doc,
  getDoc,
  collection,
  addDoc,
  serverTimestamp,
  query,
  where,
  onSnapshot,
  deleteDoc
} from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../firebaseUtils';
import { moderationService } from '../services/moderationService';
import { openExternalUrl } from '../utils/externalNavigation';
import { useDeviceDisplay } from '../hooks/useDeviceDisplay';
import RewardedVideoAdModal, { MonetizationConfig } from '../components/RewardedVideoAdModal';

interface SupportPortalViewProps {
  onBack: () => void;
  initialTab?: 'ad_support' | 'help' | 'suggestions' | 'donate' | 'chat' | 'news' | 'tickets' | 'rewards';
}

const TICKET_CATEGORIES = [
  { id: 'حلقة لا تعمل / سيرفر معطل', label: 'حلقة لا تعمل', icon: Film, type: 'complaint' as const },
  { id: 'طلب توفير أنمي أو حلقة', label: 'طلب أنمي', icon: Tv, type: 'suggestion' as const },
  { id: 'مشكلة في الحساب أو الكوينز', label: 'الحساب والكوينز', icon: UserCheck, type: 'complaint' as const },
  { id: 'خلل فني في التطبيق', label: 'خلل فني', icon: Bug, type: 'complaint' as const },
  { id: 'اقتراح فكرة أو ميزة جديدة', label: 'اقتراح تطوير', icon: Lightbulb, type: 'suggestion' as const }
];

const FAQ_ITEMS = [
  {
    q: 'ما فكرة زر «ادعم التطبيق» وكيف يختلف عن الإعلانات المزعجة؟',
    a: 'في الكثير من التطبيقات تظهر لك إعلانات فيديو مدتها 30 ثانية فجأة أثناء التصفح أو المشاهدة دون استئذان. هنا الأمر مختلف تماماً: لن يظهر لك أي إعلان مفاجئ أثناء المشاهدة، وبالمقابل يمكنك باختيارك الضغط على «ادعم التطبيق» لمشاهدة إعلان فيديو مدته 30 ثانية مع زر إغلاق واضح والحصول على كوينز وخبرة فورية.'
  },
  {
    q: 'هل يمكنني إغلاق إعلان «ادعم التطبيق» في أي وقت؟',
    a: 'نعم، زر الإغلاق متاح دائماً أعلى شاشة الإعلان. إذا أغلقت الإعلان قبل انتهاء الـ 30 ثانية فلن يتم احتساب المكافأة، وبعد اكتمال العداد يتم إضافة الكوينز والخبرة مباشرة ويمكنك إغلاق النافذة بضغطة واحدة.'
  },
  {
    q: 'كيف أكسب الكوينز ونقاط الخبرة (XP) مجاناً؟',
    a: 'يمكنك كسب الكوينز والـ XP من خلال زر «ادعم التطبيق» ومكافأة السلسلة كل 5 إعلانات، أو المشاركة في حلبة الأوتاكو، أو استرداد أكواد الهدايا التي ينشرها المشرفون.'
  },
  {
    q: 'ماذا أفعل إذا واجهت حلقة لا تعمل أو سيرفر متوقف؟',
    a: 'جرب أولاً التبديل إلى سيرفر آخر من قائمة السيرفرات أعلى المشغل. إذا استمرت المشكلة، افتح تبويب «التذاكر والمقترحات» واختر «حلقة لا تعمل» مع ذكر اسم الأنمي ورقم الحلقة ليتم إصلاحها.'
  },
  {
    q: 'أين أجد الرد على تذكرتي أو مقترحي؟',
    a: 'يصل رد الإدارة كإشعار فوري في حسابك، كما يظهر مسجلاً بشكل دائم أسفل قائمة «تذاكري السابقة» داخل تبويب التذاكر.'
  }
];

export default function SupportPortalView({ onBack, initialTab = 'tickets' }: SupportPortalViewProps) {
  const { user, userData } = useAuth();
  const display = useDeviceDisplay();

  const getMappedTab = (tab?: string): 'tickets' | 'rewards' | 'channels' => {
    if (tab === 'ad_support' || tab === 'rewards') return 'rewards';
    if (tab === 'help' || tab === 'donate' || tab === 'chat') return 'channels';
    return 'tickets';
  };

  const [activeTab, setActiveTab] = useState<'tickets' | 'rewards' | 'channels'>(() => getMappedTab(initialTab));

  useEffect(() => {
    setActiveTab(getMappedTab(initialTab));
  }, [initialTab]);

  // Dynamic Telegram URLs fetched from DB
  const [helpTelegramUrl, setHelpTelegramUrl] = useState('https://t.me/otaku_help_support');
  const [groupTelegramUrl, setGroupTelegramUrl] = useState('https://t.me/otaku_group_chat');
  const [donateTelegramUrl, setDonateTelegramUrl] = useState('https://t.me/otaku_owner');

  // Copy UID state
  const [copiedUid, setCopiedUid] = useState(false);

  // Ticket submission state
  const [selectedCategory, setSelectedCategory] = useState(TICKET_CATEGORIES[0]);
  const [ticketSubject, setTicketSubject] = useState('');
  const [ticketMessage, setTicketMessage] = useState('');
  const [isSubmittingTicket, setIsSubmittingTicket] = useState(false);
  const [ticketSuccess, setTicketSuccess] = useState(false);
  const [ticketError, setTicketError] = useState<string | null>(null);

  // User's live tickets from Firestore
  const [myTickets, setMyTickets] = useState<any[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [ticketFilter, setTicketFilter] = useState<'all' | 'pending' | 'replied'>('all');
  const [confirmDeleteTicketId, setConfirmDeleteTicketId] = useState<string | null>(null);

  // Promo code redemption state
  const [promoInput, setPromoInput] = useState('');
  const [isRedeemingPromo, setIsRedeemingPromo] = useState(false);
  const [promoFeedback, setPromoFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // FAQ accordion state
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  // OPT-IN 30s VIDEO AD SUPPORT STATE
  const todayDateStr = new Date().toISOString().split('T')[0];
  const storageCountKey = `ad_watches_${user?.id || 'guest'}_${todayDateStr}`;

  const [watchedToday, setWatchedToday] = useState<number>(() => {
    try {
      const stored = localStorage.getItem(storageCountKey);
      return stored ? parseInt(stored, 10) : 0;
    } catch {
      return 0;
    }
  });

  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageCountKey);
      setWatchedToday(stored ? parseInt(stored, 10) : 0);
    } catch {
      setWatchedToday(0);
    }
  }, [storageCountKey]);

  const [isVideoAdOpen, setIsVideoAdOpen] = useState(false);
  const [rewardBanner, setRewardBanner] = useState<{ coins: number; xp: number; bonusCoins?: number } | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [limitError, setLimitError] = useState(false);
  const [cooldownError, setCooldownError] = useState<number | null>(null);

  const [monetization, setMonetization] = useState<MonetizationConfig>({
    mode: 'simulation',
    directLinkUrl: '',
    backupDirectLinkUrl: '',
    videoAdUrl: '',
    vastTagUrl: '',
    admobRewardedId: '',
    scriptCode: '',
    requireClickVerification: false,
    cooldownSeconds: 20,
    stayTime: 30,
    rewardCoins: 35,
    rewardXp: 120,
    dailyLimit: 20,
    customAds: []
  });

  const DAILY_LIMIT = monetization.dailyLimit || 20;
  const STREAK_STEP = 5;
  const STREAK_BONUS_COINS = 100;
  const adDurationSeconds = Math.max(30, Number(monetization.stayTime) || 30);

  // Load settings
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const linkDoc = await getDoc(doc(db, 'globalSettings', 'telegramLinks'));
        if (linkDoc.exists()) {
          const data = linkDoc.data();
          if (data.helpTelegramUrl) setHelpTelegramUrl(data.helpTelegramUrl);
          if (data.groupTelegramUrl) setGroupTelegramUrl(data.groupTelegramUrl);
          if (data.donateTelegramUrl) setDonateTelegramUrl(data.donateTelegramUrl);
        }

        const monetizationDoc = await getDoc(doc(db, 'globalSettings', 'monetization'));
        if (monetizationDoc.exists()) {
          const data = monetizationDoc.data();
          const rawPrimary = String(data.directLinkUrl || '').trim();
          const savedPrimary = /^https:\/\//i.test(rawPrimary) ? rawPrimary : '';
          const rawSecondary = String(data.backupDirectLinkUrl || '').trim();
          const savedSecondary = /^https:\/\//i.test(rawSecondary) ? rawSecondary : '';

          setMonetization({
            mode: data.mode ?? 'simulation',
            directLinkUrl: savedPrimary,
            backupDirectLinkUrl: savedSecondary,
            videoAdUrl: data.videoAdUrl ?? '',
            vastTagUrl: data.vastTagUrl ?? '',
            admobRewardedId: data.admobRewardedId ?? '',
            scriptCode: data.scriptCode ?? '',
            requireClickVerification: data.requireClickVerification ?? false,
            cooldownSeconds: Number(data.cooldownSeconds) || 20,
            stayTime: Math.max(30, Number(data.stayTime) || 30),
            rewardCoins: Number(data.rewardCoins) || 35,
            rewardXp: Number(data.rewardXp) || 120,
            dailyLimit: Number(data.dailyLimit) || 20,
            customAds: Array.isArray(data.customAds) ? data.customAds : []
          });
        }
      } catch (err) {
        console.warn('Could not load support settings:', err);
      }
    };
    fetchSettings();
  }, []);

  // Real-time listener for user's own tickets
  useEffect(() => {
    if (!user?.id) {
      setMyTickets([]);
      return;
    }
    setLoadingTickets(true);
    const q = query(collection(db, 'suggestions'), where('userId', '==', user.id));
    const unsub = onSnapshot(
      q,
      snap => {
        const list: any[] = [];
        snap.forEach(d => list.push({ id: d.id, ...d.data() }));
        list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setMyTickets(list);
        setLoadingTickets(false);
      },
      err => {
        console.warn('Could not load user tickets:', err);
        setLoadingTickets(false);
      }
    );
    return () => unsub();
  }, [user?.id]);

  // Cooldown ticker
  useEffect(() => {
    if (cooldownError === null || cooldownError <= 0) {
      if (cooldownError !== null && cooldownError <= 0) setCooldownError(null);
      return;
    }
    const t = setTimeout(() => setCooldownError(prev => (prev && prev > 1 ? prev - 1 : null)), 1000);
    return () => clearTimeout(t);
  }, [cooldownError]);

  const handleOpenOptInAd = () => {
    if (watchedToday >= DAILY_LIMIT) {
      setLimitError(true);
      return;
    }

    const cooldownSec = monetization.cooldownSeconds || 20;
    try {
      const lastWatchTs = Number(localStorage.getItem(`last_ad_ts_${user?.id || 'guest'}`) || '0');
      const elapsedSec = Math.floor((Date.now() - lastWatchTs) / 1000);
      if (lastWatchTs > 0 && elapsedSec < cooldownSec) {
        setCooldownError(cooldownSec - elapsedSec);
        return;
      }
    } catch {}

    setLimitError(false);
    setCooldownError(null);
    setRewardBanner(null);
    setIsVideoAdOpen(true);
  };

  const handleAdRewardEarned = useCallback(async () => {
    const newCount = watchedToday + 1;
    setWatchedToday(newCount);

    const isStreakMilestone = newCount > 0 && newCount % STREAK_STEP === 0;
    const bonusCoins = isStreakMilestone ? STREAK_BONUS_COINS : 0;
    const baseCoins = monetization.rewardCoins || 35;
    const totalCoinsReward = baseCoins + bonusCoins;
    const xpReward = monetization.rewardXp || 120;

    setRewardBanner({ coins: totalCoinsReward, xp: xpReward, bonusCoins });

    try {
      localStorage.setItem(storageCountKey, newCount.toString());
      localStorage.setItem(`last_ad_ts_${user?.id || 'guest'}`, Date.now().toString());
    } catch {}

    setIsSyncing(true);
    try {
      const { updateDoc, setDoc, increment } = await import('firebase/firestore');
      if (user?.id) {
        await updateDoc(doc(db, 'users', user.id), {
          coins: increment(totalCoinsReward),
          xp: increment(xpReward)
        });
      }

      const statsRef = doc(db, 'globalSettings', 'adStats');
      await setDoc(
        statsRef,
        {
          totalViews: increment(1),
          totalCoinsDistributed: increment(totalCoinsReward),
          totalXpDistributed: increment(xpReward),
          [`dailyViews.${todayDateStr}`]: increment(1),
          lastViewAt: new Date().toISOString()
        },
        { merge: true }
      ).catch(() => {});
    } catch (err) {
      console.error('Firestore coins reward fail:', err);
    } finally {
      setIsSyncing(false);
    }
  }, [watchedToday, monetization.rewardCoins, monetization.rewardXp, storageCountKey, todayDateStr, user?.id]);

  const handleCopyUid = () => {
    if (!user?.id) return;
    navigator.clipboard.writeText(user.id);
    setCopiedUid(true);
    setTimeout(() => setCopiedUid(false), 2500);
  };

  const handleSendTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketMessage.trim()) return;

    setIsSubmittingTicket(true);
    setTicketError(null);
    try {
      const cleanSubject = ticketSubject.trim();
      const formattedMessage = cleanSubject
        ? `[${selectedCategory.label}] ${cleanSubject}\n${ticketMessage.trim()}`
        : `[${selectedCategory.label}] ${ticketMessage.trim()}`;

      await addDoc(collection(db, 'suggestions'), {
        userId: user?.id || 'guest_user',
        email: user?.email || 'unregistered@user.com',
        displayName: userData?.displayName || user?.displayName || 'زائر',
        type: selectedCategory.type,
        category: selectedCategory.label,
        subject: cleanSubject || selectedCategory.label,
        message: formattedMessage.slice(0, 4900),
        createdAt: serverTimestamp(),
        status: 'pending'
      });

      setTicketSuccess(true);
      setTicketSubject('');
      setTicketMessage('');
      setTimeout(() => setTicketSuccess(false), 4500);
    } catch (err) {
      console.error('Failed to send support ticket:', err);
      setTicketError('تعذر إرسال التذكرة حالياً، يرجى التحقق من الاتصال والمحاولة مجدداً.');
      handleFirestoreError(err, OperationType.WRITE, 'suggestions');
    } finally {
      setIsSubmittingTicket(false);
    }
  };

  const handleConfirmDeleteTicket = async (ticketId: string) => {
    try {
      await deleteDoc(doc(db, 'suggestions', ticketId));
      setConfirmDeleteTicketId(null);
    } catch (err) {
      console.warn('Could not delete ticket:', err);
    }
  };

  const handleRedeemPromo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!promoInput.trim()) return;
    if (!user?.id) {
      setPromoFeedback({
        type: 'error',
        message: 'يرجى تسجيل الدخول أولاً لاسترداد الأكواد وإضافة المكافآت لحسابك.'
      });
      return;
    }

    setIsRedeemingPromo(true);
    setPromoFeedback(null);
    try {
      const res = await moderationService.redeemPromoCode(user.id, promoInput);
      setPromoFeedback({
        type: 'success',
        message: `تم تفعيل الكود بنجاح! حصلت على +${res.rewardCoins} كوينز و +${res.rewardXp} XP.`
      });
      setPromoInput('');
    } catch (err: any) {
      setPromoFeedback({
        type: 'error',
        message: err?.message || 'الكود غير صالح أو منتهي الصلاحية.'
      });
    } finally {
      setIsRedeemingPromo(false);
    }
  };

  const filteredTickets = useMemo(() => {
    if (ticketFilter === 'all') return myTickets;
    if (ticketFilter === 'replied') {
      return myTickets.filter(t => t.status === 'replied' || t.status === 'resolved' || Boolean(t.adminReply));
    }
    return myTickets.filter(t => t.status !== 'replied' && t.status !== 'resolved' && !t.adminReply);
  }, [myTickets, ticketFilter]);

  const repliedTicketsCount = useMemo(
    () => myTickets.filter(t => t.status === 'replied' || Boolean(t.adminReply)).length,
    [myTickets]
  );

  return (
    <div
      className={`pb-24 pt-4 ${display.isCoverScreen ? 'px-3' : 'px-4 md:px-6'} max-w-6xl mx-auto font-sans text-right min-h-screen space-y-5`}
      dir="rtl"
      id="support_portal_screen"
    >
      {/* Top Header Bar */}
      <div className="bg-[#111115] border border-white/5 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-2xl bg-[#FF1744]/15 border border-[#FF1744]/30 text-[#FF1744] flex items-center justify-center shrink-0">
            <ShieldCheck size={22} />
          </div>
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-black text-white truncate">مركز الدعم والمساندة</h1>
            <p className="text-xs text-zinc-400 truncate">
              دعم التطبيق باختيارك، التذاكر المباشرة، وقنوات المساعدة
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-2">
          {user?.id && (
            <button
              type="button"
              onClick={handleCopyUid}
              className="min-h-[44px] flex items-center gap-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 px-3 rounded-xl text-xs font-bold transition cursor-pointer"
              title="نسخ معرّف حسابك للدعم السريع"
            >
              {copiedUid ? (
                <>
                  <Check size={14} className="text-emerald-400" />
                  <span className="text-emerald-400">تم النسخ</span>
                </>
              ) : (
                <>
                  <Copy size={14} className="text-zinc-400" />
                  <span className="tabular-nums">المعرّف: {user.id.slice(0, 6)}</span>
                </>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={onBack}
            className="min-h-[44px] flex items-center gap-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 font-bold px-4 rounded-xl border border-zinc-800 transition text-xs cursor-pointer shrink-0"
          >
            <span>رجوع</span>
            <ChevronRight size={15} />
          </button>
        </div>
      </div>

      {/* PRIMARY OPT-IN "ادعم التطبيق" HERO CARD */}
      <section
        className="bg-gradient-to-l from-[#1c1317] via-[#121218] to-[#111115] border border-[#FF1744]/25 rounded-2xl p-4 sm:p-5 shadow-lg"
        id="support_app_hero_card"
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-2 max-w-2xl">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-400">
              <HeartHandshake size={16} />
              <span>دعم اختياري بدون إزعاج</span>
              <span className="text-zinc-600">·</span>
              <span className="text-zinc-300 tabular-nums">{adDurationSeconds} ثانية</span>
              <span className="text-zinc-600">·</span>
              <span className="text-emerald-400 tabular-nums">+{monetization.rewardCoins} كوينز</span>
            </div>

            <h2 className="text-base sm:text-xl font-black text-white leading-snug">
              ادعم استمرار التطبيق بمشاهدة إعلان فيديو باختيارك
            </h2>

            <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
              لن تظهر لك إعلانات الـ 30 ثانية المفاجئة أثناء تصفحك أو مشاهدتك للأنمي. هنا أنت من يختار تشغيل الإعلان لدعم الخوادم مقابل مكافأة فورية، مع زر إغلاق واضح في أي لحظة.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row lg:flex-col items-stretch sm:items-center lg:items-end gap-2.5 shrink-0">
            <button
              type="button"
              onClick={handleOpenOptInAd}
              disabled={watchedToday >= DAILY_LIMIT || (cooldownError !== null && cooldownError > 0)}
              className="min-h-[48px] px-6 bg-gradient-to-r from-[#FF1744] to-rose-600 hover:from-red-500 hover:to-rose-500 disabled:opacity-45 text-white font-black text-sm rounded-xl shadow-lg shadow-[#FF1744]/20 transition flex items-center justify-center gap-2.5 cursor-pointer"
              id="btn_support_app_watch_ad"
            >
              <PlayCircle size={19} />
              <span>
                {cooldownError !== null && cooldownError > 0
                  ? `انتظر ${cooldownError} ثانية...`
                  : watchedToday >= DAILY_LIMIT
                  ? 'اكتمل الحد اليومي'
                  : `ادعم التطبيق · إعلان ${adDurationSeconds}ث`}
              </span>
            </button>

            <div className="flex items-center justify-center lg:justify-end gap-3 text-[11px] text-zinc-400 font-bold tabular-nums">
              <span>اليوم: {watchedToday} / {DAILY_LIMIT}</span>
              <span className="text-zinc-600">·</span>
              <span className="text-sky-400">+{monetization.rewardXp} XP</span>
            </div>
          </div>
        </div>

        {/* Inline feedback alerts right below Hero CTA if needed */}
        {(limitError || (cooldownError !== null && cooldownError > 0) || rewardBanner) && (
          <div className="mt-4 pt-3.5 border-t border-white/10 space-y-2">
            {limitError && (
              <div className="bg-rose-500/10 border border-rose-500/25 text-rose-300 px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2">
                <AlertTriangle size={15} className="shrink-0" />
                <span>وصلت للحد اليومي ({DAILY_LIMIT} إعلاناً). شكراً لدعمك الكبير اليوم!</span>
              </div>
            )}

            {cooldownError !== null && cooldownError > 0 && (
              <div className="bg-amber-500/10 border border-amber-500/25 text-amber-300 px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 tabular-nums">
                <Clock size={15} className="shrink-0" />
                <span>يرجى الانتظار {cooldownError} ثانية قبل تشغيل الإعلان التالي لحماية مكافأتك.</span>
              </div>
            )}

            {rewardBanner && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 px-4 py-3 rounded-xl text-xs font-bold flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                  <span>
                    شكراً لدعمك! تمت إضافة <strong className="text-amber-300">+{rewardBanner.coins} كوينز</strong> و{' '}
                    <strong className="text-sky-300">+{rewardBanner.xp} XP</strong> لحسابك
                    {rewardBanner.bonusCoins ? ` (تشمل مكافأة سلسلة +${rewardBanner.bonusCoins})` : ''}.
                  </span>
                </div>
                {isSyncing && <span className="text-[11px] text-zinc-400">جاري المزامنة...</span>}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Main Segmented Workspace Tabs (>= 44px height) */}
      <div
        className={`grid ${display.isCoverScreen ? 'grid-cols-1' : 'grid-cols-3'} gap-2 bg-[#111115] p-1.5 rounded-2xl border border-white/5`}
        id="support_tabs_bar"
      >
        <button
          type="button"
          onClick={() => setActiveTab('tickets')}
          className={`min-h-[44px] px-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 cursor-pointer ${
            activeTab === 'tickets'
              ? 'bg-[#FF1744] text-white shadow-lg shadow-[#FF1744]/20'
              : 'text-zinc-400 hover:text-white hover:bg-zinc-900/70'
          }`}
        >
          <Ticket size={15} />
          <span>التذاكر والمقترحات</span>
          {repliedTicketsCount > 0 && (
            <span className="font-mono text-[11px] tabular-nums opacity-90">
              ({repliedTicketsCount})
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('rewards')}
          className={`min-h-[44px] px-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 cursor-pointer ${
            activeTab === 'rewards'
              ? 'bg-[#FF1744] text-white shadow-lg shadow-[#FF1744]/20'
              : 'text-zinc-400 hover:text-white hover:bg-zinc-900/70'
          }`}
        >
          <Gift size={15} />
          <span>الإعلانات والأكواد</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('channels')}
          className={`min-h-[44px] px-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 cursor-pointer ${
            activeTab === 'channels'
              ? 'bg-[#FF1744] text-white shadow-lg shadow-[#FF1744]/20'
              : 'text-zinc-400 hover:text-white hover:bg-zinc-900/70'
          }`}
        >
          <HelpCircle size={15} />
          <span>التواصل والأسئلة</span>
        </button>
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        {/* ============================================================
            TAB 1: TICKETS & SUGGESTIONS (Adaptive 2-column on desktop/foldables)
           ============================================================ */}
        {activeTab === 'tickets' && (
          <motion.div
            key="tickets_tab"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className={`grid grid-cols-1 ${display.isBookPosture || display.isWideOrUnfolded ? 'lg:grid-cols-12' : ''} gap-5 items-start`}
            style={display.isBookPosture ? { gap: 'var(--fold-hinge-gap, 24px)' } : undefined}
          >
            {/* Create New Ticket Card */}
            <div className={`${display.isBookPosture || display.isWideOrUnfolded ? 'lg:col-span-6' : ''} bg-[#111115] border border-white/5 rounded-2xl p-4 sm:p-5 space-y-4`}>
              <div className="flex items-center justify-between border-b border-white/5 pb-3">
                <div className="flex items-center gap-2">
                  <MessageSquare size={16} className="text-[#FF1744]" />
                  <h2 className="text-sm font-black text-white">فتح تذكرة دعم أو مقترح</h2>
                </div>
                <span className="text-[11px] text-zinc-400 font-bold">رد مباشر من الإدارة</span>
              </div>

              {/* Category Selection */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-300 block">نوع الطلب</label>
                <div className={`grid ${display.isCoverScreen ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'} gap-2`}>
                  {TICKET_CATEGORIES.map(cat => {
                    const Icon = cat.icon;
                    const isSelected = selectedCategory.id === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setSelectedCategory(cat)}
                        className={`min-h-[46px] p-2.5 rounded-xl border text-right transition flex items-center gap-2 cursor-pointer ${
                          isSelected
                            ? 'bg-[#FF1744]/15 border-[#FF1744] text-white'
                            : 'bg-zinc-900/60 border-zinc-800/80 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                        }`}
                      >
                        <Icon size={15} className={isSelected ? 'text-[#FF1744] shrink-0' : 'text-zinc-500 shrink-0'} />
                        <span className="text-xs font-black leading-tight truncate">{cat.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <form onSubmit={handleSendTicket} className="space-y-3.5">
                <div>
                  <label className="text-xs font-bold text-zinc-300 block mb-1.5">
                    العنوان المختصر
                  </label>
                  <input
                    type="text"
                    value={ticketSubject}
                    onChange={e => setTicketSubject(e.target.value)}
                    maxLength={120}
                    placeholder={
                      selectedCategory.label === 'حلقة لا تعمل'
                        ? 'مثال: One Piece الحلقة 1120 السيرفر الأول'
                        : selectedCategory.label === 'طلب أنمي'
                        ? 'مثال: طلب توفير أنمي Solo Leveling'
                        : 'اكتب عنواناً مختصراً لطلبك...'
                    }
                    className="w-full min-h-[44px] bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#FF1744] transition"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-zinc-300 block mb-1.5">التفاصيل</label>
                  <textarea
                    rows={4}
                    value={ticketMessage}
                    onChange={e => setTicketMessage(e.target.value)}
                    maxLength={2500}
                    required
                    placeholder="اشرح المشكلة أو الفكرة بوضوح ليتمكن فريق الإشراف من مساعدتك..."
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#FF1744] transition leading-relaxed"
                  />
                </div>

                {ticketError && (
                  <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2">
                    <AlertTriangle size={14} />
                    <span>{ticketError}</span>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <AnimatePresence>
                    {ticketSuccess ? (
                      <motion.div
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0 }}
                        className="text-emerald-400 font-bold text-xs flex items-center gap-1.5"
                      >
                        <CheckCircle2 size={15} />
                        <span>تم إرسال تذكرتك بنجاح!</span>
                      </motion.div>
                    ) : (
                      <span className="text-[11px] text-zinc-500">
                        {user
                          ? 'سيصلك إشعار فوري عند رد الإدارة.'
                          : 'سجل دخولك لمتابعة حالة تذاكرك.'}
                      </span>
                    )}
                  </AnimatePresence>

                  <button
                    type="submit"
                    disabled={isSubmittingTicket || !ticketMessage.trim()}
                    className="min-h-[44px] mr-auto px-6 bg-[#FF1744] hover:bg-red-600 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-black text-xs rounded-xl transition flex items-center gap-2 cursor-pointer shadow-lg shadow-[#FF1744]/15"
                  >
                    {isSubmittingTicket ? (
                      <span>جاري الإرسال...</span>
                    ) : (
                      <>
                        <Send size={14} className="transform rotate-180" />
                        <span>إرسال التذكرة</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>

            {/* User's Ticket History & Admin Replies */}
            <div className={`${display.isBookPosture || display.isWideOrUnfolded ? 'lg:col-span-6' : ''} bg-[#111115] border border-white/5 rounded-2xl p-4 sm:p-5 space-y-4`}>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 pb-3">
                <div className="flex items-center gap-2">
                  <Ticket size={16} className="text-sky-400" />
                  <h3 className="text-sm font-black text-white">تذاكري السابقة</h3>
                  <span className="text-xs text-zinc-400 font-mono tabular-nums">({myTickets.length})</span>
                </div>

                {myTickets.length > 0 && (
                  <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-xl border border-zinc-800/80">
                    {[
                      { id: 'all', label: 'الكل' },
                      { id: 'pending', label: 'بانتظار الرد' },
                      { id: 'replied', label: 'تم الرد' }
                    ].map(f => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setTicketFilter(f.id as any)}
                        className={`min-h-[36px] px-3 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                          ticketFilter === f.id ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {!user ? (
                <div className="text-center py-10 text-zinc-400 text-xs space-y-1.5">
                  <p className="font-bold text-zinc-300">سجل دخولك لعرض سجل تذاكرك وردود الإدارة</p>
                  <p className="text-[11px] text-zinc-500">يتم حفظ جميع محادثاتك وتذاكرك تلقائياً على حسابك.</p>
                </div>
              ) : loadingTickets ? (
                <div className="text-center py-10 text-zinc-500 text-xs font-bold">جاري تحميل تذاكرك...</div>
              ) : filteredTickets.length === 0 ? (
                <div className="text-center py-10 text-zinc-500 text-xs font-bold">
                  لا توجد تذاكر في هذا التصنيف حالياً
                </div>
              ) : (
                <div className="space-y-3 max-h-[540px] overflow-y-auto pl-1">
                  {filteredTickets.map(ticket => {
                    const hasReply = Boolean(ticket.adminReply) || ticket.status === 'replied';
                    const isResolved = ticket.status === 'resolved';
                    const isInProgress = ticket.status === 'in_progress';
                    const isConfirmingDelete = confirmDeleteTicketId === ticket.id;

                    return (
                      <div
                        key={ticket.id}
                        className="bg-zinc-950/80 border border-zinc-800/80 rounded-xl p-4 space-y-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
                            <span
                              className={
                                hasReply || isResolved
                                  ? 'text-emerald-400'
                                  : isInProgress
                                  ? 'text-amber-400'
                                  : 'text-zinc-400'
                              }
                            >
                              {hasReply
                                ? '✓ تم الرد'
                                : isResolved
                                ? '✓ مكتملة'
                                : isInProgress
                                ? 'قيد المعالجة'
                                : 'قيد المراجعة'}
                            </span>
                            {ticket.category && (
                              <>
                                <span className="text-zinc-700">·</span>
                                <span className="text-zinc-300">{ticket.category}</span>
                              </>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-zinc-500 tabular-nums">
                              {ticket.createdAt?.seconds
                                ? new Date(ticket.createdAt.seconds * 1000).toLocaleDateString('ar-EG')
                                : 'الآن'}
                            </span>

                            {isConfirmingDelete ? (
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleConfirmDeleteTicket(ticket.id)}
                                  className="px-2.5 py-1 rounded-lg bg-rose-600 text-white text-[10px] font-black cursor-pointer"
                                >
                                  تأكيد الحذف
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteTicketId(null)}
                                  className="px-2 py-1 rounded-lg bg-zinc-800 text-zinc-300 text-[10px] font-bold cursor-pointer"
                                >
                                  إلغاء
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteTicketId(ticket.id)}
                                className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
                                title="حذف التذكرة"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </div>

                        <p className="text-xs text-zinc-200 leading-relaxed whitespace-pre-wrap bg-zinc-900/50 p-3 rounded-xl border border-zinc-800/50">
                          {ticket.message}
                        </p>

                        {ticket.adminReply && (
                          <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-xl p-3.5 space-y-1.5">
                            <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-black">
                              <ShieldCheck size={14} />
                              <span>رد الإدارة ({ticket.repliedBy || 'فريق الدعم'}):</span>
                            </div>
                            <p className="text-xs text-white leading-relaxed whitespace-pre-wrap">
                              {ticket.adminReply}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* ============================================================
            TAB 2: ADS & REWARDS + PROMO CODES
           ============================================================ */}
        {activeTab === 'rewards' && (
          <motion.div
            key="rewards_tab"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-5"
          >
            {/* Quick Wallet & Stats Bar */}
            <div className={`grid ${display.isCoverScreen ? 'grid-cols-1' : 'grid-cols-3'} gap-3`}>
              <div className="bg-[#111115] border border-white/5 rounded-2xl p-4 flex flex-col items-center justify-center text-center">
                <span className="text-zinc-400 text-xs font-bold">رصيدك الحالي</span>
                <div className="flex items-center gap-1.5 mt-1.5">
                  <Coins size={16} className="text-yellow-400" />
                  <strong className="text-white font-mono text-lg font-black tabular-nums">
                    {userData?.coins ?? 0}
                  </strong>
                </div>
              </div>

              <div className="bg-[#111115] border border-white/5 rounded-2xl p-4 flex flex-col items-center justify-center text-center">
                <span className="text-zinc-400 text-xs font-bold">مشاهدات اليوم</span>
                <div className="text-white font-mono text-lg font-black mt-1.5 tabular-nums">
                  <span className="text-yellow-400">{watchedToday}</span>
                  <span className="text-zinc-600 mx-1">/</span>
                  <span>{DAILY_LIMIT}</span>
                </div>
                <div className="w-full max-w-[140px] bg-zinc-900 h-1.5 rounded-full overflow-hidden mt-2">
                  <div
                    className="bg-yellow-400 h-full rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(100, (watchedToday / DAILY_LIMIT) * 100)}%` }}
                  />
                </div>
              </div>

              <div className="bg-[#111115] border border-white/5 rounded-2xl p-4 flex flex-col items-center justify-center text-center">
                <span className="text-zinc-400 text-xs font-bold">عائد كل إعلان</span>
                <div className="flex items-center gap-1 text-emerald-400 font-black text-base mt-1.5 tabular-nums">
                  <Zap size={15} />
                  <span>+{monetization.rewardCoins} كوين</span>
                </div>
                <span className="text-[11px] text-sky-400 font-bold mt-0.5 tabular-nums">+{monetization.rewardXp} XP</span>
              </div>
            </div>

            {/* Two-column layout for Video Ad Launch Card & Promo Code Redemption */}
            <div
              className={`grid grid-cols-1 ${display.isBookPosture || display.isWideOrUnfolded ? 'lg:grid-cols-12' : ''} gap-5 items-stretch`}
              style={display.isBookPosture ? { gap: 'var(--fold-hinge-gap, 24px)' } : undefined}
            >
              {/* Video Ad Support & Streak Milestone Card */}
              <div className={`${display.isBookPosture || display.isWideOrUnfolded ? 'lg:col-span-7' : ''} bg-[#111115] border border-white/5 rounded-2xl p-5 flex flex-col justify-between gap-5`}>
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-3">
                    <div className="flex items-center gap-2">
                      <Tv size={17} className="text-amber-400" />
                      <h3 className="text-sm font-black text-white">نظام إعلان الفيديو الاختياري (30 ثانية)</h3>
                    </div>
                    <span className="text-xs font-bold text-emerald-400">مباشر داخل التطبيق</span>
                  </div>

                  {/* Streak Milestone Bar */}
                  <div className="bg-zinc-950/90 border border-amber-500/20 rounded-xl p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h4 className="text-xs font-black text-white">سلسلة الدعم المتواصل</h4>
                        <p className="text-[11px] text-zinc-400 mt-0.5 tabular-nums">
                          كل {STREAK_STEP} إعلانات تمنحك +{STREAK_BONUS_COINS} كوينز إضافية تلقائياً
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {Array.from({ length: STREAK_STEP }).map((_, idx) => {
                          const currentStepInCycle = watchedToday % STREAK_STEP;
                          const isCompletedStep = idx < currentStepInCycle || (watchedToday > 0 && currentStepInCycle === 0);
                          return (
                            <div
                              key={idx}
                              className={`w-8 h-8 rounded-lg text-xs font-black flex items-center justify-center border tabular-nums ${
                                isCompletedStep
                                  ? 'bg-amber-400 text-black border-amber-300'
                                  : 'bg-zinc-900 text-zinc-500 border-zinc-800'
                              }`}
                            >
                              {idx === STREAK_STEP - 1 ? <Gift size={14} /> : idx + 1}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2 border-t border-white/5">
                  <div className="text-xs text-zinc-400">
                    {!user
                      ? 'سجل دخولك لحفظ الكوينز في حسابك.'
                      : `المدة ${adDurationSeconds} ثانية مع زر إغلاق واضح في الأعلى.`}
                  </div>
                  <button
                    type="button"
                    onClick={handleOpenOptInAd}
                    disabled={watchedToday >= DAILY_LIMIT || (cooldownError !== null && cooldownError > 0)}
                    className="min-h-[46px] px-6 bg-amber-500 hover:bg-amber-400 disabled:opacity-45 text-black font-black text-xs rounded-xl transition flex items-center justify-center gap-2 cursor-pointer shrink-0"
                  >
                    <Play size={15} className="fill-black" />
                    <span>
                      {cooldownError !== null && cooldownError > 0
                        ? `انتظر ${cooldownError} ثانية`
                        : `تشغيل إعلان الدعم (${adDurationSeconds}ث)`}
                    </span>
                  </button>
                </div>
              </div>

              {/* Promo Code Redemption Box */}
              <div className={`${display.isBookPosture || display.isWideOrUnfolded ? 'lg:col-span-5' : ''} bg-[#111115] border border-white/5 rounded-2xl p-5 flex flex-col justify-between gap-4`}>
                <div className="space-y-3">
                  <div className="flex items-center gap-2.5 border-b border-white/5 pb-3">
                    <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0">
                      <KeyRound size={17} />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-white">استرداد كود هدية</h3>
                      <p className="text-[11px] text-zinc-400">
                        أدخل الرمز الترويجي للحصول على كوينز وخبرة فورية
                      </p>
                    </div>
                  </div>

                  <form onSubmit={handleRedeemPromo} className="space-y-3">
                    <input
                      type="text"
                      value={promoInput}
                      onChange={e => setPromoInput(e.target.value.toUpperCase())}
                      placeholder="مثال: OTAKU2026"
                      className="w-full min-h-[46px] bg-zinc-950 border border-zinc-800 rounded-xl px-4 text-xs font-mono font-bold text-white placeholder-zinc-500 focus:outline-none focus:border-amber-400 uppercase tracking-wider"
                    />
                    <button
                      type="submit"
                      disabled={isRedeemingPromo || !promoInput.trim()}
                      className="w-full min-h-[44px] bg-zinc-900 hover:bg-zinc-800 border border-amber-500/35 disabled:opacity-45 text-amber-300 font-black text-xs rounded-xl transition flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Sparkles size={14} />
                      <span>{isRedeemingPromo ? 'جاري التحقق...' : 'تفعيل الكود'}</span>
                    </button>
                  </form>
                </div>

                {promoFeedback && (
                  <div
                    className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 border ${
                      promoFeedback.type === 'success'
                        ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400'
                        : 'bg-rose-500/10 border-rose-500/25 text-rose-400'
                    }`}
                  >
                    {promoFeedback.type === 'success' ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
                    <span>{promoFeedback.message}</span>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* ============================================================
            TAB 3: OFFICIAL CHANNELS & INTERACTIVE FAQ
           ============================================================ */}
        {activeTab === 'channels' && (
          <motion.div
            key="channels_tab"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-5"
          >
            {/* Official Telegram Channels Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
              {/* Tech Support */}
              <div className="bg-[#111115] border border-white/5 hover:border-sky-500/30 p-4 sm:p-5 rounded-2xl flex flex-col justify-between gap-4 transition">
                <div className="space-y-2">
                  <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center">
                    <MessageCircle size={20} />
                  </div>
                  <h3 className="text-white text-sm font-black">الدعم الفني المباشر</h3>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    تواصل مع فريق الدعم على تليجرام لحل مشاكل الحسابات والمساعدة الفورية.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => openExternalUrl(helpTelegramUrl)}
                  className="w-full min-h-[44px] bg-sky-600 hover:bg-sky-500 text-white font-black text-xs rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <ExternalLink size={13} />
                  <span>مراسلة الدعم الفني</span>
                </button>
              </div>

              {/* Community Group */}
              <div className="bg-[#111115] border border-white/5 hover:border-emerald-500/30 p-4 sm:p-5 rounded-2xl flex flex-col justify-between gap-4 transition">
                <div className="space-y-2">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
                    <Users size={20} />
                  </div>
                  <h3 className="text-white text-sm font-black">مجتمع الأوتاكو والأكواد</h3>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    انضم لمجموعتنا الرسمية للنقاشات اليومية والحصول على أكواد الكوينز المجانية.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => openExternalUrl(groupTelegramUrl)}
                  className="w-full min-h-[44px] bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <ExternalLink size={13} />
                  <span>الانضمام للمجموعة</span>
                </button>
              </div>

              {/* Owner / Financial Support */}
              <div className="bg-[#111115] border border-yellow-500/20 hover:border-yellow-500/40 p-4 sm:p-5 rounded-2xl flex flex-col justify-between gap-4 transition">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 flex items-center justify-center">
                      <HeartHandshake size={20} />
                    </div>
                    <span className="text-[11px] font-black text-yellow-400">إدارة المنصة</span>
                  </div>
                  <h3 className="text-yellow-400 text-sm font-black">الدعم المادي والرعاية</h3>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    تواصل مباشر مع مالك المنصة للمساهمة في دعم خوادم البث أو الرعاية الإعلانية.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => openExternalUrl(donateTelegramUrl)}
                  className="w-full min-h-[44px] bg-yellow-500 hover:bg-yellow-400 text-black font-black text-xs rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <CreditCard size={13} />
                  <span>التواصل مع المالك</span>
                </button>
              </div>
            </div>

            {/* Interactive Accordion FAQ */}
            <div className="bg-[#111115] border border-white/5 rounded-2xl p-4 sm:p-5 space-y-3">
              <div className="flex items-center gap-2 border-b border-white/5 pb-3">
                <HelpCircle size={16} className="text-[#FF1744]" />
                <h3 className="text-sm font-black text-white">الأسئلة الشائعة</h3>
              </div>

              <div className="space-y-2">
                {FAQ_ITEMS.map((item, idx) => {
                  const isOpen = openFaqIndex === idx;
                  return (
                    <div
                      key={idx}
                      className="bg-zinc-950/70 border border-zinc-800/80 rounded-xl overflow-hidden transition"
                    >
                      <button
                        type="button"
                        onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                        className="w-full min-h-[48px] p-3.5 flex items-center justify-between gap-3 text-right hover:bg-zinc-900/50 transition cursor-pointer"
                      >
                        <span className="text-xs font-bold text-white leading-relaxed">{item.q}</span>
                        <ChevronDown
                          size={16}
                          className={`text-zinc-400 shrink-0 transition-transform duration-200 ${
                            isOpen ? 'rotate-180 text-[#FF1744]' : ''
                          }`}
                        />
                      </button>
                      <AnimatePresence initial={false}>
                        {isOpen && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <p className="px-3.5 pb-3.5 pt-2 text-xs text-zinc-300 leading-relaxed border-t border-zinc-900">
                              {item.a}
                            </p>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dedicated Full-Viewport Opt-In 30s Rewarded Video Ad Player Modal */}
      <RewardedVideoAdModal
        isOpen={isVideoAdOpen}
        onClose={() => setIsVideoAdOpen(false)}
        onRewardEarned={handleAdRewardEarned}
        monetization={monetization}
        watchedToday={watchedToday}
        streakStep={STREAK_STEP}
        streakBonusCoins={STREAK_BONUS_COINS}
      />
    </div>
  );
}
