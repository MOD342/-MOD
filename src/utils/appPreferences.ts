export type HomeMode = 'anime' | 'manga';

const DEFAULT_HOME_KEY = 'anime_mod_default_home_mode';
const ONBOARDING_KEY = 'anime_mod_onboarding_v1_done';
const DATA_SAVER_KEY = 'anime_mod_data_saver_mode';

export const HOME_MODE_CHANGED_EVENT = 'otaku:default-home-changed';
export const ONBOARDING_RESET_EVENT = 'otaku:onboarding-reset';
export const DATA_SAVER_CHANGED_EVENT = 'otaku:data-saver-changed';

export function getDataSaverEnabled(): boolean {
  try {
    return localStorage.getItem(DATA_SAVER_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setDataSaverEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(DATA_SAVER_KEY, enabled ? 'true' : 'false');
  } catch {
    // ignore storage errors
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(DATA_SAVER_CHANGED_EVENT, { detail: { enabled } }));
  }
}

export function getDefaultHomeMode(): HomeMode {
  try {
    const raw = localStorage.getItem(DEFAULT_HOME_KEY);
    if (raw === 'manga' || raw === 'anime') {
      return raw;
    }
  } catch {
    // ignore storage errors
  }
  return 'anime';
}

export function setDefaultHomeMode(mode: HomeMode): void {
  try {
    localStorage.setItem(DEFAULT_HOME_KEY, mode);
  } catch {
    // ignore storage errors
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(HOME_MODE_CHANGED_EVENT, { detail: { mode } }));
  }
}

export function isOnboardingCompleted(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_KEY) === 'true';
  } catch {
    return true;
  }
}

export function markOnboardingCompleted(): void {
  try {
    localStorage.setItem(ONBOARDING_KEY, 'true');
  } catch {
    // ignore storage errors
  }
}

export function reopenOnboarding(): void {
  try {
    localStorage.removeItem(ONBOARDING_KEY);
  } catch {
    // ignore storage errors
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(ONBOARDING_RESET_EVENT));
  }
}
