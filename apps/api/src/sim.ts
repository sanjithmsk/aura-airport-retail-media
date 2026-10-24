/**
 * The simulation: one clock, the feeds it drives, and the running platform
 * state every role reads. Decisions run here, server-side, so every client
 * sees the same screen playing the same ad for the same reasons.
 */
import { EventEmitter } from 'node:events';
import {
  buildAdapters, decide, zonePresence, rngFrom, between, round2, hhmm,
  DAY_START, DAY_END, DEMO_TIME, MIN, HOUR, ENGINE, AIRLINES
} from '@aura/core';
import type { World, Screen, Flight, Decision, FlightEvent } from '@aura/core';
import { store } from './store.js';

export const bus = new EventEmitter();
bus.setMaxListeners(200);

export interface Metrics { plays: number; impressions: number; revenue: number; scans: number; redemptions: number }
export interface Incident {
  id: string; at: number; severity: 'critical' | 'major' | 'minor';
  kind: string; ref: string; title: string; detail: string; owner: string; status: string;
}

export const sim = {
  world: null as unknown as World,
  adapters: null as ReturnType<typeof buildAdapters> | null,
  now: DEMO_TIME,
  playing: false,
  speed: 10,
  timer: null as NodeJS.Timeout | null,
  lastReal: 0,
  lastMinute: -1,
  slotCursor: 0,
  watched: new Set<string>(),
  state: {
    playsByScreen: {} as Record<string, Array<{ at: number; campaignId: string; category: string }>>,
    gateChanges: {} as Record<string, number>,
    festival: false,
    metrics: { plays: 0, impressions: 0, revenue: 0, scans: 0, redemptions: 0 } as Metrics,
    byCampaign: {} as Record<string, Metrics & { segments: Record<string, number> }>,
    byOutlet: {} as Record<string, { impressions: number; scans: number; redemptions: number; revenue: number }>,
    currentByScreen: {} as Record<string, Decision>,
    decisionLog: [] as Decision[],
    incidents: [] as Incident[],
    redemptions: [] as any[],
    goodwill: [] as any[],
    perf: { apiP95: 86, playlistMs: 31, uptime7d: 99.94 }
  }
};

let incidentSeq = 100;

export async function initSim(world: World) {
  sim.world = world;
  sim.adapters = buildAdapters(world);

  // live counters, backfilled from the day so far
  const r = rngFrom(99);
  const hoursElapsed = (DEMO_TIME - DAY_START) / HOUR;
  for (const c of world.campaigns) {
    const impressions = Math.round(hoursElapsed * between(r, 4000, 7000));
    const scans = Math.round(impressions * between(r, 0.0016, 0.0058) * c.cvrIndex);
    sim.state.byCampaign[c.id] = {
      plays: Math.round(impressions / 22), impressions, scans,
      redemptions: Math.round(scans * 0.62),
      revenue: round2((impressions / 1000) * c.cpm),
      segments: { holiday: between(r, 0.8, 1.4), family: between(r, 0.7, 3.2), business: between(r, 0.6, 1.5) }
    };
  }
  for (const o of world.outlets) sim.state.byOutlet[o.id] = { impressions: 0, scans: 0, redemptions: 0, revenue: 0 };
  for (const c of world.campaigns) {
    if (!c.outletId) continue;
    const b = sim.state.byCampaign[c.id], o = sim.state.byOutlet[c.outletId];
    if (!o) continue;
    o.impressions += b.impressions; o.scans += b.scans; o.redemptions += b.redemptions;
    o.revenue = round2(o.revenue + b.redemptions * 23.4);
  }
  const all = Object.values(sim.state.byCampaign);
  sim.state.metrics = {
    plays: all.reduce((s, b) => s + b.plays, 0),
    impressions: all.reduce((s, b) => s + b.impressions, 0),
    scans: all.reduce((s, b) => s + b.scans, 0),
    redemptions: all.reduce((s, b) => s + b.redemptions, 0),
    revenue: round2(all.reduce((s, b) => s + b.revenue, 0))
  };

  sim.state.incidents = store.incidents().map(i => ({
    id: i.id, at: i.at, severity: i.severity as Incident['severity'],
    kind: i.kind, ref: i.ref, title: i.title, detail: i.detail, owner: i.owner, status: i.status
  }));

  catchUpFlights(sim.now, true);
  publishAcris(sim.now);
  replayRecentAidx(sim.now);
  rebuildDecisions(true);
  start();
}

