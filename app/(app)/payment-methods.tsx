import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshControl, ScrollView } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PaymentsOff } from '../../src/components/CardPreview';
import { AddCardRow, CardRow, CardsSkeleton, useSavedCards } from '../../src/components/SavedCards';
import { ErrorNote, Screen, ScreenHeader } from '../../src/components/ui';
import { useT } from '../../src/lib/i18n';
import { C } from '../../src/lib/theme';

/**
 * The cards saved to the member's Stripe account: the one Plus renews with, and any others. The same
 * list heads the Payments page; this page stays for the screens that link straight to it (Plus, a
 * creator subscription whose renewal failed).
 */
export default function PaymentMethods() {
  const router = useRouter();
  const t = useT();
  const insets = useSafeAreaInsets();
  const { config, cards, error, load, openCard, startAdding, sheets } = useSavedCards();
  const [refreshing, setRefreshing] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function pull() {
    setRefreshing(true);
    await load(true);
    if (alive.current) setRefreshing(false);
  }

  let body: React.ReactNode;
  if (error && !cards) body = <ErrorNote message={error} onRetry={() => load(true)} />;
  else if (!config || !cards) body = <CardsSkeleton count={3} />;
  else if (!config.ready) body = <PaymentsOff onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))} />;
  else
    body = (
      <ScrollView contentContainerStyle={{ paddingTop: 4, paddingBottom: insets.bottom + 40 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={pull} tintColor={C.fg2} />}>
        {cards.map((c) => (
          <CardRow key={c.id} card={c} onPress={openCard} />
        ))}
        <AddCardRow onPress={startAdding} />
      </ScrollView>
    );

  return (
    <Screen>
      <ScreenHeader title={t('plus.paymentMethods')} />
      {body}
      {sheets}
    </Screen>
  );
}
