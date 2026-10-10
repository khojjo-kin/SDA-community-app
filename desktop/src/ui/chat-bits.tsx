// The pieces a chat is drawn from: how messages become rows (time stamps, groups, "Seen"), and each
// kind of bubble: text, photos (one, or a small pile sent together), shared posts, voice messages,
// call logs, view-once photos and screenshot notices; and recording a voice message. The same rules
// as the iPhone's chat (app/(app)/chat/[id].tsx).
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ONLINE_MS, uploadAudio } from 'shared/api';
import { getPostNow } from 'shared/store';
import { MEDIA_BUCKET, supabase } from 'shared/supabase';
import { clock, dayLabel } from 'shared/theme';
import type { Message } from 'shared/types';
import { dateLocale, languageCode, t, tn } from '../lib/i18n';
import { Avatar, Icon, Spinner } from './kit';

// The shared errText (src/lib/theme.ts) reads React Native's __DEV__, which the desktop build doesn't
// define, so showing any error would throw. Until build.mjs defines it, give it a value here.
if (typeof (globalThis as any).__DEV__ === 'undefined') (globalThis as any).__DEV__ = false;

/* ---------- drafts: words waiting in a chat's message box (a reply to a note, say) ---------- */

const drafts = new Map<string, string>();
export function setDraft(threadId: string, text: string) {
  drafts.set(threadId, text);
}
export function takeDraft(threadId: string): string {
  const d = drafts.get(threadId) ?? '';
  drafts.delete(threadId);
  return d;
}

/* ---------- rows ---------- */

export type RowKind = 'stamp' | 'text' | 'post' | 'photo' | 'voice' | 'call' | 'snap' | 'notice';
export type Row = {
  key: string;
  kind: RowKind;
  mine: boolean;
  m: Message;
  label?: string;
  big?: boolean;
  /** A photo row: every photo in it (several sent one after another become one pile). */
  urls?: string[];
  /** Joined to the row above / below from the same person (no stamp in between): rounder corners outside only. */
  joinPrev?: boolean;
  joinNext?: boolean;
  seen?: boolean;
};

export const emojiOnly = (s: string) => /^\p{Extended_Pictographic}(\u{FE0F}|\u{200D}\p{Extended_Pictographic})*(\s*\p{Extended_Pictographic}(\u{FE0F}|\u{200D}\p{Extended_Pictographic})*){0,2}$/u.test(s.trim());

const sameDay = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString();

/** Photos sent one after another within this long, with nothing in between, become one pile (as on the iPhone). */
const PILE_GAP_MS = 180e3;
const PILE_MAX = 10;

/**
 * Messages (oldest first) as rows: a stamp when the day changes or after an hour's quiet, then the
 * message's pieces. "Seen" goes under the last thing you sent, once the other person has read it
 * (never under a view-once photo, whose own "Opened" says it).
 */
export function buildRows(messages: Message[], me: string, theirRead: string | null): Row[] {
  const rows: Row[] = [];
  let prevAt = 0;
  let pileAt = 0;
  for (const m of messages) {
    const at = new Date(m.created_at).getTime();
    const mine = m.sender_id === me;
    if (!prevAt || at - prevAt > 3600e3 || !sameDay(at, prevAt)) rows.push({ key: 's' + m.id, kind: 'stamp', mine, m, label: stampOf(m.created_at) });
    prevAt = at;
    if (m.system === 'screenshot') {
      rows.push({ key: m.id, kind: 'notice', mine, m });
      continue;
    }
    if (m.view_once) {
      rows.push({ key: m.id, kind: 'snap', mine, m });
      continue;
    }
    if (m.call_kind || m.call_url) {
      rows.push({ key: m.id, kind: 'call', mine, m });
      continue;
    }
    if (m.audio_url) {
      rows.push({ key: m.id, kind: 'voice', mine, m });
      continue;
    }
    const words = m.text.trim();
    const plain = words && !(m.post_id && words === 'Sent a post') && !(m.media_url && words === 'Sent a photo');
    if (m.post_id) rows.push({ key: 'p' + m.id, kind: 'post', mine, m });
    if (m.media_url) {
      const last = rows[rows.length - 1];
      if (!plain && !m.post_id && last?.kind === 'photo' && last.mine === mine && at - pileAt < PILE_GAP_MS && (last.urls?.length ?? 0) < PILE_MAX) last.urls!.push(m.media_url);
      else rows.push({ key: 'i' + m.id, kind: 'photo', mine, m, urls: [m.media_url] });
      pileAt = at;
    }
    if (plain) rows.push({ key: m.id, kind: 'text', mine, m, big: emojiOnly(words) });
  }
  // Groups: consecutive bubbles from the same person share their inner corners.
  const groupable = (r?: Row) => !!r && r.kind !== 'stamp' && r.kind !== 'notice';
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!groupable(r)) continue;
    const a = rows[i - 1];
    const b = rows[i + 1];
    r.joinPrev = groupable(a) && a.mine === r.mine;
    r.joinNext = groupable(b) && b.mine === r.mine;
  }
  if (theirRead) {
    const last = [...messages].reverse().find((m) => m.sender_id === me && m.system !== 'screenshot');
    if (last && !last.view_once && new Date(theirRead).getTime() >= new Date(last.created_at).getTime()) {
      const r = [...rows].reverse().find((x) => x.kind !== 'stamp' && x.kind !== 'notice');
      if (r && r.mine) r.seen = true;
    }
  }
  return rows;
}

