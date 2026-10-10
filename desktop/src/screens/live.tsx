// Watching someone's live broadcast, with the same steps as the iPhone viewer (app/(app)/live/[id].tsx)
// and the shared signalling code (src/lib/rtc.ts). Both channels are private, so the database's rules
// decide who may watch: I listen on "livehost:<id>" (only the broadcaster writes there) and only send
// on "live:<id>" (only the broadcaster listens there). Each visit makes a secret token that goes on
// everything I send, so nobody else can answer, leave or send hearts in my name. Comments are rows in
// the database; a live with a fundraiser has a Donate button.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { addLiveComment, deleteLiveComment, fetchLive } from 'shared/api';
import { ChannelRefusedError, type IceCandidateInit, PeerSession, type SessionDescription, joinChannel, leaveChannel, openSendChannel, send } from 'shared/rtc';
import { errText } from 'shared/theme';
import type { LiveCard } from 'shared/types';
import { t } from '../lib/i18n';
import { useMe } from '../lib/me';
import { back, nav } from '../lib/router';
import { Avatar, Icon, Spinner, toast } from '../ui/kit';
import { type ChatLine, ChatLines, HeartCoin, Hearts, LiveComposer, LiveHeader, commentRefusal, makeNonce, readyRealtime, useFillHeight, useHearts, useLiveComments } from './live-parts';

