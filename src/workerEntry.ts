import firebaseConfig from '../firebase-applet-config.json';
import {
  getPrivacyPolicyHtml,
  getTermsOfServiceHtml,
  getAccountDeletionHtml,
  getAboutAppHtml,
} from './api/helpers/legalPages';

import {
  EDGE_CORS_HEADERS,
  handleEdgeAnimeDetails,
  handleEdgeAnimeServers,
  handleEdgeResolveDownload,
  handleEdgeResolvePlay,
  handleEdgeDownloadStream,
  handleEdgePlayStream,
  handleEdgeStreamProxy,
  handleEdgeDirectDownloadGet,
  handleEdgeExtractPost,
} from './utils/edgeAnimeEngine';

export interface WorkerEnv {
  ASSETS: { fetch(input: Request | URL | string, init?: RequestInit): Promise<Response> };
  BACKEND_API_URL?: string;
  GEMINI_API_KEY?: string;
  PUBLIC_APP_URL?: string;
  FIREBASE_PROJECT_ID?: string;
  FIREBASE_DATABASE_ID?: string;
  EDGE_TOKEN_SECRET?: string;
}

type RoleLevel = 'owner' | 'admin' | 'moderator' | 'user';

interface ModPermissions {
  canBan: boolean;
  canNotify: boolean;
  canManageSettings: boolean;
  canViewRoles: boolean;
}

interface VerifiedEdgeAdminContext {
  uid: string;
  email: string;
  emailVerified: boolean;
  role: RoleLevel;
  permissions: ModPermissions;
  verifiedVia: 'cloudflare_edge_jwks';
}

const ADMIN_EMAILS = [
  '342.mod@gmail.com',
  '342.mog@gmail.com',
  'mod.mg.342@gmail.com',
];

const OWNER_UIDS = [
  'IYLv7bRb89W4rifLQFDAfYlf2fN2',
  'IoHKK83ujDVJrsVFFloWzNbtVKp2',
];

const ROLE_WEIGHT: Record<RoleLevel, number> = {
  user: 0,
  moderator: 1,
  admin: 2,
  owner: 3,
};

const isStaffEmail = (email?: string | null): boolean => {
  if (!email) return false;
  const clean = email.trim().toLowerCase();
  return ADMIN_EMAILS.some((e) => e.toLowerCase() === clean);
};

