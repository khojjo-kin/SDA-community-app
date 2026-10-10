import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { MediaStream } from 'react-native-webrtc';
import { RTCView } from 'react-native-webrtc';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { hasEnded } from '../../src/components/FundraiserCard';
import { Icon, IconName } from '../../src/components/Icon';
import { LIVE_RED } from '../../src/components/LiveBadge';
import { ChatLine, ChatLines, commentRefusal, Hearts, LiveComposer, LiveHeader, useHearts, useLiveComments } from '../../src/components/LiveOverlay';
import { ScheduleSheet } from '../../src/components/LiveSchedule';
import { ModeSwitcher, useModeNav } from '../../src/components/ModeSwitcher';
import { DarkStatusBar } from '../../src/components/OnDark';
import { Button, Radio, RoundButton, Sheet, useToast } from '../../src/components/ui';
import { addLiveComment, deleteLiveComment, endLive, fetchLives, fetchUserFundraisers, liveCommentExists, setLiveViewers, startLive } from '../../src/lib/api';
import { t } from '../../src/lib/i18n';
import { ChannelRefusedError, NONCE, PeerSession, IceCandidateInit, SessionDescription, attachStream, getLocalStream, joinChannel, leaveChannel, send, stopStream, switchCamera } from '../../src/lib/rtc';
import { useSession } from '../../src/lib/session';
import { C, DARK, errText } from '../../src/lib/theme';
import type { Fundraiser, LiveAudience } from '../../src/lib/types';

/**
 * Broadcasting. One peer connection per viewer (a mesh), each fed the same camera and microphone
 * tracks, so the phone's upload is what sets the limit: fine for a small congregation, not a stadium.
 *
 * Two private channels carry the signalling, and the database's rules decide who may use them:
 * viewers write to the broadcaster on "live:<id>" (join, answer, ice, leave, hearts), where only the
 * broadcaster can listen, and only the broadcaster writes to the viewers on "livehost:<id>" (offer,
 * ice, full, bye, hearts, removed comments). Comments themselves are database rows (useLiveComments).
 *
 * Any viewer can write to "live:<id>" and every viewer's id is visible to the others, so ids alone
 * prove nothing. Each viewer makes a secret token (a nonce) when it joins and puts it on everything
 * it sends. The token from a viewer's first 'join' is kept, and an answer, candidate, leave or heart
 * in that viewer's name without it is ignored. A 'join' with a new token for a viewer already here is
 * taken only when their connection has closed, failed or dropped (they really are reconnecting).
 */
const MAX_VIEWERS = 25;

/** A viewer's connection in these states is over, or on its way out: a fresh 'join' may replace it. */
const GONE = new Set(['closed', 'failed', 'disconnected']);

/** How long a viewer has to answer and connect before their place is given up. */
const CONNECT_MS = 30000;

/** Viewers' hearts are passed on to everyone, but no more often than this, however fast they come. */
const HEART_RELAY_MS = 150;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Who can watch, in the order the sheet offers them. Practice is a dry run nobody else sees. */
const AUDIENCES: { id: LiveAudience; icon: IconName; label: 'liveSetup.followers' | 'liveSetup.closeFriends' | 'liveSetup.practice' }[] = [
  { id: 'followers', icon: 'people', label: 'liveSetup.followers' },
  { id: 'close_friends', icon: 'star', label: 'liveSetup.closeFriends' },
  { id: 'practice', icon: 'lock', label: 'liveSetup.practice' },
];

