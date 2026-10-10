import type { RealtimeChannel } from '@supabase/supabase-js';
import { MediaStream, RTCIceCandidate, RTCPeerConnection, RTCSessionDescription, mediaDevices } from 'react-native-webrtc';
import { supabase } from './supabase';

/*
 * Thin helpers over react-native-webrtc, and the Realtime channel the two ends of a call (or a
 * broadcaster and their viewers) use to find each other.
 *
 * Media never touches our servers: once the offer, answer and ICE candidates have crossed the
 * channel, audio and video flow phone to phone, or through a TURN relay when a network will not
 * let them through directly.
 */

/**
 * Where phones learn their public address (STUN) and, when a firewall blocks a direct path, a relay
 * to fall back on (TURN). Google's STUN servers and the free Open Relay TURN servers need no
 * account. Open Relay is shared and best effort: for a busy church, a paid TURN plan (Metered,
 * Twilio) can be swapped in here without touching anything else.
 */
export const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
];

export type SessionDescription = { type: 'offer' | 'answer' | 'pranswer' | 'rollback'; sdp: string };
export type IceCandidateInit = { candidate: string; sdpMid?: string | null; sdpMLineIndex?: number | null };

/* ---------- local media ---------- */

/** Opens the microphone, and the camera when `video` is set. Rejects when permission is refused. */
export async function getLocalStream(video: boolean, front = true): Promise<MediaStream> {
  const stream = await mediaDevices.getUserMedia({
    audio: true,
    video: video ? { facingMode: front ? 'user' : 'environment', width: 1280, height: 720, frameRate: 30 } : false,
  });
  return stream as MediaStream;
}

/** Turns the camera and microphone off for good. Call this on every way out of a call. */
export function stopStream(stream: MediaStream | null | undefined) {
  if (!stream) return;
  for (const track of stream.getTracks()) {
    try {
      track.stop();
    } catch {
      // Already stopped.
    }
  }
  try {
    stream.release();
  } catch {
    // Older builds have no release.
  }
}

/** Front or back lens. The track keeps streaming while it swaps, so the other side sees the change at once. */
export function switchCamera(stream: MediaStream | null | undefined) {
  stream?.getVideoTracks().forEach((t) => {
    try {
      (t as any)._switchCamera();
    } catch {
      // No second camera.
    }
  });
}

export function setMicEnabled(stream: MediaStream | null | undefined, on: boolean) {
  stream?.getAudioTracks().forEach((t) => {
    t.enabled = on;
  });
}

export function setCameraEnabled(stream: MediaStream | null | undefined, on: boolean) {
  stream?.getVideoTracks().forEach((t) => {
    t.enabled = on;
  });
}

/**
 * Speakerphone. Routing audio to the loudspeaker needs react-native-incall-manager, which this app
 * does not ship yet, so for now this records the choice and does nothing else: iOS puts a video call
 * on the loudspeaker by itself and a voice call on the earpiece.
 */
export function enableSpeaker(_on: boolean) {
  // No-op until react-native-incall-manager is added.
}

/* ---------- peers ---------- */

export type PeerEvents = {
  onIce: (candidate: IceCandidateInit) => void;
  onTrack: (stream: MediaStream) => void;
  /** 'connected', 'disconnected', 'failed' or 'closed' as the link comes and goes. */
  onState?: (state: string) => void;
};

/** A peer connection using the servers above, with the usual events wired to plain callbacks. */
export function createPeer({ onIce, onTrack, onState }: PeerEvents): RTCPeerConnection {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  pc.addEventListener('icecandidate', (e: any) => {
    if (e?.candidate) onIce(toIceInit(e.candidate));
  });
  pc.addEventListener('track', (e: any) => {
    const stream: MediaStream | undefined = e?.streams?.[0];
    if (stream) onTrack(stream);
  });
  pc.addEventListener('connectionstatechange', () => {
    onState?.(String(pc.connectionState));
  });
  return pc;
}

