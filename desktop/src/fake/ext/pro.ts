// Demo data for the Professional dashboard and money: the payments function (Stripe in the real app),
// insights, ads, saved cards, Plus with its free week, payouts, fundraisers and the tick application.
// Nothing is charged. The answers have the same shapes as supabase/functions/payments/index.ts.
import type { Ctx, Ext, Row } from './types';

const DAY = 86400e3;
const HOUR = 3600e3;
const ago = (hours: number) => new Date(Date.now() - hours * HOUR).toISOString();
const ahead = (days: number) => new Date(Date.now() + days * DAY).toISOString();
const rand = () => Math.random().toString(36).slice(2, 10);

/** The demo's prices (the real function reads them from its secrets). */
const MONTHLY = 499;
const YEARLY = 4999;
const AD_DAY = 100;
const TRIAL_DAYS = 7;
const CREATOR_FEE = 10;
/** Plus runs a day past the paid period, as in the real function, so a late renewal never drops it. */
const GRACE = DAY;

type Card = { id: string; brand: string; last4: string; exp_month: number; exp_year: number; wallet: string | null };

/** Saved cards per member and each member's default card (Stripe keeps these on the customer). */
const cards = new Map<string, Card[]>();
const defaults = new Map<string, string>();
/** One-off payments (ads, gifts) waiting to be settled, by payment intent id. */
const intents = new Map<string, Row>();
/** Plus subscriptions waiting for their first payment, by subscription id. */
const subs = new Map<string, Row>();
/** SetupIntents from add_card, by client secret, until the card form is completed. */
const cardSetups = new Map<string, string>();
/** The free week's card form, per member, until it is completed. */
const trialSetups = new Map<string, string>();

const BRANDS: Record<string, string> = { visa: 'Visa', mastercard: 'Mastercard', amex: 'Amex' };
const label = (c: Card) => `${BRANDS[c.brand] ?? 'Card'} •••• ${c.last4}`;
/** Sample cards, as if typed into Stripe's form; the first one the member hasn't saved yet is used. */
const SAMPLES: Omit<Card, 'id'>[] = [
  { brand: 'visa', last4: '4242', exp_month: 12, exp_year: 2029, wallet: null },
  { brand: 'mastercard', last4: '4444', exp_month: 8, exp_year: 2030, wallet: null },
  { brand: 'amex', last4: '8431', exp_month: 3, exp_year: 2031, wallet: null },
  { brand: 'visa', last4: '1881', exp_month: 11, exp_year: 2028, wallet: null },
];

function listCards(user: string) {
  return (cards.get(user) ?? []).map((c) => ({ ...c, is_default: c.id === defaults.get(user) }));
}

/** Saves a sample card to the member's customer, as confirming a SetupIntent (or paying with a new card) does. */
function saveCard(user: string, prefer?: Omit<Card, 'id'>): Card {
  const mine = cards.get(user) ?? [];
  const pick = prefer && !mine.some((c) => c.last4 === prefer.last4) ? prefer : SAMPLES.find((s) => !mine.some((c) => c.last4 === s.last4)) ?? SAMPLES[0];
  const card = { ...pick, id: 'pm_demo_' + rand() };
  cards.set(user, [...mine, card]);
  return card;
}

/** The card a payment was made with: the default, else the newest saved card, else Stripe's test card. */
function payingCard(user: string): string {
  const mine = cards.get(user) ?? [];
  const c = mine.find((x) => x.id === defaults.get(user)) ?? mine[mine.length - 1];
  return c ? label(c) : 'Visa •••• 4242';
}

// The pay dialog tells the demo when its card form was completed (src/screens/pro-kit.tsx): that is
// when Stripe would save a card added with add_card.
(globalThis as any).__demoConfirmed = (secret: string) => {
  const user = cardSetups.get(secret);
  if (!user) return;
  cardSetups.delete(secret);
  saveCard(user);
};

