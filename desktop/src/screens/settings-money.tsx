// Settings pages about money: Creator subscriptions (your monthly price, your subscribers, and the
// creators you subscribe to) and Ads and payments. Payments themselves go through Stripe, as on the
// iPhone (lib/pay.ts); the ad tools live in the Professional dashboard.
import React, { useState } from 'react';
import { cancelCreatorSubscription, fetchPayouts, mySubscribers, mySubscriptions, myTransactions, openPayoutsDashboard, startCreatorSubscription, startPayoutsOnboarding, syncCreatorSubscriptionUntilOn, updateProfile } from 'shared/api';
import { dayLabel } from 'shared/theme';
import type { CreatorSub, Transaction } from 'shared/types';
import { useMe } from '../lib/me';
import { confirmPay, money } from '../lib/pay';
import { Failed, Spinner, ask, toast, toastError, useLoad } from '../ui/kit';
import { Block, Card, LinkRow, Notice, Page, PersonRow } from './settings-ui';

/** The prices offered as chips, in pence. Anything else between the limits can be typed. */
const PRESETS = [99, 199, 299, 499, 999];
/** The database allows £0.99 to £99.99 a month. */
const MIN_PENCE = 99;
const MAX_PENCE = 9999;

/** "4.50", "£4.5" or "4" as pence, or null when it isn't a price between the limits. */
function parsePounds(text: string): number | null {
  const t = text.replace(/[£\s]/g, '').replace(',', '.');
  if (!/^\d{1,2}(\.\d{0,2})?$/.test(t)) return null;
  const pence = Math.round(parseFloat(t) * 100);
  return pence >= MIN_PENCE && pence <= MAX_PENCE ? pence : null;
}

/** Where one subscription stands, in a few words. */
function standing(s: CreatorSub): string {
  const day = s.current_period_end ? dayLabel(new Date(s.current_period_end)) : '';
  if (s.status === 'past_due') return 'Payment due';
  if (s.cancel_at_period_end) return day ? 'Ends ' + day : 'Ending';
  return day ? 'Renews ' + day : 'Active';
}

const opener = (get: () => Promise<string>) => () =>
  get().then((url) => {
    window.open(url, '_blank', 'noopener');
  }, toastError);

/* ---------- Creator subscriptions ---------- */

