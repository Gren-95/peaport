import type { NextRequest } from 'next/server';
import { env } from '@/lib/env';
import { SESSION_COOKIE } from '@/lib/auth';

/** Best-effort client IP, honouring a single proxy hop. */
export function clientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]!.trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}

export interface SessionCookieOptions {
  maxAge?: number;
}

export function sessionCookie(value: string, options: SessionCookieOptions = {}) {
  return {
    name: SESSION_COOKIE,
    value,
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: options.maxAge ?? env.session.absoluteTimeout,
  };
}

export function clearedSessionCookie() {
  return {
    name: SESSION_COOKIE,
    value: '',
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 0,
  };
}
