import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, IconName, VerifiedTick } from '../../../src/components/Icon';
import { type PayStart, useInstantPay } from '../../../src/components/PaySheet';
import { RenewalTerms } from '../../../src/components/RenewalTerms';
import { Avatar, Button, Empty, ErrorNote, Loading, Screen, ScreenHeader, useToast } from '../../../src/components/ui';
import { cancelCreatorSubscription, getProfile, mySubscriptions, startCreatorSubscription, syncCreatorSubscription, syncCreatorSubscriptionUntilOn } from '../../../src/lib/api';
import { tap } from '../../../src/lib/haptics';
import { tSplit, useT } from '../../../src/lib/i18n';
import { ensureStripe, money } from '../../../src/lib/payments';
import { useSession } from '../../../src/lib/session';
import { C, dayLabel, errText } from '../../../src/lib/theme';
import type { CreatorSub, Profile } from '../../../src/lib/types';

/** A subscription that still gives access (a failed renewal keeps it for a little while). */
const LIVE = ['active', 'trialing', 'past_due'];

/**
 * Subscribing to a creator (/subscribe/[id]): who they are, the monthly price and what it gives.
 * Subscribe starts paying at once (Apple Pay, or the payment sheet with saved cards); after that Stripe
 * renews it each month until it is cancelled. The money goes to the creator's own payout account.
 */
