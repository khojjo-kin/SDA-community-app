import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { confirmPayment, confirmPlatformPayPayment, confirmPlatformPaySetupIntent, confirmSetupIntent, PlatformPay, PlatformPayButton, type CardFieldInput } from '@stripe/stripe-react-native';
import { CardChip, CardInput, CardPreview, cardTitle, expiryLabel, isExpired, PaymentsOff } from '../../src/components/CardPreview';
import { Icon } from '../../src/components/Icon';
import { RenewalTerms } from '../../src/components/RenewalTerms';
import { Button, ErrorNote, Loading, Radio, Screen, ScreenHeader, SectionLabel } from '../../src/components/ui';
import { fetchSavedCards, startSubscription, syncSubscription } from '../../src/lib/api';
import { tap } from '../../src/lib/haptics';
import { type Key, tSplit, useT } from '../../src/lib/i18n';
import { applePayAvailable, ensureStripe, money } from '../../src/lib/payments';
import { useSession } from '../../src/lib/session';
import { C, errText, monthName } from '../../src/lib/theme';
import type { PaymentsConfig, SavedCard } from '../../src/lib/types';

/** The "New card" choice in the list of ways to pay. Saved cards use their Stripe id (pm_…). */
const NEW = 'new';

type Plan = 'monthly' | 'yearly';

type Failure = { code: string; message: string; localizedMessage?: string };

/** How the checkout ended, for the screen that follows it. 'card': a card saved for after the free week. */
type Done = { slow: boolean; kind: 'paid' | 'trial' | 'switched' | 'card'; ends: string | null };

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** "9 November", with the year when it is not this year. */
function longDay(iso: string | Date | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const year = d.getFullYear() === new Date().getFullYear() ? '' : ` ${d.getFullYear()}`;
  return `${d.getDate()} ${monthName(d)}${year}`;
}

const priceOf = (c: PaymentsConfig, plan: Plan) => (plan === 'yearly' ? c.yearly_pence : c.price_pence);
/** The words around a plan's price: "{price} a month" or "{price} a year". */
const perKey = (plan: Plan): Key => (plan === 'yearly' ? 'plus.perYear' : 'plus.perMonth');

/**
 * Paying for Plus, in the app's own screens: Apple Pay, a saved card, or a new card typed into
 * Stripe's field. Opened as /checkout?plan=monthly|yearly. The server starts the subscription and says
 * what to confirm: the first payment, or (for a new member's free week) a SetupIntent that only saves
 * the card for after the week. Stripe takes care of 3-D Secure inside the confirm call. A member who
 * already has Plus and asks for the other plan gets a one-button switch instead. A member in the free
 * week with no card saved for after it gets the same card form, to save one (nothing is charged now).
 */
