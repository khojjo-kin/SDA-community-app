// Shorts: full-height videos, one at a time, with the actions beside them.
import React, { useEffect, useRef, useState } from 'react';
import { fetchReels, setFollow } from 'shared/api';
import { putPosts } from 'shared/store';
import { fmt } from 'shared/theme';
import type { Post } from 'shared/types';
import { useMe } from '../lib/me';
import { nav } from '../lib/router';
import { Avatar, Empty, Failed, Icon, Link, Spinner, Verified, toastError } from '../ui/kit';
import { PostMenu, ShareDialog, useFlags } from '../ui/post';

export function Shorts({ openPost }: { openPost: (id: string) => void }) {
  const [list, setList] = useState<Post[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [muted, setMuted] = useState(true);
  const load = () => {
    setError(null);
    fetchReels(false).then((r) => {
      putPosts(r);
      setList(r);
    }, setError);
  };
  useEffect(load, []);
  return (
    <div className="reels" tabIndex={-1}>
      {error ? <Failed error={error} retry={load} /> : null}
      {!list && !error ? <Spinner /> : null}
      {list && !list.length ? <Empty icon="reels" title="No Shorts yet" body="Share a video of up to 60 seconds and it shows up here." /> : null}
      {(list ?? []).map((p) => (
        <Reel key={p.id} id={p.id} muted={muted} setMuted={setMuted} openPost={openPost} />
      ))}
    </div>
  );
}

function Reel({ id, muted, setMuted, openPost }: { id: string; muted: boolean; setMuted: (m: boolean) => void; openPost: (id: string) => void }) {
  const { me } = useMe();
  const { post, toggle } = useFlags(id);
  const video = useRef<HTMLVideoElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const [menu, setMenu] = useState(false);
  const [share, setShare] = useState(false);
  const [burst, setBurst] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      const v = video.current;
      if (!v) return;
      if (e.isIntersecting) {
        v.currentTime = 0;
        v.play().then(() => setPaused(false), () => setPaused(true));
      } else v.pause();
    }, { threshold: 0.7 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  if (!post) return null;
  const m = post.media[0];
  return (
    <div className="reel" ref={box}>
      <div
        className="reel-video"
        onClick={() => {
          const v = video.current;
          if (!v) return;
          if (v.paused) {
            v.play();
            setPaused(false);
          } else {
            v.pause();
            setPaused(true);
          }
        }}
        onDoubleClick={() => {
          setBurst((b) => b + 1);
          if (!post.liked) toggle('liked', true);
        }}
      >
        <video ref={video} src={m.url} poster={m.poster} loop playsInline muted={muted} />
        {paused ? (
          <span className="reel-paused">
            <Icon name="play" size={64} color="#fff" />
          </span>
        ) : null}
        {burst ? (
          <span className="burst" key={burst}>
            <Icon name="heart" size={96} color="#fff" fill="#fff" stroke={0} />
          </span>
        ) : null}
        <button className="mute top" aria-label={muted ? 'Turn sound on' : 'Turn sound off'} onClick={(e) => { e.stopPropagation(); setMuted(!muted); }}>
          <Icon name={muted ? 'mute' : 'sound'} size={16} color="#fff" />
        </button>
        <div className="reel-info" onClick={(e) => e.stopPropagation()}>
          <div className="who">
            <Avatar src={post.avatar_url} name={post.username} size={32} onClick={() => nav('/u/' + post.username)} />
            <Link to={'/u/' + post.username} className="uname">
              {post.username}
            </Link>
            {post.verified ? <Verified size={12} /> : null}
            {!post.following_author && post.user_id !== me.id ? (
              <button className="btn outline small" onClick={() => setFollowOn()}>
                Follow
              </button>
            ) : null}
          </div>
          {post.caption ? <p className="reel-caption">{post.caption}</p> : null}
          {post.audio_title ? <p className="reel-audio">♪ {post.audio_title}</p> : null}
        </div>
      </div>
      <div className="reel-actions">
        <button aria-label={post.liked ? 'Unlike' : 'Like'} onClick={() => toggle('liked')}>
          <Icon name="heart" size={26} color={post.liked ? '#ff3040' : 'currentColor'} fill={post.liked ? '#ff3040' : 'none'} />
          <span>{fmt(post.like_count)}</span>
        </button>
        <button aria-label="Comments" onClick={() => openPost(post.id)}>
          <Icon name="comment" size={26} />
          <span>{fmt(post.comment_count)}</span>
        </button>
        <button aria-label="Repost" onClick={() => toggle('reposted')}>
          <Icon name="repost" size={26} color={post.reposted ? '#1fbf5a' : 'currentColor'} />
          <span>{fmt(post.repost_count)}</span>
        </button>
        <button aria-label="Share" onClick={() => setShare(true)}>
          <Icon name="send" size={26} />
        </button>
        <button aria-label={post.saved ? 'Remove from saved' : 'Save'} onClick={() => toggle('saved')}>
          <Icon name="bookmark" size={26} fill={post.saved ? 'currentColor' : 'none'} />
        </button>
        <button aria-label="More" onClick={() => setMenu(true)}>
          <Icon name="more" size={26} />
        </button>
        <Avatar src={post.avatar_url} name={post.username} size={28} />
      </div>
      {menu ? <PostMenu post={post} onClose={() => setMenu(false)} onOpen={() => openPost(post.id)} /> : null}
      {share ? <ShareDialog postId={post.id} onClose={() => setShare(false)} /> : null}
    </div>
  );
  function setFollowOn() {
    setFollow(me.id, post!.user_id, true).catch(toastError);
  }
}
