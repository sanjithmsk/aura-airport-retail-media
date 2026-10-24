/**
 * Generate one day at Aurelia International and write it to SQLite.
 *
 * The generator is deterministic (one seed), so `npm run db:reset` always
 * produces the same airport — the worked example in the demo script lands on
 * the same numbers for every reviewer, every time.
 */
import {
  buildWorld, buildAdapters, AIRLINES, zonePresence,
  DAY, DAY_START, DEMO_TIME, MIN, rngFrom, between, hhmm
} from '@aura/core';
import { db, sqlite, runMigrations } from './db.js';
import * as s from './schema.js';

const J = (v: unknown) => JSON.stringify(v);
/** SQLite caps bound variables per statement; insert in slices. */
function insertAll<T>(table: any, rows: T[], chunk = 150) {
  for (let i = 0; i < rows.length; i += chunk) db.insert(table).values(rows.slice(i, i + chunk)).run();
}

export function seedDatabase({ force = false } = {}) {
  runMigrations();

  // Seeding is destructive, so on a container restart with a persisted volume
  // we skip unless asked. `npm run db:reset` deletes the file first, which
  // makes the fresh seed unconditional.
  const existing = db.select().from(s.flights).all().length;
  if (existing && !force) {
    console.log(`Database already holds ${existing} flight legs — skipping the seed. Use --force to regenerate.`);
    return;
  }

  console.log('Generating one day at Aurelia International (AUR)…');
  const world = buildWorld();
  const adapters = buildAdapters(world);

  console.log(
    `  ${world.flights.length} flight legs · ${world.gates.length} gates · ` +
    `${world.screens.length} screens · ${world.outlets.length} outlets · ` +
    `${world.campaigns.length} campaigns · ${world.history.length} history rows`
  );

  // children before parents
  for (const t of [
    s.decisionLog, s.impressions, s.redemptions, s.campaignDays, s.promoCodes,
    s.creatives, s.campaigns, s.flightEvents, s.flights, s.queueMeasurements,
    s.outlets, s.screens, s.gates, s.zones, s.airlines, s.vendors, s.incidents
  ]) db.delete(t).run();

  insertAll(s.vendors, world.vendors.map(v => ({
    id: v.id, name: v.name, type: v.type, contact: v.contact, sla: v.sla
  })));

  insertAll(s.zones, world.zones.map(z => ({
    id: z.id, terminal: z.terminal, name: z.name, kind: z.kind, x: z.x, y: z.y, w: z.w, h: z.h
  })));

  insertAll(s.gates, world.gates.map(g => ({
    id: g.id, zoneId: g.zone, terminal: g.terminal, intl: g.intl, x: g.x, y: g.y, stand: g.stand
  })));

  const vendorId = new Map(world.vendors.map(v => [v.name, v.id]));
  insertAll(s.screens, world.screens.map(sc => ({
    id: sc.id, zoneId: sc.zone, terminal: sc.terminal, name: sc.name,
    size: sc.size, orientation: sc.orientation, ratio: sc.ratio, kind: sc.kind,
    nearGates: J(sc.nearGates), x: sc.x, y: sc.y,
    status: sc.status, latencyMs: sc.latencyMs, offlineSince: sc.offlineSince,
    installed: sc.installed, vendorId: vendorId.get(sc.vendor) ?? null,
    floorPrice: sc.floorPrice, playsToday: 0, impressionsToday: 0
  })));

  insertAll(s.airlines, AIRLINES.map(a => ({
    id: a.code, name: a.name, type: a.type, home: a.home, premium: a.premium, colour: a.colour
  })));

  insertAll(s.outlets, world.outlets.map(o => ({
    id: o.id, name: o.name, category: o.category, zoneId: o.zone, terminal: o.terminal,
    nearGates: J(o.nearGates), unit: o.unit, sqm: o.sqm, opens: o.opens, closes: o.closes,
    contact: o.contact, monthlyRent: o.monthlyRent
  })));

  // arrivals reuse a neighbouring flight number, so de-duplicate on id
  const seen = new Set<string>();
  const flightRows = world.flights
    .filter(f => (seen.has(f.id) ? false : (seen.add(f.id), true)))
    .map(f => ({
      id: f.id, number: f.number, airlineCode: f.airlineCode, direction: f.direction,
      origin: f.origin, destination: f.destination, terminal: f.terminal,
      gateId: f.gate, stand: f.stand, belt: f.belt, checkin: f.checkin,
      stdTs: f.stdTs, etdTs: f.etdTs, atdTs: f.atdTs,
      schedBoardingTs: f.schedBoardingTs ?? f.boardingTs,
      boardingTs: f.boardingTs, gateCloseTs: f.gateCloseTs,
      delayMin: f.delayMin, delayCode: f.delayCode, status: f.status, pax: f.pax,
      acType: f.acType, acReg: f.acReg, loadFactor: f.loadFactor,
      tobt: f.tobt, tsat: f.tsat, aibt: null, aobt: null, profile: J(f.profile)
    }));
  insertAll(s.flights, flightRows, 60);

  insertAll(s.campaigns, world.campaigns.map(c => ({
    id: c.id, name: c.name, advertiser: c.advertiser, outletId: c.outletId,
    airlineCode: c.airlineCode ?? null, category: c.category,
    weights: J(c.weights), hard: J(c.hard), triggers: J(c.triggers),
    budget: c.budget, dailyCap: c.dailyCap ?? null, spent: c.spent, cpm: c.cpm, cvrIndex: c.cvrIndex,
    creativeId: c.creative, promoId: c.promo, priority: c.priority,
    scheduleFrom: c.schedule.from, scheduleTo: c.schedule.to,
    status: c.status, approval: c.approval, brandSafety: c.brandSafety,
    frequencyCap: c.frequencyCap ?? 4, pinned: false, pinReason: null
  })));

  insertAll(s.creatives, world.creatives.map(c => ({
    id: c.id, campaignId: c.campaignId, advertiser: c.advertiser, category: c.category,
    template: c.template, headline: J(c.headline), sub: J(c.sub), cta: J(c.cta),
    ratio: c.ratio, approval: c.approval, generatedBy: c.generatedBy,
    brief: c.brief ?? null, updated: c.updated, checks: J(c.checks)
  })));

  insertAll(s.promoCodes, world.promos.map(p => ({
    id: p.id, campaignId: p.campaignId, advertiser: p.advertiser, outletId: p.outletId,
    code: p.code, offer: p.offer, validUntil: p.validUntil,
    maxRedemptions: p.maxRedemptions, redemptions: 0,
    shareEnabled: p.shareEnabled, stockPaused: false, terms: p.terms
  })));

  insertAll(s.campaignDays, world.history.map(h => ({
    date: h.date, campaignId: h.campaignId, advertiser: h.advertiser,
    impressions: h.impressions, scans: h.scans, redemptions: h.redemptions,
    spend: h.spend, revenue: h.revenue, plays: h.plays
  })), 80);

  // a first ACRIS sweep, so the engine has queue evidence from the opening tick
  const r = rngFrom(4242);
  insertAll(s.queueMeasurements, world.zones.map(z => {
    const p = zonePresence(world, z, DEMO_TIME, null);
    const people = Math.max(0, Math.round(p.pax * between(r, 0.86, 1.14) + between(r, 6, 42)));
    const waitSec = Math.round(between(r, z.kind === 'control' ? 120 : 60, z.kind === 'control' ? 900 : 420));
    return {
      zoneId: z.id, people, waitSec, at: DEMO_TIME,
      raw: J(adapters.zone.publish(z.id, people, waitSec, DEMO_TIME))
    };
  }));

  // two open incidents, so the operator console is not uniformly green at open
  const offline = world.screens[12], slow = world.screens[58];
  insertAll(s.incidents, [
    {
      id: 'INC-0001', at: DEMO_TIME - 11 * MIN, severity: 'critical', kind: 'screen-offline',
      ref: offline.id, title: `${offline.name} offline for 11 min`,
      detail: `No heartbeat since ${hhmm(DEMO_TIME - 11 * MIN)}. Inventory released back to the pool.`,
      owner: 'Field Tech · T1', status: 'open'
    },
    {
      id: 'INC-0002', at: DEMO_TIME - 26 * MIN, severity: 'major', kind: 'latency',
      ref: slow.id, title: `${slow.name} latency above threshold`,
      detail: 'Rolling p95 above the 250 ms budget. Playlist still building.',
      owner: 'Network Ops', status: 'investigating'
    }
  ]);
  sqlite.prepare('update screens set status=?, offline_since=?, latency_ms=? where id=?')
    .run('offline', DEMO_TIME - 11 * MIN, 0, offline.id);
  sqlite.prepare('update screens set status=?, latency_ms=? where id=?')
    .run('degraded', 540, slow.id);

  console.log(`Seeded ${DAY}. Simulation opens at ${hhmm(DEMO_TIME)} (day runs ${hhmm(DAY_START)}–23:59).`);
}

