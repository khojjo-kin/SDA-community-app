// Community Plus, as on the iPhone: what it includes, the monthly and yearly plans (with a free first
// week for new members), the renewal terms beside the button, paying with a saved card or a new one
// (the iPhone's checkout.tsx), and for members their subscription and Plus settings, including the
// app font and chat wallpaper. The blue tick is not part of Plus: it only comes from an identity
// check (/verify).
import React, { useCallback, useEffect, useState } from 'react';
import { cancelSubscription, fetchSavedCards, myPlusRequests, resumeSubscription, setTickHidden, startSubscription, syncSubscription, updateProfile } from 'shared/api';
import { usePrefs } from 'shared/prefs';
import { errText } from 'shared/theme';
import type { BillingStatus, PaymentsConfig, SavedCard } from 'shared/types';
import { wallpaperById } from 'shared/wallpapers';
import { appFontById, noteFontMember } from '../lib/font';
import { t, tSplit } from '../lib/i18n';
import { useMe } from '../lib/me';
import { money, paymentsConfig } from '../lib/pay';
import { nav, useRoute } from '../lib/router';
import { Icon, type IconName, Link, Modal, Spinner, Verified, ask, toast, toastError, useLoad } from '../ui/kit';
import { CardChip, cardTitle, expiryLabel, isExpired, longDay, Notice, pay, payWithSavedCard, renewalText, RenewalTerms, Toggle } from './pro-kit';
import { FontChooser } from './settings-media';

type Plan = 'monthly' | 'yearly';

/** The headline benefits (the keys of their words). The tick itself is not one on purpose: Plus only lets a verified member hide it. */
const BENEFITS: { icon: IconName; title: string }[] = [
  { icon: 'eye', title: 'plus.benefitPreview' },
  { icon: 'repeat', title: 'plus.benefitRewatches' },
  { icon: 'clock', title: 'plus.benefitViewTimes' },
  { icon: 'chatdots', title: 'settings.readQuietly' },
  { icon: 'star', title: 'plus.benefitPriority' },
  { icon: 'bell', title: 'settings.storyAlerts' },
  { icon: 'phone', title: 'plus.benefitScreenshots' },
  { icon: 'sparkle', title: 'settings.profileStyle' },
  { icon: 'shield', title: 'plus.benefitHideTick' },
  { icon: 'font', title: 'plus.benefitFonts' },
  { icon: 'account', title: 'settings.profileViewers' },
  { icon: 'lifebuoy', title: 'plus.benefitSupport' },
];

/** Every perk in one line each (the keys of their words), for "Explore all benefits". */
const ALL_BENEFITS = [
  'plus.allPreview',
  'plus.allRewatches',
  'plus.allViewTimes',
  'plus.allReadQuietly',
  'plus.allPriority',
  'plus.allStoryAlerts',
  'plus.allScreenshots',
  'plus.allProfileStyle',
  'plus.allTick',
  'plus.allErha',
  'plus.allFonts',
  'plus.allWallpapers',
  'plus.allViewers',
  'plus.allEditing',
  'plus.allPod',
  'plus.benefitSupport',
  'plus.allNewFeatures',
];

/** Subscriptions that still renew (or are trying to), and so can be cancelled. */
const RENEWING = ['active', 'trialing', 'past_due', 'unpaid'];

/** Where the subscription stands, in one line. */
function subscriptionLine(b: BillingStatus): string {
  const day = longDay(b.current_period_end);
  if (b.status === 'past_due' || b.status === 'unpaid') return t('plus.statusFailed');
  if (b.status === 'incomplete') return t('plus.statusIncomplete');
  if (b.status === 'canceled') return day ? t('plus.statusEndedOn', { day }) : t('plus.statusEnded');
  if (b.cancel_at_period_end) return day ? t('plus.statusEndsOn', { day }) : t('plus.statusEndsPeriod');
  if (b.status === 'trialing') return day ? t('plus.statusTrialEndsOn', { day }) : t('plus.statusTrial');
  return day ? t('plus.statusRenewsOn', { day }) : b.plan === 'yearly' ? t('plus.statusRenewsYearly') : t('plus.statusRenewsMonthly');
}

