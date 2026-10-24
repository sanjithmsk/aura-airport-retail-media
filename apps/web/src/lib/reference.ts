/* Reference data the UI needs for labels and colours. It comes from
   @aura/core so there is exactly one copy of the airline list, the category
   tints and the segment catalogue in the product. */

import { AIRCRAFT, AIRLINES, BASELINE, CATEGORIES, DELAY_CODES, DESTINATIONS, REGIONS, SEGMENTS } from '@aura/core';

export interface Airline {
  code: string;
  name: string;
  type: string;
  home: boolean;
  share: number;
  premium: number;
  colour: string;
}

export interface Destination {
  iata: string;
  city: string;
  country: string;
  region: string;
  intl: boolean;
  km: number;
  leisure: number;
  business: number;
}

export interface Category {
  label: string;
  tint: string;
}

export interface Segment {
  id: string;
  label: string;
  group: string;
  path: string;
  base: number;
}

export const AIRLINE_LIST: Airline[] = AIRLINES as Airline[];
export const DESTINATION_LIST: Destination[] = DESTINATIONS as Destination[];
export const CATEGORY_MAP: Record<string, Category> = CATEGORIES as Record<string, Category>;
export const SEGMENT_LIST: Segment[] = SEGMENTS as Segment[];
export const SEGMENT_MAP: Record<string, Segment> = Object.fromEntries(
  SEGMENT_LIST.map((s) => [s.id, s])
);
export const REGION_LIST: string[] = REGIONS;
export const BASELINE_SHARES = BASELINE;
export const AIRCRAFT_LIST = AIRCRAFT;
export const DELAY_CODE_LIST = DELAY_CODES;

/* Aliases kept short because the views read better with them. */
export { AIRLINE_LIST as AIRLINES, CATEGORY_MAP as CATEGORIES, SEGMENT_LIST as SEGMENTS, SEGMENT_MAP as SEGMAP };

export function categoryOf(id: string): Category {
  return CATEGORY_MAP[id] ?? { label: id, tint: '#C8A24B' };
}

export function airlineOf(code: string): Airline | undefined {
  return AIRLINE_LIST.find((a) => a.code === code);
}

export function destinationOf(iata: string): Destination | undefined {
  return DESTINATION_LIST.find((d) => d.iata === iata);
}

export function cityOf(iata: string): string {
  return destinationOf(iata)?.city ?? iata;
}
