export type TelemetrySource =
  | 'runtime'
  | 'promise'
  | 'react'
  | 'network'
  | 'firestore'
  | 'console'
  | 'scraper';

export type TelemetrySeverity = 'error' | 'warning' | 'info';

export type DiagnosticsTabKey = 'tests' | 'errors' | 'ai-report' | 'tools';

export interface TelemetryEvent {
  id: string;
  timestamp: number;
  source: TelemetrySource;
  severity: TelemetrySeverity;
  title: string;
  message: string;
  url?: string;
  statusCode?: number;
  details?: string;
  stack?: string;
  count: number;
}

const TELEMETRY_STORAGE_KEY = 'otaku_error_telemetry_v1';
const PENDING_DIAG_TAB_KEY = 'otaku_pending_diagnostics_tab';
const MAX_TELEMETRY_EVENTS = 80;

type TelemetryListener = (events: TelemetryEvent[]) => void;

const listeners = new Set<TelemetryListener>();
let memoryEvents: TelemetryEvent[] = loadStoredEvents();

function loadStoredEvents(): TelemetryEvent[] {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return [];
    const raw = window.localStorage.getItem(TELEMETRY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, MAX_TELEMETRY_EVENTS) : [];
  } catch {
    return [];
  }
}

function persistEvents(events: TelemetryEvent[]): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(
        TELEMETRY_STORAGE_KEY,
        JSON.stringify(events.slice(0, MAX_TELEMETRY_EVENTS))
      );
    }
  } catch {}
}

function notifyListeners(): void {
  const snapshot = [...memoryEvents];
  listeners.forEach((cb) => {
    try {
      cb(snapshot);
    } catch {}
  });
}

export function getTelemetryEvents(): TelemetryEvent[] {
  return [...memoryEvents];
}

export function clearTelemetryEvents(): void {
  memoryEvents = [];
  persistEvents(memoryEvents);
  notifyListeners();
}

export function subscribeTelemetry(listener: TelemetryListener): () => void {
  listeners.add(listener);
  try {
    listener([...memoryEvents]);
  } catch {}
  return () => {
    listeners.delete(listener);
  };
}

