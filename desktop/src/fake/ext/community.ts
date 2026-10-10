// Demo data for Churches and Communities & pages, and the database rules those screens rely on:
//   - Churches get map pins (so "Near me" can sort by distance), members, and one church of yours
//     an admin turned down. The one pending church stays the only one (the admin console's test
//     approves it and expects none left).
//   - As the real database: a church added by a member waits for an admin ("before insert" trigger),
//     members only read approved churches and their own, and deleting a church takes it off every
//     profile and group (on delete set null).
//   - Communities get more members; a private community you own has two people asking to join and a
//     few posts; another private one you are not in shows the "private" wall to non-admins.
//   - Creating a group follows the database function: pages are always public, handles are checked
//     and must be unique. Deleting a group takes its members and posts with it (on delete cascade).
// The posts here are older than every other sample post and none is yours, so the home feed and the
// counts other areas' tests rely on stay the same.
import p04 from '../media/04.jpg';
import p09 from '../media/09.jpg';
import p10 from '../media/10.jpg';
import p12 from '../media/12.jpg';
import p13 from '../media/13.jpg';
import { announce } from 'shared/store';
import type { Ctx, Ext, Row } from './types';

const H = 3600e3;
const ago = (hours: number) => new Date(Date.now() - hours * H).toISOString();
const img = (url: string, w = 720, h = 720) => ({ url, type: 'image', w, h });

/** The same rule as the database's check on group handles. */
const HANDLE = /^[a-z0-9_.]{3,30}$/;

/**
 * Watches a table the way the database's foreign keys do: `gone` is called with the rows a delete took
 * out (the fake replaces the whole array on delete), and `fresh` with each row about to be inserted.
 */
function watchTable(db: Record<string, Row[]>, table: string, on: { gone?: (rows: Row[]) => void; fresh?: (row: Row) => void }) {
  const hook = (rows: Row[]) => {
    if (on.fresh) {
      // Not enumerable, so the table still reads and copies like any other array.
      Object.defineProperty(rows, 'push', {
        configurable: true,
        writable: true,
        value(this: Row[], ...items: Row[]) {
          items.forEach(on.fresh!);
          return Array.prototype.push.apply(this, items);
        },
      });
    }
    return rows;
  };
  let rows = hook(db[table] ?? []);
  Object.defineProperty(db, table, {
    configurable: true,
    enumerable: true,
    get: () => rows,
    set: (next: Row[]) => {
      const kept = new Set(next);
      const gone = rows.filter((r) => !kept.has(r));
      rows = hook(next);
      if (gone.length) on.gone?.(gone);
    },
  });
}

