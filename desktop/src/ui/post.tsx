// Posts: the feed card, the photo and video carousel, the action row, the share dialog, the
// three-dots menu, the large post view with comments (Instagram's post dialog, with round arrows to
// step through the grid it was opened from), and the grid tile (a Short's tile opens the Shorts
// player). Instagram's 2026 desktop layout, with what Community posts can carry (database v20):
// polls, prompts, the AI label, tagged people, posts for subscribers, sensitive posts, hidden like
// counts and a song from Pod.
import React, { useEffect, useRef, useState } from 'react';
import { addComment, deleteComment, fetchComments, fetchPodItem, fetchPost, peopleToMessage, recordView, searchProfiles, setCommentLike, setFlag, setFollow, sharePost } from 'shared/api';
import { getPostNow, putPosts, usePost } from 'shared/store';
import { ago, count, fmt } from 'shared/theme';
import type { Comment, Media, PodItem, Post, Profile } from 'shared/types';
import '../styles/posts.css';
import { openCreate } from '../lib/create';
import { useMe } from '../lib/me';
import { nav } from '../lib/router';
import { Avatar, Empty, Icon, Link, Modal, Spinner, Verified, toast, toastError } from './kit';
import { type GridSource, altOf, copyText, isShort, openShortsFrom, postLink, ringOf, useCanSee, useStoryGroup } from './post-data';
import { AiInfo, EmojiButton, EyeOffIcon, LockedMedia, PollCard, PromptBanner, TagsButton, Veil, insertAt, useVeil } from './post-extras';
import { PostMenu } from './post-menu';
import { usePlayer } from './player';
import { StoryViewer } from './stories';

/** What every comment box says before anything is typed (the iPhone's "Comment…"). */
export const COMMENT_PLACEHOLDER = 'Comment…';

export { PostMenu };

/* ---------- media ---------- */

export function aspectOf(m?: Media): number {
  if (!m?.w || !m?.h) return 1;
  // Instagram shows feed media between 4:5 portrait and 1.91:1 landscape.
  return Math.min(1.91, Math.max(0.8, m.w / m.h));
}

