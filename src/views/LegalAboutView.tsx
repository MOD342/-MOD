import React, { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import {
  ChevronRight,
  ShieldCheck,
  FileText,
  Info,
  Database,
  Lock,
  Trash2,
  Mail,
  ExternalLink,
  AlertTriangle,
  CheckCircle2,
  Scale,
  UserCheck,
  Copy,
  Check,
  X,
} from 'lucide-react';
import { openExternalUrl } from '../utils/externalNavigation';
import { ViewportPortal } from '../components/ViewportPortal';

export type LegalSectionId = 'about' | 'privacy' | 'terms' | 'data_safety';

interface LegalAboutViewProps {
  onBack: () => void;
  initialSection?: LegalSectionId;
  onOpenAccountSettings?: () => void;
}

const DEVELOPER_EMAIL = '342.mod@gmail.com';
const PACKAGE_ID = 'com.animemod.otakuhub';
const APP_VERSION = '2.6.0';
const PUBLIC_WEB_FALLBACK = 'https://anime-mod-production.up.railway.app';

function resolveWebBaseOrigin(): string {
  const configured = (import.meta.env.VITE_API_URL || '').trim().replace(/\/+$/, '');
  if (configured) return configured;
  if (typeof window !== 'undefined') {
    const { origin, protocol, hostname } = window.location;
    if (
      (protocol === 'https:' || protocol === 'http:') &&
      hostname !== 'localhost' &&
      hostname !== '127.0.0.1' &&
      !hostname.endsWith('.run.app')
    ) {
      return origin;
    }
  }
  return PUBLIC_WEB_FALLBACK;
}

export default function LegalAboutView({
  onBack,
  initialSection = 'about',
  onOpenAccountSettings,
}: LegalAboutViewProps) {
  const [activeSection, setActiveSection] = useState<LegalSectionId>(initialSection);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [webPreviewSlug, setWebPreviewSlug] = useState<string | null>(null);
  const [webPreviewTitle, setWebPreviewTitle] = useState<string>('');
  const [webPreviewHtml, setWebPreviewHtml] = useState<string>('');
  const [loadingPreview, setLoadingPreview] = useState(false);

  useEffect(() => {
    setActiveSection(initialSection);
  }, [initialSection]);

  const webOrigin = resolveWebBaseOrigin();

  const tabs: { id: LegalSectionId; label: string; icon: React.ComponentType<any> }[] = [
    { id: 'about', label: 'عن التطبيق', icon: Info },
    { id: 'privacy', label: 'سياسة الخصوصية', icon: ShieldCheck },
    { id: 'terms', label: 'اتفاقية الاستخدام', icon: FileText },
    { id: 'data_safety', label: 'أمان البيانات', icon: Database },
  ];

  const handleCopyText = async (value: string, key: string) => {
    try {
      await navigator.clipboard?.writeText(value);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((prev) => (prev === key ? null : prev)), 2200);
    } catch {
      // Fallback ignored safely
    }
  };

  const openWebPage = async (slug: string, title: string) => {
    const fullUrl = `${webOrigin}${slug}`;
    if (Capacitor.isNativePlatform()) {
      void openExternalUrl(fullUrl);
      return;
    }

    setWebPreviewSlug(slug);
    setWebPreviewTitle(title);
    setWebPreviewHtml('');
    setLoadingPreview(true);

    try {
      // Try same-origin legal page first (works inside AI Studio & deployed web host without popup/CORS errors)
      const res = await fetch(slug, { headers: { Accept: 'text/html' } });
      if (res.ok) {
        const html = await res.text();
        if (html && !html.includes('id="root"')) {
          setWebPreviewHtml(html);
          setLoadingPreview(false);
          return;
        }
      }
    } catch {
      // Fallback to remote API origin below
    }

    try {
      const remoteRes = await fetch(fullUrl, { headers: { Accept: 'text/html' } });
      if (remoteRes.ok) {
        const remoteHtml = await remoteRes.text();
        if (remoteHtml && !remoteHtml.includes('id="root"')) {
          setWebPreviewHtml(remoteHtml);
          setLoadingPreview(false);
          return;
        }
      }
    } catch {
      // Handled by link modal fallback UI
    }

    setLoadingPreview(false);
  };

  const activeExternalUrl = webPreviewSlug ? `${webOrigin}${webPreviewSlug}` : '';

  return (
    <div
      className="min-h-[var(--vv-height,100dvh)] bg-[#07070b] text-white pb-24 font-sans text-right"
      dir="rtl"
      id="legal_about_screen"
    >
      {/* Sticky Header */}
      <header className="sticky top-0 z-40 bg-[#07070b]/92 backdrop-blur-xl border-b border-white/[0.06]">
        <div className="max-w-4xl mx-auto px-4 py-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={onBack}
              className="w-11 h-11 rounded-xl bg-[#111118] hover:bg-[#191923] border border-white/10 flex items-center justify-center text-white transition cursor-pointer shrink-0"
              aria-label="رجوع"
            >
              <ChevronRight size={20} />
            </button>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-black text-white truncate">
                الأمان والخصوصية والمعلومات القانونية
              </h1>
              <p className="text-xs text-neutral-400 truncate">
                أوتاكو MOD · شفافية كاملة وامتثال لمعايير Google Play
              </p>
            </div>
          </div>
        </div>

        {/* Section Tabs */}
        <div className="max-w-4xl mx-auto px-4 pb-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-[#101016] p-1.5 rounded-2xl border border-white/[0.06]">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeSection === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveSection(tab.id)}
                  className={`min-h-[42px] px-3 rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5 cursor-pointer ${
                    isActive
                      ? 'bg-[#FF1744] text-white shadow-lg shadow-[#FF1744]/20'
                      : 'text-neutral-400 hover:text-white hover:bg-white/[0.04]'
                  }`}
                >
                  <Icon size={14} className="shrink-0" />
                  <span className="truncate">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 pt-5 space-y-4">
        {activeSection === 'about' && (
          <div className="space-y-4">
            <section className="bg-gradient-to-l from-[#1a1017] via-[#101016] to-[#101016] border border-[#FF1744]/20 rounded-2xl p-5 flex flex-col sm:flex-row items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-black/40 border border-white/10 p-1 shrink-0">
                <img
                  src="./app_icon.png"
                  alt="أوتاكو MOD"
                  className="w-full h-full rounded-xl object-cover"
                />
              </div>
              <div className="space-y-1 text-center sm:text-right min-w-0">
                <h2 className="text-lg font-black text-white">أوتاكو MOD - Otaku Hub</h2>
                <p className="text-xs text-neutral-300 leading-relaxed">
                  منصة عربية متكاملة لاستكشاف الأنمي والمانجا، تنظيم قوائم المتابعة، جداول العرض الموسمية، ومجتمع نقاش تفاعلي آمن لعشاق الأوتاكو.
                </p>
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 pt-1 text-[11px] text-neutral-400 font-bold">
                  <span>الإصدار: {APP_VERSION}</span>
                  <span>·</span>
                  <span dir="ltr" className="font-mono">{PACKAGE_ID}</span>
                  <span>·</span>
                  <span>الفئة العمرية: +13</span>
                </div>
              </div>
            </section>

            <section className="bg-[#101016] border border-white/[0.08] rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-2 text-amber-400 font-black text-sm">
                <Scale size={17} />
                <h2>إخلاء المسؤولية ومصادر المحتوى (DMCA)</h2>
              </div>
              <p className="text-xs text-neutral-300 leading-relaxed">
                يعتمد التطبيق على واجهات برمجة قواعد بيانات عامة مفتوحة (مثل AniList وJikan/MyAnimeList) لعرض معلومات الأنمي والمانجا وجداول الإصدار. جميع الروابط أو الإطارات المضمنة للوسائط مصدرها مزودون خارجيون مستقلون ولا يتم استضافة أو تخزين أي ملفات محمية بحقوق نشر على خوادم التطبيق.
              </p>
              <p className="text-xs text-neutral-300 leading-relaxed">
                نحترم حقوق الملكية الفكرية بشكل كامل؛ إذا كنت مالك حقوق وترغب بالإبلاغ عن أي رابط أو محتوى، يرجى مراسلتنا وسيتم التعامل مع الطلب فوراً خلال 24-48 ساعة.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => void handleCopyText(DEVELOPER_EMAIL, 'email')}
                  className="min-h-[42px] px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-black text-white inline-flex items-center gap-2 transition cursor-pointer"
                >
                  <Mail size={14} className="text-[#FF1744]" />
                  <span dir="ltr">{DEVELOPER_EMAIL}</span>
                  {copiedKey === 'email' ? (
                    <span className="text-emerald-400 text-[11px] font-bold flex items-center gap-0.5">
                      <Check size={12} /> تم النسخ
                    </span>
                  ) : (
                    <Copy size={12} className="text-neutral-400" />
                  )}
                </button>
                <a
                  href={`mailto:${DEVELOPER_EMAIL}?subject=${encodeURIComponent('استفسار أو بلاغ حقوق ملكية - أوتاكو MOD')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[42px] px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-neutral-200 inline-flex items-center gap-2 transition"
                >
                  <ExternalLink size={14} />
                  <span>فتح البريد</span>
                </a>
                <button
                  type="button"
                  onClick={() => void openWebPage('/about', 'عن التطبيق والمعلومات الرسمية')}
                  className="min-h-[42px] px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-neutral-300 inline-flex items-center gap-2 transition cursor-pointer"
                >
                  <ExternalLink size={14} />
                  <span>عرض الصفحة على الويب</span>
                </button>
              </div>
            </section>
          </div>
        )}

        {activeSection === 'privacy' && (
          <div className="space-y-4">
            <section className="bg-[#101016] border border-white/[0.08] rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 text-emerald-400 font-black text-sm">
                  <ShieldCheck size={18} />
                  <h2>سياسة الخصوصية</h2>
                </div>
                <button
                  type="button"
                  onClick={() => void openWebPage('/privacy-policy', 'سياسة الخصوصية وأمان البيانات')}
                  className="text-xs font-bold text-sky-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
                >
                  <ExternalLink size={13} />
                  <span>الرابط المباشر للويب</span>
                </button>
              </div>

              <div className="space-y-3 text-xs text-neutral-300 leading-relaxed">
                <div>
                  <h3 className="text-white font-black mb-1">1. البيانات التي نجمعها</h3>
                  <ul className="list-disc pr-5 space-y-1">
                    <li>
                      <strong>معلومات الحساب:</strong> البريد الإلكتروني والاسم المعروض (عند التسجيل بالبريد أو Google) لحفظ ومزامنة قوائمك بين أجهزتك.
                    </li>
                    <li>
                      <strong>بيانات المكتبة والتفاعل:</strong> قوائم المتابعة، المفضلة، التقييمات، التعليقات المجتمعية، وسجل التذاكر الفنية.
                    </li>
                    <li>
                      <strong>محادثات المساعد التفاعلي (اختياري):</strong> تُعالج الرسائل عبر خادمنا الآمن لتوليد الرد الفوري ولا تُستخدم للإعلانات أو التدريب التجاري.
                    </li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-white font-black mb-1">2. التشفير وعدم مشاركة البيانات</h3>
                  <p>
                    تُشفر كافة الاتصالات أثناء النقل عبر HTTPS/TLS باستخدام خدمات Google Firebase الآمنة. لا نبيع بياناتك الشخصية مطلقاً ولا نصل إلى الكاميرا أو الميكروفون أو الموقع الجغرافي أو جهات الاتصال.
                  </p>
                </div>

                <div>
                  <h3 className="text-white font-black mb-1">3. الفئة العمرية (13+)</h3>
                  <p>
                    التطبيق مخصص لمن هم في عمر 13 عاماً فأكثر، ولا نجمع بيانات شخصية من الأطفال دون سن 13 عاماً عن قصد.
                  </p>
                </div>
              </div>
            </section>
          </div>
        )}

        {activeSection === 'terms' && (
          <div className="space-y-4">
            <section className="bg-[#101016] border border-white/[0.08] rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 text-purple-400 font-black text-sm">
                  <FileText size={18} />
                  <h2>اتفاقية الاستخدام والشروط</h2>
                </div>
                <button
                  type="button"
                  onClick={() => void openWebPage('/terms', 'اتفاقية الاستخدام والشروط')}
                  className="text-xs font-bold text-sky-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
                >
                  <ExternalLink size={13} />
                  <span>الرابط المباشر للويب</span>
                </button>
              </div>

              <div className="space-y-3 text-xs text-neutral-300 leading-relaxed">
                <div>
                  <h3 className="text-white font-black mb-1">1. القبول والأهلية</h3>
                  <p>
                    باستخدامك لتطبيق أوتاكو MOD أو إنشاء حساب فيه، فإنك توافق على الالتزام بهذه الاتفاقية وبسياسة الخصوصية، وتقر بأن عمرك 13 عاماً أو أكثر.
                  </p>
                </div>

                <div>
                  <h3 className="text-white font-black mb-1">2. معايير المجتمع والإشراف (UGC)</h3>
                  <ul className="list-disc pr-5 space-y-1">
                    <li>يُمنع نشر أي تعليقات مسيئة، خطاب كراهية، محتوى غير لائق، أو روابط احتيالية ومزعجة (Spam).</li>
                    <li>يمكن لأي مستخدم استخدام زر الإبلاغ على التعليقات أو المراجعات المخالفة، ويتولى المشرفون مراجعتها وإزالتها فوراً وحظر المخالفين عند الضرورة.</li>
                    <li>تُمنح نقاط التفاعل والكوينز الافتراضية داخل التطبيق للاستمتاع المجاني ولا تمثل قيمة مالية حقيقية ولا تُستبدل بنقود.</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-white font-black mb-1">3. الإعلانات الاختيارية</h3>
                  <p>
                    لا يعرض التطبيق إعلانات منبثقة مزعجة أثناء التصفح؛ بل يوفر دعماً اختيارياً داخل قسم «ادعم التطبيق» برغبة المستخدم الصريحة وبزر إغلاق واضح في كل الأوقات.
                  </p>
                </div>
              </div>
            </section>
          </div>
        )}

        {activeSection === 'data_safety' && (
          <div className="space-y-4">
            <section className="bg-[#101016] border border-white/[0.08] rounded-2xl p-5 space-y-4">
              <div className="flex items-center gap-2 text-emerald-400 font-black text-sm">
                <Lock size={18} />
                <h2>ملخص أمان البيانات والتحكم الكامل</h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="bg-[#08080c] border border-white/[0.06] rounded-xl p-3.5 space-y-1.5">
                  <div className="flex items-center gap-1.5 font-black text-emerald-400">
                    <CheckCircle2 size={14} />
                    <span>تشفير أثناء النقل</span>
                  </div>
                  <p className="text-neutral-400 leading-relaxed">
                    كافة الاتصالات محمية بتشفير HTTPS/TLS دون أي اتصال غير مشفر (Cleartext Disabled).
                  </p>
                </div>

                <div className="bg-[#08080c] border border-white/[0.06] rounded-xl p-3.5 space-y-1.5">
                  <div className="flex items-center gap-1.5 font-black text-emerald-400">
                    <UserCheck size={14} />
                    <span>أذونات دنيا محترمة للخصوصية</span>
                  </div>
                  <p className="text-neutral-400 leading-relaxed">
                    لا يطلب التطبيق صلاحية الكاميرا أو الميكروفون أو الوصول الشامل للملفات أو معرض الصور.
                  </p>
                </div>
              </div>

              <div className="bg-rose-500/10 border border-rose-500/25 rounded-2xl p-4 space-y-3">
                <div className="flex items-center gap-2 text-rose-300 font-black text-xs sm:text-sm">
                  <AlertTriangle size={16} className="shrink-0" />
                  <span>حذف الحساب والبيانات نهائياً (متاح في أي وقت)</span>
                </div>
                <p className="text-xs text-neutral-300 leading-relaxed">
                  يمكنك حذف حسابك بالكامل وجميع قوائمك وبياناتك السحابية فوراً من داخل صفحة الإعدادات، أو طلب الحذف عبر الويب والبريد الإلكتروني.
                </p>
                <div className="flex flex-wrap gap-2.5">
                  {onOpenAccountSettings && (
                    <button
                      type="button"
                      onClick={onOpenAccountSettings}
                      className="min-h-[42px] px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-black inline-flex items-center gap-2 transition cursor-pointer"
                    >
                      <Trash2 size={14} />
                      <span>الانتقال لحذف الحساب</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void openWebPage('/account-deletion', 'سياسة وطريقة حذف الحساب والبيانات')}
                    className="min-h-[42px] px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-neutral-200 inline-flex items-center gap-2 transition cursor-pointer"
                  >
                    <ExternalLink size={14} />
                    <span>صفحة تعليمات حذف البيانات</span>
                  </button>
                </div>
              </div>
            </section>
          </div>
        )}
      </main>

      {/* Safe In-App Legal Web Link Preview & External Open Modal */}
      {webPreviewSlug && (
        <ViewportPortal>
          <div
            className="fixed inset-0 z-[100000] bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
            dir="rtl"
            onClick={() => setWebPreviewSlug(null)}
          >
            <div
              className="w-full max-w-2xl bg-[#0e0e14] border border-white/10 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[88dvh]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-4 py-3.5 border-b border-white/[0.08] flex items-center justify-between gap-3">
                <h3 className="text-sm font-black text-white truncate">{webPreviewTitle}</h3>
                <button
                  type="button"
                  onClick={() => setWebPreviewSlug(null)}
                  aria-label="إغلاق"
                  className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-neutral-300 hover:text-white cursor-pointer shrink-0"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="px-4 py-3 bg-[#14141d] border-b border-white/[0.06] flex flex-wrap items-center justify-between gap-2">
                <code
                  dir="ltr"
                  className="text-[11px] font-mono text-sky-300 bg-black/40 border border-white/10 px-2.5 py-1.5 rounded-lg truncate max-w-full flex-1"
                >
                  {activeExternalUrl}
                </code>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => void handleCopyText(activeExternalUrl, 'url')}
                    className="min-h-[36px] px-3 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-black text-white inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    {copiedKey === 'url' ? (
                      <>
                        <Check size={13} className="text-emerald-400" />
                        <span>تم النسخ</span>
                      </>
                    ) : (
                      <>
                        <Copy size={13} />
                        <span>نسخ الرابط</span>
                      </>
                    )}
                  </button>
                  <a
                    href={activeExternalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[36px] px-3 rounded-xl bg-[#FF1744] hover:bg-rose-500 text-xs font-black text-white inline-flex items-center gap-1.5"
                  >
                    <ExternalLink size={13} />
                    <span>فتح في المتصفح</span>
                  </a>
                </div>
              </div>

              <div className="flex-1 min-h-[300px] bg-[#07070b] overflow-hidden">
                {loadingPreview ? (
                  <div className="h-[340px] flex items-center justify-center text-xs font-bold text-neutral-400">
                    جاري تحميل معاينة الصفحة...
                  </div>
                ) : webPreviewHtml ? (
                  <iframe
                    title={webPreviewTitle}
                    srcDoc={webPreviewHtml}
                    sandbox=""
                    className="w-full h-[60dvh] border-0 bg-[#07070b]"
                  />
                ) : (
                  <div className="p-6 text-center space-y-3">
                    <p className="text-xs text-neutral-300 leading-relaxed">
                      يمكنك نسخ الرابط أعلاه لاستخدامه في متصفحك أو في إعدادات متجر Google Play مباشرة.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </ViewportPortal>
      )}
    </div>
  );
}
