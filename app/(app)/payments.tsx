import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { Icon, type IconName, VerifiedTick } from '../../src/components/Icon';
import { AddCardRow, CardRow, CardsSkeleton, useSavedCards } from '../../src/components/SavedCards';
import { RowsSkeleton } from '../../src/components/Skeleton';
import { Avatar, Screen, ScreenHeader, SectionLabel, Sheet, useToast } from '../../src/components/ui';
import { mySubscriptions, myTransactions } from '../../src/lib/api';
import { tap } from '../../src/lib/haptics';
import { type Key, useT } from '../../src/lib/i18n';
import { lastPaymentsConfig, money } from '../../src/lib/payments';
import { useSession } from '../../src/lib/session';
import { C, dayLabel, errText, monthName } from '../../src/lib/theme';
import type { BillingStatus, CreatorSub, Transaction } from '../../src/lib/types';

type T = ReturnType<typeof useT>;

/** Payments read at a time; scrolling to the end reads the next lot. */
const PAGE = 30;
/** Plus subscriptions that still renew (or are trying to). */
const RENEWING = ['active', 'trialing', 'past_due', 'unpaid'];

/** What each kind of payment is called (when the payment itself says nothing more) and its icon. */
const KIND: Record<Transaction['kind'], { label: Key; icon: IconName }> = {
  plus: { label: 'common.communityPlus', icon: 'crown' },
  subscription: { label: 'payments.kindSubscription', icon: 'users' },
  donation: { label: 'payments.kindDonation', icon: 'gift' },
  ad: { label: 'payments.kindAd', icon: 'megaphone' },
  refund: { label: 'payments.kindRefund', icon: 'undo' },
  other: { label: 'payments.kindOther', icon: 'receipt' },
};

const pad2 = (n: number) => String(n).padStart(2, '0');
const sameYear = (d: Date) => d.getFullYear() === new Date().getFullYear();

/** "9 Oct" this year, "9 Oct 2025" otherwise. */
function shortDay(iso: string): string {
  const d = new Date(iso);
  return dayLabel(d) + (sameYear(d) ? '' : ' ' + d.getFullYear());
}

/** "9 October 2026, 14:05". */
function fullDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${monthName(d)} ${d.getFullYear()}, ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** "October" this year, "October 2025" otherwise. */
function monthLabel(d: Date): string {
  return monthName(d) + (sameYear(d) ? '' : ' ' + d.getFullYear());
}

/** A refund is money back, whichever way round it was recorded. */
const isRefund = (tx: Transaction) => tx.kind === 'refund' || tx.amount_pence < 0;

/** What it was. Card payments carry their own words ("Community Plus · renewal", "Donation · Choir trip"); one an admin logged says its kind. */
function txTitle(tx: Transaction, t: T): string {
  const note = tx.provider === 'stripe' ? (tx.note ?? '').trim() : '';
  return note || t((KIND[tx.kind] ?? KIND.other).label);
}

/** "£4.99", or "+£4.99" for money back. */
function amountText(tx: Transaction): string {
  return isRefund(tx) ? '+' + money(Math.abs(tx.amount_pence), tx.currency) : money(tx.amount_pence, tx.currency);
}

function statusText(tx: Transaction, t: T): string {
  if (tx.status === 'failed') return t('payments.failed');
  if (tx.status === 'refunded' || isRefund(tx)) return t('payments.refunded');
  return t('payments.paid');
}

/** The reference Stripe (or the app, for one an admin logged) knows the payment by. */
function reference(tx: Transaction): string {
  const s = tx.stripe_invoice_id ?? '';
  if (s.startsWith('pi:')) return s.slice(3);
  if (s.startsWith('refund:')) return s.split(':')[1] || s;
  return s || tx.id;
}

