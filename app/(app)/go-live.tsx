import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { MediaStream } from 'react-native-webrtc';
import { RTCView } from 'react-native-webrtc';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { Icon } from '../../src/components/Icon';
import { LIVE_RED } from '../../src/components/LiveBadge';
import { ChatLines, Hearts, LiveComposer, LiveHeader, useChatLines, useHearts } from '../../src/components/LiveOverlay';
import { DarkStatusBar } from '../../src/components/OnDark';
import { Button, RoundButton, useToast } from '../../src/components/ui';
import { endLive, fetchLives, setLiveViewers, startLive } from '../../src/lib/api';
import { PeerSession, IceCandidateInit, SessionDescription, attachStream, getLocalStream, joinChannel, leaveChannel, send, stopStream, switchCamera } from '../../src/lib/rtc';
import { useSession } from '../../src/lib/session';
import { DARK, errText } from '../../src/lib/theme';

/**
 * Broadcasting. One peer connection per viewer (a mesh), each fed the same camera and microphone
 * tracks, so the phone's upload is what sets the limit: fine for a small congregation, not a stadium.
 */
const MAX_VIEWERS = 25;

export default function GoLive() {
  const { profile } = useSession();
  // Members under 14 cannot broadcast (the database refuses too); say why before the camera opens.
  if (profile?.restricted) return <NotForUnder14 />;
  return <Broadcast />;
}

function NotForUnder14() {
  const router = useRouter();
  return (
    <View style={{ flex: 1, backgroundColor: DARK.bg, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14 }}>
      <DarkStatusBar />
      <Icon name="live" size={44} color={DARK.fg2} />
      <Text style={{ color: DARK.fg, fontSize: 20, fontWeight: '800', textAlign: 'center' }}>Live isn't available on your account</Text>
      <Text style={{ color: DARK.fg2, textAlign: 'center', lineHeight: 21 }}>To keep younger members safe, accounts of members under 14 can watch but not broadcast live. You can still share posts and stories.</Text>
      <Button label="Go back" onPress={() => router.back()} style={{ alignSelf: 'stretch', marginTop: 6 }} />
    </View>
  );
}

