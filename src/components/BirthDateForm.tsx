import React, { useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLogOut } from '../lib/accounts';
import { blockDeviceForAge, isDeviceAgeBlocked, isUnder13, requestChildClosure } from '../lib/age';
import { ageFrom, MINOR_AGE, setBirthDate } from '../lib/api';
import { useAppFont } from '../lib/fonts';
import { useSession } from '../lib/session';
import { C, DARK, errText } from '../lib/theme';
import type { Profile } from '../lib/types';
import { FieldRevealProvider, useFieldReveal, useKeyboardReveal } from './AuthShell';
import { Icon, IconName, Mark } from './Icon';
import { Button } from './ui';

/* ---------- the date itself ---------- */

/** What the three boxes hold, as typed (digits only). */
export type BirthParts = { day: string; month: string; year: string };
export const EMPTY_BIRTH: BirthParts = { day: '', month: '', year: '' };

/** Shown under the boxes wherever the birthday is asked for. */
export const BIRTHDAY_NOTE = "This won't be on your profile. It's used to keep younger members safe.";

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Checks the three boxes: a real date, not in the future, and an age from 5 to 120. Returns the
 * date as YYYY-MM-DD with the age it gives, or what is wrong in a sentence.
 */
export function checkBirthDate(p: BirthParts, now = new Date()): { iso: string; age: number } | { error: string } {
  if (!p.day || !p.month || !p.year) return { error: 'Add your birthday: day, month and year.' };
  if (p.year.length !== 4) return { error: 'Write the year in full, for example 2010.' };
  const d = Number(p.day);
  const m = Number(p.month);
  const y = Number(p.year);
  if (m < 1 || m > 12) return { error: 'The month is a number from 1 to 12.' };
  // Day 0 of the next month is the last day of this one, which also gets 29 February right.
  const days = new Date(y, m, 0).getDate();
  if (d < 1 || d > days) return { error: `That month only has ${days} days.` };
  if (new Date(y, m - 1, d).getTime() > now.getTime()) return { error: "That date hasn't happened yet." };
  const iso = `${y}-${pad(m)}-${pad(d)}`;
  const age = ageFrom(iso, now);
  if (age < 5) return { error: 'Check the year: members need to be at least 5.' };
  if (age > 120) return { error: 'Check the year: that would make you older than 120.' };
  return { iso, age };
}

/**
 * Day / Month / Year as three small number boxes (there is no date picker in the app). Typing a
 * full day or month moves on to the next box, so the date can be typed in one go.
 */
export function BirthDateInput({ value, onChange, error, editable = true, dark = false, note = BIRTHDAY_NOTE }: { value: BirthParts; onChange: (next: BirthParts) => void; error?: string; editable?: boolean; dark?: boolean; note?: string }) {
  // On the sign-up pages (always dark) the boxes use the dark colours whatever the theme.
  const P = dark ? DARK : C;
  const font = useAppFont();
  const month = useRef<TextInput>(null);
  const year = useRef<TextInput>(null);
  // The page around the boxes keeps them, and the button under them, above the keyboard (useKeyboardReveal).
  const reveal = useFieldReveal();
  const digits = (t: string, max: number) => t.replace(/\D/g, '').slice(0, max);
  const box = { color: P.fg, fontSize: 17, textAlign: 'center' as const, paddingHorizontal: 10, paddingVertical: 13, borderRadius: 12, backgroundColor: P.surface, fontFamily: font, fontVariant: ['tabular-nums' as const] };
  const label = { color: P.fg2, fontSize: 12.5, fontFamily: font };
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={label}>Day</Text>
          <TextInput
            value={value.day}
            onChangeText={(t) => {
              const day = digits(t, 2);
              onChange({ ...value, day });
              if (day.length === 2) month.current?.focus();
            }}
            placeholder="DD"
            placeholderTextColor={P.fg3}
            keyboardType="number-pad"
            maxLength={2}
            editable={editable}
            textContentType="birthdateDay"
            autoComplete="birthdate-day"
            keyboardAppearance={P.blurTint}
            selectionColor={P.accent2}
            returnKeyType="next"
            accessibilityLabel="Birthday, day"
            onFocus={reveal?.onFocus}
            onBlur={reveal?.onBlur}
            style={box}
          />
        </View>
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={label}>Month</Text>
          <TextInput
            ref={month}
            value={value.month}
            onChangeText={(t) => {
              const m = digits(t, 2);
              onChange({ ...value, month: m });
              if (m.length === 2) year.current?.focus();
            }}
            placeholder="MM"
            placeholderTextColor={P.fg3}
            keyboardType="number-pad"
            maxLength={2}
            editable={editable}
            textContentType="birthdateMonth"
            autoComplete="birthdate-month"
            keyboardAppearance={P.blurTint}
            selectionColor={P.accent2}
            returnKeyType="next"
            accessibilityLabel="Birthday, month as a number"
            onFocus={reveal?.onFocus}
            onBlur={reveal?.onBlur}
            style={box}
          />
        </View>
        <View style={{ flex: 1.4, gap: 6 }}>
          <Text style={label}>Year</Text>
          <TextInput
            ref={year}
            value={value.year}
            onChangeText={(t) => onChange({ ...value, year: digits(t, 4) })}
            placeholder="YYYY"
            placeholderTextColor={P.fg3}
            keyboardType="number-pad"
            maxLength={4}
            editable={editable}
            textContentType="birthdateYear"
            autoComplete="birthdate-year"
            keyboardAppearance={P.blurTint}
            selectionColor={P.accent2}
            accessibilityLabel="Birthday, year"
            onFocus={reveal?.onFocus}
            onBlur={reveal?.onBlur}
            style={box}
          />
        </View>
      </View>
      {error ? <Text style={{ color: P.like, fontSize: 13, fontFamily: font }} accessibilityLiveRegion="polite">{error}</Text> : null}
      <Text style={{ color: P.fg3, fontSize: 13, lineHeight: 18, fontFamily: font }}>{note}</Text>
    </View>
  );
}

