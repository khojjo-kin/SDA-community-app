// Settings pages about your profile and creator tools: Edit profile, Professional account, Creator
// tools and controls (saved replies and frequently asked questions) and Profile viewers.
import React, { useState } from 'react';
import { deleteFaq, deleteSavedReply, fetchChurches, fetchFaqs, fetchProfileViewers, fetchSavedReplies, saveFaq, saveReply, updateProfile, uploadImage, withTimeout } from 'shared/api';
import { ago } from 'shared/theme';
import { useMe } from '../lib/me';
import { rememberSize } from '../shims/expo-file-system';
import { Avatar, Failed, Icon, Link, Modal, Spinner, ask, toast, toastError, useLoad } from '../ui/kit';
import { Block, Card, LinkRow, Notice, Page, PersonRow, PlusUpsell, RadioRow, Toggle } from './settings-ui';

declare const __DEMO__: boolean;

/* ---------- Edit profile ---------- */

const GENDERS = ['Female', 'Male', 'Custom', 'Prefer not to say'];
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
      toast('Profile photo updated');
    } catch (e) {
      toastError(e);
    } finally {
      setPhotoBusy(false);
    }
  }

  async function save() {
    if (busy) return;
    const u = form.username.trim().toLowerCase();
    if (!form.full_name.trim()) return setErr('Add your name.');
    if (!/^[a-z0-9_]{3,30}$/.test(u)) return setErr('Usernames use 3 to 30 lowercase letters, numbers or underscores.');
    if (form.contact_email.trim() && !/^\S+@\S+\.\S+$/.test(form.contact_email.trim())) return setErr('That contact email does not look right.');
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
          if (u !== me.username) note = "Saved. Logging in with this username isn't available, use your email.";
        }
      }
      await refresh();
      toast(note || 'Profile saved');
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page title="Edit profile">
      <div className="st-profile-card">
        <Avatar src={me.avatar_url} name={me.username} size={56} />
        <span className="st-row-text">
          <b>{me.username}</b>
          <span>{me.full_name}</span>
        </span>
        {me.avatar_url ? (
          <button className="link-btn danger" disabled={photoBusy} onClick={() => updateProfile(me.id, { avatar_url: '' }).then(refresh, toastError)}>
            Remove
          </button>
        ) : null}
        <label className={'btn' + (photoBusy ? ' disabled' : '')}>
          {photoBusy ? 'Uploading…' : 'Change photo'}
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
          <span>Name</span>
          <input value={form.full_name} onChange={set('full_name')} maxLength={80} placeholder="Name" />
        </label>
        <label className="form-row st-field">
          <span>Username</span>
          <input value={form.username} onChange={set('username')} maxLength={30} placeholder="Username" />
          {!usernameOk ? <em className="field-error">Usernames use 3 to 30 lowercase letters, numbers or underscores.</em> : null}
        </label>
        <label className="form-row st-field">
          <span>Website</span>
          <input value={form.website} onChange={set('website')} maxLength={500} placeholder="Website" inputMode="url" />
        </label>
        <label className="form-row st-field">
          <span>Bio</span>
          <textarea value={form.bio} onChange={set('bio')} maxLength={BIO_MAX} rows={3} placeholder="Bio" />
          <em className="count">
            {form.bio.length} / {BIO_MAX}
          </em>
        </label>
        <label className="form-row st-field">
          <span>Gender</span>
          <select className="st-select" value={form.gender} onChange={set('gender')}>
            <option value="">Not set</option>
            {GENDERS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
          <em className="st-hint">This won't be part of your public profile.</em>
        </label>
        <label className="form-row st-field">
          <span>Pronouns</span>
          <input value={form.pronouns} onChange={set('pronouns')} maxLength={40} placeholder="Pronouns" />
        </label>
        {creator ? (
          <label className="form-row st-field">
            <span>Category</span>
            <input value={form.category} onChange={set('category')} maxLength={40} placeholder="Musician, Pastor, Choir…" />
            <em className="st-hint">Shown on your profile under your name.</em>
          </label>
        ) : (
          <div className="form-row st-field">
            <span>Category</span>
            <p className="st-hint">
              Show a category such as Choir or Pastor with a <Link to="/accounts/professional" className="link-btn inline">creator account</Link>.
            </p>
          </div>
        )}
        <label className="form-row st-field">
          <span>Church</span>
          <select className="st-select" value={form.church_id} onChange={set('church_id')}>
            <option value="">No church chosen</option>
            {(churches.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <em className="st-hint">Your home church shows on your profile, and you appear in its member list.</em>
        </label>
        <div className="form-row st-field">
          <span>Contact options</span>
          <div className="st-two">
            <input value={form.contact_email} onChange={set('contact_email')} maxLength={200} placeholder="Email" aria-label="Contact email" inputMode="email" />
            <input value={form.contact_phone} onChange={set('contact_phone')} maxLength={40} placeholder="Phone" aria-label="Contact phone" inputMode="tel" />
          </div>
          <em className="st-hint">Shown on your profile as buttons, so people can reach you. Leave empty to hide.</em>
        </div>
        {err ? <p className="field-error">{err}</p> : null}
        <div className="st-submit">
          <button className="btn big" disabled={!changed || !usernameOk || busy} onClick={save}>
            {busy ? 'Saving…' : 'Submit'}
          </button>
        </div>
      </div>
    </Page>
  );
}

/* ---------- Professional account ---------- */

const CATEGORIES = ['Choir', 'Musician', 'Pastor', 'Bible teacher', 'Church', 'Ministry', 'Youth leader', 'Health', 'Photographer', 'Writer', 'Video creator', 'Education', 'Food', 'Community', 'Personal blog'];

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
      toast(type === 'creator' ? 'You have a creator account' : 'You have a personal account');
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Page title="Professional account" intro="A creator account shows a category on your profile and gives you the dashboard, saved replies and frequently asked questions in messages.">
      <Block title="Account type">
        <Card>
          <RadioRow name="account-type" icon="user" title="Personal" sub="For sharing with friends and your church family." checked={type === 'personal'} onChange={() => setType('personal')} />
          <RadioRow name="account-type" icon="chart" title="Creator" sub="For choirs, pastors, ministries and anyone sharing with a wider audience." checked={type === 'creator'} onChange={() => setType('creator')} />
        </Card>
      </Block>
      {type === 'creator' ? (
        <Block title="Category" note="Shown on your profile under your name.">
          <div className="st-chips">
            {CATEGORIES.map((c) => {
              const on = category.trim().toLowerCase() === c.toLowerCase();
              return (
                <button key={c} className={'st-chip' + (on ? ' on' : '')} aria-pressed={on} onClick={() => setCategory(on ? '' : c)}>
                  {c}
                </button>
              );
            })}
          </div>
          <input className="st-input st-gap-top" value={category} maxLength={40} placeholder="Or type your own" aria-label="Category" onChange={(e) => setCategory(e.target.value)} />
        </Block>
      ) : null}
      <div className="st-submit">
        <button className="btn big" disabled={!changed || busy} onClick={save}>
          {busy ? 'Saving…' : type === 'creator' ? 'Use a creator account' : 'Use a personal account'}
        </button>
      </div>
      {me.account_type === 'creator' ? (
        <Block title="Your tools">
          <Card>
            <LinkRow icon="chart" title="Professional dashboard" sub="Views, followers and your best posts." to="/dashboard" />
            <LinkRow icon="reply" title="Creator tools and controls" sub="Saved replies and frequently asked questions." to="/accounts/creator" />
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
      title="Saved replies"
      note="Answers you send often. In a chat, type / and the shortcut, or press the saved replies button."
      action={
        <button className="btn quiet small" onClick={() => setEdit({ shortcut: '', body: '' })}>
          New saved reply
        </button>
      }
    >
      {list.loading ? <Spinner /> : list.error ? <Failed error={list.error} retry={list.reload} /> : !list.data?.length ? <p className="st-empty-line">No saved replies yet.</p> : null}
      {list.data?.length ? (
        <Card>
          {list.data.map((r) => (
            <div key={r.id} className="st-row">
              <span className="st-row-text wrap">
                <b>/{r.shortcut}</b>
                <span>{r.body}</span>
              </span>
              <button className="btn quiet small" onClick={() => setEdit(r)}>
                Edit
              </button>
              <button
                className="icon-btn"
                aria-label={'Delete /' + r.shortcut}
                onClick={async () => {
                  if (await ask('Delete this saved reply?', '/' + r.shortcut, 'Delete')) deleteSavedReply(r.id).then(list.reload, toastError);
                }}
              >
                <Icon name="trash" size={18} />
              </button>
            </div>
          ))}
        </Card>
      ) : null}
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
              className="btn block big"
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
    </Block>
  );
}

function Faqs() {
  const { me, refresh } = useMe();
  const faqs = useLoad(() => fetchFaqs(me.id), []);
  const [edit, setEdit] = useState<{ id?: string; question: string; answer: string } | null>(null);
  return (
    <Block
      title="Frequently asked questions"
      note="Up to 8 questions people can tap when they message you. Your answer is sent straight away."
      action={
        (faqs.data?.length ?? 0) < 8 ? (
          <button className="btn quiet small" onClick={() => setEdit({ question: '', answer: '' })}>
            Add a question
          </button>
        ) : null
      }
    >
      <Card>
        <div className="st-row">
          <span className="st-row-text">
            <b>Show questions in messages</b>
            <span>People see your questions when they start a chat with you.</span>
          </span>
          <Toggle label="Show questions in messages" on={me.faq_enabled} onChange={(v) => updateProfile(me.id, { faq_enabled: v }).then(refresh, toastError)} />
        </div>
        {(faqs.data ?? []).map((f) => (
          <div key={f.id} className="st-row">
            <span className="st-row-text wrap">
              <b>{f.question}</b>
              <span>{f.answer}</span>
            </span>
            <button className="btn quiet small" onClick={() => setEdit(f)}>
              Edit
            </button>
            <button className="icon-btn" aria-label={'Delete ' + f.question} onClick={() => deleteFaq(f.id).then(faqs.reload, toastError)}>
              <Icon name="trash" size={18} />
            </button>
          </div>
        ))}
      </Card>
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
              className="btn block big"
              disabled={!edit.question.trim() || !edit.answer.trim()}
              onClick={() =>
                saveFaq(me.id, { ...edit, position: edit.id ? undefined : faqs.data?.length ?? 0 }).then(() => {
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
    </Block>
  );
}

export function CreatorTools() {
  const { me } = useMe();
  if (me.account_type !== 'creator') {
    return (
      <Page title="Creator tools and controls">
        <Notice icon="chart">
          Creator tools come with a creator account: saved replies, frequently asked questions in messages and the professional dashboard.{' '}
          <Link to="/accounts/professional" className="link-btn inline">
            Switch account type
          </Link>
        </Notice>
        <SavedReplies />
      </Page>
    );
  }
  return (
    <Page title="Creator tools and controls">
      <SavedReplies />
      <Faqs />
      <Block title="More for creators">
        <Card>
          <LinkRow icon="chart" title="Professional dashboard" to="/dashboard" />
          <LinkRow icon="eye" title="View counts on your profile" value={me.show_view_counts ? 'On' : 'Off'} to="/accounts/counts" />
          <LinkRow icon="crown" title="Creator subscriptions" value={me.sub_price_pence ? 'On' : 'Off'} to="/accounts/subscriptions" />
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
    <Page title="Profile viewers" intro={me.views_week ? `${me.views_week} ${me.views_week === 1 ? 'person' : 'people'} looked at your profile in the last 7 days.` : 'Nobody has looked at your profile in the last 7 days.'}>
      {!me.plus ? (
        <PlusUpsell title="See who viewed your profile" body="Community Plus shows you who looked at your profile in the last 7 days, with Erha without limits, read receipts off and more." />
      ) : list.loading ? (
        <Spinner />
      ) : list.error ? (
        <Failed error={list.error} retry={list.reload} />
      ) : !list.data?.length ? (
        <p className="st-empty-line">No one yet. People who look at your profile show here for 7 days.</p>
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

