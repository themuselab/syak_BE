import { createHash } from 'crypto';
import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { NextFunction, Request, Response } from 'express';
import { Pool } from 'pg';
import { Errors } from '../../../shared/errors/AppError';

const MAX_BYTES = 8 * 1024 * 1024;
const eligible = `NOT EXISTS (SELECT 1 FROM shop_suppressions x WHERE x.shop_id=p.shop_id)
  AND (EXISTS (SELECT 1 FROM shops s WHERE s.id=p.shop_id AND
    (s.category IN ('네일','헤어','메이크업') OR s.categories ?| ARRAY['네일','헤어','메이크업']))
    OR (NOT EXISTS (SELECT 1 FROM shops s WHERE s.id=p.shop_id)
      AND EXISTS (SELECT 1 FROM semas_shop_candidates c WHERE c.active AND c.verified_place_id=p.shop_id)))`;
const due = "p.s3_key IS NULL AND coalesce(p.retry_after,'-infinity')<=now()";
const sourcePattern = /^https:\/\/(?:ldb-phinf|naverbooking-phinf)\.pstatic\.net\/[^\s\\#]+$/;

export function businessPhotoBytes(jpeg: unknown, sha: unknown): Buffer {
  if (typeof jpeg !== 'string' || jpeg.length > 4 * Math.ceil(MAX_BYTES / 3) ||
      typeof sha !== 'string' || !/^[a-f0-9]{64}$/.test(sha)) throw Errors.validation();
  const bytes = Buffer.from(jpeg, 'base64');
  if (bytes.length < 12 || bytes.length > MAX_BYTES || bytes.toString('base64') !== jpeg ||
      bytes.readUInt16BE(0) !== 0xffd8 || bytes.readUInt16BE(bytes.length - 2) !== 0xffd9 ||
      createHash('sha256').update(bytes).digest('hex') !== sha) throw Errors.validation();
  // Pillow emits baseline RGB JPEGs. Read frame dimensions before accepting the scan.
  let frame = false;
  for (let i = 2; i + 4 <= bytes.length && bytes[i] === 0xff;) {
    const marker = bytes[i + 1], length = bytes.readUInt16BE(i + 2);
    if (length < 2 || i + 2 + length > bytes.length - 2) break;
    if (marker === 0xda && frame && i + 2 + length < bytes.length - 2) return bytes;
    if (marker === 0xc0 && length === 17) {
      const height = bytes.readUInt16BE(i + 5), width = bytes.readUInt16BE(i + 7);
      frame = bytes[i + 4] === 8 && bytes[i + 9] === 3 && height > 0 && width > 0 && Math.max(height,width) <= 2048;
    }
    i += 2 + length;
  }
  throw Errors.validation();
}

export class BusinessPhotoController {
  constructor(private readonly db: Pool,
    private readonly s3 = new S3Client({region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'ap-northeast-2'})) {}

  targets = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const limit = Number(req.query.limit ?? 16);
      if (!Number.isInteger(limit) || limit < 1 || limit > 30) throw Errors.validation();
      const result = await this.db.query(`SELECT p.shop_id AS "shopId",p.source_url AS "sourceUrl",p.attempts
        FROM catalog_business_photo_intake p WHERE ${due} AND ${eligible}
        ORDER BY p.attempts,p.observed_at,p.shop_id,p.source_url LIMIT $1`,[limit]);
      res.set('Cache-Control','private, no-store').json({targets:result.rows});
    } catch (err) { next(err); }
  };

  record = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const {shopId,sourceUrl,attempts,outcome,sha256,jpeg} = req.body ?? {};
      if (typeof shopId !== 'string' || !/^\d{1,20}$/.test(shopId) || typeof sourceUrl !== 'string' ||
          sourceUrl.length > 2048 || !Number.isSafeInteger(attempts) || attempts < 0 ||
          !['archive','unavailable','unsupported'].includes(outcome)) throw Errors.validation();
      const params = [shopId,sourceUrl,attempts];
      const match = `p.shop_id=$1 AND p.source_url=$2 AND p.attempts=$3 AND ${due}
        AND ${eligible}`;
      if (outcome !== 'archive') {
        const result = await this.db.query(`UPDATE catalog_business_photo_intake p SET attempts=attempts+1,
          retry_after=CASE WHEN $4 THEN 'infinity'::timestamptz ELSE now()+make_interval(mins=>least(1440,15*(2^least(attempts,7))::int)) END
          WHERE ${match}`,[...params,outcome === 'unsupported']);
        res.json({status:result.rowCount ? 'recorded' : 'skipped'});
        return;
      }
      if (!sourcePattern.test(sourceUrl)) throw Errors.validation();
      const bytes = businessPhotoBytes(jpeg,sha256);
      const candidate = await this.db.query(`SELECT 1 FROM catalog_business_photo_intake p WHERE ${match}`,params);
      if (!candidate.rowCount) { res.json({status:'skipped'}); return; }
      const bucket = process.env.S3_MARKETING_BUCKET;
      if (!bucket) throw Errors.internal();
      const key = `catalog-portfolios/pending_review/place/${shopId}/${sha256}.jpg`;
      const dest = {Bucket:bucket,Key:key};
      const placeUrl = `https://m.place.naver.com/place/${shopId}/home`;
      try {
        await this.s3.send(new PutObjectCommand({...dest, Body:bytes, ContentType:'image/jpeg', ServerSideEncryption:'AES256',
          IfNoneMatch:'*', Metadata:{'shop-id':shopId,'naver-place-url':placeUrl,source:'place-business',
            'review-status':'pending_review',sha256}}));
      } catch (err) {
        if ((err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode !== 412) throw err;
      }
      const head = await this.s3.send(new HeadObjectCommand(dest));
      const meta = head.Metadata;
      if (head.ContentLength !== bytes.length || head.ContentType !== 'image/jpeg' || meta?.sha256 !== sha256 ||
          meta?.['shop-id'] !== shopId || meta?.['naver-place-url'] !== placeUrl ||
          meta?.source !== 'place-business' || meta?.['review-status'] !== 'pending_review') throw Errors.internal();
      const result = await this.db.query(`UPDATE catalog_business_photo_intake p SET s3_bucket=$4,s3_key=$5,sha256=$6,
        archived_at=now(),retry_after=NULL WHERE ${match}`,[...params,bucket,key,sha256]);
      res.json({status:result.rowCount ? 'archived' : 'skipped'});
    } catch (err) { next(err); }
  };
}
