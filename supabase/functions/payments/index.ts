// Payments: Community Plus through Stripe, with the app's own screens.
//
// The app never sees the Stripe secret key. It calls this function (signed in) to:
//   config         the publishable key, the price, Apple Pay's merchant id, and this member's status
//   cards          the cards saved to their Stripe customer
//   add_card       a SetupIntent the app confirms with the card the member typed, which saves it
//   remove_card    detaches a saved card
//   default_card   makes a saved card the one renewals charge
//   subscribe      starts (or resumes, or switches) the monthly or yearly subscription. New members
//                  get a free first week: then it returns a SetupIntent's client secret (save the
//                  card, nothing charged yet); otherwise the first payment's, which the app confirms
//                  with a new card, a saved card or Apple Pay
//   sync           after paying, reads the subscription back from Stripe and switches Plus on
//   cancel/resume  stop or restart renewal at the end of the paid month
//   promote        a one-off payment to put a post in front of more people for a number of days
//   donate         a one-off payment to a member's fundraiser, paid out to their own Stripe account
//   settle         after paying for either, reads the payment back and starts the ad / counts the gift
//   payouts        the member's own Stripe account for receiving donations: status, onboarding, dashboard
//   creator_*      subscribing to a creator (paid to their own Stripe account, less the app's share)
//
// Secrets (Supabase → Edge Functions → Secrets): STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY, and
// optionally STRIPE_APPLE_MERCHANT_ID. The webhook for renewals registers itself with Stripe the
// first time `config` runs, and keeps its signing secret in community_secrets.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient, SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { AD_DAY_PENCE, applyCreatorSub, applySubscription, CREATOR_FEE_PERCENT, CURRENCY, isCreatorSub, json, PRICE_LOOKUP, PRICE_PENCE, settlePaymentIntent, STRIPE_VERSION, StripeError, stripe, subjectOf, TRIAL_DAYS, WEBHOOK_EVENTS, YEARLY_LOOKUP, YEARLY_PENCE } from '../_shared/billing.ts';

/* ---------- members and customers ---------- */

type Ctx = { db: SupabaseClient; me: string };

