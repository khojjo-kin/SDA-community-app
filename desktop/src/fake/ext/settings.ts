// Demo data for Settings, Help and onboarding: birthdays, a support chat (the assistant answers,
// then a person from the team), an answered support request, creator subscriptions both ways and a
// blocked account. The "support" function stands in for the real one that writes the assistant's reply.
import type { Ext, Row } from './types';

const H = 3600e3;
const ago = (hours: number) => new Date(Date.now() - hours * H).toISOString();
const ERHA = 'user_3KTkRcnk7CCL3EaTDjWtptR4YMO';

/** Sample answers, picked by a word in the question. The real assistant is a language model. */
const ANSWERS: [RegExp, string][] = [
  [/private/i, 'A private account means only the followers you approve see your posts and stories. Turn it on in Settings → Account privacy. Accounts of members under 14 always stay private.'],
  [/password|email|log ?in|sign ?in/i, 'You can change your email and password in Settings → Accounts Centre → Email, password and security. The same account works on the iPhone and on the computer.'],
  [/plus|subscri/i, 'Community Plus is £4.99 a month: Erha without limits, profile viewers, read receipts off and more. You can cancel at any time from the Plus page.'],
  [/delete|deactivat|close my account/i, 'In Settings → Accounts Centre you can deactivate your account. Everything is hidden straight away, and you have 30 days to log back in and restore it.'],
  [/tick|verif/i, 'The blue tick is free: request it from the Plus page with a photo of an ID document and a selfie. An admin checks them by eye.'],
  [/block|report/i, 'Open the three dots on a post, comment or profile and choose Report or Block. An admin looks at every report.'],
];

const HANDOVER = /person|human|someone|agent|team|staff/i;

export const ext: Ext = {
  seed: ({ T }) => {
    // Everyone has given a birthday except Ruth, who is asked for hers once she logs in.
    const born: Record<string, string> = { demo_me: '1994-05-14', u_grace: '1988-03-02', u_daniel: '1996-11-20', u_samuel: '1991-07-09', u_esther: '1999-01-30', u_joseph: '1965-08-18', u_kwame: '2001-04-04', [ERHA]: '2000-01-01' };
    for (const [user_id, birth_date] of Object.entries(born)) T('community_private_details').push({ id: 'pd_' + user_id, user_id, birth_date });

    // Creator subscriptions: two people subscribe to me; I subscribe to Samuel.
    const person = (id: string) => T('community_profiles').find((p) => p.id === id);
    const mine = person('demo_me');
    if (mine) mine.sub_price_pence ??= 299;
    const samuel = person('u_samuel');
    if (samuel) samuel.sub_price_pence ??= 199;
    const sub = (id: string, creator_id: string, subscriber_id: string, amount_pence: number, days: number, extra: Row = {}) =>
      T('community_creator_subs').push({ id, creator_id, subscriber_id, status: 'active', amount_pence, cancel_at_period_end: false, current_period_end: new Date(Date.now() + (30 - (days % 30)) * 24 * H).toISOString(), created_at: ago(days * 24), ...extra });
    sub('set_cs1', 'demo_me', 'u_ruth', 299, 40);
    sub('set_cs2', 'demo_me', 'u_esther', 299, 12, { cancel_at_period_end: true });
    sub('set_cs3', 'u_samuel', 'demo_me', 199, 20);

    // A spam account I blocked.
    T('community_blocks').push({ blocker_id: 'demo_me', blocked_id: 'u_kwame', created_at: ago(30) });

    // Live support: the assistant answered first, then Grace from the team.
    T('community_support_chats').push({ id: 'set_chat1', user_id: 'demo_me', status: 'open', agent_id: 'u_grace', agent_name: 'Grace', ai_paused_until: null, created_at: ago(50), updated_at: ago(49) });
    const msg = (id: string, role: string, text: string, hours: number, extra: Row = {}) =>
      T('community_support_messages').push({ id, chat_id: 'set_chat1', sender_id: role === 'member' ? 'demo_me' : null, role, agent_name: '', text, created_at: ago(hours), ...extra });
    msg('set_sm1', 'member', 'How do I add a second account on my Mac?', 50);
    msg('set_sm2', 'ai', 'Open More → Switch accounts and choose Log in to an existing account. You can keep up to five accounts signed in and move between them without logging out.', 49.99);
    msg('set_sm3', 'member', 'Thanks! My church account still asks me to log in every time though.', 49.9);
    msg('set_sm4', 'agent', "Hi, I'm Grace from the support team. I've looked at your church account and reset its sign-in, so it should stay logged in now. Let me know if it happens again!", 49, { sender_id: 'u_grace', agent_name: 'Grace' });

    // An older request from before live chat, already answered.
    T('community_support_tickets').push({ id: 'set_st1', user_id: 'demo_me', subject: 'Hymn numbers', body: 'Hymn 108 shows the wrong first line on my phone.', status: 'answered', reply: 'Thank you! It is fixed in the hymnal now.', created_at: ago(300), updated_at: ago(280) });
  },

  functions: ({ T, insertRow, now }) => ({
    // The real function answers the member's latest message with the support assistant, unless a
    // person from the team has stepped in during the last half hour.
    support: (body: Row) => {
      const chat = T('community_support_chats').find((c) => c.id === body.chat_id);
      if (!chat) throw new Error('This chat was not found.');
      chat.updated_at = now();
      chat.status = 'open';
      if (chat.ai_paused_until && Date.parse(chat.ai_paused_until) > Date.now()) return { answered_by: 'agent' };
      const last = T('community_support_messages').filter((m) => m.chat_id === chat.id && m.role === 'member').sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
      const text = String(last?.text ?? '');
      if (HANDOVER.test(text)) {
        insertRow('community_support_messages', { chat_id: chat.id, sender_id: null, role: 'ai', agent_name: '', text: "I've asked someone from our team to join this chat. They'll reply here in a moment." });
        // Grace from the team joins a little later, under her own name; the assistant then keeps quiet.
        setTimeout(() => {
          Object.assign(chat, { agent_id: 'u_grace', agent_name: 'Grace', ai_paused_until: new Date(Date.now() + 30 * 60e3).toISOString(), updated_at: new Date().toISOString() });
          insertRow('community_support_messages', { chat_id: chat.id, sender_id: 'u_grace', role: 'agent', agent_name: 'Grace', text: "Hi, I'm Grace from the support team. I'm reading through your messages now, how can I help?" });
        }, 1500);
        return { answered_by: 'ai' };
      }
      const answer = ANSWERS.find(([re]) => re.test(text))?.[1] ?? 'This is the demo, so I can only give sample answers. In the real app I answer questions about using Community at any time, and someone from the team joins if I can\'t help. Ask for a person to see that.';
      insertRow('community_support_messages', { chat_id: chat.id, sender_id: null, role: 'ai', agent_name: '', text: answer });
      return { answered_by: 'ai' };
    },
  }),
};