export function Carousel({ media, onDoubleClick, fit = 'cover', ratio, autoPlay = true, onIndex }: { media: Media[]; onDoubleClick?: () => void; fit?: 'cover' | 'contain'; ratio?: number; autoPlay?: boolean; onIndex?: (i: number) => void }) {
  const [at, setAt] = useState(0);
  const [burst, setBurst] = useState(0);
  const [muted, setMuted] = useState(true);
  const box = useRef<HTMLDivElement>(null);
  const go = (i: number) => {
    const n = Math.max(0, Math.min(media.length - 1, i));
    setAt(n);
    onIndex?.(n);
  };
  // Videos play only while on screen, like Instagram.
  useEffect(() => {
    const el = box.current;
    if (!el || !autoPlay) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        el.querySelectorAll('video').forEach((v, i) => {
          if (entry.isIntersecting && i === at) v.play().catch(() => {});
          else v.pause();
        });
      },
      { threshold: 0.6 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [at, autoPlay]);
  const r = ratio ?? aspectOf(media[0]);
  return (
    <div
      ref={box}
      className="carousel"
      style={{ aspectRatio: String(r) }}
      onDoubleClick={(e) => {
        if ((e.target as HTMLElement).closest('button') || !onDoubleClick) return;
        setBurst((b) => b + 1);
        onDoubleClick();
      }}
    >
      <div className="track" style={{ transform: `translateX(${-100 * at}%)` }}>
        {media.map((m, i) =>
          m.type === 'video' ? (
            <div className="slide" key={i}>
              <video src={m.url} poster={m.poster} muted={muted} loop playsInline aria-label={altOf(m) || undefined} style={{ objectFit: fit }} onClick={(e) => { const v = e.currentTarget; v.paused ? v.play() : v.pause(); }} />
              <button className="mute" aria-label={muted ? 'Turn sound on' : 'Turn sound off'} onClick={() => setMuted(!muted)}>
                <Icon name={muted ? 'mute' : 'sound'} size={14} color="#fff" />
              </button>
            </div>
          ) : (
            <div className="slide" key={i}>
              <img src={m.url} alt={altOf(m)} draggable={false} loading={i ? 'lazy' : 'eager'} style={{ objectFit: fit }} />
            </div>
          ),
        )}
      </div>
      {at > 0 ? (
        <button className="nav-arrow left" aria-label="Previous" onClick={() => go(at - 1)}>
          <Icon name="back" size={16} color="#000" stroke={2.4} />
        </button>
      ) : null}
      {at < media.length - 1 ? (
        <button className="nav-arrow right" aria-label="Next" onClick={() => go(at + 1)}>
          <Icon name="right" size={16} color="#000" stroke={2.4} />
        </button>
      ) : null}
      {media.length > 1 ? (
        <div className="dots-overlay">
          {media.map((_, i) => (
            <i key={i} className={i === at ? 'on' : ''} />
          ))}
        </div>
      ) : null}
      {burst ? (
        <span className="burst" key={burst}>
          <Icon name="heart" size={96} color="#fff" fill="#fff" stroke={0} />
        </span>
      ) : null}
    </div>
  );
}

/**
 * A post's photos, or what stands in for them: the lock for a post kept for subscribers, and the
 * blur over a sensitive post until "See post". The round tagged-people button sits on the photo.
 */
function PostMedia({ post, ratio, fit, locked, pending, veiled, onReveal, onLike }: { post: Post; ratio?: number; fit?: 'cover' | 'contain'; locked: boolean; pending: boolean; veiled: boolean; onReveal: () => void; onLike: () => void }) {
  const r = ratio ?? aspectOf(post.media[0]);
  if (locked) return <LockedMedia post={post} ratio={r} />;
  if (pending) return <div className="pp-media-pending" style={{ aspectRatio: String(r) }} />;
  const video = post.media.some((m) => m.type === 'video');
  return (
    <div className={'pp-media' + (veiled ? ' veiled' : '')}>
      <Carousel media={post.media} fit={fit} ratio={r} onDoubleClick={veiled ? undefined : onLike} />
      {veiled ? <Veil onReveal={onReveal} /> : <TagsButton ids={post.tagged_ids ?? []} top={video} />}
    </div>
  );
}

/* ---------- actions ---------- */

export function useFlags(id: string) {
  const { me } = useMe();
  const post = usePost(id);
  const toggle = async (flag: 'liked' | 'saved' | 'reposted', next?: boolean) => {
    const p = getPostNow(id);
    if (!p) return;
    try {
      await setFlag(me.id, p, flag, next ?? !p[flag]);
      if (flag === 'saved') toast(!p.saved ? 'Saved to your collection' : 'Removed from saved');
      if (flag === 'reposted') toast(!p.reposted ? 'Reposted to your profile' : 'Repost removed');
    } catch (e) {
      toastError(e);
    }
  };
  return { post, toggle };
}

/** Heart, comment with its count, repost with its count, share; save on the right. */
export function ActionRow({ id, onComment, onShare }: { id: string; onComment: () => void; onShare: () => void }) {
  const { me } = useMe();
  const { post, toggle } = useFlags(id);
  if (!post) return null;
  // Only the author can comment on a post with commenting turned off, so nobody else gets the button.
  const closed = !!post.comments_off && post.user_id !== me.id;
  return (
    <div className="actions pp-actions">
      <button className={'icon-btn pp-act' + (post.liked ? ' liked pop' : '')} aria-label={post.liked ? 'Unlike' : 'Like'} aria-pressed={post.liked} onClick={() => toggle('liked')}>
        <Icon name="heart" size={24} color={post.liked ? '#ff3040' : 'currentColor'} fill={post.liked ? '#ff3040' : 'none'} />
      </button>
      {closed ? null : (
        <button className="icon-btn pp-act" aria-label="Comment" onClick={onComment}>
          <Icon name="comment" size={24} />
          {post.comment_count ? <span className="pp-count">{fmt(post.comment_count)}</span> : null}
        </button>
      )}
      <button className={'icon-btn pp-act' + (post.reposted ? ' reposted' : '')} aria-label={post.reposted ? 'Undo repost' : 'Repost'} aria-pressed={post.reposted} onClick={() => toggle('reposted')}>
        <Icon name="repost" size={24} color={post.reposted ? '#1fbf5a' : 'currentColor'} />
        {post.repost_count ? <span className="pp-count">{fmt(post.repost_count)}</span> : null}
      </button>
      <button className="icon-btn pp-act" aria-label="Share" onClick={onShare}>
        <Icon name="send" size={24} />
      </button>
      <span className="grow" />
      <button className="icon-btn pp-act" aria-label={post.saved ? 'Remove from saved' : 'Save'} aria-pressed={post.saved} onClick={() => toggle('saved')}>
        <Icon name="bookmark" size={24} fill={post.saved ? 'currentColor' : 'none'} />
      </button>
    </div>
  );
}

/** The likes line. A hidden like count shows only to the author; everyone else reads "Liked by others". */
export function LikeLine({ post }: { post: Post }) {
  const { me } = useMe();
  const mine = post.user_id === me.id;
  if (post.hide_likes && !mine) {
    if (post.liked) return <div className="likes">Liked by <b>you</b> and others</div>;
    return <div className="likes">{post.like_count ? 'Liked by others' : 'Be the first to like this'}</div>;
  }
  if (!post.like_count) return <div className="likes muted-text">Be the first to like this</div>;
  return (
    <div className="likes">
      {count(post.like_count, 'like')}
      {mine && post.hide_likes ? <span className="pp-only-you"> · Only you can see the count</span> : null}
    </div>
  );
}

/* ---------- share ---------- */

/**
 * Share: send the post to people in a message, or (with nobody chosen) copy its link, add it to your
 * story or repost it, as the iPhone's share sheet (app/(app)/share/[id].tsx) offers. Typing searches
 * everyone on Community, not only the people you message.
 */
export function ShareDialog({ postId, onClose }: { postId: string; onClose: () => void }) {
  const { me } = useMe();
  const post = usePost(postId);
  const [people, setPeople] = useState<Profile[] | null>(null);
  const [found, setFound] = useState<Profile[] | null>(null);
  const [picked, setPicked] = useState<Profile[]>([]);
  const [q, setQ] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    peopleToMessage(me.id).then(setPeople, (e) => {
      toastError(e);
      setPeople([]);
    });
  }, []);
  useEffect(() => {
    const needle = q.trim();
    if (!needle) return setFound(null);
    let live = true;
    const t = setTimeout(() => {
      searchProfiles(needle).then(
        (r) => live && setFound(r.filter((p) => p.id !== me.id && !p.is_blocked)),
        () => live && setFound([]),
      );
    }, 220);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q]);
  const needle = q.trim().toLowerCase();
  // Your own people first while typing, then anyone else the search finds.
  const mine = (people ?? []).filter((p) => !needle || p.username.includes(needle) || p.full_name.toLowerCase().includes(needle));
  const shown = needle ? [...mine, ...(found ?? []).filter((p) => !mine.some((m) => m.id === p.id))] : mine;
  const on = (p: Profile) => picked.some((x) => x.id === p.id);
  const flip = (p: Profile, next: boolean) => setPicked((cur) => (next ? [...cur.filter((x) => x.id !== p.id), p] : cur.filter((x) => x.id !== p.id)));
  // A post kept for subscribers stays off your story, which everyone who sees your stories can watch.
  const canStory = !!post && post.audience !== 'subscribers';
  const run = (fn: () => Promise<unknown> | void) => async () => {
    try {
      await fn();
    } catch (e) {
      toastError(e);
    }
  };
  return (
    <Modal onClose={onClose} title="Share" className="share pp-share">
      <div className="share-search">
        <span>To:</span>
        <input autoFocus placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search people" />
      </div>
      <div className="share-list">
        {people === null || (needle && found === null && !mine.length) ? <Spinner /> : null}
        {people && !shown.length && (!needle || found !== null) ? <p className="muted-text pad">No account found.</p> : null}
        {shown.map((p) => (
          <label key={p.id} className="row">
            <Avatar src={p.avatar_url} name={p.username} size={44} />
            <span className="row-text">
              <b>{p.full_name || p.username}</b>
              <span>{p.username}</span>
            </span>
            <input type="checkbox" className="round-check" checked={on(p)} onChange={(e) => flip(p, e.target.checked)} />
          </label>
        ))}
      </div>
      {picked.length ? (
        <>
          <input className="share-note" placeholder="Write a message…" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} aria-label="Message" />
          <div className="modal-foot">
            <button
              className="btn block"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await sharePost(me.id, postId, picked.map((p) => p.id), note);
                  toast(picked.length === 1 ? 'Sent' : `Sent to ${picked.length} people`);
                  onClose();
                } catch (e) {
                  toastError(e);
                  setBusy(false);
                }
              }}
            >
              {busy ? 'Sending…' : picked.length > 1 ? 'Send separately' : 'Send'}
            </button>
          </div>
        </>
      ) : (
        <div className="pp-share-actions">
          <ShareAction
            label="Copy link"
            icon="link"
            onClick={run(async () => {
              await copyText(postLink(postId));
              toast('Link copied');
              onClose();
            })}
          />
          {canStory ? (
            <ShareAction
              label="Add to story"
              icon="story"
              onClick={() => {
                onClose();
                // The story editor (Stories) opens with this post on the story.
                openCreate({ mode: 'story', sharePostId: postId });
              }}
            />
          ) : null}
          {post ? (
            <ShareAction
              label={post.reposted ? 'Remove repost' : 'Repost'}
              icon="repost"
              onClick={run(async () => {
                await setFlag(me.id, post, 'reposted', !post.reposted);
                toast(post.reposted ? 'Repost removed' : 'Reposted to your profile');
                onClose();
              })}
            />
          ) : null}
        </div>
      )}
    </Modal>
  );
}

