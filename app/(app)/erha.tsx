import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ErhaAvatar } from '../../src/components/ErhaAvatar';
import { Icon } from '../../src/components/Icon';
import { IconButton, Screen, useToast } from '../../src/components/ui';
import { askErha, clearErhaHistory, fetchErhaHistory } from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import { BUBBLE, C, errText } from '../../src/lib/theme';
import type { ErhaMessage } from '../../src/lib/types';

const OPENERS = ['What is this week\'s Sabbath School lesson about?', 'Suggest a hymn for a baptism', 'Pray with me for a friend who is unwell', 'Ideas for a youth outreach day', 'Explain Daniel 2 simply'];

type Row = ErhaMessage | { id: string; role: 'thinking'; content: ''; user_id: ''; created_at: '' };

export default function Erha() {
  const { me, profile } = useSession();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<Row[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const list = useRef<FlatList<Row>>(null);

  const load = useCallback(async () => {
    try {
      setRows(await fetchErhaHistory(me));
    } catch (e) {
      toast(errText(e));
    } finally {
      setLoaded(true);
    }
  }, [me, toast]);
  useEffect(() => {
    load();
  }, [load]);

  async function send(prompt?: string) {
    const t = (prompt ?? text).trim();
    if (!t || busy) return;
    setText('');
    setBusy(true);
    const now = new Date().toISOString();
    setRows((r) => [...r, { id: 'u' + now, user_id: me, role: 'user', content: t, created_at: now }, { id: 'thinking', role: 'thinking', content: '', user_id: '', created_at: '' }]);
    try {
      const res = await askErha(t);
      setRemaining(res.remaining);
      setRows((r) => [...r.filter((x) => x.id !== 'thinking'), { id: 'a' + Date.now(), user_id: me, role: 'assistant', content: res.reply, created_at: new Date().toISOString() }]);
    } catch (e) {
      setRows((r) => r.filter((x) => x.id !== 'thinking'));
      const msg = errText(e);
      toast(msg);
      if (/today's \d+ messages/.test(msg)) setRemaining(0);
    } finally {
      setBusy(false);
    }
  }

  function clear() {
    Alert.alert('Clear this conversation?', 'Erha will forget what you have talked about so far.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: () => { clearErhaHistory(me).then(() => setRows([])).catch((e) => toast(errText(e))); } },
    ]);
  }

  const renderItem = ({ item }: { item: Row }) => {
    if (item.role === 'thinking') {
      return (
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingVertical: 3 }}>
          <ErhaAvatar size={28} />
          <View style={{ borderRadius: 22, paddingHorizontal: 18, paddingVertical: 14, backgroundColor: '#262a31' }}>
            <ActivityIndicator color={C.fg2} />
          </View>
        </View>
      );
    }
    const mine = item.role === 'user';
    const shape = { borderRadius: 22, paddingHorizontal: 16, paddingVertical: 11, maxWidth: '78%' as const };
    return (
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingVertical: 3, justifyContent: mine ? 'flex-end' : 'flex-start' }}>
        {mine ? null : <ErhaAvatar size={28} />}
        {mine ? (
          <LinearGradient colors={[BUBBLE[0], BUBBLE[1]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={shape}>
            <Text selectable style={{ color: '#fff', fontSize: 16, lineHeight: 22 }}>{item.content}</Text>
          </LinearGradient>
        ) : (
          <View style={[shape, { backgroundColor: '#262a31' }]}>
            <Text selectable style={{ color: C.fg, fontSize: 16, lineHeight: 22 }}>{item.content}</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <Screen>
      <View style={{ height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, gap: 8 }}>
        <IconButton name="back" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/inbox'))} />
        <ErhaAvatar size={36} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: C.fg, fontSize: 17, fontWeight: '700' }}>Erha</Text>
          <Text style={{ color: C.fg2, fontSize: 12.5 }}>{profile?.plus ? 'Your church assistant · Plus' : remaining === null ? 'Your church assistant' : `${remaining} message${remaining === 1 ? '' : 's'} left today`}</Text>
        </View>
        <IconButton name="trash" label="Clear conversation" onPress={clear} />
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
        <FlatList
          ref={list}
          data={rows}
          keyExtractor={(r) => r.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingVertical: 10, flexGrow: 1 }}
          onContentSizeChange={() => list.current?.scrollToEnd({ animated: true })}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            loaded ? (
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 28, gap: 14 }}>
                <ErhaAvatar size={72} />
                <Text style={{ color: C.fg, fontSize: 21, fontWeight: '800' }}>Hi, I'm Erha</Text>
                <Text style={{ color: C.fg2, textAlign: 'center', lineHeight: 21 }}>I help with church life: the Bible, Sabbath School, hymns, prayer and planning activities. Ask me anything about it.</Text>
                <View style={{ gap: 8, alignSelf: 'stretch', marginTop: 6 }}>
                  {OPENERS.map((o) => (
                    <Pressable key={o} onPress={() => send(o)} accessibilityRole="button" style={({ pressed }) => ({ paddingHorizontal: 14, paddingVertical: 12, borderRadius: 14, backgroundColor: pressed ? C.surface2 : C.surface })}>
                      <Text style={{ color: C.fg }}>{o}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null
          }
        />
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingTop: 8, paddingBottom: insets.bottom + 8, backgroundColor: C.bg }}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Ask Erha…"
            placeholderTextColor={C.fg3}
            multiline
            maxLength={4000}
            keyboardAppearance="dark"
            accessibilityLabel="Message to Erha"
            style={{ flex: 1, color: C.fg, fontSize: 16, minHeight: 44, maxHeight: 120, paddingHorizontal: 16, paddingTop: 11, paddingBottom: 11, borderRadius: 22, backgroundColor: C.inputBar, borderWidth: 1, borderColor: C.surface2 }}
          />
          <Pressable onPress={() => send()} disabled={busy || !text.trim()} accessibilityRole="button" accessibilityLabel="Send" style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', opacity: busy || !text.trim() ? 0.4 : pressed ? 0.7 : 1 })}>
            <Icon name="arrow" size={22} color="#fff" weight={2.4} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
