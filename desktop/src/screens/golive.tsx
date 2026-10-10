// Going live from the computer (Create → Live video), ported from the iPhone app (app/(app)/go-live.tsx)
// with the same signalling (src/lib/rtc.ts), so iPhone viewers and desktop viewers watch it alike.
//
// Before going live: the camera and microphone preview, a title, who can watch (Followers, Close
// friends, or Practice, which only you see), a fundraiser of yours to collect for, and Schedule a live.
// While live: one peer connection per viewer (a mesh), each fed the same camera and microphone, so the
// computer's upload sets the limit; comments (database rows), hearts, the number watching
// (setLiveViewers), microphone and camera switches, and End.
//
// Two private channels carry the signalling: viewers write to me on "live:<id>" (join, answer, ice,
// leave, hearts), and I write to them on "livehost:<id>" (offer, ice, full, bye, hearts, removed
// comments). Each viewer puts a secret token on everything it sends; the one from its first 'join' is
// kept, and anything in its name without it is ignored.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { addLiveComment, deleteLiveComment, endLive, fetchLives, fetchUserFundraisers, liveCommentExists, setLiveViewers, startLive } from 'shared/api';
import { ChannelRefusedError, type IceCandidateInit, PeerSession, type SessionDescription, attachStream, getLocalStream, joinChannel, leaveChannel, send, setCameraEnabled, setMicEnabled, stopStream } from 'shared/rtc';
import { errText } from 'shared/theme';
import type { Fundraiser, LiveAudience } from 'shared/types';
import { t, tn } from '../lib/i18n';
import { useMe } from '../lib/me';
import { back } from '../lib/router';
import { Icon, type IconName, Modal, Spinner, ask, toast } from '../ui/kit';
import { type ChatLine, ChatLines, HeartCoin, Hearts, LIVE_RED, LiveComposer, LiveHeader, commentRefusal, readyRealtime, useFillHeight, useHearts, useLiveComments } from './live-parts';
import { ScheduleDialog } from './live-schedule';

const MAX_VIEWERS = 25;
/** A viewer's connection in these states is over, or on its way out: a fresh 'join' may replace it. */
const GONE = new Set(['closed', 'failed', 'disconnected']);
/** How long a viewer has to answer and connect before their place is given up. */
const CONNECT_MS = 30000;
/** Viewers' hearts are passed on to everyone, but no more often than this. */
const HEART_RELAY_MS = 150;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NONCE = /^[0-9a-f]{32}$/;

// label and sub are keys, drawn with t().
const AUDIENCES: { id: LiveAudience; icon: IconName; label: string; sub?: string }[] = [
  { id: 'followers', icon: 'people', label: 'liveSetup.followers' },
  { id: 'close_friends', icon: 'star', label: 'liveSetup.closeFriends' },
  { id: 'practice', icon: 'lock', label: 'liveSetup.practice', sub: 'liveSetup.onlyYou' },
];

export function GoLive() {
  const { me } = useMe();
  // Members under 14 cannot broadcast (the database refuses too): say why before the camera opens.
  if (me.restricted) {
    return (
      <div className="lv-stage lv-plain">
        <div className="lv-over static">
          <Icon name="live" size={44} color="rgba(255,255,255,.7)" />
          <h2>{t('goLive.notAvailable')}</h2>
          <p>{t('goLive.notAvailableBody')}</p>
          <button className="btn block" onClick={() => back('/')}>
            {t('goLive.goBack')}
          </button>
        </div>
      </div>
    );
  }
  return <Broadcast />;
}

