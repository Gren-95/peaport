import { describe, expect, it } from 'bun:test';
import { checkPasswordPolicy, hashPassword, safeEqual, verifyPassword } from '@/lib/auth';

describe('checkPasswordPolicy', () => {
  it('rejects short passwords', () => {
    expect(checkPasswordPolicy('short').ok).toBe(false);
  });
  it('rejects common passwords', () => {
    expect(checkPasswordPolicy('password').ok).toBe(false);
    expect(checkPasswordPolicy('changeme').ok).toBe(false);
  });
  it('accepts a reasonable password', () => {
    expect(checkPasswordPolicy('s3cure-enough-pw').ok).toBe(true);
  });
});

describe('safeEqual', () => {
  it('is true for equal strings', () => {
    expect(safeEqual('abc123', 'abc123')).toBe(true);
  });
  it('is false for different strings of equal length', () => {
    expect(safeEqual('abc123', 'abc124')).toBe(false);
  });
  it('is false for different lengths', () => {
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});

describe('password hashing', () => {
  it('verifies the correct password and rejects a wrong one', async () => {
    const hash = await hashPassword('correct horse battery');
    expect(hash).not.toContain('correct horse battery');
    expect(await verifyPassword('correct horse battery', hash)).toBe(true);
    expect(await verifyPassword('wrong password', hash)).toBe(false);
  });
});
