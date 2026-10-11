// One event, from the iPhone app's event/[id].tsx: its cover, what and when, where (with a small map
// and a way to the computer's maps), Going and Interested, who's coming, the details, and who
// organised it. The organiser (and app admins, and the community's managers) can edit it, call it off
// or delete it from the ⋯ menu. Shown beside the list on the Events page.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { cancelEvent, deleteEvent, fetchEvent, fetchEventPeople, fetchGroup, setEventRsvp } from 'shared/api';
import { errText, fmt } from 'shared/theme';
import type { EventCard, EventPerson, EventRsvp } from 'shared/types';
import { t } from '../lib/i18n';
import { useMe } from '../lib/me';
import { nav } from '../lib/router';
import { Avatar, ChoiceMenu, Empty, Failed, Icon, Link, Modal, Spinner, Verified, ask, toast, toastError } from '../ui/kit';
import { SendText } from './bible';
import { EventCover, Faces, MapPin, countsText, eventState, eventsChanged, kindLabel, longDay, mapsLink, stateWords, timeRange } from './event-parts';
import { MiniMap } from './map';

/** The event with my answer changed, the counts and the faces of people going moved with it. */
function withAnswer(ev: EventCard, to: EventRsvp | null, myFace: string): EventCard {
  const was = ev.my_rsvp;
  if (was === to) return ev;
  let going = ev.going_count;
  let interested = ev.interested_count;
  let faces = ev.going_avatars;
  // The faces are only of people with a photo, as the server gives them.
  if (was === 'going') {
    going -= 1;
    const at = myFace ? faces.indexOf(myFace) : -1;
    if (at >= 0) faces = faces.filter((_, i) => i !== at);
  }
  if (was === 'interested') interested -= 1;
  if (to === 'going') {
    going += 1;
    if (myFace) faces = [myFace, ...faces].slice(0, 5);
  }
  if (to === 'interested') interested += 1;
  return { ...ev, my_rsvp: to, going_count: Math.max(0, going), interested_count: Math.max(0, interested), going_avatars: faces };
}