/** "08:24" */
export function timeOf(iso: string): string {
  const d = new Date(iso);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

/* ---------- times, in the app's language (the iPhone's chatStamp, ago, agoLong and activeLabel) ---------- */

/** The line between groups of messages: "TODAY AT 08:24", "21 MAR AT 06:14", "21 MAR 2025 AT 06:14". */
export function stampOf(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const time = timeOf(iso);
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(d)) / 86400e3);
  if (days === 0) return t('d.messages.stampToday', { time });
  if (days === 1) return t('d.messages.stampYesterday', { time });
  const thisYear = d.getFullYear() === now.getFullYear();
  // English keeps the iPhone's own short months ("21 Mar"); other languages take the browser's names.
  const date =
    languageCode() === 'en'
      ? dayLabel(d) + (thisYear ? '' : ' ' + d.getFullYear())
      : d.toLocaleDateString(dateLocale(), thisYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
  return t('d.messages.stampDate', { date: date.toLocaleUpperCase(dateLocale()), time });
}

/** How long ago, short: "now", "5m", "3h", "2d", "1w". */
export function shortAgo(iso: string): string {
  const d = Math.max(0, Date.now() - new Date(iso).getTime());
  if (d < 60e3) return t('d.messages.agoNow');
  if (d < 3600e3) return t('d.messages.agoMinutes', { count: Math.floor(d / 60e3) });
  if (d < 86400e3) return t('d.messages.agoHours', { count: Math.floor(d / 3600e3) });
  if (d < 7 * 86400e3) return t('d.messages.agoDays', { count: Math.floor(d / 86400e3) });
  return t('d.messages.agoWeeks', { count: Math.floor(d / (7 * 86400e3)) });
}

/** How long ago, written out: "Just now", "5 minutes ago", "1 day ago". */
export function longAgo(iso: string): string {
  const d = Math.max(0, Date.now() - new Date(iso).getTime());
  if (d < 60e3) return t('d.messages.justNow');
  if (d < 3600e3) return tn('d.messages.minutesAgo', Math.floor(d / 60e3));
  if (d < 86400e3) return tn('d.messages.hoursAgo', Math.floor(d / 3600e3));
  if (d < 7 * 86400e3) return tn('d.messages.daysAgo', Math.floor(d / 86400e3));
  return tn('d.messages.weeksAgo', Math.floor(d / (7 * 86400e3)));
}

/** "Active now", "Active 5m ago", "Active yesterday"… or '' when unknown or longer ago. */
export function activeWords(activeAt: string | null | undefined): string {
  if (!activeAt) return '';
  const d = Date.now() - new Date(activeAt).getTime();
  if (d < ONLINE_MS) return t('common.activeNow');
  if (d < 3600e3) return t('d.messages.activeMinutes', { count: Math.round(d / 60e3) });
  if (d < 86400e3) return t('d.messages.activeHours', { count: Math.round(d / 3600e3) });
  if (d < 2 * 86400e3) return t('d.messages.activeYesterday');
  return '';
}

