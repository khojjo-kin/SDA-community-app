import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { AdminFrame, money, PageSpinner, usePagedList } from '../../src/components/AdminFrame';
import { penceFrom } from '../../src/components/FundraiserCard';
import { Icon } from '../../src/components/Icon';
import { RowsSkeleton, SlowLine } from '../../src/components/Skeleton';
import { Avatar, Button, Empty, ErrorNote, Field, RoundButton, SearchField, Sheet, useToast } from '../../src/components/ui';
import { addTransaction, deleteTransaction, fetchAdminStats, fetchMembers, fetchTransactions, PLUS_PRICE_PENCE } from '../../src/lib/api';
import { tap } from '../../src/lib/haptics';
import { useSession } from '../../src/lib/session';
import { C, dayLabel, errText } from '../../src/lib/theme';
import type { AdminStats, MemberCard, Transaction } from '../../src/lib/types';

/** A function, not a table, so the colours are read from the theme in use when it is drawn. */
const kinds = (): { id: Transaction['kind']; label: string; color: string }[] => [
  { id: 'plus', label: 'Plus', color: C.close },
  { id: 'donation', label: 'Donation', color: C.accent2 },
  { id: 'refund', label: 'Refund', color: C.like },
  { id: 'other', label: 'Other', color: C.fg2 },
  // Ads and subscriptions are only bought in the app, so these are not offered when logging by hand.
  { id: 'ad', label: 'Ad', color: C.warn },
  { id: 'subscription', label: 'Subscription', color: C.close },
];
const BY_HAND: Transaction['kind'][] = ['plus', 'donation', 'refund', 'other'];
const kindOf = (id: Transaction['kind']) => {
  const all = kinds();
  return all.find((k) => k.id === id) ?? all[3];
};
/** What a month of Plus costs, as typed into the amount field: "4.99". */
const PLUS_POUNDS = (PLUS_PRICE_PENCE / 100).toFixed(2);
/**
 * Money going back out. Refunds are stored as negative amounts (Stripe's, and those logged here), so
 * the server's income sum takes them off; older hand-logged ones may be positive, so either counts.
 */
const isRefund = (t: Transaction) => t.kind === 'refund' || t.amount_pence < 0;
/** Refunds, softer than the red used for warnings; on White the theme's red, as the soft one is too faint there. */
const refundRed = () => (C.blurTint === 'light' ? C.danger : '#e0707a');
/** Stripe's purple, lighter on the dark themes and deeper on White so it reads on either. */
const stripePurple = () => (C.blurTint === 'light' ? '#635bff' : '#9d8cff');

const keyOfTransaction = (t: Transaction) => t.id;

function Pill({ label, color, bg }: { label: string; color: string; bg?: string }) {
  return (
    <View style={{ height: 22, paddingHorizontal: 8, borderRadius: 11, backgroundColor: bg ?? C.surface2, justifyContent: 'center' }}>
      <Text style={{ color, fontSize: 11.5, fontWeight: '700' }}>{label}</Text>
    </View>
  );
}

/** "9 Sep" this year, "9 Sep 2025" otherwise. */
function when(iso: string): string {
  const d = new Date(iso);
  const year = d.getFullYear() === new Date().getFullYear() ? '' : ' ' + d.getFullYear();
  return dayLabel(d) + year;
}

function Total({ label, value }: { label: string; value: string | undefined }) {
  return (
    <View style={{ flex: 1, padding: 14, borderRadius: 14, backgroundColor: C.surface, gap: 2 }}>
      <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: C.accent2, fontSize: 22, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{value ?? '–'}</Text>
      <Text style={{ color: C.fg2, fontSize: 12.5 }}>{label}</Text>
    </View>
  );
}

