import type { IncomingMessage, ServerResponse } from 'node:http';

type ExpressApp = (req: IncomingMessage, res: ServerResponse) => void;

let cachedApp: ExpressApp | null = null;

async function getApp(): Promise<ExpressApp> {
  if (cachedApp) return cachedApp;
  // @ts-expect-error Compiled by esbuild into api/_lib/app.js during npm run build
  const mod = await import('./_lib/app.js');
  cachedApp = mod.createApiExpressApp();
  return cachedApp;
}

export default async function vercelHandler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const app = await getApp();
    await new Promise<void>((resolve) => {
      let settled = false;
      const done = () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      };
      res.once('finish', done);
      res.once('close', done);
      try {
        app(req, res);
      } catch (innerErr: any) {
        console.error('[Vercel Express Dispatch Error]:', innerErr);
        if (!res.headersSent) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(
            JSON.stringify({
              success: false,
              code: 'VERCEL_EXPRESS_DISPATCH_ERROR',
              message: innerErr?.message || 'خطأ أثناء تنفيذ طلب الخادم',
            })
          );
        }
        done();
      }
    });
  } catch (err: any) {
    console.error('[Vercel Serverless Boot Error]:', err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(
        JSON.stringify({
          success: false,
          code: 'VERCEL_HANDLER_INIT_ERROR',
          message: err?.message || 'فشل تشغيل دالة الخادم على Vercel',
          errorName: err?.name || 'Error',
          errorCode: err?.code || null,
        })
      );
    }
  }
}
