import React from 'react';
import { motion } from 'motion/react';
import { Tv, BookOpen } from 'lucide-react';
import type { HomeMode } from '../utils/appPreferences';

interface HomeSwitcherBarProps {
  activeMode: HomeMode;
  onChange: (mode: HomeMode) => void;
}

const SWITCH_ITEMS: {
  id: HomeMode;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}[] = [
  { id: 'anime', label: 'الأنمي', icon: Tv },
  { id: 'manga', label: 'المانجا والمانهوا', icon: BookOpen },
];

export default function HomeSwitcherBar({ activeMode, onChange }: HomeSwitcherBarProps) {
  return (
    <div
      className="w-full px-4 md:px-8 pb-3 pt-[calc(var(--safe-top,0px)+4.15rem)] lg:pt-4"
      dir="rtl"
    >
      <div className="max-w-7xl mx-auto flex items-center justify-center sm:justify-start">
        <div
          role="tablist"
          aria-label="التبديل بين رئيسية الأنمي والمانجا"
          className="inline-flex items-center gap-1 p-1 rounded-2xl bg-[#101016] border border-white/10 shadow-sm w-full sm:w-auto max-w-md"
        >
          {SWITCH_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeMode === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => onChange(item.id)}
                className={`relative flex-1 sm:flex-initial min-h-[42px] px-4 sm:px-5 py-2 rounded-xl text-xs sm:text-sm font-black flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  isActive ? 'text-white' : 'text-neutral-400 hover:text-white'
                }`}
              >
                {isActive && (
                  <motion.span
                    layoutId="home-mode-active-pill"
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                    className={`absolute inset-0 rounded-xl shadow ${
                      item.id === 'anime' ? 'bg-[#FF1744]' : 'bg-amber-500'
                    }`}
                  />
                )}
                <Icon
                  size={16}
                  className={`relative z-10 shrink-0 ${
                    isActive && item.id === 'manga' ? 'text-black' : ''
                  }`}
                />
                <span
                  className={`relative z-10 ${
                    isActive && item.id === 'manga' ? 'text-black' : ''
                  }`}
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
