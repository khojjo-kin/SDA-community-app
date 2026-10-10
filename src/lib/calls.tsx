import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Modal } from 'react-native';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { MediaStream } from 'react-native-webrtc';
import { CallActions, CallScreen, CallView, Person } from '../components/CallScreen';
import { useToast } from '../components/ui';
import { fetchCall, fetchRingingCall, getProfile, logCallInChat, placeCall, setCallStatus } from './api';
import { PeerSession, SessionDescription, IceCandidateInit, attachStream, enableSpeaker, getLocalStream, joinChannel, leaveChannel, send, setCameraEnabled, setMicEnabled, stopStream, switchCamera } from './rtc';
import { useSession } from './session';
import { supabase } from './supabase';
import { errText } from './theme';
import type { Call } from './types';

/**
 * In-app voice and video calls over WebRTC.
 *
 * The database row in `community_calls` is the ring: the caller inserts it, the callee's phone sees
 * it arrive over Realtime and shows the incoming screen. Everything after that goes over a broadcast
 * channel named `call:<id>`: the callee says 'ready', the caller sends an 'offer', the callee an
 * 'answer', both trade 'ice' candidates, and whoever leaves first says 'bye'. The row's status is
 * kept up to date so a chat can log the call and a closed app can still pick up a ring on reopening.
 */
export type CallsApi = {
  /** Rings someone and opens the call screen. `threadId` lets the call be noted in that chat afterwards. */
  startCall: (calleeId: string, kind: 'voice' | 'video', threadId?: string | null) => Promise<void>;
  /** True while a call screen is open, so chats can grey out their call buttons. */
  inCall: boolean;
};

const Ctx = createContext<CallsApi>({ startCall: async () => {}, inCall: false });
export const useCalls = () => useContext(Ctx);

/** How long a call rings before it is missed. Matches fetchRingingCall in api.ts. */
const RING_MS = 45000;
/** How long after accepting the link may take to come up before giving up. */
const CONNECT_MS = 30000;
/** How long the "Call ended" screen stays before closing by itself. */
const LINGER_MS = 1600;

type Role = 'caller' | 'callee';
type Emit = (session: CallSession, view: CallView | null) => void;

/** One call, from ring to hang-up. Owns the stream, the peer and the channel, and tidies all three on every way out. */
class CallSession {
  readonly id: string;
  view: CallView;
  private readonly call: Call;
  private readonly me: string;
  private readonly role: Role;
  private readonly emit: Emit;
  private peer: PeerSession | null = null;
  private channel: RealtimeChannel | null = null;
  private local: MediaStream | null = null;
  private ringTimer: ReturnType<typeof setTimeout> | null = null;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private readyTimer: ReturnType<typeof setInterval> | null = null;
  private lostTimer: ReturnType<typeof setTimeout> | null = null;
  private closeTimer: ReturnType<typeof setTimeout> | null = null;
  private done = false;
  /** Caller: an offer has gone out. Callee: the offer has come in. */
  private offered = false;
  /** Caller: the callee said 'ready' before our own camera was open; offer as soon as it is. */
  private readyPending = false;

  constructor({ me, call, role, other, emit }: { me: string; call: Call; role: Role; other: Person | null; emit: Emit }) {
    this.id = call.id;
    this.call = call;
    this.me = me;
    this.role = role;
    this.emit = emit;
    this.view = {
      kind: call.kind,
      role,
      phase: role === 'caller' ? 'calling' : 'incoming',
      note: role === 'caller' ? 'Calling…' : '',
      other,
      localStream: null,
      remoteStream: null,
      muted: false,
      cameraOff: false,
      speaker: false,
      front: true,
      connectedAt: null,
    };
  }

  private set(patch: Partial<CallView>) {
    this.view = { ...this.view, ...patch };
    this.emit(this, this.view);
  }

  setOther(other: Person | null) {
    if (other) this.set({ other });
  }

  /* ----- the two ways in ----- */

