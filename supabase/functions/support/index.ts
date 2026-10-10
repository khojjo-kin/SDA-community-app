// Live support: the assistant answers a member's support chat until an admin joins it.
//
// The app writes the member's message itself (row-level security checks it is theirs), then calls
// this function with the chat's id. The function answers as the assistant unless an admin has
// answered in the last half hour, in which case the admin carries on and this stays quiet. With no
// Claude API key set, it says once that a person will reply.
//
// Supabase verifies the caller's session token first (verify_jwt), so its `sub` is trusted here.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient, SupabaseClient } from 'jsr:@supabase/supabase-js@2';

const MODEL = Deno.env.get('SUPPORT_MODEL') ?? Deno.env.get('ERHA_MODEL') ?? 'claude-sonnet-5-5';
const HISTORY = 30;
/** Assistant replies a member can have in a day, across all their support chats. */
const DAILY_LIMIT = Number(Deno.env.get('SUPPORT_DAILY_LIMIT') ?? '60');

const INSTRUCTIONS = `You are the support assistant inside Community, a social app for a Seventh-day Adventist church family. You answer members' questions about using the app, in a live support chat. A member of the support team (an admin) can join the chat at any time; when they do, they take over.

What the app has, so you can explain it:
- Home with For you and Following, posts, Clips (short videos), stories, Memories (saved stories on a profile), Live, messages with voice notes, view-once photos, notes, streaks, calls and video calls.
- Profiles: edit profile, private account, profile style for Plus members, followers and following, subscriptions to creators, fundraisers, About this account.
- Community Plus (monthly or yearly, first week free for new members): profile viewers, read receipts off, reading messages quietly, story previews without being seen, story rewatch counts and times, alerts when a chosen person watches your story, story priority, screenshot alerts in chats, app fonts, chat wallpapers, ring colour and profile theme, custom memory covers, hiding the tick, quick support.
- The blue tick: free, by applying in Settings, Request verification, with an ID document and a selfie; an admin checks them. Plus members can also get verified through Plus with the same ID check.
- Ads: promote a post from its menu, pay by card or Apple Pay. Fundraisers: set up payouts under Settings, Fundraisers and payouts.
- Settings: theme (Dark, White, Green), language, haptics, the floating church apps button, activity status, live location on the map, chat streaks, login activity, captions on clips.
- Church apps: Bible, Hymnal, Pod (songs and podcasts), Sabbath School, Churches, Communities and pages, from the floating button.
- Members under 14 have a private account, can't go live or run fundraisers, and can only message people they follow.

How you behave:
- Friendly, brief and practical. Give step-by-step directions using the app's own names for things.
- You can't see the member's account, payments or private data, and you can't change anything. For refunds, billing problems, account recovery, reports about other people, or anything you can't solve, say a member of the team will pick it up in this chat, and ask for the details they will need.
- Never ask for passwords, card numbers or one-time codes.
- If someone describes being in danger or wanting to harm themselves, urge them to contact local emergency services or a crisis line right away, and stay kind.
- Never pretend to be a person. If asked, you are the Community support assistant.`;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function subjectOf(req: Request): string | null {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const payload = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.sub === 'string' && payload.sub.startsWith('user_') ? payload.sub : null;
  } catch {
    return null;
  }
}

type Turn = { role: 'user' | 'assistant'; content: string };

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const me = subjectOf(req);
  if (!me) return json({ error: 'Sign in first.' }, 401);
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Send { chat_id }.' }, 400);
  }
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data: chat } = await db.from('community_support_chats').select('id, user_id, ai_paused_until, agent_name').eq('id', body?.chat_id).maybeSingle();
  if (!chat || chat.user_id !== me) return json({ error: 'Unknown chat.' }, 404);
  // A person from the team is answering: the assistant keeps out of it.
  if (chat.ai_paused_until && new Date(chat.ai_paused_until) > new Date()) return json({ answered_by: 'agent', agent_name: chat.agent_name });

  // One answer at a time per chat: a second message sent while the assistant is still writing is
  // picked up by the call already running, so the member never gets two replies to one question.
  let result = 'busy';
  for (let pass = 0; pass < 2; pass++) {
    const { data: claimed } = await db.rpc('community_support_claim', { chat: chat.id });
    if (!claimed) break;
    try {
      result = (await answer(db, me, chat.id)).answered_by;
    } finally {
      await db.rpc('community_support_claim', { chat: chat.id, release: true });
    }
    // A message that arrived just as the chat was let go would otherwise wait: one more pass for it.
    const { data: newest } = await db.from('community_support_messages').select('role').eq('chat_id', chat.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (newest?.role !== 'member' || result === 'agent') break;
  }
  return json({ answered_by: result });
});

