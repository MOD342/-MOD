import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, HardDrive, ShieldCheck, Check, ChevronRight, Mic, Camera, Smartphone } from 'lucide-react';

interface PermissionPromptModalProps {
  onComplete: () => void;
  forceOpen?: boolean;
}

export default function PermissionPromptModal({ onComplete, forceOpen = false }: PermissionPromptModalProps) {
  const [notificationState, setNotificationState] = useState<'default' | 'granted' | 'denied' | 'unsupported'>('default');
  const [storageState, setStorageState] = useState<'default' | 'granted' | 'unsupported'>('default');
  const [mediaState, setMediaState] = useState<'default' | 'granted' | 'denied' | 'unsupported'>('default');
  const [step, setStep] = useState<number>(0);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const prompted = localStorage.getItem('mod_permissions_prompted');
      if (prompted === 'true' && !forceOpen) {
        onComplete();
        return;
      }
      setIsOpen(true);

      if ('Notification' in window) {
        setNotificationState(Notification.permission);
      } else {
        setNotificationState('unsupported');
      }

      if ('storage' in navigator && 'persist' in navigator.storage) {
        navigator.storage.persisted().then((persisted) => {
          if (persisted) setStorageState('granted');
        });
      } else {
        setStorageState('unsupported');
      }
    } else {
      onComplete();
    }
  }, [onComplete, forceOpen]);

  const requestNotificationPermission = async () => {
    if (typeof window === 'undefined') return 'unsupported';

    // 1. محاولة طلب إذن أندرويد الأصلي عبر إضافات Capacitor إذا كانت متوفرة في APK
    try {
      const capPlugins = (window as any).Capacitor?.Plugins;
      if (capPlugins?.PushNotifications?.requestPermissions) {
        const res = await capPlugins.PushNotifications.requestPermissions();
        if (res?.receive === 'granted') {
          setNotificationState('granted');
          return 'granted';
        }
      }
      if (capPlugins?.LocalNotifications?.requestPermissions) {
        const res = await capPlugins.LocalNotifications.requestPermissions();
        if (res?.display === 'granted') {
          setNotificationState('granted');
          return 'granted';
        }
      }
    } catch (e) {
      console.warn('Capacitor notification plugin fallback:', e);
    }

    // 2. طلب إذن المتصفح / WebView القياسي
    if ('Notification' in window) {
      try {
        const permission = await Notification.requestPermission();
        setNotificationState(permission);
        return permission;
      } catch (err) {
        console.warn('Error requesting notification permission:', err);
        return 'denied';
      }
    } else {
      setNotificationState('unsupported');
      return 'unsupported';
    }
  };

  const requestMediaPermissions = async () => {
    if (typeof window === 'undefined') return 'unsupported';

    // طلب إذن الميكروفون (للبحث الصوتي) والكاميرا (للصورة الشخصية) ليظهر حوار أندرويد الأصلي
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
        setMediaState('granted');
        return 'granted';
      } catch (err) {
        console.warn('Media permission declined or unavailable:', err);
        setMediaState('denied');
        return 'denied';
      }
    }
    setMediaState('unsupported');
    return 'unsupported';
  };

  const requestStoragePersist = async () => {
    if (typeof window === 'undefined') return false;

    try {
      const capPlugins = (window as any).Capacitor?.Plugins;
      if (capPlugins?.Filesystem?.requestPermissions) {
        await capPlugins.Filesystem.requestPermissions();
      }
    } catch {}

    if ('storage' in navigator && 'persist' in navigator.storage) {
      try {
        const persisted = await navigator.storage.persist();
        if (persisted) {
          setStorageState('granted');
        }
        return persisted;
      } catch (err) {
        console.warn('Error requesting storage persistence:', err);
        return false;
      }
    } else {
      setStorageState('unsupported');
      return false;
    }
  };

  const handleNext = async () => {
    if (step === 0) {
      await requestNotificationPermission();
      setStep(1);
    } else if (step === 1) {
      await requestMediaPermissions();
      await requestStoragePersist();
      setStep(2);
    } else {
      localStorage.setItem('mod_permissions_prompted', 'true');
      setIsOpen(false);
      setTimeout(() => {
        onComplete();
      }, 250);
    }
  };

  const handleSkipAll = () => {
    localStorage.setItem('mod_permissions_prompted', 'true');
    setIsOpen(false);
    setTimeout(() => {
      onComplete();
    }, 250);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[999999] flex items-center justify-center p-4 overflow-hidden" dir="rtl">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-[#030305]/95 backdrop-blur-xl"
        onClick={handleSkipAll}
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        transition={{ type: 'spring', duration: 0.4 }}
        className="relative w-full max-w-md bg-[#0a0a0f] border border-white/10 rounded-3xl p-6 shadow-2xl flex flex-col gap-6 overflow-hidden z-10"
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
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-5"
            >
              <div className="w-16 h-16 rounded-2xl bg-[#FF1744]/10 border border-[#FF1744]/20 flex items-center justify-center text-[#FF1744] shadow-lg shadow-[#FF1744]/5">
                <Bell size={28} className="animate-bounce" />
              </div>

              <div className="space-y-2">
                <span className="text-[10px] font-black text-transparent bg-clip-text bg-gradient-to-r from-[#FF1744] to-purple-500 uppercase tracking-widest">
                  صلاحية التنبيهات والأخبار (POST_NOTIFICATIONS)
                </span>
                <h2 className="text-xl font-black text-white leading-tight">ابقَ جاهزاً ومطّلعاً دائماً!</h2>
                <p className="text-xs text-neutral-400 leading-relaxed font-medium">
                  نحتاج للسماح بالإشعارات لإرسال مواعيد نزول الحلقات الجديدة وتذكيرات الأنميات المفضلة وتحديثات البطولات والمنافسات داخل التطبيق.
                </p>
              </div>

              <div className="bg-[#101017] border border-white/5 rounded-2xl p-3.5 flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400 text-xs font-black">
                  🛡️
                </div>
                <div className="text-right">
                  <h4 className="text-xs font-black text-white">إشعار ذكي بدون إزعاج</h4>
                  <p className="text-[10px] text-neutral-500 font-bold mt-0.5">
                    لن نرسل رسائل عشوائية أبداً، ويمكنك التحكم بها من إعدادات الهاتف.
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {step === 1 && (
            <motion.div
              key="step-storage-media"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-5"
            >
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shadow-lg shadow-blue-500/5">
                  <HardDrive size={26} className="animate-pulse" />
                </div>
                <div className="w-14 h-14 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 shadow-lg shadow-purple-500/5">
                  <Mic size={26} />
                </div>
                <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shadow-lg shadow-emerald-500/5">
                  <Camera size={26} />
                </div>
              </div>

              <div className="space-y-2">
                <span className="text-[10px] font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-sky-500 uppercase tracking-widest">
                  صلاحيات الوسائط والبحث الصوتي والتخزين
                </span>
                <h2 className="text-xl font-black text-white leading-tight">تخزين مستقر وبحث صوتي فوري!</h2>
                <p className="text-xs text-neutral-400 leading-relaxed font-medium">
                  يتيح هذا الإذن استخدام البحث الصوتي عن الأنمي بالميكروفون، ورفع الصور الشخصية والبنرات من الاستوديو، وحفظ كاش الحلقات وبيانات حسابك بأمان.
                </p>
              </div>

              <div className="bg-[#101017] border border-white/5 rounded-2xl p-3.5 flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 text-xs font-black">
                  <Smartphone size={16} />
                </div>
                <div className="text-right">
                  <h4 className="text-xs font-black text-white">متوافق مع نظام أندرويد الحديث</h4>
                  <p className="text-[10px] text-neutral-500 font-bold mt-0.5">
                    تظهر نافذة أندرويد الرسمية لمنح الإذن عند تفعيل الميكروفون والتخزين.
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="step-success"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="text-center space-y-5 py-4 flex flex-col items-center justify-center"
            >
              <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-emerald-500 to-teal-400 p-0.5 flex items-center justify-center shadow-lg shadow-emerald-500/10 relative">
                <div className="w-full h-full bg-[#0a0a0f] rounded-full flex items-center justify-center text-emerald-400">
                  <ShieldCheck size={42} className="animate-bounce" />
                </div>
                <motion.div
                  className="absolute inset-0 rounded-full border border-emerald-400 opacity-50"
                  animate={{ scale: [1, 1.25, 1], opacity: [0.5, 0, 0.5] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
              </div>

              <div className="space-y-2">
                <h2 className="text-xl font-black text-white">تم تهيئة الصلاحيات بنجاح!</h2>
                <p className="text-xs text-neutral-400 max-w-xs leading-relaxed font-medium">
                  أنت الآن مستعد تماماً لدخول النسخة الكاملة والمزودة بكل قنوات المزامنة الآمنة والإشعارات والوسائط لمنصة أنمي MOD.
                </p>
              </div>

              <div className="flex flex-wrap justify-center gap-2">
                <span className="bg-emerald-500/10 border border-emerald-500/15 text-emerald-400 text-[10px] font-black px-3 py-1 rounded-full flex items-center gap-1">
                  <Check size={11} /> التنبيهات ({notificationState === 'granted' ? 'مفعلة' : 'جاهزة'})
                </span>
                <span className="bg-emerald-500/10 border border-emerald-500/15 text-emerald-400 text-[10px] font-black px-3 py-1 rounded-full flex items-center gap-1">
                  <Check size={11} /> الصوت والوسائط ({mediaState === 'granted' ? 'مفعلة' : 'جاهزة'})
                </span>
                <span className="bg-emerald-500/10 border border-emerald-500/15 text-emerald-400 text-[10px] font-black px-3 py-1 rounded-full flex items-center gap-1">
                  <Check size={11} /> التخزين المحمي
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <button
          onClick={handleNext}
          className={`w-full py-4 px-6 rounded-2xl font-black text-sm text-white shadow-xl shadow-red-500/5 transition duration-300 transform active:scale-98 flex items-center justify-center gap-2 cursor-pointer ${
            step === 2
              ? 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:brightness-110 shadow-emerald-500/10'
              : 'bg-gradient-to-r from-[#FF1744] via-rose-600 to-purple-600 hover:brightness-110 shadow-[#FF1744]/10'
          }`}
        >
          {step === 2
            ? 'دخول التطبيق والبدء ⚔️'
            : step === 0
            ? 'منح صلاحية الإشعارات والتالي'
            : 'منح صلاحية الصوت والوسائط والتخزين'}
          <ChevronRight size={16} className="rotate-180" />
        </button>
      </motion.div>
    </div>
  );
}
