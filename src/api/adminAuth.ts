import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import type { App } from 'firebase-admin/app';
import firebaseConfig from '../../firebase-applet-config.json';
import { serverCache } from '../services/cacheService';
import { schedulerService } from '../services/schedulerService';

const RESOLVED_FIREBASE_PROJECT_ID = (
  process.env.FIREBASE_PROJECT_ID ||
  process.env.VITE_FIREBASE_PROJECT_ID ||
  firebaseConfig.projectId ||
  ''
).trim();

const RESOLVED_FIREBASE_DATABASE_ID = (
  process.env.FIREBASE_DATABASE_ID ||
  process.env.VITE_FIREBASE_DATABASE_ID ||
  firebaseConfig.firestoreDatabaseId ||
  ''
).trim();

export type RoleLevel = 'owner' | 'admin' | 'moderator' | 'user';

export interface ModPermissions {
  canBan: boolean;
  canNotify: boolean;
  canManageSettings: boolean;
  canViewRoles: boolean;
}

export interface VerifiedAdminContext {
  uid: string;
  email: string;
  emailVerified: boolean;
  role: RoleLevel;
  permissions: ModPermissions;
  verifiedVia: 'firebase_admin_sdk' | 'firebase_token_cert';
}

declare global {
  namespace Express {
    interface Request {
      adminAuth?: VerifiedAdminContext;
    }
  }
}

export const ADMIN_EMAILS = [
  '342.mod@gmail.com',
  '342.mog@gmail.com',
  'mod.mg.342@gmail.com'
];

export const OWNER_UIDS = [
  'IYLv7bRb89W4rifLQFDAfYlf2fN2',
  'IoHKK83ujDVJrsVFFloWzNbtVKp2'
];

export const isStaffEmail = (email?: string | null): boolean => {
  if (!email) return false;
  const clean = email.trim().toLowerCase();
  return ADMIN_EMAILS.some(adminEmail => adminEmail.toLowerCase() === clean);
};

// Initialize Firebase Admin SDK singleton lazily so cold starts & Node 20 runtimes never fail on load
let adminApp: App | null = null;

export async function getFirebaseAdminApp(): Promise<App> {
  if (!adminApp) {
    const { initializeApp, getApps, cert } = await import('firebase-admin/app');
    const existingApps = getApps();
    if (existingApps.length > 0 && existingApps[0]) {
      adminApp = existingApps[0];
    } else {
      let credential: any = undefined;
      const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
      if (rawServiceAccount) {
        try {
          credential = cert(JSON.parse(rawServiceAccount));
        } catch (e: any) {
          console.warn('[FirebaseAdmin] Invalid FIREBASE_SERVICE_ACCOUNT JSON:', e?.message);
        }
      } else if (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
        credential = cert({
          projectId: RESOLVED_FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        });
      }

      adminApp = initializeApp({
        projectId: RESOLVED_FIREBASE_PROJECT_ID,
        ...(credential ? { credential } : {}),
      });
    }
  }
  return adminApp;
}

export async function getAdminDb() {
  const app = await getFirebaseAdminApp();
  const { getFirestore: getAdminFirestore } = await import('firebase-admin/firestore');
  try {
    if (RESOLVED_FIREBASE_DATABASE_ID && RESOLVED_FIREBASE_DATABASE_ID !== '(default)') {
      return getAdminFirestore(app, RESOLVED_FIREBASE_DATABASE_ID);
    }
    return getAdminFirestore(app);
  } catch {
    return getAdminFirestore(app);
  }
}

// Cached Google x509 public certs for zero-dependency Firebase ID Token verification
let cachedGoogleCerts: { certs: Record<string, string>; expiresAt: number } | null = null;

