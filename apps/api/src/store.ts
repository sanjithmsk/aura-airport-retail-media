/**
 * Every write the running platform makes, in one place. The simulation and
 * the routes call these; neither of them knows Drizzle exists.
 *
 * Writes are deliberately fire-and-forget at the call site: an audit row must
 * never stall a decision or a claim. Failures are logged, not thrown.
 */
import { eq, desc } from 'drizzle-orm';
import { db } from './db.js';
import * as s from './schema.js';
import type { Campaign, Creative, Decision, Screen, Outlet } from '@aura/core';

const quiet = (fn: () => unknown) => { try { fn(); } catch (e) { console.warn('[store]', (e as Error).message); } };

export const store = {
  /* ---- feeds (audit) -------------------------------------------------- */
  flightEvent(flightId: string, kind: string, at: number, raw: string) {
    quiet(() => db.insert(s.flightEvents).values({ flightId, kind, at, raw }).run());
  },
  queueMeasurement(zoneId: string, people: number, waitSec: number, at: number, raw: string) {
    quiet(() => db.insert(s.queueMeasurements).values({ zoneId, people, waitSec, at, raw }).run());
  },

  /* ---- decisions ------------------------------------------------------ */
  decision(d: Decision) {
    quiet(() => db.insert(s.decisionLog).values({
      screenId: d.screenId, at: d.at, crowdNow: d.crowdNow ?? 0,
      dwellMedian: d.dwellMedian ?? 0, maxDelay: d.maxDelay ?? 0,
      winnerId: d.winner?.campaignId ?? null, winnerScore: d.winner?.final ?? null,
      rule: d.rule ?? '', fallback: d.fallback, modelVersion: d.modelVersion ?? '',
      payload: JSON.stringify(d)
    }).run());
  },

  /* ---- money ---------------------------------------------------------- */
  impression(campaignId: string, screenId: string, at: number, count: number) {
    quiet(() => db.insert(s.impressions).values({ campaignId, screenId, at, count }).run());
  },
  redemption(rec: {
    at: number; campaignId: string; screenId: string | null; advertiser: string;
    outletId: string | null; value: number; segment: string; code: string; via: string;
  }) {
    quiet(() => db.insert(s.redemptions).values(rec).run());
  },
  promoRedemptions(code: string, redemptions: number) {
    quiet(() => db.update(s.promoCodes).set({ redemptions }).where(eq(s.promoCodes.code, code)).run());
  },
  campaignMetrics(id: string, cvrIndex: number, spent: number) {
    quiet(() => db.update(s.campaigns).set({ cvrIndex, spent }).where(eq(s.campaigns.id, id)).run());
  },

  /* ---- master data ---------------------------------------------------- */
  campaignInsert(c: Campaign) {
    quiet(() => db.insert(s.campaigns).values({
      id: c.id, name: c.name, advertiser: c.advertiser, outletId: c.outletId,
      airlineCode: c.airlineCode ?? null, category: c.category,
      weights: JSON.stringify(c.weights), hard: JSON.stringify(c.hard),
      triggers: JSON.stringify(c.triggers ?? []),
      budget: c.budget, dailyCap: c.dailyCap ?? null, spent: c.spent ?? 0, cpm: c.cpm, cvrIndex: c.cvrIndex ?? 1,
      creativeId: c.creative, promoId: c.promo, priority: c.priority ?? 1,
      scheduleFrom: c.schedule.from, scheduleTo: c.schedule.to,
      status: c.status, approval: c.approval, brandSafety: c.brandSafety ?? 'passed',
      frequencyCap: c.frequencyCap ?? 4, pinned: !!c.pinned, pinReason: c.pinReason ?? null
    }).run());
  },
  campaignUpdate(c: Campaign) {
    quiet(() => db.update(s.campaigns).set({
      name: c.name, status: c.status, approval: c.approval,
      pinned: !!c.pinned, pinReason: c.pinReason ?? null,
      weights: JSON.stringify(c.weights), hard: JSON.stringify(c.hard),
      triggers: JSON.stringify(c.triggers), budget: c.budget, dailyCap: c.dailyCap ?? null,
      spent: c.spent, cpm: c.cpm
    }).where(eq(s.campaigns.id, c.id)).run());
  },
  creativeInsert(c: Creative) {
    quiet(() => db.insert(s.creatives).values({
      id: c.id, campaignId: c.campaignId, advertiser: c.advertiser, category: c.category,
      template: c.template, headline: JSON.stringify(c.headline), sub: JSON.stringify(c.sub),
      cta: JSON.stringify(c.cta), ratio: c.ratio, approval: c.approval,
      generatedBy: c.generatedBy, brief: c.brief ?? null, updated: c.updated,
      checks: JSON.stringify(c.checks)
    }).run());
  },
  creativeApproval(id: string, approval: string) {
    quiet(() => db.update(s.creatives).set({ approval }).where(eq(s.creatives.id, id)).run());
  },
  campaignApproval(id: string, approval: string, status: string) {
    quiet(() => db.update(s.campaigns).set({ approval, status }).where(eq(s.campaigns.id, id)).run());
  },

  screenUpsert(sc: Screen, insert: boolean) {
    const row = {
      id: sc.id, zoneId: sc.zone, terminal: sc.terminal, name: sc.name,
      size: sc.size, orientation: sc.orientation, ratio: sc.ratio, kind: sc.kind,
      nearGates: JSON.stringify(sc.nearGates), x: sc.x, y: sc.y,
      status: sc.status, latencyMs: sc.latencyMs, offlineSince: sc.offlineSince,
      installed: sc.installed, vendorId: null as string | null,
      floorPrice: sc.floorPrice, playsToday: sc.playsToday, impressionsToday: sc.impressionsToday
    };
    quiet(() => {
      const v = db.select().from(s.vendors).all().find(x => x.name === sc.vendor);
      row.vendorId = v?.id ?? null;
      if (insert) db.insert(s.screens).values(row).run();
      else db.update(s.screens).set(row).where(eq(s.screens.id, sc.id)).run();
    });
  },
  outletUpsert(o: Outlet, insert: boolean) {
    const row = {
      id: o.id, name: o.name, category: o.category, zoneId: o.zone, terminal: o.terminal,
      nearGates: JSON.stringify(o.nearGates), unit: o.unit, sqm: o.sqm,
      opens: o.opens, closes: o.closes, contact: o.contact, monthlyRent: o.monthlyRent
    };
    quiet(() => {
      if (insert) db.insert(s.outlets).values(row).run();
      else db.update(s.outlets).set(row).where(eq(s.outlets.id, o.id)).run();
    });
  },

  /* ---- operations ----------------------------------------------------- */
  flightDelay(id: string, f: { delayMin: number; etdTs: number; boardingTs: number; gateCloseTs: number; status: string; delayCode: string | null }) {
    quiet(() => db.update(s.flights).set(f).where(eq(s.flights.id, id)).run());
  },
  flightGate(id: string, gateId: string, stand: string, terminal: string) {
    quiet(() => db.update(s.flights).set({ gateId, stand, terminal }).where(eq(s.flights.id, id)).run());
  },
  screenHealth(id: string, status: string, offlineSince: number | null, latencyMs: number) {
    quiet(() => db.update(s.screens).set({ status, offlineSince, latencyMs }).where(eq(s.screens.id, id)).run());
  },
  incidentInsert(i: { id: string; at: number; severity: string; kind: string; ref: string; title: string; detail: string; owner: string; status: string }) {
    quiet(() => db.insert(s.incidents).values(i).run());
  },
  incidentStatus(id: string, status: string) {
    quiet(() => db.update(s.incidents).set({ status }).where(eq(s.incidents.id, id)).run());
  },

  /* ---- reads ---------------------------------------------------------- */
  incidents() {
    return db.select().from(s.incidents).orderBy(desc(s.incidents.at)).all();
  },
  campaignHistory(campaignId: string) {
    return db.select().from(s.campaignDays).where(eq(s.campaignDays.campaignId, campaignId)).all();
  },
  flightCount() {
    return db.select().from(s.flights).all().length;
  }
};
