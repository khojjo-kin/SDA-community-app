// The demo build's stand-in for the admin CRM functions (community_admin_people, _user, _search,
// _analytics, _security, _money, _system, _act, _queue, _touch_session) and their sample tables.
// The numbers are invented, generated the same way on every load so the charts look settled.
type Row = Record<string, any>;

export type Ctx = {
  T: (name: string) => Row[];
  profile: (id: string) => Row;
  insertRow: (table: string, row: Row) => Row;
  me: () => string;
};

const H = 3600e3;
const ago = (hours: number) => new Date(Date.now() - hours * H).toISOString();
const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** A repeatable 0..1 number from a string. */
function rnd(key: string) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

export function adminSeed(): Record<string, Row[]> {
  const sessions: Row[] = [];
  let n = 0;
  const s = (user_id: string, platform: string, ip: string, country: string, timezone: string, hours: number, firstDays: number, extra: Row = {}) =>
    sessions.push({
      id: 'ses' + ++n, user_id, platform, ip, country, timezone, locale: country === 'GB' ? 'en-GB' : 'en', app_version: platform === 'ios' ? '1.0 (42)' : '0.4.0',
      device: platform === 'ios' ? 'iPhone 15' : platform === 'mac' ? 'MacIntel' : 'MacIntel', user_agent: platform === 'web' ? 'Mozilla/5.0 (Macintosh) Safari' : '',
      first_seen: ago(firstDays * 24), last_seen: ago(hours), hits: 3 + Math.round(rnd(user_id + ip) * 90), ...extra,
    });
  s('demo_me', 'mac', '81.2.69.160', 'GB', 'Europe/London', 0.05, 40);
  s('demo_me', 'ios', '81.2.69.160', 'GB', 'Europe/London', 3, 80);
  s('u_grace', 'ios', '41.66.200.12', 'GH', 'Africa/Accra', 0.2, 70);
  s('u_grace', 'mac', '41.66.200.12', 'GH', 'Africa/Accra', 30, 20);
  s('u_daniel', 'ios', '41.66.201.40', 'GH', 'Africa/Accra', 5, 60);
  s('u_ruth', 'ios', '86.12.4.77', 'GB', 'Europe/London', 26, 50);
  s('u_samuel', 'ios', '102.176.9.3', 'GH', 'Africa/Accra', 2, 45);
  s('u_samuel', 'web', '102.176.9.3', 'GH', 'Africa/Accra', 9, 10);
  s('u_esther', 'ios', '73.15.122.9', 'US', 'America/New_York', 12, 35);
  s('u_joseph', 'ios', '41.66.200.12', 'GH', 'Africa/Accra', 50, 65);
  s('u_joseph', 'ios', '185.220.101.4', 'DE', 'Europe/Berlin', 49, 2);
  s('u_kwame', 'ios', '197.210.53.8', 'NG', 'Africa/Lagos', 1, 3);
  s('u_kwame', 'web', '197.210.53.9', 'NG', 'Africa/Lagos', 4, 2);
  s('u_kwame', 'web', '41.66.200.12', 'GH', 'Africa/Accra', 6, 2);

  return {
    community_sessions: sessions,
    community_security_events: [
      { id: 'ev1', kind: 'new_country', severity: 'medium', user_id: 'u_joseph', ip: '185.220.101.4', detail: 'First sign-in from DE on ios', created_at: ago(49), resolved_at: null, resolved_by: null },
      { id: 'ev2', kind: 'many_addresses', severity: 'medium', user_id: 'u_kwame', ip: '197.210.53.9', detail: 'Signed in from 6 or more addresses in a day', created_at: ago(4), resolved_at: null, resolved_by: null },
      { id: 'ev3', kind: 'blocked_address', severity: 'high', user_id: 'u_kwame', ip: '197.210.53.8', detail: 'Sign-in from a blocked address; the account was suspended', created_at: ago(1), resolved_at: null, resolved_by: null },
      { id: 'ev4', kind: 'new_country', severity: 'medium', user_id: 'u_esther', ip: '73.15.122.9', detail: 'First sign-in from US on ios', created_at: ago(300), resolved_at: ago(290), resolved_by: 'demo_me' },
    ],
    community_ip_bans: [{ ip: '197.210.53.8', reason: 'Spam accounts', created_by: 'demo_me', created_at: ago(20) }],
    community_bans: [{ id: 'ban1', user_id: 'u_kwame', reason: 'Signed in from a blocked address', until: new Date(Date.now() + 6 * 24 * H).toISOString(), created_by: 'system', created_at: ago(1), lifted_at: null, lifted_by: null }],
    community_admin_audit: [
      { id: 'au1', admin_id: 'demo_me', action: 'verify', target_user: 'u_grace', target_id: null, detail: '', created_at: ago(1500) },
      { id: 'au2', admin_id: 'demo_me', action: 'plus', target_user: 'u_grace', target_id: null, detail: 'until ' + ymd(new Date(Date.now() + 10 * 24 * H)), created_at: ago(200) },
      { id: 'au3', admin_id: 'u_grace', action: 'suspend', target_user: 'u_kwame', target_id: null, detail: 'Spam in comments · 7 days', created_at: ago(1) },
    ],
    community_announcements: [{ id: 'an1', title: 'Camp meeting registration is open', body: 'Sign up at the church office by the end of the month.', level: 'info', starts_at: ago(10), ends_at: new Date(Date.now() + 7 * 24 * H).toISOString(), created_by: 'demo_me', created_at: ago(10) }],
    community_blocked_words: [{ word: 'scam', created_at: ago(400) }, { word: 'casino', created_at: ago(300) }],
    community_fundraisers: [
      { id: 'fr1', user_id: 'u_grace', title: 'New choir robes', description: 'Thirty robes for the Hillside Choir.', goal_pence: 150000, currency: 'GBP', cover_url: '', ends_at: new Date(Date.now() + 20 * 24 * H).toISOString(), status: 'active', created_at: ago(240) },
      { id: 'fr2', user_id: 'u_daniel', title: 'Pathfinders camp tents', description: '', goal_pence: 80000, currency: 'GBP', cover_url: '', ends_at: null, status: 'active', created_at: ago(500) },
    ],
    community_donations: [
      ['d1', 'fr1', 'u_ruth', 2500, 30], ['d2', 'fr1', 'u_joseph', 5000, 70], ['d3', 'fr1', 'demo_me', 2000, 100], ['d4', 'fr2', 'u_samuel', 1500, 150],
      ['d5', 'fr2', 'u_esther', 1000, 200], ['d6', 'fr1', null, 10000, 260], ['d7', 'fr2', 'u_grace', 3000, 320],
    ].map(([id, fundraiser_id, donor_id, amount_pence, h]) => ({ id, fundraiser_id, donor_id, amount_pence, currency: 'GBP', message: id === 'd2' ? 'God bless the choir!' : '', anonymous: donor_id == null, payment_intent_id: null, status: 'succeeded', created_at: ago(h as number) })),
    community_promotions: [
      { id: 'pm1', post_id: 'p1', user_id: 'u_grace', days: 7, amount_pence: 700, currency: 'GBP', status: 'active', payment_intent_id: null, starts_at: ago(30), ends_at: new Date(Date.now() + 5 * 24 * H).toISOString(), created_at: ago(30) },
      { id: 'pm2', post_id: 'r1', user_id: 'u_samuel', days: 3, amount_pence: 300, currency: 'GBP', status: 'ended', payment_intent_id: null, starts_at: ago(400), ends_at: ago(330), created_at: ago(400) },
    ],
    community_billing: [
      { user_id: 'demo_me', status: 'active', current_period_end: new Date(Date.now() + 20 * 24 * H).toISOString(), cancel_at_period_end: false, payouts_enabled: false, updated_at: ago(200) },
      { user_id: 'u_grace', status: 'active', current_period_end: new Date(Date.now() + 10 * 24 * H).toISOString(), cancel_at_period_end: true, payouts_enabled: true, updated_at: ago(100) },
    ],
  };
}

