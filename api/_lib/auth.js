// Shared auth helpers — built only on Web Crypto (crypto.subtle, atob/btoa)
// so this one module works unchanged in both Node serverless functions
// (api/admin/*.js) and Edge middleware (middleware.js). Do not import
// Node's `crypto` module here; that would mean writing this twice.

export const SESSION_COOKIE = 'sbm_admin_session';
export const DEFAULT_TTL_SECONDS = 10 * 60 * 60; // 10 hours

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64Url(bytes) {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(str) {
  const normalized = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hmacKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

// `purpose` is embedded in every signed payload so a reset link (short-lived,
// emailed, meant only to establish a session) can never be replayed as a
// session cookie itself, and vice versa - each verifier checks its own
// purpose string, not just a valid signature.
async function createSignedToken(secret, purpose, ttlSeconds) {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payloadB64 = toBase64Url(encoder.encode(JSON.stringify({ exp, purpose })));
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payloadB64));
  const sigB64 = toBase64Url(new Uint8Array(sig));
  return `${payloadB64}.${sigB64}`;
}

async function verifySignedToken(token, secret, purpose) {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [payloadB64, sigB64] = parts;
  try {
    const key = await hmacKey(secret);
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      fromBase64Url(sigB64),
      encoder.encode(payloadB64)
    );
    if (!valid) return false;
    const payload = JSON.parse(decoder.decode(fromBase64Url(payloadB64)));
    return (
      typeof payload.exp === 'number' &&
      payload.exp > Math.floor(Date.now() / 1000) &&
      payload.purpose === purpose
    );
  } catch {
    return false;
  }
}

export async function createSessionCookie(secret, ttlSeconds = DEFAULT_TTL_SECONDS) {
  return createSignedToken(secret, 'session', ttlSeconds);
}

export async function verifySessionCookie(token, secret) {
  return verifySignedToken(token, secret, 'session');
}

// Password-reset magic links: short TTL, emailed, single purpose. Signed
// with the same ADMIN_SESSION_SECRET (no reason to provision a second
// secret for this) but scoped by `purpose` so it can only ever be used to
// establish a session via /api/admin/reset-session, never set directly as
// the session cookie.
export const RESET_TTL_SECONDS = 15 * 60;

export async function createResetToken(secret, ttlSeconds = RESET_TTL_SECONDS) {
  return createSignedToken(secret, 'reset', ttlSeconds);
}

export async function verifyResetToken(token, secret) {
  return verifySignedToken(token, secret, 'reset');
}

// Constant-time string comparison for the shared-password check.
// (Length is not hidden — an accepted, standard simplification for a
// single shared secret; the password value itself never leaks via timing.)
export function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  if (aBytes.length !== bBytes.length) return false;
  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) diff |= aBytes[i] ^ bBytes[i];
  return diff === 0;
}

export function parseCookie(cookieHeader, name) {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    if (key === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return null;
}
