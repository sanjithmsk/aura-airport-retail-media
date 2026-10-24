/**
 * AURA platform schema — Drizzle, SQLite.
 *
 * Everything the platform owns lives here. Flight, Zone and QueueMeasurement
 * rows are canonical projections of external feeds, written by the adapter
 * layer; nothing in this file is vendor-specific.
 *
 * SQLite has no JSON column type, so structured values (crowd profiles,
 * targeting weights, evidence trails) are TEXT holding JSON and are parsed at
 * the edge. Timestamps are INTEGER milliseconds since the epoch.
 *
 * Migrations are generated from this file with `npm run db:generate` and live
 * as plain SQL under apps/api/drizzle/.
 */
import { sqliteTable, text, integer, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const vendors = sqliteTable('vendors', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull(),
  contact: text('contact').notNull(),
  sla: text('sla').notNull()
});

export const zones = sqliteTable('zones', {
  id: text('id').primaryKey(),
  terminal: text('terminal').notNull(),
  name: text('name').notNull(),
  /** landside | control | airside | pier */
  kind: text('kind').notNull(),
  x: real('x').notNull(), y: real('y').notNull(),
  w: real('w').notNull(), h: real('h').notNull()
});

export const gates = sqliteTable('gates', {
  id: text('id').primaryKey(),
  zoneId: text('zone_id').notNull().references(() => zones.id),
  terminal: text('terminal').notNull(),
  intl: integer('intl', { mode: 'boolean' }).notNull(),
  x: real('x').notNull(), y: real('y').notNull(),
  stand: text('stand').notNull()
}, t => ({ byZone: index('gates_zone_idx').on(t.zoneId) }));

export const screens = sqliteTable('screens', {
  id: text('id').primaryKey(),
  zoneId: text('zone_id').notNull().references(() => zones.id),
  terminal: text('terminal').notNull(),
  name: text('name').notNull(),
  size: text('size').notNull(),
  orientation: text('orientation').notNull(),
  ratio: text('ratio').notNull(),
  kind: text('kind').notNull(),
  /** JSON string[] — the gates whose crowd this screen faces */
  nearGates: text('near_gates').notNull(),
  x: real('x').notNull(), y: real('y').notNull(),
  status: text('status').notNull().default('online'),
  latencyMs: integer('latency_ms').notNull().default(60),
  offlineSince: integer('offline_since'),
  installed: text('installed').notNull(),
  vendorId: text('vendor_id').references(() => vendors.id),
  floorPrice: real('floor_price').notNull(),
  playsToday: integer('plays_today').notNull().default(0),
  impressionsToday: integer('impressions_today').notNull().default(0)
}, t => ({ byZone: index('screens_zone_idx').on(t.zoneId) }));

export const airlines = sqliteTable('airlines', {
  id: text('id').primaryKey(),            // IATA code
  name: text('name').notNull(),
  type: text('type').notNull(),
  home: integer('home', { mode: 'boolean' }).notNull(),
  premium: real('premium').notNull(),
  colour: text('colour').notNull()
});

export const outlets = sqliteTable('outlets', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  category: text('category').notNull(),
  zoneId: text('zone_id').notNull().references(() => zones.id),
  terminal: text('terminal').notNull(),
  nearGates: text('near_gates').notNull(),   // JSON string[]
  unit: text('unit').notNull(),
  sqm: integer('sqm').notNull(),
  opens: text('opens').notNull(),
  closes: text('closes').notNull(),
  contact: text('contact').notNull(),
  monthlyRent: integer('monthly_rent').notNull()
}, t => ({ byZone: index('outlets_zone_idx').on(t.zoneId) }));

