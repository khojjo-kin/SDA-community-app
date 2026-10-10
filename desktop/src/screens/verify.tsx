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
import { t } from '../lib/i18n';
import { useMe } from '../lib/me';
import { nav } from '../lib/router';
import { Failed, Icon, type IconName, Link, Spinner, Verified, toast, useLoad } from '../ui/kit';
import { longDay, Notice, shortDay } from './pro-kit';

// Labels are the keys of their words, shown with t().
const DOCUMENTS: { value: DocumentType; label: string }[] = [
  { value: 'passport', label: 'd.plus.docPassport' },
  { value: 'driving_licence', label: 'd.plus.docLicence' },
  { value: 'national_id', label: 'd.plus.docNationalId' },
  { value: 'other', label: 'd.plus.docOther' },
];
/** The category is sent in English (our team reads it); the member sees it in their language. */
const CATEGORIES: { value: string; label: string }[] = [
  { value: 'Church or ministry', label: 'd.plus.catChurch' },
  { value: 'Pastor or elder', label: 'd.plus.catPastor' },
  { value: 'Creator', label: 'd.plus.catCreator' },
  { value: 'Musician or choir', label: 'd.plus.catMusician' },
  { value: 'News or media', label: 'd.plus.catNews' },
  { value: 'Organisation', label: 'd.plus.catOrganisation' },
  { value: 'Other', label: 'd.plus.catOther' },
];

type Path = 'notable' | 'plus';
type Step = 'how' | 'identity' | 'notability' | 'review';
const STEP_TITLE: Record<Step, string> = { how: 'd.plus.stepHow', identity: 'auth.confirmItsYou', notability: 'd.plus.stepNotability', review: 'd.plus.stepReview' };
const MAX_LINKS = 3;
/** Enough to say who follows the account and why; a word or two can't be judged. */
const MIN_AUDIENCE = 20;
/** Set while the member goes to get Plus, so coming back carries on along the Plus path. */
const PLUS_FLAG = 'community.verifyWithPlus';

type Photo = { uri: string; width: number; name: string };
type Sending = '' | 'document' | 'selfie' | 'request';
const SENDING_TEXT: Record<Exclude<Sending, ''>, string> = {
  document: 'd.plus.uploadingDoc',
  selfie: 'd.plus.uploadingSelfie',
  request: 'd.plus.sendingRequest',
};