/** Community Plus in one line: the plan and when it renews or ends, or that there is none. Null while not known yet. */
function plusLine(b: BillingStatus | null, plus: boolean, plusUntil: string | null | undefined, t: T): { text: string; bad?: boolean } | null {
  if (b && (RENEWING.includes(b.status) || b.status === 'incomplete')) {
    const plan = b.plan === 'yearly' ? t('plus.yearly') : t('plus.monthly');
    const day = b.current_period_end ? shortDay(b.current_period_end) : '';
    if (b.status === 'past_due' || b.status === 'unpaid') return { text: `${plan} · ${t('payments.paymentFailed')}`, bad: true };
    if (b.status === 'incomplete') return { text: t('plus.statusIncomplete'), bad: true };
    if (b.cancel_at_period_end) return { text: `${plan} · ${day ? t('creatorSubs.ends', { day }) : t('creatorSubs.ending')}` };
    if (b.status === 'trialing') return { text: day ? t('plus.statusTrialEndsOn', { day }) : t('plus.statusTrial') };
    return { text: `${plan} · ${day ? t('creatorSubs.renews', { day }) : b.plan === 'yearly' ? t('plus.statusRenewsYearly') : t('plus.statusRenewsMonthly')}` };
  }
  // Plus given by an admin or a church has no subscription behind it.
  if (plus) return { text: plusUntil ? t('payments.activeUntil', { day: shortDay(plusUntil) }) : t('settings.plusActive') };
  return b ? { text: t('payments.notSubscribed') } : null;
}

/** Where one subscription to a creator stands, in a few words. */
function standing(s: CreatorSub, t: T): string {
  const day = s.current_period_end ? shortDay(s.current_period_end) : '';
  if (s.status === 'past_due') return t('creatorSubs.paymentDue');
  if (s.cancel_at_period_end) return day ? t('creatorSubs.ends', { day }) : t('creatorSubs.ending');
  return day ? t('creatorSubs.renews', { day }) : t('creatorSubs.active');
}

/** The newest page read again, with the older pages already read kept under it. */
function mergeNewest(fresh: Transaction[], prev: Transaction[]): Transaction[] {
  const ids = new Set(fresh.map((x) => x.id));
  const oldest = fresh.length ? new Date(fresh[fresh.length - 1].created_at).getTime() : Infinity;
  return [...fresh, ...prev.filter((x) => !ids.has(x.id) && new Date(x.created_at).getTime() <= oldest)];
}

type Item = { type: 'month'; key: string; label: string } | { type: 'tx'; key: string; tx: Transaction };
const keyOf = (item: Item) => item.key;

/** The space on the left of every row, so cards, subscriptions and payments line up. */
function Lead({ children }: { children: React.ReactNode }) {
  return <View style={{ width: 46, alignItems: 'center' }}>{children}</View>;
}

function Round({ icon, color }: { icon: IconName; color?: string }) {
  return (
    <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={icon} size={20} color={color ?? C.fg} />
    </View>
  );
}

