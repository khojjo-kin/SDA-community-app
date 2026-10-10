// The admin CRM's data: everything here calls the admin-only database functions added in
// desktop/supabase/migrations/202610100100_community_admin_crm.sql. The database checks that the
// caller is an admin on every call; the desktop only decides what to show.
import { supabase } from 'shared/supabase';
import { withTimeout } from 'shared/api';

declare const __VERSION__: string;

/** True when the database hasn't had the admin CRM update yet. */
export class NeedsUpdate extends Error {
  constructor() {
    super('This part of the admin console needs the admin database update.');
  }
}

function missing(error: any): boolean {
  const code = String(error?.code ?? '');
  const msg = String(error?.message ?? '');
  return code === 'PGRST202' || code === '42883' || code === '42P01' || code === 'PGRST205' || /could not find the function|does not exist|schema cache/i.test(msg);
}

async function call<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await withTimeout(supabase.rpc(fn, args) as any, 30000) as { data: T; error: any };
  if (error) {
    if (missing(error)) throw new NeedsUpdate();
    throw new Error(error.message || 'The database refused that.');
  }
  return data;
}

async function table<T>(work: PromiseLike<{ data: T | null; error: any }>): Promise<T> {
  const { data, error } = await withTimeout(work, 20000);
  if (error) {
    if (missing(error)) throw new NeedsUpdate();
    throw new Error(error.message || 'The database refused that.');
  }
  return data as T;
}

/* ---------- types ---------- */

export type PersonRow = {
  id: string; username: string; full_name: string; avatar_url: string; created_at: string; verified: boolean; plus: boolean;
  plus_until: string | null; suspended: boolean; deleted_at: string | null; admin_note: string; contact_email: string; contact_phone: string;
  account_type: string; is_private: boolean; admin_role: 'owner' | 'admin' | null; church_name: string | null; minor: boolean;
  last_seen: string | null; country: string | null; platform: string | null; posts: number; followers: number; following: number;
  messages: number; reports: number; spent_pence: number; alerts: number;
};

export type Session = {
  id: string; user_id: string; platform: string; ip: string; country: string | null; timezone: string; locale: string;
  app_version: string; device: string; user_agent: string; first_seen: string; last_seen: string; hits: number;
};

export type SecurityEvent = {
  id: string; kind: string; severity: 'low' | 'medium' | 'high'; user_id: string | null; username?: string | null; ip: string;
  detail: string; created_at: string; resolved_at: string | null; resolved_by: string | null;
};

export type Ban = { id: string; user_id: string; reason: string; until: string | null; created_by: string | null; created_at: string; lifted_at: string | null; lifted_by: string | null };

export type Person360 = {
  profile: Record<string, any> & { id: string; username: string; full_name: string; avatar_url: string; created_at: string; verified: boolean; plus: boolean;
    suspended: boolean; deleted_at: string | null; admin_note: string; admin_role: string | null; church_name: string | null; minor: boolean; };
  counts: Record<string, number>;
  sessions: Session[];
  transactions: any[];
  donations: any[];
  promotions: any[];
  fundraisers: any[];
  billing: any | null;
  bans: Ban[];
  alerts: SecurityEvent[];
  audit: { at: string; action: string; detail: string; admin: string | null }[];
  reports: any[];
  support: any[];
  requests: any[];
  groups: { id: string; name: string; kind: string; role: string; status: string }[];
  recent_posts: { id: string; kind: string; caption: string; media: any; created_at: string; likes: number; comments: number }[];
  timeline: { at: string; kind: string; detail: string }[];
  activity_days: { d: string; n: number }[];
  shared_addresses: { id: string; username: string; ip: string }[];
};

export type Slice = { label: string; value: number };

export type Analytics = {
  days: number;
  series: { d: string; signups: number; posts: number; stories: number; comments: number; likes: number; messages: number; calls: number; active: number; revenue_pence: number; reports: number }[];
  totals: { members: number; dau: number; wau: number; mau: number; online: number; revenue_pence: number; donations_pence: number; boosts_pence: number; subscribers: number; retention_pct: number };
  platforms: Slice[]; countries: Slice[]; timezones: Slice[]; content: Slice[]; accounts: Slice[]; revenue_kinds: Slice[]; hours: Slice[];
  top_creators: { id: string; username: string; full_name: string; avatar_url: string; verified: boolean; posts: number; likes: number; followers: number }[];
  top_posts: { id: string; kind: string; media: any; caption: string; created_at: string; username: string; likes: number; comments: number; views: number }[];
  churches: { id: string; name: string; city: string; members: number }[];
};

export type SecurityCentre = {
  events: SecurityEvent[];
  open_by_severity: { high: number; medium: number; low: number };
  flags: { kind: string; user_id: string; count: number; detail: string }[];
  shared_addresses: { ip: string; accounts: number; usernames: string[] }[];
  ip_bans: { ip: string; reason: string; created_by: string | null; created_at: string }[];
  suspended: { id: string; username: string; note: string; until: string | null }[];
  admins: { id: string; role: string; username: string; last_seen: string | null; actions_week: number }[];
  tables: { name: string; rls: boolean; policies: number }[];
  blocked_words: number; minors: number; sensitive_posts: number;
};

