import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentSingleTabManager,
  persistentMultipleTabManager,
  memoryLocalCache,
  getFirestore,
  doc,
  getDocFromServer,
} from 'firebase/firestore';
import { firebaseClientConfig as firebaseConfig } from './config/firebaseRuntimeConfig';

const app = initializeApp(firebaseConfig);

let dbInstance: ReturnType<typeof getFirestore>;
const isBrowser = typeof window !== 'undefined';

// Check if running inside a mobile App/WebView (e.g., Cordova, Capacitor, native Android WebView)
const isWebView =
  isBrowser &&
  (window.location.protocol === 'file:' ||
    window.location.protocol === 'capacitor:' ||
    window.location.protocol === 'ionic:' ||
    Boolean((window as any).Capacitor) ||
    Boolean((window as any).cordova) ||
    navigator.userAgent.includes('wv') ||
    (navigator.userAgent.includes('Android') && navigator.userAgent.includes('Version/')));

const dbId =
  firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)'
    ? firebaseConfig.firestoreDatabaseId
    : undefined;

const isIframe =
  isBrowser &&
  (() => {
    try {
      return window.self !== window.top;
    } catch {
      return true;
    }
  })();

if (isBrowser) {
  // Inside preview iframes or native WebViews, single-tab persistence avoids cross-frame IndexedDB lease locks.
  // Use auto-detect long polling (never force XHR long polling in browser iframes) so WebChannel connects fast.
  const transportOptions = isWebView
    ? { experimentalForceLongPolling: true }
    : { experimentalAutoDetectLongPolling: true };

  try {
    const localCache = persistentLocalCache({
      tabManager:
        isWebView || isIframe
          ? persistentSingleTabManager({})
          : persistentMultipleTabManager(),
    });
    dbInstance = initializeFirestore(
      app,
      {
        ...transportOptions,
        localCache,
      },
      dbId,
    );
  } catch {
    try {
      dbInstance = initializeFirestore(
        app,
        {
          ...transportOptions,
          localCache: memoryLocalCache(),
        },
        dbId,
      );
    } catch {
      dbInstance = getFirestore(app, dbId);
    }
  }
} else {
  dbInstance = getFirestore(app, dbId);
}

export const db = dbInstance;
export const auth = getAuth(app);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Validate connection to Firestore on boot using a publicly readable document path (non-blocking)
if (isBrowser) {
  (async function testFirestoreConnection() {
    try {
      await getDocFromServer(doc(db, 'globalSettings', 'app'));
    } catch (error) {
      if (error instanceof Error && error.message.includes('the client is offline')) {
        console.warn('Firestore boot check: client is currently offline, relying on local cache.');
      }
    }
  })();
}
