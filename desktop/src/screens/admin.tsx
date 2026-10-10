// The admin console, the same one the iPhone app has, laid out for a big screen. Only owners and
// admins can open it, and the database refuses everything here for anyone else.
import React, { useState } from 'react';
import { addAdmin, addTransaction, adminSetAccount, answerSupportTicket, closeSupportTicket, decidePlusRequest, decideReport, deleteTransaction, fetchAdminActivity, fetchAdminStats, fetchMembers, fetchPlusRequests, fetchReports, fetchSupportTickets, fetchTransactions, listAdmins, removeAdmin, searchProfiles } from 'shared/api';
import { ago, fmt } from 'shared/theme';
import type { MemberCard, Profile, SupportTicket } from 'shared/types';
import { useMe } from '../lib/me';
import { nav, parts } from '../lib/router';
import { Avatar, Empty, Failed, Icon, type IconName, Link, Modal, Spinner, Verified, ask, toast, toastError, useLoad } from '../ui/kit';

const TABS: { id: string; label: string; icon: IconName }[] = [
  { id: 'overview', label: 'Overview', icon: 'chart' },
  { id: 'reports', label: 'Reports', icon: 'flag' },
  { id: 'members', label: 'Members', icon: 'users' },
  { id: 'requests', label: 'Tick and Plus requests', icon: 'crown' },
  { id: 'support', label: 'Support', icon: 'lifebuoy' },
  { id: 'admins', label: 'Admins', icon: 'shield' },
  { id: 'money', label: 'Transactions', icon: 'receipt' },
];

