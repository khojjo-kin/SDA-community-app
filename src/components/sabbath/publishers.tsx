import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { fetchMyPublisher, fetchSabbathPosts } from '../../lib/api';
import { useAppFont } from '../../lib/fonts';
import { useT, type Key } from '../../lib/i18n';
import { useSession } from '../../lib/session';
import { ago, C, errText } from '../../lib/theme';
import type { Publisher, SabbathPost, SabbathPostKind } from '../../lib/types';
import { Icon, IconName, VerifiedTick } from '../Icon';
import { Skeleton, SkeletonFrame } from '../Skeleton';
import { Avatar, SectionLabel } from '../ui';

/** The kinds of post, in the order the editor offers them. */
export const SABBATH_KINDS: { id: SabbathPostKind; label: Key }[] = [
  { id: 'study', label: 'ssPub.kindStudy' },
  { id: 'lesson', label: 'ssPub.kindLesson' },
  { id: 'announcement', label: 'ssPub.kindAnnouncement' },
  { id: 'resource', label: 'ssPub.kindResource' },
];

export const kindLabel = (kind: SabbathPostKind): Key => SABBATH_KINDS.find((k) => k.id === kind)?.label ?? 'ssPub.kindStudy';

/** When a Sabbath School screen was last opened from a tap, so a quick second tap doesn't open it twice. */
let openedAt = 0;

/** Runs `go` unless something was opened a moment ago (a double tap). */
export function openOnce(go: () => void) {
  const now = Date.now();
  if (now - openedAt < 700) return;
  openedAt = now;
  go();
}

/* ---------- the newest posts, kept for the page's next visit ---------- */

let latest: SabbathPost[] | null = null;
let latestAt = 0;
let latestLoad: Promise<SabbathPost[]> | null = null;

/**
 * The newest posts for the Sabbath School page. The page starts this as it opens, beside the
 * lessons, so the row is there with them rather than arriving after and pushing the page down.
 * A copy fetched less than `maxAge` ms ago is used as it is.
 */
export function loadLatestSabbathPosts(maxAge = 0): Promise<SabbathPost[]> {
  if (latest && Date.now() - latestAt < maxAge) return Promise.resolve(latest);
  if (!latestLoad) {
    latestLoad = fetchSabbathPosts(0, 8)
      .then((rows) => {
        latest = rows;
        latestAt = Date.now();
        return rows;
      })
      .finally(() => {
        latestLoad = null;
      });
  }
  return latestLoad;
}

/** A post was written, changed, pinned or deleted: the next visit to the page asks again. */
export function sabbathPostsChanged() {
  latestAt = 0;
}

