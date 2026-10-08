import React, { useEffect, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, useWindowDimensions, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, IconName } from '../../../src/components/Icon';
import { Avatar, Button, Empty, Loading, useToast } from '../../../src/components/ui';
import { addStory, peopleToMessage, searchProfiles, setFlag, sharePost } from '../../../src/lib/api';
import { useSession } from '../../../src/lib/session';
import { usePost } from '../../../src/lib/store';
import { C, errText } from '../../../src/lib/theme';
import type { Profile } from '../../../src/lib/types';

function Action({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={{ width: 76, alignItems: 'center', gap: 6 }}>
      <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} />
      </View>
      <Text style={{ color: C.fg, fontSize: 12, textAlign: 'center' }}>{label}</Text>
    </Pressable>
  );
}

export default function Share() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const postId = String(id);
  const post = usePost(postId);
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
      searchProfiles(q).then((r) => { if (live) setFound(r.filter((p) => p.id !== me && !p.is_blocked)); }).catch(() => { if (live) setFound([]); });
    }, 220);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q, me]);

  const people = found ?? base;
  const cell = Math.floor((width - 20) / 3);
  const toggle = (uid: string) => setPicked((cur) => (cur.includes(uid) ? cur.filter((x) => x !== uid) : [...cur, uid]));

  async function send() {
    if (!picked.length || busy) return;
    setBusy(true);
    try {
      await sharePost(me, postId, picked, note);
      toast(picked.length > 1 ? `Sent to ${picked.length} people` : 'Sent');
      router.back();
    } catch (e) {
      toast(errText(e));
      setBusy(false);
    }
  }

  const first = post?.media[0];

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ height: insets.top }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10 }}>
        <View style={{ width: 60 }} />
        <Text style={{ flex: 1, color: C.fg, fontWeight: '700', textAlign: 'center' }}>Share</Text>
        <Pressable onPress={() => router.back()} hitSlop={8} style={{ width: 60, alignItems: 'flex-end' }} accessibilityRole="button">
          <Text style={{ color: C.accent2, fontWeight: '600' }}>Cancel</Text>
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 14, marginBottom: 8, paddingHorizontal: 12, height: 40, borderRadius: 12, backgroundColor: C.surface2 }}>
        <Icon name="search" size={18} color={C.fg2} />
        <TextInput value={q} onChangeText={setQ} placeholder="Search" placeholderTextColor={C.fg3} style={{ flex: 1, color: C.fg, fontSize: 16 }} autoCapitalize="none" autoCorrect={false} keyboardAppearance="dark" accessibilityLabel="Search people" />
      </View>

      <FlatList
        data={people ?? []}
        keyExtractor={(p) => p.id}
        numColumns={3}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 10, paddingBottom: 12 }}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item: p }) => {
          const on = picked.includes(p.id);
          return (
            <Pressable onPress={() => toggle(p.id)} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={p.full_name} style={{ width: cell, alignItems: 'center', gap: 6, paddingVertical: 8 }}>
              <View>
                <Avatar uri={p.avatar_url} name={p.full_name} size={62} />
                {on ? (
                  <View style={{ position: 'absolute', right: -4, bottom: -4, width: 26, height: 26, borderRadius: 13, backgroundColor: C.accent, borderWidth: 3, borderColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="check" size={13} weight={3} color="#fff" />
                  </View>
                ) : null}
              </View>
              <Text numberOfLines={1} style={{ color: C.fg, fontSize: 12.5, maxWidth: cell - 8 }}>{p.full_name}</Text>
            </Pressable>
          );
        }}
        ListEmptyComponent={people === null ? <Loading /> : <Empty title={q.trim() ? 'No one found' : 'No one to send to yet'} body={q.trim() ? 'Try another name.' : 'Follow people or search for someone by name.'} />}
      />

      <View style={{ borderTopWidth: 1, borderTopColor: C.line, paddingHorizontal: 14, paddingTop: 12, paddingBottom: insets.bottom + 10, gap: 10 }}>
        {picked.length ? (
          <>
            <TextInput value={note} onChangeText={setNote} placeholder="Write a message…" placeholderTextColor={C.fg3} maxLength={300} keyboardAppearance="dark" style={{ color: C.fg, fontSize: 16, height: 40 }} accessibilityLabel="Message" />
            <Button label={picked.length > 1 ? 'Send separately' : 'Send'} onPress={send} busy={busy} />
          </>
        ) : (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Action icon="link" label="Copy link" onPress={() => Clipboard.setStringAsync(`community://post/${postId}`).then(() => { toast('Link copied'); router.back(); })} />
            {first?.type === 'image' ? <Action icon="story" label="Add to story" onPress={() => addStory(me, { url: first.url, type: 'image', w: first.w, h: first.h }).then(() => { toast('Added to your story'); router.back(); }).catch((e) => toast(errText(e)))} /> : null}
            {post ? <Action icon="repost" label={post.reposted ? 'Remove repost' : 'Repost'} onPress={() => setFlag(me, post, 'reposted', !post.reposted).then(() => { toast(post.reposted ? 'Repost removed' : 'Reposted to your profile'); router.back(); }).catch((e) => toast(errText(e)))} /> : null}
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}
