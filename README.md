# أنمي MOD (Otaku Hub) — مشروع مستقل للويب والأندرويد (APK)

مشروع متكامل (React + Vite + Express + Firebase + Capacitor Android) مصمم للعمل بالوضع الهجين المجاني الدائم:
- **الواجهة الأمامية على Vercel** (فتح فوري وسرعة تصفح عالية).
- **الخادم الخلفي على Render أو Hugging Face Spaces** (بث وتحميل وجلب مباشر).
- **تطبيق أندرويد أصلي** بمعرّف حزمة مميز: `com.zoryx`.

---

## 1. المتطلبات الأساسية
- **Node.js 20+**
- لبناء ملف **APK**: **Android Studio** مع **Android SDK** و **JDK 17+**

## 2. التشغيل المحلي
1. تثبيت الاعتمادات:
   ```bash
   npm install
   ```
2. أنشئ ملف `.env` انطلاقاً من `.env.example` وأضف `GEMINI_API_KEY` للخادم.
3. للتطوير:
   ```bash
   npm run dev
   ```
4. للبناء وتشغيل الإنتاج:
   ```bash
   npm run build
   NODE_ENV=production npm start
   ```

---

## 3. النشر المباشر على Cloudflare Workers (مُفعّل افتراضياً على GitHub)
المستودع مهيأ مباشرة بملفي `wrangler.jsonc` و `src/workerEntry.ts` للنشر على **`https://mod.z-mod342.workers.dev/`**:
1. في لوحة تحكم **Cloudflare Workers & Pages** تأكد من:
   - **Build command**: `npm run build`
   - **Deploy command**: `npx wrangler deploy`
2. *(اختياري في Settings > Variables and Secrets)*:
   - `GEMINI_API_KEY`: لتفعيل المحادثة من حافة الشبكة مباشرة عبر Worker.
   - `BACKEND_API_URL`: رابط خادم خلفي على Render أو Hugging Face Spaces إن أردت تمرير طلبات البث والسكرابر عبره (وبدونه يعمل الوضع الهجين تلقائياً).
3. أضف النطاق **`mod.z-mod342.workers.dev`** في **Firebase Console > Authentication > Settings > Authorized domains**.

### (اختياري) تشغيل خادم خلفي منفصل على Render أو Hugging Face Spaces
- **Render**: استخدم ملف `render.yaml` (`npm install && npm run build` ثم `npm start`).
- **Hugging Face Spaces**: استخدم ملف `Dockerfile` (منفذ `7860`).
- بعد النشر، ضع رابط الخادم في متغير `BACKEND_API_URL` داخل Cloudflare Workers ليتكامل تلقائياً مع تطبيق الويب والـ APK.

---

## 4. بناء تطبيق Android APK (Capacitor)
1. ضع رابط الخادم الخلفي في `.env`:
   ```env
   VITE_API_URL=https://رابط-الخادم-الخلفي
   ```
2. تهيئة مشروع أندرويد لأول مرة:
   ```bash
   npm run apk:init
   ```
3. بعد أي تعديل على الواجهة أو `.env`:
   ```bash
   npm run apk:sync
   ```
4. افتح المشروع في Android Studio لبناء الـ APK:
   ```bash
   npm run apk:open
   ```
   ثم اختر **Build > Build Bundle(s) / APK(s) > Build APK(s)**.

---

## 5. التصدير إلى GitHub وبناء النسخة النهائية الموقّعة تلقائياً (APK + AAB)
يتضمن المشروع ملف عمل جاهز على `.github/workflows/android-release.yml` يقوم تلقائياً عند الدفع إلى `main` أو التشغيل اليدوي بـ:
- فحص TypeScript وبناء حزمة الإنتاج (`dist`).
- تهيئة مشروع أندرويد `com.zoryx` وتطبيق الأيقونة الرسمية وإعدادات الأمان والجسر الأصلي و R8 ProGuard.
- بناء وتوقيع النسخة النهائية الجاهزة للنشر بصيغتي **`.apk`** و **`.aab`** (لمتجر Google Play).
- استخراج بصمتي **SHA-1** و **SHA-256** وعرضهما في ملخص المهمة (`Job Summary`) وملف `signing-fingerprint-report.txt`.

### تثبيت ملف التوقيع الدائم والبصمة (موصى به قبل النشر الرسمي):
1. ولّد ملف توقيع رسمي واستخرج البصمات محلياً (لن يتم رفعه إلى Git):
   ```bash
   npm run apk:keystore
   ```
2. انسخ القيم الأربعة المطبوعة وأضفها في GitHub داخل **Settings > Secrets and variables > Actions**:
   - `ANDROID_KEYSTORE_BASE64`
   - `ANDROID_KEYSTORE_PASSWORD`
   - `ANDROID_KEY_ALIAS`
   - `ANDROID_KEY_PASSWORD`
   *(اختياري: أضف `VITE_API_URL` كمتغير/سر لربط الـ APK بخادمك الخلفي مباشرة، و`GOOGLE_SERVICES_JSON_BASE64` إن كنت تستخدم ملف `google-services.json` مخصصاً).*
3. لتفعيل تسجيل دخول Google الأصلي داخل تطبيق الأندرويد، أضف بصمتي **SHA-1** و **SHA-256** في **Firebase Console > Project Settings > Your apps > Android (`com.zoryx`)**.
4. إذا لم تُضف أسرار التوقيع بعد عند أول تصدير إلى GitHub، سيقوم ملف العمل بتوليد شهادة توقيع تلقائية مؤقتة أثناء البناء حتى تحصل على نسخة `.apk` و `.aab` موقّعة وجاهزة للتجربة فوراً دون أي أخطاء.

