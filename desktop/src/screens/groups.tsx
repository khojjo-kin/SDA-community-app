// Communities and pages, from the iPhone app (app/(app)/groups.tsx, group/[id].tsx, group-new.tsx and
// group-members/[id].tsx). A community is a group anyone can join and post in (private ones take
// requests); a page is run by its owner and admins, who are the only ones who post, and everyone else
// follows it.
//   /groups                the ones you are in, and the ones to discover
//   /groups/new            create a community or a page
//   /groups/<id>           a community or page and its posts
//   /groups/<id>/members   its members, and requests to join for the people who run it
import React, { useEffect, useState } from 'react';
import { fetchGroups, fetchMyGroups, joinGroup } from 'shared/api';
import { listen } from 'shared/store';
import { fmt } from 'shared/theme';
import type { Group } from 'shared/types';
import type { CreateRequest } from '../lib/create';
import { useMe } from '../lib/me';
import { nav, parts } from '../lib/router';
import { Empty, Failed, Icon, Link, Spinner, toast, toastError, useLoad } from '../ui/kit';
import { GroupMembers } from './group-members';
import { GroupNew } from './group-new';
import { GroupPage } from './group-page';
import { GroupCover, groupSub } from './group-parts';
import '../styles/community.css';

export function Groups({ id, path, openPost }: { id?: string; path?: string; openPost: (id: string, list?: string[]) => void; onCreate?: (r: CreateRequest) => void }) {
  // "Create post" goes through openCreate (lib/create.ts), which main.tsx hands to the same Create
  // dialog as onCreate; the app-wide request also lets other parts of the app see it.
  if (!id) return <GroupsHome />;
  if (id === 'new') return <GroupNew />;
  if (parts(path ?? '')[2] === 'members') return <GroupMembers key={id} id={id} />;
  return <GroupPage key={id} id={id} openPost={openPost} />;
}

/** What the button on a group you are not in says. A ghost button opens the group, where Leave lives behind a confirm. */
function pillOf(g: Group): { label: string; ghost: boolean } {
  if (!g.my_standing) return { label: g.kind === 'page' ? 'Follow' : g.privacy === 'private' ? 'Request to join' : 'Join', ghost: false };
  if (g.my_standing === 'pending') return { label: 'Requested', ghost: true };
  return { label: g.kind === 'page' ? 'Following' : 'Joined', ghost: true };
}

function GroupCard({ g, action }: { g: Group; action?: React.ReactNode }) {
  const runs = g.my_standing === 'owner' || g.my_standing === 'admin';
  return (
    <div className="group-card cm-card">
      <Link to={'/groups/' + g.id} className="cm-card-link" title={g.name}>
        <GroupCover g={g} className="group-cover" />
        <span className="cm-card-name">
          <b>{g.name}</b>
          {g.privacy === 'private' ? (
            <span className="cm-card-mark" title="Private">
              <Icon name="lock" size={13} stroke={2.2} />
            </span>
          ) : null}
          {g.my_standing === 'owner' ? (
            <span className="cm-card-mark accent" title="You own it">
              <Icon name="crown" size={15} stroke={2.2} />
            </span>
          ) : g.my_standing === 'admin' ? (
            <span className="cm-tag small">Admin</span>
          ) : null}
        </span>
        <span className="muted-text">
          {groupSub(g)}
          {runs && g.pending_count > 0 ? <em className="cm-waiting">{` · ${fmt(g.pending_count)} waiting`}</em> : null}
        </span>
      </Link>
      {action}
    </div>
  );
}

