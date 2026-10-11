import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PlatformPay } from '@stripe/stripe-react-native';
import { Icon, IconName, Mark, VerifiedTick } from '../../src/components/Icon';
import { type PayStart, useInstantPay } from '../../src/components/PaySheet';
import { RenewalTerms } from '../../src/components/RenewalTerms';
import { Button, IconButton, Row, Screen, SectionLabel, Toggle, useToast } from '../../src/components/ui';
import { cancelSubscription, myPlusRequests, resumeSubscription, setTickHidden, startSubscription, syncSubscription, updateProfile } from '../../src/lib/api';
import { fontById, useAppFont } from '../../src/lib/fonts';
import { tap } from '../../src/lib/haptics';
import { type Key, tSplit, useT } from '../../src/lib/i18n';
import { ensureStripe, lastPaymentsConfig, money, paymentsAccount, rememberBilling } from '../../src/lib/payments';
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
const BENEFITS: { icon: IconName; title: Key }[] = [
  { icon: 'eye', title: 'plus.benefitPreview' },
  { icon: 'repeat', title: 'plus.benefitRewatches' },
  { icon: 'clock', title: 'plus.benefitViewTimes' },
  { icon: 'chatdots', title: 'settings.readQuietly' },
  { icon: 'star', title: 'plus.benefitPriority' },
  { icon: 'bell', title: 'settings.storyAlerts' },
  { icon: 'phone', title: 'plus.benefitScreenshots' },
  { icon: 'palette', title: 'settings.profileStyle' },
  { icon: 'shield', title: 'plus.benefitHideTick' },
  { icon: 'font', title: 'plus.benefitFonts' },
  { icon: 'account', title: 'settings.profileViewers' },
  { icon: 'lifebuoy', title: 'plus.benefitSupport' },
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
  // Prices, whether payments are on, and the member's subscription (the config carries its status too).
  // The last answer draws the page at once; it is asked for again on every visit.
  const [config, setConfig] = useState<PaymentsConfig | null>(lastPaymentsConfig);
  const [configError, setConfigError] = useState('');
  // The Stripe subscription. Kept apart from the config because cancelling or resuming replaces it.
  const [billing, setBilling] = useState<BillingStatus | null>(lastPaymentsConfig);
  const [changing, setChanging] = useState(false);
  // Paid: Plus is being switched on (the server waits for Stripe), so the button keeps spinning.
  const [settling, setSettling] = useState(false);
  const [plan, setPlan] = useState<Plan>(() => {
    const b = lastPaymentsConfig();
    return b && RENEWING.includes(b.status) && b.plan === 'yearly' ? 'yearly' : 'monthly';
  });
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
  // Whether the subscription just started is a free week (a card saved, nothing charged).
  const startedTrial = useRef(false);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const load = useCallback(() => {
    myPlusRequests(me)
      .then((list) => { if (alive.current) setRequests(list); })
      .catch(() => {});
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
            const asked = paymentsAccount();
            try {
              const next = await (resume ? resumeSubscription() : cancelSubscription());
              rememberBilling(next, asked);
              if (!alive.current) return;
              setBilling(next);
              tap('success');
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

  const pending = (kind: 'verify') => requests.find((r) => r.kind === kind && r.status === 'pending');

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

  /** One screen per tap, however quickly a row is tapped twice. */
  function open(href: string) {
    if (Date.now() - lastPush.current < 800) return;
    lastPush.current = Date.now();
    router.push(href);
  }

  /** The checkout's card form, to save a card for after the free week (nothing is charged now). */
  function addCard() {
    if (Date.now() - lastPush.current < 800) return;
    tap('medium');
    open(`/checkout?plan=${currentPlan ?? 'monthly'}`);
  }

  const until = profile?.plus_until ? dayLabel(new Date(profile.plus_until)) : '';
  const isPlus = !!profile?.plus;
  // A renewing Stripe subscription: the bottom area offers the other plan instead of a new one.
  const member = !!currentPlan;
  const trialOffer = !!config?.trial_available && !isPlus && !member;
  const planPence = config ? (plan === 'yearly' ? config.yearly_pence : config.price_pence) : 0;

  /** Starts the subscription on the server. A free week saves the card (nothing is charged); otherwise the first payment. */
  const startPlus = async (saved: string | null): Promise<PayStart> => {
    const r = await startSubscription(saved, plan);
    startedTrial.current = r.intent === 'setup';
    const currency = r.currency ?? config?.currency ?? 'GBP';
    // This page offered a free week but the server would charge today: stop, so nobody pays who expected not to.
    if (!r.already && trialOffer && r.intent !== 'setup' && (r.amount ?? 0) > 0) {
      load();
      throw new Error(t('checkout.trialUnavailable', { amount: money(r.amount ?? planPence, currency) }));
    }
    const secret = r.client_secret ?? '';
    return { already: !!r.already, client_secret: secret, payment_intent_id: secret.split('_secret_')[0], amount: r.amount ?? (r.intent === 'setup' ? 0 : planPence), currency, intent: r.intent };
  };

  /** Paid (or the free week started): Plus is switched on by the server once Stripe agrees, so give it a few seconds. */
  async function paidPlus() {
    const asked = paymentsAccount();
    setSettling(true);
    try {
      let synced = await syncSubscription().catch(() => null);
      for (let i = 0; i < 3 && !synced?.plus; i++) {
        await new Promise<void>((resolve) => setTimeout(resolve, 1500));
        if (!alive.current) return;
        synced = await syncSubscription().catch(() => null);
      }
      if (synced) rememberBilling(synced, asked);
      await refresh();
      if (!alive.current) return;
      // Drawn from what the server said at once, rather than offering Subscribe again until the page reloads.
      if (synced) setBilling(synced);
      tap('success');
      // Not on yet: the payment went through, and Plus shows once Stripe has told the server.
      toast(startedTrial.current ? t('checkout.trialStarted') : synced?.plus ? t('checkout.welcome') : t('subscribe.paymentReceived'));
      load();
    } finally {
      if (alive.current) setSettling(false);
    }
  }

  const instant = useInstantPay({
    title: `${t('common.communityPlus')} · ${plan === 'yearly' ? t('plus.yearly') : t('plus.monthly')}`,
    amountLabel: money(trialOffer ? 0 : planPence, config?.currency ?? 'GBP'),
    // The free week saves a card and charges nothing today, so the button says what it does rather than "Pay £0.00".
    payLabel: trialOffer ? t('checkout.startFreeWeek') : undefined,
    start: startPlus,
    onConfirmed: async () => {
      await syncSubscription();
    },
    onPaid: paidPlus,
    wallet: 'subscribe',
    walletItems: (p) => {
      const interval = { intervalUnit: plan === 'yearly' ? PlatformPay.IntervalUnit.Year : PlatformPay.IntervalUnit.Month, intervalCount: 1 };
      const full = (planPence / 100).toFixed(2);
      if (p.intent !== 'setup') return [{ label: t('common.communityPlus'), amount: (p.amount / 100).toFixed(2), paymentType: PlatformPay.PaymentType.Recurring, ...interval }];
      // The free week: what happens after it, then nothing today as the total.
      const days = config?.trial_days || 7;
      const from = new Date(Date.now() + days * 86400e3);
      return [
        { label: t('checkout.applePayFrom', { day: longDay(from.toISOString()) }), amount: full, paymentType: PlatformPay.PaymentType.Recurring, ...interval, startDate: Math.floor(from.getTime() / 1000) },
        { label: t('checkout.applePayFreeFor', { days }), amount: '0.00', paymentType: PlatformPay.PaymentType.Immediate },
      ];
    },
    footer: config ? <RenewalTerms kind="plus" pricePence={planPence} currency={config.currency} cadence={plan === 'yearly' ? 'year' : 'month'} trialDays={trialOffer ? config.trial_days : 0} /> : null,
  });

  /** Subscribing starts paying straight away; a member changing plan goes to the checkout. */
  function go() {
    if (!config || settling) return;
    if (!config.ready) {
      toast(t('pay.unavailable'));
      return;
    }
    // One go, however quickly the button is pressed twice.
    if (Date.now() - lastPush.current < 800) return;
    lastPush.current = Date.now();
    tap('medium');
    if (member) router.push(`/checkout?plan=${plan}`);
    else instant.pay();
  }
  const trialWords = !config || config.trial_days === 7 ? t('plus.oneWeek') : t('plus.days', { count: config.trial_days });
  // Verified, or verified with the tick hidden (the account then shows as not verified).
  const ticked = !!profile?.verified || tickHidden;
  // Plus through a church has no subscription to change, and a failed renewal is paid from the section above.
  const showBottom = !failed && (member || !isPlus);
  const save = config ? savePercent(config.price_pence, config.yearly_pence) : 0;
  // Paying has started, or has finished and Plus is being switched on: the button spins and can't be pressed.
  const working = instant.busy || settling;

  let buttonLabel = '';
  let buttonOn = false;
  // A failed refresh keeps the prices from the last visit; only with none at all is "Try again" offered.
  if (configError && !config) {
    buttonLabel = t('common.tryAgain');
    buttonOn = true;
  } else if (!config) {
    buttonLabel = '';
  } else if (member) {
    buttonLabel = plan === currentPlan ? '' : plan === 'yearly' ? t('plus.switchToYearly') : t('plus.switchToMonthly');
    buttonOn = plan !== currentPlan;
  } else {
    buttonLabel = trialOffer ? t('plus.tryFor', { price: money(0, config.currency) }) : plan === 'yearly' ? t('plus.subscribeYearly', { price: yearly }) : t('plus.subscribeMonthly', { price: monthly });
    buttonOn = true;
  }
  // The trial headline keeps "Community Plus" in green wherever the language puts it.
  const [headBefore, headAfter] = tSplit(profile?.username ? 'plus.trialHeadlineNamed' : 'plus.trialHeadline', 'plus', { username: profile?.username ?? '', time: trialWords });

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
                <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
                  <Button label={t('plus.addCard')} onPress={addCard} />
                </View>
              ) : null}
              {failed || billing.status === 'incomplete' ? (
                <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
                  <Button label={failed ? t('plus.payNow') : t('plus.finishPaying')} onPress={() => open(`/checkout?plan=${billing.plan ?? 'monthly'}`)} />
                </View>
              ) : null}
              <Row icon="card" title={t('plus.paymentMethods')} onPress={() => open('/payment-methods')} />
              <Row icon="receipt" title={t('payments.title')} onPress={() => open('/payments')} />
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
              <Row icon="font" title={t('settings.appFont')} value={fontById(appFont).name} onPress={() => open('/plus-font')} />
              <Row icon="wallpaper" title={t('settings.chatWallpaper')} onPress={() => open('/chat-wallpaper')} />
              <Row icon="palette" title={t('settings.profileStyle')} onPress={() => open('/profile-style')} />
              <Row icon="eye" title={t('settings.profileViewers')} onPress={() => open('/profile-viewers')} />
              <Row icon="bell" title={t('settings.storyAlerts')} onPress={() => open('/story-alerts')} />
              <Row icon="lock" title={t('settings.readReceipts')} right={<Toggle value={receipts} onChange={setReadReceipts} label={t('settings.readReceipts')} />} />
            </View>
            <SectionLabel strong>{t('plus.whatYouGet')}</SectionLabel>
          </>
        ) : null}

        <View style={{ paddingHorizontal: 20, gap: 20 }}>
          {BENEFITS.map((b) => (
            <View key={b.title} style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <View style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={b.icon} size={30} color={C.fg} weight={1.6} />
              </View>
              <Text style={{ flex: 1, color: C.fg, fontWeight: '700', fontSize: 16, fontFamily: fontBold }}>{t(b.title)}</Text>
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

        {/* The tick is separate from Plus and free: it only ever comes from an identity check. */}
        {ticked ? null : (
          <Pressable
            onPress={() => open('/verify')}
            accessibilityRole="link"
            accessibilityLabel={pending('verify') ? t('plus.idBeingReviewed') : t('plus.wantTick')}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 24, paddingHorizontal: 20, paddingVertical: 12, backgroundColor: pressed ? C.press : 'transparent' })}>
            <VerifiedTick size={24} />
            <Text style={{ flex: 1, color: C.fg, fontSize: 16, fontWeight: '700', fontFamily: fontBold }}>{pending('verify') ? t('plus.idBeingReviewed') : t('plus.wantTick')}</Text>
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
              <PlanCard title={t('plus.monthly')} price={monthly} sub={currentPlan === 'monthly' ? t('plus.yourPlan') : t('plus.aMonth')} selected={plan === 'monthly'} disabled={working} onPress={() => { tap('select'); setPlan('monthly'); }} />
              <PlanCard
                title={t('plus.yearly')}
                price={yearly}
                sub={currentPlan === 'yearly' ? t('plus.yourPlan') : t('plus.perMonth', { price: money(Math.round(config.yearly_pence / 12), config.currency) })}
                pill={save >= 1 ? t('plus.save', { percent: save }) : undefined}
                selected={plan === 'yearly'}
                disabled={working}
                onPress={() => { tap('select'); setPlan('yearly'); }}
              />
            </View>
          ) : null}
          {/* The renewal terms of the plan chosen, right above the button that starts it. */}
          {member || !config ? null : (
            <RenewalTerms
              kind="plus"
              pricePence={plan === 'yearly' ? config.yearly_pence : config.price_pence}
              currency={config.currency}
              cadence={plan === 'yearly' ? 'year' : 'month'}
              trialDays={trialOffer ? config.trial_days : 0}
            />
          )}
          {buttonLabel || !config || settling ? (
            <Pressable
              onPress={buttonOn && !working ? (config ? go : load) : undefined}
              accessibilityRole="button"
              accessibilityLabel={buttonLabel || t('plus.loadingPrices')}
              accessibilityState={{ disabled: !buttonOn, busy: working }}
              style={({ pressed }) => ({ height: 52, borderRadius: 14, backgroundColor: buttonOn || working ? C.accent : C.surface2, alignItems: 'center', justifyContent: 'center', opacity: pressed && buttonOn && !working ? 0.8 : 1 })}>
              {(!config && !configError) || working ? (
                <ActivityIndicator color={working ? C.onAccent : C.fg2} />
              ) : (
                <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={{ color: buttonOn ? C.onAccent : C.fg2, fontSize: 16.5, fontWeight: '700', fontFamily: fontBold }}>
                  {buttonLabel}
                </Text>
              )}
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {instant.sheet}
    </Screen>
  );
}

