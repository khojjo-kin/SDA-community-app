import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Icon, IconName, VerifiedTick } from '../../src/components/Icon';
import { PaySheet, type PayStart } from '../../src/components/PaySheet';
import { RenewalTerms } from '../../src/components/RenewalTerms';
import { Avatar, Button, ErrorNote, Loading, Screen, ScreenHeader, SectionLabel, useToast } from '../../src/components/ui';
import { cancelCreatorSubscription, fetchPayouts, mySubscribers, mySubscriptions, startCreatorSubscription, syncCreatorSubscription, syncCreatorSubscriptionUntilOn, updateProfile } from '../../src/lib/api';
import { tap } from '../../src/lib/haptics';
import { t, tSplit } from '../../src/lib/i18n';
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
  if (s.status === 'past_due') return t('creatorSubs.paymentDue');
  if (s.cancel_at_period_end) return day ? t('creatorSubs.ends', { day }) : t('creatorSubs.ending');
  return day ? t('creatorSubs.renews', { day }) : t('creatorSubs.active');
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
  // A list that didn't load (with none on screen) says so, rather than looking empty.
  const [subscribersError, setSubscribersError] = useState('');
  const [mineError, setMineError] = useState('');
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
  // One screen per tap, however quickly a row is tapped twice.
  const lastPush = useRef(0);
  const open = (href: string) => {
    if (Date.now() - lastPush.current < 800) return;
    lastPush.current = Date.now();
    router.push(href);
  };
  /** Changes one of my subscriptions in the list at once, from what Stripe answered; the list is then read again. */
  const patchMine = (creatorId: string, patch: Partial<CreatorSub>) => setMine((list) => list?.map((x) => (x.creator_id === creatorId ? { ...x, ...patch } : x)) ?? list);

  // A saved price that isn't one of the chips shows in the box, ready to change.
  useEffect(() => {
    if (current != null && !PRESETS.includes(current)) setCustom((current / 100).toFixed(2));
  }, [current]);

  const loadMine = useCallback(() => {
    setMineError('');
    mySubscriptions(me)
      .then((list) => { if (alive.current) setMine(list); })
      .catch((e) => { if (alive.current) setMineError(errText(e)); });
  }, [me]);

  // On every visit: the payout status may have changed on Stripe's form (/payouts).
  const load = useCallback(() => {
    loadMine();
    setSubscribersError('');
    mySubscribers(me)
      .then((list) => { if (alive.current) setSubscribers(list); })
      .catch((e) => { if (alive.current) setSubscribersError(errText(e)); });
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
      toast(wasOff ? t('creatorSubs.nowOn', { price: money(chosenPence) }) : t('creatorSubs.priceNow', { price: money(chosenPence) }));
    } catch (e) {
      toast(errText(e));
    } finally {
      working.current = false;
      if (alive.current) setSaving(false);
    }
  }

  function turnOff() {
    if (working.current) return;
    Alert.alert(t('creatorSubs.turnOffQuestion'), t('creatorSubs.turnOffBody'), [
      { text: t('creatorSubs.keepOn'), style: 'cancel' },
      {
        text: t('creatorSubs.turnOffConfirm'),
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
            toast(t('creatorSubs.off'));
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
    const name = s.profile?.username ?? t('creatorSubs.thisCreator');
    const resume = s.cancel_at_period_end;
    const day = s.current_period_end ? dayLabel(new Date(s.current_period_end)) : '';
    const run = async () => {
      setChanging(s.creator_id);
      try {
        const r = await cancelCreatorSubscription(s.creator_id, resume);
        if (alive.current) patchMine(s.creator_id, { status: r.status || s.status, cancel_at_period_end: !!r.cancel_at_period_end });
        tap('success');
        toast(resume ? t('creatorSubs.willRenew', { username: name }) : day ? t('creatorSubs.endsOn', { username: name, day }) : t('creatorSubs.willEnd', { username: name }));
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
    Alert.alert(t('creatorSubs.cancelQuestion', { username: name }), day ? t('subscribe.cancelBody', { day }) : t('subscribe.cancelBodyPeriod'), [
      { text: t('subscribe.keepIt'), style: 'cancel' },
      { text: t('plus.cancelSubscription'), style: 'destructive', onPress: run },
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
    if (!overdue) throw new Error(t('creatorSubs.choose'));
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
    const name = s.profile?.username ?? t('creatorSubs.thisCreator');
    setChanging(s.creator_id);
    const on = await syncCreatorSubscriptionUntilOn(s.creator_id, known.current);
    if (!alive.current) return;
    // Paid and on again: no more "Pay now" on its row while the list is read again.
    if (on) patchMine(s.creator_id, { status: 'active' });
    setChanging(null);
    if (on) {
      tap('success');
      toast(t('subscribe.paidCarriesOn', { username: name }));
    } else {
      toast(t('subscribe.paymentReceived'));
    }
    loadMine();
  }

  let payoutRow: { icon: IconName; color: string; title: string; body?: string } | null = null;
  if (payoutsError) payoutRow = { icon: 'info', color: C.fg2, title: t('creatorSubs.payouts'), body: t('creatorSubs.payoutsDidNotLoad') };
  else if (config && !config.ready) payoutRow = { icon: 'card', color: C.fg2, title: t('pay.unavailable') };
  else if (payouts) {
    if (ready) payoutRow = { icon: 'check', color: C.accent2, title: t('creatorSubs.payoutsReady') };
    else if (payouts.has_account) payoutRow = { icon: 'info', color: C.warn, title: t('creatorSubs.finishPayouts') };
    else payoutRow = { icon: 'card', color: C.warn, title: t('creatorSubs.setUpPayouts') };
  }
  // "You offer subscriptions at £4.99 a month.", with the price and how often in bold wherever the language puts it.
  const [offerBefore, offerAfter] = tSplit('creatorSubs.youOffer', 'cost');

  return (
    <Screen>
      <ScreenHeader title={t('settings.subscriptions')} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ paddingBottom: 48 }}>
          <SectionLabel>{t('creatorSubs.yourPrice')}</SectionLabel>
          {restricted ? (
            <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 16 }}>
              <Icon name="lock" size={20} color={C.fg2} />
              <Text style={{ flex: 1, color: C.fg2, fontSize: 15, lineHeight: 20 }}>{t('creatorSubs.under14')}</Text>
            </View>
          ) : (
            <View style={{ paddingHorizontal: 16, gap: 12 }}>
              {current != null ? (
                <Text style={{ color: C.fg, fontSize: 15.5 }}>
                  {offerBefore}<Text style={{ fontWeight: '800' }}>{t('plus.perMonth', { price: money(current) })}</Text>{offerAfter}
                </Text>
              ) : null}
              <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {PRESETS.map((p) => (
                  <Chip key={p} label={money(p)} on={selected === p} onPress={() => { tap('select'); setChoice(p); }} />
                ))}
                <Chip label={t('creatorSubs.custom')} on={selected === 'custom'} onPress={() => { tap('select'); setChoice('custom'); }} />
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
                      accessibilityLabel={t('creatorSubs.priceLabel')}
                    />
                    <Text style={{ color: C.fg2, fontSize: 15 }}>{t('plus.aMonth')}</Text>
                  </View>
                  {/* The limits only once a price outside them is typed. */}
                  {customBad ? <Text accessibilityLiveRegion="polite" style={{ color: C.like, fontSize: 13 }}>{t('creatorSubs.between', { min: money(MIN_PENCE), max: money(MAX_PENCE) })}</Text> : null}
                </View>
              ) : null}
              <Button label={saving ? t('creatorSubs.saving') : current == null ? t('creatorSubs.start') : t('creatorSubs.save')} busy={saving} disabled={!canSave} onPress={save} />
              {current != null ? <Button label={t('creatorSubs.turnOff')} kind="ghost" disabled={saving} onPress={turnOff} textColor={C.like} /> : null}
            </View>
          )}

          {restricted ? null : (
            <>
              <SectionLabel>{t('creatorSubs.payouts')}</SectionLabel>
              {payoutRow ? (
                <Pressable
                  onPress={() => open('/payouts')}
                  accessibilityRole="button"
                  accessibilityLabel={payoutRow.body ? `${payoutRow.title}. ${payoutRow.body}` : payoutRow.title}
                  // A plain row, as in a settings list: no card around it.
                  style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 10, minHeight: 52, backgroundColor: pressed ? C.press : 'transparent' })}>
                  <Icon name={payoutRow.icon} size={24} color={payoutRow.color} weight={2.2} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: payoutRow.color === C.accent2 ? C.accent2 : C.fg, fontSize: 16.5, fontWeight: '600' }}>{payoutRow.title}</Text>
                    {payoutRow.body ? <Text style={{ color: C.fg2, fontSize: 13.5, lineHeight: 19, marginTop: 2 }}>{payoutRow.body}</Text> : null}
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
              <SectionLabel>{subscribers?.length ? t('creatorSubs.subscribersCount', { count: subscribers.length }) : t('creatorSubs.subscribers')}</SectionLabel>
              {subscribers === null ? (
                subscribersError ? <ErrorNote message={subscribersError} onRetry={load} /> : <Loading />
              ) : subscribers.length === 0 ? (
                <Text style={{ color: C.fg2, paddingHorizontal: 16, lineHeight: 20 }}>{t('creatorSubs.noSubscribersYet')}</Text>
              ) : (
                subscribers.map((s) => (
                  <PersonLine
                    key={s.id}
                    sub={s}
                    line={s.status === 'past_due' ? t('creatorSubs.paymentDue') : s.cancel_at_period_end ? `${t('creatorSubs.since', { day: dayLabel(new Date(s.created_at)) })} · ${standing(s)}` : t('creatorSubs.since', { day: dayLabel(new Date(s.created_at)) })}
                    right={<Text style={{ color: C.fg2, fontSize: 13.5, fontVariant: ['tabular-nums'] }}>{t('creatorSubs.perMo', { price: money(s.amount_pence) })}</Text>}
                    onPress={s.profile ? () => open(`/user/${s.subscriber_id}`) : undefined}
                  />
                ))
              )}
            </>
          )}

          <SectionLabel>{t('subscribe.yourSubscriptions')}</SectionLabel>
          {mine === null ? (
            mineError ? <ErrorNote message={mineError} onRetry={loadMine} /> : <Loading />
          ) : mine.length === 0 ? (
            <Text style={{ color: C.fg2, paddingHorizontal: 16, lineHeight: 20 }}>{t('creatorSubs.noneMineYet')}</Text>
          ) : (
            mine.map((s) => (
              <PersonLine
                key={s.id}
                sub={s}
                line={`${t('plus.perMonth', { price: money(s.amount_pence) })} · ${standing(s)}`}
                onPress={() => open(`/subscribe/${s.creator_id}`)}
                right={
                  changing === s.creator_id ? (
                    <ActivityIndicator color={C.fg2} />
                  ) : s.status === 'past_due' ? (
                    <Button small label={t('plus.payNow')} disabled={!!changing} onPress={() => payOverdue(s)} />
                  ) : (
                    <Button small kind="ghost" label={s.cancel_at_period_end ? t('plus.resume') : t('common.cancel')} disabled={!!changing} onPress={() => changeMine(s)} />
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
        title={t('subscribe.sheetDue', { username: overdue?.profile?.username ?? '' })}
        amountLabel={money(overdue?.amount_pence ?? 0, config?.currency)}
        start={startOverdue}
        onConfirmed={confirmedOverdue}
        onPaid={paidOverdue}
        walletLabel={t('subscribe.sheetWallet', { username: overdue?.profile?.username ?? '' })}
        wallet="support"
        note={t('subscribe.paysMissed')}
        footer={<RenewalTerms kind="creator" pricePence={overdue?.amount_pence ?? 0} currency={config?.currency} />}
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
      accessibilityLabel={label === t('creatorSubs.custom') ? t('creatorSubs.customPrice') : t('plus.perMonth', { price: label })}
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
      <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={`${p?.full_name ?? t('creatorSubs.someone')}, ${p?.username ?? ''}. ${line}`} style={({ pressed }) => ({ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, opacity: pressed ? 0.7 : 1 })}>
        <Avatar uri={p?.avatar_url} name={p?.full_name} size={46} />
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text numberOfLines={1} style={{ color: C.fg, fontWeight: '600', flexShrink: 1 }}>{p?.username ?? t('creatorSubs.accountUnavailable')}</Text>
            {p?.verified ? <VerifiedTick size={14} /> : null}
          </View>
          <Text numberOfLines={1} style={{ color: sub.status === 'past_due' ? C.warn : C.fg2, fontSize: 13.5 }}>{line}</Text>
        </View>
      </Pressable>
      {right}
    </View>
  );
}
