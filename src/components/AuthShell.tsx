import React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C } from '../lib/theme';

export function Wordmark({ size = 44 }: { size?: number }) {
  return (
    <Text accessibilityRole="header" style={{ color: C.fg, fontSize: size, fontFamily: Platform.OS === 'ios' ? 'SnellRoundhand-Bold' : 'cursive', textAlign: 'center' }}>
      Community
    </Text>
  );
}

export function AuthShell({ children, title, footer }: { children: React.ReactNode; title?: string; footer?: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 28, paddingTop: insets.top + 24, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        <View style={{ gap: 14 }}>
          <Wordmark />
          {title ? <Text style={{ color: C.fg2, textAlign: 'center', marginBottom: 6, lineHeight: 20 }}>{title}</Text> : <View style={{ height: 6 }} />}
          {children}
        </View>
      </ScrollView>
      {footer ? <View style={{ borderTopWidth: 1, borderTopColor: C.line, paddingTop: 16, paddingBottom: insets.bottom + 16, alignItems: 'center' }}>{footer}</View> : null}
    </KeyboardAvoidingView>
  );
}
