import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Icon, IconName, VerifiedTick } from '../../src/components/Icon';
import { Button, Row, Screen, ScreenHeader, SectionLabel, Sheet, Toggle, useToast } from '../../src/components/ui';
import { cancelSubscription, fetchBillingStatus, myPlusRequests, PLUS_PRICE_PENCE, requestPlus, resumeSubscription, updateProfile } from '../../src/lib/api';
import { fontById, useAppFont } from '../../src/lib/fonts';
import { money } from '../../src/lib/payments';
import { usePrefs } from '../../src/lib/prefs';
import { useSession } from '../../src/lib/session';
import { C, dayLabel, errText, monthName } from '../../src/lib/theme';
import type { BillingStatus, PlusRequest } from '../../src/lib/types';

/**
 * What Plus gives. The daily Erha allowance for everyone else lives in the Erha function.
 * The blue tick is not here on purpose: it comes only from an identity check (/verify), free for
 * everyone, so that it always means "this account is who it says it is" and never "this account paid".
 * Boosting a post is not here either: ads are paid for one by one, by anyone, from the post's menu.
 */
const PLUS_FEATURES: { icon: IconName; title: string; body: string }[] = [
  { icon: 'sparkle', title: 'Erha without limits', body: 'Ask Erha as much as you like. Everyone else gets 15 messages a day.' },
  { icon: 'font', title: 'App fonts', body: 'Set the whole app in Nunito, Lora or Poppins.' },
  { icon: 'wallpaper', title: 'Chat wallpapers', body: 'A look of your own behind every conversation.' },
  { icon: 'sliders', title: 'Advanced photo editing', body: 'Fine control over light, colour and detail before you post.' },
  { icon: 'eye', title: 'See who viewed your profile', body: 'The people who looked at your profile this week, by name.' },
  { icon: 'lock', title: 'Read receipts off', body: 'Read messages in your own time without anyone seeing "Seen".' },
  { icon: 'headphones', title: 'Share on Pod', body: 'Upload your songs and podcast episodes for the community to play.' },
  { icon: 'lifebuoy', title: 'Quick support', body: 'Your questions and reports are answered first.' },
  { icon: 'bulb', title: 'New features first', body: 'Try what is coming to Community before everyone else.' },
];

const PRICE = money(PLUS_PRICE_PENCE);

/** "9 November", with the year when it is not this year. */
function longDay(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const year = d.getFullYear() === new Date().getFullYear() ? '' : ` ${d.getFullYear()}`;
  return `${d.getDate()} ${monthName(d)}${year}`;
}

/** Subscriptions that still renew (or are trying to), and so can be cancelled. */
const RENEWING = ['active', 'trialing', 'past_due', 'unpaid'];

/** Where the subscription stands, in one line. */
function subscriptionLine(b: BillingStatus): string {
  const day = longDay(b.current_period_end);
  if (b.status === 'past_due' || b.status === 'unpaid') return 'Payment failed — update your card';
  if (b.status === 'incomplete') return 'Your first payment is not finished yet';
  if (b.status === 'canceled') return day ? `Ended on ${day}` : 'Ended';
  if (b.cancel_at_period_end) return day ? `Ends on ${day}` : 'Ends at the end of this month';
  return day ? `Renews on ${day}` : 'Renews monthly';
}

