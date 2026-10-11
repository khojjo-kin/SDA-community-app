// Church events, from the iPhone app (app/(app)/events.tsx, event/[id].tsx and event-edit.tsx), laid
// out like the Churches page: the list on the left (Upcoming, set out by day with the ones near you
// first once this computer has said where it is; Going, the ones I answered; Yours, the ones I made),
// and on the right an event's page (/events/<id>), the form for a new one (/events/new) or the form to
// change one (/events/<id>/edit). ?church=<id> or ?group=<id> narrows everything to one church or
// community, and a new event made from there starts in it.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { distanceKm, fetchChurch, fetchEvents, fetchGroup } from 'shared/api';
import type { EventCard } from 'shared/types';
import { t } from '../lib/i18n';
import { useMe } from '../lib/me';
import { nav, parts } from '../lib/router';
import { Empty, Failed, Icon, Spinner, toast } from '../ui/kit';
import { locateMe } from './church-parts';
import { EventRow, dayHeading, startOfDay, useEventsChanged } from './event-parts';
import { EventEditor } from './event-edit';
import { EventPage } from './event-page';

type Scope = 'upcoming' | 'going' | 'mine';
const SCOPES: readonly { key: Scope; label: string }[] = [
  { key: 'upcoming', label: 'events.upcoming' },
  { key: 'going', label: 'events.going' },
  { key: 'mine', label: 'events.yours' },
];

type Point = { lat: number; lng: number };
/** Events this close count as near you, and the list shows at most this many of them first. */
const NEAR_KM = 60;
const NEAR_MAX = 10;
const NO_LISTS: Record<Scope, EventCard[] | null> = { upcoming: null, going: null, mine: null };

/** Whether location access is already allowed (sorting by distance never brings up the question by itself). */
async function locationAllowed(): Promise<boolean> {
  try {
    return (await navigator.permissions?.query({ name: 'geolocation' as PermissionName }))?.state === 'granted';
  } catch {
    return false;
  }
}

