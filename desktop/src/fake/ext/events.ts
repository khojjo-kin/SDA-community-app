// Demo data for database v23: church events (with answers), Bible reading days and Nearby on the map.
//
//   - Five events: one under way now and two coming up at the sample churches, a hike in the Youth
//     Ministry community, and a Bible study of your own. You said Going to the one under way and
//     Interested in the health expo, so every list has something in it.
//   - Reading days: a three-day run up to yesterday (today still to read) and an older week-long run.
//   - Nearby: two adults showing near Hillside church (at the very same rough place), one in Kumasi,
//     and one whose place lapsed a day ago. You don't show there until you turn it on.
//
// As the real database: community_event_cards and community_event_people are views (blocked people
// and private communities left out), only the organiser, an app admin or the community's managers
// change or delete an event, members under 14 can't post one, and a new start can't be in the past.
// The stand-in's query builder has no .not(); it is taught that here (fetchEvents' Going list and the
// map's events use it), once the app has started, as church.ts teaches it .range().
import p03 from '../media/03.jpg';
import p11 from '../media/11.jpg';
import p14 from '../media/14.jpg';
import { supabase } from 'shared/supabase';
import type { Ctx, Ext, Row } from './types';

const H = 3600e3;
const ago = (hours: number) => new Date(Date.now() - hours * H).toISOString();

/** A local date as the phone (and this computer) writes it: YYYY-MM-DD. */
const pad = (n: number) => String(n).padStart(2, '0');
const dayOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** The day `n` days before the YYYY-MM-DD day given. */
const daysBefore = (day: string, n: number) => {
  const [y, m, d] = day.split('-').map(Number);
  return dayOf(new Date(y, m - 1, d - n));
};
/** `days` from today at hh:mm, this computer's time. */
const at = (days: number, hh: number, mm = 0) => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, hh, mm).toISOString();
};

let ctx: Ctx | null = null;

const isAdmin = (uid: string) => !!ctx?.T('community_admins').some((a) => a.user_id === uid);
const standing = (gid: string, uid: string) => ctx?.T('community_group_members').find((m) => m.group_id === gid && m.user_id === uid && m.status === 'member')?.role ?? null;
const blockedEither = (a: string, b: string) => !!ctx?.T('community_blocks').some((x) => (x.blocker_id === a && x.blocked_id === b) || (x.blocker_id === b && x.blocked_id === a));
/** private.community_group_can_post: any member of a community; only the owner and admins of a page. */
const canPost = (gid: string, uid: string) => {
  const role = standing(gid, uid);
  return ctx?.T('community_groups').find((g) => g.id === gid)?.kind === 'page' ? role === 'owner' || role === 'admin' : !!role;
};
/** private.community_group_visible: public, a member, or an app admin. */
const groupVisible = (gid: string, uid: string) => ctx?.T('community_groups').find((g) => g.id === gid)?.privacy === 'public' || !!standing(gid, uid) || isAdmin(uid);
/** private.community_event_visible: not from someone blocked either way, and a community's only for those who see it. */
const eventVisible = (e: Row, uid: string) => !blockedEither(e.user_id, uid) && (!e.group_id || groupVisible(e.group_id, uid));
/** private.community_is_adult: a known birthday at least 18 years ago. */
function isAdult(uid: string): boolean {
  const born = ctx?.T('community_private_details').find((d) => d.user_id === uid)?.birth_date;
  if (!born) return false;
  const now = new Date();
  return born <= dayOf(new Date(now.getFullYear() - 18, now.getMonth(), now.getDate()));
}
const isMinor = (uid: string) => !!ctx?.T('community_profiles').find((p) => p.id === uid)?.restricted;
const fresh = (iso: string) => Date.now() - new Date(iso).getTime() < 24 * H;

/** How far apart two places are, in kilometres. */
function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lng - a.lng) * rad) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** The guard trigger on events: words trimmed, and a start neither in the past nor over two years out. */
function startProblem(iso: unknown): string {
  const t = new Date(String(iso)).getTime();
  if (!Number.isFinite(t)) return 'invalid input syntax for type timestamp with time zone';
  if (t < Date.now() - H) return "Choose a time that hasn't passed.";
  if (t > Date.now() + 730 * 24 * H) return 'Events can be planned up to two years ahead.';
  return '';
}
const refusal = (table: string) => ({ data: null, error: { code: '42501', message: `new row violates row-level security policy for table "${table}"` } });

