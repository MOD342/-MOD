/// <reference types="vite/client" />
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { GlobalErrorBoundary } from './components/GlobalErrorBoundary';
import { clientCache } from './utils/clientCache';
import { initGlobalErrorTelemetry, recordTelemetryError } from './utils/errorTelemetry';
import {
  isEphemeralCloudHost,
  isRunningInAPKOrExternalShell,
  resolveApiBaseHost,
  resolveApiUrl,
} from './utils/apiUrl';
import { installExternalNavigationBridge } from './utils/externalNavigation';
import { initViewportAndCutoutTracking } from './utils/viewportMetrics';

export { isRunningInAPKOrExternalShell };

const originalFetch = window.fetch.bind(window);
export const rawNativeFetch = originalFetch;

try {
  initGlobalErrorTelemetry();
  installExternalNavigationBridge();
  initViewportAndCutoutTracking();
} catch {}

// تنظيف أي حالة تعطل أو روابط معاينة سحابية مؤقتة من التخزين المحلي عند بدء التطبيق
try {
  clientCache.cleanLegacyCacheOnly();
  localStorage.removeItem('is_api_unreachable');
  const storedCustomHost = localStorage.getItem('custom_api_host');
  if (storedCustomHost && isEphemeralCloudHost(storedCustomHost)) {
    localStorage.removeItem('custom_api_host');
  }
} catch {}

function extractApiRelativePath(urlString: string): string {
  if (!urlString) return '';
  if (urlString.startsWith('/api')) return urlString;
  const idx = urlString.indexOf('/api/');
  return idx !== -1 ? urlString.slice(idx) : urlString;
}

function resolveFetchInput(input: RequestInfo | URL): RequestInfo | URL {
  if (typeof input === 'string') {
    return resolveApiUrl(input);
  }
  if (input instanceof URL) {
    const asString = input.toString();
    if (asString.startsWith('/api')) {
      return resolveApiUrl(asString);
    }
    return input;
  }
  if (typeof Request !== 'undefined' && input instanceof Request) {
    const rawUrl = input.url || '';
    // إذا كان Request يشير إلى الأصل المحلي (/api/...) نقوم بتحويله لرابط الخادم الخارجي الثابت
    if (typeof window !== 'undefined' && rawUrl.startsWith(`${window.location.origin}/api`)) {
      const relativeApi = rawUrl.slice(window.location.origin.length);
      const targetUrl = resolveApiUrl(relativeApi);
      if (targetUrl !== relativeApi) {
        return new Request(targetUrl, input);
      }
    }
  }
  return input;
}

function isEmptyApiJsonPayload(apiRelativePath: string, parsedJson: any): boolean {
  if (!parsedJson || typeof parsedJson !== 'object') return true;
  if (parsedJson.success === false) return true;
  if (apiRelativePath.startsWith('/api/dashboard')) {
    const d = parsedJson.data;
    if (!d || typeof d !== 'object') return true;
    const hasTop = Array.isArray(d.top5) && d.top5.length > 0;
    const hasRecent = Array.isArray(d.recentEpisodes) && d.recentEpisodes.length > 0;
    const hasPopular = Array.isArray(d.popular) && d.popular.length > 0;
    const hasSeason = Array.isArray(d.currentSeason) && d.currentSeason.length > 0;
    return !(hasTop && (hasRecent || hasPopular || hasSeason));
  }
  if (
    apiRelativePath.startsWith('/api/anime/recent') ||
    apiRelativePath.startsWith('/api/anime/season') ||
    apiRelativePath.startsWith('/api/anime/movies') ||
    apiRelativePath.startsWith('/api/anime/top') ||
    apiRelativePath.startsWith('/api/anime/servers')
  ) {
    return !Array.isArray(parsedJson.data) || parsedJson.data.length === 0;
  }
  return false;
}

