import React, { useEffect, useRef, useState } from 'react';
import { Linking, Platform, Pressable, Text, TextInput, View } from 'react-native';
import Constants from 'expo-constants';
import { usePathname } from 'expo-router';
import { sendFeedback } from '../lib/api';
import { useCalls } from '../lib/calls';
import { useAppFont } from '../lib/fonts';
import { tap } from '../lib/haptics';
import { type Key, useT } from '../lib/i18n';
import { getPrefs, setPrefs } from '../lib/prefs';
import { useSession } from '../lib/session';
import { C, errText } from '../lib/theme';
import { isMediaRoute, useKeyboardOpen } from './AssistiveButton';
import { Icon } from './Icon';
import { Button, Sheet, useToast } from './ui';

/*
 * Now and then, "Enjoying Community?": a short question with stars and room for a sentence. It comes
 * at most once per launch, only to members who have used the app a while (6 opens, an account at
 * least 3 days old), and not again for 21 days after it was last shown, whatever the answer. Happy
 * members (4 or 5 stars) are then offered the phone's own App Store rating card.
 */

const DAY = 86400e3;
const MIN_OPENS = 6;
const GAP_DAYS = 21;
const ACCOUNT_DAYS = 3;
const DELAY_MS = 20000;

// Kept outside the component: the app's screens are drawn again from scratch when the theme changes,
// and neither the count nor the question should happen twice in one launch because of that.
const launchedAt = Date.now();
let counted = false;
let askedThisLaunch = false;

/* ---------- shared with Help ---------- */

/** The version in the app's settings, sent with feedback so problems can be matched to a release. */
export function appVersion(): string {
  return String(Constants.expoConfig?.version ?? '');
}

type StoreReviewApi = typeof import('expo-store-review');

/**
 * The store-review module, or null. Loaded lazily and guarded: an update can reach a phone whose
 * build doesn't have the native part yet, and that should only lose the rating card, not the app.
 */
function storeReview(): StoreReviewApi | null {
  try {
    return require('expo-store-review') as StoreReviewApi;
  } catch {
    return null;
  }
}

/**
 * Asks the phone to show its own rating card. With `orOpenStore`, falls back to the app's store page
 * when the card isn't available (Help's button, which the member pressed on purpose). Resolves false
 * when there was nothing to show.
 */
export async function askForStoreRating(orOpenStore = false): Promise<boolean> {
  const sr = storeReview();
  if (!sr) return false;
  try {
    if (await sr.isAvailableAsync()) {
      await sr.requestReview();
      return true;
    }
    if (!orOpenStore) return false;
    const url = sr.storeUrl();
    if (!url) return false;
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

/** "Rate us on the App Store" or "… on Google Play", as fits the phone. A key: look it up with t() as it draws. */
export const STORE_LABEL: Key = Platform.OS === 'android' ? 'feedback.rateGooglePlay' : 'feedback.rateAppStore';

/** What each number of stars means, as keys; [0] is unused. */
const STAR_WORDS: Key[] = ['feedback.tapStar', 'feedback.poor', 'feedback.notGreat', 'feedback.okay', 'feedback.good', 'feedback.loveIt'];

/** One to five stars, as big buttons. */
export function StarPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const font = useAppFont();
  const t = useT();
  return (
    <View style={{ alignItems: 'center', gap: 8 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6 }} accessibilityRole="radiogroup" accessibilityLabel={t('feedback.rating')}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable
            key={n}
            onPress={() => {
              tap('select');
              onChange(n);
            }}
            hitSlop={4}
            accessibilityRole="radio"
            accessibilityLabel={t(n === 1 ? 'feedback.starOne' : 'feedback.stars', { count: n })}
            accessibilityState={{ checked: value === n }}
            style={({ pressed }) => ({ width: 50, height: 50, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.9 : 1 }] })}>
            <Icon name="star" size={38} color={n <= value ? C.warn : C.fg3} fill={n <= value} weight={1.6} />
          </Pressable>
        ))}
      </View>
      <Text style={{ color: value ? C.fg : C.fg3, fontSize: 14, fontWeight: '600', fontFamily: font, minHeight: 19 }}>{t(STAR_WORDS[value] ?? 'feedback.tapStar')}</Text>
    </View>
  );
}

