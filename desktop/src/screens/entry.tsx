// Before the app: the log-in page (Instagram's desktop layout, with Clerk's own forms), setting up a
// new account as the iPhone does today (date of birth first, then the profile with consent for
// information that may show your faith), and the screens for deactivated or suspended accounts.
import React, { useEffect, useRef, useState } from 'react';
import { createProfile, MINOR_AGE, purgeDate, restoreAccount, setBirthDate, uploadImage } from 'shared/api';
import { blockDeviceForAge, isDeviceAgeBlocked, isUnder13 } from 'shared/age';
import { noteConsentToRecord, recordConsentFor } from 'shared/consent';
import { errText } from 'shared/theme';
import type { Profile } from 'shared/types';
import { useAuth } from '../lib/auth';
import { dateLocale, t } from '../lib/i18n';
import { rememberSize } from '../shims/expo-file-system';
import { Avatar } from '../ui/kit';
import { Wordmark } from '../ui/sidebar';
import { LegalDialog } from './legal';
import { BirthDateInput, CannotJoin, EMPTY_BIRTH, MinorRules, checkBirthDate, type BirthParts } from './settings-birthday';
import art1 from '../../../assets/auth-bg.jpg';
import art2 from '../../../assets/auth-church.jpg';
import art3 from '../../../assets/auth-bible.jpg';

const ART = [art1, art2, art3];

/**
 * A sentence with links (or anything else drawn differently) in its {gaps}, kept whole for
 * translators: the words between the gaps as text, each gap as the element given for it.
 */
function withParts(text: string, parts: Record<string, React.ReactNode>): React.ReactNode[] {
  return text.split(/\{(\w+)\}/).map((piece, i) => (i % 2 ? <React.Fragment key={i}>{parts[piece] ?? `{${piece}}`}</React.Fragment> : piece));
}

/** Links to the policies, opening them over the page. */
function LegalLinks() {
  const [doc, setDoc] = useState('');
  // The document and the key for its link's words.
  const links: [string, string][] = [
    ['terms', 'legal.termsLink'],
    ['privacy', 'd.frame.privacy'],
    ['guidelines', 'legal.guidelines'],
    ['child-safety', 'legal.childSafety'],
  ];
  return (
    <nav className="st-login-links" aria-label={t('d.frame.policies')}>
      {links.map(([id, label]) => (
        <button key={id} type="button" onClick={() => setDoc(id)}>
          {t(label)}
        </button>
      ))}
      {doc ? <LegalDialog doc={doc} onClose={() => setDoc('')} /> : null}
    </nav>
  );
}

