import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Animated, BackHandler, Easing, Keyboard, PanResponder, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCalls } from '../lib/calls';
import { useAppFont } from '../lib/fonts';
import { tap } from '../lib/haptics';
import { type Key, useT } from '../lib/i18n';
import { useReduceMotion } from '../lib/motion';
import { PLAYER_BAR_SPACE, useHasTrack } from '../lib/player';
import { setPrefs, usePrefs } from '../lib/prefs';
import { C } from '../lib/theme';
import { Icon, IconName } from './Icon';
import { ThinkingOrb } from './ThinkingOrb';

/*
 * The floating church-apps button. A small frosted square that sits over every screen, like a phone's
 * own floating shortcut button but in our colours: drag it anywhere and it settles against the nearer
 * side; tap it and, like the iPhone's AssistiveTouch, a rounded dark see-through square grows out of it
 * into the middle of the screen with the church apps (Bible, Hymnal, Pod…) in a grid three across, Home
 * on its own in the middle of the last row.
 * Tapping outside the square closes it. This is the only way into the church apps, so it can't be
 * turned off. It keeps out of the way: it fades when left alone; it rests between a screen's header
 * and the tab bar (and the player bar over it), never on them; and it isn't there over photos and video
 * (the Clips tab and Pod's player too), calls, the camera, screens that slide up for one task (comments,
 * sharing, a note), while the keyboard is up, or while a screen asks it to step aside.
 */

const SIZE = 56;
/** The gap between the button and the side of the screen it rests on. */
const EDGE = 6;
const PANEL = 300;
/** How long the button stays bright after it was last touched. */
const IDLE_MS = 3000;
const IDLE_OPACITY = 0.55;
/** A finger that moves less than this has tapped, not dragged. */
const SLOP = 6;
/** Room kept clear at the top under the safe area: every screen's header row (back buttons, titles) is 52 to 56 tall. */
const TOP_CLEAR = 60;
/**
 * Room kept clear at the bottom over the safe area: the tab bar is 64 tall and sits max(inset - 8, 10)
 * above the bottom (app/(app)/(tabs)/_layout.tsx), with a gap above it. Chat boxes and the buttons at the
 * foot of other screens sit in the same band.
 */
const TAB_BAR = 64;
const BOTTOM_GAP = 8;

/* ---------- where it isn't shown (also used by the feedback prompt) ---------- */

// Full-screen photo and video, calls, the camera and editors, and Pod's player. Paths are as usePathname gives them (no groups).
const MEDIA_PREFIXES = ['/story/', '/story-archive/', '/highlight/', '/watch/', '/call/', '/live/', '/pod/'];
// The Clips tab ('/reels') is full-screen video too, and the button would sit over its like and share buttons.
const MEDIA_SCREENS = ['/reels', '/shorts', '/go-live', '/story-editor', '/create', '/add-story', '/camera-settings', '/sign-in', '/sign-up', '/forgot', '/onboarding', '/birth-date'];
// Screens that slide up for one task, with their box or button along the bottom.
const SHEET_PREFIXES = ['/comments/', '/share/'];
const SHEET_SCREENS = ['/send-to', '/note', '/new-highlight', '/group-new', '/church-new', '/event-edit'];

const matches = (path: string, prefixes: string[], screens: string[]) => prefixes.some((p) => path.startsWith(p)) || screens.some((p) => path === p || path.startsWith(p + '/'));

/** True on screens where nothing should float over the content or pop up over it. */
export function isMediaRoute(path: string): boolean {
  return matches(path, MEDIA_PREFIXES, MEDIA_SCREENS) || matches(path, SHEET_PREFIXES, SHEET_SCREENS);
}

/* ---------- screens that ask it to step aside ---------- */

let askers = 0;
const askListeners = new Set<() => void>();
const subscribeAsk = (l: () => void) => {
  askListeners.add(l);
  return () => {
    askListeners.delete(l);
  };
};
const asked = () => askers > 0;

/**
 * While `hide` is true the floating button steps aside: for a bar of actions along the bottom of a
 * screen (the Bible's verse bar), which it would otherwise sit on.
 */
export function useHideAssistiveButton(hide: boolean) {
  useEffect(() => {
    if (!hide) return;
    askers++;
    askListeners.forEach((l) => l());
    return () => {
      askers = Math.max(0, askers - 1);
      askListeners.forEach((l) => l());
    };
  }, [hide]);
}

/** True while the on-screen keyboard is up. iOS says so as it starts to move; Android only once it has. */
export function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(() => Keyboard.isVisible());
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const up = Keyboard.addListener(showEvent, () => setOpen(true));
    const down = Keyboard.addListener(hideEvent, () => setOpen(false));
    return () => {
      up.remove();
      down.remove();
    };
  }, []);
  return open;
}