/** Sends every track of a stream to the other end. */
export function attachStream(pc: RTCPeerConnection, stream: MediaStream) {
  for (const track of stream.getTracks()) pc.addTrack(track, stream);
}

export function closePeer(pc: RTCPeerConnection | null | undefined) {
  if (!pc) return;
  try {
    pc.close();
  } catch {
    // Already closed.
  }
}

function toIceInit(c: any): IceCandidateInit {
  const json = typeof c?.toJSON === 'function' ? c.toJSON() : c;
  return { candidate: String(json?.candidate ?? ''), sdpMid: json?.sdpMid ?? null, sdpMLineIndex: json?.sdpMLineIndex ?? null };
}

/**
 * The offer/answer dance for one peer, with ICE candidates that arrive before the remote description
 * held back until it is set (they often do, since both go over the same channel).
 */
export class PeerSession {
  readonly pc: RTCPeerConnection;
  private pending: IceCandidateInit[] = [];
  private remoteSet = false;

  constructor(events: PeerEvents) {
    this.pc = createPeer(events);
  }

  async makeOffer(): Promise<SessionDescription> {
    const offer = await this.pc.createOffer({});
    await this.pc.setLocalDescription(offer);
    return { type: 'offer', sdp: String(offer.sdp ?? '') };
  }

  async acceptOffer(offer: SessionDescription): Promise<SessionDescription> {
    await this.setRemote(offer);
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    return { type: 'answer', sdp: String(answer.sdp ?? '') };
  }

  async acceptAnswer(answer: SessionDescription) {
    await this.setRemote(answer);
  }

  async addIce(candidate: IceCandidateInit) {
    if (!candidate?.candidate) return;
    if (!this.remoteSet) {
      this.pending.push(candidate);
      return;
    }
    try {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate as any));
    } catch {
      // A candidate for a path that no longer exists; the others will do.
    }
  }

  private async setRemote(desc: SessionDescription) {
    await this.pc.setRemoteDescription(new RTCSessionDescription(desc as any));
    this.remoteSet = true;
    const queued = this.pending;
    this.pending = [];
    for (const c of queued) await this.addIce(c);
  }

  close() {
    closePeer(this.pc);
  }
}

/* ---------- signalling over Realtime ---------- */

export type Handlers = Record<string, (payload: any) => void>;

/**
 * Joins a broadcast channel and resolves once the server has confirmed it, so the first message is
 * never sent into the void. Every phone on the channel gets every message, so payloads carry `to`
 * and `from` ids and each end ignores what is not meant for it.
 *
 * `extra` runs before subscribing, for database-change listeners that must be registered first.
 */
export async function joinChannel(name: string, handlers: Handlers, extra?: (channel: RealtimeChannel) => void): Promise<RealtimeChannel> {
  // The sign-in token first, as the chat does, so the socket is the same one and already signed in.
  await supabase.realtime.setAuth().catch(() => {});
  const channel = supabase.channel(name, { config: { broadcast: { self: false } } });
  for (const [event, fn] of Object.entries(handlers)) {
    channel.on('broadcast', { event }, ({ payload }) => fn(payload ?? {}));
  }
  extra?.(channel);
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('Could not reach the call service. Check your connection and try again.'));
    }, 15000);
    channel.subscribe((status, err) => {
      if (settled) return;
      if (status === 'SUBSCRIBED') {
        settled = true;
        clearTimeout(timer);
        resolve();
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        settled = true;
        clearTimeout(timer);
        reject(err ?? new Error('Could not reach the call service. Check your connection and try again.'));
      }
    });
  }).catch((e) => {
    supabase.removeChannel(channel).catch(() => {});
    throw e;
  });
  return channel;
}

export function send(channel: RealtimeChannel | null | undefined, event: string, payload: Record<string, unknown>) {
  if (!channel) return Promise.resolve();
  return channel.send({ type: 'broadcast', event, payload }).catch(() => {});
}

export function leaveChannel(channel: RealtimeChannel | null | undefined) {
  if (!channel) return;
  supabase.removeChannel(channel).catch(() => {});
}
