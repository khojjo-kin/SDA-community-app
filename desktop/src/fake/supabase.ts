// A stand-in for @supabase/supabase-js, used only by the demo build (node build.mjs --demo).
//
// It keeps sample tables in memory and answers the same queries the real database does, including
// the community_*_cards views, so the shared data code (src/lib/api.ts in the iPhone app) runs
// unchanged. Nothing is saved: a reload starts over. The people and pictures are invented samples.
import { seed, DEMO_ME, ERHA } from './seed';
import { adminRpc, adminSeed, extraTransactions } from './admin';
import { EXTENSIONS } from './ext';

type Row = Record<string, any>;
type Filter = (row: Row) => boolean;

const db: Record<string, Row[]> = seed();
// The admin console's sample records: sign-ins, alerts, bans, payments, fundraisers and boosts.
Object.assign(db, adminSeed());
db.community_transactions.push(...extraTransactions());
db.community_profiles.push({ id: 'u_kwame', username: 'kwame_deals', full_name: 'Kwame Deals', bio: '', website: '', avatar_url: '', suspended: true, admin_note: 'Signed in from a blocked address', created_at: new Date(Date.now() - 60 * 3600e3).toISOString() });
db.community_churches.push({ id: 'ch3', name: 'Lakeside SDA Company', address: '9 Shore Road', city: 'Sample Village', country: 'Demo', lat: null, lng: null, website: '', service_times: 'Divine Service 11:00', created_by: 'u_esther', created_at: new Date(Date.now() - 20 * 3600e3).toISOString(), status: 'pending' });
for (const c of db.community_churches) c.status ??= 'approved';
const blobs = new Map<string, string>();
const listeners: { table: string; event: string; filter?: Filter; fn: (payload: any) => void }[] = [];

let uid = 1000;
const newId = () => '00000000-0000-4000-8000-' + String(++uid).padStart(12, '0');
const now = () => new Date().toISOString();
// The wiring test signs in as a Clerk test user; the demo uses the sample account.
const me = () => ((globalThis as any).__fakeMe as string | undefined) ?? DEMO_ME;

/* ------------------------------------------------------------------ views */

const T = (name: string) => (db[name] ??= []);
const count = (name: string, f: Filter) => T(name).filter(f).length;
const profile = (id: string) => T('community_profiles').find((p) => p.id === id) ?? { id, username: 'unknown', full_name: '', avatar_url: '' };
const follows = (a: string, b: string) => T('community_follows').some((f) => f.follower_id === a && f.following_id === b);
const liveStories = () => T('community_stories').filter((s) => new Date(s.expires_at).getTime() > Date.now());

function profileCard(p: Row): Row {
  return {
    bio: '', website: '', account_type: 'personal', category: '', show_view_counts: true, story_replies: 'everyone', faq_enabled: false,
    pronouns: '', gender: '', contact_email: '', contact_phone: '', church_id: null, church_name: null, verified: false,
    plus_until: null, suspended: false, deleted_at: null, is_private: false, read_receipts: true, views_week: 0,
    ...p,
    posts_count: count('community_posts', (x) => x.user_id === p.id),
    followers_count: count('community_follows', (f) => f.following_id === p.id),
    following_count: count('community_follows', (f) => f.follower_id === p.id),
    is_following: follows(me(), p.id),
    follows_me: follows(p.id, me()),
    is_blocked: false,
    has_story: liveStories().some((s) => s.user_id === p.id),
    is_close_friend: T('community_close_friends').some((c) => c.user_id === me() && c.friend_id === p.id),
    plus: !!p.plus_until && new Date(p.plus_until).getTime() > Date.now(),
    admin_role: T('community_admins').find((a) => a.user_id === p.id)?.role ?? null,
    is_live: T('community_lives').some((l) => l.user_id === p.id && !l.ended_at),
    requested: T('community_follow_requests').some((r) => r.requester_id === me() && r.target_id === p.id),
    requests_me: T('community_follow_requests').some((r) => r.requester_id === p.id && r.target_id === me()),
    // Version 11 to 20 of the database.
    streaks_enabled: p.streaks_enabled ?? true, ring_color: p.ring_color ?? '', profile_theme: p.profile_theme ?? '',
    restricted: p.id === me() ? !!p.restricted : null, needs_birth_date: p.id === me() ? false : null,
    fundraiser_id: T('community_fundraisers').find((f) => f.user_id === p.id && f.status === 'active')?.id ?? null,
    show_activity: p.show_activity ?? true,
    active_at: p.active_at ?? (T('community_sessions').filter((x) => x.user_id === p.id).map((x) => x.last_seen).sort().pop() ?? null),
    tick_hidden: p.id === me() ? !!p.tick_hidden : null, verified_via: p.verified ? (p.verified_via ?? 'admin') : '',
    hide_connections: !!p.hide_connections, country: p.country ?? '',
    sub_price_pence: p.sub_price_pence ?? null,
    subscribed: T('community_creator_subs').some((x) => x.creator_id === p.id && x.subscriber_id === me() && x.status === 'active'),
    subscriber_count: p.id === me() ? count('community_creator_subs', (x) => x.creator_id === p.id && x.status === 'active') : null,
    subscriber_posts: count('community_posts', (x) => x.user_id === p.id && x.audience === 'subscribers'),
    interests_more: p.id === me() ? p.interests_more ?? [] : null, interests_less: p.id === me() ? p.interests_less ?? [] : null,
    sensitive_filter: p.sensitive_filter ?? 'standard',
    alerts_on: T('community_follow_alerts').some((a) => a.user_id === me() && a.target_id === p.id && (a.posts || a.stories || a.clips || a.live)),
  };
}

