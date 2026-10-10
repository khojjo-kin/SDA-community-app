// Account tools from the iPhone app. The story archive (with new highlights) is a page of its own at
// /archive; the others are settings pages and Help, kept in the settings-*.tsx files and listed
// here under the names the rest of the app knows them by.
import React, { useEffect, useMemo, useState } from 'react';
import { createHighlight, fetchArchive } from 'shared/api';
import { listen } from 'shared/store';
import { dayLabel } from 'shared/theme';
import type { ArchivedStory } from 'shared/types';
import { openCreate } from '../lib/create';
import { dateLocale, languageCode, t } from '../lib/i18n';
import { useMe } from '../lib/me';
import { nav } from '../lib/router';
import { Empty, Failed, Icon, Link, Spinner, toast, toastError, useLoad } from '../ui/kit';
import { ArchiveViewer, StoryThumb } from '../ui/story-archive';
import '../styles/settings.css';

export { CreatorTools, ProfileViewers, SavedReplies } from './settings-profile';
export { CloseFriends } from './settings-privacy';
export { Help } from './settings-help';

/* ---------- story archive and new highlights ---------- */

/** "9 Sep": the app's own short date in English, the browser's in other languages. */
function shortDay(d: Date): string {
  return languageCode() === 'en' ? dayLabel(d) : d.toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' });
}

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
      const label = d.toLocaleDateString(dateLocale(), { month: 'long', year: 'numeric' });
      if (!out.length || out[out.length - 1].label !== label) out.push({ label, items: [] });
      out[out.length - 1].items.push(s);
    }
    return out;
  }, [list.data]);
  return (
    <div className="page st-archive">
      <Link to="/accounts/archive" className="st-back">
        <Icon name="back" size={18} /> {t('d.frame.settings')}
      </Link>
      <div className="dash-head">
        <h1 className="page-title">{t('d.frame.storiesArchive')}</h1>
        {list.data?.length ? (
          picking ? (
            <div className="btn-row">
              <input className="login-input short" placeholder={t('d.frame.highlightName')} value={title} maxLength={30} onChange={(e) => setTitle(e.target.value)} aria-label={t('d.frame.highlightName')} />
              <button
                className="btn"
                disabled={!picked.length || !title.trim()}
                onClick={async () => {
                  try {
                    const items = picked.map((id) => list.data!.find((s) => s.id === id)!.item);
                    await createHighlight(me.id, title, items);
                    toast(t('d.frame.highlightAdded'));
                    nav('/u/' + me.username);
                  } catch (e) {
                    toastError(e);
                  }
                }}
              >
                {t('d.frame.addHighlight')}
              </button>
              <button className="btn quiet" onClick={() => { setPicking(false); setPicked([]); }}>
                {t('common.cancel')}
              </button>
            </div>
          ) : (
            <button className="btn quiet" onClick={() => setPicking(true)}>
              {t('d.frame.newHighlight')}
            </button>
          )
        ) : null}
      </div>
      <p className="muted-text">{t('d.frame.archiveNote')}</p>
      {list.loading && !list.data ? (
        <Spinner />
      ) : list.error ? (
        <Failed error={list.error} retry={list.reload} />
      ) : !list.data?.length ? (
        <Empty icon="archive" title={t('d.frame.noStories')} body={t('d.frame.noStoriesBody')}>
          <button className="btn" onClick={() => openCreate({ mode: 'story' })}>
            {t('profile.addToStory')}
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
                  aria-label={[t('d.frame.storyFrom', { date: shortDay(new Date(s.created_at)) }), s.audience === 'close_friends' ? t('d.frame.sharedClose') : '', live ? t('d.frame.onStoryNow') : ''].filter(Boolean).join('. ')}
                  onClick={() => (picking ? setPicked(on ? picked.filter((x) => x !== s.id) : [...picked, s.id]) : setView(list.data!.indexOf(s)))}
                >
                  <StoryThumb item={s.item} />
                  <span className="archive-date">
                    <b>{new Date(s.created_at).getDate()}</b>
                    {new Date(s.created_at).toLocaleDateString(dateLocale(), { month: 'short' })}
                  </span>
                  {picking ? (
                    <span className={'pick-dot' + (on ? ' on' : '')}>{on ? picked.indexOf(s.id) + 1 : ''}</span>
                  ) : s.audience === 'close_friends' ? (
                    <span className="sar-friends" title={t('settings.closeFriends')}>
                      <Icon name="star" size={11} color="#fff" fill="#fff" stroke={0} />
                    </span>
                  ) : null}
                  {live ? <span className="sar-now">{t('d.frame.onStoryNow')}</span> : null}
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
