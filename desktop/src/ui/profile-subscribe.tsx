// Subscribing to a creator from their profile, the desktop version of the iPhone's /subscribe/[id]:
// who they are, the monthly price and what it gives. Subscribe starts the payment with the payments
// function, the card dialog confirms it (Stripe.js; a sample card in the demo), and the subscription
// is read back from Stripe until it is on. Once subscribed, the same dialog cancels or resumes it.
import React, { useEffect, useState } from 'react';
import { cancelCreatorSubscription, mySubscriptions, startCreatorSubscription, syncCreatorSubscriptionUntilOn } from 'shared/api';
import type { CreatorSub, Profile } from 'shared/types';
import { t, tSplit } from '../lib/i18n';
import { useMe } from '../lib/me';
import { confirmPay, money } from '../lib/pay';
import { Avatar, Icon, type IconName, Modal, Spinner, Verified, ask, toast, toastError } from './kit';
import { shortDay } from './profile-parts';
import '../styles/profile.css';

/** A subscription that still gives access (a failed renewal keeps it for a little while). */
const LIVE = ['active', 'trialing', 'past_due'];

/**
 * Starts (or, for a failed renewal, pays) a subscription to `creator`, then waits until Stripe has it
 * on. Returns true once subscribed.
 */
export async function subscribeTo(creator: Profile, overdue = false): Promise<boolean> {
  const r = await startCreatorSubscription(creator.id);
  let known: string | null = null;
  if (r.already) {
    // Already paid, though Stripe may not have marked it active yet.
    known = r.status ?? null;
  } else {
    if (!r.client_secret) throw new Error(t('d.profile.paymentNotStarted'));
    const amount = r.amount ?? creator.sub_price_pence ?? 0;
    const currency = (r.currency ?? 'GBP').toUpperCase();
    const price = money(amount, currency);
    const paid = await confirmPay({
      title: t(overdue ? 'subscribe.sheetDue' : 'subscribe.sheetFirst', { username: creator.username }),
      detail: t('legal.priceMonthly', { price }) + ' · ' + t('d.profile.renewsAuto'),
      amountPence: amount,
      currency,
      clientSecret: r.client_secret,
      intent: r.intent ?? 'payment',
      action: overdue ? t('subscribe.payNow', { price }) : t('subscribe.button', { price }),
    });
    if (!paid) return false;
  }
  const on = await syncCreatorSubscriptionUntilOn(creator.id, known);
  if (on) toast(overdue ? t('subscribe.paidCarriesOn', { username: creator.username }) : t('subscribe.subscribedTo', { username: creator.username }));
  else toast(t('subscribe.paymentReceived'));
  return on;
}

/** What a subscription gives, as on the iPhone. */
function perks(creator: Profile): { icon: IconName; title: string }[] {
  const first = creator.full_name.trim().split(/\s+/)[0] || creator.username;
  return [
    { icon: 'lock', title: t('subscribe.perkPosts') },
    { icon: 'heart', title: t('subscribe.perkSupport', { name: first }) },
    { icon: 'repeat', title: t('subscribe.perkCancel') },
  ];
}

/** The subscription dialog: subscribe, or see yours and cancel or resume it. */
export function SubscribeDialog({ creator, onClose, onChanged }: { creator: Profile; onClose: () => void; onChanged: () => void }) {
  const { me } = useMe();
  const [sub, setSub] = useState<CreatorSub | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const load = () =>
    mySubscriptions(me.id).then(
      (rows) => setSub(rows.find((s) => s.creator_id === creator.id) ?? null),
      () => setSub(null),
    );
  useEffect(() => {
    load();
  }, [creator.id]);

  const live = !!sub && LIVE.includes(sub.status);
  const subscribed = creator.subscribed || live;
  // A subscriber pays what they signed up at, even if the creator has changed the price since.
  const pence = live && sub ? sub.amount_pence : creator.sub_price_pence ?? 0;
  const price = money(pence, 'GBP');
  const day = sub?.current_period_end ? shortDay(new Date(sub.current_period_end)) : '';
  const overdue = sub?.status === 'past_due';

  const pay = async () => {
    setBusy(true);
    try {
      const on = await subscribeTo(creator, overdue);
      if (on) {
        await load();
        onChanged();
      }
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  const changeRenewal = async () => {
    if (!sub) return;
    const resume = sub.cancel_at_period_end;
    if (!resume && !(await ask(t('subscribe.cancelQuestion'), day ? t('subscribe.cancelBody', { day }) : t('subscribe.cancelBodyPeriod'), t('plus.cancelSubscription')))) return;
    setBusy(true);
    try {
      await cancelCreatorSubscription(creator.id, resume);
      toast(resume ? t('subscribe.willRenew') : day ? t('subscribe.endsOn', { day }) : t('subscribe.willEnd'));
      await load();
      onChanged();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  let status = '';
  if (subscribed) status = overdue ? t('subscribe.pastDue') : sub?.cancel_at_period_end ? t('subscribe.subscribedEnds', { day }) : day ? t('subscribe.subscribedRenews', { day }) : t('subscribe.subscribed');
  // "£4.99 a month", with the price in bold.
  const [priceBefore, priceAfter] = tSplit('legal.priceMonthly', 'price');

  return (
    <Modal title={t('subscribe.title')} onClose={() => !busy && onClose()} className="prof-sub" closeOutside={!busy}>
      <div className="prof-sub-body">
        <div className="prof-sub-top">
          <Avatar src={creator.avatar_url} name={creator.username} size={84} />
          <b className="prof-sub-name">{creator.full_name || creator.username}</b>
          <span className="muted-text">
            @{creator.username}
            {creator.verified ? <Verified size={13} /> : null}
          </span>
          <p className="prof-sub-price">
            {priceBefore}
            <b>{price}</b>
            {priceAfter}
          </p>
        </div>
        {sub === undefined ? (
          <Spinner />
        ) : (
          <>
            {status ? (
              <div className={'prof-sub-status' + (overdue ? ' warn' : '')}>
                <Icon name={overdue ? 'info' : 'check'} size={20} stroke={2.4} />
                <b>{status}</b>
              </div>
            ) : null}
            <h3 className="prof-sub-h">{subscribed ? t('subscribe.givesYou') : t('subscribe.whatYouGet')}</h3>
            <ul className="prof-sub-perks">
              {perks(creator).map((p) => (
                <li key={p.title}>
                  <Icon name={p.icon} size={24} stroke={1.6} />
                  <b>{p.title}</b>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      {sub === undefined ? null : (
        <div className="modal-foot prof-sub-foot">
          {!subscribed || overdue ? (
            <>
              <button className="btn block big" disabled={busy} onClick={pay}>
                {busy ? t('d.profile.confirmingPayment') : overdue ? t('subscribe.payNow', { price }) : t('subscribe.button', { price })}
              </button>
              <p className="muted-text small center">
                <b>{t('legal.priceMonthly', { price })}</b> · {t('d.profile.renewsAuto')}
              </p>
            </>
          ) : sub ? (
            <button className={'btn block big quiet' + (sub.cancel_at_period_end ? '' : ' prof-danger-text')} disabled={busy} onClick={changeRenewal}>
              {sub.cancel_at_period_end ? t('plus.resumeSubscription') : t('plus.cancelSubscription')}
            </button>
          ) : null}
        </div>
      )}
    </Modal>
  );
}
