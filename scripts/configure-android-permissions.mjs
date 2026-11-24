/**
 * سكربت الإعداد التلقائي لتطبيق أندرويد (Capacitor Android) لتطبيق أنمي MOD:
 * 1. حقن أذونات النظام ووسوم <queries> (Android 11+ Intent & External Links & Players & Settings).
 * 2. إنشاء network_security_config.xml والسماح بالاتصال الآمن والمباشر.
 * 3. تفعيل rgcfaIncludeGoogle = true في android/variables.gradle لدعم تسجيل دخول Google الأصلي بالنظام.
 * 4. حقن default_web_client_id في strings.xml تلقائياً من firebase-applet-config.json أو .env.
 * 5. تفعيل وضع ملء الشاشة (Edge-to-Edge & Display Cutout shortEdges) في styles.xml.
 * 6. ترقية MainActivity.java لقراءة نتوء الكاميرا (DisplayCutout) وتوفير جسر أذونات وإعادة التوجيه لإعدادات النظام.
 */
import fs from 'fs';
import path from 'path';

const rootDir = process.cwd();
const androidDir = path.resolve(rootDir, 'android');
const androidMainDir = path.join(androidDir, 'app/src/main');
const manifestPath = path.join(androidMainDir, 'AndroidManifest.xml');
const resXmlDir = path.join(androidMainDir, 'res/xml');
const resValuesDir = path.join(androidMainDir, 'res/values');
const networkSecurityPath = path.join(resXmlDir, 'network_security_config.xml');
const stringsXmlPath = path.join(resValuesDir, 'strings.xml');
const stylesXmlPath = path.join(resValuesDir, 'styles.xml');
const variablesGradlePath = path.join(androidDir, 'variables.gradle');

const REQUIRED_PERMISSIONS = [
  '<uses-permission android:name="android.permission.INTERNET" />',
  '<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />',
  '<uses-permission android:name="android.permission.ACCESS_WIFI_STATE" />',
  '<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />',
  '<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />',
  '<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="29" />',
  '<uses-permission android:name="android.permission.VIBRATE" />',
  '<uses-permission android:name="android.permission.WAKE_LOCK" />',
];

const DISALLOWED_PERMISSION_NAMES = [
  'android.permission.CAMERA',
  'android.permission.RECORD_AUDIO',
  'android.permission.MODIFY_AUDIO_SETTINGS',
  'android.permission.READ_MEDIA_IMAGES',
  'android.permission.READ_MEDIA_VIDEO',
  'android.permission.READ_MEDIA_AUDIO',
  'android.permission.MANAGE_EXTERNAL_STORAGE',
];

const ANDROID_QUERIES_BLOCK = `
    <!-- تصاريح فتح الروابط الخارجية وتطبيقات التحميل ومشغلات الفيديو على Android 11+ -->
    <queries>
        <intent>
            <action android:name="android.intent.action.VIEW" />
            <category android:name="android.intent.category.BROWSABLE" />
            <data android:scheme="https" />
        </intent>
        <intent>
            <action android:name="android.intent.action.VIEW" />
            <category android:name="android.intent.category.BROWSABLE" />
            <data android:scheme="http" />
        </intent>
        <intent>
            <action android:name="android.intent.action.VIEW" />
            <data android:mimeType="video/*" />
        </intent>
        <intent>
            <action android:name="android.intent.action.VIEW" />
            <data android:mimeType="application/vnd.apple.mpegurl" />
        </intent>
        <intent>
            <action android:name="android.settings.APPLICATION_DETAILS_SETTINGS" />
        </intent>
        <intent>
            <action android:name="android.settings.APP_NOTIFICATION_SETTINGS" />
        </intent>
        <package android:name="com.dv.adm" />
        <package android:name="com.dv.adm.pay" />
        <package android:name="idm.internet.download.manager" />
        <package android:name="idm.internet.download.manager.plus" />
        <package android:name="idm.internet.download.manager.adm.lite" />
        <package android:name="org.freedownloadmanager.fdm" />
        <package android:name="org.videolan.vlc" />
        <package android:name="com.mxtech.videoplayer.ad" />
        <package android:name="com.mxtech.videoplayer.pro" />
        <package android:name="org.courville.nova" />
        <package android:name="dev.anilbeesetti.nextplayer" />
        <package android:name="is.xyz.mpv" />
        <package android:name="org.xbmc.kodi" />
        <package android:name="video.player.videoplayer" />
        <package android:name="com.android.chrome" />
        <package android:name="com.sec.android.app.sbrowser" />
        <package android:name="org.mozilla.firefox" />
    </queries>
`;

