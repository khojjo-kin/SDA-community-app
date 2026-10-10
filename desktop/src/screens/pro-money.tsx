// Money pieces used across the Professional dashboard: payouts for fundraisers, saved cards, payment
// history, and your fundraisers.
import React, { useEffect, useState } from 'react';
import { fetchPayouts, fetchSavedCards, fetchUserFundraisers, myTransactions, openPayoutsDashboard, removeSavedCard, setDefaultCard, startAddCard, startPayoutsOnboarding } from 'shared/api';
import type { Fundraiser, PayoutStatus, SavedCard, Transaction } from 'shared/types';
import { useMe } from '../lib/me';
import { money, paymentsConfig } from '../lib/pay';
import { ChoiceMenu, Empty, Failed, Icon, type IconName, Link, Spinner, ask, toast, toastError, useLoad } from '../ui/kit';
import { CardChip, cardTitle, expiryLabel, GiftIcon, hasEnded, isExpired, openExternal, pay, ProgressBar, progressOf, shortDay } from './pro-kit';

/* ---------- payouts ---------- */

/** Where a payout account can be set up. Stripe fixes an account's country when it is made. */
const COUNTRIES: { code: string; name: string }[] = [
  { code: 'GB', name: 'United Kingdom' }, { code: 'IE', name: 'Ireland' }, { code: 'US', name: 'United States' }, { code: 'CA', name: 'Canada' },
  { code: 'AU', name: 'Australia' }, { code: 'NZ', name: 'New Zealand' }, { code: 'DE', name: 'Germany' }, { code: 'FR', name: 'France' },
  { code: 'NL', name: 'Netherlands' }, { code: 'BE', name: 'Belgium' }, { code: 'ES', name: 'Spain' }, { code: 'IT', name: 'Italy' },
  { code: 'PT', name: 'Portugal' }, { code: 'SE', name: 'Sweden' }, { code: 'NO', name: 'Norway' }, { code: 'DK', name: 'Denmark' },
  { code: 'FI', name: 'Finland' }, { code: 'CH', name: 'Switzerland' }, { code: 'AT', name: 'Austria' }, { code: 'PL', name: 'Poland' },
];

/** The computer's own region ("en-GB" gives GB) when payouts can be set up there, else the United Kingdom. */
function localCountry(): string {
  try {
    const region = new Intl.Locale(navigator.language).maximize().region ?? '';
    return COUNTRIES.some((c) => c.code === region) ? region : 'GB';
  } catch {
    return 'GB';
  }
}

/** The four states a payout account can be in, in plain words. */
export function payoutWords(s: PayoutStatus): { title: string; icon: IconName; ready: boolean } {
  if (!s.has_account) return { title: 'Not set up', icon: 'card', ready: false };
  if (!s.charges_enabled) return { title: 'Details needed', icon: 'info', ready: false };
  if (!s.payouts_enabled) return { title: 'Ready to receive donations', icon: 'check', ready: true };
  return { title: 'Payouts enabled', icon: 'check', ready: true };
}

/**
 * Payouts for fundraisers: each member who runs one has their own Stripe account, and gifts go
 * straight there and on to their bank. Setting it up, or its dashboard, opens Stripe in the browser.
 */
