const DEVELOPER_EMAIL = '342.mod@gmail.com';
const APP_NAME = 'أوتاكو MOD - Otaku Hub';
const PACKAGE_ID = 'com.animemod.otakuhub';
const LAST_UPDATED = 'نوفمبر 2026';

function renderLegalShell(title: string, badge: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} | ${APP_NAME}</title>
  <meta name="description" content="${title} لتطبيق ${APP_NAME} - الشفافية وأمان البيانات والامتثال الكامل" />
  <style>
    :root {
      color-scheme: dark;
      --bg: #07070b;
      --card: #111118;
      --border: rgba(255, 255, 255, 0.08);
      --accent: #FF1744;
      --text: #f4f4f5;
      --muted: #a1a1aa;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: system-ui, -apple-system, 'Segoe UI', Tahoma, Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.75;
    }
    .container {
      max-width: 860px;
      margin: 0 auto;
      padding: 24px 16px 64px;
    }
    .header {
      background: linear-gradient(135deg, rgba(255, 23, 68, 0.14), rgba(147, 51, 234, 0.08));
      border: 1px solid var(--border);
      border-radius: 20px;
      padding: 24px;
      margin-bottom: 20px;
    }
    .badge {
      display: inline-block;
      font-size: 12px;
      font-weight: 800;
      color: #ff6b86;
      background: rgba(255, 23, 68, 0.12);
      border: 1px solid rgba(255, 23, 68, 0.25);
      padding: 4px 12px;
      border-radius: 999px;
      margin-bottom: 10px;
    }
    h1 {
      margin: 0 0 8px;
      font-size: 24px;
      font-weight: 900;
      color: #ffffff;
    }
    .meta {
      font-size: 13px;
      color: var(--muted);
    }
    .nav {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 20px;
    }
    .nav a {
      text-decoration: none;
      color: #e4e4e7;
      background: var(--card);
      border: 1px solid var(--border);
      padding: 8px 14px;
      border-radius: 12px;
      font-size: 13px;
      font-weight: 700;
    }
    .nav a:hover {
      border-color: var(--accent);
      color: #ffffff;
    }
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 18px;
      padding: 20px;
      margin-bottom: 16px;
    }
    h2 {
      margin: 0 0 10px;
      font-size: 17px;
      font-weight: 800;
      color: #ffffff;
    }
    p, li {
      font-size: 14px;
      color: #d4d4d8;
      margin: 0 0 10px;
    }
    ul {
      padding-right: 20px;
      margin: 8px 0 0;
    }
    .highlight {
      background: rgba(16, 185, 129, 0.08);
      border: 1px solid rgba(16, 185, 129, 0.25);
      border-radius: 14px;
      padding: 14px 16px;
      margin-top: 10px;
    }
    .danger-box {
      background: rgba(255, 23, 68, 0.08);
      border: 1px solid rgba(255, 23, 68, 0.25);
      border-radius: 14px;
      padding: 14px 16px;
      margin-top: 10px;
    }
    a.link { color: #ff6b86; text-decoration: none; font-weight: 700; }
    a.link:hover { text-decoration: underline; }
    footer {
      text-align: center;
      margin-top: 32px;
      font-size: 12px;
      color: var(--muted);
    }
  </style>
</head>
<body>
  <div class="container">
    <nav class="nav" aria-label="التنقل القانوني">
      <a href="/">العودة للتطبيق</a>
      <a href="/privacy-policy">سياسة الخصوصية</a>
      <a href="/terms">اتفاقية الاستخدام</a>
      <a href="/account-deletion">حذف الحساب والبيانات</a>
      <a href="/about">عن التطبيق</a>
    </nav>
    <header class="header">
      <div class="badge">${badge}</div>
      <h1>${title}</h1>
      <div class="meta">التطبيق: ${APP_NAME} (${PACKAGE_ID}) · آخر تحديث: ${LAST_UPDATED}</div>
    </header>
    ${bodyHtml}
    <footer>
      للتواصل القانوني وطلبات الخصوصية أو حقوق النشر: <a class="link" href="mailto:${DEVELOPER_EMAIL}">${DEVELOPER_EMAIL}</a>
    </footer>
  </div>
</body>
</html>`;
}

export function getPrivacyPolicyHtml(): string {
  return renderLegalShell(
    'سياسة الخصوصية وأمان البيانات',
    'Google Play Data Safety & Privacy',
    `
    <section class="card">
      <h2>1. مقدمة ونطاق التطبيق</h2>
      <p>يلتزم تطبيق <strong>${APP_NAME}</strong> بحماية خصوصية المستخدمين وشفافية معالجة البيانات وفقاً لمتطلبات متجر Google Play ومعايير حماية البيانات.</p>
      <p>يُعرّف التطبيق باسم الحزمة <code>${PACKAGE_ID}</code>، ويمكن التواصل مع مسؤول الخصوصية في أي وقت عبر البريد الإلكتروني: <a class="link" href="mailto:${DEVELOPER_EMAIL}">${DEVELOPER_EMAIL}</a>.</p>
    </section>

    <section class="card">
      <h2>2. البيانات التي يتم جمعها وسبب استخدامها</h2>
      <ul>
        <li><strong>بيانات الحساب والمصادقة:</strong> البريد الإلكتروني، الاسم المعروض، والصورة الشخصية (اختيارياً عبر Google Sign-In أو البريد الإلكتروني عبر Firebase Authentication) لإنشاء الحساب ومزامنة مكتبتك.</li>
        <li><strong>نشاط المستخدم داخل التطبيق:</strong> قوائم الأنمي والمانجا المحفوظة، التقييمات، التعليقات، النقاط، وسجلات تذاكر الدعم الفني لعرضها ومزامنتها بين أجهزتك.</li>
        <li><strong>محادثات المساعد التفاعلي (اختياري):</strong> عند استخدامك قسم «مود (MOD)»، يتم إرسال رسالتك إلى خادمنا الآمن لتوليد الرد دون استخدامها في الإعلانات أو بيعها لأي طرف ثالث.</li>
        <li><strong>تخزين الجهاز المحلي (Local Storage):</strong> حفظ تفضيلات المظهر (ليلي/نهاري/AMOLED) وسجل التنزيلات غير المتصلة محلياً على جهازك.</li>
      </ul>
      <div class="highlight">
        <strong>التزام صريح:</strong> نحن لا نبيع بياناتك الشخصية ولا نشاركها مع وسطاء البيانات (Data Brokers)، ولا نجمع بيانات الموقع الجغرافي الدقيق أو سجل المكالمات أو جهات الاتصال أو الكاميرا أو الميكروفون.
      </div>
    </section>

    <section class="card">
      <h2>3. الأذونات المطلوبة على Android</h2>
      <ul>
        <li><strong>الإنترنت وحالة الشبكة:</strong> لجلب البيانات ومزامنة الحساب وتحديث الكتالوج.</li>
        <li><strong>الإشعارات (POST_NOTIFICATIONS - اختياري):</strong> لتنبيهك بالردود وتحديثات الحلقات المفضلة بناءً على موافقتك الصريحة.</li>
        <li><strong>التنزيل والتخزين:</strong> يستخدم التطبيق مسار التنزيلات القياسي في النظام (DownloadManager / Scoped Storage) ولا يطلب صلاحية الوصول الكامل لكافة ملفات الجهاز أو معرض الصور.</li>
      </ul>
    </section>

    <section class="card">
      <h2>4. التشفير، الاحتفاظ بالبيانات، وحقوق الحذف</h2>
      <p>يتم نقل جميع البيانات عبر بروتوكولات مشفرة بالكامل (HTTPS / TLS) بين التطبيق والخوادم السحابية (Google Firebase).</p>
      <p>يحق لك تعديل بياناتك أو ضبط إعدادات الخصوصية أو حذف حسابك نهائياً في أي وقت من داخل التطبيق أو عبر صفحة <a class="link" href="/account-deletion">طلب حذف الحساب والبيانات</a>.</p>
    </section>

    <section class="card">
      <h2>5. الفئة العمرية وخصوصية الأطفال</h2>
      <p>التطبيق موجه للمستخدمين بعمر <strong>13 عاماً فأكثر</strong>، ولا نستهدف جمع بيانات من الأطفال دون سن 13 عاماً عن قصد.</p>
    </section>
    `,
  );
}

export function getTermsOfServiceHtml(): string {
  return renderLegalShell(
    'اتفاقية الاستخدام والشروط',
    'Terms of Service & User Agreement',
    `
    <section class="card">
      <h2>1. قبول الشروط</h2>
      <p>باستخدامك أو تسجيلك في تطبيق <strong>${APP_NAME}</strong>، فإنك توافق على الالتزام بهذه الاتفاقية وبسياسة الخصوصية المعتمدة لدينا. إذا لم توافق على أي بند، يرجى التوقف عن استخدام التطبيق.</p>
    </section>

    <section class="card">
      <h2>2. قواعد السلوك والمحتوى المجتمعي (UGC)</h2>
      <p>يوفر التطبيق مساحة للمناقشات والتعليقات والتوصيات بين محبي الأنمي والمانجا. يُحظر تماماً:</p>
      <ul>
        <li>نشر محتوى مسيء، عنيف، إباحي، أو يحرض على الكراهية أو التنمر.</li>
        <li>انتحال شخصية الإدارة أو الأعضاء الآخرين أو نشر روابط ضارة واحتيالية.</li>
        <li>إرسال رسائل مزعجة (Spam) أو محاولة التلاعب بنظام النقاط والمسابقات.</li>
      </ul>
      <p>تتوفر داخل التطبيق أداة <strong>الإبلاغ المباشر</strong> عن أي تعليق أو محتوى مخالف، ويحق لفريق الإشراف حذف المحتوى المخالف أو تعليق/حظر الحسابات المخالفة فوراً.</p>
    </section>

    <section class="card">
      <h2>3. طبيعة الخدمة ومصادر البيانات وحقوق الملكية الفكرية (DMCA)</h2>
      <p>يعمل التطبيق كمنصة فهرسة ومتابعة ومجتمع نقاش لعشاق الأنمي والمانجا، مع عرض معلومات عامة من قواعد بيانات مفتوحة (مثل AniList وJikan/MyAnimeList).</p>
      <p>أي روابط خارجية أو إطارات مضمنة تعود لمزودين خارجيين مستقلين ولا يتم تخزين ملفات فيديو أو حقوق ملكية على خوادمنا الخاصة. إذا كنت مالك حقوق نشر وترى وجود أي محتوى يتعارض مع حقوقك، يرجى مراسلتنا فوراً على <a class="link" href="mailto:${DEVELOPER_EMAIL}">${DEVELOPER_EMAIL}</a> وسنستجيب لطلب الإزالة خلال 24-48 ساعة.</p>
    </section>

    <section class="card">
      <h2>4. إخلاء المسؤولية والتعديلات</h2>
      <p>تُقدّم الخدمة «كما هي» مع السعي الدائم لتحديثها وتطويرها. يجوز لنا تحديث اتفاقية الاستخدام عند الضرورة مع إشعار المستخدمين داخل التطبيق.</p>
    </section>
    `,
  );
}

export function getAccountDeletionHtml(): string {
  return renderLegalShell(
    'سياسة وطريقة حذف الحساب والبيانات نهائياً',
    'Google Play Account Deletion Policy',
    `
    <section class="card">
      <h2>1. الحذف الفوري من داخل التطبيق (موصى به)</h2>
      <p>يمكنك حذف حسابك وجميع بياناتك المرتبطة في تطبيق <strong>${APP_NAME}</strong> فوراً دون الحاجة للتواصل معنا عبر الخطوات التالية:</p>
      <ul>
        <li>افتح التطبيق وسجّل الدخول بحسابك.</li>
        <li>انتقل إلى تبويب <strong>المزيد</strong> ⟵ <strong>الإعدادات</strong>.</li>
        <li>انزل إلى قسم <strong>البيانات والجلسة (منطقة الخطر)</strong> واضغط على زر <strong>حذف الحساب نهائياً</strong>.</li>
        <li>أكّد هويتك (بكلمة المرور أو حساب Google) ليتم تنفيذ الحذف فوراً.</li>
      </ul>
      <div class="danger-box">
        <strong>تنبيه:</strong> عملية الحذف نهائية ولا يمكن التراجع عنها؛ سيتم مسح حسابك من نظام المصادقة وقواعد البيانات السحابية فوراً.
      </div>
    </section>

    <section class="card">
      <h2>2. طلب حذف الحساب عبر البريد الإلكتروني (من خارج التطبيق)</h2>
      <p>إذا قمت بإلغاء تثبيت التطبيق أو تعذر عليك الوصول لهاتفك، يمكنك طلب حذف حسابك بإرسال رسالة من البريد المسجل لديك إلى:</p>
      <p><strong>البريد الرسمي:</strong> <a class="link" href="mailto:${DEVELOPER_EMAIL}?subject=طلب%20حذف%20حساب%20أنمي%20MOD">${DEVELOPER_EMAIL}</a></p>
      <p>يرجى كتابة «طلب حذف حساب» مع توضيح البريد الإلكتروني أو المعرّف المرتبط بالحساب. تتم معالجة طلبات البريد خلال مدة أقصاها <strong>7 أيام عمل</strong>.</p>
    </section>

    <section class="card">
      <h2>3. تفاصيل البيانات التي يتم حذفها</h2>
      <ul>
        <li>سجل المصادقة (Firebase Auth UID والبريد الإلكتروني).</li>
        <li>بيانات الملف الشخصي (@Username، الاسم المعروض، النقاط، الكوينز، المقتنيات، والإعدادات).</li>
        <li>كافة قوائم الأنمي والمانجا الخاصة بك، المفضلات، التنبيهات الشخصية، وحجز المعرّف.</li>
        <li>بيانات التخزين المؤقت المحفوظة محلياً عند إتمام الحذف من التطبيق.</li>
      </ul>
      <p>قد تظل المساهمات النصية المجهولة الهوية في النقاشات العامة أو سجلات الإبلاغ الأمني اللازمة لمنع إساءة الاستخدام معزولة دون ارتباط ببياناتك التعريفية الشخصية عند الاقتضاء القانوني أو التنظيمي.</p>
    </section>
    `,
  );
}

export function getAboutAppHtml(): string {
  return renderLegalShell(
    'عن التطبيق والمعلومات الرسمية',
    'About Application',
    `
    <section class="card">
      <h2>ما هو تطبيق ${APP_NAME}؟</h2>
      <p><strong>${APP_NAME}</strong> هو تطبيق ومنصة عربية متكاملة لعشاق الأنمي والمانجا؛ يتيح لك اكتشاف أحدث المواسم وجداول العرض، تنظيم قوائم المتابعة الخاصة بك، المشاركة في مجتمع النقاش والتوصيات، وخوض تحديات المعرفة الأوتاكو.</p>
    </section>

    <section class="card">
      <h2>المواصفات والتوافق</h2>
      <ul>
        <li><strong>اسم التطبيق:</strong> ${APP_NAME}</li>
        <li><strong>معرّف الحزمة (Android):</strong> <code>${PACKAGE_ID}</code></li>
        <li><strong>التصنيف العمري:</strong> 13+ (Teen)</li>
        <li><strong>التواصل والدعم الفني:</strong> <a class="link" href="mailto:${DEVELOPER_EMAIL}">${DEVELOPER_EMAIL}</a></li>
      </ul>
    </section>

    <section class="card">
      <h2>الالتزام بالشفافية</h2>
      <p>للاطلاع على كافة الضوابط القانونية وطريقة حماية بياناتك، يرجى مراجعة <a class="link" href="/privacy-policy">سياسة الخصوصية</a> و<a class="link" href="/terms">اتفاقية الاستخدام</a>.</p>
    </section>
    `,
  );
}
