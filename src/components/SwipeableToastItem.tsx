import React, { useEffect, useRef, useState } from 'react';
import { motion, PanInfo, useMotionValue, useTransform } from 'motion/react';
import {
  Bell,
  Flame,
  Info,
  MessageSquare,
  Play,
  ShieldAlert,
  Sparkles,
  Trophy,
  X,
} from 'lucide-react';

interface SwipeableToastItemProps {
  toast: any;
  onDismiss: (id: string) => void;
  onClick: (toast: any) => void;
  autoDismissMs?: number;
}

const SWIPE_DISTANCE_THRESHOLD = 72;
const SWIPE_VELOCITY_THRESHOLD = 320;

export const SwipeableToastItem: React.FC<SwipeableToastItemProps> = ({
  toast,
  onDismiss,
  onClick,
  autoDismissMs = 6000,
}) => {
  const x = useMotionValue(0);
  const opacity = useTransform(x, [-180, -70, 0, 70, 180], [0, 0.85, 1, 0.85, 0]);
  const [exitDirection, setExitDirection] = useState<1 | -1 | 0>(0);
  const [isPaused, setIsPaused] = useState(false);
  const isDraggingRef = useRef(false);
  const didDismissRef = useRef(false);

  useEffect(() => {
    if (isPaused || didDismissRef.current) return;
    const timer = window.setTimeout(() => {
      if (!didDismissRef.current) {
        didDismissRef.current = true;
        onDismiss(toast.id);
      }
    }, autoDismissMs);
    return () => window.clearTimeout(timer);
  }, [toast.id, onDismiss, autoDismissMs, isPaused]);

  const handleDismiss = (direction: 1 | -1 | 0 = 0) => {
    if (didDismissRef.current) return;
    didDismissRef.current = true;
    setExitDirection(direction);
    onDismiss(toast.id);
  };

  const handleDragStart = () => {
    isDraggingRef.current = true;
    setIsPaused(true);
  };

  const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    setIsPaused(false);
    const shouldDismiss =
      Math.abs(info.offset.x) > SWIPE_DISTANCE_THRESHOLD ||
      Math.abs(info.velocity.x) > SWIPE_VELOCITY_THRESHOLD;

    if (shouldDismiss) {
      const dir: 1 | -1 = info.offset.x >= 0 ? 1 : -1;
      handleDismiss(dir);
    }

    window.setTimeout(() => {
      isDraggingRef.current = false;
    }, 90);
  };

  const handleCardClick = () => {
    if (isDraggingRef.current || didDismissRef.current) return;
    onClick(toast);
  };

  let accentColor = 'text-[#FF1744]';
  let borderColor = 'border-[#FF1744]/25';
  let glowColor = 'shadow-[0_6px_26px_rgba(255,23,68,0.14)]';
  let label = 'إشعار جديد';
  let icon = <Bell size={15} />;

  const titleText = toast.title || '';
  const isLike = titleText.includes('إعجاب') || titleText.includes('عجب');

  if (isLike && toast.type === 'social') {
    accentColor = 'text-orange-400';
    borderColor = 'border-orange-500/25';
    glowColor = 'shadow-[0_6px_26px_rgba(249,115,22,0.12)]';
    label = 'تفاعل مجتمعي';
    icon = <Flame size={15} />;
  } else if (toast.isGlobal) {
    accentColor = 'text-amber-400';
    borderColor = 'border-amber-500/25';
    glowColor = 'shadow-[0_6px_26px_rgba(245,158,11,0.14)]';
    label = 'إعلان رسمي';
    icon = <Sparkles size={15} />;
  } else if (toast.type === 'admin_report') {
    accentColor = 'text-rose-400';
    borderColor = 'border-rose-500/30';
    glowColor = 'shadow-[0_6px_26px_rgba(239,68,68,0.16)]';
    label = 'رادار المخالفات';
    icon = <ShieldAlert size={14} />;
  } else if (toast.type === 'admin_suggestion') {
    accentColor = 'text-sky-400';
    borderColor = 'border-sky-500/30';
    glowColor = 'shadow-[0_6px_26px_rgba(14,165,233,0.16)]';
    label = 'بريد المقترحات';
    icon = <MessageSquare size={14} />;
  } else if (toast.type === 'admin_recommendation') {
    accentColor = 'text-amber-400';
    borderColor = 'border-amber-500/30';
    glowColor = 'shadow-[0_6px_26px_rgba(245,158,11,0.16)]';
    label = 'مراجعة المحتوى';
    icon = <Trophy size={14} />;
  } else {
    switch (toast.type) {
      case 'tournament':
        accentColor = 'text-yellow-400';
        borderColor = 'border-yellow-500/25';
        glowColor = 'shadow-[0_6px_26px_rgba(234,179,8,0.12)]';
        label = 'بطولة نشطة';
        icon = <Trophy size={15} />;
        break;
      case 'episode':
        accentColor = 'text-[#FF1744]';
        borderColor = 'border-[#FF1744]/25';
        glowColor = 'shadow-[0_6px_26px_rgba(255,23,68,0.14)]';
        label = 'حلقة جديدة';
        icon = <Play size={13} className="fill-current" />;
        break;
      case 'social':
        accentColor = 'text-emerald-400';
        borderColor = 'border-emerald-500/25';
        glowColor = 'shadow-[0_6px_26px_rgba(16,185,129,0.12)]';
        label = 'تفاعل';
        icon = <MessageSquare size={14} />;
        break;
      case 'system':
        accentColor = 'text-blue-400';
        borderColor = 'border-blue-500/25';
        glowColor = 'shadow-[0_6px_26px_rgba(59,130,246,0.12)]';
        label = 'النظام';
        icon = <Info size={14} />;
        break;
    }
  }

  return (
    <motion.div
      layout
      style={{ x, opacity }}
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.88}
      dragSnapToOrigin
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      initial={{ opacity: 0, y: -18, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={
        exitDirection !== 0
          ? { opacity: 0, x: exitDirection * 240, transition: { duration: 0.16, ease: 'easeOut' } }
          : { opacity: 0, y: -12, scale: 0.9, transition: { duration: 0.16 } }
      }
      whileDrag={{ scale: 0.985, cursor: 'grabbing' }}
      onClick={handleCardClick}
      className={`pointer-events-auto touch-pan-y w-full bg-[#0a0d14]/95 backdrop-blur-md rounded-2xl border ${borderColor} p-3.5 ${glowColor} flex items-start gap-3 relative overflow-hidden select-none cursor-grab active:cursor-grabbing transition-colors hover:bg-[#0e121c]/95`}
      role="status"
      aria-live="polite"
    >
      {/* Content Image/Icon Thumbnail */}
      <div className="w-10 h-10 rounded-xl bg-[#141a29] border border-white/10 flex items-center justify-center shrink-0 overflow-hidden relative">
        {toast.imageUrl ? (
          <img
            src={toast.imageUrl}
            alt=""
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover pointer-events-none"
          />
        ) : (
          <span className={accentColor}>{icon}</span>
        )}
      </div>

      {/* Info Text */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5 text-[10px]">
          <span className={`font-extrabold ${accentColor}`}>{label}</span>
          <span className="text-neutral-600" aria-hidden="true">
            ·
          </span>
          <span className="text-neutral-500 font-medium">اسحب للإغلاق</span>
        </div>

        <h5 className="text-[12px] font-black text-white truncate leading-snug">
          {toast.title}
        </h5>
        <p className="text-[10px] sm:text-[11px] font-bold text-neutral-300 leading-normal line-clamp-2 mt-0.5">
          {toast.body}
        </p>
      </div>

      {/* Touch-friendly Dismiss Controller (>=40px hitbox) */}
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          handleDismiss(0);
        }}
        aria-label="إغلاق الإشعار"
        className="w-10 h-10 -mt-1.5 -ml-1.5 hover:bg-white/10 rounded-xl text-neutral-400 hover:text-white transition flex items-center justify-center cursor-pointer select-none shrink-0"
      >
        <X size={15} />
      </button>
    </motion.div>
  );
};
