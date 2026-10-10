import React, { useState, useEffect, useMemo } from 'react';
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
  Zap
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
import AdScriptRunner from '../components/AdScriptRunner';

interface SupportPortalViewProps {
  onBack: () => void;
  initialTab?: 'ad_support' | 'help' | 'suggestions' | 'donate' | 'chat' | 'news' | 'tickets' | 'rewards';
}

const SAMPLE_ADS = [
  {
    sponsor: 'أنمي فيرس - المتجر الحصري',
    title: 'احصل على أكواب وملابس شخصياتك المفضلة بخصم 25% مع رمز OTAKU25.',
    bannerUrl: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=600&auto=format&fit=crop&q=60'
  },
  {
    sponsor: 'صندوق اليابان المدهش',
    title: 'جرب نكهات الحلويات اليابانية التقليدية والرامن الأصلي مباشرة لباب بيتك.',
    bannerUrl: 'https://images.unsplash.com/photo-1541658016709-82535e94bc69?w=600&auto=format&fit=crop&q=60'
  },
  {
    sponsor: 'مجسمات طوكيو الأسطورية',
    title: 'مجسمات أنمي نادرة وحصرية بجودة يابانية أصلية 100% وشحن سريع.',
    bannerUrl: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=600&auto=format&fit=crop&q=60'
  }
];

const TICKET_CATEGORIES = [
  { id: 'حلقة لا تعمل / سيرفر معطل', label: 'حلقة لا تعمل', icon: Film, type: 'complaint' as const },
  { id: 'طلب توفير أنمي أو حلقة', label: 'طلب أنمي', icon: Tv, type: 'suggestion' as const },
  { id: 'مشكلة في الحساب أو الكوينز', label: 'الحساب والكوينز', icon: UserCheck, type: 'complaint' as const },
  { id: 'خلل فني في التطبيق', label: 'خلل فني', icon: Bug, type: 'complaint' as const },
  { id: 'اقتراح فكرة أو ميزة جديدة', label: 'اقتراح تطوير', icon: Lightbulb, type: 'suggestion' as const }
];

const FAQ_ITEMS = [
  {
    q: 'كيف أكسب الكوينز ونقاط الخبرة (XP) مجاناً؟',
    a: 'يمكنك كسب الكوينز والـ XP من خلال مشاهدة إعلانات الدعم في تبويب «المكافآت والأكواد»، أو التفاعل بالتعليقات والتوصيات، أو المشاركة في تحديات ساحة الأوتاكو، أو استرداد أكواد الهدايا التي يوزعها المشرفون.'
  },
  {
    q: 'ماذا أفعل إذا واجهت حلقة لا تعمل أو سيرفر متوقف؟',
    a: 'جرب أولاً التبديل إلى سيرفر آخر من قائمة السيرفرات أعلى المشغل. إذا استمرت المشكلة، افتح تبويب «التذاكر والمقترحات» واختر تصنيف «حلقة لا تعمل» مع ذكر اسم الأنمي ورقم الحلقة ليتم إصلاحها فوراً.'
  },
  {
    q: 'أين أجد الرد على تذكرتي أو شكواي بعد إرسالها؟',
    a: 'يصل رد الإدارة كإشعار فوري في حسابك، كما يظهر الرد مسجلاً بشكل دائم داخل تبويب «التذاكر والمقترحات» أسفل قسم «تذاكري السابقة» مع حالة التذكرة.'
  },
  {
    q: 'من أين أحصل على أكواد الهدايا الترويجية (Promo Codes)؟',
    a: 'يتم نشر الأكواد الترويجية في قناة ومجموعة تليجرام الرسمية وفي الإشعارات العامة بالموقع خلال الفعاليات والمسابقات الأسبوعية.'
  },
  {
    q: 'لماذا قد يتأخر فتح إعلان الدعم في بعض الهواتف؟',
    a: 'بعض المتصفحات الداخلية تمنع النوافذ المنبثقة تلقائياً. عند الضغط على زر المشاهدة سيظهر لك زر مباشر لفتح صفحة الراعي يدوياً بينما يستمر العداد في احتساب مكافأتك.'
  }
];

