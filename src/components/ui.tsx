import React, { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, Alert, Animated, Easing, Keyboard, KeyboardAvoidingView, Modal, PanResponder, Platform, Pressable, StyleSheet, Text, TextInput, TextInputProps, useWindowDimensions, View, ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppFont } from '../lib/fonts';
import { tap } from '../lib/haptics';
// Plain t(), not useT(): these pieces are on every screen, and every screen is drawn again from the
// root when the language changes, so they needn't each listen for it.
import { t } from '../lib/i18n';
import { reduceMotionNow } from '../lib/motion';
import { C, CLOSE_RING, RING } from '../lib/theme';
import { Icon, IconName } from './Icon';

/* ---------- the floating tab bar's size, for anything that must sit clear of it ---------- */

export const TAB_BAR_HEIGHT = 64;
/** How far the tab bar sits above the bottom of the screen, given the safe-area inset there. */
export const tabBarBottom = (insetBottom: number) => Math.max(insetBottom - 8, 10);

/* ---------- one tap at a time ---------- */

/** A second tap this soon after the first is the same tap, not a new one (a double tap on a row). */
const ONE_TAP_MS = 320;

/**
 * The press handler, ignoring a repeat within a third of a second, so a quick double tap on a row or
 * button opens one screen, sends one request, not two.
 */
function useOneTap(fn: (() => void) | undefined): (() => void) | undefined {
  const last = useRef(0);
  const ref = useRef(fn);
  ref.current = fn;
  const handler = useCallback(() => {
    const now = Date.now();
    if (now - last.current < ONE_TAP_MS) return;
    last.current = now;
    ref.current?.();
  }, []);
  return fn ? handler : undefined;
}

/* ---------- avatar ---------- */

/**
 * `ringColors` replaces the green of a 'new' ring: a Plus member's chosen colour (src/lib/styling.ts).
 * `online` adds the green dot of someone active now (see isOnline in src/lib/api.ts).
 */
export function Avatar({ uri, name, size = 36, ring, ringColors, online }: { uri?: string | null; name?: string; size?: number; ring?: 'new' | 'seen' | 'close' | null; ringColors?: readonly string[]; online?: boolean }) {
  const face = <AvatarFace uri={uri} name={name} size={size} ring={ring} ringColors={ringColors} />;
  if (!online) return face;
  const dot = Math.max(10, Math.round(size * 0.28));
  return (
    <View>
      {face}
      <View accessibilityLabel={t('common.activeNow')} style={{ position: 'absolute', right: ring ? 2 : 0, bottom: ring ? 2 : 0, width: dot, height: dot, borderRadius: dot / 2, backgroundColor: C.ok, borderWidth: Math.max(2, dot * 0.18), borderColor: C.bg }} />
    </View>
  );
}

function AvatarFace({ uri, name, size, ring, ringColors }: { uri?: string | null; name?: string; size: number; ring?: 'new' | 'seen' | 'close' | null; ringColors?: readonly string[] }) {
  const inner = uri ? (
    <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: C.surface2 }} contentFit="cover" transition={120} cachePolicy="memory-disk" />
  ) : (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: C.fg, fontWeight: '700', fontSize: size * 0.44 }}>{(name || '?').trim().charAt(0).toUpperCase() || '?'}</Text>
    </View>
  );
  if (!ring) return inner;
  const pad = 2.5;
  const body = <View style={{ borderRadius: size, borderWidth: 2.5, borderColor: C.bg }}>{inner}</View>;
  if (ring === 'seen') return <View style={{ padding: pad, borderRadius: size, backgroundColor: C.surface2 }}>{body}</View>;
  const chosen = ring === 'close' ? CLOSE_RING : ringColors && ringColors.length >= 2 ? ringColors : RING;
  const colors = chosen as unknown as readonly [string, string, ...string[]];
  return (
    <LinearGradient colors={colors} start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }} style={{ padding: pad, borderRadius: size }}>
      {body}
    </LinearGradient>
  );
}

