import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { MediaStream } from 'react-native-webrtc';
import { RTCView } from 'react-native-webrtc';
import { C, clock } from '../lib/theme';
import { Icon, IconName, VerifiedTick } from './Icon';
import { Avatar } from './ui';

/** The other person, as much of them as the call screen needs. */
export type Person = { id: string; username: string; full_name: string; avatar_url: string; verified?: boolean };

export type CallPhase = 'incoming' | 'calling' | 'connecting' | 'connected' | 'ended';

/** Everything the screen draws. The provider owns it and changes it as the call goes along. */
export type CallView = {
  kind: 'voice' | 'video';
  role: 'caller' | 'callee';
  phase: CallPhase;
  /** The line under the name: "Ringing…", "No answer", "Call ended". Empty while connected, where the timer goes. */
  note: string;
  other: Person | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  muted: boolean;
  cameraOff: boolean;
  speaker: boolean;
  front: boolean;
  /** When the link came up, for the timer. */
  connectedAt: number | null;
};

export type CallActions = {
  accept: () => void;
  decline: () => void;
  hangUp: () => void;
  toggleMute: () => void;
  toggleCamera: () => void;
  flip: () => void;
  toggleSpeaker: () => void;
};

const RED = '#ff3b30';

/** A round call button. `on` draws it white with a dark icon, the way a toggled control looks in a call. */
function Round({ name, label, onPress, size = 60, bg = 'rgba(255,255,255,0.18)', color = '#fff', on, caption }: { name: IconName; label: string; onPress?: () => void; size?: number; bg?: string; color?: string; on?: boolean; caption?: string }) {
  return (
    <View style={{ alignItems: 'center', gap: 8 }}>
      <Pressable
        onPress={onPress}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={on === undefined ? undefined : { selected: on }}
        style={({ pressed }) => ({ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? '#fff' : bg, opacity: pressed ? 0.7 : 1, transform: [{ scale: pressed ? 0.94 : 1 }] })}>
        <Icon name={name} size={size * 0.46} color={on ? '#0b1014' : color} weight={2} />
      </Pressable>
      {caption ? <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>{caption}</Text> : null}
    </View>
  );
}

/** Two rings that swell out from behind the avatar while a call is ringing. */
function Pulse({ size }: { size: number }) {
  const a = useRef(new Animated.Value(0)).current;
  const b = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = (v: Animated.Value, delay: number) =>
      Animated.loop(Animated.sequence([Animated.delay(delay), Animated.timing(v, { toValue: 1, duration: 1800, easing: Easing.out(Easing.quad), useNativeDriver: true }), Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: true })]));
    const l1 = loop(a, 0);
    const l2 = loop(b, 900);
    l1.start();
    l2.start();
    return () => {
      l1.stop();
      l2.stop();
    };
  }, [a, b]);
  const ring = (v: Animated.Value) => (
    <Animated.View pointerEvents="none" style={{ position: 'absolute', width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: '#fff', opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }), transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.6] }) }] }} />
  );
  return (
    <>
      {ring(a)}
      {ring(b)}
    </>
  );
}

/** Seconds since the link came up, as "1:05". */
function Timer({ since }: { since: number }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return <Text style={styles.sub}>{clock((Date.now() - since) / 1000)}</Text>;
}

