import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { withTimeout } from './api';
import { C, dayLabel } from './theme';

/**
 * The free Sabbath School API by Adventech (the open-source Sabbath School app's own backend).
 * Shapes below were checked against the live v2 endpoints; all dates are "dd/MM/yyyy" strings.
 */
const BASE = 'https://sabbath-school.adventech.io/api/v2/en';

/** One entry of quarterlies/index.json. The index mixes groups: "Standard Adult", "InVerse", "Easy Reading", "Real Time Faith"… */
export type Quarterly = {
  /** "2026-04" for the adult guide; other groups add a suffix, e.g. "2026-04-rt". */
  id: string;
  title: string;
  description: string;
  /** "October · November · December 2026" */
  human_date: string;
  start_date: string;
  end_date: string;
  cover: string;
  splash?: string;
  color_primary: string;
  color_primary_dark?: string;
  lang: string;
  index: string;
  path: string;
  full_path: string;
  introduction?: string;
  quarterly_group?: { name: string; order: number };
  features?: { name: string; title: string; description: string; image: string }[];
  credits?: { name: string; value: string }[];
};

export type Lesson = { id: string; title: string; start_date: string; end_date: string; index: string; path: string; full_path: string; cover: string; pdfOnly?: boolean };

/** Days "01".."07" are Sabbath to Friday; extras like "inside-story" and "teacher-comments" share Friday's date. */
export type Day = { id: string; title: string; date: string; index: string; path: string; full_path: string; read_path: string; full_read_path: string };

/** A day's reading: `content` is HTML with `<a class="verse" verse="2Pet313">` links; `bible` holds the verse texts per translation. */
export type Reading = { id: string; title: string; date: string; index: string; content: string; bible?: { name: string; verses: Record<string, string> }[] };

/** The phone's copy of a document, if it reads; a garbled one counts as none. */
async function kept<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function download<T>(path: string, ms: number): Promise<T> {
  // One time limit over the request and reading the body: a connection that stalls half-way
  // through a reading would otherwise leave the page loading for ever, with no copy shown.
  return withTimeout(
    fetch(`${BASE}/${path}`).then((res) => {
      if (!res.ok) throw new Error(res.status === 404 ? 'That lesson could not be found.' : 'The lesson could not be loaded. Check your connection and try again.');
      return res.json() as Promise<T>;
    }),
    ms,
  );
}

/** Documents already brought up to date in the background this session. */
const refreshed = new Set<string>();

/**
 * Fetches a JSON document, keeping a copy on the phone, so anything opened before still reads with
 * no signal (a chapel on Sabbath morning).
 *
 * `cache` first: a lesson or a day's reading doesn't change once published, so the phone's copy shows
 * at once and a fresh one is fetched quietly for next time. `network` first: the list of quarters gains
 * new ones, so it is asked for each time, giving up sooner when there is a copy to fall back on.
 */
async function getJson<T>(path: string, prefer: 'cache' | 'network' = 'network'): Promise<T> {
  const key = `community.ss.${path}`;
  const copy = await kept<T>(key);
  if (copy && prefer === 'cache') {
    if (!refreshed.has(path)) {
      refreshed.add(path);
      download<T>(path, 30000)
        .then((data) => AsyncStorage.setItem(key, JSON.stringify(data)))
        .catch(() => refreshed.delete(path));
    }
    return copy;
  }
  try {
    const data = await download<T>(path, copy ? 8000 : 20000);
    AsyncStorage.setItem(key, JSON.stringify(data)).catch(() => {});
    refreshed.add(path);
    return data;
  } catch (e) {
    if (copy) return copy;
    throw e;
  }
}