/* ---------- buttons and fields ---------- */

/** `textColor` is for a button given its own background in `style` (e.g. the red Go live button). */
export function Button({ label, onPress, kind = 'primary', small, busy, disabled, style, textColor }: { label: string; onPress?: () => void; kind?: 'primary' | 'ghost' | 'danger'; small?: boolean; busy?: boolean; disabled?: boolean; style?: ViewStyle; textColor?: string }) {
  const bg = kind === 'primary' ? C.accent : kind === 'danger' ? C.like : C.surface2;
  // Ghost buttons sit on the page colour, so their words follow the theme; the others are on a strong colour.
  const fg = textColor ?? (kind === 'primary' ? C.onAccent : kind === 'danger' ? '#ffffff' : C.fg);
  const font = useAppFont('bold');
  const press = useOneTap(onPress ? () => { tap('light'); onPress(); } : undefined);
  return (
    <Pressable
      // A light tap under the finger (if the member has haptics on); nothing while the button can't be pressed.
      onPress={busy || disabled ? undefined : press}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, busy: !!busy }}
      style={({ pressed }) => [{ height: small ? 32 : 46, paddingHorizontal: small ? 14 : 18, borderRadius: small ? 10 : 12, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.45 : pressed ? 0.75 : 1 }, style]}>
      {/* One line always: a longer word (or language) shrinks a little rather than spilling out of the button. */}
      {busy ? <ActivityIndicator color={fg} /> : <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={{ color: fg, fontWeight: '600', fontSize: small ? 13.5 : 15.5, fontFamily: font }}>{label}</Text>}
    </Pressable>
  );
}

export function Field({ label, error, style, ...rest }: TextInputProps & { label?: string; error?: string; ref?: React.Ref<TextInput> }) {
  const font = useAppFont();
  return (
    <View style={{ gap: 6 }}>
      {label ? <Text style={{ color: C.fg2, fontSize: 12.5, fontFamily: font }}>{label}</Text> : null}
      <TextInput placeholderTextColor={C.fg3} selectionColor={C.accent2} keyboardAppearance={C.blurTint} accessibilityLabel={label} {...rest} style={[{ color: C.fg, fontSize: 16, paddingHorizontal: 14, paddingVertical: 13, borderRadius: 12, backgroundColor: C.surface, fontFamily: font }, style]} />
      {error ? <Text style={{ color: C.like, fontSize: 13, fontFamily: font }}>{error}</Text> : null}
    </View>
  );
}

export function IconButton({ name, onPress, size = 24, color = C.fg, label, fill, badge, bg }: { name: IconName; onPress?: () => void; size?: number; color?: string; label: string; fill?: boolean; badge?: boolean; bg?: string }) {
  const press = useOneTap(onPress ? () => { tap('light'); onPress(); } : undefined);
  return (
    <Pressable onPress={press} hitSlop={8} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1, backgroundColor: bg })}>
      <Icon name={name} size={size} color={color} fill={fill} />
      {badge ? <View style={{ position: 'absolute', top: 6, right: 6, width: 10, height: 10, borderRadius: 5, backgroundColor: C.like, borderWidth: 2, borderColor: C.bg }} /> : null}
    </Pressable>
  );
}

/** The round button used in screen headers. */
export function RoundButton({ name, onPress, label, size = 44, bg = C.round, color = C.fg, iconSize = 24 }: { name: IconName; onPress?: () => void; label: string; size?: number; bg?: string; color?: string; iconSize?: number }) {
  const press = useOneTap(onPress ? () => { tap('light'); onPress(); } : undefined);
  return (
    <Pressable
      onPress={press}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: bg, borderWidth: StyleSheet.hairlineWidth, borderColor: C.hairline, opacity: pressed ? 0.65 : 1 })}>
      <Icon name={name} size={iconSize} color={color} />
    </Pressable>
  );
}

