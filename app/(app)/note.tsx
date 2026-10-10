import React, { useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../../src/components/Icon';
import { NOTE_COLORS, NOTE_MAX, noteInk, takeNoteSeed } from '../../src/components/NotesRow';
import { Avatar, Empty, IconButton, Loading, Radio, SearchField, Sheet, useToast } from '../../src/components/ui';
import { deleteNote, fetchNotes, fetchPod, saveNote } from '../../src/lib/api';
import { useAppFont } from '../../src/lib/fonts';
import { tap } from '../../src/lib/haptics';
import { useT } from '../../src/lib/i18n';
import { useSession } from '../../src/lib/session';
import { C, clock, errText } from '../../src/lib/theme';
import type { Note, PodItem } from '../../src/lib/types';

const PLACE_MAX = 80;

type Song = { id: string; title: string; artist: string };

/**
 * Your note, full screen: the words in a bubble above your face, a song from Pod, a place, the
 * bubble's colour, and who sees it. Opened from your face at the top of Messages.
 */
export default function NoteComposer() {
  const t = useT();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const font = useAppFont();
  const fontBold = useAppFont('bold');
  const { me, profile } = useSession();

  // What the row handed over (your current note, or null for none); undefined if opened some other way.
  const [seed] = useState(() => takeNoteSeed());
  const [existing, setExisting] = useState<Note | null>(seed ?? null);
  const [text, setText] = useState(seed?.text ?? '');
  const [song, setSong] = useState<Song | null>(seed?.song_id ? { id: seed.song_id, title: seed.song_title ?? '', artist: seed.song_artist ?? '' } : null);
  const [place, setPlace] = useState(seed?.place ?? '');
  const [color, setColor] = useState(seed?.color ?? '');
  const [audience, setAudience] = useState<Note['audience']>(seed?.audience ?? 'mutuals');
  const [sheet, setSheet] = useState<'audience' | 'music' | 'place' | null>(null);
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null);
  const touched = useRef(false);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  // Opened without the row (a link, say): find your note, unless you've already started.
  useEffect(() => {
    if (seed !== undefined) return;
    fetchNotes()
      .then((list) => {
        const mine = list.find((n) => n.mine) ?? null;
        if (!alive.current || !mine) return;
        setExisting(mine);
        if (touched.current) return;
        setText(mine.text);
        setSong(mine.song_id ? { id: mine.song_id, title: mine.song_title ?? '', artist: mine.song_artist ?? '' } : null);
        setPlace(mine.place);
        setColor(mine.color);
        setAudience(mine.audience);
      })
      .catch(() => {});
  }, [seed]);

  const touch = () => {
    touched.current = true;
  };

  const canShare = (text.trim().length > 0 || !!song) && busy === null;
  const ink = noteInk(color);
  const bubble = color || C.surface2;

  function cycleColor() {
    tap('select');
    touch();
    const at = NOTE_COLORS.indexOf(color);
    setColor(NOTE_COLORS[(at + 1) % NOTE_COLORS.length]);
  }

  async function share() {
    if (!canShare) return;
    setBusy('save');
    try {
      await saveNote(me, text, audience, { song_id: song?.id ?? null, place, color });
      tap('success');
      toast(t('noteNew.shared'));
      router.back();
    } catch (e) {
      toast(errText(e));
      if (alive.current) setBusy(null);
    }
  }

  function remove() {
    if (busy) return;
    Alert.alert(t('noteNew.deleteQuestion'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          setBusy('delete');
          try {
            await deleteNote(me);
            toast(t('noteNew.deleted'));
            router.back();
          } catch (e) {
            toast(errText(e));
            if (alive.current) setBusy(null);
          }
        },
      },
    ]);
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: insets.top + 4, paddingHorizontal: 8 }}>
        <IconButton name="close" size={28} label={t('common.close')} onPress={() => router.back()} />
        {existing ? <IconButton name="trash" size={24} label={t('noteNew.delete')} onPress={remove} /> : null}
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 16 }}>
        {/* The bubble, its tail pointing down at the face. */}
        <View style={{ alignItems: 'center', zIndex: 2, marginBottom: -10 }}>
          <View style={{ minWidth: 170, maxWidth: 290, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 24, backgroundColor: bubble, alignItems: 'center', gap: 6 }}>
            {song ? (
              <Pressable onPress={() => setSheet('music')} accessibilityRole="button" accessibilityLabel={t('noteNew.songBy', { title: song.title, artist: song.artist })} hitSlop={4}>
                <Text numberOfLines={1} style={{ color: ink, opacity: 0.85, fontSize: 13.5, fontWeight: '600', fontFamily: fontBold }}>
                  ♪ {song.title}{song.artist ? ` · ${song.artist}` : ''}
                </Text>
              </Pressable>
            ) : null}
            <TextInput
              value={text}
              onChangeText={(v) => {
                touch();
                setText(v.replace(/\n/g, ' ').slice(0, NOTE_MAX));
              }}
              maxLength={NOTE_MAX}
              multiline
              autoFocus
              submitBehavior="blurAndSubmit"
              returnKeyType="done"
              placeholder={t('noteNew.placeholder')}
              placeholderTextColor={color ? (ink === '#ffffff' ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.5)') : C.fg3}
              selectionColor={color ? ink : C.accent2}
              keyboardAppearance={C.blurTint}
              accessibilityLabel={t('noteNew.label')}
              style={{ color: ink, fontSize: 18, lineHeight: 23, textAlign: 'center', minWidth: 140, maxWidth: 254, padding: 0, fontFamily: font }}
            />
            {place ? (
              <Pressable onPress={() => setSheet('place')} accessibilityRole="button" accessibilityLabel={place} hitSlop={4} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: 254 }}>
                <Icon name="location" size={13} color={ink} />
                <Text numberOfLines={1} style={{ color: ink, opacity: 0.85, fontSize: 13, flexShrink: 1, fontFamily: font }}>{place}</Text>
              </Pressable>
            ) : null}
          </View>
          <View style={{ width: 16, height: 16, borderBottomRightRadius: 3, backgroundColor: bubble, transform: [{ rotate: '45deg' }], marginTop: -9, marginLeft: -30 }} />
        </View>

        {/* Your face, with the colour badge. */}
        <View>
          <Avatar uri={profile?.avatar_url} name={profile?.full_name} size={104} />
          <Pressable
            onPress={cycleColor}
            accessibilityRole="button"
            accessibilityLabel={t('noteNew.colour')}
            hitSlop={8}
            style={({ pressed }) => ({ position: 'absolute', right: -2, bottom: -2, width: 34, height: 34, borderRadius: 17, backgroundColor: color || C.surface2, borderWidth: 3, borderColor: C.bg, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.75 : 1 })}>
            <Icon name="palette" size={17} color={color ? ink : C.fg} />
          </Pressable>
        </View>

        {/* Music and place. */}
        <View style={{ flexDirection: 'row', gap: 18, marginTop: 22 }}>
          <OutlinedButton icon="music" label={t('noteNew.music')} on={!!song} onPress={() => setSheet('music')} />
          <OutlinedButton icon="location" label={t('noteNew.location')} on={!!place} onPress={() => setSheet('place')} />
        </View>
      </ScrollView>

      {/* Who sees it, and Share. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 16, paddingTop: 8, paddingBottom: Math.max(insets.bottom, 10) }}>
        <Pressable onPress={() => setSheet('audience')} accessibilityRole="button" hitSlop={6} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1, opacity: pressed ? 0.6 : 1 })}>
          {audience === 'close_friends' ? (
            <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: C.close, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="star" size={11} color="#fff" fill />
            </View>
          ) : null}
          <Text numberOfLines={1} style={{ color: C.fg, fontSize: 15.5, fontWeight: '600', flexShrink: 1, fontFamily: fontBold }}>
            {audience === 'close_friends' ? t('noteNew.shareWithClose') : t('noteNew.shareWithFriends')}
          </Text>
          <Icon name="right" size={16} color={C.fg2} />
        </Pressable>
        <Pressable
          onPress={share}
          disabled={!canShare}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canShare, busy: busy === 'save' }}
          style={({ pressed }) => ({ height: 40, paddingHorizontal: 22, borderRadius: 20, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', opacity: !canShare ? 0.4 : pressed ? 0.75 : 1 })}>
          <Text style={{ color: C.onAccent, fontSize: 15.5, fontWeight: '700', fontFamily: fontBold }}>{t('common.share')}</Text>
        </Pressable>
      </View>

      <AudienceSheet visible={sheet === 'audience'} value={audience} onPick={(a) => { touch(); setAudience(a); setSheet(null); }} onClose={() => setSheet(null)} />
      <SongSheet visible={sheet === 'music'} chosen={song?.id ?? null} onPick={(s) => { touch(); setSong(s); setSheet(null); }} onClose={() => setSheet(null)} />
      <PlaceSheet visible={sheet === 'place'} value={place} onDone={(p) => { touch(); setPlace(p); setSheet(null); }} onClose={() => setSheet(null)} />
    </KeyboardAvoidingView>
  );
}

/** A round outlined button under the face: filled with the accent's wash once it has something. */
function OutlinedButton({ icon, label, on, onPress }: { icon: 'music' | 'location'; label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={() => { tap('light'); onPress(); }}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: on }}
      hitSlop={6}
      style={({ pressed }) => ({ width: 48, height: 48, borderRadius: 24, borderWidth: 1.5, borderColor: on ? C.accent2 : C.fg3, backgroundColor: on ? C.accentSoft : 'transparent', alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
      <Icon name={icon} size={22} color={on ? C.accent2 : C.fg} />
    </Pressable>
  );
}

/** Friends (mutual followers) or close friends. */
function AudienceSheet({ visible, value, onPick, onClose }: { visible: boolean; value: Note['audience']; onPick: (a: Note['audience']) => void; onClose: () => void }) {
  const t = useT();
  const font = useAppFont();
  const options: { value: Note['audience']; label: string; sub?: string }[] = [
    { value: 'mutuals', label: t('noteNew.friends'), sub: t('noteNew.friendsSub') },
    { value: 'close_friends', label: t('noteNew.closeFriends') },
  ];
  return (
    <Sheet visible={visible} onClose={onClose} title={t('noteNew.audienceTitle')}>
      <View accessibilityRole="radiogroup" style={{ paddingHorizontal: 20, paddingBottom: 8 }}>
        {options.map((o) => (
          <Pressable key={o.value} onPress={() => { tap('select'); onPick(o.value); }} accessibilityRole="radio" accessibilityState={{ checked: value === o.value }} accessibilityLabel={o.label} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, opacity: pressed ? 0.7 : 1 })}>
            {o.value === 'close_friends' ? (
              <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: C.close, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="star" size={19} color="#fff" fill />
              </View>
            ) : (
              <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="people" size={20} />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.fg, fontSize: 16.5, fontFamily: font }}>{o.label}</Text>
              {o.sub ? <Text style={{ color: C.fg2, fontSize: 13.5, marginTop: 1, fontFamily: font }}>{o.sub}</Text> : null}
            </View>
            <Radio on={value === o.value} />
          </Pressable>
        ))}
      </View>
    </Sheet>
  );
}

