import React, { useCallback, useRef } from 'react';
import { FlatList, Pressable, RefreshControl, Text, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { type GridSource, isShort, rememberGrid } from '../lib/grid-open';
import { C, fmt } from '../lib/theme';
import type { Post } from '../lib/types';
import { Icon } from './Icon';
import { useTabListBottom } from '../lib/player';

export function thumbOf(post: Post): string | undefined {
  const m = post.media?.[0];
  if (!m) return undefined;
  return m.type === 'video' ? m.poster : m.url;
}

const LIST: GridSource = { from: 'list' };

/**
 * What a tap on a cell does: a Short opens the Shorts player at that Short, with the grid's other
 * Shorts to swipe through; anything else opens a feed of the grid's posts starting at the one tapped.
 * The callback never changes, so memoised cells don't draw again when the grid's list does.
 */
export function useOpenFromGrid(posts: Post[], source: GridSource = LIST, subtitle?: string) {
  const router = useRouter();
  const latest = useRef({ posts, source, subtitle });
  latest.current = { posts, source, subtitle };
  // One tap, one feed: a quick second tap (on this cell or another) while it opens is ignored.
  const lastOpen = useRef(0);
  return useCallback(
    (post: Post) => {
      const now = Date.now();
      if (now - lastOpen.current < 600) return;
      lastOpen.current = now;
      const { posts: all, source: from, subtitle: sub } = latest.current;
      const short = isShort(post);
      const ids = (short ? all.filter(isShort) : all).map((p) => p.id);
      if (!ids.includes(post.id)) ids.unshift(post.id);
      const key = rememberGrid({ ids, source: from, subtitle: sub });
      const user = from.from === 'user' ? `&user=${encodeURIComponent(from.userId)}` : '';
      router.push(`/${short ? 'shorts' : 'posts'}?start=${encodeURIComponent(post.id)}&grid=${key}${user}`);
    },
    [router],
  );
}

/** A soft shadow under the white badges, so they still read on a bright photo. */
const BADGE = { position: 'absolute', right: 6, top: 6, shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 2.5, shadowOffset: { width: 0, height: 0 } } as const;

/** Memoised: a grid draws its cells again whenever the screen around it does, and a cell only changes with its post. */
export const GridCell = React.memo(function GridCell({ post, size, onOpen }: { post: Post; size: number; onOpen?: (post: Post) => void }) {
  const router = useRouter();
  const uri = thumbOf(post);
  const media = post.media ?? [];
  const video = media[0]?.type === 'video';
  return (
    <Pressable
      onPress={() => (onOpen ? onOpen(post) : router.push(isShort(post) ? `/watch/${post.id}` : `/post/${post.id}`))}
      accessibilityRole="button"
      accessibilityLabel={`Post by ${post.username}`}
      style={({ pressed }) => ({ width: size, height: Math.round(size * 1.33), backgroundColor: C.bg2, opacity: pressed ? 0.82 : 1 })}>
      {uri ? <Image source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={120} cachePolicy="memory-disk" recyclingKey={post.id} /> : null}
      {video ? (
        <View style={BADGE}>
          <Icon name="reels" size={18} color="#fff" />
        </View>
      ) : media.length > 1 ? (
        <View style={BADGE}>
          <Icon name="copy" size={18} color="#fff" />
        </View>
      ) : null}
      {video && post.view_count ? (
        <View style={{ position: 'absolute', left: 6, bottom: 5, flexDirection: 'row', alignItems: 'center', gap: 3 }} accessibilityLabel={`${post.view_count} views`}>
          <Icon name="play" size={13} color="#fff" />
          <Text style={{ color: '#fff', fontSize: 12.5, fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 3, textShadowOffset: { width: 0, height: 1 } }}>{fmt(post.view_count)}</Text>
        </View>
      ) : null}
    </Pressable>
  );
});

const GRID_GAP = 2;
/** The space between rows. A component made once: one made inline is a new kind of component on every draw, so every gap would be thrown away and built again. */
const GridGap = () => <View style={{ height: GRID_GAP }} />;
const keyOfPost = (p: Post) => p.id;
const COLUMNS = { gap: GRID_GAP };
/** Cells drawn before the first frame: six rows, a screenful, so the grid doesn't fill in a row at a time. */
const FIRST_CELLS = 18;

export function PostGrid({ posts, header, empty, footer, refreshing, onRefresh, onEnd, source, subtitle, listRef }: { posts: Post[]; header?: React.ReactElement | null; empty?: React.ReactElement | null; footer?: React.ReactElement | null; refreshing?: boolean; onRefresh?: () => void; onEnd?: () => void; source?: GridSource; subtitle?: string; listRef?: React.Ref<FlatList<Post>> }) {
  const listBottom = useTabListBottom();
  const { width } = useWindowDimensions();
  const size = Math.floor((width - GRID_GAP * 2) / 3);
  const open = useOpenFromGrid(posts, source, subtitle);
  const renderCell = useCallback(({ item }: { item: Post }) => <GridCell post={item} size={size} onOpen={open} />, [size, open]);
  return (
    <FlatList
      ref={listRef}
      data={posts}
      keyExtractor={keyOfPost}
      numColumns={3}
      columnWrapperStyle={COLUMNS}
      ItemSeparatorComponent={GridGap}
      renderItem={renderCell}
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      ListFooterComponent={footer}
      contentContainerStyle={{ paddingBottom: listBottom }}
      onEndReached={onEnd}
      onEndReachedThreshold={0.6}
      initialNumToRender={FIRST_CELLS}
      maxToRenderPerBatch={FIRST_CELLS}
      windowSize={9}
      showsVerticalScrollIndicator={false}
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={C.fg2} /> : undefined}
    />
  );
}

export function SectionTitle({ children }: { children: string }) {
  return <Text style={{ color: C.fg, fontSize: 17, fontWeight: '700', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 }}>{children}</Text>;
}
