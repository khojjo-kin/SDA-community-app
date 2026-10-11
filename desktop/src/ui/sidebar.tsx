// The desktop navigation, as on Instagram on a computer: a narrow rail of icons that widens to show
// labels while the pointer is over it, with the More, Create and Church apps menus, and the
// Notifications panel that slides out beside it.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { acceptFollowRequest, countUnreadNotices, fetchFollowRequests, fetchNotices, fetchThreads, markNoticesRead, removeFollowRequest, setFollow } from 'shared/api';
import { listen } from 'shared/store';
import { ago } from 'shared/theme';
import type { Notice, Profile } from 'shared/types';
import { setAppearance, useAppearance } from '../lib/appearance';
import { useAuth } from '../lib/auth';
import { t } from '../lib/i18n';
import { useMe } from '../lib/me';
import { nav, useRoute } from '../lib/router';
import { AccountSwitcher } from './accounts';
import { Avatar, Icon, type IconName, Link, Verified, toastError, useOutside } from './kit';
import { RowsSkeleton } from './skeleton';
import logo from './logo-white.png';
import '../styles/polish.css';

export type Panel = 'notifications' | null;
export type CreateMode = 'post' | 'story' | 'short' | 'live' | 'ad';

export function useCounts() {
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
  return <span className={'wordmark' + (small ? ' small' : '')}>Community</span>;
}

type Menu = 'more' | 'create' | 'apps' | null;

export function Sidebar({ panel, setPanel, onCreate }: { panel: Panel; setPanel: (p: Panel) => void; onCreate: (mode: CreateMode) => void }) {
  const { me } = useMe();
  const route = useRoute();
  const { unreadChats, unreadNotices } = useCounts();
  const [menu, setMenu] = useState<Menu>(null);
  const [switcher, setSwitcher] = useState(false);
  const railRef = useRef<HTMLElement>(null);
  useOutside(railRef, () => setMenu(null), menu !== null);
  // Menus close when you move to another page.
  useEffect(() => setMenu(null), [route]);
  const at = (p: string) => (p === '/' ? route === '/' : route === p || route.startsWith(p + '/'));
  const own = '/u/' + me.username;

  const item = (icon: IconName, label: string, opts: { to?: string; onClick?: () => void; active?: boolean; badge?: number; dot?: boolean; children?: React.ReactNode; filled?: boolean }) => {
    const active = opts.active ?? (opts.to ? at(opts.to) && panel === null : false);
    const content = (
      <>
        <span className="nav-icon">
          {opts.children ?? <Icon name={icon} size={24} stroke={active ? 2.4 : 1.8} fill={active && opts.filled ? 'currentColor' : 'none'} />}
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
        aria-label={label}
        onClick={(e) => {
          e.preventDefault();
          setPanel(null);
          setMenu(null);
          nav(opts.to!);
        }}
      >
        {content}
      </a>
    ) : (
      <button className={'nav-item' + (active ? ' active' : '')} onClick={opts.onClick} aria-label={label} aria-expanded={opts.active}>
        {content}
      </button>
    );
  };

  const toggle = (m: Exclude<Menu, null>) => setMenu(menu === m ? null : m);
  const create = (mode: CreateMode) => {
    setMenu(null);
    onCreate(mode);
  };

  return (
    <>
      <nav ref={railRef} className={'rail' + (menu ? ' open' : '') + (panel ? ' has-panel' : '')} aria-label={t('d.frame.mainNav')}>
        <a href="#/" className="rail-logo" onClick={(e) => { e.preventDefault(); setPanel(null); nav('/'); }} aria-label={t('d.frame.homeLink')}>
          <img src={logo} alt="" width={26} height={26} />
          <span className="nav-label rail-word">
            <Wordmark small />
          </span>
        </a>
        <div className="rail-middle">
          {item('home', t('tabs.home'), { to: '/', filled: true })}
          {item('reels', t('tabs.clips'), { to: '/shorts', active: (at('/shorts') || at('/reels')) && panel === null })}
          {item('send', t('tabs.messages'), { to: '/direct', badge: unreadChats })}
          {item('search', t('tabs.search'), { to: '/explore' })}
          {item('heart', t('common.notifications'), { onClick: () => setPanel(panel === 'notifications' ? null : 'notifications'), active: panel === 'notifications', dot: unreadNotices > 0 })}
          <div className="pop-anchor">
            {item('plus', t('common.create'), { onClick: () => toggle('create'), active: menu === 'create' })}
            {menu === 'create' ? (
              <div className="popover create-pop" role="menu">
                <button role="menuitem" onClick={() => create('post')}>
                  {t('d.frame.createPost')} <Icon name="collage" size={22} />
                </button>
                <button role="menuitem" onClick={() => create('story')}>
                  {t('notifications.storyBadge')} <Icon name="story" size={22} />
                </button>
                <button role="menuitem" onClick={() => create('short')}>
                  {t('createFlow.short')} <Icon name="reels" size={22} />
                </button>
                <button role="menuitem" onClick={() => create('live')}>
                  {t('d.frame.createLive')} <Icon name="live" size={22} />
                </button>
                <button role="menuitem" onClick={() => create('ad')}>
                  {t('d.frame.createAd')} <Icon name="ad" size={22} />
                </button>
              </div>
            ) : null}
          </div>
          {item('dashboard', t('settings.dashboard'), { to: '/dashboard', filled: false })}
          {item('user', t('tabs.profile'), { to: own, active: (route === own || route.startsWith(own + '/')) && panel === null, children: <Avatar src={me.avatar_url} name={me.username} size={26} /> })}
        </div>
        <div className="rail-bottom">
          <div className="pop-anchor">
            {item('menu', t('d.frame.more'), { onClick: () => toggle('more'), active: menu === 'more' })}
            {menu === 'more' ? <MoreMenu close={() => setMenu(null)} openSwitcher={() => { setMenu(null); setSwitcher(true); }} /> : null}
          </div>
          <div className="pop-anchor">
            {item('apps', t('churchApps.title'), { onClick: () => toggle('apps'), active: menu === 'apps' })}
            {menu === 'apps' ? <ChurchApps close={() => setMenu(null)} /> : null}
          </div>
        </div>
      </nav>
      {panel === 'notifications' ? <NotificationsPanel close={() => setPanel(null)} /> : null}
      {switcher ? <AccountSwitcher onClose={() => setSwitcher(false)} /> : null}
    </>
  );
}

