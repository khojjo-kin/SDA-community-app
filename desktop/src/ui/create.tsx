// Instagram's "Create new post" dialog: choose photos or a video, crop, write a caption, share.
// Also shares a photo or video to your story. Uploads go through the same functions as the iPhone app.
import React, { useEffect, useRef, useState } from 'react';
import { addStory, createPost, uploadImage, uploadVideo } from 'shared/api';
import { ADJUST_KEYS, type Adjust, DEFAULT_ADJUST, FILTERS, isPlainLook, lookMatrix } from 'shared/filters';
import type { Audience, Media, StoryItem } from 'shared/types';
import { rememberSize } from '../shims/expo-file-system';
import { useMe } from '../lib/me';
import { nav } from '../lib/router';
import { Avatar, Icon, Modal, Spinner, ask, toast, toastError } from './kit';

type Picked = { file: File; url: string; type: 'image' | 'video'; w: number; h: number; duration?: number };
type Crop = 'original' | '1:1' | '4:5' | '16:9';
const CROPS: { id: Crop; label: string; r?: number }[] = [
  { id: 'original', label: 'Original' },
  { id: '1:1', label: '1:1', r: 1 },
  { id: '4:5', label: '4:5', r: 0.8 },
  { id: '16:9', label: '16:9', r: 16 / 9 },
];
const MAX_PHOTOS = 10;
const MAX_VIDEO_SECONDS = 60;

