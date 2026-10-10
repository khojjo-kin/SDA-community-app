import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, Share, Text, TextInput, View } from 'react-native';
import { File, Paths } from 'expo-file-system';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import { fetchHighlights, listPeople, peopleToMessage } from '../lib/api';
import { useSession } from '../lib/session';
import { C, errText, fmt } from '../lib/theme';
import type { Highlight, Profile, StoryItem } from '../lib/types';
import { Icon, IconName, VerifiedTick } from './Icon';
import { Avatar, Button, Empty, Loading, SearchField, Sheet, useToast } from './ui';

/*
 * Pieces shared by the story viewer and the highlight viewer: the row of buttons under your own
 * story, the people picker for Mention and Send, the highlight browser, and a few helpers.
 * The viewers themselves are black in every theme; the sheets follow the app's theme (C).
 */

/* ---------- the bar under your own story or highlight ---------- */

/** One button in the bar: a white icon over a small grey label, with an optional count. */
export function BarButton({ icon, label, onPress, count, a11y }: { icon: IconName; label: string; onPress: () => void; count?: number; a11y?: string }) {
  return (
    <Pressable onPress={onPress} hitSlop={4} accessibilityRole="button" accessibilityLabel={a11y ?? (count ? `${label}, ${count}` : label)} style={({ pressed }) => ({ flex: 1, alignItems: 'center', gap: 4, paddingVertical: 4, opacity: pressed ? 0.55 : 1 })}>
      <View>
        <Icon name={icon} size={24} color="#fff" />
        {count ? (
          <View style={{ position: 'absolute', top: -6, left: 15, minWidth: 18, height: 16, paddingHorizontal: 4, borderRadius: 8, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#000', fontSize: 10.5, fontWeight: '800' }}>{fmt(count)}</Text>
          </View>
        ) : null}
      </View>
      <Text numberOfLines={1} style={{ color: 'rgba(255,255,255,0.68)', fontSize: 11.5 }}>{label}</Text>
    </Pressable>
  );
}

export function ActionBar({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6 }}>{children}</View>;
}

/* ---------- pausing ---------- */

/**
 * Everything besides an open sheet that should keep a story paused: the reply keyboard, an alert or
 * share sheet waiting for an answer, and another screen pushed on top (Edit highlight, Story settings).
 */
export function useStoryHold() {
  const [typing, setTyping] = useState(false);
  const [waiting, setWaiting] = useState(0);
  const [away, setAway] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setAway(false);
      return () => setAway(true);
    }, []),
  );

  /** Keeps the story paused until `work` has finished, however it ends. */
  const busy = useCallback(async (work: () => unknown) => {
    setWaiting((n) => n + 1);
    try {
      await work();
    } finally {
      setWaiting((n) => Math.max(0, n - 1));
    }
  }, []);

  /** Call just before pushing another screen, so the story does not tick on during the slide. */
  const leave = useCallback(() => setAway(true), []);

  return { held: typing || waiting > 0 || away, setTyping, busy, leave };
}

/** iOS drops an alert, picker or new sheet shown while a sheet is still sliding away, so wait for it. */
export const afterSheet = () => new Promise<void>((resolve) => setTimeout(resolve, 380));

/** An alert with Cancel and one other button. Resolves true when the other button is chosen. */
export function confirmAlert(title: string, message: string | undefined, ok: string, destructive = true): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: ok, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

export const REPORT_REASONS = ['Spam', 'Harassment or hate', 'Nudity or something unsuitable', 'Pretending to be someone else', 'Something else'];

/* ---------- sharing outside the app ---------- */

/** The words written on a story, for text stories that have no picture. */
export function storyWords(item: StoryItem): string {
  const words = (item.overlays ?? []).filter((o) => o.kind === 'text').map((o) => o.text.trim()).filter(Boolean);
  return words.join('\n') || item.caption?.trim() || '';
}

/** The photo or video a story shows. Empty for text stories. */
export function mediaOf(item: StoryItem): string {
  if (item.type === 'collage') return item.urls?.[0] ?? '';
  return item.url || item.poster || '';
}

