(async () => {
  const form = document.getElementById('contact-form');
  const status = document.getElementById('contact-status');
  const button = document.getElementById('contact-submit');
  let widget;
  let sending = false;
  try {
    const response = await fetch('/api/contact');
    const config = await response.json();
    if (!response.ok || !config.siteKey) throw new Error('unavailable');
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.onload = resolve; script.onerror = reject;
      document.head.append(script);
    });
    widget = window.turnstile.render('#contact-challenge', {
      sitekey: config.siteKey, action: 'contact', theme: 'dark', size: 'flexible',
      callback: () => { button.disabled = sending; status.textContent = 'Ready to send.'; },
      'expired-callback': () => { button.disabled = true; status.textContent = 'Please complete the security check again.'; },
      'error-callback': () => { button.disabled = true; status.textContent = 'Security check unavailable. Please use the email link.'; }
    });
    status.textContent = 'Complete the security check to send your message.';
  } catch { status.textContent = 'The form is temporarily unavailable. Please use the email link below.'; }
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (sending || widget === undefined || !form.reportValidity()) return;
    sending = true; button.disabled = true; status.textContent = 'Sending…';
    const fields = Object.fromEntries(new FormData(form));
    try {
      const response = await fetch('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...fields, token: window.turnstile.getResponse(widget) }), signal: AbortSignal.timeout(25000) });
      const result = await response.json();
      status.textContent = result.message;
      if (response.ok) form.reset();
    } catch { status.textContent = 'Unable to submit your message. Please use the email link.'; }
    finally { sending = false; window.turnstile.reset(widget); }
  });
})();
