// A church's page, from the iPhone app's church/[id].tsx: where it is and when it meets, "This is my
// church" (or leave it), its members on Community, and for admins: approve or turn down a church
// waiting for review, correct its details, or delete it.
import React, { useState } from 'react';
import { decideChurch, deleteChurch, fetchChurchMembers, updateChurch, updateProfile } from 'shared/api';
import { announce } from 'shared/store';
import { agoLong, errText, fmt } from 'shared/theme';
import type { Church } from 'shared/types';
import { useMe } from '../lib/me';
import { nav } from '../lib/router';
import { ChoiceMenu, Icon, Link, Modal, Spinner, ask, toast, toastError, useLoad } from '../ui/kit';
import { profileOnce } from '../ui/post-data';
import { type ChurchForm, ChurchFields, cleanSite, mapsUrl, placeOf, siteOf } from './church-parts';
import { PersonRow } from './group-parts';
import '../styles/community.css';

export function ChurchDetail({ c, onChanged }: { c: Church; onChanged: () => void }) {
  const { me, refresh } = useMe();
  const members = useLoad(() => fetchChurchMembers(c.id), [c.id]);
  // Who suggested it, for admins deciding on a church waiting for review.
  const author = useLoad(() => (c.created_by && c.status !== 'approved' ? profileOnce(c.created_by) : Promise.resolve(null)), [c.created_by, c.status]);
  const [busy, setBusy] = useState(false);
  const [deciding, setDeciding] = useState(false);
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);

  const mine = me.church_id === c.id;
  const admin = !!me.admin_role;
  const pending = c.status === 'pending';
  const rejected = c.status === 'rejected';
  const place = placeOf(c);
  const site = siteOf(c);
  const times = (c.service_times ?? '').trim();

  /** Join or leave: the church on my profile. The profile reloads so the button flips straight away. */
  async function setMembership(next: string | null) {
    setBusy(true);
    try {
      await updateProfile(me.id, { church_id: next });
      await refresh();
      members.reload();
      toast(next ? 'This is your church now' : 'You have left this church');
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  }
  const join = async () => {
    if (await ask(`Make ${c.name} your church?`, 'It shows on your profile, and you appear in its members list.', 'This is my church', false)) setMembership(c.id);
  };
  const leave = async () => {
    if (await ask('Leave this church?', 'It comes off your profile. You can choose a church again any time.', 'Leave')) setMembership(null);
  };

  /** Admins: approve a suggested church (it then lists for everyone) or turn it down. */
  async function decide(approve: boolean) {
    if (deciding) return;
    setDeciding(true);
    try {
      await decideChurch(me.id, c.id, approve);
      onChanged();
      toast(approve ? 'Church approved' : 'Church not approved');
    } catch (e) {
      toastError(e);
    } finally {
      setDeciding(false);
    }
  }
  const reject = async () => {
    if (await ask('Turn this church down?', "It won't be listed for anyone. The member who suggested it sees it marked Not approved.", 'Reject')) decide(false);
  };

  async function remove() {
    if (!(await ask('Delete this church?', "It disappears from the list and from every member's profile. This cannot be undone.", 'Delete'))) return;
    try {
      await deleteChurch(c.id);
      announce('profile'); // members, maybe you, just lost their church
      toast('Church deleted');
      onChanged();
      nav('/churches', true);
    } catch (e) {
      toastError(e);
    }
  }

  return (
    <article className="church cm-church">
      {pending || rejected ? (
        <div className={'cm-banner ' + c.status} role="status">
          <Icon name={rejected ? 'info' : 'clock'} size={20} stroke={2} />
          <div className="cm-banner-text">
            <b>{rejected ? 'An admin did not approve this church' : 'Waiting for an admin to approve this church'}</b>
            {admin && author.data ? (
              <span>
                Suggested by <Link to={'/u/' + author.data.username}>{author.data.username}</Link> · {agoLong(c.created_at).toLowerCase()}
              </span>
            ) : !admin && pending ? (
              <span>It shows for you meanwhile. Everyone else sees it once it is approved.</span>
            ) : null}
          </div>
          {admin ? (
            <div className="cm-banner-actions">
              <button className="btn small" disabled={deciding} onClick={() => decide(true)}>
                {rejected ? 'Approve after all' : 'Approve'}
              </button>
              {pending ? (
                <button className="btn small quiet" disabled={deciding} onClick={reject}>
                  Reject
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <header className="cm-church-head">
        {/* A solid green disc with a white mark, as on the iPhone: a listed church reads as the real thing. */}
        <span className="cm-church-disc" aria-hidden="true">
          <Icon name="church" size={44} stroke={2} />
        </span>
        <div className="cm-church-title">
          <h1>{c.name}</h1>
          {place ? <p className="muted-text">{place}</p> : null}
          {mine ? <p className="cm-mine-text">Your church</p> : null}
          <div className="cm-church-actions">
            {/* A church that was turned down can be left, but not newly chosen. */}
            {mine ? (
              <button className="btn quiet" disabled={busy} onClick={leave}>
                Leave this church
              </button>
            ) : rejected ? null : (
              <button className="btn" disabled={busy} onClick={join}>
                This is my church
              </button>
            )}
            <a className="btn quiet" href={mapsUrl(c)} target="_blank" rel="noreferrer">
              <Icon name="location" size={16} stroke={2} /> Directions
            </a>
            {site ? (
              <a className="btn quiet" href={site} target="_blank" rel="noreferrer">
                <Icon name="link" size={16} stroke={2} /> Website
              </a>
            ) : null}
          </div>
        </div>
        {admin ? (
          <button className="icon-btn cm-more" aria-label="More options" onClick={() => setMenu(true)}>
            <Icon name="more" size={24} />
          </button>
        ) : null}
      </header>

      <h3 className="cm-h">About</h3>
      <div className="cm-about">
        <div className="cm-about-row">
          <Icon name="clock" size={20} />
          <div>
            <b>Service times</b>
            <span>{times || 'Not given yet'}</span>
          </div>
        </div>
        <div className="cm-about-row">
          <Icon name="location" size={20} />
          <div>
            <b>Address</b>
            <span>{place || 'No address yet'}</span>
          </div>
        </div>
        {site ? (
          <div className="cm-about-row">
            <Icon name="link" size={20} />
            <div>
              <b>Website</b>
              <a href={site} target="_blank" rel="noreferrer">
                {site.replace(/^https?:\/\//i, '').replace(/\/.*$/, '')}
              </a>
            </div>
          </div>
        ) : null}
      </div>

      <h3 className="cm-h">{`Members · ${fmt(members.data?.length ?? 0)}`}</h3>
      {members.loading && !members.data ? <Spinner /> : null}
      {members.data && !members.data.length ? <p className="muted-text">Nobody has chosen this church yet.</p> : null}
      <div className="cm-people">
        {(members.data ?? []).map((p) => (
          <PersonRow key={p.id} p={p} right={p.id === me.id ? <span className="cm-you">You</span> : null} />
        ))}
      </div>

      {menu ? (
        <ChoiceMenu
          onClose={() => setMenu(false)}
          items={[
            { label: 'Edit church', onClick: () => setEditing(true) },
            { label: 'Delete church', danger: true, onClick: remove },
          ]}
        />
      ) : null}
      {editing ? (
        <ChurchEdit
          c={c}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            onChanged();
            toast('Church updated');
            if (mine) announce('profile'); // the church's name on my profile comes from this row
          }}
        />
      ) : null}
    </article>
  );
}

/** Admins: correct a church's name, address, times and website. The map pin is kept. */
function ChurchEdit({ c, onClose, onSaved }: { c: Church; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<ChurchForm>({ name: c.name, address: c.address, city: c.city, country: c.country, service_times: c.service_times, website: c.website });
  const [errors, setErrors] = useState<{ name?: string; website?: string; form?: string }>({});
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<ChurchForm>) => setForm((f) => ({ ...f, ...patch }));

  async function save() {
    if (saving) return;
    const name = form.name.trim();
    const site = cleanSite(form.website);
    const errs: typeof errors = {};
    if (!name) errs.name = "Add the church's name.";
    if (site === null) errs.website = 'That website address does not look right.';
    setErrors(errs);
    if (errs.name || errs.website) return;
    setSaving(true);
    try {
      await updateChurch(c.id, { name, address: form.address.trim(), city: form.city.trim(), country: form.country.trim(), service_times: form.service_times.trim(), website: site ?? '' });
      onSaved();
    } catch (e) {
      setErrors({ form: errText(e) });
      setSaving(false);
    }
  }

  return (
    <Modal title="Edit church" onClose={onClose} wide className="cm-modal" closeOutside={!saving}>
      <form
        className="cm-modal-body cm-form"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <ChurchFields form={form} set={set} errors={errors} />
        {errors.form ? <p className="form-error">{errors.form}</p> : null}
        <button className="btn big block" type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </form>
    </Modal>
  );
}
