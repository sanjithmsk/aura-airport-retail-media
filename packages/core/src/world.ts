/* Deterministic mock-data generator for one day at AUR. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { World, Flight, Gate, Screen, Outlet, Campaign, Creative, PromoCode, Vendor } from './types.js';
import {
  THEME, ENGINE, ZONES, AIRLINES, AIRCRAFT, DESTINATIONS, DELAY_CODES, CATEGORIES
} from './reference.js';
import {
  rngFrom, pick, between, inti, round2, clamp01, hhmm, iso,
  DAY, DAY_START, DAY_END, DEMO_TIME, SCENE_TIME, MIN, HOUR, SEED
} from './util.js';

/* =========================================================================
   42-world.js · deterministic mock-data generator for one day at AUR
   ~900 flight legs · 63 gates · 180 screens · 40 outlets · 10 airlines
   · 25 campaigns with 30 days of history
   Everything is derived from one seed, so every reviewer sees the same
   airport and the worked example reproduces exactly.
   ========================================================================= */



/* =========================================================================
   The worked example from the brief, pinned so it reproduces exactly.
   Gate 42 @ 14:10 · XY501 DXB 240 pax delayed 45 · ZQ88 QNV 180 pax
   Catchment profile: holiday 58% · family 31% · business 22%
                      international 57% · median dwell 52 min
   ========================================================================= */
export const SCRIPTED_FLIGHTS = {
  XY501: {
    airline: 'XY', num: '501', dest: 'DXB', gate: '42', stand: 'C42', terminal: 'T2',
    std: '14:40', delayMin: 45, delayCode: '93', pax: 240, acType: 'A333', belt: null,
    checkin: '24-31', status: 'delayed',
    profile: {
      international: 1, domestic: 0,
      purpose: { holiday: 0.415, business: 0.340, vfr: 0.155, student: 0.050, religious: 0.040 },
      party:   { solo: 0.400, couple: 0.280, family: 0.197, group: 0.123 },
      age:     { u12: 0.055, a1217: 0.035, a1824: 0.095, a2534: 0.245, a3544: 0.225, a4554: 0.170, a55p: 0.175 },
      age2554: 0.640, gender: { f: 0.45, m: 0.55 },
      cabin: { economy: 0.74, premiumEconomy: 0.14, business: 0.12 },
      premiumCabin: 0.260, frequentFlyer: 0.290,
      nationalities: [['Aurelian', 0.46], ['Emirati', 0.21], ['Indian', 0.17]],
      languages: [['English', 0.62], ['Arabic', 0.28], ['Hindi', 0.14]],
      region: { Gulf: 1 }
    }
  },
  ZQ88: {
    airline: 'ZQ', num: '88', dest: 'QNV', gate: '44', stand: 'C44', terminal: 'T2',
    std: '15:30', delayMin: 0, delayCode: null, pax: 180, acType: 'B738', belt: null,
    checkin: '12-16', status: 'scheduled',
    profile: {
      international: 0, domestic: 1,
      purpose: { holiday: 0.800, business: 0.060, vfr: 0.105, student: 0.025, religious: 0.010 },
      party:   { solo: 0.150, couple: 0.300, family: 0.460, group: 0.090 },
      age:     { u12: 0.139, a1217: 0.074, a1824: 0.085, a2534: 0.190, a3544: 0.205, a4554: 0.152, a55p: 0.155 },
      age2554: 0.547, gender: { f: 0.52, m: 0.48 },
      cabin: { economy: 1.0, premiumEconomy: 0, business: 0 },
      premiumCabin: 0, frequentFlyer: 0.06,
      nationalities: [['Aurelian', 0.91], ['Solerian', 0.05], ['British', 0.02]],
      languages: [['Aurelian', 0.88], ['English', 0.54], ['Arabic', 0.07]],
      region: { Domestic: 1 }
    }
  }
};

/* =========================================================================
   Gates, zones, screens
   ========================================================================= */
export function buildGates(): Gate[] {
  const gates = [];
  const add = (num, zone, terminal, intl, x, y) =>
    gates.push({ id: String(num), zone, terminal, intl, x, y, stand: (terminal === 'T1' ? 'A' : 'C') + num });

  // T1 Pier A: gates 1-18 (domestic + regional)
  for (let i = 1; i <= 18; i++) {
    const col = i % 2, row = Math.floor((i - 1) / 2);
    add(i, 'T1-PA', 'T1', false, 62 + col * 112, 348 + row * 18);
  }
  // T1 Pier B: gates 20-29 (regional + a few short-haul intl)
  for (let i = 20; i <= 29; i++) {
    const col = i % 2, row = Math.floor((i - 20) / 2);
    add(i, 'T1-PB', 'T1', i >= 26, 222 + col * 106, 348 + row * 34);
  }
  // T2 Pier C: gates 30-49 (international, incl. the demo gate 42)
  for (let i = 30; i <= 49; i++) {
    const col = i % 2, row = Math.floor((i - 30) / 2);
    add(i, 'T2-PC', 'T2', true, 486 + col * 182, 340 + row * 17);
  }
  // T2 Pier D: gates 50-64 (international widebody)
  for (let i = 50; i <= 64; i++) {
    const col = i % 2, row = Math.floor((i - 50) / 2);
    add(i, 'T2-PD', 'T2', true, 728 + col * 186, 340 + row * 23);
  }
  return gates;
}

