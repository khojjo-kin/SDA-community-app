import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Linking, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { File, Paths } from 'expo-file-system';
import { copyAsync } from 'expo-file-system/legacy';
import { Image } from 'expo-image';
import * as MediaLibrary from 'expo-media-library';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getCachedLibrary, invalidateLibrary, libraryPage, LibraryPage, refreshLibrary } from '../lib/library';
import { Picked, pickFromLibrary, takePhoto, videoProblem } from '../lib/pick';
import { usePrefs } from '../lib/prefs';
import { useSession } from '../lib/session';
import { clock, DARK, errText } from '../lib/theme';
import { Icon } from './Icon';
import { DarkEmpty } from './OnDark';
import { Button, RoundButton, useToast } from './ui';

/**
 * POST is one to ten photos and videos (a video on its own becomes a reel when shared), STORY hands
 * over to the story flow. LIVE, next to them, opens Go live.
 */
export type PickMode = 'post' | 'story';

/** One chosen photo or video, as a file the uploader can read. `duration` is in seconds. */
export type PickedItem = { uri: string; type: 'image' | 'video'; w: number; h: number; duration?: number; bytes?: number };

type Cell = { key: string; asset?: MediaLibrary.Asset };
type Access = 'checking' | 'all' | 'limited' | 'none';

