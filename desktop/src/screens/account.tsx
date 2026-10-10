// Account tools from the iPhone app. The story archive (with new highlights) is a page of its own at
// /archive; the others are settings pages and Help, kept in the settings-*.tsx files and listed
// here under the names the rest of the app knows them by.
import React, { useMemo, useState } from 'react';
import { coverOf, createHighlight, fetchArchive } from 'shared/api';
import type { ArchivedStory } from 'shared/types';
import { useMe } from '../lib/me';
import { nav } from '../lib/router';
import { Empty, Failed, Icon, Link, Modal, Spinner, toast, toastError, useLoad } from '../ui/kit';
import { StoryCanvas } from '../ui/stories';
import '../styles/settings.css';

export { CreatorTools, ProfileViewers, SavedReplies } from './settings-profile';
export { CloseFriends } from './settings-privacy';
export { Help } from './settings-help';

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
    <div className="page st-archive">
      <Link to="/accounts/archive" className="st-back">
        <Icon name="back" size={18} /> Settings
      </Link>
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
