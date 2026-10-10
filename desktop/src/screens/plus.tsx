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
import { useMe } from '../lib/me';
import { money, paymentsConfig } from '../lib/pay';
import { nav, useRoute } from '../lib/router';
import { Icon, type IconName, Link, Modal, Spinner, Verified, ask, toast, toastError, useLoad } from '../ui/kit';
import { CardChip, cardTitle, expiryLabel, isExpired, longDay, Notice, pay, payWithSavedCard, renewalText, RenewalTerms, Toggle } from './pro-kit';
import { FontChooser } from './settings-media';

type Plan = 'monthly' | 'yearly';

/** The headline benefits. The tick itself is not one on purpose: Plus only lets a verified member hide it. */
const BENEFITS: { icon: IconName; title: string }[] = [
  { icon: 'eye', title: 'Preview stories quietly' },
  { icon: 'repeat', title: 'Count story rewatches' },
  { icon: 'clock', title: 'See when your story was viewed' },
  { icon: 'chatdots', title: 'Read messages quietly' },
  { icon: 'star', title: 'Story priority' },
  { icon: 'bell', title: 'Story alerts' },
  { icon: 'phone', title: 'Screenshot alerts' },
  { icon: 'sparkle', title: 'Profile style' },
  { icon: 'shield', title: 'Hide your tick' },
  { icon: 'font', title: 'App fonts and chat wallpapers' },
  { icon: 'account', title: 'Profile viewers' },
  { icon: 'lifebuoy', title: 'Quick support' },
];

/** Every perk in one line each, for "Explore all benefits". */
const ALL_BENEFITS = [
  'Preview stories without showing on the viewer list',
  'See how many times each person rewatched your story',
  'See the time of every view',
  'Read messages without showing Seen',
  "Your story first in your friends' trays",
  'Alerts when people you pick watch your story',
  'Alerts when someone screenshots your chat',
  'Your own ring colour, profile theme and memory covers',
  'Choose whether your tick shows (verified members)',
  'Erha without daily limits',
  'App fonts: Nunito, Lora or Poppins',
  'Chat wallpapers',
  'See who viewed your profile',
  'Advanced photo editing',
  'Share your songs and podcasts on Pod',
  'Quick support',
  'New features first',
];

/** Subscriptions that still renew (or are trying to), and so can be cancelled. */
const RENEWING = ['active', 'trialing', 'past_due', 'unpaid'];