function postCard(p: Row): Row {
  const a = profile(p.user_id);
  const views = count('community_post_views', (v) => v.post_id === p.id);
  return {
    location: '', group_id: null, group_name: null, group_kind: null, in_my_group: false, boosted: false, boosted_until: null,
    audio_id: null, audio_title: null, audio_url: null, audio_artist: null,
    ...p,
    username: a.username, full_name: a.full_name, avatar_url: a.avatar_url, verified: !!a.verified, author_plus: false,
    like_count: (p.like_base ?? 0) + count('community_likes', (l) => l.post_id === p.id),
    comment_count: count('community_comments', (c) => c.post_id === p.id),
    repost_count: count('community_reposts', (r) => r.post_id === p.id),
    liked: T('community_likes').some((l) => l.post_id === p.id && l.user_id === me()),
    saved: T('community_saves').some((l) => l.post_id === p.id && l.user_id === me()),
    reposted: T('community_reposts').some((l) => l.post_id === p.id && l.user_id === me()),
    following_author: follows(me(), p.user_id),
    view_count: (p.view_base ?? 0) + views,
    sensitive: !!p.sensitive, audience: p.audience ?? 'everyone', captions: p.captions ?? null, captions_lang: p.captions_lang ?? '', captions_status: p.captions_status ?? '',
    tagged_ids: p.tagged_ids ?? [], ai_label: !!p.ai_label, profile_only: !!p.profile_only, hide_likes: !!p.hide_likes, comments_off: !!p.comments_off,
    prompt: p.prompt ?? '', poll: p.poll ?? null,
    poll_counts: p.poll ? p.poll.options.map((_: string, i: number) => (p.poll_base?.[i] ?? 0) + count('community_poll_votes', (v) => v.post_id === p.id && v.option === i)) : null,
    my_vote: p.poll ? T('community_poll_votes').find((v) => v.post_id === p.id && v.user_id === me())?.option ?? null : null,
  };
}

