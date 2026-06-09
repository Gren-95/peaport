import { describe, expect, it } from 'bun:test';
import { decryptSecret, encryptSecret } from '@/lib/crypto';

describe('secret encryption (AES-256-GCM)', () => {
  it('round-trips a value', () => {
    const value = 'hunter2-correct-horse-battery-staple';
    expect(decryptSecret(encryptSecret(value))).toBe(value);
  });

  it('round-trips unicode and long values', () => {
    const value = 'pаsswörd-🔐-' + 'x'.repeat(5000);
    expect(decryptSecret(encryptSecret(value))).toBe(value);
  });

  it('produces a different ciphertext each time (random IV)', () => {
    const a = encryptSecret('same-value');
    const b = encryptSecret('same-value');
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe('same-value');
    expect(decryptSecret(b)).toBe('same-value');
  });

  it('rejects tampered ciphertext (auth tag mismatch)', () => {
    const packed = encryptSecret('top-secret');
    const buf = Buffer.from(packed, 'base64');
    buf[buf.length - 1] ^= 0xff; // flip the last byte of the ciphertext
    const tampered = buf.toString('base64');
    expect(() => decryptSecret(tampered)).toThrow();
  });
});
