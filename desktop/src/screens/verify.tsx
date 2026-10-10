// Asking for the blue tick, a page at a time, as on the iPhone. The tick says an account is who it
// claims to be, so every request includes an identity check our team approves: a photo of an ID
// document and a selfie, kept in a private bucket and deleted once the request is decided. Two ways
// in: a free application for widely known accounts (with questions about that), or, for any
// authentic member, verification with Community Plus. Plus no longer brings the tick by itself.
import React, { useEffect, useRef, useState } from 'react';
import { myPlusRequests, requestVerification, uploadVerificationPhoto, VERIFICATION_BUCKET } from 'shared/api';
import { supabase } from 'shared/supabase';
import { errText } from 'shared/theme';
import type { DocumentType, PlusRequest } from 'shared/types';
import { useMe } from '../lib/me';
import { nav } from '../lib/router';
import { Failed, Icon, type IconName, Link, Spinner, Verified, toast, useLoad } from '../ui/kit';
import { longDay, Notice, shortDay } from './pro-kit';

const DOCUMENTS: { value: DocumentType; label: string }[] = [
  { value: 'passport', label: 'Passport' },
  { value: 'driving_licence', label: 'Driving licence' },
  { value: 'national_id', label: 'National ID card' },
  { value: 'other', label: 'Other' },
];
const CATEGORIES = ['Church or ministry', 'Pastor or elder', 'Creator', 'Musician or choir', 'News or media', 'Organisation', 'Other'];

type Path = 'notable' | 'plus';
type Step = 'how' | 'identity' | 'notability' | 'review';
const STEP_TITLE: Record<Step, string> = { how: 'Choose how', identity: "Confirm it's you", notability: 'Confirm notability', review: 'Review and send' };
const MAX_LINKS = 3;
/** Enough to say who follows the account and why; a word or two can't be judged. */
const MIN_AUDIENCE = 20;
/** Set while the member goes to get Plus, so coming back carries on along the Plus path. */
const PLUS_FLAG = 'community.verifyWithPlus';

type Photo = { uri: string; width: number; name: string };
type Sending = '' | 'document' | 'selfie' | 'request';
const SENDING_TEXT: Record<Exclude<Sending, ''>, string> = {
  document: 'Uploading your document photo… (1 of 3)',
  selfie: 'Uploading your selfie… (2 of 3)',
  request: 'Sending your request… (3 of 3)',
};

/** A web address, with or without https:// in front. */
const looksLikeLink = (s: string) => /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(:\d+)?([/?#]\S*)?$/i.test(s.trim());
/** Admins open these, so each one is sent as a full web address. */
const withScheme = (s: string) => (/^https?:\/\//i.test(s.trim()) ? s.trim() : `https://${s.trim()}`);

/** A picked picture as a blob: address, with its width (big ones are shrunk before upload). */
function readPhoto(file: File): Promise<Photo> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('Choose a photo (JPG or PNG).'));
    const uri = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ uri, width: img.naturalWidth, name: file.name });
    img.onerror = () => reject(new Error('That picture could not be opened. Choose another.'));
    img.src = uri;
  });
}

