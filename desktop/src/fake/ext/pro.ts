// Demo data for the Professional dashboard and money: the payments function (Stripe in the real app),
// promotions, fundraisers and creator subscriptions. Nothing is charged.
import type { Ext, Row } from './types';

const DAY = 86400e3;

export const ext: Ext = {
  functions: ({ T, me, now, newId, insertRow }) => {
    const secret = (kind: string) => 'demo_' + kind + '_secret_' + Math.random().toString(36).slice(2, 8);
    const billing = () => T('community_billing').find((b) => b.user_id === me());
    const status = () => {
      const b = billing();
      return { status: b?.status ?? 'none', current_period_end: b?.current_period_end ?? null, cancel_at_period_end: !!b?.cancel_at_period_end, has_customer: !!b, plan: b?.plan ?? (b ? 'monthly' : null), trial_available: !b, needs_card: false };
    };
    const intents = new Map<string, Row>();
    const start = (kind: string, amount: number, extra: Row = {}) => {
      const id = 'pi_demo_' + newId().slice(-6);
      intents.set(id, { kind, amount, ...extra });
      return { payment_intent_id: id, client_secret: secret(kind), amount, currency: 'gbp' };
    };
    return {
      payments: (body: Row) => {
        switch (body.action) {
          case 'config':
            return { ...status(), ready: true, publishable_key: 'pk_test_demo', apple_merchant_id: '', price_pence: 499, currency: 'gbp', test_mode: true, ad_day_pence: 100, yearly_pence: 4999, trial_days: 7, creator_fee_percent: 10 };
          case 'status':
            return status();
          case 'cards':
            return { cards: [{ id: 'pm_demo', brand: 'visa', last4: '4242', exp_month: 12, exp_year: 2029, wallet: null, is_default: true }] };
          case 'promote':
            return { ...start('promote', 100 * (body.days ?? 1), { post_id: body.post_id, days: body.days ?? 1 }), day_pence: 100 };
          case 'donate':
            return start('donate', body.amount_pence, { fundraiser_id: body.fundraiser_id, message: body.message ?? '', anonymous: !!body.anonymous });
          case 'settle': {
            const it = intents.get(body.payment_intent_id);
            if (it?.kind === 'promote') {
              const ends = new Date(Date.now() + it.days * DAY).toISOString();
              insertRow('community_promotions', { post_id: it.post_id, user_id: me(), days: it.days, amount_pence: it.amount, currency: 'GBP', status: 'active', payment_intent_id: body.payment_intent_id, starts_at: now(), ends_at: ends });
              const post = T('community_posts').find((p) => p.id === it.post_id);
              if (post) post.boosted_until = ends;
              insertRow('community_transactions', { user_id: me(), kind: 'ad', amount_pence: it.amount, currency: 'GBP', note: 'Promoted post, ' + it.days + ' days', created_by: null, provider: 'stripe', status: 'succeeded', method: 'Visa •••• 4242' });
            }
            if (it?.kind === 'donate') {
              insertRow('community_donations', { fundraiser_id: it.fundraiser_id, donor_id: me(), amount_pence: it.amount, currency: 'GBP', message: it.message, anonymous: it.anonymous, payment_intent_id: body.payment_intent_id, status: 'succeeded' });
            }
            return { status: 'succeeded', settled: true };
          }
          case 'subscribe':
            return { subscription_id: 'sub_demo', client_secret: secret('plus'), intent: 'payment', amount: body.plan === 'yearly' ? 4999 : 499, currency: 'gbp', status: 'incomplete' };
          case 'sync': {
            const until = new Date(Date.now() + 30 * DAY).toISOString();
            const p = T('community_profiles').find((x) => x.id === me());
            if (p) p.plus_until = until;
            const b = billing();
            if (b) Object.assign(b, { status: 'active', current_period_end: until, cancel_at_period_end: false });
            else T('community_billing').push({ user_id: me(), status: 'active', current_period_end: until, cancel_at_period_end: false, plan: 'monthly', updated_at: now() });
            return { ...status(), plus: true };
          }
          case 'cancel':
          case 'resume': {
            const b = billing();
            if (b) b.cancel_at_period_end = body.action === 'cancel';
            return status();
          }
          case 'creator_subscribe':
            return { subscription_id: 'sub_demo_creator', client_secret: secret('creator'), intent: 'payment', amount: T('community_profiles').find((x) => x.id === body.creator_id)?.sub_price_pence ?? 299, currency: 'gbp', status: 'incomplete' };
          case 'creator_sync': {
            const existing = T('community_creator_subs').find((x) => x.creator_id === body.creator_id && x.subscriber_id === me());
            const end = new Date(Date.now() + 30 * DAY).toISOString();
            if (existing) Object.assign(existing, { status: 'active', current_period_end: end, cancel_at_period_end: false });
            else insertRow('community_creator_subs', { creator_id: body.creator_id, subscriber_id: me(), status: 'active', current_period_end: end, cancel_at_period_end: false, amount_pence: 299 });
            return { status: 'active', current_period_end: end, cancel_at_period_end: false };
          }
          case 'creator_cancel': {
            const s = T('community_creator_subs').find((x) => x.creator_id === body.creator_id && x.subscriber_id === me());
            if (s) s.cancel_at_period_end = !body.resume;
            return { status: s?.status ?? 'none', cancel_at_period_end: !!s?.cancel_at_period_end };
          }
          case 'fundraiser_ready':
            return { accepting: true };
          case 'payouts':
            return { has_account: true, charges_enabled: true, payouts_enabled: true, details_submitted: true };
          case 'payouts_onboard':
          case 'payouts_dashboard':
            return { url: 'https://dashboard.stripe.com/test' };
          default:
            throw new Error('Not in the demo: ' + body.action);
        }
      },
    };
  },
};
