import React, { useCallback, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Icon, IconName } from '../../src/components/Icon';
import { Button, Empty, ErrorNote, Field, Loading, Screen, ScreenHeader, useToast } from '../../src/components/ui';
import { fetchMyPublisher, requestPublisher } from '../../src/lib/api';
import { useAppFont } from '../../src/lib/fonts';
import { tap } from '../../src/lib/haptics';
import { useT } from '../../src/lib/i18n';
import { useSession } from '../../src/lib/session';
import { C, errText } from '../../src/lib/theme';
import type { Publisher } from '../../src/lib/types';

function Status({ icon, tone, title, note }: { icon: IconName; tone: string; title: string; note?: string }) {
  const font = useAppFont('bold');
  return (
    <View style={{ alignItems: 'center', gap: 10, paddingTop: 28, paddingBottom: 8 }}>
      <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={40} color={tone} weight={2} />
      </View>
      <Text accessibilityRole="header" style={{ color: C.fg, fontSize: 21, fontWeight: '800', textAlign: 'center', fontFamily: font }}>{title}</Text>
      {note ? <Text style={{ color: C.fg2, fontSize: 15, lineHeight: 21, textAlign: 'center' }}>{note}</Text> : null}
    </View>
  );
}

/** Asking to publish in Sabbath School, and where the request has got to. */
export default function SabbathPublisher() {
  const router = useRouter();
  const toast = useToast();
  const t = useT();
  const { me, profile } = useSession();
  const [row, setRow] = useState<Publisher | null | undefined>(undefined);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [again, setAgain] = useState(false);
  const [busy, setBusy] = useState(false);
  /** Set at once on the first tap, so a quick second tap can't send the request twice. */
  const sending = useRef(false);

  const load = useCallback(() => {
    if (!me) return;
    setError('');
    fetchMyPublisher(me)
      .then((r) => {
        setRow(r);
        setNote(r?.note ?? '');
      })
      .catch((e) => setError(errText(e)));
  }, [me]);
  useFocusEffect(load);

  async function send() {
    if (sending.current || !note.trim()) return;
    sending.current = true;
    setBusy(true);
    try {
      await requestPublisher(me, note, row?.status === 'rejected');
      tap('success');
      toast(t('ssPub.sent'));
      // The request shows as pending straight away; the server's copy follows.
      setRow((r) => ({ user_id: me, status: 'pending', note: note.trim().slice(0, 1000), decided_by: null, decided_at: null, created_at: r?.created_at ?? new Date().toISOString() }));
      setAgain(false);
      load();
    } catch (e) {
      toast(errText(e));
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  const write = () => router.replace('/sabbath-post-edit' as any);

  let body: React.ReactNode;
  if (profile?.admin_role) {
    body = (
      <>
        <Status icon="check" tone={C.accent2} title={t('ssPub.youCanPublish')} />
        <Button label={t('ssPub.publish')} onPress={write} style={{ marginTop: 16 }} />
      </>
    );
  } else if (profile?.restricted) {
    body = <Empty icon="lesson" title={t('ssPub.under14')} />;
  } else if (row === undefined) {
    body = error ? <ErrorNote message={error} onRetry={load} /> : <Loading />;
  } else if (!row || again) {
    body = (
      <View style={{ gap: 16, paddingTop: 8 }}>
        <Field label={t('ssPub.aboutYou')} value={note} onChangeText={setNote} placeholder={t('ssPub.aboutPlaceholder')} maxLength={1000} multiline autoFocus style={{ minHeight: 140, textAlignVertical: 'top', lineHeight: 22 }} />
        <Button label={t('ssPub.send')} busy={busy} disabled={!note.trim()} onPress={send} />
      </View>
    );
  } else if (row.status === 'pending') {
    body = <Status icon="clock" tone={C.warn} title={t('ssPub.pending')} note={row.note} />;
  } else if (row.status === 'approved') {
    body = (
      <>
        <Status icon="check" tone={C.accent2} title={t('ssPub.approved')} />
        <Button label={t('ssPub.publish')} onPress={write} style={{ marginTop: 16 }} />
      </>
    );
  } else if (row.status === 'rejected') {
    body = (
      <>
        <Status icon="close" tone={C.fg2} title={t('ssPub.rejected')} note={row.note} />
        <Button label={t('ssPub.askAgain')} kind="ghost" onPress={() => setAgain(true)} style={{ marginTop: 16 }} />
      </>
    );
  } else {
    body = <Status icon="block" tone={C.fg2} title={t('ssPub.revoked')} />;
  }

  return (
    <Screen>
      <ScreenHeader title={t('ssPub.become')} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
          {body}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