const NETWORK_SECURITY_XML = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="false">
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </base-config>
</network-security-config>
`;

function resolveGoogleWebClientId() {
  if (process.env.VITE_GOOGLE_CLIENT_ID?.trim()) {
    return process.env.VITE_GOOGLE_CLIENT_ID.trim();
  }

  const envPath = path.join(rootDir, '.env');
  if (fs.existsSync(envPath)) {
    const envRaw = fs.readFileSync(envPath, 'utf8');
    const match = envRaw.match(/^VITE_GOOGLE_CLIENT_ID=(.+)$/m);
    if (match?.[1]?.trim()) {
      return match[1].trim().replace(/^["']|["']$/g, '');
    }
  }

  const firebaseConfigPath = path.join(rootDir, 'firebase-applet-config.json');
  if (fs.existsSync(firebaseConfigPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(firebaseConfigPath, 'utf8'));
      if (cfg?.oAuthClientId) return String(cfg.oAuthClientId).trim();
    } catch {}
  }

  return '944497586914-s0birt1ntn5ot52h52e49b0rflc9jscp.apps.googleusercontent.com';
}

function patchAndroidManifest() {
  fs.mkdirSync(resXmlDir, { recursive: true });
  fs.writeFileSync(networkSecurityPath, NETWORK_SECURITY_XML, 'utf8');

  let content = fs.readFileSync(manifestPath, 'utf8');

  if (content.includes('android:usesCleartextTraffic')) {
    content = content.replace(/android:usesCleartextTraffic="(true|false)"/g, 'android:usesCleartextTraffic="false"');
  } else {
    content = content.replace(
      '<application',
      '<application\n        android:usesCleartextTraffic="false"'
    );
  }

  if (content.includes('android:allowBackup')) {
    content = content.replace(/android:allowBackup="(true|false)"/g, 'android:allowBackup="false"');
  } else {
    content = content.replace(
      '<application',
      '<application\n        android:allowBackup="false"'
    );
  }

  content = content.replace(/\s*android:requestLegacyExternalStorage="(true|false)"/g, '');

  for (const permName of DISALLOWED_PERMISSION_NAMES) {
    const escaped = permName.replace(/\./g, '\\.');
    content = content.replace(
      new RegExp(`\\s*<uses-permission[^>]*android:name="${escaped}"[^>]*/?>`, 'g'),
      ''
    );
  }

  if (!content.includes('android:networkSecurityConfig')) {
    content = content.replace(
      '<application',
      '<application\n        android:networkSecurityConfig="@xml/network_security_config"'
    );
  }
  if (!content.includes('android:largeHeap')) {
    content = content.replace(
      '<application',
      '<application\n        android:largeHeap="true"'
    );
  }
  if (!content.includes('android:hardwareAccelerated')) {
    content = content.replace(
      '<application',
      '<application\n        android:hardwareAccelerated="true"'
    );
  }
  if (!content.includes('android:windowSoftInputMode')) {
    content = content.replace(
      '<activity',
      '<activity\n            android:windowSoftInputMode="adjustResize"'
    );
  }

  const missingPermissions = REQUIRED_PERMISSIONS.filter((line) => {
    const match = line.match(/android:name="([^"]+)"/);
    return match ? !content.includes(match[1]) : false;
  });

  if (missingPermissions.length > 0 && content.includes('</manifest>')) {
    const permissionsBlock =
      '\n    <!-- أذونات تطبيق أنمي MOD التلقائية -->\n    ' +
      missingPermissions.join('\n    ') +
      '\n';
    content = content.replace('</manifest>', `${permissionsBlock}</manifest>`);
  }

  const existingQueryPackages = ['com.dv.adm', 'idm.internet.download.manager', 'org.courville.nova'];
  const needsQueriesUpdate = existingQueryPackages.some((pkg) => !content.includes(pkg));
  if (needsQueriesUpdate && content.includes('</manifest>')) {
    content = content.replace(/\s*(?:<!-- تصاريح فتح الروابط الخارجية[^>]*-->\s*)?<queries>[\s\S]*?<\/queries>\s*/g, '\n');
    content = content.replace('</manifest>', `${ANDROID_QUERIES_BLOCK}</manifest>`);
  }

  fs.writeFileSync(manifestPath, content, 'utf8');
  console.log(`✅ AndroidManifest.xml جاهز (largeHeap + hardwareAccelerated + adjustResize + queries + ${missingPermissions.length} إذن جديد).`);
}

function patchVariablesGradle() {
  if (!fs.existsSync(variablesGradlePath)) return;
  let content = fs.readFileSync(variablesGradlePath, 'utf8');
  if (content.includes('rgcfaIncludeGoogle')) {
    content = content.replace(/rgcfaIncludeGoogle\s*=\s*(true|false)/g, 'rgcfaIncludeGoogle = true');
  } else if (content.includes('ext {')) {
    content = content.replace('ext {', 'ext {\n    rgcfaIncludeGoogle = true');
  } else {
    content += '\next {\n    rgcfaIncludeGoogle = true\n}\n';
  }
  fs.writeFileSync(variablesGradlePath, content, 'utf8');
  console.log('✅ android/variables.gradle تم تفعيل rgcfaIncludeGoogle = true.');
}

function patchStringsXml() {
  const clientId = resolveGoogleWebClientId();
  fs.mkdirSync(resValuesDir, { recursive: true });
  if (!fs.existsSync(stringsXmlPath)) {
    const initialStrings = `<?xml version='1.0' encoding='utf-8'?>
