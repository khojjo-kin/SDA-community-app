import React, { useState } from 'react';
import { AuthShell } from './AuthShell';
import { BirthDateInput, BirthParts, checkBirthDate, EMPTY_BIRTH } from './BirthDateForm';
import { DarkStatusBar } from './OnDark';
import { Button } from './ui';
import { isUnder13 } from '../lib/age';
import { useT } from '../lib/i18n';

/**
 * "Enter your date of birth": the first step of signing up, before an email, a password or Apple or
 * Google, and the first step of onboarding for anyone who came in through Apple or Google without
 * it. The boxes start empty (no grown-up date to accept) and nothing hints at the age that matters.
 * Nothing is sent anywhere from here: the screen using it decides what happens next.
 */
export function AgeStep({ onAdult, onChild, footer }: { onAdult: (iso: string, age: number) => void; onChild: () => void; footer?: React.ReactNode }) {
  const t = useT();
  const [parts, setParts] = useState<BirthParts>(EMPTY_BIRTH);
  const [err, setErr] = useState('');

  function next() {
    const checked = checkBirthDate(parts);
    if ('error' in checked) {
      setErr(checked.error);
      return;
    }
    setErr('');
    // Under 13 is judged by the date where it is already latest in the world, as the server does;
    // the age passed on (for the under-14 rules) is by the phone's own date.
    if (isUnder13(checked.iso)) onChild();
    else onAdult(checked.iso, checked.age);
  }

  return (
    <>
      {/* The sign-up pages sit on a photo and stay dark in every theme. */}
      <DarkStatusBar />
      <AuthShell title={t('age.title')} footer={footer}>
        <BirthDateInput dark value={parts} onChange={(p) => { setParts(p); if (err) setErr(''); }} error={err} note={t('age.why')} />
        <Button label={t('age.continue')} onPress={next} />
      </AuthShell>
    </>
  );
}