/** One line in the books. A tap opens the member; the owner can press and hold to delete it. */
const TransactionRow = React.memo(function TransactionRow({ t, owner, onOpen, onRemove }: { t: Transaction; owner: boolean; onOpen: (userId: string) => void; onRemove: (t: Transaction) => void }) {
  const k = kindOf(t.kind);
  const refund = isRefund(t);
  const amount = refund ? -Math.abs(t.amount_pence) : t.amount_pence;
  const stripe = t.provider === 'stripe';
  return (
    <Pressable
      onPress={t.user_id ? () => onOpen(t.user_id!) : undefined}
      onLongPress={owner ? () => onRemove(t) : undefined}
      delayLongPress={450}
      accessibilityRole="button"
      accessibilityLabel={`${k.label}, ${money(amount, t.currency)}${t.username ? `, ${t.username}` : ''}, ${stripe ? 'paid through Stripe' : 'logged by hand'}${t.method ? `, ${t.method}` : ''}${t.status === 'refunded' ? ', refunded' : ''}, ${when(t.created_at)}`}
      accessibilityHint={owner ? 'Press and hold to delete' : undefined}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: pressed ? C.press : 'transparent' })}>
      {t.user_id ? (
        <Avatar uri={t.avatar_url} name={t.full_name ?? '?'} size={44} />
      ) : (
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="receipt" size={22} color={C.fg2} />
        </View>
      )}
      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Text numberOfLines={1} style={{ color: C.fg, fontWeight: '600', flexShrink: 1, marginRight: 2 }}>{t.username ? `@${t.username}` : 'No member'}</Text>
          <Pill label={k.label} color={k.color} />
          <Pill label={stripe ? 'Stripe' : 'Manual'} color={stripe ? stripePurple() : C.fg2} bg={stripe ? 'rgba(99,91,255,0.16)' : undefined} />
          {t.status === 'refunded' ? <Pill label="Refunded" color={refundRed()} bg="rgba(224,112,122,0.14)" /> : null}
        </View>
        {t.method ? <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 13.5 }}>{t.method}</Text> : null}
        {t.note ? <Text numberOfLines={2} style={{ color: C.fg2, fontSize: 13.5, lineHeight: 18 }}>{t.note}</Text> : null}
        <Text numberOfLines={1} style={{ color: C.fg3, fontSize: 12.5 }}>
          {when(t.created_at)}
          {t.created_by_username ? ` · logged by @${t.created_by_username}` : ''}
        </Text>
      </View>
      <Text style={{ color: refund ? refundRed() : C.fg, fontSize: 16.5, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{money(amount, t.currency)}</Text>
    </Pressable>
  );
});

