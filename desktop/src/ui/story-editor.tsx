// The story editor's canvas and tools, as the iPhone app's story editor (app/(app)/story-editor.tsx)
// laid out for a computer: the 9:16 story in the middle of a dark screen, a column of tools beside
// it (Text, Stickers, Mention, Draw, Caption, Filters, Fit or Background), and the chosen tool's
// options in a panel next to the column. Text is typed straight onto the story; text, stickers and
// mentions are dragged with the mouse, clicked to select (bigger, smaller, edit, remove) and removed
// with Delete. Stickers and people can also be dragged from the panel onto the story. Lines are drawn
// with the mouse in the iPhone's 1000 x 1778 space, with Undo and Clear.
import React, { useEffect, useRef, useState } from 'react';
import { searchProfiles } from 'shared/api';
import { FILTERS, isNormal } from 'shared/filters';
import type { Overlay, Profile, Stroke } from 'shared/types';
import { t, tn } from '../lib/i18n';
import { useMe } from '../lib/me';
import '../styles/stories.css';
import { Avatar, Icon, type IconName, Spinner, toast } from './kit';
import { StoryCanvas } from './stories';
import {
  DRAW_H, DRAW_W, type Draft, EMOJI, MAX_DRAWING, MAX_FILES, MAX_STROKES, PEN_WIDTHS, STORY_BACKGROUNDS, STORY_COLORS,
  OverlayLabel, autoSize, clamp, fontOn, freeY, gradientOf, newId, previewItem, textStyle, toPath,
} from './story-parts';

export type Tool = null | 'text' | 'draw' | 'sticker' | 'mention' | 'caption' | 'filter' | 'background';
type TextDraft = { id?: string; text: string; color: string; bg: boolean; size?: number; x: number; y: number };
/** What is carried when a sticker or a person is dragged from the panel onto the story. */
const DRAG_TYPE = 'application/x-community-story-overlay';

/** Where an overlay sits: a box centred on its point, big enough to centre any label inside (as on the iPhone). */
const boxStyle = (x: number, y: number, w: number, h: number): React.CSSProperties => ({ left: x * w - w * 0.46, top: y * h - h * 0.25, width: w * 0.92, height: h * 0.5 });

function ToolButton({ icon, glyph, label, active, onClick, swatch }: { icon?: IconName; glyph?: string; label: string; active?: boolean; onClick: () => void; swatch?: string }) {
  return (
    <button className={'stc-tool' + (active ? ' on' : '')} aria-label={label} aria-pressed={active} title={label} onClick={onClick}>
      <span className={'stc-tool-icon' + (swatch ? ' swatch' : '')} style={swatch ? { background: swatch } : undefined}>
        {swatch ? null : icon ? <Icon name={icon} size={22} color={active ? '#000' : '#fff'} /> : <b>{glyph}</b>}
      </span>
      <span className="stc-tool-label">{label}</span>
    </button>
  );
}

/** A small round button on the story itself (the selection bar, the batch arrows). */
function RoundButton({ icon, glyph, label, onClick }: { icon?: IconName; glyph?: string; label: string; onClick: () => void }) {
  return (
    <button className="stc-round" aria-label={label} title={label} onMouseDown={(e) => e.preventDefault()} onClick={onClick}>
      {icon ? <Icon name={icon} size={20} color="#fff" stroke={2} /> : <b>{glyph}</b>}
    </button>
  );
}

function Swatches({ value, onPick, label }: { value: string; onPick: (c: string) => void; label: string }) {
  return (
    <div className="stc-swatches" role="radiogroup" aria-label={label}>
      {STORY_COLORS.map((c) => (
        <button key={c} role="radio" aria-checked={value === c} aria-label={t('d.stories.colourSwatch', { colour: c })} className={'stc-swatch' + (value === c ? ' on' : '')} style={{ background: c }} onMouseDown={(e) => e.preventDefault()} onClick={() => onPick(c)} />
      ))}
    </div>
  );
}

