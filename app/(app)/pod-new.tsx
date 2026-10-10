import React, { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { createAudioPlayer } from 'expo-audio';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { FeedSwitch } from '../../src/components/FeedSwitch';
import { Icon } from '../../src/components/Icon';
import { Button, Empty, Field, Screen, ScreenHeader, useToast } from '../../src/components/ui';
import { addPodItem, uploadAudio, uploadImage } from '../../src/lib/api';
import { pickFromLibrary } from '../../src/lib/pick';
import { useSession } from '../../src/lib/session';
import { C, errText } from '../../src/lib/theme';
import type { PodItem } from '../../src/lib/types';

type Kind = PodItem['kind'];
type Errors = { title?: string; artist?: string; audio?: string; form?: string };

const KINDS = [
  { key: 'song', label: 'Song' },
  { key: 'podcast', label: 'Podcast' },
] as const;

/** Accepts a web address or a file on this phone. Anything else is null. */
function audioOf(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  if (/^file:\/\//i.test(s)) return s;
  const url = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  return /^https?:\/\/[\w.-]+(\.[\w-]+)+(:\d+)?(\/\S*)?$/i.test(url) ? url : null;
}

/** Whether the link looks like an audio file by its name; links without one may still be fine. */
function looksLikeAudio(url: string): boolean {
  return /\.(mp3|m4a|aac|wav|ogg|oga|flac|mp4)(\?|#|$)/i.test(url);
}

/**
 * Opens the file in a throwaway player just long enough to read how long it is. Resolves 0 when it cannot be read
 * (a slow link, a stream, or something that is not audio), never rejects.
 */
function probeDuration(uri: string, timeoutMs = 10000): Promise<number> {
  return new Promise((resolve) => {
    let done = false;
    let player: ReturnType<typeof createAudioPlayer> | null = null;
    let sub: { remove: () => void } | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const finish = (seconds: number) => {
      if (done) return;
      done = true;
      if (poll) clearInterval(poll);
      if (timer) clearTimeout(timer);
      try {
        sub?.remove();
        player?.remove();
      } catch {
        // already released
      }
      resolve(Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : 0);
    };
    try {
      player = createAudioPlayer({ uri }, { updateInterval: 250 });
      sub = player.addListener('playbackStatusUpdate', (s) => {
        if (s.isLoaded && s.duration > 0) finish(s.duration);
      });
      poll = setInterval(() => {
        try {
          if (player?.isLoaded && player.duration > 0) finish(player.duration);
        } catch {
          finish(0);
        }
      }, 300);
      timer = setTimeout(() => finish(0), timeoutMs);
    } catch {
      finish(0);
    }
  });
}

export default function PodNew() {
  const router = useRouter();
  const toast = useToast();
  const { me, profile } = useSession();
  const canAdd = !!profile?.plus || !!profile?.admin_role;

  const [kind, setKind] = useState<Kind>('song');
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [description, setDescription] = useState('');
  const [audio, setAudio] = useState('');
  const [cover, setCover] = useState<{ uri: string; width: number } | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState('');
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  async function chooseCover() {
    try {
      const [a] = await pickFromLibrary({ square: true });
      if (a) setCover({ uri: a.uri, width: a.width });
    } catch (e) {
      setErrors({ form: errText(e) });
    }
  }

  async function save() {
    if (busy) return;
    const t = title.trim();
    const a = artist.trim();
    const url = audioOf(audio);
    const errs: Errors = {};
    if (t.length < 2) errs.title = kind === 'song' ? 'Give the song a title.' : 'Give the episode a title.';
    if (!a) errs.artist = kind === 'song' ? 'Who is it by?' : 'Who hosts it?';
    if (!url) errs.audio = 'Paste a direct link to the audio file, ending in .mp3 or .m4a.';
    setErrors(errs);
    if (!url || errs.title || errs.artist) return;
    setBusy(true);
    try {
      setStep('Reading the audio');
      const duration = await probeDuration(url);
      if (!alive.current) return;
      if (!duration && !looksLikeAudio(url)) {
        setErrors({ audio: 'That link could not be played. It needs to open as an audio file, such as an .mp3 or .m4a.' });
        setBusy(false);
        setStep('');
        return;
      }
      // Files are uploaded only now, so backing out of the form leaves nothing behind in storage.
      let audio_url = url;
      if (/^file:\/\//i.test(url)) {
        setStep('Uploading the audio');
        audio_url = await uploadAudio(me, url);
      }
      let cover_url = '';
      if (cover) {
        setStep('Uploading the cover');
        cover_url = (await uploadImage(me, cover.uri, cover.width, 1200)).url;
      }
      setStep('Saving');
      const item = await addPodItem(me, { kind, title: t, artist: a, description: kind === 'podcast' ? description : '', cover_url, audio_url, duration_seconds: duration });
      if (!alive.current) return;
      toast('Added to Pod');
      // Replace this form in the stack, so Back from the track goes to Pod rather than an empty form.
      router.replace(`/pod/${item.id}` as any);
    } catch (e) {
      if (!alive.current) return;
      setErrors({ form: errText(e) });
      setBusy(false);
      setStep('');
    }
  }

  if (!canAdd) {
    return (
      <Screen>
        <ScreenHeader title="Add to Pod" />
        <Empty icon="headphones" title="Sharing on Pod is part of Community Plus" body="Plus members and admins can add songs and podcast episodes for the whole family to listen to." action={<Button small label="See Community Plus" onPress={() => router.push('/plus' as any)} style={{ marginTop: 8 }} />} />
      </Screen>
    );
  }

  const song = kind === 'song';
  return (
    <Screen>
      <ScreenHeader title="Add to Pod" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 6, paddingBottom: 48, gap: 14 }} keyboardShouldPersistTaps="handled">
          <FeedSwitch value={kind} onChange={setKind} options={KINDS} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, paddingTop: 4 }}>
            <Pressable onPress={busy ? undefined : chooseCover} accessibilityRole="button" accessibilityLabel={cover ? 'Change the cover' : 'Add a cover'} style={({ pressed }) => ({ width: 112, height: 112, borderRadius: 16, backgroundColor: C.surface, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
              {cover ? <Image source={{ uri: cover.uri }} style={{ width: 112, height: 112 }} contentFit="cover" accessibilityIgnoresInvertColors /> : <Icon name={song ? 'music' : 'podcast'} size={38} color={C.fg2} />}
              {cover ? (
                <View style={{ position: 'absolute', right: 6, bottom: 6, width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(11,16,20,0.8)', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="camera" size={15} />
                </View>
              ) : null}
            </Pressable>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ color: C.fg, fontSize: 16, fontWeight: '700' }}>Cover</Text>
              <Text style={{ color: C.fg2, fontSize: 13.5, lineHeight: 18 }}>{cover ? 'Tap to choose another square picture.' : 'A square picture shows on the shelf and in the player. Optional.'}</Text>
              {cover ? (
                <Pressable onPress={() => setCover(null)} hitSlop={6} accessibilityRole="button" accessibilityLabel="Remove the cover" style={({ pressed }) => ({ alignSelf: 'flex-start', paddingVertical: 4, opacity: pressed ? 0.6 : 1 })}>
                  <Text style={{ color: C.like, fontSize: 13.5, fontWeight: '600' }}>Remove</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
          <Field label="Title" value={title} onChangeText={setTitle} placeholder={song ? 'e.g. Amazing Grace' : 'e.g. Episode 12: Walking by faith'} maxLength={160} error={errors.title} autoFocus editable={!busy} />
          <Field label={song ? 'Artist' : 'Host'} value={artist} onChangeText={setArtist} placeholder={song ? 'Who sings it' : 'Who presents it'} maxLength={160} error={errors.artist} editable={!busy} />
          {song ? null : <Field label="About this episode" value={description} onChangeText={setDescription} placeholder="What it covers, who is on it, where to find more" multiline maxLength={2000} style={{ minHeight: 110, textAlignVertical: 'top' }} editable={!busy} />}
          <Field label="Audio file link (mp3/m4a)" value={audio} onChangeText={setAudio} placeholder="https://" autoCapitalize="none" autoCorrect={false} keyboardType="url" maxLength={1000} error={errors.audio} editable={!busy} />
          <Text style={{ color: C.fg3, fontSize: 12.5, lineHeight: 17 }}>Paste a direct link to the audio file, for example from your church's website or a file share. The length is read from the file when it is added.</Text>
          {errors.form ? <Text style={{ color: C.like, lineHeight: 19 }}>{errors.form}</Text> : null}
          <Button label="Add to Pod" busy={busy} onPress={save} style={{ marginTop: 6 }} />
          {busy && step ? <Text style={{ color: C.fg3, fontSize: 12.5, textAlign: 'center' }}>{step}. This can take a moment.</Text> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
