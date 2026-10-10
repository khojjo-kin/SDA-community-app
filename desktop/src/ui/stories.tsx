// Stories: the row on the home page and Instagram's full-screen viewer.
// Stories are drawn the same way as on the iPhone (src/components/StoryCanvas.tsx): photo, video,
// text background or collage, then drawing, caption, text, emoji and @mentions on top.
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { deleteStory, fetchStoryViewers, markStorySeen, openThread, sendMessage } from 'shared/api';
import { ago } from 'shared/theme';
import type { Overlay, Profile, StoryGroup, StoryItem } from 'shared/types';
import { useMe } from '../lib/me';
import { nav } from '../lib/router';
import { Avatar, Icon, Modal, Spinner, ask, toast, toastError } from './kit';

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

export function StoryCanvas({ item, width, height, paused, muted, onVideoEnd, onDuration, onMention }: { item: StoryItem; width: number; height: number; paused?: boolean; muted?: boolean; onVideoEnd?: () => void; onDuration?: (s: number) => void; onMention?: (id: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (paused) v.pause();
    else v.play().catch(() => {});
  }, [paused, item.url]);
  const bg = BACKGROUNDS[(item.bg ?? 0) % BACKGROUNDS.length];
  const fit = item.fit === 'contain' ? 'contain' : 'cover';
  let media: React.ReactNode = null;
  if (item.type === 'text') media = <div className="fill" style={{ background: `linear-gradient(135deg, ${bg[0]}, ${bg[1]})` }} />;
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
    media = <video ref={video} className="fill" src={item.url} poster={item.poster} muted={muted} playsInline autoPlay style={{ objectFit: fit }} onEnded={onVideoEnd} onLoadedMetadata={(e) => onDuration?.(e.currentTarget.duration)} />;
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

export function StoryTray({ groups, onOpen, onAdd }: { groups: StoryGroup[]; onOpen: (index: number) => void; onAdd: () => void }) {
  const { me } = useMe();
  const strip = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const measure = () => {
    const el = strip.current;
    if (el) setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
  };
  useEffect(measure, [groups.length]);
  const mine = groups.find((g) => g.user_id === me.id);
  const others = groups.filter((g) => g.user_id !== me.id);
  return (
    <div className="tray-wrap">
      <div className="tray" ref={strip} onScroll={measure}>
        <div className="tray-item">
          <div className="tray-me">
            <Avatar src={me.avatar_url} name={me.username} size={56} ring={mine ? (mine.close ? 'close' : 'seen') : null} onClick={() => (mine ? onOpen(groups.indexOf(mine)) : onAdd())} label={mine ? 'Your story' : 'Add to your story'} />
            {!mine ? (
              <button className="tray-plus" aria-label="Add to your story" onClick={onAdd}>
                <Icon name="plus" size={12} color="#fff" stroke={3} />
              </button>
            ) : null}
          </div>
          <span className="tray-name">Your story</span>
        </div>
        {others.map((g) => (
          <div className="tray-item" key={g.user_id}>
            <Avatar src={g.avatar_url} name={g.username} size={56} ring={g.close ? 'close' : g.seen ? 'seen' : 'new'} onClick={() => onOpen(groups.indexOf(g))} label={'Story by ' + g.username} />
            <span className={'tray-name' + (g.seen ? ' seen' : '')}>{g.username}</span>
          </div>
        ))}
      </div>
      {edges.left ? (
        <button className="tray-arrow left" aria-label="Scroll left" onClick={() => strip.current?.scrollBy({ left: -320, behavior: 'smooth' })}>
          <Icon name="back" size={14} color="#000" stroke={2.6} />
        </button>
      ) : null}
      {edges.right ? (
        <button className="tray-arrow right" aria-label="Scroll right" onClick={() => strip.current?.scrollBy({ left: 320, behavior: 'smooth' })}>
          <Icon name="right" size={14} color="#000" stroke={2.6} />
        </button>
      ) : null}
    </div>
  );
}

/* ---------- the viewer ---------- */

const PHOTO_SECONDS = 5;

export function StoryViewer({ groups, start, onClose, onChanged }: { groups: StoryGroup[]; start: number; onClose: () => void; onChanged?: () => void }) {
  const { me } = useMe();
  const [gi, setGi] = useState(start);
  const [si, setSi] = useState(() => {
    const g = groups[start];
    const first = g?.stories.findIndex((s) => !s.seen && s.user_id !== me.id) ?? -1;
    return first > 0 ? first : 0;
  });
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(true);
  const [reply, setReply] = useState('');
  const [viewers, setViewers] = useState<Profile[] | null | false>(false);
  const [dur, setDur] = useState(PHOTO_SECONDS);
  const [size, setSize] = useState({ w: 400, h: 711 });
  const group = groups[gi];
  const story = group?.stories[si];
  const mine = group?.user_id === me.id;

  useEffect(() => {
    const fit = () => {
      const h = Math.min(window.innerHeight - 40, 900);
      setSize({ w: Math.round((h * 9) / 16), h });
    };
    fit();
    window.addEventListener('resize', fit);
    document.body.classList.add('no-scroll');
    return () => {
      window.removeEventListener('resize', fit);
      document.body.classList.remove('no-scroll');
    };
  }, []);

  const next = () => {
    if (!group) return;
    if (si < group.stories.length - 1) setSi(si + 1);
    else if (gi < groups.length - 1) {
      setGi(gi + 1);
      setSi(0);
    } else onClose();
  };
  const prev = () => {
    if (si > 0) setSi(si - 1);
    else if (gi > 0) {
      setGi(gi - 1);
      setSi(groups[gi - 1].stories.length - 1);
    }
  };

  useEffect(() => {
    if (!story) return;
    setProgress(0);
    setDur(story.item.type === 'video' ? story.item.duration || 15 : PHOTO_SECONDS);
    if (!mine && !story.seen) {
      story.seen = true;
      markStorySeen(me.id, story.id).catch(() => {});
    }
  }, [story?.id]);

  const typing = reply.length > 0;
  const holding = paused || typing || viewers !== false;
  useEffect(() => {
    if (!story || holding) return;
    let last = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const dt = (t - last) / 1000;
      last = t;
      setProgress((p) => {
        const n = p + dt / dur;
        if (n >= 1) {
          setTimeout(next, 0);
          return 1;
        }
        return n;
      });
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [story?.id, holding, dur]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if (e.key === 'ArrowRight') next();
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'Escape') onClose();
      if (e.key === ' ') {
        e.preventDefault();
        setPaused((p) => !p);
      }
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  });

  if (!group || !story) return null;
  const cover = story.item.type === 'video' ? story.item.poster ?? '' : story.item.type === 'collage' ? story.item.urls?.[0] ?? '' : story.item.url;

  const send = async (body: string) => {
    if (!body.trim()) return;
    try {
      const tid = await openThread(group.user_id);
      await sendMessage(me.id, tid, { text: body, media_url: cover || undefined });
      setReply('');
      toast('Sent');
    } catch (e) {
      toastError(e);
    }
  };

  const neighbour = (offset: number) => {
    const g = groups[gi + offset];
    if (!g) return <span className="story-peek empty" />;
    const s = g.stories[0];
    const pic = s.item.type === 'video' ? s.item.poster : s.item.type === 'collage' ? s.item.urls?.[0] : s.item.url;
    return (
      <button className="story-peek" onClick={() => { setGi(gi + offset); setSi(0); }} aria-label={'Story by ' + g.username}>
        {pic ? <img src={pic} alt="" /> : <span className="fill" style={{ background: 'linear-gradient(135deg,#4a5df6,#b13df0)' }} />}
        <span className="peek-who">
          <Avatar src={g.avatar_url} name={g.username} size={56} ring={g.seen ? 'seen' : 'new'} />
          <b>{g.username}</b>
          <span>{ago(s.created_at)}</span>
        </span>
      </button>
    );
  };

  return createPortal(
    <div className="story-stage" role="dialog" aria-label={'Stories by ' + group.username}>
      <div className="story-brand">Community</div>
      <button className="scrim-close" aria-label="Close" onClick={onClose}>
        <Icon name="close" size={28} color="#fff" />
      </button>
      <div className="story-row">
        {neighbour(-1)}
        <div className="story-frame" style={{ width: size.w, height: size.h }}>
          <StoryCanvas item={story.item} width={size.w} height={size.h} paused={holding} muted={muted} onVideoEnd={next} onDuration={(d) => d && isFinite(d) && setDur(d)} onMention={(id) => { onClose(); nav('/u/' + (story.item.overlays?.find((o) => o.userId === id)?.text ?? '')); }} />
          <div className="story-top">
            <div className="bars">
              {group.stories.map((s, i) => (
                <span key={s.id}>
                  <i style={{ width: `${i < si ? 100 : i === si ? progress * 100 : 0}%` }} />
                </span>
              ))}
            </div>
            <div className="story-who">
              <Avatar src={group.avatar_url} name={group.username} size={32} onClick={() => { onClose(); nav('/u/' + group.username); }} />
              <button className="uname" onClick={() => { onClose(); nav('/u/' + group.username); }}>
                {group.username}
              </button>
              <span className="when">{ago(story.created_at)}</span>
              {story.audience === 'close_friends' ? <span className="close-pill">Close friends</span> : null}
              <span className="grow" />
              {story.item.type === 'video' ? (
                <button className="icon-btn" aria-label={muted ? 'Sound on' : 'Sound off'} onClick={() => setMuted(!muted)}>
                  <Icon name={muted ? 'mute' : 'sound'} size={20} color="#fff" />
                </button>
              ) : null}
              <button className="icon-btn" aria-label={paused ? 'Play' : 'Pause'} onClick={() => setPaused(!paused)}>
                <Icon name={paused ? 'play' : 'pause'} size={18} color="#fff" />
              </button>
              {mine ? (
                <button
                  className="icon-btn"
                  aria-label="Delete story"
                  onClick={async () => {
                    setPaused(true);
                    if (!(await ask('Delete this story?', 'It will also be removed from your archive.', 'Delete'))) return setPaused(false);
                    try {
                      await deleteStory(story.id);
                      toast('Story deleted');
                      onChanged?.();
                      onClose();
                    } catch (e) {
                      toastError(e);
                    }
                  }}
                >
                  <Icon name="trash" size={20} color="#fff" />
                </button>
              ) : null}
            </div>
          </div>
          <button className="story-tap left" aria-label="Previous story" onClick={prev} />
          <button className="story-tap right" aria-label="Next story" onClick={next} />
          {gi > 0 || si > 0 ? (
            <button className="nav-arrow left outside" aria-label="Previous" onClick={prev}>
              <Icon name="back" size={16} color="#000" stroke={2.4} />
            </button>
          ) : null}
          <button className="nav-arrow right outside" aria-label="Next" onClick={next}>
            <Icon name="right" size={16} color="#000" stroke={2.4} />
          </button>
          <div className="story-bottom">
            {mine ? (
              <button
                className="seen-by"
                onClick={() => {
                  setViewers(null);
                  fetchStoryViewers(story.id).then(setViewers, (e) => {
                    toastError(e);
                    setViewers(false);
                  });
                }}
              >
                <Icon name="eye" size={18} color="#fff" /> {story.view_count ? `Seen by ${story.view_count}` : 'No viewers yet'}
              </button>
            ) : story.story_replies === 'off' ? null : (
              <form
                className="story-reply"
                onSubmit={(e) => {
                  e.preventDefault();
                  send(reply);
                }}
              >
                <input placeholder={'Reply to ' + group.username + '…'} value={reply} onChange={(e) => setReply(e.target.value)} aria-label="Reply" />
                {reply.trim() ? (
                  <button className="link-btn white">Send</button>
                ) : (
                  <>
                    <button type="button" className="icon-btn" aria-label="Send a heart" onClick={() => send('❤️')}>
                      <Icon name="heart" size={24} color="#fff" />
                    </button>
                    <button type="button" className="icon-btn" aria-label="Send" onClick={() => send('😍')}>
                      <Icon name="send" size={24} color="#fff" />
                    </button>
                  </>
                )}
              </form>
            )}
          </div>
        </div>
        {neighbour(1)}
      </div>
      {viewers !== false ? (
        <Modal title="Viewers" onClose={() => setViewers(false)}>
          <div className="list-pad">
            {viewers === null ? <Spinner /> : null}
            {viewers && !viewers.length ? <p className="muted-text pad">Nobody has seen this story yet.</p> : null}
            {(viewers || []).map((p) => (
              <div key={p.id} className="row">
                <Avatar src={p.avatar_url} name={p.username} size={44} />
                <span className="row-text">
                  <b>{p.username}</b>
                  <span>{p.full_name}</span>
                </span>
              </div>
            ))}
          </div>
        </Modal>
      ) : null}
    </div>,
    document.body,
  );
}
