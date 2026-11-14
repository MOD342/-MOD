import express, { Request, Response, NextFunction } from 'express';
import compression from 'compression';
import dns from 'dns';
import fs from 'fs';
import path from 'path';
import apiRoutes from './api/index';

// Direct DNS queries through clean resolvers on dedicated hosts (skip in Vercel Lambda VPC)
if (!process.env.VERCEL) {
  try {
    dns.setServers(['94.140.14.14', '94.140.15.15', '1.1.1.1']);
  } catch (dnsErr) {
    console.warn('DNS override skipped:', dnsErr);
  }
}

export function createApiExpressApp(): express.Express {
  const app = express();

  app.use(
    compression({
      threshold: 512,
      filter: (req, res) => {
        if (
          req.path.includes('download-stream') ||
          req.path.includes('play-stream') ||
          req.path.includes('stream-proxy') ||
          req.path === '/api/anime/download'
        ) {
          return false;
        }
        return compression.filter(req, res);
      },
    })
  );

  // Actual response latency header
  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = process.hrtime();
    const originalWriteHead = res.writeHead.bind(res);
    res.writeHead = function (statusCode: any, ...rest: any[]) {
      if (!res.headersSent) {
        const diff = process.hrtime(start);
        const timeInMs = (diff[0] * 1e3 + diff[1] * 1e-6).toFixed(2);
        try {
          res.setHeader('X-Response-Time', `${timeInMs}ms`);
        } catch {
          // ignore if already closed
        }
      }
      return (originalWriteHead as any)(statusCode, ...rest);
    };
    next();
  });

  // Permissive CORS for Capacitor/Android APK, external hosts, and Vercel previews
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-Requested-With, Cache-Control, Pragma'
    );
    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
    } else {
      next();
    }
  });

  app.use(express.json());

  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
  });

  app.use('/api', apiRoutes);

  app.get('/manifest.json', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'application/json');
    res.send({
      name: 'أنمي MOD - Otaku Hub',
      short_name: 'أنمي MOD',
      description: 'منصة أوتاكو وبوابة الأنمي لتقييم ومناقشة ومتابعة مواسم الأنمي المختلفة',
      start_url: '/',
      display: 'standalone',
      background_color: '#0a0a0c',
      theme_color: '#FF1744',
      orientation: 'portrait-primary',
      icons: [
        {
          src: '/app_icon.png',
          sizes: '192x192',
          type: 'image/png',
        },
        {
          src: '/app_icon.png',
          sizes: '512x512',
          type: 'image/png',
        },
      ],
    });
  });

  app.get('/sw.js', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.send(`
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(cacheNames.map((cache) => caches.delete(cache)));
    }).then(() => self.registration.unregister())
  );
  self.clients.claim();
});
    `);
  });

  app.get('/app_icon.png', (req: Request, res: Response) => {
    const candidates = [
      path.join(process.cwd(), 'src/assets/images/app_icon.png'),
      path.join(process.cwd(), 'public/app_icon.png'),
      path.join(process.cwd(), 'dist/app_icon.png'),
    ];
    const found = candidates.find((p) => fs.existsSync(p));
    if (found) {
      return res.sendFile(found);
    }
    return res.status(404).end();
  });

  // Global API error handler
  app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    console.error('API Error:', err);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: 'حدث خطأ داخلي في الخادم',
        error: err.message,
      });
    } else {
      next(err);
    }
  });

  return app;
}
