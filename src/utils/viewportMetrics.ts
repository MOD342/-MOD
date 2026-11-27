import { Capacitor } from '@capacitor/core';

export type DeviceFormFactor =
  | 'foldable-cover'
  | 'phone'
  | 'foldable-unfolded'
  | 'tablet'
  | 'desktop';

export type FoldPosture = 'flat' | 'book' | 'tabletop' | 'cover';

export interface FoldSegmentRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export type CutoutShape = 'circle' | 'pill' | 'notch' | 'none';
export type CutoutPosition = 'center' | 'left' | 'right';

export interface CutoutGeometry {
  visible: boolean;
  left: number;
  top: number;
  width: number;
  height: number;
  radius: number;
  shape: CutoutShape;
  position: CutoutPosition;
}

export interface SafeViewportMetrics {
  safeTop: number;
  safeBottom: number;
  safeLeft: number;
  safeRight: number;
  viewportHeight: number;
  viewportWidth: number;
  hasNotch: boolean;
  isTouchDevice: boolean;
  orientation: 'portrait' | 'landscape';
  formFactor: DeviceFormFactor;
  posture: FoldPosture;
  isFoldable: boolean;
  hingeGap: number;
  leftPaneWidth: number;
  rightPaneWidth: number;
  topPaneHeight: number;
  bottomPaneHeight: number;
  cutoutRect: CutoutGeometry;
}

const EMPTY_CUTOUT: CutoutGeometry = {
  visible: false,
  left: 0,
  top: 0,
  width: 0,
  height: 0,
  radius: 0,
  shape: 'none',
  position: 'center',
};

let trackingInitialized = false;
let lastBroadcastSignature = '';
let envInsetsCache: { top: number; bottom: number; left: number; right: number } | null = null;
let rafPending = false;

function measureCssEnvInsets(forceRefresh = false): { top: number; bottom: number; left: number; right: number } {
  if (!forceRefresh && envInsetsCache) {
    return envInsetsCache;
  }
  if (typeof document === 'undefined' || !document.body) {
    return { top: 0, bottom: 0, left: 0, right: 0 };
  }
  try {
    const probe = document.createElement('div');
    probe.style.cssText =
      'position:fixed;visibility:hidden;pointer-events:none;margin:0;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px);';
    document.body.appendChild(probe);
    const computed = window.getComputedStyle(probe);
    const result = {
      top: parseFloat(computed.paddingTop || '0') || 0,
      bottom: parseFloat(computed.paddingBottom || '0') || 0,
      left: parseFloat(computed.paddingLeft || '0') || 0,
      right: parseFloat(computed.paddingRight || '0') || 0,
    };
    document.body.removeChild(probe);
    envInsetsCache = result;
    return result;
  } catch {
    return { top: 0, bottom: 0, left: 0, right: 0 };
  }
}

function getWindowSegments(vvWidth: number, vvHeight: number): FoldSegmentRect[] {
  if (typeof window === 'undefined') return [];
  try {
    const vv = window.visualViewport as (VisualViewport & { segments?: DOMRect[] }) | null;
    if (vv && Array.isArray(vv.segments) && vv.segments.length > 1) {
      return vv.segments.map((s) => ({
        left: Math.round(s.left),
        top: Math.round(s.top),
        width: Math.round(s.width),
        height: Math.round(s.height),
      }));
    }

    const legacyGetter = (window as any).getWindowSegments;
    if (typeof legacyGetter === 'function') {
      const segs = legacyGetter.call(window);
      if (Array.isArray(segs) && segs.length > 1) {
        return segs.map((s: any) => ({
          left: Math.round(s.left || 0),
          top: Math.round(s.top || 0),
          width: Math.round(s.width || 0),
          height: Math.round(s.height || 0),
        }));
      }
    }

    // Fallback: inspect CSS Viewport Segments Media Queries if exposed by browser/WebView
    const hasHorizSegments = window.matchMedia?.('(horizontal-viewport-segments: 2)').matches;
    const hasVertSegments = window.matchMedia?.('(vertical-viewport-segments: 2)').matches;
    if (hasHorizSegments && vvWidth > 0) {
      const half = Math.floor(vvWidth / 2);
      return [
        { left: 0, top: 0, width: half, height: vvHeight },
        { left: half, top: 0, width: vvWidth - half, height: vvHeight },
      ];
    }
    if (hasVertSegments && vvHeight > 0) {
      const half = Math.floor(vvHeight / 2);
      return [
        { left: 0, top: 0, width: vvWidth, height: half },
        { left: 0, top: half, width: vvWidth, height: vvHeight - half },
      ];
    }
  } catch {}
  return [];
}

