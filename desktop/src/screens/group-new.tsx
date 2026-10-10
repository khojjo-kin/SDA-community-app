// Create a community or a page, from the iPhone app's group-new.tsx. The kind is chosen first (on a
// wide window both choices stay in view, so a wrong pick is one click to fix), then the cover, name,
// @handle (made from the name until typed by hand), description, who can join (communities only)
// and, optionally, the church it belongs to.
import React, { useState } from 'react';
import { createGroup, handleFrom, uploadImage } from 'shared/api';
import { errText } from 'shared/theme';
import { useMe } from '../lib/me';
import { nav } from '../lib/router';
import { Icon, type IconName } from '../ui/kit';
import { ChurchSelect, CoverPicker, HANDLE, type Picked, isTakenHandle } from './group-parts';
import '../styles/community.css';

type Kind = 'community' | 'page';
type Privacy = 'public' | 'private';
type Errors = { name?: string; handle?: string; form?: string };

const KINDS: { kind: Kind; icon: IconName; title: string; body: string }[] = [
  { kind: 'community', icon: 'users', title: 'Community', body: 'Anyone can join and post. A private community takes requests to join.' },
  { kind: 'page', icon: 'crown', title: 'Page', body: 'You and the admins you choose post. Everyone else follows.' },
];
const PRIVACY: { value: Privacy; icon: IconName; title: string; body: string }[] = [
  { value: 'public', icon: 'users', title: 'Public', body: 'Anyone can join and see what is posted.' },
  { value: 'private', icon: 'lock', title: 'Private', body: 'People ask to join, and an admin lets them in.' },
];

export function GroupNew() {
  const { me } = useMe();
  const [kind, setKind] = useState<Kind | null>(null);
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  // Once the handle has been typed in by hand, the name stops rewriting it.
  const [handleTouched, setHandleTouched] = useState(false);
  const [description, setDescription] = useState('');
  const [privacy, setPrivacy] = useState<Privacy>('public');
  const [cover, setCover] = useState<Picked | null>(null);
  const [churchId, setChurchId] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  function changeName(v: string) {
    setName(v);
    if (!handleTouched) setHandle(v.trim() ? handleFrom(v) : '');
  }
  function changeHandle(v: string) {
    setHandleTouched(true);
    setHandle(v.toLowerCase().replace(/\s+/g, ''));
  }

  async function save() {
    if (busy || !kind) return;
    const n = name.trim();
    const h = handle.trim().toLowerCase();
    const errs: Errors = {};
    if (n.length < 2 || n.length > 80) errs.name = 'Give it a name of 2 to 80 characters.';
    if (!HANDLE.test(h)) errs.handle = 'Handles use 3 to 30 lowercase letters, numbers, dots or underscores.';
    setErrors(errs);
    if (errs.name || errs.handle) return;
    setBusy(true);
    try {
      // The cover is uploaded only now, so backing out of the form leaves nothing behind in storage.
      const cover_url = cover ? (await uploadImage(me.id, cover.uri, cover.width)).url : '';
      const id = await createGroup({ kind, name: n, handle: h, description: description.trim(), privacy: kind === 'community' ? privacy : 'public', cover_url, church_id: churchId || null });
      // Replace the form in the history, so Back from the new group goes to the list.
      nav('/groups/' + id, true);
    } catch (e) {
      setErrors(isTakenHandle(e) ? { handle: 'That @handle is taken. Try another.' } : { form: errText(e) });
      setBusy(false);
    }
  }

  const page = kind === 'page';
  return (
    <div className="page narrow-page cm-new">
      <h1 className="page-title">{kind ? (page ? 'New page' : 'New community') : 'Create a community or page'}</h1>
      <div className="cm-kinds" role="radiogroup" aria-label="What to create">
        {KINDS.map((k) => (
          <button key={k.kind} type="button" role="radio" aria-checked={kind === k.kind} className={'cm-kind' + (kind === k.kind ? ' on' : '')} onClick={() => setKind(k.kind)} disabled={busy}>
            <span className="cm-kind-icon">
              <Icon name={k.icon} size={28} />
            </span>
            <span className="cm-kind-text">
              <b>{k.title}</b>
              <span>{k.body}</span>
            </span>
          </button>
        ))}
      </div>

      {kind ? (
        <form
          className="cm-form"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <CoverPicker shown={cover?.uri ?? ''} busy={busy} onPick={setCover} onRemove={() => setCover(null)} />
          <label className="form-row">
            <span>Name</span>
            <input value={name} onChange={(e) => changeName(e.target.value)} placeholder={page ? 'e.g. Ebenezer Youth Choir' : 'e.g. Young Adults Bible Study'} maxLength={80} autoFocus />
            {errors.name ? <span className="form-error">{errors.name}</span> : null}
          </label>
          <label className="form-row">
            <span>Handle</span>
            <span className="cm-handle-input">
              <i>@</i>
              <input value={handle} onChange={(e) => changeHandle(e.target.value)} placeholder="handle" maxLength={30} autoCapitalize="none" autoCorrect="off" spellCheck={false} aria-label="Handle" />
            </span>
            <span className={errors.handle ? 'form-error' : 'cm-hint'}>{errors.handle ?? 'How people find it: letters, numbers, dots and underscores.'}</span>
          </label>
          <label className="form-row">
            <span>Description</span>
            <textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is it for, and who is it for?" maxLength={500} />
            <em className="cm-count">{description.length}/500</em>
          </label>
          {page ? null : (
            <div className="form-row">
              <span>Who can join</span>
              <div className="cm-choices" role="radiogroup" aria-label="Who can join">
                {PRIVACY.map((p) => (
                  <button key={p.value} type="button" role="radio" aria-checked={privacy === p.value} className={'cm-choice' + (privacy === p.value ? ' on' : '')} onClick={() => setPrivacy(p.value)}>
                    <Icon name={p.icon} size={22} />
                    <span className="cm-choice-text">
                      <b>{p.title}</b>
                      <span>{p.body}</span>
                    </span>
                    <i className="cm-radio" aria-hidden="true" />
                  </button>
                ))}
              </div>
            </div>
          )}
          <ChurchSelect value={churchId} onChange={(id) => setChurchId(id)} disabled={busy} />
          {errors.form ? <p className="form-error">{errors.form}</p> : null}
          <div className="cm-form-foot">
            <button className="btn big" type="submit" disabled={busy}>
              {busy ? 'Creating…' : page ? 'Create page' : 'Create community'}
            </button>
            <button type="button" className="btn big quiet" disabled={busy} onClick={() => nav('/groups')}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