export default function Plus() {
  const { me, profile, refresh } = useSession();
  const router = useRouter();
  const toast = useToast();
  const { appFont } = usePrefs();
  const fontBold = useAppFont('bold');
  const [requests, setRequests] = useState<PlusRequest[]>([]);
  // The sheet for asking an admin to activate Plus that a church has arranged. (The tick has its own screen, /verify.)
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  // The Stripe subscription, when there is one. Null when there is none or payments are not set up.
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [changing, setChanging] = useState(false);
  // Read receipts: shown at once when tapped, then put back if the save fails.
  const [receipts, setReceipts] = useState(profile?.read_receipts ?? true);
  useEffect(() => { setReceipts(profile?.read_receipts ?? true); }, [profile?.read_receipts]);

  const load = useCallback(() => {
    myPlusRequests(me).then(setRequests).catch(() => {});
    fetchBillingStatus().then(setBilling).catch(() => setBilling(null));
  }, [me]);
  useFocusEffect(load);

  const hasSub = !!billing && billing.status !== 'none' && billing.status !== 'incomplete_expired';
  const failed = billing?.status === 'past_due' || billing?.status === 'unpaid';

  function changeRenewal() {
    if (!billing || changing) return;
    const resume = billing.cancel_at_period_end;
    const day = longDay(billing.current_period_end);
    Alert.alert(
      resume ? 'Resume Plus?' : 'Cancel Plus?',
      resume ? `Plus will renew${day ? ` on ${day}` : ''} at ${PRICE} a month.` : `You will not be charged again. Plus stays on${day ? ` until ${day}` : ' until the end of this month'}.`,
      [
        { text: resume ? 'Not now' : 'Keep Plus', style: 'cancel' },
        {
          text: resume ? 'Resume' : 'Cancel subscription',
          style: resume ? 'default' : 'destructive',
          onPress: async () => {
            setChanging(true);
            try {
              setBilling(await (resume ? resumeSubscription() : cancelSubscription()));
              toast(resume ? 'Plus will renew as normal' : day ? `Plus will end on ${day}` : 'Plus will end at the end of this month');
              refresh();
            } catch (e) {
              toast(errText(e));
            } finally {
              setChanging(false);
            }
          },
        },
      ],
    );
  }

  const pending = (kind: 'verify' | 'plus') => requests.find((r) => r.kind === kind && r.status === 'pending');

  function setReadReceipts(next: boolean) {
    const before = receipts;
    setReceipts(next);
    updateProfile(me, { read_receipts: next }).then(refresh).catch((e) => { setReceipts(before); toast(errText(e)); });
  }

  async function send() {
    if (!asking || busy) return;
    setBusy(true);
    try {
      await requestPlus(me, 'plus', note);
      toast('Request sent. An admin will activate Plus once your church confirms it.');
      setAsking(false);
      setNote('');
      load();
    } catch (e) {
      toast(errText(e));
    } finally {
      setBusy(false);
    }
  }

  const until = profile?.plus_until ? dayLabel(new Date(profile.plus_until)) : '';

  return (
    <Screen>
      <ScreenHeader title="Community Plus" />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={{ alignItems: 'center', paddingVertical: 22, gap: 10 }}>
          <View style={{ width: 92, height: 92, borderRadius: 46, backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="crown" size={48} color={C.accent2} />
          </View>
          <Text style={{ color: C.fg, fontSize: 24, fontWeight: '800' }}>Community Plus</Text>
          <Text style={{ color: C.fg2, textAlign: 'center', lineHeight: 21, paddingHorizontal: 32 }}>
            {profile?.plus ? `Active until ${until}. Thank you for supporting the community.` : 'Support the community and get Erha without limits, app fonts, chat wallpapers and more.'}
          </Text>
        </View>

        <View style={{ marginHorizontal: 16, borderRadius: 18, backgroundColor: C.surface, overflow: 'hidden' }}>
          {PLUS_FEATURES.map((f, i) => (
            <View key={f.title} style={{ flexDirection: 'row', gap: 14, padding: 16, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }}>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={f.icon} size={22} color={C.accent2} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.fg, fontWeight: '700', fontSize: 16 }}>{f.title}</Text>
                <Text style={{ color: C.fg2, marginTop: 2, lineHeight: 19 }}>{f.body}</Text>
              </View>
            </View>
          ))}
        </View>

        <Text style={{ color: C.fg, fontWeight: '700', textAlign: 'center', paddingTop: 18, fontSize: 15.5 }}>{PRICE} a month · cancel any time</Text>

        {hasSub && billing ? (
          <>
            <SectionLabel>Your subscription</SectionLabel>
            <View style={{ marginHorizontal: 16, borderRadius: 18, backgroundColor: C.surface, overflow: 'hidden', paddingBottom: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 }}>
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: failed ? C.like + '24' : C.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={failed ? 'info' : 'card'} size={22} color={failed ? C.like : C.accent2} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.fg, fontWeight: '700', fontSize: 16 }}>Community Plus · {PRICE} a month</Text>
                  <Text style={{ color: failed ? C.like : C.fg2, marginTop: 2, lineHeight: 19 }}>{subscriptionLine(billing)}</Text>
                </View>
              </View>
              {failed || billing.status === 'incomplete' ? (
                <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
                  <Button label={failed ? 'Pay now' : 'Finish paying'} onPress={() => router.push('/checkout')} />
                </View>
              ) : null}
              <Row icon="card" title="Payment methods" onPress={() => router.push('/payment-methods')} />
              <Row icon="receipt" title="Payment history" onPress={() => router.push('/payments')} />
              {RENEWING.includes(billing.status) ? (
                <Row
                  icon={billing.cancel_at_period_end ? 'repeat' : 'close'}
                  title={billing.cancel_at_period_end ? 'Resume subscription' : 'Cancel subscription'}
                  color={billing.cancel_at_period_end ? C.accent2 : C.like}
                  chevron={false}
                  onPress={changing ? undefined : changeRenewal}
                  right={changing ? <ActivityIndicator color={C.fg2} /> : undefined}
                />
              ) : null}
            </View>
          </>
        ) : null}

        {profile?.plus ? (
          <>
            <SectionLabel>Your Plus settings</SectionLabel>
            <View style={{ marginHorizontal: 16, borderRadius: 18, backgroundColor: C.surface, overflow: 'hidden', paddingVertical: 4 }}>
              <Row icon="font" title="App font" value={fontById(appFont).name} onPress={() => router.push('/plus-font')} />
              <Row icon="wallpaper" title="Chat wallpaper" onPress={() => router.push('/chat-wallpaper' as any)} />
              <Row icon="eye" title="Profile viewers" onPress={() => router.push('/profile-viewers')} />
              <Row icon="lock" title="Read receipts" sub={receipts ? 'People see when you have read their messages' : 'Nobody sees "Seen" on your side'} right={<Toggle value={receipts} onChange={setReadReceipts} label="Read receipts" />} />
            </View>
          </>
        ) : null}

        <View style={{ paddingHorizontal: 16, paddingTop: 22, gap: 10 }}>
          {profile?.plus ? (
            hasSub ? null : <Text style={{ color: C.fg2, textAlign: 'center', lineHeight: 20 }}>Plus renews through your church. Speak to an admin to extend it.</Text>
          ) : (
            <>
              <Button label={`Get Plus · ${PRICE} a month`} onPress={() => router.push('/checkout')} />
              {pending('plus') ? (
                <View style={{ padding: 14, borderRadius: 14, backgroundColor: C.surface }}>
                  <Text style={{ color: C.fg, fontWeight: '700' }}>Your Plus request is with the admins</Text>
                  <Text style={{ color: C.fg2, marginTop: 2, lineHeight: 19 }}>Sent {dayLabel(new Date(pending('plus')!.created_at))}. Plus is activated once your church confirms your contribution.</Text>
                </View>
              ) : (
                <Pressable
                  onPress={() => setAsking(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Arranged through your church? Ask an admin"
                  style={({ pressed }) => ({ height: 46, paddingHorizontal: 14, borderRadius: 12, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.75 : 1 })}>
                  <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={{ color: C.fg, fontWeight: '600', fontSize: 15.5, fontFamily: fontBold }}>
                    Arranged through your church? Ask an admin
                  </Text>
                </Pressable>
              )}
            </>
          )}
          <Text style={{ color: C.fg3, fontSize: 13, textAlign: 'center', lineHeight: 18, paddingTop: 6 }}>
            Card payments are processed securely by Stripe and Plus switches on straight away. If your church arranges Plus for you, an admin can activate it instead.
          </Text>
        </View>

        {/* The tick is separate from Plus and free: it only ever comes from an identity check. */}
        {profile?.verified ? null : (
          <Pressable
            onPress={() => router.push('/verify' as any)}
            accessibilityRole="link"
            accessibilityLabel={pending('verify') ? 'Your identity check is being reviewed' : 'Want the blue tick? Verify your identity'}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, marginTop: 20, padding: 14, borderRadius: 16, backgroundColor: C.surface, opacity: pressed ? 0.75 : 1 })}>
            <VerifiedTick size={26} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.fg, fontWeight: '700' }}>{pending('verify') ? 'Your identity check is being reviewed' : 'Want the blue tick? Verify your identity'}</Text>
              <Text style={{ color: C.fg2, marginTop: 2, lineHeight: 19, fontSize: 13.5 }}>
                {pending('verify') ? "We'll let you know when an admin has decided." : 'Free and separate from Plus. The tick shows that an account is who it says it is.'}
              </Text>
            </View>
            <Icon name="right" size={16} color={C.fg2} weight={2} />
          </Pressable>
        )}
      </ScrollView>

      <Sheet visible={asking} onClose={() => setAsking(false)} title="Get Community Plus">
        <View style={{ paddingHorizontal: 20, gap: 12, paddingBottom: 8 }}>
          <Text style={{ color: C.fg2, lineHeight: 20 }}>Tell the admins which church you belong to and how you have contributed, so they can confirm it with your church.</Text>
          <TextInput value={note} onChangeText={setNote} placeholder="A short note for the admins" placeholderTextColor={C.fg3} multiline maxLength={500} keyboardAppearance={C.blurTint} accessibilityLabel="Note for the admins" style={{ minHeight: 96, color: C.fg, fontSize: 16, padding: 14, borderRadius: 12, backgroundColor: C.surface, textAlignVertical: 'top' }} />
          <Button label="Send request" onPress={send} busy={busy} />
        </View>
      </Sheet>
    </Screen>
  );
}