/** A row matches `op value` the way PostgREST reads it ("is null", "eq x"), for .not(). */
function matches(op: string, a: any, value: any): boolean {
  if (op === 'is') return value === null || value === 'null' ? a == null : a === (value === true || value === 'true');
  if (op === 'eq') return String(a) === String(value);
  if (op === 'in') return String(value).replace(/^\(|\)$/g, '').split(',').includes(String(a));
  return false;
}

/**
 * Teaches the stand-in's query builder .not() and the database's rules for the event tables. Runs
 * once, after every module has loaded, and leaves anything already there alone.
 */
function teachQueries() {
  const proto = Object.getPrototypeOf(supabase.from('community_events')) as Row;
  if (!proto || proto.__events) return;
  proto.__events = true;
  if (!proto.not) {
    proto.not = function (this: Row, col: string, op: string, value: any) {
      this.filters.push((r: Row) => !matches(op, r[col], value));
      return this;
    };
  }
  const run = proto.run;
  proto.run = function (this: Row) {
    const me = ctx?.me() ?? '';
    if (this.table === 'community_events') {
      if (this.op === 'insert') {
        if (isMinor(me)) return refusal('community_events');
        for (const r of [].concat(this.payload) as Row[]) {
          if (r.user_id !== me || (r.group_id && !canPost(r.group_id, me))) return refusal('community_events');
          r.title = String(r.title ?? '').trim();
          r.description = String(r.description ?? '').trim();
          r.place = String(r.place ?? '').trim();
          if (!r.title) return { data: null, error: { code: '23514', message: 'new row for relation "community_events" violates check constraint "community_events_title_check"' } };
          const bad = startProblem(r.starts_at);
          if (bad) return { data: null, error: { code: 'P0001', message: bad } };
          Object.assign(r, { kind: r.kind ?? 'other', ends_at: r.ends_at ?? null, lat: r.lat ?? null, lng: r.lng ?? null, cover_url: r.cover_url ?? '', church_id: r.church_id ?? null, group_id: r.group_id ?? null, cancelled_at: null, updated_at: new Date().toISOString() });
        }
      }
      if (this.op === 'update' || this.op === 'delete') {
        // Only the organiser, an app admin or the community's managers: anyone else changes nothing.
        if (!isAdmin(me)) this.filters.push((r: Row) => r.user_id === me || (!!r.group_id && ['owner', 'admin'].includes(standing(r.group_id, me) ?? '')));
      }
      if (this.op === 'update' && this.payload) {
        const p = this.payload as Row;
        delete p.user_id;
        delete p.created_at;
        for (const k of ['title', 'description', 'place']) if (typeof p[k] === 'string') p[k] = p[k].trim();
        if ('starts_at' in p) {
          const moved = (ctx?.T('community_events') ?? []).some((r) => this.match(r) && r.starts_at !== p.starts_at);
          const bad = moved ? startProblem(p.starts_at) : '';
          if (bad) return { data: null, error: { code: 'P0001', message: bad } };
        }
        p.updated_at = new Date().toISOString();
      }
    }
    const out = run.call(this);
    // An event deleted takes its answers with it (on delete cascade).
    if (this.table === 'community_events' && this.op === 'delete' && ctx) {
      const ids = new Set((ctx.T('community_events') as Row[]).map((e) => e.id));
      ctx.db.community_event_rsvps = ctx.T('community_event_rsvps').filter((r) => ids.has(r.event_id));
    }
    return out;
  };
}

