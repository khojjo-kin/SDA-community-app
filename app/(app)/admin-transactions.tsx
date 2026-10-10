import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { AdminFrame, money } from '../../src/components/AdminFrame';
import { Icon } from '../../src/components/Icon';
import { Avatar, Button, Empty, ErrorNote, Field, Loading, RoundButton, SearchField, Sheet, useToast } from '../../src/components/ui';
import { addTransaction, deleteTransaction, fetchAdminStats, fetchMembers, fetchTransactions, PLUS_PRICE_PENCE } from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import { C, dayLabel, errText } from '../../src/lib/theme';
import type { AdminStats, MemberCard, Transaction } from '../../src/lib/types';

const KINDS: { id: Transaction['kind']; label: string; color: string }[] = [
  { id: 'plus', label: 'Plus', color: C.close },
  { id: 'donation', label: 'Donation', color: C.accent2 },
  { id: 'refund', label: 'Refund', color: C.like },
  { id: 'other', label: 'Other', color: C.fg2 },
];
const kindOf = (id: Transaction['kind']) => KINDS.find((k) => k.id === id) ?? KINDS[3];
/** What a month of Plus costs, as typed into the amount field: "4.99". */
const PLUS_POUNDS = (PLUS_PRICE_PENCE / 100).toFixed(2);
/** Money going back out: Stripe records refunds as negative amounts, admins log them as positive ones. */
const isRefund = (t: Transaction) => t.kind === 'refund' || t.amount_pence < 0;
/** Refunds, softer than the red used for warnings. */
const REFUND_RED = '#e0707a';

