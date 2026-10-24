/* Source adapters. Going live means writing one new class here and flipping
   one config value; the app core never changes. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Flight, FlightEvent, QueueMeasurement, World, FlightSource, ZoneSource, AodbSource } from './types.js';
import { THEME, AIRLINES, AIRCRAFT } from './reference.js';
import { DAY, iso, round2 } from './util.js';

/* =========================================================================
   43-adapters.js · source adapters
   The app core only ever sees the canonical model below. Each external
   standard gets an adapter that translates its wire format into it.
   Going live = writing one new adapter class and flipping one config value.

     FLIGHT_SOURCE = mock-aidx | vendor-api
     ZONE_SOURCE   = mock-acris | acris-live
     AODB_SOURCE   = mock-file | vendor-rest

   Canonical entities produced here:
     Flight, GateAssignment, AircraftType   (from AODB)
     FlightEvent                            (from IATA AIDX)
     Terminal, Zone, Checkpoint, QueueMeasurement (from ACI ACRIS)
   ========================================================================= */

/** One value per source. Reads the environment on the server and falls back
 *  to the mocks everywhere else, so the browser bundle needs no shims. */
const env = (k: string, fallback: string): string => {
  try {
    const g = globalThis as any;
    return (g.process?.env?.[k] as string) || fallback;
  } catch { return fallback; }
};

export const ADAPTER_CONFIG = {
  FLIGHT_SOURCE: env('FLIGHT_SOURCE', 'mock-aidx'),  // | vendor-api
  ZONE_SOURCE: env('ZONE_SOURCE', 'mock-acris'),     // | acris-live
  AODB_SOURCE: env('AODB_SOURCE', 'mock-file')       // | vendor-rest
};

/* -------------------------------------------------------------------------
   1. AODB flight movements — 33 columns, one row per flight leg
   Column order follows the sample AODB export shipped with the challenge.
   ------------------------------------------------------------------------- */
export const AODB_COLUMNS = [
  'FLIGHT_KEY', 'AIRLINE_IATA', 'AIRLINE_ICAO', 'FLIGHT_NUMBER', 'SUFFIX',
  'MOVEMENT_TYPE', 'SERVICE_TYPE', 'SCHEDULED_DATE', 'STD_UTC', 'ETD_UTC', 'ATD_UTC',
  'STA_UTC', 'ETA_UTC', 'ATA_UTC', 'TOBT', 'TSAT', 'AIBT', 'AOBT',
  'ORIGIN_IATA', 'DESTINATION_IATA', 'VIA_IATA', 'TERMINAL', 'GATE', 'STAND',
  'CHECKIN_DESKS', 'BAGGAGE_BELT', 'AIRCRAFT_TYPE_IATA', 'AIRCRAFT_REG',
  'SEAT_CAPACITY', 'PAX_TOTAL', 'LOAD_FACTOR', 'FLIGHT_STATUS', 'DELAY_CODE_1'
];

export function aodbRow(f: Flight): Record<string, string | number> {
  const al = AIRLINES.find(a => a.code === f.airlineCode) || { name: '' };
  const ac = AIRCRAFT.find(a => a.type === f.acType) || { seats: f.pax };
  const dep = f.direction === 'D';
  return {
    FLIGHT_KEY: f.id + '/' + DAY,
    AIRLINE_IATA: f.airlineCode,
    AIRLINE_ICAO: (al.name || 'XXX').slice(0, 3).toUpperCase(),
    FLIGHT_NUMBER: f.number, SUFFIX: '',
    MOVEMENT_TYPE: dep ? 'D' : 'A', SERVICE_TYPE: 'J',
    SCHEDULED_DATE: DAY,
    STD_UTC: dep ? iso(f.stdTs) : '', ETD_UTC: dep ? iso(f.etdTs) : '', ATD_UTC: f.atdTs ? iso(f.atdTs) : '',
    STA_UTC: dep ? '' : iso(f.stdTs), ETA_UTC: dep ? '' : iso(f.etdTs), ATA_UTC: '',
    TOBT: f.tobt ? iso(f.tobt) : '', TSAT: f.tsat ? iso(f.tsat) : '',
    AIBT: f.aibt ? iso(f.aibt) : '', AOBT: f.aobt ? iso(f.aobt) : '',
    ORIGIN_IATA: f.origin, DESTINATION_IATA: f.destination, VIA_IATA: '',
    TERMINAL: f.terminal, GATE: f.gate, STAND: f.stand,
    CHECKIN_DESKS: f.checkin || '', BAGGAGE_BELT: f.belt || '',
    AIRCRAFT_TYPE_IATA: f.acType, AIRCRAFT_REG: f.acReg,
    SEAT_CAPACITY: ac.seats, PAX_TOTAL: f.pax,
    LOAD_FACTOR: f.loadFactor.toFixed(2),
    FLIGHT_STATUS: f.status.toUpperCase(),
    DELAY_CODE_1: f.delayCode || ''
  };
}
export function aodbCsv(flights: Flight[], limit?: number): string {
  const rows = flights.slice(0, limit || flights.length).map(f => {
    const r = aodbRow(f);
    return AODB_COLUMNS.map(c => String(r[c]).includes(',') ? '"' + r[c] + '"' : r[c]).join(',');
  });
  return AODB_COLUMNS.join(',') + '\n' + rows.join('\n');
}

