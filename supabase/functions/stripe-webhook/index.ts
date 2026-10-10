// Stripe's calls back to the app: renewals, failed payments, cancellations, refunds, and one-off
// payments for ads and donations.
//
// Registered by the payments function the first time it runs with the Stripe keys in place; the
// signing secret is kept in community_secrets. Stripe sends no session token, so this function is
// deployed with JWT checking off and instead checks Stripe's signature on every request.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient, SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { applySubscription, json, settlePaymentIntent, stripe } from '../_shared/billing.ts';

/** How old a signed request may be, against replays. */
const TOLERANCE_S = 300;

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Stripe-Signature: t=1700000000,v1=hex[,v1=hex] */
async function verified(secret: string, header: string, payload: string): Promise<boolean> {
  const parts = header.split(',').map((p) => p.split('=') as [string, string]);
  const t = parts.find(([k]) => k === 't')?.[1];
  const sigs = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!t || !sigs.length) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > TOLERANCE_S) return false;
  const expected = await hmacHex(secret, `${t}.${payload}`);
  return sigs.some((s) => same(s, expected));
}

/** Which member a Stripe customer belongs to. */
async function memberFor(db: SupabaseClient, customer: string | null | undefined): Promise<string | null> {
  if (!customer) return null;
  const { data } = await db.from('community_billing').select('user_id').eq('stripe_customer_id', customer).maybeSingle();
  if (data?.user_id) return data.user_id;
  const c = await stripe('GET', `customers/${customer}`).catch(() => null);
  return typeof c?.metadata?.user_id === 'string' ? c.metadata.user_id : null;
}

/** The subscription as the app wants to see it: with its latest invoice and the card that paid. */
async function freshSubscription(id: string) {
  return stripe('GET', `subscriptions/${id}`, { expand: ['latest_invoice.payment_intent.payment_method'] });
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data: secret } = await db.from('community_secrets').select('value').eq('key', 'stripe_webhook_secret').maybeSingle();
  const payload = await req.text();
  if (!secret?.value || !(await verified(secret.value, req.headers.get('stripe-signature') ?? '', payload))) return json({ error: 'Bad signature' }, 400);

  let event: any;
  try {
    event = JSON.parse(payload);
  } catch {
    return json({ error: 'Bad payload' }, 400);
  }
  const obj = event?.data?.object ?? {};

  try {
    switch (event.type) {
      case 'invoice.paid':
      case 'invoice.payment_failed': {
        const user = await memberFor(db, obj.customer);
        if (user && obj.subscription) await applySubscription(db, user, await freshSubscription(obj.subscription));
        break;
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const user = (typeof obj.metadata?.user_id === 'string' && obj.metadata.user_id) || (await memberFor(db, obj.customer));
        if (user) await applySubscription(db, user, event.type === 'customer.subscription.deleted' ? obj : await freshSubscription(obj.id));
        break;
      }
      case 'payment_intent.succeeded':
      case 'payment_intent.payment_failed': {
        await settlePaymentIntent(db, obj);
        break;
      }
      case 'charge.refunded': {
        const user = await memberFor(db, obj.customer);
        if (!user || !obj.payment_intent) break;
        // Only a full refund undoes the purchase; a partial one is just recorded below.
        if (obj.refunded === true) {
          await db.from('community_transactions').update({ status: 'refunded' }).eq('stripe_payment_intent_id', obj.payment_intent).neq('kind', 'refund');
          // A refunded ad stops running; a refunded gift stops counting towards the total.
          const { data: promo } = await db.from('community_promotions').select('id, post_id').eq('payment_intent_id', obj.payment_intent).maybeSingle();
          if (promo) {
            await db.from('community_promotions').update({ status: 'refunded', ends_at: new Date().toISOString() }).eq('id', promo.id);
            // Other paid days on the same post keep running: the boost now ends with the latest of those.
            if (promo.post_id) {
              const { data: rest } = await db.from('community_promotions').select('ends_at').eq('post_id', promo.post_id).eq('status', 'active').gt('ends_at', new Date().toISOString()).order('ends_at', { ascending: false }).limit(1);
              await db.from('community_posts').update({ boosted_until: rest?.[0]?.ends_at ?? null }).eq('id', promo.post_id);
            }
          }
          await db.from('community_donations').update({ status: 'refunded' }).eq('payment_intent_id', obj.payment_intent);
        }
        // Each refund is its own line on the books. Stripe reports the running total refunded on the
        // charge, so the line is the part not yet recorded; repeats of the same event add nothing.
        const { data: earlier } = await db.from('community_transactions').select('amount_pence').like('stripe_invoice_id', `refund:${obj.id}%`);
        const recorded = (earlier ?? []).reduce((sum: number, r: { amount_pence: number }) => sum + Math.abs(r.amount_pence), 0);
        const newly = Math.max(0, Math.abs(obj.amount_refunded ?? 0) - recorded);
        if (newly > 0) await db.from('community_transactions').upsert(
          {
            user_id: user,
            kind: 'refund',
            amount_pence: -newly,
            currency: String(obj.currency ?? 'gbp').toUpperCase(),
            note: 'Refund',
            provider: 'stripe',
            status: 'succeeded',
            method: obj.payment_method_details?.card ? `${obj.payment_method_details.card.brand ?? 'Card'} •••• ${obj.payment_method_details.card.last4 ?? ''}`.slice(0, 60) : '',
            stripe_invoice_id: `refund:${obj.id}:${obj.amount_refunded ?? 0}`,
            stripe_payment_intent_id: obj.payment_intent,
          },
          { onConflict: 'stripe_invoice_id', ignoreDuplicates: true },
        );
        break;
      }
    }
  } catch (e) {
    console.error('webhook', event?.type, e);
    // A 500 makes Stripe try again later, which is what we want for a passing failure.
    return json({ error: 'Not handled' }, 500);
  }
  return json({ received: true });
});
