// Demo data for the social area (database v24): message requests, mute, restrict and "Liked by".
//
// The tables community_mutes and community_restricts, accepted_at on community_thread_settings and
// the RPC community_accept_request, and the view columns the real database adds, worked out with
// its rules:
//   - Request: a chat the other person started where you haven't written, haven't accepted, and
//     don't follow them — or you have restricted them (then it's a request even if you follow them).
//   - Mute: posts and/or stories of that person stay off your feeds and story tray (fetchFeed and
//     fetchStoryTray leave out rows marked author_muted); their profile still shows everything.
//   - Restrict: their new comments on your posts are seen only by them and you (marked restricted for
//     you); their messages arrive as requests; they can't see when you're active or have read.
//   - Liked by: the most recent like on a post from someone you follow.
// Chats with someone blocked either way are left out, as the real thread view does.
//
// Sample rows: Esther (you don't follow her) and Samuel (you follow him but have restricted him)
// have each sent you a message request; Samuel's comment on your post "Soft morning on the dunes"
// is restricted; Esther's posts are muted, so they stay off For you; and a few posts carry "Liked
// by". Seeded likes lower the post's base count by the same amount, so every like count the other
// areas' tests read stays the same.
import { ext as frame } from './frame';
import { ext as profile } from './profile';
import { ext as posts } from './posts';
import { ext as stories } from './stories';
import { ext as settings } from './settings';
import { ext as pro } from './pro';
import { ext as messages } from './messages';
import { ext as church } from './church';
import { ext as community } from './community';
import { ext as admin } from './admin';
import type { Ctx, Ext, Row } from './types';

const H = 3600e3;
const ago = (hours: number) => new Date(Date.now() - hours * H).toISOString();
const ME = 'demo_me';

/** The extensions listed before this one (fake/ext/index.ts): a view they override is the one wrapped here. */
const EARLIER: Ext[] = [frame, profile, posts, stories, settings, pro, messages, church, community, admin];

/** A message row with every column the real table has. */
const msg = (id: string, thread_id: string, sender_id: string, text: string, hours: number): Row => ({
  id, thread_id, sender_id, text, created_at: ago(hours), media_url: '', audio_url: '', audio_seconds: 0, post_id: null, call_url: '', call_kind: '',
  view_once: false, opened_at: null, system: '',
});

/** The rules above, as small questions about the tables. */
function rules({ T, follows }: Ctx) {
  const muteOf = (muter: string, muted: string) => T('community_mutes').find((m) => m.muter_id === muter && m.muted_id === muted);
  const restricted = (by: string, who: string) => T('community_restricts').some((r) => r.restricter_id === by && r.restricted_id === who);
  const blocked = (a: string, b: string) => T('community_blocks').some((x) => (x.blocker_id === a && x.blocked_id === b) || (x.blocker_id === b && x.blocked_id === a));

  /** Whether `viewer` sees this chat as a message request. */
  const isRequest = (thread: Row, viewer: string): boolean => {
    const other = thread.user_a === viewer ? thread.user_b : thread.user_a;
    const sent = T('community_messages').filter((m) => m.thread_id === thread.id && !m.system);
    if (!sent.length) return false;
    const first = sent.reduce((a, m) => (m.created_at < a.created_at ? m : a));
    if (first.sender_id === viewer || sent.some((m) => m.sender_id === viewer)) return false;
    if (T('community_thread_settings').some((s) => s.thread_id === thread.id && s.user_id === viewer && s.accepted_at)) return false;
    return restricted(viewer, other) || !follows(viewer, other);
  };

  /** A comment the post's owner restricted: written by someone they had restricted by then. */
  const isRestrictedComment = (c: Row, owner: string) => c.user_id !== owner && T('community_restricts').some((r) => r.restricter_id === owner && r.restricted_id === c.user_id && r.created_at <= c.created_at);

  return { muteOf, restricted, blocked, isRequest, isRestrictedComment };
}

/* ---------- the stand-in's own views (src/fake/supabase.ts), for the ones no earlier area overrides ---------- */

