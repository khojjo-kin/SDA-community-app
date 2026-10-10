// Demo data for the admin console: Sabbath School publisher requests, members' feedback, live
// support chats waiting for the team, and an identity check with its document and selfie (drawn
// here as clearly-marked samples). The demo's storage gets the signed addresses admins open those
// photos with. Every row added here has an id starting adm_.
//
// For the tests, setting window.__adminWithoutUpdate = true makes the admin CRM's database functions
// answer as if the admin database update weren't applied yet, as on the real database today.
import { supabase } from 'shared/supabase';
import { adminRpc } from '../admin';
import type { Ext, Row } from './types';

const H = 3600e3;
const ago = (hours: number) => new Date(Date.now() - hours * H).toISOString();
const svg = (body: string) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(body);

/** A passport page, plainly marked as a sample. */
const SAMPLE_DOCUMENT = svg(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800" viewBox="0 0 600 800">
<rect width="600" height="800" fill="#e9e3d3"/>
<rect x="24" y="24" width="552" height="752" rx="18" fill="#f6f1e4" stroke="#b9ab8a" stroke-width="3"/>
<rect x="24" y="24" width="552" height="96" rx="18" fill="#1f4e79"/>
<rect x="24" y="96" width="552" height="24" fill="#1f4e79"/>
<text x="300" y="84" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="34" font-weight="700" fill="#fff" letter-spacing="4">PASSPORT</text>
<rect x="56" y="160" width="200" height="250" rx="8" fill="#cfd8e3"/>
<circle cx="156" cy="250" r="56" fill="#8a5a3c"/>
<path d="M66 410c10-70 50-100 90-100s80 30 90 100z" fill="#2f4f6f"/>
<g font-family="Helvetica, Arial, sans-serif" fill="#33302a">
<text x="284" y="180" font-size="15" fill="#7b7262">Surname</text><text x="284" y="206" font-size="24" font-weight="700">BOATENG</text>
<text x="284" y="246" font-size="15" fill="#7b7262">Given names</text><text x="284" y="272" font-size="24" font-weight="700">SAMUEL KOFI</text>
<text x="284" y="312" font-size="15" fill="#7b7262">Nationality</text><text x="284" y="338" font-size="22">SAMPLE LAND</text>
<text x="284" y="378" font-size="15" fill="#7b7262">Date of birth</text><text x="284" y="404" font-size="22">09 JUL 1991</text>
<text x="56" y="470" font-size="15" fill="#7b7262">Document no.</text><text x="56" y="496" font-size="22">DEMO 000000</text>
<text x="320" y="470" font-size="15" fill="#7b7262">Expires</text><text x="320" y="496" font-size="22">01 JAN 2031</text>
<text x="56" y="690" font-family="Courier New, monospace" font-size="21">P&lt;DEMBOATENG&lt;&lt;SAMUEL&lt;KOFI&lt;&lt;&lt;&lt;&lt;&lt;</text>
<text x="56" y="722" font-family="Courier New, monospace" font-size="21">DEMO000000&lt;0SAM9107091M3101011&lt;&lt;&lt;</text>
</g>
<text x="300" y="600" text-anchor="middle" transform="rotate(-24 300 600)" font-family="Helvetica, Arial, sans-serif" font-size="96" font-weight="800" fill="#c0392b" fill-opacity="0.28" letter-spacing="10">SAMPLE</text>
</svg>`);

/** A selfie, drawn: a face and shoulders against a window. */
const SAMPLE_SELFIE = svg(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800" viewBox="0 0 600 800">
<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9cc9e8"/><stop offset="1" stop-color="#e6d3b8"/></linearGradient></defs>
<rect width="600" height="800" fill="url(#bg)"/>
<rect x="60" y="60" width="200" height="260" rx="6" fill="#ffffff" fill-opacity="0.35"/>
<path d="M90 800c10-170 100-250 210-250s200 80 210 250z" fill="#2e5e4e"/>
<rect x="262" y="470" width="76" height="100" rx="30" fill="#7a4b2f"/>
<ellipse cx="300" cy="370" rx="122" ry="150" fill="#8a5a3c"/>
<path d="M178 340c0-110 60-170 122-170s122 60 122 170c-20-60-60-90-122-90s-102 30-122 90z" fill="#1d1a17"/>
<ellipse cx="256" cy="380" rx="13" ry="9" fill="#1d1a17"/><ellipse cx="344" cy="380" rx="13" ry="9" fill="#1d1a17"/>
<path d="M262 452c22 22 54 22 76 0" stroke="#3b2214" stroke-width="7" fill="none" stroke-linecap="round"/>
<text x="300" y="760" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="30" font-weight="700" fill="#ffffff" fill-opacity="0.85" letter-spacing="6">SAMPLE SELFIE</text>
</svg>`);

const SAMPLE_FILES: Record<string, string> = {
  'adm/u_samuel/document.jpg': SAMPLE_DOCUMENT,
  'adm/u_samuel/selfie.jpg': SAMPLE_SELFIE,
};

