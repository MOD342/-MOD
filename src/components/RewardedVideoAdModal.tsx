import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Volume2,
  VolumeX,
  CheckCircle2,
  Coins,
  Sparkles,
  Clock,
  ShieldCheck,
  AlertTriangle,
  Play,
  Pause,
  ExternalLink
} from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import ViewportPortal from './ViewportPortal';
import AdScriptRunner from './AdScriptRunner';
import { openExternalUrl } from '../utils/externalNavigation';
import { useDeviceDisplay } from '../hooks/useDeviceDisplay';

export interface MonetizationConfig {
  mode: 'simulation' | 'direct_link' | 'script' | 'hybrid';
  directLinkUrl: string;
  backupDirectLinkUrl?: string;
  videoAdUrl?: string;
  vastTagUrl?: string;
  admobRewardedId?: string;
  scriptCode: string;
  requireClickVerification?: boolean;
  cooldownSeconds?: number;
  stayTime: number;
  rewardCoins: number;
  rewardXp: number;
  dailyLimit: number;
  customAds?: Array<{
    id: string;
    sponsor: string;
    title: string;
    bannerUrl: string;
    targetUrl: string;
    buttonText?: string;
  }>;
}

interface RewardedVideoAdModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRewardEarned: () => Promise<void> | void;
  monetization: MonetizationConfig;
  watchedToday: number;
  streakStep: number;
  streakBonusCoins: number;
}

const SHOWCASE_SCENES = [
  {
    badge: 'إعلان دعم داخلي · 01',
    title: 'مساهمتك تبقي السيرفرات سريعة ومجانية',
    subtitle: 'مشاهدة واحدة باختيارك تدعم استضافة الحلقات وجودة البث لجميع الأعضاء.',
    accent: '#FF1744',
    secondary: '#FB7185'
  },
  {
    badge: 'إعلان دعم داخلي · 02',
    title: 'كل شيء يعمل داخل التطبيق مباشرة',
    subtitle: 'لا نوافذ مفاجئة ولا خروج إجباري للمتصفح — تحكم كامل وزر إغلاق واضح.',
    accent: '#F59E0B',
    secondary: '#FBBF24'
  },
  {
    badge: 'إعلان دعم داخلي · 03',
    title: 'كوينز متجر وخبرة فورية لحسابك',
    subtitle: 'استبدل الكوينز بالألقاب والإطارات النادرة داخل متجر الأعضاء وارفع مستواك.',
    accent: '#38BDF8',
    secondary: '#818CF8'
  },
  {
    badge: 'إعلان دعم داخلي · 04',
    title: 'شكراً لكونك جزءاً من عائلة أوتاكو MOD',
    subtitle: 'لحظات وتكتمل مدة الإعلان لإضافة الكوينز ونقاط الخبرة مباشرة لرصيدك.',
    accent: '#10B981',
    secondary: '#34D399'
  }
];