/** Extra sample payments so the money charts have something to show. */
export function extraTransactions(): Row[] {
  const rows: Row[] = [];
  const people = ['u_grace', 'demo_me', 'u_ruth', 'u_joseph', 'u_samuel', 'u_esther', 'u_daniel'];
  for (let d = 1; d < 60; d++) {
    const r = rnd('tx' + d);
    if (r < 0.45) continue;
    const kind = r > 0.9 ? 'ad' : r > 0.7 ? 'donation' : 'plus';
    const who = people[Math.floor(rnd('who' + d) * people.length)];
    rows.push({
      id: 'txs' + d, user_id: who, kind, amount_pence: kind === 'plus' ? 499 : kind === 'ad' ? 100 * (1 + Math.floor(r * 7)) : 500 + Math.round(rnd('amt' + d) * 40) * 50,
      currency: 'GBP', note: kind === 'plus' ? 'Community Plus, 1 month' : kind === 'ad' ? 'Boost' : 'Fundraiser donation', created_by: null, created_at: ago(d * 24 - 6),
      provider: 'stripe', status: rnd('st' + d) > 0.93 ? 'failed' : 'succeeded', method: rnd('m' + d) > 0.6 ? 'Apple Pay' : 'Visa •••• 4242',
    });
  }
  return rows;
}

