import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, Share, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { hasEnded, penceFrom, ProgressBar, progressOf } from '../../../src/components/FundraiserCard';
import { Icon, VerifiedTick } from '../../../src/components/Icon';
import { PayPanel } from '../../../src/components/PaySheet';
import { Avatar, Button, Empty, ErrorNote, Field, Loading, RoundButton, Screen, ScreenHeader, SectionLabel, Sheet, Toggle, useToast } from '../../../src/components/ui';
import { closeFundraiser, deleteFundraiser, fetchFundraiser, fetchSupporters, refreshFundraiserReady, startDonation } from '../../../src/lib/api';
import { t } from '../../../src/lib/i18n';
import { money } from '../../../src/lib/payments';
import { useSession } from '../../../src/lib/session';
import { ago, C, dayLabel, errText, fmt } from '../../../src/lib/theme';
import type { Fundraiser, Supporter } from '../../../src/lib/types';

/** Quick amounts, in pence. Anything from £1 to £10,000 can be typed instead. */
const PRESETS = [500, 1000, 2000, 5000];
const MIN_GIFT = 100;
const MAX_GIFT = 1_000_000;

/** Shown when the owner tries to delete a fundraiser someone is part-way through giving to. */
const GIVING_NOW = "Someone is giving right now, so it can't be deleted. You can end it instead.";

/** "12 Oct", with the year when it is not this year. */
function day(iso: string): string {
  const d = new Date(iso);
  return d.getFullYear() === new Date().getFullYear() ? dayLabel(d) : `${dayLabel(d)} ${d.getFullYear()}`;
}

/**
 * One fundraiser: how far it has got, who has given, and a way to give. Gifts go straight to the
 * owner's own Stripe account; the app takes nothing. The owner gets edit, payouts and end instead.
 */
