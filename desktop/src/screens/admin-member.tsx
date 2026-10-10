// One member's record when the database hasn't had the admin CRM update yet: the same controls as
// the iPhone console's admin-member screen (the tick, Plus, suspending, the admin note and, for the
// owner, making someone an admin), through the iPhone app's own functions. With the update, the
// fuller record in admin-crm.tsx (sign-ins, money, safety, timeline) is shown instead.
import React, { useEffect, useState } from 'react';
import { addAdmin, adminSetAccount, fetchMember, removeAdmin } from 'shared/api';
import { dayLabel } from 'shared/theme';
import { refreshAdminCounts } from '../lib/admin';
import { useMe } from '../lib/me';
import { nav } from '../lib/router';
import { Avatar, Empty, Failed, Icon, Spinner, Verified, ask, toast, toastError, useLoad } from '../ui/kit';

/** A switch row: a title and line of explanation on the left, the switch on the right. */
function Toggle({ title, sub, on, disabled, onChange }: { title: string; sub: string; on: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className={'adm-toggle' + (disabled ? ' off' : '')}>
      <span className="grow">
        <b>{title}</b>
        <em>{sub}</em>
      </span>
      <input type="checkbox" role="switch" checked={on} disabled={disabled} onChange={(e) => onChange(e.target.checked)} aria-label={title} />
      <i className="switch" aria-hidden="true" />
    </label>
  );
}

export function MemberBasic({ id }: { id: string }) {
  const { me } = useMe();
  const m = useLoad(() => fetchMember(id), [id]);
  const [note, setNote] = useState('');
  useEffect(() => setNote(m.data?.admin_note ?? ''), [m.data?.admin_note]);

  if (m.loading && !m.data) return <Spinner />;
  const back = (
    <button className="link-btn back-link" onClick={() => nav('/admin/people')}>
      <Icon name="back" size={16} /> People
    </button>
  );
  if (m.error) {
    return (
      <div className="admin-wide">
        {back}
        <Failed error={m.error} retry={m.reload} />
      </div>
    );
  }
  const x = m.data;
  if (!x) {
    return (
      <div className="admin-wide">
        {back}
        <Empty icon="user" title="This account isn't available" />
      </div>
    );
  }

  const owner = me.admin_role === 'owner';
  const self = id === me.id;
  const set = (patch: Parameters<typeof adminSetAccount>[1], done: string) =>
    adminSetAccount(id, patch).then(() => {
      toast(done);
      m.reload();
      refreshAdminCounts();
    }, toastError);

  function givePlus(months: number) {
    const from = x!.plus && x!.plus_until ? new Date(x!.plus_until) : new Date();
    from.setMonth(from.getMonth() + months);
    set({ plus_until: from.toISOString(), verified: true }, `Plus until ${dayLabel(from)}`);
  }

  async function suspend(next: boolean) {
    if (!next) return set({ suspended: false }, 'Suspension lifted');
    if (await ask(`Suspend @${x!.username}?`, 'They can still read, but cannot post, comment, share stories or send messages until an admin lifts it.', 'Suspend')) set({ suspended: true }, 'Account suspended');
  }

  async function admin(next: boolean) {
    if (next) {
      if (!(await ask(`Make @${x!.username} an admin?`, 'They get the admin tools: reports, members, the tick and Plus, churches and the hymnal. Only you can add or remove admins.', 'Make admin', false))) return;
      addAdmin(me.id, id).then(() => {
        toast('Now an admin');
        m.reload();
      }, toastError);
    } else {
      removeAdmin(id).then(() => {
        toast('No longer an admin');
        m.reload();
      }, toastError);
    }
  }

  return (
    <div className="admin-wide adm-member">
      {back}
      <p className="adm-member-note muted-text small">
        <Icon name="info" size={14} /> Sign-ins, locations, money and the timeline appear here once the admin database update is in. These controls work now.
      </p>
      <section className="person-head adm-member-head">
        <Avatar src={x.avatar_url} name={x.full_name || x.username} size={88} />
        <div className="grow">
          <h1>
            {x.full_name || x.username} {x.verified ? <Verified size={16} /> : null}
          </h1>
          <p className="muted-text">
            @{x.username}
            {x.church_name ? ' · ' + x.church_name : ''} · joined {dayLabel(new Date(x.created_at))} {new Date(x.created_at).getFullYear()} · {x.posts_count} post{x.posts_count === 1 ? '' : 's'}
            {x.reports_count ? ` · ${x.reports_count} report${x.reports_count === 1 ? '' : 's'}` : ''}
          </p>
          <span className="pills">
            {x.admin_role ? <span className="pill">{x.admin_role === 'owner' ? 'Owner' : 'Admin'}</span> : null}
            {x.plus ? <span className="pill plus">Plus</span> : null}
            {x.suspended ? <span className="pill danger">Suspended</span> : null}
          </span>
        </div>
        <button className="btn quiet small" onClick={() => nav('/u/' + x.username)}>
          Open profile
        </button>
      </section>

      <div className="grid-2">
        <section className="dash-card">
          <h3>Standing</h3>
          <Toggle title="Verified tick" sub="Shown next to their name everywhere" on={x.verified} onChange={(v) => set({ verified: v }, v ? 'Verified' : 'Tick removed')} />
          <div className="adm-plus-row">
            <span className="grow">
              <b>Community Plus</b>
              <em>{x.plus && x.plus_until ? 'Active until ' + dayLabel(new Date(x.plus_until)) : 'Not active'}</em>
            </span>
          </div>
          <div className="adm-actions">
            <button className="btn small" onClick={() => givePlus(1)}>
              {x.plus ? 'Add a month' : 'Give a month'}
            </button>
            <button className="btn quiet small" onClick={() => givePlus(12)}>
              Give a year
            </button>
            {x.plus ? (
              <button className="btn quiet small" onClick={() => set({ plus_until: null }, 'Plus ended')}>
                End Plus
              </button>
            ) : null}
          </div>
        </section>

        <section className="dash-card">
          <h3>Safety</h3>
          <Toggle title="Suspended" sub="Can read, but cannot post, comment, share stories or message" on={x.suspended} disabled={self} onChange={suspend} />
          <label className="form-row adm-note-field">
            <span>Admin note (only admins see this)</span>
            <textarea rows={3} maxLength={500} value={note} placeholder="Why this account was verified, suspended, or anything the next admin should know" onChange={(e) => setNote(e.target.value)} />
          </label>
          {note !== (x.admin_note ?? '') ? (
            <div className="adm-actions">
              <button className="btn small" onClick={() => set({ admin_note: note.trim() }, 'Note saved')}>
                Save note
              </button>
            </div>
          ) : null}
        </section>
      </div>

      {owner && !self ? (
        <section className="dash-card">
          <h3>Admin tools</h3>
          {x.admin_role === 'owner' ? (
            <p className="muted-text">App owner. Owners cannot be changed from the app.</p>
          ) : (
            <Toggle title="Admin" sub="Reports, members, the tick and Plus, churches, the hymnal" on={x.admin_role === 'admin'} onChange={admin} />
          )}
        </section>
      ) : null}
    </div>
  );
}