export function adminRpc({ T, profile, insertRow, me }: Ctx): Record<string, (args: any) => any> {
  const isAdmin = () => T('community_admins').some((a) => a.user_id === me());
  const guard = () => {
    if (!isAdmin()) throw new Error('Admins only');
  };
  const lastSession = (id: string) => [...T('community_sessions')].filter((s) => s.user_id === id).sort((a, b) => (a.last_seen < b.last_seen ? 1 : -1))[0];
  const followers = (id: string) => T('community_follows').filter((f) => f.following_id === id).length;
  const reportsAgainst = (id: string) =>
    T('community_reports').filter((r) => r.reported_user === id || r.target_user_id === id || T('community_posts').find((p) => p.id === r.post_id)?.user_id === id).length;
  const spent = (id: string) => T('community_transactions').filter((t) => t.user_id === id && t.status === 'succeeded' && t.kind !== 'refund').reduce((a, t) => a + t.amount_pence, 0);
  const isPlus = (p: Row) => !!p.plus_until && new Date(p.plus_until).getTime() > Date.now();
  const role = (id: string) => T('community_admins').find((a) => a.user_id === id)?.role ?? null;
  const audit = (action: string, target: string, detail = '') =>
    insertRow('community_admin_audit', { admin_id: me(), action, target_user: target, target_id: null, detail });

  const card = (p: Row) => {
    const last = lastSession(p.id);
    return {
      id: p.id, username: p.username, full_name: p.full_name, avatar_url: p.avatar_url, created_at: p.created_at, verified: !!p.verified, plus: isPlus(p),
      plus_until: p.plus_until ?? null, suspended: !!p.suspended, deleted_at: p.deleted_at ?? null, admin_note: p.admin_note ?? '', contact_email: p.contact_email ?? '',
      contact_phone: p.contact_phone ?? '', account_type: p.account_type ?? 'personal', is_private: !!p.is_private, admin_role: role(p.id), church_name: null, minor: !!p.minor,
      last_seen: last?.last_seen ?? null, country: last?.country ?? null, platform: last?.platform ?? null,
      posts: T('community_posts').filter((x) => x.user_id === p.id).length, followers: followers(p.id),
      following: T('community_follows').filter((f) => f.follower_id === p.id).length, messages: T('community_messages').filter((m) => m.sender_id === p.id).length,
      reports: reportsAgainst(p.id), spent_pence: spent(p.id), alerts: T('community_security_events').filter((e) => e.user_id === p.id && !e.resolved_at).length,
    };
  };

  const days = (count: number) => {
    const out: Date[] = [];
    const start = dayStart(new Date());
    for (let i = count - 1; i >= 0; i--) out.push(new Date(start.getTime() - i * 24 * H));
    return out;
  };
  const inDay = (iso: string, d: Date) => {
    const t = new Date(iso).getTime();
    return t >= d.getTime() && t < d.getTime() + 24 * H;
  };

  return {
    community_touch_session: () => ({ ok: true, blocked: false }),

    community_admin_queue: () => {
      guard();
      return {
        churches_pending: T('community_churches').filter((c) => c.status === 'pending').length,
        verifications_pending: T('community_plus_requests').filter((r) => r.status === 'pending' && r.kind === 'verify').length,
        ads_active: T('community_promotions').filter((p) => p.status === 'active').length,
        fundraisers_active: T('community_fundraisers').filter((f) => f.status === 'active').length,
      };
    },

    community_admin_people: ({ p_q = '', p_filter = 'all', p_sort = 'newest', p_limit = 50, p_offset = 0 }) => {
      guard();
      const q = String(p_q).trim().toLowerCase();
      let rows = T('community_profiles')
        .filter((p) => !q || [p.username, p.full_name, p.id, p.contact_email, p.contact_phone].some((v) => String(v ?? '').toLowerCase().includes(q)) || T('community_sessions').some((s) => s.user_id === p.id && s.ip === q))
        .map(card);
      const week = Date.now() - 7 * 24 * H;
      rows = rows.filter((r) => {
        switch (p_filter) {
          case 'active': return !!r.last_seen && new Date(r.last_seen).getTime() > week;
          case 'new': return new Date(r.created_at).getTime() > week;
          case 'suspended': return r.suspended;
          case 'closed': return !!r.deleted_at;
          case 'verified': return r.verified;
          case 'plus': return r.plus;
          case 'admins': return !!r.admin_role;
          case 'reported': return r.reports > 0;
          case 'alerts': return r.alerts > 0;
          case 'minors': return r.minor;
          case 'paying': return r.spent_pence > 0;
          case 'dormant': return new Date(r.last_seen ?? r.created_at).getTime() < Date.now() - 30 * 24 * H;
          default: return true;
        }
      });
      const by: Record<string, (a: any, b: any) => number> = {
        newest: (a, b) => (a.created_at < b.created_at ? 1 : -1),
        oldest: (a, b) => (a.created_at > b.created_at ? 1 : -1),
        active: (a, b) => ((a.last_seen ?? '') < (b.last_seen ?? '') ? 1 : -1),
        name: (a, b) => a.username.localeCompare(b.username),
        followers: (a, b) => b.followers - a.followers,
        posts: (a, b) => b.posts - a.posts,
        reports: (a, b) => b.reports - a.reports,
        spent: (a, b) => b.spent_pence - a.spent_pence,
      };
      rows.sort(by[p_sort] ?? by.newest);
      return { total: rows.length, rows: rows.slice(p_offset, p_offset + p_limit) };
    },

    community_admin_user: ({ p_user }) => {
      guard();
      const p = T('community_profiles').find((x) => x.id === p_user);
      if (!p) throw new Error('That account no longer exists');
      const posts = T('community_posts').filter((x) => x.user_id === p.id);
      const mine = (t: string, k = 'user_id') => T(t).filter((x) => x[k] === p.id);
      const sessions = [...mine('community_sessions')].sort((a, b) => (a.last_seen < b.last_seen ? 1 : -1));
      const myIps = new Set(sessions.map((s) => s.ip));
      const timeline = [
        ...posts.map((x) => ({ at: x.created_at, kind: x.kind === 'reel' ? 'reel' : 'post', detail: String(x.caption).slice(0, 80) })),
        ...mine('community_comments').map((x) => ({ at: x.created_at, kind: 'comment', detail: String(x.text).slice(0, 80) })),
        ...mine('community_stories').map((x) => ({ at: x.created_at, kind: 'story', detail: '' })),
        ...mine('community_follows', 'follower_id').map((x) => ({ at: x.created_at, kind: 'follow', detail: profile(x.following_id).username })),
        ...mine('community_transactions').map((x) => ({ at: x.created_at, kind: 'payment', detail: `${x.kind} ${x.currency} ${(x.amount_pence / 100).toFixed(2)}` })),
        ...sessions.map((x) => ({ at: x.first_seen, kind: 'sign_in', detail: x.platform + ' · ' + x.country })),
      ].sort((a, b) => (a.at < b.at ? 1 : -1));
      return {
        profile: { ...p, plus: isPlus(p), admin_role: role(p.id), church_name: null, minor: !!p.minor, admin_note: p.admin_note ?? '', suspended: !!p.suspended, deleted_at: p.deleted_at ?? null },
        counts: {
          posts: posts.filter((x) => x.kind !== 'reel').length, reels: posts.filter((x) => x.kind === 'reel').length, stories: mine('community_stories').length,
          comments: mine('community_comments').length, likes_given: mine('community_likes').length, likes_received: posts.reduce((a, x) => a + (x.like_base ?? 0), 0),
          followers: followers(p.id), following: mine('community_follows', 'follower_id').length, messages: mine('community_messages', 'sender_id').length,
          chats: T('community_threads').filter((t) => t.user_a === p.id || t.user_b === p.id).length, calls: 0, lives: 0,
          groups: mine('community_group_members').length, profile_views: mine('community_profile_views', 'profile_id').length,
          blocks_made: 0, blocked_by: 0, reports_made: mine('community_reports', 'reporter_id').length, reports_against: reportsAgainst(p.id),
        },
        sessions,
        transactions: [...mine('community_transactions')].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)),
        donations: mine('community_donations', 'donor_id').map((d) => ({ ...d, fundraiser: T('community_fundraisers').find((f) => f.id === d.fundraiser_id)?.title })),
        promotions: mine('community_promotions'),
        fundraisers: mine('community_fundraisers').map((f) => fundCard(f)),
        billing: T('community_billing').find((b) => b.user_id === p.id) ?? null,
        bans: mine('community_bans'),
        alerts: mine('community_security_events'),
        audit: T('community_admin_audit').filter((a) => a.target_user === p.id).map((a) => ({ at: a.created_at, action: a.action, detail: a.detail, admin: a.admin_id === 'system' ? null : profile(a.admin_id).username })),
        reports: T('community_reports').filter((r) => r.reporter_id === p.id || posts.some((x) => x.id === r.post_id)).map((r) => ({ ...r, reporter_username: profile(r.reporter_id).username, reported_username: p.username })),
        support: mine('community_support_tickets'),
        requests: mine('community_plus_requests'),
        groups: mine('community_group_members').map((m) => {
          const g = T('community_groups').find((x) => x.id === m.group_id) ?? {};
          return { id: m.group_id, name: g.name, kind: g.kind, role: m.role, status: m.status };
        }),
        recent_posts: posts.slice(0, 24).map((x) => ({ id: x.id, kind: x.kind, caption: x.caption, media: x.media[0], created_at: x.created_at, likes: x.like_base ?? 0, comments: T('community_comments').filter((c) => c.post_id === x.id).length })),
        timeline,
        activity_days: days(30).map((d, i) => ({ d: ymd(d), n: Math.round(rnd(p.id + i) * (p.id === 'u_kwame' ? 3 : 14)) + timeline.filter((t) => inDay(t.at, d)).length })),
        shared_addresses: T('community_sessions').filter((s) => s.user_id !== p.id && s.ip && myIps.has(s.ip)).map((s) => ({ id: s.user_id, username: profile(s.user_id).username, ip: s.ip })),
      };
    },

    community_admin_search: ({ p_q }) => {
      guard();
      const q = String(p_q).trim().toLowerCase();
      if (q.length < 2) return {};
      const has = (v: any) => String(v ?? '').toLowerCase().includes(q);
      return {
        people: T('community_profiles').filter((p) => has(p.username) || has(p.full_name) || p.id === p_q || has(p.contact_email) || has(p.admin_note)).map((p) => ({ ...card(p), email: p.contact_email ?? '', closed: !!p.deleted_at })),
        addresses: T('community_sessions').filter((s) => has(s.ip) || has(s.device)).map((s) => ({ ...s, username: profile(s.user_id).username })),
        posts: T('community_posts').filter((x) => has(x.caption) || has(x.location)).map((x) => ({ ...x, caption: String(x.caption).slice(0, 140), media: x.media[0], username: profile(x.user_id).username })),
        comments: T('community_comments').filter((c) => has(c.text)).map((c) => ({ ...c, username: profile(c.user_id).username })),
        groups: T('community_groups').filter((g) => has(g.name) || has(g.handle)),
        churches: T('community_churches').filter((c) => has(c.name) || has(c.city)).map((c) => ({ ...c, status: c.status ?? 'approved' })),
        transactions: T('community_transactions').filter((t) => t.id === p_q || has(t.note)).slice(0, 25).map((t) => ({ ...t, username: t.user_id ? profile(t.user_id).username : null })),
        tickets: T('community_support_tickets').filter((t) => has(t.subject) || has(t.body)).map((t) => ({ ...t, username: profile(t.user_id).username })),
        fundraisers: T('community_fundraisers').filter((f) => has(f.title) || has(f.description)),
      };
    },

    community_admin_analytics: ({ p_days = 30 }) => {
      guard();
      const ds = days(Math.max(7, Math.min(365, p_days)));
      const since = ds[0].getTime();
      const wave = (k: string, i: number, base: number, amp: number) => {
        const weekend = [5, 6].includes(ds[i].getDay()) ? 1.35 : 1; // Friday evening and Sabbath are busiest
        return Math.max(0, Math.round((base + amp * rnd(k + ymd(ds[i]))) * weekend * (0.75 + (i / ds.length) * 0.5)));
      };
      const tx = T('community_transactions');
      const series = ds.map((d, i) => ({
        d: ymd(d),
        signups: wave('su', i, 0, 3) + T('community_profiles').filter((p) => inDay(p.created_at, d)).length,
        posts: wave('po', i, 2, 8) + T('community_posts').filter((p) => inDay(p.created_at, d)).length,
        stories: wave('st', i, 4, 10),
        comments: wave('co', i, 6, 20),
        likes: wave('li', i, 40, 90),
        messages: wave('me', i, 30, 70) + T('community_messages').filter((m) => inDay(m.created_at, d)).length,
        calls: wave('ca', i, 1, 6),
        active: wave('ac', i, 18, 22),
        revenue_pence: tx.filter((t) => t.status === 'succeeded' && inDay(t.created_at, d)).reduce((a, t) => a + (t.kind === 'refund' ? -t.amount_pence : t.amount_pence), 0),
        reports: rnd('rp' + ymd(d)) > 0.8 ? 1 : 0,
      }));
      const inRange = (iso: string) => new Date(iso).getTime() >= since;
      const sessions = T('community_sessions').filter((s) => inRange(s.last_seen));
      const uniq = (rows: Row[], key: string) => {
        const m = new Map<string, Set<string>>();
        for (const r of rows) {
          const k = r[key] || '??';
          if (!m.has(k)) m.set(k, new Set());
          m.get(k)!.add(r.user_id);
        }
        return [...m.entries()].map(([label, set]) => ({ label, value: set.size })).sort((a, b) => b.value - a.value);
      };
      const kinds = new Map<string, number>();
      for (const t of tx.filter((t) => t.status === 'succeeded' && inRange(t.created_at))) kinds.set(t.kind, (kinds.get(t.kind) ?? 0) + t.amount_pence);
      const profiles = T('community_profiles');
      const seenWithin = (h: number) => new Set(T('community_sessions').filter((s) => Date.now() - new Date(s.last_seen).getTime() < h * H).map((s) => s.user_id)).size;
      return {
        days: ds.length,
        series,
        totals: {
          members: profiles.length, dau: seenWithin(24), wau: seenWithin(24 * 7), mau: seenWithin(24 * 30), online: seenWithin(1 / 6),
          revenue_pence: series.reduce((a, s) => a + s.revenue_pence, 0),
          donations_pence: T('community_donations').filter((d) => d.status === 'succeeded' && inRange(d.created_at)).reduce((a, d) => a + d.amount_pence, 0),
          boosts_pence: T('community_promotions').filter((p) => inRange(p.created_at)).reduce((a, p) => a + p.amount_pence, 0),
          subscribers: T('community_billing').filter((b) => b.status === 'active').length,
          retention_pct: 78,
        },
        platforms: uniq(sessions, 'platform'),
        countries: uniq(sessions, 'country'),
        timezones: uniq(sessions, 'timezone'),
        content: [
          { label: 'Posts', value: series.reduce((a, s) => a + s.posts, 0) },
          { label: 'Reels', value: Math.round(series.reduce((a, s) => a + s.posts, 0) * 0.3) },
          { label: 'Stories', value: series.reduce((a, s) => a + s.stories, 0) },
          { label: 'Comments', value: series.reduce((a, s) => a + s.comments, 0) },
          { label: 'Messages', value: series.reduce((a, s) => a + s.messages, 0) },
        ],
        accounts: [
          { label: 'Personal', value: profiles.filter((p) => (p.account_type ?? 'personal') === 'personal').length },
          { label: 'Creator', value: profiles.filter((p) => p.account_type === 'creator').length },
          { label: 'Private', value: profiles.filter((p) => p.is_private).length },
          { label: 'Verified', value: profiles.filter((p) => p.verified).length },
          { label: 'Plus', value: profiles.filter(isPlus).length },
          { label: 'Suspended', value: profiles.filter((p) => p.suspended).length },
          { label: 'Closing', value: profiles.filter((p) => p.deleted_at).length },
        ],
        revenue_kinds: [...kinds.entries()].map(([label, value]) => ({ label, value })),
        hours: Array.from({ length: 24 }, (_, h) => ({ label: String(h), value: Math.round((h >= 6 && h <= 22 ? 20 : 3) * (1 + rnd('h' + h)) * (h >= 18 && h <= 21 ? 2.2 : h >= 7 && h <= 9 ? 1.5 : 1)) })),
        top_creators: profiles
          .map((p) => ({ id: p.id, username: p.username, full_name: p.full_name, avatar_url: p.avatar_url, verified: !!p.verified, posts: T('community_posts').filter((x) => x.user_id === p.id).length, likes: T('community_posts').filter((x) => x.user_id === p.id).reduce((a, x) => a + (x.like_base ?? 0), 0), followers: followers(p.id) }))
          .sort((a, b) => b.likes - a.likes)
          .slice(0, 8),
        top_posts: [...T('community_posts')]
          .sort((a, b) => (b.like_base ?? 0) - (a.like_base ?? 0))
          .slice(0, 6)
          .map((x) => ({ id: x.id, kind: x.kind, media: x.media[0], caption: String(x.caption).slice(0, 80), created_at: x.created_at, username: profile(x.user_id).username, likes: x.like_base ?? 0, comments: T('community_comments').filter((c) => c.post_id === x.id).length, views: x.view_base ?? 0 })),
        churches: T('community_churches').filter((c) => (c.status ?? 'approved') === 'approved').map((c, i) => ({ id: c.id, name: c.name, city: c.city, members: [34, 21, 9][i] ?? 3 })),
      };
    },

    community_admin_security: () => {
      guard();
      const shared = new Map<string, Set<string>>();
      for (const s of T('community_sessions')) {
        if (!s.ip) continue;
        if (!shared.has(s.ip)) shared.set(s.ip, new Set());
        shared.get(s.ip)!.add(s.user_id);
      }
      const ev = [...T('community_security_events')].sort((a, b) => ((a.resolved_at ? 1 : 0) - (b.resolved_at ? 1 : 0)) || (a.created_at < b.created_at ? 1 : -1));
      const open = ev.filter((e) => !e.resolved_at);
      const tables = ['admins', 'billing', 'blocked_words', 'blocks', 'calls', 'churches', 'comments', 'donations', 'follows', 'fundraisers', 'groups', 'likes', 'lives', 'messages', 'notifications', 'posts', 'profiles', 'promotions', 'reports', 'sessions', 'security_events', 'ip_bans', 'bans', 'admin_audit', 'announcements', 'stories', 'threads', 'transactions'];
      return {
        events: ev.map((e) => ({ ...e, username: e.user_id ? profile(e.user_id).username : null })),
        open_by_severity: { high: open.filter((e) => e.severity === 'high').length, medium: open.filter((e) => e.severity === 'medium').length, low: open.filter((e) => e.severity === 'low').length },
        flags: [
          { kind: 'new_and_busy', user_id: 'u_kwame', count: 64, detail: 'Joined in the last day and already sent many messages' },
          { kind: 'comment_burst', user_id: 'u_kwame', count: 71, detail: '71 comments in the last hour' },
        ].filter((f) => T('community_profiles').some((p) => p.id === f.user_id)),
        shared_addresses: [...shared.entries()].filter(([, u]) => u.size >= 3).map(([ip, u]) => ({ ip, accounts: u.size, usernames: [...u].map((id) => profile(id).username) })),
        ip_bans: T('community_ip_bans'),
        suspended: T('community_profiles').filter((p) => p.suspended).map((p) => ({ id: p.id, username: p.username, note: p.admin_note ?? '', until: T('community_bans').find((b) => b.user_id === p.id && !b.lifted_at)?.until ?? null })),
        admins: T('community_admins').map((a) => ({ id: a.user_id, role: a.role, username: profile(a.user_id).username, last_seen: lastSession(a.user_id)?.last_seen ?? null, actions_week: T('community_admin_audit').filter((x) => x.admin_id === a.user_id).length })),
        tables: tables.map((t) => ({ name: 'community_' + t, rls: true, policies: 2 + Math.round(rnd(t) * 6) })),
        blocked_words: T('community_blocked_words').length,
        minors: T('community_profiles').filter((p) => p.minor).length,
        sensitive_posts: T('community_posts').filter((p) => p.sensitive).length,
      };
    },

    community_admin_money: () => {
      guard();
      const tx = T('community_transactions');
      const group = (rows: Row[], key: (r: Row) => string, val: (r: Row) => number) => {
        const m = new Map<string, number>();
        for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + val(r));
        return [...m.entries()].map(([label, value]) => ({ label, value }));
      };
      const payers = new Map<string, { total: number; payments: number }>();
      for (const t of tx.filter((t) => t.status === 'succeeded' && t.kind !== 'refund' && t.user_id)) {
        const v = payers.get(t.user_id) ?? { total: 0, payments: 0 };
        v.total += t.amount_pence;
        v.payments++;
        payers.set(t.user_id, v);
      }
      return {
        donations: [...T('community_donations')].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).map((d) => ({ ...d, fundraiser: T('community_fundraisers').find((f) => f.id === d.fundraiser_id)?.title, donor: d.donor_id ? profile(d.donor_id).username : null })),
        fundraisers: T('community_fundraisers').map(fundCard),
        promotions: T('community_promotions').map((x) => ({ ...x, username: profile(x.user_id).username, caption: String(T('community_posts').find((p) => p.id === x.post_id)?.caption ?? '').slice(0, 80) })),
        subscriptions: T('community_billing').map((b) => ({ ...b, username: profile(b.user_id).username })),
        by_status: group(tx, (t) => t.status, () => 1),
        by_method: group(tx.filter((t) => t.status === 'succeeded'), (t) => t.method || (t.provider === 'manual' ? 'Recorded by hand' : 'Card'), (t) => t.amount_pence),
        top_payers: [...payers.entries()].map(([user_id, v]) => ({ user_id, username: profile(user_id).username, ...v })).sort((a, b) => b.total - a.total).slice(0, 10),
        failed: tx.filter((t) => t.status === 'failed').length,
        refunded_pence: tx.filter((t) => t.status === 'refunded' || t.kind === 'refund').reduce((a, t) => a + t.amount_pence, 0),
      };
    },

    community_admin_system: () => {
      guard();
      const names = ['posts', 'messages', 'profiles', 'comments', 'likes', 'follows', 'notifications', 'stories', 'sessions', 'transactions', 'hymns', 'churches', 'admin_audit', 'pod_items'];
      return {
        database_bytes: 48_300_000,
        tables: names.map((t, i) => ({ name: 'community_' + t, rows: Math.round(2000 / (i + 1) + rnd(t) * 400), bytes: Math.round((900_000 / (i + 1)) * (1 + rnd(t + 'b'))) })).sort((a, b) => b.bytes - a.bytes),
        storage: [{ bucket: 'community-media', files: 1243, bytes: 2_150_000_000 }],
        jobs: [
          { name: 'community-purge-deleted-accounts', schedule: '15 3 * * *', active: true, last_run: ago(7), last_status: 'succeeded', failures_day: 0 },
          { name: 'community-end-stale-lives', schedule: '*/15 * * * *', active: true, last_run: ago(0.1), last_status: 'succeeded', failures_day: 0 },
          { name: 'community-remove-purged-files', schedule: '30 3 * * *', active: true, last_run: ago(6.8), last_status: 'succeeded', failures_day: 0 },
          { name: 'community-end-ads', schedule: '*/30 * * * *', active: true, last_run: ago(0.3), last_status: 'succeeded', failures_day: 0 },
          { name: 'community-lift-bans', schedule: '*/10 * * * *', active: true, last_run: ago(0.08), last_status: 'succeeded', failures_day: 0 },
        ],
        purge_queue: 0,
        connections: 14,
        now: new Date().toISOString(),
      };
    },

    community_admin_act: ({ p_user, p_action, p_reason = '', p_days = null }) => {
      guard();
      const p = T('community_profiles').find((x) => x.id === p_user);
      if (!p) throw new Error('That account no longer exists');
      if (role(p_user) === 'owner') throw new Error("The owner's account cannot be changed here");
      if (role(p_user) === 'admin' && role(me()) !== 'owner') throw new Error('Only the owner can act on another admin');
      const reason = String(p_reason ?? '').trim();
      switch (p_action) {
        case 'suspend':
          p.suspended = true;
          if (reason) p.admin_note = reason;
          for (const b of T('community_bans')) if (b.user_id === p_user && !b.lifted_at) b.lifted_at = new Date().toISOString();
          insertRow('community_bans', { user_id: p_user, reason, until: p_days ? new Date(Date.now() + p_days * 24 * H).toISOString() : null, created_by: me(), lifted_at: null, lifted_by: null });
          break;
        case 'unsuspend':
          p.suspended = false;
          for (const b of T('community_bans')) if (b.user_id === p_user && !b.lifted_at) { b.lifted_at = new Date().toISOString(); b.lifted_by = me(); }
          break;
        case 'close': p.deleted_at = new Date().toISOString(); if (reason) p.admin_note = reason; break;
        case 'restore': p.deleted_at = null; break;
        case 'purge': {
          if (role(me()) !== 'owner') throw new Error('Only the owner can delete an account straight away');
          const list = T('community_profiles');
          list.splice(list.indexOf(p), 1);
          audit('purge', p_user, reason);
          return { ok: true, deleted: true };
        }
        case 'verify': p.verified = true; break;
        case 'unverify': p.verified = false; break;
        case 'plus': p.verified = true; p.plus_until = new Date(Math.max(Date.now(), new Date(p.plus_until ?? 0).getTime()) + (p_days ?? 30) * 24 * H).toISOString(); break;
        case 'unplus': p.plus_until = null; break;
        case 'note': p.admin_note = reason; break;
        case 'wipe':
          for (const t of ['community_posts', 'community_stories', 'community_comments']) {
            const rows = T(t);
            for (let i = rows.length - 1; i >= 0; i--) if (rows[i].user_id === p_user) rows.splice(i, 1);
          }
          break;
        case 'end_live': break;
        default: throw new Error('Unknown action');
      }
      audit(p_action, p_user, [reason, p_days ? p_days + ' days' : ''].filter(Boolean).join(' · '));
      return { ok: true };
    },
  };

  function fundCard(f: Row) {
    const ds = T('community_donations').filter((d) => d.fundraiser_id === f.id && d.status === 'succeeded');
    const p = profile(f.user_id);
    return { ...f, username: p.username, full_name: p.full_name, avatar_url: p.avatar_url, verified: !!p.verified, raised_pence: ds.reduce((a, d) => a + d.amount_pence, 0), donor_count: new Set(ds.map((d) => d.donor_id ?? d.id)).size, accepting: f.status === 'active' };
  }
}
