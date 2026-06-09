import { describe, expect, it } from 'bun:test';
import { rateLimit } from '@/lib/ratelimit';

describe('rateLimit', () => {
  it('allows up to the limit, then blocks with a retry-after', () => {
    const key = 'unit-test-key-a';
    expect(rateLimit(key, 3, 60)).toMatchObject({ allowed: true, remaining: 2 });
    expect(rateLimit(key, 3, 60)).toMatchObject({ allowed: true, remaining: 1 });
    expect(rateLimit(key, 3, 60)).toMatchObject({ allowed: true, remaining: 0 });
    const blocked = rateLimit(key, 3, 60);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfter).toBeGreaterThan(0);
  });

  it('tracks buckets independently per key', () => {
    const a = 'unit-test-key-b';
    const b = 'unit-test-key-c';
    expect(rateLimit(a, 1, 60).allowed).toBe(true);
    expect(rateLimit(a, 1, 60).allowed).toBe(false);
    // A different key is unaffected by another key's exhaustion.
    expect(rateLimit(b, 1, 60).allowed).toBe(true);
  });
});