  /** Caller: the row is in the database; open the channel and wait for the callee. */
  async ring() {
    // The ring runs from the moment the row exists, permission prompt or not, to match the callee's clock.
    this.ringTimer = setTimeout(() => this.finish('No answer', 'missed', { log: 'missed' }), RING_MS);
    try {
      // The channel first, so the callee's "ringing" and "ready" are not missed while the camera prompt is up.
      await this.openChannel();
      if (this.done) return;
      const stream = await getLocalStream(this.view.kind === 'video', this.view.front);
      if (this.done) {
        stopStream(stream);
        return;
      }
      this.local = stream;
      this.set({ localStream: stream });
      if (this.readyPending) this.onReady();
      // The callee may have answered or declined while all that was happening.
      const row = await fetchCall(this.call.id);
      if (row && row.status !== 'ringing') this.onRow(row);
    } catch (e) {
      this.fail(e);
    }
  }

  /** Callee: the ring has arrived; open the channel now so accepting is quick, and watch for the caller giving up. */
  async incoming() {
    try {
      await this.openChannel();
      if (this.done) return;
      // Let the caller see "Ringing…" on their side.
      send(this.channel, 'ringing', { from: this.me });
      const row = await fetchCall(this.call.id);
      if (row && row.status !== 'ringing') {
        this.finish('', null, { tellPeer: false });
        return;
      }
      // The caller's clock marks the call missed; this one only takes the screen away.
      const left = RING_MS - (Date.now() - new Date(this.call.created_at).getTime());
      this.ringTimer = setTimeout(() => this.finish('', null, { tellPeer: false }), Math.max(2000, left));
    } catch (e) {
      this.fail(e);
    }
  }

  /* ----- what the buttons do ----- */

  async accept() {
    if (this.done || this.view.phase !== 'incoming') return;
    this.clearRing();
    this.set({ phase: 'connecting', note: 'Connecting…' });
    try {
      await setCallStatus(this.call.id, 'accepted');
      this.local = await getLocalStream(this.view.kind === 'video', this.view.front);
      if (this.done) {
        stopStream(this.local);
        return;
      }
      this.set({ localStream: this.local });
      this.makePeer();
      // Tell the caller we are here, and keep saying so until their offer lands.
      const ready = () => send(this.channel, 'ready', { from: this.me });
      ready();
      this.readyTimer = setInterval(() => {
        if (this.offered) this.clearReady();
        else ready();
      }, 2000);
      this.connectTimer = setTimeout(() => this.finish('Could not connect', 'ended'), CONNECT_MS);
    } catch (e) {
      this.fail(e);
    }
  }

  decline() {
    if (this.done || this.view.phase !== 'incoming') return;
    // The caller learns of this from the row, which also tells them it was a decline and not a dropped line.
    this.finish('', 'declined', { tellPeer: false });
  }

  /** The red button, or Close on the ended screen. */
  hangUp() {
    if (this.done) {
      this.closeNow();
      return;
    }
    if (this.view.phase === 'calling') {
      this.finish('Call cancelled', 'missed', { log: 'missed' });
      return;
    }
    this.finish('Call ended', 'ended', { log: 'ended' });
  }

  toggleMute() {
    const muted = !this.view.muted;
    setMicEnabled(this.local, !muted);
    this.set({ muted });
  }

  toggleCamera() {
    const cameraOff = !this.view.cameraOff;
    setCameraEnabled(this.local, !cameraOff);
    this.set({ cameraOff });
  }

  flip() {
    switchCamera(this.local);
    this.set({ front: !this.view.front });
  }

  toggleSpeaker() {
    const speaker = !this.view.speaker;
    enableSpeaker(speaker);
    this.set({ speaker });
  }

  /* ----- signalling ----- */