/**
 * The editor for one story (or the pages of a batch). `d` is the story being made and `set` changes
 * it; `size` is the canvas size worked out by the screen; `bottom` goes under the canvas (the share
 * buttons); `onLeave` is Esc with nothing left to put away; `onMore` adds files to a batch.
 */
export function StoryEditor({ d, set, size, page, setPage, bottom, onLeave, onMore }: { d: Draft; set: (fn: (d: Draft) => Draft) => void; size: { w: number; h: number }; page: number; setPage: (n: number) => void; bottom: React.ReactNode; onLeave: () => void; onMore: (files: File[]) => void }) {
  const { me } = useMe();
  const [tool, setToolState] = useState<Tool>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<TextDraft | null>(null);
  const [lastStyle, setLastStyle] = useState({ color: '#ffffff', bg: false });
  const [pen, setPen] = useState({ color: '#ffffff', width: 14 });
  const [live, setLive] = useState('');
  const [guide, setGuide] = useState<{ v: boolean; h: boolean } | null>(null);
  const [q, setQ] = useState('');
  const [people, setPeople] = useState<Profile[] | null>(null);
  const points = useRef<{ x: number; y: number }[]>([]);
  const history = useRef<Stroke[][]>([]);
  const drag = useRef<{ id: string; sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const textBox = useRef<HTMLTextAreaElement>(null);
  const moreInput = useRef<HTMLInputElement>(null);
  const { w, h } = size;
  const batch = d.kind === 'batch';
  const current = d.sources[Math.min(page, Math.max(0, d.sources.length - 1))];
  const canFit = (d.kind === 'image' || batch) && current?.type === 'image';

  const setTool = (t: Tool) => {
    setSelected(null);
    setToolState(t);
  };
  const patch = (id: string, change: Partial<Overlay>) => set((x) => ({ ...x, overlays: x.overlays.map((o) => (o.id === id ? { ...o, ...change } : o)) }));
  const add = (o: Overlay) => set((x) => ({ ...x, overlays: [...x.overlays, o] }));
  const remove = (id: string) => {
    set((x) => ({ ...x, overlays: x.overlays.filter((o) => o.id !== id) }));
    setSelected(null);
  };

  /* ----- text ----- */

  /** Puts the text being typed onto the story (or removes it when it was emptied). */
  function commitText() {
    const t = editing;
    if (!t) return;
    setEditing(null);
    setToolState((cur) => (cur === 'text' ? null : cur));
    const text = t.text.trim();
    if (!text) {
      if (t.id) remove(t.id);
      return;
    }
    setLastStyle({ color: t.color, bg: t.bg });
    if (t.id) patch(t.id, { text, color: t.color, bg: t.bg, size: t.size ?? autoSize(text) });
    else add({ id: newId(), kind: 'text', text, x: t.x, y: t.y, size: t.size ?? autoSize(text), color: t.color, bg: t.bg });
  }

  /** Starts typing: on a new piece of text, or on one already on the story. */
  function startText(existing?: Overlay) {
    if (editing) commitText();
    setSelected(null);
    setToolState('text');
    setEditing(existing ? { id: existing.id, text: existing.text, color: existing.color, bg: !!existing.bg, size: existing.size, x: existing.x, y: existing.y } : { text: '', color: lastStyle.color, bg: lastStyle.bg, x: 0.5, y: freeY(d.overlays, 0.42) });
  }

  // A text story starts with the keyboard ready, as on the iPhone.
  useEffect(() => {
    if (d.kind === 'text' && !d.overlays.length && !d.strokes.length) startText();
  }, []);

  useEffect(() => {
    if (editing) setTimeout(() => textBox.current?.focus(), 0);
  }, [editing?.id, !!editing]);

  /* ----- drawing ----- */

  const drawPoint = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: clamp(((e.clientX - r.left) / r.width) * DRAW_W, 0, DRAW_W), y: clamp(((e.clientY - r.top) / r.height) * DRAW_H, 0, DRAW_H) };
  };
  // The lines as they are now, kept here too: a very long line is saved in pieces within one move.
  const strokes = useRef(d.strokes);
  strokes.current = d.strokes;
  /** Changes the lines, remembering the ones before so Undo (and Undo after Clear) can bring them back. */
  const changeStrokes = (next: Stroke[]) => {
    history.current = [...history.current.slice(-99), strokes.current];
    strokes.current = next;
    set((x) => ({ ...x, strokes: next }));
  };
  function finishStroke() {
    const path = toPath(points.current);
    points.current = [];
    setLive('');
    if (!path) return;
    const used = strokes.current.reduce((n, s) => n + s.d.length, 0);
    if (strokes.current.length >= MAX_STROKES || used + path.length > MAX_DRAWING) {
      toast(t('d.stories.drawingFull'));
      return;
    }
    changeStrokes([...strokes.current, { color: pen.color, width: pen.width, d: path }]);
  }
  const undo = () => {
    const next = history.current.pop() ?? strokes.current.slice(0, -1);
    strokes.current = next;
    set((x) => ({ ...x, strokes: next }));
  };

  /* ----- people to mention ----- */

  useEffect(() => {
    if (tool !== 'mention') return;
    let alive = true;
    const t = setTimeout(() => {
      searchProfiles(q).then(
        (r) => alive && setPeople(r.filter((p) => p.id !== me.id && !p.is_blocked && !p.suspended)),
        () => alive && setPeople([]),
      );
    }, 220);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [tool, q]);

  const sticker = (text: string, x = 0.5, y?: number): Overlay => ({ id: newId(), kind: 'emoji', text, x, y: y ?? freeY(d.overlays, 0.3), size: 72, color: '#ffffff' });
  const mention = (p: { username: string; id: string }, x = 0.5, y?: number): Overlay => ({ id: newId(), kind: 'mention', text: p.username, userId: p.id, x, y: y ?? freeY(d.overlays, 0.62), size: 22, color: '#ffffff' });

  /* ----- the keyboard ----- */

  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  keys.current = (e) => {
    // A sheet or a question is open over the editor: the keys are its own.
    if (document.querySelector('.scrim')) return;
    const t = e.target as HTMLElement | null;
    const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    if (e.key === 'Escape') {
      e.preventDefault();
      if (editing) commitText();
      else if (tool) setTool(null);
      else if (selected) setSelected(null);
      else onLeave();
      return;
    }
    if (typing) return;
    const sel = d.overlays.find((o) => o.id === selected);
    if (sel && (e.key === 'Delete' || e.key === 'Backspace')) {
      e.preventDefault();
      remove(sel.id);
    } else if (sel && e.key.startsWith('Arrow')) {
      e.preventDefault();
      const step = e.shiftKey ? 0.05 : 0.01;
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
      const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
      patch(sel.id, { x: clamp(sel.x + dx, 0.04, 0.96), y: clamp(sel.y + dy, 0.05, 0.95) });
    } else if (sel && e.key === 'Enter' && sel.kind === 'text') {
      e.preventDefault();
      startText(sel);
    } else if (tool === 'draw' && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (strokes.current.length || history.current.length) undo();
    } else if (batch && !sel && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      setPage(clamp(page + (e.key === 'ArrowRight' ? 1 : -1), 0, d.sources.length - 1));
    }
  };
  useEffect(() => {
    const on = (e: KeyboardEvent) => keys.current(e);
    document.addEventListener('keydown', on);
    return () => document.removeEventListener('keydown', on);
  }, []);

  // Videos go round and round while the story is being made.
  useEffect(() => {
    canvas.current?.querySelectorAll('video').forEach((v) => (v.loop = true));
  });

  /* ----- what the canvas shows ----- */

  const shown: Stroke[] = live ? [...d.strokes, { color: pen.color, width: pen.width, d: live }] : d.strokes;
  const base = { ...previewItem(d, page), ...(batch ? {} : { strokes: shown }) };
  const look = d.kind === 'image' && !isNormal(d.filter) ? d.filter : '';
  const drawing = tool === 'draw';
  const chosen = d.overlays.find((o) => o.id === selected) ?? null;

  const dropOnCanvas = (e: React.DragEvent) => {
    const raw = e.dataTransfer.getData(DRAG_TYPE);
    if (!raw) return;
    e.preventDefault();
    const r = canvas.current!.getBoundingClientRect();
    const x = clamp((e.clientX - r.left) / r.width, 0.04, 0.96);
    const y = clamp((e.clientY - r.top) / r.height, 0.05, 0.95);
    try {
      const it = JSON.parse(raw);
      if (it.kind === 'emoji') add(sticker(it.text, x, y));
      else if (it.kind === 'mention') add(mention(it, x, y));
    } catch {
      // not ours
    }
  };

  const overlayHandlers = (o: Overlay) => ({
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      if (editing) commitText();
      e.currentTarget.setPointerCapture(e.pointerId);
      drag.current = { id: o.id, sx: e.clientX, sy: e.clientY, ox: o.x, oy: o.y, moved: false };
    },
    onPointerMove: (e: React.PointerEvent) => {
      const g = drag.current;
      if (!g || g.id !== o.id) return;
      const dx = e.clientX - g.sx;
      const dy = e.clientY - g.sy;
      if (!g.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
      g.moved = true;
      let x = clamp(g.ox + dx / w, 0.04, 0.96);
      let y = clamp(g.oy + dy / h, 0.05, 0.95);
      // Lines up with the middle of the story when close to it, and shows the guide.
      const v = Math.abs(x - 0.5) < 0.015;
      const hz = Math.abs(y - 0.5) < 0.01;
      if (v) x = 0.5;
      if (hz) y = 0.5;
      setGuide(v || hz ? { v, h: hz } : null);
      patch(o.id, { x, y });
    },
    onPointerUp: () => {
      const g = drag.current;
      drag.current = null;
      setGuide(null);
      if (g && !g.moved) setSelected((cur) => (cur === o.id ? null : o.id));
    },
    onDoubleClick: () => (o.kind === 'text' ? startText(o) : undefined),
  });

  const fs = editing ? fontOn(editing.size ?? autoSize(editing.text), w) : 0;
  const ink = editing ? (textStyle(editing, fs).color as string) : '#fff';

  return (
    <>
      {/* left: the pages of a batch */}
      <div className="stc-left">
        {batch ? (
          <div className="stc-strip" aria-label={t('d.stories.inThisBatch')}>
            <p>{t('d.stories.batchNote', { count: d.sources.length })}</p>
            {d.sources.map((s, i) => (
              <div key={s.url} className={'stc-thumb' + (i === page ? ' on' : '')}>
                <button className="stc-thumb-pic" aria-label={t('d.stories.storyNOfTotal', { n: i + 1, total: d.sources.length })} aria-current={i === page} onClick={() => setPage(i)}>
                  {s.type === 'video' && !s.poster ? <video src={s.url} muted preload="metadata" /> : <img src={s.poster ?? s.url} alt="" />}
                  {s.type === 'video' ? <Icon name="video" size={14} color="#fff" className="stc-thumb-kind" /> : null}
                </button>
                <button
                  className="stc-thumb-x"
                  aria-label={t('d.stories.removeStoryN', { n: i + 1 })}
                  onClick={() => {
                    const rest = d.sources.filter((_, j) => j !== i);
                    // One left: it is an ordinary photo or video story again, with every tool.
                    set((x) => ({ ...x, kind: rest.length > 1 ? 'batch' : rest[0].type, sources: rest }));
                    setPage(Math.min(page, rest.length - 1));
                  }}
                >
                  <Icon name="close" size={12} color="#fff" stroke={2.6} />
                </button>
              </div>
            ))}
            {d.sources.length < MAX_FILES ? (
              <button className="stc-thumb stc-thumb-add" aria-label={t('d.stories.addPhotosOrVideos')} onClick={() => moreInput.current?.click()}>
                <Icon name="plus" size={22} color="#fff" />
              </button>
            ) : null}
            <input ref={moreInput} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => { onMore(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
          </div>
        ) : null}
      </div>

      {/* middle: the story */}
      <div className="stc-center" style={{ width: w }}>
        <div
          ref={canvas}
          className={'stc-canvas' + (drawing ? ' drawing' : '')}
          style={{ width: w, height: h }}
          onDragOver={(e) => {
            if (!batch && e.dataTransfer.types.includes(DRAG_TYPE)) {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'copy';
            }
          }}
          onDrop={dropOnCanvas}
          data-testid="story-canvas"
        >
          <div className={'stc-base' + (look ? ' stc-filtered' : '')} style={look ? ({ ['--stc-look' as any]: `url(#stc-look-${look})` } as React.CSSProperties) : undefined}>
            <StoryCanvas item={base} width={w} height={h} muted />
          </div>
          <div
            className="stc-hit"
            onPointerDown={() => {
              if (editing) commitText();
              else if (selected) setSelected(null);
              else if (d.kind === 'text' && !d.overlays.length && !tool) startText();
            }}
          />

          {d.kind === 'text' && !d.overlays.length && !d.strokes.length && !editing && !drawing ? (
            <button className="stc-type-here" onClick={() => startText()}>
              {t('d.stories.clickToType')}
            </button>
          ) : null}

          {!batch && !drawing && !editing && !chosen && !d.caption.trim() && tool !== 'caption' ? (
            <button className="stc-caption-hint" onClick={() => setTool('caption')}>
              {t('createFlow.captionPlaceholder')}
            </button>
          ) : null}

          {batch
            ? null
            : d.overlays.map((o) =>
                o.id === editing?.id ? null : (
                  <div key={o.id} className="stc-box" style={boxStyle(o.x, o.y, w, h)}>
                    <div
                      className={'stc-ov' + (selected === o.id ? ' on' : '') + (drawing ? ' still' : '')}
                      role="button"
                      tabIndex={0}
                      aria-label={t('d.stories.overlayLabel', { kind: t(o.kind === 'mention' ? 'd.stories.mention' : o.kind === 'emoji' ? 'd.stories.sticker' : 'd.stories.text'), text: o.text })}
                      aria-pressed={selected === o.id}
                      data-kind={o.kind}
                      {...overlayHandlers(o)}
                    >
                      <OverlayLabel o={o} w={w} />
                    </div>
                  </div>
                ),
              )}

          {editing ? (
            <div className="stc-box" style={boxStyle(editing.x, editing.y, w, h)}>
              <div className="stc-grow story-text" data-value={editing.text || t('d.stories.typeSomething')} style={{ ...textStyle(editing, fs), textShadow: editing.bg ? 'none' : '0 1px 4px rgba(0,0,0,.35)' }}>
                <textarea
                  ref={textBox}
                  value={editing.text}
                  maxLength={160}
                  rows={1}
                  placeholder={t('d.stories.typeSomething')}
                  aria-label={t('d.stories.storyText')}
                  spellCheck
                  style={{ color: ink, caretColor: ink }}
                  onChange={(e) => setEditing({ ...editing, text: e.target.value })}
                />
              </div>
            </div>
          ) : null}

          {guide?.v ? <span className="stc-guide v" /> : null}
          {guide?.h ? <span className="stc-guide h" /> : null}

          {drawing ? (
            <div
              className="stc-drawpad"
              aria-label={t('d.stories.drawingArea')}
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                e.currentTarget.setPointerCapture(e.pointerId);
                points.current = [drawPoint(e)];
                setLive(toPath(points.current));
              }}
              onPointerMove={(e) => {
                if (!points.current.length) return;
                const p = drawPoint(e);
                const last = points.current[points.current.length - 1];
                // Points almost on top of the last one are skipped, to keep the drawing small.
                if (last && Math.abs(last.x - p.x) + Math.abs(last.y - p.y) < 7) return;
                if (points.current.length >= 600) {
                  // A very long line is saved in pieces, so it keeps following the mouse.
                  finishStroke();
                  points.current = [last];
                }
                points.current.push(p);
                setLive(toPath(points.current));
              }}
              onPointerUp={finishStroke}
              onPointerCancel={finishStroke}
            />
          ) : null}

          {chosen && !drawing && !editing ? (
            <div className="stc-selbar" role="toolbar" aria-label={t('d.stories.selected')}>
              <RoundButton glyph="A−" label={t('d.stories.smaller')} onClick={() => patch(chosen.id, { size: clamp(Math.round(chosen.size / 1.18), 12, 140) })} />
              <RoundButton glyph="A+" label={t('d.stories.bigger')} onClick={() => patch(chosen.id, { size: clamp(Math.round(chosen.size * 1.18), 12, 140) })} />
              {chosen.kind === 'text' ? <RoundButton icon="compose" label={t('d.stories.editText')} onClick={() => startText(chosen)} /> : null}
              <RoundButton icon="trash" label={t('live.remove')} onClick={() => remove(chosen.id)} />
              <RoundButton icon="check" label={t('createFlow.done')} onClick={() => setSelected(null)} />
            </div>
          ) : null}

          {batch ? (
            <>
              {page > 0 ? (
                <button className="stc-page left" aria-label={t('d.stories.previousStory')} onClick={() => setPage(page - 1)}>
                  <Icon name="back" size={16} color="#000" stroke={2.4} />
                </button>
              ) : null}
              {page < d.sources.length - 1 ? (
                <button className="stc-page right" aria-label={t('d.stories.nextStory')} onClick={() => setPage(page + 1)}>
                  <Icon name="right" size={16} color="#000" stroke={2.4} />
                </button>
              ) : null}
              <span className="stc-count">{t('d.stories.nOfTotal', { n: page + 1, total: d.sources.length })}</span>
            </>
          ) : null}
        </div>
        {drawing || editing ? <div className="stc-bottom stc-bottom-note">{drawing ? t('d.stories.dragToDraw') : t('d.stories.typeOnStory')}</div> : bottom}
      </div>

      {/* right: the tools, and the open tool's options */}
      <div className="stc-right">
        <div className="stc-tools" role="toolbar" aria-label={t('d.stories.tools')} aria-orientation="vertical">
          {batch ? null : (
            <>
              <ToolButton glyph="Aa" label={t('d.stories.text')} active={tool === 'text'} onClick={() => (tool === 'text' ? commitText() : startText())} />
              <ToolButton icon="sticker" label={t('d.stories.stickers')} active={tool === 'sticker'} onClick={() => { if (editing) commitText(); setTool(tool === 'sticker' ? null : 'sticker'); }} />
              <ToolButton icon="at" label={t('d.stories.mention')} active={tool === 'mention'} onClick={() => { if (editing) commitText(); setQ(''); setPeople(null); setTool(tool === 'mention' ? null : 'mention'); }} />
              <ToolButton icon="draw" label={t('d.stories.draw')} active={drawing} onClick={() => { if (editing) commitText(); setTool(drawing ? null : 'draw'); }} />
              <ToolButton icon="compose" label={t('create.caption')} active={tool === 'caption'} onClick={() => { if (editing) commitText(); setTool(tool === 'caption' ? null : 'caption'); }} />
              {d.kind === 'image' ? <ToolButton icon="sparkle" label={t('d.stories.filters')} active={tool === 'filter'} onClick={() => { if (editing) commitText(); setTool(tool === 'filter' ? null : 'filter'); }} /> : null}
              {d.kind === 'text' ? <ToolButton label={t('d.stories.background')} swatch={gradientOf(d.bg)} active={tool === 'background'} onClick={() => { if (editing) commitText(); setTool(tool === 'background' ? null : 'background'); }} /> : null}
            </>
          )}
          {canFit && current ? (
            <ToolButton
              icon="expand"
              label={current.fit === 'contain' ? t('d.stories.fillFrame') : t('d.stories.showWhole')}
              active={current.fit === 'contain'}
              onClick={() => set((x) => ({ ...x, sources: x.sources.map((s, i) => (i === page ? { ...s, fit: s.fit === 'contain' ? 'cover' : 'contain' } : s)) }))}
            />
          ) : null}
        </div>

        {tool && tool !== 'text' ? (
          <div className="stc-panel" role="region" aria-label={t(PANEL_TITLES[tool])}>
            <div className="stc-panel-head">
              <h3>{t(PANEL_TITLES[tool])}</h3>
              <button className="link-btn" onClick={() => setTool(null)}>
                {t('createFlow.done')}
              </button>
            </div>

            {tool === 'draw' ? (
              <div className="stc-panel-body">
                <h4>{t('d.stories.colour')}</h4>
                <Swatches value={pen.color} label={t('d.stories.penColour')} onPick={(color) => setPen({ ...pen, color })} />
                <h4>{t('d.stories.pen')}</h4>
                <div className="stc-pens" role="radiogroup" aria-label={t('d.stories.penSize')}>
                  {PEN_WIDTHS.map((p) => (
                    <button key={p.id} role="radio" aria-checked={pen.width === p.id} className={'stc-pen' + (pen.width === p.id ? ' on' : '')} onClick={() => setPen({ ...pen, width: p.id })}>
                      <i style={{ width: Math.max(4, (p.id * w) / DRAW_W + 2), height: Math.max(4, (p.id * w) / DRAW_W + 2), background: pen.color }} />
                      {t(p.label)}
                    </button>
                  ))}
                </div>
                <div className="stc-row-btns">
                  <button className="btn quiet" disabled={!d.strokes.length && !history.current.length} onClick={undo}>
                    <Icon name="undo" size={16} /> {t('d.stories.undo')}
                  </button>
                  <button className="btn quiet" disabled={!d.strokes.length} onClick={() => changeStrokes([])}>
                    <Icon name="trash" size={16} /> {t('createFlow.clear')}
                  </button>
                </div>
                <p className="stc-note">{tn('d.stories.linesNote', d.strokes.length, { shortcut: navigator.platform.includes('Mac') ? '⌘Z' : 'Ctrl+Z' })}</p>
              </div>
            ) : null}

            {tool === 'sticker' ? (
              <div className="stc-panel-body">
                <div className="stc-emoji">
                  {EMOJI.map((e) => (
                    <button
                      key={e}
                      aria-label={t('d.stories.stickerValue', { emoji: e })}
                      draggable
                      onDragStart={(ev) => {
                        ev.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ kind: 'emoji', text: e }));
                        ev.dataTransfer.effectAllowed = 'copy';
                      }}
                      onClick={() => add(sticker(e))}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {tool === 'mention' ? (
              <div className="stc-panel-body stc-people">
                <input className="stc-search" autoFocus placeholder={t('createFlow.searchPeople')} aria-label={t('createFlow.searchPeople')} value={q} onChange={(e) => setQ(e.target.value)} />
                {people === null ? <Spinner size={22} /> : null}
                {people && !people.length ? <p className="stc-note">{t('d.stories.noOneFoundTry')}</p> : null}
                {(people ?? []).map((p) => (
                  <button
                    key={p.id}
                    className="row full hover stc-person"
                    aria-label={t('d.stories.mentionUser', { username: p.username })}
                    draggable
                    onDragStart={(ev) => {
                      ev.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ kind: 'mention', username: p.username, id: p.id }));
                      ev.dataTransfer.effectAllowed = 'copy';
                    }}
                    onClick={() => {
                      add(mention(p));
                      setTool(null);
                    }}
                  >
                    <Avatar src={p.avatar_url} name={p.username} size={36} />
                    <span className="row-text">
                      <b>{p.username}</b>
                      <span>{p.full_name}</span>
                    </span>
                  </button>
                ))}
              </div>
            ) : null}

            {tool === 'caption' ? (
              <div className="stc-panel-body">
                <textarea className="stc-caption-input" autoFocus maxLength={200} rows={4} placeholder={t('createFlow.captionPlaceholder')} aria-label={t('create.caption')} value={d.caption} onChange={(e) => set((x) => ({ ...x, caption: e.target.value }))} />
                <p className="stc-note right">{d.caption.length}/200</p>
              </div>
            ) : null}

            {tool === 'filter' && current ? (
              <div className="stc-panel-body">
                <div className="stc-filters">
                  {FILTERS.map((f) => (
                    <button key={f.id} className={'stc-filter' + (d.filter === f.id ? ' on' : '')} aria-pressed={d.filter === f.id} onClick={() => set((x) => ({ ...x, filter: f.id }))}>
                      <img src={current.url} alt="" style={{ filter: `url(#stc-look-${f.id})` }} />
                      <span>{f.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {tool === 'background' ? (
              <div className="stc-panel-body">
                <div className="stc-backgrounds" role="radiogroup" aria-label={t('d.stories.background')}>
                  {STORY_BACKGROUNDS.map((_, i) => (
                    <button key={i} role="radio" aria-checked={d.bg === i} aria-label={t('d.stories.backgroundN', { n: i + 1 })} className={'stc-bgchoice' + (d.bg === i ? ' on' : '')} style={{ background: gradientOf(i) }} onClick={() => set((x) => ({ ...x, bg: i }))} />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {editing ? (
          <div className="stc-panel" role="region" aria-label={t('d.stories.text')}>
            <div className="stc-panel-head">
              <h3>{t('d.stories.text')}</h3>
              <button className="link-btn" onMouseDown={(e) => e.preventDefault()} onClick={commitText}>
                {t('createFlow.done')}
              </button>
            </div>
            <div className="stc-panel-body">
              <h4>{t('d.stories.colour')}</h4>
              <Swatches value={editing.color} label={t('d.stories.textColour')} onPick={(color) => setEditing({ ...editing, color })} />
              <h4>{t('d.stories.style')}</h4>
              <div className="stc-styles" role="radiogroup" aria-label={t('d.stories.textStyle')}>
                <button role="radio" aria-checked={!editing.bg} className={'stc-style' + (!editing.bg ? ' on' : '')} onMouseDown={(e) => e.preventDefault()} onClick={() => setEditing({ ...editing, bg: false })}>
                  <b className="plain">A</b> {t('d.stories.plain')}
                </button>
                <button role="radio" aria-checked={editing.bg} className={'stc-style' + (editing.bg ? ' on' : '')} onMouseDown={(e) => e.preventDefault()} onClick={() => setEditing({ ...editing, bg: true })}>
                  <b className="label">A</b> {t('d.stories.label')}
                </button>
              </div>
              <h4>{t('d.stories.size')}</h4>
              <input type="range" className="stc-size" min={14} max={80} aria-label={t('d.stories.textSize')} value={editing.size ?? autoSize(editing.text)} onChange={(e) => setEditing({ ...editing, size: Number(e.target.value) })} onPointerUp={() => textBox.current?.focus()} />
              {editing.id ? (
                <button className="btn danger-outline block stc-remove" onMouseDown={(e) => e.preventDefault()} onClick={() => { remove(editing.id!); setEditing(null); setToolState(null); }}>
                  {t('d.stories.removeText')}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}

// Keys: t(PANEL_TITLES[tool]) where the panel is drawn.
const PANEL_TITLES: Record<Exclude<Tool, null>, string> = { text: 'd.stories.text', draw: 'd.stories.draw', sticker: 'd.stories.stickers', mention: 'd.stories.mentionSomeone', caption: 'create.caption', filter: 'd.stories.filters', background: 'd.stories.background' };
