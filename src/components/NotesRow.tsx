import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { deleteNote, fetchNotes, openThread, saveNote } from '../lib/api';
import { useAppFont } from '../lib/fonts';
import { tap } from '../lib/haptics';
import { useSession } from '../lib/session';
import { agoLong, C, errText } from '../lib/theme';
import type { Note } from '../lib/types';
import { Icon, VerifiedTick } from './Icon';
import { Avatar, Button, Radio, Sheet, useToast } from './ui';

/*
 * Notes: a short line (up to 60 characters) that sits above a member's face at the top of Messages
 * for 24 hours. Mutual followers or close friends see it, and can reply to it in a chat.
 * The server keeps the 24-hour limit and the audience; this file only shows and writes them.
 */

const NOTE_MAX = 60;

const AUDIENCES: { value: Note['audience']; label: string; sub: string }[] = [
  { value: 'mutuals', label: 'Mutual followers', sub: 'People you follow who follow you back' },
  { value: 'close_friends', label: 'Close friends', sub: 'Only the people on your close friends list' },
];

/** "Grace" from "Grace Mensah"; the username when there is no name. */
function firstName(n: { full_name: string; username: string }): string {
  return (n.full_name || '').trim().split(/\s+/)[0] || n.username;
}

/** A note that is still within its 24 hours. The server filters too, but a list kept on screen can outlive a note. */
function live(n: Note, now = Date.now()): boolean {
  return !n.expires_at || new Date(n.expires_at).getTime() > now;
}

/**
 * The soft bubble a note sits in, with a short tail pointing down at the face. The tail is set a
 * little to the left of centre, so it reads as someone speaking rather than a name tag.
 */
function NoteBubble({ text, placeholder, big }: { text: string; placeholder?: boolean; big?: boolean }) {
  const font = useAppFont();
  const tail = big ? 14 : 10;
  return (
    <View style={{ alignItems: 'center' }}>
      <View style={{ maxWidth: big ? 260 : 86, paddingHorizontal: big ? 16 : 9, paddingVertical: big ? 10 : 6, borderRadius: big ? 20 : 15, backgroundColor: C.surface2 }}>
        <Text numberOfLines={big ? 3 : 2} style={{ color: placeholder ? C.fg3 : C.fg, fontSize: big ? 16 : 12, lineHeight: big ? 21 : 15, textAlign: 'center', fontFamily: font }}>
          {text}
        </Text>
      </View>
      <View style={{ width: tail, height: tail, borderBottomRightRadius: 3, backgroundColor: C.surface2, transform: [{ rotate: '45deg' }], marginTop: -tail / 2 - 1, marginLeft: big ? -26 : -18 }} />
    </View>
  );
}