/** One payment. Memoised: the list draws again on every page and refresh, and a row only changes with its payment. */
const TxRow = React.memo(function TxRow({ tx, onPress }: { tx: Transaction; onPress: (tx: Transaction) => void }) {
  const t = useT();
  const refund = isRefund(tx);
  const failed = tx.status === 'failed';
  const title = txTitle(tx, t);
  const amount = amountText(tx);
  const status = statusText(tx, t);
  const line = [shortDay(tx.created_at), tx.method].filter(Boolean).join(' · ');
  const kind = KIND[tx.kind] ?? KIND.other;
  return (
    <Pressable
      onPress={() => onPress(tx)}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${amount}, ${status}, ${line}`}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: pressed ? C.press : 'transparent' })}>
      <Lead>
        <Round icon={refund ? 'undo' : kind.icon} color={tx.kind === 'plus' && !refund ? C.accent2 : undefined} />
      </Lead>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: C.fg, fontSize: 16, fontWeight: '600' }}>{title}</Text>
        <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 13.5, marginTop: 2 }}>{line}</Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 2 }}>
        <Text style={{ color: refund ? C.accent2 : failed ? C.fg3 : tx.status === 'refunded' ? C.fg2 : C.fg, fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'], textDecorationLine: failed ? 'line-through' : 'none' }}>{amount}</Text>
        <Text style={{ color: failed ? C.like : C.fg3, fontSize: 12.5, fontWeight: '600' }}>{status}</Text>
      </View>
    </Pressable>
  );
});

function MonthLabel({ label }: { label: string }) {
  return (
    <Text accessibilityRole="header" style={{ color: C.fg2, fontSize: 14.5, fontWeight: '700', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 }}>
      {label}
    </Text>
  );
}

/** A line in Subscriptions: a picture, a name, where it stands, and a chevron. */
function LineRow({ lead, title, line, lineColor, value, verified, onPress }: { lead: React.ReactNode; title: string; line?: string; lineColor?: string; value?: string; verified?: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[title, line, value].filter(Boolean).join(', ')}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 9, minHeight: 60, backgroundColor: pressed ? C.press : 'transparent' })}>
      <Lead>{lead}</Lead>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text numberOfLines={1} style={{ color: C.fg, fontSize: 16, fontWeight: '600', flexShrink: 1 }}>{title}</Text>
          {verified ? <VerifiedTick size={14} /> : null}
        </View>
        {line ? <Text numberOfLines={1} style={{ color: lineColor ?? C.fg2, fontSize: 13.5, marginTop: 2 }}>{line}</Text> : null}
      </View>
      {value ? <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 15.5 }}>{value}</Text> : null}
      <Icon name="right" size={18} color={C.fg2} weight={2} />
    </Pressable>
  );
}

/** A part of the page that didn't load: why, and Try again, as plain words. */
function Retry({ message, onRetry }: { message: string; onRetry: () => void }) {
  const t = useT();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 10 }}>
      <Text numberOfLines={2} style={{ flex: 1, color: C.fg2, fontSize: 14.5, lineHeight: 19 }}>{message}</Text>
      <Pressable onPress={onRetry} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('common.tryAgain')}>
        <Text style={{ color: C.accent2, fontSize: 15, fontWeight: '700' }}>{t('common.tryAgain')}</Text>
      </Pressable>
    </View>
  );
}

/** One fact about a payment in its sheet: the name on the left, the value on the right. */
function Fact({ label, value, color, onPress }: { label: string; value: string; color?: string; onPress?: () => void }) {
  const body = (
    <>
      <Text style={{ color: C.fg2, fontSize: 15.5 }}>{label}</Text>
      <Text selectable numberOfLines={2} style={{ flex: 1, textAlign: 'right', color: color ?? C.fg, fontSize: 15.5, fontVariant: ['tabular-nums'] }}>{value}</Text>
      {onPress ? <Icon name="copy" size={18} color={C.fg2} /> : null}
    </>
  );
  const style = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 16, paddingHorizontal: 20, paddingVertical: 12, minHeight: 50, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line };
  if (!onPress) return <View style={style}>{body}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}, ${value}`} style={({ pressed }) => [style, { backgroundColor: pressed ? C.press : 'transparent' }]}>
      {body}
    </Pressable>
  );
}

/** Everything about one payment. */
function TxDetail({ tx, onCopy }: { tx: Transaction; onCopy: (ref: string) => void }) {
  const t = useT();
  const refund = isRefund(tx);
  const failed = tx.status === 'failed';
  const ref = reference(tx);
  return (
    <View style={{ paddingBottom: 8 }}>
      <View style={{ alignItems: 'center', paddingHorizontal: 24, paddingTop: 10, paddingBottom: 22, gap: 6 }}>
        <Text style={{ color: refund ? C.accent2 : failed ? C.fg2 : C.fg, fontSize: 34, fontWeight: '800', fontVariant: ['tabular-nums'], textDecorationLine: failed ? 'line-through' : 'none' }}>{amountText(tx)}</Text>
        <Text numberOfLines={2} style={{ color: C.fg, fontSize: 16.5, fontWeight: '600', textAlign: 'center' }}>{txTitle(tx, t)}</Text>
      </View>
      <Fact label={t('payments.status')} value={statusText(tx, t)} color={failed ? C.like : undefined} />
      <Fact label={t('payments.date')} value={fullDate(tx.created_at)} />
      {/* A card payment whose card Stripe didn't describe has no method to show; only one an admin logged is "Arranged by an admin". */}
      {tx.method || tx.provider !== 'stripe' ? <Fact label={t('payments.method')} value={tx.method || t('payments.byAdmin')} /> : null}
      <Fact label={t('payments.reference')} value={ref} onPress={() => onCopy(ref)} />
    </View>
  );
}

/**
 * Payments: the cards saved for paying, Community Plus and the creators the member subscribes to, and
 * everything they have paid (Plus, creator subscriptions, gifts to fundraisers, ads) and had back,
 * newest first, by month.
 */
