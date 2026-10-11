// Settings → Payments, as on the iPhone (app/(app)/payments.tsx): the cards saved for paying (add
// one, make one the default, remove one), Community Plus and the creators you subscribe to (renew,
// cancel or pay what is due), and every transaction, newest first by month, each opening its details.
// Cards are typed into Stripe's own form (the pay dialog, lib/pay.ts); the app never sees the number.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { cancelSubscription, fetchSavedCards, mySubscriptions, myTransactions, removeSavedCard, resumeSubscription, setDefaultCard, startAddCard } from 'shared/api';
import { errText } from 'shared/theme';
import type { BillingStatus, CreatorSub, PaymentsConfig, SavedCard, Transaction } from 'shared/types';
import { dateLocale, t } from '../lib/i18n';
import { useMe } from '../lib/me';
import { money, paymentsConfig } from '../lib/pay';
import { Avatar, ChoiceMenu, Icon, type IconName, Link, Modal, Spinner, Verified, ask, toast, toastError, useLoad } from '../ui/kit';
import { RowsSkeleton } from '../ui/skeleton';
import { CardChip, GiftIcon, cardTitle, copyText, expiryLabel, isExpired, longDay, pay } from './pro-kit';
import { payCreatorOverdue, shortDay, standing, toggleCreatorRenewal } from './settings-money';
import { Block, Card, Page } from './settings-ui';
import '../styles/polish.css';

/** Payments read at a time; reaching the end of the list reads the next lot. */
const PAGE = 30;
/** Plus subscriptions that still renew (or are trying to), and so can be cancelled. */
const RENEWING = ['active', 'trialing', 'past_due', 'unpaid'];

export function Payments() {
  return (
    <Page title={t('payments.title')}>
      <SavedCards />
      <Subscriptions />
      <Transactions />
    </Page>
  );
}

/* ---------- saved cards ---------- */

function SavedCards() {
  // null cards: payments aren't switched on yet.
  const list = useLoad<SavedCard[] | null>(() => paymentsConfig(true).then((c) => (c.ready ? fetchSavedCards() : null)), []);
  const [adding, setAdding] = useState(false);
  const [menu, setMenu] = useState<SavedCard | null>(null);
  // A card being changed (made the default or removed), so it can't be changed twice at once.
  const [working, setWorking] = useState('');

  const add = async () => {
    if (adding) return;
    setAdding(true);
    try {
      const secret = await startAddCard();
      if (await pay({ title: t('payments.addACard'), amountPence: 0, currency: 'GBP', clientSecret: secret, intent: 'setup', action: t('checkout.saveCard') })) {
        list.set(await fetchSavedCards());
        toast(t('payments.cardSaved'));
      }
    } catch (e) {
      toastError(e);
    } finally {
      setAdding(false);
    }
  };

  const makeDefault = async (c: SavedCard) => {
    setWorking(c.id);
    try {
      list.set(await setDefaultCard(c.id));
      toast(t('payments.defaultSet'));
    } catch (e) {
      toastError(e);
    } finally {
      setWorking('');
    }
  };

  const remove = async (c: SavedCard) => {
    if (!(await ask(t('payments.removeQuestion'), t(c.is_default ? 'payments.removeBodyDefault' : 'payments.removeBody', { card: cardTitle(c) }), t('payments.remove')))) return;
    setWorking(c.id);
    try {
      list.set(await removeSavedCard(c.id));
      toast(t('payments.cardRemoved'));
    } catch (e) {
      toastError(e);
    } finally {
      setWorking('');
    }
  };

  let body: React.ReactNode;
  if (list.data === undefined && !list.error) body = <RowsSkeleton count={2} avatar={42} square />;
  else if (list.error && !list.data) body = <Retry error={list.error} retry={list.reload} />;
  else if (list.data === null) body = <p className="st-empty-line">{t('pay.unavailable')}</p>;
  else
    body = (
      <Card className="po-cards">
        {list.data!.map((c) => {
          const exp = expiryLabel(c.exp_month, c.exp_year);
          const expired = isExpired(c.exp_month, c.exp_year);
          return (
            <button key={c.id} type="button" className="st-row st-link po-card" disabled={working === c.id} onClick={() => setMenu(c)} aria-haspopup="dialog" aria-label={cardTitle(c) + (exp ? ', ' + t(expired ? 'checkout.expired' : 'checkout.expires', { date: exp }) : '') + (c.is_default ? ', ' + t('checkout.defaultCard') : '')}>
              <span className="po-lead">
                <CardChip brand={c.brand} />
              </span>
              <span className="st-row-text">
                <b>{cardTitle(c)}</b>
                {exp ? <span className={expired ? 'po-bad' : ''}>{t(expired ? 'checkout.expired' : 'checkout.expires', { date: exp })}</span> : null}
              </span>
              {working === c.id ? <Spinner size={18} /> : c.is_default ? <span className="po-default">{t('checkout.default')}</span> : null}
              <span className="st-row-go">
                <Icon name="more" size={20} />
              </span>
            </button>
          );
        })}
        <button type="button" className="st-row st-link po-add" disabled={adding} onClick={add}>
          <span className="po-lead">
            <Icon name="plus" size={22} stroke={2.2} />
          </span>
          <b>{t('payments.addCard')}</b>
          {adding ? <Spinner size={18} /> : null}
        </button>
      </Card>
    );

  return (
    <Block title={t('payments.cards')}>
      {body}
      {menu ? (
        <ChoiceMenu
          onClose={() => setMenu(null)}
          items={[
            ...(menu.is_default ? [] : [{ label: t('payments.makeDefault'), bold: true, onClick: () => makeDefault(menu) }]),
            { label: t('payments.removeCard'), danger: true, onClick: () => remove(menu) },
          ]}
        />
      ) : null}
    </Block>
  );
}