/** One of the round buttons along the bottom of Share. */
function ShareAction({ label, icon, onClick }: { label: string; icon: 'link' | 'story' | 'repost'; onClick: () => void }) {
  return (
    <button type="button" className="pp-share-act" onClick={onClick}>
      <span className="pp-share-ring">
        <Icon name={icon} size={22} />
      </span>
      <span>{label}</span>
    </button>
  );
}

/* ---------- caption with tappable @mentions and #tags ---------- */

export function RichText({ text }: { text: string }) {
  const parts = text.split(/(@[a-z0-9._]{3,30}|#[\p{L}\p{N}_]+)/u);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('@') ? (
          <Link key={i} to={'/u/' + p.slice(1)} className="mention">
            {p}
          </Link>
        ) : p.startsWith('#') ? (
          <span key={i} className="mention">
            {p}
          </span>
        ) : (
          <React.Fragment key={i}>{p}</React.Fragment>
        ),
      )}
    </>
  );
}

/* ---------- the song ---------- */

/** "Title · Artist", as the iPhone writes a post's song. */
export const songOf = (p: Pick<Post, 'audio_title' | 'audio_artist'>) => (p.audio_title ? (p.audio_artist ? `${p.audio_title} · ${p.audio_artist}` : p.audio_title) : '');

