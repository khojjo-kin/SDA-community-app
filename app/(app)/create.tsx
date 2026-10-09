import React, { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { Icon } from '../../src/components/Icon';
import { Button, IconButton, Screen, useToast } from '../../src/components/ui';
import { createPost, uploadImage, uploadVideo } from '../../src/lib/api';
import { Picked, pickFromLibrary, pickVideo, takePhoto, videoProblem } from '../../src/lib/pick';
import { usePrefs } from '../../src/lib/prefs';
import { useSession } from '../../src/lib/session';
import { C, errText } from '../../src/lib/theme';
import type { Media } from '../../src/lib/types';

type Mode = 'post' | 'reel';

/** Share a post (up to 10 photos) or a reel (one video up to 60 seconds). Stories have their own screen. */
export default function Create() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const { me } = useSession();
  const prefs = usePrefs();
  const router = useRouter();
  const toast = useToast();
  const { width } = useWindowDimensions();
  const [mode, setMode] = useState<Mode>(params.mode === 'reel' ? 'reel' : 'post');
  const [items, setItems] = useState<Picked[]>([]);
  const [caption, setCaption] = useState('');
  const [poster, setPoster] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');

  // The upload carries on if this screen is closed part-way; it must not then close whatever is open instead.
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  function acceptVideo(video: Picked) {
    const problem = videoProblem(video.duration, video.fileSize);
    if (problem) return setErr(problem);
    setPoster('');
    VideoThumbnails.getThumbnailAsync(video.uri, { time: 300, quality: 0.6 }).then((t) => setPoster(t.uri)).catch(() => {});
    setItems([video]);
  }

  async function choose(camera: boolean) {
    setErr('');
    try {
      if (mode === 'reel') {
        if (camera) {
          const [shot] = await takePhoto({ front: prefs.frontCamera, videoOnly: true });
          if (!shot) return;
          if (shot.type !== 'video') return setErr('That was a photo. Record a video for a reel, or switch to Post.');
          acceptVideo(shot);
        } else {
          // The phone copies and shrinks the video before handing it over, which can take a while.
          setBusy('Getting the video ready…');
          try {
            const video = await pickVideo();
            if (video) acceptVideo(video);
          } finally {
            if (alive.current) setBusy('');
          }
        }
        return;
      }
      const picked = camera ? await takePhoto({ front: prefs.frontCamera }) : await pickFromLibrary({ multiple: true, limit: 10 });
      const photos = picked.filter((p) => p.type !== 'video').slice(0, 10);
      if (photos.length) setItems(photos);
    } catch (e) {
      setErr(errText(e));
    }
  }

  async function share() {
    if (!items.length || busy) return;
    setErr('');
    try {
      const media: Media[] = [];
      for (let i = 0; i < items.length; i++) {
        const a = items[i];
        setBusy(items.length > 1 ? `Uploading ${i + 1} of ${items.length}…` : a.type === 'video' ? 'Uploading video…' : 'Uploading…');
        media.push(a.type === 'video' ? await uploadVideo(me, a.uri, a.width, a.height) : await uploadImage(me, a.uri, a.width));
      }
      setBusy('Sharing…');
      await createPost(me, { caption, media });
      toast(media[0].type === 'video' ? 'Your reel is live' : 'Your post is live');
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

  const box = width - 32;
  const tall = mode === 'reel' ? 1.5 : 1.25;

  return (
    <Screen>
      <View style={{ height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 }}>
        <IconButton name="close" label="Close" onPress={close} />
        <Text accessibilityRole="header" style={{ flex: 1, color: C.fg, fontSize: 18, fontWeight: '700', textAlign: 'center' }}>{mode === 'reel' ? 'New reel' : 'New post'}</Text>
        <Pressable onPress={share} disabled={!items.length || !!busy} hitSlop={8} style={{ width: 56, alignItems: 'flex-end', paddingRight: 8 }} accessibilityRole="button" accessibilityState={{ disabled: !items.length || !!busy }}>
          <Text style={{ color: C.accent2, fontWeight: '700', opacity: !items.length || busy ? 0.4 : 1 }}>Share</Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          {items.length ? (
            <ScrollView horizontal pagingEnabled={items.length > 1} showsHorizontalScrollIndicator={false} style={{ marginHorizontal: 16 }}>
              {items.map((a, i) => (
                <View key={a.uri + i} style={{ width: box, height: Math.round(box * tall), borderRadius: 14, overflow: 'hidden', backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' }}>
                  {a.type !== 'video' || poster ? <Image source={{ uri: a.type === 'video' ? poster : a.uri }} style={{ position: 'absolute', width: '100%', height: '100%' }} contentFit="cover" /> : null}
                  {a.type === 'video' ? (
                    <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="play" size={32} />
                    </View>
                  ) : null}
                  {items.length > 1 ? (
                    <View style={{ position: 'absolute', top: 12, right: 12, backgroundColor: 'rgba(10,12,14,0.7)', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 12 }}>
                      <Text style={{ color: C.fg, fontSize: 12 }}>{i + 1}/{items.length}</Text>
                    </View>
                  ) : null}
                </View>
              ))}
            </ScrollView>
          ) : (
            <View style={{ marginHorizontal: 16, height: Math.round(box * 0.9), borderRadius: 14, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 }}>
              <Icon name={mode === 'reel' ? 'reels' : 'image'} size={46} color={C.fg2} />
              <Text style={{ color: C.fg2, textAlign: 'center', lineHeight: 20 }}>{mode === 'reel' ? 'Choose or record one video, up to 60 seconds.' : 'Choose up to 10 photos. People swipe through them in one post.'}</Text>
            </View>
          )}

          <View style={{ flexDirection: 'row', gap: 6, marginHorizontal: 16, marginTop: 14, padding: 4, borderRadius: 12, backgroundColor: C.surface }} accessibilityRole="tablist">
            {(['post', 'reel'] as Mode[]).map((m) => (
              <Pressable key={m} onPress={() => { if (busy || m === mode) return; setMode(m); setItems([]); setPoster(''); setErr(''); }} accessibilityRole="tab" accessibilityState={{ selected: mode === m }} style={{ flex: 1, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: mode === m ? C.surface2 : 'transparent' }}>
                <Text style={{ color: mode === m ? C.fg : C.fg2, fontWeight: '600' }}>{m === 'post' ? 'Post' : 'Reel'}</Text>
              </Pressable>
            ))}
          </View>

          <View style={{ flexDirection: 'row', gap: 10, marginHorizontal: 16, marginTop: 14 }}>
            <Button label={items.length ? 'Choose different' : 'Choose from library'} onPress={() => choose(false)} style={{ flex: 1 }} disabled={!!busy} />
            <Button label="Camera" kind="ghost" onPress={() => choose(true)} disabled={!!busy} />
          </View>

          {items.length ? (
            <TextInput value={caption} onChangeText={setCaption} placeholder="Write a caption…" placeholderTextColor={C.fg3} multiline maxLength={2200} keyboardAppearance="dark" style={{ marginHorizontal: 16, marginTop: 14, minHeight: 90, padding: 12, borderRadius: 12, backgroundColor: C.surface, color: C.fg, fontSize: 16, textAlignVertical: 'top' }} accessibilityLabel="Caption" />
          ) : null}

          {busy ? <Text style={{ color: C.fg2, textAlign: 'center', marginTop: 16 }} accessibilityLiveRegion="polite">{busy}</Text> : null}
          {err ? <Text style={{ color: C.like, textAlign: 'center', marginTop: 16, marginHorizontal: 24, lineHeight: 20 }} accessibilityLiveRegion="polite">{err}</Text> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
