import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import {
  Bell,
  HardDrive,
  ShieldCheck,
  Check,
  ChevronRight,
  Smartphone,
  ExternalLink,
  AlertTriangle,
} from 'lucide-react';
import { ViewportPortal } from './ViewportPortal';
import {
  UnifiedPermissionStatus,
  checkSystemPermissionsStatus,
  openSystemAppSettings,
  requestSystemNotificationsPermission,
  requestSystemStoragePermission,
} from '../utils/systemPermissions';

interface PermissionPromptModalProps {
  onComplete: () => void;
  forceOpen?: boolean;
}

export default function PermissionPromptModal({ onComplete, forceOpen = false }: PermissionPromptModalProps) {
  const [notificationState, setNotificationState] = useState<UnifiedPermissionStatus>('default');
  const [storageState, setStorageState] = useState<UnifiedPermissionStatus>('default');
  const [step, setStep] = useState<number>(0);
  const [isOpen, setIsOpen] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);
  const [redirectNotice, setRedirectNotice] = useState<string>('');

  const syncPermissionStates = useCallback(async () => {
    const summary = await checkSystemPermissionsStatus();
    setNotificationState(summary.notifications);
    setStorageState(summary.storage);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      onComplete();
      return;
    }

    const prompted = localStorage.getItem('mod_permissions_prompted');
    if (prompted === 'true' && !forceOpen) {
      onComplete();
      return;
    }

    setIsOpen(true);
    void syncPermissionStates();
  }, [onComplete, forceOpen, syncPermissionStates]);

  // Re-check permissions automatically whenever the user returns from Android System Settings
  useEffect(() => {
    if (!isOpen) return;

    const onFocusOrVisibility = () => {
      if (document.visibilityState === 'visible') {
        void syncPermissionStates();
      }
    };

    window.addEventListener('focus', onFocusOrVisibility);
    document.addEventListener('visibilitychange', onFocusOrVisibility);

    let removed = false;
    let resumeHandle: { remove: () => Promise<void> } | null = null;
    if (Capacitor.isNativePlatform()) {
      CapacitorApp.addListener('resume', () => {
        void syncPermissionStates();
      })
        .then((handle) => {
          if (removed) handle.remove().catch(() => {});
          else resumeHandle = handle;
        })
        .catch(() => {});
    }

    return () => {
      removed = true;
      window.removeEventListener('focus', onFocusOrVisibility);
      document.removeEventListener('visibilitychange', onFocusOrVisibility);
      resumeHandle?.remove().catch(() => {});
    };
  }, [isOpen, syncPermissionStates]);

  const handleRequestNotifications = async () => {
    setIsRequesting(true);
    setRedirectNotice('');
    try {
      const status = await requestSystemNotificationsPermission();
      setNotificationState(status);
      if (status === 'denied') {
        setRedirectNotice('تم حظر إذن الإشعارات من النظام. يمكنك التوجه مباشرة لإعدادات التطبيق لتفعيله.');
      }
      return status;
    } finally {
      setIsRequesting(false);
    }
  };

  const handleRequestStorage = async () => {
    setIsRequesting(true);
    setRedirectNotice('');
    try {
      const storageStatus = await requestSystemStoragePermission();
      setStorageState(storageStatus);
      if (storageStatus === 'denied') {
        setRedirectNotice('يحتاج النظام لتأكيد إذن التخزين في الأجهزة الأقدم من إعدادات التطبيق.');
      }
      return storageStatus;
    } finally {
      setIsRequesting(false);
    }
  };

  const handleNext = async () => {
    if (isRequesting) return;

    if (step === 0) {
      const status = await handleRequestNotifications();
      // إذا كان الإذن مرفوضاً بشكل دائم ولم يظهر حوار النظام، نعطي المستخدم خيار التوجيه أو الانتقال
      if (status === 'granted' || status === 'unsupported' || notificationState === 'denied') {
        setRedirectNotice('');
        setStep(1);
      } else {
        setStep(1);
      }
    } else if (step === 1) {
      await handleRequestStorage();
      setRedirectNotice('');
      setStep(2);
    } else {
      localStorage.setItem('mod_permissions_prompted', 'true');
      setIsOpen(false);
      setTimeout(() => {
        onComplete();
      }, 200);
    }
  };

  const handleOpenSettings = (target: 'app' | 'notifications' | 'storage') => {
    const redirected = openSystemAppSettings(target);
    if (!redirected) {
      setRedirectNotice('افتح إعدادات الهاتف > التطبيقات > أوتاكو MOD > الأذونات لتفعيل الصلاحية يدوياً.');
    } else {
      setRedirectNotice('تم تحويلك إلى إعدادات النظام؛ بعد تفعيل الإذن ارجع للتطبيق ليتم التحديث تلقائياً.');
    }
  };

  const handleSkipAll = () => {
    localStorage.setItem('mod_permissions_prompted', 'true');
    setIsOpen(false);
    setTimeout(() => {
      onComplete();
    }, 200);
  };

  if (!isOpen) return null;

  const isNative = Capacitor.isNativePlatform();

  return (
    <ViewportPortal>
      <div
        className="fixed inset-0 z-[999999] flex items-center justify-center p-4 overflow-y-auto"
        style={{
          paddingTop: 'calc(var(--safe-top, 0px) + 1rem)',
          paddingBottom: 'calc(var(--safe-bottom, 0px) + 1rem)',
          paddingLeft: 'calc(var(--safe-left, 0px) + 1rem)',
          paddingRight: 'calc(var(--safe-right, 0px) + 1rem)',
          minHeight: 'var(--vv-height, 100dvh)',
        }}
        dir="rtl"
      >
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-[#030305]/95 backdrop-blur-xl"
          onClick={handleSkipAll}
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          transition={{ duration: 0.16, ease: 'easeOut' }}
          className="relative w-full max-w-md bg-[#0a0a0f] border border-white/10 rounded-3xl p-5 sm:p-6 shadow-2xl flex flex-col gap-5 overflow-hidden z-10 my-auto max-h-[88dvh] overflow-y-auto"
        >
          <div className="absolute -top-24 -left-24 w-48 h-48 rounded-full bg-[#FF1744]/10 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -right-24 w-48 h-48 rounded-full bg-blue-500/10 blur-3xl pointer-events-none" />

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    i === step
                      ? 'w-6 bg-gradient-to-r from-[#FF1744] to-purple-600'
                      : i < step
                      ? 'w-1.5 bg-emerald-500'
                      : 'w-1.5 bg-white/10'
                  }`}
                />
              ))}
            </div>
            <button
              onClick={handleSkipAll}
              className="text-xs font-bold text-neutral-500 hover:text-white transition py-1 px-3 rounded-full hover:bg-white/5 cursor-pointer"
            >
              تخطي الكل
            </button>
          </div>

          <AnimatePresence mode="wait">
            {step === 0 && (
              <motion.div
                key="step-notification"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                className="space-y-4"
              >
                <div className="w-16 h-16 rounded-2xl bg-[#FF1744]/10 border border-[#FF1744]/20 flex items-center justify-center text-[#FF1744] shadow-lg shadow-[#FF1744]/5">
                  <Bell size={28} />
                </div>

                <div className="space-y-2">
                  <span className="text-[10px] font-black text-transparent bg-clip-text bg-gradient-to-r from-[#FF1744] to-purple-500 uppercase tracking-widest">
                    صلاحية التنبيهات والأخبار (POST_NOTIFICATIONS)
                  </span>
                  <h2 className="text-xl font-black text-white leading-tight">ابقَ جاهزاً ومطّلعاً دائماً!</h2>
                  <p className="text-xs text-neutral-400 leading-relaxed font-medium">
                    نحتاج للسماح بإشعارات النظام لإرسال مواعيد نزول الحلقات الجديدة وتذكيرات الأنميات المفضلة وتحديثات البطولات.
                  </p>
                </div>

                <div className="bg-[#101017] border border-white/5 rounded-2xl p-3.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400 text-xs font-black shrink-0">
                      🔔
                    </div>
                    <div className="text-right">
                      <h4 className="text-xs font-black text-white">حالة إذن الإشعارات</h4>
                      <p className="text-[10px] text-neutral-400 font-bold mt-0.5">
                        {notificationState === 'granted'
                          ? 'مفعّلة في النظام ✓'
                          : notificationState === 'denied'
                          ? 'مرفوضة — افتح إعدادات الإشعارات بالنظام لتفعيلها'
                          : 'جاهز لطلب الإذن مباشرة من النظام'}
                      </p>
                    </div>
                  </div>
                  {isNative && notificationState !== 'granted' && (
                    <button
                      type="button"
                      onClick={() => handleOpenSettings('notifications')}
                      className="shrink-0 bg-white/10 hover:bg-white/15 text-white text-[10px] font-black px-2.5 py-1.5 rounded-xl flex items-center gap-1 cursor-pointer"
                    >
                      <ExternalLink size={12} />
                      <span>إعدادات النظام</span>
                    </button>
                  )}
                </div>
              </motion.div>
            )}

            {step === 1 && (
              <motion.div
                key="step-storage-media"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                className="space-y-4"
              >
                <div className="flex items-center gap-3">
                  <div className="w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shadow-lg shadow-blue-500/5">
                    <HardDrive size={28} />
                  </div>
                </div>

                <div className="space-y-2">
                  <span className="text-[10px] font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-sky-500 uppercase tracking-widest">
                    صلاحية حفظ التنزيلات والبيانات المحلية
                  </span>
                  <h2 className="text-xl font-black text-white leading-tight">تنزيل مباشر وتخزين مستقر!</h2>
                  <p className="text-xs text-neutral-400 leading-relaxed font-medium">
                    يُستخدم هذا الإذن فقط لحفظ الحلقات والفصول عبر مدير التنزيلات الرسمي في النظام وفق معايير الخصوصية الحديثة بدون الوصول لملفاتك الخاصة.
                  </p>
                </div>

                <div className="bg-[#101017] border border-white/5 rounded-2xl p-3.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                      <Smartphone size={16} />
                    </div>
                    <div className="text-right">
                      <h4 className="text-xs font-black text-white">حالة إذن التخزين والملفات</h4>
                      <p className="text-[10px] text-neutral-400 font-bold mt-0.5">
                        {storageState === 'granted'
                          ? 'مصرّح به في النظام ✓'
                          : storageState === 'denied'
                          ? 'مرفوض — اضغط لإعادة التوجيه لأذونات التخزين'
                          : 'سيظهر طلب النظام الرسمي عند المتابعة'}
                      </p>
                    </div>
                  </div>
                  {isNative && storageState !== 'granted' && (
                    <button
                      type="button"
                      onClick={() => handleOpenSettings('storage')}
                      className="shrink-0 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-500/30 text-[10px] font-black px-2.5 py-1.5 rounded-xl flex items-center gap-1 cursor-pointer"
                    >
                      <ExternalLink size={12} />
                      <span>إدارة التخزين</span>
                    </button>
                  )}
                </div>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div
                key="step-success"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                className="text-center space-y-4 py-2 flex flex-col items-center justify-center"
              >
                <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-emerald-500 to-teal-400 p-0.5 flex items-center justify-center shadow-lg shadow-emerald-500/10 relative">
                  <div className="w-full h-full bg-[#0a0a0f] rounded-full flex items-center justify-center text-emerald-400">
                    <ShieldCheck size={42} />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <h2 className="text-xl font-black text-white">ملخص صلاحيات النظام</h2>
                  <p className="text-xs text-neutral-400 max-w-xs leading-relaxed font-medium">
                    يمكنك تعديل أي صلاحية أو التوجه مباشرة لإعدادات التطبيق بالنظام في أي وقت.
                  </p>
                </div>

                <div className="flex flex-wrap justify-center gap-2">
                  <span
                    className={`text-[10px] font-black px-3 py-1 rounded-full flex items-center gap-1 border ${
                      notificationState === 'granted'
                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                        : 'bg-amber-500/10 border-amber-500/20 text-amber-300'
                    }`}
                  >
                    <Check size={11} /> الإشعارات ({notificationState === 'granted' ? 'مفعّلة' : 'غير مفعّلة'})
                  </span>
                  <span
                    className={`text-[10px] font-black px-3 py-1 rounded-full flex items-center gap-1 border ${
                      storageState === 'granted'
                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                        : 'bg-amber-500/10 border-amber-500/20 text-amber-300'
                    }`}
                  >
                    <Check size={11} /> التخزين والتنزيلات ({storageState === 'granted' ? 'مفعّل' : 'مقيّد'})
                  </span>
                </div>

                {isNative && (notificationState !== 'granted' || storageState !== 'granted') && (
                  <button
                    type="button"
                    onClick={() => handleOpenSettings('app')}
                    className="w-full py-2.5 px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-black text-sky-300 flex items-center justify-center gap-2 cursor-pointer transition"
                  >
                    <ExternalLink size={14} />
                    <span>إعادة التوجيه إلى صفحة أذونات التطبيق في النظام</span>
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {redirectNotice && (
            <div className="bg-amber-500/10 border border-amber-500/25 text-amber-300 rounded-xl p-3 text-[11px] font-bold flex items-start gap-2">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span>{redirectNotice}</span>
            </div>
          )}

          <button
            onClick={handleNext}
            disabled={isRequesting}
            className={`w-full py-4 px-6 rounded-2xl font-black text-sm text-white shadow-xl shadow-red-500/5 transition duration-200 active:scale-98 disabled:opacity-60 flex items-center justify-center gap-2 cursor-pointer ${
              step === 2
                ? 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:brightness-110 shadow-emerald-500/10'
                : 'bg-gradient-to-r from-[#FF1744] via-rose-600 to-purple-600 hover:brightness-110 shadow-[#FF1744]/10'
            }`}
          >
            {isRequesting
              ? 'جاري طلب الإذن من النظام...'
              : step === 2
              ? 'دخول التطبيق والبدء ⚔️'
              : step === 0
              ? 'طلب إذن الإشعارات من النظام'
              : 'تأكيد صلاحية التخزين والتنزيلات'}
            <ChevronRight size={16} className="rotate-180" />
          </button>
        </motion.div>
      </div>
    </ViewportPortal>
  );
}
