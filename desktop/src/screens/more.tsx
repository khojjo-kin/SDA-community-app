// Settings (built in settings-frame.tsx and the settings-*.tsx pages), Your activity, and the church
// features from the iPhone app: the Hymnal, Churches, and Communities and pages.
import React, { useEffect, useMemo, useState } from 'react';
import { fetchChurchMembers, fetchChurches, fetchGroup, fetchGroupPosts, fetchGroups, fetchHymn, fetchHymns, fetchLiked, fetchMyComments, fetchMyGroups, joinGroup, leaveGroup } from 'shared/api';
import { supabase } from 'shared/supabase';
import { getPostNow } from 'shared/store';
import { ago, agoLong } from 'shared/theme';
import type { Church, Comment, Group, Hymn, Post } from 'shared/types';
import type { Session } from '../lib/admin';
import { useMe } from '../lib/me';
import { nav, parts, useRoute } from '../lib/router';
import { Avatar, Empty, Failed, Icon, type IconName, Link, Spinner, ask, toast, toastError, useLoad } from '../ui/kit';
import { FeedPost, Tile } from '../ui/post';
import { HYMN_COUNT, loadFavourites, loadHymnalSettings, saveHymnalSettings, toggleFavourite } from 'shared/hymnal';

/* ---------- settings (in settings-frame.tsx) ---------- */

export { Settings } from './settings-frame';

/* ---------- your activity ---------- */

const ACTIVITY: { group: string; items: { id: string; label: string; icon: IconName; to?: string }[] }[] = [
  {
    group: 'Interactions',
    items: [
      { id: 'likes', label: 'Likes', icon: 'heart' },
      { id: 'comments', label: 'Comments', icon: 'comment' },
    ],
  },
  {
    group: 'Content you shared',
    items: [
      { id: 'posts', label: 'Posts and Shorts', icon: 'grid', to: 'profile' },
      { id: 'archive', label: 'Stories archive', icon: 'archive', to: '/archive' },
    ],
  },
  { group: 'Account history', items: [{ id: 'history', label: 'Account history', icon: 'clock' }] },
];

/** Your activity: the same two-column layout as Settings, with likes, comments and account history. */
export function Activity({ openPost }: { openPost: (id: string) => void }) {
  const { me } = useMe();
  const route = useRoute();
  const asked = parts(route)[1];
  const tab = asked === 'comments' || asked === 'history' ? asked : 'likes';
  return (
    <div className="st-shell">
      <nav className="st-nav" aria-label="Your activity">
        <h2 className="st-nav-title">Your activity</h2>
        <div className="st-nav-list">
          {ACTIVITY.map((g) => (
            <div key={g.group} className="st-group">
              <h3 className="st-group-h">{g.group}</h3>
              {g.items.map((it) => (
                <Link key={it.id} to={it.to === 'profile' ? '/u/' + me.username : it.to ?? '/activity/' + it.id} className={'st-nav-item' + (it.id === tab ? ' on' : '')}>
                  <Icon name={it.icon} />
                  <span className="st-nav-text">
                    <span>{it.label}</span>
                  </span>
                </Link>
              ))}
            </div>
          ))}
        </div>
      </nav>
      <div className="st-body">{tab === 'likes' ? <LikedPosts openPost={openPost} /> : tab === 'comments' ? <MyComments openPost={openPost} /> : <AccountHistory />}</div>
    </div>
  );
}

function LikedPosts({ openPost }: { openPost: (id: string) => void }) {
  const { me } = useMe();
  const likes = useLoad<Post[]>(() => fetchLiked(me.id), []);
  return (
    <div className="st-page wide">
      <h1 className="st-title">Likes</h1>
      <p className="st-intro">Posts and Shorts you've liked, newest first. Only you can see this.</p>
      {likes.loading ? <Spinner /> : likes.error ? <Failed error={likes.error} retry={likes.reload} /> : likes.data?.length ? (
        <div className="grid st-activity-grid">{likes.data.map((p) => <Tile key={p.id} post={p} onOpen={openPost} />)}</div>
      ) : (
        <Empty icon="heart" title="No likes yet" body="Posts you like appear here." />
      )}
    </div>
  );
}