function Broadcast() {
  const { me, profile } = useSession();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState('');
  const [front, setFront] = useState(true);
  const [title, setTitle] = useState('');
  const [liveId, setLiveId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [viewers, setViewers] = useState(0);
  const { lines, add: addLine } = useChatLines();
  const { hearts, add: addHeart } = useHearts();

  const streamRef = useRef<MediaStream | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const liveIdRef = useRef<string | null>(null);
  const peers = useRef(new Map<string, PeerSession>());
  const dropTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const viewersTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fullToldAt = useRef(0);
  const ending = useRef(false);

  /* ----- camera ----- */

  useEffect(() => {
    let alive = true;
    getLocalStream(true, true)
      .then((s) => {
        if (!alive) {
          stopStream(s);
          return;
        }
        streamRef.current = s;
        setStream(s);
      })
      .catch((e) => {
        if (alive) setCameraError(/permission|denied|not allowed/i.test(errText(e)) ? 'Community needs the camera and microphone to go live. Turn them on in Settings.' : errText(e));
      });
    // A broadcast left open by a crash would show as live forever; close any of mine before starting another.
    fetchLives()
      .then((cards) => cards.filter((c) => c.user_id === me && !c.ended_at && c.id !== liveIdRef.current).forEach((c) => endLive(c.id).catch(() => {})))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [me]);

  /* ----- viewers ----- */

  /** Shows the count at once and writes it to the card a little later, so a rush of joins is one write. */
  const bumpViewers = useCallback(() => {
    const n = peers.current.size;
    setViewers(n);
    if (viewersTimer.current) return;
    viewersTimer.current = setTimeout(() => {
      viewersTimer.current = null;
      const id = liveIdRef.current;
      if (id && !ending.current) setLiveViewers(id, peers.current.size).catch(() => {});
    }, 2000);
  }, []);

  const dropPeer = useCallback(
    (viewer: string, only?: PeerSession) => {
      const p = peers.current.get(viewer);
      if (!p || (only && p !== only)) return;
      p.close();
      peers.current.delete(viewer);
      const t = dropTimers.current.get(viewer);
      if (t) clearTimeout(t);
      dropTimers.current.delete(viewer);
      bumpViewers();
    },
    [bumpViewers],
  );

  /** Someone has joined the channel: give them their own peer and send the offer. */
  const onJoin = useCallback(
    async (viewer: string) => {
      const channel = channelRef.current;
      const local = streamRef.current;
      if (!viewer || viewer === me || !channel || !local || ending.current) return;
      // Back again (a reload, a flaky network): start them afresh.
      dropPeer(viewer);
      if (peers.current.size >= MAX_VIEWERS) {
        send(channel, 'full', { to: viewer });
        if (Date.now() - fullToldAt.current > 10000) {
          fullToldAt.current = Date.now();
          toast(`Your live is full: ${MAX_VIEWERS} people can watch at once.`);
        }
        return;
      }
      const peer = new PeerSession({
        onIce: (candidate: IceCandidateInit) => send(channelRef.current, 'ice', { to: viewer, candidate }),
        onTrack: () => {},
        onState: (state) => {
          if (state === 'failed' || state === 'closed') dropPeer(viewer, peer);
          else if (state === 'disconnected') {
            if (!dropTimers.current.has(viewer)) dropTimers.current.set(viewer, setTimeout(() => dropPeer(viewer, peer), 15000));
          } else if (state === 'connected') {
            const t = dropTimers.current.get(viewer);
            if (t) clearTimeout(t);
            dropTimers.current.delete(viewer);
          }
        },
      });
      attachStream(peer.pc, local);
      peers.current.set(viewer, peer);
      bumpViewers();
      try {
        const offer = await peer.makeOffer();
        send(channelRef.current, 'offer', { to: viewer, sdp: offer });
      } catch {
        dropPeer(viewer, peer);
      }
    },
    [me, dropPeer, bumpViewers, toast],
  );

  /* ----- start and end ----- */

  async function start() {
    if (!streamRef.current || busy || liveIdRef.current) return;
    setBusy(true);
    let id: string | null = null;
    try {
      id = await startLive(me, title);
      liveIdRef.current = id;
      channelRef.current = await joinChannel(`live:${id}`, {
        join: (p) => {
          onJoin(String(p.viewer ?? ''));
        },
        answer: (p) => {
          if (p.from && p.sdp) peers.current.get(String(p.from))?.acceptAnswer(p.sdp as SessionDescription).catch(() => {});
        },
        ice: (p) => {
          // Viewers' candidates carry `from`; our own carry `to` and come back to us too, so leave those.
          if (p.from && !p.to && p.candidate) peers.current.get(String(p.from))?.addIce(p.candidate as IceCandidateInit);
        },
        leave: (p) => {
          if (p.viewer) dropPeer(String(p.viewer));
        },
        chat: (p) => {
          if (p.from !== me) addLine(String(p.username ?? ''), String(p.text ?? ''));
        },
        heart: (p) => {
          if (p.from !== me) addHeart();
        },
      });
      setLiveId(id);
    } catch (e) {
      toast(errText(e));
      if (id) {
        liveIdRef.current = null;
        endLive(id).catch(() => {});
      }
    } finally {
      setBusy(false);
    }
  }

  /** Tells everyone, closes every peer, marks the broadcast over and turns the camera off. */
  const end = useCallback(async (goBack: boolean) => {
    if (ending.current) return;
    ending.current = true;
    const id = liveIdRef.current;
    const channel = channelRef.current;
    channelRef.current = null;
    liveIdRef.current = null;
    if (viewersTimer.current) clearTimeout(viewersTimer.current);
    viewersTimer.current = null;
    dropTimers.current.forEach(clearTimeout);
    dropTimers.current.clear();
    const goodbye = channel ? send(channel, 'bye', {}) : Promise.resolve();
    peers.current.forEach((p) => p.close());
    peers.current.clear();
    stopStream(streamRef.current);
    streamRef.current = null;
    // The screen goes at once; the database and the channel are tidied behind it.
    if (goBack) {
      if (router.canGoBack()) router.back();
      else router.replace('/');
    }
    await Promise.all([id ? endLive(id).catch(() => {}) : Promise.resolve(), goodbye]);
    leaveChannel(channel);
  }, [router]);

  // Leaving the screen any other way still ends the broadcast and frees the camera. The latest `end` is
  // reached through a ref so this only ever runs on unmount, never because something re-rendered.
  const endRef = useRef(end);
  endRef.current = end;
  useEffect(
    () => () => {
      endRef.current(false);
    },
    [],
  );

  function confirmEnd() {
    if (!liveIdRef.current) {
      end(true);
      return;
    }
    Alert.alert('End your live?', `${viewers === 1 ? '1 person is' : `${viewers} people are`} watching.`, [
      { text: 'Keep going', style: 'cancel' },
      { text: 'End live', style: 'destructive', onPress: () => end(true) },
    ]);
  }

  function flip() {
    switchCamera(streamRef.current);
    setFront((f) => !f);
  }

  function sendChat(text: string) {
    send(channelRef.current, 'chat', { from: me, username: profile?.username ?? 'you', text });
    addLine(profile?.username ?? 'you', text);
  }

  function sendHeart() {
    send(channelRef.current, 'heart', { from: me });
    addHeart();
  }

  const live = !!liveId;

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <DarkStatusBar />
      {stream ? <RTCView streamURL={stream.toURL()} objectFit="cover" mirror={front} style={StyleSheet.absoluteFill} /> : null}
      <LinearGradient colors={['rgba(0,0,0,0.55)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.65)']} locations={[0, 0.25, 0.6, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />

      {cameraError ? (
        <View style={{ ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 }}>
          <Icon name="videooff" size={44} color={DARK.fg2} />
          <Text style={{ color: DARK.fg, fontSize: 17, fontWeight: '700', textAlign: 'center' }}>Camera not available</Text>
          <Text style={{ color: DARK.fg2, textAlign: 'center', lineHeight: 20 }}>{cameraError}</Text>
        </View>
      ) : !stream ? (
        <View style={{ ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={DARK.fg2} />
        </View>
      ) : null}

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Top: before going live, a close button and the camera flip; while live, who you are and the count. */}
        <View style={{ paddingTop: insets.top + 8 }}>
          {live ? (
            <LiveHeader
              avatar={profile?.avatar_url}
              name={profile?.full_name}
              username={profile?.username}
              verified={profile?.verified}
              viewers={viewers}
              title={title.trim()}
              right={
                <Pressable onPress={confirmEnd} accessibilityRole="button" accessibilityLabel="End live" style={({ pressed }) => ({ height: 30, paddingHorizontal: 12, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13.5 }}>End</Text>
                </Pressable>
              }
            />
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12 }}>
              <RoundButton name="close" label="Close" bg="rgba(0,0,0,0.45)" color={DARK.fg} onPress={() => end(true)} />
              <RoundButton name="flip" label="Flip camera" bg="rgba(0,0,0,0.45)" color={DARK.fg} onPress={flip} />
            </View>
          )}
        </View>

        <View style={{ flex: 1 }} />

        {/* Bottom. */}
        <View style={{ paddingBottom: insets.bottom + 12, gap: 14 }}>
          {live ? (
            <>
              <View style={{ paddingHorizontal: 14 }}>
                <ChatLines lines={lines} />
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <LiveComposer onSend={sendChat} onHeart={sendHeart} placeholder="Say something…" />
                </View>
                <Pressable onPress={flip} hitSlop={8} accessibilityRole="button" accessibilityLabel="Flip camera" style={({ pressed }) => ({ width: 42, height: 42, marginRight: 8, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
                  <Icon name="flip" size={26} color="#fff" weight={2} />
                </Pressable>
              </View>
            </>
          ) : (
            <View style={{ paddingHorizontal: 20, gap: 14 }}>
              <TextInput value={title} onChangeText={setTitle} placeholder="Add a title (optional)" placeholderTextColor="rgba(255,255,255,0.65)" maxLength={120} keyboardAppearance="dark" accessibilityLabel="Live title" style={{ color: '#fff', fontSize: 16, paddingHorizontal: 16, paddingVertical: 13, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.45)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' }} />
              <Button label="Go live" busy={busy} disabled={!stream} onPress={start} textColor="#ffffff" style={{ backgroundColor: LIVE_RED, height: 50, borderRadius: 25 }} />
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12.5, textAlign: 'center' }}>Your followers will see you at the front of the story tray. Up to {MAX_VIEWERS} people can watch at once.</Text>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>

      <View pointerEvents="none" style={{ position: 'absolute', right: 0, bottom: insets.bottom + 70 }}>
        <Hearts hearts={hearts} />
      </View>
    </View>
  );
}
