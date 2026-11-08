import { randomBytes, scrypt as derive, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

const scrypt = promisify(derive);
const dummySalt = '00000000000000000000000000000000';

export async function hashReviewPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64) as Buffer;
  return `scrypt:${salt}:${key.toString('hex')}`;
}

export async function verifyReviewPassword(password: string, encoded?: string): Promise<boolean> {
  const valid = /^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(encoded ?? '');
  const parts = valid ? encoded!.split(':') : ['', dummySalt, '00'.repeat(64)];
  const key = await scrypt(password, parts[1], 64) as Buffer;
  return timingSafeEqual(key, Buffer.from(parts[2], 'hex')) && valid;
}
