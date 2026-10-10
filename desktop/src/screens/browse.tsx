// Home (stories, feed, suggestions), Explore (the mosaic grid) and Reels (full-height videos).
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { type FeedKind, fetchExplore, fetchFeed, fetchReels, fetchStoryTray, setFollow } from 'shared/api';
import { listen, putPosts } from 'shared/store';
import { fmt } from 'shared/theme';
import type { Post, Profile, StoryGroup } from 'shared/types';
import { suggestions } from '../lib/extra';
import { useMe } from '../lib/me';
import { nav } from '../lib/router';
import { Avatar, Empty, Failed, Icon, Link, Spinner, Verified, toastError } from '../ui/kit';
import { FeedPost, PostMenu, ShareDialog, Tile, useFlags } from '../ui/post';
import { StoryTray, StoryViewer } from '../ui/stories';

/* ---------- home ---------- */

export function Home({ openPost, onCreate }: { openPost: (id: string) => void; onCreate: (m: 'post' | 'story') => void }) {
  const { me } = useMe();
  const [kind, setKind] = useState<FeedKind>(() => {
    try {
      return (localStorage.getItem('community.feed') as FeedKind) || 'following';
    } catch {
      return 'following';
    }
  });
  const [ids, setIds] = useState<string[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [more, setMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [tray, setTray] = useState<StoryGroup[]>([]);
  const [viewing, setViewing] = useState<number | null>(null);
  const last = useRef<string | undefined>(undefined);
  const sentinel = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const page = await fetchFeed(me.id, undefined, kind);
      last.current = page[page.length - 1]?.created_at;
      setIds(page.map((p) => p.id));
      setMore(page.length >= 12);
    } catch (e) {
      setError(e);
    }
  }, [me.id, kind]);
  const loadTray = useCallback(() => fetchStoryTray(me.id).then(setTray, () => {}), [me.id]);

  useEffect(() => {
    setIds(null);
    load();
    try {
      localStorage.setItem('community.feed', kind);
    } catch {
      // not kept
    }
  }, [load]);
  useEffect(() => {
    loadTray();
    const offs = [listen('feed', load), listen('stories', loadTray)];
    return () => offs.forEach((o) => o());
  }, [load, loadTray]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(async ([e]) => {
      if (!e.isIntersecting || !more || loadingMore || !last.current) return;
      setLoadingMore(true);
      try {
        const page = await fetchFeed(me.id, last.current, kind);
        last.current = page[page.length - 1]?.created_at ?? last.current;
        setIds((cur) => [...(cur ?? []), ...page.map((p) => p.id).filter((id) => !(cur ?? []).includes(id))]);
        setMore(page.length >= 12);
      } catch (err) {
        toastError(err);
      } finally {
        setLoadingMore(false);
      }
    }, { rootMargin: '800px' });
    io.observe(el);
    return () => io.disconnect();
  }, [ids, more, loadingMore, kind]);

  return (
    <div className="home">
      <div className="home-main">
        <StoryTray groups={tray} onOpen={setViewing} onAdd={() => onCreate('story')} />
        <div className="feed-switch" role="tablist">
          {(['following', 'foryou'] as FeedKind[]).map((k) => (
            <button key={k} role="tab" aria-selected={kind === k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>
              {k === 'following' ? 'Following' : 'For you'}
            </button>
          ))}
        </div>
        <div className="feed">
          {error ? <Failed error={error} retry={load} /> : null}
          {ids === null && !error ? <Spinner /> : null}
          {ids && !ids.length ? (
            kind === 'following' ? (
              <Empty icon="image" title="Welcome to Community" body="Follow people to see their photos and videos here, or switch to For you to see everyone.">
                <div className="btn-row">
                  <button className="btn" onClick={() => setKind('foryou')}>
                    See For you
                  </button>
                  <button className="btn quiet" onClick={() => onCreate('post')}>
                    Share a photo
                  </button>
                </div>
              </Empty>
            ) : (
              <Empty icon="image" title="Nothing here yet" body="Nobody has posted yet. Share the first photo." />
            )
          ) : null}
          {(ids ?? []).map((id) => (
            <FeedPost key={id} id={id} onOpenPost={openPost} />
          ))}
          <div ref={sentinel} />
          {loadingMore ? <Spinner /> : null}
          {ids && ids.length && !more ? (
            <div className="caught-up">
              <Icon name="check" size={40} color="#1fbf5a" stroke={1.5} />
              <b>You're all caught up</b>
              <span>You've seen all new posts.</span>
            </div>
          ) : null}
        </div>
      </div>
      <Aside />
      {viewing !== null ? <StoryViewer groups={tray} start={viewing} onClose={() => { setViewing(null); loadTray(); }} onChanged={loadTray} /> : null}
    </div>
  );
}

