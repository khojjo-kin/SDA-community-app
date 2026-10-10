import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Keyboard, KeyboardAvoidingView, type NativeScrollEvent, type NativeSyntheticEvent, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useT } from '../lib/i18n';
import { DARK } from '../lib/theme';
import { Icon, Mark } from './Icon';
import { LinkedSentence } from './LegalDocument';
import { Field } from './ui';

/** The app's name as a word: a bold, bookish serif rather than a handwritten script. */
export function Wordmark({ size = 40 }: { size?: number }) {
  return (
    <Text accessibilityRole="header" style={{ color: DARK.fg, fontSize: size, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontWeight: '700', letterSpacing: 0.5, textAlign: 'center' }}>
      Community
    </Text>
  );
}

/**
 * The photographs behind the sign-in pages (portrait, 1080 x 2340). Each time a page mounts it takes the
 * next one in turn, so logging out and back in, or moving from sign-in to sign-up, changes the picture.
 * The first is picked at random so the app does not always open on the same one.
 */
const WALLPAPERS = [require('../../assets/auth-church.jpg'), require('../../assets/auth-bible.jpg'), require('../../assets/auth-desk.jpg')];
let nextWallpaper = Math.floor(Math.random() * WALLPAPERS.length);

function takeWallpaper() {
  const picked = WALLPAPERS[nextWallpaper];
  nextWallpaper = (nextWallpaper + 1) % WALLPAPERS.length;
  return picked;
}

/**
 * ui.tsx's Field draws in the app's theme; the sign-in pages are dark in every theme, so their fields
 * take these colours instead: `<Field {...DARK_FIELD} … />`, or AuthField below.
 */
export const DARK_FIELD = { placeholderTextColor: DARK.fg3, selectionColor: DARK.accent2, keyboardAppearance: 'dark', style: { backgroundColor: DARK.surface, color: DARK.fg } } as const;

/* ---------- keeping the field being typed in above the keyboard ---------- */

/**
 * Keeps the field being typed in, and a little of what follows it (the next field, or the button),
 * in view above the keyboard: a ScrollView in a KeyboardAvoidingView gets smaller when the keyboard
 * comes up, but it doesn't scroll to the field by itself. Put `ref`, `onScroll` and
 * `scrollEventThrottle={16}` on the ScrollView, and `onFocus` and `onBlur` on its fields (or provide
 * them to AuthField and the birthday boxes with FieldRevealProvider). Fields that aren't given them,
 * such as those in a sheet over the screen, never move it. `follow` is how much below the field to show.
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

type FieldReveal = { onFocus: () => void; onBlur: () => void };
const RevealContext = createContext<FieldReveal | null>(null);

/** Hands a screen's useKeyboardReveal to the AuthFields and birthday boxes inside it. */
export const FieldRevealProvider = RevealContext.Provider;

/** The screen's way of keeping a field above the keyboard, if it has one (see useKeyboardReveal). */
export function useFieldReveal(): FieldReveal | null {
  return useContext(RevealContext);
}

/**
 * A field on the sign-in pages: ui.tsx's Field in the dark colours (with its label in them too), kept
 * above the keyboard while it is typed in. `ref` reaches the text box, so the keyboard's Next key can
 * move on to the following field.
 */
export function AuthField({ label, ref, onFocus, onBlur, style, ...rest }: React.ComponentProps<typeof Field> & { ref?: React.Ref<TextInput> }) {
  const reveal = useFieldReveal();
  const field = (
    <Field
      {...DARK_FIELD}
      {...rest}
      // Field hands everything on to its text box, `ref` included; its type just doesn't list it.
      {...({ ref } as {})}
      accessibilityLabel={rest.accessibilityLabel ?? label ?? rest.placeholder}
      style={[DARK_FIELD.style, style]}
      onFocus={(e) => {
        reveal?.onFocus();
        onFocus?.(e);
      }}
      onBlur={(e) => {
        reveal?.onBlur();
        onBlur?.(e);
      }}
    />
  );
  if (!label) return field;
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: DARK.fg2, fontSize: 12.5 }}>{label}</Text>
      {field}
    </View>
  );
}

/* ---------- the frame ---------- */

/**
 * The frame around every sign-in page: a photograph behind the logo, fading into the app's dark
 * below the top third so the form always stays legible. Dark in every theme. The field being typed
 * in, with the button under it, stays above the keyboard on every size of phone.
 */
