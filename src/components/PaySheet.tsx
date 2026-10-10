import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { confirmPayment, confirmPlatformPayPayment, confirmPlatformPaySetupIntent, confirmSetupIntent, PlatformPay, PlatformPayButton, type CardFieldInput } from '@stripe/stripe-react-native';
import { fetchSavedCards, settlePayment } from '../lib/api';
import { tap } from '../lib/haptics';
// Plain t(): every screen is drawn again from the root when the language changes. The card and
// payment lines are shared with the Plus checkout (checkout.*).
import { t } from '../lib/i18n';
import { applePayAvailable, ensureStripe } from '../lib/payments';
import { useSession } from '../lib/session';
import { C, errText } from '../lib/theme';
import type { OneOffPayment, PaymentsConfig, SavedCard } from '../lib/types';
import { CardChip, CardInput, cardTitle, expiryLabel, isExpired } from './CardPreview';
import { Icon } from './Icon';
import { Button, Empty, ErrorNote, Loading, Radio, Sheet, useToast } from './ui';

/**
 * Paying in the app's own sheet (an ad, a gift to a fundraiser, a subscription to a creator or to
 * Plus): Apple Pay, a saved card, or a new card typed into Stripe's field. The server starts the
 * payment, the phone confirms it (Stripe handles 3-D Secure inside the confirm call), then the server
 * is asked to settle it. The webhook settles it too, so a slow settle is not a failure.
 *
 * useInstantPay starts paying from a single button, the way a subscribe button should: Apple Pay's
 * own sheet straight away when the phone has it, otherwise this sheet with the saved cards.
 */

/** The "New card" choice. Saved cards use their Stripe id (pm_…). */
const NEW = 'new';

type Failure = { code: string; message: string; localizedMessage?: string };

/**
 * What `start` hands back. `already` means there is nothing left to pay (a subscription that is
 * already on). `intent: 'setup'` is a card saved for later with nothing charged now (Plus's free week).
 */
export type PayStart = OneOffPayment & { already?: boolean; intent?: 'payment' | 'setup' };

export type PayProps = {
  /** What is being paid for ("Promote for 7 days", "Gift to Choir trip"). */
  title: string;
  /** The total, already formatted ("£14.00"). */
  amountLabel: string;
  /** Starts the payment on the server, with the saved card chosen (if any). Called once per press of Pay, never before. */
  start: (savedCardId: string | null) => Promise<PayStart>;
  /** Paid. `slow` is true when the server has not caught up yet: it may take a minute to show. */
  onPaid: (paymentIntentId: string, slow: boolean) => void;
  /**
   * Used instead of settlePayment after confirming, for payments the server reads back another way
   * (a subscription is synced, not settled). If it throws, the payment counts as slow.
   */
  onConfirmed?: (paymentIntentId: string) => Promise<void>;
  /** The line on the Apple Pay sheet ("Community ad · 7 days"). Defaults to the title. */
  walletLabel?: string;
  /** Apple Pay's lines for a payment, when one line won't do (a subscription that recurs). The last is the total. */
  walletItems?: (p: PayStart) => PlatformPay.CartSummaryItem[];
  /** Apple Pay button wording: "Buy with" for ads, "Support with" for gifts, "Subscribe with". */
  wallet?: 'buy' | 'support' | 'subscribe';
  /** The Pay button's words, when "Pay £x" isn't right (a free week that only saves a card). */
  payLabel?: string;
  /** Small print under the Pay button. */
  note?: string;
  /** Drawn under the note, such as a subscription's renewal terms (RenewalTerms). */
  footer?: React.ReactNode;
  /** Told when a payment starts and ends, so whatever holds the panel can refuse to close meanwhile. */
  onBusy?: (busy: boolean) => void;
  /** Shown instead of paying when card payments are off. */
  onClose?: () => void;
};

type Outcome = { kind: 'paid'; id: string; slow: boolean } | { kind: 'cancelled' } | { kind: 'failed'; message: string };

