import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { confirmPayment, confirmPlatformPayPayment, PlatformPay, PlatformPayButton, type CardFieldInput } from '@stripe/stripe-react-native';
import { fetchSavedCards, settlePayment } from '../lib/api';
import { applePayAvailable, ensureStripe } from '../lib/payments';
import { useSession } from '../lib/session';
import { C, errText } from '../lib/theme';
import type { OneOffPayment, PaymentsConfig, SavedCard } from '../lib/types';
import { CardChip, CardInput, cardTitle, expiryLabel, isExpired } from './CardPreview';
import { Icon } from './Icon';
import { Button, Empty, ErrorNote, Loading, Radio, Sheet } from './ui';

/**
 * Paying a one-off amount (an ad, a gift to a fundraiser, the first month of a subscription to a
 * creator) in the app's own sheet: Apple Pay, a saved
 * card, or a new card typed into Stripe's field. The same approach as the Plus checkout: the server
 * starts the payment, the phone confirms it (Stripe handles 3-D Secure inside the confirm call), then
 * the server is asked to settle it. The webhook settles it too, so a slow settle is not a failure.
 */

/** The "New card" choice. Saved cards use their Stripe id (pm_…). */
const NEW = 'new';

type Failure = { code: string; message: string; localizedMessage?: string };

/** What `start` hands back. `already` means there is nothing left to pay (a subscription that is already on). */
export type PayStart = OneOffPayment & { already?: boolean };

export type PayProps = {
  /** What is being paid for ("Promote for 7 days", "Gift to Choir trip"). */
  title: string;
  /** The total, already formatted ("£14.00"). */
  amountLabel: string;
  /** Starts the payment on the server. Called once per press of Pay, never before. */
  start: () => Promise<PayStart>;
  /** Paid. `slow` is true when the server has not caught up yet: it may take a minute to show. */
  onPaid: (paymentIntentId: string, slow: boolean) => void;
  /**
   * Used instead of settlePayment after confirming, for payments the server reads back another way
   * (a creator subscription is synced, not settled). If it throws, the payment counts as slow.
   */
  onConfirmed?: (paymentIntentId: string) => Promise<void>;
  /** The line on the Apple Pay sheet ("Community ad · 7 days"). Defaults to the title. */
  walletLabel?: string;
  /** Apple Pay button wording: "Buy with" for ads, "Support with" for gifts. */
  wallet?: 'buy' | 'support';
  /** Small print under the Pay button. */
  note?: string;
  /** Told when a payment starts and ends, so whatever holds the panel can refuse to close meanwhile. */
  onBusy?: (busy: boolean) => void;
  /** Shown instead of paying when card payments are off. */
  onClose?: () => void;
};

/**
 * The paying part on its own, for a sheet that has steps of its own before it (the donation sheet).
 * Mount it only while it is showing: each visit starts fresh.
 */
