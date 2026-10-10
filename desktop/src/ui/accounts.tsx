// "Switch accounts": every account signed in on this computer, and a way to add another, as on the
// iPhone (up to five).
import React, { useState } from 'react';
import { MAX_ACCOUNTS, useAuth } from '../lib/auth';
import { useMe } from '../lib/me';
import { Avatar, Icon, Modal, toast, toastError } from './kit';

declare const __DEMO__: boolean;

export function AccountSwitcher({ onClose }: { onClose: () => void }) {
  const auth = useAuth();
  const { me } = useMe();
  const [busy, setBusy] = useState('');
  return (
    <Modal title="Switch accounts" onClose={onClose} className="switcher">
      <div className="switch-list">
        {auth.accounts.map((a) => (
          <button
            key={a.sessionId}
            className="switch-row"
            disabled={!!busy}
            aria-current={a.current ? 'true' : undefined}
            onClick={async () => {
              if (a.current) return onClose();
              setBusy(a.sessionId);
              try {
                await auth.switchTo(a.sessionId);
              } catch (e) {
                setBusy('');
                toastError(e);
              }
            }}
          >
            <Avatar src={a.current ? me.avatar_url || a.imageUrl : a.imageUrl} name={a.username} size={56} />
            <span className="row-text">
              <b>{a.current ? me.username : a.username}</b>
              {a.name ? <span>{a.current ? me.full_name : a.name}</span> : null}
            </span>
            {a.current ? (
              <span className="check-dot" aria-label="In use">
                <Icon name="check" size={16} stroke={3} />
              </span>
            ) : busy === a.sessionId ? (
              <span className="muted-text small">Switching…</span>
            ) : null}
          </button>
        ))}
      </div>
      <button
        className="switch-add"
        onClick={() => {
          if (__DEMO__) return toast('In the demo, switch between the two sample accounts above.');
          if (auth.accounts.length >= MAX_ACCOUNTS) return toast(`You can add up to ${MAX_ACCOUNTS} accounts.`);
          onClose();
          auth.addAccount();
        }}
      >
        Log in to an existing account
      </button>
    </Modal>
  );
}