export function AuthShell({ children, title, footer }: { children: React.ReactNode; title?: string; footer?: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const [wallpaper] = useState(takeWallpaper);
  // Room for the next field or the button under the one being typed in.
  const kb = useKeyboardReveal(124);
  const reveal = useMemo(() => ({ onFocus: kb.onFocus, onBlur: kb.onBlur }), [kb.onFocus, kb.onBlur]);
  const scrollRef = kb.ref;
  // Once the keyboard has gone the page is taller again, and a page that was scrolled up to show a field
  // could be left part-empty at the bottom: it settles back, unless a finger is moving it.
  const offset = useRef(0);
  const contentH = useRef(0);
  const viewH = useRef(0);
  const touching = useRef(false);
  const onScroll = kb.onScroll;
  const tracked = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      offset.current = e.nativeEvent.contentOffset.y;
      onScroll(e);
    },
    [onScroll],
  );
  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidHide', () => {
      requestAnimationFrame(() => {
        const max = Math.max(0, contentH.current - viewH.current);
        if (!touching.current && offset.current > max + 1) scrollRef.current?.scrollTo({ y: max, animated: true });
      });
    });
    return () => sub.remove();
  }, [scrollRef]);
  // While the keyboard is up it covers the home indicator, so the footer needn't keep room for it.
  const [keyboardUp, setKeyboardUp] = useState(false);
  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const up = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardUp(true));
    const down = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardUp(false));
    return () => {
      up.remove();
      down.remove();
    };
  }, []);
  return (
    <View style={{ flex: 1, backgroundColor: DARK.bg }}>
      <Image source={wallpaper} style={[StyleSheet.absoluteFill, { width: '100%', height: '100%' }]} resizeMode="cover" accessibilityIgnoresInvertColors />
      <LinearGradient pointerEvents="none" colors={['rgba(11,16,20,0)', 'rgba(11,16,20,0.92)']} locations={[0.35, 1]} style={StyleSheet.absoluteFill} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          ref={kb.ref}
          onScroll={tracked}
          scrollEventThrottle={16}
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
          }}
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'flex-end', paddingHorizontal: 28, paddingTop: insets.top + 24, paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}>
          <View style={{ alignItems: 'center', gap: 6, marginBottom: 26 }}>
            {/* White whatever the theme: these pages are always dark. */}
            <Mark size={84} color="#fff" />
            <Wordmark />
            <Text style={{ color: 'rgba(243,245,247,0.78)', fontSize: 13.5, letterSpacing: 1.6, textTransform: 'uppercase' }}>Seventh-day Adventist</Text>
          </View>
          <FieldRevealProvider value={reveal}>
            <View style={{ gap: 14 }}>
              {title ? <Text style={{ color: DARK.fg2, textAlign: 'center', marginBottom: 6, lineHeight: 20 }}>{title}</Text> : null}
              {children}
            </View>
          </FieldRevealProvider>
        </ScrollView>
        {footer ? <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.14)', paddingTop: 16, paddingBottom: (keyboardUp ? 0 : insets.bottom) + 16, alignItems: 'center' }}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </View>
  );
}

/**
 * The tick box for explicit consent to use what may show religious belief (a church, using a
 * Christian app), which UK GDPR (Article 9) needs. Unticked to begin with. On the sign-up page, and in
 * onboarding for an account made without passing it (Apple or Google from the log-in page).
 */
export function ConsentBox({ checked, onToggle, onOpenPrivacy }: { checked: boolean; onToggle: () => void; onOpenPrivacy: () => void }) {
  const t = useT();
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={t('legal.consentReligion', { privacy: t('legal.privacyLink') })}
      hitSlop={6}
      style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 4 }}>
      <View style={{ width: 22, height: 22, marginTop: 1, borderRadius: 6, borderWidth: 1.5, borderColor: checked ? DARK.accent : 'rgba(255,255,255,0.55)', backgroundColor: checked ? DARK.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
        {checked ? <Icon name="check" size={16} color={DARK.onAccent} weight={3} /> : null}
      </View>
      <LinkedSentence
        text={t('legal.consentReligion')}
        slots={{ privacy: { label: t('legal.privacyLink'), onPress: onOpenPrivacy } }}
        style={{ flex: 1, color: DARK.fg2, fontSize: 13, lineHeight: 18 }}
        linkStyle={{ color: DARK.accent2 }}
      />
    </Pressable>
  );
}
