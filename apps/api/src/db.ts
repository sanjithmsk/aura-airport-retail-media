/**
 * The database is the system of record. At boot the API projects it into the
 * in-memory `World` the engine works over, because a decision runs per screen
 * per slot and must not touch disk. Writes (redemptions, decisions, campaign
 * edits, incidents) go back to SQLite as they happen.
 */
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import * as schema from './schema.js';
import type { World, Flight, Screen, Campaign, Creative, PromoCode, Outlet, Zone, Gate, Vendor } from '@aura/core';

const here = dirname(fileURLToPath(import.meta.url));

function filePath() {
  const url = process.env.DATABASE_URL ?? 'file:./aura.db';
  const p = url.replace(/^file:/, '');
  const abs = p.startsWith('/') ? p : resolve(here, '../', p);
  mkdirSync(dirname(abs), { recursive: true });
  return abs;
}

export const sqlite = new Database(filePath());
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');
export const db = drizzle(sqlite, { schema });

/** Applies every SQL migration under apps/api/drizzle. Idempotent. */
export function runMigrations() {
  migrate(db, { migrationsFolder: resolve(here, '../drizzle') });
}

const P = <T>(s: string, fallback: T): T => { try { return JSON.parse(s) as T; } catch { return fallback; } };

export function loadWorld(): World {
  const zoneRows = db.select().from(schema.zones).all();
  const gateRows = db.select().from(schema.gates).all();
  const screenRows = db.select().from(schema.screens).all();
  const outletRows = db.select().from(schema.outlets).all();
  const flightRows = db.select().from(schema.flights).all();
  const campaignRows = db.select().from(schema.campaigns).all();
  const creativeRows = db.select().from(schema.creatives).all();
  const promoRows = db.select().from(schema.promoCodes).all();
  const vendorRows = db.select().from(schema.vendors).all();
  const airlineRows = db.select().from(schema.airlines).all();
  const historyRows = db.select().from(schema.campaignDays).all();

  const zones: Zone[] = zoneRows.map(z => ({
    id: z.id, terminal: z.terminal, name: z.name, kind: z.kind as Zone['kind'],
    x: z.x, y: z.y, w: z.w, h: z.h,
    gates: gateRows.filter(g => g.zoneId === z.id).map(g => g.id)
  }));

  const gates: Gate[] = gateRows.map(g => ({
    id: g.id, zone: g.zoneId, terminal: g.terminal, intl: g.intl, x: g.x, y: g.y, stand: g.stand
  }));

  const vendorName = new Map(vendorRows.map(v => [v.id, v.name]));

  const screens: Screen[] = screenRows.map(s => ({
    id: s.id, zone: s.zoneId, terminal: s.terminal, name: s.name,
    size: s.size, orientation: s.orientation as Screen['orientation'],
    ratio: s.ratio as Screen['ratio'], kind: s.kind,
    nearGates: P<string[]>(s.nearGates, []), x: s.x, y: s.y,
    status: s.status as Screen['status'], latencyMs: s.latencyMs, offlineSince: s.offlineSince,
    installed: s.installed, vendor: (s.vendorId && vendorName.get(s.vendorId)) || 'Lumen Displays',
    floorPrice: s.floorPrice, lastPlay: null,
    playsToday: s.playsToday, impressionsToday: s.impressionsToday
  }));

  const zoneOfGate = new Map(gates.map(g => [g.id, g.zone]));

  const flights: Flight[] = flightRows.map(f => ({
    id: f.id, number: f.number, airlineCode: f.airlineCode,
    direction: f.direction as Flight['direction'],
    origin: f.origin, destination: f.destination, terminal: f.terminal,
    gate: f.gateId, stand: f.stand, zone: zoneOfGate.get(f.gateId),
    belt: f.belt, checkin: f.checkin,
    stdTs: f.stdTs, etdTs: f.etdTs, atdTs: f.atdTs,
    schedBoardingTs: f.schedBoardingTs, boardingTs: f.boardingTs, gateCloseTs: f.gateCloseTs,
    delayMin: f.delayMin, delayCode: f.delayCode, status: f.status as Flight['status'],
    pax: f.pax, acType: f.acType, acReg: f.acReg, loadFactor: f.loadFactor,
    tobt: f.tobt, tsat: f.tsat, aibt: f.aibt, aobt: f.aobt,
    profile: P(f.profile, {} as Flight['profile'])
  }));

  const campaigns: Campaign[] = campaignRows.map(c => ({
    id: c.id, name: c.name, advertiser: c.advertiser, outletId: c.outletId,
    airlineCode: c.airlineCode ?? undefined, category: c.category,
    weights: P<Record<string, number>>(c.weights, {}),
    hard: P<Campaign['hard']>(c.hard, {}),
    triggers: P<Campaign['triggers']>(c.triggers, []),
    budget: c.budget, dailyCap: c.dailyCap, spent: c.spent, cpm: c.cpm, cvrIndex: c.cvrIndex,
    creative: c.creativeId, promo: c.promoId, priority: c.priority,
    schedule: { from: c.scheduleFrom, to: c.scheduleTo },
    status: c.status as Campaign['status'], approval: c.approval as Campaign['approval'],
    brandSafety: c.brandSafety as Campaign['brandSafety'],
    frequencyCap: c.frequencyCap, pinned: c.pinned, pinReason: c.pinReason ?? undefined
  }));

  const creatives: Creative[] = creativeRows.map(c => ({
    id: c.id, campaignId: c.campaignId, advertiser: c.advertiser, category: c.category,
    template: c.template, headline: P(c.headline, {}), sub: P(c.sub, {}), cta: P(c.cta, {}),
    ratio: c.ratio, approval: c.approval as Creative['approval'], generatedBy: c.generatedBy,
    brief: c.brief ?? undefined, updated: c.updated, checks: P(c.checks, {} as Creative['checks'])
  }));

  const promos: PromoCode[] = promoRows.map(p => ({
    id: p.id, campaignId: p.campaignId, advertiser: p.advertiser, outletId: p.outletId,
    code: p.code, offer: p.offer, validUntil: p.validUntil,
    maxRedemptions: p.maxRedemptions, redemptions: p.redemptions,
    shareEnabled: p.shareEnabled, stockPaused: p.stockPaused, terms: p.terms
  }));

  const outlets: Outlet[] = outletRows.map(o => ({
    id: o.id, name: o.name, category: o.category, zone: o.zoneId, terminal: o.terminal,
    nearGates: P<string[]>(o.nearGates, []), unit: o.unit, sqm: o.sqm,
    opens: o.opens, closes: o.closes, contact: o.contact, monthlyRent: o.monthlyRent
  }));

  const vendors: Vendor[] = vendorRows.map(v => ({
    id: v.id, name: v.name, type: v.type, contact: v.contact, sla: v.sla,
    screens: screens.filter(s => s.vendor === v.name).length
  }));

  return {
    zones, gates, screens, outlets, flights, campaigns, creatives, promos, vendors,
    airlines: airlineRows.map(a => ({
      code: a.id, name: a.name, type: a.type, home: a.home,
      share: 0, premium: a.premium, colour: a.colour
    })),
    history: historyRows.map(h => ({
      date: h.date, campaignId: h.campaignId, advertiser: h.advertiser,
      impressions: h.impressions, scans: h.scans, redemptions: h.redemptions,
      spend: h.spend, revenue: h.revenue, plays: h.plays
    }))
  };
}
