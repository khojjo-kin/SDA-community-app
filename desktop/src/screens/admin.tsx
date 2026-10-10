// The admin console: a full CRM for running Community, laid out for a big screen. Only owners and
// admins can open it, and the database refuses everything here for anyone else.
import React, { useState } from 'react';
import { addAdmin, addTransaction, answerSupportTicket, closeSupportTicket, decidePlusRequest, decideReport, deleteTransaction, fetchPlusRequests, fetchReports, fetchSupportTickets, fetchTransactions, listAdmins, removeAdmin, searchProfiles } from 'shared/api';
import { ago } from 'shared/theme';
import type { Profile, SupportTicket } from 'shared/types';
import { useMe } from '../lib/me';
import { nav, parts } from '../lib/router';
import { Avatar, Empty, Failed, Icon, type IconName, Link, Modal, Spinner, ask, toast, toastError, useLoad } from '../ui/kit';
import { downloadCsv } from '../lib/admin';
import { ActivityPage, Announcements, AuditLog, Churches, Content, Dashboard, MoneyHub, People, Person, SearchAll, Security, SystemPage } from './admin-crm';

type Tab = { id: string; label: string; icon: IconName };
const GROUPS: { title: string; tabs: Tab[] }[] = [
  { title: 'Overview', tabs: [
    { id: 'dashboard', label: 'Dashboard', icon: 'chart' },
    { id: 'activity', label: 'Live activity', icon: 'pulse' },
    { id: 'search', label: 'Search everything', icon: 'search' },
  ] },
  { title: 'People', tabs: [
    { id: 'people', label: 'People', icon: 'users' },
    { id: 'requests', label: 'Tick and Plus requests', icon: 'crown' },
    { id: 'support', label: 'Support', icon: 'lifebuoy' },
  ] },
  { title: 'Safety', tabs: [
    { id: 'security', label: 'Security', icon: 'shield' },
    { id: 'reports', label: 'Reports', icon: 'flag' },
    { id: 'content', label: 'Content', icon: 'image' },
    { id: 'audit', label: 'Audit log', icon: 'gavel' },
  ] },
  { title: 'Money', tabs: [{ id: 'money', label: 'Money', icon: 'receipt' }] },
  { title: 'Community', tabs: [
    { id: 'churches', label: 'Churches', icon: 'church' },
    { id: 'announcements', label: 'Announcements', icon: 'bell' },
    { id: 'admins', label: 'Admins', icon: 'key' },
    { id: 'system', label: 'System', icon: 'settings' },
  ] },
];

const pounds = (pence: number) => '£' + (pence / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function Admin({ path }: { path: string }) {
  const { me } = useMe();
  const bits = parts(path);
  let tab = bits[1] || 'dashboard';
  if (tab === 'overview') tab = 'dashboard';
  if (tab === 'members') tab = 'people';
  if (!me.admin_role) return <Empty icon="shield" title="Admins only" body="The admin console is for Community's owner and admins." />;
  const body = (() => {
    if (tab === 'people' && bits[2]) return <Person id={bits[2]} />;
    switch (tab) {
      case 'dashboard': return <Dashboard />;
      case 'activity': return <ActivityPage />;
      case 'search': return <SearchAll />;
      case 'people': return <People />;
      case 'requests': return <Requests />;
      case 'support': return <Support />;
      case 'security': return <Security />;
      case 'reports': return <Reports />;
      case 'content': return <Content />;
      case 'audit': return <AuditLog />;
      case 'money': return <MoneyHub Transactions={Money} />;
      case 'churches': return <Churches />;
      case 'announcements': return <Announcements />;
      case 'admins': return <Admins />;
      case 'system': return <SystemPage />;
      default: return <Dashboard />;
    }
  })();
  return (
    <div className="settings admin">
      <nav className="settings-nav admin-nav">
        <h2>Admin console</h2>
        {GROUPS.map((g) => (
          <div key={g.title} className="nav-group">
            <span className="nav-group-title">{g.title}</span>
            {g.tabs.map((t) => (
              <Link key={t.id} to={'/admin/' + t.id} className={'settings-link' + (tab === t.id ? ' on' : '')}>
                <Icon name={t.icon} size={20} /> {t.label}
              </Link>
            ))}
          </div>
        ))}
      </nav>
      <div className="settings-body">{body}</div>
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
              <Link to={r.reported_user ? '/admin/people/' + r.reported_user : '/u/' + r.reported_username} className="link-btn">@{r.reported_username}</Link> · reported by @{r.reporter_username} · {ago(r.created_at)}
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
    <div>
      <div className="dash-head">
        <h3>Transactions</h3>
        <div className="head-tools">
          <button className="btn quiet small" disabled={!list.data?.length} onClick={() => downloadCsv('transactions.csv', list.data ?? [])}>Export CSV</button>
          <button className="btn small" onClick={() => setAdd(true)}>Record a payment</button>
        </div>
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
              <td>{t.username && t.user_id ? <Link to={'/admin/people/' + t.user_id} className="link-btn">@{t.username}</Link> : '—'}</td>
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
