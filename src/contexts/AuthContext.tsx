import React, { createContext, useContext, useEffect, useState } from 'react';
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
  updateProfile
} from 'firebase/auth';
import { auth, db } from '../firebase';
import { doc, getDoc, setDoc, serverTimestamp, updateDoc, onSnapshot } from 'firebase/firestore';
import { updateDailyStreak } from '../services/gamificationService';
import { moderationService, RoleLevel, isStaffEmail } from '../services/moderationService';
import { Mail, Lock, UserPlus, LogIn, AlertCircle, X, Sparkles, CheckCircle, RefreshCw, KeyRound, Eye, EyeOff, ExternalLink, Smartphone, Monitor, Globe, Cpu } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import firebaseConfig from '../../firebase-applet-config.json';

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
  const [isInIframe, setIsInIframe] = useState(false);
  const [showOAuthTroubleshoot, setShowOAuthTroubleshoot] = useState(false);

  useEffect(() => {
    const detected = detectRuntimeEnvironment();
    setRuntimeEnv(detected);
    setIsInIframe(detected.isInIframe);
  }, []);

  // Native/System-level Google Sign In and One Tap helper (Google Identity Services)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const initGsi = () => {
      // Prioritize the user-configured or project-level Google Client ID or firebase-applet-config.json oAuthClientId
      const clientId = (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID || (firebaseConfig as any).oAuthClientId;
      
      if (!clientId) {
        console.log("GSI skipped: No Google Client ID found. Using standard Firebase Auth flow.");
        return;
      }

      // Skip GSI completely inside iframes (such as the Google AI Studio preview sandbox)
      // because browsers block the 'identity-credentials-get' API inside sandboxed documents,
      // which triggers GSI NotAllowedError exceptions. Standard Firebase popup works perfectly since it breaks out in a popup.
      const isReallyInIframe = typeof window !== 'undefined' && (window.self !== window.top || isInIframe);
      if (isReallyInIframe) {
        console.log("GSI skipped: Running in an iframe. Using standard Firebase Popup/Redirect flow to prevent FedCM iframe NotAllowedError.");
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
              console.error("Firebase GSI signin failed:", err);
              setAuthError(`فشل الاتصال بالنظام: ${err.message || 'يرجى التحقق من إعدادات حساب جوجل للمشروع'}`);
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
          (window as any).google.accounts.id.prompt((notification: any) => {
            if (notification.isNotDisplayed()) {
              console.log("One Tap not displayed:", notification.getNotDisplayedReason());
            } else if (notification.isSkippedMoment()) {
              console.log("One Tap skipped:", notification.getSkippedReason());
            } else if (notification.isDismissedMoment()) {
              console.log("One Tap dismissed:", notification.getDismissedReason());
            }
          });
        }
      } catch (err) {
        console.warn("Error setting up Google Identity Services:", err);
      }
    };

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
  }, [isAuthModalOpen, authMode]);

  const resetAuthForm = () => {
    setAuthEmail('');
    setAuthPassword('');
    setAuthConfirmPassword('');
    setAuthDisplayName('');
    setAuthError('');
    setAuthSuccess('');
    setShowPassword(false);
    setShowOAuthTroubleshoot(false);
  };

  // Listen for Google Redirect authentication and deep-linking URLs
  useEffect(() => {
    // 1. Handle Firebase Auth Redirect results
    setAuthModalLoading(true);
    getRedirectResult(auth)
      .then((result) => {
        if (result && result.user) {
          console.log("Logged in successfully via Redirect callback:", result.user.displayName);
          setAuthSuccess(`أهلاً بك مجدداً ${result.user.displayName || 'يا صديقي'}! تم تسجيل الدخول بنجاح عبر حساب Google.`);
          setIsAuthModalOpen(false);
        }
      })
      .catch((error: any) => {
        console.warn("Getting redirect result failed:", error);
        if (error.code && error.code !== 'auth/redirect-cancelled-by-user') {
          setAuthError('تعذر تكوين جلسة المصادقة عبر Google. يرجى استخدام البريد الإلكتروني وكلمة المرور إن تكرر الخطأ: ' + (error.message || error));
        }
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

  useEffect(() => {
    let unsubSnapshot: (() => void) | null = null;
    let unsubBan: (() => void) | null = null;
    
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
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
        // Enforce real-time ban checking
        const banRef = doc(db, 'bannedUsers', u.uid);
        unsubBan = onSnapshot(banRef, (banSnap) => {
          if (banSnap.exists()) {
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
               try {
                 if (typeof localStorage !== 'undefined') {
                   localStorage.setItem('mod_user_data_' + u.uid, JSON.stringify(fullData));
                 }
               } catch (e) {}
               setUserData(fullData);
             }
          }, (error) => {
             console.warn("User data snapshot error (offline or permissions):", error);
          });
          
          const roleData = await moderationService.getCurrentUserRole(u);
          setUserRole(isStaffEmail(u.email) ? 'owner' : roleData);
          
          setLoading(false);
        } catch (error) {
           console.warn("Failed to setup user, initiating offline fallback:", error);
           try {
             const localDataStr = typeof localStorage !== 'undefined' ? localStorage.getItem('mod_user_data_' + u.uid) : null;
             let fallbackData = null;
             if (localDataStr) {
               try {
                 fallbackData = JSON.parse(localDataStr);
               } catch (e) {}
             }
             if (!fallbackData) {
               const emailPrefix = u.email?.split('@')[0] || '';
               const cleanEmailPrefix = emailPrefix.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
               const baseUsername = cleanEmailPrefix || 'otaku_' + u.uid.substring(0, 5);
               fallbackData = {
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
             }
             setUserData(fallbackData);
             setUserRole(isStaffEmail(u.email) ? 'owner' : (fallbackData.role || 'user'));
           } catch (fallbackErr) {
             console.warn("Offline user fallback failed:", fallbackErr);
           }
           setLoading(false);
        }
      } else {
        setUserData(null);
        setUserRole('user');
        setBanInfo(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribe();
      if (unsubSnapshot) unsubSnapshot();
      if (unsubBan) unsubBan();
    };
  }, []);

  const signIn = async (initialMode: 'login' | 'register' | 'forgot' = 'login') => {
    setAuthMode(initialMode);
    setAuthError('');
    setAuthSuccess('');
    setIsAuthModalOpen(true);
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
  };

  const logout = async () => {
    await firebaseSignOut(auth);
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
        setAuthError('عذراً، خيار تسجيل الدخول بالبريد الإلكتروني (Email/Password) غير مفعّل في منصة Firebase لـ MOD. كمالك للتطبيق: توجه إلى Firebase Console ➔ Authentication ➔ Sign-in Method وفعل خيار "Email/Password" ليتمكن المستخدمون من التسجيل عبر الهواتف.');
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
    try {
      const randomNum = Math.floor(10000 + Math.random() * 90000);
      const guestEmail = `otaku_${randomNum}@animemod.app`;
      const guestPass = `Otaku#${randomNum}Mod!`;
      const userCredential = await createUserWithEmailAndPassword(auth, guestEmail, guestPass);
      if (userCredential.user) {
        await updateProfile(userCredential.user, {
          displayName: `أوتاكو #${randomNum}`
        });
        setAuthSuccess('✓ تم الدخول الفوري بنجاح إلى عالم أنمي MOD!');
        setTimeout(() => {
          setIsAuthModalOpen(false);
          resetAuthForm();
        }, 800);
      }
    } catch (err: any) {
      console.warn("Instant Otaku Login failed:", err);
      setAuthError('فشل الدخول الفوري، يرجى المحاولة مرة أخرى أو استخدام البريد الإلكتروني.');
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
    const currentEnv = detectRuntimeEnvironment();
    setRuntimeEnv(currentEnv);

    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    setAuthModalLoading(true);
    try {
      // Case 1: Installed Android APK / WebView / Capacitor / Cordova
      if (currentEnv.host === 'apk_webview') {
        setAuthSuccess(`تم رصد ${currentEnv.hostLabelAr} — جاري الاتصال بحساب Google على جهاز الأندرويد...`);

        // 1a. Check if a native Android/Capacitor Google Auth bridge is injected by the APK wrapper
        const nativeGooglePlugin = (window as any).Capacitor?.Plugins?.GoogleAuth || (window as any).plugins?.googleplus;
        if (nativeGooglePlugin) {
          try {
            const nativeRes = await (nativeGooglePlugin.signIn ? nativeGooglePlugin.signIn() : Promise.reject('no signIn'));
            const idToken = nativeRes?.authentication?.idToken || nativeRes?.idToken;
            if (idToken) {
              const cred = GoogleAuthProvider.credential(idToken);
              await signInWithCredential(auth, cred);
              setIsAuthModalOpen(false);
              resetAuthForm();
              return;
            }
          } catch (nativeBridgeErr) {
            console.warn('Native APK Google bridge fallback to Firebase Auth:', nativeBridgeErr);
          }
        }

        // 1b. Try Google Identity Services (GSI) token/credential if available inside the WebView
        const clientId = (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID || (firebaseConfig as any).oAuthClientId;
        if (clientId && (window as any).google?.accounts?.id) {
          try {
            await new Promise<void>((resolve, reject) => {
              (window as any).google.accounts.id.prompt((notification: any) => {
                if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
                  reject(new Error('GSI not displayed in APK'));
                } else {
                  resolve();
                }
              });
            });
            return;
          } catch {
            // Fall through to Redirect/Popup for APK
          }
        }

        // 1c. In Android APK WebView, signInWithRedirect is the primary standard flow (avoids blocked popups in WebView)
        try {
          await signInWithRedirect(auth, provider);
          return;
        } catch (redirErr) {
          console.warn('APK Redirect failed, trying Popup:', redirErr);
          await signInWithPopup(auth, provider);
          setIsAuthModalOpen(false);
          resetAuthForm();
          return;
        }
      }

      // Case 2: Installed iOS App (Standalone PWA / iOS WebView)
      if (currentEnv.host === 'ios_standalone') {
        setAuthSuccess(`تم رصد ${currentEnv.hostLabelAr} — جاري فتح مصادقة Google المتوافقة مع نظام iOS...`);
        try {
          await signInWithPopup(auth, provider);
          setIsAuthModalOpen(false);
          resetAuthForm();
          return;
        } catch (iosPopupErr: any) {
          if (iosPopupErr?.code === 'auth/popup-closed-by-user') {
            throw iosPopupErr;
          }
          await signInWithRedirect(auth, provider);
          return;
        }
      }

      // Case 3: Installed Windows App (Standalone PWA / Electron / WebView2)
      if (currentEnv.host === 'windows_app') {
        setAuthSuccess(`تم رصد ${currentEnv.hostLabelAr} — جاري فتح نافذة اتصال Google لنظام ويندوز...`);
        try {
          await signInWithPopup(auth, provider);
          setIsAuthModalOpen(false);
          resetAuthForm();
          return;
        } catch (winPopupErr: any) {
          if (winPopupErr?.code === 'auth/popup-closed-by-user') {
            throw winPopupErr;
          }
          await signInWithRedirect(auth, provider);
          return;
        }
      }

      // Case 4: Mobile Browser (Android Chrome / iOS Safari)
      if (currentEnv.host === 'mobile_browser') {
        setAuthSuccess(`تم رصد ${currentEnv.hostLabelAr} — جاري الاتصال السريع بحساب Google...`);
        try {
          await signInWithPopup(auth, provider);
          setIsAuthModalOpen(false);
          resetAuthForm();
          return;
        } catch (mobPopupErr: any) {
          if (mobPopupErr?.code === 'auth/popup-closed-by-user') {
            throw mobPopupErr;
          }
          console.warn('Mobile browser popup blocked, switching to Redirect:', mobPopupErr);
          await signInWithRedirect(auth, provider);
          return;
        }
      }

      // Case 5: Standard Desktop Browser or Iframe Sandbox
      setAuthSuccess(`تم رصد ${currentEnv.hostLabelAr} — جاري فتح نافذة تسجيل الدخول عبر Google...`);
      try {
        await signInWithPopup(auth, provider);
        setIsAuthModalOpen(false);
        resetAuthForm();
      } catch (deskPopupErr: any) {
        if (deskPopupErr?.code === 'auth/popup-closed-by-user') {
          throw deskPopupErr;
        }
        if (!currentEnv.isInIframe) {
          await signInWithRedirect(auth, provider);
        } else {
          throw deskPopupErr;
        }
      }
    } catch (error: any) {
      console.warn('Adaptive Google authentication error:', error);
      setAuthSuccess('');
      if (error?.code === 'auth/popup-closed-by-user') {
        setAuthError('تم إغلاق نافذة تسجيل الدخول عبر Google قبل إكمال العملية.');
      } else if (error?.code === 'auth/unauthorized-domain') {
        setAuthError(`النطاق الحالي (${window.location.hostname}) غير مضاف بعد في قائمة Authorized Domains داخل Firebase Console.`);
      } else {
        setAuthError('تعذر إكمال الاتصال التلقائي بحساب Google: ' + (error?.message || 'يرجى المحاولة مجدداً أو استخدام البريد الإلكتروني وكلمة المرور.'));
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
      sendPasswordReset
    }}>
      {children}

      {/* Dynamic Native-Sensing Authentication Modal */}
      <AnimatePresence>
        {isAuthModalOpen && (
          <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm" dir="rtl">
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 30 }}
              transition={{ type: "spring", stiffness: 350, damping: 28 }}
              className="relative w-full max-w-sm bg-zinc-950 border border-zinc-800 rounded-2xl p-5 shadow-[0_20px_50px_rgba(0,0,0,0.9)] max-h-[90vh] overflow-y-auto"
            >
              {/* Background ambient decorative aura */}
              <div className="absolute -top-10 -left-10 w-32 h-32 bg-purple-600/10 rounded-full blur-2xl pointer-events-none" />
              <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-[#FF1744]/5 rounded-full blur-2xl pointer-events-none" />

              {/* Close button */}
              <button
                onClick={() => {
                  setIsAuthModalOpen(false);
                  resetAuthForm();
                }}
                className="absolute top-4 left-4 w-7 h-7 rounded-lg bg-zinc-900 border border-white/5 text-neutral-400 hover:text-white flex items-center justify-center cursor-pointer hover:border-white/10 transition"
              >
                <X size={14} />
              </button>

              {/* Header */}
              <div className="text-center mb-5 mt-1">
                <div className="inline-flex w-10 h-10 bg-gradient-to-tr from-[#FF1744] to-purple-600 rounded-xl items-center justify-center text-white shadow-lg mb-2.5">
                  <Sparkles size={18} className="animate-pulse" />
                </div>
                <h3 className="text-base font-black text-white">
                  {authMode === 'login' ? 'طلب تسجيل الدخول' : authMode === 'register' ? 'إنشاء حساب أوتاكو جديد' : 'استعادة حسابك'}
                </h3>
                <p className="text-[10px] text-neutral-400 mt-1 px-4 leading-normal">
                  {authMode === 'login' ? 'سجل دخولك لتتمكن من حفظ الأنمي، جمع الكوينز، ومشاركة التعليقات!' : authMode === 'register' ? 'انضم لأسرة أنمي MOD مجاناً بالكامل واحصل على جوائز يومية مذهلة!' : 'أدخل بريدك الإلكتروني وسيصلك رابط إعادة التعيين فوراً'}
                </p>
              </div>

              {/* Success/Error Notices */}
              {authError && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/25 rounded-xl text-red-400 text-[10px] font-bold flex items-start gap-1.5 text-right">
                  <AlertCircle size={13} className="mt-0.5 shrink-0" />
                  <span>{authError}</span>
                </div>
              )}

              {authSuccess && (
                <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/25 rounded-xl text-emerald-400 text-[10px] font-bold flex items-start gap-1.5 text-right">
                  <CheckCircle size={13} className="mt-0.5 shrink-0" />
                  <span>{authSuccess}</span>
                </div>
              )}

              {/* Interactive Form */}
              <form onSubmit={authMode === 'login' ? handleLogin : authMode === 'register' ? handleRegister : handleForgotPassword} className="space-y-3.5">
                
                {/* Display name field (Registration mode only) */}
                {authMode === 'register' && (
                  <div className="space-y-1 text-right">
                    <label className="text-[10px] font-bold text-neutral-300">الاسم المستعار (اسم العرض)</label>
                    <div className="relative">
                      <input
                        type="text"
                        required
                        value={authDisplayName}
                        onChange={(e) => setAuthDisplayName(e.target.value)}
                        placeholder="لوفي الرائع أو سينباي"
                        className="w-full bg-[#07070b]/90 border border-zinc-800 focus:border-[#FF1744] focus:ring-1 focus:ring-[#FF1744]/20 rounded-xl py-2 px-3 pr-9 text-xs text-white placeholder-neutral-500 outline-none transition text-right"
                      />
                      <UserPlus className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500" size={13} />
                    </div>
                  </div>
                )}

                {/* Email address field */}
                <div className="space-y-1 text-right">
                  <label className="text-[10px] font-bold text-neutral-300">البريد الإلكتروني</label>
                  <div className="relative">
                    <input
                      type="email"
                      required
                      value={authEmail}
                      onChange={(e) => setAuthEmail(e.target.value)}
                      placeholder="username@domain.com"
                      className="w-full bg-[#07070b]/90 border border-zinc-800 focus:border-[#FF1744] focus:ring-1 focus:ring-[#FF1744]/20 rounded-xl py-2 px-3 pr-9 text-xs text-white placeholder-neutral-500 outline-none transition text-right"
                      dir="ltr"
                    />
                    <Mail className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500" size={13} />
                  </div>
                </div>

                {/* Password field */}
                {authMode !== 'forgot' && (
                  <div className="space-y-1 text-right">
                    <div className="flex items-center justify-between">
                      {authMode === 'login' && (
                        <button
                          type="button"
                          onClick={() => {
                            setAuthMode('forgot');
                            setAuthError('');
                            setAuthSuccess('');
                          }}
                          className="text-[9px] text-neutral-500 hover:text-white transition"
                        >
                          نسيت كلمة السر؟
                        </button>
                      )}
                      <label className="text-[10px] font-bold text-neutral-300">كلمة المرور</label>
                    </div>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        required
                        value={authPassword}
                        onChange={(e) => setAuthPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full bg-[#07070b]/90 border border-zinc-800 focus:border-[#FF1744] focus:ring-1 focus:ring-[#FF1744]/20 rounded-xl py-2 px-3 pr-9 pl-9 text-xs text-white placeholder-neutral-500 outline-none transition text-right"
                        dir="ltr"
                      />
                      <Lock className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500" size={13} />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300 transition"
                      >
                        {showPassword ? <EyeOff size={13} /> : <Eye size={13} />}
                      </button>
                    </div>
                  </div>
                )}

                {/* Confirm password match */}
                {authMode === 'register' && (
                  <div className="space-y-1 text-right">
                    <label className="text-[10px] font-bold text-neutral-300">تأكيد كلمة المرور</label>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        required
                        value={authConfirmPassword}
                        onChange={(e) => setAuthConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full bg-[#07070b]/90 border border-zinc-800 focus:border-[#FF1744] focus:ring-1 focus:ring-[#FF1744]/20 rounded-xl py-2 px-3 pr-9 text-xs text-white placeholder-neutral-500 outline-none transition text-right"
                        dir="ltr"
                      />
                      <KeyRound className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500" size={13} />
                    </div>
                  </div>
                )}

                {/* Form submit button */}
                <button
                  type="submit"
                  disabled={authModalLoading}
                  className="w-full bg-gradient-to-r from-purple-600 to-[#FF1744] disabled:opacity-50 hover:opacity-95 active:scale-[0.98] text-white text-xs font-black py-2.5 rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 mt-2 shadow-lg shadow-purple-900/10"
                >
                  {authModalLoading ? (
                    <RefreshCw size={12} className="animate-spin text-white" />
                  ) : authMode === 'login' ? (
                    <LogIn size={12} />
                  ) : authMode === 'register' ? (
                    <UserPlus size={12} />
                  ) : (
                    <KeyRound size={12} />
                  )}
                  <span>
                    {authModalLoading ? 'جاري التحقق...' : authMode === 'login' ? 'سجل دخول آمن' : authMode === 'register' ? 'تسجيل كـ أوتاكو جديد' : 'أرسل رابط التغيير'}
                  </span>
                </button>
              </form>

              {/* Traditional social link option */}
              {authMode !== 'forgot' && (
                <>
                  <div className="my-4 relative flex items-center justify-center">
                    <div className="absolute inset-x-0 h-px bg-zinc-900" />
                    <span className="relative bg-zinc-950 px-2.5 text-[9px] text-neutral-500 font-bold">أو الاتصال الذكي عبر حساب Google</span>
                  </div>

                  {/* Smart Environment & Platform Detection Indicator */}
                  <div className="mb-3 p-3 bg-[#090b12] border border-blue-500/20 rounded-xl text-right space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[9.5px] font-black text-sky-400 flex items-center gap-1.5">
                        {runtimeEnv.os === 'android' || runtimeEnv.os === 'ios' ? (
                          <Smartphone size={13} className="text-sky-400 shrink-0" />
                        ) : runtimeEnv.os === 'windows' || runtimeEnv.os === 'macos' ? (
                          <Monitor size={13} className="text-sky-400 shrink-0" />
                        ) : (
                          <Globe size={13} className="text-sky-400 shrink-0" />
                        )}
                        <span>بيئة التشغيل المرصودة تلقائياً:</span>
                      </span>
                      <span className={`text-[8.5px] font-black px-2 py-0.5 rounded-full border ${
                        runtimeEnv.isInstalledApp
                          ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                          : 'bg-purple-500/15 text-purple-300 border-purple-500/30'
                      }`}>
                        {runtimeEnv.isInstalledApp ? 'تطبيق مثبّت 📲' : 'متصفح ويب 🌐'}
                      </span>
                    </div>

                    <div className="text-[9.5px] text-neutral-300 font-bold flex flex-wrap items-center gap-1.5">
                      <span className="text-white">{runtimeEnv.hostLabelAr}</span>
                      <span className="text-neutral-600">•</span>
                      <span className="text-neutral-400">{runtimeEnv.osLabelAr}</span>
                    </div>

                    <div className="text-[8.5px] text-emerald-400/90 font-bold flex items-center gap-1 pt-0.5 border-t border-white/5">
                      <Cpu size={10} className="shrink-0" />
                      <span>بروتوكول جوجل المختار: {runtimeEnv.strategyLabelAr}</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={authModalLoading}
                    onClick={signInWithGoogleAdaptive}
                    className="w-full mb-2.5 bg-white hover:bg-neutral-100 text-zinc-900 font-black text-[11px] py-2.5 px-4 rounded-xl transition cursor-pointer flex items-center justify-center gap-2 shadow-lg active:scale-[0.98] disabled:opacity-50"
                  >
                    <svg viewBox="0 0 24 24" className="w-4 h-4">
                      <path fill="#EA4335" d="M12 5c1.6 0 3 .6 4.1 1.7l3.1-3.1C17.3 1.8 14.8 1 12 1 7.4 1 3.5 3.6 1.6 7.4l3.7 2.8C6.2 7.2 8.9 5 12 5z" />
                      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.6l3.7 2.9c2.2-2 3.7-5 3.7-8.7z" />
                      <path fill="#FBBC05" d="M5.3 14.8c-.2-.8-.4-1.6-.4-2.5s.2-1.7.4-2.5L1.6 7C.6 9 0 11.2 0 13.5s.6 4.5 1.6 6.5l3.7-2.9z" />
                      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3.1 0-5.8-2.1-6.7-5l-3.7 2.8C3.5 21.4 7.4 24 12 24z" />
                    </svg>
                    <span>
                      {runtimeEnv.host === 'apk_webview'
                        ? 'تسجيل عبر حساب Google (وضع تطبيق الأندرويد APK)'
                        : runtimeEnv.host === 'ios_standalone'
                        ? 'تسجيل عبر حساب Google (وضع تطبيق الآيفون iOS)'
                        : runtimeEnv.host === 'windows_app'
                        ? 'تسجيل عبر حساب Google (وضع برنامج ويندوز)'
                        : 'تسجيل الدخول عبر حساب Google'}
                    </span>
                  </button>

                  {/* Instant One-Click Otaku Guest Login Button */}
                  <button
                    type="button"
                    onClick={handleInstantOtakuLogin}
                    disabled={authModalLoading}
                    className="w-full mb-2 bg-gradient-to-r from-emerald-600/90 to-teal-600/90 hover:from-emerald-500 hover:to-teal-500 text-white text-[10.5px] font-black py-2.5 px-4 rounded-xl shadow-md transition flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Sparkles size={14} className="animate-pulse" />
                    <span>⚡ دخول فوري كـ أوتاكو (بضغطة واحدة بدون تسجيل)</span>
                  </button>

                  {/* Troubleshoot Panel for Google Client ID / invalid_client 401 */}
                  <div className="mt-2.5">
                    <button
                      type="button"
                      onClick={() => setShowOAuthTroubleshoot(!showOAuthTroubleshoot)}
                      className="w-full text-center text-[9px] text-[#FF1744] hover:underline font-bold flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <span>{showOAuthTroubleshoot ? '▲ إخفاء دليل حل تفعيل الدخول' : '▼ هل تواجه مشكلة "خطأ 401 / معرّف غير موجود"؟'}</span>
                    </button>

                    <AnimatePresence>
                      {showOAuthTroubleshoot && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="mt-2 p-3 bg-zinc-900/60 border border-zinc-800 rounded-xl overflow-hidden text-right leading-relaxed text-[10px]"
                        >
                          <p className="font-bold text-neutral-200 mb-1.5 text-[10.5px] text-red-400">
                            🔍 سبب ظهور خطأ (invalid_client: 401):
                          </p>
                          <p className="text-neutral-400 mb-2">
                            حدث هذا لأن حساب Google المطلوب للدخول (OAuth Client) غير معرّف أو غير مفعّل في منصة Firebase الخاصة بالتطبيق في حسابك. لحل هذه المشكلة كمالك، يرجى اتباع الخطوات:
                          </p>
                          
                          <ol className="list-decimal list-inside space-y-2 text-neutral-300">
                            <li>
                              <strong className="text-white">تفعيل تسجيل Google في Firebase:</strong>
                              <p className="text-neutral-400 mr-3.5 mt-0.5">
                                اذهب لـ <a href="https://console.firebase.google.com/project/gen-lang-client-0027450047/authentication/providers" target="_blank" rel="noopener noreferrer" className="text-[#FF1744] hover:underline inline-flex items-center gap-0.5">Firebase Console <ExternalLink size={8} /></a> ➔ <strong className="text-zinc-300 font-normal">Authentication</strong> ➔ <strong className="text-zinc-300 font-normal">Sign-in method</strong>.
                              </p>
                              <p className="text-neutral-400 mr-3.5 mt-0.5">
                                انقر على "إضافة موفر جديد" واختر <strong className="text-zinc-200">Google</strong>، ثم قم بتفعيله وحفظه.
                              </p>
                            </li>
                            
                            <li>
                              <strong className="text-white">نسخ معرّف الويب (Web Client ID):</strong>
                              <p className="text-neutral-400 mr-3.5 mt-0.5">
                                ستجد في نفس صفحة تفعيل Google جزءاً باسم <strong className="text-zinc-300 font-normal">Web SDK Configuration</strong>، انسخ المعرّف الموجود هناك.
                              </p>
                            </li>

                            <li>
                              <strong className="text-white">إعداد معرّف العميل في AI Studio:</strong>
                              <p className="text-neutral-400 mr-3.5 mt-0.5">
                                اذهب إلى إعدادات التطبيق في <strong className="text-zinc-200">AI Studio</strong> ➔ <strong className="text-zinc-200">Settings</strong> ➔ <strong className="text-zinc-200">Environment Variables</strong>.
                              </p>
                              <p className="text-neutral-300 mr-3.5 font-mono bg-zinc-950 p-1 rounded border border-zinc-800 mt-1 select-all text-[9.5px]">
                                VITE_GOOGLE_CLIENT_ID = [معرّف_الويب_الذي_نسخته]
                              </p>
                            </li>

                            <li>
                              <strong className="text-white">اعتماد نطاق التطبيق (OAuth Whitelist):</strong>
                              <p className="text-neutral-400 mr-3.5 mt-0.5">
                                اذهب إلى <a href="https://console.cloud.google.com/apis/credentials?project=gen-lang-client-0027450047" target="_blank" rel="noopener noreferrer" className="text-[#FF1744] hover:underline inline-flex items-center gap-0.5">Google Cloud Credentials <ExternalLink size={8} /></a>.
                              </p>
                              <p className="text-neutral-400 mr-3.5 mt-0.5">
                                اختر معرّف عميل الويب الخاص بك وتأكد من إدراج نطاقات التطبيق الحالية (URLs) بداخل خانة <strong className="text-zinc-300 font-normal">Authorized JavaScript Origins</strong> لتقبل المصادقة بنجاح.
                              </p>
                            </li>
                          </ol>
                          <p className="text-emerald-400 mt-2 font-bold text-[9.5px] border-t border-zinc-800 pt-1.5">
                            💡 نصيحة: يمكنك أيضاً تسجيل مستخدم جديد بالبريد وكلمة السر لتجاوز ذلك فوراً وبدء التصفح!
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </>
              )}

              {/* Mode switch */}
              <div className="mt-4.5 text-center text-[10px] leading-relaxed">
                {authMode === 'login' ? (
                  <p className="text-neutral-400">
                    أنت جديد هنا؟{' '}
                    <button
                      onClick={() => {
                        setAuthMode('register');
                        setAuthError('');
                        setAuthSuccess('');
                      }}
                      className="text-[#FF1744] hover:underline font-bold"
                    >
                      إنشاء حساب أوتاكو مجاني
                    </button>
                  </p>
                ) : (
                  <p className="text-neutral-400">
                    تمتلك حساباً مسبقاً؟{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('login');
                        setAuthError('');
                        setAuthSuccess('');
                      }}
                      className="text-[#FF1744] hover:underline font-bold"
                    >
                      تسجيل دخول فوري
                    </button>
                  </p>
                )}
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </AuthContext.Provider>
  );
};
