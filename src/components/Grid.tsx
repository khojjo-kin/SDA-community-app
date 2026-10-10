import React, { useCallback } from 'react';
import { FlatList, Pressable, RefreshControl, Text, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { C, fmt } from '../lib/theme';
import type { Post } from '../lib/types';
import { Icon } from './Icon';

export function thumbOf(post: Post): string | undefined {
  const m = post.media[0];
  if (!m) return undefined;
  return m.type === 'video' ? m.poster : m.url;
}

/** Memoised: a grid draws its cells again whenever the screen around it does, and a cell only changes with its post. */
export const GridCell = React.memo(function GridCell({ post, size }: { post: Post; size: number }) {
  const router = useRouter();
  const uri = thumbOf(post);
  const video = post.media[0]?.type === 'video';
  return (
    <Pressable onPress={() => router.push(video ? `/watch/${post.id}` : `/post/${post.id}`)} accessibilityRole="button" accessibilityLabel={`Post by ${post.username}`} style={{ width: size, height: Math.round(size * 1.33), backgroundColor: C.bg2 }}>
      {uri ? <Image source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={120} cachePolicy="memory-disk" recyclingKey={post.id} /> : null}
      {video ? (
        <View style={{ position: 'absolute', right: 6, top: 6 }}>
          <Icon name="reels" size={18} color="#fff" />
        </View>
      ) : post.media.length > 1 ? (
        <View style={{ position: 'absolute', right: 6, top: 6 }}>
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

export function PostGrid({ posts, header, empty, refreshing, onRefresh, onEnd }: { posts: Post[]; header?: React.ReactElement | null; empty?: React.ReactElement | null; refreshing?: boolean; onRefresh?: () => void; onEnd?: () => void }) {
  const { width } = useWindowDimensions();
  const gap = GRID_GAP;
  const size = Math.floor((width - gap * 2) / 3);
  const renderCell = useCallback(({ item }: { item: Post }) => <GridCell post={item} size={size} />, [size]);
  return (
    <FlatList
      data={posts}
      keyExtractor={keyOfPost}
      numColumns={3}
      columnWrapperStyle={{ gap }}
      ItemSeparatorComponent={GridGap}
      renderItem={renderCell}
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      contentContainerStyle={{ paddingBottom: 110 }}
      onEndReached={onEnd}
      onEndReachedThreshold={0.6}
      showsVerticalScrollIndicator={false}
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={C.fg2} /> : undefined}
    />
  );
}

export function SectionTitle({ children }: { children: string }) {
  return <Text style={{ color: C.fg, fontSize: 17, fontWeight: '700', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 }}>{children}</Text>;
}
