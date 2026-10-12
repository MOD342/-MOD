/**
 * سكربت الإعداد التلقائي لصلاحيات أندرويد (AndroidManifest.xml) لتطبيق أنمي MOD
 * يقوم بحقن جميع أذونات النظام (الإشعارات، الكاميرا، الميكروفون، الصور والفيديوهات، الاهتزاز، والشبكة)
 * تلقائياً في ملف AndroidManifest.xml داخل مجلد android بعد إنشاء مشروع Capacitor.
 */
import fs from 'fs';
import path from 'path';

const manifestPath = path.resolve(process.cwd(), 'android/app/src/main/AndroidManifest.xml');

const REQUIRED_PERMISSIONS = [
  '<!-- أذونات الإنترنت والشبكة والحالة -->',
  '<uses-permission android:name="android.permission.INTERNET" />',
  '<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />',
  '<uses-permission android:name="android.permission.ACCESS_WIFI_STATE" />',
  '<!-- إذن الإشعارات الفورية لنظام Android 13 فما فوق -->',
  '<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />',
  '<!-- أذونات الوسائط والملفات والتخزين (رفع الصور الشخصية، البنرات، وحفظ الكاش) -->',
  '<uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />',
  '<uses-permission android:name="android.permission.READ_MEDIA_VIDEO" />',
  '<uses-permission android:name="android.permission.READ_MEDIA_AUDIO" />',
  '<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />',
  '<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="29" />',
  '<!-- أذونات الميكروفون والكاميرا (البحث الصوتي وتصوير الأفاتار) -->',
  '<uses-permission android:name="android.permission.RECORD_AUDIO" />',
  '<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />',
  '<uses-permission android:name="android.permission.CAMERA" />',
  '<!-- أذونات الاهتزاز ومنع قفل الشاشة أثناء مشاهدة الحلقات -->',
  '<uses-permission android:name="android.permission.VIBRATE" />',
  '<uses-permission android:name="android.permission.WAKE_LOCK" />',
];

function injectAndroidPermissions() {
  if (!fs.existsSync(manifestPath)) {
    console.log('⚠️ لم يتم العثور على مجلد android بعد. قم بتشغيل "npm run apk:init" أولاً ليتم إنشاء مشروع الأندرويد.');
    return;
  }

  let content = fs.readFileSync(manifestPath, 'utf8');

  // إضافة usesCleartextTraffic="true" داخل وسم <application إذا لم يكن موجوداً
  if (!content.includes('android:usesCleartextTraffic')) {
    content = content.replace(
      '<application',
      '<application\n        android:usesCleartextTraffic="true"'
    );
  }

  // فحص وحقن الأذونات التي لم تُضف بعد
  const missingPermissions = REQUIRED_PERMISSIONS.filter((line) => {
    if (line.startsWith('<!--')) return true;
    const match = line.match(/android:name="([^"]+)"/);
    if (!match) return false;
    return !content.includes(match[1]);
  });

  if (missingPermissions.length > 0) {
    const permissionsBlock = '\n    ' + missingPermissions.join('\n    ') + '\n';
    if (content.includes('</manifest>')) {
      content = content.replace('</manifest>', `${permissionsBlock}</manifest>`);
    }
    fs.writeFileSync(manifestPath, content, 'utf8');
    console.log('✅ تم حقن جميع أذونات النظام (الإشعارات، الصور والوسائط، الميكروفون، الكاميرا) في AndroidManifest.xml بنجاح!');
  } else {
    console.log('ℹ️ جميع أذونات AndroidManifest.xml مضافة ومحدثة بالفعل.');
  }
}

injectAndroidPermissions();
