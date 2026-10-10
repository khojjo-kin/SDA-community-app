import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, RefreshControl, Text, View, ViewToken } from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { FeedSwitch } from '../../../src/components/FeedSwitch';
import { PostCard } from '../../../src/components/PostCard';
import { StoryTray } from '../../../src/components/StoryTray';
import { Button, Empty, ErrorNote, IconButton, Loading, Screen } from '../../../src/components/ui';
import { countUnreadNotices, fetchExplore, fetchFeed, recordView } from '../../../src/lib/api';
import { getActivePost, setActivePost } from '../../../src/lib/autoplay';
import { cacheKey, peekCache, readCache, writeCache } from '../../../src/lib/cache';
import { type Key, useT } from '../../../src/lib/i18n';
import { prefetchLibrary } from '../../../src/lib/library';
import { useSession } from '../../../src/lib/session';
import { getPostNow, listen, putPosts } from '../../../src/lib/store';
import { C, errText } from '../../../src/lib/theme';
import type { Post } from '../../../src/lib/types';
import { FeedTaste, tasteKey, tasteOf, tuneFeed } from '../clips-settings';

/** Home offers only these two feeds; the API's other kinds aren't shown here. */
type HomeFeed = 'foryou' | 'following';

// Keys for the labels: the switch is handed the words as Home draws, in the app's language.
const FEEDS: readonly { key: HomeFeed; label: Key }[] = [
  { key: 'foryou', label: 'home.forYou' },
  { key: 'following', label: 'common.following' },
];

/** The feed last chosen in this session. Null until someone picks one, so the default can depend on who they follow. */
let chosenFeed: HomeFeed | null = null;

/** The first page of a feed as it was last shown, kept so the feed opens at once next time. */
type CachedFeed = { posts: Post[]; suggested: boolean };
const CACHED_POSTS = 12;
/** How many of the first posts have their pictures fetched before they scroll into view. */
const PREFETCH_IMAGES = 4;
const feedKey = (me: string, kind: HomeFeed) => cacheKey(me, `feed.${kind}`);
/** How many posts the server sends at a time. */
const PAGE = 12;
/** When the member's choices leave a whole page out, look this many pages further before giving up. */
const EXTRA_PAGES = 2;

/**
 * Applies Your feed (clips-settings) to a page as it is shown. For you gets all of it; the latest posts
 * shown to someone who follows nobody get the sensitive filter only; Following is left as it is.
 */
function tune(page: Post[], me: string, taste: FeedTaste, feed: HomeFeed, suggested: boolean): Post[] {
  if (feed === 'foryou') return tuneFeed(page, me, taste, true);
  if (suggested) return tuneFeed(page, me, taste, false);
  return page;
}

/** The picture a post shows first: the photo, or a video's cover. */
function firstPicture(p: Post): string | undefined {
  const m = p.media?.[0];
  if (!m) return undefined;
  return m.type === 'video' ? m.poster || undefined : m.url;
}