export const SCREEN_MODELS = [
  { size: '55"',  orient: 'portrait',  ratio: '9:16', kind: 'Gate totem' },
  { size: '75"',  orient: 'landscape', ratio: '16:9', kind: 'Gate banner' },
  { size: '86"',  orient: 'landscape', ratio: '16:9', kind: 'Concourse panel' },
  { size: '98"',  orient: 'landscape', ratio: '16:9', kind: 'Hall videowall' },
  { size: '49"',  orient: 'portrait',  ratio: '9:16', kind: 'Retail totem' },
  { size: '2x3',  orient: 'landscape', ratio: '16:9', kind: 'Videowall array' }
];

export function buildScreens(r: () => number, gates: Gate[]): Screen[] {
  const screens = [];
  let n = 1;
  const mk = (zone: string, model: any, gateIds: string[], opts: any = {}) => {
    const z = ZONES.find(x => x.id === zone);
    const id = 'SCR-' + String(n++).padStart(3, '0');
    screens.push({
      id, zone, terminal: z.terminal,
      name: opts.name || (z.name + ' · ' + model.kind + ' ' + id.slice(-3)),
      size: model.size, orientation: model.orient, ratio: model.ratio, kind: model.kind,
      nearGates: gateIds,
      x: opts.x != null ? opts.x : z.x + z.w * between(r, 0.15, 0.85),
      y: opts.y != null ? opts.y : z.y + z.h * between(r, 0.2, 0.8),
      status: 'online', latencyMs: Math.round(between(r, 34, 120)),
      offlineSince: null, installed: '2025-' + String(inti(r, 1, 12)).padStart(2, '0') + '-14',
      vendor: pick(r, ['Lumen Displays', 'NordVision AV', 'Halcyon Signage']),
      floorPrice: 0, lastPlay: null, playsToday: 0, impressionsToday: 0
    });
  };

  // Gate screens: every gate gets a totem; every other gate also a banner
  gates.forEach((g, i) => {
    const neighbours = gates
      .filter(o => o.zone === g.zone && Math.abs(Number(o.id) - Number(g.id)) <= 2)
      .map(o => o.id);
    mk(g.zone, SCREEN_MODELS[0], neighbours, {
      name: 'Gate ' + g.id + ' totem', x: g.x, y: g.y
    });
    if (i % 2 === 0) {
      mk(g.zone, SCREEN_MODELS[1], neighbours, {
        name: 'Gate ' + g.id + ' banner', x: g.x + 8, y: g.y + 6
      });
    }
  });

  // Zone screens away from gates
  const zoneScreens: Array<[string, number]> = [
    ['T1-CHK', 8], ['T1-SEC', 5], ['T1-PLZ', 11], ['T1-ARR', 6],
    ['T2-CHK', 11], ['T2-SEC', 7], ['T2-DF', 20], ['T2-LNG', 7], ['T2-ARR', 8]
  ];
  zoneScreens.forEach(([zid, count]) => {
    const z = ZONES.find(x => x.id === zid);
    const short = z.name.replace(/^T[12] /, '').replace(' Hall', '');
    const tg = gates.filter(g => g.terminal === z.terminal).map(g => g.id);
    for (let i = 0; i < count; i++) {
      const model = z.kind === 'airside' ? pick(r, [SCREEN_MODELS[2], SCREEN_MODELS[4], SCREEN_MODELS[5]])
        : pick(r, [SCREEN_MODELS[2], SCREEN_MODELS[3]]);
      // each screen in a hall faces a different stretch of the concourse
      const span = 7, off = (i * 5) % Math.max(1, tg.length - span);
      mk(zid, model, tg.slice(off, off + span),
        { name: short + ' ' + model.kind.toLowerCase() + ' ' + String(n).padStart(3, '0') });
    }
  });
  return screens;
}

/* =========================================================================
   Outlets and advertisers
   ========================================================================= */