function MyComments({ openPost }: { openPost: (id: string) => void }) {
  const { me } = useMe();
  const comments = useLoad<Comment[]>(() => fetchMyComments(me.id), []);
  return (
    <div className="st-page wide">
      <h1 className="st-title">Comments</h1>
      <p className="st-intro">Comments you've written, newest first. Open one to see it on its post, or delete it there.</p>
      {comments.loading ? <Spinner /> : comments.error ? <Failed error={comments.error} retry={comments.reload} /> : comments.data?.length ? (
        <div className="st-card">
          {comments.data.map((c) => {
            const p = getPostNow(c.post_id);
            const cover = p?.media[0]?.type === 'video' ? p.media[0].poster : p?.media[0]?.url;
            return (
              <button key={c.id} className="st-row st-link st-comment" onClick={() => openPost(c.post_id)}>
                <Avatar src={me.avatar_url} name={me.username} size={36} />
                <span className="st-row-text wrap">
                  <b>{c.text}</b>
                  <span>
                    On {p ? p.username + "'s post" : 'a post'} · {ago(c.created_at)}
                  </span>
                </span>
                {cover ? <img className="row-thumb" src={cover} alt="" /> : null}
              </button>
            );
          })}
        </div>
      ) : (
        <Empty icon="comment" title="No comments yet" body="Comments you write appear here." />
      )}
    </div>
  );
}

const PLATFORM_NAMES: Record<string, string> = { mac: 'Community for Mac', web: 'Community on the web', ios: 'Community for iPhone', windows: 'Community for Windows' };

/** When you joined, and each app and computer you've used Community on (the app's own record). */
function AccountHistory() {
  const { me } = useMe();
  const sessions = useLoad(async () => {
    const { data, error } = await supabase.from('community_sessions').select('*').eq('user_id', me.id).order('first_seen', { ascending: false }).limit(30);
    if (error) throw error;
    return (data as Session[]) ?? [];
  }, []);
  const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  return (
    <div className="st-page wide">
      <h1 className="st-title">Account history</h1>
      <p className="st-intro">When you joined, and where you first used Community. To see where you're logged in now, open Settings → Accounts Centre.</p>
      <div className="st-card st-timeline">
        {(sessions.data ?? []).map((s) => (
          <div key={s.id} className="st-row">
            <span className="st-row-icon">
              <Icon name={s.platform === 'ios' ? 'phone' : 'mac'} />
            </span>
            <span className="st-row-text">
              <b>First used {PLATFORM_NAMES[s.platform] ?? 'Community'}</b>
              <span>
                {day(s.first_seen)}
                {s.country ? ' · ' + s.country : ''} · last used {agoLong(s.last_seen).toLowerCase()}
              </span>
            </span>
          </div>
        ))}
        <div className="st-row">
          <span className="st-row-icon">
            <Icon name="user" />
          </span>
          <span className="st-row-text">
            <b>You joined Community</b>
            <span>{day(me.created_at)}</span>
          </span>
        </div>
      </div>
      {sessions.loading ? <Spinner /> : null}
    </div>
  );
}

/* ---------- hymnal ---------- */

export function Hymnal({ number }: { number?: string }) {
  const list = useLoad(() => fetchHymns(), []);
  const [q, setQ] = useState('');
  const [favs, setFavs] = useState<number[]>([]);
  const [onlyFavs, setOnlyFavs] = useState(false);
  const [size, setSize] = useState(18);
  useEffect(() => {
    loadFavourites().then(setFavs);
    loadHymnalSettings().then((s) => setSize(s.size));
  }, []);
  const resize = (n: number) => {
    setSize(n);
    saveHymnalSettings({ size: n });
  };
  const [hymn, setHymn] = useState<Hymn | null>(null);
  const [loadingHymn, setLoadingHymn] = useState(false);
  useEffect(() => {
    if (!number) return setHymn(null);
    setLoadingHymn(true);
    fetchHymn(Number(number)).then(setHymn, toastError).finally(() => setLoadingHymn(false));
  }, [number]);
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (list.data ?? []).filter((h) => (!onlyFavs || favs.includes(h.number)) && (!n || String(h.number) === n || h.title.toLowerCase().includes(n) || (h.section ?? '').toLowerCase().includes(n)));
  }, [q, list.data, onlyFavs, favs]);
  return (
    <div className="split-page">
      <section className="split-list">
        <header>
          <h1>Hymnal</h1>
          <div className="panel-search in-modal">
            <input placeholder="Number, title or section" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search hymns" />
          </div>
          <div className="seg left pad-l">
            <button className={!onlyFavs ? 'on' : ''} onClick={() => setOnlyFavs(false)}>
              All {list.data ? list.data.length : HYMN_COUNT}
            </button>
            <button className={onlyFavs ? 'on' : ''} onClick={() => setOnlyFavs(true)}>
              Favourites {favs.length}
            </button>
          </div>
        </header>
        <div className="split-scroll">
          {list.loading ? <Spinner /> : list.error ? <Failed error={list.error} retry={list.reload} /> : null}
          {shown.map((h) => (
            <Link key={h.number} to={'/hymnal/' + h.number} className={'hymn-row' + (String(h.number) === number ? ' on' : '')}>
              <span className="hymn-no">{h.number}</span>
              <span className="row-text">
                <b>{h.title}</b>
                <span>{h.section}</span>
              </span>
            </Link>
          ))}
          {list.data && !shown.length ? <p className="muted-text pad">No hymn matches “{q}”.</p> : null}
        </div>
      </section>
      <section className="split-detail">
        {loadingHymn ? <Spinner /> : hymn ? (
          <article className="hymn">
            <div className="reader-bar">
              <div className="hymn-no big">{hymn.number}</div>
              <span className="grow" />
              <button className="icon-btn" aria-label={favs.includes(hymn.number) ? 'Remove from favourites' : 'Add to favourites'} onClick={() => toggleFavourite(hymn.number).then(setFavs)}>
                <Icon name="heart" size={24} color={favs.includes(hymn.number) ? '#ff3040' : 'currentColor'} fill={favs.includes(hymn.number) ? '#ff3040' : 'none'} />
              </button>
              <button className="btn quiet small" aria-label="Smaller text" onClick={() => resize(Math.max(14, size - 2))}>
                A−
              </button>
              <button className="btn quiet small" aria-label="Larger text" onClick={() => resize(Math.min(32, size + 2))}>
                A+
              </button>
            </div>
            <h1>{hymn.title}</h1>
            {hymn.author ? <p className="muted-text">{hymn.author}</p> : null}
            <div className="lyrics" style={{ fontSize: size }}>{hymn.lyrics}</div>
          </article>
        ) : (
          <Empty icon="hymnal" title="Choose a hymn" body={list.data ? `${list.data.length} hymns from the Seventh-day Adventist Hymnal.` : undefined} />
        )}
      </section>
    </div>
  );
}

