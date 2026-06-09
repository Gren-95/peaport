/**
 * Authenticated symmetric encryption for stored secrets (AES-256-GCM).
 *
 * The key is derived once with scrypt from SECRETS_KEY (or SESSION_SECRET as a
 * fallback). Each ciphertext carries its own random 96-bit IV and 128-bit auth
 * tag, packed as base64(iv | tag | ciphertext).
 */
import crypto from 'node:crypto';
import { env } from '@/lib/env';

const IV_LEN = 12;
const TAG_LEN = 16;

let cachedKey: Buffer | null = null;

function key(): Buffer {
  if (cachedKey) return cachedKey;
  const material = env.secretsKey || env.sessionSecret;
  // Fixed salt: the material itself is the secret; this only domain-separates.
  cachedKey = crypto.scryptSync(material, 'podman-panel:secrets:v1', 32);
  return cachedKey;
}

export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decryptSecret(packed: string): string {
  const buf = Buffer.from(packed, 'base64');
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const enc = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}