/** Opens the phone's share sheet with the story's photo or video (or its words, for a text story). */
export async function shareStoryItem(item: StoryItem): Promise<void> {
  const url = mediaOf(item);
  if (!url) {
    const words = storyWords(item);
    if (!words) throw new Error('There is nothing in this story to share outside Community.');
    await Share.share({ message: words });
    return;
  }
  // On iPhone a downloaded photo shares as a picture (to Photos, WhatsApp and the like), where a link
  // would only share text. Videos can be large, so they go as a link rather than keep people waiting.
  if (Platform.OS === 'ios' && item.type !== 'video') {
    try {
      const file = await File.downloadFileAsync(url, new File(Paths.cache, `community-story-${Date.now()}.jpg`));
      await Share.share({ url: file.uri });
      return;
    } catch {
      // the download failed: share the link instead
    }
  }
  await Share.share(Platform.OS === 'ios' ? { url } : { message: url });
}

/* ---------- people picker for Mention and Send ---------- */

/**
 * Choose people to send something to. `which` picks the list: the people you follow, or the people
 * you message most (recent chats first, then people you follow).
 */
export function PeopleSheet({
  visible,
  title,
  verb,
  which,
  note,
  onClose,
  onSend,
}: {
  visible: boolean;
  title: string;
  /** The word on the button, such as "Mention" or "Send". */
  verb: string;
  which: 'following' | 'recent';
  /** Shows a box for a short message to go with it. */
  note?: boolean;
  onClose: () => void;
  /** Should throw on failure; the sheet shows the error and lets them try again. */
  onSend: (ids: string[], note: string) => Promise<void>;
}) {
  const { me } = useSession();
  const toast = useToast();
  const [people, setPeople] = useState<Profile[] | null>(null);
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setPicked([]);
    setQ('');
    setText('');
    setBusy(false);
    setPeople(null);
    let live = true;
    (which === 'following' ? listPeople(me, 'following') : peopleToMessage(me))
      .then((list) => {
        if (live) setPeople(list.filter((p) => p.id !== me && !p.is_blocked));
      })
      .catch(() => {
        if (live) setPeople([]);
      });
    return () => {
      live = false;
    };
  }, [visible, which, me]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!people || !s) return people;
    return people.filter((p) => p.username.toLowerCase().includes(s) || p.full_name.toLowerCase().includes(s));
  }, [people, q]);

  const toggle = (uid: string) => setPicked((cur) => (cur.includes(uid) ? cur.filter((x) => x !== uid) : cur.length >= 20 ? cur : [...cur, uid]));

  async function go() {
    if (!picked.length || busy) return;
    setBusy(true);
    try {
      await onSend(picked, text.trim());
    } catch (e) {
      toast(errText(e));
      setBusy(false);
    }
  }

  return (
    <Sheet
      visible={visible}
      onClose={busy ? () => {} : onClose}
      title={title}
      tall
      footer={
        <View style={{ paddingHorizontal: 16, paddingTop: 10, gap: 10 }}>
          {note ? (
            <TextInput value={text} onChangeText={setText} placeholder="Add a message…" placeholderTextColor={C.fg3} maxLength={300} keyboardAppearance={C.blurTint} style={{ height: 44, paddingHorizontal: 14, borderRadius: 12, backgroundColor: C.field, color: C.fg, fontSize: 16 }} accessibilityLabel="Add a message" />
          ) : null}
          <Button label={picked.length ? `${verb} (${picked.length})` : verb} busy={busy} disabled={!picked.length} onPress={go} />
        </View>
      }>
      {people === null ? (
        <Loading />
      ) : people.length === 0 ? (
        <Empty icon="people" title={which === 'following' ? 'You are not following anyone yet' : 'No one to send to yet'} body="Follow people or start a chat, and they will appear here." />
      ) : (
        <>
          <SearchField value={q} onChangeText={setQ} label="Search people" />
          <ScrollView style={{ flex: 1, marginTop: 8 }} keyboardShouldPersistTaps="handled">
            {(shown ?? []).map((p) => {
              const on = picked.includes(p.id);
              return (
                <Pressable key={p.id} onPress={() => toggle(p.id)} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={`${p.full_name}, ${p.username}`} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8, opacity: pressed ? 0.7 : 1 })}>
                  <Avatar uri={p.avatar_url} name={p.full_name} size={46} />
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Text numberOfLines={1} style={{ color: C.fg, fontWeight: '600', flexShrink: 1 }}>{p.username}</Text>
                      {p.verified ? <VerifiedTick size={14} /> : null}
                    </View>
                    <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 13.5 }}>{p.full_name}</Text>
                  </View>
                  <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: on ? C.accent : C.fg3, backgroundColor: on ? C.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                    {on ? <Icon name="check" size={14} color={C.onAccent} weight={3} /> : null}
                  </View>
                </Pressable>
              );
            })}
            {shown && !shown.length ? <Text style={{ color: C.fg2, textAlign: 'center', padding: 24 }}>No one by that name.</Text> : null}
          </ScrollView>
        </>
      )}
    </Sheet>
  );
}

