// Lives planned ahead, from Go live: schedule one, move it, or see and cancel the ones coming up.
// The same rules as the iPhone app's sheet (src/components/LiveSchedule.tsx): a quarter-hour time at
// least five minutes from now and within 90 days of when it was first planned.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { cancelLiveSchedule, fetchLiveSchedules, scheduleLive, updateLiveSchedule } from 'shared/api';
import { dayLabel } from 'shared/theme';
import type { LiveSchedule } from 'shared/types';
import { dateLocale, languageCode, t } from '../lib/i18n';
import { useMe } from '../lib/me';
import { Icon, Modal, Spinner, ask, toast, toastError } from '../ui/kit';

const DAY_MS = 86400e3;
const AHEAD_MS = 90 * DAY_MS;
const STEP_MIN = 15;

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const weekday = (d: Date) => d.toLocaleDateString(dateLocale(), { weekday: 'short' });
/** "7:30 pm" in English; other languages write the time their own way. */
const timeOfDay = (d: Date) => {
  if (languageCode() !== 'en') return d.toLocaleTimeString(dateLocale(), { hour: 'numeric', minute: '2-digit' });
  const h = d.getHours();
  return `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
};
/** "12 Oct" in English; the browser's short date in other languages. */
const shortDay = (d: Date) => (languageCode() === 'en' ? dayLabel(d) : d.toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' }));

/** "Today 7:30 pm", "Tomorrow 9:00 am", "Sat 7:30 pm" within the week, then "Sat 12 Oct 7:30 pm". */
export function whenLabel(iso: string): string {
  const d = new Date(iso);
  const days = Math.round((startOfDay(d).getTime() - startOfDay(new Date()).getTime()) / DAY_MS);
  const day = days === 0 ? t('liveSchedule.today') : days === 1 ? t('liveSchedule.tomorrow') : days > 1 && days < 7 ? weekday(d) : `${weekday(d)} ${shortDay(d)}`;
  return `${day} ${timeOfDay(d)}`;
}

export function ScheduleDialog({ onClose }: { onClose: () => void }) {
  const { me } = useMe();
  const [view, setView] = useState<'list' | 'form'>('list');
  const [list, setList] = useState<LiveSchedule[] | null>(null);
  const [row, setRow] = useState<LiveSchedule | null>(null);
  const [title, setTitle] = useState('');
  const [day, setDay] = useState(0);
  const [minute, setMinute] = useState(-1);
  const [saving, setSaving] = useState(false);

  // The latest a live can be: 90 days from when it was first planned.
  const limit = useMemo(() => (row ? new Date(row.created_at).getTime() : Date.now()) + AHEAD_MS - 60e3, [row]);
  const today = startOfDay(new Date());
  const dayCount = Math.max(1, Math.floor((startOfDay(new Date(limit)).getTime() - today.getTime()) / DAY_MS) + 1);
  const dayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + day);
  // The quarter hours on that day still ahead and within the limit.
  const times = useMemo(() => {
    const out: number[] = [];
    const soonest = Date.now() + 5 * 60e3;
    for (let m = 0; m < 24 * 60; m += STEP_MIN) {
      const at = new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate(), 0, m).getTime();
      if (at >= soonest && at <= limit) out.push(m);
    }
    return out;
  }, [day, limit]);

  const startForm = useCallback((r: LiveSchedule | null) => {
    setRow(r);
    setTitle(r?.title ?? '');
    // A new plan starts on the hour, about an hour from now.
    const at = r ? new Date(r.starts_at) : new Date(Date.now() + 60 * 60e3);
    if (!r) at.setMinutes(0, 0, 0);
    setDay(Math.max(0, Math.round((startOfDay(at).getTime() - startOfDay(new Date()).getTime()) / DAY_MS)));
    setMinute(at.getHours() * 60 + at.getMinutes());
    setView('form');
  }, []);

  const load = useCallback(async () => {
    try {
      const rows = await fetchLiveSchedules(me.id);
      setList(rows);
      return rows;
    } catch (e) {
      toastError(e);
      setList([]);
      return [];
    }
  }, [me.id]);

  useEffect(() => {
    load().then((rows) => {
      if (!rows.length) startForm(null);
    });
  }, []);

  // A time no longer offered (another day picked, or it has passed) moves to the first that is.
  useEffect(() => {
    if (view === 'form' && times.length && !times.includes(minute)) setMinute(times[0]);
  }, [times, minute, view]);

  const save = async () => {
    if (saving || minute < 0) return;
    const at = new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate(), 0, minute);
    if (at.getTime() <= Date.now()) return toast(t('liveSchedule.pickLater'));
    setSaving(true);
    try {
      if (row) await updateLiveSchedule(row.id, title, at);
      else await scheduleLive(me.id, title, at);
      toast(t('liveSchedule.saved', { when: whenLabel(at.toISOString()) }));
      const rows = await load();
      if (rows.length) setView('list');
      else onClose();
    } catch (e) {
      toastError(e);
    } finally {
      setSaving(false);
    }
  };

  const cancel = async (r: LiveSchedule) => {
    if (!(await ask(t('liveSchedule.cancelQuestion'), r.title || whenLabel(r.starts_at), t('liveSchedule.cancelLive')))) return;
    try {
      await cancelLiveSchedule(r.id);
      toast(t('d.frame.liveCancelled'));
      await load();
    } catch (e) {
      toastError(e);
    }
  };

  return (
    <Modal onClose={onClose} title={view === 'form' ? (row ? t('liveSchedule.editTitle') : t('liveSchedule.title')) : t('liveSchedule.upcoming')} className="sv-sheet lv-schedule">
      {view === 'list' ? (
        <div className="lv-sched-list">
          {list === null ? <Spinner /> : null}
          {list && !list.length ? <p className="sv-settings-note lv-sched-empty">{t('d.frame.noLives')}</p> : null}
          {(list ?? []).map((r) => (
            <div key={r.id} className="row lv-sched-row">
              <button className="row-main" onClick={() => startForm(r)} aria-label={t('d.frame.editLive', { title: r.title || t('liveSchedule.live'), when: whenLabel(r.starts_at) })}>
                <span className="lv-cal">
                  <Icon name="calendar" size={20} />
                </span>
                <span className="row-text">
                  <b>{r.title || t('liveSchedule.live')}</b>
                  <span>{whenLabel(r.starts_at)}</span>
                </span>
              </button>
              <button className="btn quiet small" onClick={() => cancel(r)}>
                {t('liveSchedule.cancel')}
              </button>
            </div>
          ))}
          <div className="modal-foot">
            <button className="btn block" onClick={() => startForm(null)}>
              {t('liveSchedule.scheduleNew')}
            </button>
          </div>
        </div>
      ) : (
        <form
          className="lv-sched-form"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <label className="lv-field-row">
            <span>{t('ssPub.title')}</span>
            <input value={title} maxLength={120} placeholder={t('liveSetup.titlePlaceholder')} aria-label={t('goLive.titleLabel')} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <div className="lv-pick-row">
            <label className="lv-field-row">
              <span>{t('d.frame.day')}</span>
              <select value={day} aria-label={t('d.frame.day')} onChange={(e) => setDay(Number(e.target.value))}>
                {Array.from({ length: dayCount }, (_, i) => {
                  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
                  return (
                    <option key={i} value={i}>
                      {i === 0 ? t('liveSchedule.today') : i === 1 ? t('liveSchedule.tomorrow') : weekday(d)}, {shortDay(d)}
                    </option>
                  );
                })}
              </select>
            </label>
            <label className="lv-field-row">
              <span>{t('d.frame.time')}</span>
              <select value={minute} aria-label={t('d.frame.time')} onChange={(e) => setMinute(Number(e.target.value))} disabled={!times.length}>
                {times.map((m) => (
                  <option key={m} value={m}>
                    {timeOfDay(new Date(2000, 0, 1, 0, m))}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {!times.length ? <p className="sv-settings-note">{t('d.frame.noTimes')}</p> : null}
          <div className="lv-sched-actions">
            {list?.length ? (
              <button type="button" className="btn quiet" onClick={() => setView('list')}>
                {t('common.back')}
              </button>
            ) : null}
            <button className="btn grow" disabled={saving || minute < 0 || !times.length}>
              {saving ? t('d.frame.saving') : row ? t('liveSchedule.saveChanges') : t('liveSchedule.schedule')}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
