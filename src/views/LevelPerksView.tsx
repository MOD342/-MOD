import React, { useMemo } from 'react';
import { motion } from 'motion/react';
import {
  ChevronRight,
  Target,
  Lock,
  Crown,
  Star,
  Shield,
  Image,
  Sparkles,
  Gamepad2,
  ShoppingCart,
  Bot,
  Zap,
  Ticket,
  CheckCircle2,
  ShoppingBag,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { STORE_ITEMS } from '../data/storeItems';
import { useDeviceDisplay } from '../hooks/useDeviceDisplay';

interface LevelPerksViewProps {
  onBack: () => void;
  onNavigateToStore?: () => void;
}

export default function LevelPerksView({ onBack, onNavigateToStore }: LevelPerksViewProps) {
  const { userData } = useAuth();
  const display = useDeviceDisplay();
  const currentLevel = userData?.level || 1;

  // Ascending roadmap: Level 1 -> Level 100
  const perksRoadmap = useMemo(() => {
    const roadmap: {
      level: number;
      perks: { text: string; icon: any; color: string }[];
      isMilestone: boolean;
    }[] = [];

    for (let lvl = 1; lvl <= 100; lvl++) {
      const perks: { text: string; icon: any; color: string }[] = [];

      const unlockedStoreItems = STORE_ITEMS.filter((it) => it.minLevel === lvl);
      if (unlockedStoreItems.length > 0) {
        const framesCount = unlockedStoreItems.filter((i) => i.type === 'frame').length;
        const avatarsCount = unlockedStoreItems.filter((i) => i.type === 'avatar').length;
        const bannersCount = unlockedStoreItems.filter((i) => i.type === 'banner').length;
        const titles = unlockedStoreItems.filter((i) => i.type === 'title');
        const badges = unlockedStoreItems.filter((i) => i.type === 'badge');

        if (avatarsCount > 0) perks.push({ text: `فتح ${avatarsCount} صورة ملف شخصي`, icon: Image, color: 'text-blue-400' });
        if (bannersCount > 0) perks.push({ text: `فتح ${bannersCount} غلاف حساب`, icon: Image, color: 'text-indigo-400' });
        if (framesCount > 0) perks.push({ text: `فتح ${framesCount} إطار`, icon: Shield, color: 'text-cyan-400' });

        titles.forEach((t) => perks.push({ text: t.name, icon: Crown, color: 'text-yellow-400' }));
        badges.forEach((b) => perks.push({ text: b.name, icon: Star, color: 'text-orange-400' }));
      }

      if (lvl === 1) {
        perks.push({
          text: 'فتح أطوار أركيد الأوتاكو الـ 6 (مبارزة البطاقات، المحقق، عين الشارينغان، البرق، المصفوفة، وغارة الزعيم)',
          icon: Gamepad2,
          color: 'text-purple-400',
        });
      }
      if (lvl === 5) {
        perks.push({
          text: 'فتح متجر الأوتاكو وميزة التعليق في غرف المشاهدة',
          icon: ShoppingCart,
          color: 'text-emerald-400',
        });
      }
      if (lvl === 7) {
        perks.push({
          text: 'فتح الدردشة الحرة مع صديقك الأوتاكو والترشيحات التفاعلية',
          icon: Bot,
          color: 'text-rose-400',
        });
      }
      if (lvl === 10) {
        perks.push({ text: 'فتح زر صديقك الأوتاكو السريع في الشريط العلوي', icon: Bot, color: 'text-pink-400' });
        perks.push({ text: 'شارة صياد محترف مرخص في ساحة الأركيد', icon: Zap, color: 'text-amber-400' });
      }
      if (lvl === 20) {
        perks.push({ text: 'مضاعف نقاط البطولات الأسبوعية والموسمية', icon: Ticket, color: 'text-rose-400' });
      }
      if (lvl === 30) {
        perks.push({ text: 'رتبة سياف النخبة الملكي في حلبات التصويت والمناظرات', icon: Crown, color: 'text-indigo-400' });
      }
      if (lvl === 50) {
        perks.push({ text: 'وسام قائد الفيلق الأسطوري في غارة الزعيم التعاوني', icon: Star, color: 'text-yellow-400' });
      }

      const isUnlockLevel = [5, 7, 10, 20, 25, 30, 40, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100].includes(lvl);

      if (perks.length > 0) {
        roadmap.push({ level: lvl, perks, isMilestone: lvl % 10 === 0 || isUnlockLevel });
      }
    }

    return roadmap; // 1 -> 100
  }, []);

  const unlockedNodesCount = perksRoadmap.filter((item) => currentLevel >= item.level).length;
  const nextPerk = perksRoadmap.find((item) => item.level > currentLevel);
  const timelinePercent =
    perksRoadmap.length > 0 ? Math.min(100, Math.round((unlockedNodesCount / perksRoadmap.length) * 100)) : 0;

  return (
    <div className="h-full min-h-[var(--vv-height,100dvh)] bg-[#07070b] flex flex-col font-sans text-right" dir="rtl">
      {/* Header */}
      <header className="px-4 py-3.5 shrink-0 flex items-center justify-between sticky top-0 bg-[#07070b]/90 backdrop-blur-xl z-20 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="w-11 h-11 rounded-xl bg-[#111118] flex items-center justify-center border border-white/10 hover:bg-[#191923] transition cursor-pointer"
            aria-label="رجوع"
          >
            <ChevronRight size={20} className="text-white" />
          </button>
          <div>
            <h1 className="text-lg font-black text-white flex items-center gap-2">
              <Target size={18} className="text-blue-400" />
              <span>الامتيازات والمستويات</span>
            </h1>
            <p className="text-xs text-neutral-400">من المستوى 1 حتى المستوى 100</p>
          </div>
        </div>

        {onNavigateToStore && (
          <button
            onClick={onNavigateToStore}
            className="min-h-[40px] px-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-xs font-bold text-neutral-200 flex items-center gap-1.5 transition cursor-pointer"
          >
            <ShoppingBag size={14} className="text-amber-400" />
            <span>المتجر</span>
          </button>
        )}
      </header>

      <div className="flex-1 overflow-y-auto px-4 md:px-6 pt-5 pb-24 max-w-5xl w-full mx-auto hide-scrollbar">
        {/* Current Level & Next Perk Banner */}
        <div className="bg-gradient-to-br from-blue-950/50 via-[#101018] to-[#0c0c12] rounded-2xl p-5 mb-7 border border-blue-500/20 relative overflow-hidden">
          <Sparkles className="absolute -left-4 -bottom-4 text-blue-500/15 w-28 h-28 rotate-12 pointer-events-none" />
          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="text-xs font-bold text-blue-300 block mb-1">مستواك الحالي</span>
              <h2 className="text-2xl font-black text-white">المستوى {currentLevel}</h2>
              <p className="text-xs text-neutral-300 mt-1">
                {nextPerk
                  ? `المحطة القادمة: المستوى ${nextPerk.level} (${nextPerk.perks[0]?.text})`
                  : 'أحسنت! وصلت إلى قمة المسار المفتوح.'}
              </p>
            </div>
            <div className="bg-black/45 border border-white/10 rounded-xl px-4 py-2.5 text-center shrink-0">
              <span className="text-lg font-black text-blue-400 font-mono block">
                {unlockedNodesCount} / {perksRoadmap.length}
              </span>
              <span className="text-[11px] font-bold text-neutral-400">محطة مفتوحة</span>
            </div>
          </div>
        </div>

        {/* Ascending Timeline: Level 1 -> Level 100 */}
        <div className="border-r-2 border-white/10 space-y-5 pr-6 relative">
          <div
            className="absolute top-0 right-0 w-0.5 bg-gradient-to-b from-blue-500 to-cyan-400 -mr-[1px] transition-all duration-700"
            style={{ height: `${timelinePercent}%` }}
          />

          {perksRoadmap.map((item, idx) => {
            const isUnlocked = currentLevel >= item.level;
            const isNext = nextPerk?.level === item.level;
            return (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(idx, 10) * 0.03 }}
                key={item.level}
                className={`relative rounded-2xl p-4 sm:p-5 border transition-all ${
                  isUnlocked
                    ? 'bg-[#111118] border-blue-500/30 shadow-lg'
                    : isNext
                    ? 'bg-[#12121b] border-amber-500/40'
                    : 'bg-[#0c0c12] border-white/[0.06] opacity-75'
                }`}
              >
                {/* Level Node on Timeline */}
                <div
                  className={`absolute top-5 -right-[39px] w-7 h-7 rounded-lg flex items-center justify-center font-mono font-black text-xs ring-4 ring-[#07070b] z-10 ${
                    isUnlocked
                      ? 'bg-blue-600 text-white'
                      : isNext
                      ? 'bg-amber-500 text-black'
                      : 'bg-neutral-800 text-neutral-400'
                  }`}
                >
                  {item.level}
                </div>

                <div className="flex items-center justify-between gap-2 mb-3 border-b border-white/[0.06] pb-2.5">
                  <div className="flex items-center gap-2">
                    <h3
                      className={`font-black text-base ${
                        isUnlocked ? (item.isMilestone ? 'text-amber-400' : 'text-white') : 'text-neutral-300'
                      }`}
                    >
                      المستوى {item.level}
                    </h3>
                    {item.isMilestone && (
                      <span className="text-[11px] font-bold text-amber-400">· محطة رئيسية</span>
                    )}
                  </div>
                  {isUnlocked ? (
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-400">
                      <CheckCircle2 size={14} /> مفتوح
                    </span>
                  ) : isNext ? (
                    <span className="text-xs font-bold text-amber-400">التالي قريباً</span>
                  ) : (
                    <Lock size={15} className="text-neutral-500" />
                  )}
                </div>

                <div className={`grid gap-2.5 ${display.isCoverScreen ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2'}`}>
                  {item.perks.map((perk, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div
                        className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                          isUnlocked ? 'bg-white/[0.06]' : 'bg-black/40'
                        }`}
                      >
                        <perk.icon size={16} className={isUnlocked ? perk.color : 'text-neutral-500'} />
                      </div>
                      <span
                        className={`text-xs sm:text-sm font-bold leading-snug ${
                          isUnlocked ? 'text-neutral-200' : 'text-neutral-400'
                        }`}
                      >
                        {perk.text}
                      </span>
                    </div>
                  ))}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
