import React, { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../../src/components/Icon';
import { MediaPicker, PickMode, PickedItem } from '../../src/components/MediaPicker';
import { isPlainEdit, PhotoEdit, PLAIN_EDIT, PostEditor, useLookExport } from '../../src/components/PostEditor';
import { Button, IconButton, Radio, Sheet, useToast } from '../../src/components/ui';
import { canPostIn, createPost, fetchMyGroups, uploadImage, uploadVideo } from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import { C, errText } from '../../src/lib/theme';
import type { Group, Media, PodItem } from '../../src/lib/types';

type Step = 'pick' | 'edit' | 'share';

/**
 * Share a post (up to 10 photos) or an Instant (one video up to 60 seconds), in three steps on one
 * screen: choose, edit, share. Stories hand over to their own screen. Deep links arrive as
 * ?mode=post|reel, and a verse or a hymn line can arrive as a ready-made caption.
 */
export default function Create() {
  const params = useLocalSearchParams<{ mode?: string; text?: string; group?: string }>();
  const { me, profile } = useSession();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<PickMode>(params.mode === 'reel' ? 'reel' : 'post');
  const [step, setStep] = useState<Step>('pick');
  const [items, setItems] = useState<PickedItem[]>([]);
  // One edit per photo, in the same order as items.
  const [edits, setEdits] = useState<PhotoEdit[]>([]);
  const [audio, setAudio] = useState<PodItem | null>(null);
  const [caption, setCaption] = useState(typeof params.text === 'string' ? params.text.slice(0, 2200) : '');
  const [location, setLocation] = useState('');
  // Videos: the frame used as the cover. Starts as the first frame; the editor can pick another.
  const [poster, setPoster] = useState('');
  const [posterChosen, setPosterChosen] = useState(false);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const { exportEdited, exporter } = useLookExport();
  // Where the post goes: your profile, or one of the communities and pages you can post in.
  // A group id can arrive from a group's own Post button.
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupId, setGroupId] = useState<string | null>(typeof params.group === 'string' && params.group ? params.group : null);
  const [choosingGroup, setChoosingGroup] = useState(false);
  useEffect(() => {
    fetchMyGroups(me).then((all) => setGroups(all.filter(canPostIn))).catch(() => setGroups([]));
  }, [me]);
  const group = groups.find((g) => g.id === groupId) ?? null;

  // The upload carries on if this screen is closed part-way; it must not then close whatever is open instead.
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const isVideo = items[0]?.type === 'video';

  function onMode(m: PickMode) {
    if (m === 'story') {
      router.replace('/add-story');
      return;
    }
    setMode(m);
  }

  function onPicked(list: PickedItem[]) {
    setItems(list);
    setEdits(list.map(() => PLAIN_EDIT));
    setPoster('');
    setPosterChosen(false);
    setErr('');
    if (list[0]?.type === 'video') {
      VideoThumbnails.getThumbnailAsync(list[0].uri, { time: 300, quality: 0.6 })
        .then((t) => { if (alive.current) setPoster((p) => p || t.uri); })
        .catch(() => {});
    }
    setStep('edit');
  }

  async function share() {
    if (!items.length || busy) return;
    setErr('');
    try {
      const media: Media[] = [];
      for (let i = 0; i < items.length; i++) {
        const a = items[i];
        const which = items.length > 1 ? ` ${i + 1} of ${items.length}` : '';
        if (a.type === 'video') {
          setBusy('Uploading video…');
          const m = await uploadVideo(me, a.uri, a.w, a.h);
          // A cover chosen in the editor replaces the first frame the uploader took.
          if (posterChosen && poster) {
            try {
              setBusy('Uploading the cover…');
              m.poster = (await uploadImage(me, poster, undefined, 1080)).url;
            } catch {
              // the first frame will do
            }
          }
          media.push(m);
          continue;
        }
        // An edited photo is drawn with its filter, adjustments and text baked in, then uploaded like any other.
        const e = edits[i] ?? PLAIN_EDIT;
        let uri = a.uri;
        let w: number | undefined = a.w;
        if (!isPlainEdit(e)) {
          setBusy(`Preparing${which ? ' photo' + which : ' the photo'}…`);
          uri = await exportEdited(a.uri, e, a.w, a.h);
          w = undefined;
        }
        setBusy(`Uploading${which}…`);
        media.push(await uploadImage(me, uri, w));
      }
      setBusy('Sharing…');
      await createPost(me, { caption, media, group_id: groupId, audio_id: audio?.id ?? null, location });
      toast(media[0].type === 'video' ? 'Your Instant is live' : 'Your post is live');
      if (alive.current) close();
    } catch (e) {
      if (!alive.current) {
        toast(`That did not share. ${errText(e)}`);
        return;
      }
      setErr(errText(e));
      setBusy('');
    }
  }

  const thumb = isVideo ? poster : items[0]?.uri;
  const disabled = !items.length || !!busy;

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {/* The picker stays underneath so its selection is still there when the editor closes. */}
      <MediaPicker mode={mode} onMode={onMode} onNext={onPicked} onClose={close} />

      {step === 'edit' && items.length ? (
        <View style={StyleSheet.absoluteFill}>
          <PostEditor items={items} edits={edits} setEdits={setEdits} audio={audio} onAudio={setAudio} caption={caption} onCaption={setCaption} poster={poster} onPoster={(uri) => { setPoster(uri); setPosterChosen(true); }} plus={!!profile?.plus} onClose={() => setStep('pick')} onNext={() => setStep('share')} />
        </View>
      ) : null}

      {step === 'share' && items.length ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: C.bg, paddingTop: insets.top }]}>
          <View style={{ height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 }}>
            <IconButton name="back" label="Back to editing" onPress={() => (busy ? undefined : setStep('edit'))} />
            <Text accessibilityRole="header" style={{ flex: 1, color: C.fg, fontSize: 18, fontWeight: '700', textAlign: 'center' }}>{isVideo ? 'New Instant' : 'New post'}</Text>
            <Pressable onPress={share} disabled={disabled} hitSlop={8} style={({ pressed }) => ({ width: 56, alignItems: 'flex-end', paddingRight: 8, opacity: disabled ? 0.4 : pressed ? 0.6 : 1 })} accessibilityRole="button" accessibilityLabel="Share" accessibilityState={{ disabled }}>
              <Text style={{ color: C.accent2, fontWeight: '700', fontSize: 16.5 }}>Share</Text>
            </Pressable>
          </View>

          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
              <View style={{ flexDirection: 'row', gap: 12, marginHorizontal: 16, marginTop: 8 }}>
                <Pressable onPress={() => (busy ? undefined : setStep('edit'))} accessibilityRole="button" accessibilityLabel={`${isVideo ? 'Video' : items.length > 1 ? `${items.length} photos` : 'Photo'}. Back to editing`} style={({ pressed }) => ({ width: 72, height: 90, borderRadius: 10, overflow: 'hidden', backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
                  {thumb ? <Image source={{ uri: thumb }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
                  {isVideo ? <Icon name="play" size={26} color="#fff" /> : null}
                  {items.length > 1 ? (
                    <View style={{ position: 'absolute', top: 5, right: 5, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, backgroundColor: 'rgba(10,12,14,0.72)' }}>
                      <Text style={{ color: '#fff', fontSize: 11, fontWeight: '600' }}>{items.length}</Text>
                    </View>
                  ) : null}
                </Pressable>
                <TextInput value={caption} onChangeText={setCaption} placeholder="Write a caption…" placeholderTextColor={C.fg3} multiline maxLength={2200} keyboardAppearance="dark" editable={!busy} style={{ flex: 1, minHeight: 90, padding: 12, borderRadius: 12, backgroundColor: C.surface, color: C.fg, fontSize: 16, textAlignVertical: 'top' }} accessibilityLabel="Caption" />
              </View>

              {groups.length || groupId ? (
                <Pressable onPress={() => setChoosingGroup(true)} disabled={!!busy} accessibilityRole="button" accessibilityLabel={`Post to ${group ? group.name : 'your profile'}`} style={({ pressed }) => ({ marginHorizontal: 16, marginTop: 12, paddingHorizontal: 14, minHeight: 52, borderRadius: 12, backgroundColor: pressed ? C.surface2 : C.surface, flexDirection: 'row', alignItems: 'center', gap: 10 })}>
                  <Icon name={group ? (group.kind === 'page' ? 'crown' : 'users') : 'user'} size={20} color={C.accent2} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: C.fg2, fontSize: 12.5 }}>Post to</Text>
                    <Text style={{ color: C.fg, fontSize: 16, fontWeight: '600' }} numberOfLines={1}>{group ? group.name : 'Your profile'}</Text>
                  </View>
                  <Icon name="down" size={18} color={C.fg2} weight={2.2} />
                </Pressable>
              ) : null}

              <View style={{ marginHorizontal: 16, marginTop: 12, paddingHorizontal: 14, minHeight: 52, borderRadius: 12, backgroundColor: C.surface, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Icon name="music" size={20} color={C.accent2} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.fg2, fontSize: 12.5 }}>Audio</Text>
                  <Text style={{ color: audio ? C.fg : C.fg3, fontSize: 16, fontWeight: audio ? '600' : '400' }} numberOfLines={1}>{audio ? `${audio.title} · ${audio.artist}` : 'None'}</Text>
                </View>
                {audio ? <IconButton name="close" size={20} label="Remove the audio" color={C.fg2} onPress={() => (busy ? undefined : setAudio(null))} /> : null}
              </View>

              <View style={{ marginHorizontal: 16, marginTop: 12, paddingHorizontal: 14, minHeight: 52, borderRadius: 12, backgroundColor: C.surface, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Icon name="location" size={20} color={C.accent2} />
                <TextInput value={location} onChangeText={setLocation} placeholder="Add location" placeholderTextColor={C.fg3} maxLength={120} keyboardAppearance="dark" editable={!busy} style={{ flex: 1, color: C.fg, fontSize: 16, paddingVertical: 12 }} accessibilityLabel="Location" />
              </View>

              {busy ? <Text style={{ color: C.fg2, textAlign: 'center', marginTop: 18 }} accessibilityLiveRegion="polite">{busy}</Text> : null}
              {err ? <Text style={{ color: C.like, textAlign: 'center', marginTop: 18, marginHorizontal: 24, lineHeight: 20 }} accessibilityLiveRegion="polite">{err}</Text> : null}

              <Button label={busy ? 'Sharing' : 'Share'} busy={!!busy} onPress={share} disabled={!items.length} style={{ marginHorizontal: 16, marginTop: 22 }} />
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      ) : null}

      <Sheet visible={choosingGroup} onClose={() => setChoosingGroup(false)} title="Post to">
        {[{ id: null as string | null, name: 'Your profile', sub: 'Everyone who follows you' }, ...groups.map((g) => ({ id: g.id as string | null, name: g.name, sub: g.kind === 'page' ? 'Page' : g.privacy === 'private' ? 'Private community' : 'Community' }))].map((o) => (
          <Pressable key={o.id ?? 'me'} onPress={() => { setGroupId(o.id); setChoosingGroup(false); }} accessibilityRole="radio" accessibilityState={{ checked: groupId === o.id }} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, minHeight: 54, backgroundColor: pressed ? 'rgba(255,255,255,0.05)' : 'transparent' })}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.fg, fontSize: 16.5 }} numberOfLines={1}>{o.name}</Text>
              <Text style={{ color: C.fg2, fontSize: 13 }}>{o.sub}</Text>
            </View>
            <Radio on={groupId === o.id} />
          </Pressable>
        ))}
      </Sheet>
      {/* Draws edited photos offscreen at share time. Takes no space. */}
      {exporter}
    </View>
  );
}
