// Settings pages about your profile and creator tools: Edit profile, Professional account, Creator
// tools and controls (saved replies and frequently asked questions) and Profile viewers.
import React, { useState } from 'react';
import { deleteFaq, deleteSavedReply, fetchChurches, fetchFaqs, fetchProfileViewers, fetchSavedReplies, saveFaq, saveReply, updateProfile, uploadImage, withTimeout } from 'shared/api';
import { ago } from 'shared/theme';
import { t, tSplit, tn } from '../lib/i18n';
import { useMe } from '../lib/me';
import { rememberSize } from '../shims/expo-file-system';
import { Avatar, Failed, Icon, Link, Modal, Spinner, ask, toast, toastError, useLoad } from '../ui/kit';
import { Block, Card, LinkRow, Notice, Page, PersonRow, PlusUpsell, RadioRow, Toggle } from './settings-ui';

declare const __DEMO__: boolean;

/* ---------- Edit profile ---------- */

// What is saved is the English; the key beside each is what the member reads.
const GENDERS: [string, string][] = [
  ['Female', 'd.settings.genderFemale'],
  ['Male', 'd.settings.genderMale'],
  ['Custom', 'd.settings.genderCustom'],
  ['Prefer not to say', 'd.settings.genderNone'],
];
const BIO_MAX = 500;

