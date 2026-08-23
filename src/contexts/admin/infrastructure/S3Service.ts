import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * 마케팅 이미지 저장소 (S3, 비공개 버킷). Supabase Storage 대체.
 * 이미지 URL은 백엔드 프록시(/marketing/img/:key)로 서빙 → presigned로 302 리다이렉트.
 * 자격증명: EC2 syak.env의 AWS_ACCESS_KEY_ID/SECRET (S3 권한 포함), region ap-northeast-2.
 */
export class S3ConfigError extends Error {}

const BUCKET = process.env.S3_MARKETING_BUCKET || '';
let _client: S3Client | null = null;
function client(): S3Client {
  if (!BUCKET) throw new S3ConfigError('S3_MARKETING_BUCKET 이 설정되지 않았습니다');
  if (!_client) _client = new S3Client({ region: process.env.AWS_DEFAULT_REGION || 'ap-northeast-2' });
  return _client;
}

export function s3Configured(): boolean {
  return !!BUCKET && !!(process.env.AWS_ACCESS_KEY_ID || process.env.AWS_SECRET_ACCESS_KEY);
}

/** JPEG 업로드 → 백엔드 프록시 URL 반환 (상대경로: /api/v1/marketing/img/<key>) */
export async function s3PutJpeg(key: string, buf: Buffer): Promise<string> {
  await client().send(new PutObjectCommand({
    Bucket: BUCKET, Key: key, Body: buf, ContentType: 'image/jpeg',
  }));
  return `/api/v1/marketing/img/${key}`;
}

export async function s3Delete(key: string): Promise<void> {
  await client().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

/** presigned GET URL (프록시 리다이렉트용, 기본 1시간) */
export async function s3PresignGet(key: string, ttlSec = 3600): Promise<string> {
  return getSignedUrl(client(), new GetObjectCommand({ Bucket: BUCKET, Key: key }), { expiresIn: ttlSec });
}