const VIEWS: Record<string, () => Row[]> = {
  community_profile_cards: () => T('community_profiles').map(profileCard),
  community_post_cards: () => T('community_posts').map(postCard),
  community_comment_cards: () =>
    T('community_comments').map((c) => {
      const a = profile(c.user_id);
      return {
        ...c, username: a.username, full_name: a.full_name, avatar_url: a.avatar_url, verified: !!a.verified,
        like_count: count('community_comment_likes', (l) => l.comment_id === c.id),
        liked: T('community_comment_likes').some((l) => l.comment_id === c.id && l.user_id === me()),
      };
    }),
  community_story_cards: () =>
    liveStories().map((s) => {
      const a = profile(s.user_id);
      return {
        ...s, username: a.username, full_name: a.full_name, avatar_url: a.avatar_url, story_replies: 'everyone',
        seen: T('community_story_views').some((v) => v.story_id === s.id && v.viewer_id === me()),
        in_tray: s.user_id === me() || follows(me(), s.user_id),
        view_count: count('community_story_views', (v) => v.story_id === s.id),
        follows_viewer: follows(s.user_id, me()),
        author_plus: !!a.plus_until && new Date(a.plus_until).getTime() > Date.now(), verified: !!a.verified,
      };
    }),
  community_thread_cards: () =>
    T('community_threads')
      .filter((t) => t.user_a === me() || t.user_b === me())
      .map((t) => {
        const other = t.user_a === me() ? t.user_b : t.user_a;
        const a = profile(other);
        const settings = T('community_thread_settings').find((s) => s.thread_id === t.id && s.user_id === me());
        const msgs = T('community_messages').filter((m) => m.thread_id === t.id && (!settings?.hidden_before || m.created_at > settings.hidden_before));
        const last = msgs.reduce<Row | null>((x, m) => (!x || m.created_at > x.created_at ? m : x), null);
        const read = T('community_thread_reads').find((r) => r.thread_id === t.id && r.user_id === me())?.last_read_at ?? '';
        return {
          id: t.id, created_at: t.created_at, other_id: other, username: a.username, full_name: a.full_name, avatar_url: a.avatar_url, verified: !!a.verified,
          last_message: last ? last.text || (last.media_url ? 'Sent a photo' : last.audio_url ? 'Voice message' : '') : '',
          last_message_at: last?.created_at ?? t.created_at,
          unread_count: msgs.filter((m) => m.sender_id !== me() && m.created_at > read).length,
          has_messages: msgs.length > 0, muted: !!settings?.muted, hidden_before: settings?.hidden_before ?? null,
          streak: t.streak ?? 0, active_at: profileCard(a).active_at, other_plus: !!a.plus_until && new Date(a.plus_until).getTime() > Date.now(),
        };
      }),
  community_notification_cards: () =>
    T('community_notifications')
      .filter((n) => n.user_id === me())
      .map((n) => {
        const a = profile(n.actor_id);
        const post = T('community_posts').find((p) => p.id === n.post_id);
        return { ...n, username: a.username, full_name: a.full_name, avatar_url: a.avatar_url, verified: !!a.verified, post_media: post?.media?.[0] ?? null, is_following: follows(me(), n.actor_id) };
      }),
  community_pod_cards: () =>
    T('community_pod_items').map((it) => {
      const a = profile(it.user_id);
      return { ...it, username: a.username, full_name: a.full_name, avatar_url: a.avatar_url, saved: T('community_pod_saves').some((x) => x.item_id === it.id && x.user_id === me()) };
    }),
  community_live_cards: () =>
    T('community_lives').map((l) => {
      const a = profile(l.user_id);
      return { viewers: 0, ended_at: null, audience: 'followers', fundraiser_id: null, ...l, username: a.username, full_name: a.full_name, avatar_url: a.avatar_url, verified: !!a.verified, following: follows(me(), l.user_id) };
    }),
  community_profile_viewer_cards: () =>
    T('community_profile_views').map((v) => {
      const a = profile(v.viewer_id);
      return { ...v, username: a.username, full_name: a.full_name, avatar_url: a.avatar_url, verified: !!a.verified };
    }),
  community_report_cards: () =>
    T('community_reports').map((r) => {
      const post = T('community_posts').find((p) => p.id === r.post_id);
      const target = profile(r.target_user_id ?? post?.user_id ?? '');
      return {
        ...r, reported_user: r.target_user_id, reported_post: r.post_id, reported_post_owner: post?.user_id ?? null,
        reporter_username: profile(r.reporter_id).username, reported_username: target.username, reported_full_name: target.full_name, reported_avatar_url: target.avatar_url,
        post_caption: post?.caption ?? null, post_media: post?.media?.[0] ?? null, post_exists: !!post,
      };
    }),
  community_member_cards: () =>
    T('community_profiles').map((p) => {
      const c = profileCard(p);
      return { ...c, admin_note: p.admin_note ?? '', reports_count: count('community_reports', (r) => r.target_user_id === p.id) };
    }),
  community_support_cards: () =>
    T('community_support_tickets').map((x) => {
      const a = profile(x.user_id);
      return { ...x, username: a.username, full_name: a.full_name, avatar_url: a.avatar_url };
    }),
  community_transaction_cards: () =>
    T('community_transactions').map((x) => {
      const a = x.user_id ? profile(x.user_id) : null;
      return { provider: 'manual', status: 'succeeded', method: '', stripe_invoice_id: null, ...x, username: a?.username ?? null, full_name: a?.full_name ?? null, avatar_url: a?.avatar_url ?? null, created_by_username: x.created_by ? profile(x.created_by).username : null };
    }),
  community_note_cards: () =>
    T('community_notes')
      .filter((n) => new Date(n.expires_at).getTime() > Date.now() && (n.user_id === me() || (follows(me(), n.user_id) && follows(n.user_id, me()))))
      .map((n) => {
        const a = profile(n.user_id);
        const song = n.song_id ? T('community_pod_items').find((x) => x.id === n.song_id) : null;
        return {
          audience: 'mutuals', place: '', color: '', song_id: null, ...n, username: a.username, full_name: a.full_name, avatar_url: a.avatar_url, verified: !!a.verified, mine: n.user_id === me(),
          song_title: song?.title ?? null, song_artist: song?.artist ?? null, song_url: song?.audio_url ?? null, song_cover: song?.cover_url ?? null,
        };
      }),
  community_fundraiser_cards: () =>
    T('community_fundraisers').map((f) => {
      const a = profile(f.user_id);
      const ds = T('community_donations').filter((d) => d.fundraiser_id === f.id && d.status === 'succeeded');
      return { ...f, username: a.username, full_name: a.full_name, avatar_url: a.avatar_url, verified: !!a.verified, raised_pence: ds.reduce((x, d) => x + d.amount_pence, 0), donor_count: new Set(ds.map((d) => d.donor_id ?? d.id)).size, accepting: f.status === 'active' };
    }),
  community_group_cards: () =>
    T('community_groups').map((g) => {
      const mine = T('community_group_members').find((m) => m.group_id === g.id && m.user_id === me());
      return {
        ...g, church_name: null,
        member_count: count('community_group_members', (m) => m.group_id === g.id && m.status === 'member'),
        pending_count: count('community_group_members', (m) => m.group_id === g.id && m.status === 'pending'),
        posts_count: count('community_posts', (p) => p.group_id === g.id),
        my_standing: mine ? (mine.status === 'pending' ? 'pending' : mine.role) : null,
      };
    }),
};