export function EditProfile() {
  const { me, refresh } = useMe();
  const start = () => ({
    full_name: me.full_name ?? '',
    username: me.username ?? '',
    website: me.website ?? '',
    bio: me.bio ?? '',
    pronouns: me.pronouns ?? '',
    gender: me.gender ?? '',
    category: me.category ?? '',
    church_id: me.church_id ?? '',
    contact_email: me.contact_email ?? '',
    contact_phone: me.contact_phone ?? '',
  });
  const [form, setForm] = useState(start);
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [err, setErr] = useState('');
  const churches = useLoad(() => fetchChurches(), []);
  const creator = me.account_type === 'creator';
  const set = (k: keyof ReturnType<typeof start>) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setErr('');
    setForm({ ...form, [k]: k === 'username' ? e.target.value.toLowerCase().replace(/\s/g, '') : e.target.value });
  };
  const usernameOk = /^[a-z0-9_]{3,30}$/.test(form.username);
  const changed = JSON.stringify(form) !== JSON.stringify(start());
  const categoryLine = tSplit('d.settings.categoryCreator', 'link');

  async function changePhoto(f: File) {
    const url = URL.createObjectURL(f);
    rememberSize(url, f.size);
    setPhotoBusy(true);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const m = await uploadImage(me.id, url, img.naturalWidth, 480);
      await updateProfile(me.id, { avatar_url: m.url });
      await refresh();
      toast(t('d.settings.photoUpdated'));
    } catch (e) {
      toastError(e);
    } finally {
      setPhotoBusy(false);
    }
  }

  async function save() {
    if (busy) return;
    const u = form.username.trim().toLowerCase();
    if (!form.full_name.trim()) return setErr(t('d.settings.addName'));
    if (!/^[a-z0-9_]{3,30}$/.test(u)) return setErr(t('d.settings.usernameRule'));
    if (form.contact_email.trim() && !/^\S+@\S+\.\S+$/.test(form.contact_email.trim())) return setErr(t('d.settings.contactEmailWrong'));
    setBusy(true);
    try {
      await updateProfile(me.id, {
        full_name: form.full_name.trim().slice(0, 80),
        username: u,
        website: form.website.trim().slice(0, 500),
        bio: form.bio.trim().slice(0, BIO_MAX),
        pronouns: form.pronouns.trim().slice(0, 40),
        gender: form.gender.slice(0, 40),
        ...(creator ? { category: form.category.trim().slice(0, 40) } : {}),
        church_id: form.church_id || null,
        contact_email: form.contact_email.trim().slice(0, 200),
        contact_phone: form.contact_phone.trim().slice(0, 40),
      });
      // People can log in with their username, which Clerk checks, so Clerk is told of a new one (as
      // on the iPhone). If Clerk won't take it, logging in simply carries on with email.
      let note = '';
      const clerkUser = window.Clerk?.user;
      if (!__DEMO__ && clerkUser?.update && clerkUser.username !== u) {
        try {
          await withTimeout(clerkUser.update({ username: u }), 10000);
        } catch {
          if (u !== me.username) note = t('d.settings.usernameLoginOff');
        }
      }
      await refresh();
      toast(note || t('d.settings.profileSaved'));
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page title={t('profile.editProfile')}>
      <div className="st-profile-card">
        <Avatar src={me.avatar_url} name={me.username} size={56} />
        <span className="st-row-text">
          <b>{me.username}</b>
          <span>{me.full_name}</span>
        </span>
        {me.avatar_url ? (
          <button className="link-btn danger" disabled={photoBusy} onClick={() => updateProfile(me.id, { avatar_url: '' }).then(refresh, toastError)}>
            {t('live.remove')}
          </button>
        ) : null}
        <label className={'btn' + (photoBusy ? ' disabled' : '')}>
          {photoBusy ? t('create.uploading') : t('d.settings.changePhoto')}
          <input
            type="file"
            accept="image/*"
            hidden
            disabled={photoBusy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) changePhoto(f);
            }}
          />
        </label>
      </div>

      <div className="st-form">
        <label className="form-row st-field">
          <span>{t('d.settings.name')}</span>
          <input value={form.full_name} onChange={set('full_name')} maxLength={80} placeholder={t('d.settings.name')} />
        </label>
        <label className="form-row st-field">
          <span>{t('d.settings.username')}</span>
          <input value={form.username} onChange={set('username')} maxLength={30} placeholder={t('d.settings.username')} />
          {!usernameOk ? <em className="field-error">{t('d.settings.usernameRule')}</em> : null}
        </label>
        <label className="form-row st-field">
          <span>{t('d.settings.website')}</span>
          <input value={form.website} onChange={set('website')} maxLength={500} placeholder={t('d.settings.website')} inputMode="url" />
        </label>
        <label className="form-row st-field">
          <span>{t('d.settings.bio')}</span>
          <textarea value={form.bio} onChange={set('bio')} maxLength={BIO_MAX} rows={3} placeholder={t('d.settings.bio')} />
          <em className="count">
            {form.bio.length} / {BIO_MAX}
          </em>
        </label>
        <label className="form-row st-field">
          <span>{t('d.settings.gender')}</span>
          <select className="st-select" value={form.gender} onChange={set('gender')}>
            <option value="">{t('d.settings.notSet')}</option>
            {GENDERS.map(([g, key]) => (
              <option key={g} value={g}>
                {t(key)}
              </option>
            ))}
          </select>
          <em className="st-hint">{t('d.settings.genderPrivate')}</em>
        </label>
        <label className="form-row st-field">
          <span>{t('d.settings.pronouns')}</span>
          <input value={form.pronouns} onChange={set('pronouns')} maxLength={40} placeholder={t('d.settings.pronouns')} />
        </label>
        {creator ? (
          <label className="form-row st-field">
            <span>{t('d.settings.category')}</span>
            <input value={form.category} onChange={set('category')} maxLength={40} placeholder={t('d.settings.categoryExample')} />
            <em className="st-hint">{t('d.settings.categoryNote')}</em>
          </label>
        ) : (
          <div className="form-row st-field">
            <span>{t('d.settings.category')}</span>
            <p className="st-hint">
              {categoryLine[0]}
              <Link to="/accounts/professional" className="link-btn inline">
                {t('d.settings.creatorAccountLink')}
              </Link>
              {categoryLine[1]}
            </p>
          </div>
        )}
        <label className="form-row st-field">
          <span>{t('d.settings.church')}</span>
          <select className="st-select" value={form.church_id} onChange={set('church_id')}>
            <option value="">{t('d.settings.noChurch')}</option>
            {(churches.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <em className="st-hint">{t('d.settings.churchNote')}</em>
        </label>
        <div className="form-row st-field">
          <span>{t('d.settings.contactOptions')}</span>
          <div className="st-two">
            <input value={form.contact_email} onChange={set('contact_email')} maxLength={200} placeholder={t('profile.email')} aria-label={t('d.settings.contactEmail')} inputMode="email" />
            <input value={form.contact_phone} onChange={set('contact_phone')} maxLength={40} placeholder={t('d.settings.phone')} aria-label={t('d.settings.contactPhone')} inputMode="tel" />
          </div>
          <em className="st-hint">{t('d.settings.contactNote')}</em>
        </div>
        {err ? <p className="field-error">{err}</p> : null}
        <div className="st-submit">
          <button className="btn big" disabled={!changed || !usernameOk || busy} onClick={save}>
            {busy ? t('d.settings.saving') : t('d.settings.submit')}
          </button>
        </div>
      </div>
    </Page>
  );
}