/** The yearly plan's saving against twelve months, rounded down so it is never overstated. */
function savePercent(monthly: number, yearly: number): number {
  if (!monthly || !yearly) return 0;
  return Math.max(0, Math.floor((1 - yearly / (monthly * 12)) * 100));
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** The "New card" choice beside the saved cards. */
const NEW = 'new';

export function Plus() {
  const { me, refresh } = useMe();
  const route = useRoute();
  // Opened from the tick application ("Get Plus to continue"): go back there once Plus is on.
  const then = new URLSearchParams(route.split('?')[1] ?? '').get('then') ?? '';
  const requests = useLoad(() => myPlusRequests(me.id), [me.id]);
  const [config, setConfig] = useState<PaymentsConfig | null>(null);
  const [configError, setConfigError] = useState<unknown>(null);
  // The Stripe subscription. Kept apart from the config because cancelling or resuming replaces it.
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [plan, setPlan] = useState<Plan>('monthly');
  const [busy, setBusy] = useState<'' | 'pay' | 'renewal' | 'card'>('');
  const [error, setError] = useState('');
  const [tickHidden, setTickHiddenNow] = useState(!!me.tick_hidden);
  useEffect(() => setTickHiddenNow(!!me.tick_hidden), [me.tick_hidden]);
  const [receipts, setReceipts] = useState(me.read_receipts);
  useEffect(() => setReceipts(me.read_receipts), [me.read_receipts]);
  // Cards saved on the member's Stripe customer, and the way to pay chosen (a card's id, or NEW).
  const [cards, setCards] = useState<SavedCard[]>([]);
  const [method, setMethod] = useState(NEW);
  const [fonts, setFonts] = useState(false);
  const { appFont, chatWallpaper } = usePrefs();
  // Buying Plus (or it ending) changes the app's font at once.
  useEffect(() => noteFontMember(me.id, !!me.plus), [me.id, me.plus]);

  const load = useCallback(() => {
    setConfigError(null);
    paymentsConfig(true).then(
      (c) => {
        setConfig(c);
        setBilling(c);
        if (!c.ready) return;
        // As the iPhone's checkout: the default card (or the first one that hasn't expired) is chosen.
        fetchSavedCards().then(
          (list) => {
            const usable = list.filter((x) => !isExpired(x.exp_month, x.exp_year));
            setCards(list);
            setMethod((usable.find((x) => x.is_default) ?? usable[0])?.id ?? NEW);
          },
          () => setCards([]),
        );
      },
      (e) => setConfigError(e),
    );
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  // Members start on the plan they have, so the other card is the one that offers a switch.
  const currentPlan: Plan | null = billing && RENEWING.includes(billing.status) ? billing.plan ?? 'monthly' : null;
  useEffect(() => {
    if (currentPlan) setPlan(currentPlan);
  }, [currentPlan]);

  const isPlus = !!me.plus;
  const member = !!currentPlan;
  const hasSub = !!billing && billing.status !== 'none' && billing.status !== 'incomplete_expired';
  const failed = billing?.status === 'past_due' || billing?.status === 'unpaid';
  // In the free week with no card saved for after it: without one, Plus ends with the week.
  const needsCard = billing?.status === 'trialing' && !!billing.needs_card;
  const trialOffer = !!config?.trial_available && !isPlus && !member;
  const priceOf = (p: Plan | null) => (config ? (p === 'yearly' ? config.yearly_pence : config.price_pence) : 0);
  /** A plan's price and how often: "£4.99 a month". */
  const priceLine = (p: Plan | null) => (config ? t(p === 'yearly' ? 'plus.perYear' : 'plus.perMonth', { price: money(priceOf(p), config.currency) }) : '');
  const ticked = !!me.verified || tickHidden;
  const pending = (requests.data ?? []).find((r) => r.kind === 'verify' && r.status === 'pending');
  const save = config ? savePercent(config.price_pence, config.yearly_pence) : 0;
  /** The saved card chosen to pay with, or null for a new card typed into the card form. */
  const savedCard = cards.some((c) => c.id === method) ? method : null;

  /** Plus is switched on by the server once Stripe agrees; give it a few seconds. */
  async function finish() {
    let synced = await syncSubscription().catch(() => null);
    for (let i = 0; i < 3 && !synced?.plus; i++) {
      await wait(1500);
      synced = await syncSubscription().catch(() => null);
    }
    await refresh().catch(() => {});
    load();
    return synced;
  }

  /** Starts Plus: a free week saves a card (nothing charged); otherwise the first payment. */
  async function subscribe() {
    if (!config || busy) return;
    if (!config.ready) return toast(t('pay.unavailable'));
    setBusy('pay');
    setError('');
    try {
      const r = await startSubscription(savedCard, plan);
      const currency = (r.currency ?? config.currency).toUpperCase();
      if (!r.already) {
        if (!r.client_secret) throw new Error(t('checkout.couldNotStart'));
        // This page offered a free week but the server would charge today: stop, so nobody pays who expected not to.
        if (trialOffer && r.intent !== 'setup' && (r.amount ?? 0) > 0) {
          setError(t('d.plus.trialGone', { amount: money(r.amount ?? priceOf(plan), currency) }));
          load();
          return;
        }
        const trial = r.intent === 'setup';
        const amount = r.amount ?? priceOf(plan);
        if (savedCard) {
          // The saved card pays (or is kept for after the free week) without the card form.
          await payWithSavedCard(r.client_secret, savedCard, trial ? 'setup' : 'payment');
          await finish();
          toast(trial ? t('checkout.trialStarted') : t('checkout.welcome'));
          if (then.startsWith('/')) nav(then);
          return;
        }
        const ok = await pay({
          title: `${t('common.communityPlus')} · ${t(plan === 'yearly' ? 'plus.yearly' : 'plus.monthly')}`,
          detail: trial ? t('d.plus.trialDetail', { days: r.trial_days ?? config.trial_days, price: priceLine(plan) }) : renewalText(amount, currency, plan === 'yearly' ? 'year' : 'month'),
          amountPence: trial ? 0 : amount,
          currency,
          clientSecret: r.client_secret,
          intent: trial ? 'setup' : 'payment',
          action: trial ? t('checkout.startFreeWeek') : t('checkout.pay', { price: money(amount, currency) }),
        });
        if (!ok) {
          // The free week starts with or without the card: show where things stand.
          if (trial) {
            await refresh().catch(() => {});
            load();
          }
          return;
        }
        await finish();
        toast(trial ? t('checkout.trialStarted') : t('checkout.welcome'));
      } else {
        await finish();
        toast(r.trial_days ? t('checkout.trialStarted') : t('checkout.welcome'));
      }
      if (then.startsWith('/')) nav(then);
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy('');
    }
  }

  /** A member moving to the other plan: the server swaps the price on the same subscription. */
  async function switchPlan() {
    if (!config || !currentPlan || busy) return;
    const label = t(plan === 'yearly' ? 'plus.switchToYearly' : 'plus.switchToMonthly');
    const sure = await ask(t(plan === 'yearly' ? 'd.plus.switchToYearlyQ' : 'd.plus.switchToMonthlyQ'), t('d.plus.switchBody', { price: priceLine(plan), old: priceLine(currentPlan) }), label, false);
    if (!sure) return;
    setBusy('pay');
    setError('');
    try {
      const r = await startSubscription(null, plan);
      // In the free week with no card yet: the plan has switched, and a card for after the week comes next.
      if (r.intent === 'setup' && r.client_secret) {
        const ok = await pay({ title: t('checkout.cardForAfter'), detail: t('d.plus.thenNothingToday', { price: priceLine(plan) }), amountPence: 0, currency: config.currency, clientSecret: r.client_secret, intent: 'setup', action: t('checkout.saveCard') });
        await finish();
        toast(ok ? t('checkout.cardSaved') : plan === 'yearly' ? t('checkout.onYearly') : t('checkout.onMonthly'));
        return;
      }
      if (!r.already) throw new Error(t('d.plus.payRenewalFirst'));
      await finish();
      toast(plan === 'yearly' ? t('checkout.onYearly') : t('checkout.onMonthly'));
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy('');
    }
  }

  /** In the free week without a card, or a payment that failed: the card form, for the plan they are on. */
  async function fixPayment() {
    if (!config || !billing || busy) return;
    const p: Plan = billing.plan ?? 'monthly';
    setBusy('card');
    try {
      // A saved card chosen here is put on the subscription (in the free week) or pays the renewal.
      const r = await startSubscription(savedCard, p);
      if (!r.already) {
        if (!r.client_secret) throw new Error(t('checkout.couldNotStart'));
        const setup = r.intent === 'setup';
        const amount = r.amount ?? priceOf(p);
        if (savedCard) {
          await payWithSavedCard(r.client_secret, savedCard, setup ? 'setup' : 'payment');
          await finish();
          toast(setup ? t('checkout.cardSaved') : t('d.plus.welcomeBack'));
          return;
        }
        const ok = await pay({
          title: setup ? t('checkout.cardForAfter') : t('common.communityPlus'),
          detail: setup ? t('d.plus.freeUntilDetail', { day: longDay(billing.current_period_end), price: priceLine(p) }) : renewalText(amount, r.currency ?? config.currency, p === 'yearly' ? 'year' : 'month'),
          amountPence: setup ? 0 : amount,
          currency: (r.currency ?? config.currency).toUpperCase(),
          clientSecret: r.client_secret,
          intent: setup ? 'setup' : 'payment',
          action: setup ? t('checkout.saveCard') : t('checkout.pay', { price: money(amount, r.currency ?? config.currency) }),
        });
        if (!ok) return;
        await finish();
        toast(setup ? t('checkout.cardSaved') : t('d.plus.welcomeBack'));
      } else {
        await finish();
        if (savedCard) toast(needsCard ? t('checkout.cardSaved') : t('d.plus.welcomeBack'));
      }
    } catch (e) {
      toastError(e);
    } finally {
      setBusy('');
    }
  }

  async function changeRenewal() {
    if (!billing || busy) return;
    const resume = billing.cancel_at_period_end;
    const day = longDay(billing.current_period_end);
    const trialling = billing.status === 'trialing';
    const sure = resume
      ? await ask(t('plus.resumeQuestion'), day ? t('plus.willRenewOn', { day, price: priceLine(billing.plan) }) : t('plus.willRenew', { price: priceLine(billing.plan) }), t('plus.resume'), false)
      : await ask(
          t('plus.cancelQuestion'),
          trialling ? (day ? t('plus.trialCancelUntil', { day }) : t('plus.trialCancel')) : day ? t('plus.cancelUntil', { day }) : t('plus.cancelPeriod'),
          t('plus.cancelSubscription'),
        );
    if (!sure) return;
    setBusy('renewal');
    try {
      const next = await (resume ? resumeSubscription() : cancelSubscription());
      setBilling(next);
      toast(resume ? t('plus.renewsAsNormal') : day ? t('plus.willEndOn', { day }) : t('plus.willEndPeriod'));
      refresh().catch(() => {});
    } catch (e) {
      toastError(e);
    } finally {
      setBusy('');
    }
  }

  async function hideTick(hidden: boolean) {
    const before = tickHidden;
    setTickHiddenNow(hidden);
    try {
      await setTickHidden(hidden);
      toast(hidden ? t('plus.tickHidden') : t('plus.tickShowsAgain'));
      await refresh();
    } catch (e) {
      setTickHiddenNow(before);
      toastError(e);
    }
  }

  async function setReadReceipts(next: boolean) {
    const before = receipts;
    setReceipts(next);
    try {
      await updateProfile(me.id, { read_receipts: next });
      await refresh();
    } catch (e) {
      setReceipts(before);
      toastError(e);
    }
  }

  /** How to pay: the saved cards (an expired one can't be chosen) or a new card, as on the iPhone's checkout. */
  const payWith = (heading: string) =>
    cards.length ? (
      <div className="pro-paywith">
        <h3>{heading}</h3>
        <div className="pro-paywith-list" role="radiogroup" aria-label={heading}>
          {cards.map((c) => {
            const expired = isExpired(c.exp_month, c.exp_year);
            const exp = expiryLabel(c.exp_month, c.exp_year);
            return (
              <button key={c.id} type="button" role="radio" aria-checked={method === c.id} aria-label={cardTitle(c)} disabled={expired || !!busy} className={'pro-paywith-card' + (method === c.id ? ' on' : '')} onClick={() => setMethod(c.id)}>
                <span className={'pro-paywith-dot' + (method === c.id ? ' on' : '')} />
                <CardChip brand={c.brand} />
                <span className="grow">
                  <b>{cardTitle(c)}</b>
                  <span className={expired ? 'pro-bad-text' : 'muted-text'}>{expired ? t('checkout.expired', { date: exp }) : t('checkout.expires', { date: exp })}</span>
                </span>
                {c.is_default ? <span className="pro-tag">{t('checkout.default')}</span> : null}
              </button>
            );
          })}
          <button type="button" role="radio" aria-checked={method === NEW} aria-label={t('checkout.newCard')} disabled={!!busy} className={'pro-paywith-card' + (method === NEW ? ' on' : '')} onClick={() => setMethod(NEW)}>
            <span className={'pro-paywith-dot' + (method === NEW ? ' on' : '')} />
            <span className="pro-paywith-new">
              <Icon name="plus" size={16} stroke={2.2} />
            </span>
            <span className="grow">
              <b>{t('checkout.newCard')}</b>
              <span className="muted-text">{t('checkout.creditOrDebit')}</span>
            </span>
          </button>
        </div>
      </div>
    ) : null;

  // The button under the plans.
  let button: { label: string; onClick: () => void; on: boolean } | null = null;
  if (configError && !config) button = { label: t('common.tryAgain'), onClick: load, on: true };
  else if (!config) button = { label: t('d.plus.loadingPrices'), onClick: () => {}, on: false };
  else if (member) button = plan === currentPlan ? null : { label: t(plan === 'yearly' ? 'plus.switchToYearly' : 'plus.switchToMonthly'), onClick: switchPlan, on: true };
  else button = { label: trialOffer ? t('plus.tryFor', { price: money(0, config.currency) }) : plan === 'yearly' ? t('plus.subscribeYearly', { price: money(config.yearly_pence, config.currency) }) : t('plus.subscribeMonthly', { price: money(config.price_pence, config.currency) }), onClick: subscribe, on: true };
  // The free-week headline, with "Community Plus" drawn in green wherever it sits in the sentence.
  const [tryBefore, tryAfter] = tSplit('plus.trialHeadlineNamed', 'plus', { username: me.username, time: config?.trial_days === 7 || !config ? t('plus.oneWeek') : t('plus.days', { count: config.trial_days }) });
  // Plus given by an admin has no subscription to change, and a failed renewal is paid from the box on the left.
  const showPlans = !failed && (member || !isPlus);

  return (
    <div className="page pro-plus">
      <div className="pro-plus-grid">
        <div className="pro-plus-main">
          <header className="pro-plus-hero">
            <span className="pro-plus-badge">
              <Icon name="crown" size={34} />
            </span>
            <h1>{trialOffer ? <>{tryBefore}<span className="pro-ok-text">Community Plus</span>{tryAfter}</> : <span className="pro-ok-text">Community Plus</span>}</h1>
            {isPlus ? (
              <span className="pro-plus-have">
                <Icon name="check" size={15} stroke={2.6} /> {me.plus_until ? t('plus.youHavePlusUntil', { day: longDay(me.plus_until) }) : t('plus.youHavePlus')}
              </span>
            ) : (
              <p className="muted-text">{t('d.plus.heroSub')}</p>
            )}
          </header>

          {hasSub && billing ? (
            <section className="pro-plus-sec">
              <h2>{t('plus.yourSubscription')}</h2>
              <div className="pro-box">
                <div className="pro-box-row">
                  <span className={'pro-round' + (failed ? '' : ' ok')}>
                    <Icon name={failed ? 'info' : 'card'} size={20} />
                  </span>
                  <div className="grow">
                    <b>
                      {t(billing.plan === 'yearly' ? 'plus.yearly' : 'plus.monthly')}
                      {config ? ` · ${priceLine(billing.plan)}` : ''}
                    </b>
                    <span className={'pro-sub-line' + (failed ? ' pro-bad-text' : '')}>{subscriptionLine(billing)}</span>
                  </div>
                </div>
                {needsCard || failed || billing.status === 'incomplete' ? payWith(needsCard ? t('checkout.cardForAfter') : t('checkout.payWith')) : null}
                {needsCard ? (
                  <button className="btn block" disabled={!!busy} onClick={fixPayment}>
                    {busy === 'card' ? t('d.plus.opening') : t('plus.addCard')}
                  </button>
                ) : null}
                {failed || billing.status === 'incomplete' ? (
                  <button className="btn block" disabled={!!busy} onClick={fixPayment}>
                    {failed ? t('plus.payNow') : t('plus.finishPaying')}
                  </button>
                ) : null}
                <Link to="/dashboard/billing" className="pro-box-link">
                  <Icon name="card" size={20} />
                  <span className="grow">{t('d.plus.paymentMethodsHistory')}</span>
                  <Icon name="right" size={18} />
                </Link>
                {RENEWING.includes(billing.status) ? (
                  <button className={'pro-box-link' + (billing.cancel_at_period_end ? ' pro-ok-text' : ' pro-bad-text')} disabled={!!busy} onClick={changeRenewal}>
                    <Icon name={billing.cancel_at_period_end ? 'repeat' : 'close'} size={20} />
                    <span className="grow">{busy === 'renewal' ? t('d.plus.saving') : billing.cancel_at_period_end ? t('plus.resumeSubscription') : t('plus.cancelSubscription')}</span>
                  </button>
                ) : null}
              </div>
            </section>
          ) : null}

          {isPlus ? (
            <section className="pro-plus-sec">
              <h2>{t('plus.yourSettings')}</h2>
              <div className="pro-box">
                {ticked ? (
                  <div className="pro-box-link static">
                    <Verified size={18} />
                    <span className="grow">
                      {t('d.plus.hideMyTick')}
                      <em>{tickHidden ? t('plus.tickHidden') : t('d.plus.tickShows')}</em>
                    </span>
                    <Toggle on={tickHidden} onChange={hideTick} label={t('d.plus.hideMyTick')} />
                  </div>
                ) : null}
                <div className="pro-box-link static">
                  <Icon name="chatdots" size={20} />
                  <span className="grow">
                    {t('settings.readReceipts')}
                    <em>{receipts ? t('d.plus.receiptsOn') : t('d.plus.receiptsOff')}</em>
                  </span>
                  <Toggle on={receipts} onChange={setReadReceipts} label={t('settings.readReceipts')} />
                </div>
                <Link to={`/u/${me.username}/style`} className="pro-box-link">
                  <Icon name="sparkle" size={20} />
                  <span className="grow">
                    {t('settings.profileStyle')}
                    <em>{t('d.plus.profileStyleSub')}</em>
                  </span>
                  <Icon name="right" size={18} />
                </Link>
                <Link to="/accounts/viewers" className="pro-box-link">
                  <Icon name="eye" size={20} />
                  <span className="grow">{t('settings.profileViewers')}</span>
                  <Icon name="right" size={18} />
                </Link>
                <button className="pro-box-link" onClick={() => setFonts(true)}>
                  <Icon name="font" size={20} />
                  <span className="grow">
                    {t('settings.appFont')}
                    <em>{appFontById(appFont).name}</em>
                  </span>
                  <Icon name="right" size={18} />
                </button>
                <Link to="/accounts/chat-wallpaper" className="pro-box-link">
                  <Icon name="wallpaper" size={20} />
                  <span className="grow">
                    {t('settings.chatWallpaper')}
                    <em>{wallpaperById(chatWallpaper)?.name ?? t('create.none')}</em>
                  </span>
                  <Icon name="right" size={18} />
                </Link>
                <Link to="/accounts/story-alerts" className="pro-box-link">
                  <Icon name="bell" size={20} />
                  <span className="grow">
                    {t('settings.storyAlerts')}
                    <em>{t('d.plus.storyAlertsSub')}</em>
                  </span>
                  <Icon name="right" size={18} />
                </Link>
              </div>
            </section>
          ) : null}

          {!isPlus && ticked && tickHidden ? (
            <section className="pro-plus-sec">
              <h2>{t('plus.yourTick')}</h2>
              <div className="pro-box">
                <div className="pro-box-link static">
                  <Verified size={18} />
                  <span className="grow">{t('d.plus.hideMyTick')}</span>
                  <Toggle on={tickHidden} onChange={hideTick} label={t('d.plus.hideMyTick')} />
                </div>
              </div>
            </section>
          ) : null}

          <section className="pro-plus-sec">
            <h2>{t('plus.whatYouGet')}</h2>
            <ul className="pro-benefits">
              {BENEFITS.map((b) => (
                <li key={b.title}>
                  <Icon name={b.icon} size={26} stroke={1.6} />
                  <b>{t(b.title)}</b>
                </li>
              ))}
            </ul>
          </section>

          <section className="pro-plus-sec">
            <h2>{t('plus.exploreAll')}</h2>
            <ul className="pro-all">
              {ALL_BENEFITS.map((line) => (
                <li key={line}>
                  <Icon name="check" size={18} stroke={1.8} />
                  <span>{t(line)}</span>
                </li>
              ))}
            </ul>
          </section>

          {ticked ? null : (
            <Link to="/verify" className="pro-tick-link">
              <Verified size={24} />
              <b className="grow">{pending ? t('plus.idBeingReviewed') : t('plus.wantTick')}</b>
              <Icon name="right" size={18} />
            </Link>
          )}
        </div>

        <aside className="pro-plus-side">
          {showPlans ? (
            <div className="pro-plan-box">
              <h2>{member ? t('plus.yourPlan') : t('d.plus.choosePlan')}</h2>
              {config ? (
                <div className="pro-plans" role="radiogroup" aria-label={t('d.plus.plan')}>
                  <PlanCard title={t('plus.monthly')} price={money(config.price_pence, config.currency)} sub={currentPlan === 'monthly' ? t('plus.yourPlan') : t('plus.aMonth')} on={plan === 'monthly'} onClick={() => setPlan('monthly')} />
                  <PlanCard title={t('plus.yearly')} price={money(config.yearly_pence, config.currency)} sub={currentPlan === 'yearly' ? t('plus.yourPlan') : t('plus.perMonth', { price: money(Math.round(config.yearly_pence / 12), config.currency) })} pill={save >= 1 ? t('plus.save', { percent: save }) : undefined} on={plan === 'yearly'} onClick={() => setPlan('yearly')} />
                </div>
              ) : configError ? null : (
                <Spinner size={24} />
              )}
              {/* The renewal terms of the plan chosen, right above the button that starts it. */}
              {config && !member ? <RenewalTerms pricePence={priceOf(plan)} currency={config.currency} cadence={plan === 'yearly' ? 'year' : 'month'} trialDays={trialOffer ? config.trial_days : 0} /> : null}
              {config && member && plan !== currentPlan ? <RenewalTerms pricePence={priceOf(plan)} currency={config.currency} cadence={plan === 'yearly' ? 'year' : 'month'} freeUntil={billing?.status === 'trialing' ? longDay(billing.current_period_end) : ''} /> : null}
              {config && !member ? payWith(trialOffer ? t('checkout.cardForAfter') : t('checkout.payWith')) : null}
              {error ? <Notice kind="warn">{error}</Notice> : configError && !config ? <Notice kind="warn">{errText(configError)}</Notice> : null}
              {button ? (
                <button className="btn block big" disabled={!button.on || !!busy} onClick={button.onClick}>
                  {busy === 'pay' ? t('d.plus.processing') : button.label}
                </button>
              ) : (
                <p className="muted-text small center">{t('d.plus.onThisPlan')}</p>
              )}
              {config?.test_mode ? <p className="pro-terms center">{t('d.plus.testMode')}</p> : null}
              <p className="pro-terms center">
                <Icon name="lock" size={12} /> {t('d.plus.stripeCancelAnyTime')}
              </p>
            </div>
          ) : isPlus && !member && !failed ? (
            <div className="pro-plan-box">
              <h2>{t('plus.youHavePlus')}</h2>
              <p className="muted-text">{me.plus_until ? t('d.plus.givenUntil', { day: longDay(me.plus_until) }) : t('d.plus.givenOn')}</p>
            </div>
          ) : null}
        </aside>
      </div>
      {fonts ? (
        <Modal title={t('settings.appFont')} onClose={() => setFonts(false)} wide>
          <div className="st-modal-body">
            <FontChooser />
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

/** One plan. The chosen one wears a green border. */
function PlanCard({ title, price, sub, pill, on, onClick }: { title: string; price: string; sub: string; pill?: string; on: boolean; onClick: () => void }) {
  return (
    <button role="radio" aria-checked={on} className={'pro-plan' + (on ? ' on' : '')} onClick={onClick}>
      <span className="pro-plan-top">
        <b>{title}</b>
        {pill ? <span className="pro-tag ok">{pill}</span> : null}
      </span>
      <strong>{price}</strong>
      <span className="muted-text small">{sub}</span>
    </button>
  );
}