export default function RewardedVideoAdModal({
  isOpen,
  onClose,
  onRewardEarned,
  monetization,
  watchedToday,
  streakStep,
  streakBonusCoins
}: RewardedVideoAdModalProps) {
  const display = useDeviceDisplay();
  const baseDuration = Math.max(30, Number(monetization.stayTime) || 30);

  const [effectiveDuration, setEffectiveDuration] = useState(baseDuration);
  const [countdown, setCountdown] = useState(baseDuration);
  const [isPaused, setIsPaused] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [isCompleted, setIsCompleted] = useState(false);
  const [confirmEarlyClose, setConfirmEarlyClose] = useState(false);

  // In-app resolved ad media state
  const [resolvedVideoUrl, setResolvedVideoUrl] = useState<string>('');
  const [resolvedClickUrl, setResolvedClickUrl] = useState<string>('');
  const [resolvedAdTitle, setResolvedAdTitle] = useState<string>('');
  const [isLoadingVast, setIsLoadingVast] = useState(false);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [nativeSdkStatus, setNativeSdkStatus] = useState<'idle' | 'showing' | 'unavailable'>('idle');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const rewardClaimedRef = useRef(false);

  const sponsorUrl =
    monetization.backupDirectLinkUrl && watchedToday % 2 === 1
      ? monetization.backupDirectLinkUrl
      : monetization.directLinkUrl;

  const customSponsor =
    monetization.customAds && monetization.customAds.length > 0
      ? monetization.customAds[watchedToday % monetization.customAds.length]
      : null;

  const activeVideoSrc = resolvedVideoUrl || monetization.videoAdUrl || '';
  const hasScriptBanner =
    (monetization.mode === 'script' || monetization.mode === 'hybrid') &&
    Boolean(monetization.scriptCode?.trim());
  const shouldEmbedSponsorFrame =
    !activeVideoSrc &&
    !hasScriptBanner &&
    (monetization.mode === 'direct_link' || monetization.mode === 'hybrid') &&
    Boolean(sponsorUrl?.trim()) &&
    /^https:\/\//i.test(sponsorUrl.trim());

  const elapsedSeconds = Math.max(0, effectiveDuration - countdown);
  const progressPercent = Math.min(100, Math.max(0, (elapsedSeconds / effectiveDuration) * 100));
  const sceneIndex = Math.min(
    SHOWCASE_SCENES.length - 1,
    Math.floor((elapsedSeconds / effectiveDuration) * SHOWCASE_SCENES.length)
  );
  const currentScene = SHOWCASE_SCENES[sceneIndex];

  const isNextStreakBonus = (watchedToday + 1) % streakStep === 0;
  const expectedCoins = (monetization.rewardCoins || 25) + (isNextStreakBonus ? streakBonusCoins : 0);
  const expectedXp = monetization.rewardXp || 120;

  // Complete and grant reward cleanly once
  const grantRewardOnce = useCallback(() => {
    setIsCompleted(true);
    if (!rewardClaimedRef.current) {
      rewardClaimedRef.current = true;
      Promise.resolve(onRewardEarned()).catch(() => {});
    }
  }, [onRewardEarned]);

  // Initialize & load real in-app ad immediately on modal open
  useEffect(() => {
    if (!isOpen) return;

    setEffectiveDuration(baseDuration);
    setCountdown(baseDuration);
    setIsPaused(false);
    setIsCompleted(false);
    setConfirmEarlyClose(false);
    setResolvedVideoUrl('');
    setResolvedClickUrl('');
    setResolvedAdTitle('');
    setIframeLoaded(false);
    setNativeSdkStatus('idle');
    rewardClaimedRef.current = false;

    let cancelled = false;

    const initInAppAd = async () => {
      // 1. Try Native Android Rewarded Ad SDK (Capacitor AdMob plugin or custom AndroidNativeBridge)
      if (Capacitor.isNativePlatform()) {
        const admobPlugin = (window as any).Capacitor?.Plugins?.AdMob;
        if (admobPlugin && monetization.admobRewardedId) {
          try {
            setNativeSdkStatus('showing');
            await admobPlugin.prepareRewardVideoAd({ adId: monetization.admobRewardedId });
            const rewardItem = await admobPlugin.showRewardVideoAd();
            if (!cancelled && rewardItem) {
              grantRewardOnce();
              return;
            }
          } catch {
            if (!cancelled) setNativeSdkStatus('unavailable');
          }
        }

        const bridge = (window as any).AndroidNativeBridge;
        if (bridge?.showRewardedVideoAd) {
          try {
            const handled = bridge.showRewardedVideoAd(baseDuration);
            if (handled && !cancelled) {
              setNativeSdkStatus('showing');
            }
          } catch {
            if (!cancelled) setNativeSdkStatus('unavailable');
          }
        }
      }

      // 2. Try VAST XML Video Tag via server-side resolver (runs video right inside <video> in-app)
      if (monetization.vastTagUrl?.trim()) {
        setIsLoadingVast(true);
        try {
          const resp = await fetch(
            `/api/ads/resolve-vast?url=${encodeURIComponent(monetization.vastTagUrl.trim())}`
          );
          const json = await resp.json();
          if (!cancelled && json?.success && json.data?.videoUrl) {
            setResolvedVideoUrl(json.data.videoUrl);
            setResolvedClickUrl(json.data.clickThroughUrl || '');
            setResolvedAdTitle(json.data.title || '');
            const vastDur = Math.max(30, Number(json.data.durationSeconds) || baseDuration);
            setEffectiveDuration(vastDur);
            setCountdown(vastDur);

            // Fire VAST impression beacons silently
            if (Array.isArray(json.data.impressions)) {
              json.data.impressions.slice(0, 3).forEach((impUrl: string) => {
                try {
                  fetch(impUrl, { mode: 'no-cors' }).catch(() => {});
                } catch {}
              });
            }
          }
        } catch {
          // Graceful fallback to embedded stage or canvas showcase
        } finally {
          if (!cancelled) setIsLoadingVast(false);
        }
      }
    };

    initInAppAd();

    return () => {
      cancelled = true;
    };
  }, [isOpen, baseDuration, monetization.admobRewardedId, monetization.vastTagUrl, grantRewardOnce]);

  // Subtle completion chime when unmuted
  const playCompletionChime = useCallback(() => {
    if (isMuted || typeof window === 'undefined') return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;
      [523.25, 659.25, 783.99].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + i * 0.08);
        gain.gain.setValueAtTime(0.06, now + i * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.25);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + i * 0.08);
        osc.stop(now + i * 0.08 + 0.26);
      });
    } catch {}
  }, [isMuted]);

  // Main 1s countdown loop
  useEffect(() => {
    if (!isOpen || isCompleted || isPaused || confirmEarlyClose) return;

    if (countdown <= 0) {
      playCompletionChime();
      grantRewardOnce();
      return;
    }

    const timer = setTimeout(() => {
      setCountdown(prev => Math.max(0, prev - 1));
    }, 1000);

    return () => clearTimeout(timer);
  }, [isOpen, countdown, isCompleted, isPaused, confirmEarlyClose, playCompletionChime, grantRewardOnce]);

  // Sync HTML5 video play/pause/mute
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !isOpen || !activeVideoSrc) return;
    v.muted = isMuted;
    if (isPaused || confirmEarlyClose || isCompleted) {
      v.pause();
    } else {
      v.play().catch(() => {});
    }
  }, [isOpen, isMuted, isPaused, confirmEarlyClose, isCompleted, activeVideoSrc]);

  // Smooth 60fps HTML5 canvas motion backdrop when no active <video>
  useEffect(() => {
    if (!isOpen || activeVideoSrc) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId = 0;

    const particles = Array.from({ length: 24 }, (_, i) => ({
      x: (i * 73) % 100,
      y: (i * 47) % 100,
      r: 1.5 + (i % 4),
      speed: 0.35 + (i % 5) * 0.14
    }));

    const renderFrame = (now: number) => {
      const w = (canvas.width = canvas.clientWidth * Math.min(window.devicePixelRatio || 1, 2));
      const h = (canvas.height = canvas.clientHeight * Math.min(window.devicePixelRatio || 1, 2));
      if (w === 0 || h === 0) {
        animId = requestAnimationFrame(renderFrame);
        return;
      }

      const elapsedSec = now * 0.001;

      const grad = ctx.createRadialGradient(w * 0.5, h * 0.42, w * 0.05, w * 0.5, h * 0.5, w * 0.78);
      grad.addColorStop(0, `${currentScene.accent}2e`);
      grad.addColorStop(0.55, '#0b0b10');
      grad.addColorStop(1, '#050507');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      ctx.save();
      ctx.translate(w * 0.5, h * 0.45);
      for (let r = 0; r < 3; r++) {
        ctx.save();
        ctx.rotate((isPaused ? 0 : elapsedSec * (0.22 - r * 0.06)) * (r % 2 === 0 ? 1 : -1));
        ctx.beginPath();
        const radius = Math.min(w, h) * (0.19 + r * 0.09);
        ctx.setLineDash([radius * 0.35, radius * 0.25]);
        ctx.lineWidth = Math.max(1.5, w * 0.0025);
        ctx.strokeStyle = r === 0 ? `${currentScene.accent}66` : `${currentScene.secondary}33`;
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();

      particles.forEach((p, idx) => {
        const py = (((p.y - (isPaused ? 0 : elapsedSec * p.speed * 14)) % 100) + 100) % 100;
        const px = p.x + Math.sin(elapsedSec + idx) * 2.2;
        ctx.beginPath();
        ctx.fillStyle = idx % 2 === 0 ? `${currentScene.accent}70` : '#ffffff38';
        ctx.arc((px / 100) * w, (py / 100) * h, p.r * (w / 600), 0, Math.PI * 2);
        ctx.fill();
      });

      const bars = 28;
      const barAreaW = Math.min(w * 0.52, 340);
      const startX = (w - barAreaW) * 0.5;
      const gap = barAreaW / bars;
      for (let b = 0; b < bars; b++) {
        const wave = isPaused
          ? 0.2
          : 0.25 + 0.75 * Math.abs(Math.sin(elapsedSec * 3.4 + b * 0.45));
        const bh = Math.max(4, wave * h * 0.065);
        ctx.fillStyle = b % 3 === 0 ? currentScene.accent : `${currentScene.secondary}99`;
        ctx.fillRect(startX + b * gap, h - bh - h * 0.05, Math.max(2, gap * 0.55), bh);
      }

      if (!isCompleted) {
        animId = requestAnimationFrame(renderFrame);
      }
    };

    animId = requestAnimationFrame(renderFrame);
    return () => cancelAnimationFrame(animId);
  }, [isOpen, activeVideoSrc, currentScene, isPaused, isCompleted]);

  const handleRequestClose = () => {
    if (isCompleted) {
      onClose();
      return;
    }
    setConfirmEarlyClose(true);
  };

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  return (
    <ViewportPortal>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="rewarded_video_ad_overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="theme-keep-dark fixed inset-0 z-[9999] bg-black flex flex-col justify-between overflow-hidden select-none font-sans"
            style={{
              height: 'var(--vv-height, 100dvh)',
              paddingTop: 'var(--safe-top, 0px)',
              paddingBottom: 'var(--safe-bottom, 0px)',
              paddingLeft: 'var(--safe-left, 0px)',
              paddingRight: 'var(--safe-right, 0px)'
            }}
            dir="rtl"
            id="rewarded_video_ad_modal"
          >
            {/* Full-Viewport In-App Ad Stage */}
            <div className="relative flex-1 w-full flex flex-col justify-between bg-[#07070b] overflow-hidden">
              {/* Layer 1: Direct Video / Resolved VAST Video OR Canvas Showcase */}
              {activeVideoSrc ? (
                <video
                  ref={videoRef}
                  src={activeVideoSrc}
                  autoPlay
                  playsInline
                  muted={isMuted}
                  loop
                  className="absolute inset-0 w-full h-full object-contain bg-black"
                />
              ) : (
                <canvas
                  ref={canvasRef}
                  className="absolute inset-0 w-full h-full pointer-events-none"
                />
              )}

              {/* Subtle Top & Bottom Gradients */}
              <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/85 via-black/45 to-transparent pointer-events-none z-10" />
              <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/95 via-black/65 to-transparent pointer-events-none z-10" />

              {/* TOP AD HUD BAR (Countdown + Mute + Pause + Close Button) */}
              <div className="relative z-20 flex items-center justify-between gap-2 px-3.5 sm:px-6 pt-3 pb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className={`min-h-[44px] px-3.5 rounded-xl border flex items-center gap-2 backdrop-blur-md transition-colors ${
                      isCompleted
                        ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-300'
                        : 'bg-black/75 border-white/15 text-white'
                    }`}
                  >
                    {isCompleted ? (
                      <>
                        <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                        <span className="text-xs font-black whitespace-nowrap">تمت إضافة المكافأة</span>
                      </>
                    ) : (
                      <>
                        <Clock size={15} className="text-amber-400 shrink-0" />
                        <span className="text-xs text-zinc-300 font-bold hidden sm:inline">المتبقي</span>
                        <span className="font-mono font-black text-sm text-amber-400 tabular-nums" dir="ltr">
                          {formatTimer(countdown)}
                        </span>
                      </>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsMuted(m => !m)}
                    aria-label={isMuted ? 'تشغيل الصوت' : 'كتم الصوت'}
                    className="w-11 h-11 rounded-xl bg-black/75 hover:bg-zinc-900 border border-white/15 text-zinc-200 flex items-center justify-center backdrop-blur-md transition cursor-pointer shrink-0"
                  >
                    {isMuted ? <VolumeX size={17} /> : <Volume2 size={17} />}
                  </button>

                  {!isCompleted && (
                    <button
                      type="button"
                      onClick={() => setIsPaused(p => !p)}
                      aria-label={isPaused ? 'استئناف' : 'إيقاف مؤقت'}
                      className="w-11 h-11 rounded-xl bg-black/75 hover:bg-zinc-900 border border-white/15 text-zinc-200 flex items-center justify-center backdrop-blur-md transition cursor-pointer shrink-0"
                    >
                      {isPaused ? <Play size={16} className="fill-white" /> : <Pause size={16} />}
                    </button>
                  )}
                </div>

                {/* Explicit Close Button */}
                <button
                  type="button"
                  onClick={handleRequestClose}
                  className={`min-h-[44px] px-3.5 rounded-xl font-black text-xs flex items-center gap-1.5 backdrop-blur-md border transition cursor-pointer shrink-0 ${
                    isCompleted
                      ? 'bg-emerald-500 hover:bg-emerald-400 text-black border-emerald-400 shadow-lg shadow-emerald-500/25'
                      : 'bg-black/80 hover:bg-zinc-900 text-white border-white/20'
                  }`}
                  id="btn_close_rewarded_video_ad"
                >
                  <X size={16} />
                  <span>{isCompleted ? 'إغلاق واستلام المكافأة' : 'إغلاق الإعلان'}</span>
                </button>
              </div>

              {/* CENTER IN-APP AD CONTENT STAGE (Zero forced browser redirect) */}
              <div className="relative z-20 flex-1 flex flex-col items-center justify-center px-3.5 sm:px-6 py-2 overflow-y-auto">
                {isCompleted ? (
                  /* Completion Reward Summary */
                  <motion.div
                    initial={{ opacity: 0, scale: 0.94 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className={`w-full ${display.isCoverScreen ? 'max-w-xs' : 'max-w-md'} bg-[#111116]/95 border border-emerald-500/35 rounded-3xl p-6 sm:p-7 space-y-4 shadow-2xl text-center`}
                  >
                    <div className="w-16 h-16 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto">
                      <CheckCircle2 size={32} />
                    </div>
                    <div className="space-y-1.5">
                      <h3 className="text-lg sm:text-xl font-black text-white">شكراً لدعمك التطبيق!</h3>
                      <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
                        اكتملت مدة الإعلان داخل التطبيق وتمت إضافة مكافأتك بنجاح.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
                      <div className="bg-amber-500/10 border border-amber-500/25 px-4 py-2 rounded-xl flex items-center gap-2 text-amber-300 font-black text-sm tabular-nums">
                        <Coins size={16} />
                        <span>+{expectedCoins} كوينز</span>
                      </div>
                      <div className="bg-sky-500/10 border border-sky-500/25 px-4 py-2 rounded-xl flex items-center gap-2 text-sky-300 font-black text-sm tabular-nums">
                        <Sparkles size={16} />
                        <span>+{expectedXp} XP</span>
                      </div>
                    </div>

                    {isNextStreakBonus && (
                      <p className="text-xs font-bold text-amber-300">
                        شمل مكافأة إكمال السلسلة (+{streakBonusCoins} كوينز إضافية)
                      </p>
                    )}

                    <button
                      type="button"
                      onClick={onClose}
                      className="w-full min-h-[46px] bg-emerald-500 hover:bg-emerald-400 text-black font-black text-sm rounded-xl transition cursor-pointer shadow-lg shadow-emerald-500/20"
                    >
                      العودة إلى مركز الدعم
                    </button>
                  </motion.div>
                ) : activeVideoSrc ? (
                  /* Real In-App Video Ad Playing inside <video> */
                  <div className="w-full max-w-2xl mt-auto mb-2 flex items-center justify-between gap-2 px-3 py-2 bg-black/75 backdrop-blur-md border border-white/10 rounded-xl">
                    <span className="text-xs font-bold text-zinc-200 truncate">
                      {resolvedAdTitle || 'إعلان فيديو داخل التطبيق'}
                    </span>
                    {resolvedClickUrl && (
                      <button
                        type="button"
                        onClick={() => openExternalUrl(resolvedClickUrl)}
                        className="min-h-[38px] px-3 rounded-lg bg-[#FF1744] hover:bg-red-600 text-white text-xs font-black flex items-center gap-1.5 cursor-pointer shrink-0"
                      >
                        <ExternalLink size={13} />
                        <span>معرفة المزيد</span>
                      </button>
                    )}
                  </div>
                ) : hasScriptBanner ? (
                  /* In-App Script / Native Banner / 300x250 Ad Container directly inside the modal */
                  <div className="w-full max-w-3xl bg-[#111116]/95 border border-white/15 rounded-2xl p-4 sm:p-5 space-y-3 text-center shadow-2xl backdrop-blur-md">
                    <div className="flex items-center justify-between gap-2 text-xs font-bold text-amber-400">
                      <div className="flex items-center gap-2">
                        <ShieldCheck size={15} />
                        <span>إعلان رعاية مباشر داخل التطبيق</span>
                      </div>
                      <span className="text-[11px] text-zinc-400 tabular-nums">+{expectedCoins} كوينز عند الاكتمال</span>
                    </div>
                    <div className="min-h-[250px] max-h-[60vh] overflow-y-auto flex items-center justify-center bg-zinc-950/90 border border-white/10 rounded-xl p-3">
                      <AdScriptRunner scriptCode={monetization.scriptCode} />
                    </div>
                    <p className="text-[11px] text-zinc-400">
                      يستمر العداد التنازلي تلقائياً داخل التطبيق دون انتقال إلى المتصفح الخارجي.
                    </p>
                  </div>
                ) : shouldEmbedSponsorFrame ? (
                  /* In-App Sandboxed Sponsor Frame (loads sponsor inside app without opening browser!) */
                  <div className="w-full max-w-4xl flex-1 max-h-[72vh] flex flex-col bg-[#111116] border border-white/15 rounded-2xl overflow-hidden shadow-2xl">
                    <div className="flex items-center justify-between gap-2 px-3.5 py-2 bg-zinc-950 border-b border-white/10 text-xs">
                      <div className="flex items-center gap-2 text-zinc-300 font-bold truncate">
                        <ShieldCheck size={14} className="text-emerald-400 shrink-0" />
                        <span className="truncate">عرض الراعي المباشر داخل التطبيق</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => openExternalUrl(sponsorUrl)}
                        className="text-[11px] text-zinc-400 hover:text-white flex items-center gap-1 cursor-pointer shrink-0"
                        title="فتح في متصفح خارجي إذا لزم"
                      >
                        <ExternalLink size={12} />
                        <span className="hidden sm:inline">نافذة مستقلة</span>
                      </button>
                    </div>
                    <div className="relative flex-1 w-full bg-zinc-950">
                      <iframe
                        src={sponsorUrl}
                        title="Sponsor Content"
                        sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
                        referrerPolicy="no-referrer"
                        onLoad={() => setIframeLoaded(true)}
                        className="w-full h-full border-0 relative z-10 bg-transparent"
                      />
                      {!iframeLoaded && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center p-5 text-center space-y-2 pointer-events-none z-0">
                          <span className="text-xs font-bold text-zinc-300">
                            جاري تحميل إعلان الراعي داخل التطبيق...
                          </span>
                          <span className="text-[11px] text-zinc-500 tabular-nums">
                            العد التنازلي للمكافأة مستمر تلقائياً (+{expectedCoins} كوينز)
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  /* Built-in 30s Interactive Motion Showcase (or VAST Loading) */
                  <div className={`w-full ${display.isCoverScreen ? 'max-w-xs' : 'max-w-xl'} mx-auto text-center space-y-4`}>
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={sceneIndex}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.35 }}
                        className="bg-black/65 backdrop-blur-md border border-white/10 rounded-2xl p-5 sm:p-6 space-y-3 shadow-2xl"
                      >
                        <div className="flex items-center justify-center gap-2 text-[11px] font-bold text-zinc-300">
                          <ShieldCheck size={14} style={{ color: currentScene.accent }} />
                          <span>{customSponsor?.sponsor || currentScene.badge}</span>
                          <span className="text-zinc-600">·</span>
                          <span className="font-mono tabular-nums text-amber-400">+{expectedCoins} كوينز</span>
                        </div>

                        <h2 className="text-lg sm:text-2xl font-black text-white leading-snug">
                          {isLoadingVast ? 'جاري تجهيز إعلان الفيديو...' : customSponsor?.title || currentScene.title}
                        </h2>

                        <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed max-w-md mx-auto">
                          {currentScene.subtitle}
                        </p>

                        {customSponsor?.targetUrl && (
                          <div className="pt-1">
                            <button
                              type="button"
                              onClick={() => openExternalUrl(customSponsor.targetUrl)}
                              className="min-h-[40px] px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-black inline-flex items-center gap-1.5 cursor-pointer"
                            >
                              <ExternalLink size={13} />
                              <span>{customSponsor.buttonText || 'زيارة الراعي'}</span>
                            </button>
                          </div>
                        )}

                        {isPaused && (
                          <div className="pt-1 text-xs font-bold text-amber-300">
                            الإعلان متوقف مؤقتاً — اضغط تشغيل لاستكمال العد التنازلي
                          </div>
                        )}

                        {nativeSdkStatus === 'showing' && (
                          <div className="pt-1 text-[11px] text-emerald-300 font-bold">
                            تم تشغيل وحدة الإعلان الأصلية داخل التطبيق
                          </div>
                        )}
                      </motion.div>
                    </AnimatePresence>
                  </div>
                )}
              </div>

              {/* BOTTOM VIDEO TIMELINE BAR */}
              <div className="relative z-20 px-4 sm:px-6 pb-4 pt-2">
                <div className="max-w-3xl mx-auto space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] text-zinc-300 font-bold tabular-nums">
                    <span>مشغل الدعم الداخلي · بدون خروج من التطبيق</span>
                    <span>
                      {formatTimer(elapsedSeconds)} / {formatTimer(effectiveDuration)}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-zinc-900 rounded-full overflow-hidden border border-white/10">
                    <div
                      className="h-full bg-gradient-to-l from-amber-400 via-[#FF1744] to-rose-500 transition-all duration-700"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Early Close Confirmation Overlay */}
            <AnimatePresence>
              {confirmEarlyClose && !isCompleted && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 z-30 bg-black/85 backdrop-blur-md flex items-center justify-center p-4"
                >
                  <motion.div
                    initial={{ scale: 0.94, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.94, opacity: 0 }}
                    className="w-full max-w-sm bg-[#121218] border border-white/15 rounded-2xl p-5 space-y-4 text-right shadow-2xl"
                  >
                    <div className="flex items-center gap-2.5 text-amber-400">
                      <AlertTriangle size={20} className="shrink-0" />
                      <h4 className="text-sm font-black text-white">إغلاق الإعلان قبل اكتماله؟</h4>
                    </div>
                    <p className="text-xs text-zinc-300 leading-relaxed tabular-nums">
                      متبقي <strong className="text-amber-400">{countdown} ثانية</strong> فقط لاستلام{' '}
                      <strong className="text-white">+{expectedCoins} كوينز</strong>. إذا أغلقت الإعلان الآن فلن يتم احتساب المكافأة.
                    </p>
                    <div className="grid grid-cols-2 gap-2.5 pt-1">
                      <button
                        type="button"
                        onClick={() => setConfirmEarlyClose(false)}
                        className="min-h-[44px] rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs transition cursor-pointer"
                      >
                        متابعة المشاهدة
                      </button>
                      <button
                        type="button"
                        onClick={onClose}
                        className="min-h-[44px] rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 font-bold text-xs transition cursor-pointer"
                      >
                        إغلاق الآن
                      </button>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </ViewportPortal>
  );
}
