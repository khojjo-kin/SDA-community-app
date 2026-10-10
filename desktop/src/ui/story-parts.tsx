// The pieces the story editor is made of that are not screens: the iPhone app's colours, backgrounds
// and stickers (src/components/StoryCanvas.tsx and app/(app)/story-editor.tsx), reading files from
// the computer, baking a filter into a photo, how text, stickers and mentions look on a story, and
// turning a finished story into the items the shared addStory() saves.
// Overlays and drawings use the same units as the iPhone: x and y are fractions of the frame, sizes
// are for a frame 390 points wide, and lines are drawn in a 1000 x 1778 space. So a story made here
// looks the same in the desktop viewer (ui/stories.tsx) and on the iPhone.
import React from 'react';
import { uploadImage, uploadVideo } from 'shared/api';
import { FILTERS, isNormal, lookMatrix } from 'shared/filters';
import type { Audience, Overlay, StoryItem, Stroke } from 'shared/types';
import type { CreateRequest } from '../lib/create';
import { rememberSize } from '../shims/expo-file-system';

/**
 * A request for the story editor. A story shared again from the archive also says who saw it the
 * first time, so the share step offers the same people again (as the iPhone's Share again does).
 */
export type StoryRequest = CreateRequest & { audience?: Audience };

/** Backgrounds for text stories (the iPhone's STORY_BACKGROUNDS). */
export const STORY_BACKGROUNDS: [string, string][] = [
  ['#4a5df6', '#b13df0'],
  ['#ff7a3d', '#ff3d77'],
  ['#0fb58a', '#0a6cf0'],
  ['#15191e', '#3a4350'],
  ['#f5b301', '#f0562e'],
  ['#d6336c', '#7048e8'],
];

/** Colours offered for text and drawing (the iPhone's STORY_COLORS). */
export const STORY_COLORS = ['#ffffff', '#000000', '#ff3040', '#ff8a3d', '#ffd23f', '#3ddc84', '#4a5df6', '#a033e8', '#ff5fa2'];

/** The iPhone editor's stickers. */
export const EMOJI = ['😀', '😂', '🥹', '😍', '😎', '🥳', '😭', '😡', '🤯', '🫶', '❤️', '🔥', '✨', '💯', '👏', '🙌', '👍', '🙏', '💪', '🎉', '🎂', '🌹', '🌈', '☀️', '🌙', '⭐', '⚡', '☕', '🍕', '🍔', '🍩', '🍉', '⚽', '🏀', '🎧', '🎬', '📍', '✈️', '🏝️', '🏠', '🐶', '🐱', '🦋', '🌸', '💤', '👀', '💬', '✅'];

/** Pen widths, in the drawing space (the iPhone draws at 14). */
export const PEN_WIDTHS = [{ id: 6, label: 'Thin' }, { id: 14, label: 'Medium' }, { id: 28, label: 'Thick' }];

/** Drawings are stored in this space so they look the same on every screen size. */
export const DRAW_W = 1000;
export const DRAW_H = 1778;

/** One story can hold this much drawing (the iPhone's limits). */
export const MAX_STROKES = 80;
export const MAX_DRAWING = 90000;

export const MAX_FILES = 10;
export const MAX_VIDEO_SECONDS = 60;
const MAX_VIDEO_BYTES = 48 * 1024 * 1024;

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/** Text sizes, as the iPhone picks them: smaller for longer words. */
export const autoSize = (text: string) => (text.length > 60 ? 22 : text.length > 24 ? 28 : 34);

/** A font size on a frame `w` wide, from a size given for a frame 390 wide. */
export const fontOn = (size: number, w: number) => Math.max(10, (size * w) / 390);

/** A height for something new that is not on top of text or a sticker already in the middle of the frame. */
export function freeY(taken: Overlay[], want: number): number {
  const clear = (y: number) => taken.every((o) => Math.abs(o.x - 0.5) > 0.22 || Math.abs(o.y - y) > 0.085);
  for (let i = 0; i < 8; i++) {
    for (const y of [want + i * 0.1, want - i * 0.1]) if (y >= 0.16 && y <= 0.82 && clear(y)) return y;
  }
  return want;
}

