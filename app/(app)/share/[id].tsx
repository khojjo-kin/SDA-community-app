import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeyboardOpen } from '../../../src/components/AssistiveButton';
import { Icon, IconName } from '../../../src/components/Icon';
import { Avatar, Button, Empty, ErrorNote, Loading, useToast } from '../../../src/components/ui';
import { addStory, peopleToMessage, searchProfiles, setFlag, sharePost } from '../../../src/lib/api';
import { tap } from '../../../src/lib/haptics';
import { t } from '../../../src/lib/i18n';
import { useSession } from '../../../src/lib/session';
import { usePost } from '../../../src/lib/store';
import { C, errText } from '../../../src/lib/theme';
import type { Profile } from '../../../src/lib/types';

function Action({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => ({ width: 76, alignItems: 'center', gap: 6, opacity: pressed ? 0.6 : 1 })}>
      <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} />
      </View>
      <Text numberOfLines={2} style={{ color: C.fg, fontSize: 12, textAlign: 'center' }}>{label}</Text>
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
  // With the keyboard up the bar sits on it, so the home indicator's gap below it goes.
  const keyboard = useKeyboardOpen();
  const { width } = useWindowDimensions();
  const [base, setBase] = useState<Profile[] | null>(null);
  const [baseError, setBaseError] = useState('');
  const [found, setFound] = useState<Profile[] | null>(null);
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  // One action at a time: a quick second tap must not add a second story or undo a repost.
  const acting = useRef(false);

  const loadBase = useCallback(() => {
    setBaseError('');
    peopleToMessage(me)
      .then(setBase)
      .catch((e) => {
        setBaseError(errText(e));
        setBase([]);
      });
  }, [me]);
  useEffect(() => {
    loadBase();
  }, [loadBase]);

  // A search that didn't go through says so (with Try again), rather than "No one found".
  const [searchError, setSearchError] = useState('');
  const [searchTry, setSearchTry] = useState(0);
  useEffect(() => {
    if (!q.trim()) {
      setFound(null);
      setSearchError('');
      return;
    }
    let live = true;
    const timer = setTimeout(() => {
      searchProfiles(q)
        .then((r) => {
          if (!live) return;
          setFound(r.filter((p) => p.id !== me && !p.is_blocked));
          setSearchError('');
        })
        .catch((e) => {
          if (!live) return;
          setSearchError(errText(e));
          setFound([]);
        });
    }, 220);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [q, me, searchTry]);

  const people = found ?? base;
  const cell = Math.floor((width - 20) / 3);
  const toggle = (uid: string) => {
    tap('select');
    setPicked((cur) => (cur.includes(uid) ? cur.filter((x) => x !== uid) : [...cur, uid]));
  };
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  async function send() {
    if (!picked.length || busy) return;
    setBusy(true);
    try {
      await sharePost(me, postId, picked, note);
      tap('success');
      toast(picked.length > 1 ? `Sent to ${picked.length} people` : 'Sent');
      close();
    } catch (e) {
      toast(errText(e));
      setBusy(false);
    }
  }

  /** Runs one of the buttons along the bottom, then closes; a failure says why and leaves the sheet open. */
  const once = (fn: () => Promise<void>) => async () => {
    if (acting.current) return;
    acting.current = true;
    try {
      await fn();
      close();
    } catch (e) {
      toast(errText(e));
      acting.current = false;
    }
  };

  const first = post?.media?.[0];

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ height: insets.top }} />
      <View style={{ height: 50, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 }}>
        <View style={{ width: 64 }} />
        <Text numberOfLines={1} accessibilityRole="header" style={{ flex: 1, color: C.fg, fontSize: 16.5, fontWeight: '700', textAlign: 'center' }}>{t('common.share')}</Text>
        <Pressable onPress={close} hitSlop={8} style={({ pressed }) => ({ width: 64, alignItems: 'flex-end', opacity: pressed ? 0.6 : 1 })} accessibilityRole="button">
          <Text numberOfLines={1} style={{ color: C.accent2, fontSize: 16, fontWeight: '600' }}>{t('common.cancel')}</Text>
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 14, marginBottom: 8, paddingHorizontal: 12, height: 38, borderRadius: 12, backgroundColor: C.field }}>
        <Icon name="search" size={17} color={C.fg2} weight={2.2} />
        <TextInput value={q} onChangeText={setQ} placeholder={t('common.search')} placeholderTextColor={C.fg2} selectionColor={C.accent2} style={{ flex: 1, color: C.fg, fontSize: 17, paddingVertical: 0 }} autoCapitalize="none" autoCorrect={false} clearButtonMode="while-editing" keyboardAppearance={C.blurTint} accessibilityLabel="Search people" />
      </View>

      <FlatList
        data={people ?? []}
        keyExtractor={(p) => p.id}
        numColumns={3}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 10, paddingBottom: 12 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        renderItem={({ item: p }) => {
          const on = picked.includes(p.id);
          return (
            <Pressable onPress={() => toggle(p.id)} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={p.full_name || p.username} style={({ pressed }) => ({ width: cell, alignItems: 'center', gap: 6, paddingVertical: 8, opacity: pressed ? 0.7 : 1 })}>
              <View>
                <Avatar uri={p.avatar_url} name={p.full_name || p.username} size={62} />
                {on ? (
                  <View style={{ position: 'absolute', right: -4, bottom: -4, width: 26, height: 26, borderRadius: 13, backgroundColor: C.accent, borderWidth: 3, borderColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="check" size={13} weight={3} color={C.onAccent} />
                  </View>
                ) : null}
              </View>
              <Text numberOfLines={1} style={{ color: C.fg, fontSize: 12.5, maxWidth: cell - 8, fontWeight: on ? '600' : '400' }}>{p.full_name || p.username}</Text>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          people === null ? (
            <Loading />
          ) : found && searchError ? (
            <ErrorNote message={searchError} onRetry={() => { setSearchError(''); setFound(null); setSearchTry((n) => n + 1); }} />
          ) : baseError && !found ? (
            <ErrorNote message={baseError} onRetry={() => { setBase(null); loadBase(); }} />
          ) : (
            <Empty icon="people" title={q.trim() ? 'No one found' : 'No one to send to yet'} />
          )
        }
      />

      <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line, paddingHorizontal: 14, paddingTop: 12, paddingBottom: (keyboard ? 0 : insets.bottom) + 10, gap: 10 }}>
        {picked.length ? (
          <>
            <TextInput value={note} onChangeText={setNote} placeholder="Write a message…" placeholderTextColor={C.fg3} selectionColor={C.accent2} maxLength={300} keyboardAppearance={C.blurTint} style={{ color: C.fg, fontSize: 16, height: 40 }} accessibilityLabel="Message" />
            <Button label={picked.length > 1 ? 'Send separately' : t('common.send')} onPress={send} busy={busy} />
          </>
        ) : (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Action icon="link" label="Copy link" onPress={once(async () => { await Clipboard.setStringAsync(`community://post/${postId}`); toast('Link copied'); })} />
            {first?.type === 'image' ? <Action icon="story" label="Add to story" onPress={once(async () => { await addStory(me, { url: first.url, type: 'image', w: first.w, h: first.h }); tap('success'); toast('Added to your story'); })} /> : null}
            {post ? <Action icon="repost" label={post.reposted ? 'Remove repost' : 'Repost'} onPress={once(async () => { await setFlag(me, post, 'reposted', !post.reposted); toast(post.reposted ? 'Repost removed' : 'Reposted to your profile'); })} /> : null}
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}