/** Insights for the signed-in member between two times, like the community_stats database function. */
function stats({ T, me, count }: Ctx, fromIso: string, toIso: string) {
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  const inRange = (iso: string) => {
    const t = new Date(iso).getTime();
    return t >= from && t <= to;
  };
  const mine = T('community_posts').filter((p) => p.user_id === me());
  const mineIds = new Set(mine.map((p) => p.id));
  const days: { d: string; views: number; followers: number }[] = [];
  for (let t = from; t <= to + 1; t += DAY) {
    const d = new Date(t).toISOString().slice(0, 10);
    if (days.some((x) => x.d === d)) continue;
    // Views made up from the date, steady from one visit to the next; busier at the weekend.
    let h = 7;
    for (const ch of d + me()) h = (h * 31 + ch.charCodeAt(0)) % 9973;
    const weekend = [0, 6].includes(new Date(d + 'T12:00:00Z').getUTCDay());
    const followers = count('community_follows', (f) => f.following_id === me() && String(f.created_at).slice(0, 10) === d);
    days.push({ d, views: 12 + (h % 38) + (weekend ? 18 : 0) + followers * 9, followers });
  }
  const views = days.reduce((a, b) => a + b.views, 0);
  const postViews = Math.round(views * 0.72);
  const likes = mine.filter((p) => inRange(p.created_at)).reduce((a, p) => a + (p.like_base ?? 0), 0) + count('community_likes', (l) => mineIds.has(l.post_id) && inRange(l.created_at));
  const viewsOf = (p: Row) => (p.view_base ?? 0) + count('community_post_views', (v) => v.post_id === p.id);
  return {
    views,
    post_views: postViews,
    story_views: views - postViews,
    accounts: Math.round(views * 0.38),
    new_followers: days.reduce((a, b) => a + b.followers, 0),
    followers: count('community_follows', (f) => f.following_id === me()),
    posts: mine.filter((p) => p.kind !== 'reel' && inRange(p.created_at)).length,
    reels: mine.filter((p) => p.kind === 'reel' && inRange(p.created_at)).length,
    stories: count('community_stories', (s) => s.user_id === me() && inRange(s.created_at)),
    likes,
    comments: count('community_comments', (c) => mineIds.has(c.post_id) && inRange(c.created_at)),
    reposts: count('community_reposts', (r) => mineIds.has(r.post_id) && inRange(r.created_at)),
    days,
    top: mine
      .filter((p) => inRange(p.created_at))
      .map((p) => ({
        id: p.id, kind: p.kind, media: p.media?.[0] ?? null, created_at: p.created_at, views: viewsOf(p),
        likes: (p.like_base ?? 0) + count('community_likes', (l) => l.post_id === p.id),
        comments: count('community_comments', (c) => c.post_id === p.id),
      }))
      .sort((a, b) => b.views - a.views),
  };
}

/** Columns the database fills in by default on an identity check. */
const REQUEST_DEFAULTS: Row = { status: 'pending', note: '', decided_by: null, decided_at: null, selfie_path: '', document_path: '', document_type: '', legal_name: '', path: '', category: '', country: '', audience: '', known_as: '', links: [] };