export type Money = {
  donations: any[]; fundraisers: any[]; promotions: any[]; subscriptions: any[];
  by_status: Slice[]; by_method: Slice[]; top_payers: { user_id: string; username: string; total: number; payments: number }[];
  failed: number; refunded_pence: number;
};

export type SystemHealth = {
  database_bytes: number;
  tables: { name: string; rows: number; bytes: number }[];
  storage: { bucket: string; files: number; bytes: number }[];
  jobs: { name: string; schedule: string; active: boolean; last_run: string | null; last_status: string | null; failures_day: number }[];
  purge_queue: number; connections: number; now: string;
};

export type SearchResults = {
  people?: any[]; addresses?: any[]; posts?: any[]; comments?: any[]; groups?: any[]; churches?: any[]; transactions?: any[]; tickets?: any[]; fundraisers?: any[];
};

export type Announcement = { id: string; title: string; body: string; level: 'info' | 'warning' | 'success'; starts_at: string; ends_at: string | null; created_by: string | null; created_at: string };

export type AuditRow = { id: string; admin_id: string | null; action: string; target_user: string | null; target_id: string | null; detail: string; created_at: string };

export type Action = 'suspend' | 'unsuspend' | 'close' | 'restore' | 'purge' | 'verify' | 'unverify' | 'plus' | 'unplus' | 'note' | 'wipe' | 'end_live';

/* ---------- calls ---------- */

export const fetchPeople = (q: string, filter: string, sort: string, limit = 50, offset = 0) =>
  call<{ total: number; rows: PersonRow[] }>('community_admin_people', { p_q: q, p_filter: filter, p_sort: sort, p_limit: limit, p_offset: offset });
export const fetchPerson = (id: string) => call<Person360>('community_admin_user', { p_user: id });
export const adminSearch = (q: string) => call<SearchResults>('community_admin_search', { p_q: q });
export const fetchAnalytics = (days: number) => call<Analytics>('community_admin_analytics', { p_days: days });
export const fetchSecurity = () => call<SecurityCentre>('community_admin_security');
export const fetchMoney = (days: number) => call<Money>('community_admin_money', { p_days: days });
export const fetchSystem = () => call<SystemHealth>('community_admin_system');
export const act = (user: string, action: Action, reason = '', days: number | null = null) =>
  call<{ ok: boolean; deleted?: boolean }>('community_admin_act', { p_user: user, p_action: action, p_reason: reason, p_days: days });

export const resolveEvent = (id: string, me: string) =>
  table(supabase.from('community_security_events').update({ resolved_at: new Date().toISOString(), resolved_by: me }).eq('id', id));
export const resolveAllEvents = (me: string) =>
  table(supabase.from('community_security_events').update({ resolved_at: new Date().toISOString(), resolved_by: me }).is('resolved_at', null));
export const banAddress = (ip: string, reason: string, me: string) =>
  table(supabase.from('community_ip_bans').insert({ ip: ip.trim(), reason: reason.trim().slice(0, 300), created_by: me }));
export const unbanAddress = (ip: string) => table(supabase.from('community_ip_bans').delete().eq('ip', ip));

export const fetchAudit = (limit = 300) =>
  table<AuditRow[]>(supabase.from('community_admin_audit').select('*').order('created_at', { ascending: false }).limit(limit) as any);

export const fetchAnnouncements = () =>
  table<Announcement[]>(supabase.from('community_announcements').select('*').order('created_at', { ascending: false }).limit(100) as any);
export const saveAnnouncement = (a: { title: string; body: string; level: Announcement['level']; ends_at: string | null }, me: string) =>
  table(supabase.from('community_announcements').insert({ ...a, title: a.title.trim().slice(0, 120), body: a.body.trim().slice(0, 1000), created_by: me }));
export const endAnnouncement = (id: string) => table(supabase.from('community_announcements').update({ ends_at: new Date().toISOString() }).eq('id', id));
export const deleteAnnouncement = (id: string) => table(supabase.from('community_announcements').delete().eq('id', id));

/** What everyone sees: the announcements running now. Quietly empty if the update isn't in yet. */
export async function liveAnnouncements(): Promise<Announcement[]> {
  try {
    const nowIso = new Date().toISOString();
    const rows = await table<Announcement[]>(supabase.from('community_announcements').select('*').lte('starts_at', nowIso).order('created_at', { ascending: false }).limit(5) as any);
    return (rows ?? []).filter((a) => !a.ends_at || a.ends_at > nowIso);
  } catch {
    return [];
  }
}

