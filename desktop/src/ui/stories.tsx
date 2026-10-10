// Stories: the row at the top of Home and the full-screen viewer, laid out like Instagram's 2026
// desktop web: the story in a tall card in the middle, the people before and after it as smaller
// dimmed cards on both sides. The steps are the iPhone app's (app/(app)/story/[id].tsx and
// src/components/StoryPlayer.tsx): rings turn grey once everything is watched, your own story shows
// who watched it, someone else's has a reply bar.
// Stories are drawn the same way as on the iPhone (src/components/StoryCanvas.tsx): photo, video,
// text background or collage, then drawing, caption, text, emoji and @mentions on top.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { allStoriesSeen, coverOf, deleteStory, fetchStoryViewersDetailed, markStorySeen, noteStorySeen, openThread, sendMessage } from 'shared/api';
import { announce, listen } from 'shared/store';
import { ago, fmt } from 'shared/theme';
import type { LiveCard, Overlay, Story, StoryGroup, StoryItem, StoryViewer as Viewer } from 'shared/types';
import { useMe } from '../lib/me';
import { nav } from '../lib/router';
import '../styles/stories.css';
import { Avatar, Icon, Verified, ask, toast, toastError } from './kit';
import { Wordmark } from './sidebar';
import { AboutAccount, HighlightPicker, ReportSheet, SendStory, StoryMenu, StorySettings, ViewersSheet, ringStyle, setStoriesMuted, useLooks, useMutedStories } from './story-extras';

const BACKGROUNDS: [string, string][] = [
  ['#4a5df6', '#b13df0'],
  ['#ff7a3d', '#ff3d77'],
  ['#0fb58a', '#0a6cf0'],
  ['#15191e', '#3a4350'],
  ['#f5b301', '#f0562e'],
  ['#d6336c', '#7048e8'],
];
const DRAW_W = 1000;
const DRAW_H = 1778;

const textBackground = (item: StoryItem) => {
  const bg = BACKGROUNDS[(item.bg ?? 0) % BACKGROUNDS.length];
  return `linear-gradient(135deg, ${bg[0]}, ${bg[1]})`;
};

function inkOn(hex: string): string {
  const n = parseInt(hex.replace('#', '').padEnd(6, '0').slice(0, 6), 16);
  const lum = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return lum > 160 ? '#000000' : '#ffffff';
}

function OverlayLabel({ o, w, onMention }: { o: Overlay; w: number; onMention?: (id: string) => void }) {
  const fs = Math.max(10, (o.size * w) / 390);
  if (o.kind === 'emoji') return <span style={{ fontSize: fs, lineHeight: 1.25 }}>{o.text}</span>;
  if (o.kind === 'mention') {
    return (
      <button className="story-mention" style={{ fontSize: fs, borderRadius: fs * 0.36, padding: `${fs * 0.2}px ${fs * 0.46}px` }} onClick={() => o.userId && onMention?.(o.userId)}>
        @{o.text}
      </button>
    );
  }
  return (
    <span
      className="story-text"
      style={{
        fontSize: fs,
        color: o.bg ? inkOn(o.color) : o.color,
        background: o.bg ? o.color : 'transparent',
        borderRadius: fs * 0.3,
        padding: o.bg ? `${fs * 0.16}px ${fs * 0.42}px` : 0,
        textShadow: o.bg ? 'none' : '0 1px 4px rgba(0,0,0,.35)',
      }}
    >
      {o.text}
    </span>
  );
}

/**
 * One story drawn at a size. `onVideoError` says a video can't be played here (its still picture
 * stays up), and `onBlocked` that the browser refused to start it with sound.
 */
