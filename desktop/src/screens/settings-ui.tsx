// Small pieces every settings page uses: the page heading, switches, choices, rows and the Plus
// upsell, drawn with the desktop's colours (styles/settings.css). The settings pages save through
// the iPhone app's shared api.ts, so a change here shows on the phone too.
import React, { useEffect, useState } from 'react';
import { updateProfile } from 'shared/api';
import type { Profile } from 'shared/types';
import { useMe } from '../lib/me';
import { nav } from '../lib/router';
import { Avatar, Icon, type IconName, Link, Verified, toastError } from '../ui/kit';
import '../styles/settings.css';

/* ---------- icons the shared set doesn't have ---------- */

const EXTRA: Record<string, string> = {
  flame: '<path d="M12 21c-3.6 0-6.2-2.5-6.2-6 0-2.6 1.5-4.4 3-6 .6 1.6 1.6 2.6 2.7 3 0-3.4 1.6-6.2 4-8 .2 2.6 1.4 4.3 2.6 5.8.9 1.2 1.6 2.5 1.6 4.4 0 4.2-3 6.8-7.7 6.8z"/>',
  devices: '<rect x="2.5" y="5" width="13" height="10" rx="1.6"/><path d="M6 19h6M9 15v4"/><rect x="17" y="8" width="5" height="11" rx="1.3"/>',
  access: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="7.4" r="1.3"/><path d="M7.5 10.2 12 11l4.5-.8M12 11v3.2l-2.2 4.2M12 14.2l2.2 4.2"/>',
  external: '<path d="M7 17 17 7M9 7h8v8"/>',
  family: '<path d="M3.5 11 12 4l8.5 7"/><path d="M5.5 9.5V20h13V9.5"/><circle cx="10" cy="12.6" r="1.6"/><circle cx="14.4" cy="13.6" r="1.2"/><path d="M7.6 20v-1.6a2.4 2.4 0 0 1 4.8 0V20M12.8 20v-1.2a1.6 1.6 0 0 1 3.2 0V20"/>',
  counts: '<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z"/><path d="M4 4l16 16"/>',
  status: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
  shop: '<path d="M4 9.5 5.5 4h13L20 9.5"/><path d="M4 9.5c0 1.5 1.2 2.5 2.7 2.5s2.6-1 2.6-2.5c0 1.5 1.2 2.5 2.7 2.5s2.7-1 2.7-2.5c0 1.5 1.1 2.5 2.6 2.5S20 11 20 9.5"/><path d="M5.5 12v8h13v-8M10 20v-4.5h4V20"/>',
};
export type SIconName = IconName | keyof typeof EXTRA;

/** An icon from the shared set, or one of the few drawn here. */
export function SIcon({ name, size = 24, stroke = 1.8 }: { name: SIconName; size?: number; stroke?: number }) {
  if (!(name in EXTRA)) return <Icon name={name as IconName} size={size} stroke={stroke} />;
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: EXTRA[name] }} />;
}

/* ---------- page and blocks ---------- */

/** One settings page on the right: a large heading, an optional line under it, then the page. */
export function Page({ title, intro, children, wide }: { title: string; intro?: React.ReactNode; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={'st-page' + (wide ? ' wide' : '')}>
      <h1 className="st-title">{title}</h1>
      {intro ? <p className="st-intro">{intro}</p> : null}
      {children}
    </div>
  );
}

/** A group on a page with a bold heading, as Instagram's "Website", "Bio" and "Gender". */
export function Block({ title, note, children, action }: { title?: React.ReactNode; note?: React.ReactNode; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="st-block">
      {title || action ? (
        <div className="st-block-head">
          {title ? <h2>{title}</h2> : <span />}
          {action}
        </div>
      ) : null}
      {children}
      {note ? <p className="st-note">{note}</p> : null}
    </section>
  );
}

/** A rounded box holding rows. */
export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={'st-card' + (className ? ' ' + className : '')}>{children}</div>;
}

/* ---------- switches and choices ---------- */

/** The app's switch: a real checkbox (role switch) over the drawn track, so keyboards and screen readers work. */
export function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: (next: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <label className={'st-toggle' + (disabled ? ' disabled' : '')}>
      <input type="checkbox" role="switch" aria-label={label} aria-checked={on} checked={on} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <i className="switch" aria-hidden="true" />
    </label>
  );
}

/** A line with words on the left and a switch on the right. */
export function ToggleRow({ title, sub, on, onChange, disabled, icon }: { title: string; sub?: React.ReactNode; on: boolean; onChange: (next: boolean) => void; disabled?: boolean; icon?: SIconName }) {
  return (
    <div className="st-row">
      {icon ? <span className="st-row-icon"><SIcon name={icon} /></span> : null}
      <span className="st-row-text">
        <b>{title}</b>
        {sub ? <span>{sub}</span> : null}
      </span>
      <Toggle on={on} onChange={onChange} label={title} disabled={disabled} />
    </div>
  );
}

