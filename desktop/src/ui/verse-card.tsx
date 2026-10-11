// Verse cards, from the iPhone app (app/(app)/verse-card.tsx and src/components/VerseCard.tsx): any
// verse (or a few) as a designed picture, drawn on a <canvas> right here: a background (nine
// gradients, or a photo), a font, the words lined up left, centre or right, square for a post or tall
// for a story. Then add it to your story, post it, save it as a PNG, or send it to people.
//
// The card is always drawn at its full size (1080 × 1080, or 1080 × 1920 for a story) and shown
// smaller, so what is saved is exactly what is seen. Everything is measured as a share of the width,
// as on the iPhone, so the two apps' cards come out alike. The words size themselves to fill the card
// without ever running off it.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BOOKS, TRANSLATIONS, type Chapter, type TranslationId, fetchChapter, spokenRef } from 'shared/bible';
import { errText } from 'shared/theme';
import { openCreate } from '../lib/create';
import { loadFontFace } from '../lib/font';
import { t } from '../lib/i18n';
import { Icon, Modal, Spinner, toast } from './kit';
import '../styles/events.css';

/* ---------- the designs (the same as the iPhone's) ---------- */

export type CardShape = 'square' | 'tall';
export type CardAlign = 'left' | 'center' | 'right';
export type CardDesign = { bg: string; font: string; align: CardAlign; shape: CardShape };

/** A background: a gradient, and the colour the words are written in on it. The card's art: the same in both themes. */
const CARD_BACKGROUNDS: { id: string; label: string; colors: string[]; ink: string }[] = [
  { id: 'forest', label: 'verseCard.bgForest', colors: ['#0a3d24', '#0c5a45', '#0f766e'], ink: '#ffffff' },
  { id: 'green', label: 'verseCard.bgGreen', colors: ['#22c55e', '#15803d'], ink: '#ffffff' },
  { id: 'night', label: 'verseCard.bgNight', colors: ['#0b1020', '#1b2440', '#2c3866'], ink: '#ffffff' },
  { id: 'dusk', label: 'verseCard.bgDusk', colors: ['#24163f', '#5f2a5c', '#b6534d'], ink: '#ffffff' },
  { id: 'ocean', label: 'verseCard.bgOcean', colors: ['#0f2027', '#203a43', '#2c5364'], ink: '#ffffff' },
  { id: 'dawn', label: 'verseCard.bgDawn', colors: ['#fbe3b4', '#f7b58a', '#ee8e78'], ink: '#3a2016' },
  { id: 'paper', label: 'verseCard.bgPaper', colors: ['#f8f2e4', '#ede3cd'], ink: '#2b2620' },
  { id: 'white', label: 'verseCard.bgWhite', colors: ['#ffffff', '#eef0f2'], ink: '#14181c' },
  { id: 'black', label: 'verseCard.bgBlack', colors: ['#000000', '#17191c'], ink: '#ffffff' },
];
const PHOTO_BG = 'photo';
const backgroundOf = (id: string) => CARD_BACKGROUNDS.find((b) => b.id === id) ?? CARD_BACKGROUNDS[0];

/**
 * The fonts (the faces the app's own font choice uses, from Google Fonts, with the computer's own
 * faces standing in until they arrive or if they can't): the cuts for the words and the reference,
 * and the line height as a share of the size.
 */
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const CARD_FONTS: { id: string; name: string; web: string; family: string; verse: number; ref: number; lh: number }[] = [
  { id: 'lora', name: 'Lora', web: 'lora', family: "'Lora', Georgia, 'Times New Roman', serif", verse: 400, ref: 700, lh: 1.42 },
  { id: 'lorab', name: 'Lora Bold', web: 'lora', family: "'Lora', Georgia, 'Times New Roman', serif", verse: 700, ref: 700, lh: 1.38 },
  { id: 'nunito', name: 'Nunito', web: 'nunito', family: `'Nunito', ${SANS}`, verse: 700, ref: 700, lh: 1.38 },
  { id: 'poppins', name: 'Poppins', web: 'poppins', family: `'Poppins', ${SANS}`, verse: 400, ref: 600, lh: 1.5 },
];
const fontOf = (id: string) => CARD_FONTS.find((f) => f.id === id) ?? CARD_FONTS[0];

