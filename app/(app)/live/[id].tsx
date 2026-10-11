import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { MediaStream } from 'react-native-webrtc';
import { RTCView } from 'react-native-webrtc';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { Icon } from '../../../src/components/Icon';
import { ChatLine, ChatLines, commentRefusal, Hearts, LiveComposer, LiveHeader, useHearts, useLiveComments } from '../../../src/components/LiveOverlay';
import { DarkStatusBar } from '../../../src/components/OnDark';
import { Avatar, Button, RoundButton, useToast } from '../../../src/components/ui';
import { addLiveComment, deleteLiveComment, fetchLive } from '../../../src/lib/api';
import { t } from '../../../src/lib/i18n';
import { ChannelRefusedError, PeerSession, IceCandidateInit, SessionDescription, joinChannel, leaveChannel, newNonce, openSendChannel, send } from '../../../src/lib/rtc';
import { useSession } from '../../../src/lib/session';
import { DARK, errText } from '../../../src/lib/theme';
import type { LiveCard } from '../../../src/lib/types';

/** A dropped picture is joined again by itself this many times in a row before Try again is offered. */
const REJOINS = 3;
/** How long a connection may stay "disconnected" (it often mends by itself) before a new one is made. */
const MEND_MS = 8000;

/**
 * Watching someone's live: say 'join' to the broadcaster, answer the offer they send back, and show
 * what arrives. Both channels are private, so the database's rules decide who may watch: I listen on
 * "livehost:<id>" (only the broadcaster can write there) and only send to the broadcaster on
 * "live:<id>" (only the broadcaster can listen there, so I never subscribe to it: openSendChannel).
 *
 * Everyone watching can see viewer ids, so each visit makes a secret token (a nonce) that goes on
 * everything I send. The broadcaster keeps the one from my first 'join' and ignores anything in my
 * name without it, so nobody else can answer, leave or send hearts as me. A picture that drops is
 * joined again with the same token, which the broadcaster takes as me reconnecting.
 */
