import React from 'react';
import { Sun, Moon, MonitorSmartphone, CheckCircle2, Palette, CircleDot } from 'lucide-react';
import { ThemeMode, useTheme } from '../contexts/ThemeContext';
import { useDeviceDisplay } from '../hooks/useDeviceDisplay';

interface ThemeOption {
  id: ThemeMode;
  label: string;
  subtitle: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  canvasHex: string;
  cardHex: string;
  lineHex: string;
  accentBg: string;
}

const THEME_OPTIONS: ThemeOption[] = [
  {
    id: 'light',
    label: 'فاتح',
    subtitle: 'مريح للنهار والإضاءة القوية',
    icon: Sun,
    canvasHex: '#f1f5f9',
    cardHex: '#ffffff',
    lineHex: '#cbd5e1',
    accentBg: 'text-amber-500',
  },
  {
    id: 'dark',
    label: 'داكن',
    subtitle: 'تباين ليلي متوازن وأنيق',
    icon: Moon,
    canvasHex: '#0c0e16',
    cardHex: '#181e2c',
    lineHex: '#334155',
    accentBg: 'text-sky-400',
  },
  {
    id: 'amoled',
    label: 'أموليد',
    subtitle: 'أسود نقي لتوفير طاقة الشاشة',
    icon: CircleDot,
    canvasHex: '#000000',
    cardHex: '#0b0b0f',
    lineHex: '#27272a',
    accentBg: 'text-rose-400',
  },
  {
    id: 'auto',
    label: 'تلقائي',
    subtitle: 'يتطابق مع مظهر جهازك تلقائياً',
    icon: MonitorSmartphone,
    canvasHex: '#0c0e16',
    cardHex: '#ffffff',
    lineHex: '#64748b',
    accentBg: 'text-emerald-400',
  },
];

export default function ThemeModeSelector({ compact = false }: { compact?: boolean }) {
  const { themeMode, resolvedTheme, systemScheme, setThemeMode } = useTheme();
  const display = useDeviceDisplay();

  const resolvedLabel =
    resolvedTheme === 'light' ? 'فاتح' : resolvedTheme === 'amoled' ? 'أموليد' : 'داكن';
  const systemLabel = systemScheme === 'light' ? 'فاتح' : 'داكن';

  return (
    <section className="bg-[#101016] border border-white/[0.08] rounded-2xl p-4 sm:p-5 space-y-4">
      <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] pb-3">
        <div className="flex items-center gap-2 min-w-0">
          <Palette size={17} className="text-[#FF1744] shrink-0" />
          <div className="min-w-0">
            <h2 className="text-sm font-black text-white truncate">مظهر التطبيق</h2>
            {!compact && (
              <p className="text-[11px] text-neutral-400 truncate mt-0.5">
                {themeMode === 'auto'
                  ? `يعمل حالياً بالوضع التلقائي (${systemLabel} حسب النظام)`
                  : `الوضع النشط حالياً: ${resolvedLabel}`}
              </p>
            )}
          </div>
        </div>
        <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-[#FF1744]/12 text-[#FF1744] border border-[#FF1744]/25 shrink-0">
          {resolvedLabel}
        </span>
      </div>

      <div
        className={`grid gap-2.5 ${
          display.isCoverScreen
            ? 'grid-cols-1'
            : compact
            ? 'grid-cols-2 sm:grid-cols-4'
            : 'grid-cols-2 lg:grid-cols-4'
        }`}
        role="radiogroup"
        aria-label="وضع مظهر التطبيق"
      >
        {THEME_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const isSelected = themeMode === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => setThemeMode(opt.id)}
              className={`group relative rounded-2xl p-3 text-right border transition-all cursor-pointer flex flex-col justify-between gap-2.5 min-h-[108px] ${
                isSelected
                  ? 'bg-[#181822] border-[#FF1744] ring-1 ring-[#FF1744]/40'
                  : 'bg-[#08080c] border-white/[0.08] hover:border-white/25'
              }`}
            >
              {/* Miniature Swatch Preview */}
              <div
                className="theme-keep-dark w-full h-11 rounded-xl border border-white/10 overflow-hidden relative p-1.5 flex items-center justify-between gap-1.5"
                style={{
                  background:
                    opt.id === 'auto'
                      ? 'linear-gradient(135deg, #f1f5f9 50%, #0c0e16 50%)'
                      : opt.canvasHex,
                }}
              >
                <div
                  className="flex-1 h-full rounded-lg p-1.5 flex flex-col justify-between border border-black/10"
                  style={{
                    backgroundColor: opt.id === 'auto' ? 'rgba(15, 23, 42, 0.45)' : opt.cardHex,
                  }}
                >
                  <span
                    className="block h-1.5 w-8 rounded-full"
                    style={{ backgroundColor: '#FF1744' }}
                  />
                  <span
                    className="block h-1.5 w-12 rounded-full opacity-75"
                    style={{ backgroundColor: opt.lineHex }}
                  />
                </div>
                {isSelected && (
                  <CheckCircle2 size={16} className="text-[#FF1744] shrink-0 drop-shadow" />
                )}
              </div>

              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <Icon
                    size={14}
                    className={`shrink-0 ${isSelected ? 'text-[#FF1744]' : opt.accentBg}`}
                  />
                  <span className="text-xs font-black text-white">{opt.label}</span>
                </div>
                <p className="text-[11px] text-neutral-400 leading-snug line-clamp-2">
                  {opt.subtitle}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