const HOLDING = 'Thanks for getting in touch. A member of our support team will reply here as soon as they can.';
const LIMITED = 'You have reached today\'s limit for the assistant. A member of our support team will reply here as soon as they can.';

type Row = { id: string; role: string; text: string; created_at: string };

async function answer(db: SupabaseClient, me: string, chatId: string): Promise<{ answered_by: string }> {
  const say = async (text: string): Promise<Row | null> => {
    const { data } = await db.from('community_support_messages').insert({ chat_id: chatId, role: 'ai', text: text.slice(0, 4000) }).select('id, role, text, created_at').single();
    return (data as Row) ?? null;
  };
  // Replies written in this call, and the member message each one answered: a reply is placed
  // straight after its question, so a message sent while it was being written still gets its turn.
  const answered = new Map<string, string>();
  let result = 'none';

  for (let round = 0; round < 3; round++) {
    const { data: rows } = await db.from('community_support_messages').select('id, role, text, created_at').eq('chat_id', chatId).order('created_at', { ascending: false }).limit(HISTORY);
    const key = (r: Row) => answered.get(r.id) ?? r.created_at;
    const history = ((rows ?? []) as Row[]).sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
    const last = history[history.length - 1];
    if (!last || last.role !== 'member') break;

    const { data: chat } = await db.from('community_support_chats').select('ai_paused_until').eq('id', chatId).maybeSingle();
    // A person from the team took over meanwhile: the assistant keeps out of it.
    if (chat?.ai_paused_until && new Date(chat.ai_paused_until) > new Date()) return { answered_by: 'agent' };

    const keyOk = Deno.env.get('ANTHROPIC_API_KEY');
    if (!keyOk) {
      // Said once per chat, not after every message.
      if (!history.some((m) => m.role === 'ai')) await say(HOLDING);
      return { answered_by: 'none' };
    }

    // A daily limit per member, across all their support chats.
    const { data: mine } = await db.from('community_support_chats').select('id').eq('user_id', me);
    const { count } = await db.from('community_support_messages').select('id', { count: 'exact', head: true })
      .in('chat_id', ((mine ?? []) as { id: string }[]).map((c) => c.id)).eq('role', 'ai').gt('created_at', new Date(Date.now() - 86400e3).toISOString());
    if ((count ?? 0) >= DAILY_LIMIT) {
      if (!history.some((m) => m.role === 'ai' && m.text === LIMITED)) await say(LIMITED);
      return { answered_by: 'none' };
    }

    // Claude wants alternating turns that start with the member; the team's replies count as the assistant's side.
    const turns: Turn[] = [];
    for (const m of history) {
      const role: Turn['role'] = m.role === 'member' ? 'user' : 'assistant';
      const content = m.role === 'agent' ? `(A member of the support team wrote:) ${m.text}` : m.text;
      if (!turns.length && role !== 'user') continue;
      const prev = turns[turns.length - 1];
      if (prev && prev.role === role) prev.content += '\n\n' + content;
      else turns.push({ role, content });
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': keyOk, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: 700, system: INSTRUCTIONS, messages: turns }),
    });
    if (!res.ok) {
      console.error('support anthropic', res.status, (await res.text().catch(() => '')).slice(0, 400));
      if (!history.some((m) => m.role === 'ai')) await say(HOLDING);
      return { answered_by: 'none' };
    }
    const data = await res.json();
    const reply = Array.isArray(data?.content) ? data.content.filter((c: { type: string }) => c.type === 'text').map((c: { text: string }) => c.text).join('\n').trim() : '';
    // An admin may have joined while Claude was thinking: then their answer stands alone.
    const { data: fresh } = await db.from('community_support_chats').select('ai_paused_until').eq('id', chatId).maybeSingle();
    if (fresh?.ai_paused_until && new Date(fresh.ai_paused_until) > new Date()) return { answered_by: 'agent' };
    if (!reply) break;
    const saved = await say(reply);
    // Sorts just after the question it answered ("~" comes after every character in a timestamp).
    if (saved) answered.set(saved.id, `${last.created_at}~`);
    result = 'ai';
  }
  return { answered_by: result };
}
