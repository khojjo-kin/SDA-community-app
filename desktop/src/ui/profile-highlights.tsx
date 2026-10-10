// Highlights on a profile: the row of circles (with "New" on your own, which goes to the archive where
// highlights are made), each opening in the story viewer. On your own, right-click a highlight or use
// its "…" to edit it: rename it, choose its cover from its stories (or, with Plus, upload one), take
// stories out, or delete it. The iPhone's HighlightsRow.tsx and highlight-edit/[id].tsx are the reference.
import React, { useEffect, useState } from 'react';
import { coverOf, deleteHighlight, fetchHighlight, fetchHighlights, removeHighlightItem, renameHighlight, setHighlightCover, uploadImage } from 'shared/api';
import { listen } from 'shared/store';
import { ringColors } from 'shared/styling';
import { dayLabel } from 'shared/theme';
import type { Highlight, HighlightItem, Profile, StoryGroup } from 'shared/types';
import { useMe } from '../lib/me';
import { nav } from '../lib/router';
import { rememberSize } from '../shims/expo-file-system';
import { Icon, Modal, Spinner, ask, toast, toastError } from './kit';
import { ringVar } from './profile-style';
import { StoryCanvas, StoryViewer } from './stories';
import '../styles/profile.css';

/** New for a day after it is made, until this window has opened it (kept for this run only). */
const FRESH_MS = 24 * 3600e3;
const opened = new Set<string>();

/** A highlight's items as one story group for the viewer. */
function asGroup(person: Profile, items: HighlightItem[]): StoryGroup {
  return {
    user_id: person.id,
    username: person.username,
    avatar_url: person.avatar_url,
    seen: true,
    close: false,
    stories: items.map((it) => ({
      id: it.id, user_id: person.id, item: it.item, created_at: it.created_at, expires_at: it.created_at, username: person.username, full_name: person.full_name,
      avatar_url: person.avatar_url, seen: true, in_tray: false, view_count: 0, audience: 'everyone', story_replies: 'off', follows_viewer: false, author_plus: false, verified: person.verified,
    })),
  };
}

/** A round cover: the picture, or a plain circle when there is none. */
function Cover({ url, size = 77 }: { url: string; size?: number }) {
  return url ? <img className="prof-hl-cover" src={url} alt="" style={{ width: size, height: size }} /> : <span className="prof-hl-cover blank" style={{ width: size, height: size }} />;
}