export function SearchField({ value, onChangeText, placeholder = t('common.search'), autoFocus, label }: { value: string; onChangeText: (t: string) => void; placeholder?: string; autoFocus?: boolean; label?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 14, paddingHorizontal: 12, height: 38, borderRadius: 12, backgroundColor: C.field }}>
      <Icon name="search" size={17} color={C.fg2} weight={2.2} />
      <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={C.fg2} autoFocus={autoFocus} style={{ flex: 1, color: C.fg, fontSize: 17, paddingVertical: 0 }} autoCapitalize="none" autoCorrect={false} returnKeyType="search" clearButtonMode="while-editing" keyboardAppearance={C.blurTint} accessibilityLabel={label ?? placeholder} />
    </View>
  );
}

/** On or off. Off looks like a pale track with a dark handle on the left. */
export function Toggle({ value, onChange, label, disabled }: { value: boolean; onChange: (next: boolean) => void; label: string; disabled?: boolean }) {
  const pos = useRef(new Animated.Value(value ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(pos, { toValue: value ? 1 : 0, duration: 140, useNativeDriver: true }).start();
  }, [value, pos]);
  return (
    // 'select' is the crisp click a switch makes; felt before the change so it lands with the finger.
    <Pressable onPress={disabled ? undefined : () => { tap('select'); onChange(!value); }} hitSlop={8} accessibilityRole="switch" accessibilityLabel={label} accessibilityState={{ checked: value, disabled: !!disabled }} style={{ width: 62, height: 28, borderRadius: 14, backgroundColor: value ? C.accent : C.surface2, justifyContent: 'center', opacity: disabled ? 0.5 : 1 }}>
      <Animated.View style={{ width: 36, height: 24, borderRadius: 12, marginLeft: 2, backgroundColor: value ? '#ffffff' : C.bg, transform: [{ translateX: pos.interpolate({ inputRange: [0, 1], outputRange: [0, 22] }) }] }} />
    </Pressable>
  );
}

export function Radio({ on }: { on: boolean }) {
  return (
    <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: on ? 2 : 1.5, borderColor: on ? C.fg : C.fg3, alignItems: 'center', justifyContent: 'center' }}>
      {on ? <View style={{ width: 13, height: 13, borderRadius: 7, backgroundColor: C.fg }} /> : null}
    </View>
  );
}

export function NewPill({ label = t('common.new') }: { label?: string }) {
  return (
    <View style={{ height: 30, paddingHorizontal: 13, borderRadius: 15, backgroundColor: C.accent, justifyContent: 'center' }}>
      <Text style={{ color: C.onAccent, fontWeight: '700', fontSize: 14.5 }}>{label}</Text>
    </View>
  );
}

/* ---------- page furniture ---------- */

export function Header({ title, left, right, center }: { title?: string; left?: React.ReactNode; right?: React.ReactNode; center?: boolean }) {
  const router = useRouter();
  const font = useAppFont('bold');
  return (
    <View style={{ height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, gap: 6 }}>
      {left === undefined ? <IconButton name="back" label={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} /> : left}
      <Text numberOfLines={1} style={{ flex: 1, color: C.fg, fontSize: 18, fontWeight: '700', textAlign: center ? 'center' : 'left', fontFamily: font }}>
        {title}
      </Text>
      {right ?? <View style={{ width: 40 }} />}
    </View>
  );
}

/**
 * Settings-style header: a round back button, the title in the middle, and room for one round button
 * on the right. `close` shows an X instead of the arrow, for screens that slide up from the bottom.
 */
export function ScreenHeader({ title, right, onBack, noBack, close }: { title: string; right?: React.ReactNode; onBack?: () => void; noBack?: boolean; close?: boolean }) {
  const router = useRouter();
  const font = useAppFont('bold');
  const back = onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')));
  return (
    <View style={{ height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 }}>
      {/* Both sides take the same room, so the title stays centred; neither squeezes a word like "Done" onto two lines. */}
      <View style={{ minWidth: 64, flexShrink: 0 }}>{noBack ? null : <RoundButton name={close ? 'close' : 'back'} label={t(close ? 'common.close' : 'common.back')} onPress={back} />}</View>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.78} accessibilityRole="header" style={{ flex: 1, color: C.fg, fontSize: 20.5, fontWeight: '700', textAlign: 'center', paddingHorizontal: 8, fontFamily: font }}>
        {title}
      </Text>
      <View style={{ minWidth: 64, flexShrink: 0, alignItems: 'flex-end' }}>{right}</View>
    </View>
  );
}

