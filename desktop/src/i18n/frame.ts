// The desktop's own words for the frame area (keys "d.frame.…"): English, and the app's other 19
// languages. Words the iPhone app already has are used from src/lib/i18n instead (see lib/i18n.ts).
import type { AreaWords } from './types';

export const words: AreaWords = {
  en: {
    // main.tsx
    'd.frame.cantReach': "Can't reach your account",
    'd.frame.logOut': 'Log out',
    'd.frame.pageMissing': "Sorry, this page isn't available.",
    'd.frame.pageMissingBody': 'The link you followed may be broken, or the page may have been removed.',
    'd.frame.demoBanner': 'Demo: sample people and photos. Nothing you do here is saved.',
  },
};
