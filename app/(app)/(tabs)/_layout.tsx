import React, { useCallback, useEffect, useState } from 'react';
import { AppState, Pressable, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, IconName } from '../../../src/components/Icon';
import { NowPlayingBar } from '../../../src/components/NowPlayingBar';
import { Avatar, TAB_BAR_HEIGHT, tabBarBottom } from '../../../src/components/ui';
import { fetchThreads } from '../../../src/lib/api';
import { tap } from '../../../src/lib/haptics';
import { type Key, useT } from '../../../src/lib/i18n';
import { prefetchLibrary } from '../../../src/lib/library';
import { PlayerEngine } from '../../../src/lib/player';
import { useSession } from '../../../src/lib/session';
import { announce, listen } from '../../../src/lib/store';
import { supabase } from '../../../src/lib/supabase';
import { C, DARK } from '../../../src/lib/theme';

// The label is a key, looked up as the bar draws, so it is always in the app's language.
const ICONS: Record<string, { icon: IconName; label: Key }> = {
  index: { icon: 'home', label: 'tabs.home' },
  reels: { icon: 'reels', label: 'tabs.clips' },
  inbox: { icon: 'send', label: 'tabs.messages' },
  explore: { icon: 'search', label: 'tabs.search' },
  profile: { icon: 'user', label: 'tabs.profile' },
};

function useUnreadThreads(me: string) {
  const [unread, setUnread] = useState(false);
  const check = useCallback(() => {
    fetchThreads()
      .then((t) => setUnread(t.some((x) => x.unread_count > 0 && x.has_messages && !x.muted)))
      .catch(() => {});
  }, []);
  useEffect(() => {
    check();
    const stop = listen('threads', check);
    const timer = setInterval(check, 30000);
    // Back from the background: the dot catches up at once rather than at the next half minute.
    const app = AppState.addEventListener('change', (next) => {
      if (next === 'active') check();
    });
    return () => {
      stop();
      clearInterval(timer);
      app.remove();
    };
  }, [check]);

  // A new message in any of my chats moves the dot and the Messages list on straight away. Both
  // listen for 'threads', so one word reaches both; a burst of messages brings one refresh.
  useEffect(() => {
    if (!me) return;
    let live = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let soon: ReturnType<typeof setTimeout> | null = null;
    const nudge = () => {
      if (soon) return;
      soon = setTimeout(() => {
        soon = null;
        if (live) announce('threads');
      }, 400);
    };
    // The sign-in token first, so the server only sends messages from this member's own chats.
    supabase.realtime
      .setAuth()
      .catch(() => {})
      .then(() => {
        if (!live) return;
        channel = supabase
          .channel(`inbox:${me}:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`)
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'community_messages' }, nudge)
          .subscribe();
      });
    return () => {
      live = false;
      if (soon) clearTimeout(soon);
      if (channel) supabase.removeChannel(channel).catch(() => {});
    };
  }, [me]);
  return unread;
}

function TabBar({ state, navigation }: any) {
  const insets = useSafeAreaInsets();
  const { me, profile } = useSession();
  const unread = useUnreadThreads(me);
  const t = useT();
  // Over Clips (always black video) the bar stays dark whatever the theme, as the video does.
  const P = state.routes[state.index]?.name === 'reels' ? DARK : C;
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: tabBarBottom(insets.bottom), alignItems: 'center', gap: 8 }}>
      {/* Pod's sound lives here, where nothing unmounts it; the bar above the tabs shows once a track is loaded. */}
      <PlayerEngine />
      <NowPlayingBar />
      <BlurView intensity={50} tint={P.blurTint} style={{ width: '92%', maxWidth: 420, height: TAB_BAR_HEIGHT, borderRadius: TAB_BAR_HEIGHT / 2, overflow: 'hidden', borderWidth: 1, borderColor: P.hairline }}>
        <View style={{ flex: 1, flexDirection: 'row', padding: 6, backgroundColor: P.glass }}>
          {state.routes.map((route: any, i: number) => {
            const meta = ICONS[route.name];
            if (!meta) return null;
            const on = state.index === i;
            const press = () => {
              // A light tap under the finger, as on the app's other buttons (off when haptics are off in Settings).
              tap('select');
              const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!on && !e.defaultPrevented) navigation.navigate(route.name, route.params);
            };
            return (
              <Pressable key={route.key} onPress={press} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={t(meta.label)} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 26, backgroundColor: on ? (P.blurTint === 'light' ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.14)') : 'transparent' }}>
                {route.name === 'profile' ? (
                  <View style={{ borderRadius: 16, borderWidth: 1.5, borderColor: on ? P.fg : 'transparent' }}>
                    <Avatar uri={profile?.avatar_url} name={profile?.full_name} size={27} />
                  </View>
                ) : (
                  <Icon name={meta.icon} size={26} color={P.fg} weight={on ? 2.6 : 1.9} />
                )}
                {route.name === 'inbox' && unread ? <View style={{ position: 'absolute', top: 13, right: '28%', width: 9, height: 9, borderRadius: 5, backgroundColor: C.like }} /> : null}
              </Pressable>
            );
          })}
        </View>
      </BlurView>
    </View>
  );
}

export default function TabsLayout() {
  // Load the newest photos ahead of time, so the + opens the library with them already there.
  useEffect(() => {
    prefetchLibrary();
  }, []);
  return (
    <Tabs screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: C.bg } }} tabBar={(props) => <TabBar {...props} />}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="reels" />
      <Tabs.Screen name="inbox" />
      <Tabs.Screen name="explore" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
