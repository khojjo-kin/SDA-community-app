// Demo data for the church area (database v21): Sabbath School publishers and their posts, and
// Bible highlights and notes.
//
// The real database does a few things here with defaults, row-level security and triggers (a new
// request is pending, only admins pin, a member edits only their own posts, a hymn is keyed by its
// number). The in-memory stand-in (src/fake/supabase.ts) has no such rules and no .range(), so this
// file teaches its query builder those few things for these tables only, once the app has started.
import p05 from '../media/05.jpg';
import p13 from '../media/13.jpg';
import { supabase } from 'shared/supabase';
import type { Ctx, Ext, Row } from './types';

const H = 3600e3;
const ago = (hours: number) => new Date(Date.now() - hours * H).toISOString();

let ctx: Ctx | null = null;

const isAdmin = (uid: string) => !!ctx?.T('community_admins').some((a) => a.user_id === uid);
const isPublisher = (uid: string) => isAdmin(uid) || !!ctx?.T('community_publishers').some((p) => p.user_id === uid && p.status === 'approved');

/** Column defaults of the v21 tables (and Pod's play count), filled in on rows the app wrote without them. */
const DEFAULTS: Record<string, Row> = {
  community_publishers: { status: 'pending', note: '', decided_by: null, decided_at: null },
  community_sabbath_posts: { kind: 'study', body: '', lesson_ref: '', media: [], link: '', pinned: false },
  community_bible_marks: { translation: '', color: '', note: '' },
  community_pod_items: { plays: 0, description: '', cover_url: '', duration_seconds: 0 },
};

function fill(table: string) {
  const d = DEFAULTS[table];
  if (!d || !ctx) return;
  for (const r of ctx.T(table)) {
    for (const k of Object.keys(d)) if (r[k] === undefined) r[k] = Array.isArray(d[k]) ? [] : d[k];
    if (table === 'community_sabbath_posts') r.updated_at ??= r.created_at;
  }
}

/**
 * Adds .range() (used by fetchSabbathPosts) and the database's rules for the v21 tables to the
 * stand-in's query builder. Runs once, after every module has loaded (the client is made after the
 * demo data), and leaves anything already there alone.
 */
function teachQueries() {
  const proto = Object.getPrototypeOf(supabase.from('community_sabbath_posts')) as Row;
  if (!proto || proto.__church) return;
  proto.__church = true;
  if (!proto.range) {
    proto.range = function (this: Row, from: number, to: number) {
      this.__from = from;
      this.max = to + 1;
      return this;
    };
  }
  // A hymn's key is its number: an upsert without onConflict means that column, as it does in Postgres.
  const upsert = proto.upsert;
  proto.upsert = function (this: Row, rows: any, opts: Row = {}) {
    return upsert.call(this, rows, this.table === 'community_hymns' && !opts.onConflict ? { ...opts, onConflict: 'number' } : opts);
  };
  const run = proto.run;
  proto.run = function (this: Row) {
    const table: string = this.table;
    const me = ctx?.me() ?? '';
    fill(table);
    if (table === 'community_sabbath_posts') {
      // Row-level security: only approved publishers and admins write; members change only their own posts.
      if (this.op === 'insert' && !isPublisher(me)) return { data: null, error: { code: '42501', message: 'new row violates row-level security policy for table "community_sabbath_posts"' } };
      if ((this.op === 'update' || this.op === 'delete') && !isAdmin(me)) this.filters.push((r: Row) => r.author_id === me && (this.op === 'delete' || isPublisher(me)));
      // The guard trigger: only admins pin; the time of the change is kept.
      if (this.op === 'insert' || this.op === 'update') {
        for (const r of [].concat(this.payload) as Row[]) {
          if (!isAdmin(me)) {
            if (this.op === 'insert') r.pinned = false;
            else delete r.pinned;
          }
          r.updated_at = new Date().toISOString();
        }
      }
    }
    if (table === 'community_publishers' && this.op === 'update' && this.payload && 'status' in this.payload) {
      // The guard trigger: an admin's decision is signed and dated; a member may only ask again after a refusal.
      if (isAdmin(me)) Object.assign(this.payload, { decided_by: me, decided_at: new Date().toISOString() });
      else {
        const mine = ctx?.T('community_publishers').find((p) => p.user_id === me);
        if (mine?.status !== 'rejected' || this.payload.status !== 'pending') delete this.payload.status;
        else this.payload.decided_at = null;
      }
    }
    const out = run.call(this);
    fill(table);
    if (this.__from && Array.isArray(out.data)) out.data = out.data.slice(this.__from);
    return out;
  };
}

