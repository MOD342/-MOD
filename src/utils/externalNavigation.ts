import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';

let bridgeInstalled = false;

function getNativeBridge(): any {
  return typeof window !== 'undefined' ? (window as any).AndroidNativeBridge : undefined;
}

function extractFallbackUrlFromIntent(intentUri: string): string | null {
  try {
    const match = intentUri.match(/S\.browser_fallback_url=([^;]+)/i);
    if (match?.[1]) {
      const decoded = decodeURIComponent(match[1]);
      if (/^https?:\/\//i.test(decoded)) return decoded;
    }
  } catch {}
  return null;
}

export async function openExternalUrl(rawUrl: string): Promise<boolean> {
  if (!rawUrl || typeof window === 'undefined') return false;
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed === 'about:blank') return false;

  const isNative = Capacitor.isNativePlatform();
  const isHttp = /^https?:\/\//i.test(trimmed);
  const bridge = getNativeBridge();

  // 1. Direct AndroidNativeBridge handler prevents WebView ERR_UNKNOWN_URL_SCHEME white screens
  if (isNative && bridge?.openExternalUrl) {
    try {
      const handled = bridge.openExternalUrl(trimmed);
      if (handled) return true;
    } catch (err) {
      console.warn('[ExternalNav] AndroidNativeBridge.openExternalUrl failed:', err);
    }
  }

  // 2. Native Capacitor Browser plugin for HTTP(S) URLs
  if (isNative && isHttp) {
    try {
      await Browser.open({
        url: trimmed,
        presentationStyle: 'popover',
      });
      return true;
    } catch (err) {
      console.warn('[ExternalNav] Browser.open failed:', err);
    }
  }

  // 3. Safe intent:// handling: NEVER assign window.location.href = "intent://..." inside WebView
  if (/^intent:/i.test(trimmed)) {
    const fallbackUrl = extractFallbackUrlFromIntent(trimmed);
    if (fallbackUrl) {
      if (isNative) {
        try {
          await Browser.open({ url: fallbackUrl, presentationStyle: 'popover' });
          return true;
        } catch {}
      } else {
        try {
          window.open(fallbackUrl, '_blank', 'noopener,noreferrer');
          return true;
        } catch {}
      }
    }
    return false;
  }

  // 4. Non-HTTP custom schemes (tg://, mailto:, tel:) on native without navigation hijack
  if (isNative) {
    try {
      const anchor = document.createElement('a');
      anchor.href = trimmed;
      anchor.rel = 'noopener noreferrer';
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      return true;
    } catch {
      return false;
    }
  }

  // 5. Standard web browser
  try {
    const win = window.open(trimmed, '_blank', 'noopener,noreferrer');
    if (win) return true;
  } catch {}

  try {
    const anchor = document.createElement('a');
    anchor.href = trimmed;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    return true;
  } catch {
    return false;
  }
}

export async function openExternalPlayer(
  streamUrl: string,
  title = 'Anime MOD',
  mimeType = 'video/*'
): Promise<boolean> {
  if (!streamUrl || typeof window === 'undefined') return false;
  const trimmed = streamUrl.trim();
  if (!trimmed) return false;

  const isNative = Capacitor.isNativePlatform();
  const bridge = getNativeBridge();

  // Preferred: Native Android Activity chooser (MX Player / VLC / Nova / Next Player)
  if (isNative && bridge?.openExternalPlayer) {
    try {
      const ok = bridge.openExternalPlayer(trimmed, title, mimeType || 'video/*');
      if (ok) return true;
    } catch (err) {
      console.warn('[ExternalNav] AndroidNativeBridge.openExternalPlayer error:', err);
    }
  }

  // Safe fallback via Capacitor Browser (never raw intent:// in WebView)
  return openExternalUrl(trimmed);
}

export async function openDownloadManager(
  downloadUrl: string,
  filename = 'AnimeMOD-Episode.mp4',
  mimeType = 'video/mp4'
): Promise<boolean> {
  if (!downloadUrl || typeof window === 'undefined') return false;
  const trimmed = downloadUrl.trim();
  if (!trimmed) return false;

  const isNative = Capacitor.isNativePlatform();
  const bridge = getNativeBridge();

  // Preferred: Native Android Download Manager detection (ADM / 1DM / FDM) + Android DownloadManager fallback
  if (isNative && bridge?.openDownloadManager) {
    try {
      const ok = bridge.openDownloadManager(trimmed, filename, mimeType || 'video/mp4');
      if (ok) return true;
    } catch (err) {
      console.warn('[ExternalNav] AndroidNativeBridge.openDownloadManager error:', err);
    }
  }

  return openExternalUrl(trimmed);
}

export function installExternalNavigationBridge(): void {
  if (bridgeInstalled || typeof window === 'undefined') return;
  bridgeInstalled = true;

  if (!Capacitor.isNativePlatform()) return;

  // Intercept <a target="_blank">, intent://, and external <a download> clicks globally inside native APK
  document.addEventListener(
    'click',
    (event) => {
      const target = event.target as HTMLElement | null;
      const anchor = target?.closest?.('a') as HTMLAnchorElement | null;
      if (!anchor) return;

      const href = (anchor.getAttribute('href') || '').trim();
      const targetAttr = (anchor.getAttribute('target') || '').toLowerCase();
      const hasDownloadAttr = anchor.hasAttribute('download');
      if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('blob:')) return;

      if (/^intent:/i.test(href)) {
        event.preventDefault();
        event.stopPropagation();
        void openExternalUrl(href);
        return;
      }

      if (hasDownloadAttr && /^https?:\/\//i.test(href)) {
        event.preventDefault();
        event.stopPropagation();
        void openDownloadManager(href, anchor.getAttribute('download') || 'AnimeMOD-Episode.mp4');
        return;
      }

      if ((targetAttr === '_blank' || targetAttr === '_system') && /^https?:\/\//i.test(href)) {
        event.preventDefault();
        event.stopPropagation();
        void openExternalUrl(href);
      }
    },
    true
  );

  // Bridge window.open for external HTTP(S) / intent URLs on Capacitor WebView
  const nativeWindowOpen = window.open.bind(window);
  window.open = function (url?: string | URL, target?: string, features?: string) {
    const urlStr = url ? String(url).trim() : '';
    if (urlStr && (/^https?:\/\//i.test(urlStr) || /^intent:/i.test(urlStr))) {
      void openExternalUrl(urlStr);
      return { closed: false, focus() {}, close() {} } as unknown as Window;
    }
    return nativeWindowOpen(url, target, features);
  };
}