export default function Payments() {
  const { me, profile } = useSession();
  const router = useRouter();
  const toast = useToast();
  const t = useT();
  const insets = useSafeAreaInsets();
  const { config, cards, error: cardsError, load: loadCards, openCard, startAdding, sheets } = useSavedCards();
  const [subs, setSubs] = useState<CreatorSub[] | null>(null);
  const [list, setList] = useState<Transaction[] | null>(null);
  const [error, setError] = useState('');
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  // The payment whose sheet is open. It stays set while the sheet slides away, so the sheet doesn't empty as it goes.
  const [shown, setShown] = useState<Transaction | null>(null);
  const [detail, setDetail] = useState(false);

  // The list as last drawn, how many rows have been read from the server, and which reading of the
  // first page the pages after it belong to (a page arriving after a refresh started over is dropped).
  const listRef = useRef<Transaction[] | null>(null);
  const fetched = useRef(0);
  const generation = useRef(0);
  const paging = useRef(false);
  const lastPush = useRef(0);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  /** One screen per tap, however quickly a row is tapped twice. */
  const open = useCallback(
    (href: string) => {
      if (Date.now() - lastPush.current < 800) return;
      lastPush.current = Date.now();
      router.push(href);
    },
    [router],
  );

  const loadSubs = useCallback(async () => {
    if (!me) return;
    try {
      const s = await mySubscriptions(me);
      if (alive.current) setSubs(s);
    } catch {
      // Keeps what it had; the row to the full list is there either way.
    }
  }, [me]);

  /** The newest payments. `reset` (pull to refresh) starts the list over; coming back keeps the older pages already read. */
  const loadFirst = useCallback(
    async (reset: boolean) => {
      if (!me) return;
      try {
        const rows = await myTransactions(me, { offset: 0, limit: PAGE });
        if (!alive.current) return;
        setError('');
        const prev = listRef.current;
        let next: Transaction[];
        if (reset || !prev || prev.length <= PAGE) {
          generation.current++;
          next = rows;
          fetched.current = rows.length;
          setMore(rows.length === PAGE);
          setMoreError('');
        } else {
          next = mergeNewest(rows, prev);
        }
        listRef.current = next;
        setList(next);
      } catch (e) {
        if (!alive.current) return;
        if (listRef.current) {
          if (reset) toast(errText(e));
        } else setError(errText(e));
      }
    },
    [me, toast],
  );

  const loadMore = useCallback(async () => {
    const have = listRef.current;
    if (!me || !have || !more || paging.current) return;
    paging.current = true;
    const asked = generation.current;
    setLoadingMore(true);
    setMoreError('');
    try {
      const rows = await myTransactions(me, { offset: fetched.current, limit: PAGE });
      if (!alive.current || asked !== generation.current || !listRef.current) return;
      fetched.current += rows.length;
      const ids = new Set(listRef.current.map((x) => x.id));
      const next = [...listRef.current, ...rows.filter((x) => !ids.has(x.id))];
      listRef.current = next;
      setList(next);
      setMore(rows.length === PAGE);
    } catch (e) {
      if (alive.current && asked === generation.current) setMoreError(errText(e));
    } finally {
      paging.current = false;
      if (alive.current) setLoadingMore(false);
    }
  }, [me, more]);

  // On every visit: Plus may have been changed, a card added or a payment made on another screen.
  useFocusEffect(
    useCallback(() => {
      loadCards(true);
      loadSubs();
      loadFirst(false);
    }, [loadCards, loadSubs, loadFirst]),
  );

  async function pull() {
    setRefreshing(true);
    await Promise.all([loadCards(true), loadSubs(), loadFirst(true)]);
    if (alive.current) setRefreshing(false);
  }

  const openTx = useCallback((tx: Transaction) => {
    setShown(tx);
    setDetail(true);
  }, []);

  const copy = useCallback(
    (ref: string) => {
      Clipboard.setStringAsync(ref)
        .then(() => {
          tap('success');
          toast(t('payments.copied'));
        })
        .catch(() => {});
    },
    [toast, t],
  );

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    let month = '';
    for (const tx of list ?? []) {
      const d = new Date(tx.created_at);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      if (key !== month) {
        month = key;
        out.push({ type: 'month', key: 'month:' + key, label: monthLabel(d) });
      }
      out.push({ type: 'tx', key: tx.id, tx });
    }
    return out;
  }, [list]);

  const renderItem = useCallback(({ item }: { item: Item }) => (item.type === 'month' ? <MonthLabel label={item.label} /> : <TxRow tx={item.tx} onPress={openTx} />), [openTx]);

  // The last answer: drawn at once, and it already carries a cancel or resume made on the Plus page
  // (rememberBilling), which this visit's own answer only catches up with once it arrives.
  const billing: BillingStatus | null = lastPaymentsConfig() ?? config;
  // Until the subscription is known, no line at all (rather than "Active until …" from the profile and
  // then a plan with another date). If it can't be known, what the profile says.
  const plus = billing || cardsError ? plusLine(billing, !!profile?.plus, profile?.plus_until, t) ?? { text: t('payments.notSubscribed') } : null;

  const header = (
    <View>
      <SectionLabel strong>{t('payments.cards')}</SectionLabel>
      {cards ? (
        config && !config.ready ? (
          <Text style={{ color: C.fg2, fontSize: 15, paddingHorizontal: 16, paddingBottom: 4 }}>{t('pay.unavailable')}</Text>
        ) : (
          <>
            {cards.map((c) => (
              <CardRow key={c.id} card={c} onPress={openCard} />
            ))}
            <AddCardRow onPress={startAdding} />
          </>
        )
      ) : cardsError ? (
        <Retry message={cardsError} onRetry={() => loadCards(true)} />
      ) : (
        <CardsSkeleton />
      )}

      <SectionLabel strong>{t('settings.subscriptions')}</SectionLabel>
      <LineRow lead={<Round icon="crown" color={C.accent2} />} title={t('common.communityPlus')} line={plus?.text} lineColor={plus?.bad ? C.like : undefined} onPress={() => open('/plus')} />
      {(subs ?? []).map((s) => (
        <LineRow
          key={s.id}
          lead={<Avatar uri={s.profile?.avatar_url} name={s.profile?.full_name} size={42} />}
          title={s.profile?.username ?? t('creatorSubs.accountUnavailable')}
          verified={!!s.profile?.verified}
          line={`${t('plus.perMonth', { price: money(s.amount_pence) })} · ${standing(s, t)}`}
          lineColor={s.status === 'past_due' ? C.warn : undefined}
          onPress={() => open(`/subscribe/${s.creator_id}`)}
        />
      ))}
      <LineRow lead={<Round icon="users" />} title={t('payments.creatorSubs')} value={subs && subs.length === 0 ? t('payments.none') : undefined} onPress={() => open('/creator-subscriptions')} />

      <SectionLabel strong>{t('settings.transactions')}</SectionLabel>
    </View>
  );

  let empty: React.ReactElement;
  if (list) empty = <Text style={{ color: C.fg2, fontSize: 15, paddingHorizontal: 16, paddingTop: 2 }}>{t('payments.noPayments')}</Text>;
  else if (error) empty = <Retry message={error} onRetry={() => loadFirst(true)} />;
  else empty = <RowsSkeleton count={6} avatar={42} gap={18} padY={10} />;

  let footer: React.ReactElement | null = null;
  if (loadingMore) footer = <ActivityIndicator color={C.fg2} style={{ paddingVertical: 18 }} />;
  else if (moreError) footer = <Retry message={moreError} onRetry={loadMore} />;

  return (
    <Screen>
      <ScreenHeader title={t('payments.title')} />
      <FlatList
        data={items}
        keyExtractor={keyOf}
        renderItem={renderItem}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ListFooterComponent={footer}
        // After a page fails, only Try again asks again (the footer changing size would otherwise ask over and over).
        onEndReached={moreError ? undefined : () => { loadMore(); }}
        onEndReachedThreshold={0.5}
        initialNumToRender={14}
        windowSize={9}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={pull} tintColor={C.fg2} />}
      />

      <Sheet visible={detail} onClose={() => setDetail(false)}>
        {shown ? <TxDetail tx={shown} onCopy={copy} /> : null}
      </Sheet>
      {sheets}
    </Screen>
  );
}
