// The admin console: a full CRM for running Community, laid out for a big screen. Only owners and
// admins can open it, and the database refuses everything here for anyone else. The sections the
// iPhone console has (requests with ID photos, publishers, support chats, feedback, churches,
// offensive words, ads and fundraisers) use the iPhone app's own functions; the CRM sections
// (dashboard charts, people, security, money, audit, system) are in admin-crm.tsx.
import React, { useEffect, useRef, useState } from 'react';
import { addAdmin, addTransaction, adminSetAccount, decideReport, deletePost, deleteTransaction, fetchAdminStats, fetchMembers, fetchReports, fetchTransactions, listAdmins, removeAdmin, searchProfiles } from 'shared/api';
import { agoLong } from 'shared/theme';
import type { MemberCard, Profile, ReportCard, Transaction } from 'shared/types';
import { useMe } from '../lib/me';
import { nav, parts } from '../lib/router';
import { Avatar, Empty, Failed, Icon, type IconName, Link, Modal, Spinner, ask, toast, toastError, useLoad } from '../ui/kit';
import { type AdminCounts, downloadCsv, pounds, refreshAdminCounts, useAdminCounts } from '../lib/admin';
import { ActivityPage, Announcements, AuditLog, Content, Dashboard, MoneyHub, People, Person, SearchAll, Security, SystemPage } from './admin-crm';
import { AdsAndFundraisers } from './admin-ads';
import { Churches } from './admin-churches';
import { Publishers, Requests } from './admin-requests';
import { Feedback, Support } from './admin-support';
import { Words } from './admin-words';
import '../styles/admin.css';

type Tab = { id: string; label: string; icon: IconName; badge?: (c: AdminCounts) => number; to?: string };
const GROUPS: { title: string; tabs: Tab[] }[] = [
  { title: 'Overview', tabs: [
    { id: 'dashboard', label: 'Dashboard', icon: 'chart' },
    { id: 'activity', label: 'Live activity', icon: 'pulse' },
    { id: 'search', label: 'Search everything', icon: 'search' },
  ] },
  { title: 'People', tabs: [
    { id: 'people', label: 'People', icon: 'users' },
    { id: 'requests', label: 'Tick and Plus requests', icon: 'crown', badge: (c) => c.verifications + c.plus },
    { id: 'publishers', label: 'Publishers', icon: 'lesson', badge: (c) => c.publishers },
    { id: 'support', label: 'Support', icon: 'lifebuoy', badge: (c) => c.chats + c.tickets },
    { id: 'feedback', label: 'Feedback and reviews', icon: 'star' },
  ] },
  { title: 'Safety', tabs: [
    { id: 'security', label: 'Security', icon: 'shield' },
    { id: 'reports', label: 'Reports', icon: 'flag', badge: (c) => c.reports },
    { id: 'content', label: 'Content', icon: 'image' },
    { id: 'words', label: 'Offensive words', icon: 'block' },
    { id: 'audit', label: 'Audit log', icon: 'gavel' },
  ] },
  { title: 'Money', tabs: [
    { id: 'money', label: 'Money', icon: 'receipt' },
    { id: 'ads', label: 'Ads and fundraisers', icon: 'boost' },
  ] },
  { title: 'Community', tabs: [
    { id: 'churches', label: 'Churches', icon: 'church', badge: (c) => c.churches },
    { id: 'announcements', label: 'Announcements', icon: 'bell' },
    { id: 'admins', label: 'Admins', icon: 'key' },
    { id: 'system', label: 'System', icon: 'settings' },
  ] },
  // The app's own pages that admins look after, as in the iPhone console's sidebar.
  { title: 'In the app', tabs: [
    { id: 'hymnal', label: 'Hymnal', icon: 'hymnal', to: '/hymnal' },
    { id: 'pod', label: 'Pod', icon: 'headphones', to: '/pod' },
    { id: 'groups', label: 'Communities and pages', icon: 'people', to: '/groups' },
  ] },
];

/** Old addresses and the iPhone console's names for sections. */
const ALIASES: Record<string, string> = { overview: 'dashboard', members: 'people', transactions: 'money', 'offensive-words': 'words' };