const source = (name: string): Row[] => (VIEWS[name] ? VIEWS[name]() : T(name).map((r) => ({ ...r })));

/* ------------------------------------------------------------------ side effects the real database does with triggers */

function notify(user_id: string, actor_id: string, kind: string, post_id: string | null = null, body = '') {
  if (user_id === actor_id) return;
  T('community_notifications').push({ id: newId(), user_id, actor_id, kind, post_id, body, created_at: now(), read_at: null });
}

/** Tells this window's Realtime listeners about a row, and (in the call test) the other window too. */
function notifyRow(table: string, row: Row, event: 'INSERT' | 'UPDATE', relay = true) {
  for (const l of listeners) if (l.table === table && (l.event === '*' || l.event === event) && (!l.filter || l.filter(row))) setTimeout(() => l.fn({ eventType: event, new: { ...row } }), 0);
  if (relay && table === 'community_calls') (globalThis as any).__relayOut?.({ kind: 'row', table, event, row });
}

function afterInsert(table: string, row: Row) {
  const post = () => T('community_posts').find((p) => p.id === row.post_id);
  if (table === 'community_likes' && post()) notify(post()!.user_id, row.user_id, 'like', row.post_id);
  if (table === 'community_comments' && post()) notify(post()!.user_id, row.user_id, 'comment', row.post_id, row.text);
  if (table === 'community_reposts' && post()) notify(post()!.user_id, row.user_id, 'repost', row.post_id);
  if (table === 'community_follows') notify(row.following_id, row.follower_id, 'follow');
  notifyRow(table, row, 'INSERT');
  // Someone answers when you message them, so the chat shows live updates.
  if (table === 'community_messages' && row.sender_id === me()) {
    const thread = T('community_threads').find((t) => t.id === row.thread_id);
    const other = thread && (thread.user_a === me() ? thread.user_b : thread.user_a);
    if (other && other !== ERHA) {
      setTimeout(() => insertRow('community_messages', { thread_id: row.thread_id, sender_id: other, text: replyTo(row.text) }), 1800);
    }
  }
}

function replyTo(text: string): string {
  if (/\?$/.test(text.trim())) return 'Good question! Let me check and get back to you.';
  if (/sabbath|church|service/i.test(text)) return 'See you at church on Sabbath 🙏';
  return 'Amen! Thanks for the message 😊';
}

function defaults(table: string, row: Row): Row {
  const out: Row = { ...row };
  if (!('id' in out) && !/_(likes|saves|reposts|follows|views|reads|settings|close_friends|blocks|follow_requests|group_members|comment_likes|notes|poll_votes|follow_alerts|story_watch|live_reminders|suggestion_dismissals|private_details)$/.test(table)) out.id = newId();
  if (!('created_at' in out)) out.created_at = now();
  if (table === 'community_stories') {
    out.expires_at ??= new Date(Date.now() + 86400e3).toISOString();
    out.audience ??= 'everyone';
  }
  if (table === 'community_messages') {
    for (const k of ['media_url', 'audio_url', 'call_url', 'call_kind', 'text']) out[k] ??= '';
    out.audio_seconds ??= 0;
    out.post_id ??= null;
    out.view_once ??= false;
    out.opened_at ??= null;
    out.system ??= '';
  }
  if (table === 'community_reports') out.status ??= 'open';
  if (table === 'community_notes') {
    out.expires_at ??= new Date(Date.now() + 86400e3).toISOString();
    for (const k of ['place', 'color']) out[k] ??= '';
    out.song_id ??= null;
  }
  if (table === 'community_calls') {
    out.status ??= 'ringing';
    out.answered_at ??= null;
    out.ended_at ??= null;
  }
  if (table === 'community_posts') {
    out.like_base = 0;
    out.view_base = 0;
  }
  return out;
}

function insertRow(table: string, row: Row): Row {
  const full = defaults(table, row);
  T(table).push(full);
  afterInsert(table, full);
  return full;
}

/* ------------------------------------------------------------------ filters, including PostgREST's or=(...) syntax */

function cmp(op: string, a: any, b: any): boolean {
  // A column the sample row doesn't have reads as null, and false for a boolean filter.
  if (a === undefined && (op === 'eq' || op === 'is') && b === false) return true;
  switch (op) {
    case 'eq': return String(a) === String(b);
    case 'neq': return String(a) !== String(b);
    case 'gt': return a > b;
    case 'gte': return a >= b;
    case 'lt': return a < b;
    case 'lte': return a <= b;
    case 'is': return b === null || b === 'null' ? a == null : a === (b === 'true' || b === true);
    case 'ilike': {
      const re = new RegExp('^' + String(b).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/[%*]/g, '.*') + '$', 'i');
      return re.test(String(a ?? ''));
    }
    default: return true;
  }
}

