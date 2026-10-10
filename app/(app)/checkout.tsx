import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { confirmPayment, confirmPlatformPayPayment, PlatformPay, PlatformPayButton, type CardFieldInput } from '@stripe/stripe-react-native';
import { CardChip, CardInput, CardPreview, cardTitle, expiryLabel, isExpired, PaymentsOff } from '../../src/components/CardPreview';
import { Icon, VerifiedTick } from '../../src/components/Icon';
import { Button, ErrorNote, Loading, Radio, Screen, ScreenHeader, SectionLabel, Toggle } from '../../src/components/ui';
import { fetchSavedCards, startSubscription, syncSubscription } from '../../src/lib/api';
import { applePayAvailable, ensureStripe, money } from '../../src/lib/payments';
import { useSession } from '../../src/lib/session';
import { C, errText, monthName } from '../../src/lib/theme';
import type { PaymentsConfig, SavedCard } from '../../src/lib/types';

/** The "New card" choice in the list of ways to pay. Saved cards use their Stripe id (pm_…). */
const NEW = 'new';

const PERKS = ['Your own ring colour and profile theme', 'See who viewed your profile', 'App fonts, chat wallpapers and more'];

type Failure = { code: string; message: string; localizedMessage?: string };

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** "9 November", with the year when it is not this year. */
function longDay(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const year = d.getFullYear() === new Date().getFullYear() ? '' : ` ${d.getFullYear()}`;
  return `${d.getDate()} ${monthName(d)}${year}`;
}

/**
 * Paying for Plus, in the app's own screens: Apple Pay, a saved card, or a new card typed into
 * Stripe's field. The server starts the subscription and hands back its first payment to confirm here;
 * Stripe takes care of 3-D Secure inside the confirm call.
 */