/* ---------- Professional account ---------- */

// Keys of the suggested categories. The one picked is put on the profile in the words shown, as if typed.
const CATEGORIES = ['feed.topic.choir', 'd.settings.catMusician', 'd.settings.catPastor', 'd.settings.catBibleTeacher', 'd.settings.church', 'd.settings.catMinistry', 'd.settings.catYouthLeader', 'feed.topic.health', 'd.settings.catPhotographer', 'd.settings.catWriter', 'd.settings.catVideoCreator', 'd.settings.catEducation', 'd.settings.catFood', 'create.community', 'd.settings.catPersonalBlog'];

export function Professional() {
  const { me, refresh } = useMe();
  const [type, setType] = useState<'personal' | 'creator'>(me.account_type ?? 'personal');
  const [category, setCategory] = useState(me.category ?? '');
  const [busy, setBusy] = useState(false);
  const changed = type !== me.account_type || (type === 'creator' && category.trim() !== (me.category ?? ''));
  async function save() {
    setBusy(true);
    try {
      await updateProfile(me.id, { account_type: type, category: type === 'creator' ? category.trim().slice(0, 40) : '' });
      await refresh();
      toast(type === 'creator' ? t('d.settings.nowCreator') : t('d.settings.nowPersonal'));
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Page title={t('d.settings.professional')} intro={t('d.settings.professionalIntro')}>
      <Block title={t('d.settings.accountType')}>
        <Card>
          <RadioRow name="account-type" icon="user" title={t('d.settings.personal')} sub={t('d.settings.personalSub')} checked={type === 'personal'} onChange={() => setType('personal')} />
          <RadioRow name="account-type" icon="chart" title={t('d.settings.creator')} sub={t('d.settings.creatorSub')} checked={type === 'creator'} onChange={() => setType('creator')} />
        </Card>
      </Block>
      {type === 'creator' ? (
        <Block title={t('d.settings.category')} note={t('d.settings.categoryNote')}>
          <div className="st-chips">
            {CATEGORIES.map((key) => {
              const c = t(key);
              const on = category.trim().toLowerCase() === c.toLowerCase();
              return (
                <button key={key} className={'st-chip' + (on ? ' on' : '')} aria-pressed={on} onClick={() => setCategory(on ? '' : c)}>
                  {c}
                </button>
              );
            })}
          </div>
          <input className="st-input st-gap-top" value={category} maxLength={40} placeholder={t('d.settings.ownCategory')} aria-label={t('d.settings.category')} onChange={(e) => setCategory(e.target.value)} />
        </Block>
      ) : null}
      <div className="st-submit">
        <button className="btn big" disabled={!changed || busy} onClick={save}>
          {busy ? t('d.settings.saving') : type === 'creator' ? t('d.settings.useCreator') : t('d.settings.usePersonal')}
        </button>
      </div>
      {me.account_type === 'creator' ? (
        <Block title={t('d.settings.yourTools')}>
          <Card>
            <LinkRow icon="chart" title={t('d.settings.dashboard')} sub={t('d.settings.dashboardSub')} to="/dashboard" />
            <LinkRow icon="reply" title={t('settings.creatorTools')} sub={t('d.settings.creatorToolsSub')} to="/accounts/creator" />
          </Card>
        </Block>
      ) : null}
    </Page>
  );
}

/* ---------- Creator tools: saved replies and frequently asked questions ---------- */

export function SavedReplies() {
  const { me } = useMe();
  const list = useLoad(() => fetchSavedReplies(me.id), []);
  const [edit, setEdit] = useState<{ id?: string; shortcut: string; body: string } | null>(null);
  return (
    <Block
      title={t('d.settings.savedReplies')}
      note={t('d.settings.savedRepliesNote')}
      action={
        <button className="btn quiet small" onClick={() => setEdit({ shortcut: '', body: '' })}>
          {t('d.settings.newReply')}
        </button>
      }
    >
      {list.loading ? <Spinner /> : list.error ? <Failed error={list.error} retry={list.reload} /> : !list.data?.length ? <p className="st-empty-line">{t('d.settings.noReplies')}</p> : null}
      {list.data?.length ? (
        <Card>
          {list.data.map((r) => (
            <div key={r.id} className="st-row">
              <span className="st-row-text wrap">
                <b>/{r.shortcut}</b>
                <span>{r.body}</span>
              </span>
              <button className="btn quiet small" onClick={() => setEdit(r)}>
                {t('liveSchedule.edit')}
              </button>
              <button
                className="icon-btn"
                aria-label={t('d.settings.deleteShortcut', { shortcut: r.shortcut })}
                onClick={async () => {
                  if (await ask(t('d.settings.deleteReplyQ'), '/' + r.shortcut, t('common.delete'))) deleteSavedReply(r.id).then(list.reload, toastError);
                }}
              >
                <Icon name="trash" size={18} />
              </button>
            </div>
          ))}
        </Card>
      ) : null}
      {edit ? (
        <Modal title={edit.id ? t('d.settings.editReply') : t('d.settings.newReply')} onClose={() => setEdit(null)} wide>
          <div className="form-pad">
            <label className="form-row">
              <span>{t('d.settings.shortcut')}</span>
              <input value={edit.shortcut} maxLength={30} onChange={(e) => setEdit({ ...edit, shortcut: e.target.value.replace(/[^\w]/g, '') })} placeholder={t('d.settings.shortcutExample')} />
            </label>
            <label className="form-row">
              <span>{t('d.settings.message')}</span>
              <textarea rows={4} value={edit.body} maxLength={1000} onChange={(e) => setEdit({ ...edit, body: e.target.value })} />
            </label>
            <button
              className="btn block big"
              disabled={!edit.shortcut.trim() || !edit.body.trim()}
              onClick={() =>
                saveReply(me.id, edit).then(() => {
                  setEdit(null);
                  list.reload();
                }, toastError)
              }
            >
              {t('ssPub.save')}
            </button>
          </div>
        </Modal>
      ) : null}
    </Block>
  );
}

function Faqs() {
  const { me, refresh } = useMe();
  const faqs = useLoad(() => fetchFaqs(me.id), []);
  const [edit, setEdit] = useState<{ id?: string; question: string; answer: string } | null>(null);
  return (
    <Block
      title={t('d.settings.faqs')}
      note={t('d.settings.faqsNote')}
      action={
        (faqs.data?.length ?? 0) < 8 ? (
          <button className="btn quiet small" onClick={() => setEdit({ question: '', answer: '' })}>
            {t('d.settings.addQuestion')}
          </button>
        ) : null
      }
    >
      <Card>
        <div className="st-row">
          <span className="st-row-text">
            <b>{t('d.settings.showFaqs')}</b>
            <span>{t('d.settings.showFaqsSub')}</span>
          </span>
          <Toggle label={t('d.settings.showFaqs')} on={me.faq_enabled} onChange={(v) => updateProfile(me.id, { faq_enabled: v }).then(refresh, toastError)} />
        </div>
        {(faqs.data ?? []).map((f) => (
          <div key={f.id} className="st-row">
            <span className="st-row-text wrap">
              <b>{f.question}</b>
              <span>{f.answer}</span>
            </span>
            <button className="btn quiet small" onClick={() => setEdit(f)}>
              {t('liveSchedule.edit')}
            </button>
            <button className="icon-btn" aria-label={t('d.settings.deleteQuestion', { question: f.question })} onClick={() => deleteFaq(f.id).then(faqs.reload, toastError)}>
              <Icon name="trash" size={18} />
            </button>
          </div>
        ))}
      </Card>
      {edit ? (
        <Modal title={edit.id ? t('d.settings.editQuestion') : t('d.settings.newQuestion')} onClose={() => setEdit(null)} wide>
          <div className="form-pad">
            <label className="form-row">
              <span>{t('d.settings.question')}</span>
              <input value={edit.question} maxLength={120} onChange={(e) => setEdit({ ...edit, question: e.target.value })} placeholder={t('d.settings.questionExample')} />
            </label>
            <label className="form-row">
              <span>{t('d.settings.answer')}</span>
              <textarea rows={4} value={edit.answer} maxLength={1000} onChange={(e) => setEdit({ ...edit, answer: e.target.value })} />
            </label>
            <button
              className="btn block big"
              disabled={!edit.question.trim() || !edit.answer.trim()}
              onClick={() =>
                saveFaq(me.id, { ...edit, position: edit.id ? undefined : faqs.data?.length ?? 0 }).then(() => {
                  setEdit(null);
                  faqs.reload();
                }, toastError)
              }
            >
              {t('ssPub.save')}
            </button>
          </div>
        </Modal>
      ) : null}
    </Block>
  );
}

export function CreatorTools() {
  const { me } = useMe();
  if (me.account_type !== 'creator') {
    return (
      <Page title={t('settings.creatorTools')}>
        <Notice icon="chart">
          {t('d.settings.creatorToolsNeed')}{' '}
          <Link to="/accounts/professional" className="link-btn inline">
            {t('d.settings.switchType')}
          </Link>
        </Notice>
        <SavedReplies />
      </Page>
    );
  }
  return (
    <Page title={t('settings.creatorTools')}>
      <SavedReplies />
      <Faqs />
      <Block title={t('d.settings.moreForCreators')}>
        <Card>
          <LinkRow icon="chart" title={t('d.settings.dashboard')} to="/dashboard" />
          <LinkRow icon="eye" title={t('d.settings.viewCountsOnProfile')} value={me.show_view_counts ? t('d.settings.on') : t('settings.repliesOff')} to="/accounts/counts" />
          <LinkRow icon="crown" title={t('d.settings.creatorSubs')} value={me.sub_price_pence ? t('d.settings.on') : t('settings.repliesOff')} to="/accounts/subscriptions" />
        </Card>
      </Block>
    </Page>
  );
}

/* ---------- Profile viewers (Community Plus) ---------- */

export function ProfileViewers() {
  const { me } = useMe();
  const list = useLoad(() => (me.plus ? fetchProfileViewers(me.id) : Promise.resolve([])), [me.plus]);
  return (
    <Page title={t('settings.profileViewers')} intro={me.views_week ? tn('d.settings.viewersWeek', me.views_week) : t('d.settings.viewersNone')}>
      {!me.plus ? (
        <PlusUpsell title={t('plus.allViewers')} body={t('d.settings.viewersUpsell')} />
      ) : list.loading ? (
        <Spinner />
      ) : list.error ? (
        <Failed error={list.error} retry={list.reload} />
      ) : !list.data?.length ? (
        <p className="st-empty-line">{t('d.settings.viewersEmpty')}</p>
      ) : (
        <Card>
          {list.data.map((v) => (
            <PersonRow key={v.viewer_id} p={v} sub={v.full_name + ' · ' + ago(v.viewed_at)} />
          ))}
        </Card>
      )}
    </Page>
  );
}

