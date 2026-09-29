import { createSessionCookie, timingSafeEqual, SESSION_COOKIE, DEFAULT_TTL_SECONDS } from '../_lib/auth.js';
import { clientIp, checkRateLimit, recordFailure, recordSuccess, sleep, FAILURE_DELAY_MS } from '../_lib/rate-limit.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const adminPassword = process.env.ADMIN_PASSWORD;
  const sessionSecret = process.env.ADMIN_SESSION_SECRET;
  if (!adminPassword || !sessionSecret) {
    return res.status(500).json({ error: 'Admin auth is not configured' });
  }

  const ip = clientIp(req);
  const limit = checkRateLimit(ip);
  if (limit.blocked) {
    res.setHeader('Retry-After', String(limit.retryAfterSeconds));
    return res.status(429).json({ error: 'Too many attempts. Try again later.' });
  }

  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!timingSafeEqual(password, adminPassword)) {
    recordFailure(ip);
    await sleep(FAILURE_DELAY_MS);
    return res.status(401).json({ error: 'Incorrect password' });
  }

  recordSuccess(ip);
  const token = await createSessionCookie(sessionSecret);
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${DEFAULT_TTL_SECONDS}`
  );
  return res.status(200).json({ ok: true });
}
