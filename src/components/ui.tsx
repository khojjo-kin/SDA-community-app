import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Modal, Pressable, StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, RING } from '../lib/theme';
import { Icon, IconName } from './Icon';

/* ---------- avatar ---------- */

export function Avatar({ uri, name, size = 36, ring }: { uri?: string | null; name?: string; size?: number; ring?: 'new' | 'seen' | null }) {
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
  return (
    <LinearGradient colors={[RING[0], RING[1], RING[2]]} start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }} style={{ padding: pad, borderRadius: size }}>
      {body}
    </LinearGradient>
  );
}

/* ---------- buttons and fields ---------- */

export function Button({ label, onPress, kind = 'primary', small, busy, disabled, style }: { label: string; onPress?: () => void; kind?: 'primary' | 'ghost' | 'danger'; small?: boolean; busy?: boolean; disabled?: boolean; style?: ViewStyle }) {
  const bg = kind === 'primary' ? C.accent : kind === 'danger' ? C.like : C.surface2;
  return (
    <Pressable
      onPress={busy || disabled ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [{ height: small ? 32 : 46, paddingHorizontal: small ? 14 : 18, borderRadius: small ? 10 : 12, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.45 : pressed ? 0.75 : 1 }, style]}>
      {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '600', fontSize: small ? 13.5 : 15.5 }}>{label}</Text>}
    </Pressable>
  );
}

export function Field({ label, error, style, ...rest }: TextInputProps & { label?: string; error?: string }) {
  return (
    <View style={{ gap: 6 }}>
      {label ? <Text style={{ color: C.fg2, fontSize: 12.5 }}>{label}</Text> : null}
      <TextInput placeholderTextColor={C.fg3} selectionColor={C.accent2} keyboardAppearance="dark" {...rest} style={[{ color: C.fg, fontSize: 16, paddingHorizontal: 14, paddingVertical: 13, borderRadius: 12, backgroundColor: C.surface }, style]} />
      {error ? <Text style={{ color: C.like, fontSize: 13 }}>{error}</Text> : null}
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

/* ---------- page furniture ---------- */

export function Header({ title, left, right, center }: { title?: string; left?: React.ReactNode; right?: React.ReactNode; center?: boolean }) {
  const router = useRouter();
  return (
    <View style={{ height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, gap: 6 }}>
      {left === undefined ? <IconButton name="back" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} /> : left}
      <Text numberOfLines={1} style={{ flex: 1, color: C.fg, fontSize: 18, fontWeight: '700', textAlign: center ? 'center' : 'left' }}>
        {title}
      </Text>
      {right ?? <View style={{ width: 40 }} />}
    </View>
  );
}

export function Screen({ children, edges = true, style }: { children: React.ReactNode; edges?: boolean; style?: ViewStyle }) {
  const insets = useSafeAreaInsets();
  return <View style={[{ flex: 1, backgroundColor: C.bg, paddingTop: edges ? insets.top : 0 }, style]}>{children}</View>;
}

export function Empty({ title, body, icon, action }: { title: string; body?: string; icon?: IconName; action?: React.ReactNode }) {
  return (
    <View style={{ padding: 36, alignItems: 'center', gap: 8 }}>
      {icon ? <Icon name={icon} size={44} color={C.fg2} /> : null}
      <Text style={{ color: C.fg, fontSize: 17, fontWeight: '700', textAlign: 'center' }}>{title}</Text>
      {body ? <Text style={{ color: C.fg2, textAlign: 'center', lineHeight: 20 }}>{body}</Text> : null}
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

export function Sheet({ visible, onClose, title, children, tall }: { visible: boolean; onClose: () => void; title?: string; children: React.ReactNode; tall?: boolean }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <View style={{ backgroundColor: C.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingBottom: insets.bottom + 10, maxHeight: '88%', height: tall ? '78%' : undefined }}>
          <View style={{ alignItems: 'center', paddingVertical: 9 }}>
            <View style={{ width: 38, height: 4, borderRadius: 2, backgroundColor: C.fg3 }} />
          </View>
          {title ? <Text style={{ color: C.fg, fontWeight: '700', textAlign: 'center', paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line }}>{title}</Text> : null}
          {children}
        </View>
      </View>
    </Modal>
  );
}

export function SheetRow({ icon, label, sub, onPress, danger }: { icon: IconName; label: string; sub?: string; onPress: () => void; danger?: boolean }) {
  const color = danger ? C.like : C.fg;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 18, minHeight: 54, backgroundColor: pressed ? 'rgba(255,255,255,0.05)' : 'transparent' })}>
      <Icon name={icon} color={color} />
      <View style={{ flex: 1 }}>
        <Text style={{ color, fontSize: 16 }}>{label}</Text>
        {sub ? <Text style={{ color: C.fg2, fontSize: 13 }}>{sub}</Text> : null}
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
  const show = useCallback(
    (m: string) => {
      setMsg(m);
      if (timer.current) clearTimeout(timer.current);
      Animated.timing(fade, { toValue: 1, duration: 160, useNativeDriver: true }).start();
      timer.current = setTimeout(() => {
        Animated.timing(fade, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setMsg(''));
      }, 2300);
    },
    [fade],
  );
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg ? (
        <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 24, right: 24, bottom: insets.bottom + 96, alignItems: 'center', opacity: fade }}>
          <View style={{ backgroundColor: '#f3f5f7', paddingHorizontal: 18, paddingVertical: 11, borderRadius: 14 }}>
            <Text style={{ color: '#0b1014', fontWeight: '600', textAlign: 'center' }}>{msg}</Text>
          </View>
        </Animated.View>
      ) : null}
    </ToastCtx.Provider>
  );
}