/** A web address, with or without https:// in front. */
const looksLikeLink = (s: string) => /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(:\d+)?([/?#]\S*)?$/i.test(s.trim());
/** Admins open these, so each one is sent as a full web address. */
const withScheme = (s: string) => (/^https?:\/\//i.test(s.trim()) ? s.trim() : `https://${s.trim()}`);

/** A picked picture as a blob: address, with its width (big ones are shrunk before upload). */
function readPhoto(file: File): Promise<Photo> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error(t('d.plus.choosePhoto')));
    const uri = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ uri, width: img.naturalWidth, name: file.name });
    img.onerror = () => reject(new Error(t('d.plus.photoUnreadable')));
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
      toast(t('d.plus.welcomeVerify'));
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
    if (s === 'how') return path ? '' : t('d.plus.needPath');
    if (s === 'identity') {
      if (legalName.trim().length < 2) return t('d.plus.needName');
      if (!docType) return t('d.plus.needDocType');
      if (!doc) return t('d.plus.needDocPhoto');
      if (!selfie) return t('d.plus.needSelfie');
      return '';
    }
    if (s === 'notability') {
      if (path !== 'notable') return '';
      if (!category) return t('d.plus.needCategory');
      if (country.trim().length < 2) return t('d.plus.needCountry');
      if (audience.trim().length < MIN_AUDIENCE) return t('d.plus.needAudience');
      const bad = links.find((l) => l.trim() && !looksLikeLink(l));
      if (bad) return t('d.plus.badLink', { link: bad.trim() });
      return '';
    }
    for (const earlier of steps.slice(0, -1)) {
      const p = problem(earlier);
      if (p) return p;
    }
    if (path === 'plus' && !me.plus) return t('d.plus.needPlus');
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
    if (gap || !doc || !selfie || !docType || !path) return setFormError(gap || t('d.plus.somethingMissing'));
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

  const header = <h1 className="pro-title">{t('settings.requestVerification')}</h1>;
  const mine = (requests.data ?? []).filter((r) => r.kind === 'verify');
  const pending = mine.find((r) => r.status === 'pending');

  // A hidden tick (a Plus setting) is still a tick.
  if (me.verified || me.tick_hidden) {
    return (
      <div className="page pro-verify">
        {header}
        <Done tick title={t('d.plus.youreVerified')} body={me.verified_via === 'plus' ? t('d.plus.verifiedWithPlusDot') : t('d.plus.tickShows')}>
          {me.plus ? (
            <Link to="/plus" className="btn quiet">
              {t('d.plus.tickSettings')}
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
        <Done icon="lock" title={t('d.plus.notAvailableYet')} body={t('d.plus.tickAge')} />
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
        <Done icon={sent ? 'check' : 'clock'} title={sent ? t('ssPub.sent') : t('d.plus.beingReviewed')} body={sent ? t('d.plus.sentBody') : t('d.plus.pendingBody', { day: longDay(pending!.created_at) })}>
          <Link to="/" className="btn quiet">
            {t('checkout.done')}
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
          <h2>{t('d.plus.getTick')}</h2>
          <p className="muted-text">{t('d.plus.getTickSub')}</p>
        </div>
        {declined ? <Notice kind="warn">{t('d.plus.declined')}</Notice> : null}
        <div className="pro-paths">
          <PathCard icon="star" tag={t('d.plus.free')} title={t('d.plus.pathNotable')} points={[t('d.plus.pointId'), t('d.plus.pointQuestions')]} action={t('d.plus.apply')} chosen={path === 'notable'} onClick={() => { setPath('notable'); go('identity'); }} />
          <PathCard icon="crown" tag={me.plus ? t('plus.youHavePlus') : t('d.plus.withPlus')} title={t('d.plus.pathPlus')} points={[t('d.plus.pointId'), t('d.plus.pointNoQuestions')]} action={me.plus ? t('d.plus.continueWithPlus') : t('d.plus.getPlusToContinue')} chosen={path === 'plus'} onClick={choosePlus} />
        </div>
        <Requests list={mine} />
      </>
    );
  } else if (step === 'identity') {
    body = (
      <>
        <Card title={t('d.plus.nameAndDoc')} done={legalName.trim().length >= 2 && !!docType}>
          <label className="form-row">
            <span>{t('d.plus.legalName')}</span>
            <input value={legalName} onChange={(e) => { setLegalName(e.target.value); setFormError(''); }} placeholder={t('d.plus.legalNameHint')} maxLength={120} autoComplete="name" disabled={locked} />
          </label>
          <span className="pro-field-label">{t('d.plus.docType')}</span>
          <div className="pro-chips" role="radiogroup" aria-label={t('d.plus.docType')}>
            {DOCUMENTS.map((d) => (
              <button key={d.value} role="radio" aria-checked={docType === d.value} className={'pro-chip' + (docType === d.value ? ' on' : '')} disabled={locked} onClick={() => { setDocType(d.value); setFormError(''); }}>
                {t(d.label)}
              </button>
            ))}
          </div>
        </Card>
        <div className="pro-photos">
          <PhotoPick title={t('d.plus.docPhotoTitle')} hint={t('d.plus.docPhotoHint')} photo={doc} label={t('d.plus.docPhoto')} alt={t('d.plus.yourDocPhoto')} disabled={locked} onPick={(p) => { setDoc(p); setFormError(''); }} />
          <PhotoPick title={t('d.plus.aSelfie')} hint={t('d.plus.selfieHint')} photo={selfie} label={t('d.plus.selfie')} alt={t('d.plus.yourSelfie')} selfie disabled={locked} onPick={(p) => { setSelfie(p); setFormError(''); }} />
        </div>
      </>
    );
  } else if (step === 'notability') {
    body = (
      <>
        <Card title={t('d.plus.category')} done={!!category}>
          <div className="pro-chips" role="radiogroup" aria-label={t('d.plus.category')}>
            {CATEGORIES.map((c) => (
              <button key={c.value} role="radio" aria-checked={category === c.value} className={'pro-chip' + (category === c.value ? ' on' : '')} onClick={() => { setCategory(c.value); setFormError(''); }}>
                {t(c.label)}
              </button>
            ))}
          </div>
        </Card>
        <Card title={t('d.plus.country')} done={country.trim().length >= 2}>
          <label className="form-row">
            <input value={country} onChange={(e) => { setCountry(e.target.value); setFormError(''); }} placeholder={t('d.plus.countryHint')} maxLength={60} aria-label={t('d.plus.country')} autoComplete="country-name" />
          </label>
        </Card>
        <Card title={t('d.plus.audience')} sub={t('d.plus.audienceQ')} done={audience.trim().length >= MIN_AUDIENCE}>
          <label className="form-row">
            <textarea rows={4} value={audience} onChange={(e) => { setAudience(e.target.value); setFormError(''); }} placeholder={t('d.plus.audienceHint')} maxLength={500} aria-label={t('d.plus.audienceQ')} />
            <em className="pro-count">{audience.trim().length}/500</em>
          </label>
        </Card>
        <Card title={t('d.plus.knownAsOptional')}>
          <label className="form-row">
            <input value={knownAs} onChange={(e) => setKnownAs(e.target.value)} placeholder={t('d.plus.knownAsHint')} maxLength={200} aria-label={t('d.plus.knownAs')} />
          </label>
        </Card>
        <Card title={t('d.plus.linksOptional')} sub={t('d.plus.linksSub')}>
          {links.map((l, i) => (
            <label key={i} className="form-row">
              <input value={l} onChange={(e) => { setLinks((cur) => cur.map((x, j) => (j === i ? e.target.value : x))); setFormError(''); }} placeholder={i === 0 ? 'https://' : t('d.plus.anotherLink', { n: i + 1, max: MAX_LINKS })} maxLength={300} aria-label={t('d.plus.linkN', { n: i + 1 })} inputMode="url" />
            </label>
          ))}
        </Card>
      </>
    );
  } else {
    const given = links.filter((l) => l.trim());
    body = (
      <>
        <Card title={t('d.plus.how')} onEdit={locked ? undefined : () => go('how')}>
          <Line label={t('d.plus.wayToVerify')} value={path === 'plus' ? t('d.plus.withPlus') : t('d.plus.notableFree')} />
        </Card>
        <Card title={t('d.plus.itsYou')} onEdit={locked ? undefined : () => go('identity')}>
          <Line label={t('d.plus.legalName')} value={legalName.trim()} />
          <Line label={t('d.plus.docType')} value={t(DOCUMENTS.find((d) => d.value === docType)?.label ?? '')} />
          <div className="pro-review-photos">
            <figure>
              <figcaption>{t('d.plus.document')}</figcaption>
              {doc ? <img src={doc.uri} alt={t('d.plus.yourDocPhoto')} /> : null}
            </figure>
            <figure>
              <figcaption>{t('d.plus.selfie')}</figcaption>
              {selfie ? <img src={selfie.uri} alt={t('d.plus.yourSelfie')} /> : null}
            </figure>
          </div>
        </Card>
        {path === 'notable' ? (
          <Card title={t('d.plus.notability')} onEdit={locked ? undefined : () => go('notability')}>
            <Line label={t('d.plus.category')} value={t(CATEGORIES.find((c) => c.value === category)?.label ?? category)} />
            <Line label={t('d.plus.country')} value={country.trim()} />
            <Line label={t('d.plus.audienceLabel')} value={audience.trim()} />
            {knownAs.trim() ? <Line label={t('d.plus.knownAs')} value={knownAs.trim()} /> : null}
            <Line label={t('d.plus.links')} value={given.length ? given.map(withScheme).join('\n') : t('create.none')} />
          </Card>
        ) : null}
        <Card title={t('d.plus.anythingElse')}>
          <label className="form-row">
            <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('d.plus.anythingElseHint')} maxLength={500} disabled={locked} aria-label={t('d.plus.anythingElseLabel')} />
          </label>
        </Card>
        <p className="pro-terms">{t('d.plus.consent')}</p>
      </>
    );
  }

  return (
    <div className="page pro-verify">
      {header}
      <div className="pro-steps" role="progressbar" aria-label={t('d.plus.stepAria', { step: index + 1, total: steps.length, title: t(STEP_TITLE[step]) })} aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={index + 1}>
        <div className="pro-steps-text">
          <b>{t(STEP_TITLE[step])}</b>
          <span className="muted-text">{t('d.plus.stepOf', { step: index + 1, total: steps.length })}</span>
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
              <Spinner size={16} /> {t(SENDING_TEXT[sending])}
            </p>
          ) : null}
          <div className="pro-foot-btns">
            <button className="btn quiet big" disabled={locked} onClick={back}>
              {t('common.back')}
            </button>
            {step === 'review' ? (
              <button className="btn big" disabled={locked} onClick={submit}>
                {locked ? t('d.plus.sending') : t('ssPub.send')}
              </button>
            ) : (
              <button className="btn big" onClick={next}>
                {t('d.plus.next')}
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
          <button className="link-btn" onClick={onEdit} aria-label={t('d.plus.editX', { title })}>
            {t('liveSchedule.edit')}
          </button>
        ) : done ? (
          <span className="pro-done" aria-label={t('checkout.done')}>
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

/** Choosing a photo from the computer (or dropping one on the box), with a preview. `alt` describes the preview. */
function PhotoPick({ title, hint, photo, label, alt, selfie, disabled, onPick }: { title: string; hint: string; photo: Photo | null; label: string; alt: string; selfie?: boolean; disabled?: boolean; onPick: (p: Photo) => void }) {
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
          <span className="pro-done" aria-label={t('checkout.done')}>
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
          <img src={photo.uri} alt={alt} />
        ) : (
          <>
            <Icon name={selfie ? 'user' : 'image'} size={30} stroke={1.5} />
            <b>{selfie ? t('d.plus.addSelfie') : t('d.plus.addPhoto')}</b>
            <span>{t('d.plus.dropHint')}</span>
          </>
        )}
      </button>
      {photo ? (
        <button className="link-btn" disabled={disabled} onClick={() => input.current?.click()}>
          {t('d.plus.chooseAnother')}
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

/** Each status's words (their key) and colour. */
const REQUEST_STATUS: Record<PlusRequest['status'], { label: string; cls: string }> = {
  pending: { label: 'd.plus.waiting', cls: '' },
  approved: { label: 'd.plus.approved', cls: 'ok' },
  declined: { label: 'ssPub.rejected', cls: 'bad' },
};

/** Your identity checks so far, newest first. */
function Requests({ list }: { list: PlusRequest[] }) {
  if (!list.length) return null;
  return (
    <section className="pro-requests">
      <h3>{t('d.plus.yourRequests')}</h3>
      <ul>
        {list.map((r) => (
          <li key={r.id}>
            <Icon name="verified" size={20} />
            <div className="grow">
              <b>{r.path === 'plus' ? t('d.plus.verifiedWithPlus') : r.path === 'notable' ? t('d.plus.notableAccount') : t('d.plus.verification')}</b>
              <span className="muted-text small">{r.decided_at ? t('d.plus.sentDecided', { day: shortDay(r.created_at), decided: shortDay(r.decided_at) }) : t('d.plus.sentOn', { day: shortDay(r.created_at) })}</span>
            </div>
            <span className={'pro-tag ' + REQUEST_STATUS[r.status].cls}>{t(REQUEST_STATUS[r.status].label)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
