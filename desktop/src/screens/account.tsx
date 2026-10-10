// Creator and account tools from the iPhone app: the dashboard, saved replies, frequently asked
// questions, close friends, the story archive and new highlights, who viewed your profile,
// Community Plus and Help. All through the shared api.ts, so both apps see the same data.
import React, { useEffect, useMemo, useState } from 'react';
import { coverOf, createHighlight, deleteFaq, deleteSavedReply, fetchArchive, fetchFaqs, fetchProfileViewers, fetchSavedReplies, fetchStats, listCloseFriends, listPeople, myPlusRequests, mySupportTickets, openSupportTicket, requestPlus, saveFaq, saveReply, searchProfiles, setCloseFriend, updateProfile } from 'shared/api';
import { ago, agoLong, dayLabelISO, fmt } from 'shared/theme';
import type { ArchivedStory, Profile, Stats } from 'shared/types';
import { useMe } from '../lib/me';
import { nav } from '../lib/router';
import { Avatar, Empty, Failed, Icon, Link, Modal, Spinner, Verified, toast, toastError, useLoad } from '../ui/kit';
import { StoryCanvas } from '../ui/stories';

/* ---------- professional dashboard ---------- */

const RANGES = [
  { days: 7, label: 'Last 7 days' },
  { days: 30, label: 'Last 30 days' },
  { days: 90, label: 'Last 90 days' },
];

