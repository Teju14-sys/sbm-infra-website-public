// Best-effort login rate limiting for a single-shared-password admin panel.
//
// Honest limitation: this is an in-memory Map, and a Vercel serverless
// function's module scope only survives while that particular instance
// stays warm — a cold start resets it. This is NOT a durable, cross-instance
// lockout (that would need Vercel KV/Redis or similar, which nothing in
// this project currently provisions). What it DOES do: a warm instance
// keeps serving repeated requests from the same source during exactly the
// scenario that matters most — a sustained automated attack — so a script
// throwing passwords at /api/admin/login gets throttled hard mid-burst
// instead of running unlimited. Combined with the fixed delay on every
// failed attempt (applied regardless of cold start), this raises the cost
// of guessing by orders of magnitude without adding a new managed service.
const attempts = new Map();

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const FAILURE_DELAY_MS = 800;

export function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

/** Returns { blocked: true, retryAfterSeconds } if this IP is currently locked out. */
export function checkRateLimit(ip) {
  const entry = attempts.get(ip);
  if (!entry) return { blocked: false };
  const elapsed = Date.now() - entry.windowStart;
  if (elapsed > WINDOW_MS) {
    attempts.delete(ip);
    return { blocked: false };
  }
  if (entry.count >= MAX_ATTEMPTS) {
    return { blocked: true, retryAfterSeconds: Math.ceil((WINDOW_MS - elapsed) / 1000) };
  }
  return { blocked: false };
}

export function recordFailure(ip) {
  const entry = attempts.get(ip);
  if (!entry || Date.now() - entry.windowStart > WINDOW_MS) {
    attempts.set(ip, { count: 1, windowStart: Date.now() });
  } else {
    entry.count += 1;
  }
}

export function recordSuccess(ip) {
  attempts.delete(ip);
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export { FAILURE_DELAY_MS };
