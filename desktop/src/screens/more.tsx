// Settings (edit profile, privacy, blocked accounts), Your activity, and the church features from
// the iPhone app: the Hymnal, Churches, and Communities and pages.
import React, { useEffect, useMemo, useState } from 'react';
import { deactivateAccount, fetchChurchMembers, fetchChurches, fetchGroup, fetchGroupPosts, fetchGroups, fetchHymn, fetchHymns, fetchLiked, fetchMyComments, fetchMyGroups, joinGroup, leaveGroup, listBlocked, setBlock, updateProfile, uploadImage } from 'shared/api';
import { getPostNow } from 'shared/store';
import { ago } from 'shared/theme';
import type { Church, Comment, Group, Hymn, Post, Profile } from 'shared/types';
import { useAuth } from '../lib/auth';
import { useMe } from '../lib/me';
import { nav, parts } from '../lib/router';
import { rememberSize } from '../shims/expo-file-system';
import { Avatar, Empty, Failed, Icon, Link, Spinner, ask, toast, toastError, useLoad } from '../ui/kit';
import { FeedPost, Tile } from '../ui/post';
import { CloseFriends, CreatorTools, ProfileViewers, SavedReplies } from './account';
import { HYMN_COUNT, loadFavourites, loadHymnalSettings, saveHymnalSettings, toggleFavourite } from 'shared/hymnal';

/* ---------- settings ---------- */

const SECTIONS = [
  { id: 'edit', label: 'Edit profile', icon: 'user' },
  { id: 'professional', label: 'Creator tools', icon: 'chart' },
  { id: 'replies', label: 'Saved replies', icon: 'reply' },
  { id: 'privacy', label: 'Account privacy', icon: 'lock' },
  { id: 'close-friends', label: 'Close friends', icon: 'star' },
  { id: 'blocked', label: 'Blocked', icon: 'block' },
  { id: 'viewers', label: 'Profile viewers', icon: 'eye' },
  { id: 'account', label: 'Account', icon: 'account' },
] as const;

export function Settings({ path }: { path: string }) {
  const section = (parts(path)[1] === 'edit' ? 'edit' : parts(path)[1]) || 'edit';
  return (
    <div className="settings">
      <nav className="settings-nav">
        <h2>Settings</h2>
        {SECTIONS.map((s) => (
          <Link key={s.id} to={'/accounts/' + s.id} className={'settings-link' + (section === s.id ? ' on' : '')}>
            <Icon name={s.icon} size={22} /> {s.label}
          </Link>
        ))}
      </nav>
      <div className="settings-body">
        {section === 'edit' ? <EditProfile /> : section === 'professional' ? <CreatorTools /> : section === 'replies' ? <SavedReplies /> : section === 'privacy' ? <Privacy /> : section === 'close-friends' ? <CloseFriends /> : section === 'blocked' ? <Blocked /> : section === 'viewers' ? <ProfileViewers /> : <AccountSection />}
      </div>
    </div>
  );
}

