// Home (stories, feed, suggestions) and Explore (search and the mosaic grid). For you keeps to the
// member's topics and sensitive filter (Settings → Content preferences), Explore to the sensitive
// filter, as on the iPhone.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { type FeedKind, dismissSuggestion, fetchExplore, fetchFeed, fetchLives, fetchStoryTray, fetchSuggestedPeople, searchProfiles, setFollow } from 'shared/api';
import { listen, putPosts } from 'shared/store';
import { fmt } from 'shared/theme';
import type { LiveCard, Post, Profile, StoryGroup, SuggestedPerson } from 'shared/types';
import { t } from '../lib/i18n';
import { useMe } from '../lib/me';
import { nav } from '../lib/router';
import { Avatar, Empty, Failed, Icon, Link, Spinner, Verified, toastError } from '../ui/kit';
import { AccountSwitcher } from '../ui/accounts';
import { FeedPost, Tile } from '../ui/post';
import { type GridSource, gridIds, tasteKey, tasteOf, tuneFeed } from '../ui/post-data';
import type { CreateMode } from '../ui/sidebar';
import { StoryTray, StoryViewer } from '../ui/stories';

/** Posts the server sends to Home at a time (see fetchFeed). */
const FEED_PAGE = 12;
/** When the member's choices leave a whole page out, look this many pages further before giving up. */
const EXTRA_PAGES = 2;

/* ---------- home ---------- */

