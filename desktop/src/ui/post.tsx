// Posts: the feed card, the photo and video carousel, the action row, the share dialog, the
// three-dots menu, and the large post view with comments (Instagram's post dialog).
import React, { useEffect, useRef, useState } from 'react';
import { addComment, deleteComment, deletePost, fetchComments, fetchPost, peopleToMessage, recordView, report, setCommentLike, setFlag, setFollow, sharePost } from 'shared/api';
import { getPostNow, putPosts, usePost } from 'shared/store';
import { ago, count, fmt } from 'shared/theme';
import type { Comment, Media, Post, Profile } from 'shared/types';
import { useMe } from '../lib/me';
import { nav } from '../lib/router';
import { Avatar, ChoiceMenu, Empty, Icon, Link, Modal, Spinner, Verified, ask, toast, toastError } from './kit';

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
        if ((e.target as HTMLElement).closest('button')) return;
        setBurst((b) => b + 1);
        onDoubleClick?.();
      }}
    >
      <div className="track" style={{ transform: `translateX(${-100 * at}%)` }}>
        {media.map((m, i) =>
          m.type === 'video' ? (
            <div className="slide" key={i}>
              <video src={m.url} poster={m.poster} muted={muted} loop playsInline style={{ objectFit: fit }} onClick={(e) => { const v = e.currentTarget; v.paused ? v.play() : v.pause(); }} />
              <button className="mute" aria-label={muted ? 'Turn sound on' : 'Turn sound off'} onClick={() => setMuted(!muted)}>
                <Icon name={muted ? 'mute' : 'sound'} size={14} color="#fff" />
              </button>
            </div>
          ) : (
            <div className="slide" key={i}>
              <img src={m.url} alt="" draggable={false} loading={i ? 'lazy' : 'eager'} style={{ objectFit: fit }} />
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

export function ActionRow({ id, onComment, onShare }: { id: string; onComment: () => void; onShare: () => void }) {
  const { post, toggle } = useFlags(id);
  if (!post) return null;
  return (
    <div className="actions">
      <button className={'icon-btn' + (post.liked ? ' liked pop' : '')} aria-label={post.liked ? 'Unlike' : 'Like'} aria-pressed={post.liked} onClick={() => toggle('liked')}>
        <Icon name="heart" size={24} color={post.liked ? '#ff3040' : 'currentColor'} fill={post.liked ? '#ff3040' : 'none'} />
      </button>
      <button className="icon-btn" aria-label="Comment" onClick={onComment}>
        <Icon name="comment" size={24} />
      </button>
      <button className={'icon-btn' + (post.reposted ? ' reposted' : '')} aria-label={post.reposted ? 'Undo repost' : 'Repost'} aria-pressed={post.reposted} onClick={() => toggle('reposted')}>
        <Icon name="repost" size={24} color={post.reposted ? '#1fbf5a' : 'currentColor'} />
      </button>
      <button className="icon-btn" aria-label="Share" onClick={onShare}>
        <Icon name="send" size={24} />
      </button>
      <span className="grow" />
      <button className="icon-btn" aria-label={post.saved ? 'Remove from saved' : 'Save'} aria-pressed={post.saved} onClick={() => toggle('saved')}>
        <Icon name="bookmark" size={24} fill={post.saved ? 'currentColor' : 'none'} />
      </button>
    </div>
  );
}

export function LikeLine({ post }: { post: Post }) {
  if (!post.like_count) return <div className="likes muted-text">Be the first to like this</div>;
  return <div className="likes">{count(post.like_count, 'like')}</div>;
}

/* ---------- share ---------- */

export function ShareDialog({ postId, onClose }: { postId: string; onClose: () => void }) {
  const { me } = useMe();
  const [people, setPeople] = useState<Profile[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    peopleToMessage(me.id).then(setPeople, (e) => {
      toastError(e);
      setPeople([]);
    });
  }, []);
  const shown = (people ?? []).filter((p) => !q || p.username.includes(q.toLowerCase()) || p.full_name.toLowerCase().includes(q.toLowerCase()));
  return (
    <Modal onClose={onClose} title="Share" className="share">
      <div className="share-search">
        <span>To:</span>
        <input autoFocus placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search people" />
      </div>
      <div className="share-list">
        {people === null ? <Spinner /> : null}
        {people && !shown.length ? <p className="muted-text pad">No account found.</p> : null}
        {shown.map((p) => (
          <label key={p.id} className="row">
            <Avatar src={p.avatar_url} name={p.username} size={44} />
            <span className="row-text">
              <b>{p.full_name || p.username}</b>
              <span>{p.username}</span>
            </span>
            <input type="checkbox" className="round-check" checked={picked.includes(p.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, p.id] : picked.filter((x) => x !== p.id))} />
          </label>
        ))}
      </div>
      {picked.length ? <input className="share-note" placeholder="Write a message…" value={note} onChange={(e) => setNote(e.target.value)} /> : null}
      <div className="modal-foot">
        <button
          className="btn block"
          disabled={!picked.length || busy}
          onClick={async () => {
            setBusy(true);
            try {
              await sharePost(me.id, postId, picked, note);
              toast(picked.length === 1 ? 'Sent' : `Sent to ${picked.length} people`);
              onClose();
            } catch (e) {
              toastError(e);
              setBusy(false);
            }
          }}
        >
          {busy ? 'Sending…' : 'Send'}
        </button>
      </div>
    </Modal>
  );
}

/* ---------- three dots ---------- */

const REASONS = ["It's spam", 'Nudity or sexual activity', 'Hate speech or symbols', 'Violence or dangerous organisations', 'Bullying or harassment', 'False information', 'Scam or fraud', 'I just don\'t like it'];

export function PostMenu({ post, onClose, onOpen, onDeleted }: { post: Post; onClose: () => void; onOpen?: () => void; onDeleted?: () => void }) {
  const { me } = useMe();
  const [reporting, setReporting] = useState(false);
  if (reporting) {
    return (
      <ChoiceMenu
        onClose={onClose}
        items={REASONS.map((r) => ({
          label: r,
          onClick: async () => {
            try {
              await report(me.id, { postId: post.id }, r);
              toast('Thanks for letting us know. An admin will review it.');
            } catch (e) {
              toastError(e);
            }
          },
        }))}
      />
    );
  }
  const mine = post.user_id === me.id;
  const items = mine
    ? [
        {
          label: 'Delete',
          danger: true,
          bold: true,
          onClick: async () => {
            if (!(await ask('Delete post?', 'Are you sure you want to delete this post?', 'Delete'))) return;
            try {
              await deletePost(post.id);
              toast('Post deleted');
              onDeleted?.();
            } catch (e) {
              toastError(e);
            }
          },
        },
        ...(onOpen ? [{ label: 'Go to post', onClick: onOpen }] : []),
        { label: 'About this account', onClick: () => nav('/u/' + post.username) },
      ]
    : [
        { label: 'Report', danger: true, bold: true, onClick: () => setReporting(true) },
        ...(post.following_author
          ? [{ label: 'Unfollow', danger: true, bold: true, onClick: () => setFollow(me.id, post.user_id, false).then(() => toast('Unfollowed ' + post.username), toastError) }]
          : []),
        ...(onOpen ? [{ label: 'Go to post', onClick: onOpen }] : []),
        { label: 'About this account', onClick: () => nav('/u/' + post.username) },
      ];
  return <ChoiceMenu items={items} onClose={() => !reporting && onClose()} />;
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

/* ---------- the feed card ---------- */

export function FeedPost({ id, onOpenPost }: { id: string; onOpenPost: (id: string) => void }) {
  const { me } = useMe();
  const { post, toggle } = useFlags(id);
  const [menu, setMenu] = useState(false);
  const [share, setShare] = useState(false);
  const [more, setMore] = useState(false);
  const [text, setText] = useState('');
  const [mine, setMine] = useState<{ username: string; text: string }[]>([]);
  const [gone, setGone] = useState(false);
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !post) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && recordView(me.id, post), { threshold: 0.5 });
    io.observe(el);
    return () => io.disconnect();
  }, [post?.id]);
  if (!post || gone) return null;
  const long = post.caption.length > 125 || post.caption.split('\n').length > 2;
  return (
    <article className="feed-post" ref={ref}>
      <header className="post-head">
        <Avatar src={post.avatar_url} name={post.username} size={32} onClick={() => nav('/u/' + post.username)} />
        <div className="who">
          <div>
            <Link to={'/u/' + post.username} className="uname">
              {post.username}
            </Link>
            {post.verified ? <Verified /> : null}
            <span className="muted-text"> • {ago(post.created_at)}</span>
            {post.group_name ? <span className="muted-text"> • {post.group_name}</span> : null}
            {post.boosted ? <span className="boosted"> • Boosted</span> : null}
          </div>
          {post.location ? <div className="sub">{post.location}</div> : post.audio_title ? <div className="sub">♪ {post.audio_title}</div> : null}
        </div>
        {!post.following_author && post.user_id !== me.id ? (
          <button className="link-btn" onClick={() => setFollow(me.id, post.user_id, true).catch(toastError)}>
            Follow
          </button>
        ) : null}
        <button className="icon-btn" aria-label="More options" onClick={() => setMenu(true)}>
          <Icon name="more" size={24} />
        </button>
      </header>
      <Carousel media={post.media} onDoubleClick={() => !post.liked && toggle('liked', true)} />
      <ActionRow id={post.id} onComment={() => onOpenPost(post.id)} onShare={() => setShare(true)} />
      <LikeLine post={post} />
      {post.caption ? (
        <div className={'caption' + (long && !more ? ' clamp' : '')}>
          <Link to={'/u/' + post.username} className="uname">
            {post.username}
          </Link>{' '}
          <RichText text={post.caption} />
        </div>
      ) : null}
      {long && !more ? (
        <button className="link-muted" onClick={() => setMore(true)}>
          more
        </button>
      ) : null}
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
          } catch (err) {
            setText(t);
            toastError(err);
          }
        }}
      >
        <input placeholder="Add a comment…" value={text} onChange={(e) => setText(e.target.value)} aria-label="Add a comment" maxLength={2200} />
        {text.trim() ? <button className="link-btn">Post</button> : null}
      </form>
      {menu ? <PostMenu post={post} onClose={() => setMenu(false)} onOpen={() => onOpenPost(post.id)} onDeleted={() => setGone(true)} /> : null}
      {share ? <ShareDialog postId={post.id} onClose={() => setShare(false)} /> : null}
    </article>
  );
}