/** Confirms the payment (or the card saved for later) on the phone. Returns nothing when done, or why it was not. */
async function confirmOnPhone(via: 'apple' | 'card', saved: string | null, p: PayStart, props: PayProps, name: string): Promise<Failure | undefined> {
  const currency = (p.currency || 'GBP').toUpperCase();
  const setup = p.intent === 'setup';
  if (via === 'apple') {
    const amount = (p.amount / 100).toFixed(2);
    const label = props.walletLabel || props.title;
    const applePay = {
      // Apple shows the last line as the total, paid to the business named on it.
      cartItems: props.walletItems?.(p) ?? [
        { label, amount, paymentType: PlatformPay.PaymentType.Immediate },
        { label: 'Community', amount, paymentType: PlatformPay.PaymentType.Immediate },
      ],
      merchantCountryCode: 'GB',
      currencyCode: currency,
    };
    const { error: e } = setup ? await confirmPlatformPaySetupIntent(p.client_secret, { applePay }) : await confirmPlatformPayPayment(p.client_secret, { applePay });
    return e;
  }
  const paymentMethodData = saved ? { paymentMethodId: saved } : { billingDetails: name ? { name } : undefined };
  const { error: e } = setup ? await confirmSetupIntent(p.client_secret, { paymentMethodType: 'Card', paymentMethodData }) : await confirmPayment(p.client_secret, { paymentMethodType: 'Card', paymentMethodData });
  return e;
}

/** One go at paying: start it on the server, confirm it on the phone, then have the server catch up. */
async function payOnce(via: 'apple' | 'card', saved: string | null, props: PayProps, name: string): Promise<Outcome> {
  // A fresh payment for every attempt: the server marks a declined one as failed, and a failed
  // ad would not start even if the same payment went through on a second try.
  const p = await props.start(saved);
  // Nothing to pay (already subscribed, say): done, without asking the card or Apple Pay.
  if (p?.already) return { kind: 'paid', id: p.payment_intent_id || '', slow: false };
  if (!p?.client_secret) throw new Error(t('checkout.couldNotStart'));
  const id = p.payment_intent_id || p.client_secret.split('_secret_')[0];
  const failure = await confirmOnPhone(via, saved, p, props, name);
  // Closing Apple Pay or the bank's check is not an error.
  if (failure && String(failure.code) === 'Canceled') return { kind: 'cancelled' };
  const failed = (f: Failure): Outcome => ({ kind: 'failed', message: f.localizedMessage || f.message || t('checkout.didNotGoThrough') });
  if (props.onConfirmed) {
    // Asked either way, as with settling below: if Stripe's answer was lost but the money moved, this finds it.
    let synced = true;
    try {
      await props.onConfirmed(id);
    } catch {
      synced = false;
    }
    if (failure) return failed(failure);
    return { kind: 'paid', id, slow: !synced };
  }
  // Ask the server either way: if Stripe's answer was lost on the way back but the money moved,
  // this finds it, rather than asking the member to pay a second time.
  const settled = await settlePayment(id).catch(() => null);
  if (failure && settled?.status !== 'succeeded') return failed(failure);
  return { kind: 'paid', id, slow: !settled?.settled };
}

/**
 * The paying part on its own, for a sheet that has steps of its own before it (the donation sheet).
 * Mount it only while it is showing: each visit starts fresh.
 */
