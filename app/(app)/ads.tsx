import React, { useCallback, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { GridCell } from '../../src/components/Grid';
import { Icon } from '../../src/components/Icon';
import { afterSheet } from '../../src/components/StoryChrome';
import { Button, Empty, ErrorNote, Loading, Screen, ScreenHeader, Sheet } from '../../src/components/ui';
import { fetchUserPosts, myPromotions } from '../../src/lib/api';
import { tap } from '../../src/lib/haptics';
import { t } from '../../src/lib/i18n';
import { money } from '../../src/lib/payments';
import { useSession } from '../../src/lib/session';
import { C, dayLabel, errText } from '../../src/lib/theme';
import type { Post, Promotion } from '../../src/lib/types';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** "Active · ends 14 Oct", "Ended" or "Refunded", from the row and the clock. */
function standing(p: Promotion): { label: string; live: boolean } {
  if (p.status === 'refunded') return { label: 'Refunded', live: false };
  const ends = p.ends_at ? new Date(p.ends_at) : null;
  // The row stays 'active' until the nightly tidy-up, so the end date decides.
  if (p.status === 'active' && ends && ends > new Date()) return { label: `Active · ends ${dayLabel(ends)}`, live: true };
  return { label: 'Ended', live: false };
}

const GAP = 2;
const keyOfAd = (p: Promotion) => p.id;
const keyOfPost = (p: Post) => p.id;

/** The ads the member has paid for, newest first, with a quick way to run one again or promote another post. */
export default function Ads() {
  const router = useRouter();
  const { me } = useSession();
  const { width } = useWindowDimensions();
  const cell = Math.floor((width - GAP * 2) / 3);
  const [list, setList] = useState<Promotion[] | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const alive = useRef(true);

  // Choosing a post to promote: the member's own posts, read when the sheet opens.
  const [picking, setPicking] = useState(false);
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [postsError, setPostsError] = useState('');
  // One screen per tap, however quickly something is tapped twice.
  const lastPush = useRef(0);

  const load = useCallback(async () => {
    setError('');
    try {
      const rows = await myPromotions(me);
      // A declined card leaves a failed attempt behind; it was never an ad, so it is not listed.
      if (alive.current) setList(rows.filter((r) => r.status !== 'failed'));
    } catch (e) {
      if (alive.current) setError(errText(e));
    }
  }, [me]);
  // Back from promoting a post again: show the new ad.
  useFocusEffect(
    useCallback(() => {
      alive.current = true;
      load();
      return () => { alive.current = false; };
    }, [load]),
  );

  async function pull() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const loadPosts = useCallback(async () => {
    setPostsError('');
    try {
      const mine = await fetchUserPosts(me);
      // A post kept to the profile never shows in For you or Explore, so an ad for it would show nowhere.
      setPosts(mine.filter((p) => !p.profile_only));
    } catch (e) {
      setPostsError(errText(e));
    }
  }, [me]);

  function openPicker() {
    setPicking(true);
    // Read again each time (a post may have been added or deleted since); the last list shows meanwhile.
    loadPosts();
  }

  const promote = useCallback(
    (postId: string) => {
      if (Date.now() - lastPush.current < 800) return;
      lastPush.current = Date.now();
      router.push(`/promote/${postId}`);
    },
    [router],
  );

  // From the sheet: it slides away first, then the post's promote screen opens.
  const pick = useCallback(
    (post: Post) => {
      if (Date.now() - lastPush.current < 800) return;
      tap('select');
      setPicking(false);
      afterSheet().then(() => {
        // Not if the member has left this screen meanwhile.
        if (alive.current) promote(post.id);
      });
    },
    [promote],
  );

  const renderAd = useCallback(({ item }: { item: Promotion }) => <AdRow item={item} onAgain={promote} />, [promote]);
  const renderCell = useCallback(({ item }: { item: Post }) => <GridCell post={item} size={cell} onOpen={pick} />, [cell, pick]);

  // Promoting another post: a line of green text above the list, not a card.
  const header = (
    <Pressable onPress={openPicker} hitSlop={6} accessibilityRole="button" accessibilityLabel="Promote a post" style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', marginHorizontal: 16, marginTop: 2, marginBottom: 10, paddingVertical: 6, opacity: pressed ? 0.6 : 1 })}>
      <Icon name="megaphone" size={20} color={C.accent2} />
      <Text style={{ color: C.accent2, fontSize: 16, fontWeight: '700' }}>Promote a post</Text>
      <Icon name="right" size={15} color={C.accent2} weight={2.4} />
    </Pressable>
  );

  let body: React.ReactNode;
  if (error && !list) body = <ErrorNote message={error} onRetry={load} />;
  else if (!list) body = <Loading />;
  else
    body = (
      <FlatList
        data={list}
        keyExtractor={keyOfAd}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={pull} tintColor={C.fg2} />}
        ListEmptyComponent={<Empty icon="megaphone" title="No ads yet" />}
        renderItem={renderAd}
      />
    );

  let picker: React.ReactNode;
  if (postsError && !posts) picker = <ErrorNote message={postsError} onRetry={loadPosts} />;
  else if (!posts) picker = <Loading />;
  else
    picker = (
      <FlatList
        data={posts}
        keyExtractor={keyOfPost}
        numColumns={3}
        columnWrapperStyle={{ gap: GAP }}
        ItemSeparatorComponent={Gap}
        renderItem={renderCell}
        initialNumToRender={12}
        windowSize={5}
        ListEmptyComponent={<Empty icon="image" title={t('profile.emptyNoPosts')} />}
        contentContainerStyle={{ paddingBottom: 12 }}
      />
    );

  return (
    <Screen>
      <ScreenHeader title="Your ads" />
      {body}
      <Sheet visible={picking} onClose={() => setPicking(false)} title="Promote a post" tall>
        <View style={{ flex: 1 }}>{picker}</View>
      </Sheet>
    </Screen>
  );
}

/** The space between rows of the grid. Made once, so the rows aren't rebuilt on every draw. */
const Gap = () => <View style={{ height: GAP }} />;

/** One ad. Memoised: the list draws again on every refresh, and a row only changes with its ad. */
const AdRow = React.memo(function AdRow({ item, onAgain }: { item: Promotion; onAgain: (postId: string) => void }) {
  const { label, live } = standing(item);
  const post = item.post ?? null;
  const first = post?.media?.[0];
  const thumb = first ? (first.type === 'video' ? first.poster || '' : first.url) : '';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 }}>
      <View style={{ width: 56, height: 56, borderRadius: 10, overflow: 'hidden', backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }}>
        {thumb ? <Image source={{ uri: thumb }} style={{ width: 56, height: 56 }} contentFit="cover" transition={120} cachePolicy="memory-disk" recyclingKey={item.id} accessibilityIgnoresInvertColors /> : <Icon name={post ? 'image' : 'trash'} size={22} color={C.fg3} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ color: post ? C.fg : C.fg2, fontSize: 15, fontWeight: '600' }}>{post ? post.caption || 'Post' : 'Post deleted'}</Text>
        <Text style={{ color: live ? C.accent2 : C.fg2, fontSize: 13.5, marginTop: 2, fontWeight: live ? '600' : '400' }}>{label}</Text>
        <Text style={{ color: C.fg3, fontSize: 13, marginTop: 1, fontVariant: ['tabular-nums'] }}>
          {plural(item.days, 'day')} · {money(item.amount_pence, item.currency)}
        </Text>
      </View>
      {post && item.post_id ? <Button small kind="ghost" label="Promote again" onPress={() => onAgain(item.post_id!)} /> : null}
    </View>
  );
});