export function Dashboard() {
  const { me } = useMe();
  const [days, setDays] = useState(30);
  const stats = useLoad<Stats>(() => fetchStats(new Date(Date.now() - days * 86400e3), new Date()), [days]);
  const s = stats.data;
  const max = Math.max(1, ...(s?.days ?? []).map((d) => d.views));
  return (
    <div className="page dash">
      <div className="dash-head">
        <h1 className="page-title">Professional dashboard</h1>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Period">
          {RANGES.map((r) => (
            <option key={r.days} value={r.days}>
              {r.label}
            </option>
          ))}
        </select>
      </div>
      {me.account_type !== 'creator' ? (
        <p className="note">
          Your account is personal. Switch to a creator account in <Link to="/accounts/professional" className="link-btn">Settings → Creator tools</Link> to add a category to your profile and turn on frequently asked questions.
        </p>
      ) : null}
      {stats.loading && !s ? <Spinner /> : stats.error ? <Failed error={stats.error} retry={stats.reload} /> : s ? (
        <>
          <div className="stat-tiles">
            <div className="tile-stat">
              <span>Views</span>
              <b>{fmt(s.views)}</b>
              <em>
                {fmt(s.post_views)} on posts · {fmt(s.story_views)} on stories
              </em>
            </div>
            <div className="tile-stat">
              <span>Accounts reached</span>
              <b>{fmt(s.accounts)}</b>
              <em>Different people who saw something of yours</em>
            </div>
            <div className="tile-stat">
              <span>Followers</span>
              <b>{fmt(s.followers)}</b>
              <em className={s.new_followers ? 'up' : ''}>{s.new_followers ? `+${fmt(s.new_followers)} in this period` : 'No new followers in this period'}</em>
            </div>
            <div className="tile-stat">
              <span>Interactions</span>
              <b>{fmt(s.likes + s.comments + s.reposts)}</b>
              <em>
                {fmt(s.likes)} likes · {fmt(s.comments)} comments · {fmt(s.reposts)} reposts
              </em>
            </div>
          </div>
          <section className="dash-card">
            <h3>Views by day</h3>
            <div className="bars-chart" role="img" aria-label="Views by day">
              {s.days.map((d) => (
                <div key={d.d} className="bar-col" title={`${dayLabelISO(d.d)}: ${d.views} views, ${d.followers} new followers`}>
                  <i style={{ height: `${(d.views / max) * 100}%` }} />
                </div>
              ))}
            </div>
            <div className="bars-axis">
              <span>{s.days[0] ? dayLabelISO(s.days[0].d) : ''}</span>
              <span>{s.days.length ? dayLabelISO(s.days[s.days.length - 1].d) : ''}</span>
            </div>
          </section>
          <section className="dash-card">
            <h3>Your content</h3>
            <p className="muted-text">
              {s.posts} posts · {s.reels} reels · {s.stories} stories shared in this period
            </p>
            {s.top.length ? (
              <div className="top-grid">
                {s.top.map((t) => (
                  <Link key={t.id} to={'/p/' + t.id} className="top-item">
                    {t.media ? <img src={t.media.type === 'video' ? t.media.poster || '' : t.media.url} alt="" /> : <span className="hl-blank" />}
                    <span>
                      <Icon name="eye" size={14} /> {fmt(t.views)} <Icon name="heart" size={14} /> {fmt(t.likes)}
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="muted-text">Share a post to see how it does here.</p>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}

/* ---------- saved replies ---------- */

export function SavedReplies() {
  const { me } = useMe();
  const list = useLoad(() => fetchSavedReplies(me.id), []);
  const [edit, setEdit] = useState<{ id?: string; shortcut: string; body: string } | null>(null);
  return (
    <div className="settings-card">
      <h1>Saved replies</h1>
      <p className="muted-text">Answers you send often. In a chat, type / and the shortcut, or press the saved replies button.</p>
      {list.loading ? <Spinner /> : null}
      {(list.data ?? []).map((r) => (
        <div key={r.id} className="setting">
          <div>
            <b>/{r.shortcut}</b>
            <p>{r.body}</p>
          </div>
          <button className="btn quiet small" onClick={() => setEdit(r)}>
            Edit
          </button>
          <button className="icon-btn" aria-label="Delete" onClick={() => deleteSavedReply(r.id).then(list.reload, toastError)}>
            <Icon name="trash" size={18} />
          </button>
        </div>
      ))}
      <button className="btn" onClick={() => setEdit({ shortcut: '', body: '' })}>
        New saved reply
      </button>
      {edit ? (
        <Modal title={edit.id ? 'Edit saved reply' : 'New saved reply'} onClose={() => setEdit(null)} wide>
          <div className="form-pad">
            <label className="form-row">
              <span>Shortcut</span>
              <input value={edit.shortcut} maxLength={30} onChange={(e) => setEdit({ ...edit, shortcut: e.target.value.replace(/[^\w]/g, '') })} placeholder="thanks" />
            </label>
            <label className="form-row">
              <span>Message</span>
              <textarea rows={4} value={edit.body} maxLength={1000} onChange={(e) => setEdit({ ...edit, body: e.target.value })} />
            </label>
            <button
              className="btn block"
              disabled={!edit.shortcut.trim() || !edit.body.trim()}
              onClick={() =>
                saveReply(me.id, edit).then(() => {
                  setEdit(null);
                  list.reload();
                }, toastError)
              }
            >
              Save
            </button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

/* ---------- creator tools: account type, category, FAQs ---------- */

export function CreatorTools() {
  const { me, refresh } = useMe();
  const faqs = useLoad(() => fetchFaqs(me.id), []);
  const [category, setCategory] = useState(me.category);
  const [edit, setEdit] = useState<{ id?: string; question: string; answer: string } | null>(null);
  const creator = me.account_type === 'creator';
  const set = (patch: any) => updateProfile(me.id, patch).then(refresh, toastError);
  return (
    <div className="settings-card">
      <h1>Creator tools</h1>
      <div className="setting">
        <div>
          <b>Creator account</b>
          <p>Show a category on your profile, see your dashboard, and answer common questions automatically in messages.</p>
        </div>
        <button role="switch" aria-checked={creator} aria-label="Creator account" className={'switch' + (creator ? ' on' : '')} onClick={() => set({ account_type: creator ? 'personal' : 'creator' })}>
          <i />
        </button>
      </div>
      {creator ? (
        <>
          <label className="form-row">
            <span>Category</span>
            <input value={category} maxLength={40} placeholder="Musician, Pastor, Choir…" onChange={(e) => setCategory(e.target.value)} onBlur={() => category !== me.category && set({ category: category.trim() })} />
          </label>
          <div className="setting">
            <div>
              <b>Frequently asked questions</b>
              <p>Up to 8 questions people can tap when they message you. Your answer is sent straight away.</p>
            </div>
            <button role="switch" aria-checked={me.faq_enabled} aria-label="Frequently asked questions" className={'switch' + (me.faq_enabled ? ' on' : '')} onClick={() => set({ faq_enabled: !me.faq_enabled })}>
              <i />
            </button>
          </div>
          {(faqs.data ?? []).map((f) => (
            <div key={f.id} className="setting">
              <div>
                <b>{f.question}</b>
                <p>{f.answer}</p>
              </div>
              <button className="btn quiet small" onClick={() => setEdit(f)}>
                Edit
              </button>
              <button className="icon-btn" aria-label="Delete" onClick={() => deleteFaq(f.id).then(faqs.reload, toastError)}>
                <Icon name="trash" size={18} />
              </button>
            </div>
          ))}
          {(faqs.data?.length ?? 0) < 8 ? (
            <button className="btn quiet" onClick={() => setEdit({ question: '', answer: '' })}>
              Add a question
            </button>
          ) : null}
        </>
      ) : null}
      {edit ? (
        <Modal title={edit.id ? 'Edit question' : 'New question'} onClose={() => setEdit(null)} wide>
          <div className="form-pad">
            <label className="form-row">
              <span>Question</span>
              <input value={edit.question} maxLength={120} onChange={(e) => setEdit({ ...edit, question: e.target.value })} placeholder="What time is the Sabbath service?" />
            </label>
            <label className="form-row">
              <span>Answer</span>
              <textarea rows={4} value={edit.answer} maxLength={1000} onChange={(e) => setEdit({ ...edit, answer: e.target.value })} />
            </label>
            <button
              className="btn block"
              disabled={!edit.question.trim() || !edit.answer.trim()}
              onClick={() =>
                saveFaq(me.id, { ...edit, position: faqs.data?.length ?? 0 }).then(() => {
                  setEdit(null);
                  faqs.reload();
                }, toastError)
              }
            >
              Save
            </button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

/* ---------- close friends ---------- */

export function CloseFriends() {
  const { me } = useMe();
  const friends = useLoad(() => listCloseFriends(me.id), []);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Profile[] | null>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      if (q.trim()) searchProfiles(q).then((r) => setFound(r.filter((p) => p.id !== me.id)), () => {});
      else listPeople(me.id, 'following').then(setFound, () => setFound([]));
    }, 220);
    return () => clearTimeout(t);
  }, [q]);
  const ids = new Set((friends.data ?? []).map((p) => p.id));
  const flip = (p: Profile) => setCloseFriend(me.id, p.id, !ids.has(p.id)).then(friends.reload, toastError);
  return (
    <div className="settings-card">
      <h1>Close friends</h1>
      <p className="muted-text">Share a story with only these people. Nobody is told when you add or remove them.</p>
      <div className="panel-search in-modal flat">
        <input placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search people" />
      </div>
      {friends.data?.length && !q ? <h3 className="list-h">On your list · {friends.data.length}</h3> : null}
      {!q ? (friends.data ?? []).map((p) => <PersonCheck key={p.id} p={p} on onClick={() => flip(p)} />) : null}
      <h3 className="list-h">{q ? 'Results' : 'People you follow'}</h3>
      {found === null ? <Spinner /> : null}
      {(found ?? []).filter((p) => q || !ids.has(p.id)).map((p) => (
        <PersonCheck key={p.id} p={p} on={ids.has(p.id)} onClick={() => flip(p)} />
      ))}
    </div>
  );
}

function PersonCheck({ p, on, onClick }: { p: Profile; on: boolean; onClick: () => void }) {
  return (
    <label className="row flat">
      <Avatar src={p.avatar_url} name={p.username} size={44} />
      <span className="row-text">
        <b>{p.username}</b>
        <span>{p.full_name}</span>
      </span>
      <input type="checkbox" className="round-check close" checked={on} onChange={onClick} aria-label={(on ? 'Remove ' : 'Add ') + p.username} />
    </label>
  );
}

/* ---------- story archive and new highlights ---------- */

export function Archive() {
  const { me } = useMe();
  const list = useLoad(() => fetchArchive(me.id), []);
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [view, setView] = useState<ArchivedStory | null>(null);
  const byMonth = useMemo(() => {
    const out: { label: string; items: ArchivedStory[] }[] = [];
    for (const s of list.data ?? []) {
      const d = new Date(s.created_at);
      const label = d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
      if (!out.length || out[out.length - 1].label !== label) out.push({ label, items: [] });
      out[out.length - 1].items.push(s);
    }
    return out;
  }, [list.data]);
  return (
    <div className="page">
      <div className="dash-head">
        <h1 className="page-title">Stories archive</h1>
        {list.data?.length ? (
          picking ? (
            <div className="btn-row">
              <input className="login-input short" placeholder="Highlight name" value={title} maxLength={30} onChange={(e) => setTitle(e.target.value)} aria-label="Highlight name" />
              <button
                className="btn"
                disabled={!picked.length || !title.trim()}
                onClick={async () => {
                  try {
                    const items = picked.map((id) => list.data!.find((s) => s.id === id)!.item);
                    await createHighlight(me.id, title, items);
                    toast('Highlight added to your profile');
                    nav('/u/' + me.username);
                  } catch (e) {
                    toastError(e);
                  }
                }}
              >
                Add highlight
              </button>
              <button className="btn quiet" onClick={() => { setPicking(false); setPicked([]); }}>
                Cancel
              </button>
            </div>
          ) : (
            <button className="btn quiet" onClick={() => setPicking(true)}>
              New highlight
            </button>
          )
        ) : null}
      </div>
      <p className="muted-text">Only you can see your archive. Stories stay here after they disappear from your profile.</p>
      {list.loading ? <Spinner /> : list.error ? <Failed error={list.error} retry={list.reload} /> : !list.data?.length ? <Empty icon="archive" title="No stories yet" body="Stories you share are kept here, even after 24 hours." /> : null}
      {byMonth.map((m) => (
        <section key={m.label}>
          <h3 className="section-h">{m.label}</h3>
          <div className="archive-grid">
            {m.items.map((s) => {
              const cover = coverOf(s.item);
              const on = picked.includes(s.id);
              return (
                <button key={s.id} className={'archive-tile' + (on ? ' on' : '')} onClick={() => (picking ? setPicked(on ? picked.filter((x) => x !== s.id) : [...picked, s.id]) : setView(s))}>
                  {cover ? <img src={cover} alt="" /> : <span className="fill" style={{ background: 'linear-gradient(135deg,#4a5df6,#b13df0)' }} />}
                  <span className="archive-date">
                    <b>{new Date(s.created_at).getDate()}</b>
                    {new Date(s.created_at).toLocaleDateString('en-GB', { month: 'short' })}
                  </span>
                  {picking ? <span className={'pick-dot' + (on ? ' on' : '')}>{on ? picked.indexOf(s.id) + 1 : ''}</span> : null}
                </button>
              );
            })}
          </div>
        </section>
      ))}
      {view ? (
        <Modal onClose={() => setView(null)} bare className="archive-view">
          <StoryCanvas item={view.item} width={360} height={640} />
        </Modal>
      ) : null}
    </div>
  );
}

/* ---------- who viewed your profile (Plus) ---------- */

export function ProfileViewers() {
  const { me } = useMe();
  const list = useLoad(() => fetchProfileViewers(me.id), []);
  return (
    <div className="settings-card">
      <h1>Profile viewers</h1>
      <p className="muted-text">{me.views_week ? `${me.views_week} people looked at your profile in the last 7 days.` : 'Nobody has looked at your profile in the last 7 days.'}</p>
      {!me.plus ? (
        <p className="note">
          Seeing who they are is a Community Plus perk. <Link to="/plus" className="link-btn">About Plus</Link>
        </p>
      ) : list.loading ? <Spinner /> : list.error ? <Failed error={list.error} retry={list.reload} /> : (
        (list.data ?? []).map((v) => (
          <div className="row flat" key={v.viewer_id}>
            <Avatar src={v.avatar_url} name={v.username} size={44} onClick={() => nav('/u/' + v.username)} />
            <span className="row-text">
              <Link to={'/u/' + v.username} className="uname">
                {v.username}
                {v.verified ? <Verified size={12} /> : null}
              </Link>
              <span>
                {v.full_name} · {ago(v.viewed_at)}
              </span>
            </span>
          </div>
        ))
      )}
    </div>
  );
}

/* ---------- Community Plus ---------- */

export function Plus() {
  const { me } = useMe();
  const requests = useLoad(() => myPlusRequests(me.id), []);
  const [note, setNote] = useState('');
  const pending = (requests.data ?? []).find((r) => r.status === 'pending');
  const ask = async (kind: 'verify' | 'plus') => {
    try {
      await requestPlus(me.id, kind, note);
      toast(kind === 'verify' ? 'Request sent. An admin will review it.' : 'Request sent.');
      setNote('');
      requests.reload();
    } catch (e) {
      toastError(e);
    }
  };
  return (
    <div className="page narrow-page plus-page">
      <div className="plus-hero">
        <Verified size={40} />
        <h1>Community Plus</h1>
        <p>{me.plus ? `Active${me.plus_until ? ' until ' + new Date(me.plus_until).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : ''}.` : 'The verified tick and more, for £4.99 a month.'}</p>
      </div>
      <ul className="perk-list">
        <li><Icon name="verified" size={20} color="#3d8bff" /> The verified tick next to your name</li>
        <li><Icon name="boost" size={20} /> Boost a post to the top of For you and Explore</li>
        <li><Icon name="eye" size={20} /> See who viewed your profile</li>
        <li><Icon name="crown" size={20} /> Appear in the Subscribers feed</li>
        <li><Icon name="wallpaper" size={20} /> Chat wallpapers, app fonts and photo adjustments on iPhone</li>
        <li><Icon name="podcast" size={20} /> Share songs and podcasts on Pod</li>
      </ul>
      {me.plus ? (
        <p className="note">Manage your subscription in the Community app on iPhone (Settings → Community Plus).</p>
      ) : (
        <>
          <p className="note">Subscribing uses Apple Pay or a card in the Community app on iPhone. You can also ask an admin for the verified tick here.</p>
          {pending ? (
            <p className="note">
              Your {pending.kind === 'verify' ? 'verification' : 'Plus'} request ({agoLong(pending.created_at).toLowerCase()}) is waiting for an admin.
            </p>
          ) : (
            <div className="form-pad flat">
              <label className="form-row">
                <span>Why should your account have the tick? (optional)</span>
                <textarea rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="I lead the youth ministry at…" />
              </label>
              <button className="btn" onClick={() => ask('verify')}>
                Request the verified tick
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ---------- help and support ---------- */

export function Help() {
  const { me } = useMe();
  const tickets = useLoad(() => mySupportTickets(me.id), []);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div className="page narrow-page">
      <h1 className="page-title">Help</h1>
      <section className="dash-card">
        <h3>Contact the Community team</h3>
        <p className="muted-text">Tell us what's wrong or what you need. An admin answers here and in the iPhone app.</p>
        <label className="form-row">
          <span>Subject</span>
          <input value={subject} maxLength={140} onChange={(e) => setSubject(e.target.value)} />
        </label>
        <label className="form-row">
          <span>Message</span>
          <textarea rows={5} maxLength={4000} value={body} onChange={(e) => setBody(e.target.value)} />
        </label>
        <button
          className="btn"
          disabled={busy || !subject.trim() || !body.trim()}
          onClick={async () => {
            setBusy(true);
            try {
              await openSupportTicket(me.id, subject, body);
              setSubject('');
              setBody('');
              toast('Sent. We will reply here.');
              tickets.reload();
            } catch (e) {
              toastError(e);
            } finally {
              setBusy(false);
            }
          }}
        >
          Send
        </button>
      </section>
      <h3 className="section-h">Your requests</h3>
      {tickets.loading ? <Spinner /> : !tickets.data?.length ? <p className="muted-text">You haven't contacted us yet.</p> : null}
      {(tickets.data ?? []).map((t) => (
        <section key={t.id} className="dash-card ticket">
          <div className="ticket-head">
            <b>{t.subject}</b>
            <span className={'pill status-' + t.status}>{t.status === 'open' ? 'Waiting' : t.status === 'answered' ? 'Answered' : 'Closed'}</span>
          </div>
          <p className="pre">{t.body}</p>
          {t.reply ? (
            <div className="ticket-reply">
              <b>Community team</b>
              <p className="pre">{t.reply}</p>
            </div>
          ) : null}
          <span className="muted-text small">{agoLong(t.created_at)}</span>
        </section>
      ))}
    </div>
  );
}
