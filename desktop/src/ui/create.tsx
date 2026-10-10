// Instagram's "Create new post" dialog: drag in or choose photos or a video, crop, apply a filter,
// then the caption and everything else a post can carry (create-details.tsx), and share. Also makes
// a Short (one video) and shares a photo or video to your story. A post can go into a community or
// page (Post to; a group's own Post button arrives as request.groupId) and carry a song from Pod.
// Uploads and posting go through the same functions as the iPhone app.
import React, { useEffect, useRef, useState } from 'react';
import { addStory, createPost, uploadImage, uploadVideo } from 'shared/api';
import { ADJUST_KEYS, type Adjust, DEFAULT_ADJUST, FILTERS, isPlainLook, lookMatrix } from 'shared/filters';
import { errText } from 'shared/theme';
import type { Audience, Media, StoryItem } from 'shared/types';
import '../styles/posts.css';
import { rememberSize } from '../shims/expo-file-system';
import type { CreateRequest } from '../lib/create';
import { dateLocale, t } from '../lib/i18n';
import { useMe } from '../lib/me';
import { nav } from '../lib/router';
import { DetailsPanel, type Extras, NO_EXTRAS, cleanPoll, placeRules } from './create-details';
import { Avatar, Icon, Modal, Spinner, ask, toast, toastError } from './kit';
import type { AltMedia } from './post-data';

type Picked = { file: File; url: string; type: 'image' | 'video'; w: number; h: number; duration?: number };
type Crop = 'original' | '1:1' | '4:5' | '16:9';
// The ratios are shown as they are; Original's label is the key of its words, drawn with t().
const CROPS: { id: Crop; label: string; r?: number }[] = [
  { id: 'original', label: 'd.posts.cropOriginal' },
  { id: '1:1', label: '1:1', r: 1 },
  { id: '4:5', label: '4:5', r: 0.8 },
  { id: '16:9', label: '16:9', r: 16 / 9 },
];
const MAX_PHOTOS = 10;
const MAX_VIDEO_SECONDS = 60;
/** The keys of the photo adjustments' names (the sliders under Adjustments). */
const ADJUST_WORDS: Record<string, string> = { brightness: 'd.posts.brightness', contrast: 'd.posts.contrast', saturation: 'd.posts.saturation', warmth: 'd.posts.warmth' };

async function readPicked(file: File): Promise<Picked> {
  const url = URL.createObjectURL(file);
  rememberSize(url, file.size);
  if (file.type.startsWith('video/')) {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.src = url;
    await new Promise<void>((ok, bad) => {
      v.onloadedmetadata = () => ok();
      v.onerror = () => bad(new Error(t('d.posts.notAVideo', { name: file.name })));
    });
    return { file, url, type: 'video', w: v.videoWidth, h: v.videoHeight, duration: v.duration };
  }
  const img = new Image();
  img.src = url;
  await new Promise<void>((ok, bad) => {
    img.onload = () => ok();
    img.onerror = () => bad(new Error(t('d.posts.notAPicture', { name: file.name })));
  });
  return { file, url, type: 'image', w: img.naturalWidth, h: img.naturalHeight };
}

/** The SVG colour filter for a 4x5 matrix, so the preview shows exactly what will be uploaded. */
function MatrixFilter({ id, matrix }: { id: string; matrix: number[] }) {
  return (
    <filter id={id} colorInterpolationFilters="sRGB">
      <feColorMatrix type="matrix" values={matrix.map((v) => +v.toFixed(5)).join(' ')} />
    </filter>
  );
}

/** Bakes a filter into the photo, pixel by pixel, the way the iPhone app uploads filtered photos. */
async function applyLook(url: string, matrix: number[]): Promise<string> {
  const img = new Image();
  img.src = url;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = data.data;
  const m = matrix;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255, a = d[i + 3] / 255;
    d[i] = 255 * (m[0] * r + m[1] * g + m[2] * b + m[3] * a + m[4]);
    d[i + 1] = 255 * (m[5] * r + m[6] * g + m[7] * b + m[8] * a + m[9]);
    d[i + 2] = 255 * (m[10] * r + m[11] * g + m[12] * b + m[13] * a + m[14]);
  }
  ctx.putImageData(data, 0, 0);
  const blob: Blob = await new Promise((r) => canvas.toBlob((x) => r(x!), 'image/jpeg', 0.95));
  const out = URL.createObjectURL(blob);
  rememberSize(out, blob.size);
  return out;
}

