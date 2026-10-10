import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { MediaStream } from 'react-native-webrtc';
import { RTCView } from 'react-native-webrtc';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { ChatLine, ChatLines, commentRefusal, Hearts, LiveComposer, LiveHeader, useHearts, useLiveComments } from '../../../src/components/LiveOverlay';
import { DarkStatusBar } from '../../../src/components/OnDark';
import { Avatar, Button, RoundButton, useToast } from '../../../src/components/ui';
import { addLiveComment, deleteLiveComment, fetchLive } from '../../../src/lib/api';
import { t } from '../../../src/lib/i18n';
import { ChannelRefusedError, PeerSession, IceCandidateInit, SessionDescription, joinChannel, leaveChannel, newNonce, openSendChannel, send } from '../../../src/lib/rtc';
import { useSession } from '../../../src/lib/session';
import { DARK, errText } from '../../../src/lib/theme';
import type { LiveCard } from '../../../src/lib/types';

/**
 * Watching someone's live: say 'join' to the broadcaster, answer the offer they send back, and show
 * what arrives. Both channels are private, so the database's rules decide who may watch: I listen on
 * "livehost:<id>" (only the broadcaster can write there) and only send to the broadcaster on
 * "live:<id>" (only the broadcaster can listen there, so I never subscribe to it: openSendChannel).
 *
 * Everyone watching can see viewer ids, so each visit makes a secret token (a nonce) that goes on
 * everything I send. The broadcaster keeps the one from my first 'join' and ignores anything in my
 * name without it, so nobody else can answer, leave or send hearts as me.
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

  /* ----- the card: who it is, how many are watching, whether it is over ----- */

  const loadCard = useCallback(async () => {
    try {
      const c = await fetchLive(liveId);
      setCard(c);
      if (c) hadCard.current = true;
      if (!c || c.ended_at) setEnded(true);
    } catch (e) {
      // Only the first failure is worth a word; the refresh will try again in ten seconds.
      if (!hadCard.current) toast(errText(e));
    } finally {
      setChecked(true);
    }
  }, [liveId, toast]);

  useEffect(() => {
    loadCard();
    const t = setInterval(loadCard, 10000);
    return () => clearInterval(t);
  }, [loadCard]);

  /* ----- the broadcast itself ----- */

  useEffect(() => {
    if (!me || ended) return;
    let alive = true;
    let joinTimer: ReturnType<typeof setInterval> | null = null;
    let tries = 0;
    // A new token each time I join, so a reconnect is told apart from someone else using my id.
    const nonce = newNonce();
    nonceRef.current = nonce;

    const closePeer = () => {
      peerRef.current?.close();
      peerRef.current = null;
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
              if (joinTimer) clearInterval(joinTimer);
              joinTimer = null;
              closePeer();
              const peer = new PeerSession({
                onIce: (candidate: IceCandidateInit) => send(channelRef.current, 'ice', { from: me, candidate, nonce }),
                onTrack: (stream) => {
                  if (alive) {
                    setRemote(stream);
                    setNote('');
                  }
                },
                onState: (state) => {
                  if (!alive) return;
                  if (state === 'connected') setNote('');
                  else if (state === 'disconnected') setNote(t('live.reconnecting'));
                  else if (state === 'failed') setNote(t('live.connectionLost'));
                },
              });
              peerRef.current = peer;
              try {
                const answer = await peer.acceptOffer(p.sdp as SessionDescription);
                send(channelRef.current, 'answer', { from: me, sdp: answer, nonce });
              } catch (e) {
                if (alive) setNote(errText(e));
              }
            },
            ice: (p) => {
              if (p.to === me && p.candidate) peerRef.current?.addIce(p.candidate as IceCandidateInit);
            },
            full: (p) => {
              if (p.to !== me || !alive) return;
              if (joinTimer) clearInterval(joinTimer);
              joinTimer = null;
              setFull(true);
            },
            bye: () => {
              if (alive) setEnded(true);
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
          (channel) => listenComments(channel, liveId),
          { private: true },
        );
        if (!alive) {
          leaveChannel(host);
          return;
        }
        hostRef.current = host;
        // What I send goes only to the broadcaster. Only sent on, never listened to: the server lets
        // nobody but the broadcaster listen there.
        const channel = await openSendChannel(`live:${liveId}`, { private: true });
        if (!alive) {
          leaveChannel(channel);
          return;
        }
        channelRef.current = channel;
        // Ask to be let in, and ask again a few times in case the broadcaster's phone missed it.
        const join = () => send(channel, 'join', { viewer: me, nonce });
        join();
        joinTimer = setInterval(() => {
          if (gotOffer.current || tries++ >= 6) {
            if (joinTimer) clearInterval(joinTimer);
            joinTimer = null;
            if (!gotOffer.current && alive) setNote(t('live.notAnswering'));
            return;
          }
          join();
        }, 3000);
      } catch (e) {
        if (!alive) return;
        if (e instanceof ChannelRefusedError) setRefused(true);
        else setNote(errText(e));
      }
    })();

    return () => {
      alive = false;
      if (joinTimer) clearInterval(joinTimer);
      const channel = channelRef.current;
      const host = hostRef.current;
      channelRef.current = null;
      hostRef.current = null;
      closePeer();
      setRemote(null);
      leaveChannel(host);
      if (channel) send(channel, 'leave', { viewer: me, nonce }).finally(() => leaveChannel(channel));
    };
  }, [liveId, me, ended, addHeart, listenComments, dropComment]);

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

  const name = card?.full_name || card?.username || '';

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

          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }} pointerEvents="none">
            {!remote ? (
              <>
                {card ? <Avatar uri={card.avatar_url} name={name} size={110} /> : null}
                {note ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    {note === t('live.joining') || note === t('live.reconnecting') ? <ActivityIndicator color="#fff" /> : null}
                    <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 15, textAlign: 'center', maxWidth: 280 }}>{note}</Text>
                  </View>
                ) : null}
              </>
            ) : note ? (
              <View style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.5)' }}>
                <Text style={{ color: '#fff', fontSize: 14 }}>{note}</Text>
              </View>
            ) : null}
          </View>

          <View style={{ paddingBottom: insets.bottom + 12, gap: 14 }}>
            <View style={{ paddingHorizontal: 14 }}>
              <ChatLines lines={comments.lines} canRemove={(l) => l.userId === me} onRemove={removeComment} />
            </View>
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