function EditProfile() {
  const { me, refresh } = useMe();
  const [form, setForm] = useState({ full_name: me.full_name, username: me.username, website: me.website, bio: me.bio, pronouns: me.pronouns, gender: me.gender });
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const field = (k: keyof typeof form) => ({ value: form[k] ?? '', onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: k === 'username' ? e.target.value.toLowerCase().replace(/\s/g, '') : e.target.value }) });
  const usernameOk = /^[a-z0-9_]{3,30}$/.test(form.username);
  const changed = JSON.stringify(form) !== JSON.stringify({ full_name: me.full_name, username: me.username, website: me.website, bio: me.bio, pronouns: me.pronouns, gender: me.gender });
  return (
    <div className="settings-card">
      <h1>Edit profile</h1>
      <div className="photo-row">
        <Avatar src={me.avatar_url} name={me.username} size={56} />
        <span className="row-text">
          <b>{me.username}</b>
          <span>{me.full_name}</span>
        </span>
        <label className={'btn' + (photoBusy ? ' disabled' : '')}>
          {photoBusy ? 'Uploading…' : 'Change photo'}
          <input
            type="file"
            accept="image/*"
            hidden
            disabled={photoBusy}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              const url = URL.createObjectURL(f);
              rememberSize(url, f.size);
              setPhotoBusy(true);
              try {
                const img = new Image();
                img.src = url;
                await img.decode();
                const m = await uploadImage(me.id, url, img.naturalWidth, 480);
                await updateProfile(me.id, { avatar_url: m.url });
                await refresh();
                toast('Profile photo updated');
              } catch (err) {
                toastError(err);
              } finally {
                setPhotoBusy(false);
              }
            }}
          />
        </label>
        {me.avatar_url ? (
          <button className="link-btn danger" onClick={() => updateProfile(me.id, { avatar_url: '' }).then(refresh, toastError)}>
            Remove
          </button>
        ) : null}
      </div>
      <label className="form-row">
        <span>Name</span>
        <input {...field('full_name')} maxLength={80} />
      </label>
      <label className="form-row">
        <span>Username</span>
        <input {...field('username')} maxLength={30} />
        {!usernameOk ? <em className="field-error">Usernames use 3 to 30 lowercase letters, numbers or underscores.</em> : null}
      </label>
      <label className="form-row">
        <span>Website</span>
        <input {...field('website')} maxLength={200} placeholder="Website" />
      </label>
      <label className="form-row">
        <span>Bio</span>
        <textarea {...field('bio')} maxLength={150} rows={3} />
        <em className="count">{(form.bio ?? '').length} / 150</em>
      </label>
      <label className="form-row">
        <span>Pronouns</span>
        <input {...field('pronouns')} maxLength={30} />
      </label>
      <div className="form-actions">
        <button
          className="btn wide"
          disabled={!changed || !usernameOk || busy}
          onClick={async () => {
            setBusy(true);
            try {
              await updateProfile(me.id, { ...form, full_name: form.full_name.trim(), bio: form.bio.trim(), website: form.website.trim() });
              await refresh();
              toast('Profile saved.');
            } catch (e) {
              toastError(e);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? 'Saving…' : 'Submit'}
        </button>
      </div>
    </div>
  );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} className={'switch' + (on ? ' on' : '')} onClick={() => onChange(!on)}>
      <i />
    </button>
  );
}

function Privacy() {
  const { me, refresh } = useMe();
  const flip = (patch: Partial<Profile>) => updateProfile(me.id, patch as any).then(refresh, toastError);
  return (
    <div className="settings-card">
      <h1>Account privacy</h1>
      <div className="setting">
        <div>
          <b>Private account</b>
          <p>When your account is public, anyone on Community can see your profile and posts. When it's private, only followers you approve can see what you share.</p>
        </div>
        <Toggle label="Private account" on={me.is_private} onChange={(v) => flip({ is_private: v })} />
      </div>
      <div className="setting">
        <div>
          <b>Show view counts</b>
          <p>Others see how many people viewed your posts and reels.</p>
        </div>
        <Toggle label="Show view counts" on={me.show_view_counts} onChange={(v) => flip({ show_view_counts: v })} />
      </div>
      <div className="setting">
        <div>
          <b>Story replies</b>
          <p>Who can reply to your stories.</p>
        </div>
        <select value={me.story_replies} onChange={(e) => flip({ story_replies: e.target.value as any })} aria-label="Story replies">
          <option value="everyone">Everyone</option>
          <option value="following">People you follow</option>
          <option value="off">Off</option>
        </select>
      </div>
    </div>
  );
}