/** A line through the points, as SVG path data rounded to a tenth (as the iPhone stores it). */
export function toPath(points: { x: number; y: number }[]): string {
  if (!points.length) return '';
  const r = (n: number) => Math.round(n * 10) / 10;
  if (points.length === 1) return `M${r(points[0].x)} ${r(points[0].y)}L${r(points[0].x + 0.5)} ${r(points[0].y)}`;
  return points.map((p, i) => `${i ? 'L' : 'M'}${r(p.x)} ${r(p.y)}`).join('');
}

/** Black or white, whichever reads better on the colour (labels behind text). */
export function inkOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return '#ffffff';
  const n = parseInt(m[1], 16);
  const lum = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return lum > 160 ? '#000000' : '#ffffff';
}

export const gradientOf = (bg: number) => {
  const c = STORY_BACKGROUNDS[(bg ?? 0) % STORY_BACKGROUNDS.length];
  return `linear-gradient(135deg, ${c[0]}, ${c[1]})`;
};

/** The styles of a piece of text on a story, the same as the viewer draws it. */
export function textStyle(o: { color: string; bg?: boolean }, fs: number): React.CSSProperties {
  return {
    fontSize: fs,
    color: o.bg ? inkOn(o.color) : o.color,
    background: o.bg ? o.color : 'transparent',
    borderRadius: fs * 0.3,
    padding: o.bg ? `${fs * 0.16}px ${fs * 0.42}px` : 0,
    textShadow: o.bg ? 'none' : '0 1px 4px rgba(0,0,0,.35)',
  };
}

/** How one piece of text, sticker or mention looks: the viewer's own classes and sizes. */
export function OverlayLabel({ o, w }: { o: Overlay; w: number }) {
  const fs = fontOn(o.size, w);
  if (o.kind === 'emoji') return <span style={{ fontSize: fs, lineHeight: 1.25 }}>{o.text}</span>;
  if (o.kind === 'mention') {
    return (
      <span className="story-mention stc-mention" style={{ fontSize: fs, borderRadius: fs * 0.36, padding: `${fs * 0.2}px ${fs * 0.46}px` }}>
        @{o.text}
      </span>
    );
  }
  return (
    <span className="story-text" style={textStyle(o, fs)}>
      {o.text}
    </span>
  );
}

/* ---------- files from the computer ---------- */

/**
 * A photo or video for a story. `url` is a blob: address for a file chosen on this computer, or
 * the address of a picture already on the server (a post's photo, a story shared again), which is
 * shared as it is instead of being uploaded again.
 */
export type Source = { url: string; type: 'image' | 'video'; w: number; h: number; duration?: number; poster?: string; hosted?: boolean; fit?: 'cover' | 'contain'; size?: number };

/** A wide or square photo is shown whole on a blurred copy of itself; a tall one fills the frame. */
export const fitFor = (w: number, h: number): 'cover' | 'contain' => (w && h && w / h > 0.7 ? 'contain' : 'cover');

const PICTURE = /^image\/(jpeg|png|webp|heic|heif|gif)$/;

/** Reads a chosen file: its size, and a video's length. Refuses what a story can't take. */
export async function readFile(file: File): Promise<Source> {
  const isVideo = file.type.startsWith('video/');
  if (!isVideo && !PICTURE.test(file.type)) throw new Error(file.name + ' is not a photo or a video.');
  if (isVideo && file.size > MAX_VIDEO_BYTES) throw new Error('That video is too large to upload. Choose a shorter one.');
  const url = URL.createObjectURL(file);
  rememberSize(url, file.size);
  if (isVideo) {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.muted = true;
    v.src = url;
    await new Promise<void>((ok, bad) => {
      v.onloadedmetadata = () => ok();
      v.onerror = () => {
        URL.revokeObjectURL(url);
        bad(new Error(file.name + ' could not be opened as a video.'));
      };
    });
    // Some recordings don't say how long they are until the end has been read: jump there to find out.
    if (!isFinite(v.duration)) {
      await new Promise<void>((ok) => {
        v.ondurationchange = () => isFinite(v.duration) && ok();
        setTimeout(ok, 3000);
        v.currentTime = 1e7;
      });
    }
    if (isFinite(v.duration) && v.duration > MAX_VIDEO_SECONDS + 0.5) {
      URL.revokeObjectURL(url);
      throw new Error('Videos can be up to 60 seconds. Trim it first, then choose it again.');
    }
    return { url, type: 'video', w: v.videoWidth, h: v.videoHeight, duration: isFinite(v.duration) ? Math.round(v.duration * 10) / 10 : undefined, size: file.size };
  }
  const img = new Image();
  img.src = url;
  await new Promise<void>((ok, bad) => {
    img.onload = () => ok();
    img.onerror = () => {
      URL.revokeObjectURL(url);
      bad(new Error(file.name + ' could not be opened as a picture.'));
    };
  });
  return { url, type: 'image', w: img.naturalWidth, h: img.naturalHeight, fit: fitFor(img.naturalWidth, img.naturalHeight), size: file.size };
}

