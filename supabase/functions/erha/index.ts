// Erha: the Community app's assistant for church life, on Claude.
//
// The app sends one message at a time; this function keeps each person's conversation, applies
// the daily allowance for people without Community Plus, asks Claude with the standing
// instructions below, and sends the reply back. The Claude API key lives only here, as the
// ANTHROPIC_API_KEY secret, never inside the app.
//
// Supabase verifies the caller's Clerk session token before this code runs (verify_jwt), so the
// token's `sub` is trusted here as the person's id.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const FREE_MESSAGES_A_DAY = 15;
const HISTORY = 24;
/** Erha's own account in the app. When the app passes a thread with this account, the reply is sent there as a chat message. */
const ERHA_ID = Deno.env.get('ERHA_USER_ID') ?? 'user_3KTkRcnk7CCL3EaTDjWtptR4YMO';
const MODEL = Deno.env.get('ERHA_MODEL') ?? 'claude-sonnet-5-5';

const INSTRUCTIONS = `You are Erha, the assistant inside Community, a social app for a Seventh-day Adventist church family.

What you help with, and only this:
- The Bible: finding passages, explaining them, study plans, memory verses, context and cross-references.
- Sabbath School: this week's lesson, discussion questions, how to lead a class.
- Worship and music: hymns (describe them, suggest ones for an occasion, explain their background), planning a service, choir and praise team ideas.
- Prayer and encouragement: praying with someone in words, Scripture for a situation, gentle pastoral care.
- Church life and activities: planning youth programmes, Pathfinders and Adventurers, AY, outreach, Bible studies, small groups, potlucks, camp meetings, evangelistic series, visiting members, community service.
- Adventist beliefs and practice: the 28 fundamental beliefs, the Sabbath, health principles, stewardship, baptism, the writings of Ellen G. White — explained faithfully and with warmth.
- Using the Community app itself. Its short videos are called Shorts (older versions called them Clips, and before that Reels); use the name Shorts.

How you behave:
- Warm, humble and clear. Short answers for short questions; longer ones only when the question needs it. Write in plain words, not church jargon, and never sound preachy.
- Ground what you say in Scripture, and give the reference (book chapter:verse). Quote accurately; if you are not sure of exact wording, say so rather than invent it.
- Do not make up hymn numbers, dates, events or people. If you do not know, say you do not know.
- You are not a pastor or a counsellor. For serious personal, medical, legal or financial situations, give kind encouragement and point the person to their pastor, an elder, a doctor or the relevant professional. If anyone describes being in danger or wanting to harm themselves, urge them to contact local emergency services or a crisis line right away and to reach a trusted person, and stay kind.
- Treat other Christians and other faiths with respect. Explain Adventist understanding without attacking anyone.
- Stay out of party politics, celebrity gossip, and anything unrelated to church and faith. If asked for something outside your scope — coding, homework in other subjects, business advice, entertainment, and so on — say in one friendly sentence that you only help with church life, and offer something you can do instead.
- Never pretend to be a person. If asked, you are Erha, an assistant built into Community.`;

type Row = { role: 'user' | 'assistant'; content: string };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Connection': 'keep-alive' } });
}

