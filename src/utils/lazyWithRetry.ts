import { lazy, type ComponentType } from 'react';
import { recordTelemetryError } from './errorTelemetry';

export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  moduleLabel: string
) {
  return lazy(async () => {
    const delays = [350, 900];
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
