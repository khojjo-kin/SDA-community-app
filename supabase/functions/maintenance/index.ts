// Housekeeping run by the database's scheduler (pg_cron through pg_net), never by the app.
//
//   purged-files  removes the photos, videos, voice notes and identity documents of accounts the
//                 nightly purge deleted 30 days after they were deactivated. Supabase does not let
//                 SQL delete storage files, so this does it through the Storage API.
//   media-trash   removes single files the database has queued, such as a view-once photo that has
//                 been opened.
//   subscriptions stops the Stripe subscriptions of closed accounts from renewing.
//                 All three run on every call, whichever was asked for.
//
// Called with the header x-maintenance-key, which must match the key kept in community_secrets.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const BUCKETS = ['community-media', 'community-verification'];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data: key } = await db.from('community_secrets').select('value').eq('key', 'maintenance_key').maybeSingle();
  const given = req.headers.get('x-maintenance-key') ?? '';
  if (!key?.value || given.length !== key.value.length || given !== key.value) return json({ error: 'Not allowed' }, 401);

  const { data: queue } = await db.from('community_purge_queue').select('user_id').is('files_removed_at', null).limit(50);
  let removed = 0;
  for (const { user_id } of queue ?? []) {
    let ok = true;
    for (const bucket of BUCKETS) {
      // Files sit in a folder named after the account; take them away a page at a time.
      for (let round = 0; round < 50; round++) {
        const { data: files, error } = await db.storage.from(bucket).list(user_id, { limit: 1000 });
        if (error) {
          ok = false;
          break;
        }
        if (!files?.length) break;
        const { error: rmError } = await db.storage.from(bucket).remove(files.map((f) => `${user_id}/${f.name}`));
        if (rmError) {
          ok = false;
          break;
        }
        removed += files.length;
        if (files.length < 1000) break;
      }
    }
    if (ok) await db.from('community_purge_queue').update({ files_removed_at: new Date().toISOString() }).eq('user_id', user_id);
  }

  // Single files queued for removal, a bucket at a time.
  const { data: trash } = await db.from('community_media_trash').select('path, bucket').lte('remove_after', new Date().toISOString()).order('remove_after').limit(100);
  let trashed = 0;
  const byBucket = new Map<string, string[]>();
  for (const t of (trash ?? []) as { path: string; bucket: string }[]) byBucket.set(t.bucket, [...(byBucket.get(t.bucket) ?? []), t.path]);
  for (const [bucket, paths] of byBucket) {
    const { error } = await db.storage.from(bucket).remove(paths);
    if (error) continue;
    trashed += paths.length;
    await db.from('community_media_trash').delete().eq('bucket', bucket).in('path', paths);
  }
  const stopped = await stopClosedSubscriptions(db).catch((e) => {
    console.error('stop subscriptions', e?.message ?? e);
    return 0;
  });
  return json({ accounts: queue?.length ?? 0, files: removed, trashed, subscriptions_stopped: stopped });
});

/**
 * Subscriptions of closed accounts stop renewing: Plus and subscriptions to creators, whether the
 * closed account is the subscriber or the creator. An account closed by its owner keeps what it has
 * paid for (it can be reopened within 30 days and renewal turned back on); one closed for being
 * under 13 is cancelled at once.
 */
async function stopClosedSubscriptions(db: ReturnType<typeof createClient>): Promise<number> {
  const key = Deno.env.get('STRIPE_SECRET_KEY');
  if (!key) return 0;
  const dayAgo = new Date(Date.now() - 86400e3).toISOString();
  const { data: closed } = await db.from('community_profiles').select('id, under_13, deleted_at').not('deleted_at', 'is', null).limit(500);
  const rows = ((closed ?? []) as { id: string; under_13: boolean; deleted_at: string }[]).filter((p) => p.under_13 || p.deleted_at < dayAgo);
  if (!rows.length) return 0;
  const ids = rows.map((p) => p.id);
  const now = new Set(rows.filter((p) => p.under_13).map((p) => p.id));
  const stripe = async (method: 'POST' | 'DELETE', path: string, body?: URLSearchParams) => {
    const res = await fetch(`https://api.stripe.com/v1/${path}`, {
      method,
      headers: { Authorization: `Bearer ${key}`, 'Stripe-Version': '2024-06-20', ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
      body,
    });
    if (!res.ok) console.error('stripe', method, path, res.status);
    return res.ok;
  };
  const stop = async (subId: string, at_once: boolean) =>
    at_once ? stripe('DELETE', `subscriptions/${subId}`) : stripe('POST', `subscriptions/${subId}`, new URLSearchParams({ cancel_at_period_end: 'true' }));
  let n = 0;
  const { data: plus } = await db.from('community_billing').select('user_id, stripe_subscription_id, cancel_at_period_end')
    .in('user_id', ids).in('status', ['active', 'trialing', 'past_due']).not('stripe_subscription_id', 'is', null);
  for (const b of (plus ?? []) as { user_id: string; stripe_subscription_id: string; cancel_at_period_end: boolean }[]) {
    const atOnce = now.has(b.user_id);
    if (b.cancel_at_period_end && !atOnce) continue;
    if (await stop(b.stripe_subscription_id, atOnce)) {
      n++;
      await db.from('community_billing').update(atOnce ? { status: 'canceled', cancel_at_period_end: false } : { cancel_at_period_end: true }).eq('user_id', b.user_id);
    }
  }
  const pick = 'creator_id, subscriber_id, stripe_subscription_id, cancel_at_period_end';
  const [asSubscriber, asCreator] = await Promise.all([
    db.from('community_creator_subs').select(pick).in('subscriber_id', ids).in('status', ['active', 'trialing', 'past_due']),
    db.from('community_creator_subs').select(pick).in('creator_id', ids).in('status', ['active', 'trialing', 'past_due']),
  ]);
  for (const s of [...(asSubscriber.data ?? []), ...(asCreator.data ?? [])] as { creator_id: string; subscriber_id: string; stripe_subscription_id: string | null; cancel_at_period_end: boolean }[]) {
    if (!s.stripe_subscription_id) continue;
    const atOnce = now.has(s.subscriber_id) || now.has(s.creator_id);
    if (s.cancel_at_period_end && !atOnce) continue;
    if (await stop(s.stripe_subscription_id, atOnce)) {
      n++;
      await db.from('community_creator_subs').update(atOnce ? { status: 'canceled', cancel_at_period_end: false } : { cancel_at_period_end: true })
        .eq('creator_id', s.creator_id).eq('subscriber_id', s.subscriber_id);
    }
  }
  return n;
}
