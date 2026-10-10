// The desktop app's words in the member's language (Settings → Language; '' follows this computer).
//
// Two dictionaries, one lookup: keys that start with "d." are the desktop's own words, in
// desktop/src/i18n/<area>.ts; any other key is one of the iPhone app's (src/lib/i18n/en.ts and its
// 19 translations), used as is whenever the desktop shows exactly the same words. A word a language
// doesn't have yet shows in English.
//
// Call t() while drawing, never at module level: when the language changes, main.tsx draws the app
// again from the top, and a word kept in a constant would stay in the old language. Keep the key in
// the constant and call t(key) where it is shown.
import { useMemo } from 'react';
import { type Key, LANGUAGES, type LanguageCode, type Vars, languageCode, t as phoneT, useLanguage } from 'shared/i18n';
import { DESKTOP_WORDS } from '../i18n';

export type { Key, LanguageCode, Vars };
export { LANGUAGES, languageCode, useLanguage };

function fill(text: string, vars?: Vars): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (gap, name: string) => (Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : gap));
}

/** The words for `key` in the app's language (English if not translated yet), with {name} gaps filled from `vars`. */
export function t(key: string, vars?: Vars): string {
  if (key.startsWith('d.')) {
    const text = DESKTOP_WORDS[languageCode()]?.[key] ?? DESKTOP_WORDS.en?.[key] ?? key;
    return fill(text, vars);
  }
  return phoneT(key as Key, vars);
}

/** Counted words: `key + 'One'` when count is 1 (if that key exists), otherwise `key`; {count} is filled in. */
export function tn(key: string, count: number, vars?: Vars): string {
  const one = key + 'One';
  const hasOne = key.startsWith('d.') ? !!DESKTOP_WORDS.en?.[one] : t(one) !== one;
  return t(count === 1 && hasOne ? one : key, { count: count.toLocaleString(dateLocale()), ...vars });
}

/**
 * For a sentence with something drawn differently inside it (a bold name, a link): the words before
 * and after the `{slot}` gap. The sentence stays whole for translators.
 */
export function tSplit(key: string, slot: string, vars?: Vars): [string, string] {
  const text = t(key, vars);
  const gap = `{${slot}}`;
  const at = text.indexOf(gap);
  if (at < 0) return [`${text} `, ''];
  return [text.slice(0, at), text.slice(at + gap.length)];
}

/** `t` for a component that should draw again when the language changes. */
export function useT(): typeof t {
  const code = useLanguage();
  return useMemo(() => (key: string, vars?: Vars) => t(key, vars), [code]);
}

// Locale names for dates and numbers. Twi is Akan ('ak') and Tagalog is Filipino ('fil') to the
// browser; English stays British, as the app has always written dates.
const LOCALES: Partial<Record<LanguageCode, string>> = { en: 'en-GB', tw: 'ak', tl: 'fil' };

/** The locale for toLocaleDateString / toLocaleString / Intl, in the app's language. */
export function dateLocale(): string {
  const code = languageCode();
  return LOCALES[code] ?? code;
}
