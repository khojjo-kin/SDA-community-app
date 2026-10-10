import React from 'react';
import { Redirect } from 'expo-router';
import { BirthDateGate, useBirthDateGate } from '../../src/components/BirthDateForm';
import { useSession } from '../../src/lib/session';

/**
 * A deep link to the birthday step. The app layout already shows the step in place of everything
 * else while it is needed, so this only ever lands there; once the birthday is given it goes home.
 */
export default function BirthDate() {
  const { me, profile } = useSession();
  const needed = useBirthDateGate(me, profile);
  if (!needed) return <Redirect href="/" />;
  return <BirthDateGate />;
}