function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0, cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

function parseCondition(expr: string): Filter {
  const e = expr.trim();
  const group = /^(and|or)\((.*)\)$/.exec(e);
  if (group) {
    const parts = splitTop(group[2]).map(parseCondition);
    return group[1] === 'and' ? (r) => parts.every((p) => p(r)) : (r) => parts.some((p) => p(r));
  }
  const [col, op, ...rest] = e.split('.');
  let value: any = rest.join('.').replace(/^"|"$/g, '');
  if (value === 'true') value = true;
  if (value === 'false') value = false;
  return (r) => cmp(op, r[col], value);
}

/* ------------------------------------------------------------------ the query builder */

class Query implements PromiseLike<any> {
  private filters: Filter[] = [];
  private orders: [string, boolean][] = [];
  private max = 1000;
  private one: 'single' | 'maybe' | null = null;
  private op: 'select' | 'insert' | 'upsert' | 'update' | 'delete' = 'select';
  private payload: any = null;
  private conflict: string[] = [];
  private ignoreDup = false;
  private head = false;
  private wantCount = false;
  private returning = false;

  constructor(private table: string) {}

  select(_cols = '*', opts: { count?: string; head?: boolean } = {}) {
    if (this.op === 'select') {
      this.head = !!opts.head;
      this.wantCount = !!opts.count;
    } else this.returning = true;
    return this;
  }
  insert(rows: any) { this.op = 'insert'; this.payload = rows; return this; }
  upsert(rows: any, opts: { onConflict?: string; ignoreDuplicates?: boolean } = {}) {
    this.op = 'upsert'; this.payload = rows; this.conflict = (opts.onConflict ?? 'id').split(','); this.ignoreDup = !!opts.ignoreDuplicates; return this;
  }
  update(patch: any) { this.op = 'update'; this.payload = patch; return this; }
  delete() { this.op = 'delete'; return this; }
  eq(c: string, v: any) { this.filters.push((r) => cmp('eq', r[c], v)); return this; }
  neq(c: string, v: any) { this.filters.push((r) => cmp('neq', r[c], v)); return this; }
  gt(c: string, v: any) { this.filters.push((r) => r[c] > v); return this; }
  gte(c: string, v: any) { this.filters.push((r) => r[c] >= v); return this; }
  lt(c: string, v: any) { this.filters.push((r) => r[c] < v); return this; }
  lte(c: string, v: any) { this.filters.push((r) => r[c] <= v); return this; }
  is(c: string, v: any) { this.filters.push((r) => cmp('is', r[c], v)); return this; }
  in(c: string, vs: any[]) { const set = new Set(vs.map(String)); this.filters.push((r) => set.has(String(r[c]))); return this; }
  ilike(c: string, v: string) { this.filters.push((r) => cmp('ilike', r[c], v)); return this; }
  or(expr: string) { this.filters.push(parseCondition('or(' + expr + ')')); return this; }
  order(c: string, opts: { ascending?: boolean } = {}) { this.orders.push([c, opts.ascending !== false]); return this; }
  limit(n: number) { this.max = n; return this; }
  single() { this.one = 'single'; return this; }
  maybeSingle() { this.one = 'maybe'; return this; }

  private match(r: Row) { return this.filters.every((f) => f(r)); }

  private run(): { data: any; error: any; count?: number } {
    let rows: Row[] = [];
    if (this.op === 'select') {
      rows = source(this.table).filter((r) => this.match(r));
      for (const [c, asc] of [...this.orders].reverse()) rows.sort((a, b) => (a[c] === b[c] ? 0 : (a[c] > b[c] ? 1 : -1) * (asc ? 1 : -1)));
      const total = rows.length;
      rows = rows.slice(0, this.max);
      if (this.head) return { data: null, error: null, count: total };
      if (this.wantCount) return { data: rows, error: null, count: total };
    } else if (this.op === 'insert') {
      const list = [].concat(this.payload);
      for (const r of list) {
        const err = check(this.table, r);
        if (err) return { data: null, error: err };
      }
      rows = list.map((r) => insertRow(this.table, r));
    } else if (this.op === 'upsert') {
      for (const r of [].concat(this.payload) as Row[]) {
        const found = T(this.table).find((x) => this.conflict.every((k) => String(x[k]) === String(r[k])));
        if (found) {
          if (!this.ignoreDup) Object.assign(found, r);
          rows.push(found);
        } else rows.push(insertRow(this.table, r));
      }
    } else if (this.op === 'update') {
      rows = T(this.table).filter((r) => this.match(r));
      rows.forEach((r) => {
        Object.assign(r, this.payload);
        notifyRow(this.table, r, 'UPDATE');
      });
    } else if (this.op === 'delete') {
      const keep = T(this.table).filter((r) => !this.match(r));
      rows = T(this.table).filter((r) => this.match(r));
      db[this.table] = keep;
      if (this.table === 'community_posts') for (const r of rows) for (const t of ['community_likes', 'community_saves', 'community_comments', 'community_reposts']) db[t] = T(t).filter((x) => x.post_id !== r.id);
    }
    if (this.op !== 'select' && !this.returning) return { data: null, error: null };
    if (this.one) {
      if (rows.length === 0) return this.one === 'maybe' ? { data: null, error: null } : { data: null, error: { message: 'No rows', code: 'PGRST116' } };
      return { data: { ...rows[0] }, error: null };
    }
    return { data: rows.map((r) => ({ ...r })), error: null };
  }

