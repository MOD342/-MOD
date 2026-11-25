import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Mail,
  Lock,
  UserPlus,
  LogIn,
  AlertCircle,
  X,
  CheckCircle,
  RefreshCw,
  KeyRound,
  Eye,
  EyeOff,
  ArrowRight,
  BookmarkCheck,
  Swords,
  ShieldCheck,
  User,
} from 'lucide-react';
import ViewportPortal from './ViewportPortal';

export interface AuthModalProps {
  isOpen: boolean;
  authMode: 'login' | 'register' | 'forgot';
  setAuthMode: (mode: 'login' | 'register' | 'forgot') => void;
  authEmail: string;
  setAuthEmail: (v: string) => void;
  authPassword: string;
  setAuthPassword: (v: string) => void;
  authConfirmPassword: string;
  setAuthConfirmPassword: (v: string) => void;
  authDisplayName: string;
  setAuthDisplayName: (v: string) => void;
  showPassword: boolean;
  setShowPassword: (v: boolean) => void;
  authError: string;
  authSuccess: string;
  clearNotices: () => void;
  loading: boolean;
  onClose: () => void;
  onLogin: (e: React.FormEvent) => void;
  onRegister: (e: React.FormEvent) => void;
  onForgotPassword: (e: React.FormEvent) => void;
  onGoogleSignIn: () => void;
  onInstantGuestLogin: () => void;
  onOpenLegal: (section: 'terms' | 'privacy') => void;
}

