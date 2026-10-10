import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../../../src/components/Icon';
import { afterSheet, confirmAlert, HighlightCover } from '../../../src/components/StoryChrome';
import { StoryCanvas } from '../../../src/components/StoryCanvas';
import { Button, Empty, ErrorNote, Field, Loading, RoundButton, Screen, ScreenHeader, Sheet, SheetRow, useToast } from '../../../src/components/ui';
import { coverOf, deleteHighlight, fetchHighlight, removeHighlightItem, renameHighlight, setHighlightCover, uploadImage } from '../../../src/lib/api';
import { pickFromLibrary } from '../../../src/lib/pick';
import { useSession } from '../../../src/lib/session';
import { RING_STYLES, ringColors } from '../../../src/lib/styling';
import { C, dayLabel, errText } from '../../../src/lib/theme';
import type { Highlight, HighlightItem } from '../../../src/lib/types';

const TITLE_MAX = 30;
const GAP = 6;

/** The small label on something that is a Community Plus perk. */
function PlusTag() {
  return (
    <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: C.accent }}>
      <Text style={{ color: C.onAccent, fontSize: 11.5, fontWeight: '700' }}>Plus</Text>
    </View>
  );
}

/**
 * Edit one of your highlights: its cover, its name and which stories it keeps. Nothing is saved
 * until Done, so a slip of the finger can be undone by simply going back.
 */
