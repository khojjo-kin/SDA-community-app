// Payments: Community Plus through Stripe, with the app's own screens.
//
// The app never sees the Stripe secret key. It calls this function (signed in) to:
//   config         the publishable key, the price, Apple Pay's merchant id, and this member's status
//   cards          the cards saved to their Stripe customer
//   add_card       a SetupIntent the app confirms with the card the member typed, which saves it
//   remove_card    detaches a saved card
//   default_card   makes a saved card the one renewals charge
//   subscribe      starts (or resumes) the monthly subscription and returns the first payment's
//                  client secret, which the app confirms with a new card, a saved card or Apple Pay
//   sync           after paying, reads the subscription back from Stripe and switches Plus on
//   cancel/resume  stop or restart renewal at the end of the paid month
//
// Secrets (Supabase → Edge Functions → Secrets): STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY, and
// optionally STRIPE_APPLE_MERCHANT_ID. The webhook for renewals registers itself with Stripe the
// first time `config` runs, and keeps its signing secret in community_secrets.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient, SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { applySubscription, CURRENCY, json, PRICE_LOOKUP, PRICE_PENCE, STRIPE_VERSION, StripeError, stripe, subjectOf, WEBHOOK_EVENTS } from '../_shared/billing.ts';

/* ---------- members and customers ---------- */

type Ctx = { db: SupabaseClient; me: string };

async function billingRow({ db, me }: Ctx) {
  const { data } = await db.from('community_billing').select('*').eq('user_id', me).maybeSingle();
  return data as null | { user_id: string; stripe_customer_id: string; stripe_subscription_id: string | null; status: string; current_period_end: string | null; cancel_at_period_end: boolean };
}