  private async openChannel() {
    this.channel = await joinChannel(
      `call:${this.call.id}`,
      {
        ringing: (p) => {
          if (p.from !== this.me && this.role === 'caller' && this.view.phase === 'calling') this.set({ note: 'Ringing…' });
        },
        ready: (p) => {
          if (p.from !== this.me) this.onReady();
        },
        offer: (p) => {
          if (p.from !== this.me && p.sdp) this.onOffer(p.sdp as SessionDescription);
        },
        answer: (p) => {
          if (p.from !== this.me && p.sdp) this.onAnswer(p.sdp as SessionDescription);
        },
        ice: (p) => {
          if (p.from !== this.me && p.candidate) this.peer?.addIce(p.candidate as IceCandidateInit);
        },
        bye: (p) => {
          if (p.from === this.me) return;
          // Still ringing here means the caller gave up: they have recorded the outcome, so just go quietly.
          if (this.view.phase === 'incoming') this.finish('', null, { tellPeer: false });
          else this.finish('Call ended', 'ended', { tellPeer: false });
        },
      },
      (channel) => {
        // The row changing is how the caller learns of a decline, and the callee that the caller gave up.
        channel.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'community_calls', filter: `id=eq.${this.call.id}` }, (payload) => {
          this.onRow(payload.new as Call);
        });
      },
    );
    if (this.done) {
      leaveChannel(this.channel);
      this.channel = null;
    }
  }

  private onRow(row: Call) {
    if (this.done || !row?.status) return;
    if (this.role === 'caller') {
      if (row.status === 'declined') this.finish('Declined', null, { log: 'declined', tellPeer: false });
      else if (row.status === 'busy') this.finish('Busy', null, { log: 'missed', tellPeer: false });
      else if (row.status === 'missed') this.finish('No answer', null, { log: 'missed', tellPeer: false });
      else if (row.status === 'accepted' && this.view.phase === 'calling') {
        this.clearRing();
        this.set({ phase: 'connecting', note: 'Connecting…' });
        if (!this.connectTimer) this.connectTimer = setTimeout(() => this.finish('Could not connect', 'ended'), CONNECT_MS);
      } else if (row.status === 'ended') this.finish('Call ended', null, { tellPeer: false });
    } else if (this.view.phase === 'incoming') {
      // Still ringing here: the caller hung up, or the ring ran out on their side.
      if (row.status === 'missed' || row.status === 'ended') this.finish('', null, { tellPeer: false });
    } else if (row.status === 'ended') this.finish('Call ended', null, { tellPeer: false });
  }

  /** Caller: the callee is on the channel with their stream open, so send the offer. Repeats re-send the same one. */
  private async onReady() {
    if (this.role !== 'caller' || this.done) return;
    if (!this.local) {
      this.readyPending = true;
      return;
    }
    this.readyPending = false;
    // 'ready' is proof the call was accepted, whether or not the row's update has arrived yet.
    this.clearRing();
    if (this.view.phase === 'calling') {
      this.set({ phase: 'connecting', note: 'Connecting…' });
      if (!this.connectTimer) this.connectTimer = setTimeout(() => this.finish('Could not connect', 'ended'), CONNECT_MS);
    }
    try {
      if (!this.peer) this.makePeer();
      if (this.offered) {
        const current = this.peer!.pc.localDescription;
        if (current?.sdp && !this.peer!.pc.remoteDescription) send(this.channel, 'offer', { from: this.me, sdp: { type: 'offer', sdp: current.sdp } });
        return;
      }
      this.offered = true;
      const offer = await this.peer!.makeOffer();
      if (this.done) return;
      send(this.channel, 'offer', { from: this.me, sdp: offer });
    } catch (e) {
      this.fail(e);
    }
  }

  /** Callee: the caller's offer; answer it. */
  private async onOffer(sdp: SessionDescription) {
    if (this.role !== 'callee' || this.done || !this.peer || this.offered) return;
    this.offered = true;
    this.clearReady();
    try {
      const answer = await this.peer.acceptOffer(sdp);
      if (this.done) return;
      send(this.channel, 'answer', { from: this.me, sdp: answer });
    } catch (e) {
      this.fail(e);
    }
  }

  private async onAnswer(sdp: SessionDescription) {
    if (this.role !== 'caller' || this.done || !this.peer) return;
    try {
      await this.peer.acceptAnswer(sdp);
    } catch (e) {
      this.fail(e);
    }
  }

  private makePeer() {
    this.peer = new PeerSession({
      onIce: (candidate) => send(this.channel, 'ice', { from: this.me, candidate }),
      onTrack: (stream) => {
        if (!this.done) this.set({ remoteStream: stream });
      },
      onState: (state) => this.onPeerState(state),
    });
    if (this.local) attachStream(this.peer.pc, this.local);
  }

  private onPeerState(state: string) {
    if (this.done) return;
    if (state === 'connected') {
      this.clearRing();
      this.clearConnect();
      if (this.lostTimer) clearTimeout(this.lostTimer);
      this.lostTimer = null;
      this.set({ phase: 'connected', note: '', connectedAt: this.view.connectedAt ?? Date.now() });
    } else if (state === 'disconnected') {
      // Often a blip on a changing network; ICE will usually find its way back.
      this.set({ note: 'Reconnecting…' });
      if (!this.lostTimer) this.lostTimer = setTimeout(() => this.finish('Connection lost', 'ended', { log: this.role === 'caller' ? 'ended' : undefined }), 15000);
    } else if (state === 'failed') {
      this.finish('Connection lost', 'ended', { log: this.role === 'caller' ? 'ended' : undefined });
    }
  }

  /* ----- the way out ----- */

  private fail(e: unknown) {
    if (this.done) return;
    const text = errText(e);
    const denied = /permission|denied|not allowed|NotAllowed|SecurityError/i.test(text);
    const incoming = this.view.phase === 'incoming';
    this.finish(denied ? 'Camera or microphone not allowed. Turn them on in Settings.' : text, incoming ? 'declined' : 'ended', { linger: 3200, tellPeer: !incoming });
  }

  /**
   * Tears everything down exactly once: tells the other side, closes the peer, turns the camera off,
   * leaves the channel, records the outcome, and leaves the ended screen up for a moment.
   */
  private finish(note: string, status: Call['status'] | null, { tellPeer = true, log, linger }: { tellPeer?: boolean; log?: 'ended' | 'missed' | 'declined'; linger?: number } = {}) {
    if (this.done) return;
    this.done = true;
    this.clearRing();
    this.clearReady();
    this.clearConnect();
    if (this.lostTimer) clearTimeout(this.lostTimer);
    this.lostTimer = null;
    const seconds = this.view.connectedAt ? (Date.now() - this.view.connectedAt) / 1000 : 0;
    const channel = this.channel;
    this.channel = null;
    const goodbye = tellPeer && channel ? send(channel, 'bye', { from: this.me }) : Promise.resolve();
    goodbye.finally(() => leaveChannel(channel));
    this.peer?.close();
    this.peer = null;
    stopStream(this.local);
    this.local = null;
    this.set({ phase: 'ended', note: note || 'Call ended', localStream: null, remoteStream: null });
    if (status) setCallStatus(this.call.id, status).catch(() => {});
    if (log && this.call.thread_id) {
      const outcome = log === 'ended' && !this.view.connectedAt ? 'missed' : log;
      logCallInChat(this.me, this.call.thread_id, this.view.kind, outcome, seconds).catch(() => {});
    }
    this.closeTimer = setTimeout(() => this.closeNow(), note ? linger ?? LINGER_MS : 0);
  }

  private closeNow() {
    if (this.closeTimer) clearTimeout(this.closeTimer);
    this.closeTimer = null;
    this.emit(this, null);
  }

  /** Used when the provider goes away with the call still up (sign-out): no lingering screen. */
  dispose() {
    this.finish('', 'ended');
    this.closeNow();
  }

  private clearRing() {
    if (this.ringTimer) clearTimeout(this.ringTimer);
    this.ringTimer = null;
  }

  private clearReady() {
    if (this.readyTimer) clearInterval(this.readyTimer);
    this.readyTimer = null;
  }

  private clearConnect() {
    if (this.connectTimer) clearTimeout(this.connectTimer);
    this.connectTimer = null;
  }
}

