import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useClerk } from '@clerk/clerk-expo';
import { useNavigationContainerRef, useRouter } from 'expo-router';
import { type Account, liveOpen, MAX_ACCOUNTS, setAddingAccount, switchAccount, type SwitchTarget, useAccounts } from '../lib/accounts';
import { cacheKey, readCache } from '../lib/cache';
import { useCalls } from '../lib/calls';
import { tap } from '../lib/haptics';
import { useT } from '../lib/i18n';
import { useSession } from '../lib/session';
import { C, errText } from '../lib/theme';
import type { Profile } from '../lib/types';
import { Icon, Mark } from './Icon';
import { Avatar, Sheet, useToast } from './ui';

type Face = { username: string; avatar: string | null };

/**
 * Each account's username and photo as the app shows them: the profile in use, and for the others
 * the copy of their profile this phone kept when they were last in use. Clerk's copy until then.
 */
function useFaces(accounts: Account[]): Record<string, Face> {
  const { me, profile } = useSession();
  const [kept, setKept] = useState<Record<string, Face>>({});
  const ids = accounts.map((a) => a.userId).join(',');
  useEffect(() => {
    let live = true;
    const list = ids ? ids.split(',') : [];
    Promise.all(list.map((id) => readCache<Profile>(cacheKey(id, 'profile')).then((p) => [id, p] as const))).then((rows) => {
      if (!live) return;
      const next: Record<string, Face> = {};
      for (const [id, p] of rows) if (p && p.id === id) next[id] = { username: p.username, avatar: p.avatar_url || null };
      setKept(next);
    });
    return () => {
      live = false;
    };
  }, [ids]);
  const faces: Record<string, Face> = {};
  for (const a of accounts) {
    const p = a.userId === me && profile ? { username: profile.username, avatar: profile.avatar_url || null } : kept[a.userId];
    faces[a.userId] = { username: p?.username || a.username, avatar: p?.avatar || a.imageUrl };
  }
  return faces;
}

/** Instagram's account switcher: every account signed in on this phone, then Add account. */
export function AccountSwitcher({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const clerk = useClerk();
  const router = useRouter();
  const nav = useNavigationContainerRef();
  const toast = useToast();
  const t = useT();
  const { inCall } = useCalls();
  const accounts = useAccounts();
  const faces = useFaces(accounts);
  const [busy, setBusy] = useState<string | null>(null);
  // A ref as well: a second tap can arrive before the busy state has drawn.
  const busyRef = useRef(false);
  // Left to run even if the sheet goes meanwhile: what it does (a message, opening the sign-in page) still applies.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Closes the sheet, then does `then` once it has slid away: a message would otherwise be hidden
   * under the sheet, and a new page opened while it is still going can leave it stuck on iPhone.
   */
  function closeThen(then: () => void) {
    onClose();
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      then();
    }, 380);
  }

  /** A call or a live would be cut off by another account taking over: those end first. */
  function blocked() {
    if (inCall || liveOpen(nav.isReady() ? nav.getRootState() : undefined)) {
      closeThen(() => toast(t('accounts.busy')));
      return true;
    }
    return false;
  }

  async function pick(a: Account) {
    if (a.current) return onClose();
    if (busyRef.current || blocked()) return;
    tap('select');
    busyRef.current = true;
    setBusy(a.sessionId);
    try {
      // The app closes this screen (and the sheet with it) and opens again at Home as that account.
      await switchAccount(clerk, a.sessionId, { to: faces[a.userId] });
    } catch (e) {
      toast(errText(e));
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  }

  function add() {
    if (busyRef.current || blocked()) return;
    if (accounts.length >= MAX_ACCOUNTS) {
      closeThen(() => toast(t('accounts.limit', { count: MAX_ACCOUNTS })));
      return;
    }
    tap('light');
    busyRef.current = true;
    // The sign-in pages, with this account still signed in; the app layout clears this when it shows again.
    closeThen(() => {
      busyRef.current = false;
      setAddingAccount(true);
      router.replace('/sign-in');
    });
  }

  return (
    <Sheet visible={visible} onClose={onClose}>
      <ScrollView bounces={false} style={{ flexGrow: 0 }}>
        {accounts.map((a) => {
          const face = faces[a.userId];
          return (
            <Pressable
              key={a.sessionId}
              onPress={() => pick(a)}
              accessibilityRole="button"
              accessibilityState={{ selected: a.current, busy: busy === a.sessionId }}
              accessibilityLabel={a.current ? t('accounts.inUse', { username: face.username }) : t('accounts.switchTo', { username: face.username })}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, minHeight: 72, backgroundColor: pressed ? C.press : 'transparent', opacity: busy && busy !== a.sessionId ? 0.5 : 1 })}>
              <Avatar uri={face.avatar} name={face.username} size={52} />
              <Text numberOfLines={1} style={{ flex: 1, color: C.fg, fontSize: 16.5, fontWeight: '600' }}>
                {face.username}
              </Text>
              {busy === a.sessionId ? (
                <ActivityIndicator color={C.fg2} />
              ) : a.current ? (
                <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="check" size={15} color={C.onAccent} weight={3} />
                </View>
              ) : (
                <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: C.fg3 }} />
              )}
            </Pressable>
          );
        })}
        <Pressable
          onPress={add}
          accessibilityRole="button"
          accessibilityLabel={t('accounts.add')}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, minHeight: 72, backgroundColor: pressed ? C.press : 'transparent', opacity: busy ? 0.5 : 1 })}>
          <View style={{ width: 52, height: 52, borderRadius: 26, borderWidth: StyleSheet.hairlineWidth * 2, borderColor: C.fg3, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="plus" size={24} color={C.fg} weight={2} />
          </View>
          <Text style={{ flex: 1, color: C.fg, fontSize: 16.5, fontWeight: '600' }}>{t('accounts.add')}</Text>
        </Pressable>
      </ScrollView>
    </Sheet>
  );
}

/** Drawn in place of the app while it moves to another account: who it is moving to. */
export function SwitchingCover({ to }: { to: SwitchTarget }) {
  return (
    <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
      {to.avatar || to.username ? <Avatar uri={to.avatar} name={to.username} size={84} /> : <Mark size={72} />}
      {to.username ? <Text style={{ color: C.fg, fontSize: 17, fontWeight: '700' }}>{to.username}</Text> : null}
      <ActivityIndicator color={C.fg2} />
    </View>
  );
}