export const OUTLET_SEED: Array<[string, string, string, string[]]> = [
  ['Lumière Parfums',      'perfume',    'T2-DF',  ['40','41','42','43','44','45','46']],
  ['Meridian Duty Free',        'dutyfree',   'T2-DF',  ['38','39','40','41','42','43','44']],
  ['Aurelia Duty Free Hall',    'dutyfree',   'T2-DF',  ['34','35','36','37','38','39']],
  ['Pocketship Toys',           'toys',       'T2-DF',  ['41','42','43','44','45','46','47']],
  ['Skyhaven Lounge',           'lounge',     'T2-LNG', ['50','51','52','53','54']],
  ['Brew & Bloom Coffee',       'coffee',     'T2-DF',  ['36','37','38','39','40','41']],
  ['Brew & Bloom Coffee',       'coffee',     'T1-PLZ', ['8','9','10','11','12']],
  ['Brew & Bloom Coffee',       'coffee',     'T2-PD',  ['54','55','56','57']],
  ['The Gilded Fig',            'restaurant', 'T2-DF',  ['44','45','46','47','48']],
  ['Harbourline Grill',         'restaurant', 'T1-PLZ', ['4','5','6','7','8']],
  ['Saltmarsh Bakery',          'coffee',     'T1-PLZ', ['12','13','14','15']],
  ['Noon & Nine',               'restaurant', 'T2-PC',  ['30','31','32','33']],
  ['Vermilion Atelier',         'fashion',    'T2-DF',  ['40','41','42','43']],
  ['Northcraft Outfitters',     'fashion',    'T1-PLZ', ['2','3','4','5']],
  ['Calder & Vane',             'fashion',    'T2-LNG', ['50','51','52']],
  ['Paperbark Books',           'books',      'T1-PLZ', ['9','10','11','12','13']],
  ['Paperbark Books',           'books',      'T2-DF',  ['37','38','39','40']],
  ['Volt & Current',            'tech',       'T2-DF',  ['42','43','44','45']],
  ['Volt & Current',            'tech',       'T1-PLZ', ['6','7','8','9']],
  ['Meridian Pharmacy',         'pharmacy',   'T2-DF',  ['39','40','41']],
  ['Meridian Pharmacy',         'pharmacy',   'T1-PLZ', ['10','11','12']],
  ['Harbour Souvenirs',         'souvenir',   'T1-PLZ', ['14','15','16','17']],
  ['Harbour Souvenirs',         'souvenir',   'T2-DF',  ['45','46','47','48']],
  ['Aurelia Exchange',          'fx',         'T2-CHK', ['30','31']],
  ['Aurelia Exchange',          'fx',         'T1-CHK', ['1','2']],
  ['Tidewater Juice Bar',       'coffee',     'T2-PC',  ['46','47','48','49']],
  ['Copperpot Kitchen',         'restaurant', 'T2-PD',  ['58','59','60','61']],
  ['The Quiet Car Lounge',      'lounge',     'T1-PLZ', ['20','21','22']],
  ['Marchetti Confetti',        'dutyfree',   'T2-DF',  ['43','44','45']],
  ['Saffron & Stone',           'restaurant', 'T2-LNG', ['52','53','54']],
  ['Little Lantern Kids',       'toys',       'T1-PLZ', ['15','16','17','18']],
  ['Orbit Travel Tech',         'tech',       'T2-PD',  ['62','63','64']],
  ['Glasshouse Florists',       'souvenir',   'T2-CHK', ['32','33']],
  ['Birchwood Delicatessen',    'coffee',     'T2-PD',  ['50','51','52','53']],
  ['Ridgeway Luggage',          'fashion',    'T2-DF',  ['36','37','38']],
  ['Pennyroyal Sweets',         'dutyfree',   'T1-PLZ', ['3','4','5','6']],
  ['Alcove Wine Bar',           'restaurant', 'T2-LNG', ['55','56','57']],
  ['Signal Hill Coffee',        'coffee',     'T2-CHK', ['34','35']],
  ['Kettle & Crane',            'restaurant', 'T1-PA',  ['1','2','3']],
  ['Driftwood Spa Express',     'lounge',     'T2-DF',  ['41','42','43','44']]
];

export function buildOutlets(r: () => number): Outlet[] {
  return OUTLET_SEED.map(([name, category, zone, nearGates], i) => ({
    id: 'OUT-' + String(i + 1).padStart(3, '0'),
    name, category, zone, nearGates,
    terminal: ZONES.find(z => z.id === zone).terminal,
    unit: (zone.startsWith('T1') ? 'A' : 'C') + '-' + String(100 + i * 3),
    sqm: inti(r, 28, 240),
    opens: '05:00', closes: '23:30',
    contact: name.toLowerCase().replace(/[^a-z]+/g, '.').replace(/^\.|\.$/g, '') + '@tenants.aur',
    monthlyRent: inti(r, 6, 42) * 1000
  }));
}

/* =========================================================================
   Flights — ~900 legs over the sim day
   ========================================================================= */