type Look = { filter: string; adjust: Adjust };

/** Cuts the middle of a picture to the chosen shape and returns a new blob: URL. */
async function cropTo(p: Picked, ratio?: number): Promise<{ url: string; w: number; h: number }> {
  if (!ratio || p.type !== 'image') return { url: p.url, w: p.w, h: p.h };
  const now = p.w / p.h;
  let sw = p.w;
  let sh = p.h;
  if (now > ratio) sw = Math.round(p.h * ratio);
  else sh = Math.round(p.w / ratio);
  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = sh;
  const img = new Image();
  img.src = p.url;
  await img.decode();
  canvas.getContext('2d')!.drawImage(img, (p.w - sw) / 2, (p.h - sh) / 2, sw, sh, 0, 0, sw, sh);
  const blob: Blob = await new Promise((r) => canvas.toBlob((b) => r(b!), 'image/jpeg', 0.95));
  const url = URL.createObjectURL(blob);
  rememberSize(url, blob.size);
  return { url, w: sw, h: sh };
}

function DropZone({ onFiles, accept, title, multiple = true }: { onFiles: (files: File[]) => void; accept: string; title: string; multiple?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      className={'dropzone pp-dropzone' + (over ? ' over' : '')}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        onFiles(Array.from(e.dataTransfer.files));
      }}
    >
      <svg width="96" height="77" viewBox="0 0 97.6 77.3" aria-hidden="true">
        <path fill="currentColor" d="M16.3 24h.3c2.8-.2 4.9-2.6 4.8-5.4-.2-2.8-2.6-4.9-5.4-4.8s-4.9 2.6-4.8 5.4c.1 2.7 2.4 4.8 5.1 4.8zm-2.4-7.2c.5-.6 1.3-1 2.1-1h.2c1.7 0 3.1 1.4 3.1 3.1 0 1.7-1.4 3.1-3.1 3.1-1.7 0-3.1-1.4-3.1-3.1 0-.8.3-1.5.8-2.1z" />
        <path fill="currentColor" d="M84.7 18.4 58 16.9l-.2-3c-.3-5.7-5.2-10.1-11-9.8L12.9 6c-5.7.3-10.1 5.3-9.8 11L5 51v.8c.7 5.2 5.1 9.1 10.3 9.1h.6l21.7-1.2v.6c-.3 5.7 4 10.7 9.8 11l34 2h.6c5.5 0 10.1-4.3 10.4-9.8l2-34c.4-5.8-4-10.7-9.7-11.1zM7.2 10.8C8.7 9.1 10.8 8.1 13 8l34-1.9c4.6-.3 8.6 3.3 8.9 7.9l.2 2.8-5.3-.3c-5.7-.3-10.7 4-11 9.8l-.6 9.5-9.5 10.7c-.2.3-.6.4-1 .5-.4 0-.7-.1-1-.4l-7.8-7c-1.4-1.3-3.5-1.1-4.8.3L7 49 5.2 17c-.2-2.3.6-4.5 2-6.2zm8.7 48c-4.3.2-8.1-2.8-8.8-7.1l9.4-10.5c.2-.3.6-.4 1-.5.4 0 .7.1 1 .4l7.8 7c.7.6 1.6.9 2.5.9.9 0 1.7-.5 2.3-1.1l7.8-8.8-1.1 18.6-21.9 1.1zm76.5-29.5-2 34c-.3 4.6-4.3 8.2-8.9 7.9l-34-2c-4.6-.3-8.2-4.3-7.9-8.9l2-34c.3-4.4 3.9-7.9 8.4-7.9h.5l34 2c4.7.3 8.2 4.3 7.9 8.9z" />
        <path fill="currentColor" d="M78.2 41.6 61.3 30.5c-2.1-1.4-4.9-.8-6.2 1.3-.4.7-.7 1.4-.7 2.2l-1.2 20.1c-.1 2.5 1.7 4.6 4.2 4.8h.3c.7 0 1.4-.2 2-.5l18-9c2.2-1.1 3.1-3.8 2-6-.4-.7-.9-1.3-1.5-1.8zm-1.4 6-18 9c-.4.2-.8.3-1.3.3-.4 0-.9-.2-1.2-.4-.7-.5-1.2-1.3-1.1-2.2l1.2-20.1c.1-.9.6-1.7 1.4-2.1.8-.4 1.7-.3 2.5.1L77 43.3c1.2.8 1.5 2.3.7 3.4-.2.4-.5.7-.9.9z" />
      </svg>
      <h3>{title}</h3>
      <button className="btn" onClick={() => input.current?.click()}>
        {t('d.posts.selectFromComputer')}
      </button>
      <input ref={input} type="file" accept={accept} multiple={multiple} hidden data-testid="create-files" onChange={(e) => onFiles(Array.from(e.target.files ?? []))} />
    </div>
  );
}

