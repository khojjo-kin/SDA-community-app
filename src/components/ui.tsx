import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppFont } from '../lib/fonts';
import { C, CLOSE_RING, RING } from '../lib/theme';
import { Icon, IconName } from './Icon';

/* ---------- avatar ---------- */

/** `ringColors` replaces the green of a 'new' ring: a Plus member's chosen colour (src/lib/styling.ts). */
export function Avatar({ uri, name, size = 36, ring, ringColors }: { uri?: string | null; name?: string; size?: number; ring?: 'new' | 'seen' | 'close' | null; ringColors?: readonly string[] }) {
  const inner = uri ? (
    <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: C.surface2 }} contentFit="cover" transition={120} />
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
  return (
    <Pressable
      onPress={busy || disabled ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, busy: !!busy }}
      style={({ pressed }) => [{ height: small ? 32 : 46, paddingHorizontal: small ? 14 : 18, borderRadius: small ? 10 : 12, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.45 : pressed ? 0.75 : 1 }, style]}>
      {busy ? <ActivityIndicator color={fg} /> : <Text style={{ color: fg, fontWeight: '600', fontSize: small ? 13.5 : 15.5, fontFamily: font }}>{label}</Text>}
    </Pressable>
  );
}

export function Field({ label, error, style, ...rest }: TextInputProps & { label?: string; error?: string }) {
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
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1, backgroundColor: bg })}>
      <Icon name={name} size={size} color={color} fill={fill} />
      {badge ? <View style={{ position: 'absolute', top: 6, right: 6, width: 10, height: 10, borderRadius: 5, backgroundColor: C.like, borderWidth: 2, borderColor: C.bg }} /> : null}
    </Pressable>
  );
}

/** The round button used in screen headers. */
export function RoundButton({ name, onPress, label, size = 44, bg = C.round, color = C.fg, iconSize = 24 }: { name: IconName; onPress?: () => void; label: string; size?: number; bg?: string; color?: string; iconSize?: number }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: bg, borderWidth: StyleSheet.hairlineWidth, borderColor: C.hairline, opacity: pressed ? 0.65 : 1 })}>
      <Icon name={name} size={iconSize} color={color} />
    </Pressable>
  );
}

export function SearchField({ value, onChangeText, placeholder = 'Search', autoFocus, label }: { value: string; onChangeText: (t: string) => void; placeholder?: string; autoFocus?: boolean; label?: string }) {
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
    <Pressable onPress={disabled ? undefined : () => onChange(!value)} hitSlop={8} accessibilityRole="switch" accessibilityLabel={label} accessibilityState={{ checked: value, disabled: !!disabled }} style={{ width: 62, height: 28, borderRadius: 14, backgroundColor: value ? C.accent : C.surface2, justifyContent: 'center', opacity: disabled ? 0.5 : 1 }}>
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

export function NewPill({ label = 'New' }: { label?: string }) {
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
      {left === undefined ? <IconButton name="back" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} /> : left}
      <Text numberOfLines={1} style={{ flex: 1, color: C.fg, fontSize: 18, fontWeight: '700', textAlign: center ? 'center' : 'left', fontFamily: font }}>
        {title}
      </Text>
      {right ?? <View style={{ width: 40 }} />}
    </View>
  );
}

/** Settings-style header: a round back button, the title in the middle, and room for one round button on the right. */
export function ScreenHeader({ title, right, onBack, noBack }: { title: string; right?: React.ReactNode; onBack?: () => void; noBack?: boolean }) {
  const router = useRouter();
  const font = useAppFont('bold');
  const back = onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')));
  return (
    <View style={{ height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 }}>
      <View style={{ width: 44 }}>{noBack ? null : <RoundButton name="back" label="Back" onPress={back} />}</View>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.78} accessibilityRole="header" style={{ flex: 1, color: C.fg, fontSize: 20.5, fontWeight: '700', textAlign: 'center', paddingHorizontal: 8, fontFamily: font }}>
        {title}
      </Text>
      <View style={{ width: 44, alignItems: 'flex-end' }}>{right}</View>
    </View>
  );
}

export function Screen({ children, edges = true, style }: { children: React.ReactNode; edges?: boolean; style?: ViewStyle }) {
  const insets = useSafeAreaInsets();
  return <View style={[{ flex: 1, backgroundColor: C.bg, paddingTop: edges ? insets.top : 0 }, style]}>{children}</View>;
}

