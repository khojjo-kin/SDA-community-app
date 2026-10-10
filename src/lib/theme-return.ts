import { languageCode, resolveLanguage } from './i18n';
import { setPrefs } from './prefs';
import type { ThemeName } from './theme';

/*
 * A new theme or a new language draws the whole app again (the root layout's key). These choose one
 * and note the screen it was chosen on, and ReturnAfterRedraw in app/_layout.tsx takes the member
 * back there once the app is up again.
 */
let returnTo: string | null = null;

/** Changes the theme and comes back to `from` (the screen it was chosen on) once the app has been redrawn. */
export function chooseTheme(name: ThemeName, from: string) {
  returnTo = from;
  setPrefs({ theme: name });
}

/**
 * Changes the app's language ('' follows the phone) and comes back to `from` once the app has
 * been redrawn in it.
 */
export function chooseLanguage(code: string, from: string) {
  // Following the phone when the phone is already in the language shown changes nothing on screen,
  // so there is no redraw to come back from — and a return left waiting would fire after some later one.
  if (resolveLanguage(code) !== languageCode()) returnTo = from;
  setPrefs({ language: code });
}

/** Read once: where to go back to after the app has been redrawn, if anywhere. */
export function takeReturn(): string | null {
  const to = returnTo;
  returnTo = null;
  return to;
}