export default function LiveViewer() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const liveId = String(id);
  const { me } = useSession();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();

  const [card, setCard] = useState<LiveCard | null>(null);
  const [checked, setChecked] = useState(false);
  const [ended, setEnded] = useState(false);
  const [full, setFull] = useState(false);
  // The channel's rules turned this account away (blocked, or not allowed to see the broadcaster).
  const [refused, setRefused] = useState(false);
  const [remote, setRemote] = useState<MediaStream | null>(null);
  const [note, setNote] = useState(() => t('live.joining'));
  // Joining didn't work out by itself: Try again is offered.
  const [stuck, setStuck] = useState(false);
  // The broadcaster is in another app for a moment.
  const [paused, setPaused] = useState(false);
  // Bumped by Try again when the channels themselves couldn't be opened: everything starts afresh.
  const [attempt, setAttempt] = useState(0);
  const comments = useLiveComments(liveId);
  const { listen: listenComments, drop: dropComment } = comments;
  const { hearts, add: addHeart } = useHearts();

  // "live:<id>": what I send to the broadcaster.
  const channelRef = useRef<RealtimeChannel | null>(null);
  // This visit's token, on everything sent to the broadcaster.
  const nonceRef = useRef('');
  // "livehost:<id>": what the broadcaster sends to everyone watching.
  const hostRef = useRef<RealtimeChannel | null>(null);
  const peerRef = useRef<PeerSession | null>(null);
  const gotOffer = useRef(false);
  const hadCard = useRef(false);
  const toldError = useRef(false);
  // Try again, as the broadcast effect running now understands it.
  const retryRef = useRef<() => void>(() => {});

  /* ----- the card: who it is, how many are watching, whether it is over ----- */

  const loadCard = useCallback(async () => {
    try {
      const c = await fetchLive(liveId);
      setCard(c);
      if (c) hadCard.current = true;
      if (!c || c.ended_at) setEnded(true);
      setChecked(true);
    } catch (e) {
      // A weak connection is not the end of the live: say so once, and the refresh tries again in ten seconds.
      if (!hadCard.current && !toldError.current) {
        toldError.current = true;
        toast(errText(e));
      }
    }
  }, [liveId, toast]);

  useEffect(() => {
    if (ended) return;
    loadCard();
    const timer = setInterval(loadCard, 10000);
    return () => clearInterval(timer);
  }, [loadCard, ended]);

  /* ----- the broadcast itself ----- */

  useEffect(() => {
    if (!me || ended) return;
    let alive = true;
    let joinTimer: ReturnType<typeof setInterval> | null = null;
    let mendTimer: ReturnType<typeof setTimeout> | null = null;
    let tries = 0;
    let rejoins = 0;
    let channel: RealtimeChannel | null = null;
    // A new token each visit, so a reconnect is told apart from someone else using my id.
    const nonce = newNonce();
    nonceRef.current = nonce;

    const stopJoining = () => {
      if (joinTimer) clearInterval(joinTimer);
      joinTimer = null;
    };
    const stopMending = () => {
      if (mendTimer) clearTimeout(mendTimer);
      mendTimer = null;
    };
    const closePeer = () => {
      peerRef.current?.close();
      peerRef.current = null;
    };

    /** Asks to be let in, and again every few seconds in case the broadcaster's phone missed it. */
    const startJoining = () => {
      const ch = channel;
      if (!alive || !ch) return;
      stopJoining();
      gotOffer.current = false;
      tries = 0;
      const join = () => send(ch, 'join', { viewer: me, nonce });
      join();
      joinTimer = setInterval(() => {
        if (gotOffer.current || tries++ >= 6) {
          stopJoining();
          if (!gotOffer.current && alive) {
            setNote(t('live.notAnswering'));
            setStuck(true);
          }
          return;
        }
        join();
      }, 3000);
    };

    /** The picture was lost: a new connection, by itself a few times, then Try again. */
    const reconnect = () => {
      if (!alive) return;
      stopMending();
      closePeer();
      setRemote(null);
      if (rejoins >= REJOINS) {
        setNote(t('live.connectionLost'));
        setStuck(true);
        return;
      }
      rejoins++;
      setNote(t('live.reconnecting'));
      startJoining();
    };

    retryRef.current = () => {
      if (!alive) return;
      setStuck(false);
      setNote(t('live.joining'));
      if (!channel) {
        // The channels never opened: start everything again.
        setAttempt((a) => a + 1);
        return;
      }
      rejoins = 0;
      closePeer();
      setRemote(null);
      startJoining();
    };

    (async () => {
      try {
        // What the broadcaster sends, and new comments as they are written.
        const host = await joinChannel(
          `livehost:${liveId}`,
          {
            offer: async (p) => {
              if (p.to !== me || !p.sdp || !alive) return;
              gotOffer.current = true;
              stopJoining();
              stopMending();
              closePeer();
              setPaused(!!p.paused);
              const peer: PeerSession = new PeerSession({
                onIce: (candidate: IceCandidateInit) => send(channelRef.current, 'ice', { from: me, candidate, nonce }),
                onTrack: (stream) => {
                  if (alive && peerRef.current === peer) {
                    setRemote(stream);
                    setNote('');
                    setStuck(false);
                  }
                },
                onState: (state) => {
                  if (!alive || peerRef.current !== peer) return;
                  if (state === 'connected') {
                    stopMending();
                    rejoins = 0;
                    setNote('');
                    setStuck(false);
                  } else if (state === 'disconnected') {
                    setNote(t('live.reconnecting'));
                    // A short drop often mends by itself; if it doesn't, a new connection is made.
                    if (!mendTimer) {
                      mendTimer = setTimeout(() => {
                        mendTimer = null;
                        if (alive && peerRef.current === peer) reconnect();
                      }, MEND_MS);
                    }
                  } else if (state === 'failed') {
                    reconnect();
                  }
                },
              });
              peerRef.current = peer;
              try {
                const answer = await peer.acceptOffer(p.sdp as SessionDescription);
                if (alive && peerRef.current === peer) send(channelRef.current, 'answer', { from: me, sdp: answer, nonce });
              } catch (e) {
                if (alive && peerRef.current === peer) {
                  setNote(errText(e));
                  setStuck(true);
                }
              }
            },
            ice: (p) => {
              if (p.to === me && p.candidate) peerRef.current?.addIce(p.candidate as IceCandidateInit);
            },
            full: (p) => {
              if (p.to !== me || !alive) return;
              stopJoining();
              setFull(true);
            },
            bye: () => {
              if (alive) setEnded(true);
            },
            // The broadcaster stepped into another app, and came back.
            pause: () => {
              if (alive) setPaused(true);
            },
            resume: () => {
              if (alive) setPaused(false);
            },
            // Everyone's hearts, passed on by the broadcaster (mine are already on screen).
            heart: (p) => {
              if (p.from !== me) addHeart();
            },
            // A comment taken down by the broadcaster, or by its writer (checked by the broadcaster first).
            remove: (p) => {
              dropComment(String(p.id ?? ''));
            },
          },
          (ch) => listenComments(ch, liveId),
          { private: true },
        );
        if (!alive) {
          leaveChannel(host);
          return;
        }
        hostRef.current = host;
        // What I send goes only to the broadcaster. Only sent on, never listened to: the server lets
        // nobody but the broadcaster listen there.
        const sendTo = await openSendChannel(`live:${liveId}`, { private: true });
        if (!alive) {
          leaveChannel(sendTo);
          return;
        }
        channelRef.current = sendTo;
        channel = sendTo;
        startJoining();
      } catch (e) {
        if (!alive) return;
        if (e instanceof ChannelRefusedError) setRefused(true);
        else {
          setNote(errText(e));
          setStuck(true);
        }
      }
    })();

    return () => {
      alive = false;
      retryRef.current = () => {};
      stopJoining();
      stopMending();
      const sendTo = channelRef.current;
      const host = hostRef.current;
      channelRef.current = null;
      hostRef.current = null;
      closePeer();
      setRemote(null);
      leaveChannel(host);
      if (sendTo) send(sendTo, 'leave', { viewer: me, nonce }).finally(() => leaveChannel(sendTo));
    };
  }, [liveId, me, ended, attempt, addHeart, listenComments, dropComment]);

  /** True once posted. Otherwise says why (the box then gets the words back). */
  async function sendChat(text: string): Promise<boolean> {
    try {
      comments.add([await addLiveComment(me, liveId, text)]);
      return true;
    } catch (e) {
      // Too many in a minute, or the live has just ended: the reason, in plain words.
      const why = await commentRefusal(e, liveId);
      toast(why.text);
      if (why.ended) setEnded(true);
      return false;
    }
  }

  /** My own comment: removed for everyone (the broadcaster checks it's gone, then tells the others). */
  async function removeComment(line: ChatLine) {
    try {
      await deleteLiveComment(line.id);
      comments.drop(line.id);
      send(channelRef.current, 'remove', { id: line.id, nonce: nonceRef.current });
    } catch (e) {
      toast(errText(e));
    }
  }

  function sendHeart() {
    send(channelRef.current, 'heart', { from: me, nonce: nonceRef.current });
    addHeart();
  }

  function leave() {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }

  // A second quick tap on Donate doesn't open the fundraiser twice.
  const donatedAt = useRef(0);
  function donate() {
    if (!card?.fundraiser_id || Date.now() - donatedAt.current < 1000) return;
    donatedAt.current = Date.now();
    router.push({ pathname: '/fundraiser/[id]', params: { id: card.fundraiser_id, give: '1' } } as any);
  }

  const name = card?.full_name || card?.username || '';
  // A spinner goes with the words while something is still being tried.
  const trying = !stuck && (note === t('live.joining') || note === t('live.reconnecting'));

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <DarkStatusBar />
      {remote && !ended ? (
        <RTCView streamURL={remote.toURL()} objectFit="cover" style={StyleSheet.absoluteFill} />
      ) : (
        <>
          {card?.avatar_url ? <Image source={{ uri: card.avatar_url }} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={30} /> : <View style={[StyleSheet.absoluteFill, { backgroundColor: DARK.bg2 }]} />}
          <BlurView intensity={55} tint="dark" style={StyleSheet.absoluteFill} />
        </>
      )}
      <LinearGradient colors={['rgba(0,0,0,0.55)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.65)']} locations={[0, 0.25, 0.6, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />

      {ended || full || refused || (checked && !card) ? (
        <View style={{ ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14 }}>
          <Avatar uri={card?.avatar_url} name={name} size={96} />
          <Text style={{ color: '#fff', fontSize: 20, fontWeight: '800', textAlign: 'center' }}>{refused && !ended ? t('live.cannotWatch') : full ? t('live.full') : t('live.ended')}</Text>
          <Text style={{ color: 'rgba(255,255,255,0.75)', textAlign: 'center', lineHeight: 20 }}>
            {refused && !ended ? t('live.cannotWatchBody') : full ? t('live.fullBody') : name ? t('live.endedBody', { name }) : t('live.endedNoName')}
          </Text>
          <Button label={t('live.done')} onPress={leave} style={{ alignSelf: 'stretch', marginTop: 8 }} />
        </View>
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={{ paddingTop: insets.top + 8, flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <LiveHeader avatar={card?.avatar_url} name={card?.full_name} username={card?.username} verified={card?.verified} viewers={card?.viewers ?? 0} title={card?.title} />
            </View>
            <View style={{ paddingRight: 12 }}>
              <RoundButton name="close" label={t('live.leave')} size={36} iconSize={20} bg="rgba(0,0,0,0.45)" color={DARK.fg} onPress={leave} />
            </View>
          </View>

          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 32 }} pointerEvents="box-none">
            {!remote ? (
              <>
                {card ? <Avatar uri={card.avatar_url} name={name} size={110} /> : null}
                {note ? (
                  <View pointerEvents="none" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    {trying ? <ActivityIndicator color="#fff" /> : null}
                    <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 15, textAlign: 'center', maxWidth: 280 }}>{note}</Text>
                  </View>
                ) : null}
              </>
            ) : note || paused ? (
              <View pointerEvents="none" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.5)' }}>
                {note && trying ? <ActivityIndicator color="#fff" /> : !note ? <Icon name="pause" size={16} color="#fff" /> : null}
                <Text style={{ color: '#fff', fontSize: 14 }}>{note || t('live.paused')}</Text>
              </View>
            ) : null}
            {stuck ? <Button small label={t('common.tryAgain')} onPress={() => retryRef.current()} style={{ paddingHorizontal: 20 }} /> : null}
          </View>

          <View style={{ paddingBottom: insets.bottom + 12, gap: 14 }}>
            <View style={{ paddingHorizontal: 14 }}>
              <ChatLines lines={comments.lines} canRemove={(l) => l.userId === me} onRemove={removeComment} />
            </View>
            {/* A live with a fundraiser: Donate opens its page, ready to give. */}
            {card?.fundraiser_id ? (
              <Pressable onPress={donate} accessibilityRole="button" accessibilityLabel={t('liveSetup.donate')} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginLeft: 14, height: 32, paddingHorizontal: 13, borderRadius: 16, backgroundColor: DARK.accent, opacity: pressed ? 0.75 : 1 })}>
                <Icon name="heartcoin" size={16} color="#fff" weight={2.2} />
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13.5 }}>{t('liveSetup.donate')}</Text>
              </Pressable>
            ) : null}
            <LiveComposer onSend={sendChat} onHeart={sendHeart} />
          </View>
        </KeyboardAvoidingView>
      )}

      <View pointerEvents="none" style={{ position: 'absolute', right: 0, bottom: insets.bottom + 70 }}>
        <Hearts hearts={hearts} />
      </View>
    </View>
  );
}
