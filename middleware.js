import { verifySessionCookie, parseCookie, SESSION_COOKIE } from './api/_lib/auth.js';

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
};

// Routes that must stay reachable without a session: the login page itself,
// the endpoints that establish/clear that session, and the password-reset
// pair (someone locked out has, by definition, no session yet).
const PUBLIC_PATHS = new Set([
  '/admin/login.html',
  '/api/admin/login',
  '/api/admin/logout',
  '/api/admin/forgot-password',
  '/api/admin/reset-session',
]);

export default async function middleware(request) {
  const url = new URL(request.url);

  if (PUBLIC_PATHS.has(url.pathname)) {
    return undefined;
  }

  const sessionSecret = process.env.ADMIN_SESSION_SECRET;
  const token = parseCookie(request.headers.get('cookie'), SESSION_COOKIE);
  const valid = Boolean(sessionSecret) && (await verifySessionCookie(token, sessionSecret));

  if (valid) {
    return undefined;
  }

  if (url.pathname.startsWith('/api/')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }

  return Response.redirect(new URL('/admin/login.html', url), 307);
}