/* ---------- subscriptions ---------- */

/** Community Plus in one line: the plan and when it renews or ends, or that there is none. */
function plusLine(b: BillingStatus | null, plus: boolean, plusUntil: string | null | undefined): { text: string; bad?: boolean } {
  if (b && (RENEWING.includes(b.status) || b.status === 'incomplete')) {
    const plan = b.plan === 'yearly' ? t('plus.yearly') : t('plus.monthly');
    const day = b.current_period_end ? shortDay(b.current_period_end) : '';
    if (b.status === 'past_due' || b.status === 'unpaid') return { text: `${plan} · ${t('payments.paymentFailed')}`, bad: true };
    if (b.status === 'incomplete') return { text: t('plus.statusIncomplete'), bad: true };
    if (b.cancel_at_period_end) return { text: `${plan} · ${day ? t('creatorSubs.ends', { day }) : t('creatorSubs.ending')}` };
    if (b.status === 'trialing') return { text: day ? t('plus.statusTrialEndsOn', { day }) : t('plus.statusTrial') };
    return { text: `${plan} · ${day ? t('creatorSubs.renews', { day }) : b.plan === 'yearly' ? t('plus.statusRenewsYearly') : t('plus.statusRenewsMonthly')}` };
  }
  // Plus given by an admin or a church has no subscription behind it.
  if (plus) return { text: plusUntil ? t('payments.activeUntil', { day: shortDay(plusUntil) }) : t('settings.plusActive') };
  return { text: t('payments.notSubscribed') };
}

