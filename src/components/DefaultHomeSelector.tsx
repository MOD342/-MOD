import React, { useEffect, useState } from 'react';
import { Tv, BookOpen, CheckCircle2, Home, Sparkles } from 'lucide-react';
import {
  getDefaultHomeMode,
  setDefaultHomeMode,
  HOME_MODE_CHANGED_EVENT,
  reopenOnboarding,
  type HomeMode,
} from '../utils/appPreferences';

const HOME_OPTIONS: {
  id: HomeMode;
  label: string;
  subtitle: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  accentClass: string;
  selectedBorder: string;
}[] = [
  {
    id: 'anime',
    label: 'رئيسية الأنمي',
    subtitle: 'أحدث الحلقات، جدول البث، والموسم الحالي',
    icon: Tv,
    accentClass: 'text-[#FF1744]',
    selectedBorder: 'border-[#FF1744] ring-1 ring-[#FF1744]/40 bg-[#181822]',
  },
  {
    id: 'manga',
    label: 'رئيسية المانجا والمانهوا',
    subtitle: 'فصول المانجا، المانهوا الكورية، والقراءة السريعة',
    icon: BookOpen,
    accentClass: 'text-amber-400',
    selectedBorder: 'border-amber-500 ring-1 ring-amber-500/40 bg-[#181822]',
  },
];

export default function DefaultHomeSelector({
  onReopenOnboarding,
}: {
  onReopenOnboarding?: () => void;
}) {
  const [defaultMode, setDefaultMode] = useState<HomeMode>(getDefaultHomeMode);

  useEffect(() => {
    const sync = (e: Event) => {
      const detailMode = (e as CustomEvent)?.detail?.mode;
      if (detailMode === 'anime' || detailMode === 'manga') {
        setDefaultMode(detailMode);
      } else {
        setDefaultMode(getDefaultHomeMode());
      }
    };
    window.addEventListener(HOME_MODE_CHANGED_EVENT, sync);
    return () => window.removeEventListener(HOME_MODE_CHANGED_EVENT, sync);
  }, []);

  const handleSelect = (mode: HomeMode) => {
    setDefaultMode(mode);
    setDefaultHomeMode(mode);
  };

  return (
    <section className="bg-[#101016] border border-white/[0.08] rounded-2xl p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] pb-3">
        <div className="flex items-center gap-2 min-w-0">
          <Home size={17} className="text-amber-400 shrink-0" />
          <div className="min-w-0">
            <h2 className="text-sm font-black text-white truncate">الشاشة الرئيسية الافتراضية</h2>
            <p className="text-[11px] text-neutral-400 truncate mt-0.5">
              اختر الواجهة التي يفتح عليها التطبيق تلقائياً عند التشغيل
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            if (onReopenOnboarding) {
              onReopenOnboarding();
            } else {
              reopenOnboarding();
            }
          }}
          className="min-h-[38px] px-3 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.09] border border-white/10 text-[11px] font-bold text-neutral-300 hover:text-white inline-flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shrink-0"
        >
          <Sparkles size={13} className="text-amber-400 shrink-0" />
          <span>عرض شاشة الترحيب</span>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" role="radiogroup" aria-label="الشاشة الرئيسية الافتراضية">
        {HOME_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const isSelected = defaultMode === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => handleSelect(opt.id)}
              className={`rounded-2xl p-3.5 text-right border transition-all cursor-pointer flex items-center justify-between gap-3 min-h-[76px] ${
                isSelected
                  ? opt.selectedBorder
                  : 'bg-[#08080c] border-white/[0.08] hover:border-white/25'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-11 h-11 rounded-xl bg-white/[0.05] border border-white/10 flex items-center justify-center shrink-0">
                  <Icon
                    size={20}
                    className={isSelected ? opt.accentClass : 'text-neutral-400'}
                  />
                </div>
                <div className="min-w-0 space-y-0.5">
                  <div className="text-xs sm:text-sm font-black text-white truncate">
                    {opt.label}
                  </div>
                  <p className="text-[11px] text-neutral-400 leading-snug line-clamp-2">
                    {opt.subtitle}
                  </p>
                </div>
              </div>
              {isSelected && (
                <CheckCircle2 size={18} className={`${opt.accentClass} shrink-0`} />
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