/* Adapter: AODB file/REST snapshot → canonical Flight[] */
export class AodbFileAdapter implements AodbSource {
  world: World; name: string; format: string;
  constructor(world) { this.world = world; this.name = 'mock-file'; this.format = 'CSV / JSON · 33 columns'; }
  /* A live adapter does exactly this, from an HTTP response instead. */
  snapshot(): any[] { return this.world.flights.map(f => this.toCanonical(aodbRow(f) as any)); }
  toCanonical(row: any): any {
    return {
      id: row.AIRLINE_IATA + row.FLIGHT_NUMBER,
      airlineCode: row.AIRLINE_IATA,
      direction: row.MOVEMENT_TYPE,
      origin: row.ORIGIN_IATA, destination: row.DESTINATION_IATA,
      terminal: row.TERMINAL, gate: row.GATE, stand: row.STAND,
      stdTs: row.STD_UTC ? Date.parse(row.STD_UTC) : Date.parse(row.STA_UTC),
      etdTs: row.ETD_UTC ? Date.parse(row.ETD_UTC) : Date.parse(row.ETA_UTC),
      pax: Number(row.PAX_TOTAL), acType: row.AIRCRAFT_TYPE_IATA,
      status: row.FLIGHT_STATUS.toLowerCase(), delayCode: row.DELAY_CODE_1 || null,
      source: 'AODB', receivedAt: Date.now()
    };
  }
}
export class AodbVendorRestAdapter implements AodbSource {
  cfg: any; name: string; format: string;        /* stub — the one class a go-live writes */
  constructor(cfg) { this.cfg = cfg; this.name = 'vendor-rest'; this.format = 'Vendor REST (not configured)'; }
  async snapshot(): Promise<Flight[]> { throw new Error('AODB_SOURCE=vendor-rest requires AODB_BASE_URL and AODB_API_KEY'); }
}

/* -------------------------------------------------------------------------
   2. IATA AIDX — IATA_AIDX_FlightLegNotifRQ messages on a push feed
   ------------------------------------------------------------------------- */
export function aidxMessage(f: Flight, kind: string, detail?: any): string {
  const now = detail && detail.at ? detail.at : Date.now();
  const al = AIRLINES.find(a => a.code === f.airlineCode) || { name: '' };
  const changes = [];
  if (kind === 'delay') {
    changes.push('        <OperationTime OperationQualifier="TDN" CodeContext="5" ' +
      'RepeatIndex="1">' + iso(f.etdTs) + '</OperationTime>');
    changes.push('        <FlightLegStatus>DL</FlightLegStatus>');
    changes.push('        <DelayReason DelayCode="' + (f.delayCode || '93') + '" DelayDuration="PT' + f.delayMin + 'M"/>');
  } else if (kind === 'gate') {
    changes.push('        <AirportResources Usage="Departure">\n' +
      '          <Resource DepartureGate="' + f.gate + '" PreviousGate="' + (detail.from || '') + '"/>\n' +
      '        </AirportResources>');
  } else if (kind === 'boarding') {
    changes.push('        <FlightLegStatus>BD</FlightLegStatus>');
    changes.push('        <OperationTime OperationQualifier="BST" CodeContext="5">' + iso(now) + '</OperationTime>');
  } else if (kind === 'final') {
    changes.push('        <FlightLegStatus>FC</FlightLegStatus>');
  } else if (kind === 'departed') {
    changes.push('        <FlightLegStatus>DP</FlightLegStatus>');
    changes.push('        <OperationTime OperationQualifier="AOBT" CodeContext="5">' + iso(now) + '</OperationTime>');
  } else {
    changes.push('        <FlightLegStatus>SH</FlightLegStatus>');
  }
  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<IATA_AIDX_FlightLegNotifRQ xmlns="http://www.iata.org/IATA/2007/00" Version="16.1"\n' +
    '    TimeStamp="' + iso(now) + '" CorrelationID="' + f.id + '-' + now + '">\n' +
    '  <Originator CompanyShortName="' + THEME.airport.iata + ' AODB"/>\n' +
    '  <FlightLeg>\n' +
    '    <LegIdentifier>\n' +
    '      <Airline CodeContext="3">' + f.airlineCode + '</Airline>\n' +
    '      <FlightNumber>' + f.number + '</FlightNumber>\n' +
    '      <DepartureAirport CodeContext="3">' + f.origin + '</DepartureAirport>\n' +
    '      <ArrivalAirport CodeContext="3">' + f.destination + '</ArrivalAirport>\n' +
    '      <OriginDate>' + DAY + '</OriginDate>\n' +
    '    </LegIdentifier>\n' +
    '    <LegData>\n' +
    '      <AirportResources Usage="Departure">\n' +
    '        <Resource DepartureTerminal="' + f.terminal + '" DepartureGate="' + f.gate + '" AircraftParkingPosition="' + f.stand + '"/>\n' +
    '      </AirportResources>\n' +
    '      <PaxCount Qualifier="TTL" Count="' + f.pax + '"/>\n' +
    '      <AircraftInfo>\n' +
    '        <AircraftType>' + f.acType + '</AircraftType>\n' +
    '        <Registration>' + f.acReg + '</Registration>\n' +
    '      </AircraftInfo>\n' +
    changes.join('\n') + '\n' +
    '    </LegData>\n' +
    '  </FlightLeg>\n' +
    '</IATA_AIDX_FlightLegNotifRQ>';
}