export function StoryCanvas({ item, width, height, paused, muted, onVideoEnd, onDuration, onMention, onVideoError, onBlocked }: { item: StoryItem; width: number; height: number; paused?: boolean; muted?: boolean; onVideoEnd?: () => void; onDuration?: (s: number) => void; onMention?: (id: string) => void; onVideoError?: () => void; onBlocked?: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (paused) v.pause();
    else
      v.play().catch((e) => {
        if (e?.name === 'NotAllowedError') onBlocked?.();
      });
  }, [paused, item.url, muted]);
  const fit = item.fit === 'contain' ? 'contain' : 'cover';
  let media: React.ReactNode = null;
  if (item.type === 'text') media = <div className="fill" style={{ background: textBackground(item) }} />;
  else if (item.type === 'collage') {
    const urls = (item.urls ?? []).slice(0, 4);
    media = (
      <div className={'fill collage n' + urls.length}>
        {urls.map((u, i) => (
          <img key={i} src={u} alt="" />
        ))}
      </div>
    );
  } else if (item.type === 'video') {
    media = <video ref={video} className="fill" src={item.url} poster={item.poster} muted={muted} playsInline autoPlay={!paused} style={{ objectFit: fit }} onEnded={onVideoEnd} onError={onVideoError} onLoadedMetadata={(e) => onDuration?.(e.currentTarget.duration)} />;
  } else if (item.url) {
    media =
      fit === 'contain' ? (
        <>
          <img className="fill blur" src={item.url} alt="" />
          <img className="fill" src={item.url} alt="" style={{ objectFit: 'contain' }} />
        </>
      ) : (
        <img className="fill" src={item.url} alt="" />
      );
  }
  return (
    <div className="story-canvas" style={{ width, height }}>
      {media}
      {item.strokes?.length ? (
        <svg className="fill" viewBox={`0 0 ${DRAW_W} ${DRAW_H}`} preserveAspectRatio="none">
          {item.strokes.map((s, i) => (
            <path key={i} d={s.d} stroke={s.color} strokeWidth={s.width} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          ))}
        </svg>
      ) : null}
      {item.caption ? (
        <div className="story-caption" style={{ fontSize: Math.max(13, (16 * width) / 390) }}>
          {item.caption}
        </div>
      ) : null}
      {(item.overlays ?? []).map((o) => (
        <div key={o.id} className="story-overlay" style={{ left: o.x * width - width * 0.46, top: o.y * height - height * 0.25, width: width * 0.92, height: height * 0.5 }}>
          <OverlayLabel o={o} w={width} onMention={onMention} />
        </div>
      ))}
    </div>
  );
}

/* ---------- the row on the home page ---------- */

const RING_SIZE = 77;

/**
 * The circles at the top of Home: anyone broadcasting first (LIVE), then your story, then everyone
 * else's (the server's order: unseen first, Plus members first among those). A ring goes grey once
 * every story in it has been watched, straight away from what this computer knows (allStoriesSeen),
 * as on the iPhone. Plus members' rings are in the colour they chose; close friends' are blue.
 * `loading` can be passed; otherwise empty circles shimmer until the first answer arrives.
 */
