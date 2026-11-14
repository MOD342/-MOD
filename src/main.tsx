/// <reference types="vite/client" />
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { AuthProvider } from './contexts/AuthContext';
import { clientCache } from './utils/clientCache';
import { handleFrontendFallback, setFallbackActive } from './utils/frontendFallback';

const originalFetch = window.fetch.bind(window);

// الكشف الدقيق عما إذا كان التطبيق يعمل داخل حزمة APK / Capacitor / Cordova محلية بدون خادم ويب مستضيف
export function isRunningInAPKOrExternalShell(): boolean {
  if (typeof window === 'undefined') return false;
  const protocol = window.location.protocol;
  const host = window.location.hostname;

  if (
    protocol === 'file:' ||
    protocol === 'capacitor:' ||
    protocol === 'ionic:' ||
    protocol === 'content:' ||
    Boolean((window as any).Capacitor) ||
    Boolean((window as any).cordova) ||
    Boolean((window as any).AndroidInterface) ||
    Boolean((window as any).ReactNativeWebView)
  ) {
    return true;
  }

  // في Capacitor على أندرويد يُفتح التطبيق محلياً عبر https://localhost بدون منفذ خادم
  if (host === 'localhost' && !window.location.port) {
    return true;
  }

  return false;
}

// تنظيف أي حالة تعطل أو كاش قديم فور بدء التشغيل
try {
  clientCache.cleanLegacyCacheOnly();
  localStorage.removeItem('is_api_unreachable');
  setFallbackActive(false);
} catch {}

function isValidRemoteApiHost(rawUrl: string | null | undefined): boolean {
  if (!rawUrl) return false;
  const trimmed = rawUrl.trim();
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) return false;
  const lower = trimmed.toLowerCase();
  if (
    lower.includes('your-public-deployed') ||
    lower.includes('example.com') ||
    lower.includes('your-domain') ||
    lower.includes('ais-dev-')
  ) {
    return false;
  }
  return true;
}

function resolveApiBaseHost(): string {
  const isApk = isRunningInAPKOrExternalShell();
  try {
    const storedHost = localStorage.getItem('custom_api_host');
    if (isValidRemoteApiHost(storedHost)) {
      const clean = storedHost!.trim().replace(/\/+$/, '');
      if (isApk || (!clean.includes('.run.app') && !clean.includes('ais-pre-'))) {
        return clean;
      }
    }
  } catch {}

  if (isApk) {
    const envUrl = (import.meta.env.VITE_API_URL || '').trim();
    if (isValidRemoteApiHost(envUrl)) {
      return envUrl.replace(/\/+$/, '');
    }
  }

  return '';
}

function resolveAbsoluteUrl(input: any): any {
  if (typeof input === 'string' && input.startsWith('/api')) {
    const configuredHost = resolveApiBaseHost();
    if (configuredHost) {
      const cleanInput = input.startsWith('/') ? input : `/${input}`;
      return `${configuredHost}${cleanInput}`;
    }
  }
  return input;
}

// معترض الشبكة الذكي ثنائي المسار (Same-Origin / Configured API Server + Direct Client Engine)
async function smartFetch(input: any, init?: any): Promise<Response> {
  const urlString = typeof input === 'string' ? input : input && input.url ? input.url : '';

  if (urlString && urlString.includes('/api/')) {
    const isApkLocalShell = isRunningInAPKOrExternalShell();
    const configuredHost = resolveApiBaseHost();

    // داخل حزمة APK محلية بدون خادم مهيأ، استخدم محرك الجلب المباشر فوراً دون انتظار
    if (isApkLocalShell && !configuredHost && typeof input === 'string' && input.startsWith('/api/')) {
      const fbRes = await handleFrontendFallback(urlString, init);
      if (fbRes) return fbRes;
    }

    const resolvedInput = resolveAbsoluteUrl(input);
    const timeoutMs = 20000;

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        const fetchOptions = init ? { ...init } : {};
        if (
          fetchOptions.headers &&
          typeof fetchOptions.headers === 'object' &&
          !(fetchOptions.headers instanceof Headers)
        ) {
          const cleanHeaders: Record<string, string> = {};
          for (const [k, v] of Object.entries(fetchOptions.headers)) {
            const lowerK = k.toLowerCase();
            if (lowerK !== 'cache-control' && lowerK !== 'pragma') {
              cleanHeaders[k] = String(v);
            }
          }
          fetchOptions.headers = cleanHeaders;
        }
        if (!fetchOptions.signal) {
          fetchOptions.signal = controller.signal;
        }

        const res = await originalFetch(resolvedInput, fetchOptions);
        clearTimeout(timeoutId);

        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json') && res.status < 500) {
          return res;
        }
        if (res.ok && contentType.includes('application/json')) {
          return res;
        }
        break;
      } catch {
        if (attempt === 2) {
          break;
        }
      }
    }

    // في حال تعذر الوصول للخادم، يتولى محرك الجلب المباشر المهمة
    const fbRes = await handleFrontendFallback(urlString, init);
    if (fbRes) return fbRes;

    return originalFetch(resolvedInput, init);
  }

  return originalFetch(input, init);
}

try {
  Object.defineProperty(window, 'fetch', {
    value: smartFetch,
    writable: true,
    configurable: true,
    enumerable: true,
  });
} catch {
  try {
    (window as any).fetch = smartFetch;
  } catch {}
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
);
