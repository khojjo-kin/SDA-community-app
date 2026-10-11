// Settings → Creator subscriptions: your monthly price, your subscribers, and the creators you
// subscribe to. Payments themselves go through Stripe, as on the iPhone (lib/pay.ts). Settings →
// Payments (settings-payments.tsx) uses the helpers here for the creators you subscribe to as well.
import React, { useState } from 'react';
import { cancelCreatorSubscription, fetchPayouts, mySubscribers, mySubscriptions, openPayoutsDashboard, startCreatorSubscription, startPayoutsOnboarding, syncCreatorSubscriptionUntilOn, updateProfile } from 'shared/api';
import { dayLabel } from 'shared/theme';
import type { CreatorSub } from 'shared/types';
import { dateLocale, languageCode, t, tSplit } from '../lib/i18n';
import { useMe } from '../lib/me';
import { confirmPay, money } from '../lib/pay';
import { Failed, Spinner, ask, toast, toastError, useLoad } from '../ui/kit';
import { RowsSkeleton } from '../ui/skeleton';
import { Block, Card, LinkRow, Page, PersonRow } from './settings-ui';

/** The prices offered as chips, in pence. Anything else between the limits can be typed. */
const PRESETS = [99, 199, 299, 499, 999];
/** The database allows £0.99 to £99.99 a month. */
const MIN_PENCE = 99;
const MAX_PENCE = 9999;

/** "4.50", "£4.5" or "4" as pence, or null when it isn't a price between the limits. */
function parsePounds(text: string): number | null {
  const typed = text.replace(/[£\s]/g, '').replace(',', '.');
  if (!/^\d{1,2}(\.\d{0,2})?$/.test(typed)) return null;
  const pence = Math.round(parseFloat(typed) * 100);
  return pence >= MIN_PENCE && pence <= MAX_PENCE ? pence : null;
}

/** "9 Sep" in English (shared/theme's dayLabel), and the same short date in the app's language. */
export function shortDay(iso: string): string {
  const d = new Date(iso);
  return languageCode() === 'en' ? dayLabel(d) : d.toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' });
}

/** Where one subscription stands, in a few words. */
export function standing(s: CreatorSub): string {
  const day = s.current_period_end ? shortDay(s.current_period_end) : '';
  if (s.status === 'past_due') return t('creatorSubs.paymentDue');
  if (s.cancel_at_period_end) return day ? t('creatorSubs.ends', { day }) : t('creatorSubs.ending');
  return day ? t('creatorSubs.renews', { day }) : t('creatorSubs.active');
}

const opener = (get: () => Promise<string>) => () =>
  get().then((url) => {
    window.open(url, '_blank', 'noopener');
  }, toastError);

/* ---------- the creators you subscribe to ---------- */

/** Stops (or restarts) renewing my subscription to a creator, asking first before it stops. True once changed. */
export async function toggleCreatorRenewal(s: CreatorSub): Promise<boolean> {
  const name = s.profile?.username ?? t('creatorSubs.thisCreator');
  const resume = s.cancel_at_period_end;
  const day = s.current_period_end ? shortDay(s.current_period_end) : '';
  if (!resume && !(await ask(t('creatorSubs.cancelQuestion', { username: name }), day ? t('d.settings-more.cancelBodyDay', { day }) : t('d.settings-more.cancelBodyMonth'), t('plus.cancelSubscription')))) return false;
  try {
    await cancelCreatorSubscription(s.creator_id, resume);
    toast(resume ? t('creatorSubs.willRenew', { username: name }) : day ? t('d.settings-more.subEnds', { name, day }) : t('creatorSubs.willEnd', { username: name }));
    return true;
  } catch (e) {
    toastError(e);
    return false;
  }
}

