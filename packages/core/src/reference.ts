/* White-label config, engine constants and the airport's reference data.
   Swapping THEME re-skins the product; nothing else here is branded. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Zone, AircraftType } from './types.js';

/* =========================================================================
   AURA — Airport Retail Media Platform
   40-config.js  ·  white-label theme, i18n, engine constants, reference data
   ========================================================================= */

/* ---- White-label product config -------------------------------------- */
/* Everything brandable lives here. Swap this object to re-skin the product. */
export const THEME = {
  productName: 'AURA',
  productTagline: 'Airport Retail Media',
  operator: 'Aurelia Airports Authority',
  airport: { iata: 'AUR', icao: 'QXAU', name: 'Aurelia International Airport', city: 'Aurelia' },
  currency: { code: 'EUR', symbol: '€', rate: 1 },
  locales: ['en', 'ar'],
  defaultLocale: 'en',
  // mark drawn in SVG, no external asset
  mark: '<svg viewBox="0 0 28 28" aria-hidden="true" class="brandmark"><path d="M14 2.6 25.4 24a1 1 0 0 1-1.25 1.4L14 21.2 3.85 25.4A1 1 0 0 1 2.6 24Z"/><path d="M14 2.6 14 21.2" class="mk2"/></svg>'
};

/* ---- Engine constants (surfaced + editable in Admin → Rule engine) ----- */
export const ENGINE = {
  version: 'segment-model v4.2.1',
  slotSeconds: 15,            // one decision per screen per 15s slot
  windowMinutes: 5,           // presence/profile window
  triggerBoostWeight: 0.33,   // how much of a trigger boost is applied
  conversionLiftCap: 0.10,    // max additive lift from learned conversion
  conversionLiftScale: 0.10,  // lift = (cvrIndex - 1) * scale
  explorationPct: 0.05,       // epsilon: % of slots given to exploration
  frequencyCapPerHour: 4,     // same campaign on same screen
  competitorSeparation: 2,    // slots between same-category advertisers
  minCrowd: 0,                // global floor, campaigns set their own
  freshness: {                // max age in seconds before an input is "stale"
    aodb: 900, aidx: 180, acris: 300, telemetry: 120
  },
  catchmentRadius: 180        // metres; gates beyond this don't feed a screen
};

/* ---- Network baseline shares (denominator for audience indexing) ------ */
/* Computed once from the whole generated day; seeded here for determinism
   and shown in the UI as "network baseline". */
export const BASELINE = {
  international: 0.52, domestic: 0.48,
  holiday: 0.34, business: 0.30, vfr: 0.22, student: 0.09, religious: 0.05,
  family: 0.18, couple: 0.27, solo: 0.42, group: 0.13,
  u12: 0.07, a1217: 0.05, a1824: 0.12, a2534: 0.23, a3544: 0.19, a4554: 0.16, a55p: 0.18,
  age2554: 0.55,
  premiumCabin: 0.21, frequentFlyer: 0.17,
  gulf: 0.16, europe: 0.33, asia: 0.19, africa: 0.06, americas: 0.04
};

/* ---- Reference data --------------------------------------------------- */

export const REGIONS = ['Domestic', 'Gulf', 'Europe', 'Asia', 'Africa', 'Americas'];

/* Destinations. Home airport + domestic network are fictional (Q-prefix codes
   are unassigned in IATA practice). International destinations are real city
   codes so the demo reads naturally to an aviation audience. */
