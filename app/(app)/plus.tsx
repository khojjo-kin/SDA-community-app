import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, IconName, Mark, VerifiedTick } from '../../src/components/Icon';
import { Button, IconButton, Row, Screen, SectionLabel, Sheet, Toggle, useToast } from '../../src/components/ui';
import { cancelSubscription, myPlusRequests, requestPlus, resumeSubscription, setTickHidden, updateProfile } from '../../src/lib/api';
import { fontById, useAppFont } from '../../src/lib/fonts';
import { tap } from '../../src/lib/haptics';
import { type Key, tSplit, useT } from '../../src/lib/i18n';
import { ensureStripe, money } from '../../src/lib/payments';
import { usePrefs } from '../../src/lib/prefs';
import { useSession } from '../../src/lib/session';
import { C, dayLabel, errText, monthName } from '../../src/lib/theme';
import type { BillingStatus, PaymentsConfig, PlusRequest } from '../../src/lib/types';

type Plan = 'monthly' | 'yearly';

/**
 * The headline benefits, each with its own line. The daily Erha allowance for everyone else lives in
 * the Erha function. The blue tick itself is not a benefit on purpose: it only ever comes from an
 * identity check (/verify), so it always means "this account is who it says it is", never "this
 * account paid". Plus only lets a verified member choose whether it shows.
 */
const BENEFITS: { icon: IconName; title: Key; body: Key }[] = [
  { icon: 'eye', title: 'plus.benefitPreview', body: 'plus.benefitPreviewBody' },
  { icon: 'repeat', title: 'plus.benefitRewatches', body: 'plus.benefitRewatchesBody' },
  { icon: 'clock', title: 'plus.benefitViewTimes', body: 'plus.benefitViewTimesBody' },
  { icon: 'chatdots', title: 'settings.readQuietly', body: 'plus.benefitReadQuietlyBody' },
  { icon: 'star', title: 'plus.benefitPriority', body: 'plus.benefitPriorityBody' },
  { icon: 'bell', title: 'settings.storyAlerts', body: 'plus.benefitStoryAlertsBody' },
  { icon: 'phone', title: 'plus.benefitScreenshots', body: 'plus.benefitScreenshotsBody' },
  { icon: 'palette', title: 'settings.profileStyle', body: 'plus.benefitProfileStyleBody' },
  { icon: 'shield', title: 'plus.benefitHideTick', body: 'plus.benefitHideTickBody' },
  { icon: 'font', title: 'plus.benefitFonts', body: 'plus.benefitFontsBody' },
  { icon: 'account', title: 'settings.profileViewers', body: 'plus.benefitViewersBody' },
  { icon: 'lifebuoy', title: 'plus.benefitSupport', body: 'plus.benefitSupportBody' },
];

/** Every perk in one line each, for "Explore all benefits". Keys, looked up as the page draws. */
const ALL_BENEFITS: Key[] = [
  'plus.allPreview',
  'plus.allRewatches',
  'plus.allViewTimes',
  'plus.allReadQuietly',
  'plus.allPriority',
  'plus.allStoryAlerts',
  'plus.allScreenshots',
  'plus.allProfileStyle',
  'plus.allTick',
  'plus.allErha',
  'plus.allFonts',
  'plus.allWallpapers',
  'plus.allViewers',
  'plus.allEditing',
  'plus.allPod',
  'plus.benefitSupport',
  'plus.allNewFeatures',
];

/** "9 November", with the year when it is not this year. */
function longDay(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const year = d.getFullYear() === new Date().getFullYear() ? '' : ` ${d.getFullYear()}`;
  return `${d.getDate()} ${monthName(d)}${year}`;
}

/** Subscriptions that still renew (or are trying to), and so can be cancelled. */
const RENEWING = ['active', 'trialing', 'past_due', 'unpaid'];

