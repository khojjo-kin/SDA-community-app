import { setPrefs } from './prefs';
import type { ThemeName } from './theme';

/** Where to take the member after the app is redrawn in a new theme (see ThemeReturn in app/_layout.tsx). */
let returnTo: string | null = null;

/** Changes the theme and comes back to `from` (the screen it was chosen on) once the app has been redrawn. */
export function chooseTheme(name: ThemeName, from: string) {
  returnTo = from;
  setPrefs({ theme: name });
}

/** Read once: where to go back to after a theme change, if anywhere. */
export function takeThemeReturn(): string | null {
  const to = returnTo;
  returnTo = null;
  return to;
}
