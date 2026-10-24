/* Formatting. Every number that reaches the DOM goes through here so the
   locale and the currency symbol are set in exactly one place. */

import { I18N, type Locale } from './i18n';

export const MIN = 60000;
export const HOUR = 3600000;

export interface Formatter {
  n: (v: number | null | undefined) => string;
  n1: (v: number | null | undefined) => string;
  money: (v: number | null | undefined) => string;
  money2: (v: number | null | undefined) => string;
  pct: (v: number | null | undefined, digits?: number) => string;
  time: (ts: number) => string;
  mins: (v: number) => string;
  dur: (ms: number) => string;
}

export function hhmm(ts: number): string {
  const d = new Date(ts);
  return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0');
}

/** Minutes past midnight UTC on the simulated day, for <input type="time">. */
export function hhmmLocalInput(ts: number): string {
  return hhmm(ts);
}

export function makeFormatter(locale: Locale, currencySymbol: string, minLabel: string): Formatter {
  const l = I18N[locale].locale;
  return {
    n: (v) => Math.round(v ?? 0).toLocaleString(l),
    n1: (v) => (v ?? 0).toLocaleString(l, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
    money: (v) => currencySymbol + Math.round(v ?? 0).toLocaleString(l),
    money2: (v) =>
      currencySymbol + (v ?? 0).toLocaleString(l, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    pct: (v, digits) => (((v ?? 0) * 100).toFixed(digits ?? 0)) + '%',
    time: hhmm,
    mins: (v) => Math.round(v) + ' ' + minLabel,
    dur: (ms) => {
      const s = Math.max(0, Math.round(ms / 1000));
      return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
    }
  };
}

/** Lighten or darken a #rrggbb hex by a signed 0–255 amount. */
export function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (n & 255) + amt));
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

/** Minutes-since-midnight from an <input type="time"> value. */
export function parseTimeInput(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}
