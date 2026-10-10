import React, { useRef, useState } from 'react';
import { Alert, Animated, NativeScrollEvent, NativeSyntheticEvent, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { deletePost, followOrRequest, removeFollowRequest, report, setBlock, setFlag, setFollow, setPostSensitive } from '../lib/api';
import { useIsActivePost } from '../lib/autoplay';
import { COPYRIGHT_REASON, explainCopyrightReport } from '../lib/copyright-report';
// Named feel here because this card has a tap() of its own (the double tap on the photo).
import { tap as feel } from '../lib/haptics';
import { t } from '../lib/i18n';
import { reduceMotionNow } from '../lib/motion';
import { useSession } from '../lib/session';
import { dropAuthor, usePost } from '../lib/store';
import { agoLong, C, dayLabel, errText, fmt } from '../lib/theme';
import type { Post } from '../lib/types';
import { FeedVideo } from './FeedVideo';
import { BurstHeart, Icon, IconName, VerifiedTick } from './Icon';
import { useLegalSheet } from './LegalDocument';
import { AiInfo, PollCard, PromptCard, TagsButton } from './PostExtras';
import { Avatar, Button, IconButton, Sheet, SheetRow, useChoices, useToast } from './ui';

const REASONS = ['Spam', 'Nudity or sexual content', 'Harassment or hate', COPYRIGHT_REASON, 'Something else'];

/** The photo frame: a gutter either side and rounded corners, so posts read as cards rather than a full-bleed strip. */
const MEDIA_GUTTER = 10;
const MEDIA_RADIUS = 14;

/** A caption longer than this, or of more than two lines, is cut short with "more". */
const CAPTION_CUT = 110;

/**
 * One tap, one screen: a second tap (on this card or another) while the first screen is still
 * opening is ignored, so a quick double tap never opens a profile or the comments twice.
 */
let lastOpen = 0;
function openOnce(open: () => void) {
  const now = Date.now();
  if (now - lastOpen < 600) return;
  lastOpen = now;
  open();
}

/**
 * The "…" menu shared by feed posts and reels. `onBlocked` hears when the author has been blocked
 * from here (a feed then takes their posts away at once).
 */
export function PostMenu({ post, visible, onClose, onBlocked }: { post: Post; visible: boolean; onClose: () => void; onBlocked?: (userId: string) => void }) {
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
          <SheetRow icon="megaphone" label="Promote" sub={promotedUntil ? `Promoted until ${promotedUntil}` : undefined} onPress={act(() => router.push(`/promote/${post.id}`))} />
          <SheetRow
            icon="eye"
            label={post.sensitive ? 'Unmark sensitive' : 'Mark as sensitive'}
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
          <SheetRow
            icon="people"
            label={post.following_author ? 'Unfollow' : 'Follow'}
            onPress={act(async () => {
              if (post.following_author) {
                await setFollow(me, post.user_id, false);
                toast(`Unfollowed ${post.username}`);
                return;
              }
              // A private account can't be followed outright: that becomes a request.
              const now = await followOrRequest(me, post.user_id);
              toast(now === 'requested' ? `Requested to follow ${post.username}` : `Following ${post.username}`);
            })}
          />
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
                {
                  text: 'Block',
                  style: 'destructive',
                  onPress: () => {
                    setBlock(me, post.user_id, true)
                      .then(() => {
                        toast(`Blocked ${post.username}`);
                        onBlocked?.(post.user_id);
                      })
                      .catch((e) => toast(errText(e)));
                  },
                },
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

/** One button in the row under the photo. `scale` lets the heart pop when a post is liked. */
function Act({ icon, count, onPress, label, color, fill, end, scale }: { icon: IconName; count?: number; onPress: () => void; label: string; color?: string; fill?: boolean; end?: boolean; scale?: Animated.Value }) {
  const glyph = <Icon name={icon} color={color ?? C.fg} fill={fill} />;
  return (
    <Pressable onPress={onPress} hitSlop={6} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 36, marginLeft: end ? 'auto' : 0, opacity: pressed ? 0.6 : 1 })}>
      {scale ? <Animated.View style={{ transform: [{ scale }] }}>{glyph}</Animated.View> : glyph}
      {count ? <Text style={{ color: C.fg, fontWeight: '600', fontSize: 14, fontVariant: ['tabular-nums'] }}>{fmt(count)}</Text> : null}
    </Pressable>
  );
}

