const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../api/contact');
const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; delete process.env.TURNSTILE_SECRET_KEY; delete process.env.RESEND_API_KEY; delete process.env.CONTACT_FROM_EMAIL; });
const valid = { name: 'Test sender', email: 'sender@example.com', message: 'A portfolio functionality test message.', token: 'test-token' };
async function request(body = valid, overrides = {}) {
  const req = { method: 'POST', headers: { origin: 'https://adrian-knight-portfolio.vercel.app', 'content-type': 'application/json' }, body, ...overrides };
  const res = { headers: {}, setHeader(k,v) { this.headers[k] = v; }, status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; } };
  await handler(req, res); return res;
}
function configured() { process.env.TURNSTILE_SECRET_KEY = 'test'; process.env.RESEND_API_KEY = 'test'; process.env.CONTACT_FROM_EMAIL = 'Portfolio <test@example.com>'; }
test('rejects foreign origin, honeypot and malformed input', async () => {
  assert.equal((await request(valid, { headers: { origin: 'https://evil.example' } })).code, 403);
  for (const body of [{ ...valid, website: 'bot' }, { ...valid, email: 'bad' }, { ...valid, message: 'short' }, { ...valid, token: '' }, { ...valid, name: 'x'.repeat(101) }]) assert.equal((await request(body)).code, 400);
});
test('fails closed without configuration', async () => { assert.equal((await request()).code, 503); });
test('failed or wrong-host challenge never invokes mail', async () => {
  configured(); let calls = 0;
  global.fetch = async () => { calls++; return { ok: true, json: async () => ({ success: true, hostname: 'evil.example', action: 'contact' }) }; };
  assert.equal((await request()).code, 400); assert.equal(calls, 1);
});
test('verified challenge sends plain text to fixed recipient', async () => {
  configured(); let calls = 0;
  global.fetch = async (url, options) => { calls++; if (calls === 1) return { ok: true, json: async () => ({ success: true, hostname: 'adrian-knight-portfolio.vercel.app', action: 'contact' }) }; const mail = JSON.parse(options.body); assert.deepEqual(mail.to, ['adrian.knight@nextphaseit.org']); assert.equal(mail.reply_to, valid.email); assert.ok(mail.text.includes(valid.message)); return { ok: true, json: async () => ({ id: 'mock-mail-id' }) }; };
  assert.equal((await request()).code, 200); assert.equal(calls, 2);
});
test('mail rejection and network failure never show success', async () => {
  configured(); let calls = 0;
  global.fetch = async () => ++calls === 1 ? { ok: true, json: async () => ({ success: true, hostname: 'adrian-knight-portfolio.vercel.app', action: 'contact' }) } : { ok: false, json: async () => ({ error: 'rejected' }) };
  assert.equal((await request()).code, 502);
  global.fetch = async () => { throw new Error('timeout'); }; assert.equal((await request()).code, 502);
});
