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
import { ChatLines, Hearts, LiveComposer, LiveHeader, useChatLines, useHearts } from '../../../src/components/LiveOverlay';
import { DarkStatusBar } from '../../../src/components/OnDark';
import { Avatar, Button, RoundButton, useToast } from '../../../src/components/ui';
import { fetchLive } from '../../../src/lib/api';
import { PeerSession, IceCandidateInit, SessionDescription, joinChannel, leaveChannel, send } from '../../../src/lib/rtc';
import { useSession } from '../../../src/lib/session';
import { DARK, errText } from '../../../src/lib/theme';
import type { LiveCard } from '../../../src/lib/types';

/** Watching someone's live: say 'join' on their channel, answer the offer they send back, and show what arrives. */
export default function LiveViewer() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const liveId = String(id);
  const { me, profile } = useSession();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();

  const [card, setCard] = useState<LiveCard | null>(null);
  const [checked, setChecked] = useState(false);
  const [ended, setEnded] = useState(false);
  const [full, setFull] = useState(false);
  const [remote, setRemote] = useState<MediaStream | null>(null);
  const [note, setNote] = useState('Joining…');
  const { lines, add: addLine } = useChatLines();
  const { hearts, add: addHeart } = useHearts();

  const channelRef = useRef<RealtimeChannel | null>(null);
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

    const closePeer = () => {
      peerRef.current?.close();
      peerRef.current = null;
    };

    (async () => {
      try {
        const channel = await joinChannel(`live:${liveId}`, {
          offer: async (p) => {
            if (p.to !== me || !p.sdp || !alive) return;
            gotOffer.current = true;
            if (joinTimer) clearInterval(joinTimer);
            joinTimer = null;
            closePeer();
            const peer = new PeerSession({
              onIce: (candidate: IceCandidateInit) => send(channelRef.current, 'ice', { from: me, candidate }),
              onTrack: (stream) => {
                if (alive) {
                  setRemote(stream);
                  setNote('');
                }
              },
              onState: (state) => {
                if (!alive) return;
                if (state === 'connected') setNote('');
                else if (state === 'disconnected') setNote('Reconnecting…');
                else if (state === 'failed') setNote('Connection lost. Leave and join again.');
              },
            });
            peerRef.current = peer;
            try {
              const answer = await peer.acceptOffer(p.sdp as SessionDescription);
              send(channelRef.current, 'answer', { from: me, sdp: answer });
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
          chat: (p) => {
            if (p.from !== me) addLine(String(p.username ?? ''), String(p.text ?? ''));
          },
          heart: (p) => {
            if (p.from !== me) addHeart();
          },
        });
        if (!alive) {
          leaveChannel(channel);
          return;
        }
        channelRef.current = channel;
        // Ask to be let in, and ask again a few times in case the broadcaster's phone missed it.
        const join = () => send(channel, 'join', { viewer: me, username: profile?.username ?? '' });
        join();
        joinTimer = setInterval(() => {
          if (gotOffer.current || tries++ >= 6) {
            if (joinTimer) clearInterval(joinTimer);
            joinTimer = null;
            if (!gotOffer.current && alive) setNote('The broadcaster is not answering. Try again in a moment.');
            return;
          }
          join();
        }, 3000);
      } catch (e) {
        if (alive) setNote(errText(e));
      }
    })();

    return () => {
      alive = false;
      if (joinTimer) clearInterval(joinTimer);
      const channel = channelRef.current;
      channelRef.current = null;
      closePeer();
      setRemote(null);
      if (channel) send(channel, 'leave', { viewer: me }).finally(() => leaveChannel(channel));
    };
  }, [liveId, me, ended, profile?.username, addLine, addHeart]);

  function sendChat(text: string) {
    send(channelRef.current, 'chat', { from: me, username: profile?.username ?? '', text });
    addLine(profile?.username ?? 'you', text);
  }

  function sendHeart() {
    send(channelRef.current, 'heart', { from: me });
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

      {ended || full || (checked && !card) ? (
        <View style={{ ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14 }}>
          <Avatar uri={card?.avatar_url} name={name} size={96} />
          <Text style={{ color: '#fff', fontSize: 20, fontWeight: '800', textAlign: 'center' }}>{full ? 'This live is full' : 'The live has ended'}</Text>
          <Text style={{ color: 'rgba(255,255,255,0.75)', textAlign: 'center', lineHeight: 20 }}>{full ? 'Only a small number of people can watch at once. Try again in a little while.' : name ? `${name} has finished broadcasting.` : 'Nothing is being broadcast here any more.'}</Text>
          <Button label="Done" onPress={leave} style={{ alignSelf: 'stretch', marginTop: 8 }} />
        </View>
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={{ paddingTop: insets.top + 8, flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <LiveHeader avatar={card?.avatar_url} name={card?.full_name} username={card?.username} verified={card?.verified} viewers={card?.viewers ?? 0} title={card?.title} />
            </View>
            <View style={{ paddingRight: 12 }}>
              <RoundButton name="close" label="Leave" size={36} iconSize={20} bg="rgba(0,0,0,0.45)" color={DARK.fg} onPress={leave} />
            </View>
          </View>

          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }} pointerEvents="none">
            {!remote ? (
              <>
                {card ? <Avatar uri={card.avatar_url} name={name} size={110} /> : null}
                {note ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    {/Joining|Reconnecting/.test(note) ? <ActivityIndicator color="#fff" /> : null}
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
              <ChatLines lines={lines} />
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
