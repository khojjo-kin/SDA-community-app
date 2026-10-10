// Birthdays, as on the iPhone (src/components/BirthDateForm.tsx and AgeGate.tsx): the three date
// boxes, the under-14 rules, the "sorry" card for under 13, and the one-time question for members
// who joined before birthdays were asked for.
import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ageFrom, fetchBirthDate, getProfile, MINOR_AGE, setBirthDate } from 'shared/api';
import { blockDeviceForAge, isDeviceAgeBlocked, isUnder13 } from 'shared/age';
import { retryConsentRecord } from 'shared/consent';
import { errText } from 'shared/theme';
import { Icon, type IconName, Modal } from '../ui/kit';
import { isPlaceholder } from './legal';
import { LEGAL_DETAILS } from './legal-docs.gen';
import '../styles/settings.css';

declare const __DEMO__: boolean;

/* ---------- the date itself ---------- */

export type BirthParts = { day: string; month: string; year: string };
export const EMPTY_BIRTH: BirthParts = { day: '', month: '', year: '' };

/** Shown under the boxes wherever the birthday is asked for. */
export const BIRTHDAY_NOTE = "This won't be on your profile. It's used to keep younger members safe.";

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Checks the three boxes: a real date, not in the future, and an age from 5 to 120. Returns the
 * date as YYYY-MM-DD with the age it gives, or what is wrong in a sentence. (The iPhone's rules.)
 */
export function checkBirthDate(p: BirthParts, now = new Date()): { iso: string; age: number } | { error: string } {
  if (!p.day || !p.month || !p.year) return { error: 'Add your birthday: day, month and year.' };
  if (p.year.length !== 4) return { error: 'Write the year in full, for example 2010.' };
  const d = Number(p.day);
  const m = Number(p.month);
  const y = Number(p.year);
  if (m < 1 || m > 12) return { error: 'The month is a number from 1 to 12.' };
  // Day 0 of the next month is the last day of this one, which also gets 29 February right.
  const days = new Date(y, m, 0).getDate();
  if (d < 1 || d > days) return { error: `That month only has ${days} days.` };
  if (new Date(y, m - 1, d).getTime() > now.getTime()) return { error: "That date hasn't happened yet." };
  const iso = `${y}-${pad(m)}-${pad(d)}`;
  const age = ageFrom(iso, now);
  if (age < 5) return { error: 'Check the year: members need to be at least 5.' };
  if (age > 120) return { error: 'Check the year: that would make you older than 120.' };
  return { iso, age };
}

/** Day / Month / Year as three number boxes. A full day or month moves on to the next box. */
export function BirthDateInput({ value, onChange, error, disabled, note = BIRTHDAY_NOTE, autoFocus }: { value: BirthParts; onChange: (next: BirthParts) => void; error?: string; disabled?: boolean; note?: string; autoFocus?: boolean }) {
  const month = useRef<HTMLInputElement>(null);
  const year = useRef<HTMLInputElement>(null);
  const digits = (t: string, max: number) => t.replace(/\D/g, '').slice(0, max);
  return (
    <div className="st-birth">
      <div className="st-birth-boxes">
        <label>
          <span>Day</span>
          <input
            value={value.day}
            placeholder="DD"
            inputMode="numeric"
            autoComplete="bday-day"
            aria-label="Birthday, day"
            disabled={disabled}
            autoFocus={autoFocus}
            onChange={(e) => {
              const day = digits(e.target.value, 2);
              onChange({ ...value, day });
              if (day.length === 2) month.current?.focus();
            }}
          />
        </label>
        <label>
          <span>Month</span>
          <input
            ref={month}
            value={value.month}
            placeholder="MM"
            inputMode="numeric"
            autoComplete="bday-month"
            aria-label="Birthday, month as a number"
            disabled={disabled}
            onChange={(e) => {
              const m = digits(e.target.value, 2);
              onChange({ ...value, month: m });
              if (m.length === 2) year.current?.focus();
            }}
          />
        </label>
        <label className="year">
          <span>Year</span>
          <input ref={year} value={value.year} placeholder="YYYY" inputMode="numeric" autoComplete="bday-year" aria-label="Birthday, year" disabled={disabled} onChange={(e) => onChange({ ...value, year: digits(e.target.value, 4) })} />
        </label>
      </div>
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
      {note ? <p className="st-birth-note">{note}</p> : null}
    </div>
  );
}

/* ---------- what an under-14 account means ---------- */

/** What changes for a member under 14: told to the member ("you"), or about them (Family centre). */
export const MINOR_RULES: { icon: IconName; you: string; them: string }[] = [
  { icon: 'lock', you: 'Your account stays private: only people you approve see your posts and stories.', them: 'The account stays private: only people they approve see their posts and stories.' },
  { icon: 'shield', you: 'Posts marked as sensitive are hidden from you.', them: 'Posts marked as sensitive are hidden from them.' },
  { icon: 'send', you: 'You can only message and call people you follow, and only people you follow can message or call you.', them: 'They can only message and call people they follow, and only people they follow can message or call them.' },
  { icon: 'info', you: "Live broadcasts, fundraisers and creator subscriptions aren't available.", them: "Live broadcasts, fundraisers and creator subscriptions aren't available." },
];

export function MinorRules({ you = true }: { you?: boolean }) {
  return (
    <ul className="st-rules">
      {MINOR_RULES.map((r) => (
        <li key={r.you}>
          <Icon name={r.icon} size={22} />
          <span>{you ? r.you : r.them}</span>
        </li>
      ))}
    </ul>
  );
}

/* ---------- under 13 ---------- */

/** "Sorry, you can't create an account" (or, once an account was closed for it, "…use Community yet"). */
export function CannotJoin({ closed, action, onAction, busy }: { closed?: boolean; action: string; onAction: () => void; busy?: boolean }) {
  const email = LEGAL_DETAILS.contact_email ?? '';
  return (
    <div className="st-sorry" role="alert">
      <h2>{closed ? "Sorry, you can't use Community yet" : "Sorry, you can't create an account"}</h2>
      <p>{closed ? 'Community is for people aged 13 and over, so this account has been closed. It and everything in it will be deleted within two days.' : "Community is for people aged 13 and over, so we can't make an account for you. Nothing you entered has been saved."}</p>
      <p className="st-sorry-small">
        Parent or guardian? If you think this is a mistake, email us at {isPlaceholder(email) ? email : <a href={'mailto:' + email}>{email}</a>}.
      </p>
      <button className="btn block big" onClick={onAction} disabled={busy}>
        {action}
      </button>
    </div>
  );
}

/** Signs out of the real app (deleting the sign-in account first when asked), or starts the demo again. */
export async function leaveAfterAgeCheck(deleteSignIn: boolean) {
  if (__DEMO__) {
    try {
      sessionStorage.removeItem('community.demoAs');
    } catch {
      // nothing kept
    }
    location.hash = '#/';
    location.reload();
    return;
  }
  const clerk = window.Clerk;
  // Only this account: another one signed in on this computer stays, and takes over (as on the iPhone).
  const current = clerk?.session?.id;
  const others: any[] = (clerk?.client?.activeSessions ?? []).filter((s: any) => s.id !== current);
  if (deleteSignIn) {
    try {
      await clerk?.user?.delete?.();
    } catch {
      // Clerk may not allow it; the profile is closed by the server all the same.
    }
  }
  try {
    if (others.length) {
      await clerk.signOut({ sessionId: current });
      await clerk.setActive({ session: others[0].id });
      location.hash = '#/';
      location.reload();
    } else await clerk?.signOut?.({ redirectUrl: location.origin + location.pathname });
  } catch {
    location.reload();
  }
}

/* ---------- the one-time question for existing members ---------- */

/** Accounts already asked in this session, so a slow reload of the profile never asks twice. */
const answered = new Set<string>();
const consentChecked = new Set<string>();

/** The signed-in account while the app itself (not the log-in page or onboarding) is on screen. */
function signedInId(): string | null {
  if (!document.querySelector('.shell')) return null;
  if (__DEMO__) return ((globalThis as any).__fakeMe as string) || 'demo_me';
  return window.Clerk?.user?.id ?? null;
}

/**
 * "Add your birthday": for a member whose profile says the app still needs it (needs_birth_date).
 * It can only be closed by answering. Under 14, it then says once what that means; under 13 the
 * server closes the account and the member is signed out.
 */
export function BirthdayQuestion({ me, onDone }: { me: string; onDone: () => void }) {
  const [parts, setParts] = useState<BirthParts>(EMPTY_BIRTH);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<'ask' | 'minor' | 'closed' | 'blocked'>('ask');

  async function save() {
    if (busy) return;
    const checked = checkBirthDate(parts);
    if ('error' in checked) return setErr(checked.error);
    setErr('');
    setBusy(true);
    try {
      if (await isDeviceAgeBlocked()) {
        // Someone on this computer said they were under 13 in the last day: no date given here counts.
        setStage('blocked');
        return;
      }
      await setBirthDate(me, checked.iso);
      answered.add(me);
      if (isUnder13(checked.iso)) {
        blockDeviceForAge();
        setStage('closed');
      } else if (checked.age < MINOR_AGE) setStage('minor');
      else onDone();
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal onClose={() => {}} closeOutside={false} className="st-birthday-modal">
      {stage === 'ask' ? (
        <form
          className="st-birthday"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <span className="st-birthday-icon">
            <Icon name="calendar" size={40} />
          </span>
          <h2>Add your birthday</h2>
          <p>We ask everyone for their birthday so Community can keep younger members safe.</p>
          <BirthDateInput value={parts} onChange={(p) => { setParts(p); if (err) setErr(''); }} error={err} disabled={busy} autoFocus />
          <button className="btn block big" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </form>
      ) : stage === 'minor' ? (
        <div className="st-birthday">
          <span className="st-birthday-icon">
            <Icon name="shield" size={40} />
          </span>
          <h2>Your account is set up for members under 14</h2>
          <p>To help keep you safe on Community:</p>
          <MinorRules />
          <button className="btn block big" onClick={onDone}>
            Continue
          </button>
        </div>
      ) : (
        <CannotJoin closed={stage === 'closed'} action="Log out" onAction={() => leaveAfterAgeCheck(stage === 'closed')} />
      )}
    </Modal>
  );
}

/** Watches who is signed in and asks for their birthday once if the app still needs it. */
function BirthdayWatch() {
  const [id, setId] = useState<string | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  useEffect(() => {
    const look = () => setId(signedInId());
    look();
    const t = setInterval(look, 1200);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!id) return setAsking(null);
    // Consent given at onboarding that didn't reach the database then is recorded now (as on the iPhone).
    if (!consentChecked.has(id)) {
      consentChecked.add(id);
      retryConsentRecord(id).catch(() => {});
    }
    if (answered.has(id)) return;
    let alive = true;
    (async () => {
      const p = await getProfile(id);
      if (!p || p.deleted_at || p.suspended) return;
      let needs = p.needs_birth_date === true;
      // The demo's stand-in database never says so; there, an account without a birthday on file is asked.
      if (!needs && __DEMO__) needs = (await fetchBirthDate(id)) === null;
      if (alive && needs) setAsking(id);
    })().catch(() => {});
    return () => {
      alive = false;
    };
  }, [id]);
  if (!asking || asking !== id) return null;
  return (
    <BirthdayQuestion
      me={asking}
      onDone={() => {
        answered.add(asking);
        setAsking(null);
      }}
    />
  );
}

// The question sits over the whole app, whatever page is open, so it has a root of its own beside
// the app's (main.tsx belongs to the app frame).
const host = document.createElement('div');
host.id = 'birthday-question';
document.body.appendChild(host);
createRoot(host).render(<BirthdayWatch />);