/** One plan in the sticky area. The chosen one wears a 2px green border over a green wash, with its circle filled. */
function PlanCard({ title, price, sub, pill, selected, disabled, onPress }: { title: string; price: string; sub: string; pill?: string; selected: boolean; disabled?: boolean; onPress: () => void }) {
  const fontBold = useAppFont('bold');
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled: !!disabled }}
      accessibilityLabel={`${title}, ${price}, ${sub}${pill ? `, ${pill}` : ''}`}
      style={({ pressed }) => ({ flex: 1, minHeight: 84, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 16, borderWidth: 2, borderColor: selected ? C.accent : C.line, backgroundColor: selected ? C.accentSoft : C.surface, opacity: pressed && !disabled ? 0.85 : 1 })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: selected ? 0 : 1.5, borderColor: C.fg3, backgroundColor: selected ? C.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
          {selected ? <Icon name="check" size={12} color={C.onAccent} weight={3} /> : null}
        </View>
        <Text numberOfLines={1} style={{ flexShrink: 1, color: C.fg, fontSize: 15, fontWeight: '700', fontFamily: fontBold }}>{title}</Text>
        {pill ? (
          <View style={{ marginLeft: 'auto', height: 20, paddingHorizontal: 7, borderRadius: 10, backgroundColor: C.accent, justifyContent: 'center' }}>
            <Text numberOfLines={1} style={{ color: C.onAccent, fontSize: 11, fontWeight: '800' }}>{pill}</Text>
          </View>
        ) : null}
      </View>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={{ color: C.fg, fontSize: 20, fontWeight: '800', marginTop: 6, fontVariant: ['tabular-nums'] }}>{price}</Text>
      <Text numberOfLines={1} style={{ color: selected ? C.fg : C.fg2, fontSize: 12.5, marginTop: 1 }}>{sub}</Text>
    </Pressable>
  );
}