/* ---------- what an under-14 account means ---------- */

const MINOR_RULES: { icon: IconName; text: string }[] = [
  { icon: 'lock', text: 'Your account stays private: only people you approve see your posts and stories.' },
  { icon: 'shield', text: 'Posts marked as sensitive are hidden from you.' },
  { icon: 'send', text: 'You can only message and call people you follow, and only people you follow can message or call you.' },
  { icon: 'info', text: "Live broadcasts and fundraisers aren't available." },
];

/** The list of what changes for a member under 14. */
export function MinorRules() {
  const font = useAppFont();
  return (
    <View style={{ gap: 14 }}>
      {MINOR_RULES.map((r) => (
        <View key={r.text} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
          <Icon name={r.icon} size={22} color={C.accent2} />
          <Text style={{ flex: 1, color: C.fg, fontSize: 15.5, lineHeight: 21, fontFamily: font }}>{r.text}</Text>
        </View>
      ))}
    </View>
  );
}

/* ---------- remembering, for this app session, that the birthday was given ---------- */

/*
 * Saving the birthday reloads the profile (setBirthDate announces it), which closes the gate or the
 * onboarding screen at once. So whether it was saved, and whether the under-14 notice still has to
 * be shown, live here rather than in the screen that saved it. The gate also stops asking as soon as
 * it is saved, even if the reload is slow or fails, so it can never ask twice. Both hold the account
 * id they belong to, so another account signing in on this phone never sees them.
 */
type GateState = { savedFor: string; minorFor: string };
let gate: GateState = { savedFor: '', minorFor: '' };
const watchers = new Set<() => void>();

function setGate(next: Partial<GateState>) {
  gate = { ...gate, ...next };
  watchers.forEach((w) => w());
}

function subscribe(w: () => void) {
  watchers.add(w);
  return () => {
    watchers.delete(w);
  };
}

const snapshot = () => gate;

/** Call once the birthday is saved for `me`: the gate stops asking, and an under-14 member is told once what that means. */
export function noteBirthDateSaved(me: string, age: number) {
  setGate({ savedFor: me, minorFor: age < MINOR_AGE ? me : '' });
}

/**
 * True while the app should show the birthday step instead of itself: the database still needs the
 * signed-in member's birthday (and it hasn't just been given), or the under-14 notice is waiting.
 */
export function useBirthDateGate(me: string, profile: Profile | null): boolean {
  const g = useSyncExternalStore(subscribe, snapshot, snapshot);
  if (!me || !profile) return false;
  return (profile.needs_birth_date === true && g.savedFor !== me) || g.minorFor === me;
}

/* ---------- the full-screen step ---------- */