/** "Grace" from "Grace Mensah"; the username when there is no name. */
export function firstName(p: { full_name?: string | null; username: string }): string {
  return (p.full_name || '').trim().split(/\s+/)[0] || p.username;
}

/* ---------- small bubbles ---------- */

/** Three dots in a grey bubble: the other person is typing (or Erha is thinking). */
export function TypingBubble() {
  return (
    <span className="bubble typing" aria-label={t('d.messages.typing')}>
      <i />
      <i />
      <i />
    </span>
  );
}

/** "Grace took a screenshot of the chat": a quiet line across the middle, not a bubble. */
export function ScreenshotLine({ mine, name }: { mine: boolean; name: string }) {
  const words = mine ? t('d.messages.youScreenshot') : t('d.messages.theyScreenshot', { name });
  return (
    <div className="cv-notice" role="note">
      <Icon name="camera" size={14} stroke={2} />
      <span>{words}</span>
    </div>
  );
}

/** A call noted in the chat ("Video call · 3 min", "Missed voice call"); Call back starts a new one. */
export function CallLog({ m, mine, onCall }: { m: Message; mine: boolean; onCall?: () => void }) {
  const video = m.call_kind === 'video';
  const title = m.text.trim() || t(video ? 'd.messages.videoCall' : 'd.messages.voiceCall');
  const missed = !mine && /\/(missed|declined)$/.test(m.call_url);
  // Older calls were a meeting room link both people opened.
  const room = m.call_url.startsWith('https://');
  return (
    <span className={'bubble call' + (mine ? ' mine' : '') + (missed ? ' missed' : '')}>
      <span className="cv-call-icon">
        <Icon name={video ? 'video' : 'phone'} size={20} />
      </span>
      <span className="cv-call-text">
        <b>{title}</b>
        <span>{timeOf(m.created_at)}</span>
      </span>
      {room ? (
        <a className="cv-call-btn" href={m.call_url} target="_blank" rel="noreferrer">
          {t('d.messages.join')}
        </a>
      ) : onCall ? (
        <button type="button" className="cv-call-btn" onClick={onCall}>
          {t('d.messages.callBack')}
        </button>
      ) : null}
    </span>
  );
}

/** A post shared into the chat. */
export function SharedPost({ id, onOpen }: { id: string; onOpen: (id: string) => void }) {
  const p = getPostNow(id);
  if (!p) return <span className="bubble">{t('d.messages.postGone')}</span>;
  const cover = p.media[0]?.type === 'video' ? p.media[0].poster : p.media[0]?.url;
  return (
    <button className="shared-post" onClick={() => onOpen(p.id)}>
      <span className="sp-head">
        <Avatar src={p.avatar_url} name={p.username} size={24} />
        <b>{p.username}</b>
      </span>
      {cover ? <img src={cover} alt="" /> : null}
      {p.caption ? (
        <span className="sp-cap">
          <b>{p.username}</b> {p.caption}
        </span>
      ) : null}
    </button>
  );
}

/* ---------- voice messages ---------- */

// Only one voice message plays at a time.
let playingVoice: HTMLAudioElement | null = null;

/** Stops whichever voice message is playing (before recording one, or a call). */
export function pauseVoice() {
  playingVoice?.pause();
  playingVoice = null;
}

/** A fixed, made-up waveform for a message, so each voice message has its own shape. */
function bars(id: string, n = 28): number[] {
  let h = 2166136261;
  for (const ch of id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    out.push(0.25 + (((h >>> 0) % 1000) / 1000) * 0.75);
  }
  return out;
}

