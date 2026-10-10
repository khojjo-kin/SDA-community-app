import React, { useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DARK } from '../lib/theme';
import { Mark } from './Icon';

/** The app's name as a word: a bold, bookish serif rather than a handwritten script. */
export function Wordmark({ size = 40 }: { size?: number }) {
  return (
    <Text accessibilityRole="header" style={{ color: DARK.fg, fontSize: size, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontWeight: '700', letterSpacing: 0.5, textAlign: 'center' }}>
      Community
    </Text>
  );
}

/**
 * The photographs behind the sign-in pages (portrait, 1080 x 2340). Each time a page mounts it takes the
 * next one in turn, so logging out and back in, or moving from sign-in to sign-up, changes the picture.
 * The first is picked at random so the app does not always open on the same one.
 */
const WALLPAPERS = [require('../../assets/auth-church.jpg'), require('../../assets/auth-bible.jpg'), require('../../assets/auth-desk.jpg')];
let nextWallpaper = Math.floor(Math.random() * WALLPAPERS.length);

function takeWallpaper() {
  const picked = WALLPAPERS[nextWallpaper];
  nextWallpaper = (nextWallpaper + 1) % WALLPAPERS.length;
  return picked;
}

/**
 * ui.tsx's Field draws in the app's theme; the sign-in pages are dark in every theme, so their fields
 * take these colours instead: `<Field {...DARK_FIELD} … />`.
 */
export const DARK_FIELD = { placeholderTextColor: DARK.fg3, selectionColor: DARK.accent2, keyboardAppearance: 'dark', style: { backgroundColor: DARK.surface, color: DARK.fg } } as const;

/**
 * The frame around every sign-in page: a photograph behind the logo, fading into the app's dark
 * below the top third so the form always stays legible. Dark in every theme.
 */
export function AuthShell({ children, title, footer }: { children: React.ReactNode; title?: string; footer?: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const [wallpaper] = useState(takeWallpaper);
  return (
    <View style={{ flex: 1, backgroundColor: DARK.bg }}>
      <Image source={wallpaper} style={[StyleSheet.absoluteFill, { width: '100%', height: '100%' }]} resizeMode="cover" accessibilityIgnoresInvertColors />
      <LinearGradient pointerEvents="none" colors={['rgba(11,16,20,0)', 'rgba(11,16,20,0.92)']} locations={[0.35, 1]} style={StyleSheet.absoluteFill} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'flex-end', paddingHorizontal: 28, paddingTop: insets.top + 24, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
          <View style={{ alignItems: 'center', gap: 6, marginBottom: 26 }}>
            {/* White whatever the theme: these pages are always dark. */}
            <Mark size={84} color="#fff" />
            <Wordmark />
            <Text style={{ color: 'rgba(243,245,247,0.78)', fontSize: 13.5, letterSpacing: 1.6, textTransform: 'uppercase' }}>Seventh-day Adventist</Text>
          </View>
          <View style={{ gap: 14 }}>
            {title ? <Text style={{ color: DARK.fg2, textAlign: 'center', marginBottom: 6, lineHeight: 20 }}>{title}</Text> : null}
            {children}
          </View>
        </ScrollView>
        {footer ? <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.14)', paddingTop: 16, paddingBottom: insets.bottom + 16, alignItems: 'center' }}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </View>
  );
}
