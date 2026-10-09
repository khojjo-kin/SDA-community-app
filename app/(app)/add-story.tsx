import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Linking, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { File, Paths } from 'expo-file-system';
import { copyAsync } from 'expo-file-system/legacy';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as MediaLibrary from 'expo-media-library';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, IconName } from '../../src/components/Icon';
import { Button, IconButton, Sheet, useToast } from '../../src/components/ui';
import { pickFromLibrary, pickVideo, takePhoto, videoProblem } from '../../src/lib/pick';
import { usePrefs } from '../../src/lib/prefs';
import { C, clock, errText } from '../../src/lib/theme';

/** What the story editor is handed: one or more things to share. */
export type StorySource = { uri: string; type: 'image' | 'video'; w: number; h: number; duration?: number; poster?: string };

type Cell = { key: string; asset?: MediaLibrary.Asset };
type Access = 'checking' | 'all' | 'limited' | 'none';
const PAGE = 60;

function Tile({ icon, label, colors, onPress }: { icon: IconName; label: string; colors: readonly [string, string]; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => ({ flex: 1, height: 100, borderRadius: 14, backgroundColor: '#1e1e1e', borderWidth: 1, borderColor: '#2a2a2a', alignItems: 'center', justifyContent: 'center', gap: 9, opacity: pressed ? 0.7 : 1 })}>
      <LinearGradient colors={[colors[0], colors[1]]} start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }} style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={22} color="#fff" weight={2.2} />
      </LinearGradient>
      <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}