/** `locked` while you are recording: playing a message then would be recorded too (as on the iPhone). */
export function VoiceMessage({ m, mine, locked }: { m: Message; mine: boolean; locked?: boolean }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState({ t: 0, d: m.audio_seconds || 0 });
  useEffect(
    () => () => {
      audio.current?.pause();
      if (playingVoice === audio.current) playingVoice = null;
    },
    [],
  );
  const toggle = () => {
    let a = audio.current;
    if (!a) {
      a = new Audio(m.audio_url);
      a.preload = 'auto';
      a.addEventListener('timeupdate', () => setPos((p) => ({ t: a!.currentTime, d: isFinite(a!.duration) && a!.duration > 0 ? a!.duration : p.d })));
      a.addEventListener('play', () => setPlaying(true));
      a.addEventListener('pause', () => setPlaying(false));
      a.addEventListener('ended', () => {
        setPlaying(false);
        setPos((p) => ({ ...p, t: 0 }));
      });
      audio.current = a;
    }
    if (a.paused) {
      if (locked) return;
      if (playingVoice && playingVoice !== a) playingVoice.pause();
      playingVoice = a;
      a.play().catch(() => setPlaying(false));
    } else a.pause();
  };
  const shape = bars(m.id);
  const done = pos.d ? pos.t / pos.d : 0;
  return (
    <span className={'bubble voice' + (mine ? ' mine' : '')}>
      <button type="button" className="cv-voice-play" onClick={toggle} disabled={locked && !playing} aria-label={t(playing ? 'd.messages.pauseVoice' : 'd.messages.playVoice')}>
        <Icon name={playing ? 'pause' : 'play'} size={16} />
      </button>
      <span className="cv-wave" aria-hidden="true">
        {shape.map((v, i) => (
          <i key={i} className={i / shape.length < done ? 'on' : ''} style={{ height: Math.round(v * 22) }} />
        ))}
      </span>
      <span className="cv-voice-time">{clock(playing || pos.t ? Math.max(0, pos.d - pos.t) : pos.d)}</span>
    </span>
  );
}

/* ---------- recording a voice message ---------- */

/** The iPhone's rules: two minutes at most (it sends itself at the limit), and nothing shorter than 0.8 s. */
export const VOICE_LIMIT_MS = 120000;
export const VOICE_MIN_MS = 800;
/** A WAV file, when this computer can't record AAC: speech quality, mono, about 44 KB a second. */
const WAV_RATE = 22050;

/** A finished recording: AAC in MP4 (stored as .m4a, like the iPhone's), or WAV. Both play on an iPhone. */
export type VoiceClip = { blob: Blob; ms: number; kind: 'm4a' | 'wav' };

// Hands the microphone's samples to the page, a small block at a time (for the WAV file).
const TAP_WORKLET = "registerProcessor('community-voice-tap', class extends AudioWorkletProcessor { process(inputs) { const ch = inputs[0] && inputs[0][0]; if (ch) this.port.postMessage(ch.slice(0)); return true; } });";

/**
 * Records the microphone. AAC in MP4 when this computer can make it (Electron and Chrome on a Mac
 * can), as the iPhone app's own recordings are, so an iPhone plays it. Otherwise the samples are
 * kept and saved as a WAV file, which an iPhone also plays. It also measures how loud the
 * microphone is, for the moving bars while you record.
 */
export class VoiceRecorder {
  private stream: MediaStream | null = null;
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private nodes: AudioNode[] = [];
  private pcm: Float32Array[] | null = null;
  private startedAt = 0;
  // True when the browser said outright that it records AAC, so the MP4 needs no checking.
  private aacSure = false;
  private done = false;

