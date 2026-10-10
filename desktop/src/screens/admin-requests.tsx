// Decisions waiting for an admin, as on the iPhone console: identity checks for the blue tick (with
// the member's ID photo and selfie), Plus arranged through a church, and who may publish in
// Sabbath School. Everything goes through the iPhone app's own functions (src/lib/api.ts).
import React, { useEffect, useState } from 'react';
import { decidePlusRequest, decidePublisher, fetchPlusRequests, fetchPublishers, verificationFileUrl } from 'shared/api';
import { agoLong } from 'shared/theme';
import type { PlusRequest, Publisher } from 'shared/types';
import { refreshAdminCounts } from '../lib/admin';
import { useMe } from '../lib/me';
import { nav } from '../lib/router';
import { Avatar, Empty, Failed, Icon, Modal, Spinner, Verified, ask, toast, toastError, useLoad } from '../ui/kit';

type Kind = PlusRequest['kind'];

const DOC_LABEL: Record<string, string> = {
  passport: 'Passport',
  driving_licence: 'Driving licence',
  national_id: 'National ID card',
  other: 'Other document',
  '': 'Not given',
};

/** How the member asked: the free notable-account application, or verification with Plus. */
const PATH_LABEL: Record<string, string> = {
  notable: 'Notable account application',
  plus: 'Verified with Community Plus',
  '': 'Identity check',
};

/** A link a member gave, as an address that opens in the browser. Anything that isn't a web address is shown, not opened. */
function webAddress(link: string): string | null {
  const t = link.trim();
  if (!t || /\s/.test(t)) return null;
  if (/^https?:\/\//i.test(t)) return t;
  if (/^[a-z][a-z0-9+.-]*:/i.test(t)) return null;
  return 'https://' + t;
}

/** The small "ID card" mark for identity checks (not in the icon set). */
function IdCardIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <circle cx="9" cy="11" r="2" />
      <path d="M6 16c.6-1.5 1.7-2.2 3-2.2s2.4.7 3 2.2M15 10h3M15 13.5h3" />
    </svg>
  );
}

/** The blue tick badge, with its check drawn in (the shared icon's check needs a second colour). */
function TickIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 1.4 14.87 3.16 18.23 3.42 19.52 6.53 22.08 8.72 21.3 12 22.08 15.28 19.52 17.47 18.23 20.58 14.87 20.84 12 22.6 9.13 20.84 5.77 20.58 4.48 17.47 1.92 15.28 2.7 12 1.92 8.72 4.48 6.53 5.77 3.42 9.13 3.16Z" fill="currentColor" />
      <path d="m7.6 12.4 2.9 2.9 5.9-6.2" fill="none" strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round" style={{ stroke: 'var(--on-accent)' }} />
    </svg>
  );
}

/** Who sent something: their picture, name and how long ago. Clicking opens what `to` points at. */
function Who({ name, username, avatar, verified, when, to }: { name: string; username?: string | null; avatar?: string | null; verified?: boolean; when: string; to?: string }) {
  return (
    <button type="button" className="adm-who" onClick={to ? () => nav(to) : undefined} disabled={!to} aria-label={to ? `Open ${name}` : name}>
      <Avatar src={avatar} name={name} size={44} />
      <span className="adm-who-text">
        <b>
          {name}
          {verified ? <Verified size={13} /> : null}
        </b>
        <em>{[username ? '@' + username : '', when].filter(Boolean).join(' · ')}</em>
      </span>
    </button>
  );
}

/**
 * One identity photo. They sit in a private bucket, so each is opened with a short-lived signed
 * address fetched here; clicking a loaded photo shows it full size.
 */
