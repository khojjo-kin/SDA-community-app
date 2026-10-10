// Demo data for the profile area, so every part of a profile shows in the demo:
//   - Grace offers a creator subscription (£2.99 a month), has Plus with a gold ring and the Sabbath
//     theme, two lives planned ahead and two highlights; she is based in Ghana with a notable tick.
//   - Some of the sample posts tag people, so the Tagged tab has something in it.
//   - Your own highlight gets a second story, so editing it (cover, removing stories) can be tried.
//   - kwame_deals is a private account you don't follow, for the "This account is private" view.
// Only existing sample people and posts are changed (no new accounts or posts), so the counts other
// areas' tests rely on stay the same.
import p03 from '../media/03.jpg';
import p05 from '../media/05.jpg';
import p08 from '../media/08.jpg';
import p09 from '../media/09.jpg';
import p14 from '../media/14.jpg';
import { announce } from 'shared/store';
import type { Ext } from './types';

const HOUR = 3600e3;
const ago = (hours: number) => new Date(Date.now() - hours * HOUR).toISOString();
const later = (hours: number) => new Date(Date.now() + hours * HOUR).toISOString();

/** A day from today (0 = today) at a time of day, as an ISO date. */
function dayAt(days: number, hour: number, minute = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

const img = (url: string, w = 720, h = 720) => ({ url, type: 'image', w, h });

export const ext: Ext = {
  seed: (ctx) => {
    const { T } = ctx;
    const person = (id: string) => T('community_profiles').find((p) => p.id === id);
    const post = (id: string) => T('community_posts').find((p) => p.id === id);

    const grace = person('u_grace');
    if (grace) {
      Object.assign(grace, {
        sub_price_pence: 299,
        // Plus until the same day as her sample billing record in the admin console.
        plus_until: later(10 * 24),
        ring_color: 'gold',
        profile_theme: 'sabbath',
        country: 'Ghana',
        verified_via: 'notable',
        website: 'hillside.church/choir',
        bio: 'Choir · Sabbath School teacher · Psalm 100\nRehearsals with @daniel_owusu every Thursday',
      });
    }
    const me = person('demo_me');
    if (me) Object.assign(me, { country: 'United Kingdom', verified_via: 'plus' });
    const daniel = person('u_daniel');
    if (daniel) Object.assign(daniel, { country: 'Ghana' });
    const kwame = person('u_kwame');
    if (kwame) Object.assign(kwame, { is_private: true, country: 'Ghana' });

    // People tagged in posts.
    const tag = (id: string, ids: string[]) => {
      const p = post(id);
      if (p) p.tagged_ids = ids;
    };
    tag('p1', ['demo_me', 'u_ruth']);
    tag('p5', ['demo_me']);
    tag('p6', ['u_grace']);

    // Lives Grace has planned ahead.
    T('community_live_schedules').push(
      { id: 'ls1', user_id: 'u_grace', title: 'Choir rehearsal, live from the church hall', starts_at: dayAt(1, 19, 30), created_at: ago(30) },
      { id: 'ls2', user_id: 'u_grace', title: 'Sabbath vespers', starts_at: dayAt(4, 18), created_at: ago(20) },
    );

    // Grace's highlights, and a second story in your own "Sabbath" highlight.
    T('community_highlights').push(
      { id: 'hg1', user_id: 'u_grace', title: 'Choir', cover_url: p09, created_at: ago(900) },
      { id: 'hg2', user_id: 'u_grace', title: 'Camp', cover_url: p03, created_at: ago(700) },
    );
    T('community_highlight_items').push(
      { id: 'hgi1', highlight_id: 'hg1', user_id: 'u_grace', item: { ...img(p09), caption: 'Choir practice tonight at 7' }, created_at: ago(900) },
      { id: 'hgi2', highlight_id: 'hg1', user_id: 'u_grace', item: img(p08, 720, 900), created_at: ago(880) },
      { id: 'hgi3', highlight_id: 'hg2', user_id: 'u_grace', item: img(p03), created_at: ago(700) },
      { id: 'hgi4', highlight_id: 'hg2', user_id: 'u_grace', item: img(p05, 720, 900), created_at: ago(690) },
      { id: 'hi2', highlight_id: 'h1', user_id: 'demo_me', item: img(p14, 720, 900), created_at: ago(390) },
    );

    // The profile test changes a sample row now and then (someone goes live, hides their lists) and
    // then tells the screens, as a save would; it reaches the in-memory tables through this. Only the
    // demo build has it.
    (globalThis as any).__profileDemo = { ...ctx, announce };
  },
};