/** One face in the row: the bubble above, the name below. */
function NoteFace({ uri, name, label, text, placeholder, adding, onPress, a11y }: { uri?: string | null; name: string; label: string; text: string; placeholder?: boolean; adding?: boolean; onPress: () => void; a11y: string }) {
  const font = useAppFont();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={a11y} style={({ pressed }) => ({ width: 88, alignItems: 'center', opacity: pressed ? 0.7 : 1 })}>
      {/* A fixed height above every face, so one-line and two-line notes keep the faces level. */}
      <View style={{ height: 50, justifyContent: 'flex-end', zIndex: 2, marginBottom: -7 }}>
        <NoteBubble text={text} placeholder={placeholder} />
      </View>
      <View>
        <Avatar uri={uri} name={name} size={64} />
        {adding ? (
          <View style={{ position: 'absolute', right: -1, bottom: -1, width: 22, height: 22, borderRadius: 11, backgroundColor: C.accent, borderWidth: 2.5, borderColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="plus" size={12} color={C.onAccent} weight={3} />
          </View>
        ) : null}
      </View>
      <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 12.5, marginTop: 5, maxWidth: 82, fontFamily: font }}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * The row of notes at the top of Messages: yours first, then your friends'. It loads itself and
 * refreshes whenever Messages comes back to the front; `refreshKey` changing (pull to refresh) loads it again.
 */
export function NotesRow({ refreshKey = 0 }: { refreshKey?: number }) {
  const { me, profile } = useSession();
  const router = useRouter();
  const toast = useToast();
  const font = useAppFont();
  const fontBold = useAppFont('bold');
  const [notes, setNotes] = useState<Note[]>([]);
  const [writing, setWriting] = useState(false);
  const [draft, setDraft] = useState('');
  const [audience, setAudience] = useState<Note['audience']>('mutuals');
  // The friend's note in the sheet. Kept after the sheet closes so it doesn't empty while sliding away.
  const [viewing, setViewing] = useState<Note | null>(null);
  const [viewOpen, setViewOpen] = useState(false);
  const [busy, setBusy] = useState<'save' | 'delete' | 'reply' | null>(null);
  const alive = useRef(true);
  const later = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (later.current) clearTimeout(later.current);
    };
  }, []);

  const load = useCallback(async () => {
    try {
      const list = await fetchNotes();
      if (alive.current) setNotes(list);
    } catch {
      // Notes are a nicety: if they don't load, the row keeps what it had and the chats still work.
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  useEffect(() => {
    if (refreshKey) load();
  }, [refreshKey, load]);

  const now = Date.now();
  const mine = notes.find((n) => n.mine && live(n, now)) ?? null;
  const others = notes.filter((n) => !n.mine && live(n, now));

  function openWriter() {
    tap();
    setDraft(mine?.text ?? '');
    setAudience(mine?.audience ?? 'mutuals');
    setWriting(true);
  }

  function openNote(n: Note) {
    tap();
    setViewing(n);
    setViewOpen(true);
  }

  async function share() {
    const text = draft.trim();
    if (!text || busy) return;
    setBusy('save');
    try {
      await saveNote(me, text, audience);
      tap('success');
      setWriting(false);
      toast('Note shared for 24 hours');
      load();
    } catch (e) {
      toast(errText(e));
    } finally {
      if (alive.current) setBusy(null);
    }
  }

  function remove() {
    if (busy) return;
    Alert.alert('Delete your note?', 'It disappears for everyone straight away.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setBusy('delete');
          try {
            await deleteNote(me);
            // Gone at once on this screen; the next load confirms it.
            setNotes((cur) => cur.filter((n) => !n.mine));
            setWriting(false);
            toast('Note deleted');
            load();
          } catch (e) {
            toast(errText(e));
          } finally {
            if (alive.current) setBusy(null);
          }
        },
      },
    ]);
  }

  /** Opens the chat with them, the note already quoted at the start of the message box. */
  async function reply() {
    if (!viewing || busy) return;
    const n = viewing;
    setBusy('reply');
    try {
      const tid = await openThread(n.user_id);
      tap();
      setViewOpen(false);
      // Let the sheet slide away before the chat opens over it.
      if (later.current) clearTimeout(later.current);
      later.current = setTimeout(() => {
        later.current = null;
        router.push({ pathname: '/chat/[id]', params: { id: tid, draft: `Replying to your note: ‘${n.text}’\n` } });
      }, 320);
    } catch (e) {
      toast(errText(e));
    } finally {
      if (alive.current) setBusy(null);
    }
  }

  const left = NOTE_MAX - draft.length;

  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 8, paddingTop: 2, paddingBottom: 10, gap: 2 }} accessibilityLabel="Notes">
        <NoteFace
          uri={profile?.avatar_url}
          name={profile?.full_name ?? ''}
          label="Your note"
          text={mine ? mine.text : 'Leave a note…'}
          placeholder={!mine}
          adding={!mine}
          onPress={openWriter}
          a11y={mine ? `Your note: ${mine.text}. Change or delete it` : 'Leave a note'}
        />
        {others.map((n) => (
          <NoteFace key={n.user_id} uri={n.avatar_url} name={n.full_name || n.username} label={firstName(n)} text={n.text} onPress={() => openNote(n)} a11y={`Note from ${n.full_name || n.username}: ${n.text}`} />
        ))}
      </ScrollView>

      {/* Write (or change) your note. */}
      <Sheet visible={writing} onClose={() => setWriting(false)} title={mine ? 'Your note' : 'New note'}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 6, gap: 14 }}>
          <View style={{ alignItems: 'center' }}>
            <View style={{ zIndex: 2, marginBottom: -8 }}>
              <NoteBubble big text={draft.trim() || 'Leave a note…'} placeholder={!draft.trim()} />
            </View>
            <Avatar uri={profile?.avatar_url} name={profile?.full_name} size={76} />
          </View>
          <View>
            <TextInput
              value={draft}
              onChangeText={(t) => setDraft(t.replace(/\n/g, ' ').slice(0, NOTE_MAX))}
              maxLength={NOTE_MAX}
              placeholder="A thought, a verse, what you're up to…"
              placeholderTextColor={C.fg3}
              selectionColor={C.accent2}
              keyboardAppearance={C.blurTint}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={share}
              accessibilityLabel="Your note"
              style={{ color: C.fg, fontSize: 16, paddingHorizontal: 14, paddingVertical: 13, borderRadius: 14, backgroundColor: C.surface, fontFamily: font }}
            />
            <Text style={{ alignSelf: 'flex-end', color: left <= 5 ? C.warn : C.fg3, fontSize: 12.5, marginTop: 6, fontVariant: ['tabular-nums'] }} accessibilityLabel={`${left} characters left`}>
              {draft.length}/{NOTE_MAX}
            </Text>
          </View>
          <View accessibilityRole="radiogroup">
            <Text style={{ color: C.fg2, fontSize: 14, fontWeight: '700', marginBottom: 4, fontFamily: fontBold }}>Who can see it</Text>
            {AUDIENCES.map((a) => (
              <Pressable key={a.value} onPress={() => { tap('select'); setAudience(a.value); }} accessibilityRole="radio" accessibilityState={{ checked: audience === a.value }} accessibilityLabel={`${a.label}. ${a.sub}`} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9, opacity: pressed ? 0.7 : 1 })}>
                {a.value === 'close_friends' ? (
                  <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: C.close, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="star" size={18} color="#fff" fill />
                  </View>
                ) : (
                  <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="people" size={19} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.fg, fontSize: 16.5, fontFamily: font }}>{a.label}</Text>
                  <Text style={{ color: C.fg2, fontSize: 13.5, marginTop: 1, fontFamily: font }}>{a.sub}</Text>
                </View>
                <Radio on={audience === a.value} />
              </Pressable>
            ))}
          </View>
          <Text style={{ color: C.fg3, fontSize: 13, textAlign: 'center', fontFamily: font }}>Notes disappear after 24 hours. Friends can reply in a chat.</Text>
          <Button label="Share" onPress={share} busy={busy === 'save'} disabled={!draft.trim() || (busy !== null && busy !== 'save')} />
          {mine ? <Button label="Delete note" kind="ghost" textColor={C.like} onPress={remove} busy={busy === 'delete'} disabled={busy !== null && busy !== 'delete'} /> : null}
        </ScrollView>
      </Sheet>

      {/* A friend's note. */}
      <Sheet visible={viewOpen} onClose={() => setViewOpen(false)}>
        {viewing ? (
          <View style={{ alignItems: 'center', paddingHorizontal: 24, paddingTop: 10, paddingBottom: 4 }}>
            <View style={{ zIndex: 2, marginBottom: -8 }}>
              <NoteBubble big text={viewing.text} />
            </View>
            <Avatar uri={viewing.avatar_url} name={viewing.full_name || viewing.username} size={84} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 12 }}>
              <Text numberOfLines={1} style={{ color: C.fg, fontSize: 18, fontWeight: '700', flexShrink: 1, fontFamily: fontBold }}>{viewing.full_name || viewing.username}</Text>
              {viewing.verified ? <VerifiedTick size={15} /> : null}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <Text style={{ color: C.fg2, fontSize: 14, fontFamily: font }}>{agoLong(viewing.created_at)}</Text>
              {viewing.audience === 'close_friends' ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, backgroundColor: C.close }}>
                  <Icon name="star" size={11} color="#fff" fill />
                  <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>Close friends</Text>
                </View>
              ) : null}
            </View>
            <Button label={`Reply to ${firstName(viewing)}`} onPress={reply} busy={busy === 'reply'} style={{ alignSelf: 'stretch', marginTop: 20 }} />
          </View>
        ) : null}
      </Sheet>
    </>
  );
}