/** A live AIDX bus has been streaming all day. At boot, replay the status
 *  transitions of the last half hour with the timestamps they really had, so
 *  the feed-health view opens with genuine history instead of an empty list. */
function replayRecentAidx(now: number) {
  const since = now - 30 * MIN;
  const recent = sim.world.flights
    .filter(f => f.direction === 'D' && f.boardingTs > since && f.boardingTs <= now)
    .sort((a, b) => a.boardingTs - b.boardingTs)
    .slice(-12);
  for (const f of recent) {
    if (f.delayMin >= 15) emitAidx(f, 'delay', Math.max(since, f.boardingTs - 20 * MIN));
    emitAidx(f, f.status === 'departed' ? 'departed' : f.status === 'final' ? 'final' : 'boarding', f.boardingTs);
  }
}

/* ---- flight state machine --------------------------------------------- */
function catchUpFlights(now: number, silent: boolean) {
  for (const f of sim.world.flights) {
    if (f.direction !== 'D') { if (now >= f.etdTs) f.status = 'landed'; continue; }
    if (f.status === 'cancelled') continue;
    const prev = f.status;
    if (now >= f.etdTs) f.status = 'departed';
    else if (now >= f.gateCloseTs) f.status = 'final';
    else if (now >= f.boardingTs) f.status = 'boarding';
    else if (f.delayMin >= 15) f.status = 'delayed';
    else f.status = 'scheduled';
    if (prev !== f.status && !silent) {
      const kind = f.status === 'boarding' ? 'boarding'
        : f.status === 'final' ? 'final'
          : f.status === 'departed' ? 'departed' : 'status';
      emitAidx(f, kind, now);
      if (f.status === 'departed') f.aobt = now;
    }
  }
}

function emitAidx(f: Flight, kind: string, at: number, detail?: unknown): FlightEvent {
  const ev = sim.adapters!.flight.emit(f, kind, at, detail) as FlightEvent;
  store.flightEvent(f.id, kind, at, ev.raw);   // audit; never stalls the feed
  bus.emit('aidx', ev);
  return ev;
}

/* ---- ACRIS sweep ------------------------------------------------------ */
function publishAcris(now: number) {
  const r = rngFrom(Math.floor(now / (5 * MIN)));
  for (const z of sim.world.zones) {
    const p = zonePresence(sim.world, z, now, null);
    const people = Math.max(0, Math.round(p.pax * between(r, 0.86, 1.14) + between(r, 6, 42)));
    const waitSec = Math.round(between(r, z.kind === 'control' ? 120 : 60, z.kind === 'control' ? 900 : 420));
    const entity = sim.adapters!.zone.publish(z.id, people, waitSec, now);
    store.queueMeasurement(z.id, people, waitSec, now, JSON.stringify(entity));
  }
  bus.emit('acris', { at: now });
}

/* ---- decisions -------------------------------------------------------- */
export function watchScreen(id: string) { sim.watched.add(id); }
export function unwatchScreen(id: string) { sim.watched.delete(id); }

/** Full decisions run for the screens on show plus a rotating sample, so the
 *  decision log is real without recomputing 178 screens every slot. */
function rebuildDecisions(full = false) {
  const screens = sim.world.screens;
  const ids = new Set(sim.watched);
  const sample = full ? 26 : 7;
  for (let i = 0; i < sample; i++) ids.add(screens[(sim.slotCursor + i * 7) % screens.length].id);
  sim.slotCursor = (sim.slotCursor + sample * 7) % screens.length;

  for (const id of ids) {
    const screen = screens.find(s => s.id === id);
    if (!screen || screen.status === 'offline') continue;
    const d = decide(sim.world, sim.adapters, sim.state, screen, sim.now);
    const prev = sim.state.currentByScreen[id];
    sim.state.currentByScreen[id] = d;
    if (d.winner && (!prev?.winner || prev.winner.campaignId !== d.winner.campaignId)) recordPlay(screen, d);
    // One row per screen per instant. While the clock is paused the same slot
    // can be recomputed repeatedly, and the log should not grow for it.
    if (!sim.state.decisionLog.some(x => x.screenId === id && x.at === d.at)) {
      sim.state.decisionLog.unshift(d);
      persistDecision(d);
    }
  }
  if (sim.state.decisionLog.length > 300) sim.state.decisionLog.length = 300;
  bus.emit('decision', { at: sim.now, screens: [...ids] });
}