/** Where the subscription stands, in one line, in the app's language (`t` from useT). */
function subscriptionLine(b: BillingStatus, t: ReturnType<typeof useT>): string {
  const day = longDay(b.current_period_end);
  if (b.status === 'past_due' || b.status === 'unpaid') return t('plus.statusFailed');
  if (b.status === 'incomplete') return t('plus.statusIncomplete');
  if (b.status === 'canceled') return day ? t('plus.statusEndedOn', { day }) : t('plus.statusEnded');
  if (b.cancel_at_period_end) return day ? t('plus.statusEndsOn', { day }) : t('plus.statusEndsPeriod');
  if (b.status === 'trialing') return day ? t('plus.statusTrialEndsOn', { day }) : t('plus.statusTrial');
  return day ? t('plus.statusRenewsOn', { day }) : b.plan === 'yearly' ? t('plus.statusRenewsYearly') : t('plus.statusRenewsMonthly');
}

/** The yearly plan's saving against twelve months, in per cent. Rounded down, so it is never overstated. */
function savePercent(monthlyPence: number, yearlyPence: number): number {
  if (!monthlyPence || !yearlyPence) return 0;
  return Math.max(0, Math.floor((1 - yearlyPence / (monthlyPence * 12)) * 100));
}

export default function Plus() {
  const { me, profile, refresh } = useSession();
  const router = useRouter();
  const toast = useToast();
  const t = useT();
  const insets = useSafeAreaInsets();
  const { appFont } = usePrefs();
  const fontBold = useAppFont('bold');
  const font = useAppFont();
  const [requests, setRequests] = useState<PlusRequest[]>([]);
  // The sheet for asking an admin to activate Plus that a church has arranged. (The tick has its own screen, /verify.)
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  // Prices, whether payments are on, and the member's subscription (the config carries its status too).
  const [config, setConfig] = useState<PaymentsConfig | null>(null);
  const [configError, setConfigError] = useState('');
  // The Stripe subscription. Kept apart from the config because cancelling or resuming replaces it.
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [changing, setChanging] = useState(false);
  const [plan, setPlan] = useState<Plan>('monthly');
  // The sticky plan area's height, so the end of the page can scroll clear of it.
  const [bottomH, setBottomH] = useState(0);
  // Read receipts: shown at once when tapped, then put back if the save fails.
  const [receipts, setReceipts] = useState(profile?.read_receipts ?? true);
  useEffect(() => { setReceipts(profile?.read_receipts ?? true); }, [profile?.read_receipts]);
  // The tick works the same way. Hidden means the account is verified but the tick is not shown.
  const [tickHidden, setTickHiddenNow] = useState(!!profile?.tick_hidden);
  useEffect(() => { setTickHiddenNow(!!profile?.tick_hidden); }, [profile?.tick_hidden]);
  const tickSaving = useRef(false);
  const lastPush = useRef(0);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const load = useCallback(() => {
    myPlusRequests(me).then(setRequests).catch(() => {});
    setConfigError('');
    ensureStripe(true)
      .then((c) => {
        if (!alive.current) return;
        setConfig(c);
        setBilling(c);
      })
      .catch((e) => { if (alive.current) setConfigError(errText(e)); });
  }, [me]);
  useFocusEffect(load);

  // Members start on the plan they have, so the other card is the one that offers a switch.
  const currentPlan: Plan | null = billing && RENEWING.includes(billing.status) ? billing.plan ?? 'monthly' : null;
  useEffect(() => { if (currentPlan) setPlan(currentPlan); }, [currentPlan]);

  const hasSub = !!billing && billing.status !== 'none' && billing.status !== 'incomplete_expired';
  const failed = billing?.status === 'past_due' || billing?.status === 'unpaid';
  // In the free week with no card saved for after it: without one, Plus ends with the week.
  const needsCard = billing?.status === 'trialing' && !!billing.needs_card;
  const monthly = config ? money(config.price_pence, config.currency) : '';
  const yearly = config ? money(config.yearly_pence, config.currency) : '';
  const priceLine = (p: Plan | null) => (p === 'yearly' ? t('plus.perYear', { price: yearly }) : t('plus.perMonth', { price: monthly }));

  function close() {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }

  function changeRenewal() {
    if (!billing || changing) return;
    const resume = billing.cancel_at_period_end;
    const day = longDay(billing.current_period_end);
    const trialling = billing.status === 'trialing';
    const price = priceLine(billing.plan);
    Alert.alert(
      resume ? t('plus.resumeQuestion') : t('plus.cancelQuestion'),
      resume
        ? day ? t('plus.willRenewOn', { day, price }) : t('plus.willRenew', { price })
        : trialling
          ? day ? t('plus.trialCancelUntil', { day }) : t('plus.trialCancel')
          : day ? t('plus.cancelUntil', { day }) : t('plus.cancelPeriod'),
      [
        { text: resume ? t('plus.notNow') : t('plus.keepPlus'), style: 'cancel' },
        {
          text: resume ? t('plus.resume') : t('plus.cancelSubscription'),
          style: resume ? 'default' : 'destructive',
          onPress: async () => {
            setChanging(true);
            try {
              const next = await (resume ? resumeSubscription() : cancelSubscription());
              if (!alive.current) return;
              setBilling(next);
              toast(resume ? t('plus.renewsAsNormal') : day ? t('plus.willEndOn', { day }) : t('plus.willEndPeriod'));
              refresh();
            } catch (e) {
              toast(errText(e));
            } finally {
              if (alive.current) setChanging(false);
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

  /** "Show my blue tick". Hiding needs Plus; showing it again always works. */
  function setShowTick(show: boolean) {
    if (tickSaving.current) return;
    tickSaving.current = true;
    tap('medium');
    const before = tickHidden;
    setTickHiddenNow(!show);
    setTickHidden(!show)
      .then(() => {
        toast(show ? t('plus.tickShowsAgain') : t('plus.tickHidden'));
        return refresh();
      })
      .catch((e) => {
        if (alive.current) setTickHiddenNow(before);
        toast(errText(e));
      })
      .finally(() => { tickSaving.current = false; });
  }

  async function send() {
    if (!asking || busy) return;
    setBusy(true);
    try {
      await requestPlus(me, 'plus', note);
      toast(t('plus.requestSent'));
      setAsking(false);
      setNote('');
      load();
    } catch (e) {
      toast(errText(e));
    } finally {
      setBusy(false);
    }
  }

  /** The checkout's card form, to save a card for after the free week (nothing is charged now). */
  function addCard() {
    if (Date.now() - lastPush.current < 800) return;
    lastPush.current = Date.now();
    tap('medium');
    router.push(`/checkout?plan=${currentPlan ?? 'monthly'}`);
  }

  /** Off to the checkout for the chosen plan (or the switch to it). */
  function go() {
    if (!config?.ready) return;
    // One checkout, however quickly the button is pressed twice.
    if (Date.now() - lastPush.current < 800) return;
    lastPush.current = Date.now();
    tap('medium');
    router.push(`/checkout?plan=${plan}`);
  }

  const until = profile?.plus_until ? dayLabel(new Date(profile.plus_until)) : '';
  const isPlus = !!profile?.plus;
  // A renewing Stripe subscription: the bottom area offers the other plan instead of a new one.
  const member = !!currentPlan;
  const trialOffer = !!config?.trial_available && !isPlus && !member;
  const trialWords = !config || config.trial_days === 7 ? t('plus.oneWeek') : t('plus.days', { count: config.trial_days });
  // Verified, or verified with the tick hidden (the account then shows as not verified).
  const ticked = !!profile?.verified || tickHidden;
  // Plus through a church has no subscription to change, and a failed renewal is paid from the section above.
  const showBottom = !failed && (member || !isPlus);
  const save = config ? savePercent(config.price_pence, config.yearly_pence) : 0;

  let buttonLabel = '';
  let buttonOn = false;
  // A failed refresh keeps the prices from the last visit; only with none at all is "Try again" offered.
  if (configError && !config) {
    buttonLabel = t('common.tryAgain');
    buttonOn = true;
  } else if (!config) {
    buttonLabel = '';
  } else if (!config.ready) {
    buttonLabel = t('plus.comingSoon');
  } else if (member) {
    buttonLabel = plan === currentPlan ? '' : plan === 'yearly' ? t('plus.switchToYearly') : t('plus.switchToMonthly');
    buttonOn = plan !== currentPlan;
  } else {
    buttonLabel = trialOffer ? t('plus.tryFor', { price: money(0, config.currency) }) : plan === 'yearly' ? t('plus.subscribeYearly', { price: yearly }) : t('plus.subscribeMonthly', { price: monthly });
    buttonOn = true;
  }
  // The trial headline keeps "Community Plus" in green wherever the language puts it.
  const [headBefore, headAfter] = tSplit(profile?.username ? 'plus.trialHeadlineNamed' : 'plus.trialHeadline', 'plus', { username: profile?.username ?? '', time: trialWords });
  // The same for the Terms of Service link in the small print.
  const [agreeBefore, agreeAfter] = tSplit('plus.agree', 'terms');

  return (
    <Screen>
      {/* Close on the left, nothing else: the page itself is the header. */}
      <View style={{ height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 }}>
        <IconButton name="close" label={t('common.close')} size={26} onPress={close} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: (showBottom ? bottomH : insets.bottom) + 28 }}>
        <View style={{ alignItems: 'center', paddingHorizontal: 24, paddingTop: 4, paddingBottom: 26, gap: 12 }}>
          <Mark size={58} color={C.fg} />
          <Text accessibilityRole="header" style={{ color: C.fg, fontSize: 28, lineHeight: 34, fontWeight: '800', textAlign: 'center', fontFamily: fontBold }}>
            {trialOffer ? (
              <>
                {headBefore}
                <Text style={{ color: C.accent2 }}>{t('common.communityPlus')}</Text>
                {headAfter}
              </>
            ) : (
              <Text style={{ color: C.accent2 }}>{t('common.communityPlus')}</Text>
            )}
          </Text>
          <Text style={{ color: C.fg2, fontSize: 16, textAlign: 'center', lineHeight: 22, fontFamily: font }}>{t('plus.subtitle')}</Text>
          {isPlus ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 28, paddingHorizontal: 12, borderRadius: 14, backgroundColor: C.accentSoft }}>
              <Icon name="check" size={15} color={C.accent2} weight={2.6} />
              <Text style={{ color: C.accent2, fontSize: 13.5, fontWeight: '700' }}>{until ? t('plus.youHavePlusUntil', { day: until }) : t('plus.youHavePlus')}</Text>
            </View>
          ) : null}
        </View>

        {hasSub && billing ? (
          <>
            <SectionLabel>{t('plus.yourSubscription')}</SectionLabel>
            <View style={{ marginHorizontal: 16, borderRadius: 18, backgroundColor: C.surface, overflow: 'hidden', paddingBottom: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 }}>
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: failed ? C.like + '24' : C.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={failed ? 'info' : 'card'} size={22} color={failed ? C.like : C.accent2} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.fg, fontWeight: '700', fontSize: 16 }}>
                    {billing.plan === 'yearly' ? t('plus.yearly') : t('plus.monthly')}
                    {config ? ` · ${priceLine(billing.plan)}` : ''}
                  </Text>
                  <Text style={{ color: failed ? C.like : C.fg2, marginTop: 2, lineHeight: 19 }}>{subscriptionLine(billing, t)}</Text>
                </View>
              </View>
              {needsCard ? (
                <View style={{ paddingHorizontal: 16, paddingBottom: 12, gap: 10 }}>
                  <Text style={{ color: C.fg2, fontSize: 14, lineHeight: 20, fontFamily: font }}>
                    {`No card is saved for after your free week, so Plus ends with it${billing.current_period_end ? ` on ${longDay(billing.current_period_end)}` : ''}. Add one to keep Plus going. Nothing is charged until then.`}
                  </Text>
                  <Button label="Add a card for after your free week" onPress={addCard} />
                </View>
              ) : null}
              {failed || billing.status === 'incomplete' ? (
                <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
                  <Button label={failed ? t('plus.payNow') : t('plus.finishPaying')} onPress={() => router.push(`/checkout?plan=${billing.plan ?? 'monthly'}`)} />
                </View>
              ) : null}
              <Row icon="card" title={t('plus.paymentMethods')} onPress={() => router.push('/payment-methods')} />
              <Row icon="receipt" title={t('plus.paymentHistory')} onPress={() => router.push('/payments')} />
              {RENEWING.includes(billing.status) ? (
                <Row
                  icon={billing.cancel_at_period_end ? 'repeat' : 'close'}
                  title={billing.cancel_at_period_end ? t('plus.resumeSubscription') : t('plus.cancelSubscription')}
                  color={billing.cancel_at_period_end ? C.accent2 : C.like}
                  chevron={false}
                  onPress={changing ? undefined : changeRenewal}
                  right={changing ? <ActivityIndicator color={C.fg2} /> : undefined}
                />
              ) : null}
            </View>
          </>
        ) : null}

        {isPlus ? (
          <>
            <SectionLabel>{t('plus.yourSettings')}</SectionLabel>
            <View style={{ marginHorizontal: 16, borderRadius: 18, backgroundColor: C.surface, overflow: 'hidden', paddingVertical: 4 }}>
              <Row icon="font" title={t('settings.appFont')} value={fontById(appFont).name} onPress={() => router.push('/plus-font')} />
              <Row icon="wallpaper" title={t('settings.chatWallpaper')} onPress={() => router.push('/chat-wallpaper')} />
              <Row icon="palette" title={t('settings.profileStyle')} onPress={() => router.push('/profile-style')} />
              <Row icon="eye" title={t('settings.profileViewers')} onPress={() => router.push('/profile-viewers')} />
              <Row icon="bell" title={t('settings.storyAlerts')} onPress={() => router.push('/story-alerts')} />
              <Row icon="lock" title={t('settings.readReceipts')} sub={receipts ? t('plus.receiptsOn') : t('plus.receiptsOff')} right={<Toggle value={receipts} onChange={setReadReceipts} label={t('settings.readReceipts')} />} />
            </View>
            <SectionLabel strong>{t('plus.whatYouGet')}</SectionLabel>
          </>
        ) : null}

        <View style={{ paddingHorizontal: 20, gap: 20 }}>
          {BENEFITS.map((b) => (
            <View key={b.title} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 14 }}>
              <View style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={b.icon} size={30} color={C.fg} weight={1.6} />
              </View>
              <View style={{ flex: 1, paddingTop: 1 }}>
                <Text style={{ color: C.fg, fontWeight: '700', fontSize: 16, fontFamily: fontBold }}>{t(b.title)}</Text>
                <Text style={{ color: C.fg2, fontSize: 14.5, lineHeight: 20, marginTop: 2, fontFamily: font }}>{t(b.body)}</Text>
              </View>
            </View>
          ))}
        </View>

        <Text accessibilityRole="header" style={{ color: C.fg, fontSize: 20, fontWeight: '800', paddingHorizontal: 20, paddingTop: 34, paddingBottom: 14, fontFamily: fontBold }}>{t('plus.exploreAll')}</Text>
        <View style={{ paddingHorizontal: 20, gap: 12 }}>
          {ALL_BENEFITS.map((line) => (
            <View key={line} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
              <Icon name="check" size={20} color={C.fg} weight={1.5} />
              <Text style={{ flex: 1, color: C.fg, fontSize: 15, lineHeight: 20, fontFamily: font }}>{t(line)}</Text>
            </View>
          ))}
        </View>

        {ticked ? (
          <>
            <SectionLabel>{t('plus.yourTick')}</SectionLabel>
            <View style={{ marginHorizontal: 16, borderRadius: 18, backgroundColor: C.surface, overflow: 'hidden', paddingVertical: 4 }}>
              <Row
                title={t('settings.showTick')}
                sub={tickHidden ? t('plus.tickHiddenSub') : isPlus ? t('plus.tickShowsSub') : t('plus.tickNeedsPlus')}
                right={
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <VerifiedTick size={20} />
                    {/* Showing it again always works; hiding it needs Plus. */}
                    <Toggle value={!tickHidden} onChange={setShowTick} disabled={!isPlus && !tickHidden} label={t('settings.showTick')} />
                  </View>
                }
              />
            </View>
          </>
        ) : null}

        <View style={{ paddingHorizontal: 16, paddingTop: 26, gap: 10 }}>
          {isPlus ? (
            hasSub ? null : <Text style={{ color: C.fg2, textAlign: 'center', lineHeight: 20 }}>{t('plus.churchRenews')}</Text>
          ) : pending('plus') ? (
            <View style={{ padding: 14, borderRadius: 14, backgroundColor: C.surface }}>
              <Text style={{ color: C.fg, fontWeight: '700' }}>{t('plus.requestWithAdmins')}</Text>
              <Text style={{ color: C.fg2, marginTop: 2, lineHeight: 19 }}>{t('plus.requestSentOn', { day: dayLabel(new Date(pending('plus')!.created_at)) })}</Text>
            </View>
          ) : (
            <Pressable
              onPress={() => setAsking(true)}
              accessibilityRole="button"
              accessibilityLabel={t('plus.askAdmin')}
              style={({ pressed }) => ({ height: 46, paddingHorizontal: 14, borderRadius: 12, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.75 : 1 })}>
              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={{ color: C.fg, fontWeight: '600', fontSize: 15.5, fontFamily: fontBold }}>
                {t('plus.askAdmin')}
              </Text>
            </Pressable>
          )}
          {isPlus ? null : (
            <Text style={{ color: C.fg3, fontSize: 13, textAlign: 'center', lineHeight: 18, paddingTop: 6 }}>
              {t('plus.stripeNote')}
            </Text>
          )}
        </View>

        {/* The tick is separate from Plus and free: it only ever comes from an identity check. */}
        {ticked ? null : (
          <Pressable
            onPress={() => router.push('/verify')}
            accessibilityRole="link"
            accessibilityLabel={pending('verify') ? t('plus.idBeingReviewed') : t('plus.wantTick')}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, marginTop: 20, padding: 14, borderRadius: 16, backgroundColor: C.surface, opacity: pressed ? 0.75 : 1 })}>
            <VerifiedTick size={26} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.fg, fontWeight: '700' }}>{pending('verify') ? t('plus.idBeingReviewed') : t('plus.wantTick')}</Text>
              <Text style={{ color: C.fg2, marginTop: 2, lineHeight: 19, fontSize: 13.5 }}>
                {pending('verify') ? t('plus.idBeingReviewedSub') : t('plus.wantTickSub')}
              </Text>
            </View>
            <Icon name="right" size={16} color={C.fg2} weight={2} />
          </Pressable>
        )}
      </ScrollView>

      {showBottom ? (
        <View
          onLayout={(e) => setBottomH(e.nativeEvent.layout.height)}
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: C.bg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line, paddingHorizontal: 16, paddingTop: 12, paddingBottom: insets.bottom + 10, gap: 10 }}>
          {config ? (
            <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', gap: 10 }}>
              <PlanCard title={t('plus.monthly')} price={monthly} sub={currentPlan === 'monthly' ? t('plus.yourPlan') : t('plus.aMonth')} selected={plan === 'monthly'} onPress={() => { tap('select'); setPlan('monthly'); }} />
              <PlanCard
                title={t('plus.yearly')}
                price={yearly}
                sub={currentPlan === 'yearly' ? t('plus.yourPlan') : t('plus.perMonth', { price: money(Math.round(config.yearly_pence / 12), config.currency) })}
                pill={save >= 1 ? t('plus.save', { percent: save }) : undefined}
                selected={plan === 'yearly'}
                onPress={() => { tap('select'); setPlan('yearly'); }}
              />
            </View>
          ) : null}
          {member ? null : (
            <Text style={{ color: C.fg3, fontSize: 12.5, lineHeight: 17, textAlign: 'center', fontFamily: font }}>
              {trialOffer && config ? `${t('plus.trialTerms', { days: config.trial_days, price: priceLine(plan) })} ` : ''}
              {agreeBefore}
              <Text style={{ color: C.accent2, fontWeight: '600' }} onPress={() => router.push('/about')} accessibilityRole="link">
                {t('plus.terms')}
              </Text>
              {agreeAfter}{' '}
              <Text style={{ color: C.accent2, fontWeight: '600' }} onPress={() => router.push('/help')} accessibilityRole="link">
                {t('plus.learnMore')}
              </Text>
            </Text>
          )}
          {member && plan !== currentPlan ? (
            <Text style={{ color: C.fg3, fontSize: 12.5, lineHeight: 17, textAlign: 'center', fontFamily: font }}>
              {t(billing?.cancel_at_period_end ? 'plus.youreOnRenew' : 'plus.youreOn', { plan: currentPlan === 'yearly' ? t('plus.planYearly') : t('plus.planMonthly') })}
            </Text>
          ) : null}
          {buttonLabel || !config ? (
            <Pressable
              onPress={buttonOn ? (config ? go : load) : undefined}
              accessibilityRole="button"
              accessibilityLabel={buttonLabel || t('plus.loadingPrices')}
              accessibilityState={{ disabled: !buttonOn }}
              style={({ pressed }) => ({ height: 52, borderRadius: 26, backgroundColor: buttonOn ? C.accent : C.surface2, alignItems: 'center', justifyContent: 'center', opacity: pressed && buttonOn ? 0.8 : 1 })}>
              {!config && !configError ? (
                <ActivityIndicator color={C.fg2} />
              ) : (
                <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={{ color: buttonOn ? C.onAccent : C.fg2, fontSize: 16.5, fontWeight: '700', fontFamily: fontBold }}>
                  {buttonLabel}
                </Text>
              )}
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <Sheet visible={asking} onClose={() => setAsking(false)} title={t('plus.getPlus')}>
        <View style={{ paddingHorizontal: 20, gap: 12, paddingBottom: 8 }}>
          <Text style={{ color: C.fg2, lineHeight: 20 }}>{t('plus.askBody')}</Text>
          <TextInput value={note} onChangeText={setNote} placeholder={t('plus.notePlaceholder')} placeholderTextColor={C.fg3} multiline maxLength={500} keyboardAppearance={C.blurTint} accessibilityLabel={t('plus.noteLabel')} style={{ minHeight: 96, color: C.fg, fontSize: 16, padding: 14, borderRadius: 12, backgroundColor: C.surface, textAlignVertical: 'top' }} />
          <Button label={t('plus.sendRequest')} onPress={send} busy={busy} />
        </View>
      </Sheet>
    </Screen>
  );
}

