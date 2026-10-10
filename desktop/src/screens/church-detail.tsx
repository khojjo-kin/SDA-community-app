// A church's page, from the iPhone app's church/[id].tsx: where it is and when it meets, "This is my
// church" (or leave it), its members on Community, and for admins: approve or turn down a church
// waiting for review, correct its details, or delete it.
import React, { useState } from 'react';
import { decideChurch, deleteChurch, fetchChurchMembers, updateChurch, updateProfile } from 'shared/api';
import { announce } from 'shared/store';
import { ago, errText, fmt } from 'shared/theme';
import type { Church } from 'shared/types';
import { t, tn, tSplit } from '../lib/i18n';
import { useMe } from '../lib/me';
import { nav } from '../lib/router';
import { ChoiceMenu, Icon, Link, Modal, Spinner, ask, toast, toastError, useLoad } from '../ui/kit';
import { profileOnce } from '../ui/post-data';
import { type ChurchForm, ChurchFields, cleanSite, mapsUrl, placeOf, siteOf } from './church-parts';
import { PersonRow } from './group-parts';
import '../styles/community.css';

/** "2 days ago", "just now": when a church was suggested, in the app's language. */
function agoWords(iso: string): string {
  const a = ago(iso);
  if (a === 'now') return t('d.community.justNow');
  const unit = ({ m: 'd.community.minutesAgo', h: 'd.community.hoursAgo', d: 'd.community.daysAgo', w: 'd.community.weeksAgo' } as Record<string, string>)[a.slice(-1)];
  return tn(unit, parseInt(a, 10));
}

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
  // "Suggested by <name> · 2 days ago", with the name drawn as a link.
  const suggested = tSplit('d.community.suggestedBy', 'username', { when: agoWords(c.created_at) });

  /** Join or leave: the church on my profile. The profile reloads so the button flips straight away. */
  async function setMembership(next: string | null) {
    setBusy(true);
    try {
      await updateProfile(me.id, { church_id: next });
      await refresh();
      members.reload();
      toast(next ? t('d.community.nowYourChurch') : t('d.community.leftChurch'));
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  }
  const join = async () => {
    if (await ask(t('d.community.makeYourChurch', { name: c.name }), t('d.community.makeYourChurchBody'), t('d.community.thisIsMyChurch'), false)) setMembership(c.id);
  };
  const leave = async () => {
    if (await ask(t('d.community.leaveChurchQuestion'), t('d.community.leaveChurchBody'), t('live.leave'))) setMembership(null);
  };

  /** Admins: approve a suggested church (it then lists for everyone) or turn it down. */
  async function decide(approve: boolean) {
    if (deciding) return;
    setDeciding(true);
    try {
      await decideChurch(me.id, c.id, approve);
      onChanged();
      toast(approve ? t('d.community.churchApproved') : t('d.community.churchNotApproved'));
    } catch (e) {
      toastError(e);
    } finally {
      setDeciding(false);
    }
  }
  const reject = async () => {
    if (await ask(t('d.community.rejectQuestion'), t('d.community.rejectBody'), t('d.community.reject'))) decide(false);
  };

  async function remove() {
    if (!(await ask(t('d.community.deleteChurchQuestion'), t('d.community.deleteChurchBody'), t('common.delete')))) return;
    try {
      await deleteChurch(c.id);
      announce('profile'); // members, maybe you, just lost their church
      toast(t('d.community.churchDeleted'));
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
            <b>{rejected ? t('d.community.notApprovedBanner') : t('d.community.waitingBanner')}</b>
            {admin && author.data ? (
              <span>
                {suggested[0]}
                <Link to={'/u/' + author.data.username}>{author.data.username}</Link>
                {suggested[1]}
              </span>
            ) : !admin && pending ? (
              <span>{t('d.community.pendingForYou')}</span>
            ) : null}
          </div>
          {admin ? (
            <div className="cm-banner-actions">
              <button className="btn small" disabled={deciding} onClick={() => decide(true)}>
                {rejected ? t('d.community.approveAfterAll') : t('adminPub.approve')}
              </button>
              {pending ? (
                <button className="btn small quiet" disabled={deciding} onClick={reject}>
                  {t('d.community.reject')}
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
          {mine ? <p className="cm-mine-text">{t('d.community.yourChurch')}</p> : null}
          <div className="cm-church-actions">
            {/* A church that was turned down can be left, but not newly chosen. */}
            {mine ? (
              <button className="btn quiet" disabled={busy} onClick={leave}>
                {t('d.community.leaveThisChurch')}
              </button>
            ) : rejected ? null : (
              <button className="btn" disabled={busy} onClick={join}>
                {t('d.community.thisIsMyChurch')}
              </button>
            )}
            <a className="btn quiet" href={mapsUrl(c)} target="_blank" rel="noreferrer">
              <Icon name="location" size={16} stroke={2} /> {t('d.community.directions')}
            </a>
            {site ? (
              <a className="btn quiet" href={site} target="_blank" rel="noreferrer">
                <Icon name="link" size={16} stroke={2} /> {t('d.community.website')}
              </a>
            ) : null}
          </div>
        </div>
        {admin ? (
          <button className="icon-btn cm-more" aria-label={t('profile.moreOptions')} onClick={() => setMenu(true)}>
            <Icon name="more" size={24} />
          </button>
        ) : null}
      </header>

      <h3 className="cm-h">{t('d.community.about')}</h3>
      <div className="cm-about">
        <div className="cm-about-row">
          <Icon name="clock" size={20} />
          <div>
            <b>{t('d.community.serviceTimes')}</b>
            <span>{times || t('d.community.notGiven')}</span>
          </div>
        </div>
        <div className="cm-about-row">
          <Icon name="location" size={20} />
          <div>
            <b>{t('d.community.address')}</b>
            <span>{place || t('d.community.noAddress')}</span>
          </div>
        </div>
        {site ? (
          <div className="cm-about-row">
            <Icon name="link" size={20} />
            <div>
              <b>{t('d.community.website')}</b>
              <a href={site} target="_blank" rel="noreferrer">
                {site.replace(/^https?:\/\//i, '').replace(/\/.*$/, '')}
              </a>
            </div>
          </div>
        ) : null}
      </div>

      <h3 className="cm-h">{t('d.community.churchMembersCount', { count: fmt(members.data?.length ?? 0) })}</h3>
      {members.loading && !members.data ? <Spinner /> : null}
      {members.data && !members.data.length ? <p className="muted-text">{t('d.community.noChurchMembers')}</p> : null}
      <div className="cm-people">
        {(members.data ?? []).map((p) => (
          <PersonRow key={p.id} p={p} right={p.id === me.id ? <span className="cm-you">{t('support.you')}</span> : null} />
        ))}
      </div>

      {menu ? (
        <ChoiceMenu
          onClose={() => setMenu(false)}
          items={[
            { label: t('d.community.editChurch'), onClick: () => setEditing(true) },
            { label: t('d.community.deleteChurch'), danger: true, onClick: remove },
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
            toast(t('d.community.churchUpdated'));
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
    if (!name) errs.name = t('d.community.needName');
    if (site === null) errs.website = t('d.community.badWebsite');
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
    <Modal title={t('d.community.editChurch')} onClose={onClose} wide className="cm-modal" closeOutside={!saving}>
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
          {saving ? t('d.community.saving') : t('ssPub.save')}
        </button>
      </form>
    </Modal>
  );
}
