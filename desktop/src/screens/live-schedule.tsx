// Lives planned ahead, from Go live: schedule one, move it, or see and cancel the ones coming up.
// The same rules as the iPhone app's sheet (src/components/LiveSchedule.tsx): a quarter-hour time at
// least five minutes from now and within 90 days of when it was first planned.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { cancelLiveSchedule, fetchLiveSchedules, scheduleLive, updateLiveSchedule } from 'shared/api';
import { dayLabel } from 'shared/theme';
import type { LiveSchedule } from 'shared/types';
import { useMe } from '../lib/me';
import { Icon, Modal, Spinner, ask, toast, toastError } from '../ui/kit';

const DAY_MS = 86400e3;
const AHEAD_MS = 90 * DAY_MS;
const STEP_MIN = 15;

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const weekday = (d: Date) => d.toLocaleDateString('en-GB', { weekday: 'short' });
const timeOfDay = (d: Date) => {
  const h = d.getHours();
  return `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
};

/** "Today 7:30 pm", "Tomorrow 9:00 am", "Sat 7:30 pm" within the week, then "Sat 12 Oct 7:30 pm". */
export function whenLabel(iso: string): string {
  const d = new Date(iso);
  const days = Math.round((startOfDay(d).getTime() - startOfDay(new Date()).getTime()) / DAY_MS);
  const day = days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : days > 1 && days < 7 ? weekday(d) : `${weekday(d)} ${dayLabel(d)}`;
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
    if (at.getTime() <= Date.now()) return toast('Pick a time later than now.');
    setSaving(true);
    try {
      if (row) await updateLiveSchedule(row.id, title, at);
      else await scheduleLive(me.id, title, at);
      toast(`Scheduled for ${whenLabel(at.toISOString())}`);
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
    if (!(await ask('Cancel this live?', r.title || whenLabel(r.starts_at), 'Cancel live'))) return;
    try {
      await cancelLiveSchedule(r.id);
      toast('Live cancelled');
      await load();
    } catch (e) {
      toastError(e);
    }
  };

  return (
    <Modal onClose={onClose} title={view === 'form' ? (row ? 'Edit live' : 'Schedule a live') : 'Upcoming lives'} className="st-sheet lv-schedule">
      {view === 'list' ? (
        <div className="lv-sched-list">
          {list === null ? <Spinner /> : null}
          {list && !list.length ? <p className="st-settings-note lv-sched-empty">No lives planned.</p> : null}
          {(list ?? []).map((r) => (
            <div key={r.id} className="row lv-sched-row">
              <button className="row-main" onClick={() => startForm(r)} aria-label={`Edit ${r.title || 'Live'}, ${whenLabel(r.starts_at)}`}>
                <span className="lv-cal">
                  <Icon name="calendar" size={20} />
                </span>
                <span className="row-text">
                  <b>{r.title || 'Live'}</b>
                  <span>{whenLabel(r.starts_at)}</span>
                </span>
              </button>
              <button className="btn quiet small" onClick={() => cancel(r)}>
                Cancel
              </button>
            </div>
          ))}
          <div className="modal-foot">
            <button className="btn block" onClick={() => startForm(null)}>
              Schedule a live
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
            <span>Title</span>
            <input value={title} maxLength={120} placeholder="Add a title…" aria-label="Live title" onChange={(e) => setTitle(e.target.value)} />
          </label>
          <div className="lv-pick-row">
            <label className="lv-field-row">
              <span>Day</span>
              <select value={day} aria-label="Day" onChange={(e) => setDay(Number(e.target.value))}>
                {Array.from({ length: dayCount }, (_, i) => {
                  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
                  return (
                    <option key={i} value={i}>
                      {i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : weekday(d)}, {dayLabel(d)}
                    </option>
                  );
                })}
              </select>
            </label>
            <label className="lv-field-row">
              <span>Time</span>
              <select value={minute} aria-label="Time" onChange={(e) => setMinute(Number(e.target.value))} disabled={!times.length}>
                {times.map((m) => (
                  <option key={m} value={m}>
                    {timeOfDay(new Date(2000, 0, 1, 0, m))}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {!times.length ? <p className="st-settings-note">No times left that day. Pick another day.</p> : null}
          <p className="st-settings-note">People who follow you see it on your profile and can ask to be reminded.</p>
          <div className="lv-sched-actions">
            {list?.length ? (
              <button type="button" className="btn quiet" onClick={() => setView('list')}>
                Back
              </button>
            ) : null}
            <button className="btn grow" disabled={saving || minute < 0 || !times.length}>
              {saving ? 'Saving…' : row ? 'Save changes' : 'Schedule'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
