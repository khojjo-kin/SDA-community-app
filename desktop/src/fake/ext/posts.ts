// Demo data for the posts area: sample posts with what database v20 added (a poll, a prompt, the AI
// label, tagged people, a post for subscribers, a sensitive post, hidden likes and commenting off), a
// post in a community, and a paid ad. Also the post cards view as the real one works it out: a post
// is Sponsored while its paid days last, carries its community's name, and is left out for members
// under 14 when it is marked sensitive.
import p03 from '../media/03.jpg';
import p04 from '../media/04.jpg';
import p06 from '../media/06.jpg';
import p08 from '../media/08.jpg';
import p10 from '../media/10.jpg';
import p11 from '../media/11.jpg';
import p13 from '../media/13.jpg';
import p14 from '../media/14.jpg';
import type { Ext, Row } from './types';

const H = 3600e3;
const ago = (hours: number) => new Date(Date.now() - hours * H).toISOString();
const img = (url: string, w = 720, h = 720) => ({ url, type: 'image', w, h });

export const ext: Ext = {
  seed: ({ T }) => {
    // Every sample here is older than the newest three posts, so the home feed still opens on those.
    const post = (id: string, user_id: string, media: Row[], caption: string, hours: number, like_base: number, extra: Row = {}) => ({
      id, user_id, media, caption, created_at: ago(hours), kind: 'post', location: '', like_base, view_base: like_base * 4, ...extra,
    });
    T('community_posts').push(
      post('pp_poll', 'u_grace', [img(p08, 720, 900)], 'Choir family, help us choose! We sing it at the close of Divine Service on Sabbath. 🎶', 12, 64, {
        poll: { question: "Pick this week's closing hymn", options: ['Amazing Grace', 'Blessed Assurance', 'It Is Well With My Soul'] },
        poll_base: [12, 7, 9],
        location: 'Hillside SDA Church',
      }),
      post('pp_prompt', 'u_daniel', [img(p03)], 'Pathfinders worship tonight was on courage. Joshua 1:9 🔥', 14, 58, {
        prompt: 'Which Bible verse got you through this week?',
        group_id: 'g1',
      }),
      post('pp_ai', 'u_samuel', [img(p13)], 'A drawing of how the new fellowship hall could look, made with an AI image tool from the architect’s plans. What do you think?', 16, 37, {
        ai_label: true,
        hide_likes: true,
        comments_off: true,
      }),
      post('pp_tags', 'u_ruth', [img(p04), img(p10)], 'Garden club harvest with the best helpers 🌱 Swipe for the beans!', 18, 92, {
        tagged_ids: ['demo_me', 'u_grace', 'u_esther'],
        location: 'Church garden',
        // A song from Pod goes with it (Create → Add music).
        audio_id: 'pod1',
      }),
      post('pp_subs', 'u_grace', [img(p11, 720, 900)], 'Rehearsal notes for this month: the alto line for "It Is Well", bar by bar. Thank you for supporting the choir!', 20, 41, {
        audience: 'subscribers',
      }),
      post('pp_sensitive', 'u_joseph', [img(p14)], 'Pictures from the flood clean-up on the river road. Please keep the families who lost their homes in your prayers.', 22, 120, {
        sensitive: true,
      }),
      post('pp_boost', 'u_daniel', [img(p06, 720, 900)], 'Pathfinders fun day is this Sunday from 10:00. Games, a nature walk and lunch together. Everyone welcome, bring a friend!', 24, 83, {
        boosted_until: new Date(Date.now() + 4 * 24 * H).toISOString(),
      }),
    );
    // The ad behind the Sponsored post, paid for like any other.
    T('community_promotions').push({
      id: 'pm_pp1', post_id: 'pp_boost', user_id: 'u_daniel', days: 5, amount_pence: 500, currency: 'GBP', status: 'active', payment_intent_id: null,
      starts_at: ago(24), ends_at: new Date(Date.now() + 4 * 24 * H).toISOString(), created_at: ago(24),
    });
    // Answers to the prompt.
    T('community_comments').push(
      { id: 'cpp1', post_id: 'pp_prompt', user_id: 'u_esther', text: 'Isaiah 41:10. Every single morning this week.', created_at: ago(13) },
      { id: 'cpp2', post_id: 'pp_prompt', user_id: 'u_joseph', text: 'Psalm 46:1, our refuge and strength.', created_at: ago(12.5) },
      { id: 'cpp3', post_id: 'pp_poll', user_id: 'u_ruth', text: 'It Is Well, always!', created_at: ago(11) },
    );
    // Grace offers a subscription, so her subscribers-only post has someone to be for.
    const grace = T('community_profiles').find((p) => p.id === 'u_grace');
    if (grace && grace.sub_price_pence == null) grace.sub_price_pence = 299;
  },

  views: ({ T, me, postCard }) => ({
    community_post_cards: () => {
      const minor = !!T('community_profiles').find((p) => p.id === me())?.restricted;
      return (
        T('community_posts')
          // Members under 14 never receive sensitive posts (database v11).
          .filter((p) => !(minor && p.sensitive && p.user_id !== me()))
          .map((p) => {
            const card = postCard(p);
            const group = p.group_id ? T('community_groups').find((g) => g.id === p.group_id) : null;
            // As the real view: a post's song is read from Pod by its audio_id.
            const song = p.audio_id ? T('community_pod_items').find((s) => s.id === p.audio_id) : null;
            return {
              ...card,
              // As the real view: boosted while the paid days last.
              boosted: !!p.boosted_until && new Date(p.boosted_until).getTime() > Date.now(),
              group_name: group?.name ?? card.group_name ?? null,
              group_kind: group?.kind ?? card.group_kind ?? null,
              in_my_group: group ? T('community_group_members').some((m) => m.group_id === group.id && m.user_id === me() && m.status === 'member') : !!card.in_my_group,
              audio_id: song ? song.id : null,
              audio_title: song?.title ?? null,
              audio_artist: song?.artist ?? null,
              audio_url: song?.audio_url ?? null,
            };
          })
      );
    },
  }),
};
