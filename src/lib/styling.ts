import { CLOSE_RING, RING } from './theme';

/*
 * Community Plus profile styling: the colour of the ring round a member's stories and highlights,
 * and the look of their profile page. The ids are what the database keeps (profiles.ring_color and
 * profiles.profile_theme); '' is the standard look everyone else has.
 */

export type RingStyle = { id: string; label: string; colors: readonly string[] };

export const RING_STYLES: RingStyle[] = [
  { id: '', label: 'Green', colors: RING },
  { id: 'gold', label: 'Gold', colors: ['#ffe27a', '#f5b40b', '#c98400'] },
  { id: 'sky', label: 'Sky', colors: ['#8fd3ff', '#3d8bff', '#2347d8'] },
  { id: 'violet', label: 'Violet', colors: ['#e0a3ff', '#9b51e0', '#5b21b6'] },
  { id: 'sunset', label: 'Sunset', colors: ['#ffd36b', '#ff7a45', '#e5266d'] },
  { id: 'rose', label: 'Rose', colors: ['#ffc2d6', '#ff5c8a', '#c2185b'] },
  { id: 'teal', label: 'Teal', colors: ['#9ff3e4', '#14b8a6', '#0f766e'] },
  { id: 'silver', label: 'Silver', colors: ['#ffffff', '#c9d1d9', '#8b949e'] },
  { id: 'rainbow', label: 'Rainbow', colors: ['#ff5f6d', '#ffc371', '#47e891', '#3d8bff', '#b45cff'] },
];

/** The colours of a member's ring. Close-friends stories keep the blue ring whatever the member chose. */
export function ringColors(id: string | null | undefined, close = false): readonly string[] {
  if (close) return CLOSE_RING;
  return RING_STYLES.find((r) => r.id === (id ?? ''))?.colors ?? RING;
}

export type ProfileTheme = {
  id: string;
  label: string;
  /** The band behind the top of the profile, top colour first; draw it as a gradient that ends in the page background (C.bg). Empty for the standard look. */
  band: readonly string[];
  /** Buttons and links on this profile. */
  accent: string;
  /** Text drawn on the accent colour. */
  onAccent: string;
  /** The accent on the White app theme, where the pale accents above would not show (white text on it). */
  lightAccent: string;
};

export const PROFILE_THEMES: ProfileTheme[] = [
  { id: '', label: 'Standard', band: [], accent: '#1fbf5a', onAccent: '#ffffff', lightAccent: '#16a34a' },
  { id: 'sabbath', label: 'Sabbath', band: ['#1d2b64'], accent: '#f5c84b', onAccent: '#1a1400', lightAccent: '#a87b05' },
  { id: 'olive', label: 'Olive', band: ['#3f5a1e'], accent: '#9ccc65', onAccent: '#132006', lightAccent: '#4d7c0f' },
  { id: 'sunrise', label: 'Sunrise', band: ['#ff9a5a', '#5a2333'], accent: '#ff8a4c', onAccent: '#2a0d00', lightAccent: '#d9480f' },
  { id: 'ocean', label: 'Ocean', band: ['#0f4c81'], accent: '#4fb3ff', onAccent: '#001a2c', lightAccent: '#1864ab' },
  { id: 'lavender', label: 'Lavender', band: ['#5b3a8c'], accent: '#c49bff', onAccent: '#1d0b38', lightAccent: '#6f42c1' },
  { id: 'rose', label: 'Rose', band: ['#8c2f4f'], accent: '#ff7aa2', onAccent: '#2b0614', lightAccent: '#c2255c' },
  { id: 'midnight', label: 'Midnight', band: ['#000000'], accent: '#e8eaf0', onAccent: '#0b1014', lightAccent: '#111827' },
];

export function profileTheme(id: string | null | undefined): ProfileTheme {
  return PROFILE_THEMES.find((t) => t.id === (id ?? '')) ?? PROFILE_THEMES[0];
}
