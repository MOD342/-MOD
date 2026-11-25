import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, useMotionValue, animate, type AnimationPlaybackControls } from 'motion/react';
import { Star, ChevronLeft, ChevronRight, Film } from 'lucide-react';
import { useDeviceDisplay } from '../hooks/useDeviceDisplay';
import { LongPressCopy } from './LongPressCopy';
import type { BannerStyle } from '../types/platformConfig';

export interface HeroBannerItem {
  _id: string | number;
  title: string;
  posterUrl?: string;
  bannerUrl?: string;
  rating?: number;
  genres?: string[];
  originLabel?: string;
  chaptersCount?: number | null;
  status?: string;
  badgeText?: string;
}

interface CinematicHeroBannerProps {
  items: HeroBannerItem[];
  bannerStyle?: BannerStyle;
  accent?: 'anime' | 'manga';
  limit?: number;
  speedSeconds?: number;
  modeLabel?: string;
  isHomeMode?: boolean;
  onItemClick: (item: HeroBannerItem) => void;
}

const SLIDE_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

function BannerImage({
  src,
  alt,
  className = '',
  fallbackTitle,
  loading = 'eager',
}: {
  src?: string;
  alt: string;
  className?: string;
  fallbackTitle?: string;
  loading?: 'eager' | 'lazy';
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return (
      <div
        className={`w-full h-full bg-gradient-to-br from-neutral-900 via-neutral-950 to-black flex flex-col items-center justify-center gap-2 text-neutral-600 select-none ${className}`}
      >
        <Film size={28} strokeWidth={1.5} />
        {fallbackTitle && (
          <span className="text-[11px] font-bold text-neutral-500 px-3 text-center line-clamp-1">
            {fallbackTitle}
          </span>
        )}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading={loading}
      decoding="async"
      referrerPolicy="no-referrer"
      draggable={false}
      onError={() => setFailed(true)}
      className={className}
    />
  );
}

function formatSlideIndex(idx: number): string {
  return String(idx + 1).padStart(2, '0');
}

function hasGenuineWideBanner(item: HeroBannerItem): boolean {
  const b = (item.bannerUrl || '').trim();
  const p = (item.posterUrl || '').trim();
  return Boolean(b && b !== p);
}

/**
 * Uniform full-bleed cinema visual layer:
 * Every slide renders with the exact same edge-less full-bleed silhouette
 * (no switching between cinema style and card-box style mid-carousel).
 */
function UniformCinemaArtwork({ item }: { item: HeroBannerItem }) {
  const wide = hasGenuineWideBanner(item);
  const posterSrc = item.posterUrl || item.bannerUrl || '';
  const wideSrc = wide ? item.bannerUrl || posterSrc : posterSrc;

  return (
    <>
      {/* Mobile (< 640px): Always use portrait key-visual poster anchored at top so full characters appear edge-to-edge without center cropping */}
      <BannerImage
        src={posterSrc}
        alt={item.title}
        fallbackTitle={item.title}
        className="sm:hidden absolute inset-0 w-full h-full object-cover object-top brightness-105 saturate-105 pointer-events-none select-none"
      />
      {/* Tablet & Desktop (>= 640px): Use wide panoramic banner when available, or top-framed portrait fallback */}
      <BannerImage
        src={wideSrc}
        alt={item.title}
        fallbackTitle={item.title}
        className={`hidden sm:block absolute inset-0 w-full h-full object-cover ${
          wide ? 'object-center' : 'object-[50%_15%]'
        } brightness-105 saturate-105 pointer-events-none select-none`}
      />
    </>
  );
}

export default function CinematicHeroBanner({
  items,
  bannerStyle = 'classic',
  accent = 'anime',
  limit = 5,
  speedSeconds = 5,
  modeLabel,
  isHomeMode = true,
  onItemClick,
}: CinematicHeroBannerProps) {
  const display = useDeviceDisplay();
  const useSideRail =
    display.isWideOrUnfolded && !display.isTabletopPosture && !display.isCoverScreen;

  const clampedLimit = Math.min(10, Math.max(1, Number(limit) || 5));
  const visibleItems = items.slice(0, clampedLimit);
  const count = visibleItems.length;
  const hasMultiple = count > 1;
  const isManga = accent === 'manga';
  const durationSec = Math.max(2, Number(speedSeconds) || 5);
  const isPeekCarousel = bannerStyle === 'glass';

  // Seamless Infinite Track:
  // Single-slide styles: [last, ...items, first] (padCount = 1)
  // Glass Peek Carousel: [secondLast, last, ...items, first, second] (padCount = 2)
  const padCount = hasMultiple ? (isPeekCarousel ? 2 : 1) : 0;
  const trackItems = React.useMemo(() => {
    if (!hasMultiple) return visibleItems;
    if (isPeekCarousel) {
      const prev2 = visibleItems[(count - 2 + count) % count];
      const prev1 = visibleItems[count - 1];
      const next1 = visibleItems[0];
      const next2 = visibleItems[1 % count];
      return [prev2, prev1, ...visibleItems, next1, next2];
    }
    return [visibleItems[count - 1], ...visibleItems, visibleItems[0]];
  }, [count, hasMultiple, isPeekCarousel, visibleItems]);

  const [trackPos, setTrackPos] = useState<number>(padCount);
  const trackPosRef = useRef<number>(padCount);
  const [isDragging, setIsDragging] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [containerWidth, setContainerWidth] = useState<number>(0);

  const viewportRef = useRef<HTMLDivElement>(null);
  const thumbRailRef = useRef<HTMLDivElement>(null);
  const containerWidthRef = useRef<number>(0);
  const dragPreventClickRef = useRef(false);
  const animControlsRef = useRef<AnimationPlaybackControls | null>(null);
  const animRunIdRef = useRef<number>(0);
  const trackX = useMotionValue(0);

  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  const getGeometry = useCallback(
    (w: number) => {
      const safeW = Math.max(260, w);
      if (!isPeekCarousel) {
        return {
          cardWidth: safeW,
          gap: 0,
          itemStep: safeW,
          centerOffset: 0,
        };
      }
      const cardWidth =
        safeW < 520
          ? Math.min(248, Math.round(safeW * 0.68))
          : safeW < 900
          ? 272
          : 294;
      const gap = safeW < 520 ? 12 : 18;
      const itemStep = cardWidth + gap;
      const centerOffset = (safeW - cardWidth) / 2;
      return { cardWidth, gap, itemStep, centerOffset };
    },
    [isPeekCarousel],
  );

  const getTrackXForPos = useCallback(
    (pos: number, w: number) => {
      const g = getGeometry(w);
      return g.centerOffset - pos * g.itemStep;
    },
    [getGeometry],
  );

  const displayIdx = hasMultiple
    ? (((trackPos - padCount) % count) + count) % count
    : 0;

  const stopActiveAnimation = useCallback(() => {
    animRunIdRef.current += 1;
    if (animControlsRef.current) {
      animControlsRef.current.stop();
      animControlsRef.current = null;
    }
  }, []);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const measure = () => {
      const w = el.getBoundingClientRect().width || el.offsetWidth;
      if (w > 0) {
        containerWidthRef.current = w;
        setContainerWidth(w);
        stopActiveAnimation();
        trackX.set(getTrackXForPos(trackPosRef.current, w));
      }
    };

    measure();
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(measure);
      observer.observe(el);
      return () => observer.disconnect();
    }
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [bannerStyle, count, getTrackXForPos, stopActiveAnimation, trackX]);

  useEffect(() => {
    stopActiveAnimation();
    trackPosRef.current = padCount;
    setTrackPos(padCount);
    const w = containerWidthRef.current || viewportRef.current?.offsetWidth || 0;
    if (w > 0) {
      trackX.set(getTrackXForPos(padCount, w));
    }
  }, [count, bannerStyle, padCount, getTrackXForPos, stopActiveAnimation, trackX]);

  useEffect(() => {
    if (bannerStyle !== 'spotlight' || !thumbRailRef.current) return;
    const rail = thumbRailRef.current;
    const activeThumb = rail.children[displayIdx] as HTMLElement | undefined;
    if (!activeThumb) return;

    const railRect = rail.getBoundingClientRect();
    const thumbRect = activeThumb.getBoundingClientRect();
    const delta =
      thumbRect.left - railRect.left - (railRect.width / 2 - thumbRect.width / 2);
    rail.scrollBy({
      left: delta,
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
    });
  }, [bannerStyle, displayIdx, prefersReducedMotion]);

  const animateToTrackPos = useCallback(
    (requestedPos: number, instant = false) => {
      if (!hasMultiple) return;
      const w =
        containerWidthRef.current ||
        viewportRef.current?.getBoundingClientRect().width ||
        (typeof window !== 'undefined' ? window.innerWidth : 375);

      stopActiveAnimation();

      const minPos = padCount - 1;
      const maxPos = count + padCount;

      let targetPos = requestedPos;
      if (trackPosRef.current >= maxPos && targetPos > maxPos) {
        trackPosRef.current = padCount;
        trackX.set(getTrackXForPos(padCount, w));
        targetPos = padCount + 1;
      } else if (trackPosRef.current <= minPos && targetPos < minPos) {
        trackPosRef.current = padCount + count - 1;
        trackX.set(getTrackXForPos(padCount + count - 1, w));
        targetPos = padCount + count - 2;
      }

      targetPos = Math.max(minPos, Math.min(maxPos, targetPos));
      trackPosRef.current = targetPos;
      setTrackPos(targetPos);

      if (instant || prefersReducedMotion) {
        const normalized =
          targetPos >= maxPos
            ? padCount
            : targetPos <= minPos
            ? padCount + count - 1
            : targetPos;
        trackPosRef.current = normalized;
        setTrackPos(normalized);
        trackX.set(getTrackXForPos(normalized, w));
        return;
      }

      const runId = animRunIdRef.current;
      const controls = animate(trackX, getTrackXForPos(targetPos, w), {
        duration: 0.5,
        ease: SLIDE_EASE,
      });
      animControlsRef.current = controls;

      controls.then(() => {
        if (animRunIdRef.current !== runId) return;
        animControlsRef.current = null;
        if (trackPosRef.current >= maxPos) {
          trackPosRef.current = padCount;
          trackX.set(getTrackXForPos(padCount, w));
          setTrackPos(padCount);
        } else if (trackPosRef.current <= minPos) {
          const wrapped = padCount + count - 1;
          trackPosRef.current = wrapped;
          trackX.set(getTrackXForPos(wrapped, w));
          setTrackPos(wrapped);
        }
      });
    },
    [count, getTrackXForPos, hasMultiple, padCount, prefersReducedMotion, stopActiveAnimation, trackX],
  );

  const goNext = useCallback(
    (e?: React.MouseEvent) => {
      e?.stopPropagation();
      if (!hasMultiple) return;
      animateToTrackPos(trackPosRef.current + 1);
    },
    [animateToTrackPos, hasMultiple],
  );

  const goPrev = useCallback(
    (e?: React.MouseEvent) => {
      e?.stopPropagation();
      if (!hasMultiple) return;
      animateToTrackPos(trackPosRef.current - 1);
    },
    [animateToTrackPos, hasMultiple],
  );

  const jumpToSlide = useCallback(
    (idx: number, e?: React.MouseEvent) => {
      e?.stopPropagation();
      if (!hasMultiple) return;
      const clamped = Math.max(0, Math.min(count - 1, idx));
      animateToTrackPos(clamped + padCount);
    },
    [animateToTrackPos, count, hasMultiple, padCount],
  );

  // Endless Auto-Advance
  useEffect(() => {
    if (!hasMultiple || isDragging || isPaused) return;
    const timer = setInterval(() => {
      animateToTrackPos(trackPosRef.current + 1);
    }, durationSec * 1000);
    return () => clearInterval(timer);
  }, [animateToTrackPos, durationSec, hasMultiple, isDragging, isPaused]);

  if (count === 0) return null;

  const getBackdropSrc = (item: HeroBannerItem) =>
    item.bannerUrl || item.posterUrl || '';

  const getPosterSrc = (item: HeroBannerItem) =>
    item.posterUrl || item.bannerUrl || '';

  const buildMetaParts = (item: HeroBannerItem) => {
    const parts: string[] = [];
    if (item.originLabel) parts.push(item.originLabel);
    if (item.chaptersCount) parts.push(`${item.chaptersCount} فصل`);
    if (item.genres && item.genres.length > 0) {
      parts.push(item.genres.slice(0, 2).join(' · '));
    }
    return parts;
  };

  const renderKickerText = (item: HeroBannerItem, logicalIdx: number) => {
    const source = item.badgeText || modeLabel || (isManga ? 'الأكثر قراءة' : 'المختارات');
    return `${formatSlideIndex(logicalIdx)} / ${formatSlideIndex(count - 1)} · ${source}`;
  };

  const handleDragStart = () => {
    if (!hasMultiple) return;
    stopActiveAnimation();
    const w = containerWidthRef.current || viewportRef.current?.offsetWidth || 375;
    if (trackPosRef.current >= count + padCount) {
      trackPosRef.current = padCount;
      trackX.set(getTrackXForPos(padCount, w));
      setTrackPos(padCount);
    } else if (trackPosRef.current <= padCount - 1) {
      const wrapped = padCount + count - 1;
      trackPosRef.current = wrapped;
      trackX.set(getTrackXForPos(wrapped, w));
      setTrackPos(wrapped);
    }
    setIsDragging(true);
    dragPreventClickRef.current = false;
  };

  const handleDrag = (_: any, info: { offset: { x: number } }) => {
    if (Math.abs(info.offset.x) > 8) {
      dragPreventClickRef.current = true;
    }
  };

  const handleDragEnd = (
    _: any,
    info: { offset: { x: number }; velocity: { x: number } },
  ) => {
    setIsDragging(false);
    const w = containerWidthRef.current || viewportRef.current?.offsetWidth || 375;
    const { itemStep } = getGeometry(w);
    const threshold = Math.min(itemStep * 0.18, 56);

    if (info.offset.x < -threshold || info.velocity.x < -260) {
      animateToTrackPos(trackPosRef.current + 1);
    } else if (info.offset.x > threshold || info.velocity.x > 260) {
      animateToTrackPos(trackPosRef.current - 1);
    } else {
      animateToTrackPos(trackPosRef.current);
    }

    setTimeout(() => {
      dragPreventClickRef.current = false;
    }, 60);
  };

  const effectiveWidth =
    containerWidth || (typeof window !== 'undefined' ? window.innerWidth : 1000);
  const geo = getGeometry(effectiveWidth);

  const trackDragProps = hasMultiple
    ? {
        drag: 'x' as const,
        style: { x: trackX },
        dragConstraints: {
          left: getTrackXForPos(count + padCount, effectiveWidth),
          right: getTrackXForPos(padCount - 1, effectiveWidth),
        },
        dragElastic: 0.08,
        dragMomentum: false,
        onDragStart: handleDragStart,
        onDrag: handleDrag,
        onDragEnd: handleDragEnd,
      }
    : isPeekCarousel
    ? { style: { x: getTrackXForPos(0, effectiveWidth) } }
    : {};

  const renderProgressBars = (className = '') => {
    if (!hasMultiple) return null;
    return (
      <div className={`flex items-center gap-1 ${className}`}>
        {visibleItems.map((_, idx) => {
          const isActive = idx === displayIdx;
          return (
            <button
              key={`prog-${idx}`}
              type="button"
              aria-label={`شريحة ${idx + 1}`}
              onClick={(e) => jumpToSlide(idx, e)}
              className="py-2 px-0.5 cursor-pointer group/dot flex items-center"
            >
              <span
                className={`relative block h-[3px] rounded-full overflow-hidden transition-all duration-300 ${
                  isActive
                    ? 'w-7 sm:w-9 bg-white/25'
                    : 'w-2 sm:w-2.5 bg-white/30 group-hover/dot:bg-white/60'
                }`}
              >
                {isActive && (
                  <motion.span
                    key={`fill-${displayIdx}-${isPaused || isDragging ? 'paused' : 'run'}`}
                    initial={{ scaleX: isPaused || isDragging ? 0.35 : 0 }}
                    animate={{ scaleX: isPaused || isDragging ? 0.35 : 1 }}
                    transition={
                      isPaused || isDragging
                        ? { duration: 0.15 }
                        : { duration: durationSec, ease: 'linear' }
                    }
                    className={`absolute inset-0 origin-right rounded-full ${
                      isManga ? 'bg-amber-400' : 'bg-[#FF1744]'
                    }`}
                  />
                )}
              </span>
            </button>
          );
        })}
      </div>
    );
  };

  const renderDesktopArrows = (insetClass = 'right-4 left-4') => {
    if (!hasMultiple) return null;
    return (
      <>
        <button
          type="button"
          onClick={goPrev}
          aria-label="الشريحة السابقة"
          className={`hidden md:flex absolute ${insetClass.split(' ')[0]} top-1/2 -translate-y-1/2 z-30 w-10 h-10 rounded-full bg-black/55 hover:bg-black/85 border border-white/15 text-white items-center justify-center backdrop-blur-md opacity-0 group-hover/banner:opacity-100 focus-visible:opacity-100 transition-opacity duration-200 cursor-pointer`}
        >
          <ChevronRight size={20} />
        </button>
        <button
          type="button"
          onClick={goNext}
          aria-label="الشريحة التالية"
          className={`hidden md:flex absolute ${insetClass.split(' ')[1]} top-1/2 -translate-y-1/2 z-30 w-10 h-10 rounded-full bg-black/55 hover:bg-black/85 border border-white/15 text-white items-center justify-center backdrop-blur-md opacity-0 group-hover/banner:opacity-100 focus-visible:opacity-100 transition-opacity duration-200 cursor-pointer`}
        >
          <ChevronLeft size={20} />
        </button>
      </>
    );
  };

  // Generous clean spacing below floating mobile header bar when on Home without announcement banner
  const framedContainerSpacing =
    isHomeMode && !useSideRail
      ? 'pt-[calc(var(--safe-top,0px)+4.85rem)]'
      : 'pt-3 md:pt-4';

  // ===========================================================================
  // STYLE 1: CLASSIC FULL-BLEED CINEMA STAGE
  // - 100% uniform full-bleed cinema silhouette across EVERY slide (never switches to card box!)
  // - Generous height + subtle top header integration zone so mobile floating bar sits natively inside top of stage
  // ===========================================================================
  if (bannerStyle === 'classic') {
    return (
      <section
        ref={viewportRef}
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        className="relative overflow-hidden w-full select-none touch-pan-y group/banner bg-[#09090d]"
      >
        <motion.div
          {...trackDragProps}
          className={`flex w-full will-change-transform ${
            hasMultiple ? 'cursor-grab active:cursor-grabbing' : ''
          }`}
          dir="ltr"
        >
          {trackItems.map((item, rawIdx) => {
            const logicalIdx = hasMultiple
              ? (((rawIdx - padCount) % count) + count) % count
              : 0;
            const metaParts = buildMetaParts(item);

            return (
              <div
                key={`classic-${item._id}-${rawIdx}`}
                onClick={() => {
                  if (dragPreventClickRef.current) return;
                  onItemClick(item);
                }}
                dir="rtl"
                className={`theme-keep-dark w-full flex-[0_0_100%] cursor-pointer relative overflow-hidden ${
                  display.isCoverScreen
                    ? 'h-[310px]'
                    : isHomeMode && !useSideRail
                    ? 'aspect-[3/4] max-h-[540px] sm:aspect-auto sm:h-[360px] md:h-[395px] lg:h-[420px]'
                    : 'aspect-[3/4] max-h-[500px] sm:aspect-auto sm:h-[350px] md:h-[385px] lg:h-[410px]'
                }`}
              >
                <UniformCinemaArtwork item={item} />

                <div
                  className="absolute inset-x-0 bottom-0 z-10 pt-10 pb-8 sm:pb-10 px-4 sm:px-8 md:px-12 bg-gradient-to-t from-black/80 via-black/40 to-transparent"
                  style={{ textShadow: '0 2px 12px rgba(0,0,0,0.95), 0 1px 4px rgba(0,0,0,0.9)' }}
                >
                  <div className="max-w-7xl mx-auto">
                    <div className="max-w-xl space-y-1.5 sm:space-y-2.5">
                      <p
                        className={`text-[11px] sm:text-xs font-bold tracking-wide tabular-nums ${
                          isManga ? 'text-amber-300' : 'text-rose-300'
                        }`}
                      >
                        {renderKickerText(item, logicalIdx)}
                      </p>

                      <h2 className="text-xl sm:text-3xl md:text-[2.45rem] font-black text-white leading-[1.16] line-clamp-2 [text-wrap:balance] drop-shadow-[0_2px_10px_rgba(0,0,0,0.95)]">
                        <LongPressCopy text={item.title}>{item.title}</LongPressCopy>
                      </h2>

                      <div className="flex items-center flex-wrap gap-x-2 gap-y-1 text-xs sm:text-[13px] text-neutral-100 font-semibold tabular-nums">
                        {item.rating && item.rating > 0 ? (
                          <span className="inline-flex items-center gap-1 text-yellow-400 font-bold">
                            <Star size={13} fill="currentColor" />
                            {Number(item.rating).toFixed(1)}
                          </span>
                        ) : null}
                        {metaParts.map((part, pIdx) => (
                          <React.Fragment key={pIdx}>
                            {(pIdx > 0 || (item.rating && item.rating > 0)) && (
                              <span className="text-neutral-300" aria-hidden="true">
                                ·
                              </span>
                            )}
                            <span className="truncate max-w-[160px] sm:max-w-xs">{part}</span>
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </motion.div>

        {renderDesktopArrows('right-4 left-4')}

        {hasMultiple && (
          <div className="absolute bottom-2 inset-x-0 z-30 flex justify-center pointer-events-auto">
            {renderProgressBars()}
          </div>
        )}
      </section>
    );
  }

  // ===========================================================================
  // STYLE 2: EDITORIAL CARD WITH ANIME ARTWORK BACKDROP
  // - 100% uniform two-column layout on every slide.
  // - Card background showcases the anime/manga's own cover/banner artwork richly!
  // - Crisp un-dimmed 2:3 poster beside clear readable typography.
  // ===========================================================================
  if (bannerStyle === 'split') {
    return (
      <section
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        className={`px-3.5 md:px-6 ${framedContainerSpacing} max-w-7xl mx-auto select-none`}
      >
        <div
          ref={viewportRef}
          className="theme-keep-dark relative rounded-[24px] sm:rounded-[28px] overflow-hidden border border-white/12 bg-[#0b0b10] shadow-2xl touch-pan-y group/banner"
        >
          <motion.div
            {...trackDragProps}
            className={`flex w-full will-change-transform ${
              hasMultiple ? 'cursor-grab active:cursor-grabbing' : ''
            }`}
            dir="ltr"
          >
            {trackItems.map((item, rawIdx) => {
              const logicalIdx = hasMultiple
                ? (((rawIdx - padCount) % count) + count) % count
                : 0;
              const metaParts = buildMetaParts(item);

              return (
                <div
                  key={`split-${item._id}-${rawIdx}`}
                  onClick={() => {
                    if (dragPreventClickRef.current) return;
                    onItemClick(item);
                  }}
                  dir="rtl"
                  className="w-full flex-[0_0_100%] cursor-pointer relative min-h-[230px] sm:min-h-[275px] md:min-h-[310px] flex items-center overflow-hidden"
                >
                  {/* Anime Cover / Banner Artwork Background */}
                  <div className="absolute inset-0 pointer-events-none overflow-hidden">
                    <BannerImage
                      src={getBackdropSrc(item)}
                      alt=""
                      className="w-full h-full object-cover object-[center_20%] blur-[2px] saturate-115"
                    />
                  </div>

                  {/* Crisp Foreground Poster + Editorial Typography */}
                  <div
                    className="relative z-10 w-full p-4 sm:p-6 md:p-8 pb-9 sm:pb-10 flex items-center gap-4 sm:gap-7 md:gap-9"
                    style={{ textShadow: '0 2px 12px rgba(0,0,0,0.95), 0 1px 4px rgba(0,0,0,0.9)' }}
                  >
                    <div
                      className={`${
                        display.isCoverScreen ? 'w-22' : 'w-28 sm:w-36 md:w-44'
                      } aspect-[2/3] rounded-2xl overflow-hidden ring-1 ring-white/25 shadow-[0_18px_40px_rgba(0,0,0,0.8)] shrink-0 bg-neutral-900`}
                    >
                      <BannerImage
                        src={getPosterSrc(item)}
                        alt={item.title}
                        fallbackTitle={item.title}
                        className="w-full h-full object-cover object-[center_18%]"
                      />
                    </div>

                    <div className="flex-1 min-w-0 flex flex-col justify-center gap-2 sm:gap-3 text-right">
                      <p
                        className={`text-[11px] sm:text-xs font-bold tabular-nums drop-shadow ${
                          isManga ? 'text-amber-300' : 'text-rose-300'
                        }`}
                      >
                        {renderKickerText(item, logicalIdx)}
                      </p>

                      <h2 className="text-lg sm:text-2xl md:text-[2rem] font-black text-white leading-snug line-clamp-2 [text-wrap:balance] drop-shadow">
                        <LongPressCopy text={item.title}>{item.title}</LongPressCopy>
                      </h2>

                      <div className="flex items-center flex-wrap gap-x-2 gap-y-1 text-xs sm:text-[13px] text-neutral-100 font-semibold tabular-nums">
                        {item.rating && item.rating > 0 ? (
                          <span className="inline-flex items-center gap-1 text-yellow-400 font-bold">
                            <Star size={13} fill="currentColor" />
                            {Number(item.rating).toFixed(1)}
                          </span>
                        ) : null}
                        {metaParts.map((part, pIdx) => (
                          <React.Fragment key={pIdx}>
                            {(pIdx > 0 || (item.rating && item.rating > 0)) && (
                              <span className="text-neutral-300" aria-hidden="true">
                                ·
                              </span>
                            )}
                            <span className="truncate max-w-[160px] sm:max-w-xs">{part}</span>
                          </React.Fragment>
                        ))}
                      </div>

                      {item.status && (
                        <p className="text-[11px] text-neutral-300 font-medium">
                          {item.status}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </motion.div>

          {renderDesktopArrows('right-3 left-3')}

          {hasMultiple && (
            <div className="absolute bottom-2 inset-x-0 z-30 flex justify-center pointer-events-auto">
              {renderProgressBars()}
            </div>
          )}
        </div>
      </section>
    );
  }

  // ===========================================================================
  // STYLE 3: CONTINUOUS PORTRAIT PEEK GLASS CAROUSEL
  // - 100% uniform vertical 3:4 portrait cards across every slide.
  // - Background strip subtly glows with current active anime's cover art!
  // ===========================================================================
  if (bannerStyle === 'glass') {
    const activeBackdrop = getBackdropSrc(visibleItems[displayIdx] || visibleItems[0]);

    return (
      <section
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        className={`relative overflow-hidden ${framedContainerSpacing} pb-2 select-none`}
      >
        {/* Soft Atmospheric Anime Cover Backdrop Behind Peek Deck */}
        {activeBackdrop && (
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <img
              src={activeBackdrop}
              alt=""
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover scale-125 blur-3xl saturate-150 opacity-30 transition-all duration-700"
            />
          </div>
        )}

        <div className="relative z-10 max-w-7xl mx-auto space-y-2.5">
          <div
            ref={viewportRef}
            className="relative overflow-hidden touch-pan-y group/banner py-1"
          >
            <motion.div
              {...trackDragProps}
              style={{
                ...(trackDragProps as any).style,
                gap: `${geo.gap}px`,
              }}
              className={`flex items-center will-change-transform ${
                hasMultiple ? 'cursor-grab active:cursor-grabbing' : ''
              }`}
              dir="ltr"
            >
              {trackItems.map((item, rawIdx) => {
                const logicalIdx = hasMultiple
                  ? (((rawIdx - padCount) % count) + count) % count
                  : 0;
                const isCentered = !hasMultiple || logicalIdx === displayIdx;
                const metaParts = buildMetaParts(item);

                return (
                  <div
                    key={`glass-${item._id}-${rawIdx}`}
                    onClick={() => {
                      if (dragPreventClickRef.current) return;
                      if (!isCentered && hasMultiple) {
                        jumpToSlide(logicalIdx);
                      } else {
                        onItemClick(item);
                      }
                    }}
                    style={{ width: `${geo.cardWidth}px` }}
                    dir="rtl"
                    className={`theme-keep-dark shrink-0 cursor-pointer relative aspect-[3/4] rounded-[24px] overflow-hidden border transition-[transform,opacity,border-color,box-shadow] duration-300 bg-neutral-900 ${
                      isCentered
                        ? isManga
                          ? 'scale-100 opacity-100 border-amber-400/50 shadow-[0_22px_50px_rgba(0,0,0,0.75)] z-10'
                          : 'scale-100 opacity-100 border-white/25 shadow-[0_22px_50px_rgba(0,0,0,0.75)] z-10'
                        : 'scale-[0.88] opacity-85 border-white/10 hover:opacity-100'
                    }`}
                  >
                    <BannerImage
                      src={getPosterSrc(item)}
                      alt={item.title}
                      fallbackTitle={item.title}
                      className="w-full h-full object-cover object-top pointer-events-none select-none"
                    />

                    <div
                      className="absolute inset-x-0 bottom-0 bg-black/65 backdrop-blur-md border-t border-white/15 px-3.5 py-2.5 space-y-1"
                      style={{ textShadow: '0 1px 4px rgba(0,0,0,0.9)' }}
                    >
                      <div className="flex items-center justify-between gap-2 text-[11px] font-bold tabular-nums">
                        <span className={isManga ? 'text-amber-300' : 'text-rose-300'}>
                          {renderKickerText(item, logicalIdx)}
                        </span>
                        {item.rating && item.rating > 0 ? (
                          <span className="inline-flex items-center gap-1 text-yellow-400 shrink-0">
                            <Star size={11} fill="currentColor" />
                            {Number(item.rating).toFixed(1)}
                          </span>
                        ) : null}
                      </div>

                      <h2 className="text-sm sm:text-base font-black text-white line-clamp-1 [text-wrap:balance]">
                        <LongPressCopy text={item.title}>{item.title}</LongPressCopy>
                      </h2>

                      {metaParts.length > 0 && (
                        <p className="text-[11px] text-neutral-300 truncate">
                          {metaParts.join(' · ')}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </motion.div>

            {renderDesktopArrows('right-4 left-4')}
          </div>

          {hasMultiple && (
            <div className="flex justify-center">
              {renderProgressBars()}
            </div>
          )}
        </div>
      </section>
    );
  }

  // ===========================================================================
  // STYLE 4: SPOTLIGHT CINEMA STAGE + VERTICAL 3:4 COVER RAIL
  // - 100% uniform wide cinema stage across ALL slides (never morphs into a card box!).
  // - Crisp vertical 3:4 cover strip below for swift interactive switching.
  // ===========================================================================
  return (
    <section
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      className={`px-3.5 md:px-6 ${framedContainerSpacing} max-w-7xl mx-auto space-y-3 select-none`}
    >
      <div
        ref={viewportRef}
        className="theme-keep-dark relative rounded-[24px] sm:rounded-[28px] overflow-hidden border border-white/10 bg-[#0b0b10] shadow-2xl touch-pan-y group/banner"
      >
        <motion.div
          {...trackDragProps}
          className={`flex w-full will-change-transform ${
            hasMultiple ? 'cursor-grab active:cursor-grabbing' : ''
          }`}
          dir="ltr"
        >
          {trackItems.map((item, rawIdx) => {
            const logicalIdx = hasMultiple
              ? (((rawIdx - padCount) % count) + count) % count
              : 0;
            const metaParts = buildMetaParts(item);

            return (
              <div
                key={`spotlight-${item._id}-${rawIdx}`}
                onClick={() => {
                  if (dragPreventClickRef.current) return;
                  onItemClick(item);
                }}
                dir="rtl"
                className={`w-full flex-[0_0_100%] cursor-pointer relative overflow-hidden ${
                  display.isCoverScreen
                    ? 'h-[240px]'
                    : 'aspect-[4/5] max-h-[440px] sm:aspect-auto sm:h-[305px] md:h-[345px]'
                }`}
              >
                <UniformCinemaArtwork item={item} />

                <div
                  className="absolute inset-x-0 bottom-0 z-10 pt-10 p-4 sm:p-7 md:p-8 bg-gradient-to-t from-black/80 via-black/40 to-transparent flex items-end pointer-events-none"
                  style={{ textShadow: '0 2px 12px rgba(0,0,0,0.95), 0 1px 4px rgba(0,0,0,0.9)' }}
                >
                  <div className="max-w-2xl space-y-1.5">
                    <p
                      className={`text-[11px] sm:text-xs font-bold tabular-nums ${
                        isManga ? 'text-amber-300' : 'text-rose-300'
                      }`}
                    >
                      {renderKickerText(item, logicalIdx)}
                    </p>

                    <h2 className="pointer-events-auto text-lg sm:text-2xl md:text-3xl font-black text-white leading-snug line-clamp-2 [text-wrap:balance] drop-shadow">
                      <LongPressCopy text={item.title}>{item.title}</LongPressCopy>
                    </h2>

                    <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 text-xs text-neutral-100 font-semibold tabular-nums">
                      {item.rating && item.rating > 0 ? (
                        <span className="inline-flex items-center gap-1 text-yellow-400 font-bold">
                          <Star size={12} fill="currentColor" />
                          {Number(item.rating).toFixed(1)}
                        </span>
                      ) : null}
                      {metaParts.map((part, pIdx) => (
                        <React.Fragment key={pIdx}>
                          {(pIdx > 0 || (item.rating && item.rating > 0)) && (
                            <span className="text-neutral-300" aria-hidden="true">
                              ·
                            </span>
                          )}
                          <span className="truncate max-w-[160px] sm:max-w-xs">{part}</span>
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </motion.div>

        {renderDesktopArrows('right-3 left-3')}
      </div>

      {/* Crisp Vertical 3:4 Cover Strip */}
      {hasMultiple && (
        <div
          ref={thumbRailRef}
          className="flex items-center justify-start sm:justify-center gap-2 sm:gap-2.5 overflow-x-auto hide-scrollbar pb-0.5"
        >
          {visibleItems.map((item, idx) => {
            const isSelected = idx === displayIdx;
            return (
              <button
                key={`spot-thumb-${item._id}-${idx}`}
                type="button"
                aria-label={item.title}
                onClick={() => {
                  if (isSelected) {
                    onItemClick(item);
                  } else {
                    jumpToSlide(idx);
                  }
                }}
                className={`theme-keep-dark relative w-[64px] sm:w-[76px] aspect-[3/4] rounded-xl overflow-hidden shrink-0 cursor-pointer transition-all duration-300 border bg-neutral-900 ${
                  isSelected
                    ? isManga
                      ? 'border-amber-400 opacity-100 scale-[1.03] shadow-lg shadow-amber-500/20'
                      : 'border-[#FF1744] opacity-100 scale-[1.03] shadow-lg shadow-[#FF1744]/20'
                    : 'border-white/10 opacity-85 hover:opacity-100'
                }`}
              >
                <BannerImage
                  src={getPosterSrc(item)}
                  alt={item.title}
                  className="w-full h-full object-cover object-[center_18%]"
                />

                {isSelected && (
                  <motion.span
                    key={`thumb-prog-${displayIdx}-${isPaused || isDragging ? 'p' : 'r'}`}
                    initial={{ scaleX: isPaused || isDragging ? 0.35 : 0 }}
                    animate={{ scaleX: isPaused || isDragging ? 0.35 : 1 }}
                    transition={
                      isPaused || isDragging
                        ? { duration: 0.15 }
                        : { duration: durationSec, ease: 'linear' }
                    }
                    className={`absolute bottom-0 inset-x-0 h-[3px] origin-right ${
                      isManga ? 'bg-amber-400' : 'bg-[#FF1744]'
                    }`}
                  />
                )}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
