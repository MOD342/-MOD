import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { createApiExpressApp } from './src/serverApp';
import { schedulerService } from './src/services/schedulerService';

async function startServer() {
  const app = createApiExpressApp();

  // Extract port from CLI args (--port 3000) or PORT env var
  const portArgIndex = process.argv.indexOf('--port');
  const portFromArg =
    portArgIndex !== -1 && process.argv[portArgIndex + 1]
      ? parseInt(process.argv[portArgIndex + 1], 10)
      : null;
  const PORT = portFromArg || (process.env.PORT ? parseInt(process.env.PORT, 10) : 3000);

  // Initialize background cron scheduler only on persistent server runtime
  if (!process.env.VERCEL) {
    try {
      schedulerService.init();
    } catch (schedErr) {
      console.warn('[SchedulerService] Startup init warning:', schedErr);
    }
  }

  // Vite middleware for development vs Static files for production
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
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
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