/**
 * A post in a feed. `suggest` (Home) labels posts from accounts you don't follow "Suggested for you";
 * elsewhere (a profile's posts, a post's own page) they are simply that account's posts.
 */
export const PostCard = React.memo(function PostCard({ id, suggest }: { id: string; suggest?: boolean }) {
  const post = usePost(id);
  const { me } = useSession();
  const router = useRouter();
  const toast = useToast();
  const { width } = useWindowDimensions();
  const [menu, setMenu] = useState(false);
  // The menu (three sheets and their hooks) is only put together once someone opens it, then kept, so a
  // long feed doesn't carry one per card while it scrolls.
  const [menuUsed, setMenuUsed] = useState(false);
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState(false);
  const [burst, setBurst] = useState<{ x: number; y: number } | null>(null);
  // Followed (or asked to follow) with this card's own button: the button stays, saying Following or
  // Requested, so a second tap undoes it, instead of vanishing from under the finger.
  const [touched, setTouched] = useState(false);
  const [requested, setRequested] = useState(false);
  const followBusy = useRef(false);
  const anim = useRef(new Animated.Value(0)).current;
  // The heart under the photo grows for a moment when the post is liked.
  const pop = useRef(new Animated.Value(1)).current;
  const lastTap = useRef(0);
  const inView = useIsActivePost(id);

  if (!post) return null;
  const media = post.media ?? [];
  const first = media[0];
  // Portrait down to 4:5 and landscape up to 1.91:1, as Instagram shows them; a size that can't be read is drawn 4:5.
  const shape = Number(first?.h) / Number(first?.w);
  const ratio = Number.isFinite(shape) && shape > 0 ? Math.min(1.25, Math.max(0.52, shape)) : 1.25;
  // The media sits in a rounded frame with a 10px gutter either side.
  const mediaW = width - MEDIA_GUTTER * 2;
  const height = Math.round(mediaW * ratio);
  const many = media.length > 1;
  const mine = post.user_id === me;
  // Only the author can comment on a post with comments turned off.
  const commentsClosed = !!post.comments_off && !mine;
  const song = post.audio_title ? (post.audio_artist ? `${post.audio_title} · ${post.audio_artist}` : post.audio_title) : '';
  const showFollow = !mine && !post.in_my_group && (touched || !post.following_author);

  const safe = (fn: () => Promise<void>) => fn().catch((e) => toast(errText(e)));
  const go = (href: string) => openOnce(() => router.push(href as any));
  const openGroup = () => openOnce(() => router.push({ pathname: '/group/[id]', params: { id: post.group_id } } as any));

  function like(force?: boolean) {
    const next = force ?? !post!.liked;
    if (next && !post!.liked) {
      // Through haptics.ts, so a member who turned taps off in Settings doesn't feel one.
      feel('light');
      if (!reduceMotionNow()) {
        pop.setValue(1);
        Animated.sequence([
          Animated.timing(pop, { toValue: 1.28, duration: 110, useNativeDriver: true }),
          Animated.spring(pop, { toValue: 1, friction: 4, tension: 180, useNativeDriver: true }),
        ]).start();
      }
    }
    safe(() => setFlag(me, post!, 'liked', next));
  }

  async function follow() {
    // A second tap while the first is on its way would undo it half done.
    if (followBusy.current) return;
    followBusy.current = true;
    setTouched(true);
    const p = post!;
    try {
      if (p.following_author) await setFollow(me, p.user_id, false);
      else if (requested) {
        setRequested(false);
        try {
          await removeFollowRequest(me, p.user_id);
        } catch (e) {
          setRequested(true);
          throw e;
        }
      } else if ((await followOrRequest(me, p.user_id)) === 'requested') setRequested(true);
    } catch (e) {
      toast(errText(e));
    } finally {
      followBusy.current = false;
    }
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

  // The dots and the "2/5" follow the swipe as it passes halfway, not only once it has settled.
  const onPage = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.max(0, Math.min(media.length - 1, Math.round(e.nativeEvent.contentOffset.x / mediaW)));
    if (next !== page) setPage(next);
  };
  const caption = post.caption ?? '';
  const lines = caption.split('\n');
  const long = caption.length > CAPTION_CUT || lines.length > 2;
  const cut = long ? lines.slice(0, 2).join('\n').slice(0, 100).trimEnd() : caption;

  return (
    <View style={{ paddingBottom: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 12, paddingRight: 4, paddingVertical: 8 }}>
        <Pressable onPress={() => go(`/user/${post.user_id}`)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, opacity: pressed ? 0.7 : 1 })} accessibilityRole="button" accessibilityLabel={`Open ${post.username}'s profile`}>
          <Avatar uri={post.avatar_url} name={post.full_name} size={34} />
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text numberOfLines={1} style={{ color: C.fg, fontWeight: '600', fontSize: 14, flexShrink: 1 }}>{post.username}</Text>
              {post.verified ? <VerifiedTick size={14} /> : null}
            </View>
            {/* A paid ad says so plainly, under the name, so it never passes for an ordinary post. */}
            {post.boosted ? (
              <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 12.5 }}>
                Sponsored
                {post.group_id && post.group_name ? (
                  <>
                    {' · in '}
                    <Text style={{ color: C.fg, fontWeight: '600' }} onPress={openGroup}>{post.group_name}</Text>
                  </>
                ) : null}
              </Text>
            ) : post.group_id && post.group_name ? (
              <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 12.5 }} onPress={openGroup} accessibilityRole="link" accessibilityLabel={`In ${post.group_name}`}>
                in <Text style={{ color: C.fg, fontWeight: '600' }}>{post.group_name}</Text>
              </Text>
            ) : suggest && !mine && (touched || !post.following_author) ? (
              <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 12.5 }}>Suggested for you</Text>
            ) : null}
            {post.ai_label ? <AiInfo /> : null}
          </View>
        </Pressable>
        {showFollow ? (
          <Button small kind={post.following_author || requested ? 'ghost' : 'primary'} label={post.following_author ? t('common.following') : requested ? t('profile.requested') : t('common.follow')} onPress={follow} />
        ) : null}
        <IconButton name="more" label="More options" onPress={() => { setMenuUsed(true); setMenu(true); }} />
      </View>

      {media.length ? (
        <View style={{ marginHorizontal: MEDIA_GUTTER, width: mediaW, height, borderRadius: MEDIA_RADIUS, overflow: 'hidden', backgroundColor: C.bg2 }}>
          <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} onScroll={many ? onPage : undefined} scrollEventThrottle={32} onMomentumScrollEnd={onPage} scrollEnabled={many}>
            {media.map((m, i) =>
              m.type === 'video' ? (
                // Plays by itself while this post is the one in view and this page of it is showing.
                <FeedVideo key={i} post={post} media={m} width={mediaW} height={height} active={inView && i === page} onTap={tap} />
              ) : (
                <Pressable key={i} onPress={(e) => tap(e.nativeEvent.locationX, e.nativeEvent.locationY)} accessibilityLabel={m.alt ? `${m.alt}. Double tap to like.` : "Photo. Double tap to like."}>
                  <Image source={{ uri: m.url }} style={{ width: mediaW, height }} contentFit="cover" transition={150} cachePolicy="memory-disk" />
                </Pressable>
              ),
            )}
          </ScrollView>
          {many ? (
            <View pointerEvents="none" style={{ position: 'absolute', top: 12, right: 12, backgroundColor: 'rgba(10,12,14,0.7)', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 12 }}>
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{page + 1}/{media.length}</Text>
            </View>
          ) : null}
          {burst ? (
            <Animated.View pointerEvents="none" style={{ position: 'absolute', left: burst.x - 55, top: burst.y - 55, opacity: anim.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 1, 0] }), transform: [{ scale: anim.interpolate({ inputRange: [0, 1, 2], outputRange: [0.2, 1, 1.15] }) }, { translateY: anim.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 0, -60] }) }, { rotate: '-10deg' }] }}>
              <BurstHeart />
            </Animated.View>
          ) : null}
          {post.tagged_ids?.length ? <TagsButton ids={post.tagged_ids} top={media.some((m) => m.type === 'video')} /> : null}
        </View>
      ) : null}

      {many ? (
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 4, paddingTop: 10 }}>
          {media.map((_, i) => (
            <View key={i} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: i === page ? C.accent2 : C.fg3, opacity: i === page ? 1 : 0.45 }} />
          ))}
        </View>
      ) : null}

      <PollCard post={post} />
      <PromptCard post={post} />

      {song ? (
        <View style={{ flexDirection: 'row', paddingHorizontal: 14, paddingTop: 8 }}>
          <Pressable
            onPress={() => { if (post.audio_id) go(`/pod/${post.audio_id}`); }}
            accessibilityRole="button"
            accessibilityLabel={`Song: ${song}. Open in Pod`}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '100%', height: 26, paddingLeft: 8, paddingRight: 11, borderRadius: 13, backgroundColor: pressed ? C.surface2 : C.surface })}>
            <Icon name="music" size={13} color={C.accent2} weight={2.2} />
            <Text numberOfLines={1} style={{ color: C.fg, fontSize: 12.5, fontWeight: '600', flexShrink: 1 }}>{song}</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 10, paddingTop: 6 }}>
        {/* A hidden like count is still shown to the author. */}
        <Act icon="heart" count={post.hide_likes && !mine ? undefined : post.like_count} label={post.liked ? 'Unlike' : 'Like'} color={post.liked ? C.like : C.fg} fill={post.liked} scale={pop} onPress={() => like()} />
        {commentsClosed ? null : <Act icon="comment" count={post.comment_count} label="Comments" onPress={() => go(`/comments/${post.id}`)} />}
        <Act icon="repost" count={post.repost_count} label={post.reposted ? 'Remove repost' : 'Repost'} color={post.reposted ? C.ok : C.fg} onPress={() => safe(async () => { await setFlag(me, post, 'reposted', !post.reposted); toast(post.reposted ? 'Repost removed' : 'Reposted to your profile'); })} />
        <Act icon="send" label="Share" onPress={() => go(`/share/${post.id}`)} />
        <Act icon="bookmark" label={post.saved ? 'Remove from saved' : 'Save'} fill={post.saved} end onPress={() => safe(async () => { await setFlag(me, post, 'saved', !post.saved); toast(post.saved ? 'Removed from saved' : 'Saved'); })} />
      </View>

      {caption ? (
        <Text style={{ color: C.fg, fontSize: 14, paddingHorizontal: 14, paddingTop: 4, lineHeight: 20 }} selectable>
          <Text style={{ fontWeight: '600' }} onPress={() => go(`/user/${post.user_id}`)}>{post.username}</Text>{' '}
          {long && !open ? cut + '… ' : caption}
          {long && !open ? <Text style={{ color: C.fg2 }} onPress={() => setOpen(true)}>more</Text> : null}
        </Text>
      ) : null}
      {commentsClosed ? (
        <Text style={{ color: C.fg2, fontSize: 13.5, paddingHorizontal: 14, paddingTop: 4 }}>{t('postExtras.commentsOff')}</Text>
      ) : post.comment_count > 0 ? (
        <Pressable onPress={() => go(`/comments/${post.id}`)} accessibilityRole="button" style={({ pressed }) => ({ alignSelf: 'flex-start', paddingHorizontal: 14, paddingTop: 4, opacity: pressed ? 0.6 : 1 })}>
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

      {menuUsed ? <PostMenu post={post} visible={menu} onClose={() => setMenu(false)} onBlocked={dropAuthor} /> : null}
    </View>
  );
});