export function CallScreen({ view, actions }: { view: CallView; actions: CallActions }) {
  const insets = useSafeAreaInsets();
  const { other, kind, phase } = view;
  const name = other?.full_name || other?.username || 'Unknown';
  const ringing = phase === 'incoming' || phase === 'calling';
  const live = phase === 'connecting' || phase === 'connected';
  const remoteVideo = kind === 'video' && !!view.remoteStream && phase === 'connected';
  const localVideo = kind === 'video' && !!view.localStream && !view.cameraOff;
  // Before the other side's picture arrives, a video call shows your own camera full screen, as Instagram does.
  const fullLocal = localVideo && !remoteVideo && phase !== 'incoming';

  // A note ("Ringing…", "Reconnecting…") takes the line; otherwise a connected call shows its timer.
  const status = phase === 'incoming' ? `Incoming ${kind} call` : view.note || null;

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {/* Background: the other side's video, else your own, else their picture blurred. */}
      {remoteVideo && view.remoteStream ? (
        <RTCView streamURL={view.remoteStream.toURL()} objectFit="cover" style={StyleSheet.absoluteFill} />
      ) : fullLocal && view.localStream ? (
        <RTCView streamURL={view.localStream.toURL()} objectFit="cover" mirror={view.front} style={StyleSheet.absoluteFill} />
      ) : (
        <>
          {other?.avatar_url ? <Image source={{ uri: other.avatar_url }} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={30} /> : <View style={[StyleSheet.absoluteFill, { backgroundColor: C.bg2 }]} />}
          <BlurView intensity={55} tint="dark" style={StyleSheet.absoluteFill} />
        </>
      )}
      <LinearGradient colors={['rgba(0,0,0,0.55)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.6)']} locations={[0, 0.3, 0.6, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />

      {/* Name and status at the top. */}
      <View style={{ position: 'absolute', top: insets.top + 18, left: 24, right: 24, alignItems: remoteVideo ? 'flex-start' : 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text numberOfLines={1} accessibilityRole="header" style={[styles.name, remoteVideo && { fontSize: 20 }]}>
            {name}
          </Text>
          {other?.verified ? <VerifiedTick size={remoteVideo ? 15 : 18} /> : null}
        </View>
        {status ? <Text style={styles.sub}>{status}</Text> : phase === 'connected' && view.connectedAt ? <Timer since={view.connectedAt} /> : null}
      </View>

      {/* The person, large, while there is no video to look at. */}
      {!remoteVideo && !fullLocal ? (
        <View pointerEvents="none" style={{ ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 132, height: 132, alignItems: 'center', justifyContent: 'center' }}>
            {ringing ? <Pulse size={132} /> : null}
            <Avatar uri={other?.avatar_url} name={name} size={132} />
          </View>
        </View>
      ) : null}

      {/* Your own picture, small, once theirs fills the screen. */}
      {remoteVideo && view.localStream ? (
        <View style={{ position: 'absolute', top: insets.top + 64, right: 16, width: 108, height: 160, borderRadius: 16, overflow: 'hidden', backgroundColor: C.surface, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' }} accessibilityLabel="Your camera">
          {localVideo ? <RTCView streamURL={view.localStream.toURL()} objectFit="cover" mirror={view.front} style={{ flex: 1 }} /> : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Icon name="videooff" size={26} color={C.fg2} /></View>}
        </View>
      ) : null}

      {/* Buttons. */}
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: insets.bottom + 28 }}>
        {phase === 'incoming' ? (
          <View style={{ flexDirection: 'row', justifyContent: 'space-evenly', paddingHorizontal: 24 }}>
            <Round name="endcall" label="Decline" caption="Decline" size={74} bg={RED} onPress={actions.decline} />
            <Round name="phone" label="Accept" caption="Accept" size={74} bg={C.accent} onPress={actions.accept} />
          </View>
        ) : phase === 'ended' ? (
          <View style={{ alignItems: 'center' }}>
            <Round name="close" label="Close" size={64} bg="rgba(255,255,255,0.22)" onPress={actions.hangUp} />
          </View>
        ) : (
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16, paddingHorizontal: 16 }}>
            <Round name={view.muted ? 'micoff' : 'mic'} label={view.muted ? 'Unmute' : 'Mute'} on={view.muted} onPress={actions.toggleMute} />
            {kind === 'video' ? <Round name={view.cameraOff ? 'videooff' : 'video'} label={view.cameraOff ? 'Turn camera on' : 'Turn camera off'} on={view.cameraOff} onPress={actions.toggleCamera} /> : null}
            {kind === 'video' ? <Round name="flip" label="Flip camera" onPress={actions.flip} /> : null}
            <Round name="speaker" label={view.speaker ? 'Speaker off' : 'Speaker on'} on={view.speaker} onPress={actions.toggleSpeaker} />
            <Round name="endcall" label={live ? 'End call' : 'Cancel call'} bg={RED} onPress={actions.hangUp} />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  name: { color: '#fff', fontSize: 28, fontWeight: '800', textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 8, flexShrink: 1 },
  sub: { color: 'rgba(255,255,255,0.85)', fontSize: 16, marginTop: 4, textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 6 },
});
