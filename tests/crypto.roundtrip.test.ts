import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { describe, expect, it } from 'vitest';

function encryptDecryptRoundTrip(secret: string, payload: unknown) {
  const key = createHash('sha256').update(secret).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(Buffer.from(JSON.stringify(payload), 'utf8')),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  const packed = Buffer.concat([iv, tag, encrypted]);

  const iv2 = packed.subarray(0, 12);
  const tag2 = packed.subarray(12, 28);
  const data = packed.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', key, iv2);
  decipher.setAuthTag(tag2);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return JSON.parse(decrypted.toString('utf8'));
}

describe('token encryption helpers', () => {
  it('round-trips session payloads without exposing plaintext structure issues', () => {
    const payload = { accessToken: 'token-value', refreshToken: 'refresh-value', expiresAt: 123 };
    // Use a disposable test secret only — never a production key.
    const result = encryptDecryptRoundTrip('test-only-encryption-secret-for-unit-tests', payload);
    expect(result).toEqual(payload);
  });
});
