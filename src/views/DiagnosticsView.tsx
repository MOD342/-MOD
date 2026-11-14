import React, { useState, useEffect, useMemo } from 'react';
import {
  Activity,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Copy,
  RefreshCw,
  ArrowLeft,
  Settings,
  Terminal,
  Search,
  Globe,
  Layers,
  Clock,
  Trash2,
  Play,
  Sparkles,
  Bug,
  ShieldCheck,
  Cpu,
  Download,
  Server,
} from 'lucide-react';
import { db, auth } from '../firebase';
import { collection, getDocs, limit, query } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { isStaffEmail } from '../services/moderationService';
import { clientCache } from '../utils/clientCache';
import { rawNativeFetch, isRunningInAPKOrExternalShell } from '../main';
import {
  TelemetryEvent,
  TelemetrySource,
  DiagnosticsTabKey,
  subscribeTelemetry,
  clearTelemetryEvents,
  getTelemetryEvents,
  detectDeploymentEnvironment,
  recordTelemetryError,
} from '../utils/errorTelemetry';

interface TestResult {
  id: string;
  name: string;
  category: 'system' | 'routing' | 'api' | 'scraping' | 'fallback' | 'firebase' | 'ai' | 'storage' | 'telemetry';
  status: 'idle' | 'running' | 'success' | 'failed' | 'warning';
  latency?: number;
  details?: string;
  desc: string;
}

interface AiAnomalyItem {
  title: string;
  severity: string;
  affectedArea: string;
  rootCause: string;
  fixSteps: string[];
}

interface AiDiagnosticReport {
  overallStatus: 'healthy' | 'degraded' | 'critical' | string;
  healthScore: number;
  summary: string;
  vercelDiagnosis: string;
  priorityAction: string;
  anomalies: AiAnomalyItem[];
  recommendedActions: string[];
  engineLabel: string;
  generatedAt: string;
}

const INITIAL_TESTS: TestResult[] = [
  {
    id: 'env',
    name: 'بيئة الاستضافة واكتشاف Vercel / APK',
    category: 'system',
    status: 'idle',
    desc: 'فحص النطاق الحالي، البروتوكول، إعدادات الخادم المخصص، ومتغيرات البيئة.',
  },
  {
    id: 'vercel_trap',
    name: 'سلامة مسارات الـ API (فحص فخ HTML في Vercel)',
    category: 'routing',
    status: 'idle',
    desc: 'اتصال خام مباشر بالخادم للتحقق من إرجاع JSON حقيقي وعدم استبداله بصفحة HTML.',
  },
  {
    id: 'dashboard_recent',
    name: 'فحص الرئيسية وأحدث الحلقات وتطابقها',
    category: 'api',
    status: 'idle',
    desc: 'مقارنة مخرجات /api/dashboard مع /api/anime/recent للتحقق من تطابق الحلقات الحية.',
  },
  {
    id: 'scraping_servers',
    name: 'كشط تفاصيل الأنمي وسيرفرات المشاهدة والتحميل',
    category: 'scraping',
    status: 'idle',
    desc: 'اختبار حقيقي لمساري التفاصيل والسيرفرات لأحدث حلقة من المصدر.',
  },
  {
    id: 'fallback_engine',
    name: 'محرك الجلب البديل (AniList + Jikan + CORS Proxy)',
    category: 'fallback',
    status: 'idle',
    desc: 'التحقق من جاهزية المصادر البديلة عند غياب الخادم في Vercel Static أو APK.',
  },
  {
    id: 'firebase_rules',
    name: 'قاعدة بيانات Firebase Auth و Firestore Rules',
    category: 'firebase',
    status: 'idle',
    desc: 'اختبار قراءة فعلي لـ Firestore ورصد أخطاء الصلاحيات أو الدومين غير المصرح به.',
  },
  {
    id: 'ai_engine',
    name: 'جاهزية خادم الذكاء الاصطناعي (Gemini AI)',
    category: 'ai',
    status: 'idle',
    desc: 'التحقق من توفر GEMINI_API_KEY ونموذج التحليل على الخادم المنشور.',
  },
  {
    id: 'cache_cron',
    name: 'حالة الكاش السحابي والمجدول (node-cache / node-cron)',
    category: 'system',
    status: 'idle',
    desc: 'قياس أداء كاش الخادم والتحقق من قيود Serverless في Vercel.',
  },
  {
    id: 'client_storage',
    name: 'التخزين المحلي والمتصفح (Storage / IndexedDB)',
    category: 'storage',
    status: 'idle',
    desc: 'فحص سلامة localStorage و sessionStorage و IndexedDB والاتصال بالشبكة.',
  },
  {
    id: 'telemetry_audit',
    name: 'جرد الأخطاء والشذوذات المسجلة في الجلسة',
    category: 'telemetry',
    status: 'idle',
    desc: 'حصر كل أخطاء JS والـ Network و Firestore التي تم توجيهها تلقائياً.',
  },
];