/**
 * A post's song (picked from Pod in Create). Clicking it plays it in the app's player, the bar along
 * the bottom of the window, and clicking again pauses it. The Pod item is looked up for its cover;
 * if Pod can't be reached, the post's own copy of the song plays.
 */
export function SongButton({ post }: { post: Post }) {
  const player = usePlayer();
  const [busy, setBusy] = useState(false);
  const song = songOf(post);
  const on = !!post.audio_id && player.item?.id === post.audio_id;
  const playing = on && player.playing;
  const play = async () => {
    if (on) return player.toggle();
    if (!post.audio_id) return;
    setBusy(true);
    const item: PodItem | null =
      (await fetchPodItem(post.audio_id).catch(() => null)) ??
      (post.audio_url
        ? { id: post.audio_id, user_id: '', kind: 'song', title: post.audio_title ?? '', artist: post.audio_artist ?? '', description: '', cover_url: '', audio_url: post.audio_url, duration_seconds: 0, plays: 0, created_at: '', username: '', full_name: '', avatar_url: '', saved: false }
        : null);
    setBusy(false);
    if (item?.audio_url) player.play(item);
    else toast("This song isn't on Pod any more.");
  };
  return (
    <button type="button" className={'pp-song' + (playing ? ' on' : '')} onClick={play} disabled={busy} aria-pressed={playing} aria-label={(playing ? 'Pause ' : 'Play ') + song} title={playing ? 'Pause' : 'Play'}>
      <Icon name="music" size={12} stroke={2.2} />
      <span className="pp-song-name">{song}</span>
      <Icon name={playing ? 'pause' : 'play'} size={13} stroke={0} />
    </button>
  );
}

/* ---------- the header ---------- */

/** "22 h", as Instagram writes it on the web. */
const shortAgo = (iso: string) => ago(iso).replace(/^(\d+)([a-z])$/, '$1 $2');
const fullDate = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/**
 * The author (with their story ring), the time, and the line under the name: Sponsored for a paid ad,
 * the community or page it was posted in, the place or song, and the labels (AI info, For
 * subscribers, and "Only on your profile" for the author).
 */