export function Login() {
  const auth = useAuth();
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>(() => (location.hash === '#/sign-up' ? 'sign-up' : 'sign-in'));
  const [art, setArt] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const t = setInterval(() => setArt((a) => (a + 1) % ART.length), 5000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const onHash = () => setMode(location.hash === '#/sign-up' ? 'sign-up' : 'sign-in');
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  useEffect(() => {
    if (!box.current || auth.demo) return;
    return auth.mountForm(box.current, mode);
  }, [mode, auth.ready]);
  return (
    <main className="login">
      <div className="login-art" aria-hidden="true">
        <div className="phone back">
          <img src={ART[(art + 1) % ART.length]} alt="" />
        </div>
        <div className="phone front">
          {ART.map((src, i) => (
            <img key={src} src={src} alt="" className={i === art ? 'on' : ''} />
          ))}
        </div>
      </div>
      <div className="login-side">
        <div className="login-card">
          <Wordmark />
          <p className="login-tag">{t('d.frame.loginTag')}</p>
          {auth.error ? (
            <div className="login-error">
              <b>{t('d.frame.signInDown')}</b>
              <p>{auth.error}</p>
              <button className="btn" onClick={() => location.reload()}>
                {t('common.tryAgain')}
              </button>
            </div>
          ) : auth.demo ? (
            <div className="demo-login">
              <p>{t('d.frame.demoLogin')}</p>
              <button className="btn block" onClick={auth.demoSignIn}>
                {t('d.frame.demoLogIn')}
              </button>
            </div>
          ) : (
            <div ref={box} className="clerk-box" />
          )}
        </div>
        {!auth.demo ? (
          <div className="login-card small">
            {mode === 'sign-in' ? (
              <p>
                {t('auth.noAccount')}{' '}
                <a href="#/sign-up" className="link-btn">
                  {t('auth.signUp')}
                </a>
              </p>
            ) : (
              <p>
                {t('auth.haveAccount')}{' '}
                <a href="#/sign-in" className="link-btn">
                  {t('auth.logIn')}
                </a>
              </p>
            )}
          </div>
        ) : null}
        <p className="login-note">{t('d.frame.sameAccount')}</p>
        <LegalLinks />
      </div>
    </main>
  );
}

/* ---------- a new account ---------- */

/**
 * A sign-in account made this recently is taken to be the one just created to get here, so it may be
 * deleted when its owner turns out to be under 13. An older one with no profile is only signed out.
 */
const NEW_ACCOUNT_MS = 15 * 60 * 1000;

type Stage = 'checking' | 'birthday' | 'profile' | 'minor' | 'child';

/**
 * Setting up a new account, as on the iPhone: the date of birth comes first (under 13 can't join,
 * and nothing is saved), then the name, username and photo with consent for information that may show
 * your faith. A member under 14 is then told once what that means for their account.
 */
export function Onboarding({ onDone }: { onDone: (p: Profile | null) => void }) {
  const auth = useAuth();
  const user = auth.user!;
  const guess = (user.username || user.email.split('@')[0] || user.name).toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 30);
  const [stage, setStage] = useState<Stage>('checking');
  const [parts, setParts] = useState<BirthParts>(EMPTY_BIRTH);
  const [born, setBorn] = useState<{ iso: string; age: number } | null>(null);
  const [username, setUsername] = useState(guess.length >= 3 ? guess : '');
  const [name, setName] = useState(user.name);
  const [photo, setPhoto] = useState<{ file: File; url: string } | null>(null);
  const [consent, setConsent] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [doc, setDoc] = useState('');

  // Someone on this computer said they were under 13 in the last day: going back doesn't get round it.
  useEffect(() => {
    isDeviceAgeBlocked().then((blocked) => setStage(blocked ? 'child' : 'birthday'));
  }, []);

  function birthdayNext() {
    const checked = checkBirthDate(parts);
    if ('error' in checked) return setErr(checked.error);
    setErr('');
    // Under 13 goes by the date where it is already latest in the world, as the server judges it.
    if (isUnder13(checked.iso)) {
      blockDeviceForAge();
      setStage('child');
      return;
    }
    setBorn(checked);
    setStage('profile');
  }

  async function create() {
    if (busy || !born) return;
    const u = username.trim().toLowerCase();
    if (!name.trim()) return setErr(t('d.frame.addName'));
    if (!/^[a-z0-9_]{3,30}$/.test(u)) return setErr(t('d.frame.usernameRule'));
    if (!consent) return setErr(t('legal.consentNeeded'));
    setBusy(true);
    setErr('');
    try {
      let avatar_url = user.imageUrl || '';
      if (photo) {
        rememberSize(photo.url, photo.file.size);
        const img = new Image();
        img.src = photo.url;
        await img.decode();
        avatar_url = (await uploadImage(user.id, photo.url, img.naturalWidth, 480)).url;
      }
      // Noted first, so the consent is still recorded if the window closes straight after.
      await noteConsentToRecord(user.id);
      await createProfile({ id: user.id, username: u, full_name: name.trim().slice(0, 80), avatar_url });
      // Never holds this up: if it doesn't reach the database now, the next start tries again.
      await recordConsentFor(user.id);
      // The birthday is kept apart from the profile, once the profile exists. If it doesn't save,
      // the app asks for it again after sign-in.
      await setBirthDate(user.id, born.iso).catch(() => {});
      if (born.age < MINOR_AGE) setStage('minor');
      else onDone(null);
    } catch (e) {
      setErr(errText(e));
      setBusy(false);
    }
  }

  async function leave() {
    setBusy(true);
    // The sign-in account just made to get here is closed too; an older one is only signed out.
    const clerkUser = window.Clerk?.user;
    const created = clerkUser?.createdAt ? new Date(clerkUser.createdAt).getTime() : 0;
    if (!auth.demo && clerkUser?.id === user.id && created && Date.now() - created < NEW_ACCOUNT_MS) {
      try {
        await clerkUser.delete();
      } catch {
        // Clerk may not allow it; nothing was saved in Community either way.
      }
    }
    await auth.signOut().catch(() => location.reload());
  }

  const logOut = (
    <button type="button" className="link-btn" onClick={() => auth.signOut()}>
      {t('settings.logOut')}
    </button>
  );

  if (stage === 'checking') return <main className="onboard" />;
  if (stage === 'child') {
    return (
      <main className="onboard">
        <div className="login-card st-onboard">
          <Wordmark />
          <CannotJoin action={t('age.backToStart')} onAction={leave} busy={busy} />
        </div>
      </main>
    );
  }
  if (stage === 'minor') {
    return (
      <main className="onboard">
        <div className="login-card st-onboard">
          <Wordmark />
          <h2>{t('d.frame.minorTitle')}</h2>
          <p className="muted-text">{t('d.frame.minorIntro')}</p>
          <MinorRules />
          <button className="btn block big" onClick={() => onDone(null)}>
            {t('age.continue')}
          </button>
        </div>
      </main>
    );
  }
  if (stage === 'birthday') {
    return (
      <main className="onboard">
        <form
          className="login-card st-onboard"
          onSubmit={(e) => {
            e.preventDefault();
            birthdayNext();
          }}
        >
          <Wordmark />
          <h2>{t('age.title')}</h2>
          <BirthDateInput value={parts} onChange={(p) => { setParts(p); if (err) setErr(''); }} error={err} note={t('age.why')} autoFocus />
          <button className="btn block big">{t('age.continue')}</button>
          {logOut}
        </form>
      </main>
    );
  }
  return (
    <main className="onboard">
      <form
        className="login-card st-onboard"
        onSubmit={(e) => {
          e.preventDefault();
          create();
        }}
      >
        <Wordmark />
        <h2>{t('d.frame.createProfile')}</h2>
        <p className="muted-text">{t('d.frame.pickUsername')}</p>
        <label className="st-photo-pick">
          <Avatar src={photo?.url ?? user.imageUrl} name={name || username || '?'} size={88} />
          <span className="link-btn">{photo ? t('d.frame.changePhoto') : t('d.frame.addPhoto')}</span>
          <input
            type="file"
            accept="image/*"
            hidden
            aria-label={t('d.frame.choosePhoto')}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) setPhoto({ file: f, url: URL.createObjectURL(f) });
            }}
          />
        </label>
        <input className="login-input" placeholder={t('d.frame.name')} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} aria-label={t('d.frame.name')} autoFocus />
        <input className="login-input" placeholder={t('d.frame.username')} value={username} onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s/g, ''))} maxLength={30} aria-label={t('d.frame.username')} />
        <label className="st-consent">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => {
              setConsent(e.target.checked);
              if (err === t('legal.consentNeeded')) setErr('');
            }}
            aria-label={t('legal.consentReligion', { privacy: t('legal.privacyLink') })}
          />
          <span>
            {withParts(t('legal.consentReligion'), {
              privacy: (
                <button type="button" className="link-btn inline" onClick={() => setDoc('privacy')}>
                  {t('legal.privacyLink')}
                </button>
              ),
            })}
          </span>
        </label>
        {err ? <p className="field-error">{err}</p> : null}
        <button className="btn block big" disabled={busy}>
          {busy ? t('d.frame.creating') : t('d.frame.next')}
        </button>
        <p className="st-agree">
          {withParts(t('legal.agreeSignUp'), {
            terms: (
              <button type="button" className="link-btn inline" onClick={() => setDoc('terms')}>
                {t('legal.termsLink')}
              </button>
            ),
            privacy: (
              <button type="button" className="link-btn inline" onClick={() => setDoc('privacy')}>
                {t('legal.privacyLink')}
              </button>
            ),
          })}
        </p>
        {logOut}
        {doc ? <LegalDialog doc={doc} onClose={() => setDoc('')} /> : null}
      </form>
    </main>
  );
}

