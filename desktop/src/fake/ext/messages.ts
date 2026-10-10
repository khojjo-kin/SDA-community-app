// Demo data for the messages area: notes above the inbox, view-once photos, a screenshot notice,
// a chat streak, who is active, a photo, a voice message and a call in the chats, Erha's daily
// allowance (the real function's rule: 15 messages a day without Plus), and the friends' map: places
// shared by friends, seen under the database's own rules (community_friend_locations).
import type { Ctx, Ext, Row } from './types';
import graceSnap from '../media/05.jpg';
import danielPhoto from '../media/03.jpg';
import voiceClip from '../media/pod2.m4a';

const ERHA = 'user_3KTkRcnk7CCL3EaTDjWtptR4YMO';
const H = 3600e3;
const ago = (hours: number) => new Date(Date.now() - hours * H).toISOString();
const ahead = (hours: number) => new Date(Date.now() + hours * H).toISOString();
const FREE_ERHA_A_DAY = 15;

/*
 * Shared places. The real table's trigger stamps updated_at with the server's clock on every write;
 * here the view notices a row that changed since it was last read (or is new) and stamps it then.
 */
const stamped = new WeakMap<Row, string>();
const signature = (r: Row) => [r.lat, r.lng, r.accuracy, r.audience].join('|');
function touchLocations(T: Ctx['T'], now: string) {
  for (const r of T('community_locations')) {
    const sig = signature(r);
    if (stamped.get(r) !== sig) {
      if (stamped.has(r) || !r.updated_at) r.updated_at = now;
      stamped.set(r, sig);
    }
  }
}

/** A message row with every column the real table has. */
const msg = (id: string, thread_id: string, sender_id: string, hours: number, extra: Row = {}): Row => ({
  id, thread_id, sender_id, text: '', created_at: ago(hours), media_url: '', audio_url: '', audio_seconds: 0, post_id: null, call_url: '', call_kind: '',
  view_once: false, opened_at: null, system: '', ...extra,
});

