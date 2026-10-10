// "Switch accounts": every account signed in on this computer, and a way to add another, as on the
// iPhone (up to five).
import React, { useState } from 'react';
import { MAX_ACCOUNTS, useAuth } from '../lib/auth';
import { t } from '../lib/i18n';
import { useMe } from '../lib/me';
import { Avatar, Icon, Modal, toast, toastError } from './kit';

declare const __DEMO__: boolean;

export function AccountSwitcher({ onClose }: { onClose: () => void }) {
  const auth = useAuth();
  const { me } = useMe();
  const [busy, setBusy] = useState('');
  return (
    <Modal title={t('accounts.switchHint')} onClose={onClose} className="switcher">
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
              <span className="check-dot" aria-label={t('d.frame.inUse')}>
                <Icon name="check" size={16} stroke={3} />
              </span>
            ) : busy === a.sessionId ? (
              <span className="muted-text small">{t('d.frame.switching')}</span>
            ) : null}
          </button>
        ))}
      </div>
      <button
        className="switch-add"
        onClick={() => {
          if (__DEMO__) return toast(t('d.frame.demoSwitch'));
          if (auth.accounts.length >= MAX_ACCOUNTS) return toast(t('d.frame.accountLimit', { count: MAX_ACCOUNTS }));
          onClose();
          auth.addAccount();
        }}
      >
        {t('d.frame.addExisting')}
      </button>
    </Modal>
  );
}
