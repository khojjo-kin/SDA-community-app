export const C = {
  bg: '#0b1014',
  bg2: '#131920',
  surface: '#1b222a',
  surface2: '#272e38',
  line: '#232a33',
  fg: '#f3f5f7',
  fg2: '#a4adb9',
  fg3: '#6d7783',
  accent: '#4f5df8',
  accent2: '#8690ff',
  like: '#ff3040',
  ok: '#3ddc84',
  glass: 'rgba(40,46,55,0.78)',
};

export const RING = ['#ffb13d', '#ff3d77', '#7a4dff'] as const;

export function fmt(n: number): string {
  if (!n) return '0';
  if (n < 10000) return n.toLocaleString('en-GB');
  if (n < 1e6) return (n / 1e3).toFixed(n < 1e5 ? 1 : 0).replace(/\.0$/, '') + 'K';
  return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
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

/** Turns any thrown value into a sentence a person can act on. */
export function errText(e: unknown): string {
  const anyE = e as any;
  const clerk = anyE?.errors?.[0];
  if (clerk) return clerk.longMessage || clerk.message || 'Something went wrong. Try again.';
  if (anyE?.code === '23505') return 'That username is taken. Try another.';
  if (anyE?.code === '23514') return 'Usernames use 3 to 30 lowercase letters, numbers or underscores.';
  if (typeof anyE?.message === 'string' && anyE.message) return anyE.message;
  return 'Something went wrong. Check your connection and try again.';
}
