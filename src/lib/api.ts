/**
 * Helpers for building consistent API responses and guarding route handlers
 * with authentication, role checks, and CSRF validation.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { CSRF_HEADER, SESSION_COOKIE, safeEqual, validateSession, type ValidatedSession } from '@/lib/auth';
import { PodmanError } from '@/lib/podman';
import { recordAudit } from '@/lib/audit';
import { clientIp } from '@/lib/net';
import { hasRole } from '@/lib/rbac';
import { rateLimit } from '@/lib/ratelimit';
import type { ApiError, Role, SessionUser } from '@/types';

// Endpoints reachable while a forced password change is pending.
const PASSWORD_CHANGE_ALLOWED = new Set(['/api/account/password', '/api/auth/logout', '/api/auth/me']);
// Per-user budget for state-changing requests (sliding fixed window).
const MUTATION_LIMIT = 120;
const MUTATION_WINDOW_SECONDS = 60;

export { hasRole };

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json({ success: true, data }, init);
}

export function fail(error: ApiError, status: number): NextResponse {
  return NextResponse.json({ success: false, error }, { status });
}

/** Thrown inside handlers to short-circuit with a structured error response. */
export class ApiException extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export interface HandlerContext {
  user: SessionUser;
  session: ValidatedSession['session'];
  req: NextRequest;
  params: Record<string, string>;
}

type Handler = (ctx: HandlerContext) => Promise<NextResponse> | NextResponse;

interface GuardOptions {
  /** Minimum role required to call this handler. Defaults to 'viewer'. */
  role?: Role;
}

/**
 * Wrap a route handler with auth + role + CSRF enforcement and uniform error
 * handling. Validation happens entirely server-side.
 */
export function withAuth(handler: Handler, options: GuardOptions = {}) {
  return async (
    req: NextRequest,
    routeCtx: { params: Promise<Record<string, string>> },
  ): Promise<NextResponse> => {
    const mutating = MUTATING.has(req.method);
    let validated: ValidatedSession | null = null;

    const handle = async (): Promise<NextResponse> => {
      const sessionId = req.cookies.get(SESSION_COOKIE)?.value;
      validated = validateSession(sessionId);
      if (!validated) {
        return fail({ code: 'AUTH_REQUIRED', message: 'Authentication required.' }, 401);
      }

      // Force a pending password change before anything else is permitted.
      if (validated.user.mustChangePassword && !PASSWORD_CHANGE_ALLOWED.has(req.nextUrl.pathname)) {
        return fail(
          { code: 'PASSWORD_CHANGE_REQUIRED', message: 'You must change your password before continuing.' },
          403,
        );
      }

      if (mutating) {
        const token = req.headers.get(CSRF_HEADER);
        if (!token || !safeEqual(token, validated.session.csrf_token)) {
          return fail({ code: 'CSRF_INVALID', message: 'Missing or invalid CSRF token.' }, 403);
        }
      }

      const required = options.role ?? 'viewer';
      if (!hasRole(validated.user, required)) {
        return fail(
          { code: 'AUTH_FORBIDDEN', message: `This action requires the "${required}" role or higher.` },
          403,
        );
      }

      // Throttle state-changing requests per user.
      if (mutating) {
        const limit = rateLimit(`mut:${validated.user.id}`, MUTATION_LIMIT, MUTATION_WINDOW_SECONDS);
        if (!limit.allowed) {
          const res = fail({ code: 'RATE_LIMITED', message: 'Too many requests. Slow down.' }, 429);
          res.headers.set('Retry-After', String(limit.retryAfter));
          return res;
        }
      }

      const params = (await routeCtx?.params) ?? {};
      return handler({ user: validated.user, session: validated.session, req, params });
    };

    let res: NextResponse;
    try {
      res = await handle();
    } catch (err) {
      res = toErrorResponse(err);
    }

    // Audit every mutating request (including blocked attempts).
    if (mutating) {
      const session = validated as ValidatedSession | null;
      recordAudit({
        username: session?.user.username ?? null,
        role: session?.user.role ?? null,
        method: req.method,
        path: req.nextUrl.pathname,
        status: res.status,
        ip: clientIp(req),
      });
    }
    return res;
  };
}

export function toErrorResponse(err: unknown): NextResponse {
  if (err instanceof ApiException) {
    return fail({ code: err.code, message: err.message, details: err.details }, err.status);
  }
  if (err instanceof PodmanError) {
    // 0 means the socket was unreachable.
    const status = err.statusCode === 0 ? 502 : err.statusCode;
    const code = err.statusCode === 0 ? 'ENGINE_UNREACHABLE' : 'ENGINE_ERROR';
    return fail({ code, message: err.message }, status >= 400 ? status : 502);
  }
  // eslint-disable-next-line no-console
  console.error('[panel] Unhandled error:', err);
  return fail({ code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' }, 500);
}

/** Parse and validate a JSON request body, throwing ApiException on failure. */
export async function parseBody<T>(req: NextRequest, schema: { safeParse: (v: unknown) => { success: boolean; data?: T; error?: { issues: unknown } } }): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ApiException('INVALID_FORMAT', 'Request body must be valid JSON.', 400);
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new ApiException('VALIDATION_ERROR', 'Validation failed.', 422, {
      issues: result.error?.issues,
    });
  }
  return result.data as T;
}
