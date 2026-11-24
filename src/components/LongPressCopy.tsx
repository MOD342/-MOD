import React, { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import ViewportPortal from './ViewportPortal';

interface LongPressCopyProps {
  text?: string;
  className?: string;
  children: React.ReactNode;
}

async function copyTextReliably(value: string): Promise<boolean> {
  if (!value) return false;
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // Fall through to execCommand fallback (e.g., WebView / iframe / non-secure context)
    }
  }

  if (typeof document !== 'undefined') {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = value;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.top = '-9999px';
      textarea.style.left = '-9999px';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      textarea.setSelectionRange(0, value.length);
      const ok = document.execCommand('copy');
      document.body.removeChild(textarea);
      if (ok) return true;
    } catch {
      return false;
    }
  }

  return false;
}

export function LongPressCopy({ text = '', className = '', children }: LongPressCopyProps) {
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasLongPressRef = useRef(false);
  const lastTouchTimeRef = useRef(0);
  const touchOriginRef = useRef<{ x: number; y: number } | null>(null);
  const hostRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const triggerCopy = async () => {
    const resolvedText = (text || hostRef.current?.textContent || '').trim();
    if (!resolvedText) return;

    wasLongPressRef.current = true;
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(45);
      } catch {
        // ignore vibration unsupported error
      }
    }

    const ok = await copyTextReliably(resolvedText);
    if (ok) {
      setCopiedText(resolvedText);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => setCopiedText(null), 1700);
    }
  };

  const startHold = (source: 'touch' | 'mouse', clientX?: number, clientY?: number) => {
    if (source === 'touch') {
      lastTouchTimeRef.current = Date.now();
      if (typeof clientX === 'number' && typeof clientY === 'number') {
        touchOriginRef.current = { x: clientX, y: clientY };
      }
    } else if (Date.now() - lastTouchTimeRef.current < 750) {
      // Ignore synthetic mouseDown emitted immediately after touchStart on mobile browsers
      return;
    }

    clearTimer();
    wasLongPressRef.current = false;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void triggerCopy();
    }, 450);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches?.[0];
    startHold('touch', touch?.clientX, touch?.clientY);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!timerRef.current || !touchOriginRef.current) return;
    const touch = e.touches?.[0];
    if (!touch) return;
    const dx = Math.abs(touch.clientX - touchOriginRef.current.x);
    const dy = Math.abs(touch.clientY - touchOriginRef.current.y);
    // Allow minor finger jitter (~12px) without cancelling the hold; cancel if user is scrolling
    if (dx > 12 || dy > 12) {
      clearTimer();
      touchOriginRef.current = null;
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    startHold('mouse', e.clientX, e.clientY);
  };

  const handleEnd = () => {
    clearTimer();
    touchOriginRef.current = null;
  };

  const handleClick = (e: React.MouseEvent) => {
    if (wasLongPressRef.current) {
      e.stopPropagation();
      e.preventDefault();
      wasLongPressRef.current = false;
    }
  };

  return (
    <>
      <span
        ref={hostRef}
        onMouseDown={handleMouseDown}
        onMouseUp={handleEnd}
        onMouseLeave={handleEnd}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleEnd}
        onTouchCancel={handleEnd}
        onTouchMove={handleTouchMove}
        onClick={handleClick}
        onContextMenu={(e) => {
          // Suppress native browser text selection / context menu on hold
          e.preventDefault();
        }}
        className={`cursor-pointer relative select-none [-webkit-touch-callout:none] ${className}`}
        title="اضغط مطولاً لنسخ الاسم"
      >
        {children}
      </span>

      {copiedText && (
        <ViewportPortal>
          <div
            style={{ top: 'calc(var(--safe-top, 0px) + 1rem)' }}
            className="fixed left-1/2 -translate-x-1/2 z-[120] pointer-events-none px-4"
            dir="rtl"
          >
            <div className="flex items-center gap-2 bg-neutral-950/95 border border-emerald-500/40 text-white px-4 py-2 rounded-full shadow-2xl backdrop-blur-xl text-xs font-black whitespace-nowrap max-w-[88vw]">
              <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                <Check size={12} strokeWidth={3} />
              </span>
              <span>تم نسخ الاسم:</span>
              <span className="text-emerald-300 truncate max-w-[180px] sm:max-w-[260px]" dir="auto">
                {copiedText}
              </span>
            </div>
          </div>
        </ViewportPortal>
      )}
    </>
  );
}