export const DESTINATIONS = [
  // --- Domestic (fictional Aurelian network) ---
  { iata: 'QVA', city: 'Valtara',   country: 'Aurelia', region: 'Domestic', intl: false, km: 410,  leisure: 0.30, business: 0.46 },
  { iata: 'QKS', city: 'Korsund',   country: 'Aurelia', region: 'Domestic', intl: false, km: 620,  leisure: 0.28, business: 0.50 },
  { iata: 'QMD', city: 'Meridon',   country: 'Aurelia', region: 'Domestic', intl: false, km: 280,  leisure: 0.22, business: 0.58 },
  { iata: 'QAG', city: 'Ashgrove',  country: 'Aurelia', region: 'Domestic', intl: false, km: 540,  leisure: 0.44, business: 0.30 },
  { iata: 'QPH', city: 'Porthaven', country: 'Aurelia', region: 'Domestic', intl: false, km: 760,  leisure: 0.58, business: 0.20 },
  { iata: 'QEL', city: 'Eldmoor',   country: 'Aurelia', region: 'Domestic', intl: false, km: 330,  leisure: 0.26, business: 0.52 },
  { iata: 'QNV', city: 'Navaro',    country: 'Aurelia', region: 'Domestic', intl: false, km: 880,  leisure: 0.62, business: 0.18 },
  { iata: 'QTB', city: 'Thornbury', country: 'Aurelia', region: 'Domestic', intl: false, km: 195,  leisure: 0.20, business: 0.60 },
  // --- Gulf ---
  { iata: 'DXB', city: 'Dubai',     country: 'UAE',          region: 'Gulf', intl: true, km: 3400, leisure: 0.46, business: 0.34 },
  { iata: 'DOH', city: 'Doha',      country: 'Qatar',        region: 'Gulf', intl: true, km: 3250, leisure: 0.34, business: 0.44 },
  { iata: 'AUH', city: 'Abu Dhabi', country: 'UAE',          region: 'Gulf', intl: true, km: 3460, leisure: 0.38, business: 0.40 },
  { iata: 'RUH', city: 'Riyadh',    country: 'Saudi Arabia', region: 'Gulf', intl: true, km: 3100, leisure: 0.20, business: 0.54 },
  { iata: 'KWI', city: 'Kuwait',    country: 'Kuwait',       region: 'Gulf', intl: true, km: 3020, leisure: 0.24, business: 0.48 },
  { iata: 'MCT', city: 'Muscat',    country: 'Oman',         region: 'Gulf', intl: true, km: 3620, leisure: 0.42, business: 0.34 },
  { iata: 'BAH', city: 'Bahrain',   country: 'Bahrain',      region: 'Gulf', intl: true, km: 3180, leisure: 0.30, business: 0.46 },
  // --- Europe ---
  { iata: 'LHR', city: 'London',    country: 'UK',          region: 'Europe', intl: true, km: 1450, leisure: 0.38, business: 0.44 },
  { iata: 'CDG', city: 'Paris',     country: 'France',      region: 'Europe', intl: true, km: 1080, leisure: 0.44, business: 0.38 },
  { iata: 'FRA', city: 'Frankfurt', country: 'Germany',     region: 'Europe', intl: true, km: 940,  leisure: 0.30, business: 0.52 },
  { iata: 'AMS', city: 'Amsterdam', country: 'Netherlands', region: 'Europe', intl: true, km: 1180, leisure: 0.42, business: 0.42 },
  { iata: 'MAD', city: 'Madrid',    country: 'Spain',       region: 'Europe', intl: true, km: 1320, leisure: 0.52, business: 0.30 },
  { iata: 'FCO', city: 'Rome',      country: 'Italy',       region: 'Europe', intl: true, km: 760,  leisure: 0.58, business: 0.26 },
  { iata: 'ZRH', city: 'Zurich',    country: 'Switzerland', region: 'Europe', intl: true, km: 820,  leisure: 0.28, business: 0.56 },
  { iata: 'VIE', city: 'Vienna',    country: 'Austria',     region: 'Europe', intl: true, km: 690,  leisure: 0.40, business: 0.42 },
  { iata: 'LIS', city: 'Lisbon',    country: 'Portugal',    region: 'Europe', intl: true, km: 1900, leisure: 0.60, business: 0.24 },
  { iata: 'DUB', city: 'Dublin',    country: 'Ireland',     region: 'Europe', intl: true, km: 1740, leisure: 0.46, business: 0.34 },
  { iata: 'MUC', city: 'Munich',    country: 'Germany',     region: 'Europe', intl: true, km: 800,  leisure: 0.34, business: 0.48 },
  { iata: 'CPH', city: 'Copenhagen',country: 'Denmark',     region: 'Europe', intl: true, km: 1240, leisure: 0.36, business: 0.46 },
  { iata: 'IST', city: 'Istanbul',  country: 'Turkiye',     region: 'Europe', intl: true, km: 1150, leisure: 0.48, business: 0.32 },
  // --- Leisure / beach ---
  { iata: 'AYT', city: 'Antalya',   country: 'Turkiye',   region: 'Europe', intl: true, km: 1480, leisure: 0.84, business: 0.05, beach: true },
  { iata: 'HER', city: 'Heraklion', country: 'Greece',    region: 'Europe', intl: true, km: 1270, leisure: 0.88, business: 0.04, beach: true },
  { iata: 'PMI', city: 'Palma',     country: 'Spain',     region: 'Europe', intl: true, km: 1390, leisure: 0.86, business: 0.05, beach: true },
  { iata: 'MLE', city: 'Male',      country: 'Maldives',  region: 'Asia',   intl: true, km: 6100, leisure: 0.90, business: 0.04, beach: true },
  { iata: 'DPS', city: 'Denpasar',  country: 'Indonesia', region: 'Asia',   intl: true, km: 9800, leisure: 0.88, business: 0.05, beach: true },
  { iata: 'HKT', city: 'Phuket',    country: 'Thailand',  region: 'Asia',   intl: true, km: 8400, leisure: 0.87, business: 0.05, beach: true },
  // --- Asia ---
  { iata: 'SIN', city: 'Singapore', country: 'Singapore', region: 'Asia', intl: true, km: 9200, leisure: 0.36, business: 0.46 },
  { iata: 'KUL', city: 'Kuala Lumpur', country: 'Malaysia', region: 'Asia', intl: true, km: 9100, leisure: 0.44, business: 0.34 },
  { iata: 'BKK', city: 'Bangkok',   country: 'Thailand',  region: 'Asia', intl: true, km: 8300, leisure: 0.62, business: 0.24 },
  { iata: 'HKG', city: 'Hong Kong', country: 'Hong Kong', region: 'Asia', intl: true, km: 8900, leisure: 0.32, business: 0.50 },
  { iata: 'DEL', city: 'Delhi',     country: 'India',     region: 'Asia', intl: true, km: 5600, leisure: 0.30, business: 0.34 },
  { iata: 'BOM', city: 'Mumbai',    country: 'India',     region: 'Asia', intl: true, km: 5300, leisure: 0.28, business: 0.38 },
  { iata: 'CMB', city: 'Colombo',   country: 'Sri Lanka', region: 'Asia', intl: true, km: 6500, leisure: 0.46, business: 0.22 },
  { iata: 'ICN', city: 'Seoul',     country: 'South Korea', region: 'Asia', intl: true, km: 8600, leisure: 0.38, business: 0.44 },
  { iata: 'NRT', city: 'Tokyo',     country: 'Japan',     region: 'Asia', intl: true, km: 9400, leisure: 0.40, business: 0.44 },
  // --- Africa ---
  { iata: 'CAI', city: 'Cairo',     country: 'Egypt',     region: 'Africa', intl: true, km: 2200, leisure: 0.44, business: 0.30 },
  { iata: 'CMN', city: 'Casablanca',country: 'Morocco',   region: 'Africa', intl: true, km: 2100, leisure: 0.42, business: 0.30 },
  { iata: 'NBO', city: 'Nairobi',   country: 'Kenya',     region: 'Africa', intl: true, km: 5400, leisure: 0.40, business: 0.32 },
  { iata: 'JNB', city: 'Johannesburg', country: 'South Africa', region: 'Africa', intl: true, km: 7600, leisure: 0.34, business: 0.40 },
  // --- Americas ---
  { iata: 'JFK', city: 'New York',  country: 'USA',       region: 'Americas', intl: true, km: 6800, leisure: 0.40, business: 0.44 },
  { iata: 'YYZ', city: 'Toronto',   country: 'Canada',    region: 'Americas', intl: true, km: 6600, leisure: 0.42, business: 0.38 },
  { iata: 'GRU', city: 'Sao Paulo', country: 'Brazil',    region: 'Americas', intl: true, km: 9900, leisure: 0.38, business: 0.40 }
];

