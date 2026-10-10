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
import { rememberSize } from '../shims/expo-file-system';
import { Avatar } from '../ui/kit';
import { Wordmark } from '../ui/sidebar';
import { LegalDialog } from './legal';
import { BirthDateInput, CannotJoin, EMPTY_BIRTH, MinorRules, checkBirthDate, type BirthParts } from './settings-birthday';
import art1 from '../../../assets/auth-bg.jpg';
import art2 from '../../../assets/auth-church.jpg';
import art3 from '../../../assets/auth-bible.jpg';

const ART = [art1, art2, art3];

/** Links to the policies, opening them over the page. */
function LegalLinks() {
  const [doc, setDoc] = useState('');
  const links: [string, string][] = [
    ['terms', 'Terms'],
    ['privacy', 'Privacy'],
    ['guidelines', 'Community guidelines'],
    ['child-safety', 'Child safety'],
  ];
  return (
    <nav className="st-login-links" aria-label="Policies">
      {links.map(([id, label]) => (
        <button key={id} type="button" onClick={() => setDoc(id)}>
          {label}
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
          <p className="login-tag">See photos and videos from your church family.</p>
          {auth.error ? (
            <div className="login-error">
              <b>Can't reach the sign-in service</b>
              <p>{auth.error}</p>
              <button className="btn" onClick={() => location.reload()}>
                Try again
              </button>
            </div>
          ) : auth.demo ? (
            <div className="demo-login">
              <p>This is the demo. It runs on sample people and photos, and nothing is saved.</p>
              <button className="btn block" onClick={auth.demoSignIn}>
                Log in to the demo
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
                Don't have an account?{' '}
                <a href="#/sign-up" className="link-btn">
                  Sign up
                </a>
              </p>
            ) : (
              <p>
                Have an account?{' '}
                <a href="#/sign-in" className="link-btn">
                  Log in
                </a>
              </p>
            )}
          </div>
        ) : null}
        <p className="login-note">The same account works in the Community app on iPhone.</p>
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
    if (!name.trim()) return setErr('Add your name.');
    if (!/^[a-z0-9_]{3,30}$/.test(u)) return setErr('Usernames use 3 to 30 lowercase letters, numbers or underscores.');
    if (!consent) return setErr('Tick the box about your religious beliefs to continue.');
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
      Log out
    </button>
  );

  if (stage === 'checking') return <main className="onboard" />;
  if (stage === 'child') {
    return (
      <main className="onboard">
        <div className="login-card st-onboard">
          <Wordmark />
          <CannotJoin action="Back to the start" onAction={leave} busy={busy} />
        </div>
      </main>
    );
  }
  if (stage === 'minor') {
    return (
      <main className="onboard">
        <div className="login-card st-onboard">
          <Wordmark />
          <h2>Your account is set up for members under 14</h2>
          <p className="muted-text">To help keep you safe on Community:</p>
          <MinorRules />
          <button className="btn block big" onClick={() => onDone(null)}>
            Continue
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
          <h2>Enter your date of birth</h2>
          <BirthDateInput value={parts} onChange={(p) => { setParts(p); if (err) setErr(''); }} error={err} note="We ask everyone, to keep younger members safe. It won't be shown on your profile." autoFocus />
          <button className="btn block big">Continue</button>
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
        <h2>Create your profile</h2>
        <p className="muted-text">Pick a username. It's how people find you, and you can change it later.</p>
        <label className="st-photo-pick">
          <Avatar src={photo?.url ?? user.imageUrl} name={name || username || '?'} size={88} />
          <span className="link-btn">{photo ? 'Change photo' : 'Add a photo'}</span>
          <input
            type="file"
            accept="image/*"
            hidden
            aria-label="Choose a profile photo"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) setPhoto({ file: f, url: URL.createObjectURL(f) });
            }}
          />
        </label>
        <input className="login-input" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} aria-label="Name" autoFocus />
        <input className="login-input" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s/g, ''))} maxLength={30} aria-label="Username" />
        <label className="st-consent">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => {
              setConsent(e.target.checked);
              if (err.startsWith('Tick the box')) setErr('');
            }}
            aria-label="I agree Community may use info that shows my faith, as in the Privacy Policy."
          />
          <span>
            I agree Community may use info that shows my faith, as in the{' '}
            <button type="button" className="link-btn inline" onClick={() => setDoc('privacy')}>
              Privacy Policy
            </button>
            .
          </span>
        </label>
        {err ? <p className="field-error">{err}</p> : null}
        <button className="btn block big" disabled={busy}>
          {busy ? 'Creating…' : 'Next'}
        </button>
        <p className="st-agree">
          By continuing you agree to our{' '}
          <button type="button" className="link-btn inline" onClick={() => setDoc('terms')}>
            Terms
          </button>{' '}
          and{' '}
          <button type="button" className="link-btn inline" onClick={() => setDoc('privacy')}>
            Privacy Policy
          </button>
          .
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
        <h2>Your account is deactivated</h2>
        <p className="muted-text">
          @{profile.username} will be deleted for good on {purgeDate(profile.deleted_at!).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}. Restore it to bring back your profile, posts and messages.
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
          Restore my account
        </button>
        <button className="link-btn" onClick={() => auth.signOut()}>
          Log out
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
        <h2>Your account is suspended</h2>
        <p className="muted-text">An admin has suspended this account, usually for something that goes against the Community guidelines. If you think this is a mistake, contact your church's Community admin.</p>
        <button type="button" className="link-btn" onClick={() => setDoc('guidelines')}>
          Read the Community guidelines
        </button>
        <button className="btn block" onClick={() => auth.signOut()}>
          Log out
        </button>
        {doc ? <LegalDialog doc={doc} onClose={() => setDoc('')} /> : null}
      </div>
    </main>
  );
}