export function recordTelemetryError(input: {
  source: TelemetrySource;
  severity?: TelemetrySeverity;
  title: string;
  message: string;
  url?: string;
  statusCode?: number;
  details?: string;
  stack?: string;
}): void {
  const cleanMsg = String(input.message || '').trim().slice(0, 1000);
  const cleanTitle = String(input.title || 'خطأ غير متوقع').trim().slice(0, 200);
  const severity: TelemetrySeverity = input.severity || 'error';

  // Ignore noisy non-actionable ResizeObserver or Vite HMR noise
  if (
    cleanMsg.includes('ResizeObserver loop') ||
    cleanMsg.includes('vite') && cleanMsg.includes('WebSocket')
  ) {
    return;
  }

  const now = Date.now();
  const existingIdx = memoryEvents.findIndex(
    (e) =>
      e.source === input.source &&
      e.title === cleanTitle &&
      e.message === cleanMsg &&
      (e.url || '') === (input.url || '') &&
      now - e.timestamp < 60_000
  );

  if (existingIdx !== -1) {
    const existing = memoryEvents[existingIdx];
    const updated: TelemetryEvent = {
      ...existing,
      timestamp: now,
      count: existing.count + 1,
      details: input.details || existing.details,
      statusCode: input.statusCode ?? existing.statusCode,
    };
    memoryEvents = [
      updated,
      ...memoryEvents.slice(0, existingIdx),
      ...memoryEvents.slice(existingIdx + 1),
    ];
  } else {
    const entry: TelemetryEvent = {
      id: `err_${now}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: now,
      source: input.source,
      severity,
      title: cleanTitle,
      message: cleanMsg || cleanTitle,
      url: input.url ? String(input.url).slice(0, 500) : undefined,
      statusCode: input.statusCode,
      details: input.details ? String(input.details).slice(0, 2500) : undefined,
      stack: input.stack ? String(input.stack).slice(0, 2500) : undefined,
      count: 1,
    };
    memoryEvents = [entry, ...memoryEvents].slice(0, MAX_TELEMETRY_EVENTS);
  }

  persistEvents(memoryEvents);
  notifyListeners();
}

export function openDiagnosticsScreen(initialTab: DiagnosticsTabKey = 'errors'): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(PENDING_DIAG_TAB_KEY, initialTab);
  } catch {}
  window.dispatchEvent(
    new CustomEvent('otaku:open-diagnostics', { detail: { initialTab } })
  );
}

export function consumePendingDiagnosticsTab(): DiagnosticsTabKey | null {
  if (typeof window === 'undefined') return null;
  try {
    const val = sessionStorage.getItem(PENDING_DIAG_TAB_KEY) as DiagnosticsTabKey | null;
    if (val) {
      sessionStorage.removeItem(PENDING_DIAG_TAB_KEY);
      return val;
    }
  } catch {}
  return null;
}

export interface DeploymentEnvironmentInfo {
  platform: 'vercel' | 'aistudio-dev' | 'aistudio-pre' | 'capacitor-apk' | 'localhost' | 'custom-web';
  platformLabelAr: string;
  hostname: string;
  origin: string;
  protocol: string;
  isHttps: boolean;
  isApkShell: boolean;
  configuredCustomHost: string;
  viteApiUrlRaw: string;
  userAgent: string;
  online: boolean;
}

export function detectDeploymentEnvironment(): DeploymentEnvironmentInfo {
  if (typeof window === 'undefined') {
    return {
      platform: 'custom-web',
      platformLabelAr: 'خادم Node',
      hostname: 'server',
      origin: '',
      protocol: 'http:',
      isHttps: false,
      isApkShell: false,
      configuredCustomHost: '',
      viteApiUrlRaw: '',
      userAgent: 'Node',
      online: true,
    };
  }

  const hostname = window.location.hostname || '';
  const protocol = window.location.protocol || 'http:';
  const isApkShell =
    protocol === 'file:' ||
    protocol === 'capacitor:' ||
    protocol === 'ionic:' ||
    protocol === 'content:' ||
    Boolean((window as any).Capacitor) ||
    Boolean((window as any).cordova) ||
    Boolean((window as any).AndroidInterface) ||
    (hostname === 'localhost' && !window.location.port);

  let platform: DeploymentEnvironmentInfo['platform'] = 'custom-web';
  let platformLabelAr = 'نطاق ويب مخصص';

  if (isApkShell) {
    platform = 'capacitor-apk';
    platformLabelAr = 'تطبيق أندرويد (APK / Capacitor)';
  } else if (hostname.includes('vercel.app') || hostname.includes('.vercel.')) {
    platform = 'vercel';
    platformLabelAr = 'استضافة Vercel';
  } else if (hostname.includes('ais-dev-')) {
    platform = 'aistudio-dev';
    platformLabelAr = 'بيئة التطوير السحابية (AI Studio Dev)';
  } else if (hostname.includes('ais-pre-')) {
    platform = 'aistudio-pre';
    platformLabelAr = 'بيئة المعاينة المشتركة (AI Studio Shared)';
  } else if (hostname === 'localhost' || hostname === '127.0.0.1') {
    platform = 'localhost';
    platformLabelAr = 'خادم محلي (Localhost)';
  }

  let configuredCustomHost = '';
  try {
    configuredCustomHost = localStorage.getItem('custom_api_host') || '';
  } catch {}

  let viteApiUrlRaw = '';
  try {
    viteApiUrlRaw = (import.meta.env?.VITE_API_URL || '').trim();
  } catch {}

  return {
    platform,
    platformLabelAr,
    hostname,
    origin: window.location.origin,
    protocol,
    isHttps: protocol === 'https:',
    isApkShell,
    configuredCustomHost,
    viteApiUrlRaw,
    userAgent: navigator.userAgent,
    online: navigator.onLine,
  };
}

let telemetryInitialized = false;

export function initGlobalErrorTelemetry(): void {
  if (typeof window === 'undefined' || telemetryInitialized) return;
  telemetryInitialized = true;

  window.addEventListener(
    'error',
    (event: ErrorEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && target !== (window as any) && target.tagName) {
        const tag = target.tagName.toLowerCase();
        if (tag === 'script' || tag === 'link') {
          const src = (target as HTMLScriptElement).src || (target as HTMLLinkElement).href || '';
          recordTelemetryError({
            source: 'runtime',
            severity: 'error',
            title: `فشل تحميل ملف (${tag})`,
            message: `تعذر تحميل المورد: ${src || 'غير معروف'}`,
            url: src,
          });
        }
        return;
      }

      recordTelemetryError({
        source: 'runtime',
        severity: 'error',
        title: 'خطأ برمجي غير معالج (Runtime Error)',
        message: event.message || 'خطأ جافاسكريبت غير معروف',
        url: event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : undefined,
        stack: event.error?.stack,
      });
    },
    true
  );

  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    const message =
      reason instanceof Error
        ? reason.message
        : typeof reason === 'string'
        ? reason
        : JSON.stringify(reason || 'Unhandled Promise Rejection');

    recordTelemetryError({
      source: 'promise',
      severity: 'error',
      title: 'وعد برمجي مرفوض (Unhandled Rejection)',
      message,
      stack: reason instanceof Error ? reason.stack : undefined,
    });
  });

  const origConsoleError = console.error.bind(console);
  console.error = (...args: any[]) => {
    try {
      const text = args
        .map((a) => (a instanceof Error ? `${a.message}\n${a.stack || ''}` : typeof a === 'object' ? JSON.stringify(a) : String(a)))
        .join(' ')
        .slice(0, 1200);
      if (text && !text.includes('[TelemetryIgnore]')) {
        recordTelemetryError({
          source: 'console',
          severity: 'error',
          title: 'سجل خطأ في الكونسول (console.error)',
          message: text.split('\n')[0] || text,
          details: text,
        });
      }
    } catch {}
    origConsoleError(...args);
  };
}