const pounds = (pence: number) => '£' + (pence / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function Admin({ path }: { path: string }) {
  const { me } = useMe();
  const tab = parts(path)[1] || 'overview';
  if (!me.admin_role) return <Empty icon="shield" title="Admins only" body="The admin console is for Community's owner and admins." />;
  return (
    <div className="settings admin">
      <nav className="settings-nav">
        <h2>Admin</h2>
        {TABS.map((t) => (
          <Link key={t.id} to={'/admin/' + t.id} className={'settings-link' + (tab === t.id ? ' on' : '')}>
            <Icon name={t.icon} size={22} /> {t.label}
          </Link>
        ))}
      </nav>
      <div className="settings-body">
        {tab === 'overview' ? <Overview /> : tab === 'reports' ? <Reports /> : tab === 'members' ? <Members /> : tab === 'requests' ? <Requests /> : tab === 'support' ? <Support /> : tab === 'admins' ? <Admins /> : <Money />}
      </div>
    </div>
  );
}

function Overview() {
  const stats = useLoad(() => fetchAdminStats(), []);
  const activity = useLoad(() => fetchAdminActivity(60), []);
  const s = stats.data;
  const tile = (label: string, value: React.ReactNode, sub?: string, to?: string) => (
    <div className="tile-stat" key={label} onClick={to ? () => nav(to) : undefined} style={to ? { cursor: 'pointer' } : undefined}>
      <span>{label}</span>
      <b>{value}</b>
      {sub ? <em>{sub}</em> : null}
    </div>
  );
  return (
    <div className="admin-wide">
      <h1 className="page-title">Overview</h1>
      {stats.loading ? <Spinner /> : stats.error ? <Failed error={stats.error} retry={stats.reload} /> : s ? (
        <div className="stat-tiles">
          {tile('Members', fmt(s.members), `+${s.members_week} this week`, '/admin/members')}
          {tile('Posts', fmt(s.posts), `+${s.posts_week} this week`)}
          {tile('Messages this week', fmt(s.messages_week))}
          {tile('Stories live', fmt(s.stories_live))}
          {tile('Open reports', fmt(s.reports_open), undefined, '/admin/reports')}
          {tile('Requests waiting', fmt(s.requests_open), undefined, '/admin/requests')}
          {tile('Support open', fmt(s.support_open), undefined, '/admin/support')}
          {tile('Verified', fmt(s.verified), `${s.plus} with Plus`)}
          {tile('Income', pounds(s.income_pence), `${pounds(s.income_month_pence)} this month`, '/admin/money')}
          {tile('Suspended', fmt(s.suspended), `${s.deactivated} deactivated`)}
          {tile('Communities and pages', fmt(s.groups))}
          {tile('Churches', fmt(s.churches), `${s.hymns} hymns`)}
        </div>
      ) : null}
      <h3 className="section-h">Latest activity</h3>
      {activity.loading ? <Spinner /> : (activity.data ?? []).map((a, i) => (
        <div key={i} className="row flat">
          <span className="hymn-no small">
            <Icon name={a.kind === 'joined' ? 'user' : a.kind === 'report' ? 'flag' : a.kind === 'transaction' ? 'receipt' : a.kind === 'support' ? 'lifebuoy' : a.kind === 'live' ? 'live' : a.kind === 'group' ? 'people' : a.kind === 'plus_request' ? 'verified' : 'image'} size={18} />
          </span>
          <span className="row-text wrap">
            <b>{a.username ? '@' + a.username : 'Someone'}</b> <span>{a.kind.replace('_', ' ')}{a.detail ? ': ' + a.detail : ''}</span>
          </span>
          <span className="muted-text small">{ago(a.at)}</span>
        </div>
      ))}
    </div>
  );
}

function Reports() {
  const { me } = useMe();
  const [all, setAll] = useState(false);
  const list = useLoad(() => fetchReports(all ? 'all' : 'open'), [all]);
  const decide = (id: string, status: 'dismissed' | 'actioned') => decideReport(me.id, id, status).then(list.reload, toastError);
  return (
    <div className="admin-wide">
      <div className="dash-head">
        <h1 className="page-title">Reports</h1>
        <div className="seg">
          <button className={!all ? 'on' : ''} onClick={() => setAll(false)}>Open</button>
          <button className={all ? 'on' : ''} onClick={() => setAll(true)}>All</button>
        </div>
      </div>
      {list.loading ? <Spinner /> : list.error ? <Failed error={list.error} retry={list.reload} /> : !list.data?.length ? <Empty icon="flag" title="Nothing to review" body="Reports from members appear here." /> : null}
      {(list.data ?? []).map((r) => (
        <section key={r.id} className="dash-card report">
          {r.post_media ? <img className="report-thumb" src={r.post_media.type === 'video' ? r.post_media.poster || '' : r.post_media.url} alt="" /> : <Avatar src={r.reported_avatar_url} name={r.reported_username || '?'} size={56} />}
          <div className="grow">
            <b>{r.reason}</b>
            <p className="muted-text">
              {r.reported_post ? 'Post' : 'Account'} by{' '}
              <Link to={'/u/' + r.reported_username} className="link-btn">@{r.reported_username}</Link> · reported by @{r.reporter_username} · {ago(r.created_at)}
              {r.reported_post && !r.post_exists ? ' · post deleted' : ''}
            </p>
            {r.post_caption ? <p className="pre clamp2">{r.post_caption}</p> : null}
          </div>
          {r.status === 'open' ? (
            <div className="btn-col">
              {r.reported_post && r.post_exists ? (
                <button className="btn quiet small" onClick={() => nav('/p/' + r.reported_post)}>View post</button>
              ) : null}
              <button className="btn small" onClick={() => decide(r.id, 'actioned')}>Action taken</button>
              <button className="btn quiet small" onClick={() => decide(r.id, 'dismissed')}>Dismiss</button>
            </div>
          ) : (
            <span className="pill">{r.status === 'actioned' ? 'Actioned' : 'Dismissed'}</span>
          )}
        </section>
      ))}
    </div>
  );
}

function Members() {
  const [q, setQ] = useState('');
  const [needle, setNeedle] = useState('');
  const list = useLoad(() => fetchMembers(needle), [needle]);
  const [open, setOpen] = useState<MemberCard | null>(null);
  return (
    <div className="admin-wide">
      <h1 className="page-title">Members</h1>
      <form className="panel-search in-modal flat" onSubmit={(e) => { e.preventDefault(); setNeedle(q); }}>
        <input placeholder="Search by name or username, then press Return" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search members" />
      </form>
      {list.loading ? <Spinner /> : list.error ? <Failed error={list.error} retry={list.reload} /> : null}
      <table className="table">
        <thead>
          <tr>
            <th>Member</th>
            <th>Joined</th>
            <th>Posts</th>
            <th>Reports</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {(list.data ?? []).map((m) => (
            <tr key={m.id} onClick={() => setOpen(m)}>
              <td>
                <span className="cell-person">
                  <Avatar src={m.avatar_url} name={m.username} size={32} />
                  <span>
                    <b>
                      {m.username}
                      {m.verified ? <Verified size={12} /> : null}
                    </b>
                    <span className="muted-text">{m.full_name}</span>
                  </span>
                </span>
              </td>
              <td>{new Date(m.created_at).toLocaleDateString('en-GB')}</td>
              <td>{m.posts_count}</td>
              <td>{m.reports_count}</td>
              <td>
                {m.admin_role ? <span className="pill">{m.admin_role}</span> : null} {m.plus ? <span className="pill plus">Plus</span> : null} {m.suspended ? <span className="pill danger">Suspended</span> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {open ? <MemberDialog m={open} onClose={() => setOpen(null)} onChanged={list.reload} /> : null}
    </div>
  );
}

function MemberDialog({ m, onClose, onChanged }: { m: MemberCard; onClose: () => void; onChanged: () => void }) {
  const [note, setNote] = useState(m.admin_note);
  const set = async (patch: Parameters<typeof adminSetAccount>[1], label: string) => {
    try {
      await adminSetAccount(m.id, patch);
      toast(label);
      onChanged();
      onClose();
    } catch (e) {
      toastError(e);
    }
  };
  const month = () => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    return d.toISOString();
  };
  return (
    <Modal title={'@' + m.username} onClose={onClose} wide>
      <div className="form-pad">
        <div className="cell-person">
          <Avatar src={m.avatar_url} name={m.username} size={56} />
          <span>
            <b>{m.full_name}</b>
            <span className="muted-text">
              Joined {new Date(m.created_at).toLocaleDateString('en-GB')} · {m.posts_count} posts · {m.reports_count} reports{m.church_name ? ' · ' + m.church_name : ''}
            </span>
          </span>
        </div>
        <div className="btn-row left">
          <button className="btn quiet" onClick={() => nav('/u/' + m.username)}>Open profile</button>
          <button className="btn quiet" onClick={() => set({ verified: !m.verified }, m.verified ? 'Tick removed' : 'Tick given')}>{m.verified ? 'Remove tick' : 'Give the tick'}</button>
          <button className="btn quiet" onClick={() => set(m.plus ? { plus_until: null } : { plus_until: month(), verified: true }, m.plus ? 'Plus ended' : 'Plus given for a month')}>{m.plus ? 'End Plus' : 'Give Plus for a month'}</button>
          <button
            className={'btn ' + (m.suspended ? 'quiet' : 'danger-outline')}
            onClick={async () => {
              if (!m.suspended && !(await ask('Suspend @' + m.username + '?', 'They are logged out of the app and cannot use it until you lift the suspension.', 'Suspend'))) return;
              set({ suspended: !m.suspended }, m.suspended ? 'Suspension lifted' : 'Suspended');
            }}
          >
            {m.suspended ? 'Lift suspension' : 'Suspend'}
          </button>
        </div>
        <label className="form-row">
          <span>Admin note (only admins see this)</span>
          <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <button className="btn" disabled={note === m.admin_note} onClick={() => set({ admin_note: note }, 'Note saved')}>Save note</button>
      </div>
    </Modal>
  );
}

function Requests() {
  const { me } = useMe();
  const list = useLoad(() => fetchPlusRequests(), []);
  return (
    <div className="admin-wide">
      <h1 className="page-title">Tick and Plus requests</h1>
      {list.loading ? <Spinner /> : list.error ? <Failed error={list.error} retry={list.reload} /> : !list.data?.length ? <Empty icon="verified" title="No requests waiting" /> : null}
      {(list.data ?? []).map((r) => (
        <section key={r.id} className="dash-card report">
          <Avatar src={r.avatar_url} name={r.username || '?'} size={48} />
          <div className="grow">
            <b>
              @{r.username} · {r.kind === 'verify' ? 'Verified tick' : 'Community Plus'}
            </b>
            <p className="muted-text">
              {r.full_name} · {ago(r.created_at)}
            </p>
            {r.note ? <p className="pre">{r.note}</p> : null}
          </div>
          <div className="btn-col">
            <button className="btn small" onClick={() => decidePlusRequest(me.id, r, true).then(list.reload, toastError)}>Approve</button>
            <button className="btn quiet small" onClick={() => decidePlusRequest(me.id, r, false).then(list.reload, toastError)}>Decline</button>
          </div>
        </section>
      ))}
    </div>
  );
}

function Support() {
  const [all, setAll] = useState(false);
  const list = useLoad(() => fetchSupportTickets(all), [all]);
  const [open, setOpen] = useState<SupportTicket | null>(null);
  const [reply, setReply] = useState('');
  return (
    <div className="admin-wide">
      <div className="dash-head">
        <h1 className="page-title">Support</h1>
        <div className="seg">
          <button className={!all ? 'on' : ''} onClick={() => setAll(false)}>Open</button>
          <button className={all ? 'on' : ''} onClick={() => setAll(true)}>All</button>
        </div>
      </div>
      {list.loading ? <Spinner /> : !list.data?.length ? <Empty icon="lifebuoy" title="No open requests" /> : null}
      {(list.data ?? []).map((t) => (
        <section key={t.id} className="dash-card ticket" onClick={() => { setOpen(t); setReply(t.reply); }} style={{ cursor: 'pointer' }}>
          <div className="ticket-head">
            <b>{t.subject}</b>
            <span className={'pill status-' + t.status}>{t.status}</span>
          </div>
          <p className="muted-text">
            @{t.username} · {ago(t.created_at)}
          </p>
          <p className="pre clamp2">{t.body}</p>
        </section>
      ))}
      {open ? (
        <Modal title={open.subject} onClose={() => setOpen(null)} wide>
          <div className="form-pad">
            <p className="muted-text">From @{open.username}</p>
            <p className="pre">{open.body}</p>
            <label className="form-row">
              <span>Reply</span>
              <textarea rows={5} value={reply} onChange={(e) => setReply(e.target.value)} />
            </label>
            <div className="btn-row left">
              <button className="btn" disabled={!reply.trim()} onClick={() => answerSupportTicket(open.id, reply).then(() => { setOpen(null); list.reload(); toast('Reply sent'); }, toastError)}>Send reply</button>
              <button className="btn quiet" onClick={() => closeSupportTicket(open.id).then(() => { setOpen(null); list.reload(); }, toastError)}>Close request</button>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

function Admins() {
  const { me } = useMe();
  const list = useLoad(() => listAdmins(), []);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Profile[]>([]);
  const owner = me.admin_role === 'owner';
  return (
    <div className="admin-wide">
      <h1 className="page-title">Admins</h1>
      {list.loading ? <Spinner /> : null}
      {(list.data ?? []).map((a) => (
        <div key={a.user_id} className="row flat">
          <Avatar src={a.profile?.avatar_url} name={a.profile?.username || '?'} size={40} />
          <span className="row-text">
            <b>@{a.profile?.username}</b>
            <span>{a.role === 'owner' ? 'Owner' : 'Admin'}</span>
          </span>
          {owner && a.role === 'admin' ? (
            <button className="btn quiet small" onClick={() => removeAdmin(a.user_id).then(list.reload, toastError)}>Remove</button>
          ) : null}
        </div>
      ))}
      {owner ? (
        <>
          <h3 className="section-h">Appoint an admin</h3>
          <form
            className="panel-search in-modal flat"
            onSubmit={(e) => {
              e.preventDefault();
              searchProfiles(q).then(setFound, toastError);
            }}
          >
            <input placeholder="Search members, then press Return" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search members" />
          </form>
          {found.filter((p) => !(list.data ?? []).some((a) => a.user_id === p.id)).map((p) => (
            <div key={p.id} className="row flat">
              <Avatar src={p.avatar_url} name={p.username} size={40} />
              <span className="row-text">
                <b>@{p.username}</b>
                <span>{p.full_name}</span>
              </span>
              <button className="btn small" onClick={() => addAdmin(me.id, p.id).then(() => { list.reload(); setFound([]); toast('@' + p.username + ' is now an admin'); }, toastError)}>Make admin</button>
            </div>
          ))}
        </>
      ) : (
        <p className="muted-text">Only the owner can appoint or remove admins.</p>
      )}
    </div>
  );
}

function Money() {
  const { me } = useMe();
  const list = useLoad(() => fetchTransactions(), []);
  const [add, setAdd] = useState(false);
  const [form, setForm] = useState({ kind: 'donation' as 'plus' | 'donation' | 'refund' | 'other', amount: '', note: '' });
  const total = (list.data ?? []).filter((t) => t.status === 'succeeded').reduce((s, t) => s + (t.kind === 'refund' ? -t.amount_pence : t.amount_pence), 0);
  return (
    <div className="admin-wide">
      <div className="dash-head">
        <h1 className="page-title">Transactions</h1>
        <button className="btn" onClick={() => setAdd(true)}>Record a payment</button>
      </div>
      <p className="muted-text">Total of the lines below: {pounds(total)}</p>
      {list.loading ? <Spinner /> : null}
      <table className="table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Member</th>
            <th>Kind</th>
            <th>Amount</th>
            <th>How</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {(list.data ?? []).map((t) => (
            <tr key={t.id}>
              <td>{new Date(t.created_at).toLocaleDateString('en-GB')}</td>
              <td>{t.username ? '@' + t.username : '—'}</td>
              <td>{t.kind}</td>
              <td className="num">{(t.kind === 'refund' ? '−' : '') + pounds(t.amount_pence)}</td>
              <td>{t.provider === 'stripe' ? t.method || 'Card' : 'Recorded by @' + (t.created_by_username ?? 'admin')}</td>
              <td>
                {t.provider === 'manual' ? (
                  <button className="icon-btn" aria-label="Delete" onClick={async () => { if (await ask('Delete this line?', '', 'Delete')) deleteTransaction(t.id).then(list.reload, toastError); }}>
                    <Icon name="trash" size={16} />
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {add ? (
        <Modal title="Record a payment" onClose={() => setAdd(false)}>
          <div className="form-pad">
            <label className="form-row">
              <span>Kind</span>
              <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as any })}>
                <option value="donation">Donation</option>
                <option value="plus">Community Plus</option>
                <option value="refund">Refund</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label className="form-row">
              <span>Amount (£)</span>
              <input inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value.replace(/[^\d.]/g, '') })} />
            </label>
            <label className="form-row">
              <span>Note</span>
              <input value={form.note} maxLength={500} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </label>
            <button
              className="btn block"
              disabled={!(Number(form.amount) > 0)}
              onClick={() => addTransaction(me.id, { kind: form.kind, amount_pence: Math.round(Number(form.amount) * 100), note: form.note }).then(() => { setAdd(false); list.reload(); }, toastError)}
            >
              Save
            </button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
