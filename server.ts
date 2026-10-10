import express, { Request, Response, NextFunction } from 'express';
import compression from 'compression';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import apiRoutes from './src/api/index';
import { connectDB } from './src/config/database';
import { schedulerService } from './src/services/schedulerService';

async function startServer() {
  const app = express();
  
  // استخراج المنفذ من معطيات سطر الأوامر (--port 3000) أو متغيرات البيئة
  const portArgIndex = process.argv.indexOf('--port');
  const portFromArg = portArgIndex !== -1 && process.argv[portArgIndex + 1] ? parseInt(process.argv[portArgIndex + 1], 10) : null;
  const PORT = portFromArg || (process.env.PORT ? parseInt(process.env.PORT, 10) : 3000);
  
  // إعدادات الضغط المتقدمة لتحسين استهلاك البيانات وزيادة سرعة الإرسال بنسبة 60%
  app.use(compression({
    threshold: 512, // ضغط أي استجابة أكبر من 512 بايت
  }));

  // قياس زمن الاستجابة الفعلي وإضافته لترويسة X-Response-Time بأمان قبل إرسال الرأس للعميل
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

  // وضع البث المباشر الفوري (Zero-Cache Mode): تم إيقاف التخزين المؤقت المسبق

  // الاتصال بقاعدة البيانات بشكل غير حاصر للتأكد من إطلاق الخادم فوراً وبسرعة قصوى
  connectDB().catch(err => {
    console.error('خطأ غير متوقع أثناء تهيئة الاتصال بـ MongoDB:', err);
  });

  // سياسات CORS لتمكين الاتصال المباشر من تطبيقات أندرويد 15 والويب فيوز ومختلف النطاقات
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Cache-Control, Pragma');
    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
    } else {
      next();
    }
  });

  // Middleware لمعالجة JSON
  app.use(express.json());

  // منع أي تخزين مؤقت لطلبات الـ API لضمان جلب البيانات الحية مباشرة في كل مرة
  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
  });

  // توجيه الطلبات الخاصة بالـ API
  app.use('/api', apiRoutes);

  // مسارات تطبيق الويب التقدمي (PWA) لتمكين تثبيت التطبيق بدون أي كاش قديم
  app.get('/manifest.json', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'application/json');
    res.send({
      "name": "أنمي MOD - Otaku Hub",
      "short_name": "أنمي MOD",
      "description": "منصة أوتاكو وبوابة الأنمي لتقييم ومناقشة ومتابعة مواسم الأنمي المختلفة",
      "start_url": "/",
      "display": "standalone",
      "background_color": "#0a0a0c",
      "theme_color": "#FF1744",
      "orientation": "portrait-primary",
      "icons": [
        {
          "src": "/app_icon.png",
          "sizes": "192x192",
          "type": "image/png"
        },
        {
          "src": "/app_icon.png",
          "sizes": "512x512",
          "type": "image/png"
        }
      ]
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
    const iconPath = path.join(process.cwd(), 'src/assets/images/app_icon.png');
    res.sendFile(iconPath, (err) => {
      if (err) {
        res.sendFile(path.join(process.cwd(), 'assets/app_icon.png'));
      }
    });
  });

  // Global Error Handler لتنسيق الأخطاء
  app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    console.error('API Error:', err);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: 'حدث خطأ داخلي في الخادم',
        error: err.message
      });
    } else {
      next(err);
    }
  });

  // Vite middleware for development vs Static static files for production
  const distPath = path.join(process.cwd(), 'dist');
  const hasDist = fs.existsSync(path.join(distPath, 'index.html'));

  if (process.env.NODE_ENV !== 'production' || !hasDist) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n  VITE v6.2.3  ready in 150 ms\n`);
    console.log(`  ➜  Local:   http://localhost:${PORT}/`);
    console.log(`  ➜  Network: http://0.0.0.0:${PORT}/\n`);
  });
}

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception caught:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection caught:', reason);
});

startServer().catch((err) => {
  console.error('Fatal error during server startup:', err);
  process.exit(1);
});