function PrivatePhoto({ path, label, onOpen }: { path: string; label: string; onOpen: (url: string, label: string) => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!path) return;
    let live = true;
    setFailed(false);
    setUrl(null);
    verificationFileUrl(path).then(
      (u) => live && setUrl(u),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [path, attempt]);

  const open = url && !failed ? () => onOpen(url, label) : failed ? () => setAttempt((a) => a + 1) : undefined;
  return (
    <figure className="adm-photo">
      <figcaption>{label}</figcaption>
      <button
        type="button"
        className={'adm-photo-box' + (url && !failed ? ' ready' : '')}
        onClick={open}
        aria-label={!path ? `${label}: no photo` : failed ? `${label} did not load. Try again` : `${label}. Open full size`}
      >
        {!path ? (
          <span className="muted-text small">No photo</span>
        ) : failed ? (
          <span className="adm-photo-retry">
            <Icon name="repeat" size={20} />
            Didn't load. Click to try again
          </span>
        ) : url ? (
          <img src={url} alt={label} onError={() => setFailed(true)} />
        ) : (
          <Spinner size={22} />
        )}
      </button>
    </figure>
  );
}

/** One answer from the notability step: a small label over what the member wrote. */
function Answer({ label, value }: { label: string; value: string }) {
  return (
    <div className="adm-answer">
      <dt>{label}</dt>
      <dd className={value ? '' : 'none'}>{value || 'Not given'}</dd>
    </div>
  );
}

/* ------------------------------------------------------------------ tick and Plus requests */

