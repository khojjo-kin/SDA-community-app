import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, FlatList, Linking, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import type { ListRenderItemInfo } from 'react-native';
import { File, Paths } from 'expo-file-system';
import { copyAsync } from 'expo-file-system/legacy';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as MediaLibrary from 'expo-media-library';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, IconName } from '../../src/components/Icon';
import { ModeSwitcher, useModeNav } from '../../src/components/ModeSwitcher';
import { DarkLoading, DarkStatusBar } from '../../src/components/OnDark';
import { Button, IconButton, Sheet, useToast } from '../../src/components/ui';
import { t } from '../../src/lib/i18n';
import { CameraOffError, pickFromLibrary, pickVideo, showCameraOff, takePhoto, videoProblem } from '../../src/lib/pick';
import { usePrefs } from '../../src/lib/prefs';
import { useSession } from '../../src/lib/session';
import { C, clock, DARK, errText } from '../../src/lib/theme';

/** iPhone's own whole-library album: the Recents row at the top already is that, so it isn't listed twice. */
const LIBRARY_ALBUM = /^(recents|recent|all photos|camera roll)$/i;

/** What the story editor is handed: one or more things to share. */
export type StorySource = { uri: string; type: 'image' | 'video'; w: number; h: number; duration?: number; poster?: string };

type Cell = { key: string; asset?: MediaLibrary.Asset };
type Access = 'checking' | 'all' | 'limited' | 'none';
const PAGE = 60;
const CAMERA: Cell = { key: 'camera' };

function Tile({ icon, label, colors, onPress }: { icon: IconName; label: string; colors: readonly [string, string]; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => ({ flex: 1, height: 100, borderRadius: 14, backgroundColor: '#1e1e1e', borderWidth: 1, borderColor: '#2a2a2a', alignItems: 'center', justifyContent: 'center', gap: 9, opacity: pressed ? 0.7 : 1 })}>
      <LinearGradient colors={[colors[0], colors[1]]} start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }} style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={22} color="#fff" weight={2.2} />
      </LinearGradient>
      <Text numberOfLines={1} style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}

/**
 * One photo or video in the grid, drawn at the tile's size straight from the library. Only redrawn
 * when its own state changes. While choosing several, videos are dimmed and photos carry their number.
 */
const StoryTile = memo(function StoryTile({ asset: a, w, h, choosing, order, onPress }: { asset: MediaLibrary.Asset; w: number; h: number; choosing: boolean; order: number; onPress: (a: MediaLibrary.Asset) => void }) {
  const video = a.mediaType === 'video';
  return (
    <Pressable onPress={() => onPress(a)} accessibilityRole="button" accessibilityLabel={video ? `Video, ${clock(a.duration)}` : 'Photo'} accessibilityState={choosing ? { selected: order >= 0 } : undefined} style={({ pressed }) => ({ width: w, height: h, backgroundColor: '#111', opacity: pressed ? 0.8 : 1 })}>
      <Image source={{ uri: a.uri }} recyclingKey={a.id} cachePolicy="memory" transition={60} style={{ width: w, height: h, opacity: choosing && video ? 0.35 : 1 }} contentFit="cover" />
      {video ? <Text style={{ position: 'absolute', right: 7, bottom: 6, color: '#fff', fontWeight: '700', fontSize: 14, textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 3, textShadowOffset: { width: 0, height: 1 } }}>{clock(a.duration)}</Text> : null}
      {choosing && !video ? (
        <View style={{ position: 'absolute', top: 7, right: 7, width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: '#fff', backgroundColor: order >= 0 ? DARK.accent : 'rgba(0,0,0,0.25)', alignItems: 'center', justifyContent: 'center' }}>
          {order >= 0 ? <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>{order + 1}</Text> : null}
        </View>
      ) : null}
    </Pressable>
  );
});