export function buildFlights(r: () => number, gates: Gate[]): Flight[] {
  const flights = [];
  const intlGates = gates.filter(g => g.intl);
  const domGates = gates.filter(g => !g.intl);
  let seq = 100;

  function makeProfile(dest, airline, ac, depTs, paxCount) {
    const d = new Date(depTs);
    const hour = d.getUTCHours();
    const weekend = true;               // the sim day is a Saturday
    const earlyBiz = hour >= 5 && hour < 9 ? 1 : 0;
    const eveLeisure = hour >= 16 && hour < 22 ? 1 : 0;

    // --- purpose -------------------------------------------------------
    let holiday = dest.leisure + (weekend ? 0.10 : 0) + eveLeisure * 0.06 - earlyBiz * 0.10;
    let business = dest.business - (weekend ? 0.12 : 0) + earlyBiz * 0.14 - eveLeisure * 0.04;
    if (airline.type === 'lowcost' || airline.type === 'leisure') { holiday += 0.12; business -= 0.12; }
    if (airline.type === 'full') business += 0.04;
    holiday = clamp01(holiday + between(r, -0.04, 0.04));
    business = clamp01(business + between(r, -0.04, 0.04));
    let vfr = clamp01(0.30 - holiday * 0.22 - business * 0.18 + between(r, -0.03, 0.06));
    let student = clamp01((dest.region === 'Europe' || dest.region === 'Asia' ? 0.11 : 0.05) + between(r, -0.03, 0.03));
    let religious = clamp01((dest.iata === 'RUH' || dest.iata === 'CAI' ? 0.16 : 0.02) + between(r, -0.01, 0.02));
    const psum = holiday + business + vfr + student + religious;
    const purpose = {
      holiday: holiday / psum, business: business / psum, vfr: vfr / psum,
      student: student / psum, religious: religious / psum
    };

    // --- party ---------------------------------------------------------
    const schoolHoliday = true;         // late-October half term
    let family = clamp01(purpose.holiday * 0.52 + (dest.beach ? 0.14 : 0) + (schoolHoliday ? 0.07 : 0) - purpose.business * 0.30);
    let couple = clamp01(0.20 + purpose.holiday * 0.22 - family * 0.18);
    let group = clamp01(0.06 + (dest.beach ? 0.07 : 0) + purpose.religious * 0.5);
    let solo = clamp01(1 - family - couple - group);
    const qsum = family + couple + group + solo;
    const party = { family: family / qsum, couple: couple / qsum, group: group / qsum, solo: solo / qsum };

    // --- age -----------------------------------------------------------
    const u12 = clamp01(party.family * 0.30);
    const a1217 = clamp01(party.family * 0.16);
    const a1824 = clamp01(0.07 + purpose.student * 0.55);
    const a55p = clamp01(0.12 + purpose.vfr * 0.22 + (dest.beach ? 0.04 : 0));
    const rest = Math.max(0.1, 1 - u12 - a1217 - a1824 - a55p);
    const a2534 = rest * 0.40, a3544 = rest * 0.34, a4554 = rest * 0.26;
    const age = { u12, a1217, a1824, a2534, a3544, a4554, a55p };
    const age2554 = a2534 + a3544 + a4554;

    // --- cabin ---------------------------------------------------------
    const premiumRatio = ac.seats ? ac.premiumSeats / ac.seats : 0;
    const bus = clamp01(premiumRatio * 0.55 * (1 + airline.premium));
    const pe = clamp01(premiumRatio * 0.45 * (1 + airline.premium));
    const cabin = { business: bus, premiumEconomy: pe, economy: clamp01(1 - bus - pe) };

    // --- nationality / language ---------------------------------------
    const homeShare = round2(between(r, 0.42, 0.78));
    const nats = [['Aurelian', homeShare], [demonym(dest.country), round2((1 - homeShare) * between(r, 0.5, 0.8))]];
    nats.push([pick(r, ['British', 'German', 'Indian', 'Filipino', 'Emirati', 'Italian']), round2(1 - nats[0][1] - nats[1][1])]);
    const langs = [['Aurelian', round2(homeShare * 0.95)], ['English', round2(between(r, 0.4, 0.8))],
                   [langFor(dest), round2(between(r, 0.08, 0.34))]];

    return {
      international: dest.intl ? 1 : 0, domestic: dest.intl ? 0 : 1,
      purpose, party, age, age2554,
      gender: { f: round2(0.46 + (party.family * 0.1) + between(r, -0.03, 0.03)), m: 0 },
      cabin, premiumCabin: round2(bus + pe),
      frequentFlyer: round2(clamp01(0.10 + purpose.business * 0.40 + airline.premium * 0.3)),
      nationalities: nats, languages: langs,
      region: { [dest.region]: 1 }
    };
  }
  const demonym = c => ({
    UAE: 'Emirati', Qatar: 'Qatari', 'Saudi Arabia': 'Saudi', Kuwait: 'Kuwaiti', Oman: 'Omani',
    Bahrain: 'Bahraini', UK: 'British', France: 'French', Germany: 'German', Netherlands: 'Dutch',
    Spain: 'Spanish', Italy: 'Italian', Switzerland: 'Swiss', Austria: 'Austrian', Portugal: 'Portuguese',
    Ireland: 'Irish', Denmark: 'Danish', Turkiye: 'Turkish', Greece: 'Greek', Singapore: 'Singaporean',
    Malaysia: 'Malaysian', Thailand: 'Thai', 'Hong Kong': 'Hong Konger', India: 'Indian',
    'Sri Lanka': 'Sri Lankan', 'South Korea': 'Korean', Japan: 'Japanese', Maldives: 'Maldivian',
    Indonesia: 'Indonesian', Egypt: 'Egyptian', Morocco: 'Moroccan', Kenya: 'Kenyan',
    'South Africa': 'South African', USA: 'American', Canada: 'Canadian', Brazil: 'Brazilian',
    Aurelia: 'Aurelian'
  })[c] || 'Aurelian';
  const langFor = d => ({
    UAE: 'Arabic', Qatar: 'Arabic', 'Saudi Arabia': 'Arabic', Kuwait: 'Arabic', Oman: 'Arabic',
    Bahrain: 'Arabic', Egypt: 'Arabic', Morocco: 'Arabic', France: 'French', Germany: 'German',
    Spain: 'Spanish', Italy: 'Italian', Portugal: 'Portuguese', Turkiye: 'Turkish', Greece: 'Greek',
    India: 'Hindi', Japan: 'Japanese', 'South Korea': 'Korean', Brazil: 'Portuguese'
  })[d.country] || 'English';

  // Weighted airline picker
  const alPool = [];
  AIRLINES.forEach(a => { for (let i = 0; i < Math.round(a.share * 100); i++) alPool.push(a); });

  // --- generate departures through the day ------------------------------
  const hours: Array<[number, number]> = [];
  for (let h = 4; h <= 23; h++) {
    // demand curve: morning and evening banks
    const base = [0, 0, 0, 0, 8, 29, 37, 35, 29, 24, 26, 28, 30, 33, 35, 33, 31, 33, 35, 31, 25, 18, 11, 6][h] || 4;
    hours.push([h, base]);
  }

  hours.forEach(([h, count]) => {
    for (let i = 0; i < count; i++) {
      const airline = pick(r, alPool);
      const intl = r() < (airline.type === 'regional' ? 0.25 : 0.62);
      const dest = pick(r, DESTINATIONS.filter(d => d.intl === intl));
      let ac;
      if (dest.km > 4500) ac = pick(r, AIRCRAFT.filter(a => a.body === 'wide'));
      else if (dest.km < 700 && airline.type === 'regional') ac = pick(r, AIRCRAFT.filter(a => a.body === 'regional'));
      else ac = pick(r, AIRCRAFT.filter(a => a.body === 'narrow'));

      const minute = inti(r, 0, 59);
      const std = DAY_START + ((h - 4) * 60 + minute - 30) * MIN;
      if (std < DAY_START || std > DAY_END) continue;

      const loadFactor = clamp01(between(r, 0.62, 0.96));
      const pax = Math.round(ac.seats * loadFactor);
      const delayRoll = r();
      const delayMin = delayRoll > 0.82 ? inti(r, 10, 95) : (delayRoll > 0.68 ? inti(r, 4, 12) : 0);
      const gate = intl ? pick(r, intlGates) : pick(r, domGates);

      const flightNo = airline.code + String(seq++ % 900 + 100);
      flights.push(makeLeg({
        r, airline, dest, ac, std, delayMin, pax, gate, flightNo, loadFactor,
        profile: makeProfile(dest, airline, ac, std, pax)
      }));
    }
  });

  // --- matching arrivals (for FIDS, belts, arrivals-hall presence) -------
  // A leg number must be unique across the day: the inbound takes the next
  // free number for its carrier, the way a real pairing does.
  const usedIds = new Set(flights.map(f => f.id));
  const depCount = flights.length;
  for (let i = 0; i < depCount; i++) {
    const d = flights[i];
    if (r() > 0.92) continue;
    const sta = d.stdTs - inti(r, 70, 320) * MIN;
    if (sta < DAY_START) continue;
    const delayMin = r() > 0.84 ? inti(r, 5, 70) : 0;
    let num = Number(d.number) + 1;
    while (usedIds.has(d.airlineCode + String(num))) num += 2;
    usedIds.add(d.airlineCode + String(num));
    flights.push({
      id: d.airlineCode + String(num),
      number: String(num), airlineCode: d.airlineCode,
      direction: 'A', origin: d.destination, destination: THEME.airport.iata,
      terminal: d.terminal, gate: d.gate, stand: d.stand,
      belt: String(inti(r, 1, 8)), checkin: null,
      stdTs: sta, etdTs: sta + delayMin * MIN, atdTs: null,
      delayMin, delayCode: delayMin ? pick(r, DELAY_CODES).code : null,
      status: 'scheduled', pax: Math.round(d.pax * between(r, 0.8, 1.05)),
      acType: d.acType, acReg: d.acReg, loadFactor: d.loadFactor,
      profile: d.profile, scripted: false,
      // an arrival never boards; the canonical model still carries the fields
      schedBoardingTs: sta, boardingTs: sta, gateCloseTs: sta,
      tobt: null, tsat: null, aibt: null, aobt: null
    });
  }

  // --- pin the scripted demo flights ------------------------------------
  // Clear the whole gate-42 screen catchment (gates 40-46) around the scene
  // first, so the worked example reproduces exactly whatever the generator
  // happened to roll onto those stands.
  for (let i = flights.length - 1; i >= 0; i--) {
    const f = flights[i];
    if (f.direction !== 'D') continue;
    const g = Number(f.gate);
    if (g >= 40 && g <= 46 && Math.abs(f.stdTs - SCENE_TIME) < 200 * MIN) flights.splice(i, 1);
  }
  Object.entries(SCRIPTED_FLIGHTS).forEach(([key, s]) => {
    const airline = AIRLINES.find(a => a.code === s.airline);
    const dest = DESTINATIONS.find(d => d.iata === s.dest);
    const ac = AIRCRAFT.find(a => a.type === s.acType);
    const std = new Date(DAY + 'T' + s.std + ':00Z').getTime();
    flights.push(makeLeg({
      r, airline, dest, ac, std, delayMin: s.delayMin, pax: s.pax,
      gate: { id: s.gate, stand: s.stand, terminal: s.terminal, zone: 'T2-PC', intl: dest.intl },
      flightNo: key, loadFactor: round2(s.pax / ac.seats), profile: s.profile,
      delayCode: s.delayCode, checkin: s.checkin, scripted: true
    }));
  });

  flights.sort((a, b) => a.stdTs - b.stdTs);
  return flights;
}