let persistBudget = 0;
function persistDecision(d: Decision) {
  // one in eight, so the log is representative without hammering SQLite at 60x
  if (persistBudget++ % 8 !== 0) return;
  store.decision(d);
}

function recordPlay(screen: Screen, d: Decision) {
  const c = d.winnerCampaign;
  if (!c) return;
  const key = screen.id;
  (sim.state.playsByScreen[key] ||= []).push({ at: sim.now, campaignId: c.id, category: c.category });
  if (sim.state.playsByScreen[key].length > 40) sim.state.playsByScreen[key].shift();

  screen.playsToday++; screen.lastPlay = sim.now;
  const impressions = Math.max(1, Math.round((d.crowdNow ?? 0) * 0.42));
  const money = round2((impressions / 1000) * c.cpm);
  const b = sim.state.byCampaign[c.id];
  b.plays++; b.impressions += impressions; b.revenue = round2(b.revenue + money);
  c.spent = round2(c.spent + money);
  screen.impressionsToday += impressions;
  sim.state.metrics.plays++;
  sim.state.metrics.impressions += impressions;
  sim.state.metrics.revenue = round2(sim.state.metrics.revenue + money);
  if (c.outletId && sim.state.byOutlet[c.outletId]) sim.state.byOutlet[c.outletId].impressions += impressions;
  store.impression(c.id, screen.id, sim.now, impressions);
  bus.emit('play', { screenId: screen.id, campaignId: c.id, advertiser: c.advertiser, at: sim.now });
}

/* ---- scans, redemptions, and the learning loop ------------------------ */
export function recordScan(campaignId: string, screenId: string | null, segment: string) {
  const b = sim.state.byCampaign[campaignId];
  if (!b) return;
  b.scans++; sim.state.metrics.scans++;
  const c = sim.world.campaigns.find(x => x.id === campaignId);
  if (c?.outletId && sim.state.byOutlet[c.outletId]) sim.state.byOutlet[c.outletId].scans++;
  bus.emit('scan', { campaignId, screenId, segment });
}

export function recordRedemption(
  campaignId: string, screenId: string | null,
  opts: { via?: string; code?: string; segment?: string; value?: number } = {}
) {
  const c = sim.world.campaigns.find(x => x.id === campaignId);
  if (!c) return null;
  const b = sim.state.byCampaign[campaignId];
  const value = opts.value ?? round2(between(rngFrom(sim.now), 12, 48));
  b.redemptions++; sim.state.metrics.redemptions++;
  if (c.outletId && sim.state.byOutlet[c.outletId]) {
    const o = sim.state.byOutlet[c.outletId];
    o.redemptions++; o.revenue = round2(o.revenue + value);
  }
  const promo = sim.world.promos.find(p => p.campaignId === campaignId);
  if (promo) promo.redemptions++;

  // the model learns: measured conversion moves the campaign's index, which
  // changes the lift term in the very next decision
  const observed = b.scans ? b.redemptions / b.scans : 0;
  c.cvrIndex = round2(Math.max(0.5, Math.min(1.9, c.cvrIndex * 0.995 + observed * 0.9)));

  const rec = {
    at: sim.now, campaignId, screenId, advertiser: c.advertiser, outletId: c.outletId,
    value, segment: opts.segment ?? 'unknown', code: opts.code ?? promo?.code ?? '', via: opts.via ?? 'qr'
  };
  sim.state.redemptions.unshift(rec);
  if (sim.state.redemptions.length > 200) sim.state.redemptions.pop();

  store.redemption(rec);
  if (promo) store.promoRedemptions(promo.code, promo.redemptions);
  store.campaignMetrics(c.id, c.cvrIndex, c.spent);

  bus.emit('redemption', rec);
  return rec;
}

