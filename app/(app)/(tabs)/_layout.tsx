import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, IconName } from '../../../src/components/Icon';
import { Avatar } from '../../../src/components/ui';
import { fetchThreads } from '../../../src/lib/api';
import { useSession } from '../../../src/lib/session';
import { listen } from '../../../src/lib/store';
import { C } from '../../../src/lib/theme';

const ICONS: Record<string, { icon: IconName; label: string }> = {
  index: { icon: 'home', label: 'Home' },
  reels: { icon: 'reels', label: 'Reels' },
  inbox: { icon: 'send', label: 'Messages' },
  explore: { icon: 'search', label: 'Search' },
  profile: { icon: 'user', label: 'Profile' },
};

function useUnreadThreads() {
  const [unread, setUnread] = useState(false);
  const check = useCallback(() => {
    fetchThreads()
      .then((t) => setUnread(t.some((x) => x.unread_count > 0)))
      .catch(() => {});
  }, []);
  useEffect(() => {
    check();
    const stop = listen('threads', check);
    const timer = setInterval(check, 30000);
    return () => {
      stop();
      clearInterval(timer);
    };
  }, [check]);
  return unread;
}

function TabBar({ state, navigation }: any) {
  const insets = useSafeAreaInsets();
  const { profile } = useSession();
  const unread = useUnreadThreads();
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: Math.max(insets.bottom - 8, 10), alignItems: 'center' }}>
      <BlurView intensity={50} tint="dark" style={{ width: '92%', maxWidth: 420, height: 64, borderRadius: 32, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)' }}>
        <View style={{ flex: 1, flexDirection: 'row', padding: 6, backgroundColor: C.glass }}>
          {state.routes.map((route: any, i: number) => {
            const meta = ICONS[route.name];
            if (!meta) return null;
            const on = state.index === i;
            const press = () => {
              const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!on && !e.defaultPrevented) navigation.navigate(route.name, route.params);
            };
            return (
              <Pressable key={route.key} onPress={press} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={meta.label} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 26, backgroundColor: on ? 'rgba(255,255,255,0.14)' : 'transparent' }}>
                {route.name === 'profile' ? (
                  <View style={{ borderRadius: 16, borderWidth: 1.5, borderColor: on ? C.fg : 'transparent' }}>
                    <Avatar uri={profile?.avatar_url} name={profile?.full_name} size={27} />
                  </View>
                ) : (
                  <Icon name={meta.icon} size={26} weight={on ? 2.6 : 1.9} />
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