function Page({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  // The birthday boxes, with Save under them, stay above the number pad on a small phone.
  const kb = useKeyboardReveal(110);
  const reveal = useMemo(() => ({ onFocus: kb.onFocus, onBlur: kb.onBlur }), [kb.onFocus, kb.onBlur]);
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        ref={kb.ref}
        onScroll={kb.onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24, gap: 16 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag">
        <FieldRevealProvider value={reveal}>{children}</FieldRevealProvider>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/**
 * "Add your birthday": shown instead of the app to members who haven't given it yet. It is
 * required, so there is only the date and a Save button. A member under 14 then sees, once, what
 * their account is set up to do.
 */
export function BirthDateGate() {
  const { me, refresh } = useSession();
  // Only this account: another one signed in on this phone takes over.
  const signOut = useLogOut();
  const router = useRouter();
  const g = useSyncExternalStore(subscribe, snapshot, snapshot);
  const font = useAppFont();
  const fontBold = useAppFont('bold');
  const [parts, setParts] = useState<BirthParts>(EMPTY_BIRTH);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  // A ref as well: a quick second tap on Save arrives before `busy` has drawn.
  const busyRef = useRef(false);

  async function save() {
    if (busy || busyRef.current) return;
    const checked = checkBirthDate(parts);
    if ('error' in checked) {
      setErr(checked.error);
      return;
    }
    setErr('');
    busyRef.current = true;
    setBusy(true);
    try {
      if (await isDeviceAgeBlocked()) {
        // Someone on this phone said they were under 13 in the last day, so no date given here counts
        // and nothing is saved. This account may well be a grown-up's, so it is only signed out, never
        // deleted (no closure is asked for): the sorry screen explains.
        router.replace('/cannot-join');
        signOut().catch(() => {});
        return;
      }
      await setBirthDate(me, checked.iso);
      if (isUnder13(checked.iso)) {
        // Under 13: the server has just closed the account for good. The sorry screen deletes the
        // sign-in account and signs out; the app layout would otherwise show it as deactivated.
        requestChildClosure(me);
        blockDeviceForAge();
        router.replace('/cannot-join?closed=1');
        return;
      }
      noteBirthDateSaved(me, checked.age);
      // The profile reloads with the under-14 rules (and without needs_birth_date). A failed reload
      // doesn't matter here: the gate already knows it was saved.
      refresh().catch(() => {});
    } catch (e) {
      setErr(errText(e));
      busyRef.current = false;
      setBusy(false);
      // The birthday may have reached the database with only the reply lost. Ask again: if it was
      // saved, the profile comes back without needs_birth_date and the gate goes away by itself.
      refresh().catch(() => {});
    }
  }

  function logOut() {
    signOut().catch((e: unknown) => setErr(errText(e)));
  }

  if (g.minorFor && g.minorFor === me) {
    return (
      <Page>
        <View style={{ alignItems: 'center', gap: 12 }}>
          <Mark size={56} />
          <Text accessibilityRole="header" style={{ color: C.fg, fontSize: 22, fontWeight: '800', textAlign: 'center', fontFamily: fontBold }}>Your account is set up for members under 14</Text>
          <Text style={{ color: C.fg2, textAlign: 'center', lineHeight: 21, fontFamily: font }}>To help keep you safe on Community:</Text>
        </View>
        <MinorRules />
        <Button label="Continue" onPress={() => setGate({ minorFor: '' })} style={{ marginTop: 8 }} />
      </Page>
    );
  }

  return (
    <Page>
      <View style={{ alignItems: 'center', gap: 12 }}>
        <Icon name="calendar" size={48} color={C.accent2} />
        <Text accessibilityRole="header" style={{ color: C.fg, fontSize: 22, fontWeight: '800', textAlign: 'center', fontFamily: fontBold }}>Add your birthday</Text>
        <Text style={{ color: C.fg2, textAlign: 'center', lineHeight: 21, fontFamily: font }}>We ask everyone for their birthday so Community can keep younger members safe.</Text>
      </View>
      <BirthDateInput value={parts} onChange={(p) => { setParts(p); if (err) setErr(''); }} error={err} editable={!busy} />
      <Button label="Save" onPress={save} busy={busy} style={{ marginTop: 4 }} />
      {/* A way out for someone on the wrong account, or who would rather not say: quiet, under Save. */}
      <Pressable onPress={logOut} hitSlop={8} accessibilityRole="button" accessibilityLabel="Log out" style={({ pressed }) => ({ alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 12, opacity: pressed ? 0.6 : 1 })}>
        <Text style={{ color: C.fg2, fontSize: 15, fontFamily: font }}>Log out</Text>
      </Pressable>
    </Page>
  );
}
