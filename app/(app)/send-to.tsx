import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../../src/components/Icon';
import { Avatar, Button, Empty, Loading, SearchField, useToast } from '../../src/components/ui';
import { peopleToMessage, searchProfiles, sendToPeople } from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import { C, errText } from '../../src/lib/theme';
import type { Profile } from '../../src/lib/types';

/** Forward photos from a chat to other people. */
export default function SendTo() {
  const params = useLocalSearchParams<{ media?: string }>();
  const media = useMemo<string[]>(() => {
    try {
      const list = JSON.parse(String(params.media ?? '[]'));
      return Array.isArray(list) ? list.filter((u) => typeof u === 'string' && /^(https?:\/\/|data:image\/|blob:)/.test(u)).slice(0, 10) : [];
    } catch {
      return [];
    }
  }, [params.media]);
  const { me } = useSession();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [base, setBase] = useState<Profile[] | null>(null);
  const [found, setFound] = useState<Profile[] | null>(null);
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    peopleToMessage(me).then(setBase).catch(() => setBase([]));
  }, [me]);

  useEffect(() => {
    if (!q.trim()) {
      setFound(null);
      return;
    }
    let live = true;
    const t = setTimeout(() => {
      searchProfiles(q)
        .then((r) => { if (live) setFound(r.filter((p) => p.id !== me && !p.is_blocked)); })
        .catch(() => { if (live) setFound([]); });
    }, 220);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q, me]);

  const people = found ?? base;
  const cell = Math.floor((width - 20) / 3);
  const toggle = (uid: string) => setPicked((cur) => (cur.includes(uid) ? cur.filter((x) => x !== uid) : cur.length >= 10 ? cur : [...cur, uid]));
  const close = () => (router.canGoBack() ? router.back() : router.replace('/inbox'));

  async function send() {
    if (!picked.length || busy) return;
    setBusy(true);
    try {
      await sendToPeople(me, picked, { media, text: note });
      toast(picked.length > 1 ? `Sent to ${picked.length} people` : 'Sent');
      close();
    } catch (e) {
      toast(errText(e));
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ height: insets.top }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 12 }}>
        <View style={{ width: 72 }} />
        <Text accessibilityRole="header" style={{ flex: 1, color: C.fg, fontSize: 18, fontWeight: '700', textAlign: 'center' }}>Forward</Text>
        <Pressable onPress={close} hitSlop={8} style={{ width: 72, alignItems: 'flex-end' }} accessibilityRole="button">
          <Text style={{ color: C.accent2, fontWeight: '600', fontSize: 16 }}>Cancel</Text>
        </Pressable>
      </View>

      {media.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 14, paddingBottom: 12 }}>
          {media.map((u, i) => (
            <Image key={`${i}-${u}`} source={{ uri: u }} style={{ width: 62, height: 82, borderRadius: 10, backgroundColor: C.surface }} contentFit="cover" accessibilityLabel="Photo to forward" />
          ))}
        </ScrollView>
      ) : null}
      <SearchField value={q} onChangeText={setQ} label="Search people" />

      {!media.length ? (
        <Empty title="Nothing to forward" body="Go back and choose a photo." />
      ) : (
        <FlatList
          data={people ?? []}
          keyExtractor={(p) => p.id}
          numColumns={3}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 10, paddingTop: 8, paddingBottom: 12 }}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item: p }) => {
            const on = picked.includes(p.id);
            return (
              <Pressable onPress={() => toggle(p.id)} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={p.full_name} style={{ width: cell, alignItems: 'center', gap: 6, paddingVertical: 8 }}>
                <View>
                  <Avatar uri={p.avatar_url} name={p.full_name} size={62} />
                  {on ? (
                    <View style={{ position: 'absolute', right: -4, bottom: -4, width: 26, height: 26, borderRadius: 13, backgroundColor: C.accent, borderWidth: 3, borderColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="check" size={13} weight={3} color={C.onAccent} />
                    </View>
                  ) : null}
                </View>
                <Text numberOfLines={1} style={{ color: C.fg, fontSize: 12.5, maxWidth: cell - 8 }}>{p.full_name}</Text>
              </Pressable>
            );
          }}
          ListEmptyComponent={people === null ? <Loading /> : <Empty title={q.trim() ? 'No one found' : 'No one to send to yet'} body={q.trim() ? 'Try another name.' : 'Follow people or search for someone by name.'} />}
        />
      )}

      {picked.length ? (
        <View style={{ borderTopWidth: 1, borderTopColor: C.line, paddingHorizontal: 14, paddingTop: 12, paddingBottom: insets.bottom + 10, gap: 10 }}>
          <TextInput value={note} onChangeText={setNote} placeholder="Write a message…" placeholderTextColor={C.fg3} maxLength={300} keyboardAppearance={C.blurTint} style={{ color: C.fg, fontSize: 16, height: 40 }} accessibilityLabel="Message" />
          <Button label={picked.length > 1 ? 'Send separately' : 'Send'} onPress={send} busy={busy} />
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}