export function Events({ path }: { path: string }) {
  const { me } = useMe();
  const seg = parts(path);
  const query = new URLSearchParams(path.split('?')[1] ?? '');
  const churchId = query.get('church') || undefined;
  const groupId = churchId ? undefined : query.get('group') || undefined;
  // Kept on every link inside the page, so the list stays narrowed while events open beside it.
  const suffix = churchId ? `?church=${churchId}` : groupId ? `?group=${groupId}` : '';
  const id = seg[1];
  const editing = seg[2] === 'edit';

  const [scope, setScope] = useState<Scope>('upcoming');
  const [lists, setLists] = useState(NO_LISTS);
  const [errors, setErrors] = useState<Record<Scope, unknown>>({ upcoming: null, going: null, mine: null });
  const [tick, setTick] = useState(0);
  const [narrowedTo, setNarrowedTo] = useState('');
  const [here, setHere] = useState<Point | null>(null);
  const [locating, setLocating] = useState(false);
  // Members under 14 can't post events (the database says no), so they aren't offered it.
  const canCreate = me.restricted !== true;

  // A new narrowing starts the lists afresh.
  useEffect(() => setLists(NO_LISTS), [churchId, groupId]);

  // The list shown, on every switch and whenever an event changes anywhere in the app.
  useEffect(() => {
    let live = true;
    fetchEvents({ scope, churchId, groupId }).then(
      (rows) => {
        if (!live) return;
        setLists((l) => ({ ...l, [scope]: rows }));
        setErrors((e) => ({ ...e, [scope]: null }));
      },
      (e) => {
        if (!live) return;
        // A refresh that fails keeps the list on screen; with nothing shown yet, the error takes its place.
        setErrors((x) => ({ ...x, [scope]: e }));
      },
    );
    return () => {
      live = false;
    };
  }, [scope, churchId, groupId, tick]);
  useEventsChanged(useCallback(() => setTick((n) => n + 1), []));

  // The church or community the list is narrowed to, by name.
  useEffect(() => {
    setNarrowedTo('');
    if (!churchId && !groupId) return;
    let live = true;
    const get = churchId ? fetchChurch(churchId).then((c) => c?.name ?? '') : fetchGroup(groupId as string).then((g) => g?.name ?? '');
    get.then((name) => live && setNarrowedTo(name), () => {});
    return () => {
      live = false;
    };
  }, [churchId, groupId]);

  /** Where this computer is. Without `ask`, only if location is already allowed. */
  const locate = useCallback(async (ask: boolean) => {
    if (!ask && !(await locationAllowed())) return;
    setLocating(true);
    try {
      setHere(await locateMe());
    } catch (e) {
      if (ask) toast((e as GeolocationPositionError)?.code === 1 ? t('events.locationOff') : t('events.noFix'));
    } finally {
      setLocating(false);
    }
  }, []);
  useEffect(() => {
    locate(false);
  }, [locate]);

  const list = lists[scope];
  const kmOf = (ev: EventCard) => (here && ev.lat !== null && ev.lng !== null ? distanceKm(here, { lat: ev.lat, lng: ev.lng }) : null);

  // Upcoming: the nearest first (once known), then every event under its day.
  const groups = useMemo(() => {
    if (!list || scope !== 'upcoming') return null;
    const near = here
      ? list
          .map((ev) => ({ ev, km: kmOf(ev) }))
          .filter((n): n is { ev: EventCard; km: number } => n.km !== null && n.km <= NEAR_KM)
          .sort((a, b) => a.km - b.km)
          .slice(0, NEAR_MAX)
      : [];
    const today = startOfDay(new Date()).getTime();
    const days: { key: number; label: string; events: EventCard[] }[] = [];
    for (const ev of list) {
      // Something already under way is listed under today.
      const day = Math.max(today, startOfDay(new Date(ev.starts_at)).getTime());
      const last = days[days.length - 1];
      if (last && last.key === day) last.events.push(ev);
      else days.push({ key: day, label: dayHeading(new Date(day)), events: [ev] });
    }
    return { near, days };
  }, [list, scope, here]);

  const linkTo = (ev: EventCard) => `/events/${ev.id}${suffix}`;
  const create = () => nav(`/events/new${suffix}`);
  const pinned = !!list?.some((ev) => ev.lat !== null);

  let body: React.ReactNode;
  if (!list) {
    body = errors[scope] ? <Failed error={errors[scope]} retry={() => setTick((n) => n + 1)} /> : <Spinner />;
  } else if (!list.length) {
    body = (
      <Empty icon="calendar" title={t(scope === 'upcoming' ? 'events.emptyUpcoming' : scope === 'going' ? 'events.emptyGoing' : 'events.emptyYours')}>
        {scope !== 'going' && canCreate ? (
          <button className="btn small" onClick={create}>
            {t('events.create')}
          </button>
        ) : null}
      </Empty>
    );
  } else if (groups) {
    body = (
      <>
        {!here && pinned ? (
          <button className="ev-locate" disabled={locating} onClick={() => locate(true)}>
            <Icon name="location" size={16} stroke={2.2} /> {t('events.useMyLocation')}
          </button>
        ) : null}
        {groups.near.length ? (
          <section aria-label={t('events.nearYou')}>
            <h3 className="list-h ev-day">{t('events.nearYou')}</h3>
            {groups.near.map(({ ev, km }) => (
              <EventRow key={'near' + ev.id} ev={ev} mode="date" km={km} to={linkTo(ev)} on={ev.id === id} />
            ))}
          </section>
        ) : null}
        {groups.days.map((d) => (
          <section key={d.key} aria-label={d.label}>
            <h3 className="list-h ev-day">{d.label}</h3>
            {d.events.map((ev) => (
              <EventRow key={ev.id} ev={ev} mode="time" km={kmOf(ev)} to={linkTo(ev)} on={ev.id === id} />
            ))}
          </section>
        ))}
      </>
    );
  } else {
    body = list.map((ev) => <EventRow key={ev.id} ev={ev} mode="date" km={kmOf(ev)} to={linkTo(ev)} on={ev.id === id} />);
  }

  let detail: React.ReactNode;
  if (id === 'new') detail = <EventEditor key={'new' + suffix} churchParam={churchId} groupParam={groupId} suffix={suffix} />;
  else if (id && editing) detail = <EventEditor key={id + '/edit'} editId={id} suffix={suffix} />;
  else if (id) detail = <EventPage key={id} id={id} suffix={suffix} />;
  else
    detail = (
      <Empty icon="calendar" title={t('d.events.chooseEvent')}>
        {canCreate ? (
          <button className="btn" onClick={create}>
            {t('events.create')}
          </button>
        ) : null}
      </Empty>
    );

  return (
    <div className="split-page ev-events">
      <section className="split-list">
        <header>
          <div className="ev-list-head">
            <h1>{t('events.title')}</h1>
            {canCreate ? (
              <button className={'btn small' + (id === 'new' ? '' : ' quiet')} onClick={create}>
                <Icon name="plus" size={16} stroke={2.2} /> {t('events.create')}
              </button>
            ) : null}
          </div>
          {churchId || groupId ? (
            <div className="ev-narrow">
              <Icon name={churchId ? 'church' : 'users'} size={15} stroke={2} />
              <span>{narrowedTo || '…'}</span>
              <button className="icon-btn tiny" aria-label={t('d.events.showAll')} title={t('d.events.showAll')} onClick={() => nav('/events' + (id ? '/' + id + (editing ? '/edit' : '') : ''))}>
                <Icon name="close" size={14} stroke={2.2} />
              </button>
            </div>
          ) : null}
          <div className="ev-tabs" role="tablist" aria-label={t('events.title')}>
            {SCOPES.map((s) => (
              <button key={s.key} role="tab" aria-selected={scope === s.key} className={scope === s.key ? 'on' : ''} onClick={() => setScope(s.key)}>
                {t(s.label)}
              </button>
            ))}
          </div>
        </header>
        <div className="split-scroll ev-list">{body}</div>
      </section>
      <section className="split-detail ev-detail-pane">{detail}</section>
    </div>
  );
}