type Mode = 'post' | 'story' | 'short';

/** A post's first photo or video, as a story (the iPhone's storyOf in app/(app)/create.tsx). */
function storyOf(m: Media, duration?: number): StoryItem {
  return m.type === 'video' ? { url: m.url, type: 'video', w: m.w, h: m.h, poster: m.poster, duration } : { url: m.url, type: 'image', w: m.w, h: m.h };
}

/**
 * Create: a post (up to 10 photos, or one video), a Short (one video), or a story. Choose, crop,
 * edit the photos, then add the caption and the rest, and share. `start` is what the Create menu
 * chose: Post, Story or Short.
 */
export function CreateDialog({ onClose, start = 'post', request }: { onClose: () => void; start?: Mode; request?: CreateRequest }) {
  const { me } = useMe();
  const mode: Mode = start;
  const [items, setItems] = useState<Picked[]>([]);
  const [step, setStep] = useState<'pick' | 'crop' | 'edit' | 'details'>('pick');
  const [looks, setLooks] = useState<Record<string, Look>>({});
  const [editTab, setEditTab] = useState<'filters' | 'adjust'>('filters');
  const [crop, setCrop] = useState<Crop>('original');
  const [at, setAt] = useState(0);
  const [caption, setCaption] = useState(request?.text ?? '');
  const [location, setLocation] = useState('');
  const [audience, setAudience] = useState<Audience>('everyone');
  // A group's Post button asks for a post in that group: it starts chosen under Post to.
  const [extras, setExtras] = useState<Extras>(() => ({ ...NO_EXTRAS, groupId: request?.groupId ?? null }));
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => () => items.forEach((p) => URL.revokeObjectURL(p.url)), []);

  const set = (patch: Partial<Extras>) => {
    setErr('');
    setExtras((x) => ({ ...x, ...patch }));
  };
  const singleVideo = items.length === 1 && items[0]?.type === 'video';
  // A single video is a Short: always from Short, and from Post unless "Share as a Short" is off.
  const isShort = mode === 'short' || (mode === 'post' && singleVideo && extras.asShort);

  const add = async (files: File[]) => {
    const good = files.filter((f) => /^image\/(jpeg|png|webp|heic|heif|gif)$|^video\//.test(f.type));
    if (!good.length) return toast(t(mode === 'short' ? 'd.posts.chooseVideoShort' : 'd.posts.choosePhotosVideos'));
    try {
      if (mode === 'short' && !good.some((f) => f.type.startsWith('video/'))) return toast(t('d.posts.chooseVideoShort'));
      const picked = await Promise.all((mode === 'short' ? good.filter((f) => f.type.startsWith('video/')) : good).map(readPicked));
      const video = picked.find((p) => p.type === 'video');
      if (video && (video.duration ?? 0) > MAX_VIDEO_SECONDS + 0.5) return toast(t('d.posts.videoTooLong', { count: MAX_VIDEO_SECONDS }));
      let next: Picked[];
      if (mode === 'story') next = picked.slice(0, 1);
      else if (video) next = [video]; // a post is photos, or one video (a Short)
      else next = [...items.filter((p) => p.type === 'image'), ...picked].slice(0, MAX_PHOTOS);
      if (mode === 'post' && !video && picked.length + items.length > MAX_PHOTOS) toast(t('d.posts.maxPhotos', { count: MAX_PHOTOS }));
      setItems(next);
      setAt(0);
      setExtras((x) => ({ ...x, alts: next.map((_, i) => x.alts[i] ?? '') }));
      // Photos go on to cropping (a story straight to its filters); a video has nothing to crop.
      setStep(mode === 'story' ? (next[0]?.type === 'image' ? 'edit' : 'details') : next[0]?.type === 'video' ? 'details' : 'crop');
    } catch (e) {
      toastError(e);
    }
  };

  // Asking "Discard post?" now: Escape on that question answers it, rather than asking again.
  const asking = useRef(false);
  const close = async () => {
    if (asking.current) return;
    if (items.length && !busy) {
      asking.current = true;
      const leave = await ask(t(mode === 'story' ? 'd.posts.discardStory' : 'd.posts.discardPost'), t('d.posts.discardBody'), t('d.posts.discard'));
      asking.current = false;
      if (!leave) return;
    }
    if (!busy) onClose();
  };
  // The dialog keeps the Escape handler it was opened with, so it calls the latest close through this
  // (otherwise Escape would close without asking once photos are chosen).
  const latestClose = useRef(close);
  latestClose.current = close;

  const ratio = CROPS.find((c) => c.id === crop)?.r ?? (items[0] ? Math.min(1.91, Math.max(0.8, items[0].w / items[0].h)) : 1);
  const current = items[at];

  const share = async () => {
    const cleaned = cleanPoll(mode === 'story' ? null : extras.poll);
    if (cleaned.error) {
      setErr(cleaned.error);
      toast(cleaned.error);
      return;
    }
    setErr('');
    // What the title says while it works ("Sharing…", "Uploading 2 of 3…").
    setBusy(t('create.sharingNow'));
    try {
      if (mode === 'story') {
        const p = items[0];
        let item: StoryItem;
        if (p.type === 'video') {
          const m = await uploadVideo(me.id, p.url, p.w, p.h);
          item = { url: m.url, type: 'video', w: p.w, h: p.h, poster: m.poster, duration: p.duration, caption: caption.trim() || undefined, fit: 'cover' };
        } else {
          const look = looks[p.url];
          const url = look && !isPlainLook(look.filter, look.adjust) ? await applyLook(p.url, lookMatrix(look.filter, look.adjust)) : p.url;
          const m = await uploadImage(me.id, url, p.w);
          item = { url: m.url, type: 'image', w: m.w, h: m.h, caption: caption.trim() || undefined, fit: (p.w / p.h > 0.7 ? 'contain' : 'cover') as 'contain' | 'cover' };
        }
        await addStory(me.id, item, audience);
        toast(t('d.posts.storyShared'));
        onClose();
        nav('/');
        return;
      }
      const media: AltMedia[] = [];
      for (let i = 0; i < items.length; i++) {
        setBusy(items.length > 1 ? t('create.uploadingN', { n: i + 1, total: items.length }) : t('create.uploading'));
        const p = items[i];
        if (p.type === 'video') media.push(await uploadVideo(me.id, p.url, p.w, p.h));
        else {
          const c = await cropTo(p, CROPS.find((x) => x.id === crop)?.r);
          const look = looks[p.url];
          const url = look && !isPlainLook(look.filter, look.adjust) ? await applyLook(c.url, lookMatrix(look.filter, look.adjust)) : c.url;
          const m: AltMedia = await uploadImage(me.id, url, c.w);
          // Alt text travels with the photo, for screen readers.
          const alt = (extras.alts[i] ?? '').trim().slice(0, 300);
          media.push(alt ? { ...m, alt } : m);
        }
      }
      setBusy(t('create.sharingNow'));
      const rules = placeRules(extras, me);
      await createPost(me.id, {
        caption,
        media,
        // Your profile, or the community or page chosen under Post to.
        group_id: extras.groupId,
        audio_id: extras.song?.id ?? null,
        location,
        sensitive: extras.sensitive,
        // Only creators who offer a subscription can keep a post for their subscribers (on their own profile).
        audience: rules.canLimit && extras.subscribersOnly ? 'subscribers' : 'everyone',
        kind: isShort ? 'reel' : 'post',
        tagged_ids: extras.tagged.map((p) => p.id),
        ai_label: extras.ai,
        // Plus only: the server refuses it otherwise.
        profile_only: rules.canProfileOnly && extras.profileOnly,
        hide_likes: extras.hideLikes,
        comments_off: extras.commentsOff,
        prompt: (extras.prompt ?? '').trim(),
        poll: cleaned.poll,
      });
      toast(t(isShort ? 'd.posts.shortShared' : 'd.posts.postShared'));
      // "Also share to your story": the first photo or video, once the post is live.
      if (extras.toStory && rules.canStory && media[0]) {
        try {
          await addStory(me.id, storyOf(media[0], items[0]?.duration));
        } catch (e) {
          toast(t('createFlow.storyFailed', { error: errText(e) }));
        }
      }
      onClose();
      nav(extras.groupId ? '/groups/' + extras.groupId : '/u/' + me.username + (isShort ? '/shorts' : ''));
    } catch (e) {
      toastError(e);
      setErr('');
      setBusy('');
    }
  };

  /** One step back: details → filters (photos) → crop → choosing again. A video goes straight back to choosing. */
  const back = () => {
    if (step === 'details' && items[0]?.type === 'image') return setStep('edit');
    if (step === 'edit' && mode !== 'story') return setStep('crop');
    setItems([]);
    setStep('pick');
  };

  const titles: Record<Mode, string> = { post: 'd.posts.createNewPost', story: 'profile.addToStory', short: 'd.posts.newShort' };
  const title = busy ? busy : t(step === 'crop' ? 'd.posts.crop' : step === 'edit' ? 'ssPub.edit' : step === 'details' ? (mode === 'story' ? 'd.posts.yourStory' : isShort ? 'd.posts.newShort' : 'd.posts.createNewPost') : titles[mode]);
  const header = (
    <div className="modal-head create-head">
      {step === 'pick' ? <span /> : (
        <button className="icon-btn" aria-label={t('common.back')} disabled={!!busy} onClick={back}>
          <Icon name="back" size={24} />
        </button>
      )}
      <h2>{title}</h2>
      {step === 'crop' || step === 'edit' ? (
        <button className="link-btn" onClick={() => setStep(step === 'crop' && items[0]?.type === 'image' ? 'edit' : 'details')}>
          {t('d.posts.next')}
        </button>
      ) : step === 'details' ? (
        <button className="link-btn" disabled={!!busy} onClick={share}>
          {t('common.share')}
        </button>
      ) : (
        <span />
      )}
    </div>
  );

  // A story and a Short are tall; a post shows in the shape it was cropped to.
  const tall = mode === 'story' || (isShort && step === 'details');
  return (
    <Modal onClose={() => latestClose.current()} bare className={'create-dialog pp-create' + (step === 'details' || step === 'edit' ? ' wide' : '')}>
      {header}
      {step === 'pick' ? (
        <DropZone
          onFiles={add}
          accept={mode === 'short' ? 'video/*' : 'image/*,video/*'}
          multiple={mode === 'post'}
          title={t(mode === 'post' ? 'd.posts.dragPhotosVideos' : mode === 'short' ? 'd.posts.dragVideo' : 'd.posts.dragPhotoOrVideo')}
        />
      ) : (
        <div className="create-body">
          <div className="create-media" style={{ aspectRatio: tall ? '9 / 16' : '1' }}>
            {busy ? (
              <div className="create-busy">
                <Spinner size={40} />
              </div>
            ) : null}
            {current ? (
              <div className="create-frame" style={{ aspectRatio: tall ? '9 / 16' : String(ratio) }}>
                {current.type === 'video' ? (
                  <video src={current.url} autoPlay muted loop playsInline />
                ) : (
                  <img src={current.url} alt="" style={looks[current.url] && !isPlainLook(looks[current.url].filter, looks[current.url].adjust) ? { filter: 'url(#look-current)' } : undefined} />
                )}
              </div>
            ) : null}
            {isShort && step === 'details' ? (
              <span className="pp-short-tag">
                <Icon name="reels" size={14} color="#fff" /> {t('createFlow.short')}
              </span>
            ) : null}
            {at > 0 ? (
              <button className="nav-arrow left" aria-label={t('d.posts.previous')} onClick={() => setAt(at - 1)}>
                <Icon name="back" size={16} color="#000" stroke={2.4} />
              </button>
            ) : null}
            {at < items.length - 1 ? (
              <button className="nav-arrow right" aria-label={t('d.posts.next')} onClick={() => setAt(at + 1)}>
                <Icon name="right" size={16} color="#000" stroke={2.4} />
              </button>
            ) : null}
            {step === 'crop' && current?.type === 'image' ? (
              <div className="crop-bar">
                {CROPS.map((c) => (
                  <button key={c.id} className={crop === c.id ? 'on' : ''} onClick={() => setCrop(c.id)}>
                    {c.id === 'original' ? t(c.label) : c.label}
                  </button>
                ))}
              </div>
            ) : null}
            {step === 'crop' && mode === 'post' && items[0]?.type === 'image' ? (
              <div className="thumb-bar">
                {items.map((p, i) => (
                  <span key={p.url} className={'thumb' + (i === at ? ' on' : '')}>
                    <img src={p.url} alt="" onClick={() => setAt(i)} />
                    <button aria-label={t('live.remove')} onClick={() => { const n = items.filter((_, j) => j !== i); setItems(n); setAt(0); if (!n.length) setStep('pick'); }}>
                      <Icon name="close" size={12} color="#fff" stroke={2.5} />
                    </button>
                  </span>
                ))}
                {items.length < MAX_PHOTOS ? (
                  <label className="thumb add" aria-label={t('ssPub.addPhotos')}>
                    <Icon name="plus" size={22} />
                    <input type="file" accept="image/*" multiple hidden onChange={(e) => add(Array.from(e.target.files ?? []))} />
                  </label>
                ) : null}
              </div>
            ) : null}
          </div>
          {current?.type === 'image' ? (
            <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
              <MatrixFilter id="look-current" matrix={lookMatrix(looks[current.url]?.filter, looks[current.url]?.adjust)} />
              {FILTERS.map((f) => (
                <MatrixFilter key={f.id} id={'look-' + f.id} matrix={f.matrix as number[]} />
              ))}
            </svg>
          ) : null}
          {step === 'edit' && current?.type === 'image' ? (
            <div className="create-side edit-side">
              <div className="seg tabs-2">
                <button className={editTab === 'filters' ? 'on' : ''} onClick={() => setEditTab('filters')}>
                  {t('d.posts.filters')}
                </button>
                <button className={editTab === 'adjust' ? 'on' : ''} onClick={() => setEditTab('adjust')}>
                  {t('d.posts.adjustments')}
                </button>
              </div>
              {editTab === 'filters' ? (
                <div className="filter-grid">
                  {FILTERS.map((f) => {
                    const on = (looks[current.url]?.filter ?? 'normal') === f.id;
                    return (
                      <button key={f.id} className={'filter-cell' + (on ? ' on' : '')} onClick={() => setLooks({ ...looks, [current.url]: { filter: f.id, adjust: looks[current.url]?.adjust ?? DEFAULT_ADJUST } })}>
                        <img src={current.url} alt="" style={{ filter: `url(#look-${f.id})` }} />
                        <span>{f.name}</span>
                      </button>
                    );
                  })}
                </div>
              ) : me.plus ? (
                <div className="adjust-list">
                  {ADJUST_KEYS.map((k) => {
                    const look = looks[current.url] ?? { filter: 'normal', adjust: DEFAULT_ADJUST };
                    return (
                      <label key={k} className="adjust-row">
                        <span>
                          {ADJUST_WORDS[k] ? t(ADJUST_WORDS[k]) : k[0].toUpperCase() + k.slice(1)} <em>{look.adjust[k]}</em>
                        </span>
                        <input type="range" min={-100} max={100} value={look.adjust[k]} onChange={(e) => setLooks({ ...looks, [current.url]: { ...look, adjust: { ...look.adjust, [k]: Number(e.target.value) } } })} />
                      </label>
                    );
                  })}
                </div>
              ) : (
                <p className="muted-text pad">{t('d.posts.adjustPlus')}</p>
              )}
            </div>
          ) : null}
          {step === 'details' && mode !== 'story' ? (
            <DetailsPanel mode={mode} items={items} caption={caption} setCaption={setCaption} location={location} setLocation={setLocation} extras={extras} set={set} busy={!!busy} error={err} />
          ) : null}
          {step === 'details' && mode === 'story' ? (
            <div className="create-side">
              <div className="who">
                <Avatar src={me.avatar_url} name={me.username} size={28} />
                <b>{me.username}</b>
              </div>
              <textarea placeholder={t('d.posts.captionOptional')} value={caption} maxLength={2200} onChange={(e) => setCaption(e.target.value)} aria-label={t('create.caption')} autoFocus />
              <div className="count">{caption.length.toLocaleString(dateLocale())}/{(2200).toLocaleString(dateLocale())}</div>
              <div className="side-row column">
                <b>{t('noteNew.audienceTitle')}</b>
                <label>
                  <input type="radio" name="aud" checked={audience === 'everyone'} onChange={() => setAudience('everyone')} /> {t('d.posts.storyEveryone')}
                </label>
                <label>
                  <input type="radio" name="aud" checked={audience === 'close_friends'} onChange={() => setAudience('close_friends')} /> {t('d.posts.closeFriendsOnly')}
                </label>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </Modal>
  );
}