export function PayPanel(props: PayProps) {
  const { title, amountLabel, onPaid, wallet = 'buy', note, footer, onBusy, onClose } = props;
  const payWords = props.payLabel || t('checkout.pay', { price: amountLabel });
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
    if (busy || id === method) return;
    tap('select');
    // The card field empties when it is hidden, so forget what it held.
    if (id !== NEW) setCard(null);
    setMethod(id);
    setPayError('');
  }

  async function pay(via: 'apple' | 'card') {
    if (!config || working.current) return;
    const saved = via === 'card' && method && method !== NEW ? method : null;
    if (via === 'card' && !saved && !card?.complete) return;
    working.current = true;
    tap('medium');
    setPayError('');
    setBusy(via);
    onBusy?.(true);
    try {
      const r = await payOnce(via, saved, props, name);
      if (r.kind === 'paid') onPaid(r.id, r.slow);
      else if (r.kind === 'failed' && alive.current) {
        tap('warning');
        setPayError(r.message);
      }
    } catch (e) {
      if (alive.current) {
        tap('warning');
        setPayError(errText(e));
      }
    } finally {
      working.current = false;
      if (alive.current) setBusy(null);
      onBusy?.(false);
    }
  }

  if (error) return <ErrorNote message={error} onRetry={load} />;
  if (!config) return <Loading />;
  if (!config.ready) {
    return <Empty icon="card" title={t('pay.unavailable')} action={onClose ? <Button label={t('common.close')} kind="ghost" onPress={onClose} style={{ marginTop: 10, alignSelf: 'stretch' }} /> : undefined} />;
  }

  const canPay = !busy && !!method && (method !== NEW || !!card?.complete);
  return (
    <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ paddingBottom: 20 }}>
      <View style={{ marginHorizontal: 16, padding: 16, borderRadius: 16, backgroundColor: C.surface, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={2} style={{ color: C.fg2, fontSize: 14, lineHeight: 19 }}>{title}</Text>
          <Text style={{ color: C.fg, fontSize: 13, marginTop: 2, fontWeight: '600' }}>{t('pay.total')}</Text>
        </View>
        <Text style={{ color: C.fg, fontSize: 26, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{amountLabel}</Text>
      </View>

      {config.test_mode ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 12, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: C.warn, backgroundColor: C.warn + '1f' }}>
          <Icon name="info" size={16} color={C.warn} />
          <Text style={{ flex: 1, color: C.warn, fontSize: 13, lineHeight: 18 }}>{t('checkout.testMode')}</Text>
        </View>
      ) : null}

      <Text accessibilityRole="header" style={{ color: C.fg2, fontSize: 15.5, fontWeight: '700', paddingHorizontal: 16, paddingTop: 20, paddingBottom: 10 }}>{t('checkout.payWith')}</Text>
      {applePay ? (
        <View style={{ paddingHorizontal: 16, paddingBottom: 14, gap: 14 }}>
          <PlatformPayButton
            type={wallet === 'support' ? PlatformPay.ButtonType.Support : wallet === 'subscribe' ? PlatformPay.ButtonType.Subscribe : PlatformPay.ButtonType.Buy}
            appearance={C.blurTint === 'light' ? PlatformPay.ButtonStyle.Black : PlatformPay.ButtonStyle.White}
            borderRadius={12}
            disabled={!!busy}
            onPress={() => pay('apple')}
            accessibilityLabel={t('pay.applePay', { amount: amountLabel })}
            style={{ height: 48, width: '100%' }}
          />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: C.fg3 }} />
            <Text style={{ color: C.fg3, fontSize: 13 }}>{t('checkout.orCard')}</Text>
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
              accessibilityLabel={`${cardTitle(c)}, ${expired ? t('checkout.expired', { date: exp }) : t('checkout.expires', { date: exp })}${c.is_default ? `, ${t('checkout.defaultCard')}` : ''}`}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: C.line, opacity: expired ? 0.5 : 1, backgroundColor: pressed && !expired ? C.press : 'transparent' })}>
              <Radio on={on} />
              <CardChip brand={c.brand} />
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ color: C.fg, fontSize: 16, fontWeight: '600' }}>{cardTitle(c)}</Text>
                <Text style={{ color: expired ? C.like : C.fg2, fontSize: 13.5, marginTop: 1 }}>{expired ? t('checkout.expired', { date: exp }) : t('checkout.expires', { date: exp })}</Text>
              </View>
              {c.is_default ? (
                <View style={{ height: 22, paddingHorizontal: 8, borderRadius: 11, backgroundColor: C.accentSoft, justifyContent: 'center' }}>
                  <Text style={{ color: C.accent2, fontSize: 11.5, fontWeight: '700' }}>{t('checkout.default')}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
        <Pressable
          onPress={() => choose(NEW)}
          accessibilityRole="radio"
          accessibilityState={{ checked: method === NEW }}
          accessibilityLabel={t('pay.addCard')}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: cards.length ? 1 : 0, borderTopColor: C.line, backgroundColor: pressed ? C.press : 'transparent' })}>
          <Radio on={method === NEW} />
          <View style={{ width: 46, height: 31, borderRadius: 6, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="plus" size={18} color={C.fg} weight={2.2} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: C.fg, fontSize: 16, fontWeight: '600' }}>{t('pay.addCard')}</Text>
            <Text style={{ color: C.fg2, fontSize: 13.5, marginTop: 1 }}>{t('checkout.creditOrDebit')}</Text>
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
          accessibilityLabel={payWords}
          accessibilityState={{ disabled: !canPay, busy: busy === 'card' }}
          style={({ pressed }) => ({ height: 52, borderRadius: 14, backgroundColor: C.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: busy === 'card' ? 1 : !canPay ? 0.45 : pressed ? 0.8 : 1 })}>
          {busy === 'card' ? (
            <ActivityIndicator color={C.onAccent} />
          ) : (
            <>
              <Icon name="lock" size={18} color={C.onAccent} weight={2.2} />
              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={{ color: C.onAccent, fontSize: 16.5, fontWeight: '700' }}>{payWords}</Text>
            </>
          )}
        </Pressable>
        {note ? <Text style={{ color: C.fg3, fontSize: 12.5, lineHeight: 18, textAlign: 'center' }}>{note}</Text> : null}
        {footer}
      </View>
    </ScrollView>
  );
}