/* 10 fictional airlines */
export const AIRLINES = [
  { code: 'XY', name: 'Aurelia Air',               type: 'full',     home: true,  share: 0.26, premium: 0.22, colour: '#C8A24B' },
  { code: 'ZQ', name: 'Zephyr',                    type: 'lowcost',  home: true,  share: 0.17, premium: 0.02, colour: '#36B4A0' },
  { code: 'NL', name: 'Northline Regional',        type: 'regional', home: true,  share: 0.12, premium: 0.06, colour: '#5D8BC4' },
  { code: 'GV', name: 'GulfVista Airways',         type: 'full',     home: false, share: 0.09, premium: 0.26, colour: '#B4713C' },
  { code: 'KM', name: 'Kestrel',                   type: 'lowcost',  home: false, share: 0.09, premium: 0.01, colour: '#C4624F' },
  { code: 'SF', name: 'Solera Airlines',           type: 'full',     home: false, share: 0.08, premium: 0.20, colour: '#7C6BB0' },
  { code: 'AV', name: 'Avanti Air',                type: 'leisure',  home: false, share: 0.06, premium: 0.04, colour: '#D08A33' },
  { code: 'PT', name: 'Pacifica Transcontinental', type: 'full',     home: false, share: 0.05, premium: 0.30, colour: '#4E8F74' },
  { code: 'MR', name: 'Meridian Express',          type: 'regional', home: false, share: 0.05, premium: 0.05, colour: '#8A93A3' },
  { code: 'TB', name: 'Tramontane Blue',           type: 'leisure',  home: false, share: 0.03, premium: 0.02, colour: '#4F7FBF' }
];

