import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, AppState, Pressable, Text, View } from 'react-native';
import { useEventListener } from 'expo';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { recordView, setFlag, setFollow, translateCaptions } from '../lib/api';
import { tap as feel } from '../lib/haptics';
import { resolveLanguage, useT } from '../lib/i18n';
import { setPrefs, usePrefs } from '../lib/prefs';
import { useSession } from '../lib/session';
import { usePost } from '../lib/store';
import { DARK, errText, fmt } from '../lib/theme';
import type { CaptionLine } from '../lib/types';
import { BurstHeart, Icon, IconName, VerifiedTick } from './Icon';
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

/** The captions switch in the side actions: a small "CC" label, filled in while captions are on. */
function CaptionsButton({ on, onPress }: { on: boolean; onPress: () => void }) {
  const t = useT();
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="switch" accessibilityState={{ checked: on }} accessibilityLabel={t('clips.captions')} style={({ pressed }) => ({ width: 34, height: 30, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
      <View style={{ width: 30, height: 22, borderRadius: 6, borderWidth: 2, borderColor: '#fff', backgroundColor: on ? '#fff' : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: on ? '#000' : '#fff', fontSize: 11, fontWeight: '800', letterSpacing: 0.4 }}>CC</Text>
      </View>
    </Pressable>
  );
}

/*
 * Translated captions, kept for as long as the app is open: each clip is translated into each
 * language at most once, however often it scrolls past. `asks` holds the request while it is on its
 * way, so two rows showing the same clip share it; `translated` holds the answer once there is one.
 * Only answers are kept: a translation that failed (no signal, a slow server) is forgotten, so the
 * next time the clip comes on screen it is asked for again rather than left in the original language
 * until the app is closed.
 */
const asks = new Map<string, Promise<void>>();
const translated = new Map<string, CaptionLine[]>();

function askTranslation(postId: string, lang: string, key: string): Promise<void> {
  let ask = asks.get(key);
  if (!ask) {
    ask = translateCaptions(postId, lang)
      .catch(() => null)
      .then((lines) => {
        if (lines?.length) translated.set(key, lines);
        else asks.delete(key);
      });
    asks.set(key, ask);
  }
  return ask;
}

/** "en-GB" and "en" are the same language for captions. */
const baseLang = (code: string) => code.trim().toLowerCase().split(/[-_]/)[0];

export function Reel({ id, active, height, width, bottomInset }: { id: string; active: boolean; height: number; width: number; bottomInset: number }) {
  const post = usePost(id);
  const { me } = useSession();
  const router = useRouter();
  const toast = useToast();
  const t = useT();
  const media = post?.media[0];
  const player = useVideoPlayer(media?.type === 'video' ? media.url : null, (p) => {
    p.loop = true;
    // Four times a second is enough for the progress bar and for captions to change on the right word.
    p.timeUpdateEventInterval = 0.25;
  });
  const { reelsMuted, captions: captionsOn, captionLang, language } = usePrefs();
  const [paused, setPaused] = useState(false);
  const [menu, setMenu] = useState(false);
  const [burst, setBurst] = useState<{ x: number; y: number } | null>(null);
  const anim = useRef(new Animated.Value(0)).current;
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The progress bar moves without drawing the clip again four times a second.
  const progress = useRef(new Animated.Value(0)).current;
  const barWidth = Math.max(0, width - 28);
  const barX = useMemo(() => progress.interpolate({ inputRange: [0, 1], outputRange: [-barWidth, 0] }), [progress, barWidth]);

  /* ----- captions ----- */
  const postId = post?.id;
  const hasCaptions = post?.captions_status === 'ready' && !!post.captions?.length;
  // '' means "the app's language", and the app's language '' in turn means the phone's: resolveLanguage
  // follows both steps, so captions match the words on screen rather than falling back to English.
  const target = baseLang(captionLang || resolveLanguage(language));
  const source = post?.captions_lang ? baseLang(post.captions_lang) : '';
  // Only when we know the captions' language and it isn't the one wanted; otherwise show them as they are.
  const wantKey = captionsOn && hasCaptions && postId && source && source !== target ? `${postId}:${target}` : '';
  const [, setTranslationsSeen] = useState(0);
  // Asked again when the clip becomes the one on screen, so one that failed earlier gets another go.
  useEffect(() => {
    if (!wantKey || !postId || translated.has(wantKey)) return;
    let live = true;
    askTranslation(postId, target, wantKey).then(() => {
      if (live) setTranslationsSeen((n) => n + 1);
    });
    return () => {
      live = false;
    };
  }, [wantKey, postId, target, active]);
  const translation = wantKey ? translated.get(wantKey) : undefined;
  const lines: CaptionLine[] | null = captionsOn && hasCaptions ? (translation?.length ? translation : post!.captions) : null;
  const linesRef = useRef(lines);
  linesRef.current = lines;
  // Which line is showing: the one whose start has passed and whose end hasn't. -1 between lines.
  const [lineIndex, setLineIndex] = useState(-1);
  const lineRef = useRef(-1);
  const showLine = (i: number) => {
    if (i === lineRef.current) return;
    lineRef.current = i;
    setLineIndex(i);
  };
  // A different set of lines (a translation arriving, captions switched off) starts from no line.
  useEffect(() => {
    lineRef.current = -1;
    setLineIndex(-1);
  }, [lines]);

  // One listener for the bar and the captions; the hook removes it when the player changes or the row goes.
  useEventListener(player, 'timeUpdate', ({ currentTime }) => {
    let d = 0;
    try {
      d = player.duration;
    } catch {
      // the player was released while the list recycled this row
    }
    progress.setValue(d > 0 ? Math.min(1, currentTime / d) : 0);
    const list = linesRef.current;
    showLine(list ? list.findIndex((l) => l.s <= currentTime && currentTime < l.e) : -1);
  });

  useEffect(() => {
    try {
      if (active && !paused) player.play();
      else player.pause();
    } catch {
      // the player was released while the list recycled this row
    }
  }, [active, paused, player]);

  useEffect(() => {
    try {
      player.muted = reelsMuted;
    } catch {
      // the player was released
    }
  }, [player, reelsMuted]);

  // iOS pauses video when the app goes to the background and does not start it again by itself.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || !active || paused) return;
      try {
        player.play();
      } catch {
        // the player was released
      }
    });
    return () => sub.remove();
  }, [active, paused, player]);

  // Being the clip on screen for a moment counts as a view.
  const ownerId = post?.user_id;
  useEffect(() => {
    if (!active || !postId || !ownerId) return;
    const timer = setTimeout(() => recordView(me, { id: postId, user_id: ownerId }), 800);
    return () => clearTimeout(timer);
  }, [active, postId, ownerId, me]);

  // Scrolled away: the next time it comes round it plays again.
  useEffect(() => {
    if (!active) setPaused(false);
  }, [active]);

  useEffect(() => () => { if (tapTimer.current) clearTimeout(tapTimer.current); }, []);

  if (!post) return <View style={{ width, height, backgroundColor: '#000' }} />;
  const mine = post.user_id === me;
  const safe = (fn: () => Promise<void>) => fn().catch((e) => toast(errText(e)));
  const line = lines && lineIndex >= 0 ? lines[lineIndex]?.t?.trim() : '';

  function tap(x: number, y: number) {
    if (tapTimer.current) {
      clearTimeout(tapTimer.current);
      tapTimer.current = null;
      // Through haptics.ts, so a member who turned taps off in Settings doesn't feel one.
      if (!post!.liked) feel('light');
      safe(() => setFlag(me, post!, 'liked', true));
      setBurst({ x, y });
      anim.setValue(0);
      Animated.sequence([Animated.spring(anim, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }), Animated.delay(320), Animated.timing(anim, { toValue: 2, duration: 240, useNativeDriver: true })]).start(({ finished }) => { if (finished) setBurst(null); });
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
      <Pressable style={{ position: 'absolute', width, height }} onPress={(e) => tap(e.nativeEvent.locationX, e.nativeEvent.locationY)} accessibilityLabel="Short. Tap to pause, double tap to like." />
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
        <Rail icon="heart" count={post.like_count} label={post.liked ? 'Unlike' : 'Like'} color={post.liked ? DARK.like : '#fff'} fill={post.liked} onPress={() => safe(() => setFlag(me, post, 'liked', !post.liked))} />
        <Rail icon="comment" count={post.comment_count} label="Comments" onPress={() => router.push(`/comments/${post.id}`)} />
        <Rail icon="repost" count={post.repost_count} label={post.reposted ? 'Remove repost' : 'Repost'} color={post.reposted ? DARK.ok : '#fff'} onPress={() => safe(async () => { await setFlag(me, post, 'reposted', !post.reposted); toast(post.reposted ? 'Repost removed' : 'Reposted to your profile'); })} />
        <Rail icon="send" label="Share" onPress={() => router.push(`/share/${post.id}`)} />
        {media?.type === 'video' ? <Rail icon={reelsMuted ? 'mute' : 'sound'} label={reelsMuted ? 'Turn sound on' : 'Turn sound off'} onPress={() => setPrefs({ reelsMuted: !reelsMuted })} /> : null}
        {hasCaptions ? (
          <CaptionsButton
            on={captionsOn}
            onPress={() => {
              feel('select');
              setPrefs({ captions: !captionsOn });
              toast(t(captionsOn ? 'clips.captionsOff' : 'clips.captionsOn'));
            }}
          />
        ) : null}
        <Rail icon="more" label="More options" onPress={() => setMenu(true)} />
      </View>

      {/* Captions sit just above the name and caption, so the bottom info never moves when a line appears. */}
      <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: bottomInset + 18 }}>
        {line ? (
          <View pointerEvents="none" accessibilityLiveRegion="polite" style={{ alignSelf: 'center', maxWidth: Math.max(160, width - 152), marginBottom: 14, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, backgroundColor: '#fff' }}>
            <Text numberOfLines={3} style={{ color: '#000', fontWeight: '700', fontSize: 15.5, lineHeight: 21, textAlign: 'center' }}>{line}</Text>
          </View>
        ) : null}
        <View style={{ marginLeft: 14, marginRight: 76 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <Pressable onPress={() => router.push(`/user/${post.user_id}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 }} accessibilityRole="button" accessibilityLabel={`Open ${post.username}'s profile`}>
              <Avatar uri={post.avatar_url} name={post.full_name} size={36} />
              <Text numberOfLines={1} style={{ color: '#fff', fontWeight: '700', flexShrink: 1 }}>{post.username}</Text>
              {post.verified ? <VerifiedTick size={14} /> : null}
            </Pressable>
            {!mine && !post.following_author ? (
              <Pressable onPress={() => safe(() => setFollow(me, post.user_id, true))} accessibilityRole="button" style={{ height: 30, paddingHorizontal: 12, borderRadius: 9, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.7)', justifyContent: 'center' }}>
                <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13.5 }}>Follow</Text>
              </Pressable>
            ) : null}
          </View>
          {post.caption ? <Text numberOfLines={2} style={{ color: '#fff', lineHeight: 20 }}>{post.caption}</Text> : null}
          {post.view_count ? <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, marginTop: 4 }}>{fmt(post.view_count)} {post.view_count === 1 ? 'view' : 'views'}</Text> : null}
        </View>
      </View>

      <View style={{ position: 'absolute', left: 14, right: 14, bottom: bottomInset + 4, height: 2, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.3)', overflow: 'hidden' }}>
        <Animated.View style={{ width: barWidth, height: 2, borderRadius: 1, backgroundColor: '#fff', transform: [{ translateX: barX }] }} />
      </View>

      <PostMenu post={post} visible={menu} onClose={() => setMenu(false)} />
    </View>
  );
}
