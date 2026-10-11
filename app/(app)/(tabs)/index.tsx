import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect, useNavigation, useRouter } from 'expo-router';
import { FeedSwitch } from '../../../src/components/FeedSwitch';
import { Icon } from '../../../src/components/Icon';
import { PostCard } from '../../../src/components/PostCard';
import { FeedSkeleton, SlowLine } from '../../../src/components/Skeleton';
import { StoryTray } from '../../../src/components/StoryTray';
import { Button, Empty, ErrorNote, IconButton, Screen, useToast } from '../../../src/components/ui';
import { countUnreadNotices, fetchExplore, fetchFeed, recordView } from '../../../src/lib/api';
import { useFeedAutoplay } from '../../../src/lib/autoplay';
import { cacheKey, peekCache, readCache, writeCache } from '../../../src/lib/cache';
import { type Key, useT } from '../../../src/lib/i18n';
import { prefetchLibrary } from '../../../src/lib/library';
import { useSession } from '../../../src/lib/session';
import { getPostNow, listen, putPosts, wasDropped } from '../../../src/lib/store';
import { C, errText } from '../../../src/lib/theme';
import type { Post } from '../../../src/lib/types';
import { FeedTaste, tasteKey, tasteOf, tuneFeed } from '../clips-settings';
import { useTabListBottom } from '../../../src/lib/player';

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

/** The list's row and key, made once so the list isn't handed new ones each time Home draws. */
const renderPost = ({ item }: { item: string }) => <PostCard id={item} suggest />;
const keyOfPost = (id: string) => id;

/** The picture a post shows first: the photo, or a video's cover. */
function firstPicture(p: Post): string | undefined {
  const m = p.media?.[0];
  if (!m) return undefined;
  return m.type === 'video' ? m.poster || undefined : m.url;
}

