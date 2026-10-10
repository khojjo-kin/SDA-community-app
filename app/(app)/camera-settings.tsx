import React, { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import { useRouter } from 'expo-router';
import { Divider, Radio, RoundButton, Row, Screen, ScreenHeader, SectionLabel, Toggle, useToast } from '../../src/components/ui';
import { setPrefs, usePrefs } from '../../src/lib/prefs';
import { C, errText } from '../../src/lib/theme';

type Access = 'all' | 'limited' | 'none';

export default function CameraSettings() {
  const router = useRouter();
  const toast = useToast();
  const prefs = usePrefs();
  const [access, setAccess] = useState<Access>('none');

  const check = useCallback(() => {
    MediaLibrary.getPermissionsAsync()
      .then((p) => setAccess(p.granted ? (p.accessPrivileges === 'limited' ? 'limited' : 'all') : 'none'))
      .catch(() => {});
  }, []);

  useEffect(() => {
    check();
    // Coming back from the Settings app may have changed the answer.
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') check();
    });
    return () => sub.remove();
  }, [check]);

  async function toggleAccess(next: boolean) {
    try {
      if (next) {
        const p = await MediaLibrary.getPermissionsAsync();
        if (!p.granted && p.canAskAgain) {
          await MediaLibrary.requestPermissionsAsync();
          check();
          return;
        }
      }
      // iPhone only lets the Settings app turn this on again, or off.
      await Linking.openSettings();
    } catch (e) {
      toast(errText(e));
    }
  }

  const done = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const side = (value: 'left' | 'right', label: string) => (
    <Pressable onPress={() => setPrefs({ toolsSide: value })} accessibilityRole="radio" accessibilityState={{ checked: prefs.toolsSide === value }} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, minHeight: 56, backgroundColor: pressed ? C.press : 'transparent' })}>
      <Text style={{ flex: 1, color: C.fg, fontSize: 17.5 }}>{label}</Text>
      <Radio on={prefs.toolsSide === value} />
    </Pressable>
  );

  return (
    <Screen>
      <ScreenHeader title="Camera settings" noBack right={<RoundButton name="check" label="Done" bg={C.accent} color={C.onAccent} onPress={done} />} />
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        <Row icon="story" title="Story" onPress={() => router.push('/story-settings')} />
        <Row icon="reels" title="Reels" onPress={() => router.push('/reel-settings')} />
        <Divider thin />

        <SectionLabel strong>Controls</SectionLabel>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, minHeight: 56 }}>
          <Text style={{ flex: 1, color: C.fg, fontSize: 17.5 }}>Default to front camera</Text>
          <Toggle value={prefs.frontCamera} onChange={(v) => setPrefs({ frontCamera: v })} label="Default to front camera" />
        </View>
        <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6 }}>
          <Text style={{ color: C.fg, fontSize: 17.5 }}>Story tools</Text>
          <Text style={{ color: C.fg2, fontSize: 15, lineHeight: 20, marginTop: 4 }}>Choose which side of the screen you want the text, sticker and drawing tools to be on.</Text>
        </View>
        <View accessibilityRole="radiogroup">
          {side('left', 'Left-hand side')}
          {side('right', 'Right-hand side')}
        </View>
        <Divider thin />

        <SectionLabel strong>Camera roll</SectionLabel>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 16, paddingTop: 10, gap: 16 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: C.fg, fontSize: 17.5 }}>Allow access</Text>
            <Text style={{ color: C.fg2, fontSize: 15, lineHeight: 20, marginTop: 4 }}>
              {access === 'limited'
                ? 'Community can see the photos and videos you selected. Nothing leaves your phone until you share it.'
                : 'Lets Community show your photos and videos when you make a story, so you can choose what to share. Nothing leaves your phone until you share it.'}
            </Text>
          </View>
          <Toggle value={access !== 'none'} onChange={toggleAccess} label="Allow access to your photos" />
        </View>
        {access === 'limited' ? (
          <View style={{ paddingTop: 12 }}>
            <Row title="Manage selected photos" onPress={() => MediaLibrary.presentPermissionsPickerAsync().catch((e) => toast(errText(e)))} />
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
