// The Hymnal, from the iPhone app (app/(app)/hymnal.tsx and hymn/[number].tsx): every hymn of the
// Seventh-day Adventist Hymnal, search, favourites and text size. Admins can correct a hymn's
// title, author, section and words (saveHymn), as on the iPhone.
import React, { useEffect, useMemo, useState } from 'react';
import { fetchHymn, fetchHymns, saveHymn } from 'shared/api';
import type { Hymn } from 'shared/types';
import { useMe } from '../lib/me';
import { Empty, Failed, Icon, Link, Modal, Spinner, toast, toastError, useLoad } from '../ui/kit';
import { HYMN_COUNT, loadFavourites, loadHymnalSettings, saveHymnalSettings, toggleFavourite } from 'shared/hymnal';
import '../styles/church.css';

export function Hymnal({ number }: { number?: string }) {
  const { me } = useMe();
  const admin = !!me.admin_role;
  const [editing, setEditing] = useState(false);
  const list = useLoad(() => fetchHymns(), []);
  const [q, setQ] = useState('');
  const [favs, setFavs] = useState<number[]>([]);
  const [onlyFavs, setOnlyFavs] = useState(false);
  const [size, setSize] = useState(18);
  useEffect(() => {
    loadFavourites().then(setFavs);
    loadHymnalSettings().then((s) => setSize(s.size));
  }, []);
  const resize = (n: number) => {
    setSize(n);
    saveHymnalSettings({ size: n });
  };
  const [hymn, setHymn] = useState<Hymn | null>(null);
  const [loadingHymn, setLoadingHymn] = useState(false);
  useEffect(() => {
    if (!number) return setHymn(null);
    setLoadingHymn(true);
    fetchHymn(Number(number)).then(setHymn, toastError).finally(() => setLoadingHymn(false));
  }, [number]);
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (list.data ?? []).filter((h) => (!onlyFavs || favs.includes(h.number)) && (!n || String(h.number) === n || h.title.toLowerCase().includes(n) || (h.section ?? '').toLowerCase().includes(n)));
  }, [q, list.data, onlyFavs, favs]);
  return (
    <div className="split-page">
      <section className="split-list">
        <header>
          <h1>Hymnal</h1>
          <div className="panel-search in-modal">
            <input placeholder="Number, title or section" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search hymns" />
          </div>
          <div className="seg left pad-l">
            <button className={!onlyFavs ? 'on' : ''} onClick={() => setOnlyFavs(false)}>
              All {list.data ? list.data.length : HYMN_COUNT}
            </button>
            <button className={onlyFavs ? 'on' : ''} onClick={() => setOnlyFavs(true)}>
              Favourites {favs.length}
            </button>
          </div>
        </header>
        <div className="split-scroll">
          {list.loading ? <Spinner /> : list.error ? <Failed error={list.error} retry={list.reload} /> : null}
          {shown.map((h) => (
            <Link key={h.number} to={'/hymnal/' + h.number} className={'hymn-row' + (String(h.number) === number ? ' on' : '')}>
              <span className="hymn-no">{h.number}</span>
              <span className="row-text">
                <b>{h.title}</b>
                <span>{h.section}</span>
              </span>
            </Link>
          ))}
          {list.data && !shown.length ? <p className="muted-text pad">No hymn matches “{q}”.</p> : null}
        </div>
      </section>
      <section className="split-detail">
        {loadingHymn ? <Spinner /> : hymn ? (
          <article className="hymn">
            <div className="reader-bar">
              <div className="hymn-no big">{hymn.number}</div>
              <span className="grow" />
              {admin ? (
                <button className="btn quiet small" onClick={() => setEditing(true)} aria-label="Edit hymn">
                  <Icon name="compose" size={16} /> Edit
                </button>
              ) : null}
              <button className="icon-btn" aria-label={favs.includes(hymn.number) ? 'Remove from favourites' : 'Add to favourites'} onClick={() => toggleFavourite(hymn.number).then(setFavs)}>
                <Icon name="heart" size={24} color={favs.includes(hymn.number) ? '#ff3040' : 'currentColor'} fill={favs.includes(hymn.number) ? '#ff3040' : 'none'} />
              </button>
              <button className="btn quiet small" aria-label="Smaller text" onClick={() => resize(Math.max(14, size - 2))}>
                A−
              </button>
              <button className="btn quiet small" aria-label="Larger text" onClick={() => resize(Math.min(32, size + 2))}>
                A+
              </button>
            </div>
            <h1>{hymn.title}</h1>
            {hymn.author ? <p className="muted-text">{hymn.author}</p> : null}
            {hymn.section ? <p className="ch-hymn-section">{hymn.section}</p> : null}
            <div className="lyrics" style={{ fontSize: size }}>{hymn.lyrics}</div>
            {editing ? (
              <HymnEditor
                hymn={hymn}
                onClose={() => setEditing(false)}
                onSaved={(h) => {
                  setHymn(h);
                  setEditing(false);
                  list.reload();
                }}
              />
            ) : null}
          </article>
        ) : (
          <Empty icon="hymnal" title="Choose a hymn" body={list.data ? `${list.data.length} hymns from the Seventh-day Adventist Hymnal.` : undefined} />
        )}
      </section>
    </div>
  );
}

/** Admins: the hymn's title, author, section and words (verses separated by a blank line). */
function HymnEditor({ hymn, onClose, onSaved }: { hymn: Hymn; onClose: () => void; onSaved: (h: Hymn) => void }) {
  const { me } = useMe();
  const [form, setForm] = useState({ title: hymn.title, author: hymn.author ?? '', section: hymn.section ?? '', lyrics: hymn.lyrics ?? '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });
  const changed = JSON.stringify(form) !== JSON.stringify({ title: hymn.title, author: hymn.author ?? '', section: hymn.section ?? '', lyrics: hymn.lyrics ?? '' });
  const save = async () => {
    const title = form.title.trim();
    if (!title) {
      setError('Give the hymn a title.');
      return;
    }
    setBusy(true);
    setError('');
    const next: Hymn = { number: hymn.number, title, author: form.author.trim(), section: form.section.trim(), lyrics: form.lyrics.trim() };
    try {
      await saveHymn(me.id, next);
      toast('Saved');
      onSaved(next);
    } catch (e) {
      toastError(e);
      setBusy(false);
    }
  };
  return (
    <Modal onClose={() => !busy && onClose()} title={`Edit hymn ${hymn.number}`} wide closeOutside={!busy} className="ch-hymn-edit">
      <div className="form-pad">
        <label className="form-row">
          Title
          <input value={form.title} onChange={set('title')} maxLength={160} />
        </label>
        <div className="form-2">
          <label className="form-row">
            Author
            <input value={form.author} onChange={set('author')} maxLength={160} />
          </label>
          <label className="form-row">
            Section
            <input value={form.section} onChange={set('section')} maxLength={80} />
          </label>
        </div>
        <label className="form-row">
          Lyrics (leave a blank line between verses)
          <textarea value={form.lyrics} onChange={set('lyrics')} maxLength={20000} rows={14} />
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        <div className="ch-dialog-actions">
          <button className="btn quiet" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn grow" onClick={save} disabled={busy || !changed}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
