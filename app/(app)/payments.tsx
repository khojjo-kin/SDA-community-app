import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Icon } from '../../src/components/Icon';
import { RowsSkeleton } from '../../src/components/Skeleton';
import { Empty, ErrorNote, Screen, ScreenHeader } from '../../src/components/ui';
import { myTransactions } from '../../src/lib/api';
import { t } from '../../src/lib/i18n';
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
const isRefund = (tx: Transaction) => tx.kind === 'refund' || tx.amount_pence < 0;

function Pill({ label, color }: { label: string; color: string }) {
  return (
    <View style={{ height: 20, paddingHorizontal: 7, borderRadius: 10, backgroundColor: C.surface2, justifyContent: 'center' }}>
      <Text style={{ color, fontSize: 11, fontWeight: '700' }}>{label}</Text>
    </View>
  );
}

/** One payment. Memoised: the list draws again on every refresh, and a row only changes with its payment. */
const PaymentRow = React.memo(function PaymentRow({ tx }: { tx: Transaction }) {
  const refund = isRefund(tx);
  const amount = refund ? -Math.abs(tx.amount_pence) : tx.amount_pence;
  const label = KIND_LABEL[tx.kind] ?? 'Payment';
  const method = tx.method || 'Arranged by an admin';
  const plus = tx.kind === 'plus' && !refund;
  return (
    <View
      accessible
      accessibilityLabel={`${label}, ${money(amount, tx.currency)}, ${method}, ${when(tx.created_at)}${tx.status === 'refunded' ? ', refunded' : tx.status === 'failed' ? ', failed' : ''}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 11 }}>
      <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: plus ? C.accentSoft : C.surface, alignItems: 'center', justifyContent: 'center' }}>
        {plus ? <Icon name="crown" size={21} color={C.accent2} weight={2.1} /> : <Icon name={refund ? 'undo' : tx.kind === 'donation' ? 'gift' : tx.kind === 'ad' ? 'megaphone' : 'receipt'} size={21} color={C.fg2} />}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text numberOfLines={1} style={{ color: C.fg, fontSize: 16, fontWeight: '600', flexShrink: 1 }}>{label}</Text>
          {tx.status === 'refunded' ? <Pill label="Refunded" color={C.fg2} /> : tx.status === 'failed' ? <Pill label="Failed" color={C.like} /> : null}
        </View>
        <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 13.5 }}>{method}</Text>
        <Text style={{ color: C.fg3, fontSize: 12.5 }}>{when(tx.created_at)}</Text>
      </View>
      <Text style={{ color: refund || tx.status === 'failed' ? C.fg2 : C.fg, fontSize: 16.5, fontWeight: '700', fontVariant: ['tabular-nums'], textAlign: 'right', textDecorationLine: tx.status === 'failed' ? 'line-through' : 'none' }}>{money(amount, tx.currency)}</Text>
    </View>
  );
});

const keyOf = (tx: Transaction) => tx.id;
const renderPayment = ({ item }: { item: Transaction }) => <PaymentRow tx={item} />;

/** Everything the member has paid (and had back), from Stripe and from admins. */
export default function Payments() {
  const { me } = useSession();
  const [list, setList] = useState<Transaction[] | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const load = useCallback(async () => {
    if (!me) return;
    try {
      const rows = await myTransactions(me);
      if (!alive.current) return;
      setList(rows);
      setError('');
    } catch (e) {
      if (alive.current) setError(errText(e));
    }
  }, [me]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function pull() {
    setRefreshing(true);
    await load();
    if (alive.current) setRefreshing(false);
  }

  return (
    <Screen>
      <ScreenHeader title={t('plus.paymentHistory')} />
      {list === null ? (
        error ? <ErrorNote message={error} onRetry={() => { setError(''); load(); }} /> : <RowsSkeleton count={8} avatar={44} padY={11} />
      ) : (
        <FlatList
          data={list}
          keyExtractor={keyOf}
          renderItem={renderPayment}
          initialNumToRender={12}
          windowSize={7}
          contentContainerStyle={{ paddingTop: 4, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={pull} tintColor={C.fg2} />}
          ListEmptyComponent={<Empty icon="receipt" title="No payments yet" />}
        />
      )}
    </Screen>
  );
}