/* ---- delay goodwill automation ---------------------------------------- */
function checkGoodwill(now: number) {
  for (const f of sim.world.flights) {
    if (f.direction !== 'D' || f.delayMin < 60 || f.status === 'departed') continue;
    if (sim.state.goodwill.some(g => g.flightId === f.id)) continue;
    const al = AIRLINES.find(a => a.code === f.airlineCode)!;
    const partner = sim.world.outlets.find(o => o.category === 'coffee' && o.nearGates.includes(f.gate))
      ?? sim.world.outlets.find(o => o.category === 'coffee')!;
    const g = {
      id: 'GW-' + String(sim.state.goodwill.length + 1).padStart(3, '0'),
      flightId: f.id, airline: al.name, airlineCode: f.airlineCode, gate: f.gate,
      delayMin: f.delayMin, pax: f.pax, at: now,
      voucher: f.delayMin >= 120 ? 'Lounge pass' : 'Meal voucher €12',
      partner: partner.name, coFund: f.delayMin >= 120 ? '60 / 40' : '50 / 50',
      cost: round2(f.pax * (f.delayMin >= 120 ? 4.2 : 2.6)), status: 'auto-pushed'
    };
    sim.state.goodwill.unshift(g);
    bus.emit('goodwill', g);
  }
}

/* ---- incidents -------------------------------------------------------- */
export function raiseIncident(o: Partial<Incident> & { title: string; detail: string }) {
  const inc: Incident = {
    id: 'INC-' + String(++incidentSeq).padStart(4, '0'),
    at: sim.now, status: 'open', owner: 'Network Ops', severity: 'minor',
    kind: 'generic', ref: '', ...o
  } as Incident;
  sim.state.incidents.unshift(inc);
  if (sim.state.incidents.length > 60) sim.state.incidents.pop();
  store.incidentInsert(inc);
  bus.emit('incident', inc);
  return inc;
}

function checkScreenHealth(now: number) {
  for (const s of sim.world.screens) {
    if (s.status !== 'offline' || !s.offlineSince) continue;
    if (now - s.offlineSince <= 5 * MIN) continue;
    if (sim.state.incidents.some(i => i.ref === s.id && i.status !== 'resolved')) continue;
    raiseIncident({
      severity: 'critical', kind: 'screen-offline', ref: s.id,
      title: `${s.name} offline > 5 min`,
      detail: `No heartbeat since ${hhmm(s.offlineSince)}. Inventory released back to the pool.`,
      owner: `Field Tech · ${s.terminal}`
    });
  }
}

/* ---- the clock -------------------------------------------------------- */
function tick() {
  const realNow = Date.now();
  const dtReal = Math.min(600, realNow - sim.lastReal);
  sim.lastReal = realNow;
  if (sim.playing) sim.now += dtReal * sim.speed;
  if (sim.now > DAY_END) { sim.now = DAY_END; sim.playing = false; }

  const minute = Math.floor(sim.now / MIN);
  if (minute !== sim.lastMinute) {
    const first = sim.lastMinute === -1;
    sim.lastMinute = minute;
    catchUpFlights(sim.now, first);
    if (minute % ENGINE.windowMinutes === 0) publishAcris(sim.now);
    checkGoodwill(sim.now);
    checkScreenHealth(sim.now);
  }
  rebuildDecisions(false);
  bus.emit('tick', { now: sim.now, playing: sim.playing, speed: sim.speed });
  sim.timer = setTimeout(tick, 500);
}

function start() { sim.lastReal = Date.now(); if (!sim.timer) tick(); }
export function stop() { if (sim.timer) { clearTimeout(sim.timer); sim.timer = null; } }

/** Back to the opening state: the seeded day, the opening clock, no injected
 *  events and no live counters. Injections are destructive by design, so the
 *  demo needs a way home. */