export function makeLeg(o) {
  const { r, airline, dest, ac, std, delayMin, pax, gate, flightNo, loadFactor, profile } = o;
  const etd = std + delayMin * MIN;
  return {
    id: flightNo, number: flightNo.replace(/^[A-Z]{2}/, ''), airlineCode: airline.code,
    direction: 'D', origin: THEME.airport.iata, destination: dest.iata,
    terminal: gate.terminal, gate: gate.id, stand: gate.stand, zone: gate.zone,
    belt: null, checkin: o.checkin || (inti(r, 1, 40) + '-' + inti(r, 41, 60)),
    stdTs: std, etdTs: etd, atdTs: null,
    delayMin, delayCode: o.delayCode || (delayMin ? pick(r, DELAY_CODES).code : null),
    status: delayMin >= 15 ? 'delayed' : 'scheduled',
    pax, acType: ac.type, acReg: 'QX-' + String.fromCharCode(65 + inti(r, 0, 25)) + String.fromCharCode(65 + inti(r, 0, 25)) + String.fromCharCode(65 + inti(r, 0, 25)),
    loadFactor, profile, scripted: !!o.scripted,
    // A-CDM milestones
    tobt: etd - 20 * MIN, tsat: etd - 15 * MIN, aibt: null, aobt: null,
    boardingTs: etd - 25 * MIN, schedBoardingTs: std - 25 * MIN, gateCloseTs: etd - 10 * MIN
  };
}