/** A round button down the left of the camera before going live. */
function SideButton({ icon, label, on, onPress }: { icon: IconName; label: string; on?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={6} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: !!on }} style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, backgroundColor: on ? DARK.accent : 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
      <Icon name={icon} size={23} color="#fff" weight={2} />
    </Pressable>
  );
}

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
      <Text style={{ color: DARK.fg, fontSize: 20, fontWeight: '800', textAlign: 'center' }}>{t('goLive.notAvailable')}</Text>
      <Text style={{ color: DARK.fg2, textAlign: 'center', lineHeight: 21 }}>{t('goLive.notAvailableBody')}</Text>
      <Button label={t('goLive.goBack')} onPress={() => router.back()} style={{ alignSelf: 'stretch', marginTop: 6 }} />
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
  // Set before going live: who can watch, and a fundraiser of mine to put a Donate chip on it.
  const [audience, setAudience] = useState<LiveAudience>('followers');
  const [fundraisers, setFundraisers] = useState<Fundraiser[]>([]);
  const [fundraiserId, setFundraiserId] = useState<string | null>(null);
  const [panel, setPanel] = useState<null | 'audience' | 'schedule' | 'fundraiser'>(null);
  const goMode = useModeNav();
  const [liveId, setLiveId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [viewers, setViewers] = useState(0);
  const comments = useLiveComments(liveId);
  const { hearts, add: addHeart } = useHearts();

  const streamRef = useRef<MediaStream | null>(null);
  // "livehost:<id>": what I send to every viewer.
  const hostRef = useRef<RealtimeChannel | null>(null);
  // "live:<id>": what viewers send to me.
  const inboxRef = useRef<RealtimeChannel | null>(null);
  const heartRelayedAt = useRef(0);
  const removeCheckedAt = useRef(new Map<string, number>());
  const liveIdRef = useRef<string | null>(null);
  const peers = useRef(new Map<string, PeerSession>());
  // Each viewer's token, from the 'join' that was let in.
  const nonces = useRef(new Map<string, string>());
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
        // The camera's refusal is read from the error itself, since errText keeps its technical words off screen.
        const raw = `${(e as any)?.name ?? ''} ${(e as any)?.message ?? ''}`;
        if (alive) setCameraError(/permission|denied|not allowed|NotAllowed|SecurityError/i.test(raw) ? t('goLive.needsCamera') : errText(e));
      });
    // A broadcast left open by a crash would show as live forever; close any of mine before starting another.
    fetchLives()
      .then((cards) => cards.filter((c) => c.user_id === me && !c.ended_at && c.id !== liveIdRef.current).forEach((c) => endLive(c.id).catch(() => {})))
      .catch(() => {});
    // My running fundraisers, any of which can go with the live.
    fetchUserFundraisers(me)
      .then((list) => { if (alive) setFundraisers(list.filter((f) => f.status === 'active' && !hasEnded(f))); })
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
      const channel = hostRef.current;
      const local = streamRef.current;
      if (!viewer || viewer === me || !channel || !local || ending.current) return;
      // Back again (a reload, a flaky network): start them afresh.
      dropPeer(viewer);
      if (peers.current.size >= MAX_VIEWERS) {
        send(channel, 'full', { to: viewer });
        if (Date.now() - fullToldAt.current > 10000) {
          fullToldAt.current = Date.now();
          toast(t('goLive.full', { count: MAX_VIEWERS }));
        }
        return;
      }
      const peer = new PeerSession({
        onIce: (candidate: IceCandidateInit) => send(hostRef.current, 'ice', { to: viewer, candidate }),
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
      // A viewer that never answers (gone, or someone else's 'join' in their name) doesn't keep a place.
      dropTimers.current.set(viewer, setTimeout(() => dropPeer(viewer, peer), CONNECT_MS));
      bumpViewers();
      try {
        const offer = await peer.makeOffer();
        send(hostRef.current, 'offer', { to: viewer, sdp: offer });
      } catch {
        dropPeer(viewer, peer);
      }
    },
    [me, dropPeer, bumpViewers, toast],
  );

  /** True when a message in `viewer`'s name carries the token from the 'join' that let them in. */
  const fromViewer = useCallback((viewer: string, nonce: unknown) => !!viewer && typeof nonce === 'string' && nonces.current.get(viewer) === nonce, []);

  /**
   * A 'join'. The first from a viewer sets their token. The same token again is the viewer asking
   * again while it waits for an offer, as before. A new token is a reload or a new visit, taken only
   * when their connection here has ended; otherwise it is someone else using their id, and ignored.
   */
  const onJoinMessage = useCallback(
    (viewer: string, nonce: unknown) => {
      if (!viewer || typeof nonce !== 'string' || !NONCE.test(nonce)) return;
      const known = nonces.current.get(viewer);
      if (known && known !== nonce) {
        const peer = peers.current.get(viewer);
        if (peer && !GONE.has(String(peer.pc.connectionState))) return;
      }
      nonces.current.set(viewer, nonce);
      onJoin(viewer);
    },
    [onJoin],
  );

  /* ----- start and end ----- */

  /**
   * A viewer says they removed their own comment. Only I can tell everyone (on livehost), so the
   * database is asked first: a comment that is still there stays, whoever claims otherwise.
   */
  const { has: hasComment, drop: dropComment } = comments;
  const checkRemoved = useCallback(
    (commentId: string) => {
      if (!UUID.test(commentId) || !hasComment(commentId)) return;
      const now = Date.now();
      if (now - (removeCheckedAt.current.get(commentId) ?? 0) < 5000) return;
      removeCheckedAt.current.set(commentId, now);
      liveCommentExists(commentId)
        .then((still) => {
          if (still) return;
          dropComment(commentId);
          send(hostRef.current, 'remove', { id: commentId });
        })
        .catch(() => {});
    },
    [hasComment, dropComment],
  );

  async function start() {
    if (!streamRef.current || busy || liveIdRef.current) return;
    setBusy(true);
    let id: string | null = null;
    try {
      id = await startLive(me, title, { audience, fundraiserId });
      // Closed while the live was being made: it ends at once.
      if (ending.current) {
        endLive(id).catch(() => {});
        return;
      }
      liveIdRef.current = id;
      // My channel to the viewers first, so I can answer the moment the first one asks to join.
      const host = await joinChannel(`livehost:${id}`, {}, undefined, { private: true });
      if (ending.current) {
        leaveChannel(host);
        return;
      }
      hostRef.current = host;
      const liveFor = id;
      const inbox = await joinChannel(
        `live:${id}`,
        {
          join: (p) => {
            onJoinMessage(String(p.viewer ?? ''), p.nonce);
          },
          // From here on, only what carries the viewer's own token counts.
          answer: (p) => {
            const from = String(p.from ?? '');
            if (p.sdp && fromViewer(from, p.nonce)) peers.current.get(from)?.acceptAnswer(p.sdp as SessionDescription).catch(() => {});
          },
          ice: (p) => {
            // Only viewers write here, and their candidates carry `from`.
            const from = String(p.from ?? '');
            if (p.candidate && fromViewer(from, p.nonce)) peers.current.get(from)?.addIce(p.candidate as IceCandidateInit);
          },
          leave: (p) => {
            const viewer = String(p.viewer ?? '');
            if (fromViewer(viewer, p.nonce)) dropPeer(viewer);
          },
          heart: (p) => {
            if (!fromViewer(String(p.from ?? ''), p.nonce)) return;
            addHeart();
            // Viewers can't write to each other, so their hearts reach the others through me.
            const now = Date.now();
            if (now - heartRelayedAt.current < HEART_RELAY_MS) return;
            heartRelayedAt.current = now;
            send(hostRef.current, 'heart', { from: String(p.from ?? '') });
          },
          remove: (p) => {
            checkRemoved(String(p.id ?? ''));
          },
        },
        (channel) => comments.listen(channel, liveFor),
        { private: true },
      );
      if (ending.current) {
        leaveChannel(inbox);
        return;
      }
      inboxRef.current = inbox;
      setLiveId(id);
    } catch (e) {
      leaveChannel(hostRef.current);
      hostRef.current = null;
      // My own live turned away by its channel's rules is not something to explain; trying again usually works.
      toast(e instanceof ChannelRefusedError ? t('goLive.couldNotStart') : errText(e));
      if (id && !ending.current) {
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
    const host = hostRef.current;
    const inbox = inboxRef.current;
    hostRef.current = null;
    inboxRef.current = null;
    liveIdRef.current = null;
    if (viewersTimer.current) clearTimeout(viewersTimer.current);
    viewersTimer.current = null;
    dropTimers.current.forEach(clearTimeout);
    dropTimers.current.clear();
    nonces.current.clear();
    const goodbye = host ? send(host, 'bye', {}) : Promise.resolve();
    peers.current.forEach((p) => p.close());
    peers.current.clear();
    stopStream(streamRef.current);
    streamRef.current = null;
    // The screen goes at once; the database and the channels are tidied behind it.
    if (goBack) {
      if (router.canGoBack()) router.back();
      else router.replace('/');
    }
    await Promise.all([id ? endLive(id).catch(() => {}) : Promise.resolve(), goodbye]);
    leaveChannel(host);
    leaveChannel(inbox);
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
    Alert.alert(t('goLive.endQuestion'), t(viewers === 1 ? 'goLive.watchingOne' : 'goLive.watching', { count: viewers }), [
      { text: t('goLive.keepGoing'), style: 'cancel' },
      { text: t('goLive.endLive'), style: 'destructive', onPress: () => end(true) },
    ]);
  }

  function flip() {
    switchCamera(streamRef.current);
    setFront((f) => !f);
  }

  /** True once posted. Otherwise says why (the box then gets the words back). */
  async function sendChat(text: string): Promise<boolean> {
    const id = liveIdRef.current;
    if (!id) return false;
    try {
      comments.add([await addLiveComment(me, id, text)]);
      return true;
    } catch (e) {
      // Too many in a minute, or the live has ended (closed from another phone, say): in plain words.
      toast((await commentRefusal(e, id)).text);
      return false;
    }
  }

  /** On my own live I can take down any comment; everyone watching is told to drop it too. */
  async function removeComment(line: ChatLine) {
    try {
      await deleteLiveComment(line.id);
      comments.drop(line.id);
      send(hostRef.current, 'remove', { id: line.id });
    } catch (e) {
      toast(errText(e));
    }
  }

  function sendHeart() {
    send(hostRef.current, 'heart', { from: me });
    addHeart();
  }

  const live = !!liveId;
  // Before going live the camera sits in a frame with rounded bottom corners, above the mode switcher.
  const barH = insets.bottom + 58;
  const linked = fundraisers.find((f) => f.id === fundraiserId) ?? null;
  const audienceLabel = audience === 'practice' ? t('liveSetup.pillPractice') : t('liveSetup.shareWith', { who: t(audience === 'close_friends' ? 'liveSetup.closeFriends' : 'liveSetup.followers') });
  const closePanel = () => setPanel(null);

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <DarkStatusBar />
      <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: live ? 0 : barH, borderBottomLeftRadius: live ? 0 : 28, borderBottomRightRadius: live ? 0 : 28, overflow: 'hidden', backgroundColor: '#0d0f12' }}>
        {stream ? <RTCView streamURL={stream.toURL()} objectFit="cover" mirror={front} style={StyleSheet.absoluteFill} /> : null}
        <LinearGradient colors={['rgba(0,0,0,0.55)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.65)']} locations={[0, 0.25, 0.6, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />

        {cameraError ? (
          <View style={{ ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 }}>
            <Icon name="videooff" size={44} color={DARK.fg2} />
            <Text style={{ color: DARK.fg, fontSize: 17, fontWeight: '700', textAlign: 'center' }}>{t('goLive.cameraUnavailable')}</Text>
            <Text style={{ color: DARK.fg2, textAlign: 'center', lineHeight: 20 }}>{cameraError}</Text>
          </View>
        ) : !stream ? (
          <View style={{ ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={DARK.fg2} />
          </View>
        ) : null}

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {/* Top: before going live, close, who can watch, and room for settings; while live, who you are and the count. */}
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
                  <Pressable onPress={confirmEnd} accessibilityRole="button" accessibilityLabel={t('goLive.endLive')} style={({ pressed }) => ({ height: 30, paddingHorizontal: 12, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13.5 }}>{t('goLive.end')}</Text>
                  </Pressable>
                }
              />
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 }}>
                <RoundButton name="close" label={t('common.close')} bg="rgba(0,0,0,0.45)" color={DARK.fg} onPress={() => end(true)} />
                <View style={{ flex: 1, alignItems: 'center', paddingHorizontal: 8 }}>
                  <Pressable onPress={() => setPanel('audience')} accessibilityRole="button" accessibilityLabel={audienceLabel} accessibilityHint={t('liveSetup.audienceTitle')} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.45)', maxWidth: '100%', opacity: pressed ? 0.7 : 1 })}>
                    <Text numberOfLines={1} style={{ color: '#fff', fontWeight: '700', fontSize: 14.5, flexShrink: 1 }}>{audienceLabel}</Text>
                    <Icon name="down" size={15} color="#fff" weight={2.4} />
                  </Pressable>
                </View>
                {/* There are no live settings to open yet, so this side only balances the close button. */}
                <View style={{ width: 44 }} />
              </View>
            )}
          </View>

          {/* Left side, before going live: plan one for later, and link a fundraiser (when you have one running). */}
          {!live ? (
            <View style={{ position: 'absolute', left: 12, top: insets.top + 74, gap: 14 }}>
              <SideButton icon="calendar" label={t('liveSetup.schedule')} onPress={() => setPanel('schedule')} />
              {fundraisers.length ? <SideButton icon="heartcoin" label={t('liveSetup.fundraiser')} on={!!linked} onPress={() => setPanel('fundraiser')} /> : null}
            </View>
          ) : null}

          <View style={{ flex: 1 }} />

          {/* Bottom. */}
          <View style={{ paddingBottom: live ? insets.bottom + 12 : 18, gap: 14 }}>
            {live ? (
              <>
                <View style={{ paddingHorizontal: 14 }}>
                  <ChatLines lines={comments.lines} canRemove={() => true} onRemove={removeComment} />
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <LiveComposer onSend={sendChat} onHeart={sendHeart} placeholder={t('goLive.saySomething')} />
                  </View>
                  <Pressable onPress={flip} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('goLive.flip')} style={({ pressed }) => ({ width: 42, height: 42, marginRight: 8, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
                    <Icon name="flip" size={26} color="#fff" weight={2} />
                  </Pressable>
                </View>
              </>
            ) : (
              <View style={{ alignItems: 'center', gap: 16 }}>
                {linked ? (
                  <Pressable onPress={() => setPanel('fundraiser')} accessibilityRole="button" accessibilityLabel={t('liveSetup.linkedFundraiser', { title: linked.title })} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, height: 30, paddingHorizontal: 12, borderRadius: 15, backgroundColor: 'rgba(0,0,0,0.5)', maxWidth: '80%', opacity: pressed ? 0.7 : 1 })}>
                    <Icon name="heartcoin" size={15} color="#fff" weight={2.2} />
                    <Text numberOfLines={1} style={{ color: '#fff', fontWeight: '600', fontSize: 13, flexShrink: 1 }}>{linked.title}</Text>
                  </Pressable>
                ) : null}
                <TextInput value={title} onChangeText={setTitle} placeholder={t('liveSetup.titlePlaceholder')} placeholderTextColor="rgba(255,255,255,0.7)" maxLength={120} keyboardAppearance="dark" accessibilityLabel={t('goLive.titleLabel')} style={{ width: '72%', color: '#fff', fontSize: 16, fontWeight: '600', textAlign: 'center', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.4)' }} />
                <View style={{ alignSelf: 'stretch', height: 84, alignItems: 'center', justifyContent: 'center' }}>
                  <Pressable onPress={start} disabled={!stream || busy} accessibilityRole="button" accessibilityLabel={t('goLive.goLive')} accessibilityState={{ disabled: !stream, busy }} style={({ pressed }) => ({ width: 82, height: 82, borderRadius: 41, borderWidth: 4, borderColor: '#fff', alignItems: 'center', justifyContent: 'center', opacity: !stream ? 0.5 : pressed ? 0.8 : 1 })}>
                    <View style={{ width: 66, height: 66, borderRadius: 33, backgroundColor: LIVE_RED, alignItems: 'center', justifyContent: 'center' }}>
                      {busy ? <ActivityIndicator color="#fff" /> : <Icon name="live" size={36} color="#fff" weight={2.2} />}
                    </View>
                  </Pressable>
                  <View style={{ position: 'absolute', right: 22 }}>
                    <RoundButton name="flip" label={t('goLive.flip')} bg="rgba(0,0,0,0.45)" color={DARK.fg} onPress={flip} />
                  </View>
                </View>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </View>

      {/* POST · STORY · SHORTS · LIVE, under the camera. */}
      {!live ? (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: insets.bottom + 5 }}>
          <ModeSwitcher mode="live" onMode={goMode} disabled={busy} />
        </View>
      ) : null}

      <View pointerEvents="none" style={{ position: 'absolute', right: 0, bottom: insets.bottom + 70 }}>
        <Hearts hearts={hearts} />
      </View>

      <Sheet visible={panel === 'audience'} onClose={closePanel} title={t('liveSetup.audienceTitle')}>
        {AUDIENCES.map((a) => (
          <Pressable key={a.id} onPress={() => { setAudience(a.id); closePanel(); }} accessibilityRole="radio" accessibilityState={{ checked: audience === a.id }} accessibilityLabel={t(a.label)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 18, minHeight: 56, backgroundColor: pressed ? C.press : 'transparent' })}>
            <Icon name={a.icon} size={24} color={C.fg} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.fg, fontSize: 16.5 }}>{t(a.label)}</Text>
              {a.id === 'practice' ? <Text style={{ color: C.fg2, fontSize: 13.5 }}>{t('liveSetup.onlyYou')}</Text> : null}
            </View>
            <Radio on={audience === a.id} />
          </Pressable>
        ))}
      </Sheet>

      <Sheet visible={panel === 'fundraiser'} onClose={closePanel} title={t('liveSetup.fundraiser')}>
        {fundraisers.map((f) => {
          const on = fundraiserId === f.id;
          return (
            <Pressable key={f.id} onPress={() => { setFundraiserId(on ? null : f.id); closePanel(); }} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={f.title} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 18, minHeight: 56, backgroundColor: pressed ? C.press : 'transparent' })}>
              <Icon name="gift" size={24} color={C.fg} />
              <Text numberOfLines={2} style={{ flex: 1, color: C.fg, fontSize: 16.5 }}>{f.title}</Text>
              <Radio on={on} />
            </Pressable>
          );
        })}
        {fundraiserId ? (
          <Pressable onPress={() => { setFundraiserId(null); closePanel(); }} accessibilityRole="button" accessibilityLabel={t('liveSetup.noFundraiser')} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 18, minHeight: 56, backgroundColor: pressed ? C.press : 'transparent' })}>
            <Icon name="close" size={24} color={C.like} />
            <Text style={{ flex: 1, color: C.like, fontSize: 16.5 }}>{t('liveSetup.noFundraiser')}</Text>
          </Pressable>
        ) : null}
      </Sheet>

      <ScheduleSheet visible={panel === 'schedule'} onClose={closePanel} />
    </View>
  );
}