/* ---------- filters ---------- */

/** The SVG colour filter for a 4x5 matrix, so the preview shows exactly what will be uploaded. */
function MatrixFilter({ id, matrix }: { id: string; matrix: readonly number[] }) {
  return (
    <filter id={id} colorInterpolationFilters="sRGB">
      <feColorMatrix type="matrix" values={matrix.map((v) => +v.toFixed(5)).join(' ')} />
    </filter>
  );
}

/** Every filter as an SVG filter (stc-look-<id>), for the previews and the photo on the canvas. */
export function LookFilters() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      {FILTERS.map((f) => (
        <MatrixFilter key={f.id} id={'stc-look-' + f.id} matrix={f.matrix as number[]} />
      ))}
    </svg>
  );
}

/** Bakes a filter into the photo, pixel by pixel, the way the iPhone app uploads filtered photos. */
export async function applyLook(url: string, filter: string): Promise<{ url: string; w: number; h: number }> {
  const m = lookMatrix(filter) as number[];
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = url;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = data.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255, a = d[i + 3] / 255;
    d[i] = 255 * (m[0] * r + m[1] * g + m[2] * b + m[3] * a + m[4]);
    d[i + 1] = 255 * (m[5] * r + m[6] * g + m[7] * b + m[8] * a + m[9]);
    d[i + 2] = 255 * (m[10] * r + m[11] * g + m[12] * b + m[13] * a + m[14]);
  }
  ctx.putImageData(data, 0, 0);
  const blob: Blob = await new Promise((r, bad) => canvas.toBlob((x) => (x ? r(x) : bad(new Error('The filter could not be applied.'))), 'image/jpeg', 0.95));
  const out = URL.createObjectURL(blob);
  rememberSize(out, blob.size);
  return { url: out, w: canvas.width, h: canvas.height };
}

/* ---------- the story being made ---------- */

export type Kind = 'image' | 'video' | 'text' | 'collage' | 'batch';

/** Everything the editor holds for one story (or, for a batch, for several). */
export type Draft = {
  kind: Kind;
  sources: Source[];
  /** Text stories: which background. */
  bg: number;
  overlays: Overlay[];
  strokes: Stroke[];
  caption: string;
  /** Photo stories: the filter chosen. It is baked into the uploaded photo, not stored. */
  filter: string;
};

export const emptyDraft = (kind: Kind, sources: Source[] = []): Draft => ({ kind, sources, bg: 0, overlays: [], strokes: [], caption: '', filter: 'normal' });

/** A story from the archive (or anywhere), made editable again: shared again as it was, or changed first. */
export function draftFromItem(item: StoryItem): Draft {
  const extras = { overlays: (item.overlays ?? []).map((o) => ({ ...o })), strokes: [...(item.strokes ?? [])], caption: item.caption ?? '', filter: 'normal' };
  if (item.type === 'text') return { kind: 'text', sources: [], bg: item.bg ?? 0, ...extras };
  if (item.type === 'collage') return { kind: 'collage', sources: (item.urls ?? []).map((url) => ({ url, type: 'image' as const, w: 0, h: 0, hosted: true })), bg: 0, ...extras };
  if (item.type === 'video') return { kind: 'video', sources: [{ url: item.url, type: 'video', w: item.w ?? 0, h: item.h ?? 0, poster: item.poster, duration: item.duration, hosted: true }], bg: 0, ...extras };
  return { kind: 'image', sources: [{ url: item.url, type: 'image', w: item.w ?? 0, h: item.h ?? 0, hosted: true, fit: item.fit === 'contain' ? 'contain' : 'cover' }], bg: 0, ...extras };
}