/* ---------- the apps in the panel ---------- */

/** One app in the panel. `label` is a key (src/lib/i18n/en.ts), looked up as the panel draws. */
type App = { key: string; label: Key; icon: IconName | 'orb'; href: string };
/** A church app: one with an icon of its own. `words` are extra English terms for searching for it. */
export type ChurchApp = App & { icon: IconName; words: string };

/** The church apps. The panel is their only home. */
export const CHURCH_APPS: ChurchApp[] = [
  { key: 'bible', label: 'churchApps.bible', icon: 'bible', href: '/bible', words: 'bible scripture verse read kjv web chapter' },
  { key: 'hymnal', label: 'churchApps.hymnal', icon: 'hymnal', href: '/hymnal', words: 'hymnal hymns songs sing worship music' },
  { key: 'pod', label: 'churchApps.pod', icon: 'headphones', href: '/pod', words: 'pod podcasts songs music listen audio' },
  { key: 'lesson', label: 'churchApps.sabbathSchool', icon: 'lesson', href: '/sabbath-school', words: 'sabbath school lesson quarterly study' },
  { key: 'churches', label: 'churchApps.churches', icon: 'church', href: '/churches', words: 'churches church congregation find near' },
  { key: 'groups', label: 'churchApps.communities', icon: 'users', href: '/groups', words: 'communities groups pages ministries' },
  { key: 'events', label: 'churchApps.events', icon: 'calendar', href: '/events', words: 'events calendar programme program services meetings rsvp going' },
];

const APPS: App[] = [
  ...CHURCH_APPS,
  // Erha is the assistant, so she gets the assistant's orb rather than an icon.
  { key: 'erha', label: 'churchApps.erha', icon: 'orb', href: '/erha' },
  { key: 'map', label: 'churchApps.map', icon: 'location', href: '/map' },
  { key: 'home', label: 'tabs.home', icon: 'home', href: '/' },
];

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
/** Where the button rests on a side: its left edge, on a screen this wide. */
const restX = (side: 'left' | 'right', width: number) => (side === 'left' ? EDGE : width - SIZE - EDGE);

