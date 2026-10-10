import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { cancelLiveSchedule, fetchLiveSchedules, hasLiveReminder, scheduleLive, setLiveReminder, updateLiveSchedule } from '../lib/api';
import { tap } from '../lib/haptics';
import { useT } from '../lib/i18n';
import { useSession } from '../lib/session';
import { C, dayLabel, errText } from '../lib/theme';
import type { LiveSchedule } from '../lib/types';
import { Icon } from './Icon';
import { LIVE_RED } from './LiveBadge';
import { Button, Sheet, useToast } from './ui';

/*
 * Lives planned ahead: the sheet that schedules, moves and cancels them (from Go live, and Edit on
 * the profile card), and the card on a profile with the next one and Remind me.
 */

const DAY_MS = 86400e3;
/** The database takes lives up to 90 days after the plan was made. */
const AHEAD_MS = 90 * DAY_MS;
/** Times are offered every quarter of an hour. */
const STEP_MIN = 15;
const DAY_CHIP = 64;
const TIME_CHIP = 84;
const GAP = 8;

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

function weekday(d: Date): string {
  try {
    return d.toLocaleDateString(undefined, { weekday: 'short' });
  } catch {
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
  }
}

function timeOfDay(d: Date): string {
  try {
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  } catch {
    return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
}

/** "Today 7:30 pm", "Tomorrow 9:00 am", "Sat 7:30 pm" within the week, then "Sat 12 Oct 7:30 pm". */
export function useWhen() {
  const t = useT();
  return useCallback(
    (iso: string) => {
      const d = new Date(iso);
      const days = Math.round((startOfDay(d).getTime() - startOfDay(new Date()).getTime()) / DAY_MS);
      const day = days === 0 ? t('liveSchedule.today') : days === 1 ? t('liveSchedule.tomorrow') : days > 1 && days < 7 ? weekday(d) : `${weekday(d)} ${dayLabel(d)}`;
      return `${day} ${timeOfDay(d)}`;
    },
    [t],
  );
}

/** Schedule a new live, change one, or see and cancel the ones coming up. `editing` opens straight on that one. */
export function ScheduleSheet({ visible, onClose, editing, onSaved }: { visible: boolean; onClose: () => void; editing?: LiveSchedule | null; onSaved?: () => void }) {
  const t = useT();
  const toast = useToast();
  const when = useWhen();
  const { me } = useSession();
  const [view, setView] = useState<'list' | 'form'>('list');
  const [list, setList] = useState<LiveSchedule[] | null>(null);
  const [row, setRow] = useState<LiveSchedule | null>(null);
  const [title, setTitle] = useState('');
  const [day, setDay] = useState(0);
  const [minute, setMinute] = useState(-1);
  const [saving, setSaving] = useState(false);
  const timesRef = useRef<ScrollView>(null);
  const daysRef = useRef<ScrollView>(null);

  // The latest a live can be: 90 days from when it was first planned.
  const limit = useMemo(() => (row ? new Date(row.created_at).getTime() : Date.now()) + AHEAD_MS - 60e3, [row]);
  const today = startOfDay(new Date());
  const dayCount = Math.max(1, Math.floor((startOfDay(new Date(limit)).getTime() - today.getTime()) / DAY_MS) + 1);
  const dayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + day);
  // The quarter hours on that day that are still ahead and within the limit.
  const times = useMemo(() => {
    const out: number[] = [];
    const soonest = Date.now() + 5 * 60e3;
    for (let m = 0; m < 24 * 60; m += STEP_MIN) {
      const at = new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate(), 0, m).getTime();
      if (at >= soonest && at <= limit) out.push(m);
    }
    return out;
    // dayDate is made from `day`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day, limit]);

  const startForm = useCallback((r: LiveSchedule | null) => {
    setRow(r);
    setTitle(r?.title ?? '');
    // A new plan starts on the hour, about an hour from now.
    const at = r ? new Date(r.starts_at) : new Date(Date.now() + 60 * 60e3);
    if (!r) at.setMinutes(0, 0, 0);
    const d = Math.max(0, Math.round((startOfDay(at).getTime() - startOfDay(new Date()).getTime()) / DAY_MS));
    setDay(d);
    setMinute(at.getHours() * 60 + at.getMinutes());
    setView('form');
  }, []);

  const load = useCallback(async () => {
    try {
      const rows = await fetchLiveSchedules(me);
      setList(rows);
      return rows;
    } catch (e) {
      toast(errText(e));
      setList([]);
      return [];
    }
  }, [me, toast]);

  useEffect(() => {
    if (!visible) return;
    if (editing) {
      startForm(editing);
      return;
    }
    setView('list');
    setList(null);
    load().then((rows) => {
      if (!rows.length) startForm(null);
    });
  }, [visible, editing, load, startForm]);

  // A time that is no longer offered (another day picked, or it has passed) moves to the first one that is.
  useEffect(() => {
    if (view !== 'form' || !times.length) return;
    if (!times.includes(minute)) setMinute(times[0]);
  }, [times, minute, view]);

  // Keep the chosen day and time in sight.
  useEffect(() => {
    if (view !== 'form') return;
    const i = times.indexOf(minute);
    const id = setTimeout(() => {
      if (i >= 0) timesRef.current?.scrollTo({ x: Math.max(0, i * (TIME_CHIP + GAP) - 80), animated: false });
      daysRef.current?.scrollTo({ x: Math.max(0, day * (DAY_CHIP + GAP) - 80), animated: false });
    }, 60);
    return () => clearTimeout(id);
    // Only when the form opens or the day changes; scrolling on every tap would fight the finger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, day]);

  async function save() {
    if (saving || minute < 0) return;
    const at = new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate(), 0, minute);
    if (at.getTime() <= Date.now()) {
      toast(t('liveSchedule.pickLater'));
      return;
    }
    setSaving(true);
    try {
      if (row) await updateLiveSchedule(row.id, title, at);
      else await scheduleLive(me, title, at);
      tap('success');
      toast(t('liveSchedule.saved', { when: when(at.toISOString()) }));
      onSaved?.();
      if (editing) onClose();
      else {
        const rows = await load();
        if (rows.length) setView('list');
        else onClose();
      }
    } catch (e) {
      toast(errText(e));
    } finally {
      setSaving(false);
    }
  }

  function cancel(r: LiveSchedule) {
    Alert.alert(t('liveSchedule.cancelQuestion'), r.title || when(r.starts_at), [
      { text: t('liveSchedule.keep'), style: 'cancel' },
      {
        text: t('liveSchedule.cancelLive'),
        style: 'destructive',
        onPress: async () => {
          try {
            await cancelLiveSchedule(r.id);
            onSaved?.();
            const rows = await load();
            if (!rows.length) onClose();
          } catch (e) {
            toast(errText(e));
          }
        },
      },
    ]);
  }

  return (
    <Sheet visible={visible} onClose={onClose} title={view === 'form' ? (row ? t('liveSchedule.editTitle') : t('liveSchedule.title')) : t('liveSchedule.upcoming')}>
      {view === 'list' ? (
        <View style={{ paddingBottom: 6 }}>
          {list === null ? (
            <ActivityIndicator color={C.fg2} style={{ padding: 24 }} />
          ) : (
            list.map((r) => (
              <Pressable key={r.id} onPress={() => startForm(r)} accessibilityRole="button" accessibilityLabel={`${r.title || t('liveSchedule.live')}, ${when(r.starts_at)}`} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 18, paddingRight: 12, minHeight: 58, backgroundColor: pressed ? C.press : 'transparent' })}>
                <Icon name="calendar" size={22} color={C.fg} />
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ color: C.fg, fontSize: 16, fontWeight: '600' }}>{r.title || t('liveSchedule.live')}</Text>
                  <Text style={{ color: C.fg2, fontSize: 13.5 }}>{when(r.starts_at)}</Text>
                </View>
                <Button small kind="ghost" label={t('liveSchedule.cancel')} onPress={() => cancel(r)} />
              </Pressable>
            ))
          )}
          <Button label={t('liveSchedule.scheduleNew')} onPress={() => startForm(null)} style={{ marginHorizontal: 16, marginTop: 10 }} />
        </View>
      ) : (
        <View style={{ gap: 14, paddingBottom: 6 }}>
          <TextInput value={title} onChangeText={setTitle} placeholder={t('liveSetup.titlePlaceholder')} placeholderTextColor={C.fg3} maxLength={120} keyboardAppearance={C.blurTint} style={{ marginHorizontal: 16, color: C.fg, fontSize: 16, paddingHorizontal: 14, paddingVertical: 13, borderRadius: 12, backgroundColor: C.field }} accessibilityLabel={t('goLive.titleLabel')} />
          <ScrollView ref={daysRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: GAP }}>
            {Array.from({ length: dayCount }, (_, i) => {
              const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
              const on = i === day;
              const top = i === 0 ? t('liveSchedule.today') : i === 1 ? t('liveSchedule.tomorrow') : weekday(d);
              return (
                <Pressable key={i} onPress={() => setDay(i)} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={`${top} ${dayLabel(d)}`} style={({ pressed }) => ({ width: DAY_CHIP, height: 58, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? C.accent : C.surface, opacity: pressed ? 0.75 : 1 })}>
                  <Text numberOfLines={1} style={{ color: on ? C.onAccent : C.fg2, fontSize: 12, fontWeight: '600' }}>{top}</Text>
                  <Text style={{ color: on ? C.onAccent : C.fg, fontSize: 15, fontWeight: '700', marginTop: 2 }}>{dayLabel(d)}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <ScrollView ref={timesRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: GAP }}>
            {times.map((m) => {
              const on = m === minute;
              const label = timeOfDay(new Date(2000, 0, 1, 0, m));
              return (
                <Pressable key={m} onPress={() => setMinute(m)} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={label} style={({ pressed }) => ({ width: TIME_CHIP, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? C.accent : C.surface, opacity: pressed ? 0.75 : 1 })}>
                  <Text style={{ color: on ? C.onAccent : C.fg, fontSize: 14.5, fontWeight: '600' }}>{label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <Button label={row ? t('liveSchedule.saveChanges') : t('liveSchedule.schedule')} busy={saving} disabled={minute < 0 || !times.length} onPress={save} style={{ marginHorizontal: 16 }} />
        </View>
      )}
    </Sheet>
  );
}

/**
 * The next planned live on a profile: "Live · Sat 7:30 pm · title". Others get Remind me; the owner
 * gets Edit and Cancel. Nothing is drawn when none is planned.
 */
export function ScheduledLiveCard({ userId, mine, refreshKey }: { userId: string; mine: boolean; refreshKey?: number }) {
  const t = useT();
  const toast = useToast();
  const when = useWhen();
  const { me } = useSession();
  const [next, setNext] = useState<LiveSchedule | null>(null);
  const [reminded, setReminded] = useState(false);
  const [editing, setEditing] = useState(false);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const load = useCallback(async () => {
    try {
      const rows = await fetchLiveSchedules(userId);
      const first = rows[0] ?? null;
      if (!alive.current) return;
      setNext(first);
      if (first && !mine) {
        const on = await hasLiveReminder(me, first.id);
        if (alive.current) setReminded(on);
      }
    } catch {
      // The card is extra: if it doesn't load, the profile simply goes without it.
    }
  }, [userId, mine, me]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);
  // Back from Go live, where a live may have been planned.
  useFocusEffect(useCallback(() => { if (mine) load(); }, [mine, load]));

  if (!next) return null;

  function remind() {
    if (!next) return;
    const on = !reminded;
    tap('select');
    setReminded(on);
    setLiveReminder(me, next.id, on)
      .then(() => toast(on ? t('liveSchedule.reminderOn') : t('liveSchedule.reminderOff')))
      .catch((e) => {
        if (alive.current) setReminded(!on);
        toast(errText(e));
      });
  }

  function cancel() {
    if (!next) return;
    const r = next;
    Alert.alert(t('liveSchedule.cancelQuestion'), r.title || when(r.starts_at), [
      { text: t('liveSchedule.keep'), style: 'cancel' },
      { text: t('liveSchedule.cancelLive'), style: 'destructive', onPress: () => { cancelLiveSchedule(r.id).then(load).catch((e) => toast(errText(e))); } },
    ]);
  }

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12, paddingLeft: 12, paddingRight: 8, paddingVertical: 10, borderRadius: 14, backgroundColor: C.surface }}>
      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: LIVE_RED, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="live" size={20} color="#fff" weight={2.1} />
      </View>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ color: C.fg, fontWeight: '700', fontSize: 14.5 }}>{`${t('liveSchedule.live')} · ${when(next.starts_at)}`}</Text>
        {next.title ? <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 13.5, marginTop: 1 }}>{next.title}</Text> : null}
      </View>
      {mine ? (
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <Button small kind="ghost" label={t('liveSchedule.edit')} onPress={() => setEditing(true)} />
          <Button small kind="ghost" label={t('liveSchedule.cancel')} onPress={cancel} />
        </View>
      ) : (
        <Button small kind={reminded ? 'ghost' : 'primary'} label={reminded ? t('liveSchedule.reminderSet') : t('liveSchedule.remindMe')} onPress={remind} />
      )}
      {mine ? <ScheduleSheet visible={editing} onClose={() => setEditing(false)} editing={next} onSaved={load} /> : null}
    </View>
  );
}