export default function Checkout() {
  const params = useLocalSearchParams<{ plan?: string; then?: string }>();
  const plan: Plan = params.plan === 'yearly' ? 'yearly' : 'monthly';
  const router = useRouter();
  const { profile, refresh } = useSession();
  const t = useT();
  const [config, setConfig] = useState<PaymentsConfig | null>(null);
  const [error, setError] = useState('');
  const [applePay, setApplePay] = useState(false);
  const [cards, setCards] = useState<SavedCard[]>([]);
  const [method, setMethod] = useState<string | null>(null);
  const [card, setCard] = useState<CardFieldInput.Details | null>(null);
  const [busy, setBusy] = useState<'card' | 'apple' | null>(null);
  const [payError, setPayError] = useState('');
  const [done, setDone] = useState<Done | null>(null);
  // Set when the page offered a free week but the server would charge now (it was used up meanwhile).
  const [noTrial, setNoTrial] = useState(false);
  // State updates land a frame late, so a quick double tap could slip past `busy`: the ref cannot.
  const working = useRef(false);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const load = useCallback(async () => {
    setError('');
    setConfig(null);
    try {
      const c = await ensureStripe(true);
      if (c.ready) {
        // Apple Pay only: the button would offer Google Pay on Android, which is not set up.
        const [wallet, saved] = await Promise.all([Platform.OS === 'ios' ? applePayAvailable(c) : Promise.resolve(false), fetchSavedCards().catch(() => [] as SavedCard[])]);
        if (!alive.current) return;
        const usable = saved.filter((s) => !isExpired(s.exp_month, s.exp_year));
        setApplePay(wallet);
        setCards(saved);
        setMethod((usable.find((s) => s.is_default) ?? usable[0])?.id ?? NEW);
      }
      if (alive.current) setConfig(c);
    } catch (e) {
      if (alive.current) setError(errText(e));
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Started from another screen (e.g. the verification form's "Get Plus to continue")? Go back to it when
  // done, so it carries on from where it was: replacing would stack a second copy of it. Otherwise to Plus.
  const from = typeof params.then === 'string' && params.then.startsWith('/') ? params.then : null;
  const leave = () => {
    if (!from) router.dismissTo('/plus');
    else if (router.canGoBack()) router.back();
    else router.replace(from as any);
  };
  const name = profile?.full_name?.trim() ?? '';
  /** "£4.99 a month" or "£49.99 a year". */
  const cost = (p: Plan, price: string) => t(perKey(p), { price });

  // A renewal that failed is paid at the plan it is on, whatever the link asked for.
  const shownPlan: Plan = config?.status === 'past_due' && config.plan ? config.plan : plan;
  const trialDays = config?.trial_days ?? 0;
  const trial = !!config?.trial_available && trialDays > 0 && !noTrial && config.status !== 'past_due';
  // Worked out at each draw, so the date stays right if the page is left open past midnight.
  const trialEnds = new Date(Date.now() + trialDays * 86400e3);
  // In the free week with no card saved for after it: the card form saves one, and nothing is charged now.
  const addingCard = config?.status === 'trialing' && !!config.needs_card;
  // When the card first gets charged: the end of the free week that is running, or of the one about to start.
  const startsOn = addingCard && config?.current_period_end ? new Date(config.current_period_end) : trialEnds;

  function choose(id: string) {
    if (busy) return;
    // The card field empties when it is hidden, so forget what it held.
    if (id !== NEW) setCard(null);
    setMethod(id);
    setPayError('');
  }

  /** Confirms the subscription's first payment. Returns nothing when paid, or why it was not. */
  async function confirmPay(via: 'apple' | 'card', saved: string | null, secret: string, amount: number, currency: string): Promise<Failure | undefined> {
    if (via === 'apple') {
      const { error: e } = await confirmPlatformPayPayment(secret, {
        applePay: {
          cartItems: [{ label: 'Community Plus', amount: (amount / 100).toFixed(2), paymentType: PlatformPay.PaymentType.Recurring, intervalUnit: shownPlan === 'yearly' ? PlatformPay.IntervalUnit.Year : PlatformPay.IntervalUnit.Month, intervalCount: 1 }],
          merchantCountryCode: 'GB',
          currencyCode: currency,
        },
      });
      return e;
    }
    if (saved) {
      const { error: e } = await confirmPayment(secret, { paymentMethodType: 'Card', paymentMethodData: { paymentMethodId: saved } });
      return e;
    }
    const { error: e } = await confirmPayment(secret, { paymentMethodType: 'Card', paymentMethodData: { billingDetails: name ? { name } : undefined } });
    return e;
  }

  /** The free week: nothing is charged now, the card is only saved for when the week ends. */
  async function confirmSetup(via: 'apple' | 'card', saved: string | null, secret: string, currency: string): Promise<Failure | undefined> {
    if (via === 'apple' && config) {
      const days = config.trial_days || 7;
      const { error: e } = await confirmPlatformPaySetupIntent(secret, {
        applePay: {
          cartItems: [
            // What happens after the free week, so Apple's sheet says it as plainly as this page does.
            { label: t('checkout.applePayFrom', { day: longDay(startsOn) }), amount: (priceOf(config, plan) / 100).toFixed(2), paymentType: PlatformPay.PaymentType.Recurring, intervalUnit: plan === 'yearly' ? PlatformPay.IntervalUnit.Year : PlatformPay.IntervalUnit.Month, intervalCount: 1, startDate: Math.floor(startsOn.getTime() / 1000) },
            // The last line is the total: nothing today.
            { label: addingCard ? t('checkout.applePayFreeUntil', { day: longDay(startsOn) }) : t('checkout.applePayFreeFor', { days }), amount: '0.00', paymentType: PlatformPay.PaymentType.Immediate },
          ],
          merchantCountryCode: 'GB',
          currencyCode: currency,
        },
      });
      return e;
    }
    if (saved) {
      const { error: e } = await confirmSetupIntent(secret, { paymentMethodType: 'Card', paymentMethodData: { paymentMethodId: saved } });
      return e;
    }
    const { error: e } = await confirmSetupIntent(secret, { paymentMethodType: 'Card', paymentMethodData: { billingDetails: name ? { name } : undefined } });
    return e;
  }

  /**
   * Plus is switched on by the server once Stripe agrees; give a slow webhook a few seconds to catch up.
   * A card saved for after the free week counts once Stripe has put it on the subscription.
   */
  async function finish(kind: Done['kind']) {
    const settled = (s: Awaited<ReturnType<typeof syncSubscription>> | null) => !!s?.plus && (kind !== 'card' || !s.needs_card);
    let synced = await syncSubscription().catch(() => null);
    for (let i = 0; i < 3 && !settled(synced); i++) {
      await wait(1500);
      if (!alive.current) return;
      synced = await syncSubscription().catch(() => null);
    }
    await refresh();
    if (alive.current) setDone({ slow: !settled(synced), kind, ends: synced?.current_period_end ?? null });
  }

  function showFailure(failure: Failure) {
    // Closing the Apple Pay sheet or the bank's check is not an error worth showing.
    if (String(failure.code) !== 'Canceled' && alive.current) setPayError(failure.localizedMessage || failure.message || t('checkout.didNotGoThrough'));
  }

  async function pay(via: 'apple' | 'card') {
    if (!config || working.current) return;
    const saved = via === 'card' && method && method !== NEW ? method : null;
    if (via === 'card' && !saved && !card?.complete) return;
    working.current = true;
    tap();
    setPayError('');
    setBusy(via);
    try {
      const r = await startSubscription(saved, plan);
      // The server sends trial_days only when the free week has started.
      const kind: Done['kind'] = addingCard ? 'card' : r.trial_days ? 'trial' : 'paid';
      if (!r.already) {
        if (!r.client_secret) throw new Error(t('checkout.couldNotStart'));
        // Adding a card promises nothing is charged today. If the server would charge (the free week has
        // ended meanwhile), stop and read the subscription again, so the page shows where things stand.
        if (addingCard && r.intent !== 'setup') {
          if (alive.current) {
            setPayError(t('checkout.trialEnded', { amount: money(r.amount ?? priceOf(config, plan), r.currency ?? config.currency) }));
            load();
          }
          return;
        }
        if (r.intent === 'setup') {
          const failure = await confirmSetup(via, saved, r.client_secret, (r.currency ?? config.currency).toUpperCase());
          if (failure) return showFailure(failure);
        } else {
          // This page promised a free week but the server would charge today: stop and say so, so
          // nobody pays who expected not to. Pressing Pay again picks up the same payment.
          if (trial && (r.amount ?? 0) > 0) {
            if (alive.current) {
              setNoTrial(true);
              setPayError(t('checkout.trialUnavailable', { amount: money(r.amount ?? priceOf(config, plan), r.currency ?? config.currency) }));
            }
            return;
          }
          const failure = await confirmPay(via, saved, r.client_secret, r.amount ?? priceOf(config, shownPlan), (r.currency ?? config.currency).toUpperCase());
          if (failure) return showFailure(failure);
        }
      }
      await finish(kind);
    } catch (e) {
      if (alive.current) setPayError(errText(e));
    } finally {
      working.current = false;
      if (alive.current) setBusy(null);
    }
  }

  /** Already a member: move to the other plan. The server swaps the price on the same subscription. */
  async function switchPlan() {
    if (!config || working.current) return;
    working.current = true;
    tap();
    setPayError('');
    setBusy('card');
    try {
      const r = await startSubscription(null, plan);
      // In the free week with no card yet: the plan has switched, and the card form comes next.
      if (r.intent === 'setup' && r.client_secret) {
        if (alive.current) {
          setConfig((c) => (c ? { ...c, plan, needs_card: true } : c));
        }
        refresh().catch(() => {});
        return;
      }
      // Only an unpaid renewal comes back with something to pay: that has to be settled first.
      if (!r.already) throw new Error(t('checkout.payRenewalFirst'));
      await finish('switched');
    } catch (e) {
      if (alive.current) setPayError(errText(e));
    } finally {
      working.current = false;
      if (alive.current) setBusy(null);
    }
  }

  let body: React.ReactNode;
  if (error) body = <ErrorNote message={error} onRetry={load} />;
  else if (!config) body = <Loading />;
  else if (!config.ready) body = <PaymentsOff onBack={leave} />;
  else if (done) body = <Welcome done={done} plan={plan} onDone={leave} />;
  // A member in the free week without a card, on the plan asked for, gets the card form below instead.
  else if ((config.status === 'active' || config.status === 'trialing') && !(addingCard && (config.plan ?? 'monthly') === plan)) {
    // Subscriptions from before the yearly plan have no plan recorded: they are monthly.
    const current: Plan = config.plan ?? 'monthly';
    const day = longDay(config.current_period_end);
    if (current !== plan) {
      const price = money(priceOf(config, plan), config.currency);
      const was = money(priceOf(config, current), config.currency);
      // The price drawn large, wherever the language puts it among its words.
      const [perBefore, perAfter] = tSplit(perKey(plan), 'price');
      const switchTo = plan === 'yearly' ? t('plus.switchToYearly') : t('plus.switchToMonthly');
      body = (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 6, paddingBottom: 40, gap: 14 }}>
          <View style={{ padding: 18, borderRadius: 18, backgroundColor: C.surface, borderWidth: 1, borderColor: C.accent + '59', gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <PlusBadge size={34} />
              <Text style={{ flex: 1, color: C.fg, fontSize: 18, fontWeight: '800' }}>{switchTo}</Text>
            </View>
            <Text style={{ color: C.fg, fontSize: 15.5 }}>
              {perBefore}<Text style={{ fontSize: 26, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{price}</Text>{perAfter}
            </Text>
            <Text style={{ color: C.fg2, fontSize: 14.5, lineHeight: 20 }}>{t('checkout.insteadOf', { cost: cost(current, was) })}</Text>
          </View>
          {payError ? <PayError message={payError} /> : null}
          <Button label={switchTo} busy={!!busy} onPress={switchPlan} />
          <RenewalTerms kind="plus" pricePence={priceOf(config, plan)} currency={config.currency} cadence={plan === 'yearly' ? 'year' : 'month'} freeUntil={config.status === 'trialing' ? day : ''} />
        </ScrollView>
      );
    } else {
      body = (
        <View style={{ alignItems: 'center', paddingHorizontal: 32, paddingTop: 40, gap: 10 }}>
          <PlusBadge size={92} />
          <Text accessibilityRole="header" style={{ color: C.fg, fontSize: 22, fontWeight: '800', textAlign: 'center' }}>{t('checkout.alreadyMember')}</Text>
          <Button label={from ? t('checkout.done') : t('checkout.goToPlus')} onPress={leave} style={{ alignSelf: 'stretch', marginTop: 14 }} />
        </View>
      );
    }
  } else {
    const price = money(priceOf(config, shownPlan), config.currency);
    // "£4.99 a month", and the words around the price for when it is drawn large.
    const per = cost(shownPlan, price);
    const [perBefore, perAfter] = tSplit(perKey(shownPlan), 'price');
    const ends = longDay(startsOn);
    const canPay = !busy && !!method && (method !== NEW || !!card?.complete);
    const payLabel = addingCard ? t('checkout.saveCard') : trial ? t('checkout.startFreeWeek') : t('checkout.pay', { price });
    // Nothing is charged today: a new free week, or a card saved for after the one running.
    const freeNow = trial || addingCard;
    // How it renews and where to cancel, next to each button that starts it (Apple Pay, and Pay).
    const terms = <RenewalTerms kind="plus" pricePence={priceOf(config, shownPlan)} currency={config.currency} cadence={shownPlan === 'yearly' ? 'year' : 'month'} trialDays={trial ? trialDays : 0} freeUntil={addingCard ? ends : ''} />;
    body = (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: 6, paddingBottom: 40 }}>
          {config.test_mode ? (
            <Notice color={C.warn} icon="info">{t('checkout.testMode')}</Notice>
          ) : null}
          {config.status === 'past_due' ? <Notice color={C.like} icon="info">{t('checkout.renewalFailed')}</Notice> : null}

          <View style={{ marginHorizontal: 16, padding: 18, borderRadius: 18, backgroundColor: C.surface, borderWidth: 1, borderColor: C.accent + '59', gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <PlusBadge size={30} />
              <Text style={{ flex: 1, color: C.fg, fontSize: 18, fontWeight: '800' }}>{t('common.communityPlus')}</Text>
              <View style={{ height: 24, paddingHorizontal: 10, borderRadius: 12, backgroundColor: C.accentSoft, justifyContent: 'center' }}>
                <Text style={{ color: C.accent2, fontSize: 12.5, fontWeight: '700' }}>{shownPlan === 'yearly' ? t('plus.yearly') : t('plus.monthly')}</Text>
              </View>
            </View>
            {trial ? (
              <View style={{ gap: 4 }}>
                <Text style={{ color: C.fg, fontSize: 26, fontWeight: '800' }}>{t('checkout.freeForDays', { days: trialDays })}</Text>
                <Text style={{ color: C.fg, fontSize: 15.5 }}>{t('checkout.then', { cost: per })}</Text>
              </View>
            ) : addingCard ? (
              <View style={{ gap: 4 }}>
                <Text style={{ color: C.fg, fontSize: 26, fontWeight: '800' }}>{t('checkout.freeUntil', { day: ends })}</Text>
                <Text style={{ color: C.fg, fontSize: 15.5 }}>{t('checkout.then', { cost: per })}</Text>
              </View>
            ) : (
              <Text style={{ color: C.fg, fontSize: 15.5 }}>
                {perBefore}<Text style={{ fontSize: 26, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{price}</Text>{perAfter}
              </Text>
            )}
          </View>

          <SectionLabel>{freeNow ? t('checkout.cardForAfter') : t('checkout.payWith')}</SectionLabel>
          {applePay ? (
            <View style={{ paddingHorizontal: 16, paddingBottom: 14, gap: 14 }}>
              <PlatformPayButton
                type={PlatformPay.ButtonType.Subscribe}
                appearance={C.blurTint === 'light' ? PlatformPay.ButtonStyle.Black : PlatformPay.ButtonStyle.White}
                borderRadius={12}
                disabled={!!busy}
                onPress={() => pay('apple')}
                accessibilityLabel={addingCard ? t('checkout.applePayCard', { cost: per, day: ends }) : trial ? t('checkout.applePayTrial', { cost: per }) : t('checkout.applePaySubscribe', { cost: per })}
                style={{ height: 48, width: '100%' }}
              />
              {terms}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: C.fg3 }} />
                <Text style={{ color: C.fg3, fontSize: 13 }}>{t('checkout.orCard')}</Text>
                <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: C.fg3 }} />
              </View>
            </View>
          ) : null}

          <View accessibilityRole="radiogroup" style={{ marginHorizontal: 16, borderRadius: 18, backgroundColor: C.surface, overflow: 'hidden' }}>
            {cards.map((c, i) => {
              const exp = expiryLabel(c.exp_month, c.exp_year);
              const expired = isExpired(c.exp_month, c.exp_year);
              const on = method === c.id;
              return (
                <Pressable
                  key={c.id}
                  onPress={expired ? undefined : () => choose(c.id)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on, disabled: expired }}
                  accessibilityLabel={`${cardTitle(c)}, ${expired ? t('checkout.expired', { date: exp }) : t('checkout.expires', { date: exp })}${c.is_default ? `, ${t('checkout.defaultCard')}` : ''}`}
                  style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: C.line, opacity: expired ? 0.5 : 1, backgroundColor: pressed && !expired ? C.press : 'transparent' })}>
                  <Radio on={on} />
                  <CardChip brand={c.brand} />
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={{ color: C.fg, fontSize: 16, fontWeight: '600' }}>{cardTitle(c)}</Text>
                    <Text style={{ color: expired ? C.like : C.fg2, fontSize: 13.5, marginTop: 1 }}>{expired ? t('checkout.expired', { date: exp }) : t('checkout.expires', { date: exp })}</Text>
                  </View>
                  {c.is_default ? <DefaultPill /> : null}
                </Pressable>
              );
            })}
            <Pressable
              onPress={() => choose(NEW)}
              accessibilityRole="radio"
              accessibilityState={{ checked: method === NEW }}
              accessibilityLabel={t('checkout.newCardLabel')}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: cards.length ? 1 : 0, borderTopColor: C.line, backgroundColor: pressed ? C.press : 'transparent' })}>
              <Radio on={method === NEW} />
              <View style={{ width: 46, height: 31, borderRadius: 6, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="plus" size={18} color={C.fg} weight={2.2} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.fg, fontSize: 16, fontWeight: '600' }}>{t('checkout.newCard')}</Text>
                <Text style={{ color: C.fg2, fontSize: 13.5, marginTop: 1 }}>{t('checkout.creditOrDebit')}</Text>
              </View>
            </Pressable>
          </View>

          {method === NEW ? (
            <View style={{ paddingHorizontal: 16, paddingTop: 18, gap: 14 }}>
              <CardPreview brand={card?.brand} last4={card?.last4} expMonth={card?.expiryMonth} expYear={card?.expiryYear} name={name} />
              <CardInput onChange={setCard} disabled={!!busy} />
            </View>
          ) : null}

          <View style={{ paddingHorizontal: 16, paddingTop: 22, gap: 12 }}>
            {payError ? <PayError message={payError} /> : null}
            <Pressable
              onPress={canPay ? () => pay('card') : undefined}
              accessibilityRole="button"
              accessibilityLabel={payLabel}
              accessibilityState={{ disabled: !canPay, busy: busy === 'card' }}
              style={({ pressed }) => ({ height: 52, borderRadius: 14, backgroundColor: C.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: busy === 'card' ? 1 : !canPay ? 0.45 : pressed ? 0.8 : 1 })}>
              {busy === 'card' ? (
                <ActivityIndicator color={C.onAccent} />
              ) : (
                <>
                  <Icon name="lock" size={18} color={C.onAccent} weight={2.2} />
                  <Text style={{ color: C.onAccent, fontSize: 16.5, fontWeight: '700' }}>{payLabel}</Text>
                </>
              )}
            </Pressable>
            {terms}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <Screen>
      <ScreenHeader title={t('checkout.title')} />
      {body}
    </Screen>
  );
}