export default function EditHighlight() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const highlightId = String(id);
  const { me, profile } = useSession();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [data, setData] = useState<{ highlight: Highlight; items: HighlightItem[] } | null | 'missing'>(null);
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  // A cover chosen here and not saved yet; null keeps the saved one.
  const [cover, setCover] = useState<string | null>(null);
  // Stories marked for removal. They stay in the grid, faded, so they can be put back before Done.
  const [removed, setRemoved] = useState<string[]>([]);
  const [sheet, setSheet] = useState<'cover' | 'plus' | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setError('');
    setData(null);
    fetchHighlight(highlightId)
      .then((res) => {
        setData(res ?? 'missing');
        if (res) {
          setTitle(res.highlight.title);
          setCover(null);
          setRemoved([]);
        }
      })
      .catch((e) => setError(errText(e)));
  }, [highlightId]);

  useEffect(load, [load]);

  const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));

  if (error) {
    return (
      <Screen>
        <ScreenHeader title="Edit highlight" />
        <ErrorNote message={error} onRetry={load} />
      </Screen>
    );
  }
  if (data === null) {
    return (
      <Screen>
        <ScreenHeader title="Edit highlight" />
        <Loading />
      </Screen>
    );
  }
  if (data === 'missing') {
    return (
      <Screen>
        <ScreenHeader title="Edit highlight" />
        <Empty icon="highlight" title="This highlight isn't available" body="It may have been deleted." />
      </Screen>
    );
  }
  if (data.highlight.user_id !== me) {
    return (
      <Screen>
        <ScreenHeader title="Edit highlight" />
        <Empty icon="lock" title="You can only edit your own highlights" />
      </Screen>
    );
  }

  const { highlight, items } = data;
  const kept = items.filter((i) => !removed.includes(i.id));
  const removedCovers = items.filter((i) => removed.includes(i.id)).map((i) => coverOf(i.item));
  // A cover that came from a story being removed goes with it (the next picture takes over); an uploaded photo stays.
  let preview = cover ?? highlight.cover_url;
  const fromRemoved = !!preview && removedCovers.includes(preview) && !kept.some((i) => coverOf(i.item) === preview);
  if (fromRemoved) preview = kept.map((i) => coverOf(i.item)).find(Boolean) ?? '';
  const name = title.trim();
  const dirty = name !== highlight.title || preview !== highlight.cover_url || removed.length > 0;
  const choices = [...new Set(kept.map((i) => coverOf(i.item)).filter(Boolean))];
  const ring = ringColors(profile?.ring_color);
  const ringName = RING_STYLES.find((r) => r.id === (profile?.ring_color ?? ''))?.label ?? 'Green';
  const cw = Math.floor((width - 32 - GAP * 2) / 3);
  const ch = Math.round((cw * 16) / 9);

  const toggle = (itemId: string) => setRemoved((cur) => (cur.includes(itemId) ? cur.filter((x) => x !== itemId) : [...cur, itemId]));

  async function back() {
    if (saving) return;
    if (dirty && !(await confirmAlert('Discard your changes?', 'Your highlight stays as it was.', 'Discard'))) return;
    leave();
  }

  async function save() {
    if (saving || uploading) return;
    if (!name) {
      toast('Give the highlight a name.');
      return;
    }
    if (!dirty) {
      leave();
      return;
    }
    if (!kept.length) {
      if (!(await confirmAlert('Remove every story?', 'A highlight needs at least one story, so this one will be deleted. Your archive keeps the stories.', 'Delete highlight'))) return;
      setSaving(true);
      try {
        await deleteHighlight(highlight.id);
        toast('Highlight deleted');
        leave();
      } catch (e) {
        toast(errText(e));
        setSaving(false);
      }
      return;
    }
    setSaving(true);
    const done: string[] = [];
    let saved = highlight;
    try {
      for (const rid of removed) {
        await removeHighlightItem(rid);
        done.push(rid);
      }
      if (preview !== saved.cover_url) {
        await setHighlightCover(saved.id, preview);
        saved = { ...saved, cover_url: preview };
      }
      if (name !== saved.title) {
        await renameHighlight(saved.id, name);
        saved = { ...saved, title: name };
      }
      toast('Highlight saved');
      leave();
    } catch (e) {
      toast(errText(e));
      // Keep what went through and leave the rest waiting, so Done can simply be tapped again.
      setData({ highlight: saved, items: items.filter((i) => !done.includes(i.id)) });
      setRemoved((cur) => cur.filter((x) => !done.includes(x)));
      setCover(preview === saved.cover_url ? null : preview);
      setSaving(false);
    }
  }

  // Your own photo as a cover is a Community Plus perk; everyone can use a picture from the highlight.
  async function upload() {
    if (!profile?.plus) {
      setSheet('plus');
      return;
    }
    setSheet(null);
    await afterSheet();
    try {
      const [asset] = await pickFromLibrary({ square: true });
      if (!asset) return;
      setUploading(true);
      const media = await uploadImage(me, asset.uri, asset.width, 600);
      setCover(media.url);
    } catch (e) {
      toast(errText(e));
    } finally {
      setUploading(false);
    }
  }

  function seePlus() {
    setSheet(null);
    afterSheet().then(() => router.push('/plus'));
  }

  return (
    <Screen>
      <ScreenHeader
        title="Edit highlight"
        onBack={back}
        right={
          saving ? (
            <View style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator color={C.fg2} />
            </View>
          ) : (
            <RoundButton name="check" label="Done" bg={C.accent} color={C.onAccent} onPress={save} />
          )
        }
      />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32 }} keyboardShouldPersistTaps="handled">
          <View style={{ alignItems: 'center', paddingTop: 12, gap: 10 }}>
            <Pressable onPress={() => setSheet('cover')} disabled={uploading} accessibilityRole="button" accessibilityLabel="Edit cover">
              <HighlightCover uri={preview} size={96} ring={ring} />
              {uploading ? (
                <View style={{ position: 'absolute', left: 0, top: 0, width: 96, height: 96, borderRadius: 48, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' }}>
                  <ActivityIndicator color="#fff" />
                </View>
              ) : null}
            </Pressable>
            <Pressable onPress={() => setSheet('cover')} disabled={uploading} hitSlop={8} accessibilityRole="button" accessibilityLabel="Edit cover">
              <Text style={{ color: C.accent2, fontWeight: '600', fontSize: 15.5 }}>{uploading ? 'Uploading…' : 'Edit cover'}</Text>
            </Pressable>
            <Pressable onPress={() => router.push('/profile-style')} hitSlop={6} accessibilityRole="link" accessibilityLabel={`Ring colour: ${ringName}. Change it in Profile style`}>
              <Text style={{ color: C.fg2, fontSize: 13, textAlign: 'center', paddingHorizontal: 24 }}>
                Ring colour: {ringName}. <Text style={{ color: C.fg, fontWeight: '600' }}>Change it in Profile style</Text>
              </Text>
            </Pressable>
          </View>

          <View style={{ paddingHorizontal: 16, paddingTop: 22 }}>
            <Field label="Title" value={title} onChangeText={setTitle} maxLength={TITLE_MAX} placeholder="Highlight name" returnKeyType="done" />
            <Text style={{ color: C.fg3, fontSize: 12, textAlign: 'right', marginTop: 4 }}>
              {title.length}/{TITLE_MAX}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 }}>
            <Text accessibilityRole="header" style={{ color: C.fg, fontSize: 17, fontWeight: '700' }}>Stories</Text>
            <Text style={{ color: C.fg2, fontSize: 13.5 }}>{kept.length === 1 ? '1 story' : `${kept.length} stories`}</Text>
          </View>
          {items.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP, paddingHorizontal: 16 }}>
              {items.map((it) => {
                const out = removed.includes(it.id);
                const isCover = !out && !!preview && coverOf(it.item) === preview;
                const day = dayLabel(new Date(it.created_at));
                return (
                  <View key={it.id} style={{ width: cw, height: ch }}>
                    <View style={{ opacity: out ? 0.3 : 1 }}>
                      <StoryCanvas item={it.item} width={cw} height={ch} radius={10} hideCaption />
                    </View>
                    <Text style={{ position: 'absolute', left: 7, bottom: 6, color: '#fff', fontSize: 12, fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 3, textShadowOffset: { width: 0, height: 1 } }}>{day}</Text>
                    {isCover ? (
                      <View style={{ position: 'absolute', right: 6, bottom: 6, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.55)' }}>
                        <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>Cover</Text>
                      </View>
                    ) : null}
                    <Pressable
                      onPress={() => toggle(it.id)}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={out ? `Put back the story from ${day}` : `Remove the story from ${day}`}
                      style={({ pressed }) => ({ position: 'absolute', top: 6, right: 6, width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: '#fff', backgroundColor: out ? C.accent : C.like, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
                      {out ? <Icon name="plus" size={14} color={C.onAccent} weight={3} /> : <View style={{ width: 11, height: 2.4, borderRadius: 1.2, backgroundColor: '#fff' }} />}
                    </Pressable>
                  </View>
                );
              })}
            </View>
          ) : (
            <Text style={{ color: C.fg2, paddingHorizontal: 16 }}>This highlight has no stories yet.</Text>
          )}
          {/* There is no story picker to reuse here yet, so adding goes through the archive, which already does it. */}
          <Pressable onPress={() => router.push('/archive')} accessibilityRole="link" style={{ paddingHorizontal: 16, paddingTop: 16 }}>
            <Text style={{ color: C.fg2, lineHeight: 19 }}>
              To add more, open a story in your <Text style={{ color: C.fg, fontWeight: '600' }}>archive</Text> and tap Highlight.
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      <Sheet visible={sheet !== null} onClose={() => setSheet(null)} title={sheet === 'plus' ? 'Your own cover photo' : 'Edit cover'}>
        {sheet === 'plus' ? (
          <View style={{ paddingHorizontal: 24, gap: 12, alignItems: 'center' }}>
            <Icon name="crown" size={40} color={C.accent2} />
            <Text style={{ color: C.fg2, textAlign: 'center', lineHeight: 21 }}>
              Uploading any photo from your phone as a highlight cover is part of Community Plus. You can always use a picture from the highlight itself.
            </Text>
            <Button label="See Community Plus" onPress={seePlus} style={{ alignSelf: 'stretch', marginTop: 4 }} />
            <Button label="Not now" kind="ghost" onPress={() => setSheet('cover')} style={{ alignSelf: 'stretch' }} />
          </View>
        ) : (
          <>
            <Text style={{ color: C.fg2, fontSize: 13.5, paddingHorizontal: 16, paddingBottom: 10 }}>From this highlight</Text>
            {choices.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 12, paddingBottom: 16 }}>
                {choices.map((url) => {
                  const on = url === preview;
                  return (
                    <Pressable key={url} onPress={() => { setCover(url); setSheet(null); }} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={on ? 'The cover now' : 'Use this picture as the cover'}>
                      <HighlightCover uri={url} size={72} ring={on ? ring : null} gap={C.sheet} />
                      {on ? (
                        <View style={{ position: 'absolute', right: 0, bottom: 0, width: 22, height: 22, borderRadius: 11, backgroundColor: C.accent, borderWidth: 2, borderColor: C.sheet, alignItems: 'center', justifyContent: 'center' }}>
                          <Icon name="check" size={12} color={C.onAccent} weight={3} />
                        </View>
                      ) : null}
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : (
              <Text style={{ color: C.fg3, paddingHorizontal: 16, paddingBottom: 16 }}>The stories here have no pictures to use.</Text>
            )}
            <SheetRow first icon="image" label="Upload a photo" sub={profile?.plus ? 'Choose any photo from your phone' : 'Any photo from your phone, with Community Plus'} right={profile?.plus ? undefined : <PlusTag />} onPress={upload} />
          </>
        )}
      </Sheet>
    </Screen>
  );
}