export function Screen({ children, edges = true, style }: { children: React.ReactNode; edges?: boolean; style?: ViewStyle }) {
  const insets = useSafeAreaInsets();
  return <View style={[{ flex: 1, backgroundColor: C.bg, paddingTop: edges ? insets.top : 0 }, style]}>{children}</View>;
}

/** One line in a settings list. `badge` shows a red count (things waiting), read out with the title. */
export function Row({ icon, title, sub, value, onPress, right, color, chevron = true, bold, badge }: { icon?: IconName; title: string; sub?: string; value?: string; onPress?: () => void; right?: React.ReactNode; color?: string; chevron?: boolean; bold?: boolean; badge?: number }) {
  const font = useAppFont();
  const fontBold = useAppFont('bold');
  const press = useOneTap(onPress);
  const count = badge && badge > 0 ? (badge > 99 ? '99+' : String(badge)) : '';
  const body = (
    <>
      {icon ? <Icon name={icon} size={26} color={color ?? C.fg} /> : null}
      <View style={{ flex: 1, paddingVertical: sub ? 9 : 0 }}>
        <Text style={{ color: color ?? C.fg, fontSize: 17.5, fontWeight: bold ? '700' : '400', fontFamily: bold ? fontBold : font }}>{title}</Text>
        {sub ? <Text style={{ color: C.fg2, fontSize: 15, lineHeight: 20, marginTop: 1, fontFamily: font }}>{sub}</Text> : null}
      </View>
      {value ? <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 16.5, fontFamily: font, flexShrink: 1, maxWidth: '50%' }}>{value}</Text> : null}
      {count ? (
        <View style={{ minWidth: 22, height: 22, paddingHorizontal: 7, borderRadius: 11, backgroundColor: C.like, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#ffffff', fontSize: 12.5, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{count}</Text>
        </View>
      ) : null}
      {right}
      {onPress && chevron ? <Icon name="right" size={18} color={C.fg2} weight={2} /> : null}
    </>
  );
  const style = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 14, paddingHorizontal: 16, minHeight: 48 };
  const spoken = [title, value, count].filter(Boolean).join(', ');
  if (!onPress) return <View style={style} accessible={!!count} accessibilityLabel={count ? spoken : undefined}>{body}</View>;
  return (
    <Pressable onPress={press} accessibilityRole="button" accessibilityLabel={spoken} style={({ pressed }) => [style, { backgroundColor: pressed ? C.press : 'transparent' }]}>
      {body}
    </Pressable>
  );
}

export function SectionLabel({ children, right, strong }: { children: string; right?: React.ReactNode; strong?: boolean }) {
  const font = useAppFont('bold');
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: strong ? 20 : 22, paddingBottom: strong ? 12 : 10 }}>
      <Text accessibilityRole="header" style={strong ? { color: C.fg, fontSize: 20, fontWeight: '700', fontFamily: font } : { color: C.fg2, fontSize: 15.5, fontWeight: '700', fontFamily: font }}>
        {children}
      </Text>
      {right}
    </View>
  );
}

/** The band between sections in a settings list, or a hairline when thin. */
export function Divider({ thin }: { thin?: boolean }) {
  return <View style={{ height: thin ? StyleSheet.hairlineWidth : 5, backgroundColor: thin ? C.line : C.field, marginTop: thin ? 8 : 6 }} />;
}

