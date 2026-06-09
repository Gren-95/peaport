import { describe, expect, it } from 'bun:test';
import { hasRole } from '@/lib/rbac';

describe('hasRole', () => {
  it('grants when the role meets or exceeds the requirement', () => {
    expect(hasRole({ role: 'admin' }, 'admin')).toBe(true);
    expect(hasRole({ role: 'admin' }, 'operator')).toBe(true);
    expect(hasRole({ role: 'admin' }, 'viewer')).toBe(true);
    expect(hasRole({ role: 'operator' }, 'operator')).toBe(true);
    expect(hasRole({ role: 'operator' }, 'viewer')).toBe(true);
    expect(hasRole({ role: 'viewer' }, 'viewer')).toBe(true);
  });

  it('denies when the role is below the requirement', () => {
    expect(hasRole({ role: 'viewer' }, 'operator')).toBe(false);
    expect(hasRole({ role: 'viewer' }, 'admin')).toBe(false);
    expect(hasRole({ role: 'operator' }, 'admin')).toBe(false);
  });
});
