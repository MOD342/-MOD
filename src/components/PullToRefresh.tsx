import React, { useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';

interface PullToRefreshProps {
  onRefresh: () => Promise<void> | void;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}

const MAX_PULL = 84;
const TRIGGER_PULL = 56;

export default function PullToRefresh({
  onRefresh,
  children,
  className = '',
  disabled = false,
}: PullToRefreshProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const startYRef = useRef<number | null>(null);
  const startXRef = useRef<number | null>(null);
  const isPullingRef = useRef(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const canStartPull = (target: EventTarget | null) => {
    if (disabled || refreshing) return false;
    const el = target as HTMLElement | null;
    if (el && (el.closest('input, textarea, select, [contenteditable="true"], [data-no-ptr="true"]') || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
      return false;
    }
    const winTop = typeof window !== 'undefined' ? (window.scrollY || document.documentElement.scrollTop || 0) : 0;
    const containerTop = containerRef.current?.scrollTop || 0;
    return winTop <= 3 && containerTop <= 3;
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length !== 1) return;
    if (!canStartPull(e.target)) {
      startYRef.current = null;
      startXRef.current = null;
      isPullingRef.current = false;
      return;
    }
    startYRef.current = e.touches[0].clientY;
    startXRef.current = e.touches[0].clientX;
    isPullingRef.current = false;
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (startYRef.current === null || startXRef.current === null || refreshing || disabled) return;
    if (e.touches.length !== 1) return;

    const dy = e.touches[0].clientY - startYRef.current;
    const dx = Math.abs(e.touches[0].clientX - startXRef.current);

    if (!isPullingRef.current) {
      if (dx > Math.abs(dy) && dx > 10) {
        // Horizontal drag (like slider) — abort pull
        startYRef.current = null;
        startXRef.current = null;
        return;
      }
      if (dy > 10 && canStartPull(e.target)) {
        isPullingRef.current = true;
      } else if (dy < -8) {
        startYRef.current = null;
        return;
      }
    }

    if (isPullingRef.current && dy > 0) {
      const damped = Math.min(MAX_PULL, Math.round(dy * 0.45));
      setPullDistance(damped);
    }
  };

  const finishPull = async () => {
    if (!isPullingRef.current) {
      startYRef.current = null;
      startXRef.current = null;
      setPullDistance(0);
      return;
    }
    isPullingRef.current = false;
    startYRef.current = null;
    startXRef.current = null;

    if (pullDistance >= TRIGGER_PULL && !refreshing) {
      setRefreshing(true);
      setPullDistance(46);
      try {
        await Promise.resolve(onRefresh());
      } catch {} finally {
        setRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
    }
  };

  const showIndicator = pullDistance > 8 || refreshing;

  return (
    <div
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={finishPull}
      onTouchCancel={finishPull}
      className={`relative ${className}`}
    >
      {showIndicator && (
        <div
          className="flex items-center justify-center overflow-hidden transition-all duration-150 pointer-events-none select-none"
          style={{ height: `${refreshing ? 46 : pullDistance}px` }}
          dir="rtl"
        >
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-neutral-900/95 border border-purple-500/30 shadow-lg text-[11px] font-bold text-purple-200">
            <RefreshCw
              size={13}
              className={refreshing ? 'animate-spin text-purple-400' : pullDistance >= TRIGGER_PULL ? 'text-emerald-400 rotate-180 transition-transform' : 'text-purple-400'}
            />
            <span>
              {refreshing
                ? 'جاري تحديث البيانات...'
                : pullDistance >= TRIGGER_PULL
                ? 'أفلت للتحديث'
                : 'اسحب للتحديث'}
            </span>
          </div>
        </div>
      )}
      {children}
    </div>
  );
}
