import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { confirmSetupIntent, type CardFieldInput } from '@stripe/stripe-react-native';
import { fetchSavedCards, removeSavedCard, setDefaultCard, startAddCard } from '../lib/api';
import { tap } from '../lib/haptics';
import { useT } from '../lib/i18n';
import { ensureStripe } from '../lib/payments';
import { useSession } from '../lib/session';
import { C, errText } from '../lib/theme';
import type { PaymentsConfig, SavedCard } from '../lib/types';
import { CardChip, CardInput, CardPreview, cardTitle, expiryLabel, isExpired } from './CardPreview';
import { Icon } from './Icon';
import { Skeleton, SkeletonFrame } from './Skeleton';
import { Button, Sheet, SheetRow, useToast } from './ui';

/**
 * The cards saved to the member's Stripe account (the one Plus renews with, and any others), shared
 * by Payments and Payment methods: loading them, a card's own sheet (make it the default, remove it)
 * and the sheet for saving a new one. The card is typed into Stripe's field and confirmed by Stripe;
 * the app never sees the number.
 */
export function useSavedCards() {
  const toast = useToast();
  const t = useT();
  const { profile } = useSession();
  const [config, setConfig] = useState<PaymentsConfig | null>(null);
  const [cards, setCards] = useState<SavedCard[] | null>(null);
  const [error, setError] = useState('');
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // The sheet for one card. The card stays set while the sheet slides away, so it doesn't empty as it goes.
  const [open, setOpen] = useState<SavedCard | null>(null);
  const [sheet, setSheet] = useState(false);
  // What is being done to that card, for the spinner on its row. A ref as well, so a quick second tap can't start it twice.
  const [working, setWorking] = useState<'default' | 'remove' | null>(null);
  const busy = useRef(false);

  // The "add a card" sheet.
  const [adding, setAdding] = useState(false);
  const [card, setCard] = useState<CardFieldInput.Details | null>(null);
  const [saving, setSaving] = useState(false);
  const [addError, setAddError] = useState('');

  const name = profile?.full_name?.trim() ?? '';

  /** `fresh` asks for the payments status again (the Plus subscription with it) rather than using the one kept from earlier. */
  const load = useCallback(async (fresh = false) => {
    setError('');
    try {
      let c = await ensureStripe(fresh);
      // The config is kept from earlier; if payments were off then, they may have been switched on since.
      if (!c.ready && !fresh) c = await ensureStripe(true);
      if (!alive.current) return;
      setConfig(c);
      const list = c.ready ? await fetchSavedCards() : [];
      if (!alive.current) return;
      setCards(list);
    } catch (e) {
      if (alive.current) setError(errText(e));
    }
  }, []);

  const openCard = useCallback((c: SavedCard) => {
    if (busy.current) return;
    setOpen(c);
    setSheet(true);
  }, []);

  function closeCard() {
    if (busy.current) return;
    setSheet(false);
  }

  const startAdding = useCallback(() => {
    setAddError('');
    setAdding(true);
  }, []);

  function closeAdd() {
    if (saving) return;
    setAdding(false);
    setCard(null);
    setAddError('');
  }

  async function save() {
    if (saving || !card?.complete) return;
    setSaving(true);
    setAddError('');
    try {
      const secret = await startAddCard();
      const { error: e } = await confirmSetupIntent(secret, { paymentMethodType: 'Card', paymentMethodData: { billingDetails: name ? { name } : undefined } });
      if (e) {
        if (String(e.code) !== 'Canceled' && alive.current) {
          tap('warning');
          setAddError(e.localizedMessage || e.message || t('payments.cardNotSaved'));
        }
        return;
      }
      const list = await fetchSavedCards().catch(() => null);
      if (!alive.current) return;
      if (list) setCards(list);
      setAdding(false);
      setCard(null);
      tap('success');
      toast(t('payments.cardSaved'));
    } catch (e) {
      if (alive.current) {
        tap('warning');
        setAddError(errText(e));
      }
    } finally {
      if (alive.current) setSaving(false);
    }
  }

  async function makeDefault(c: SavedCard) {
    if (busy.current) return;
    busy.current = true;
    setWorking('default');
    try {
      const list = await setDefaultCard(c.id);
      if (!alive.current) return;
      setCards(list);
      setSheet(false);
      tap('success');
      toast(t('payments.defaultSet'));
    } catch (e) {
      toast(errText(e));
    } finally {
      busy.current = false;
      if (alive.current) setWorking(null);
    }
  }

  function remove(c: SavedCard) {
    if (busy.current) return;
    Alert.alert(t('payments.removeQuestion'), t(c.is_default ? 'payments.removeBodyDefault' : 'payments.removeBody', { card: cardTitle(c) }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('payments.remove'),
        style: 'destructive',
        onPress: async () => {
          if (busy.current) return;
          busy.current = true;
          setWorking('remove');
          try {
            const list = await removeSavedCard(c.id);
            if (!alive.current) return;
            setCards(list);
            setSheet(false);
            toast(t('payments.cardRemoved'));
          } catch (e) {
            toast(errText(e));
          } finally {
            busy.current = false;
            if (alive.current) setWorking(null);
          }
        },
      },
    ]);
  }

  const sheets = (
    <>
      <Sheet visible={sheet} onClose={closeCard} title={open ? cardTitle(open) : undefined}>
        {open ? (
          <View style={{ paddingBottom: 8 }}>
            <View style={{ paddingHorizontal: 20, paddingBottom: 18, alignItems: 'center', gap: 12 }}>
              <CardPreview brand={open.brand} last4={open.last4} expMonth={open.exp_month} expYear={open.exp_year} name={name} style={{ maxWidth: 300 }} />
              {open.is_default ? <Text style={{ color: C.accent2, fontSize: 14.5, fontWeight: '700' }}>{t('checkout.default')}</Text> : null}
            </View>
            {open.is_default ? null : (
              <SheetRow first icon="check" label={t('payments.makeDefault')} onPress={() => makeDefault(open)} right={working === 'default' ? <ActivityIndicator color={C.fg2} /> : undefined} />
            )}
            <SheetRow first={open.is_default} icon="trash" label={t('payments.removeCard')} danger onPress={() => remove(open)} right={working === 'remove' ? <ActivityIndicator color={C.fg2} /> : undefined} />
          </View>
        ) : null}
      </Sheet>

      <Sheet visible={adding} onClose={closeAdd} title={t('payments.addACard')} tall>
        <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 12, gap: 14 }}>
          <CardPreview brand={card?.brand} last4={card?.last4} expMonth={card?.expiryMonth} expYear={card?.expiryYear} name={name} />
          <CardInput onChange={setCard} disabled={saving} />
          {config?.test_mode ? <Text style={{ color: C.warn, fontSize: 13, lineHeight: 18 }}>{t('checkout.testMode')}</Text> : null}
          {addError ? (
            <Text accessibilityLiveRegion="polite" style={{ color: C.like, fontSize: 14, lineHeight: 19 }}>
              {addError}
            </Text>
          ) : null}
          <Button label={t('checkout.saveCard')} onPress={save} busy={saving} disabled={!card?.complete} />
        </ScrollView>
      </Sheet>
    </>
  );

  return { config, cards, error, load, openCard, startAdding, sheets };
}