/** Canonical Flight: projected from the AODB snapshot, kept current by AIDX. */
export const flights = sqliteTable('flights', {
  id: text('id').primaryKey(),
  number: text('number').notNull(),
  airlineCode: text('airline_code').notNull().references(() => airlines.id),
  direction: text('direction').notNull(),    // D | A
  origin: text('origin').notNull(),
  destination: text('destination').notNull(),
  terminal: text('terminal').notNull(),
  gateId: text('gate_id').notNull(),
  stand: text('stand').notNull(),
  belt: text('belt'),
  checkin: text('checkin'),
  stdTs: integer('std_ts').notNull(),
  etdTs: integer('etd_ts').notNull(),
  atdTs: integer('atd_ts'),
  /** boarding as scheduled — never moves when a flight is delayed, which is
   *  why a delay holds a crowd at the gate instead of dispersing it */
  schedBoardingTs: integer('sched_boarding_ts').notNull(),
  boardingTs: integer('boarding_ts').notNull(),
  gateCloseTs: integer('gate_close_ts').notNull(),
  delayMin: integer('delay_min').notNull().default(0),
  delayCode: text('delay_code'),
  status: text('status').notNull(),
  pax: integer('pax').notNull(),
  acType: text('ac_type').notNull(),
  acReg: text('ac_reg').notNull(),
  loadFactor: real('load_factor').notNull(),
  tobt: integer('tobt'), tsat: integer('tsat'),
  aibt: integer('aibt'), aobt: integer('aobt'),
  /** JSON CrowdProfile — aggregated shares only, never per-passenger data */
  profile: text('profile').notNull()
}, t => ({
  byGate: index('flights_gate_idx').on(t.gateId),
  byStd: index('flights_std_idx').on(t.stdTs),
  byAirline: index('flights_airline_idx').on(t.airlineCode)
}));

/** Raw AIDX messages, kept for audit next to the canonical event. */
export const flightEvents = sqliteTable('flight_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  flightId: text('flight_id').notNull(),
  kind: text('kind').notNull(),
  at: integer('at').notNull(),
  raw: text('raw').notNull()               // the XML exactly as it arrived
}, t => ({ byAt: index('flight_events_at_idx').on(t.at) }));

/** ACRIS QueueMeasurement (NGSI-LD), projected into the canonical model. */
export const queueMeasurements = sqliteTable('queue_measurements', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  zoneId: text('zone_id').notNull().references(() => zones.id),
  people: integer('people').notNull(),
  waitSec: integer('wait_sec').notNull(),
  at: integer('at').notNull(),
  raw: text('raw').notNull()               // the NGSI-LD entity
}, t => ({ byZoneAt: index('queue_zone_at_idx').on(t.zoneId, t.at) }));

export const campaigns = sqliteTable('campaigns', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  advertiser: text('advertiser').notNull(),
  outletId: text('outlet_id'),
  airlineCode: text('airline_code'),
  category: text('category').notNull(),
  weights: text('weights').notNull(),      // JSON Record<segmentId, 0..1>
  hard: text('hard').notNull(),            // JSON HardFilters
  triggers: text('triggers').notNull(),    // JSON Trigger[]
  budget: real('budget').notNull(),
  /** spend ceiling for one day; null means only the total budget applies */
  dailyCap: real('daily_cap'),
  spent: real('spent').notNull().default(0),
  cpm: real('cpm').notNull(),
  /** learned from measured scans and redemptions */
  cvrIndex: real('cvr_index').notNull().default(1),
  creativeId: text('creative_id'),
  promoId: text('promo_id'),
  priority: integer('priority').notNull().default(1),
  scheduleFrom: text('schedule_from').notNull(),
  scheduleTo: text('schedule_to').notNull(),
  status: text('status').notNull().default('live'),
  approval: text('approval').notNull().default('approved'),
  brandSafety: text('brand_safety').notNull().default('passed'),
  frequencyCap: integer('frequency_cap').notNull().default(4),
  pinned: integer('pinned', { mode: 'boolean' }).notNull().default(false),
  pinReason: text('pin_reason')
});

