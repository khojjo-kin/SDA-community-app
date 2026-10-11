import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, AppState, Easing, Pressable, ScrollView, Text, View } from 'react-native';
import { useEventListener } from 'expo';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { recordView, setFlag, setFollow, translateCaptions } from '../lib/api';
import { tap as feel } from '../lib/haptics';
import { resolveLanguage, useT } from '../lib/i18n';
import { useReduceMotion } from '../lib/motion';
import { setPrefs, usePrefs } from '../lib/prefs';
import { useSession } from '../lib/session';
import { usePost } from '../lib/store';
import { DARK, errText, fmt } from '../lib/theme';
import type { CaptionLine } from '../lib/types';
import { BurstHeart, Icon, IconName, VerifiedTick } from './Icon';
import { PostMenu } from './PostCard';
import { AiInfo, PollPill, PromptCard, TaggedLine } from './PostExtras';
import { Skeleton } from './Skeleton';
import { Avatar, useToast } from './ui';

function Rail({ icon, count, label, onPress, color, fill }: { icon: IconName; count?: number; label: string; onPress: () => void; color?: string; fill?: boolean }) {
  return (
    <Pressable onPress={onPress} hitSlop={6} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => ({ alignItems: 'center', gap: 3, opacity: pressed ? 0.6 : 1 })}>
      <Icon name={icon} size={30} color={color ?? '#fff'} fill={fill} />
      {count !== undefined ? <Text style={{ color: '#fff', fontSize: 12.5, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{fmt(count)}</Text> : null}
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

/** How often the player reports the time (seconds): the bar glides between reports, so this can be slow. */
const TICK = 0.25;
/** How long a clip may sit loading before a spinner says so. */
const SPINNER_AFTER_MS = 700;

/** Memoised: the list draws its rows again whenever the clip in view changes, and only two of them have anything new to show. */
export const Reel = React.memo(function Reel({ id, active, height, width, bottomInset }: { id: string; active: boolean; height: number; width: number; bottomInset: number }) {
  const post = usePost(id);
  const { me } = useSession();
  const router = useRouter();
  const toast = useToast();
  const t = useT();
  const reduceMotion = useReduceMotion();
  const media = post?.media[0];
  const videoUrl = media?.type === 'video' ? media.url : '';
  // Kept on the phone once downloaded, so a loop or a second look plays from there instead of downloading again.
  const player = useVideoPlayer(videoUrl ? { uri: videoUrl, useCaching: true } : null, (p) => {
    p.loop = true;
    p.timeUpdateEventInterval = TICK;
  });
  const { reelsMuted, captions: captionsOn, captionLang, language } = usePrefs();
  const [paused, setPaused] = useState(false);
  // A finger held on the clip: it stops while held, and the buttons and words step aside.
  const [holding, setHolding] = useState(false);
  const [menu, setMenu] = useState(false);
  // The menu's sheets are only put together once it has been opened, then kept.
  const [menuUsed, setMenuUsed] = useState(false);
  const [burst, setBurst] = useState<{ x: number; y: number } | null>(null);
  // The whole caption, opened by tapping it.
  const [open, setOpen] = useState(false);
  // How many lines the whole caption takes, measured out of sight; more than two can be opened.
  const [captionLines, setCaptionLines] = useState(0);
  // The first picture of the video is on screen: until then the cover picture (or a soft placeholder) shows.
  const [framed, setFramed] = useState(false);
  // The player is waiting for the network; a spinner shows if that goes on for a moment.
  const [waiting, setWaiting] = useState(false);
  const [spinner, setSpinner] = useState(false);
  const anim = useRef(new Animated.Value(0)).current;
  const chrome = useRef(new Animated.Value(1)).current;
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const following = useRef(false);
  // A screen was just opened from here: a second tap a moment later doesn't open it twice.
  const lastOpen = useRef(0);
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
    let moving = false;
    try {
      d = player.duration;
      moving = player.playing;
    } catch {
      // the player was released while the list recycled this row
    }
    const at = d > 0 ? Math.min(1, currentTime / d) : 0;
    progress.setValue(at);
    // Glide on to where the next report will be, on the native side, so the bar moves smoothly in between.
    if (moving && d > 0 && at < 1) {
      Animated.timing(progress, { toValue: Math.min(1, (currentTime + TICK) / d), duration: TICK * 1000, easing: Easing.linear, useNativeDriver: true }).start();
    }
    const list = linesRef.current;
    showLine(list ? list.findIndex((l) => l.s <= currentTime && currentTime < l.e) : -1);
  });

  useEventListener(player, 'statusChange', ({ status }) => setWaiting(status === 'loading'));
  // The player may have started loading before the listener above was attached.
  useEffect(() => {
    try {
      setWaiting(player.status === 'loading');
    } catch {
      // the player was released
    }
  }, [player]);

  const stopped = !active || paused || holding;
  useEffect(() => {
    if (stopped || !waiting) {
      setSpinner(false);
      return;
    }
    const timer = setTimeout(() => setSpinner(true), SPINNER_AFTER_MS);
    return () => clearTimeout(timer);
  }, [stopped, waiting]);

  useEffect(() => {
    try {
      if (!stopped) player.play();
      else player.pause();
    } catch {
      // the player was released while the list recycled this row
    }
  }, [stopped, player]);

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
      if (state !== 'active' || stopped) return;
      try {
        player.play();
      } catch {
        // the player was released
      }
    });
    return () => sub.remove();
  }, [stopped, player]);

  // Being the clip on screen for a moment counts as a view.
  const ownerId = post?.user_id;
  useEffect(() => {
    if (!active || !postId || !ownerId) return;
    const timer = setTimeout(() => recordView(me, { id: postId, user_id: ownerId }), 800);
    return () => clearTimeout(timer);
  }, [active, postId, ownerId, me]);

  // Scrolled away: the next time it comes round it plays again, with the caption closed. A single tap
  // still waiting to count (to tell it from a double tap) is forgotten, or it would pause the clip off screen.
  useEffect(() => {
    if (active) return;
    setPaused(false);
    setHolding(false);
    setOpen(false);
    if (tapTimer.current) {
      clearTimeout(tapTimer.current);
      tapTimer.current = null;
    }
  }, [active]);

  // The buttons and words fade while a finger holds the clip, and come back when it lets go.
  useEffect(() => {
    const fade = Animated.timing(chrome, { toValue: holding ? 0 : 1, duration: holding ? 160 : 200, useNativeDriver: true });
    fade.start();
    return () => fade.stop();
  }, [holding, chrome]);

  useEffect(() => () => { if (tapTimer.current) clearTimeout(tapTimer.current); }, []);

  if (!post) return <View style={{ width, height, backgroundColor: '#000' }} />;
  const mine = post.user_id === me;
  const safe = (fn: () => Promise<void>) => fn().catch((e) => toast(errText(e)));
  const line = lines && lineIndex >= 0 ? lines[lineIndex]?.t?.trim() : '';
  const caption = post.caption?.trim() ?? '';
  // Only a caption that could run past two lines is measured; a short one never needs opening.
  const measure = caption.length > 60 || caption.includes('\n');
  const long = measure && captionLines > 2;

  function go(path: string) {
    const at = Date.now();
    if (at - lastOpen.current < 700) return;
    lastOpen.current = at;
    router.push(path);
  }

  function like(next: boolean) {
    // Through haptics.ts, so a member who turned taps off in Settings doesn't feel one.
    if (next && !post!.liked) feel('light');
    safe(() => setFlag(me, post!, 'liked', next));
  }

  function follow() {
    if (following.current) return;
    following.current = true;
    feel('light');
    setFollow(me, post!.user_id, true)
      .catch((e) => toast(errText(e)))
      .finally(() => {
        following.current = false;
      });
  }

  function tap(x: number, y: number) {
    if (tapTimer.current) {
      clearTimeout(tapTimer.current);
      tapTimer.current = null;
      like(true);
      setBurst({ x, y });
      anim.setValue(0);
      Animated.sequence([Animated.spring(anim, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }), Animated.delay(320), Animated.timing(anim, { toValue: 2, duration: 240, useNativeDriver: true })]).start(({ finished }) => { if (finished) setBurst(null); });
      return;
    }
    tapTimer.current = setTimeout(() => {
      tapTimer.current = null;
      // With the caption open, a tap on the clip closes it rather than pausing.
      if (open) setOpen(false);
      else setPaused((p) => !p);
    }, 260);
  }

  const still = reduceMotion === true;
  const burstStyle = burst
    ? {
        position: 'absolute' as const,
        left: burst.x - 55,
        top: burst.y - 55,
        opacity: anim.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 1, 0] }),
        // With Reduce Motion on, the heart only fades in and out.
        transform: still
          ? [{ rotate: '-10deg' }]
          : [{ scale: anim.interpolate({ inputRange: [0, 1, 2], outputRange: [0.2, 1, 1.15] }) }, { translateY: anim.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 0, -60] }) }, { rotate: '-10deg' }],
      }
    : null;

  return (
    <View style={{ width, height, backgroundColor: '#000' }}>
      {media?.poster ? <Image source={{ uri: media.poster }} style={{ position: 'absolute', width, height }} contentFit="cover" cachePolicy="memory-disk" recyclingKey={post.id} /> : null}
      {media?.type === 'video' && !media.poster && !framed ? <Skeleton dark width={width} height={height} radius={0} style={{ position: 'absolute', left: 0, top: 0, backgroundColor: 'rgba(255,255,255,0.03)' }} /> : null}
      {media?.type === 'video' ? (
        <VideoView player={player} style={{ position: 'absolute', width, height }} contentFit="cover" nativeControls={false} onFirstFrameRender={() => setFramed(true)} />
      ) : media ? (
        <Image source={{ uri: media.url }} style={{ position: 'absolute', width, height }} contentFit="cover" cachePolicy="memory-disk" recyclingKey={post.id} />
      ) : null}
      <Pressable
        style={{ position: 'absolute', width, height }}
        onPress={(e) => tap(e.nativeEvent.locationX, e.nativeEvent.locationY)}
        onLongPress={() => setHolding(true)}
        onPressOut={() => setHolding(false)}
        delayLongPress={280}
        accessibilityLabel="Short. Tap to pause, double tap to like."
      />
      <LinearGradient pointerEvents="none" colors={['rgba(0,0,0,0.4)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.7)']} locations={[0, 0.2, 0.55, 1]} style={{ position: 'absolute', width, height }} />
      {/* The open caption dims the clip, so long words stay easy to read. */}
      {open ? <View pointerEvents="none" style={{ position: 'absolute', width, height, backgroundColor: 'rgba(0,0,0,0.38)' }} /> : null}

      {paused && !holding ? (
        <View pointerEvents="none" style={{ position: 'absolute', left: width / 2 - 38, top: height * 0.44 - 38, width: 76, height: 76, borderRadius: 38, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="play" size={36} color="#fff" />
        </View>
      ) : spinner ? (
        <View pointerEvents="none" style={{ position: 'absolute', left: width / 2 - 20, top: height * 0.44 - 20, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color="#fff" />
        </View>
      ) : null}
      {burstStyle ? (
        <Animated.View pointerEvents="none" style={burstStyle}>
          <BurstHeart />
        </Animated.View>
      ) : null}

      <Animated.View pointerEvents={holding ? 'none' : 'box-none'} style={{ position: 'absolute', left: 0, top: 0, width, height, opacity: chrome }}>
        <View style={{ position: 'absolute', right: 10, bottom: bottomInset + 28, alignItems: 'center', gap: 18 }}>
          {/* A hidden like count is still shown to the author; with comments off, only the author comments. */}
          <Rail icon="heart" count={post.hide_likes && !mine ? undefined : post.like_count} label={post.liked ? 'Unlike' : 'Like'} color={post.liked ? DARK.like : '#fff'} fill={post.liked} onPress={() => like(!post.liked)} />
          {post.comments_off && !mine ? null : <Rail icon="comment" count={post.comment_count} label="Comments" onPress={() => go(`/comments/${post.id}`)} />}
          <Rail icon="repost" count={post.repost_count} label={post.reposted ? 'Remove repost' : 'Repost'} color={post.reposted ? DARK.ok : '#fff'} onPress={() => safe(async () => { await setFlag(me, post, 'reposted', !post.reposted); toast(post.reposted ? 'Repost removed' : 'Reposted to your profile'); })} />
          <Rail icon="send" label="Share" onPress={() => go(`/share/${post.id}`)} />
          {media?.type === 'video' ? <Rail icon={reelsMuted ? 'mute' : 'sound'} label={reelsMuted ? 'Turn sound on' : 'Turn sound off'} onPress={() => { feel('select'); setPrefs({ reelsMuted: !reelsMuted }); }} /> : null}
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
          <Rail icon="more" label="More options" onPress={() => { setMenuUsed(true); setMenu(true); }} />
        </View>

        {/* Captions sit just above the name and caption, so the bottom info never moves when a line appears. */}
        <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: bottomInset + 18 }}>
          {line && !open ? (
            <View pointerEvents="none" accessibilityLiveRegion="polite" style={{ alignSelf: 'center', maxWidth: Math.max(160, width - 152), marginBottom: 14, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, backgroundColor: '#fff' }}>
              <Text numberOfLines={3} style={{ color: '#000', fontWeight: '700', fontSize: 15.5, lineHeight: 21, textAlign: 'center' }}>{line}</Text>
            </View>
          ) : null}
          <View pointerEvents="box-none" style={{ marginLeft: 14, marginRight: 76 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <Pressable onPress={() => go(`/user/${post.user_id}`)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1, opacity: pressed ? 0.7 : 1 })} accessibilityRole="button" accessibilityLabel={`Open ${post.username}'s profile`}>
                <Avatar uri={post.avatar_url} name={post.full_name} size={36} />
                <Text numberOfLines={1} style={{ color: '#fff', fontWeight: '700', fontSize: 15, flexShrink: 1, textShadowColor: 'rgba(0,0,0,0.3)', textShadowRadius: 3, textShadowOffset: { width: 0, height: 1 } }}>{post.username}</Text>
                {post.verified ? <VerifiedTick size={14} /> : null}
              </Pressable>
              {!mine && !post.following_author ? (
                <Pressable onPress={follow} hitSlop={4} accessibilityRole="button" style={({ pressed }) => ({ height: 30, paddingHorizontal: 12, borderRadius: 9, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.7)', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
                  <Text numberOfLines={1} style={{ color: '#fff', fontWeight: '600', fontSize: 13.5 }}>Follow</Text>
                </Pressable>
              ) : null}
            </View>
            {post.ai_label ? <View style={{ marginBottom: 4 }}><AiInfo dark /></View> : null}
            {caption ? (
              <View>
                {measure ? (
                  // The whole caption, laid out unseen at the same width, to count its lines. Never touchable.
                  <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ position: 'absolute', left: 0, right: 0, top: 0, opacity: 0 }}>
                    <Text style={{ lineHeight: 20 }} onTextLayout={(e) => setCaptionLines(e.nativeEvent.lines.length)}>
                      {caption}
                    </Text>
                  </View>
                ) : null}
                {open ? (
                  // Scrolls only when the caption is taller than its room; otherwise a swipe still moves to the next Short.
                  <ScrollView style={{ maxHeight: Math.round(height * 0.42) }} showsVerticalScrollIndicator={false} alwaysBounceVertical={false}>
                    <Pressable onPress={() => setOpen(false)} accessibilityRole="button">
                      <Text style={{ color: '#fff', lineHeight: 20 }}>{caption}</Text>
                    </Pressable>
                  </ScrollView>
                ) : long ? (
                  <Pressable onPress={() => setOpen(true)} accessibilityRole="button">
                    <Text numberOfLines={2} style={{ color: '#fff', lineHeight: 20 }}>{caption}</Text>
                  </Pressable>
                ) : (
                  <Text numberOfLines={2} style={{ color: '#fff', lineHeight: 20 }}>{caption}</Text>
                )}
              </View>
            ) : null}
            {post.tagged_ids?.length ? <TaggedLine ids={post.tagged_ids} /> : null}
            <PollPill post={post} />
            <PromptCard post={post} dark />
            {post.view_count ? <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, marginTop: 4 }}>{fmt(post.view_count)} {post.view_count === 1 ? 'view' : 'views'}</Text> : null}
          </View>
        </View>

        <View pointerEvents="none" style={{ position: 'absolute', left: 14, right: 14, bottom: bottomInset + 4, height: 2, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.3)', overflow: 'hidden' }}>
          <Animated.View style={{ width: barWidth, height: 2, borderRadius: 1, backgroundColor: '#fff', transform: [{ translateX: barX }] }} />
        </View>
      </Animated.View>

      {menuUsed ? <PostMenu post={post} visible={menu} onClose={() => setMenu(false)} /> : null}
    </View>
  );
});
