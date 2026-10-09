import React from 'react';
import { Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C } from '../lib/theme';
import { Mark } from './Icon';

export function Wordmark({ size = 40 }: { size?: number }) {
  return (
    <Text accessibilityRole="header" style={{ color: C.fg, fontSize: size, fontFamily: Platform.OS === 'ios' ? 'SnellRoundhand-Bold' : 'cursive', textAlign: 'center' }}>
      Community
    </Text>
  );
}

/**
 * The frame around every sign-in page: light through a church window behind the logo, and the
 * form on solid dark below it. To use a photograph instead, replace assets/auth-bg.jpg with one
 * (portrait, about 780 x 1690); the bottom half is darkened here so the form always stays legible.
 */
export function AuthShell({ children, title, footer }: { children: React.ReactNode; title?: string; footer?: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Image source={require('../../assets/auth-bg.jpg')} style={[StyleSheet.absoluteFill, { width: '100%', height: '100%' }]} resizeMode="cover" accessibilityIgnoresInvertColors />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'flex-end', paddingHorizontal: 28, paddingTop: insets.top + 24, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
          <View style={{ alignItems: 'center', gap: 6, marginBottom: 26 }}>
            <Mark size={84} />
            <Wordmark />
            <Text style={{ color: 'rgba(243,245,247,0.78)', fontSize: 13.5, letterSpacing: 1.6, textTransform: 'uppercase' }}>Seventh-day Adventist</Text>
          </View>
          <View style={{ gap: 14 }}>
            {title ? <Text style={{ color: C.fg2, textAlign: 'center', marginBottom: 6, lineHeight: 20 }}>{title}</Text> : null}
            {children}
          </View>
        </ScrollView>
        {footer ? <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.14)', paddingTop: 16, paddingBottom: insets.bottom + 16, alignItems: 'center' }}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </View>
  );
}