export const AIRCRAFT = [
  { type: 'A320', seats: 180, body: 'narrow', premiumSeats: 0 },
  { type: 'A321', seats: 220, body: 'narrow', premiumSeats: 16 },
  { type: 'A20N', seats: 186, body: 'narrow', premiumSeats: 0 },
  { type: 'B738', seats: 189, body: 'narrow', premiumSeats: 0 },
  { type: 'B38M', seats: 197, body: 'narrow', premiumSeats: 12 },
  { type: 'E195', seats: 124, body: 'regional', premiumSeats: 0 },
  { type: 'AT76', seats: 78,  body: 'regional', premiumSeats: 0 },
  { type: 'A333', seats: 295, body: 'wide', premiumSeats: 48 },
  { type: 'A359', seats: 325, body: 'wide', premiumSeats: 60 },
  { type: 'B789', seats: 296, body: 'wide', premiumSeats: 54 },
  { type: 'B77W', seats: 368, body: 'wide', premiumSeats: 62 }
];

/* IATA/CDM-style delay codes actually used by AODB feeds */
export const DELAY_CODES = [
  { code: '93', text: 'Aircraft rotation, late arrival of aircraft' },
  { code: '89', text: 'Restrictions at airport of departure' },
  { code: '15', text: 'Boarding, discrepancies and paging' },
  { code: '41', text: 'Technical defects, aircraft' },
  { code: '71', text: 'Departure station weather' },
  { code: '81', text: 'ATFM due to ATC en-route demand/capacity' },
  { code: '87', text: 'Airport facilities' },
  { code: '63', text: 'Cabin crew shortage' }
];

/* ---- Terminal / zone topology ---------------------------------------- */
/* x,y are floor-plan coordinates on a 1000x560 stylised plan. */
export const ZONES: Zone[] = [
  { id: 'T1-CHK', terminal: 'T1', name: 'T1 Check-in Hall',  kind: 'landside', x: 120, y: 92,  w: 230, h: 76,  gates: [] },
  { id: 'T1-SEC', terminal: 'T1', name: 'T1 Security',       kind: 'control',  x: 120, y: 178, w: 230, h: 44,  gates: [] },
  { id: 'T1-PLZ', terminal: 'T1', name: 'T1 Retail Plaza',   kind: 'airside',  x: 120, y: 232, w: 230, h: 86,  gates: [] },
  { id: 'T1-PA',  terminal: 'T1', name: 'Pier A (Gates 1–18)', kind: 'pier', x: 46,  y: 328, w: 150, h: 180, gates: [] },
  { id: 'T1-PB',  terminal: 'T1', name: 'Pier B (Gates 20–29)', kind: 'pier', x: 206, y: 328, w: 144, h: 180, gates: [] },
  { id: 'T1-ARR', terminal: 'T1', name: 'T1 Arrivals',       kind: 'landside', x: 46,  y: 36,  w: 64,  h: 132, gates: [] },

  { id: 'T2-CHK', terminal: 'T2', name: 'T2 Check-in Hall',  kind: 'landside', x: 520, y: 70,  w: 300, h: 80,  gates: [] },
  { id: 'T2-SEC', terminal: 'T2', name: 'T2 Security',       kind: 'control',  x: 520, y: 160, w: 300, h: 44,  gates: [] },
  { id: 'T2-DF',  terminal: 'T2', name: 'Duty Free Hall',    kind: 'airside',  x: 520, y: 214, w: 300, h: 96,  gates: [] },
  { id: 'T2-LNG', terminal: 'T2', name: 'Lounge Corridor',   kind: 'airside',  x: 830, y: 214, w: 118, h: 96,  gates: [] },
  { id: 'T2-PC',  terminal: 'T2', name: 'Pier C (Gates 30–49)', kind: 'pier', x: 470, y: 320, w: 230, h: 192, gates: [] },
  { id: 'T2-PD',  terminal: 'T2', name: 'Pier D (Gates 50–64)', kind: 'pier', x: 712, y: 320, w: 236, h: 192, gates: [] },
  { id: 'T2-ARR', terminal: 'T2', name: 'T2 Arrivals',       kind: 'landside', x: 430, y: 70,  w: 72,  h: 150, gates: [] }
];

