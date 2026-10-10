// Where Stripe sends a member back after setting up payouts for their fundraiser. Stripe needs a web
// address; this page hands them straight back to the app (community://payouts).
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

Deno.serve((req: Request) => {
  const url = new URL(req.url);
  const again = url.searchParams.get('again') === '1';
  const target = `community://payouts${again ? '?again=1' : ''}`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Back to Community</title><meta http-equiv="refresh" content="0; url=${target}">
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0b1014;color:#f3f5f7;font:17px -apple-system,system-ui,sans-serif;text-align:center}
a{display:inline-block;margin-top:18px;padding:14px 22px;border-radius:12px;background:#1fbf5a;color:#fff;text-decoration:none;font-weight:700}</style></head>
<body><main><p>${again ? 'That link expired. Open Community to continue setting up payouts.' : 'All done. Taking you back to Community…'}</p><a href="${target}">Open Community</a></main></body></html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
});