export function Empty({ title, body, icon, action }: { title: string; body?: string; icon?: IconName; action?: React.ReactNode }) {
  const font = useAppFont();
  const fontBold = useAppFont('bold');
  return (
    <View style={{ padding: 36, alignItems: 'center', gap: 8 }}>
      {icon ? <Icon name={icon} size={44} color={C.fg2} /> : null}
      <Text style={{ color: C.fg, fontSize: 17, fontWeight: '700', textAlign: 'center', fontFamily: fontBold }}>{title}</Text>
      {body ? <Text style={{ color: C.fg2, textAlign: 'center', lineHeight: 20, fontFamily: font }}>{body}</Text> : null}
      {action}
    </View>
  );
}

export function Loading() {
  return (
    <View style={{ padding: 40, alignItems: 'center' }}>
      <ActivityIndicator color={C.fg2} />
    </View>
  );
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={{ padding: 28, alignItems: 'center', gap: 12 }}>
      <Text style={{ color: C.fg, fontSize: 16, fontWeight: '700', textAlign: 'center' }}>{t('common.didNotLoad')}</Text>
      <Text style={{ color: C.fg2, textAlign: 'center', lineHeight: 20 }}>{message}</Text>
      {onRetry ? <Button label={t('common.tryAgain')} kind="ghost" small onPress={onRetry} /> : null}
    </View>
  );
}

/* ---------- bottom sheet ---------- */

/**
 * A panel that slides up from the bottom over a dimmed screen, as on Instagram: the dim fades in while
 * the panel rises, and the panel can be dragged down by its top to close. While it slides away it
 * keeps showing what it showed, rather than going blank as the screen behind tidies up.
 *
 * Closing takes the same time as before (the dim fades out over about a third of a second), so
 * anything that waits for a sheet to go before showing an alert (afterSheet) still works.
 */
export function Sheet({ visible, onClose, title, children, tall, footer }: { visible: boolean; onClose: () => void; title?: string; children: React.ReactNode; tall?: boolean; footer?: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();
  // 1 = below the screen, 0 = in place. The drag is how far a finger has pulled it down.
  const slide = useRef(new Animated.Value(1)).current;
  const drag = useRef(new Animated.Value(0)).current;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const kept = useRef({ title, children, footer });
  if (visible) kept.current = { title, children, footer };
  const shown = visible ? { title, children, footer } : kept.current;
  const slot = useSheetSlot(visible);

  useEffect(() => {
    if (visible) {
      drag.setValue(0);
      if (reduceMotionNow() === true) {
        slide.setValue(0);
        return;
      }
      Animated.timing(slide, { toValue: 0, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    } else {
      Animated.timing(slide, { toValue: 1, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start();
    }
  }, [visible, slide, drag]);

  const pan = useRef(
    PanResponder.create({
      // The Modal takes every touch no view inside claims as it starts, and a touch taken can't move to
      // a view inside it, so a drag asked for only once moving would never reach the handle.
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_, g) => drag.setValue(Math.max(0, g.dy)),
      onPanResponderRelease: (_, g) => {
        const back = () => Animated.spring(drag, { toValue: 0, useNativeDriver: true, bounciness: 4, speed: 18 }).start();
        if (g.dy > 110 || (g.vy > 0.8 && g.dy > 24)) {
          closeRef.current();
          // A sheet that can't close just now (something is saving) settles back into place.
          setTimeout(() => { if (visibleRef.current) back(); }, 80);
        } else {
          back();
        }
      },
      onPanResponderTerminate: () => Animated.spring(drag, { toValue: 0, useNativeDriver: true, bounciness: 4, speed: 18 }).start(),
    }),
  ).current;

  const translateY = React.useMemo(() => Animated.add(slide.interpolate({ inputRange: [0, 1], outputRange: [0, screenH] }), drag), [slide, drag, screenH]);
  const dim = React.useMemo(() => drag.interpolate({ inputRange: [0, 320], outputRange: [1, 0.35], extrapolate: 'clamp' }), [drag]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={{ flex: 1, justifyContent: 'flex-end' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} pointerEvents={visible ? 'auto' : 'none'}>
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: dim }]}>
          <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: C.scrim }]} onPress={onClose} accessibilityLabel={t('common.close')} />
        </Animated.View>
        <Animated.View style={{ backgroundColor: C.sheet, borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingBottom: insets.bottom + 12, maxHeight: '88%', height: tall ? '78%' : undefined, transform: [{ translateY }] }}>
          {/* The top of the panel is its handle: drag it down to close. */}
          <View {...pan.panHandlers}>
            <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: shown.title ? 0 : 10 }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: C.fg3 }} />
            </View>
            {shown.title ? (
              <Text accessibilityRole="header" numberOfLines={2} style={{ color: C.fg, fontSize: 20, fontWeight: '700', textAlign: 'center', paddingTop: 20, paddingBottom: 20, paddingHorizontal: 24 }}>
                {shown.title}
              </Text>
            ) : null}
          </View>
          {shown.children}
          {shown.footer}
        </Animated.View>
        {/* A message shown while the sheet is open appears over it, not hidden behind it. */}
        <ToastOutlet sheet={slot} />
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function SheetRow({ icon, label, sub, onPress, danger, right, first }: { icon: IconName; label: string; sub?: string; onPress: () => void; danger?: boolean; right?: React.ReactNode; first?: boolean }) {
  const color = danger ? C.like : C.fg;
  const font = useAppFont();
  const press = useOneTap(() => { tap('light'); onPress(); });
  return (
    <Pressable onPress={press} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingLeft: 16, minHeight: 48, backgroundColor: pressed ? C.press : 'transparent' })}>
      <Icon name={icon} size={26} color={color} />
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingRight: 16, borderTopWidth: first ? 0 : StyleSheet.hairlineWidth, borderTopColor: C.line }}>
        <View style={{ flex: 1, paddingVertical: sub ? 8 : 0 }}>
          <Text style={{ color, fontSize: 18, fontFamily: font }}>{label}</Text>
          {sub ? <Text style={{ color: C.fg2, fontSize: 13.5, marginTop: 1, fontFamily: font }}>{sub}</Text> : null}
        </View>
        {right}
      </View>
    </Pressable>
  );
}

