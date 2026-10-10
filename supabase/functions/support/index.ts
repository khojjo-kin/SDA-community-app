// Live support: the assistant answers a member's support chat until an admin joins it.
//
// The app writes the member's message itself (row-level security checks it is theirs), then calls
// this function with the chat's id. The function answers as the assistant unless an admin has
// answered in the last half hour, in which case the admin carries on and this stays quiet. With no
// Claude API key set, it says once that a person will reply.
//
// Supabase verifies the caller's session token first (verify_jwt), so its `sub` is trusted here.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const MODEL = Deno.env.get('SUPPORT_MODEL') ?? Deno.env.get('ERHA_MODEL') ?? 'claude-sonnet-5-5';
const HISTORY = 30;

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

  const { data: rows } = await db.from('community_support_messages').select('role, text').eq('chat_id', chat.id).order('created_at', { ascending: false }).limit(HISTORY);
  const history = ((rows ?? []) as { role: string; text: string }[]).reverse();
  if (!history.length || history[history.length - 1].role !== 'member') return json({ answered_by: 'none' });

  const say = async (text: string) => {
    await db.from('community_support_messages').insert({ chat_id: chat.id, role: 'ai', text: text.slice(0, 4000) });
  };

  const key = Deno.env.get('ANTHROPIC_API_KEY');
  if (!key) {
    // Said once per chat, not after every message.
    if (!history.some((m) => m.role === 'ai')) await say('Thanks for getting in touch. A member of our support team will reply here as soon as they can.');
    return json({ answered_by: 'none' });
  }

  // Claude wants alternating turns that start with the member; the team's replies count as the assistant's side.
  const turns: Turn[] = [];
  for (const m of history) {
    const role: Turn['role'] = m.role === 'member' ? 'user' : 'assistant';
    const content = m.role === 'agent' ? `(A member of the support team wrote:) ${m.text}` : m.text;
    if (!turns.length && role !== 'user') continue;
    const last = turns[turns.length - 1];
    if (last && last.role === role) last.content += '\n\n' + content;
    else turns.push({ role, content });
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: 700, system: INSTRUCTIONS, messages: turns }),
  });
  if (!res.ok) {
    console.error('support anthropic', res.status, (await res.text().catch(() => '')).slice(0, 400));
    if (!history.some((m) => m.role === 'ai')) await say('Thanks for getting in touch. A member of our support team will reply here as soon as they can.');
    return json({ answered_by: 'none' }, 200);
  }
  const data = await res.json();
  const reply = Array.isArray(data?.content) ? data.content.filter((c: { type: string }) => c.type === 'text').map((c: { text: string }) => c.text).join('\n').trim() : '';
  // An admin may have joined while Claude was thinking: then their answer stands alone.
  const { data: fresh } = await db.from('community_support_chats').select('ai_paused_until').eq('id', chat.id).maybeSingle();
  if (fresh?.ai_paused_until && new Date(fresh.ai_paused_until) > new Date()) return json({ answered_by: 'agent' });
  if (reply) await say(reply);
  return json({ answered_by: 'ai' });
});
