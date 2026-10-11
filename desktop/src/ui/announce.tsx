// The announcement admins publish from the console (service times, maintenance, events), as a plain
// line of words above the page (no box, as the iPhone now sets such lines). Each one can be closed,
// and stays closed on this computer.
import React, { useEffect, useState } from 'react';
import { type Announcement, liveAnnouncements } from '../lib/admin';
import { t } from '../lib/i18n';
import { Icon } from './kit';
import '../styles/polish.css';

const KEY = 'community.dismissedAnnouncements';
const readDismissed = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]');
  } catch {
    return [];
  }
};

export function AnnouncementBar() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [hidden, setHidden] = useState<string[]>(readDismissed);
  useEffect(() => {
    let gone = false;
    const load = () => liveAnnouncements().then((a) => !gone && setItems(a));
    load();
    const t = setInterval(load, 5 * 60e3);
    return () => {
      gone = true;
      clearInterval(t);
    };
  }, []);
  const shown = items.filter((a) => !hidden.includes(a.id));
  if (!shown.length) return null;
  const a = shown[0];
  return (
    <div className={'announce bar ' + a.level} role="status">
      <Icon name={a.level === 'warning' ? 'info' : a.level === 'success' ? 'sparkle' : 'bell'} size={18} />
      <div className="grow">
        <b>{a.title}</b>
        {a.body ? <span> {a.body}</span> : null}
      </div>
      <button
        className="icon-btn"
        aria-label={t('d.frame.closeAnnouncement')}
        onClick={() => {
          const next = [...hidden, a.id].slice(-50);
          setHidden(next);
          try {
            localStorage.setItem(KEY, JSON.stringify(next));
          } catch {
            // Private window: it stays closed until the app restarts.
          }
        }}
      >
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}
