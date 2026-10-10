// The admin CRM: the dashboard with charts, the people directory and each person's full record,
// search across everything, the security centre, money, content, churches, announcements, the
// audit log and system health. Every number comes from admin-only database functions.
import React, { useEffect, useMemo, useState } from 'react';
import { fetchAdminActivity, fetchAdminStats, fetchMembers } from 'shared/api';
import { ago, fmt } from 'shared/theme';
import {
  type Action, type Person360, type PersonRow, NeedsUpdate, PLATFORM_LABEL, act, addBlockedWord, adminSearch, banAddress, bytes, closeFundraiser, countryName,
  deleteAnnouncement, downloadCsv, endAnnouncement, endLive, endPromotion, fetchAnalytics, fetchAnnouncements, fetchAudit, fetchBlockedWords,
  fetchLivesNow, fetchMoney, fetchPeople, fetchPerson, fetchQueue, fetchRecentContent, fetchSecurity, fetchSystem, flag, pounds, refreshAdminCounts, removeBlockedWord,
  removeContent, resolveAllEvents, resolveEvent, saveAnnouncement, unbanAddress, useAdminCounts, usernames,
} from '../lib/admin';
import { useMe } from '../lib/me';
import { nav } from '../lib/router';
import { ColumnChart, Donut, HBars, LineChart, SERIES, Spark } from '../ui/charts';
import { Avatar, Empty, Failed, Icon, type IconName, Link, Modal, Spinner, Verified, ask, toast, toastError, useLoad } from '../ui/kit';
import { MemberBasic } from './admin-member';

/* ------------------------------------------------------------------ shared bits */

export function Problem({ error, retry }: { error: unknown; retry: () => void }) {
  if (error instanceof NeedsUpdate) return <UpdateNotice />;
  return <Failed error={error} retry={retry} />;
}

export function UpdateNotice() {
  return (
    <section className="dash-card notice-card">
      <h3>
        <Icon name="info" size={18} /> One database update needed
      </h3>
      <p className="muted-text">
        This part of the console reads sign-ins and locations, security alerts, bans, the audit log and analytics, which the database doesn't keep yet. Open your
        Supabase project → SQL Editor, paste the file <code>desktop/supabase/migrations/202610100100_community_admin_crm.sql</code> from the repository and click Run.
        It only adds admin-only tables and functions; the iPhone app is not affected.
      </p>
    </section>
  );
}

function Kpi({ label, value, sub, spark, to, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; spark?: number[]; to?: string; tone?: 'warn' | 'bad' | 'good' }) {
  return (
    <div className={'tile-stat kpi' + (to ? ' click' : '') + (tone ? ' tone-' + tone : '')} onClick={to ? () => nav(to) : undefined}>
      <span>{label}</span>
      <b>{value}</b>
      <div className="kpi-foot">
        {sub ? <em>{sub}</em> : <em />}
        {spark ? <Spark values={spark} /> : null}
      </div>
    </div>
  );
}

