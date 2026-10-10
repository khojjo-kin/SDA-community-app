// The call screen for desktop. The shared src/lib/calls.tsx (the same code the iPhone runs) owns
// the call and tells this screen what to draw; this file only draws it and wires the buttons.
import React, { useEffect, useRef, useState } from 'react';
import { Avatar, Icon, type IconName, Verified } from './kit';

export type Person = { id: string; username: string; full_name: string; avatar_url: string; verified?: boolean };
export type CallPhase = 'incoming' | 'calling' | 'connecting' | 'connected' | 'ended';
export type CallView = {
  kind: 'voice' | 'video';
  role: 'caller' | 'callee';
  phase: CallPhase;
  note: string;
  other: Person | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  muted: boolean;
  cameraOff: boolean;
  speaker: boolean;
  front: boolean;
  connectedAt: number | null;
};
export type CallActions = {
  accept: () => void;
  decline: () => void;
  hangUp: () => void;
  toggleMute: () => void;
  toggleCamera: () => void;
  flip: () => void;
  toggleSpeaker: () => void;
};

function Stream({ stream, muted, mirror, className }: { stream: MediaStream | null; muted?: boolean; mirror?: boolean; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream;
  }, [stream]);
  return <video ref={ref} className={className} autoPlay playsInline muted={muted} style={mirror ? { transform: 'scaleX(-1)' } : undefined} />;
}

function Clock({ since }: { since: number }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const s = Math.max(0, Math.floor((Date.now() - since) / 1000));
  return <>{Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0')}</>;
}

function Round({ icon, label, onClick, danger, accept, on }: { icon: IconName; label: string; onClick: () => void; danger?: boolean; accept?: boolean; on?: boolean }) {
  return (
    <button className={'call-btn' + (danger ? ' danger' : '') + (accept ? ' accept' : '') + (on ? ' on' : '')} onClick={onClick} aria-label={label} title={label}>
      <Icon name={icon} size={26} color={on ? '#0b1014' : '#fff'} />
      <span>{label}</span>
    </button>
  );
}

/** A short ring while a call is coming in, made with the Web Audio API (no sound file needed). */
function useRingTone(on: boolean) {
  useEffect(() => {
    if (!on) return;
    let ctx: AudioContext | null = null;
    try {
      ctx = new AudioContext();
    } catch {
      return;
    }
    const beep = () => {
      if (!ctx) return;
      for (const [freq, at] of [[440, 0], [480, 0], [440, 0.45], [480, 0.45]] as const) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, ctx.currentTime + at);
        g.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + at + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.38);
        o.connect(g).connect(ctx.destination);
        o.start(ctx.currentTime + at);
        o.stop(ctx.currentTime + at + 0.4);
      }
    };
    beep();
    const t = setInterval(beep, 3000);
    return () => {
      clearInterval(t);
      ctx?.close().catch(() => {});
    };
  }, [on]);
}

export function CallScreen({ view, actions }: { view: CallView; actions: CallActions }) {
  const other = view.other;
  const name = other?.full_name || other?.username || '';
  const video = view.kind === 'video';
  const showRemote = video && view.remoteStream && view.phase === 'connected';
  useRingTone(view.phase === 'incoming');
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && view.phase !== 'incoming') actions.hangUp();
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [view.phase]);
  const status =
    view.phase === 'connected' && view.connectedAt && !view.note ? <Clock since={view.connectedAt} /> : view.note || (view.phase === 'incoming' ? (video ? 'Incoming video call' : 'Incoming voice call') : '');
  return (
    <div className={'call-screen' + (showRemote ? ' has-video' : '')} role="dialog" aria-label={'Call with ' + name}>
      {showRemote ? <Stream stream={view.remoteStream} className="call-remote" /> : <div className="call-backdrop" style={other?.avatar_url ? { backgroundImage: `url(${other.avatar_url})` } : undefined} />}
      {/* Voice calls still need the other person's audio to play. */}
      {!showRemote && view.remoteStream ? <Stream stream={view.remoteStream} className="call-hidden" /> : null}
      <div className="call-who">
        {!showRemote ? <Avatar src={other?.avatar_url} name={other?.username || '?'} size={120} /> : null}
        <h2>
          {name || 'Connecting…'}
          {other?.verified ? <Verified size={18} /> : null}
        </h2>
        <p>{status}</p>
      </div>
      {video && view.localStream && view.phase !== 'ended' ? <Stream stream={view.localStream} muted mirror className={'call-self' + (view.cameraOff ? ' off' : '')} /> : null}
      <div className="call-actions">
        {view.phase === 'incoming' ? (
          <>
            <Round icon="endcall" label="Decline" danger onClick={actions.decline} />
            <Round icon={video ? 'video' : 'phone'} label="Accept" accept onClick={actions.accept} />
          </>
        ) : view.phase === 'ended' ? (
          <Round icon="close" label="Close" onClick={actions.hangUp} />
        ) : (
          <>
            <Round icon={view.muted ? 'micoff' : 'mic'} label={view.muted ? 'Unmute' : 'Mute'} on={view.muted} onClick={actions.toggleMute} />
            {video ? <Round icon={view.cameraOff ? 'videooff' : 'video'} label={view.cameraOff ? 'Camera on' : 'Camera off'} on={view.cameraOff} onClick={actions.toggleCamera} /> : null}
            <Round icon="endcall" label="End" danger onClick={actions.hangUp} />
          </>
        )}
      </div>
    </div>
  );
}
