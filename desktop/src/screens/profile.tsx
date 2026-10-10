// A profile, laid out like Instagram's 2026 desktop profile: the large picture (story ring, LIVE, the
// Note bubble) beside the username, name, counts, category and bio; wide buttons under them; Discover
// people; highlights; then icon tabs (Posts, Shorts, Saved, Reposts, Tagged) over a grid of portrait
// tiles. With Community's own extras from the iPhone app: creator subscriptions, the bell, About this
// account, the fundraiser card, lives planned ahead and Plus profile styles.
import React, { useEffect, useState } from 'react';
import { acceptFollowRequest, allStoriesSeen, fetchLives, fetchUserStories, listPeople, recordProfileView, removeFollowRequest, report, requestFollow, setBlock, setCloseFriend, setFollow } from 'shared/api';
import { listen } from 'shared/store';
import { fmt } from 'shared/theme';
import type { Profile, StoryGroup } from 'shared/types';
import { useAuth } from '../lib/auth';
import { profileByUsername } from '../lib/extra';
import { useMe } from '../lib/me';
import { nav } from '../lib/router';
import { Avatar, ChoiceMenu, Empty, Failed, Icon, Link, Modal, Spinner, Verified, ask, toast, toastError, useLoad } from '../ui/kit';
import { DiscoverPeople } from '../ui/profile-discover';
import { Highlights } from '../ui/profile-highlights';
import { AboutAccount, AlertsBell, BioText, FundraiserCard, type PictureRing, ProfilePicture, UpcomingLives } from '../ui/profile-parts';
import { ProfileStyleDialog, useProfileLook } from '../ui/profile-style';
import { SubscribeDialog, subscribeTo } from '../ui/profile-subscribe';
import { StoryViewer } from '../ui/stories';
import { ProfileGrid, type ProfileTab, ProfileTabs } from './profile-grid';
import '../styles/profile.css';

type Tab = ProfileTab;

// Whether Discover people is open on your own profile. A plain variable, as on the iPhone: it lasts
// while the app is open, not after a restart.
let ownDiscoverOpen = true;
// Where the page was scrolled when a tab was picked, so the grid changes without jumping to the top.
let keepScroll: number | null = null;

/** Why a member can report an account. The English goes to the server, so admins read every report alike. */
const REPORT_REASONS = ['Spam', 'Pretending to be someone else', 'Harassment or hate', 'Copyright or trademark', 'Something else'];

type Props = { username: string; tab: Tab; openPost: (id: string) => void; onCreate: (m: 'post' | 'story' | 'short') => void };

/** Each account gets a fresh page (menus, dialogs and Discover people start shut); its tabs share one. */
export function ProfilePage(props: Props) {
  return <ProfileScreen key={props.username} {...props} />;
}