export default function Subscribe() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const creatorId = String(id);
  const { me } = useSession();
  const router = useRouter();
  const toast = useToast();
  const t = useT();
  const insets = useSafeAreaInsets();
  const [creator, setCreator] = useState<Profile | null | undefined>(undefined);
  const [sub, setSub] = useState<CreatorSub | null>(null);
  const [error, setError] = useState('');
  const [currency, setCurrency] = useState('GBP');
  // After paying, while Stripe is asked whether the subscription is on yet.
  const [settling, setSettling] = useState(false);
  const [changing, setChanging] = useState(false);
  // The status Stripe gave while paying, so the read-back afterwards starts from it.
  const known = useRef<string | null>(null);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  // One screen per tap, however quickly a button is tapped twice.
  const lastPush = useRef(0);
  const open = (href: string) => {
    if (Date.now() - lastPush.current < 800) return;
    lastPush.current = Date.now();
    router.push(href);
  };

  const load = useCallback(async () => {
    setError('');
    try {
      const [p, mine] = await Promise.all([getProfile(creatorId), mySubscriptions(me).catch(() => null)]);
      if (!alive.current) return;
      setCreator(p);
      // A list that didn't load keeps what is on screen, rather than turning a subscription into a Subscribe button.
      if (mine) setSub(mine.find((s) => s.creator_id === creatorId) ?? null);
    } catch (e) {
      if (alive.current) setError(errText(e));
    }
  }, [creatorId, me]);
  // On every visit: back from Payment methods after a failed renewal, say.
  useFocusEffect(useCallback(() => { load(); }, [load]));
  // The currency prices are shown in. Not worth an error if it fails.
  useEffect(() => {
    ensureStripe()
      .then((c) => {
        if (alive.current) setCurrency(c.currency || 'GBP');
      })
      .catch(() => {});
  }, []);

  /** The server's answer, shaped for the payment sheet. A PaymentIntent's id is the start of its client secret. */
  const start = useCallback(async (): Promise<PayStart> => {
    known.current = null;
    const r = await startCreatorSubscription(creatorId);
    // Already paid, though Stripe may not have marked it active yet: the read-back below starts from what the server saw.
    if (r.already) known.current = r.status ?? null;
    const secret = r.client_secret ?? '';
    return { already: !!r.already, client_secret: secret, payment_intent_id: secret.split('_secret_')[0], amount: r.amount ?? creator?.sub_price_pence ?? 0, currency: r.currency ?? 'GBP' };
  }, [creatorId, creator?.sub_price_pence]);

  // Read back from Stripe after paying, instead of settling a one-off payment.
  const confirmed = useCallback(async () => {
    const r = await syncCreatorSubscription(creatorId);
    known.current = r.status;
  }, [creatorId]);

  /**
   * Paid (or found already paid). Stripe can take a few seconds to move a subscription from
   * 'incomplete' (or 'past_due', for a renewal paid late) to 'active', so it is asked again a few times
   * before the screen says anything, rather than claiming success and then offering Subscribe again.
   */
  async function paid() {
    const wasOverdue = sub?.status === 'past_due';
    const name = creator?.username ?? t('subscribe.them');
    setSettling(true);
    const on = await syncCreatorSubscriptionUntilOn(creatorId, known.current);
    if (!alive.current) return;
    if (on) {
      tap('success');
      toast(wasOverdue ? t('subscribe.paidCarriesOn', { username: name }) : t('subscribe.subscribedTo', { username: name }));
    } else {
      toast(t('subscribe.paymentReceived'));
    }
    // The button keeps spinning until the page has the new subscription, so Subscribe doesn't show again in between.
    await load();
    if (alive.current) setSettling(false);
  }

  function changeRenewal() {
    if (!sub || changing) return;
    const resume = sub.cancel_at_period_end;
    const day = sub.current_period_end ? dayLabel(new Date(sub.current_period_end)) : '';
    const run = async () => {
      setChanging(true);
      try {
        const r = await cancelCreatorSubscription(creatorId, resume);
        // Shown at once from Stripe's answer; the read-back below confirms it.
        if (alive.current) setSub((s) => (s ? { ...s, status: r.status || s.status, cancel_at_period_end: !!r.cancel_at_period_end } : s));
        tap('success');
        toast(resume ? t('subscribe.willRenew') : day ? t('subscribe.endsOn', { day }) : t('subscribe.willEnd'));
        await load();
      } catch (e) {
        toast(errText(e));
      } finally {
        if (alive.current) setChanging(false);
      }
    };
    if (resume) {
      run();
      return;
    }
    Alert.alert(t('subscribe.cancelQuestion'), day ? t('subscribe.cancelBody', { day }) : t('subscribe.cancelBodyPeriod'), [
      { text: t('subscribe.keepIt'), style: 'cancel' },
      { text: t('plus.cancelSubscription'), style: 'destructive', onPress: run },
    ]);
  }

  // What the payment is for, worked out before the page decides what to show (the hook runs on every draw).
  const liveSub = !!sub && LIVE.includes(sub.status);
  const payPence = liveSub && sub ? sub.amount_pence : creator?.sub_price_pence ?? 0;
  const payPrice = money(payPence, currency);
  const instant = useInstantPay({
    title: sub?.status === 'past_due' ? t('subscribe.sheetDue', { username: creator?.username ?? '' }) : t('subscribe.sheetFirst', { username: creator?.username ?? '' }),
    amountLabel: payPrice,
    start,
    onConfirmed: confirmed,
    onPaid: paid,
    walletLabel: t('subscribe.sheetWallet', { username: creator?.username ?? '' }),
    wallet: 'subscribe',
    note: sub?.status === 'past_due' ? t('subscribe.paysMissed') : undefined,
    footer: <RenewalTerms kind="creator" pricePence={payPence} currency={currency} />,
  });
  function subscribeNow() {
    tap('medium');
    instant.pay();
  }

  let body: React.ReactNode;
  // A failed refresh on coming back keeps the page as it was.
  if (error && creator === undefined) body = <ErrorNote message={error} onRetry={load} />;
  else if (creator === undefined) body = <Loading />;
  else if (creator === null) body = <Empty icon="user" title={t('profile.unavailable')} />;
  else if (creator.id === me) {
    body = <Empty icon="crown" title={t('subscribe.thisIsYou')} action={<Button label={t('subscribe.yourSubscriptions')} onPress={() => router.replace('/creator-subscriptions')} style={{ marginTop: 10, alignSelf: 'stretch' }} />} />;
  } else {
    const live = liveSub;
    const subscribed = creator.subscribed || live;
    const offered = creator.sub_price_pence;
    // A subscriber pays what they signed up at, even if the creator has changed the price since.
    const pence = payPence;
    const price = payPrice;
    const first = creator.full_name.trim().split(/\s+/)[0] || creator.username;
    const day = sub?.current_period_end ? dayLabel(new Date(sub.current_period_end)) : '';
    const perks: { icon: IconName; title: string }[] = [
      { icon: 'lock', title: t('subscribe.perkPosts') },
      { icon: 'heart', title: t('subscribe.perkSupport', { name: first }) },
      { icon: 'repeat', title: t('subscribe.perkCancel') },
    ];
    // The monthly price drawn large, wherever the language puts it among its words.
    const [perBefore, perAfter] = tSplit('plus.perMonth', 'price');

    // The bar at the bottom: one thing to do, or nothing (subscribed, but the subscription itself didn't load).
    let footer: React.ReactNode = null;
    if (settling) footer = <Button label={t('subscribe.confirming')} busy />;
    else if (sub?.status === 'past_due') {
      // A renewal that failed is paid on the same subscription, through the same payment sheet.
      footer = (
        <>
          <Button label={t('subscribe.payNow', { price })} busy={instant.busy} onPress={subscribeNow} />
          <Button label={t('plus.paymentMethods')} kind="ghost" onPress={() => open('/payment-methods')} />
        </>
      );
    } else if (subscribed) {
      if (sub) footer = <Button label={sub.cancel_at_period_end ? t('plus.resumeSubscription') : t('plus.cancelSubscription')} kind="ghost" busy={changing} onPress={changeRenewal} textColor={sub.cancel_at_period_end ? undefined : C.like} />;
    } else if (offered) {
      footer = (
        <>
          <Button label={t('subscribe.button', { price })} busy={instant.busy} onPress={subscribeNow} />
          <RenewalTerms kind="creator" pricePence={pence} currency={currency} />
        </>
      );
    }

    body = (
      <>
        <ScrollView contentContainerStyle={{ paddingBottom: 190 + insets.bottom }}>
          <View style={{ alignItems: 'center', paddingHorizontal: 24, paddingTop: 10, paddingBottom: 22, gap: 6 }}>
            <Avatar uri={creator.avatar_url} name={creator.full_name} size={92} />
            <Text style={{ color: C.fg, fontSize: 22, fontWeight: '800', textAlign: 'center', marginTop: 8 }}>{creator.full_name || creator.username}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={{ color: C.fg2, fontSize: 15 }}>@{creator.username}</Text>
              {creator.verified ? <VerifiedTick size={15} /> : null}
            </View>
            {offered || live ? (
              <Text style={{ color: C.fg, fontSize: 16, marginTop: 10 }}>
                {perBefore}<Text style={{ fontSize: 26, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{price}</Text>{perAfter}
              </Text>
            ) : null}
          </View>

          {subscribed ? (
            <View style={{ marginHorizontal: 16, marginBottom: 18, padding: 14, borderRadius: 16, backgroundColor: sub?.status === 'past_due' ? C.warn + '1f' : C.accentSoft, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Icon name={sub?.status === 'past_due' ? 'info' : 'check'} size={22} color={sub?.status === 'past_due' ? C.warn : C.accent2} weight={2.4} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.fg, fontSize: 15.5, fontWeight: '700' }}>
                  {sub?.status === 'past_due' ? t('subscribe.pastDue') : sub?.cancel_at_period_end ? t('subscribe.subscribedEnds', { day }) : day ? t('subscribe.subscribedRenews', { day }) : t('subscribe.subscribed')}
                </Text>
              </View>
            </View>
          ) : null}

          {offered || subscribed ? (
            <View style={{ paddingHorizontal: 20, gap: 18 }}>
              <Text accessibilityRole="header" style={{ color: C.fg, fontSize: 18, fontWeight: '800' }}>{subscribed ? t('subscribe.givesYou') : t('subscribe.whatYouGet')}</Text>
              {perks.map((p) => (
                <View key={p.title} style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                  <View style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name={p.icon} size={28} color={C.fg} weight={1.6} />
                  </View>
                  <Text style={{ flex: 1, color: C.fg, fontSize: 16, fontWeight: '700' }}>{p.title}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Empty icon="crown" title={t('subscribe.notOffered', { name: first })} />
          )}
        </ScrollView>

        {footer ? (
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 12, paddingBottom: insets.bottom + 10, gap: 8, backgroundColor: C.bg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line }}>
            {footer}
          </View>
        ) : null}

        {instant.sheet}
      </>
    );
  }

  return (
    <Screen>
      <ScreenHeader title={t('subscribe.title')} />
      {body}
    </Screen>
  );
}
