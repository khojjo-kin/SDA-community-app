// A community or a page, from the iPhone app's group/[id].tsx: its cover and details, join / follow /
// ask to join (and leave), its members, "Create post" for those who may post in it, its posts as a
// grid or a feed, and for the people who run it: edit it, and for its owner: delete it.
import React, { useEffect, useRef, useState } from 'react';
import { canPostIn, deleteGroup, fetchGroup, fetchGroupPosts, joinGroup, leaveGroup, updateGroup, uploadImage } from 'shared/api';
import { listen } from 'shared/store';
import { errText, fmt } from 'shared/theme';
import type { Group, Post } from 'shared/types';
import { openCreate } from '../lib/create';
import { useMe } from '../lib/me';
import { nav } from '../lib/router';
import { ChoiceMenu, Empty, Failed, Icon, Link, Modal, Spinner, ask, toast, toastError, useLoad } from '../ui/kit';
import { FeedPost, Tile } from '../ui/post';
import { ChurchSelect, CoverPicker, GroupCover, type Picked, canSee, manages } from './group-parts';
import '../styles/community.css';

type View = 'grid' | 'feed';
const VIEW_KEY = 'community.groupView';

/** The last way posts were shown (grid or feed), remembered on this computer. */
function savedView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === 'feed' ? 'feed' : 'grid';
  } catch {
    return 'grid';
  }
}

