import React, { useState, useEffect } from 'react';
import { LayoutGrid, Grid3x3, LayoutList } from 'lucide-react';

export type GlobalViewLayoutMode = 'grid3' | 'grid2' | 'list';

const STORAGE_KEY = 'anime_app_global_layout_mode_v2';
const EVENT_NAME = 'anime_global_layout_mode_change';

export function getSavedLayoutMode(): GlobalViewLayoutMode {
  try {
    const val = localStorage.getItem(STORAGE_KEY);
    if (val === 'grid3' || val === 'grid2' || val === 'list') {
      return val;
    }
  } catch {
    // ignore storage errors
  }
  return 'grid3';
}

export function setSavedLayoutMode(mode: GlobalViewLayoutMode) {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // ignore storage errors
  }
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: mode }));
}

export function useGlobalLayoutMode(): [GlobalViewLayoutMode, () => void] {
  const [mode, setMode] = useState<GlobalViewLayoutMode>(() => getSavedLayoutMode());

  useEffect(() => {
    const handleSync = (e: Event) => {
      const customEvent = e as CustomEvent<GlobalViewLayoutMode>;
      if (customEvent.detail) {
        setMode(customEvent.detail);
      } else {
        setMode(getSavedLayoutMode());
      }
    };

    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        setMode(getSavedLayoutMode());
      }
    };

    window.addEventListener(EVENT_NAME, handleSync);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener(EVENT_NAME, handleSync);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const cycleLayoutMode = () => {
    const nextMode: GlobalViewLayoutMode =
      mode === 'grid3' ? 'grid2' : mode === 'grid2' ? 'list' : 'grid3';
    setSavedLayoutMode(nextMode);
  };

  return [mode, cycleLayoutMode];
}

export function getLayoutGridClasses(mode: GlobalViewLayoutMode): string {
  if (mode === 'list') {
    return 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-1.5 sm:gap-2';
  }
  if (mode === 'grid2') {
    return 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-0 border-t border-r border-white/10';
  }
  return 'grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-0 border-t border-r border-white/10';
}

// Helper to format anime type into max 3 English characters
export function getShortTypeCode(rawType?: string): string {
  if (!rawType) return 'TV';
  const upper = String(rawType).trim().toUpperCase();
  if (upper.includes('MOVIE') || upper === 'MOV' || upper.includes('فيلم')) return 'MOV';
  if (upper.includes('SPECIAL') || upper === 'SPE' || upper.includes('خاص')) return 'SPE';
  if (upper.includes('OVA')) return 'OVA';
  if (upper.includes('ONA')) return 'ONA';
  if (upper.includes('MUSIC') || upper === 'MUS') return 'MUS';
  if (upper === 'TV' || upper === 'TV_SHORT') return 'TV';
  return upper.replace(/[^A-Z0-9]/g, '').slice(0, 3) || 'TV';
}

// Helper to translate season to Arabic or formatted label ONLY when real season/year data exists
export function getArabicSeasonLabel(season?: string | null, year?: string | number | null): string | null {
  const sMap: Record<string, string> = {
    winter: 'شتاء',
    spring: 'ربيع',
    summer: 'صيف',
    fall: 'خريف',
    autumn: 'خريف',
  };
  const s = season ? sMap[String(season).trim().toLowerCase()] || '' : '';
  const y = year && String(year).trim() !== '0' && String(year).trim() !== 'null' ? String(year).trim() : '';
  if (s && y) return `${s} ${y}`;
  if (y) return y;
  if (s) return s;
  return null;
}

// Normalize status accurately whether input is English or Arabic
export function normalizeAnimeStatusAr(rawStatus?: string | null): { label: string; colorClass: string } | null {
  if (!rawStatus) return null;
  const s = String(rawStatus).trim().toLowerCase();

  if (
    s === 'مستمر' ||
    s === 'يعرض حالياً' ||
    s === 'يعرض الآن' ||
    s.includes('currently airing') ||
    s === 'ongoing' ||
    s === 'releasing' ||
    s === 'airing'
  ) {
    return {
      label: 'يعرض حالياً',
      colorClass: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400',
    };
  }

  if (
    s === 'مكتمل' ||
    s.includes('finished') ||
    s === 'completed' ||
    s === 'complete'
  ) {
    return {
      label: 'مكتمل',
      colorClass: 'bg-blue-500/15 border-blue-500/30 text-blue-400',
    };
  }

  if (
    s === 'قادم' ||
    s.includes('not yet') ||
    s === 'upcoming' ||
    s === 'unreleased'
  ) {
    return {
      label: 'قادم',
      colorClass: 'bg-amber-500/15 border-amber-500/30 text-amber-400',
    };
  }

  return null;
}

export function LayoutModeToggleButton({
  mode,
  onToggle,
  className = '',
}: {
  mode: GlobalViewLayoutMode;
  onToggle: () => void;
  className?: string;
}) {
  const getTitle = () => {
    if (mode === 'grid3') return 'شبكة بطاقات صغيرة (اضغط للتبديل إلى بطاقات كبيرة)';
    if (mode === 'grid2') return 'شبكة بطاقات كبيرة (اضغط للتبديل إلى قائمة)';
    return 'عرض قائمة (اضغط للتبديل إلى شبكة بطاقات صغيرة)';
  };

  return (
    <button
      type="button"
      onClick={onToggle}
      title={getTitle()}
      aria-label={getTitle()}
      className={`p-2 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white hover:border-neutral-700 transition active:scale-95 cursor-pointer flex items-center justify-center shrink-0 ${className}`}
    >
      {mode === 'grid3' && <Grid3x3 size={16} />}
      {mode === 'grid2' && <LayoutGrid size={16} />}
      {mode === 'list' && <LayoutList size={16} />}
    </button>
  );
}