const CORS_HEADERS: Record<string, string> = {
  ...EDGE_CORS_HEADERS,
  'Access-Control-Allow-Methods': 'GET, HEAD, POST, PUT, DELETE, OPTIONS',
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

function decodeBase64UrlToBytes(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  const binary = atob(b64 + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function decodeJwtPart(segment: string): any {
  const bytes = decodeBase64UrlToBytes(segment);
  const jsonStr = new TextDecoder().decode(bytes);
  return JSON.parse(jsonStr);
}

let cachedGoogleJwks: { keys: any[]; expiresAt: number } | null = null;

async function fetchGoogleSecureTokenJwks(forceRefresh = false): Promise<any[]> {
  if (!forceRefresh && cachedGoogleJwks && cachedGoogleJwks.expiresAt > Date.now()) {
    return cachedGoogleJwks.keys;
  }
  const res = await fetch(
    'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'
  );
  if (!res.ok) {
    throw new Error(`Failed to fetch Google Firebase JWKS: HTTP ${res.status}`);
  }
  const json: any = await res.json();
  const keys = Array.isArray(json?.keys) ? json.keys : [];
  const cacheControl = res.headers.get('cache-control') || '';
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/i);
  const ttlMs = maxAgeMatch ? Math.max(60_000, Number(maxAgeMatch[1]) * 1000) : 3600_000;
  cachedGoogleJwks = { keys, expiresAt: Date.now() + ttlMs };
  return keys;
}

async function verifyEdgeFirebaseToken(
  idToken: string,
  env: WorkerEnv
): Promise<{ uid: string; email: string; emailVerified: boolean }> {
  const parts = idToken.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed Firebase ID token');
  }
  const [headerB64, payloadB64, signatureB64] = parts;
  const header = decodeJwtPart(headerB64);
  const payload = decodeJwtPart(payloadB64);

  if (header?.alg !== 'RS256' || !header?.kid) {
    throw new Error('Unsupported Firebase token algorithm or missing key ID');
  }

  let keys = await fetchGoogleSecureTokenJwks(false);
  let jwk = keys.find((k) => k?.kid === header.kid);
  if (!jwk) {
    keys = await fetchGoogleSecureTokenJwks(true);
    jwk = keys.find((k) => k?.kid === header.kid);
  }
  if (!jwk) {
    throw new Error('Matching Google public JWK not found for Firebase token');
  }

  const cryptoKey = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );

  const signedBytes = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signatureBytes = decodeBase64UrlToBytes(signatureB64);
  const isValid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    signatureBytes,
    signedBytes
  );
  if (!isValid) {
    throw new Error('Invalid Firebase ID token RSA signature');
  }

  const projectId = (env.FIREBASE_PROJECT_ID || firebaseConfig.projectId || '').trim();
  const nowSec = Math.floor(Date.now() / 1000);
  if (payload?.aud !== projectId) {
    throw new Error('Invalid Firebase token audience');
  }
  if (payload?.iss !== `https://securetoken.google.com/${projectId}`) {
    throw new Error('Invalid Firebase token issuer');
  }
  if (typeof payload?.sub !== 'string' || !payload.sub) {
    throw new Error('Missing Firebase token subject (uid)');
  }
  if (typeof payload?.exp !== 'number' || payload.exp <= nowSec) {
    throw new Error('Firebase ID token expired');
  }
  if (typeof payload?.iat !== 'number' || payload.iat > nowSec + 300) {
    throw new Error('Firebase ID token issued in the future');
  }

  return {
    uid: payload.sub,
    email: String(payload.email || '').trim().toLowerCase(),
    emailVerified: Boolean(payload.email_verified),
  };
}