export function EventPage({ id, suffix }: { id: string; suffix: string }) {
  const { me } = useMe();
  // undefined while loading, null when the event is gone (deleted, or not for me to see).
  const [ev, setEv] = useState<EventCard | null | undefined>(undefined);
  const [error, setError] = useState<unknown>(null);
  // Managers of the event's community may change it too.
  const [manager, setManager] = useState(false);
  const [menu, setMenu] = useState(false);
  const [people, setPeople] = useState<'going' | 'interested' | null>(null);
  const [sharing, setSharing] = useState(false);
  // An answer on its way: a second click waits for it, and a reload doesn't overwrite it with an older copy.
  const answering = useRef(false);
  const shown = useRef(ev);
  shown.current = ev;

  const load = useCallback(async () => {
    try {
      const e = await fetchEvent(id);
      if (!answering.current) setEv(e);
      setError(null);
      if (e?.group_id && !e.mine) {
        fetchGroup(e.group_id).then((g) => setManager(g?.my_standing === 'owner' || g?.my_standing === 'admin'), () => {});
      }
    } catch (e) {
      // A refresh that fails keeps the page as it was.
      if (shown.current === undefined) setError(e);
    }
  }, [id]);
  useEffect(() => {
    load();
  }, [load]);

  /** Going or Interested; the same again takes the answer back. Shown at once, put back if it fails. */
  function answer(next: EventRsvp) {
    const cur = shown.current;
    if (!cur || answering.current) return;
    const to = cur.my_rsvp === next ? null : next;
    answering.current = true;
    setEv(withAnswer(cur, to, me.avatar_url ?? ''));
    setEventRsvp(me.id, cur.id, to)
      .then(() => eventsChanged())
      .catch((e) => {
        setEv(cur);
        toastError(e);
      })
      .finally(() => {
        answering.current = false;
      });
  }

  async function callOff() {
    if (!(await ask(t('events.callOffQuestion'), t('events.callOffBody'), t('events.callOff')))) return;
    try {
      await cancelEvent(id);
      setEv((cur) => cur && { ...cur, cancelled_at: new Date().toISOString() });
      eventsChanged();
    } catch (e) {
      toastError(e);
    }
  }

  async function remove() {
    if (!(await ask(t('events.deleteQuestion'), t('events.deleteBody'), t('common.delete')))) return;
    try {
      await deleteEvent(id);
      toast(t('events.deleted'));
      eventsChanged();
      nav('/events' + suffix, true);
    } catch (e) {
      toastError(e);
    }
  }

  if (error && ev === undefined) return <Failed error={error} retry={load} />;
  if (ev === undefined) return <Spinner />;
  if (ev === null) return <Empty icon="calendar" title={t('events.gone')} />;

  const state = eventState(ev);
  const open = state === 'soon' || state === 'now';
  const canManage = ev.mine || !!me.admin_role || manager;
  const pinned = ev.lat !== null && ev.lng !== null;
  const counts = countsText(ev);
  const organiser = ev.full_name || ev.username;
  const when = `${longDay(new Date(ev.starts_at))} · ${timeRange(ev)}`;
  const shareText = [ev.title, when, ev.place, `community://event/${ev.id}`].filter(Boolean).join('\n');

  return (
    <article className={'ev-page' + (state === 'off' ? ' off' : '')}>
      <EventCover uri={ev.cover_url} kind={ev.kind} className="ev-hero" icon={64} />

      <header className="ev-head">
        <div className="ev-head-text">
          <span className="ev-kind">{kindLabel(ev.kind)}</span>
          <h1>{ev.title}</h1>
          {state !== 'soon' ? <span className={'ev-state big ' + state}>{stateWords(state)}</span> : null}
        </div>
        {canManage ? (
          <button className="icon-btn" aria-label={t('events.options')} title={t('events.options')} onClick={() => setMenu(true)}>
            <Icon name="more" size={24} />
          </button>
        ) : null}
      </header>

      <div className="ev-facts">
        <div className="ev-fact">
          <Icon name="calendar" size={22} />
          <span className="row-text">
            <b>{longDay(new Date(ev.starts_at))}</b>
            <span>{timeRange(ev)}</span>
          </span>
        </div>
        {ev.place || pinned ? (
          <a className="ev-fact link" href={mapsLink(ev)} target="_blank" rel="noreferrer">
            <Icon name="location" size={22} />
            <span className="row-text">
              <b>{ev.place || t('events.openInMaps')}</b>
              {ev.place ? <span className="ev-accent">{t('events.openInMaps')}</span> : null}
            </span>
            <Icon name="right" size={16} />
          </a>
        ) : null}
        {ev.church_id && ev.church_name ? (
          <Link to={'/churches/' + ev.church_id} className="ev-fact link">
            <Icon name="church" size={22} />
            <span className="row-text">
              <b>{ev.church_name}</b>
            </span>
            <Icon name="right" size={16} />
          </Link>
        ) : null}
        {ev.group_id && ev.group_name ? (
          <Link to={'/groups/' + ev.group_id} className="ev-fact link">
            <Icon name="users" size={22} />
            <span className="row-text">
              <b>{ev.group_name}</b>
            </span>
            <Icon name="right" size={16} />
          </Link>
        ) : null}
      </div>

      <div className="ev-answers">
        {open ? (
          <>
            <button className={'ev-answer' + (ev.my_rsvp === 'going' ? ' on' : '')} aria-pressed={ev.my_rsvp === 'going'} onClick={() => answer('going')}>
              <Icon name="check" size={18} stroke={2.4} /> {t('events.going')}
            </button>
            <button className={'ev-answer' + (ev.my_rsvp === 'interested' ? ' on' : '')} aria-pressed={ev.my_rsvp === 'interested'} onClick={() => answer('interested')}>
              <Icon name="star" size={18} stroke={2.2} fill={ev.my_rsvp === 'interested' ? 'currentColor' : undefined} /> {t('events.interested')}
            </button>
          </>
        ) : null}
        <button className="ev-answer round" aria-label={t('common.share')} title={t('common.share')} onClick={() => setSharing(true)}>
          <Icon name="send" size={19} />
        </button>
      </div>

      {counts ? (
        <button className="ev-who" onClick={() => setPeople(ev.going_count > 0 || ev.interested_count === 0 ? 'going' : 'interested')}>
          <Faces urls={ev.going_avatars} size={26} />
          <b>{counts}</b>
          <Icon name="right" size={16} stroke={2.2} />
        </button>
      ) : null}

      {ev.description ? <p className="ev-desc">{ev.description}</p> : null}

      {pinned ? (
        <a className="ev-map" href={mapsLink(ev)} target="_blank" rel="noreferrer" aria-label={t('events.openInMaps')}>
          <MiniMap lat={ev.lat as number} lng={ev.lng as number} z={15}>
            <MapPin />
          </MiniMap>
        </a>
      ) : null}

      <h3 className="ev-label">{t('events.organiser')}</h3>
      <Link to={'/u/' + ev.username} className="ev-organiser">
        <Avatar src={ev.avatar_url} name={ev.username} size={44} />
        <span className="row-text">
          <b>
            {ev.username}
            {ev.verified ? <Verified size={13} /> : null}
          </b>
          {ev.full_name ? <span>{organiser}</span> : null}
        </span>
        <Icon name="right" size={16} />
      </Link>

      {menu ? (
        <ChoiceMenu
          onClose={() => setMenu(false)}
          items={[
            { label: t('events.edit'), onClick: () => nav(`/events/${ev.id}/edit${suffix}`) },
            ...(open ? [{ label: t('events.callOff'), danger: true, onClick: callOff }] : []),
            { label: t('common.delete'), danger: true, onClick: remove },
          ]}
        />
      ) : null}
      {people ? <PeopleDialog ev={ev} tab={people} setTab={setPeople} onClose={() => setPeople(null)} /> : null}
      {sharing ? <SendText title={t('common.share')} text={shareText} onClose={() => setSharing(false)} /> : null}
    </article>
  );
}

