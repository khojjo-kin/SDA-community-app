export const C = {
  bg: '#0b1014',
  bg2: '#131920',
  surface: '#1b222a',
  surface2: '#272e38',
  line: '#232a33',
  fg: '#f3f5f7',
  fg2: '#a4adb9',
  fg3: '#6d7783',
  /** The app's colour: buttons, links, switches, the "New" pill. */
  accent: '#1fbf5a',
  /** The same green where it sits on dark text-sized elements, a little lighter so it reads. */
  accent2: '#4fe08a',
  like: '#ff3040',
  ok: '#3ddc84',
  glass: 'rgba(40,46,55,0.78)',
  /** Bottom sheets. */
  sheet: '#191b1f',
  /** Search fields and the thick bands between settings sections. */
  field: '#24292e',
  /** Round buttons in screen headers. */
  round: '#25282b',
  /** The app's green, by name, for places that want it even if the accent ever changes. */
  green: '#1fbf5a',
  /** Close friends: badges and the ring on a story shared only with them. */
  close: '#3d8bff',
  /** The verified tick. */
  verified: '#3d8bff',
  /** The message box in a chat. */
  inputBar: '#1c1d1f',
};

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

/** Turns any thrown value into a sentence a person can act on. */
export function errText(e: unknown): string {
  const anyE = e as any;
  const clerk = anyE?.errors?.[0];
  if (clerk) return clerk.longMessage || clerk.message || 'Something went wrong. Try again.';
  if (anyE?.code === '23505') return /username/.test(String(anyE?.message ?? '') + String(anyE?.details ?? '')) ? 'That username is taken. Try another.' : 'That already exists.';
  if (anyE?.code === '23514') return /username/.test(String(anyE?.message ?? '')) ? 'Usernames use 3 to 30 lowercase letters, numbers or underscores.' : 'That is too long or not allowed. Shorten it and try again.';
  // Refused by the database's access rules: usually someone has blocked someone, or the thing is gone.
  if (anyE?.code === '42501') return "That isn't available for this account.";
  if (/Network request failed|Failed to fetch|FetchError|network error/i.test(String(anyE?.message ?? ''))) return 'No connection. Check your internet and try again.';
  if (typeof anyE?.message === 'string' && anyE.message) return anyE.message;
  return 'Something went wrong. Check your connection and try again.';
}