/** A song from Pod: the same search and list as the post editor's. */
function SongSheet({ visible, chosen, onPick, onClose }: { visible: boolean; chosen: string | null; onPick: (s: Song | null) => void; onClose: () => void }) {
  const t = useT();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [songs, setSongs] = useState<PodItem[] | null>(null);

  useEffect(() => {
    if (!visible) return;
    let live = true;
    const timer = setTimeout(() => {
      fetchPod('song', q)
        .then((r) => { if (live) setSongs(r); })
        .catch((e) => { if (live) { setSongs([]); toast(errText(e)); } });
    }, q ? 220 : 0);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [visible, q, toast]);

  return (
    <Sheet visible={visible} onClose={onClose} title={t('noteNew.music')} tall>
      <SearchField value={q} onChangeText={setQ} placeholder={t('noteNew.searchSongs')} />
      {songs === null ? (
        <Loading />
      ) : songs.length === 0 ? (
        <Empty icon="music" title={t('noteNew.noSongs')} />
      ) : (
        <ScrollView style={{ flex: 1, marginTop: 8 }} keyboardShouldPersistTaps="handled">
          {chosen ? (
            <Pressable onPress={() => onPick(null)} accessibilityRole="button" accessibilityLabel={t('noteNew.noMusic')} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8, opacity: pressed ? 0.7 : 1 })}>
              <View style={{ width: 44, height: 44, borderRadius: 8, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="mute" size={22} color={C.fg2} />
              </View>
              <Text style={{ flex: 1, color: C.like, fontWeight: '600' }}>{t('noteNew.noMusic')}</Text>
            </Pressable>
          ) : null}
          {songs.map((s) => {
            const on = chosen === s.id;
            return (
              <Pressable key={s.id} onPress={() => { tap('select'); onPick({ id: s.id, title: s.title, artist: s.artist }); }} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={t('noteNew.songBy', { title: s.title, artist: s.artist })} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8, opacity: pressed ? 0.7 : 1 })}>
                {s.cover_url ? (
                  <Image source={{ uri: s.cover_url }} style={{ width: 44, height: 44, borderRadius: 8, backgroundColor: C.surface2 }} contentFit="cover" transition={100} />
                ) : (
                  <View style={{ width: 44, height: 44, borderRadius: 8, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="music" size={22} color={C.fg2} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ color: C.fg, fontWeight: '600' }}>{s.title}</Text>
                  <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 13.5 }}>{s.artist}{s.duration_seconds ? ` · ${clock(s.duration_seconds)}` : ''}</Text>
                </View>
                {on ? <Icon name="check" size={20} color={C.accent2} weight={2.4} /> : null}
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </Sheet>
  );
}

/** A place: typed, or found from where the phone is (permission is asked only when that is tapped). */
function PlaceSheet({ visible, value, onDone, onClose }: { visible: boolean; value: string; onDone: (p: string) => void; onClose: () => void }) {
  const t = useT();
  const toast = useToast();
  const font = useAppFont();
  const [draft, setDraft] = useState(value);
  const [finding, setFinding] = useState(false);
  useEffect(() => {
    if (visible) setDraft(value);
  }, [visible, value]);

  async function useHere() {
    if (finding) return;
    setFinding(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        toast(t('noteNew.locationOff'));
        return;
      }
      const spot = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const [r] = await Location.reverseGeocodeAsync({ latitude: spot.coords.latitude, longitude: spot.coords.longitude });
      const name = (r?.city || r?.region || r?.name || '').trim();
      if (!name) {
        toast(t('noteNew.locationFailed'));
        return;
      }
      onDone(name.slice(0, PLACE_MAX));
    } catch {
      toast(t('noteNew.locationFailed'));
    } finally {
      setFinding(false);
    }
  }

  return (
    <Sheet visible={visible} onClose={onClose} title={t('noteNew.location')}>
      <View style={{ paddingHorizontal: 16, gap: 10, paddingBottom: 6 }}>
        <TextInput
          value={draft}
          onChangeText={(v) => setDraft(v.replace(/\n/g, ' ').slice(0, PLACE_MAX))}
          maxLength={PLACE_MAX}
          placeholder={t('noteNew.placePlaceholder')}
          placeholderTextColor={C.fg3}
          selectionColor={C.accent2}
          keyboardAppearance={C.blurTint}
          returnKeyType="done"
          onSubmitEditing={() => onDone(draft.trim())}
          accessibilityLabel={t('noteNew.location')}
          style={{ color: C.fg, fontSize: 16, paddingHorizontal: 14, paddingVertical: 13, borderRadius: 14, backgroundColor: C.surface, fontFamily: font }}
        />
        <Pressable onPress={useHere} disabled={finding} accessibilityRole="button" style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, opacity: pressed || finding ? 0.6 : 1 })}>
          <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="location" size={20} />
          </View>
          <Text style={{ flex: 1, color: C.fg, fontSize: 16.5, fontFamily: font }}>{t('noteNew.useLocation')}</Text>
        </Pressable>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {value ? (
            <Pressable onPress={() => onDone('')} accessibilityRole="button" style={({ pressed }) => ({ flex: 1, height: 46, borderRadius: 12, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.75 : 1 })}>
              <Text style={{ color: C.like, fontWeight: '600', fontSize: 15.5 }}>{t('noteNew.removePlace')}</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={() => onDone(draft.trim())} accessibilityRole="button" style={({ pressed }) => ({ flex: 1, height: 46, borderRadius: 12, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.75 : 1 })}>
            <Text style={{ color: C.onAccent, fontWeight: '600', fontSize: 15.5 }}>{t('noteNew.done')}</Text>
          </Pressable>
        </View>
      </View>
    </Sheet>
  );
}