export function StoryTray({ groups, lives = [], onOpen, onAdd, loading }: { groups: StoryGroup[]; lives?: LiveCard[]; onOpen: (index: number) => void; onAdd: () => void; loading?: boolean }) {
  const { me } = useMe();
  const strip = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const [, redraw] = useState(0);
  const muted = useMutedStories();
  // Until Home hands over both first answers (stories and lives), shimmering circles stand where the
  // stories will be, so nothing jumps sideways when the second arrives.
  const first = useRef({ groups, lives });
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setWaited(true), 3000);
    return () => clearTimeout(t);
  }, []);
  const loaded = loading !== undefined ? !loading : waited || (groups !== first.current.groups && lives !== first.current.lives);
  // A story just watched turns its ring grey at once; Home loads the tray again behind it.
  useEffect(() => listen('stories', () => redraw((n) => n + 1)), []);

  const measure = useCallback(() => {
    const el = strip.current;
    if (el) setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
  }, []);
  useEffect(measure, [groups.length, lives.length, loaded, muted.length]);
  useEffect(() => {
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const now = loaded ? lives.filter((l) => !l.ended_at) : [];
  const myLive = now.find((l) => l.user_id === me.id);
  const otherLives = now.filter((l) => l.user_id !== me.id);
  const liveIds = new Set(otherLives.map((l) => l.user_id));
  const mine = groups.find((g) => g.user_id === me.id);
  // Someone who is live shows once, as live; muted people go to the end.
  const others = groups.filter((g) => g.user_id !== me.id && !liveIds.has(g.user_id));
  const ordered = [...others.filter((g) => !muted.includes(g.user_id)), ...others.filter((g) => muted.includes(g.user_id))];
  const looks = useLooks(ordered.map((g) => g.user_id));
  const seen = (g: StoryGroup) => g.seen || allStoriesSeen(g.stories, me.id);
  const mineSeen = mine ? seen(mine) : true;

  return (
    <div className="tray-wrap sv-tray-wrap">
      <div className="tray sv-tray" ref={strip} onScroll={measure} role="list" aria-label="Stories">
        {myLive ? (
          <div className="tray-item is-live" role="listitem">
            <button className="sv-circle" onClick={() => nav('/live/new')} aria-label="Your live broadcast">
              <Avatar src={me.avatar_url} name={me.username} size={RING_SIZE} ring="live" />
              <span className="live-badge">LIVE</span>
            </button>
            <span className="tray-name">You</span>
          </div>
        ) : null}
        {otherLives.map((l) => (
          <div className="tray-item is-live" role="listitem" key={'live-' + l.id}>
            <button className="sv-circle" onClick={() => nav('/live/' + l.id)} aria-label={l.username + ' is live'}>
              <Avatar src={l.avatar_url} name={l.username} size={RING_SIZE} ring="live" />
              <span className="live-badge">LIVE</span>
            </button>
            <span className="tray-name">{l.username}</span>
          </div>
        ))}
        <div className="tray-item is-me" role="listitem">
          <span className="tray-me">
            <button className="sv-circle" style={ringStyle(me.plus ? { ring: me.ring_color, plus: true, verified: false } : undefined)} onClick={() => (mine ? onOpen(groups.indexOf(mine)) : onAdd())} aria-label={mine ? 'Your story' : 'Add to your story'}>
              <Avatar src={me.avatar_url} name={me.username} size={mine ? RING_SIZE : RING_SIZE + 10} ring={mine ? (mineSeen ? 'seen' : mine.close ? 'close' : 'new') : null} />
            </button>
            {!mine ? (
              <button className="tray-plus sv-plus" aria-label="Add to your story" onClick={onAdd}>
                <Icon name="plus" size={13} color="var(--bg)" stroke={3} />
              </button>
            ) : null}
          </span>
          <span className="tray-name">Your story</span>
        </div>
        {loaded
          ? ordered.map((g) => {
              const done = seen(g);
              return (
                <div className={'tray-item' + (muted.includes(g.user_id) ? ' is-muted' : '')} role="listitem" key={g.user_id}>
                  <button className="sv-circle" style={ringStyle(looks.get(g.user_id))} onClick={() => onOpen(groups.indexOf(g))} aria-label={'Story by ' + g.username + (done ? ', seen' : '')}>
                    <Avatar src={g.avatar_url} name={g.username} size={RING_SIZE} ring={done ? 'seen' : g.close ? 'close' : 'new'} />
                  </button>
                  <span className={'tray-name' + (done ? ' seen' : '')}>{g.username}</span>
                </div>
              );
            })
          : [0, 1, 2, 3, 4].map((i) => (
              <div className="tray-item sv-skeleton" key={'sk' + i} aria-hidden="true">
                <span className="sv-shimmer sv-sk-circle" />
                <span className="sv-shimmer sv-sk-name" />
              </div>
            ))}
      </div>
      {loaded ? null : <span className="sv-sr" role="status">Loading stories</span>}
      {edges.left ? (
        <button className="tray-arrow sv-arrow left" aria-label="Scroll left" onClick={() => strip.current?.scrollBy({ left: -330, behavior: 'smooth' })}>
          <Icon name="back" size={14} color="#262626" stroke={2.6} />
        </button>
      ) : null}
      {edges.right ? (
        <button className="tray-arrow sv-arrow right" aria-label="Scroll right" onClick={() => strip.current?.scrollBy({ left: 330, behavior: 'smooth' })}>
          <Icon name="right" size={14} color="#262626" stroke={2.6} />
        </button>
      ) : null}
    </div>
  );
}

/* ---------- the viewer ---------- */

const PHOTO_SECONDS = 5;

type Sheet = 'viewers' | 'menu' | 'report' | 'about' | 'highlight' | 'settings' | 'send' | 'confirm';

/** Sizes for the window: the story card as tall as fits, and up to two smaller cards on each side. */
function measureStage() {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const h = Math.max(320, Math.min(H - 32, 1100));
  const w = Math.round((h * 9) / 16);
  const near = Math.round(w * 0.13);
  const far = Math.round(w * 0.1);
  const side = (W - w) / 2 - 20;
  let n = 0;
  let peekW = 0;
  for (const k of [2, 1]) {
    const pw = Math.min(w * 0.4, (side - near - (k - 1) * far) / k);
    if (pw >= w * 0.28) {
      n = k;
      peekW = Math.floor(pw);
      break;
    }
  }
  return { w, h, near, far, n, peekW, peekH: Math.round((peekW * 16) / 9) };
}

/**
 * Plays stories one after another. `groups` is the tray (or one person's stories, or a highlight
 * dressed as stories); it is kept as it was when the viewer opened, so the order doesn't shift while
 * rings turn grey behind it. `highlight` names a highlight being played (it is also recognised by its
 * items never having been live).
 */
export function StoryViewer({ groups: given, start, onClose, onChanged, highlight }: { groups: StoryGroup[]; start: number; onClose: () => void; onChanged?: () => void; highlight?: { title: string } }) {
  const { me } = useMe();
  const [groups, setGroups] = useState(given);
  const isHighlight = !!highlight || given.every((g) => g.stories.every((s) => !s.in_tray && s.expires_at <= s.created_at));
  const firstToShow = (g?: StoryGroup) => {
    if (!g || isHighlight) return 0;
    const i = g.stories.findIndex((s) => !allStoriesSeen([s], me.id));
    return i > 0 ? i : 0;
  };
  const [gi, setGi] = useState(Math.min(Math.max(0, start), Math.max(0, given.length - 1)));
  const [si, setSi] = useState(() => firstToShow(given[start]));
  const [paused, setPaused] = useState(false);
  const [hold, setHold] = useState(false);
  const [muted, setMuted] = useState(false);
  const [reply, setReply] = useState('');
  const [typing, setTyping] = useState(false);
  const [hearted, setHearted] = useState('');
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [videoFailed, setVideoFailed] = useState('');
  const [videoDur, setVideoDur] = useState(0);
  const [faces, setFaces] = useState<Record<string, Viewer[]>>({});
  const [size, setSize] = useState(measureStage);
  const progress = useRef(0);
  const bar = useRef<HTMLElement | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const downAt = useRef(0);
  const pressed = useRef<number | null>(null);
  const group = groups[gi];
  const story: Story | undefined = group?.stories[Math.min(si, (group?.stories.length ?? 1) - 1)];
  const mine = group?.user_id === me.id;
  const looks = useLooks(groups.map((g) => g.user_id));
  const isVideo = story?.item.type === 'video' && !!story.item.url && videoFailed !== story.id;
  const held = paused || hold || typing || reply.length > 0 || sheet !== null;
  const dur = isVideo ? videoDur || story?.item.duration || 15 : PHOTO_SECONDS;

  useEffect(() => {
    const fit = () => setSize(measureStage());
    window.addEventListener('resize', fit);
    document.body.classList.add('no-scroll');
    return () => {
      window.removeEventListener('resize', fit);
      document.body.classList.remove('no-scroll');
      // However the viewer is left, the rings on Home catch up.
      announce('stories');
    };
  }, []);

  const go = (g: number, s: number) => {
    setGi(g);
    setSi(s);
  };
  const next = () => {
    if (!group) return;
    if (si < group.stories.length - 1) setSi(si + 1);
    else if (gi < groups.length - 1) go(gi + 1, firstToShow(groups[gi + 1]));
    else onClose();
  };
  const prev = () => {
    if (si > 0) setSi(si - 1);
    else if (gi > 0) go(gi - 1, 0);
    else {
      // Already at the very first story: start it again.
      progress.current = 0;
      const v = card.current?.querySelector('video');
      if (v) v.currentTime = 0;
    }
  };
  const nextRef = useRef(next);
  nextRef.current = next;
  const prevRef = useRef(prev);
  prevRef.current = prev;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // Each story as it comes on screen: the clock starts again, and it counts as watched.
  useEffect(() => {
    if (!story) return;
    progress.current = 0;
    paint();
    setVideoDur(0);
    setHearted('');
    if (isHighlight) return;
    const own = story.user_id === me.id;
    noteStorySeen(story.id, own);
    if (!own) markStorySeen(me.id, story.id).catch(() => {});
    else if (!faces[story.id]) fetchStoryViewersDetailed(story.id).then((v) => setFaces((f) => ({ ...f, [story.id]: v })), () => {});
  }, [story?.id]);

  function paint() {
    if (bar.current) bar.current.style.width = `${progress.current * 100}%`;
  }

  // The clock: a video's own time while it plays, otherwise five seconds for a photo (or a video
  // that can't be played here, which keeps its still picture up).
  useEffect(() => {
    if (!story || held) return;
    let last = performance.now();
    let raf = 0;
    let done = false;
    const step = (t: number) => {
      const dt = (t - last) / 1000;
      last = t;
      const v = isVideo ? card.current?.querySelector('video') : null;
      if (v && v.duration > 0 && isFinite(v.duration) && v.currentTime > 0 && !v.error) progress.current = Math.min(1, v.currentTime / v.duration);
      else progress.current = Math.min(1, progress.current + dt / dur);
      paint();
      if (progress.current >= 1 && !done) {
        done = true;
        nextRef.current();
        return;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [story?.id, held, dur, isVideo]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) {
        if (e.key === 'Escape') t.blur();
        return;
      }
      // A sheet or a question is open over the story: the keys are its own.
      if (document.querySelector('.scrim')) return;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        nextRef.current();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prevRef.current();
      } else if (e.key === 'Escape') closeRef.current();
      else if (e.key === ' ') {
        e.preventDefault();
        setPaused((p) => !p);
      }
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, []);

  if (!group || !story) return null;
  const cover = coverOf(story.item);
  const verified = looks.get(group.user_id)?.verified || !!story.verified;
  const allowed = story.story_replies === 'everyone' || (story.story_replies === 'following' && story.follows_viewer);

  const openProfile = () => {
    onClose();
    nav('/u/' + group.username);
  };

  const send = async (body: string, heart = false) => {
    if (!body.trim()) return;
    if (heart) setHearted(story.id);
    try {
      const tid = await openThread(group.user_id);
      await sendMessage(me.id, tid, { text: body, media_url: cover || undefined });
      if (!heart) {
        setReply('');
        (document.activeElement as HTMLElement | null)?.blur?.();
      }
      toast(heart ? 'Sent' : 'Reply sent');
    } catch (e) {
      if (heart) setHearted('');
      toastError(e);
    }
  };

  const remove = async () => {
    setSheet('confirm');
    if (!(await ask('Delete this story?', 'It stays in any highlight you added it to.', 'Delete'))) return setSheet(null);
    try {
      await deleteStory(story.id);
      toast('Story deleted');
      onChanged?.();
      const rest = group.stories.filter((s) => s.id !== story.id);
      if (!rest.length) return onClose();
      setGroups((gs) => gs.map((g, i) => (i === gi ? { ...g, stories: rest } : g)));
      setSi(Math.min(si, rest.length - 1));
      setSheet(null);
    } catch (e) {
      toastError(e);
      setSheet(null);
    }
  };

  // The smaller card for the person `offset` places away, or an empty space to keep the row balanced.
  const peek = (offset: number) => {
    const at = gi + offset;
    const g = groups[at];
    const box = { width: size.peekW, height: size.peekH };
    if (!g) return <span key={offset} className="sv-peek empty" style={box} aria-hidden="true" />;
    const s = g.stories[firstToShow(g)] ?? g.stories[0];
    const pic = coverOf(s.item);
    const seen = isHighlight || allStoriesSeen(g.stories, me.id);
    return (
      <button key={offset} className="sv-peek story-peek" style={box} onClick={() => go(at, firstToShow(g))} aria-label={'Story by ' + g.username}>
        {pic ? <img src={pic} alt="" /> : <span className="sv-peek-fill" style={{ background: textBackground(s.item) }} />}
        <span className="sv-peek-who">
          <span className="sv-circle" style={ringStyle(looks.get(g.user_id))}>
            <Avatar src={g.avatar_url} name={g.username} size={Math.round(size.peekW * 0.36)} ring={seen ? 'seen' : g.close ? 'close' : 'new'} />
          </span>
          <b>{g.username}</b>
          <span>{ago(s.created_at)}</span>
        </span>
      </button>
    );
  };
  const side = (offsets: number[]) => offsets.map((o, i) => <React.Fragment key={o}>{i ? <span style={{ width: size.far, flex: 'none' }} /> : null}{peek(o)}</React.Fragment>);
  const left = size.n === 2 ? [-2, -1] : size.n === 1 ? [-1] : [];
  const right = size.n === 2 ? [1, 2] : size.n === 1 ? [1] : [];
  const watchers = faces[story.id] ?? [];

  // A short click on the left or right of the story moves; holding it down pauses.
  const tap = (dir: 1 | -1) => ({
    onPointerDown: () => {
      downAt.current = Date.now();
      pressed.current = null;
      setHold(true);
    },
    onPointerUp: () => {
      pressed.current = Date.now() - downAt.current;
      setHold(false);
    },
    onPointerLeave: () => setHold(false),
    onClick: () => {
      const ms = pressed.current;
      pressed.current = null;
      if (ms === null || ms < 350) (dir === 1 ? next : prev)();
    },
  });

  return createPortal(
    <div className="sv-stage story-stage" role="dialog" aria-modal="true" aria-label={(isHighlight ? 'Highlight by ' : 'Stories by ') + group.username}>
      <button className="sv-brand" aria-label="Community, close stories" onClick={() => { onClose(); nav('/'); }}>
        <Wordmark />
      </button>
      <button className="sv-x" aria-label="Close" onClick={onClose}>
        <Icon name="close" size={30} color="#fff" stroke={2} />
      </button>
      <div className="sv-row">
        {side(left)}
        <div className="sv-center" style={{ marginLeft: left.length ? size.near : 0, marginRight: right.length ? size.near : 0 }}>
          {gi > 0 || si > 0 ? (
            <button className="sv-nav left" style={{ left: -Math.round(size.near / 2) - 13 }} aria-label="Previous" onClick={prev}>
              <Icon name="back" size={14} color="#1a1a1a" stroke={2.6} />
            </button>
          ) : null}
          <button className="sv-nav right" style={{ right: -Math.round(size.near / 2) - 13 }} aria-label="Next" onClick={next}>
            <Icon name="right" size={14} color="#1a1a1a" stroke={2.6} />
          </button>
          <div className="sv-card" ref={card} key={group.user_id} style={{ width: size.w, height: size.h }}>
            <StoryCanvas
              item={story.item}
              width={size.w}
              height={size.h}
              paused={held}
              muted={muted}
              onVideoEnd={next}
              onDuration={(d) => d && isFinite(d) && setVideoDur(d)}
              onVideoError={() => setVideoFailed(story.id)}
              onBlocked={() => setMuted(true)}
              onMention={(id) => {
                const who = story.item.overlays?.find((o) => o.userId === id)?.text;
                onClose();
                if (who) nav('/u/' + who);
              }}
            />
            <span className="sv-shade top" />
            <span className="sv-shade bottom" />
            <button className="sv-tap left" aria-label="Previous story" {...tap(-1)} />
            <button className="sv-tap right" aria-label="Next story" {...tap(1)} />
            <div className="sv-top">
              <div className="bars sv-bars">
                {group.stories.map((s, i) => (
                  <span key={s.id}>
                    <i ref={i === si ? (el) => { bar.current = el; paint(); } : undefined} style={i === si ? undefined : { width: i < si ? '100%' : '0%' }} />
                  </span>
                ))}
              </div>
              <div className="sv-who">
                <button className="sv-who-link" onClick={openProfile} aria-label={group.username + "'s profile"}>
                  <Avatar src={group.avatar_url} name={group.username} size={32} />
                  <span className="sv-names">
                    <span className="sv-line">
                      <b>{group.username}</b>
                      {verified ? <Verified size={12} /> : null}
                      <span className="sv-when">{ago(story.created_at)}</span>
                    </span>
                    {highlight?.title ? <span className="sv-sub">{highlight.title}</span> : null}
                  </span>
                </button>
                {story.audience === 'close_friends' ? (
                  <span className="sv-close-friends" title="Close friends" aria-label="Shared with close friends">
                    <Icon name="star" size={11} color="#fff" fill="#fff" stroke={0} />
                  </span>
                ) : null}
                <span className="grow" />
                {isVideo ? (
                  <button className="icon-btn" aria-label={muted ? 'Turn sound on' : 'Mute'} onClick={() => setMuted(!muted)}>
                    <Icon name={muted ? 'mute' : 'sound'} size={20} color="#fff" />
                  </button>
                ) : null}
                <button className="icon-btn" aria-label={paused ? 'Play' : 'Pause'} onClick={() => setPaused(!paused)}>
                  <Icon name={paused ? 'play' : 'pause'} size={18} color="#fff" fill="#fff" stroke={0} />
                </button>
                <button className="icon-btn" aria-label="More options" onClick={() => setSheet('menu')}>
                  <Icon name="more" size={22} color="#fff" stroke={2.4} />
                </button>
              </div>
            </div>
            <div className="sv-bottom">
              {mine ? (
                <div className="sv-own">
                  {isHighlight ? null : (
                    <button className="seen-by sv-seen" onClick={() => setSheet('viewers')}>
                      {watchers.length ? (
                        <span className="sv-faces">
                          {watchers.slice(0, 3).map((v) => (
                            <Avatar key={v.viewer_id} src={v.profile?.avatar_url} name={v.profile?.username ?? '?'} size={24} />
                          ))}
                        </span>
                      ) : (
                        <Icon name="eye" size={18} color="#fff" />
                      )}
                      <span>{story.view_count ? `Seen by ${fmt(story.view_count)}` : 'No viewers yet'}</span>
                    </button>
                  )}
                  <span className="grow" />
                  <button className="icon-btn" aria-label="Send to people" onClick={() => setSheet('send')}>
                    <Icon name="send" size={22} color="#fff" />
                  </button>
                </div>
              ) : isHighlight ? null : !allowed ? (
                <p className="sv-replies-off">Replies are off</p>
              ) : (
                <form
                  className="story-reply sv-reply"
                  onSubmit={(e) => {
                    e.preventDefault();
                    send(reply);
                  }}
                >
                  <input placeholder={`Reply to ${group.username}…`} aria-label={`Reply to ${group.username}`} value={reply} maxLength={300} onChange={(e) => setReply(e.target.value)} onFocus={() => setTyping(true)} onBlur={() => setTyping(false)} />
                  {reply.trim() ? (
                    <button className="sv-send">Send</button>
                  ) : (
                    <>
                      <button type="button" className={'icon-btn' + (hearted === story.id ? ' sv-hearted' : '')} aria-label={hearted === story.id ? 'Heart sent' : 'Send a heart'} onClick={() => hearted !== story.id && send('❤️', true)}>
                        <Icon name="heart" size={24} color={hearted === story.id ? '#ff3040' : '#fff'} fill={hearted === story.id ? '#ff3040' : 'none'} />
                      </button>
                      <button type="button" className="icon-btn" aria-label="Share" onClick={() => setSheet('send')}>
                        <Icon name="send" size={24} color="#fff" />
                      </button>
                    </>
                  )}
                </form>
              )}
            </div>
          </div>
        </div>
        {side(right)}
      </div>

      {sheet === 'viewers' ? <ViewersSheet story={story} onClose={() => setSheet(null)} /> : null}
      {sheet === 'menu' ? (
        <StoryMenu
          story={story}
          highlight={isHighlight}
          onClose={() => setSheet(null)}
          onDelete={remove}
          onAddToHighlight={() => {
            if (story.audience === 'close_friends') return toast('Close friends stories stay out of highlights, because highlights are for everyone.');
            setSheet('highlight');
          }}
          onSettings={() => setSheet('settings')}
          onReport={() => setSheet('report')}
          onAbout={() => setSheet('about')}
          onMuted={(on) => {
            setStoriesMuted(group.user_id, on);
            toast(on ? `${group.username}'s stories moved to the end of your tray` : `${group.username}'s stories are back in your tray`);
            if (on) next();
          }}
        />
      ) : null}
      {sheet === 'report' ? <ReportSheet story={story} onClose={() => setSheet(null)} /> : null}
      {sheet === 'about' ? <AboutAccount userId={group.user_id} onClose={() => setSheet(null)} /> : null}
      {sheet === 'highlight' ? <HighlightPicker item={story.item} onClose={() => setSheet(null)} /> : null}
      {sheet === 'settings' ? <StorySettings onClose={() => setSheet(null)} onLeave={onClose} /> : null}
      {sheet === 'send' ? <SendStory story={story} onClose={() => setSheet(null)} /> : null}
    </div>,
    document.body,
  );
}
