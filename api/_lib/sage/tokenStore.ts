import crypto from 'crypto';
import { getEnv } from './config';

const ALGO = 'aes-256-gcm';

function getKey(envName = 'TOKEN_ENCRYPTION_KEY'): Buffer {
  const raw = getEnv(envName);
  if (!raw) {
    throw new Error(`${envName} is not configured`);
  }
  return crypto.createHash('sha256').update(raw).digest();
}

export function encryptJson(payload: unknown, keyEnvName = 'TOKEN_ENCRYPTION_KEY'): string {
  const iv = crypto.randomBytes(12);
  const key = getKey(keyEnvName);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64url');
}

export function decryptJson<T>(
  token: string,
  keyEnvName = 'TOKEN_ENCRYPTION_KEY',
): T {
  const buf = Buffer.from(token, 'base64url');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const key = getKey(keyEnvName);
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return JSON.parse(decrypted.toString('utf8')) as T;
}
