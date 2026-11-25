import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { 
  User, 
  onAuthStateChanged, 
  signInWithPopup, 
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider, 
  signInWithCredential,
  signOut as firebaseSignOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  updateEmail,
  verifyBeforeUpdateEmail,
  updatePassword,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  EmailAuthProvider,
  updateProfile,
  deleteUser
} from 'firebase/auth';
import { auth, db } from '../firebase';
import { doc, getDoc, setDoc, serverTimestamp, updateDoc, onSnapshot, collection, getDocs, deleteDoc } from 'firebase/firestore';
import { updateDailyStreak } from '../services/gamificationService';
import { moderationService, RoleLevel, isStaffEmail } from '../services/moderationService';
import { notificationsService } from '../services/notificationsService';
import { listService } from '../services/listService';
import { clientCache } from '../utils/clientCache';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { firebaseClientConfig as firebaseConfig } from '../config/firebaseRuntimeConfig';
import AuthModal from '../components/AuthModal';

export type PlatformOS = 'android' | 'ios' | 'windows' | 'macos' | 'linux' | 'unknown';
export type RuntimeHost = 'apk_webview' | 'ios_standalone' | 'windows_app' | 'pwa_standalone' | 'iframe_sandbox' | 'mobile_browser' | 'desktop_browser';
export type GoogleAuthStrategy = 'native_bridge_or_redirect' | 'ios_redirect_or_popup' | 'desktop_popup_with_redirect_fallback' | 'gsi_onetap_or_popup' | 'mobile_popup_then_redirect';

export interface DetectedRuntimeEnvironment {
  os: PlatformOS;
  osLabelAr: string;
  host: RuntimeHost;
  hostLabelAr: string;
  isInstalledApp: boolean;
  isAPKOrWebView: boolean;
  isInIframe: boolean;
  strategy: GoogleAuthStrategy;
  strategyLabelAr: string;
}

export function detectRuntimeEnvironment(): DetectedRuntimeEnvironment {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {
      os: 'unknown',
      osLabelAr: 'النظام القياسي',
      host: 'desktop_browser',
      hostLabelAr: 'متصفح الويب',
      isInstalledApp: false,
      isAPKOrWebView: false,
      isInIframe: false,
      strategy: 'desktop_popup_with_redirect_fallback',
      strategyLabelAr: 'نافذة Google المنبثقة الآمنة'
    };
  }

  const ua = (navigator.userAgent || navigator.vendor || (window as any).opera || '').toLowerCase();
  const platform = ((navigator as any).userAgentData?.platform || navigator.platform || '').toLowerCase();
  const protocol = window.location.protocol;
  const hostname = window.location.hostname;

  // 1. Detect Operating System (Android, iOS/iPhone/iPad, Windows, macOS, Linux)
  const isIOS = /iphone|ipad|ipod/.test(ua) || (platform.includes('mac') && navigator.maxTouchPoints > 1);
  const isAndroid = /android/.test(ua);
  const isWindows = /win/.test(platform) || /windows nt/.test(ua);
  const isMac = !isIOS && (/mac/.test(platform) || /macintosh/.test(ua));
  const isLinux = !isAndroid && (/linux/.test(platform) || /linux/.test(ua));

  let os: PlatformOS = 'unknown';
  let osLabelAr = 'نظام غير محدد';
  if (isAndroid) {
    os = 'android';
    osLabelAr = 'نظام أندرويد (Android)';
  } else if (isIOS) {
    os = 'ios';
    osLabelAr = 'نظام آيفون / آيباد (iOS)';
  } else if (isWindows) {
    os = 'windows';
    osLabelAr = 'نظام ويندوز (Windows)';
  } else if (isMac) {
    os = 'macos';
    osLabelAr = 'نظام ماك (macOS)';
  } else if (isLinux) {
    os = 'linux';
    osLabelAr = 'نظام لينكس (Linux)';
  }

  // 2. Detect Iframe
  let isInIframe = false;
  try {
    isInIframe = window.self !== window.top;
  } catch {
    isInIframe = true;
  }

  // 3. Detect Native APK / WebView / Capacitor / Cordova / Standalone PWA / Windows App
  const isCapacitorOrCordova = !!(
    (window as any).Capacitor ||
    (window as any).cordova ||
    (window as any).AndroidInterface ||
    (window as any).ReactNativeWebView ||
    protocol === 'capacitor:' ||
    protocol === 'ionic:' ||
    protocol === 'file:' ||
    (isAndroid && hostname === 'localhost')
  );

  const isAndroidWebView = isAndroid && (
    /; wv\)/.test(ua) ||
    /version\/\d+\.\d+.*chrome\/\d+/.test(ua) && !/chrome\/\d+.*mobile safari/.test(ua) ||
    ua.includes('webview') ||
    ua.includes('wv') ||
    isCapacitorOrCordova
  );

  const isIOSWebView = isIOS && (
    (!ua.includes('safari') && (ua.includes('applewebkit') || isCapacitorOrCordova)) ||
    (window.navigator as any).standalone === true
  );

  const isWindowsDesktopApp = isWindows && (
    ua.includes('electron') ||
    ua.includes('webview2') ||
    ua.includes('edg/') && window.matchMedia?.('(display-mode: standalone)').matches ||
    Boolean((window as any).chrome?.webview)
  );

  const isStandalonePWA = Boolean(
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.matchMedia?.('(display-mode: window-controls-overlay)').matches ||
    window.matchMedia?.('(display-mode: fullscreen)').matches ||
    (window.navigator as any).standalone === true
  );

  const isAPKOrWebView = isAndroidWebView || isCapacitorOrCordova;
  const isInstalledApp = isAPKOrWebView || isIOSWebView || isWindowsDesktopApp || isStandalonePWA;

  // 4. Determine Host Type & Optimal Google Sign-In Strategy
  let host: RuntimeHost = 'desktop_browser';
  let hostLabelAr = 'متصفح سطح المكتب';
  let strategy: GoogleAuthStrategy = 'gsi_onetap_or_popup';
  let strategyLabelAr = 'الاتصال المباشر عبر Google One Tap أو النافذة المنبثقة';

  if (isAPKOrWebView) {
    host = 'apk_webview';
    hostLabelAr = 'تطبيق APK مثبت (Android App)';
    strategy = 'native_bridge_or_redirect';
    strategyLabelAr = 'مزامنة حساب Google بالنظام / التحويل المباشر للتطبيق (APK Auth)';
  } else if (isIOS && (isIOSWebView || isStandalonePWA)) {
    host = 'ios_standalone';
    hostLabelAr = 'تطبيق آيفون مثبت (iOS App)';
    strategy = 'ios_redirect_or_popup';
    strategyLabelAr = 'مصادقة نظام iOS المباشرة عبر جلسة Google الآمنة';
  } else if (isWindowsDesktopApp || (isWindows && isStandalonePWA)) {
    host = 'windows_app';
    hostLabelAr = 'برنامج ويندوز مثبت (Windows App)';
    strategy = 'desktop_popup_with_redirect_fallback';
    strategyLabelAr = 'نافذة مصادقة برنامج ويندوز المستقلة مع التحويل التلقائي';
  } else if (isStandalonePWA) {
    host = 'pwa_standalone';
    hostLabelAr = `تطبيق مثبت (${osLabelAr})`;
    strategy = isAndroid || isIOS ? 'mobile_popup_then_redirect' : 'desktop_popup_with_redirect_fallback';
    strategyLabelAr = 'جلسة مصادقة التطبيق المثبت المباشرة';
  } else if (isInIframe) {
    host = 'iframe_sandbox';
    hostLabelAr = `نافذة معاينة داخل المتصفح (${osLabelAr})`;
    strategy = 'desktop_popup_with_redirect_fallback';
    strategyLabelAr = 'نافذة Google المنبثقة المستقلة (خارج الإطار)';
  } else if (isAndroid || isIOS) {
    host = 'mobile_browser';
    hostLabelAr = `متصفح الهاتف (${osLabelAr})`;
    strategy = 'mobile_popup_then_redirect';
    strategyLabelAr = 'بوابة Google السريعة للهواتف (Popup / Redirect)';
  } else {
    host = 'desktop_browser';
    hostLabelAr = `متصفح الويب (${osLabelAr})`;
    strategy = 'gsi_onetap_or_popup';
    strategyLabelAr = 'نافذة Google الفورية للمتصفح';
  }

  return {
    os,
    osLabelAr,
    host,
    hostLabelAr,
    isInstalledApp,
    isAPKOrWebView,
    isInIframe,
    strategy,
    strategyLabelAr
  };
}