const DEFAULT_DESIGN: CardDesign = { bg: 'forest', font: 'lora', align: 'center', shape: 'square' };
const DESIGN_KEY = 'community.versecard.design';
/** The saved picture is this many pixels wide (1080 × 1080, or 1080 × 1920 for a story). */
const OUT_W = 1080;
const heightOf = (shape: CardShape) => (shape === 'tall' ? Math.round((OUT_W * 16) / 9) : OUT_W);

/** The look chosen last time on this computer (not the photo, which belongs to that card). */
function savedDesign(): CardDesign {
  try {
    const d = JSON.parse(localStorage.getItem(DESIGN_KEY) ?? 'null');
    if (d && typeof d.bg === 'string' && typeof d.font === 'string' && ['left', 'center', 'right'].includes(d.align) && ['square', 'tall'].includes(d.shape)) {
      return { ...d, bg: d.bg === PHOTO_BG || !CARD_BACKGROUNDS.some((b) => b.id === d.bg) ? DEFAULT_DESIGN.bg : d.bg, font: fontOf(d.font).id };
    }
  } catch {
    // Unreadable: the default look.
  }
  return DEFAULT_DESIGN;
}

/* ---------- the passage ---------- */

/** The longest passage a card takes; anything longer is cut at a verse so the words stay readable. */
const MAX_CHARS = 480;
const MAX_VERSES = 8;

export type VersePick = { book: string; chapter: number; verses: number[]; translation: TranslationId };
type Passage = { text: string; reference: string; shortened: boolean };

/** The words of the chosen verses, cut to what a card can hold, with the reference of what is shown. */
function passageOf(ch: Chapter, wanted: number[], short: string): Passage | null {
  const verses = ch.verses.filter((v) => wanted.includes(v.verse));
  if (!verses.length) return null;
  const used: typeof verses = [];
  let total = 0;
  for (const v of verses) {
    if (used.length >= MAX_VERSES) break;
    if (used.length && total + v.text.length + 1 > MAX_CHARS) break;
    used.push(v);
    total += v.text.length + 1;
  }
  // Verses that follow each other run on; a gap between chosen verses shows as an ellipsis.
  let text = used.map((v, i) => (i && v.verse !== used[i - 1].verse + 1 ? `… ${v.text}` : v.text)).join(' ');
  let cut = false;
  if (text.length > MAX_CHARS + 120) {
    text = `${text.slice(0, MAX_CHARS).replace(/\s+\S*$/, '')}…`;
    cut = true;
  }
  const reference = `${spokenRef(ch.book, ch.chapter, used.map((v) => v.verse))} · ${short}`;
  return { text, reference, shortened: cut || used.length < verses.length };
}

/* ---------- drawing ---------- */

