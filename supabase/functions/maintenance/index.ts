// Housekeeping run by the database's scheduler (pg_cron through pg_net), never by the app.
//
//   purged-files  removes the photos, videos, voice notes and identity documents of accounts the
//                 nightly purge deleted 30 days after they were deactivated. Supabase does not let
//                 SQL delete storage files, so this does it through the Storage API.
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
  return json({ accounts: queue?.length ?? 0, files: removed });
});