function detectTouchCapability(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return (
      window.matchMedia?.('(pointer: coarse)').matches ||
      navigator.maxTouchPoints > 0 ||
      Capacitor.isNativePlatform()
    );
  } catch {
    return false;
  }
}

function resolveCutoutGeometry(
  rawCutout:
    | {
        visible?: boolean;
        left?: number;
        top?: number;
        width?: number;
        height?: number;
        radius?: number;
        shape?: string;
        position?: string;
      }
    | undefined,
  safeTop: number,
  viewportWidth: number,
): CutoutGeometry {
  if (rawCutout) {
    const w = Math.max(0, Math.round(Number(rawCutout.width || 0)));
    const h = Math.max(0, Math.round(Number(rawCutout.height || 0)));
    if (rawCutout.visible && w > 0 && h > 0) {
      const left = Math.max(0, Math.round(Number(rawCutout.left || 0)));
      const top = Math.max(0, Math.round(Number(rawCutout.top || 0)));
      const radius = Math.max(0, Math.round(Number(rawCutout.radius || Math.ceil(Math.min(w, h) / 2))));
      const shapeRaw = String(rawCutout.shape || '').toLowerCase();
      const shape: CutoutShape =
        shapeRaw === 'pill' || shapeRaw === 'notch' || shapeRaw === 'circle'
          ? (shapeRaw as CutoutShape)
          : top <= 2 && w > 54
          ? 'notch'
          : w / Math.max(1, h) >= 1.45
          ? 'pill'
          : 'circle';
      const posRaw = String(rawCutout.position || '').toLowerCase();
      let position: CutoutPosition = 'center';
      if (posRaw === 'left' || posRaw === 'right' || posRaw === 'center') {
        position = posRaw as CutoutPosition;
      } else if (viewportWidth > 0) {
        const centerX = left + w / 2;
        if (centerX < viewportWidth * 0.36) position = 'left';
        else if (centerX > viewportWidth * 0.64) position = 'right';
      }
      return { visible: true, left, top, width: w, height: h, radius, shape, position };
    }
    if (rawCutout.visible === false) {
      return { ...EMPTY_CUTOUT };
    }
  }

  // Fallback estimation for native Android WebViews before native bridge injection finishes
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android' && safeTop >= 22 && viewportWidth > 0) {
    const size = 22;
    return {
      visible: true,
      left: Math.round((viewportWidth - size) / 2),
      top: Math.max(4, Math.round((safeTop - size) / 2)),
      width: size,
      height: size,
      radius: 11,
      shape: 'circle',
      position: 'center',
    };
  }

  return { ...EMPTY_CUTOUT };
}

