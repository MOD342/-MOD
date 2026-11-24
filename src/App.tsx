/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, Suspense, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { AppLayout } from './components/AppLayout';
import { Loader2 } from 'lucide-react';
import HomeView from './views/HomeView';
import MoreView from './views/MoreView';
import DiagnosticsView from './views/DiagnosticsView';
import { useAuth } from './contexts/AuthContext';
import { collection, doc, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db, auth } from './firebase';
import { isStaffEmail } from './services/moderationService';
import {
  DEFAULT_DUAL_HOME_CONFIG,
  normalizeDualHomeConfig,
  type DualHomeConfig,
} from './types/platformConfig';
import { consumePendingDiagnosticsTab } from './utils/errorTelemetry';
import { lazyWithRetry } from './utils/lazyWithRetry';
import { ViewportPortal } from './components/ViewportPortal';
import { SwipeableToastItem } from './components/SwipeableToastItem';
import {
  dispatchNativeSystemNotification,
  registerNativeNotificationTapListener,
} from './utils/systemPermissions';
import {
  initExternalDiscoveryNotifications,
  shouldMirrorFirestoreNotificationToOS,
} from './services/externalNotificationEngine';
import { applyViewportAndCutoutMetrics } from './utils/viewportMetrics';
import { ViewErrorBoundary } from './components/GlobalErrorBoundary';
import { downloadManagerService } from './services/downloadManagerService';
import OnboardingView from './components/OnboardingView';
import {
  getDefaultHomeMode,
  isOnboardingCompleted,
  HOME_MODE_CHANGED_EVENT,
  ONBOARDING_RESET_EVENT,
  type HomeMode,
} from './utils/appPreferences';

const ExploreView = lazyWithRetry(() => import('./views/ExploreView'), 'ExploreView');
const CommunityView = lazyWithRetry(() => import('./views/CommunityView'), 'CommunityView');
const MyListsView = lazyWithRetry(() => import('./views/MyListsView'), 'MyListsView');
const ProfileView = lazyWithRetry(() => import('./views/ProfileView'), 'ProfileView');
const AccountSecurityView = lazyWithRetry(() => import('./views/AccountSecurityView'), 'AccountSecurityView');
const ProfileAppearanceView = lazyWithRetry(() => import('./views/ProfileAppearanceView'), 'ProfileAppearanceView');
const AnimeDetailsView = lazyWithRetry(() => import('./views/AnimeDetailsView'), 'AnimeDetailsView');
const AnimeCommentsView = lazyWithRetry(() => import('./views/AnimeCommentsView'), 'AnimeCommentsView');
const WatchView = lazyWithRetry(() => import('./views/WatchView'), 'WatchView');
const AdminDashboardView = lazyWithRetry(() => import('./views/AdminDashboardView'), 'AdminDashboardView');
const ScheduleView = lazyWithRetry(() => import('./views/ScheduleView'), 'ScheduleView');
const StoreView = lazyWithRetry(() => import('./views/StoreView'), 'StoreView');
const RecentEpisodesView = lazyWithRetry(() => import('./views/RecentEpisodesView'), 'RecentEpisodesView');
const CurrentSeasonView = lazyWithRetry(() => import('./views/CurrentSeasonView'), 'CurrentSeasonView');
const CatalogCollectionView = lazyWithRetry(() => import('./views/CatalogCollectionView'), 'CatalogCollectionView');
const DownloadsView = lazyWithRetry(() => import('./views/DownloadsView'), 'DownloadsView');
const LevelPerksView = lazyWithRetry(() => import('./views/LevelPerksView'), 'LevelPerksView');
const FavoritesView = lazyWithRetry(() => import('./views/FavoritesView'), 'FavoritesView');
const RewardsView = lazyWithRetry(() => import('./views/RewardsView'), 'RewardsView');
const NotificationsView = lazyWithRetry(() => import('./views/NotificationsView'), 'NotificationsView');
const AiChatView = lazyWithRetry(() => import('./views/AiChatView'), 'AiChatView');
const AdSupportView = lazyWithRetry(() => import('./views/AdSupportView'), 'AdSupportView');
const SupportPortalView = lazyWithRetry(() => import('./views/SupportPortalView'), 'SupportPortalView');
const OtakuArenaHubView = lazyWithRetry(() => import('./views/OtakuArenaHubView'), 'OtakuArenaHubView');
const MangaHubView = lazyWithRetry(() => import('./views/MangaHubView'), 'MangaHubView');
const MangaDetailsView = lazyWithRetry(() => import('./views/MangaDetailsView'), 'MangaDetailsView');
const MangaReaderView = lazyWithRetry(() => import('./views/MangaReaderView'), 'MangaReaderView');
const LegalAboutView = lazyWithRetry(() => import('./views/LegalAboutView'), 'LegalAboutView');

import { MascotLoadingScreen, MascotOfflineScreen } from './components/MascotScreens';
import PermissionPromptModal from './components/PermissionPromptModal';

const ViewFallback = () => (
  <div className="flex flex-col items-center justify-center min-h-[50vh] text-neutral-400 gap-4" dir="rtl">
    <Loader2 className="animate-spin text-purple-500" size={36} />
    <span className="text-sm font-bold font-mono text-neutral-500 bg-neutral-900/40 border border-white/5 py-1 px-4 rounded-full">جاري تحميل الصفحة...</span>
  </div>
);

