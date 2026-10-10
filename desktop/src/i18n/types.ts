// The shape of each area's word file (desktop/src/i18n/<area>.ts).
import type { LanguageCode } from 'shared/i18n';

/** Key → words. Keys start with "d.<area>." so they never meet the iPhone app's keys. */
export type Words = Record<string, string>;

/** An area's words: every key in English, and as many as are translated in each other language. */
export type AreaWords = { en: Words } & Partial<Record<Exclude<LanguageCode, 'en'>, Words>>;
