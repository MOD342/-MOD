import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Filesystem } from '@capacitor/filesystem';

export type UnifiedPermissionStatus = 'granted' | 'denied' | 'default' | 'unsupported';

export interface SystemPermissionsSummary {
  notifications: UnifiedPermissionStatus;
  storage: UnifiedPermissionStatus;
  media: UnifiedPermissionStatus;
}

const APP_PACKAGE_ID = 'com.zoryx';
let channelInitialized = false;

function getNativeBridge(): any {
  return typeof window !== 'undefined' ? (window as any).AndroidNativeBridge : undefined;
}

function mapCapacitorState(state?: string | null): UnifiedPermissionStatus {
  if (!state) return 'default';
  if (state === 'granted') return 'granted';
  if (state === 'denied') return 'denied';
  return 'default';
}

export async function checkSystemPermissionsStatus(): Promise<SystemPermissionsSummary> {
  const result: SystemPermissionsSummary = {
    notifications: 'default',
    storage: 'default',
    media: 'default',
  };

  if (typeof window === 'undefined') {
    return { notifications: 'unsupported', storage: 'unsupported', media: 'unsupported' };
  }

  // 1. Check native Android bridge snapshot if available
  try {
    const bridge = getNativeBridge();
    if (bridge?.getPermissionsSnapshot) {
      const snap = JSON.parse(String(bridge.getPermissionsSnapshot()));
      if (snap?.notifications) result.notifications = mapCapacitorState(snap.notifications);
      if (snap?.storage) result.storage = mapCapacitorState(snap.storage);
    }
  } catch {}

  // 2. Check Capacitor plugins on native platforms
  if (Capacitor.isNativePlatform()) {
    try {
      const notifCheck = await LocalNotifications.checkPermissions();
      result.notifications = mapCapacitorState(notifCheck?.display);
    } catch {}

    if (result.storage !== 'granted') {
      try {
        const fsCheck = await Filesystem.checkPermissions();
        const mapped = mapCapacitorState(fsCheck?.publicStorage);
        if (mapped === 'granted' || result.storage === 'default') {
          result.storage = mapped;
        }
      } catch {}
    }
  } else {
    // Web browser checks
    if ('Notification' in window) {
      result.notifications =
        Notification.permission === 'granted'
          ? 'granted'
          : Notification.permission === 'denied'
          ? 'denied'
          : 'default';
    } else {
      result.notifications = 'unsupported';
    }

    if ('storage' in navigator && 'persisted' in navigator.storage) {
      try {
        const persisted = await navigator.storage.persisted();
        result.storage = persisted ? 'granted' : 'default';
      } catch {}
    } else {
      result.storage = 'unsupported';
    }
  }

  result.media = 'unsupported';
  return result;
}

export async function ensureNotificationChannel(): Promise<void> {
  if (channelInitialized || !Capacitor.isNativePlatform()) return;
  channelInitialized = true;
  try {
    await LocalNotifications.createChannel({
      id: 'animemod_alerts',
      name: 'تنبيهات أوتاكو MOD',
      description: 'إشعارات الحلقات الجديدة والأنميات والفصول المميزة',
      importance: 4,
      visibility: 1,
      vibration: true,
    });
  } catch {}
}

export async function requestSystemNotificationsPermission(): Promise<UnifiedPermissionStatus> {
  if (typeof window === 'undefined') return 'unsupported';

  if (Capacitor.isNativePlatform()) {
    try {
      const bridge = getNativeBridge();
      if (bridge?.requestNotificationPermission) {
        bridge.requestNotificationPermission();
      }
    } catch {}

    try {
      const res = await LocalNotifications.requestPermissions();
      const mapped = mapCapacitorState(res?.display);
      if (mapped === 'granted') {
        await ensureNotificationChannel();
      }
      return mapped;
    } catch (err) {
      console.warn('[Permissions] LocalNotifications.requestPermissions error:', err);
    }
  }

  if ('Notification' in window) {
    try {
      const perm = await Notification.requestPermission();
      return perm === 'granted' ? 'granted' : perm === 'denied' ? 'denied' : 'default';
    } catch {
      return 'denied';
    }
  }

  return 'unsupported';
}

export async function requestSystemStoragePermission(): Promise<UnifiedPermissionStatus> {
  if (typeof window === 'undefined') return 'unsupported';

  if (Capacitor.isNativePlatform()) {
    let status: UnifiedPermissionStatus = 'default';

    // 1. Android < 10 legacy storage permission prompt (Android 10+ uses Scoped Storage automatically)
    try {
      const bridge = getNativeBridge();
      if (bridge?.requestStoragePermissions) {
        bridge.requestStoragePermissions();
      }
    } catch {}

    // 2. Official Capacitor Filesystem runtime check/request
    try {
      const res = await Filesystem.requestPermissions();
      status = mapCapacitorState(res?.publicStorage);
    } catch (err) {
      console.warn('[Permissions] Filesystem.requestPermissions error:', err);
    }

    // Wait briefly so native Android permission dialog callback updates snapshot
    await new Promise((r) => setTimeout(r, 450));
    try {
      const bridge = getNativeBridge();
      if (bridge?.getPermissionsSnapshot) {
        const snap = JSON.parse(String(bridge.getPermissionsSnapshot()));
        if (snap?.storage) {
          status = mapCapacitorState(snap.storage);
        }
      }
    } catch {}

    if (navigator.storage?.persist) {
      navigator.storage.persist().catch(() => {});
    }
    return status;
  }

  if ('storage' in navigator && 'persist' in navigator.storage) {
    try {
      const persisted = await navigator.storage.persist();
      return persisted ? 'granted' : 'default';
    } catch {
      return 'default';
    }
  }

  return 'unsupported';
}