/** Pays a renewal that didn't go through, on the same subscription. True once paid. */
export async function payCreatorOverdue(s: CreatorSub): Promise<boolean> {
  const name = s.profile?.username ?? t('creatorSubs.thisCreator');
  try {
    const r = await startCreatorSubscription(s.creator_id);
    if (!r.already && r.client_secret) {
      const amount = r.amount ?? s.amount_pence;
      const paid = await confirmPay({ title: t('d.settings-more.payTitle', { name }), detail: t('d.settings-more.payDetail'), amountPence: amount, currency: r.currency ?? 'GBP', clientSecret: r.client_secret, intent: r.intent, action: t('d.settings-more.payAction', { amount: money(amount, r.currency ?? 'GBP') }) });
      if (!paid) return false;
    }
    const on = await syncCreatorSubscriptionUntilOn(s.creator_id, r.already ? r.status ?? null : null);
    toast(on ? t('d.settings-more.paidCarriesOn', { name }) : t('d.settings-more.paymentReceived'));
    return true;
  } catch (e) {
    toastError(e);
    return false;
  }
}

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
  // "You offer subscriptions at £4.99 a month.", with the price in bold.
  const offer = tSplit('creatorSubs.youOffer', 'cost');

  async function setPrice(pence: number | null) {
    setSaving(true);
    try {
      await updateProfile(me.id, { sub_price_pence: pence });
      await refresh();
      setChoice(null);
      toast(pence == null ? t('d.settings-more.subsOffToast') : current == null ? t('creatorSubs.nowOn', { price: money(pence) }) : t('creatorSubs.priceNow', { price: money(pence) }));
    } catch (e) {
      toastError(e);
    } finally {
      setSaving(false);
    }
  }

  /** Stops (or restarts) renewing one of my subscriptions, or pays one whose renewal didn't go through. */
  async function change(s: CreatorSub, pay: boolean) {
    setChanging(s.creator_id);
    try {
      if (await (pay ? payCreatorOverdue(s) : toggleCreatorRenewal(s))) mine.reload();
    } finally {
      setChanging('');
    }
  }

  return (
    <Page title={t('d.settings-more.creatorSubs')}>
      {/* Members under 14 can't offer subscriptions: no price to set, only the creators they subscribe to. */}
      {restricted ? null : (
        <Block title={t('creatorSubs.yourPrice')}>
          {current != null ? (
            <p className="st-text">
              {offer[0]}
              <b>{t('plus.perMonth', { price: money(current) })}</b>
              {offer[1]}
            </p>
          ) : null}
          <div className="st-chips" role="radiogroup" aria-label={t('d.settings-more.monthlyPrice')}>
            {PRESETS.map((p) => (
              <button key={p} role="radio" aria-checked={selected === p} className={'st-chip price' + (selected === p ? ' picked' : '')} onClick={() => setChoice(p)}>
                {money(p)}
              </button>
            ))}
            <button role="radio" aria-checked={selected === 'custom'} className={'st-chip price' + (selected === 'custom' ? ' picked' : '')} onClick={() => setChoice('custom')}>
              {t('creatorSubs.custom')}
            </button>
          </div>
          {selected === 'custom' ? (
            <div className="st-price">
              <span>£</span>
              <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="4.50" inputMode="decimal" maxLength={6} aria-label={t('creatorSubs.priceLabel')} className={customBad ? 'bad' : ''} />
              <span>{t('plus.aMonth')}</span>
            </div>
          ) : null}
          {selected === 'custom' ? <p className={customBad ? 'field-error' : 'st-note'}>{t('creatorSubs.between', { min: money(MIN_PENCE), max: money(MAX_PENCE) })}</p> : null}
          <div className="st-actions">
            <button className="btn big" disabled={!canSave} onClick={() => chosen != null && setPrice(chosen)}>
              {saving ? t('d.settings-more.saving') : current == null ? t('d.settings-more.startSubs') : t('creatorSubs.save')}
            </button>
            {current != null ? (
              <button
                className="btn big quiet danger-text"
                disabled={saving}
                onClick={async () => {
                  if (await ask(t('creatorSubs.turnOffQuestion'), t('d.settings-more.turnOffBody'), t('creatorSubs.turnOffConfirm'))) setPrice(null);
                }}
              >
                {t('creatorSubs.turnOffConfirm')}
              </button>
            ) : null}
          </div>
        </Block>
      )}

      {restricted ? null : (
        <Block title={t('creatorSubs.payouts')}>
          {payouts.loading ? (
            <RowsSkeleton count={1} avatar={24} />
          ) : payouts.error ? (
            <p className="st-empty-line">{t('d.settings-more.payoutsFailed')}</p>
          ) : (
            <Card>
              {payouts.data?.charges_enabled ? (
                <LinkRow icon="check" title={t('d.settings-more.payoutsReady')} external onClick={opener(openPayoutsDashboard)} />
              ) : (
                <LinkRow icon="card" title={payouts.data?.has_account ? t('creatorSubs.finishPayouts') : t('creatorSubs.setUpPayouts')} external onClick={opener(() => startPayoutsOnboarding())} />
              )}
            </Card>
          )}
        </Block>
      )}

      <Block title={subscribers.data?.length ? t('creatorSubs.subscribersCount', { count: subscribers.data.length }) : t('creatorSubs.subscribers')}>
        {subscribers.loading ? (
          <RowsSkeleton count={2} right />
        ) : subscribers.error ? (
          <Failed error={subscribers.error} retry={subscribers.reload} />
        ) : !subscribers.data?.length ? (
          <p className="st-empty-line">{t('creatorSubs.noSubscribersYet')}</p>
        ) : (
          <Card className="st-subscribers">
            {subscribers.data.map((s) => (
              <PersonRow key={s.id} p={s.profile ?? null} sub={t('creatorSubs.since', { day: shortDay(s.created_at) }) + (s.cancel_at_period_end || s.status === 'past_due' ? ' · ' + standing(s) : '')} right={<span className="st-row-value">{t('creatorSubs.perMo', { price: money(s.amount_pence) })}</span>} />
            ))}
          </Card>
        )}
      </Block>

      <Block title={t('subscribe.yourSubscriptions')}>
        {mine.loading ? (
          <RowsSkeleton count={2} right />
        ) : mine.error ? (
          <Failed error={mine.error} retry={mine.reload} />
        ) : !mine.data?.length ? (
          <p className="st-empty-line">{t('creatorSubs.noneMineYet')}</p>
        ) : (
          <Card className="st-mine">
            {mine.data.map((s) => (
              <PersonRow
                key={s.id}
                p={s.profile ?? null}
                sub={t('plus.perMonth', { price: money(s.amount_pence) }) + ' · ' + standing(s)}
                right={
                  changing === s.creator_id ? (
                    <Spinner size={20} />
                  ) : s.status === 'past_due' ? (
                    <button className="btn small" disabled={!!changing} onClick={() => change(s, true)}>
                      {t('plus.payNow')}
                    </button>
                  ) : (
                    <button className="btn quiet small" disabled={!!changing} onClick={() => change(s, false)}>
                      {s.cancel_at_period_end ? t('plus.resume') : t('common.cancel')}
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
