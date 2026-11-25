import {
  getPrivacyPolicyHtml,
  getTermsOfServiceHtml,
  getAccountDeletionHtml,
  getAboutAppHtml,
} from './api/helpers/legalPages';

export interface WorkerEnv {
  ASSETS: { fetch(input: Request | URL | string, init?: RequestInit): Promise<Response> };
  BACKEND_API_URL?: string;
  GEMINI_API_KEY?: string;
  PUBLIC_APP_URL?: string;
}

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Cache-Control, Pragma',
};

function jsonResponse(data: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...CORS_HEADERS,
      ...extraHeaders,
    },
  });
}

function htmlResponse(html: string, status = 200): Response {
  return new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
}

function isDisallowedPrivateHost(hostname: string): boolean {
  const h = hostname.trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (!h) return true;
  if (h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '0.0.0.0' || h.endsWith('.local') || h.endsWith('.internal')) {
    return true;
  }
  if (h.startsWith('10.') || h.startsWith('192.168.') || h.startsWith('169.254.') || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80:')) {
    return true;
  }
  const match172 = h.match(/^172\.(\d+)\./);
  if (match172) {
    const second = Number(match172[1]);
    if (second >= 16 && second <= 31) return true;
  }
  return false;
}

function parseSafeHttpUrl(rawUrl: string | null | undefined): URL | null {
  if (!rawUrl) return null;
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    if (isDisallowedPrivateHost(parsed.hostname)) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function handleEdgeAiChat(request: Request, env: WorkerEnv): Promise<Response> {
  const apiKey = (env.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    return jsonResponse(
      {
        success: false,
        aiMissingKey: true,
        message: 'مفتاح GEMINI_API_KEY غير مضاف بعد في إعدادات Cloudflare Workers.',
      },
      503
    );
  }

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ success: false, message: 'Invalid JSON request body.' }, 400);
  }

  const messages = Array.isArray(body?.messages) ? body.messages : [];
  if (messages.length === 0) {
    return jsonResponse({ success: false, message: 'Invalid messages array.' }, 400);
  }

  const cleanUserName = String(body?.userName || '').trim().slice(0, 60);
  const recentTurns = messages
    .slice(-12)
    .map((m: any) => ({
      role: m?.sender === 'user' ? 'user' : 'model',
      parts: [{ text: String(m?.text || '').slice(0, 1400).trim() }],
    }))
    .filter((m: any) => m.parts[0].text.length > 0);

  if (recentTurns.length === 0) {
    return jsonResponse({ success: false, message: 'Message text is required.' }, 400);
  }

  const systemText = [
    'أنت "مود" (MOD)، المساعد الصديق الشغوف بالأنمي والمانجا والمانهوا داخل تطبيق «أوتاكو MOD».',
    cleanUserName ? `اسم المستخدم المعروض: "${cleanUserName}".` : '',
    'أجب بالعربية بأسلوب ودود ومباشر ومفيد، واقترح أعمال أنمي أو مانجا مناسبة عند الطلب.',
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`;
    const gemRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemText }] },
        contents: recentTurns,
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 1024,
        },
      }),
    });

    const gemData: any = await gemRes.json().catch(() => null);
    if (!gemRes.ok) {
      return jsonResponse(
        {
          success: false,
          message: gemData?.error?.message || 'تعذر الحصول على رد من خدمة Gemini حالياً.',
        },
        gemRes.status >= 400 ? gemRes.status : 502
      );
    }

    const replyText =
      gemData?.candidates?.[0]?.content?.parts
        ?.map((p: any) => p?.text || '')
        .join('')
        .trim() || 'أهلاً بك! كيف أساعدك اليوم في عالم الأنمي والمانجا؟';

    return jsonResponse({
      success: true,
      engine: 'gemini-2.5-flash',
      text: replyText,
      animes: [],
    });
  } catch (err: any) {
    return jsonResponse(
      {
        success: false,
        message: err?.message || 'حدث خطأ أثناء الاتصال بخدمة الدردشة.',
      },
      502
    );
  }
}

async function handleImageProxy(requestUrl: URL): Promise<Response> {
  const rawTarget = requestUrl.searchParams.get('url');
  const parsedTarget = parseSafeHttpUrl(rawTarget);
  if (!parsedTarget) {
    return jsonResponse({ success: false, message: 'Invalid or blocked image URL.' }, 400);
  }

  try {
    const upstream = await fetch(parsedTarget.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126.0.0.0 Mobile Safari/537.36',
        Referer: `${parsedTarget.origin}/`,
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      },
    });
    if (!upstream.ok) {
      return new Response(null, { status: upstream.status, headers: CORS_HEADERS });
    }
    const headers = new Headers(CORS_HEADERS);
    const contentType = upstream.headers.get('content-type');
    if (contentType) headers.set('Content-Type', contentType);
    headers.set('Cache-Control', 'public, max-age=86400');
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch {
    return jsonResponse({ success: false, message: 'Image proxy fetch failed.' }, 502);
  }
}

async function proxyToBackend(request: Request, url: URL, backendBaseUrl: string): Promise<Response> {
  const safeBackend = parseSafeHttpUrl(backendBaseUrl);
  if (!safeBackend) {
    return jsonResponse({ success: false, message: 'Invalid BACKEND_API_URL configuration.' }, 500);
  }

  const targetUrl = `${safeBackend.origin}${url.pathname}${url.search}`;
  const fwdHeaders = new Headers();
  for (const key of ['accept', 'content-type', 'authorization', 'range', 'user-agent']) {
    const val = request.headers.get(key);
    if (val) fwdHeaders.set(key, val);
  }

  try {
    const upstream = await fetch(targetUrl, {
      method: request.method,
      headers: fwdHeaders,
      body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
    });
    const respHeaders = new Headers(upstream.headers);
    for (const [k, v] of Object.entries(CORS_HEADERS)) {
      respHeaders.set(k, v);
    }
    return new Response(upstream.body, {
      status: upstream.status,
      headers: respHeaders,
    });
  } catch {
    return jsonResponse(
      { success: false, hybridFallback: true, message: 'Backend unreachable, engaging hybrid mode.' },
      200,
      { 'X-Hybrid-Fallback': '1' }
    );
  }
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // 1. CORS Preflight for API
    if (request.method === 'OPTIONS' && pathname.startsWith('/api')) {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // 2. Legal & Store Compliance HTML Pages
    if (pathname === '/privacy-policy' || pathname === '/privacy') {
      return htmlResponse(getPrivacyPolicyHtml());
    }
    if (pathname === '/terms' || pathname === '/terms-of-use') {
      return htmlResponse(getTermsOfServiceHtml());
    }
    if (pathname === '/account-deletion') {
      return htmlResponse(getAccountDeletionHtml());
    }
    if (pathname === '/about') {
      return htmlResponse(getAboutAppHtml());
    }

    // 3. API Routes on Cloudflare Workers Edge
    if (pathname.startsWith('/api')) {
      if (pathname === '/api/system/health' || pathname === '/api/health') {
        return jsonResponse({
          ok: true,
          status: 'healthy',
          runtime: 'cloudflare-workers',
          publicUrl: env.PUBLIC_APP_URL || url.origin || 'https://mod.z-mod342.workers.dev',
          hasBackendProxy: Boolean((env.BACKEND_API_URL || '').trim()),
          timestamp: new Date().toISOString(),
        });
      }

      const backendUrl = (env.BACKEND_API_URL || '').trim().replace(/\/+$/, '');
      if (backendUrl) {
        return proxyToBackend(request, url, backendUrl);
      }

      if (pathname === '/api/ai/chat' && request.method === 'POST') {
        return handleEdgeAiChat(request, env);
      }

      if (pathname === '/api/manga/image-proxy' && request.method === 'GET') {
        return handleImageProxy(url);
      }

      // Signal client hybrid engine cleanly (zero red error telemetry)
      return jsonResponse(
        {
          success: false,
          hybridFallback: true,
          runtime: 'cloudflare-workers',
        },
        200,
        { 'X-Hybrid-Fallback': '1' }
      );
    }

    // 4. Static SPA Assets fallback
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response('Not Found', { status: 404 });
  },
};
