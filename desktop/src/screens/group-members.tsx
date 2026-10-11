// A community's members or a page's followers, from the iPhone app's group-members/[id].tsx. Everyone
// can see who is in it; the people who run it also see requests to join (approve or decline), and can
// make someone an admin, take that away, or remove them. The owner, and you yourself, have no menu:
// you leave from the group's own page.
import React, { useState } from 'react';
import { approveMember, fetchGroup, fetchGroupMembers, removeMember, setMemberRole } from 'shared/api';
import { fmt } from 'shared/theme';
import type { GroupMember } from 'shared/types';
import { t } from '../lib/i18n';
import { useMe } from '../lib/me';
import { Avatar, ChoiceMenu, Empty, Failed, Icon, Link, Spinner, ask, toast, toastError, useLoad } from '../ui/kit';
import { PersonRow, RoleTag, manages } from './group-parts';
import '../styles/community.css';

const nameOf = (m: GroupMember) => m.profile?.username ?? t('d.community.thisAccount');

export function GroupMembers({ id }: { id: string }) {
  const { me } = useMe();
  const appAdmin = !!me.admin_role;
  const data = useLoad(async () => {
    const g = await fetchGroup(id);
    const manage = !!g && manages(g, appAdmin);
    // Requests are only fetched for the people who run it; the database would refuse the rest anyway.
    const [people, waiting] = await Promise.all([fetchGroupMembers(id), manage ? fetchGroupMembers(id, 'pending') : Promise.resolve([] as GroupMember[])]);
    return { g, manage, people, waiting };
  }, [id, appAdmin]);
  const [q, setQ] = useState('');
  // The request being decided, so its buttons wait; the member whose menu is open.
  const [deciding, setDeciding] = useState('');
  const [target, setTarget] = useState<GroupMember | null>(null);

  if (data.loading && !data.data) return <Spinner />;
  if (data.error && !data.data) return <Failed error={data.error} retry={data.reload} />;
  const { g, manage, people, waiting } = data.data!;
  if (!g) return <Empty icon="users" title={t('d.community.groupGone')} />;

  const page = g.kind === 'page';
  const word = page ? t('liveSetup.followers') : t('d.community.members');
  const needle = q.trim().toLowerCase();
  const match = (m: GroupMember) => !needle || [m.profile?.username, m.profile?.full_name].some((s) => (s ?? '').toLowerCase().includes(needle));

  /** Runs a change, says so, and reloads so counts and roles are the database's, not a guess. */
  const run = (p: Promise<void>, said: string) =>
    p.then(
      () => {
        toast(said);
        data.reload();
      },
      toastError,
    );
  function decide(m: GroupMember, approve: boolean) {
    setDeciding(m.user_id);
    run(approve ? approveMember(id, m.user_id) : removeMember(id, m.user_id), approve ? t('d.community.isIn', { name: nameOf(m) }) : t('adminPub.declinedToast')).finally(() => setDeciding(''));
  }
  const toggleAdmin = (m: GroupMember) => run(setMemberRole(id, m.user_id, m.role === 'admin' ? 'member' : 'admin'), m.role === 'admin' ? t('d.community.noLongerAdmin', { name: nameOf(m) }) : t('d.community.nowAdmin', { name: nameOf(m) }));
  async function remove(m: GroupMember) {
    const ok = await ask(t('d.community.removeQuestion', { name: nameOf(m) }), page ? t('d.community.removeFollowerBody') : t('d.community.removeMemberBody'), t('noteNew.removePlace'));
    if (ok) run(removeMember(id, m.user_id), t('d.community.removed', { name: nameOf(m) }));
  }

  function row(m: GroupMember, isRequest: boolean) {
    const right = isRequest ? (
      <div className="cm-row-actions">
        <button className="btn small" disabled={deciding === m.user_id} onClick={() => decide(m, true)}>
          {t('adminPub.approve')}
        </button>
        <button className="btn small quiet" disabled={deciding === m.user_id} onClick={() => decide(m, false)}>
          {t('common.decline')}
        </button>
      </div>
    ) : (
      <div className="cm-row-actions">
        {m.role !== 'member' ? <RoleTag role={m.role} /> : null}
        {m.user_id === me.id ? <span className="cm-you">{t('support.you')}</span> : null}
        {manage && m.role !== 'owner' && m.user_id !== me.id ? (
          <button className="icon-btn" aria-label={t('d.community.optionsFor', { name: nameOf(m) })} onClick={() => setTarget(m)}>
            <Icon name="more" size={20} />
          </button>
        ) : null}
      </div>
    );
    // The account is gone or hidden, but the row still exists so the people who run it can clear it out.
    if (!m.profile) {
      return (
        <div key={m.status + m.user_id} className="cm-person">
          <Avatar name="?" size={44} />
          <div className="cm-person-text">
            <span className="cm-person-sub">{t('creatorSubs.accountUnavailable')}</span>
          </div>
          {right}
        </div>
      );
    }
    return <PersonRow key={m.status + m.user_id} p={m.profile} right={right} />;
  }

  const shownWaiting = waiting.filter(match);
  const shownPeople = people.filter(match);
  return (
    <div className="page narrow-page cm-members">
      <Link to={'/groups/' + id} className="cm-back">
        <Icon name="back" size={18} stroke={2} /> {g.name}
      </Link>
      <h1 className="page-title">{word}</h1>
      <div className="panel-search flat">
        <input placeholder={t('common.search')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={page ? t('d.community.searchFollowers') : t('d.community.searchMembers')} />
      </div>
      {waiting.length ? (
        <section className="cm-section" aria-label={t('adminPub.requests')}>
          <h3 className="cm-h">{t('d.community.requestsCount', { count: fmt(waiting.length) })}</h3>
          {shownWaiting.map((m) => row(m, true))}
        </section>
      ) : null}
      <section className="cm-section" aria-label={word}>
        <h3 className="cm-h">{t(page ? 'd.community.followersCount' : 'd.community.membersCount', { count: fmt(people.length) })}</h3>
        {!people.length ? <Empty icon="people" title={page ? t('d.community.noFollowers') : t('d.community.noMembers')} /> : null}
        {people.length && !shownPeople.length ? <p className="muted-text">{t('d.community.nobodyMatches')}</p> : null}
        {shownPeople.map((m) => row(m, false))}
      </section>

      {target ? (
        <ChoiceMenu
          onClose={() => setTarget(null)}
          items={[
            { label: target.role === 'admin' ? t('d.community.removeAdmin') : t('d.community.makeAdmin'), onClick: () => toggleAdmin(target) },
            { label: page ? t('d.community.removeFollower') : t('d.community.removeFromCommunity'), danger: true, onClick: () => remove(target) },
          ]}
        />
      ) : null}
    </div>
  );
}