/** One saved card in a list: its brand, the last four, when it expires, and whether Plus renews with it. */
export const CardRow = React.memo(function CardRow({ card, onPress }: { card: SavedCard; onPress: (c: SavedCard) => void }) {
  const t = useT();
  const exp = expiryLabel(card.exp_month, card.exp_year);
  const expired = isExpired(card.exp_month, card.exp_year);
  const line = exp ? (expired ? t('checkout.expired', { date: exp }) : t('checkout.expires', { date: exp })) : '';
  const title = cardTitle(card);
  return (
    <Pressable
      onPress={() => onPress(card)}
      accessibilityRole="button"
      accessibilityLabel={`${title}${line ? `, ${line}` : ''}${card.is_default ? `, ${t('checkout.defaultCard')}` : ''}`}
      accessibilityHint={t('payments.cardOptions')}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 11, backgroundColor: pressed ? C.press : 'transparent' })}>
      <CardChip brand={card.brand} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: C.fg, fontSize: 16.5, fontWeight: '600' }}>{title}</Text>
        {line ? <Text style={{ color: expired ? C.like : C.fg2, fontSize: 14, marginTop: 2 }}>{line}</Text> : null}
      </View>
      {card.is_default ? <Text style={{ color: C.accent2, fontSize: 14.5, fontWeight: '600' }}>{t('checkout.default')}</Text> : null}
      <Icon name="right" size={18} color={C.fg2} weight={2} />
    </Pressable>
  );
});

/** "Add card", lined up with the cards above it. */
export function AddCardRow({ onPress }: { onPress: () => void }) {
  const t = useT();
  return (
    <Pressable
      onPress={() => {
        tap('light');
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={t('payments.addCard')}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, minHeight: 52, backgroundColor: pressed ? C.press : 'transparent' })}>
      <View style={{ width: 46, alignItems: 'center' }}>
        <Icon name="plus" size={22} color={C.accent2} weight={2.2} />
      </View>
      <Text style={{ color: C.accent2, fontSize: 16.5, fontWeight: '600' }}>{t('payments.addCard')}</Text>
    </Pressable>
  );
}

/** Saved cards before they arrive, drawn to CardRow's measurements. */
export function CardsSkeleton({ count = 2 }: { count?: number }) {
  const { width } = useWindowDimensions();
  const room = width - 76 - 16;
  return (
    <SkeletonFrame>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 11 }}>
          <Skeleton width={46} height={31} radius={6} x={16} />
          <View style={{ gap: 8 }}>
            <Skeleton width={Math.round(room * (i % 2 ? 0.44 : 0.56))} height={12} x={76} />
            <Skeleton width={Math.round(room * 0.3)} height={10} x={76} />
          </View>
        </View>
      ))}
    </SkeletonFrame>
  );
}