function MenuLink({ icon, label, to, close }: { icon: IconName; label: string; to: string; close: () => void }) {
  return (
    <a
      href={'#' + to}
      role="menuitem"
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

function MoreMenu({ close, openSwitcher }: { close: () => void; openSwitcher: () => void }) {
  const { me } = useMe();
  const auth = useAuth();
  const look = useAppearance();
  const [appearance, setAppearanceView] = useState(false);
  const own = '/u/' + me.username;
  if (appearance) {
    return (
      <div className="popover more-pop" role="menu">
        <div className="pop-title">
          <button className="icon-btn" aria-label={t('common.back')} onClick={() => setAppearanceView(false)}>
            <Icon name="back" size={18} />
          </button>
          <b>{t('d.frame.appearance')}</b>
          <Icon name={look === 'white' ? 'sun' : 'moon'} size={18} />
        </div>
        <div className="pop-sep" />
        <label className="pop-toggle">
          <span>{t('d.frame.darkMode')}</span>
          <input type="checkbox" role="switch" checked={look === 'dark'} onChange={(e) => setAppearance(e.target.checked ? 'dark' : 'white')} aria-label={t('d.frame.darkMode')} />
          <i className="switch" aria-hidden="true" />
        </label>
      </div>
    );
  }
  return (
    <div className="popover more-pop" role="menu">
      <MenuLink icon="settings" label={t('d.frame.settings')} to="/accounts/edit" close={close} />
      <MenuLink icon="activity" label={t('settings.yourActivity')} to="/activity" close={close} />
      <MenuLink icon="bookmark" label={t('settings.saved')} to={own + '/saved'} close={close} />
      <MenuLink icon="archive" label={t('settings.archive')} to="/archive" close={close} />
      <button role="menuitem" onClick={() => setAppearanceView(true)}>
        <Icon name={look === 'white' ? 'sun' : 'moon'} size={20} /> {t('d.frame.appearance')}
      </button>
      <MenuLink icon="report" label={t('help.reportProblem')} to="/help/problem" close={close} />
      <div className="pop-sep thick" />
      <MenuLink icon="crown" label={me.plus ? t('common.communityPlus') : t('d.frame.getPlus')} to="/plus" close={close} />
      <MenuLink icon="help" label={t('d.frame.help')} to="/help" close={close} />
      {me.admin_role ? <MenuLink icon="shield" label={t('d.frame.adminConsole')} to="/admin" close={close} /> : null}
      <div className="pop-sep thick" />
      <button role="menuitem" className="plain" onClick={openSwitcher}>
        {t('accounts.switchHint')}
      </button>
      <div className="pop-sep" />
      <button
        role="menuitem"
        className="plain"
        onClick={() => {
          close();
          auth.signOut();
        }}
      >
        {auth.accounts.length > 1 ? t('d.frame.logOutAs', { username: me.username }) : t('settings.logOut')}
      </button>
    </div>
  );
}

/** The church's own apps, the way Instagram lists Meta's: one place for all of them, as on the iPhone. Names only. */
function ChurchApps({ close }: { close: () => void }) {
  // label is a key, drawn with t() below.
  const apps: { icon: IconName; label: string; to: string }[] = [
    { icon: 'bible', label: 'churchApps.bible', to: '/bible' },
    { icon: 'lesson', label: 'churchApps.sabbathSchool', to: '/lessons' },
    { icon: 'hymnal', label: 'churchApps.hymnal', to: '/hymnal' },
    { icon: 'headphones', label: 'churchApps.pod', to: '/pod' },
    { icon: 'church', label: 'churchApps.churches', to: '/churches' },
    { icon: 'calendar', label: 'churchApps.events', to: '/events' },
    { icon: 'pin', label: 'churchApps.map', to: '/map' },
    { icon: 'people', label: 'd.frame.appGroups', to: '/groups' },
    { icon: 'sparkle', label: 'd.frame.appErha', to: '/direct/erha' },
  ];
  return (
    <div className="popover apps-pop" role="menu">
      <div className="pop-label">{t('churchApps.title')}</div>
      {apps.map((a) => (
        <a
          key={a.to}
          href={'#' + a.to}
          role="menuitem"
          onClick={(e) => {
            e.preventDefault();
            close();
            nav(a.to);
          }}
        >
          <span className="app-icon">
            <Icon name={a.icon} size={20} />
          </span>
          <span className="app-text">
            <b>{t(a.label)}</b>
          </span>
        </a>
      ))}
    </div>
  );
}

/* ---------- notifications panel ---------- */

function bucket(iso: string): string {
  const then = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = (today.getTime() - new Date(then.getFullYear(), then.getMonth(), then.getDate()).getTime()) / 86400e3;
  if (d <= 0) return t('liveSchedule.today');
  if (d <= 1) return t('d.frame.yesterday');
  if (d < 7) return t('d.frame.thisWeek');
  if (d < 30) return t('d.frame.thisMonth');
  return t('notifications.sectionEarlier');
}

type NoticeFilter = 'all' | 'following' | 'comments' | 'follows' | 'likes' | 'tags';
// label is a key, drawn with t().
const FILTERS: { id: NoticeFilter; label: string }[] = [
  { id: 'all', label: 'bibleMarks.all' },
  { id: 'following', label: 'settings.repliesFollowing' },
  { id: 'comments', label: 'live.comments' },
  { id: 'follows', label: 'd.frame.filterFollows' },
  { id: 'likes', label: 'd.frame.likes' },
  { id: 'tags', label: 'd.frame.filterTags' },
];

function matches(n: Notice, f: NoticeFilter) {
  switch (f) {
    case 'following':
      return n.is_following;
    case 'comments':
      return n.kind === 'comment';
    case 'follows':
      return n.kind === 'follow' || n.kind === 'request' || n.kind === 'accept';
    case 'likes':
      return n.kind === 'like';
    case 'tags':
      return n.kind === 'tag';
    default:
      return true;
  }
}

export function noticeText(n: Notice): string {
  switch (n.kind) {
    case 'like':
      return t('notifications.like');
    case 'comment':
      return t('d.frame.noticeComment', { text: String(n.body) });
    case 'repost':
      return t('notifications.repost');
    case 'follow':
      return t('notifications.follow');
    case 'request':
      return t('d.frame.noticeRequest');
    case 'accept':
      return t('notifications.accept');
    case 'new_post':
      return t('notifications.newPost');
    case 'new_clip':
      return t('d.frame.noticeNewShort');
    case 'new_story':
      return t('notifications.newStory');
    case 'live':
      return t('d.frame.noticeLive');
    case 'live_soon':
      return n.body ? t('d.frame.noticeLiveSoonTitle', { title: n.body }) : t('d.frame.noticeLiveSoon');
    case 'story_watch':
      return t('d.frame.noticeStoryWatch');
    case 'subscriber':
      return t('notifications.subscriber');
    case 'tag':
      return t('notifications.tag');
    default:
      return '';
  }
}

export function NotificationsPanel({ close }: { close: () => void }) {
  const { me } = useMe();
  const [list, setList] = useState<Notice[] | null>(null);
  const [requests, setRequests] = useState<Profile[]>([]);
  const [showRequests, setShowRequests] = useState(false);
  const [filter, setFilter] = useState<NoticeFilter>('all');
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
    const key = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('keydown', key);
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', key);
    };
  }, []);
  const go = (to: string) => {
    close();
    nav(to);
  };

  if (showRequests) {
    return (
      <aside className="side-panel notices" aria-label={t('notifications.followRequests')}>
        <div className="panel-top">
          <button className="icon-btn" aria-label={t('common.back')} onClick={() => setShowRequests(false)}>
            <Icon name="back" size={20} />
          </button>
          <h2>{t('notifications.followRequests')}</h2>
          <span />
        </div>
        <div className="panel-body">
          {requests.map((p) => (
            <div className="row" key={p.id}>
              <Avatar src={p.avatar_url} name={p.username} size={44} onClick={() => go('/u/' + p.username)} />
              <span className="row-text">
                <b>{p.username}</b>
                <span>{p.full_name}</span>
              </span>
              <button className="btn small" onClick={() => acceptFollowRequest(p.id).then(() => setRequests((r) => r.filter((x) => x.id !== p.id)), toastError)}>
                {t('auth.confirm')}
              </button>
              <button className="btn small quiet" onClick={() => removeFollowRequest(p.id, me.id).then(() => setRequests((r) => r.filter((x) => x.id !== p.id)), toastError)}>
                {t('common.delete')}
              </button>
            </div>
          ))}
          {!requests.length ? <p className="muted-text center pad">{t('d.frame.noPending')}</p> : null}
        </div>
      </aside>
    );
  }

  const shown = (list ?? []).filter((n) => matches(n, filter));
  let last = '';
  return (
    <aside className="side-panel notices" aria-label={t('common.notifications')}>
      <div className="panel-top">
        <h2>{t('common.notifications')}</h2>
        <button className="icon-btn" aria-label={t('common.close')} onClick={close}>
          <Icon name="close" size={20} />
        </button>
      </div>
      <div className="chip-row" role="tablist" aria-label={t('d.frame.noticeFilters')}>
        {FILTERS.map((f) => (
          <button key={f.id} role="tab" aria-selected={filter === f.id} className={'filter-chip' + (filter === f.id ? ' on' : '')} onClick={() => setFilter(f.id)}>
            {t(f.label)}
          </button>
        ))}
      </div>
      <div className="panel-body">
        {requests.length && filter === 'all' ? (
          <button className="row hover requests-row" onClick={() => setShowRequests(true)}>
            <Avatar src={requests[0].avatar_url} name={requests[0].username} size={44} />
            <span className="row-text">
              <b>{t('notifications.followRequests')}</b>
              <span>{requests.length > 1 ? t('d.frame.requestsMore', { username: requests[0].username, count: requests.length - 1 }) : requests[0].username}</span>
            </span>
            <span className="nav-dot static" />
          </button>
        ) : null}
        {list === null ? <RowsSkeleton count={6} /> : null}
        {list && !shown.length ? (
          <div className="empty small">
            <span className="empty-ring">
              <Icon name="heart" size={30} />
            </span>
            <p>{filter === 'all' ? t('notifications.emptyTitle') : t('bibleMarks.emptyFilter')}</p>
          </div>
        ) : null}
        {shown.map((n) => {
          const head = bucket(n.created_at);
          const show = head !== last;
          last = head;
          return (
            <React.Fragment key={n.id}>
              {show ? <h3 className="panel-h">{head}</h3> : null}
              <div className={'row notice' + (n.read_at ? '' : ' unread')}>
                <Avatar src={n.avatar_url} name={n.username} size={44} onClick={() => go(n.kind === 'live' && n.post_id ? '/live/' + n.post_id : '/u/' + n.username)} />
                <span className="row-text wrap">
                  <Link to={'/u/' + n.username} className="uname" onClick={close}>
                    {n.username}
                  </Link>
                  {n.verified ? <Verified size={12} /> : null} {noticeText(n)} <span className="muted-text">{ago(n.created_at)}</span>
                </span>
                {n.post_id && n.post_media ? (
                  <a
                    href={'#/p/' + n.post_id}
                    className="notice-thumb"
                    onClick={(e) => {
                      e.preventDefault();
                      go('/p/' + n.post_id);
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
    </aside>
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
      {on ? t('common.following') : t('common.followBack')}
    </button>
  );
}
