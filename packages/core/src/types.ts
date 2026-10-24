/* The canonical internal model. Adapters translate every external source
   into these shapes; nothing downstream knows which vendor produced them. */

export type Direction = 'D' | 'A';
export type FlightStatus =
  | 'scheduled' | 'delayed' | 'boarding' | 'final' | 'departed' | 'cancelled' | 'landed';
export type ZoneKind = 'landside' | 'control' | 'airside' | 'pier';
export type ScreenStatus = 'online' | 'degraded' | 'offline';
export type Approval = 'pending' | 'approved' | 'rejected';

/** Aggregated shares only. Never anything about an individual passenger. */
export interface CrowdProfile {
  international: number;
  domestic: number;
  purpose: { holiday: number; business: number; vfr: number; student: number; religious: number };
  party: { solo: number; couple: number; family: number; group: number };
  age: { u12: number; a1217: number; a1824: number; a2534: number; a3544: number; a4554: number; a55p: number };
  age2554: number;
  gender: { f: number; m: number };
  cabin: { economy: number; premiumEconomy: number; business: number };
  premiumCabin: number;
  frequentFlyer: number;
  region: Record<string, number>;
  nationalities: Record<string, number> | Array<[string, number]>;
  languages: Record<string, number> | Array<[string, number]>;
  topNationalities?: Array<[string, number]>;
  topLanguages?: Array<[string, number]>;
  topDestinations?: Array<[string, number]>;
}

export interface Flight {
  id: string;
  number: string;
  airlineCode: string;
  direction: Direction;
  origin: string;
  destination: string;
  terminal: string;
  gate: string;
  stand: string;
  zone?: string;
  belt: string | null;
  checkin: string | null;
  stdTs: number;
  etdTs: number;
  atdTs: number | null;
  /** boarding as scheduled — never moves when a flight is delayed */
  schedBoardingTs: number;
  boardingTs: number;
  gateCloseTs: number;
  delayMin: number;
  delayCode: string | null;
  status: FlightStatus;
  pax: number;
  acType: string;
  acReg: string;
  loadFactor: number;
  profile: CrowdProfile;
  /** A-CDM milestones */
  tobt: number | null;
  tsat: number | null;
  aibt: number | null;
  aobt: number | null;
  scripted?: boolean;
}

export interface GateAssignment { gateId: string; flightId: string; from: number; to: number }
export interface AircraftType { type: string; seats: number; body: string; premiumSeats: number }

export interface FlightEvent {
  id: string;
  flightId: string;
  kind: 'delay' | 'gate' | 'boarding' | 'final' | 'departed' | 'status';
  at: number;
  gate: string;
  terminal: string;
  etdTs: number;
  delayMin: number;
  status: FlightStatus;
  pax: number;
  zone?: string;
  source: 'AIDX';
  /** the message exactly as it arrived on the wire */
  raw: string;
  receivedAt: number;
}

export interface Terminal { id: string; name: string }
export interface Zone {
  id: string; terminal: string; name: string; kind: ZoneKind;
  x: number; y: number; w: number; h: number; gates: string[];
}
export interface Checkpoint { id: string; zoneId: string; name: string; type: string }
export interface QueueMeasurement {
  zoneId: string; people: number; waitSec: number; at: number; raw?: unknown;
}

export interface Gate { id: string; zone: string; terminal: string; intl: boolean; x: number; y: number; stand: string }

export interface Screen {
  id: string; zone: string; terminal: string; name: string;
  size: string; orientation: 'portrait' | 'landscape'; ratio: '9:16' | '16:9'; kind: string;
  nearGates: string[]; x: number; y: number;
  status: ScreenStatus; latencyMs: number; offlineSince: number | null;
  installed: string; vendor: string; floorPrice: number;
  lastPlay: number | null; playsToday: number; impressionsToday: number;
}

export interface Outlet {
  id: string; name: string; category: string; zone: string; terminal: string;
  nearGates: string[]; unit: string; sqm: number; opens: string; closes: string;
  contact: string; monthlyRent: number;
}