/* Outlet categories drive competitor separation and creative templates */
export const CATEGORIES = {
  perfume:    { label: 'Perfume & Cosmetics', tint: '#C9739B' },
  dutyfree:   { label: 'Duty Free',           tint: '#C8A24B' },
  coffee:     { label: 'Coffee & Bakery',     tint: '#A5774B' },
  restaurant: { label: 'Restaurant',          tint: '#C4624F' },
  fashion:    { label: 'Fashion',             tint: '#8A6FB0' },
  toys:       { label: 'Toys & Kids',         tint: '#4FA3D1' },
  books:      { label: 'Books & News',        tint: '#5E8C6A' },
  tech:       { label: 'Electronics',         tint: '#4E7FA8' },
  pharmacy:   { label: 'Pharmacy & Health',   tint: '#4CA38C' },
  souvenir:   { label: 'Souvenirs',           tint: '#C98A3C' },
  lounge:     { label: 'Lounge & Services',   tint: '#7D8CA3' },
  fx:         { label: 'Currency & Finance',  tint: '#6E8B5E' },
  airline:    { label: 'Airline',             tint: '#B4713C' }
};

/* ---- Segment catalogue ------------------------------------------------
   Every targetable segment: how it is read off the crowd profile and what
   the network baseline is. This is the contract between the campaign
   builder and the scoring engine.                                       */
export const SEGMENTS = [
  { id: 'international', label: 'International',        group: 'Journey',  path: 'international', base: BASELINE.international },
  { id: 'domestic',      label: 'Domestic',             group: 'Journey',  path: 'domestic',      base: BASELINE.domestic },
  { id: 'holiday',       label: 'Holiday',              group: 'Purpose',  path: 'purpose.holiday',  base: BASELINE.holiday },
  { id: 'business',      label: 'Business',             group: 'Purpose',  path: 'purpose.business', base: BASELINE.business },
  { id: 'vfr',           label: 'Visiting family',      group: 'Purpose',  path: 'purpose.vfr',      base: BASELINE.vfr },
  { id: 'student',       label: 'Student',              group: 'Purpose',  path: 'purpose.student',  base: BASELINE.student },
  { id: 'religious',     label: 'Religious travel',     group: 'Purpose',  path: 'purpose.religious',base: BASELINE.religious },
  { id: 'family',        label: 'Family with children', group: 'Party',    path: 'party.family',  base: BASELINE.family },
  { id: 'couple',        label: 'Couple',               group: 'Party',    path: 'party.couple',  base: BASELINE.couple },
  { id: 'solo',          label: 'Solo traveller',       group: 'Party',    path: 'party.solo',    base: BASELINE.solo },
  { id: 'group',         label: 'Group',                group: 'Party',    path: 'party.group',   base: BASELINE.group },
  { id: 'u12',           label: 'Children under 12',    group: 'Age',      path: 'age.u12',       base: BASELINE.u12 },
  { id: 'a1824',         label: 'Adults 18–24',    group: 'Age',      path: 'age.a1824',     base: BASELINE.a1824 },
  { id: 'age2554',       label: 'Adults 25–54',    group: 'Age',      path: 'age2554',       base: BASELINE.age2554 },
  { id: 'a55p',          label: 'Adults 55+',           group: 'Age',      path: 'age.a55p',      base: BASELINE.a55p },
  { id: 'premiumCabin',  label: 'Premium cabin',        group: 'Spend',    path: 'premiumCabin',  base: BASELINE.premiumCabin },
  { id: 'frequentFlyer', label: 'Frequent flyer',       group: 'Spend',    path: 'frequentFlyer', base: BASELINE.frequentFlyer },
  { id: 'gulf',          label: 'Gulf-bound',           group: 'Region',   path: 'region.Gulf',   base: BASELINE.gulf },
  { id: 'europe',        label: 'Europe-bound',         group: 'Region',   path: 'region.Europe', base: BASELINE.europe },
  { id: 'asia',          label: 'Asia-bound',           group: 'Region',   path: 'region.Asia',   base: BASELINE.asia }
];
export const SEGMAP = Object.fromEntries(SEGMENTS.map(s => [s.id, s]));


