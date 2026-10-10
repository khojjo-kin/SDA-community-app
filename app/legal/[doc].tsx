import React from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LegalBody } from '../../src/components/LegalDocument';
import { RoundButton, Screen } from '../../src/components/ui';
import { useT } from '../../src/lib/i18n';

/**
 * A legal document as a page of its own: /legal/terms, /legal/privacy, /legal/copyright,
 * /legal/child-safety and /legal/community-guidelines.
 *
 * It is outside the (app) and (auth) groups on purpose: neither group's sign-in redirect applies, so
 * it opens whether or not anyone is signed in (the root layout only waits for sign-in to load).
 * Inside the app, buttons open the same documents in a sheet instead (useLegalSheet), which keeps the
 * screen underneath as it was.
 */
export default function LegalPage() {
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const router = useRouter();
  const t = useT();
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  return (
    <Screen>
      <View style={{ height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 }}>
        <RoundButton name="back" label={t('common.back')} onPress={back} />
      </View>
      <LegalBody id={String(doc ?? '')} onOpenDoc={(id) => router.push(`/legal/${id}`)} />
    </Screen>
  );
}