export function applyViewportAndCutoutMetrics(): SafeViewportMetrics {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return {
      safeTop: 0,
      safeBottom: 0,
      safeLeft: 0,
      safeRight: 0,
      viewportHeight: 0,
      viewportWidth: 0,
      hasNotch: false,
      isTouchDevice: false,
      orientation: 'portrait',
      formFactor: 'desktop',
      posture: 'flat',
      isFoldable: false,
      hingeGap: 0,
      leftPaneWidth: 0,
      rightPaneWidth: 0,
      topPaneHeight: 0,
      bottomPaneHeight: 0,
      cutoutRect: { ...EMPTY_CUTOUT },
    };
  }

  const root = document.documentElement;
  const vv = window.visualViewport;
  const viewportHeight = Math.round(vv?.height || window.innerHeight || 0);
  const viewportWidth = Math.round(vv?.width || window.innerWidth || 0);

  const androidInsets = (window as any).__ANDROID_INSETS__ as
    | {
        top?: number;
        bottom?: number;
        left?: number;
        right?: number;
        cutoutTop?: number;
        hingeGap?: number;
        posture?: FoldPosture;
        cutout?: {
          visible?: boolean;
          left?: number;
          top?: number;
          width?: number;
          height?: number;
          radius?: number;
          shape?: CutoutShape;
          position?: CutoutPosition;
        };
      }
    | undefined;

  const { top: envTop, bottom: envBottom, left: envLeft, right: envRight } = measureCssEnvInsets(false);

  let safeTop = Math.max(envTop, Number(androidInsets?.top || 0), Number(androidInsets?.cutoutTop || 0));
  const safeBottom = Math.max(envBottom, Number(androidInsets?.bottom || 0));
  const safeLeft = Math.max(envLeft, Number(androidInsets?.left || 0));
  const safeRight = Math.max(envRight, Number(androidInsets?.right || 0));

  if (safeTop === 0 && Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android' && !androidInsets) {
    const aspect =
      viewportHeight > 0 && viewportWidth > 0
        ? Math.max(viewportHeight, viewportWidth) / Math.min(viewportHeight, viewportWidth)
        : 0;
    if (aspect >= 1.95 && viewportHeight >= viewportWidth) {
      safeTop = 28;
    }
  }

  const cutoutRect = resolveCutoutGeometry(androidInsets?.cutout, safeTop, viewportWidth);
  const hasNotch = cutoutRect.visible || safeTop > 0 || safeLeft > 0 || safeRight > 0;
  const isTouchDevice = detectTouchCapability();
  const orientation: 'portrait' | 'landscape' = viewportWidth > viewportHeight ? 'landscape' : 'portrait';
  const aspectRatio = viewportHeight > 0 ? viewportWidth / viewportHeight : 1;
  const tallAspect = viewportWidth > 0 ? viewportHeight / viewportWidth : 1;

  // Foldable & Multi-Segment Detection (W3C Device Posture + Window Segments + Geometry)
  const segments = getWindowSegments(viewportWidth, viewportHeight);
  const devicePostureType: string | undefined = (navigator as any)?.devicePosture?.type;
  const hasNativeFoldPosture = devicePostureType === 'folded' || Boolean(androidInsets?.posture && androidInsets.posture !== 'flat');

  let hingeGap = Math.max(0, Number(androidInsets?.hingeGap || 0));
  let leftPaneWidth = Math.floor(viewportWidth / 2);
  let rightPaneWidth = viewportWidth - leftPaneWidth;
  let topPaneHeight = Math.floor(viewportHeight / 2);
  let bottomPaneHeight = viewportHeight - topPaneHeight;

  let posture: FoldPosture = 'flat';
  let formFactor: DeviceFormFactor = 'phone';
  let isFoldable = false;

  if (segments.length >= 2) {
    isFoldable = true;
    const s0 = segments[0];
    const s1 = segments[1];
    // Horizontal side-by-side panes (Book mode)
    if (Math.abs(s0.left - s1.left) > 20 && Math.abs(s0.top - s1.top) < 20) {
      posture = 'book';
      leftPaneWidth = s0.width;
      rightPaneWidth = s1.width;
      hingeGap = Math.max(hingeGap, Math.max(0, s1.left - (s0.left + s0.width)));
    } else if (Math.abs(s0.top - s1.top) > 20) {
      // Vertical top-bottom panes (Tabletop / Flex mode)
      posture = 'tabletop';
      topPaneHeight = s0.height;
      bottomPaneHeight = s1.height;
      hingeGap = Math.max(hingeGap, Math.max(0, s1.top - (s0.top + s0.height)));
    }
  } else if (hasNativeFoldPosture) {
    isFoldable = true;
    posture = androidInsets?.posture || (orientation === 'landscape' ? 'book' : 'tabletop');
  } else if (viewportWidth > 0 && viewportHeight > 0) {
    // Tall outer cover screen of foldables (e.g., Galaxy Z Fold cover ~23:9 / <=365px wide)
    if (viewportWidth <= 368 && tallAspect >= 2.08) {
      isFoldable = true;
      posture = 'cover';
      formFactor = 'foldable-cover';
    } else if (
      isTouchDevice &&
      viewportWidth >= 560 &&
      viewportWidth <= 960 &&
      aspectRatio >= 0.74 &&
      aspectRatio <= 1.38
    ) {
      // Unfolded inner foldable canvas (squarish dual-pane dimensions)
      isFoldable = true;
      posture = 'book';
      formFactor = 'foldable-unfolded';
      hingeGap = Math.max(hingeGap, 16);
    }
  }

  // Resolve primary formFactor if not already set by foldable geometry
  if (formFactor !== 'foldable-cover' && formFactor !== 'foldable-unfolded') {
    if (isFoldable && posture === 'book') {
      formFactor = 'foldable-unfolded';
    } else if (viewportWidth < 640) {
      formFactor = viewportWidth <= 368 && tallAspect >= 2.08 ? 'foldable-cover' : 'phone';
    } else if (viewportWidth < 1024) {
      formFactor = 'tablet';
    } else {
      formFactor = 'desktop';
    }
  }

  root.style.setProperty('--safe-top', `${Math.round(safeTop)}px`);
  root.style.setProperty('--safe-bottom', `${Math.round(safeBottom)}px`);
  root.style.setProperty('--safe-left', `${Math.round(safeLeft)}px`);
  root.style.setProperty('--safe-right', `${Math.round(safeRight)}px`);
  root.style.setProperty('--fold-hinge-gap', `${Math.round(hingeGap)}px`);
  root.style.setProperty('--fold-left-pane', `${Math.round(leftPaneWidth)}px`);
  root.style.setProperty('--fold-right-pane', `${Math.round(rightPaneWidth)}px`);
  root.style.setProperty('--fold-top-pane', `${Math.round(topPaneHeight)}px`);
  root.style.setProperty('--fold-bottom-pane', `${Math.round(bottomPaneHeight)}px`);

  const clearLeft =
    cutoutRect.visible && cutoutRect.position === 'left'
      ? Math.max(0, cutoutRect.left + cutoutRect.width + 10)
      : 0;
  const clearRight =
    cutoutRect.visible && cutoutRect.position === 'right' && viewportWidth > 0
      ? Math.max(0, viewportWidth - cutoutRect.left + 10)
      : 0;

  const provisionalMetrics: SafeViewportMetrics = {
    safeTop: Math.round(safeTop),
    safeBottom: Math.round(safeBottom),
    safeLeft: Math.round(safeLeft),
    safeRight: Math.round(safeRight),
    viewportHeight,
    viewportWidth,
    hasNotch,
    isTouchDevice,
    orientation,
    formFactor,
    posture,
    isFoldable,
    hingeGap: Math.round(hingeGap),
    leftPaneWidth: Math.round(leftPaneWidth),
    rightPaneWidth: Math.round(rightPaneWidth),
    topPaneHeight: Math.round(topPaneHeight),
    bottomPaneHeight: Math.round(bottomPaneHeight),
    cutoutRect,
  };

  const cutoutBarGeo = computeCutoutBarGeometry(provisionalMetrics);

  root.style.setProperty('--cutout-left', `${cutoutRect.left}px`);
  root.style.setProperty('--cutout-top', `${cutoutRect.top}px`);
  root.style.setProperty('--cutout-width', `${cutoutRect.width}px`);
  root.style.setProperty('--cutout-height', `${cutoutRect.height}px`);
  root.style.setProperty('--cutout-radius', `${cutoutRect.radius}px`);
  root.style.setProperty('--cutout-clear-left', `${clearLeft}px`);
  root.style.setProperty('--cutout-clear-right', `${clearRight}px`);
  root.style.setProperty('--cutout-band-top', `${cutoutBarGeo.bandBottomPx}px`);

  if (viewportHeight > 0) {
    root.style.setProperty('--vv-height', `${viewportHeight}px`);
  }
  if (viewportWidth > 0) {
    root.style.setProperty('--vv-width', `${viewportWidth}px`);
  }

  root.dataset.device = formFactor;
  root.dataset.posture = posture;
  root.dataset.orientation = orientation;
  root.dataset.pointer = isTouchDevice ? 'touch' : 'fine';
  root.dataset.cutoutShape = cutoutRect.shape;
  root.dataset.cutoutPos = cutoutRect.position;

  const metrics = provisionalMetrics;

  const sig = `${formFactor}|${posture}|${orientation}|${viewportWidth}x${viewportHeight}|${metrics.hingeGap}|${metrics.safeTop}|${cutoutRect.visible ? `${cutoutRect.shape}:${cutoutRect.position}:${cutoutRect.left}:${cutoutRect.top}:${cutoutRect.width}x${cutoutRect.height}` : 'no-cutout'}`;
  if (sig !== lastBroadcastSignature) {
    lastBroadcastSignature = sig;
    try {
      window.dispatchEvent(new CustomEvent('otaku:display-changed', { detail: metrics }));
    } catch {}
  }

  return metrics;
}

