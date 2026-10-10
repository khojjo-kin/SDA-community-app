import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useAuth, useClerk } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { Icon } from '../../src/components/Icon';
import { Avatar, Button, Divider, Screen, ScreenHeader, SectionLabel, useToast } from '../../src/components/ui';
import { C, errText } from '../../src/lib/theme';

/**
 * Every account signed in on this phone, like Instagram's account switcher. Tapping one makes it
 * the account in use; Add account signs in another without logging this one out.
 */
export default function Accounts() {
  const clerk = useClerk();
  const { signOut } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const sessions = (clerk.client?.activeSessions ?? []).filter((s) => s.user);
  const currentId = clerk.session?.id ?? null;

  async function use(id: string) {
    if (id === currentId || busy) return;
    setBusy(id);
    try {
      await clerk.setActive({ session: id });
      router.replace('/');
    } catch (e) {
      toast(errText(e));
      setBusy(null);
    }
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
            if (id === currentId) await signOut({ sessionId: id });
            else await sessions.find((s) => s.id === id)?.remove();
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
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, minHeight: 64, backgroundColor: pressed ? 'rgba(255,255,255,0.05)' : 'transparent', opacity: busy && busy !== s.id ? 0.6 : 1 })}>
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
          <Button label="Add account" onPress={() => router.push({ pathname: '/sign-in', params: { add: '1' } } as any)} />
          <Button label="Create a new account" kind="ghost" onPress={() => router.push({ pathname: '/sign-up', params: { add: '1' } } as any)} />
        </View>
      </ScrollView>
    </Screen>
  );
}