export default function SupportPortalView({ onBack, initialTab = 'tickets' }: SupportPortalViewProps) {
  const { user, userData } = useAuth();

  const getMappedTab = (tab?: string): 'tickets' | 'rewards' | 'channels' => {
    if (tab === 'ad_support' || tab === 'rewards') return 'rewards';
    if (tab === 'help' || tab === 'donate' || tab === 'chat') return 'channels';
    return 'tickets';
  };

  const [activeTab, setActiveTab] = useState<'tickets' | 'rewards' | 'channels'>(getMappedTab(initialTab));

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

  // Promo code redemption state
  const [promoInput, setPromoInput] = useState('');
  const [isRedeemingPromo, setIsRedeemingPromo] = useState(false);
  const [promoFeedback, setPromoFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // FAQ accordion state
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  // AD SUPPORT STATE LOGIC
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

  const [activeAd, setActiveAd] = useState<{
    sponsor: string;
    title: string;
    bannerUrl: string;
    targetUrl?: string;
    buttonText?: string;
  } | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [countdown, setCountdown] = useState(12);
  const [rewardGranted, setRewardGranted] = useState<{ coins: number; xp: number; bonusCoins?: number } | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [limitError, setLimitError] = useState(false);
  const [cooldownError, setCooldownError] = useState<number | null>(null);
  const [hasClickedSponsorLink, setHasClickedSponsorLink] = useState(false);
  const [isUsingWebView, setIsUsingWebView] = useState(false);
  const [copiedPageUrl, setCopiedPageUrl] = useState(false);

  const [monetization, setMonetization] = useState<{
    mode: 'simulation' | 'direct_link' | 'script' | 'hybrid';
    directLinkUrl: string;
    backupDirectLinkUrl?: string;
    scriptCode: string;
    requireClickVerification?: boolean;
    cooldownSeconds?: number;
    stayTime: number;
    rewardCoins: number;
    rewardXp: number;
    dailyLimit: number;
    customAds: Array<{
      id: string;
      sponsor: string;
      title: string;
      bannerUrl: string;
      targetUrl: string;
      buttonText?: string;
    }>;
  }>({
    mode: 'hybrid',
    directLinkUrl: 'https://uplcm.com/4/11992531',
    backupDirectLinkUrl: 'https://www.profitableratecpmnetwork.com/xw38hehu?key=f928ec53ec71574a775e118d9d0b4f38',
    scriptCode: '',
    requireClickVerification: true,
    cooldownSeconds: 20,
    stayTime: 12,
    rewardCoins: 25,
    rewardXp: 120,
    dailyLimit: 20,
    customAds: []
  });

  const DAILY_LIMIT = monetization.dailyLimit || 20;
  const STREAK_STEP = 5;
  const STREAK_BONUS_COINS = 100;

  // Detect In-App WebView (Telegram, Instagram, etc.) which ad networks penalize
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const ua = navigator.userAgent || navigator.vendor || (window as any).opera || '';
      const checkWebView =
        /webview/i.test(ua) ||
        /wv/i.test(ua) ||
        /(iPhone|iPod|iPad).*AppleWebKit(?!.*Safari)/i.test(ua) ||
        /FBAV|FBAN|Instagram|Twitter|Telegram|Snapchat/i.test(ua);
      setIsUsingWebView(Boolean(checkWebView));
    }
  }, []);

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
          const savedPrimary =
            data.directLinkUrl && !data.directLinkUrl.includes('effectivecpmnetwork.com')
              ? data.directLinkUrl
              : 'https://uplcm.com/4/11992531';
          const savedSecondary =
            data.backupDirectLinkUrl ||
            'https://www.profitableratecpmnetwork.com/xw38hehu?key=f928ec53ec71574a775e118d9d0b4f38';

          setMonetization({
            mode: data.mode ?? 'hybrid',
            directLinkUrl: savedPrimary,
            backupDirectLinkUrl: savedSecondary,
            scriptCode: data.scriptCode ?? '',
            requireClickVerification: data.requireClickVerification ?? true,
            cooldownSeconds: Number(data.cooldownSeconds) || 20,
            stayTime: Number(data.stayTime) || 12,
            rewardCoins: Number(data.rewardCoins) || 25,
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

  // Ad timer loop (with click verification gate for Direct Link / Hybrid modes)
  useEffect(() => {
    let timer: NodeJS.Timeout;
    const needsClickGate =
      (monetization.mode === 'direct_link' || monetization.mode === 'hybrid') &&
      monetization.requireClickVerification !== false &&
      Boolean(monetization.directLinkUrl);

    if (isPlaying && countdown > 0) {
      // If click verification is enabled, pause the last 3 seconds until user opens the sponsor link
      if (needsClickGate && !hasClickedSponsorLink && countdown <= 3) {
        return;
      }
      timer = setTimeout(() => {
        setCountdown(prev => prev - 1);
      }, 1000);
    } else if (isPlaying && countdown === 0) {
      finishAdPlay();
    }
    return () => clearTimeout(timer);
  }, [isPlaying, countdown, hasClickedSponsorLink, monetization]);

  // Cooldown ticker
  useEffect(() => {
    if (cooldownError === null || cooldownError <= 0) {
      if (cooldownError !== null && cooldownError <= 0) setCooldownError(null);
      return;
    }
    const t = setTimeout(() => setCooldownError(prev => (prev && prev > 1 ? prev - 1 : null)), 1000);
    return () => clearTimeout(t);
  }, [cooldownError]);

  const getActiveSmartlinkUrl = () => {
    if (monetization.backupDirectLinkUrl && watchedToday % 2 === 1) {
      return monetization.backupDirectLinkUrl;
    }
    return monetization.directLinkUrl;
  };

  const startAdPlay = () => {
    if (watchedToday >= DAILY_LIMIT) {
      setLimitError(true);
      return;
    }

    // Anti-bot / Ad-Network Policy Cooldown Check
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
    setHasClickedSponsorLink(false);

    if (monetization.mode === 'direct_link' || monetization.mode === 'hybrid') {
      setIsPlaying(true);
      setCountdown(monetization.stayTime);
      setRewardGranted(null);
    } else if (monetization.mode === 'script') {
      setIsPlaying(true);
      setCountdown(monetization.stayTime);
      setRewardGranted(null);
    } else {
      const adPool =
        monetization.customAds && monetization.customAds.length > 0
          ? monetization.customAds
          : SAMPLE_ADS;
      const randAd = adPool[Math.floor(Math.random() * adPool.length)];
      setActiveAd(randAd);
      setIsPlaying(true);
      setCountdown(monetization.stayTime);
      setRewardGranted(null);
    }
  };

  const finishAdPlay = async () => {
    setIsPlaying(false);
    const newCount = watchedToday + 1;
    setWatchedToday(newCount);

    const isStreakMilestone = newCount > 0 && newCount % STREAK_STEP === 0;
    const bonusCoins = isStreakMilestone ? STREAK_BONUS_COINS : 0;
    const baseCoins = monetization.rewardCoins || 25;
    const totalCoinsReward = baseCoins + bonusCoins;
    const xpReward = monetization.rewardXp || 120;

    setRewardGranted({ coins: totalCoinsReward, xp: xpReward, bonusCoins });

    try {
      localStorage.setItem(storageCountKey, newCount.toString());
      localStorage.setItem(`last_ad_ts_${user?.id || 'guest'}`, Date.now().toString());
    } catch {
      // Ignore storage error
    }

    setIsSyncing(true);
    try {
      const { updateDoc, setDoc, increment } = await import('firebase/firestore');
      if (user?.id) {
        await updateDoc(doc(db, 'users', user.id), {
          coins: increment(totalCoinsReward),
          xp: increment(xpReward)
        });
      }

      // Record live ad view statistics in globalSettings/adStats
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
  };

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

  const handleDeleteMyTicket = async (ticketId: string) => {
    try {
      await deleteDoc(doc(db, 'suggestions', ticketId));
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
      className="pb-24 pt-5 px-4 md:px-6 max-w-4xl mx-auto font-sans text-right min-h-screen space-y-5"
      dir="rtl"
      id="support_portal_screen"
    >
      {/* Top Header */}
      <div className="bg-[#111115] border border-white/5 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-[#FF1744]/15 border border-[#FF1744]/30 text-[#FF1744] flex items-center justify-center shrink-0">
            <ShieldCheck size={22} />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-black text-white">مركز الدعم والمساندة</h1>
            <p className="text-[11px] text-zinc-400">
              تذاكر الدعم الفني، استرداد الأكواد ومكافآت الإعلانات، وقنوات التواصل الرسمية
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-2">
          {user?.id && (
            <button
              onClick={handleCopyUid}
              className="flex items-center gap-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 px-3 py-1.5 rounded-xl text-[11px] font-bold transition cursor-pointer"
              title="نسخ معرّف حسابك للدعم السريع"
            >
              {copiedUid ? (
                <>
                  <Check size={12} className="text-emerald-400" />
                  <span className="text-emerald-400">تم نسخ المعرّف</span>
                </>
              ) : (
                <>
                  <Copy size={12} className="text-zinc-400" />
                  <span>معرّف الحساب: {user.id.slice(0, 6)}...</span>
                </>
              )}
            </button>
          )}

          <button
            onClick={onBack}
            className="flex items-center gap-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 font-bold px-3.5 py-1.5 rounded-xl border border-zinc-800 transition text-xs cursor-pointer shrink-0"
          >
            <span>رجوع</span>
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* Main Navigation Tabs */}
      <div className="grid grid-cols-3 gap-2 bg-[#111115] p-1.5 rounded-2xl border border-white/5" id="support_tabs_bar">
        <button
          onClick={() => setActiveTab('tickets')}
          className={`py-2.5 px-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            activeTab === 'tickets'
              ? 'bg-[#FF1744] text-white shadow-lg shadow-[#FF1744]/20'
              : 'text-zinc-400 hover:text-white hover:bg-zinc-900/70'
          }`}
        >
          <Ticket size={14} />
          <span>التذاكر والمقترحات</span>
          {repliedTicketsCount > 0 && (
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                activeTab === 'tickets' ? 'bg-black/30 text-white' : 'bg-emerald-500/20 text-emerald-400'
              }`}
            >
              {repliedTicketsCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('rewards')}
          className={`py-2.5 px-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            activeTab === 'rewards'
              ? 'bg-[#FF1744] text-white shadow-lg shadow-[#FF1744]/20'
              : 'text-zinc-400 hover:text-white hover:bg-zinc-900/70'
          }`}
        >
          <Gift size={14} />
          <span>المكافآت والأكواد</span>
        </button>

        <button
          onClick={() => setActiveTab('channels')}
          className={`py-2.5 px-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            activeTab === 'channels'
              ? 'bg-[#FF1744] text-white shadow-lg shadow-[#FF1744]/20'
              : 'text-zinc-400 hover:text-white hover:bg-zinc-900/70'
          }`}
        >
          <HelpCircle size={14} />
          <span>التواصل والأسئلة</span>
        </button>
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        {/* ============================================================
            TAB 1: TICKETS & SUGGESTIONS (التذاكر والمقترحات + تذاكري السابقة)
           ============================================================ */}
        {activeTab === 'tickets' && (
          <motion.div
            key="tickets_tab"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-5"
          >
            {/* Create New Ticket Card */}
            <div className="bg-[#111115] border border-white/5 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-white/5 pb-3">
                <div className="flex items-center gap-2">
                  <MessageSquare size={16} className="text-[#FF1744]" />
                  <h2 className="text-sm font-black text-white">فتح تذكرة دعم أو إرسال مقترح</h2>
                </div>
                <span className="text-[10px] text-zinc-400 bg-zinc-900 px-2.5 py-1 rounded-lg border border-zinc-800">
                  رد مباشر من الإدارة
                </span>
              </div>

              {/* Category Chips */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-300 block">اختر نوع الطلب:</label>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {TICKET_CATEGORIES.map(cat => {
                    const Icon = cat.icon;
                    const isSelected = selectedCategory.id === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setSelectedCategory(cat)}
                        className={`p-2.5 rounded-xl border text-right transition flex flex-col gap-1.5 cursor-pointer ${
                          isSelected
                            ? 'bg-[#FF1744]/15 border-[#FF1744] text-white'
                            : 'bg-zinc-900/60 border-zinc-800/80 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <Icon size={14} className={isSelected ? 'text-[#FF1744]' : 'text-zinc-500'} />
                          {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-[#FF1744]" />}
                        </div>
                        <span className="text-[11px] font-black leading-tight">{cat.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <form onSubmit={handleSendTicket} className="space-y-3.5">
                <div>
                  <label className="text-xs font-bold text-zinc-300 block mb-1.5">
                    العنوان المختصر (مثل: اسم الأنمي أو رقم الحلقة):
                  </label>
                  <input
                    type="text"
                    value={ticketSubject}
                    onChange={e => setTicketSubject(e.target.value)}
                    maxLength={120}
                    placeholder={
                      selectedCategory.label === 'حلقة لا تعمل'
                        ? 'مثال: أنمي One Piece الحلقة 1120 السيرفر الأول'
                        : selectedCategory.label === 'طلب أنمي'
                        ? 'مثال: طلب توفير أنمي Solo Leveling الموسم الثاني'
                        : 'اكتب عنواناً مختصراً لطلبك...'
                    }
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#FF1744] transition"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-zinc-300 block mb-1.5">التفاصيل:</label>
                  <textarea
                    rows={4}
                    value={ticketMessage}
                    onChange={e => setTicketMessage(e.target.value)}
                    maxLength={2500}
                    required
                    placeholder="اشرح المشكلة أو الفكرة بوضوح ليتمكن فريق الإشراف من مساعدتك بأسرع وقت..."
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
                        <span>تم إرسال تذكرتك بنجاح! يمكنك متابعة حالة الرد بالأسفل.</span>
                      </motion.div>
                    ) : (
                      <span className="text-[11px] text-zinc-500">
                        {user
                          ? 'سيصلك إشعار فوري عند رد الإدارة على تذكرتك.'
                          : 'سجل دخولك لتتمكن من متابعة تذاكرك واستلام الإشعارات.'}
                      </span>
                    )}
                  </AnimatePresence>

                  <button
                    type="submit"
                    disabled={isSubmittingTicket || !ticketMessage.trim()}
                    className="mr-auto px-6 py-2.5 bg-[#FF1744] hover:bg-red-600 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-black text-xs rounded-xl transition flex items-center gap-2 cursor-pointer shadow-lg shadow-[#FF1744]/15"
                  >
                    {isSubmittingTicket ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-t-transparent border-white rounded-full animate-spin" />
                        <span>جاري الإرسال...</span>
                      </>
                    ) : (
                      <>
                        <Send size={13} className="transform rotate-180" />
                        <span>إرسال التذكرة</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>

            {/* User's Ticket History & Admin Replies */}
            <div className="bg-[#111115] border border-white/5 rounded-2xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 pb-3">
                <div className="flex items-center gap-2">
                  <Ticket size={16} className="text-sky-400" />
                  <h3 className="text-sm font-black text-white">تذاكري ومقترحاتي السابقة</h3>
                  <span className="text-[10px] bg-zinc-900 border border-zinc-800 text-zinc-300 px-2 py-0.5 rounded-full font-mono">
                    {myTickets.length}
                  </span>
                </div>

                {myTickets.length > 0 && (
                  <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-xl border border-zinc-800/80">
                    {[
                      { id: 'all', label: 'الكل' },
                      { id: 'pending', label: 'قيد المراجعة' },
                      { id: 'replied', label: 'تم الرد' }
                    ].map(f => (
                      <button
                        key={f.id}
                        onClick={() => setTicketFilter(f.id as any)}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer ${
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
                <div className="text-center py-8 text-zinc-400 text-xs space-y-1">
                  <p className="font-bold text-zinc-300">سجل دخولك لعرض سجل تذاكرك وردود الإدارة</p>
                  <p className="text-[11px] text-zinc-500">يتم حفظ جميع محادثاتك وتذاكرك تلقائياً على حسابك.</p>
                </div>
              ) : loadingTickets ? (
                <div className="text-center py-8 text-zinc-500 text-xs font-bold">جاري تحميل تذاكرك...</div>
              ) : filteredTickets.length === 0 ? (
                <div className="text-center py-8 text-zinc-500 text-xs font-bold">
                  لا توجد تذاكر في هذا القسم حالياً
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredTickets.map(ticket => {
                    const hasReply = Boolean(ticket.adminReply) || ticket.status === 'replied';
                    const isResolved = ticket.status === 'resolved';
                    const isInProgress = ticket.status === 'in_progress';

                    return (
                      <div
                        key={ticket.id}
                        className="bg-zinc-950/80 border border-zinc-800/80 rounded-xl p-4 space-y-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`text-[10px] font-bold px-2.5 py-0.5 rounded-lg border ${
                                hasReply || isResolved
                                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                  : isInProgress
                                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                  : 'bg-zinc-900 text-zinc-400 border-zinc-800'
                              }`}
                            >
                              {hasReply
                                ? '✓ تم الرد من الإدارة'
                                : isResolved
                                ? '✓ مكتملة'
                                : isInProgress
                                ? '⏳ قيد المعالجة'
                                : 'قيد المراجعة'}
                            </span>

                            {ticket.category && (
                              <span className="text-[10px] font-bold text-zinc-300 bg-zinc-900 px-2 py-0.5 rounded-lg border border-zinc-800">
                                {ticket.category}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-zinc-500">
                              {ticket.createdAt?.seconds
                                ? new Date(ticket.createdAt.seconds * 1000).toLocaleDateString('ar-EG')
                                : 'الآن'}
                            </span>
                            <button
                              onClick={() => handleDeleteMyTicket(ticket.id)}
                              className="p-1 text-zinc-500 hover:text-rose-400 transition cursor-pointer"
                              title="حذف التذكرة"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>

                        <p className="text-xs text-zinc-200 leading-relaxed whitespace-pre-wrap bg-zinc-900/50 p-3 rounded-xl border border-zinc-800/50">
                          {ticket.message}
                        </p>

                        {ticket.adminReply && (
                          <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-xl p-3.5 space-y-1.5">
                            <div className="flex items-center gap-1.5 text-emerald-400 text-[11px] font-black">
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
            TAB 2: REWARDS & PROMO CODES (المكافآت والأكواد + إعلان الدعم)
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
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-[#111115] border border-white/5 rounded-2xl p-3.5 flex flex-col items-center justify-center text-center">
                <span className="text-zinc-400 text-[10px] font-bold">رصيدك الحالي</span>
                <div className="flex items-center gap-1.5 mt-1">
                  <Coins size={15} className="text-yellow-400" />
                  <strong className="text-white font-mono text-base font-black">
                    {userData?.coins ?? 0}
                  </strong>
                </div>
                <span className="text-[9px] text-zinc-500 mt-0.5">عملة متجر</span>
              </div>

              <div className="bg-[#111115] border border-white/5 rounded-2xl p-3.5 flex flex-col items-center justify-center text-center">
                <span className="text-zinc-400 text-[10px] font-bold">مشاهدات اليوم</span>
                <div className="text-white font-mono text-base font-black mt-1">
                  <span className="text-yellow-400">{watchedToday}</span>
                  <span className="text-zinc-600 mx-1">/</span>
                  <span>{DAILY_LIMIT}</span>
                </div>
                <div className="w-full bg-zinc-900 h-1.5 rounded-full overflow-hidden mt-1.5">
                  <div
                    className="bg-yellow-400 h-full rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(100, (watchedToday / DAILY_LIMIT) * 100)}%` }}
                  />
                </div>
              </div>

              <div className="bg-[#111115] border border-white/5 rounded-2xl p-3.5 flex flex-col items-center justify-center text-center">
                <span className="text-zinc-400 text-[10px] font-bold">مكافأة الإعلان</span>
                <div className="flex items-center gap-1 text-emerald-400 font-black text-sm mt-1">
                  <Zap size={14} />
                  <span>+{monetization.rewardCoins} كوين</span>
                </div>
                <span className="text-[9px] text-sky-400 font-bold mt-0.5">+{monetization.rewardXp} XP خبرة</span>
              </div>
            </div>

            {/* Streak Milestone Progress Bar (Every 5 Ads = +100 Bonus Coins) */}
            <div className="bg-gradient-to-l from-amber-500/10 via-[#111115] to-[#111115] border border-amber-500/20 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0">
                  <Sparkles size={18} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-black text-white">صندوق مكافأة السلسلة الإعلانية</h4>
                    <span className="text-[10px] bg-amber-500 text-black font-black px-2 py-0.5 rounded-full">
                      +{STREAK_BONUS_COINS} كوين إضافي
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    شاهد {STREAK_STEP} إعلانات لتحصل على مكافأة كبرى فورية فوق مكافأة كل إعلان!
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 self-end sm:self-center">
                {Array.from({ length: STREAK_STEP }).map((_, idx) => {
                  const currentStepInCycle = watchedToday % STREAK_STEP;
                  const isCompletedStep = idx < currentStepInCycle || (watchedToday > 0 && currentStepInCycle === 0 && !isPlaying);
                  return (
                    <div
                      key={idx}
                      className={`w-7 h-7 rounded-lg text-[10px] font-black flex items-center justify-center border transition-all ${
                        isCompletedStep
                          ? 'bg-amber-400 text-black border-amber-300 shadow-sm shadow-amber-400/30'
                          : 'bg-zinc-900 text-zinc-500 border-zinc-800'
                      }`}
                    >
                      {idx === STREAK_STEP - 1 ? '🎁' : idx + 1}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Promo Code Redemption Box */}
            <div className="bg-[#111115] border border-white/5 rounded-2xl p-5 space-y-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center">
                    <KeyRound size={16} />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-white">استرداد كود هدية (Promo Code)</h3>
                    <p className="text-[11px] text-zinc-400">
                      أدخل الكود الترويجي للحصول على كوينز ونقاط خبرة فورية
                    </p>
                  </div>
                </div>
              </div>

              <form onSubmit={handleRedeemPromo} className="flex flex-col sm:flex-row gap-2.5">
                <input
                  type="text"
                  value={promoInput}
                  onChange={e => setPromoInput(e.target.value.toUpperCase())}
                  placeholder="أدخل رمز الكود هنا (مثال: OTAKU2026)..."
                  className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-xs font-mono font-bold text-white placeholder-zinc-500 focus:outline-none focus:border-amber-400 uppercase tracking-wider"
                />
                <button
                  type="submit"
                  disabled={isRedeemingPromo || !promoInput.trim()}
                  className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:bg-zinc-800 disabled:text-zinc-500 text-black font-black text-xs rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                >
                  <Sparkles size={14} />
                  <span>{isRedeemingPromo ? 'جاري التحقق...' : 'تفعيل الكود'}</span>
                </button>
              </form>

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

            {/* Ad Support Interactive Player */}
            <div className="bg-[#111115] border border-white/5 rounded-2xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-3">
                <div className="flex items-center gap-2">
                  <Tv size={16} className="text-yellow-400" />
                  <h3 className="text-sm font-black text-white">دعم السيرفرات بمشاهدة إعلان</h3>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-0.5 rounded-full font-bold">
                    ✓ متوافق مع سياسات الإعلانات العالمية
                  </span>
                </div>
              </div>

              {/* In-App WebView Protection Banner (Prevents Adsterra/Monetag Invalid Traffic Ban) */}
              {isUsingWebView && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1 text-right">
                    <div className="flex items-center gap-1.5 text-amber-400 text-xs font-black">
                      <AlertTriangle size={14} />
                      <span>تنبيه المتصفح الداخلي (WebView):</span>
                    </div>
                    <p className="text-[11px] text-zinc-300 leading-relaxed">
                      لضمان احتساب الإعلان بشكل رسمي وعدم رفض الزيارة من شبكات الإعلانات، يُنصح بفتح التطبيق في متصفح الهاتف الرسمي (Chrome أو Safari).
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (typeof window !== 'undefined') {
                        navigator.clipboard.writeText(window.location.href);
                        setCopiedPageUrl(true);
                        setTimeout(() => setCopiedPageUrl(false), 2500);
                      }
                    }}
                    className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-black font-black text-[11px] rounded-xl transition shrink-0 cursor-pointer"
                  >
                    {copiedPageUrl ? '✓ تم نسخ الرابط' : 'نسخ الرابط لفتحه في المتصفح'}
                  </button>
                </div>
              )}

              <div
                className="bg-zinc-950 border border-zinc-800/80 rounded-2xl p-6 relative overflow-hidden flex flex-col items-center justify-center min-h-[220px] text-center"
                id="ad_action_zone_portal"
              >
                <AnimatePresence mode="wait">
                  {!isPlaying && !rewardGranted && (
                    <motion.div
                      key="portal_start_prompt"
                      initial={{ opacity: 0, scale: 0.96 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.96 }}
                      className="flex flex-col items-center gap-3.5 relative z-10"
                    >
                      <div className="w-14 h-14 rounded-2xl bg-yellow-500/10 border border-yellow-500/25 text-yellow-400 flex items-center justify-center">
                        <Play size={22} className="fill-yellow-400" />
                      </div>
                      <div className="space-y-1">
                        <h4 className="text-white font-black text-sm">شاهد إعلاناً قصيراً واكسب مكافأتك</h4>
                        <p className="text-xs text-zinc-400 max-w-sm leading-relaxed mx-auto">
                          مساهمتك الاختيارية تساعدنا في تغطية تكاليف خوادم البث السريعة مع إبقاء الحلقات خالية من النوافذ المزعجة.
                        </p>
                      </div>

                      {limitError && (
                        <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5">
                          <AlertTriangle size={14} />
                          <span>وصلت للحد اليومي ({DAILY_LIMIT} إعلاناً). عد غداً للمزيد!</span>
                        </div>
                      )}

                      {cooldownError !== null && cooldownError > 0 && (
                        <div className="bg-amber-500/10 border border-amber-500/25 text-amber-300 px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5">
                          <Clock size={14} />
                          <span>فترة أمان بين الإعلانات لحماية الحساب: يرجى الانتظار {cooldownError} ثانية...</span>
                        </div>
                      )}

                      {!user && (
                        <div className="bg-amber-500/10 border border-amber-500/20 text-amber-400 px-3 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-1.5">
                          <AlertTriangle size={13} />
                          <span>يرجى تسجيل الدخول لحفظ الكوينز في حسابك.</span>
                        </div>
                      )}

                      <button
                        onClick={startAdPlay}
                        disabled={watchedToday >= DAILY_LIMIT || (cooldownError !== null && cooldownError > 0)}
                        className="bg-gradient-to-r from-yellow-400 to-amber-500 hover:from-yellow-300 hover:to-amber-400 disabled:opacity-40 py-2.5 px-7 text-black font-black text-xs rounded-xl shadow-lg transition cursor-pointer flex items-center gap-2"
                      >
                        <Tv size={14} />
                        <span>
                          {cooldownError !== null && cooldownError > 0
                            ? `انتظر ${cooldownError} ثانية...`
                            : `بدء مشاهدة الإعلان (+${monetization.rewardCoins} كوين)`}
                        </span>
                      </button>
                    </motion.div>
                  )}

                  {isPlaying && (
                    <motion.div
                      key="portal_playing_ad_actual"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="w-full flex flex-col justify-between gap-4 z-20 text-right"
                    >
                      <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 bg-rose-500 rounded-full animate-ping" />
                          <span className="text-xs text-zinc-300 font-bold">
                            {(monetization.mode === 'direct_link' || monetization.mode === 'hybrid') &&
                            monetization.requireClickVerification !== false &&
                            !hasClickedSponsorLink &&
                            countdown <= 3
                              ? 'بانتظار زيارة رابط الراعي لإتمام المكافأة...'
                              : 'جاري احتساب مكافأة الدعم...'}
                          </span>
                        </div>
                        <div className="bg-zinc-900 border border-zinc-700 px-3 py-1 rounded-full text-yellow-400 font-mono text-xs font-black flex items-center gap-1.5">
                          <Clock size={12} />
                          <span>0:{countdown < 10 ? `0${countdown}` : countdown}</span>
                        </div>
                      </div>

                      <div className="py-2 text-center space-y-3">
                        {/* Direct Smartlink CTA (shown in direct_link AND hybrid modes) */}
                        {(monetization.mode === 'direct_link' || monetization.mode === 'hybrid') &&
                          monetization.directLinkUrl && (
                            <div className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-3.5 space-y-2.5">
                              <div className="flex items-center justify-center gap-1.5">
                                <span className="text-[10px] font-black bg-[#FF1744]/15 text-[#FF1744] border border-[#FF1744]/30 px-2 py-0.5 rounded-full">
                                  إعلان الراعي المباشر (Smartlink)
                                </span>
                                {hasClickedSponsorLink && (
                                  <span className="text-[10px] font-black bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                                    ✓ تم التحقق من الزيارة
                                  </span>
                                )}
                              </div>

                              <p className="text-xs text-zinc-300 max-w-md mx-auto leading-relaxed">
                                {hasClickedSponsorLink
                                  ? 'شكراً لزيارة الراعي! انتظر انتهاء الثواني القليلة المتبقية لاستلام الكوينز والـ XP.'
                                  : 'اضغط على زر فتح الإعلان أدناه لزيارة الراعي الرسمي وتأكيد المكافأة (إذا كان الرابط الأول محجوباً من شبكة هاتفك، استخدم الرابط البديل 2):'}
                              </p>

                              <div className="flex flex-wrap items-center justify-center gap-2">
                                <a
                                  href={getActiveSmartlinkUrl()}
                                  target="_blank"
                                  rel="noopener"
                                  onClick={() => setHasClickedSponsorLink(true)}
                                  className={`font-black py-2.5 px-5 rounded-xl text-xs transition inline-flex items-center gap-2 cursor-pointer shadow-lg ${
                                    hasClickedSponsorLink
                                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20'
                                      : 'bg-[#FF1744] hover:bg-red-600 text-white shadow-[#FF1744]/25 animate-pulse'
                                  }`}
                                >
                                  <ExternalLink size={14} />
                                  <span>
                                    {hasClickedSponsorLink
                                      ? 'إعادة فتح الإعلان الأساسي'
                                      : 'فتح إعلان الراعي (سيرفر 1)'}
                                  </span>
                                </a>

                                {monetization.backupDirectLinkUrl && (
                                  <a
                                    href={
                                      getActiveSmartlinkUrl() === monetization.backupDirectLinkUrl
                                        ? monetization.directLinkUrl
                                        : monetization.backupDirectLinkUrl
                                    }
                                    target="_blank"
                                    rel="noopener"
                                    onClick={() => setHasClickedSponsorLink(true)}
                                    className="font-black py-2.5 px-4 rounded-xl text-xs bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-amber-400 transition inline-flex items-center gap-1.5 cursor-pointer"
                                  >
                                    <ExternalLink size={13} />
                                    <span>رابط بديل (سيرفر 2)</span>
                                  </a>
                                )}
                              </div>
                            </div>
                          )}

                        {/* Compact Embedded Banner / Script (shown in script AND hybrid modes) */}
                        {(monetization.mode === 'script' || monetization.mode === 'hybrid') &&
                          monetization.scriptCode && (
                            <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-2.5 overflow-hidden">
                              <span className="text-[9px] text-zinc-500 block mb-1">مساحة إعلانية مصغرة</span>
                              <AdScriptRunner scriptCode={monetization.scriptCode} compact />
                            </div>
                          )}

                        {/* Internal Community / Sponsor Cards (shown in simulation mode or if hybrid has no script) */}
                        {monetization.mode === 'simulation' && activeAd && (
                          <div className="space-y-2.5">
                            <span className="bg-yellow-500/10 text-yellow-400 text-[10px] font-bold px-2.5 py-0.5 rounded border border-yellow-500/20 inline-block">
                              {activeAd.sponsor}
                            </span>
                            <h4 className="text-white text-xs font-black">{activeAd.title}</h4>
                            {activeAd.bannerUrl && (
                              <img
                                src={activeAd.bannerUrl}
                                alt=""
                                className="w-full max-h-[110px] object-cover rounded-xl mt-1 opacity-90 border border-white/10"
                                referrerPolicy="no-referrer"
                              />
                            )}
                            {activeAd.targetUrl && (
                              <div className="pt-1">
                                <a
                                  href={activeAd.targetUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={() => setHasClickedSponsorLink(true)}
                                  className="bg-yellow-500 hover:bg-yellow-400 text-black font-black py-1.5 px-4 rounded-xl text-[11px] transition inline-flex items-center gap-1.5 cursor-pointer"
                                >
                                  <ExternalLink size={12} />
                                  <span>{activeAd.buttonText || 'زيارة الرابط الآن'}</span>
                                </a>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="w-full bg-zinc-900 h-2 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-l from-yellow-400 to-amber-500 transition-all duration-1000"
                          style={{ width: `${(countdown / monetization.stayTime) * 100}%` }}
                        />
                      </div>
                    </motion.div>
                  )}

                  {rewardGranted && (
                    <motion.div
                      key="portal_reward_grant"
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="flex flex-col items-center gap-3 relative z-10"
                    >
                      <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 flex items-center justify-center">
                        <CheckCircle2 size={28} />
                      </div>
                      <div className="space-y-1">
                        <h4 className="text-emerald-400 text-sm font-black">شكراً لدعمك! تمت إضافة المكافأة</h4>
                        <p className="text-xs text-zinc-300">
                          حصلت على <strong className="text-yellow-400">+{rewardGranted.coins} كوينز</strong> و{' '}
                          <strong className="text-sky-400">+{rewardGranted.xp} XP</strong>
                        </p>
                        {rewardGranted.bonusCoins && rewardGranted.bonusCoins > 0 ? (
                          <div className="mt-1.5 inline-flex items-center gap-1.5 bg-amber-500/15 border border-amber-500/30 text-amber-300 px-3 py-1 rounded-full text-[11px] font-black">
                            <Sparkles size={12} />
                            <span>شمل مكافأة إكمال السلسلة (+{rewardGranted.bonusCoins} كوينز إضافية)!</span>
                          </div>
                        ) : null}
                      </div>
                      {isSyncing && (
                        <span className="text-[10px] text-zinc-400">جاري تحديث الرصيد...</span>
                      )}
                      <button
                        onClick={() => setRewardGranted(null)}
                        className="mt-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-white text-xs font-bold px-5 py-2 rounded-xl transition cursor-pointer"
                      >
                        مشاهدة إعلان آخر
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        )}

        {/* ============================================================
            TAB 3: OFFICIAL CHANNELS & INTERACTIVE FAQ (التواصل والأسئلة)
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
              <div className="bg-[#111115] border border-white/5 hover:border-sky-500/30 p-4 rounded-2xl flex flex-col justify-between gap-4 transition">
                <div className="space-y-2">
                  <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center">
                    <MessageCircle size={20} />
                  </div>
                  <h3 className="text-white text-xs font-black">الدعم الفني المباشر</h3>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    تواصل مع فريق الدعم على تليجرام لحل مشاكل الحسابات والمساعدة الفورية.
                  </p>
                </div>
                <a
                  href={helpTelegramUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full bg-sky-600 hover:bg-sky-500 text-white font-black text-xs py-2.5 rounded-xl transition flex items-center justify-center gap-1.5"
                >
                  <ExternalLink size={12} />
                  <span>مراسلة الدعم الفني</span>
                </a>
              </div>

              {/* Community Group */}
              <div className="bg-[#111115] border border-white/5 hover:border-emerald-500/30 p-4 rounded-2xl flex flex-col justify-between gap-4 transition">
                <div className="space-y-2">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
                    <Users size={20} />
                  </div>
                  <h3 className="text-white text-xs font-black">مجتمع الأوتاكو وجوائز الأكواد</h3>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    انضم لمجموعتنا الرسمية للنقاشات اليومية والحصول على أكواد الكوينز المجانية.
                  </p>
                </div>
                <a
                  href={groupTelegramUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs py-2.5 rounded-xl transition flex items-center justify-center gap-1.5"
                >
                  <ExternalLink size={12} />
                  <span>الانضمام للمجموعة</span>
                </a>
              </div>

              {/* Owner / Financial Support */}
              <div className="bg-[#111115] border border-yellow-500/20 hover:border-yellow-500/40 p-4 rounded-2xl flex flex-col justify-between gap-4 transition">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 flex items-center justify-center">
                      <HeartHandshake size={20} />
                    </div>
                    <span className="text-[9px] font-black bg-yellow-500/15 text-yellow-400 border border-yellow-500/25 px-2 py-0.5 rounded-full">
                      إدارة المنصة
                    </span>
                  </div>
                  <h3 className="text-yellow-400 text-xs font-black">الدعم المادي والرعاية</h3>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    تواصل مباشر مع مالك المنصة للمساهمة في دعم خوادم البث أو الرعاية الإعلانية.
                  </p>
                </div>
                <a
                  href={donateTelegramUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full bg-yellow-500 hover:bg-yellow-400 text-black font-black text-xs py-2.5 rounded-xl transition flex items-center justify-center gap-1.5"
                >
                  <CreditCard size={12} />
                  <span>التواصل مع المالك</span>
                </a>
              </div>
            </div>

            {/* Interactive Accordion FAQ */}
            <div className="bg-[#111115] border border-white/5 rounded-2xl p-5 space-y-3">
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
                        className="w-full p-3.5 flex items-center justify-between gap-3 text-right hover:bg-zinc-900/50 transition cursor-pointer"
                      >
                        <span className="text-xs font-bold text-white">{item.q}</span>
                        <ChevronDown
                          size={15}
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
                            <p className="px-3.5 pb-3.5 pt-1 text-xs text-zinc-400 leading-relaxed border-t border-zinc-900">
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
    </div>
  );
}
