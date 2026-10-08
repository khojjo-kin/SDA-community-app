import React, { useMemo } from 'react';
import { SvgXml } from 'react-native-svg';
import { C } from '../lib/theme';

// The app's own icon set, drawn on a 24px grid.
const ICONS = {
  home: '<path d="M3.5 10.6 12 3.4l8.5 7.2V20a1 1 0 0 1-1 1h-4.9v-6.2H9.4V21H4.5a1 1 0 0 1-1-1z"/>',
  reels: '<rect x="3" y="3" width="18" height="18" rx="5.5"/><path d="M10 8.6v6.8l5.8-3.4z"/>',
  send: '<path d="M21.3 3.2 2.8 9.6l7.4 3.6 3.6 7.6z"/><path d="M10.2 13.2 21.3 3.2"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m16.2 16.2 4.6 4.6"/>',
  heart: '<path d="M12 20.4S3.6 15.3 3.6 9.3A4.6 4.6 0 0 1 12 6.7a4.6 4.6 0 0 1 8.4 2.6c0 6-8.4 11.1-8.4 11.1z"/>',
  comment: '<path d="M12 3.6a8.4 8.4 0 1 0 4.5 15.5l4.3 1.3-1.3-4.2A8.4 8.4 0 0 0 12 3.6z"/>',
  repost: '<path d="m16.8 2.6 3.6 3.6-3.6 3.6"/><path d="M20.4 6.2H8.2a4.6 4.6 0 0 0-4.6 4.6v1"/><path d="m7.2 21.4-3.6-3.6 3.6-3.6"/><path d="M3.6 17.8h12.2a4.6 4.6 0 0 0 4.6-4.6v-1"/>',
  bookmark: '<path d="M6 3.6h12v17l-6-5.2-6 5.2z"/>',
  more: '<circle cx="5" cy="12" r="1.6" fill="COLOR" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="COLOR" stroke="none"/><circle cx="19" cy="12" r="1.6" fill="COLOR" stroke="none"/>',
  plus: '<path d="M12 4v16M4 12h16"/>',
  back: '<path d="M15 4.5 7.5 12l7.5 7.5"/>',
  right: '<path d="m9 5 7 7-7 7"/>',
  down: '<path d="m5 9 7 7 7-7"/>',
  close: '<path d="M5.5 5.5l13 13M18.5 5.5l-13 13"/>',
  menu: '<path d="M3.5 6.5h17M3.5 12h17M3.5 17.5h17"/>',
  compose: '<path d="M12 4.2H7.4a3.2 3.2 0 0 0-3.2 3.2v9.2a3.2 3.2 0 0 0 3.2 3.2h9.2a3.2 3.2 0 0 0 3.2-3.2V12"/><path d="M18.3 3.3a1.9 1.9 0 0 1 2.7 2.7l-8.3 8.3-3.6 1 1-3.6z"/>',
  grid: '<path d="M3.5 3.5h17v17h-17zM9.2 3.5v17M14.8 3.5v17M3.5 9.2h17M3.5 14.8h17"/>',
  tagged: '<path d="M9.4 7.2 12 4l2.6 3.2H18a2.2 2.2 0 0 1 2.2 2.2v8.4A2.2 2.2 0 0 1 18 20H6a2.2 2.2 0 0 1-2.2-2.2V9.4A2.2 2.2 0 0 1 6 7.2z"/><circle cx="12" cy="12.2" r="2.1"/><path d="M8.2 18.2c.5-1.9 2-2.9 3.8-2.9s3.3 1 3.8 2.9"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3.1-3.1a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.700000000000001 0l-3.1 3.1a4 4 0 0 0 5.7 5.7l1-1"/>',
  eye: '<path d="M2.6 12s3.4-6.4 9.4-6.4 9.4 6.4 9.4 6.4-3.4 6.4-9.4 6.4S2.6 12 2.6 12z"/><circle cx="12" cy="12" r="2.6"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="3"/><circle cx="8.6" cy="9.4" r="1.5"/><path d="m4 17 4.6-4.4 3.6 3.4 2.8-2.6 5 4.6"/>',
  camera: '<path d="M8.2 6.5 9.6 4.2h4.8l1.4 2.3H19A2.5 2.5 0 0 1 21.5 9v8.500000000000002A2.5 2.5 0 0 1 19 20H5a2.5 2.5 0 0 1-2.5-2.5V9A2.5 2.5 0 0 1 5 6.5z"/><circle cx="12" cy="13" r="3.6"/>',
  check: '<path d="m5 12.6 4.8 4.8L19.4 7"/>',
  play: '<path d="M8 5.2v13.6L19 12z" fill="COLOR"/>',
  people: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3 19.5c.6-3.3 3-5 6-5s5.4 1.7 6 5"/><circle cx="17.2" cy="9.4" r="2.4"/><path d="M17 14.6c2.2.1 3.6 1.5 4 4"/>',
  trash: '<path d="M4.5 6.5h15M9.5 6.5V4.2h5v2.3M6.5 6.5l1 13.3h9l1-13.3M10 10.5v6M14 10.5v6"/>',
  user: '<circle cx="12" cy="8.2" r="3.8"/><path d="M4.4 20.4c.8-4 3.8-6 7.6-6s6.8 2 7.6 6"/>',
  story: '<path d="M12 3.4a8.6 8.6 0 1 1-8.2 6" stroke-dasharray="2.2 3.2"/><path d="M12 8.4v7.2M8.4 12h7.2"/>',
  copy: '<rect x="8.5" y="8.5" width="12" height="12" rx="2.5"/><path d="M15.5 8.5V6A2.5 2.5 0 0 0 13 3.5H6A2.5 2.5 0 0 0 3.5 6v7A2.5 2.5 0 0 0 6 15.5h2.5"/>',
  music: '<path d="M9 17.5V5.5l10-2v12"/><circle cx="6.5" cy="17.5" r="2.5"/><circle cx="16.5" cy="15.5" r="2.5"/>',
  flag: '<path d="M5 21V4.2M5 4.5c4-2 6 2 10 0v9c-4 2-6-2-10 0"/>',
  block: '<circle cx="12" cy="12" r="8.6"/><path d="m6 6 12 12"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.6M12 18.6v2.6M2.8 12h2.6M18.6 12h2.6M5.5 5.5l1.8 1.8M16.7 16.7l1.8 1.8M18.5 5.5l-1.8 1.8M7.3 16.7l-1.8 1.8"/>',
  logout: '<path d="M14 4.5H7A2.5 2.5 0 0 0 4.5 7v10A2.5 2.5 0 0 0 7 19.5h7M10.5 12h10M17 8.5l3.5 3.5-3.5 3.5"/>',
  mute: '<path d="M4 9.500000000000002h3.500000000000001L12 5.5v13l-4.5-4H4zM16 9.5l5 5M21 9.5l-5 5"/>',
  sound: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4zM15.500000000000002 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
};

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 24, color = C.fg, fill = false, weight = 1.9 }: { name: IconName; size?: number; color?: string; fill?: boolean; weight?: number }) {
  const xml = useMemo(
    () =>
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${fill ? color : 'none'}" stroke="${color}" stroke-width="${weight}" stroke-linecap="round" stroke-linejoin="round">${ICONS[name].replace(/COLOR/g, color)}</svg>`,
    [name, color, fill, weight],
  );
  return <SvgXml xml={xml} width={size} height={size} />;
}

export function Mark({ size = 64 }: { size?: number }) {
  const xml = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="mk" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#ffb13d"/><stop offset="0.5" stop-color="#ff3d77"/><stop offset="1" stop-color="#7a4dff"/></linearGradient></defs><path d="M47 18a21 21 0 1 0 0 28" fill="none" stroke="url(#mk)" stroke-width="9" stroke-linecap="round"/><circle cx="47" cy="32" r="5.5" fill="url(#mk)"/></svg>`;
  return <SvgXml xml={xml} width={size} height={size} />;
}

export function BurstHeart({ size = 110 }: { size?: number }) {
  const xml = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><defs><linearGradient id="bh" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#ff8a3d"/><stop offset="0.5" stop-color="#ff3058"/><stop offset="1" stop-color="#c13dff"/></linearGradient></defs><path fill="url(#bh)" d="M12 20.4S3.6 15.3 3.6 9.3A4.6 4.6 0 0 1 12 6.7a4.6 4.6 0 0 1 8.4 2.6c0 6-8.4 11.1-8.4 11.1z"/></svg>`;
  return <SvgXml xml={xml} width={size} height={size} />;
}
