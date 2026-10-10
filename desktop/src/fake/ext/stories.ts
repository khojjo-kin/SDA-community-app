// Demo data for stories, Shorts and live: a live by Samuel with comments and a fundraiser, timed
// captions on a Short (and their translations), my own story with viewers who watched it again,
// a Plus member's ring colour, a story alert, and a live I have planned.
import p10 from '../media/10.jpg';
import reel2 from '../media/reel2.mp4';
import reel2Poster from '../media/reel2.jpg';
import type { Ext, Row } from './types';

const H = 3600e3;
const ago = (hours: number) => new Date(Date.now() - hours * H).toISOString();
const ahead = (hours: number) => new Date(Date.now() + hours * H).toISOString();

/** Samuel's live: a uuid, as the real database gives. */
export const DEMO_LIVE = '5a3e1000-0000-4000-8000-000000000001';

/** The Short's captions, and what the captions function answers when asked for another language. */
const CAPTIONS = [
  { s: 0, e: 2, t: 'The moon is rising over the hills' },
  { s: 2, e: 4, t: 'Sabbath is almost here' },
  { s: 4, e: 6, t: 'Happy Sabbath, church family' },
];
const TRANSLATED: Record<string, string[]> = {
  es: ['La luna sale sobre las colinas', 'El sábado ya casi llega', 'Feliz sábado, familia de la iglesia'],
  fr: ['La lune se lève sur les collines', 'Le sabbat est presque là', "Joyeux sabbat, famille de l'église"],
  pt: ['A lua está nascendo sobre as colinas', 'O sábado está quase chegando', 'Feliz sábado, família da igreja'],
};

export const ext: Ext = {
  seed: ({ T }) => {
    const person = (id: string) => T('community_profiles').find((p) => p.id === id);
    // Ruth has Plus and chose the Sunset ring for her stories.
    Object.assign(person('u_ruth') ?? {}, { plus_until: ahead(24 * 30), ring_color: 'sunset' });

    // My own story, still up, and who has watched it (some more than once: a Plus member sees that).
    T('community_stories').push({ id: 's_me1', user_id: 'demo_me', item: { url: p10, type: 'image', w: 720, h: 900, caption: 'Youth hall, ready for Friday vespers' }, created_at: ago(1.5), expires_at: ahead(22.5), audience: 'everyone' });
    const view = (viewer_id: string, first: number, last: number, view_count: number) => ({ story_id: 's_me1', viewer_id, viewed_at: ago(first), last_viewed_at: ago(last), view_count });
    T('community_story_views').push(view('u_grace', 1.2, 0.3, 3), view('u_daniel', 1.1, 1.1, 1), view('u_esther', 0.9, 0.5, 2), view('u_joseph', 0.6, 0.6, 1));
    // I'm told when Grace watches my stories (Plus).
    T('community_story_watch').push({ user_id: 'demo_me', target_id: 'u_grace', created_at: ago(48) });
    // A video story, so the viewer has something to mute.
    T('community_stories').push({ id: 's9', user_id: 'u_joseph', item: { url: reel2, type: 'video', w: 720, h: 1280, poster: reel2Poster, duration: 6 }, created_at: ago(5), expires_at: ahead(19), audience: 'everyone' });

    // Fundraisers: one Samuel's live collects for, and one of mine to link when I go live.
    T('community_fundraisers').push(
      { id: 'fr_media', user_id: 'u_samuel', title: 'Cameras for the media team', description: 'Two cameras so every service can be streamed.', goal_pence: 120000, currency: 'GBP', cover_url: '', ends_at: null, status: 'active', created_at: ago(300) },
      { id: 'fr_bus', user_id: 'demo_me', title: 'Minibus for youth camp', description: 'Getting the Pathfinders to camp and back.', goal_pence: 300000, currency: 'GBP', cover_url: '', ends_at: null, status: 'active', created_at: ago(200) },
    );

    // Samuel is live now, with a few comments already written.
    T('community_lives').push({ id: DEMO_LIVE, user_id: 'u_samuel', title: 'Vespers on the hill', started_at: ago(0.4), created_at: ago(0.4), ended_at: null, viewers: 12, audience: 'followers', fundraiser_id: 'fr_media' });
    T('community_live_comments').push(
      { id: '5a3e2000-0000-4000-8000-000000000001', live_id: DEMO_LIVE, user_id: 'u_grace', text: 'Beautiful sky tonight 🙏', created_at: ago(0.3) },
      { id: '5a3e2000-0000-4000-8000-000000000002', live_id: DEMO_LIVE, user_id: 'u_daniel', text: 'Pathfinders are watching from the hall!', created_at: ago(0.2) },
      { id: '5a3e2000-0000-4000-8000-000000000003', live_id: DEMO_LIVE, user_id: 'u_joseph', text: 'Amen', created_at: ago(0.1) },
    );

    // A live I have planned for tomorrow evening.
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(19, 0, 0, 0);
    T('community_live_schedules').push({ id: '5a3e3000-0000-4000-8000-000000000001', user_id: 'demo_me', title: 'Youth Bible study', starts_at: tomorrow.toISOString(), created_at: ago(2) });

    // Timed captions on the first Short, made from its audio in English.
    Object.assign(T('community_posts').find((p) => p.id === 'r1') ?? {}, { captions: CAPTIONS, captions_lang: 'en', captions_status: 'ready' });
  },

  views: ({ T, me, profile, follows }) => ({
    // Story views carry how often and when (database version 14); older rows read as one view.
    community_story_views: () => T('community_story_views').map((v) => ({ ...v, viewed_at: v.viewed_at ?? v.created_at, last_viewed_at: v.last_viewed_at ?? v.viewed_at ?? v.created_at, view_count: v.view_count ?? 1 })),
    // As the stand-in's own card, with started_at filled in, as the real database does for a new live.
    community_live_cards: () =>
      T('community_lives').map((l) => {
        const a = profile(l.user_id);
        return { viewers: 0, ended_at: null, audience: 'followers', fundraiser_id: null, ...l, started_at: l.started_at ?? l.created_at, username: a.username, full_name: a.full_name, avatar_url: a.avatar_url, verified: !!a.verified, following: follows(me(), l.user_id) };
      }),
  }),

  rpc: ({ T, me, now }) => ({
    // Watching a story again counts once more, as the real function does.
    community_story_rewatch: ({ p_story }: { p_story: string }) => {
      const v = T('community_story_views').find((x) => x.story_id === p_story && x.viewer_id === me());
      if (v) Object.assign(v, { view_count: (v.view_count ?? 1) + 1, last_viewed_at: now() });
      return null;
    },
  }),

  functions: ({ T }) => ({
    // Captions are made on the server from a Short's audio; here they are already made, and three
    // languages have translations.
    captions: (body: Row) => {
      if (body.action !== 'translate') return { ok: true };
      const post = T('community_posts').find((p) => p.id === body.post_id);
      const words = TRANSLATED[String(body.lang ?? '').slice(0, 2)];
      if (!post?.captions || !words) return { captions: null };
      return { captions: post.captions.map((l: Row, i: number) => ({ ...l, t: words[i] ?? l.t })) };
    },
  }),
};