export default function AuthModal({
  isOpen,
  authMode,
  setAuthMode,
  authEmail,
  setAuthEmail,
  authPassword,
  setAuthPassword,
  authConfirmPassword,
  setAuthConfirmPassword,
  authDisplayName,
  setAuthDisplayName,
  showPassword,
  setShowPassword,
  authError,
  authSuccess,
  clearNotices,
  loading,
  onClose,
  onLogin,
  onRegister,
  onForgotPassword,
  onGoogleSignIn,
  onInstantGuestLogin,
  onOpenLegal,
}: AuthModalProps) {
  const handleSwitchMode = (mode: 'login' | 'register' | 'forgot') => {
    setAuthMode(mode);
    clearNotices();
  };

  return (
    <ViewportPortal>
      <AnimatePresence>
        {isOpen && (
          <div
            className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md"
            style={{
              height: 'var(--vv-height, 100dvh)',
              paddingTop: 'calc(var(--safe-top, 0px) + 0.75rem)',
              paddingBottom: 'calc(var(--safe-bottom, 0px) + 0.75rem)',
              paddingLeft: 'calc(var(--safe-left, 0px) + 0.75rem)',
              paddingRight: 'calc(var(--safe-right, 0px) + 0.75rem)',
            }}
            dir="rtl"
          >
            {/* Backdrop click dismissal */}
            <div
              className="absolute inset-0"
              onClick={onClose}
              aria-hidden="true"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 12 }}
              transition={{ duration: 0.16, ease: 'easeOut' }}
              className="theme-keep-dark relative w-full max-w-md md:max-w-3xl bg-[#0c0c12] border border-white/10 rounded-3xl shadow-[0_24px_70px_rgba(0,0,0,0.92)] overflow-hidden grid grid-cols-1 md:grid-cols-12"
              style={{
                maxHeight:
                  'calc(var(--vv-height, 100dvh) - var(--safe-top, 0px) - var(--safe-bottom, 0px) - 1.5rem)',
              }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="auth-modal-title"
            >
              {/* Brand Showcase Side (Desktop / Tablet Landscape) */}
              <div
                className="hidden md:flex md:col-span-5 flex-col justify-between p-7 border-l border-white/[0.07] relative overflow-hidden"
                style={{
                  background:
                    'radial-gradient(circle at top right, rgba(255, 23, 68, 0.2), rgba(12, 12, 18, 0.96) 62%), #08080d',
                }}
              >
                <div className="space-y-5 relative z-10">
                  <div className="inline-flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl bg-[#FF1744] text-white flex items-center justify-center font-black text-base shadow-lg shadow-[#FF1744]/25">
                      O
                    </div>
                    <div>
                      <div className="text-sm font-black text-white tracking-tight">أوتاكو MOD</div>
                      <div className="text-[11px] text-neutral-400 font-medium">منصة الأنمي والمانجا</div>
                    </div>
                  </div>

                  <div className="space-y-2 pt-2">
                    <h2 className="text-xl font-black text-white leading-snug">
                      كل أعمالك المفضلة وتقدمك في مكان واحد
                    </h2>
                    <p className="text-xs text-neutral-400 leading-relaxed">
                      سجل دخولك لحفظ قوائم المشاهدة والقراءة سحابياً والوصول لها من أي جهاز.
                    </p>
                  </div>
                </div>

                <div className="space-y-3 relative z-10 pt-6">
                  {[
                    {
                      icon: BookmarkCheck,
                      title: 'مزامنة سحابية فورية',
                      desc: 'حفظ الحلقات والفصول والقوائم المخصصة تلقائياً.',
                      accent: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
                    },
                    {
                      icon: Swords,
                      title: 'ساحة الأوتاكو والتحديات',
                      desc: 'نافس الآخرين واجمع النقاط والأوسمة والألقاب.',
                      accent: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
                    },
                    {
                      icon: ShieldCheck,
                      title: 'ملف شخصي مخصص',
                      desc: 'إطارات وأغلفة ومقتنيات خاصة تعكس ذوقك.',
                      accent: 'text-sky-400 bg-sky-500/10 border-sky-500/20',
                    },
                  ].map((item) => {
                    const Icon = item.icon;
                    return (
                      <div
                        key={item.title}
                        className="flex items-start gap-3 p-3 rounded-2xl bg-white/[0.03] border border-white/[0.06]"
                      >
                        <div
                          className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${item.accent}`}
                        >
                          <Icon size={16} />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-black text-white">{item.title}</div>
                          <div className="text-[11px] text-neutral-400 mt-0.5 leading-snug">
                            {item.desc}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Interactive Auth Form Column */}
              <div className="md:col-span-7 p-5 sm:p-7 overflow-y-auto flex flex-col justify-between gap-4">
                <div className="space-y-4">
                  {/* Top Bar: Mobile Identity + Close */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="md:hidden w-9 h-9 rounded-xl bg-[#FF1744] text-white flex items-center justify-center font-black text-sm shrink-0">
                        O
                      </div>
                      <div className="min-w-0">
                        <h3 id="auth-modal-title" className="text-base sm:text-lg font-black text-white truncate">
                          {authMode === 'login'
                            ? 'مرحباً بعودتك'
                            : authMode === 'register'
                            ? 'إنشاء حساب جديد'
                            : 'استعادة كلمة المرور'}
                        </h3>
                        <p className="text-[11px] text-neutral-400 truncate">
                          {authMode === 'login'
                            ? 'سجل دخولك لمتابعة مكتبتك وتقدمك'
                            : authMode === 'register'
                            ? 'أنشئ حساباً مجانياً خلال ثوانٍ'
                            : 'أدخل بريدك الإلكتروني لإرسال رابط الاستعادة'}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={onClose}
                      aria-label="إغلاق"
                      className="w-11 h-11 rounded-xl bg-[#15151f] hover:bg-[#1e1e2b] border border-white/10 text-neutral-300 hover:text-white flex items-center justify-center cursor-pointer transition shrink-0"
                    >
                      <X size={18} />
                    </button>
                  </div>

                  {/* Mode Switcher (Login / Register) or Back Link (Forgot) */}
                  {authMode === 'forgot' ? (
                    <button
                      type="button"
                      onClick={() => handleSwitchMode('login')}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-neutral-300 hover:text-white transition cursor-pointer py-1"
                    >
                      <ArrowRight size={15} />
                      <span>العودة لتسجيل الدخول</span>
                    </button>
                  ) : (
                    <div className="grid grid-cols-2 gap-1.5 p-1 bg-[#07070b] border border-white/[0.08] rounded-xl">
                      <button
                        type="button"
                        onClick={() => handleSwitchMode('login')}
                        className={`min-h-[42px] rounded-lg text-xs font-black transition cursor-pointer ${
                          authMode === 'login'
                            ? 'bg-[#FF1744] text-white shadow-sm'
                            : 'text-neutral-400 hover:text-white'
                        }`}
                      >
                        تسجيل الدخول
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSwitchMode('register')}
                        className={`min-h-[42px] rounded-lg text-xs font-black transition cursor-pointer ${
                          authMode === 'register'
                            ? 'bg-[#FF1744] text-white shadow-sm'
                            : 'text-neutral-400 hover:text-white'
                        }`}
                      >
                        حساب جديد
                      </button>
                    </div>
                  )}

                  {/* Alerts */}
                  {authError && (
                    <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-xs font-bold flex items-start gap-2 text-right leading-relaxed">
                      <AlertCircle size={15} className="mt-0.5 shrink-0 text-red-400" />
                      <span>{authError}</span>
                    </div>
                  )}

                  {authSuccess && (
                    <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs font-bold flex items-start gap-2 text-right leading-relaxed">
                      <CheckCircle size={15} className="mt-0.5 shrink-0 text-emerald-400" />
                      <span>{authSuccess}</span>
                    </div>
                  )}

                  {/* Quick Google Sign-In */}
                  {authMode !== 'forgot' && (
                    <>
                      <button
                        type="button"
                        disabled={loading}
                        onClick={onGoogleSignIn}
                        className="w-full min-h-[48px] bg-white hover:bg-neutral-100 text-zinc-900 font-black text-xs px-4 rounded-xl transition cursor-pointer flex items-center justify-center gap-2.5 shadow-md active:scale-[0.99] disabled:opacity-50"
                      >
                        <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0">
                          <path
                            fill="#EA4335"
                            d="M12 5c1.6 0 3 .6 4.1 1.7l3.1-3.1C17.3 1.8 14.8 1 12 1 7.4 1 3.5 3.6 1.6 7.4l3.7 2.8C6.2 7.2 8.9 5 12 5z"
                          />
                          <path
                            fill="#4285F4"
                            d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.6l3.7 2.9c2.2-2 3.7-5 3.7-8.7z"
                          />
                          <path
                            fill="#FBBC05"
                            d="M5.3 14.8c-.2-.8-.4-1.6-.4-2.5s.2-1.7.4-2.5L1.6 7C.6 9 0 11.2 0 13.5s.6 4.5 1.6 6.5l3.7-2.9z"
                          />
                          <path
                            fill="#34A853"
                            d="M12 24c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3.1 0-5.8-2.1-6.7-5l-3.7 2.8C3.5 21.4 7.4 24 12 24z"
                          />
                        </svg>
                        <span>المتابعة عبر Google</span>
                      </button>

                      <div className="relative flex items-center justify-center py-0.5">
                        <div className="absolute inset-x-0 h-px bg-white/[0.08]" />
                        <span className="relative bg-[#0c0c12] px-3 text-[11px] text-neutral-400 font-bold">
                          أو بالبريد الإلكتروني
                        </span>
                      </div>
                    </>
                  )}

                  {/* Form */}
                  <form
                    onSubmit={
                      authMode === 'login'
                        ? onLogin
                        : authMode === 'register'
                        ? onRegister
                        : onForgotPassword
                    }
                    className="space-y-3"
                  >
                    {authMode === 'register' && (
                      <div className="space-y-1.5 text-right">
                        <label className="text-xs font-bold text-neutral-300 block">
                          الاسم المعروض
                        </label>
                        <div className="relative">
                          <input
                            type="text"
                            required
                            value={authDisplayName}
                            onChange={(e) => setAuthDisplayName(e.target.value)}
                            placeholder="اكتب اسمك في المنصة"
                            className="w-full min-h-[46px] bg-[#07070b] border border-white/10 focus:border-[#FF1744] rounded-xl pr-10 pl-3.5 text-sm text-white placeholder-neutral-500 outline-none transition text-right"
                          />
                          <User
                            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-500"
                            size={15}
                          />
                        </div>
                      </div>
                    )}

                    <div className="space-y-1.5 text-right">
                      <label className="text-xs font-bold text-neutral-300 block">
                        البريد الإلكتروني
                      </label>
                      <div className="relative">
                        <input
                          type="email"
                          required
                          dir="ltr"
                          value={authEmail}
                          onChange={(e) => setAuthEmail(e.target.value)}
                          placeholder="name@example.com"
                          className="w-full min-h-[46px] bg-[#07070b] border border-white/10 focus:border-[#FF1744] rounded-xl pr-10 pl-3.5 text-sm text-white placeholder-neutral-500 outline-none transition text-left font-mono"
                        />
                        <Mail
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-500"
                          size={15}
                        />
                      </div>
                    </div>

                    {authMode !== 'forgot' && (
                      <div className="space-y-1.5 text-right">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-neutral-300">
                            كلمة المرور
                          </label>
                          {authMode === 'login' && (
                            <button
                              type="button"
                              onClick={() => handleSwitchMode('forgot')}
                              className="text-[11px] font-bold text-neutral-400 hover:text-[#FF1744] transition cursor-pointer"
                            >
                              نسيت كلمة المرور؟
                            </button>
                          )}
                        </div>
                        <div className="relative">
                          <input
                            type={showPassword ? 'text' : 'password'}
                            required
                            dir="ltr"
                            value={authPassword}
                            onChange={(e) => setAuthPassword(e.target.value)}
                            placeholder="••••••••"
                            className="w-full min-h-[46px] bg-[#07070b] border border-white/10 focus:border-[#FF1744] rounded-xl pr-10 pl-11 text-sm text-white placeholder-neutral-500 outline-none transition text-left"
                          />
                          <Lock
                            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-500"
                            size={15}
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                            className="absolute left-1.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-lg flex items-center justify-center text-neutral-400 hover:text-white transition cursor-pointer"
                          >
                            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                      </div>
                    )}

                    {authMode === 'register' && (
                      <div className="space-y-1.5 text-right">
                        <label className="text-xs font-bold text-neutral-300 block">
                          تأكيد كلمة المرور
                        </label>
                        <div className="relative">
                          <input
                            type={showPassword ? 'text' : 'password'}
                            required
                            dir="ltr"
                            value={authConfirmPassword}
                            onChange={(e) => setAuthConfirmPassword(e.target.value)}
                            placeholder="••••••••"
                            className="w-full min-h-[46px] bg-[#07070b] border border-white/10 focus:border-[#FF1744] rounded-xl pr-10 pl-3.5 text-sm text-white placeholder-neutral-500 outline-none transition text-left"
                          />
                          <KeyRound
                            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-500"
                            size={15}
                          />
                        </div>
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full min-h-[48px] bg-[#FF1744] hover:bg-[#e1143c] disabled:opacity-50 active:scale-[0.99] text-white text-xs sm:text-sm font-black rounded-xl transition cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-[#FF1744]/20 mt-1"
                    >
                      {loading ? (
                        <RefreshCw size={15} className="animate-spin" />
                      ) : authMode === 'login' ? (
                        <LogIn size={15} />
                      ) : authMode === 'register' ? (
                        <UserPlus size={15} />
                      ) : (
                        <KeyRound size={15} />
                      )}
                      <span>
                        {loading
                          ? 'جاري المعالجة...'
                          : authMode === 'login'
                          ? 'تسجيل الدخول'
                          : authMode === 'register'
                          ? 'إنشاء الحساب'
                          : 'إرسال رابط الاستعادة'}
                      </span>
                    </button>
                  </form>

                  {/* Instant Guest Entry */}
                  {authMode !== 'forgot' && (
                    <button
                      type="button"
                      onClick={onInstantGuestLogin}
                      disabled={loading}
                      className="w-full min-h-[44px] bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-neutral-200 text-xs font-bold px-4 rounded-xl transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      <User size={14} className="text-emerald-400" />
                      <span>الدخول السريع كزائر بدون تسجيل</span>
                    </button>
                  )}
                </div>

                {/* Legal Disclosure Footer */}
                {authMode !== 'forgot' && (
                  <p className="text-center text-[11px] text-neutral-400 leading-relaxed pt-1 border-t border-white/[0.06]">
                    بمتابعتك، أنت توافق على{' '}
                    <button
                      type="button"
                      onClick={() => onOpenLegal('terms')}
                      className="text-sky-400 hover:underline font-bold cursor-pointer"
                    >
                      اتفاقية الاستخدام
                    </button>{' '}
                    و{' '}
                    <button
                      type="button"
                      onClick={() => onOpenLegal('privacy')}
                      className="text-emerald-400 hover:underline font-bold cursor-pointer"
                    >
                      سياسة الخصوصية
                    </button>
                    .
                  </p>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </ViewportPortal>
  );
}
