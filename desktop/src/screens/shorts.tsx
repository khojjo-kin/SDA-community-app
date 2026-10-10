// Shorts: one tall video at a time in the middle of the page, as on Instagram's desktop web. The
// actions sit beside the video, the name and caption to its left, the sound switch in its corner and
// round up and down buttons at the far right; the page snaps from one Short to the next (also with
// the ↑ and ↓ keys). Timed captions, their on/off switch and translation work as in the iPhone app
// (src/components/Reel.tsx).
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { fetchReels, recordView, setFollow, translateCaptions } from 'shared/api';
import { putPosts } from 'shared/store';
import { fmt } from 'shared/theme';
import type { CaptionLine, Post } from 'shared/types';
import { useMe } from '../lib/me';
import { nav } from '../lib/router';
import '../styles/stories.css';
import { Avatar, Empty, Failed, Icon, Link, Modal, Verified, toast, toastError } from '../ui/kit';
import { PostMenu, ShareDialog, useFlags } from '../ui/post';
import { useFillHeight } from './live-parts';

/** How many Shorts the server sends at a time (see fetchReels). */
const PAGE = 10;

/** The languages captions can be translated into (the app's languages, src/lib/i18n.ts). */
const LANGUAGES: { code: string; name: string; native: string }[] = [
  { code: 'en', name: 'English', native: 'English' },
  { code: 'tw', name: 'Twi (Akan)', native: 'Twi' },
  { code: 'ee', name: 'Ewe', native: 'Eʋegbe' },
  { code: 'fr', name: 'French', native: 'Français' },
  { code: 'es', name: 'Spanish', native: 'Español' },
  { code: 'pt', name: 'Portuguese', native: 'Português' },
  { code: 'de', name: 'German', native: 'Deutsch' },
  { code: 'it', name: 'Italian', native: 'Italiano' },
  { code: 'sw', name: 'Swahili', native: 'Kiswahili' },
  { code: 'yo', name: 'Yoruba', native: 'Yorùbá' },
  { code: 'ha', name: 'Hausa', native: 'Hausa' },
  { code: 'ig', name: 'Igbo', native: 'Asụsụ Igbo' },
  { code: 'ar', name: 'Arabic', native: 'العربية' },
  { code: 'hi', name: 'Hindi', native: 'हिन्दी' },
  { code: 'zh', name: 'Chinese (Simplified)', native: '中文' },
  { code: 'ko', name: 'Korean', native: '한국어' },
  { code: 'ja', name: 'Japanese', native: '日本語' },
  { code: 'ru', name: 'Russian', native: 'Русский' },
  { code: 'tl', name: 'Tagalog', native: 'Tagalog' },
  { code: 'id', name: 'Indonesian', native: 'Bahasa Indonesia' },
];

/* Small choices kept on this computer: sound, captions, and the captions' language ('' = as made). */
function readPref<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem('community.shorts.' + key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}
function savePref(key: string, value: unknown) {
  try {
    localStorage.setItem('community.shorts.' + key, JSON.stringify(value));
  } catch {
    // not kept
  }
}

/*
 * Translated captions, kept while the app is open: each Short is translated into each language at
 * most once. Only answers are kept, so one that failed is asked for again next time (as on the iPhone).
 */
const asks = new Map<string, Promise<CaptionLine[] | null>>();
const translated = new Map<string, CaptionLine[]>();
function askTranslation(postId: string, lang: string): Promise<CaptionLine[] | null> {
  const key = `${postId}:${lang}`;
  let ask = asks.get(key);
  if (!ask) {
    ask = translateCaptions(postId, lang)
      .catch(() => null)
      .then((lines) => {
        if (lines?.length) translated.set(key, lines);
        else asks.delete(key);
        return lines?.length ? lines : null;
      });
    asks.set(key, ask);
  }
  return ask;
}
const baseLang = (code: string) => code.trim().toLowerCase().split(/[-_]/)[0];

