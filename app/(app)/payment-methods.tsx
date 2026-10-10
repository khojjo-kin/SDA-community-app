import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { confirmSetupIntent, type CardFieldInput } from '@stripe/stripe-react-native';
import { CardChip, CardInput, CardPreview, cardTitle, expiryLabel, isExpired, PaymentsOff } from '../../src/components/CardPreview';
import { Icon } from '../../src/components/Icon';
import { Button, Empty, ErrorNote, Loading, Screen, ScreenHeader, Sheet, SheetRow, useToast } from '../../src/components/ui';
import { fetchSavedCards, removeSavedCard, setDefaultCard, startAddCard } from '../../src/lib/api';
import { tap } from '../../src/lib/haptics';
import { t } from '../../src/lib/i18n';
import { ensureStripe } from '../../src/lib/payments';
import { useSession } from '../../src/lib/session';
import { C, errText } from '../../src/lib/theme';
import type { PaymentsConfig, SavedCard } from '../../src/lib/types';

/** The cards saved to the member's Stripe account: the one Plus renews with, and any others. */
export default function PaymentMethods() {
  const router = useRouter();
  const toast = useToast();
  const { profile } = useSession();
  const [config, setConfig] = useState<PaymentsConfig | null>(null);
  const [cards, setCards] = useState<SavedCard[] | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

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

  const load = useCallback(async () => {
    setError('');
    try {
      let c = await ensureStripe();
      // The config is kept from earlier; if payments were off then, they may have been switched on since.
      if (!c.ready) c = await ensureStripe(true);
      const list = c.ready ? await fetchSavedCards() : [];
      if (!alive.current) return;
      setConfig(c);
      setCards(list);
    } catch (e) {
      if (alive.current) setError(errText(e));
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function pull() {
    setRefreshing(true);
    await load();
    if (alive.current) setRefreshing(false);
  }

  function openCard(c: SavedCard) {
    if (busy.current) return;
    setOpen(c);
    setSheet(true);
  }

  function closeCard() {
    if (busy.current) return;
    setSheet(false);
  }

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
          setAddError(e.localizedMessage || e.message || 'The card could not be saved. Try again.');
        }
        return;
      }
      const list = await fetchSavedCards().catch(() => null);
      if (!alive.current) return;
      if (list) setCards(list);
      setAdding(false);
      setCard(null);
      tap('success');
      toast('Card saved');
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
      toast('Plus will renew with this card');
    } catch (e) {
      toast(errText(e));
    } finally {
      busy.current = false;
      if (alive.current) setWorking(null);
    }
  }

  function remove(c: SavedCard) {
    if (busy.current) return;
    Alert.alert('Remove this card?', `${cardTitle(c)} will be removed from your account.${c.is_default ? ' Plus renews with this card, so add another before your next renewal.' : ''}`, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: 'Remove',
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
            toast('Card removed');
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

  let body: React.ReactNode;
  if (error && !cards) body = <ErrorNote message={error} onRetry={load} />;
  else if (!config || !cards) body = <Loading />;
  else if (!config.ready) body = <PaymentsOff onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))} />;
  else
    body = (
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={pull} tintColor={C.fg2} />}>
        {cards.length ? (
          <View style={{ marginHorizontal: 16, marginTop: 6, borderRadius: 18, backgroundColor: C.surface, overflow: 'hidden' }}>
            {cards.map((c, i) => {
              const exp = expiryLabel(c.exp_month, c.exp_year);
              const expired = isExpired(c.exp_month, c.exp_year);
              return (
                <Pressable
                  key={c.id}
                  onPress={() => openCard(c)}
                  accessibilityRole="button"
                  accessibilityLabel={`${cardTitle(c)}, ${expired ? t('checkout.expired', { date: exp }) : t('checkout.expires', { date: exp })}${c.is_default ? `, ${t('checkout.defaultCard')}` : ''}`}
                  accessibilityHint="Opens options for this card"
                  style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13, borderTopWidth: i ? 1 : 0, borderTopColor: C.line, backgroundColor: pressed ? C.press : 'transparent' })}>
                  <CardChip brand={c.brand} />
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={{ color: C.fg, fontSize: 16, fontWeight: '600' }}>{cardTitle(c)}</Text>
                    <Text style={{ color: expired ? C.like : C.fg2, fontSize: 13.5, marginTop: 1 }}>{expired ? t('checkout.expired', { date: exp }) : t('checkout.expires', { date: exp })}</Text>
                  </View>
                  {c.is_default ? <DefaultPill /> : null}
                  <Icon name="right" size={18} color={C.fg2} weight={2} />
                </Pressable>
              );
            })}
          </View>
        ) : (
          <Empty icon="card" title="No saved cards" />
        )}
        <View style={{ paddingHorizontal: 16, paddingTop: 20, gap: 12 }}>
          <Button label="Add card" onPress={() => setAdding(true)} />
        </View>
      </ScrollView>
    );

  return (
    <Screen>
      <ScreenHeader title={t('plus.paymentMethods')} />
      {body}

      <Sheet visible={sheet} onClose={closeCard} title={open ? cardTitle(open) : undefined}>
        {open ? (
          <View style={{ paddingBottom: 8 }}>
            <View style={{ paddingHorizontal: 20, paddingBottom: 18, alignItems: 'center', gap: 12 }}>
              <CardPreview brand={open.brand} last4={open.last4} expMonth={open.exp_month} expYear={open.exp_year} name={name} style={{ maxWidth: 300 }} />
              {open.is_default ? <DefaultPill /> : null}
            </View>
            {open.is_default ? null : (
              <SheetRow first icon="check" label="Make default" onPress={() => makeDefault(open)} right={working === 'default' ? <ActivityIndicator color={C.fg2} /> : undefined} />
            )}
            <SheetRow first={open.is_default} icon="trash" label="Remove card" danger onPress={() => remove(open)} right={working === 'remove' ? <ActivityIndicator color={C.fg2} /> : undefined} />
          </View>
        ) : null}
      </Sheet>

      <Sheet visible={adding} onClose={closeAdd} title="Add a card" tall>
        <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 12, gap: 14 }}>
          <CardPreview brand={card?.brand} last4={card?.last4} expMonth={card?.expiryMonth} expYear={card?.expiryYear} name={name} />
          <CardInput onChange={setCard} disabled={saving} />
          {config?.test_mode ? <Text style={{ color: C.warn, fontSize: 13, lineHeight: 18 }}>{t('checkout.testMode')}</Text> : null}
          {addError ? (
            <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', gap: 8, padding: 12, borderRadius: 12, backgroundColor: C.like + '1a' }}>
              <Icon name="info" size={18} color={C.like} />
              <Text style={{ flex: 1, color: C.like, fontSize: 14, lineHeight: 19 }}>{addError}</Text>
            </View>
          ) : null}
          <Button label={t('checkout.saveCard')} onPress={save} busy={saving} disabled={!card?.complete} />
        </ScrollView>
      </Sheet>
    </Screen>
  );
}

function DefaultPill() {
  return (
    <View style={{ height: 22, paddingHorizontal: 8, borderRadius: 11, backgroundColor: C.accentSoft, justifyContent: 'center' }}>
      <Text style={{ color: C.accent2, fontSize: 11.5, fontWeight: '700' }}>{t('checkout.default')}</Text>
    </View>
  );
}