export const ext: Ext = {
  seed: (ctx) => {
    const { T } = ctx;
    // The tables, for tests/messages.test.cjs to look at what was saved.
    (globalThis as any).__messagesDemo = ctx;
    const person = (id: string) => T('community_profiles').find((p) => p.id === id);

    // Grace is in the app right now (always "Active now"); Daniel was here five minutes before the demo opened.
    const grace = person('u_grace');
    if (grace) Object.defineProperty(grace, 'active_at', { get: () => new Date().toISOString(), set: () => {}, enumerable: true, configurable: true });
    const daniel = person('u_daniel');
    if (daniel) daniel.active_at = new Date(Date.now() - 5 * 60e3).toISOString();

    // Five days in a row of writing to each other with Grace.
    const t1 = T('community_threads').find((t) => t.id === 't1');
    if (t1) t1.streak = 5;

    T('community_messages').push(
      // t1, Grace: a view-once photo I sent (she has opened it) and one she sent me (waiting).
      msg('mx1', 't1', 'demo_me', 1.85, { view_once: true, opened_at: ago(1.75) }),
      msg('mx2', 't1', 'u_grace', 1.65, { view_once: true, media_url: graceSnap }),
      // t2, Daniel: a call, a photo, a voice message, and a screenshot he took of the chat.
      msg('mx3', 't2', 'demo_me', 22, { text: 'Voice call · 4 min', call_kind: 'voice', call_url: 'community://call/ended' }),
      msg('mx4', 't2', 'u_daniel', 20.4, { media_url: danielPhoto }),
      msg('mx5', 't2', 'u_daniel', 20.2, { audio_url: voiceClip, audio_seconds: 12 }),
      msg('mx6', 't2', 'u_daniel', 19.5, { text: 'took a screenshot of the chat', system: 'screenshot' }),
    );

    // Daniel has read the chat since my last message, so it shows "Seen".
    T('community_thread_reads').push({ thread_id: 't2', user_id: 'u_daniel', last_read_at: ago(18) });

    // Notes from two mutual followers: Grace with a song from Pod, Daniel with a place and a colour.
    T('community_notes').push(
      { user_id: 'u_grace', text: 'Choir practice tonight, all voices welcome', audience: 'mutuals', song_id: 'pod1', place: '', color: '', created_at: ago(2), expires_at: ahead(22) },
      { user_id: 'u_daniel', text: 'Camp-out this weekend!', audience: 'mutuals', song_id: null, place: 'Kumasi Central', color: '#3d8bff', created_at: ago(5), expires_at: ahead(19) },
      // An old note of Ruth's that has run out: nobody sees it.
      { user_id: 'u_ruth', text: 'Garden club tomorrow', audience: 'mutuals', song_id: null, place: '', color: '', created_at: ago(30), expires_at: ago(6) },
    );

    // Daniel (no Plus) has already asked Erha his 15 free questions today.
    const today = Date.now();
    for (let i = 0; i < FREE_ERHA_A_DAY; i++) T('community_erha_messages').push({ user_id: 'u_daniel', role: 'user', content: 'Sample question ' + (i + 1), created_at: new Date(today - (i + 1) * 1000).toISOString() });

    // The friends' map, around Kumasi. Grace shares with mutual followers (you follow each other);
    // Daniel with close friends, and you are on his list. Samuel shares with mutual followers but
    // doesn't follow you back, Joseph with close friends without you on his list, and Esther's place
    // is over a day old: none of those three is shown to you.
    T('community_close_friends').push({ user_id: 'u_daniel', friend_id: 'demo_me', created_at: ago(300) });
    const place = (user_id: string, lat: number, lng: number, audience: string, hours: number) => ({ user_id, lat, lng, accuracy: 30, audience, updated_at: ago(hours), created_at: ago(hours + 2) });
    T('community_locations').push(
      place('u_grace', 6.6885, -1.6244, 'mutuals', 5 / 60),
      place('u_daniel', 6.7146, -1.5862, 'close_friends', 0.7),
      place('u_samuel', 6.6731, -1.5712, 'mutuals', 0.2),
      place('u_joseph', 6.6952, -1.6421, 'close_friends', 1),
      place('u_esther', 6.7019, -1.6093, 'mutuals', 30),
    );
  },

  views: ({ T, me, now, profile, follows }) => ({
    // As the database's view and row rules: places updated in the last day, from people who share
    // with mutual followers (and follow each other with you) or put you on their close friends list;
    // never across a block. Your own place too, marked "mine".
    community_friend_locations: () => {
      touchLocations(T, now());
      const day = Date.now() - 86400e3;
      const blocked = (a: string, b: string) => T('community_blocks').some((x) => (x.blocker_id === a && x.blocked_id === b) || (x.blocker_id === b && x.blocked_id === a));
      const onList = (owner: string) => T('community_close_friends').some((c) => c.user_id === owner && c.friend_id === me());
      return T('community_locations')
        .filter((l) => {
          if (l.user_id === me()) return true;
          if (new Date(l.updated_at).getTime() <= day || blocked(me(), l.user_id)) return false;
          return l.audience === 'mutuals' ? follows(me(), l.user_id) && follows(l.user_id, me()) : onList(l.user_id);
        })
        .map((l) => {
          const p = profile(l.user_id);
          return { user_id: l.user_id, lat: l.lat, lng: l.lng, accuracy: l.accuracy ?? null, audience: l.audience, updated_at: l.updated_at, username: p.username, full_name: p.full_name, avatar_url: p.avatar_url, verified: !!p.verified, mine: l.user_id === me() };
        });
    },
  }),

  functions: ({ T, me, now, insertRow, profile }) => ({
    // Erha, as the real function behaves: Plus has no daily allowance; otherwise 15 a day, and the
    // refusal is said in the chat as well as returned.
    erha: (body: Row) => {
      const text = String(body.text ?? '').trim();
      if (!text) throw new Error('Say something first.');
      const threadId = typeof body.thread_id === 'string' ? body.thread_id : '';
      const say = (content: string) => {
        if (threadId) insertRow('community_messages', { thread_id: threadId, sender_id: ERHA, text: content.slice(0, 5000) });
      };
      const p = profile(me());
      const plus = !!p.plus_until && new Date(p.plus_until).getTime() > Date.now();
      let remaining: number | null = null;
      if (!plus) {
        const since = new Date();
        since.setUTCHours(0, 0, 0, 0);
        const used = T('community_erha_messages').filter((m) => m.user_id === me() && m.role === 'user' && m.created_at >= since.toISOString()).length;
        if (used >= FREE_ERHA_A_DAY) {
          const why = `You have used today's ${FREE_ERHA_A_DAY} messages. They reset at midnight, or Community Plus removes the limit.`;
          say(why);
          throw new Error(why);
        }
        remaining = FREE_ERHA_A_DAY - used - 1;
      }
      const reply = 'In the demo I can only give a sample answer. In the real app I answer questions about the Bible, the hymnal and church life. You asked: “' + text.slice(0, 120) + '”';
      T('community_erha_messages').push({ user_id: me(), role: 'user', content: text, created_at: now() }, { user_id: me(), role: 'assistant', content: reply, created_at: now() });
      say(reply);
      return { reply, remaining };
    },
  }),
};
