import React, { useRef, useState } from 'react';
import { Alert, Animated, NativeScrollEvent, NativeSyntheticEvent, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { deletePost, report, setBlock, setFlag, setFollow, setPostSensitive } from '../lib/api';
import { useIsActivePost } from '../lib/autoplay';
import { COPYRIGHT_REASON, explainCopyrightReport } from '../lib/copyright-report';
// Named feel here because this card has a tap() of its own (the double tap on the photo).
import { tap as feel } from '../lib/haptics';
import { t } from '../lib/i18n';
import { useSession } from '../lib/session';
import { usePost } from '../lib/store';
import { agoLong, C, dayLabel, errText, fmt } from '../lib/theme';
import type { Post } from '../lib/types';
import { FeedVideo } from './FeedVideo';
import { BurstHeart, Icon, IconName, VerifiedTick } from './Icon';
import { useLegalSheet } from './LegalDocument';
import { Avatar, Button, IconButton, Sheet, SheetRow, useChoices, useToast } from './ui';

const REASONS = ['Spam', 'Nudity or sexual content', 'Harassment or hate', COPYRIGHT_REASON, 'Something else'];

/** The photo frame: a gutter either side and rounded corners, so posts read as cards rather than a full-bleed strip. */
const MEDIA_GUTTER = 10;
const MEDIA_RADIUS = 14;

/** The "…" menu shared by feed posts and reels. */
export function PostMenu({ post, visible, onClose }: { post: Post; visible: boolean; onClose: () => void }) {
  const { me } = useSession();
  const toast = useToast();
  const router = useRouter();
  const mine = post.user_id === me;
  // The Copyright policy, offered after a copyright report.
  const legal = useLegalSheet();
  // The reasons for a report: an alert on iPhone, a sheet on Android (whose alerts hold only three buttons).
  const choices = useChoices();
  // A running ad can be topped up: the new days are added on after the current ones.
  const promotedUntil = post.boosted && post.boosted_until && new Date(post.boosted_until) > new Date() ? dayLabel(new Date(post.boosted_until)) : '';
  const act = (fn: () => Promise<void> | void) => async () => {
    onClose();
    // Give the sheet time to slide away; iOS drops an alert shown while a modal is closing.
    await new Promise((r) => setTimeout(r, 380));
    try {
      await fn();
    } catch (e) {
      toast(errText(e));
    }
  };
  function fileReport(reason: string) {
    report(me, { postId: post.id, userId: post.user_id }, reason)
      .then(() => {
        // A copyright report also says how to send a formal notice.
        if (reason !== COPYRIGHT_REASON) toast('Thanks. We will review this post.');
        else explainCopyrightReport().then((read) => { if (read) legal.open('copyright'); });
      })
      .catch((e) => toast(errText(e)));
  }
  return (
    <>
    <Sheet visible={visible} onClose={onClose}>
      <SheetRow first icon="bookmark" label={post.saved ? 'Remove from saved' : 'Save'} onPress={act(async () => { await setFlag(me, post, 'saved', !post.saved); toast(post.saved ? 'Removed from saved' : 'Saved'); })} />
      <SheetRow icon="link" label="Copy link" onPress={act(async () => { await Clipboard.setStringAsync(`community://post/${post.id}`); toast('Link copied'); })} />
      {mine ? (
        <>
          {/* Ads are paid for, a day at a time: a promoted post leads For you and Explore, labelled Sponsored. */}
          <SheetRow icon="megaphone" label="Promote" sub={promotedUntil ? `Promoted until ${promotedUntil}` : 'Pay to show it to more people'} onPress={act(() => router.push(`/promote/${post.id}`))} />
          <SheetRow
            icon="eye"
            label={post.sensitive ? 'Unmark sensitive' : 'Mark as sensitive'}
            sub="Hidden from members under 14"
            onPress={act(async () => {
              await setPostSensitive(post.id, !post.sensitive);
              toast(post.sensitive ? 'No longer marked sensitive' : 'Marked as sensitive');
            })}
          />
          <SheetRow
            icon="trash"
            label="Delete"
            danger
            onPress={act(() =>
              Alert.alert('Delete this post?', 'It will be removed from your profile and from everyone\'s feed.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: () => deletePost(post.id).then(() => toast('Post deleted')).catch((e) => toast(errText(e))) },
              ]),
            )}
          />
        </>
      ) : (
        <>
          <SheetRow icon="user" label="About this account" onPress={act(() => router.push(`/user/${post.user_id}`))} />
          <SheetRow icon="people" label={post.following_author ? 'Unfollow' : 'Follow'} onPress={act(async () => { await setFollow(me, post.user_id, !post.following_author); toast(post.following_author ? `Unfollowed ${post.username}` : `Following ${post.username}`); })} />
          <SheetRow
            icon="flag"
            label="Report"
            danger
            onPress={act(() =>
              choices.ask({
                title: 'Report this post',
                message: 'Why are you reporting it?',
                icon: 'flag',
                choices: REASONS.map((r) => ({ label: r === COPYRIGHT_REASON ? t('report.copyright') : r, onPress: () => fileReport(r) })),
              }),
            )}
          />
          <SheetRow
            icon="block"
            label={`Block ${post.username}`}
            danger
            onPress={act(() =>
              Alert.alert(`Block ${post.username}?`, 'You will stop seeing their posts, stories and comments. They are not told.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Block', style: 'destructive', onPress: () => { setBlock(me, post.user_id, true).then(() => toast(`Blocked ${post.username}`)).catch((e) => toast(errText(e))); } },
              ]),
            )}
          />
        </>
      )}
    </Sheet>
    {choices.element}
    {legal.element}
    </>
  );
}