function Card({ title, children, actions, className }: { title?: React.ReactNode; children: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return (
    <section className={'dash-card ' + (className ?? '')}>
      {title || actions ? (
        <div className="card-head">
          {title ? <h3>{title}</h3> : <span />}
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  );
}

function Seg<T extends string | number>({ value, options, onChange }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="seg left tight">
      {options.map((o) => (
        <button key={String(o.v)} className={value === o.v ? 'on' : ''} onClick={() => onChange(o.v)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

const SEVERITY: Record<string, { icon: IconName; label: string }> = {
  high: { icon: 'flag', label: 'High' },
  medium: { icon: 'info', label: 'Medium' },
  low: { icon: 'bell', label: 'Low' },
};

function Severity({ s }: { s: string }) {
  const v = SEVERITY[s] ?? SEVERITY.low;
  return (
    <span className={'pill sev-' + s}>
      <Icon name={v.icon} size={12} /> {v.label}
    </span>
  );
}

const EVENT_LABEL: Record<string, string> = {
  new_country: 'Sign-in from a new country',
  many_addresses: 'Many addresses in a day',
  blocked_address: 'Sign-in from a blocked address',
  message_burst: 'Message burst',
  follow_burst: 'Follow burst',
  comment_burst: 'Comment burst',
  heavily_reported: 'Heavily reported',
  widely_blocked: 'Widely blocked',
  new_and_busy: 'New account, very busy',
};

function StatusPills({ p }: { p: { verified?: boolean; plus?: boolean; suspended?: boolean; deleted_at?: string | null; admin_role?: string | null; minor?: boolean; is_private?: boolean } }) {
  return (
    <span className="pills">
      {p.admin_role ? <span className="pill">{p.admin_role === 'owner' ? 'Owner' : 'Admin'}</span> : null}
      {p.plus ? <span className="pill plus">Plus</span> : null}
      {p.suspended ? <span className="pill danger">Suspended</span> : null}
      {p.deleted_at ? <span className="pill danger">Closing</span> : null}
      {p.minor ? <span className="pill warn">Under 14</span> : null}
      {p.is_private ? <span className="pill">Private</span> : null}
    </span>
  );
}

const shortDate = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const dateTime = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

/* ------------------------------------------------------------------ dashboard */

const METRICS = [
  { k: 'active', label: 'Active people' },
  { k: 'signups', label: 'Sign-ups' },
  { k: 'posts', label: 'Posts' },
  { k: 'messages', label: 'Messages' },
  { k: 'comments', label: 'Comments' },
  { k: 'likes', label: 'Likes' },
  { k: 'calls', label: 'Calls' },
  { k: 'reports', label: 'Reports' },
] as const;

export function Dashboard() {
  const [days, setDays] = useState(30);
  const [metric, setMetric] = useState<(typeof METRICS)[number]['k']>('active');
  const a = useLoad(() => fetchAnalytics(days), [days]);
  const stats = useLoad(() => fetchAdminStats(), []);
  const queue = useLoad(() => fetchQueue().catch(() => null), []);
  const sec = useLoad(() => fetchSecurity().catch(() => null), []);
  const activity = useLoad(() => fetchAdminActivity(30), []);
  // Publisher requests, open chats and the two kinds of request, counted as the iPhone console does.
  const waiting = useAdminCounts();
  const s = stats.data;
  const d = a.data;
  const series = d?.series ?? [];
  const col = (k: string) => series.map((x: any) => x[k] as number);
  const sum = (k: string) => col(k).reduce((x, y) => x + y, 0);

  const alerts: { label: string; n: number; to: string; tone: 'bad' | 'warn' }[] = [];
  const add = (n: number | undefined, one: string, many: string, to: string, tone: 'bad' | 'warn') => {
    if (n) alerts.push({ label: n === 1 ? one : many, n, to, tone });
  };
  add(s?.reports_open, 'open report', 'open reports', '/admin/reports', 'bad');
  add(sec.data?.open_by_severity?.high, 'high security alert', 'high security alerts', '/admin/security', 'bad');
  add(waiting.verifications, 'identity check', 'identity checks', '/admin/requests', 'warn');
  add(waiting.plus, 'Plus request', 'Plus requests', '/admin/requests/plus', 'warn');
  add(waiting.publishers, 'publisher request', 'publisher requests', '/admin/publishers', 'warn');
  add(waiting.chats, 'open support chat', 'open support chats', '/admin/support', 'warn');
  add(s?.support_open, 'help request', 'help requests', '/admin/support/requests', 'warn');
  add(queue.data?.churches_pending, 'church to review', 'churches to review', '/admin/churches', 'warn');

  return (
    <div className="admin-wide xl">
      <div className="dash-head">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="muted-text small">
            {d ? (
              <>
                <span className="dot-live" /> {fmt(d.totals.online)} online now · updated {new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
              </>
            ) : (
              'Everything happening across Community'
            )}
          </p>
        </div>
        <div className="head-tools">
          <Seg value={days} onChange={setDays} options={[{ v: 7, label: '7 days' }, { v: 30, label: '30 days' }, { v: 90, label: '90 days' }, { v: 365, label: 'Year' }]} />
          <button className="icon-btn" aria-label="Refresh" onClick={() => { a.reload(); stats.reload(); sec.reload(); activity.reload(); queue.reload(); refreshAdminCounts(); }}>
            <Icon name="undo" size={18} />
          </button>
        </div>
      </div>

      {alerts.length ? (
        <div className="alert-strip">
          {alerts.map((x) => (
            <button key={x.label} className={'alert-chip ' + x.tone} onClick={() => nav(x.to)}>
              <b>{x.n}</b> {x.label} <Icon name="right" size={14} />
            </button>
          ))}
        </div>
      ) : null}

      {a.error && !(a.error instanceof NeedsUpdate) ? <Failed error={a.error} retry={a.reload} /> : null}
      {a.error instanceof NeedsUpdate ? <UpdateNotice /> : null}

      <div className="stat-tiles kpis">
        <Kpi label="Members" value={fmt(d?.totals.members ?? s?.members ?? 0)} sub={s ? `+${s.members_week} this week` : undefined} spark={col('signups')} to="/admin/people" />
        <Kpi label="Active today" value={d ? fmt(d.totals.dau) : '—'} sub={d ? `${fmt(d.totals.wau)} this week · ${fmt(d.totals.mau)} this month` : 'Needs sign-in data'} spark={col('active')} />
        <Kpi label="7-day retention" value={d ? d.totals.retention_pct + '%' : '—'} sub="Came back a week after joining" />
        <Kpi label={`Income, ${days === 365 ? 'year' : days + ' days'}`} value={d ? pounds(d.totals.revenue_pence) : s ? pounds(s.income_month_pence) : '—'} sub={d ? `${pounds(d.totals.donations_pence).replace('.00', '')} donated · ${pounds(d.totals.boosts_pence).replace('.00', '')} boosts` : 'This month'} spark={col('revenue_pence')} to="/admin/money" />
        <Kpi label="Plus subscribers" value={d ? fmt(d.totals.subscribers) : s ? fmt(s.plus) : '—'} sub={s ? `${fmt(s.verified)} verified` : undefined} />
        <Kpi label="Posts" value={fmt(d ? sum('posts') : s?.posts_week ?? 0)} sub={d ? `${fmt(sum('stories'))} stories` : 'This week'} spark={col('posts')} to="/admin/content" />
        <Kpi label="Messages" value={fmt(d ? sum('messages') : s?.messages_week ?? 0)} sub={d ? `${fmt(sum('calls'))} calls` : 'This week'} spark={col('messages')} />
        <Kpi label="Open reports" value={fmt(s?.reports_open ?? 0)} sub={s ? `${fmt(s.suspended)} suspended · ${fmt(s.deactivated)} closing` : undefined} to="/admin/reports" tone={s?.reports_open ? 'bad' : undefined} />
      </div>

      {d ? (
        <>
          <Card
            title="Activity"
            actions={<Seg value={metric} onChange={setMetric} options={METRICS.map((m) => ({ v: m.k, label: m.label }))} />}
          >
            <LineChart data={series.map((x: any) => ({ x: x.d, y: x[metric] }))} name={METRICS.find((m) => m.k === metric)!.label} height={260} />
          </Card>

          <div className="grid-2">
            <Card title="Income per day">
              <ColumnChart data={series.map((x) => ({ x: x.d, y: x.revenue_pence }))} format={(n) => pounds(n).replace('.00', '')} name="Income" color={SERIES[2]} />
            </Card>
            <Card title="Busiest hours (UK time)">
              <ColumnChart
                data={Array.from({ length: 24 }, (_, h) => ({ x: String(h).padStart(2, '0'), y: d.hours.find((x) => Number(x.label) === h)?.value ?? 0 }))}
                labels="raw"
                name="Actions"
                color={SERIES[6]}
              />
            </Card>
          </div>

          <div className="grid-3">
            <Card title="Where people use Community">
              <Donut slices={d.platforms.map((p) => ({ label: PLATFORM_LABEL[p.label] ?? p.label, value: p.value }))} name="Platforms" />
            </Card>
            <Card title="What people make">
              <Donut slices={d.content} name="Content" />
            </Card>
            <Card title="Income by kind">
              <Donut slices={d.revenue_kinds.map((k) => ({ label: k.label[0].toUpperCase() + k.label.slice(1), value: k.value }))} format={(n) => pounds(n).replace('.00', '')} name="Income by kind" />
            </Card>
          </div>

          <div className="grid-3">
            <Card title="Countries">
              <HBars items={d.countries.map((c) => ({ key: c.label, label: <>{flag(c.label)} {countryName(c.label)}</>, value: c.value }))} empty="Locations appear once people open the updated app." />
            </Card>
            <Card title="Time zones">
              <HBars items={d.timezones.map((c) => ({ key: c.label, label: c.label.replace(/_/g, ' '), value: c.value }))} color={SERIES[1]} empty="Time zones appear once people open the updated app." />
            </Card>
            <Card title="Accounts">
              <HBars items={d.accounts.map((c) => ({ key: c.label, label: c.label, value: c.value }))} color={SERIES[2]} />
            </Card>
          </div>

          <div className="grid-2">
            <Card title="Top creators">
              <table className="table compact">
                <thead>
                  <tr>
                    <th>Person</th>
                    <th className="num">Posts</th>
                    <th className="num">Likes</th>
                    <th className="num">Followers</th>
                  </tr>
                </thead>
                <tbody>
                  {d.top_creators.map((p) => (
                    <tr key={p.id} onClick={() => nav('/admin/people/' + p.id)}>
                      <td>
                        <span className="cell-person">
                          <Avatar src={p.avatar_url} name={p.username} size={28} />
                          <b>
                            {p.username}
                            {p.verified ? <Verified size={11} /> : null}
                          </b>
                        </span>
                      </td>
                      <td className="num">{fmt(p.posts)}</td>
                      <td className="num">{fmt(p.likes)}</td>
                      <td className="num">{fmt(p.followers)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
            <Card title="Top posts">
              <div className="post-strip">
                {d.top_posts.length ? d.top_posts.map((p) => (
                  <button key={p.id} className="post-chip" onClick={() => nav('/p/' + p.id)} title={p.caption}>
                    {p.media ? <img src={p.media.type === 'video' ? p.media.poster || '' : p.media.url} alt="" /> : <span className="ph" />}
                    <span>
                      <b>@{p.username}</b>
                      <em>
                        ♥ {fmt(p.likes)} · 💬 {fmt(p.comments)} · 👁 {fmt(p.views)}
                      </em>
                    </span>
                  </button>
                )) : <p className="muted-text small">No posts in this period.</p>}
              </div>
            </Card>
          </div>

          <div className="grid-2">
            <Card title="Churches by members">
              <HBars items={d.churches.map((c) => ({ key: c.id, label: c.name, value: c.members }))} color={SERIES[3]} empty="No approved churches yet." />
            </Card>
            <Card title="Latest activity" actions={<Link to="/admin/activity" className="link-btn">See all</Link>}>
              <ActivityList rows={activity.data ?? []} />
            </Card>
          </div>
        </>
      ) : a.loading ? (
        <Spinner />
      ) : (
        <Card title="Latest activity">
          <ActivityList rows={activity.data ?? []} />
        </Card>
      )}
    </div>
  );
}

/** An activity kind as words. Short videos are Shorts everywhere in the app. */
const kindText = (k: string) => (k === 'reel' ? 'Short' : k.replace('_', ' '));

/** What happened, in the iPhone console's words, when a line has no detail of its own. */
const ACT_WORD: Record<string, string> = {
  joined: 'joined', post: 'posted', reel: 'shared a Short', live: 'went live', report: 'reported', transaction: 'transaction',
  support: 'wrote to support', plus_request: 'asked for Plus', group: 'group',
};
/** The activity filters' names. */
const ACT_FILTER: Record<string, string> = {
  all: 'Everything', joined: 'Joined', post: 'Posts', reel: 'Shorts', live: 'Live', report: 'Reports', transaction: 'Payments',
  support: 'Support', plus_request: 'Requests', group: 'Groups',
};

const ACT_ICON: Record<string, IconName> = { joined: 'user', report: 'flag', transaction: 'receipt', support: 'lifebuoy', live: 'live', group: 'people', plus_request: 'verified', reel: 'reels', post: 'image' };

type ActRow = { at: string; kind: string; user_id: string | null; username: string | null; detail: string | null };

/** "Today", "Yesterday", or "9 Oct" (with the year when it isn't this one). */
function dayTitle(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(d)) / 86400e3);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(d.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }) });
}

function ActivityList({ rows }: { rows: ActRow[] }) {
  if (!rows.length) return <p className="muted-text small">Nothing yet.</p>;
  return (
    <div className="activity-list">
      {rows.map((a, i) => (
        <div key={i} className="row flat" onClick={a.user_id ? () => nav('/admin/people/' + a.user_id) : undefined} style={a.user_id ? { cursor: 'pointer' } : undefined}>
          <span className="hymn-no small">
            <Icon name={ACT_ICON[a.kind] ?? 'activity'} size={16} />
          </span>
          <span className="row-text wrap inline">
            <b>{a.username ? '@' + a.username : 'Someone'}</b> <span>· {a.detail?.trim() || ACT_WORD[a.kind] || kindText(a.kind)}</span>
          </span>
          <span className="muted-text small nowrap">{ago(a.at)}</span>
        </div>
      ))}
    </div>
  );
}

/** Everything that happened across the community, newest first, a day at a time. */
export function ActivityPage() {
  const [kind, setKind] = useState('all');
  const list = useLoad(() => fetchAdminActivity(300), []);
  const rows = (list.data ?? []).filter((r) => kind === 'all' || r.kind === kind);
  const days: { title: string; rows: ActRow[] }[] = [];
  for (const r of rows) {
    const title = dayTitle(r.at);
    const last = days[days.length - 1];
    if (last && last.title === title) last.rows.push(r);
    else days.push({ title, rows: [r] });
  }
  return (
    <div className="admin-wide">
      <div className="dash-head">
        <h1 className="page-title">Live activity</h1>
        <button className="btn quiet small" onClick={list.reload}>Refresh</button>
      </div>
      <Seg value={kind} onChange={setKind} options={Object.keys(ACT_FILTER).map((k) => ({ v: k, label: ACT_FILTER[k] }))} />
      {list.loading ? (
        <Spinner />
      ) : list.error ? (
        <Failed error={list.error} retry={list.reload} />
      ) : !days.length ? (
        <Empty icon="pulse" title="Nothing yet" body="As people join, post, go live or write in, it shows up here." />
      ) : (
        days.map((d) => (
          <section key={d.title} className="adm-day">
            <h3 className="adm-day-title">{d.title}</h3>
            <ActivityList rows={d.rows} />
          </section>
        ))
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ people */

const FILTERS = [
  { v: 'all', label: 'Everyone' },
  { v: 'active', label: 'Active this week' },
  { v: 'new', label: 'New' },
  { v: 'verified', label: 'Verified' },
  { v: 'plus', label: 'Plus' },
  { v: 'paying', label: 'Paying' },
  { v: 'reported', label: 'Reported' },
  { v: 'alerts', label: 'Security alerts' },
  { v: 'suspended', label: 'Suspended' },
  { v: 'closed', label: 'Closing' },
  { v: 'minors', label: 'Under 14' },
  { v: 'dormant', label: 'Dormant' },
  { v: 'admins', label: 'Admins' },
];

const SORTS = [
  { v: 'newest', label: 'Newest' },
  { v: 'oldest', label: 'Oldest' },
  { v: 'active', label: 'Recently active' },
  { v: 'name', label: 'Username' },
  { v: 'followers', label: 'Most followers' },
  { v: 'posts', label: 'Most posts' },
  { v: 'reports', label: 'Most reported' },
  { v: 'spent', label: 'Most spent' },
];

const PAGE = 50;

export function People() {
  const [q, setQ] = useState('');
  const [needle, setNeedle] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(0);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const list = useLoad(() => fetchPeople(needle, filter, sort, PAGE, page * PAGE), [needle, filter, sort, page]);
  const fallback = useLoad(() => (list.error instanceof NeedsUpdate ? fetchMembers(needle) : Promise.resolve(null)), [list.error, needle]);
  const rows = list.data?.rows ?? [];
  const total = list.data?.total ?? 0;
  useEffect(() => setPicked(new Set()), [needle, filter, sort, page]);

  const bulk = async (action: Action, label: string) => {
    const ids = [...picked];
    if (!ids.length) return;
    if (['suspend', 'close', 'wipe'].includes(action) && !(await ask(`${label} ${ids.length} account${ids.length > 1 ? 's' : ''}?`, 'This is written to the audit log.', label))) return;
    let done = 0;
    for (const id of ids) {
      try {
        await act(id, action, 'Bulk action from the people list');
        done++;
      } catch (e) {
        toastError(e);
      }
    }
    toast(`${label}: ${done} of ${ids.length}`);
    setPicked(new Set());
    list.reload();
  };

  return (
    <div className="admin-wide xl">
      <div className="dash-head">
        <div>
          <h1 className="page-title">People</h1>
          <p className="muted-text small">{list.data ? `${fmt(total)} ${filter === 'all' && !needle ? 'accounts' : 'matching'}` : 'Every account on Community'}</p>
        </div>
        <div className="head-tools">
          <select className="select" value={sort} onChange={(e) => { setSort(e.target.value); setPage(0); }} aria-label="Sort">
            {SORTS.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
          </select>
          <button className="btn quiet small" disabled={!rows.length} onClick={() => downloadCsv('community-people.csv', rows.map(({ avatar_url, ...r }) => r))}>
            <Icon name="download" size={16} /> Export CSV
          </button>
        </div>
      </div>
      <form className="panel-search in-modal flat big" onSubmit={(e) => { e.preventDefault(); setPage(0); setNeedle(q.trim()); }}>
        <Icon name="search" size={18} />
        <input placeholder="Search by name, username, email, phone, account ID or IP address" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search people" />
        {needle ? <button type="button" className="link-btn" onClick={() => { setQ(''); setNeedle(''); }}>Clear</button> : null}
      </form>
      <div className="chips">
        {FILTERS.map((f) => (
          <button key={f.v} className={'pill-btn' + (filter === f.v ? ' on' : '')} onClick={() => { setFilter(f.v); setPage(0); }}>
            {f.label}
          </button>
        ))}
      </div>

      {picked.size ? (
        <div className="bulk-bar">
          <b>{picked.size} selected</b>
          <button className="btn quiet small" onClick={() => bulk('verify', 'Verify')}>Give the tick</button>
          <button className="btn quiet small" onClick={() => bulk('unsuspend', 'Lift suspension')}>Lift suspension</button>
          <button className="btn danger-outline small" onClick={() => bulk('suspend', 'Suspend')}>Suspend</button>
          <button className="btn danger-outline small" onClick={() => bulk('close', 'Close')}>Close accounts</button>
          <button className="link-btn" onClick={() => setPicked(new Set())}>Clear</button>
        </div>
      ) : null}

      {list.error instanceof NeedsUpdate ? (
        <>
          <UpdateNotice />
          <OldMembers rows={fallback.data ?? []} />
        </>
      ) : list.error ? (
        <Failed error={list.error} retry={list.reload} />
      ) : list.loading && !list.data ? (
        <Spinner />
      ) : !rows.length ? (
        <Empty icon="users" title="Nobody matches" body="Try another search or filter." />
      ) : (
        <div className="table-wrap">
          <table className="table people">
            <thead>
              <tr>
                <th className="check">
                  <input
                    type="checkbox"
                    aria-label="Select all"
                    checked={rows.length > 0 && rows.every((r) => picked.has(r.id))}
                    onChange={(e) => setPicked(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())}
                  />
                </th>
                <th>Person</th>
                <th>Status</th>
                <th>Last seen</th>
                <th>Location</th>
                <th>Joined</th>
                <th className="num">Posts</th>
                <th className="num">Followers</th>
                <th className="num">Reports</th>
                <th className="num">Spent</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id} onClick={() => nav('/admin/people/' + m.id)} className={m.suspended || m.deleted_at ? 'dim' : ''}>
                  <td className="check" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      aria-label={'Select ' + m.username}
                      checked={picked.has(m.id)}
                      onChange={(e) => {
                        const next = new Set(picked);
                        if (e.target.checked) next.add(m.id);
                        else next.delete(m.id);
                        setPicked(next);
                      }}
                    />
                  </td>
                  <td>
                    <span className="cell-person">
                      <Avatar src={m.avatar_url} name={m.username} size={34} />
                      <span>
                        <b>
                          {m.username}
                          {m.verified ? <Verified size={11} /> : null}
                        </b>
                        <span className="muted-text">{m.full_name}{m.contact_email ? ' · ' + m.contact_email : ''}</span>
                      </span>
                    </span>
                  </td>
                  <td>
                    <StatusPills p={m} />
                    {m.alerts ? <span className="pill sev-medium"><Icon name="shield" size={11} /> {m.alerts}</span> : null}
                  </td>
                  <td className="nowrap">
                    {m.last_seen ? ago(m.last_seen) : <span className="muted-text">—</span>}
                    {m.platform ? <span className="muted-text small block">{PLATFORM_LABEL[m.platform] ?? m.platform}</span> : null}
                  </td>
                  <td className="nowrap">{m.country ? <>{flag(m.country)} {countryName(m.country)}</> : <span className="muted-text">—</span>}</td>
                  <td className="nowrap">{shortDate(m.created_at)}</td>
                  <td className="num">{fmt(m.posts)}</td>
                  <td className="num">{fmt(m.followers)}</td>
                  <td className={'num' + (m.reports ? ' bad' : '')}>{fmt(m.reports)}</td>
                  <td className="num">{m.spent_pence ? pounds(m.spent_pence) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {total > PAGE ? (
        <div className="pager">
          <button className="btn quiet small" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button>
          <span className="muted-text small">
            {page * PAGE + 1}–{Math.min(total, (page + 1) * PAGE)} of {fmt(total)}
          </span>
          <button className="btn quiet small" disabled={(page + 1) * PAGE >= total} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      ) : null}
    </div>
  );
}

function OldMembers({ rows }: { rows: any[] }) {
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Member</th>
          <th>Joined</th>
          <th className="num">Posts</th>
          <th className="num">Reports</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((m) => (
          <tr key={m.id} onClick={() => nav('/admin/people/' + m.id)}>
            <td>
              <span className="cell-person">
                <Avatar src={m.avatar_url} name={m.username} size={32} />
                <b>{m.username}</b>
              </span>
            </td>
            <td>{shortDate(m.created_at)}</td>
            <td className="num">{m.posts_count}</td>
            <td className="num">{m.reports_count}</td>
            <td>
              <StatusPills p={m} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ------------------------------------------------------------------ one person */

const PERSON_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'activity', label: 'Activity' },
  { id: 'signins', label: 'Sign-ins and locations' },
  { id: 'money', label: 'Money' },
  { id: 'safety', label: 'Safety' },
  { id: 'support', label: 'Support and groups' },
];

const COUNT_LABELS: [string, string][] = [
  ['posts', 'Posts'], ['reels', 'Shorts'], ['stories', 'Stories'], ['comments', 'Comments'], ['likes_given', 'Likes given'], ['likes_received', 'Likes received'],
  ['followers', 'Followers'], ['following', 'Following'], ['messages', 'Messages sent'], ['chats', 'Chats'], ['calls', 'Calls'], ['lives', 'Lives'],
  ['groups', 'Groups'], ['profile_views', 'Profile views'], ['blocks_made', 'People they blocked'], ['blocked_by', 'Blocked by'], ['reports_made', 'Reports made'], ['reports_against', 'Reports against'],
];

export function Person({ id }: { id: string }) {
  const { me } = useMe();
  const p = useLoad(() => fetchPerson(id), [id]);
  const [tab, setTab] = useState('overview');
  const [dialog, setDialog] = useState<null | 'suspend' | 'close' | 'note' | 'plus'>(null);
  const owner = me.admin_role === 'owner';

  if (p.loading && !p.data) return <Spinner />;
  // Without the admin database update, the iPhone console's controls for one member still work.
  if (p.error instanceof NeedsUpdate) return <MemberBasic id={id} />;
  if (p.error) {
    return (
      <div className="admin-wide">
        <button className="link-btn" onClick={() => nav('/admin/people')}>← People</button>
        <Problem error={p.error} retry={p.reload} />
      </div>
    );
  }
  const d = p.data!;
  const pr = d.profile;
  const last = d.sessions[0];
  const run = async (action: Action, label: string, reason = '', days: number | null = null) => {
    try {
      const r = await act(id, action, reason, days);
      toast(label);
      if (r?.deleted) nav('/admin/people');
      else p.reload();
    } catch (e) {
      toastError(e);
    }
  };
  const isTargetOwner = pr.admin_role === 'owner';
  const ips = [...new Set(d.sessions.map((s) => s.ip).filter(Boolean))];

  return (
    <div className="admin-wide xl person">
      <button className="link-btn back-link" onClick={() => nav('/admin/people')}>
        <Icon name="back" size={16} /> People
      </button>
      <section className="person-head">
        <Avatar src={pr.avatar_url} name={pr.username} size={88} />
        <div className="grow">
          <h1>
            {pr.full_name || pr.username} {pr.verified ? <Verified size={16} /> : null}
          </h1>
          <p className="muted-text">
            @{pr.username} · joined {shortDate(pr.created_at)} {pr.church_name ? '· ' + pr.church_name : ''} · {pr.account_type === 'creator' ? 'Creator account' : 'Personal account'}
          </p>
          <StatusPills p={pr} />
          <div className="facts">
            <span>
              <Icon name="clock" size={14} /> {last ? 'Last seen ' + ago(last.last_seen) + ' on ' + (PLATFORM_LABEL[last.platform] ?? last.platform) : 'No sign-ins recorded yet'}
            </span>
            {last?.country ? (
              <span>
                <Icon name="location" size={14} /> {flag(last.country)} {countryName(last.country)}
                {last.timezone ? ' · ' + last.timezone.replace(/_/g, ' ') : ''}
              </span>
            ) : null}
            {pr.contact_email ? (
              <span>
                <Icon name="mail" size={14} /> {pr.contact_email}
              </span>
            ) : null}
            {pr.contact_phone ? (
              <span>
                <Icon name="phone" size={14} /> {pr.contact_phone}
              </span>
            ) : null}
            <span className="mono" title="Account ID" onClick={() => { navigator.clipboard?.writeText(pr.id); toast('Account ID copied'); }} style={{ cursor: 'copy' }}>
              <Icon name="key" size={14} /> {pr.id}
            </span>
          </div>
          {pr.admin_note ? <p className="admin-note"><Icon name="info" size={14} /> {pr.admin_note}</p> : null}
        </div>
      </section>

      {!isTargetOwner ? (
        <div className="action-bar">
          <button className="btn quiet small" onClick={() => nav('/u/' + pr.username)}>Open profile</button>
          <button className="btn quiet small" onClick={() => run(pr.verified ? 'unverify' : 'verify', pr.verified ? 'Tick removed' : 'Tick given')}>{pr.verified ? 'Remove tick' : 'Give the tick'}</button>
          {pr.plus ? <button className="btn quiet small" onClick={() => run('unplus', 'Plus ended')}>End Plus</button> : <button className="btn quiet small" onClick={() => setDialog('plus')}>Give Plus</button>}
          <button className="btn quiet small" onClick={() => setDialog('note')}>Admin note</button>
          {d.counts.lives ? <button className="btn quiet small" onClick={() => run('end_live', 'Live ended')}>End live</button> : null}
          <span className="grow" />
          {pr.suspended ? (
            <button className="btn small" onClick={() => run('unsuspend', 'Suspension lifted')}>Lift suspension</button>
          ) : (
            <button className="btn danger-outline small" onClick={() => setDialog('suspend')}>Suspend</button>
          )}
          {pr.deleted_at ? (
            <button className="btn small" onClick={() => run('restore', 'Account restored')}>Restore account</button>
          ) : (
            <button className="btn danger-outline small" onClick={() => setDialog('close')}>Close account</button>
          )}
          <button
            className="btn danger-outline small"
            onClick={async () => {
              if (await ask('Remove all of @' + pr.username + "'s posts, stories and comments?", 'This cannot be undone. Their account stays open.', 'Remove everything')) run('wipe', 'Content removed');
            }}
          >
            Remove content
          </button>
          {ips.length ? (
            <button
              className="btn danger-outline small"
              onClick={async () => {
                if (!(await ask(`Block ${ips.length} address${ips.length > 1 ? 'es' : ''}?`, 'Anyone signing in from ' + ips.join(', ') + ' is suspended automatically.', 'Block'))) return;
                for (const ip of ips) await banAddress(ip, 'Blocked from @' + pr.username + "'s record", me.id).catch(toastError);
                toast('Addresses blocked');
              }}
            >
              Block their addresses
            </button>
          ) : null}
          {owner ? (
            <button
              className="btn danger small"
              onClick={async () => {
                if (await ask('Delete @' + pr.username + ' now?', 'Their profile, posts, messages and everything else is deleted immediately instead of after 30 days. This cannot be undone.', 'Delete forever')) run('purge', 'Account deleted');
              }}
            >
              Delete now
            </button>
          ) : null}
        </div>
      ) : (
        <p className="muted-text small">This is the owner's account; it can't be changed from here.</p>
      )}

      <div className="seg left tabs-line">
        {PERSON_TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' ? <PersonOverview d={d} /> : tab === 'activity' ? <PersonActivity d={d} /> : tab === 'signins' ? <PersonSignins d={d} onBan={(ip) => banAddress(ip, 'Blocked from @' + pr.username + "'s record", me.id).then(() => toast(ip + ' blocked'), toastError)} /> : tab === 'money' ? <PersonMoney d={d} /> : tab === 'safety' ? <PersonSafety d={d} /> : <PersonSupport d={d} />}

      {dialog === 'suspend' ? <SuspendDialog name={pr.username} onClose={() => setDialog(null)} onDone={(reason, days) => { setDialog(null); run('suspend', days ? `Suspended for ${days} days` : 'Suspended', reason, days); }} /> : null}
      {dialog === 'close' ? (
        <ReasonDialog
          title={'Close @' + pr.username + "'s account?"}
          body="Their profile disappears straight away and everything is deleted after 30 days, unless you restore it first."
          action="Close account"
          danger
          onClose={() => setDialog(null)}
          onDone={(reason) => { setDialog(null); run('close', 'Account closed', reason); }}
        />
      ) : null}
      {dialog === 'note' ? (
        <ReasonDialog title="Admin note" body="Only admins see this." action="Save note" initial={pr.admin_note} onClose={() => setDialog(null)} onDone={(reason) => { setDialog(null); run('note', 'Note saved', reason); }} />
      ) : null}
      {dialog === 'plus' ? <PlusDialog onClose={() => setDialog(null)} onDone={(days) => { setDialog(null); run('plus', `Plus given for ${days} days`, '', days); }} /> : null}
    </div>
  );
}

function SuspendDialog({ name, onClose, onDone }: { name: string; onClose: () => void; onDone: (reason: string, days: number | null) => void }) {
  const [reason, setReason] = useState('');
  const [days, setDays] = useState<number | null>(7);
  return (
    <Modal title={'Suspend @' + name} onClose={onClose}>
      <div className="form-pad">
        <p className="muted-text">They can't post, comment, message, go live or start fundraisers while suspended.</p>
        <label className="form-row">
          <span>How long</span>
          <select value={days ?? 0} onChange={(e) => setDays(Number(e.target.value) || null)}>
            <option value={1}>1 day</option>
            <option value={3}>3 days</option>
            <option value={7}>7 days</option>
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
            <option value={0}>Until I lift it</option>
          </select>
        </label>
        <label className="form-row">
          <span>Reason (only admins see this)</span>
          <textarea rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Spam in comments after two warnings" />
        </label>
        <button className="btn danger block" onClick={() => onDone(reason, days)}>Suspend</button>
      </div>
    </Modal>
  );
}

function ReasonDialog({ title, body, action, onClose, onDone, initial = '', danger }: { title: string; body: string; action: string; onClose: () => void; onDone: (r: string) => void; initial?: string; danger?: boolean }) {
  const [reason, setReason] = useState(initial);
  return (
    <Modal title={title} onClose={onClose}>
      <div className="form-pad">
        <p className="muted-text">{body}</p>
        <label className="form-row">
          <span>{danger ? 'Reason (only admins see this)' : 'Note'}</span>
          <textarea rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        <button className={'btn block' + (danger ? ' danger' : '')} onClick={() => onDone(reason)}>{action}</button>
      </div>
    </Modal>
  );
}

function PlusDialog({ onClose, onDone }: { onClose: () => void; onDone: (days: number) => void }) {
  const [days, setDays] = useState(30);
  return (
    <Modal title="Give Community Plus" onClose={onClose}>
      <div className="form-pad">
        <p className="muted-text">Plus comes with the verified tick. Nothing is charged; record a payment in Money if one was made.</p>
        <label className="form-row">
          <span>For</span>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
            <option value={7}>1 week</option>
            <option value={30}>1 month</option>
            <option value={90}>3 months</option>
            <option value={365}>1 year</option>
          </select>
        </label>
        <button className="btn block" onClick={() => onDone(days)}>Give Plus</button>
      </div>
    </Modal>
  );
}

function PersonOverview({ d }: { d: Person360 }) {
  return (
    <>
      <div className="count-grid">
        {COUNT_LABELS.map(([k, label]) => (
          <div key={k} className={'count' + ((k === 'reports_against' || k === 'blocked_by') && d.counts[k] ? ' bad' : '')}>
            <b>{fmt(d.counts[k] ?? 0)}</b>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <Card title="Activity, last 30 days">
        <ColumnChart data={d.activity_days.map((x) => ({ x: x.d, y: x.n }))} name="Actions" height={180} />
        <p className="muted-text small">Posts, comments, messages and likes per day. Message contents stay private between the people in the chat.</p>
      </Card>
      <Card title="Recent posts">
        {d.recent_posts.length ? (
          <div className="mini-grid">
            {d.recent_posts.map((x) => (
              <button key={x.id} onClick={() => nav('/p/' + x.id)} title={x.caption}>
                {x.media ? <img src={x.media.type === 'video' ? x.media.poster || '' : x.media.url} alt="" /> : <span className="ph" />}
                <em>♥ {x.likes} · 💬 {x.comments}</em>
              </button>
            ))}
          </div>
        ) : (
          <p className="muted-text small">No posts.</p>
        )}
      </Card>
    </>
  );
}

const TL_ICON: Record<string, IconName> = { post: 'image', reel: 'reels', comment: 'comment', story: 'story', follow: 'user', live: 'live', call: 'phone', payment: 'receipt', sign_in: 'key' };

function PersonActivity({ d }: { d: Person360 }) {
  if (!d.timeline.length) return <Empty icon="activity" title="No activity yet" />;
  return (
    <div className="timeline">
      {d.timeline.map((t, i) => (
        <div key={i} className="tl-row">
          <span className="tl-icon">
            <Icon name={TL_ICON[t.kind] ?? 'activity'} size={15} />
          </span>
          <span className="grow">
            <b>{kindText(t.kind)}</b> {t.detail ? <span className="muted-text">{t.detail}</span> : null}
          </span>
          <span className="muted-text small nowrap" title={dateTime(t.at)}>{ago(t.at)}</span>
        </div>
      ))}
    </div>
  );
}

function PersonSignins({ d, onBan }: { d: Person360; onBan: (ip: string) => void }) {
  return (
    <>
      <p className="muted-text small">
        Locations are approximate: the country comes from the network address, and the time zone from the device. Exact positions are never collected.
      </p>
      {d.sessions.length ? (
        <div className="table-wrap">
          <table className="table compact">
            <thead>
              <tr>
                <th>App</th>
                <th>Location</th>
                <th>Address</th>
                <th>Device</th>
                <th>First seen</th>
                <th>Last seen</th>
                <th className="num">Opens</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {d.sessions.map((s) => (
                <tr key={s.id}>
                  <td>
                    {PLATFORM_LABEL[s.platform] ?? s.platform}
                    {s.app_version ? <span className="muted-text small block">v{s.app_version}</span> : null}
                  </td>
                  <td>
                    {flag(s.country)} {countryName(s.country)}
                    {s.timezone ? <span className="muted-text small block">{s.timezone.replace(/_/g, ' ')}</span> : null}
                  </td>
                  <td className="mono">{s.ip || '—'}</td>
                  <td className="clip" title={s.user_agent}>{s.device || '—'}{s.locale ? <span className="muted-text small block">{s.locale}</span> : null}</td>
                  <td className="nowrap">{dateTime(s.first_seen)}</td>
                  <td className="nowrap">{ago(s.last_seen)}</td>
                  <td className="num">{fmt(s.hits)}</td>
                  <td>{s.ip ? <button className="link-btn danger-text" onClick={() => onBan(s.ip)}>Block</button> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty icon="key" title="No sign-ins recorded yet" body="They appear the next time this person opens the app." />
      )}
      <Card title="Other accounts on the same addresses">
        {d.shared_addresses.length ? (
          d.shared_addresses.map((o) => (
            <div key={o.id + o.ip} className="row flat" onClick={() => nav('/admin/people/' + o.id)} style={{ cursor: 'pointer' }}>
              <span className="row-text">
                <b>@{o.username}</b>
                <span className="mono">{o.ip}</span>
              </span>
            </div>
          ))
        ) : (
          <p className="muted-text small">None. Shared addresses can mean one person with several accounts, or simply a family or church Wi-Fi.</p>
        )}
      </Card>
    </>
  );
}

function PersonMoney({ d }: { d: Person360 }) {
  const spent = d.transactions.filter((t) => t.status === 'succeeded' && t.kind !== 'refund').reduce((a, t) => a + t.amount_pence, 0);
  const donated = d.donations.filter((t) => t.status === 'succeeded').reduce((a, t) => a + t.amount_pence, 0);
  return (
    <>
      <div className="stat-tiles">
        <Kpi label="Paid in total" value={pounds(spent)} />
        <Kpi label="Donated" value={pounds(donated)} sub={`${d.donations.length} donations`} />
        <Kpi label="Boosts bought" value={fmt(d.promotions.length)} />
        <Kpi label="Plus subscription" value={d.billing?.status ? String(d.billing.status) : 'None'} sub={d.billing?.current_period_end ? 'Renews ' + shortDate(d.billing.current_period_end) + (d.billing.cancel_at_period_end ? ' (cancelling)' : '') : undefined} />
      </div>
      <Card title="Transactions">
        <TxTable rows={d.transactions} />
      </Card>
      <div className="grid-2">
        <Card title="Donations">
          {d.donations.length ? d.donations.map((x) => (
            <div key={x.id} className="row flat">
              <span className="row-text">
                <b>{pounds(x.amount_pence, x.currency)}</b>
                <span>{x.fundraiser ?? 'Fundraiser'} · {x.status}</span>
              </span>
              <span className="muted-text small">{shortDate(x.created_at)}</span>
            </div>
          )) : <p className="muted-text small">None.</p>}
        </Card>
        <Card title="Fundraisers and boosts">
          {d.fundraisers.map((f) => (
            <div key={f.id} className="row flat">
              <span className="row-text">
                <b>{f.title}</b>
                <span>{pounds(f.raised_pence, f.currency)} of {pounds(f.goal_pence, f.currency)} · {f.status}</span>
              </span>
            </div>
          ))}
          {d.promotions.map((x) => (
            <div key={x.id} className="row flat">
              <span className="row-text">
                <b>Boost · {x.days} days</b>
                <span>{pounds(x.amount_pence, x.currency)} · {x.status}</span>
              </span>
              <span className="muted-text small">{shortDate(x.created_at)}</span>
            </div>
          ))}
          {!d.fundraisers.length && !d.promotions.length ? <p className="muted-text small">None.</p> : null}
        </Card>
      </div>
    </>
  );
}

function TxTable({ rows }: { rows: any[] }) {
  if (!rows.length) return <p className="muted-text small">No transactions.</p>;
  return (
    <table className="table compact">
      <thead>
        <tr>
          <th>Date</th>
          <th>Kind</th>
          <th>Status</th>
          <th>How</th>
          <th className="num">Amount</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((t) => (
          <tr key={t.id}>
            <td className="nowrap">{dateTime(t.created_at)}</td>
            <td>{t.kind}</td>
            <td>
              <span className={'pill status-' + t.status}>{t.status}</span>
            </td>
            <td>{t.provider === 'stripe' ? t.method || 'Card' : 'Recorded by an admin'}</td>
            <td className="num">{(t.kind === 'refund' ? '−' : '') + pounds(t.amount_pence, t.currency)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PersonSafety({ d }: { d: Person360 }) {
  return (
    <div className="grid-2">
      <Card title="Reports">
        {d.reports.length ? d.reports.map((r) => (
          <div key={r.id} className="row flat">
            <span className="row-text wrap">
              <b>{r.reason}</b>
              <span>
                {r.reporter_id === d.profile.id ? 'They reported @' + r.reported_username : 'Reported by @' + r.reporter_username} · {r.status}
              </span>
            </span>
            <span className="muted-text small">{ago(r.created_at)}</span>
          </div>
        )) : <p className="muted-text small">No reports.</p>}
      </Card>
      <Card title="Security alerts">
        {d.alerts.length ? d.alerts.map((e) => (
          <div key={e.id} className="row flat">
            <Severity s={e.severity} />
            <span className="row-text wrap">
              <b>{EVENT_LABEL[e.kind] ?? e.kind}</b>
              <span>{e.detail}{e.resolved_at ? ' · resolved' : ''}</span>
            </span>
            <span className="muted-text small">{ago(e.created_at)}</span>
          </div>
        )) : <p className="muted-text small">No alerts.</p>}
      </Card>
      <Card title="Suspensions">
        {d.bans.length ? d.bans.map((b) => (
          <div key={b.id} className="row flat">
            <span className="row-text wrap">
              <b>{b.until ? 'Until ' + shortDate(b.until) : 'Open-ended'}</b>
              <span>{b.reason || 'No reason given'}{b.lifted_at ? ' · lifted ' + shortDate(b.lifted_at) : ' · active'}</span>
            </span>
            <span className="muted-text small">{shortDate(b.created_at)}</span>
          </div>
        )) : <p className="muted-text small">Never suspended.</p>}
      </Card>
      <Card title="What admins did">
        {d.audit.length ? d.audit.map((a, i) => (
          <div key={i} className="row flat">
            <span className="row-text wrap">
              <b>{a.action.replace('_', ' ')}</b>
              <span>{a.admin ? 'by @' + a.admin : 'by the system'}{a.detail ? ' · ' + a.detail : ''}</span>
            </span>
            <span className="muted-text small">{ago(a.at)}</span>
          </div>
        )) : <p className="muted-text small">Nothing yet.</p>}
      </Card>
    </div>
  );
}

function PersonSupport({ d }: { d: Person360 }) {
  return (
    <div className="grid-2">
      <Card title="Support requests">
        {d.support.length ? d.support.map((t) => (
          <div key={t.id} className="row flat">
            <span className="row-text wrap">
              <b>{t.subject}</b>
              <span>{t.status} · {shortDate(t.created_at)}</span>
            </span>
          </div>
        )) : <p className="muted-text small">None.</p>}
      </Card>
      <Card title="Tick and Plus requests">
        {d.requests.length ? d.requests.map((q) => (
          <div key={q.id} className="row flat">
            <span className="row-text wrap">
              <b>{q.kind === 'verify' ? 'Verified tick' : 'Plus'}</b>
              <span>{q.status} · {shortDate(q.created_at)}</span>
            </span>
          </div>
        )) : <p className="muted-text small">None.</p>}
      </Card>
      <Card title="Communities and pages">
        {d.groups.length ? d.groups.map((g) => (
          <div key={g.id} className="row flat" onClick={() => nav('/groups/' + g.id)} style={{ cursor: 'pointer' }}>
            <span className="row-text">
              <b>{g.name}</b>
              <span>{g.kind} · {g.status === 'pending' ? 'asked to join' : g.role}</span>
            </span>
          </div>
        )) : <p className="muted-text small">None.</p>}
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ search */

export function SearchAll() {
  const [q, setQ] = useState('');
  const [needle, setNeedle] = useState('');
  const res = useLoad(() => (needle.length >= 2 ? adminSearch(needle) : Promise.resolve(null)), [needle]);
  const r = res.data;
  const groups: { key: string; title: string; icon: IconName; rows: any[]; render: (x: any) => React.ReactNode; go: (x: any) => void }[] = r ? [
    { key: 'people', title: 'People', icon: 'users', rows: r.people ?? [], go: (x) => nav('/admin/people/' + x.id), render: (x) => <><b>@{x.username}</b> <span>{x.full_name}{x.email ? ' · ' + x.email : ''}{x.suspended ? ' · suspended' : ''}{x.closed ? ' · closing' : ''}</span></> },
    { key: 'addresses', title: 'Addresses and devices', icon: 'globe', rows: r.addresses ?? [], go: (x) => nav('/admin/people/' + x.user_id), render: (x) => <><b className="mono">{x.ip}</b> <span>@{x.username} · {flag(x.country)} {countryName(x.country)} · {PLATFORM_LABEL[x.platform] ?? x.platform} · {ago(x.last_seen)}</span></> },
    { key: 'posts', title: 'Posts', icon: 'image', rows: r.posts ?? [], go: (x) => nav('/p/' + x.id), render: (x) => <><b>@{x.username}</b> <span>{x.caption}</span></> },
    { key: 'comments', title: 'Comments', icon: 'comment', rows: r.comments ?? [], go: (x) => nav('/p/' + x.post_id), render: (x) => <><b>@{x.username}</b> <span>{x.text}</span></> },
    { key: 'transactions', title: 'Transactions', icon: 'receipt', rows: r.transactions ?? [], go: (x) => (x.user_id ? nav('/admin/people/' + x.user_id) : nav('/admin/money')), render: (x) => <><b>{pounds(x.amount_pence, x.currency)}</b> <span>{x.kind} · {x.status} · {x.username ? '@' + x.username : 'no member'} · {shortDate(x.created_at)}</span></> },
    { key: 'tickets', title: 'Support', icon: 'lifebuoy', rows: r.tickets ?? [], go: () => nav('/admin/support/requests'), render: (x) => <><b>{x.subject}</b> <span>@{x.username} · {x.status}</span></> },
    { key: 'groups', title: 'Communities and pages', icon: 'people', rows: r.groups ?? [], go: (x) => nav('/groups/' + x.id), render: (x) => <><b>{x.name}</b> <span>@{x.handle} · {x.kind}</span></> },
    { key: 'churches', title: 'Churches', icon: 'church', rows: r.churches ?? [], go: () => nav('/admin/churches'), render: (x) => <><b>{x.name}</b> <span>{[x.city, x.country].filter(Boolean).join(', ')} · {x.status}</span></> },
    { key: 'fundraisers', title: 'Fundraisers', icon: 'heart', rows: r.fundraisers ?? [], go: () => nav('/admin/money'), render: (x) => <><b>{x.title}</b> <span>{x.status}</span></> },
  ] : [];
  const hits = groups.reduce((a, g) => a + g.rows.length, 0);
  return (
    <div className="admin-wide">
      <h1 className="page-title">Search everything</h1>
      <form className="panel-search in-modal flat big" onSubmit={(e) => { e.preventDefault(); setNeedle(q.trim()); }}>
        <Icon name="search" size={18} />
        <input autoFocus placeholder="People, emails, phone numbers, IP addresses, posts, comments, payments, Stripe IDs, tickets, churches…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search everything" />
      </form>
      {res.loading ? <Spinner /> : res.error ? <Problem error={res.error} retry={res.reload} /> : r && !hits ? <Empty icon="search" title="Nothing found" body={'No matches for “' + needle + '”.'} /> : null}
      {groups.filter((g) => g.rows.length).map((g) => (
        <Card key={g.key} title={<><Icon name={g.icon} size={16} /> {g.title} <span className="muted-text">{g.rows.length}</span></>}>
          {g.rows.map((x, i) => (
            <div key={i} className="row flat result" onClick={() => g.go(x)}>
              <span className="row-text wrap inline">{g.render(x)}</span>
              <Icon name="right" size={14} />
            </div>
          ))}
        </Card>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ security */

export function Security() {
  const { me } = useMe();
  const s = useLoad(() => fetchSecurity(), []);
  const words = useLoad(() => fetchBlockedWords(), []);
  const [ip, setIp] = useState('');
  const [why, setWhy] = useState('');
  const [word, setWord] = useState('');
  const [showResolved, setShowResolved] = useState(false);
  if (s.loading && !s.data) return <Spinner />;
  if (s.error) return <div className="admin-wide"><h1 className="page-title">Security</h1><Problem error={s.error} retry={s.reload} /></div>;
  const d = s.data!;
  const open = d.events.filter((e) => !e.resolved_at);
  const events = showResolved ? d.events : open;
  const unprotected = d.tables.filter((t) => !t.rls);
  return (
    <div className="admin-wide xl">
      <div className="dash-head">
        <div>
          <h1 className="page-title">Security</h1>
          <p className="muted-text small">Alerts, suspicious behaviour, blocked addresses and database protection.</p>
        </div>
        <button className="btn quiet small" onClick={s.reload}>Refresh</button>
      </div>
      <div className="stat-tiles kpis">
        <Kpi label="High alerts" value={d.open_by_severity.high} tone={d.open_by_severity.high ? 'bad' : 'good'} sub={`${d.open_by_severity.medium} medium · ${d.open_by_severity.low} low`} />
        <Kpi label="Live warnings" value={d.flags.length} sub="Bursts, heavy reports, blocks" tone={d.flags.length ? 'warn' : 'good'} />
        <Kpi label="Suspended" value={d.suspended.length} />
        <Kpi label="Blocked addresses" value={d.ip_bans.length} />
        <Kpi label="Shared addresses" value={d.shared_addresses.length} sub="3 or more accounts on one address" />
        <Kpi label="Tables protected" value={`${d.tables.length - unprotected.length}/${d.tables.length}`} tone={unprotected.length ? 'bad' : 'good'} sub={unprotected.length ? unprotected.map((t) => t.name).join(', ') : 'Row-level security on every table'} />
        <Kpi label="Members under 14" value={d.minors} sub="Private by default, no DMs from strangers" />
        <Kpi label="Blocked words" value={d.blocked_words} sub={`${d.sensitive_posts} posts marked sensitive`} />
      </div>

      <Card
        title={<>Alerts {open.length ? <span className="pill danger">{open.length} open</span> : null}</>}
        actions={
          <div className="head-tools">
            <label className="check-label"><input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} /> Show resolved</label>
            {open.length ? <button className="btn quiet small" onClick={() => resolveAllEvents(me.id).then(s.reload, toastError)}>Resolve all</button> : null}
          </div>
        }
      >
        {events.length ? (
          <table className="table compact">
            <tbody>
              {events.map((e) => (
                <tr key={e.id} className={e.resolved_at ? 'dim' : ''} onClick={e.user_id ? () => nav('/admin/people/' + e.user_id) : undefined}>
                  <td><Severity s={e.severity} /></td>
                  <td>
                    <b>{EVENT_LABEL[e.kind] ?? e.kind}</b>
                    <span className="muted-text small block">{e.detail}</span>
                  </td>
                  <td>{e.username ? '@' + e.username : '—'}</td>
                  <td className="mono">{e.ip || ''}</td>
                  <td className="nowrap">{ago(e.created_at)}</td>
                  <td onClick={(ev) => ev.stopPropagation()}>
                    {!e.resolved_at ? <button className="link-btn" onClick={() => resolveEvent(e.id, me.id).then(s.reload, toastError)}>Resolve</button> : <span className="muted-text small">Resolved</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted-text small">No open alerts. New-country sign-ins, unusual numbers of addresses and blocked-address sign-ins land here.</p>
        )}
      </Card>

      <div className="grid-2">
        <Card title="Live warnings">
          {d.flags.length ? d.flags.map((f, i) => (
            <div key={i} className="row flat" onClick={() => nav('/admin/people/' + f.user_id)} style={{ cursor: 'pointer' }}>
              <span className="pill sev-medium"><Icon name="pulse" size={12} /> {EVENT_LABEL[f.kind] ?? f.kind}</span>
              <span className="row-text wrap"><span>{f.detail}</span></span>
              <Icon name="right" size={14} />
            </div>
          )) : <p className="muted-text small">Nothing unusual in the last day.</p>}
        </Card>
        <Card title="Addresses shared by several accounts">
          {d.shared_addresses.length ? d.shared_addresses.map((x) => (
            <div key={x.ip} className="row flat">
              <span className="row-text wrap">
                <b className="mono">{x.ip}</b>
                <span>{x.accounts} accounts: {x.usernames.map((u) => '@' + u).join(', ')}</span>
              </span>
              <button className="link-btn danger-text" onClick={() => banAddress(x.ip, 'Shared by ' + x.accounts + ' accounts', me.id).then(s.reload, toastError)}>Block</button>
            </div>
          )) : <p className="muted-text small">None.</p>}
        </Card>
      </div>

      <div className="grid-2">
        <Card title="Blocked addresses">
          <form className="inline-form" onSubmit={(e) => { e.preventDefault(); if (ip.trim()) banAddress(ip, why, me.id).then(() => { setIp(''); setWhy(''); s.reload(); toast('Address blocked'); }, toastError); }}>
            <input placeholder="IP address or range, e.g. 203.0.113.7 or 203.0.113.0/24" value={ip} onChange={(e) => setIp(e.target.value)} aria-label="Address to block" />
            <input placeholder="Reason" value={why} onChange={(e) => setWhy(e.target.value)} aria-label="Reason" />
            <button className="btn small" disabled={!ip.trim()}>Block</button>
          </form>
          <p className="muted-text small">Anyone who opens the app from a blocked address is suspended automatically and an alert is raised.</p>
          {d.ip_bans.map((b) => (
            <div key={b.ip} className="row flat">
              <span className="row-text">
                <b className="mono">{b.ip}</b>
                <span>{b.reason || 'No reason'} · {shortDate(b.created_at)}</span>
              </span>
              <button className="link-btn" onClick={() => unbanAddress(b.ip).then(s.reload, toastError)}>Unblock</button>
            </div>
          ))}
        </Card>
        <Card title="Suspended accounts">
          {d.suspended.length ? d.suspended.map((x) => (
            <div key={x.id} className="row flat">
              <span className="row-text wrap" onClick={() => nav('/admin/people/' + x.id)} style={{ cursor: 'pointer' }}>
                <b>@{x.username}</b>
                <span>{x.until ? 'Until ' + shortDate(x.until) : 'Until lifted'}{x.note ? ' · ' + x.note : ''}</span>
              </span>
              <button className="link-btn" onClick={() => act(x.id, 'unsuspend').then(s.reload, toastError)}>Lift</button>
            </div>
          )) : <p className="muted-text small">Nobody is suspended.</p>}
        </Card>
      </div>

      <div className="grid-2">
        <Card title="Admin accounts">
          <table className="table compact">
            <thead>
              <tr>
                <th>Admin</th>
                <th>Role</th>
                <th>Last seen</th>
                <th className="num">Actions this week</th>
              </tr>
            </thead>
            <tbody>
              {d.admins.map((a) => (
                <tr key={a.id} onClick={() => nav('/admin/people/' + a.id)}>
                  <td>@{a.username}</td>
                  <td>{a.role}</td>
                  <td>{a.last_seen ? ago(a.last_seen) : '—'}</td>
                  <td className="num">{a.actions_week}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card title="Blocked words">
          <form className="inline-form" onSubmit={(e) => { e.preventDefault(); if (word.trim()) addBlockedWord(word).then(() => { setWord(''); words.reload(); s.reload(); }, toastError); }}>
            <input placeholder="Add a word to hide in captions and comments" value={word} onChange={(e) => setWord(e.target.value)} aria-label="Blocked word" />
            <button className="btn small" disabled={!word.trim()}>Add</button>
          </form>
          <div className="chips">
            {(words.data ?? []).map((w) => (
              <span key={w.word} className="pill word">
                {w.word}
                <button aria-label={'Remove ' + w.word} onClick={() => removeBlockedWord(w.word).then(words.reload, toastError)}><Icon name="close" size={12} /></button>
              </span>
            ))}
          </div>
        </Card>
      </div>

      <Card title="Database protection">
        <p className="muted-text small">Every table should have row-level security on, so the app can only read and change what each person is allowed to.</p>
        <div className="rls-grid">
          {d.tables.map((t) => (
            <span key={t.name} className={'rls ' + (t.rls ? 'on' : 'off')} title={t.policies + ' rules'}>
              <Icon name={t.rls ? 'lock' : 'flag'} size={12} /> {t.name.replace('community_', '')}
            </span>
          ))}
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ money */

export function MoneyHub({ Transactions }: { Transactions: React.ComponentType }) {
  const [tab, setTab] = useState('overview');
  const [days, setDays] = useState(30);
  const m = useLoad(() => fetchMoney(days), [days]);
  const a = useLoad(() => fetchAnalytics(days).catch(() => null), [days]);
  const d = m.data;
  return (
    <div className="admin-wide xl">
      <div className="dash-head">
        <h1 className="page-title">Money</h1>
        <Seg value={days} onChange={setDays} options={[{ v: 7, label: '7 days' }, { v: 30, label: '30 days' }, { v: 90, label: '90 days' }, { v: 365, label: 'Year' }]} />
      </div>
      <div className="seg left tabs-line">
        {[['overview', 'Overview'], ['transactions', 'Transactions'], ['donations', 'Donations'], ['fundraisers', 'Fundraisers'], ['boosts', 'Boosts'], ['subscriptions', 'Subscriptions']].map(([id, label]) => (
          <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      {tab === 'transactions' ? <Transactions /> : m.error ? <Problem error={m.error} retry={m.reload} /> : !d ? <Spinner /> : tab === 'overview' ? (
        <>
          <div className="stat-tiles kpis">
            <Kpi label="Income" value={a.data ? pounds(a.data.totals.revenue_pence) : '—'} spark={a.data?.series.map((x) => x.revenue_pence)} />
            <Kpi label="Donations" value={a.data ? pounds(a.data.totals.donations_pence) : '—'} sub={`${d.fundraisers.filter((f) => f.status === 'active').length} fundraisers running`} />
            <Kpi label="Boosts" value={a.data ? pounds(a.data.totals.boosts_pence) : '—'} sub={`${d.promotions.filter((p) => p.status === 'active').length} running now`} />
            <Kpi label="Subscribers" value={d.subscriptions.filter((s) => s.status === 'active' || s.status === 'trialing').length} />
            <Kpi label="Failed payments" value={d.failed} tone={d.failed ? 'warn' : undefined} />
            <Kpi label="Refunded" value={pounds(d.refunded_pence)} />
          </div>
          {a.data ? (
            <Card title="Income per day">
              <ColumnChart data={a.data.series.map((x) => ({ x: x.d, y: x.revenue_pence }))} format={(n) => pounds(n).replace('.00', '')} name="Income" color={SERIES[2]} />
            </Card>
          ) : null}
          <div className="grid-3">
            <Card title="By kind">
              <Donut slices={(a.data?.revenue_kinds ?? []).map((k) => ({ label: k.label, value: k.value }))} format={(n) => pounds(n).replace('.00', '')} name="By kind" />
            </Card>
            <Card title="By payment method">
              <Donut slices={d.by_method} format={(n) => pounds(n).replace('.00', '')} name="By method" />
            </Card>
            <Card title="Payment results">
              <Donut slices={d.by_status} name="By status" />
            </Card>
          </div>
          <Card title="Top supporters">
            <HBars items={d.top_payers.map((p) => ({ key: p.user_id, label: '@' + p.username, value: p.total, onClick: () => nav('/admin/people/' + p.user_id) }))} format={(n) => pounds(n)} color={SERIES[2]} empty="No payments yet." />
          </Card>
        </>
      ) : tab === 'donations' ? (
        <Card actions={<button className="btn quiet small" disabled={!d.donations.length} onClick={() => downloadCsv('donations.csv', d.donations)}>Export CSV</button>}>
          {d.donations.length ? (
            <table className="table compact">
              <thead>
                <tr><th>Date</th><th>Donor</th><th>Fundraiser</th><th>Message</th><th>Status</th><th className="num">Amount</th></tr>
              </thead>
              <tbody>
                {d.donations.map((x) => (
                  <tr key={x.id} onClick={x.donor_id ? () => nav('/admin/people/' + x.donor_id) : undefined}>
                    <td className="nowrap">{dateTime(x.created_at)}</td>
                    <td>{x.anonymous ? <span className="muted-text">Anonymous{x.donor ? ' (@' + x.donor + ')' : ''}</span> : x.donor ? '@' + x.donor : '—'}</td>
                    <td>{x.fundraiser ?? '—'}</td>
                    <td className="clip">{x.message}</td>
                    <td><span className={'pill status-' + x.status}>{x.status}</span></td>
                    <td className="num">{pounds(x.amount_pence, x.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <Empty icon="heart" title="No donations yet" />}
        </Card>
      ) : tab === 'fundraisers' ? (
        <div className="cards">
          {d.fundraisers.length ? d.fundraisers.map((f) => (
            <Card key={f.id}>
              <div className="fund">
                {f.cover_url ? <img src={f.cover_url} alt="" /> : null}
                <div className="grow">
                  <b>{f.title}</b>
                  <p className="muted-text small">by @{f.username} · {f.donor_count} donors · {f.status}{f.ends_at ? ' · ends ' + shortDate(f.ends_at) : ''}</p>
                  <div className="progress"><span style={{ width: Math.min(100, (f.raised_pence / Math.max(1, f.goal_pence)) * 100) + '%' }} /></div>
                  <p className="small">{pounds(f.raised_pence, f.currency)} of {pounds(f.goal_pence, f.currency)}</p>
                </div>
                {f.status === 'active' ? <button className="btn danger-outline small" onClick={async () => { if (await ask('Close “' + f.title + '”?', 'It stops taking donations.', 'Close')) closeFundraiser(f.id).then(m.reload, toastError); }}>Close</button> : null}
              </div>
            </Card>
          )) : <Empty icon="heart" title="No fundraisers yet" />}
        </div>
      ) : tab === 'boosts' ? (
        <Card>
          {d.promotions.length ? (
            <table className="table compact">
              <thead>
                <tr><th>Bought</th><th>By</th><th>Post</th><th>Days</th><th>Status</th><th>Ends</th><th className="num">Paid</th><th /></tr>
              </thead>
              <tbody>
                {d.promotions.map((x) => (
                  <tr key={x.id} onClick={() => nav('/p/' + x.post_id)}>
                    <td className="nowrap">{shortDate(x.created_at)}</td>
                    <td>@{x.username}</td>
                    <td className="clip">{x.caption || '—'}</td>
                    <td>{x.days}</td>
                    <td><span className={'pill status-' + x.status}>{x.status}</span></td>
                    <td className="nowrap">{shortDate(x.ends_at)}</td>
                    <td className="num">{pounds(x.amount_pence, x.currency)}</td>
                    <td onClick={(e) => e.stopPropagation()}>{x.status === 'active' ? <button className="link-btn danger-text" onClick={() => endPromotion(x.id).then(m.reload, toastError)}>End</button> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <Empty icon="boost" title="No boosts yet" />}
        </Card>
      ) : (
        <Card>
          {d.subscriptions.length ? (
            <table className="table compact">
              <thead>
                <tr><th>Member</th><th>Status</th><th>Renews</th><th>Payouts</th></tr>
              </thead>
              <tbody>
                {d.subscriptions.map((x) => (
                  <tr key={x.user_id} onClick={() => nav('/admin/people/' + x.user_id)}>
                    <td>@{x.username}</td>
                    <td><span className={'pill status-' + x.status}>{x.status ?? '—'}</span>{x.cancel_at_period_end ? <span className="pill warn">cancelling</span> : null}</td>
                    <td>{shortDate(x.current_period_end)}</td>
                    <td>{x.payouts_enabled ? 'Connected' : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <Empty icon="card" title="No subscriptions yet" />}
        </Card>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ content */

export function Content() {
  const [kind, setKind] = useState<'posts' | 'comments' | 'stories' | 'live'>('posts');
  const [q, setQ] = useState('');
  const [needle, setNeedle] = useState('');
  const list = useLoad(() => (kind === 'live' ? fetchLivesNow() : fetchRecentContent(kind, needle)), [kind, needle]);
  const ids = useMemo(() => (list.data ?? []).map((x: any) => x.user_id), [list.data]);
  const names = useLoad(() => usernames(ids), [ids.join(',')]);
  const who = (id: string) => (names.data?.[id] ? '@' + names.data[id] : '…');
  const remove = async (id: string) => {
    if (kind === 'live') return;
    if (!(await ask('Remove this ' + kind.slice(0, -1) + '?', 'It disappears for everyone. This is written to the audit log.', 'Remove'))) return;
    removeContent(kind, id).then(() => { toast('Removed'); list.reload(); }, toastError);
  };
  return (
    <div className="admin-wide xl">
      <div className="dash-head">
        <h1 className="page-title">Content</h1>
        <Seg value={kind} onChange={(k) => { setKind(k); setNeedle(''); setQ(''); }} options={[{ v: 'posts', label: 'Posts and Shorts' }, { v: 'comments', label: 'Comments' }, { v: 'stories', label: 'Stories' }, { v: 'live', label: 'Live now' }]} />
      </div>
      {kind === 'posts' || kind === 'comments' ? (
        <form className="panel-search in-modal flat" onSubmit={(e) => { e.preventDefault(); setNeedle(q); }}>
          <input placeholder={'Search ' + kind + ', then press Return'} value={q} onChange={(e) => setQ(e.target.value)} aria-label={'Search ' + kind} />
        </form>
      ) : null}
      {list.loading ? <Spinner /> : list.error ? <Failed error={list.error} retry={list.reload} /> : !list.data?.length ? <Empty icon={kind === 'live' ? 'live' : 'image'} title={kind === 'live' ? 'Nobody is live' : 'Nothing here'} /> : null}
      {kind === 'posts' || kind === 'stories' ? (
        <div className="mod-grid">
          {(list.data ?? []).map((x: any) => {
            const media = kind === 'posts' ? x.media?.[0] : x.item;
            const src = media ? (media.type === 'video' ? media.poster || '' : media.url) : '';
            return (
              <div key={x.id} className="mod-tile">
                <button className="thumb" onClick={() => (kind === 'posts' ? nav('/p/' + x.id) : undefined)}>
                  {src ? <img src={src} alt="" /> : <span className="ph">{media?.overlays?.[0]?.text ?? ''}</span>}
                  {x.sensitive ? <span className="pill warn tag">Sensitive</span> : null}
                  {x.kind === 'reel' ? <span className="pill tag">Short</span> : null}
                </button>
                <div className="mod-meta">
                  <button className="link-btn" onClick={() => nav('/admin/people/' + x.user_id)}>{who(x.user_id)}</button>
                  <span className="muted-text small">{ago(x.created_at)}</span>
                  <button className="icon-btn" aria-label="Remove" onClick={() => remove(x.id)}><Icon name="trash" size={16} /></button>
                </div>
                {x.caption ? <p className="small clamp2">{x.caption}</p> : null}
              </div>
            );
          })}
        </div>
      ) : kind === 'comments' ? (
        (list.data ?? []).map((c: any) => (
          <div key={c.id} className="row flat">
            <span className="row-text wrap">
              <b onClick={() => nav('/admin/people/' + c.user_id)} style={{ cursor: 'pointer' }}>{who(c.user_id)}</b>
              <span>{c.text}</span>
            </span>
            <span className="muted-text small nowrap">{ago(c.created_at)}</span>
            <button className="link-btn" onClick={() => nav('/p/' + c.post_id)}>Post</button>
            <button className="icon-btn" aria-label="Remove" onClick={() => remove(c.id)}><Icon name="trash" size={16} /></button>
          </div>
        ))
      ) : (
        (list.data ?? []).map((l: any) => (
          <div key={l.id} className="row flat">
            <Avatar src={l.avatar_url} name={l.username || '?'} size={40} ring="live" />
            <span className="row-text">
              <b>@{l.username}</b>
              <span>{l.title || 'Live'} · {l.viewers ?? 0} watching · started {ago(l.started_at)}</span>
            </span>
            <button className="btn quiet small" onClick={() => nav('/live/' + l.id)}>Watch</button>
            <button className="btn danger-outline small" onClick={async () => { if (await ask('End @' + l.username + "'s live?", 'Everyone watching is disconnected.', 'End live')) endLive(l.id).then(list.reload, toastError); }}>End</button>
          </div>
        ))
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ announcements */

export function Announcements() {
  const { me } = useMe();
  const list = useLoad(() => fetchAnnouncements(), []);
  const [form, setForm] = useState({ title: '', body: '', level: 'info' as 'info' | 'warning' | 'success', days: 7 });
  const nowIso = new Date().toISOString();
  return (
    <div className="admin-wide">
      <h1 className="page-title">Announcements</h1>
      <p className="muted-text">A banner at the top of the app for everyone: service times, maintenance, events.</p>
      {list.error ? <Problem error={list.error} retry={list.reload} /> : (
        <>
          <Card title="New announcement">
            <div className="form-pad flat">
              <label className="form-row"><span>Title</span><input maxLength={120} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Camp meeting registration is open" /></label>
              <label className="form-row"><span>Details (optional)</span><textarea rows={3} maxLength={1000} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></label>
              <div className="form-2">
                <label className="form-row">
                  <span>Style</span>
                  <select value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value as any })}>
                    <option value="info">Information</option>
                    <option value="success">Good news</option>
                    <option value="warning">Warning</option>
                  </select>
                </label>
                <label className="form-row">
                  <span>Show for</span>
                  <select value={form.days} onChange={(e) => setForm({ ...form, days: Number(e.target.value) })}>
                    <option value={1}>1 day</option>
                    <option value={7}>1 week</option>
                    <option value={30}>1 month</option>
                    <option value={0}>Until I end it</option>
                  </select>
                </label>
              </div>
              <button
                className="btn"
                disabled={!form.title.trim()}
                onClick={() => saveAnnouncement({ title: form.title, body: form.body, level: form.level, ends_at: form.days ? new Date(Date.now() + form.days * 86400e3).toISOString() : null }, me.id).then(() => { setForm({ ...form, title: '', body: '' }); list.reload(); toast('Announcement published'); }, toastError)}
              >
                Publish
              </button>
            </div>
          </Card>
          {list.loading ? <Spinner /> : (list.data ?? []).map((a) => {
            const live = a.starts_at <= nowIso && (!a.ends_at || a.ends_at > nowIso);
            return (
              <section key={a.id} className={'announce preview ' + a.level}>
                <div className="grow">
                  <b>{a.title}</b>
                  {a.body ? <p>{a.body}</p> : null}
                  <p className="muted-text small">{live ? 'Showing now' : 'Ended'} · {shortDate(a.created_at)}{a.ends_at ? ' → ' + shortDate(a.ends_at) : ''}</p>
                </div>
                {live ? <button className="btn quiet small" onClick={() => endAnnouncement(a.id).then(list.reload, toastError)}>End now</button> : null}
                <button className="icon-btn" aria-label="Delete" onClick={() => deleteAnnouncement(a.id).then(list.reload, toastError)}><Icon name="trash" size={16} /></button>
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ audit log */

export function AuditLog() {
  const list = useLoad(() => fetchAudit(500), []);
  const [action, setAction] = useState('all');
  const ids = useMemo(() => (list.data ?? []).flatMap((r) => [r.admin_id ?? '', r.target_user ?? '']), [list.data]);
  const names = useLoad(() => usernames(ids), [ids.join(',')]);
  const n = (id: string | null) => (id ? (names.data?.[id] ? '@' + names.data[id] : id === 'system' ? 'System' : '…') : 'System');
  const actions = [...new Set((list.data ?? []).map((r) => r.action))];
  const rows = (list.data ?? []).filter((r) => action === 'all' || r.action === action);
  return (
    <div className="admin-wide xl">
      <div className="dash-head">
        <div>
          <h1 className="page-title">Audit log</h1>
          <p className="muted-text small">Every change an admin makes to an account, from the iPhone or the desktop, written down and kept.</p>
        </div>
        <div className="head-tools">
          <select className="select" value={action} onChange={(e) => setAction(e.target.value)} aria-label="Filter by action">
            <option value="all">All actions</option>
            {actions.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <button className="btn quiet small" disabled={!rows.length} onClick={() => downloadCsv('audit-log.csv', rows.map((r) => ({ ...r, admin: n(r.admin_id), target: n(r.target_user) })))}>Export CSV</button>
        </div>
      </div>
      {list.loading ? <Spinner /> : list.error ? <Problem error={list.error} retry={list.reload} /> : !rows.length ? <Empty icon="gavel" title="Nothing yet" body="Suspensions, ticks, Plus, closures and deletions appear here." /> : (
        <table className="table compact">
          <thead>
            <tr><th>When</th><th>Admin</th><th>Action</th><th>Account</th><th>Details</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} onClick={r.target_user ? () => nav('/admin/people/' + r.target_user) : undefined}>
                <td className="nowrap">{dateTime(r.created_at)}</td>
                <td>{n(r.admin_id)}</td>
                <td><span className="pill">{r.action.replace('_', ' ')}</span></td>
                <td>{n(r.target_user)}</td>
                <td className="clip">{r.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ system */

export function SystemPage() {
  const s = useLoad(() => fetchSystem(), []);
  if (s.loading && !s.data) return <Spinner />;
  if (s.error) return <div className="admin-wide"><h1 className="page-title">System</h1><Problem error={s.error} retry={s.reload} /></div>;
  const d = s.data!;
  const files = d.storage.reduce((a, b) => a + b.files, 0);
  const stored = d.storage.reduce((a, b) => a + b.bytes, 0);
  const failing = d.jobs.filter((j) => j.failures_day > 0 || j.last_status === 'failed');
  return (
    <div className="admin-wide xl">
      <div className="dash-head">
        <h1 className="page-title">System</h1>
        <button className="btn quiet small" onClick={s.reload}>Refresh</button>
      </div>
      <div className="stat-tiles kpis">
        <Kpi label="Database size" value={bytes(d.database_bytes)} />
        <Kpi label="Photos, videos and audio" value={bytes(stored)} sub={fmt(files) + ' files'} />
        <Kpi label="Connections" value={d.connections} />
        <Kpi label="Scheduled jobs" value={d.jobs.length} sub={failing.length ? failing.length + ' failing' : 'All healthy'} tone={failing.length ? 'bad' : 'good'} />
        <Kpi label="Waiting to be deleted" value={d.purge_queue} sub="Accounts whose files are being removed" />
      </div>
      <div className="grid-2">
        <Card title="Largest tables">
          <HBars items={d.tables.slice(0, 15).map((t) => ({ key: t.name, label: t.name.replace('community_', ''), value: t.bytes }))} format={bytes} color={SERIES[6]} />
        </Card>
        <Card title="Rows per table">
          <HBars items={[...d.tables].sort((a, b) => b.rows - a.rows).slice(0, 15).map((t) => ({ key: t.name, label: t.name.replace('community_', ''), value: t.rows }))} color={SERIES[0]} />
        </Card>
      </div>
      <Card title="Scheduled jobs">
        <table className="table compact">
          <thead>
            <tr><th>Job</th><th>Schedule</th><th>Last run</th><th>Result</th><th className="num">Failures today</th></tr>
          </thead>
          <tbody>
            {d.jobs.map((j) => (
              <tr key={j.name}>
                <td>{j.name.replace('community-', '').replace(/-/g, ' ')}</td>
                <td className="mono">{j.schedule}</td>
                <td>{j.last_run ? ago(j.last_run) : 'Not yet'}</td>
                <td>{j.last_status ? <span className={'pill status-' + (j.last_status === 'succeeded' ? 'succeeded' : 'failed')}>{j.last_status}</span> : '—'}</td>
                <td className={'num' + (j.failures_day ? ' bad' : '')}>{j.failures_day}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card title="Storage">
        {d.storage.map((b) => (
          <div key={b.bucket} className="row flat">
            <span className="row-text"><b>{b.bucket}</b><span>{fmt(b.files)} files</span></span>
            <b>{bytes(b.bytes)}</b>
          </div>
        ))}
      </Card>
    </div>
  );
}

