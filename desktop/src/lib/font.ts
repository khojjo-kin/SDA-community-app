// The app's text face (a Plus perk, src/lib/fonts.ts on the iPhone): Standard, Nunito, Lora or
// Poppins. The choice is prefs.appFont, kept on this computer like the iPhone keeps it on the phone.
// The named faces are Google Fonts (the page already loads Lora from there for the wordmark): a face's
// stylesheet is added the first time it is needed, and until it arrives the text shows in the
// standard face, so nothing waits on it. The face goes on the whole app through the --font variable
// that app.css sets the text in. A member without Plus always sees the standard face, even when a
// choice made by another account on this computer is still in the prefs.
import { createElement, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { getProfile } from 'shared/api';
import { FONTS } from 'shared/fonts';
import { getPrefs, usePrefs } from 'shared/prefs';
import { listen } from 'shared/store';

declare const __DEMO__: boolean;

/** app.css's own --font: the computer's system face. */
const STANDARD = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/** How each named face is asked for from Google Fonts, and what stands in if it can't be reached. */
const WEB: Record<string, { family: string; weights: string; fallback: string }> = {
  nunito: { family: 'Nunito', weights: '400;500;600;700;800', fallback: STANDARD },
  lora: { family: 'Lora', weights: '400;500;600;700', fallback: "Georgia, 'Times New Roman', serif" },
  poppins: { family: 'Poppins', weights: '400;500;600;700;800', fallback: STANDARD },
};

export type AppFont = { id: string; name: string; sample: string; stack: string };

/** The faces on offer, with the iPhone's names and sample lines; '' is the standard face. */
export const APP_FONTS: AppFont[] = FONTS.map((f) => ({
  id: f.id,
  name: f.name,
  sample: f.sample,
  stack: f.id && WEB[f.id] ? `'${WEB[f.id].family}', ${WEB[f.id].fallback}` : STANDARD,
}));

export const appFontById = (id: string): AppFont => APP_FONTS.find((f) => f.id === id) ?? APP_FONTS[0];

/** Adds a face's stylesheet to the page, once. */
export function loadFontFace(id: string) {
  const web = WEB[id];
  if (!web || document.querySelector(`link[data-app-font="${id}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${web.family}:wght@${web.weights}&display=swap`;
  link.dataset.appFont = id;
  document.head.appendChild(link);
}

/* ---------- who is signed in, and whether they have Plus ---------- */

/** The signed-in member as last read, or null until known (and after logging out). */
let member: { id: string; plus: boolean } | null = null;
/** Remembers the last member seen with Plus, so their face shows straight away when the app next opens. */
const PLUS_KEY = 'community.appFontPlus';

function rememberedPlus(id: string): boolean {
  try {
    return localStorage.getItem(PLUS_KEY) === id;
  } catch {
    return false;
  }
}

/**
 * Says whether a member has Plus. Screens that already have the profile (Settings, the Plus page) call
 * this, so buying Plus or losing it changes the face at once; otherwise the profile is read below.
 */
export function noteFontMember(id: string, plus: boolean) {
  if (member && member.id === id && member.plus === plus) return;
  member = { id, plus };
  try {
    if (plus) localStorage.setItem(PLUS_KEY, id);
    else if (localStorage.getItem(PLUS_KEY) === id) localStorage.removeItem(PLUS_KEY);
  } catch {
    // remembered until the app closes
  }
  paint();
}

/** The account in use: the demo's sample account, or the one Clerk has signed in. */
function signedIn(): string | null {
  if (__DEMO__) return ((globalThis as any).__fakeMe as string) || 'demo_me';
  return ((window as any).Clerk?.user?.id as string | undefined) ?? null;
}

let reading = '';
/** Reads the member's profile for their Plus. A failed read is tried again on the next check. */
function readMember(id: string) {
  if (reading === id) return;
  reading = id;
  getProfile(id).then(
    (p) => {
      reading = '';
      if (p && signedIn() === id) noteFontMember(id, !!p.plus);
    },
    () => {
      reading = '';
    },
  );
}

/** Called now and then: notices signing in, switching and logging out without a reload. */
function check() {
  const id = signedIn();
  if (!id) {
    if (member) {
      member = null;
      paint();
    }
    return;
  }
  if (member?.id === id) return;
  // Shown at once for a member who had Plus last time; the profile then confirms it (or takes it away).
  member = { id, plus: rememberedPlus(id) };
  paint();
  readMember(id);
}

/* ---------- putting the face on the page ---------- */

/** Puts the chosen face on the whole app, or takes it off. */
function paint() {
  const font = appFontById(getPrefs().appFont);
  const root = document.documentElement;
  if (font.id && member?.plus) {
    loadFontFace(font.id);
    root.style.setProperty('--font', font.stack);
    root.dataset.appFont = font.id;
  } else {
    root.style.removeProperty('--font');
    delete root.dataset.appFont;
  }
}

/** Draws nothing: it only follows the prefs, which only React hooks can listen to. */
function FollowPrefs() {
  const { appFont } = usePrefs();
  useEffect(paint, [appFont]);
  return null;
}

let started = false;

/** Put the chosen font on the whole app, now and whenever it changes. */
export function applyAppFont() {
  if (started) return;
  started = true;
  // A tiny React root of its own, off the page, so a choice made anywhere shows at once.
  createRoot(document.createElement('div')).render(createElement(FollowPrefs));
  check();
  // Buying Plus, or it ending, comes through as a change to the profile.
  listen('profile', () => {
    const id = signedIn();
    if (id) readMember(id);
  });
  setInterval(check, 2000);
}