export function AssistiveButton() {
  const prefs = usePrefs();
  const path = usePathname();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const keyboard = useKeyboardOpen();
  const { inCall } = useCalls();
  const font = useAppFont();
  const t = useT();
  const reduce = useReduceMotion();
  const hasTrack = useHasTrack();
  const stepAside = useSyncExternalStore(subscribeAsk, asked, asked);
  // The church apps live only here, so the button can't be turned off.
  const hidden = keyboard || inCall || stepAside || isMediaRoute(path);

  // Where it may rest: under the header row, and above the tab bar and, while a track is loaded, the
  // player bar over it. It never covers a back button, a tab, the player's buttons or a chat box.
  const minY = insets.top + TOP_CLEAR;
  const bottomBand = Math.max(insets.bottom - 8, 10) + TAB_BAR + BOTTOM_GAP + (hasTrack ? PLAYER_BAR_SPACE : 0);
  const maxY = Math.max(minY, H - bottomBand - SIZE);

  // The pan responder is made once, so it reads the screen's size and limits from here.
  const geo = useRef({ W, H, minY, maxY });
  geo.current = { W, H, minY, maxY };

  // Position (moved by the finger, so driven from JavaScript) and the resting spot it last settled at.
  const first = { x: restX(prefs.assistiveSide, W), y: clamp(prefs.assistiveY * H, minY, maxY) };
  const pos = useRef(new Animated.ValueXY(first)).current;
  const at = useRef(first);
  // Where it is this moment, even halfway through a spring, so a drag picks it up without a jump.
  const now = useRef(first);
  const start = useRef(first);
  const moved = useRef(false);
  const dragging = useRef(false);

  // Brightness while idle, and the panel opening (both on the native driver, on views of their own).
  const bright = useRef(new Animated.Value(1)).current;
  const opening = useRef(new Animated.Value(0)).current;
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  // Where the panel grows from: the button's centre when it was tapped.
  const [origin, setOrigin] = useState({ x: 0, y: 0 });

  const restSoon = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      Animated.timing(bright, { toValue: IDLE_OPACITY, duration: 400, useNativeDriver: true }).start();
    }, IDLE_MS);
  }, [bright]);

  const wake = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = null;
    bright.stopAnimation();
    Animated.timing(bright, { toValue: 1, duration: 120, useNativeDriver: true }).start();
  }, [bright]);

  useEffect(() => {
    restSoon();
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [restSoon]);

  useEffect(() => {
    const id = pos.addListener((v) => {
      now.current = v;
    });
    return () => pos.removeListener(id);
  }, [pos]);

  // The screen turned, the room it may use changed (the player bar came or went), or the saved spot
  // changed elsewhere: glide to the new spot. Not after a drag of our own, which has already set `at`
  // to the spot it is springing to, so the spring isn't cut short.
  const { assistiveSide, assistiveY } = prefs;
  useEffect(() => {
    if (dragging.current) return;
    const target = { x: restX(assistiveSide, W), y: clamp(assistiveY * H, minY, maxY) };
    if (Math.abs(target.x - at.current.x) < 0.5 && Math.abs(target.y - at.current.y) < 0.5) return;
    at.current = target;
    pos.stopAnimation();
    if (reduce !== false) pos.setValue(target);
    else Animated.spring(pos, { toValue: target, friction: 9, tension: 70, useNativeDriver: false }).start();
  }, [W, H, minY, maxY, assistiveSide, assistiveY, pos, reduce]);

  const openPanel = useCallback(() => {
    tap('light');
    wake();
    setOrigin({ x: at.current.x + SIZE / 2, y: at.current.y + SIZE / 2 });
    setOpen(true);
    opening.stopAnimation();
    if (reduce !== false) Animated.timing(opening, { toValue: 1, duration: 160, useNativeDriver: true }).start();
    else Animated.spring(opening, { toValue: 1, damping: 20, stiffness: 240, mass: 0.8, useNativeDriver: true }).start();
  }, [opening, wake, reduce]);

  const closePanel = useCallback(
    (quiet?: boolean) => {
      if (!quiet) tap('light');
      opening.stopAnimation();
      Animated.timing(opening, { toValue: 0, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(({ finished }) => {
        if (finished) setOpen(false);
      });
      restSoon();
    },
    [opening, restSoon],
  );

  // Kept in a ref so the pan responder (made once) always opens with the latest function.
  const openRef = useRef(openPanel);
  openRef.current = openPanel;
  const wakeRef = useRef(wake);
  wakeRef.current = wake;
  const restRef = useRef(restSoon);
  restRef.current = restSoon;

  /** Lets go of a drag: spring to the nearer side, inside the safe area, and remember the spot. */
  const settle = useCallback(
    (x: number, y: number) => {
      const g = geo.current;
      const side: 'left' | 'right' = x + SIZE / 2 < g.W / 2 ? 'left' : 'right';
      const target = { x: restX(side, g.W), y: clamp(y, g.minY, g.maxY) };
      at.current = target;
      Animated.spring(pos, { toValue: target, friction: 7, tension: 60, useNativeDriver: false }).start();
      setPrefs({ assistiveSide: side, assistiveY: g.H ? target.y / g.H : 0.6 });
      restRef.current();
    },
    [pos],
  );
  const settleRef = useRef(settle);
  settleRef.current = settle;

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // Once the finger is on the button, a list underneath mustn't take the drag away.
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        dragging.current = true;
        moved.current = false;
        pos.stopAnimation();
        // Where it is now (mid-spring, perhaps), not just where it was heading.
        start.current = { ...now.current };
        wakeRef.current();
      },
      onPanResponderMove: (_, g) => {
        if (!moved.current && Math.abs(g.dx) + Math.abs(g.dy) < SLOP) return;
        moved.current = true;
        const s = geo.current;
        pos.setValue({ x: clamp(start.current.x + g.dx, 0, s.W - SIZE), y: clamp(start.current.y + g.dy, s.minY, s.maxY) });
      },
      onPanResponderRelease: (_, g) => {
        dragging.current = false;
        if (!moved.current) {
          openRef.current();
          return;
        }
        settleRef.current(start.current.x + g.dx, start.current.y + g.dy);
      },
      onPanResponderTerminate: (_, g) => {
        dragging.current = false;
        if (moved.current) settleRef.current(start.current.x + g.dx, start.current.y + g.dy);
        else restRef.current();
      },
    }),
  ).current;

  // Hidden (a video opened, the keyboard came up, a call started): the panel goes too, and a
  // drag cut off by it is forgotten, or the button would never take its saved spot again.
  useEffect(() => {
    if (!hidden) return;
    dragging.current = false;
    if (!open) return;
    opening.stopAnimation();
    opening.setValue(0);
    setOpen(false);
  }, [hidden, open, opening]);

  // Moving to another screen by any other route closes the panel.
  const lastPath = useRef(path);
  useEffect(() => {
    if (lastPath.current === path) return;
    lastPath.current = path;
    if (open) closePanel(true);
  }, [path, open, closePanel]);

  // Android's back button closes the panel rather than leaving the screen underneath.
  useEffect(() => {
    if (!open) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      closePanel();
      return true;
    });
    return () => sub.remove();
  }, [open, closePanel]);

  function go(app: App) {
    closePanel();
    if (app.key === 'home') {
      // Back down to the tabs (rather than another copy of them on top), then to Home.
      if (router.canDismiss()) router.dismissAll();
      router.navigate('/');
      return;
    }
    if (path === app.href) return;
    router.push(app.href as any);
  }

  if (hidden) return null;

  const cell = (PANEL - 24) / 3;
  // As tall as its rows of three need.
  const panelH = Math.ceil(APPS.length / 3) * cell + 24;
  const panelLeft = (W - PANEL) / 2;
  const panelTop = (H - panelH) / 2;
  // It grows out of the button; with Reduce Motion on it simply fades in where it ends up.
  const grow =
    reduce !== false
      ? { opacity: opening.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }) }
      : {
          opacity: opening.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 1, 1], extrapolate: 'clamp' }),
          transform: [
            { translateX: opening.interpolate({ inputRange: [0, 1], outputRange: [origin.x - W / 2, 0] }) },
            { translateY: opening.interpolate({ inputRange: [0, 1], outputRange: [origin.y - H / 2, 0] }) },
            { scale: opening.interpolate({ inputRange: [0, 1], outputRange: [SIZE / PANEL, 1], extrapolateLeft: 'clamp' }) },
          ],
        };
  // The button gives way to the panel as it opens.
  const buttonOpacity = Animated.multiply(bright, opening.interpolate({ inputRange: [0, 0.3], outputRange: [1, 0], extrapolate: 'clamp' }));

  return (
    // Fills the screen but lets every touch through to the app, except on the button (and the panel, when open).
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {open ? (
        <>
          <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.08)', opacity: opening.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }) }]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => closePanel()} accessibilityRole="button" accessibilityLabel={t('churchApps.close')} />
          </Animated.View>
          <Animated.View accessibilityViewIsModal onAccessibilityEscape={() => closePanel()} style={[{ position: 'absolute', left: panelLeft, top: panelTop, width: PANEL, height: panelH }, grow]}>
            {/* Always dark and see-through, whatever the theme, like the phone's own panel. */}
            <BlurView intensity={50} tint="dark" style={{ flex: 1, borderRadius: 36, overflow: 'hidden' }}>
              <View style={{ flex: 1, padding: 12, backgroundColor: 'rgba(28,28,30,0.72)', flexDirection: 'row', flexWrap: 'wrap', alignContent: 'center', justifyContent: 'center' }}>
                {APPS.map((app) => (
                  <Pressable
                    key={app.key}
                    onPress={() => go(app)}
                    accessibilityRole="button"
                    accessibilityLabel={t(app.label)}
                    style={({ pressed }) => ({ width: cell, height: cell, alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 20, backgroundColor: pressed ? 'rgba(255,255,255,0.14)' : 'transparent' })}>
                    <View style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
                      {app.icon === 'orb' ? <ThinkingOrb size={34} /> : <Icon name={app.icon} size={30} color="#fff" />}
                    </View>
                    <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={{ color: '#fff', fontSize: 12, fontWeight: '500', fontFamily: font, maxWidth: cell - 6, textAlign: 'center' }}>
                      {t(app.label)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </BlurView>
          </Animated.View>
        </>
      ) : null}

      <Animated.View style={{ position: 'absolute', left: 0, top: 0, width: SIZE, height: SIZE, transform: pos.getTranslateTransform() }} pointerEvents={open ? 'none' : 'auto'}>
        <Animated.View
          {...responder.panHandlers}
          accessible
          accessibilityRole="button"
          accessibilityLabel={t('churchApps.title')}
          accessibilityHint={t('churchApps.hint')}
          onAccessibilityTap={openPanel}
          // Android's screen reader activates rather than taps.
          accessibilityActions={[{ name: 'activate' }]}
          onAccessibilityAction={(e) => {
            if (e.nativeEvent.actionName === 'activate') openPanel();
          }}
          style={{ width: SIZE, height: SIZE, opacity: buttonOpacity }}>
          <BlurView intensity={40} tint={C.blurTint} style={{ flex: 1, borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: C.hairline }}>
            <View style={{ flex: 1, backgroundColor: C.glass, alignItems: 'center', justifyContent: 'center' }}>
              {/* A soft ring round a soft dot: reads as "press me" without being an icon. */}
              <View style={{ width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: C.fg + '40', alignItems: 'center', justifyContent: 'center' }}>
                <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: C.fg, opacity: 0.82 }} />
              </View>
            </View>
          </BlurView>
        </Animated.View>
      </Animated.View>
    </View>
  );
}
