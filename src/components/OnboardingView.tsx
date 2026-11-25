import React, { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  Tv,
  BookOpen,
  Sun,
  Moon,
  CircleDot,
  MonitorSmartphone,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Play,
  Layers,
} from 'lucide-react';
import { useTheme, type ThemeMode } from '../contexts/ThemeContext';
import {
  getDefaultHomeMode,
  setDefaultHomeMode,
  markOnboardingCompleted,
  type HomeMode,
} from '../utils/appPreferences';
import heroArtwork from '../assets/images/onboarding_hero_artwork_1795341975256.jpg';
import animeCardArtwork from '../assets/images/choice_anime_card_1795341976426.jpg';
import mangaCardArtwork from '../assets/images/choice_manga_card_1795341976327.jpg';

interface OnboardingViewProps {
  onComplete: (chosenHome: HomeMode) => void;
}

const THEME_CHOICES: {
  id: ThemeMode;
  label: string;
  subtitle: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  canvasHex: string;
  cardHex: string;
  lineHex: string;
  accentColor: string;
}[] = [
  {
    id: 'light',
    label: 'فاتح',
    subtitle: 'واجهة مشرقة وواضحة للنهار',
    icon: Sun,
    canvasHex: '#f4f6f9',
    cardHex: '#ffffff',
    lineHex: '#cbd5e1',
    accentColor: '#f59e0b',
  },
  {
    id: 'dark',
    label: 'داكن',
    subtitle: 'تباين ليلي متوازن ومريح للعين',
    icon: Moon,
    canvasHex: '#0c0e16',
    cardHex: '#181e2c',
    lineHex: '#334155',
    accentColor: '#38bdf8',
  },
  {
    id: 'amoled',
    label: 'أموليد',
    subtitle: 'أسود نقي يبرز الألوان ويوفر الطاقة',
    icon: CircleDot,
    canvasHex: '#000000',
    cardHex: '#0b0b0f',
    lineHex: '#27272a',
    accentColor: '#ff1744',
  },
  {
    id: 'auto',
    label: 'تلقائي',
    subtitle: 'يتبدل تلقائياً حسب وضع جهازك',
    icon: MonitorSmartphone,
    canvasHex: '#0c0e16',
    cardHex: '#ffffff',
    lineHex: '#64748b',
    accentColor: '#10b981',
  },
];

const SAKURA_PETALS = [
  { id: 1, x: '12%', delay: 0, duration: 9, size: 12 },
  { id: 2, x: '28%', delay: 1.8, duration: 11, size: 10 },
  { id: 3, x: '48%', delay: 0.9, duration: 10, size: 14 },
  { id: 4, x: '68%', delay: 2.5, duration: 12, size: 11 },
  { id: 5, x: '84%', delay: 1.2, duration: 9.5, size: 13 },
];