export async function requestSystemMediaPermission(): Promise<UnifiedPermissionStatus> {
  return 'unsupported';
}

export function openSystemAppSettings(target: 'app' | 'notifications' | 'storage' = 'app'): boolean {
  if (typeof window === 'undefined') return false;

  const bridge = getNativeBridge();
  if (bridge) {
    try {
      if (target === 'notifications' && bridge.openNotificationSettings) {
        bridge.openNotificationSettings();
        return true;
      }
      if (target === 'storage' && bridge.openStorageSettings) {
        bridge.openStorageSettings();
        return true;
      }
      if (bridge.openAppSettings) {
        bridge.openAppSettings();
        return true;
      }
    } catch (err) {
      console.warn('[Permissions] Native settings bridge failed:', err);
    }
  }

  if (Capacitor.isNativePlatform()) {
    const action =
      target === 'notifications'
        ? 'android.settings.APP_NOTIFICATION_SETTINGS'
        : 'android.settings.APPLICATION_DETAILS_SETTINGS';
    const extras =
      target === 'notifications'
        ? `S.android.provider.extra.APP_PACKAGE=${encodeURIComponent(APP_PACKAGE_ID)};`
        : '';
    const dataPart = target === 'notifications' ? '' : `data=package:${APP_PACKAGE_ID};`;
    const intentUri = `intent:#Intent;action=${action};${dataPart}${extras}end`;
    try {
      const a = document.createElement('a');
      a.href = intentUri;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return true;
    } catch {
      return false;
    }
  }

  return false;
}

export async function dispatchNativeSystemNotification(params: {
  id?: number | string;
  title: string;
  body: string;
  imageUrl?: string;
  tag?: string;
  scheduleAt?: Date;
  extra?: Record<string, any>;
  onClick?: () => void;
}): Promise<void> {
  if (typeof window === 'undefined') return;

  if (Capacitor.isNativePlatform()) {
    try {
      const check = await LocalNotifications.checkPermissions();
      if (check?.display === 'granted') {
        await ensureNotificationChannel();
        const numericId =
          typeof params.id === 'number'
            ? Math.abs(Math.floor(params.id)) % 2_000_000_000
            : Math.abs(
                String(params.id || Date.now())
                  .split('')
                  .reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) | 0, 7)
              ) % 2_000_000_000;

        const targetDate =
          params.scheduleAt && params.scheduleAt.getTime() > Date.now()
            ? params.scheduleAt
            : new Date(Date.now() + 50);

        await LocalNotifications.schedule({
          notifications: [
            {
              id: numericId || Math.floor(Math.random() * 100000),
              title: params.title || 'أوتاكو MOD ⚡',
              body: params.body || '',
              channelId: 'animemod_alerts',
              extra: params.extra,
              schedule: { at: targetDate },
            },
          ],
        });
        return;
      }
    } catch (err) {
      console.warn('[Notifications] Capacitor LocalNotifications dispatch error:', err);
    }
  }

  if (params.scheduleAt && params.scheduleAt.getTime() > Date.now() + 1000) {
    return;
  }

  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      const options: NotificationOptions = {
        body: params.body || '',
        icon: './app_icon.png',
        dir: 'rtl',
        tag: params.tag,
      };
      if (params.imageUrl) {
        (options as any).image = params.imageUrl;
      }
      const n = new Notification(params.title || 'إشعار جديد ⚡', options);
      n.onclick = () => {
        window.focus();
        params.onClick?.();
      };
    } catch {}
  }
}

export async function cancelNativeSystemNotifications(ids: number[]): Promise<void> {
  if (typeof window === 'undefined' || !Capacitor.isNativePlatform() || ids.length === 0) return;
  try {
    await LocalNotifications.cancel({
      notifications: ids.map((id) => ({ id })),
    });
  } catch {}
}

export function registerNativeNotificationTapListener(
  onTap: (extra: Record<string, any>) => void
): () => void {
  if (typeof window === 'undefined' || !Capacitor.isNativePlatform()) {
    return () => {};
  }

  let removed = false;
  let handle: { remove: () => Promise<void> } | null = null;

  LocalNotifications.addListener('localNotificationActionPerformed', (event) => {
    const extra = event?.notification?.extra;
    if (extra && typeof extra === 'object') {
      onTap(extra);
    }
  })
    .then((listenerHandle) => {
      if (removed) {
        listenerHandle.remove().catch(() => {});
      } else {
        handle = listenerHandle;
      }
    })
    .catch(() => {});

  return () => {
    removed = true;
    handle?.remove().catch(() => {});
  };
}