export async function resetSim(reload: () => World | Promise<World>, reseed?: () => void) {
  stop();
  // Injections are written through to the database, so a reload alone would
  // restore the mutated day. Regenerate it from the seed instead.
  reseed?.();
  const world = await reload();
  sim.now = DEMO_TIME;
  sim.playing = false;
  sim.speed = 10;
  sim.lastMinute = -1;
  sim.slotCursor = 0;
  sim.state.playsByScreen = {};
  sim.state.gateChanges = {};
  sim.state.currentByScreen = {};
  sim.state.decisionLog = [];
  sim.state.redemptions = [];
  sim.state.goodwill = [];
  await initSim(world);
  bus.emit('injection', { title: 'Simulation reset', detail: 'Back to the seeded day at ' + hhmm(DEMO_TIME), at: sim.now });
  return transport();
}

export function play() { sim.playing = true; sim.lastReal = Date.now(); bus.emit('transport', transport()); }
export function pause() { sim.playing = false; bus.emit('transport', transport()); }
export function setSpeed(s: number) { sim.speed = s; bus.emit('transport', transport()); }
export function jumpTo(ts: number) {
  sim.now = Math.max(DAY_START, Math.min(DAY_END, ts));
  sim.lastMinute = -1;
  catchUpFlights(sim.now, true);
  publishAcris(sim.now);
  sim.state.currentByScreen = {};
  rebuildDecisions(true);
  bus.emit('transport', transport());
}
export const transport = () => ({
  now: sim.now, playing: sim.playing, speed: sim.speed,
  dayStart: DAY_START, dayEnd: DAY_END, sceneTime: new Date('2026-10-24T14:10:00Z').getTime()
});

/* ---- event injection -------------------------------------------------- */
export function injectDelay(flightId: string, minutes: number) {
  const f = sim.world.flights.find(x => x.id === flightId);
  if (!f) return null;
  f.delayMin += minutes;
  f.etdTs += minutes * MIN;
  f.boardingTs = f.etdTs - 25 * MIN;
  f.gateCloseTs = f.etdTs - 10 * MIN;
  f.tobt = f.etdTs - 20 * MIN; f.tsat = f.etdTs - 15 * MIN;
  f.status = 'delayed';
  f.delayCode ||= '93';
  const ev = emitAidx(f, 'delay', sim.now);
  store.flightDelay(f.id, {
    delayMin: f.delayMin, etdTs: f.etdTs, boardingTs: f.boardingTs,
    gateCloseTs: f.gateCloseTs, status: f.status, delayCode: f.delayCode
  });
  afterInjection('Delay injected', `${f.id} is now ${f.delayMin} min late · new ETD ${hhmm(f.etdTs)}`);
  return ev;
}

export function injectGateChange(flightId: string, newGate: string) {
  const f = sim.world.flights.find(x => x.id === flightId);
  const g = sim.world.gates.find(x => x.id === String(newGate));
  if (!f || !g) return null;
  const from = f.gate;
  f.gate = g.id; f.stand = g.stand; f.zone = g.zone; f.terminal = g.terminal;
  sim.state.gateChanges[g.zone] = sim.now;
  const ev = emitAidx(f, 'gate', sim.now, { from });
  store.flightGate(f.id, g.id, g.stand, g.terminal);
  afterInjection('Gate change injected', `${f.id} moved from gate ${from} to gate ${g.id}`);
  return ev;
}

export function injectScreenOffline(screenId: string) {
  const s = sim.world.screens.find(x => x.id === screenId);
  if (!s) return null;
  if (s.status === 'offline') { s.status = 'online'; s.offlineSince = null; s.latencyMs = 62; }
  else { s.status = 'offline'; s.offlineSince = sim.now; s.latencyMs = 0; delete sim.state.currentByScreen[s.id]; }
  store.screenHealth(s.id, s.status, s.offlineSince, s.latencyMs);
  if (s.status === 'offline') {
    raiseIncident({
      severity: 'critical', kind: 'screen-offline', ref: s.id,
      title: `${s.name} stopped responding`,
      detail: `Heartbeat lost at ${hhmm(sim.now)}. Inventory for this screen released back to the pool.`,
      owner: `Field Tech · ${s.terminal}`
    });
  }
  afterInjection(s.status === 'offline' ? 'Screen taken offline' : 'Screen restored', `${s.name} is now ${s.status}`);
  return s;
}

function afterInjection(title: string, detail: string) {
  sim.state.currentByScreen = {};
  rebuildDecisions(true);
  bus.emit('injection', { title, detail, at: sim.now });
}

export { rebuildDecisions };