function Subscriptions() {
  const { me, refresh } = useMe();
  // The payments function's answer carries the Plus subscription; null while payments are off.
  const config = useLoad<PaymentsConfig | null>(() => paymentsConfig().then((c) => (c.ready ? c : null)), []);
  const subs = useLoad<CreatorSub[]>(() => mySubscriptions(me.id), [me.id]);
  // Cancelling or resuming Plus hands back the subscription as it now stands.
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [busy, setBusy] = useState('');
  useEffect(() => setBilling(config.data ?? null), [config.data]);

  const known = config.data !== undefined || !!config.error;
  const plus = plusLine(billing, !!me.plus, me.plus_until);
  const renewing = !!billing && RENEWING.includes(billing.status);
  const due = !!billing && ['past_due', 'unpaid', 'incomplete'].includes(billing.status);

  /** Cancels Plus at the end of the period, or takes that back, with the same words as the Plus page. */
  const changePlus = async () => {
    if (!billing || busy) return;
    const c = config.data!;
    const resume = billing.cancel_at_period_end;
    const day = longDay(billing.current_period_end);
    const price = t(billing.plan === 'yearly' ? 'plus.perYear' : 'plus.perMonth', { price: money(billing.plan === 'yearly' ? c.yearly_pence : c.price_pence, c.currency) });
    const trialling = billing.status === 'trialing';
    const sure = resume
      ? await ask(t('plus.resumeQuestion'), day ? t('plus.willRenewOn', { day, price }) : t('plus.willRenew', { price }), t('plus.resume'), false)
      : await ask(t('plus.cancelQuestion'), trialling ? (day ? t('plus.trialCancelUntil', { day }) : t('plus.trialCancel')) : day ? t('plus.cancelUntil', { day }) : t('plus.cancelPeriod'), t('plus.cancelSubscription'));
    if (!sure) return;
    setBusy('plus');
    try {
      setBilling(await (resume ? resumeSubscription() : cancelSubscription()));
      toast(resume ? t('plus.renewsAsNormal') : day ? t('plus.willEndOn', { day }) : t('plus.willEndPeriod'));
      refresh().catch(() => {});
    } catch (e) {
      toastError(e);
    } finally {
      setBusy('');
    }
  };

  const changeCreator = async (s: CreatorSub, payDue: boolean) => {
    if (busy) return;
    setBusy(s.creator_id);
    try {
      if (await (payDue ? payCreatorOverdue(s) : toggleCreatorRenewal(s))) subs.reload();
    } finally {
      setBusy('');
    }
  };

  let plusAction: React.ReactNode = null;
  if (busy === 'plus') plusAction = <Spinner size={18} />;
  else if (due)
    plusAction = (
      <Link to="/plus" className="btn small">
        {t('plus.payNow')}
      </Link>
    );
  else if (renewing)
    plusAction = (
      <button type="button" className="btn small quiet" disabled={!!busy} onClick={changePlus}>
        {billing!.cancel_at_period_end ? t('plus.resume') : t('common.cancel')}
      </button>
    );

  return (
    <Block title={t('settings.subscriptions')}>
      <Card className="po-subs">
        <div className="st-row po-sub">
          <Link to="/plus" className="po-sub-open" title={t('common.communityPlus')}>
            <span className="po-lead">
              <span className="po-round plus">
                <Icon name="crown" size={20} />
              </span>
            </span>
            <span className="st-row-text">
              <b>{t('common.communityPlus')}</b>
              {known ? <span className={plus.bad ? 'po-bad' : ''}>{plus.text}</span> : <span className="po-wait" />}
            </span>
          </Link>
          {plusAction}
        </div>
        {subs.data === undefined && !subs.error ? (
          <div className="po-rows-wait">
            <RowsSkeleton count={1} avatar={42} right />
          </div>
        ) : null}
        {(subs.data ?? []).map((s) => (
          <div key={s.id} className="st-row po-sub">
            <Link to={s.profile ? '/u/' + s.profile.username : '/accounts/subscriptions'} className="po-sub-open">
              <span className="po-lead">
                <Avatar src={s.profile?.avatar_url} name={s.profile?.username ?? '?'} size={42} />
              </span>
              <span className="st-row-text">
                <b className="po-name">
                  {s.profile?.username ?? t('creatorSubs.accountUnavailable')}
                  {s.profile?.verified ? <Verified size={12} /> : null}
                </b>
                <span className={s.status === 'past_due' ? 'po-bad' : ''}>{t('plus.perMonth', { price: money(s.amount_pence) }) + ' · ' + standing(s)}</span>
              </span>
            </Link>
            {busy === s.creator_id ? (
              <Spinner size={18} />
            ) : s.status === 'past_due' ? (
              <button type="button" className="btn small" disabled={!!busy} onClick={() => changeCreator(s, true)}>
                {t('plus.payNow')}
              </button>
            ) : (
              <button type="button" className="btn small quiet" disabled={!!busy} onClick={() => changeCreator(s, false)}>
                {s.cancel_at_period_end ? t('plus.resume') : t('common.cancel')}
              </button>
            )}
          </div>
        ))}
        <Link to="/accounts/subscriptions" className="st-row st-link po-sub-all">
          <span className="po-lead">
            <span className="po-round">
              <Icon name="users" size={20} />
            </span>
          </span>
          <span className="st-row-text">
            <b>{t('payments.creatorSubs')}</b>
          </span>
          {subs.data && !subs.data.length ? <span className="st-row-value">{t('payments.none')}</span> : null}
          <span className="st-row-go">
            <Icon name="right" size={16} stroke={2} />
          </span>
        </Link>
      </Card>
    </Block>
  );
}

/* ---------- transactions ---------- */