/** Where the subscription stands, in one line. */
function subscriptionLine(b: BillingStatus): string {
  const day = longDay(b.current_period_end);
  if (b.status === 'past_due' || b.status === 'unpaid') return 'Payment failed — update your card';
  if (b.status === 'incomplete') return 'Your first payment is not finished yet';
  if (b.status === 'canceled') return day ? `Ended on ${day}` : 'Ended';
  if (b.cancel_at_period_end) return day ? `Ends on ${day}` : 'Ends at the end of this period';
  if (b.status === 'trialing') return day ? `Free week ends on ${day}` : 'Free week';
  return day ? `Renews on ${day}` : b.plan === 'yearly' ? 'Renews yearly' : 'Renews monthly';
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
  const per = (p: Plan | null) => (p === 'yearly' ? 'a year' : 'a month');
  const priceLine = (p: Plan | null) => (config ? `${money(priceOf(p), config.currency)} ${per(p)}` : '');
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
    if (!config.ready) return toast("Payments aren't available yet.");
    setBusy('pay');
    setError('');
    try {
      const r = await startSubscription(savedCard, plan);
      const currency = (r.currency ?? config.currency).toUpperCase();
      if (!r.already) {
        if (!r.client_secret) throw new Error('The payment could not be started. Try again.');
        // This page offered a free week but the server would charge today: stop, so nobody pays who expected not to.
        if (trialOffer && r.intent !== 'setup' && (r.amount ?? 0) > 0) {
          setError(`The free week isn't available on this account any more, so Plus would start at ${money(r.amount ?? priceOf(plan), currency)} today. Nothing has been charged. Press the button again to go ahead.`);
          load();
          return;
        }
        const trial = r.intent === 'setup';
        const amount = r.amount ?? priceOf(plan);
        if (savedCard) {
          // The saved card pays (or is kept for after the free week) without the card form.
          await payWithSavedCard(r.client_secret, savedCard, trial ? 'setup' : 'payment');
          await finish();
          toast(trial ? 'Your free week has started' : 'Welcome to Plus');
          if (then.startsWith('/')) nav(then);
          return;
        }
        const ok = await pay({
          title: `Community Plus · ${plan === 'yearly' ? 'Yearly' : 'Monthly'}`,
          detail: trial ? `Free for ${r.trial_days ?? config.trial_days} days, then ${priceLine(plan)}. Nothing is charged today. Renews automatically until cancelled.` : renewalText(amount, currency, plan === 'yearly' ? 'year' : 'month'),
          amountPence: trial ? 0 : amount,
          currency,
          clientSecret: r.client_secret,
          intent: trial ? 'setup' : 'payment',
          action: trial ? 'Start free week' : `Pay ${money(amount, currency)}`,
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
        toast(trial ? 'Your free week has started' : 'Welcome to Plus');
      } else {
        await finish();
        toast(r.trial_days ? 'Your free week has started' : 'Welcome to Plus');
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
    const label = plan === 'yearly' ? 'Switch to yearly' : 'Switch to monthly';
    const sure = await ask(label + '?', `${priceLine(plan)} instead of ${priceLine(currentPlan)}. Stripe adjusts your next payment for the time left on your current plan.`, label, false);
    if (!sure) return;
    setBusy('pay');
    setError('');
    try {
      const r = await startSubscription(null, plan);
      // In the free week with no card yet: the plan has switched, and a card for after the week comes next.
      if (r.intent === 'setup' && r.client_secret) {
        const ok = await pay({ title: 'Card for after your free week', detail: `Then ${priceLine(plan)}. Nothing is charged today.`, amountPence: 0, currency: config.currency, clientSecret: r.client_secret, intent: 'setup', action: 'Save card' });
        await finish();
        toast(ok ? 'Your card is saved' : plan === 'yearly' ? "You're on the yearly plan" : "You're on the monthly plan");
        return;
      }
      if (!r.already) throw new Error('Your last renewal needs paying first. Choose Pay now above.');
      await finish();
      toast(plan === 'yearly' ? "You're on the yearly plan" : "You're on the monthly plan");
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
        if (!r.client_secret) throw new Error('The payment could not be started. Try again.');
        const setup = r.intent === 'setup';
        const amount = r.amount ?? priceOf(p);
        if (savedCard) {
          await payWithSavedCard(r.client_secret, savedCard, setup ? 'setup' : 'payment');
          await finish();
          toast(setup ? 'Your card is saved' : 'Welcome back to Plus');
          return;
        }
        const ok = await pay({
          title: setup ? 'Card for after your free week' : 'Community Plus',
          detail: setup ? `Free until ${longDay(billing.current_period_end)}, then ${priceLine(p)}. Nothing is charged today.` : renewalText(amount, r.currency ?? config.currency, p === 'yearly' ? 'year' : 'month'),
          amountPence: setup ? 0 : amount,
          currency: (r.currency ?? config.currency).toUpperCase(),
          clientSecret: r.client_secret,
          intent: setup ? 'setup' : 'payment',
          action: setup ? 'Save card' : `Pay ${money(amount, r.currency ?? config.currency)}`,
        });
        if (!ok) return;
        await finish();
        toast(setup ? 'Your card is saved' : 'Welcome back to Plus');
      } else {
        await finish();
        if (savedCard) toast(needsCard ? 'Your card is saved' : 'Welcome back to Plus');
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
      ? await ask('Resume Plus?', day ? `Plus will renew on ${day} at ${priceLine(billing.plan)}.` : `Plus will renew at ${priceLine(billing.plan)}.`, 'Resume', false)
      : await ask(
          'Cancel Plus?',
          trialling ? (day ? `You won't be charged. Plus stays on until ${day}.` : "You won't be charged. Plus stays on until your free week ends.") : day ? `You will not be charged again. Plus stays on until ${day}.` : 'You will not be charged again. Plus stays on until the end of this period.',
          'Cancel subscription',
        );
    if (!sure) return;
    setBusy('renewal');
    try {
      const next = await (resume ? resumeSubscription() : cancelSubscription());
      setBilling(next);
      toast(resume ? 'Plus will renew as normal' : day ? `Plus will end on ${day}` : 'Plus will end at the end of this period');
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
      toast(hidden ? 'Your tick is hidden. You are still verified.' : 'Your tick shows again');
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
                  <span className={expired ? 'pro-bad-text' : 'muted-text'}>{expired ? `Expired ${exp}` : `Expires ${exp}`}</span>
                </span>
                {c.is_default ? <span className="pro-tag">Default</span> : null}
              </button>
            );
          })}
          <button type="button" role="radio" aria-checked={method === NEW} aria-label="New card" disabled={!!busy} className={'pro-paywith-card' + (method === NEW ? ' on' : '')} onClick={() => setMethod(NEW)}>
            <span className={'pro-paywith-dot' + (method === NEW ? ' on' : '')} />
            <span className="pro-paywith-new">
              <Icon name="plus" size={16} stroke={2.2} />
            </span>
            <span className="grow">
              <b>New card</b>
              <span className="muted-text">Credit or debit card</span>
            </span>
          </button>
        </div>
      </div>
    ) : null;

  // The button under the plans.
  let button: { label: string; onClick: () => void; on: boolean } | null = null;
  if (configError && !config) button = { label: 'Try again', onClick: load, on: true };
  else if (!config) button = { label: 'Loading prices…', onClick: () => {}, on: false };
  else if (member) button = plan === currentPlan ? null : { label: plan === 'yearly' ? 'Switch to yearly' : 'Switch to monthly', onClick: switchPlan, on: true };
  else button = { label: trialOffer ? `Try for ${money(0, config.currency)}` : plan === 'yearly' ? `Subscribe for ${money(config.yearly_pence, config.currency)}/year` : `Subscribe for ${money(config.price_pence, config.currency)}/month`, onClick: subscribe, on: true };
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
            <h1>{trialOffer ? <>{me.username}, try <span className="pro-ok-text">Community Plus</span> free for {config?.trial_days === 7 || !config ? 'one week' : `${config.trial_days} days`}</> : <span className="pro-ok-text">Community Plus</span>}</h1>
            {isPlus ? (
              <span className="pro-plus-have">
                <Icon name="check" size={15} stroke={2.6} /> {me.plus_until ? `You have Plus · until ${longDay(me.plus_until)}` : 'You have Plus'}
              </span>
            ) : (
              <p className="muted-text">More control over your stories, messages and profile, and new features first.</p>
            )}
          </header>

          {hasSub && billing ? (
            <section className="pro-plus-sec">
              <h2>Your subscription</h2>
              <div className="pro-box">
                <div className="pro-box-row">
                  <span className={'pro-round' + (failed ? '' : ' ok')}>
                    <Icon name={failed ? 'info' : 'card'} size={20} />
                  </span>
                  <div className="grow">
                    <b>
                      {billing.plan === 'yearly' ? 'Yearly' : 'Monthly'}
                      {config ? ` · ${priceLine(billing.plan)}` : ''}
                    </b>
                    <span className={'pro-sub-line' + (failed ? ' pro-bad-text' : '')}>{subscriptionLine(billing)}</span>
                  </div>
                </div>
                {needsCard || failed || billing.status === 'incomplete' ? payWith(needsCard ? 'Card for after your free week' : 'Pay with') : null}
                {needsCard ? (
                  <button className="btn block" disabled={!!busy} onClick={fixPayment}>
                    {busy === 'card' ? 'Opening…' : 'Add a card for after your free week'}
                  </button>
                ) : null}
                {failed || billing.status === 'incomplete' ? (
                  <button className="btn block" disabled={!!busy} onClick={fixPayment}>
                    {failed ? 'Pay now' : 'Finish paying'}
                  </button>
                ) : null}
                <Link to="/dashboard/billing" className="pro-box-link">
                  <Icon name="card" size={20} />
                  <span className="grow">Payment methods and history</span>
                  <Icon name="right" size={18} />
                </Link>
                {RENEWING.includes(billing.status) ? (
                  <button className={'pro-box-link' + (billing.cancel_at_period_end ? ' pro-ok-text' : ' pro-bad-text')} disabled={!!busy} onClick={changeRenewal}>
                    <Icon name={billing.cancel_at_period_end ? 'repeat' : 'close'} size={20} />
                    <span className="grow">{busy === 'renewal' ? 'Saving…' : billing.cancel_at_period_end ? 'Resume subscription' : 'Cancel subscription'}</span>
                  </button>
                ) : null}
              </div>
            </section>
          ) : null}

          {isPlus ? (
            <section className="pro-plus-sec">
              <h2>Your Plus settings</h2>
              <div className="pro-box">
                {ticked ? (
                  <div className="pro-box-link static">
                    <Verified size={18} />
                    <span className="grow">
                      Hide my tick
                      <em>{tickHidden ? 'Your tick is hidden. You are still verified.' : 'Your account shows the blue tick.'}</em>
                    </span>
                    <Toggle on={tickHidden} onChange={hideTick} label="Hide my tick" />
                  </div>
                ) : null}
                <div className="pro-box-link static">
                  <Icon name="chatdots" size={20} />
                  <span className="grow">
                    Read receipts
                    <em>{receipts ? 'People see when you have read their messages.' : 'You read messages quietly.'}</em>
                  </span>
                  <Toggle on={receipts} onChange={setReadReceipts} label="Read receipts" />
                </div>
                <Link to={`/u/${me.username}/style`} className="pro-box-link">
                  <Icon name="sparkle" size={20} />
                  <span className="grow">
                    Profile style
                    <em>Ring colour and profile theme, from your profile</em>
                  </span>
                  <Icon name="right" size={18} />
                </Link>
                <Link to="/accounts/viewers" className="pro-box-link">
                  <Icon name="eye" size={20} />
                  <span className="grow">Profile viewers</span>
                  <Icon name="right" size={18} />
                </Link>
                <button className="pro-box-link" onClick={() => setFonts(true)}>
                  <Icon name="font" size={20} />
                  <span className="grow">
                    App font
                    <em>{appFontById(appFont).name}</em>
                  </span>
                  <Icon name="right" size={18} />
                </button>
                <Link to="/accounts/chat-wallpaper" className="pro-box-link">
                  <Icon name="wallpaper" size={20} />
                  <span className="grow">
                    Chat wallpaper
                    <em>{wallpaperById(chatWallpaper)?.name ?? 'None'}</em>
                  </span>
                  <Icon name="right" size={18} />
                </Link>
                <Link to="/accounts/story-alerts" className="pro-box-link">
                  <Icon name="bell" size={20} />
                  <span className="grow">
                    Story alerts
                    <em>Be told when people you choose watch your stories</em>
                  </span>
                  <Icon name="right" size={18} />
                </Link>
              </div>
            </section>
          ) : null}

          {!isPlus && ticked && tickHidden ? (
            <section className="pro-plus-sec">
              <h2>Your tick</h2>
              <div className="pro-box">
                <div className="pro-box-link static">
                  <Verified size={18} />
                  <span className="grow">Hide my tick</span>
                  <Toggle on={tickHidden} onChange={hideTick} label="Hide my tick" />
                </div>
              </div>
            </section>
          ) : null}

          <section className="pro-plus-sec">
            <h2>What you get</h2>
            <ul className="pro-benefits">
              {BENEFITS.map((b) => (
                <li key={b.title}>
                  <Icon name={b.icon} size={26} stroke={1.6} />
                  <b>{b.title}</b>
                </li>
              ))}
            </ul>
          </section>

          <section className="pro-plus-sec">
            <h2>Explore all benefits</h2>
            <ul className="pro-all">
              {ALL_BENEFITS.map((line) => (
                <li key={line}>
                  <Icon name="check" size={18} stroke={1.8} />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </section>

          {ticked ? null : (
            <Link to="/verify" className="pro-tick-link">
              <Verified size={24} />
              <b className="grow">{pending ? 'Your identity check is being reviewed' : 'Want the blue tick? Verify your identity'}</b>
              <Icon name="right" size={18} />
            </Link>
          )}
        </div>

        <aside className="pro-plus-side">
          {showPlans ? (
            <div className="pro-plan-box">
              <h2>{member ? 'Your plan' : 'Choose a plan'}</h2>
              {config ? (
                <div className="pro-plans" role="radiogroup" aria-label="Plan">
                  <PlanCard title="Monthly" price={money(config.price_pence, config.currency)} sub={currentPlan === 'monthly' ? 'Your plan' : 'a month'} on={plan === 'monthly'} onClick={() => setPlan('monthly')} />
                  <PlanCard title="Yearly" price={money(config.yearly_pence, config.currency)} sub={currentPlan === 'yearly' ? 'Your plan' : `${money(Math.round(config.yearly_pence / 12), config.currency)} a month`} pill={save >= 1 ? `Save ${save}%` : undefined} on={plan === 'yearly'} onClick={() => setPlan('yearly')} />
                </div>
              ) : configError ? null : (
                <Spinner size={24} />
              )}
              {/* The renewal terms of the plan chosen, right above the button that starts it. */}
              {config && !member ? <RenewalTerms pricePence={priceOf(plan)} currency={config.currency} cadence={plan === 'yearly' ? 'year' : 'month'} trialDays={trialOffer ? config.trial_days : 0} /> : null}
              {config && member && plan !== currentPlan ? <RenewalTerms pricePence={priceOf(plan)} currency={config.currency} cadence={plan === 'yearly' ? 'year' : 'month'} freeUntil={billing?.status === 'trialing' ? longDay(billing.current_period_end) : ''} /> : null}
              {config && !member ? payWith(trialOffer ? 'Card for after your free week' : 'Pay with') : null}
              {error ? <Notice kind="warn">{error}</Notice> : configError && !config ? <Notice kind="warn">{errText(configError)}</Notice> : null}
              {button ? (
                <button className="btn block big" disabled={!button.on || !!busy} onClick={button.onClick}>
                  {busy === 'pay' ? 'Processing…' : button.label}
                </button>
              ) : (
                <p className="muted-text small center">You're on this plan. Pick the other one to switch.</p>
              )}
              {config?.test_mode ? <p className="pro-terms center">Test mode — no real money moves.</p> : null}
              <p className="pro-terms center">
                <Icon name="lock" size={12} /> Payments are handled by Stripe. Cancel any time.
              </p>
            </div>
          ) : isPlus && !member && !failed ? (
            <div className="pro-plan-box">
              <h2>You have Plus</h2>
              <p className="muted-text">{me.plus_until ? `Plus is on until ${longDay(me.plus_until)}. It was given to your account, so there is nothing to renew.` : 'Plus is on for your account.'}</p>
            </div>
          ) : null}
        </aside>
      </div>
      {fonts ? (
        <Modal title="App font" onClose={() => setFonts(false)} wide>
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
