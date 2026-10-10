import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Icon, IconName, VerifiedTick } from '../../src/components/Icon';
import { PaySheet, type PayStart } from '../../src/components/PaySheet';
import { Avatar, Button, Loading, Screen, ScreenHeader, SectionLabel, useToast } from '../../src/components/ui';
import { cancelCreatorSubscription, fetchPayouts, mySubscribers, mySubscriptions, startCreatorSubscription, syncCreatorSubscription, syncCreatorSubscriptionUntilOn, updateProfile } from '../../src/lib/api';
import { tap } from '../../src/lib/haptics';
import { ensureStripe, money } from '../../src/lib/payments';
import { useSession } from '../../src/lib/session';
import { C, dayLabel, errText } from '../../src/lib/theme';
import type { CreatorSub, PaymentsConfig, PayoutStatus } from '../../src/lib/types';

/** The prices offered as chips, in pence. Anything else between the limits can be typed. */
const PRESETS = [99, 199, 299, 499, 999];
/** The database allows £0.99 to £99.99 a month. */
const MIN_PENCE = 99;
const MAX_PENCE = 9999;

/** "4.50", "£4.5" or "4" as pence, or null when it isn't a price between the limits. */
function parsePounds(text: string): number | null {
  const t = text.replace(/[£\s]/g, '').replace(',', '.');
  if (!/^\d{1,2}(\.\d{0,2})?$/.test(t)) return null;
  const pence = Math.round(parseFloat(t) * 100);
  return pence >= MIN_PENCE && pence <= MAX_PENCE ? pence : null;
}

/** Where one subscription stands, in a few words. */
function standing(s: CreatorSub): string {
  const day = s.current_period_end ? dayLabel(new Date(s.current_period_end)) : '';
  if (s.status === 'past_due') return 'Payment due';
  if (s.cancel_at_period_end) return day ? `Ends ${day}` : 'Ending';
  return day ? `Renews ${day}` : 'Active';
}

/**
 * Subscriptions for creators: set a monthly price (or turn them off), see who subscribes, and manage
 * your own subscriptions to other people. Subscribers pay into the creator's own payout account; the
 * app keeps a share. Members under 14 can't offer subscriptions (the database refuses it too).
 */