  async start() {
    const md = navigator.mediaDevices;
    if (!md?.getUserMedia) throw new Error(t('d.messages.cantRecord'));
    const stream = await md.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    this.stream = stream;
    if (this.done) return this.release();
    // "audio/mp4" without a codec can hold Opus (Chromium without AAC does that), which an iPhone may
    // not play: that recording is checked when it ends, and a WAV is made alongside in case.
    const can = (t: string) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t);
    const type = can('audio/mp4;codecs=mp4a.40.2') ? 'audio/mp4;codecs=mp4a.40.2' : can('audio/mp4') ? 'audio/mp4' : '';
    this.aacSure = type === 'audio/mp4;codecs=mp4a.40.2';
    if (type) {
      try {
        const rec = new MediaRecorder(stream, { mimeType: type, audioBitsPerSecond: 64000 });
        rec.ondataavailable = (e) => {
          if (e.data.size) this.chunks.push(e.data);
        };
        rec.start();
        this.rec = rec;
      } catch {
        this.rec = null;
        this.aacSure = false;
      }
    }
    await this.listen(!this.aacSure);
    if (!this.rec && !this.pcm) {
      this.release();
      throw new Error(t('d.messages.cantRecord'));
    }
    this.startedAt = performance.now();
  }

  /** Taps the microphone for its loudness and, when `keep`, its samples. */
  private async listen(keep: boolean) {
    const AC: typeof AudioContext | undefined = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!AC || !this.stream) return;
    let ctx: AudioContext | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    // At the WAV's own rate when the browser allows it; otherwise at the computer's, converted when saved.
    for (const opts of [{ sampleRate: WAV_RATE }, undefined]) {
      try {
        ctx = new AC(opts);
        source = ctx.createMediaStreamSource(this.stream);
        break;
      } catch {
        ctx?.close().catch(() => {});
        ctx = null;
      }
    }
    if (!ctx || !source) return;
    this.ctx = ctx;
    if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    this.analyser = analyser;
    this.nodes.push(source, analyser);
    if (!keep) return;
    const pcm: Float32Array[] = [];
    try {
      const url = URL.createObjectURL(new Blob([TAP_WORKLET], { type: 'text/javascript' }));
      try {
        await ctx.audioWorklet.addModule(url);
      } finally {
        URL.revokeObjectURL(url);
      }
      const tap = new AudioWorkletNode(ctx, 'community-voice-tap');
      tap.port.onmessage = (e) => {
        if (!this.done) pcm.push(e.data as Float32Array);
      };
      source.connect(tap);
      this.nodes.push(tap);
    } catch {
      // Without audio worklets, the older script processor does the same job.
      const sp = ctx.createScriptProcessor(4096, 1, 1);
      sp.onaudioprocess = (e) => {
        if (!this.done) pcm.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      };
      const silent = ctx.createGain();
      silent.gain.value = 0;
      source.connect(sp);
      sp.connect(silent);
      silent.connect(ctx.destination);
      this.nodes.push(sp, silent);
    }
    this.pcm = pcm;
  }

  /** How long it has been recording, in milliseconds. */
  elapsed(): number {
    return this.startedAt ? performance.now() - this.startedAt : 0;
  }

  /** How loud the microphone is now, 0 to 1. */
  level(): number {
    const a = this.analyser;
    if (!a) return 0.3;
    const buf = new Float32Array(a.fftSize);
    a.getFloatTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    return Math.min(1, Math.sqrt(Math.sqrt(sum / buf.length)) * 1.6);
  }

  /** Stops and hands back the recording. */
  async stop(): Promise<VoiceClip> {
    const ms = this.elapsed();
    this.done = true;
    const rec = this.rec;
    let mp4: Blob | null = null;
    if (rec && rec.state !== 'inactive') {
      mp4 = await new Promise<Blob>((resolve) => {
        rec.onstop = () => resolve(new Blob(this.chunks, { type: 'audio/mp4' }));
        rec.stop();
      });
    }
    const pcm = this.pcm;
    const rate = this.ctx?.sampleRate ?? WAV_RATE;
    this.release();
    if (mp4 && mp4.size > 0 && (this.aacSure || (await holdsAac(mp4)))) return { blob: mp4, ms, kind: 'm4a' };
    if (pcm?.length) return { blob: wavFrom(pcm, rate), ms, kind: 'wav' };
    throw new Error(t('d.messages.recordingFailed'));
  }

  /** Stops and throws the recording away. */
  cancel() {
    this.done = true;
    try {
      if (this.rec && this.rec.state !== 'inactive') this.rec.stop();
    } catch {
      // already stopped
    }
    this.release();
  }

  /** Lets go of the microphone (the computer's microphone light goes out). */
  private release() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    for (const n of this.nodes) {
      try {
        n.disconnect();
      } catch {
        // not connected
      }
    }
    this.nodes = [];
    this.analyser = null;
    this.ctx?.close().catch(() => {});
    this.ctx = null;
  }
}