export function Home({ openPost, onCreate }: { openPost: (id: string) => void; onCreate: (m: CreateMode) => void }) {
  const { me } = useMe();
  const [kind, setKind] = useState<FeedKind>(() => {
    try {
      // For you and Following, as on the iPhone.
      return localStorage.getItem('community.feed') === 'foryou' ? 'foryou' : 'following';
    } catch {
      return 'following';
    }
  });
  const [ids, setIds] = useState<string[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [more, setMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [tray, setTray] = useState<StoryGroup[]>([]);
  const [lives, setLives] = useState<LiveCard[]>([]);
  const [viewing, setViewing] = useState<number | null>(null);
  const last = useRef<string | undefined>(undefined);
  const sentinel = useRef<HTMLDivElement>(null);
  // What the member wants more and less of: For you is ranked by it; Following is left as it is.
  const taste = tasteOf(me);
  const key = tasteKey(taste);
  const tasteRef = useRef(taste);
  tasteRef.current = taste;

  /**
   * The next page from the server after `before`, tuned for For you. Paging follows what the server
   * sent, so a page the member's choices empty isn't taken for the end: a few more are looked at.
   */
  const page = useCallback(
    async (before: string | undefined): Promise<{ posts: Post[]; last: string | undefined; more: boolean }> => {
      let cursor = before;
      for (let i = 0; ; i++) {
        const got = await fetchFeed(me.id, cursor, kind);
        cursor = got[got.length - 1]?.created_at ?? cursor;
        const more = got.length >= FEED_PAGE;
        const posts = kind === 'foryou' ? tuneFeed(got, me.id, tasteRef.current, true) : got;
        if (posts.length || !more || i >= EXTRA_PAGES) return { posts, last: cursor, more };
      }
    },
    [me.id, kind],
  );

  const load = useCallback(async () => {
    setError(null);
    try {
      const got = await page(undefined);
      last.current = got.last;
      setIds(got.posts.map((p) => p.id));
      setMore(got.more);
    } catch (e) {
      setError(e);
    }
    // `key` is here so new choices in Content preferences load the feed again with them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, key]);
  const loadTray = useCallback(() => {
    fetchStoryTray(me.id).then(setTray, () => {});
    fetchLives().then((l) => setLives(l.filter((x) => !x.ended_at)), () => {});
  }, [me.id]);

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
        const got = await page(last.current);
        last.current = got.last;
        setIds((cur) => [...(cur ?? []), ...got.posts.map((p) => p.id).filter((id) => !(cur ?? []).includes(id))]);
        setMore(got.more);
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
        <StoryTray groups={tray} lives={lives} onOpen={setViewing} onAdd={() => onCreate('story')} />
        <div className="feed-switch" role="tablist" aria-label={t('d.posts.feed')}>
          {(['foryou', 'following'] as FeedKind[]).map((k) => (
            <button key={k} role="tab" aria-selected={kind === k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>
              {t(k === 'following' ? 'common.following' : 'home.forYou')}
            </button>
          ))}
        </div>
        <div className="feed">
          {error ? <Failed error={error} retry={load} /> : null}
          {ids === null && !error ? <Spinner /> : null}
          {ids && !ids.length ? (
            kind === 'following' ? (
              <Empty icon="image" title={t('home.welcome')} body={t('d.posts.welcomeBody')}>
                <div className="btn-row">
                  <button className="btn" onClick={() => setKind('foryou')}>
                    {t('d.posts.seeForYou')}
                  </button>
                  <button className="btn quiet" onClick={() => onCreate('post')}>
                    {t('home.sharePhoto')}
                  </button>
                </div>
              </Empty>
            ) : (
              <Empty icon="image" title={t('bibleMarks.emptyFilter')} body={t('d.posts.nobodyPosted')} />
            )
          ) : null}
          {(ids ?? []).map((id) => (
            <FeedPost key={id} id={id} onOpenPost={openPost} />
          ))}
          <div ref={sentinel} />
          {loadingMore ? <Spinner /> : null}
          {ids && ids.length && !more ? (
            <div className="caught-up">
              <Icon name="check" size={40} color="var(--accent)" stroke={1.5} />
              <b>{t('home.caughtUp')}</b>
              <span>{t('d.posts.seenAll')}</span>
            </div>
          ) : null}
        </div>
      </div>
      <Aside />
      {viewing !== null ? <StoryViewer groups={tray} start={viewing} onClose={() => { setViewing(null); loadTray(); }} onChanged={loadTray} /> : null}
    </div>
  );
}

/** The links under Suggested for you: the key of each one's words, and where it goes. */
const FOOT_LINKS: [string, string][] = [
  ['settings.about', '/legal/about'],
  ['d.posts.footHelp', '/help'],
  ['d.posts.footPrivacy', '/legal/privacy'],
  ['legal.termsLink', '/legal/terms'],
  ['legal.guidelines', '/legal/guidelines'],
  ['legal.childSafety', '/legal/child-safety'],
  ['d.posts.footCopyright', '/legal/copyright'],
  ['language.title', '/accounts/language'],
];

export function FootLinks() {
  return (
    <footer className="aside-foot">
      <nav aria-label={t('d.posts.aboutCommunity')}>
        {FOOT_LINKS.map(([label, to], i) => (
          <React.Fragment key={to}>
            {i ? ' · ' : ''}
            <Link to={to}>{t(label)}</Link>
          </React.Fragment>
        ))}
      </nav>
      <span>{t('d.posts.footCopyrightLine', { year: new Date().getFullYear() })}</span>
    </footer>
  );
}

function Aside() {
  const { me } = useMe();
  const [people, setPeople] = useState<SuggestedPerson[] | null>(null);
  const [switcher, setSwitcher] = useState(false);
  useEffect(() => {
    fetchSuggestedPeople(5).then(setPeople, () => setPeople([]));
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
        <button className="link-btn" onClick={() => setSwitcher(true)}>
          {t('d.posts.switch')}
        </button>
      </div>
      {people && people.length ? (
        <>
          <div className="aside-head">
            <span>{t('d.posts.suggestedForYou')}</span>
            <Link to="/explore/people" className="see-all">
              {t('ssPub.seeAll')}
            </Link>
          </div>
          {people.map((p) => (
            <Suggestion key={p.id} p={p} />
          ))}
        </>
      ) : null}
      <FootLinks />
      {switcher ? <AccountSwitcher onClose={() => setSwitcher(false)} /> : null}
    </aside>
  );
}

/** Why someone is suggested: who you know that follows them. */
export function reason(p: SuggestedPerson): string {
  if (p.follows_me) return t('profile.followsYou');
  if (p.mutual_names.length) return p.mutual_count > 1 ? t('d.posts.followedByMore', { name: p.mutual_names[0], count: p.mutual_count - 1 }) : t('d.posts.followedBy', { name: p.mutual_names[0] });
  return t('d.posts.suggestedForYou');
}

export function Suggestion({ p, big, onDismiss }: { p: SuggestedPerson; big?: boolean; onDismiss?: () => void }) {
  const { me } = useMe();
  const [on, setOn] = useState(false);
  return (
    <div className={'me-row suggestion' + (big ? ' big' : '')}>
      <Avatar src={p.avatar_url} name={p.username} size={big ? 52 : 44} onClick={() => nav('/u/' + p.username)} />
      <span className="row-text">
        <Link to={'/u/' + p.username} className="uname">
          {p.username}
          {p.verified ? <Verified size={12} /> : null}
        </Link>
        {big && p.full_name ? <span>{p.full_name}</span> : null}
        <span className="reason">{reason(p)}</span>
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
        {t(on ? 'common.following' : p.follows_me ? 'common.followBack' : 'common.follow')}
      </button>
      {onDismiss ? (
        <button className="icon-btn tiny" aria-label={t('d.posts.hideUser', { username: p.username })} onClick={onDismiss}>
          <Icon name="close" size={14} />
        </button>
      ) : null}
    </div>
  );
}

/* ---------- explore ---------- */

/** Posts Explore asks the server for at a time (see fetchExplore). */
const EXPLORE_PAGE = 30;
/** A Short opened from Explore carries on with more Shorts from everyone. */
const EXPLORE: GridSource = { from: 'explore' };

/**
 * Explore: everyone's photos and Shorts in Instagram's mosaic, more as you scroll. A photo opens the
 * post dialog, which steps through the mosaic; a Short opens the Shorts player at it. Sensitive posts
 * stay out when the member asked for less of them.
 */
export function Explore({ openPost }: { openPost: (id: string, list?: string[]) => void }) {
  const { me } = useMe();
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const cursor = useRef<string | undefined>(undefined);
  const done = useRef(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const taste = tasteOf(me);
  const key = tasteKey(taste);
  const tasteRef = useRef(taste);
  tasteRef.current = taste;
  const load = () => {
    setError(null);
    done.current = false;
    fetchExplore(undefined, EXPLORE_PAGE).then((page) => {
      // Paging follows what the server sent; the member's choices only change what is shown.
      cursor.current = page[page.length - 1]?.created_at;
      done.current = page.length < EXPLORE_PAGE;
      setPosts(tuneFeed(page, me.id, tasteRef.current, false));
    }, setError);
  };
  useEffect(load, [key]);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !posts) return;
    const io = new IntersectionObserver(async ([e]) => {
      if (!e.isIntersecting || done.current || loadingMore || !cursor.current) return;
      setLoadingMore(true);
      try {
        const page = await fetchExplore(cursor.current, EXPLORE_PAGE);
        cursor.current = page[page.length - 1]?.created_at ?? cursor.current;
        done.current = page.length < EXPLORE_PAGE;
        const shown = tuneFeed(page, me.id, tasteRef.current, false);
        setPosts((cur) => [...(cur ?? []), ...shown.filter((p) => !(cur ?? []).some((c) => c.id === p.id))]);
      } catch (err) {
        toastError(err);
      } finally {
        setLoadingMore(false);
      }
    }, { rootMargin: '800px' });
    io.observe(el);
    return () => io.disconnect();
  }, [posts, loadingMore]);
  const all = posts ?? [];
  const ids = gridIds(all, me);
  const open = (id: string) => openPost(id, ids);
  return (
    <div className="page explore">
      <SearchBox />
      {error ? <Failed error={error} retry={load} /> : null}
      {!posts && !error ? <Spinner /> : null}
      {posts && !posts.length ? <Empty icon="compass" title={t('d.posts.exploreEmpty')} body={t('d.posts.exploreEmptyBody')} /> : null}
      <div className="mosaic">
        {all.map((p, i) => {
          // In each block of five, one tall tile, alternating right and left.
          const block = Math.floor(i / 5);
          const pos = i % 5;
          const tall = (block % 2 === 0 && pos === 2) || (block % 2 === 1 && pos === 0);
          return <Tile key={p.id} post={p} onOpen={open} tall={tall} grid={all} source={EXPLORE} />;
        })}
      </div>
      <div ref={sentinel} />
      {loadingMore ? <Spinner /> : null}
    </div>
  );
}

/* ---------- search ---------- */

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

/** The search field above Explore: recent searches when empty, people as you type. Cmd/Ctrl+K jumps here. */
function SearchBox() {
  const [q, setQ] = useState('');
  const [focused, setFocused] = useState(false);
  const [results, setResults] = useState<Profile[] | null>(null);
  const [recent, setRecent] = useState<Profile[]>(readRecent);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const focus = () => input.current?.focus();
    window.addEventListener('community:search', focus);
    if (sessionStorage.getItem('community.focusSearch')) {
      sessionStorage.removeItem('community.focusSearch');
      setTimeout(focus, 0);
    }
    const out = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setFocused(false);
    document.addEventListener('mousedown', out);
    return () => {
      window.removeEventListener('community:search', focus);
      document.removeEventListener('mousedown', out);
    };
  }, []);
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
    setFocused(false);
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
            {p.followers_count ? ' • ' + t('d.posts.followers', { count: fmt(p.followers_count) }) : ''}
            {p.is_following ? ' • ' + t('common.following') : ''}
          </span>
        </span>
      </button>
      {removable ? (
        <button
          className="icon-btn"
          aria-label={t('createFlow.untag', { username: p.username })}
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
    <div className={'search-box' + (focused ? ' open' : '')} ref={box}>
      <label className="search-field">
        <Icon name="search" size={18} />
        <input ref={input} placeholder={t('common.search')} value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => setFocused(true)} aria-label={t('createFlow.searchPeople')} onKeyDown={(e) => e.key === 'Escape' && (setQ(''), input.current?.blur(), setFocused(false))} />
        {q ? (
          <button className="clear" aria-label={t('createFlow.clear')} onClick={() => setQ('')}>
            <Icon name="close" size={10} stroke={3} />
          </button>
        ) : null}
      </label>
      {focused ? (
        <div className="search-drop">
          {results === null ? (
            <>
              <div className="panel-sub">
                <b>{t('d.posts.recent')}</b>
                {recent.length ? (
                  <button className="link-btn" onClick={() => { setRecent([]); writeRecent([]); }}>
                    {t('d.posts.clearAll')}
                  </button>
                ) : null}
              </div>
              {recent.length ? recent.map((p) => row(p, true)) : <p className="muted-text center pad">{t('d.posts.noRecent')}</p>}
            </>
          ) : results.length ? (
            results.map((p) => row(p))
          ) : (
            <p className="muted-text center pad">{t('d.posts.noResults')}</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function PeopleToFollow() {
  const { me } = useMe();
  const [people, setPeople] = useState<SuggestedPerson[] | null>(null);
  useEffect(() => {
    fetchSuggestedPeople(30).then(setPeople, () => setPeople([]));
  }, []);
  return (
    <div className="page suggested-page">
      <h1 className="page-title">{t('d.posts.suggested')}</h1>
      {!people ? <Spinner /> : null}
      {people && !people.length ? <p className="muted-text">{t('d.posts.followingEveryone')}</p> : null}
      {(people ?? []).map((p) => (
        <Suggestion
          key={p.id}
          p={p}
          big
          onDismiss={() => {
            setPeople((cur) => (cur ?? []).filter((x) => x.id !== p.id));
            dismissSuggestion(me.id, p.id).catch(() => {});
          }}
        />
      ))}
    </div>
  );
}