export const creatives = sqliteTable('creatives', {
  id: text('id').primaryKey(),
  campaignId: text('campaign_id'),
  advertiser: text('advertiser').notNull(),
  category: text('category').notNull(),
  template: text('template').notNull(),
  headline: text('headline').notNull(),    // JSON Record<locale, string>
  sub: text('sub').notNull(),
  cta: text('cta').notNull(),
  ratio: text('ratio').notNull(),
  approval: text('approval').notNull().default('pending'),
  generatedBy: text('generated_by').notNull().default('studio'),
  brief: text('brief'),
  updated: text('updated').notNull(),
  checks: text('checks').notNull()         // JSON brand-safety checklist
});

export const promoCodes = sqliteTable('promo_codes', {
  id: text('id').primaryKey(),
  campaignId: text('campaign_id').notNull(),
  advertiser: text('advertiser').notNull(),
  outletId: text('outlet_id'),
  code: text('code').notNull(),
  offer: text('offer').notNull(),
  validUntil: text('valid_until').notNull(),
  maxRedemptions: integer('max_redemptions').notNull(),
  redemptions: integer('redemptions').notNull().default(0),
  shareEnabled: integer('share_enabled', { mode: 'boolean' }).notNull().default(true),
  stockPaused: integer('stock_paused', { mode: 'boolean' }).notNull().default(false),
  terms: text('terms').notNull()
}, t => ({ byCode: uniqueIndex('promo_code_unique').on(t.code) }));

export const impressions = sqliteTable('impressions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  campaignId: text('campaign_id').notNull(),
  screenId: text('screen_id').notNull(),
  at: integer('at').notNull(),
  count: integer('count').notNull()
}, t => ({ byCampaignAt: index('impressions_campaign_at_idx').on(t.campaignId, t.at) }));

export const redemptions = sqliteTable('redemptions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  at: integer('at').notNull(),
  campaignId: text('campaign_id').notNull(),
  screenId: text('screen_id'),
  advertiser: text('advertiser').notNull(),
  outletId: text('outlet_id'),
  value: real('value').notNull(),
  segment: text('segment').notNull(),
  code: text('code').notNull(),
  via: text('via').notNull()
}, t => ({ byAt: index('redemptions_at_idx').on(t.at) }));

export const incidents = sqliteTable('incidents', {
  id: text('id').primaryKey(),
  at: integer('at').notNull(),
  severity: text('severity').notNull(),    // critical | major | minor
  kind: text('kind').notNull(),
  ref: text('ref').notNull(),
  title: text('title').notNull(),
  detail: text('detail').notNull(),
  owner: text('owner').notNull(),
  status: text('status').notNull().default('open')
}, t => ({ byAt: index('incidents_at_idx').on(t.at) }));

/** Every decision with the evidence it was built from, so any role can audit
 *  why an ad played. */
export const decisionLog = sqliteTable('decision_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  screenId: text('screen_id').notNull(),
  at: integer('at').notNull(),
  crowdNow: integer('crowd_now').notNull(),
  dwellMedian: integer('dwell_median').notNull(),
  maxDelay: integer('max_delay').notNull(),
  winnerId: text('winner_id'),
  winnerScore: real('winner_score'),
  rule: text('rule').notNull(),
  fallback: integer('fallback', { mode: 'boolean' }).notNull().default(false),
  modelVersion: text('model_version').notNull(),
  /** JSON Decision: profile, candidates, evidence, verification */
  payload: text('payload').notNull()
}, t => ({
  byAt: index('decision_at_idx').on(t.at),
  byScreenAt: index('decision_screen_at_idx').on(t.screenId, t.at)
}));

/** 30 days of campaign history, for ROI and "run again". */
export const campaignDays = sqliteTable('campaign_days', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  date: text('date').notNull(),
  campaignId: text('campaign_id').notNull(),
  advertiser: text('advertiser').notNull(),
  impressions: integer('impressions').notNull(),
  scans: integer('scans').notNull(),
  redemptions: integer('redemptions').notNull(),
  spend: real('spend').notNull(),
  revenue: real('revenue').notNull(),
  plays: integer('plays').notNull()
}, t => ({
  unique: uniqueIndex('campaign_day_unique').on(t.date, t.campaignId),
  byDate: index('campaign_days_date_idx').on(t.date)
}));