type Settings = { muted: boolean; setMuted: (m: boolean) => void; cc: boolean; setCc: (on: boolean) => void; lang: string; setLang: (l: string) => void };

export function Shorts({ openPost }: { openPost: (id: string) => void }) {
  const [ids, setIds] = useState<string[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [current, setCurrent] = useState(0);
  const [muted, setMutedState] = useState(() => readPref('muted', false));
  const [cc, setCcState] = useState(() => readPref('captions', true));
  const [lang, setLangState] = useState(() => readPref('captionLang', ''));
  const list = useRef<HTMLDivElement>(null);
  const cursor = useRef<string | undefined>(undefined);
  const done = useRef(false);
  const loadingMore = useRef(false);

  const settings: Settings = {
    muted,
    setMuted: (m) => {
      setMutedState(m);
      savePref('muted', m);
    },
    cc,
    setCc: (on) => {
      setCcState(on);
      savePref('captions', on);
    },
    lang,
    setLang: (l) => {
      setLangState(l);
      savePref('captionLang', l);
    },
  };

  const load = useCallback(async (reset: boolean) => {
    if (reset) {
      cursor.current = undefined;
      done.current = false;
      setError(null);
    }
    if (done.current || loadingMore.current) return;
    loadingMore.current = true;
    try {
      const page = await fetchReels(false, cursor.current);
      putPosts(page);
      // Paging follows what the server sent: a short page is the end.
      if (page.length < PAGE) done.current = true;
      if (page.length) cursor.current = page[page.length - 1].created_at;
      setIds((cur) => (reset || !cur ? page.map((p) => p.id) : [...cur, ...page.map((p) => p.id).filter((id) => !cur.includes(id))]));
    } catch (e) {
      if (reset) setError(e);
      else toastError(e);
    } finally {
      loadingMore.current = false;
    }
  }, []);
  useEffect(() => {
    load(true);
  }, [load]);

  // Each Short fills the window below whatever sits above the list (the demo line, an announcement).
  const height = useFillHeight(list);

  // The Short most in view is the one playing.
  useEffect(() => {
    const el = list.current;
    if (!el || !ids?.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setCurrent(Number((e.target as HTMLElement).dataset.index));
      },
      { root: el, threshold: 0.6 },
    );
    el.querySelectorAll('.sh-item').forEach((x) => io.observe(x));
    return () => io.disconnect();
  }, [ids]);

  // Near the end, the next page.
  useEffect(() => {
    if (ids && current >= ids.length - 2) load(false);
  }, [current, ids?.length]);

  // Scrolls to a Short; the one in view becomes current once it is there (changing it here, mid-scroll,
  // would draw the page again and the browser would snap back to where the scroll began).
  const go = (i: number) => {
    const el = list.current;
    if (!el || !ids) return;
    const at = Math.max(0, Math.min(ids.length - 1, i));
    const item = el.querySelector<HTMLElement>(`.sh-item[data-index="${at}"]`);
    if (item) el.scrollTo({ top: item.offsetTop, behavior: 'smooth' });
  };
  const goRef = useRef(go);
  goRef.current = go;
  const currentRef = useRef(current);
  currentRef.current = current;

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (document.querySelector('.scrim')) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        goRef.current(currentRef.current + 1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        goRef.current(currentRef.current - 1);
      }
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, []);

  const style = { height: height || undefined, ['--sh-h' as any]: height ? height + 'px' : undefined };
  return (
    <div className="reels sh-list" ref={list} tabIndex={-1} style={style} aria-label="Shorts">
      {error ? <Failed error={error} retry={() => load(true)} /> : null}
      {!ids && !error ? <ShortSkeleton /> : null}
      {ids && !ids.length ? (
        <Empty icon="reels" title="No Shorts yet" body="Share a short video and it will show up here for everyone to watch." />
      ) : null}
      {(ids ?? []).map((id, i) => (
        <Short key={id} id={id} index={i} active={i === current} near={Math.abs(i - current) <= 1} settings={settings} openPost={openPost} />
      ))}
      {ids && ids.length > 1 ? (
        <div className="sh-updown">
          <button className="sh-round" aria-label="Previous Short" disabled={current <= 0} onClick={() => go(current - 1)}>
            <Icon name="down" size={22} stroke={2.2} className="sh-flip" />
          </button>
          <button className="sh-round" aria-label="Next Short" disabled={current >= ids.length - 1} onClick={() => go(current + 1)}>
            <Icon name="down" size={22} stroke={2.2} />
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** While Shorts load: where the video, its actions and its caption will be. */
function ShortSkeleton() {
  return (
    <div className="reel sh-item sh-skeleton" aria-hidden="true">
      <div className="sh-row">
        <div className="sh-video">
          <div className="sh-frame sv-shimmer" />
          <div className="sh-info">
            <div className="sh-who">
              <span className="sv-shimmer sh-sk-dot" />
              <span className="sv-shimmer sh-sk-line" style={{ width: 150 }} />
            </div>
            <span className="sv-shimmer sh-sk-line" style={{ width: 260 }} />
            <span className="sv-shimmer sh-sk-line" style={{ width: 200 }} />
          </div>
        </div>
        <div className="sh-actions">
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} className="sv-shimmer sh-sk-dot" />
          ))}
        </div>
      </div>
      <span className="sv-sr" role="status">
        Loading Shorts
      </span>
    </div>
  );
}

