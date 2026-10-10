// Pieces of a profile page: the big picture with its story ring, the bio with links and @mentions,
// About this account, the bell's notification switches, the fundraiser card and the lives planned
// ahead. The iPhone app's versions (src/components/ProfileView.tsx, FundraiserCard.tsx and
// LiveSchedule.tsx) are the reference for what each one does and says.
import React, { useEffect, useRef, useState } from 'react';
import { activeLabel, cancelLiveSchedule, fetchFollowAlerts, fetchFundraiser, fetchLiveSchedules, hasLiveReminder, setFollowAlerts, setLiveReminder } from 'shared/api';
import { listen } from 'shared/store';
import { CLOSE_RING, dayLabel } from 'shared/theme';
import { ringColors } from 'shared/styling';
import type { FollowAlerts, Fundraiser, LiveSchedule, Profile } from 'shared/types';
import { dateLocale, languageCode, t, tSplit, tn } from '../lib/i18n';
import { useMe } from '../lib/me';
import { money } from '../lib/pay';
import { nav } from '../lib/router';
import { Avatar, Icon, type IconName, Link, Modal, Spinner, Verified, ask, toast, toastError, useOutside } from './kit';
import { NoteBubble } from './notes';
import { ringVar } from './profile-style';
import '../styles/profile.css';

/* ---------- the picture ---------- */

export type PictureRing = 'live' | 'story' | 'close' | 'seen' | null;

/**
 * The profile picture (150 points) with its ring: the member's ring colour (Plus) for a new story,
 * blue for close friends, a thin grey ring once seen, red with LIVE while broadcasting. The Note
 * bubble sits over its top-left corner, as on Instagram.
 */
export function ProfilePicture({ person, mine, ring, onClick, label }: { person: Profile; mine: boolean; ring: PictureRing; onClick?: () => void; label: string }) {
  const colors = ring === 'story' ? ringColors(person.ring_color) : ring === 'close' ? CLOSE_RING : null;
  const body = (
    <span className={'prof-ring' + (ring ? ' on ' + ring : '')} style={ringVar(colors)}>
      <Avatar src={person.avatar_url} name={person.username} size={150} />
    </span>
  );
  return (
    <div className="prof-pic">
      {onClick ? (
        <button type="button" className="prof-pic-btn" onClick={onClick} aria-label={label}>
          {body}
        </button>
      ) : (
        <span role="img" aria-label={label}>
          {body}
        </span>
      )}
      {ring === 'live' ? <span className="live-badge big prof-live">{t('common.live')}</span> : null}
      <div className="prof-note">
        <NoteBubble userId={person.id} mine={mine} />
      </div>
    </div>
  );
}

/* ---------- bio ---------- */

