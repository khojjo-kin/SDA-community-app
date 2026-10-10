import { brightness, concatColorMatrices, contrast, cool, grayscale, normal, saturate, sepia, temperature, warm } from 'react-native-color-matrix-image-filters';
import type { Matrix } from 'react-native-color-matrix-image-filters';

/**
 * One look a person can give a photo. The matrix is the 4x5 colour transform the native image
 * view applies, built from the library's own helpers so the platform offsets come out right.
 */
export type FilterPreset = { id: string; name: string; matrix: Matrix };

/** The photo as it was taken. Choosing this uploads the original file untouched. */
export const NORMAL_FILTER = 'normal';

// Helper scales: brightness/contrast/saturate are 1 for no change; sepia and grayscale run 0..1;
// temperature warms (+) or cools (-) by scaling red up and blue down. Everything here stays
// close to 1 so a photo still looks like the photo.
export const FILTERS: readonly FilterPreset[] = [
  { id: NORMAL_FILTER, name: 'Normal', matrix: normal() },
  { id: 'clarendon', name: 'Clarendon', matrix: concatColorMatrices(contrast(1.18), saturate(1.2), cool()) },
  { id: 'gingham', name: 'Gingham', matrix: concatColorMatrices(saturate(0.88), brightness(1.06), warm()) },
  { id: 'moon', name: 'Moon', matrix: concatColorMatrices(grayscale(1), contrast(1.12), brightness(1.04)) },
  { id: 'lark', name: 'Lark', matrix: concatColorMatrices(brightness(1.08), saturate(0.9), cool()) },
  { id: 'reyes', name: 'Reyes', matrix: concatColorMatrices(sepia(0.3), brightness(1.1), contrast(0.86)) },
  { id: 'juno', name: 'Juno', matrix: concatColorMatrices(saturate(1.18), warm(), contrast(1.1)) },
  { id: 'slumber', name: 'Slumber', matrix: concatColorMatrices(saturate(0.8), warm(), brightness(0.92)) },
  { id: 'crema', name: 'Crema', matrix: concatColorMatrices(saturate(0.86), temperature(0.04)) },
  { id: 'ludwig', name: 'Ludwig', matrix: concatColorMatrices(contrast(1.1), saturate(0.9), brightness(1.05)) },
  { id: 'aden', name: 'Aden', matrix: concatColorMatrices(temperature(0.05), saturate(0.84), brightness(1.08)) },
  { id: 'perpetua', name: 'Perpetua', matrix: concatColorMatrices(cool(), contrast(1.1)) },
  { id: 'valencia', name: 'Valencia', matrix: concatColorMatrices(temperature(0.06), sepia(0.2), brightness(1.08)) },
  { id: 'xpro2', name: 'X-Pro II', matrix: concatColorMatrices(contrast(1.24), saturate(1.2), warm()) },
  { id: 'lofi', name: 'Lo-Fi', matrix: concatColorMatrices(contrast(1.3), saturate(1.25)) },
  { id: 'willow', name: 'Willow', matrix: concatColorMatrices(grayscale(1), brightness(1.08)) },
  { id: 'inkwell', name: 'Inkwell', matrix: concatColorMatrices(grayscale(1), contrast(1.15)) },
];

/** The preset with this id, or Normal when the id is unknown. */
export function filterById(id: string | null | undefined): FilterPreset {
  return FILTERS.find((f) => f.id === id) ?? FILTERS[0];
}

/** True when this id means the photo should be left exactly as it is. */
export function isNormal(id: string | null | undefined): boolean {
  return filterById(id).id === NORMAL_FILTER;
}
