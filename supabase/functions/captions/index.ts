// Captions on clips.
//
//   make       after a clip is shared, its author's app asks for captions: the video goes to OpenAI's
//              speech-to-text (Whisper), and the timed lines are kept on the post.
//   translate  a viewer whose app is in another language asks for the captions in it: Claude
//              translates the lines once, and the translation is kept for everyone after.
//
// Secrets: OPENAI_API_KEY (speech to text) and ANTHROPIC_API_KEY (translation). Without them, clips
// simply have no captions and nothing breaks.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const MODEL = Deno.env.get('CAPTIONS_MODEL') ?? Deno.env.get('ERHA_MODEL') ?? 'claude-sonnet-5-5';
/** Whisper takes files up to 25 MB. */
const MAX_BYTES = 25 * 1024 * 1024;

type Line = { s: number; e: number; t: string };

/** Whisper names the language in English ("english"); the app keeps short codes. */
const LANGS: Record<string, string> = {
  english: 'en', french: 'fr', spanish: 'es', portuguese: 'pt', german: 'de', italian: 'it', dutch: 'nl', swahili: 'sw',
  yoruba: 'yo', hausa: 'ha', arabic: 'ar', hindi: 'hi', chinese: 'zh', korean: 'ko', japanese: 'ja', russian: 'ru',
  tagalog: 'tl', indonesian: 'id', polish: 'pl', turkish: 'tr', akan: 'tw', twi: 'tw', ewe: 'ee', igbo: 'ig',
};

/** What each code is called, for the translation request. */
const NAMES: Record<string, string> = {
  en: 'English', tw: 'Twi (Akan)', ee: 'Ewe', fr: 'French', es: 'Spanish', pt: 'Portuguese', de: 'German', it: 'Italian',
  nl: 'Dutch', sw: 'Swahili', yo: 'Yoruba', ha: 'Hausa', ig: 'Igbo', ar: 'Arabic', hi: 'Hindi', zh: 'Chinese (Simplified)',
  ko: 'Korean', ja: 'Japanese', ru: 'Russian', tl: 'Tagalog', id: 'Indonesian', pl: 'Polish', tr: 'Turkish',
};

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

async function make(db: any, me: string, postId: string) {
  const { data: post } = await db.from('community_posts').select('id, user_id, kind, media, captions_status').eq('id', postId).maybeSingle();
  if (!post) return json({ error: 'Unknown post.' }, 404);
  const { data: admin } = await db.from('community_admins').select('user_id').eq('user_id', me).maybeSingle();
  if (post.user_id !== me && !admin) return json({ error: 'Only the author can do that.' }, 403);
  const video = (post.media ?? []).find((m: any) => m?.type === 'video');
  if (!video?.url) return json({ status: 'none' });
  if (post.captions_status === 'ready') return json({ status: 'ready' });
  const key = Deno.env.get('OPENAI_API_KEY');
  if (!key) {
    await db.from('community_posts').update({ captions_status: 'none' }).eq('id', post.id);
    return json({ status: 'none', reason: 'Captions are not switched on yet.' });
  }
  await db.from('community_posts').update({ captions_status: 'pending' }).eq('id', post.id);
  try {
    const file = await fetch(video.url);
    const bytes = await file.arrayBuffer();
    if (!file.ok || bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES) {
      await db.from('community_posts').update({ captions_status: 'none' }).eq('id', post.id);
      return json({ status: 'none' });
    }
    const name = String(video.url).toLowerCase().includes('.mov') ? 'clip.mov' : 'clip.mp4';
    const form = new FormData();
    form.append('file', new Blob([bytes], { type: name.endsWith('.mov') ? 'video/quicktime' : 'video/mp4' }), name);
    form.append('model', 'whisper-1');
    form.append('response_format', 'verbose_json');
    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form });
    if (!res.ok) {
      console.error('whisper', res.status, (await res.text().catch(() => '')).slice(0, 300));
      await db.from('community_posts').update({ captions_status: 'failed' }).eq('id', post.id);
      return json({ status: 'failed' });
    }
    const data = await res.json();
    const lines: Line[] = (data?.segments ?? [])
      .map((s: any) => ({ s: Math.max(0, Number(s.start) || 0), e: Math.max(0, Number(s.end) || 0), t: String(s.text ?? '').trim() }))
      .filter((l: Line) => l.t);
    const lang = LANGS[String(data?.language ?? '').toLowerCase()] ?? String(data?.language ?? '').slice(0, 10);
    await db.from('community_posts').update({ captions: lines.length ? lines : null, captions_lang: lang, captions_status: lines.length ? 'ready' : 'none' }).eq('id', post.id);
    return json({ status: lines.length ? 'ready' : 'none', lang, lines: lines.length });
  } catch (e) {
    console.error('captions make', e);
    await db.from('community_posts').update({ captions_status: 'failed' }).eq('id', post.id);
    return json({ status: 'failed' });
  }
}