/* The canonical FlightEvent every consumer sees. */
export function toFlightEvent(f: Flight, kind: any, xml: string, at: number): FlightEvent {
  return {
    id: f.id + '-' + kind + '-' + at,
    flightId: f.id, kind, at,
    gate: f.gate, terminal: f.terminal, zone: f.zone,
    etdTs: f.etdTs, delayMin: f.delayMin, status: f.status, pax: f.pax,
    source: 'AIDX', raw: xml, receivedAt: at
  };
}

/* Adapter contract: FlightSource.stream(): AsyncIterable<FlightEvent> ----- */
export class MockAidxFlightSource implements FlightSource {
  world: World; name: string; format: string;
  queue: FlightEvent[]; listeners: Array<(e: FlightEvent) => void>;
  msgCount: number; lastAt: number | null;
  constructor(world) {
    this.world = world; this.name = 'mock-aidx';
    this.format = 'IATA_AIDX_FlightLegNotifRQ v16.1 (simulated push)';
    this.queue = []; this.listeners = []; this.msgCount = 0; this.lastAt = null;
  }
  /* push an event onto the feed — called by the simulator and by injections */
  emit(flight: Flight, kind: any, at: number, detail?: any): FlightEvent {
    const xml = aidxMessage(flight, kind, Object.assign({ at }, detail));
    const ev = toFlightEvent(flight, kind, xml, at);
    this.msgCount++; this.lastAt = at;
    this.queue.push(ev); if (this.queue.length > 400) this.queue.shift();
    this.listeners.forEach(fn => fn(ev));
    return ev;
  }
  on(fn: (e: FlightEvent) => void): () => void { this.listeners.push(fn); return () => { this.listeners = this.listeners.filter(x => x !== fn); }; }
  recent(n?: number): any[] { return this.queue.slice(-(n || 30)).reverse(); }
  /* the shape a live consumer iterates */
  async *stream() {
    let i = 0;
    while (true) {
      if (i < this.queue.length) { yield this.queue[i++]; }
      else { await new Promise(res => setTimeout(res, 50)); }
    }
  }
}
export class VendorApiFlightSource implements FlightSource {
  cfg: any; name: string; format: string;        /* stub — swap in for a real AIDX bus */
  constructor(cfg) { this.cfg = cfg; this.name = 'vendor-api'; this.format = 'Vendor AIDX bus (not configured)'; }
  async *stream() { throw new Error('FLIGHT_SOURCE=vendor-api requires AIDX_ENDPOINT and AIDX_CLIENT_CERT'); }
}

/* -------------------------------------------------------------------------
   3. ACI ACRIS / FIWARE Smart Data Models — NGSI-LD entities
   ------------------------------------------------------------------------- */
export const ACRIS_CONTEXT = [
  'https://raw.githubusercontent.com/smart-data-models/dataModel.Aeronautics/master/context.jsonld',
  'https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld'
];

