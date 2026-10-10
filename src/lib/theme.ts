/*
 * The app's colours. Three themes are offered in Settings: Dark (the original), White and Green.
 *
 * `C` is one object whose values are swapped when the theme changes (applyTheme), and the app is
 * then drawn again from the top, so every screen must read `C.x` while it renders — never copy a
 * colour into a module-level constant. Screens that show photos and video full screen (the camera,
 * the editors, the story viewer, reels, calls and live) stay dark in every theme: they use `DARK`.
 */
export type ThemeName = 'dark' | 'white' | 'green';

type Palette = {
  bg: string;
  bg2: string;
  surface: string;
  surface2: string;
  line: string;
  fg: string;
  fg2: string;
  fg3: string;
  /** The app's colour: buttons, links, switches, the "New" pill. */
  accent: string;
  /** The same green where it sits as text or a small icon: tuned so it reads on this theme's background. */
  accent2: string;
  /** Text and icons drawn on the accent colour (buttons). */
  onAccent: string;
  /** A soft wash of the accent, behind an accent icon or a selected row. */
  accentSoft: string;
  like: string;
  ok: string;
  /** Warnings and "pending" labels. */
  warn: string;
  /** Destructive actions. */
  danger: string;
  /** The frosted tab bar and player bar, over a blur of this tint. */
  glass: string;
  blurTint: 'dark' | 'light';
  /** Thin borders on frosted and floating things. */
  hairline: string;
  /** The wash over a row while a finger is on it. */
  press: string;
  /** Behind sheets and dialogs. */
  scrim: string;
  /** Bottom sheets. */
  sheet: string;
  /** Search fields and the thick bands between settings sections. */
  field: string;
  /** Round buttons in screen headers. */
  round: string;
  /** The app's green, by name, for places that want it even if the accent ever changes. */
  green: string;
  /** Close friends: badges and the ring on a story shared only with them. */
  close: string;
  /** The verified tick. */
  verified: string;
  /** The message box in a chat. */
  inputBar: string;
  /** The phone's status bar text: light on dark themes, dark on White. */
  statusBar: 'light' | 'dark';
};

const DARK_PALETTE: Palette = {
  bg: '#0b1014',
  bg2: '#131920',
  surface: '#1b222a',
  surface2: '#272e38',
  line: '#232a33',
  fg: '#f3f5f7',
  fg2: '#a4adb9',
  fg3: '#6d7783',
  accent: '#1fbf5a',
  accent2: '#4fe08a',
  onAccent: '#ffffff',
  accentSoft: 'rgba(31,191,90,0.14)',
  like: '#ff3040',
  ok: '#3ddc84',
  warn: '#ffc94d',
  danger: '#ff4d4f',
  glass: 'rgba(40,46,55,0.78)',
  blurTint: 'dark',
  hairline: 'rgba(255,255,255,0.09)',
  press: 'rgba(255,255,255,0.05)',
  scrim: 'rgba(0,0,0,0.55)',
  sheet: '#191b1f',
  field: '#24292e',
  round: '#25282b',
  green: '#1fbf5a',
  close: '#3d8bff',
  verified: '#3d8bff',
  inputBar: '#1c1d1f',
  statusBar: 'light',
};

const WHITE_PALETTE: Palette = {
  bg: '#ffffff',
  bg2: '#f5f6f7',
  surface: '#f0f2f4',
  surface2: '#e4e7eb',
  line: '#e3e6ea',
  fg: '#0f1419',
  fg2: '#57606a',
  fg3: '#8b939c',
  accent: '#16a34a',
  accent2: '#11823b',
  onAccent: '#ffffff',
  accentSoft: 'rgba(22,163,74,0.12)',
  like: '#ed2939',
  ok: '#16a34a',
  warn: '#b7791f',
  danger: '#e0262e',
  glass: 'rgba(255,255,255,0.82)',
  blurTint: 'light',
  hairline: 'rgba(0,0,0,0.08)',
  press: 'rgba(0,0,0,0.05)',
  scrim: 'rgba(0,0,0,0.4)',
  sheet: '#ffffff',
  field: '#eff1f3',
  round: '#eef0f2',
  green: '#1fbf5a',
  close: '#2f7bf5',
  verified: '#2f7bf5',
  inputBar: '#f0f2f4',
  statusBar: 'dark',
};

