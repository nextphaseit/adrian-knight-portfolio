# Adrian Knight Portfolio

Personal portfolio for Adrian Knight focused on healthcare IT, systems analysis, IT service management, product development, and technology projects.

## Stack

- Static HTML
- Tailwind CSS (CDN)
- Vanilla JavaScript
- Google Fonts: Syne, Instrument Serif, Inter
- Iconify
- Playwright (local screenshot capture only)

## Local Development

Open `index.html` in a browser, or serve the project folder with any static web server:

```bash
python3 -m http.server 4173
```

Then visit [http://localhost:4173](http://localhost:4173).

Optional screenshot tooling for project images:

```bash
npm install
npm run screenshots:install
npm run screenshots
```

## Deployment

Hosted on Vercel.

Production deployments are connected to the GitHub `main` branch.

## Contact form

`api/contact.js` is a Vercel Node function. Configure these in the existing Vercel project (never commit values):

- `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY`: Cloudflare Turnstile keys allowing the portfolio hostname. The widget uses action `contact`.
- `RESEND_API_KEY`: an email-sending API key.
- `CONTACT_FROM_EMAIL`: a sender on a domain verified with Resend.
- `CONTACT_ORIGIN`: optional exact HTTPS preview origin when testing a preview.

Recipient is fixed to the existing portfolio address, `adrian.knight@nextphaseit.org`. The backend validates origin, input, a honeypot, and a single-use Turnstile token including hostname/action. It fails closed when unconfigured. No message body or credentials are logged. The browser keeps the email fallback available and only reports submission after the mail provider accepts the request; provider acceptance does not establish inbox delivery.

Before production: test mobile layouts in a browser, configure provider credentials, submit a real test inquiry, and verify its delivery in the recipient inbox or provider delivery events. Do not release based solely on mocked tests.

Downloadable profile: `/downloads/adrian-knight-professional-profile.txt`. This is a factual professional profile, not a claim that a new résumé has been approved. The degree is explicitly in progress; service desk work is labeled a prototype.

Run backend checks with `node --test tests/contact.test.js`.