  then<A = any, B = never>(ok?: ((v: any) => A | PromiseLike<A>) | null, bad?: ((e: any) => B | PromiseLike<B>) | null): Promise<A | B> {
    return new Promise((resolve) => setTimeout(resolve, 60 + Math.random() * 90)).then(() => this.run()).then(ok, bad);
  }
}

function check(table: string, row: Row): any {
  if (table === 'community_profiles') {
    if (!/^[a-z0-9_]{3,30}$/.test(row.username ?? '')) return { code: '23514', message: 'username check' };
    if (T(table).some((p) => p.username === row.username)) return { code: '23505', message: 'duplicate username' };
  }
  return null;
}

/* ------------------------------------------------------------------ rpc, storage, functions, realtime */

function threadWith(other: string): Row {
  let t = T('community_threads').find((x) => (x.user_a === me() && x.user_b === other) || (x.user_b === me() && x.user_a === other));
  if (!t) t = insertRow('community_threads', { user_a: me(), user_b: other });
  return t;
}

const RPC: Record<string, (args: any) => any> = {
  community_pod_played: ({ item }) => {
    const it = T('community_pod_items').find((x) => x.id === item);
    if (it) it.plays += 1;
    return null;
  },
  community_ask_faq: ({ faq }) => {
    const f = T('community_faqs').find((x) => x.id === faq);
    if (!f) return null;
    const t = threadWith(f.user_id);
    insertRow('community_messages', { thread_id: t.id, sender_id: me(), text: f.question });
    setTimeout(() => insertRow('community_messages', { thread_id: t.id, sender_id: f.user_id, text: f.answer }), 300);
    return t.id;
  },
  community_stats: ({ from_ts, to_ts }) => {
    const from = new Date(from_ts).getTime();
    const to = new Date(to_ts).getTime();
    const mine = T('community_posts').filter((p) => p.user_id === me());
    const days: { d: string; views: number; followers: number }[] = [];
    for (let t = from; t <= to; t += 86400e3) {
      const d = new Date(t).toISOString().slice(0, 10);
      const seed = d.split('-').reduce((a, b) => a + Number(b), 0);
      days.push({ d, views: 8 + ((seed * 37) % 40), followers: seed % 5 === 0 ? 1 : 0 });
    }
    const views = days.reduce((a, b) => a + b.views, 0);
    return {
      views, post_views: Math.round(views * 0.7), story_views: Math.round(views * 0.3), accounts: Math.round(views * 0.4),
      new_followers: days.reduce((a, b) => a + b.followers, 0), followers: count('community_follows', (f) => f.following_id === me()),
      posts: mine.filter((p) => p.kind === 'post').length, reels: mine.filter((p) => p.kind === 'reel').length, stories: count('community_stories', (s) => s.user_id === me()),
      likes: mine.reduce((a, p) => a + (p.like_base ?? 0), 0), comments: count('community_comments', (c) => mine.some((p) => p.id === c.post_id)), reposts: 0,
      days, top: mine.map((p) => ({ id: p.id, kind: p.kind, media: p.media[0], created_at: p.created_at, views: (p.view_base ?? 0) + 10, likes: p.like_base ?? 0, comments: 1 })),
    };
  },
  community_admin_stats: () => ({
    lives_now: count('community_lives', (l) => !l.ended_at), pod_items: T('community_pod_items').length, support_open: count('community_support_tickets', (x) => x.status !== 'closed'),
    groups: T('community_groups').length, income_pence: T('community_transactions').reduce((a, x) => a + x.amount_pence, 0), income_month_pence: 499, deactivated: 0,
    members: T('community_profiles').length, members_week: 2, posts: T('community_posts').length, posts_week: 5, stories_live: liveStories().length, messages_week: T('community_messages').length,
    reports_open: count('community_reports', (r) => r.status === 'open'), requests_open: count('community_plus_requests', (r) => r.status === 'pending'),
    verified: count('community_profiles', (p) => !!p.verified), plus: 1, suspended: count('community_profiles', (p) => !!p.suspended), churches: T('community_churches').length, hymns: T('community_hymns').length,
  }),
  community_admin_activity: () =>
    [
      ...T('community_profiles').map((p) => ({ at: p.created_at, kind: 'joined', user_id: p.id, username: p.username, detail: null })),
      ...T('community_posts').map((p) => ({ at: p.created_at, kind: p.kind, user_id: p.user_id, username: profile(p.user_id).username, detail: p.caption.slice(0, 60) })),
      ...T('community_reports').map((r) => ({ at: r.created_at, kind: 'report', user_id: r.reporter_id, username: profile(r.reporter_id).username, detail: r.reason })),
    ].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 40),
  community_open_thread: ({ other }) => threadWith(other).id,
  community_mark_read: ({ thread }) => {
    const row = T('community_thread_reads').find((r) => r.thread_id === thread && r.user_id === me());
    if (row) row.last_read_at = now();
    else T('community_thread_reads').push({ thread_id: thread, user_id: me(), last_read_at: now() });
    return null;
  },
  community_hide_thread: ({ thread }) => {
    T('community_thread_settings').push({ thread_id: thread, user_id: me(), hidden_before: now(), muted: false });
    return null;
  },
  community_accept_follow_request: ({ p_requester }) => {
    db.community_follow_requests = T('community_follow_requests').filter((r) => !(r.requester_id === p_requester && r.target_id === me()));
    insertRow('community_follows', { follower_id: p_requester, following_id: me() });
    return null;
  },
};

