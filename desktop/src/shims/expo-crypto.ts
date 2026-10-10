export function randomUUID(): string {
  return crypto.randomUUID();
}

/** Random bytes, as expo-crypto gives them on the phone (rtc.ts uses this for live viewer tokens). */
export function getRandomBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}
