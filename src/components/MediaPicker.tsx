import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, FlatList, Linking, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import type { ListRenderItemInfo } from 'react-native';
import { File, Paths } from 'expo-file-system';
import { copyAsync } from 'expo-file-system/legacy';
import { Image } from 'expo-image';
import * as MediaLibrary from 'expo-media-library';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useT } from '../lib/i18n';
import { getCachedLibrary, invalidateLibrary, isRecents, libraryPage, LibraryPage, LibrarySource, refreshLibrary } from '../lib/library';
import { CameraOffError, Picked, pickFromLibrary, pickVideo, showCameraOff, takePhoto, videoProblem } from '../lib/pick';
import { usePrefs } from '../lib/prefs';
import { useSession } from '../lib/session';
import { C, clock, DARK, errText } from '../lib/theme';
import { Icon } from './Icon';
import { CreateMode, ModeSwitcher } from './ModeSwitcher';
import { DarkEmpty, DarkLoading } from './OnDark';
import { Button, RoundButton, Sheet, useToast } from './ui';

/** iPhone's own whole-library album: the Recents row at the top already is that, so it isn't listed twice. */
const LIBRARY_ALBUM = /^(recents|recent|all photos|camera roll)$/i;

/**
 * What the picker is choosing for. POST is one to ten photos and videos; SHORTS is one video. STORY
 * and LIVE, beside them in the mode switcher, have screens of their own.
 */
export type PickMode = 'post' | 'shorts';

/** One chosen photo or video, as a file the uploader can read. `duration` is in seconds. */
export type PickedItem = { uri: string; type: 'image' | 'video'; w: number; h: number; duration?: number; bytes?: number };

type Cell = { key: string; asset?: MediaLibrary.Asset };
type Access = 'checking' | 'all' | 'limited' | 'none';
type Page = { assets: MediaLibrary.Asset[]; endCursor: string; hasNextPage: boolean };

const LIMIT = 10;
const CAMERA_ONLY: Cell[] = [{ key: 'camera' }];

const isVideo = (a: MediaLibrary.Asset) => a.mediaType === 'video';

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

/** What a source shows at once, from the page loaded ahead of time (Recents only). */
function startFor(source: LibrarySource, page: LibraryPage | null): MediaLibrary.Asset[] {
  if (!page || source.album) return [];
  return source.videoOnly ? page.assets.filter(isVideo) : page.assets;
}

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
 * long grid. The thumbnail is drawn straight from the library address, at the tile's size: no asset
 * info is fetched until Next. A video too long to share is dimmed.
 */
