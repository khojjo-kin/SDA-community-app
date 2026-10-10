// Where Stripe sends a member back after setting up payouts for their fundraiser. Stripe needs a web
// address; this hands them straight back to the app (community://payouts).
//
// It is a redirect rather than a page: Supabase serves its own domain's pages as plain text, so a web
// page here would show its code. The in-app browser sees the community:// address and closes itself.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

Deno.serve((req: Request) => {
  const again = new URL(req.url).searchParams.get('again') === '1';
  const target = `community://payouts${again ? '?again=1' : ''}`;
  return new Response(null, { status: 302, headers: { Location: target, 'Cache-Control': 'no-store' } });
});