/** The row of highlights. Hidden on someone else's profile when they have none. */
export function Highlights({ person, mine }: { person: Profile; mine: boolean }) {
  const [list, setList] = useState<Highlight[] | null>(null);
  const [viewing, setViewing] = useState<StoryGroup[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [, redraw] = useState(0);

  const load = () => {
    fetchHighlights(person.id).then(setList, () => setList([]));
  };
  useEffect(load, [person.id]);
  useEffect(() => listen('profile', load), [person.id]);

  if (list === null) return <div className="highlights prof-hl-row placeholder" />;
  if (!mine && !list.length) return null;

  const open = async (h: Highlight) => {
    opened.add(h.id);
    redraw((n) => n + 1);
    try {
      const got = await fetchHighlight(h.id);
      if (!got || !got.items.length) return toast('This highlight is empty.');
      setViewing([asGroup(person, got.items)]);
    } catch (e) {
      toastError(e);
    }
  };

  // A Plus member's chosen ring goes round every highlight; otherwise only new ones get the green.
  const now = Date.now();
  const chosen = person.ring_color ? ringColors(person.ring_color) : null;
  return (
    <>
      <div className="highlights prof-hl-row" role="list" aria-label="Highlights">
        {list.map((h) => {
          const fresh = !opened.has(h.id) && now - new Date(h.created_at).getTime() < FRESH_MS;
          const colors = chosen ?? (fresh ? ringColors('') : null);
          return (
            <div key={h.id} className="prof-hl" role="listitem">
              <button
                className="highlight"
                onClick={() => open(h)}
                onContextMenu={
                  mine
                    ? (e) => {
                        e.preventDefault();
                        setEditing(h.id);
                      }
                    : undefined
                }
                aria-label={'Highlight: ' + h.title + (fresh ? ', new' : '')}
              >
                <span className={'prof-hl-ring' + (colors ? ' on' : '')} style={ringVar(colors)}>
                  <Cover url={h.cover_url} />
                </span>
                <span className="prof-hl-title">{h.title}</span>
              </button>
              {mine ? (
                <button className="prof-hl-more" aria-label={'Edit ' + h.title} title="Edit highlight" onClick={() => setEditing(h.id)}>
                  <Icon name="more" size={16} />
                </button>
              ) : null}
            </div>
          );
        })}
        {mine ? (
          <div className="prof-hl" role="listitem">
            <button className="highlight" onClick={() => nav('/archive')} aria-label="New highlight">
              <span className="prof-hl-ring new">
                <Icon name="plus" size={40} stroke={1.2} />
              </span>
              <span className="prof-hl-title">New</span>
            </button>
          </div>
        ) : null}
      </div>
      {viewing ? <StoryViewer groups={viewing} start={0} onClose={() => setViewing(null)} /> : null}
      {editing ? <HighlightEditor id={editing} ringColor={person.ring_color} onClose={() => setEditing(null)} /> : null}
    </>
  );
}

/* ---------- editing one of your highlights ---------- */

/**
 * Nothing is saved until Save, so a slip can be undone by closing. Stories taken out stay in the grid,
 * faded, so they can be put back first. A cover from a story being taken out goes with it.
 */
export function HighlightEditor({ id, ringColor, onClose }: { id: string; ringColor: string; onClose: () => void }) {
  const { me } = useMe();
  const [data, setData] = useState<{ highlight: Highlight; items: HighlightItem[] } | null | 'missing'>(null);
  const [title, setTitle] = useState('');
  const [cover, setCover] = useState<string | null>(null);
  const [removed, setRemoved] = useState<string[]>([]);
  const [panel, setPanel] = useState<'cover' | 'plus' | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchHighlight(id).then(
      (res) => {
        setData(res ?? 'missing');
        if (res) setTitle(res.highlight.title);
      },
      (e) => {
        toastError(e);
        onClose();
      },
    );
  }, [id]);

  if (data === null) {
    return (
      <Modal title="Edit highlight" onClose={onClose} className="prof-hl-edit">
        <Spinner />
      </Modal>
    );
  }
  if (data === 'missing' || data.highlight.user_id !== me.id) {
    return (
      <Modal title="Edit highlight" onClose={onClose} className="prof-hl-edit">
        <p className="muted-text center pad">This highlight isn't available. It may have been deleted.</p>
      </Modal>
    );
  }

  const { highlight, items } = data;
  const kept = items.filter((i) => !removed.includes(i.id));
  const removedCovers = items.filter((i) => removed.includes(i.id)).map((i) => coverOf(i.item));
  let preview = cover ?? highlight.cover_url;
  if (preview && removedCovers.includes(preview) && !kept.some((i) => coverOf(i.item) === preview)) preview = kept.map((i) => coverOf(i.item)).find(Boolean) ?? '';
  const name = title.trim();
  const dirty = name !== highlight.title || preview !== highlight.cover_url || removed.length > 0;
  const choices = [...new Set(kept.map((i) => coverOf(i.item)).filter(Boolean))];
  const ring = ringColors(ringColor);

  const close = async () => {
    if (saving) return;
    if (dirty && !(await ask('Discard your changes?', 'Your highlight stays as it was.', 'Discard'))) return;
    onClose();
  };

  const remove = async () => {
    if (!(await ask('Delete this highlight?', 'It comes off your profile. Your archive keeps the stories.', 'Delete'))) return;
    setSaving(true);
    try {
      await deleteHighlight(highlight.id);
      toast('Highlight deleted');
      onClose();
    } catch (e) {
      toastError(e);
      setSaving(false);
    }
  };

  const save = async () => {
    if (saving || uploading) return;
    if (!name) return toast('Give the highlight a name.');
    if (!dirty) return onClose();
    if (!kept.length) {
      if (!(await ask('Remove every story?', 'A highlight needs at least one story, so this one will be deleted. Your archive keeps the stories.', 'Delete highlight'))) return;
      setSaving(true);
      try {
        await deleteHighlight(highlight.id);
        toast('Highlight deleted');
        onClose();
      } catch (e) {
        toastError(e);
        setSaving(false);
      }
      return;
    }
    setSaving(true);
    const done: string[] = [];
    let saved = highlight;
    try {
      for (const rid of removed) {
        await removeHighlightItem(rid);
        done.push(rid);
      }
      if (preview !== saved.cover_url) {
        await setHighlightCover(saved.id, preview);
        saved = { ...saved, cover_url: preview };
      }
      if (name !== saved.title) {
        await renameHighlight(saved.id, name);
        saved = { ...saved, title: name };
      }
      toast('Highlight saved');
      onClose();
    } catch (e) {
      toastError(e);
      // Keep what went through and leave the rest waiting, so Save can simply be pressed again.
      setData({ highlight: saved, items: items.filter((i) => !done.includes(i.id)) });
      setRemoved((cur) => cur.filter((x) => !done.includes(x)));
      setCover(preview === saved.cover_url ? null : preview);
      setSaving(false);
    }
  };

  // Your own photo as a cover is a Community Plus perk; everyone can use a picture from the highlight.
  const upload = async (file: File) => {
    const url = URL.createObjectURL(file);
    rememberSize(url, file.size);
    setUploading(true);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const m = await uploadImage(me.id, url, img.naturalWidth, 600);
      setCover(m.url);
      setPanel(null);
    } catch (e) {
      toastError(e);
    } finally {
      setUploading(false);
    }
  };

  return (
    <Modal title="Edit highlight" onClose={close} wide className="prof-hl-edit" closeOutside={false}>
      <div className="prof-hl-edit-body">
        <div className="prof-hl-edit-top">
          <button className="prof-hl-ring on big" style={ringVar(ring)} onClick={() => setPanel(panel === 'cover' ? null : 'cover')} aria-label="Edit cover">
            <Cover url={preview} size={88} />
            {uploading ? (
              <span className="prof-hl-busy">
                <Spinner size={22} />
              </span>
            ) : null}
          </button>
          <button className="link-btn" onClick={() => setPanel(panel === 'cover' ? null : 'cover')}>
            {uploading ? 'Uploading…' : 'Edit cover'}
          </button>
        </div>
        {panel === 'cover' ? (
          <div className="prof-cover-panel">
            <span className="muted-text small">From this highlight</span>
            {choices.length ? (
              <div className="prof-cover-choices" role="radiogroup" aria-label="Cover">
                {choices.map((url) => {
                  const on = url === preview;
                  return (
                    <button key={url} role="radio" aria-checked={on} aria-label={on ? 'The cover now' : 'Use this picture as the cover'} className={'prof-cover-choice' + (on ? ' on' : '')} onClick={() => setCover(url)}>
                      <img src={url} alt="" />
                      {on ? (
                        <span className="prof-cover-tick">
                          <Icon name="check" size={12} stroke={3} />
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="muted-text small">The stories here have no pictures to use.</p>
            )}
            {me.plus ? (
              <label className={'prof-upload' + (uploading ? ' busy' : '')}>
                <Icon name="image" size={20} />
                <span className="grow">
                  <b>Upload a photo</b>
                  <span className="muted-text small block">Choose any photo from this computer</span>
                </span>
                <input type="file" accept="image/*" hidden disabled={uploading} aria-label="Upload a cover photo" onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) upload(f);
                }} />
              </label>
            ) : (
              <button className="prof-upload" onClick={() => setPanel('plus')}>
                <Icon name="image" size={20} />
                <span className="grow">
                  <b>Upload a photo</b>
                  <span className="muted-text small block">Any photo from this computer, with Community Plus</span>
                </span>
                <span className="prof-plus-tag">Plus</span>
              </button>
            )}
          </div>
        ) : null}
        {panel === 'plus' ? (
          <div className="prof-upsell">
            <Icon name="crown" size={24} />
            <div className="grow">
              <b>Your own cover photo</b>
              <p className="muted-text">Uploading any photo as a highlight cover is part of Community Plus. You can always use a picture from the highlight itself.</p>
            </div>
            <button
              className="btn"
              onClick={() => {
                onClose();
                nav('/plus');
              }}
            >
              See Community Plus
            </button>
          </div>
        ) : null}
        <label className="form-row">
          <span>Title</span>
          <input value={title} maxLength={30} onChange={(e) => setTitle(e.target.value)} placeholder="Highlight name" aria-label="Highlight title" />
          <em className="prof-count">{title.length}/30</em>
        </label>
        <div className="prof-hl-edit-h">
          <b>Stories</b>
          <span className="muted-text">{kept.length === 1 ? '1 story' : kept.length + ' stories'}</span>
        </div>
        <div className="prof-hl-stories">
          {items.map((it) => {
            const out = removed.includes(it.id);
            const isCover = !out && !!preview && coverOf(it.item) === preview;
            const day = dayLabel(new Date(it.created_at));
            return (
              <div key={it.id} className={'prof-hl-story' + (out ? ' out' : '')}>
                <StoryCanvas item={{ ...it.item, caption: undefined }} width={108} height={192} paused muted />
                <span className="prof-hl-day">{day}</span>
                {isCover ? <span className="prof-hl-badge">Cover</span> : null}
                <button className={'prof-hl-toggle' + (out ? ' back' : '')} aria-label={out ? `Put back the story from ${day}` : `Remove the story from ${day}`} onClick={() => setRemoved((cur) => (cur.includes(it.id) ? cur.filter((x) => x !== it.id) : [...cur, it.id]))}>
                  <Icon name={out ? 'plus' : 'close'} size={12} stroke={3} />
                </button>
              </div>
            );
          })}
        </div>
        <p className="muted-text small">
          To add more, open your{' '}
          <button
            className="link-btn inline"
            onClick={() => {
              onClose();
              nav('/archive');
            }}
          >
            archive
          </button>{' '}
          and make a highlight from its stories.
        </p>
      </div>
      <div className="modal-foot prof-hl-edit-foot">
        <button className="btn danger-outline" onClick={remove} disabled={saving}>
          Delete highlight
        </button>
        <span className="grow" />
        <button className="btn quiet" onClick={close} disabled={saving}>
          Cancel
        </button>
        <button className="btn" onClick={save} disabled={saving || uploading}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </Modal>
  );
}
