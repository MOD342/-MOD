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

// معترض الشبكة الذكي ثنائي المسار (Cloud Server + Live Direct AniList/Jikan Engine for APK)
async function smartFetch(input: any, init?: any): Promise<Response> {
  const urlString = typeof input === 'string' ? input : input && input.url ? input.url : '';

  if (urlString && urlString.includes('/api/')) {
    const isExternalOrAPK = isRunningInAPKOrExternalShell();
    const resolvedInput = resolveAbsoluteUrl(input);

    // مهلة سريعة (4.5 ثانية في APK) حتى لا يتجمد التطبيق أو يصبح ثقيلاً إذا كان الخادم السحابي في وضع السكون
    const timeoutMs = isExternalOrAPK ? 4500 : 10000;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const fetchOptions = init ? { ...init } : {};
      if (!fetchOptions.signal) {
        fetchOptions.signal = controller.signal;
      }

      const res = await originalFetch(resolvedInput, fetchOptions);
      clearTimeout(timeoutId);

      // التحقق من أن الاستجابة فعلاً JSON وليست صفحة HTML أو خطأ بوابة
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        return res;
      }

      // إذا أعاد السيرفر خطأ أو صفحة HTML غير متوقعة في الـ APK، ننتقل فوراً للجسر المباشر الحي
      const fbRes = await handleFrontendFallback(urlString, init);
      if (fbRes) return fbRes;

      return res;
    } catch (err) {
      // في حال تعذر الوصول للخادم السحابي من داخل الـ APK، يتولى محرك الجلب المباشر (Direct AniList/Jikan + Google Translate) المهمة فوراً عبر إنترنت الهاتف!
      const fbRes = await handleFrontendFallback(urlString, init);
      if (fbRes) return fbRes;

      return originalFetch(resolvedInput, init);
    }
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