function PostHeader({ post, inDialog, onMenu }: { post: Post; inDialog?: boolean; onMenu: () => void }) {
  const { me } = useMe();
  const stories = useStoryGroup(me.id, post.user_id);
  const [watching, setWatching] = useState(false);
  const mine = post.user_id === me.id;
  const canFollow = !mine && !post.following_author;
  const follow = () => setFollow(me.id, post.user_id, true).catch(toastError);

  const bits: React.ReactNode[] = [];
  // A paid ad says so plainly, under the name, so it never passes for an ordinary post.
  if (post.boosted) bits.push(<span className="pp-sponsored">Sponsored</span>);
  if (post.group_id && post.group_name) {
    bits.push(
      <span className="pp-group">
        in{' '}
        <Link to={'/groups/' + post.group_id} className="pp-strong">
          {post.group_name}
        </Link>
      </span>,
    );
  }
  if (!post.boosted && post.location) bits.push(<span className="pp-place">{post.location}</span>);
  // The song from Pod that goes with it, as Instagram writes it under the name: click to play it.
  if (post.audio_id && post.audio_title) bits.push(<SongButton post={post} />);
  if (post.audience === 'subscribers') {
    bits.push(
      <span className="pp-badge" title="Only people who subscribe can see it">
        <Icon name="lock" size={11} stroke={2.4} />
        For subscribers
      </span>,
    );
  }
  // Kept off feeds and Explore (a Plus perk): only the author is told, since only they see it anywhere else.
  if (mine && post.profile_only) {
    bits.push(
      <span className="pp-badge quiet">
        <Icon name="grid" size={11} stroke={2.2} />
        Only on your profile
      </span>,
    );
  }
  if (mine && post.sensitive) bits.push(<span className="pp-badge quiet">Marked sensitive</span>);
  if (post.ai_label) bits.push(<AiInfo />);
  if (!bits.length && !inDialog && canFollow && !post.in_my_group) bits.push(<span>Suggested for you</span>);

  return (
    <header className={'post-head pp-head' + (inDialog ? ' bordered' : '')}>
      <Avatar
        src={post.avatar_url}
        name={post.username}
        size={32}
        ring={ringOf(stories)}
        label={stories ? `See ${post.username}'s story` : post.username}
        onClick={() => (stories ? setWatching(true) : nav('/u/' + post.username))}
      />
      <div className="who">
        <div className="pp-who-line">
          <Link to={'/u/' + post.username} className="uname">
            {post.username}
          </Link>
          {post.verified ? <Verified /> : null}
          <span className="pp-dot">•</span>
          <time className="pp-time" dateTime={post.created_at} title={fullDate(post.created_at)}>
            {shortAgo(post.created_at)}
          </time>
          {inDialog && canFollow ? (
            <>
              <span className="pp-dot">•</span>
              <button className="link-btn inline" onClick={follow}>
                Follow
              </button>
            </>
          ) : null}
        </div>
        {bits.length ? (
          <div className="sub pp-sub">
            {bits.map((b, i) => (
              <React.Fragment key={i}>
                {i ? <span className="pp-sep">·</span> : null}
                {b}
              </React.Fragment>
            ))}
          </div>
        ) : null}
      </div>
      {!inDialog && canFollow && !post.in_my_group ? (
        <button className="btn small quiet pp-follow" onClick={follow}>
          Follow
        </button>
      ) : null}
      <button className="icon-btn" aria-label="More options" onClick={onMenu}>
        <Icon name="more" size={24} />
      </button>
      {watching && stories ? <StoryViewer groups={[stories]} start={0} onClose={() => setWatching(false)} /> : null}
    </header>
  );
}

/* ---------- the feed card ---------- */

export function FeedPost({ id, onOpenPost }: { id: string; onOpenPost: (id: string) => void }) {
  const { me } = useMe();
  const { post, toggle } = useFlags(id);
  const [menu, setMenu] = useState(false);
  const [share, setShare] = useState(false);
  const [more, setMore] = useState(false);
  const [text, setText] = useState('');
  const [answering, setAnswering] = useState(false);
  const [mine, setMine] = useState<{ username: string; text: string }[]>([]);
  const [gone, setGone] = useState(false);
  const ref = useRef<HTMLElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const canSee = useCanSee(post, me.id);
  const [veiled, reveal] = useVeil(post, me.id);
  useEffect(() => {
    const el = ref.current;
    if (!el || !post) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && recordView(me.id, post), { threshold: 0.5 });
    io.observe(el);
    return () => io.disconnect();
  }, [post?.id]);
  if (!post || gone) return null;
  // Members under 14 never see sensitive posts (the database leaves them out too).
  if (post.sensitive && post.user_id !== me.id && me.restricted) return null;
  const own = post.user_id === me.id;
  const closed = !!post.comments_off && !own;
  const locked = canSee === false;
  const long = post.caption.length > 125 || post.caption.split('\n').length > 2;
  const answer = () => {
    setAnswering(true);
    input.current?.focus();
  };
  return (
    <article className="feed-post pp-card" ref={ref} data-post={post.id}>
      <PostHeader post={post} onMenu={() => setMenu(true)} />
      <PostMedia post={post} locked={locked} pending={canSee === null} veiled={veiled} onReveal={reveal} onLike={() => !post.liked && toggle('liked', true)} />
      {locked ? null : (
        <>
          <ActionRow id={post.id} onComment={() => onOpenPost(post.id)} onShare={() => setShare(true)} />
          <LikeLine post={post} />
          {post.caption ? (
            <div className={'caption' + (long && !more ? ' clamp' : '')}>
              <Link to={'/u/' + post.username} className="uname">
                {post.username}
              </Link>
              {post.verified ? <Verified size={12} /> : null} <RichText text={post.caption} />
            </div>
          ) : null}
          {long && !more ? (
            <button className="link-muted" onClick={() => setMore(true)}>
              … more
            </button>
          ) : null}
          <PollCard post={post} />
          <PromptBanner post={post} onAnswer={closed ? undefined : answer} />
          {post.comment_count > mine.length ? (
            <button className="link-muted" onClick={() => onOpenPost(post.id)}>
              View {post.comment_count - mine.length === 1 ? '1 comment' : `all ${fmt(post.comment_count - mine.length)} comments`}
            </button>
          ) : null}
          {mine.map((c, i) => (
            <div className="caption" key={i}>
              <b>{c.username}</b> {c.text}
            </div>
          ))}
          {closed ? (
            <div className="pp-comments-off">Commenting is turned off</div>
          ) : (
            <form
              className="add-comment"
              onSubmit={async (e) => {
                e.preventDefault();
                const t = text.trim();
                if (!t) return;
                setText('');
                try {
                  await addComment(me.id, post, t);
                  setMine((m) => [...m, { username: me.username, text: t }]);
                  setAnswering(false);
                } catch (err) {
                  setText(t);
                  toastError(err);
                }
              }}
            >
              <input ref={input} placeholder={answering ? 'Write your answer…' : COMMENT_PLACEHOLDER} value={text} onChange={(e) => setText(e.target.value)} aria-label="Add a comment" maxLength={2200} />
              {text.trim() ? <button className="link-btn">Post</button> : null}
              <EmojiButton size={14} onPick={(e) => insertAt(input.current, text, e, setText)} />
            </form>
          )}
          {own && post.comments_off ? <div className="pp-note">Commenting is turned off. Only you can comment.</div> : null}
        </>
      )}
      {menu ? <PostMenu post={post} onClose={() => setMenu(false)} onOpen={() => onOpenPost(post.id)} onDeleted={() => setGone(true)} /> : null}
      {share ? <ShareDialog postId={post.id} onClose={() => setShare(false)} /> : null}
    </article>
  );
}

