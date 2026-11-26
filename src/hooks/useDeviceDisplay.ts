import { useState, useEffect } from 'react';
import { applyViewportAndCutoutMetrics, SafeViewportMetrics } from '../utils/viewportMetrics';

export interface DeviceDisplayState extends SafeViewportMetrics {
  isCoverScreen: boolean;
  isCompactPhone: boolean;
  isPhone: boolean;
  isUnfoldedFoldable: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isWideOrUnfolded: boolean;
  isBookPosture: boolean;
  isTabletopPosture: boolean;
  isLandscape: boolean;
  hasCameraCutout: boolean;
}

function buildState(m: SafeViewportMetrics): DeviceDisplayState {
  const isCoverScreen = m.formFactor === 'foldable-cover' || m.posture === 'cover';
  const isCompactPhone = isCoverScreen || m.viewportWidth < 380;
  const isPhone = m.formFactor === 'phone' || isCoverScreen;
  const isUnfoldedFoldable = m.formFactor === 'foldable-unfolded';
  const isTablet = m.formFactor === 'tablet';
  const isDesktop = m.formFactor === 'desktop';
  const isBookPosture = m.posture === 'book';
  const isTabletopPosture = m.posture === 'tabletop';
  const isLandscape = m.orientation === 'landscape';
  const isWideOrUnfolded = isUnfoldedFoldable || isTablet || isDesktop || m.viewportWidth >= 768;
  const hasCameraCutout = Boolean(m.cutoutRect?.visible);

  return {
    ...m,
    isCoverScreen,
    isCompactPhone,
    isPhone,
    isUnfoldedFoldable,
    isTablet,
    isDesktop,
    isWideOrUnfolded,
    isBookPosture,
    isTabletopPosture,
    isLandscape,
    hasCameraCutout,
  };
}

export function useDeviceDisplay(): DeviceDisplayState {
  const [state, setState] = useState<DeviceDisplayState>(() =>
    buildState(applyViewportAndCutoutMetrics())
  );

  useEffect(() => {
    const handleDisplayChanged = (e: Event) => {
      const detail = (e as CustomEvent<SafeViewportMetrics>)?.detail;
      if (detail) {
        setState(buildState(detail));
      } else {
        setState(buildState(applyViewportAndCutoutMetrics()));
      }
    };

    window.addEventListener('otaku:display-changed', handleDisplayChanged);
    return () => {
      window.removeEventListener('otaku:display-changed', handleDisplayChanged);
    };
  }, []);

  return state;
}