export function acrisTerminal(code: string): any {
  return {
    id: 'urn:ngsi-ld:Terminal:' + THEME.airport.iata + ':' + code,
    type: 'Terminal',
    name: { type: 'Property', value: THEME.airport.name + ' ' + code },
    airportCode: { type: 'Property', value: THEME.airport.iata },
    '@context': ACRIS_CONTEXT
  };
}
export function acrisZone(z: any): any {
  return {
    id: 'urn:ngsi-ld:Zone:' + THEME.airport.iata + ':' + z.id,
    type: 'Zone',
    name: { type: 'Property', value: z.name },
    category: { type: 'Property', value: z.kind },
    refTerminal: { type: 'Relationship', object: 'urn:ngsi-ld:Terminal:' + THEME.airport.iata + ':' + z.terminal },
    servedGates: { type: 'Property', value: z.gates },
    '@context': ACRIS_CONTEXT
  };
}
export function acrisCheckpoint(z: any, idx: number): any {
  return {
    id: 'urn:ngsi-ld:Checkpoint:' + THEME.airport.iata + ':' + z.id + ':' + idx,
    type: 'Checkpoint',
    name: { type: 'Property', value: z.name + ' lane ' + idx },
    checkpointType: { type: 'Property', value: z.kind === 'control' ? 'securityScreening' : 'passengerFlow' },
    refZone: { type: 'Relationship', object: 'urn:ngsi-ld:Zone:' + THEME.airport.iata + ':' + z.id },
    '@context': ACRIS_CONTEXT
  };
}
export function acrisQueueMeasurement(z: any, value: number, waitSec: number, at: number): any {
  return {
    id: 'urn:ngsi-ld:QueueMeasurement:' + THEME.airport.iata + ':' + z.id + ':' + at,
    type: 'QueueMeasurement',
    refZone: { type: 'Relationship', object: 'urn:ngsi-ld:Zone:' + THEME.airport.iata + ':' + z.id },
    peopleCount: { type: 'Property', value: value, observedAt: iso(at) },
    averageWaitingTime: { type: 'Property', value: waitSec, unitCode: 'SEC', observedAt: iso(at) },
    occupancy: { type: 'Property', value: round2(Math.min(1, value / 900)), observedAt: iso(at) },
    '@context': ACRIS_CONTEXT
  };
}

export class MockAcrisZoneSource implements ZoneSource {
  world: World; name: string; format: string;
  msgCount: number; lastAt: number | null;
  latest: Record<string, QueueMeasurement>; queue: any[];
  constructor(world) {
    this.world = world; this.name = 'mock-acris';
    this.format = 'NGSI-LD entities (ACI ACRIS / FIWARE Smart Data Models)';
    this.msgCount = 0; this.lastAt = null; this.latest = {}; this.queue = [];
  }
  entities(): any[] {
    const out = [acrisTerminal('T1'), acrisTerminal('T2')];
    this.world.zones.forEach(z => { out.push(acrisZone(z)); out.push(acrisCheckpoint(z, 1)); });
    return out;
  }
  publish(zoneId: string, people: number, waitSec: number, at: number): any {
    const z = this.world.zones.find(x => x.id === zoneId);
    const m = acrisQueueMeasurement(z, people, waitSec, at);
    this.latest[zoneId] = { zoneId, people, waitSec, at, raw: m };
    this.msgCount++; this.lastAt = at;
    this.queue.push(m); if (this.queue.length > 200) this.queue.shift();
    return m;
  }
  /* canonical QueueMeasurement for the engine */
  read(zoneId: string): QueueMeasurement | null { return this.latest[zoneId] || null; }
  recent(n?: number): any[] { return this.queue.slice(-(n || 20)).reverse(); }
}
export class AcrisLiveZoneSource implements ZoneSource {
  cfg: any; name: string; format: string;          /* stub */
  constructor(cfg) { this.cfg = cfg; this.name = 'acris-live'; this.format = 'ACRIS broker (not configured)'; }
  read(): QueueMeasurement { throw new Error('ZONE_SOURCE=acris-live requires ACRIS_BROKER_URL'); }
}

/* -------------------------------------------------------------------------
   Adapter registry — one place the config picks an implementation
   ------------------------------------------------------------------------- */
export function buildAdapters(world: World): { flight: any; zone: any; aodb: any } {
  const flight = ADAPTER_CONFIG.FLIGHT_SOURCE === 'mock-aidx'
    ? new MockAidxFlightSource(world) : new VendorApiFlightSource(ADAPTER_CONFIG);
  const zone = ADAPTER_CONFIG.ZONE_SOURCE === 'mock-acris'
    ? new MockAcrisZoneSource(world) : new AcrisLiveZoneSource(ADAPTER_CONFIG);
  const aodb = ADAPTER_CONFIG.AODB_SOURCE === 'mock-file'
    ? new AodbFileAdapter(world) : new AodbVendorRestAdapter(ADAPTER_CONFIG);
  return { flight, zone, aodb };
}

