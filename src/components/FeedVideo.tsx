import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, AppState, GestureResponderEvent, Pressable, View } from 'react-native';
import { useEventListener } from 'expo';
import { Image } from 'expo-image';
import { useFocusEffect, useNavigation, useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { setFeedMuted, useFeedMuted } from '../lib/autoplay';
import type { Media, Post } from '../lib/types';
import { Icon } from './Icon';

/** How long a first tap waits for a second before it counts as a single tap. The same window PostCard uses for double-tap to like. */
const DOUBLE_TAP_MS = 300;

type Props = {
  post: Post;
  media: Media;
  width: number;
  height: number;
  /** This is the video in view: it gets a player and plays. Otherwise only the poster is drawn, so a long feed holds no decoders. */
  active: boolean;
  /** The card's tap handler. It returns true when the tap completed a double tap (a like), so the first tap is not also taken as a mute toggle. */
  onTap?: (x: number, y: number) => boolean;
};

/**
 * A video in a feed post. The post in view plays by itself, looping, with the feed-wide sound choice;
 * every other one is just its poster. Tap toggles sound, double tap likes, long press opens the full viewer.
 */
export function FeedVideo({ post, media, width, height, active, onTap }: Props) {
  const router = useRouter();
  const open = () => router.push(`/watch/${post.id}`);
  return (
    <View style={{ width, height, overflow: 'hidden' }}>
      {/* The poster stays underneath while the video loads, so starting never flashes black. */}
      {media.poster ? <Image source={{ uri: media.poster }} style={{ position: 'absolute', width, height }} contentFit="cover" transition={150} /> : null}
      {active && media.url ? (
        <ActiveVideo media={media} width={width} height={height} onTap={onTap} onOpen={open} />
      ) : (
        <Pressable onPress={open} style={{ position: 'absolute', width, height, alignItems: 'center', justifyContent: 'center' }} accessibilityRole="button" accessibilityLabel="Play video">
          <View style={{ width: 68, height: 68, borderRadius: 34, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="play" size={34} />
          </View>
        </Pressable>
      )}
    </View>
  );
}

/** True while the screen this is on is the one showing: false under a pushed screen or on another tab. */
function useScreenFocused(): boolean {
  const navigation = useNavigation();
  const [focused, setFocused] = useState(() => {
    try {
      return navigation.isFocused();
    } catch {
      return true;
    }
  });
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  return focused;
}

/** True while the app is in the foreground. */
function useForeground(): boolean {
  const [fg, setFg] = useState(() => AppState.currentState === 'active' || AppState.currentState === 'unknown');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setFg(s === 'active'));
    return () => sub.remove();
  }, []);
  return fg;
}

/** Mounted only while the video is in view; unmounting it releases the player. */
function ActiveVideo({ media, width, height, onTap, onOpen }: { media: Media; width: number; height: number; onTap?: (x: number, y: number) => boolean; onOpen: () => void }) {
  const muted = useFeedMuted();
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const focused = useScreenFocused();
  const foreground = useForeground();
  const shouldPlay = focused && foreground;
  const player = useVideoPlayer(media.url, (p) => {
    p.loop = true;
    p.muted = muted;
    p.timeUpdateEventInterval = 0.25;
    if (shouldPlay) p.play();
  });
  // Hidden until the first frame is drawn, so the poster shows instead of an empty frame.
  const [shown, setShown] = useState(false);
  const shownRef = useRef(false);
  const reveal = () => {
    if (shownRef.current) return;
    shownRef.current = true;
    setShown(true);
  };
  const progress = useRef(new Animated.Value(0)).current;
  const barX = useMemo(() => progress.interpolate({ inputRange: [0, 1], outputRange: [-width, 0] }), [progress, width]);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Play only while this screen is showing and the app is open; resume when either comes back.
  useEffect(() => {
    try {
      if (shouldPlay) player.play();
      else player.pause();
    } catch {
      // the player was released
    }
  }, [shouldPlay, player]);

  useEffect(() => {
    try {
      player.muted = muted;
    } catch {
      // the player was released
    }
  }, [muted, player]);

  // The progress bar moves without re-rendering this component.
  useEventListener(player, 'timeUpdate', ({ currentTime }) => {
    let d = 0;
    try {
      d = player.duration;
    } catch {
      // the player was released
    }
    progress.setValue(d > 0 ? Math.min(1, currentTime / d) : 0);
    if (currentTime > 0) reveal();
  });

  useEffect(() => () => { if (tapTimer.current) clearTimeout(tapTimer.current); }, []);

  const flipSound = () => setFeedMuted(!mutedRef.current);

  function press(e: GestureResponderEvent) {
    const { locationX, locationY } = e.nativeEvent;
    if (!onTap) return flipSound();
    const liked = onTap(locationX, locationY);
    if (tapTimer.current) {
      clearTimeout(tapTimer.current);
      tapTimer.current = null;
      // The second tap of a double tap: the card liked the post, and the first tap is not a mute toggle.
      if (liked) return;
      // The first tap's wait ran out before its timer fired: it still counts.
      flipSound();
    }
    if (liked) return;
    tapTimer.current = setTimeout(() => {
      tapTimer.current = null;
      flipSound();
    }, DOUBLE_TAP_MS);
  }

  return (
    <>
      <VideoView
        player={player}
        style={{ position: 'absolute', width, height, opacity: shown ? 1 : 0 }}
        contentFit="cover"
        nativeControls={false}
        fullscreenOptions={{ enable: false }}
        allowsPictureInPicture={false}
        // A TextureView is clipped by the card's rounded corners and scrolls cleanly with the list; a SurfaceView is not.
        surfaceType="textureView"
        onFirstFrameRender={reveal}
      />
      <Pressable
        style={{ position: 'absolute', width, height }}
        onPress={press}
        onLongPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={muted ? 'Video, sound off. Tap to turn sound on, double tap to like, long press to open.' : 'Video, sound on. Tap to turn sound off, double tap to like, long press to open.'}
      />
      <Animated.View
        pointerEvents="none"
        style={{ position: 'absolute', left: 0, bottom: 0, width, height: 2, backgroundColor: 'rgba(255,255,255,0.7)', transform: [{ translateX: barX }] }}
      />
      <Pressable
        onPress={onOpen}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Open video full screen"
        style={({ pressed }) => ({ position: 'absolute', left: 10, bottom: 12, width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}
      >
        <Icon name="expand" size={16} color="#fff" weight={2.2} />
      </Pressable>
      <Pressable
        onPress={flipSound}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={muted ? 'Turn sound on' : 'Turn sound off'}
        style={({ pressed }) => ({ position: 'absolute', right: 10, bottom: 12, width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}
      >
        <Icon name={muted ? 'mute' : 'sound'} size={16} color="#fff" weight={2.2} />
      </Pressable>
    </>
  );
}