/* =========================================================================
   Campaigns, creatives, promo codes
   ========================================================================= */
export function buildCampaigns(r: () => number, outlets: Outlet[]): Campaign[] {
  const byName = n => outlets.find(o => o.name === n);
  const C = [];
  const push = c => C.push(Object.assign({
    status: 'live', approval: 'approved', brandSafety: 'passed',
    dailyCap: null, frequencyCap: ENGINE.frequencyCapPerHour, screens: null,
    triggers: [], hard: {}, cvrIndex: 1.0, pinned: false,
    spend: 0, impressions: 0, scans: 0, redemptions: 0, plays: 0
  }, c));

  /* ---- the three worked-example candidates, weights calibrated so the
     Gate 42 @ 14:10 scene reproduces the brief's table exactly ---------- */
  push({
    id: 'CMP-201', name: '15% off signature fragrances', advertiser: 'Lumière Parfums',
    outletId: byName('Lumière Parfums').id, category: 'perfume',
    weights: { international: 0.50, holiday: 0.70, age2554: 0.53 },
    hard: { internationalOnly: true, minCrowd: 100, minDwell: 15, zones: ['T2-DF', 'T2-PC'] },
    triggers: [{ type: 'delay', overMin: 30, boost: 1.5, label: 'Flight delayed > 30 min' }],
    budget: 18000, dailyCap: 12000, spent: 7420, cpm: 9.4, cvrIndex: 1.30,
    creative: 'CRE-201', promo: 'PRM-201', priority: 1,
    schedule: { from: '06:00', to: '23:00' }
  });
  push({
    id: 'CMP-202', name: 'Buy 2 get 1 free — soft toys', advertiser: 'Pocketship Toys',
    outletId: byName('Pocketship Toys').id, category: 'toys',
    weights: { family: 1.00, u12: 1.00, holiday: 0.32 },
    hard: { minCrowd: 60, zones: ['T2-DF', 'T2-PC', 'T1-PLZ'] },
    triggers: [], budget: 9000, dailyCap: 6000, spent: 3180, cpm: 7.2, cvrIndex: 1.30,
    creative: 'CRE-202', promo: 'PRM-202', priority: 1,
    schedule: { from: '07:00', to: '21:00' }
  });
  push({
    id: 'CMP-203', name: 'Lounge day pass — €39', advertiser: 'Skyhaven Lounge',
    outletId: byName('Skyhaven Lounge').id, category: 'lounge',
    weights: { business: 0.60, premiumCabin: 0.40 },
    hard: { minCrowd: 50, zones: ['T2-LNG', 'T2-PD'] },  // not placed on Pier C → filtered at gate 42
    // (the lounge also names the screens it will accept; see buildWorld)
    triggers: [], budget: 12000, dailyCap: null, spent: 5640, cpm: 11.8, cvrIndex: 1.30,
    creative: 'CRE-203', promo: 'PRM-203', priority: 1,
    schedule: { from: '05:00', to: '23:30' }
  });

  /* ---- the rest of the book ------------------------------------------ */
  const book = [
    ['Gulf-bound gift sets, 20% off', 'Meridian Duty Free', 'dutyfree', { international: .6, gulf: .9, holiday: .4 }, { internationalOnly: true, region: 'Gulf', minCrowd: 80 }, [{ type: 'delay', overMin: 45, boost: 1.35, label: 'Delay > 45 min' }]],
    ['Morning flat white, €2.50', 'Brew & Bloom Coffee', 'coffee', { business: .8, solo: .5, frequentFlyer: .4 }, { minCrowd: 40, hours: [5, 10] }, []],
    ['Family lunch bundle', 'The Gilded Fig', 'restaurant', { family: .9, u12: .7, holiday: .4 }, { minCrowd: 70 }, []],
    ['Travel-size skincare set', 'Meridian Pharmacy', 'pharmacy', { couple: .4, age2554: .6, international: .5 }, { minDwell: 20 }, []],
    ['Noise-cancelling headphones', 'Volt & Current', 'tech', { business: .7, premiumCabin: .6, a1824: .3 }, { minCrowd: 60 }, []],
    ['Beach reads 3 for 2', 'Paperbark Books', 'books', { holiday: .9, couple: .5, a55p: .4 }, { minDwell: 25 }, []],
    ['Last-minute souvenirs', 'Harbour Souvenirs', 'souvenir', { international: .7, group: .5, holiday: .5 }, { minCrowd: 50 }, []],
    ['Zero-commission currency', 'Aurelia Exchange', 'fx', { international: .9, business: .4 }, { internationalOnly: true }, []],
    ['Kids meal free with any main', 'Harbourline Grill', 'restaurant', { family: 1, u12: .8 }, { minCrowd: 50 }, []],
    ['Cashmere scarves, 25% off', 'Vermilion Atelier', 'fashion', { premiumCabin: .8, age2554: .5, couple: .4 }, { minDwell: 25 }, []],
    ['Express manicure, 20 min', 'Driftwood Spa Express', 'lounge', { solo: .5, business: .5, premiumCabin: .5 }, { minDwell: 30 }, []],
    ['Cold-press juice 2 for 1', 'Tidewater Juice Bar', 'coffee', { holiday: .6, a1824: .5, family: .4 }, { minCrowd: 40 }, []],
    ['Artisan chocolate towers', 'Marchetti Confetti', 'dutyfree', { international: .6, vfr: .6, holiday: .5 }, { internationalOnly: true }, []],
    ['Hand luggage, cabin-safe', 'Ridgeway Luggage', 'fashion', { business: .6, frequentFlyer: .7 }, { minCrowd: 45 }, []],
    ['Breakfast pastry + coffee', 'Saltmarsh Bakery', 'coffee', { business: .6, solo: .6 }, { hours: [5, 11] }, []],
    ['Regional cheese boards', 'Birchwood Delicatessen', 'coffee', { europe: .6, couple: .5, a55p: .4 }, { minDwell: 20 }, []],
    ['Glass of local white, €6', 'Alcove Wine Bar', 'restaurant', { couple: .7, holiday: .5, a55p: .5 }, { hours: [15, 23] }, []],
    ['Travel games for the flight', 'Little Lantern Kids', 'toys', { family: 1, u12: .9 }, { minCrowd: 40 }, []],
    ['Power bank bundle', 'Orbit Travel Tech', 'tech', { a1824: .6, student: .6, solo: .4 }, { minCrowd: 35 }, []],
    ['Quiet workspace, 2 hours', 'The Quiet Car Lounge', 'lounge', { business: .9, frequentFlyer: .6 }, { minDwell: 40 }, []],
    ['Street-food night menu', 'Noon & Nine', 'restaurant', { holiday: .6, group: .5, a1824: .4 }, { hours: [16, 23] }, []],
    ['Pick & mix sweets, 1kg', 'Pennyroyal Sweets', 'dutyfree', { family: .8, u12: .6, holiday: .4 }, { minCrowd: 40 }, []]
  ];
  book.forEach(([name, advertiser, category, weights, hard, triggers], i) => {
    const o = byName(advertiser);
    push({
      id: 'CMP-' + String(204 + i), name, advertiser, outletId: o ? o.id : null, category,
      weights, hard: Object.assign({ zones: o ? [o.zone] : [] }, hard), triggers,
      budget: inti(r, 4, 26) * 1000,
      dailyCap: r() > 0.5 ? inti(r, 3, 12) * 250 : null,
      spent: 0, cpm: round2(between(r, 5.5, 13.5)),
      cvrIndex: round2(between(r, 0.72, 1.46)),
      creative: 'CRE-' + String(204 + i), promo: r() > 0.45 ? 'PRM-' + String(204 + i) : null,
      priority: 1, schedule: { from: '05:00', to: '23:30' },
      approval: i >= 19 ? 'pending' : 'approved',
      status: i >= 19 ? 'pending' : 'live'
    });
  });
  C.forEach(c => {
    c.spent = c.spent || Math.round(c.budget * between(r, 0.12, 0.62));
    // a cap below what a campaign has already spent would filter it on day one
    if (c.dailyCap && c.dailyCap <= c.spent) c.dailyCap = Math.round(c.spent * 1.6);
  });
  return C;
}

