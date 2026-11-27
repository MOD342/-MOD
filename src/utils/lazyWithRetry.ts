import { lazy, type ComponentType } from 'react';
import { recordTelemetryError } from './errorTelemetry';

const CHUNK_RELOAD_KEY = 'otaku_chunk_reload_at_v1';

function isChunkFetchError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err || '')).toLowerCase();
  return (
    msg.includes('failed to fetch dynamically imported module') ||
    msg.includes('importing a module script failed') ||
    msg.includes('error loading dynamically imported module') ||
    msg.includes('chunkloaderror') ||
    msg.includes('loading chunk')
  );
}

export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  moduleLabel: string
) {
  return lazy(async () => {
    const delays = [250, 750, 1500];
    let lastError: unknown;

    for (let attempt = 0; attempt <= delays.length; attempt++) {
      try {
        return await factory();
      } catch (err) {
        lastError = err;
        if (attempt < delays.length) {
          await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
        }
      }
    }

    if (typeof window !== 'undefined' && isChunkFetchError(lastError)) {
      try {
        const lastReload = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) || 0);
        if (!Number.isFinite(lastReload) || Date.now() - lastReload > 15000) {
          sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
          window.location.reload();
          return await new Promise<{ default: T }>(() => {});
        }
      } catch {}
    }

    const message =
      lastError instanceof Error ? lastError.message : String(lastError || 'Dynamic import failed');

    recordTelemetryError({
      source: 'runtime',
      severity: 'error',
      title: `فشل تحميل وحدة الصفحة (${moduleLabel})`,
      message,
      stack: lastError instanceof Error ? lastError.stack : undefined,
    });

    throw lastError;
  });
}