export default function FundraiserScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const fundraiserId = String(id ?? '');
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { me } = useSession();
  const [f, setF] = useState<Fundraiser | null>(null);
  const [missing, setMissing] = useState(false);
  const [supporters, setSupporters] = useState<Supporter[]>([]);
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  // Stripe is asked at most once a visit whether the owner can take gifts yet.
  const readyAsked = useRef(false);

  // The donation sheet: choose an amount, then pay, in one sheet (two stacked modals do not show on iOS).
  const [giving, setGiving] = useState(false);
  const [step, setStep] = useState<'amount' | 'pay'>('amount');
  const [preset, setPreset] = useState<number | null>(1000);
  const [custom, setCustom] = useState('');
  const [message, setMessage] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [paying, setPaying] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const [row, list] = await Promise.all([fetchFundraiser(fundraiserId), fetchSupporters(fundraiserId).catch(() => [] as Supporter[])]);
      if (!alive.current) return;
      setF(row);
      setMissing(!row);
      setSupporters(list);
      // The stored "taking donations" flag only changes when Stripe tells the server, so it can lag
      // behind an owner who has just finished setting up payouts. Ask once, quietly: if they can take
      // gifts now, the Donate button appears; if the check fails, the page stays as it was.
      if (row && !row.accepting && row.status === 'active' && !hasEnded(row) && !readyAsked.current) {
        readyAsked.current = true;
        refreshFundraiserReady(row.id)
          .then((ready) => {
            if (ready && alive.current) setF((old) => (old && old.id === row.id ? { ...old, accepting: true } : old));
          })
          .catch(() => {});
      }
    } catch (e) {
      if (alive.current) setError(errText(e));
    }
  }, [fundraiserId]);
  // Back from editing it, or from setting up payouts: show the latest.
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const gift = preset ?? penceFrom(custom);
  const giftOk = gift !== null && gift >= MIN_GIFT && gift <= MAX_GIFT;

  function openGiving() {
    setStep('amount');
    setGiving(true);
  }

  function closeGiving() {
    // Never mid-payment: the sheet would vanish with the money half-way.
    if (paying) return;
    setGiving(false);
  }

  function paid(_paymentIntentId: string, slow: boolean) {
    setPaying(false);
    setGiving(false);
    setMessage('');
    setCustom('');
    setPreset(1000);
    setAnonymous(false);
    toast(slow ? 'Payment received — it may take a minute to show' : 'Thank you for your gift');
    load();
  }

  async function share() {
    if (!f) return;
    try {
      await Share.share({ message: `${f.title} — ${money(f.raised_pence, f.currency)} raised of ${money(f.goal_pence, f.currency)} on Community. community://fundraiser/${f.id}` });
    } catch {
      // Closing the share sheet is not worth a message.
    }
  }

  function end() {
    if (!f || working) return;
    Alert.alert('End this fundraiser?', 'It will stop taking gifts and come off your profile. Gifts already made are not affected. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End fundraiser',
        style: 'destructive',
        onPress: async () => {
          setWorking(true);
          try {
            await closeFundraiser(f.id);
            toast('Fundraiser ended');
            await load();
          } catch (e) {
            toast(errText(e));
          } finally {
            if (alive.current) setWorking(false);
          }
        },
      },
    ]);
  }

  function remove() {
    // Only offered while nobody has given; once someone has, it can be ended instead.
    if (!f || working || f.raised_pence > 0 || f.donor_count > 0) return;
    Alert.alert('Delete this fundraiser?', 'Nobody has given yet, so it can be removed completely.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setWorking(true);
          let failure: unknown = null;
          try {
            await deleteFundraiser(f.id);
          } catch (e) {
            failure = e;
          }
          // The database keeps a fundraiser someone is paying a gift to (it is not in the totals until
          // the payment goes through), and may do so without an error, so look whether it has gone.
          const still = await fetchFundraiser(f.id).catch(() => undefined);
          if (!alive.current) return;
          if (still || (still === undefined && failure)) {
            toast(still ? GIVING_NOW : errText(failure));
            setWorking(false);
            // The gift may have gone through by now: show the latest total.
            if (still) load();
            return;
          }
          toast('Fundraiser deleted');
          if (router.canGoBack()) router.back();
          else router.replace('/payouts');
        },
      },
    ]);
  }

  let body: React.ReactNode;
  let footer: React.ReactNode = null;
  if (error && !f) body = <ErrorNote message={error} onRetry={load} />;
  else if (missing) body = <Empty icon="gift" title="This fundraiser isn't available" body="It may have been deleted." />;
  else if (!f) body = <Loading />;
  else {
    const mine = f.user_id === me;
    const ended = hasEnded(f);
    const raised = money(f.raised_pence, f.currency);
    const goal = money(f.goal_pence, f.currency);
    const pct = Math.round(progressOf(f) * 100);
    body = (
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        {f.cover_url ? (
          <Image source={{ uri: f.cover_url }} style={{ marginHorizontal: 16, height: 200, borderRadius: 18, backgroundColor: C.surface2 }} contentFit="cover" transition={150} accessibilityIgnoresInvertColors />
        ) : (
          <View style={{ marginHorizontal: 16, height: 120, borderRadius: 18, backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="gift" size={48} color={C.accent2} />
          </View>
        )}

        <View style={{ paddingHorizontal: 16, paddingTop: 16, gap: 14 }}>
          <Text accessibilityRole="header" style={{ color: C.fg, fontSize: 23, fontWeight: '800', lineHeight: 29 }}>{f.title}</Text>

          <Pressable onPress={() => router.push(`/user/${f.user_id}`)} accessibilityRole="button" accessibilityLabel={`Organised by ${f.full_name || f.username}. Open profile`} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, opacity: pressed ? 0.7 : 1 })}>
            <Avatar uri={f.avatar_url} name={f.full_name || f.username} size={38} />
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text numberOfLines={1} style={{ color: C.fg, fontWeight: '700', fontSize: 15.5, flexShrink: 1 }}>{f.full_name || f.username}</Text>
                {f.verified ? <VerifiedTick size={14} /> : null}
              </View>
              <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 13.5 }}>Organiser · @{f.username}</Text>
            </View>
            <Icon name="right" size={18} color={C.fg2} weight={2} />
          </Pressable>

          <View style={{ padding: 16, borderRadius: 16, backgroundColor: C.surface, gap: 10 }}>
            <Text style={{ color: C.fg2, fontSize: 15, fontVariant: ['tabular-nums'] }}>
              <Text style={{ color: C.fg, fontSize: 24, fontWeight: '800' }}>{raised}</Text> raised of {goal}
            </Text>
            <ProgressBar value={progressOf(f)} height={8} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ color: C.fg2, fontSize: 13.5 }}>{f.donor_count === 1 ? '1 supporter' : `${fmt(f.donor_count)} supporters`}</Text>
              <Text style={{ color: C.fg2, fontSize: 13.5, fontVariant: ['tabular-nums'] }}>{pct}%</Text>
            </View>
            {ended ? (
              <Text style={{ color: C.fg, fontSize: 13.5, fontWeight: '600' }}>This fundraiser has ended{f.status !== 'closed' && f.ends_at ? ` (${day(f.ends_at)})` : ''}.</Text>
            ) : f.ends_at ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Icon name="clock" size={15} color={C.fg2} />
                <Text style={{ color: C.fg2, fontSize: 13.5 }}>Ends {day(f.ends_at)}</Text>
              </View>
            ) : null}
          </View>

          {mine ? (
            <View style={{ gap: 10 }}>
              {!ended && !f.accepting ? (
                <View style={{ flexDirection: 'row', gap: 10, padding: 12, borderRadius: 12, backgroundColor: C.warn + '1f' }}>
                  <Icon name="info" size={18} color={C.warn} />
                  <Text style={{ flex: 1, color: C.fg, fontSize: 14, lineHeight: 19 }}>Not taking donations yet. Set up payouts so gifts can reach your bank.</Text>
                </View>
              ) : null}
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Button label="Edit" kind="ghost" onPress={() => router.push(`/fundraiser-new?id=${f.id}`)} style={{ flex: 1 }} />
                <Button label="Payouts" kind={!ended && !f.accepting ? 'primary' : 'ghost'} onPress={() => router.push('/payouts')} style={{ flex: 1 }} />
              </View>
              {!ended ? <Button label="End fundraiser" kind="ghost" busy={working} onPress={end} /> : null}
              {f.raised_pence === 0 && f.donor_count === 0 ? (
                <Pressable onPress={remove} disabled={working} accessibilityRole="button" accessibilityLabel="Delete fundraiser" style={{ alignSelf: 'center', paddingVertical: 6 }}>
                  <Text style={{ color: C.like, fontSize: 14.5, fontWeight: '600' }}>Delete fundraiser</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {f.description ? <Text style={{ color: C.fg, fontSize: 15.5, lineHeight: 23 }} selectable>{f.description}</Text> : null}
        </View>

        <SectionLabel>Recent supporters</SectionLabel>
        {supporters.length ? (
          supporters.map((s) => (
            <View key={s.id} style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 9 }}>
              {s.username ? (
                <Avatar uri={s.avatar_url} name={s.full_name} size={38} />
              ) : (
                <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="heart" size={18} color={C.fg2} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                  <Text numberOfLines={1} style={{ color: C.fg, fontWeight: '600', fontSize: 15, flexShrink: 1 }}>{s.username ? s.full_name || s.username : 'Anonymous'}</Text>
                  <Text style={{ color: C.fg3, fontSize: 12.5 }}>{ago(s.created_at)}</Text>
                </View>
                <Text style={{ color: C.accent2, fontWeight: '700', fontSize: 14, marginTop: 1, fontVariant: ['tabular-nums'] }}>{money(s.amount_pence, s.currency)}</Text>
                {s.message ? <Text style={{ color: C.fg2, fontSize: 14, lineHeight: 19, marginTop: 3 }}>{s.message}</Text> : null}
              </View>
            </View>
          ))
        ) : (
          <Text style={{ color: C.fg2, paddingHorizontal: 16, lineHeight: 20 }}>{ended ? 'Nobody gave to this fundraiser.' : 'No gifts yet. Be the first to give.'}</Text>
        )}
      </ScrollView>
    );

    // The owner does not give to their own fundraiser.
    if (!mine) {
      const open = !ended && f.accepting;
      footer = (
        <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: insets.bottom + 10, backgroundColor: C.bg, borderTopWidth: 1, borderTopColor: C.line }}>
          <Button label={ended ? 'This fundraiser has ended' : open ? 'Donate' : 'Not taking donations yet'} disabled={!open} onPress={openGiving} />
        </View>
      );
    }
  }

  const amountLabel = f && giftOk ? money(gift!, f.currency) : '';
  return (
    <Screen>
      <ScreenHeader title="Fundraiser" right={f ? <RoundButton name="share" label="Share fundraiser" onPress={share} iconSize={22} /> : undefined} />
      {body}
      {footer}

      <Sheet visible={giving} onClose={closeGiving} title={step === 'amount' ? 'Give' : 'Payment'} tall>
        {f && step === 'amount' ? (
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 20, gap: 14 }}>
            <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', gap: 8 }}>
              {PRESETS.map((p) => {
                const on = preset === p;
                return (
                  <Pressable
                    key={p}
                    onPress={() => {
                      setPreset(p);
                      setCustom('');
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={money(p, f.currency)}
                    style={({ pressed }) => ({ flex: 1, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? C.accent : pressed ? C.surface2 : C.surface })}>
                    <Text style={{ color: on ? C.onAccent : C.fg, fontWeight: '700', fontSize: 16 }}>{money(p, f.currency).replace(/\.00$/, '')}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={{ gap: 6 }}>
              <Text style={{ color: C.fg2, fontSize: 12.5 }}>Or another amount</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 12, backgroundColor: C.surface, paddingLeft: 14, borderWidth: 1, borderColor: preset === null && custom ? C.accent : 'transparent' }}>
                <Text style={{ color: C.fg2, fontSize: 16 }}>£</Text>
                <TextInput
                  value={custom}
                  onChangeText={(v) => {
                    setCustom(v.replace(/[^0-9.,]/g, ''));
                    setPreset(null);
                  }}
                  onFocus={() => setPreset(null)}
                  placeholder="25"
                  placeholderTextColor={C.fg3}
                  selectionColor={C.accent2}
                  keyboardAppearance={C.blurTint}
                  keyboardType="decimal-pad"
                  maxLength={9}
                  accessibilityLabel="Another amount in pounds"
                  style={{ flex: 1, color: C.fg, fontSize: 16, paddingLeft: 4, paddingRight: 14, paddingVertical: 13, fontVariant: ['tabular-nums'] }}
                />
              </View>
              {preset === null && custom && !giftOk ? (
                <Text style={{ color: C.like, fontSize: 13 }}>{gift === null ? 'Type an amount in pounds, like 25 or 12.50.' : 'Give between £1 and £10,000.'}</Text>
              ) : null}
            </View>
            <Field label="Message (optional)" value={message} onChangeText={setMessage} placeholder="Praying for you all" maxLength={300} multiline style={{ minHeight: 70, textAlignVertical: 'top' }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 14, backgroundColor: C.surface }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.fg, fontSize: 15.5, fontWeight: '600' }}>Give anonymously</Text>
                <Text style={{ color: C.fg2, fontSize: 13.5, lineHeight: 18, marginTop: 2 }}>Your name and photo won't appear on the fundraiser.</Text>
              </View>
              <Toggle value={anonymous} onChange={setAnonymous} label="Give anonymously" />
            </View>
            <Button label={giftOk ? `Continue · ${amountLabel}` : 'Continue'} disabled={!giftOk} onPress={() => setStep('pay')} />
            <Text style={{ color: C.fg3, fontSize: 12.5, lineHeight: 18, textAlign: 'center' }}>The whole gift goes to {f.full_name || f.username}. The app takes no fee.</Text>
          </ScrollView>
        ) : null}
        {f && step === 'pay' && giftOk ? (
          <View style={{ flex: 1 }}>
            <Pressable onPress={paying ? undefined : () => setStep('amount')} accessibilityRole="button" accessibilityLabel="Change amount" style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', marginLeft: 12, marginTop: -8, marginBottom: 10, paddingVertical: 4, opacity: paying ? 0.4 : 1 }}>
              <Icon name="back" size={18} color={C.fg2} weight={2.2} />
              <Text style={{ color: C.fg2, fontSize: 14.5, fontWeight: '600' }}>Change amount</Text>
            </Pressable>
            <PayPanel
              title={`Gift to “${f.title}”`}
              amountLabel={amountLabel}
              walletLabel={`Gift · ${f.title}`.slice(0, 60)}
              wallet="support"
              note={`${t('legal.oneOff', { amount: amountLabel })} ${anonymous ? "You're giving anonymously: your name won't appear on the fundraiser." : message.trim() ? 'Your name and message will appear on the fundraiser.' : 'Your name will appear on the fundraiser.'}`}
              start={() => startDonation(f.id, gift!, message.trim(), anonymous)}
              onPaid={paid}
              onBusy={setPaying}
              onClose={closeGiving}
            />
          </View>
        ) : null}
      </Sheet>
    </Screen>
  );
}