function Act({ icon, count, onPress, label, color, fill, end }: { icon: IconName; count?: number; onPress: () => void; label: string; color?: string; fill?: boolean; end?: boolean }) {
  return (
    <Pressable onPress={onPress} hitSlop={6} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 34, marginLeft: end ? 'auto' : 0, opacity: pressed ? 0.6 : 1 })}>
      <Icon name={icon} color={color ?? C.fg} fill={fill} />
      {count ? <Text style={{ color: C.fg, fontWeight: '600', fontSize: 13.5, fontVariant: ['tabular-nums'] }}>{fmt(count)}</Text> : null}
    </Pressable>
  );
}

export const PostCard = React.memo(function PostCard({ id }: { id: string }) {
  const post = usePost(id);
  const { me } = useSession();
  const router = useRouter();
  const toast = useToast();
  const { width } = useWindowDimensions();
  const [menu, setMenu] = useState(false);
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState(false);
  const [burst, setBurst] = useState<{ x: number; y: number } | null>(null);
  const anim = useRef(new Animated.Value(0)).current;
  const lastTap = useRef(0);
  const inView = useIsActivePost(id);

  if (!post) return null;
  const first = post.media[0];
  const ratio = first?.w && first?.h ? Math.min(1.25, Math.max(0.52, first.h / first.w)) : 1.25;
  // The media sits in a rounded frame with a 10px gutter either side.
  const mediaW = width - MEDIA_GUTTER * 2;
  const height = Math.round(mediaW * ratio);
  const many = post.media.length > 1;
  const mine = post.user_id === me;
  const song = post.audio_title ? (post.audio_artist ? `${post.audio_title} · ${post.audio_artist}` : post.audio_title) : '';

  const safe = (fn: () => Promise<void>) => fn().catch((e) => toast(errText(e)));

  function like(force?: boolean) {
    const next = force ?? !post!.liked;
    // Through haptics.ts, so a member who turned taps off in Settings doesn't feel one.
    if (next && !post!.liked) feel('light');
    safe(() => setFlag(me, post!, 'liked', next));
  }

  /** Returns true when this tap completed a double tap, so a video can tell a like from a single tap. */
  function tap(x: number, y: number): boolean {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      lastTap.current = 0;
      like(true);
      setBurst({ x, y });
      anim.setValue(0);
      Animated.sequence([Animated.spring(anim, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }), Animated.delay(320), Animated.timing(anim, { toValue: 2, duration: 240, useNativeDriver: true })]).start(({ finished }) => { if (finished) setBurst(null); });
      return true;
    }
    lastTap.current = now;
    return false;
  }

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => setPage(Math.round(e.nativeEvent.contentOffset.x / mediaW));
  const long = post.caption.length > 110;

  return (
    <View style={{ paddingBottom: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 12, paddingRight: 4, paddingVertical: 8 }}>
        <Pressable onPress={() => router.push(`/user/${post.user_id}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }} accessibilityRole="button" accessibilityLabel={`Open ${post.username}'s profile`}>
          <Avatar uri={post.avatar_url} name={post.full_name} size={34} />
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text numberOfLines={1} style={{ color: C.fg, fontWeight: '600', flexShrink: 1 }}>{post.username}</Text>
              {post.verified ? <VerifiedTick size={14} /> : null}
            </View>
            {/* A paid ad says so plainly, under the name, so it never passes for an ordinary post. */}
            {post.boosted ? (
              <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 12.5 }}>
                Sponsored
                {post.group_id && post.group_name ? (
                  <>
                    {' · in '}
                    <Text style={{ color: C.fg, fontWeight: '600' }} onPress={() => router.push({ pathname: '/group/[id]', params: { id: post.group_id } } as any)}>{post.group_name}</Text>
                  </>
                ) : null}
              </Text>
            ) : post.group_id && post.group_name ? (
              <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 12.5 }} onPress={() => router.push({ pathname: '/group/[id]', params: { id: post.group_id } } as any)} accessibilityRole="link" accessibilityLabel={`In ${post.group_name}`}>
                in <Text style={{ color: C.fg, fontWeight: '600' }}>{post.group_name}</Text>
              </Text>
            ) : !mine && !post.following_author ? (
              <Text style={{ color: C.fg2, fontSize: 12.5 }}>Suggested for you</Text>
            ) : null}
          </View>
        </Pressable>
        {!mine && !post.following_author && !post.in_my_group ? <Button small label="Follow" onPress={() => safe(() => setFollow(me, post.user_id, true))} /> : null}
        <IconButton name="more" label="More options" onPress={() => setMenu(true)} />
      </View>

      <View style={{ marginHorizontal: MEDIA_GUTTER, width: mediaW, height, borderRadius: MEDIA_RADIUS, overflow: 'hidden', backgroundColor: C.bg2 }}>
        <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={onScroll} scrollEnabled={many}>
          {post.media.map((m, i) =>
            m.type === 'video' ? (
              // Plays by itself while this post is the one in view and this page of it is showing.
              <FeedVideo key={i} post={post} media={m} width={mediaW} height={height} active={inView && i === page} onTap={tap} />
            ) : (
              <Pressable key={i} onPress={(e) => tap(e.nativeEvent.locationX, e.nativeEvent.locationY)} accessibilityLabel="Photo. Double tap to like.">
                <Image source={{ uri: m.url }} style={{ width: mediaW, height }} contentFit="cover" transition={150} />
              </Pressable>
            ),
          )}
        </ScrollView>
        {many ? (
          <View style={{ position: 'absolute', top: 12, right: 12, backgroundColor: 'rgba(10,12,14,0.7)', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 12 }}>
            <Text style={{ color: '#fff', fontSize: 12 }}>{page + 1}/{post.media.length}</Text>
          </View>
        ) : null}
        {burst ? (
          <Animated.View pointerEvents="none" style={{ position: 'absolute', left: burst.x - 55, top: burst.y - 55, opacity: anim.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 1, 0] }), transform: [{ scale: anim.interpolate({ inputRange: [0, 1, 2], outputRange: [0.2, 1, 1.15] }) }, { translateY: anim.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 0, -60] }) }, { rotate: '-10deg' }] }}>
            <BurstHeart />
          </Animated.View>
        ) : null}
      </View>

      {many ? (
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 4, paddingTop: 10 }}>
          {post.media.map((_, i) => (
            <View key={i} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: i === page ? C.accent2 : C.surface2 }} />
          ))}
        </View>
      ) : null}

      {song ? (
        <View style={{ flexDirection: 'row', paddingHorizontal: 14, paddingTop: 8 }}>
          <Pressable
            onPress={() => { if (post.audio_id) router.push(`/pod/${post.audio_id}`); }}
            accessibilityRole="button"
            accessibilityLabel={`Song: ${song}. Open in Pod`}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '100%', height: 26, paddingLeft: 8, paddingRight: 11, borderRadius: 13, backgroundColor: pressed ? C.surface2 : C.surface })}>
            <Icon name="music" size={13} color={C.accent2} weight={2.2} />
            <Text numberOfLines={1} style={{ color: C.fg, fontSize: 12.5, fontWeight: '600', flexShrink: 1 }}>{song}</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 12, paddingTop: 8 }}>
        <Act icon="heart" count={post.like_count} label={post.liked ? 'Unlike' : 'Like'} color={post.liked ? C.like : C.fg} fill={post.liked} onPress={() => like()} />
        <Act icon="comment" count={post.comment_count} label="Comments" onPress={() => router.push(`/comments/${post.id}`)} />
        <Act icon="repost" count={post.repost_count} label={post.reposted ? 'Remove repost' : 'Repost'} color={post.reposted ? C.ok : C.fg} onPress={() => safe(async () => { await setFlag(me, post, 'reposted', !post.reposted); toast(post.reposted ? 'Repost removed' : 'Reposted to your profile'); })} />
        <Act icon="send" label="Share" onPress={() => router.push(`/share/${post.id}`)} />
        <Act icon="bookmark" label={post.saved ? 'Remove from saved' : 'Save'} fill={post.saved} end onPress={() => safe(async () => { await setFlag(me, post, 'saved', !post.saved); toast(post.saved ? 'Removed from saved' : 'Saved'); })} />
      </View>

      {post.caption ? (
        <Text style={{ color: C.fg, paddingHorizontal: 14, paddingTop: 4, lineHeight: 20 }} selectable>
          <Text style={{ fontWeight: '600' }} onPress={() => router.push(`/user/${post.user_id}`)}>{post.username}</Text>{' '}
          {long && !open ? post.caption.slice(0, 100).trimEnd() + '… ' : post.caption}
          {long && !open ? <Text style={{ color: C.fg2 }} onPress={() => setOpen(true)}>more</Text> : null}
        </Text>
      ) : null}
      {post.comment_count > 0 ? (
        <Pressable onPress={() => router.push(`/comments/${post.id}`)} style={{ paddingHorizontal: 14, paddingTop: 4 }}>
          <Text style={{ color: C.fg2, fontSize: 13.5 }}>{post.comment_count > 1 ? `View all ${fmt(post.comment_count)} comments` : 'View 1 comment'}</Text>
        </Pressable>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingTop: 4 }}>
        <Text style={{ color: C.fg2, fontSize: 12 }}>{agoLong(post.created_at)}</Text>
        {/* Only the author's subscribers (and the author) can see this one, so it says so. */}
        {post.audience === 'subscribers' ? (
          <View accessibilityLabel="For subscribers only" style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: 20, paddingHorizontal: 7, borderRadius: 10, backgroundColor: C.accentSoft }}>
            <Icon name="lock" size={11} color={C.accent2} weight={2.4} />
            <Text style={{ color: C.accent2, fontSize: 11.5, fontWeight: '700' }}>Subscribers</Text>
          </View>
        ) : null}
      </View>

      <PostMenu post={post} visible={menu} onClose={() => setMenu(false)} />
    </View>
  );
});
