import { describe, expect, it } from 'bun:test';
import { describeAction } from '@/lib/audit';

describe('describeAction', () => {
  const cases: [string, string, string][] = [
    ['POST', '/api/containers/abc123/restart', 'container restart'],
    ['POST', '/api/containers/abc123/stop', 'container stop'],
    ['DELETE', '/api/containers/abc123', 'remove container'],
    ['POST', '/api/containers/create', 'create container'],
    ['POST', '/api/images/pull', 'pull image'],
    ['POST', '/api/images/prune', 'prune images'],
    ['DELETE', '/api/images/sha256xyz', 'remove image'],
    ['POST', '/api/volumes', 'create volume'],
    ['POST', '/api/networks/prune', 'prune networks'],
    ['POST', '/api/stacks', 'create stack'],
    ['POST', '/api/stacks/myapp/up', 'stack up'],
    ['DELETE', '/api/stacks/myapp', 'delete stack'],
    ['POST', '/api/secrets', 'set secret'],
    ['DELETE', '/api/secrets/DB_PASSWORD', 'delete secret'],
    ['PATCH', '/api/users/5', 'update user'],
    ['POST', '/api/auth/login', 'login'],
    ['POST', '/api/auth/logout', 'logout'],
    ['POST', '/api/account/password', 'change own password'],
  ];

  for (const [method, path, expected] of cases) {
    it(`${method} ${path} -> "${expected}"`, () => {
      expect(describeAction(method, path)).toBe(expected);
    });
  }

  it('falls back to method + path for unknown routes', () => {
    expect(describeAction('POST', '/api/something/else')).toBe('POST something/else');
  });
});