/** True when an MP4 recording holds AAC (its "mp4a" sample entry), rather than another codec. */
async function holdsAac(blob: Blob): Promise<boolean> {
  const head = new Uint8Array(await blob.slice(0, 65536).arrayBuffer());
  for (let i = 0; i + 3 < head.length; i++) if (head[i] === 0x6d && head[i + 1] === 0x70 && head[i + 2] === 0x34 && head[i + 3] === 0x61) return true;
  return false;
}

/** The samples as a WAV file: 16-bit mono PCM at WAV_RATE. */
function wavFrom(chunks: Float32Array[], rate: number): Blob {
  let total = 0;
  for (const c of chunks) total += c.length;
  let samples = new Float32Array(total);
  let at = 0;
  for (const c of chunks) {
    samples.set(c, at);
    at += c.length;
  }
  if (rate !== WAV_RATE) samples = resample(samples, rate, WAV_RATE);
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const word = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  word(0, 'RIFF');
  v.setUint32(4, 36 + samples.length * 2, true);
  word(8, 'WAVE');
  word(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, WAV_RATE, true);
  v.setUint32(28, WAV_RATE * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  word(36, 'data');
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buf], { type: 'audio/wav' });
}

/** Changes the sample rate; going down, each new sample is the average of those it covers. */
function resample(input: Float32Array, from: number, to: number): Float32Array {
  const ratio = from / to;
  const out = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const a = Math.floor(i * ratio);
    const b = Math.min(input.length, Math.max(a + 1, Math.floor((i + 1) * ratio)));
    let sum = 0;
    for (let j = a; j < b; j++) sum += input[j];
    out[i] = sum / (b - a);
  }
  return out;
}

/**
 * Uploads a recording and returns its address. AAC goes through the shared uploadAudio (an .m4a,
 * audio/mp4, as the iPhone's). WAV goes to the same bucket and folder the shared upload uses, named
 * .wav with its own type: it is never labelled audio/mp4.
 */