export default function CreatorSubscriptions() {
  const { me, profile, refresh } = useSession();
  const router = useRouter();
  const toast = useToast();
  const current = profile?.sub_price_pence ?? null;
  const restricted = profile?.restricted === true;
  // The chip chosen on this visit; null means "whatever is saved".
  const [choice, setChoice] = useState<number | 'custom' | null>(null);
  const [custom, setCustom] = useState('');
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<PaymentsConfig | null>(null);
  const [payouts, setPayouts] = useState<PayoutStatus | null>(null);
  const [payoutsError, setPayoutsError] = useState('');
  const [subscribers, setSubscribers] = useState<CreatorSub[] | null>(null);
  const [mine, setMine] = useState<CreatorSub[] | null>(null);
  // The creator whose subscription is being cancelled, resumed or paid for.
  const [changing, setChanging] = useState<string | null>(null);
  // A subscription whose last renewal didn't go through, being paid now. Kept after the sheet closes,
  // so its words don't change as it slides away.
  const [overdue, setOverdue] = useState<CreatorSub | null>(null);
  const [paying, setPaying] = useState(false);
  // The status Stripe gave while paying, so the read-back afterwards starts from it.
  const known = useRef<string | null>(null);
  const working = useRef(false);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  // A saved price that isn't one of the chips shows in the box, ready to change.
  useEffect(() => {
    if (current != null && !PRESETS.includes(current)) setCustom((current / 100).toFixed(2));
  }, [current]);

  const loadMine = useCallback(() => {
    mySubscriptions(me)
      .then((list) => { if (alive.current) setMine(list); })
      .catch(() => { if (alive.current) setMine((old) => old ?? []); });
  }, [me]);

  // On every visit: the payout status may have changed on Stripe's form (/payouts).
  const load = useCallback(() => {
    loadMine();
    mySubscribers(me)
      .then((list) => { if (alive.current) setSubscribers(list); })
      .catch(() => { if (alive.current) setSubscribers((old) => old ?? []); });
    setPayoutsError('');
    (async () => {
      try {
        let c = await ensureStripe();
        // The config is kept from earlier; if payments were off then, they may have been switched on since.
        if (!c.ready) c = await ensureStripe(true);
        if (!alive.current) return;
        setConfig(c);
        if (c.ready) {
          const s = await fetchPayouts();
          if (alive.current) setPayouts(s);
        }
      } catch (e) {
        if (alive.current) setPayoutsError(errText(e));
      }
    })();
  }, [me, loadMine]);
  useFocusEffect(load);

  const selected: number | 'custom' | null = choice ?? (current == null ? null : PRESETS.includes(current) ? current : 'custom');
  const chosenPence = selected === 'custom' ? parsePounds(custom) : selected;
  const customBad = selected === 'custom' && custom.trim() !== '' && chosenPence == null;
  const canSave = chosenPence != null && chosenPence !== current && !saving;
  const fee = config?.creator_fee_percent;
  const ready = !!payouts?.charges_enabled;

  async function save() {
    if (!canSave || chosenPence == null || working.current) return;
    working.current = true;
    tap('medium');
    setSaving(true);
    try {
      const wasOff = current == null;
      await updateProfile(me, { sub_price_pence: chosenPence });
      await refresh();
      if (!alive.current) return;
      setChoice(null);
      toast(wasOff ? `Subscriptions are on at ${money(chosenPence)} a month` : `Your price is now ${money(chosenPence)} a month`);
    } catch (e) {
      toast(errText(e));
    } finally {
      working.current = false;
      if (alive.current) setSaving(false);
    }
  }

  function turnOff() {
    if (working.current) return;
    Alert.alert('Turn off subscriptions?', "No one new can subscribe. Anyone already subscribed stays subscribed until they cancel, and keeps seeing your subscriber posts until then.", [
      { text: 'Keep them on', style: 'cancel' },
      {
        text: 'Turn off',
        style: 'destructive',
        onPress: async () => {
          if (working.current) return;
          working.current = true;
          setSaving(true);
          try {
            await updateProfile(me, { sub_price_pence: null });
            await refresh();
            if (!alive.current) return;
            setChoice(null);
            setCustom('');
            toast('Subscriptions are off');
          } catch (e) {
            toast(errText(e));
          } finally {
            working.current = false;
            if (alive.current) setSaving(false);
          }
        },
      },
    ]);
  }

  /** Stops (or restarts) renewing one of my subscriptions to someone else. */
  function changeMine(s: CreatorSub) {
    if (changing) return;
    const name = s.profile?.username ?? 'this creator';
    const resume = s.cancel_at_period_end;
    const day = s.current_period_end ? dayLabel(new Date(s.current_period_end)) : '';
    const run = async () => {
      setChanging(s.creator_id);
      try {
        await cancelCreatorSubscription(s.creator_id, resume);
        toast(resume ? `Your subscription to ${name} will renew` : day ? `Your subscription to ${name} ends on ${day}` : `Your subscription to ${name} will end`);
        loadMine();
      } catch (e) {
        toast(errText(e));
      } finally {
        if (alive.current) setChanging(null);
      }
    };
    if (resume) {
      run();
      return;
    }
    Alert.alert(`Cancel your subscription to ${name}?`, `You won't be charged again. You keep seeing their subscriber posts${day ? ` until ${day}` : ' until the end of the month you paid for'}.`, [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Cancel subscription', style: 'destructive', onPress: run },
    ]);
  }

  /** Pays a failed renewal on the same subscription, through the same payment sheet as subscribing. */
  function payOverdue(s: CreatorSub) {
    if (changing) return;
    tap('medium');
    setOverdue(s);
    setPaying(true);
  }

  const startOverdue = useCallback(async (): Promise<PayStart> => {
    known.current = null;
    if (!overdue) throw new Error('Choose the subscription to pay.');
    const r = await startCreatorSubscription(overdue.creator_id);
    // Paid already (Stripe may not have caught up yet): the read-back below starts from what the server saw.
    if (r.already) known.current = r.status ?? null;
    const secret = r.client_secret ?? '';
    return { already: !!r.already, client_secret: secret, payment_intent_id: secret.split('_secret_')[0], amount: r.amount ?? overdue.amount_pence, currency: r.currency ?? 'GBP' };
  }, [overdue]);

  const confirmedOverdue = useCallback(async () => {
    if (!overdue) return;
    const r = await syncCreatorSubscription(overdue.creator_id);
    known.current = r.status;
  }, [overdue]);

  /** Paid: Stripe can take a few seconds to mark the subscription active again, so it is asked a few times. */
  async function paidOverdue() {
    const s = overdue;
    setPaying(false);
    if (!s) return;
    const name = s.profile?.username ?? 'this creator';
    setChanging(s.creator_id);
    const on = await syncCreatorSubscriptionUntilOn(s.creator_id, known.current);
    if (!alive.current) return;
    setChanging(null);
    if (on) {
      tap('success');
      toast(`Paid. Your subscription to ${name} carries on`);
    } else {
      toast("Payment received. It's taking a moment to show here, so check back in a minute.");
    }
    loadMine();
  }

  let payoutRow: { icon: IconName; color: string; title: string; body: string } | null = null;
  if (payoutsError) payoutRow = { icon: 'info', color: C.fg2, title: 'Payouts', body: "Your payout status didn't load. Tap to open Payouts." };
  else if (config && !config.ready) payoutRow = { icon: 'card', color: C.fg2, title: "Card payments aren't switched on yet", body: 'You can set your price now. People can subscribe once payments are on and your payouts are ready.' };
  else if (payouts) {
    if (ready) payoutRow = { icon: 'check', color: C.accent2, title: 'Payouts ready', body: 'Subscriptions are paid into your own payout account.' };
    else if (payouts.has_account) payoutRow = { icon: 'info', color: C.warn, title: 'Finish setting up payouts', body: "Subscriptions can't be taken until your payouts are ready." };
    else payoutRow = { icon: 'card', color: C.warn, title: 'Set up payouts', body: "Subscriptions can't be taken until your payouts are ready." };
  }

  return (
    <Screen>
      <ScreenHeader title="Subscriptions" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 48 }}>
          <View style={{ flexDirection: 'row', gap: 12, marginHorizontal: 16, marginTop: 6 }}>
            <Icon name="crown" size={22} color={C.accent2} />
            <Text style={{ flex: 1, color: C.fg2, fontSize: 14.5, lineHeight: 21 }}>
              Subscribers pay you every month to see the posts and clips you share only with them. The money goes to your own payout account, and Community keeps {fee != null ? `${fee}%` : 'a small share'} to keep the app running.
            </Text>
          </View>

          <SectionLabel>Your price</SectionLabel>
          {restricted ? (
            <View style={{ marginHorizontal: 16, padding: 16, borderRadius: 16, backgroundColor: C.surface, flexDirection: 'row', gap: 12 }}>
              <Icon name="lock" size={22} color={C.fg2} />
              <Text style={{ flex: 1, color: C.fg2, fontSize: 14.5, lineHeight: 20 }}>Offering subscriptions is for members 14 and over.</Text>
            </View>
          ) : (
            <View style={{ paddingHorizontal: 16, gap: 12 }}>
              <Text style={{ color: C.fg, fontSize: 15.5 }}>
                {current != null ? (
                  <>
                    You offer subscriptions at <Text style={{ fontWeight: '800' }}>{money(current)} a month</Text>.
                  </>
                ) : (
                  "You don't offer subscriptions yet. Choose a monthly price to start."
                )}
              </Text>
              <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {PRESETS.map((p) => (
                  <Chip key={p} label={money(p)} on={selected === p} onPress={() => { tap('select'); setChoice(p); }} />
                ))}
                <Chip label="Custom" on={selected === 'custom'} onPress={() => { tap('select'); setChoice('custom'); }} />
              </View>
              {selected === 'custom' ? (
                <View style={{ gap: 6 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 50, borderRadius: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: customBad ? C.like : 'transparent' }}>
                    <Text style={{ color: C.fg2, fontSize: 17 }}>£</Text>
                    <TextInput
                      value={custom}
                      onChangeText={setCustom}
                      placeholder="4.50"
                      placeholderTextColor={C.fg3}
                      keyboardType="decimal-pad"
                      keyboardAppearance={C.blurTint}
                      maxLength={6}
                      editable={!saving}
                      style={{ flex: 1, color: C.fg, fontSize: 17, fontVariant: ['tabular-nums'] }}
                      accessibilityLabel="Monthly price in pounds"
                    />
                    <Text style={{ color: C.fg2, fontSize: 15 }}>a month</Text>
                  </View>
                  <Text style={{ color: customBad ? C.like : C.fg3, fontSize: 12.5 }}>Between {money(MIN_PENCE)} and {money(MAX_PENCE)} a month.</Text>
                </View>
              ) : null}
              <Button label={saving ? 'Saving' : current == null ? 'Start offering subscriptions' : 'Save price'} busy={saving} disabled={!canSave} onPress={save} />
              {current != null ? <Text style={{ color: C.fg3, fontSize: 12.5, lineHeight: 18 }}>A new price applies to people who subscribe after you change it.</Text> : null}
              {current != null ? <Button label="Turn off subscriptions" kind="ghost" disabled={saving} onPress={turnOff} textColor={C.like} /> : null}
            </View>
          )}

          {restricted ? null : (
            <>
              <SectionLabel>Payouts</SectionLabel>
              {payoutRow ? (
                <Pressable
                  onPress={() => router.push('/payouts')}
                  accessibilityRole="button"
                  accessibilityLabel={`${payoutRow.title}. ${payoutRow.body}`}
                  style={({ pressed }) => ({ marginHorizontal: 16, padding: 14, borderRadius: 16, backgroundColor: pressed ? C.surface2 : C.surface, flexDirection: 'row', alignItems: 'center', gap: 12 })}>
                  <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name={payoutRow.icon} size={22} color={payoutRow.color} weight={2.2} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: payoutRow.color === C.accent2 ? C.accent2 : C.fg, fontSize: 16, fontWeight: '700' }}>{payoutRow.title}</Text>
                    <Text style={{ color: C.fg2, fontSize: 13.5, lineHeight: 19, marginTop: 2 }}>{payoutRow.body}</Text>
                  </View>
                  <Icon name="right" size={16} color={C.fg2} weight={2} />
                </Pressable>
              ) : (
                <Loading />
              )}
            </>
          )}

          {restricted && !subscribers?.length ? null : (
            <>
              <SectionLabel>{subscribers?.length ? `Your subscribers · ${subscribers.length}` : 'Your subscribers'}</SectionLabel>
              {subscribers === null ? (
                <Loading />
              ) : subscribers.length === 0 ? (
                <Text style={{ color: C.fg2, paddingHorizontal: 16, lineHeight: 20 }}>No one subscribes to you yet. People can subscribe from your profile once your price is set and your payouts are ready.</Text>
              ) : (
                subscribers.map((s) => (
                  <PersonLine
                    key={s.id}
                    sub={s}
                    line={s.status === 'past_due' ? 'Payment due' : s.cancel_at_period_end ? `Since ${dayLabel(new Date(s.created_at))} · ${standing(s)}` : `Since ${dayLabel(new Date(s.created_at))}`}
                    right={<Text style={{ color: C.fg2, fontSize: 13.5, fontVariant: ['tabular-nums'] }}>{money(s.amount_pence)}/mo</Text>}
                    onPress={s.profile ? () => router.push(`/user/${s.subscriber_id}`) : undefined}
                  />
                ))
              )}
            </>
          )}

          <SectionLabel>Your subscriptions</SectionLabel>
          {mine === null ? (
            <Loading />
          ) : mine.length === 0 ? (
            <Text style={{ color: C.fg2, paddingHorizontal: 16, lineHeight: 20 }}>You don't subscribe to anyone. Look for Subscribe on a creator's profile.</Text>
          ) : (
            mine.map((s) => (
              <PersonLine
                key={s.id}
                sub={s}
                line={`${money(s.amount_pence)} a month · ${standing(s)}`}
                onPress={() => router.push(`/subscribe/${s.creator_id}`)}
                right={
                  changing === s.creator_id ? (
                    <ActivityIndicator color={C.fg2} />
                  ) : s.status === 'past_due' ? (
                    <Button small label="Pay now" disabled={!!changing} onPress={() => payOverdue(s)} />
                  ) : (
                    <Button small kind="ghost" label={s.cancel_at_period_end ? 'Resume' : 'Cancel'} disabled={!!changing} onPress={() => changeMine(s)} />
                  )
                }
              />
            ))
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <PaySheet
        visible={paying}
        onClose={() => setPaying(false)}
        title={`Subscription to @${overdue?.profile?.username ?? ''} · payment due`}
        amountLabel={money(overdue?.amount_pence ?? 0)}
        start={startOverdue}
        onConfirmed={confirmedOverdue}
        onPaid={paidOverdue}
        walletLabel={`Subscription to @${overdue?.profile?.username ?? ''}`}
        wallet="support"
        note={`Pays the month that didn't go through. Then it renews every month at ${money(overdue?.amount_pence ?? 0)} until you cancel.`}
      />
    </Screen>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: on }}
      accessibilityLabel={label === 'Custom' ? 'Custom price' : `${label} a month`}
      style={({ pressed }) => ({ height: 38, paddingHorizontal: 16, borderRadius: 19, borderWidth: 2, borderColor: on ? C.accent : C.line, backgroundColor: on ? C.accentSoft : C.surface, justifyContent: 'center', opacity: pressed ? 0.75 : 1 })}>
      <Text style={{ color: on ? C.accent2 : C.fg, fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{label}</Text>
    </Pressable>
  );
}

/** One person in a subscription list: who, a line about the subscription, and something on the right. */
function PersonLine({ sub, line, right, onPress }: { sub: CreatorSub; line: string; right?: React.ReactNode; onPress?: () => void }) {
  const p = sub.profile;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8 }}>
      <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={`${p?.full_name ?? 'Someone'}, ${p?.username ?? ''}. ${line}`} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Avatar uri={p?.avatar_url} name={p?.full_name} size={46} />
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text numberOfLines={1} style={{ color: C.fg, fontWeight: '600', flexShrink: 1 }}>{p?.username ?? 'Account unavailable'}</Text>
            {p?.verified ? <VerifiedTick size={14} /> : null}
          </View>
          <Text numberOfLines={1} style={{ color: sub.status === 'past_due' ? C.warn : C.fg2, fontSize: 13.5 }}>{line}</Text>
        </View>
      </Pressable>
      {right}
    </View>
  );
}
