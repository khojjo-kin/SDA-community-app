import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useAppFont } from '../lib/fonts';
import { DARK } from '../lib/theme';
import { Icon, IconName } from './Icon';
import { Button } from './ui';

/*
 * For the screens that stay dark in every theme: the camera, the editors, the story viewer, reels,
 * video, calls, live and the sign-in pages. Empty, Loading and ErrorNote in ui.tsx follow the theme,
 * so on these screens they would put dark words on black in the White theme; these draw in DARK.
 */

/**
 * Light status bar text (clock, battery) over a dark screen, while the screen is the one showing.
 * The status bar mounted last wins, so one left up on a screen further down the stack, or on a tab
 * that isn't showing, would keep light text over the next screen even when that one is white.
 */
export function DarkStatusBar() {
  const navigation = useNavigation();
  const [focused, setFocused] = useState(() => {
    try {
      return navigation.isFocused();
    } catch {
      return true;
    }
  });
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  return focused ? <StatusBar style="light" /> : null;
}

/** ui.tsx's Loading, on a dark screen. */
export function DarkLoading() {
  return (
    <View style={{ padding: 40, alignItems: 'center' }}>
      <ActivityIndicator color={DARK.fg2} />
    </View>
  );
}

/** ui.tsx's Empty, on a dark screen. */
export function DarkEmpty({ title, body, icon, action }: { title: string; body?: string; icon?: IconName; action?: React.ReactNode }) {
  const font = useAppFont();
  const fontBold = useAppFont('bold');
  return (
    <View style={{ padding: 36, alignItems: 'center', gap: 8 }}>
      {icon ? <Icon name={icon} size={44} color={DARK.fg2} /> : null}
      <Text style={{ color: DARK.fg, fontSize: 17, fontWeight: '700', textAlign: 'center', fontFamily: fontBold }}>{title}</Text>
      {body ? <Text style={{ color: DARK.fg2, textAlign: 'center', lineHeight: 20, fontFamily: font }}>{body}</Text> : null}
      {action}
    </View>
  );
}

/** ui.tsx's ErrorNote, on a dark screen. */
export function DarkErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={{ padding: 28, alignItems: 'center', gap: 12 }}>
      <Text style={{ color: DARK.fg, fontSize: 16, fontWeight: '700', textAlign: 'center' }}>This didn't load</Text>
      <Text style={{ color: DARK.fg2, textAlign: 'center', lineHeight: 20 }}>{message}</Text>
      {onRetry ? <Button label="Try again" kind="ghost" small onPress={onRetry} /> : null}
    </View>
  );
}