export default function AddStory() {
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const prefs = usePrefs();
  const { width } = useWindowDimensions();
  const [access, setAccess] = useState<Access>('checking');
  const [assets, setAssets] = useState<MediaLibrary.Asset[]>([]);
  const [album, setAlbum] = useState<MediaLibrary.Album | null>(null);
  const [albums, setAlbums] = useState<MediaLibrary.Album[] | null>(null);
  const [albumSheet, setAlbumSheet] = useState(false);
  const [mode, setMode] = useState<'single' | 'select' | 'collage'>('single');
  const [picked, setPicked] = useState<MediaLibrary.Asset[]>([]);
  const [busy, setBusy] = useState(false);
  const cursor = useRef<string | undefined>(undefined);
  const more = useRef(true);
  const loading = useRef(false);
  const request = useRef(0);

  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const go = useCallback(
    (kind: 'image' | 'video' | 'text' | 'collage' | 'batch', sources: StorySource[]) => {
      // The pickers can finish long after this screen was closed. Do not open the editor over something else.
      if (!alive.current) return;
      router.push({ pathname: '/story-editor', params: { kind, src: JSON.stringify(sources) } });
    },
    [router],
  );

  /** Runs one of the system pickers with the screen covered, so a second tap cannot open a second editor. */
  async function picking(run: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      await run();
    } catch (e) {
      toast(errText(e));
    } finally {
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
    [album, toast],
  );

  const check = useCallback(async (ask: boolean) => {
    try {
      let p = await MediaLibrary.getPermissionsAsync();
      if (!p.granted && ask && p.canAskAgain) p = await MediaLibrary.requestPermissionsAsync();
      const next: Access = p.granted ? (p.accessPrivileges === 'limited' ? 'limited' : 'all') : 'none';
      setAccess(next);
      return next;
    } catch {
      setAccess('none');
      return 'none' as Access;
    }
  }, []);

  useEffect(() => {
    check(true);
  }, [check]);

  useEffect(() => {
    if (access !== 'all' && access !== 'limited') return;
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
      setAlbums(list.filter((a) => a.assetCount > 0).sort((a, b) => b.assetCount - a.assetCount));
    } catch {
      setAlbums([]);
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
    if (busy) return;
    if (asset.mediaType !== 'video') {
      go('image', [{ uri: asset.uri, type: 'image', w: asset.width, h: asset.height }]);
      return;
    }
    if (asset.duration > 60.5) {
      toast('Videos can be up to 60 seconds. Trim it in Photos first.');
      return;
    }
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
  const cells: Cell[] = [...(mode === 'single' ? [{ key: 'camera' }] : []), ...assets.map((a) => ({ key: a.id, asset: a }))];
  const choosing = mode !== 'single';

  const top = (
    <View>
      {mode === 'single' ? (
        <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 18 }}>
          <Tile icon="compose" label="Text" colors={['#4a5df6', '#b13df0']} onPress={() => go('text', [])} />
          <Tile icon="video" label="Video" colors={['#ff7a3d', '#ff3d77']} onPress={video} />
          <Tile icon="collage" label="Collage" colors={['#0fb58a', '#0a6cf0']} onPress={() => (access === 'none' ? toast('Allow photo access to make a collage.') : setModeTo('collage'))} />
        </View>
      ) : (
        <Text style={{ color: C.fg2, paddingHorizontal: 16, paddingBottom: 14, lineHeight: 20 }}>{mode === 'collage' ? 'Choose 2 to 4 photos. They are arranged into one story.' : 'Choose up to 10 photos. Each one becomes its own story.'}</Text>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12 }}>
        <Pressable onPress={openAlbums} disabled={access !== 'all'} accessibilityRole="button" accessibilityLabel={access === 'all' ? `Album: ${album?.title ?? 'Recents'}. Change album` : 'Recents'} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 }}>
          <Text numberOfLines={1} style={{ color: '#fff', fontSize: 20, fontWeight: '700', flexShrink: 1 }}>{album?.title ?? 'Recents'}</Text>
          {access === 'all' ? <Icon name="down" size={18} color="#fff" weight={2.4} /> : null}
        </Pressable>
        <Pressable onPress={() => setModeTo(choosing ? 'single' : 'select')} disabled={access === 'none' || access === 'checking'} accessibilityRole="button" accessibilityLabel={choosing ? 'Stop selecting' : 'Select several photos'} style={{ flexDirection: 'row', alignItems: 'center', gap: 7, height: 32, paddingHorizontal: 12, borderRadius: 16, backgroundColor: choosing ? '#fff' : '#26282c' }}>
          <Icon name={choosing ? 'close' : 'select'} size={16} color={choosing ? '#000' : '#fff'} weight={2.2} />
          <Text style={{ color: choosing ? '#000' : '#fff', fontWeight: '600', fontSize: 15 }}>{choosing ? 'Cancel' : 'Select'}</Text>
        </Pressable>
      </View>
      {access === 'limited' ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 16, paddingBottom: 14 }}>
          <Text style={{ flex: 1, color: C.fg2, fontSize: 14.5, lineHeight: 19 }}>You've given Community access to a select number of photos and videos.</Text>
          <Pressable onPress={manage} hitSlop={8} accessibilityRole="button">
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Manage</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: '#000', paddingTop: insets.top }}>
      <View style={{ height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 }}>
        <IconButton name="close" size={28} label="Close" color="#fff" onPress={close} />
        <Text accessibilityRole="header" style={{ flex: 1, color: '#fff', fontSize: 20, fontWeight: '700', textAlign: 'center' }}>{mode === 'collage' ? 'Collage' : 'Add to story'}</Text>
        <IconButton name="settings" size={26} label="Camera settings" color="#fff" onPress={() => router.push('/camera-settings')} />
      </View>

      {access === 'checking' ? (
        <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator color={C.fg2} /></View>
      ) : access === 'none' ? (
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          {top}
          <View style={{ padding: 28, alignItems: 'center', gap: 12 }}>
            <Icon name="image" size={44} color={C.fg2} />
            <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700', textAlign: 'center' }}>See your photos here</Text>
            <Text style={{ color: C.fg2, textAlign: 'center', lineHeight: 20 }}>Community can't see your photo library yet. Allow access in Settings, or choose photos with the system picker.</Text>
            <Button label="Open Settings" onPress={() => Linking.openSettings().catch(() => {})} style={{ alignSelf: 'stretch' }} />
            <Button label="Choose photos" kind="ghost" onPress={systemPicker} style={{ alignSelf: 'stretch' }} />
            <Button label="Open camera" kind="ghost" onPress={camera} style={{ alignSelf: 'stretch' }} />
          </View>
        </ScrollView>
      ) : (
        <FlatList
          data={cells}
          keyExtractor={(c) => c.key}
          numColumns={3}
          columnWrapperStyle={{ gap }}
          ItemSeparatorComponent={() => <View style={{ height: gap }} />}
          ListHeaderComponent={top}
          ListEmptyComponent={<Text style={{ color: C.fg2, textAlign: 'center', padding: 32 }}>No photos here yet.</Text>}
          onEndReached={() => load(false)}
          onEndReachedThreshold={1.2}
          contentContainerStyle={{ paddingBottom: insets.bottom + (choosing ? 90 : 24) }}
          showsVerticalScrollIndicator={false}
          initialNumToRender={12}
          windowSize={7}
          renderItem={({ item }) => {
            const a = item.asset;
            if (!a) {
              return (
                <Pressable onPress={camera} accessibilityRole="button" accessibilityLabel="Open camera" style={{ width: cw, height: ch, backgroundColor: '#1e1e1e', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="camerafill" size={32} color="#fff" ink="#1e1e1e" />
                </Pressable>
              );
            }
            const order = picked.findIndex((p) => p.id === a.id);
            return (
              <Pressable onPress={() => (choosing ? toggle(a) : open(a))} accessibilityRole="button" accessibilityLabel={a.mediaType === 'video' ? `Video, ${clock(a.duration)}` : 'Photo'} accessibilityState={choosing ? { selected: order >= 0 } : undefined} style={{ width: cw, height: ch, backgroundColor: '#111' }}>
                <Image source={{ uri: a.uri }} recyclingKey={a.id} style={{ width: cw, height: ch, opacity: choosing && a.mediaType === 'video' ? 0.35 : 1 }} contentFit="cover" />
                {a.mediaType === 'video' ? <Text style={{ position: 'absolute', right: 7, bottom: 6, color: '#fff', fontWeight: '700', fontSize: 14, textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 3, textShadowOffset: { width: 0, height: 1 } }}>{clock(a.duration)}</Text> : null}
                {choosing && a.mediaType !== 'video' ? (
                  <View style={{ position: 'absolute', top: 7, right: 7, width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: '#fff', backgroundColor: order >= 0 ? C.accent : 'rgba(0,0,0,0.25)', alignItems: 'center', justifyContent: 'center' }}>
                    {order >= 0 ? <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>{order + 1}</Text> : null}
                  </View>
                ) : null}
              </Pressable>
            );
          }}
        />
      )}

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

      <Sheet visible={albumSheet} onClose={() => setAlbumSheet(false)} title="Albums" tall>
        <ScrollView>
          <Pressable onPress={() => { setAlbum(null); setAlbumSheet(false); }} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, minHeight: 50 }}>
            <Text style={{ flex: 1, color: C.fg, fontSize: 17, fontWeight: album ? '400' : '700' }}>Recents</Text>
            {!album ? <Icon name="check" size={20} color={C.accent2} /> : null}
          </Pressable>
          {albums === null ? (
            <ActivityIndicator color={C.fg2} style={{ padding: 24 }} />
          ) : (
            albums.map((a) => (
              <Pressable key={a.id} onPress={() => { setAlbum(a); setAlbumSheet(false); }} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, minHeight: 50 }}>
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