<resources>
    <string name="app_name">أنمي MOD</string>
    <string name="title_activity_main">أنمي MOD</string>
    <string name="package_name">com.animemod.otakuhub</string>
    <string name="custom_url_scheme">com.animemod.otakuhub</string>
    <string name="default_web_client_id">${clientId}</string>
</resources>
`;
    fs.writeFileSync(stringsXmlPath, initialStrings, 'utf8');
    console.log('✅ تم إنشاء strings.xml وحقن default_web_client_id بنجاح.');
    return;
  }

  let content = fs.readFileSync(stringsXmlPath, 'utf8');
  if (content.includes('name="default_web_client_id"')) {
    content = content.replace(
      /<string name="default_web_client_id">.*?<\/string>/,
      `<string name="default_web_client_id">${clientId}</string>`
    );
  } else if (content.includes('</resources>')) {
    content = content.replace(
      '</resources>',
      `    <string name="default_web_client_id">${clientId}</string>\n</resources>`
    );
  }
  fs.writeFileSync(stringsXmlPath, content, 'utf8');
  console.log('✅ strings.xml تم تحديثه بـ default_web_client_id بنجاح.');
}

function patchStylesXml() {
  if (fs.existsSync(stylesXmlPath)) {
    let content = fs.readFileSync(stylesXmlPath, 'utf8');
    // إزالة وسم API 28+ من styles.xml العام لمنع أخطاء التوافق على الأجهزة والإصدارات الأقدم، حيث يتم تفعيله بأمان برمجياً + عبر values-v28
    const cleaned = content.replace(
      /\s*<item name="android:windowLayoutInDisplayCutoutMode">.*?<\/item>/g,
      ''
    );

    const baseFullscreenItems = [
      '<item name="android:windowFullscreen">true</item>',
      '<item name="android:statusBarColor">@android:color/transparent</item>',
      '<item name="android:navigationBarColor">@android:color/transparent</item>',
      '<item name="android:windowDrawsSystemBarBackgrounds">true</item>',
    ];

    let updated = cleaned;
    if (updated.includes('name="AppTheme.NoActionBar"') && !updated.includes('android:windowDrawsSystemBarBackgrounds')) {
      updated = updated.replace(
        /(<style name="AppTheme\.NoActionBar"[^>]*>)/,
        `$1\n        ${baseFullscreenItems.join('\n        ')}`
      );
    }

    if (updated !== content) {
      fs.writeFileSync(stylesXmlPath, updated, 'utf8');
    }
  }

  // إنشاء values-v28/styles.xml لدعم نتوء الكاميرا في أندرويد 9+ دون كسر الأجهزة الأقدم
  const resValuesV28Dir = path.join(androidMainDir, 'res/values-v28');
  const stylesV28Path = path.join(resValuesV28Dir, 'styles.xml');
  fs.mkdirSync(resValuesV28Dir, { recursive: true });
  const stylesV28Xml = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="AppTheme.NoActionBar" parent="Theme.AppCompat.NoActionBar">
        <item name="windowActionBar">false</item>
        <item name="windowNoTitle">true</item>
        <item name="android:background">@null</item>
        <item name="android:windowFullscreen">true</item>
        <item name="android:windowLayoutInDisplayCutoutMode">shortEdges</item>
        <item name="android:statusBarColor">@android:color/transparent</item>
        <item name="android:navigationBarColor">@android:color/transparent</item>
        <item name="android:windowDrawsSystemBarBackgrounds">true</item>
    </style>
</resources>
`;
  fs.writeFileSync(stylesV28Path, stylesV28Xml, 'utf8');
  console.log('✅ styles.xml و values-v28/styles.xml جاهزان لملء الشاشة ونتوء الكاميرا بتوافق تام مع جميع الأجهزة.');
}