/**
 * The demo's storage has no signed addresses, which admins open identity photos with: add them.
 * Sample files answer with their drawings; anything uploaded in the demo answers with its own address.
 */
function addSignedUrls() {
  const storage: any = (supabase as any)?.storage;
  if (!storage || storage.__signedUrls) return;
  const from = storage.from;
  storage.from = (bucket: string) => {
    const b = from(bucket);
    b.createSignedUrl ??= async (path: string) => ({ data: { signedUrl: SAMPLE_FILES[path] ?? b.getPublicUrl(path).data.publicUrl }, error: null });
    return b;
  };
  storage.__signedUrls = true;
}

/** The admin CRM's functions, which the real database doesn't have until the admin update is applied. */
const CRM_FUNCTIONS = ['community_admin_people', 'community_admin_user', 'community_admin_search', 'community_admin_analytics', 'community_admin_security', 'community_admin_money', 'community_admin_system', 'community_admin_act'];

export const ext: Ext = {
  seed: ({ T }) => {
    // The client exists once every module has loaded.
    setTimeout(addSignedUrls, 0);

    // Sabbath School publishers: three asking, Grace already publishing. The Church area may add its
    // own sample publishers; these are only added to an empty table so the two never clash.
    if (!T('community_publishers').length) {
      const pub = (id: string, user_id: string, status: string, note: string, hours: number, decidedHours: number | null = null) =>
        T('community_publishers').push({ id, user_id, status, note, decided_by: decidedHours === null ? null : 'demo_me', decided_at: decidedHours === null ? null : ago(decidedHours), created_at: ago(hours) });
      pub('adm_pub1', 'u_ruth', 'pending', 'I teach the adult Sabbath School class at Hillside and would like to share the weekly lesson helps with everyone.', 6);
      pub('adm_pub2', 'u_samuel', 'pending', 'Our media team records the lesson study every week. We would post the videos with short notes.', 20);
      pub('adm_pub3', 'u_joseph', 'pending', '', 30);
      pub('adm_pub4', 'u_grace', 'approved', 'Lesson helps for the youth class, and the memory verse each week.', 400, 380);
    }

    // What members have told us, from Help and the "Enjoying Community?" question.
    const fb = (id: string, user_id: string | null, kind: string, rating: number | null, text: string, platform: string, app_version: string, hours: number) =>
      T('community_feedback').push({ id, user_id, kind, rating, text, platform, app_version, created_at: ago(hours) });
    fb('adm_fb1', 'u_grace', 'review', 5, 'The hymnal on the big screen is perfect for choir practice. Thank you!', 'mac', '1.4.0', 3);
    fb('adm_fb2', 'u_ruth', 'idea', null, 'Could the Bible reading plan remind me in the evening as well as the morning?', 'ios', '21.0', 9);
    fb('adm_fb3', 'u_samuel', 'problem', null, 'Uploading a long Short from the Mac sometimes stops at 90%. Trying again works.', 'mac', '1.4.0', 26);
    fb('adm_fb4', 'u_daniel', 'review', 4, '', 'ios', '21.0', 50);
    fb('adm_fb5', 'u_esther', 'review', 3, 'Love it, but the stories bar is hard to find on my old phone.', 'android', '20.2', 75);
    fb('adm_fb6', null, 'problem', null, 'The app kept asking me to log in on my tablet.', 'web', '', 120);

    // Live support: Ruth is with the assistant and asking for a person; Grace is answering Daniel;
    // Joseph's chat was closed after the team helped.
    const chat = (id: string, user_id: string, status: string, hoursAgo: number, extra: Row = {}) =>
      T('community_support_chats').push({ id, user_id, status, agent_id: null, agent_name: '', ai_paused_until: null, created_at: ago(hoursAgo + 1), updated_at: ago(hoursAgo), ...extra });
    const msg = (id: string, chat_id: string, role: string, text: string, hours: number, extra: Row = {}) => {
      const c = T('community_support_chats').find((x) => x.id === chat_id);
      T('community_support_messages').push({ id, chat_id, sender_id: role === 'member' ? c?.user_id ?? null : null, role, agent_name: '', text, created_at: ago(hours), ...extra });
    };
    chat('adm_chat1', 'u_ruth', 'open', 0.3);
    msg('adm_sm1', 'adm_chat1', 'member', "I can't find where to change my church on my profile.", 0.6);
    msg('adm_sm2', 'adm_chat1', 'ai', 'Open your profile, choose Edit profile, then Church. Start typing its name and pick it from the list.', 0.59);
    msg('adm_sm3', 'adm_chat1', 'member', "My church isn't in the list. Can someone from the team add it?", 0.32);
    msg('adm_sm4', 'adm_chat1', 'ai', "I've asked someone from our team to join this chat. They'll reply here in a moment.", 0.3);
    chat('adm_chat2', 'u_daniel', 'open', 2, { agent_id: 'u_grace', agent_name: 'Grace Mensah', ai_paused_until: new Date(Date.now() + 12 * 60e3).toISOString() });
    msg('adm_sm5', 'adm_chat2', 'member', 'How do I make the Youth Ministry group private?', 2.4);
    msg('adm_sm6', 'adm_chat2', 'ai', "As the group's owner, open the group, choose Edit, then Privacy, and pick Private. Members stay; new people ask to join.", 2.39);
    msg('adm_sm7', 'adm_chat2', 'member', 'Can I move posts from the old group into this one?', 2.1);
    msg('adm_sm8', 'adm_chat2', 'agent', "Hi Daniel, it's Grace from the team. Not yet, but you can share each post into the group. I've passed the idea on!", 2, { sender_id: 'u_grace', agent_name: 'Grace Mensah' });
    chat('adm_chat3', 'u_joseph', 'closed', 70);
    msg('adm_sm9', 'adm_chat3', 'member', 'Hymn 530 had the wrong verse order on my phone.', 72);
    msg('adm_sm10', 'adm_chat3', 'ai', "Thank you for telling us. I've passed it to the team, who look after the hymnal.", 71.99);
    msg('adm_sm11', 'adm_chat3', 'agent', "Fixed now, Joseph. Thank you for spotting it!", 70, { sender_id: 'demo_me', agent_name: 'Demo Account' });

    // Requests: an identity check with its photos and the notability answers, and Plus arranged by a
    // church. (The older sample request from Esther was sent before photos were needed.)
    T('community_plus_requests').push(
      {
        id: 'adm_req_tick', user_id: 'u_samuel', kind: 'verify', note: 'I lead the media team that photographs camps and events for the conference.', status: 'pending', decided_by: null, decided_at: null, created_at: ago(3),
        selfie_path: 'adm/u_samuel/selfie.jpg', document_path: 'adm/u_samuel/document.jpg', document_type: 'passport', legal_name: 'Samuel Kofi Boateng', path: 'notable',
        category: 'Photographer', country: 'Ghana', audience: 'Church members across the conference follow the media team for photos of camps, baptisms and events.', known_as: 'Hillside Media',
        links: ['hillsidemedia.example.org', 'Camp meeting photo book, 2025'],
      },
      {
        id: 'adm_req_plus', user_id: 'u_ruth', kind: 'plus', note: 'Hillside church pays for Plus for the health ministries team. Receipt HS-2041.', status: 'pending', decided_by: null, decided_at: null, created_at: ago(8),
        selfie_path: '', document_path: '', document_type: '', legal_name: '', path: '', category: '', country: '', audience: '', known_as: '', links: [],
      },
    );
  },

  views: ({ T, profile }) => ({
    // As the real database's trigger does when someone from the team answers: the chat is handed to
    // them (their name on it, the assistant paused for half an hour), and every message moves the
    // chat up the queue. Worked out here from the messages, so nothing else needs to change.
    community_support_chats: () =>
      T('community_support_chats').map((c) => {
        const msgs = T('community_support_messages').filter((m) => m.chat_id === c.id);
        const latest = msgs.reduce((a: string, m) => (m.created_at > a ? m.created_at : a), c.updated_at);
        const answer = msgs.filter((m) => m.role === 'agent').sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
        if (!answer) return { ...c, updated_at: latest };
        const until = new Date(Date.parse(answer.created_at) + 30 * 60e3).toISOString();
        return {
          ...c,
          updated_at: latest,
          agent_id: answer.sender_id ?? c.agent_id,
          agent_name: answer.agent_name || (answer.sender_id ? profile(answer.sender_id).full_name || profile(answer.sender_id).username : c.agent_name),
          ai_paused_until: c.ai_paused_until && c.ai_paused_until > until ? c.ai_paused_until : until,
        };
      }),
    // The team's replies carry the name of the person who wrote them, as the trigger fills it in.
    community_support_messages: () =>
      T('community_support_messages').map((m) => (m.role === 'agent' && !m.agent_name && m.sender_id ? { ...m, agent_name: profile(m.sender_id).full_name || profile(m.sender_id).username } : { ...m })),
    // As the real view: each piece of feedback with who sent it (nothing once their account is gone).
    community_feedback_cards: () =>
      T('community_feedback').map((f) => {
        const p = f.user_id ? T('community_profiles').find((x) => x.id === f.user_id) : null;
        return { ...f, username: p ? profile(f.user_id).username : null, full_name: p?.full_name ?? null, avatar_url: p?.avatar_url ?? null };
      }),
  }),

  rpc: ({ T, profile, insertRow, me }) => {
    const base = adminRpc({ T, profile, insertRow, me });
    return Object.fromEntries(
      CRM_FUNCTIONS.filter((k) => base[k]).map((k) => [
        k,
        (args: any) => {
          if ((globalThis as any).__adminWithoutUpdate) throw new Error(`Could not find the function public.${k} in the schema cache`);
          return base[k](args);
        },
      ]),
    );
  },
};