const GREEN_PALETTE: Palette = {
  bg: '#0c2118',
  bg2: '#10291e',
  surface: '#163326',
  surface2: '#1f4032',
  line: '#1b3a2c',
  fg: '#eef7f1',
  fg2: '#a6c3b3',
  fg3: '#6e8f7d',
  accent: '#2fd47a',
  accent2: '#74eaa8',
  onAccent: '#06210f',
  accentSoft: 'rgba(47,212,122,0.16)',
  like: '#ff4d5e',
  ok: '#4fe08a',
  warn: '#ffd166',
  danger: '#ff5a5f',
  glass: 'rgba(18,46,34,0.82)',
  blurTint: 'dark',
  hairline: 'rgba(255,255,255,0.1)',
  press: 'rgba(255,255,255,0.06)',
  scrim: 'rgba(0,0,0,0.55)',
  sheet: '#123024',
  field: '#1a3a2c',
  round: '#1b3b2d',
  green: '#1fbf5a',
  close: '#5aa9ff',
  verified: '#5aa9ff',
  inputBar: '#143024',
  statusBar: 'light',
};

export const PALETTES: Record<ThemeName, Palette> = { dark: DARK_PALETTE, white: WHITE_PALETTE, green: GREEN_PALETTE };

/** The colours in use now. Read at render time; see the note at the top of this file. */
export const C: Palette = { ...DARK_PALETTE };

/** The dark colours, whatever the theme: for photo and video screens that are always dark. */
export const DARK: Readonly<Palette> = DARK_PALETTE;

let current: ThemeName = 'dark';

/** The theme in use now. */
export function themeName(): ThemeName {
  return current;
}

/** Switches the colours. The caller redraws the app (the root layout does, keyed on the theme). */
export function applyTheme(name: ThemeName) {
  const next = PALETTES[name] ? name : 'dark';
  Object.assign(C, PALETTES[next]);
  current = next;
}

/** Your own chat bubbles. */
export const BUBBLE = ['#1fbf5a', '#149a62'] as const;
/** The ring on a story shared with close friends only. */
export const CLOSE_RING = ['#5aa9ff', '#2f6df6'] as const;
/** The ring on a new story. */
export const RING = ['#9be15d', '#1fbf5a', '#0f8f45'] as const;

export function fmt(n: number): string {
  if (!n) return '0';
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs < 10000) return sign + abs.toLocaleString('en-GB');
  if (abs < 1e6) {
    const k = abs / 1e3;
    if (k >= 999.5) return sign + '1M';
    const value = k < 100 ? k.toFixed(1).replace(/\.0$/, '') : k.toFixed(0);
    return sign + value + 'K';
  }
  const m = abs / 1e6;
  return sign + (m < 10 ? m.toFixed(1).replace(/\.0$/, '') : m.toFixed(0)) + 'M';
}

/** "1 like", "2 likes", "1.2K likes". */
export function count(n: number, word: string): string {
  return fmt(n) + ' ' + word + (n === 1 ? '' : 's');
}

export function ago(iso: string): string {
  const d = Math.max(0, Date.now() - new Date(iso).getTime());
  if (d < 60e3) return 'now';
  if (d < 3600e3) return Math.floor(d / 60e3) + 'm';
  if (d < 86400e3) return Math.floor(d / 3600e3) + 'h';
  if (d < 7 * 86400e3) return Math.floor(d / 86400e3) + 'd';
  return Math.floor(d / (7 * 86400e3)) + 'w';
}

export function agoLong(iso: string): string {
  const a = ago(iso);
  if (a === 'now') return 'Just now';
  const n = parseInt(a, 10);
  const unit = ({ m: 'minute', h: 'hour', d: 'day', w: 'week' } as Record<string, string>)[a.slice(-1)];
  return n + ' ' + unit + (n > 1 ? 's' : '') + ' ago';
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n: number) => String(n).padStart(2, '0');

/** "9 Sep" */
export function dayLabel(d: Date): string {
  return d.getDate() + ' ' + MONTHS[d.getMonth()];
}

/** "9 Sep" from a calendar day written as 2026-09-09, with no time-zone shift. */
export function dayLabelISO(day: string): string {
  const [, m, d] = day.split('-').map(Number);
  return d + ' ' + (MONTHS[m - 1] ?? '');
}

export function monthName(d: Date): string {
  return ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][d.getMonth()];
}