export default function Checkout() {
  const router = useRouter();
  const { profile, refresh } = useSession();
  const [config, setConfig] = useState<PaymentsConfig | null>(null);
  const [error, setError] = useState('');
  const [applePay, setApplePay] = useState(false);
  const [cards, setCards] = useState<SavedCard[]>([]);
  const [method, setMethod] = useState<string | null>(null);
  const [card, setCard] = useState<CardFieldInput.Details | null>(null);
  const [busy, setBusy] = useState<'card' | 'apple' | null>(null);
  const [payError, setPayError] = useState('');
  const [done, setDone] = useState<{ slow: boolean } | null>(null);
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

  const toPlus = () => router.dismissTo('/plus');
  const name = profile?.full_name?.trim() ?? '';

  function choose(id: string) {
    if (busy) return;
    // The card field empties when it is hidden, so forget what it held.
    if (id !== NEW) setCard(null);
    setMethod(id);
    setPayError('');
  }

  /** Confirms the subscription's first payment. Returns nothing when paid, or why it was not. */
  async function confirm(via: 'apple' | 'card', saved: string | null, secret: string, amount: number, currency: string): Promise<Failure | undefined> {
    if (via === 'apple') {
      const { error: e } = await confirmPlatformPayPayment(secret, {
        applePay: {
          cartItems: [{ label: 'Community Plus', amount: (amount / 100).toFixed(2), paymentType: PlatformPay.PaymentType.Recurring, intervalUnit: PlatformPay.IntervalUnit.Month, intervalCount: 1 }],
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

  /** Plus is switched on by the server once Stripe agrees; give a slow webhook a few seconds to catch up. */
  async function finish() {
    let synced = await syncSubscription().catch(() => null);
    for (let i = 0; i < 3 && !synced?.plus; i++) {
      await wait(1500);
      if (!alive.current) return;
      synced = await syncSubscription().catch(() => null);
    }
    await refresh();
    if (alive.current) setDone({ slow: !synced?.plus });
  }

  async function pay(via: 'apple' | 'card') {
    if (!config || busy) return;
    const saved = via === 'card' && method && method !== NEW ? method : null;
    if (via === 'card' && !saved && !card?.complete) return;
    setPayError('');
    setBusy(via);
    try {
      const r = await startSubscription(saved);
      if (!r.already) {
        if (!r.client_secret) throw new Error('The payment could not be started. Try again.');
        const failure = await confirm(via, saved, r.client_secret, r.amount ?? config.price_pence, (r.currency ?? config.currency).toUpperCase());
        if (failure) {
          // Closing the Apple Pay sheet or the bank's check is not an error worth showing.
          if (String(failure.code) !== 'Canceled' && alive.current) setPayError(failure.localizedMessage || failure.message || 'The payment did not go through. Try again.');
          return;
        }
      }
      await finish();
    } catch (e) {
      if (alive.current) setPayError(errText(e));
    } finally {
      if (alive.current) setBusy(null);
    }
  }

  let body: React.ReactNode;
  if (error) body = <ErrorNote message={error} onRetry={load} />;
  else if (!config) body = <Loading />;
  else if (!config.ready) body = <PaymentsOff onBack={toPlus} />;
  else if (done) body = <Welcome slow={done.slow} onDone={toPlus} />;
  else if (config.status === 'active' || config.status === 'trialing') {
    const day = longDay(config.current_period_end);
    body = (
      <View style={{ alignItems: 'center', paddingHorizontal: 32, paddingTop: 40, gap: 10 }}>
        <View style={{ width: 92, height: 92, borderRadius: 46, backgroundColor: C.verified + '24', alignItems: 'center', justifyContent: 'center' }}>
          <VerifiedTick size={52} />
        </View>
        <Text accessibilityRole="header" style={{ color: C.fg, fontSize: 22, fontWeight: '800', textAlign: 'center' }}>You're already a member</Text>
        <Text style={{ color: C.fg2, textAlign: 'center', lineHeight: 21 }}>
          {config.cancel_at_period_end ? `Plus is set to end on ${day}. Resume it from the Plus page to keep it going.` : day ? `Plus renews on ${day}. Thank you for supporting the community.` : 'Thank you for supporting the community.'}
        </Text>
        <Button label="Go to Plus" onPress={toPlus} style={{ alignSelf: 'stretch', marginTop: 14 }} />
      </View>
    );
  } else {
    const price = money(config.price_pence, config.currency);
    const canPay = !busy && !!method && (method !== NEW || !!card?.complete);
    body = (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: 6, paddingBottom: 40 }}>
          {config.test_mode ? (
            <Notice color={C.warn} icon="info">Test mode — no real money moves. Use card 4242 4242 4242 4242, any future date, any CVC.</Notice>
          ) : null}
          {config.status === 'past_due' ? <Notice color={C.like} icon="info">Your last renewal did not go through. Pay now to keep Plus.</Notice> : null}

          <View style={{ marginHorizontal: 16, padding: 18, borderRadius: 18, backgroundColor: C.surface, borderWidth: 1, borderColor: C.accent + '59', gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <VerifiedTick size={26} />
              <Text style={{ flex: 1, color: C.fg, fontSize: 18, fontWeight: '800' }}>Community Plus</Text>
            </View>
            <Text style={{ color: C.fg, fontSize: 15.5 }}>
              <Text style={{ fontSize: 26, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{price}</Text> a month
            </Text>
            <View style={{ gap: 8 }}>
              {PERKS.map((p) => (
                <View key={p} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Icon name="check" size={18} color={C.accent2} weight={2.4} />
                  <Text style={{ flex: 1, color: C.fg2, fontSize: 14.5 }}>{p}</Text>
                </View>
              ))}
            </View>
            <Text style={{ color: C.fg3, fontSize: 13 }}>Cancel any time · renews monthly</Text>
          </View>

          <SectionLabel>Pay with</SectionLabel>
          {applePay ? (
            <View style={{ paddingHorizontal: 16, paddingBottom: 14, gap: 14 }}>
              <PlatformPayButton
                type={PlatformPay.ButtonType.Subscribe}
                appearance={C.blurTint === 'light' ? PlatformPay.ButtonStyle.Black : PlatformPay.ButtonStyle.White}
                borderRadius={12}
                disabled={!!busy}
                onPress={() => pay('apple')}
                accessibilityLabel={`Subscribe with Apple Pay, ${price} a month`}
                style={{ height: 48, width: '100%' }}
              />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: C.fg3 }} />
                <Text style={{ color: C.fg3, fontSize: 13 }}>or pay by card</Text>
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
                  accessibilityLabel={`${cardTitle(c)}, ${expired ? 'expired' : 'expires'} ${exp}${c.is_default ? ', default card' : ''}`}
                  style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: C.line, opacity: expired ? 0.5 : 1, backgroundColor: pressed && !expired ? C.press : 'transparent' })}>
                  <Radio on={on} />
                  <CardChip brand={c.brand} />
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={{ color: C.fg, fontSize: 16, fontWeight: '600' }}>{cardTitle(c)}</Text>
                    <Text style={{ color: expired ? C.like : C.fg2, fontSize: 13.5, marginTop: 1 }}>{expired ? `Expired ${exp}` : `Expires ${exp}`}</Text>
                  </View>
                  {c.is_default ? <DefaultPill /> : null}
                </Pressable>
              );
            })}
            <Pressable
              onPress={() => choose(NEW)}
              accessibilityRole="radio"
              accessibilityState={{ checked: method === NEW }}
              accessibilityLabel="New credit or debit card"
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: cards.length ? 1 : 0, borderTopColor: C.line, backgroundColor: pressed ? C.press : 'transparent' })}>
              <Radio on={method === NEW} />
              <View style={{ width: 46, height: 31, borderRadius: 6, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="plus" size={18} color={C.fg} weight={2.2} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.fg, fontSize: 16, fontWeight: '600' }}>New card</Text>
                <Text style={{ color: C.fg2, fontSize: 13.5, marginTop: 1 }}>Credit or debit card</Text>
              </View>
            </Pressable>
          </View>

          {method === NEW ? (
            <View style={{ paddingHorizontal: 16, paddingTop: 18, gap: 14 }}>
              <CardPreview brand={card?.brand} last4={card?.last4} expMonth={card?.expiryMonth} expYear={card?.expiryYear} name={name} />
              <CardInput onChange={setCard} disabled={!!busy} />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 14, backgroundColor: C.surface }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.fg, fontSize: 15.5, fontWeight: '600' }}>Keep this card on file for renewals</Text>
                  <Text style={{ color: C.fg2, fontSize: 13.5, lineHeight: 18, marginTop: 2 }}>Plus renews each month with this card. Change or remove it any time in Payment methods.</Text>
                </View>
                <Toggle value onChange={() => {}} disabled label="Keep this card on file for renewals" />
              </View>
            </View>
          ) : null}

          <View style={{ paddingHorizontal: 16, paddingTop: 22, gap: 12 }}>
            {payError ? (
              <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', gap: 8, padding: 12, borderRadius: 12, backgroundColor: C.like + '1a' }}>
                <Icon name="info" size={18} color={C.like} />
                <Text style={{ flex: 1, color: C.like, fontSize: 14, lineHeight: 19 }}>{payError}</Text>
              </View>
            ) : null}
            <Pressable
              onPress={canPay ? () => pay('card') : undefined}
              accessibilityRole="button"
              accessibilityLabel={`Pay ${price}`}
              accessibilityState={{ disabled: !canPay, busy: busy === 'card' }}
              style={({ pressed }) => ({ height: 52, borderRadius: 14, backgroundColor: C.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: busy === 'card' ? 1 : !canPay ? 0.45 : pressed ? 0.8 : 1 })}>
              {busy === 'card' ? (
                <ActivityIndicator color={C.onAccent} />
              ) : (
                <>
                  <Icon name="lock" size={18} color={C.onAccent} weight={2.2} />
                  <Text style={{ color: C.onAccent, fontSize: 16.5, fontWeight: '700' }}>Pay {price}</Text>
                </>
              )}
            </Pressable>
            <Text style={{ color: C.fg3, fontSize: 12.5, lineHeight: 18, textAlign: 'center' }}>
              Payments are processed securely by Stripe. Your card details never touch our servers.
            </Text>
            <Text style={{ color: C.fg3, fontSize: 12.5, lineHeight: 18, textAlign: 'center' }}>
              Plus renews at {price} a month until you cancel. Cancel any time from the Plus page.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <Screen>
      <ScreenHeader title="Checkout" />
      {body}
    </Screen>
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
  return (
    <View style={{ height: 22, paddingHorizontal: 8, borderRadius: 11, backgroundColor: C.accentSoft, justifyContent: 'center' }}>
      <Text style={{ color: C.accent2, fontSize: 11.5, fontWeight: '700' }}>Default</Text>
    </View>
  );
}

/** Shown in place of the checkout once Plus is paid for. */
function Welcome({ slow, onDone }: { slow: boolean; onDone: () => void }) {
  const pop = useRef(new Animated.Value(0.6)).current;
  useEffect(() => {
    Animated.spring(pop, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }).start();
  }, [pop]);
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingBottom: 60, gap: 10 }}>
      <Animated.View style={{ width: 128, height: 128, borderRadius: 64, backgroundColor: C.verified + '24', alignItems: 'center', justifyContent: 'center', transform: [{ scale: pop }] }}>
        <VerifiedTick size={76} />
      </Animated.View>
      <Text accessibilityRole="header" style={{ color: C.fg, fontSize: 26, fontWeight: '800', marginTop: 8 }}>Welcome to Plus</Text>
      <Text style={{ color: C.fg2, fontSize: 16, textAlign: 'center', lineHeight: 22 }}>Your tick and every Plus feature are on.</Text>
      {slow ? <Text style={{ color: C.fg3, textAlign: 'center', lineHeight: 20 }}>It can take a minute for everything to switch on.</Text> : null}
      <Button label="Done" onPress={onDone} style={{ alignSelf: 'stretch', marginTop: 18 }} />
    </View>
  );
}