Object.assign(RPC, adminRpc({ T, profile, insertRow, me }));

// Functions added in database versions 11 to 20.
Object.assign(RPC, {
  community_touch: () => null,
  community_record_consent: () => null,
  community_story_rewatch: () => null,
  community_set_tick_hidden: ({ hidden }: { hidden: boolean }) => {
    const p = T('community_profiles').find((x) => x.id === me());
    if (p) p.tick_hidden = !!hidden;
    return null;
  },
  community_open_view_once: ({ message }: { message: string }) => {
    const m = T('community_messages').find((x) => x.id === message);
    if (!m || !m.view_once || m.opened_at || m.sender_id === me()) return null;
    const url = m.media_url;
    m.opened_at = now();
    m.media_url = '';
    return url;
  },
  community_admin_end_ad: ({ p_post }: { p_post: string }) => {
    for (const x of T('community_promotions')) if (x.post_id === p_post && x.status === 'active') { x.status = 'ended'; x.ends_at = now(); }
    const post = T('community_posts').find((x) => x.id === p_post);
    if (post) post.boosted_until = null;
    return null;
  },
  community_fundraiser_supporters: ({ fid, p_limit = 30 }: { fid: string; p_limit?: number }) =>
    T('community_donations')
      .filter((d) => d.fundraiser_id === fid && d.status === 'succeeded')
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      .slice(0, p_limit)
      .map((d) => {
        const a = d.anonymous || !d.donor_id ? null : profile(d.donor_id);
        return { id: d.id, amount_pence: d.amount_pence, currency: d.currency, message: d.message, created_at: d.created_at, username: a?.username ?? null, full_name: a?.full_name ?? 'Anonymous', avatar_url: a?.avatar_url ?? null };
      }),
  community_suggested_people: ({ p_limit = 30 }: { p_limit?: number }) =>
    T('community_profiles')
      .filter((p) => p.id !== me() && !follows(me(), p.id) && !p.suspended && !p.deleted_at && !T('community_suggestion_dismissals').some((d) => d.user_id === me() && d.target_id === p.id))
      .map((p) => {
        const mutuals = T('community_follows').filter((f) => f.following_id === p.id && follows(me(), f.follower_id)).map((f) => profile(f.follower_id));
        return { id: p.id, username: p.username, full_name: p.full_name, avatar_url: p.avatar_url, verified: !!p.verified, mutual_count: mutuals.length, mutual_avatars: mutuals.slice(0, 2).map((m) => m.avatar_url), mutual_names: mutuals.slice(0, 2).map((m) => m.username), follows_me: follows(p.id, me()) };
      })
      .sort((a, b) => Number(b.follows_me) - Number(a.follows_me) || b.mutual_count - a.mutual_count)
      .slice(0, p_limit),
  community_create_group: ({ p_kind, p_name, p_handle, p_description, p_privacy, p_cover_url, p_church_id }: Row) => {
    const g = insertRow('community_groups', { kind: p_kind, name: p_name, handle: p_handle, description: p_description ?? '', privacy: p_privacy ?? 'public', cover_url: p_cover_url ?? '', church_id: p_church_id ?? null, created_by: me() });
    insertRow('community_group_members', { group_id: g.id, user_id: me(), role: 'owner', status: 'member' });
    return g.id;
  },
});

// Each area's own sample rows, views and functions (src/fake/ext).
const extCtx = { db, T, me, now, newId, profile, profileCard, postCard, follows, count, insertRow };
const FUNCTIONS: Record<string, (body: any) => any> = {};
for (const e of EXTENSIONS) {
  e.seed?.(extCtx);
  if (e.views) Object.assign(VIEWS, e.views(extCtx));
  if (e.rpc) Object.assign(RPC, e.rpc(extCtx));
  if (e.functions) Object.assign(FUNCTIONS, e.functions(extCtx));
}

