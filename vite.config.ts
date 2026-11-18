import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const resolvedApiUrl = (env.VITE_API_URL || process.env.VITE_API_URL || '')
    .trim()
    .replace(/\/+$/, '');

  return {
    // مسار نسبي إجباري لضمان تحميل الأصول داخل حزمة Capacitor / Android WebView (APK)
    base: './',
    plugins: [react(), tailwindcss()],
    define: {
      'import.meta.env.VITE_API_URL': JSON.stringify(resolvedApiUrl),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      // توافقية عالية مع محركات Android System WebView في مختلف إصدارات أندرويد
      target: ['es2020', 'chrome87'],
      cssCodeSplit: true,
      assetsInlineLimit: 4096,
      chunkSizeWarningLimit: 800,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('firebase')) return 'vendor-firebase';
              if (id.includes('motion') || id.includes('framer-motion')) return 'vendor-motion';
              if (id.includes('lucide-react')) return 'vendor-icons';
              if (id.includes('hls.js')) return 'vendor-hls';
              return 'vendor-core';
            }
          },
        },
      },
    },
    server: {
      host: '0.0.0.0',
      // تعطيل HMR عند تمرير DISABLE_HMR=true
      hmr: process.env.DISABLE_HMR === 'true' ? false : undefined,
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      ...(resolvedApiUrl
        ? {
            proxy: {
              '/api': {
                target: resolvedApiUrl,
                changeOrigin: true,
                secure: resolvedApiUrl.startsWith('https://'),
              },
            },
          }
        : {}),
    },
  };
});