/** The person's id from the session token Supabase already verified. */
function subjectOf(req: Request): string | null {
  const auth = req.headers.get('Authorization') ?? '';
  const token = auth.replace(/^Bearer\s+/i, '');
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const payload = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.sub === 'string' && payload.sub.startsWith('user_') ? payload.sub : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Send a POST with { text }.' }, 405);
  const me = subjectOf(req);
  if (!me) return json({ error: 'Sign in to talk to Erha.' }, 401);

  let text = '';
  let threadId = '';
  try {
    const body = await req.json();
    text = String(body?.text ?? '').trim();
    threadId = typeof body?.thread_id === 'string' ? body.thread_id : '';
  } catch {
    return json({ error: 'Send a POST with { text }.' }, 400);
  }
  if (!text) return json({ error: 'Say something first.' }, 400);
  if (text.length > 4000) return json({ error: 'That message is too long. Keep it under 4,000 characters.' }, 400);

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  // Chatting with Erha's account in Messages: the reply goes into that chat, as Erha.
  let chat: string | null = null;
  if (threadId) {
    const { data: t } = await db.from('community_threads').select('id, user_a, user_b').eq('id', threadId).maybeSingle();
    const pair = t ? [t.user_a, t.user_b] : [];
    if (t && pair.includes(me) && pair.includes(ERHA_ID)) chat = t.id;
    else return json({ error: 'That chat is not with Erha.' }, 403);
  }
  const say = async (content: string) => {
    if (chat) await db.from('community_messages').insert({ thread_id: chat, sender_id: ERHA_ID, text: content.slice(0, 5000) });
  };

  const key = Deno.env.get('ANTHROPIC_API_KEY');
  if (!key) {
    const why = 'Erha is not set up yet. An admin needs to add the Claude API key.';
    await say(why);
    return json({ error: why }, 503);
  }

  // Community Plus lifts the daily allowance.
  const { data: profile } = await db.from('community_profiles').select('plus_until, suspended').eq('id', me).maybeSingle();
  if (profile?.suspended) return json({ error: 'This account is suspended.' }, 403);
  const plus = !!profile?.plus_until && new Date(profile.plus_until) > new Date();
  let remaining: number | null = null;
  if (!plus) {
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    const { count } = await db.from('community_erha_messages').select('id', { count: 'exact', head: true }).eq('user_id', me).eq('role', 'user').gte('created_at', since.toISOString());
    const used = count ?? 0;
    if (used >= FREE_MESSAGES_A_DAY) {
      const why = `You have used today's ${FREE_MESSAGES_A_DAY} messages. They reset at midnight, or Community Plus removes the limit.`;
      await say(why);
      return json({ error: why, remaining: 0 }, 429);
    }
    remaining = FREE_MESSAGES_A_DAY - used - 1;
  } else {
    // Plus has no daily allowance, but a ceiling still stops a script from running up the bill.
    const { data: allowed } = await db.rpc('community_rate_check', { uid: me, bucket: 'erha', most: 300, seconds: 86400 });
    if (!allowed) return json({ error: 'Erha needs a rest. Try again tomorrow.' }, 429);
  }

  // The conversation so far, oldest first, trimmed to what matters.
  const { data: past } = await db.from('community_erha_messages').select('role, content').eq('user_id', me).order('created_at', { ascending: false }).limit(HISTORY);
  const history: Row[] = ((past ?? []) as Row[]).reverse();
  const messages: Row[] = [...history, { role: 'user', content: text }];
  // Claude needs the turns to alternate and to start with the person.
  const turns: Row[] = [];
  for (const m of messages) {
    if (turns.length === 0 && m.role !== 'user') continue;
    if (turns.length && turns[turns.length - 1].role === m.role) turns[turns.length - 1] = { role: m.role, content: turns[turns.length - 1].content + '\n\n' + m.content };
    else turns.push(m);
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: 1024, system: INSTRUCTIONS, messages: turns }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    console.error('anthropic', res.status, detail.slice(0, 500));
    const why = res.status === 401 ? 'The Claude API key is not valid. An admin needs to check it.' : res.status === 429 ? 'Erha is busy right now. Try again in a moment.' : 'Erha could not answer just now. Try again.';
    return json({ error: why }, 502);
  }
  const data = await res.json();
  const reply = Array.isArray(data?.content) ? data.content.filter((c: { type: string }) => c.type === 'text').map((c: { text: string }) => c.text).join('\n').trim() : '';
  if (!reply) return json({ error: 'Erha could not answer just now. Try again.' }, 502);

  await db.from('community_erha_messages').insert([
    { user_id: me, role: 'user', content: text },
    { user_id: me, role: 'assistant', content: reply },
  ]);
  await say(reply);
  return json({ reply, remaining });
});
