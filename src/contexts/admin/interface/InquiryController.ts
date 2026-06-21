import { Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import { Errors } from '../../../shared/errors/AppError';

export class InquiryController {
  constructor(private readonly rds: Pool) {}

  // SO-000a: 공개 도입 신청 폼 제출
  submit = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { shopName, contact, gu, category, note } =
        req.body as {
          shopName?: string; contact?: string;
          gu?: string; category?: string; note?: string;
        };
      if (!shopName || !contact || !gu || !category) {
        return next(Errors.validation({ required: 'shopName, contact, gu, category는 필수입니다' }));
      }
      await this.rds.query(
        `INSERT INTO shop_inquiries (shop_name, contact, gu, category, note)
         VALUES ($1, $2, $3, $4, $5)`,
        [shopName, contact, gu, category, note ?? null],
      );
      res.status(201).json({ ok: true });
    } catch (err) { next(err); }
  };
}