/** Money in and out: payments made in the app, and those an admin logs by hand (Plus arranged through a church, donations, refunds). */
export default function AdminTransactions() {
  const { me, profile } = useSession();
  const router = useRouter();
  const toast = useToast();
  const owner = profile?.admin_role === 'owner';
  const [stats, setStats] = useState<AdminStats | null>(null);

  // The "add" sheet.
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<MemberCard[]>([]);
  const [who, setWho] = useState<MemberCard | null>(null);
  const [kind, setKind] = useState<Transaction['kind']>('plus');
  const [amount, setAmount] = useState(PLUS_POUNDS);
  const [currency, setCurrency] = useState('GBP');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const busyNow = useRef(false);
  const asked = useRef(0);

  const fetchPage = useCallback((last: Transaction | null) => fetchTransactions(last?.created_at), []);
  const list = usePagedList(fetchPage, { pageSize: 50, keyOf: keyOfTransaction });
  const { setItems, reload } = list;

  const loadStats = useCallback(() => {
    fetchAdminStats().then(setStats).catch(() => {});
  }, []);
  useFocusEffect(loadStats);

  // Finds members a moment after the last key; only the latest search may fill the list.
  useEffect(() => {
    if (!adding) return;
    const needle = q.trim();
    const n = ++asked.current;
    const wait = setTimeout(() => {
      if (needle.length < 2) {
        setFound([]);
        return;
      }
      fetchMembers(needle)
        .then((m) => {
          if (n === asked.current) setFound(m.slice(0, 8));
        })
        .catch(() => {
          if (n === asked.current) setFound([]);
        });
    }, 250);
    return () => clearTimeout(wait);
  }, [q, adding]);

  function reset() {
    setAdding(false);
    setQ('');
    setFound([]);
    setWho(null);
    setKind('plus');
    setAmount(PLUS_POUNDS);
    setCurrency('GBP');
    setNote('');
  }

  async function add() {
    if (busyNow.current) return;
    // "4,99" from a keypad with a decimal comma is £4.99, not £499.
    const pence = penceFrom(amount);
    if (pence === null || pence <= 0) return toast('Enter an amount, like 4.99');
    if (!/^[A-Za-z]{3}$/.test(currency.trim())) return toast('The currency is a three-letter code, like GBP');
    busyNow.current = true;
    setBusy(true);
    try {
      // A refund is typed as a positive amount but stored as money out, as Stripe's are, so the server's
      // income total takes it off rather than adding it.
      await addTransaction(me, { user_id: who?.id ?? null, kind, amount_pence: kind === 'refund' ? -pence : pence, currency: currency.trim(), note });
      tap('success');
      toast('Logged');
      reset();
      reload();
      loadStats();
    } catch (e) {
      toast(errText(e));
    } finally {
      busyNow.current = false;
      setBusy(false);
    }
  }

  const open = useCallback((userId: string) => router.push(`/admin-member/${userId}`), [router]);
  const remove = useCallback(
    (t: Transaction) => {
      if (!owner) return;
      Alert.alert('Delete this transaction?', `${money(t.amount_pence, t.currency)} · ${kindOf(t.kind).label}${t.username ? ` · @${t.username}` : ''}. This can't be undone.`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteTransaction(t.id)
              .then(() => {
                toast('Deleted');
                setItems((cur) => (cur ? cur.filter((x) => x.id !== t.id) : cur));
                loadStats();
              })
              .catch((e) => toast(errText(e)));
          },
        },
      ]);
    },
    [owner, setItems, loadStats, toast],
  );
  const renderItem = useCallback(({ item }: { item: Transaction }) => <TransactionRow t={item} owner={owner} onOpen={open} onRemove={remove} />, [owner, open, remove]);

  // The totals are the server's, over every transaction rather than the ones listed: Plus, ads and other
  // payments, less refunds of those (a refund with no Stripe payment, logged here, counts against income
  // too). Donations belong to the fundraisers' organisers, so they are shown apart.
  const header = (
    <View style={{ paddingHorizontal: 16, paddingBottom: 14, gap: 8 }}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Total label="Income this month" value={stats ? money(stats.income_month_pence) : undefined} />
        <Total label="Income all time" value={stats ? money(stats.income_pence) : undefined} />
      </View>
      {stats && stats.donations_pence === undefined ? null : (
        <View style={{ flexDirection: 'row' }}>
          <Total label="Given to fundraisers" value={stats?.donations_pence === undefined ? undefined : money(stats.donations_pence)} />
        </View>
      )}
    </View>
  );

  return (
    <AdminFrame section="transactions" title="Transactions" right={<RoundButton name="plus" label="Log a transaction" onPress={() => setAdding(true)} />}>
      <SlowLine active={list.slow} />
      {list.items === null ? (
        list.error ? (
          <ErrorNote message={list.error} onRetry={list.retry} />
        ) : (
          <>
            {header}
            <RowsSkeleton count={7} avatar={44} padY={10} />
          </>
        )
      ) : (
        <FlatList
          data={list.items}
          keyExtractor={keyOfTransaction}
          renderItem={renderItem}
          initialNumToRender={12}
          windowSize={11}
          onEndReached={list.more}
          onEndReachedThreshold={0.6}
          ListHeaderComponent={header}
          ListFooterComponent={<PageSpinner active={list.paging} />}
          refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={() => { list.refresh(); loadStats(); }} tintColor={C.fg2} />}
          contentContainerStyle={{ paddingBottom: 40 }}
          ListEmptyComponent={<Empty icon="receipt" title="Nothing logged yet" />}
        />
      )}

      <Sheet visible={adding} onClose={reset} title="Log a transaction" tall>
        <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 12, gap: 14 }}>
          <View style={{ gap: 8 }}>
            <Text style={{ color: C.fg2, fontSize: 12.5 }}>Member</Text>
            {who ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 12, backgroundColor: C.surface }}>
                <Avatar uri={who.avatar_url} name={who.full_name} size={36} />
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ color: C.fg, fontWeight: '600' }}>{who.full_name}</Text>
                  <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 13 }}>@{who.username}</Text>
                </View>
                <Button small kind="ghost" label="Change" onPress={() => setWho(null)} />
              </View>
            ) : (
              <>
                <View style={{ marginHorizontal: -14 }}>
                  <SearchField value={q} onChangeText={setQ} placeholder="Name or username" label="Search members" />
                </View>
                {found.map((m) => (
                  <Pressable key={m.id} onPress={() => { setWho(m); setQ(''); setFound([]); }} accessibilityRole="button" accessibilityLabel={`${m.full_name}, ${m.username}`} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, opacity: pressed ? 0.6 : 1 })}>
                    <Avatar uri={m.avatar_url} name={m.full_name} size={34} />
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={{ color: C.fg, fontWeight: '600' }}>{m.full_name}</Text>
                      <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 13 }}>@{m.username}</Text>
                    </View>
                  </Pressable>
                ))}
                {!found.length && q.trim().length >= 2 ? <Text style={{ color: C.fg3, fontSize: 13 }}>No one found</Text> : null}
              </>
            )}
          </View>

          <View style={{ gap: 8 }}>
            <Text style={{ color: C.fg2, fontSize: 12.5 }}>Kind</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {kinds()
                .filter((k) => BY_HAND.includes(k.id))
                .map((k) => (
                  <Pressable key={k.id} onPress={() => setKind(k.id)} accessibilityRole="radio" accessibilityLabel={k.label} accessibilityState={{ checked: kind === k.id }} style={({ pressed }) => ({ height: 34, paddingHorizontal: 14, borderRadius: 17, backgroundColor: kind === k.id ? C.fg : C.surface, justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
                    <Text style={{ color: kind === k.id ? C.bg : C.fg, fontWeight: '600' }}>{k.label}</Text>
                  </Pressable>
                ))}
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 2 }}>
              <Field label="Amount" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder={PLUS_POUNDS} />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Currency" value={currency} onChangeText={(v) => setCurrency(v.toUpperCase())} autoCapitalize="characters" autoCorrect={false} maxLength={3} placeholder="GBP" />
            </View>
          </View>
          <Field label="Note" value={note} onChangeText={setNote} placeholder="Optional" maxLength={500} />
          <Button label="Log it" onPress={add} busy={busy} />
        </ScrollView>
      </Sheet>
    </AdminFrame>
  );
}
