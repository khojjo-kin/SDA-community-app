// Making an event, or changing one, from the iPhone app's event-edit.tsx: a cover, the title, what
// kind of event, the day (on a small calendar) and the times (quarter hours), the place with a pin on
// the map, the church or community it belongs to, and the details. Share (or Save) at the top right.
// `churchParam` / `groupParam` start a new one at that church or in that community.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { canPostIn, createEvent, fetchChurch, fetchChurches, fetchEvent, fetchGroup, fetchMyGroups, updateEvent, uploadImage } from 'shared/api';
import { errText } from 'shared/theme';
import type { Church, EventCard, EventInput, EventKind, Group } from 'shared/types';
import { dateLocale, t } from '../lib/i18n';
import { useMe } from '../lib/me';
import { nav } from '../lib/router';
import { Empty, Failed, Icon, Modal, Spinner, toast, useOutside } from '../ui/kit';
import { locateMe } from './church-parts';
import { EVENT_KINDS, EventCover, MapPin, dayHeading, eventsChanged, startOfDay, timeOf, weekday } from './event-parts';
import { MapCanvas, type MapView, MiniMap } from './map';

type Point = { lat: number; lng: number };
type ChurchChoice = { id: string; name: string; lat: number | null; lng: number | null };
type GroupChoice = { id: string; name: string };
type Errors = { title?: string; when?: string };

const DAY_MS = 86400e3;
/** Times are offered every quarter of an hour. */
const STEP = 15;
/** The database takes events up to two years ahead; a day less keeps a late time on the last day inside that. */
const AHEAD_DAYS = 729;
/** A Monday, for the calendar's weekday letters (the week starts on Monday). */
const A_MONDAY = new Date(2024, 0, 1);

/** The moment `minutes` after the start of `day` (past midnight runs on into the next day). */
const atMinutes = (day: Date, minutes: number) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, minutes);
/** How far into `day` `at` is, in minutes by the clock (so the day the clocks change doesn't put an edit an hour out). */
const minutesInto = (day: Date, at: Date) => Math.round((startOfDay(at).getTime() - day.getTime()) / DAY_MS) * 24 * 60 + at.getHours() * 60 + at.getMinutes();
/** A new event starts on the hour, about an hour from now. */
function firstStart(): { day: Date; min: number } {
  const at = new Date(Date.now() + 60 * 60e3);
  at.setMinutes(0, 0, 0);
  return { day: startOfDay(at), min: at.getHours() * 60 };
}

