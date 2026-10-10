import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Linking, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { File, Paths } from 'expo-file-system';
import { copyAsync } from 'expo-file-system/legacy';
import { Image } from 'expo-image';
import * as MediaLibrary from 'expo-media-library';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { pickFromLibrary, pickVideo, takePhoto, videoProblem } from '../lib/pick';
import { usePrefs } from '../lib/prefs';
import { C, clock, errText } from '../lib/theme';
import { Icon } from './Icon';
import { Button, Empty, RoundButton, useToast } from './ui';

/** POST is photos (one to ten), INSTANTS is one short video, STORY hands over to the story flow. */
export type PickMode = 'post' | 'story' | 'reel';

/** One chosen photo or video, as a file the uploader can read. `duration` is in seconds. */
export type PickedItem = { uri: string; type: 'image' | 'video'; w: number; h: number; duration?: number; bytes?: number };

type Cell = { key: string; asset?: MediaLibrary.Asset };
type Access = 'checking' | 'all' | 'limited' | 'none';

const PAGE = 60;
const LIMIT = 10;
const MODES: { id: PickMode; label: string }[] = [
  { id: 'post', label: 'POST' },
  { id: 'story', label: 'STORY' },
  { id: 'reel', label: 'INSTANTS' },
];

/**
 * Turns a library asset into something the editor and the uploader can open. iOS hands assets over
 * as ph:// addresses; the asset's own info usually carries a file address, and a video that still
 * has none is copied into the app's space (which also fetches it from iCloud).
 */
async function fileOf(a: MediaLibrary.Asset): Promise<PickedItem> {
  let uri = a.uri;
  try {
    const info = await MediaLibrary.getAssetInfoAsync(a);
    uri = info.localUri || info.uri || a.uri;
  } catch {
    uri = a.uri;
  }
  if (a.mediaType !== 'video') return { uri, type: 'image', w: a.width, h: a.height };
  if (!/^file:/i.test(uri)) {
    const ext = /\.mp4$/i.test(a.filename) ? 'mp4' : 'mov';
    const copy = new File(Paths.cache, `instant-${Date.now()}.${ext}`);
    await copyAsync({ from: a.uri, to: copy.uri });
    uri = copy.uri;
  }
  let bytes: number | undefined;
  try {
    bytes = new File(uri).size ?? undefined;
  } catch {
    bytes = undefined;
  }
  return { uri, type: 'video', w: a.width, h: a.height, duration: a.duration, bytes };
}

const fits = (a: MediaLibrary.Asset, mode: PickMode) => (mode === 'reel' ? a.mediaType === 'video' : a.mediaType !== 'video');

/**
 * The "New post" screen: a big preview, the photo library in a grid, and the POST / STORY / INSTANTS
 * switch at the bottom. Calls `onNext` with files ready for the editor.
 */