async function fetchEdgeFirestoreDoc(
  collectionPath: string,
  docId: string,
  idToken: string,
  env: WorkerEnv
): Promise<Record<string, any> | null> {
  const projectId = (env.FIREBASE_PROJECT_ID || firebaseConfig.projectId || '').trim();
  const dbId = (env.FIREBASE_DATABASE_ID || firebaseConfig.firestoreDatabaseId || '(default)').trim();
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    projectId
  )}/databases/${encodeURIComponent(dbId)}/documents/${encodeURIComponent(
    collectionPath
  )}/${encodeURIComponent(docId)}`;

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${idToken}`,
        Accept: 'application/json',
      },
    });
    if (!res.ok) return null;
    const json: any = await res.json();
    if (!json?.fields) return null;

    const parsed: Record<string, any> = {};
    for (const [k, v] of Object.entries<any>(json.fields)) {
      if ('stringValue' in v) parsed[k] = v.stringValue;
      else if ('booleanValue' in v) parsed[k] = Boolean(v.booleanValue);
      else if ('integerValue' in v) parsed[k] = Number(v.integerValue);
      else if ('doubleValue' in v) parsed[k] = Number(v.doubleValue);
      else if ('timestampValue' in v) parsed[k] = v.timestampValue;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function resolveEdgeAdminContext(
  request: Request,
  env: WorkerEnv
): Promise<{ ctx?: VerifiedEdgeAdminContext; idToken?: string; errorResponse?: Response }> {
  const authHeader = request.headers.get('authorization') || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  const idToken = match ? match[1].trim() : '';

  if (!idToken) {
    return {
      errorResponse: jsonResponse(
        {
          success: false,
          code: 'MISSING_AUTH_TOKEN',
          message: 'مطلوب رمز مصادقة Firebase Admin صالح للوصول إلى وظائف الإدارة.',
        },
        401
      ),
    };
  }

  let decoded: { uid: string; email: string; emailVerified: boolean };
  try {
    decoded = await verifyEdgeFirebaseToken(idToken, env);
  } catch (err: any) {
    return {
      errorResponse: jsonResponse(
        {
          success: false,
          code: 'INVALID_AUTH_TOKEN',
          message: err?.message || 'فشل التحقق من جلسة المشرف. يرجى إعادة تسجيل الدخول.',
        },
        401
      ),
    };
  }

  const { uid, email, emailVerified } = decoded;

  if (isStaffEmail(email) && !emailVerified && !OWNER_UIDS.includes(uid)) {
    return {
      errorResponse: jsonResponse(
        {
          success: false,
          code: 'OWNER_EMAIL_UNVERIFIED',
          message: 'يرجى تأكيد ملكية البريد الإلكتروني (أو تسجيل الدخول عبر Google) لتفعيل صلاحيات المالك الدائم.',
        },
        403
      ),
    };
  }

  if (OWNER_UIDS.includes(uid) || (emailVerified && isStaffEmail(email))) {
    return {
      idToken,
      ctx: {
        uid,
        email,
        emailVerified,
        role: 'owner',
        permissions: {
          canBan: true,
          canNotify: true,
          canManageSettings: true,
          canViewRoles: true,
        },
        verifiedVia: 'cloudflare_edge_jwks',
      },
    };
  }

  const banDoc = await fetchEdgeFirestoreDoc('bannedUsers', uid, idToken, env);
  if (banDoc) {
    return {
      idToken,
      ctx: {
        uid,
        email,
        emailVerified,
        role: 'user',
        permissions: { canBan: false, canNotify: false, canManageSettings: false, canViewRoles: false },
        verifiedVia: 'cloudflare_edge_jwks',
      },
    };
  }

  const roleDoc = await fetchEdgeFirestoreDoc('globalRoles', uid, idToken, env);
  const rawRole = roleDoc?.role as string | undefined;
  const validRole: RoleLevel =
    rawRole === 'owner' || rawRole === 'admin' || rawRole === 'moderator' ? rawRole : 'user';

  let permissions: ModPermissions = {
    canBan: false,
    canNotify: false,
    canManageSettings: false,
    canViewRoles: false,
  };

  if (validRole === 'owner' || validRole === 'admin') {
    permissions = { canBan: true, canNotify: true, canManageSettings: true, canViewRoles: true };
  } else if (validRole === 'moderator') {
    const globalPermsDoc = await fetchEdgeFirestoreDoc('globalSettings', 'modPermissions', idToken, env);
    permissions = {
      canBan: Boolean(roleDoc?.canBan ?? globalPermsDoc?.canBan ?? false),
      canNotify: Boolean(roleDoc?.canNotify ?? globalPermsDoc?.canNotify ?? false),
      canManageSettings: Boolean(roleDoc?.canManageSettings ?? globalPermsDoc?.canManageSettings ?? false),
      canViewRoles: Boolean(roleDoc?.canViewRoles ?? globalPermsDoc?.canViewRoles ?? false),
    };
  }

  return {
    idToken,
    ctx: {
      uid,
      email,
      emailVerified,
      role: validRole,
      permissions,
      verifiedVia: 'cloudflare_edge_jwks',
    },
  };
}

function checkEdgeActionAuthorization(
  ctx: VerifiedEdgeAdminContext,
  action: string,
  payload?: Record<string, any>
): { allowed: boolean; reason?: string; requiredRole?: RoleLevel } {
  if (ctx.role === 'user') {
    return {
      allowed: false,
      reason: 'غير مصرح لك بالوصول إلى وظائف الإشراف والإدارة (Requires Staff Role).',
      requiredRole: 'moderator',
    };
  }
  if (ctx.role === 'owner') {
    return { allowed: true };
  }

  switch (action) {
    case 'access_dashboard':
    case 'delete_content':
    case 'edit_comment':
    case 'resolve_report':
    case 'manage_recommendations':
    case 'manage_suggestions':
    case 'restrict_member':
      return { allowed: ROLE_WEIGHT[ctx.role] >= ROLE_WEIGHT.moderator };

    case 'ban_user':
    case 'unban_user':
      return ctx.role === 'admin' || ctx.permissions.canBan
        ? { allowed: true }
        : {
            allowed: false,
            reason: 'صلاحية حظر وفك حظر الحسابات تتطلب رتبة مدير (Admin) أو تفويض حظر خاص.',
            requiredRole: 'admin',
          };

    case 'send_broadcast':
      return ctx.role === 'admin' || ctx.permissions.canNotify
        ? { allowed: true }
        : {
            allowed: false,
            reason: 'صلاحية إرسال الإشعارات العامة تتطلب رتبة مدير أو تفويض بث.',
            requiredRole: 'admin',
          };

    case 'manage_settings':
    case 'manage_cache_queue':
      return ctx.role === 'admin' || ctx.permissions.canManageSettings
        ? { allowed: true }
        : {
            allowed: false,
            reason: 'تعديل إعدادات المنصة والخوادم يتطلب رتبة مدير أو صلاحية إدارة الإعدادات.',
            requiredRole: 'admin',
          };

    case 'edit_member_stats':
    case 'manage_promos':
    case 'mass_grant':
      return ROLE_WEIGHT[ctx.role] >= ROLE_WEIGHT.admin
        ? { allowed: true }
        : {
            allowed: false,
            reason: 'تعديل أرصدة الأعضاء وإصدار الأكواد والمنح الجماعية مخصص للمديرين (Admin/Owner) فقط.',
            requiredRole: 'admin',
          };

    case 'assign_role':
    case 'manage_mod_permissions': {
      if (ROLE_WEIGHT[ctx.role] < ROLE_WEIGHT.admin) {
        return {
          allowed: false,
          reason: 'إدارة الرتب وصلاحيات المشرفين تتطلب رتبة مدير (Admin) أو المالك (Owner).',
          requiredRole: 'admin',
        };
      }
      if (payload?.targetRole === 'owner') {
        return {
          allowed: false,
          reason: 'تعيين رتبة المالك (Owner) حصري لمالك المنصة الأساسي فقط.',
          requiredRole: 'owner',
        };
      }
      return { allowed: true };
    }

    case 'reset_all_accounts':
    case 'factory_wipe':
      return {
        allowed: false,
        reason: 'العمليات التدميرية الشاملة (تصفير الحسابات أو التنظيف الشامل للإطلاق) حصرية لمالك المنصة (Owner) فقط.',
        requiredRole: 'owner',
      };

    default:
      return { allowed: ROLE_WEIGHT[ctx.role] >= ROLE_WEIGHT.moderator };
  }
}

async function handleEdgeAdminRoutes(
  request: Request,
  pathname: string,
  env: WorkerEnv
): Promise<Response | null> {
  const isAdminRoute =
    pathname.startsWith('/api/admin/') ||
    pathname === '/api/queue/status' ||
    pathname === '/api/queue/preload' ||
    pathname === '/api/cache/clear';
  if (!isAdminRoute) return null;

  const { ctx, idToken, errorResponse } = await resolveEdgeAdminContext(request, env);
  if (errorResponse || !ctx || !idToken) {
    return errorResponse!;
  }

  if (ROLE_WEIGHT[ctx.role] < ROLE_WEIGHT.moderator) {
    return jsonResponse(
      {
        success: false,
        code: 'INSUFFICIENT_ROLE',
        message: `غير مصرح: هذه العملية تتطلب رتبة (moderator) على الأقل، بينما رتبتك الحالية هي (${ctx.role}).`,
        currentRole: ctx.role,
        requiredRole: 'moderator',
      },
      403
    );
  }

  if (pathname === '/api/admin/verify-session' && request.method === 'GET') {
    return jsonResponse({
      success: true,
      verified: true,
      session: {
        uid: ctx.uid,
        email: ctx.email,
        emailVerified: ctx.emailVerified,
        role: ctx.role,
        permissions: ctx.permissions,
        verifiedVia: ctx.verifiedVia,
        verifiedAt: new Date().toISOString(),
      },
    });
  }

  if (pathname === '/api/admin/authorize-action' && request.method === 'POST') {
    const body: any = await request.json().catch(() => ({}));
    const { action, targetId, metadata } = body || {};

    if (!action || typeof action !== 'string') {
      return jsonResponse(
        {
          success: false,
          message: 'نوع العملية الإشرافية (action) مطلوب للتحقق الأمني.',
        },
        400
      );
    }

    const check = checkEdgeActionAuthorization(ctx, action, metadata || body);
    if (!check.allowed) {
      return jsonResponse(
        {
          success: false,
          authorized: false,
          code: 'PERMISSION_DENIED_BY_ADMIN_SDK',
          message: check.reason || 'رفض الخادم تنفيذ هذه العملية لعدم كفاية الصلاحيات.',
          role: ctx.role,
          requiredRole: check.requiredRole,
        },
        403
      );
    }

    if (
      targetId &&
      (action === 'ban_user' || action === 'restrict_member' || action === 'assign_role')
    ) {
      const targetStr = String(targetId).trim();
      const targetRoleRequested = metadata?.targetRole || body?.targetRole;
      const isDemotion = action === 'assign_role' && targetRoleRequested !== 'owner';
      if (action === 'ban_user' || action === 'restrict_member' || isDemotion) {
        let targetIsOwner = OWNER_UIDS.includes(targetStr);
        if (!targetIsOwner) {
          const [tRoleDoc, tUserDoc] = await Promise.all([
            fetchEdgeFirestoreDoc('globalRoles', targetStr, idToken, env),
            fetchEdgeFirestoreDoc('users', targetStr, idToken, env),
          ]);
          if (tRoleDoc?.role === 'owner' || isStaffEmail(tUserDoc?.email)) {
            targetIsOwner = true;
          }
        }
        if (targetIsOwner) {
          return jsonResponse(
            {
              success: false,
              authorized: false,
              code: 'PROTECTED_PERMANENT_OWNER',
              message: 'لا يمكن حظر أو تقييد أو تخفيض رتبة حساب مالك المنصة الدائم.',
            },
            403
          );
        }
      }
    }

    return jsonResponse({
      success: true,
      authorized: true,
      action,
      targetId: targetId || null,
      actor: {
        uid: ctx.uid,
        email: ctx.email,
        role: ctx.role,
      },
      verifiedAt: new Date().toISOString(),
    });
  }

  if (pathname === '/api/admin/system/overview' && request.method === 'GET') {
    return jsonResponse({
      success: true,
      adminAuth: ctx,
      cacheStats: { mode: 'cloudflare-edge-swr', keys: 0, hits: 0, misses: 0 },
      schedulerJobs: [],
    });
  }

  if (pathname === '/api/queue/status' && request.method === 'GET') {
    return jsonResponse({
      success: true,
      queueMode: 'cloudflare-edge',
      pendingJobs: 0,
      activeJobs: 0,
      completedJobs: 0,
    });
  }

  if (
    (pathname === '/api/queue/preload' || pathname === '/api/cache/clear') &&
    request.method === 'POST'
  ) {
    const check = checkEdgeActionAuthorization(ctx, 'manage_cache_queue');
    if (!check.allowed) {
      return jsonResponse({ success: false, message: check.reason }, 403);
    }
    return jsonResponse({
      success: true,
      message: 'تم تنفيذ إجراء التخزين المؤقت على حافة Cloudflare بنجاح.',
    });
  }

  return null;
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

async function handleEdgeAnimeRoutes(
  request: Request,
  url: URL,
  env: WorkerEnv
): Promise<Response | null> {
  const pathname = url.pathname;
  const method = request.method.toUpperCase();

  if (pathname.startsWith('/api/anime/details/') && method === 'GET') {
    const rawId = pathname.slice('/api/anime/details/'.length);
    return handleEdgeAnimeDetails(rawId);
  }
  if (pathname === '/api/anime/servers' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    return handleEdgeAnimeServers(body);
  }
  if (pathname === '/api/anime/resolve-download' && method === 'POST') {
    return handleEdgeResolveDownload(request, env);
  }
  if (pathname === '/api/anime/resolve-play' && method === 'POST') {
    return handleEdgeResolvePlay(request, env);
  }
  if (pathname === '/api/anime/extract' && method === 'POST') {
    return handleEdgeExtractPost(request);
  }
  if (pathname === '/api/anime/download-stream' && (method === 'GET' || method === 'HEAD')) {
    return handleEdgeDownloadStream(request, url, env);
  }
  if (pathname.startsWith('/api/anime/play-stream/') && (method === 'GET' || method === 'HEAD')) {
    const rest = pathname.slice('/api/anime/play-stream/'.length);
    const token = rest.split('/')[0] || '';
    return handleEdgePlayStream(request, token, env);
  }
  if (pathname === '/api/anime/stream-proxy' && (method === 'GET' || method === 'HEAD')) {
    return handleEdgeStreamProxy(request, url);
  }
  if (pathname === '/api/anime/download' && (method === 'GET' || method === 'HEAD')) {
    return handleEdgeDirectDownloadGet(request, url);
  }
  return null;
}

async function proxyToBackend(
  request: Request,
  url: URL,
  backendBaseUrl: string,
  env: WorkerEnv
): Promise<Response> {
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

  const edgeFallbackReq = request.method !== 'GET' && request.method !== 'HEAD' ? request.clone() : request;

  try {
    const reqClone = request.method !== 'GET' && request.method !== 'HEAD' ? request.clone() : request;
    const upstream = await fetch(targetUrl, {
      method: request.method,
      headers: fwdHeaders,
      body: request.method !== 'GET' && request.method !== 'HEAD' ? reqClone.body : undefined,
    });
    if (upstream.status >= 500 && url.pathname.startsWith('/api/admin/')) {
      const edgeAdminResp = await handleEdgeAdminRoutes(request, url.pathname, env);
      if (edgeAdminResp) return edgeAdminResp;
    }
    if (upstream.status >= 500 || upstream.headers.get('x-hybrid-fallback') === '1') {
      const edgeAnimeResp = await handleEdgeAnimeRoutes(edgeFallbackReq, url, env);
      if (edgeAnimeResp) return edgeAnimeResp;
    }
    const respHeaders = new Headers(upstream.headers);
    for (const [k, v] of Object.entries(CORS_HEADERS)) {
      respHeaders.set(k, v);
    }
    return new Response(upstream.body, {
      status: upstream.status,
      headers: respHeaders,
    });
  } catch {
    const edgeAdminResp = await handleEdgeAdminRoutes(request, url.pathname, env);
    if (edgeAdminResp) return edgeAdminResp;
    const edgeAnimeResp = await handleEdgeAnimeRoutes(edgeFallbackReq, url, env);
    if (edgeAnimeResp) return edgeAnimeResp;
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

      // Admin authentication & moderation action authorization run natively on Edge
      // even when BACKEND_API_URL is unset or cold-sleeping.
      if (
        pathname.startsWith('/api/admin/') ||
        pathname === '/api/queue/status' ||
        pathname === '/api/queue/preload' ||
        pathname === '/api/cache/clear'
      ) {
        const edgeAdminResp = await handleEdgeAdminRoutes(request, pathname, env);
        if (edgeAdminResp) return edgeAdminResp;
      }

      const backendUrl = (env.BACKEND_API_URL || '').trim().replace(/\/+$/, '');
      if (backendUrl) {
        return proxyToBackend(request, url, backendUrl, env);
      }

      if (pathname === '/api/ai/chat' && request.method === 'POST') {
        return handleEdgeAiChat(request, env);
      }

      if (pathname === '/api/manga/image-proxy' && request.method === 'GET') {
        return handleImageProxy(url);
      }

      const edgeAnimeResp = await handleEdgeAnimeRoutes(request, url, env);
      if (edgeAnimeResp) return edgeAnimeResp;

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