/** One of a few choices, as a line with a round mark. */
export function RadioRow({ name, title, sub, checked, onChange, icon, disabled }: { name: string; title: string; sub?: React.ReactNode; checked: boolean; onChange: () => void; icon?: SIconName; disabled?: boolean }) {
  return (
    <label className={'st-row st-choice' + (checked ? ' on' : '') + (disabled ? ' disabled' : '')}>
      {icon ? <span className="st-row-icon"><SIcon name={icon} /></span> : null}
      <span className="st-row-text">
        <b>{title}</b>
        {sub ? <span>{sub}</span> : null}
      </span>
      <input type="radio" className="st-radio" name={name} checked={checked} disabled={disabled} onChange={onChange} aria-label={title} />
    </label>
  );
}

/** A line that opens something: another settings page, a page of the app, or an outside address. */
export function LinkRow({ icon, title, sub, value, to, onClick, external, testId }: { icon?: SIconName; title: string; sub?: React.ReactNode; value?: React.ReactNode; to?: string; onClick?: () => void; external?: boolean; testId?: string }) {
  const body = (
    <>
      {icon ? <span className="st-row-icon"><SIcon name={icon} /></span> : null}
      <span className="st-row-text">
        <b>{title}</b>
        {sub ? <span>{sub}</span> : null}
      </span>
      {value !== undefined ? <span className="st-row-value">{value}</span> : null}
      <span className="st-row-go">{external ? <SIcon name="external" size={18} /> : <Icon name="right" size={16} stroke={2} />}</span>
    </>
  );
  if (to) {
    return (
      <Link to={to} className="st-row st-link" onClick={onClick}>
        {body}
      </Link>
    );
  }
  return (
    <button type="button" className="st-row st-link" onClick={onClick} data-testid={testId}>
      {body}
    </button>
  );
}

/** A person in a list: picture, username with tick, a line under it, and something on the right. */
export function PersonRow({ p, sub, right, onOpen }: { p: Pick<Profile, 'username' | 'full_name' | 'avatar_url' | 'verified'> | null; sub?: React.ReactNode; right?: React.ReactNode; onOpen?: boolean }) {
  const name = p?.username ?? 'Account unavailable';
  return (
    <div className="st-row st-person">
      <Avatar src={p?.avatar_url} name={name} size={44} onClick={p && onOpen !== false ? () => nav('/u/' + p.username) : undefined} />
      <span className="st-row-text">
        {p ? (
          <Link to={'/u/' + p.username} className="uname">
            {name}
            {p.verified ? <Verified size={12} /> : null}
          </Link>
        ) : (
          <b>{name}</b>
        )}
        <span>{sub ?? p?.full_name}</span>
      </span>
      {right}
    </div>
  );
}

/** For a Community Plus perk, when you don't have Plus. */
export function PlusUpsell({ title, body }: { title: string; body: string }) {
  return (
    <div className="st-upsell">
      <span className="st-upsell-icon">
        <Icon name="crown" size={26} />
      </span>
      <div>
        <b>{title}</b>
        <p>{body}</p>
      </div>
      <Link to="/plus" className="btn">
        Get Community Plus
      </Link>
    </div>
  );
}

/** A short boxed notice with an icon. */
export function Notice({ icon = 'info', children }: { icon?: SIconName; children: React.ReactNode }) {
  return (
    <div className="st-notice">
      <SIcon name={icon} size={20} />
      <div>{children}</div>
    </div>
  );
}

/* ---------- saving a switch on the profile ---------- */

type Flag = 'is_private' | 'show_activity' | 'streaks_enabled' | 'show_view_counts' | 'read_receipts';

/**
 * A yes/no on my profile, shown changed at once and put back if the save fails, as on the iPhone.
 * Returns the value to show and a function that changes it.
 */
export function useProfileFlag(flag: Flag): [boolean, (next: boolean) => void] {
  const { me, refresh } = useMe();
  // Private is off unless set; the others are on unless turned off.
  const saved = flag === 'is_private' ? !!me.is_private : me[flag] !== false;
  const [value, setValue] = useState(saved);
  useEffect(() => setValue(saved), [saved]);
  const set = (next: boolean) => {
    const before = value;
    setValue(next);
    updateProfile(me.id, { [flag]: next } as Partial<Record<Flag, boolean>>).then(
      () => refresh().catch(() => {}),
      (e) => {
        setValue(before);
        toastError(e);
      },
    );
  };
  return [value, set];
}

/** "14 May 1994" from YYYY-MM-DD, without time zones moving the day. */
export function longDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}
