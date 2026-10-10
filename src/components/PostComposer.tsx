import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import * as Location from 'expo-location';
import { fetchPod, fetchPopularPod, searchProfiles } from '../lib/api';
import { useT } from '../lib/i18n';
import { C, clock, errText } from '../lib/theme';
import type { PodItem, PostPoll, Profile } from '../lib/types';
import { Icon, IconName } from './Icon';
import { Avatar, Button, Empty, IconButton, Loading, SearchField, Sheet, Toggle, useToast } from './ui';

/*
 * The pieces of the new post screen (app/(app)/create.tsx): the Poll and Prompt chips and their
 * cards, the rows of the list, and the sheets behind them (songs, people, places).
 */

/** Most people a post can tag (the database keeps to the same). */
export const MAX_TAGS = 20;

/** A rounded chip under the caption, such as Poll or Prompt. `on` while its card is showing. */
export function Chip({ icon, label, on, onPress }: { icon: IconName; label: string; on?: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!on }}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 13, borderRadius: 17, backgroundColor: on ? C.accentSoft : C.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: on ? C.accent2 : C.hairline, opacity: pressed ? 0.7 : 1 })}>
      <Icon name={icon} size={16} color={on ? C.accent2 : C.fg} weight={2.1} />
      <Text style={{ color: on ? C.accent2 : C.fg, fontWeight: '600', fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

/** One row of the list: an icon, a title, what is chosen, and a chevron when it opens something. */
export function DetailRow({ icon, title, value, valueColor, onPress, right, chevron = true, disabled }: { icon: IconName; title: string; value?: string; valueColor?: string; onPress?: () => void; right?: React.ReactNode; chevron?: boolean; disabled?: boolean }) {
  const body = (
    <>
      <Icon name={icon} size={23} color={C.fg} />
      <Text numberOfLines={1} style={{ flex: 1, color: C.fg, fontSize: 16.5 }}>{title}</Text>
      {value ? <Text numberOfLines={1} style={{ maxWidth: '52%', color: valueColor ?? C.fg2, fontSize: 15, fontWeight: valueColor ? '700' : '400' }}>{value}</Text> : null}
      {right}
      {onPress && chevron ? <Icon name="right" size={17} color={C.fg2} weight={2.2} /> : null}
    </>
  );
  const style = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 14, paddingHorizontal: 16, minHeight: 54, opacity: disabled ? 0.5 : 1 };
  if (!onPress) return <View style={style}>{body}</View>;
  return (
    <Pressable onPress={disabled ? undefined : onPress} accessibilityRole="button" accessibilityLabel={value ? `${title}, ${value}` : title} style={({ pressed }) => [style, { backgroundColor: pressed ? C.press : 'transparent' }]}>
      {body}
    </Pressable>
  );
}

/** A row with a switch; the whole row flips it. */
export function SwitchRow({ icon, title, value, onChange, disabled }: { icon: IconName; title: string; value: boolean; onChange: (next: boolean) => void; disabled?: boolean }) {
  return <DetailRow icon={icon} title={title} chevron={false} disabled={disabled} onPress={() => onChange(!value)} right={<Toggle value={value} onChange={onChange} label={title} disabled={disabled} />} />;
}

/** A card above the list, with a title and a way to take it off again. */
function Card({ icon, title, onRemove, children }: { icon: IconName; title: string; onRemove: () => void; children: React.ReactNode }) {
  const t = useT();
  return (
    <View style={{ marginHorizontal: 16, marginTop: 12, paddingHorizontal: 14, paddingTop: 6, paddingBottom: 14, borderRadius: 18, backgroundColor: C.surface, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name={icon} size={18} color={C.accent2} weight={2.1} />
        <Text style={{ flex: 1, color: C.fg, fontWeight: '700', fontSize: 15 }}>{title}</Text>
        <IconButton name="close" size={18} color={C.fg2} label={t('createFlow.remove', { what: title })} onPress={onRemove} />
      </View>
      {children}
    </View>
  );
}

const field = () => ({ color: C.fg, fontSize: 15.5, paddingHorizontal: 12, paddingVertical: 11, borderRadius: 12, backgroundColor: C.bg2 });

/** The poll being written: an optional question and two to four options. */
export function PollEditor({ poll, onChange, onRemove, editable = true }: { poll: PostPoll; onChange: (p: PostPoll) => void; onRemove: () => void; editable?: boolean }) {
  const t = useT();
  const setOption = (i: number, text: string) => onChange({ ...poll, options: poll.options.map((o, j) => (j === i ? text : o)) });
  return (
    <Card icon="poll" title={t('createFlow.poll')} onRemove={onRemove}>
      <TextInput value={poll.question ?? ''} onChangeText={(q) => onChange({ ...poll, question: q })} placeholder={t('createFlow.pollQuestion')} placeholderTextColor={C.fg3} maxLength={140} editable={editable} keyboardAppearance={C.blurTint} style={[field(), { fontWeight: '600' }]} accessibilityLabel={t('createFlow.pollQuestion')} />
      {poll.options.map((o, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <TextInput value={o} onChangeText={(text) => setOption(i, text)} placeholder={t('createFlow.pollOption', { n: i + 1 })} placeholderTextColor={C.fg3} maxLength={80} editable={editable} keyboardAppearance={C.blurTint} style={[field(), { flex: 1 }]} accessibilityLabel={t('createFlow.pollOption', { n: i + 1 })} />
          {poll.options.length > 2 ? <IconButton name="close" size={16} color={C.fg2} label={t('createFlow.removeOption', { n: i + 1 })} onPress={() => onChange({ ...poll, options: poll.options.filter((_, j) => j !== i) })} /> : null}
        </View>
      ))}
      {poll.options.length < 4 ? (
        <Pressable onPress={() => onChange({ ...poll, options: [...poll.options, ''] })} disabled={!editable} accessibilityRole="button" accessibilityLabel={t('createFlow.addOption')} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', height: 34, paddingHorizontal: 4, opacity: pressed ? 0.6 : 1 })}>
          <Icon name="plus" size={16} color={C.accent2} weight={2.4} />
          <Text style={{ color: C.accent2, fontWeight: '700', fontSize: 14.5 }}>{t('createFlow.addOption')}</Text>
        </Pressable>
      ) : null}
    </Card>
  );
}

/** The prompt being written: a question others answer in the comments. */
export function PromptEditor({ value, onChange, onRemove, editable = true }: { value: string; onChange: (v: string) => void; onRemove: () => void; editable?: boolean }) {
  const t = useT();
  return (
    <Card icon="chatdots" title={t('createFlow.prompt')} onRemove={onRemove}>
      <TextInput value={value} onChangeText={onChange} placeholder={t('createFlow.promptPlaceholder')} placeholderTextColor={C.fg3} maxLength={200} multiline autoFocus editable={editable} keyboardAppearance={C.blurTint} style={[field(), { minHeight: 46, textAlignVertical: 'top' }]} accessibilityLabel={t('createFlow.prompt')} />
    </Card>
  );
}

/* ---------- songs ---------- */

function Cover({ uri, size }: { uri?: string; size: number }) {
  return uri ? (
    <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 5, backgroundColor: C.surface2 }} contentFit="cover" transition={100} />
  ) : (
    <View style={{ width: size, height: size, borderRadius: size / 5, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name="music" size={size * 0.5} color={C.fg2} />
    </View>
  );
}

/** Songs to offer under Add audio: the most played on Pod, then the newest. Loaded once. */
export function useSongSuggestions(): PodItem[] {
  const [songs, setSongs] = useState<PodItem[]>([]);
  useEffect(() => {
    let live = true;
    Promise.all([fetchPopularPod(16).catch(() => [] as PodItem[]), fetchPod('song').catch(() => [] as PodItem[])]).then(([popular, recent]) => {
      if (!live) return;
      const seen = new Set<string>();
      const out: PodItem[] = [];
      for (const s of [...popular.filter((p) => p.kind === 'song'), ...recent]) {
        if (seen.has(s.id) || !s.audio_url) continue;
        seen.add(s.id);
        out.push(s);
        if (out.length >= 10) break;
      }
      setSongs(out);
    });
    return () => {
      live = false;
    };
  }, []);
  return songs;
}

/** A sideways row of songs; tapping one picks it, tapping it again takes it off. */
export function SongStrip({ songs, selected, onPick, disabled }: { songs: PodItem[]; selected: PodItem | null; onPick: (s: PodItem | null) => void; disabled?: boolean }) {
  if (!songs.length) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingBottom: 8 }} keyboardShouldPersistTaps="handled">
      {songs.map((s) => {
        const on = selected?.id === s.id;
        return (
          <Pressable key={s.id} onPress={() => onPick(on ? null : s)} disabled={disabled} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={`${s.title}, ${s.artist}`} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, height: 46, paddingLeft: 6, paddingRight: 12, borderRadius: 14, backgroundColor: on ? C.accentSoft : C.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: on ? C.accent2 : 'transparent', opacity: pressed ? 0.7 : 1 })}>
            <Cover uri={s.cover_url} size={34} />
            <View style={{ maxWidth: 140 }}>
              <Text numberOfLines={1} style={{ color: on ? C.accent2 : C.fg, fontWeight: '700', fontSize: 13.5 }}>{s.title}</Text>
              <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 12 }}>{s.artist}</Text>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** Every song on Pod, searchable. */
export function SongSheet({ visible, onClose, selected, onPick }: { visible: boolean; onClose: () => void; selected: PodItem | null; onPick: (s: PodItem | null) => void }) {
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
  const pick = (s: PodItem | null) => {
    onPick(s);
    onClose();
  };
  return (
    <Sheet visible={visible} onClose={onClose} title={t('createFlow.addAudio')} tall>
      <SearchField value={q} onChangeText={setQ} placeholder={t('createFlow.searchSongs')} />
      {songs === null ? (
        <Loading />
      ) : songs.length === 0 ? (
        <Empty icon="music" title={t('createFlow.noSongs')} />
      ) : (
        <ScrollView style={{ flex: 1, marginTop: 8 }} keyboardShouldPersistTaps="handled">
          {selected ? (
            <Pressable onPress={() => pick(null)} accessibilityRole="button" accessibilityLabel={t('create.removeAudio')} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8, opacity: pressed ? 0.7 : 1 })}>
              <View style={{ width: 44, height: 44, borderRadius: 9, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="mute" size={22} color={C.fg2} />
              </View>
              <Text style={{ flex: 1, color: C.like, fontWeight: '600' }}>{t('create.removeAudio')}</Text>
            </Pressable>
          ) : null}
          {songs.map((s) => {
            const on = selected?.id === s.id;
            return (
              <Pressable key={s.id} onPress={() => pick(s)} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={`${s.title}, ${s.artist}`} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8, opacity: pressed ? 0.7 : 1 })}>
                <Cover uri={s.cover_url} size={44} />
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

/* ---------- people ---------- */

/** The people tagged so far, as chips; tapping one takes them off. */
export function PeopleChips({ people, onRemove, disabled }: { people: Profile[]; onRemove: (p: Profile) => void; disabled?: boolean }) {
  const t = useT();
  if (!people.length) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingBottom: 8 }} keyboardShouldPersistTaps="handled">
      {people.map((p) => (
        <Pressable key={p.id} onPress={() => onRemove(p)} disabled={disabled} accessibilityRole="button" accessibilityLabel={t('createFlow.untag', { username: p.username })} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 7, height: 36, paddingLeft: 4, paddingRight: 10, borderRadius: 18, backgroundColor: C.surface, opacity: pressed ? 0.7 : 1 })}>
          <Avatar uri={p.avatar_url} name={p.full_name} size={28} />
          <Text numberOfLines={1} style={{ color: C.fg, fontWeight: '600', fontSize: 13.5, maxWidth: 130 }}>{p.username}</Text>
          <Icon name="close" size={13} color={C.fg2} weight={2.4} />
        </Pressable>
      ))}
    </ScrollView>
  );
}