/** The bio with web addresses as links and @usernames as links to their profiles. */
export function BioText({ text }: { text: string }) {
  const parts = text.split(/((?:https?:\/\/|www\.)[^\s]+|@[a-z0-9._]{3,30})/i);
  return (
    <>
      {parts.map((p, i) => {
        if (/^(https?:\/\/|www\.)/i.test(p)) {
          const href = /^https?:\/\//i.test(p) ? p : 'https://' + p;
          return (
            <a key={i} className="prof-link" href={href} target="_blank" rel="noreferrer">
              {p.replace(/^https?:\/\//i, '')}
            </a>
          );
        }
        if (/^@[a-z0-9._]{3,30}$/i.test(p)) {
          return (
            <Link key={i} to={'/u/' + p.slice(1).toLowerCase()} className="prof-link">
              {p}
            </Link>
          );
        }
        return <React.Fragment key={i}>{p}</React.Fragment>;
      })}
    </>
  );
}

/* ---------- About this account ---------- */

function AboutRow({ icon, title, value }: { icon: React.ReactNode; title: string; value?: string }) {
  return (
    <div className="prof-about-row">
      <span className="prof-about-icon">{icon}</span>
      <span className="prof-about-text">
        <b>{title}</b>
        {value ? <span>{value}</span> : null}
      </span>
    </div>
  );
}

/**
 * When someone was last about, in the app's language. The shared activeLabel says it in English
 * ("Active now", "Active 5m ago", "Active 3h ago", "Active yesterday"); each of those is said again here.
 */
function activeText(at: string | null | undefined): string {
  const english = activeLabel(at);
  if (english === 'Active now') return t('common.activeNow');
  if (english === 'Active yesterday') return t('d.profile.activeYesterday');
  const ago = /^Active (\d+)([mh]) ago$/.exec(english);
  if (ago) return t(ago[2] === 'm' ? 'd.profile.activeMinutes' : 'd.profile.activeHours', { count: ago[1] });
  return english;
}

/** "9 Sep" in English, as the app has always written it; the language's own day and short month otherwise. */
export function shortDay(d: Date): string {
  return languageCode() === 'en' ? dayLabel(d) : d.toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' });
}

/** When the account joined, where it's based, how it was verified, its type and when it was last about. */
export function AboutAccount({ person, onClose }: { person: Profile; onClose: () => void }) {
  const joined = new Date(person.created_at);
  const how = person.verified_via === 'notable' ? t('profile.verifiedNotable') : person.verified_via === 'plus' ? t('profile.verifiedPlus') : t('common.verified');
  const why = person.verified_via === 'notable' ? t('profile.verifiedWhyNotable') : person.verified_via === 'plus' ? t('profile.verifiedWhyPlus') : t('profile.verifiedWhy');
  const active = activeText(person.active_at);
  const type = person.account_type === 'creator' ? t('d.profile.creatorAccount') + (person.category ? ' · ' + person.category : '') : t('d.profile.personalAccount');
  return (
    <Modal title={t('profile.about')} onClose={onClose} className="prof-about">
      <div className="prof-about-top">
        <Avatar src={person.avatar_url} name={person.username} size={76} />
        <b className="prof-about-name">
          {person.username}
          {person.verified ? <Verified size={14} /> : null}
        </b>
        <p className="muted-text">{t('profile.aboutIntro')}</p>
      </div>
      <div className="prof-about-list">
        {Number.isNaN(joined.getTime()) ? null : <AboutRow icon={<Icon name="calendar" size={22} />} title={t('profile.dateJoined')} value={joined.toLocaleDateString(dateLocale(), { month: 'long', year: 'numeric' })} />}
        {person.country ? <AboutRow icon={<Icon name="location" size={22} />} title={t('profile.basedIn')} value={person.country} /> : null}
        {person.verified ? <AboutRow icon={<Verified size={22} />} title={how} value={why} /> : null}
        <AboutRow icon={<Icon name="user" size={22} />} title={t('d.profile.accountType')} value={type} />
        {active ? <AboutRow icon={<Icon name="clock" size={22} />} title={t('profile.activeStatus')} value={active} /> : null}
      </div>
    </Modal>
  );
}

/* ---------- the bell ---------- */

/** `word` is the key of the switch's name, said with t() where it is drawn. */
const ALERTS: { key: keyof FollowAlerts; word: string; icon: IconName }[] = [
  { key: 'posts', word: 'profile.alertsPosts', icon: 'grid' },
  { key: 'stories', word: 'profile.alertsStories', icon: 'story' },
  { key: 'clips', word: 'profile.alertsClips', icon: 'reels' },
  { key: 'live', word: 'profile.alertsLive', icon: 'live' },
];

/**
 * The bell next to the buttons of someone you follow: a menu with a switch for each kind of
 * notification from them. Each change is saved straight away, one after another.
 */
export function AlertsBell({ person, onChange }: { person: Profile; onChange: (anyOn: boolean) => void }) {
  const { me } = useMe();
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState<FollowAlerts | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  useOutside(box, () => setOpen(false), open);

  useEffect(() => {
    if (!open) return;
    let live = true;
    setAlerts(null);
    fetchFollowAlerts(me.id, person.id).then(
      (a) => live && setAlerts(a),
      (e) => {
        toastError(e);
        setOpen(false);
      },
    );
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', key);
    return () => {
      live = false;
      document.removeEventListener('keydown', key);
    };
  }, [open, person.id]);

  const set = (key: keyof FollowAlerts, value: boolean) => {
    if (!alerts) return;
    const next = { ...alerts, [key]: value };
    setAlerts(next);
    onChange(Object.values(next).some(Boolean));
    queue.current = queue.current
      .then(() => setFollowAlerts(me.id, person.id, next))
      .catch(async (e) => {
        toastError(e);
        // Show what the server really has rather than guessing which change failed.
        try {
          const truth = await fetchFollowAlerts(me.id, person.id);
          setAlerts(truth);
          onChange(Object.values(truth).some(Boolean));
        } catch {
          // Still offline: the switches keep what was asked for.
        }
      });
  };

  const on = person.alerts_on;
  return (
    <div className="prof-bell" ref={box}>
      <button className={'prof-btn square' + (on ? ' lit' : '')} aria-label={on ? t('profile.alertsOn', { username: person.username }) : t('profile.alertsTitle', { username: person.username })} aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name="bell" size={20} fill={on ? 'currentColor' : undefined} stroke={on ? 1.4 : 1.8} />
      </button>
      {open ? (
        <div className="prof-alerts" role="dialog" aria-label={t('profile.alertsTitle', { username: person.username })}>
          <b className="prof-alerts-title">{t('profile.alertsTitle', { username: person.username })}</b>
          {alerts ? (
            ALERTS.map((r) => (
              <label key={r.key} className="prof-alert-row">
                <Icon name={r.icon} size={20} />
                <span className="grow">{t(r.word)}</span>
                <input type="checkbox" role="switch" checked={alerts[r.key]} onChange={(e) => set(r.key, e.target.checked)} aria-label={t('profile.alertsFrom', { what: t(r.word), username: person.username })} />
                <i className="switch" aria-hidden="true" />
              </label>
            ))
          ) : (
            <div className="prof-alerts-wait">
              <Spinner size={22} />
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

/* ---------- fundraiser ---------- */

/** True once a fundraiser has been ended by its owner or its end date has passed. */
function hasEnded(f: Fundraiser): boolean {
  return f.status === 'closed' || (!!f.ends_at && new Date(f.ends_at) <= new Date());
}

/** The fundraiser the account is running: title, progress, raised of goal and Donate. Nothing once it has ended. */
export function FundraiserCard({ id }: { id: string }) {
  const [f, setF] = useState<Fundraiser | null>(null);
  useEffect(() => {
    let live = true;
    setF(null);
    const load = () => {
      fetchFundraiser(id).then(
        (r) => live && setF(r),
        // The card is extra on a profile: if it cannot load, the profile simply goes without it.
        () => {},
      );
    };
    load();
    // A gift or an edit announces 'profile': keep the total up to date.
    const off = listen('profile', load);
    return () => {
      live = false;
      off();
    };
  }, [id]);
  if (!f || hasEnded(f)) return null;
  const share = f.goal_pence > 0 ? Math.min(1, Math.max(0, f.raised_pence / f.goal_pence)) : 0;
  // Any gift shows at least a sliver, so a first £5 is visible.
  const pct = share > 0 ? Math.max(2, Math.round(share * 100)) : 0;
  const raised = money(f.raised_pence, f.currency);
  const goal = money(f.goal_pence, f.currency);
  // "£120 raised of £500", with the amount raised in bold.
  const [raisedBefore, raisedAfter] = tSplit('d.profile.raisedOf', 'raised', { goal });
  return (
    <div className="prof-card prof-fund">
      <button className="prof-card-main" onClick={() => nav('/fundraisers/' + f.id)} aria-label={t('d.profile.fundraiserLabel', { title: f.title, raised, goal })}>
        <span className="prof-card-icon accent">
          <Icon name="heart" size={20} />
        </span>
        <span className="prof-card-text">
          <b>{f.title}</b>
          <span className="prof-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(share * 100)}>
            <i style={{ width: pct + '%' }} />
          </span>
          <span className="prof-card-sub">
            {raisedBefore}
            <b>{raised}</b>
            {raisedAfter}
            {f.donor_count ? ' · ' + tn('d.profile.supporters', f.donor_count, { count: f.donor_count }) : ''}
          </span>
        </span>
      </button>
      <button className="prof-btn primary small" onClick={() => nav('/fundraisers/' + f.id)}>
        {t('liveSetup.donate')}
      </button>
    </div>
  );
}

/* ---------- lives planned ahead ---------- */

const DAY = 86400e3;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/**
 * "Today 7:30 pm", "Tomorrow 9:00 am", "Sat 7:30 pm" within the week, then "Sat 12 Oct 7:30 pm". In
 * other languages the weekday, date and time are written the language's own way.
 */
export function whenLabel(iso: string): string {
  const d = new Date(iso);
  const days = Math.round((startOfDay(d) - startOfDay(new Date())) / DAY);
  const locale = dateLocale();
  const english = languageCode() === 'en';
  const weekday = d.toLocaleDateString(locale, { weekday: 'short' });
  const date = english ? `${weekday} ${d.getDate()} ${d.toLocaleDateString(locale, { month: 'short' })}` : d.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' });
  const day = days === 0 ? t('liveSchedule.today') : days === 1 ? t('liveSchedule.tomorrow') : days > 1 && days < 7 ? weekday : date;
  const time = english ? d.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit', hour12: true }).replace(/\s?([ap])\.?m\.?/i, ' $1m') : d.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
  return `${day} ${time}`;
}

function LiveRow({ s, mine, onCancelled }: { s: LiveSchedule; mine: boolean; onCancelled: () => void }) {
  const { me } = useMe();
  const [reminded, setReminded] = useState<boolean | null>(mine ? false : null);
  useEffect(() => {
    if (mine) return;
    let live = true;
    hasLiveReminder(me.id, s.id).then((on) => live && setReminded(on), () => live && setReminded(false));
    return () => {
      live = false;
    };
  }, [s.id]);

  const remind = () => {
    if (reminded === null) return;
    const on = !reminded;
    setReminded(on);
    setLiveReminder(me.id, s.id, on).then(
      () => toast(on ? t('liveSchedule.reminderOn') : t('liveSchedule.reminderOff')),
      (e) => {
        setReminded(!on);
        toastError(e);
      },
    );
  };
  const cancel = async () => {
    if (!(await ask(t('liveSchedule.cancelQuestion'), s.title || whenLabel(s.starts_at), t('liveSchedule.cancelLive')))) return;
    try {
      await cancelLiveSchedule(s.id);
      onCancelled();
    } catch (e) {
      toastError(e);
    }
  };

  return (
    <div className="prof-card prof-live-card">
      <span className="prof-card-icon live">
        <Icon name="live" size={20} />
      </span>
      <span className="prof-card-text">
        <b>
          {t('liveSchedule.live')} · {whenLabel(s.starts_at)}
        </b>
        {s.title ? <span className="prof-card-sub">{s.title}</span> : null}
      </span>
      {mine ? (
        <button className="prof-btn small" onClick={cancel}>
          {t('liveSchedule.cancel')}
        </button>
      ) : (
        <button className={'prof-btn small' + (reminded ? '' : ' primary')} aria-pressed={!!reminded} disabled={reminded === null} onClick={remind}>
          {reminded ? (
            <>
              <Icon name="check" size={14} stroke={2.4} /> {t('liveSchedule.reminderSet')}
            </>
          ) : (
            t('liveSchedule.remindMe')
          )}
        </button>
      )}
    </div>
  );
}

/** The lives this account has planned, soonest first (up to three), with Remind me (or Cancel on your own). */
export function UpcomingLives({ userId, mine }: { userId: string; mine: boolean }) {
  const [list, setList] = useState<LiveSchedule[]>([]);
  const load = () => {
    fetchLiveSchedules(userId).then(
      (rows) => setList(rows.slice(0, 3)),
      // Extra on a profile: without it the profile simply goes without the card.
      () => setList([]),
    );
  };
  useEffect(load, [userId]);
  if (!list.length) return null;
  return (
    <section className="prof-lives" aria-label={t('liveSchedule.upcoming')}>
      {list.map((s) => (
        <LiveRow key={s.id} s={s} mine={mine} onCancelled={load} />
      ))}
    </section>
  );
}