export const ext: Ext = {
  seed: ({ T }) => {
    // Payout accounts and subscriptions on the billing rows the admin console's sample data made.
    const bill = (id: string) => T('community_billing').find((b) => b.user_id === id);
    const mine = bill('demo_me');
    if (mine) Object.assign(mine, { stripe_customer_id: 'cus_demo_me', stripe_subscription_id: 'sub_demo_me', plan: 'monthly', trial_used: true, stripe_account_id: null, charges_enabled: false, payouts_enabled: false, details_submitted: false });
    const grace = bill('u_grace');
    if (grace) Object.assign(grace, { stripe_customer_id: 'cus_demo_grace', stripe_subscription_id: 'sub_demo_grace', plan: 'yearly', trial_used: true, stripe_account_id: 'acct_demo_grace', charges_enabled: true, payouts_enabled: true, details_submitted: true });
    if (!bill('u_daniel')) {
      T('community_billing').push({ user_id: 'u_daniel', status: 'none', current_period_end: null, cancel_at_period_end: false, stripe_customer_id: 'cus_demo_daniel', stripe_subscription_id: null, plan: null, trial_used: false, stripe_account_id: 'acct_demo_daniel', charges_enabled: true, payouts_enabled: false, details_submitted: true, updated_at: ago(300) });
    }
    cards.set('demo_me', [{ id: 'pm_demo_visa', ...SAMPLES[0] }]);
    defaults.set('demo_me', 'pm_demo_visa');
    cards.set('u_grace', [{ id: 'pm_demo_grace', ...SAMPLES[1] }]);
    defaults.set('u_grace', 'pm_demo_grace');

    // Two earlier ads of mine: one ran its course, one was refunded.
    if (!T('community_promotions').some((p) => p.user_id === 'demo_me')) {
      T('community_promotions').push(
        { id: 'pm3', post_id: 'p11', user_id: 'demo_me', days: 3, amount_pence: 3 * AD_DAY, currency: 'GBP', status: 'ended', payment_intent_id: 'pi_demo_pm3', starts_at: ago(160), ends_at: ago(88), created_at: ago(160) },
        { id: 'pm4', post_id: 'p7', user_id: 'demo_me', days: 1, amount_pence: AD_DAY, currency: 'GBP', status: 'refunded', payment_intent_id: 'pi_demo_pm4', starts_at: ago(66), ends_at: ago(42), created_at: ago(66) },
      );
      T('community_transactions').push(
        { id: 'txpm3', user_id: 'demo_me', kind: 'ad', amount_pence: 3 * AD_DAY, currency: 'GBP', note: 'Ad · 3 days', created_by: null, created_at: ago(160), provider: 'stripe', status: 'succeeded', method: 'Visa •••• 4242', stripe_invoice_id: 'pi:pi_demo_pm3' },
        { id: 'txpm4', user_id: 'demo_me', kind: 'ad', amount_pence: AD_DAY, currency: 'GBP', note: 'Ad · 1 day', created_by: null, created_at: ago(66), provider: 'stripe', status: 'refunded', method: 'Visa •••• 4242', stripe_invoice_id: 'pi:pi_demo_pm4' },
      );
    }

    // I offer subscriptions, and two people subscribe.
    const me = T('community_profiles').find((p) => p.id === 'demo_me');
    if (me) me.sub_price_pence ??= 299;
    if (!T('community_creator_subs').some((s) => s.creator_id === 'demo_me')) {
      for (const [who, h] of [['u_ruth', 400], ['u_joseph', 120]] as const) {
        T('community_creator_subs').push({ id: 'cs_' + who, creator_id: 'demo_me', subscriber_id: who, status: 'active', current_period_end: ahead(12), cancel_at_period_end: false, amount_pence: 299, stripe_subscription_id: 'sub_demo_cs_' + who, created_at: ago(h) });
      }
    }
  },

  views: ({ T, profile }) => ({
    // The table's defaults, as the database fills them in on insert.
    community_plus_requests: () =>
      T('community_plus_requests').map((r) => {
        for (const [k, v] of Object.entries(REQUEST_DEFAULTS)) if (r[k] === undefined) r[k] = Array.isArray(v) ? [...v] : v;
        return { ...r };
      }),
    // As community_fundraiser_cards in the database: totals of settled gifts, and whether the owner's
    // payout account can take them (private.community_accepts_donations).
    community_fundraiser_cards: () =>
      T('community_fundraisers').map((f) => {
        f.status ??= 'active';
        f.currency ??= 'GBP';
        f.cover_url ??= '';
        f.description ??= '';
        f.ends_at ??= null;
        const a = profile(f.user_id);
        const ds = T('community_donations').filter((d) => d.fundraiser_id === f.id && d.status === 'succeeded');
        const owner = T('community_billing').find((b) => b.user_id === f.user_id);
        return {
          ...f, username: a.username, full_name: a.full_name, avatar_url: a.avatar_url, verified: !!a.verified,
          raised_pence: ds.reduce((x, d) => x + d.amount_pence, 0),
          donor_count: new Set(ds.map((d) => d.donor_id ?? d.id)).size,
          accepting: !!owner?.charges_enabled,
        };
      }),
  }),

  rpc: (ctx) => ({
    community_stats: ({ from_ts, to_ts }: { from_ts: string; to_ts: string }) => stats(ctx, from_ts, to_ts),
  }),

  functions: (ctx) => {
    const { T, me, now, profile, insertRow } = ctx;
    const billing = (user = me()) => T('community_billing').find((b) => b.user_id === user);
    /** The member's billing row, made the first time they pay, save a card or set up payouts. */
    const ensureBilling = () => {
      let b = billing();
      if (!b) {
        b = { user_id: me(), status: 'none', current_period_end: null, cancel_at_period_end: false, stripe_customer_id: null, stripe_subscription_id: null, plan: null, trial_used: false, stripe_account_id: null, charges_enabled: false, payouts_enabled: false, details_submitted: false, updated_at: now() };
        T('community_billing').push(b);
      }
      return b;
    };
    /** Like customerFor: a Stripe customer the first time it's needed. */
    const customer = () => {
      const b = ensureBilling();
      b.stripe_customer_id ||= 'cus_demo_' + me();
      return b;
    };
    const status = () => {
      const b = billing();
      return {
        status: b?.status ?? 'none',
        current_period_end: b?.current_period_end ?? null,
        cancel_at_period_end: !!b?.cancel_at_period_end,
        has_customer: !!b?.stripe_customer_id,
        plan: b?.plan || null,
        trial_available: TRIAL_DAYS > 0 && !b?.trial_used && !b?.stripe_subscription_id,
        needs_card: b?.status === 'trialing' && !b.sub_card && !defaults.get(me()),
      };
    };
    /** Plus until the end of the period (plus a day), never shortening Plus an admin gave for longer. */
    const plusUntil = (end: string) => {
      const p = T('community_profiles').find((x) => x.id === me());
      const until = new Date(new Date(end).getTime() + GRACE).toISOString();
      if (p && (!p.plus_until || p.plus_until < until)) p.plus_until = until;
    };
    const period = (plan: string) => ahead(plan === 'yearly' ? 365 : 30);
    const priceOf = (plan: string | null) => (plan === 'yearly' ? YEARLY : MONTHLY);
    const book = (row: Row) => insertRow('community_transactions', { created_by: null, provider: 'stripe', status: 'succeeded', currency: 'GBP', ...row });

    /** After paying: the subscriptions waiting for a first payment start, and the free week gets its card. */
    const sync = () => {
      const b = billing();
      for (const [id, s] of subs) {
        if (s.user !== me()) continue;
        subs.delete(id);
        const bb = customer();
        Object.assign(bb, { stripe_subscription_id: id, status: 'active', plan: s.plan, current_period_end: period(s.plan), cancel_at_period_end: false, updated_at: now() });
        plusUntil(bb.current_period_end);
        // A new card typed into the form is saved to the customer (save_default_payment_method).
        const card = s.card ?? saveCard(me()).id;
        bb.sub_card = card;
        book({ user_id: me(), kind: 'plus', amount_pence: s.amount, note: 'Community Plus · first payment', method: payingCard(me()), stripe_invoice_id: 'in_demo_' + rand() });
      }
      if (b?.status === 'trialing' && trialSetups.has(me())) {
        trialSetups.delete(me());
        b.sub_card = saveCard(me()).id;
      }
      const p = T('community_profiles').find((x) => x.id === me());
      return { plus: !!p?.plus_until && new Date(p.plus_until) > new Date(), ...status() };
    };

    const subscribe = (body: Row) => {
      const plan = body.plan === 'yearly' ? 'yearly' : 'monthly';
      const saved: string | null = typeof body.payment_method_id === 'string' ? body.payment_method_id : null;
      const b = customer();
      const id = b.stripe_subscription_id || 'sub_demo_' + rand();
      // A renewal that failed: pay its invoice now.
      if (b.status === 'past_due') {
        const amount = priceOf(b.plan);
        subs.set(id, { user: me(), plan: b.plan ?? 'monthly', amount, card: saved });
        return { subscription_id: id, client_secret: 'pi_demo_' + rand() + '_secret_' + rand(), intent: 'payment', status: 'requires_payment_method', amount, currency: 'gbp' };
      }
      // Already a member: switch plan if asked, and make sure it renews.
      if (b.status === 'active' || b.status === 'trialing') {
        const noCard = b.status === 'trialing' && !b.sub_card && !defaults.get(me());
        if (noCard && saved) b.sub_card = saved;
        b.cancel_at_period_end = false;
        const changed = (b.plan ?? 'monthly') !== plan;
        if (changed) {
          b.plan = plan;
          // A paid member moving between monthly and yearly starts the new period now (Stripe prorates).
          if (b.status === 'active') {
            b.current_period_end = period(plan);
            plusUntil(b.current_period_end);
          }
        }
        if (noCard && !saved) {
          const secret = 'seti_demo_' + rand() + '_secret_' + rand();
          trialSetups.set(me(), secret);
          return { subscription_id: id, client_secret: secret, intent: 'setup', trial_days: TRIAL_DAYS, amount: 0, currency: 'gbp', plan_changed: changed };
        }
        return { already: true, subscription_id: id };
      }
      // New: the first week is free for anyone who has never had Plus.
      const trial = TRIAL_DAYS > 0 && !b.trial_used && !b.stripe_subscription_id;
      if (trial) {
        Object.assign(b, { trial_used: true, stripe_subscription_id: id, status: 'trialing', plan, current_period_end: ahead(TRIAL_DAYS), cancel_at_period_end: false, sub_card: saved, updated_at: now() });
        plusUntil(b.current_period_end);
        if (!saved && !defaults.get(me())) {
          const secret = 'seti_demo_' + rand() + '_secret_' + rand();
          trialSetups.set(me(), secret);
          return { subscription_id: id, client_secret: secret, intent: 'setup', trial_days: TRIAL_DAYS, amount: 0, currency: 'gbp' };
        }
        return { already: true, subscription_id: id, trial_days: TRIAL_DAYS };
      }
      const amount = priceOf(plan);
      subs.set(id, { user: me(), plan, amount, card: saved });
      return { subscription_id: id, client_secret: 'pi_demo_' + rand() + '_secret_' + rand(), intent: 'payment', status: 'requires_payment_method', amount, currency: 'gbp' };
    };

    const setRenewal = (cancel: boolean) => {
      const b = billing();
      if (!b?.stripe_subscription_id || b.status === 'none') throw new Error('There is no subscription to change.');
      b.cancel_at_period_end = cancel;
      b.updated_at = now();
      return status();
    };

    const promote = (body: Row) => {
      const days = Math.round(Number(body.days));
      if (!Number.isFinite(days) || days < 1 || days > 30) throw new Error('Choose between 1 and 30 days.');
      const post = T('community_posts').find((p) => p.id === body.post_id);
      if (!post || post.user_id !== me()) throw new Error('You can only promote your own posts.');
      if (profile(me()).is_private) throw new Error("Your account is private, so new people can't see this post. Make your account public to promote it.");
      if (post.group_id && T('community_groups').find((g) => g.id === post.group_id)?.privacy === 'private') throw new Error("This post is in a private group, so it can't be promoted.");
      customer();
      const amount = days * AD_DAY;
      const pi = 'pi_demo_' + rand();
      insertRow('community_promotions', { post_id: post.id, user_id: me(), days, amount_pence: amount, currency: 'GBP', status: 'pending', payment_intent_id: pi, starts_at: null, ends_at: null });
      intents.set(pi, { kind: 'ad', user: me(), amount, days, post_id: post.id });
      return { payment_intent_id: pi, client_secret: pi + '_secret_' + rand(), amount, currency: 'GBP', day_pence: AD_DAY };
    };

    const donate = (body: Row) => {
      const amount = Math.round(Number(body.amount_pence));
      if (!Number.isFinite(amount) || amount < 100 || amount > 1000000) throw new Error('Give between £1 and £10,000.');
      const f = T('community_fundraisers').find((x) => x.id === body.fundraiser_id);
      if (!f || (f.status ?? 'active') !== 'active' || (f.ends_at && new Date(f.ends_at) < new Date())) throw new Error('This fundraiser has ended.');
      if (f.user_id === me()) throw new Error("You can't give to your own fundraiser.");
      const owner = billing(f.user_id);
      if (!owner?.stripe_account_id || !owner.charges_enabled) throw new Error('This fundraiser cannot take donations yet.');
      customer();
      const message = typeof body.message === 'string' ? body.message.trim().slice(0, 300) : '';
      const currency = String(f.currency ?? 'GBP').toUpperCase();
      const pi = 'pi_demo_' + rand();
      insertRow('community_donations', { fundraiser_id: f.id, donor_id: me(), amount_pence: amount, currency, message, anonymous: !!body.anonymous, payment_intent_id: pi, status: 'pending' });
      intents.set(pi, { kind: 'donation', user: me(), amount, title: String(f.title).slice(0, 80) });
      return { payment_intent_id: pi, client_secret: pi + '_secret_' + rand(), amount, currency };
    };

    /** Like settlePaymentIntent: the ad starts running, or the gift is counted, and one line goes in the books. */
    const settle = (body: Row) => {
      const id = typeof body.payment_intent_id === 'string' ? body.payment_intent_id : '';
      if (!id.startsWith('pi_')) throw new Error('Unknown payment.');
      const it = intents.get(id);
      if (!it || it.user !== me()) throw new Error('Unknown payment.');
      if (!it.settled) {
        it.settled = true;
        if (it.kind === 'ad') {
          const promo = T('community_promotions').find((p) => p.payment_intent_id === id);
          if (promo && (promo.status === 'pending' || promo.status === 'failed')) {
            const post = T('community_posts').find((p) => p.id === promo.post_id);
            // Days paid for while it is still running are added on after the current ones.
            const from = post?.boosted_until && new Date(post.boosted_until) > new Date() ? new Date(post.boosted_until).getTime() : Date.now();
            const ends = new Date(from + promo.days * DAY).toISOString();
            Object.assign(promo, { status: 'active', starts_at: now(), ends_at: ends });
            if (post) post.boosted_until = ends;
          }
        } else {
          for (const d of T('community_donations')) if (d.payment_intent_id === id && d.status !== 'refunded') d.status = 'succeeded';
        }
        // A card typed in for an ad is kept for next time (setup_future_usage).
        if (it.kind === 'ad' && !(cards.get(me()) ?? []).length) saveCard(me());
        book({
          user_id: me(), kind: it.kind, amount_pence: it.amount,
          note: it.kind === 'ad' ? `Ad · ${it.days} day${it.days === 1 ? '' : 's'}` : `Donation · ${it.title}`,
          method: payingCard(me()), stripe_invoice_id: 'pi:' + id, stripe_payment_intent_id: id,
        });
      }
      return { status: 'succeeded', settled: true };
    };

    const payouts = () => {
      const b = billing();
      if (!b?.stripe_account_id) return { has_account: false, charges_enabled: false, payouts_enabled: false, details_submitted: false };
      return { has_account: true, charges_enabled: !!b.charges_enabled, payouts_enabled: !!b.payouts_enabled, details_submitted: !!b.details_submitted };
    };

    const cardAction = (body: Row, change: (id: string) => void) => {
      const user = me();
      if (!(cards.get(user) ?? []).some((c) => c.id === body.payment_method_id)) throw new Error('That card is not on this account.');
      change(body.payment_method_id);
      return { cards: listCards(user) };
    };

    return {
      payments: (body: Row) => {
        switch (body.action) {
          case 'config':
            return { ready: true, publishable_key: 'pk_test_demo', apple_merchant_id: '', price_pence: MONTHLY, yearly_pence: YEARLY, trial_days: TRIAL_DAYS, creator_fee_percent: CREATOR_FEE, currency: 'GBP', test_mode: true, ad_day_pence: AD_DAY, ...status() };
          case 'status':
            return status();
          case 'cards':
            return { cards: billing()?.stripe_customer_id ? listCards(me()) : [] };
          case 'add_card': {
            customer();
            const secret = 'seti_demo_' + rand() + '_secret_' + rand();
            cardSetups.set(secret, me());
            return { client_secret: secret };
          }
          case 'remove_card':
            return cardAction(body, (id) => {
              cards.set(me(), (cards.get(me()) ?? []).filter((c) => c.id !== id));
              // Stripe forgets the default when that card goes.
              if (defaults.get(me()) === id) defaults.delete(me());
              const b = billing();
              if (b?.sub_card === id) b.sub_card = null;
            });
          case 'default_card':
            return cardAction(body, (id) => {
              defaults.set(me(), id);
              // Every running subscription is charged with it from now on.
              const b = billing();
              if (b && ['active', 'trialing', 'past_due'].includes(b.status)) b.sub_card = id;
            });
          case 'subscribe':
            return subscribe(body);
          case 'sync':
            return sync();
          case 'cancel':
            return setRenewal(true);
          case 'resume':
            return setRenewal(false);
          case 'promote':
            return promote(body);
          case 'donate':
            return donate(body);
          case 'settle':
            return settle(body);
          case 'payouts':
            return payouts();
          case 'payouts_onboard': {
            const b = ensureBilling();
            b.stripe_account_id ||= 'acct_demo_' + me();
            // The demo has no Stripe form to fill in: the account is ready straight away.
            Object.assign(b, { charges_enabled: true, payouts_enabled: true, details_submitted: true, updated_at: now() });
            return { url: 'https://connect.stripe.com/setup/e/' + b.stripe_account_id };
          }
          case 'payouts_dashboard': {
            const b = billing();
            if (!b?.stripe_account_id) throw new Error('Set up payouts first.');
            return { url: 'https://connect.stripe.com/express/' + b.stripe_account_id };
          }
          case 'fundraiser_ready': {
            const f = T('community_fundraisers').find((x) => x.id === body.fundraiser_id);
            return { accepting: !!f && !!billing(f.user_id)?.charges_enabled };
          }
          case 'creator_subscribe': {
            if (!body.creator_id || body.creator_id === me()) throw new Error("You can't subscribe to yourself.");
            const c = T('community_profiles').find((x) => x.id === body.creator_id);
            if (!c?.sub_price_pence) throw new Error("This account doesn't offer subscriptions.");
            return { subscription_id: 'sub_demo_creator_' + rand(), client_secret: 'pi_demo_' + rand() + '_secret_' + rand(), intent: 'payment', amount: c.sub_price_pence, currency: 'gbp' };
          }
          case 'creator_sync': {
            const existing = T('community_creator_subs').find((x) => x.creator_id === body.creator_id && x.subscriber_id === me());
            const end = ahead(30);
            const amount = T('community_profiles').find((x) => x.id === body.creator_id)?.sub_price_pence ?? 299;
            if (existing) Object.assign(existing, { status: 'active', current_period_end: end, cancel_at_period_end: false });
            else insertRow('community_creator_subs', { creator_id: body.creator_id, subscriber_id: me(), status: 'active', current_period_end: end, cancel_at_period_end: false, amount_pence: amount });
            return { status: 'active', cancel_at_period_end: false, current_period_end: end };
          }
          case 'creator_cancel': {
            const s = T('community_creator_subs').find((x) => x.creator_id === body.creator_id && x.subscriber_id === me());
            if (!s) throw new Error('There is no subscription to change.');
            s.cancel_at_period_end = !body.resume;
            return { status: s.status, cancel_at_period_end: !!s.cancel_at_period_end };
          }
          default:
            throw new Error('Unknown action.');
        }
      },
    };
  },
};