function Blocked() {
  const { me } = useMe();
  const { data, error, loading, reload } = useLoad(() => listBlocked(me.id), []);
  return (
    <div className="settings-card">
      <h1>Blocked accounts</h1>
      <p className="muted-text">They can't find your profile, posts or stories on Community, and you won't see theirs.</p>
      {loading ? <Spinner /> : error ? <Failed error={error} retry={reload} /> : !data?.length ? <p className="muted-text pad">You haven't blocked anyone.</p> : null}
      {(data ?? []).map((p) => (
        <div className="row" key={p.id}>
          <Avatar src={p.avatar_url} name={p.username} size={44} />
          <span className="row-text">
            <b>{p.username}</b>
            <span>{p.full_name}</span>
          </span>
          <button className="btn small quiet" onClick={() => setBlock(me.id, p.id, false).then(reload, toastError)}>
            Unblock
          </button>
        </div>
      ))}
    </div>
  );
}

function AccountSection() {
  const { me } = useMe();
  const auth = useAuth();
  return (
    <div className="settings-card">
      <h1>Account</h1>
      {!auth.demo ? (
        <div className="setting">
          <div>
            <b>Email, password and security</b>
            <p>Change your email address or password, and see where you're logged in.</p>
          </div>
          <button className="btn quiet" data-testid="clerk-account" onClick={auth.openAccount}>
            Open
          </button>
        </div>
      ) : null}
      <div className="setting">
        <div>
          <b>Log out</b>
          <p>Log out of Community on this computer.</p>
        </div>
        <button className="btn quiet" onClick={() => auth.signOut()}>
          Log out
        </button>
      </div>
      <div className="setting">
        <div>
          <b>Deactivate account</b>
          <p>Your profile, posts and messages are hidden straight away. Log in within 30 days to bring everything back; after that it is deleted for good.</p>
        </div>
        <button
          className="btn danger-outline"
          onClick={async () => {
            if (!(await ask('Deactivate your account?', 'Log in again within 30 days to restore it. After that it is deleted permanently.', 'Deactivate'))) return;
            try {
              await deactivateAccount(me.id);
              await auth.signOut();
            } catch (e) {
              toastError(e);
            }
          }}
        >
          Deactivate
        </button>
      </div>
    </div>
  );
}

/* ---------- your activity ---------- */

export function Activity({ openPost }: { openPost: (id: string) => void }) {
  const { me } = useMe();
  const [tab, setTab] = useState<'likes' | 'comments'>('likes');
  const likes = useLoad<Post[]>(() => fetchLiked(me.id), []);
  const comments = useLoad<Comment[]>(() => fetchMyComments(me.id), []);
  return (
    <div className="page narrow-page">
      <h1 className="page-title">Your activity</h1>
      <div className="seg left">
        <button className={tab === 'likes' ? 'on' : ''} onClick={() => setTab('likes')}>
          Likes
        </button>
        <button className={tab === 'comments' ? 'on' : ''} onClick={() => setTab('comments')}>
          Comments
        </button>
      </div>
      {tab === 'likes' ? (
        likes.loading ? <Spinner /> : likes.error ? <Failed error={likes.error} retry={likes.reload} /> : likes.data?.length ? (
          <div className="grid">{likes.data.map((p) => <Tile key={p.id} post={p} onOpen={openPost} />)}</div>
        ) : (
          <Empty icon="heart" title="No likes yet" body="Posts you like appear here." />
        )
      ) : comments.loading ? <Spinner /> : comments.error ? <Failed error={comments.error} retry={comments.reload} /> : comments.data?.length ? (
        comments.data.map((c) => {
          const p = getPostNow(c.post_id);
          const cover = p?.media[0]?.type === 'video' ? p.media[0].poster : p?.media[0]?.url;
          return (
            <button key={c.id} className="row hover full" onClick={() => openPost(c.post_id)}>
              <span className="row-text wrap">
                <b>{c.text}</b>
                <span>
                  On {p ? p.username + "'s post" : 'a post'} · {ago(c.created_at)}
                </span>
              </span>
              {cover ? <img className="row-thumb" src={cover} alt="" /> : null}
            </button>
          );
        })
      ) : (
        <Empty icon="comment" title="No comments yet" body="Comments you write appear here." />
      )}
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