const LIMIT = 10;
const MODES: { id: PickMode; label: string }[] = [
  { id: 'post', label: 'POST' },
  { id: 'story', label: 'STORY' },
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
    const copy = new File(Paths.cache, `video-${Date.now()}.${ext}`);
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

/** A library video longer than a post takes. Size is only known once the file is read, at Next. */
const tooLong = (a: MediaLibrary.Asset) => a.mediaType === 'video' && videoProblem(a.duration * 1000, 0) !== null;

type TileProps = {
  asset: MediaLibrary.Asset;
  size: number;
  /** In the preview. */
  isCurrent: boolean;
  /** Place among the photos and videos selected, from 0; -1 when not selected. */
  order: number;
  multi: boolean;
  onPress: (a: MediaLibrary.Asset) => void;
};

/**
 * One photo or video in the grid. Only redrawn when its own state changes, so a tap stays quick in a
 * long grid. The thumbnail is drawn straight from the library address: no asset info is fetched
 * until Next.
 */
const Tile = memo(function Tile({ asset: a, size, isCurrent, order, multi, onPress }: TileProps) {
  const video = a.mediaType === 'video';
  return (
    <Pressable onPress={() => onPress(a)} accessibilityRole="button" accessibilityLabel={video ? `Video, ${clock(a.duration)}` : 'Photo'} accessibilityState={{ selected: isCurrent || order >= 0 }} style={({ pressed }) => ({ width: size, height: size, backgroundColor: '#111', opacity: pressed ? 0.8 : 1 })}>
      <Image source={{ uri: a.uri }} recyclingKey={a.id} cachePolicy="memory" transition={60} style={{ width: size, height: size }} contentFit="cover" />
      {isCurrent && !multi ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.35)' }]} /> : null}
      {video ? <Text style={{ position: 'absolute', right: 6, bottom: 5, color: '#fff', fontWeight: '700', fontSize: 12.5, textShadowColor: 'rgba(0,0,0,0.7)', textShadowRadius: 3, textShadowOffset: { width: 0, height: 1 } }}>{clock(a.duration)}</Text> : null}
      {multi ? (
        <View style={{ position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: '#fff', backgroundColor: order >= 0 ? DARK.accent : 'rgba(0,0,0,0.3)', alignItems: 'center', justifyContent: 'center' }}>
          {order >= 0 ? <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>{order + 1}</Text> : null}
        </View>
      ) : null}
    </Pressable>
  );
});

/**
 * The "New post" screen: a big preview, the photo library in a grid, and the POST / STORY switch at
 * the bottom, with LIVE next to them (not for members under 14, who can't broadcast). Calls `onNext`
 * with files ready for the editor.
 *
 * It opens with the newest photos already in it (loaded ahead of time by library.ts) and the first
 * one in the preview, then refreshes the grid behind.
 */
export function MediaPicker({ mode, onMode, onNext, onClose }: { mode: PickMode; onMode: (m: PickMode) => void; onNext: (items: PickedItem[]) => void; onClose: () => void }) {
  const toast = useToast();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const prefs = usePrefs();
  const { profile } = useSession();
  // Members under 14 can't go live, so the choice isn't offered.
  const canLive = profile?.restricted !== true;
  const { width } = useWindowDimensions();
  // The newest page loaded ahead of time, if there is one: it is on screen from the first frame.
  const [seed] = useState<LibraryPage | null>(getCachedLibrary);
  const [access, setAccess] = useState<Access>(seed ? seed.access : 'checking');
  const [canAsk, setCanAsk] = useState(true);
  const [assets, setAssets] = useState<MediaLibrary.Asset[]>(() => seed?.assets ?? []);
  // What the preview shows, and (when selecting several) the photos in the order they were tapped.
  const [current, setCurrent] = useState<MediaLibrary.Asset | null>(() => seed?.assets.find((a) => !tooLong(a)) ?? null);
  const [picked, setPicked] = useState<MediaLibrary.Asset[]>([]);
  const [multi, setMulti] = useState(false);
  const [busy, setBusy] = useState('');
  // The grid's photos as last set, for merging without waiting for a render.
  const shown = useRef<MediaLibrary.Asset[]>(seed?.assets ?? []);
  const cursor = useRef<string | undefined>(seed?.endCursor);
  const more = useRef(seed ? seed.hasNextPage : true);
  const loading = useRef(false);
  // Bumped when the grid starts again: further pages still on their way belong to the old one.
  const request = useRef(0);
  // Each refresh of the newest page gets a number; only the latest one is shown.
  const fresh = useRef(0);
  // Further pages have been added since the newest page was last put in.
  const extended = useRef(false);

  // Set once the person has chosen something themselves; until then the preview follows the grid.
  const touched = useRef(false);

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const show = useCallback((list: MediaLibrary.Asset[]) => {
    shown.current = list;
    setAssets(list);
  }, []);

  /** The next page, after what the grid already holds. */
  const loadMore = useCallback(async () => {
    // No cursor yet means the first page has not arrived; the refresh brings it.
    if (loading.current || !more.current || cursor.current === undefined) return;
    loading.current = true;
    const mine = request.current;
    try {
      const page = await libraryPage(cursor.current);
      if (mine !== request.current || !alive.current) return;
      cursor.current = page.endCursor;
      more.current = page.hasNextPage;
      extended.current = true;
      const have = new Set(shown.current.map((a) => a.id));
      show([...shown.current, ...page.assets.filter((a) => !have.has(a.id))]);
    } catch (e) {
      if (mine === request.current) toast(errText(e));
    } finally {
      if (mine === request.current) loading.current = false;
    }
  }, [toast, show]);

  /**
   * The newest page, fresh from the library. It replaces the grid, unless further pages have been
   * added by then: it is merged in front of them instead. `restart` (the library changed) always
   * starts the grid again.
   */
  const refresh = useCallback(
    async (restart: boolean) => {
      const mine = ++fresh.current;
      if (restart) {
        request.current++;
        loading.current = false;
        invalidateLibrary();
      }
      let page: LibraryPage | null;
      try {
        page = await refreshLibrary();
      } catch (e) {
        // Quiet while photos are on screen already: they are only a little old.
        if (mine === fresh.current && alive.current && !shown.current.length) toast(errText(e));
        return;
      }
      if (!page || mine !== fresh.current || !alive.current) return;
      if (restart || (!extended.current && !loading.current)) {
        request.current++;
        loading.current = false;
        extended.current = false;
        cursor.current = page.endCursor;
        more.current = page.hasNextPage;
        show(page.assets);
      } else {
        const ids = new Set(page.assets.map((a) => a.id));
        show([...page.assets, ...shown.current.filter((a) => !ids.has(a.id))]);
      }
    },
    [toast, show],
  );

  /** Access was taken away: nothing from the library stays on screen. */
  const forget = useCallback(() => {
    invalidateLibrary();
    request.current++;
    fresh.current++;
    loading.current = false;
    extended.current = false;
    cursor.current = undefined;
    more.current = true;
    show([]);
    setCurrent(null);
    setPicked([]);
  }, [show]);

  /**
   * Reads the access the person has given. `ask`: 'always' asks whenever the system still allows it
   * (the Allow access button), 'first' only if they have never been asked, 'never' does not ask.
   */
  const check = useCallback(
    async (ask: 'always' | 'first' | 'never') => {
      try {
        let p = await MediaLibrary.getPermissionsAsync();
        const may = ask === 'always' ? p.canAskAgain : ask === 'first' && p.status === MediaLibrary.PermissionStatus.UNDETERMINED;
        if (!p.granted && may) p = await MediaLibrary.requestPermissionsAsync();
        if (!alive.current) return;
        setCanAsk(p.canAskAgain);
        if (!p.granted) forget();
        setAccess(p.granted ? (p.accessPrivileges === 'limited' ? 'limited' : 'all') : 'none');
      } catch {
        if (!alive.current) return;
        forget();
        setAccess('none');
      }
    },
    [forget],
  );

  // Asks only when nothing was loaded ahead of time and the person has never been asked.
  useEffect(() => {
    check(seed ? 'never' : 'first');
  }, [check, seed]);

  useEffect(() => {
    if (access !== 'all' && access !== 'limited') return;
    refresh(false);
    // The library says when photos are added or removed, or when the person changes which ones we may see.
    const sub = MediaLibrary.addListener(() => {
      refresh(true);
    });
    return () => sub.remove();
  }, [access, refresh]);

  // Keep something in the preview as photos arrive.
  useEffect(() => {
    // A preview nobody chose (from the page loaded ahead of time) moves on if that photo has gone since.
    setCurrent((cur) => (cur && (touched.current || assets.some((a) => a.id === cur.id)) ? cur : assets.find((a) => !tooLong(a)) ?? null));
  }, [assets]);

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

  /** A photo or video from the camera or the system chooser, as the editor takes it. Its duration arrives in milliseconds. */
  const asItem = (a: Picked): PickedItem =>
    a.type === 'video'
      ? { uri: a.uri, type: 'video', w: a.width, h: a.height, duration: (a.duration ?? 0) / 1000, bytes: a.fileSize ?? undefined }
      : { uri: a.uri, type: 'image', w: a.width, h: a.height };

  // A photo or a video: a video shared on its own becomes a reel.
  const camera = () =>
    run(async () => {
      const [shot] = await takePhoto({ front: prefs.frontCamera, video: true });
      if (!shot || !alive.current) return;
      if (shot.type === 'video') {
        const problem = videoProblem(shot.duration, shot.fileSize);
        if (problem) return toast(problem);
      }
      onNext([asItem(shot)]);
    }, 'Opening the camera…');

  /** The system chooser needs no library permission, so it is the way in when access is off. */
  const systemPicker = () =>
    run(async () => {
      const list = (await pickFromLibrary({ multiple: true, limit: LIMIT, video: true })).slice(0, LIMIT);
      if (!list.length || !alive.current) return;
      // The same length and size checks as for videos chosen in the grid.
      for (const a of list) {
        const problem = a.type === 'video' ? videoProblem(a.duration, a.fileSize) : null;
        if (problem) return toast(problem);
      }
      onNext(list.map(asItem));
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
    // Said straight away rather than at Next: the library already knows how long a video is.
    if (tooLong(a)) {
      toast(videoProblem(a.duration * 1000, 0) ?? '');
      return;
    }
    touched.current = true;
    setCurrent(a);
    if (!multi) {
      setPicked([a]);
      return;
    }
    setPicked((cur) => {
      if (cur.some((p) => p.id === a.id)) return cur.filter((p) => p.id !== a.id);
      if (cur.length >= LIMIT) {
        toast(`You can share up to ${LIMIT} photos and videos in one post.`);
        return cur;
      }
      return [...cur, a];
    });
  }

  // The grid's tiles keep one handler for good, so a tap does not redraw every tile.
  const tapRef = useRef(tap);
  tapRef.current = tap;
  const onTile = useCallback((a: MediaLibrary.Asset) => tapRef.current(a), []);

  function toggleMulti() {
    setMulti((m) => !m);
    setPicked(current ? [current] : []);
  }

  const chosen = multi ? picked : current ? [current] : [];

  const next = () =>
    run(async () => {
      if (!chosen.length) {
        toast('Choose a photo or video first.');
        return;
      }
      const items: PickedItem[] = [];
      for (const a of chosen) {
        const item = await fileOf(a);
        // Every video in the post has to be short and small enough to upload.
        if (item.type === 'video') {
          const problem = videoProblem((item.duration ?? 0) * 1000, item.bytes);
          if (problem) return toast(problem);
        }
        items.push(item);
      }
      if (alive.current) onNext(items);
    }, 'Getting it ready…');

  const gap = 1;
  const cw = Math.floor((width - gap * 3) / 4);
  const previewH = Math.round((width * 5) / 4);
  const cells: Cell[] = [{ key: 'camera' }, ...assets.map((a) => ({ key: a.id, asset: a }))];
  const noAccess = access === 'none';
  // Every row of tiles is the same height, so the grid never has to measure one. Rows sit under the
  // header, whose height is measured once it is drawn.
  const [headH, setHeadH] = useState(previewH + 52);
  const row = cw + gap;
  const getItemLayout = useCallback((_: unknown, index: number) => ({ length: row, offset: headH + row * index, index }), [row, headH]);
  // Up to three choices share the bar; a narrow phone gets a little less room around each.
  const pad = width < 380 ? 12 : 16;

  const header = (
    <View onLayout={(e) => { const h = e.nativeEvent.layout.height; setHeadH((cur) => (Math.abs(cur - h) > 0.5 ? h : cur)); }}>
      <View style={{ width, height: previewH, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }} accessible accessibilityLabel={current ? (current.mediaType === 'video' ? `Chosen video, ${clock(current.duration)}` : 'Chosen photo') : 'Nothing chosen yet'}>
        {current ? <Image source={{ uri: current.uri }} style={StyleSheet.absoluteFill} contentFit="contain" transition={80} /> : null}
        {current?.mediaType === 'video' ? (
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="play" size={32} color="#fff" />
          </View>
        ) : null}
        {!current ? (
          <View style={{ alignItems: 'center', gap: 10, paddingHorizontal: 32 }}>
            <Icon name="image" size={44} color={DARK.fg3} />
            <Text style={{ color: DARK.fg2, textAlign: 'center', lineHeight: 20 }}>{`Choose up to ${LIMIT} photos and videos. People swipe through them in one post. A video on its own becomes a reel.`}</Text>
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
          <Pressable onPress={toggleMulti} disabled={!!busy} accessibilityRole="button" accessibilityLabel={multi ? 'Stop selecting several' : 'Select several photos and videos'} accessibilityState={{ selected: multi }} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingHorizontal: 12, borderRadius: 16, backgroundColor: multi ? '#fff' : '#2a2d32', opacity: pressed ? 0.7 : 1 })}>
            <Icon name="select" size={16} color={multi ? '#000' : '#fff'} weight={2.2} />
            <Text style={{ color: multi ? '#000' : '#fff', fontWeight: '600', fontSize: 14.5 }}>Select</Text>
          </Pressable>
        ) : null}
      </View>
      {access === 'limited' ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 14, paddingBottom: 12 }}>
          <Text style={{ flex: 1, color: DARK.fg2, fontSize: 14, lineHeight: 19 }}>You've given Community access to a select number of photos and videos.</Text>
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
        <RoundButton name="close" label="Close" onPress={onClose} size={40} iconSize={22} bg={DARK.round} color={DARK.fg} />
        <Text accessibilityRole="header" numberOfLines={1} style={{ flex: 1, color: '#fff', fontSize: 18, fontWeight: '700', textAlign: 'center' }}>New post</Text>
        <Pressable onPress={next} disabled={!!busy || !chosen.length} hitSlop={8} accessibilityRole="button" accessibilityLabel="Next" accessibilityState={{ disabled: !!busy || !chosen.length }} style={({ pressed }) => ({ width: 56, alignItems: 'flex-end', opacity: !chosen.length ? 0.4 : pressed ? 0.6 : 1 })}>
          <Text style={{ color: DARK.accent2, fontWeight: '700', fontSize: 16.5 }}>Next</Text>
        </Pressable>
      </View>

      {access === 'checking' ? (
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <ActivityIndicator color={DARK.fg2} />
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
              <DarkEmpty
                icon="image"
                title="See your photos here"
                body="Community can't see your photo library yet. Allow access, or choose with the system picker."
                action={
                  <View style={{ alignSelf: 'stretch', gap: 10, marginTop: 6 }}>
                    <Button label="Allow access" onPress={() => (canAsk ? check('always') : Linking.openSettings().catch(() => {}))} />
                    <Button label="Choose photos and videos" kind="ghost" onPress={systemPicker} />
                  </View>
                }
              />
            ) : null
          }
          ListEmptyComponent={<Text style={{ color: DARK.fg2, textAlign: 'center', padding: 32 }}>No photos here yet.</Text>}
          onEndReached={() => (noAccess ? undefined : loadMore())}
          onEndReachedThreshold={1.2}
          contentContainerStyle={{ paddingBottom: insets.bottom + 84 }}
          showsVerticalScrollIndicator={false}
          getItemLayout={getItemLayout}
          initialNumToRender={24}
          maxToRenderPerBatch={24}
          windowSize={7}
          removeClippedSubviews
          extraData={[current?.id, picked, multi]}
          renderItem={({ item }) => {
            const a = item.asset;
            if (!a) {
              return (
                <Pressable onPress={camera} disabled={!!busy} accessibilityRole="button" accessibilityLabel="Take a photo or video" style={({ pressed }) => ({ width: cw, height: cw, backgroundColor: '#1c1e22', alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
                  <Icon name="camera" size={30} color="#fff" />
                </Pressable>
              );
            }
            return <Tile asset={a} size={cw} isCurrent={current?.id === a.id} order={multi ? picked.findIndex((p) => p.id === a.id) : -1} multi={multi} onPress={onTile} />;
          }}
        />
      )}

      {/* POST · STORY · LIVE */}
      <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: insets.bottom + 14, alignItems: 'center' }}>
        <View accessibilityRole="tablist" style={{ flexDirection: 'row', alignItems: 'center', height: 44, paddingHorizontal: 6, borderRadius: 22, backgroundColor: 'rgba(28,30,34,0.94)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.14)' }}>
          {MODES.map((m) => (
            <Pressable key={m.id} onPress={() => (busy || m.id === mode ? undefined : onMode(m.id))} accessibilityRole="tab" accessibilityLabel={m.label} accessibilityState={{ selected: mode === m.id }} style={({ pressed }) => ({ height: 36, paddingHorizontal: pad, borderRadius: 18, justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
              <Text style={{ color: mode === m.id ? '#fff' : 'rgba(255,255,255,0.45)', fontSize: 12.5, fontWeight: '700', letterSpacing: 1.6 }}>{m.label}</Text>
            </Pressable>
          ))}
          {/* Live is a screen of its own, still one tap from here. */}
          {canLive ? (
            <Pressable onPress={() => (busy ? undefined : router.replace('/go-live'))} accessibilityRole="button" accessibilityLabel="Go live" accessibilityHint="Opens the camera to broadcast" style={({ pressed }) => ({ height: 36, paddingHorizontal: pad, borderRadius: 18, justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
              <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12.5, fontWeight: '700', letterSpacing: 1.6 }}>LIVE</Text>
            </Pressable>
          ) : null}
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
