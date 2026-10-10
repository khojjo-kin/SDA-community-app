// The colour-matrix helpers the shared src/lib/filters.ts builds its presets from, for the desktop.
// A matrix is 4 rows of 5 (red, green, blue, alpha, offset), offsets on a 0..1 scale, the same
// layout SVG's feColorMatrix takes, so a preset can be applied to a canvas directly.
export type Matrix = number[];

export const normal = (): Matrix => [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];

export function concatColorMatrices(...ms: Matrix[]): Matrix {
  return ms.reduce((acc, m) => multiply(m, acc), normal());
}

/** Applies b first, then a. */
function multiply(a: Matrix, b: Matrix): Matrix {
  const out: Matrix = new Array(20).fill(0);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 5; c++) {
      let v = 0;
      for (let k = 0; k < 4; k++) v += a[r * 5 + k] * b[k * 5 + c];
      if (c === 4) v += a[r * 5 + 4];
      out[r * 5 + c] = v;
    }
  }
  return out;
}

export const brightness = (v = 1): Matrix => [v, 0, 0, 0, 0, 0, v, 0, 0, 0, 0, 0, v, 0, 0, 0, 0, 0, 1, 0];

export function contrast(v = 1): Matrix {
  const o = (1 - v) / 2;
  return [v, 0, 0, 0, o, 0, v, 0, 0, o, 0, 0, v, 0, o, 0, 0, 0, 1, 0];
}

export function saturate(v = 1): Matrix {
  const r = 0.2126 * (1 - v), g = 0.7152 * (1 - v), b = 0.0722 * (1 - v);
  return [r + v, g, b, 0, 0, r, g + v, b, 0, 0, r, g, b + v, 0, 0, 0, 0, 0, 1, 0];
}

export const grayscale = (v = 1): Matrix => saturate(1 - v);

export function sepia(v = 1): Matrix {
  const s = [0.393, 0.769, 0.189, 0.349, 0.686, 0.168, 0.272, 0.534, 0.131];
  const id = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const m = id.map((x, i) => x + (s[i] - x) * v);
  return [m[0], m[1], m[2], 0, 0, m[3], m[4], m[5], 0, 0, m[6], m[7], m[8], 0, 0, 0, 0, 0, 1, 0];
}

/** Warmer (+) or cooler (-): red up and blue down, or the other way round. */
export const temperature = (v = 0): Matrix => [1 + v, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1 - v, 0, 0, 0, 0, 0, 1, 0];
export const warm = (): Matrix => temperature(0.06);
export const cool = (): Matrix => temperature(-0.06);