export function Admin({ path }: { path: string }) {
  const { me } = useMe();
  const counts = useAdminCounts(!!me.admin_role);
  const bits = parts(path);
  const tab = ALIASES[bits[1] ?? ''] ?? (bits[1] || 'dashboard');
  // The open section stays in view in the navigation, which scrolls on its own.
  const navBox = useRef<HTMLElement>(null);
  useEffect(() => {
    const on = navBox.current?.querySelector<HTMLElement>('.settings-link.on');
    const box = on?.getBoundingClientRect();
    if (on && box && (box.top < 0 || box.bottom > innerHeight)) on.scrollIntoView({ block: 'center' });
  }, [tab]);
  if (!me.admin_role) return <Empty icon="shield" title="Admins only" body="The admin console is for Community's owner and admins." />;
  const body = (() => {
    if (tab === 'people' && bits[2]) return <Person id={bits[2]} />;
    switch (tab) {
      case 'dashboard': return <Dashboard />;
      case 'activity': return <ActivityPage />;
      case 'search': return <SearchAll />;
      case 'people': return <People />;
      case 'requests': return <Requests kind={bits[2] === 'plus' ? 'plus' : 'verify'} />;
      case 'publishers': return <Publishers />;
      case 'support': return <Support path={path} />;
      case 'feedback': return <Feedback />;
      case 'security': return <Security />;
      case 'reports': return <Reports />;
      case 'content': return <Content />;
      case 'words': return <Words />;
      case 'audit': return <AuditLog />;
      case 'money': return <MoneyHub Transactions={Money} />;
      case 'ads': return <AdsAndFundraisers />;
      case 'churches': return <Churches />;
      case 'announcements': return <Announcements />;
      case 'admins': return <Admins />;
      case 'system': return <SystemPage />;
      default: return <Dashboard />;
    }
  })();
  return (
    <div className="settings admin">
      <nav className="settings-nav admin-nav" ref={navBox}>
        <h2>Admin console</h2>
        {GROUPS.map((g) => (
          <div key={g.title} className="nav-group">
            <span className="nav-group-title">{g.title}</span>
            {g.tabs.map((t) => {
              const n = t.badge?.(counts) ?? 0;
              return (
                <Link key={t.id} to={t.to ?? '/admin/' + t.id} className={'settings-link adm-nav-link' + (tab === t.id ? ' on' : '')} title={t.label}>
                  <Icon name={t.icon} size={20} /> <span className="adm-nav-label">{t.label}</span>
                  {n ? (
                    <span className="adm-nav-badge" aria-label={n + ' waiting'}>
                      {n > 99 ? '99+' : n}
                    </span>
                  ) : t.to ? (
                    <Icon name="right" size={14} className="adm-nav-out" />
                  ) : null}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="settings-body">{body}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ reports */

function Reports() {
  const { me } = useMe();
  const [all, setAll] = useState(false);
  const list = useLoad(() => fetchReports(all ? 'all' : 'open'), [all]);
  const done = (text: string) => () => {
    toast(text);
    list.reload();
    refreshAdminCounts();
  };
  const decide = (id: string, status: 'dismissed' | 'actioned') => decideReport(me.id, id, status).then(done(status === 'actioned' ? 'Marked as handled' : 'Report dismissed'), toastError);

  async function removePost(r: ReportCard) {
    if (!r.reported_post) return;
    if (!(await ask('Remove this post?', 'It disappears for everyone. The report is marked as actioned.', 'Remove'))) return;
    try {
      await deletePost(r.reported_post);
      await decideReport(me.id, r.id, 'actioned');
      done('Post removed')();
    } catch (e) {
      toastError(e);
    }
  }

  async function suspend(r: ReportCard) {
    const who = r.reported_user ?? r.reported_post_owner;
    if (!who) return;
    if (!(await ask(`Suspend ${r.reported_username ? '@' + r.reported_username : 'this account'}?`, 'They can still read, but cannot post, comment, share stories or send messages until an admin lifts it.', 'Suspend'))) return;
    try {
      await adminSetAccount(who, { suspended: true });
      await decideReport(me.id, r.id, 'actioned');
      done('Account suspended')();
    } catch (e) {
      toastError(e);
    }
  }

  return (
    <div className="admin-wide">
      <div className="dash-head">
        <h1 className="page-title">Reports</h1>
        <div className="seg">
          <button className={!all ? 'on' : ''} onClick={() => setAll(false)}>Open</button>
          <button className={all ? 'on' : ''} onClick={() => setAll(true)}>All</button>
        </div>
      </div>
      {list.loading ? <Spinner /> : list.error ? <Failed error={list.error} retry={list.reload} /> : !list.data?.length ? <Empty icon="flag" title={all ? 'No reports yet' : 'Nothing to review'} body={all ? 'Reports from members appear here.' : 'Every report has been looked at.'} /> : null}
      {(list.data ?? []).map((r) => {
        const who = r.reported_user ?? r.reported_post_owner;
        return (
          <section key={r.id} className="dash-card report">
            {r.post_media ? <img className="report-thumb" src={r.post_media.type === 'video' ? r.post_media.poster || '' : r.post_media.url} alt="" /> : <Avatar src={r.reported_avatar_url} name={r.reported_username || '?'} size={56} />}
            <div className="grow">
              <b>{r.reason}</b>
              <p className="muted-text">
                {r.reported_post ? 'Post' : 'Account'} by{' '}
                {r.reported_username ? (
                  <Link to={who ? '/admin/people/' + who : '/u/' + r.reported_username} className="link-btn">@{r.reported_username}</Link>
                ) : (
                  'a deleted account'
                )}{' '}
                · reported by @{r.reporter_username ?? 'someone'} · {agoLong(r.created_at)}
                {r.reported_post && !r.post_exists ? ' · post removed' : ''}
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
                {r.reported_post && r.post_exists ? (
                  <button className="btn danger-outline small" onClick={() => removePost(r)}>Remove post</button>
                ) : null}
                {who ? (
                  <button className="btn danger-outline small" onClick={() => suspend(r)}>Suspend account</button>
                ) : null}
              </div>
            ) : (
              <span className="pill">{r.status === 'actioned' ? 'Actioned' : 'Dismissed'}</span>
            )}
          </section>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ admins */

function Admins() {
  const { me } = useMe();
  const list = useLoad(() => listAdmins(), []);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Profile[]>([]);
  const owner = me.admin_role === 'owner';

  // Search as you type, as on the iPhone.
  useEffect(() => {
    if (!owner) return;
    const t = setTimeout(() => {
      if (q.trim().length < 2) return setFound([]);
      searchProfiles(q.trim()).then(setFound, () => setFound([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q, owner]);

  async function appoint(p: Profile) {
    if (!(await ask(`Make ${p.full_name || '@' + p.username} an admin?`, 'They get the admin tools. Only you can add or remove admins.', 'Make admin', false))) return;
    addAdmin(me.id, p.id).then(() => {
      list.reload();
      setFound([]);
      setQ('');
      toast('@' + p.username + ' is now an admin');
    }, toastError);
  }

  async function remove(userId: string, username?: string) {
    if (!(await ask(`Remove ${username ? '@' + username : 'this admin'}?`, 'They keep their account; they just lose the admin tools.', 'Remove'))) return;
    removeAdmin(userId).then(() => {
      list.reload();
      toast('Removed');
    }, toastError);
  }

  return (
    <div className="admin-wide">
      <h1 className="page-title">Admins</h1>
      <p className="muted-text adm-intro">{owner ? 'Admins see reports, manage members, approve the tick and Plus, and keep the churches and hymnal. Choose people you trust.' : 'The people who look after the app.'}</p>
      {list.loading ? <Spinner /> : list.error ? <Failed error={list.error} retry={list.reload} /> : null}
      {(list.data ?? []).map((a) => (
        <div key={a.user_id} className="row flat adm-admin-row">
          <Avatar src={a.profile?.avatar_url} name={a.profile?.username || '?'} size={40} />
          <button className="row-text adm-row-link" onClick={() => nav('/admin/people/' + a.user_id)}>
            <b>{a.profile?.full_name || (a.profile ? '@' + a.profile.username : 'Account not set up yet')}</b>
            <span>
              {a.profile ? '@' + a.profile.username : a.user_id} · {a.role === 'owner' ? 'Owner' : 'Admin'}
            </span>
          </button>
          {owner && a.role === 'admin' ? (
            <button className="btn quiet small" onClick={() => remove(a.user_id, a.profile?.username)}>Remove</button>
          ) : null}
        </div>
      ))}
      {owner ? (
        <>
          <h3 className="section-h">Appoint an admin</h3>
          <form className="panel-search in-modal flat" onSubmit={(e) => e.preventDefault()}>
            <input placeholder="Search by name or username" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search members" />
          </form>
          {found.map((p) => {
            const already = (list.data ?? []).some((a) => a.user_id === p.id);
            return (
              <div key={p.id} className={'row flat' + (already ? ' adm-dim' : '')}>
                <Avatar src={p.avatar_url} name={p.username} size={40} />
                <span className="row-text">
                  <b>{p.full_name || '@' + p.username}</b>
                  <span>@{p.username}{already ? ' · already an admin' : ''}</span>
                </span>
                {!already ? <button className="btn small" onClick={() => appoint(p)}>Make admin</button> : null}
              </div>
            );
          })}
          {q.trim().length >= 2 && !found.length ? <p className="muted-text small">No one found.</p> : null}
        </>
      ) : (
        <p className="muted-text">Only the owner can appoint or remove admins.</p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ transactions */

/** What a month of Plus costs, as typed into the amount field. */
const PLUS_POUNDS = '4.99';
const KIND_LABEL: Record<Transaction['kind'], string> = { plus: 'Plus', donation: 'Donation', refund: 'Refund', other: 'Other', ad: 'Ad', subscription: 'Subscription' };
/**
 * Money going back out. Refunds are stored as negative amounts (Stripe's, and those logged here), so
 * the server's income sum takes them off; older hand-logged ones may be positive, so either counts.
 */
const isRefund = (t: Transaction) => t.kind === 'refund' || t.amount_pence < 0;
/** "4,99" from a keypad with a decimal comma is £4.99, not £499. */
const penceFrom = (s: string): number | null => {
  const n = Number(s.trim().replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};

/** Money in and out: Stripe payments, and lines an admin logs by hand (Plus arranged through a church, donations, refunds). */
function Money() {
  const { me } = useMe();
  const owner = me.admin_role === 'owner';
  const list = useLoad(() => fetchTransactions(), []);
  const stats = useLoad(() => fetchAdminStats().catch(() => null), []);
  const [add, setAdd] = useState(false);
  const rows = list.data ?? [];
  const total = rows.filter((t) => t.status === 'succeeded').reduce((s, t) => s + (isRefund(t) ? -Math.abs(t.amount_pence) : t.amount_pence), 0);

  async function remove(t: Transaction) {
    const what = `${pounds(Math.abs(t.amount_pence), t.currency)} · ${KIND_LABEL[t.kind] ?? t.kind}${t.username ? ' · @' + t.username : ''}. This cannot be undone.`;
    if (await ask('Delete this transaction?', what, 'Delete')) deleteTransaction(t.id).then(() => { toast('Deleted'); list.reload(); }, toastError);
  }

  return (
    <div>
      {/* The server's totals, over every transaction rather than the latest listed. Donations belong
          to the fundraisers' organisers, so they are shown apart. */}
      <div className="adm-totals">
        <div><b>{stats.data ? pounds(stats.data.income_month_pence) : '–'}</b><span>Income this month</span></div>
        <div><b>{stats.data ? pounds(stats.data.income_pence) : '–'}</b><span>Income all time</span></div>
        {stats.data && stats.data.donations_pence !== undefined ? (
          <div><b>{pounds(stats.data.donations_pence)}</b><span>Given to fundraisers (paid to their organisers)</span></div>
        ) : null}
      </div>
      <div className="dash-head">
        <h3>Transactions</h3>
        <div className="head-tools">
          <button className="btn quiet small" disabled={!rows.length} onClick={() => downloadCsv('transactions.csv', rows)}>Export CSV</button>
          <button className="btn small" onClick={() => setAdd(true)}>Record a payment</button>
        </div>
      </div>
      <p className="muted-text">Total of the lines below: {pounds(total)}</p>
      {list.loading ? <Spinner /> : list.error ? <Failed error={list.error} retry={list.reload} /> : null}
      <table className="table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Member</th>
            <th>Kind</th>
            <th className="num">Amount</th>
            <th>How</th>
            <th>Note</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id}>
              <td className="nowrap">{new Date(t.created_at).toLocaleDateString('en-GB')}</td>
              <td>{t.username && t.user_id ? <Link to={'/admin/people/' + t.user_id} className="link-btn">@{t.username}</Link> : <span className="muted-text">No member</span>}</td>
              <td>
                {KIND_LABEL[t.kind] ?? t.kind}
                {t.status === 'refunded' ? <span className="pill status-refunded adm-inline-pill">Refunded</span> : null}
              </td>
              <td className={'num' + (isRefund(t) ? ' adm-out' : '')}>{(isRefund(t) ? '−' : '') + pounds(Math.abs(t.amount_pence), t.currency)}</td>
              <td>{t.provider === 'stripe' ? 'Stripe' + (t.method ? ' · ' + t.method : '') : 'Logged by @' + (t.created_by_username ?? 'admin')}</td>
              <td className="clip">{t.note}</td>
              <td>
                {owner ? (
                  <button className="icon-btn" aria-label="Delete" onClick={() => remove(t)}>
                    <Icon name="trash" size={16} />
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {add ? <RecordPayment onClose={() => setAdd(false)} onDone={() => { setAdd(false); list.reload(); stats.reload(); }} /> : null}
    </div>
  );
}

function RecordPayment({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { me } = useMe();
  const [q, setQ] = useState('');
  const [found, setFound] = useState<MemberCard[]>([]);
  const [who, setWho] = useState<MemberCard | null>(null);
  const [kind, setKind] = useState<'plus' | 'donation' | 'refund' | 'other'>('plus');
  const [amount, setAmount] = useState(PLUS_POUNDS);
  const [currency, setCurrency] = useState('GBP');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      if (q.trim().length < 2) return setFound([]);
      fetchMembers(q.trim()).then((m) => setFound(m.slice(0, 6)), () => setFound([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  async function save() {
    if (busy) return;
    const pence = penceFrom(amount);
    if (pence === null || pence <= 0) return toast('Enter an amount, like 4.99');
    if (!/^[A-Za-z]{3}$/.test(currency.trim())) return toast('The currency is a three-letter code, like GBP');
    setBusy(true);
    try {
      // A refund is typed as a positive amount but stored as money out, as Stripe's are.
      await addTransaction(me.id, { user_id: who?.id ?? null, kind, amount_pence: kind === 'refund' ? -pence : pence, currency: currency.trim(), note });
      toast('Logged');
      onDone();
    } catch (e) {
      toastError(e);
      setBusy(false);
    }
  }

  return (
    <Modal title="Record a payment" onClose={onClose} wide>
      <div className="form-pad adm-form">
        <div className="form-row">
          <span>Member</span>
          {who ? (
            <div className="row flat adm-picked">
              <Avatar src={who.avatar_url} name={who.full_name || who.username} size={34} />
              <span className="row-text">
                <b>{who.full_name || '@' + who.username}</b>
                <span>@{who.username}</span>
              </span>
              <button className="btn quiet small" onClick={() => setWho(null)}>Change</button>
            </div>
          ) : (
            <>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or username, or leave empty" aria-label="Search members" />
              {found.map((m) => (
                <button key={m.id} className="row flat adm-pick" onClick={() => { setWho(m); setQ(''); setFound([]); }}>
                  <Avatar src={m.avatar_url} name={m.full_name || m.username} size={30} />
                  <span className="row-text">
                    <b>{m.full_name || '@' + m.username}</b>
                    <span>@{m.username}</span>
                  </span>
                </button>
              ))}
              <em className="adm-hint">{q.trim().length >= 2 && !found.length ? 'No one found.' : !q.trim() ? 'No member: the money is not tied to an account.' : ''}</em>
            </>
          )}
        </div>
        <div className="form-row">
          <span>Kind</span>
          <div className="seg left tight" role="radiogroup" aria-label="Kind">
            {(['plus', 'donation', 'refund', 'other'] as const).map((k) => (
              <button key={k} role="radio" aria-checked={kind === k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>
                {KIND_LABEL[k]}
              </button>
            ))}
          </div>
        </div>
        <div className="form-2">
          <label className="form-row">
            <span>Amount</span>
            <input inputMode="decimal" value={amount} placeholder={PLUS_POUNDS} onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))} />
          </label>
          <label className="form-row">
            <span>Currency</span>
            <input value={currency} maxLength={3} onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
          </label>
        </div>
        <label className="form-row">
          <span>Note</span>
          <input value={note} maxLength={500} placeholder="Which church, which month, a reference" onChange={(e) => setNote(e.target.value)} />
        </label>
        <button className="btn block" disabled={busy} onClick={save}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </Modal>
  );
}
