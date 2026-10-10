import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useClerk, useSessionList } from '@clerk/clerk-expo';
import { useNavigationContainerRef, useRouter } from 'expo-router';
import { Icon } from '../../src/components/Icon';
import { Avatar, Button, Divider, Screen, ScreenHeader, SectionLabel, useToast } from '../../src/components/ui';
import { liveOpen, MAX_ACCOUNTS, removeAccount, setAddingAccount, switchAccount } from '../../src/lib/accounts';
import { useCalls } from '../../src/lib/calls';
import { t } from '../../src/lib/i18n';
import { C, errText } from '../../src/lib/theme';

/**
 * Every account signed in on this phone, like Instagram's account switcher. Tapping one makes it
 * the account in use; Add account signs in another without logging this one out.
 */
export default function Accounts() {
  const clerk = useClerk();
  const router = useRouter();
  const nav = useNavigationContainerRef();
  const toast = useToast();
  const { inCall } = useCalls();
  const [busy, setBusy] = useState<string | null>(null);

  // Kept up to date as accounts are added or logged out (src/lib/accounts.ts).
  const { sessions: all } = useSessionList();
  const sessions = (all ?? []).filter((s) => s.status === 'active' && s.user);
  const currentId = clerk.session?.id ?? null;

  /** A call or a live would be cut off by another account taking over: those end first. */
  function blocked() {
    if (inCall || liveOpen(nav.isReady() ? nav.getRootState() : undefined)) {
      toast(t('accounts.busy'));
      return true;
    }
    return false;
  }

  async function use(id: string) {
    if (id === currentId || busy || blocked()) return;
    setBusy(id);
    try {
      // Every screen closes and the app opens again at Home as that account.
      await switchAccount(clerk, id);
    } catch (e) {
      toast(errText(e));
    } finally {
      setBusy(null);
    }
  }

  function add(screen: '/sign-in' | '/sign-up') {
    if (busy || blocked()) return;
    if (sessions.length >= MAX_ACCOUNTS) return toast(t('accounts.limit', { count: MAX_ACCOUNTS }));
    setAddingAccount(true);
    router.replace(screen);
  }

  function remove(id: string, name: string) {
    Alert.alert(`Log out of ${name}?`, 'The account stays as it is; it is only removed from this phone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: async () => {
          setBusy(id);
          try {
            // The one in use hands over to another account signed in here.
            await removeAccount(clerk, id);
          } catch (e) {
            toast(errText(e));
          } finally {
            setBusy(null);
          }
        },
      },
    ]);
  }

  return (
    <Screen>
      <ScreenHeader title="Accounts" />
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        <SectionLabel>On this phone</SectionLabel>
        {sessions.map((s) => {
          const u = s.user!;
          const name = u.username ? `@${u.username}` : u.primaryEmailAddress?.emailAddress ?? u.primaryPhoneNumber?.phoneNumber ?? 'Account';
          const current = s.id === currentId;
          return (
            <Pressable
              key={s.id}
              onPress={() => use(s.id)}
              onLongPress={() => remove(s.id, name)}
              accessibilityRole="button"
              accessibilityLabel={current ? `${name}, in use` : `Switch to ${name}`}
              accessibilityHint="Hold to log this account out"
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, minHeight: 64, backgroundColor: pressed ? C.press : 'transparent', opacity: busy && busy !== s.id ? 0.6 : 1 })}>
              <Avatar uri={u.hasImage ? u.imageUrl : null} name={u.fullName ?? name} size={46} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.fg, fontSize: 16.5, fontWeight: current ? '700' : '500' }}>{name}</Text>
                {u.fullName ? <Text style={{ color: C.fg2, fontSize: 13.5 }}>{u.fullName}</Text> : null}
              </View>
              {current ? <Icon name="check" size={22} color={C.accent2} weight={2.4} /> : null}
            </Pressable>
          );
        })}
        <Text style={{ color: C.fg3, fontSize: 13, paddingHorizontal: 16, paddingTop: 6, lineHeight: 18 }}>Hold an account to log it out of this phone.</Text>
        <Divider />
        <View style={{ padding: 16, gap: 10 }}>
          <Button label="Add account" onPress={() => add('/sign-in')} />
          <Button label="Create a new account" kind="ghost" onPress={() => add('/sign-up')} />
        </View>
      </ScrollView>
    </Screen>
  );
}
