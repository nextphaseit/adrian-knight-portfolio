const reply = (res, status, message) => res.status(status).json({ message });
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET') return res.status(200).json({ siteKey: process.env.TURNSTILE_SITE_KEY || '' });
  if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return reply(res, 405, 'Method not allowed.'); }
  const origin = req.headers.origin;
  const allowed = new Set(['https://adrian-knight-portfolio.vercel.app', process.env.CONTACT_ORIGIN].filter(Boolean));
  if (!origin || !allowed.has(origin)) return reply(res, 403, 'Request not allowed.');
  if (!req.headers['content-type']?.startsWith('application/json')) return reply(res, 415, 'Use JSON.');
  const body = req.body;
  if (!body || typeof body !== 'object' || Buffer.byteLength(JSON.stringify(body)) > 12000) return reply(res, 400, 'Invalid message.');
  const { name, email, message, website, token } = body;
  if (website) return reply(res, 400, 'Unable to accept this message.');
  if (typeof name !== 'string' || !name.trim() || name.length > 100 || typeof email !== 'string' || email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) || typeof message !== 'string' || message.trim().length < 20 || message.length > 5000 || typeof token !== 'string' || token.length > 2048 || !token) return reply(res, 400, 'Check your details and complete the security check.');
  if (!process.env.TURNSTILE_SECRET_KEY || !process.env.RESEND_API_KEY || !process.env.CONTACT_FROM_EMAIL) return reply(res, 503, 'The form is temporarily unavailable. Please use the email link.');
  try {
    const verification = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: new URLSearchParams({ secret: process.env.TURNSTILE_SECRET_KEY, response: token }), signal: AbortSignal.timeout(10000) });
    const challenge = await verification.json();
    if (!verification.ok || !challenge.success || challenge.hostname !== new URL(origin).hostname || challenge.action !== 'contact') return reply(res, 400, 'Security check failed. Please try again.');
    const delivery = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: process.env.CONTACT_FROM_EMAIL, to: ['adrian.knight@nextphaseit.org'], reply_to: email.trim(), subject: 'Portfolio contact inquiry', text: `Name: ${name.trim()}\nEmail: ${email.trim()}\n\n${message.trim()}` }), signal: AbortSignal.timeout(10000) });
    const result = await delivery.json();
    if (!delivery.ok || !result.id) return reply(res, 502, 'Your message could not be submitted. Please use the email link.');
    return reply(res, 200, 'Your message was submitted. Thank you for getting in touch.');
  } catch { return reply(res, 502, 'Your message could not be submitted. Please use the email link.'); }
};
