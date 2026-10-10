// Communities and pages, from the iPhone app (app/(app)/groups.tsx and group/[id].tsx).
import React from 'react';
import { fetchGroup, fetchGroupPosts, fetchGroups, fetchMyGroups, joinGroup, leaveGroup } from 'shared/api';
import type { Group } from 'shared/types';
import { useMe } from '../lib/me';
import { Empty, Failed, Icon, Link, Spinner, ask, toast, toastError, useLoad } from '../ui/kit';
import { FeedPost } from '../ui/post';

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