function Pill({ label, color, bg = C.surface2 }: { label: string; color: string; bg?: string }) {
  return (
    <View style={{ height: 22, paddingHorizontal: 8, borderRadius: 11, backgroundColor: bg, justifyContent: 'center' }}>
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

/** Money in and out, logged by hand by an admin: Plus payments arranged through a church, donations, refunds. */
export default function AdminTransactions() {
  const { me, profile } = useSession();
  const router = useRouter();
  const toast = useToast();
  const owner = profile?.admin_role === 'owner';
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [list, setList] = useState<Transaction[] | null>(null);
  const [error, setError] = useState('');

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

  const load = useCallback(() => {
    fetchTransactions().then(setList).catch((e) => setError(errText(e)));
    fetchAdminStats().then(setStats).catch(() => {});
  }, []);
  useFocusEffect(load);

  useEffect(() => {
    if (!adding) return;
    const t = setTimeout(() => {
      if (q.trim().length < 2) return setFound([]);
      fetchMembers(q.trim()).then((m) => setFound(m.slice(0, 8))).catch(() => setFound([]));
    }, 250);
    return () => clearTimeout(t);
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
    if (busy) return;
    const pounds = parseFloat(amount.replace(/[£,\s]/g, ''));
    if (!isFinite(pounds) || pounds <= 0) return toast('Enter an amount, like 4.99');
    if (!/^[A-Za-z]{3}$/.test(currency.trim())) return toast('The currency is a three-letter code, like GBP');
    setBusy(true);
    try {
      await addTransaction(me, { user_id: who?.id ?? null, kind, amount_pence: Math.round(pounds * 100), currency: currency.trim(), note });
      toast('Logged');
      reset();
      load();
    } catch (e) {
      toast(errText(e));
    } finally {
      setBusy(false);
    }
  }

  function remove(t: Transaction) {
    if (!owner) return;
    Alert.alert('Delete this transaction?', `${money(t.amount_pence, t.currency)} · ${kindOf(t.kind).label}${t.username ? ` · @${t.username}` : ''}. This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { deleteTransaction(t.id).then(() => { toast('Deleted'); load(); }).catch((e) => toast(errText(e))); } },
    ]);
  }

  // The server's income totals count Plus, donations and other money in, but not refunds; take the
  // refunds in the list off them so the totals are what was actually kept.
  const refunded = useMemo(() => {
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
    let month = 0;
    let all = 0;
    for (const t of list ?? []) {
      if (!isRefund(t)) continue;
      const back = Math.abs(t.amount_pence);
      all += back;
      if (new Date(t.created_at).getTime() >= monthStart) month += back;
    }
    return { month, all };
  }, [list]);

  const header = (
    <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 14 }}>
      <Total label="This month" value={stats && list ? money(stats.income_month_pence - refunded.month) : undefined} />
      <Total label="All time" value={stats && list ? money(stats.income_pence - refunded.all) : undefined} />
    </View>
  );

  return (
    <AdminFrame section="transactions" title="Transactions" right={<RoundButton name="plus" label="Log a transaction" onPress={() => setAdding(true)} />}>
      {list === null ? (
        error ? <ErrorNote message={error} onRetry={load} /> : <Loading />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(t) => t.id}
          contentContainerStyle={{ paddingBottom: 40 }}
          ListHeaderComponent={header}
          ListEmptyComponent={<Empty icon="receipt" title="Nothing logged yet" body="Tap + to log a Plus payment, a donation or a refund." />}
          renderItem={({ item: t }) => {
            const k = kindOf(t.kind);
            const refund = isRefund(t);
            const amount = refund ? -Math.abs(t.amount_pence) : t.amount_pence;
            const stripe = t.provider === 'stripe';
            return (
              <Pressable
                onPress={() => (t.user_id ? router.push(`/admin-member/${t.user_id}`) : undefined)}
                onLongPress={owner ? () => remove(t) : undefined}
                delayLongPress={450}
                accessibilityRole="button"
                accessibilityLabel={`${k.label}, ${money(amount, t.currency)}${t.username ? `, ${t.username}` : ''}, ${stripe ? 'paid through Stripe' : 'logged by hand'}${t.method ? `, ${t.method}` : ''}${t.status === 'refunded' ? ', refunded' : ''}, ${when(t.created_at)}`}
                accessibilityHint={owner ? 'Press and hold to delete' : undefined}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: pressed ? 'rgba(255,255,255,0.04)' : 'transparent' })}>
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
                    <Pill label={stripe ? 'Stripe' : 'Manual'} color={stripe ? '#9d8cff' : C.fg2} bg={stripe ? 'rgba(99,91,255,0.16)' : C.surface2} />
                    {t.status === 'refunded' ? <Pill label="Refunded" color={REFUND_RED} bg="rgba(224,112,122,0.14)" /> : null}
                  </View>
                  {t.method ? <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 13.5 }}>{t.method}</Text> : null}
                  {t.note ? <Text numberOfLines={2} style={{ color: C.fg2, fontSize: 13.5, lineHeight: 18 }}>{t.note}</Text> : null}
                  <Text style={{ color: C.fg3, fontSize: 12.5 }}>
                    {when(t.created_at)}{t.created_by_username ? ` · logged by @${t.created_by_username}` : ''}
                  </Text>
                </View>
                <Text style={{ color: refund ? REFUND_RED : C.fg, fontSize: 16.5, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{money(amount, t.currency)}</Text>
              </Pressable>
            );
          }}
        />
      )}

      <Sheet visible={adding} onClose={reset} title="Log a transaction" tall>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 12, gap: 14 }}>
          <View style={{ gap: 8 }}>
            <Text style={{ color: C.fg2, fontSize: 12.5 }}>Member</Text>
            {who ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 12, backgroundColor: C.surface }}>
                <Avatar uri={who.avatar_url} name={who.full_name} size={36} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.fg, fontWeight: '600' }}>{who.full_name}</Text>
                  <Text style={{ color: C.fg2, fontSize: 13 }}>@{who.username}</Text>
                </View>
                <Button small kind="ghost" label="Change" onPress={() => setWho(null)} />
              </View>
            ) : (
              <>
                <View style={{ marginHorizontal: -14 }}>
                  <SearchField value={q} onChangeText={setQ} placeholder="Name or username, or leave empty" label="Search members" />
                </View>
                {found.map((m) => (
                  <Pressable key={m.id} onPress={() => { setWho(m); setQ(''); setFound([]); }} accessibilityRole="button" accessibilityLabel={`${m.full_name}, ${m.username}`} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, opacity: pressed ? 0.6 : 1 })}>
                    <Avatar uri={m.avatar_url} name={m.full_name} size={34} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: C.fg, fontWeight: '600' }}>{m.full_name}</Text>
                      <Text style={{ color: C.fg2, fontSize: 13 }}>@{m.username}</Text>
                    </View>
                  </Pressable>
                ))}
                {!found.length && q.trim().length >= 2 ? <Text style={{ color: C.fg3, fontSize: 13 }}>No one found.</Text> : null}
                {!q.trim() ? <Text style={{ color: C.fg3, fontSize: 13 }}>No member: the money is not tied to an account.</Text> : null}
              </>
            )}
          </View>

          <View style={{ gap: 8 }}>
            <Text style={{ color: C.fg2, fontSize: 12.5 }}>Kind</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {KINDS.map((k) => (
                <Pressable key={k.id} onPress={() => setKind(k.id)} accessibilityRole="radio" accessibilityLabel={k.label} accessibilityState={{ checked: kind === k.id }} style={({ pressed }) => ({ height: 34, paddingHorizontal: 14, borderRadius: 17, backgroundColor: kind === k.id ? C.fg : C.surface, justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
                  <Text style={{ color: kind === k.id ? C.bg : C.fg, fontWeight: '600' }}>{k.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 2 }}>
              <Field label="Amount in pounds" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder={PLUS_POUNDS} />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Currency" value={currency} onChangeText={(t) => setCurrency(t.toUpperCase())} autoCapitalize="characters" maxLength={3} placeholder="GBP" />
            </View>
          </View>
          <Field label="Note" value={note} onChangeText={setNote} placeholder="Which church, which month, a reference" maxLength={500} />
          <Button label="Log it" onPress={add} busy={busy} />
        </ScrollView>
      </Sheet>
    </AdminFrame>
  );
}