async function billingRow({ db, me }: Ctx) {
  const { data } = await db.from('community_billing').select('*').eq('user_id', me).maybeSingle();
  return data as null | { user_id: string; stripe_customer_id: string | null; stripe_subscription_id: string | null; status: string; current_period_end: string | null; cancel_at_period_end: boolean; stripe_account_id: string | null; trial_used: boolean; plan: string };
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

type Plan = 'monthly' | 'yearly';

/** A Plus price, made in Stripe the first time it is needed (looked up by its key after that, and remade if the amount changes). */
async function priceId(plan: Plan = 'monthly'): Promise<string> {
  const lookup = plan === 'yearly' ? YEARLY_LOOKUP : PRICE_LOOKUP;
  const amount = plan === 'yearly' ? YEARLY_PENCE : PRICE_PENCE;
  const found = await stripe('GET', 'prices', { lookup_keys: [lookup], active: true, limit: 1 });
  const existing = found?.data?.[0];
  if (existing && existing.unit_amount === amount && existing.currency === CURRENCY) return existing.id;
  const price = await stripe('POST', 'prices', {
    currency: CURRENCY,
    unit_amount: amount,
    recurring: { interval: plan === 'yearly' ? 'year' : 'month' },
    product_data: { name: plan === 'yearly' ? 'Community Plus (yearly)' : 'Community Plus' },
    lookup_key: lookup,
    transfer_lookup_key: true,
  });
  return price.id;
}

/** The member's Plus subscriptions (not their subscriptions to creators), newest first. */
async function plusSubs(customer: string, expand: string[]) {
  const subs = await stripe('GET', 'subscriptions', { customer, status: 'all', limit: 20, expand });
  return ((subs?.data ?? []) as any[]).filter((s) => !isCreatorSub(s));
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
  const { data: rows } = await db.from('community_secrets').select('key, value').in('key', ['stripe_webhook_secret', 'stripe_webhook_id', 'stripe_webhook_events']);
  const stored = Object.fromEntries((rows ?? []).map((r: { key: string; value: string }) => [r.key, r.value]));
  const events = WEBHOOK_EVENTS.join(',');
  if (stored.stripe_webhook_secret && stored.stripe_webhook_events === events) return;
  const save = async (key: string, value: string) => {
    await db.from('community_secrets').upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  };
  // Already registered, but listening for fewer events than the app now handles: widen it in place.
  if (stored.stripe_webhook_secret && stored.stripe_webhook_id) {
    await stripe('POST', `webhook_endpoints/${stored.stripe_webhook_id}`, { enabled_events: WEBHOOK_EVENTS });
    await save('stripe_webhook_events', events);
    return;
  }
  const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/stripe-webhook`;
  // One made earlier whose secret was lost cannot be used: replace it.
  const existing = await stripe('GET', 'webhook_endpoints', { limit: 100 });
  for (const ep of existing?.data ?? []) if (ep.url === url) await stripe('DELETE', `webhook_endpoints/${ep.id}`);
  const ep = await stripe('POST', 'webhook_endpoints', { url, enabled_events: WEBHOOK_EVENTS, api_version: STRIPE_VERSION, description: 'Community app: Plus, ads, donations and refunds' });
  await save('stripe_webhook_secret', ep.secret);
  await save('stripe_webhook_id', ep.id);
  await save('stripe_webhook_events', events);
}

/* ---------- ads ---------- */

async function promote(ctx: Ctx, body: any) {
  const days = Math.round(Number(body?.days));
  if (!Number.isFinite(days) || days < 1 || days > 30) throw new StripeError('Choose between 1 and 30 days.', 400);
  const { data: post } = await ctx.db.from('community_posts').select('id, user_id, group_id').eq('id', body?.post_id).maybeSingle();
  if (!post || post.user_id !== ctx.me) throw new StripeError('You can only promote your own posts.', 403);
  // An ad is for reaching new people: a post only followers or group members can see can't be promoted.
  const { data: author } = await ctx.db.from('community_profiles').select('is_private').eq('id', ctx.me).maybeSingle();
  if (author?.is_private) throw new StripeError('Your account is private, so new people can\'t see this post. Make your account public to promote it.', 400);
  if (post.group_id) {
    const { data: g } = await ctx.db.from('community_groups').select('privacy').eq('id', post.group_id).maybeSingle();
    if (g?.privacy === 'private') throw new StripeError('This post is in a private group, so it can\'t be promoted.', 400);
  }
  const customer = await customerFor(ctx);
  const amount = days * AD_DAY_PENCE;
  const pi = await stripe('POST', 'payment_intents', {
    amount,
    currency: CURRENCY,
    customer,
    payment_method_types: ['card'],
    setup_future_usage: 'off_session',
    description: `Community ad · ${days} day${days === 1 ? '' : 's'}`,
    metadata: { kind: 'ad', user_id: ctx.me, post_id: post.id, days: String(days) },
  });
  const { error } = await ctx.db.from('community_promotions').insert({ post_id: post.id, user_id: ctx.me, days, amount_pence: amount, currency: CURRENCY.toUpperCase(), payment_intent_id: pi.id });
  if (error) {
    // Without its record the ad could never start: call the payment off rather than take the money.
    await stripe('POST', `payment_intents/${pi.id}/cancel`).catch(() => null);
    console.error('promote insert', error.message);
    throw new StripeError('The ad could not be set up. You have not been charged. Try again.', 500);
  }
  return { payment_intent_id: pi.id, client_secret: pi.client_secret, amount, currency: CURRENCY.toUpperCase(), day_pence: AD_DAY_PENCE };
}

/* ---------- fundraisers ---------- */

const RETURN_URL = () => `${Deno.env.get('SUPABASE_URL')}/functions/v1/stripe-return`;

/** The member's own Stripe account (for receiving donations), refreshed from Stripe. */
async function payouts(ctx: Ctx) {
  const row = await billingRow(ctx);
  const id = (row as any)?.stripe_account_id as string | null;
  if (!id) return { has_account: false, charges_enabled: false, payouts_enabled: false, details_submitted: false };
  const acct = await stripe('GET', `accounts/${id}`);
  const state = { charges_enabled: !!acct.charges_enabled, payouts_enabled: !!acct.payouts_enabled, details_submitted: !!acct.details_submitted };
  await ctx.db.from('community_billing').update({ ...state, updated_at: new Date().toISOString() }).eq('user_id', ctx.me);
  return { has_account: true, ...state };
}

/** Starts (or continues) the Stripe form that sets up a member's payout account, and returns its address. */
async function payoutsOnboard(ctx: Ctx, body: any) {
  const row = await billingRow(ctx);
  let id = (row as any)?.stripe_account_id as string | null;
  if (!id) {
    const { data: p } = await ctx.db.from('community_profiles').select('username, contact_email').eq('id', ctx.me).maybeSingle();
    const acct = await stripe('POST', 'accounts', {
      type: 'express',
      country: typeof body?.country === 'string' && /^[A-Z]{2}$/.test(body.country) ? body.country : 'GB',
      email: p?.contact_email || undefined,
      capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
      business_profile: { product_description: p?.username ? `Fundraising by @${p.username} on the Community app` : 'Fundraising on the Community app' },
      metadata: { user_id: ctx.me },
    }, `account-${ctx.me}`);
    id = acct.id as string;
    await ctx.db.from('community_billing').upsert({ user_id: ctx.me, stripe_account_id: id, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  }
  const link = await stripe('POST', 'account_links', { account: id, refresh_url: `${RETURN_URL()}?to=payouts&again=1`, return_url: `${RETURN_URL()}?to=payouts`, type: 'account_onboarding' });
  return { url: link.url };
}

async function payoutsDashboard(ctx: Ctx) {
  const row = await billingRow(ctx);
  const id = (row as any)?.stripe_account_id as string | null;
  if (!id) throw new StripeError('Set up payouts first.', 400);
  const link = await stripe('POST', `accounts/${id}/login_links`);
  return { url: link.url };
}

async function donate(ctx: Ctx, body: any) {
  const amount = Math.round(Number(body?.amount_pence));
  if (!Number.isFinite(amount) || amount < 100 || amount > 1000000) throw new StripeError('Give between £1 and £10,000.', 400);
  const { data: f } = await ctx.db.from('community_fundraisers').select('id, user_id, title, currency, status, ends_at').eq('id', body?.fundraiser_id).maybeSingle();
  if (!f || f.status !== 'active' || (f.ends_at && new Date(f.ends_at) < new Date())) throw new StripeError('This fundraiser has ended.', 400);
  if (f.user_id === ctx.me) throw new StripeError('You can\'t give to your own fundraiser.', 400);
  const { data: owner } = await ctx.db.from('community_billing').select('stripe_account_id').eq('user_id', f.user_id).maybeSingle();
  if (!owner?.stripe_account_id) throw new StripeError('This fundraiser cannot take donations yet.', 400);
  const acct = await stripe('GET', `accounts/${owner.stripe_account_id}`);
  if (!acct.charges_enabled) throw new StripeError('This fundraiser cannot take donations yet.', 400);
  const customer = await customerFor(ctx);
  const message = typeof body?.message === 'string' ? body.message.trim().slice(0, 300) : '';
  // The whole gift goes to the fundraiser's owner: no fee is taken by the app.
  const pi = await stripe('POST', 'payment_intents', {
    amount,
    currency: String(f.currency ?? 'GBP').toLowerCase(),
    customer,
    payment_method_types: ['card'],
    transfer_data: { destination: owner.stripe_account_id },
    on_behalf_of: owner.stripe_account_id,
    description: `Donation · ${f.title}`.slice(0, 120),
    metadata: { kind: 'donation', user_id: ctx.me, fundraiser_id: f.id, owner_id: f.user_id, title: String(f.title).slice(0, 80) },
  });
  const { error } = await ctx.db.from('community_donations').insert({ fundraiser_id: f.id, donor_id: ctx.me, amount_pence: amount, currency: String(f.currency ?? 'GBP').toUpperCase(), message, anonymous: !!body?.anonymous, payment_intent_id: pi.id });
  if (error) {
    await stripe('POST', `payment_intents/${pi.id}/cancel`).catch(() => null);
    console.error('donate insert', error.message);
    throw new StripeError('The gift could not be set up. You have not been charged. Try again.', 500);
  }
  return { payment_intent_id: pi.id, client_secret: pi.client_secret, amount, currency: String(f.currency ?? 'GBP').toUpperCase() };
}

/**
 * Whether a fundraiser's owner can take gifts, asked of Stripe now: their payout setup may have
 * finished since they last opened the app. Anyone signed in may ask; only the yes/no is returned.
 */
async function fundraiserReady(ctx: Ctx, body: any) {
  const { data: f } = await ctx.db.from('community_fundraisers').select('user_id').eq('id', body?.fundraiser_id).maybeSingle();
  if (!f) return { accepting: false };
  const { data: owner } = await ctx.db.from('community_billing').select('stripe_account_id').eq('user_id', f.user_id).maybeSingle();
  if (!owner?.stripe_account_id) return { accepting: false };
  const acct = await stripe('GET', `accounts/${owner.stripe_account_id}`);
  const state = { charges_enabled: !!acct.charges_enabled, payouts_enabled: !!acct.payouts_enabled, details_submitted: !!acct.details_submitted };
  await ctx.db.from('community_billing').update({ ...state, updated_at: new Date().toISOString() }).eq('user_id', f.user_id);
  return { accepting: state.charges_enabled };
}

/** After paying for an ad or a donation: read the payment back and settle it. Only the payer may ask. */
async function settle(ctx: Ctx, body: any) {
  const id = typeof body?.payment_intent_id === 'string' ? body.payment_intent_id : '';
  if (!id.startsWith('pi_')) throw new StripeError('Unknown payment.', 400);
  const pi = await stripe('GET', `payment_intents/${id}`);
  if (pi?.metadata?.user_id !== ctx.me) throw new StripeError('Unknown payment.', 404);
  const r = await settlePaymentIntent(ctx.db, pi);
  return { status: pi.status, ...r };
}

/* ---------- subscriptions to creators ---------- */

/** The creator's monthly price in Stripe, made when first needed and remade when they change it. */
async function creatorPrice(db: SupabaseClient, creatorId: string): Promise<{ price: string; amount: number; account: string; username: string }> {
  const { data: c } = await db.from('community_profiles').select('username, sub_price_pence, sub_price_id, suspended, deleted_at').eq('id', creatorId).maybeSingle();
  if (!c?.sub_price_pence || c.suspended || c.deleted_at) throw new StripeError('This account doesn\'t offer subscriptions.', 400);
  const { data: b } = await db.from('community_billing').select('stripe_account_id').eq('user_id', creatorId).maybeSingle();
  if (!b?.stripe_account_id) throw new StripeError('This account can\'t take subscriptions yet.', 400);
  const acct = await stripe('GET', `accounts/${b.stripe_account_id}`);
  if (!acct.charges_enabled) throw new StripeError('This account can\'t take subscriptions yet.', 400);
  let price = c.sub_price_id as string | null;
  // Use the stored price only if it really is this creator's, at the amount they show.
  if (price) {
    const p = await stripe('GET', `prices/${price}`).catch(() => null);
    if (!p || !p.active || p.unit_amount !== c.sub_price_pence || p.metadata?.creator_id !== creatorId || p.currency !== CURRENCY) price = null;
  }
  if (!price) {
    const made = await stripe('POST', 'prices', {
      currency: CURRENCY,
      unit_amount: c.sub_price_pence,
      recurring: { interval: 'month' },
      product_data: { name: `Subscription to @${c.username}` },
      metadata: { creator_id: creatorId },
    });
    price = made.id as string;
    await db.from('community_profiles').update({ sub_price_id: price }).eq('id', creatorId);
  }
  return { price: price!, amount: c.sub_price_pence, account: b.stripe_account_id, username: c.username };
}

async function creatorSubscribe(ctx: Ctx, body: any) {
  const creatorId = typeof body?.creator_id === 'string' ? body.creator_id : '';
  if (!creatorId || creatorId === ctx.me) throw new StripeError('You can\'t subscribe to yourself.', 400);
  const { data: existing } = await ctx.db.from('community_creator_subs').select('stripe_subscription_id, status').eq('creator_id', creatorId).eq('subscriber_id', ctx.me).maybeSingle();
  if (existing?.stripe_subscription_id) {
    const sub = await stripe('GET', `subscriptions/${existing.stripe_subscription_id}`, { expand: ['latest_invoice.payment_intent.payment_method'] });
    const pi = sub.latest_invoice?.payment_intent;
    // Paid a moment ago, and Stripe hasn't marked the subscription active yet: it is the member's, never a reason for a second one.
    const paid = sub.latest_invoice?.status === 'paid' || pi?.status === 'succeeded';
    if (['active', 'trialing'].includes(sub.status) || (paid && ['incomplete', 'past_due'].includes(sub.status))) {
      if (sub.cancel_at_period_end) await stripe('POST', `subscriptions/${sub.id}`, { cancel_at_period_end: false });
      await applyCreatorSub(ctx.db, { ...sub, cancel_at_period_end: false });
      return { already: true, subscription_id: sub.id, status: sub.status };
    }
    // A payment that failed or was left half-way is paid on the same subscription, never by starting a second one.
    if (['past_due', 'incomplete'].includes(sub.status) && pi?.client_secret && !['canceled', 'succeeded'].includes(pi.status)) {
      return { subscription_id: sub.id, client_secret: pi.client_secret, intent: 'payment', amount: pi.amount, currency: pi.currency };
    }
    // Anything else still open in Stripe (and unpaid) is stopped before a fresh one starts.
    if (!['canceled', 'incomplete_expired'].includes(sub.status)) await stripe('DELETE', `subscriptions/${sub.id}`).catch(() => null);
  }
  const { price, account } = await creatorPrice(ctx.db, creatorId);
  const customer = await customerFor(ctx);
  const sub = await stripe('POST', 'subscriptions', {
    customer,
    items: [{ price }],
    payment_behavior: 'default_incomplete',
    payment_settings: { save_default_payment_method: 'on_subscription', payment_method_types: ['card'] },
    transfer_data: { destination: account },
    on_behalf_of: account,
    application_fee_percent: CREATOR_FEE_PERCENT,
    expand: ['latest_invoice.payment_intent'],
    metadata: { kind: 'creator', creator_id: creatorId, user_id: ctx.me },
  });
  await applyCreatorSub(ctx.db, sub);
  const pi = sub.latest_invoice?.payment_intent;
  if (!pi?.client_secret) throw new StripeError('The payment could not be started. Try again.', 502);
  return { subscription_id: sub.id, client_secret: pi.client_secret, intent: 'payment', amount: pi.amount, currency: pi.currency };
}

async function creatorSync(ctx: Ctx, body: any) {
  const { data: row } = await ctx.db.from('community_creator_subs').select('stripe_subscription_id').eq('creator_id', body?.creator_id).eq('subscriber_id', ctx.me).maybeSingle();
  if (!row?.stripe_subscription_id) return { status: 'none' };
  const sub = await stripe('GET', `subscriptions/${row.stripe_subscription_id}`, { expand: ['latest_invoice.payment_intent.payment_method'] });
  await applyCreatorSub(ctx.db, sub);
  return { status: sub.status, cancel_at_period_end: !!sub.cancel_at_period_end, current_period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null };
}

async function creatorCancel(ctx: Ctx, body: any) {
  const { data: row } = await ctx.db.from('community_creator_subs').select('stripe_subscription_id').eq('creator_id', body?.creator_id).eq('subscriber_id', ctx.me).maybeSingle();
  if (!row?.stripe_subscription_id) throw new StripeError('There is no subscription to change.', 400);
  const sub = await stripe('POST', `subscriptions/${row.stripe_subscription_id}`, { cancel_at_period_end: body?.resume ? false : true });
  await applyCreatorSub(ctx.db, sub);
  return { status: sub.status, cancel_at_period_end: !!sub.cancel_at_period_end };
}

/* ---------- the actions ---------- */

async function status(ctx: Ctx) {
  const row = await billingRow(ctx);
  // In the free week with no card saved for after it: the app offers to add one.
  let needsCard = false;
  if (row?.status === 'trialing' && row.stripe_subscription_id && row.stripe_customer_id) {
    const [sub, cust] = await Promise.all([
      stripe('GET', `subscriptions/${row.stripe_subscription_id}`).catch(() => null),
      stripe('GET', `customers/${row.stripe_customer_id}`).catch(() => null),
    ]);
    needsCard = !!sub && sub.status === 'trialing' && !sub.default_payment_method && !cust?.invoice_settings?.default_payment_method;
  }
  return {
    status: row?.status ?? 'none',
    current_period_end: row?.current_period_end ?? null,
    cancel_at_period_end: row?.cancel_at_period_end ?? false,
    has_customer: !!row?.stripe_customer_id,
    plan: row?.plan || null,
    // The free week is for members who have never had Plus.
    trial_available: TRIAL_DAYS > 0 && !row?.trial_used && !row?.stripe_subscription_id,
    needs_card: needsCard,
  };
}

async function subscribe(ctx: Ctx, body: any) {
  const customer = await customerFor(ctx);
  const savedCard: string | null = typeof body?.payment_method_id === 'string' ? body.payment_method_id : null;
  const plan: Plan = body?.plan === 'yearly' ? 'yearly' : 'monthly';
  const price = await priceId(plan);

  const subs = await plusSubs(customer, ['data.latest_invoice.payment_intent', 'data.pending_setup_intent']);
  // A renewal that failed: pay its invoice now, with whatever the member chooses.
  const overdue = subs.find((s: any) => s.status === 'past_due' && s.latest_invoice?.payment_intent?.client_secret && s.latest_invoice.payment_intent.status !== 'succeeded');
  if (overdue) {
    const pi = overdue.latest_invoice.payment_intent;
    return { subscription_id: overdue.id, client_secret: pi.client_secret, intent: 'payment', status: pi.status, amount: pi.amount, currency: pi.currency };
  }
  // Already a member: switch plan if asked (Stripe settles the difference), and make sure it renews.
  const live = subs.find((s: any) => ['active', 'trialing', 'past_due'].includes(s.status));
  if (live) {
    const noCard = live.status === 'trialing' && !live.default_payment_method;
    const patch: Record<string, unknown> = {};
    // In the free week without a card yet, a saved card chosen now is the one charged after it.
    if (noCard && savedCard) patch.default_payment_method = savedCard;
    if (live.cancel_at_period_end) patch.cancel_at_period_end = false;
    const item = live.items?.data?.[0];
    if (item && item.price?.id !== price) {
      patch.items = [{ id: item.id, price }];
      patch.proration_behavior = 'create_prorations';
    }
    const updated = Object.keys(patch).length ? await stripe('POST', `subscriptions/${live.id}`, { ...patch, expand: ['latest_invoice.payment_intent', 'pending_setup_intent'] }) : live;
    await applySubscription(ctx.db, ctx.me, updated);
    // Still no card for after the free week (the card form was closed): offer the card form again.
    const si = updated.pending_setup_intent?.client_secret ? updated.pending_setup_intent : live.pending_setup_intent;
    if (noCard && !savedCard && si?.client_secret) {
      return { subscription_id: live.id, client_secret: si.client_secret, intent: 'setup', trial_days: TRIAL_DAYS, amount: 0, currency: CURRENCY, plan_changed: !!patch.items };
    }
    return { already: true, subscription_id: live.id };
  }

  // A checkout left half-way on the same plan is picked up again rather than starting a second one.
  let sub = subs.find((s: any) => s.status === 'incomplete' && s.items?.data?.[0]?.price?.id === price && s.latest_invoice?.payment_intent?.status && s.latest_invoice.payment_intent.status !== 'canceled');
  let trial = false;
  if (!sub) {
    const row = await billingRow(ctx);
    // One free week per member, ever: not after any earlier Plus subscription.
    trial = TRIAL_DAYS > 0 && !row?.trial_used && subs.length === 0;
    sub = await stripe('POST', 'subscriptions', {
      customer,
      items: [{ price }],
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription', payment_method_types: ['card'] },
      default_payment_method: savedCard ?? undefined,
      trial_period_days: trial ? TRIAL_DAYS : undefined,
      // If no card is ever added, the free week simply ends: nothing is charged.
      trial_settings: trial ? { end_behavior: { missing_payment_method: 'cancel' } } : undefined,
      expand: ['latest_invoice.payment_intent', 'pending_setup_intent'],
      metadata: { user_id: ctx.me, kind: 'plus' },
    });
    if (trial) await ctx.db.from('community_billing').update({ trial_used: true, updated_at: new Date().toISOString() }).eq('user_id', ctx.me);
  }

  if (sub.status === 'trialing') {
    await applySubscription(ctx.db, ctx.me, sub);
    // A card is still needed for after the free week, unless a saved one was chosen.
    const si = sub.pending_setup_intent;
    if (si?.client_secret && !savedCard) return { subscription_id: sub.id, client_secret: si.client_secret, intent: 'setup', trial_days: TRIAL_DAYS, amount: 0, currency: CURRENCY };
    return { already: true, subscription_id: sub.id, trial_days: TRIAL_DAYS };
  }
  const pi = sub.latest_invoice?.payment_intent;
  if (!pi?.client_secret) throw new StripeError('The payment could not be started. Try again.', 502);
  if (pi.status === 'succeeded') {
    const fresh = await stripe('GET', `subscriptions/${sub.id}`, { expand: ['latest_invoice.payment_intent.payment_method'] });
    await applySubscription(ctx.db, ctx.me, fresh);
    return { already: true, subscription_id: sub.id };
  }
  return { subscription_id: sub.id, client_secret: pi.client_secret, intent: 'payment', status: pi.status, amount: pi.amount, currency: pi.currency, trial: trial || undefined };
}

async function sync(ctx: Ctx) {
  const row = await billingRow(ctx);
  if (!row?.stripe_customer_id) return { plus: false, ...(await status(ctx)) };
  const list = await plusSubs(row.stripe_customer_id, ['data.latest_invoice.payment_intent.payment_method']);
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
          yearly_pence: YEARLY_PENCE,
          trial_days: TRIAL_DAYS,
          creator_fee_percent: CREATOR_FEE_PERCENT,
          currency: CURRENCY.toUpperCase(),
          test_mode: publishable.startsWith('pk_test_'),
          ad_day_pence: AD_DAY_PENCE,
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
        return json({ cards: await listCards(row!.stripe_customer_id!) });
      }
      case 'default_card': {
        const row = await billingRow(ctx);
        const cards = row?.stripe_customer_id ? await listCards(row.stripe_customer_id) : [];
        if (!cards.some((c) => c.id === body.payment_method_id)) return json({ error: 'That card is not on this account.' }, 404);
        await stripe('POST', `customers/${row!.stripe_customer_id}`, { invoice_settings: { default_payment_method: body.payment_method_id } });
        // Every running subscription (Plus and subscriptions to creators) is charged with it from now
        // on, including a renewal Stripe is retrying.
        const subs = await stripe('GET', 'subscriptions', { customer: row!.stripe_customer_id, status: 'all', limit: 50 }).catch(() => null);
        for (const s of (subs?.data ?? []) as any[]) {
          if (['active', 'trialing', 'past_due', 'unpaid'].includes(s.status)) await stripe('POST', `subscriptions/${s.id}`, { default_payment_method: body.payment_method_id }).catch(() => null);
        }
        return json({ cards: await listCards(row!.stripe_customer_id!) });
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
      case 'promote':
        return json(await promote(ctx, body));
      case 'donate':
        return json(await donate(ctx, body));
      case 'settle':
        return json(await settle(ctx, body));
      case 'payouts':
        return json(await payouts(ctx));
      case 'payouts_onboard':
        return json(await payoutsOnboard(ctx, body));
      case 'payouts_dashboard':
        return json(await payoutsDashboard(ctx));
      case 'fundraiser_ready':
        return json(await fundraiserReady(ctx, body));
      case 'creator_subscribe':
        return json(await creatorSubscribe(ctx, body));
      case 'creator_sync':
        return json(await creatorSync(ctx, body));
      case 'creator_cancel':
        return json(await creatorCancel(ctx, body));
      default:
        return json({ error: 'Unknown action.' }, 400);
    }
  } catch (e) {
    if (e instanceof StripeError) return json({ error: e.message, code: e.code }, e.status);
    console.error('payments', e);
    return json({ error: 'Something went wrong with the payment service. Try again.' }, 500);
  }
});
