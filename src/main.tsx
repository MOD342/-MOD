/// <reference types="vite/client" />
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { AuthProvider } from './contexts/AuthContext';
import { handleFrontendFallback, isFallbackActive, setFallbackActive } from './utils/frontendFallback';

const originalFetch = window.fetch.bind(window);

// الكشف الدقيق عما إذا كان التطبيق يعمل داخل حزمة APK / Capacitor / Cordova / WebView
export function isRunningInAPKOrExternalShell(): boolean {
  if (typeof window === 'undefined') return false;
  const protocol = window.location.protocol;
  const host = window.location.hostname;
  const ua = navigator.userAgent || '';

  if (
    protocol === 'file:' ||
    protocol === 'capacitor:' ||
    protocol === 'ionic:' ||
    protocol === 'content:' ||
    Boolean((window as any).Capacitor) ||
    Boolean((window as any).cordova) ||
    Boolean((window as any).AndroidInterface) ||
    Boolean((window as any).ReactNativeWebView) ||
    /; wv\)/i.test(ua)
  ) {
    return true;
  }

  // في Capacitor على أندرويد يكون النطاق غالباً https://localhost بدون منفذ 3000
  if (host === 'localhost' && window.location.port !== '3000') {
    return true;
  }

  // أي نطاق خارج حاوية Cloud Run / Localhost:3000 (مثل Vercel أو APK)
  if (!host.includes('run.app') && !(host === 'localhost' && window.location.port === '3000')) {
    return true;
  }

  return false;
}

// تصفير أي حالة تعطل قديمة عند فتح التطبيق لضمان الاتصال الفوري بالإنترنت
try {
  localStorage.removeItem('is_api_unreachable');
  setFallbackActive(false);
} catch {}

function resolveAbsoluteUrl(input: any): any {
  if (typeof input === 'string' && input.startsWith('/api')) {
    const isExternalOrAPK = isRunningInAPKOrExternalShell();

    if (isExternalOrAPK) {
      const defaultHost =
        import.meta.env.VITE_API_URL ||
        'https://ais-pre-n66z4zqpsskq4rqmdhuz4r-358090555339.europe-west2.run.app';
      let absoluteHost = defaultHost;
      try {
        const storedHost = localStorage.getItem('custom_api_host');
        if (storedHost && storedHost.trim() && storedHost.startsWith('http')) {
          absoluteHost = storedHost.trim();
        }
      } catch {}

      const cleanHost = absoluteHost.endsWith('/') ? absoluteHost.slice(0, -1) : absoluteHost;
      const cleanInput = input.startsWith('/') ? input : `/${input}`;
      return `${cleanHost}${cleanInput}`;
    }
  }
  return input;
}

// معترض الشبكة الذكي ثنائي المسار (Cloud Server + Live Direct Animedar/AniList Engine for APK & External Sites)
async function smartFetch(input: any, init?: any): Promise<Response> {
  const urlString = typeof input === 'string' ? input : input && input.url ? input.url : '';

  if (urlString && urlString.includes('/api/')) {
    const resolvedInput = resolveAbsoluteUrl(input);

    // منح الخادم السحابي مهلة كافية (12 ثانية) للاستيقاظ من وضع السكون وجلب بيانات انمي دار الحية المطابقة للمعاينة
    const timeoutMs = 12000;

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        const fetchOptions = init ? { ...init } : {};
        // إزالة الترويسات التي قد تسبب رفض CORS preflight في المتصفحات الصارمة
        if (fetchOptions.headers && typeof fetchOptions.headers === 'object' && !(fetchOptions.headers instanceof Headers)) {
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
        if (res.ok && contentType.includes('application/json')) {
          return res;
        }
        break;
      } catch (err) {
        if (attempt === 2) {
          break;
        }
      }
    }

    // في حال تعذر الوصول للخادم السحابي تماماً، يتولى محرك الجلب المباشر (Direct Animedar Proxy + AniList) المهمة فوراً!
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