async function translate(db: any, viewer: any, postId: string, lang: string) {
  if (!NAMES[lang]) return json({ error: 'Unknown language.' }, 400);
  // Read through the viewer's own access, so a post they can't see can't be translated for them.
  const { data: post } = await viewer.from('community_post_cards').select('id, captions, captions_lang').eq('id', postId).maybeSingle();
  if (!post?.captions?.length) return json({ captions: null });
  if (post.captions_lang === lang) return json({ captions: post.captions, lang });
  const { data: cached } = await db.from('community_caption_translations').select('captions').eq('post_id', postId).eq('lang', lang).maybeSingle();
  if (cached?.captions) return json({ captions: cached.captions, lang });
  const key = Deno.env.get('ANTHROPIC_API_KEY');
  if (!key) return json({ captions: null, reason: 'Translation is not switched on yet.' });
  const lines = (post.captions as Line[]).slice(0, 400);
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4000,
      system: `You translate video captions for a church community app. Translate each line into ${NAMES[lang]}, keeping the meaning, tone and any Bible references. Reply with only a JSON array of strings, one per input line, in the same order and the same number of items.`,
      messages: [{ role: 'user', content: JSON.stringify(lines.map((l) => l.t)) }],
    }),
  });
  if (!res.ok) {
    console.error('captions translate', res.status, (await res.text().catch(() => '')).slice(0, 300));
    return json({ captions: null });
  }
  const data = await res.json();
  const text = Array.isArray(data?.content) ? data.content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('') : '';
  let out: string[] = [];
  try {
    out = JSON.parse(text.slice(text.indexOf('['), text.lastIndexOf(']') + 1));
  } catch {
    return json({ captions: null });
  }
  if (!Array.isArray(out) || out.length !== lines.length) return json({ captions: null });
  const translated: Line[] = lines.map((l, i) => ({ s: l.s, e: l.e, t: String(out[i] ?? '').trim() || l.t }));
  await db.from('community_caption_translations').upsert({ post_id: postId, lang, captions: translated }, { onConflict: 'post_id,lang' });
  return json({ captions: translated, lang });
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const me = subjectOf(req);
  if (!me) return json({ error: 'Sign in first.' }, 401);
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Send { action, post_id }.' }, 400);
  }
  const url = Deno.env.get('SUPABASE_URL')!;
  const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const postId = typeof body?.post_id === 'string' ? body.post_id : '';
  if (!postId) return json({ error: 'Send { action, post_id }.' }, 400);
  try {
    if (body.action === 'make') return await make(db, me, postId);
    if (body.action === 'translate') {
      const viewer = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
        auth: { persistSession: false },
        global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
      });
      return await translate(db, viewer, postId, String(body.lang ?? '').slice(0, 10));
    }
    return json({ error: 'Unknown action.' }, 400);
  } catch (e) {
    console.error('captions', e);
    return json({ error: 'Captions could not be made just now.' }, 500);
  }
});