export const fetchBlockedWords = () => table<{ word: string; created_at: string }[]>(supabase.from('community_blocked_words').select('*').order('word') as any);
export const addBlockedWord = (w: string) => table(supabase.from('community_blocked_words').insert({ word: w.trim().toLowerCase().slice(0, 60) }));
export const removeBlockedWord = (w: string) => table(supabase.from('community_blocked_words').delete().eq('word', w));

export const fetchChurchesForReview = () =>
  table<any[]>(supabase.from('community_churches').select('*').order('created_at', { ascending: false }).limit(300) as any);
export const reviewChurch = (id: string, status: 'approved' | 'rejected', me: string) =>
  table(supabase.from('community_churches').update({ status, reviewed_by: me, reviewed_at: new Date().toISOString() }).eq('id', id));
export const removeChurch = (id: string) => table(supabase.from('community_churches').delete().eq('id', id));

export const fetchRecentContent = (kind: 'posts' | 'comments' | 'stories', q = '') => {
  if (kind === 'comments') {
    let query = supabase.from('community_comments').select('*').order('created_at', { ascending: false }).limit(150);
    if (q.trim()) query = query.ilike('text', '%' + q.trim() + '%');
    return table<any[]>(query as any);
  }
  if (kind === 'stories') return table<any[]>(supabase.from('community_stories').select('*').order('created_at', { ascending: false }).limit(150) as any);
  let query = supabase.from('community_posts').select('*').order('created_at', { ascending: false }).limit(150);
  if (q.trim()) query = query.ilike('caption', '%' + q.trim() + '%');
  return table<any[]>(query as any);
};
export const removeContent = (kind: 'posts' | 'comments' | 'stories', id: string) =>
  table(supabase.from(kind === 'posts' ? 'community_posts' : kind === 'comments' ? 'community_comments' : 'community_stories').delete().eq('id', id));

export const endPromotion = (id: string) => table(supabase.from('community_promotions').update({ status: 'ended', ends_at: new Date().toISOString() }).eq('id', id));
export const closeFundraiser = (id: string) => table(supabase.from('community_fundraisers').update({ status: 'closed' }).eq('id', id));
export const endLive = (id: string) => table(supabase.from('community_lives').update({ ended_at: new Date().toISOString() }).eq('id', id));
export const fetchLivesNow = () => table<any[]>(supabase.from('community_live_cards').select('*').limit(50) as any);

/**
 * Notes that this account opened the Mac (or web) app: the database records the address and
 * country it sees, and this adds the time zone, language and app version. Never blocks start-up.
 */
export async function touchSession(): Promise<{ blocked?: boolean }> {
  try {
    const platform = /Electron/i.test(navigator.userAgent) ? (/Mac/.test(navigator.platform) ? 'mac' : /Win/.test(navigator.platform) ? 'windows' : 'other') : 'web';
    const { data, error } = await supabase.rpc('community_touch_session', {
      p_platform: platform,
      p_version: typeof __VERSION__ === 'string' ? __VERSION__ : '',
      p_device: (navigator.platform || '').slice(0, 120),
      p_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
      p_locale: navigator.language || '',
    });
    if (error) return {};
    return (data as any) ?? {};
  } catch {
    return {};
  }
}

/* ---------- helpers ---------- */

export const pounds = (pence: number, currency = 'GBP') => {
  const sym = currency === 'GBP' ? '£' : currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency + ' ';
  return (pence < 0 ? '−' : '') + sym + (Math.abs(pence) / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export const bytes = (n: number) => {
  if (n < 1024) return n + ' B';
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n;
  let i = -1;
  do {
    v /= 1024;
    i++;
  } while (v >= 1024 && i < units.length - 1);
  return v.toFixed(v < 10 ? 1 : 0) + ' ' + units[i];
};

const regionNames = (() => {
  try {
    return new Intl.DisplayNames(['en-GB'], { type: 'region' });
  } catch {
    return null;
  }
})();
export const countryName = (code: string | null | undefined) => {
  if (!code || code === '??') return 'Unknown';
  try {
    return regionNames?.of(code) ?? code;
  } catch {
    return code;
  }
};
export const flag = (code: string | null | undefined) =>
  code && /^[A-Z]{2}$/.test(code) ? String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)) : '🌐';

export const PLATFORM_LABEL: Record<string, string> = { ios: 'iPhone', android: 'Android', mac: 'Mac app', windows: 'Windows app', web: 'Web', other: 'Other' };

/** Turns rows into a CSV download. */
export function downloadCsv(name: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** id → username for a handful of accounts (audit log, events). */
export async function usernames(ids: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return {};
  const rows = await table<{ id: string; username: string }[]>(supabase.from('community_profiles').select('id,username').in('id', unique) as any);
  return Object.fromEntries((rows ?? []).map((r) => [r.id, r.username]));
}

export const fetchQueue = () => call<{ churches_pending: number; verifications_pending: number; ads_active: number; fundraisers_active: number }>('community_admin_queue');