// معترض الشبكة الهجين لتطبيق الـ APK: يوجه طلبات /api إلى VITE_API_URL أو المضيف الثابت مع CapacitorHttp وطبقة بديلة تلقائية
async function smartFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const urlString =
    typeof input === 'string'
      ? input
      : input instanceof URL
      ? input.toString()
      : input && typeof (input as Request).url === 'string'
      ? (input as Request).url
      : '';

  if (urlString && urlString.includes('/api/')) {
    const isNativeApk = Capacitor.isNativePlatform();
    const isApkLocalShell = isRunningInAPKOrExternalShell();
    const configuredHost = resolveApiBaseHost();
    const apiRelativePath = extractApiRelativePath(urlString);

    const rawPathname = apiRelativePath.split('?')[0];
    const isAiChatEndpoint = rawPathname === '/api/ai/chat';
    const isStreamingOrBinaryEndpoint =
      rawPathname === '/api/anime/download-stream' ||
      rawPathname === '/api/anime/stream-proxy' ||
      rawPathname === '/api/anime/download' ||
      rawPathname.startsWith('/api/anime/play-stream/') ||
      rawPathname === '/api/manga/image-proxy';

    if (isStreamingOrBinaryEndpoint) {
      return originalFetch(resolveFetchInput(input), init);
    }

    const isNonFallbackResolveEndpoint =
      rawPathname === '/api/anime/resolve-download' ||
      rawPathname === '/api/anime/resolve-play' ||
      rawPathname === '/api/anime/extract';

    // داخل حزمة APK بدون خادم خلفي ثابت مهيأ، استخدم المحرك المباشر فوراً (ما عدا الدردشة الحية وتجهيز الروابط المباشرة)
    if (
      isApkLocalShell &&
      !configuredHost &&
      apiRelativePath.startsWith('/api/') &&
      !isAiChatEndpoint &&
      !isNonFallbackResolveEndpoint
    ) {
      const { handleFrontendFallback } = await import('./utils/frontendFallback');
      const fbRes = await handleFrontendFallback(apiRelativePath, init);
      if (fbRes) return fbRes;
    }

    const resolvedInput = resolveFetchInput(input);
    const resolvedUrlLabel =
      typeof resolvedInput === 'string'
        ? resolvedInput
        : resolvedInput instanceof URL
        ? resolvedInput.toString()
        : (resolvedInput as Request).url || urlString;

    const isServersEndpoint = rawPathname === '/api/anime/servers';
    const isMangaEndpoint = rawPathname.startsWith('/api/manga/');
    const isLongCatalogEndpoint =
      isMangaEndpoint || rawPathname.startsWith('/api/anime/details/');
    const timeoutMs = isNonFallbackResolveEndpoint
      ? 46000
      : isMangaEndpoint
      ? 34000
      : isAiChatEndpoint
      ? 24000
      : isLongCatalogEndpoint
      ? 28000
      : isServersEndpoint
      ? 26000
      : 11000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const fetchOptions: RequestInit = init ? { ...init } : {};
      if (
        fetchOptions.headers &&
        typeof fetchOptions.headers === 'object' &&
        !(fetchOptions.headers instanceof Headers) &&
        !Array.isArray(fetchOptions.headers)
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
      if (!fetchOptions.credentials) {
        fetchOptions.credentials = 'same-origin';
      }

      const maxAttempts = isMangaEndpoint ? 3 : 1;
      let res: Response | null = null;
      let contentType = '';
      let lastFetchErr: any = null;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          res = await originalFetch(resolvedInput, fetchOptions);
          contentType = res.headers.get('content-type') || '';
          const shouldRetry =
            isMangaEndpoint &&
            attempt < maxAttempts - 1 &&
            (res.status >= 500 || res.status === 429 || !contentType.includes('application/json'));
          if (!shouldRetry) {
            lastFetchErr = null;
            break;
          }
        } catch (fetchErr: any) {
          lastFetchErr = fetchErr;
          if (!isMangaEndpoint || attempt >= maxAttempts - 1 || controller.signal.aborted) {
            throw fetchErr;
          }
        }
        await new Promise((r) => setTimeout(r, attempt === 0 ? 900 : 2000));
      }

      if (lastFetchErr || !res) {
        throw lastFetchErr || new Error('Network request failed');
      }

      if (res.headers.get('x-hybrid-fallback') === '1') {
        const { handleFrontendFallback } = await import('./utils/frontendFallback');
        const fbRes = await handleFrontendFallback(apiRelativePath, init);
        return fbRes || res;
      }

      if (
        (isAiChatEndpoint || isNonFallbackResolveEndpoint || rawPathname === '/api/manga/pages') &&
        contentType.includes('application/json')
      ) {
        return res;
      }

      if (contentType.includes('application/json') && res.status >= 200 && res.status < 300) {
        try {
          const cloned = res.clone();
          const parsed = await cloned.json();
          if (parsed && parsed.hybridFallback === true) {
            const { handleFrontendFallback } = await import('./utils/frontendFallback');
            const fbRes = await handleFrontendFallback(apiRelativePath, init);
            return fbRes || res;
          }
          if (!isEmptyApiJsonPayload(apiRelativePath, parsed)) {
            return res;
          }
        } catch {
          return res;
        }
      } else if (contentType.includes('text/html') || res.status >= 400) {
        recordTelemetryError({
          source: 'network',
          severity: res.status >= 500 ? 'error' : 'warning',
          title: `استجابة خادم غير مكتملة (${res.status})`,
          message: `المسار ${apiRelativePath} أرجع رمز ${res.status} — تم التحويل للمحرك البديل.`,
          url: resolvedUrlLabel,
          statusCode: res.status,
        });
      }
    } catch (err: any) {
      // في تطبيق الـ APK عند تعذر fetch بسبب CORS/شبكة، نجرب CapacitorHttp الأصلي لخادم Cloudflare / الخادم الخلفي أولاً
      if (isNativeApk && resolvedUrlLabel.startsWith('http')) {
        try {
          const method = (init?.method || 'GET').toUpperCase();
          let parsedBody: any = undefined;
          if (init?.body && typeof init.body === 'string') {
            try {
              parsedBody = JSON.parse(init.body);
            } catch {
              parsedBody = init.body;
            }
          }
          const capRes = await CapacitorHttp.request({
            url: resolvedUrlLabel,
            method,
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            data: parsedBody,
            connectTimeout: isAiChatEndpoint ? 20000 : 9000,
            readTimeout: isAiChatEndpoint ? 20000 : 9000,
          });
          if (capRes && capRes.data) {
            const payload = typeof capRes.data === 'string' ? JSON.parse(capRes.data) : capRes.data;
            if (isAiChatEndpoint) {
              return new Response(JSON.stringify(payload), {
                status: capRes.status || 200,
                headers: { 'Content-Type': 'application/json; charset=utf-8' },
              });
            }
            if (capRes.status >= 200 && capRes.status < 300 && !isEmptyApiJsonPayload(apiRelativePath, payload)) {
              return new Response(JSON.stringify(payload), {
                status: capRes.status,
                headers: { 'Content-Type': 'application/json; charset=utf-8' },
              });
            }
          }
        } catch {}
      }

      recordTelemetryError({
        source: 'network',
        severity: 'error',
        title: 'تعذر الاتصال بالخادم الخلفي (Network / CORS / Timeout)',
        message: err?.message || `فشل جلب ${apiRelativePath}`,
        url: resolvedUrlLabel,
        stack: err?.stack,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (isAiChatEndpoint) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'تعذر الاتصال بخادم الدردشة الآن. تأكد من الاتصال وأعد المحاولة.',
        }),
        {
          status: 503,
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
        },
      );
    }

    // في حال تعذر الوصول للخادم الثابت أو عادت بيانات فارغة، يتولى محرك الجلب المباشر المهمة دون تعطل الواجهة
    const { handleFrontendFallback } = await import('./utils/frontendFallback');
    const fbRes = await handleFrontendFallback(apiRelativePath, init);
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
  <GlobalErrorBoundary>
    <ThemeProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ThemeProvider>
  </GlobalErrorBoundary>,
);