export default function Home() {
  const { me, profile } = useSession();
  const router = useRouter();
  const t = useT();
  // The same two feeds, with their words.
  const feeds = useMemo(() => FEEDS.map((f) => ({ key: f.key, label: t(f.label) })), [t]);
  const [kind, setKindState] = useState<HomeFeed>(() => chosenFeed ?? ((profile?.following_count ?? 0) > 0 ? 'following' : 'foryou'));
  // What the member wants more and less of (Your feed). Pages are kept as the server sent them and
  // tuned as they are shown, so a change of mind only needs the feed loaded again.
  const taste = tasteOf(profile);
  const tasteRef = useRef(taste);
  tasteRef.current = taste;
  // A first page already in memory from earlier in this session shows on the very first frame.
  const [seed] = useState(() => peekCache<CachedFeed>(feedKey(me, kind)));
  const [ids, setIds] = useState<string[]>(() => (seed ? tune(seed.posts, me, taste, kind, seed.suggested).map((p) => p.id).filter((id) => getPostNow(id)) : []));
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(() => (seed?.posts.length ? 'ready' : 'loading'));
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [suggested, setSuggested] = useState(!!seed?.suggested);
  const [unread, setUnread] = useState(false);
  const [trayKey, setTrayKey] = useState(0);
  const meRef = useRef(me);
  meRef.current = me;
  const kindRef = useRef(kind);
  kindRef.current = kind;
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // A post counts as seen once at least half of it has been on screen for half a second.
  const onViewable = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    for (const v of viewableItems) {
      const post = typeof v.item === 'string' ? getPostNow(v.item) : undefined;
      if (post) recordView(meRef.current, post);
    }
  }).current;
  // The post most in view plays its video, only while Home is the screen showing.
  const inView = useRef<string | null>(null);
  const focused = useRef(false);
  const onActive = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const top = viewableItems.find((v) => v.isViewable && typeof v.item === 'string');
    inView.current = top ? (top.item as string) : null;
    if (focused.current) setActivePost(inView.current ?? null);
  }).current;
  // FlatList needs these pairs to stay the same object for the life of the list.
  const viewabilityPairs = useRef([
    { viewabilityConfig: { itemVisiblePercentThreshold: 50, minimumViewTime: 500 }, onViewableItemsChanged: onViewable },
    { viewabilityConfig: { itemVisiblePercentThreshold: 60 }, onViewableItemsChanged: onActive },
  ]).current;

  const cursor = useRef<string | undefined>(seed?.posts.length ? seed.posts[seed.posts.length - 1].created_at : undefined);
  const done = useRef(seed ? seed.posts.length < CACHED_POSTS : false);
  const busy = useRef(false);
  const mode = useRef<'feed' | 'explore'>(seed?.suggested ? 'explore' : 'feed');
  // Each fresh load gets a number; a slower, older load that comes back after a newer one is thrown away.
  const seq = useRef(0);
  // The number of the last fresh load that came back, so a saved page arriving late cannot cover it.
  const landed = useRef(0);

  /** Shows a saved first page while the fresh one loads. */
  const showCached = useCallback((page: CachedFeed, feed: HomeFeed) => {
    if (!page.posts.length) return;
    // The shared copy is at least as new as the saved one (a like made since, say), so it wins.
    putPosts(page.posts.filter((p) => !getPostNow(p.id)));
    cursor.current = page.posts[page.posts.length - 1].created_at;
    done.current = page.posts.length < CACHED_POSTS;
    mode.current = page.suggested ? 'explore' : 'feed';
    setSuggested(page.suggested);
    setIds(tune(page.posts, meRef.current, tasteRef.current, feed, page.suggested).map((p) => p.id));
    setStatus('ready');
  }, []);

  const load = useCallback(
    async (reset: boolean) => {
      if (!reset && (busy.current || done.current)) return;
      const my = reset ? ++seq.current : seq.current;
      busy.current = true;
      const feed = kindRef.current;
      let which = reset ? 'feed' : mode.current;
      const before = reset ? undefined : cursor.current;
      try {
        let page = which === 'feed' ? await fetchFeed(me, before, feed) : await fetchExplore(before, PAGE);
        // Following nobody yet: show everyone's latest instead, and say so.
        if (reset && page.length === 0 && feed === 'following') {
          which = 'explore';
          page = await fetchExplore(undefined, PAGE);
        }
        if (my !== seq.current) return;
        // Paging follows what the server sent, not what is shown, or a short page would look like the end.
        let last = page;
        let shown = tune(page, me, tasteRef.current, feed, which === 'explore');
        // The member's choices left the whole page out: look a little further, so the feed isn't empty by mistake.
        for (let i = 0; i < EXTRA_PAGES && !shown.length && last.length >= PAGE; i++) {
          const from = last[last.length - 1].created_at;
          last = which === 'feed' ? await fetchFeed(me, from, feed) : await fetchExplore(from, PAGE);
          if (my !== seq.current) return;
          shown = tune(last, me, tasteRef.current, feed, which === 'explore');
        }
        mode.current = which;
        if (reset) done.current = false;
        if (last.length < PAGE) done.current = true;
        if (last.length) cursor.current = last[last.length - 1].created_at;
        setSuggested(which === 'explore');
        setIds((cur) => (reset ? shown.map((p) => p.id) : [...cur, ...shown.map((p) => p.id).filter((id) => !cur.includes(id))]));
        setStatus('ready');
        if (reset) {
          landed.current = my;
          // Keep this page for next time, and fetch the first pictures before they scroll into view.
          if (alive.current) writeCache(feedKey(me, feed), { posts: page.slice(0, CACHED_POSTS), suggested: which === 'explore' } satisfies CachedFeed);
          const urls = shown.slice(0, PREFETCH_IMAGES).map(firstPicture).filter((u): u is string => !!u);
          if (urls.length) Image.prefetch(urls).catch(() => {});
        }
      } catch (e) {
        if (my !== seq.current) return;
        setError(errText(e));
        setStatus((s) => (s === 'ready' ? 'ready' : 'error'));
      } finally {
        if (my === seq.current) {
          busy.current = false;
          setRefreshing(false);
        }
      }
    },
    [me],
  );

  useEffect(() => {
    let live = true;
    load(true);
    const mine = seq.current;
    // Nothing in memory for this feed yet: show the page saved on the phone, unless the fresh one beats it.
    if (!peekCache<CachedFeed>(feedKey(me, kind))) {
      readCache<CachedFeed>(feedKey(me, kind)).then((page) => {
        if (!live || !page || mine !== seq.current || landed.current === mine) return;
        showCached(page, kind);
      });
    }
    return () => {
      live = false;
    };
  }, [load, kind, me, showCached]);
  useEffect(() => listen('feed', () => { load(true); }), [load]);

  // New choices in Your feed: load For you (or the latest posts shown instead) again with them.
  const tasteNow = tasteKey(taste);
  const tasteShown = useRef(tasteNow);
  useEffect(() => {
    if (tasteShown.current === tasteNow) return;
    tasteShown.current = tasteNow;
    if (kindRef.current === 'foryou' || mode.current === 'explore') load(true);
  }, [tasteNow, load]);

  useFocusEffect(
    useCallback(() => {
      countUnreadNotices().then((n) => setUnread(n > 0)).catch(() => {});
    }, []),
  );

  // Videos play only while Home is showing; coming back picks up the post that was in view.
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      setActivePost(inView.current ?? null);
      return () => {
        focused.current = false;
        // Stop Home's video, unless the next screen has already chosen its own.
        if (getActivePost() === inView.current) setActivePost(null);
      };
    }, []),
  );

  const setKind = (next: HomeFeed) => {
    if (next === kind) return;
    chosenFeed = next;
    // Whatever the old feed still had on its way belongs to it, not to this one.
    seq.current++;
    setKindState(next);
    setIds([]);
    setSuggested(false);
    setStatus('loading');
    // Seen earlier in this session: show that page straight away while the fresh one loads.
    const saved = peekCache<CachedFeed>(feedKey(me, next));
    if (saved) showCached(saved, next);
  };

  const refresh = () => {
    setRefreshing(true);
    setTrayKey((k) => k + 1);
    load(true);
  };

  const create = () => {
    prefetchLibrary();
    router.push('/create');
  };

  const empty = (
    <Empty icon="image" title={t('home.welcome')} body={t('home.welcomeBody')} action={<View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}><Button small label={t('home.sharePhoto')} onPress={() => router.push('/create?mode=post')} /><Button small kind="ghost" label={t('home.findPeople')} onPress={() => router.push('/explore')} /></View>} />
  );

  return (
    <Screen>
      <View style={{ height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, gap: 8 }}>
        <IconButton name="plus" size={24} label={t('common.create')} bg={C.surface} onPress={create} />
        <View style={{ flex: 1, alignItems: 'center' }}>
          <FeedSwitch value={kind} onChange={setKind} options={feeds} style={{ alignSelf: 'stretch', maxWidth: 320 }} />
        </View>
        <IconButton name="heart" size={23} label={t('common.notifications')} bg={C.surface} badge={unread} onPress={() => { setUnread(false); router.push('/notifications'); }} />
      </View>
      <FlatList
        data={ids}
        keyExtractor={(id) => id}
        renderItem={({ item }) => <PostCard id={item} />}
        ListHeaderComponent={
          <View>
            <StoryTray refreshKey={trayKey} />
            {status === 'ready' && suggested && ids.length > 0 ? (
              <Text style={{ color: C.fg2, paddingHorizontal: 14, paddingBottom: 8, lineHeight: 19 }}>
                {t('home.notFollowing')}{' '}
                <Text style={{ color: C.accent2, fontWeight: '600' }} onPress={() => setKind('foryou')} accessibilityRole="button" accessibilityLabel={t('home.switchToForYou')}>
                  {t('home.switchToForYou')}
                </Text>
              </Text>
            ) : null}
          </View>
        }
        ListEmptyComponent={status === 'loading' ? <Loading /> : status === 'error' ? <ErrorNote message={error} onRetry={() => { setStatus('loading'); load(true); }} /> : empty}
        ListFooterComponent={status === 'ready' && ids.length > 0 && done.current ? <Text style={{ color: C.fg2, textAlign: 'center', padding: 28 }}>{t('home.caughtUp')}</Text> : null}
        onEndReached={() => load(false)}
        onEndReachedThreshold={0.6}
        contentContainerStyle={{ paddingBottom: 110 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.fg2} />}
        windowSize={7}
        initialNumToRender={3}
        viewabilityConfigCallbackPairs={viewabilityPairs}
      />
    </Screen>
  );
}
