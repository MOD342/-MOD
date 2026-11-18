import defaultFirebaseConfig from '../../firebase-applet-config.json';

export interface FirebaseClientConfig {
  projectId: string;
  appId: string;
  apiKey: string;
  authDomain: string;
  firestoreDatabaseId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  measurementId?: string;
  oAuthClientId?: string;
}

const env = ((import.meta as any).env || {}) as Record<string, string | undefined>;

export const firebaseClientConfig: FirebaseClientConfig = {
  projectId: (env.VITE_FIREBASE_PROJECT_ID || defaultFirebaseConfig.projectId || '').trim(),
  appId: (env.VITE_FIREBASE_APP_ID || defaultFirebaseConfig.appId || '').trim(),
  apiKey: (env.VITE_FIREBASE_API_KEY || defaultFirebaseConfig.apiKey || '').trim(),
  authDomain: (env.VITE_FIREBASE_AUTH_DOMAIN || defaultFirebaseConfig.authDomain || '').trim(),
  firestoreDatabaseId: (
    env.VITE_FIREBASE_DATABASE_ID ||
    (defaultFirebaseConfig as any).firestoreDatabaseId ||
    '(default)'
  ).trim(),
  storageBucket: (
    env.VITE_FIREBASE_STORAGE_BUCKET ||
    (defaultFirebaseConfig as any).storageBucket ||
    ''
  ).trim(),
  messagingSenderId: (
    env.VITE_FIREBASE_MESSAGING_SENDER_ID ||
    (defaultFirebaseConfig as any).messagingSenderId ||
    ''
  ).trim(),
  measurementId: (
    env.VITE_FIREBASE_MEASUREMENT_ID ||
    (defaultFirebaseConfig as any).measurementId ||
    ''
  ).trim(),
  oAuthClientId: (
    env.VITE_GOOGLE_CLIENT_ID ||
    (defaultFirebaseConfig as any).oAuthClientId ||
    ''
  ).trim(),
};