/* ---------- highlight covers and the browser ---------- */

/**
 * A round highlight cover. With `ring` it gets the member's coloured ring (src/lib/styling.ts);
 * otherwise a thin plain one, as on a profile. `gap` is the colour showing between ring and picture.
 */
export function HighlightCover({ uri, size, ring, gap }: { uri?: string | null; size: number; ring?: readonly string[] | null; gap?: string }) {
  const coloured = !!ring && ring.length >= 2;
  const inner = coloured ? size - 10 : size - 8;
  const pic = uri ? (
    <Image source={{ uri }} style={{ width: inner, height: inner, borderRadius: inner / 2, backgroundColor: C.surface2 }} contentFit="cover" transition={120} />
  ) : (
    <View style={{ width: inner, height: inner, borderRadius: inner / 2, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name="highlight" size={Math.round(inner * 0.4)} color={C.fg2} />
    </View>
  );
  if (!coloured) {
    return <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 1, borderColor: C.surface2, alignItems: 'center', justifyContent: 'center' }}>{pic}</View>;
  }
  const colors = ring as unknown as readonly [string, string, ...string[]];
  return (
    <LinearGradient colors={colors} start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }} style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: size - 5, height: size - 5, borderRadius: (size - 5) / 2, backgroundColor: gap ?? C.bg, alignItems: 'center', justifyContent: 'center' }}>{pic}</View>
    </LinearGradient>
  );
}

/** All of a member's highlights as round covers; the one playing now wears their ring. */
export function HighlightBrowser({ visible, userId, currentId, ring, onClose, onPick }: { visible: boolean; userId: string; currentId: string; ring: readonly string[]; onClose: () => void; onPick: (id: string) => void }) {
  const [list, setList] = useState<Highlight[] | null>(null);

  useEffect(() => {
    if (!visible) return;
    let live = true;
    setList(null);
    fetchHighlights(userId)
      .then((h) => {
        if (live) setList(h);
      })
      .catch(() => {
        if (live) setList([]);
      });
    return () => {
      live = false;
    };
  }, [visible, userId]);

  return (
    <Sheet visible={visible} onClose={onClose} title="Highlights">
      {list === null ? (
        <Loading />
      ) : !list.length ? (
        <Empty icon="highlight" title="No highlights" />
      ) : (
        <ScrollView style={{ maxHeight: 380 }} contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 8, paddingBottom: 8, rowGap: 16 }}>
          {list.map((h) => {
            const on = h.id === currentId;
            return (
              <Pressable key={h.id} onPress={() => onPick(h.id)} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={on ? `${h.title}, playing now` : `Open ${h.title}`} style={({ pressed }) => ({ width: '25%', alignItems: 'center', gap: 6, opacity: pressed ? 0.7 : 1 })}>
                <HighlightCover uri={h.cover_url} size={68} ring={on ? ring : null} gap={C.sheet} />
                <Text numberOfLines={1} style={{ color: on ? C.fg : C.fg2, fontSize: 12.5, fontWeight: on ? '700' : '400', maxWidth: 80 }}>{h.title}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </Sheet>
  );
}
