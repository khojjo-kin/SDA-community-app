import { usePrefs } from './prefs';

/**
 * App fonts (a Plus perk). '' is the system font. The named ones are bundled Google Fonts, loaded
 * once at start-up by `useLoadAppFonts` in the root layout; until they load, text falls back to
 * the system font, so nothing waits on them.
 */
export const FONTS: { id: string; name: string; regular: string; bold: string; sample: string }[] = [
  { id: '', name: 'Standard', regular: '', bold: '', sample: 'The app as it comes.' },
  { id: 'nunito', name: 'Nunito', regular: 'Nunito_400Regular', bold: 'Nunito_700Bold', sample: 'Soft and rounded.' },
  { id: 'lora', name: 'Lora', regular: 'Lora_400Regular', bold: 'Lora_700Bold', sample: 'A calm serif, like a hymnal.' },
  { id: 'poppins', name: 'Poppins', regular: 'Poppins_400Regular', bold: 'Poppins_600SemiBold', sample: 'Clean and modern.' },
];

export const fontById = (id: string) => FONTS.find((f) => f.id === id) ?? FONTS[0];

/**
 * The font family to put on a Text, or undefined for the system font. `weight` picks the bold
 * cut for headings and buttons. Only Plus members can choose a font, so a leftover choice on a
 * lapsed account is ignored by the chooser; the pref itself is cleared when Plus ends.
 */
export function useAppFont(weight: 'regular' | 'bold' = 'regular'): string | undefined {
  const { appFont } = usePrefs();
  const f = fontById(appFont);
  if (!f.id) return undefined;
  return weight === 'bold' ? f.bold : f.regular;
}