export function PayoutBox({ onChange, compact }: { onChange?: (s: PayoutStatus) => void; compact?: boolean }) {
  const st = useLoad<PayoutStatus | null>(() => paymentsConfig().then((c) => (c.ready ? fetchPayouts() : null)), []);
  const [busy, setBusy] = useState<'' | 'setup' | 'dashboard'>('');
  const [country, setCountry] = useState(localCountry);
  // Coming back from Stripe's form in the browser: show where things stand now.
  useEffect(() => {
    const back = () => st.reload();
    window.addEventListener('focus', back);
    return () => window.removeEventListener('focus', back);
  }, []);
  useEffect(() => {
    if (st.data) onChange?.(st.data);
  }, [st.data]);

  const setup = async () => {
    setBusy('setup');
    try {
      openExternal(await startPayoutsOnboarding(st.data?.has_account ? undefined : country));
      st.reload();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy('');
    }
  };
  const dashboard = async () => {
    setBusy('dashboard');
    try {
      openExternal(await openPayoutsDashboard());
    } catch (e) {
      toastError(e);
    } finally {
      setBusy('');
    }
  };

  if (st.error && !st.data) return <p className="muted-text small">Payouts didn't load. <button className="link-btn small" onClick={st.reload}>Try again</button></p>;
  if (st.data === undefined) return <Spinner size={22} />;
  if (st.data === null) return <p className="muted-text">Payments aren't available yet.</p>;
  const s = st.data;
  const w = payoutWords(s);
  const finished = s.charges_enabled && s.payouts_enabled;
  return (
    <div className={'pro-payouts' + (compact ? ' compact' : '')}>
      <div className="pro-payout-status">
        <span className={'pro-round' + (w.ready ? ' ok' : '')}>
          <Icon name={w.icon} size={20} stroke={2.2} />
        </span>
        <div className="grow">
          <span className="pro-eyebrow">Status</span>
          <b className={w.ready ? 'pro-ok-text' : ''}>{w.title}</b>
        </div>
      </div>
      {s.has_account ? null : (
        <label className="pro-select-row">
          <span>Where you and your bank are</span>
          <select value={country} onChange={(e) => setCountry(e.target.value)} disabled={!!busy} aria-label="Country">
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="pro-btns">
        {!finished ? (
          <button className="btn" disabled={!!busy} onClick={setup}>
            {busy === 'setup' ? 'Opening Stripe…' : s.has_account ? 'Continue setup' : 'Set up payouts'}
          </button>
        ) : null}
        {s.has_account && s.details_submitted ? (
          <button className="btn quiet" disabled={!!busy} onClick={dashboard}>
            {busy === 'dashboard' ? 'Opening…' : 'Open payouts dashboard'}
          </button>
        ) : null}
      </div>
      {compact ? null : <p className="muted-text small">Gifts go straight to your own Stripe account and on to your bank. Community takes no fee.</p>}
    </div>
  );
}

/* ---------- saved cards ---------- */

/** The cards saved to your account: the one Plus renews with, and any others. Add, make default, remove. */
export function SavedCards({ compact }: { compact?: boolean }) {
  const list = useLoad<SavedCard[] | null>(() => paymentsConfig().then((c) => (c.ready ? fetchSavedCards() : null)), []);
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState<SavedCard | null>(null);

  const add = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const secret = await startAddCard();
      const ok = await pay({ title: 'Add a card', detail: 'Saved to your account for ads, gifts and Plus. Nothing is charged now.', amountPence: 0, currency: 'GBP', clientSecret: secret, intent: 'setup', action: 'Save card' });
      if (ok) {
        list.set(await fetchSavedCards());
        toast('Card saved');
      }
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  const makeDefault = async (c: SavedCard) => {
    try {
      list.set(await setDefaultCard(c.id));
      toast('Plus will renew with this card');
    } catch (e) {
      toastError(e);
    }
  };
  const remove = async (c: SavedCard) => {
    const sure = await ask('Remove this card?', `${cardTitle(c)} will be removed from your account.${c.is_default ? ' Plus renews with this card, so add another before your next renewal.' : ''}`, 'Remove');
    if (!sure) return;
    try {
      list.set(await removeSavedCard(c.id));
      toast('Card removed');
    } catch (e) {
      toastError(e);
    }
  };

  if (list.error && !list.data) return <Failed error={list.error} retry={list.reload} />;
  if (list.data === undefined) return <Spinner size={22} />;
  if (list.data === null) return <p className="muted-text">Payments aren't available yet.</p>;
  return (
    <div className={'pro-cards' + (compact ? ' compact' : '')}>
      {list.data.length ? (
        <ul className="pro-card-list" aria-label="Saved cards">
          {list.data.map((c) => {
            const expired = isExpired(c.exp_month, c.exp_year);
            return (
              <li key={c.id} className="pro-card-row">
                <CardChip brand={c.brand} />
                <div className="grow">
                  <b>{cardTitle(c)}</b>
                  <span className={expired ? 'pro-bad-text' : ''}>
                    {expired ? 'Expired' : 'Expires'} {expiryLabel(c.exp_month, c.exp_year)}
                  </span>
                </div>
                {c.is_default ? <span className="pro-tag ok">Default</span> : null}
                <button className="icon-btn" aria-label={'Options for ' + cardTitle(c)} onClick={() => setMenu(c)}>
                  <Icon name="more" size={20} />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="muted-text">No saved cards. Cards you pay with are kept here for next time.</p>
      )}
      <button className={compact ? 'link-btn' : 'btn quiet'} disabled={busy} onClick={add}>
        {busy ? 'Adding…' : 'Add card'}
      </button>
      {menu ? (
        <ChoiceMenu
          onClose={() => setMenu(null)}
          items={[
            ...(menu.is_default ? [] : [{ label: 'Make default', bold: true, onClick: () => makeDefault(menu) }]),
            { label: 'Remove card', danger: true, onClick: () => remove(menu) },
          ]}
        />
      ) : null}
    </div>
  );
}

/* ---------- payment history ---------- */

const KIND_LABEL: Record<Transaction['kind'], string> = { plus: 'Community Plus', refund: 'Refund', donation: 'Donation', other: 'Payment', ad: 'Ad', subscription: 'Subscription' };

/** Everything you have paid (and had back), from Stripe and from admins, newest first. */
export function PaymentHistory({ limit }: { limit?: number }) {
  const { me } = useMe();
  const list = useLoad(() => myTransactions(me.id), [me.id]);
  if (list.error && !list.data) return <Failed error={list.error} retry={list.reload} />;
  if (!list.data) return <Spinner size={22} />;
  const rows = limit ? list.data.slice(0, limit) : list.data;
  if (!rows.length) return <Empty icon="receipt" title="No payments yet" body="Ads, gifts and Plus you pay for will be listed here." />;
  return (
    <div className="table-wrap">
      <table className="table pro-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>What</th>
            <th>Paid with</th>
            <th>Status</th>
            <th className="num">Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => {
            const refund = t.kind === 'refund' || t.amount_pence < 0;
            const amount = refund ? -Math.abs(t.amount_pence) : t.amount_pence;
            // "Ad · 7 days" under "Ad" reads twice: keep what follows the kind.
            const note = t.note.replace(/^(Ad|Donation|Community Plus|Subscription)\s*·\s*/, '');
            const detail = note ? note.charAt(0).toUpperCase() + note.slice(1) : '';
            return (
              <tr key={t.id} className="pro-static">
                <td className="pro-nowrap">{shortDay(t.created_at)}</td>
                <td>
                  <b className="pro-cell-title">{KIND_LABEL[t.kind] ?? 'Payment'}</b>
                  {detail ? <span className="muted-text block small">{detail}</span> : null}
                </td>
                <td className="muted-text">{t.method || 'Arranged by an admin'}</td>
                <td>
                  <span className={'pro-tag ' + (t.status === 'succeeded' ? 'ok' : t.status === 'failed' ? 'bad' : '')}>{t.status === 'succeeded' ? 'Paid' : t.status === 'refunded' ? 'Refunded' : 'Failed'}</span>
                </td>
                <td className="num">{money(amount, t.currency)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- your fundraisers ---------- */

/** One fundraiser as a card: title, running or ended, progress and the total. */
export function FundraiserRow({ f }: { f: Fundraiser }) {
  const ended = hasEnded(f);
  return (
    <Link to={'/fundraisers/' + f.id} className="pro-fund-row">
      <span className="pro-fund-thumb">{f.cover_url ? <img src={f.cover_url} alt="" /> : <GiftIcon size={24} />}</span>
      <span className="grow pro-fund-body">
        <span className="pro-fund-top">
          <b>{f.title}</b>
          <span className={'pro-tag ' + (ended ? '' : 'ok')}>{ended ? 'Ended' : 'Running'}</span>
        </span>
        <ProgressBar value={progressOf(f)} height={5} />
        <span className="muted-text small">
          <b className="pro-fg">{money(f.raised_pence, f.currency)}</b> raised of {money(f.goal_pence, f.currency)} · {f.donor_count === 1 ? '1 supporter' : `${f.donor_count} supporters`}
        </span>
      </span>
      <Icon name="right" size={18} />
    </Link>
  );
}

/** The Fundraisers tab: your fundraisers, a way to start one, and payouts. */
export function FundraisersTab() {
  const { me } = useMe();
  const list = useLoad(() => fetchUserFundraisers(me.id), [me.id]);
  const restricted = me.restricted === true;
  return (
    <div className="pro-split">
      <section className="pro-main">
        <div className="pro-section-head">
          <div>
            <h2>Your fundraisers</h2>
            <p className="muted-text">Raise money for your church, ministry or a cause. Gifts go straight to you.</p>
          </div>
          {restricted ? null : (
            <Link to="/fundraisers/new" className="btn">
              <Icon name="plus" size={16} stroke={2.4} /> Start a fundraiser
            </Link>
          )}
        </div>
        {list.error && !list.data ? (
          <Failed error={list.error} retry={list.reload} />
        ) : !list.data ? (
          <Spinner />
        ) : list.data.length ? (
          <div className="pro-fund-list">
            {list.data.map((f) => (
              <FundraiserRow key={f.id} f={f} />
            ))}
          </div>
        ) : (
          <div className="pro-empty">
            <span className="pro-empty-ring">
              <GiftIcon size={30} />
            </span>
            <h3>{restricted ? 'Fundraisers are for members 14 and over' : 'No fundraisers yet'}</h3>
            <p>{restricted ? 'You can still give to other people’s fundraisers.' : 'Fundraisers you start will appear here.'}</p>
          </div>
        )}
      </section>
      <aside className="pro-aside">
        <h3 className="pro-aside-h">Payouts</h3>
        <PayoutBox />
      </aside>
    </div>
  );
}