function Broadcast() {
  const { me } = useMe();
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState('');
  const [title, setTitle] = useState('');
  const [audience, setAudience] = useState<LiveAudience>('followers');
  const [fundraisers, setFundraisers] = useState<Fundraiser[]>([]);
  const [fundraiserId, setFundraiserId] = useState<string | null>(null);
  const [panel, setPanel] = useState<null | 'audience' | 'schedule' | 'fundraiser'>(null);
  const [liveId, setLiveId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [viewers, setViewers] = useState(0);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [level, setLevel] = useState(0);
  const comments = useLiveComments(liveId);
  const { hearts, add: addHeart } = useHearts();
  const stage = useRef<HTMLDivElement>(null);
  const height = useFillHeight(stage);
  const preview = useRef<HTMLVideoElement>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const hostRef = useRef<RealtimeChannel | null>(null);
  const inboxRef = useRef<RealtimeChannel | null>(null);
  const heartRelayedAt = useRef(0);
  const removeCheckedAt = useRef(new Map<string, number>());
  const liveIdRef = useRef<string | null>(null);
  const peers = useRef(new Map<string, PeerSession>());
  const nonces = useRef(new Map<string, string>());
  const dropTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const viewersTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fullToldAt = useRef(0);
  const ending = useRef(false);

  /* ----- camera, microphone and what goes with the live ----- */
  useEffect(() => {
    let alive = true;
    getLocalStream(true, true)
      .then((s) => {
        if (!alive) return stopStream(s as any);
        streamRef.current = s as unknown as MediaStream;
        setStream(s as unknown as MediaStream);
      })
      .catch((e) => {
        const raw = `${e?.name ?? ''} ${e?.message ?? ''}`;
        if (alive) setCameraError(/permission|denied|not allowed|NotAllowed|SecurityError/i.test(raw) ? t('d.frame.cameraBlocked') : /NotFound|no camera|Requested device/i.test(raw) ? t('d.frame.noCamera') : errText(e));
      });
    // A broadcast left open by a crash would show as live for hours: close any of mine before starting another.
    fetchLives()
      .then((cards) => cards.filter((c) => c.user_id === me.id && !c.ended_at && c.id !== liveIdRef.current).forEach((c) => endLive(c.id).catch(() => {})))
      .catch(() => {});
    fetchUserFundraisers(me.id)
      .then((list) => alive && setFundraisers(list.filter((f) => f.status === 'active' && !(f.ends_at && new Date(f.ends_at).getTime() < Date.now()))))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [me.id]);

  useEffect(() => {
    const v = preview.current;
    if (v && v.srcObject !== stream) {
      v.srcObject = stream;
      if (stream) v.play().catch(() => {});
    }
  }, [stream, liveId]);

  // How loud the microphone is, for the little meter: a check that it's working before going live.
  useEffect(() => {
    if (!stream || !stream.getAudioTracks().length) return;
    let ctx: AudioContext | null = null;
    let raf = 0;
    try {
      ctx = new AudioContext();
      // Browsers start it paused until the page has been clicked; Create → Live video was a click.
      ctx.resume().catch(() => {});
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      let last = 0;
      const tick = (t: number) => {
        if (t - last > 90) {
          last = t;
          analyser.getByteTimeDomainData(data);
          let sum = 0;
          for (const x of data) sum += ((x - 128) / 128) ** 2;
          setLevel(Math.min(1, Math.sqrt(sum / data.length) * 4));
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    } catch {
      // no meter on this browser
    }
    return () => {
      cancelAnimationFrame(raf);
      ctx?.close().catch(() => {});
    };
  }, [stream]);

  /* ----- viewers ----- */

  /** Shows the count at once and writes it to the card a little later, so a rush of joins is one write. */
  const bumpViewers = useCallback(() => {
    setViewers(peers.current.size);
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

  /** Someone has joined: give them their own peer and send the offer. */
  const onJoin = useCallback(
    async (viewer: string) => {
      const channel = hostRef.current;
      const local = streamRef.current;
      if (!viewer || viewer === me.id || !channel || !local || ending.current) return;
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
      attachStream(peer.pc, local as any);
      peers.current.set(viewer, peer);
      // A viewer that never answers doesn't keep a place.
      dropTimers.current.set(viewer, setTimeout(() => dropPeer(viewer, peer), CONNECT_MS));
      bumpViewers();
      try {
        const offer = await peer.makeOffer();
        send(hostRef.current, 'offer', { to: viewer, sdp: offer });
      } catch {
        dropPeer(viewer, peer);
      }
    },
    [me.id, dropPeer, bumpViewers],
  );

  const fromViewer = useCallback((viewer: string, nonce: unknown) => !!viewer && typeof nonce === 'string' && nonces.current.get(viewer) === nonce, []);

  /** A 'join': the first sets the viewer's token; a new token is taken only once their old connection is over. */
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

  /** A viewer says they removed their own comment: only passed on once the database agrees it's gone. */
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

  /* ----- start and end ----- */

  async function start() {
    if (!streamRef.current || busy || liveIdRef.current) return;
    setBusy(true);
    let id: string | null = null;
    try {
      id = await startLive(me.id, title, { audience, fundraiserId });
      if (ending.current) {
        endLive(id).catch(() => {});
        return;
      }
      liveIdRef.current = id;
      readyRealtime();
      // My channel to the viewers first, so I can answer the moment the first one asks.
      const host = await joinChannel(`livehost:${id}`, {}, undefined, { private: true });
      if (ending.current) return leaveChannel(host);
      hostRef.current = host;
      const liveFor = id;
      const inbox = await joinChannel(
        `live:${id}`,
        {
          join: (p) => onJoinMessage(String(p.viewer ?? ''), p.nonce),
          answer: (p) => {
            const from = String(p.from ?? '');
            if (p.sdp && fromViewer(from, p.nonce)) peers.current.get(from)?.acceptAnswer(p.sdp as SessionDescription).catch(() => {});
          },
          ice: (p) => {
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
          remove: (p) => checkRemoved(String(p.id ?? '')),
        },
        (channel) => comments.listen(channel, liveFor),
        { private: true },
      );
      if (ending.current) return leaveChannel(inbox);
      inboxRef.current = inbox;
      setLiveId(id);
    } catch (e) {
      leaveChannel(hostRef.current);
      hostRef.current = null;
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
    stopStream(streamRef.current as any);
    streamRef.current = null;
    if (goBack) back('/');
    await Promise.all([id ? endLive(id).catch(() => {}) : Promise.resolve(), goodbye]);
    leaveChannel(host);
    leaveChannel(inbox);
  }, []);

  // Leaving the screen any other way still ends the broadcast and frees the camera.
  const endRef = useRef(end);
  endRef.current = end;
  useEffect(() => () => void endRef.current(false), []);

  async function confirmEnd() {
    if (!liveIdRef.current) return end(true);
    const watching = tn('goLive.watching', viewers);
    if (await ask(t('goLive.endQuestion'), audience === 'practice' ? t('d.frame.practiceDone') : watching, t('goLive.endLive'))) end(true);
  }

  async function sendChat(text: string): Promise<boolean> {
    const id = liveIdRef.current;
    if (!id) return false;
    try {
      comments.add([await addLiveComment(me.id, id, text)]);
      return true;
    } catch (e) {
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
    send(hostRef.current, 'heart', { from: me.id });
    addHeart();
  }

  const toggleMic = () => {
    setMicEnabled(streamRef.current as any, !micOn);
    setMicOn(!micOn);
  };
  const toggleCam = () => {
    setCameraEnabled(streamRef.current as any, !camOn);
    setCamOn(!camOn);
  };

  const live = !!liveId;
  const linked = fundraisers.find((f) => f.id === fundraiserId) ?? null;
  const audienceLabel = audience === 'practice' ? t('liveSetup.pillPractice') : t('liveSetup.shareWith', { who: audience === 'close_friends' ? t('liveSetup.closeFriends') : t('liveSetup.followers') });
  const frameH = Math.max(380, (height || 800) - 32);

  return (
    <div className="lv-stage" ref={stage} style={{ height: height || undefined }} data-live-id={liveId ?? undefined}>
      <div className={'lv-frame lv-host' + (live ? ' is-live' : '')} style={{ height: frameH, width: Math.round((frameH * 9) / 16) }}>
        <video ref={preview} className={'lv-video mirror' + (camOn ? '' : ' off')} autoPlay playsInline muted aria-label={t('d.frame.yourCamera')} />
        {!camOn ? (
          <div className="lv-camoff">
            <Icon name="videooff" size={40} color="rgba(255,255,255,.75)" />
            <span>{t('d.frame.cameraIsOff')}</span>
          </div>
        ) : null}
        <span className="lv-shade" />
        {cameraError ? (
          <div className="lv-over">
            <Icon name="videooff" size={44} color="rgba(255,255,255,.7)" />
            <h2>{t('goLive.cameraUnavailable')}</h2>
            <p>{cameraError}</p>
            <button className="btn block quiet" onClick={() => end(true)}>
              {t('common.close')}
            </button>
          </div>
        ) : !stream ? (
          <div className="lv-over">
            <Spinner />
            <p>{t('d.frame.openingCamera')}</p>
          </div>
        ) : null}

        {/* Top: before going live, close and who can watch; while live, who you are, the count and End. */}
        <div className="lv-top">
          {live ? (
            <LiveHeader
              avatar={me.avatar_url}
              username={me.username}
              verified={me.verified}
              viewers={viewers}
              title={title.trim()}
              right={
                <button className="lv-end" onClick={confirmEnd}>
                  {t('goLive.end')}
                </button>
              }
            />
          ) : (
            <div className="lv-setup-top">
              <button className="lv-round big" aria-label={t('common.close')} onClick={() => end(true)}>
                <Icon name="close" size={20} color="#fff" stroke={2.2} />
              </button>
              <button className="lv-audience-pill" onClick={() => setPanel('audience')} aria-label={t('d.frame.audiencePill', { audience: audienceLabel })}>
                {audienceLabel}
                <Icon name="down" size={14} color="#fff" stroke={2.6} />
              </button>
              <span style={{ width: 40 }} />
            </div>
          )}
          {live && audience === 'practice' ? (
            <span className="lv-audience">
              <Icon name="lock" size={12} color="#fff" stroke={2} />
              {t('d.frame.practiceOnlyYou')}
            </span>
          ) : live && audience === 'close_friends' ? (
            <span className="lv-audience">
              <Icon name="star" size={12} color="#fff" fill="#fff" stroke={0} />
              {t('liveSetup.closeFriends')}
            </span>
          ) : null}
        </div>

        {/* Left, before going live: plan one for later, and link a fundraiser (when you have one running). */}
        {!live ? (
          <div className="lv-side left">
            <button className="lv-round big" aria-label={t('liveSetup.schedule')} title={t('liveSetup.schedule')} onClick={() => setPanel('schedule')}>
              <Icon name="calendar" size={20} color="#fff" stroke={2} />
            </button>
            {fundraisers.length ? (
              <button className={'lv-round big' + (linked ? ' on' : '')} aria-label={t('liveSetup.fundraiser')} title={t('liveSetup.fundraiser')} onClick={() => setPanel('fundraiser')}>
                <HeartCoin size={20} />
              </button>
            ) : null}
          </div>
        ) : null}

        {/* Right: the microphone (with its level before going live) and the camera. */}
        {stream ? (
          <div className="lv-side right">
            <button className={'lv-round big' + (micOn ? '' : ' off')} aria-label={micOn ? t('d.frame.mute') : t('d.frame.unmute')} aria-pressed={!micOn} onClick={toggleMic}>
              <Icon name={micOn ? 'mic' : 'micoff'} size={20} color="#fff" stroke={2} />
            </button>
            {!live ? (
              <span className="lv-meter" role="meter" aria-label={t('d.frame.micLevel')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level * 100)}>
                <i style={{ height: `${Math.round((micOn ? level : 0) * 100)}%` }} />
              </span>
            ) : null}
            <button className={'lv-round big' + (camOn ? '' : ' off')} aria-label={camOn ? t('d.frame.cameraOffAction') : t('d.frame.cameraOnAction')} aria-pressed={!camOn} onClick={toggleCam}>
              <Icon name={camOn ? 'video' : 'videooff'} size={20} color="#fff" stroke={2} />
            </button>
          </div>
        ) : null}

        <div className="lv-middle" />

        <div className="lv-bottom">
          {live ? (
            <>
              <ChatLines lines={comments.lines} canRemove={() => true} onRemove={removeComment} />
              <LiveComposer onSend={sendChat} onHeart={sendHeart} placeholder={t('goLive.saySomething')} />
            </>
          ) : (
            <div className="lv-setup-bottom">
              {linked ? (
                <button className="lv-chip" onClick={() => setPanel('fundraiser')} aria-label={t('liveSetup.linkedFundraiser', { title: linked.title })}>
                  <HeartCoin size={14} /> {linked.title}
                </button>
              ) : null}
              <input className="lv-title" value={title} maxLength={120} placeholder={t('liveSetup.titlePlaceholder')} aria-label={t('goLive.titleLabel')} onChange={(e) => setTitle(e.target.value)} />
              <button className="lv-go" onClick={start} disabled={!stream || busy} aria-label={t('goLive.goLive')}>
                <span style={{ background: LIVE_RED }}>{busy ? <Spinner size={22} /> : <Icon name="live" size={32} color="#fff" stroke={2.2} />}</span>
              </button>
              <p className="lv-hint">{audience === 'practice' ? t('d.frame.practiceHint') : t('d.frame.upToWatch', { count: MAX_VIEWERS })}</p>
            </div>
          )}
        </div>
        <Hearts hearts={hearts} />
      </div>

      {panel === 'audience' ? (
        <Modal onClose={() => setPanel(null)} title={t('liveSetup.audienceTitle')} className="sv-sheet">
          <div className="lv-options" role="radiogroup" aria-label={t('liveSetup.audienceTitle')}>
            {AUDIENCES.map((a) => (
              <label key={a.id} className="row full hover sv-radio">
                <Icon name={a.icon} size={22} />
                <span className="row-text">
                  <b>{t(a.label)}</b>
                  {a.sub ? <span>{t(a.sub)}</span> : null}
                </span>
                <input
                  type="radio"
                  name="lv-audience"
                  className="round-check"
                  aria-label={t(a.label)}
                  checked={audience === a.id}
                  onChange={() => {
                    setAudience(a.id);
                    setPanel(null);
                  }}
                />
              </label>
            ))}
          </div>
        </Modal>
      ) : null}
      {panel === 'fundraiser' ? (
        <Modal onClose={() => setPanel(null)} title={t('liveSetup.fundraiser')} className="sv-sheet">
          <div className="lv-options" role="radiogroup" aria-label={t('liveSetup.fundraiser')}>
            {fundraisers.map((f) => (
              <label key={f.id} className="row full hover sv-radio">
                <HeartCoin size={22} />
                <span className="row-text">
                  <b>{f.title}</b>
                  <span>{t('d.frame.donateButton')}</span>
                </span>
                <input
                  type="radio"
                  name="lv-fundraiser"
                  className="round-check"
                  aria-label={f.title}
                  checked={fundraiserId === f.id}
                  onChange={() => {
                    setFundraiserId(f.id);
                    setPanel(null);
                  }}
                />
              </label>
            ))}
            {fundraiserId ? (
              <button className="row full hover lv-unlink" onClick={() => { setFundraiserId(null); setPanel(null); }}>
                <Icon name="close" size={22} color="var(--like)" />
                <span className="grow">{t('liveSetup.noFundraiser')}</span>
              </button>
            ) : null}
          </div>
        </Modal>
      ) : null}
      {panel === 'schedule' ? <ScheduleDialog onClose={() => setPanel(null)} /> : null}
    </div>
  );
}