export default function OnboardingView({ onComplete }: OnboardingViewProps) {
  const { themeMode, setThemeMode } = useTheme();
  const reduceMotion = useReducedMotion();
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [selectedHome, setSelectedHome] = useState<HomeMode>(() => getDefaultHomeMode());
  const [imgFailed, setImgFailed] = useState<Record<string, boolean>>({});

  const goToStep = (next: 0 | 1 | 2) => {
    setDirection(next > step ? 1 : -1);
    setStep(next);
  };

  const handleFinish = (modeOverride?: HomeMode) => {
    const finalHome = modeOverride || selectedHome;
    setDefaultHomeMode(finalHome);
    markOnboardingCompleted();
    onComplete(finalHome);
  };

  const slideVariants = {
    enter: (dir: number) => ({
      opacity: 0,
      x: reduceMotion ? 0 : dir * -28,
    }),
    center: {
      opacity: 1,
      x: 0,
    },
    exit: (dir: number) => ({
      opacity: 0,
      x: reduceMotion ? 0 : dir * 28,
    }),
  };

  return (
    <div
      className="fixed inset-0 z-[99990] bg-[#060608] text-white flex flex-col justify-between overflow-y-auto overflow-x-hidden select-none font-sans transition-colors duration-300"
      style={{
        paddingTop: 'calc(var(--safe-top, 0px) + 0.75rem)',
        paddingBottom: 'calc(var(--safe-bottom, 0px) + 1rem)',
        paddingLeft: 'var(--safe-left, 0px)',
        paddingRight: 'var(--safe-right, 0px)',
      }}
      dir="rtl"
    >
      {/* Floating Sakura Petals & Ambient Glow (Compositor-only transforms) */}
      {!reduceMotion && (
        <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
          {SAKURA_PETALS.map((petal) => (
            <motion.svg
              key={petal.id}
              viewBox="0 0 24 24"
              style={{ left: petal.x, width: petal.size, height: petal.size }}
              className="absolute -top-6 text-rose-400/35"
              initial={{ y: -20, x: 0, rotate: 0, opacity: 0 }}
              animate={{
                y: ['0vh', '105vh'],
                x: [0, 22, -16, 12],
                rotate: [0, 140, 280],
                opacity: [0, 0.75, 0.6, 0],
              }}
              transition={{
                duration: petal.duration,
                delay: petal.delay,
                repeat: Infinity,
                ease: 'linear',
              }}
            >
              <path
                fill="currentColor"
                d="M12 2C9.5 6.5 5 9.5 5 14.5C5 18.6 8.1 22 12 22C15.9 22 19 18.6 19 14.5C19 9.5 14.5 6.5 12 2Z"
              />
            </motion.svg>
          ))}
        </div>
      )}

      {/* Top Header: Progress Steps & Skip */}
      <header className="relative z-10 w-full max-w-5xl mx-auto px-5 sm:px-8 pt-2 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2" role="tablist" aria-label="خطوات الإعداد">
          {[0, 1, 2].map((idx) => {
            const active = step === idx;
            const passed = step > idx;
            return (
              <button
                key={idx}
                type="button"
                onClick={() => goToStep(idx as 0 | 1 | 2)}
                aria-label={`الخطوة ${idx + 1}`}
                className="min-h-[44px] px-1 flex items-center cursor-pointer"
              >
                <span
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    active
                      ? 'w-8 bg-[#FF1744]'
                      : passed
                      ? 'w-5 bg-[#FF1744]/55'
                      : 'w-4 bg-white/15'
                  }`}
                />
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => handleFinish(selectedHome)}
          className="min-h-[44px] px-3 text-xs sm:text-sm font-bold text-neutral-400 hover:text-white transition whitespace-nowrap shrink-0 cursor-pointer"
        >
          تخطي الإعداد
        </button>
      </header>

      {/* Main Stage */}
      <main className="relative z-10 flex-1 w-full max-w-5xl mx-auto px-5 sm:px-8 py-4 flex items-center justify-center">
        <AnimatePresence mode="wait" custom={direction}>
          {step === 0 && (
            <motion.section
              key="step-welcome"
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              className="w-full grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10 items-center"
            >
              {/* Illustrated Stage */}
              <div className="lg:col-span-7 relative">
                <div className="theme-keep-dark relative rounded-3xl overflow-hidden border border-white/10 shadow-2xl aspect-[16/10] sm:aspect-[16/9] bg-neutral-900">
                  {!imgFailed.hero ? (
                    <motion.img
                      src={heroArtwork}
                      alt="عالم الأنمي والمانجا"
                      referrerPolicy="no-referrer"
                      onError={() => setImgFailed((prev) => ({ ...prev, hero: true }))}
                      initial={{ scale: reduceMotion ? 1 : 1.06 }}
                      animate={{ scale: 1 }}
                      transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-indigo-950 via-slate-900 to-rose-950 flex flex-col items-center justify-center gap-3 p-6">
                      <Sparkles size={40} className="text-[#FF1744]" />
                      <span className="text-sm font-black text-white">عالم الأنمي والمانجا</span>
                    </div>
                  )}
                  <div
                    className="absolute bottom-0 inset-x-0 pt-6 pb-4 px-4 bg-gradient-to-t from-black/75 via-black/30 to-transparent flex items-center justify-between gap-2 text-xs text-white pointer-events-none"
                    style={{ textShadow: '0 2px 10px rgba(0,0,0,0.95)' }}
                  >
                    <span className="font-bold">مشاهدة · قراءة · حفظ التقدم</span>
                  </div>
                </div>
              </div>

              {/* Welcome Copy */}
              <div className="lg:col-span-5 space-y-5 text-right">
                <div className="space-y-2.5">
                  <p className="text-xs font-black text-[#FF1744] tracking-wide">
                    أهلاً بك في رحلتك الجديدة
                  </p>
                  <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-white leading-tight [text-wrap:balance]">
                    عالم الأنمي والمانجا والمانهوا بين يديك
                  </h1>
                  <p className="text-sm sm:text-base text-neutral-400 leading-relaxed">
                    خصّص واجهتك في ثوانٍ لتستمتع بمشاهدة الحلقات أو قراءة الفصول بالطريقة التي تناسب عينيك وذوقك.
                  </p>
                </div>

                <ul className="space-y-3 pt-1">
                  <li className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-[#FF1744]/12 text-[#FF1744] flex items-center justify-center shrink-0 mt-0.5">
                      <Play size={16} fill="currentColor" />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-white">تجربة أنمي متكاملة</h3>
                      <p className="text-xs text-neutral-400">أحدث الحلقات، جدول البث الأسبوعي، والأجزاء المرتبطة كاملة.</p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-amber-500/12 text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
                      <BookOpen size={16} />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-white">قراءة المانجا والمانهوا</h3>
                      <p className="text-xs text-neutral-400">قارئ سلس بوضع الويبتون والصفحات والعرض المزدوج وحفظ أوفلاين.</p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-sky-500/12 text-sky-400 flex items-center justify-center shrink-0 mt-0.5">
                      <Layers size={16} />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-white">مظهر مرن حسب راحتك</h3>
                      <p className="text-xs text-neutral-400">فاتح للنهار، داكن مريح، أموليد نقي، أو تلقائي مع نظام جهازك.</p>
                    </div>
                  </li>
                </ul>
              </div>
            </motion.section>
          )}

          {step === 1 && (
            <motion.section
              key="step-theme"
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              className="w-full max-w-4xl space-y-6"
            >
              <div className="text-center space-y-2 max-w-xl mx-auto">
                <p className="text-xs font-black text-[#FF1744]">الخطوة ١ من ٢</p>
                <h2 className="text-2xl sm:text-3xl font-black text-white [text-wrap:balance]">
                  اختر مظهر التطبيق المريح لعينيك
                </h2>
                <p className="text-xs sm:text-sm text-neutral-400">
                  جرّب الضغط على أي نمط لترى تغيّر الألوان مباشرة في الشاشة
                </p>
              </div>

              <div
                className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4"
                role="radiogroup"
                aria-label="اختيار مظهر التطبيق"
              >
                {THEME_CHOICES.map((opt) => {
                  const Icon = opt.icon;
                  const isSelected = themeMode === opt.id;
                  return (
                    <motion.button
                      key={opt.id}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      whileHover={reduceMotion ? undefined : { y: -3 }}
                      whileTap={reduceMotion ? undefined : { scale: 0.98 }}
                      onClick={() => setThemeMode(opt.id)}
                      className={`group rounded-2xl p-3.5 sm:p-4 text-right border transition-all cursor-pointer flex flex-col justify-between gap-3.5 min-h-[156px] ${
                        isSelected
                          ? 'bg-[#181822] border-[#FF1744] ring-2 ring-[#FF1744]/35 shadow-lg'
                          : 'bg-[#101016] border-white/10 hover:border-white/25'
                      }`}
                    >
                      {/* Animated Mini UI Swatch Preview */}
                      <div
                        className="theme-keep-dark w-full h-20 rounded-xl border border-white/10 overflow-hidden relative p-2.5 flex flex-col justify-between"
                        style={{
                          background:
                            opt.id === 'auto'
                              ? 'linear-gradient(135deg, #f4f6f9 50%, #0c0e16 50%)'
                              : opt.canvasHex,
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <span
                            className="h-2 w-10 rounded-full"
                            style={{ backgroundColor: opt.accentColor }}
                          />
                          {isSelected && (
                            <motion.span
                              initial={{ scale: 0.5, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              transition={{ duration: 0.18 }}
                            >
                              <CheckCircle2 size={16} className="text-[#FF1744]" />
                            </motion.span>
                          )}
                        </div>
                        <div
                          className="w-full h-9 rounded-lg p-2 flex flex-col justify-between border border-black/10"
                          style={{
                            backgroundColor:
                              opt.id === 'auto' ? 'rgba(15, 23, 42, 0.55)' : opt.cardHex,
                          }}
                        >
                          <span
                            className="block h-1.5 w-14 rounded-full"
                            style={{ backgroundColor: opt.lineHex }}
                          />
                          <span
                            className="block h-1.5 w-8 rounded-full opacity-70"
                            style={{ backgroundColor: opt.lineHex }}
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5">
                          <Icon
                            size={16}
                            className={isSelected ? 'text-[#FF1744]' : 'text-neutral-300'}
                          />
                          <span className="text-sm font-black text-white">{opt.label}</span>
                        </div>
                        <p className="text-[11px] sm:text-xs text-neutral-400 leading-snug">
                          {opt.subtitle}
                        </p>
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            </motion.section>
          )}

          {step === 2 && (
            <motion.section
              key="step-home"
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              className="w-full max-w-4xl space-y-6"
            >
              <div className="text-center space-y-2 max-w-xl mx-auto">
                <p className="text-xs font-black text-[#FF1744]">الخطوة ٢ من ٢</p>
                <h2 className="text-2xl sm:text-3xl font-black text-white [text-wrap:balance]">
                  بأي شاشة تفضل أن يبدأ التطبيق؟
                </h2>
                <p className="text-xs sm:text-sm text-neutral-400">
                  يمكنك التبديل بين الأنمي والمانجا والمانهوا بلمسة واحدة من أعلى الشاشة الرئيسية في أي وقت
                </p>
              </div>

              <div
                className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5"
                role="radiogroup"
                aria-label="اختيار الشاشة الرئيسية الافتراضية"
              >
                {/* Option 1: Anime Home */}
                <motion.button
                  type="button"
                  role="radio"
                  aria-checked={selectedHome === 'anime'}
                  whileHover={reduceMotion ? undefined : { y: -4 }}
                  whileTap={reduceMotion ? undefined : { scale: 0.985 }}
                  onClick={() => setSelectedHome('anime')}
                  className={`group rounded-3xl overflow-hidden text-right border transition-all cursor-pointer flex flex-col ${
                    selectedHome === 'anime'
                      ? 'bg-[#181822] border-[#FF1744] ring-2 ring-[#FF1744]/40 shadow-2xl'
                      : 'bg-[#101016] border-white/10 hover:border-white/25'
                  }`}
                >
                  <div className="theme-keep-dark relative w-full aspect-[4/3] sm:aspect-[16/10] bg-neutral-900 overflow-hidden">
                    {!imgFailed.anime ? (
                      <img
                        src={animeCardArtwork}
                        alt="عالم الأنمي"
                        referrerPolicy="no-referrer"
                        onError={() => setImgFailed((prev) => ({ ...prev, anime: true }))}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-rose-950 to-indigo-950 flex items-center justify-center">
                        <Tv size={44} className="text-[#FF1744]" />
                      </div>
                    )}
                    <div className="absolute top-3 left-3">
                      {selectedHome === 'anime' && (
                        <motion.span
                          initial={{ scale: 0.6, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          className="w-8 h-8 rounded-full bg-[#FF1744] text-white flex items-center justify-center shadow-lg"
                        >
                          <CheckCircle2 size={18} />
                        </motion.span>
                      )}
                    </div>
                  </div>

                  <div className="p-4 sm:p-5 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Tv
                        size={18}
                        className={selectedHome === 'anime' ? 'text-[#FF1744]' : 'text-neutral-300'}
                      />
                      <h3 className="text-base sm:text-lg font-black text-white">عالم الأنمي</h3>
                    </div>
                    <p className="text-xs sm:text-sm text-neutral-400 leading-relaxed">
                      يفتح التطبيق مباشرة على أحدث الحلقات، متابعة المشاهدة، جدول البث، والأفلام.
                    </p>
                  </div>
                </motion.button>

                {/* Option 2: Manga & Manhwa Home */}
                <motion.button
                  type="button"
                  role="radio"
                  aria-checked={selectedHome === 'manga'}
                  whileHover={reduceMotion ? undefined : { y: -4 }}
                  whileTap={reduceMotion ? undefined : { scale: 0.985 }}
                  onClick={() => setSelectedHome('manga')}
                  className={`group rounded-3xl overflow-hidden text-right border transition-all cursor-pointer flex flex-col ${
                    selectedHome === 'manga'
                      ? 'bg-[#181822] border-amber-500 ring-2 ring-amber-500/40 shadow-2xl'
                      : 'bg-[#101016] border-white/10 hover:border-white/25'
                  }`}
                >
                  <div className="theme-keep-dark relative w-full aspect-[4/3] sm:aspect-[16/10] bg-neutral-900 overflow-hidden">
                    {!imgFailed.manga ? (
                      <img
                        src={mangaCardArtwork}
                        alt="عالم المانجا والمانهوا"
                        referrerPolicy="no-referrer"
                        onError={() => setImgFailed((prev) => ({ ...prev, manga: true }))}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-amber-950 to-purple-950 flex items-center justify-center">
                        <BookOpen size={44} className="text-amber-400" />
                      </div>
                    )}
                    <div className="absolute top-3 left-3">
                      {selectedHome === 'manga' && (
                        <motion.span
                          initial={{ scale: 0.6, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          className="w-8 h-8 rounded-full bg-amber-500 text-black flex items-center justify-center shadow-lg"
                        >
                          <CheckCircle2 size={18} />
                        </motion.span>
                      )}
                    </div>
                  </div>

                  <div className="p-4 sm:p-5 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <BookOpen
                        size={18}
                        className={selectedHome === 'manga' ? 'text-amber-400' : 'text-neutral-300'}
                      />
                      <h3 className="text-base sm:text-lg font-black text-white">
                        المانجا والمانهوا
                      </h3>
                    </div>
                    <p className="text-xs sm:text-sm text-neutral-400 leading-relaxed">
                      يفتح التطبيق مباشرة على المانهوا الكورية والمانجا اليابانية واستكمال القراءة.
                    </p>
                  </div>
                </motion.button>
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </main>

      {/* Bottom Thumb-Zone Navigation Controls */}
      <footer className="relative z-10 w-full max-w-5xl mx-auto px-5 sm:px-8 pt-2">
        <div className="flex items-center justify-between gap-3">
          {step > 0 ? (
            <button
              type="button"
              onClick={() => goToStep((step - 1) as 0 | 1)}
              className="min-h-[48px] px-5 py-2.5 rounded-2xl bg-[#101016] hover:bg-[#181822] border border-white/10 text-sm font-black text-white inline-flex items-center gap-1.5 transition whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ChevronRight size={18} />
              <span>السابق</span>
            </button>
          ) : (
            <div />
          )}

          {step < 2 ? (
            <button
              type="button"
              onClick={() => goToStep((step + 1) as 1 | 2)}
              className="min-h-[48px] flex-1 sm:flex-initial sm:min-w-[200px] px-6 py-2.5 rounded-2xl bg-[#FF1744] hover:bg-rose-600 text-white text-sm font-black inline-flex items-center justify-center gap-2 shadow-lg shadow-[#FF1744]/25 transition active:scale-[0.98] whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span>{step === 0 ? 'ابدأ التخصيص' : 'التالي'}</span>
              <ChevronLeft size={18} />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleFinish(selectedHome)}
              className={`min-h-[48px] flex-1 sm:flex-initial sm:min-w-[240px] px-6 py-2.5 rounded-2xl text-sm font-black inline-flex items-center justify-center gap-2 shadow-lg transition active:scale-[0.98] whitespace-nowrap shrink-0 cursor-pointer ${
                selectedHome === 'manga'
                  ? 'bg-amber-500 hover:bg-amber-400 text-black shadow-amber-500/25'
                  : 'bg-[#FF1744] hover:bg-rose-600 text-white shadow-[#FF1744]/25'
              }`}
            >
              <span>
                {selectedHome === 'manga'
                  ? 'دخول إلى المانجا والمانهوا'
                  : 'دخول إلى عالم الأنمي'}
              </span>
              <ChevronLeft size={18} />
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