/* ---------- the post dialog ---------- */

export function PostView({ id, onClose, asPage }: { id: string; onClose: () => void; asPage?: boolean }) {
  const { me } = useMe();
  const { post, toggle } = useFlags(id);
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [text, setText] = useState('');
  const [menu, setMenu] = useState(false);
  const [share, setShare] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    fetchComments(id).then(setComments, (e) => {
      toastError(e);
      setComments([]);
    });
    if (!getPostNow(id)) {
      fetchPost(id).catch(toastError);
    }
  }, [id]);
  if (!post) {
    return (
      <Modal onClose={onClose} bare className="post-dialog">
        <div className="post-dialog-loading">{comments === null ? <Spinner /> : <Empty icon="image" title="This post isn't available" body="It may have been deleted." />}</div>
      </Modal>
    );
  }
  const media = post.media;
  const ratio = aspectOf(media[0]);
  const body = (
    <div className="post-dialog-body" style={{ ['--media-ratio' as any]: String(ratio) }}>
      <div className="post-dialog-media">
        <Carousel media={media} fit="contain" ratio={ratio} onDoubleClick={() => !post.liked && toggle('liked', true)} />
      </div>
      <div className="post-dialog-side">
        <header className="post-head bordered">
          <Avatar src={post.avatar_url} name={post.username} size={32} ring={null} onClick={() => nav('/u/' + post.username)} />
          <div className="who">
            <div>
              <Link to={'/u/' + post.username} className="uname">
                {post.username}
              </Link>
              {post.verified ? <Verified /> : null}
              {!post.following_author && post.user_id !== me.id ? (
                <>
                  <span className="muted-text"> • </span>
                  <button className="link-btn inline" onClick={() => setFollow(me.id, post.user_id, true).catch(toastError)}>
                    Follow
                  </button>
                </>
              ) : null}
            </div>
            {post.location ? <div className="sub">{post.location}</div> : null}
          </div>
          <button className="icon-btn" aria-label="More options" onClick={() => setMenu(true)}>
            <Icon name="more" size={24} />
          </button>
        </header>
        <div className="comments" ref={list}>
          {post.caption ? (
            <div className="comment">
              <Avatar src={post.avatar_url} name={post.username} size={32} />
              <div className="comment-body">
                <Link to={'/u/' + post.username} className="uname">
                  {post.username}
                </Link>{' '}
                <RichText text={post.caption} />
                <div className="comment-meta">{ago(post.created_at)}</div>
              </div>
            </div>
          ) : null}
          {comments === null ? <Spinner /> : null}
          {comments && !comments.length && !post.caption ? (
            <div className="no-comments">
              <h3>No comments yet.</h3>
              <p>Start the conversation.</p>
            </div>
          ) : null}
          {(comments ?? []).map((c) => (
            <CommentRow
              key={c.id}
              c={c}
              canDelete={c.user_id === me.id || post.user_id === me.id}
              onReply={() => {
                setText('@' + c.username + ' ');
                input.current?.focus();
              }}
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
        </div>
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
              setTimeout(() => list.current?.scrollTo({ top: 1e6, behavior: 'smooth' }), 50);
            } catch (err) {
              setText(t);
              toastError(err);
            }
          }}
        >
          <Icon name="smile" size={24} />
          <input ref={input} placeholder="Add a comment…" value={text} onChange={(e) => setText(e.target.value)} aria-label="Add a comment" maxLength={2200} />
          <button className="link-btn" disabled={!text.trim()}>
            Post
          </button>
        </form>
      </div>
      {menu ? <PostMenu post={post} onClose={() => setMenu(false)} onDeleted={onClose} /> : null}
      {share ? <ShareDialog postId={post.id} onClose={() => setShare(false)} /> : null}
    </div>
  );
  if (asPage) return <div className="post-page">{body}</div>;
  return (
    <Modal onClose={onClose} bare className="post-dialog">
      {body}
    </Modal>
  );
}

