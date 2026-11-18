import React, { createContext, useContext, useEffect, useState } from 'react';

export type ThemeMode = 'light' | 'dark' | 'amoled' | 'auto';
export type ResolvedTheme = 'light' | 'dark' | 'amoled';

const STORAGE_KEY = 'anime_mod_theme_mode';

const THEME_META_COLORS: Record<ResolvedTheme, string> = {
  light: '#f4f5f8',
  dark: '#0c0e16',
  amoled: '#000000',
};

function getSystemPreferredScheme(): 'light' | 'dark' {
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function resolveThemeMode(mode: ThemeMode, systemScheme?: 'light' | 'dark'): ResolvedTheme {
  if (mode === 'auto') {
    return systemScheme || getSystemPreferredScheme();
  }
  return mode;
}

function readStoredThemeMode(): ThemeMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'light' || raw === 'dark' || raw === 'amoled' || raw === 'auto') {
      return raw;
    }
  } catch {
    // ignore storage failures
  }
  return 'dark';
}

function applyThemeToDocument(mode: ThemeMode, resolved: ResolvedTheme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.setAttribute('data-theme-mode', mode);
  root.setAttribute('data-resolved-theme', resolved);
  root.style.colorScheme = resolved === 'light' ? 'light' : 'dark';

  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    metaTheme.setAttribute('content', THEME_META_COLORS[resolved]);
  }
}

interface ThemeContextValue {
  themeMode: ThemeMode;
  resolvedTheme: ResolvedTheme;
  systemScheme: 'light' | 'dark';
  setThemeMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  themeMode: 'dark',
  resolvedTheme: 'dark',
  systemScheme: 'dark',
  setThemeMode: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeMode, setThemeModeState] = useState<ThemeMode>(readStoredThemeMode);
  const [systemScheme, setSystemScheme] = useState<'light' | 'dark'>(getSystemPreferredScheme);

  const resolvedTheme = resolveThemeMode(themeMode, systemScheme);

  useEffect(() => {
    applyThemeToDocument(themeMode, resolvedTheme);
  }, [themeMode, resolvedTheme]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      setSystemScheme(e.matches ? 'dark' : 'light');
    };
    setSystemScheme(mq.matches ? 'dark' : 'light');
    if (mq.addEventListener) {
      mq.addEventListener('change', handleChange);
      return () => mq.removeEventListener('change', handleChange);
    }
    mq.addListener(handleChange);
    return () => mq.removeListener(handleChange);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        const next = e.newValue;
        if (next === 'light' || next === 'dark' || next === 'amoled' || next === 'auto') {
          setThemeModeState(next);
        }
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const setThemeMode = (mode: ThemeMode) => {
    setThemeModeState(mode);
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // ignore storage quota errors
    }
  };

  return (
    <ThemeContext.Provider value={{ themeMode, resolvedTheme, systemScheme, setThemeMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