export function CreatorSubscriptions() {
  const { me, refresh } = useMe();
  const current = me.sub_price_pence ?? null;
  const restricted = me.restricted === true;
  const [choice, setChoice] = useState<number | 'custom' | null>(null);
  const [custom, setCustom] = useState(current != null && !PRESETS.includes(current) ? (current / 100).toFixed(2) : '');
  const [saving, setSaving] = useState(false);
  const [changing, setChanging] = useState('');
  const subscribers = useLoad(() => mySubscribers(me.id), []);
  const mine = useLoad(() => mySubscriptions(me.id), []);
  const payouts = useLoad(() => fetchPayouts(), []);

  const selected: number | 'custom' | null = choice ?? (current == null ? null : PRESETS.includes(current) ? current : 'custom');
  const chosen = selected === 'custom' ? parsePounds(custom) : selected;
  const customBad = selected === 'custom' && custom.trim() !== '' && chosen == null;
  const canSave = chosen != null && chosen !== current && !saving;

  async function setPrice(pence: number | null) {
    setSaving(true);
    try {
      await updateProfile(me.id, { sub_price_pence: pence });
      await refresh();
      setChoice(null);
      toast(pence == null ? 'Subscriptions are off. Current subscribers keep access until their month ends.' : current == null ? `Subscriptions are on at ${money(pence)} a month` : `Your price is now ${money(pence)} a month`);
    } catch (e) {
      toastError(e);
    } finally {
      setSaving(false);
    }
  }

  /** Stops (or restarts) renewing one of my subscriptions to someone else. */
  async function change(s: CreatorSub) {
    const name = s.profile?.username ?? 'this creator';
    const resume = s.cancel_at_period_end;
    const day = s.current_period_end ? dayLabel(new Date(s.current_period_end)) : '';
    if (!resume && !(await ask(`Cancel your subscription to ${name}?`, day ? `You keep access until ${day}. It won't renew after that.` : "It won't renew after this month.", 'Cancel subscription'))) return;
    setChanging(s.creator_id);
    try {
      await cancelCreatorSubscription(s.creator_id, resume);
      toast(resume ? `Your subscription to ${name} will renew` : day ? `Your subscription to ${name} ends ${day}` : `Your subscription to ${name} will end`);
      mine.reload();
    } catch (e) {
      toastError(e);
    } finally {
      setChanging('');
    }
  }

  /** Pays a renewal that didn't go through, on the same subscription. */
  async function payOverdue(s: CreatorSub) {
    const name = s.profile?.username ?? 'this creator';
    setChanging(s.creator_id);
    try {
      const r = await startCreatorSubscription(s.creator_id);
      if (!r.already && r.client_secret) {
        const amount = r.amount ?? s.amount_pence;
        const paid = await confirmPay({ title: `Pay your subscription to ${name}`, detail: 'Pays the month that is due, then it carries on as before.', amountPence: amount, currency: r.currency ?? 'GBP', clientSecret: r.client_secret, intent: r.intent, action: 'Pay ' + money(amount, r.currency ?? 'GBP') });
        if (!paid) return;
      }
      const on = await syncCreatorSubscriptionUntilOn(s.creator_id, r.already ? r.status ?? null : null);
      toast(on ? `Paid. Your subscription to ${name} carries on.` : 'Payment received. It can take a minute to show.');
      mine.reload();
    } catch (e) {
      toastError(e);
    } finally {
      setChanging('');
    }
  }

  return (
    <Page title="Creator subscriptions" intro="Offer a monthly subscription for posts only your subscribers see, and manage the creators you subscribe to.">
      <Block title="Your price">
        {restricted ? (
          <Notice icon="lock">Members under 14 can't offer subscriptions. You can still see the creators you subscribe to below.</Notice>
        ) : (
          <>
            <p className="st-text">
              {current != null ? (
                <>
                  You offer subscriptions at <b>{money(current)} a month</b>.
                </>
              ) : (
                "You don't offer subscriptions. Choose a price to start."
              )}
            </p>
            <div className="st-chips" role="radiogroup" aria-label="Monthly price">
              {PRESETS.map((p) => (
                <button key={p} role="radio" aria-checked={selected === p} className={'st-chip price' + (selected === p ? ' picked' : '')} onClick={() => setChoice(p)}>
                  {money(p)}
                </button>
              ))}
              <button role="radio" aria-checked={selected === 'custom'} className={'st-chip price' + (selected === 'custom' ? ' picked' : '')} onClick={() => setChoice('custom')}>
                Custom
              </button>
            </div>
            {selected === 'custom' ? (
              <div className="st-price">
                <span>£</span>
                <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="4.50" inputMode="decimal" maxLength={6} aria-label="Monthly price in pounds" className={customBad ? 'bad' : ''} />
                <span>a month</span>
              </div>
            ) : null}
            {selected === 'custom' ? <p className={customBad ? 'field-error' : 'st-note'}>Between {money(MIN_PENCE)} and {money(MAX_PENCE)} a month.</p> : null}
            <div className="st-actions">
              <button className="btn big" disabled={!canSave} onClick={() => chosen != null && setPrice(chosen)}>
                {saving ? 'Saving…' : current == null ? 'Start subscriptions' : 'Save price'}
              </button>
              {current != null ? (
                <button
                  className="btn big quiet danger-text"
                  disabled={saving}
                  onClick={async () => {
                    if (await ask('Turn off subscriptions?', 'Nobody new can subscribe. People who subscribe now keep access until their month ends, then it stops.', 'Turn off')) setPrice(null);
                  }}
                >
                  Turn off
                </button>
              ) : null}
            </div>
          </>
        )}
      </Block>

      {restricted ? null : (
        <Block title="Payouts" note="Subscribers pay into your own payout account with Stripe. Community keeps a small share.">
          {payouts.loading ? (
            <Spinner />
          ) : payouts.error ? (
            <p className="st-empty-line">Payout details didn't load. Payments may not be switched on yet.</p>
          ) : (
            <Card>
              {payouts.data?.charges_enabled ? (
                <LinkRow icon="check" title="Payouts are set up" sub="Open your payout dashboard to see what you've earned and when it's paid." external onClick={opener(openPayoutsDashboard)} />
              ) : (
                <LinkRow icon="card" title={payouts.data?.has_account ? 'Finish setting up payouts' : 'Set up payouts'} sub="Needed before anyone can subscribe to you." external onClick={opener(() => startPayoutsOnboarding())} />
              )}
            </Card>
          )}
        </Block>
      )}

      <Block title={subscribers.data?.length ? `Your subscribers · ${subscribers.data.length}` : 'Your subscribers'}>
        {subscribers.loading ? (
          <Spinner />
        ) : subscribers.error ? (
          <Failed error={subscribers.error} retry={subscribers.reload} />
        ) : !subscribers.data?.length ? (
          <p className="st-empty-line">No subscribers yet.</p>
        ) : (
          <Card className="st-subscribers">
            {subscribers.data.map((s) => (
              <PersonRow key={s.id} p={s.profile ?? null} sub={'Since ' + dayLabel(new Date(s.created_at)) + (s.cancel_at_period_end || s.status === 'past_due' ? ' · ' + standing(s) : '')} right={<span className="st-row-value">{money(s.amount_pence)}/mo</span>} />
            ))}
          </Card>
        )}
      </Block>

      <Block title="Your subscriptions">
        {mine.loading ? (
          <Spinner />
        ) : mine.error ? (
          <Failed error={mine.error} retry={mine.reload} />
        ) : !mine.data?.length ? (
          <p className="st-empty-line">You don't subscribe to anyone. Subscribe from a creator's profile.</p>
        ) : (
          <Card className="st-mine">
            {mine.data.map((s) => (
              <PersonRow
                key={s.id}
                p={s.profile ?? null}
                sub={`${money(s.amount_pence)} a month · ${standing(s)}`}
                right={
                  changing === s.creator_id ? (
                    <Spinner size={20} />
                  ) : s.status === 'past_due' ? (
                    <button className="btn small" disabled={!!changing} onClick={() => payOverdue(s)}>
                      Pay now
                    </button>
                  ) : (
                    <button className="btn quiet small" disabled={!!changing} onClick={() => change(s)}>
                      {s.cancel_at_period_end ? 'Resume' : 'Cancel'}
                    </button>
                  )
                }
              />
            ))}
          </Card>
        )}
      </Block>
    </Page>
  );
}