/** Identity checks for the blue tick, and Plus that a church has arranged: approve or decline. */
export function Requests({ kind }: { kind: Kind }) {
  const { me } = useMe();
  // Both kinds load together so each tab can show how many are waiting.
  const list = useLoad(() => fetchPlusRequests(), []);
  const [busy, setBusy] = useState('');
  const [viewer, setViewer] = useState<{ url: string; label: string } | null>(null);

  async function decide(r: PlusRequest, approve: boolean) {
    if (busy) return;
    setBusy(r.id);
    try {
      await decidePlusRequest(me.id, r, approve);
      toast(approve ? (r.kind === 'verify' ? 'Verified' : 'Plus activated for a month') : 'Declined');
      list.set((list.data ?? []).filter((x) => x.id !== r.id));
      refreshAdminCounts();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy('');
    }
  }

  const all = list.data ?? [];
  const shown = all.filter((r) => r.kind === kind);
  const waiting = (k: Kind) => all.filter((r) => r.kind === k).length;
  const open = (url: string, label: string) => setViewer({ url, label });

  function verifyBody(r: PlusRequest) {
    // Requests sent before photos were required cannot be checked; the member has to start again.
    const incomplete = !r.selfie_path || !r.document_path;
    const links = (r.links ?? []).filter((l) => l.trim());
    const path = r.path ?? '';
    return (
      <>
        <div className="adm-req-info">
          <span className={'adm-path' + (path === 'plus' ? ' plus' : '')}>
            {path === 'plus' ? <Icon name="crown" size={14} /> : path === 'notable' ? <Icon name="star" size={14} /> : <IdCardIcon />}
            {PATH_LABEL[path] ?? PATH_LABEL['']}
          </span>
          <dl className="adm-facts">
            <Answer label="Name on document" value={r.legal_name} />
            <Answer label="Document" value={r.document_type ? DOC_LABEL[r.document_type] ?? '' : ''} />
          </dl>
          {incomplete ? (
            <p className="adm-warn">Sent before photos were needed, so it can't be checked. Decline it; the member can then verify with photos.</p>
          ) : (
            <p className="muted-text small">Check that the face matches and the name on the document matches the account. Both photos are deleted once you decide.</p>
          )}
          {path === 'notable' ? (
            // The notability answers: what admins weigh when deciding whether the account is widely known.
            <div className="adm-answers">
              <b>Is this account widely known?</b>
              <dl>
                <Answer label="Category" value={r.category} />
                <Answer label="Country or region" value={r.country} />
                <Answer label="Who follows them and why" value={r.audience} />
                <Answer label="Also known as" value={r.known_as} />
                <div className="adm-answer">
                  <dt>Links</dt>
                  {links.length ? (
                    links.map((l, i) => {
                      const url = webAddress(l);
                      return (
                        <dd key={i + l}>
                          {url ? (
                            <a className="adm-link" href={url} target="_blank" rel="noreferrer noopener">
                              <Icon name="link" size={14} /> {l}
                            </a>
                          ) : (
                            l
                          )}
                        </dd>
                      );
                    })
                  ) : (
                    <dd className="none">None given</dd>
                  )}
                </div>
              </dl>
            </div>
          ) : path === 'plus' ? (
            <p className="muted-text small">Asked through Community Plus: the identity check is all that's needed. Open their profile to see that Plus is active.</p>
          ) : null}
          {r.note ? <p className="pre">{r.note}</p> : null}
          <div className="adm-actions">
            <button className="btn small" disabled={incomplete || (!!busy && busy !== r.id)} onClick={() => decide(r, true)}>
              {busy === r.id ? 'Approving…' : 'Approve: give the tick'}
            </button>
            <button className="btn quiet small" disabled={!!busy} onClick={() => decide(r, false)}>
              Decline
            </button>
          </div>
        </div>
        <div className="adm-photos">
          <PrivatePhoto path={r.document_path} label="Document" onOpen={open} />
          <PrivatePhoto path={r.selfie_path} label="Selfie" onOpen={open} />
        </div>
      </>
    );
  }

  function plusBody(r: PlusRequest) {
    return (
      <div className="adm-req-info">
        {r.note ? <p className="pre">{r.note}</p> : <p className="muted-text"><i>No note</i></p>}
        <div className="adm-actions">
          <button className="btn small" disabled={!!busy && busy !== r.id} onClick={() => decide(r, true)}>
            {busy === r.id ? 'Approving…' : 'Approve: Plus for a month'}
          </button>
          <button className="btn quiet small" disabled={!!busy} onClick={() => decide(r, false)}>
            Decline
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-wide">
      <div className="dash-head">
        <div>
          <h1 className="page-title">Tick and Plus requests</h1>
          <p className="muted-text small">Identity checks for the blue tick, and Plus that a church has arranged.</p>
        </div>
      </div>
      <div className="seg left tight adm-tabs" role="tablist">
        {(['verify', 'plus'] as const).map((k) => {
          const n = waiting(k);
          return (
            <button key={k} role="tab" aria-selected={kind === k} className={kind === k ? 'on' : ''} onClick={() => nav(k === 'plus' ? '/admin/requests/plus' : '/admin/requests')}>
              {k === 'verify' ? 'Identity checks' : 'Plus'}
              {n ? <span className="adm-count">{n}</span> : null}
            </button>
          );
        })}
      </div>
      {list.loading && !list.data ? (
        <Spinner />
      ) : list.error ? (
        <Failed error={list.error} retry={list.reload} />
      ) : !shown.length ? (
        kind === 'verify' ? (
          <Empty icon="verified" title="No identity checks waiting" body="When a member asks for the blue tick, their document and selfie appear here." />
        ) : (
          <Empty icon="crown" title="No Plus requests waiting" body="Members whose church arranges Plus for them ask here." />
        )
      ) : null}
      {shown.map((r) => (
        <section key={r.id} className={'dash-card adm-req ' + r.kind} data-request={r.id}>
          <div className="adm-req-head">
            <Who name={r.full_name || 'Member'} username={r.username ?? '…'} avatar={r.avatar_url} when={agoLong(r.created_at)} to={r.username ? '/u/' + r.username : undefined} />
            <span className={'adm-kind ' + r.kind}>
              {r.kind === 'plus' ? <Icon name="crown" size={14} /> : <TickIcon />}
              {r.kind === 'plus' ? 'Plus' : 'Tick'}
            </span>
          </div>
          <div className={'adm-req-body' + (r.kind === 'verify' ? ' with-photos' : '')}>{r.kind === 'verify' ? verifyBody(r) : plusBody(r)}</div>
        </section>
      ))}

      {viewer ? (
        <Modal bare onClose={() => setViewer(null)} className="adm-viewer">
          <img src={viewer.url} alt={viewer.label} />
          <p>{viewer.label}</p>
        </Modal>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ Sabbath School publishers */

/** Admins: who may publish in Sabbath School. Requests to approve or decline, and publishers to revoke. */
export function Publishers() {
  const list = useLoad(() => fetchPublishers(), []);
  const [busy, setBusy] = useState('');
  const nameOf = (p: Publisher) => p.profile?.full_name || p.profile?.username || '?';

  async function decide(p: Publisher, status: 'approved' | 'rejected' | 'revoked') {
    if (busy) return;
    setBusy(p.user_id);
    try {
      await decidePublisher(p.user_id, status);
      // The server records who decided and when; the list shows it straight away.
      const at = new Date().toISOString();
      list.set((list.data ?? []).flatMap((x) => (x.user_id !== p.user_id ? [x] : status === 'approved' ? [{ ...x, status, decided_at: at }] : [])));
      toast(status === 'approved' ? `${nameOf(p)} can now publish` : status === 'rejected' ? 'Request declined' : `${nameOf(p)} can no longer publish`);
      refreshAdminCounts();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy('');
    }
  }

  async function confirm(p: Publisher, status: 'rejected' | 'revoked') {
    const revoke = status === 'revoked';
    if (await ask(revoke ? `Revoke ${nameOf(p)}?` : `Decline ${nameOf(p)}?`, '', revoke ? 'Revoke' : 'Decline')) decide(p, status);
  }

  const card = (p: Publisher) => {
    const who = p.profile;
    const pending = p.status === 'pending';
    return (
      <section key={p.user_id} className="dash-card adm-pub" data-publisher={p.user_id}>
        <Who name={nameOf(p)} username={who?.username} avatar={who?.avatar_url} verified={!!who?.verified} when={agoLong(pending ? p.created_at : p.decided_at ?? p.created_at)} to={who?.username ? '/u/' + who.username : undefined} />
        {p.note.trim() ? <p className="pre adm-pub-note">{p.note.trim()}</p> : <p className="muted-text adm-pub-note">No note</p>}
        <div className="adm-actions">
          {pending ? (
            <>
              <button className="btn small" disabled={!!busy && busy !== p.user_id} onClick={() => decide(p, 'approved')}>
                {busy === p.user_id ? 'Approving…' : 'Approve'}
              </button>
              <button className="btn quiet small" disabled={!!busy} onClick={() => confirm(p, 'rejected')}>
                Decline
              </button>
            </>
          ) : (
            <button className="btn quiet small" disabled={!!busy && busy !== p.user_id} onClick={() => confirm(p, 'revoked')}>
              Revoke
            </button>
          )}
        </div>
      </section>
    );
  };

  const pending = (list.data ?? []).filter((p) => p.status === 'pending');
  const approved = (list.data ?? []).filter((p) => p.status === 'approved').sort((a, b) => (b.decided_at ?? '').localeCompare(a.decided_at ?? ''));

  return (
    <div className="admin-wide adm-publishers">
      <div className="dash-head">
        <div>
          <h1 className="page-title">Publishers</h1>
          <p className="muted-text small">Who can publish in Sabbath School</p>
        </div>
        <button className="btn quiet small" onClick={list.reload}>Refresh</button>
      </div>
      {list.loading && !list.data ? (
        <Spinner />
      ) : list.error ? (
        <Failed error={list.error} retry={list.reload} />
      ) : (
        <>
          <h3 className="adm-section-h" data-section="requests">
            Requests{pending.length ? <span className="adm-count">{pending.length}</span> : null}
          </h3>
          {pending.length ? <div className="adm-cards">{pending.map(card)}</div> : <p className="muted-text adm-none">No requests waiting</p>}
          <h3 className="adm-section-h" data-section="publishers">
            Publishers{approved.length ? <span className="adm-count quiet">{approved.length}</span> : null}
          </h3>
          {approved.length ? <div className="adm-cards">{approved.map(card)}</div> : <p className="muted-text adm-none">No publishers yet</p>}
        </>
      )}
    </div>
  );
}
