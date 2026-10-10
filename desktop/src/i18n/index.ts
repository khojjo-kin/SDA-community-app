// Every area's words, merged into one dictionary per language for lib/i18n.ts.
import type { LanguageCode } from 'shared/i18n';
import type { AreaWords, Words } from './types';
import { words as church } from './church';
import { words as community } from './community';
import { words as frame } from './frame';
import { words as messages } from './messages';
import { words as plus } from './plus';
import { words as posts } from './posts';
import { words as pro } from './pro';
import { words as profile } from './profile';
import { words as settings } from './settings';
import { words as settingsMore } from './settings-more';
import { words as stories } from './stories';

const AREAS: AreaWords[] = [frame, posts, profile, stories, messages, settings, settingsMore, plus, pro, church, community];

/** language → key → words. English has every key. */
export const DESKTOP_WORDS: Partial<Record<LanguageCode, Words>> = {};
for (const area of AREAS) {
  for (const [lang, words] of Object.entries(area) as [LanguageCode, Words][]) {
    DESKTOP_WORDS[lang] = Object.assign(DESKTOP_WORDS[lang] ?? {}, words);
  }
}