/* ---------- a question with several answers ---------- */

/** One answer offered by useChoices. */
export type Choice = { label: string; onPress: () => void };

/**
 * A question with several answers, such as why something is being reported. On iPhone it is the
 * system alert, as before. Android's alert shows no more than three buttons and quietly drops the
 * rest, so there the answers are rows in a bottom sheet instead, as the story viewer's reasons are,
 * with Cancel last. Render `element` in the screen, then call `ask`.
 */
export function useChoices() {
  const [asked, setAsked] = useState<{ title: string; message?: string; icon: IconName; choices: Choice[] } | null>(null);
  const [visible, setVisible] = useState(false);
  const ask = useCallback((q: { title: string; message?: string; icon: IconName; choices: Choice[] }) => {
    if (Platform.OS !== 'android') {
      Alert.alert(q.title, q.message, [...q.choices.map((c) => ({ text: c.label, onPress: c.onPress })), { text: t('common.cancel'), style: 'cancel' as const }]);
      return;
    }
    setAsked(q);
    setVisible(true);
  }, []);
  // The rows stay in place while the sheet slides away, so it doesn't empty as it goes.
  const close = useCallback(() => setVisible(false), []);
  const element = (
    <Sheet visible={visible} onClose={close} title={asked?.title}>
      {asked?.message ? <Text style={{ color: C.fg2, fontSize: 15, textAlign: 'center', paddingHorizontal: 24, marginTop: -10, paddingBottom: 14 }}>{asked.message}</Text> : null}
      {asked?.choices.map((c, i) => (
        <SheetRow
          key={`${i}:${c.label}`}
          first={i === 0}
          icon={asked.icon}
          label={c.label}
          onPress={() => {
            close();
            c.onPress();
          }}
        />
      ))}
      <SheetRow icon="close" label={t('common.cancel')} onPress={close} />
    </Sheet>
  );
  return { ask, element };
}