/* ---------- the provider ---------- */

export function CallProvider({ children }: { children: React.ReactNode }) {
  const { me } = useSession();
  const toast = useToast();
  const [view, setView] = useState<CallView | null>(null);
  const session = useRef<CallSession | null>(null);
  /** Set from the tap on a call button until the row exists, so a double tap places one call. */
  const starting = useRef(false);

  const emit = useCallback<Emit>((s, v) => {
    // A late tick from an old call must not touch the current one.
    if (session.current !== s) return;
    if (!v) session.current = null;
    setView(v);
  }, []);

  /** A ring has arrived, over Realtime or from the database on reopening. */
  const onIncoming = useCallback(
    (call: Call) => {
      if (!me || call.status !== 'ringing' || call.callee_id !== me) return;
      if (Date.now() - new Date(call.created_at).getTime() > RING_MS) return;
      if (session.current || starting.current) {
        if (session.current?.id !== call.id) setCallStatus(call.id, 'busy').catch(() => {});
        return;
      }
      const s = new CallSession({ me, call, role: 'callee', other: null, emit });
      session.current = s;
      setView(s.view);
      getProfile(call.caller_id)
        .then((p) => s.setOther(p))
        .catch(() => {});
      s.incoming();
    },
    [me, emit],
  );

  // Rings arrive as new rows in community_calls addressed to me.
  useEffect(() => {
    if (!me) return;
    let live = true;
    let channel: RealtimeChannel | null = null;
    supabase.realtime
      .setAuth()
      .catch(() => {})
      .then(() => {
        if (!live) return;
        channel = supabase
          .channel(`calls:${me}`)
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'community_calls', filter: `callee_id=eq.${me}` }, (payload) => {
            if (live) onIncoming(payload.new as Call);
          })
          .subscribe();
      });
    return () => {
      live = false;
      if (channel) supabase.removeChannel(channel).catch(() => {});
    };
  }, [me, onIncoming]);

  // A phone that was closed, or asleep, picks up a ring that is still going when it comes back.
  useEffect(() => {
    if (!me) return;
    const check = () => {
      if (session.current) return;
      fetchRingingCall(me)
        .then((c) => c && onIncoming(c))
        .catch(() => {});
    };
    check();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => sub.remove();
  }, [me, onIncoming]);

  // Signing out, or the provider going away, must not leave a camera running.
  useEffect(
    () => () => {
      session.current?.dispose();
      session.current = null;
    },
    [],
  );
  useEffect(() => {
    if (!me && session.current) {
      session.current.dispose();
      session.current = null;
      setView(null);
    }
  }, [me]);

  const startCall = useCallback<CallsApi['startCall']>(
    async (calleeId, kind, threadId) => {
      if (!me) return;
      if (calleeId === me) {
        toast("You can't call yourself.");
        return;
      }
      if (session.current || starting.current) {
        toast("You're already in a call.");
        return;
      }
      starting.current = true;
      // The screen comes up at once; the row and the other person's details follow.
      setView({ kind, role: 'caller', phase: 'calling', note: 'Calling…', other: null, localStream: null, remoteStream: null, muted: false, cameraOff: false, speaker: false, front: true, connectedAt: null });
      try {
        const [other, call] = await Promise.all([getProfile(calleeId).catch(() => null), placeCall(me, calleeId, kind, threadId)]);
        const s = new CallSession({ me, call, role: 'caller', other, emit });
        session.current = s;
        setView(s.view);
        s.ring();
      } catch (e) {
        setView(null);
        toast(errText(e));
      } finally {
        starting.current = false;
      }
    },
    [me, toast, emit],
  );

  const actions = useMemo<CallActions>(
    () => ({
      accept: () => session.current?.accept(),
      decline: () => session.current?.decline(),
      hangUp: () => {
        if (session.current) session.current.hangUp();
        else setView(null);
      },
      toggleMute: () => session.current?.toggleMute(),
      toggleCamera: () => session.current?.toggleCamera(),
      flip: () => session.current?.flip(),
      toggleSpeaker: () => session.current?.toggleSpeaker(),
    }),
    [],
  );

  const api = useMemo<CallsApi>(() => ({ startCall, inCall: !!view }), [startCall, view]);

  return (
    <Ctx.Provider value={api}>
      {children}
      {/* Above every screen, so a ring shows wherever the person is. The back gesture is deliberately ignored. */}
      <Modal visible={!!view} animationType="fade" statusBarTranslucent presentationStyle="fullScreen" supportedOrientations={['portrait']} onRequestClose={() => {}}>
        {view ? <CallScreen view={view} actions={actions} /> : null}
      </Modal>
    </Ctx.Provider>
  );
}
