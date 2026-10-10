import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Field, Screen, ScreenHeader, useToast } from '../../src/components/ui';
import { openSupportTicket } from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import { C, errText } from '../../src/lib/theme';

/** A message to the admins. The reply comes back under Help and support. */
export default function SupportTicket() {
  const { me } = useSession();
  const router = useRouter();
  const toast = useToast();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  async function send() {
    if (busy) return;
    if (!subject.trim()) return toast('Give it a subject');
    if (body.trim().length < 10) return toast('Tell us a little more');
    setBusy(true);
    try {
      await openSupportTicket(me, subject, body);
      toast('Sent. An admin will reply here.');
      if (router.canGoBack()) router.back();
      else router.replace('/help');
    } catch (e) {
      toast(errText(e));
      setBusy(false);
    }
  }

  return (
    <Screen>
      <ScreenHeader title="Message support" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}>
          <Text style={{ color: C.fg2, lineHeight: 20 }}>Tell the admins what is wrong or what you need. They reply inside the app: look under Help and support, then Your tickets.</Text>
          <Field label="Subject" value={subject} onChangeText={setSubject} placeholder="What is it about?" maxLength={140} autoFocus returnKeyType="next" />
          <Field label="Message" value={body} onChangeText={setBody} placeholder="What happened, and what you expected" multiline maxLength={4000} style={{ minHeight: 160, textAlignVertical: 'top' }} />
          <View style={{ paddingTop: 4 }}>
            <Button label="Send" onPress={send} busy={busy} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