/** Splits words into lines no wider than `width` at the font set on `ctx` (a word too long for a line is broken). */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= width) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    line = word;
    // A single word wider than the line: broken where it has to be.
    while (ctx.measureText(line).width > width && line.length > 1) {
      let cut = line.length - 1;
      while (cut > 1 && ctx.measureText(line.slice(0, cut)).width > width) cut--;
      lines.push(line.slice(0, cut));
      line = line.slice(cut);
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Draws the card at full size onto `canvas`. `photo` is the chosen picture, already loaded. */
function drawCard(canvas: HTMLCanvasElement, design: CardDesign, passage: Passage, photo: HTMLImageElement | null) {
  const W = OUT_W;
  const H = heightOf(design.shape);
  const tall = design.shape === 'tall';
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const usePhoto = design.bg === PHOTO_BG && !!photo;
  const bg = backgroundOf(design.bg);
  const ink = usePhoto ? '#ffffff' : bg.ink;
  const font = fontOf(design.font);

  // The background: the photo filling the card under a soft shade, or the gradient corner to corner.
  if (usePhoto && photo) {
    const k = Math.max(W / photo.naturalWidth, H / photo.naturalHeight);
    const pw = photo.naturalWidth * k;
    const ph = photo.naturalHeight * k;
    ctx.drawImage(photo, (W - pw) / 2, (H - ph) / 2, pw, ph);
    const shade = ctx.createLinearGradient(0, 0, 0, H);
    shade.addColorStop(0, 'rgba(0,0,0,0.34)');
    shade.addColorStop(0.5, 'rgba(0,0,0,0.5)');
    shade.addColorStop(1, 'rgba(0,0,0,0.6)');
    ctx.fillStyle = shade;
  } else {
    const g = ctx.createLinearGradient(0, 0, W, H);
    bg.colors.forEach((c, i) => g.addColorStop(i / Math.max(1, bg.colors.length - 1), c));
    ctx.fillStyle = g;
  }
  ctx.fillRect(0, 0, W, H);

  // Where things go. A tall card keeps clear of a story's top and bottom bars.
  const padX = W * 0.1;
  const padY = tall ? H * 0.15 : W * 0.1;
  const refSize = W * 0.034;
  const ruleGap = W * 0.055;
  const rule = Math.max(1, W * 0.004);
  const refGap = W * 0.034;
  const refBlock = ruleGap + rule + refGap + refSize * 1.3;
  const boxW = W - padX * 2;
  const boxH = H - padY * 2 - refBlock;
  const minF = W * 0.03;
  const maxF = W * (tall ? 0.095 : 0.085);
  const words = `“${passage.text}”`;

  // The largest size at which the words fit the box.
  const setVerse = (size: number) => (ctx.font = `${font.verse} ${size}px ${font.family}`);
  const fits = (size: number) => {
    setVerse(size);
    const lines = wrap(ctx, words, boxW);
    return { lines, ok: lines.length * size * font.lh <= boxH * 0.97 };
  };
  let size = maxF;
  let laid = fits(maxF);
  if (!laid.ok) {
    let lo = minF;
    let hi = maxF;
    laid = fits(minF);
    size = minF;
    for (let i = 0; i < 14; i++) {
      const mid = (lo + hi) / 2;
      const tryIt = fits(mid);
      if (tryIt.ok) {
        lo = mid;
        size = mid;
        laid = tryIt;
      } else hi = mid;
    }
  }
  setVerse(size);

  const lineH = size * font.lh;
  const textH = laid.lines.length * lineH;
  let y = (H - (textH + refBlock)) / 2;
  const x = design.align === 'left' ? padX : design.align === 'right' ? W - padX : W / 2;
  ctx.textAlign = design.align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = ink;
  if (usePhoto) {
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = W * 0.012;
    ctx.shadowOffsetY = W * 0.002;
  }
  laid.lines.forEach((line, i) => ctx.fillText(line, x, y + lineH * (i + 0.5)));
  y += textH + ruleGap;

  // A short rule, then the reference in small capitals, spaced out.
  ctx.shadowColor = 'transparent';
  const ruleW = W * 0.08;
  ctx.globalAlpha = 0.55;
  ctx.fillRect(design.align === 'left' ? padX : design.align === 'right' ? W - padX - ruleW : (W - ruleW) / 2, y, ruleW, rule);
  y += rule + refGap;
  ctx.globalAlpha = 0.88;
  if (usePhoto) ctx.shadowColor = 'rgba(0,0,0,0.35)';
  const ref = passage.reference.toLocaleUpperCase();
  let rs = refSize;
  let spacing = 0;
  let widths: number[] = [];
  // Shrunk (to no less than 60%) if a long reference would run off the card.
  for (let i = 0; i < 6; i++) {
    ctx.font = `${font.ref} ${rs}px ${font.family}`;
    spacing = rs * 0.14;
    widths = [...ref].map((c) => ctx.measureText(c).width);
    const total = widths.reduce((a, b) => a + b, 0) + spacing * (widths.length - 1);
    if (total <= boxW || rs <= refSize * 0.6) break;
    rs = Math.max(refSize * 0.6, rs * (boxW / total));
  }
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (widths.length - 1);
  let cx = design.align === 'left' ? padX : design.align === 'right' ? W - padX - total : (W - total) / 2;
  ctx.textAlign = 'left';
  [...ref].forEach((c, i) => {
    ctx.fillText(c, cx, y + (refSize * 1.3) / 2);
    cx += widths[i] + spacing;
  });
  ctx.globalAlpha = 1;
  ctx.shadowColor = 'transparent';
}

/** The canvas as a PNG file. */
function pngOf(canvas: HTMLCanvasElement, name: string): Promise<File> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(new File([b], name, { type: 'image/png' })) : reject(new Error(t('verseCard.failed')))), 'image/png'),
  );
}