export interface AppUser {
  id: string;
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  emailVerified: boolean;
  providerIds?: string[];
}

interface AuthContextType {
  user: AppUser | null;
  userData: any | null;
  userRole: RoleLevel;
  loading: boolean;
  banInfo: { isBanned: boolean; reason?: string } | null;
  runtimeEnv: DetectedRuntimeEnvironment;
  signIn: (initialMode?: 'login' | 'register' | 'forgot') => Promise<void>;
  signInWithGoogleAdaptive: () => Promise<void>;
  signOut: () => Promise<void>;
  logout: () => Promise<void>;
  sendVerificationEmail: () => Promise<{ success: boolean; message: string }>;
  refreshUserVerification: () => Promise<boolean>;
  changeUserEmail: (newEmail: string, currentPassword?: string) => Promise<{ success: boolean; message: string }>;
  changeUserPassword: (currentPassword: string, newPassword: string) => Promise<{ success: boolean; message: string }>;
  sendPasswordReset: (email?: string) => Promise<{ success: boolean; message: string }>;
  deleteUserAccount: (currentPassword?: string) => Promise<{ success: boolean; message: string }>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userData: null,
  userRole: 'user',
  loading: true,
  banInfo: null,
  runtimeEnv: detectRuntimeEnvironment(),
  signIn: async () => {},
  signInWithGoogleAdaptive: async () => {},
  signOut: async () => {},
  logout: async () => {},
  sendVerificationEmail: async () => ({ success: false, message: '' }),
  refreshUserVerification: async () => false,
  changeUserEmail: async () => ({ success: false, message: '' }),
  changeUserPassword: async () => ({ success: false, message: '' }),
  sendPasswordReset: async () => ({ success: false, message: '' }),
  deleteUserAccount: async () => ({ success: false, message: '' }),
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{children: React.ReactNode}> = ({ children }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [userData, setUserData] = useState<any | null>(null);
  const [userRole, setUserRole] = useState<RoleLevel>(() => isStaffEmail(auth.currentUser?.email) ? 'owner' : 'user');
  const [banInfo, setBanInfo] = useState<{ isBanned: boolean; reason?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [runtimeEnv, setRuntimeEnv] = useState<DetectedRuntimeEnvironment>(() => detectRuntimeEnvironment());

  // Auth Modal States
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authConfirmPassword, setAuthConfirmPassword] = useState('');
  const [authDisplayName, setAuthDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authSuccess, setAuthSuccess] = useState('');
  const [authModalLoading, setAuthModalLoading] = useState(false);


  useEffect(() => {
    const detected = detectRuntimeEnvironment();
    setRuntimeEnv(detected);
  }, []);

  // Native/System-level Google Sign In and One Tap helper (Google Identity Services)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const initGsi = () => {
      const clientId = (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID || (firebaseConfig as any).oAuthClientId;
      if (!clientId) return;

      let inFrame = false;
      try {
        inFrame = window.self !== window.top;
      } catch {
        inFrame = true;
      }
      if (inFrame || runtimeEnv.isAPKOrWebView) {
        return;
      }
      
      if (!(window as any).google?.accounts?.id) {
        return;
      }

      console.log("Initializing Google Identity Services with Client ID:", clientId);
      
      try {
        (window as any).google.accounts.id.initialize({
          client_id: clientId,
          callback: async (response: any) => {
            setAuthModalLoading(true);
            setAuthError('');
            setAuthSuccess('');
            try {
              console.log("Google system account credential received.");
              const credential = GoogleAuthProvider.credential(response.credential);
              const userCredential = await signInWithCredential(auth, credential);
              if (userCredential.user) {
                setAuthSuccess(`✓ تم تسجيل دخولك بنجاح عبر حساب Google بالنظام: ${userCredential.user.displayName || 'أوتاكو'}!`);
                setTimeout(() => {
                  setIsAuthModalOpen(false);
                  resetAuthForm();
                }, 1200);
              }
            } catch (err: any) {
              console.warn("Firebase GSI signin fallback:", err);
            } finally {
              setAuthModalLoading(false);
            }
          },
          auto_select: false,
          cancel_on_tap_outside: true,
          use_fedcm: false
        });

        // Trigger One Tap floating prompt if auth modal is opened
        if (isAuthModalOpen && authMode === 'login') {
          (window as any).google.accounts.id.prompt(() => {});
        }
      } catch (err) {
        console.warn("Error setting up Google Identity Services:", err);
      }
    };

    if (!isAuthModalOpen) return;

    let checkAttempts = 0;
    const interval = setInterval(() => {
      if ((window as any).google?.accounts?.id) {
        initGsi();
        clearInterval(interval);
      } else {
        checkAttempts++;
        if (checkAttempts > 20) {
          clearInterval(interval);
        }
      }
    }, 250);

    return () => clearInterval(interval);
  }, [isAuthModalOpen, authMode, runtimeEnv.isAPKOrWebView]);

  const resetAuthForm = () => {
    setAuthEmail('');
    setAuthPassword('');
    setAuthConfirmPassword('');
    setAuthDisplayName('');
    setAuthError('');
    setAuthSuccess('');
    setShowPassword(false);
  };

  // Listen for Google Redirect authentication and deep-linking URLs
  useEffect(() => {
    // 1. Handle Firebase Auth Redirect results
    setAuthModalLoading(true);
    getRedirectResult(auth)
      .then((result) => {
        if (result && result.user) {
          setAuthSuccess(`أهلاً بك مجدداً ${result.user.displayName || 'يا صديقي'}! تم تسجيل الدخول بنجاح عبر حساب Google.`);
          setIsAuthModalOpen(false);
        }
      })
      .catch((error: any) => {
        console.warn("Getting redirect result skipped:", error?.code || error?.message);
      })
      .finally(() => {
        setAuthModalLoading(false);
      });

    // 2. Custom deep linking intent parsing (e.g., scheme and intent listeners)
    const handleDeepLink = (url: string) => {
      try {
        const parsedUrl = new URL(url);
        // If there's an action or custom callback in the deep link parameters
        const token = parsedUrl.searchParams.get('token');
        const mode = parsedUrl.searchParams.get('mode');
        if (token && mode === 'auth') {
          console.log("Deep link auth parameters captured:", token);
          // Can handle manual auth or tokens if needed
        }
      } catch (err) {
        console.warn("Parsing deep link failed:", err);
      }
    };

    // If initial window state contains custom launch patterns
    if (typeof window !== 'undefined' && window.location.href) {
      handleDeepLink(window.location.href);
    }

    // Capture standard popstate
    const onPopState = () => {
      handleDeepLink(window.location.href);
    };
    window.addEventListener('popstate', onPopState);

    return () => {
      window.removeEventListener('popstate', onPopState);
    };
  }, []);

  const prevUidRef = useRef<string | null>(null);

  const clearPrivateMemberCaches = (previousUid?: string | null) => {
    listService.clearInMemoryCaches();
    notificationsService.clearUserCache(previousUid || undefined);
    clientCache.clearUserPrivateCaches();
  };

  useEffect(() => {
    let unsubSnapshot: (() => void) | null = null;
    let unsubBan: (() => void) | null = null;
    
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      const nextUid = u?.uid || null;
      if (prevUidRef.current && prevUidRef.current !== nextUid) {
        clearPrivateMemberCaches(prevUidRef.current);
      }
      prevUidRef.current = nextUid;

      if (u) {
        setUser({
          id: u.uid,
          uid: u.uid,
          email: u.email,
          displayName: u.displayName,
          photoURL: u.photoURL,
          emailVerified: u.emailVerified,
          providerIds: u.providerData?.map(p => p.providerId) || []
        });
        if (isStaffEmail(u.email)) {
          setUserRole('owner');
        }
      } else {
        setUser(null);
      }
      
      if (unsubSnapshot) {
        unsubSnapshot();
        unsubSnapshot = null;
      }
      if (unsubBan) {
        unsubBan();
        unsubBan = null;
      }
      
      if (u) {
        // Enforce real-time ban checking (permanent owners cannot be locked out)
        const banRef = doc(db, 'bannedUsers', u.uid);
        unsubBan = onSnapshot(banRef, (banSnap) => {
          if (banSnap.exists() && !isStaffEmail(u.email)) {
            setBanInfo({ isBanned: true, reason: banSnap.data()?.reason || 'مخالفة قوانين المنصة ودليله السلوكي.' });
          } else {
            setBanInfo(null);
          }
        }, (error) => {
          console.warn("Banned checking snapshot error:", error);
        });

        // Ensure user profile exists
        const userRef = doc(db, 'users', u.uid);
        try {
          const snap = await getDoc(userRef);
          if (!snap.exists()) {
              // Auto-generate unique username based on email or name
              const emailPrefix = u.email?.split('@')[0] || '';
              const cleanEmailPrefix = emailPrefix.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
              const cleanDisplayName = (u.displayName || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
              let baseUsername = cleanEmailPrefix || cleanDisplayName || 'otaku';
              if (baseUsername.length < 3) {
                baseUsername = 'otaku_' + Math.random().toString(36).substring(2, 7);
              }
              
              let finalUsername = baseUsername;
              let attempts = 0;
              let nameExists = true;
              while (nameExists && attempts < 10) {
                const checkRef = doc(db, 'usernames', finalUsername);
                const checkSnap = await getDoc(checkRef);
                if (checkSnap.exists()) {
                  // Username taken, append random sequence or logic
                  finalUsername = baseUsername + Math.floor(Math.random() * 900 + 100);
                  attempts++;
                } else {
                  nameExists = false;
                }
              }
              
              // Map the username in database
              await setDoc(doc(db, 'usernames', finalUsername), { id: u.uid }).catch(console.error);

              const newData = {
                id: u.uid,
                username: finalUsername,
                displayName: u.displayName || u.email?.split('@')[0] || 'أوتاكو الرائع',
                email: u.email || '',
                photoURL: u.photoURL || '',
                role: 'user',
                createdAt: serverTimestamp(),
                xp: 0,
                level: 1,
                modPoints: 0,
                streakDays: 0,
                likesReceived: 0,
                commentsCount: 0,
                recommendationsAccepted: 0,
                aiGamesPoints: 0,
                ratingsCount: 0,
                chatMessagesCount: 0,
                coins: 0,
                purchasedItems: [],
                lastActiveDate: new Date().toISOString().split('T')[0]
              };
              await setDoc(userRef, newData);
          } else {
              let data = snap.data() || {};
              const updates: any = {};
              if (!data.displayName && u.displayName) updates.displayName = u.displayName;
              if (!data.email && u.email) updates.email = u.email;
              if (!data.photoURL && u.photoURL) updates.photoURL = u.photoURL;
              if (!data.id) updates.id = u.uid;
              if (data.coins < 0) updates.coins = 0;
              
              // Ensure legacy users have a username
              if (!data.username) {
                const emailPrefix = u.email?.split('@')[0] || '';
                const cleanEmailPrefix = emailPrefix.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
                let finalUsername = cleanEmailPrefix || 'otaku_' + u.uid.substring(0, 5);
                if (finalUsername.length < 3) finalUsername = 'otaku_' + u.uid.substring(0, 5);
                const checkRef = doc(db, 'usernames', finalUsername);
                const checkSnap = await getDoc(checkRef);
                if (!checkSnap.exists()) {
                  await setDoc(checkRef, { id: u.uid }).catch(console.error);
                  updates.username = finalUsername;
                }
              }
              
              if (Object.keys(updates).length > 0) {
                 await updateDoc(userRef, updates).catch(console.error);
              }
              // We can trigger streak update in background
              updateDailyStreak(u.uid).then(() => {});
          }
          
          unsubSnapshot = onSnapshot(userRef, (docSnap) => {
             if (docSnap.exists()) {
               const fullData = { id: docSnap.id, ...docSnap.data() };
               setUserData(fullData);
             }
          }, (error) => {
             console.warn("User data snapshot error (offline or permissions):", error);
          });
          
          const roleData = await moderationService.getCurrentUserRole(u);
          setUserRole(isStaffEmail(u.email) ? 'owner' : roleData);

          // Migrate any guest local lists/entries saved before login into Firestore cloud storage
          import('../services/listService')
            .then(({ listService }) => listService.migrateGuestDataToCloud(u.uid))
            .catch(() => {});

          try {
            if (typeof localStorage !== 'undefined') {
              localStorage.removeItem('fallback_active_session');
            }
          } catch {}
          
          setLoading(false);
        } catch (error) {
           console.warn("Failed to setup user profile:", error);
           const emailPrefix = u.email?.split('@')[0] || '';
           const cleanEmailPrefix = emailPrefix.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
           const baseUsername = cleanEmailPrefix || 'otaku_' + u.uid.substring(0, 5);
           const fallbackData = {
             id: u.uid,
             username: baseUsername,
             displayName: u.displayName || u.email?.split('@')[0] || 'أوتاكو الرائع',
             email: u.email || '',
             photoURL: u.photoURL || '',
             role: isStaffEmail(u.email) ? 'owner' : 'user',
             createdAt: new Date().toISOString(),
             xp: 0,
             level: 1,
             modPoints: 0,
             streakDays: 0,
             likesReceived: 0,
             commentsCount: 0,
             recommendationsAccepted: 0,
             aiGamesPoints: 0,
             ratingsCount: 0,
             chatMessagesCount: 0,
             coins: 0,
             purchasedItems: [],
             lastActiveDate: new Date().toISOString().split('T')[0]
           };
           setUserData(fallbackData);
           setUserRole(isStaffEmail(u.email) ? 'owner' : fallbackData.role);
           setLoading(false);
        }
      } else {
        let restoredFallback: any = null;
        try {
          if (typeof localStorage !== 'undefined') {
            const rawSession = localStorage.getItem('fallback_active_session');
            if (rawSession) {
              const parsed = JSON.parse(rawSession);
              if (parsed && parsed.uid && parsed.displayName) {
                restoredFallback = parsed;
              }
            }
          }
        } catch {}

        if (restoredFallback) {
          await loadFallbackSession(restoredFallback);
          setBanInfo(null);
          setLoading(false);
        } else {
          setUserData(null);
          setUserRole('user');
          setBanInfo(null);
          setLoading(false);
        }
      }
    });

    return () => {
      unsubscribe();
      if (unsubSnapshot) unsubSnapshot();
      if (unsubBan) unsubBan();
    };
  }, []);

  const loadFallbackSession = async (fallbackAccount: { uid: string; email: string; displayName: string; photoURL: string }) => {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('fallback_active_session', JSON.stringify(fallbackAccount));
      }
    } catch {}
    setUser({
      id: fallbackAccount.uid,
      uid: fallbackAccount.uid,
      email: fallbackAccount.email,
      displayName: fallbackAccount.displayName,
      photoURL: fallbackAccount.photoURL,
      emailVerified: true,
      providerIds: ['custom']
    });
    const fallbackUserData = {
      id: fallbackAccount.uid,
      username: (fallbackAccount.email.split('@')[0] || 'otaku_hero').toLowerCase().replace(/[^a-z0-9_]/g, ''),
      displayName: fallbackAccount.displayName,
      email: fallbackAccount.email,
      photoURL: fallbackAccount.photoURL,
      role: isStaffEmail(fallbackAccount.email) ? 'owner' : 'user',
      createdAt: new Date().toISOString(),
      xp: 0,
      level: 1,
      modPoints: 0,
      streakDays: 0,
      likesReceived: 0,
      commentsCount: 0,
      recommendationsAccepted: 0,
      aiGamesPoints: 0,
      ratingsCount: 0,
      chatMessagesCount: 0,
      coins: 0,
      purchasedItems: [],
      lastActiveDate: new Date().toISOString().split('T')[0]
    };
    setUserData(fallbackUserData);
    setUserRole(isStaffEmail(fallbackAccount.email) ? 'owner' : 'user');
  };

  const signIn = async (initialMode: 'login' | 'register' | 'forgot' = 'login') => {
    const safeMode = initialMode === 'register' || initialMode === 'forgot' ? initialMode : 'login';
    setAuthMode(safeMode);
    setAuthError('');
    setAuthSuccess('');
    setIsAuthModalOpen(true);
  };

  const signOut = async () => {
    const prevUid = user?.id || auth.currentUser?.uid || null;
    try {
      localStorage.removeItem('fallback_active_session');
    } catch (e) {}
    if (Capacitor.isNativePlatform()) {
      await FirebaseAuthentication.signOut().catch(() => {});
    }
    await firebaseSignOut(auth);
    clearPrivateMemberCaches(prevUid);
    setUser(null);
    setUserData(null);
    setUserRole('user');
  };

  const logout = async () => {
    const prevUid = user?.id || auth.currentUser?.uid || null;
    try {
      localStorage.removeItem('fallback_active_session');
    } catch (e) {}
    if (Capacitor.isNativePlatform()) {
      await FirebaseAuthentication.signOut().catch(() => {});
    }
    await firebaseSignOut(auth);
    clearPrivateMemberCaches(prevUid);
    setUser(null);
    setUserData(null);
    setUserRole('user');
  };

  const sendVerificationEmail = async (): Promise<{ success: boolean; message: string }> => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      return { success: false, message: 'يجب تسجيل الدخول أولاً لإرسال رسالة التفعيل.' };
    }
    if (currentUser.emailVerified) {
      return { success: true, message: 'بريدك الإلكتروني مؤكد ومفعّل بالفعل!' };
    }
    try {
      auth.languageCode = 'ar';
      await sendEmailVerification(currentUser);
      return {
        success: true,
        message: `تم إرسال رابط التأكيد إلى (${currentUser.email}). يرجى تفقد صندوق الوارد أو الرسائل غير المرغوب فيها (Spam) ثم الضغط على زر "تحقق من حالة التأكيد".`
      };
    } catch (err: any) {
      console.warn('sendEmailVerification error:', err);
      if (err.code === 'auth/too-many-requests') {
        return {
          success: false,
          message: 'تم إرسال عدة طلبات مؤخراً. يرجى الانتظار قليلاً أو تفقد بريدك الإلكتروني السابق.'
        };
      }
      return {
        success: false,
        message: 'تعذر إرسال رسالة التفعيل حالياً: ' + (err.message || 'خطأ غير معروف')
      };
    }
  };

  const refreshUserVerification = async (): Promise<boolean> => {
    const currentUser = auth.currentUser;
    if (!currentUser) return false;
    try {
      await currentUser.reload();
      const updated = auth.currentUser;
      if (updated) {
        setUser({
          id: updated.uid,
          uid: updated.uid,
          email: updated.email,
          displayName: updated.displayName,
          photoURL: updated.photoURL,
          emailVerified: updated.emailVerified,
          providerIds: updated.providerData?.map(p => p.providerId) || []
        });
        if (updated.email && userData?.email !== updated.email) {
          await updateDoc(doc(db, 'users', updated.uid), { email: updated.email }).catch(() => {});
        }
        return updated.emailVerified;
      }
      return false;
    } catch (err) {
      console.warn('refreshUserVerification error:', err);
      return currentUser.emailVerified;
    }
  };

  const reauthenticateCurrentUser = async (currentPassword?: string) => {
    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error('لا يوجد مستخدم مسجل حالياً.');
    const hasPasswordProvider = currentUser.providerData.some(p => p.providerId === 'password');
    if (hasPasswordProvider && currentUser.email && currentPassword) {
      const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
      await reauthenticateWithCredential(currentUser, credential);
    } else if (currentUser.providerData.some(p => p.providerId === 'google.com')) {
      const provider = new GoogleAuthProvider();
      await reauthenticateWithPopup(currentUser, provider);
    } else if (currentUser.email && currentPassword) {
      const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
      await reauthenticateWithCredential(currentUser, credential);
    }
  };

  const changeUserEmail = async (newEmail: string, currentPassword?: string): Promise<{ success: boolean; message: string }> => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      return { success: false, message: 'يجب تسجيل الدخول أولاً لتغيير البريد الإلكتروني.' };
    }
    const cleanEmail = newEmail.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      return { success: false, message: 'يرجى إدخال بريد إلكتروني صحيح.' };
    }
    if (cleanEmail === currentUser.email?.toLowerCase()) {
      return { success: false, message: 'البريد الجديد مطابق لبريدك الإلكتروني الحالي.' };
    }

    try {
      auth.languageCode = 'ar';
      if (currentPassword) {
        await reauthenticateCurrentUser(currentPassword);
      }

      try {
        await updateEmail(currentUser, cleanEmail);
        await updateDoc(doc(db, 'users', currentUser.uid), { email: cleanEmail }).catch(() => {});
        try {
          await sendEmailVerification(currentUser);
        } catch {}
        await refreshUserVerification();
        return {
          success: true,
          message: `تم تحديث بريدك الإلكتروني بنجاح إلى (${cleanEmail}) وإرسال رابط التأكيد للبريد الجديد!`
        };
      } catch (updateErr: any) {
        if (updateErr.code === 'auth/operation-not-allowed') {
          await verifyBeforeUpdateEmail(currentUser, cleanEmail);
          return {
            success: true,
            message: `تم إرسال رابط تأكيد نقل البريد إلى (${cleanEmail})! بمجرد الضغط على الرابط في بريدك الجديد سيتغير البريد تلقائياً.`
          };
        }
        throw updateErr;
      }
    } catch (err: any) {
      console.warn('changeUserEmail error:', err);
      if (err.code === 'auth/requires-recent-login') {
        return {
          success: false,
          message: 'لأسباب أمنية، يرجى إدخال كلمة المرور الحالية بدقة لتأكيد هويتك قبل تغيير البريد.'
        };
      }
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password') {
        return {
          success: false,
          message: 'كلمة المرور الحالية غير صحيحة. يرجى التأكد منها والمحاولة مجدداً.'
        };
      }
      if (err.code === 'auth/email-already-in-use') {
        return {
          success: false,
          message: 'هذا البريد الإلكتروني مستخدم بالفعل في حساب آخر.'
        };
      }
      if (err.code === 'auth/invalid-email') {
        return {
          success: false,
          message: 'صيغة البريد الإلكتروني الجديد غير صالحة.'
        };
      }
      return {
        success: false,
        message: 'تعذر تغيير البريد الإلكتروني: ' + (err.message || 'خطأ غير معروف')
      };
    }
  };

  const changeUserPassword = async (currentPassword: string, newPassword: string): Promise<{ success: boolean; message: string }> => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      return { success: false, message: 'يجب تسجيل الدخول أولاً لتغيير كلمة المرور.' };
    }
    if (!newPassword || newPassword.length < 6) {
      return { success: false, message: 'يجب أن تتكون كلمة المرور الجديدة من 6 خانات على الأقل.' };
    }

    try {
      if (currentPassword) {
        await reauthenticateCurrentUser(currentPassword);
      }
      await updatePassword(currentUser, newPassword);
      return {
        success: true,
        message: 'تم تغيير كلمة المرور الخاصة بحسابك بنجاح! ✨'
      };
    } catch (err: any) {
      console.warn('changeUserPassword error:', err);
      if (err.code === 'auth/requires-recent-login') {
        return {
          success: false,
          message: 'يرجى كتابة كلمة المرور الحالية أولاً لتأكيد هويتك وتحديث كلمة المرور.'
        };
      }
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password') {
        return {
          success: false,
          message: 'كلمة المرور الحالية غير صحيحة.'
        };
      }
      if (err.code === 'auth/weak-password') {
        return {
          success: false,
          message: 'كلمة المرور الجديدة ضعيفة جداً، يرجى اختيار كلمة مرور أقوى (6 أحرف أو أرقام على الأقل).'
        };
      }
      return {
        success: false,
        message: 'تعذر تحديث كلمة المرور: ' + (err.message || 'خطأ غير معروف')
      };
    }
  };

  const sendPasswordReset = async (targetEmail?: string): Promise<{ success: boolean; message: string }> => {
    const emailToReset = (targetEmail || auth.currentUser?.email || '').trim();
    if (!emailToReset) {
      return { success: false, message: 'يرجى إدخال البريد الإلكتروني لإرسال رابط إعادة تعيين كلمة المرور.' };
    }
    try {
      auth.languageCode = 'ar';
      await sendPasswordResetEmail(auth, emailToReset);
      return {
        success: true,
        message: `تم إرسال رابط استعادة وتغيير كلمة المرور إلى البريد (${emailToReset}) بنجاح!`
      };
    } catch (err: any) {
      console.warn('sendPasswordReset error:', err);
      if (err.code === 'auth/user-not-found') {
        return { success: false, message: 'لا يوجد حساب مسجل بهذا البريد الإلكتروني.' };
      }
      if (err.code === 'auth/invalid-email') {
        return { success: false, message: 'صيغة البريد الإلكتروني غير صحيحة.' };
      }
      return { success: false, message: 'تعذر إرسال رابط استعادة كلمة المرور حالياً.' };
    }
  };

  const deleteUserAccount = async (currentPassword?: string): Promise<{ success: boolean; message: string }> => {
    const activeUid = user?.id || auth.currentUser?.uid || null;
    if (!activeUid) {
      return { success: false, message: 'يجب تسجيل الدخول أولاً لحذف الحساب.' };
    }

    // Handle local-only fallback guest accounts cleanly
    if (activeUid.startsWith('otaku_guest_') || !auth.currentUser) {
      try {
        localStorage.removeItem('fallback_active_session');
        localStorage.removeItem('fallback_otaku_accounts_v1');
      } catch {}
      clearPrivateMemberCaches(activeUid);
      setUser(null);
      setUserData(null);
      setUserRole('user');
      return { success: true, message: 'تم حذف بيانات الحساب المحلي بنجاح.' };
    }

    const currentUser = auth.currentUser;
    const hasPasswordProvider = currentUser.providerData.some((p) => p.providerId === 'password');
    const hasGoogleProvider = currentUser.providerData.some((p) => p.providerId === 'google.com');

    try {
      // 1. Re-authenticate BEFORE deleting any Firestore data to avoid partial deletions
      if (hasPasswordProvider) {
        if (!currentPassword) {
          return {
            success: false,
            message: 'يرجى إدخال كلمة المرور الحالية لتأكيد ملكية الحساب قبل الحذف النهائي.',
          };
        }
        await reauthenticateCurrentUser(currentPassword);
      } else if (hasGoogleProvider && !Capacitor.isNativePlatform()) {
        await reauthenticateCurrentUser();
      }

      // 2. Delete user subcollections cleanly
      const subcollections = ['customLists', 'animeEntries', 'mangaEntries', 'tierList', 'notifications'];
      for (const sub of subcollections) {
        try {
          const snap = await getDocs(collection(db, 'users', currentUser.uid, sub));
          await Promise.all(snap.docs.map((d) => deleteDoc(d.ref).catch(() => {})));
        } catch {}
      }

      // 3. Delete username reservation & primary user profile document
      if (userData?.username) {
        await deleteDoc(doc(db, 'usernames', String(userData.username))).catch(() => {});
      }
      await deleteDoc(doc(db, 'users', currentUser.uid));

      // 4. Permanently delete Firebase Auth user
      await deleteUser(currentUser);

      // 5. Purge local device caches & reset state
      try {
        localStorage.removeItem('fallback_active_session');
      } catch {}
      clearPrivateMemberCaches(currentUser.uid);
      if (Capacitor.isNativePlatform()) {
        await FirebaseAuthentication.signOut().catch(() => {});
      }
      setUser(null);
      setUserData(null);
      setUserRole('user');

      return { success: true, message: 'تم حذف حسابك وجميع بياناتك نهائياً بنجاح.' };
    } catch (err: any) {
      console.warn('deleteUserAccount error:', err);
      if (err?.code === 'auth/wrong-password' || err?.code === 'auth/invalid-credential') {
        return { success: false, message: 'كلمة المرور غير صحيحة، لم يتم حذف الحساب.' };
      }
      if (err?.code === 'auth/requires-recent-login') {
        return {
          success: false,
          message: 'لأسباب أمنية، يرجى تسجيل الخروج ثم إعادة الدخول مجدداً وبعدها تأكيد حذف الحساب.',
        };
      }
      if (err?.code === 'auth/popup-closed-by-user') {
        return { success: false, message: 'تم إلغاء التحقق عبر Google، لم يتم حذف الحساب.' };
      }
      return {
        success: false,
        message: 'تعذر إتمام حذف الحساب حالياً، يرجى المحاولة مجدداً.',
      };
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthSuccess('');
    if (!authEmail.trim() || !authPassword) {
      setAuthError('يرجى ملء جميع الحقول المطلوبة.');
      return;
    }
    setAuthModalLoading(true);
    try {
      await signInWithEmailAndPassword(auth, authEmail.trim(), authPassword);
      if (isStaffEmail(authEmail.trim())) {
        setUserRole('owner');
      }
      setIsAuthModalOpen(false);
      resetAuthForm();
    } catch (err: any) {
      console.warn("Login Error Details:", err);
      if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
        try {
          // محاولة إنشاء الحساب تلقائياً في حال لم يكن موجوداً لضمان تجربة دخول فورية بدون أخطاء
          const userCredential = await createUserWithEmailAndPassword(auth, authEmail.trim(), authPassword);
          if (userCredential.user) {
            if (isStaffEmail(authEmail.trim())) {
              setUserRole('owner');
            }
            await updateProfile(userCredential.user, {
              displayName: authEmail.split('@')[0] || 'أوتاكو الرائع'
            });
            setIsAuthModalOpen(false);
            resetAuthForm();
            return;
          }
        } catch (regErr: any) {
          setAuthError('البريد الإلكتروني أو كلمة المرور غير صحيحة، أو الحساب غير مسجل بعد. يرجى التأكد من البيانات.');
        }
      } else if (err.code === 'auth/operation-not-allowed') {
        setAuthError('عذراً، خيار تسجيل الدخول بالبريد الإلكتروني (Email/Password) مغلق في إعدادات مشروعك على Firebase. كمالك للتطبيق: يرجى الانتقال إلى Firebase Console ➔ Authentication ➔ Sign-in method وقم بتفعيل خيار "Email/Password" ثم احفظ الإعدادات لتتمكن من تسجيل الدخول بـ APK.');
      } else {
        setAuthError('فشل تسجيل الدخول: ' + (err.message || err));
      }
    } finally {
      setAuthModalLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthSuccess('');
    if (!authEmail.trim() || !authPassword || !authConfirmPassword || !authDisplayName.trim()) {
      setAuthError('يرجى ملء جميع الحقول المطلوبة.');
      return;
    }
    if (authPassword.length < 6) {
      setAuthError('يجب أن تتكون كلمة المرور من 6 خانات على الأقل.');
      return;
    }
    if (authPassword !== authConfirmPassword) {
      setAuthError('كلمات المرور غير متطابقة.');
      return;
    }
    setAuthModalLoading(true);
    try {
      auth.languageCode = 'ar';
      const userCredential = await createUserWithEmailAndPassword(auth, authEmail.trim(), authPassword);
      if (userCredential.user) {
        const chosenName = authDisplayName.trim();
        await updateProfile(userCredential.user, {
          displayName: chosenName
        });
        await updateDoc(doc(db, 'users', userCredential.user.uid), {
          displayName: chosenName
        }).catch(() => {});
        try {
          await sendEmailVerification(userCredential.user);
        } catch (verifyErr) {
          console.warn('Initial verification email error:', verifyErr);
        }
      }
      setIsAuthModalOpen(false);
      resetAuthForm();
    } catch (err: any) {
      console.warn("Register Error Details:", err);
      if (err.code === 'auth/operation-not-allowed') {
        setAuthError('عذراً، خيار تسجيل الدخول بالبريد الإلكتروني (Email/Password) غير مفعّل في منصة Firebase للتطبيق. كمالك للتطبيق: توجه إلى Firebase Console ➔ Authentication ➔ Sign-in Method وفعل خيار "Email/Password" ليتمكن المستخدمون من التسجيل عبر الهواتف.');
      } else if (err.code === 'auth/email-already-in-use') {
        setAuthError('هذا البريد الإلكتروني مسجل بالفعل لصالح حساب آخر.');
      } else if (err.code === 'auth/invalid-email') {
        setAuthError('صيغة البريد الإلكتروني غير صالحة.');
      } else {
        setAuthError(err.message || 'حدث خطأ أثناء إنشاء الحساب.');
      }
    } finally {
      setAuthModalLoading(false);
    }
  };

  const handleInstantOtakuLogin = async () => {
    setAuthError('');
    setAuthSuccess('');
    setAuthModalLoading(true);
    const randomNum = Math.floor(10000 + Math.random() * 90000);
    const guestEmail = `otaku_${randomNum}@animemod.app`;
    const guestPass = `Otaku#${randomNum}Mod!`;
    const guestName = `أوتاكو #${randomNum}`;
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, guestEmail, guestPass);
      if (userCredential.user) {
        await updateProfile(userCredential.user, {
          displayName: guestName
        });
        setAuthSuccess('✓ تم الدخول الفوري بنجاح إلى عالم أوتاكو MOD!');
        setTimeout(() => {
          setIsAuthModalOpen(false);
          resetAuthForm();
        }, 600);
      }
    } catch (err: any) {
      console.warn("Instant Otaku Login fallback activated:", err?.code || err?.message);
      const fallbackAccount = {
        uid: `otaku_guest_${randomNum}`,
        email: guestEmail,
        displayName: guestName,
        photoURL: `https://api.dicebear.com/7.x/adventurer/svg?seed=Otaku${randomNum}`
      };
      await loadFallbackSession(fallbackAccount);
      setIsAuthModalOpen(false);
      resetAuthForm();
    } finally {
      setAuthModalLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthSuccess('');
    if (!authEmail.trim()) {
      setAuthError('يرجى كتابة البريد الإلكتروني أولاً.');
      return;
    }
    setAuthModalLoading(true);
    try {
      await sendPasswordResetEmail(auth, authEmail.trim());
      setAuthSuccess('تم إرسال رابط استعادة الحساب إلى بريدك الإلكتروني بنجاح!');
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/user-not-found') {
        setAuthError('لا يوجد حساب مسجل بهذا البريد الإلكتروني.');
      } else {
        setAuthError('فشل إرسال البريد الإلكتروني الخاص بالاستعادة.');
      }
    } finally {
      setAuthModalLoading(false);
    }
  };

  const signInWithGoogleAdaptive = async () => {
    setAuthError('');
    setAuthSuccess('');

    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    auth.languageCode = 'ar';

    setAuthModalLoading(true);
    try {
      // 1. في تطبيق الأندرويد المثبت (Capacitor APK): استخدام @capacitor-firebase/authentication لعرض حسابات Google بالنظام مباشرة
      if (Capacitor.isNativePlatform()) {
        const isCancelMessage = (msg: string) => {
          const lower = msg.toLowerCase();
          return (
            lower.includes('cancel') ||
            lower.includes('aborted') ||
            lower.includes('dismissed') ||
            lower.includes('12501')
          );
        };

        let nativeResult: any = null;
        try {
          nativeResult = await FirebaseAuthentication.signInWithGoogle({
            useCredentialManager: true,
          });
        } catch (credErr: any) {
          const credMsg = String(credErr?.message || credErr?.code || '');
          if (isCancelMessage(credMsg)) {
            return;
          }
          // Fallback to classic Google Play Services Android System Account Picker
          try {
            nativeResult = await FirebaseAuthentication.signInWithGoogle({
              useCredentialManager: false,
            });
          } catch (legacyErr: any) {
            const legacyMsg = String(legacyErr?.message || legacyErr?.code || '');
            if (isCancelMessage(legacyMsg)) {
              return;
            }
            if (legacyMsg.includes('10') || legacyMsg.toLowerCase().includes('developer_error')) {
              setAuthError('تعذر التحقق من بصمة التطبيق (SHA-1) في Firebase. أضف بصمة SHA-1 لحزمة com.zoryx داخل إعدادات تطبيق Android في Firebase Console.');
              return;
            }
            setAuthError(`تعذر الاتصال بحسابات Google في النظام (${legacyMsg || 'خطأ Play Services'}). يمكنك استخدام الدخول بالبريد أو الدخول الفوري.`);
            return;
          }
        }

        const idToken = nativeResult?.credential?.idToken;
        const accessToken = nativeResult?.credential?.accessToken;
        if (idToken || accessToken) {
          const cred = GoogleAuthProvider.credential(idToken || undefined, accessToken || undefined);
          await signInWithCredential(auth, cred);
          setIsAuthModalOpen(false);
          resetAuthForm();
          return;
        }
        setAuthError('لم يتم استلام رمز المصادقة من حساب Google بالنظام. تأكد من وجود حساب Google نشط على الجهاز وإضافة SHA-1 في Firebase.');
        return;
      }

      // 2. المتصفح العادي (Web): استخدام نافذة Google المنبثقة مع تحويل آمن فقط في الويب
      try {
        await signInWithPopup(auth, provider);
        setIsAuthModalOpen(false);
        resetAuthForm();
        return;
      } catch (popupErr: any) {
        if (popupErr?.code === 'auth/popup-closed-by-user') {
          return;
        }
        if (
          popupErr?.code === 'auth/popup-blocked' ||
          popupErr?.code === 'auth/cancelled-popup-request' ||
          popupErr?.code === 'auth/operation-not-supported-in-this-environment'
        ) {
          await signInWithRedirect(auth, provider);
          return;
        }
        throw popupErr;
      }
    } catch (error: any) {
      if (error?.code !== 'auth/popup-closed-by-user') {
        if (error?.code === 'auth/unauthorized-domain') {
          setAuthError('النطاق الحالي غير مضاف في إعدادات النطاقات المصرح بها (Authorized Domains) في Firebase Authentication.');
        } else {
          setAuthError('تعذر إتمام تسجيل الدخول عبر Google في هذه البيئة. يمكنك الدخول بالبريد الإلكتروني أو الدخول الفوري.');
        }
      }
    } finally {
      setAuthModalLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      userData, 
      userRole, 
      loading, 
      banInfo,
      runtimeEnv,
      signIn,
      signInWithGoogleAdaptive,
      signOut, 
      logout,
      sendVerificationEmail,
      refreshUserVerification,
      changeUserEmail,
      changeUserPassword,
      sendPasswordReset,
      deleteUserAccount
    }}>
      {children}

      {/* Redesigned Authentication Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        authMode={authMode}
        setAuthMode={setAuthMode}
        authEmail={authEmail}
        setAuthEmail={setAuthEmail}
        authPassword={authPassword}
        setAuthPassword={setAuthPassword}
        authConfirmPassword={authConfirmPassword}
        setAuthConfirmPassword={setAuthConfirmPassword}
        authDisplayName={authDisplayName}
        setAuthDisplayName={setAuthDisplayName}
        showPassword={showPassword}
        setShowPassword={setShowPassword}
        authError={authError}
        authSuccess={authSuccess}
        clearNotices={() => {
          setAuthError('');
          setAuthSuccess('');
        }}
        loading={authModalLoading}
        onClose={() => {
          setIsAuthModalOpen(false);
          resetAuthForm();
        }}
        onLogin={handleLogin}
        onRegister={handleRegister}
        onForgotPassword={handleForgotPassword}
        onGoogleSignIn={signInWithGoogleAdaptive}
        onInstantGuestLogin={handleInstantOtakuLogin}
        onOpenLegal={(section) => {
          setIsAuthModalOpen(false);
          window.dispatchEvent(new CustomEvent('open-legal-view', { detail: { section } }));
        }}
      />
    </AuthContext.Provider>
  );
};