const Tile = memo(function Tile({ asset: a, size, isCurrent, order, multi, onPress }: TileProps) {
  const video = a.mediaType === 'video';
  const long = video && tooLong(a);
  return (
    <Pressable onPress={() => onPress(a)} accessibilityRole="button" accessibilityLabel={video ? `Video, ${clock(a.duration)}` : 'Photo'} accessibilityState={{ selected: isCurrent || order >= 0, disabled: long }} style={({ pressed }) => ({ width: size, height: size, backgroundColor: '#111', opacity: pressed ? 0.8 : 1 })}>
      <Image source={{ uri: a.uri }} recyclingKey={a.id} cachePolicy="memory" transition={60} style={{ width: size, height: size, opacity: long ? 0.4 : 1 }} contentFit="cover" />
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
 * one in the preview, then refreshes the grid behind. Shorts page through videos only, so a library
 * of mostly photos still fills the grid; Recents opens the albums.
 */
// Memoised: it stays mounted under the editor and the share step, and need not redraw while a caption is typed.
export const MediaPicker = memo(function MediaPicker({ mode, onMode, onNext, onClose }: { mode: PickMode; onMode: (m: CreateMode) => void; onNext: (items: PickedItem[]) => void; onClose: () => void }) {
  const toast = useToast();
  const t = useT();
  const insets = useSafeAreaInsets();
  const shorts = mode === 'shorts';
  const prefs = usePrefs();
  const { profile } = useSession();
  // Members under 14 can't go live, so the choice isn't offered.
  const canLive = profile?.restricted !== true;
  const { width } = useWindowDimensions();

  // What the grid pages through: everything, or (Shorts) videos only; Recents, or one album.
  const [album, setAlbum] = useState<MediaLibrary.Album | null>(null);
  const [albums, setAlbums] = useState<MediaLibrary.Album[] | null>(null);
  const [albumSheet, setAlbumSheet] = useState(false);
  const albumId = album?.id ?? null;
  const source = useMemo<LibrarySource>(() => ({ videoOnly: shorts, album: albumId }), [shorts, albumId]);
  const sourceRef = useRef(source);
  sourceRef.current = source;

  // The newest page loaded ahead of time, if there is one: it is on screen from the first frame.
  const [seed] = useState<LibraryPage | null>(getCachedLibrary);
  const [start] = useState(() => startFor({ videoOnly: shorts }, seed));
  const [access, setAccess] = useState<Access>(seed ? seed.access : 'checking');
  const accessRef = useRef(access);
  accessRef.current = access;
  const [canAsk, setCanAsk] = useState(true);
  const [assets, setAssets] = useState<MediaLibrary.Asset[]>(start);
  // The grid holds a whole first page of its source (until then an empty grid means "still loading").
  const [loaded, setLoaded] = useState(!!seed && !shorts);
  // What the preview shows, and (when selecting several) the photos in the order they were tapped.
  const [current, setCurrent] = useState<MediaLibrary.Asset | null>(() => start.find((a) => !tooLong(a)) ?? null);
  const [picked, setPicked] = useState<MediaLibrary.Asset[]>([]);
  const [multi, setMulti] = useState(false);
  const [busy, setBusy] = useState('');
  // Set at once, so a second tap in the same moment can't start a second picker or a second Next.
  const busyRef = useRef(false);
  // The grid's photos as last set, for merging without waiting for a render.
  const shown = useRef<MediaLibrary.Asset[]>(start);
  // The page loaded ahead of time is Recents; a Shorts grid starts its own paging.
  const cursor = useRef<string | undefined>(seed && !shorts ? seed.endCursor : undefined);
  const more = useRef(seed && !shorts ? seed.hasNextPage : true);
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
      const page = await libraryPage(cursor.current, sourceRef.current);
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
   * The newest page of the source, fresh from the library. It replaces the grid, unless further
   * pages have been added by then: it is merged in front of them instead. `restart` (the library
   * changed) always starts the grid again.
   */
  const refresh = useCallback(
    async (restart: boolean) => {
      const mine = ++fresh.current;
      const src = sourceRef.current;
      if (restart) {
        request.current++;
        loading.current = false;
        invalidateLibrary();
      }
      let page: Page | null;
      try {
        // Recents is shared with the page kept ahead of time; other sources load on their own.
        page = isRecents(src) ? await refreshLibrary() : await libraryPage(undefined, src);
      } catch (e) {
        if (mine !== fresh.current || !alive.current) return;
        // Quiet while photos are on screen already: they are only a little old.
        if (!shown.current.length) toast(errText(e));
        setLoaded(true);
        return;
      }
      if (mine !== fresh.current || !alive.current) return;
      if (!page) {
        // Access went away while loading; check() says so.
        setLoaded(true);
        return;
      }
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
      setLoaded(true);
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
    setLoaded(false);
    setCurrent(null);
    setPicked([]);
    setAlbum(null);
    setAlbums(null);
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
        if (!p.granted && accessRef.current !== 'none') forget();
        // A few chosen photos have no albums (and the albums button goes): back to Recents, or the grid would be stuck in one.
        if (p.granted && p.accessPrivileges === 'limited') setAlbum(null);
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

  // Back from the Settings app (or the system's own prompt): the answer may have changed.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') check('never');
    });
    return () => sub.remove();
  }, [check]);

  useEffect(() => {
    if (access !== 'all' && access !== 'limited') return;
    refresh(false);
    // The library says when photos are added or removed, or when the person changes which ones we may see.
    const sub = MediaLibrary.addListener(() => {
      refresh(true);
    });
    return () => sub.remove();
  }, [access, refresh]);

  // A new source starts the grid again: what is known of it at once, the rest from the library. A
  // new mode is also a new choice (one video for a short, nothing carried over from the other); a
  // new album keeps what is chosen.
  const firstSource = useRef(true);
  const lastShorts = useRef(shorts);
  useEffect(() => {
    if (firstSource.current) {
      firstSource.current = false;
      return;
    }
    request.current++;
    fresh.current++;
    loading.current = false;
    extended.current = false;
    const cached = getCachedLibrary();
    const recents = isRecents(source) && !!cached;
    cursor.current = recents ? cached!.endCursor : undefined;
    more.current = recents ? cached!.hasNextPage : true;
    const first = startFor(source, cached);
    show(first);
    setLoaded(recents);
    if (lastShorts.current !== !!source.videoOnly) {
      lastShorts.current = !!source.videoOnly;
      touched.current = false;
      setMulti(false);
      setPicked([]);
      setCurrent(first.find((a) => !tooLong(a)) ?? null);
    }
    if (accessRef.current === 'all' || accessRef.current === 'limited') refresh(false);
  }, [source, show, refresh]);

  // Shorts are made from one video, so only videos are offered.
  const offered = useMemo(() => (shorts ? assets.filter(isVideo) : assets), [assets, shorts]);

  // Keep something in the preview as photos arrive.
  useEffect(() => {
    // A preview nobody chose (from the page loaded ahead of time) moves on if that photo has gone since.
    setCurrent((cur) => (cur && (touched.current || offered.some((a) => a.id === cur.id)) ? cur : offered.find((a) => !tooLong(a)) ?? null));
  }, [offered]);

  /** Runs a system picker or the camera with the screen covered, so a second tap cannot open a second one. */
  async function run(work: () => Promise<void>, note = '') {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(note || 'One moment…');
    try {
      await work();
    } catch (e) {
      if (e instanceof CameraOffError) showCameraOff();
      else toast(errText(e));
    } finally {
      busyRef.current = false;
      if (alive.current) setBusy('');
    }
  }

  /** A photo or video from the camera or the system chooser, as the editor takes it. Its duration arrives in milliseconds. */
  const asItem = (a: Picked): PickedItem =>
    a.type === 'video'
      ? { uri: a.uri, type: 'video', w: a.width, h: a.height, duration: (a.duration ?? 0) / 1000, bytes: a.fileSize ?? undefined }
      : { uri: a.uri, type: 'image', w: a.width, h: a.height };

  // A photo or a video: a video shared on its own becomes a clip.
  const camera = () =>
    run(async () => {
      const [shot] = await takePhoto({ front: prefs.frontCamera, video: true, videoOnly: shorts });
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
      if (shorts) {
        const v = await pickVideo();
        if (!v || !alive.current) return;
        const problem = videoProblem(v.duration, v.fileSize);
        if (problem) return toast(problem);
        onNext([asItem(v)]);
        return;
      }
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

  async function openAlbums() {
    if (busyRef.current) return;
    setAlbumSheet(true);
    if (albums) return;
    try {
      const list = await MediaLibrary.getAlbumsAsync({ includeSmartAlbums: true });
      if (alive.current) setAlbums(list.filter((a) => a.assetCount > 0 && !LIBRARY_ALBUM.test(a.title)).sort((a, b) => b.assetCount - a.assetCount));
    } catch {
      if (alive.current) setAlbums([]);
    }
  }

  function chooseAlbum(a: MediaLibrary.Album | null) {
    setAlbumSheet(false);
    setAlbum(a);
  }

  function tap(a: MediaLibrary.Asset) {
    if (busyRef.current) return;
    // Said straight away rather than at Next: the library already knows how long a video is.
    if (tooLong(a)) {
      toast(videoProblem(a.duration * 1000, 0) ?? '');
      return;
    }
    touched.current = true;
    const inView = current?.id === a.id;
    setCurrent(a);
    if (!multi) {
      setPicked([a]);
      return;
    }
    setPicked((cur) => {
      // A chosen one that isn't in the preview just comes into view; tapped again there, it is unchosen.
      if (cur.some((p) => p.id === a.id)) return inView ? cur.filter((p) => p.id !== a.id) : cur;
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
  const cameraRef = useRef(camera);
  cameraRef.current = camera;
  const onCamera = useCallback(() => cameraRef.current(), []);

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
  const noAccess = access === 'none';
  const cells = useMemo<Cell[]>(() => [...CAMERA_ONLY, ...offered.map((a) => ({ key: a.id, asset: a }))], [offered]);
  // Where each selected photo sits in the order, looked up once per tap rather than once per tile.
  const orderOf = useMemo(() => new Map(picked.map((p, i) => [p.id, i])), [picked]);
  const currentId = current?.id ?? null;
  // Every row of tiles is the same height, so the grid never has to measure one. Rows sit under the
  // header, whose height is measured once it is drawn.
  const [headH, setHeadH] = useState(previewH + 52);
  const row = cw + gap;
  const getItemLayout = useCallback((_: unknown, index: number) => ({ length: row, offset: headH + row * index, index }), [row, headH]);
  const extraData = useMemo(() => [currentId, orderOf, multi], [currentId, orderOf, multi]);
  const Separator = useCallback(() => <View style={{ height: gap }} />, []);

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<Cell>) => {
      const a = item.asset;
      if (!a) {
        return (
          <Pressable onPress={onCamera} accessibilityRole="button" accessibilityLabel={shorts ? t('createFlow.recordVideo') : 'Take a photo or video'} style={({ pressed }) => ({ width: cw, height: cw, backgroundColor: '#1c1e22', alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
            <Icon name={shorts ? 'video' : 'camera'} size={30} color="#fff" />
          </Pressable>
        );
      }
      return <Tile asset={a} size={cw} isCurrent={currentId === a.id} order={multi ? orderOf.get(a.id) ?? -1 : -1} multi={multi} onPress={onTile} />;
    },
    [cw, currentId, multi, orderOf, onTile, onCamera, shorts, t],
  );

  const albumTitle = album?.title ?? t('createFlow.recents');
  const header = (
    <View onLayout={(e) => { const h = e.nativeEvent.layout.height; setHeadH((cur) => (Math.abs(cur - h) > 0.5 ? h : cur)); }}>
      <View style={{ width, height: previewH, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }} accessible accessibilityLabel={current ? (current.mediaType === 'video' ? `Chosen video, ${clock(current.duration)}` : 'Chosen photo') : 'Nothing chosen yet'}>
        {current ? <Image source={{ uri: current.uri }} style={StyleSheet.absoluteFill} contentFit="contain" transition={80} /> : null}
        {current?.mediaType === 'video' ? (
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="play" size={32} color="#fff" />
          </View>
        ) : null}
        {!current && (loaded || noAccess) ? (
          <View style={{ alignItems: 'center', gap: 10, paddingHorizontal: 32 }}>
            <Icon name={shorts ? 'reels' : 'image'} size={44} color={DARK.fg3} />
            <Text style={{ color: DARK.fg2, textAlign: 'center', lineHeight: 20 }}>{shorts ? t('createFlow.chooseVideo') : t('createFlow.choosePhotos')}</Text>
          </View>
        ) : null}
        {multi && picked.length ? (
          <View style={{ position: 'absolute', top: 12, right: 12, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 13, backgroundColor: 'rgba(10,12,14,0.72)' }}>
            <Text style={{ color: '#fff', fontSize: 12.5, fontWeight: '600' }}>{picked.length} of {LIMIT}</Text>
          </View>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10 }}>
        {/* Recents opens the albums (only with the whole library shared: a few chosen photos have no albums). */}
        <Pressable onPress={openAlbums} disabled={access !== 'all'} hitSlop={8} accessibilityRole={access === 'all' ? 'button' : 'header'} accessibilityLabel={access === 'all' ? `${albumTitle}, ${t('createFlow.albums')}` : albumTitle} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1, marginRight: 12, opacity: pressed ? 0.6 : 1 })}>
          <Text numberOfLines={1} style={{ color: '#fff', fontSize: 17, fontWeight: '700', flexShrink: 1 }}>{albumTitle}</Text>
          {access === 'all' ? <Icon name="down" size={16} color="#fff" weight={2.4} /> : null}
        </Pressable>
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

  const footer = noAccess ? (
    <DarkEmpty
      icon="image"
      title="See your photos here"
      action={
        <View style={{ alignSelf: 'stretch', gap: 10, marginTop: 6 }}>
          {/* The system only asks once; after that, only the Settings app can give access. */}
          <Button label={canAsk ? 'Allow access' : t('createFlow.openSettings')} onPress={() => (canAsk ? check('always') : Linking.openSettings().catch(() => {}))} />
          <Button label={shorts ? t('createFlow.chooseVideo') : t('createFlow.choosePhotos')} kind="ghost" onPress={systemPicker} style={{ backgroundColor: DARK.surface2 }} textColor={DARK.fg} />
        </View>
      }
    />
  ) : !offered.length ? (
    loaded ? <Text style={{ color: DARK.fg2, textAlign: 'center', padding: 32 }}>{shorts ? t('createFlow.noVideos') : 'No photos here yet.'}</Text> : <DarkLoading />
  ) : null;

  return (
    <View style={{ flex: 1, backgroundColor: '#000', paddingTop: insets.top }}>
      <View style={{ height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 }}>
        {/* As wide as Next on the right, so the title sits in the middle. */}
        <View style={{ width: 56 }}>
          <RoundButton name="close" label="Close" onPress={onClose} size={40} iconSize={22} bg={DARK.round} color={DARK.fg} />
        </View>
        <Text accessibilityRole="header" numberOfLines={1} style={{ flex: 1, color: '#fff', fontSize: 18, fontWeight: '700', textAlign: 'center' }}>{shorts ? t('create.newClip') : t('create.newPost')}</Text>
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
          data={noAccess ? CAMERA_ONLY : cells}
          keyExtractor={(c) => c.key}
          numColumns={4}
          columnWrapperStyle={{ gap }}
          ItemSeparatorComponent={Separator}
          ListHeaderComponent={header}
          ListFooterComponent={footer}
          onEndReached={noAccess ? undefined : loadMore}
          onEndReachedThreshold={1.2}
          contentContainerStyle={{ paddingBottom: insets.bottom + 72 }}
          showsVerticalScrollIndicator={false}
          getItemLayout={getItemLayout}
          initialNumToRender={24}
          maxToRenderPerBatch={24}
          windowSize={7}
          removeClippedSubviews
          extraData={extraData}
          renderItem={renderItem}
        />
      )}

      {/* POST · STORY · SHORTS · LIVE, on a dark strip along the bottom. */}
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 6, paddingBottom: insets.bottom + 6, backgroundColor: 'rgba(0,0,0,0.92)' }}>
        <ModeSwitcher mode={mode} onMode={onMode} canLive={canLive} disabled={!!busy} />
      </View>

      {busy ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', gap: 12 }]} accessibilityLiveRegion="polite">
          <ActivityIndicator color="#fff" />
          <Text style={{ color: '#fff', fontWeight: '600' }}>{busy}</Text>
        </View>
      ) : null}

      <Sheet visible={albumSheet} onClose={() => setAlbumSheet(false)} title={t('createFlow.albums')} tall>
        <ScrollView>
          <AlbumRow title={t('createFlow.recents')} on={!album} onPress={() => chooseAlbum(null)} />
          {albums === null ? (
            <ActivityIndicator color={C.fg2} style={{ padding: 24 }} />
          ) : (
            albums.map((a) => <AlbumRow key={a.id} title={a.title} count={a.assetCount} on={album?.id === a.id} onPress={() => chooseAlbum(a)} />)
          )}
        </ScrollView>
      </Sheet>
    </View>
  );
});

/** One album in the albums sheet: its name, how many it holds, and a tick on the one showing. */
function AlbumRow({ title, count, on, onPress }: { title: string; count?: number; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={title} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, minHeight: 50, backgroundColor: pressed ? C.press : 'transparent' })}>
      <Text numberOfLines={1} style={{ flex: 1, color: C.fg, fontSize: 17, fontWeight: on ? '700' : '400' }}>{title}</Text>
      {count !== undefined ? <Text style={{ color: C.fg2, fontSize: 15 }}>{count}</Text> : null}
      {on ? <Icon name="check" size={20} color={C.accent2} /> : null}
    </Pressable>
  );
}