export function LiveViewer({ id }: { id: string }) {
  const { me } = useMe();
  const [card, setCard] = useState<LiveCard | null>(null);
  const [checked, setChecked] = useState(false);
  const [ended, setEnded] = useState(false);
  const [full, setFull] = useState(false);
  // The channel's rules turned this account away (blocked, or not in the live's audience).
  const [refused, setRefused] = useState(false);
  const [remote, setRemote] = useState<MediaStream | null>(null);
  const [note, setNote] = useState(() => t('live.joining'));
  const [muted, setMuted] = useState(false);
  const comments = useLiveComments(id);
  const { listen: listenComments, drop: dropComment } = comments;
  const { hearts, add: addHeart } = useHearts();
  const stage = useRef<HTMLDivElement>(null);
  const height = useFillHeight(stage);
  const video = useRef<HTMLVideoElement>(null);
  // "live:<id>": what I send to the broadcaster; "livehost:<id>": what the broadcaster sends to everyone.
  const channelRef = useRef<RealtimeChannel | null>(null);
  const hostRef = useRef<RealtimeChannel | null>(null);
  const nonceRef = useRef('');
  const peerRef = useRef<PeerSession | null>(null);
  const gotOffer = useRef(false);
  const hadCard = useRef(false);

  /* ----- the card: who it is, how many are watching, whether it is over ----- */
  const loadCard = useCallback(async () => {
    try {
      const c = await fetchLive(id);
      setCard(c);
      if (c) hadCard.current = true;
      if (!c || c.ended_at) setEnded(true);
    } catch (e) {
      if (!hadCard.current) toast(errText(e));
    } finally {
      setChecked(true);
    }
  }, [id]);
  useEffect(() => {
    setEnded(false);
    setFull(false);
    setRefused(false);
    loadCard();
    const t = setInterval(loadCard, 10000);
    return () => clearInterval(t);
  }, [loadCard]);

  const mine = !!card && card.user_id === me.id;
  const ready = checked && !!card && !mine;

  /* ----- the broadcast itself ----- */
  useEffect(() => {
    if (!ready || ended) return;
    let alive = true;
    let joinTimer: ReturnType<typeof setInterval> | null = null;
    let tries = 0;
    gotOffer.current = false;
    // A new token each time I join, so a reconnect is told apart from someone else using my id.
    const nonce = makeNonce();
    nonceRef.current = nonce;
    const closePeer = () => {
      peerRef.current?.close();
      peerRef.current = null;
    };
    (async () => {
      try {
        readyRealtime();
        const host = await joinChannel(
          `livehost:${id}`,
          {
            offer: async (p) => {
              if (p.to !== me.id || !p.sdp || !alive) return;
              gotOffer.current = true;
              if (joinTimer) clearInterval(joinTimer);
              joinTimer = null;
              closePeer();
              const peer = new PeerSession({
                onIce: (candidate: IceCandidateInit) => send(channelRef.current, 'ice', { from: me.id, candidate, nonce }),
                onTrack: (stream) => {
                  if (!alive) return;
                  setRemote(stream as unknown as MediaStream);
                  setNote('');
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
                send(channelRef.current, 'answer', { from: me.id, sdp: answer, nonce });
              } catch (e) {
                if (alive) setNote(errText(e));
              }
            },
            ice: (p) => {
              if (p.to === me.id && p.candidate) peerRef.current?.addIce(p.candidate as IceCandidateInit);
            },
            full: (p) => {
              if (p.to !== me.id || !alive) return;
              if (joinTimer) clearInterval(joinTimer);
              joinTimer = null;
              setFull(true);
            },
            bye: () => alive && setEnded(true),
            // Everyone's hearts, passed on by the broadcaster (mine are already on screen).
            heart: (p) => {
              if (p.from !== me.id) addHeart();
            },
            // A comment taken down by the broadcaster, or by its writer (checked by the broadcaster first).
            remove: (p) => dropComment(String(p.id ?? '')),
          },
          (channel) => listenComments(channel, id),
          { private: true },
        );
        if (!alive) return leaveChannel(host);
        hostRef.current = host;
        const channel = await openSendChannel(`live:${id}`, { private: true });
        if (!alive) return leaveChannel(channel);
        channelRef.current = channel;
        // Ask to be let in, and again a few times in case the broadcaster missed it.
        const join = () => send(channel, 'join', { viewer: me.id, nonce });
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
      if (channel) send(channel, 'leave', { viewer: me.id, nonce }).finally(() => leaveChannel(channel));
    };
  }, [id, me.id, ready, ended, addHeart, listenComments, dropComment]);

  // The broadcast plays with sound when the browser allows it, otherwise silently with a sound button.
  useEffect(() => {
    const v = video.current;
    if (!v || v.srcObject === remote) return;
    v.srcObject = remote;
    if (remote)
      v.play().catch((e) => {
        if (e?.name !== 'NotAllowedError') return;
        setMuted(true);
        v.muted = true;
        v.play().catch(() => {});
      });
  }, [remote]);

  async function sendChat(text: string): Promise<boolean> {
    try {
      comments.add([await addLiveComment(me.id, id, text)]);
      return true;
    } catch (e) {
      const why = await commentRefusal(e, id);
      toast(why.text);
      if (why.ended) setEnded(true);
      return false;
    }
  }

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
    send(channelRef.current, 'heart', { from: me.id, nonce: nonceRef.current });
    addHeart();
  }

  const leave = () => back('/');
  const name = card?.username || '';
  const over = ended || full || refused || (checked && !card);
  const frameH = Math.max(380, (height || 800) - 32);
  const audienceNote = card?.audience === 'close_friends' ? t('liveSetup.closeFriends') : card?.audience === 'practice' ? t('d.frame.practiceThem') : '';

  return (
    <div className="lv-stage" ref={stage} style={{ height: height || undefined }}>
      <div className="lv-frame" style={{ height: frameH, width: Math.round((frameH * 9) / 16) }}>
        {remote && !over ? (
          <video ref={video} className="lv-video" autoPlay playsInline muted={muted} />
        ) : (
          <div className="lv-backdrop" style={card?.avatar_url ? { backgroundImage: `url(${card.avatar_url})` } : undefined} />
        )}
        <span className="lv-shade" />
        {over ? (
          <div className="lv-over">
            <Avatar src={card?.avatar_url} name={name || '?'} size={96} />
            <h2>{refused && !ended ? t('live.cannotWatch') : full ? t('live.full') : t('live.ended')}</h2>
            <p>{refused && !ended ? t('live.cannotWatchBody') : full ? t('live.fullBody') : name ? t('live.endedBody', { name }) : t('live.endedNoName')}</p>
            <button className="btn block" onClick={leave}>
              {t('live.done')}
            </button>
          </div>
        ) : (
          <>
            <div className="lv-top">
              <LiveHeader
                avatar={card?.avatar_url}
                username={card?.username}
                verified={card?.verified}
                viewers={card?.viewers ?? 0}
                title={card?.title}
                onProfile={card ? () => nav('/u/' + card.username) : undefined}
                right={
                  <>
                    {remote ? (
                      <button className="lv-round" aria-label={muted ? t('d.frame.soundOn') : t('d.frame.soundOff')} onClick={() => setMuted(!muted)}>
                        <Icon name={muted ? 'mute' : 'sound'} size={18} color="#fff" />
                      </button>
                    ) : null}
                    <button className="lv-round" aria-label={t('live.leave')} onClick={leave}>
                      <Icon name="close" size={18} color="#fff" stroke={2.2} />
                    </button>
                  </>
                }
              />
              {audienceNote ? (
                <span className="lv-audience">
                  <Icon name={card?.audience === 'practice' ? 'lock' : 'star'} size={12} color="#fff" fill={card?.audience === 'close_friends' ? '#fff' : 'none'} stroke={card?.audience === 'close_friends' ? 0 : 2} />
                  {audienceNote}
                </span>
              ) : null}
            </div>
            <div className="lv-middle">
              {mine ? (
                <div className="lv-note">
                  <b>{t('d.frame.yourLive')}</b>
                  <span>{t('d.frame.yourLiveBody')}</span>
                </div>
              ) : !remote ? (
                <div className="lv-note">
                  {card ? <Avatar src={card.avatar_url} name={name || '?'} size={110} /> : null}
                  {note ? (
                    <span className="lv-note-line">
                      {note === t('live.joining') || note === t('live.reconnecting') || !checked ? <Spinner size={18} /> : null}
                      {note}
                    </span>
                  ) : null}
                </div>
              ) : note ? (
                <span className="lv-chip">{note}</span>
              ) : null}
            </div>
            <div className="lv-bottom">
              <ChatLines lines={comments.lines} canRemove={(l) => l.userId === me.id} onRemove={removeComment} />
              {card?.fundraiser_id ? (
                <button className="lv-donate" onClick={() => nav('/fundraisers/' + card.fundraiser_id)}>
                  <HeartCoin /> {t('liveSetup.donate')}
                </button>
              ) : null}
              {mine ? null : <LiveComposer onSend={sendChat} onHeart={sendHeart} />}
            </div>
            <Hearts hearts={hearts} />
          </>
        )}
      </div>
    </div>
  );
}