/** The member's Stripe customer, made the first time they pay or save a card. */
async function customerFor(ctx: Ctx): Promise<string> {
  const row = await billingRow(ctx);
  if (row?.stripe_customer_id) return row.stripe_customer_id;
  const { data: p } = await ctx.db.from('community_profiles').select('username, full_name, contact_email').eq('id', ctx.me).maybeSingle();
  const customer = await stripe('POST', 'customers', {
    name: p?.full_name || p?.username || undefined,
    email: p?.contact_email || undefined,
    description: p?.username ? `@${p.username} on Community` : undefined,
    metadata: { user_id: ctx.me },
  }, `customer-${ctx.me}`);
  await ctx.db.from('community_billing').upsert({ user_id: ctx.me, stripe_customer_id: customer.id, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  return customer.id;
}

/** The monthly Plus price, made in Stripe the first time it is needed (looked up by its key after that). */
async function priceId(): Promise<string> {
  const found = await stripe('GET', 'prices', { lookup_keys: [PRICE_LOOKUP], active: true, limit: 1 });
  const existing = found?.data?.[0];
  if (existing && existing.unit_amount === PRICE_PENCE && existing.currency === CURRENCY) return existing.id;
  const price = await stripe('POST', 'prices', {
    currency: CURRENCY,
    unit_amount: PRICE_PENCE,
    recurring: { interval: 'month' },
    product_data: { name: 'Community Plus' },
    lookup_key: PRICE_LOOKUP,
    transfer_lookup_key: true,
  });
  return price.id;
}

type Card = { id: string; brand: string; last4: string; exp_month: number; exp_year: number; wallet: string | null; is_default: boolean };

async function listCards(customer: string): Promise<Card[]> {
  const [cust, list] = await Promise.all([stripe('GET', `customers/${customer}`), stripe('GET', `customers/${customer}/payment_methods`, { type: 'card', limit: 20 })]);
  const def = cust?.invoice_settings?.default_payment_method ?? null;
  return (list?.data ?? []).map((pm: any) => ({
    id: pm.id,
    brand: pm.card?.brand ?? 'card',
    last4: pm.card?.last4 ?? '',
    exp_month: pm.card?.exp_month ?? 0,
    exp_year: pm.card?.exp_year ?? 0,
    wallet: pm.card?.wallet?.type ?? null,
    is_default: pm.id === def,
  }));
}

/* ---------- the webhook registers itself ---------- */

async function ensureWebhook(db: SupabaseClient) {
  const { data } = await db.from('community_secrets').select('value').eq('key', 'stripe_webhook_secret').maybeSingle();
  if (data?.value) return;
  const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/stripe-webhook`;
  // One made earlier whose secret was lost cannot be used: replace it.
  const existing = await stripe('GET', 'webhook_endpoints', { limit: 100 });
  for (const ep of existing?.data ?? []) if (ep.url === url) await stripe('DELETE', `webhook_endpoints/${ep.id}`);
  const ep = await stripe('POST', 'webhook_endpoints', { url, enabled_events: WEBHOOK_EVENTS, api_version: STRIPE_VERSION, description: 'Community app: Plus renewals and refunds' });
  await db.from('community_secrets').upsert({ key: 'stripe_webhook_secret', value: ep.secret, updated_at: new Date().toISOString() }, { onConflict: 'key' });
}

/* ---------- the actions ---------- */

async function status(ctx: Ctx) {
  const row = await billingRow(ctx);
  return {
    status: row?.status ?? 'none',
    current_period_end: row?.current_period_end ?? null,
    cancel_at_period_end: row?.cancel_at_period_end ?? false,
    has_customer: !!row?.stripe_customer_id,
  };
}

async function subscribe(ctx: Ctx, body: any) {
  const customer = await customerFor(ctx);
  const savedCard: string | null = typeof body?.payment_method_id === 'string' ? body.payment_method_id : null;

  // Already paying: nothing to start.
  const subs = await stripe('GET', 'subscriptions', { customer, status: 'all', limit: 10, expand: ['data.latest_invoice.payment_intent'] });
  // A renewal that failed: pay its invoice now, with whatever the member chooses.
  const overdue = (subs?.data ?? []).find((s: any) => s.status === 'past_due' && s.latest_invoice?.payment_intent?.client_secret && s.latest_invoice.payment_intent.status !== 'succeeded');
  if (overdue) {
    const pi = overdue.latest_invoice.payment_intent;
    return { subscription_id: overdue.id, client_secret: pi.client_secret, status: pi.status, amount: pi.amount, currency: pi.currency };
  }
  const live = (subs?.data ?? []).find((s: any) => ['active', 'trialing', 'past_due'].includes(s.status));
  if (live) {
    if (live.cancel_at_period_end) await stripe('POST', `subscriptions/${live.id}`, { cancel_at_period_end: false });
    await applySubscription(ctx.db, ctx.me, live);
    return { already: true, subscription_id: live.id };
  }

  // A checkout left half-way is picked up again rather than starting a second subscription.
  let sub = (subs?.data ?? []).find((s: any) => s.status === 'incomplete' && s.latest_invoice?.payment_intent?.status && s.latest_invoice.payment_intent.status !== 'canceled');
  if (!sub) {
    sub = await stripe('POST', 'subscriptions', {
      customer,
      items: [{ price: await priceId() }],
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription', payment_method_types: ['card'] },
      default_payment_method: savedCard ?? undefined,
      expand: ['latest_invoice.payment_intent'],
      metadata: { user_id: ctx.me },
    });
  }
  const pi = sub.latest_invoice?.payment_intent;
  if (!pi?.client_secret) throw new StripeError('The payment could not be started. Try again.', 502);
  if (pi.status === 'succeeded') {
    const fresh = await stripe('GET', `subscriptions/${sub.id}`, { expand: ['latest_invoice.payment_intent.payment_method'] });
    await applySubscription(ctx.db, ctx.me, fresh);
    return { already: true, subscription_id: sub.id };
  }
  return { subscription_id: sub.id, client_secret: pi.client_secret, status: pi.status, amount: pi.amount, currency: pi.currency };
}

async function sync(ctx: Ctx) {
  const row = await billingRow(ctx);
  if (!row?.stripe_customer_id) return { plus: false, ...(await status(ctx)) };
  const subs = await stripe('GET', 'subscriptions', { customer: row.stripe_customer_id, status: 'all', limit: 5, expand: ['data.latest_invoice.payment_intent.payment_method'] });
  const list = subs?.data ?? [];
  const best = list.find((s: any) => ['active', 'trialing', 'past_due'].includes(s.status)) ?? list[0];
  if (best) await applySubscription(ctx.db, ctx.me, best);
  const { data: p } = await ctx.db.from('community_profiles').select('plus_until').eq('id', ctx.me).maybeSingle();
  return { plus: !!p?.plus_until && new Date(p.plus_until) > new Date(), ...(await status(ctx)) };
}

async function setRenewal(ctx: Ctx, cancel: boolean) {
  const row = await billingRow(ctx);
  if (!row?.stripe_subscription_id) throw new StripeError('There is no subscription to change.', 400);
  const sub = await stripe('POST', `subscriptions/${row.stripe_subscription_id}`, { cancel_at_period_end: cancel });
  await applySubscription(ctx.db, ctx.me, sub);
  return status(ctx);
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Send a POST with { action }.' }, 405);
  const me = subjectOf(req);
  if (!me) return json({ error: 'Sign in first.' }, 401);
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Send a POST with { action }.' }, 400);
  }
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const ctx: Ctx = { db, me };

  try {
    switch (body?.action) {
      case 'config': {
        const publishable = Deno.env.get('STRIPE_PUBLISHABLE_KEY') ?? '';
        const ready = !!publishable && !!Deno.env.get('STRIPE_SECRET_KEY');
        if (ready) await ensureWebhook(db).catch((e) => console.error('webhook setup', e?.message ?? e));
        return json({
          ready,
          publishable_key: ready ? publishable : '',
          apple_merchant_id: Deno.env.get('STRIPE_APPLE_MERCHANT_ID') ?? '',
          price_pence: PRICE_PENCE,
          currency: CURRENCY.toUpperCase(),
          test_mode: publishable.startsWith('pk_test_'),
          ...(await status(ctx)),
        });
      }
      case 'cards': {
        const row = await billingRow(ctx);
        return json({ cards: row?.stripe_customer_id ? await listCards(row.stripe_customer_id) : [] });
      }
      case 'add_card': {
        const customer = await customerFor(ctx);
        const si = await stripe('POST', 'setup_intents', { customer, usage: 'off_session', payment_method_types: ['card'], metadata: { user_id: me } });
        return json({ client_secret: si.client_secret });
      }
      case 'remove_card': {
        const row = await billingRow(ctx);
        const cards = row?.stripe_customer_id ? await listCards(row.stripe_customer_id) : [];
        if (!cards.some((c) => c.id === body.payment_method_id)) return json({ error: 'That card is not on this account.' }, 404);
        await stripe('POST', `payment_methods/${body.payment_method_id}/detach`);
        return json({ cards: await listCards(row!.stripe_customer_id) });
      }
      case 'default_card': {
        const row = await billingRow(ctx);
        const cards = row?.stripe_customer_id ? await listCards(row.stripe_customer_id) : [];
        if (!cards.some((c) => c.id === body.payment_method_id)) return json({ error: 'That card is not on this account.' }, 404);
        await stripe('POST', `customers/${row!.stripe_customer_id}`, { invoice_settings: { default_payment_method: body.payment_method_id } });
        if (row!.stripe_subscription_id) await stripe('POST', `subscriptions/${row!.stripe_subscription_id}`, { default_payment_method: body.payment_method_id }).catch(() => null);
        return json({ cards: await listCards(row!.stripe_customer_id) });
      }
      case 'subscribe':
        return json(await subscribe(ctx, body));
      case 'sync':
        return json(await sync(ctx));
      case 'cancel':
        return json(await setRenewal(ctx, true));
      case 'resume':
        return json(await setRenewal(ctx, false));
      case 'status':
        return json(await status(ctx));
      default:
        return json({ error: 'Unknown action.' }, 400);
    }
  } catch (e) {
    if (e instanceof StripeError) return json({ error: e.message, code: e.code }, e.status);
    console.error('payments', e);
    return json({ error: 'Something went wrong with the payment service. Try again.' }, 500);
  }
});
