import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { getPrefs, usePrefs } from './prefs';
import { ar } from './i18n/ar';
import { de } from './i18n/de';
import { ee } from './i18n/ee';
import { en, type Key } from './i18n/en';
import { es } from './i18n/es';
import { fr } from './i18n/fr';
import { ha } from './i18n/ha';
import { hi } from './i18n/hi';
import { id } from './i18n/id';
import { ig } from './i18n/ig';
import { it } from './i18n/it';
import { ja } from './i18n/ja';
import { ko } from './i18n/ko';
import { pt } from './i18n/pt';
import { ru } from './i18n/ru';
import { sw } from './i18n/sw';
import { tl } from './i18n/tl';
import { tw } from './i18n/tw';
import { yo } from './i18n/yo';
import { zh } from './i18n/zh';

/*
 * The app's language. Words live in src/lib/i18n/<code>.ts: en.ts has every one, and each other
 * language has those its translators have done so far. Anything missing shows in English.
 *
 * A screen asks for its words while it draws, with t('settings.title') (or the t from useT()). When
 * the language changes the root layout draws every screen again from the top (its key includes the
 * language), so — as with the theme's colours — never call t() at module level: a word kept in a
 * constant there would stay in the language the app started in. Keep the key in the constant instead.
 */

export type { Key };
/** The English words, for the few places that need them whatever the app's language (search, reports sent to admins). */
export { en };

/** The languages offered in Settings → Language, in the order shown. `native` is the name in the language itself. */
export const LANGUAGES = [
  { code: 'en', name: 'English', native: 'English' },
  { code: 'tw', name: 'Twi (Akan)', native: 'Twi' },
  { code: 'ee', name: 'Ewe', native: 'Eʋegbe' },
  { code: 'fr', name: 'French', native: 'Français' },
  { code: 'es', name: 'Spanish', native: 'Español' },
  { code: 'pt', name: 'Portuguese', native: 'Português' },
  { code: 'de', name: 'German', native: 'Deutsch' },
  { code: 'it', name: 'Italian', native: 'Italiano' },
  { code: 'sw', name: 'Swahili', native: 'Kiswahili' },
  { code: 'yo', name: 'Yoruba', native: 'Yorùbá' },
  { code: 'ha', name: 'Hausa', native: 'Hausa' },
  { code: 'ig', name: 'Igbo', native: 'Asụsụ Igbo' },
  { code: 'ar', name: 'Arabic', native: 'العربية' },
  { code: 'hi', name: 'Hindi', native: 'हिन्दी' },
  { code: 'zh', name: 'Chinese (Simplified)', native: '中文' },
  { code: 'ko', name: 'Korean', native: '한국어' },
  { code: 'ja', name: 'Japanese', native: '日本語' },
  { code: 'ru', name: 'Russian', native: 'Русский' },
  { code: 'tl', name: 'Tagalog', native: 'Tagalog' },
  { code: 'id', name: 'Indonesian', native: 'Bahasa Indonesia' },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]['code'];
export type Language = (typeof LANGUAGES)[number];

/** Values for the {name}-style gaps in a line of words. */
export type Vars = Record<string, string | number>;

type Dictionary = Partial<Record<Key, string>>;

// A Record over every code, so adding a language to LANGUAGES without its file fails the type check.
const DICTIONARIES: Record<LanguageCode, Dictionary> = { en, tw, ee, fr, es, pt, de, it, sw, yo, ha, ig, ar, hi, zh, ko, ja, ru, tl, id };

/**
 * Phones name some languages differently from the list: Twi is filed under Akan ('ak', or 'twi'),
 * Tagalog as Filipino ('fil'), and older Android phones still say 'in' for Indonesian.
 */
const ALIASES: Record<string, LanguageCode> = { ak: 'tw', twi: 'tw', fil: 'tl', in: 'id' };

