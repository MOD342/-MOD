import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  memoryLocalCache,
  getFirestore
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

let dbInstance;
const isBrowser = typeof window !== 'undefined';

// Check if running inside a mobile App/WebView (e.g., Cordova, Capacitor, native Android WebView)
const isWebView = isBrowser && (
  window.location.protocol === 'file:' ||
  window.location.protocol === 'capacitor:' ||
  window.location.protocol === 'ionic:' ||
  Boolean((window as any).Capacitor) ||
  Boolean((window as any).cordova) ||
  navigator.userAgent.includes('wv') ||
  (navigator.userAgent.includes('Android') && navigator.userAgent.includes('Version/'))
);

const dbId = ((firebaseConfig as any).firestoreDatabaseId && (firebaseConfig as any).firestoreDatabaseId !== '(default)')
  ? (firebaseConfig as any).firestoreDatabaseId
  : undefined;

const isIframe = isBrowser && (window.self !== window.top);

if (isIframe) {
  try {
    dbInstance = initializeFirestore(app, {
      experimentalForceLongPolling: true,
      localCache: memoryLocalCache()
    }, dbId);
  } catch {
    dbInstance = getFirestore(app, dbId);
  }
} else if (isWebView) {
  // في بيئة APK، نستخدم الكاش الخفيف في الذاكرة (memoryLocalCache) لتجنب ثقل IndexedDB وتجميد شاشة البداية
  try {
    dbInstance = initializeFirestore(app, {
      experimentalAutoDetectLongPolling: true,
      localCache: memoryLocalCache()
    }, dbId);
  } catch {
    dbInstance = getFirestore(app, dbId);
  }
} else if (isBrowser) {
  try {
    dbInstance = initializeFirestore(app, {
      experimentalAutoDetectLongPolling: true,
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager()
      })
    }, dbId);
  } catch {
    try {
      dbInstance = initializeFirestore(app, {
        experimentalAutoDetectLongPolling: true,
        localCache: memoryLocalCache()
      }, dbId);
    } catch {
      dbInstance = getFirestore(app, dbId);
    }
  }
} else {
  dbInstance = getFirestore(app, dbId);
}

export const db = dbInstance;
export const auth = getAuth(app);