/* ---------- toast ---------- */

/*
 * One short message at a time, at the bottom of the screen. Messages are kept here rather than in
 * one screen's state, so the open sheet (a separate window on iPhone, drawn over everything) can show
 * them too: before, a message shown while a sheet was open was hidden underneath it.
 */
type ToastNow = { id: number; msg: string };
let toastNow: ToastNow = { id: 0, msg: '' };
/** Sheets open now, newest last: the newest shows the messages. */
let sheetsOpen: readonly number[] = [];
let nextSheet = 1;
const toastListeners = new Set<() => void>();
const subscribeToast = (l: () => void) => {
  toastListeners.add(l);
  return () => {
    toastListeners.delete(l);
  };
};
const emitToast = () => toastListeners.forEach((l) => l());
const toastSnapshot = () => toastNow;
const sheetsSnapshot = () => sheetsOpen;

function showToast(msg: string) {
  toastNow = { id: toastNow.id + 1, msg };
  emitToast();
}

/** Counts a sheet as open while it is visible, so messages go to it. */
function useSheetSlot(open: boolean): number {
  const id = useRef(0);
  if (!id.current) id.current = nextSheet++;
  useEffect(() => {
    if (!open) return;
    const mine = id.current;
    sheetsOpen = [...sheetsOpen, mine];
    emitToast();
    return () => {
      sheetsOpen = sheetsOpen.filter((x) => x !== mine);
      emitToast();
    };
  }, [open]);
  return id.current;
}

const ToastCtx = createContext<(msg: string) => void>(showToast);
export const useToast = () => useContext(ToastCtx);

/** Where messages appear: on the screen (no `sheet`), or over the open sheet with this number. */
function ToastOutlet({ sheet }: { sheet?: number }) {
  const now = useSyncExternalStore(subscribeToast, toastSnapshot);
  const open = useSyncExternalStore(subscribeToast, sheetsSnapshot);
  const insets = useSafeAreaInsets();
  const fade = useRef(new Animated.Value(0)).current;
  const lift = useRef(new Animated.Value(8)).current;
  const [msg, setMsg] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Only messages from now on: a sheet opening doesn't replay the last one.
  const seen = useRef(now.id);
  // The keyboard is drawn over the app, so a message has to sit above it to be seen.
  const [keyboard, setKeyboard] = useState(0);
  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const up = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', (e) => setKeyboard(e.endCoordinates.height));
    const down = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboard(0));
    return () => {
      up.remove();
      down.remove();
    };
  }, []);
  useEffect(() => {
    if (now.id === seen.current) return;
    seen.current = now.id;
    setMsg(now.msg);
    if (timer.current) clearTimeout(timer.current);
    lift.setValue(8);
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 160, useNativeDriver: true }),
      Animated.timing(lift, { toValue: 0, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
    timer.current = setTimeout(() => {
      Animated.timing(fade, { toValue: 0, duration: 200, useNativeDriver: true }).start(({ finished }) => {
        if (finished) setMsg('');
      });
    }, 2300);
  }, [now, fade, lift]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const mine = sheet === undefined ? open.length === 0 : open[open.length - 1] === sheet;
  if (!msg || !mine) return null;
  return (
    <Animated.View pointerEvents="none" accessibilityLiveRegion="polite" style={{ position: 'absolute', left: 24, right: 24, bottom: keyboard ? keyboard + 16 : insets.bottom + 96, alignItems: 'center', opacity: fade, transform: [{ translateY: lift }] }}>
      {/* The opposite of the page: light on dark themes, dark on White. */}
      <View style={{ backgroundColor: C.fg, paddingHorizontal: 18, paddingVertical: 11, borderRadius: 14, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } }}>
        <Text style={{ color: C.bg, fontWeight: '600', textAlign: 'center' }}>{msg}</Text>
      </View>
    </Animated.View>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  return (
    <ToastCtx.Provider value={showToast}>
      {children}
      <ToastOutlet />
    </ToastCtx.Provider>
  );
}