/* ---------- Ads and payments ---------- */

const KINDS: Record<Transaction['kind'], string> = { plus: 'Community Plus', ad: 'Promoted post', donation: 'Donation', subscription: 'Creator subscription', refund: 'Refund', other: 'Payment' };

export function AdsPayments() {
  const { me } = useMe();
  const history = useLoad(() => myTransactions(me.id), []);
  return (
    <Page title="Ads and payments" intro="Your ads, Community Plus, and every payment you've made.">
      <Block title="Ads">
        <Card>
          <LinkRow icon="ad" title="Your ads" sub="Promote a post, see how your ads are doing and what they cost." to="/dashboard/ads" />
        </Card>
      </Block>
      <Block title="Subscriptions">
        <Card>
          <LinkRow icon="crown" title="Community Plus" value={me.plus ? 'Active' : 'Not subscribed'} to="/plus" />
          <LinkRow icon="users" title="Creator subscriptions" sub="Your price, your subscribers and the creators you subscribe to." to="/accounts/subscriptions" />
        </Card>
      </Block>
      <Block title="Payment history" note="Card payments are handled by Stripe. Community never sees your card number.">
        {history.loading ? (
          <Spinner />
        ) : history.error ? (
          <Failed error={history.error} retry={history.reload} />
        ) : !history.data?.length ? (
          <p className="st-empty-line">No payments yet.</p>
        ) : (
          <Card>
            {history.data.map((t) => (
              <div key={t.id} className="st-row">
                <span className="st-row-text">
                  <b>{KINDS[t.kind] ?? 'Payment'}</b>
                  <span>
                    {dayLabel(new Date(t.created_at))}
                    {t.note ? ' · ' + t.note : ''}
                    {t.status && t.status !== 'succeeded' ? ' · ' + (t.status === 'refunded' ? 'Refunded' : 'Failed') : ''}
                  </span>
                </span>
                <span className="st-row-value">{money(t.amount_pence, t.currency)}</span>
              </div>
            ))}
          </Card>
        )}
      </Block>
    </Page>
  );
}
