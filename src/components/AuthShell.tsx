import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Image,
  Keyboard,
  LayoutAnimation,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  useWindowDimensions,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useNavigation } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppFont } from '../lib/fonts';
import { useT } from '../lib/i18n';
import { reduceMotionNow } from '../lib/motion';
import { C, DARK } from '../lib/theme';
import { Icon, Mark } from './Icon';
import { LinkedSentence } from './LegalDocument';

/** The app's name as a word: a bold, bookish serif rather than a handwritten script. In the theme's text colour unless given one. */
export function Wordmark({ size = 40, color }: { size?: number; color?: string }) {
  return (
    <Text accessibilityRole="header" style={{ color: color ?? C.fg, fontSize: size, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontWeight: '700', letterSpacing: 0.3, textAlign: 'center' }}>
      Community
    </Text>
  );
}

/**
 * The photographs at the top of the sign-in pages (portrait, 1080 x 2340, shown centre-cropped). Each
 * time a page mounts it takes the next one in turn, so logging out and back in, or moving from sign-in
 * to sign-up, changes the picture. The first is picked at random so the app does not always open on the same one.
 */
const WALLPAPERS = [require('../../assets/auth-church.jpg'), require('../../assets/auth-bible.jpg'), require('../../assets/auth-desk.jpg')];
let nextWallpaper = Math.floor(Math.random() * WALLPAPERS.length);

function takeWallpaper() {
  const picked = WALLPAPERS[nextWallpaper];
  nextWallpaper = (nextWallpaper + 1) % WALLPAPERS.length;
  return picked;
}

/**
 * ui.tsx's Field in the dark colours, for a field on a screen that stays dark in every theme:
 * `<Field {...DARK_FIELD} … />`. (The sign-in pages follow the theme now, and use AuthField.)
 */
export const DARK_FIELD = { placeholderTextColor: DARK.fg3, selectionColor: DARK.accent2, keyboardAppearance: 'dark', style: { backgroundColor: DARK.surface, color: DARK.fg } } as const;

/* ---------- keeping the field being typed in above the keyboard (other screens) ---------- */

/**
 * Keeps the field being typed in, and a little of what follows it (the next field, or the button),
 * in view above the keyboard: a ScrollView in a KeyboardAvoidingView gets smaller when the keyboard
 * comes up, but it doesn't scroll to the field by itself. Put `ref`, `onScroll` and
 * `scrollEventThrottle={16}` on the ScrollView, and `onFocus` and `onBlur` on its fields (or provide
 * them to the birthday boxes with FieldRevealProvider). Fields that aren't given them, such as those
 * in a sheet over the screen, never move it. `follow` is how much below the field to show.
 * (AuthShell has its own, simpler way: see below.)
 */
export function useKeyboardReveal(follow = 96) {
  const ref = useRef<ScrollView>(null);
  const offset = useRef(0);
  // The ScrollView the offset was read from: a new one (a screen that draws a new one per page) starts at the top.
  const seen = useRef<ScrollView | null>(null);
  // True while one of this screen's own fields has the keyboard.
  const armed = useRef(false);
  const reveal = useCallback(() => {
    // Measured once the keyboard and the layout under it have settled.
    requestAnimationFrame(() => {
      const scroll = ref.current;
      if (scroll !== seen.current) {
        seen.current = scroll;
        offset.current = 0;
      }
      const box = scroll?.getNativeScrollRef?.();
      let input: ReturnType<typeof TextInput.State.currentlyFocusedInput> | null = null;
      try {
        input = TextInput.State.currentlyFocusedInput();
      } catch {
        input = null;
      }
      if (!scroll || !box || !input) return;
      const field = input;
      box.measureInWindow((_x, top, _w, height) => {
        field.measureInWindow((_fx, y, _fw, h) => {
          if (!height || !h) return;
          // Enough to show the field and what follows it, but never so far that the field itself goes off the top.
          const by = Math.min(y + h + follow - (top + height), y - top - 12);
          if (by > 2) scroll.scrollTo({ y: offset.current + by, animated: true });
        });
      });
    });
  }, [follow]);
  useEffect(() => {
    // The first field to be touched gets its keyboard only after its focus: look again once it is up.
    const sub = Keyboard.addListener('keyboardDidShow', () => {
      if (armed.current) reveal();
    });
    return () => sub.remove();
  }, [reveal]);
  const onFocus = useCallback(() => {
    armed.current = true;
    reveal();
  }, [reveal]);
  const onBlur = useCallback(() => {
    armed.current = false;
  }, []);
  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    offset.current = e.nativeEvent.contentOffset.y;
    seen.current = ref.current;
  }, []);
  return { ref, onScroll, onFocus, onBlur };
}

