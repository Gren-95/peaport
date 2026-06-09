import { NextResponse, type NextRequest } from 'next/server';

const SESSION_COOKIE = 'panel_session';
const isProd = process.env.NODE_ENV === 'production';
const httpsEnabled = process.env.COOKIE_SECURE === 'true';

/**
 * Edge middleware: per-request nonce-based CSP + security headers, plus a cheap
 * cookie-presence redirect for page routes. Authoritative session validation
 * happens server-side in route handlers and the app layout.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSession = Boolean(req.cookies.get(SESSION_COOKIE)?.value);
  const isLogin = pathname === '/login';
  const isApi = pathname.startsWith('/api');

  const nonce = crypto.randomUUID();
  const csp = buildCsp(nonce);

  // Redirects: no script injection, so just attach headers.
  if (!hasSession && !isLogin && !isApi) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return withSecurityHeaders(NextResponse.redirect(url), csp);
  }
  if (hasSession && isLogin) {
    const url = req.nextUrl.clone();
    url.pathname = '/dashboard';
    url.search = '';
    return withSecurityHeaders(NextResponse.redirect(url), csp);
  }

  // Forward the CSP (with nonce) on the request so Next applies the nonce to
  // its own injected <script> tags, and set it on the response for the browser.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('content-security-policy', csp);
  requestHeaders.set('x-nonce', nonce);
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  return withSecurityHeaders(res, csp);
}

function buildCsp(nonce: string): string {
  // Scripts: nonce + strict-dynamic (no 'unsafe-inline'). 'unsafe-eval' only in
  // dev, which Next's dev runtime requires. Styles still need 'unsafe-inline'
  // (Next/Tailwind inject inline styles).
  const scriptSrc = isProd
    ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`
    : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval'`;
  return [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
}

function withSecurityHeaders(res: NextResponse, csp: string): NextResponse {
  const h = res.headers;
  h.set('Content-Security-Policy', csp);
  h.set('X-Frame-Options', 'DENY');
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  h.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  h.set('X-XSS-Protection', '1; mode=block');
  // Only advertise HSTS when actually served over HTTPS.
  if (httpsEnabled) h.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
