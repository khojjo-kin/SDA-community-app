// Instagram's desktop navigation: the left sidebar (wide with labels, narrow with icons when a panel
// is open or the window is small), the Search and Notifications panels that slide out of it, the
// More menu, and the bottom bar on narrow windows.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { acceptFollowRequest, countUnreadNotices, fetchFollowRequests, fetchNotices, fetchThreads, markNoticesRead, removeFollowRequest, searchProfiles, setFollow } from 'shared/api';
import { listen } from 'shared/store';
import { ago } from 'shared/theme';
import type { Notice, Profile } from 'shared/types';
import { useAuth } from '../lib/auth';
import { useMe } from '../lib/me';
import { nav, useRoute } from '../lib/router';
import { Avatar, Icon, type IconName, Link, Spinner, Verified, toastError, useOutside } from './kit';
import logo from './logo-white.png';

export type Panel = 'search' | 'notifications' | null;

function useCounts() {
  const [unreadChats, setUnreadChats] = useState(0);
  const [unreadNotices, setUnreadNotices] = useState(0);
  const load = useCallback(() => {
    fetchThreads().then((ts) => setUnreadChats(ts.filter((t) => t.has_messages && !t.muted && t.unread_count > 0).length), () => {});
    countUnreadNotices().then(setUnreadNotices, () => {});
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(() => !document.hidden && load(), 30000);
    const offs = [listen('threads', load), listen('notices', load)];
    window.addEventListener('focus', load);
    return () => {
      clearInterval(t);
      offs.forEach((o) => o());
      window.removeEventListener('focus', load);
    };
  }, [load]);
  return { unreadChats, unreadNotices };
}

export function Wordmark({ small }: { small?: boolean }) {
  return (
    <span className={'wordmark' + (small ? ' small' : '')}>
      Community
    </span>
  );
}

