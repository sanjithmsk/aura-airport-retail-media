/* Seeded randomness, rounding and the clock constants for the simulated day.
   Everything downstream is a pure function of SEED, so every reviewer sees
   exactly the same airport. */
/* eslint-disable @typescript-eslint/no-explicit-any */
export const SEED = 20261024;

/* mulberry32 — small, fast, well-distributed, fully deterministic */
export function rngFrom(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const pick = <T>(r: () => number, arr: T[]): T => arr[Math.floor(r() * arr.length)];
export const between = (r: () => number, a: number, b: number): number => a + r() * (b - a);
export const inti = (r: () => number, a: number, b: number): number => Math.floor(between(r, a, b + 1));
export const round2 = (n: number): number => Math.round(n * 100) / 100;
export const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

/* ---- Simulation day --------------------------------------------------- */
export const DAY = '2026-10-24';                 // Saturday
export const DAY_START = new Date(DAY + 'T04:30:00Z').getTime();
export const DAY_END   = new Date(DAY + 'T23:59:00Z').getTime();
export const DEMO_TIME = new Date(DAY + 'T14:05:00Z').getTime();   // demo opens here
export const SCENE_TIME = new Date(DAY + 'T14:10:00Z').getTime();  // worked example
export const MIN = 60000, HOUR = 3600000;

export function hhmm(ts: number): string {
  const d = new Date(ts);
  return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0');
}
export function iso(ts: number): string { return new Date(ts).toISOString().replace('.000', ''); }