/** The small labels over a post: its kind, Pinned, and the lesson it goes with. */
export function PostTags({ post }: { post: Pick<SabbathPost, 'kind' | 'pinned' | 'lesson_ref'> }) {
  const t = useT();
  const pill = (label: string, strong?: boolean) => (
    <View style={{ height: 22, paddingHorizontal: 9, borderRadius: 11, justifyContent: 'center', backgroundColor: strong ? C.accentSoft : C.surface2 }}>
      <Text style={{ color: strong ? C.accent2 : C.fg2, fontSize: 11.5, fontWeight: '800', letterSpacing: 0.3 }}>{label.toLocaleUpperCase()}</Text>
    </View>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      {pill(t(kindLabel(post.kind)), true)}
      {post.pinned ? pill(t('ssPub.pinned')) : null}
      {post.lesson_ref ? (
        <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 12.5, fontWeight: '600', flexShrink: 1 }}>
          {post.lesson_ref}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * A post as a card. `width` makes it a card in a row that scrolls sideways (with a cover even when it
 * has no photo). It draws again only when the post changes; pass an `onPress` that stays the same.
 */
export const SabbathPostCard = React.memo(function SabbathPostCard({ post, onPress, width }: { post: SabbathPost; onPress: (post: SabbathPost) => void; width?: number }) {
  const t = useT();
  const font = useAppFont('bold');
  const image = (post.media ?? []).find((m) => m.type === 'image');
  const preview = (post.body ?? '').replace(/\s+/g, ' ').trim();
  const name = post.full_name || post.username;
  return (
    <Pressable
      onPress={() => onPress(post)}
      accessibilityRole="button"
      accessibilityLabel={`${t(kindLabel(post.kind))}, ${post.title}, ${name}`}
      style={({ pressed }) => ({ width, marginHorizontal: width ? 0 : 16, marginBottom: width ? 0 : 12, borderRadius: 18, backgroundColor: C.surface, overflow: 'hidden', opacity: pressed ? 0.85 : 1 })}>
      {image ? (
        <Image source={{ uri: image.url }} recyclingKey={image.url} contentFit="cover" transition={150} cachePolicy="memory-disk" style={{ width: '100%', aspectRatio: 16 / 9, backgroundColor: C.surface2 }} accessibilityIgnoresInvertColors />
      ) : width ? (
        <View style={{ width: '100%', aspectRatio: 16 / 9, backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="lesson" size={40} color={C.accent2} weight={1.6} />
        </View>
      ) : null}
      <View style={{ flex: width ? 1 : undefined, padding: 14, gap: 6 }}>
        <PostTags post={post} />
        <Text numberOfLines={2} style={{ color: C.fg, fontSize: 17, fontWeight: '800', lineHeight: 22, fontFamily: font }}>
          {post.title}
        </Text>
        {preview ? (
          <Text numberOfLines={2} style={{ color: C.fg2, fontSize: 14.5, lineHeight: 20 }}>
            {preview}
          </Text>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: width ? 'auto' : 4, paddingTop: 4 }}>
          <Avatar uri={post.avatar_url} name={name} size={22} />
          <Text numberOfLines={1} style={{ color: C.fg, fontSize: 13.5, fontWeight: '600', flexShrink: 1 }}>
            {name}
          </Text>
          {post.verified ? <VerifiedTick size={14} /> : null}
          <Text style={{ color: C.fg3, fontSize: 13 }}>· {ago(post.created_at)}</Text>
        </View>
      </View>
    </Pressable>
  );
});

/** Cards' worth of loading shapes, for the list of posts. */
export function PostCardsSkeleton() {
  const { width } = useWindowDimensions();
  return (
    <SkeletonFrame style={{ paddingTop: 6, gap: 12 }}>
      {[250, 150, 150].map((h, i) => (
        <Skeleton key={i} width={width - 32} height={h} radius={18} x={16} style={{ marginHorizontal: 16 }} />
      ))}
    </SkeletonFrame>
  );
}

/** My request to publish as last known in this session, by account. */
const publisherOf = new Map<string, Publisher | null>();

/**
 * My request to publish (undefined while it is being found out), whether I can publish now (approved,
 * or an admin), and `error` when it couldn't be found out at all (no connection, say).
 */
export function usePublishing() {
  const { me, profile } = useSession();
  const [publisher, setPublisher] = useState<Publisher | null | undefined>(() => (me && publisherOf.has(me) ? publisherOf.get(me) : undefined));
  const [error, setError] = useState('');
  const known = useRef(publisher);
  known.current = publisher;
  const reload = useCallback(() => {
    if (!me) return;
    setError('');
    fetchMyPublisher(me)
      .then((p) => {
        publisherOf.set(me, p);
        setPublisher(p);
      })
      // Not knowing isn't the same as never having asked: what was known stays, and nothing is guessed.
      .catch((e) => {
        if (known.current === undefined) setError(errText(e));
      });
  }, [me]);
  const canPublish = !!profile?.admin_role || publisher?.status === 'approved';
  return { publisher, canPublish, reload, error };
}

const ENTRY_ICON: Record<Publisher['status'] | 'none', IconName> = { none: 'compose', pending: 'clock', rejected: 'info', revoked: 'block', approved: 'check' };

/** "Become a publisher", or where my request has got to. Members under 14 can't ask, so it isn't shown to them. */
export function PublisherEntry({ publisher }: { publisher: Publisher | null | undefined }) {
  const router = useRouter();
  const t = useT();
  const { profile } = useSession();
  if (profile?.restricted || publisher === undefined || publisher?.status === 'approved') return null;
  const label = publisher?.status === 'pending' ? t('ssPub.pending') : publisher?.status === 'rejected' ? t('ssPub.rejected') : publisher?.status === 'revoked' ? t('ssPub.revoked') : t('ssPub.become');
  return (
    <Pressable onPress={() => openOnce(() => router.push('/sabbath-publisher' as any))} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginTop: 6, paddingVertical: 10, opacity: pressed ? 0.6 : 1 })}>
      <Icon name={ENTRY_ICON[publisher?.status ?? 'none']} size={18} color={C.accent2} weight={2} />
      <Text style={{ flex: 1, color: C.accent2, fontSize: 14.5, fontWeight: '700' }}>{label}</Text>
      <Icon name="right" size={14} color={C.fg3} weight={2.2} />
    </Pressable>
  );
}

/**
 * "From our publishers" on the Sabbath School page: the newest posts in a row that scrolls sideways,
 * See all for the rest, + for publishers, and the way to ask to become one for everyone else.
 * `refresh` changes on pull to refresh.
 */
export function PublishersSection({ refresh }: { refresh: number }) {
  const router = useRouter();
  const t = useT();
  const { width } = useWindowDimensions();
  // Shown at once from the last visit (or the load the page started); brought up to date on each visit.
  const [posts, setPosts] = useState<SabbathPost[] | null>(() => latest);
  const { publisher, canPublish, reload } = usePublishing();

  const load = useCallback(
    (maxAge: number) => {
      loadLatestSabbathPosts(maxAge)
        .then(setPosts)
        .catch(() => setPosts((p) => p ?? []));
      reload();
    },
    [reload],
  );
  // Each visit brings them up to date (a copy from the last few seconds, such as the page's own, will do);
  // pull to refresh always asks again.
  useFocusEffect(useCallback(() => load(5000), [load]));
  useEffect(() => {
    if (refresh) load(0);
  }, [refresh, load]);

  const open = useCallback((p: SabbathPost) => openOnce(() => router.push({ pathname: '/sabbath-post/[id]', params: { id: p.id } } as any)), [router]);
  if (posts === null) return null;
  const write = () => openOnce(() => router.push('/sabbath-post-edit' as any));
  if (!posts.length && !canPublish) return <PublisherEntry publisher={publisher} />;

  const card = Math.min(300, Math.round(width * 0.78));
  const right = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      {posts.length ? (
        <Pressable onPress={() => openOnce(() => router.push('/sabbath-posts' as any))} hitSlop={8} accessibilityRole="button" style={({ pressed }) => ({ paddingHorizontal: 6, opacity: pressed ? 0.6 : 1 })}>
          <Text style={{ color: C.accent2, fontSize: 15, fontWeight: '700' }}>{t('ssPub.seeAll')}</Text>
        </Pressable>
      ) : null}
      {canPublish ? (
        <Pressable onPress={write} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('ssPub.publish')} style={({ pressed }) => ({ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: C.accent, opacity: pressed ? 0.75 : 1 })}>
          <Icon name="plus" size={18} color={C.onAccent} weight={2.6} />
        </Pressable>
      ) : null}
    </View>
  );

  return (
    <>
      <SectionLabel strong right={right}>
        {t('ssPub.section')}
      </SectionLabel>
      {posts.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} decelerationRate="fast" snapToInterval={card + 12} snapToAlignment="start" contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}>
          {posts.map((p) => (
            <SabbathPostCard key={p.id} post={p} width={card} onPress={open} />
          ))}
        </ScrollView>
      ) : (
        <Pressable onPress={write} accessibilityRole="button" style={({ pressed }) => ({ marginHorizontal: 16, height: 96, borderRadius: 18, borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.fg3, alignItems: 'center', justifyContent: 'center', gap: 6, opacity: pressed ? 0.6 : 1 })}>
          <Icon name="pluscircle" size={26} color={C.accent2} />
          <Text style={{ color: C.fg, fontSize: 15, fontWeight: '700' }}>{t('ssPub.publishFirst')}</Text>
        </Pressable>
      )}
      {canPublish ? null : <PublisherEntry publisher={publisher} />}
    </>
  );
}
