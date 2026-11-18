# أنمي MOD (Otaku Hub) — مشروع مستقل للويب والأندرويد (APK)

مشروع متكامل (React + Vite + Express + Firebase + Capacitor Android) جاهز للتشغيل والبناء المستقل خارج أي منصة.

## 1. المتطلبات الأساسية
- **Node.js 20+**
- لبناء ملف **APK**: **Android Studio** مع **Android SDK** و **JDK 17+**

## 2. التشغيل المحلي (تطوير أو إنتاج)
1. تثبيت الاعتمادات:
   ```bash
   npm install
   ```
2. أنشئ ملف `.env` انطلاقاً من `.env.example` وأضف المفاتيح المطلوبة (`GEMINI_API_KEY` للخادم، و`VITE_API_URL` إذا كنت ستبني الواجهة أو الـ APK منفصلاً عن الخادم).
3. للتطوير:
   ```bash
   npm run dev
   ```
4. للبناء وتشغيل الإنتاج على خادم مستقل (VPS / Railway / Render):
   ```bash
   npm run build
   NODE_ENV=production npm start
   ```

## 3. تحويل المشروع إلى تطبيق Android APK (Capacitor)
1. تأكد من ضبط رابط الخادم المنشور في `.env` قبل البناء:
   ```env
   VITE_API_URL=https://your-deployed-backend.com
   ```
   *(ملاحظة: في حال لم تضع `VITE_API_URL` سيعمل التطبيق بالوضع الهجين المباشر عبر AniList/Jikan وFirebase، لكن سيرفرات البث المحمية والتحميل والذكاء الاصطناعي تحتاج رابط خادم Node منشور).*
2. تهيئة مشروع أندرويد لأول مرة:
   ```bash
   npm run apk:init
   ```
3. بعد أي تعديل على الواجهة أو `.env`، حدّث مجلد الأندرويد:
   ```bash
   npm run apk:sync
   ```
4. افتح المشروع في Android Studio لبناء الـ APK:
   ```bash
   npm run apk:open
   ```
   ثم من قائمة Android Studio اختر: **Build > Build Bundle(s) / APK(s) > Build APK(s)**.

## 4. نقل Firebase لحسابك المستقل (اختياري)
- لاستخدام مشروع Firebase خاص بك بدلاً من الإعداد الحالي، املأ متغيرات `VITE_FIREBASE_*` و`FIREBASE_PROJECT_ID` و`FIREBASE_SERVICE_ACCOUNT` في `.env` ثم انشر قواعد `firestore.rules` على مشروعك الجديد عبر Firebase CLI:
  ```bash
  firebase deploy --only firestore:rules
  ```
- فعّل مزودي الدخول المطلوبين في **Firebase Authentication > Sign-in method** (Email/Password وGoogle)، وأضف بصمة **SHA-1** لتطبيق الأندرويد إذا أردت تفعيل Google Sign-In الأصلي داخل APK.