export function Sidebar({ panel, setPanel, onCreate }: { panel: Panel; setPanel: (p: Panel) => void; onCreate: (mode: 'post' | 'story') => void }) {
  const { me } = useMe();
  const auth = useAuth();
  const route = useRoute();
  const { unreadChats, unreadNotices } = useCounts();
  const [more, setMore] = useState(false);
  const [create, setCreate] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const createRef = useRef<HTMLDivElement>(null);
  useOutside(moreRef, () => setMore(false), more);
  useOutside(createRef, () => setCreate(false), create);
  // Menus close when you move to another page.
  useEffect(() => {
    setMore(false);
    setCreate(false);
  }, [route]);
  const narrow = panel !== null || route.startsWith('/direct') || route.startsWith('/live');
  const at = (p: string) => (p === '/' ? route === '/' : route === p || route.startsWith(p + '/'));
  const own = '/u/' + me.username;

  const item = (icon: IconName, label: string, opts: { to?: string; onClick?: () => void; active?: boolean; badge?: number; dot?: boolean; children?: React.ReactNode }) => {
    const active = opts.active ?? (opts.to ? at(opts.to) && panel === null : false);
    const content = (
      <>
        <span className="nav-icon">
          {opts.children ?? <Icon name={icon} size={24} stroke={active ? 2.6 : 1.8} fill={active && icon === 'home' ? 'currentColor' : 'none'} />}
          {opts.badge ? <span className="nav-badge">{opts.badge > 9 ? '9+' : opts.badge}</span> : opts.dot ? <span className="nav-dot" /> : null}
        </span>
        <span className="nav-label">{label}</span>
      </>
    );
    return opts.to ? (
      <a
        href={'#' + opts.to}
        className={'nav-item' + (active ? ' active' : '')}
        aria-current={active ? 'page' : undefined}
        title={label}
        onClick={(e) => {
          e.preventDefault();
          setPanel(null);
          nav(opts.to!);
        }}
      >
        {content}
      </a>
    ) : (
      <button className={'nav-item' + (active ? ' active' : '')} onClick={opts.onClick} title={label}>
        {content}
      </button>
    );
  };

  return (
    <>
      <nav className={'sidebar' + (narrow ? ' narrow' : '')} aria-label="Main">
        <a href="#/" className="sidebar-logo" onClick={(e) => { e.preventDefault(); setPanel(null); nav('/'); }} aria-label="Community home">
          <span className="logo-word">
            <Wordmark />
          </span>
          <span className="logo-icon">
            <img src={logo} alt="" width={28} height={28} />
          </span>
        </a>
        <div className="nav-list">
          {item('home', 'Home', { to: '/' })}
          {item('search', 'Search', { onClick: () => setPanel(panel === 'search' ? null : 'search'), active: panel === 'search' })}
          {item('compass', 'Explore', { to: '/explore' })}
          {item('reels', 'Reels', { to: '/reels' })}
          {item('send', 'Messages', { to: '/direct', badge: unreadChats })}
          {item('heart', 'Notifications', { onClick: () => setPanel(panel === 'notifications' ? null : 'notifications'), active: panel === 'notifications', dot: unreadNotices > 0 })}
          <div className="pop-anchor" ref={createRef}>
            {item('pluscircle', 'Create', { onClick: () => setCreate(!create), active: create })}
            {create ? (
              <div className="popover create-pop">
                <button onClick={() => { setCreate(false); onCreate('post'); }}>
                  Post <Icon name="image" size={20} />
                </button>
                <button onClick={() => { setCreate(false); onCreate('story'); }}>
                  Story <Icon name="story" size={20} />
                </button>
              </div>
            ) : null}
          </div>
          {item('user', 'Profile', { to: own, active: (route === own || route.startsWith(own + '/')) && panel === null, children: <Avatar src={me.avatar_url} name={me.username} size={24} /> })}
        </div>
        <div className="nav-bottom pop-anchor" ref={moreRef}>
          {item('people', 'Groups', { to: '/groups' })}
          {item('menu', 'More', { onClick: () => setMore(!more), active: more })}
          {more ? (
            <div className="popover more-pop">
              <MoreLink icon="settings" label="Settings" to="/accounts/edit" close={() => setMore(false)} />
              <MoreLink icon="activity" label="Your activity" to="/activity" close={() => setMore(false)} />
              <MoreLink icon="bookmark" label="Saved" to={own + '/saved'} close={() => setMore(false)} />
              <MoreLink icon="archive" label="Archive" to="/archive" close={() => setMore(false)} />
              <MoreLink icon="chart" label="Professional dashboard" to="/dashboard" close={() => setMore(false)} />
              <div className="pop-sep thick" />
              <div className="pop-label">Church</div>
              <MoreLink icon="bible" label="Bible" to="/bible" close={() => setMore(false)} />
              <MoreLink icon="lesson" label="Sabbath School" to="/lessons" close={() => setMore(false)} />
              <MoreLink icon="hymnal" label="Hymnal" to="/hymnal" close={() => setMore(false)} />
              <MoreLink icon="headphones" label="Pod" to="/pod" close={() => setMore(false)} />
              <MoreLink icon="church" label="Churches" to="/churches" close={() => setMore(false)} />
              <MoreLink icon="sparkle" label="Ask Erha" to="/direct/erha" close={() => setMore(false)} />
              <div className="pop-sep thick" />
              <MoreLink icon="crown" label={me.plus ? 'Community Plus' : 'Get the verified tick'} to="/plus" close={() => setMore(false)} />
              <MoreLink icon="help" label="Help" to="/help" close={() => setMore(false)} />
              {me.admin_role ? <MoreLink icon="shield" label="Admin console" to="/admin" close={() => setMore(false)} /> : null}
              <div className="pop-sep thick" />
              {!auth.demo ? (
                <button onClick={() => { setMore(false); auth.openAccount(); }}>
                  <Icon name="key" size={20} /> Email and password
                </button>
              ) : null}
              <button onClick={() => { setMore(false); auth.signOut(); }}>
                <Icon name="logout" size={20} /> Log out
              </button>
            </div>
          ) : null}
        </div>
      </nav>
      {panel === 'search' ? <SearchPanel close={() => setPanel(null)} /> : null}
      {panel === 'notifications' ? <NotificationsPanel close={() => setPanel(null)} /> : null}
    </>
  );
}