/** Who answered, in two lists: Going and Interested. */
function PeopleDialog({ ev, tab, setTab, onClose }: { ev: EventCard; tab: EventRsvp; setTab: (t: EventRsvp) => void; onClose: () => void }) {
  const [list, setList] = useState<EventPerson[] | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    setError('');
    fetchEventPeople(ev.id).then(setList, (e) => setError(errText(e)));
  }, [ev.id]);
  useEffect(load, [load]);
  const shown = (list ?? []).filter((p) => p.status === tab);
  return (
    <Modal title={ev.title} onClose={onClose} className="ev-people">
      <div className="ev-people-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'going'} className={tab === 'going' ? 'on' : ''} onClick={() => setTab('going')}>
          {t('events.goingCount', { count: fmt(ev.going_count) })}
        </button>
        <button role="tab" aria-selected={tab === 'interested'} className={tab === 'interested' ? 'on' : ''} onClick={() => setTab('interested')}>
          {t('events.interestedCount', { count: fmt(ev.interested_count) })}
        </button>
      </div>
      <div className="ev-people-list">
        {list === null ? error ? <Failed error={new Error(error)} retry={load} /> : <Spinner /> : null}
        {list && !shown.length ? <p className="ev-people-none">{t('events.noOneYet')}</p> : null}
        {shown.map((p) => (
          <Link key={p.user_id} to={'/u/' + p.username} className="row ev-person" onClick={onClose}>
            <Avatar src={p.avatar_url} name={p.username} size={44} />
            <span className="row-text">
              <b>
                {p.username}
                {p.verified ? <Verified size={12} /> : null}
              </b>
              {p.full_name ? <span>{p.full_name}</span> : null}
            </span>
          </Link>
        ))}
      </div>
    </Modal>
  );
}