async function fetchGoogleSecureTokenCerts(forceRefresh = false): Promise<Record<string, string>> {
  if (!forceRefresh && cachedGoogleCerts && cachedGoogleCerts.expiresAt > Date.now()) {
    return cachedGoogleCerts.certs;
  }
  const res = await fetch(
    'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com',
    { signal: AbortSignal.timeout(5000) }
  );
  if (!res.ok) {
    throw new Error(`Failed to fetch Google Firebase public certs: HTTP ${res.status}`);
  }
  const certs = (await res.json()) as Record<string, string>;
  const cacheControl = res.headers.get('cache-control') || '';
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/i);
  const ttlMs = maxAgeMatch ? Math.max(60_000, Number(maxAgeMatch[1]) * 1000) : 3600_000;
  cachedGoogleCerts = { certs, expiresAt: Date.now() + ttlMs };
  return certs;
}

function decodeJwtPart(segment: string): any {
  const json = Buffer.from(segment, 'base64url').toString('utf8');
  return JSON.parse(json);
}

async function verifyFirebaseIdTokenWithCerts(idToken: string): Promise<{
  uid: string;
  email?: string;
  email_verified?: boolean;
}> {
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

  let certs = await fetchGoogleSecureTokenCerts(false);
  let certPem = certs[header.kid];
  if (!certPem) {
    certs = await fetchGoogleSecureTokenCerts(true);
    certPem = certs[header.kid];
  }
  if (!certPem) {
    throw new Error('Matching Google public certificate not found for Firebase token');
  }

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${headerB64}.${payloadB64}`);
  verifier.end();
  const isSignatureValid = verifier.verify(certPem, Buffer.from(signatureB64, 'base64url'));
  if (!isSignatureValid) {
    throw new Error('Invalid Firebase ID token RSA signature');
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const projectId = RESOLVED_FIREBASE_PROJECT_ID;
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
    email: payload.email,
    email_verified: payload.email_verified,
  };
}

async function verifyFirebaseIdToken(idToken: string): Promise<{
  uid: string;
  email?: string;
  email_verified?: boolean;
  verifiedVia: 'firebase_admin_sdk' | 'firebase_token_cert';
}> {
  try {
    const [app, { getAuth: getAdminAuth }] = await Promise.all([
      getFirebaseAdminApp(),
      import('firebase-admin/auth'),
    ]);
    const decoded = await getAdminAuth(app).verifyIdToken(idToken);
    return {
      uid: decoded.uid,
      email: decoded.email,
      email_verified: decoded.email_verified,
      verifiedVia: 'firebase_admin_sdk',
    };
  } catch (err: any) {
    const code = String(err?.code || '');
    // Fallback cleanly to Node crypto x509 cert verification if Admin SDK cannot verify in this environment
    if (!code.startsWith('auth/') || code === 'auth/internal-error' || code === 'ERR_REQUIRE_ESM') {
      const verified = await verifyFirebaseIdTokenWithCerts(idToken);
      return { ...verified, verifiedVia: 'firebase_token_cert' };
    }
    throw err;
  }
}

// Short-lived cache (30 seconds) for verified role lookups to protect Firestore quota on burst actions
const roleVerificationCache = new Map<
  string,
  { context: VerifiedAdminContext; expiresAt: number }
>();

export function invalidateRoleCache(uid?: string) {
  if (uid) {
    roleVerificationCache.delete(uid);
  } else {
    roleVerificationCache.clear();
  }
}

/**
 * Fetches a document from Firestore using either Firebase Admin SDK (if service account / ADC is available)
 * or Firestore REST API authenticated with the user's verified Firebase ID token.
 */
async function fetchFirestoreDocServerSide(
  collectionPath: string,
  docId: string,
  idToken: string
): Promise<Record<string, any> | null> {
  // 1. Try Firebase Admin SDK Firestore first if credentials exist in environment
  if (
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    process.env.FIREBASE_SERVICE_ACCOUNT ||
    (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY)
  ) {
    try {
      const db = await getAdminDb();
      const snap = await db.collection(collectionPath).doc(docId).get();
      if (snap.exists) {
        return snap.data() || null;
      }
      return null;
    } catch {
      // Fallback to authenticated Firestore REST API below
    }
  }

  // 2. Authenticated Firestore REST API using the verified ID token
  const projectId = RESOLVED_FIREBASE_PROJECT_ID;
  const dbId = RESOLVED_FIREBASE_DATABASE_ID || '(default)';
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
      signal: AbortSignal.timeout(4500),
    });

    if (!res.ok) {
      return null;
    }

    const json = await res.json();
    if (!json || !json.fields) return null;

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

/**
 * Verifies a Firebase ID Token cryptographically using Firebase Admin SDK (`admin.auth().verifyIdToken`),
 * and resolves the user's authoritative server-side RoleLevel and ModPermissions.
 */
export async function verifyUserAdminContext(
  idToken: string,
  forceRefresh = false
): Promise<VerifiedAdminContext> {
  const decoded = await verifyFirebaseIdToken(idToken);

  const uid = decoded.uid;
  const email = (decoded.email || '').trim().toLowerCase();
  const emailVerified = Boolean(decoded.email_verified);
  const verifiedVia = decoded.verifiedVia;

  if (!forceRefresh) {
    const cached = roleVerificationCache.get(uid);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.context;
    }
  }

  if (isStaffEmail(email) && !emailVerified && !OWNER_UIDS.includes(uid)) {
    throw Object.assign(
      new Error('يرجى تأكيد ملكية البريد الإلكتروني (أو تسجيل الدخول عبر Google) لتفعيل صلاحيات المالك الدائم.'),
      { statusCode: 403, code: 'OWNER_EMAIL_UNVERIFIED' }
    );
  }

  // Check if user is a primary owner by verified email or UID
  if (OWNER_UIDS.includes(uid) || (emailVerified && isStaffEmail(email))) {
    const ownerContext: VerifiedAdminContext = {
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
      verifiedVia,
    };
    roleVerificationCache.set(uid, {
      context: ownerContext,
      expiresAt: Date.now() + 30_000,
    });
    return ownerContext;
  }

  // Check if user is banned on the server
  const banDoc = await fetchFirestoreDocServerSide('bannedUsers', uid, idToken);
  if (banDoc) {
    const bannedContext: VerifiedAdminContext = {
      uid,
      email,
      emailVerified,
      role: 'user',
      permissions: {
        canBan: false,
        canNotify: false,
        canManageSettings: false,
        canViewRoles: false,
      },
      verifiedVia,
    };
    return bannedContext;
  }

  // Look up authoritative role in globalRoles/{uid}
  const roleDoc = await fetchFirestoreDocServerSide('globalRoles', uid, idToken);
  const rawRole = roleDoc?.role as string | undefined;
  const validRole: RoleLevel =
    rawRole === 'owner' || rawRole === 'admin' || rawRole === 'moderator'
      ? rawRole
      : 'user';

  let permissions: ModPermissions = {
    canBan: false,
    canNotify: false,
    canManageSettings: false,
    canViewRoles: false,
  };

  if (validRole === 'owner' || validRole === 'admin') {
    permissions = {
      canBan: true,
      canNotify: true,
      canManageSettings: true,
      canViewRoles: true,
    };
  } else if (validRole === 'moderator') {
    // Merge global default moderator permissions with per-moderator custom overrides
    const globalPermsDoc = await fetchFirestoreDocServerSide(
      'globalSettings',
      'modPermissions',
      idToken
    );
    permissions = {
      canBan: Boolean(roleDoc?.canBan ?? globalPermsDoc?.canBan ?? false),
      canNotify: Boolean(roleDoc?.canNotify ?? globalPermsDoc?.canNotify ?? false),
      canManageSettings: Boolean(
        roleDoc?.canManageSettings ?? globalPermsDoc?.canManageSettings ?? false
      ),
      canViewRoles: Boolean(
        roleDoc?.canViewRoles ?? globalPermsDoc?.canViewRoles ?? false
      ),
    };
  }

  const context: VerifiedAdminContext = {
    uid,
    email,
    emailVerified,
    role: validRole,
    permissions,
    verifiedVia,
  };

  roleVerificationCache.set(uid, {
    context,
    expiresAt: Date.now() + 30_000,
  });

  return context;
}

const ROLE_WEIGHT: Record<RoleLevel, number> = {
  user: 0,
  moderator: 1,
  admin: 2,
  owner: 3,
};

export type SensitiveModerationAction =
  | 'access_dashboard'
  | 'delete_content'
  | 'edit_comment'
  | 'resolve_report'
  | 'manage_recommendations'
  | 'manage_suggestions'
  | 'edit_member_stats'
  | 'restrict_member'
  | 'ban_user'
  | 'unban_user'
  | 'assign_role'
  | 'manage_mod_permissions'
  | 'manage_promos'
  | 'mass_grant'
  | 'send_broadcast'
  | 'manage_settings'
  | 'manage_cache_queue'
  | 'reset_all_accounts'
  | 'factory_wipe';

export function checkActionAuthorization(
  ctx: VerifiedAdminContext,
  action: SensitiveModerationAction,
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
      if (ctx.role === 'admin' || ctx.permissions.canBan) {
        return { allowed: true };
      }
      return {
        allowed: false,
        reason: 'صلاحية حظر وفك حظر الحسابات تتطلب رتبة مدير (Admin) أو تفويض حظر خاص.',
        requiredRole: 'admin',
      };

    case 'send_broadcast':
      if (ctx.role === 'admin' || ctx.permissions.canNotify) {
        return { allowed: true };
      }
      return {
        allowed: false,
        reason: 'صلاحية إرسال الإشعارات العامة تتطلب رتبة مدير أو تفويض بث.',
        requiredRole: 'admin',
      };

    case 'manage_settings':
    case 'manage_cache_queue':
      if (ctx.role === 'admin' || ctx.permissions.canManageSettings) {
        return { allowed: true };
      }
      return {
        allowed: false,
        reason: 'تعديل إعدادات المنصة والخوادم يتطلب رتبة مدير أو صلاحية إدارة الإعدادات.',
        requiredRole: 'admin',
      };

    case 'edit_member_stats':
    case 'manage_promos':
    case 'mass_grant':
      if (ROLE_WEIGHT[ctx.role] >= ROLE_WEIGHT.admin) {
        return { allowed: true };
      }
      return {
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
      // Prevent non-owners from assigning or modifying 'owner' role
      const targetRole = payload?.targetRole as RoleLevel | undefined;
      if (targetRole === 'owner') {
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

/**
 * Express Middleware: Enforces Firebase Admin SDK token verification and role/permission check.
 */
export function requireServerAdminAuth(
  minimumRole: RoleLevel = 'moderator',
  requiredAction?: SensitiveModerationAction
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authHeader = req.headers.authorization || '';
      const match = authHeader.match(/^Bearer\s+(.+)$/i);
      const idToken = match ? match[1].trim() : '';

      if (!idToken) {
        return res.status(401).json({
          success: false,
          code: 'MISSING_AUTH_TOKEN',
          message: 'مطلوب رمز مصادقة Firebase Admin صالح للوصول إلى وظائف الإدارة.',
        });
      }

      const adminContext = await verifyUserAdminContext(idToken);

      if (ROLE_WEIGHT[adminContext.role] < ROLE_WEIGHT[minimumRole]) {
        return res.status(403).json({
          success: false,
          code: 'INSUFFICIENT_ROLE',
          message: `غير مصرح: هذه العملية تتطلب رتبة (${minimumRole}) على الأقل، بينما رتبتك الحالية هي (${adminContext.role}).`,
          currentRole: adminContext.role,
          requiredRole: minimumRole,
        });
      }

      if (requiredAction) {
        const authCheck = checkActionAuthorization(adminContext, requiredAction, req.body);
        if (!authCheck.allowed) {
          return res.status(403).json({
            success: false,
            code: 'ACTION_FORBIDDEN',
            message: authCheck.reason || 'غير مصرح لك بتنفيذ هذا الإجراء الحساس.',
            currentRole: adminContext.role,
            requiredRole: authCheck.requiredRole,
          });
        }
      }

      req.adminAuth = adminContext;
      next();
    } catch (error: any) {
      console.warn('[FirebaseAdminGuard] Token verification failed:', error?.message || error);
      const status = error?.statusCode === 403 ? 403 : 401;
      return res.status(status).json({
        success: false,
        code: error?.code || 'INVALID_AUTH_TOKEN',
        message: error?.message || 'فشل التحقق من جلسة المشرف عبر Firebase Admin SDK. يرجى إعادة تسجيل الدخول.',
      });
    }
  };
}

const router = Router();

/**
 * GET /api/admin/verify-session
 * Verifies the caller's Firebase ID token via Firebase Admin SDK and returns their authoritative role & permissions.
 */
router.get(
  '/verify-session',
  requireServerAdminAuth('moderator', 'access_dashboard'),
  async (req: Request, res: Response) => {
    const ctx = req.adminAuth!;
    res.json({
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
);

/**
 * POST /api/admin/authorize-action
 * Server-side permission gate called before executing any sensitive moderation function.
 * Validates the user's Firebase ID Token via Firebase Admin SDK and checks action-specific RBAC & ABAC rules.
 */
router.post(
  '/authorize-action',
  requireServerAdminAuth('moderator'),
  async (req: Request, res: Response) => {
    const ctx = req.adminAuth!;
    const { action, targetId, metadata } = req.body || {};

    if (!action || typeof action !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'نوع العملية الإشرافية (action) مطلوب للتحقق الأمني.',
      });
    }

    const check = checkActionAuthorization(
      ctx,
      action as SensitiveModerationAction,
      metadata || req.body
    );

    if (!check.allowed) {
      return res.status(403).json({
        success: false,
        authorized: false,
        code: 'PERMISSION_DENIED_BY_ADMIN_SDK',
        message: check.reason || 'رفض الخادم تنفيذ هذه العملية لعدم كفاية الصلاحيات.',
        role: ctx.role,
        requiredRole: check.requiredRole,
      });
    }

    // Protect permanent owners from being banned, restricted, or demoted
    if (
      targetId &&
      (action === 'ban_user' || action === 'restrict_member' || action === 'assign_role')
    ) {
      const targetStr = String(targetId).trim();
      const targetRoleRequested = metadata?.targetRole || req.body?.targetRole;
      const isDemotion = action === 'assign_role' && targetRoleRequested !== 'owner';
      if (action === 'ban_user' || action === 'restrict_member' || isDemotion) {
        let targetIsOwner = OWNER_UIDS.includes(targetStr);
        if (!targetIsOwner) {
          const authHeader = req.headers.authorization || '';
          const tok = authHeader.replace(/^Bearer\s+/i, '').trim();
          const [tRoleDoc, tUserDoc] = await Promise.all([
            fetchFirestoreDocServerSide('globalRoles', targetStr, tok),
            fetchFirestoreDocServerSide('users', targetStr, tok),
          ]);
          if (tRoleDoc?.role === 'owner' || isStaffEmail(tUserDoc?.email)) {
            targetIsOwner = true;
          }
        }
        if (targetIsOwner) {
          return res.status(403).json({
            success: false,
            authorized: false,
            code: 'PROTECTED_PERMANENT_OWNER',
            message: 'لا يمكن حظر أو تقييد أو تخفيض رتبة حساب مالك المنصة الدائم.',
          });
        }
      }
    }

    // If role changes occurred, invalidate role cache for targetId
    if (
      (action === 'assign_role' || action === 'manage_mod_permissions' || action === 'ban_user') &&
      targetId
    ) {
      invalidateRoleCache(String(targetId));
    }

    return res.json({
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
);

/**
 * Admin-protected Server Cache & System Endpoints
 */
router.get(
  '/system/overview',
  requireServerAdminAuth('moderator', 'access_dashboard'),
  async (req: Request, res: Response) => {
    const cacheStats = serverCache.getStats();
    const jobs = schedulerService.getJobsStatus();
    res.json({
      success: true,
      adminAuth: req.adminAuth,
      cacheStats,
      schedulerJobs: jobs,
    });
  }
);

export default router;