export interface CutoutBarGeometry {
  mode: 'flank-center' | 'offset-left' | 'offset-right' | 'below-safe-top';
  hasCutout: boolean;
  headerTopPx: number;
  bandBottomPx: number;
  paddingLeftPx: number;
  paddingRightPx: number;
  leftZoneWidth: number;
  cutoutSpacerWidth: number;
  rightZoneWidth: number;
  cutoutBorderRadius: string;
}

export function computeCutoutBarGeometry(display: SafeViewportMetrics): CutoutBarGeometry {
  const cutout = display.cutoutRect;
  const vw = Math.max(0, Number(display.viewportWidth || 0));
  const safeTop = Math.max(0, Number(display.safeTop || 0));
  const safeLeft = Math.max(0, Number(display.safeLeft || 0));
  const safeRight = Math.max(0, Number(display.safeRight || 0));
  const hasCutout = Boolean(cutout?.visible && cutout.width > 0 && cutout.height > 0);

  const rowHeight = 44;
  const cutoutBorderRadius =
    cutout?.shape === 'notch'
      ? '0 0 12px 12px'
      : `${Math.max(4, cutout?.radius || Math.ceil((cutout?.height || 22) / 2))}px`;

  if (hasCutout && vw > 0) {
    const cutoutCenterY = cutout.top + cutout.height / 2;
    const alignedTop = Math.max(2, Math.round(cutoutCenterY - rowHeight / 2));

    if (cutout.position === 'center') {
      const basePadL = Math.max(8, safeLeft + 8);
      const basePadR = Math.max(8, safeRight + 8);
      const guardGap = 6;
      const leftZone = cutout.left - guardGap - basePadL;
      const rightZone = vw - basePadR - (cutout.left + cutout.width + guardGap);

      // Flank center cutout horizontally whenever both sides have room for compact touch controls
      if (vw >= 320 && leftZone >= 96 && rightZone >= 96) {
        const bandBottom = Math.max(
          alignedTop + rowHeight + 6,
          cutout.top + cutout.height + 6,
          safeTop + 6,
        );
        return {
          mode: 'flank-center',
          hasCutout: true,
          headerTopPx: alignedTop,
          bandBottomPx: Math.round(bandBottom),
          paddingLeftPx: basePadL,
          paddingRightPx: basePadR,
          leftZoneWidth: Math.round(leftZone),
          cutoutSpacerWidth: Math.round(cutout.width + guardGap * 2),
          rightZoneWidth: Math.round(rightZone),
          cutoutBorderRadius,
        };
      }

      // Ultra-wide notch or ultra-narrow viewport: place controls immediately below notch
      const belowTop = Math.max(safeTop + 4, cutout.top + cutout.height + 4);
      return {
        mode: 'below-safe-top',
        hasCutout: true,
        headerTopPx: Math.round(belowTop),
        bandBottomPx: Math.round(belowTop + rowHeight + 6),
        paddingLeftPx: basePadL,
        paddingRightPx: basePadR,
        leftZoneWidth: 0,
        cutoutSpacerWidth: 0,
        rightZoneWidth: 0,
        cutoutBorderRadius,
      };
    }

    if (cutout.position === 'left') {
      const padL = Math.max(safeLeft + 10, cutout.left + cutout.width + 8);
      const padR = Math.max(safeRight + 10, 10);
      const bandBottom = Math.max(alignedTop + rowHeight + 6, cutout.top + cutout.height + 6, safeTop + 6);
      return {
        mode: 'offset-left',
        hasCutout: true,
        headerTopPx: alignedTop,
        bandBottomPx: Math.round(bandBottom),
        paddingLeftPx: Math.round(padL),
        paddingRightPx: Math.round(padR),
        leftZoneWidth: 0,
        cutoutSpacerWidth: 0,
        rightZoneWidth: 0,
        cutoutBorderRadius,
      };
    }

    if (cutout.position === 'right') {
      const padL = Math.max(safeLeft + 10, 10);
      const padR = Math.max(safeRight + 10, vw - cutout.left + 8);
      const bandBottom = Math.max(alignedTop + rowHeight + 6, cutout.top + cutout.height + 6, safeTop + 6);
      return {
        mode: 'offset-right',
        hasCutout: true,
        headerTopPx: alignedTop,
        bandBottomPx: Math.round(bandBottom),
        paddingLeftPx: Math.round(padL),
        paddingRightPx: Math.round(padR),
        leftZoneWidth: 0,
        cutoutSpacerWidth: 0,
        rightZoneWidth: 0,
        cutoutBorderRadius,
      };
    }
  }

  const fallbackTop = Math.max(4, safeTop + 4);
  return {
    mode: 'below-safe-top',
    hasCutout,
    headerTopPx: Math.round(fallbackTop),
    bandBottomPx: Math.round(fallbackTop + rowHeight + 6),
    paddingLeftPx: Math.round(Math.max(12, safeLeft + 12)),
    paddingRightPx: Math.round(Math.max(12, safeRight + 12)),
    leftZoneWidth: 0,
    cutoutSpacerWidth: 0,
    rightZoneWidth: 0,
    cutoutBorderRadius,
  };
}

