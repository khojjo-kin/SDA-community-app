import React from 'react';
import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Icon } from '../../src/components/Icon';
import { Screen, ScreenHeader, useToast } from '../../src/components/ui';
import { setPrefs, usePrefs } from '../../src/lib/prefs';
import { useSession } from '../../src/lib/session';
import { WALLPAPERS } from '../../src/lib/wallpapers';
import { BUBBLE, C } from '../../src/lib/theme';

const GUTTER = 16;
const GAP = 12;

/** A small picture of a chat on the given background: two bubbles, theirs then yours. */
function Preview({ colors, width }: { colors: readonly [string, string, string] | null; width: number }) {
  const height = Math.round((width * 4) / 3);
  const bubbles = (
    <View style={{ flex: 1, justifyContent: 'flex-end', padding: 12, gap: 8 }}>
      <View style={{ alignSelf: 'flex-start', width: '62%', height: 26, borderRadius: 13, backgroundColor: '#262a31' }} />
      <LinearGradient colors={[BUBBLE[0], BUBBLE[1]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ alignSelf: 'flex-end', width: '48%', height: 26, borderRadius: 13 }} />
    </View>
  );
  const frame = { width, height, borderRadius: 18, overflow: 'hidden' as const, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' };
  if (!colors) return <View style={[frame, { backgroundColor: C.bg }]}>{bubbles}</View>;
  return (
    <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={frame}>
      {bubbles}
    </LinearGradient>
  );
}

export default function ChatWallpaper() {
  const router = useRouter();
  const toast = useToast();
  const prefs = usePrefs();
  const { profile } = useSession();
  const { width } = useWindowDimensions();
  const plus = !!profile?.plus;
  const tile = Math.floor((width - GUTTER * 2 - GAP) / 2);

  const choices: { id: string; name: string; colors: readonly [string, string, string] | null }[] = [{ id: '', name: 'None', colors: null }, ...WALLPAPERS];

  function choose(id: string) {
    if (!plus) {
      toast('Chat wallpapers are part of Community Plus');
      router.push('/plus');
      return;
    }
    setPrefs({ chatWallpaper: id });
  }

  return (
    <Screen>
      <ScreenHeader title="Chat wallpaper" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: GUTTER, paddingBottom: 60 }}>
        {plus ? (
          <Text style={{ color: C.fg2, fontSize: 15, lineHeight: 20, paddingVertical: 10 }}>The look behind every chat on this phone. Your bubbles stay the same.</Text>
        ) : (
          <Pressable onPress={() => router.push('/plus')} accessibilityRole="button" accessibilityLabel="Chat wallpapers are part of Community Plus. Find out more" style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, marginVertical: 8, borderRadius: 14, backgroundColor: pressed ? C.surface2 : C.surface })}>
            <Icon name="crown" size={24} color={C.accent2} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.fg, fontSize: 15.5, fontWeight: '700' }}>A Community Plus perk</Text>
              <Text style={{ color: C.fg2, fontSize: 13.5, lineHeight: 18, marginTop: 1 }}>Have a look around. Join Plus to set one behind your chats.</Text>
            </View>
            <Icon name="right" size={18} color={C.fg2} weight={2} />
          </Pressable>
        )}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP, paddingTop: 8 }}>
          {choices.map((w) => {
            const on = plus && prefs.chatWallpaper === w.id;
            return (
              <Pressable key={w.id || 'none'} onPress={() => choose(w.id)} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={w.name} style={({ pressed }) => ({ width: tile, opacity: pressed ? 0.75 : 1 })}>
                <View>
                  <Preview colors={w.colors} width={tile} />
                  {on ? (
                    <View style={{ position: 'absolute', top: 10, right: 10, width: 28, height: 28, borderRadius: 14, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: C.bg }}>
                      <Icon name="check" size={16} color="#fff" weight={2.6} />
                    </View>
                  ) : null}
                </View>
                <Text numberOfLines={1} style={{ color: on ? C.fg : C.fg2, fontSize: 15, fontWeight: on ? '700' : '400', textAlign: 'center', paddingTop: 8, paddingBottom: 6 }}>{w.name}</Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </Screen>
  );
}