function CommentRow({ c, canDelete, onReply, onDelete }: { c: Comment; canDelete: boolean; onReply: () => void; onDelete: () => void }) {
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
          <button onClick={onReply}>Reply</button>
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

export function Tile({ post, onOpen, tall }: { post: Post; onOpen: (id: string) => void; tall?: boolean }) {
  const m = post.media[0];
  const cover = m?.type === 'video' ? m.poster || '' : m?.url;
  useEffect(() => putPosts([post]), [post.id]);
  return (
    <button className={'tile' + (tall ? ' tall' : '')} onClick={() => onOpen(post.id)} aria-label={'Post by ' + post.username}>
      {cover ? <img src={cover} alt="" loading="lazy" /> : m?.type === 'video' ? <video src={m.url} muted preload="metadata" /> : null}
      {post.kind === 'reel' ? (
        <span className="tile-badge">
          <Icon name="reels" size={20} color="#fff" />
        </span>
      ) : post.media.length > 1 ? (
        <span className="tile-badge">
          <Icon name="collage" size={20} color="#fff" />
        </span>
      ) : null}
      <span className="tile-hover">
        <span>
          <Icon name="heart" size={20} color="#fff" fill="#fff" stroke={0} /> {fmt(post.like_count)}
        </span>
        <span>
          <Icon name="comment" size={20} color="#fff" fill="#fff" stroke={0} /> {fmt(post.comment_count)}
        </span>
      </span>
    </button>
  );
}
