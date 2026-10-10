// The console's Churches section: churches members suggested wait here for an admin (as on the
// iPhone's admin-churches), and every church can be corrected or deleted. It uses the iPhone app's
// own church functions, so it works on the database as it is.
import React, { useState } from 'react';
import { decideChurch, deleteChurch, fetchChurches, fetchPendingChurches, updateChurch } from 'shared/api';
import { agoLong } from 'shared/theme';
import type { Church } from 'shared/types';
import { refreshAdminCounts } from '../lib/admin';
import { useMe } from '../lib/me';
import { nav } from '../lib/router';
import { Avatar, Empty, Failed, Icon, type IconName, Modal, Spinner, ask, toast, toastError, useLoad } from '../ui/kit';

type Pending = Awaited<ReturnType<typeof fetchPendingChurches>>[number];
type Status = Church['status'];

/** "example.org" was allowed when the church was added, so give it a scheme before opening. */
const siteOf = (raw: string) => (raw.trim() ? (/^https?:\/\//i.test(raw.trim()) ? raw.trim() : 'https://' + raw.trim()) : '');
const placeOf = (c: Church) => [c.address, c.city, c.country].map((s) => (s ?? '').trim()).filter(Boolean).join(', ');

function Detail({ icon, text, href }: { icon: IconName; text: string; href?: string }) {
  return (
    <span className="adm-detail">
      <Icon name={icon} size={16} />
      {href ? (
        <a href={href} target="_blank" rel="noreferrer noopener" className="adm-link">
          {text}
        </a>
      ) : (
        <span>{text}</span>
      )}
    </span>
  );
}

export function Churches() {
  const { me } = useMe();
  const [status, setStatus] = useState<Status>('pending');
  // Waiting ones come with who suggested them; the rest are the directory as admins see it.
  const pending = useLoad(() => fetchPendingChurches(), []);
  const all = useLoad(() => fetchChurches(), []);
  const [busy, setBusy] = useState('');
  const [editing, setEditing] = useState<Church | null>(null);

  const listed = (s: Status) => (all.data ?? []).filter((c) => (c.status ?? 'approved') === s);
  const counts: Record<Status, number> = { pending: pending.data?.length ?? 0, approved: listed('approved').length, rejected: listed('rejected').length };
  const reload = () => {
    pending.reload();
    all.reload();
    refreshAdminCounts();
  };

  async function decide(c: Church, approve: boolean) {
    if (busy) return;
    setBusy(c.id);
    try {
      await decideChurch(me.id, c.id, approve);
      toast(approve ? `${c.name} is now listed` : 'Church not approved');
      // Off the waiting list at once; the counts catch up with the reload.
      if (pending.data) pending.set(pending.data.filter((x) => x.id !== c.id));
      reload();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy('');
    }
  }

  async function reject(c: Church) {
    if (await ask(`Turn down ${c.name}?`, "It won't be listed for anyone. The member who suggested it sees it marked Not approved.", 'Reject')) decide(c, false);
  }

  async function remove(c: Church) {
    if (!(await ask(`Delete ${c.name}?`, 'It disappears from the directory, and members who chose it lose it from their profile. This cannot be undone.', 'Delete'))) return;
    try {
      await deleteChurch(c.id);
      toast('Church deleted');
      if (pending.data) pending.set(pending.data.filter((x) => x.id !== c.id));
      if (all.data) all.set(all.data.filter((x) => x.id !== c.id));
      refreshAdminCounts();
    } catch (e) {
      toastError(e);
    }
  }

  const loading = status === 'pending' ? pending : all;
  const rows: (Church | Pending)[] = status === 'pending' ? pending.data ?? [] : listed(status);

  return (
    <div className="admin-wide">
      <div className="dash-head">
        <div>
          <h1 className="page-title">Churches</h1>
          <p className="muted-text small">Approve churches members suggest, and keep every church's details right.</p>
        </div>
        <div className="seg left tight adm-tabs" role="tablist">
          {(
            [
              ['pending', 'To review'],
              ['approved', 'Listed'],
              ['rejected', 'Turned down'],
            ] as [Status, string][]
          ).map(([s, label]) => (
            <button key={s} role="tab" aria-selected={status === s} className={status === s ? 'on' : ''} onClick={() => setStatus(s)}>
              {label}
              <span className={'adm-count' + (s === 'pending' && counts.pending ? '' : ' quiet')}>{counts[s]}</span>
            </button>
          ))}
        </div>
      </div>
      {status === 'pending' && rows.length ? (
        <p className="muted-text adm-intro">Members suggested these. Check each is a real church and the details look right; you can correct them before or after approving.</p>
      ) : null}
      {loading.loading && !loading.data ? (
        <Spinner />
      ) : loading.error ? (
        <Failed error={loading.error} retry={reload} />
      ) : !rows.length ? (
        status === 'pending' ? (
          <Empty icon="church" title="No churches waiting" body="When a member adds a church, it appears here for an admin to approve." />
        ) : (
          <Empty icon="church" title="Nothing here" />
        )
      ) : null}
      {rows.map((c) => {
        const site = siteOf(c.website ?? '');
        const who = 'submitted_by' in c ? c.submitted_by : undefined;
        return (
          <section key={c.id} className={'dash-card adm-church' + (status === 'pending' ? ' report' : '')} data-church={c.id}>
            <span className="hymn-no">
              <Icon name="church" size={20} />
            </span>
            <div className="grow adm-church-main">
              <button className="adm-church-name" onClick={() => nav('/churches/' + c.id)} title="Open the church's page">
                {c.name}
              </button>
              <p className="muted-text small">
                {status === 'pending' ? 'Suggested ' + agoLong(c.created_at).toLowerCase() : status === 'rejected' ? 'Turned down' : 'Listed'}
              </p>
              <div className="adm-details">
                <Detail icon="location" text={placeOf(c) || 'No address given'} />
                <Detail icon="clock" text={(c.service_times ?? '').trim() || 'No service times given'} />
                {site ? <Detail icon="link" text={site.replace(/^https?:\/\//i, '')} href={site} /> : <Detail icon="link" text="No website given" />}
              </div>
              {who !== undefined ? (
                <button className="adm-suggested" disabled={!who} onClick={() => who && nav('/admin/people/' + who.id)}>
                  <Avatar src={who?.avatar_url} name={who?.full_name || who?.username || '?'} size={28} />
                  <span className="adm-suggested-text">
                    <em>Suggested by</em>
                    <b>{who ? `${who.full_name || who.username} · @${who.username}` : 'A deleted account'}</b>
                  </span>
                </button>
              ) : null}
            </div>
            <div className="btn-col">
              {status !== 'approved' ? (
                <button className="btn small" disabled={!!busy && busy !== c.id} onClick={() => decide(c, true)}>
                  Approve
                </button>
              ) : null}
              {status === 'pending' ? (
                <button className="btn quiet small" disabled={!!busy} onClick={() => reject(c)}>
                  Reject
                </button>
              ) : null}
              <button className="btn quiet small" onClick={() => setEditing(c)}>
                Edit
              </button>
              <button className="btn danger-outline small" onClick={() => remove(c)}>
                Delete
              </button>
            </div>
          </section>
        );
      })}
      {editing ? (
        <EditChurch
          church={editing}
          onClose={() => setEditing(null)}
          onSaved={(patch) => {
            const fix = <T extends Church>(list: T[] | undefined) => (list ?? []).map((x) => (x.id === editing.id ? { ...x, ...patch } : x));
            if (pending.data) pending.set(fix(pending.data));
            if (all.data) all.set(fix(all.data));
            setEditing(null);
          }}
        />
      ) : null}
    </div>
  );
}

type Fields = { name: string; address: string; city: string; country: string; website: string; service_times: string };

/** Correct a church's details. Only the fields shown change; its place on the map stays as it was. */
function EditChurch({ church, onClose, onSaved }: { church: Church; onClose: () => void; onSaved: (patch: Fields) => void }) {
  const [f, setF] = useState<Fields>({ name: church.name, address: church.address ?? '', city: church.city ?? '', country: church.country ?? '', website: church.website ?? '', service_times: church.service_times ?? '' });
  const [saving, setSaving] = useState(false);
  const field = (k: keyof Fields, label: string, max: number, placeholder = '') => (
    <label className="form-row">
      <span>{label}</span>
      <input value={f[k]} maxLength={max} placeholder={placeholder} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
    </label>
  );
  async function save() {
    const patch: Fields = { name: f.name.trim(), address: f.address.trim(), city: f.city.trim(), country: f.country.trim(), website: f.website.trim(), service_times: f.service_times.trim() };
    if (!patch.name) return toast('A church needs a name');
    setSaving(true);
    try {
      await updateChurch(church.id, patch);
      toast('Church updated');
      onSaved(patch);
    } catch (e) {
      toastError(e);
      setSaving(false);
    }
  }
  return (
    <Modal title="Edit church" onClose={onClose} wide>
      <div className="form-pad adm-form">
        {field('name', 'Name', 120)}
        {field('address', 'Address', 200)}
        <div className="form-2">
          {field('city', 'Town or city', 80)}
          {field('country', 'Country', 80)}
        </div>
        {field('website', 'Website', 200, 'example.org')}
        <label className="form-row">
          <span>Service times</span>
          <textarea rows={3} maxLength={300} value={f.service_times} placeholder="Sabbath School 9:30 · Divine Service 11:00" onChange={(e) => setF({ ...f, service_times: e.target.value })} />
        </label>
        <div className="btn-row left">
          <button className="btn" disabled={saving || !f.name.trim()} onClick={save}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button className="btn quiet" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
}
