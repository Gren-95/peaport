import { type NextRequest } from 'next/server';
import { fail, ok, parseBody, toErrorResponse } from '@/lib/api';
import {
  createSession,
  getUserRowByUsername,
  hashPassword,
  verifyPassword,
} from '@/lib/auth';
import { loginSchema } from '@/lib/validation';
import { rateLimit } from '@/lib/ratelimit';
import { clientIp, sessionCookie } from '@/lib/net';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// A precomputed hash to compare against for unknown users, so response timing
// does not reveal whether a username exists.
let dummyHashPromise: Promise<string> | null = null;
function dummyHash(): Promise<string> {
  if (!dummyHashPromise) dummyHashPromise = hashPassword('placeholder-not-a-real-password');
  return dummyHashPromise;
}

export async function POST(req: NextRequest) {
  try {
    const ip = clientIp(req);
    const limit = rateLimit(`login:${ip}`, 5, 15 * 60);
    if (!limit.allowed) {
      return fail(
        { code: 'RATE_LIMITED', message: 'Too many login attempts. Try again later.' },
        429,
      );
    }

    const { username, password } = await parseBody(req, loginSchema);
    const row = getUserRowByUsername(username);

    // Always run a bcrypt comparison to equalise timing.
    const valid = row
      ? await verifyPassword(password, row.password_hash)
      : (await verifyPassword(password, await dummyHash()), false);

    if (!row || !valid) {
      return fail({ code: 'AUTH_INVALID', message: 'Invalid credentials.' }, 401);
    }

    const { id, csrfToken } = createSession(row.id, ip, req.headers.get('user-agent'));
    const res = ok({
      user: { id: row.id, username: row.username, role: row.role },
      csrfToken,
    });
    res.cookies.set(sessionCookie(id));
    return res;
  } catch (err) {
    return toErrorResponse(err);
  }
}