function Short({ id, index, active, near, settings, openPost }: { id: string; index: number; active: boolean; near: boolean; settings: Settings; openPost: (id: string) => void }) {
  const { me } = useMe();
  const { post, toggle } = useFlags(id);
  const video = useRef<HTMLVideoElement>(null);
  const captionRef = useRef<HTMLParagraphElement>(null);
  const [paused, setPaused] = useState(false);
  const [menu, setMenu] = useState(false);
  const [share, setShare] = useState(false);
  const [picking, setPicking] = useState(false);
  const [burst, setBurst] = useState(0);
  const [open, setOpen] = useState(false);
  const [long, setLong] = useState(false);
  const [time, setTime] = useState(0);
  const [progress, setProgress] = useState(0);
  const [lines, setLines] = useState<CaptionLine[] | null>(null);
  const [followed, setFollowed] = useState(false);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { muted, setMuted, cc, setCc, lang, setLang } = settings;

  // Plays only while it is the Short in view; scrolled away, it starts from the beginning next time.
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (active && !paused) {
      v.play().catch((e) => {
        // The browser won't start a video with sound before the first click: start it silently.
        if (e?.name === 'NotAllowedError' && !v.muted) {
          setMuted(true);
          v.muted = true;
          v.play().catch(() => setPaused(true));
        }
      });
    } else v.pause();
  }, [active, paused]);
  useEffect(() => {
    if (active) return;
    setPaused(false);
    const v = video.current;
    if (v) v.currentTime = 0;
  }, [active]);

  // Being the Short on screen for a moment counts as a view.
  useEffect(() => {
    if (!active || !post) return;
    const t = setTimeout(() => recordView(me.id, post), 800);
    return () => clearTimeout(t);
  }, [active, post?.id]);

  /* ----- captions ----- */
  const hasCaptions = post?.captions_status === 'ready' && !!post.captions?.length;
  const source = post?.captions_lang ? baseLang(post.captions_lang) : '';
  const wanted = cc && hasCaptions && lang && baseLang(lang) !== source ? baseLang(lang) : '';
  useEffect(() => {
    if (!post || !hasCaptions || !cc) return setLines(null);
    if (!wanted) return setLines(post.captions);
    const have = translated.get(`${post.id}:${wanted}`);
    if (have) return setLines(have);
    setLines(post.captions);
    if (!active) return;
    let live = true;
    askTranslation(post.id, wanted).then((got) => {
      if (!live) return;
      if (got) setLines(got);
      else toast(`Captions in ${LANGUAGES.find((l) => l.code === wanted)?.name ?? 'that language'} aren't available for this Short`);
    });
    return () => {
      live = false;
    };
  }, [post?.id, post?.captions, cc, wanted, active]);
  const line = lines?.find((l) => l.s <= time && time < l.e)?.t.trim() ?? '';
  const showingTranslation = !!wanted && !!lines && lines !== post?.captions;

  // "… more" only when the caption doesn't fit in two lines.
  useLayoutEffect(() => {
    const el = captionRef.current;
    if (el && !open) setLong(el.scrollHeight > el.clientHeight + 2);
  }, [post?.caption, open]);

  useEffect(() => () => void (clickTimer.current && clearTimeout(clickTimer.current)), []);

  if (!post) return <section className="reel sh-item" data-index={index} />;
  const m = post.media[0];
  const mine = post.user_id === me.id;
  const audio = post.audio_title ? [post.audio_title, post.audio_artist].filter(Boolean).join(' · ') : `${post.username} · Original audio`;
  const following = post.following_author || followed;

  // One click pauses or plays; two like it (with the heart).
  const onClick = () => {
    if (clickTimer.current) return;
    clickTimer.current = setTimeout(() => {
      clickTimer.current = null;
      setPaused((p) => !p);
    }, 240);
  };
  const onDoubleClick = () => {
    if (clickTimer.current) clearTimeout(clickTimer.current);
    clickTimer.current = null;
    setBurst((b) => b + 1);
    if (!post.liked) toggle('liked', true);
  };

  return (
    <section className="reel sh-item" data-index={index} aria-label={`Short by ${post.username}`}>
      <div className="sh-row">
        <div className="sh-video">
          <div className="sh-frame reel-video" onClick={onClick} onDoubleClick={onDoubleClick}>
            {m?.type === 'video' ? (
              <video
                ref={video}
                src={near ? m.url : undefined}
                poster={m.poster}
                loop
                playsInline
                muted={muted}
                preload={near ? 'auto' : 'none'}
                onTimeUpdate={(e) => {
                  const v = e.currentTarget;
                  setTime(v.currentTime);
                  setProgress(v.duration > 0 ? v.currentTime / v.duration : 0);
                }}
              />
            ) : m ? (
              <img src={m.url} alt="" />
            ) : null}
            <span className="sh-shade" />
            {line ? (
              <p className="sh-line" aria-live="polite">
                {line}
              </p>
            ) : null}
            {showingTranslation ? (
              <button
                className="sh-translated"
                onClick={(e) => {
                  e.stopPropagation();
                  setLang('');
                }}
              >
                Translated · Show original
              </button>
            ) : null}
            {paused && active ? (
              <span className="sh-paused">
                <Icon name="play" size={34} color="#fff" fill="#fff" stroke={0} />
              </span>
            ) : null}
            {burst ? (
              <span className="burst" key={burst}>
                <Icon name="heart" size={96} color="#fff" fill="#fff" stroke={0} />
              </span>
            ) : null}
            {m?.type === 'video' ? (
              <button
                className="sh-mute"
                aria-label={muted ? 'Turn sound on' : 'Turn sound off'}
                onClick={(e) => {
                  e.stopPropagation();
                  setMuted(!muted);
                }}
              >
                <Icon name={muted ? 'mute' : 'sound'} size={16} color="#fff" />
              </button>
            ) : null}
            <span className="sh-progress" aria-hidden="true">
              <i style={{ width: `${progress * 100}%` }} />
            </span>
          </div>
          <div className="sh-info">
            <div className="sh-who">
              <Avatar src={post.avatar_url} name={post.username} size={32} onClick={() => nav('/u/' + post.username)} label={`Open ${post.username}'s profile`} />
              <Link to={'/u/' + post.username} className="uname">
                {post.username}
              </Link>
              {post.verified ? <Verified size={12} /> : null}
              {!mine && !following ? (
                <>
                  <span className="sh-dot">•</span>
                  <button
                    className="sh-follow"
                    onClick={() => {
                      setFollowed(true);
                      setFollow(me.id, post.user_id, true).catch((e) => {
                        setFollowed(false);
                        toastError(e);
                      });
                    }}
                  >
                    Follow
                  </button>
                </>
              ) : null}
            </div>
            <div className="sh-audio">
              <Icon name="music" size={12} stroke={2} />
              <span>{audio}</span>
            </div>
            {post.caption ? (
              <p ref={captionRef} className={'sh-caption' + (open ? ' open' : '')}>
                {post.caption}
              </p>
            ) : null}
            {post.caption && long && !open ? (
              <button className="sh-more" onClick={() => setOpen(true)}>
                … more
              </button>
            ) : null}
          </div>
        </div>
        <div className="reel-actions sh-actions">
          <button aria-label={post.liked ? 'Unlike' : 'Like'} aria-pressed={post.liked} onClick={() => toggle('liked')}>
            <Icon name="heart" size={26} color={post.liked ? '#ff3040' : 'currentColor'} fill={post.liked ? '#ff3040' : 'none'} />
            <span>{post.hide_likes && !mine ? 'Likes' : fmt(post.like_count)}</span>
          </button>
          {post.comments_off && !mine ? null : (
            <button aria-label="Comments" onClick={() => openPost(post.id)}>
              <Icon name="comment" size={26} />
              <span>{fmt(post.comment_count)}</span>
            </button>
          )}
          <button aria-label="Share" onClick={() => setShare(true)}>
            <Icon name="send" size={26} />
          </button>
          <button aria-label={post.saved ? 'Remove from saved' : 'Save'} onClick={() => toggle('saved')}>
            <Icon name="bookmark" size={26} fill={post.saved ? 'currentColor' : 'none'} />
          </button>
          {hasCaptions ? (
            <button
              className={'sh-cc' + (cc ? ' on' : '')}
              role="switch"
              aria-checked={cc}
              aria-label="Captions"
              onClick={() => {
                setCc(!cc);
                toast(cc ? 'Captions off' : 'Captions on');
              }}
            >
              <b>CC</b>
            </button>
          ) : null}
          {hasCaptions ? (
            <button aria-label="Translate captions" onClick={() => setPicking(true)}>
              <Icon name="globe" size={24} />
            </button>
          ) : null}
          <button aria-label="More options" onClick={() => setMenu(true)}>
            <Icon name="more" size={26} />
          </button>
          <button className="sh-audio-cover" aria-label={`Audio: ${audio}`} onClick={() => nav('/u/' + post.username)}>
            {m?.poster || post.avatar_url ? <img src={post.avatar_url || m?.poster} alt="" /> : <Icon name="music" size={14} />}
          </button>
        </div>
      </div>
      {menu ? <PostMenu post={post} onClose={() => setMenu(false)} onOpen={() => openPost(post.id)} /> : null}
      {share ? <ShareDialog postId={post.id} onClose={() => setShare(false)} /> : null}
      {picking ? (
        <TranslatePicker
          current={wanted}
          source={source}
          onPick={(code) => {
            setPicking(false);
            if (!cc) setCc(true);
            setLang(code === source ? '' : code);
          }}
          onClose={() => setPicking(false)}
        />
      ) : null}
    </section>
  );
}

/** "Translate captions": the language to show captions in. The language they were made in shows them as they are. */
function TranslatePicker({ current, source, onPick, onClose }: { current: string; source: string; onPick: (code: string) => void; onClose: () => void }) {
  const chosen = current || source;
  return (
    <Modal onClose={onClose} title="Translate captions" className="sv-sheet">
      <div className="list-pad sh-langs" role="radiogroup" aria-label="Caption language">
        {LANGUAGES.map((l) => (
          <label key={l.code} className="row full hover sv-radio">
            <span className="row-text">
              <b>{l.native}</b>
              <span>{l.code === source ? 'Original' : l.name}</span>
            </span>
            <input type="radio" name="sh-lang" className="round-check" aria-label={l.name} checked={chosen === l.code} onChange={() => onPick(l.code)} />
          </label>
        ))}
      </div>
    </Modal>
  );
}