function ProfileScreen({ username, tab, openPost, onCreate }: Props) {
  const { me } = useMe();
  const auth = useAuth();
  const { data: person, error, loading, reload, set } = useLoad(() => profileByUsername(username), [username]);
  const [list, setList] = useState<'followers' | 'following' | null>(null);
  const [menu, setMenu] = useState<'gear' | 'more' | 'following' | 'report' | null>(null);
  const [dialog, setDialog] = useState<'about' | 'style' | 'subscription' | null>(null);
  const [stories, setStories] = useState<StoryGroup[] | null>(null);
  // Whether all their stories have been watched, and whether any is for close friends (a blue ring).
  const [storyState, setStoryState] = useState({ seen: false, close: false });
  const [othersDiscover, setOthersDiscover] = useState(false);
  const [ownDiscover, setOwnDiscover] = useState(ownDiscoverOpen);
  const [subscribing, setSubscribing] = useState(false);
  const look = useProfileLook(person?.profile_theme);

  useEffect(() => listen('profile', reload), []);
  useEffect(() => {
    if (!person) return;
    recordProfileView(me.id, person.id);
  }, [person?.id]);

  // Whether every story of theirs has been watched: the ring turns grey once it has.
  const hasStory = !!person?.has_story;
  useEffect(() => {
    if (!person || !hasStory) return;
    const check = () =>
      fetchUserStories(person.id, me.id).then(
        (groups) => setStoryState({ seen: allStoriesSeen(groups.flatMap((g) => g.stories), me.id), close: groups.some((g) => g.close) }),
        () => {},
      );
    check();
    return listen('stories', check);
  }, [person?.id, hasStory]);

  // Picking a tab keeps the page where it was.
  useEffect(() => {
    if (keepScroll === null) return;
    const y = keepScroll;
    keepScroll = null;
    requestAnimationFrame(() => window.scrollTo(0, y));
  }, [tab]);

  if (loading && !person) return <Spinner />;
  if (error) return <Failed error={error} retry={reload} />;
  if (!person) return <Empty icon="user" title="Sorry, this page isn't available." body="The link you followed may be broken, or the account may have been removed." />;

  const mine = person.id === me.id;
  // A private account I don't follow: the counts show, the photos don't. Under-14 accounts are always
  // private (the database keeps them so), so the same lock applies to them.
  const locked = !mine && person.is_private && !person.is_following;
  const blocked = !mine && person.is_blocked;
  const listsHidden = !mine && person.hide_connections;
  const showBell = !mine && person.is_following && !blocked;
  // Members under 14 only write to people they follow (the database refuses the rest).
  const canMessage = mine || !me.restricted || person.is_following;
  const showTick = person.verified && !(mine && person.tick_hidden);
  const discover = mine ? ownDiscover : othersDiscover && !blocked;

  /* ---------- actions ---------- */

  const follow = async () => {
    if (person.is_private) return request();
    const before = person;
    set({ ...person, is_following: true, followers_count: person.followers_count + 1 });
    // Like Instagram: following someone opens similar people to follow.
    setOthersDiscover(true);
    try {
      await setFollow(me.id, person.id, true);
    } catch (e) {
      set(before);
      toastError(e);
    }
  };
  const unfollow = async () => {
    if (person.is_private && !(await ask(`Unfollow ${person.username}?`, "If you change your mind, you'll have to request to follow them again.", 'Unfollow'))) return;
    const before = person;
    set({ ...person, is_following: false, alerts_on: false, followers_count: Math.max(0, person.followers_count - 1) });
    try {
      await setFollow(me.id, person.id, false);
    } catch (e) {
      set(before);
      toastError(e);
    }
  };
  const request = async () => {
    set({ ...person, requested: true });
    try {
      await requestFollow(me.id, person.id);
      toast(`Requested to follow ${person.username}`);
    } catch (e) {
      set({ ...person, requested: false });
      toastError(e);
    }
  };
  const withdraw = async () => {
    if (!(await ask('Withdraw your request?', `${person.username} will no longer see that you asked to follow them.`, 'Withdraw'))) return;
    set({ ...person, requested: false });
    try {
      await removeFollowRequest(me.id, person.id);
    } catch (e) {
      set({ ...person, requested: true });
      toastError(e);
    }
  };
  const answer = async (accept: boolean) => {
    set({ ...person, requests_me: false, follows_me: accept || person.follows_me });
    try {
      if (accept) await acceptFollowRequest(person.id);
      else await removeFollowRequest(person.id, me.id);
      toast(accept ? `${person.username} now follows you` : 'Request removed');
    } catch (e) {
      toastError(e);
      reload();
    }
  };
  const closeFriend = async () => {
    const next = !person.is_close_friend;
    try {
      await setCloseFriend(me.id, person.id, next);
      set({ ...person, is_close_friend: next });
      toast(next ? 'Added to close friends' : 'Removed from close friends');
    } catch (e) {
      toastError(e);
    }
  };
  const block = async () => {
    const next = !person.is_blocked;
    if (next && !(await ask(`Block ${person.username}?`, 'You will stop seeing their posts, stories and comments. They are not told.', 'Block'))) return;
    try {
      await setBlock(me.id, person.id, next);
      toast(next ? `Blocked ${person.username}` : `Unblocked ${person.username}`);
      reload();
    } catch (e) {
      toastError(e);
    }
  };
  const copyLink = async () => {
    const link = location.origin + location.pathname + '#/u/' + person.username;
    try {
      await navigator.clipboard.writeText(link);
      toast('Profile link copied');
    } catch {
      toast("The link couldn't be copied");
    }
  };
  const subscribe = async () => {
    if (subscribing) return;
    setSubscribing(true);
    try {
      if (await subscribeTo(person)) reload();
    } catch (e) {
      toastError(e);
    } finally {
      setSubscribing(false);
    }
  };
  const openStory = async () => {
    try {
      const g = await fetchUserStories(person.id, me.id);
      if (g.length) setStories(g);
    } catch (e) {
      toastError(e);
    }
  };
  const openLive = async () => {
    try {
      const live = (await fetchLives()).find((l) => l.user_id === person.id && !l.ended_at);
      if (live) nav('/live/' + live.id);
      else if (person.has_story) openStory();
    } catch (e) {
      toastError(e);
    }
  };
  const toggleDiscover = () => {
    if (mine) {
      ownDiscoverOpen = !ownDiscover;
      setOwnDiscover(ownDiscoverOpen);
    } else setOthersDiscover(!othersDiscover);
  };

  /* ---------- the picture ---------- */

  let ring: PictureRing = null;
  if (person.is_live && !blocked) ring = 'live';
  else if (person.has_story && !locked && !blocked) ring = storyState.seen ? 'seen' : storyState.close ? 'close' : 'story';
  const pictureAction = ring === 'live' ? openLive : ring ? openStory : mine ? () => nav('/accounts/edit') : undefined;
  const pictureLabel = ring === 'live' ? 'Watch live' : ring ? 'View story' : mine ? 'Change profile photo' : 'Profile photo';

  /* ---------- buttons ---------- */

  const discoverBtn = (
    <button className={'prof-btn square' + (discover ? ' lit' : '')} aria-label={discover ? 'Hide Discover people' : 'Discover people'} aria-pressed={discover} onClick={toggleDiscover} title="Discover people">
      <Icon name="request" size={20} />
    </button>
  );
  let actions: React.ReactNode;
  if (mine) {
    actions = (
      <>
        <button className={'prof-btn wide' + (look.theme.id ? ' primary' : '')} onClick={() => nav('/accounts/edit')}>
          Edit profile
        </button>
        <button className="prof-btn wide" onClick={() => nav('/archive')}>
          View archive
        </button>
        {discoverBtn}
      </>
    );
  } else if (blocked) {
    actions = (
      <button className="prof-btn wide" onClick={block}>
        Unblock
      </button>
    );
  } else {
    actions = (
      <>
        {person.is_following ? (
          <button className="prof-btn wide" onClick={() => setMenu('following')} aria-haspopup="dialog">
            Following <Icon name="down" size={14} stroke={2.4} />
          </button>
        ) : person.requested ? (
          <button className="prof-btn wide" onClick={withdraw}>
            Requested
          </button>
        ) : (
          <button className="prof-btn wide primary" onClick={follow}>
            {person.follows_me ? 'Follow back' : 'Follow'}
          </button>
        )}
        {canMessage ? (
          <button className="prof-btn wide" onClick={() => nav('/direct/u/' + person.username)}>
            Message
          </button>
        ) : null}
        {person.sub_price_pence || person.subscribed ? (
          person.subscribed ? (
            <button className="prof-btn wide" onClick={() => setDialog('subscription')} aria-haspopup="dialog">
              Subscribed <Icon name="down" size={14} stroke={2.4} />
            </button>
          ) : (
            <button className="prof-btn wide accent-text" onClick={subscribe} disabled={subscribing}>
              {subscribing ? 'Subscribing…' : 'Subscribe'}
            </button>
          )
        ) : null}
        {showBell ? <AlertsBell person={person} onChange={(on) => set({ ...person, alerts_on: on })} /> : null}
        {discoverBtn}
      </>
    );
  }

  const theme = look.theme;
  return (
    <div className={'prof' + (look.banded ? ' banded' : '') + (theme.id ? ' themed' : '')} style={look.vars}>
      <header className={'profile-head profile-top prof-head' + (look.banded ? ' prof-band' : '')}>
        <div className="prof-head-in">
          <div className="prof-head-row">
            <ProfilePicture person={person} mine={mine} ring={ring} onClick={pictureAction} label={pictureLabel} />
            <section className="profile-info prof-info">
              <div className="prof-name-row">
                <h1>
                  {person.username}
                  {showTick ? <Verified size={18} /> : null}
                </h1>
                {person.is_private ? (
                  <span className="prof-lock" title={mine && me.restricted ? 'Private account (under 14)' : 'Private account'} aria-label="Private account" role="img">
                    <Icon name="lock" size={16} stroke={2} />
                  </span>
                ) : null}
                <button className="icon-btn prof-gear" aria-label={mine ? 'Options' : 'More options'} onClick={() => setMenu(mine ? 'gear' : 'more')}>
                  <Icon name={mine ? 'settings' : 'more'} size={24} />
                </button>
              </div>
              {person.full_name || person.pronouns ? (
                <div className="prof-fullname">
                  {person.full_name}
                  {person.pronouns ? <span className="prof-muted"> {person.pronouns}</span> : null}
                </div>
              ) : null}
              <ul className="profile-stats prof-stats">
                <li>
                  <b>{fmt(person.posts_count)}</b> {person.posts_count === 1 ? 'post' : 'posts'}
                </li>
                <li>
                  {locked || listsHidden || blocked ? (
                    <span>
                      <b>{fmt(person.followers_count)}</b> {person.followers_count === 1 ? 'follower' : 'followers'}
                    </span>
                  ) : (
                    <button onClick={() => setList('followers')}>
                      <b>{fmt(person.followers_count)}</b> {person.followers_count === 1 ? 'follower' : 'followers'}
                    </button>
                  )}
                </li>
                <li>
                  {locked || listsHidden || blocked ? (
                    <span>
                      <b>{fmt(person.following_count)}</b> following
                    </span>
                  ) : (
                    <button onClick={() => setList('following')}>
                      <b>{fmt(person.following_count)}</b> following
                    </button>
                  )}
                </li>
              </ul>
              {person.plus || person.admin_role === 'admin' || (person.account_type === 'creator' && person.category) ? (
                <div className="prof-category">
                  {person.account_type === 'creator' && person.category ? <span>{person.category}</span> : null}
                  {person.plus ? (
                    <button className="prof-pill plus" onClick={() => (mine ? nav('/plus') : undefined)} disabled={!mine} title="Community Plus member">
                      <Icon name="crown" size={12} stroke={2.2} /> Plus
                    </button>
                  ) : null}
                  {/* The owner runs the app quietly: only appointed admins show a badge. */}
                  {person.admin_role === 'admin' ? (
                    <span className="prof-pill admin">
                      <Icon name="shield" size={12} stroke={2.2} /> Admin
                    </span>
                  ) : null}
                </div>
              ) : null}
              <div className="profile-bio prof-bio">
                {person.bio ? (
                  <p>
                    <BioText text={person.bio} />
                  </p>
                ) : null}
                {person.website ? (
                  <a className="prof-website" href={/^https?:\/\//.test(person.website) ? person.website : 'https://' + person.website} target="_blank" rel="noreferrer">
                    <Icon name="link" size={14} stroke={2} /> {person.website.replace(/^https?:\/\//, '')}
                  </a>
                ) : null}
                {person.church_name ? (
                  <Link to={person.church_id ? '/churches/' + person.church_id : '/churches'} className="prof-church">
                    <Icon name="church" size={14} stroke={2} /> {person.church_name}
                  </Link>
                ) : null}
                {!mine && person.follows_me ? <span className="prof-muted small">Follows you</span> : null}
                {mine && me.restricted ? <span className="prof-muted small">Accounts of members under 14 stay private.</span> : null}
              </div>
              {/* Who looked at your profile is a Plus perk: everyone else sees nothing here at all. */}
              {mine && person.plus ? (
                <Link to="/accounts/viewers" className="prof-views">
                  <Icon name="eye" size={15} stroke={2} /> {fmt(person.views_week)} profile {person.views_week === 1 ? 'view' : 'views'} this week · <b>See who</b>
                </Link>
              ) : null}
            </section>
          </div>

          {!mine && !blocked && person.requests_me ? (
            <div className="prof-request">
              <span className="grow">
                <b>{person.username}</b> wants to follow you
              </span>
              <button className="prof-btn small primary" onClick={() => answer(true)}>
                Confirm
              </button>
              <button className="prof-btn small" onClick={() => answer(false)}>
                Delete
              </button>
            </div>
          ) : null}

          <div className="profile-actions prof-actions">{actions}</div>

          {!blocked && !locked ? (
            <div className="prof-cards">
              {person.fundraiser_id ? <FundraiserCard id={person.fundraiser_id} /> : null}
              <UpcomingLives userId={person.id} mine={mine} />
            </div>
          ) : null}
        </div>
      </header>

      {discover ? <DiscoverPeople excludeId={mine ? undefined : person.id} onHide={toggleDiscover} /> : null}

      {blocked ? (
        <div className="prof-private">
          <span className="prof-private-ring">
            <Icon name="block" size={34} stroke={1.5} />
          </span>
          <h2>You blocked this account</h2>
          <p>Unblock them to see their posts.</p>
        </div>
      ) : locked ? (
        <div className="prof-private">
          <span className="prof-private-ring">
            <Icon name="lock" size={34} stroke={1.5} />
          </span>
          <h2>This account is private</h2>
          <p>Follow to see their photos and videos.</p>
          {person.requested ? (
            <button className="prof-btn small" onClick={withdraw}>
              Requested
            </button>
          ) : (
            <button className="prof-btn small primary" onClick={follow}>
              Follow
            </button>
          )}
        </div>
      ) : (
        <>
          <Highlights person={person} mine={mine} />
          <div
            onClickCapture={(e) => {
              if ((e.target as HTMLElement).closest('.prof-tab')) keepScroll = window.scrollY;
            }}
          >
            <ProfileTabs person={person} tab={tab === 'saved' && !mine ? 'posts' : tab} mine={mine} />
          </div>
          <ProfileGrid person={person} tab={tab === 'saved' && !mine ? 'posts' : tab} mine={mine} openPost={openPost} onCreate={onCreate} onSubscribe={subscribe} />
        </>
      )}

      {list ? <PeopleList person={person} which={list} onClose={() => setList(null)} /> : null}
      {menu === 'gear' ? (
        <ChoiceMenu
          onClose={() => setMenu(null)}
          items={[
            { label: 'Settings and privacy', onClick: () => nav('/accounts/edit') },
            { label: 'Profile style', onClick: () => setDialog('style') },
            { label: 'Archive', onClick: () => nav('/archive') },
            { label: 'Your activity', onClick: () => nav('/activity') },
            ...(person.account_type === 'creator' ? [{ label: 'Professional dashboard', onClick: () => nav('/dashboard') }] : []),
            { label: 'About this account', onClick: () => setDialog('about') },
            { label: 'Copy profile link', onClick: copyLink },
            { label: 'Log out', onClick: () => auth.signOut() },
          ]}
        />
      ) : null}
      {menu === 'more' ? (
        <ChoiceMenu
          onClose={() => setMenu(null)}
          items={[
            { label: person.is_blocked ? 'Unblock' : 'Block', danger: true, bold: true, onClick: block },
            { label: 'Report', danger: true, bold: true, onClick: () => setMenu('report') },
            ...(person.is_blocked ? [] : [{ label: person.is_close_friend ? 'Remove from close friends' : 'Add to close friends', onClick: closeFriend }]),
            { label: 'About this account', onClick: () => setDialog('about') },
            { label: 'Copy profile link', onClick: copyLink },
          ]}
        />
      ) : null}
      {menu === 'report' ? (
        <Modal title="Report" onClose={() => setMenu(null)} className="choices prof-report">
          <p className="prof-report-why">Why are you reporting this account?</p>
          {REPORT_REASONS.map((r) => (
            <button
              key={r}
              onClick={() => {
                setMenu(null);
                report(me.id, { userId: person.id }, r).then(() => toast('Thanks. We will review this account.'), toastError);
              }}
            >
              {r}
            </button>
          ))}
          <button onClick={() => setMenu(null)}>Cancel</button>
        </Modal>
      ) : null}
      {menu === 'following' ? (
        <Modal onClose={() => setMenu(null)} className="prof-fmenu">
          <div className="prof-fmenu-head">
            <Avatar src={person.avatar_url} name={person.username} size={56} />
            <b>{person.username}</b>
          </div>
          <button
            onClick={() => {
              setMenu(null);
              closeFriend();
            }}
          >
            <span className="grow">{person.is_close_friend ? 'Remove from close friends' : 'Add to close friends'}</span>
            <Icon name="star" size={20} fill={person.is_close_friend ? 'currentColor' : undefined} />
          </button>
          {person.sub_price_pence || person.subscribed ? (
            <button
              onClick={() => {
                setMenu(null);
                setDialog('subscription');
              }}
            >
              <span className="grow">{person.subscribed ? 'Your subscription' : 'Subscribe'}</span>
              <Icon name="crown" size={20} />
            </button>
          ) : null}
          <button
            className="danger"
            onClick={() => {
              setMenu(null);
              unfollow();
            }}
          >
            <span className="grow">Unfollow</span>
          </button>
        </Modal>
      ) : null}
      {dialog === 'about' ? <AboutAccount person={person} onClose={() => setDialog(null)} /> : null}
      {dialog === 'style' ? <ProfileStyleDialog onClose={() => setDialog(null)} /> : null}
      {dialog === 'subscription' ? <SubscribeDialog creator={person} onClose={() => setDialog(null)} onChanged={reload} /> : null}
      {stories ? <StoryViewer groups={stories} start={0} onClose={() => setStories(null)} /> : null}
    </div>
  );
}

/* ---------- followers and following ---------- */

function PeopleList({ person, which, onClose }: { person: Profile; which: 'followers' | 'following'; onClose: () => void }) {
  const { me } = useMe();
  const [people, setPeople] = useState<Profile[] | null>(null);
  const [q, setQ] = useState('');
  useEffect(() => {
    listPeople(person.id, which).then(setPeople, (e) => {
      toastError(e);
      setPeople([]);
    });
  }, []);
  const shown = (people ?? []).filter((p) => !q || p.username.includes(q.toLowerCase()) || p.full_name.toLowerCase().includes(q.toLowerCase()));
  return (
    <Modal title={which === 'followers' ? 'Followers' : 'Following'} onClose={onClose} className="people-modal">
      <div className="panel-search in-modal">
        <input placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
      </div>
      <div className="list-pad">
        {people === null ? <Spinner /> : null}
        {people && !shown.length ? <p className="muted-text center pad">{q ? 'No results.' : which === 'followers' ? 'No followers yet.' : 'Not following anyone yet.'}</p> : null}
        {shown.map((p) => (
          <div className="row" key={p.id}>
            <Avatar src={p.avatar_url} name={p.username} size={44} onClick={() => { onClose(); nav('/u/' + p.username); }} />
            <span className="row-text">
              <Link to={'/u/' + p.username} className="uname" onClick={onClose}>
                {p.username}
                {p.verified ? <Verified size={12} /> : null}
              </Link>
              <span>{p.full_name}</span>
            </span>
            {p.id !== me.id ? <FollowToggle p={p} /> : null}
          </div>
        ))}
      </div>
    </Modal>
  );
}

function FollowToggle({ p }: { p: Profile }) {
  const { me } = useMe();
  const [on, setOn] = useState(p.is_following);
  return (
    <button
      className={'btn small' + (on ? ' quiet' : '')}
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
  );
}