/** Plus's crown in a soft green circle. */
function PlusBadge({ size }: { size: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name="crown" size={Math.round(size * 0.55)} color={C.accent2} />
    </View>
  );
}

function PayError({ message }: { message: string }) {
  return (
    <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', gap: 8, padding: 12, borderRadius: 12, backgroundColor: C.like + '1a' }}>
      <Icon name="info" size={18} color={C.like} />
      <Text style={{ flex: 1, color: C.like, fontSize: 14, lineHeight: 19 }}>{message}</Text>
    </View>
  );
}

function Notice({ color, icon, children }: { color: string; icon: 'info'; children: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 12, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: color, backgroundColor: color + '1f' }}>
      <Icon name={icon} size={16} color={color} />
      <Text style={{ flex: 1, color, fontSize: 13, lineHeight: 18 }}>{children}</Text>
    </View>
  );
}

function DefaultPill() {
  const t = useT();
  return (
    <View style={{ height: 22, paddingHorizontal: 8, borderRadius: 11, backgroundColor: C.accentSoft, justifyContent: 'center' }}>
      <Text style={{ color: C.accent2, fontSize: 11.5, fontWeight: '700' }}>{t('checkout.default')}</Text>
    </View>
  );
}

/** Shown in place of the checkout once Plus is paid for, the free week has started, or the plan has changed. */
function Welcome({ done, plan, onDone }: { done: Done; plan: Plan; onDone: () => void }) {
  const t = useT();
  const pop = useRef(new Animated.Value(0.6)).current;
  useEffect(() => {
    tap('success');
    Animated.spring(pop, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }).start();
  }, [pop]);
  const title = done.kind === 'trial' ? t('checkout.trialStarted') : done.kind === 'switched' ? t(plan === 'yearly' ? 'checkout.onYearly' : 'checkout.onMonthly') : done.kind === 'card' ? t('checkout.cardSaved') : t('checkout.welcome');
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingBottom: 60, gap: 10 }}>
      <Animated.View style={{ transform: [{ scale: pop }] }}>
        <PlusBadge size={128} />
      </Animated.View>
      <Text accessibilityRole="header" style={{ color: C.fg, fontSize: 26, fontWeight: '800', marginTop: 8, textAlign: 'center' }}>{title}</Text>
      <Button label={t('checkout.done')} onPress={onDone} style={{ alignSelf: 'stretch', marginTop: 18 }} />
    </View>
  );
}