export function GroupPage({ id, openPost }: { id: string; openPost: (id: string, list?: string[]) => void }) {
  const { me } = useMe();
  const appAdmin = !!me.admin_role;
  const g = useLoad(() => fetchGroup(id), [id]);
  const group = g.data;
  const visible = !!group && canSee(group, appAdmin);
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [postsError, setPostsError] = useState<unknown>(null);
  const [postsTick, setPostsTick] = useState(0);
  const [done, setDone] = useState(false);
  const [view, setView] = useState<View>(savedView);
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const loadingMore = useRef(false);
  const end = useRef<HTMLDivElement>(null);

  // A post made in Create, or joining and leaving anywhere, announce 'feed': show it here at once.
  useEffect(
    () =>
      listen('feed', () => {
        g.reload();
        setPostsTick((t) => t + 1);
      }),
    [],
  );

  // The first page of posts, once we know they may be seen.
  useEffect(() => {
    if (!group) return;
    if (!visible) {
      setPosts([]);
      return;
    }
    let alive = true;
    setPostsError(null);
    fetchGroupPosts(id).then(
      (list) => {
        if (!alive) return;
        setPosts(list);
        setDone(list.length === 0);
      },
      (e) => alive && setPostsError(e),
    );
    return () => {
      alive = false;
    };
  }, [id, group?.id, visible, postsTick]);

  // The next page, older than the last post shown, when the end of the list scrolls into view.
  useEffect(() => {
    const el = end.current;
    if (!el || !posts?.length || done) return;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting || loadingMore.current) return;
      const last = posts[posts.length - 1];
      loadingMore.current = true;
      fetchGroupPosts(id, last.created_at)
        .then((page) => {
          if (!page.length) setDone(true);
          else setPosts((cur) => {
            const seen = new Set((cur ?? []).map((p) => p.id));
            return [...(cur ?? []), ...page.filter((p) => !seen.has(p.id))];
          });
        }, toastError)
        .finally(() => (loadingMore.current = false));
    }, { rootMargin: '400px' });
    io.observe(el);
    return () => io.disconnect();
  }, [posts, done, view]);

  if (g.loading && !group) return <Spinner />;
  if (g.error && !group) return <Failed error={g.error} retry={g.reload} />;
  if (!group) return <Empty icon="users" title="This one isn't here any more" body="It may have been deleted by its owner." />;

  const page = group.kind === 'page';
  const standing = group.my_standing;
  const manager = manages(group, appAdmin);
  const owner = standing === 'owner' || appAdmin;
  const ids = (posts ?? []).map((p) => p.id);

  /** Join, follow, or ask to join: joinGroup decides from the group's privacy. */
  async function join() {
    if (!group || busy) return;
    const pending = group.privacy === 'private';
    setBusy(true);
    try {
      await joinGroup(me.id, group);
      // Flip the button at once; the reload that follows brings the database's counts.
      g.set({ ...group, my_standing: pending ? 'pending' : 'member', member_count: group.member_count + (pending ? 0 : 1) });
      toast(pending ? 'Request sent. An admin will let you in.' : page ? `Following ${group.name}` : `Welcome to ${group.name}`);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  }
  /** Leave, unfollow, or withdraw a request: all the same row in the database. */
  async function leave() {
    if (!group || busy) return;
    const pending = standing === 'pending';
    const body = pending ? '' : page ? 'Its posts stop showing in your feed.' : group.privacy === 'private' ? 'You would have to ask to join again.' : 'You can join again any time.';
    const title = pending ? 'Cancel your request?' : page ? `Unfollow ${group.name}?` : `Leave ${group.name}?`;
    if (!(await ask(title, body, pending ? 'Cancel request' : page ? 'Unfollow' : 'Leave'))) return;
    setBusy(true);
    try {
      await leaveGroup(me.id, group.id);
      g.set({ ...group, my_standing: null, member_count: Math.max(0, group.member_count - (pending ? 0 : 1)) });
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!group) return;
    if (!(await ask(`Delete ${group.name}?`, 'Its posts and members go with it. This cannot be undone.', 'Delete'))) return;
    try {
      await deleteGroup(group.id);
      toast('Deleted');
      nav('/groups', true);
    } catch (e) {
      toastError(e);
    }
  }
  const changeView = (v: View) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // Remembering is a convenience only.
    }
  };

  // The owner cannot leave: the group would have nobody in charge.
  const primary =
    standing === 'owner' ? (
      <span className="cm-owner">
        <Icon name="crown" size={16} stroke={2.2} /> Owner
      </span>
    ) : standing === 'pending' ? (
      <button className="btn quiet" disabled={busy} onClick={leave}>
        Requested
      </button>
    ) : standing ? (
      <button className="btn quiet" disabled={busy} onClick={leave}>
        {page ? 'Following' : 'Joined'}
      </button>
    ) : (
      <button className="btn" disabled={busy} onClick={join}>
        {page ? 'Follow' : group.privacy === 'private' ? 'Request to join' : 'Join'}
      </button>
    );

  let body: React.ReactNode;
  if (!visible) {
    body = (
      <div className="private-note">
        <Icon name="lock" size={40} stroke={1.3} />
        <h2>{page ? 'This page is private' : 'This community is private'}</h2>
        <p>{standing === 'pending' ? 'Your request is waiting for an admin.' : 'Ask to join to see what members share.'}</p>
      </div>
    );
  } else if (postsError && !posts) {
    body = <Failed error={postsError} retry={() => setPostsTick((t) => t + 1)} />;
  } else if (!posts) {
    body = <Spinner />;
  } else if (!posts.length) {
    body = <Empty icon="image" title="No posts yet" body={canPostIn(group) ? 'Be the first to post here.' : page ? 'Posts from this page will show up here.' : 'Posts from members will show up here.'} />;
  } else if (view === 'grid') {
    body = (
      <div className="grid cm-post-grid">
        {posts.map((p) => (
          <Tile key={p.id} post={p} onOpen={(pid) => openPost(pid, ids)} />
        ))}
      </div>
    );
  } else {
    body = (
      <div className="feed centered cm-post-feed">
        {posts.map((p) => (
          <FeedPost key={p.id} id={p.id} onOpenPost={(pid) => openPost(pid, ids)} />
        ))}
      </div>
    );
  }

  return (
    <div className="page cm-group">
      <GroupCover g={group} className="cm-hero" size={64} />
      <section className="cm-ghead">
        <div className="cm-ghead-main">
          <h1>{group.name}</h1>
          <p className="cm-handle">@{group.handle}</p>
          <p className="cm-meta">
            {group.privacy === 'private' ? <Icon name="lock" size={14} stroke={2.2} /> : null}
            {`${page ? 'Page' : 'Community'} · ${group.privacy === 'private' ? 'Private' : 'Public'} · ${fmt(group.member_count)} ${page ? 'follower' : 'member'}${group.member_count === 1 ? '' : 's'} · ${fmt(group.posts_count)} post${group.posts_count === 1 ? '' : 's'}`}
          </p>
          {group.church_name && group.church_id ? (
            <Link to={'/churches/' + group.church_id} className="cm-church-link">
              <Icon name="church" size={15} stroke={2} /> {group.church_name}
            </Link>
          ) : null}
          {group.description ? <p className="cm-desc">{group.description}</p> : null}
        </div>
        <div className="cm-ghead-actions">
          {primary}
          <button className="btn quiet" onClick={() => nav(`/groups/${group.id}/members`)}>
            {page ? 'Followers' : 'Members'}
            {manager && group.pending_count > 0 ? (
              <span className="cm-badge" title={`${group.pending_count} waiting to join`}>
                {fmt(group.pending_count)}
              </span>
            ) : null}
          </button>
          {canPostIn(group) ? (
            <button className="btn" onClick={() => openCreate({ mode: 'post', groupId: group.id })}>
              <Icon name="plus" size={16} stroke={2.2} /> Create post
            </button>
          ) : null}
          {manager ? (
            <button className="icon-btn" aria-label="More options" onClick={() => setMenu(true)}>
              <Icon name="more" size={24} />
            </button>
          ) : null}
        </div>
      </section>

      {visible && posts?.length ? (
        <div className="cm-tabs" role="tablist" aria-label="Show posts as">
          <button role="tab" aria-selected={view === 'grid'} className={view === 'grid' ? 'on' : ''} onClick={() => changeView('grid')}>
            <Icon name="grid" size={14} stroke={2} /> Grid
          </button>
          <button role="tab" aria-selected={view === 'feed'} className={view === 'feed' ? 'on' : ''} onClick={() => changeView('feed')}>
            <Icon name="menu" size={14} stroke={2} /> Feed
          </button>
        </div>
      ) : null}
      {body}
      <div ref={end} className="cm-end" />

      {menu ? (
        <ChoiceMenu
          onClose={() => setMenu(false)}
          items={[
            { label: page ? 'Edit page' : 'Edit community', onClick: () => setEditing(true) },
            ...(owner ? [{ label: page ? 'Delete page' : 'Delete community', danger: true, onClick: remove }] : []),
          ]}
        />
      ) : null}
      {editing ? (
        <GroupEdit
          group={group}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            g.reload();
            toast('Saved');
          }}
        />
      ) : null}
    </div>
  );
}