type FieldReveal = { onFocus: () => void; onBlur: () => void; action?: React.RefObject<View | null> };
const RevealContext = createContext<FieldReveal | null>(null);

/** Hands a screen's way of keeping a field above the keyboard to the AuthFields and birthday boxes inside it. */
export const FieldRevealProvider = RevealContext.Provider;

/** The screen's way of keeping a field above the keyboard, if it has one (AuthShell, or useKeyboardReveal). */
export function useFieldReveal(): FieldReveal | null {
  return useContext(RevealContext);
}

/* ---------- a field ---------- */

/** How tall a field (and the main button) is on these pages. */
export const AUTH_FIELD_HEIGHT = 50;

/**
 * A field on the sign-in pages, in the theme's colours: a soft filled box whose edge turns green while
 * it is typed in (nothing else moves). A password field gets Show / Hide at its end once something is
 * typed. `label`, when given, sits above it; otherwise the placeholder names it. `ref` reaches the
 * text box, so the keyboard's Next key can move on to the following field.
 */
export function AuthField({ label, error, ref, onFocus, onBlur, style, secureTextEntry, ...rest }: TextInputProps & { label?: string; error?: string; ref?: React.Ref<TextInput> }) {
  const reveal = useFieldReveal();
  const t = useT();
  const font = useAppFont();
  const fontBold = useAppFont('bold');
  const [focused, setFocused] = useState(false);
  const [shown, setShown] = useState(false);
  const secret = !!secureTextEntry;
  const typed = typeof rest.value === 'string' ? rest.value.length > 0 : true;
  return (
    <View style={{ gap: 6 }}>
      {label ? <Text style={{ color: C.fg2, fontSize: 13, fontWeight: '600', fontFamily: fontBold }}>{label}</Text> : null}
      <View
        style={{
          height: AUTH_FIELD_HEIGHT,
          flexDirection: 'row',
          alignItems: 'center',
          borderRadius: 12,
          borderWidth: 1,
          // Only colours change on focus, so nothing on the page shifts.
          borderColor: focused ? C.accent : C.line,
          backgroundColor: focused ? C.bg : C.surface,
        }}>
        <TextInput
          placeholderTextColor={C.fg2}
          selectionColor={C.accent2}
          cursorColor={C.accent}
          keyboardAppearance={C.blurTint}
          // A password shown with Show must not be "corrected" as it is typed.
          {...(secret ? { autoCorrect: false, spellCheck: false } : null)}
          {...rest}
          ref={ref}
          secureTextEntry={secret && !shown}
          accessibilityLabel={rest.accessibilityLabel ?? label ?? rest.placeholder}
          onFocus={(e) => {
            setFocused(true);
            reveal?.onFocus();
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            reveal?.onBlur();
            onBlur?.(e);
          }}
          style={[{ flex: 1, alignSelf: 'stretch', paddingHorizontal: 14, paddingVertical: 0, color: C.fg, fontSize: 16, fontFamily: font }, style]}
        />
        {secret && typed ? (
          <Pressable
            onPress={() => setShown((s) => !s)}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={shown ? t('auth.hidePassword') : t('auth.showPassword')}
            style={({ pressed }) => ({ alignSelf: 'stretch', justifyContent: 'center', paddingHorizontal: 14, opacity: pressed ? 0.5 : 1 })}>
            <Text style={{ color: C.fg, fontSize: 14, fontWeight: '600', fontFamily: fontBold }}>{shown ? t('auth.hide') : t('auth.show')}</Text>
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text accessibilityLiveRegion="polite" style={{ color: C.like, fontSize: 13.5, lineHeight: 19, fontFamily: font }}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

/* ---------- the frame ---------- */

/** Below this the "keyboard" is only a hardware keyboard's bar of shortcuts: the page keeps its picture. */
const KEYBOARD_UP = 80;
/** Room kept in view under the field being typed in: the gap and the button (or the next field). */
const FOLLOW = 76;

/** How much of the screen a keyboard with these measurements covers. */
function covered(m?: { screenY: number; height: number } | null): number {
  if (!m) return 0;
  const screen = Dimensions.get('window').height;
  // An iPhone says where the keyboard's top edge will be (0 with Prefer Cross-Fade Transitions on);
  // Android gives its height, and resizes the window round it by itself.
  const h = Platform.OS === 'ios' && m.screenY > 0 ? screen - m.screenY : m.height;
  return Math.max(0, Math.min(Math.round(h), Math.round(screen * 0.8)));
}

/** `rgba()` of a `#rrggbb` theme colour, for a fade that doesn't go grey on the way. */
function withAlpha(color: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (!m) return alpha >= 1 ? color : 'transparent';
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/**
 * Light status bar text over the photograph, the theme's own once the photograph has gone (while the
 * keyboard is up), and only while this screen is the one showing (see DarkStatusBar in OnDark.tsx).
 */
function ShellStatusBar({ overPhoto }: { overPhoto: boolean }) {
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
  return focused ? <StatusBar style={overPhoto ? 'light' : C.statusBar} animated /> : null;
}

/**
 * The frame around every sign-in page, in the member's theme. A photograph at the top melts into the
 * page; under it the logo and the name, then the form on the plain page colour. While the keyboard
 * is up the photograph folds away with the keyboard's own timing (one movement, nothing scrolls), so
 * the form sits high on the plain page with the field and the button above the keyboard; the footer
 * ("Don't have an account? Sign up") is left out meanwhile rather than riding on the keyboard. A form
 * too tall for a small phone scrolls once, after the keyboard is up, and only as far as it must.
 *
 * `heading` is a short title over the form; `title` a sentence under it (or alone).
 */
export function AuthShell({ children, title, heading, footer }: { children: React.ReactNode; title?: string; heading?: string; footer?: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();
  const font = useAppFont();
  const fontBold = useAppFont('bold');
  const [wallpaper] = useState(takeWallpaper);
  // How much of the screen the keyboard covers now (0 while it is down).
  const [kb, setKb] = useState(() => (Keyboard.isVisible() ? covered(Keyboard.metrics()) : 0));
  const kbRef = useRef(kb);
  const up = kb > KEYBOARD_UP;
  // The photograph's opacity: it fades as it folds away.
  const photo = useRef(new Animated.Value(up ? 0 : 1)).current;

  const scrollRef = useRef<ScrollView>(null);
  const offset = useRef(0);
  const contentH = useRef(0);
  const viewH = useRef(0);
  const touching = useRef(false);
  // True from when the keyboard has finished coming up (and the page under it has settled) until it starts to go.
  const settled = useRef(kb > 0);
  // True while one of this page's own fields has the keyboard.
  const armed = useRef(false);
  // The page's main button (AuthAction), kept in view with the field even when something sits between them.
  const action = useRef<View | null>(null);

  /** Scrolls just enough to show the field being typed in and what follows it, if they aren't already in view. */
  const reveal = useCallback(() => {
    requestAnimationFrame(() => {
      const scroll = scrollRef.current;
      const box = scroll?.getNativeScrollRef?.();
      let input: ReturnType<typeof TextInput.State.currentlyFocusedInput> | null = null;
      try {
        input = TextInput.State.currentlyFocusedInput();
      } catch {
        input = null;
      }
      if (!scroll || !box || !input) return;
      const field = input;
      box.measureInWindow((_x, top, _w, height) => {
        field.measureInWindow((_fx, y, _fw, h) => {
          if (!height || !h) return;
          const go = (bottom: number) => {
            // Never so far that the field itself goes off the top.
            const by = Math.min(bottom - (top + height), y - top - 16);
            if (by > 2) scroll.scrollTo({ y: offset.current + by, animated: true });
          };
          const below = y + h + FOLLOW;
          const main = action.current;
          if (!main) return go(below);
          // The main button too, when it comes after the field (the consent box can sit between them).
          main.measureInWindow((_ax, ay, _aw, ah) => go(ah && ay > y ? Math.max(below, ay + ah + 12) : below));
        });
      });
    });
  }, []);

  useEffect(() => {
    const ios = Platform.OS === 'ios';
    /** The page's one movement for a keyboard change: the photograph, the room at the bottom and the footer together. */
    const move = (next: number, duration: number) => {
      const before = kbRef.current;
      if (Math.abs(next - before) < 1) return;
      kbRef.current = next;
      const still = reduceMotionNow() === true;
      const ms = duration > 10 ? duration : 250;
      // On iPhone every change of layout in the next draw follows the keyboard's own curve and timing.
      if (ios && !still && duration > 0) {
        LayoutAnimation.configureNext({ duration: ms, update: { type: LayoutAnimation.Types.keyboard, duration: ms } });
      }
      const wasUp = before > KEYBOARD_UP;
      const isUp = next > KEYBOARD_UP;
      if (wasUp !== isUp) {
        photo.stopAnimation();
        if (still) photo.setValue(isUp ? 0 : 1);
        else Animated.timing(photo, { toValue: isUp ? 0 : 1, duration: isUp ? Math.round(ms * 0.8) : ms, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
      }
      setKb(next);
    };
    // Once the keyboard has gone the page is taller again, and a page scrolled down meanwhile could be
    // left part-empty at the bottom: it settles back, unless a finger is moving it.
    const settleBack = () =>
      requestAnimationFrame(() => {
        const max = Math.max(0, contentH.current - viewH.current);
        if (!touching.current && offset.current > max + 1) scrollRef.current?.scrollTo({ y: max, animated: true });
      });
    const subs = ios
      ? [
          Keyboard.addListener('keyboardWillShow', (e) => {
            settled.current = false;
            move(covered(e.endCoordinates), e.duration);
          }),
          Keyboard.addListener('keyboardDidShow', (e) => {
            move(covered(e.endCoordinates), 0);
            settled.current = true;
            if (armed.current) reveal();
          }),
          Keyboard.addListener('keyboardWillHide', (e) => {
            settled.current = false;
            move(0, e.duration);
          }),
          Keyboard.addListener('keyboardDidHide', () => {
            settled.current = false;
            move(0, 0);
            settleBack();
          }),
        ]
      : [
          Keyboard.addListener('keyboardDidShow', (e) => {
            settled.current = true;
            move(covered(e.endCoordinates), 0);
          }),
          Keyboard.addListener('keyboardDidHide', () => {
            settled.current = false;
            move(0, 0);
            settleBack();
          }),
        ];
    return () => subs.forEach((s) => s.remove());
  }, [photo, reveal]);

  // Android: the window has resized round the keyboard by the time this page has drawn for it.
  useEffect(() => {
    if (Platform.OS !== 'ios' && kb > 0 && armed.current) reveal();
  }, [kb, reveal]);

  const fieldReveal = useMemo<FieldReveal>(
    () => ({
      onFocus: () => {
        armed.current = true;
        // Moving between fields with the keyboard already up. Otherwise the keyboard's arrival does it.
        if (settled.current) reveal();
      },
      onBlur: () => {
        armed.current = false;
      },
      action,
    }),
    [reveal],
  );

  const small = screenH < 700;
  // The photograph: about a quarter of the screen, less on a small phone. Folded to the status bar's
  // height while the keyboard is up.
  const heroH = small ? insets.top + 84 : Math.round(Math.min(Math.max(screenH * 0.25, 190), 270));
  return (
    <View style={{ flex: 1, backgroundColor: C.bg, paddingBottom: Platform.OS === 'ios' ? kb : 0 }}>
      <ShellStatusBar overPhoto={!up} />
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: up ? 16 : footer ? insets.bottom : insets.bottom + 20 }}
        contentInsetAdjustmentBehavior="never"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        alwaysBounceVertical={false}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={(e) => {
          offset.current = e.nativeEvent.contentOffset.y;
        }}
        onContentSizeChange={(_w, h) => {
          contentH.current = h;
        }}
        onLayout={(e) => {
          viewH.current = e.nativeEvent.layout.height;
        }}
        onScrollBeginDrag={() => {
          touching.current = true;
        }}
        onScrollEndDrag={() => {
          touching.current = false;
        }}
        onMomentumScrollBegin={() => {
          touching.current = true;
        }}
        onMomentumScrollEnd={() => {
          touching.current = false;
        }}>
        <View style={{ height: up ? insets.top + 10 : heroH, overflow: 'hidden' }}>
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: photo }]}>
            <Image source={wallpaper} resizeMode="cover" style={[StyleSheet.absoluteFill, { width: '100%', height: '100%' }]} accessibilityIgnoresInvertColors />
            {/* A soft shade behind the clock and battery, and a long fade into the page below. */}
            <LinearGradient colors={['rgba(0,0,0,0.42)', 'rgba(0,0,0,0)']} style={{ position: 'absolute', left: 0, right: 0, top: 0, height: insets.top + 44 }} />
            <LinearGradient colors={[withAlpha(C.bg, 0), withAlpha(C.bg, 0.55), withAlpha(C.bg, 1)]} locations={[0, 0.5, 1]} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '60%' }} />
          </Animated.View>
        </View>
        <View style={{ width: '100%', maxWidth: 440, alignSelf: 'center', paddingHorizontal: 24 }}>
          {/* The logo and the name, sitting just into the last of the photograph's fade. */}
          <View style={{ alignItems: 'center', marginTop: up ? 0 : -18 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Mark size={42} color={C.fg} />
              <Wordmark size={30} />
            </View>
            <Text style={{ color: C.fg3, fontSize: 11, fontWeight: '600', letterSpacing: 2.4, marginTop: 4, textTransform: 'uppercase', fontFamily: fontBold }}>Seventh-day Adventist</Text>
          </View>
          {heading ? (
            <Text accessibilityRole="header" style={{ color: C.fg, fontSize: 21, lineHeight: 27, fontWeight: '700', textAlign: 'center', marginTop: 24, fontFamily: fontBold }}>
              {heading}
            </Text>
          ) : null}
          {title ? <Text style={{ color: C.fg2, fontSize: 15, lineHeight: 21, textAlign: 'center', marginTop: heading ? 8 : 22, fontFamily: font }}>{title}</Text> : null}
          <FieldRevealProvider value={fieldReveal}>
            <View style={{ gap: 12, marginTop: heading || title ? 22 : small ? 22 : 28 }}>{children}</View>
          </FieldRevealProvider>
        </View>
        <View style={{ flexGrow: 1, minHeight: 20 }} />
        {footer && !up ? (
          <View style={{ borderTopWidth: 1, borderTopColor: C.line, paddingVertical: 16, paddingHorizontal: 24, alignItems: 'center' }}>{footer}</View>
        ) : null}
      </ScrollView>
    </View>
  );
}

/**
 * Holds a sign-in page's main button. While a field above it is typed in, AuthShell keeps the button
 * in view too, not only the field: on a small phone the consent box (or an error) can sit between them.
 * One per page; it draws nothing of its own.
 */
export function AuthAction({ children }: { children: React.ReactNode }) {
  const reveal = useFieldReveal();
  return (
    <View ref={reveal?.action} collapsable={false}>
      {children}
    </View>
  );
}

/* ---------- small print ---------- */

/** "By continuing you agree to our Terms and Privacy Policy." style: small, quiet text with its links one step brighter. */
export const AUTH_SMALL_PRINT = { fontSize: 12.5, lineHeight: 18 } as const;

/**
 * The tick box for explicit consent to use what may show religious belief (a church, using a
 * Christian app), which UK GDPR (Article 9) needs. Unticked to begin with. On the sign-up page, and in
 * onboarding for an account made without passing it (Apple or Google from the log-in page).
 */
export function ConsentBox({ checked, onToggle, onOpenPrivacy }: { checked: boolean; onToggle: () => void; onOpenPrivacy: () => void }) {
  const t = useT();
  const font = useAppFont();
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={t('legal.consentReligion', { privacy: t('legal.privacyLink') })}
      hitSlop={6}
      style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 2 }}>
      <View style={{ width: 22, height: 22, marginTop: 1, borderRadius: 7, borderWidth: 1.5, borderColor: checked ? C.accent : C.fg3, backgroundColor: checked ? C.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
        {checked ? <Icon name="check" size={15} color={C.onAccent} weight={3} /> : null}
      </View>
      <LinkedSentence
        text={t('legal.consentReligion')}
        slots={{ privacy: { label: t('legal.privacyLink'), onPress: onOpenPrivacy } }}
        style={{ flex: 1, color: C.fg2, fontSize: 13.5, lineHeight: 19, fontFamily: font }}
        linkStyle={{ color: C.fg, fontWeight: '600' }}
      />
    </Pressable>
  );
}