/** The line between groups of chat messages: "TODAY AT 08:24", "21 MAR AT 06:14". */
export function chatStamp(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const time = pad(d.getHours()) + ':' + pad(d.getMinutes());
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(d)) / 86400e3);
  if (days === 0) return 'TODAY AT ' + time;
  if (days === 1) return 'YESTERDAY AT ' + time;
  const year = d.getFullYear() === now.getFullYear() ? '' : ' ' + d.getFullYear();
  return d.getDate() + ' ' + MONTHS[d.getMonth()].toUpperCase() + year + ' AT ' + time;
}

/** Seconds as "1:15". */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return Math.floor(s / 60) + ':' + pad(s % 60);
}

/**
 * An error whose words were written for members, such as the reason one of our server functions
 * (payments, Erha) gives when it says no. errText shows it as it is.
 */
export class FriendlyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FriendlyError';
  }
}

const SOMETHING_WRONG = 'Something went wrong. Try again.';
const OFFLINE = "You're offline, or the connection is too weak. Check your internet and try again.";
const NOT_SAVED = "That didn't save — try again.";

/** No connection, or no answer in time. */
const NETWORK = /Network request failed|Failed to fetch|FetchError|network error|timed? ?out|timeout|AbortError|aborted|ECONN|ENOTFOUND|EAI_AGAIN/i;

/**
 * Words that only turn up in text written for developers: the database's and the server's own
 * messages, sign-in token problems, and faults in the code (with their stack lines). An error that
 * reads like this is never shown to a member, whoever threw it.
 */
const TECHNICAL = /permission denied|row-level security|duplicate key|violates|constraint|null value|invalid input|syntax error|(relation|column|function|schema|type) "[^"]*" does not exist|JWT|PGRST|JSON|unauthori[sz]ed|forbidden|status code|non-2xx|Edge Function|SSL|certificate|undefined is not|null is not|is not a function|cannot read propert|unexpected token|TypeError|ReferenceError|SyntaxError|RangeError|\[object |\n|\bat \S+ \([^)]*:\d+:\d+\)|\.(js|jsx|ts|tsx):\d/i;

/**
 * Turns any thrown value into a sentence a person can act on. Only words written for members get
 * through: Clerk's, our server functions' (FriendlyError), the reasons our own database functions and
 * triggers give (Postgres code P0001), and the app's own. Everything else (what the database, the
 * network or a library says) becomes a plain sentence; the full error goes to the console in
 * development builds only.
 */
export function errText(e: unknown): string {
  if (__DEV__) console.log('[errText]', e);
  const anyE = e as any;
  if (e instanceof FriendlyError) return e.message || SOMETHING_WRONG;
  // Clerk's errors (sign-in, sign-up, email codes) are written for the person signing in.
  const clerk = Array.isArray(anyE?.errors) ? anyE.errors[0] : null;
  if (clerk && typeof clerk === 'object' && !(clerk instanceof Error) && typeof clerk.code === 'string') return clerk.longMessage || clerk.message || SOMETHING_WRONG;
  const message = typeof anyE?.message === 'string' ? anyE.message.trim() : typeof e === 'string' ? e.trim() : '';
  const code = typeof anyE?.code === 'string' || typeof anyE?.code === 'number' ? String(anyE.code) : '';
  // Raised by our own database functions and triggers, in words written for members.
  if (code === 'P0001') return message && !message.includes('\n') ? message : SOMETHING_WRONG;
  if (NETWORK.test(message) || anyE?.name === 'AbortError' || anyE?.name === 'FunctionsFetchError') return OFFLINE;
  if (code === '23505') return /username/.test(message + String(anyE?.details ?? '')) ? 'That username is taken. Try another.' : 'That already exists.';
  if (code === '23514') return /username/.test(message) ? 'Usernames use 3 to 30 lowercase letters, numbers or underscores.' : 'That is too long or not allowed. Shorten it and try again.';
  // Refused by the database's access rules: usually someone has blocked someone, or the thing is gone.
  if (code === '42501') return "That isn't available for this account.";
  // Any other data the database wouldn't take (a missing link, a value of the wrong kind or size).
  if (/^2[23]/.test(code)) return NOT_SAVED;
  if (typeof anyE?.name === 'string' && anyE.name.startsWith('Storage')) return NOT_SAVED;
  if (code) return SOMETHING_WRONG;
  // What the app itself throws (a plain Error) is written for members, unless it reads like the above.
  const own = typeof e === 'string' || (e instanceof Error && e.name === 'Error');
  if (own && message && message.length <= 300 && !TECHNICAL.test(message)) return message;
  return SOMETHING_WRONG;
}