/** One plan in the sticky area. The chosen one wears a 2px green border. */
function PlanCard({ title, price, sub, pill, selected, onPress }: { title: string; price: string; sub: string; pill?: string; selected: boolean; onPress: () => void }) {
  const fontBold = useAppFont('bold');
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${title}, ${price}, ${sub}${pill ? `, ${pill}` : ''}`}
      style={({ pressed }) => ({ flex: 1, minHeight: 84, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 16, borderWidth: 2, borderColor: selected ? C.accent : C.line, backgroundColor: C.surface, opacity: pressed ? 0.85 : 1 })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <Text numberOfLines={1} style={{ flexShrink: 1, color: C.fg, fontSize: 15, fontWeight: '700', fontFamily: fontBold }}>{title}</Text>
        {pill ? (
          <View style={{ height: 20, paddingHorizontal: 7, borderRadius: 10, backgroundColor: C.accentSoft, justifyContent: 'center' }}>
            <Text numberOfLines={1} style={{ color: C.accent2, fontSize: 11, fontWeight: '800' }}>{pill}</Text>
          </View>
        ) : null}
      </View>
      <Text style={{ color: C.fg, fontSize: 20, fontWeight: '800', marginTop: 6, fontVariant: ['tabular-nums'] }}>{price}</Text>
      <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 12.5, marginTop: 1 }}>{sub}</Text>
    </Pressable>
  );
}
