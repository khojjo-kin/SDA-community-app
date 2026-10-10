import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, IconName, VerifiedTick } from '../../../src/components/Icon';
import { PaySheet, type PayStart } from '../../../src/components/PaySheet';
import { Avatar, Button, Empty, ErrorNote, Loading, Screen, ScreenHeader, useToast } from '../../../src/components/ui';
import { cancelCreatorSubscription, getProfile, mySubscriptions, startCreatorSubscription, syncCreatorSubscription, syncCreatorSubscriptionUntilOn } from '../../../src/lib/api';
import { tap } from '../../../src/lib/haptics';
import { ensureStripe, money } from '../../../src/lib/payments';
import { useSession } from '../../../src/lib/session';
import { C, dayLabel, errText, fmt } from '../../../src/lib/theme';
import type { CreatorSub, Profile } from '../../../src/lib/types';

/** A subscription that still gives access (a failed renewal keeps it for a little while). */
const LIVE = ['active', 'trialing', 'past_due'];

/**
 * Subscribing to a creator (/subscribe/[id]): who they are, the monthly price, what it gives, and
 * the payment sheet. The first month is paid like any other payment in the app; after that Stripe
 * renews it each month until it is cancelled. The money goes to the creator's own payout account.
 */
export default function Subscribe() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const creatorId = String(id);
  const { me } = useSession();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const [creator, setCreator] = useState<Profile | null | undefined>(undefined);
  const [sub, setSub] = useState<CreatorSub | null>(null);
  const [error, setError] = useState('');
  const [fee, setFee] = useState<number | null>(null);
  const [paying, setPaying] = useState(false);
  // After paying, while Stripe is asked whether the subscription is on yet.
  const [settling, setSettling] = useState(false);
  const [changing, setChanging] = useState(false);
  // The status Stripe gave while paying, so the read-back afterwards starts from it.
  const known = useRef<string | null>(null);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const load = useCallback(async () => {
    setError('');
    try {
      const [p, mine] = await Promise.all([getProfile(creatorId), mySubscriptions(me).catch(() => [] as CreatorSub[])]);
      if (!alive.current) return;
      setCreator(p);
      setSub(mine.find((s) => s.creator_id === creatorId) ?? null);
    } catch (e) {
      if (alive.current) setError(errText(e));
    }
  }, [creatorId, me]);
  useEffect(() => { load(); }, [load]);
  // The app's share, for the honest line about where the money goes. Not worth an error if it fails.
  useEffect(() => {
    ensureStripe()
      .then((c) => { if (alive.current) setFee(c.creator_fee_percent); })
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
    const name = creator?.username ?? 'them';
    setPaying(false);
    setSettling(true);
    const on = await syncCreatorSubscriptionUntilOn(creatorId, known.current);
    if (!alive.current) return;
    setSettling(false);
    if (on) {
      tap('success');
      toast(wasOverdue ? `Paid. Your subscription to ${name} carries on` : `You're subscribed to ${name}`);
    } else {
      toast("Payment received. It's taking a moment to show here, so check back in a minute.");
    }
    load();
  }

  function changeRenewal() {
    if (!sub || changing) return;
    const resume = sub.cancel_at_period_end;
    const day = sub.current_period_end ? dayLabel(new Date(sub.current_period_end)) : '';
    const run = async () => {
      setChanging(true);
      try {
        await cancelCreatorSubscription(creatorId, resume);
        toast(resume ? 'Your subscription will renew' : day ? `Your subscription ends on ${day}` : 'Your subscription will end');
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
    Alert.alert('Cancel your subscription?', `You won't be charged again. You keep seeing their subscriber posts${day ? ` until ${day}` : ' until the end of the month you paid for'}.`, [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Cancel subscription', style: 'destructive', onPress: run },
    ]);
  }

  let body: React.ReactNode;
  if (error) body = <ErrorNote message={error} onRetry={load} />;
  else if (creator === undefined) body = <Loading />;
  else if (creator === null) body = <Empty icon="user" title="This account isn't available" />;
  else if (creator.id === me) {
    body = <Empty icon="crown" title="This is you" body="Set your own subscription price in Subscriptions." action={<Button label="Your subscriptions" onPress={() => router.replace('/creator-subscriptions')} style={{ marginTop: 10, alignSelf: 'stretch' }} />} />;
  } else {
    const live = !!sub && LIVE.includes(sub.status);
    const subscribed = creator.subscribed || live;
    const offered = creator.sub_price_pence;
    // A subscriber pays what they signed up at, even if the creator has changed the price since.
    const pence = live && sub ? sub.amount_pence : offered ?? 0;
    const price = money(pence);
    const first = creator.full_name.trim().split(/\s+/)[0] || creator.username;
    const day = sub?.current_period_end ? dayLabel(new Date(sub.current_period_end)) : '';
    const posts = creator.subscriber_posts;
    const perks: { icon: IconName; title: string; body: string }[] = [
      {
        icon: 'lock',
        title: 'Subscriber-only posts and clips',
        body: posts ? `See the ${fmt(posts)} ${posts === 1 ? 'post' : 'posts'} ${first} keeps for subscribers, and every new one.` : `See everything ${first} shares only with subscribers.`,
      },
      { icon: 'heart', title: `Support ${first} directly`, body: `Your payment goes to ${first}'s own account each month${fee != null ? `, less Community's ${fee}% share` : ', less a small share for Community'}.` },
      { icon: 'repeat', title: 'Cancel any time', body: "Stop it renewing whenever you like. You keep access until the end of the month you've paid for." },
    ];

    body = (
      <>
        <ScrollView contentContainerStyle={{ paddingBottom: 140 + insets.bottom }}>
          <View style={{ alignItems: 'center', paddingHorizontal: 24, paddingTop: 10, paddingBottom: 22, gap: 6 }}>
            <Avatar uri={creator.avatar_url} name={creator.full_name} size={92} />
            <Text style={{ color: C.fg, fontSize: 22, fontWeight: '800', textAlign: 'center', marginTop: 8 }}>{creator.full_name || creator.username}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={{ color: C.fg2, fontSize: 15 }}>@{creator.username}</Text>
              {creator.verified ? <VerifiedTick size={15} /> : null}
            </View>
            {offered || live ? (
              <Text style={{ color: C.fg, fontSize: 16, marginTop: 10 }}>
                <Text style={{ fontSize: 26, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{price}</Text> a month
              </Text>
            ) : null}
          </View>

          {subscribed ? (
            <View style={{ marginHorizontal: 16, marginBottom: 18, padding: 14, borderRadius: 16, backgroundColor: sub?.status === 'past_due' ? C.warn + '1f' : C.accentSoft, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Icon name={sub?.status === 'past_due' ? 'info' : 'check'} size={22} color={sub?.status === 'past_due' ? C.warn : C.accent2} weight={2.4} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.fg, fontSize: 15.5, fontWeight: '700' }}>
                  {sub?.status === 'past_due' ? "Your last payment didn't go through" : sub?.cancel_at_period_end ? `You're subscribed · ends ${day}` : day ? `You're subscribed · renews ${day}` : "You're subscribed"}
                </Text>
                {sub?.status === 'past_due' ? <Text style={{ color: C.fg2, fontSize: 13.5, lineHeight: 19, marginTop: 2 }}>Pay now to keep your subscription. Otherwise Stripe will try your card again in a few days.</Text> : null}
              </View>
            </View>
          ) : null}

          {offered || subscribed ? (
            <View style={{ paddingHorizontal: 20, gap: 18 }}>
              <Text accessibilityRole="header" style={{ color: C.fg, fontSize: 18, fontWeight: '800' }}>{subscribed ? 'Your subscription gives you' : "What you'll get"}</Text>
              {perks.map((p) => (
                <View key={p.title} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 14 }}>
                  <View style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name={p.icon} size={28} color={C.fg} weight={1.6} />
                  </View>
                  <View style={{ flex: 1, paddingTop: 1 }}>
                    <Text style={{ color: C.fg, fontSize: 16, fontWeight: '700' }}>{p.title}</Text>
                    <Text style={{ color: C.fg2, fontSize: 14.5, lineHeight: 20, marginTop: 2 }}>{p.body}</Text>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <Empty icon="crown" title={`${first} doesn't offer subscriptions`} body="When they do, you'll be able to subscribe here." />
          )}
        </ScrollView>

        {offered || subscribed ? (
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 12, paddingBottom: insets.bottom + 10, gap: 8, backgroundColor: C.bg, borderTopWidth: 1, borderTopColor: C.line }}>
            {settling ? (
              <>
                <Button label="Confirming your payment" busy />
                <Text style={{ color: C.fg3, fontSize: 12.5, lineHeight: 17, textAlign: 'center' }}>Checking with Stripe that your subscription is on. This takes a few seconds.</Text>
              </>
            ) : subscribed ? (
              sub && sub.status !== 'past_due' ? (
                <Button label={sub.cancel_at_period_end ? 'Resume subscription' : 'Cancel subscription'} kind="ghost" busy={changing} onPress={changeRenewal} textColor={sub.cancel_at_period_end ? undefined : C.like} />
              ) : sub?.status === 'past_due' ? (
                // A renewal that failed is paid on the same subscription, through the same payment sheet.
                <>
                  <Button label={`Pay now · ${price}`} onPress={() => { tap('medium'); setPaying(true); }} />
                  <Button label="Payment methods" kind="ghost" onPress={() => router.push('/payment-methods')} />
                </>
              ) : null
            ) : (
              <>
                <Button label={`Subscribe · ${price} a month`} onPress={() => { tap('medium'); setPaying(true); }} />
                <Text style={{ color: C.fg3, fontSize: 12.5, lineHeight: 17, textAlign: 'center' }}>Renews every month at {price} until you cancel.</Text>
              </>
            )}
          </View>
        ) : null}

        <PaySheet
          visible={paying}
          onClose={() => setPaying(false)}
          title={sub?.status === 'past_due' ? `Subscription to @${creator.username} · payment due` : `Subscription to @${creator.username} · first month`}
          amountLabel={price}
          start={start}
          onConfirmed={confirmed}
          onPaid={paid}
          walletLabel={`Subscription to @${creator.username}`}
          wallet="support"
          note={sub?.status === 'past_due' ? `Pays the month that didn't go through. Then it renews every month at ${price} until you cancel.` : `Renews every month at ${price} until you cancel. Cancel any time in Settings › Subscriptions.`}
        />
      </>
    );
  }

  return (
    <Screen>
      <ScreenHeader title="Subscribe" />
      {body}
    </Screen>
  );
}
