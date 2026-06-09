import { NextResponse, type NextRequest } from 'next/server';

const SESSION_COOKIE = 'panel_session';

/**
 * Edge middleware: applies security headers to every response and performs a
 * cheap cookie-presence redirect for page routes. Authoritative session
 * validation happens server-side in route handlers and the app layout.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSession = Boolean(req.cookies.get(SESSION_COOKIE)?.value);

  const isLogin = pathname === '/login';
  const isApi = pathname.startsWith('/api');

  // Redirect unauthenticated page requests to the login screen.
  if (!hasSession && !isLogin && !isApi) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return withSecurityHeaders(NextResponse.redirect(url));
  }

  // Keep authenticated users away from the login page.
  if (hasSession && isLogin) {
    const url = req.nextUrl.clone();
    url.pathname = '/dashboard';
    url.search = '';
    return withSecurityHeaders(NextResponse.redirect(url));
  }

  return withSecurityHeaders(NextResponse.next());
}

function withSecurityHeaders(res: NextResponse): NextResponse {
  const h = res.headers;
  h.set('X-Frame-Options', 'DENY');
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  h.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  h.set('X-XSS-Protection', '1; mode=block');
  h.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      // Next.js injects inline bootstrap scripts; dev also needs eval.
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self'",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  );
  return res;
}

export const config = {
  // Run on all routes except Next internals and static assets.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