const broadcasts: { channel: string; event: string; fn: (m: any) => void }[] = [];

const openChannels: Channel[] = [];

class Channel {
  topic: string;
  constructor(public name: string) {
    this.topic = 'realtime:' + name;
    openChannels.push(this);
  }
  on(type: string, opts: any, fn: (p: any) => void) {
    if (type === 'broadcast') {
      broadcasts.push({ channel: this.name, event: opts?.event, fn });
      return this;
    }
    if (opts?.table) {
      const m = /^(\w+)=eq\.(.+)$/.exec(opts.filter ?? '');
      listeners.push({ table: opts.table, event: opts.event ?? '*', filter: m ? (r) => String(r[m[1]]) === m[2] : undefined, fn });
      (this as any)._fns = [...((this as any)._fns ?? []), fn];
    }
    return this;
  }
  subscribe(cb?: (status: string) => void) { setTimeout(() => cb?.('SUBSCRIBED'), 0); return this; }
  send(m: { event: string; payload: any }) {
    (globalThis as any).__broadcastsSent = [...((globalThis as any).__broadcastsSent ?? []), { channel: this.name, event: m.event, payload: m.payload }];
    (globalThis as any).__relayOut?.({ kind: 'broadcast', channel: this.name, event: m.event, payload: m.payload });
    return Promise.resolve('ok');
  }
  unsubscribe() { return Promise.resolve('ok'); }
}

/** The call test delivers the other window's broadcasts and call rows here. */
(globalThis as any).__relayIn = (m: any) => {
  if (m.kind === 'broadcast') {
    for (const b of broadcasts) if (b.channel === m.channel && b.event === m.event) setTimeout(() => b.fn({ payload: m.payload }), 0);
  } else if (m.kind === 'row') {
    const found = T(m.table).find((r) => r.id === m.row.id);
    if (found) Object.assign(found, m.row);
    else T(m.table).push({ ...m.row });
    notifyRow(m.table, m.row, found ? 'UPDATE' : 'INSERT', false);
  }
};

export function createClient(url: string, key: string, opts?: any) {
  (globalThis as any).__sbClient = { url, key, opts };
  return {
    from: (table: string) => new Query(table),
    rpc: (name: string, args: any = {}) => ({
      then(ok: any, bad: any) {
        return new Promise((r) => setTimeout(r, 80)).then(() => {
          const fn = RPC[name];
          if (!fn) return { data: null, error: { code: 'PGRST202', message: 'Could not find the function ' + name } };
          try {
            return { data: fn(args), error: null };
          } catch (e: any) {
            return { data: null, error: { message: e?.message ?? String(e) } };
          }
        }).then(ok, bad);
      },
    }),
    storage: {
      from: (_bucket: string) => ({
        async upload(path: string, body: ArrayBuffer | Blob, opts: { contentType?: string } = {}) {
          const blob = body instanceof Blob ? body : new Blob([body], { type: opts.contentType });
          blobs.set(path, URL.createObjectURL(blob));
          return { data: { path }, error: null };
        },
        getPublicUrl: (path: string) => ({ data: { publicUrl: blobs.get(path) ?? path } }),
        async list() { return { data: [], error: null }; },
        async remove(paths: string[]) { return { data: paths, error: null }; },
      }),
    },
    functions: {
      async invoke(name: string, { body }: { body: any }) {
        await new Promise((r) => setTimeout(r, name === 'erha' ? 900 : 250));
        if (FUNCTIONS[name]) {
          try {
            return { data: await FUNCTIONS[name](body ?? {}), error: null };
          } catch (e: any) {
            const message = e?.message ?? String(e);
            return { data: null, error: { message, context: { json: async () => ({ error: message }) } } };
          }
        }
        if (name !== 'erha') return { data: null, error: { message: 'Not in the demo' } };
        const reply = 'In the demo I can only give a sample answer. In the real app I answer questions about the Bible, the hymnal and church life. You asked: “' + String(body.text).slice(0, 120) + '”';
        // Like the real function: the app has already sent your message; Erha's answer lands in the chat.
        if (body.thread_id) insertRow('community_messages', { thread_id: body.thread_id, sender_id: ERHA, text: reply });
        return { data: { reply, remaining: 20 }, error: null };
      },
    },
    channel: (name: string) => new Channel(name),
    getChannels: () => [...openChannels],
    realtime: { setAuth: async () => {} },
    removeChannel(ch: any) {
      const at = openChannels.indexOf(ch);
      if (at >= 0) openChannels.splice(at, 1);
      const fns: any[] = ch?._fns ?? [];
      for (let i = listeners.length - 1; i >= 0; i--) if (fns.includes(listeners[i].fn)) listeners.splice(i, 1);
      return Promise.resolve('ok');
    },
  };
}
