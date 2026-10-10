// A profile, laid out like Instagram on the web: picture, name and buttons, counts, bio,
// highlights, then the Posts, Reels, Saved and Reposts tabs.
import React, { useEffect, useState } from 'react';
import { fetchHighlight, fetchHighlights, fetchLives, fetchReposts, fetchSaved, fetchUserPosts, fetchUserStories, listPeople, recordProfileView, report, requestFollow, removeFollowRequest, setBlock, setCloseFriend, setFollow } from 'shared/api';
import { listen } from 'shared/store';
import { fmt } from 'shared/theme';
import type { Highlight, Post, Profile, StoryGroup } from 'shared/types';
import { profileByUsername } from '../lib/extra';
import { useMe } from '../lib/me';
import { nav } from '../lib/router';
import { Avatar, ChoiceMenu, Empty, Failed, Icon, type IconName, Link, Modal, Spinner, Verified, ask, toast, toastError, useLoad } from '../ui/kit';
import { Tile } from '../ui/post';
import { StoryViewer } from '../ui/stories';

type Tab = 'posts' | 'reels' | 'saved' | 'reposts';

export function ProfilePage({ username, tab, openPost, onCreate }: { username: string; tab: Tab; openPost: (id: string) => void; onCreate: (m: 'post' | 'story') => void }) {
  const { me } = useMe();
  const { data: person, error, loading, reload, set } = useLoad(() => profileByUsername(username), [username]);
  const [list, setList] = useState<'followers' | 'following' | null>(null);
  const [menu, setMenu] = useState<'more' | 'following' | null>(null);
  const [reporting, setReporting] = useState(false);
  const [stories, setStories] = useState<StoryGroup[] | null>(null);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [hl, setHl] = useState<StoryGroup[] | null>(null);

  useEffect(() => listen('profile', reload), []);
  useEffect(() => {
    if (!person) return;
    recordProfileView(me.id, person.id);
    fetchHighlights(person.id).then(setHighlights, () => setHighlights([]));
  }, [person?.id]);

  if (loading && !person) return <Spinner />;
  if (error) return <Failed error={error} retry={reload} />;
  if (!person) return <Empty icon="user" title="Sorry, this page isn't available." body="The link you followed may be broken, or the account may have been removed." />;

  const mine = person.id === me.id;
  const hidden = person.is_private && !person.is_following && !mine;
  const canSeeLists = !hidden;

  const follow = async (next: boolean) => {
    const before = person;
    set({ ...person, is_following: next, followers_count: person.followers_count + (next ? 1 : -1) });
    try {
      await setFollow(me.id, person.id, next);
    } catch (e) {
      set(before);
      toastError(e);
    }
  };
  const request = async () => {
    try {
      if (person.requested) await removeFollowRequest(me.id, person.id);
      else await requestFollow(me.id, person.id);
      set({ ...person, requested: !person.requested });
    } catch (e) {
      toastError(e);
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
      else openStory();
    } catch (e) {
      toastError(e);
    }
  };
  const openHighlight = async (h: Highlight) => {
    try {
      const got = await fetchHighlight(h.id);
      if (!got || !got.items.length) return toast('This highlight is empty.');
      setHl([
        {
          user_id: person.id, username: person.username, avatar_url: person.avatar_url, seen: true, close: false,
          stories: got.items.map((it) => ({ id: it.id, user_id: person.id, item: it.item, created_at: it.created_at, expires_at: it.created_at, username: person.username, full_name: person.full_name, avatar_url: person.avatar_url, seen: true, in_tray: false, view_count: 0, audience: 'everyone', story_replies: 'off', follows_viewer: false })),
        },
      ]);
    } catch (e) {
      toastError(e);
    }
  };

  const tabs: { id: Tab; label: string; icon: IconName }[] = [
    { id: 'posts', label: 'Posts', icon: 'grid' },
    { id: 'reels', label: 'Reels', icon: 'reels' },
    ...(mine ? [{ id: 'saved' as Tab, label: 'Saved', icon: 'bookmark' as IconName }] : []),
    { id: 'reposts', label: 'Reposts', icon: 'repost' },
  ];

  return (
    <div className="page profile">
      <header className="profile-head">
        <div className="profile-pic">
          <Avatar src={person.avatar_url} name={person.username} size={150} ring={person.is_live ? 'live' : person.has_story && !hidden ? (person.is_close_friend ? 'close' : 'new') : null} onClick={person.is_live && !mine ? openLive : person.has_story && !hidden ? openStory : mine ? () => nav('/accounts/edit') : undefined} label={person.is_live ? 'Watch live' : person.has_story ? 'View story' : 'Profile picture'} />
          {person.is_live ? <span className="live-badge big">LIVE</span> : null}
        </div>
        <section className="profile-info">
          <div className="profile-top">
            <h1>
              {person.username}
              {person.verified ? <Verified size={18} /> : null}
            </h1>
            {mine ? (
              <>
                <button className="btn quiet" onClick={() => nav('/accounts/edit')}>
                  Edit profile
                </button>
                <button className="btn quiet" onClick={() => nav('/archive')}>
                  View archive
                </button>
                {person.account_type === 'creator' ? (
                  <button className="btn quiet" onClick={() => nav('/dashboard')}>
                    Dashboard
                  </button>
                ) : null}
                <button className="icon-btn" aria-label="Settings" onClick={() => nav('/accounts/edit')}>
                  <Icon name="settings" size={24} />
                </button>
              </>
            ) : (
              <>
                {person.is_following ? (
                  <button className="btn quiet" onClick={() => setMenu('following')}>
                    Following <Icon name="down" size={14} />
                  </button>
                ) : person.is_private ? (
                  <button className={'btn' + (person.requested ? ' quiet' : '')} onClick={request}>
                    {person.requested ? 'Requested' : 'Follow'}
                  </button>
                ) : (
                  <button className="btn" onClick={() => follow(true)}>
                    {person.follows_me ? 'Follow back' : 'Follow'}
                  </button>
                )}
                <button className="btn quiet" onClick={() => nav('/direct/u/' + person.username)}>
                  Message
                </button>
                <button className="icon-btn" aria-label="Options" onClick={() => setMenu('more')}>
                  <Icon name="more" size={24} />
                </button>
              </>
            )}
          </div>
          <ul className="profile-stats">
            <li>
              <b>{fmt(person.posts_count)}</b> {person.posts_count === 1 ? 'post' : 'posts'}
            </li>
            <li>
              <button disabled={!canSeeLists} onClick={() => setList('followers')}>
                <b>{fmt(person.followers_count)}</b> {person.followers_count === 1 ? 'follower' : 'followers'}
              </button>
            </li>
            <li>
              <button disabled={!canSeeLists} onClick={() => setList('following')}>
                <b>{fmt(person.following_count)}</b> following
              </button>
            </li>
          </ul>
          <div className="profile-bio">
            {person.full_name ? <b>{person.full_name}</b> : null}
            {person.pronouns ? <span className="muted-text"> {person.pronouns}</span> : null}
            {person.category && person.account_type === 'creator' ? <div className="muted-text">{person.category}</div> : null}
            {person.church_name ? <div className="muted-text">⛪ {person.church_name}</div> : null}
            {person.bio ? <p>{person.bio}</p> : null}
            {person.website ? (
              <a className="profile-link" href={/^https?:\/\//.test(person.website) ? person.website : 'https://' + person.website} target="_blank" rel="noreferrer">
                <Icon name="link" size={14} /> {person.website.replace(/^https?:\/\//, '')}
              </a>
            ) : null}
            {person.follows_me && !mine ? <div className="muted-text small">Follows you</div> : null}
          </div>
        </section>
      </header>

      {(highlights.length || mine) && !hidden ? (
        <div className="highlights">
          {highlights.map((h) => (
            <button key={h.id} className="highlight" onClick={() => openHighlight(h)}>
              <span className="hl-ring">{h.cover_url ? <img src={h.cover_url} alt="" /> : <span className="hl-blank" />}</span>
              <span>{h.title}</span>
            </button>
          ))}
          {mine ? (
            <button className="highlight" onClick={() => onCreate('story')}>
              <span className="hl-ring new">
                <Icon name="plus" size={40} stroke={1} />
              </span>
              <span>New</span>
            </button>
          ) : null}
        </div>
      ) : null}

      {hidden ? (
        <div className="private-note">
          <Icon name="lock" size={44} stroke={1.3} />
          <h2>This account is private</h2>
          <p>Follow to see their photos and videos.</p>
        </div>
      ) : (
        <>
          <nav className="profile-tabs" role="tablist">
            {tabs.map((t) => (
              <Link key={t.id} to={'/u/' + person.username + (t.id === 'posts' ? '' : '/' + t.id)} className={'ptab' + (tab === t.id ? ' on' : '')}>
                <Icon name={t.icon} size={12} stroke={2.2} /> {t.label.toUpperCase()}
              </Link>
            ))}
          </nav>
          <ProfileGrid person={person} tab={tab} mine={mine} openPost={openPost} onCreate={onCreate} />
        </>
      )}

      {list ? <PeopleList person={person} which={list} onClose={() => setList(null)} /> : null}
      {menu === 'following' ? (
        <ChoiceMenu
          onClose={() => setMenu(null)}
          items={[
            {
              label: person.is_close_friend ? 'Remove from close friends' : 'Add to close friends',
              onClick: () =>
                setCloseFriend(me.id, person.id, !person.is_close_friend).then(() => {
                  set({ ...person, is_close_friend: !person.is_close_friend });
                  toast(person.is_close_friend ? 'Removed from close friends' : 'Added to close friends');
                }, toastError),
            },
            { label: 'Unfollow', danger: true, bold: true, onClick: () => follow(false) },
          ]}
        />
      ) : null}
      {menu === 'more' ? (
        <ChoiceMenu
          onClose={() => setMenu(null)}
          items={[
            {
              label: person.is_blocked ? 'Unblock' : 'Block',
              danger: true,
              bold: true,
              onClick: async () => {
                const next = !person.is_blocked;
                if (next && !(await ask('Block ' + person.username + '?', "They won't be able to find your profile, posts or stories, or message you. They won't be told you blocked them.", 'Block'))) return;
                try {
                  await setBlock(me.id, person.id, next);
                  toast(next ? person.username + ' blocked' : person.username + ' unblocked');
                  reload();
                } catch (e) {
                  toastError(e);
                }
              },
            },
            { label: 'Report', danger: true, bold: true, onClick: () => setReporting(true) },
            { label: 'Send message', onClick: () => nav('/direct/u/' + person.username) },
          ]}
        />
      ) : null}
      {reporting ? (
        <ChoiceMenu
          onClose={() => setReporting(false)}
          items={["It's posting content that shouldn't be on Community", "It's pretending to be someone else", 'It may be under the age of 13'].map((r) => ({
            label: r,
            onClick: () => report(me.id, { userId: person.id }, r).then(() => toast('Thanks for letting us know. An admin will review it.'), toastError),
          }))}
        />
      ) : null}
      {stories ? <StoryViewer groups={stories} start={0} onClose={() => setStories(null)} /> : null}
      {hl ? <StoryViewer groups={hl} start={0} onClose={() => setHl(null)} /> : null}
    </div>
  );
}

function ProfileGrid({ person, tab, mine, openPost, onCreate }: { person: Profile; tab: Tab; mine: boolean; openPost: (id: string) => void; onCreate: (m: 'post' | 'story') => void }) {
  const { me } = useMe();
  const { data, error, loading, reload } = useLoad<Post[]>(async () => {
    if (tab === 'saved') return fetchSaved(me.id);
    if (tab === 'reposts') return fetchReposts(person.id);
    const all = await fetchUserPosts(person.id);
    return tab === 'reels' ? all.filter((p) => p.kind === 'reel') : all;
  }, [person.id, tab]);
  useEffect(() => listen('profile', reload), [person.id, tab]);
  if (loading && !data) return <Spinner />;
  if (error) return <Failed error={error} retry={reload} />;
  if (!data?.length) {
    if (tab === 'saved') return <Empty icon="bookmark" title="Save" body="Save photos and videos that you want to see again. No one is notified, and only you can see what you've saved." />;
    if (tab === 'reposts') return <Empty icon="repost" title="No reposts yet" body={mine ? 'Posts you repost appear here.' : 'Posts ' + person.username + ' reposts appear here.'} />;
    if (tab === 'reels') return <Empty icon="reels" title={mine ? 'Share a reel' : 'No reels yet'} body={mine ? 'Videos you share appear here.' : undefined} />;
    return (
      <Empty icon="camera" title={mine ? 'Share photos' : 'No posts yet'} body={mine ? 'When you share photos, they will appear on your profile.' : undefined}>
        {mine ? (
          <button className="link-btn" onClick={() => onCreate('post')}>
            Share your first photo
          </button>
        ) : null}
      </Empty>
    );
  }
  return (
    <div className={'grid' + (tab === 'reels' ? ' reels-grid' : '')}>
      {data.map((p) => (
        <Tile key={p.id} post={p} onOpen={openPost} />
      ))}
    </div>
  );
}

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