export interface HardFilters {
  zones?: string[]; screens?: string[];
  internationalOnly?: boolean; domesticOnly?: boolean; region?: string;
  minCrowd?: number; minDwell?: number; hours?: [number, number];
  stockPaused?: boolean;
}
export interface Trigger {
  type: 'delay' | 'gateChange' | 'boarding' | 'festival';
  overMin?: number; boost: number; label: string;
}
export interface Campaign {
  id: string; name: string; advertiser: string; outletId: string | null;
  airlineCode?: string; category: string;
  weights: Record<string, number>;
  hard: HardFilters;
  triggers: Trigger[];
  budget: number;
  /** Spend ceiling for one day. null means the total budget is the only limit. */
  dailyCap: number | null;
  spent: number; cpm: number;
  /** learned from measured scans and redemptions */
  cvrIndex: number;
  creative: string | null; promo: string | null; priority: number;
  schedule: { from: string; to: string };
  status: 'live' | 'paused' | 'pending' | 'draft';
  approval: Approval; brandSafety: 'passed' | 'failed';
  frequencyCap: number; pinned: boolean; pinReason?: string; pinnedScreens?: string[] | null;
  coBrand?: string;
}

export interface Creative {
  id: string; campaignId: string | null; advertiser: string; category: string;
  template: string;
  headline: Record<string, string>;
  sub: Record<string, string>;
  cta: Record<string, string>;
  ratio: string; approval: Approval; generatedBy: string; brief?: string;
  updated: string;
  checks: { brandSafety: boolean; legibility: boolean; duration: boolean; languages: boolean };
}

export interface PromoCode {
  id: string; campaignId: string; advertiser: string; outletId: string | null;
  code: string; offer: string; validUntil: string;
  maxRedemptions: number; redemptions: number;
  shareEnabled: boolean; stockPaused: boolean; terms: string;
}

export interface Impression { campaignId: string; screenId: string; at: number; count: number }
export interface Redemption {
  id: string; at: number; campaignId: string; screenId: string | null;
  advertiser: string; outletId: string | null; value: number;
  segment: string; code: string; via: string;
}

export interface Vendor { id: string; name: string; type: string; contact: string; sla: string; screens: number }

/* ---- derived signals -------------------------------------------------- */

export interface ZonePresence {
  zoneId: string; windowStart: number; windowMinutes: number;
  pax: number; paxNext30: number;
  international: number; dwellMedian: number; flights: number;
  profile: CrowdProfile | null;
  sources: Array<{ source: string; detail: string; at: number }>;
}

export interface ScoreTerm {
  segId: string; label: string; weight: number; share: number; reach: number; index: number | null;
}
export interface CampaignScore {
  campaignId: string; terms: ScoreTerm[];
  coverage: number; match: number; lift: number;
  boost: number; boostMultiplier: number; final: number;
  firedTriggers: Trigger[]; formula: string;
  adjusted?: number; excluded?: string; pinned?: boolean;
  rules?: Array<{ rule: string; effect: string; why: string }>;
}
export interface EvidenceItem {
  source: string; sourceKey: string; ref: string; at: number; detail: string;
}
export interface VerificationCheck { name: string; pass: boolean; detail: string }

export interface Decision {
  id?: string;
  screenId: string; screenName?: string; zone?: string; at: number;
  empty: boolean;
  crowdNow?: number; crowdNext30?: number; dwellMedian?: number; maxDelay?: number;
  profile?: CrowdProfile | null;
  parts?: Array<{ id: string; dest: string; gate: string; pax: number; delay: number; t: number; weight: number; present: number }>;
  winner: CampaignScore | null;
  winnerCampaign?: Campaign | null;
  rule?: string;
  candidates: CampaignScore[];
  filtered: Array<{ campaignId: string; name: string; advertiser: string; reasons: string[]; match?: number; final?: number }>;
  fallback: boolean;
  fallbackReason?: string | null;
  reason?: string;
  verification: { checks: VerificationCheck[]; ok: boolean };
  evidence: EvidenceItem[];
  confidence?: number;
  modelVersion?: string;
}

export interface World {
  gates: Gate[]; zones: Zone[]; screens: Screen[]; outlets: Outlet[];
  airlines?: Array<{ code: string; name: string; type: string; home: boolean; share: number; premium: number; colour: string }>;
  flights: Flight[]; campaigns: Campaign[]; creatives: Creative[];
  promos: PromoCode[]; vendors: Vendor[];
  history: Array<{
    date: string; campaignId: string; advertiser: string;
    impressions: number; scans: number; redemptions: number;
    spend: number; revenue: number; plays: number;
  }>;
}

/* ---- adapter contracts ------------------------------------------------ */

export interface FlightSource {
  readonly name: string;
  readonly format: string;
  stream(): AsyncIterable<FlightEvent>;
}
export interface ZoneSource {
  readonly name: string;
  readonly format: string;
  read(zoneId: string): QueueMeasurement | null;
}
export interface AodbSource {
  readonly name: string;
  readonly format: string;
  snapshot(): Flight[] | Promise<Flight[]>;
}
