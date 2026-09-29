// The landing point for the emailed magic link: verify the reset token,
// then establish a normal session exactly as /api/admin/login does. This is
// a browser-navigated GET (the user just clicked a link in their email
// client), so it responds with a redirect or a small HTML page, not JSON.
import { createSessionCookie, verifyResetToken, SESSION_COOKIE, DEFAULT_TTL_SECONDS } from '../_lib/auth.js';

function errorPage(message) {
  return `<!doctype html><html><body style="font-family:sans-serif;max-width:32rem;margin:4rem auto;padding:0 1.5rem;">
<h1>Login link problem</h1><p>${message}</p><p><a href="/admin/login.html">Back to login</a></p>
</body></html>`;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sessionSecret = process.env.ADMIN_SESSION_SECRET;
  if (!sessionSecret) {
    res.setHeader('content-type', 'text/html');
    return res.status(500).send(errorPage('Admin auth is not configured.'));
  }

  const token = typeof req.query?.token === 'string' ? req.query.token : '';
  const valid = await verifyResetToken(token, sessionSecret);
  if (!valid) {
    res.setHeader('content-type', 'text/html');
    return res.status(401).send(errorPage('This login link is invalid or has expired. Request a new one from the login page.'));
  }

  const sessionToken = await createSessionCookie(sessionSecret);
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${sessionToken}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${DEFAULT_TTL_SECONDS}`
  );
  res.setHeader('Location', '/admin/index.html');
  return res.status(302).end();
}