/** What each kind of payment is called (when the payment itself says nothing more) and its icon. */
const KIND: Record<Transaction['kind'], { label: string; icon: IconName | 'gift' }> = {
  plus: { label: 'common.communityPlus', icon: 'crown' },
  subscription: { label: 'payments.kindSubscription', icon: 'users' },
  donation: { label: 'payments.kindDonation', icon: 'gift' },
  ad: { label: 'payments.kindAd', icon: 'ad' },
  refund: { label: 'payments.kindRefund', icon: 'undo' },
  other: { label: 'payments.kindOther', icon: 'receipt' },
};

/** A refund is money back, whichever way round it was recorded. */
const isRefund = (tx: Transaction) => tx.kind === 'refund' || tx.amount_pence < 0;

/** What it was. Card payments carry their own words ("Community Plus · renewal"); one an admin logged says its kind. */
function txTitle(tx: Transaction): string {
  const note = tx.provider === 'stripe' ? (tx.note ?? '').trim() : '';
  return note || t((KIND[tx.kind] ?? KIND.other).label);
}

/** "£4.99", or "+£4.99" for money back. */
function amountText(tx: Transaction): string {
  return isRefund(tx) ? '+' + money(Math.abs(tx.amount_pence), tx.currency) : money(tx.amount_pence, tx.currency);
}

function statusText(tx: Transaction): string {
  if (tx.status === 'failed') return t('payments.failed');
  if (tx.status === 'refunded' || isRefund(tx)) return t('payments.refunded');
  return t('payments.paid');
}

/** The reference Stripe (or the app, for one an admin logged) knows the payment by. */
function reference(tx: Transaction): string {
  const s = tx.stripe_invoice_id ?? '';
  if (s.startsWith('pi:')) return s.slice(3);
  if (s.startsWith('refund:')) return s.split(':')[1] || s;
  return s || tx.id;
}

/** "October", or "October 2025" in another year, in the app's language. */
function monthLabel(d: Date): string {
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(dateLocale(), sameYear ? { month: 'long' } : { month: 'long', year: 'numeric' });
}

/** "9 October 2026, 14:05", in the app's language. */
function fullDate(iso: string): string {
  return new Date(iso).toLocaleString(dateLocale(), { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function KindIcon({ tx }: { tx: Transaction }) {
  const icon = isRefund(tx) ? 'undo' : (KIND[tx.kind] ?? KIND.other).icon;
  return <span className={'po-round' + (tx.kind === 'plus' && !isRefund(tx) ? ' plus' : '')}>{icon === 'gift' ? <GiftIcon size={20} /> : <Icon name={icon} size={20} />}</span>;
}

function Transactions() {
  const { me } = useMe();
  const [list, setList] = useState<Transaction[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<unknown>(null);
  const [shown, setShown] = useState<Transaction | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  // How many rows have been read, and whether a page is on its way (so the end is read only once).
  const fetched = useRef(0);
  const paging = useRef(false);

  const loadFirst = () => {
    setError(null);
    myTransactions(me.id, { offset: 0, limit: PAGE }).then(
      (rows) => {
        fetched.current = rows.length;
        setList(rows);
        setMore(rows.length === PAGE);
      },
      setError,
    );
  };
  useEffect(loadFirst, [me.id]);

  const loadMore = async () => {
    if (!list || !more || paging.current) return;
    paging.current = true;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const rows = await myTransactions(me.id, { offset: fetched.current, limit: PAGE });
      fetched.current += rows.length;
      setList((cur) => {
        const ids = new Set((cur ?? []).map((x) => x.id));
        return [...(cur ?? []), ...rows.filter((x) => !ids.has(x.id))];
      });
      setMore(rows.length === PAGE);
    } catch (e) {
      setMoreError(e);
    } finally {
      paging.current = false;
      setLoadingMore(false);
    }
  };

  // Reaching the end of the list reads the next page (after a page fails, only Try again asks again).
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !more || moreError) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && loadMore(), { rootMargin: '400px' });
    io.observe(el);
    return () => io.disconnect();
  }, [list, more, moreError]);

  // Rows grouped under the month they were made in.
  const months = useMemo(() => {
    const out: { key: string; label: string; rows: Transaction[] }[] = [];
    for (const tx of list ?? []) {
      const d = new Date(tx.created_at);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      if (out[out.length - 1]?.key !== key) out.push({ key, label: monthLabel(d), rows: [] });
      out[out.length - 1].rows.push(tx);
    }
    return out;
  }, [list]);

  let body: React.ReactNode;
  if (list === null && !error) body = <RowsSkeleton count={5} avatar={42} right />;
  else if (error && !list) body = <Retry error={error} retry={loadFirst} />;
  else if (!list!.length) body = <p className="st-empty-line">{t('payments.noPayments')}</p>;
  else
    body = (
      <div className="po-tx-list">
        {months.map((m) => (
          <section key={m.key} className="po-month" aria-label={m.label}>
            <h3 className="po-month-h">{m.label}</h3>
            <Card>
              {m.rows.map((tx) => (
                <TxRow key={tx.id} tx={tx} onOpen={setShown} />
              ))}
            </Card>
          </section>
        ))}
        <div ref={sentinel} />
        {loadingMore ? <RowsSkeleton count={2} avatar={42} right /> : null}
        {moreError ? <Retry error={moreError} retry={loadMore} /> : null}
      </div>
    );

  return (
    <Block title={t('settings.transactions')}>
      {body}
      {shown ? <TxDetail tx={shown} onClose={() => setShown(null)} /> : null}
    </Block>
  );
}