export const ext: Ext = {
  seed: (ctx) => {
    const { T, db, me } = ctx;
    const isAdmin = () => T('community_admins').some((a) => a.user_id === me());

    /* ---------- churches ---------- */
    const church = (id: string) => T('community_churches').find((c) => c.id === id);
    // Pins near each other, so distances read like a real town's churches.
    Object.assign(church('ch1') ?? {}, { lat: 5.6037, lng: -0.187, website: 'hillside-sda.example.org' });
    Object.assign(church('ch2') ?? {}, { lat: 5.65, lng: -0.1 });
    Object.assign(church('ch3') ?? {}, { lat: 5.55, lng: -0.25 });
    T('community_churches').push(
      { id: 'ch4', name: 'Mountain View SDA Church', address: '21 Ridge Road', city: 'Sample Hills', country: 'Demo', lat: 6.0, lng: -0.5, website: '', service_times: 'Sabbath School 9:30 · Divine Service 11:00 · Vespers Friday 18:30', created_by: null, created_at: ago(700), status: 'approved', reviewed_by: null, reviewed_at: null },
      // Yours, turned down by an admin: only you see it, marked "Not approved".
      { id: 'ch5', name: 'Old Town Prayer House', address: '', city: 'Sample Town', country: 'Demo', lat: null, lng: null, website: '', service_times: '', created_by: 'demo_me', created_at: ago(300), status: 'rejected', reviewed_by: 'u_grace', reviewed_at: ago(250) },
    );
    // Who goes where (you have no church yet, so "This is my church" can be tried).
    const setChurch = (id: string, churchId: string) => {
      const p = T('community_profiles').find((x) => x.id === id);
      if (p) p.church_id = churchId;
    };
    for (const id of ['u_grace', 'u_daniel', 'u_joseph']) setChurch(id, 'ch1');
    for (const id of ['u_ruth', 'u_samuel']) setChurch(id, 'ch2');

    // Rows the sample data adds above are already decided; only churches added from now on go
    // through the trigger. Every area's sample data is in place before the first timer runs.
    let live = false;
    setTimeout(() => (live = true), 0);
    watchTable(db, 'community_churches', {
      // community_church_submitted(): anyone may suggest a church; only an admin's goes straight in.
      fresh: (row) => {
        if (!live) return;
        row.status = isAdmin() ? row.status ?? 'approved' : 'pending';
        row.reviewed_by ??= null;
        row.reviewed_at ??= null;
      },
      // A deleted church comes off members' profiles and groups (on delete set null).
      gone: (rows) => {
        const ids = new Set(rows.map((r) => r.id));
        for (const p of T('community_profiles')) if (ids.has(p.church_id)) p.church_id = null;
        for (const g of T('community_groups')) if (ids.has(g.church_id)) g.church_id = null;
      },
    });

    /* ---------- communities and pages ---------- */
    const group = (id: string) => T('community_groups').find((g) => g.id === id);
    Object.assign(group('g1') ?? {}, { church_id: 'ch1' });
    Object.assign(group('g2') ?? {}, { church_id: 'ch1' });
    T('community_groups').push(
      { id: 'g3', kind: 'community', name: 'Sabbath Prayer Circle', handle: 'prayer_circle', description: 'Prayer requests and praise reports, shared in confidence. We pray together every Friday at sunset.', cover_url: p04, privacy: 'private', church_id: 'ch1', created_by: 'demo_me', created_at: ago(650) },
      { id: 'g4', kind: 'community', name: "Women's Ministries", handle: 'womens_ministries', description: 'Fellowship, Bible study and outreach for the women of the church.', cover_url: p12, privacy: 'private', church_id: 'ch2', created_by: 'u_ruth', created_at: ago(640) },
    );
    const member = (group_id: string, user_id: string, role: 'owner' | 'admin' | 'member', hours: number, status: 'member' | 'pending' = 'member') => ({ group_id, user_id, role, status, created_at: ago(hours) });
    T('community_group_members').push(
      member('g1', 'u_joseph', 'admin', 680),
      member('g1', 'u_samuel', 'member', 400),
      member('g1', 'u_esther', 'member', 300),
      member('g2', 'u_ruth', 'member', 550),
      member('g2', 'u_joseph', 'member', 520),
      member('g2', 'u_samuel', 'member', 480),
      member('g3', 'demo_me', 'owner', 650),
      member('g3', 'u_grace', 'admin', 600),
      member('g3', 'u_ruth', 'member', 500),
      member('g3', 'u_joseph', 'member', 450),
      // Two people asking to join your private community.
      member('g3', 'u_samuel', 'member', 6, 'pending'),
      member('g3', 'u_esther', 'member', 3, 'pending'),
      member('g4', 'u_ruth', 'owner', 640),
      member('g4', 'u_esther', 'admin', 600),
      member('g4', 'u_grace', 'member', 560),
    );
    const post = (id: string, user_id: string, media: Row[], caption: string, hours: number, like_base: number, group_id: string) => ({
      id, user_id, media, caption, created_at: ago(hours), kind: 'post', location: '', like_base, view_base: like_base * 4, group_id,
    });
    T('community_posts').push(
      post('cm_p1', 'u_ruth', [img(p09)], 'Praise report: my mother is home from hospital. Thank you all for praying with us this week. 🙏', 230, 18, 'g3'),
      post('cm_p2', 'u_joseph', [img(p10, 720, 900)], 'Friday sunset prayer is at the garden bench this week. Bring a blanket, it gets cold.', 260, 11, 'g3'),
      post('cm_p3', 'u_ruth', [img(p13)], 'Please keep the families on the river road in your prayers as they rebuild.', 300, 9, 'g3'),
    );
    // A deleted group takes its members and posts with it (on delete cascade).
    watchTable(db, 'community_groups', {
      gone: (rows) => {
        const ids = new Set(rows.map((r) => r.id));
        db.community_group_members = T('community_group_members').filter((m) => !ids.has(m.group_id));
        const posts = new Set(T('community_posts').filter((p) => ids.has(p.group_id)).map((p) => p.id));
        if (!posts.size) return;
        db.community_posts = T('community_posts').filter((p) => !posts.has(p.id));
        for (const t of ['community_likes', 'community_saves', 'community_comments', 'community_reposts']) db[t] = T(t).filter((x) => !posts.has(x.post_id));
      },
    });

    // The community test turns admin rights off and on and reads the tables through this, then tells
    // the screens as a save would. Only the demo build has it.
    (globalThis as any).__communityDemo = { ...ctx, announce };
  },

  views: (ctx: Ctx) => {
    const { T, me, count } = ctx;
    const isAdmin = () => T('community_admins').some((a) => a.user_id === me());
    return {
      // Members read approved churches and the ones they suggested; admins read every church.
      community_churches: () =>
        T('community_churches')
          .filter((c) => (c.status ?? 'approved') === 'approved' || c.created_by === me() || isAdmin())
          .map((c) => ({ status: 'approved', reviewed_by: null, reviewed_at: null, ...c })),
      // As the base view, plus the name of the church a group belongs to.
      community_group_cards: () =>
        T('community_groups').map((g) => {
          const mine = T('community_group_members').find((m) => m.group_id === g.id && m.user_id === me());
          return {
            ...g,
            church_name: g.church_id ? T('community_churches').find((c) => c.id === g.church_id)?.name ?? null : null,
            member_count: count('community_group_members', (m) => m.group_id === g.id && m.status === 'member'),
            pending_count: count('community_group_members', (m) => m.group_id === g.id && m.status === 'pending'),
            posts_count: count('community_posts', (p) => p.group_id === g.id),
            my_standing: mine ? (mine.status === 'pending' ? 'pending' : mine.role) : null,
          };
        }),
    };
  },

  rpc: ({ T, me, insertRow }) => ({
    // community_create_group(): the creator becomes the owner in the same step; a page is always public.
    community_create_group: ({ p_kind, p_name, p_handle, p_description, p_privacy, p_cover_url, p_church_id }: Row) => {
      const name = String(p_name ?? '').trim();
      const handle = String(p_handle ?? '').toLowerCase();
      if (name.length < 2 || name.length > 80) throw new Error('new row for relation "community_groups" violates check constraint "community_groups_name_check"');
      if (!HANDLE.test(handle)) throw new Error('new row for relation "community_groups" violates check constraint "community_groups_handle_check"');
      if (T('community_groups').some((g) => g.handle === handle)) throw new Error('duplicate key value violates unique constraint "community_groups_handle_key"');
      const kind = p_kind === 'page' ? 'page' : 'community';
      const g = insertRow('community_groups', { kind, name, handle, description: p_description ?? '', privacy: kind === 'page' ? 'public' : p_privacy ?? 'public', cover_url: p_cover_url ?? '', church_id: p_church_id ?? null, created_by: me() });
      insertRow('community_group_members', { group_id: g.id, user_id: me(), role: 'owner', status: 'member' });
      return g.id;
    },
  }),
};