/* ---------- deactivated or suspended ---------- */

export function Deactivated({ profile, onRestored }: { profile: Profile; onRestored: () => void }) {
  const auth = useAuth();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  return (
    <main className="onboard">
      <div className="login-card">
        <Wordmark />
        <h2>{t('d.frame.deactivatedTitle')}</h2>
        <p className="muted-text">
          {t('d.frame.deactivatedBody', { username: profile.username, date: purgeDate(profile.deleted_at!).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'long', year: 'numeric' }) })}
        </p>
        {err ? <p className="field-error">{err}</p> : null}
        <button
          className="btn block"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await restoreAccount(profile.id);
              onRestored();
            } catch (e) {
              setErr(errText(e));
              setBusy(false);
            }
          }}
        >
          {t('d.frame.restore')}
        </button>
        <button className="link-btn" onClick={() => auth.signOut()}>
          {t('settings.logOut')}
        </button>
      </div>
    </main>
  );
}

export function Suspended() {
  const auth = useAuth();
  const [doc, setDoc] = useState('');
  return (
    <main className="onboard">
      <div className="login-card">
        <Wordmark />
        <h2>{t('d.frame.suspendedTitle')}</h2>
        <p className="muted-text">{t('d.frame.suspendedBody')}</p>
        <button type="button" className="link-btn" onClick={() => setDoc('guidelines')}>
          {t('d.frame.readGuidelines')}
        </button>
        <button className="btn block" onClick={() => auth.signOut()}>
          {t('settings.logOut')}
        </button>
        {doc ? <LegalDialog doc={doc} onClose={() => setDoc('')} /> : null}
      </div>
    </main>
  );
}
