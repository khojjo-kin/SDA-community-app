import React, { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ErrorNote, Loading, Screen, ScreenHeader } from '../../src/components/ui';
import { ERHA_ID, openThread } from '../../src/lib/api';
import { errText } from '../../src/lib/theme';

/**
 * Erha has her own account now, so "Erha" is simply the chat with that account. Older links (settings,
 * notifications) still come here: open the thread and carry on to it.
 */
export default function Erha() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setError('');
    openThread(ERHA_ID)
      .then((id) => { if (live) router.replace(`/chat/${id}`); })
      .catch((e) => { if (live) setError(errText(e)); });
    return () => {
      live = false;
    };
  }, [router, attempt]);

  return (
    <Screen>
      <ScreenHeader title="Erha" />
      {error ? <ErrorNote message={error} onRetry={() => setAttempt((n) => n + 1)} /> : <Loading />}
    </Screen>
  );
}