export default function App() {
  const { banInfo, user, userRole, loading } = useAuth();
  const isAdmin = userRole === 'owner' || userRole === 'admin' || userRole === 'moderator' || isStaffEmail(user?.email) || isStaffEmail(auth.currentUser?.email);
  const [activeTab, setActiveTab ] = useState('home');
  const [showSplash, setShowSplash] = useState(false);
  const [askPermissions, setAskPermissions] = useState(false);
  const [onboardingDone, setOnboardingDone] = useState<boolean>(isOnboardingCompleted);
  const [homeMode, setHomeMode] = useState<HomeMode>(getDefaultHomeMode);
  const [dualHomeConfig, setDualHomeConfig] = useState<DualHomeConfig>(DEFAULT_DUAL_HOME_CONFIG);
  const [viewStack, setViewStack] = useState<{name: string, props?: any}[]>(() => {
    if (typeof window !== 'undefined') {
      const pendingTab = consumePendingDiagnosticsTab();
      const params = new URLSearchParams(window.location.search);
      const hasDiagQuery = params.has('diagnostics') || params.get('view') === 'diagnostics';
      const hasDiagHash = window.location.hash.includes('diagnostics');
      if (pendingTab || hasDiagQuery || hasDiagHash) {
        return [{ name: 'home' }, { name: 'diagnostics', props: { initialTab: pendingTab || 'tests' } }];
      }
    }
    return [{ name: 'home' }];
  });
  const [activeToasts, setActiveToasts] = useState<any[]>([]);

  const dismissToast = useCallback((toastId: string) => {
    setActiveToasts(prev => prev.filter(t => t.id !== toastId));
  }, []);

  const triggerToast = (notif: any) => {
    setActiveToasts(prev => {
      if (prev.some(t => t.id === notif.id)) return prev;
      return [...prev, notif];
    });

    // إرسال إشعار للنظام فقط عند استحقاقه كإشعار خارجي غير مكرر (وليس لتنبيهات المشاهدة/المكافآت الذاتية)
    if (shouldMirrorFirestoreNotificationToOS(notif)) {
      void dispatchNativeSystemNotification({
        id: notif.id,
        title: notif.title || 'أوتاكو MOD ⚡',
        body: notif.body || '',
        imageUrl: notif.imageUrl,
        tag: `fs:${notif.id}`,
        extra: { linkTo: notif.linkTo, metadata: notif.metadata },
        onClick: () => handleToastClick(notif),
      });
    }
  };

  useEffect(() => {
    if (!user) {
      setActiveToasts([]);
      return;
    }

    const sessionStartTime = Date.now();
    const seenIds = new Set<string>();

    const getDocCreatedTime = (data: any) => {
      if (!data) return Date.now();
      if (data.createdAt?.toMillis) return data.createdAt.toMillis();
      if (data.createdAt?.toDate) return data.createdAt.toDate().getTime();
      if (data.createdAt instanceof Date) return data.createdAt.getTime();
      if (typeof data.createdAt === 'number') return data.createdAt;
      if (typeof data.createdAt === 'string') {
        const p = Date.parse(data.createdAt);
        if (!isNaN(p)) return p;
      }
      if (data.addedAt?.toMillis) return data.addedAt.toMillis();
      if (data.addedAt?.toDate) return data.addedAt.toDate().getTime();
      if (typeof data.addedAt === 'string') {
        const p = Date.parse(data.addedAt);
        if (!isNaN(p)) return p;
      }
      return Date.now();
    };

    // 1. Listen to real-time User Specific Notifications
    const unsubUserNotifs = (auth.currentUser && auth.currentUser.uid === user.id)
      ? onSnapshot(
          query(collection(db, 'users', user.id, 'notifications'), orderBy('createdAt', 'desc'), limit(1)),
          (snapshot) => {
            snapshot.docChanges().forEach((change) => {
              if (change.type === 'added') {
                const data = change.doc.data();
                const id = change.doc.id;

                const createdTime = getDocCreatedTime(data);

                // Only alert if it's after session load, is unread, and hasn't been shown in this window session
                if (createdTime >= sessionStartTime - 4000 && !data.read && !seenIds.has(id)) {
                  seenIds.add(id);
                  triggerToast({ id, ...data });
                }
              }
            });
          },
          (err) => console.warn("Real-time toast error:", err)
        )
      : () => {};

    // 2. Listen to real-time Global Notifications
    const unsubGlobalNotifs = onSnapshot(
      query(collection(db, 'globalNotifications'), orderBy('createdAt', 'desc'), limit(1)),
      (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const data = change.doc.data();
            const id = change.doc.id;

            const createdTime = getDocCreatedTime(data);

            if (createdTime >= sessionStartTime - 4000 && !seenIds.has(id)) {
              seenIds.add(id);
              triggerToast({ id, ...data, isGlobal: true });
            }
          }
        });
      },
      (err) => console.warn("Real-time global toast error:", err)
    );

    // 3. Listen to Administration Events (Reports, Suggestions, Recommendations) in Real-time
    let unsubAdminReports = () => {};
    let unsubAdminSuggestions = () => {};
    let unsubAdminRecommendations = () => {};

    if (isAdmin) {
      unsubAdminReports = onSnapshot(
        query(collection(db, 'reports'), orderBy('createdAt', 'desc'), limit(1)),
        (snapshot) => {
          snapshot.docChanges().forEach((change) => {
            if (change.type === 'added') {
              const data = change.doc.data();
              const id = change.doc.id;
              const createdTime = getDocCreatedTime(data);

              if (createdTime >= sessionStartTime - 4000 && !seenIds.has(id)) {
                seenIds.add(id);
                triggerToast({
                  id,
                  title: '⚠️ بلاغ أمني جديد 🛡️',
                  body: `بلاغ عن محتوى مخالف بمستوى (${data.type === 'comment' ? 'تعليق مخالف' : 'محتوى مخالف'}). السبب: ${data.reason || 'غير محدد'}`,
                  type: 'admin_report',
                  linkTo: 'admin:reports',
                  isAdminNotification: true
                });
              }
            }
          });
        },
        (err) => console.warn("Admin real-time reports error:", err)
      );

      unsubAdminSuggestions = onSnapshot(
        query(collection(db, 'suggestions'), orderBy('createdAt', 'desc'), limit(1)),
        (snapshot) => {
          snapshot.docChanges().forEach((change) => {
            if (change.type === 'added') {
              const data = change.doc.data();
              const id = change.doc.id;
              const createdTime = getDocCreatedTime(data);

              if (createdTime >= sessionStartTime - 4000 && !seenIds.has(id)) {
                seenIds.add(id);
                const isComplaint = data.type === 'complaint';
                triggerToast({
                  id,
                  title: isComplaint ? '🚨 شكوى إدارية جديدة' : '💡 مقترح جديد للمنصة',
                  body: `"${data.title || data.text || ''}" - بواسطة: ${data.userName || 'عضو مجهول'}`,
                  type: 'admin_suggestion',
                  linkTo: 'admin:suggestions_moderation',
                  isAdminNotification: true
                });
              }
            }
          });
        },
        (err) => console.warn("Admin real-time suggestions error:", err)
      );

      unsubAdminRecommendations = onSnapshot(
        query(collection(db, 'recommendations'), orderBy('createdAt', 'desc'), limit(1)),
        (snapshot) => {
          snapshot.docChanges().forEach((change) => {
            if (change.type === 'added') {
              const data = change.doc.data();
              const id = change.doc.id;
              const createdTime = getDocCreatedTime(data);

              if (createdTime >= sessionStartTime - 4000 && data.status === 'pending' && !seenIds.has(id)) {
                seenIds.add(id);
                triggerToast({
                  id,
                  title: '📖 توصية جديدة بانتظار الاعتماد',
                  body: `توصية لـ "${data.targetAnimeTitle || 'أنمي'}" من العضو: ${data.userDisplayName || 'عضو مجهول'}`,
                  type: 'admin_recommendation',
                  linkTo: 'admin:recommendations',
                  isAdminNotification: true
                });
              }
            }
          });
        },
        (err) => console.warn("Admin real-time recommendations error:", err)
      );
    }

    return () => {
      unsubUserNotifs();
      unsubGlobalNotifs();
      unsubAdminReports();
      unsubAdminSuggestions();
      unsubAdminRecommendations();
    };
  }, [user, userRole]);

  const navigateByLinkTo = useCallback((linkTo?: string, metadata?: any) => {
    if (!linkTo) return;

    if (linkTo.startsWith('admin:')) {
      const parts = linkTo.split(':');
      const tab = parts[1] || 'reports';
      navigateTo('admin', { initialTab: tab });
    } else if (linkTo === 'support_suggestions') {
      navigateTo('support_suggestions');
    } else if (linkTo === 'rewards') {
      navigateTo('rewards');
    } else if (linkTo === 'recent_episodes') {
      navigateTo('recent_episodes');
    } else if (linkTo === 'manga_hub') {
      navigateTo('manga_hub');
    } else if (linkTo === 'tournaments') {
      navigateTo('tournaments');
    } else if (linkTo.startsWith('arena_room:')) {
      const code = linkTo.split(':')[1] || '';
      navigateTo('games', { initialTab: 'games', initialRoomCode: code });
    } else if (linkTo === 'games') {
      navigateTo('games', { initialTab: 'games' });
    } else if (linkTo === 'leaderboard') {
      navigateTo('leaderboard', { initialTab: 'leaderboard' });
    } else if (linkTo.startsWith('comment_view')) {
      const parts = linkTo.split(':');
      const animeId = parts[1] || metadata?.animeId;
      const commentId = parts[2] || metadata?.commentId;
      if (animeId) {
        navigateTo('anime_comments', { animeId, focusCommentId: commentId });
      }
    } else if (linkTo.startsWith('manga_details')) {
      const parts = linkTo.split(':');
      const mangaId = parts[1] || metadata?.mangaId;
      if (mangaId) {
        navigateTo('manga_details', { id: mangaId });
      }
    } else if (linkTo.startsWith('anime_details')) {
      const parts = linkTo.split(':');
      const animeId = parts[1] || metadata?.animeId;
      if (animeId) {
        navigateTo('anime_details', { id: animeId });
      }
    } else if (linkTo.startsWith('watch_episode')) {
      const parts = linkTo.split(':');
      const animeId = parts[1] || metadata?.animeId;
      const epNum = parts[2] || '1';
      if (animeId) {
        navigateTo('anime_details', { id: animeId, autoplayEpisode: Number(epNum) });
      }
    } else {
      navigateTo('home');
    }
  }, []);

  const handleToastClick = useCallback((toast: any) => {
    setActiveToasts(prev => prev.filter(t => t.id !== toast.id));
    navigateByLinkTo(toast.linkTo, toast.metadata);
  }, [navigateByLinkTo]);

  useEffect(() => {
    const handleOpenChat = () => {
      setViewStack(prev => (prev[prev.length - 1]?.name === 'ai_chat' ? prev : [...prev, { name: 'ai_chat' }]));
    };
    const handleOpenPermissions = () => {
      localStorage.removeItem('mod_permissions_prompted');
      setAskPermissions(true);
    };
    const handleOpenDiagnostics = (e: Event) => {
      const initialTab = (e as CustomEvent)?.detail?.initialTab || 'errors';
      setViewStack(prev => {
        const last = prev[prev.length - 1];
        if (last?.name === 'diagnostics') {
          return [...prev.slice(0, -1), { name: 'diagnostics', props: { initialTab } }];
        }
        return [...prev, { name: 'diagnostics', props: { initialTab } }];
      });
    };
    const handleOpenLegal = (e: Event) => {
      const section = (e as CustomEvent)?.detail?.section || 'privacy';
      setViewStack(prev => [...prev, { name: 'legal_view', props: { section } }]);
    };
    const handleDefaultHomeChanged = (e: Event) => {
      const nextMode = (e as CustomEvent)?.detail?.mode;
      if (nextMode === 'anime' || nextMode === 'manga') {
        setHomeMode(nextMode);
      }
    };
    const handleOnboardingReset = () => {
      setOnboardingDone(false);
    };
    window.addEventListener('open-ai-chat', handleOpenChat);
    window.addEventListener('open-permissions-modal', handleOpenPermissions);
    window.addEventListener('otaku:open-diagnostics', handleOpenDiagnostics);
    window.addEventListener('open-legal-view', handleOpenLegal);
    window.addEventListener(HOME_MODE_CHANGED_EVENT, handleDefaultHomeChanged);
    window.addEventListener(ONBOARDING_RESET_EVENT, handleOnboardingReset);

    // Prompt for permissions on mount only AFTER onboarding is completed
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (typeof window !== 'undefined' && isOnboardingCompleted()) {
      const prompted = localStorage.getItem('mod_permissions_prompted');
      if (prompted !== 'true') {
        timer = setTimeout(() => {
          setAskPermissions(true);
        }, 800);
      }
    }

    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener('open-ai-chat', handleOpenChat);
      window.removeEventListener('open-permissions-modal', handleOpenPermissions);
      window.removeEventListener('otaku:open-diagnostics', handleOpenDiagnostics);
      window.removeEventListener('open-legal-view', handleOpenLegal);
      window.removeEventListener(HOME_MODE_CHANGED_EVENT, handleDefaultHomeChanged);
      window.removeEventListener(ONBOARDING_RESET_EVENT, handleOnboardingReset);
    };
  }, []);

  const currentView = viewStack[viewStack.length - 1];
  const [exitToastVisible, setExitToastVisible] = useState(false);
  const lastBackPressRef = useRef<number>(0);
  const viewStackRef = useRef(viewStack);
  const activeTabRef = useRef(activeTab);
  const askPermissionsRef = useRef(askPermissions);
  const homeModeRef = useRef<HomeMode>(homeMode);

  useEffect(() => {
    homeModeRef.current = homeMode;
  }, [homeMode]);

  // الاستماع اللحظي لإعدادات الإدارة الخاصة بالشاشتين الرئيسيتين (الأنمي والمانجا)
  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'globalSettings', 'slider'),
      (snap) => {
        if (!snap.exists()) return;
        const cfg = normalizeDualHomeConfig((snap.data() as any)?.dualHomeConfig);
        setDualHomeConfig(cfg);
        if (!cfg.enableMangaHome) {
          setHomeMode('anime');
        } else if (!cfg.enableAnimeHome) {
          setHomeMode('manga');
        } else {
          try {
            if (!localStorage.getItem('anime_mod_default_home_mode')) {
              setHomeMode(cfg.defaultVisitorHome);
            }
          } catch {}
        }
      },
      () => {},
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    viewStackRef.current = viewStack;
  }, [viewStack]);

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    askPermissionsRef.current = askPermissions;
  }, [askPermissions]);

  // تشغيل محرك إشعارات الاكتشاف والحلقات/الأعمال الجديدة خارج التطبيق مع دعم التوجيه عند النقر
  useEffect(() => {
    const cleanupDiscovery = initExternalDiscoveryNotifications({
      getHomeMode: () => homeModeRef.current,
      onNavigateLink: (linkTo) => navigateByLinkTo(linkTo),
    });

    const cleanupNativeTap = registerNativeNotificationTapListener((extra) => {
      if (extra?.linkTo) {
        navigateByLinkTo(String(extra.linkTo), extra.metadata);
      }
    });

    return () => {
      cleanupDiscovery();
      cleanupNativeTap();
    };
  }, [navigateByLinkTo]);

  // تفعيل وضع ملء الشاشة الأصلي في أندرويد (Capacitor StatusBar) مع قراءة أبعاد النتوء والشاشة
  useEffect(() => {
    applyViewportAndCutoutMetrics();
    if (!Capacitor.isNativePlatform()) return;
    if (!Capacitor.isPluginAvailable('StatusBar')) return;
    try {
      StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {});
      StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
      StatusBar.hide().catch(() => {});
    } catch {}
  }, []);

  const navigateTo = (viewName: string, props?: any, options?: { replaceTop?: boolean }) => {
    setViewStack(prev => {
      if (options?.replaceTop && prev.length > 0 && prev[prev.length - 1].name === viewName) {
        return [...prev.slice(0, -1), { name: viewName, props }];
      }
      const bounded = prev.length >= 30 ? prev.slice(-29) : prev;
      return [...bounded, { name: viewName, props }];
    });
    if (!Capacitor.isNativePlatform() && !options?.replaceTop) {
      try {
        window.history.pushState({ view: viewName, depth: viewStackRef.current.length }, '');
      } catch {}
    }
  };

  const goBack = () => {
    if (viewStackRef.current.length > 1) {
      setViewStack(prev => prev.slice(0, -1));
    } else if (activeTabRef.current !== 'home') {
      setActiveTab('home');
      setViewStack([{ name: 'home' }]);
    }
  };

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setViewStack([{ name: tab }]);
    if (!Capacitor.isNativePlatform()) {
      try {
        window.history.pushState({ view: tab, depth: 0 }, '');
      } catch {}
    }
  };

  // دعم زر الرجوع بالنظام (Android Hardware Back Button عبر @capacitor/app) للرجوع داخل الصفحات والخروج النظيف من الرئيسية
  useEffect(() => {
    const isNative = Capacitor.isNativePlatform();

    const handleHardwareBackAction = (): boolean => {
      if (askPermissionsRef.current) {
        setAskPermissions(false);
        return true;
      }

      // 1. إذا كانت هناك صفحات فرعية مفتوحة نعود خطوة واحدة للخلف داخل التطبيق
      if (viewStackRef.current.length > 1) {
        setViewStack(prev => prev.slice(0, -1));
        return true;
      }

      // 2. إذا كان المستخدم في تبويب آخر غير الرئيسية نرجعه إلى الرئيسية
      if (activeTabRef.current !== 'home') {
        setActiveTab('home');
        setViewStack([{ name: 'home' }]);
        return true;
      }

      // 3. في الشاشة الرئيسية: ضغطة ثانية سريعة تخرج من التطبيق نهائياً عبر @capacitor/app
      const now = Date.now();
      if (now - lastBackPressRef.current < 2200) {
        CapacitorApp.exitApp().catch(() => {
          const navApp = (navigator as any)?.app;
          if (navApp?.exitApp) navApp.exitApp();
        });
        return false;
      }

      lastBackPressRef.current = now;
      setExitToastVisible(true);
      setTimeout(() => setExitToastVisible(false), 2200);
      if (!isNative) {
        try {
          window.history.pushState({ view: 'home', depth: 0 }, '');
        } catch {}
      }
      return true;
    };

    (window as any).handleAndroidBack = handleHardwareBackAction;

    if (isNative) {
      let listenerRemoved = false;
      let listenerHandle: { remove: () => Promise<void> } | null = null;
      CapacitorApp.addListener('backButton', () => {
        handleHardwareBackAction();
      })
        .then((handle) => {
          if (listenerRemoved) {
            handle.remove().catch(() => {});
          } else {
            listenerHandle = handle;
          }
        })
        .catch(() => {});

      return () => {
        listenerRemoved = true;
        listenerHandle?.remove().catch(() => {});
      };
    }

    try {
      window.history.replaceState({ view: 'home', depth: 0 }, '');
      window.history.pushState({ view: 'home', depth: 0 }, '');
    } catch {}

    const onPopState = () => {
      handleHardwareBackAction();
    };

    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
    };
  }, []);

  if (showSplash) {
    return (
      <MascotLoadingScreen 
        authLoading={loading} 
        onComplete={() => {
          setShowSplash(false);
          if (typeof window !== 'undefined' && isOnboardingCompleted()) {
            const prompted = localStorage.getItem('mod_permissions_prompted');
            if (prompted !== 'true') {
              setAskPermissions(true);
            }
          }
        }} 
      />
    );
  }

  if (!onboardingDone) {
    return (
      <OnboardingView
        onComplete={(chosenHome) => {
          setHomeMode(chosenHome);
          setOnboardingDone(true);
          setActiveTab('home');
          setViewStack([{ name: 'home' }]);
          if (typeof window !== 'undefined') {
            const prompted = localStorage.getItem('mod_permissions_prompted');
            if (prompted !== 'true') {
              setTimeout(() => setAskPermissions(true), 250);
            }
          }
        }}
      />
    );
  }

  if (askPermissions) {
    return <PermissionPromptModal forceOpen={true} onComplete={() => setAskPermissions(false)} />;
  }

  if (banInfo && banInfo.isBanned) {
    return (
      <div className="min-h-screen bg-[#070707] text-white flex flex-col items-center justify-center p-6 text-center select-none" dir="rtl">
        <div className="bg-[#121212] border border-red-500/20 max-w-md w-full rounded-2xl p-8 space-y-6 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-red-600 via-orange-500 to-red-600 animate-pulse"></div>
          <div className="w-20 h-20 bg-red-600/10 border border-red-500/15 rounded-full flex items-center justify-center mx-auto text-4xl shadow-lg ring-4 ring-red-600/5">
            🚫
          </div>
          
          <div className="space-y-2 animate-fadeIn">
            <h1 className="text-xl font-black text-white tracking-tight">تم حظر حسابك بقرار إشرافي</h1>
            <p className="text-xs text-neutral-400 leading-relaxed">لقد تم تعليق حسابك نهائياً من دخول منصة أوتاكو هاب لمخالفتك شروط وقواعد الاستخدام والآداب العامة.</p>
          </div>

          <div className="bg-[#0b0b0b] border border-white/5 rounded-xl p-4 text-right space-y-2">
            <span className="text-[10px] font-bold text-neutral-500 block uppercase tracking-wider font-mono">سبب الحظر الإداري:</span>
            <p className="text-sm font-bold text-red-400 leading-relaxed">{banInfo.reason || 'مخالفة معايير مجتمع أوتاكو هاب وتكرار السلوكيات السلبية والسبام.'}</p>
          </div>

          <div className="text-xs text-neutral-500 font-semibold space-y-1">
            <p>إذا كنت ترى أن هذا القرار متسرع أو به خطأ، يمكنك التواصل مع الدعم الفني لتقديم التماس.</p>
            <p className="text-[10px] font-mono text-neutral-600 mt-2">معرف المستخدم المتأثر (ID): {user?.id || 'N/A'}</p>
          </div>
        </div>
      </div>
    );
  }

  const canToggleHomeMode = dualHomeConfig.enableAnimeHome && dualHomeConfig.enableMangaHome;
  const effectiveHomeMode: HomeMode = !dualHomeConfig.enableMangaHome
    ? 'anime'
    : !dualHomeConfig.enableAnimeHome
    ? 'manga'
    : homeMode;

  const renderView = () => {
    switch (currentView.name) {
      case 'home':
        return (
          <div className="w-full">
            <AnimatePresence mode="wait">
              {effectiveHomeMode === 'manga' ? (
                <motion.div
                  key="home-manga-screen"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.18 }}
                >
                  <Suspense fallback={<ViewFallback />}>
                    <MangaHubView
                      isHomeMode
                      onMangaClick={(id) => navigateTo('manga_details', { id })}
                      onReadMangaChapter={(params) => navigateTo('manga_reader', params)}
                      onOpenSearch={(params) => {
                        setActiveTab('watch');
                        navigateTo('watch', { initialMediaKind: 'manga', ...params });
                      }}
                    />
                  </Suspense>
                </motion.div>
              ) : (
                <motion.div
                  key="home-anime-screen"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.18 }}
                >
                  <HomeView
                    onAnimeClick={(id, epNum) => navigateTo('anime_details', { id, autoplayEpisode: epNum })}
                    onMangaClick={(id) => navigateTo('manga_details', { id })}
                    onNavigateToMangaHub={() => setHomeMode('manga')}
                    onReadMangaChapter={(params) => navigateTo('manga_reader', params)}
                    onSearchCategory={(cat) => {
                      setActiveTab('watch');
                      navigateTo('watch', { initialGenre: cat, initialMediaKind: 'anime' });
                    }}
                    onNavigateToSchedule={(day) => navigateTo('schedule', { initialDay: day })}
                    onNavigateToRecent={() => navigateTo('recent_episodes')}
                    onNavigateToSeason={() => navigateTo('current_season')}
                    onNavigateToMovies={() => navigateTo('anime_movies')}
                    onNavigateToTopAnime={() => navigateTo('top_anime')}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      case 'watch': 
        return (
          <ExploreView
            onAnimeClick={(id) => navigateTo('anime_details', { id })}
            onMangaClick={(id) => navigateTo('manga_details', { id })}
            initialQuery={currentView.props?.initialQuery}
            initialGenre={currentView.props?.initialGenre}
            initialMediaKind={currentView.props?.initialMediaKind}
            initialOrigin={currentView.props?.initialOrigin}
            onNavigate={navigateTo}
          />
        );
      case 'community':
        return (
          <CommunityView
            focusCommentId={currentView.props?.focusCommentId}
            onUserClick={(userId) => navigateTo('other_profile', { userId })}
            onAnimeClick={(id) => navigateTo('anime_details', { id })}
            onNavigate={navigateTo}
          />
        );
      case 'lists':
        return <MyListsView onAnimeClick={(id) => navigateTo('anime_details', { id })} onMangaClick={(id) => navigateTo('manga_details', { id })} />;
      case 'more':
        return <MoreView onNavigate={navigateTo} />;
      case 'manga_hub':
        return (
          <MangaHubView
            onBack={goBack}
            onMangaClick={(id) => navigateTo('manga_details', { id })}
            onOpenSearch={(params) => {
              setActiveTab('watch');
              navigateTo('watch', { initialMediaKind: 'manga', ...params });
            }}
          />
        );
      case 'manga_details':
        return (
          <MangaDetailsView
            key={currentView.props?.id}
            mangaId={currentView.props?.id}
            onBack={goBack}
            onMangaClick={(id) => navigateTo('manga_details', { id })}
            onAnimeClick={(id) => navigateTo('anime_details', { id })}
            onReadChapter={(params) => navigateTo('manga_reader', params)}
            onNavigateDownloads={() => navigateTo('downloads')}
            onUserClick={(userId) => navigateTo('other_profile', { userId })}
            onNavigate={navigateTo}
          />
        );
      case 'manga_reader':
        return (
          <MangaReaderView
            key={`${currentView.props?.manga?._id || ''}-${currentView.props?.chapter?.id || ''}`}
            manga={currentView.props?.manga}
            chapter={currentView.props?.chapter}
            chapters={currentView.props?.chapters || []}
            initialPage={currentView.props?.initialPage}
            offlineItemId={currentView.props?.offlineItemId}
            onBack={goBack}
            onSelectChapter={(ch) =>
              navigateTo(
                'manga_reader',
                {
                  ...currentView.props,
                  chapter: ch,
                  initialPage: 1,
                  offlineItemId: undefined,
                },
                { replaceTop: true },
              )
            }
            onUserClick={(userId) => navigateTo('other_profile', { userId })}
          />
        );
      case 'profile':
        return (
          <ProfileView
            openSettingsInitially={currentView.props?.openSettingsInitially}
            onAdminClick={() => navigateTo('admin')}
            onRewardsClick={() => navigateTo('rewards')}
            onLevelPerksClick={() => navigateTo('level_perks')}
            onOpenAccountSettings={() => navigateTo('account_settings')}
            onOpenAppearance={() => navigateTo('profile_appearance')}
            onBack={() => (viewStackRef.current.length > 1 ? goBack() : handleTabChange('home'))}
          />
        );
      case 'account_settings':
        return (
          <AccountSecurityView
            onBack={goBack}
            onOpenAppearance={() => navigateTo('profile_appearance')}
            onLogout={() => handleTabChange('home')}
            onOpenLegal={(section) => navigateTo('legal_view', { section })}
          />
        );
      case 'profile_appearance':
        return (
          <ProfileAppearanceView
            onBack={goBack}
            onNavigateToStore={() => navigateTo('store')}
          />
        );
      case 'tournaments':
        return <OtakuArenaHubView initialTab="tournaments" onBack={goBack} onUserClick={(userId) => navigateTo('other_profile', { userId })} onNavigate={navigateTo} />;
      case 'other_profile':
        return (
          <ProfileView
            userId={currentView.props?.userId}
            onBack={goBack}
            onChallengeUser={(targetUser) =>
              navigateTo('games', { initialTab: 'games', initialChallengeUser: targetUser })
            }
          />
        );
      case 'anime_details':
        return <AnimeDetailsView key={currentView.props?.t || currentView.props?.id} id={currentView.props?.id} showComments={currentView.props?.showComments} focusCommentId={currentView.props?.focusCommentId} autoplayEpisode={currentView.props?.autoplayEpisode} onBack={goBack} onHome={() => handleTabChange('home')} onWatch={(ep, anime) => navigateTo('watch_episode', { episode: ep, anime })} onAnimeClick={(id, epNum) => navigateTo('anime_details', id === 'random' ? { id: 'random', t: Date.now() } : { id, autoplayEpisode: epNum }, id === 'random' ? { replaceTop: true } : undefined)} onMangaClick={(id) => navigateTo('manga_details', { id })} onNavigate={navigateTo} />;
      case 'anime_comments':
        return <AnimeCommentsView animeId={currentView.props?.animeId} focusCommentId={currentView.props?.focusCommentId} onBack={goBack} onAnimeClick={(id) => navigateTo('anime_details', { id })} onUserClick={(userId) => navigateTo('other_profile', { userId })} />;
      case 'watch_episode':
        return (
          <WatchView
            key={`${currentView.props?.anime?._id || ''}-${currentView.props?.episode?.id || currentView.props?.episode?.num || ''}`}
            onBack={goBack}
            episode={currentView.props?.episode}
            anime={currentView.props?.anime}
            onAnimeClick={() => {
              const targetAnimeId = currentView.props?.anime?._id || currentView.props?.anime?.malId;
              const prevView = viewStack[viewStack.length - 2];
              if (prevView && prevView.name === 'anime_details') {
                goBack();
              } else if (targetAnimeId) {
                navigateTo('anime_details', { id: targetAnimeId });
              } else {
                goBack();
              }
            }}
            onOpenDownloads={() => navigateTo('downloads')}
          />
        );
      case 'admin':
        if (!isAdmin && userRole !== 'owner' && userRole !== 'admin' && userRole !== 'moderator') {
          return (
            <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6 selection:bg-rose-600/50 selection:text-white animate-fadeIn" dir="rtl" id="app_unauthorized_guard">
              <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-2xl text-center max-w-sm w-full shadow-xl">
                <h2 className="text-zinc-100 text-lg font-bold mb-2">القسم مغلق للعامة 🛡️</h2>
                <p className="text-zinc-400 text-xs leading-relaxed">
                  هذه الزاوية الإشرافية والتحليلية مخصصة فقط لأعضاء طاقم الدعم والرقابة المعتمدين لمنصة الأوتوكو.
                </p>
                <button 
                  onClick={goBack} 
                  className="mt-6 w-full bg-zinc-800 hover:bg-zinc-750 text-zinc-100 font-semibold py-2 rounded-xl text-xs transition cursor-pointer border border-zinc-700/60"
                >
                  العودة للخلف
                </button>
              </div>
            </div>
          );
        }
        return <AdminDashboardView onBack={goBack} initialTab={currentView.props?.initialTab} onNavigate={(view, props) => {
          if (view === 'community') {
            handleTabChange('community');
          } else {
            navigateTo(view, props);
          }
        }} />;
      case 'games':
        return (
          <OtakuArenaHubView
            initialTab={currentView.props?.initialTab || 'games'}
            initialRoomCode={currentView.props?.initialRoomCode}
            initialChallengeUser={currentView.props?.initialChallengeUser}
            onBack={goBack}
            onUserClick={(userId) => navigateTo('other_profile', { userId })}
            onNavigate={navigateTo}
          />
        );
      case 'leaderboard':
        return <OtakuArenaHubView initialTab="leaderboard" onBack={goBack} onUserClick={(userId) => navigateTo('other_profile', { userId })} onNavigate={navigateTo} />;
      case 'schedule':
        return <ScheduleView onBack={goBack} onAnimeClick={(id) => navigateTo('anime_details', { id })} initialDay={currentView.props?.initialDay} />;
      case 'store':
        return <StoreView onBack={goBack} />;
      case 'recent_episodes':
        return <RecentEpisodesView onBack={goBack} onAnimeClick={(id, epNum) => navigateTo('anime_details', { id, autoplayEpisode: epNum })} />;
      case 'current_season':
        return <CurrentSeasonView onBack={goBack} onAnimeClick={(id) => navigateTo('anime_details', { id })} />;
      case 'anime_movies':
        return <CatalogCollectionView mode="movies" onBack={goBack} onAnimeClick={(id) => navigateTo('anime_details', { id })} />;
      case 'top_anime':
        return <CatalogCollectionView mode="top" onBack={goBack} onAnimeClick={(id) => navigateTo('anime_details', { id })} />;
      case 'downloads':
        return (
          <DownloadsView
            onBack={goBack}
            onExplore={() => {
              setActiveTab('watch');
              setViewStack([{ name: 'watch' }]);
            }}
            onOpenAnime={(id) => navigateTo('anime_details', { id })}
            onOpenManga={(id) => navigateTo('manga_details', { id })}
            onOpenOfflineChapter={(item) => {
              const targetMangaId = String(item.mangaId || item.animeId || '');
              const siblingOfflineChapters = downloadManagerService
                .getSnapshot()
                .filter(
                  (q) =>
                    q.itemType === 'chapter' &&
                    q.status === 'completed' &&
                    q.hasOfflineFile &&
                    String(q.mangaId || q.animeId || '') === targetMangaId,
                )
                .map((q) => ({
                  id: q.chapterId || q.episodeUrl,
                  num: q.chapterNum || q.episodeNum,
                  chapterNumber: Number(q.chapterNum || q.episodeNum || 1),
                  title: q.chapterTitle || q.episodeTitle,
                }))
                .sort((a, b) => a.chapterNumber - b.chapterNumber);

              navigateTo('manga_reader', {
                manga: {
                  _id: targetMangaId,
                  mangadexId: item.mangadexId,
                  title: item.animeTitle,
                  posterUrl: item.posterUrl,
                  mediaFormat: item.mediaFormat,
                  defaultReadingMode:
                    item.mediaFormat === 'manhwa' || item.mediaFormat === 'manhua'
                      ? 'webtoon'
                      : 'paged',
                },
                chapter: {
                  id: item.chapterId || item.episodeUrl,
                  num: item.chapterNum || item.episodeNum,
                  chapterNumber: Number(item.chapterNum || item.episodeNum || 1),
                  title: item.chapterTitle || item.episodeTitle,
                },
                chapters: siblingOfflineChapters,
                offlineItemId: item.id,
              });
            }}
          />
        );
      case 'level_perks':
        return <LevelPerksView onBack={goBack} onNavigateToStore={() => navigateTo('store')} />;
      case 'rewards':
        return <RewardsView onBack={goBack} />;
      case 'favorites':
        return <FavoritesView onBack={goBack} onAnimeClick={(id) => navigateTo('anime_details', { id })} />;
      case 'notifications':
        return <NotificationsView onBack={goBack} onNavigate={navigateTo} />;
      case 'suggestions_hub':
        return <OtakuArenaHubView initialTab="arena" onBack={goBack} onUserClick={(userId) => navigateTo('other_profile', { userId })} onNavigate={navigateTo} />;
      case 'diagnostics':
        return <DiagnosticsView onBack={goBack} initialTab={currentView.props?.initialTab} />;
      case 'ai_chat':
        return <AiChatView onBack={goBack} onNavigate={navigateTo} onMangaClick={(id) => navigateTo('manga_details', { id })} />;
      case 'ad_support':
        return <SupportPortalView onBack={goBack} initialTab="rewards" />;
      case 'support_help':
        return <SupportPortalView onBack={goBack} initialTab="tickets" />;
      case 'support_suggestions':
        return <SupportPortalView onBack={goBack} initialTab="suggestions" />;
      case 'support_donate':
        return <SupportPortalView onBack={goBack} initialTab="donate" />;
      case 'support_chat':
        return <SupportPortalView onBack={goBack} initialTab="chat" />;
      case 'support_news':
        return <SupportPortalView onBack={goBack} initialTab="news" />;
      case 'legal_privacy':
        return <LegalAboutView onBack={goBack} initialSection="privacy" onOpenAccountSettings={() => navigateTo('account_settings')} />;
      case 'legal_terms':
        return <LegalAboutView onBack={goBack} initialSection="terms" onOpenAccountSettings={() => navigateTo('account_settings')} />;
      case 'legal_about':
        return <LegalAboutView onBack={goBack} initialSection="about" onOpenAccountSettings={() => navigateTo('account_settings')} />;
      case 'legal_safety':
        return <LegalAboutView onBack={goBack} initialSection="data_safety" onOpenAccountSettings={() => navigateTo('account_settings')} />;
      case 'legal_view':
        return <LegalAboutView onBack={goBack} initialSection={currentView.props?.section || 'about'} onOpenAccountSettings={() => navigateTo('account_settings')} />;
      default:
        return (
          <HomeView
            onAnimeClick={(id) => navigateTo('anime_details', { id })}
            onMangaClick={(id) => navigateTo('manga_details', { id })}
            onNavigateToMangaHub={() => navigateTo('manga_hub')}
            onReadMangaChapter={(params) => navigateTo('manga_reader', params)}
            onNavigateToSchedule={(day) => navigateTo('schedule', { initialDay: day })}
            onNavigateToRecent={() => navigateTo('recent_episodes')}
            onNavigateToSeason={() => navigateTo('current_season')}
            onNavigateToMovies={() => navigateTo('anime_movies')}
            onNavigateToTopAnime={() => navigateTo('top_anime')}
          />
        );
    }
  };

  // Do not show AppLayout (top/bottom navs) if we are in fullscreen views like profile, details or watch
  const isFullScreenView = currentView.name === 'profile' || currentView.name === 'account_settings' || currentView.name === 'profile_appearance' || currentView.name === 'diagnostics' || currentView.name === 'suggestions_hub' || currentView.name === 'ai_chat' || currentView.name === 'level_perks' || currentView.name === 'anime_details' || currentView.name === 'anime_comments' || currentView.name === 'watch_episode' || currentView.name === 'manga_hub' || currentView.name === 'manga_details' || currentView.name === 'manga_reader' || currentView.name === 'admin' || currentView.name === 'games' || currentView.name === 'leaderboard' || currentView.name === 'store' || currentView.name === 'schedule' || currentView.name === 'tournaments' || currentView.name === 'recent_episodes' || currentView.name === 'current_season' || currentView.name === 'anime_movies' || currentView.name === 'top_anime' || currentView.name === 'downloads' || currentView.name === 'rewards' || currentView.name === 'other_profile' || currentView.name === 'favorites' || currentView.name === 'notifications' || currentView.name === 'ad_support' || currentView.name === 'support_help' || currentView.name === 'support_suggestions' || currentView.name === 'support_donate' || currentView.name === 'support_chat' || currentView.name === 'support_news' || currentView.name === 'legal_privacy' || currentView.name === 'legal_terms' || currentView.name === 'legal_about' || currentView.name === 'legal_safety' || currentView.name === 'legal_view';

  return (
    <>
      <MascotOfflineScreen />
      <ViewportPortal>
        <AnimatePresence>
          {exitToastVisible && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              style={{ bottom: 'calc(var(--safe-bottom, 0px) + 5.75rem)' }}
              className="fixed left-1/2 -translate-x-1/2 z-[99999] bg-zinc-900/95 border border-white/15 text-white text-xs font-bold px-5 py-2.5 rounded-full shadow-2xl backdrop-blur-md pointer-events-none whitespace-nowrap"
              dir="rtl"
            >
              اضغط زر الرجوع مرة أخرى للخروج من التطبيق
            </motion.div>
          )}
        </AnimatePresence>
        {/* Real-time Swipeable Toast Notifications Overlay pinned inside visible screen below camera cutout */}
        <div
          style={{
            top: 'calc(var(--safe-top, 0px) + 0.75rem)',
            paddingLeft: 'var(--safe-left, 0px)',
            paddingRight: 'var(--safe-right, 0px)',
          }}
          className="fixed right-3 left-3 sm:left-auto sm:right-6 sm:w-[380px] z-[99999] flex flex-col gap-2.5 pointer-events-none"
          dir="rtl"
        >
        <AnimatePresence mode="popLayout">
          {activeToasts.map((toast, idx) => (
            <SwipeableToastItem
              key={toast.id || `toast-${idx}`}
              toast={toast}
              onDismiss={dismissToast}
              onClick={handleToastClick}
            />
          ))}
        </AnimatePresence>
      </div>
      </ViewportPortal>

      {isFullScreenView ? (
        <motion.div
          key={`${currentView.name}-${viewStack.length}-${currentView.props?.id || currentView.props?.animeId || currentView.props?.userId || currentView.props?.episode?.id || currentView.props?.episode?.num || currentView.props?.chapter?.id || currentView.props?.t || ''}`}
          initial={{ opacity: 0.7 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.12, ease: 'easeOut' }}
          style={{
            paddingTop:
              currentView.name === 'anime_details' || currentView.name === 'watch_episode' || currentView.name === 'manga_details' || currentView.name === 'manga_reader'
                ? '0px'
                : 'var(--safe-top, 0px)',
            paddingBottom: 'var(--safe-bottom, 0px)',
            paddingLeft: 'var(--safe-left, 0px)',
            paddingRight: 'var(--safe-right, 0px)',
          }}
          className="h-full w-full bg-black min-h-[var(--vv-height,100dvh)] relative"
        >
          <ViewErrorBoundary
            viewName={currentView.name}
            resetKey={`${currentView.name}-${viewStack.length}-${currentView.props?.id || ''}`}
            onGoHome={() => handleTabChange('home')}
          >
            <Suspense fallback={<ViewFallback />}>
              {renderView()}
            </Suspense>
          </ViewErrorBoundary>
        </motion.div>
      ) : (
        <AppLayout
          activeTab={activeTab}
          setActiveTab={handleTabChange}
          onNavigateTo={navigateTo}
          homeMode={effectiveHomeMode}
          canToggleHomeMode={canToggleHomeMode}
          onToggleHomeMode={
            canToggleHomeMode
              ? () => setHomeMode((prev) => (prev === 'anime' ? 'manga' : 'anime'))
              : undefined
          }
        >
          <motion.div
            key={`${currentView.name}-${viewStack.length}-${currentView.props?.initialQuery || currentView.props?.initialGenre || currentView.props?.initialMediaKind || currentView.props?.focusCommentId || ''}`}
            initial={{ opacity: 0.7 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.12, ease: 'easeOut' }}
            className="h-full w-full"
          >
            <ViewErrorBoundary
              viewName={currentView.name}
              resetKey={`${currentView.name}-${viewStack.length}-${currentView.props?.initialQuery || currentView.props?.initialGenre || currentView.props?.initialMediaKind || ''}`}
              onGoHome={() => handleTabChange('home')}
            >
              <Suspense fallback={<ViewFallback />}>
                {renderView()}
              </Suspense>
            </ViewErrorBoundary>
          </motion.div>
        </AppLayout>
      )}
    </>
  );
}