/** The people who run a group: its name, description, cover, privacy (communities only) and church. */
function GroupEdit({ group, onClose, onSaved }: { group: Group; onClose: () => void; onSaved: () => void }) {
  const { me } = useMe();
  const page = group.kind === 'page';
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description);
  const [priv, setPriv] = useState(group.privacy === 'private');
  const [churchId, setChurchId] = useState(group.church_id ?? '');
  const [cover, setCover] = useState<Picked | null>(null);
  const [coverUrl, setCoverUrl] = useState(group.cover_url);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (saving) return;
    const n = name.trim();
    if (n.length < 2 || n.length > 80) return setErr('Give it a name of 2 to 80 characters.');
    setSaving(true);
    setErr('');
    try {
      // The cover is uploaded only now, so a cancelled edit leaves nothing behind in storage.
      const cover_url = cover ? (await uploadImage(me.id, cover.uri, cover.width)).url : coverUrl;
      await updateGroup(group.id, { name: n, description: description.trim(), privacy: page ? 'public' : priv ? 'private' : 'public', church_id: churchId || null, cover_url });
      onSaved();
    } catch (e) {
      setErr(errText(e));
      setSaving(false);
    }
  }

  return (
    <Modal title={page ? 'Edit page' : 'Edit community'} onClose={onClose} wide className="cm-modal" closeOutside={!saving}>
      <form
        className="cm-modal-body cm-form"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <CoverPicker
          shown={cover?.uri ?? coverUrl}
          busy={saving}
          onPick={setCover}
          onRemove={() => {
            setCover(null);
            setCoverUrl('');
          }}
        />
        <label className="form-row">
          <span>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        </label>
        <label className="form-row">
          <span>Description</span>
          <textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is it for, and who is it for?" maxLength={500} />
          <em className="cm-count">{description.length}/500</em>
        </label>
        {page ? null : (
          <label className="cm-switch-row">
            <Icon name="lock" size={22} />
            <span className="cm-switch-text">
              <b>Private</b>
              <span>People ask to join, and an admin lets them in. Only members see what is posted.</span>
            </span>
            <input type="checkbox" role="switch" checked={priv} onChange={(e) => setPriv(e.target.checked)} aria-label="Private" />
            <i className="switch" aria-hidden="true" />
          </label>
        )}
        <ChurchSelect value={churchId} onChange={(cid) => setChurchId(cid)} disabled={saving} />
        {err ? <p className="form-error">{err}</p> : null}
        <button className="btn big block" type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </form>
    </Modal>
  );
}