function findMainActivityJava(dir) {
  if (!fs.existsSync(dir)) return null;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findMainActivityJava(full);
      if (found) return found;
    } else if (entry.name === 'MainActivity.java') {
      return full;
    }
  }
  return null;
}

function patchMainActivityJava() {
  const javaDir = path.join(androidMainDir, 'java');
  const mainActivityPath = findMainActivityJava(javaDir);
  if (!mainActivityPath) {
    console.log('ℹ️ لم يتم العثور على MainActivity.java بعد (سيتم تخطي ترقيته).');
    return;
  }

  const current = fs.readFileSync(mainActivityPath, 'utf8');
  if (current.includes('MOD_NATIVE_BRIDGE_V4')) {
    console.log('ℹ️ MainActivity.java محدّث مسبقاً إلى MOD_NATIVE_BRIDGE_V4.');
    return;
  }

  const pkgMatch = current.match(/^package\s+([^;]+);/m);
  const packageName = pkgMatch?.[1]?.trim() || 'com.animemod.otakuhub';

  const upgradedJava = `package ${packageName};

// MOD_NATIVE_BRIDGE_V4
import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.Settings;
import android.view.View;
import android.view.WindowManager;
import android.webkit.DownloadListener;
import android.webkit.JavascriptInterface;
import android.webkit.URLUtil;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends BridgeActivity {
    private static final int REQ_NOTIF_PERMISSION = 9101;
    private static final int REQ_STORAGE_PERMISSION = 9102;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        try {
            WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                WindowManager.LayoutParams lp = getWindow().getAttributes();
                lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
                getWindow().setAttributes(lp);
            }
        } catch (Throwable ignored) {}
        attachNativeBridgeAndCutoutListener();
    }

    @Override
    public void onResume() {
        super.onResume();
        try {
            View decorView = getWindow().getDecorView();
            if (decorView != null) {
                ViewCompat.requestApplyInsets(decorView);
            }
        } catch (Throwable ignored) {}
    }

    private void attachNativeBridgeAndCutoutListener() {
        try {
            if (getBridge() != null && getBridge().getWebView() != null) {
                WebView webView = getBridge().getWebView();
                webView.setFocusable(true);
                webView.setFocusableInTouchMode(true);
                try {
                    WebSettings settings = webView.getSettings();
                    if (settings != null) {
                        settings.setJavaScriptEnabled(true);
                        settings.setDomStorageEnabled(true);
                        settings.setDatabaseEnabled(true);
                    }
                } catch (Throwable ignored) {}
                webView.addJavascriptInterface(new AndroidNativeBridge(), "AndroidNativeBridge");
                webView.setDownloadListener(new DownloadListener() {
                    @Override
                    public void onDownloadStart(String url, String userAgent, String contentDisposition, String mimetype, long contentLength) {
                        try {
                            if (url == null || url.trim().isEmpty()) return;
                            String trimmed = url.trim();
                            if (trimmed.startsWith("blob:") || trimmed.startsWith("data:")) return;
                            String guessedName = URLUtil.guessFileName(trimmed, contentDisposition, mimetype);
                            if (guessedName == null || guessedName.trim().isEmpty()) {
                                guessedName = "AnimeMOD-Episode.mp4";
                            }
                            final String finalName = guessedName;
                            final String finalMime = (mimetype != null && !mimetype.trim().isEmpty()) ? mimetype : "video/mp4";
                            runOnUiThread(() -> launchDownloadManagerInternal(trimmed, finalName, finalMime));
                        } catch (Throwable ignored) {}
                    }
                });
            }
        } catch (Throwable ignored) {}

        try {
            View decorView = getWindow().getDecorView();
            if (decorView != null) {
                ViewCompat.setOnApplyWindowInsetsListener(decorView, (v, insets) -> {
                    try {
                        Insets cutout = insets.getInsets(WindowInsetsCompat.Type.displayCutout());
                        Insets sysBars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
                        float density = Math.max(1f, getResources().getDisplayMetrics().density);

                        int topDp = Math.round(Math.max(cutout.top, sysBars.top) / density);
                        int bottomDp = Math.round(Math.max(cutout.bottom, sysBars.bottom) / density);
                        int leftDp = Math.round(Math.max(cutout.left, sysBars.left) / density);
                        int rightDp = Math.round(Math.max(cutout.right, sysBars.right) / density);
                        int cutoutTopDp = Math.round(cutout.top / density);

                        pushInsetsToWebView(topDp, bottomDp, leftDp, rightDp, cutoutTopDp);
                    } catch (Throwable ignored) {}
                    return insets;
                });
                ViewCompat.requestApplyInsets(decorView);
            }
        } catch (Throwable ignored) {}
    }

    private void pushInsetsToWebView(int top, int bottom, int left, int right, int cutoutTop) {
        try {
            if (isFinishing() || isDestroyed()) return;
            if (getBridge() == null || getBridge().getWebView() == null) return;
            final WebView webView = getBridge().getWebView();
            final String js = "(function(){try{" +
                "window.__ANDROID_INSETS__={top:" + top + ",bottom:" + bottom + ",left:" + left + ",right:" + right + ",cutoutTop:" + cutoutTop + "};" +
                "var r=document.documentElement.style;" +
                "r.setProperty('--safe-top','" + top + "px');" +
                "r.setProperty('--safe-bottom','" + bottom + "px');" +
                "r.setProperty('--safe-left','" + left + "px');" +
                "r.setProperty('--safe-right','" + right + "px');" +
                "window.dispatchEvent(new Event('android-insets-updated'));" +
                "}catch(e){}})();";
            webView.post(() -> {
                try {
                    if (!isFinishing() && !isDestroyed()) {
                        webView.evaluateJavascript(js, null);
                    }
                } catch (Throwable ignored) {}
            });
        } catch (Throwable ignored) {}
    }

    private boolean safeStartIntent(Intent intent) {
        try {
            if (intent == null || isFinishing() || isDestroyed()) return false;
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
            return true;
        } catch (Throwable ignored) {
            return false;
        }
    }

    private boolean isPackageInstalled(String pkgName) {
        try {
            getPackageManager().getPackageInfo(pkgName, 0);
            return true;
        } catch (Throwable ignored) {
            return false;
        }
    }

    private boolean isAllowedHttpUri(String rawUrl) {
        if (rawUrl == null) return false;
        try {
            Uri uri = Uri.parse(rawUrl.trim());
            String scheme = uri.getScheme();
            return scheme != null && ("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme));
        } catch (Throwable ignored) {
            return false;
        }
    }

    private boolean isAllowedExternalScheme(String rawUrl) {
        if (rawUrl == null) return false;
        try {
            Uri uri = Uri.parse(rawUrl.trim());
            String scheme = uri.getScheme();
            if (scheme == null) return false;
            String s = scheme.toLowerCase();
            return "http".equals(s) || "https".equals(s) || "mailto".equals(s) || "tg".equals(s);
        } catch (Throwable ignored) {
            return false;
        }
    }

    private boolean openUriInExternalBrowser(String url) {
        try {
            if (!isAllowedHttpUri(url)) return false;
            Uri uri = Uri.parse(url.trim());
            Intent baseIntent = new Intent(Intent.ACTION_VIEW, uri);
            baseIntent.addCategory(Intent.CATEGORY_BROWSABLE);
            baseIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

            PackageManager pm = getPackageManager();
            List<ResolveInfo> resolved = pm.queryIntentActivities(baseIntent, PackageManager.MATCH_DEFAULT_ONLY);
            String ownPkg = getPackageName();
            if (resolved != null && !resolved.isEmpty()) {
                for (ResolveInfo info : resolved) {
                    if (info.activityInfo != null && !ownPkg.equals(info.activityInfo.packageName)) {
                        Intent targetIntent = new Intent(Intent.ACTION_VIEW, uri);
                        targetIntent.addCategory(Intent.CATEGORY_BROWSABLE);
                        targetIntent.setPackage(info.activityInfo.packageName);
                        targetIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        if (safeStartIntent(targetIntent)) return true;
                    }
                }
            }
            Intent chooser = Intent.createChooser(baseIntent, "فتح الرابط بواسطة");
            return safeStartIntent(chooser);
        } catch (Throwable ignored) {
            return false;
        }
    }

    private boolean launchExternalPlayerInternal(String url, String title, String mimeType) {
        try {
            if (!isAllowedHttpUri(url)) return false;
            String safeUrl = url.trim();
            String safeMime = (mimeType != null && !mimeType.trim().isEmpty()) ? mimeType.trim() : "video/*";
            String safeTitle = (title != null && !title.trim().isEmpty()) ? title.trim() : "Anime MOD Video";

            Uri uri = Uri.parse(safeUrl);
            Intent videoIntent = new Intent(Intent.ACTION_VIEW);
            videoIntent.setDataAndType(uri, safeMime);
            videoIntent.putExtra("title", safeTitle);
            videoIntent.putExtra("Title", safeTitle);
            videoIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

            PackageManager pm = getPackageManager();
            List<ResolveInfo> videoHandlers = pm.queryIntentActivities(videoIntent, PackageManager.MATCH_DEFAULT_ONLY);
            String ownPkg = getPackageName();
            boolean hasExternalHandler = false;
            if (videoHandlers != null) {
                for (ResolveInfo info : videoHandlers) {
                    if (info.activityInfo != null && !ownPkg.equals(info.activityInfo.packageName)) {
                        hasExternalHandler = true;
                        break;
                    }
                }
            }

            if (hasExternalHandler) {
                Intent chooser = Intent.createChooser(videoIntent, "اختر مشغل الفيديو");
                if (safeStartIntent(chooser)) return true;
            }

            // Fallback: generic video/* MIME if specific MIME (e.g. HLS) didn't match
            if (!"video/*".equals(safeMime)) {
                Intent genericVideoIntent = new Intent(Intent.ACTION_VIEW);
                genericVideoIntent.setDataAndType(uri, "video/*");
                genericVideoIntent.putExtra("title", safeTitle);
                genericVideoIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                List<ResolveInfo> genericHandlers = pm.queryIntentActivities(genericVideoIntent, PackageManager.MATCH_DEFAULT_ONLY);
                if (genericHandlers != null && !genericHandlers.isEmpty()) {
                    Intent chooser = Intent.createChooser(genericVideoIntent, "اختر مشغل الفيديو");
                    if (safeStartIntent(chooser)) return true;
                }
            }

            return openUriInExternalBrowser(safeUrl);
        } catch (Throwable ignored) {
            return false;
        }
    }

    private boolean enqueueSystemDownloadInternal(String url, String filename, String mimeType) {
        try {
            if (!isAllowedHttpUri(url)) return false;
            String safeName = (filename != null && !filename.trim().isEmpty()) ? filename.trim() : "AnimeMOD-Episode.mp4";
            safeName = safeName.replaceAll("[^a-zA-Z0-9._\\\\u0600-\\\\u06FF -]", "_");
            if (!safeName.contains(".")) safeName += ".mp4";

            DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
            if (dm == null) return false;

            DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url.trim()));
            req.setTitle(safeName);
            req.setDescription("جاري التحميل عبر أنمي MOD");
            if (mimeType != null && !mimeType.trim().isEmpty()) {
                req.setMimeType(mimeType.trim());
            }
            req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            req.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, safeName);
            req.allowScanningByMediaScanner();
            dm.enqueue(req);
            return true;
        } catch (Throwable ignored) {
            return false;
        }
    }

    private boolean launchDownloadManagerInternal(String url, String filename, String mimeType) {
        try {
            if (!isAllowedHttpUri(url)) return false;
            String safeUrl = url.trim();
            String safeName = (filename != null && !filename.trim().isEmpty()) ? filename.trim() : "AnimeMOD-Episode.mp4";
            String safeMime = (mimeType != null && !mimeType.trim().isEmpty()) ? mimeType.trim() : "video/mp4";
            Uri uri = Uri.parse(safeUrl);

            String[] knownDownloaders = new String[] {
                "com.dv.adm",
                "com.dv.adm.pay",
                "idm.internet.download.manager",
                "idm.internet.download.manager.plus",
                "idm.internet.download.manager.adm.lite",
                "org.freedownloadmanager.fdm"
            };

            List<Intent> downloaderIntents = new ArrayList<>();
            for (String pkg : knownDownloaders) {
                if (isPackageInstalled(pkg)) {
                    Intent dlIntent = new Intent(Intent.ACTION_VIEW);
                    dlIntent.setDataAndType(uri, safeMime);
                    dlIntent.setPackage(pkg);
                    dlIntent.putExtra("title", safeName);
                    dlIntent.putExtra("filename", safeName);
                    dlIntent.putExtra("android.intent.extra.TITLE", safeName);
                    dlIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    if (dlIntent.resolveActivity(getPackageManager()) != null) {
                        downloaderIntents.add(dlIntent);
                    } else {
                        Intent viewOnly = new Intent(Intent.ACTION_VIEW, uri);
                        viewOnly.setPackage(pkg);
                        viewOnly.putExtra("title", safeName);
                        viewOnly.putExtra("filename", safeName);
                        viewOnly.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        if (viewOnly.resolveActivity(getPackageManager()) != null) {
                            downloaderIntents.add(viewOnly);
                        }
                    }
                }
            }

            if (downloaderIntents.size() == 1) {
                if (safeStartIntent(downloaderIntents.get(0))) return true;
            } else if (downloaderIntents.size() > 1) {
                Intent primary = downloaderIntents.remove(0);
                Intent chooser = Intent.createChooser(primary, "اختر مدير التنزيلات");
                chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, downloaderIntents.toArray(new Intent[0]));
                if (safeStartIntent(chooser)) return true;
            }

            // Fallback to Android system DownloadManager notification queue
            if (enqueueSystemDownloadInternal(safeUrl, safeName, safeMime)) {
                return true;
            }

            // Last fallback: external browser
            return openUriInExternalBrowser(safeUrl);
        } catch (Throwable ignored) {
            return false;
        }
    }

    public class AndroidNativeBridge {
        @JavascriptInterface
        public boolean openExternalPlayer(String url, String title, String mimeType) {
            final boolean[] ok = new boolean[] { false };
            try {
                if (isAllowedHttpUri(url)) {
                    ok[0] = true;
                    runOnUiThread(() -> launchExternalPlayerInternal(url, title, mimeType));
                }
            } catch (Throwable ignored) {}
            return ok[0];
        }

        @JavascriptInterface
        public boolean openDownloadManager(String url, String filename, String mimeType) {
            final boolean[] ok = new boolean[] { false };
            try {
                if (isAllowedHttpUri(url)) {
                    ok[0] = true;
                    runOnUiThread(() -> launchDownloadManagerInternal(url, filename, mimeType));
                }
            } catch (Throwable ignored) {}
            return ok[0];
        }

        @JavascriptInterface
        public boolean enqueueSystemDownload(String url, String filename, String mimeType) {
            return isAllowedHttpUri(url) && enqueueSystemDownloadInternal(url, filename, mimeType);
        }

        @JavascriptInterface
        public boolean openExternalUrl(String rawUrl) {
            try {
                if (rawUrl == null || rawUrl.trim().isEmpty()) return false;
                final String trimmed = rawUrl.trim();
                final String lower = trimmed.toLowerCase();
                if (!isAllowedExternalScheme(trimmed) && !lower.startsWith("intent:")) {
                    return false;
                }
                runOnUiThread(() -> {
                    try {
                        if (lower.startsWith("intent:")) {
                            Intent parsed = Intent.parseUri(trimmed, Intent.URI_INTENT_SCHEME);
                            if (parsed != null) {
                                parsed.addCategory(Intent.CATEGORY_BROWSABLE);
                                parsed.setComponent(null);
                                parsed.setSelector(null);
                                parsed.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                                Uri dataUri = parsed.getData();
                                if (dataUri != null && isAllowedExternalScheme(dataUri.toString())
                                    && parsed.resolveActivity(getPackageManager()) != null
                                    && safeStartIntent(parsed)) {
                                    return;
                                }
                                String fallbackUrl = parsed.getStringExtra("browser_fallback_url");
                                if (isAllowedHttpUri(fallbackUrl)) {
                                    openUriInExternalBrowser(fallbackUrl);
                                    return;
                                }
                            }
                            return;
                        }
                        if (isAllowedHttpUri(trimmed)) {
                            openUriInExternalBrowser(trimmed);
                            return;
                        }
                        if (isAllowedExternalScheme(trimmed)) {
                            Intent generic = new Intent(Intent.ACTION_VIEW, Uri.parse(trimmed));
                            generic.addCategory(Intent.CATEGORY_BROWSABLE);
                            safeStartIntent(generic);
                        }
                    } catch (Throwable ignored) {}
                });
                return true;
            } catch (Throwable ignored) {
                return false;
            }
        }

        @JavascriptInterface
        public void openAppSettings() {
            runOnUiThread(() -> {
                try {
                    Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                    intent.setData(Uri.fromParts("package", getPackageName(), null));
                    safeStartIntent(intent);
                } catch (Throwable ignored) {}
            });
        }

        @JavascriptInterface
        public void openNotificationSettings() {
            runOnUiThread(() -> {
                try {
                    Intent intent;
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
                        intent.putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName());
                    } else {
                        intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                        intent.setData(Uri.fromParts("package", getPackageName(), null));
                    }
                    if (intent.resolveActivity(getPackageManager()) != null) {
                        safeStartIntent(intent);
                    } else {
                        openAppSettings();
                    }
                } catch (Throwable e) {
                    openAppSettings();
                }
            });
        }

        @JavascriptInterface
        public void openStorageSettings() {
            openAppSettings();
        }

        @JavascriptInterface
        public void requestNotificationPermission() {
            runOnUiThread(() -> {
                try {
                    if (Build.VERSION.SDK_INT >= 33) {
                        String perm = "android.permission.POST_NOTIFICATIONS";
                        if (ContextCompat.checkSelfPermission(MainActivity.this, perm) != PackageManager.PERMISSION_GRANTED) {
                            ActivityCompat.requestPermissions(MainActivity.this, new String[]{perm}, REQ_NOTIF_PERMISSION);
                        }
                    }
                } catch (Throwable ignored) {}
            });
        }

        @JavascriptInterface
        public void requestStoragePermissions() {
            runOnUiThread(() -> {
                try {
                    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
                        ActivityCompat.requestPermissions(
                            MainActivity.this,
                            new String[]{
                                "android.permission.READ_EXTERNAL_STORAGE",
                                "android.permission.WRITE_EXTERNAL_STORAGE"
                            },
                            REQ_STORAGE_PERMISSION
                        );
                    }
                } catch (Throwable ignored) {}
            });
        }

        @JavascriptInterface
        public String getPermissionsSnapshot() {
            String notif = "granted";
            String storage = "granted";
            try {
                if (Build.VERSION.SDK_INT >= 33) {
                    notif = ContextCompat.checkSelfPermission(MainActivity.this, "android.permission.POST_NOTIFICATIONS") == PackageManager.PERMISSION_GRANTED
                        ? "granted"
                        : "denied";
                }

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    storage = "granted";
                } else {
                    boolean hasRead = ContextCompat.checkSelfPermission(MainActivity.this, "android.permission.READ_EXTERNAL_STORAGE") == PackageManager.PERMISSION_GRANTED;
                    storage = hasRead ? "granted" : "denied";
                }
            } catch (Throwable ignored) {}

            return "{\\"notifications\\":\\"" + notif + "\\",\\"storage\\":\\"" + storage + "\\"}";
        }
    }
}
`;

  fs.writeFileSync(mainActivityPath, upgradedJava, 'utf8');
  console.log('✅ MainActivity.java تم ترقيته إلى MOD_NATIVE_BRIDGE_V4 (توافق كامل مع سياسات متجر Google Play).');
}

function runAllAndroidPatches() {
  if (!fs.existsSync(manifestPath)) {
    console.log('⚠️ لم يتم العثور على مجلد android بعد. قم بتشغيل "npm run apk:init" أولاً ليتم إنشاء مشروع الأندرويد.');
    return;
  }

  patchAndroidManifest();
  patchVariablesGradle();
  patchStringsXml();
  patchStylesXml();
  patchMainActivityJava();
}

runAllAndroidPatches();