/** A month at a time, Monday first. Days before `min` or after `max` can't be chosen. */
function Calendar({ value, onChange, min, max }: { value: Date; onChange: (d: Date) => void; min: Date; max: Date }) {
  const [month, setMonth] = useState(() => new Date(value.getFullYear(), value.getMonth(), 1));
  const letters = useMemo(() => Array.from({ length: 7 }, (_, i) => weekday(new Date(A_MONDAY.getFullYear(), 0, 1 + i), 'narrow')), []);
  const days = useMemo(() => {
    const lead = (month.getDay() + 6) % 7;
    const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const out: (Date | null)[] = Array.from({ length: lead }, () => null);
    for (let d = 1; d <= count; d++) out.push(new Date(month.getFullYear(), month.getMonth(), d));
    while (out.length % 7) out.push(null);
    return out;
  }, [month]);
  const canBack = month.getTime() > new Date(min.getFullYear(), min.getMonth(), 1).getTime();
  const canOn = month.getTime() < new Date(max.getFullYear(), max.getMonth(), 1).getTime();
  const today = startOfDay(new Date()).getTime();
  const step = (n: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + n, 1));
  return (
    <div className="ev-cal">
      <div className="ev-cal-head">
        <b>{month.toLocaleDateString(dateLocale(), { month: 'long', year: 'numeric' })}</b>
        <button type="button" className="icon-btn tiny" aria-label={t('events.prevMonth')} disabled={!canBack} onClick={() => step(-1)}>
          <Icon name="back" size={18} />
        </button>
        <button type="button" className="icon-btn tiny" aria-label={t('events.nextMonth')} disabled={!canOn} onClick={() => step(1)}>
          <Icon name="right" size={18} />
        </button>
      </div>
      <div className="ev-cal-grid">
        {letters.map((l, i) => (
          <span key={'l' + i} className="ev-cal-letter">
            {l}
          </span>
        ))}
        {days.map((d, i) => {
          if (!d) return <span key={i} />;
          const ms = d.getTime();
          const off = ms < min.getTime() || ms > max.getTime();
          const on = ms === value.getTime();
          return (
            <button key={i} type="button" disabled={off} aria-pressed={on} aria-label={d.toLocaleDateString(dateLocale(), { weekday: 'long', day: 'numeric', month: 'long' })} className={'ev-cal-day' + (on ? ' on' : '') + (ms === today ? ' today' : '')} onClick={() => onChange(d)}>
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function EventEditor({ editId, churchParam, groupParam, suffix }: { editId?: string; churchParam?: string; groupParam?: string; suffix: string }) {
  const { me } = useMe();
  const first = useMemo(firstStart, []);
  const [existing, setExisting] = useState<EventCard | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<EventKind>('service');
  const [description, setDescription] = useState('');
  const [place, setPlace] = useState('');
  const [pin, setPin] = useState<Point | null>(null);
  // A newly chosen photo (uploaded only on save), or the one already there when editing.
  const [cover, setCover] = useState<{ uri: string; width: number } | null>(null);
  const [coverUrl, setCoverUrl] = useState('');
  // A new event belongs to the member's own church unless they choose another (or none).
  const [church, setChurch] = useState<ChurchChoice | null>(() =>
    churchParam ? { id: churchParam, name: '', lat: null, lng: null } : !editId && !groupParam && me.church_id ? { id: me.church_id, name: me.church_name ?? '', lat: null, lng: null } : null,
  );
  const [group, setGroup] = useState<GroupChoice | null>(null);
  const [day, setDay] = useState(first.day);
  const [startMin, setStartMin] = useState(first.min);
  const [endMin, setEndMin] = useState<number | null>(null);
  const [calendar, setCalendar] = useState(false);
  const [sheet, setSheet] = useState<'pin' | 'church' | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  // The communities I can post in; the row shows only if there are any.
  const [groups, setGroups] = useState<Group[]>([]);
  // The start as saved, when editing: kept as it is unless the date or time is changed.
  const original = useRef<{ iso: string; ms: number } | null>(null);
  const working = useRef(false);
  // The chosen photo once uploaded, so a second try at saving doesn't upload it again.
  const uploaded = useRef<{ uri: string; url: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const titleInput = useRef<HTMLInputElement>(null);
  const calendarBox = useRef<HTMLDivElement>(null);
  useOutside(calendarBox, () => setCalendar(false), calendar);
  // The calendar opens under the date: brought into view when the form is scrolled low.
  const calendarPop = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (calendar) calendarPop.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [calendar]);

  /* ---------- loading what's there ---------- */

  const load = async () => {
    if (!editId) return;
    setLoadError(null);
    try {
      const ev = await fetchEvent(editId);
      if (!ev) throw new Error(t('events.gone'));
      const start = new Date(ev.starts_at);
      const d = startOfDay(start);
      original.current = { iso: ev.starts_at, ms: start.getTime() };
      setExisting(ev);
      setTitle(ev.title);
      setKind(ev.kind);
      setDescription(ev.description);
      setPlace(ev.place);
      setPin(ev.lat !== null && ev.lng !== null ? { lat: ev.lat, lng: ev.lng } : null);
      setCoverUrl(ev.cover_url);
      setChurch(ev.church_id ? { id: ev.church_id, name: ev.church_name ?? '', lat: null, lng: null } : null);
      setGroup(ev.group_id ? { id: ev.group_id, name: ev.group_name ?? '' } : null);
      setDay(d);
      setStartMin(minutesInto(d, start));
      setEndMin(ev.ends_at ? minutesInto(d, new Date(ev.ends_at)) : null);
    } catch (e) {
      setLoadError(e);
    }
  };
  useEffect(() => {
    load();
  }, [editId]);

  // Started from a church's page: its name. From a community's: the community, and its church.
  useEffect(() => {
    if (churchParam) fetchChurch(churchParam).then((c) => c && setChurch({ id: c.id, name: c.name, lat: c.lat, lng: c.lng }), () => {});
    if (groupParam) {
      fetchGroup(groupParam).then((g) => {
        if (!g || !canPostIn(g)) return;
        setGroup({ id: g.id, name: g.name });
        setChurch(g.church_id ? { id: g.church_id, name: g.church_name ?? '', lat: null, lng: null } : null);
      }, () => {});
    }
    fetchMyGroups(me.id).then((gs) => setGroups(gs.filter(canPostIn)), () => setGroups([]));
    if (!editId) setTimeout(() => titleInput.current?.focus(), 0);
  }, []);

  /* ---------- when ---------- */

  const minDay = useMemo(() => {
    const today = startOfDay(new Date());
    const orig = original.current ? startOfDay(new Date(original.current.ms)) : today;
    return orig < today ? orig : today;
  }, [existing]);
  const maxDay = useMemo(() => startOfDay(new Date(Date.now() + AHEAD_DAYS * DAY_MS)), []);

  // The quarter hours on the chosen day that haven't passed (the database allows a start up to an
  // hour back, so the current quarter is still offered), and the saved start when editing.
  const startTimes = useMemo(() => {
    const now = Date.now();
    const soonest = now - (now % (STEP * 60e3));
    const out: number[] = [];
    for (let m = 0; m < 24 * 60; m += STEP) if (atMinutes(day, m).getTime() >= soonest) out.push(m);
    const orig = original.current;
    if (orig && startOfDay(new Date(orig.ms)).getTime() === day.getTime()) {
      const m = minutesInto(day, new Date(orig.ms));
      if (!out.includes(m)) out.push(m);
      out.sort((a, b) => a - b);
    }
    return out;
  }, [day, existing]);
  const endTimes = useMemo(() => {
    const out: number[] = [];
    for (let m = startMin + STEP; m <= startMin + 24 * 60; m += STEP) out.push(m);
    return out;
  }, [startMin]);

  /** A new start moves the end with it, so the length stays the same. */
  const changeStart = (m: number) => {
    if (m === startMin) return;
    setEndMin((e) => (e === null ? null : e + (m - startMin)));
    setStartMin(m);
    setErrors((e) => (e.when ? { ...e, when: undefined } : e));
  };
  // A start no longer offered (another day picked, or it has passed) moves to the next one that is.
  useEffect(() => {
    if (!startTimes.length || startTimes.includes(startMin)) return;
    changeStart(startTimes.find((m) => m >= startMin) ?? startTimes[0]);
  }, [startTimes, startMin]);

  const timeLabel = (m: number) => `${timeOf(atMinutes(day, m))}${m >= 24 * 60 ? ` ${t('events.nextDay')}` : ''}`;

  /* ---------- cover ---------- */

  const chooseCover = (file?: File | null) => {
    if (!file || !file.type.startsWith('image/')) return;
    const uri = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => setCover({ uri, width: img.naturalWidth });
    img.src = uri;
  };

  /* ---------- place ---------- */

  /** Pins the event where this computer is. */
  async function pinHere() {
    if (locating) return;
    setLocating(true);
    try {
      setPin(await locateMe());
    } catch (e) {
      toast((e as GeolocationPositionError)?.code === 1 ? t('events.locationOff') : t('events.noFix'));
    } finally {
      setLocating(false);
    }
  }

  /* ---------- saving ---------- */

  async function save() {
    if (working.current) return;
    const name = title.trim();
    const start = atMinutes(day, startMin);
    const orig = original.current;
    // Unchanged, the saved start goes back as it was (a start under way can be kept, not set anew).
    const keepStart = !!orig && Math.floor(orig.ms / 60e3) === Math.floor(start.getTime() / 60e3);
    const errs: Errors = {};
    if (!name) errs.title = t('events.needTitle');
    if (!keepStart && start.getTime() < Date.now() - 55 * 60e3) errs.when = t('events.timePassed');
    setErrors(errs);
    if (errs.title || errs.when) {
      if (errs.title) titleInput.current?.focus();
      return;
    }
    working.current = true;
    setBusy(true);
    try {
      // The photo is uploaded only now, so leaving the form leaves nothing behind in storage; a second
      // try after a refusal uses the copy already uploaded.
      let cover_url = coverUrl;
      if (cover) {
        if (uploaded.current?.uri !== cover.uri) uploaded.current = { uri: cover.uri, url: (await uploadImage(me.id, cover.uri, cover.width)).url };
        cover_url = uploaded.current.url;
      }
      const input: EventInput = {
        kind,
        title: name,
        description,
        starts_at: keepStart && orig ? orig.iso : start.toISOString(),
        ends_at: endMin !== null ? atMinutes(day, endMin).toISOString() : null,
        place,
        lat: pin?.lat ?? null,
        lng: pin?.lng ?? null,
        cover_url,
        church_id: church?.id ?? null,
        group_id: group?.id ?? null,
      };
      if (existing) {
        await updateEvent(existing.id, input);
        toast(t('events.saved'));
        eventsChanged();
        nav(`/events/${existing.id}${suffix}`, true);
        return;
      }
      const id = await createEvent(me.id, input);
      eventsChanged();
      nav(`/events/${id}${suffix}`, true);
    } catch (e) {
      toast(errText(e));
    } finally {
      working.current = false;
      setBusy(false);
    }
  }

  const close = () => nav(editId ? `/events/${editId}${suffix}` : `/events${suffix}`);

  /* ---------- drawing ---------- */

  if (me.restricted === true) return <Empty icon="calendar" title={t('events.forMembers14')} />;
  if (loadError) return <Failed error={loadError} retry={load} />;
  if (editId && !existing) return <Spinner />;

  const shownCover = cover?.uri || coverUrl;
  const showGroups = groups.length > 0 || !!group;

  return (
    <div className="ev-edit">
      <header className="ev-edit-head">
        <button type="button" className="icon-btn" aria-label={t('common.close')} disabled={busy} onClick={close}>
          <Icon name="close" size={22} />
        </button>
        <h1>{editId ? t('events.editTitle') : t('events.new')}</h1>
        <button type="button" className="btn" disabled={busy} onClick={save}>
          {busy ? <Spinner size={16} /> : editId ? t('events.save') : t('common.share')}
        </button>
      </header>

      {/* The cover: click (or drop a photo) to choose one. Without a photo, the kind's icon on the app's soft wash. */}
      <button
        type="button"
        className={'ev-cover-pick' + (shownCover ? ' has' : '')}
        disabled={busy}
        aria-label={shownCover ? t('events.changeCover') : t('events.addCover')}
        onClick={() => fileInput.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          chooseCover(e.dataTransfer.files?.[0]);
        }}
      >
        {shownCover ? <img src={shownCover} alt="" /> : <EventCover uri="" kind={kind} icon={44} />}
        <span className="ev-cover-label">
          <Icon name="image" size={18} /> {shownCover ? t('events.changeCover') : t('events.addCover')}
        </span>
      </button>
      <input ref={fileInput} type="file" accept="image/*" hidden data-testid="event-cover" onChange={(e) => { chooseCover(e.target.files?.[0]); e.target.value = ''; }} />
      {shownCover ? (
        <button type="button" className="link-btn ev-quiet-link" disabled={busy} onClick={() => { setCover(null); setCoverUrl(''); }}>
          {t('events.removeCover')}
        </button>
      ) : null}

      <label className="form-row ev-field">
        <span>{t('events.titleLabel')}</span>
        <input
          ref={titleInput}
          value={title}
          maxLength={120}
          placeholder={t('events.titlePlaceholder')}
          disabled={busy}
          aria-invalid={!!errors.title}
          onChange={(e) => {
            setTitle(e.target.value);
            if (errors.title) setErrors((x) => ({ ...x, title: undefined }));
          }}
        />
        {errors.title ? <em className="form-error">{errors.title}</em> : null}
      </label>

      <div className="ev-field">
        <span className="ev-field-label">{t('events.kindLabel')}</span>
        <div className="ev-kinds" role="radiogroup" aria-label={t('events.kindLabel')}>
          {EVENT_KINDS.map((k) => (
            <button key={k.kind} type="button" role="radio" aria-checked={kind === k.kind} className={'ev-kind-chip' + (kind === k.kind ? ' on' : '')} onClick={() => setKind(k.kind)}>
              <Icon name={k.icon} size={16} stroke={2} /> {t(k.label)}
            </button>
          ))}
        </div>
      </div>

      <div className="ev-when">
        <div className="ev-when-row" ref={calendarBox}>
          <Icon name="calendar" size={22} />
          <span className="ev-when-label">{t('events.date')}</span>
          <button type="button" className={'ev-when-value' + (calendar ? ' open' : '')} aria-expanded={calendar} onClick={() => setCalendar((v) => !v)}>
            {dayHeading(day)} <Icon name="down" size={14} stroke={2.2} />
          </button>
          {calendar ? (
            <div className="popover ev-cal-pop" ref={calendarPop}>
              <Calendar
                value={day}
                min={minDay}
                max={maxDay}
                onChange={(d) => {
                  setDay(d);
                  setCalendar(false);
                  setErrors((e) => (e.when ? { ...e, when: undefined } : e));
                }}
              />
            </div>
          ) : null}
        </div>
        <label className="ev-when-row">
          <Icon name="clock" size={22} />
          <span className="ev-when-label">{t('events.starts')}</span>
          <select className="ev-select" value={startMin} onChange={(e) => changeStart(Number(e.target.value))} aria-label={t('events.starts')}>
            {startTimes.map((m) => (
              <option key={m} value={m}>
                {timeLabel(m)}
              </option>
            ))}
          </select>
        </label>
        <div className="ev-when-row">
          <Icon name="clock" size={22} />
          <span className="ev-when-label">{t('events.ends')}</span>
          {endMin === null ? (
            <button type="button" className="ev-when-value add" onClick={() => setEndMin(startMin + 60)}>
              {t('events.addEnd')}
            </button>
          ) : (
            <>
              <select className="ev-select" value={endMin} onChange={(e) => setEndMin(Number(e.target.value))} aria-label={t('events.ends')}>
                {endTimes.map((m) => (
                  <option key={m} value={m}>
                    {timeLabel(m)}
                  </option>
                ))}
              </select>
              <button type="button" className="icon-btn tiny" aria-label={t('events.removeEnd')} title={t('events.removeEnd')} onClick={() => setEndMin(null)}>
                <Icon name="close" size={14} stroke={2.4} />
              </button>
            </>
          )}
        </div>
        {errors.when ? <p className="form-error ev-when-error">{errors.when}</p> : null}
      </div>

      <label className="form-row ev-field">
        <span>{t('events.place')}</span>
        <input value={place} maxLength={200} placeholder={t('events.placePlaceholder')} disabled={busy} onChange={(e) => setPlace(e.target.value)} />
      </label>
      {pin ? (
        <div className="ev-pin-box">
          <button type="button" className="ev-pin-map" aria-label={t('events.movePin')} onClick={() => setSheet('pin')}>
            <MiniMap lat={pin.lat} lng={pin.lng} z={15}>
              <MapPin />
            </MiniMap>
          </button>
          <div className="ev-text-actions">
            <button type="button" className="ev-text-action" onClick={() => setSheet('pin')}>
              <Icon name="location" size={16} stroke={2.2} /> {t('events.movePin')}
            </button>
            <button type="button" className="ev-text-action quiet" onClick={() => setPin(null)}>
              {t('events.removePin')}
            </button>
          </div>
        </div>
      ) : (
        <div className="ev-text-actions">
          <button type="button" className="ev-text-action" disabled={locating} onClick={pinHere}>
            <Icon name="location" size={16} stroke={2.2} /> {t('events.useMyLocation')}
          </button>
          <button type="button" className="ev-text-action" onClick={() => setSheet('pin')}>
            <Icon name="globe" size={16} stroke={2.2} /> {t('events.pinOnMap')}
          </button>
        </div>
      )}

      <div className="ev-belongs">
        <button type="button" className="ev-when-row ev-pick-row" onClick={() => setSheet('church')}>
          <Icon name="church" size={22} />
          <span className="ev-when-label">{t('events.church')}</span>
          <span className="ev-when-value">{church ? church.name || '…' : t('events.none')}</span>
          <Icon name="right" size={16} />
        </button>
        {showGroups ? (
          <label className="ev-when-row">
            <Icon name="users" size={22} />
            <span className="ev-when-label">{t('events.community')}</span>
            <select
              className="ev-select"
              aria-label={t('events.community')}
              value={group?.id ?? ''}
              onChange={(e) => {
                const g = groups.find((x) => x.id === e.target.value);
                setGroup(g ? { id: g.id, name: g.name } : null);
              }}
            >
              <option value="">{t('events.none')}</option>
              {group && !groups.some((g) => g.id === group.id) ? <option value={group.id}>{group.name}</option> : null}
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      <label className="form-row ev-field">
        <span>{t('events.details')}</span>
        <textarea rows={5} value={description} maxLength={2000} placeholder={t('events.detailsPlaceholder')} disabled={busy} onChange={(e) => setDescription(e.target.value)} />
      </label>

      {sheet === 'pin' ? <PinPicker start={pin} church={church} onClose={() => setSheet(null)} onDone={(p) => { setPin(p); setSheet(null); }} /> : null}
      {sheet === 'church' ? (
        <ChurchPicker
          chosen={church?.id ?? null}
          ownChurch={me.church_id ?? null}
          onClose={() => setSheet(null)}
          onPick={(c) => {
            setChurch(c ? { id: c.id, name: c.name, lat: c.lat, lng: c.lng } : null);
            setSheet(null);
          }}
        />
      ) : null}
    </div>
  );
}

/** Move the map until the pin sits on the place; a click on the map brings that spot to the pin. */
function PinPicker({ start, church, onClose, onDone }: { start: Point | null; church: ChurchChoice | null; onClose: () => void; onDone: (p: Point) => void }) {
  // Where the map opens: the pin, the church, where this computer is, or the world.
  const [view, setView] = useState<MapView | null>(start ? { ...start, z: 16 } : null);
  const [locating, setLocating] = useState(false);
  const anim = useRef(0);
  useEffect(() => {
    if (start) return;
    let live = true;
    (async () => {
      let c: { lat: number | null; lng: number | null } | null = church;
      if (church && church.lat === null) c = await fetchChurch(church.id).catch(() => null);
      if (c && c.lat !== null && c.lng !== null) {
        if (live) setView({ lat: c.lat, lng: c.lng as number, z: 15 });
        return;
      }
      try {
        const allowed = (await navigator.permissions?.query({ name: 'geolocation' as PermissionName }))?.state === 'granted';
        if (allowed) {
          const p = await locateMe();
          if (live) setView({ ...p, z: 14 });
          return;
        }
      } catch {
        // The whole world, then.
      }
      if (live) setView({ lat: 20, lng: 10, z: 2 });
    })();
    return () => {
      live = false;
    };
  }, []);

  async function toMe() {
    setLocating(true);
    try {
      const p = await locateMe();
      setView({ ...p, z: 16 });
    } catch (e) {
      toast((e as GeolocationPositionError)?.code === 1 ? t('events.locationOff') : t('events.noFix'));
    } finally {
      setLocating(false);
    }
  }

  function done() {
    if (!view) return;
    // Still looking at a whole country or more: not a place yet.
    if (view.z < 9) return toast(t('events.pinTitle'));
    onDone({ lat: view.lat, lng: view.lng });
  }

  return (
    <Modal title={t('events.pinTitle')} onClose={onClose} wide className="ev-pin-modal">
      <div className="ev-pin-stage">
        {view ? (
          <MapCanvas view={view} setView={setView as React.Dispatch<React.SetStateAction<MapView>>} anim={anim} points={[]} renderPin={() => null} className="ev-pin-canvas">
            <MapPin size={34} />
          </MapCanvas>
        ) : (
          <Spinner />
        )}
      </div>
      <div className="ev-pin-foot">
        <button type="button" className="ev-text-action" disabled={locating} onClick={toMe}>
          <Icon name="location" size={16} stroke={2.2} /> {t('events.useMyLocation')}
        </button>
        <button type="button" className="btn" disabled={!view} onClick={done}>
          {t('events.done')}
        </button>
      </div>
    </Modal>
  );
}

/** The church an event belongs to: my own first, then by name, with a search. */
function ChurchPicker({ chosen, ownChurch, onPick, onClose }: { chosen: string | null; ownChurch: string | null; onPick: (c: Church | null) => void; onClose: () => void }) {
  const [list, setList] = useState<Church[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [q, setQ] = useState('');
  const load = () => {
    setError(null);
    fetchChurches().then((all) => setList(all.filter((c) => c.status === 'approved')), setError);
  };
  useEffect(load, []);
  const needle = q.trim().toLowerCase();
  const shown = (list ?? [])
    .filter((c) => !needle || [c.name, c.city, c.country].some((s) => (s ?? '').toLowerCase().includes(needle)))
    .sort((a, b) => (a.id === ownChurch ? -1 : b.id === ownChurch ? 1 : a.name.localeCompare(b.name)));
  return (
    <Modal title={t('events.church')} onClose={onClose} className="share ev-church-modal">
      <div className="panel-search in-modal">
        <input autoFocus placeholder={t('events.searchChurches')} aria-label={t('events.searchChurches')} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="share-list" role="radiogroup" aria-label={t('events.church')}>
        {list === null ? error ? <Failed error={error} retry={load} /> : <Spinner /> : null}
        {list && !needle ? (
          <button type="button" role="radio" aria-checked={!chosen} className="row full hover ev-church-choice" onClick={() => onPick(null)}>
            <span className="ev-church-icon">
              <Icon name="close" size={18} />
            </span>
            <span className="row-text">
              <b>{t('events.none')}</b>
            </span>
            <span className={'ev-radio' + (!chosen ? ' on' : '')} aria-hidden="true" />
          </button>
        ) : null}
        {shown.map((c) => {
          const town = [c.city, c.country].map((s) => (s ?? '').trim()).filter(Boolean).join(', ');
          return (
            <button key={c.id} type="button" role="radio" aria-checked={chosen === c.id} className="row full hover ev-church-choice" onClick={() => onPick(c)}>
              <span className="ev-church-icon">
                <Icon name="church" size={20} />
              </span>
              <span className="row-text">
                <b>{c.name}</b>
                {town ? <span>{town}</span> : null}
              </span>
              <span className={'ev-radio' + (chosen === c.id ? ' on' : '')} aria-hidden="true" />
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