function MoreLink({ icon, label, to, close }: { icon: IconName; label: string; to: string; close: () => void }) {
  return (
    <a
      href={'#' + to}
      onClick={(e) => {
        e.preventDefault();
        close();
        nav(to);
      }}
    >
      <Icon name={icon} size={20} /> {label}
    </a>
  );
}

/* ---------- search panel ---------- */

const RECENT_KEY = 'community.recentSearches';
function readRecent(): Profile[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
  } catch {
    return [];
  }
}
function writeRecent(list: Profile[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 20)));
  } catch {
    // not kept
  }
}

function PanelShell({ title, close, children }: { title: string; close: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useOutside(ref, (() => {
    // Clicking the sidebar button toggles the panel itself, so ignore clicks there.
  }) as () => void);
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [close]);
  return (
    <aside className="side-panel" ref={ref} aria-label={title}>
      <h2>{title}</h2>
      {children}
    </aside>
  );
}

export function SearchPanel({ close }: { close: () => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Profile[] | null>(null);
  const [recent, setRecent] = useState<Profile[]>(readRecent);
  useEffect(() => {
    const needle = q.trim();
    if (!needle) return setResults(null);
    let alive = true;
    const t = setTimeout(() => {
      searchProfiles(needle).then((r) => alive && setResults(r), (e) => alive && toastError(e));
    }, 220);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q]);
  const open = (p: Profile) => {
    const next = [p, ...recent.filter((r) => r.id !== p.id)];
    setRecent(next);
    writeRecent(next);
    close();
    nav('/u/' + p.username);
  };
  const row = (p: Profile, removable?: boolean) => (
    <div className="row hover" key={p.id}>
      <button className="row-main" onClick={() => open(p)}>
        <Avatar src={p.avatar_url} name={p.username} size={44} ring={p.has_story ? 'new' : null} />
        <span className="row-text">
          <b>
            {p.username}
            {p.verified ? <Verified size={12} /> : null}
          </b>
          <span>
            {p.full_name}
            {p.followers_count ? ` • ${p.followers_count} followers` : ''}
            {p.is_following ? ' • Following' : ''}
          </span>
        </span>
      </button>
      {removable ? (
        <button
          className="icon-btn"
          aria-label={'Remove ' + p.username}
          onClick={() => {
            const next = recent.filter((r) => r.id !== p.id);
            setRecent(next);
            writeRecent(next);
          }}
        >
          <Icon name="close" size={16} />
        </button>
      ) : null}
    </div>
  );
  return (
    <PanelShell title="Search" close={close}>
      <div className="panel-search">
        <input autoFocus placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search people" />
        {q ? (
          <button className="clear" aria-label="Clear" onClick={() => setQ('')}>
            <Icon name="close" size={10} color="#0b1014" stroke={3} />
          </button>
        ) : null}
      </div>
      <div className="panel-body">
        {results === null ? (
          <>
            <div className="panel-sub">
              <b>Recent</b>
              {recent.length ? (
                <button className="link-btn" onClick={() => { setRecent([]); writeRecent([]); }}>
                  Clear all
                </button>
              ) : null}
            </div>
            {recent.length ? recent.map((p) => row(p, true)) : <p className="muted-text center pad">No recent searches.</p>}
          </>
        ) : results.length ? (
          results.map((p) => row(p))
        ) : (
          <p className="muted-text center pad">No results found.</p>
        )}
      </div>
    </PanelShell>
  );
}

/* ---------- notifications panel ---------- */

function bucket(iso: string): string {
  const d = Date.now() - new Date(iso).getTime();
  if (d < 86400e3) return 'Today';
  if (d < 7 * 86400e3) return 'This week';
  if (d < 30 * 86400e3) return 'This month';
  return 'Earlier';
}

export function NotificationsPanel({ close }: { close: () => void }) {
  const { me } = useMe();
  const [list, setList] = useState<Notice[] | null>(null);
  const [requests, setRequests] = useState<Profile[]>([]);
  const [showRequests, setShowRequests] = useState(false);
  const load = () => {
    fetchNotices().then(setList, (e) => {
      toastError(e);
      setList([]);
    });
    fetchFollowRequests(me.id).then(setRequests, () => {});
  };
  useEffect(() => {
    load();
    const t = setTimeout(() => markNoticesRead(me.id).catch(() => {}), 1200);
    return () => clearTimeout(t);
  }, []);
  const text = (n: Notice) =>
    n.kind === 'like' ? 'liked your post.' : n.kind === 'comment' ? `commented: ${n.body}` : n.kind === 'repost' ? 'reposted your post.' : n.kind === 'follow' ? 'started following you.' : n.kind === 'request' ? 'requested to follow you.' : 'accepted your follow request.';
  if (showRequests) {
    return (
      <PanelShell title="Follow requests" close={close}>
        <button className="link-btn pad-x" onClick={() => setShowRequests(false)}>
          ← Back
        </button>
        <div className="panel-body">
          {requests.map((p) => (
            <div className="row" key={p.id}>
              <Avatar src={p.avatar_url} name={p.username} size={44} onClick={() => { close(); nav('/u/' + p.username); }} />
              <span className="row-text">
                <b>{p.username}</b>
                <span>{p.full_name}</span>
              </span>
              <button className="btn small" onClick={() => acceptFollowRequest(p.id).then(() => setRequests((r) => r.filter((x) => x.id !== p.id)), toastError)}>
                Confirm
              </button>
              <button className="btn small quiet" onClick={() => removeFollowRequest(p.id, me.id).then(() => setRequests((r) => r.filter((x) => x.id !== p.id)), toastError)}>
                Delete
              </button>
            </div>
          ))}
          {!requests.length ? <p className="muted-text center pad">No pending requests.</p> : null}
        </div>
      </PanelShell>
    );
  }
  let last = '';
  return (
    <PanelShell title="Notifications" close={close}>
      <div className="panel-body">
        {requests.length ? (
          <button className="row hover requests-row" onClick={() => setShowRequests(true)}>
            <Avatar src={requests[0].avatar_url} name={requests[0].username} size={44} />
            <span className="row-text">
              <b>Follow requests</b>
              <span>
                {requests[0].username}
                {requests.length > 1 ? ` + ${requests.length - 1} others` : ''}
              </span>
            </span>
            <span className="nav-dot static" />
          </button>
        ) : null}
        {list === null ? <Spinner /> : null}
        {list && !list.length ? (
          <div className="empty small">
            <span className="empty-ring">
              <Icon name="heart" size={30} />
            </span>
            <p>Activity on your posts</p>
            <span className="muted-text">When someone likes or comments on one of your posts, you'll see it here.</span>
          </div>
        ) : null}
        {(list ?? []).map((n) => {
          const head = bucket(n.created_at);
          const show = head !== last;
          last = head;
          return (
            <React.Fragment key={n.id}>
              {show ? <h3 className="panel-h">{head}</h3> : null}
              <div className={'row notice' + (n.read_at ? '' : ' unread')}>
                <Avatar src={n.avatar_url} name={n.username} size={44} onClick={() => { close(); nav('/u/' + n.username); }} />
                <span className="row-text wrap">
                  <Link to={'/u/' + n.username} className="uname" onClick={close}>
                    {n.username}
                  </Link>
                  {n.verified ? <Verified size={12} /> : null} {text(n)} <span className="muted-text">{ago(n.created_at)}</span>
                </span>
                {n.post_id && n.post_media ? (
                  <a
                    href={'#/p/' + n.post_id}
                    className="notice-thumb"
                    onClick={(e) => {
                      e.preventDefault();
                      close();
                      nav('/p/' + n.post_id);
                    }}
                  >
                    <img src={n.post_media.type === 'video' ? n.post_media.poster || '' : n.post_media.url} alt="" />
                  </a>
                ) : n.kind === 'follow' ? (
                  <FollowBack n={n} />
                ) : null}
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </PanelShell>
  );
}

function FollowBack({ n }: { n: Notice }) {
  const { me } = useMe();
  const [on, setOn] = useState(n.is_following);
  return (
    <button
      className={'btn small' + (on ? ' quiet' : '')}
      onClick={async () => {
        setOn(!on);
        try {
          await setFollow(me.id, n.actor_id, !on);
        } catch (e) {
          setOn(on);
          toastError(e);
        }
      }}
    >
      {on ? 'Following' : 'Follow back'}
    </button>
  );
}