export function PayPanel({ title, amountLabel, start, onPaid, onConfirmed, walletLabel, wallet = 'buy', note, onBusy, onClose }: PayProps) {
  const { profile } = useSession();
  const [config, setConfig] = useState<PaymentsConfig | null>(null);
  const [error, setError] = useState('');
  const [applePay, setApplePay] = useState(false);
  const [cards, setCards] = useState<SavedCard[]>([]);
  const [method, setMethod] = useState<string | null>(null);
  const [card, setCard] = useState<CardFieldInput.Details | null>(null);
  const [busy, setBusy] = useState<'card' | 'apple' | null>(null);
  const [payError, setPayError] = useState('');
  // State updates land a frame late, so a quick double tap could slip past `busy`: the ref cannot.
  const working = useRef(false);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const name = profile?.full_name?.trim() ?? '';

  const load = useCallback(async () => {
    setError('');
    setConfig(null);
    try {
      let c = await ensureStripe();
      // The config is kept from earlier; if payments were off then, they may have been switched on since.
      if (!c.ready) c = await ensureStripe(true);
      if (c.ready) {
        // Apple Pay only: the same button would offer Google Pay on Android, which is not set up.
        const [hasWallet, saved] = await Promise.all([Platform.OS === 'ios' ? applePayAvailable(c) : Promise.resolve(false), fetchSavedCards().catch(() => [] as SavedCard[])]);
        if (!alive.current) return;
        // The default card first: it is the one the member most likely means.
        const sorted = [...saved].sort((a, b) => Number(b.is_default) - Number(a.is_default));
        const usable = sorted.filter((s) => !isExpired(s.exp_month, s.exp_year));
        setApplePay(hasWallet);
        setCards(sorted);
        setMethod(usable[0]?.id ?? NEW);
      }
      if (alive.current) setConfig(c);
    } catch (e) {
      if (alive.current) setError(errText(e));
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  function choose(id: string) {
    if (busy) return;
    // The card field empties when it is hidden, so forget what it held.
    if (id !== NEW) setCard(null);
    setMethod(id);
    setPayError('');
  }

  /** Confirms the payment on the phone. Returns nothing when paid, or why it was not. */
  async function confirm(via: 'apple' | 'card', saved: string | null, p: OneOffPayment): Promise<Failure | undefined> {
    const currency = (p.currency || 'GBP').toUpperCase();
    if (via === 'apple') {
      const amount = (p.amount / 100).toFixed(2);
      const label = walletLabel || title;
      const { error: e } = await confirmPlatformPayPayment(p.client_secret, {
        applePay: {
          // Apple shows the last line as the total, paid to the business named on it.
          cartItems: [
            { label, amount, paymentType: PlatformPay.PaymentType.Immediate },
            { label: 'Community', amount, paymentType: PlatformPay.PaymentType.Immediate },
          ],
          merchantCountryCode: 'GB',
          currencyCode: currency,
        },
      });
      return e;
    }
    if (saved) {
      const { error: e } = await confirmPayment(p.client_secret, { paymentMethodType: 'Card', paymentMethodData: { paymentMethodId: saved } });
      return e;
    }
    const { error: e } = await confirmPayment(p.client_secret, { paymentMethodType: 'Card', paymentMethodData: { billingDetails: name ? { name } : undefined } });
    return e;
  }

  async function pay(via: 'apple' | 'card') {
    if (!config || working.current) return;
    const saved = via === 'card' && method && method !== NEW ? method : null;
    if (via === 'card' && !saved && !card?.complete) return;
    working.current = true;
    setPayError('');
    setBusy(via);
    onBusy?.(true);
    try {
      // A fresh payment for every attempt: the server marks a declined one as failed, and a failed
      // ad would not start even if the same payment went through on a second try.
      const p = await start();
      // Nothing to pay (already subscribed, say): done, without asking the card or Apple Pay.
      if (p?.already) {
        onPaid(p.payment_intent_id || '', false);
        return;
      }
      if (!p?.client_secret || !p.payment_intent_id) throw new Error('The payment could not be started. Try again.');
      const failure = await confirm(via, saved, p);
      if (failure && String(failure.code) === 'Canceled') return; // Closing Apple Pay or the bank's check is not an error.
      if (onConfirmed) {
        // Asked either way, as with settling below: if Stripe's answer was lost but the money moved, this finds it.
        let synced = true;
        try {
          await onConfirmed(p.payment_intent_id);
        } catch {
          synced = false;
        }
        if (failure) {
          if (alive.current) setPayError(failure.localizedMessage || failure.message || 'The payment did not go through. Try again.');
          return;
        }
        onPaid(p.payment_intent_id, !synced);
        return;
      }
      // Ask the server either way: if Stripe's answer was lost on the way back but the money moved,
      // this finds it, rather than asking the member to pay a second time.
      const settled = await settlePayment(p.payment_intent_id).catch(() => null);
      if (failure && settled?.status !== 'succeeded') {
        if (alive.current) setPayError(failure.localizedMessage || failure.message || 'The payment did not go through. Try again.');
        return;
      }
      onPaid(p.payment_intent_id, !settled?.settled);
    } catch (e) {
      if (alive.current) setPayError(errText(e));
    } finally {
      working.current = false;
      if (alive.current) setBusy(null);
      onBusy?.(false);
    }
  }

  if (error) return <ErrorNote message={error} onRetry={load} />;
  if (!config) return <Loading />;
  if (!config.ready) {
    return (
      <Empty
        icon="card"
        title="Card payments aren't switched on yet"
        body="Paying in the app isn't available just yet. Nothing has been charged. Please try again a little later."
        action={onClose ? <Button label="Close" kind="ghost" onPress={onClose} style={{ marginTop: 10, alignSelf: 'stretch' }} /> : undefined}
      />
    );
  }

  const canPay = !busy && !!method && (method !== NEW || !!card?.complete);
  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 20 }}>
      <View style={{ marginHorizontal: 16, padding: 16, borderRadius: 16, backgroundColor: C.surface, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={2} style={{ color: C.fg2, fontSize: 14, lineHeight: 19 }}>{title}</Text>
          <Text style={{ color: C.fg, fontSize: 13, marginTop: 2, fontWeight: '600' }}>Total</Text>
        </View>
        <Text style={{ color: C.fg, fontSize: 26, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{amountLabel}</Text>
      </View>

      {config.test_mode ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 12, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: C.warn, backgroundColor: C.warn + '1f' }}>
          <Icon name="info" size={16} color={C.warn} />
          <Text style={{ flex: 1, color: C.warn, fontSize: 13, lineHeight: 18 }}>Test mode — no real money moves. Use card 4242 4242 4242 4242, any future date, any CVC.</Text>
        </View>
      ) : null}

      <Text accessibilityRole="header" style={{ color: C.fg2, fontSize: 15.5, fontWeight: '700', paddingHorizontal: 16, paddingTop: 20, paddingBottom: 10 }}>Pay with</Text>
      {applePay ? (
        <View style={{ paddingHorizontal: 16, paddingBottom: 14, gap: 14 }}>
          <PlatformPayButton
            type={wallet === 'support' ? PlatformPay.ButtonType.Support : PlatformPay.ButtonType.Buy}
            appearance={C.blurTint === 'light' ? PlatformPay.ButtonStyle.Black : PlatformPay.ButtonStyle.White}
            borderRadius={12}
            disabled={!!busy}
            onPress={() => pay('apple')}
            accessibilityLabel={`Pay ${amountLabel} with Apple Pay`}
            style={{ height: 48, width: '100%' }}
          />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: C.fg3 }} />
            <Text style={{ color: C.fg3, fontSize: 13 }}>or pay by card</Text>
            <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: C.fg3 }} />
          </View>
        </View>
      ) : null}

      <View accessibilityRole="radiogroup" style={{ marginHorizontal: 16, borderRadius: 16, backgroundColor: C.surface, overflow: 'hidden' }}>
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
              {c.is_default ? (
                <View style={{ height: 22, paddingHorizontal: 8, borderRadius: 11, backgroundColor: C.accentSoft, justifyContent: 'center' }}>
                  <Text style={{ color: C.accent2, fontSize: 11.5, fontWeight: '700' }}>Default</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
        <Pressable
          onPress={() => choose(NEW)}
          accessibilityRole="radio"
          accessibilityState={{ checked: method === NEW }}
          accessibilityLabel="Add a new card"
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: cards.length ? 1 : 0, borderTopColor: C.line, backgroundColor: pressed ? C.press : 'transparent' })}>
          <Radio on={method === NEW} />
          <View style={{ width: 46, height: 31, borderRadius: 6, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="plus" size={18} color={C.fg} weight={2.2} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: C.fg, fontSize: 16, fontWeight: '600' }}>Add a new card</Text>
            <Text style={{ color: C.fg2, fontSize: 13.5, marginTop: 1 }}>Credit or debit card</Text>
          </View>
        </Pressable>
      </View>

      {method === NEW ? (
        <View style={{ paddingHorizontal: 16, paddingTop: 14 }}>
          <CardInput onChange={setCard} disabled={!!busy} />
        </View>
      ) : null}

      <View style={{ paddingHorizontal: 16, paddingTop: 18, gap: 12 }}>
        {payError ? (
          <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', gap: 8, padding: 12, borderRadius: 12, backgroundColor: C.like + '1a' }}>
            <Icon name="info" size={18} color={C.like} />
            <Text style={{ flex: 1, color: C.like, fontSize: 14, lineHeight: 19 }}>{payError}</Text>
          </View>
        ) : null}
        <Pressable
          onPress={canPay ? () => pay('card') : undefined}
          accessibilityRole="button"
          accessibilityLabel={`Pay ${amountLabel}`}
          accessibilityState={{ disabled: !canPay, busy: busy === 'card' }}
          style={({ pressed }) => ({ height: 52, borderRadius: 14, backgroundColor: C.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: busy === 'card' ? 1 : !canPay ? 0.45 : pressed ? 0.8 : 1 })}>
          {busy === 'card' ? (
            <ActivityIndicator color={C.onAccent} />
          ) : (
            <>
              <Icon name="lock" size={18} color={C.onAccent} weight={2.2} />
              <Text style={{ color: C.onAccent, fontSize: 16.5, fontWeight: '700' }}>Pay {amountLabel}</Text>
            </>
          )}
        </Pressable>
        <Text style={{ color: C.fg3, fontSize: 12.5, lineHeight: 18, textAlign: 'center' }}>Payments are processed securely by Stripe. Your card details never touch our servers.</Text>
        {note ? <Text style={{ color: C.fg3, fontSize: 12.5, lineHeight: 18, textAlign: 'center' }}>{note}</Text> : null}
      </View>
    </ScrollView>
  );
}

/** PayPanel in a bottom sheet of its own. It cannot be closed while a payment is under way. */
export function PaySheet({ visible, onClose, ...props }: PayProps & { visible: boolean; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  // Hidden mid-payment by the parent (it should not be, but if so) the flag must not stick.
  useEffect(() => { if (!visible) setBusy(false); }, [visible]);
  const close = () => (busy ? undefined : onClose());
  return (
    <Sheet visible={visible} onClose={close} title="Payment" tall>
      {visible ? (
        <View style={{ flex: 1 }}>
          <PayPanel
            {...props}
            onClose={close}
            onBusy={(b) => {
              setBusy(b);
              props.onBusy?.(b);
            }}
          />
        </View>
      ) : null}
    </Sheet>
  );
}