export default function AddStory() {
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const prefs = usePrefs();
  const { profile } = useSession();
  const goMode = useModeNav();
  const { width } = useWindowDimensions();
  const [access, setAccess] = useState<Access>('checking');
  const [assets, setAssets] = useState<MediaLibrary.Asset[]>([]);
  // The first page of the album has arrived (until then an empty grid means "still loading").
  const [loaded, setLoaded] = useState(false);
  const [album, setAlbum] = useState<MediaLibrary.Album | null>(null);
  const [albums, setAlbums] = useState<MediaLibrary.Album[] | null>(null);
  const [albumSheet, setAlbumSheet] = useState(false);
  const [mode, setMode] = useState<'single' | 'select' | 'collage'>('single');
  const [picked, setPicked] = useState<MediaLibrary.Asset[]>([]);
  const [busy, setBusy] = useState(false);
  // Set at once, so a second tap in the same instant can't open a second picker or a second editor.
  const busyRef = useRef(false);
  const opening = useRef(false);
  const cursor = useRef<string | undefined>(undefined);
  const more = useRef(true);
  const loading = useRef(false);
  const request = useRef(0);

  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  // Back on this screen (the editor closed without sharing): another photo can be opened.
  useFocusEffect(
    useCallback(() => {
      opening.current = false;
    }, []),
  );

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const go = useCallback(
    (kind: 'image' | 'video' | 'text' | 'collage' | 'batch', sources: StorySource[]) => {
      // The pickers can finish long after this screen was closed. Do not open the editor over something else.
      if (!alive.current || opening.current) return;
      opening.current = true;
      router.push({ pathname: '/story-editor', params: { kind, src: JSON.stringify(sources) } });
    },
    [router],
  );

  /** Runs one of the system pickers with the screen covered, so a second tap cannot open a second editor. */
  async function picking(run: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await run();
    } catch (e) {
      if (e instanceof CameraOffError) showCameraOff();
      else toast(errText(e));
    } finally {
      busyRef.current = false;
      if (alive.current) setBusy(false);
    }
  }

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
        const page = await MediaLibrary.getAssetsAsync({ first: PAGE, after: cursor.current, album: album ?? undefined, mediaType: ['photo', 'video'], sortBy: MediaLibrary.SortBy.creationTime });
        if (mine !== request.current || !alive.current) return;
        cursor.current = page.endCursor;
        more.current = page.hasNextPage;
        setAssets((cur) => {
          if (reset) return page.assets;
          const have = new Set(cur.map((c) => c.id));
          return [...cur, ...page.assets.filter((a) => !have.has(a.id))];
        });
      } catch (e) {
        if (mine === request.current && alive.current) toast(errText(e));
      } finally {
        if (mine === request.current) {
          loading.current = false;
          if (alive.current) setLoaded(true);
        }
      }
    },
    [album, toast],
  );

  const check = useCallback(async (ask: boolean) => {
    try {
      let p = await MediaLibrary.getPermissionsAsync();
      if (!p.granted && ask && p.canAskAgain) p = await MediaLibrary.requestPermissionsAsync();
      const next: Access = p.granted ? (p.accessPrivileges === 'limited' ? 'limited' : 'all') : 'none';
      if (alive.current) {
        // A few chosen photos have no albums (and the albums button goes): back to Recents, or the grid would be stuck in one.
        if (next === 'limited') setAlbum(null);
        setAccess(next);
      }
      return next;
    } catch {
      if (alive.current) setAccess('none');
      return 'none' as Access;
    }
  }, []);

  useEffect(() => {
    check(true);
  }, [check]);

  // Back from the Settings app: access may have been turned on (or narrowed) there.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') check(false);
    });
    return () => sub.remove();
  }, [check]);

  useEffect(() => {
    if (access !== 'all' && access !== 'limited') return;
    setLoaded(false);
    load(true);
    // The library tells us when photos are added, removed, or when the person changes which ones we may see.
    const sub = MediaLibrary.addListener(() => {
      load(true);
    });
    return () => sub.remove();
  }, [access, load]);

  async function openAlbums() {
    setAlbumSheet(true);
    if (albums) return;
    try {
      const list = await MediaLibrary.getAlbumsAsync({ includeSmartAlbums: true });
      if (alive.current) setAlbums(list.filter((a) => a.assetCount > 0 && !LIBRARY_ALBUM.test(a.title)).sort((a, b) => b.assetCount - a.assetCount));
    } catch {
      if (alive.current) setAlbums([]);
    }
  }

  async function manage() {
    try {
      await MediaLibrary.presentPermissionsPickerAsync();
    } catch (e) {
      toast(errText(e));
    }
  }

  const camera = () =>
    picking(async () => {
      const [shot] = await takePhoto({ front: prefs.frontCamera, video: true });
      if (!shot) return;
      if (shot.type === 'video') {
        const problem = videoProblem(shot.duration, shot.fileSize);
        if (problem) return toast(problem);
        go('video', [{ uri: shot.uri, type: 'video', w: shot.width, h: shot.height, duration: (shot.duration ?? 0) / 1000 }]);
      } else go('image', [{ uri: shot.uri, type: 'image', w: shot.width, h: shot.height }]);
    });

  const video = () =>
    picking(async () => {
      const v = await pickVideo();
      if (!v) return;
      const problem = videoProblem(v.duration, v.fileSize);
      if (problem) return toast(problem);
      go('video', [{ uri: v.uri, type: 'video', w: v.width, h: v.height, duration: (v.duration ?? 0) / 1000 }]);
    });

  /** Used when the library is off limits: the system chooser needs no permission. */
  const systemPicker = () =>
    picking(async () => {
      const list = await pickFromLibrary({ multiple: true, limit: 10 });
      if (!list.length) return;
      const sources: StorySource[] = list.map((a) => ({ uri: a.uri, type: 'image', w: a.width, h: a.height }));
      go(sources.length > 1 ? 'batch' : 'image', sources);
    });

  async function open(asset: MediaLibrary.Asset) {
    if (busyRef.current) return;
    if (asset.mediaType !== 'video') {
      go('image', [{ uri: asset.uri, type: 'image', w: asset.width, h: asset.height }]);
      return;
    }
    if (asset.duration > 60.5) {
      toast('Videos can be up to 60 seconds. Trim it in Photos first.');
      return;
    }
    busyRef.current = true;
    setBusy(true);
    let copy: File | null = null;
    try {
      // Copy the video out of the photo library into this app's own space first. That also fetches it
      // from iCloud when it is not on the phone, and gives the editor a file it is allowed to read.
      const ext = /\.mp4$/i.test(asset.filename) ? 'mp4' : 'mov';
      copy = new File(Paths.cache, `story-${Date.now()}.${ext}`);
      await copyAsync({ from: asset.uri, to: copy.uri });
      if ((copy.size ?? 0) > 48 * 1024 * 1024) throw new Error('That video is too large to share as it is. Use the Video button above, which makes it smaller.');
      go('video', [{ uri: copy.uri, type: 'video', w: asset.width, h: asset.height, duration: asset.duration, poster: asset.uri }]);
    } catch (e) {
      try {
        if (copy?.exists) copy.delete();
      } catch {
        // nothing to clean up
      }
      const text = errText(e);
      toast(/too large/.test(text) ? text : 'That video could not be opened. Use the Video button above instead.');
    } finally {
      busyRef.current = false;
      if (alive.current) setBusy(false);
    }
  }

  function toggle(asset: MediaLibrary.Asset) {
    if (asset.mediaType === 'video') {
      toast(mode === 'collage' ? 'Collages are made from photos.' : 'Choose photos here. To share a video, tap it on its own.');
      return;
    }
    const limit = mode === 'collage' ? 4 : 10;
    setPicked((cur) => {
      if (cur.some((a) => a.id === asset.id)) return cur.filter((a) => a.id !== asset.id);
      if (cur.length >= limit) {
        toast(mode === 'collage' ? 'A collage holds up to 4 photos.' : 'You can share up to 10 at once.');
        return cur;
      }
      return [...cur, asset];
    });
  }

  function next() {
    const sources: StorySource[] = picked.map((a) => ({ uri: a.uri, type: 'image', w: a.width, h: a.height }));
    if (mode === 'collage') {
      if (sources.length < 2) return toast('Choose at least 2 photos for a collage.');
      go('collage', sources);
    } else if (sources.length === 1) go('image', sources);
    else if (sources.length > 1) go('batch', sources);
  }

  function setModeTo(m: 'single' | 'select' | 'collage') {
    setMode(m);
    setPicked([]);
  }

  const gap = 2;
  const cw = Math.floor((width - gap * 2) / 3);
  const ch = Math.round((cw * 16) / 9);
  const choosing = mode !== 'single';
  const cells = useMemo<Cell[]>(() => [...(mode === 'single' ? [CAMERA] : []), ...assets.map((a) => ({ key: a.id, asset: a }))], [mode, assets]);
  const orderOf = useMemo(() => new Map(picked.map((p, i) => [p.id, i])), [picked]);

  // A tile keeps one handler for good; it reaches whatever a tap means now.
  const tapRef = useRef<(a: MediaLibrary.Asset) => void>(() => {});
  tapRef.current = (a) => (choosing ? toggle(a) : open(a));
  const onTile = useCallback((a: MediaLibrary.Asset) => tapRef.current(a), []);
  const cameraRef = useRef(camera);
  cameraRef.current = camera;
  const onCamera = useCallback(() => cameraRef.current(), []);

  // Every row is the same height, so the grid never measures one. Rows sit under the header, measured once drawn.
  const [headH, setHeadH] = useState(0);
  const row = ch + gap;
  const getItemLayout = useCallback((_: unknown, index: number) => ({ length: row, offset: headH + row * index, index }), [row, headH]);
  const Separator = useCallback(() => <View style={{ height: gap }} />, []);

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<Cell>) => {
      const a = item.asset;
      if (!a) {
        return (
          <Pressable onPress={onCamera} accessibilityRole="button" accessibilityLabel="Open camera" style={({ pressed }) => ({ width: cw, height: ch, backgroundColor: '#1e1e1e', alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
            <Icon name="camerafill" size={32} color="#fff" ink="#1e1e1e" />
          </Pressable>
        );
      }
      return <StoryTile asset={a} w={cw} h={ch} choosing={choosing} order={orderOf.get(a.id) ?? -1} onPress={onTile} />;
    },
    [cw, ch, choosing, orderOf, onTile, onCamera],
  );

  const top = (
    <View onLayout={(e) => { const h = e.nativeEvent.layout.height; setHeadH((cur) => (Math.abs(cur - h) > 0.5 ? h : cur)); }}>
      {mode === 'single' ? (
        <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 18 }}>
          <Tile icon="compose" label="Text" colors={['#4a5df6', '#b13df0']} onPress={() => go('text', [])} />
          <Tile icon="video" label="Video" colors={['#ff7a3d', '#ff3d77']} onPress={video} />
          <Tile icon="collage" label="Collage" colors={['#0fb58a', '#0a6cf0']} onPress={() => (access === 'none' ? toast('Allow photo access to make a collage.') : setModeTo('collage'))} />
        </View>
      ) : (
        <View style={{ height: 8 }} />
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12 }}>
        <Pressable onPress={openAlbums} disabled={access !== 'all'} hitSlop={8} accessibilityRole="button" accessibilityLabel={access === 'all' ? `${album?.title ?? 'Recents'}, ${t('createFlow.albums')}` : 'Recents'} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1, marginRight: 12, opacity: pressed ? 0.6 : 1 })}>
          <Text numberOfLines={1} style={{ color: '#fff', fontSize: 20, fontWeight: '700', flexShrink: 1 }}>{album?.title ?? 'Recents'}</Text>
          {access === 'all' ? <Icon name="down" size={18} color="#fff" weight={2.4} /> : null}
        </Pressable>
        <Pressable onPress={() => setModeTo(choosing ? 'single' : 'select')} disabled={access === 'none' || access === 'checking'} accessibilityRole="button" accessibilityLabel={choosing ? 'Stop selecting' : 'Select several photos'} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 7, height: 32, paddingHorizontal: 12, borderRadius: 16, backgroundColor: choosing ? '#fff' : '#26282c', opacity: access === 'none' ? 0.4 : pressed ? 0.7 : 1 })}>
          <Icon name={choosing ? 'close' : 'select'} size={16} color={choosing ? '#000' : '#fff'} weight={2.2} />
          <Text style={{ color: choosing ? '#000' : '#fff', fontWeight: '600', fontSize: 15 }}>{choosing ? 'Cancel' : 'Select'}</Text>
        </Pressable>
      </View>
      {access === 'limited' ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 16, paddingBottom: 14 }}>
          <Text style={{ flex: 1, color: DARK.fg2, fontSize: 14.5, lineHeight: 19 }}>You've given Community access to a select number of photos and videos.</Text>
          <Pressable onPress={manage} hitSlop={8} accessibilityRole="button" accessibilityLabel="Manage which photos Community can see" style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Manage</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );

  // Ghost buttons on this always-dark screen keep dark colours in the White theme too.
  const darkGhost = { backgroundColor: DARK.surface2, alignSelf: 'stretch' as const };

  return (
    <View style={{ flex: 1, backgroundColor: '#000', paddingTop: insets.top }}>
      <DarkStatusBar />
      <View style={{ height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 }}>
        <IconButton name="close" size={28} label="Close" color="#fff" onPress={close} />
        <Text accessibilityRole="header" numberOfLines={1} style={{ flex: 1, color: '#fff', fontSize: 20, fontWeight: '700', textAlign: 'center' }}>{mode === 'collage' ? 'Collage' : 'Add to story'}</Text>
        <IconButton name="settings" size={26} label="Camera settings" color="#fff" onPress={() => router.push('/camera-settings')} />
      </View>

      {access === 'checking' ? (
        <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator color={DARK.fg2} /></View>
      ) : access === 'none' ? (
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}>
          {top}
          <View style={{ padding: 28, alignItems: 'center', gap: 12 }}>
            <Icon name="image" size={44} color={DARK.fg2} />
            <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700', textAlign: 'center' }}>See your photos here</Text>
            <Button label={t('createFlow.openSettings')} onPress={() => Linking.openSettings().catch(() => {})} style={{ alignSelf: 'stretch', marginTop: 4 }} />
            <Button label="Choose photos" kind="ghost" onPress={systemPicker} style={darkGhost} textColor={DARK.fg} />
            <Button label="Open camera" kind="ghost" onPress={camera} style={darkGhost} textColor={DARK.fg} />
          </View>
        </ScrollView>
      ) : (
        <FlatList
          data={cells}
          keyExtractor={(c) => c.key}
          numColumns={3}
          columnWrapperStyle={{ gap }}
          ItemSeparatorComponent={Separator}
          ListHeaderComponent={top}
          ListFooterComponent={assets.length ? null : loaded ? <Text style={{ color: DARK.fg2, textAlign: 'center', padding: 32 }}>No photos here yet.</Text> : <DarkLoading />}
          onEndReached={() => load(false)}
          onEndReachedThreshold={1.2}
          contentContainerStyle={{ paddingBottom: insets.bottom + (choosing ? 90 : 72) }}
          showsVerticalScrollIndicator={false}
          getItemLayout={headH ? getItemLayout : undefined}
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          windowSize={7}
          renderItem={renderItem}
        />
      )}

      {/* POST · STORY · SHORTS · LIVE, while not choosing several. */}
      {!choosing ? (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 6, paddingBottom: insets.bottom + 6, backgroundColor: 'rgba(0,0,0,0.92)' }}>
          <ModeSwitcher mode="story" onMode={goMode} canLive={profile?.restricted !== true} disabled={busy} />
        </View>
      ) : null}
      {choosing ? (
        <View style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + 12 }}>
          <Button label={picked.length ? `Next (${picked.length})` : 'Next'} disabled={mode === 'collage' ? picked.length < 2 : picked.length < 1} onPress={next} />
        </View>
      ) : null}
      {busy ? (
        <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color="#fff" />
        </View>
      ) : null}

      <Sheet visible={albumSheet} onClose={() => setAlbumSheet(false)} title={t('createFlow.albums')} tall>
        <ScrollView>
          <Pressable onPress={() => { setAlbum(null); setAlbumSheet(false); }} accessibilityRole="radio" accessibilityState={{ checked: !album }} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, minHeight: 50, backgroundColor: pressed ? C.press : 'transparent' })}>
            <Text style={{ flex: 1, color: C.fg, fontSize: 17, fontWeight: album ? '400' : '700' }}>Recents</Text>
            {!album ? <Icon name="check" size={20} color={C.accent2} /> : null}
          </Pressable>
          {albums === null ? (
            <ActivityIndicator color={C.fg2} style={{ padding: 24 }} />
          ) : (
            albums.map((a) => (
              <Pressable key={a.id} onPress={() => { setAlbum(a); setAlbumSheet(false); }} accessibilityRole="radio" accessibilityState={{ checked: album?.id === a.id }} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, minHeight: 50, backgroundColor: pressed ? C.press : 'transparent' })}>
                <Text numberOfLines={1} style={{ flex: 1, color: C.fg, fontSize: 17, fontWeight: album?.id === a.id ? '700' : '400' }}>{a.title}</Text>
                <Text style={{ color: C.fg2 }}>{a.assetCount}</Text>
                {album?.id === a.id ? <Icon name="check" size={20} color={C.accent2} /> : null}
              </Pressable>
            ))
          )}
        </ScrollView>
      </Sheet>
    </View>
  );
}