/* ---------- the post dialog ---------- */

/** Whether a key press is someone typing: an arrow in a box with words in it moves the cursor instead. */
function typing(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  if (t.isContentEditable) return true;
  return (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') && !!(t as HTMLInputElement).value;
}

/**
 * The post dialog (or, with `asPage`, the post on its own page at /p/<id>). Opened from a grid, it
 * has `list`, the grid's posts in order, and round arrows beside its left and right edges (and the
 * ← and → keys) move to the previous and next one, as on Instagram; there is no arrow at the ends.
 */
export function PostView({ id, onClose, asPage, list, onOpen }: { id: string; onClose: () => void; asPage?: boolean; list?: string[]; onOpen?: (id: string) => void }) {
  const at = list && onOpen ? list.indexOf(id) : -1;
  const prev = at > 0 ? list![at - 1] : null;
  const next = at >= 0 && at < list!.length - 1 ? list![at + 1] : null;
  const anchor = useRef<HTMLDivElement>(null);
  const step = useRef<(to: string | null) => void>(() => {});
  step.current = (to) => to && onOpen?.(to);
  const near = useRef({ prev, next });
  near.current = { prev, next };

  useEffect(() => {
    if (asPage) return;
    const key = (e: KeyboardEvent) => {
      if ((e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      // Only while this dialog is the one on top (not under its menu, Share, a confirmation or a story
      // opened from the author's ring), with no little box open beside a button.
      const mine = anchor.current?.closest('.scrim');
      const dialogs = document.querySelectorAll('[aria-modal="true"]');
      const top = dialogs[dialogs.length - 1];
      if (!mine || !top || !mine.contains(top) || document.querySelector('.pp-pop') || typing(e)) return;
      const to = e.key === 'ArrowLeft' ? near.current.prev : near.current.next;
      if (!to) return;
      e.preventDefault();
      step.current(to);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [asPage]);

  // Keyed by the post, so stepping to another one starts afresh (its comments, an empty comment box).
  const body = <PostBody key={id} id={id} onClose={onClose} />;
  if (asPage) return <div className="post-page">{body}</div>;
  return (
    <Modal onClose={onClose} bare className="post-dialog">
      {body}
      <div className="pp-steps" ref={anchor}>
        {prev ? (
          <button type="button" className="pp-step left" aria-label="Previous post" title="Previous" onClick={() => step.current(prev)}>
            <Icon name="back" size={16} color="#262626" stroke={2.6} />
          </button>
        ) : null}
        {next ? (
          <button type="button" className="pp-step right" aria-label="Next post" title="Next" onClick={() => step.current(next)}>
            <Icon name="right" size={16} color="#262626" stroke={2.6} />
          </button>
        ) : null}
      </div>
    </Modal>
  );
}

/** One post in the dialog: its photos on the left; the author, comments, actions and comment box on the right. */
function PostBody({ id, onClose }: { id: string; onClose: () => void }) {
  const { me } = useMe();
  const { post, toggle } = useFlags(id);
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [text, setText] = useState('');
  const [answering, setAnswering] = useState(false);
  const [menu, setMenu] = useState(false);
  const [share, setShare] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const canSee = useCanSee(post, me.id);
  const [veiled, reveal] = useVeil(post, me.id);
  useEffect(() => {
    fetchComments(id).then(setComments, (e) => {
      toastError(e);
      setComments([]);
    });
    if (!getPostNow(id)) {
      fetchPost(id).catch(toastError);
    }
  }, [id]);
  const hidden = !!post && post.sensitive && post.user_id !== me.id && !!me.restricted;
  // Opening a post counts as seeing it, as the iPhone counts a post in view (once per person).
  useEffect(() => {
    if (post && !hidden) recordView(me.id, post);
  }, [post?.id, hidden]);
  if (!post || hidden) {
    return <div className="post-dialog-loading">{comments === null && !hidden ? <Spinner /> : <Empty icon="image" title="This post isn't available" body="It may have been deleted." />}</div>;
  }
  const media = post.media;
  const ratio = aspectOf(media[0]);
  const own = post.user_id === me.id;
  const closed = !!post.comments_off && !own;
  const locked = canSee === false;
  const answer = () => {
    setAnswering(true);
    input.current?.focus();
  };
  return (
    <div className="post-dialog-body" data-post={post.id} style={{ ['--media-ratio' as any]: String(ratio) }}>
      <div className="post-dialog-media">
        <PostMedia post={post} fit="contain" ratio={ratio} locked={locked} pending={canSee === null} veiled={veiled} onReveal={reveal} onLike={() => !post.liked && toggle('liked', true)} />
      </div>
      <div className="post-dialog-side">
        <PostHeader post={post} inDialog onMenu={() => setMenu(true)} />
        {locked ? (
          <div className="comments pp-side-locked">
            <Icon name="lock" size={22} />
            <p>Comments on this post are for {post.username}'s subscribers.</p>
          </div>
        ) : (
          <>
            <div className="comments" ref={list}>
              {post.caption ? (
                <div className="comment">
                  <Avatar src={post.avatar_url} name={post.username} size={32} />
                  <div className="comment-body">
                    <Link to={'/u/' + post.username} className="uname">
                      {post.username}
                    </Link>
                    {post.verified ? <Verified size={12} /> : null} <RichText text={post.caption} />
                    <div className="comment-meta">{ago(post.created_at)}</div>
                  </div>
                </div>
              ) : null}
              {post.poll || post.prompt ? (
                <div className="pp-dialog-extras">
                  <PromptBanner post={post} onAnswer={closed ? undefined : answer} />
                  <PollCard post={post} />
                </div>
              ) : null}
              {comments === null ? <Spinner /> : null}
              {comments && !comments.length && !post.caption ? (
                <div className="no-comments">
                  <h3>No comments yet.</h3>
                  <p>{closed ? 'Commenting is turned off.' : 'Start the conversation.'}</p>
                </div>
              ) : null}
              {(comments ?? []).map((c) => (
                <CommentRow
                  key={c.id}
                  c={c}
                  canDelete={c.user_id === me.id || own}
                  onReply={
                    closed
                      ? undefined
                      : () => {
                          setText('@' + c.username + ' ');
                          input.current?.focus();
                        }
                  }
                  onDelete={async () => {
                    try {
                      await deleteComment(post, c.id);
                      setComments((cs) => (cs ?? []).filter((x) => x.id !== c.id));
                    } catch (e) {
                      toastError(e);
                    }
                  }}
                />
              ))}
            </div>
            <div className="post-dialog-foot">
              <ActionRow id={post.id} onComment={() => input.current?.focus()} onShare={() => setShare(true)} />
              <LikeLine post={post} />
              <div className="when">{new Date(post.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
              {own && post.comments_off ? <div className="pp-note">Commenting is turned off. Only you can comment.</div> : null}
            </div>
            {closed ? (
              <div className="pp-comments-off boxed">Commenting is turned off</div>
            ) : (
              <form
                className="add-comment boxed"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const t = text.trim();
                  if (!t) return;
                  setText('');
                  try {
                    await addComment(me.id, post, t);
                    setComments(await fetchComments(post.id));
                    setAnswering(false);
                    setTimeout(() => list.current?.scrollTo({ top: 1e6, behavior: 'smooth' }), 50);
                  } catch (err) {
                    setText(t);
                    toastError(err);
                  }
                }}
              >
                <EmojiButton size={24} onPick={(e) => insertAt(input.current, text, e, setText)} />
                <input ref={input} placeholder={answering ? 'Write your answer…' : COMMENT_PLACEHOLDER} value={text} onChange={(e) => setText(e.target.value)} aria-label="Add a comment" maxLength={2200} />
                <button className="link-btn" disabled={!text.trim()}>
                  Post
                </button>
              </form>
            )}
          </>
        )}
      </div>
      {menu ? <PostMenu post={post} onClose={() => setMenu(false)} onDeleted={onClose} /> : null}
      {share ? <ShareDialog postId={post.id} onClose={() => setShare(false)} /> : null}
    </div>
  );
}

function CommentRow({ c, canDelete, onReply, onDelete }: { c: Comment; canDelete: boolean; onReply?: () => void; onDelete: () => void }) {
  const { me } = useMe();
  const [liked, setLiked] = useState(c.liked);
  const [likes, setLikes] = useState(c.like_count);
  const flip = async () => {
    const next = !liked;
    setLiked(next);
    setLikes((n) => n + (next ? 1 : -1));
    try {
      await setCommentLike(me.id, c.id, next);
    } catch (e) {
      setLiked(!next);
      setLikes((n) => n + (next ? -1 : 1));
      toastError(e);
    }
  };
  return (
    <div className="comment">
      <Avatar src={c.avatar_url} name={c.username} size={32} onClick={() => nav('/u/' + c.username)} />
      <div className="comment-body">
        <Link to={'/u/' + c.username} className="uname">
          {c.username}
        </Link>
        {c.verified ? <Verified size={12} /> : null} <RichText text={c.text} />
        <div className="comment-meta">
          <span>{ago(c.created_at)}</span>
          {likes ? <span>{count(likes, 'like')}</span> : null}
          {onReply ? <button onClick={onReply}>Reply</button> : null}
          {canDelete ? <button onClick={onDelete}>Delete</button> : null}
        </div>
      </div>
      <button className="icon-btn tiny" aria-label={liked ? 'Unlike comment' : 'Like comment'} onClick={flip}>
        <Icon name="heart" size={12} color={liked ? '#ff3040' : 'currentColor'} fill={liked ? '#ff3040' : 'none'} />
      </button>
    </div>
  );
}

/* ---------- grid tile ---------- */

/**
 * A square on Explore and profiles: a Shorts or several-photos badge, a lock on posts for subscribers,
 * the counts on hover (no like count when the author hides it), and a blur over sensitive posts.
 * A photo post opens the post dialog (onOpen); a Short opens the Shorts player at that Short, with
 * `grid`'s other Shorts round it and more from `source` after them.
 */
export function Tile({ post, onOpen, tall, grid, source }: { post: Post; onOpen: (id: string) => void; tall?: boolean; grid?: Post[]; source?: GridSource }) {
  const { me } = useMe();
  const canSee = useCanSee(post, me.id);
  useEffect(() => putPosts([post]), [post.id]);
  const mine = post.user_id === me.id;
  if (post.sensitive && !mine && me.restricted) return null;
  const open = () => (isShort(post) ? openShortsFrom(post, grid ?? [post], source, me) : onOpen(post.id));
  const m = post.media[0];
  const cover = m?.type === 'video' ? m.poster || '' : m?.url;
  const locked = canSee === false;
  const veiled = post.sensitive && !mine;
  const subs = post.audience === 'subscribers';
  return (
    <button data-post={post.id} className={'tile' + (tall ? ' tall' : '') + (locked ? ' pp-tile-locked' : '') + (veiled ? ' pp-tile-veiled' : '')} onClick={open} aria-label={(post.kind === 'reel' ? 'Short by ' : 'Post by ') + post.username + (locked ? ', for subscribers' : '')}>
      {cover ? <img src={cover} alt={altOf(m)} loading="lazy" /> : m?.type === 'video' ? <video src={m.url} muted preload="metadata" /> : null}
      {post.kind === 'reel' ? (
        <span className="tile-badge" title="Short">
          <Icon name="reels" size={20} color="#fff" />
        </span>
      ) : post.media.length > 1 ? (
        <span className="tile-badge" title="Several photos">
          <Icon name="collage" size={20} color="#fff" />
        </span>
      ) : null}
      {subs ? (
        <span className="pp-tile-lock" title="For subscribers">
          <Icon name="lock" size={16} color="#fff" stroke={2.2} />
        </span>
      ) : null}
      {locked ? (
        <span className="pp-tile-cover">
          <Icon name="lock" size={28} color="#fff" stroke={1.8} />
          <b>For subscribers</b>
        </span>
      ) : veiled ? (
        <span className="pp-tile-cover">
          <EyeOffIcon size={28} />
          <b>Sensitive content</b>
        </span>
      ) : null}
      <span className="tile-hover">
        {post.hide_likes && !mine ? null : (
          <span>
            <Icon name="heart" size={20} color="#fff" fill="#fff" stroke={0} /> {fmt(post.like_count)}
          </span>
        )}
        {post.comments_off && !mine ? null : (
          <span>
            <Icon name="comment" size={20} color="#fff" fill="#fff" stroke={0} /> {fmt(post.comment_count)}
          </span>
        )}
      </span>
    </button>
  );
}
