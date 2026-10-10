import React, { useCallback, useState } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Icon } from '../../src/components/Icon';
import { Empty, ErrorNote, Loading, Screen, ScreenHeader } from '../../src/components/ui';
import { myTransactions } from '../../src/lib/api';
import { money } from '../../src/lib/payments';
import { useSession } from '../../src/lib/session';
import { C, dayLabel, errText } from '../../src/lib/theme';
import type { Transaction } from '../../src/lib/types';

const KIND_LABEL: Record<Transaction['kind'], string> = { plus: 'Community Plus', refund: 'Refund', donation: 'Donation', other: 'Payment', ad: 'Ad', subscription: 'Subscription' };

/** "9 Oct" this year, "9 Oct 2025" otherwise. */
function when(iso: string): string {
  const d = new Date(iso);
  return dayLabel(d) + (d.getFullYear() === new Date().getFullYear() ? '' : ' ' + d.getFullYear());
}

/** A refund comes back as money out, whichever way round it was recorded. */
const isRefund = (t: Transaction) => t.kind === 'refund' || t.amount_pence < 0;

function Pill({ label, color }: { label: string; color: string }) {
  return (
    <View style={{ height: 20, paddingHorizontal: 7, borderRadius: 10, backgroundColor: C.surface2, justifyContent: 'center' }}>
      <Text style={{ color, fontSize: 11, fontWeight: '700' }}>{label}</Text>
    </View>
  );
}

/** Everything the member has paid (and had back), from Stripe and from admins. */
export default function Payments() {
  const { me } = useSession();
  const [list, setList] = useState<Transaction[] | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!me) return;
    try {
      setList(await myTransactions(me));
      setError('');
    } catch (e) {
      setError(errText(e));
    }
  }, [me]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function pull() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  return (
    <Screen>
      <ScreenHeader title="Payment history" />
      {list === null ? (
        error ? <ErrorNote message={error} onRetry={load} /> : <Loading />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(t) => t.id}
          contentContainerStyle={{ paddingTop: 4, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={pull} tintColor={C.fg2} />}
          ListEmptyComponent={<Empty icon="receipt" title="No payments yet" body="Your Plus payments and any refunds will show here." />}
          renderItem={({ item: t }) => {
            const refund = isRefund(t);
            const amount = refund ? -Math.abs(t.amount_pence) : t.amount_pence;
            const label = KIND_LABEL[t.kind] ?? 'Payment';
            const method = t.method || 'Arranged by an admin';
            return (
              <View
                accessible
                accessibilityLabel={`${label}, ${money(amount, t.currency)}, ${method}, ${when(t.created_at)}${t.status === 'refunded' ? ', refunded' : t.status === 'failed' ? ', failed' : ''}`}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 11 }}>
                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: t.kind === 'plus' ? C.close + '24' : C.surface, alignItems: 'center', justifyContent: 'center' }}>
                  {t.kind === 'plus' && !refund ? <Icon name="crown" size={21} color={C.close} weight={2.1} /> : <Icon name={refund ? 'undo' : t.kind === 'donation' ? 'gift' : t.kind === 'ad' ? 'megaphone' : 'receipt'} size={21} color={C.fg2} />}
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text numberOfLines={1} style={{ color: C.fg, fontSize: 16, fontWeight: '600', flexShrink: 1 }}>{label}</Text>
                    {t.status === 'refunded' ? <Pill label="Refunded" color={C.fg2} /> : t.status === 'failed' ? <Pill label="Failed" color={C.like} /> : null}
                  </View>
                  <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 13.5 }}>{method}</Text>
                  <Text style={{ color: C.fg3, fontSize: 12.5 }}>{when(t.created_at)}</Text>
                </View>
                <Text style={{ color: refund ? C.fg2 : C.fg, fontSize: 16.5, fontWeight: '700', fontVariant: ['tabular-nums'], textAlign: 'right' }}>{money(amount, t.currency)}</Text>
              </View>
            );
          }}
        />
      )}
    </Screen>
  );
}