/** How long the sheet takes to slide away: what it shows stays until then, so it doesn't empty on the way down. */
const SLIDE_MS = 450;

/** PayPanel in a bottom sheet of its own. It cannot be closed while a payment is under way. */
export function PaySheet({ visible, onClose, ...props }: PayProps & { visible: boolean; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  // Each opening is a new visit (a fresh panel); the last one stays drawn while the sheet slides away.
  const [visit, setVisit] = useState(visible ? 1 : 0);
  const [wasVisible, setWasVisible] = useState(visible);
  const [leaving, setLeaving] = useState(false);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setVisit(visit + 1);
    setLeaving(!visible);
  }
  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(() => setLeaving(false), SLIDE_MS);
    return () => clearTimeout(timer);
  }, [leaving]);
  // Hidden mid-payment by the parent (it should not be, but if so) the flag must not stick.
  useEffect(() => { if (!visible) setBusy(false); }, [visible]);
  const close = () => (busy ? undefined : onClose());
  return (
    <Sheet visible={visible} onClose={close} title={t('pay.title')} tall>
      {visible || leaving ? (
        <View style={{ flex: 1 }} pointerEvents={visible ? 'auto' : 'none'}>
          <PayPanel
            key={visit}
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

/**
 * Paying from one button, straight away: Apple Pay's own sheet when the phone has it, otherwise
 * the payment sheet with the saved cards and a new card. When payments aren't on, a short toast.
 * Render `sheet` in the screen; call `pay` from the button; `busy` is true while it gets going.
 */
export function useInstantPay(props: PayProps): { pay: () => void; busy: boolean; sheet: React.ReactNode } {
  const { profile } = useSession();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  // The latest words and callbacks, read when the button is pressed.
  const latest = useRef(props);
  latest.current = props;

  const pay = useCallback(async () => {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    try {
      let c = await ensureStripe();
      if (!c.ready) c = await ensureStripe(true);
      if (!c.ready) {
        toast(t('pay.unavailable'));
        return;
      }
      if (Platform.OS === 'ios' && (await applePayAvailable(c))) {
        const p = latest.current;
        const r = await payOnce('apple', null, p, profile?.full_name?.trim() ?? '');
        if (r.kind === 'paid') p.onPaid(r.id, r.slow);
        else if (r.kind === 'failed') toast(r.message);
        return;
      }
      if (alive.current) setOpen(true);
    } catch (e) {
      toast(errText(e));
    } finally {
      working.current = false;
      if (alive.current) setBusy(false);
    }
  }, [profile?.full_name, toast]);

  const sheet = (
    <PaySheet
      {...props}
      visible={open}
      onClose={() => setOpen(false)}
      onPaid={(id, slow) => {
        setOpen(false);
        props.onPaid(id, slow);
      }}
    />
  );
  return { pay, busy, sheet };
}
