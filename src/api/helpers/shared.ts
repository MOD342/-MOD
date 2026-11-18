import type { Request, Response, NextFunction } from "express";
import { ScraperService } from "../../services/scraperService";

export const IS_EXTERNAL_FETCH_DISABLED = false; // تم تفعيل الفهرس العالمي الشامل ومحرك الجلب الحي للحلقات المترجمة

export const scraper = new ScraperService();

export const handleAsync =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