export async function uploadVoice(me: string, clip: VoiceClip): Promise<string> {
  if (clip.kind === 'm4a') {
    const url = URL.createObjectURL(clip.blob);
    try {
      return await uploadAudio(me, url);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  const path = `${me}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.wav`;
  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, clip.blob, { contentType: 'audio/wav', upsert: false });
  if (error) throw error;
  return supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Puts a microphone problem into words. */
export function micProblem(e: unknown): string {
  const name = (e as { name?: string } | null)?.name ?? '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return t('d.messages.micOff');
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return t('d.messages.noMic');
  if (name === 'NotReadableError' || name === 'AbortError') return t('d.messages.micBusy');
  return (e as Error)?.message || t('d.messages.recordingDidNotStart');
}

export type RecPhase = 'starting' | 'recording' | 'sending' | 'failed';
const REC_BARS = 48;

/**
 * Takes the place of the message box while you record: discard, a red dot with the microphone's
 * level drawn as moving bars and the time, then send. After a failed send it offers to try again.
 */
export function RecordingBar({ phase, ms, levels, onDiscard, onSend }: { phase: RecPhase; ms: number; levels: number[]; onDiscard: () => void; onSend: () => void }) {
  const bars = Array.from({ length: REC_BARS }, (_, i) => levels[levels.length - REC_BARS + i] ?? 0);
  const near = phase === 'recording' && ms >= VOICE_LIMIT_MS - 15e3;
  const status = phase === 'starting' ? t('d.messages.starting') : phase === 'sending' ? t('d.messages.sending') : phase === 'failed' ? t('d.messages.didNotSend') : clock(ms / 1000);
  return (
    <div className={'cv-rec' + (phase === 'failed' ? ' failed' : '')} role="group" aria-label={t('d.messages.voiceMessage')}>
      <button type="button" className="cv-round quiet" aria-label={t('d.messages.discardRecording')} title={t('d.messages.discardKey')} disabled={phase === 'sending'} onClick={onDiscard}>
        <Icon name="trash" size={17} />
      </button>
      <span className="cv-rec-pill">
        <i className={'cv-rec-dot' + (phase === 'recording' ? ' on' : '')} aria-hidden="true" />
        <span className="cv-rec-wave" aria-hidden="true">
          {bars.map((v, i) => (
            <i key={i} style={{ height: 3 + Math.round(v * 22) }} />
          ))}
        </span>
        <span className={'cv-rec-time' + (near ? ' near' : '')} role="timer" title={near ? t('d.messages.voiceLimit') : undefined}>
          {status}
        </span>
      </span>
      <button type="button" className="cv-round accent" aria-label={t(phase === 'failed' ? 'd.messages.trySendAgain' : 'd.messages.sendVoice')} title={t('d.messages.sendKey')} disabled={phase === 'starting' || phase === 'sending'} onClick={onSend}>
        {phase === 'sending' ? <span className="cv-mini-spin" /> : <Icon name="send" size={16} />}
      </button>
    </div>
  );
}

/* ---------- photos ---------- */

/** One photo, or several sent together fanned out like a small pile of prints (as on the iPhone). */
export function PhotoPile({ urls, onOpen, onLoad }: { urls: string[]; onOpen: () => void; onLoad?: () => void }) {
  if (urls.length < 2) {
    return (
      <button type="button" className="msg-photo" onClick={onOpen} aria-label={t('snap.photo')}>
        <img src={urls[0]} alt="" onLoad={onLoad} />
      </button>
    );
  }
  return (
    <button type="button" className="msg-photo cv-pile" onClick={onOpen} aria-label={t('create.photos', { count: urls.length })}>
      <img src={urls[0]} alt="" className="cv-pile-a" onLoad={onLoad} />
      <img src={urls[1]} alt="" className="cv-pile-b" onLoad={onLoad} />
      {urls.length > 2 ? <span className="cv-pile-more">+{urls.length - 2}</span> : null}
    </button>
  );
}

/**
 * Photos from the chat, full window and always dark: step through a pile with the arrows (or the
 * keyboard), save one to the computer, or forward them.
 */
export function PhotoViewer({ urls, onClose, onForward }: { urls: string[]; onClose: () => void; onForward?: () => void }) {
  const [at, setAt] = useState(0);
  const many = urls.length > 1;
  const step = (d: number) => setAt((i) => Math.min(urls.length - 1, Math.max(0, i + d)));
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') step(-1);
      if (e.key === 'ArrowRight') step(1);
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [urls.length, onClose]);
  const save = async () => {
    const url = urls[at];
    try {
      const blob = await (await fetch(url)).blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = `community-photo-${Date.now()}.${blob.type === 'image/png' ? 'png' : 'jpg'}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 5000);
    } catch {
      // Not readable from here (another site's photo): open it, to save from there.
      window.open(url, '_blank', 'noopener');
    }
  };
  return createPortal(
    <div className="cv-viewer" role="dialog" aria-modal="true" aria-label={t('snap.photo')} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cv-viewer-top">
        <span className="cv-viewer-count">{many ? t('d.messages.nOf', { n: at + 1, total: urls.length }) : ''}</span>
        <button type="button" className="icon-btn" aria-label={t('d.messages.savePhoto')} title={t('d.messages.savePhoto')} onClick={save}>
          <Icon name="download" size={22} color="#fff" />
        </button>
        {onForward ? (
          <button type="button" className="icon-btn" aria-label={t('d.messages.forward')} title={t('d.messages.forward')} onClick={onForward}>
            <Icon name="send" size={22} color="#fff" />
          </button>
        ) : null}
        <button type="button" className="icon-btn" aria-label={t('common.close')} onClick={onClose}>
          <Icon name="close" size={26} color="#fff" />
        </button>
      </div>
      <img key={urls[at]} src={urls[at]} alt={many ? t('d.messages.photoOf', { n: at + 1, total: urls.length }) : t('snap.photo')} />
      {many && at > 0 ? (
        <button type="button" className="cv-viewer-step prev" aria-label={t('d.messages.previousPhoto')} onClick={() => step(-1)}>
          <Icon name="back" size={20} stroke={2.4} />
        </button>
      ) : null}
      {many && at < urls.length - 1 ? (
        <button type="button" className="cv-viewer-step next" aria-label={t('d.messages.nextPhoto')} onClick={() => step(1)}>
          <Icon name="right" size={20} stroke={2.4} />
        </button>
      ) : null}
    </div>,
    document.body,
  );
}

/* ---------- view-once photos ---------- */

/** The view-once mark, our own: a "1" in a ring. */
export function OnceMark({ size = 20, on }: { size?: number; on?: boolean }) {
  return (
    <span className={'cv-once' + (on ? ' on' : '')} style={{ width: size, height: size, fontSize: size * 0.56 }} aria-hidden="true">
      1
    </span>
  );
}

/**
 * A view-once photo in the chat. It is never drawn as a photo here.
 * Sent to you and waiting: a filled square, "Photo", "View once". Opened: "Opened".
 * Sent by you: "Delivered" until they open it, then "Opened". You can't open your own.
 */
export function SnapBubble({ mine, opened, onOpen }: { mine: boolean; opened: boolean; onOpen?: () => void }) {
  const waiting = !mine && !opened;
  const status = t(waiting ? 'snap.viewOnce' : opened ? 'snap.opened' : 'snap.delivered');
  return (
    <button type="button" className={'cv-snap' + (mine ? ' mine' : '') + (waiting ? ' waiting' : '')} onClick={waiting ? onOpen : undefined} disabled={!waiting} aria-label={t('snap.bubbleLabel', { status: waiting ? t('d.messages.clickToView') : status })}>
      <span className={'cv-snap-square' + (waiting ? ' filled' : '')}>{waiting ? '1' : null}</span>
      <span className="cv-snap-text">
        <b>{t('snap.photo')}</b>
        <span>{waiting ? t('d.messages.viewOnceClick') : status}</span>
      </span>
    </button>
  );
}

/**
 * The view-once photo, full window. Always black, whatever the theme. It counts as opened from the
 * moment the server handed over its address; nothing offers to save or forward it.
 */
export function SnapViewer({ url, onClose }: { url: string; onClose: () => void }) {
  const [state, setState] = useState<'loading' | 'shown' | 'failed'>('loading');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [onClose]);
  return createPortal(
    <div className="cv-snapview" role="dialog" aria-modal="true" aria-label={t('snap.viewOncePhoto')} onContextMenu={(e) => e.preventDefault()}>
      <div className="cv-snapview-top">
        <span className="cv-snapview-bar">
          <i style={{ width: state === 'shown' ? '100%' : '0%' }} />
        </span>
        <span className="cv-snapview-row">
          <OnceMark size={22} />
          <b>{t('snap.viewOnce')}</b>
          <button type="button" className="icon-btn" aria-label={t('common.close')} onClick={onClose}>
            <Icon name="close" size={26} color="#fff" />
          </button>
        </span>
      </div>
      <img key={attempt} src={url} alt={t('snap.viewOncePhoto')} draggable={false} onLoad={() => setState('shown')} onError={() => setState('failed')} />
      {state === 'loading' ? <Spinner /> : null}
      {state === 'failed' ? (
        <div className="cv-snapview-failed">
          <b>{t('snap.didNotLoad')}</b>
          <span>{t('snap.didNotLoadBody')}</span>
          <button
            type="button"
            className="btn quiet"
            onClick={() => {
              setState('loading');
              setAttempt((n) => n + 1);
            }}
          >
            {t('common.tryAgain')}
          </button>
        </div>
      ) : null}
    </div>,
    document.body,
  );
}

/* ---------- emoji ---------- */

/** Quick reactions first (the iPhone's tray), then a few more. */
export const EMOJI = ['❤️', '😂', '😮', '😢', '😡', '👍', '🔥', '🙏', '🎉', '👏', '😊', '😍', '🥰', '😅', '🤗', '🙌', '💯', '✨', '🎶', '📖', '⛪', '🌅', '🕊️', '💚'];

export function EmojiPop({ onPick, onClose }: { onPick: (e: string) => void; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const down = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const t = setTimeout(() => document.addEventListener('mousedown', down), 0);
    document.addEventListener('keydown', key);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', down);
      document.removeEventListener('keydown', key);
    };
  }, [onClose]);
  return (
    <div className="cv-emoji" ref={box} role="menu" aria-label={t('d.messages.emoji')}>
      {EMOJI.map((e) => (
        <button key={e} type="button" role="menuitem" onClick={() => onPick(e)}>
          {e}
        </button>
      ))}
    </div>
  );
}
