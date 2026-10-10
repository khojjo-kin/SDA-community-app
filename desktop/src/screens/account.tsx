// Account tools from the iPhone app. The story archive (with new highlights) is a page of its own at
// /archive; the others are settings pages and Help, kept in the settings-*.tsx files and listed
// here under the names the rest of the app knows them by.
import React, { useEffect, useMemo, useState } from 'react';
import { createHighlight, fetchArchive } from 'shared/api';
import { listen } from 'shared/store';
import { dayLabel } from 'shared/theme';
import type { ArchivedStory } from 'shared/types';
import { openCreate } from '../lib/create';
import { useMe } from '../lib/me';
import { nav } from '../lib/router';
import { Empty, Failed, Icon, Link, Spinner, toast, toastError, useLoad } from '../ui/kit';
import { ArchiveViewer, StoryThumb } from '../ui/story-archive';
import '../styles/settings.css';

export { CreatorTools, ProfileViewers, SavedReplies } from './settings-profile';
export { CloseFriends } from './settings-privacy';
export { Help } from './settings-help';

/* ---------- story archive and new highlights ---------- */

/**
 * Every story you have shared, by month (the iPhone's Archive). Click one to see it large, with
 * Highlight, Share again and Delete (ui/story-archive.tsx); or choose several for a new highlight.
 */
export function Archive() {
  const { me } = useMe();
  const list = useLoad(() => fetchArchive(me.id), []);
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [view, setView] = useState<number | null>(null);
  // A story shared again (or a new one) joins the archive straight away.
  useEffect(() => listen('stories', list.reload), []);
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
      {list.loading && !list.data ? (
        <Spinner />
      ) : list.error ? (
        <Failed error={list.error} retry={list.reload} />
      ) : !list.data?.length ? (
        <Empty icon="archive" title="No stories yet" body="Stories you share are kept here, even after 24 hours.">
          <button className="btn" onClick={() => openCreate({ mode: 'story' })}>
            Add to your story
          </button>
        </Empty>
      ) : null}
      {byMonth.map((m) => (
        <section key={m.label}>
          <h3 className="section-h">{m.label}</h3>
          <div className="archive-grid">
            {m.items.map((s) => {
              const on = picked.includes(s.id);
              const live = new Date(s.expires_at).getTime() > Date.now();
              return (
                <button
                  key={s.id}
                  className={'archive-tile sar-tile' + (on ? ' on' : '')}
                  aria-label={[`Story from ${dayLabel(new Date(s.created_at))}`, s.audience === 'close_friends' ? 'Shared with close friends' : '', live ? 'On your story now' : ''].filter(Boolean).join('. ')}
                  onClick={() => (picking ? setPicked(on ? picked.filter((x) => x !== s.id) : [...picked, s.id]) : setView(list.data!.indexOf(s)))}
                >
                  <StoryThumb item={s.item} />
                  <span className="archive-date">
                    <b>{new Date(s.created_at).getDate()}</b>
                    {new Date(s.created_at).toLocaleDateString('en-GB', { month: 'short' })}
                  </span>
                  {picking ? (
                    <span className={'pick-dot' + (on ? ' on' : '')}>{on ? picked.indexOf(s.id) + 1 : ''}</span>
                  ) : s.audience === 'close_friends' ? (
                    <span className="sar-friends" title="Close friends">
                      <Icon name="star" size={11} color="#fff" fill="#fff" stroke={0} />
                    </span>
                  ) : null}
                  {live ? <span className="sar-now">On your story now</span> : null}
                </button>
              );
            })}
          </div>
        </section>
      ))}
      {view !== null && list.data?.length ? (
        <ArchiveViewer
          entries={list.data}
          start={view}
          onClose={() => setView(null)}
          onDeleted={(id) => list.set(list.data!.filter((s: ArchivedStory) => s.id !== id))}
        />
      ) : null}
    </div>
  );
}