export const ext: Ext = {
  seed: (c) => {
    ctx = c;
    const { T } = c;

    /* ---------- events ---------- */
    const event = (id: string, user_id: string, extra: Row): Row => ({
      id, user_id, church_id: null, group_id: null, kind: 'other', description: '', ends_at: null, place: '', lat: null, lng: null, cover_url: '', cancelled_at: null, created_at: ago(48), updated_at: ago(48), ...extra,
    });
    T('community_events').push(
      // Under way now: started an hour ago, ends in an hour.
      event('ev1', 'u_joseph', {
        church_id: 'ch1', kind: 'prayer', title: 'Morning prayer meeting',
        description: 'An hour of prayer and praise before the working day. Come as you are.',
        starts_at: new Date(Date.now() - H).toISOString(), ends_at: new Date(Date.now() + H).toISOString(),
        place: 'Hillside church, prayer room', lat: 5.6039, lng: -0.1872, created_at: ago(120),
      }),
      // Yours, tomorrow afternoon, with no pin and no cover.
      event('ev2', 'demo_me', {
        kind: 'bible_study', title: 'Sabbath afternoon Bible study',
        description: 'We are reading through the Gospel of John, a chapter a week. Bring a Bible and a friend.',
        starts_at: at(1, 16), place: '3 Palm Avenue', created_at: ago(30),
      }),
      event('ev3', 'u_daniel', {
        church_id: 'ch1', kind: 'youth', title: 'Youth Vespers',
        description: 'Songs, a short talk and supper together to welcome the Sabbath. Everyone from 15 to 35 is welcome.',
        starts_at: at(2, 18, 30), ends_at: at(2, 20, 30), place: 'Hillside church hall, 12 Hill Road', lat: 5.6041, lng: -0.1866, cover_url: p03, created_at: ago(72),
      }),
      event('ev4', 'u_ruth', {
        church_id: 'ch2', kind: 'outreach', title: 'Community Health Expo',
        description: 'Free blood pressure checks, cooking demonstrations and advice on healthy living, for everyone in the neighbourhood.',
        starts_at: at(6, 10), ends_at: at(6, 15), place: 'Riverside Adventist Fellowship, 4 River Lane', lat: 5.6505, lng: -0.0995, cover_url: p11, created_at: ago(96),
      }),
      // In the Youth Ministry community (you are a member).
      event('ev5', 'u_daniel', {
        church_id: 'ch1', group_id: 'g1', kind: 'social', title: 'Pathfinder hike',
        description: 'A morning walk through the hills. Wear good shoes and bring water.',
        starts_at: at(9, 7), ends_at: at(9, 13), place: 'Aburi botanical gardens, main gate', lat: 5.8483, lng: -0.1756, cover_url: p14, created_at: ago(26),
      }),
    );
    const answer = (event_id: string, user_id: string, status: 'going' | 'interested', hours: number) => ({ event_id, user_id, status, created_at: ago(hours) });
    T('community_event_rsvps').push(
      answer('ev1', 'u_grace', 'going', 20),
      answer('ev1', 'demo_me', 'going', 10),
      answer('ev2', 'u_ruth', 'going', 12),
      answer('ev3', 'u_grace', 'going', 40),
      answer('ev3', 'u_joseph', 'going', 30),
      answer('ev3', 'u_samuel', 'interested', 25),
      answer('ev4', 'u_grace', 'going', 50),
      answer('ev4', 'u_esther', 'going', 44),
      answer('ev4', 'u_joseph', 'interested', 40),
      answer('ev4', 'demo_me', 'interested', 8),
      answer('ev5', 'u_esther', 'going', 20),
      answer('ev5', 'u_samuel', 'going', 18),
    );

    /* ---------- reading days ---------- */
    const today = dayOf(new Date());
    const read = (n: number, chapters = 1) => ({ user_id: 'demo_me', day: daysBefore(today, n), chapters });
    // Yesterday and the two days before (a run of three), five days ago, and a week three weeks back.
    T('community_reading_days').push(read(1, 2), read(2), read(3), read(5), ...[20, 21, 22, 23, 24, 25, 26].map((n) => read(n)));

    /* ---------- Nearby ---------- */
    const near = (user_id: string, lat: number, lng: number, minutes: number) => ({ user_id, lat, lng, updated_at: new Date(Date.now() - minutes * 60e3).toISOString() });
    T('community_nearby').push(
      // Samuel and Esther share one rounded place near Hillside church.
      near('u_samuel', 5.61, -0.19, 12),
      near('u_esther', 5.61, -0.19, 50),
      near('u_grace', 6.69, -1.62, 5),
      // Over a day without an update: no longer shown.
      near('u_joseph', 5.62, -0.2, 30 * 60),
    );

    // The events test reads the tables through this (the demo build only).
    (globalThis as any).__eventsDemo = c;
    queueMicrotask(teachQueries);
  },

  views: ({ T, me, profile }) => ({
    community_event_cards: () => {
      const uid = me();
      return T('community_events')
        .filter((e) => !profile(e.user_id).deleted_at && eventVisible(e, uid))
        .map((e) => {
          const a = profile(e.user_id);
          const answers = T('community_event_rsvps').filter((r) => r.event_id === e.id && !profile(r.user_id).deleted_at);
          const going = answers.filter((r) => r.status === 'going').sort((x, y) => (x.created_at < y.created_at ? 1 : -1));
          return {
            ...e,
            updated_at: e.updated_at ?? e.created_at,
            username: a.username, full_name: a.full_name, avatar_url: a.avatar_url ?? '', verified: !!a.verified,
            church_name: e.church_id ? T('community_churches').find((c) => c.id === e.church_id)?.name ?? null : null,
            group_name: e.group_id ? T('community_groups').find((g) => g.id === e.group_id)?.name ?? null : null,
            going_count: going.length,
            interested_count: answers.filter((r) => r.status === 'interested').length,
            my_rsvp: answers.find((r) => r.user_id === uid)?.status ?? null,
            going_avatars: going.map((r) => profile(r.user_id).avatar_url).filter(Boolean).slice(0, 5),
            mine: e.user_id === uid,
          };
        });
    },
    community_event_people: () => {
      const uid = me();
      return T('community_event_rsvps')
        .filter((r) => {
          const e = T('community_events').find((x) => x.id === r.event_id);
          return !!e && eventVisible(e, uid) && !blockedEither(r.user_id, uid) && !profile(r.user_id).deleted_at;
        })
        .map((r) => {
          const p = profile(r.user_id);
          return { event_id: r.event_id, user_id: r.user_id, status: r.status, created_at: r.created_at, username: p.username, full_name: p.full_name, avatar_url: p.avatar_url ?? '', verified: !!p.verified };
        });
    },
  }),

  rpc: ({ T, me, profile }) => ({
    // A chapter read on the member's own day (a day either side of the server's is allowed).
    community_mark_reading: ({ p_day }: { p_day: string }) => {
      const uid = me();
      const row = T('community_reading_days').find((d) => d.user_id === uid && d.day === p_day);
      if (row) row.chapters = Math.min(2000, row.chapters + 1);
      else T('community_reading_days').push({ user_id: uid, day: p_day, chapters: 1 });
      return null;
    },
    // The current run (alive until the end of today if yesterday was read), the best run, today, all days, the last seven.
    community_reading_streak: ({ p_today }: { p_today: string }) => {
      const days = new Set<string>(T('community_reading_days').filter((d) => d.user_id === me() && d.day <= p_today).map((d) => d.day));
      const runFrom = (day: string) => {
        let n = 0;
        while (days.has(daysBefore(day, n))) n++;
        return n;
      };
      const current = days.has(p_today) ? runFrom(p_today) : runFrom(daysBefore(p_today, 1));
      let best = 0;
      for (const d of days) if (!days.has(daysBefore(d, -1))) best = Math.max(best, runFrom(d));
      const week = [...days].filter((d) => d > daysBefore(p_today, 7)).sort();
      return [{ current_streak: current, best_streak: best, read_today: days.has(p_today), total_days: days.size, last_days: week }];
    },
    // Nearby keeps only a rough place (two decimal places), and only for adults who aren't suspended.
    community_nearby_set: ({ p_lat, p_lng }: { p_lat: number; p_lng: number }) => {
      const uid = me();
      if (typeof p_lat !== 'number' || typeof p_lng !== 'number' || Math.abs(p_lat) > 90 || Math.abs(p_lng) > 180) return false;
      if (!isAdult(uid) || profile(uid).suspended) return false;
      const row = { user_id: uid, lat: Math.round(p_lat * 100) / 100, lng: Math.round(p_lng * 100) / 100, updated_at: new Date().toISOString() };
      const had = T('community_nearby').find((n) => n.user_id === uid);
      if (had) Object.assign(had, row);
      else T('community_nearby').push(row);
      return true;
    },
    community_nearby_off: () => {
      if (ctx) ctx.db.community_nearby = T('community_nearby').filter((n) => n.user_id !== me());
      return null;
    },
    community_nearby_on: () => T('community_nearby').some((n) => n.user_id === me() && fresh(n.updated_at)),
    community_nearby_people: ({ p_lat, p_lng, p_km = 30 }: { p_lat: number; p_lng: number; p_km?: number }) => {
      const uid = me();
      if (!isAdult(uid) || !T('community_nearby').some((n) => n.user_id === uid && fresh(n.updated_at))) return [];
      const limit = Math.min(Math.max(p_km ?? 30, 1), 100);
      return T('community_nearby')
        .filter((n) => n.user_id !== uid && fresh(n.updated_at) && !blockedEither(n.user_id, uid) && isAdult(n.user_id))
        .map((n) => ({ n, p: profile(n.user_id), d: km({ lat: p_lat, lng: p_lng }, n) }))
        .filter(({ p, d }) => d <= limit && !p.deleted_at && !p.suspended)
        .sort((a, b) => a.d - b.d)
        .slice(0, 100)
        .map(({ n, p, d }) => ({ user_id: n.user_id, username: p.username, full_name: p.full_name, avatar_url: p.avatar_url ?? '', verified: !!p.verified, lat: n.lat, lng: n.lng, km: Math.round(d * 10) / 10, updated_at: n.updated_at }));
    },
  }),
};
