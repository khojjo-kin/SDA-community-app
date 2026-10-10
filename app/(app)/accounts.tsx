import React, { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useClerk, useSessionList } from '@clerk/clerk-expo';
import { useNavigationContainerRef, useRouter } from 'expo-router';
import { Icon } from '../../src/components/Icon';
import { Avatar, Button, Divider, IconButton, Screen, ScreenHeader, SectionLabel, useToast } from '../../src/components/ui';
import { liveOpen, MAX_ACCOUNTS, removeAccount, setAddingAccount, switchAccount } from '../../src/lib/accounts';
import { useCalls } from '../../src/lib/calls';
import { tap } from '../../src/lib/haptics';
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
  // A ref as well: a quick second tap arrives before `busy` has drawn.
  const busyRef = useRef(false);

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

  /** One change of account at a time, with its row busy meanwhile. */
  async function busyWith(id: string, work: () => Promise<unknown>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(id);
    try {
      await work();
    } catch (e) {
      toast(errText(e));
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  }

  function use(id: string) {
    if (id === currentId || busyRef.current || blocked()) return;
    tap('select');
    // Every screen closes and the app opens again at Home as that account.
    busyWith(id, () => switchAccount(clerk, id));
  }

  function add(screen: '/sign-in' | '/sign-up') {
    if (busyRef.current || blocked()) return;
    if (sessions.length >= MAX_ACCOUNTS) return toast(t('accounts.limit', { count: MAX_ACCOUNTS }));
    setAddingAccount(true);
    router.replace(screen);
  }

  function remove(id: string, name: string) {
    if (busyRef.current) return;
    Alert.alert(`Log out of ${name}?`, 'The account stays as it is; it is only removed from this phone.', [
      { text: 'Cancel', style: 'cancel' },
      // The one in use hands over to another account signed in here.
      { text: 'Log out', style: 'destructive', onPress: () => { busyWith(id, () => removeAccount(clerk, id)); } },
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
              accessibilityState={{ selected: current, busy: busy === s.id }}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingLeft: 16, paddingRight: 8, minHeight: 64, backgroundColor: pressed ? C.press : 'transparent', opacity: busy && busy !== s.id ? 0.6 : 1 })}>
              <Avatar uri={u.hasImage ? u.imageUrl : null} name={u.fullName ?? name} size={46} />
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ color: C.fg, fontSize: 16.5, fontWeight: current ? '700' : '500' }}>{name}</Text>
                {u.fullName ? <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 13.5 }}>{u.fullName}</Text> : null}
              </View>
              {busy === s.id ? <ActivityIndicator color={C.fg2} style={{ width: 40 }} /> : current ? <Icon name="check" size={22} color={C.accent2} weight={2.4} /> : null}
              {/* Logging an account out of this phone, in plain sight (holding the row does the same). */}
              {busy === s.id ? null : <IconButton name="more" size={22} color={C.fg2} label={t('accounts.logOutOf', { name })} onPress={() => remove(s.id, name)} />}
            </Pressable>
          );
        })}
        <Divider />
        <View style={{ padding: 16, gap: 10 }}>
          <Button label="Add account" onPress={() => add('/sign-in')} />
          <Button label="Create a new account" kind="ghost" onPress={() => add('/sign-up')} />
        </View>
      </ScrollView>
    </Screen>
  );
}