function GroupsHome() {
  const { me } = useMe();
  const [q, setQ] = useState('');
  const [needle, setNeedle] = useState('');
  const [kind, setKind] = useState<'all' | 'community' | 'page'>('all');
  // Discover searches a moment after the last key.
  useEffect(() => {
    const t = setTimeout(() => setNeedle(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);
  const mine = useLoad(() => fetchMyGroups(me.id), [me.id]);
  const found = useLoad(() => fetchGroups(needle), [needle]);
  // Joining, leaving, creating and deleting announce 'feed': show the change wherever it was made.
  useEffect(
    () =>
      listen('feed', () => {
        mine.reload();
        found.reload();
      }),
    [],
  );

  /** Join or follow straight from the list. The card flips at once and flips back if the request fails. */
  async function join(g: Group) {
    const pending = g.privacy === 'private';
    const patch = (p: Partial<Group>) => found.set((found.data ?? []).map((x) => (x.id === g.id ? { ...x, ...p } : x)));
    patch({ my_standing: pending ? 'pending' : 'member', member_count: g.member_count + (pending ? 0 : 1) });
    try {
      await joinGroup(me.id, g);
      toast(pending ? 'Request sent' : g.kind === 'page' ? `Following ${g.name}` : `Joined ${g.name}`);
    } catch (e) {
      patch({ my_standing: g.my_standing, member_count: g.member_count });
      toastError(e);
    }
  }

  const lower = needle.toLowerCase();
  const yours = (mine.data ?? []).filter((g) => !lower || g.name.toLowerCase().includes(lower) || g.handle.includes(lower));
  const inMine = new Set((mine.data ?? []).map((g) => g.id));
  const discover = (found.data ?? []).filter((g) => !inMine.has(g.id));
  const card = (g: Group) => {
    const pill = pillOf(g);
    return (
      <GroupCard
        key={g.id}
        g={g}
        action={
          <button className={'btn small block' + (pill.ghost ? ' quiet' : '')} onClick={() => (pill.ghost ? nav('/groups/' + g.id) : join(g))}>
            {pill.label}
          </button>
        }
      />
    );
  };
  const shown = discover.filter((g) => kind === 'all' || g.kind === kind);

  return (
    <div className="page cm-groups">
      <div className="cm-head">
        <h1 className="page-title">Communities and pages</h1>
        <button className="btn" onClick={() => nav('/groups/new')}>
          <Icon name="plus" size={18} stroke={2.2} /> Create
        </button>
      </div>
      <div className="panel-search flat cm-search">
        <input placeholder="Name or @handle" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search communities and pages" />
      </div>

      <h3 className="section-h">Yours</h3>
      {mine.loading && !mine.data ? <Spinner /> : mine.error && !mine.data ? <Failed error={mine.error} retry={mine.reload} /> : null}
      {mine.data && !yours.length ? <p className="muted-text cm-none">{needle ? 'None of yours match.' : "You're not in any yet. Join one below, or create your own."}</p> : null}
      <div className="group-grid cm-grid-cards">{yours.map((g) => <GroupCard key={g.id} g={g} />)}</div>

      <div className="cm-section-head">
        <h3 className="section-h">Discover</h3>
        <div className="cm-chips" role="group" aria-label="Show">
          {(['all', 'community', 'page'] as const).map((k) => (
            <button key={k} className={'filter-chip' + (kind === k ? ' on' : '')} aria-pressed={kind === k} onClick={() => setKind(k)}>
              {k === 'all' ? 'All' : k === 'community' ? 'Communities' : 'Pages'}
            </button>
          ))}
        </div>
      </div>
      {found.loading && !found.data ? <Spinner /> : found.error && !found.data ? <Failed error={found.error} retry={found.reload} /> : null}
      {found.data && !shown.length ? (
        needle && yours.length ? (
          <p className="muted-text cm-none">Nothing else matches.</p>
        ) : needle ? (
          <Empty icon="search" title="Nothing matches" body="Try another name or @handle." />
        ) : kind !== 'all' ? (
          <p className="muted-text cm-none">{kind === 'page' ? 'No pages to discover yet.' : 'No communities to discover yet.'}</p>
        ) : (
          <Empty icon="users" title="Nothing here yet" body="Start a community for your ministry or club, or a page for your church.">
            <button className="btn" onClick={() => nav('/groups/new')}>
              Create
            </button>
          </Empty>
        )
      ) : null}
      <div className="group-grid cm-grid-cards">{shown.map(card)}</div>
    </div>
  );
}