export const fetchQuarterlies = () => getJson<Quarterly[]>('quarterlies/index.json');
/** `fresh` (pull to refresh) asks the server first rather than showing the phone's copy. */
export const fetchQuarterly = (id: string, fresh = false) => getJson<{ quarterly: Quarterly; lessons: Lesson[] }>(`quarterlies/${id}/index.json`, fresh ? 'network' : 'cache');
export const fetchLesson = (quarterlyId: string, lessonId: string) => getJson<{ lesson: Lesson; days: Day[] }>(`quarterlies/${quarterlyId}/lessons/${lessonId}/index.json`, 'cache');
export const fetchDay = (quarterlyId: string, lessonId: string, dayId: string) => getJson<Reading>(`quarterlies/${quarterlyId}/lessons/${lessonId}/days/${dayId}/read/index.json`, 'cache');

/* ---------- dates ---------- */

/** "26/09/2026" to local midnight on that day. An unreadable string gives an invalid Date, which fails every comparison. */
export function parseDate(ddmmyyyy: string): Date {
  const [d, m, y] = String(ddmmyyyy ?? '').split('/').map(Number);
  return new Date(y, m - 1, d);
}

export function startOfToday(): Date {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

const contains = (start: string, end: string, day: Date) => parseDate(start) <= day && day <= parseDate(end);

/** "26 Sep – 2 Oct" */
export function dateRange(start: string, end: string): string {
  return `${dayLabel(parseDate(start))} – ${dayLabel(parseDate(end))}`;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Sabbath'];

/** "Sabbath · 10 Oct" */
export function dayTitle(date: string): string {
  const d = parseDate(date);
  return isNaN(d.getTime()) ? '' : `${WEEKDAYS[d.getDay()]} · ${dayLabel(d)}`;
}

/** The short name on a day chip: the weekday for the seven dated readings, the section name for the extras. */
export function chipLabel(day: Day): string {
  if (/^\d+$/.test(day.id)) {
    const d = parseDate(day.date);
    return isNaN(d.getTime()) ? day.title : WEEKDAYS[d.getDay()].slice(0, d.getDay() === 6 ? 7 : 3);
  }
  return ({ 'inside-story': 'Inside Story', 'teacher-comments': 'Teacher Comments', 'hope-ss': 'Hope SS' } as Record<string, string>)[day.id] ?? day.title;
}

/* ---------- what is current ---------- */

/** The adult Bible study guide, as opposed to the youth and easy-reading editions in the same index. */
export const isStandard = (q: Quarterly) => q.quarterly_group?.name === 'Standard Adult' || /^\d{4}-\d{2}$/.test(q.id);

/** The quarterly running today (the adult guide when several groups overlap), else the most recently started one. */
export function currentQuarterly(list: Quarterly[]): Quarterly | null {
  const today = startOfToday();
  const pick = (xs: Quarterly[]) => xs.find(isStandard) ?? xs[0] ?? null;
  const running = list.filter((q) => contains(q.start_date, q.end_date, today));
  if (running.length) return pick(running);
  // Editions of one quarter start within days of each other, so the adult guide is looked for among the latest few.
  const started = list.filter((q) => parseDate(q.start_date) <= today).sort((a, b) => parseDate(b.start_date).getTime() - parseDate(a.start_date).getTime());
  return pick(started.length ? started.slice(0, 8) : list);
}

/** This week's lesson, else the first one before the quarter begins, else the last one that has started. */
export function currentLesson(lessons: Lesson[]): Lesson | null {
  const today = startOfToday();
  const running = lessons.find((l) => contains(l.start_date, l.end_date, today));
  if (running) return running;
  if (!lessons.length) return null;
  if (today < parseDate(lessons[0].start_date)) return lessons[0];
  return [...lessons].reverse().find((l) => parseDate(l.start_date) <= today) ?? lessons[0];
}

/** The dated reading for today when today falls inside the lesson's week, else the first day. */
export function todayIndex(days: Day[]): number {
  const today = startOfToday().getTime();
  const i = days.findIndex((d) => /^\d+$/.test(d.id) && parseDate(d.date).getTime() === today);
  return i < 0 ? 0 : i;
}

/** True when today (on the phone's own calendar) falls inside this lesson's Sabbath-to-Friday week. */
export const isThisWeek = (l: { start_date: string; end_date: string }) => contains(l.start_date, l.end_date, startOfToday());

/* ---------- the memory text ---------- */

/** A lesson's memory text, e.g. { text: 'Also I heard the voice of the Lord…', reference: 'Isaiah 6:8, NKJV' }. */
export type MemoryText = { text: string; reference: string };

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', hellip: '…', mdash: '—', ndash: '–' };

/** HTML to one line of plain text: block tags become spaces, inline tags vanish, entities are decoded. */
function plainText(html: string): string {
  return html
    .replace(/<\/?(p|br|div|blockquote|h[1-6]|li)\b[^>]*>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
      if (code[0] === '#') {
        const n = /^#x/i.test(code) ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
        return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
      }
      return ENTITIES[code.toLowerCase()] ?? m;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Finds the memory text in a Sabbath (day 01) reading. Recent quarters put it in a blockquote
 * after a "Memory Text:" paragraph; older ones in a single paragraph that starts with the label.
 * The reference is the last bracketed part, "(Isaiah 6:8, NKJV)". Null when there is none.
 */
export function memoryText(html: string): MemoryText | null {
  const src = String(html ?? '');
  const at = src.search(/memory(?:\s|&nbsp;|&#160;)+text/i);
  if (at < 0) return null;
  const before = src.slice(0, at);
  const inQuote = before.lastIndexOf('<blockquote') > before.lastIndexOf('</blockquote');
  const rest = src.slice(at);
  const end = rest.search(inQuote ? /<\/blockquote>/i : /<\/p>/i);
  const block = plainText(rest.slice(0, end < 0 ? 1500 : end)).replace(/^memory\s+text\s*:?\s*/i, '');
  const m = /^([\s\S]*?)\s*\(([^()]{2,90})\)[\s.,;”"’]*$/.exec(block);
  let text = (m ? m[1] : block).trim();
  // The verse card shows the words on their own, so the quotation marks around the whole verse go.
  if (/^[“"]/.test(text)) text = text.replace(/^[“"]\s*/, '').replace(/\s*[”"]$/, '');
  const reference = m ? m[2].replace(/\s+,/g, ',').trim() : '';
  if (!text || text.length > 700) return null;
  return { text, reference };
}

/** Memory texts already looked up in this session, so the main page and the lesson share one request. */
const memoryTexts = new Map<string, Promise<MemoryText | null>>();

/** The memory text of a lesson, read from its Sabbath reading (kept on the phone like every reading). */
export function fetchMemoryText(quarterlyId: string, lessonId: string): Promise<MemoryText | null> {
  const key = `${quarterlyId}/${lessonId}`;
  let p = memoryTexts.get(key);
  if (!p) {
    p = fetchDay(quarterlyId, lessonId, '01').then((r) => memoryText(r.content));
    // A failure is not remembered, so the next look tries again.
    p.catch(() => memoryTexts.delete(key));
    memoryTexts.set(key, p);
  }
  return p;
}

/* ---------- settings ---------- */

const SETTINGS = 'community.ss';
export type SsSettings = { quarterly?: string; size: number };
// 17px with a 1.6 line height (about 27px) is the comfortable reading size; anyone who changed it keeps theirs.
const DEFAULTS: SsSettings = { size: 17 };

export async function loadSsSettings(): Promise<SsSettings> {
  try {
    const raw = await SecureStore.getItemAsync(SETTINGS);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

export async function saveSsSettings(s: SsSettings) {
  try {
    await SecureStore.setItemAsync(SETTINGS, JSON.stringify(s));
  } catch {
    // Not worth interrupting reading for.
  }
}

let settingsQueue: Promise<unknown> = Promise.resolve();

/**
 * Changes only the settings named, on top of what is saved right now. Each screen keeps its own
 * copy, so saving a whole copy would undo a change made on another screen since it was loaded
 * (choosing a quarter would put the text size back). Changes go one after another, so quick taps
 * cannot overtake each other.
 */
export function updateSsSettings(patch: Partial<SsSettings>): Promise<void> {
  const run = settingsQueue.then(async () => {
    let raw: string | null;
    try {
      raw = await SecureStore.getItemAsync(SETTINGS);
    } catch {
      // Unreadable just now: saving would put defaults over the other settings, so this change
      // lasts only while the screen is open.
      return;
    }
    let saved: SsSettings = DEFAULTS;
    try {
      if (raw) saved = { ...DEFAULTS, ...JSON.parse(raw) };
    } catch {
      // Garbled: start again from the defaults.
    }
    await saveSsSettings({ ...saved, ...patch });
  });
  settingsQueue = run.catch(() => {});
  return run;
}

/* ---------- the page shown in the WebView ---------- */

/** Extra styling and behaviour a screen can lay over the standard reading page. */
export type ReadingHtmlOptions = {
  /** CSS added after the standard rules, so it wins where both set the same thing. */
  css?: string;
  /** A script run at the end of the page, after the verse script. */
  script?: string;
};

/**
 * Wraps a day's HTML in the app's dark theme at the chosen text size. Verse links in the content
 * carry no href, only a `verse` attribute, so a small script opens the verse text (KJV, matching
 * the app's Bible) in a box under the paragraph when one is tapped, and closes it on a second tap.
 */
export function readingHtml(r: Reading, size: number, options: ReadingHtmlOptions = {}): string {
  const bible = r.bible?.find((b) => /kjv/i.test(b.name)) ?? r.bible?.[0];
  // Inside a <script>, "</" and "<!--" would end or confuse the script, so they are escaped in the JSON string literals.
  const verses = JSON.stringify(bible?.verses ?? {}).replace(/<\//g, '<\\/').replace(/<!--/g, '<\\!--');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>
html{background:${C.bg};-webkit-text-size-adjust:100%}
body{margin:0;padding:16px 16px 48px;background:${C.bg};color:${C.fg};font-family:-apple-system,system-ui,Roboto,sans-serif;font-size:${size}px;line-height:1.6;overflow-wrap:break-word}
h1,h2,h3,h4{color:${C.fg};line-height:1.3;margin:1.4em 0 .5em}h1{font-size:1.3em}h2{font-size:1.2em}h3{font-size:1.12em}h4{font-size:1.04em}
p{margin:0 0 1em}a{color:${C.accent2};text-decoration:none}a.verse{border-bottom:1px dotted ${C.accent2}}
blockquote{margin:1em 0;padding:.2em 0 .2em 1em;border-left:3px solid ${C.accent};color:${C.fg2}}
img{max-width:100%;height:auto;border-radius:10px}hr{border:0;border-top:1px solid ${C.line};margin:1.5em 0}small{color:${C.fg3}}
.ss-donation-appeal{display:none}
.verse-box{margin:.4em 0 1em;padding:10px 14px;border-radius:12px;background:${C.surface};font-size:.92em}
.verse-box h2{font-size:1em;margin:0 0 .4em;color:${C.accent2}}.verse-box sup{color:${C.fg3};font-size:.7em}
</style>${options.css ? `<style>${options.css}</style>` : ''}</head><body>${r.content}<script>
var V=${verses};
document.addEventListener('click',function(e){var a=e.target&&e.target.closest?e.target.closest('a.verse'):null;if(!a)return;e.preventDefault();
if(a._box){a._box.remove();a._box=null;a.classList.remove('open');return;}var t=V[a.getAttribute('verse')];if(!t)return;
var d=document.createElement('div');d.className='verse-box';d.innerHTML=t;(a.closest('p,li,blockquote,h1,h2,h3,h4')||a).insertAdjacentElement('afterend',d);a._box=d;a.classList.add('open');});
</script>${options.script ? `<script>${options.script}</script>` : ''}</body></html>`;
}