/** The end of the feed, as on Instagram: a ringed tick over "You're all caught up". */
function CaughtUp({ label }: { label: string }) {
  return (
    <View accessible accessibilityLabel={label} style={{ alignItems: 'center', gap: 12, paddingTop: 24, paddingBottom: 32 }}>
      <View style={{ width: 56, height: 56, borderRadius: 28, borderWidth: 2, borderColor: C.accent2, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="check" size={28} color={C.accent2} weight={2.4} />
      </View>
      <Text style={{ color: C.fg, fontSize: 16, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}

export default function Home() {
  const listBottom = useTabListBottom();
  const { me, profile } = useSession();
  const router = useRouter();
  const navigation = useNavigation();
  const toast = useToast();
  const t = useT();
  // The same two feeds, with their words.
  const feeds = useMemo(() => FEEDS.map((f) => ({ key: f.key, label: t(f.label) })), [t]);
  const [kind, setKindState] = useState<HomeFeed>(() => chosenFeed ?? ((profile?.following_count ?? 0) > 0 ? 'following' : 'foryou'));
  // What the member wants more and less of (Your feed). Pages are kept as the server sent them and
  // tuned as they are shown, so a change of mind only needs the feed loaded again.
  const taste = tasteOf(profile);
  const tasteRef = useRef(taste);
  tasteRef.current = taste;
  // A first page already in memory from earlier in this session shows on the very first frame. Its
  // posts may have been let go since (another account was used in between): those are put back just
  // after the first frame, which shows the loading shapes rather than an empty feed.
  const [opening] = useState(() => {
    const seed = peekCache<CachedFeed>(feedKey(me, kind));
    const all = seed ? tune(seed.posts, me, taste, kind, seed.suggested).map((p) => p.id) : [];
    const held = all.filter((id) => getPostNow(id));
    return { seed, ids: held, whole: held.length === all.length };
  });
  const seed = opening.seed;
  const [ids, setIds] = useState<string[]>(opening.ids);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(() => (opening.ids.length ? 'ready' : 'loading'));
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  // The next page is on its way (scrolled to the end): shows the slow line if it takes a while.
  const [paging, setPaging] = useState(false);
  // The next page didn't come: the end of the feed offers to try again.
  const [pageFailed, setPageFailed] = useState(false);
  const [unread, setUnread] = useState(false);
  const [trayKey, setTrayKey] = useState(0);
  const listRef = useRef<FlatList<string>>(null);
  const meRef = useRef(me);
  meRef.current = me;
  const kindRef = useRef(kind);
  kindRef.current = kind;
  // Whether posts are showing: a fresh load that fails then keeps them and says so in a toast.
  const hasPosts = useRef(false);
  hasPosts.current = ids.length > 0;
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // A post counts as seen once half of it has been on screen for half a second; the post most in
  // view plays its video, only while Home is the screen showing.
  const viewabilityPairs = useFeedAutoplay((id) => {
    const post = getPostNow(id);
    if (post) recordView(meRef.current, post);
  });

  const cursor = useRef<string | undefined>(seed?.posts.length ? seed.posts[seed.posts.length - 1].created_at : undefined);
  const done = useRef(seed ? seed.posts.length < CACHED_POSTS : false);
  const busy = useRef(false);
  const mode = useRef<'feed' | 'explore'>(seed?.suggested ? 'explore' : 'feed');
  // Each fresh load gets a number; a slower, older load that comes back after a newer one is thrown away.
  const seq = useRef(0);
  // The number of the last fresh load that came back, so a saved page arriving late cannot cover it.
  const landed = useRef(0);
  // The copy saved on the phone while it is still being read: a first load that fails waits for it
  // rather than flashing "didn't load" just before the saved posts appear.
  const reading = useRef<Promise<void> | null>(null);

  /** Shows a saved first page while the fresh one loads. */
  const showCached = useCallback((page: CachedFeed, feed: HomeFeed) => {
    // A post deleted, or by someone blocked, from Home's menu since the page was kept stays gone
    // (Home doesn't load afresh for those, so the kept page may still have it).
    const kept = page.posts.filter((p) => !wasDropped(p));
    if (!kept.length) return;
    // The shared copy is at least as new as the saved one (a like made since, say), so it wins.
    putPosts(kept.filter((p) => !getPostNow(p.id)));
    // Paging follows the page as the server sent it.
    cursor.current = page.posts[page.posts.length - 1].created_at;
    done.current = page.posts.length < CACHED_POSTS;
    mode.current = page.suggested ? 'explore' : 'feed';
    const shown = tune(kept, meRef.current, tasteRef.current, feed, page.suggested).map((p) => p.id);
    hasPosts.current = shown.length > 0;
    setIds(shown);
    setStatus('ready');
  }, []);

  const load = useCallback(
    async (reset: boolean) => {
      if (!reset && (busy.current || done.current)) return;
      const my = reset ? ++seq.current : seq.current;
      busy.current = true;
      if (!reset) {
        setPaging(true);
        setPageFailed(false);
      }
      const feed = kindRef.current;
      let which = reset ? 'feed' : mode.current;
      const before = reset ? undefined : cursor.current;
      try {
        let page = which === 'feed' ? await fetchFeed(me, before, feed) : await fetchExplore(before, PAGE);
        // Following nobody yet: show everyone's latest instead (each one is marked Suggested for you).
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
        setIds((cur) => (reset ? shown.map((p) => p.id) : [...cur, ...shown.map((p) => p.id).filter((id) => !cur.includes(id))]));
        setStatus('ready');
        if (reset) {
          landed.current = my;
          setPageFailed(false);
          // Keep this page for next time, and fetch the first pictures before they scroll into view.
          if (alive.current) writeCache(feedKey(me, feed), { posts: page.slice(0, CACHED_POSTS), suggested: which === 'explore' } satisfies CachedFeed);
          const urls = shown.slice(0, PREFETCH_IMAGES).map(firstPicture).filter((u): u is string => !!u);
          if (urls.length) Image.prefetch(urls).catch(() => {});
        }
      } catch (e) {
        if (my !== seq.current) return;
        // The next page didn't come: the end of the feed offers to try again.
        if (!reset) {
          setPageFailed(true);
          return;
        }
        // A copy saved on the phone may still be on its way: it shows instead of the error.
        if (reading.current) await reading.current;
        if (my !== seq.current) return;
        if (hasPosts.current) toast(errText(e));
        else {
          setError(errText(e));
          setStatus('error');
        }
      } finally {
        if (my === seq.current) {
          busy.current = false;
          setRefreshing(false);
          setPaging(false);
        }
      }
    },
    [me, toast],
  );

  // The page in memory had posts let go since it was kept: put them back and show it.
  useEffect(() => {
    if (opening.seed && !opening.whole) showCached(opening.seed, kindRef.current);
    // Once, for the page this screen opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let live = true;
    load(true);
    const mine = seq.current;
    // Nothing in memory for this feed yet: show the page saved on the phone, unless the fresh one beats it.
    if (!peekCache<CachedFeed>(feedKey(me, kind))) {
      const job = readCache<CachedFeed>(feedKey(me, kind)).then((page) => {
        if (!live || !page || mine !== seq.current || landed.current === mine) return;
        showCached(page, kind);
      });
      reading.current = job;
      const finished = () => {
        if (reading.current === job) reading.current = null;
      };
      job.then(finished, finished);
    }
    return () => {
      live = false;
    };
  }, [load, kind, me, showCached]);
  // Something changed that feeds show (a new post, a block, an ad, a community joined): a fresh first
  // page, from the top. Done from Home's own menu (a post deleted, an account blocked), the cards
  // have already gone where they were, so the feed stays where it is rather than jumping.
  useEffect(
    () =>
      listen('feed', () => {
        if (navigation.isFocused()) return;
        listRef.current?.scrollToOffset({ offset: 0, animated: false });
        load(true);
      }),
    [load, navigation],
  );

  // New choices in Your feed: load For you (or the latest posts shown instead) again with them.
  const tasteNow = tasteKey(taste);
  const tasteShown = useRef(tasteNow);
  useEffect(() => {
    if (tasteShown.current === tasteNow) return;
    tasteShown.current = tasteNow;
    if (kindRef.current === 'foryou' || mode.current === 'explore') load(true);
  }, [tasteNow, load]);

  const checkUnread = useCallback(() => {
    countUnreadNotices().then((n) => setUnread(n > 0)).catch(() => {});
  }, []);
  useFocusEffect(checkUnread);

  // A tap on Home while Home is showing goes back to the top, as on Instagram.
  useEffect(() => {
    const off = navigation.addListener('tabPress' as never, () => {
      if (navigation.isFocused()) listRef.current?.scrollToOffset({ offset: 0, animated: true });
    });
    return off;
  }, [navigation]);

  // One tap, one screen: a second tap while the first screen is still opening is ignored.
  const lastOpen = useRef(0);
  const open = (href: string) => {
    const now = Date.now();
    if (now - lastOpen.current < 600) return;
    lastOpen.current = now;
    router.push(href as any);
  };

  const setKind = (next: HomeFeed) => {
    if (next === kind) return;
    chosenFeed = next;
    // Whatever the old feed still had on its way belongs to it, not to this one.
    seq.current++;
    setKindState(next);
    setIds([]);
    setPageFailed(false);
    setStatus('loading');
    // The other feed starts at its top, wherever this one had been scrolled to.
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
    // Seen earlier in this session: show that page straight away while the fresh one loads.
    const saved = peekCache<CachedFeed>(feedKey(me, next));
    if (saved) showCached(saved, next);
  };

  const refresh = () => {
    setRefreshing(true);
    setTrayKey((k) => k + 1);
    checkUnread();
    load(true);
  };

  const create = () => {
    prefetchLibrary();
    open('/create');
  };

  const empty = (
    <Empty icon="image" title={t('home.welcome')} action={<View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}><Button small label={t('home.sharePhoto')} onPress={() => open('/create?mode=post')} /><Button small kind="ghost" label={t('home.findPeople')} onPress={() => open('/explore')} /></View>} />
  );

  const footer =
    status !== 'ready' || !ids.length ? null : pageFailed ? (
      <View style={{ alignItems: 'center', paddingVertical: 24 }}>
        <Button small kind="ghost" label={t('common.tryAgain')} onPress={() => load(false)} />
      </View>
    ) : done.current ? (
      <CaughtUp label={t('home.caughtUp')} />
    ) : null;

  return (
    <Screen>
      {/* As on Instagram: Create on the left, the two feeds as words in the middle, activity on the right. */}
      <View style={{ height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 }}>
        <IconButton name="plus" size={27} label={t('common.create')} onPress={create} />
        <View style={{ flex: 1, alignItems: 'center' }}>
          <FeedSwitch value={kind} onChange={setKind} options={feeds} plain />
        </View>
        <IconButton name="heart" size={26} label={t('common.notifications')} badge={unread} onPress={() => { setUnread(false); open('/notifications'); }} />
      </View>
      <SlowLine active={refreshing || paging} />
      <FlatList
        ref={listRef}
        data={ids}
        keyExtractor={keyOfPost}
        renderItem={renderPost}
        ListHeaderComponent={<StoryTray refreshKey={trayKey} />}
        ListEmptyComponent={status === 'loading' ? <FeedSkeleton /> : status === 'error' ? <ErrorNote message={error} onRetry={() => { setStatus('loading'); load(true); }} /> : empty}
        ListFooterComponent={footer}
        onEndReached={() => load(false)}
        onEndReachedThreshold={0.6}
        contentContainerStyle={{ paddingBottom: listBottom }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.fg2} />}
        windowSize={7}
        initialNumToRender={3}
        // A post card is a lot to draw: a few at a time keeps each batch short, so a fling never waits on ten of them.
        maxToRenderPerBatch={4}
        viewabilityConfigCallbackPairs={viewabilityPairs}
      />
    </Screen>
  );
}