export const ext: Ext = {
  seed: (c) => {
    ctx = c;
    const { T } = c;
    // demo_me and Grace publish; Ruth is waiting; Esther was turned down (she can ask again); Joseph's
    // publishing was turned off. Daniel has never asked.
    T('community_publishers').push(
      { user_id: 'demo_me', status: 'approved', note: 'Sabbath School teacher at Hillside.', decided_by: 'u_grace', decided_at: ago(300), created_at: ago(320) },
      { user_id: 'u_grace', status: 'approved', note: 'Adult class teacher and choir director.', decided_by: 'demo_me', decided_at: ago(600), created_at: ago(610) },
      { user_id: 'u_ruth', status: 'pending', note: 'I lead the health ministries class on Sabbath mornings.', decided_by: null, decided_at: null, created_at: ago(6) },
      { user_id: 'u_esther', status: 'rejected', note: 'Adventurers club.', decided_by: 'demo_me', decided_at: ago(70), created_at: ago(90) },
      { user_id: 'u_joseph', status: 'revoked', note: 'Elder, morning devotions.', decided_by: 'demo_me', decided_at: ago(200), created_at: ago(400) },
    );
    const post = (id: string, author_id: string, hours: number, extra: Row) => ({ id, author_id, kind: 'study', body: '', lesson_ref: '', media: [], link: '', pinned: false, created_at: ago(hours), updated_at: ago(hours), ...extra });
    T('community_sabbath_posts').push(
      post('sp1', 'u_grace', 30, {
        kind: 'announcement',
        title: 'Sabbath School starts at 9:15 this quarter',
        body: 'From this Sabbath we begin at 9:15 so the children’s classes can finish their song service first.\n\nThe adult class meets in the main hall, the youth in the upper room.',
        pinned: true,
      }),
      post('sp2', 'demo_me', 5, {
        kind: 'study',
        title: 'Questions for this week’s discussion',
        body: 'Three questions to bring to class:\n\n1. Where do you see God’s faithfulness in this week’s memory text?\n2. What does rest look like for you this week?\n3. Who could you invite to study with you?',
        lesson_ref: 'This week’s lesson',
        media: [{ url: p05, type: 'image', w: 720, h: 720 }],
      }),
      post('sp3', 'u_grace', 54, {
        kind: 'resource',
        title: 'The lessons on the web',
        body: 'Every lesson, with the daily readings and the teacher comments, is also on the Sabbath School website.',
        link: 'https://sabbath-school.adventech.io',
      }),
      post('sp4', 'demo_me', 96, {
        kind: 'lesson',
        title: 'Memory verse cards for the children',
        body: 'Print these on card, cut them out and send one home with each child after class.',
        media: [{ url: p13, type: 'image', w: 720, h: 720 }],
      }),
    );
    // A highlighted verse with a note, and another in blue, so Highlights & notes has something to show.
    T('community_bible_marks').push(
      { user_id: 'demo_me', translation: 'kjv', book: 'John', chapter: 3, verse: 16, color: 'yellow', note: 'Memory verse for the youth this month.', updated_at: ago(20) },
      { user_id: 'demo_me', translation: 'kjv', book: 'Psalms', chapter: 46, verse: 10, color: 'blue', note: '', updated_at: ago(70) },
    );
    // The client is made just after the demo data; teach it the v21 rules once everything has loaded.
    queueMicrotask(teachQueries);
  },
  views: ({ T, me, profile }) => ({
    community_sabbath_post_cards: () =>
      T('community_sabbath_posts').map((s) => {
        const a = profile(s.author_id);
        return { ...s, username: a.username, full_name: a.full_name, avatar_url: a.avatar_url, verified: !!a.verified, mine: s.author_id === me() };
      }),
  }),
};