export function MediaPicker({ mode, onMode, onNext, onClose }: { mode: PickMode; onMode: (m: PickMode) => void; onNext: (items: PickedItem[]) => void; onClose: () => void }) {
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const prefs = usePrefs();
  const { width } = useWindowDimensions();
  const [access, setAccess] = useState<Access>('checking');
  const [canAsk, setCanAsk] = useState(true);
  const [assets, setAssets] = useState<MediaLibrary.Asset[]>([]);
  // What the preview shows, and (when selecting several) the photos in the order they were tapped.
  const [current, setCurrent] = useState<MediaLibrary.Asset | null>(null);
  const [picked, setPicked] = useState<MediaLibrary.Asset[]>([]);
  const [multi, setMulti] = useState(false);
  const [busy, setBusy] = useState('');
  const cursor = useRef<string | undefined>(undefined);
  const more = useRef(true);
  const loading = useRef(false);
  const request = useRef(0);

  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const load = useCallback(
    async (reset: boolean) => {
      if (loading.current && !reset) return;
      if (reset) {
        cursor.current = undefined;
        more.current = true;
        request.current++;
      }
      if (!more.current) return;
      loading.current = true;
      const mine = request.current;
      try {
        const page = await MediaLibrary.getAssetsAsync({ first: PAGE, after: cursor.current, mediaType: ['photo', 'video'], sortBy: MediaLibrary.SortBy.creationTime });
        if (mine !== request.current) return;
        cursor.current = page.endCursor;
        more.current = page.hasNextPage;
        setAssets((cur) => (reset ? page.assets : [...cur, ...page.assets.filter((a) => !cur.some((c) => c.id === a.id))]));
      } catch (e) {
        if (mine === request.current) toast(errText(e));
      } finally {
        if (mine === request.current) loading.current = false;
      }
    },
    [toast],
  );

  const check = useCallback(async (ask: boolean) => {
    try {
      let p = await MediaLibrary.getPermissionsAsync();
      if (!p.granted && ask && p.canAskAgain) p = await MediaLibrary.requestPermissionsAsync();
      setCanAsk(p.canAskAgain);
      setAccess(p.granted ? (p.accessPrivileges === 'limited' ? 'limited' : 'all') : 'none');
    } catch {
      setAccess('none');
    }
  }, []);

  useEffect(() => {
    check(true);
  }, [check]);

  useEffect(() => {
    if (access !== 'all' && access !== 'limited') return;
    load(true);
    // The library says when photos are added or removed, or when the person changes which ones we may see.
    const sub = MediaLibrary.addListener(() => {
      load(true);
    });
    return () => sub.remove();
  }, [access, load]);

  // Start again when the kind of post changes, and keep something in the preview as photos arrive.
  useEffect(() => {
    setMulti(false);
    setPicked([]);
    setCurrent((cur) => (cur && fits(cur, mode) ? cur : null));
  }, [mode]);
  useEffect(() => {
    setCurrent((cur) => cur ?? assets.find((a) => fits(a, mode)) ?? null);
  }, [assets, mode]);

  /** Runs a system picker or the camera with the screen covered, so a second tap cannot open a second one. */
  async function run(work: () => Promise<void>, note = '') {
    if (busy) return;
    setBusy(note || 'One moment…');
    try {
      await work();
    } catch (e) {
      toast(errText(e));
    } finally {
      if (alive.current) setBusy('');
    }
  }

  const camera = () =>
    run(async () => {
      const [shot] = await takePhoto({ front: prefs.frontCamera, videoOnly: mode === 'reel' });
      if (!shot || !alive.current) return;
      if (mode === 'reel') {
        if (shot.type !== 'video') return toast('That was a photo. Record a video for an Instant.');
        const problem = videoProblem(shot.duration, shot.fileSize);
        if (problem) return toast(problem);
        onNext([{ uri: shot.uri, type: 'video', w: shot.width, h: shot.height, duration: (shot.duration ?? 0) / 1000, bytes: shot.fileSize ?? undefined }]);
      } else {
        if (shot.type === 'video') return toast('That was a video. Switch to Instants to share it.');
        onNext([{ uri: shot.uri, type: 'image', w: shot.width, h: shot.height }]);
      }
    }, 'Opening the camera…');

  /** The system chooser needs no library permission, so it is the way in when access is off. */
  const systemPicker = () =>
    run(async () => {
      if (mode === 'reel') {
        const v = await pickVideo();
        if (!v || !alive.current) return;
        const problem = videoProblem(v.duration, v.fileSize);
        if (problem) return toast(problem);
        onNext([{ uri: v.uri, type: 'video', w: v.width, h: v.height, duration: (v.duration ?? 0) / 1000, bytes: v.fileSize ?? undefined }]);
        return;
      }
      const list = (await pickFromLibrary({ multiple: true, limit: LIMIT })).filter((p) => p.type !== 'video').slice(0, LIMIT);
      if (!list.length || !alive.current) return;
      onNext(list.map((a) => ({ uri: a.uri, type: 'image' as const, w: a.width, h: a.height })));
    }, 'Getting it ready…');

  async function manage() {
    try {
      await MediaLibrary.presentPermissionsPickerAsync();
    } catch (e) {
      toast(errText(e));
    }
  }

  function tap(a: MediaLibrary.Asset) {
    if (busy) return;
    if (!fits(a, mode)) {
      toast(mode === 'reel' ? 'Instants are videos. Switch to Post to share photos.' : 'Switch to Instants to share a video.');
      return;
    }
    setCurrent(a);
    if (!multi) {
      setPicked([a]);
      return;
    }
    setPicked((cur) => {
      if (cur.some((p) => p.id === a.id)) return cur.filter((p) => p.id !== a.id);
      if (cur.length >= LIMIT) {
        toast(`You can share up to ${LIMIT} photos in one post.`);
        return cur;
      }
      return [...cur, a];
    });
  }

  function toggleMulti() {
    setMulti((m) => !m);
    setPicked(current ? [current] : []);
  }

  const chosen = multi ? picked : current ? [current] : [];

  const next = () =>
    run(async () => {
      if (!chosen.length) {
        toast(mode === 'reel' ? 'Choose a video first.' : 'Choose a photo first.');
        return;
      }
      const items: PickedItem[] = [];
      for (const a of chosen) items.push(await fileOf(a));
      if (mode === 'reel') {
        const problem = videoProblem((items[0].duration ?? 0) * 1000, items[0].bytes);
        if (problem) return toast(problem);
      }
      if (alive.current) onNext(items);
    }, 'Getting it ready…');

  const gap = 1;
  const cw = Math.floor((width - gap * 3) / 4);
  const previewH = Math.round((width * 5) / 4);
  const cells: Cell[] = [{ key: 'camera' }, ...assets.map((a) => ({ key: a.id, asset: a }))];
  const noAccess = access === 'none';

  const header = (
    <View>
      <View style={{ width, height: previewH, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }} accessible accessibilityLabel={current ? (current.mediaType === 'video' ? `Chosen video, ${clock(current.duration)}` : 'Chosen photo') : 'Nothing chosen yet'}>
        {current ? <Image source={{ uri: current.uri }} style={StyleSheet.absoluteFill} contentFit="contain" transition={80} /> : null}
        {current?.mediaType === 'video' ? (
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="play" size={32} color="#fff" />
          </View>
        ) : null}
        {!current ? (
          <View style={{ alignItems: 'center', gap: 10, paddingHorizontal: 32 }}>
            <Icon name={mode === 'reel' ? 'reels' : 'image'} size={44} color={C.fg3} />
            <Text style={{ color: C.fg2, textAlign: 'center', lineHeight: 20 }}>{mode === 'reel' ? 'Choose one video up to 60 seconds.' : `Choose up to ${LIMIT} photos. People swipe through them in one post.`}</Text>
          </View>
        ) : null}
        {multi && picked.length ? (
          <View style={{ position: 'absolute', top: 12, right: 12, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 13, backgroundColor: 'rgba(10,12,14,0.72)' }}>
            <Text style={{ color: '#fff', fontSize: 12.5, fontWeight: '600' }}>{picked.length} of {LIMIT}</Text>
          </View>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }} accessible accessibilityRole="header">
          <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700' }}>Recents</Text>
          <Icon name="right" size={16} color="#fff" weight={2.4} />
        </View>
        {mode === 'post' && !noAccess ? (
          <Pressable onPress={toggleMulti} disabled={!!busy} accessibilityRole="button" accessibilityLabel={multi ? 'Stop selecting several' : 'Select several photos'} accessibilityState={{ selected: multi }} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingHorizontal: 12, borderRadius: 16, backgroundColor: multi ? '#fff' : '#2a2d32', opacity: pressed ? 0.7 : 1 })}>
            <Icon name="select" size={16} color={multi ? '#000' : '#fff'} weight={2.2} />
            <Text style={{ color: multi ? '#000' : '#fff', fontWeight: '600', fontSize: 14.5 }}>Select</Text>
          </Pressable>
        ) : null}
      </View>
      {access === 'limited' ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 14, paddingBottom: 12 }}>
          <Text style={{ flex: 1, color: C.fg2, fontSize: 14, lineHeight: 19 }}>You've given Community access to a select number of photos and videos.</Text>
          <Pressable onPress={manage} hitSlop={8} accessibilityRole="button" accessibilityLabel="Manage which photos Community can see" style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15.5 }}>Manage</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: '#000', paddingTop: insets.top }}>
      <View style={{ height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 }}>
        <RoundButton name="close" label="Close" onPress={onClose} size={40} iconSize={22} />
        <Text accessibilityRole="header" numberOfLines={1} style={{ flex: 1, color: '#fff', fontSize: 18, fontWeight: '700', textAlign: 'center' }}>{mode === 'reel' ? 'New Instant' : 'New post'}</Text>
        <Pressable onPress={next} disabled={!!busy || !chosen.length} hitSlop={8} accessibilityRole="button" accessibilityLabel="Next" accessibilityState={{ disabled: !!busy || !chosen.length }} style={({ pressed }) => ({ width: 56, alignItems: 'flex-end', opacity: !chosen.length ? 0.4 : pressed ? 0.6 : 1 })}>
          <Text style={{ color: C.accent2, fontWeight: '700', fontSize: 16.5 }}>Next</Text>
        </Pressable>
      </View>

      {access === 'checking' ? (
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <ActivityIndicator color={C.fg2} />
        </View>
      ) : (
        <FlatList
          data={noAccess ? [cells[0]] : cells}
          keyExtractor={(c) => c.key}
          numColumns={4}
          columnWrapperStyle={{ gap }}
          ItemSeparatorComponent={() => <View style={{ height: gap }} />}
          ListHeaderComponent={header}
          ListFooterComponent={
            noAccess ? (
              <Empty
                icon="image"
                title="See your photos here"
                body="Community can't see your photo library yet. Allow access, or choose with the system picker."
                action={
                  <View style={{ alignSelf: 'stretch', gap: 10, marginTop: 6 }}>
                    <Button label="Allow access" onPress={() => (canAsk ? check(true) : Linking.openSettings().catch(() => {}))} />
                    <Button label={mode === 'reel' ? 'Choose a video' : 'Choose photos'} kind="ghost" onPress={systemPicker} />
                  </View>
                }
              />
            ) : null
          }
          ListEmptyComponent={<Text style={{ color: C.fg2, textAlign: 'center', padding: 32 }}>No photos here yet.</Text>}
          onEndReached={() => (noAccess ? undefined : load(false))}
          onEndReachedThreshold={1.2}
          contentContainerStyle={{ paddingBottom: insets.bottom + 84 }}
          showsVerticalScrollIndicator={false}
          initialNumToRender={16}
          windowSize={7}
          extraData={[current?.id, picked, multi, mode]}
          renderItem={({ item }) => {
            const a = item.asset;
            if (!a) {
              return (
                <Pressable onPress={camera} disabled={!!busy} accessibilityRole="button" accessibilityLabel={mode === 'reel' ? 'Record a video' : 'Take a photo'} style={({ pressed }) => ({ width: cw, height: cw, backgroundColor: '#1c1e22', alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
                  <Icon name="camera" size={30} color="#fff" />
                </Pressable>
              );
            }
            const order = multi ? picked.findIndex((p) => p.id === a.id) : -1;
            const isCurrent = current?.id === a.id;
            const video = a.mediaType === 'video';
            return (
              <Pressable onPress={() => tap(a)} accessibilityRole="button" accessibilityLabel={video ? `Video, ${clock(a.duration)}` : 'Photo'} accessibilityState={{ selected: isCurrent || order >= 0 }} style={({ pressed }) => ({ width: cw, height: cw, backgroundColor: '#111', opacity: pressed ? 0.8 : 1 })}>
                <Image source={{ uri: a.uri }} recyclingKey={a.id} style={{ width: cw, height: cw, opacity: fits(a, mode) ? 1 : 0.3 }} contentFit="cover" />
                {isCurrent && !multi ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.35)' }]} /> : null}
                {video ? <Text style={{ position: 'absolute', right: 6, bottom: 5, color: '#fff', fontWeight: '700', fontSize: 12.5, textShadowColor: 'rgba(0,0,0,0.7)', textShadowRadius: 3, textShadowOffset: { width: 0, height: 1 } }}>{clock(a.duration)}</Text> : null}
                {multi && !video ? (
                  <View style={{ position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: '#fff', backgroundColor: order >= 0 ? C.accent : 'rgba(0,0,0,0.3)', alignItems: 'center', justifyContent: 'center' }}>
                    {order >= 0 ? <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>{order + 1}</Text> : null}
                  </View>
                ) : null}
              </Pressable>
            );
          }}
        />
      )}

      {/* POST · STORY · INSTANTS */}
      <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: insets.bottom + 14, alignItems: 'center' }}>
        <View accessibilityRole="tablist" style={{ flexDirection: 'row', alignItems: 'center', height: 44, paddingHorizontal: 6, borderRadius: 22, backgroundColor: 'rgba(28,30,34,0.94)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.14)' }}>
          {MODES.map((m) => (
            <Pressable key={m.id} onPress={() => (busy || m.id === mode ? undefined : onMode(m.id))} accessibilityRole="tab" accessibilityLabel={m.label} accessibilityState={{ selected: mode === m.id }} style={({ pressed }) => ({ height: 36, paddingHorizontal: 16, borderRadius: 18, justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
              <Text style={{ color: mode === m.id ? '#fff' : 'rgba(255,255,255,0.45)', fontSize: 12.5, fontWeight: '700', letterSpacing: 1.6 }}>{m.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {busy ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', gap: 12 }]} accessibilityLiveRegion="polite">
          <ActivityIndicator color="#fff" />
          <Text style={{ color: '#fff', fontWeight: '600' }}>{busy}</Text>
        </View>
      ) : null}
    </View>
  );
}