/** What the canvas shows for the draft (the current page of a batch), before overlays are drawn on top. */
export function previewItem(d: Draft, page = 0): StoryItem {
  const s = d.sources[Math.min(page, Math.max(0, d.sources.length - 1))];
  const base: StoryItem =
    d.kind === 'text'
      ? { url: '', type: 'text', bg: d.bg }
      : d.kind === 'collage'
        ? { url: '', type: 'collage', urls: d.sources.map((x) => x.url) }
        : s?.type === 'video'
          ? { url: s.url, type: 'video', w: s.w, h: s.h, poster: s.poster }
          : { url: s?.url ?? '', type: 'image', w: s?.w, h: s?.h, fit: s?.fit ?? 'cover' };
  if (d.kind === 'batch') return base;
  return { ...base, caption: d.caption.trim() || undefined, strokes: d.strokes };
}

/** Whether there is anything to lose by closing. */
export const hasWork = (d: Draft) => d.sources.length > 0 || d.overlays.length > 0 || d.strokes.length > 0 || d.caption.trim().length > 0;

/** The words written on a story, sent with a text story to the people chosen in Message. */
export const wordsOf = (d: Draft) => (d.kind === 'text' ? d.overlays.filter((o) => o.kind === 'text').map((o) => o.text).join('\n') : d.caption.trim());

/**
 * Uploads what needs uploading and returns the stories to save, as the iPhone editor's buildItems:
 * one for a photo, video, text or collage (with its text, stickers, drawing and caption), or one per
 * file for a batch. `progress` hears what is happening ("Uploading 2 of 3…").
 */
export async function buildItems(me: string, d: Draft, progress: (text: string, done: number, total: number) => void): Promise<StoryItem[]> {
  const extras: Partial<StoryItem> = {};
  if (d.caption.trim()) extras.caption = d.caption.trim().slice(0, 200);
  if (d.overlays.length) extras.overlays = d.overlays;
  if (d.strokes.length) extras.strokes = d.strokes;
  const total = Math.max(1, d.sources.length);
  const fitOf = (s: Source) => (s.fit === 'contain' ? { fit: 'contain' as const } : {});

  // One photo or video as it will be saved (a batch item has no text or drawing of its own).
  const one = async (s: Source, i: number, filter = 'normal'): Promise<StoryItem> => {
    progress(total > 1 ? `Uploading ${i + 1} of ${total}…` : s.type === 'video' ? 'Uploading video…' : 'Uploading…', i, total);
    if (s.type === 'video') {
      if (s.hosted) return { url: s.url, type: 'video', w: s.w || undefined, h: s.h || undefined, poster: s.poster, duration: s.duration };
      const m = await uploadVideo(me, s.url, s.w, s.h);
      return { url: m.url, type: 'video', w: m.w ?? s.w, h: m.h ?? s.h, poster: m.poster, duration: s.duration };
    }
    let url = s.url;
    let w = s.w;
    let h = s.h;
    // A chosen filter is drawn into the photo first, so viewers get a plain picture with the look baked in.
    if (!isNormal(filter)) {
      progress('Applying the filter…', i, total);
      ({ url, w, h } = await applyLook(s.url, filter));
    } else if (s.hosted) return { url: s.url, type: 'image', ...(s.w ? { w: s.w, h: s.h } : {}), ...fitOf(s) };
    progress(total > 1 ? `Uploading ${i + 1} of ${total}…` : 'Uploading…', i, total);
    const m = await uploadImage(me, url, w);
    return { url: m.url, type: 'image', w: m.w, h: m.h, ...fitOf(s) };
  };

  if (d.kind === 'text') return [{ url: '', type: 'text', bg: d.bg, ...extras }];
  if (d.kind === 'batch') {
    const out: StoryItem[] = [];
    for (let i = 0; i < d.sources.length; i++) out.push(await one(d.sources[i], i));
    return out;
  }
  if (d.kind === 'collage') {
    const urls: string[] = [];
    for (let i = 0; i < d.sources.length; i++) {
      const s = d.sources[i];
      progress(`Uploading ${i + 1} of ${d.sources.length}…`, i, d.sources.length);
      urls.push(s.hosted ? s.url : (await uploadImage(me, s.url, s.w, 1080)).url);
    }
    return [{ url: '', type: 'collage', urls, ...extras }];
  }
  return [{ ...(await one(d.sources[0], 0, d.kind === 'image' ? d.filter : 'normal')), ...extras }];
}
