export const DEFAULT_PRODUCTION_API_URL = '';

export function isRunningInAPKOrExternalShell(): boolean {
  if (typeof window === 'undefined') return false;
  const protocol = window.location.protocol;
  const host = window.location.hostname;

  if (
    protocol === 'file:' ||
    protocol === 'capacitor:' ||
    protocol === 'ionic:' ||
    protocol === 'content:' ||
    Boolean((window as any).Capacitor) ||
    Boolean((window as any).cordova) ||
    Boolean((window as any).AndroidInterface) ||
    Boolean((window as any).ReactNativeWebView)
  ) {
    return true;
  }

  // Capacitor on Android serves the bundled assets over https://localhost without a port
  if (host === 'localhost' && !window.location.port) {
    return true;
  }

  return false;
}

export function isEphemeralCloudHost(rawUrl: string | null | undefined): boolean {
  if (!rawUrl) return false;
  const lower = rawUrl.trim().toLowerCase();
  return (
    lower.includes('your-public-deployed') ||
    lower.includes('example.com') ||
    lower.includes('your-domain') ||
    lower.includes('ais-dev-') ||
    lower.includes('ais-pre-') ||
    lower.includes('.run.app')
  );
}

export function isValidRemoteApiHost(rawUrl: string | null | undefined): boolean {
  if (!rawUrl) return false;
  const trimmed = rawUrl.trim();
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) return false;
  if (isEphemeralCloudHost(trimmed)) return false;
  return true;
}

export function isSameOriginFullStackWeb(): boolean {
  if (typeof window === 'undefined') return false;
  if (isRunningInAPKOrExternalShell()) return false;
  const protocol = window.location.protocol;
  if (protocol !== 'http:' && protocol !== 'https:') return false;
  const host = window.location.hostname.toLowerCase();
  return (
    (host === 'localhost' && Boolean(window.location.port)) ||
    host === '127.0.0.1' ||
    host.includes('.run.app') ||
    host.includes('ais-dev-') ||
    host.includes('ais-pre-') ||
    host.endsWith('.googleusercontent.com') ||
    host.endsWith('.usercontent.goog') ||
    host.endsWith('.up.railway.app') ||
    host.endsWith('.onrender.com') ||
    host.endsWith('.hf.space')
  );
}

export function getConfiguredEnvApiUrl(): string {
  // على الويب الفول-ستاك (المعاينة أو الخادم المستضاف)، نستخدم نفس الأصل دائماً حتى تصل طلبات /api لخادمنا المحدّث
  if (isSameOriginFullStackWeb()) {
    return '';
  }
  const envUrl = ((import.meta as any).env?.VITE_API_URL || '').trim();
  if (isValidRemoteApiHost(envUrl)) {
    return envUrl.replace(/\/+$/, '');
  }
  if (isRunningInAPKOrExternalShell()) {
    return DEFAULT_PRODUCTION_API_URL;
  }
  return '';
}

export function resolveApiBaseHost(): string {
  if (isSameOriginFullStackWeb()) {
    return '';
  }

  try {
    const storedHost = localStorage.getItem('custom_api_host');
    if (isValidRemoteApiHost(storedHost)) {
      return storedHost!.trim().replace(/\/+$/, '');
    }
    if (storedHost && isEphemeralCloudHost(storedHost)) {
      localStorage.removeItem('custom_api_host');
    }
  } catch {}

  const envUrl = getConfiguredEnvApiUrl();
  if (envUrl) {
    return envUrl;
  }

  return '';
}

export function resolveApiUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith('/api')) {
    const configuredHost = resolveApiBaseHost();
    if (configuredHost) {
      return `${configuredHost}${url}`;
    }
  }
  return url;
}

export function resolveAbsoluteApiUrlForExternalIntent(url: string): string {
  if (!url) return url;
  const resolved = resolveApiUrl(url);
  if (resolved.startsWith('http://') || resolved.startsWith('https://')) {
    return resolved;
  }
  if (typeof window !== 'undefined' && resolved.startsWith('/')) {
    return `${window.location.origin}${resolved}`;
  }
  return resolved;
}