/* ---------- the prompt ---------- */

/** Has this member used the app enough, and not been asked lately? Read fresh each time. */
function eligible(createdAt: string | undefined): boolean {
  const p = getPrefs();
  const now = Date.now();
  if (p.opens < MIN_OPENS) return false;
  if (p.feedbackAskedAt && now - p.feedbackAskedAt < GAP_DAYS * DAY) return false;
  const born = createdAt ? Date.parse(createdAt) : NaN;
  return Number.isFinite(born) && now - born >= ACCOUNT_DAYS * DAY;
}

export function FeedbackPrompt() {
  const { me, profile } = useSession();
  const { inCall } = useCalls();
  const path = usePathname();
  const keyboard = useKeyboardOpen();
  const toast = useToast();
  const font = useAppFont();
  const t = useT();
  const [due, setDue] = useState(false);
  const [open, setOpen] = useState(false);
  const [stars, setStars] = useState(0);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const later = useRef<ReturnType<typeof setTimeout> | null>(null);

  // One more app open (once per launch; prefs are always loaded before the app's screens draw).
  useEffect(() => {
    if (counted) return;
    counted = true;
    setPrefs({ opens: getPrefs().opens + 1 });
  }, []);

  // 20 seconds after the app started, not after this screen did.
  useEffect(() => {
    if (askedThisLaunch) return;
    const timer = setTimeout(() => setDue(true), Math.max(0, DELAY_MS - (Date.now() - launchedAt)));
    return () => clearTimeout(timer);
  }, []);

  // When it's time, wait for a calm moment: not in a call, not over photos or video, not mid-typing.
  // A short pause first, so it doesn't land while a screen is sliding in; any change starts the pause again.
  const createdAt = profile?.created_at;
  useEffect(() => {
    if (!due || open || askedThisLaunch || !me || inCall || keyboard || isMediaRoute(path)) return;
    if (!eligible(createdAt)) return;
    const timer = setTimeout(() => {
      if (askedThisLaunch) return;
      // Marked before it shows, so however it is closed it can't come straight back.
      askedThisLaunch = true;
      setPrefs({ feedbackAskedAt: Date.now() });
      setOpen(true);
    }, 1500);
    return () => clearTimeout(timer);
  }, [due, open, me, inCall, keyboard, path, createdAt]);

  // A call ringing in while it is open takes over the screen: the question steps aside.
  useEffect(() => {
    if (inCall && open) setOpen(false);
  }, [inCall, open]);

  useEffect(
    () => () => {
      if (later.current) clearTimeout(later.current);
    },
    [],
  );

  async function send() {
    if (!stars || busy) return;
    setBusy(true);
    try {
      await sendFeedback(me, { kind: 'review', rating: stars, text, app_version: appVersion(), platform: Platform.OS });
      setOpen(false);
      tap('success');
      toast(t('feedback.thanks'));
      // The phone's own rating card, once our sheet has slid away (two cards at once won't show).
      if (stars >= 4) later.current = setTimeout(() => { askForStoreRating(false); }, 700);
    } catch (e) {
      toast(errText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet visible={open} onClose={() => setOpen(false)} title={t('feedback.title')}>
      <View style={{ paddingHorizontal: 20, gap: 16 }}>
        <StarPicker value={stars} onChange={setStars} />
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={t('feedback.placeholder')}
          placeholderTextColor={C.fg3}
          multiline
          maxLength={2000}
          keyboardAppearance={C.blurTint}
          accessibilityLabel={t('feedback.placeholder')}
          style={{ minHeight: 84, maxHeight: 160, color: C.fg, fontSize: 16, padding: 12, borderRadius: 14, backgroundColor: C.field, textAlignVertical: 'top', fontFamily: font }}
        />
        <View style={{ flexDirection: 'row', gap: 10, paddingBottom: 6 }}>
          <Button label={t('plus.notNow')} kind="ghost" onPress={() => setOpen(false)} style={{ flex: 1 }} />
          <Button label={t('common.send')} onPress={send} busy={busy} disabled={!stars} style={{ flex: 1 }} />
        </View>
      </View>
    </Sheet>
  );
}