export function buildCreatives(r: () => number, campaigns: Campaign[]): Creative[] {
  const TEMPLATES = ['bold-offer', 'lifestyle-split', 'countdown-deal', 'minimal-type', 'gate-native'];
  return campaigns.map((c, i) => ({
    id: c.creative, campaignId: c.id, advertiser: c.advertiser, category: c.category,
    template: TEMPLATES[i % TEMPLATES.length],
    headline: { en: c.name, ar: arHeadline(c) },
    sub: { en: c.advertiser, ar: c.advertiser },
    cta: { en: 'Scan to claim', ar: 'امسح للحصول' },
    ratio: i % 3 === 0 ? '9:16' : '16:9',
    approval: c.approval, generatedBy: 'studio',
    updated: DAY, checks: { brandSafety: true, legibility: true, duration: true, languages: true }
  }));
}
export function arHeadline(c) {
  const map = {
    'perfume': 'خصم 15٪ على العطور',
    'toys': 'اشتر 2 واحصل على 1 مجاناً',
    'lounge': 'بطاقة صالة ليوم واحد',
    'coffee': 'قهوة الصباح',
    'dutyfree': 'عروض السوق الحرة',
    'restaurant': 'عرض الغداء العائلي',
    'fashion': 'تخفيضات الأزياء',
    'tech': 'عرض الإلكترونيات',
    'books': 'كتب السفر',
    'pharmacy': 'مستحضرات العناية',
    'souvenir': 'هدايا تذكارية', 'fx': 'صرافة بدون عمولة'
  };
  return map[c.category] || c.name;
}