function baseViews(ctx: Ctx): Record<string, () => Row[]> {
  const { T, me, profile: person, profileCard, postCard, follows, count } = ctx;
  const liveStories = () => T('community_stories').filter((s) => new Date(s.expires_at).getTime() > Date.now());
  return {
    community_profile_cards: () => T('community_profiles').map(profileCard),
    community_post_cards: () => T('community_posts').map(postCard),
    community_comment_cards: () =>
      T('community_comments').map((c) => {
        const a = person(c.user_id);
        return {
          ...c, username: a.username, full_name: a.full_name, avatar_url: a.avatar_url, verified: !!a.verified,
          like_count: count('community_comment_likes', (l) => l.comment_id === c.id),
          liked: T('community_comment_likes').some((l) => l.comment_id === c.id && l.user_id === me()),
        };
      }),
    community_story_cards: () =>
      liveStories().map((s) => {
        const a = person(s.user_id);
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
          const a = person(other);
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
  };
}

/** The view as it stands before this area: the latest earlier area's override, or the stand-in's own. */
function priorViews(ctx: Ctx): Record<string, () => Row[]> {
  const out = baseViews(ctx);
  for (const e of EARLIER) Object.assign(out, e.views?.(ctx) ?? {});
  return out;
}

export const ext: Ext = {
  seed: (ctx) => {
    const { T } = ctx;
    T('community_mutes');
    T('community_restricts');

    // Samuel is restricted (you still follow him): his message waits in Requests, and his comment
    // on your post only shows to the two of you.
    T('community_restricts').push({ restricter_id: ME, restricted_id: 'u_samuel', created_at: ago(30) });
    // Esther's posts are muted: they stay off your feeds (her profile still shows them).
    T('community_mutes').push({ muter_id: ME, muted_id: 'u_esther', posts: true, stories: false, created_at: ago(48) });

    // Two message requests: Esther (you don't follow her) and Samuel (restricted).
    T('community_threads').push(
      { id: 't_req_esther', user_a: 'u_esther', user_b: ME, created_at: ago(6) },
      { id: 't_req_samuel', user_a: 'u_samuel', user_b: ME, created_at: ago(3.2) },
    );
    T('community_messages').push(
      msg('mreq1', 't_req_esther', 'u_esther', 'Hello! I lead the Adventurers club at Hillside.', 6),
      msg('mreq2', 't_req_esther', 'u_esther', 'Could your Pathfinders join our nature walk on Sunday?', 5.9),
      msg('mreq3', 't_req_samuel', 'u_samuel', 'Are you free to help on the media desk this Sabbath?', 3.2),
    );

    // Samuel's comment on your post, written after you restricted him.
    T('community_comments').push({ id: 'c_restricted1', post_id: 'p11', user_id: 'u_samuel', text: 'Where was this? I want to bring the camera there.', created_at: ago(3) });

    // "Liked by": likes from people you follow, newest last. Each post's base count drops by its
    // new likes, so the totals shown stay the same.
    const like = (post_id: string, user_id: string, hours: number) => {
      T('community_likes').push({ post_id, user_id, created_at: ago(hours) });
      const p = T('community_posts').find((x) => x.id === post_id);
      if (p) p.like_base = Math.max(0, (p.like_base ?? 0) - 1);
    };
    like('p2', 'u_grace', 4);
    like('p3', 'u_grace', 8.5);
    like('p3', 'u_ruth', 7.5);
    like('pp_poll', 'u_daniel', 11);

    // The social test reads and changes these tables through this. Only the demo build has it.
    (globalThis as any).__socialDemo = ctx;
  },

  views: (ctx) => {
    const { T, me, profile: person, follows } = ctx;
    const { muteOf, restricted, blocked, isRequest, isRestrictedComment } = rules(ctx);
    const prior = priorViews(ctx);
    const postOwner = (id: string) => T('community_posts').find((p) => p.id === id)?.user_id ?? null;

    return {
      // Profiles: what you muted of theirs, and whether you restricted them. `restricted` on your own
      // card stays the under-14 flag it always was. Someone who restricted you doesn't show as active.
      community_profile_cards: () =>
        prior.community_profile_cards().map((c) => {
          if (c.id === me()) return { ...c, muted_posts: false, muted_stories: false };
          const m = muteOf(me(), c.id);
          return { ...c, muted_posts: !!m?.posts, muted_stories: !!m?.stories, restricted: restricted(me(), c.id), active_at: restricted(c.id, me()) ? null : c.active_at };
        }),

      // Posts: muted authors marked (feeds leave them out), "Liked by" someone you follow, and
      // comments only the owner and the writer see left out of everyone else's count.
      community_post_cards: () =>
        prior.community_post_cards().map((c) => {
          const liker = T('community_likes')
            .filter((l) => l.post_id === c.id && l.user_id !== me() && follows(me(), l.user_id))
            .reduce<Row | null>((a, l) => (!a || l.created_at > a.created_at ? l : a), null);
          const by = liker ? person(liker.user_id) : null;
          const hidden = c.user_id === me() ? 0 : T('community_comments').filter((cm) => cm.post_id === c.id && cm.user_id !== me() && isRestrictedComment(cm, c.user_id)).length;
          return {
            ...c,
            author_muted: c.user_id !== me() && !!muteOf(me(), c.user_id)?.posts,
            liked_by_username: by?.username ?? null,
            liked_by_avatar_url: by ? by.avatar_url ?? '' : null,
            comment_count: Math.max(0, (c.comment_count ?? 0) - hidden),
          };
        }),

      // Comments: a restricted comment reaches only the post's owner (marked) and its writer (unmarked).
      community_comment_cards: () =>
        prior.community_comment_cards().flatMap((c) => {
          const owner = postOwner(c.post_id);
          const held = !!owner && isRestrictedComment(c, owner);
          if (held && me() !== owner && me() !== c.user_id) return [];
          return [{ ...c, restricted: held && me() === owner }];
        }),

      // Stories: muted authors marked, so the tray leaves them out.
      community_story_cards: () => prior.community_story_cards().map((s) => ({ ...s, author_muted: s.user_id !== me() && !!muteOf(me(), s.user_id)?.stories })),

      // Chats: requests marked; none with someone blocked either way; someone who restricted you
      // doesn't show as active.
      community_thread_cards: () =>
        prior.community_thread_cards()
          .filter((c) => !blocked(me(), c.other_id))
          .map((c) => {
            const thread = T('community_threads').find((t) => t.id === c.id);
            return { ...c, request: !!thread && isRequest(thread, me()), active_at: restricted(c.other_id, me()) ? null : c.active_at };
          }),

      // When someone read a chat: hidden from you while they have restricted you, or while your chat
      // is still a request to them.
      community_thread_reads: () =>
        T('community_thread_reads')
          .filter((r) => {
            if (r.user_id === me()) return true;
            if (restricted(r.user_id, me())) return false;
            const thread = T('community_threads').find((t) => t.id === r.thread_id);
            return !(thread && isRequest(thread, r.user_id));
          })
          .map((r) => ({ ...r })),
    };
  },

  rpc: ({ T, me, now }) => ({
    // Accepting a request moves the chat into the inbox.
    community_accept_request: ({ thread }: { thread: string }) => {
      const row = T('community_thread_settings').find((s) => s.thread_id === thread && s.user_id === me());
      if (row) row.accepted_at = now();
      else T('community_thread_settings').push({ thread_id: thread, user_id: me(), muted: false, hidden_before: null, accepted_at: now() });
      return null;
    },
    // Clearing a chat for you: one settings row per person and chat (as the real table's key), so a
    // chat you muted or accepted keeps that when you delete it.
    community_hide_thread: ({ thread }: { thread: string }) => {
      const row = T('community_thread_settings').find((s) => s.thread_id === thread && s.user_id === me());
      if (row) row.hidden_before = now();
      else T('community_thread_settings').push({ thread_id: thread, user_id: me(), hidden_before: now(), muted: false });
      return null;
    },
  }),
};
