// Shared by the payments and stripe-webhook functions: Stripe over plain HTTPS, and bringing the
// app in line with a subscription (Plus, the tick, the billing row and the books).
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

/** Pinned so the shapes below (latest_invoice.payment_intent, current_period_end) stay put. */
export const STRIPE_VERSION = '2024-06-20';
export const PRICE_LOOKUP = 'community_plus_monthly';
export const PRICE_PENCE = Number(Deno.env.get('PLUS_PRICE_PENCE') ?? '499');
export const CURRENCY = (Deno.env.get('PLUS_CURRENCY') ?? 'gbp').toLowerCase();
/** A day of grace after the paid month, so a renewal that lands a little late never drops Plus. */
const GRACE_MS = 86400e3;
export const WEBHOOK_EVENTS = ['invoice.paid', 'invoice.payment_failed', 'customer.subscription.updated', 'customer.subscription.deleted', 'charge.refunded'];

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', Connection: 'keep-alive' } });
}

/** The person's id from the session token Supabase already verified (verify_jwt). */
export function subjectOf(req: Request): string | null {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const payload = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.sub === 'string' && payload.sub.startsWith('user_') ? payload.sub : null;
  } catch {
    return null;
  }
}

/* ---------- Stripe over plain HTTPS ---------- */

export class StripeError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
  }
}

/** Stripe wants form encoding with bracketed keys: items[0][price]=… */
function form(params: Record<string, unknown>, prefix = '', out = new URLSearchParams()): URLSearchParams {
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((item, i) => (typeof item === 'object' ? form(item as Record<string, unknown>, `${key}[${i}]`, out) : out.append(`${key}[]`, String(item))));
    else if (typeof v === 'object') form(v as Record<string, unknown>, key, out);
    else out.append(key, String(v));
  }
  return out;
}

export async function stripe<T = any>(method: 'GET' | 'POST' | 'DELETE', path: string, params: Record<string, unknown> = {}, idempotencyKey?: string): Promise<T> {
  const key = Deno.env.get('STRIPE_SECRET_KEY');
  if (!key) throw new StripeError('Card payments are not switched on yet. An admin needs to add the Stripe keys.', 503);
  const body = form(params);
  const url = `https://api.stripe.com/v1/${path}${method === 'GET' && body.toString() ? `?${body}` : ''}`;
  const headers: Record<string, string> = { Authorization: `Bearer ${key}`, 'Stripe-Version': STRIPE_VERSION };
  if (method !== 'GET') headers['Content-Type'] = 'application/x-www-form-urlencoded';
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  const res = await fetch(url, { method, headers, body: method === 'GET' ? undefined : body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = data?.error ?? {};
    console.error('stripe', method, path, res.status, err.code, err.message);
    // Card problems are worth showing as they are ("Your card was declined."); the rest are not.
    const say = err.type === 'card_error' && err.message ? err.message : res.status === 401 ? 'The Stripe key is not valid. An admin needs to check it.' : 'The payment service could not do that just now. Try again.';
    throw new StripeError(say, res.status === 401 ? 503 : res.status >= 500 ? 502 : 400, err.code);
  }
  return data as T;
}

/* ---------- switching Plus on, and the books ---------- */

const BRANDS: Record<string, string> = { visa: 'Visa', mastercard: 'Mastercard', amex: 'Amex', discover: 'Discover', diners: 'Diners', jcb: 'JCB', unionpay: 'UnionPay' };

/** "Apple Pay · Visa •••• 4242", for the books and the receipt list. */
function methodLabel(pm: any): string {
  const card = pm?.card;
  if (!card) return '';
  const brand = BRANDS[card.brand] ?? 'Card';
  const wallet = card.wallet?.type === 'apple_pay' ? 'Apple Pay · ' : card.wallet?.type === 'google_pay' ? 'Google Pay · ' : '';
  return `${wallet}${brand} •••• ${card.last4}`.slice(0, 60);
}

/**
 * Brings the app in line with a Stripe subscription: Plus and the tick until the paid month ends,
 * the billing row, and one line on the books for its latest paid invoice. Safe to run any number
 * of times (the app runs it after paying, the webhook on every renewal).
 */
export async function applySubscription(db: SupabaseClient, userId: string, sub: any) {
  const end = sub?.current_period_end ? new Date(sub.current_period_end * 1000) : null;
  // past_due means the renewal failed: its new period is not paid for, so it does not extend Plus.
  const paidUp = ['active', 'trialing'].includes(sub?.status);
  await db.from('community_billing').upsert(
    {
      user_id: userId,
      stripe_customer_id: typeof sub.customer === 'string' ? sub.customer : sub.customer?.id,
      stripe_subscription_id: sub.id,
      status: sub.status,
      current_period_end: end?.toISOString() ?? null,
      cancel_at_period_end: !!sub.cancel_at_period_end,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );
  if (paidUp && end) {
    const until = new Date(end.getTime() + GRACE_MS).toISOString();
    const { data: p } = await db.from('community_profiles').select('plus_until').eq('id', userId).maybeSingle();
    // Never shorten Plus an admin granted for longer.
    if (!p?.plus_until || new Date(p.plus_until) < new Date(until)) await db.from('community_profiles').update({ plus_until: until, verified: true }).eq('id', userId);
    else await db.from('community_profiles').update({ verified: true }).eq('id', userId);
  }
  const invoice = typeof sub.latest_invoice === 'object' ? sub.latest_invoice : null;
  if (invoice) await recordInvoice(db, userId, invoice);
}

/** One line on the books per paid invoice. */
export async function recordInvoice(db: SupabaseClient, userId: string, invoice: any) {
  if (!invoice?.id || invoice.status !== 'paid' || !(invoice.amount_paid > 0)) return;
  let pi = invoice.payment_intent;
  if (typeof pi === 'string') pi = await stripe('GET', `payment_intents/${pi}`, { expand: ['payment_method'] }).catch(() => null);
  let pm = pi?.payment_method;
  if (typeof pm === 'string') pm = await stripe('GET', `payment_methods/${pm}`).catch(() => null);
  const piId = typeof invoice.payment_intent === 'string' ? invoice.payment_intent : invoice.payment_intent?.id ?? null;
  const when = invoice.status_transitions?.paid_at ? new Date(invoice.status_transitions.paid_at * 1000).toISOString() : new Date().toISOString();
  await db.from('community_transactions').upsert(
    {
      user_id: userId,
      kind: 'plus',
      amount_pence: invoice.amount_paid,
      currency: String(invoice.currency ?? CURRENCY).toUpperCase(),
      note: invoice.billing_reason === 'subscription_create' ? 'Community Plus · first month' : 'Community Plus · monthly renewal',
      provider: 'stripe',
      status: 'succeeded',
      method: methodLabel(pm),
      stripe_invoice_id: invoice.id,
      stripe_payment_intent_id: piId,
      created_at: when,
    },
    { onConflict: 'stripe_invoice_id', ignoreDuplicates: true },
  );
}