export function Verify() {
  const { me } = useMe();
  const requests = useLoad(() => myPlusRequests(me.id), [me.id]);
  const [step, setStep] = useState<Step>('how');
  const [path, setPath] = useState<Path | null>(null);
  const [legalName, setLegalName] = useState('');
  const [docType, setDocType] = useState<DocumentType | null>(null);
  const [doc, setDoc] = useState<Photo | null>(null);
  const [selfie, setSelfie] = useState<Photo | null>(null);
  const [category, setCategory] = useState('');
  const [country, setCountry] = useState('');
  const [audience, setAudience] = useState('');
  const [knownAs, setKnownAs] = useState('');
  const [links, setLinks] = useState<string[]>(() => Array.from({ length: MAX_LINKS }, () => ''));
  const [note, setNote] = useState('');
  const [sending, setSending] = useState<Sending>('');
  const [formError, setFormError] = useState('');
  const [sent, setSent] = useState(false);
  const busy = useRef(false);

  // Back from getting Plus: carry on along the Plus path.
  useEffect(() => {
    let flagged = false;
    try {
      flagged = sessionStorage.getItem(PLUS_FLAG) === '1';
    } catch {
      flagged = false;
    }
    if (flagged && me.plus) {
      try {
        sessionStorage.removeItem(PLUS_FLAG);
      } catch {
        // nothing to clear
      }
      setPath('plus');
      setStep('identity');
      toast("Welcome to Plus. Now let's confirm it's you.");
    }
  }, [me.plus]);

  const steps: Step[] = path === 'plus' ? ['how', 'identity', 'review'] : ['how', 'identity', 'notability', 'review'];
  const index = Math.max(0, steps.indexOf(step));
  const go = (next: Step) => {
    setFormError('');
    setStep(next);
    window.scrollTo(0, 0);
  };

  /** What still needs doing on a page before moving on, or '' when it is complete. */
  function problem(s: Step): string {
    if (s === 'how') return path ? '' : 'Choose how you would like to be verified.';
    if (s === 'identity') {
      if (legalName.trim().length < 2) return 'Add your full name as it is written on your document.';
      if (!docType) return 'Choose which kind of document it is.';
      if (!doc) return 'Add a photo of your document.';
      if (!selfie) return 'Add a selfie.';
      return '';
    }
    if (s === 'notability') {
      if (path !== 'notable') return '';
      if (!category) return 'Choose the category that fits you best.';
      if (country.trim().length < 2) return 'Add the country or region you are based in.';
      if (audience.trim().length < MIN_AUDIENCE) return 'Tell us a little more about who follows you and why: a sentence or two is enough.';
      const bad = links.find((l) => l.trim() && !looksLikeLink(l));
      if (bad) return `"${bad.trim()}" doesn't look like a web address. Check it, or leave the field empty.`;
      return '';
    }
    for (const earlier of steps.slice(0, -1)) {
      const p = problem(earlier);
      if (p) return p;
    }
    if (path === 'plus' && !me.plus) return 'Community Plus is not active on your account. Get Plus first, or apply as a notable account instead.';
    return '';
  }

  const next = () => {
    const p = problem(step);
    if (p) return setFormError(p);
    go(steps[index + 1] ?? 'review');
  };
  const back = () => {
    if (sending || index === 0) return;
    go(steps[index - 1]);
  };

  const choosePlus = () => {
    if (me.plus) {
      setPath('plus');
      go('identity');
      return;
    }
    // Pay first; this page carries on along the Plus path once Plus is on.
    try {
      sessionStorage.setItem(PLUS_FLAG, '1');
    } catch {
      // they'll choose the path again
    }
    nav('/plus?then=/verify');
  };

  async function submit() {
    if (busy.current) return;
    const gap = problem('review');
    if (gap || !doc || !selfie || !docType || !path) return setFormError(gap || 'Something is missing. Go back and check each page.');
    busy.current = true;
    setFormError('');
    const uploaded: string[] = [];
    try {
      setSending('document');
      const document_path = await uploadVerificationPhoto(me.id, doc.uri, 'document', doc.width);
      uploaded.push(document_path);
      setSending('selfie');
      const selfie_path = await uploadVerificationPhoto(me.id, selfie.uri, 'selfie', selfie.width);
      uploaded.push(selfie_path);
      setSending('request');
      await requestVerification(me.id, {
        selfie_path,
        document_path,
        document_type: docType,
        legal_name: legalName,
        note,
        path,
        // The notability answers only go with the notable application.
        ...(path === 'notable' ? { category, country, audience, known_as: knownAs, links: links.filter((l) => l.trim()).map(withScheme) } : {}),
      });
      setSent(true);
      requests.reload();
      window.scrollTo(0, 0);
    } catch (e) {
      // Nothing reached our team, so do not leave identity photos behind.
      if (uploaded.length) supabase.storage.from(VERIFICATION_BUCKET).remove(uploaded).catch(() => null);
      setFormError(errText(e));
    } finally {
      busy.current = false;
      setSending('');
    }
  }

  const header = <h1 className="pro-title">Request verification</h1>;
  const mine = (requests.data ?? []).filter((r) => r.kind === 'verify');
  const pending = mine.find((r) => r.status === 'pending');

  // A hidden tick (a Plus setting) is still a tick.
  if (me.verified || me.tick_hidden) {
    return (
      <div className="page pro-verify">
        {header}
        <Done tick title="You're verified" body={me.verified_via === 'plus' ? 'Verified with Community Plus.' : 'Your account shows the blue tick.'}>
          {me.plus ? (
            <Link to="/plus" className="btn quiet">
              Tick settings in Plus
            </Link>
          ) : null}
        </Done>
      </div>
    );
  }
  if (me.restricted === true) {
    return (
      <div className="page pro-verify">
        {header}
        <Done icon="lock" title="Not available yet" body="The blue tick is for members aged 14 and over." />
      </div>
    );
  }
  if (requests.error && !requests.data) {
    return (
      <div className="page pro-verify">
        {header}
        <Failed error={requests.error} retry={requests.reload} />
      </div>
    );
  }
  if (!requests.data) {
    return (
      <div className="page pro-verify">
        {header}
        <Spinner />
      </div>
    );
  }
  if (sent || pending) {
    return (
      <div className="page pro-verify">
        {header}
        <Done icon={sent ? 'check' : 'clock'} title={sent ? 'Request sent' : 'Your request is being reviewed'} body={sent ? 'Our team will check your photos and let you know. They are deleted as soon as your request is decided.' : `Sent on ${longDay(pending!.created_at)}. We'll let you know when it has been decided.`}>
          <Link to="/" className="btn quiet">
            Done
          </Link>
        </Done>
        <Requests list={mine} />
      </div>
    );
  }

  const declined = mine[0]?.status === 'declined';
  const locked = !!sending;
  let body: React.ReactNode;
  if (step === 'how') {
    body = (
      <>
        <div className="pro-verify-hero">
          <span className="pro-verify-tick">
            <Verified size={44} />
          </span>
          <h2>Get the blue tick</h2>
          <p className="muted-text">The tick shows people your account is who it says it is. Every request includes a quick identity check.</p>
        </div>
        {declined ? <Notice kind="warn">Your last request was not approved. Try again with clear, well-lit photos, and the name exactly as it is on your document.</Notice> : null}
        <div className="pro-paths">
          <PathCard icon="star" tag="Free" title="Apply as a notable account" points={['A photo of your ID and a selfie', 'A few questions about who follows you and why']} action="Apply" chosen={path === 'notable'} onClick={() => { setPath('notable'); go('identity'); }} />
          <PathCard icon="crown" tag={me.plus ? 'You have Plus' : 'With Community Plus'} title="Get verified with Community Plus" points={['A photo of your ID and a selfie', 'No questions about your audience']} action={me.plus ? 'Continue with Plus' : 'Get Plus to continue'} chosen={path === 'plus'} onClick={choosePlus} />
        </div>
        <Requests list={mine} />
      </>
    );
  } else if (step === 'identity') {
    body = (
      <>
        <Card title="Your name and document" done={legalName.trim().length >= 2 && !!docType}>
          <label className="form-row">
            <span>Full legal name</span>
            <input value={legalName} onChange={(e) => { setLegalName(e.target.value); setFormError(''); }} placeholder="As it is written on your document" maxLength={120} autoComplete="name" disabled={locked} />
          </label>
          <span className="pro-field-label">Document type</span>
          <div className="pro-chips" role="radiogroup" aria-label="Document type">
            {DOCUMENTS.map((d) => (
              <button key={d.value} role="radio" aria-checked={docType === d.value} className={'pro-chip' + (docType === d.value ? ' on' : '')} disabled={locked} onClick={() => { setDocType(d.value); setFormError(''); }}>
                {d.label}
              </button>
            ))}
          </div>
        </Card>
        <div className="pro-photos">
          <PhotoPick title="Photo of your document" hint="The whole document, flat and in focus, with nothing covered." photo={doc} label="Document photo" disabled={locked} onPick={(p) => { setDoc(p); setFormError(''); }} />
          <PhotoPick title="A selfie" hint="Your face, clearly lit, looking at the camera." photo={selfie} label="Selfie" selfie disabled={locked} onPick={(p) => { setSelfie(p); setFormError(''); }} />
        </div>
      </>
    );
  } else if (step === 'notability') {
    body = (
      <>
        <Card title="Category" done={!!category}>
          <div className="pro-chips" role="radiogroup" aria-label="Category">
            {CATEGORIES.map((c) => (
              <button key={c} role="radio" aria-checked={category === c} className={'pro-chip' + (category === c ? ' on' : '')} onClick={() => { setCategory(c); setFormError(''); }}>
                {c}
              </button>
            ))}
          </div>
        </Card>
        <Card title="Country or region" done={country.trim().length >= 2}>
          <label className="form-row">
            <input value={country} onChange={(e) => { setCountry(e.target.value); setFormError(''); }} placeholder="For example, Ghana" maxLength={60} aria-label="Country or region" autoComplete="country-name" />
          </label>
        </Card>
        <Card title="Audience" sub="Who follows you and why?" done={audience.trim().length >= MIN_AUDIENCE}>
          <label className="form-row">
            <textarea rows={4} value={audience} onChange={(e) => { setAudience(e.target.value); setFormError(''); }} placeholder="For example: churches across West Africa follow our choir for new recordings and concert dates." maxLength={500} aria-label="Who follows you and why?" />
            <em className="pro-count">{audience.trim().length}/500</em>
          </label>
        </Card>
        <Card title="Also known as (optional)">
          <label className="form-row">
            <input value={knownAs} onChange={(e) => setKnownAs(e.target.value)} placeholder="Other names, in any language" maxLength={200} aria-label="Also known as" />
          </label>
        </Card>
        <Card title="Links (optional)" sub="News stories, your church or ministry's website, other profiles.">
          {links.map((l, i) => (
            <label key={i} className="form-row">
              <input value={l} onChange={(e) => { setLinks((cur) => cur.map((x, j) => (j === i ? e.target.value : x))); setFormError(''); }} placeholder={i === 0 ? 'https://' : `Another link (${i + 1} of ${MAX_LINKS})`} maxLength={300} aria-label={`Link ${i + 1}`} inputMode="url" />
            </label>
          ))}
        </Card>
      </>
    );
  } else {
    const given = links.filter((l) => l.trim());
    body = (
      <>
        <Card title="How" onEdit={locked ? undefined : () => go('how')}>
          <Line label="Way to verify" value={path === 'plus' ? 'With Community Plus' : 'Notable account (free)'} />
        </Card>
        <Card title="It's you" onEdit={locked ? undefined : () => go('identity')}>
          <Line label="Full legal name" value={legalName.trim()} />
          <Line label="Document type" value={DOCUMENTS.find((d) => d.value === docType)?.label ?? ''} />
          <div className="pro-review-photos">
            <figure>
              <figcaption>Document</figcaption>
              {doc ? <img src={doc.uri} alt="Your document photo" /> : null}
            </figure>
            <figure>
              <figcaption>Selfie</figcaption>
              {selfie ? <img src={selfie.uri} alt="Your selfie" /> : null}
            </figure>
          </div>
        </Card>
        {path === 'notable' ? (
          <Card title="Notability" onEdit={locked ? undefined : () => go('notability')}>
            <Line label="Category" value={category} />
            <Line label="Country or region" value={country.trim()} />
            <Line label="Who follows you and why" value={audience.trim()} />
            {knownAs.trim() ? <Line label="Also known as" value={knownAs.trim()} /> : null}
            <Line label="Links" value={given.length ? given.map(withScheme).join('\n') : 'None'} />
          </Card>
        ) : null}
        <Card title="Anything else? (optional)">
          <label className="form-row">
            <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example, if your name has changed" maxLength={500} disabled={locked} aria-label="Anything our team should know" />
          </label>
        </Card>
        <p className="pro-terms">By sending, you agree that our team may look at these photos to check who you are. They are deleted as soon as your request is decided.</p>
      </>
    );
  }

  return (
    <div className="page pro-verify">
      {header}
      <div className="pro-steps" role="progressbar" aria-label={`Step ${index + 1} of ${steps.length}: ${STEP_TITLE[step]}`} aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={index + 1}>
        <div className="pro-steps-text">
          <b>{STEP_TITLE[step]}</b>
          <span className="muted-text">
            Step {index + 1} of {steps.length}
          </span>
        </div>
        <div className="pro-steps-bars">
          {steps.map((s, i) => (
            <i key={s} className={i <= index ? 'on' : ''} />
          ))}
        </div>
      </div>
      <div className="pro-verify-body">{body}</div>
      {step !== 'how' ? (
        <div className="pro-verify-foot">
          {formError ? (
            <p className="form-error" role="alert">
              {formError}
            </p>
          ) : null}
          {sending ? (
            <p className="pro-sending">
              <Spinner size={16} /> {SENDING_TEXT[sending]}
            </p>
          ) : null}
          <div className="pro-foot-btns">
            <button className="btn quiet big" disabled={locked} onClick={back}>
              Back
            </button>
            {step === 'review' ? (
              <button className="btn big" disabled={locked} onClick={submit}>
                {locked ? 'Sending…' : 'Send request'}
              </button>
            ) : (
              <button className="btn big" onClick={next}>
                Next
              </button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** A block of the form. A green check shows once it is complete; `onEdit` adds Edit (on the review page). */
function Card({ title, sub, done, onEdit, children }: { title: string; sub?: string; done?: boolean; onEdit?: () => void; children: React.ReactNode }) {
  return (
    <section className="pro-form-card">
      <div className="pro-form-card-head">
        <div className="grow">
          <h3>{title}</h3>
          {sub ? <p className="muted-text">{sub}</p> : null}
        </div>
        {onEdit ? (
          <button className="link-btn" onClick={onEdit} aria-label={'Edit ' + title}>
            Edit
          </button>
        ) : done ? (
          <span className="pro-done" aria-label="Done">
            <Icon name="check" size={14} stroke={3} />
          </span>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="pro-line">
      <span>{label}</span>
      <p>{value}</p>
    </div>
  );
}

/** One of the two ways to get the tick, as a card with its own button. */
function PathCard({ icon, tag, title, points, action, chosen, onClick }: { icon: IconName; tag: string; title: string; points: string[]; action: string; chosen: boolean; onClick: () => void }) {
  return (
    <div className={'pro-path' + (chosen ? ' on' : '')}>
      <div className="pro-path-head">
        <span className="pro-round ok">
          <Icon name={icon} size={20} stroke={2.1} />
        </span>
        <div>
          <span className="pro-tag">{tag}</span>
          <h3>{title}</h3>
        </div>
      </div>
      <ul>
        {points.map((p) => (
          <li key={p}>
            <Icon name="check" size={16} stroke={2.4} /> {p}
          </li>
        ))}
      </ul>
      <button className="btn block big" onClick={onClick}>
        {action}
      </button>
    </div>
  );
}

/** Choosing a photo from the computer (or dropping one on the box), with a preview. */
function PhotoPick({ title, hint, photo, label, selfie, disabled, onPick }: { title: string; hint: string; photo: Photo | null; label: string; selfie?: boolean; disabled?: boolean; onPick: (p: Photo) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const take = async (file?: File | null) => {
    if (!file) return;
    try {
      onPick(await readPhoto(file));
    } catch (e) {
      toast(errText(e));
    }
  };
  return (
    <section className="pro-form-card">
      <div className="pro-form-card-head">
        <div className="grow">
          <h3>{title}</h3>
          <p className="muted-text">{hint}</p>
        </div>
        {photo ? (
          <span className="pro-done" aria-label="Done">
            <Icon name="check" size={14} stroke={3} />
          </span>
        ) : null}
      </div>
      <button
        type="button"
        className={'pro-drop-zone' + (over ? ' over' : '') + (photo ? ' has' : '')}
        disabled={disabled}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          take(e.dataTransfer.files?.[0]);
        }}
      >
        {photo ? (
          <img src={photo.uri} alt={'Your ' + label.toLowerCase()} />
        ) : (
          <>
            <Icon name={selfie ? 'user' : 'image'} size={30} stroke={1.5} />
            <b>{selfie ? 'Add a selfie' : 'Add a photo'}</b>
            <span>Click to choose, or drop a picture here</span>
          </>
        )}
      </button>
      {photo ? (
        <button className="link-btn" disabled={disabled} onClick={() => input.current?.click()}>
          Choose another
        </button>
      ) : null}
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture={selfie ? 'user' : undefined}
        hidden
        aria-label={label}
        onChange={(e) => {
          take(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </section>
  );
}

/** A whole-area message in place of the form: verified, under 14, waiting, or just sent. */
function Done({ icon, tick, title, body, children }: { icon?: IconName; tick?: boolean; title: string; body?: string; children?: React.ReactNode }) {
  return (
    <div className="pro-verify-done">
      <span className="pro-verify-tick">{tick ? <Verified size={52} /> : icon ? <Icon name={icon} size={40} /> : null}</span>
      <h2>{title}</h2>
      {body ? <p className="muted-text">{body}</p> : null}
      {children}
    </div>
  );
}

const REQUEST_STATUS: Record<PlusRequest['status'], { label: string; cls: string }> = {
  pending: { label: 'Waiting for review', cls: '' },
  approved: { label: 'Approved', cls: 'ok' },
  declined: { label: 'Not approved', cls: 'bad' },
};

/** Your identity checks so far, newest first. */
function Requests({ list }: { list: PlusRequest[] }) {
  if (!list.length) return null;
  return (
    <section className="pro-requests">
      <h3>Your requests</h3>
      <ul>
        {list.map((r) => (
          <li key={r.id}>
            <Icon name="verified" size={20} />
            <div className="grow">
              <b>{r.path === 'plus' ? 'Verified with Community Plus' : r.path === 'notable' ? 'Notable account' : 'Verification'}</b>
              <span className="muted-text small">
                Sent {shortDay(r.created_at)}
                {r.decided_at ? ` · decided ${shortDay(r.decided_at)}` : ''}
              </span>
            </div>
            <span className={'pro-tag ' + REQUEST_STATUS[r.status].cls}>{REQUEST_STATUS[r.status].label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