export function initViewportAndCutoutTracking(): void {
  if (trackingInitialized || typeof window === 'undefined') return;
  trackingInitialized = true;

  const sync = (invalidateEnv = false) => {
    if (invalidateEnv) envInsetsCache = null;
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      applyViewportAndCutoutMetrics();
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => sync(true), { once: true });
  } else {
    measureCssEnvInsets(true);
    applyViewportAndCutoutMetrics();
  }

  window.addEventListener('resize', () => sync(true), { passive: true });
  window.addEventListener('orientationchange', () => sync(true), { passive: true });
  window.addEventListener('android-insets-updated', () => sync(true));
  window.visualViewport?.addEventListener('resize', () => sync(false));

  // Listen to W3C Device Posture API changes when supported (fold / unfold transitions)
  try {
    const dp = (navigator as any)?.devicePosture;
    if (dp && typeof dp.addEventListener === 'function') {
      dp.addEventListener('change', () => sync(true));
    }
  } catch {}

  // Listen to CSS Viewport Segments media query transitions
  try {
    const hq = window.matchMedia?.('(horizontal-viewport-segments: 2)');
    const vq = window.matchMedia?.('(vertical-viewport-segments: 2)');
    hq?.addEventListener?.('change', () => sync(true));
    vq?.addEventListener?.('change', () => sync(true));
  } catch {}
}