async function readPicked(file: File): Promise<Picked> {
  const url = URL.createObjectURL(file);
  rememberSize(url, file.size);
  if (file.type.startsWith('video/')) {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.src = url;
    await new Promise<void>((ok, bad) => {
      v.onloadedmetadata = () => ok();
      v.onerror = () => bad(new Error(file.name + ' could not be opened as a video.'));
    });
    return { file, url, type: 'video', w: v.videoWidth, h: v.videoHeight, duration: v.duration };
  }
  const img = new Image();
  img.src = url;
  await new Promise<void>((ok, bad) => {
    img.onload = () => ok();
    img.onerror = () => bad(new Error(file.name + ' could not be opened as a picture.'));
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

function DropZone({ onFiles, accept, title }: { onFiles: (files: File[]) => void; accept: string; title: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      className={'dropzone' + (over ? ' over' : '')}
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
        Select from computer
      </button>
      <input ref={input} type="file" accept={accept} multiple hidden data-testid="create-files" onChange={(e) => onFiles(Array.from(e.target.files ?? []))} />
    </div>
  );
}

export function CreateDialog({ onClose, start = 'post' }: { onClose: () => void; start?: 'post' | 'story' }) {
  const { me } = useMe();
  const [mode, setMode] = useState<'post' | 'story'>(start);
  const [items, setItems] = useState<Picked[]>([]);
  const [step, setStep] = useState<'pick' | 'crop' | 'edit' | 'details'>('pick');
  const [looks, setLooks] = useState<Record<string, Look>>({});
  const [editTab, setEditTab] = useState<'filters' | 'adjust'>('filters');
  const [crop, setCrop] = useState<Crop>('original');
  const [at, setAt] = useState(0);
  const [caption, setCaption] = useState('');
  const [location, setLocation] = useState('');
  const [audience, setAudience] = useState<Audience>('everyone');
  const [busy, setBusy] = useState('');

  useEffect(() => () => items.forEach((p) => URL.revokeObjectURL(p.url)), []);

  const add = async (files: File[]) => {
    const good = files.filter((f) => /^image\/(jpeg|png|webp|heic|heif|gif)$|^video\//.test(f.type));
    if (!good.length) return toast('Choose photos or videos.');
    try {
      const picked = await Promise.all(good.map(readPicked));
      const video = picked.find((p) => p.type === 'video');
      if (video && (video.duration ?? 0) > MAX_VIDEO_SECONDS + 0.5) return toast('Videos can be up to 60 seconds long.');
      let next: Picked[];
      if (mode === 'story') next = picked.slice(0, 1);
      else if (video) next = [video]; // a post is photos, or one video (a reel)
      else next = [...items.filter((p) => p.type === 'image'), ...picked].slice(0, MAX_PHOTOS);
      if (mode === 'post' && picked.length + items.length > MAX_PHOTOS) toast('A post can have up to 10 photos.');
      setItems(next);
      setAt(0);
      setStep(mode === 'story' ? (next[0]?.type === 'image' ? 'edit' : 'details') : 'crop');
    } catch (e) {
      toastError(e);
    }
  };

  const close = async () => {
    if (items.length && !busy && !(await ask('Discard post?', "If you leave, your edits won't be saved.", 'Discard'))) return;
    if (!busy) onClose();
  };

  const ratio = CROPS.find((c) => c.id === crop)?.r ?? (items[0] ? Math.min(1.91, Math.max(0.8, items[0].w / items[0].h)) : 1);
  const current = items[at];

  const share = async () => {
    setBusy('Sharing');
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
        toast('Your story has been shared.');
      } else {
        const media: Media[] = [];
        for (let i = 0; i < items.length; i++) {
          setBusy(`Uploading ${i + 1} of ${items.length}`);
          const p = items[i];
          if (p.type === 'video') media.push(await uploadVideo(me.id, p.url, p.w, p.h));
          else {
            const c = await cropTo(p, CROPS.find((x) => x.id === crop)?.r);
            const look = looks[p.url];
            const url = look && !isPlainLook(look.filter, look.adjust) ? await applyLook(c.url, lookMatrix(look.filter, look.adjust)) : c.url;
            media.push(await uploadImage(me.id, url, c.w));
          }
        }
        setBusy('Sharing');
        await createPost(me.id, { caption, media, location });
        toast(media[0].type === 'video' ? 'Your reel has been shared.' : 'Your post has been shared.');
      }
      onClose();
      nav(mode === 'story' ? '/' : '/u/' + me.username);
    } catch (e) {
      toastError(e);
      setBusy('');
    }
  };

  const header = (
    <div className="modal-head create-head">
      {step === 'pick' ? <span /> : (
        <button className="icon-btn" aria-label="Back" disabled={!!busy} onClick={() => (step === 'details' ? setStep(items[0]?.type === 'image' ? 'edit' : mode === 'post' ? 'crop' : 'pick') : step === 'edit' ? setStep(mode === 'post' ? 'crop' : 'pick') : (setItems([]), setStep('pick')))}>
          <Icon name="back" size={24} />
        </button>
      )}
      <h2>{busy ? busy + '…' : step === 'pick' ? (mode === 'post' ? 'Create new post' : 'Add to your story') : step === 'crop' ? 'Crop' : step === 'edit' ? 'Edit' : mode === 'post' ? 'Create new post' : 'Your story'}</h2>
      {step === 'crop' || step === 'edit' ? (
        <button className="link-btn" onClick={() => setStep(step === 'crop' && items[0]?.type === 'image' ? 'edit' : 'details')}>
          Next
        </button>
      ) : step === 'details' ? (
        <button className="link-btn" disabled={!!busy} onClick={share}>
          Share
        </button>
      ) : (
        <span />
      )}
    </div>
  );

  return (
    <Modal onClose={close} bare className={'create-dialog' + (step === 'details' || step === 'edit' ? ' wide' : '')}>
      {header}
      {step === 'pick' ? (
        <>
          <div className="seg">
            <button className={mode === 'post' ? 'on' : ''} onClick={() => setMode('post')}>
              Post
            </button>
            <button className={mode === 'story' ? 'on' : ''} onClick={() => setMode('story')}>
              Story
            </button>
          </div>
          <DropZone onFiles={add} accept="image/*,video/*" title={mode === 'post' ? 'Drag photos and videos here' : 'Drag a photo or video here'} />
        </>
      ) : (
        <div className="create-body">
          <div className="create-media" style={{ aspectRatio: mode === 'story' ? '9 / 16' : '1' }}>
            {busy ? (
              <div className="create-busy">
                <Spinner size={40} />
              </div>
            ) : null}
            {current ? (
              <div className="create-frame" style={{ aspectRatio: mode === 'story' ? '9 / 16' : String(ratio) }}>
                {current.type === 'video' ? (
                  <video src={current.url} autoPlay muted loop playsInline />
                ) : (
                  <img src={current.url} alt="" style={looks[current.url] && !isPlainLook(looks[current.url].filter, looks[current.url].adjust) ? { filter: 'url(#look-current)' } : undefined} />
                )}
              </div>
            ) : null}
            {at > 0 ? (
              <button className="nav-arrow left" aria-label="Previous" onClick={() => setAt(at - 1)}>
                <Icon name="back" size={16} color="#000" stroke={2.4} />
              </button>
            ) : null}
            {at < items.length - 1 ? (
              <button className="nav-arrow right" aria-label="Next" onClick={() => setAt(at + 1)}>
                <Icon name="right" size={16} color="#000" stroke={2.4} />
              </button>
            ) : null}
            {step === 'crop' && current?.type === 'image' ? (
              <div className="crop-bar">
                {CROPS.map((c) => (
                  <button key={c.id} className={crop === c.id ? 'on' : ''} onClick={() => setCrop(c.id)}>
                    {c.label}
                  </button>
                ))}
              </div>
            ) : null}
            {step === 'crop' && mode === 'post' && items[0]?.type === 'image' ? (
              <div className="thumb-bar">
                {items.map((p, i) => (
                  <span key={p.url} className={'thumb' + (i === at ? ' on' : '')}>
                    <img src={p.url} alt="" onClick={() => setAt(i)} />
                    <button aria-label="Remove" onClick={() => { const n = items.filter((_, j) => j !== i); setItems(n); setAt(0); if (!n.length) setStep('pick'); }}>
                      <Icon name="close" size={12} color="#fff" stroke={2.5} />
                    </button>
                  </span>
                ))}
                {items.length < MAX_PHOTOS ? (
                  <label className="thumb add" aria-label="Add photos">
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
                  Filters
                </button>
                <button className={editTab === 'adjust' ? 'on' : ''} onClick={() => setEditTab('adjust')}>
                  Adjustments
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
                          {k[0].toUpperCase() + k.slice(1)} <em>{look.adjust[k]}</em>
                        </span>
                        <input type="range" min={-100} max={100} value={look.adjust[k]} onChange={(e) => setLooks({ ...looks, [current.url]: { ...look, adjust: { ...look.adjust, [k]: Number(e.target.value) } } })} />
                      </label>
                    );
                  })}
                </div>
              ) : (
                <p className="muted-text pad">Brightness, contrast, saturation and warmth are a Community Plus perk, as on the iPhone.</p>
              )}
            </div>
          ) : null}
          {step === 'details' ? (
            <div className="create-side">
              <div className="who">
                <Avatar src={me.avatar_url} name={me.username} size={28} />
                <b>{me.username}</b>
              </div>
              <textarea placeholder={mode === 'post' ? 'Write a caption…' : 'Add a caption (optional)…'} value={caption} maxLength={2200} onChange={(e) => setCaption(e.target.value)} aria-label="Caption" autoFocus />
              <div className="count">{caption.length.toLocaleString()}/2,200</div>
              {mode === 'post' ? (
                <label className="side-row">
                  <input placeholder="Add location" value={location} maxLength={120} onChange={(e) => setLocation(e.target.value)} aria-label="Location" />
                  <Icon name="location" size={18} />
                </label>
              ) : (
                <div className="side-row column">
                  <b>Share with</b>
                  <label>
                    <input type="radio" name="aud" checked={audience === 'everyone'} onChange={() => setAudience('everyone')} /> Your story (everyone who can see it)
                  </label>
                  <label>
                    <input type="radio" name="aud" checked={audience === 'close_friends'} onChange={() => setAudience('close_friends')} /> Close friends only
                  </label>
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}
    </Modal>
  );
}
