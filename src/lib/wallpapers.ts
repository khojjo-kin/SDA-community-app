/** Chat wallpapers (a Plus perk). Each is a gradient; the chat draws it behind the messages. */
export const WALLPAPERS: { id: string; name: string; colors: [string, string, string] }[] = [
  { id: 'dusk', name: 'Dusk', colors: ['#1a1030', '#0b1014', '#0f2a1e'] },
  { id: 'olive', name: 'Olive grove', colors: ['#0f2a1e', '#13331f', '#0b1014'] },
  { id: 'sea', name: 'Galilee', colors: ['#0a1f33', '#0b1014', '#0f3340'] },
  { id: 'sand', name: 'Desert sand', colors: ['#3a2a14', '#1b1510', '#0b1014'] },
  { id: 'rose', name: 'Sharon rose', colors: ['#3a1422', '#1b0e14', '#0b1014'] },
  { id: 'royal', name: 'Royal', colors: ['#20123f', '#0b1014', '#132a4f'] },
];
export const wallpaperById = (id: string) => WALLPAPERS.find((w) => w.id === id) ?? null;
