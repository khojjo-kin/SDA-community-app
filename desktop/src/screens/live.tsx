// Watching a live broadcast from an iPhone. The same steps as the iPhone viewer
// (app/(app)/live/[id].tsx): say 'join' on the broadcaster's channel, answer the offer they send
// back, show the video, and trade chat lines and hearts. Uses the shared src/lib/rtc.ts.
import React, { useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { fetchLive } from 'shared/api';
import { type IceCandidateInit, PeerSession, type SessionDescription, joinChannel, leaveChannel, send } from 'shared/rtc';
import { errText, fmt } from 'shared/theme';
import type { LiveCard } from 'shared/types';
import { useMe } from '../lib/me';
import { back, nav } from '../lib/router';
import { Avatar, Icon, Spinner, Verified } from '../ui/kit';

type Line = { id: number; username: string; text: string };

export function LiveViewer({ id }: { id: string }) {
  const { me } = useMe();
  const [card, setCard] = useState<LiveCard | null | undefined>(undefined);
  const [ended, setEnded] = useState(false);
  const [full, setFull] = useState(false);
  const [remote, setRemote] = useState<MediaStream | null>(null);
  const [note, setNote] = useState('Joining…');
  const [lines, setLines] = useState<Line[]>([]);
  const [hearts, setHearts] = useState<number[]>([]);
  const [text, setText] = useState('');
  const [muted, setMuted] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const peerRef = useRef<PeerSession | null>(null);
  const counter = useRef(0);

  const addLine = (username: string, t: string) => setLines((l) => [...l.slice(-7), { id: ++counter.current, username, text: t }]);
  const addHeart = () => {
    const n = ++counter.current;
    setHearts((h) => [...h, n]);
    setTimeout(() => setHearts((h) => h.filter((x) => x !== n)), 2200);
  };

  useEffect(() => {
    const load = () =>
      fetchLive(id).then(
        (c) => {
          setCard(c);
          if (!c || c.ended_at) setEnded(true);
        },
        () => setCard((cur) => (cur === undefined ? null : cur)),
      );
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [id]);

  useEffect(() => {
    if (video.current && video.current.srcObject !== remote) video.current.srcObject = remote;
  }, [remote]);

  useEffect(() => {
    if (ended) return;
    let alive = true;
    let joinTimer: ReturnType<typeof setInterval> | null = null;
    let gotOffer = false;
    let tries = 0;
    (async () => {
      try {
        const channel = await joinChannel(`live:${id}`, {
          offer: async (p) => {
            if (p.to !== me.id || !p.sdp || !alive) return;
            gotOffer = true;
            if (joinTimer) clearInterval(joinTimer);
            joinTimer = null;
            peerRef.current?.close();
            const peer = new PeerSession({
              onIce: (candidate: IceCandidateInit) => send(channelRef.current, 'ice', { from: me.id, candidate }),
              onTrack: (stream) => {
                if (alive) {
                  setRemote(stream as unknown as MediaStream);
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
              send(channelRef.current, 'answer', { from: me.id, sdp: answer });
            } catch (e) {
              if (alive) setNote(errText(e));
            }
          },
          ice: (p) => {
            if (p.to === me.id && p.candidate) peerRef.current?.addIce(p.candidate as IceCandidateInit);
          },
          full: (p) => {
            if (p.to === me.id && alive) setFull(true);
          },
          bye: () => alive && setEnded(true),
          chat: (p) => {
            if (p.from !== me.id) addLine(String(p.username ?? ''), String(p.text ?? ''));
          },
          heart: (p) => {
            if (p.from !== me.id) addHeart();
          },
        });
        if (!alive) {
          leaveChannel(channel);
          return;
        }
        channelRef.current = channel;
        const join = () => send(channel, 'join', { viewer: me.id, username: me.username });
        join();
        joinTimer = setInterval(() => {
          if (gotOffer || tries++ >= 6) {
            if (joinTimer) clearInterval(joinTimer);
            joinTimer = null;
            if (!gotOffer && alive) setNote('The broadcaster is not answering. Try again in a moment.');
            return;
          }
          join();
        }, 2500);
      } catch (e) {
        if (alive) setNote(errText(e));
      }
    })();
    return () => {
      alive = false;
      if (joinTimer) clearInterval(joinTimer);
      peerRef.current?.close();
      peerRef.current = null;
      const channel = channelRef.current;
      channelRef.current = null;
      if (channel) send(channel, 'leave', { viewer: me.id }).finally(() => leaveChannel(channel));
    };
  }, [id, ended]);

  const say = () => {
    const t = text.trim();
    if (!t) return;
    send(channelRef.current, 'chat', { from: me.id, username: me.username, text: t });
    addLine(me.username, t);
    setText('');
  };

  return (
    <div className="live-stage">
      <div className="live-frame">
        {remote && !ended ? <video ref={video} autoPlay playsInline muted={muted} /> : <div className="call-backdrop" style={card?.avatar_url ? { backgroundImage: `url(${card.avatar_url})` } : undefined} />}
        <header className="live-head">
          <Avatar src={card?.avatar_url} name={card?.username || '?'} size={36} onClick={() => card && nav('/u/' + card.username)} />
          <span className="row-text">
            <b>
              {card?.username}
              {card?.verified ? <Verified size={12} /> : null}
            </b>
            <span>{card?.title}</span>
          </span>
          <span className="live-pill">LIVE</span>
          {card ? (
            <span className="live-count">
              <Icon name="eye" size={14} color="#fff" /> {fmt(card.viewers)}
            </span>
          ) : null}
          <button className="icon-btn" aria-label={muted ? 'Sound on' : 'Sound off'} onClick={() => setMuted(!muted)}>
            <Icon name={muted ? 'mute' : 'sound'} size={20} color="#fff" />
          </button>
          <button className="icon-btn" aria-label="Leave" onClick={() => back('/')}>
            <Icon name="close" size={22} color="#fff" />
          </button>
        </header>
        {ended || full || note ? (
          <div className="live-note">
            {card === undefined ? <Spinner /> : null}
            <b>{ended ? 'This live has ended' : full ? 'This live is full' : note}</b>
            {ended || full ? (
              <button className="btn" onClick={() => back('/')}>
                Done
              </button>
            ) : null}
          </div>
        ) : null}
        <div className="live-lines">
          {lines.map((l) => (
            <div key={l.id} className="live-line">
              <b>{l.username}</b> {l.text}
            </div>
          ))}
        </div>
        <div className="live-hearts" aria-hidden="true">
          {hearts.map((h) => (
            <span key={h} style={{ left: `${(h * 37) % 60}%` }}>
              <Icon name="heart" size={28} color="#ff3040" fill="#ff3040" stroke={0} />
            </span>
          ))}
        </div>
        {!ended ? (
          <form
            className="live-compose"
            onSubmit={(e) => {
              e.preventDefault();
              say();
            }}
          >
            <input placeholder="Comment…" value={text} maxLength={200} onChange={(e) => setText(e.target.value)} aria-label="Comment on the live" />
            <button
              type="button"
              className="icon-btn"
              aria-label="Send a heart"
              onClick={() => {
                send(channelRef.current, 'heart', { from: me.id });
                addHeart();
              }}
            >
              <Icon name="heart" size={26} color="#fff" />
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
