// Before the app: the log-in page (Instagram's desktop layout, with Clerk's own forms), choosing a
// username the first time, and the screens for deactivated or suspended accounts.
import React, { useEffect, useRef, useState } from 'react';
import { createProfile, purgeDate, restoreAccount } from 'shared/api';
import { errText } from 'shared/theme';
import type { Profile } from 'shared/types';
import { useAuth } from '../lib/auth';
import { Wordmark } from '../ui/sidebar';
import art1 from '../../../assets/auth-bg.jpg';
import art2 from '../../../assets/auth-church.jpg';
import art3 from '../../../assets/auth-bible.jpg';

const ART = [art1, art2, art3];

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
      </div>
    </main>
  );
}

export function Onboarding({ onDone }: { onDone: (p: Profile | null) => void }) {
  const auth = useAuth();
  const user = auth.user!;
  const guess = (user.username || user.email.split('@')[0] || user.name).toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 30);
  const [username, setUsername] = useState(guess.length >= 3 ? guess : '');
  const [name, setName] = useState(user.name);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <main className="onboard">
      <form
        className="login-card"
        onSubmit={async (e) => {
          e.preventDefault();
          const u = username.trim().toLowerCase();
          if (!name.trim()) return setErr('Add your name.');
          if (!/^[a-z0-9_]{3,30}$/.test(u)) return setErr('Usernames use 3 to 30 lowercase letters, numbers or underscores.');
          setBusy(true);
          setErr('');
          try {
            await createProfile({ id: user.id, username: u, full_name: name.trim().slice(0, 80), avatar_url: user.imageUrl || '' });
            onDone(null);
          } catch (e2) {
            setErr(errText(e2));
            setBusy(false);
          }
        }}
      >
        <Wordmark />
        <h2>Create your profile</h2>
        <p className="muted-text">Pick a username. It's how people find you, and you can change it later.</p>
        <input className="login-input" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} aria-label="Name" autoFocus />
        <input className="login-input" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s/g, ''))} maxLength={30} aria-label="Username" />
        {err ? <p className="field-error">{err}</p> : null}
        <button className="btn block" disabled={busy}>
          {busy ? 'Creating…' : 'Next'}
        </button>
        <button type="button" className="link-btn" onClick={() => auth.signOut()}>
          Log out
        </button>
      </form>
    </main>
  );
}

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
  return (
    <main className="onboard">
      <div className="login-card">
        <Wordmark />
        <h2>Your account is suspended</h2>
        <p className="muted-text">An admin has suspended this account. If you think this is a mistake, contact your church's Community admin.</p>
        <button className="btn block" onClick={() => auth.signOut()}>
          Log out
        </button>
      </div>
    </main>
  );
}
