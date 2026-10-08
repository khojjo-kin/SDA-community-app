import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { setFlag, setFollow } from '../lib/api';
import { useSession } from '../lib/session';
import { usePost } from '../lib/store';
import { C, errText, fmt } from '../lib/theme';
import { BurstHeart, Icon, IconName } from './Icon';
import { PostMenu } from './PostCard';
import { Avatar, useToast } from './ui';

function Rail({ icon, count, label, onPress, color, fill }: { icon: IconName; count?: number; label: string; onPress: () => void; color?: string; fill?: boolean }) {
  return (
    <Pressable onPress={onPress} hitSlop={6} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => ({ alignItems: 'center', gap: 3, opacity: pressed ? 0.6 : 1 })}>
      <Icon name={icon} size={30} color={color ?? '#fff'} fill={fill} />
      {count !== undefined ? <Text style={{ color: '#fff', fontSize: 12.5, fontWeight: '600' }}>{fmt(count)}</Text> : null}
    </Pressable>
  );
}

export function Reel({ id, active, height, width, bottomInset }: { id: string; active: boolean; height: number; width: number; bottomInset: number }) {
  const post = usePost(id);
  const { me } = useSession();
  const router = useRouter();
  const toast = useToast();
  const media = post?.media[0];
  const player = useVideoPlayer(media?.type === 'video' ? media.url : null, (p) => {
    p.loop = true;
  });
  const [paused, setPaused] = useState(false);
  const [menu, setMenu] = useState(false);
  const [progress, setProgress] = useState(0);
  const [burst, setBurst] = useState<{ x: number; y: number } | null>(null);
  const anim = useRef(new Animated.Value(0)).current;
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    try {
      if (active && !paused) player.play();
      else player.pause();
    } catch {
      // the player was released while the list recycled this row
    }
  }, [active, paused, player]);

  useEffect(() => {
    if (!active) {
      setPaused(false);
      return;
    }
    const t = setInterval(() => {
      try {
        const d = player.duration;
        if (d > 0) setProgress(Math.min(1, player.currentTime / d));
      } catch {
        // ignore a released player
      }
    }, 250);
    return () => clearInterval(t);
  }, [active, player]);

  useEffect(() => () => { if (tapTimer.current) clearTimeout(tapTimer.current); }, []);

  if (!post) return <View style={{ width, height, backgroundColor: '#000' }} />;
  const mine = post.user_id === me;
  const safe = (fn: () => Promise<void>) => fn().catch((e) => toast(errText(e)));

  function tap(x: number, y: number) {
    if (tapTimer.current) {
      clearTimeout(tapTimer.current);
      tapTimer.current = null;
      if (!post!.liked) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      safe(() => setFlag(me, post!, 'liked', true));
      setBurst({ x, y });
      anim.setValue(0);
      Animated.sequence([Animated.spring(anim, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }), Animated.delay(320), Animated.timing(anim, { toValue: 2, duration: 240, useNativeDriver: true })]).start(() => setBurst(null));
      return;
    }
    tapTimer.current = setTimeout(() => {
      tapTimer.current = null;
      setPaused((p) => !p);
    }, 260);
  }

  return (
    <View style={{ width, height, backgroundColor: '#000' }}>
      {media?.poster ? <Image source={{ uri: media.poster }} style={{ position: 'absolute', width, height }} contentFit="cover" /> : null}
      {media?.type === 'video' ? <VideoView player={player} style={{ position: 'absolute', width, height }} contentFit="cover" nativeControls={false} /> : media ? <Image source={{ uri: media.url }} style={{ position: 'absolute', width, height }} contentFit="cover" /> : null}
      <Pressable style={{ position: 'absolute', width, height }} onPress={(e) => tap(e.nativeEvent.locationX, e.nativeEvent.locationY)} accessibilityLabel="Video. Tap to pause, double tap to like." />
      <LinearGradient pointerEvents="none" colors={['rgba(0,0,0,0.4)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.7)']} locations={[0, 0.2, 0.55, 1]} style={{ position: 'absolute', width, height }} />

      {paused ? (
        <View pointerEvents="none" style={{ position: 'absolute', left: width / 2 - 38, top: height * 0.44 - 38, width: 76, height: 76, borderRadius: 38, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="play" size={36} color="#fff" />
        </View>
      ) : null}
      {burst ? (
        <Animated.View pointerEvents="none" style={{ position: 'absolute', left: burst.x - 55, top: burst.y - 55, opacity: anim.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 1, 0] }), transform: [{ scale: anim.interpolate({ inputRange: [0, 1, 2], outputRange: [0.2, 1, 1.15] }) }, { translateY: anim.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 0, -60] }) }, { rotate: '-10deg' }] }}>
          <BurstHeart />
        </Animated.View>
      ) : null}

      <View style={{ position: 'absolute', right: 10, bottom: bottomInset + 28, alignItems: 'center', gap: 18 }}>
        <Rail icon="heart" count={post.like_count} label={post.liked ? 'Unlike' : 'Like'} color={post.liked ? C.like : '#fff'} fill={post.liked} onPress={() => safe(() => setFlag(me, post, 'liked', !post.liked))} />
        <Rail icon="comment" count={post.comment_count} label="Comments" onPress={() => router.push(`/comments/${post.id}`)} />
        <Rail icon="repost" count={post.repost_count} label={post.reposted ? 'Remove repost' : 'Repost'} color={post.reposted ? C.ok : '#fff'} onPress={() => safe(async () => { await setFlag(me, post, 'reposted', !post.reposted); toast(post.reposted ? 'Repost removed' : 'Reposted to your profile'); })} />
        <Rail icon="send" label="Share" onPress={() => router.push(`/share/${post.id}`)} />
        <Rail icon="more" label="More options" onPress={() => setMenu(true)} />
      </View>

      <View style={{ position: 'absolute', left: 14, right: 76, bottom: bottomInset + 18 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <Pressable onPress={() => router.push(`/user/${post.user_id}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 }} accessibilityRole="button" accessibilityLabel={`Open ${post.username}'s profile`}>
            <Avatar uri={post.avatar_url} name={post.full_name} size={36} />
            <Text numberOfLines={1} style={{ color: '#fff', fontWeight: '700', flexShrink: 1 }}>{post.username}</Text>
          </Pressable>
          {!mine && !post.following_author ? (
            <Pressable onPress={() => safe(() => setFollow(me, post.user_id, true))} accessibilityRole="button" style={{ height: 30, paddingHorizontal: 12, borderRadius: 9, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.7)', justifyContent: 'center' }}>
              <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13.5 }}>Follow</Text>
            </Pressable>
          ) : null}
        </View>
        {post.caption ? <Text numberOfLines={2} style={{ color: '#fff', lineHeight: 20 }}>{post.caption}</Text> : null}
      </View>

      <View style={{ position: 'absolute', left: 14, right: 14, bottom: bottomInset + 4, height: 2, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.3)' }}>
        <View style={{ width: `${progress * 100}%`, height: 2, borderRadius: 1, backgroundColor: '#fff' }} />
      </View>

      <PostMenu post={post} visible={menu} onClose={() => setMenu(false)} />
    </View>
  );
}
