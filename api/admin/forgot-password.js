// Emails a signed, short-lived login link to the one configured recovery
// inbox. No accounts, no database - "forgot password" for a single shared
// password just means "let the inbox owner back in directly." See
// createResetToken in auth.js for why this can't be replayed as a session
// cookie, and admin/README.md for the accepted risk (this endpoint is
// public and unthrottled - worst case is spam email, never unauthorized
// access, since only the inbox owner can click the link).
import { createResetToken } from '../_lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sessionSecret = process.env.ADMIN_SESSION_SECRET;
  const resendApiKey = process.env.RESEND_API_KEY;
  const resetEmail = process.env.ADMIN_RESET_EMAIL;
  if (!sessionSecret || !resendApiKey || !resetEmail) {
    return res.status(500).json({ error: 'Password recovery is not configured' });
  }

  try {
    const token = await createResetToken(sessionSecret);
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers.host;
    const link = `${proto}://${host}/api/admin/reset-session?token=${encodeURIComponent(token)}`;

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: 'SBM Admin <onboarding@resend.dev>',
        to: [resetEmail],
        subject: 'SBM Admin — login link',
        html: `<p>Someone requested a login link for the SBM admin panel.</p><p><a href="${link}">Click here to log in</a></p><p>This link expires in 15 minutes. If you didn't request this, you can ignore it.</p>`,
      }),
    });

    if (!emailRes.ok) {
      const detail = await emailRes.text().catch(() => '');
      console.error('POST /api/admin/forgot-password Resend error:', emailRes.status, detail);
      return res.status(502).json({ error: 'Could not send the login link — try again shortly' });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('POST /api/admin/forgot-password failed:', err);
    return res.status(500).json({ error: 'Could not send the login link — try again shortly' });
  }
}