/** One payment: what it was, when and how, and the amount with where it stands. */
function TxRow({ tx, onOpen }: { tx: Transaction; onOpen: (tx: Transaction) => void }) {
  const refund = isRefund(tx);
  const failed = tx.status === 'failed';
  const title = txTitle(tx);
  const line = [shortDay(tx.created_at), tx.method].filter(Boolean).join(' · ');
  return (
    <button type="button" className="st-row st-link po-tx" onClick={() => onOpen(tx)} aria-haspopup="dialog" aria-label={`${title}, ${amountText(tx)}, ${statusText(tx)}, ${line}`}>
      <span className="po-lead">
        <KindIcon tx={tx} />
      </span>
      <span className="st-row-text">
        <b>{title}</b>
        <span>{line}</span>
      </span>
      <span className="po-amount">
        <b className={refund ? 'back' : failed ? 'failed' : tx.status === 'refunded' ? 'refunded' : ''}>{amountText(tx)}</b>
        <span className={failed ? 'po-bad' : ''}>{statusText(tx)}</span>
      </span>
    </button>
  );
}

/** Everything about one payment, with its reference to copy. */
function TxDetail({ tx, onClose }: { tx: Transaction; onClose: () => void }) {
  const refund = isRefund(tx);
  const failed = tx.status === 'failed';
  const ref = reference(tx);
  const copy = async () => {
    if (await copyText(ref)) toast(t('payments.copied'));
  };
  return (
    <Modal title={t('payments.kindOther')} onClose={onClose} className="po-detail">
      <div className="po-detail-top">
        <KindIcon tx={tx} />
        <b className={'po-detail-amount' + (refund ? ' back' : failed ? ' failed' : '')}>{amountText(tx)}</b>
        <span className="po-detail-title">{txTitle(tx)}</span>
      </div>
      <dl className="po-facts">
        <div>
          <dt>{t('payments.status')}</dt>
          <dd className={failed ? 'po-bad' : ''}>{statusText(tx)}</dd>
        </div>
        <div>
          <dt>{t('payments.date')}</dt>
          <dd>{fullDate(tx.created_at)}</dd>
        </div>
        {/* A card payment whose card Stripe didn't describe has no method; only one an admin logged is "Arranged by an admin". */}
        {tx.method || tx.provider !== 'stripe' ? (
          <div>
            <dt>{t('payments.method')}</dt>
            <dd>{tx.method || t('payments.byAdmin')}</dd>
          </div>
        ) : null}
        <div>
          <dt>{t('payments.reference')}</dt>
          <dd>
            <button type="button" className="po-ref" onClick={copy} aria-label={`${t('payments.reference')}, ${ref}`} title={t('payments.reference')}>
              <span>{ref}</span>
              <Icon name="copy" size={16} />
            </button>
          </dd>
        </div>
      </dl>
    </Modal>
  );
}

/** A part of the page that didn't load: why, and Try again, as plain words. */
function Retry({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <p className="po-retry">
      <span>{errText(error)}</span>
      <button type="button" className="link-btn" onClick={retry}>
        {t('common.tryAgain')}
      </button>
    </p>
  );
}