/** One line in a settings list. */
export function Row({ icon, title, sub, value, onPress, right, color, chevron = true, bold }: { icon?: IconName; title: string; sub?: string; value?: string; onPress?: () => void; right?: React.ReactNode; color?: string; chevron?: boolean; bold?: boolean }) {
  const font = useAppFont();
  const fontBold = useAppFont('bold');
  const body = (
    <>
      {icon ? <Icon name={icon} size={26} color={color ?? C.fg} /> : null}
      <View style={{ flex: 1, paddingVertical: sub ? 9 : 0 }}>
        <Text style={{ color: color ?? C.fg, fontSize: 17.5, fontWeight: bold ? '700' : '400', fontFamily: bold ? fontBold : font }}>{title}</Text>
        {sub ? <Text style={{ color: C.fg2, fontSize: 15, lineHeight: 20, marginTop: 1, fontFamily: font }}>{sub}</Text> : null}
      </View>
      {value ? <Text style={{ color: C.fg2, fontSize: 16.5, fontFamily: font }}>{value}</Text> : null}
      {right}
      {onPress && chevron ? <Icon name="right" size={18} color={C.fg2} weight={2} /> : null}
    </>
  );
  const style = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 14, paddingHorizontal: 16, minHeight: 48 };
  if (!onPress) return <View style={style}>{body}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={value ? `${title}, ${value}` : title} style={({ pressed }) => [style, { backgroundColor: pressed ? C.press : 'transparent' }]}>
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
      <Text style={{ color: C.fg, fontSize: 16, fontWeight: '700', textAlign: 'center' }}>This didn't load</Text>
      <Text style={{ color: C.fg2, textAlign: 'center', lineHeight: 20 }}>{message}</Text>
      {onRetry ? <Button label="Try again" kind="ghost" small onPress={onRetry} /> : null}
    </View>
  );
}

/* ---------- bottom sheet ---------- */

export function Sheet({ visible, onClose, title, children, tall, footer }: { visible: boolean; onClose: () => void; title?: string; children: React.ReactNode; tall?: boolean; footer?: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={{ flex: 1, justifyContent: 'flex-end' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: C.scrim }]} onPress={onClose} accessibilityLabel="Close" />
        <View style={{ backgroundColor: C.sheet, borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingBottom: insets.bottom + 12, maxHeight: '88%', height: tall ? '78%' : undefined }}>
          <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: title ? 0 : 10 }}>
            <View style={{ width: 34, height: 3, borderRadius: 2, backgroundColor: C.fg2 }} />
          </View>
          {title ? (
            <Text accessibilityRole="header" style={{ color: C.fg, fontSize: 20, fontWeight: '700', textAlign: 'center', paddingTop: 22, paddingBottom: 22 }}>
              {title}
            </Text>
          ) : null}
          {children}
          {footer}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function SheetRow({ icon, label, sub, onPress, danger, right, first }: { icon: IconName; label: string; sub?: string; onPress: () => void; danger?: boolean; right?: React.ReactNode; first?: boolean }) {
  const color = danger ? C.like : C.fg;
  const font = useAppFont();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingLeft: 16, minHeight: 46, backgroundColor: pressed ? C.press : 'transparent' })}>
      <Icon name={icon} size={26} color={color} />
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 46, paddingRight: 16, borderTopWidth: first ? 0 : StyleSheet.hairlineWidth, borderTopColor: C.line }}>
        <View style={{ flex: 1, paddingVertical: sub ? 8 : 0 }}>
          <Text style={{ color, fontSize: 18, fontFamily: font }}>{label}</Text>
          {sub ? <Text style={{ color: C.fg2, fontSize: 13.5, marginTop: 1, fontFamily: font }}>{sub}</Text> : null}
        </View>
        {right}
      </View>
    </Pressable>
  );
}

/* ---------- toast ---------- */

const ToastCtx = createContext<(msg: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [msg, setMsg] = useState('');
  const fade = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();
  // The keyboard is drawn over the app, so a message has to sit above it to be seen.
  const [keyboard, setKeyboard] = useState(0);
  useEffect(() => {
    const up = Keyboard.addListener('keyboardWillShow', (e) => setKeyboard(e.endCoordinates.height));
    const down = Keyboard.addListener('keyboardWillHide', () => setKeyboard(0));
    return () => {
      up.remove();
      down.remove();
    };
  }, []);
  const show = useCallback(
    (m: string) => {
      setMsg(m);
      if (timer.current) clearTimeout(timer.current);
      Animated.timing(fade, { toValue: 1, duration: 160, useNativeDriver: true }).start();
      timer.current = setTimeout(() => {
        Animated.timing(fade, { toValue: 0, duration: 200, useNativeDriver: true }).start(({ finished }) => {
          if (finished) setMsg('');
        });
      }, 2300);
    },
    [fade],
  );
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg ? (
        <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 24, right: 24, bottom: keyboard ? keyboard + 16 : insets.bottom + 96, alignItems: 'center', opacity: fade }}>
          {/* The opposite of the page: light on dark themes, dark on White. */}
          <View style={{ backgroundColor: C.fg, paddingHorizontal: 18, paddingVertical: 11, borderRadius: 14 }}>
            <Text style={{ color: C.bg, fontWeight: '600', textAlign: 'center' }}>{msg}</Text>
          </View>
        </Animated.View>
      ) : null}
    </ToastCtx.Provider>
  );
}
