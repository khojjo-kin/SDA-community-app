import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { confirmSetupIntent, type CardFieldInput } from '@stripe/stripe-react-native';
import { CardChip, CardInput, CardPreview, cardTitle, expiryLabel, isExpired, PaymentsOff } from '../../src/components/CardPreview';
import { Icon } from '../../src/components/Icon';
import { Button, Empty, ErrorNote, Loading, Screen, ScreenHeader, Sheet, SheetRow, useToast } from '../../src/components/ui';
import { fetchSavedCards, removeSavedCard, setDefaultCard, startAddCard } from '../../src/lib/api';
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
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  // The sheet for one card.
  const [open, setOpen] = useState<SavedCard | null>(null);
  const [working, setWorking] = useState(false);

  // The "add a card" sheet.
  const [adding, setAdding] = useState(false);
  const [card, setCard] = useState<CardFieldInput.Details | null>(null);
  const [saving, setSaving] = useState(false);
  const [addError, setAddError] = useState('');

  const name = profile?.full_name?.trim() ?? '';

  const load = useCallback(async () => {
    setError('');
    try {
      const c = await ensureStripe();
      const list = c.ready ? await fetchSavedCards() : [];
      if (!alive.current) return;
      setConfig(c);
      setCards(list);
    } catch (e) {
      if (alive.current) setError(errText(e));
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

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
        if (String(e.code) !== 'Canceled') setAddError(e.localizedMessage || e.message || 'The card could not be saved. Try again.');
        return;
      }
      const list = await fetchSavedCards().catch(() => null);
      if (!alive.current) return;
      if (list) setCards(list);
      setAdding(false);
      setCard(null);
      toast('Card saved');
    } catch (e) {
      if (alive.current) setAddError(errText(e));
    } finally {
      if (alive.current) setSaving(false);
    }
  }

  async function makeDefault(c: SavedCard) {
    if (working) return;
    setWorking(true);
    try {
      setCards(await setDefaultCard(c.id));
      setOpen(null);
      toast('Plus will renew with this card');
    } catch (e) {
      toast(errText(e));
    } finally {
      setWorking(false);
    }
  }

  function remove(c: SavedCard) {
    if (working) return;
    Alert.alert('Remove this card?', `${cardTitle(c)} will be removed from your account.${c.is_default ? ' Plus renews with this card, so add another before your next renewal.' : ''}`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setWorking(true);
          try {
            setCards(await removeSavedCard(c.id));
            setOpen(null);
            toast('Card removed');
          } catch (e) {
            toast(errText(e));
          } finally {
            setWorking(false);
          }
        },
      },
    ]);
  }

  let body: React.ReactNode;
  if (error && !cards) body = <ErrorNote message={error} onRetry={load} />;
  else if (!config || !cards) body = <Loading />;
  else if (!config.ready) body = <PaymentsOff onBack={() => router.dismissTo('/plus')} />;
  else
    body = (
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {cards.length ? (
          <>
            <Text style={{ color: C.fg2, lineHeight: 20, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 14 }}>Plus renews with your default card. Tap a card to change it.</Text>
            <View style={{ marginHorizontal: 16, borderRadius: 18, backgroundColor: C.surface, overflow: 'hidden' }}>
              {cards.map((c, i) => {
                const exp = expiryLabel(c.exp_month, c.exp_year);
                const expired = isExpired(c.exp_month, c.exp_year);
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => setOpen(c)}
                    accessibilityRole="button"
                    accessibilityLabel={`${cardTitle(c)}, ${expired ? 'expired' : 'expires'} ${exp}${c.is_default ? ', default card' : ''}`}
                    accessibilityHint="Opens options for this card"
                    style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13, borderTopWidth: i ? 1 : 0, borderTopColor: C.line, backgroundColor: pressed ? 'rgba(255,255,255,0.05)' : 'transparent' })}>
                    <CardChip brand={c.brand} />
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={{ color: C.fg, fontSize: 16, fontWeight: '600' }}>{cardTitle(c)}</Text>
                      <Text style={{ color: expired ? C.like : C.fg2, fontSize: 13.5, marginTop: 1 }}>{expired ? `Expired ${exp}` : `Expires ${exp}`}</Text>
                    </View>
                    {c.is_default ? (
                      <View style={{ height: 22, paddingHorizontal: 8, borderRadius: 11, backgroundColor: 'rgba(31,191,90,0.16)', justifyContent: 'center' }}>
                        <Text style={{ color: C.accent2, fontSize: 11.5, fontWeight: '700' }}>Default</Text>
                      </View>
                    ) : null}
                    <Icon name="right" size={18} color={C.fg2} weight={2} />
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : (
          <Empty icon="card" title="No saved cards" body="Add a card and Plus can renew with it each month." />
        )}
        <View style={{ paddingHorizontal: 16, paddingTop: 20, gap: 12 }}>
          <Button label="Add card" onPress={() => setAdding(true)} />
          <Text style={{ color: C.fg3, fontSize: 12.5, lineHeight: 18, textAlign: 'center' }}>
            Cards are kept securely by Stripe. The app only ever sees the brand, the last four digits and the expiry date.
          </Text>
        </View>
      </ScrollView>
    );

  return (
    <Screen>
      <ScreenHeader title="Payment methods" />
      {body}

      <Sheet visible={!!open} onClose={() => (working ? undefined : setOpen(null))} title={open ? cardTitle(open) : undefined}>
        {open ? (
          <View style={{ paddingBottom: 8 }}>
            <View style={{ paddingHorizontal: 20, paddingBottom: 18 }}>
              <CardPreview brand={open.brand} last4={open.last4} expMonth={open.exp_month} expYear={open.exp_year} name={name} style={{ maxWidth: 300 }} />
            </View>
            {open.is_default ? (
              <Text style={{ color: C.fg2, fontSize: 14, textAlign: 'center', paddingHorizontal: 20, paddingBottom: 12 }}>This is your default card. Plus renews with it.</Text>
            ) : (
              <SheetRow first icon="check" label="Make default" sub="Plus renews with this card" onPress={() => makeDefault(open)} />
            )}
            <SheetRow first={open.is_default} icon="trash" label="Remove card" danger onPress={() => remove(open)} />
          </View>
        ) : null}
      </Sheet>

      <Sheet visible={adding} onClose={closeAdd} title="Add a card" tall>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 12, gap: 14 }}>
          <CardPreview brand={card?.brand} last4={card?.last4} expMonth={card?.expiryMonth} expYear={card?.expiryYear} name={name} />
          <CardInput onChange={setCard} disabled={saving} />
          {config?.test_mode ? <Text style={{ color: '#ffc94d', fontSize: 13, lineHeight: 18 }}>Test mode — use card 4242 4242 4242 4242, any future date, any CVC.</Text> : null}
          {addError ? (
            <Text accessibilityLiveRegion="polite" style={{ color: C.like, fontSize: 14, lineHeight: 19 }}>
              {addError}
            </Text>
          ) : null}
          <Button label="Save card" onPress={save} busy={saving} disabled={!card?.complete} />
          <Text style={{ color: C.fg3, fontSize: 12.5, lineHeight: 18, textAlign: 'center' }}>Saved securely by Stripe. Your card details never touch our servers.</Text>
        </ScrollView>
      </Sheet>
    </Screen>
  );
}