/** Find members and tag them. */
export function TagSheet({ visible, onClose, me, tagged, onChange }: { visible: boolean; onClose: () => void; me: string; tagged: Profile[]; onChange: (list: Profile[]) => void }) {
  const t = useT();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [people, setPeople] = useState<Profile[] | null>(null);
  useEffect(() => {
    if (!visible) return;
    let live = true;
    const timer = setTimeout(() => {
      searchProfiles(q)
        .then((r) => { if (live) setPeople(r.filter((p) => p.id !== me)); })
        .catch((e) => { if (live) { setPeople([]); toast(errText(e)); } });
    }, q ? 220 : 0);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [visible, q, me, toast]);
  function toggle(p: Profile) {
    if (tagged.some((x) => x.id === p.id)) onChange(tagged.filter((x) => x.id !== p.id));
    else if (tagged.length >= MAX_TAGS) toast(t('createFlow.tooManyTags', { count: MAX_TAGS }));
    else onChange([...tagged, p]);
  }
  return (
    <Sheet visible={visible} onClose={onClose} title={t('createFlow.tagPeople')} tall footer={<Button label={t('createFlow.done')} onPress={onClose} style={{ marginHorizontal: 16, marginTop: 8 }} />}>
      <SearchField value={q} onChangeText={setQ} placeholder={t('createFlow.searchPeople')} />
      {people === null ? (
        <Loading />
      ) : people.length === 0 ? (
        <Empty icon="user" title={t('createFlow.noPeople')} />
      ) : (
        <ScrollView style={{ flex: 1, marginTop: 8 }} keyboardShouldPersistTaps="handled">
          {people.map((p) => {
            const on = tagged.some((x) => x.id === p.id);
            return (
              <Pressable key={p.id} onPress={() => toggle(p)} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={p.username} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: pressed ? C.press : 'transparent' })}>
                <Avatar uri={p.avatar_url} name={p.full_name} size={44} />
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ color: C.fg, fontWeight: '600' }}>{p.username}</Text>
                  {p.full_name ? <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 13.5 }}>{p.full_name}</Text> : null}
                </View>
                <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: on ? 0 : 1.5, borderColor: C.fg3, backgroundColor: on ? C.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                  {on ? <Icon name="check" size={15} color={C.onAccent} weight={2.8} /> : null}
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </Sheet>
  );
}