/** A file name from the reference: "John 3-16 KJV.png". */
const fileName = (reference: string) => `${reference.replace(/[·:]/g, (c) => (c === ':' ? '-' : '')).replace(/[\\/?%*|"<>]/g, '').replace(/\s+/g, ' ').trim() || 'verse'}.png`;

/**
 * Hands a picture to Create (a post, or the story editor) the way choosing it there would: Create is
 * asked to open, and the picture goes into its file chooser as soon as that is on screen.
 */
async function handToCreate(mode: 'post' | 'story', file: File) {
  openCreate({ mode });
  const selector = mode === 'story' ? '[data-testid=story-files]' : '[data-testid=create-files]';
  for (let i = 0; i < 80; i++) {
    const input = document.querySelector<HTMLInputElement>(selector);
    if (input) {
      const list = new DataTransfer();
      list.items.add(file);
      input.files = list.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
}

/* ---------- the designer ---------- */

type Tab = 'bg' | 'font' | 'layout';
type Action = 'story' | 'post' | 'save' | 'share';

/**
 * The card maker, over the page. `onShare` takes the finished picture to the people picker (the
 * Bible's own send dialog), which takes this dialog's place.
 */
export function VerseCardDialog({ pick, onClose, onShare }: { pick: VersePick; onClose: () => void; onShare: (file: File, reference: string) => void }) {
  const [passage, setPassage] = useState<Passage | null>(null);
  const [error, setError] = useState('');
  const [design, setDesignState] = useState<CardDesign>(savedDesign);
  const [photo, setPhoto] = useState<{ url: string; img: HTMLImageElement } | null>(null);
  const [tab, setTab] = useState<Tab>('bg');
  const [busy, setBusy] = useState<Action | null>(null);
  // Moved on when a web font arrives, so the card is drawn again in it.
  const [fontsTick, setFontsTick] = useState(0);
  const canvas = useRef<HTMLCanvasElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const short = TRANSLATIONS.find((x) => x.id === pick.translation)?.short ?? pick.translation.toUpperCase();

  const load = () => {
    setError('');
    const book = BOOKS.find((b) => b.name === pick.book);
    if (!book || !(pick.chapter >= 1 && pick.chapter <= book.chapters)) return setError(t('verseCard.notFound'));
    fetchChapter(book.name, pick.chapter, pick.translation).then(
      (ch) => {
        const p = passageOf(ch, pick.verses, short);
        if (p) setPassage(p);
        else setError(t('verseCard.notFound'));
      },
      (e) => setError(errText(e)),
    );
  };
  useEffect(load, []);

  // The card's faces load in the background; the card is drawn at once in the stand-in and again when they arrive.
  useEffect(() => {
    let live = true;
    const wanted = [...new Set(CARD_FONTS.map((f) => f.web))];
    wanted.forEach(loadFontFace);
    const families: Record<string, string> = { lora: 'Lora', nunito: 'Nunito', poppins: 'Poppins' };
    const waits = CARD_FONTS.flatMap((f) => [f.verse, f.ref].map((w) => document.fonts?.load(`${w} 48px '${families[f.web]}'`).catch(() => [])));
    Promise.all(waits).then(() => live && setFontsTick((n) => n + 1));
    return () => {
      live = false;
    };
  }, []);

  // The chosen photo is let go when the dialog closes.
  useEffect(() => () => (photo ? URL.revokeObjectURL(photo.url) : undefined), [photo]);

  // Drawn again on every change.
  useEffect(() => {
    if (passage && canvas.current) drawCard(canvas.current, design, passage, photo?.img ?? null);
  }, [passage, design, photo, fontsTick]);

  const setDesign = (patch: Partial<CardDesign>) =>
    setDesignState((cur) => {
      const next = { ...cur, ...patch };
      try {
        localStorage.setItem(DESIGN_KEY, JSON.stringify({ ...next, bg: next.bg === PHOTO_BG ? DEFAULT_DESIGN.bg : next.bg }));
      } catch {
        // Remembering the look is a convenience only.
      }
      return next;
    });

  function choosePhoto(file?: File | null) {
    if (!file || !file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setPhoto({ url, img });
      setDesign({ bg: PHOTO_BG });
    };
    img.onerror = () => toast(t('verseCard.failed'));
    img.src = url;
  }

  /** The card in the shape given, drawn off the screen if it isn't the one showing. */
  async function picture(shape: CardShape): Promise<File> {
    if (!passage) throw new Error(t('verseCard.failed'));
    let source = canvas.current;
    if (!source || shape !== design.shape) {
      source = document.createElement('canvas');
      drawCard(source, { ...design, shape }, passage, photo?.img ?? null);
    }
    return pngOf(source, fileName(passage.reference));
  }

  async function act(kind: Action) {
    if (busy || !passage) return;
    setBusy(kind);
    try {
      // A story is always tall: a square card would be cropped. The preview turns tall too, so what is shared is what is seen.
      const shape: CardShape = kind === 'story' ? 'tall' : design.shape;
      if (shape !== design.shape) setDesign({ shape });
      const file = await picture(shape);
      if (kind === 'save') {
        const url = URL.createObjectURL(file);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
        toast(t('verseCard.saved'));
        return;
      }
      // Sharing hands over to the people picker (which takes this dialog's place); a post or a story to Create.
      if (kind === 'share') return onShare(file, passage.reference);
      onClose();
      await handToCreate(kind, file);
    } catch (e) {
      toast(errText(e));
    } finally {
      setBusy(null);
    }
  }

  const font = fontOf(design.font);
  const locked = !!busy || !passage;
  const tabs: { id: Tab; label: string }[] = [
    { id: 'bg', label: t('verseCard.background') },
    { id: 'font', label: t('verseCard.font') },
    { id: 'layout', label: t('verseCard.layout') },
  ];
  const actions: { id: Action; icon: 'story' | 'pluscircle' | 'download' | 'send'; label: string }[] = [
    { id: 'story', icon: 'story', label: t('verseCard.toStory') },
    { id: 'post', icon: 'pluscircle', label: t('verseCard.post') },
    { id: 'save', icon: 'download', label: t('verseCard.save') },
    { id: 'share', icon: 'send', label: t('common.share') },
  ];
  // A light swatch with a hairline, so white and paper don't vanish into a white dialog.
  const swatchStyle = useMemo(() => Object.fromEntries(CARD_BACKGROUNDS.map((b) => [b.id, { background: `linear-gradient(135deg, ${b.colors.join(', ')})`, color: b.ink }])), []);

  return (
    <Modal title={t('verseCard.title')} onClose={onClose} className="ev-vc" closeOutside={!busy}>
      <div className="ev-vc-body">
        <div className="ev-vc-stage">
          {passage ? (
            <>
              <canvas ref={canvas} className={'ev-vc-canvas ' + design.shape} role="img" aria-label={`${passage.reference}. ${passage.text}`} width={OUT_W} height={heightOf(design.shape)} />
              {passage.shortened ? <p className="ev-vc-note">{t('verseCard.shortened')}</p> : null}
            </>
          ) : error ? (
            <div className="ev-vc-error">
              <p>{error}</p>
              <button className="btn quiet small" onClick={load}>
                {t('common.tryAgain')}
              </button>
            </div>
          ) : (
            <Spinner />
          )}
        </div>

        <div className="ev-vc-tools">
          <div className="ev-vc-tabs" role="tablist">
            {tabs.map((x) => (
              <button key={x.id} role="tab" aria-selected={tab === x.id} className={tab === x.id ? 'on' : ''} onClick={() => setTab(x.id)}>
                {x.label}
              </button>
            ))}
          </div>

          {tab === 'bg' ? (
            <div className="ev-vc-swatches">
              {CARD_BACKGROUNDS.map((b) => (
                <button key={b.id} className={'ev-vc-swatch' + (design.bg === b.id ? ' on' : '')} aria-label={t(b.label)} title={t(b.label)} aria-pressed={design.bg === b.id} onClick={() => setDesign({ bg: b.id })}>
                  <span style={{ ...swatchStyle[b.id], fontFamily: font.family, fontWeight: font.verse }}>Aa</span>
                </button>
              ))}
              <button
                className={'ev-vc-swatch photo' + (design.bg === PHOTO_BG ? ' on' : '')}
                aria-label={photo ? t('verseCard.photo') : t('verseCard.choosePhoto')}
                title={photo ? t('verseCard.photo') : t('verseCard.choosePhoto')}
                aria-pressed={design.bg === PHOTO_BG}
                // A photo already chosen comes back with one click; clicking it while it shows chooses another.
                onClick={() => (photo && design.bg !== PHOTO_BG ? setDesign({ bg: PHOTO_BG }) : fileInput.current?.click())}
              >
                <span>
                  {photo ? <img src={photo.url} alt="" /> : null}
                  <Icon name="image" size={20} />
                  {photo ? null : <em>{t('verseCard.photo')}</em>}
                </span>
              </button>
              <input ref={fileInput} type="file" accept="image/*" hidden data-testid="verse-card-photo" onChange={(e) => { choosePhoto(e.target.files?.[0]); e.target.value = ''; }} />
            </div>
          ) : tab === 'font' ? (
            <div className="ev-vc-chips">
              {CARD_FONTS.map((f) => (
                <button key={f.id} className={'ev-vc-chip wide' + (design.font === f.id ? ' on' : '')} aria-pressed={design.font === f.id} onClick={() => setDesign({ font: f.id })}>
                  <span className="ev-vc-aa" style={{ fontFamily: f.family, fontWeight: f.verse }}>
                    Aa
                  </span>
                  <span>{f.name}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="ev-vc-chips">
              {(['left', 'center', 'right'] as CardAlign[]).map((a) => (
                <button key={a} className={'ev-vc-chip' + (design.align === a ? ' on' : '')} aria-pressed={design.align === a} aria-label={t(a === 'left' ? 'verseCard.alignLeft' : a === 'right' ? 'verseCard.alignRight' : 'verseCard.alignCenter')} title={t(a === 'left' ? 'verseCard.alignLeft' : a === 'right' ? 'verseCard.alignRight' : 'verseCard.alignCenter')} onClick={() => setDesign({ align: a })}>
                  <span className={'ev-vc-align ' + a} aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>
                </button>
              ))}
              <span className="ev-vc-divider" />
              {(['square', 'tall'] as CardShape[]).map((s) => (
                <button key={s} className={'ev-vc-chip wide' + (design.shape === s ? ' on' : '')} aria-pressed={design.shape === s} onClick={() => setDesign({ shape: s })}>
                  <span className={'ev-vc-shape ' + s} aria-hidden="true" />
                  <span>{t(s === 'square' ? 'verseCard.square' : 'verseCard.tall')}</span>
                </button>
              ))}
            </div>
          )}

          <div className="ev-vc-actions">
            {actions.map((a) => (
              <button key={a.id} className="ev-vc-action" disabled={locked} onClick={() => act(a.id)}>
                <span>{busy === a.id ? <Spinner size={20} /> : <Icon name={a.icon} size={22} />}</span>
                {a.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