function Aside() {
  const { me } = useMe();
  const [people, setPeople] = useState<Profile[] | null>(null);
  useEffect(() => {
    suggestions(me.id).then(setPeople, () => setPeople([]));
  }, [me.id]);
  return (
    <aside className="home-aside">
      <div className="me-row">
        <Avatar src={me.avatar_url} name={me.username} size={44} onClick={() => nav('/u/' + me.username)} />
        <span className="row-text">
          <Link to={'/u/' + me.username} className="uname">
            {me.username}
          </Link>
          <span>{me.full_name}</span>
        </span>
        <Link to="/accounts/edit" className="link-btn">
          Edit
        </Link>
      </div>
      {people && people.length ? (
        <>
          <div className="aside-head">
            <span>Suggested for you</span>
            <Link to="/explore/people" className="see-all">
              See all
            </Link>
          </div>
          {people.map((p) => (
            <Suggestion key={p.id} p={p} />
          ))}
        </>
      ) : null}
      <footer className="aside-foot">
        <span>Community · for the church family</span>
        <span>© {new Date().getFullYear()} Community</span>
      </footer>
    </aside>
  );
}

export function Suggestion({ p, big }: { p: Profile; big?: boolean }) {
  const { me } = useMe();
  const [on, setOn] = useState(p.is_following);
  return (
    <div className={'me-row suggestion' + (big ? ' big' : '')}>
      <Avatar src={p.avatar_url} name={p.username} size={big ? 44 : 32} ring={p.has_story ? 'new' : null} onClick={() => nav('/u/' + p.username)} />
      <span className="row-text">
        <Link to={'/u/' + p.username} className="uname">
          {p.username}
          {p.verified ? <Verified size={12} /> : null}
        </Link>
        <span>{p.follows_me ? 'Follows you' : p.full_name || 'Suggested for you'}</span>
      </span>
      <button
        className={big ? 'btn small' + (on ? ' quiet' : '') : 'link-btn' + (on ? ' muted' : '')}
        onClick={async () => {
          setOn(!on);
          try {
            await setFollow(me.id, p.id, !on);
          } catch (e) {
            setOn(on);
            toastError(e);
          }
        }}
      >
        {on ? 'Following' : 'Follow'}
      </button>
    </div>
  );
}

/* ---------- explore ---------- */

export function Explore({ openPost }: { openPost: (id: string) => void }) {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const load = () => {
    setError(null);
    fetchExplore().then(setPosts, setError);
  };
  useEffect(load, []);
  return (
    <div className="page explore">
      {error ? <Failed error={error} retry={load} /> : null}
      {!posts && !error ? <Spinner /> : null}
      {posts && !posts.length ? <Empty icon="compass" title="Nothing to explore yet" body="Photos and reels from everyone on Community will show up here." /> : null}
      <div className="mosaic">
        {(posts ?? []).map((p, i) => {
          // Instagram's pattern: in each block of five, one tall tile, alternating right and left.
          const block = Math.floor(i / 5);
          const pos = i % 5;
          const tall = (block % 2 === 0 && pos === 2) || (block % 2 === 1 && pos === 0);
          return <Tile key={p.id} post={p} onOpen={openPost} tall={tall} />;
        })}
      </div>
    </div>
  );
}

export function PeopleToFollow() {
  const { me } = useMe();
  const [people, setPeople] = useState<Profile[] | null>(null);
  useEffect(() => {
    suggestions(me.id, 30).then(setPeople, () => setPeople([]));
  }, []);
  return (
    <div className="page narrow-page">
      <h1 className="page-title">Suggested</h1>
      {!people ? <Spinner /> : null}
      {people && !people.length ? <p className="muted-text">You're following everyone already.</p> : null}
      {(people ?? []).map((p) => (
        <Suggestion key={p.id} p={p} big />
      ))}
    </div>
  );
}

/* ---------- reels ---------- */

export function Reels({ openPost }: { openPost: (id: string) => void }) {
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
      {list && !list.length ? <Empty icon="reels" title="No reels yet" body="Share a video of up to 60 seconds and it shows up here." /> : null}
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