export default function DiagnosticsView({
  onBack,
  initialTab,
}: {
  onBack: () => void;
  initialTab?: DiagnosticsTabKey;
}) {
  const { user, userRole } = useAuth();
  const [activeTab, setActiveTab] = useState<DiagnosticsTabKey>(initialTab || 'tests');
  const [customHost, setCustomHost] = useState<string>('');
  const [savedHost, setSavedHost] = useState<string>('');
  const [customRoute, setCustomRoute] = useState<string>('/api/dashboard');
  const [routeTesting, setRouteTesting] = useState(false);
  const [routeResult, setRouteResult] = useState<any>(null);
  const [testing, setTesting] = useState(false);
  const [copiedLog, setCopiedLog] = useState(false);
  const [cacheStats, setCacheStats] = useState<any>(null);
  const [cacheClearing, setCacheClearing] = useState(false);
  const [schedulerJobs, setSchedulerJobs] = useState<any[]>([]);
  const [triggeringJob, setTriggeringJob] = useState<string | null>(null);
  const [schedulerActionFeedback, setSchedulerActionFeedback] = useState<string | null>(null);

  const [telemetryEvents, setTelemetryEvents] = useState<TelemetryEvent[]>([]);
  const [errorFilter, setErrorFilter] = useState<'all' | TelemetrySource>('all');
  const [tests, setTests] = useState<TestResult[]>(INITIAL_TESTS);

  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [aiReport, setAiReport] = useState<AiDiagnosticReport | null>(null);
  const [aiErrorMsg, setAiErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    return subscribeTelemetry(setTelemetryEvents);
  }, []);

  const envInfo = useMemo(() => detectDeploymentEnvironment(), []);

  const rawEnvHost = (import.meta.env.VITE_API_URL || '').trim();
  const validEnvHost =
    rawEnvHost.startsWith('http') &&
    !rawEnvHost.includes('your-public-deployed') &&
    !rawEnvHost.includes('example.com') &&
    !rawEnvHost.includes('ais-dev-')
      ? rawEnvHost.replace(/\/+$/, '')
      : '';

  const isWebOrigin =
    typeof window !== 'undefined' &&
    window.location.protocol.startsWith('http') &&
    !(window.location.hostname === 'localhost' && !window.location.port);

  const defaultApiHost =
    (isWebOrigin ? window.location.origin : '') || validEnvHost || '';

  const resolveRawTargetUrl = (apiPath: string): string => {
    const cleanPath = apiPath.startsWith('/') ? apiPath : `/${apiPath}`;
    const stored = (localStorage.getItem('custom_api_host') || '').trim().replace(/\/+$/, '');
    const isApk = isRunningInAPKOrExternalShell();
    const usableStored =
      stored &&
      stored.startsWith('http') &&
      !stored.includes('ais-dev-') &&
      !stored.includes('your-public-deployed') &&
      !stored.includes('example.com') &&
      (isApk || (!stored.includes('.run.app') && !stored.includes('ais-pre-')))
        ? stored
        : '';
    if (usableStored) return `${usableStored}${cleanPath}`;
    if (isApk && validEnvHost) return `${validEnvHost}${cleanPath}`;
    return cleanPath;
  };

  useEffect(() => {
    const rawStored = localStorage.getItem('custom_api_host') || '';
    const isLegacyHost =
      rawStored.includes('ais-dev-') ||
      rawStored.includes('your-public-deployed') ||
      rawStored.includes('example.com') ||
      (!envInfo.isApkShell && (rawStored.includes('ais-pre-') || rawStored.includes('.run.app')));
    if (isLegacyHost) {
      localStorage.removeItem('custom_api_host');
    }
    const stored = (!isLegacyHost && rawStored) || defaultApiHost;
    setCustomHost(stored);
    setSavedHost(stored);
    void runAllTests();
  }, [defaultApiHost]);

  const updateTestStatus = (id: string, updates: Partial<TestResult>) => {
    setTests((prev) => prev.map((t) => (t.id === id ? { ...t, ...updates } : t)));
  };

  const saveCustomHostHandler = () => {
    const trimmed = customHost.trim().replace(/\/+$/, '');
    if (!trimmed || trimmed === defaultApiHost) {
      localStorage.removeItem('custom_api_host');
      setSavedHost(defaultApiHost);
    } else {
      localStorage.setItem('custom_api_host', trimmed);
      setSavedHost(trimmed);
    }
    void runAllTests();
  };

  const resetHostHandler = () => {
    localStorage.removeItem('custom_api_host');
    setCustomHost(defaultApiHost);
    setSavedHost(defaultApiHost);
    void runAllTests();
  };

  const getAuthHeaders = async (): Promise<Record<string, string>> => {
    try {
      if (auth.currentUser) {
        const token = await auth.currentUser.getIdToken();
        if (token) {
          return { Authorization: `Bearer ${token}` };
        }
      }
    } catch {}
    return {};
  };

  const safeRawFetchJson = async (apiPath: string, init?: RequestInit, timeoutMs = 12000) => {
    const targetUrl = resolveRawTargetUrl(apiPath);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const t0 = Date.now();
    try {
      const res = await rawNativeFetch(targetUrl, {
        ...(init || {}),
        cache: 'no-store',
        signal: controller.signal,
      });
      const latency = Date.now() - t0;
      const contentType = res.headers.get('content-type') || '';
      const text = await res.text();
      let json: any = null;
      let isJson = false;
      try {
        json = JSON.parse(text);
        isJson = true;
      } catch {}
      return {
        ok: res.ok,
        status: res.status,
        latency,
        contentType,
        isHtml: contentType.includes('text/html') || text.trim().toLowerCase().startsWith('<!doctype'),
        isJson,
        json,
        rawSnippet: text.slice(0, 300),
        targetUrl,
        error: null as string | null,
      };
    } catch (err: any) {
      return {
        ok: false,
        status: 0,
        latency: Date.now() - t0,
        contentType: '',
        isHtml: false,
        isJson: false,
        json: null,
        rawSnippet: '',
        targetUrl,
        error: err?.message || String(err),
      };
    } finally {
      clearTimeout(timer);
    }
  };

  const runAllTests = async (): Promise<TestResult[]> => {
    if (testing) return tests;
    setTesting(true);
    const snapshotMap = new Map<string, TestResult>();
    const setAndTrack = (id: string, updates: Partial<TestResult>) => {
      updateTestStatus(id, updates);
      const base = INITIAL_TESTS.find((t) => t.id === id)!;
      snapshotMap.set(id, { ...base, ...(snapshotMap.get(id) || {}), ...updates });
    };

    setTests(
      INITIAL_TESTS.map((t) => ({
        ...t,
        status: 'running',
        details: undefined,
        latency: undefined,
      }))
    );

    // 1. Environment Check
    const envFlags: string[] = [];
    if (envInfo.platform === 'vercel') {
      envFlags.push('⚠️ تعمل الآن على Vercel: تأكد من نشر مسارات الخادم كـ Serverless Functions أو ضبط خادم API خارجي يدعم CORS.');
    }
    if (envInfo.viteApiUrlRaw.includes('your-public-deployed')) {
      envFlags.push('ℹ️ تم رصد متغير VITE_API_URL بوصف افتراضي وتم تحييده تلقائياً على الويب.');
    }
    setAndTrack('env', {
      status: envInfo.online ? (envInfo.platform === 'vercel' ? 'warning' : 'success') : 'failed',
      latency: 1,
      details: JSON.stringify(
        {
          platform: envInfo.platformLabelAr,
          origin: envInfo.origin,
          hostname: envInfo.hostname,
          https: envInfo.isHttps,
          online: envInfo.online,
          customApiHost: envInfo.configuredCustomHost || 'افتراضي (نفس النطاق)',
          notes: envFlags,
        },
        null,
        2
      ),
    });

    // 2. Raw API & Vercel SPA HTML Trap Check
    const probeGenres = await safeRawFetchJson('/api/anime/genres', undefined, 8000);
    if (probeGenres.error) {
      setAndTrack('vercel_trap', {
        status: 'failed',
        latency: probeGenres.latency,
        details: `فشل الاتصال الخام بالمسار: ${probeGenres.targetUrl}\nالخطأ: ${probeGenres.error}\nالسبب المرجح: تعذر الوصول للخادم أو حظر CORS.`,
      });
    } else if (probeGenres.isHtml) {
      setAndTrack('vercel_trap', {
        status: 'failed',
        latency: probeGenres.latency,
        details:
          `🚨 شذوذ Vercel / Static SPA مكتشف!\n` +
          `المسار ${probeGenres.targetUrl} أرجع HTTP ${probeGenres.status} بنوع (${probeGenres.contentType}) كصفحة HTML بدلاً من JSON.\n` +
          `هذا يعني أن الخادم الخلفي (server.ts / API) غير مشغّل على هذه الاستضافة، وأن الاستضافة تعيد توجيه طلبات /api/* إلى index.html.`,
      });
    } else if (probeGenres.ok && probeGenres.isJson) {
      setAndTrack('vercel_trap', {
        status: 'success',
        latency: probeGenres.latency,
        details: `HTTP ${probeGenres.status} JSON سليم\nالرابط الفعلي: ${probeGenres.targetUrl}\nزمن الاستجابة الخام: ${probeGenres.latency}ms`,
      });
    } else {
      setAndTrack('vercel_trap', {
        status: 'failed',
        latency: probeGenres.latency,
        details: `HTTP ${probeGenres.status} (${probeGenres.contentType})\nمقتطف: ${probeGenres.rawSnippet}`,
      });
    }

    // 3. Dashboard vs Recent Consistency Probe
    let topRecentEpisode: { id: string; ep: string; title: string; link: string } | null = null;
    const [dashRes, recentRes] = await Promise.all([
      safeRawFetchJson('/api/dashboard?day=saturday&season=auto&sliderMode=best_season', undefined, 14000),
      safeRawFetchJson('/api/anime/recent?page=1', undefined, 14000),
    ]);

    if (dashRes.error || recentRes.error || dashRes.isHtml || recentRes.isHtml) {
      setAndTrack('dashboard_recent', {
        status: 'failed',
        latency: Math.max(dashRes.latency, recentRes.latency),
        details:
          `فشل جلب بيانات الخادم المباشر:\n` +
          `• /api/dashboard => HTTP ${dashRes.status} ${dashRes.isHtml ? '(أرجع HTML بدل JSON)' : dashRes.error || ''}\n` +
          `• /api/anime/recent => HTTP ${recentRes.status} ${recentRes.isHtml ? '(أرجع HTML بدل JSON)' : recentRes.error || ''}`,
      });
    } else {
      const dashData = dashRes.json?.data || {};
      const dashRecent = Array.isArray(dashData.recentEpisodes) ? dashData.recentEpisodes : [];
      const recentList = Array.isArray(recentRes.json?.data) ? recentRes.json.data : [];

      const topDash = dashRecent[0]?.animeId?.title || dashRecent[0]?.title || '';
      const topRecent = recentList[0]?.title || '';
      const titlesMatch = Boolean(topDash && topRecent && topDash.toLowerCase() === topRecent.toLowerCase());

      if (recentList[0]) {
        topRecentEpisode = {
          id: recentList[0].animeId || 'unknown',
          ep: String(recentList[0].episodeNumber || recentList[0].episode || '1'),
          title: recentList[0].title || '',
          link: recentList[0].link || '',
        };
      }

      const missingParts: string[] = [];
      if (!dashData.top5?.length) missingParts.push('top5 فارغ');
      if (!dashRecent.length) missingParts.push('أحدث الحلقات في الرئيسية فارغة');
      if (!recentList.length) missingParts.push('/api/anime/recent فارغ');
      if (topDash && topRecent && !titlesMatch) {
        missingParts.push(`عدم تطابق أول حلقة: الرئيسية (${topDash}) ≠ صفحة الحلقات (${topRecent})`);
      }

      setAndTrack('dashboard_recent', {
        status: missingParts.length === 0 ? 'success' : 'warning',
        latency: Math.max(dashRes.latency, recentRes.latency),
        details:
          `• /api/dashboard (${dashRes.latency}ms): top5=${dashData.top5?.length || 0} | recent=${dashRecent.length} | popular=${dashData.popular?.length || 0} | season=${dashData.currentSeason?.length || 0} | schedule=${dashData.schedule?.length || 0}\n` +
          `• /api/anime/recent (${recentRes.latency}ms): count=${recentList.length}\n` +
          `• الحلقة #1 في الرئيسية: ${topDash || 'لا يوجد'}\n` +
          `• الحلقة #1 في صفحة الحلقات: ${topRecent || 'لا يوجد'}\n` +
          (missingParts.length ? `⚠️ ملاحظات: ${missingParts.join(' | ')}` : '✅ تطابق تام في البيانات الحية'),
      });
    }

    // 4. Anime Details & Video Servers Scraping Probe
    if (!topRecentEpisode || !topRecentEpisode.id) {
      setAndTrack('scraping_servers', {
        status: probeGenres.isHtml ? 'failed' : 'warning',
        latency: 0,
        details: 'تعذر اختبار استخراج التفاصيل والسيرفرات لعدم توفر حلقة حية من مسار /api/anime/recent.',
      });
    } else {
      const detRes = await safeRawFetchJson(`/api/anime/details/${encodeURIComponent(topRecentEpisode.id)}`, undefined, 12000);
      const srvRes = await safeRawFetchJson(
        '/api/anime/servers',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: topRecentEpisode.link,
            animeId: topRecentEpisode.id,
            episodeNum: topRecentEpisode.ep,
            animeTitle: topRecentEpisode.title,
          }),
        },
        15000
      );

      const serversArr = Array.isArray(srvRes.json?.data) ? srvRes.json.data : [];
      const watchCount = serversArr.filter((s: any) => s.category !== 'download').length;
      const downloadCount = serversArr.filter((s: any) => s.category === 'download').length;

      const okScrape = detRes.ok && srvRes.ok && serversArr.length > 0;
      setAndTrack('scraping_servers', {
        status: okScrape ? 'success' : srvRes.isHtml ? 'failed' : 'warning',
        latency: detRes.latency + srvRes.latency,
        details:
          `الأنمي المختبر: ${topRecentEpisode.title} (الحلقة ${topRecentEpisode.ep})\n` +
          `• تفاصيل الأنمي: HTTP ${detRes.status} (${detRes.latency}ms) — حلقات: ${detRes.json?.data?.episodes?.length || 0}\n` +
          `• سيرفرات الحلقة: HTTP ${srvRes.status} (${srvRes.latency}ms) — مشاهدة: ${watchCount} | تحميل: ${downloadCount}`,
      });
    }

    // 5. Fallback Direct Engine Probe (AniList + CORS)
    try {
      const t0 = Date.now();
      const gqlRes = await rawNativeFetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          query: 'query { Page(page: 1, perPage: 1) { media(type: ANIME) { id title { english } } } }',
        }),
      });
      const latency = Date.now() - t0;
      setAndTrack('fallback_engine', {
        status: gqlRes.ok ? 'success' : 'warning',
        latency,
        details: `AniList GraphQL المباشر: HTTP ${gqlRes.status} (${latency}ms)\nيعمل كطبقة بديلة من متصفح العميل في حال تعطل الخادم الخلفي.`,
      });
    } catch (e: any) {
      setAndTrack('fallback_engine', {
        status: 'failed',
        latency: 0,
        details: `فشل الاتصال المباشر بـ AniList من المتصفح: ${e?.message || e}`,
      });
    }

    // 6. Real Firebase Firestore & Auth Probe (Honest, no fake shortcuts)
    try {
      const t0 = Date.now();
      const snap = await getDocs(query(collection(db, 'globalNotifications'), limit(1)));
      const latency = Date.now() - t0;
      let userRuleNote = 'المستخدم غير مسجل الدخول حالياً (تم فحص القراءة العامة فقط).';
      let ruleWarning = false;

      if (auth.currentUser) {
        try {
          await getDocs(query(collection(db, 'users', auth.currentUser.uid, 'animeEntries'), limit(1)));
          userRuleNote = `قراءة مجموعة المستخدم الخاصة ناجحة (UID: ${auth.currentUser.uid}).`;
        } catch (ruleErr: any) {
          ruleWarning = true;
          userRuleNote = `⚠️ خطأ صلاحيات في مجموعة المستخدم: ${ruleErr?.code || ruleErr?.message}`;
        }
      }

      setAndTrack('firebase_rules', {
        status: ruleWarning ? 'warning' : 'success',
        latency,
        details:
          `Project ID: ${db?.app?.options?.projectId}\n` +
          `Auth UID: ${auth.currentUser?.uid || user?.id || 'زائر'}\n` +
          `قراءة globalNotifications: ناجحة (${snap.docs.length} سجل في ${latency}ms)\n` +
          `${userRuleNote}\n` +
          (envInfo.platform === 'vercel'
            ? `💡 تذكير Vercel: تأكد من إضافة النطاق "${envInfo.hostname}" ضمن Authorized Domains في Firebase Authentication حتى يعمل تسجيل دخول Google.`
            : ''),
      });
    } catch (e: any) {
      recordTelemetryError({
        source: 'firestore',
        severity: 'error',
        title: 'فشل فحص Firestore في التشخيص',
        message: e?.message || String(e),
      });
      setAndTrack('firebase_rules', {
        status: 'failed',
        latency: 0,
        details: `فشل الاتصال أو الصلاحيات في Firestore:\nالكود: ${e?.code || 'unknown'}\nالرسالة: ${e?.message || String(e)}`,
      });
    }

    // 7. Server-Side Gemini AI Readiness Probe
    const aiHealth = await safeRawFetchJson('/api/ai/diagnostics/health', undefined, 8000);
    if (aiHealth.ok && aiHealth.isJson && aiHealth.json?.data) {
      const configured = Boolean(aiHealth.json.data.aiConfigured);
      setAndTrack('ai_engine', {
        status: configured ? 'success' : 'warning',
        latency: aiHealth.latency,
        details:
          `محرك التحليل: ${aiHealth.json.data.model}\n` +
          `توفر GEMINI_API_KEY على الخادم: ${configured ? 'نعم (مفعل)' : 'لا — مفقود في متغيرات البيئة!'}\n` +
          `بيئة التشغيل الخلفية: ${aiHealth.json.data.runtime} (${aiHealth.json.data.nodeVersion})`,
      });
    } else {
      setAndTrack('ai_engine', {
        status: 'failed',
        latency: aiHealth.latency,
        details:
          `تعذر الوصول لنقطة فحص الذكاء الاصطناعي /api/ai/diagnostics/health:\n` +
          `HTTP ${aiHealth.status} ${aiHealth.isHtml ? '(أرجع HTML بدل JSON)' : aiHealth.error || aiHealth.rawSnippet}`,
      });
    }

    // 8. Cache & Scheduler Probe (Public read-only health + authenticated admin verification when staff)
    const healthRes = await safeRawFetchJson('/api/system/health', undefined, 8000);
    const isStaffUser = Boolean(
      auth.currentUser &&
        (isStaffEmail(auth.currentUser.email) ||
          ['owner', 'admin', 'moderator'].includes(userRole || ''))
    );

    if (healthRes.ok && healthRes.isJson && healthRes.json?.data) {
      const hData = healthRes.json.data;
      setCacheStats(hData.cache || null);
      setSchedulerJobs(hData.scheduler?.jobs || []);
    }

    let adminAuthNote = '';
    let adminAuthFailed = false;

    if (isStaffUser) {
      const authHeaders = await getAuthHeaders();
      const [cacheRes, schedRes] = await Promise.all([
        safeRawFetchJson('/api/cache/stats', { headers: authHeaders }, 8000),
        safeRawFetchJson('/api/scheduler/status', { headers: authHeaders }, 8000),
      ]);
      if (cacheRes.ok && cacheRes.isJson) {
        setCacheStats(cacheRes.json.data?.stats || null);
      }
      if (schedRes.ok && schedRes.isJson) {
        setSchedulerJobs(schedRes.json.data?.jobs || []);
      }
      if (!cacheRes.ok || !schedRes.ok) {
        adminAuthFailed = true;
        adminAuthNote = `\n⚠️ تعذر التحقق الإداري عبر التوكن: /api/cache/stats=${cacheRes.status} | /api/scheduler/status=${schedRes.status}`;
      } else {
        adminAuthNote = `\n🔐 توثيق الإدارة (Bearer Token): مفعل وصالح (${cacheRes.status})`;
      }
    } else {
      adminAuthNote = '\nℹ️ مسارات تعديل الكاش والمجدول محمية لحسابات الإدارة فقط.';
    }

    if (!healthRes.ok || healthRes.isHtml) {
      setAndTrack('cache_cron', {
        status: 'failed',
        latency: healthRes.latency,
        details:
          `تعذر فحص صحة الكاش والمجدول في الخادم:\n` +
          `• /api/system/health => HTTP ${healthRes.status} ${healthRes.isHtml ? '(HTML)' : healthRes.error || ''}\n` +
          (envInfo.platform === 'vercel'
            ? 'ملاحظة: في بيئة Serverless (مثل Vercel) لا تعمل مهام node-cron الدائمة وتُعاد تهيئة الكاش بالذاكرة مع كل Cold Start.'
            : ''),
      });
    } else {
      const c = healthRes.json?.data?.cache;
      const sc = healthRes.json?.data?.scheduler;
      setAndTrack('cache_cron', {
        status: adminAuthFailed ? 'failed' : envInfo.platform === 'vercel' ? 'warning' : 'success',
        latency: healthRes.latency,
        details:
          `• الكاش: مفاتيح=${c?.keysCount ?? 0} | إصابات SWR=${c?.staleHits ?? 0} | الدقة=${c?.hitRatioPercent ?? 0}%\n` +
          `• المهام المجدولة: ${sc?.totalJobs ?? 0} مهام مسجلة (${healthRes.json?.data?.runtime || 'node'})` +
          adminAuthNote,
      });
    }

    // 9. Browser Storage Check
    try {
      localStorage.setItem('__diag_probe', '1');
      localStorage.removeItem('__diag_probe');
      sessionStorage.setItem('__diag_probe', '1');
      sessionStorage.removeItem('__diag_probe');
      const clientStats = clientCache.getStats();
      setAndTrack('client_storage', {
        status: 'success',
        latency: 2,
        details:
          `localStorage & sessionStorage: يعملان بنجاح\n` +
          `IndexedDB: ${typeof indexedDB !== 'undefined' ? 'متاح' : 'غير متاح'}\n` +
          `كاش الذاكرة L1: ${clientStats.memoryItemsCount} عنصر | مفاتيح التخزين المحلي: ${clientStats.localStorageKeysCount}`,
      });
    } catch (e: any) {
      setAndTrack('client_storage', {
        status: 'failed',
        latency: 0,
        details: `مشكلة في التخزين المحلي للمتصفح: ${e?.message || e}`,
      });
    }

    // 10. Telemetry Errors Audit
    const latestTelemetry = getTelemetryEvents();
    setAndTrack('telemetry_audit', {
      status: latestTelemetry.some((e) => e.severity === 'error')
        ? 'warning'
        : latestTelemetry.length > 0
        ? 'warning'
        : 'success',
      latency: 1,
      details:
        `إجمالي الأحداث الملتقطة في الجلسة: ${latestTelemetry.length}\n` +
        `• أخطاء حرجة: ${latestTelemetry.filter((e) => e.severity === 'error').length}\n` +
        `• تحذيرات: ${latestTelemetry.filter((e) => e.severity === 'warning').length}`,
    });

    setTesting(false);
    return INITIAL_TESTS.map((base) => snapshotMap.get(base.id) || base);
  };

  const buildLocalFallbackAnalysis = (currentTests: TestResult[]): AiDiagnosticReport => {
    const failedTests = currentTests.filter((t) => t.status === 'failed');
    const warningTests = currentTests.filter((t) => t.status === 'warning');
    const anomalies: AiAnomalyItem[] = [];

    const htmlTrap = currentTests.find((t) => t.id === 'vercel_trap' && t.details?.includes('HTML'));
    if (htmlTrap || envInfo.platform === 'vercel') {
      anomalies.push({
        title: 'نشر الواجهة فقط على Vercel دون مسارات الخادم (API Routes)',
        severity: htmlTrap ? 'critical' : 'warning',
        affectedArea: 'Vercel Routing / Express Backend',
        rootCause:
          'تستضيف Vercel ملفات Vite الثابتة (dist/) وتعيد توجيه طلبات /api/* إلى index.html (أو 404) لأن server.ts لا يعمل تلقائياً كخادم دائم على Vercel.',
        fixSteps: [
          'إما ربط التطبيق بخادم Node/Express خارجي يدعم CORS عبر custom_api_host في أدوات التشخيص،',
          'أو إضافة Vercel Serverless Function في مجلد api/ مع ملف vercel.json لتمرير /api/* إلى دالة الخادم.',
        ],
      });
    }

    const aiProbe = currentTests.find((t) => t.id === 'ai_engine');
    if (aiProbe && (aiProbe.status === 'failed' || aiProbe.details?.includes('مفقود'))) {
      anomalies.push({
        title: 'تعطل أو غياب مفتاح الذكاء الاصطناعي GEMINI_API_KEY',
        severity: 'warning',
        affectedArea: 'Server-Side Gemini AI',
        rootCause: 'المتغير GEMINI_API_KEY غير مضبوط في إعدادات Environment Variables على الاستضافة.',
        fixSteps: [
          'أضف GEMINI_API_KEY في لوحة تحكم Vercel تحت Settings > Environment Variables ثم أعد النشر.',
        ],
      });
    }

    for (const ft of failedTests) {
      if (ft.id === 'vercel_trap' && htmlTrap) continue;
      anomalies.push({
        title: `فشل اختبار: ${ft.name}`,
        severity: 'critical',
        affectedArea: ft.category,
        rootCause: ft.details || ft.desc,
        fixSteps: ['راجع تفاصيل الاختبار وسجل الأخطاء لمعالجة الخطأ الموضح.'],
      });
    }

    if (telemetryEvents.length > 0 && anomalies.length === 0) {
      anomalies.push({
        title: `وجود ${telemetryEvents.length} خطأ/تحذير مسجل أثناء التصفح`,
        severity: 'warning',
        affectedArea: 'Runtime / Telemetry',
        rootCause: telemetryEvents[0].message,
        fixSteps: ['افتح تبويب سجل الأخطاء الموجه لفحص الرسالة والمسار الكاملين.'],
      });
    }

    const score = Math.max(
      10,
      100 - failedTests.length * 18 - warningTests.length * 7 - Math.min(20, telemetryEvents.length * 2)
    );

    return {
      overallStatus: score >= 80 ? 'healthy' : score >= 50 ? 'degraded' : 'critical',
      healthScore: score,
      summary:
        anomalies.length === 0
          ? 'جميع الفحوصات الأساسية تعمل بشكل مستقر دون شذوذ ظاهر.'
          : `تم رصد ${failedTests.length} اختباراً فاشلاً و ${warningTests.length} تنبيهاً و ${telemetryEvents.length} حدث خطأ في الجلسة.`,
      vercelDiagnosis:
        htmlTrap
          ? 'على هذا النطاق تعيد مسارات /api/* صفحة HTML بدل JSON مما يثبت أن خادم Node الخلفي غير متصل بهذه الواجهة.'
          : envInfo.platform === 'vercel'
          ? 'التطبيق يعمل على Vercel؛ تأكد من إضافة نطاق Vercel إلى Firebase Authorized Domains وضبط متغيرات البيئة.'
          : 'البيئة الحالية تعمل بخادم API متصل بنجاح.',
      priorityAction:
        anomalies[0]?.fixSteps[0] || 'راقب سجل الأخطاء أثناء استخدام التطبيق وأعد الفحص إذا ظهر خلل.',
      anomalies,
      recommendedActions: [
        'التأكد من إرجاع JSON سليم من كافة مسارات /api/*',
        'إضافة نطاق الاستضافة الخارجي إلى Firebase Authentication Authorized Domains',
        'تصدير التقرير الكامل ومراجعة الأخطاء الحرجة أولاً',
      ],
      engineLabel: 'التحليل الآلي المحلي (تعذر الوصول لنقطة Gemini AI)',
      generatedAt: new Date().toLocaleString('ar-EG'),
    };
  };

  const runAiAnalysis = async () => {
    if (aiAnalyzing) return;
    setAiAnalyzing(true);
    setAiErrorMsg(null);
    setActiveTab('ai-report');

    let latestTestsForFallback = tests;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 22000);

    try {
      const latestTests = tests.some((t) => t.status === 'idle') ? await runAllTests() : tests;
      latestTestsForFallback = latestTests;
      const liveTelemetry = getTelemetryEvents();

      const targetUrl = resolveRawTargetUrl('/api/ai/analyze-diagnostics');
      const res = await rawNativeFetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          environment: envInfo,
          tests: latestTests,
          telemetryErrors: liveTelemetry,
        }),
      });

      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        const json = await res.json();
        if (json?.success && json.data) {
          setAiReport({
            ...json.data,
            engineLabel: `Gemini AI (${json.engine || 'gemini-4-hydrogen'})`,
            generatedAt: new Date().toLocaleString('ar-EG'),
          });
          return;
        }
      }

      let serverMsg = `HTTP ${res.status}`;
      try {
        const errJson = await res.json();
        if (errJson?.message) serverMsg = errJson.message;
      } catch {}

      setAiErrorMsg(`تعذر التحليل السحابي عبر Gemini (${serverMsg}) — تم توليد تحليل آلي محلي بديل.`);
      setAiReport(buildLocalFallbackAnalysis(latestTests));
    } catch (err: any) {
      const msg = err?.name === 'AbortError' ? 'انتهت مهلة انتظار الخادم (22 ثانية)' : err?.message || String(err);
      setAiErrorMsg(`فشل الاتصال بمحرك الذكاء الاصطناعي (${msg}) — تم توليد تحليل آلي محلي.`);
      setAiReport(buildLocalFallbackAnalysis(latestTestsForFallback));
    } finally {
      clearTimeout(timeoutId);
      setAiAnalyzing(false);
    }
  };

  const handleClearCache = async () => {
    setCacheClearing(true);
    setSchedulerActionFeedback(null);
    try {
      clientCache.clear();
      try {
        sessionStorage.clear();
      } catch {}
      const authHeaders = await getAuthHeaders();
      if (!authHeaders.Authorization) {
        setSchedulerActionFeedback('ℹ️ تم تفريغ كاش المتصفح المحلي (تفريغ كاش الخادم يتطلب تسجيل الدخول كمشرف).');
        return;
      }
      const res = await rawNativeFetch(resolveRawTargetUrl('/api/cache/clear'), {
        method: 'POST',
        headers: authHeaders,
      });
      if (res.ok) {
        setCacheStats((prev: any) => (prev ? { ...prev, keysCount: 0, hits: 0, misses: 0 } : null));
        setSchedulerActionFeedback('✅ تم تفريغ كاش المتصفح والخادم بنجاح.');
        void runAllTests();
      } else {
        const errJson = await res.json().catch(() => ({}));
        setSchedulerActionFeedback(`⚠️ تم تفريغ كاش المتصفح، ولكن الخادم ردّ (${res.status}): ${errJson?.message || 'صلاحية مشرف مطلوبة'}`);
      }
    } catch (e: any) {
      setSchedulerActionFeedback(`❌ فشل تفريغ الكاش: ${e?.message || e}`);
    } finally {
      setCacheClearing(false);
    }
  };

  const handleTriggerJob = async (jobId: string) => {
    setTriggeringJob(jobId);
    setSchedulerActionFeedback(null);
    try {
      const authHeaders = await getAuthHeaders();
      if (!authHeaders.Authorization) {
        setSchedulerActionFeedback('⚠️ تشغيل مهام الخادم يتطلب تسجيل الدخول بحساب مشرف/مدير.');
        return;
      }
      const res = await rawNativeFetch(resolveRawTargetUrl(`/api/scheduler/run/${jobId}`), {
        method: 'POST',
        headers: authHeaders,
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.success) {
        setSchedulerActionFeedback(`✅ ${json.message} (${json.durationMs || 0}ms)`);
        const statusRes = await rawNativeFetch(resolveRawTargetUrl('/api/system/health'));
        if (statusRes.ok) {
          const statusJson = await statusRes.json();
          setSchedulerJobs(statusJson.data?.scheduler?.jobs || []);
        }
      } else {
        setSchedulerActionFeedback(`❌ فشل (${res.status}): ${json.message || 'غير مصرح'}`);
      }
    } catch (e: any) {
      setSchedulerActionFeedback(`❌ خطأ: ${e.message}`);
    } finally {
      setTriggeringJob(null);
      setTimeout(() => setSchedulerActionFeedback(null), 6000);
    }
  };

  const testSingleRoute = async () => {
    if (routeTesting || !customRoute.trim()) return;
    setRouteTesting(true);
    setRouteResult(null);

    const route = customRoute.trim().startsWith('/') ? customRoute.trim() : `/${customRoute.trim()}`;
    const targetUrl = route.startsWith('/api') ? resolveRawTargetUrl(route) : route;
    const t0 = Date.now();
    try {
      const response = await rawNativeFetch(targetUrl, { cache: 'no-store' });
      const latency = Date.now() - t0;
      const headersObj: Record<string, string> = {};
      response.headers.forEach((v, k) => {
        headersObj[k] = v;
      });
      let body = await response.text();
      let isJson = false;
      try {
        const parsed = JSON.parse(body);
        body = JSON.stringify(parsed, null, 2);
        isJson = true;
      } catch {
        body = body.slice(0, 1500);
      }

      setRouteResult({
        success: response.ok && isJson,
        targetUrl,
        status: response.status,
        statusText: response.statusText,
        latency,
        headers: headersObj,
        isJson,
        body,
      });
    } catch (err: any) {
      setRouteResult({
        success: false,
        targetUrl,
        latency: Date.now() - t0,
        error: err.message || String(err),
        tip: 'تحقق من توفر الخادم أو سياسات CORS.',
      });
    } finally {
      setRouteTesting(false);
    }
  };

  const generateDiagnosticReport = () => {
    let report = `====================================================\n`;
    report += `📱 تقرير الفحص الشامل والأخطاء - أنمي MOD\n`;
    report += `الوقت: ${new Date().toLocaleString('ar-EG')}\n`;
    report += `البيئة: ${envInfo.platformLabelAr} (${envInfo.origin})\n`;
    report += `====================================================\n\n`;

    report += `🔍 [1] نتائج الاختبارات (${tests.length}):\n`;
    tests.forEach((t, i) => {
      const symbol =
        t.status === 'success'
          ? '✅'
          : t.status === 'failed'
          ? '❌'
          : t.status === 'warning'
          ? '⚠️'
          : '⏳';
      report += `${i + 1}. ${symbol} ${t.name} (${t.latency ?? 0}ms)\n`;
      if (t.details) report += `   ${t.details.replace(/\n/g, '\n   ')}\n`;
    });

    report += `\n🐞 [2] الأخطاء المسجلة في الجلسة (${telemetryEvents.length}):\n`;
    telemetryEvents.forEach((e, i) => {
      report += `${i + 1}. [${e.source}/${e.severity}] ${e.title} (x${e.count}): ${e.message}\n`;
      if (e.url) report += `   URL: ${e.url}\n`;
    });

    if (aiReport) {
      report += `\n🤖 [3] تقرير تحليل الشذوذ (${aiReport.engineLabel}):\n`;
      report += `نسبة الصحة: ${aiReport.healthScore}% | الحالة: ${aiReport.overallStatus}\n`;
      report += `الملخص: ${aiReport.summary}\n`;
      report += `تشخيص Vercel: ${aiReport.vercelDiagnosis}\n`;
      report += `الإجراء الأهم: ${aiReport.priorityAction}\n`;
      aiReport.anomalies.forEach((a, idx) => {
        report += `- شذوذ ${idx + 1} [${a.severity}]: ${a.title}\n  السبب: ${a.rootCause}\n  الحل: ${a.fixSteps.join(' | ')}\n`;
      });
    }

    return report;
  };

  const handleCopyLog = () => {
    navigator.clipboard.writeText(generateDiagnosticReport());
    setCopiedLog(true);
    setTimeout(() => setCopiedLog(false), 2000);
  };

  const handleDownloadJsonReport = () => {
    const payload = {
      generatedAt: new Date().toISOString(),
      environment: envInfo,
      tests,
      telemetryEvents,
      aiReport,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `otaku-diagnostics-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const filteredEvents = useMemo(() => {
    if (errorFilter === 'all') return telemetryEvents;
    return telemetryEvents.filter((e) => e.source === errorFilter);
  }, [telemetryEvents, errorFilter]);

  const counts = useMemo(() => {
    return {
      success: tests.filter((t) => t.status === 'success').length,
      warning: tests.filter((t) => t.status === 'warning').length,
      failed: tests.filter((t) => t.status === 'failed').length,
      errors: telemetryEvents.filter((e) => e.severity === 'error').length,
    };
  }, [tests, telemetryEvents]);

  return (
    <div
      className="pb-24 pt-4 px-4 max-w-5xl mx-auto font-sans text-right min-h-screen bg-zinc-950 text-zinc-100"
      dir="rtl"
      id="diagnostics_panel_parent"
    >
      {/* Top Bar */}
      <div className="flex items-center justify-between border-b border-zinc-900 pb-4 mb-5">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-zinc-300 hover:text-white transition bg-zinc-900 border border-zinc-800 py-1.5 px-3 rounded-xl text-xs cursor-pointer"
        >
          <ArrowLeft size={14} />
          <span>الرجوع</span>
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyLog}
            className="flex items-center gap-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 py-1.5 px-3 rounded-xl text-xs font-bold cursor-pointer"
          >
            <Copy size={13} className={copiedLog ? 'text-emerald-400' : 'text-zinc-400'} />
            <span>{copiedLog ? 'تم النسخ' : 'نسخ التقرير'}</span>
          </button>
          <button
            onClick={handleDownloadJsonReport}
            className="flex items-center gap-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 py-1.5 px-3 rounded-xl text-xs font-bold cursor-pointer"
          >
            <Download size={13} className="text-zinc-400" />
            <span>JSON</span>
          </button>
        </div>
      </div>

      {/* Hero Summary Card */}
      <div className="bg-gradient-to-l from-rose-950/25 via-zinc-900 to-zinc-900 border border-zinc-800 p-5 rounded-2xl mb-5 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
              <Activity size={24} className={testing ? 'animate-pulse' : ''} />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-black text-white">
                  مركز رصد الأخطاء وتشخيص الشذوذ بالذكاء الاصطناعي
                </h1>
                <span className="text-[10px] font-bold bg-zinc-800 text-zinc-300 border border-zinc-700 px-2 py-0.5 rounded-full">
                  {envInfo.platformLabelAr}
                </span>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed mt-1">
                تُوجّه جميع أخطاء الواجهة والشبكة وFirestore تلقائياً إلى هذه الشاشة، مع فحوصات حقيقية متعددة الطبقات وتقرير ذكاء اصطناعي لكشف مشاكل Vercel والخادم.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 shrink-0">
            <button
              onClick={() => void runAllTests()}
              disabled={testing}
              className="flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold py-2.5 px-3.5 rounded-xl border border-zinc-700 transition cursor-pointer disabled:opacity-50"
            >
              <RefreshCw size={14} className={testing ? 'animate-spin text-rose-400' : ''} />
              <span>{testing ? 'جاري الفحص...' : 'تشغيل كل الاختبارات'}</span>
            </button>
            <button
              onClick={() => void runAiAnalysis()}
              disabled={aiAnalyzing}
              className="flex items-center gap-1.5 bg-gradient-to-r from-rose-600 to-purple-600 hover:from-rose-500 hover:to-purple-500 text-white text-xs font-black py-2.5 px-4 rounded-xl shadow-lg transition cursor-pointer disabled:opacity-50"
            >
              <Sparkles size={14} className={aiAnalyzing ? 'animate-spin' : ''} />
              <span>{aiAnalyzing ? 'جاري التحليل...' : 'تحليل وتوليد تقرير AI'}</span>
            </button>
          </div>
        </div>

        {/* Status Metrics Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-4 pt-4 border-t border-white/5 text-center">
          <div className="bg-zinc-950/80 border border-zinc-800 rounded-xl p-2.5">
            <span className="text-[10px] text-zinc-400 block">اختبارات سليمة</span>
            <strong className="text-base font-black text-emerald-400 font-mono">{counts.success}</strong>
          </div>
          <div className="bg-zinc-950/80 border border-zinc-800 rounded-xl p-2.5">
            <span className="text-[10px] text-zinc-400 block">تحذيرات</span>
            <strong className="text-base font-black text-amber-400 font-mono">{counts.warning}</strong>
          </div>
          <div className="bg-zinc-950/80 border border-zinc-800 rounded-xl p-2.5">
            <span className="text-[10px] text-zinc-400 block">فحوصات فاشلة</span>
            <strong className="text-base font-black text-rose-400 font-mono">{counts.failed}</strong>
          </div>
          <div className="bg-zinc-950/80 border border-zinc-800 rounded-xl p-2.5">
            <span className="text-[10px] text-zinc-400 block">أخطاء ملتقطة</span>
            <strong className="text-base font-black text-purple-400 font-mono">{telemetryEvents.length}</strong>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-5 hide-scrollbar">
        {[
          { id: 'tests', label: 'الاختبارات الشاملة (10)', icon: ShieldCheck },
          { id: 'errors', label: `سجل الأخطاء الموجه (${telemetryEvents.length})`, icon: Bug },
          { id: 'ai-report', label: 'تقرير الذكاء الاصطناعي', icon: Cpu },
          { id: 'tools', label: 'أدوات الشبكة والكاش', icon: Settings },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as DiagnosticsTabKey)}
              className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap border transition cursor-pointer ${
                active
                  ? 'bg-rose-600 text-white border-rose-500 shadow-lg shadow-rose-950/30'
                  : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white hover:border-zinc-700'
              }`}
            >
              <Icon size={14} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: Multi-Layer Automated Tests */}
      {activeTab === 'tests' && (
        <div className="space-y-3" id="tests_container">
          {tests.map((t) => (
            <div
              key={t.id}
              className="bg-[#0c0c0e] border border-zinc-900 hover:border-zinc-800 rounded-xl p-4 transition-all"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <div className="mt-0.5 shrink-0">
                    {t.status === 'success' && <CheckCircle2 size={17} className="text-emerald-500" />}
                    {t.status === 'failed' && <XCircle size={17} className="text-rose-500" />}
                    {t.status === 'warning' && <AlertTriangle size={17} className="text-amber-500" />}
                    {t.status === 'running' && <RefreshCw size={17} className="text-zinc-400 animate-spin" />}
                    {t.status === 'idle' && <Terminal size={17} className="text-zinc-600" />}
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-zinc-100 flex flex-wrap items-center gap-2">
                      <span>{t.name}</span>
                      {t.latency !== undefined && (
                        <span
                          className={`text-[10px] font-mono px-2 py-0.5 rounded-md ${
                            t.latency < 500
                              ? 'bg-emerald-500/10 text-emerald-400'
                              : 'bg-amber-500/10 text-amber-400'
                          }`}
                        >
                          {t.latency}ms
                        </span>
                      )}
                    </h4>
                    <p className="text-[11px] text-zinc-400 mt-0.5">{t.desc}</p>
                  </div>
                </div>
              </div>

              {t.details && (
                <div className="mt-3 bg-zinc-950 p-3 rounded-lg border border-zinc-800/80">
                  <pre
                    className="text-[10px] font-mono text-zinc-300 whitespace-pre-wrap break-all text-left max-h-52 overflow-y-auto"
                    dir="ltr"
                  >
                    {t.details}
                  </pre>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* TAB 2: Centralized Error Telemetry Inbox */}
      {activeTab === 'errors' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 bg-zinc-900 border border-zinc-800 rounded-xl p-3">
            <div className="flex flex-wrap gap-1.5">
              {[
                { key: 'all', label: 'الكل' },
                { key: 'network', label: 'الشبكة وAPI' },
                { key: 'firestore', label: 'Firestore' },
                { key: 'react', label: 'الواجهة React' },
                { key: 'runtime', label: 'Runtime JS' },
                { key: 'promise', label: 'Promises' },
                { key: 'console', label: 'Console' },
              ].map((f) => (
                <button
                  key={f.key}
                  onClick={() => setErrorFilter(f.key as any)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer border ${
                    errorFilter === f.key
                      ? 'bg-rose-600/20 border-rose-500 text-rose-300'
                      : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <button
              onClick={clearTelemetryEvents}
              disabled={telemetryEvents.length === 0}
              className="flex items-center gap-1 text-xs font-bold bg-zinc-950 hover:bg-rose-950/40 text-zinc-300 hover:text-rose-300 border border-zinc-800 px-3 py-1.5 rounded-lg transition cursor-pointer disabled:opacity-40"
            >
              <Trash2 size={13} />
              <span>مسح السجل</span>
            </button>
          </div>

          {filteredEvents.length === 0 ? (
            <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-8 text-center space-y-2">
              <CheckCircle2 size={32} className="text-emerald-500 mx-auto" />
              <h3 className="text-sm font-bold text-zinc-200">لا توجد أخطاء مسجلة في هذه الفئة</h3>
              <p className="text-xs text-zinc-400">
                أي خطأ يحدث في الشبكة أو الواجهة أو Firebase أثناء تصفحك سيظهر هنا تلقائياً مع تفاصيله الكاملة.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredEvents.map((ev) => (
                <div
                  key={ev.id}
                  className={`bg-zinc-900 border rounded-xl p-4 space-y-2 ${
                    ev.severity === 'error'
                      ? 'border-rose-500/30'
                      : 'border-amber-500/30'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
                          ev.severity === 'error'
                            ? 'bg-rose-500/15 text-rose-400'
                            : 'bg-amber-500/15 text-amber-400'
                        }`}
                      >
                        {ev.source.toUpperCase()}
                      </span>
                      <h4 className="text-xs font-bold text-white">{ev.title}</h4>
                      {ev.count > 1 && (
                        <span className="text-[10px] font-mono bg-zinc-800 text-zinc-300 px-1.5 py-0.5 rounded">
                          ×{ev.count}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] font-mono text-zinc-500">
                      {new Date(ev.timestamp).toLocaleTimeString('ar-EG')}
                    </span>
                  </div>

                  <p className="text-xs text-rose-200/90 break-words">{ev.message}</p>

                  {ev.url && (
                    <div className="text-[10px] font-mono text-zinc-400 break-all" dir="ltr">
                      Target: {ev.url} {ev.statusCode ? `(HTTP ${ev.statusCode})` : ''}
                    </div>
                  )}

                  {(ev.details || ev.stack) && (
                    <pre
                      className="text-[10px] font-mono bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-400 overflow-x-auto max-h-40 whitespace-pre-wrap break-all text-left"
                      dir="ltr"
                    >
                      {ev.details || ev.stack}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: AI Anomaly Report */}
      {activeTab === 'ai-report' && (
        <div className="space-y-4">
          {aiErrorMsg && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-xs text-amber-200 flex items-center gap-2">
              <AlertTriangle size={16} className="shrink-0 text-amber-400" />
              <span>{aiErrorMsg}</span>
            </div>
          )}

          {!aiReport ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400 mx-auto">
                <Sparkles size={28} />
              </div>
              <div className="max-w-md mx-auto space-y-1.5">
                <h3 className="text-sm font-black text-white">تقرير الذكاء الاصطناعي لكشف الشذوذ</h3>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  اضغط على الزر أدناه لإرسال نتائج الاختبارات العشرة وسجل الأخطاء وبيئة الاستضافة إلى الذكاء الاصطناعي واستخراج تقرير مفصل يحدد مكان الخلل وخطوات الحل.
                </p>
              </div>
              <button
                onClick={() => void runAiAnalysis()}
                disabled={aiAnalyzing}
                className="inline-flex items-center gap-2 bg-gradient-to-r from-rose-600 to-purple-600 hover:from-rose-500 hover:to-purple-500 text-white text-xs font-black px-5 py-3 rounded-xl transition cursor-pointer disabled:opacity-50"
              >
                <Sparkles size={15} className={aiAnalyzing ? 'animate-spin' : ''} />
                <span>{aiAnalyzing ? 'جاري فحص الشذوذ وتوليد التقرير...' : 'إنشاء التقرير الآن'}</span>
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Top Report Summary */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={`text-xl font-black font-mono px-3 py-1.5 rounded-xl border ${
                        aiReport.healthScore >= 80
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                          : aiReport.healthScore >= 50
                          ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                          : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                      }`}
                    >
                      {aiReport.healthScore}%
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-white">الخلاصة التشخيصية</h3>
                      <span className="text-[11px] text-zinc-400">
                        {aiReport.engineLabel} • {aiReport.generatedAt}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => void runAiAnalysis()}
                    disabled={aiAnalyzing}
                    className="flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold px-3 py-2 rounded-xl border border-zinc-700 cursor-pointer"
                  >
                    <RefreshCw size={13} className={aiAnalyzing ? 'animate-spin' : ''} />
                    <span>تحديث التحليل</span>
                  </button>
                </div>

                <p className="text-xs text-zinc-200 leading-relaxed">{aiReport.summary}</p>

                <div className="bg-rose-500/10 border border-rose-500/25 rounded-xl p-3.5 space-y-1">
                  <span className="text-[11px] font-black text-rose-300 block">الإجراء الأهم الآن:</span>
                  <p className="text-xs text-zinc-100">{aiReport.priorityAction}</p>
                </div>

                <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3.5 space-y-1">
                  <span className="text-[11px] font-black text-sky-300 flex items-center gap-1.5">
                    <Server size={13} />
                    <span>تقييم بيئة النشر (Vercel والاستضافة):</span>
                  </span>
                  <p className="text-xs text-zinc-300 leading-relaxed">{aiReport.vercelDiagnosis}</p>
                </div>
              </div>

              {/* Anomalies List */}
              <div className="space-y-3">
                <h4 className="text-xs font-black text-zinc-300 px-1">
                  الشذوذات المكتشفة ({aiReport.anomalies.length})
                </h4>
                {aiReport.anomalies.length === 0 ? (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-xs text-emerald-400">
                    لم يتم رصد أي شذوذات جوهرية في البيانات المرسلة.
                  </div>
                ) : (
                  aiReport.anomalies.map((item, idx) => (
                    <div
                      key={idx}
                      className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h5 className="text-xs font-black text-white">{item.title}</h5>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded font-mono">
                            {item.affectedArea}
                          </span>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                              item.severity === 'critical'
                                ? 'bg-rose-500/15 text-rose-400'
                                : item.severity === 'warning'
                                ? 'bg-amber-500/15 text-amber-400'
                                : 'bg-sky-500/15 text-sky-400'
                            }`}
                          >
                            {item.severity === 'critical'
                              ? 'حرج'
                              : item.severity === 'warning'
                              ? 'تحذير'
                              : 'معلومة'}
                          </span>
                        </div>
                      </div>
                      <p className="text-xs text-zinc-300 leading-relaxed">{item.rootCause}</p>
                      <ul className="space-y-1 text-[11px] text-zinc-400 list-disc list-inside pr-1">
                        {item.fixSteps.map((step, sIdx) => (
                          <li key={sIdx}>{step}</li>
                        ))}
                      </ul>
                    </div>
                  ))
                )}
              </div>

              {/* Recommended Actions */}
              {aiReport.recommendedActions?.length > 0 && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
                  <h4 className="text-xs font-black text-zinc-200">قائمة التحقق الموصى بها:</h4>
                  <ul className="space-y-1.5 text-xs text-zinc-300 list-decimal list-inside pr-1">
                    {aiReport.recommendedActions.map((act, idx) => (
                      <li key={idx}>{act}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: Network, Cache, Cron & Manual Endpoint Tools */}
      {activeTab === 'tools' && (
        <div className="space-y-5">
          {/* Custom API Host Config */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-md" id="custom_api_settings_box">
            <h3 className="text-sm font-bold text-zinc-200 mb-2 flex items-center gap-2">
              <Settings size={16} className="text-rose-500" />
              <span>ربط خادم API خارجي (مفيد عند نشر الواجهة الثابتة على Vercel أو APK)</span>
            </h3>
            <p className="text-xs text-zinc-400 mb-4 leading-relaxed">
              إذا نشرت الواجهة فقط على Vercel وتعمل الخلفية على خادم خارجي، أدخل رابط الخادم هنا لتوجيه طلبات{' '}
              <code className="text-xs font-mono bg-zinc-800 px-1.5 py-0.5 rounded text-rose-400">/api/...</code> إليه.
            </p>

            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={customHost}
                onChange={(e) => setCustomHost(e.target.value)}
                placeholder="مثال: https://your-api-server.com"
                className="flex-1 bg-zinc-950 border border-zinc-800 focus:border-rose-500 rounded-xl px-4 py-2.5 text-xs font-mono text-zinc-300 outline-none text-left"
                dir="ltr"
              />
              <button
                onClick={saveCustomHostHandler}
                className="bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition cursor-pointer shrink-0"
              >
                حفظ وتطبيق
              </button>
              <button
                onClick={resetHostHandler}
                className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-bold px-4 py-2.5 rounded-xl transition cursor-pointer shrink-0 border border-zinc-700"
              >
                إعادة للأصل
              </button>
            </div>

            {savedHost && (
              <div
                className="mt-3 flex items-center gap-1.5 bg-zinc-950/50 p-2.5 rounded-xl border border-zinc-800 text-[11px] text-zinc-400 font-mono"
                dir="ltr"
              >
                <Globe size={12} className="text-emerald-500" />
                <span>Active Host: {savedHost}</span>
              </div>
            )}
          </div>

          {/* Cache & Scheduler */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3 border-b border-zinc-800 pb-3">
                <div className="flex items-center gap-2">
                  <Layers size={18} className="text-rose-500" />
                  <h3 className="text-sm font-bold text-zinc-100">الكاش (node-cache)</h3>
                </div>
                <button
                  onClick={handleClearCache}
                  disabled={cacheClearing}
                  className="flex items-center gap-1.5 bg-zinc-800 hover:bg-rose-950/40 text-zinc-300 text-xs font-semibold px-3 py-1.5 rounded-xl border border-zinc-700 transition cursor-pointer"
                >
                  <Trash2 size={13} className={cacheClearing ? 'animate-spin' : ''} />
                  <span>{cacheClearing ? 'جاري التفريغ...' : 'تفريغ الكاش'}</span>
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                <div className="bg-zinc-950 p-2.5 rounded-xl border border-zinc-800">
                  <span className="text-[10px] text-zinc-500 block">المفاتيح</span>
                  <strong className="text-sm font-mono">{cacheStats?.keysCount ?? 0}</strong>
                </div>
                <div className="bg-zinc-950 p-2.5 rounded-xl border border-zinc-800">
                  <span className="text-[10px] text-zinc-500 block">Hits</span>
                  <strong className="text-sm font-mono text-emerald-400">{cacheStats?.hits ?? 0}</strong>
                </div>
                <div className="bg-zinc-950 p-2.5 rounded-xl border border-zinc-800">
                  <span className="text-[10px] text-zinc-500 block">Misses</span>
                  <strong className="text-sm font-mono text-amber-400">{cacheStats?.misses ?? 0}</strong>
                </div>
                <div className="bg-zinc-950 p-2.5 rounded-xl border border-zinc-800">
                  <span className="text-[10px] text-zinc-500 block">الدقة</span>
                  <strong className="text-sm font-mono text-rose-400">{cacheStats?.hitRatioPercent ?? 0}%</strong>
                </div>
              </div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3 border-b border-zinc-800 pb-3">
                <div className="flex items-center gap-2">
                  <Clock size={18} className="text-emerald-500" />
                  <h3 className="text-sm font-bold text-zinc-100">مجدول المهام الخلفي</h3>
                </div>
                <span className="text-[10px] font-mono text-zinc-400">Jobs: {schedulerJobs.length}</span>
              </div>
              {schedulerActionFeedback && (
                <div className="mb-3 p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-200">
                  {schedulerActionFeedback}
                </div>
              )}
              <div className="space-y-2">
                {[
                  { id: 'recent-anime-24h', label: 'تحديث الأنميات الحديثة', cron: '0 0 * * *' },
                  { id: 'scrape-links-12h', label: 'تحديث روابط المشاهدة والتحميل', cron: '0 */12 * * *' },
                ].map((job) => (
                  <div
                    key={job.id}
                    className="bg-zinc-950 p-3 rounded-xl border border-zinc-800 flex items-center justify-between gap-2"
                  >
                    <div>
                      <span className="text-[10px] font-mono text-rose-400 block">{job.cron}</span>
                      <span className="text-xs font-bold text-zinc-200">{job.label}</span>
                    </div>
                    <button
                      onClick={() => handleTriggerJob(job.id)}
                      disabled={triggeringJob === job.id}
                      className="flex items-center gap-1 bg-zinc-800 hover:bg-rose-600 text-zinc-200 text-xs font-semibold px-3 py-1.5 rounded-lg border border-zinc-700 transition cursor-pointer"
                    >
                      <Play size={12} />
                      <span>{triggeringJob === job.id ? 'يعمل...' : 'تشغيل'}</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Raw Route Tester */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5" id="manual_endpoint_test_panel">
            <h3 className="text-sm font-bold text-zinc-200 mb-3 flex items-center gap-2">
              <Search size={16} className="text-rose-500" />
              <span>مختبر المسارات الخام (Raw Request Tester)</span>
            </h3>
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={customRoute}
                onChange={(e) => setCustomRoute(e.target.value)}
                placeholder="/api/dashboard"
                className="flex-1 bg-zinc-950 border border-zinc-800 focus:border-rose-500 rounded-xl px-4 py-2.5 text-xs font-mono text-zinc-300 outline-none text-left"
                dir="ltr"
              />
              <button
                onClick={testSingleRoute}
                disabled={routeTesting || !customRoute.trim()}
                className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold px-5 py-2.5 rounded-xl border border-zinc-700 cursor-pointer"
              >
                {routeTesting ? 'جاري الفحص...' : 'اختبار المسار'}
              </button>
            </div>

            {routeResult && (
              <div className="bg-zinc-950 rounded-xl p-4 border border-zinc-800 space-y-2.5">
                <div className="flex items-center justify-between text-xs border-b border-zinc-900 pb-2">
                  <span className="font-mono text-zinc-400" dir="ltr">
                    {routeResult.targetUrl}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded font-mono font-bold text-[10px] ${
                      routeResult.success ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'
                    }`}
                  >
                    {routeResult.status ? `HTTP ${routeResult.status}` : 'FAILED'} • {routeResult.latency}ms
                  </span>
                </div>
                {routeResult.error ? (
                  <p className="text-xs font-mono text-rose-400">{routeResult.error}</p>
                ) : (
                  <pre
                    className="text-[10px] font-mono text-zinc-300 max-h-60 overflow-y-auto whitespace-pre-wrap break-all text-left"
                    dir="ltr"
                  >
                    {routeResult.body}
                  </pre>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