export function buildPromos(r: () => number, campaigns: Campaign[]): PromoCode[] {
  const P = [];
  campaigns.forEach(c => {
    if (!c.promo) return;
    P.push({
      id: c.promo, campaignId: c.id, advertiser: c.advertiser, outletId: c.outletId,
      code: codeFor(c.id), offer: c.name,
      validUntil: 'boarding',          // expires when the linked flight closes
      maxRedemptions: inti(r, 200, 900), redemptions: 0,
      shareEnabled: true, stockPaused: false,
      terms: 'One per traveller. Valid airside at ' + c.advertiser + ' until the linked flight closes boarding.'
    });
  });
  return P;
}
export function codeFor(id) {
  const n = id.replace(/\D/g, '');
  const letters = 'AURELIA';
  return letters.slice(0, 3).toUpperCase() + n + '-' + (Number(n) * 7 % 97 + 10);
}

/* ---- 30 days of campaign history ------------------------------------- */
export function buildHistory(r, campaigns) {
  const rows = [];
  for (let d = 30; d >= 1; d--) {
    const date = new Date(DAY_START - d * 86400000);
    const dow = date.getUTCDay();
    const weekendBoost = (dow === 0 || dow === 6) ? 1.18 : 1;
    campaigns.forEach(c => {
      if (r() > 0.78) return;        // not every campaign ran every day
      const impressions = Math.round(between(r, 900, 5200) * weekendBoost);
      const scans = Math.round(impressions * between(r, 0.0016, 0.0062) * c.cvrIndex);
      const redemptions = Math.round(scans * between(r, 0.42, 0.78));
      const spend = round2(impressions / 1000 * c.cpm);
      rows.push({
        date: date.toISOString().slice(0, 10), campaignId: c.id, advertiser: c.advertiser,
        impressions, scans, redemptions, spend,
        revenue: round2(redemptions * between(r, 11, 46)),
        plays: Math.round(impressions / between(r, 14, 30))
      });
    });
  }
  return rows;
}

/* =========================================================================
   Assemble
   ========================================================================= */
export function buildWorld(): World {
  const r = rngFrom(SEED);
  const gates = buildGates();
  ZONES.forEach(z => { z.gates = gates.filter(g => g.zone === z.id).map(g => g.id); });
  const screens = buildScreens(r, gates);
  const outlets = buildOutlets(r);
  const flights = buildFlights(r, gates);
  const campaigns = buildCampaigns(r, outlets);
  const creatives = buildCreatives(r, campaigns);
  const promos = buildPromos(r, campaigns);
  const history = buildHistory(r, campaigns);

  // The lounge buys named screens, not a whole zone: placement is per screen
  // as well as per zone, and the decision log says which rule dropped it.
  const lounge = campaigns.find(c => c.id === 'CMP-203');
  if (lounge) {
    lounge.hard.screens = screens
      .filter(s => s.zone === 'T2-LNG' || (s.zone === 'T2-PD' && s.kind === 'Gate totem'))
      .map(s => s.id);
  }

  // floor price per screen from predicted footfall rank
  screens.forEach(s => {
    const z = ZONES.find(x => x.id === s.zone);
    const base = z.kind === 'airside' ? 14 : z.kind === 'pier' ? 11 : 7;
    s.floorPrice = round2(base * (s.kind === 'Hall videowall' ? 1.8 : s.kind === 'Videowall array' ? 1.6 : 1));
  });

  const vendors = [
    { id: 'VND-01', name: 'Lumen Displays', type: 'Screen hardware', contact: 'ops@lumen.example', sla: '4h on-site', screens: 0 },
    { id: 'VND-02', name: 'NordVision AV', type: 'Screen hardware', contact: 'support@nordvision.example', sla: '8h on-site', screens: 0 },
    { id: 'VND-03', name: 'Halcyon Signage', type: 'Screen hardware', contact: 'noc@halcyon.example', sla: 'next business day', screens: 0 },
    { id: 'VND-04', name: 'Castellan AODB', type: 'Flight data', contact: 'integrations@castellan.example', sla: '99.9% feed', screens: 0 },
    { id: 'VND-05', name: 'Queuepoint Sensors', type: 'Passenger sensing', contact: 'hello@queuepoint.example', sla: '99.5% uptime', screens: 0 }
  ];
  vendors.forEach(v => { v.screens = screens.filter(s => s.vendor === v.name).length; });

  return { gates, zones: ZONES, screens, outlets, flights, campaigns, creatives, promos, history, vendors };
}