/* ---------- places ---------- */

/**
 * Places near the phone, as names to pick from. Read on open only when location access was already
 * given; `load(true)` (from tapping Add location) is the only thing that asks for it.
 */
export function usePlaces() {
  const [places, setPlaces] = useState<string[]>([]);
  const [locating, setLocating] = useState(false);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  const load = useCallback(async (ask: boolean): Promise<boolean> => {
    try {
      let p = await Location.getForegroundPermissionsAsync();
      if (!p.granted && ask && p.canAskAgain) p = await Location.requestForegroundPermissionsAsync();
      if (!p.granted) return false;
      if (alive.current) setLocating(true);
      const pos = (await Location.getLastKnownPositionAsync({ maxAge: 10 * 60e3 })) ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
      const found = await Location.reverseGeocodeAsync({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      const out: string[] = [];
      const add = (s: string | null | undefined) => {
        const v = (s ?? '').trim();
        if (v && v.length <= 120 && !out.some((o) => o.toLowerCase() === v.toLowerCase())) out.push(v);
      };
      for (const g of found.slice(0, 3)) {
        // A building or place name, not a house number.
        if (g.name && !/^\d+$/.test(g.name.trim()) && g.name !== g.street) add(g.name);
        add(g.city);
        if (g.city && g.country) add(`${g.city}, ${g.country}`);
        add(g.region);
        add(g.country);
      }
      if (alive.current) setPlaces(out.slice(0, 6));
      return true;
    } catch {
      return false;
    } finally {
      if (alive.current) setLocating(false);
    }
  }, []);
  useEffect(() => {
    load(false);
  }, [load]);
  return { places, locating, load };
}

/** Places as chips; the chosen one is marked, tapping it again clears it. */
export function PlaceChips({ places, value, onPick, disabled }: { places: string[]; value: string; onPick: (p: string) => void; disabled?: boolean }) {
  if (!places.length) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingBottom: 8 }} keyboardShouldPersistTaps="handled">
      {places.map((p) => {
        const on = value.trim().toLowerCase() === p.toLowerCase();
        return (
          <Pressable key={p} onPress={() => onPick(on ? '' : p)} disabled={disabled} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={p} style={({ pressed }) => ({ height: 34, paddingHorizontal: 13, borderRadius: 17, justifyContent: 'center', backgroundColor: on ? C.accentSoft : C.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: on ? C.accent2 : 'transparent', opacity: pressed ? 0.7 : 1 })}>
            <Text numberOfLines={1} style={{ color: on ? C.accent2 : C.fg, fontWeight: '600', fontSize: 13.5, maxWidth: 200 }}>{p}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** Type a place, or pick one from near the phone. */
export function LocationSheet({ visible, onClose, value, onChange, places, locating }: { visible: boolean; onClose: () => void; value: string; onChange: (v: string) => void; places: string[]; locating: boolean }) {
  const t = useT();
  const [text, setText] = useState(value);
  useEffect(() => {
    if (visible) setText(value);
  }, [visible, value]);
  const save = (v: string) => {
    onChange(v.trim().slice(0, 120));
    onClose();
  };
  return (
    <Sheet visible={visible} onClose={onClose} title={t('create.addLocation')} footer={<Button label={t('createFlow.done')} onPress={() => save(text)} style={{ marginHorizontal: 16, marginTop: 10 }} />}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, paddingHorizontal: 12, borderRadius: 12, backgroundColor: C.field }}>
        <Icon name="location" size={18} color={C.fg2} weight={2.1} />
        <TextInput value={text} onChangeText={setText} placeholder={t('createFlow.placePlaceholder')} placeholderTextColor={C.fg3} maxLength={120} autoFocus returnKeyType="done" onSubmitEditing={() => save(text)} keyboardAppearance={C.blurTint} style={{ flex: 1, color: C.fg, fontSize: 16, paddingVertical: 12 }} accessibilityLabel={t('create.location')} />
        {text ? <IconButton name="close" size={16} color={C.fg2} label={t('createFlow.clear')} onPress={() => setText('')} /> : null}
      </View>
      <View style={{ paddingTop: 8, paddingBottom: 4 }}>
        {locating && !places.length ? <Loading /> : null}
        {places.map((p) => (
          <Pressable key={p} onPress={() => save(p)} accessibilityRole="button" accessibilityLabel={p} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, minHeight: 48, backgroundColor: pressed ? C.press : 'transparent' })}>
            <Icon name="location" size={20} color={C.fg2} />
            <Text numberOfLines={1} style={{ flex: 1, color: C.fg, fontSize: 16 }}>{p}</Text>
          </Pressable>
        ))}
        {value ? (
          <Pressable onPress={() => save('')} accessibilityRole="button" accessibilityLabel={t('createFlow.removeLocation')} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, minHeight: 48, backgroundColor: pressed ? C.press : 'transparent' })}>
            <Icon name="trash" size={20} color={C.like} />
            <Text style={{ flex: 1, color: C.like, fontSize: 16 }}>{t('createFlow.removeLocation')}</Text>
          </Pressable>
        ) : null}
      </View>
    </Sheet>
  );
}