export function isLanguage(code: string): code is LanguageCode {
  return Object.prototype.hasOwnProperty.call(DICTIONARIES, code);
}

/** A locale such as "en-GB", "ak_GH" or "fil-PH" as one of ours, or null if the app doesn't have it. */
function fromLocale(locale: string): LanguageCode | null {
  // The language is the part before the region. It is usually two letters; Filipino and a few others use three.
  const base = locale.toLowerCase().split(/[-_]/)[0] ?? '';
  const code = ALIASES[base] ?? base;
  return isLanguage(code) ? code : null;
}

// The phone's language, read once: it is the same for the whole time the app is open, and t() runs
// hundreds of times a screen, too often to ask the phone each time.
let phone: LanguageCode | null = null;

/** The phone's own language if the app has it, otherwise English. */
export function phoneLanguage(): LanguageCode {
  if (phone) return phone;
  let found: LanguageCode | null = null;
  try {
    found = fromLocale(Intl.DateTimeFormat().resolvedOptions().locale ?? '');
  } catch {
    // An engine without Intl: English.
  }
  phone = found ?? 'en';
  return phone;
}

/** The language a saved choice means: the choice itself, or the phone's language when it is '' (or no longer offered). */
export function resolveLanguage(choice: string): LanguageCode {
  return choice && isLanguage(choice) ? choice : phoneLanguage();
}

/** The language the app is in now. */
export function languageCode(): LanguageCode {
  return resolveLanguage(getPrefs().language);
}

/** A language's name in its own language ("Français"), for showing which one is chosen. Codes we don't offer show in capitals. */
export function languageName(code: string): string {
  return LANGUAGES.find((l) => l.code === code)?.native ?? code.toUpperCase();
}

function fill(text: string, vars?: Vars): string {
  if (!vars) return text;
  // A gap with no value is left as it is, so tSplit can find it (and a missing value is easy to spot).
  return text.replace(/\{(\w+)\}/g, (gap, name: string) => (Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : gap));
}

/** The words for `key` in the app's language, falling back to English, with any {name} gaps filled from `vars`. */
export function t(key: Key, vars?: Vars): string {
  const text = DICTIONARIES[languageCode()][key] ?? en[key] ?? key;
  return fill(text, vars);
}

/**
 * For a sentence with something drawn differently inside it (a bold name, a link): the words
 * before and after the `{slot}` gap, so the caller can put its own piece between them. Kept as a
 * whole sentence for translators, because the piece doesn't sit in the same place in every language.
 */
export function tSplit(key: Key, slot: string, vars?: Vars): [string, string] {
  const text = t(key, vars);
  const gap = `{${slot}}`;
  const at = text.indexOf(gap);
  // A translation that lost the gap still shows the piece, after its words.
  if (at < 0) return [`${text} `, ''];
  return [text.slice(0, at), text.slice(at + gap.length)];
}

// Who to tell when the language changes. Only LanguageWatch calls them, so a component that only
// wants the language isn't drawn again for every other choice in prefs (sound, wallpaper…).
const listeners = new Set<() => void>();

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** The language the app is in. Draws again only when the language itself changes. */
export function useLanguage(): LanguageCode {
  return useSyncExternalStore(subscribe, languageCode);
}

/**
 * Lets useLanguage know when the language has changed. Prefs tell their listeners about every
 * change, so this one small component (drawing nothing) listens to all of them and passes on only
 * a change of language. The root layout draws it.
 */
export function LanguageWatch(): null {
  const code = resolveLanguage(usePrefs().language);
  useEffect(() => {
    listeners.forEach((l) => l());
  }, [code]);
  return null;
}

/** `t`, for a component: it is drawn again if the language changes. */
export function useT(): (key: Key, vars?: Vars) => string {
  const code = useLanguage();
  // A new function per language, so anything memoised on it is worked out again in the new language.
  return useMemo(() => (key: Key, vars?: Vars) => t(key, vars), [code]);
}