/* ---------- churches ---------- */

export function Churches({ id }: { id?: string }) {
  const list = useLoad(() => fetchChurches(), []);
  const [q, setQ] = useState('');
  const church = (list.data ?? []).find((c) => c.id === id) ?? null;
  const shown = (list.data ?? []).filter((c) => !q || (c.name + ' ' + c.city + ' ' + c.country).toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="split-page">
      <section className="split-list">
        <header>
          <h1>Churches</h1>
          <div className="panel-search in-modal">
            <input placeholder="Name or town" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search churches" />
          </div>
        </header>
        <div className="split-scroll">
          {list.loading ? <Spinner /> : list.error ? <Failed error={list.error} retry={list.reload} /> : null}
          {list.data && !list.data.length ? <p className="muted-text pad">No churches have been added yet. Add yours from the iPhone app.</p> : null}
          {shown.map((c) => (
            <Link key={c.id} to={'/churches/' + c.id} className={'hymn-row' + (c.id === id ? ' on' : '')}>
              <span className="hymn-no">
                <Icon name="church" size={20} />
              </span>
              <span className="row-text">
                <b>{c.name}</b>
                <span>{[c.city, c.country].filter(Boolean).join(', ')}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>
      <section className="split-detail">{church ? <ChurchDetail c={church} /> : <Empty icon="church" title="Choose a church" body="Service times, address and members." />}</section>
    </div>
  );
}

function ChurchDetail({ c }: { c: Church }) {
  const members = useLoad(() => fetchChurchMembers(c.id), [c.id]);
  const map = c.lat != null && c.lng != null ? `https://maps.apple.com/?ll=${c.lat},${c.lng}&q=${encodeURIComponent(c.name)}` : `https://maps.apple.com/?q=${encodeURIComponent([c.name, c.address, c.city, c.country].filter(Boolean).join(', '))}`;
  return (
    <article className="church">
      <h1>{c.name}</h1>
      <p>{[c.address, c.city, c.country].filter(Boolean).join(', ')}</p>
      {c.service_times ? (
        <p>
          <b>Services:</b> {c.service_times}
        </p>
      ) : null}
      <div className="btn-row">
        <a className="btn quiet" href={map} target="_blank" rel="noreferrer">
          Directions
        </a>
        {c.website ? (
          <a className="btn quiet" href={/^https?:/.test(c.website) ? c.website : 'https://' + c.website} target="_blank" rel="noreferrer">
            Website
          </a>
        ) : null}
      </div>
      <h3>Members on Community</h3>
      {members.loading ? <Spinner /> : null}
      {members.data && !members.data.length ? <p className="muted-text">Nobody has set this as their church yet.</p> : null}
      {(members.data ?? []).map((p) => (
        <div className="row" key={p.id}>
          <Avatar src={p.avatar_url} name={p.username} size={40} onClick={() => nav('/u/' + p.username)} />
          <span className="row-text">
            <Link to={'/u/' + p.username} className="uname">
              {p.username}
            </Link>
            <span>{p.full_name}</span>
          </span>
        </div>
      ))}
    </article>
  );
}

/* ---------- communities and pages ---------- */

export function Groups({ id, openPost }: { id?: string; openPost: (id: string) => void }) {
  const { me } = useMe();
  const all = useLoad(() => fetchGroups(), []);
  const mine = useLoad(() => fetchMyGroups(me.id), []);
  if (id) return <GroupPage id={id} openPost={openPost} onChanged={() => mine.reload()} />;
  const card = (g: Group) => (
    <Link key={g.id} to={'/groups/' + g.id} className="group-card">
      <span className="group-cover">{g.cover_url ? <img src={g.cover_url} alt="" /> : null}</span>
      <b>{g.name}</b>
      <span className="muted-text">
        {g.kind === 'page' ? 'Page' : 'Community'} · {g.member_count} {g.kind === 'page' ? 'followers' : 'members'}
        {g.privacy === 'private' ? ' · Private' : ''}
      </span>
    </Link>
  );
  return (
    <div className="page">
      <h1 className="page-title">Communities and pages</h1>
      {mine.data?.length ? (
        <>
          <h3 className="section-h">Yours</h3>
          <div className="group-grid">{mine.data.map(card)}</div>
        </>
      ) : null}
      <h3 className="section-h">Discover</h3>
      {all.loading ? <Spinner /> : all.error ? <Failed error={all.error} retry={all.reload} /> : null}
      {all.data && !all.data.length ? <p className="muted-text">No communities or pages yet. Start one from the iPhone app.</p> : null}
      <div className="group-grid">{(all.data ?? []).filter((g) => !mine.data?.some((m) => m.id === g.id)).map(card)}</div>
    </div>
  );
}

function GroupPage({ id, openPost, onChanged }: { id: string; openPost: (id: string) => void; onChanged: () => void }) {
  const { me } = useMe();
  const g = useLoad(() => fetchGroup(id), [id]);
  const posts = useLoad(() => fetchGroupPosts(id), [id]);
  if (g.loading && !g.data) return <Spinner />;
  if (g.error) return <Failed error={g.error} retry={g.reload} />;
  const group = g.data;
  if (!group) return <Empty icon="people" title="Not found" body="This community or page may have been deleted." />;
  const standing = group.my_standing;
  const hidden = group.privacy === 'private' && (!standing || standing === 'pending');
  return (
    <div className="page group-page">
      <div className="group-hero">{group.cover_url ? <img src={group.cover_url} alt="" /> : null}</div>
      <div className="group-title">
        <div>
          <h1>{group.name}</h1>
          <p className="muted-text">
            @{group.handle} · {group.kind === 'page' ? 'Page' : 'Community'} · {group.member_count} {group.kind === 'page' ? 'followers' : 'members'} · {group.posts_count} posts
          </p>
          {group.description ? <p>{group.description}</p> : null}
        </div>
        {standing === 'owner' ? (
          <span className="pill">Owner</span>
        ) : standing === 'pending' ? (
          <button className="btn quiet" onClick={() => leaveGroup(me.id, group.id).then(() => { g.reload(); onChanged(); }, toastError)}>
            Requested
          </button>
        ) : standing ? (
          <button
            className="btn quiet"
            onClick={async () => {
              if (!(await ask('Leave ' + group.name + '?', '', 'Leave'))) return;
              leaveGroup(me.id, group.id).then(() => { g.reload(); onChanged(); }, toastError);
            }}
          >
            {group.kind === 'page' ? 'Following' : 'Joined'}
          </button>
        ) : (
          <button className="btn" onClick={() => joinGroup(me.id, group).then(() => { g.reload(); onChanged(); toast(group.privacy === 'private' ? 'Request sent' : 'Joined'); }, toastError)}>
            {group.privacy === 'private' ? 'Ask to join' : group.kind === 'page' ? 'Follow' : 'Join'}
          </button>
        )}
      </div>
      {hidden ? (
        <div className="private-note">
          <Icon name="lock" size={40} stroke={1.3} />
          <h2>This community is private</h2>
          <p>Join to see its posts.</p>
        </div>
      ) : posts.loading ? (
        <Spinner />
      ) : posts.data?.length ? (
        <div className="feed centered">{posts.data.map((p) => <FeedPost key={p.id} id={p.id} onOpenPost={openPost} />)}</div>
      ) : (
        <Empty icon="image" title="No posts yet" />
      )}
    </div>
  );
}
