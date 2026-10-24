/* Presence, crowd profile and the evidence-first decision pipeline. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
  World, Screen, Zone, Campaign, CrowdProfile, ZonePresence, Decision, CampaignScore
} from './types.js';
import { ENGINE, SEGMAP, CATEGORIES } from './reference.js';
import { MIN, HOUR, DAY_START, DAY_END, round2, hhmm } from './util.js';

/* =========================================================================
   44-engine.js · presence → crowd profile → decision
   Evidence-first: the scorer proposes, a deterministic verifier disposes.
   Nothing reaches a screen unless every input it cites exists in a trusted
   feed, is fresh, passes every hard rule, and the score recomputes.
   ========================================================================= */

/* ---- timing weights ---------------------------------------------------
   Passengers arrive for the time on their boarding pass, so the build-up
   follows the SCHEDULED boarding time (tS). They leave when the aircraft
   actually boards, so the tail follows the ACTUAL boarding time (tA).
   That is why a delay holds a crowd at the gate instead of dispersing it.
   Both are minutes from now; negative means the moment has passed. */
export function catchmentWeight(tS: number, tA?: number): number {
  if (tA == null) tA = tS;
  if (tA < -45) return 0;                 // boarded and gone
  if (tS > 150) return 0;                 // too far out to be at the gate
  if (tS > 90) return (150 - tS) / 60;    // starting to drift over
  if (tA >= -20) return 1;                // the flight owns the gate area
  return 0.25;                            // stragglers while it finishes boarding
}
export function presenceRamp(tS: number, tA?: number): number {
  if (tA == null) tA = tS;
  if (tA < -25) return 0;                             // aircraft has gone
  if (tS > 150) return 0;
  if (tS > 0) return Math.pow((150 - tS) / 150, 1.3); // arriving for the printed time
  if (tA >= 0) return 1;                              // waiting out a delay at the gate
  return 1 + (tA / 25) * 0.85;                        // filing down the airbridge
}

export const getPath = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);

/* =========================================================================
   Catchment: which flights are in front of this screen right now
   ========================================================================= */
export function screenCatchment(world, screen, now) {
  const out = [];
  for (const f of world.flights) {
    if (f.direction !== 'D') continue;
    if (f.status === 'departed' || f.status === 'cancelled') continue;
    if (!screen.nearGates.includes(f.gate)) continue;
    const t = (f.boardingTs - now) / MIN;
    const tS = ((f.schedBoardingTs || f.boardingTs) - now) / MIN;
    const w = catchmentWeight(tS, t);
    if (w <= 0) continue;
    out.push({ flight: f, t, tS, weight: w, pax: f.pax, mass: f.pax * w,
      present: Math.round(f.pax * presenceRamp(tS, t)) });
  }
  return out.sort((a, b) => a.t - b.t);
}

/* =========================================================================
   Crowd profile — aggregated shares only, never anything about a person
   ========================================================================= */
export function blendProfile(parts: any[]): CrowdProfile | null {
  const total = parts.reduce((s, p) => s + p.mass, 0);
  if (!total) return null;
  const P: any = {
    international: 0, domestic: 0,
    purpose: { holiday: 0, business: 0, vfr: 0, student: 0, religious: 0 },
    party: { solo: 0, couple: 0, family: 0, group: 0 },
    age: { u12: 0, a1217: 0, a1824: 0, a2534: 0, a3544: 0, a4554: 0, a55p: 0 },
    age2554: 0, premiumCabin: 0, frequentFlyer: 0,
    cabin: { economy: 0, premiumEconomy: 0, business: 0 },
    gender: { f: 0, m: 0 }, region: {}, nationalities: {}, languages: {}
  };
  parts.forEach(p => {
    const w = p.mass / total, pr = p.flight.profile;
    P.international += pr.international * w; P.domestic += pr.domestic * w;
    for (const k in P.purpose) P.purpose[k] += (pr.purpose[k] || 0) * w;
    for (const k in P.party) P.party[k] += (pr.party[k] || 0) * w;
    for (const k in P.age) P.age[k] += (pr.age[k] || 0) * w;
    for (const k in P.cabin) P.cabin[k] += (pr.cabin[k] || 0) * w;
    P.age2554 += pr.age2554 * w;
    P.premiumCabin += pr.premiumCabin * w;
    P.frequentFlyer += pr.frequentFlyer * w;
    P.gender.f += pr.gender.f * w;
    for (const k in pr.region) P.region[k] = (P.region[k] || 0) + pr.region[k] * w;
    (pr.nationalities || []).forEach(([n, v]) => { P.nationalities[n] = (P.nationalities[n] || 0) + v * w; });
    (pr.languages || []).forEach(([n, v]) => { P.languages[n] = (P.languages[n] || 0) + v * w; });
  });
  P.gender.m = 1 - P.gender.f;
  P.topNationalities = (Object.entries(P.nationalities) as Array<[string, number]>).sort((a, b) => b[1] - a[1]).slice(0, 3);
  P.topLanguages = (Object.entries(P.languages) as Array<[string, number]>).sort((a, b) => b[1] - a[1]).slice(0, 3);
  P.topDestinations = parts.map(p => [p.flight.destination, p.mass / total])
    .reduce((acc, [d, v]) => { acc[d] = (acc[d] || 0) + v; return acc; }, {});
  P.topDestinations = (Object.entries(P.topDestinations) as Array<[string, number]>).sort((a, b) => b[1] - a[1]).slice(0, 4);
  return P;
}

export function buildScreenProfile(world: World, screen: Screen, now: number, acris: any) {
  const parts = screenCatchment(world, screen, now);
  if (!parts.length) return { empty: true, crowdNow: 0, crowdNext30: 0, parts: [], profile: null, dwellMedian: 0, maxDelay: 0 };
  const profile = blendProfile(parts);
  const totalMass = parts.reduce((s, p) => s + p.mass, 0);
  const dwellMedian = Math.round(parts.reduce((s, p) => s + Math.max(0, p.t) * p.mass, 0) / totalMass);
  const crowdNow = parts.reduce((s, p) => s + p.present, 0);
  const crowdNext30 = parts.reduce((s, p) => s + Math.round(p.flight.pax * presenceRamp(p.tS - 30, p.t - 30)), 0);
  const maxDelay = parts.reduce((m, p) => Math.max(m, p.flight.delayMin || 0), 0);
  const queue = acris ? acris.read(screen.zone) : null;
  return {
    empty: false, parts, profile, dwellMedian, crowdNow, crowdNext30, maxDelay,
    queueMeasurement: queue,
    windowFrom: now, windowTo: now + ENGINE.windowMinutes * MIN
  };
}

/* ZonePresence: the derived signal every KPI and every decision uses ------
   Piers are fed by their own gates. Retail halls, check-in and security own
   no gates, so they are fed by every gate in the terminal, damped and shifted
   earlier: a passenger clears security long before the gate calls them.     */
export const ZONE_FACTOR = { pier: 1, airside: 0.42, control: 0.16, landside: 0.26 };
export const ZONE_LEAD   = { pier: 0, airside: 25, control: 75, landside: 110 };

export function zonePresence(world: World, zone: Zone, now: number, acris: any): ZonePresence {
  const gates = (zone.gates && zone.gates.length)
    ? zone.gates
    : world.gates.filter(g => g.terminal === zone.terminal).map(g => g.id);
  const gateSet = new Set(gates);
  const factor = ZONE_FACTOR[zone.kind] != null ? ZONE_FACTOR[zone.kind] : 0.3;
  const lead = ZONE_LEAD[zone.kind] || 0;

  const parts = [];
  for (const f of world.flights) {
    if (f.direction !== 'D' || f.status === 'departed' || f.status === 'cancelled') continue;
    if (!gateSet.has(f.gate)) continue;
    const tA = (f.boardingTs - now) / MIN - lead;
    const tS = ((f.schedBoardingTs || f.boardingTs) - now) / MIN - lead;
    const w = catchmentWeight(tS, tA);
    if (w <= 0) continue;
    parts.push({ flight: f, t: tA, tS, weight: w, mass: f.pax * w,
      present: Math.round(f.pax * presenceRamp(tS, tA) * factor) });
  }

  const queue = acris ? acris.read(zone.id) : null;
  const queueFresh = queue && Math.abs(now - queue.at) < 10 * MIN;
  const modelPax = parts.reduce((s, p) => s + p.present, 0);
  // the sensor reading corrects the model for the window it actually measured
  const pax = modelPax + (queueFresh ? Math.round(queue.people * 0.3) : 0);
  const next30 = parts.reduce((s, p) => s + Math.round(p.flight.pax * presenceRamp(p.tS - 30, p.t - 30) * factor), 0);

  const profile = parts.length ? blendProfile(parts) : null;
  const dwell = parts.length
    ? Math.round(parts.reduce((s, p) => s + Math.max(0, p.t) * p.mass, 0) / parts.reduce((s, p) => s + p.mass, 0))
    : (queue ? Math.round(queue.waitSec / 60) : 0);

  return {
    zoneId: zone.id, windowStart: now - (now % (ENGINE.windowMinutes * MIN)),
    windowMinutes: ENGINE.windowMinutes,
    pax, paxNext30: next30 + (queueFresh ? Math.round(queue.people * 0.3) : 0),
    international: profile ? profile.international : 0,
    dwellMedian: dwell, flights: parts.length, profile,
    sources: [
      { source: 'AODB', detail: parts.length + ' departures at gates feeding this zone', at: now },
      queueFresh ? { source: 'ACRIS', detail: 'QueueMeasurement peopleCount=' + queue.people, at: queue.at } : null
    ].filter(Boolean)
  };
}

/* =========================================================================
   Scoring
   match = weighted coverage of the crowd (noisy-OR over targeted segments)
   final = (match + learned lift) × trigger boost
   ========================================================================= */
export function segmentShare(profile, segId) {
  const seg = SEGMAP[segId];
  if (!seg) return 0;
  const v = getPath(profile, seg.path);
  return typeof v === 'number' ? v : 0;
}

export function scoreCampaign(campaign: Campaign, ctx: any): CampaignScore {
  const P = ctx.profile;
  const terms = [];
  let prod = 1;
  for (const [segId, w] of Object.entries(campaign.weights || {})) {
    const share = segmentShare(P, segId);
    const reach = w * share;
    prod *= (1 - reach);
    terms.push({
      segId, label: SEGMAP[segId] ? SEGMAP[segId].label : segId,
      weight: w, share, reach,
      index: SEGMAP[segId] && SEGMAP[segId].base ? share / SEGMAP[segId].base : null
    });
  }
  const coverage = 1 - prod;
  const match = coverage * ctx.confidence;

  // learned conversion lift — updated by real scans and redemptions
  const lift = Math.max(0, Math.min(ENGINE.conversionLiftCap,
    (campaign.cvrIndex - 1) * ENGINE.conversionLiftScale));

  // triggers
  let boost = 1; const firedTriggers = [];
  (campaign.triggers || []).forEach(tr => {
    let fired = false;
    if (tr.type === 'delay' && ctx.maxDelay >= tr.overMin) fired = true;
    if (tr.type === 'gateChange' && ctx.gateChanged) fired = true;
    if (tr.type === 'boarding' && ctx.boardingNow) fired = true;
    if (tr.type === 'festival' && ctx.festival) fired = true;
    if (fired) { boost = Math.max(boost, tr.boost); firedTriggers.push(tr); }
  });
  const boostMultiplier = 1 + (boost - 1) * ENGINE.triggerBoostWeight;
  const final = round2((match + lift) * boostMultiplier);

  return {
    campaignId: campaign.id, terms, coverage, match, lift, boost, boostMultiplier, final,
    firedTriggers,
    formula: '(' + (match * 100).toFixed(1) + '% + ' + lift.toFixed(3) + ') × ' +
      boostMultiplier.toFixed(3) + ' = ' + final.toFixed(2)
  };
}

/* =========================================================================
   Hard filters
   ========================================================================= */
export function hardFilter(campaign: Campaign, ctx: any): string[] {
  const h = campaign.hard || {}, fails = [];
  if (campaign.approval !== 'approved') fails.push('Creative not approved');
  if (campaign.status === 'paused') fails.push('Campaign paused');
  if (campaign.brandSafety !== 'passed') fails.push('Brand safety not cleared');
  if (campaign.spent >= campaign.budget) fails.push('Budget exhausted');
  if (campaign.dailyCap && campaign.spent >= campaign.dailyCap)
    fails.push('Daily cap reached (' + Math.round(campaign.spent) + ' of ' + campaign.dailyCap + ')');
  if (h.zones && h.zones.length && !h.zones.includes(ctx.screen.zone))
    fails.push('Not placed in ' + ctx.screen.zone);
  if (h.screens && h.screens.length && !h.screens.includes(ctx.screen.id))
    fails.push('Screen not in placement');
  if (h.internationalOnly && ctx.profile.international < 0.5)
    fails.push('International-only, crowd is ' + Math.round(ctx.profile.international * 100) + '% international');
  if (h.domesticOnly && ctx.profile.domestic < 0.5) fails.push('Domestic-only');
  if (h.region && !(ctx.profile.region[h.region] > 0.25))
    fails.push('Region ' + h.region + ' below 25% of crowd');
  if (h.minCrowd && ctx.crowdNow < h.minCrowd)
    fails.push('Crowd ' + ctx.crowdNow + ' below minimum ' + h.minCrowd);
  if (h.minDwell && ctx.dwellMedian < h.minDwell)
    fails.push('Dwell ' + ctx.dwellMedian + ' min below minimum ' + h.minDwell);
  if (h.hours) {
    const hr = new Date(ctx.now).getUTCHours();
    if (hr < h.hours[0] || hr >= h.hours[1]) fails.push('Outside hours ' + h.hours[0] + ':00–' + h.hours[1] + ':00');
  }
  if (campaign.schedule) {
    const hm = hhmm(ctx.now);
    if (hm < campaign.schedule.from || hm > campaign.schedule.to) fails.push('Outside campaign schedule');
  }
  if (h.stockPaused) fails.push('Paused: out of stock');
  return fails;
}

/* =========================================================================
   Business rules applied after scoring
   ========================================================================= */
export function applyBusinessRules(scored, ctx, state) {
  const log = [];
  scored.forEach(s => {
    const c = ctx.campaignById[s.campaignId];
    s.adjusted = s.final; s.rules = [];

    // 1. airline priority inside its own boarding window
    if (c.category === 'airline' && ctx.boardingFlight && c.airlineCode === ctx.boardingFlight.airlineCode) {
      s.adjusted = Math.min(1, s.adjusted + 0.25);
      s.rules.push({ rule: 'Airline priority', effect: '+0.25', why: c.advertiser + ' owns the boarding window at gate ' + ctx.boardingFlight.gate });
    }
    // 2. frequency cap per screen per hour
    const recent = (state.playsByScreen[ctx.screen.id] || []).filter(p => ctx.now - p.at < HOUR);
    const sameCount = recent.filter(p => p.campaignId === c.id).length;
    if (sameCount >= (c.frequencyCap || ENGINE.frequencyCapPerHour)) {
      s.excluded = 'Frequency cap: played ' + sameCount + '× this hour';
      s.adjusted = 0; s.rules.push({ rule: 'Frequency cap', effect: 'excluded', why: s.excluded });
    }
    // 3. competitor separation
    const lastPlays = recent.slice(-ENGINE.competitorSeparation);
    if (lastPlays.some(p => p.category === c.category && p.campaignId !== c.id)) {
      s.excluded = s.excluded || 'Competitor separation: another ' + (CATEGORIES[c.category] || {}).label + ' brand in the last ' + ENGINE.competitorSeparation + ' slots';
      s.adjusted = 0; s.rules.push({ rule: 'Competitor separation', effect: 'excluded', why: s.excluded });
    }
    // 4. budget pacing
    const pace = c.budget ? c.spent / c.budget : 0;
    const dayPace = Math.min(1, (ctx.now - DAY_START) / (DAY_END - DAY_START));
    if (pace > dayPace + 0.18) {
      s.adjusted = round2(s.adjusted * 0.85);
      s.rules.push({ rule: 'Budget pacing', effect: '×0.85', why: 'Spend is ahead of pace (' + Math.round(pace * 100) + '% of budget at ' + Math.round(dayPace * 100) + '% of day)' });
    }
    // 5. manual pin from the Media Manager
    if (c.pinned && (!c.pinnedScreens || c.pinnedScreens.includes(ctx.screen.id))) {
      s.adjusted = 1.0; s.pinned = true;
      s.rules.push({ rule: 'Manual pin', effect: 'forced', why: c.pinReason || 'Pinned by media manager' });
    }
  });
  return log;
}

/* =========================================================================
   Deterministic verification — the gate between a proposed ad and a screen
   ========================================================================= */
export function verifyDecision(proposal, ctx, world, adapters) {
  const checks = [];
  const fail = (name, detail) => { checks.push({ name, pass: false, detail }); };
  const pass = (name, detail) => { checks.push({ name, pass: true, detail }); };

  // 1. every cited flight exists in the AODB snapshot
  const known = new Set(world.flights.map(f => f.id));
  const citedOk = ctx.parts.every(p => known.has(p.flight.id));
  citedOk ? pass('Inputs exist in a trusted feed', ctx.parts.length + ' flight legs resolved against the AODB snapshot')
    : fail('Inputs exist in a trusted feed', 'A cited flight leg is not in the AODB snapshot');

  // 2. freshness
  const ages = ctx.evidence.map(e => Math.round((ctx.now - e.at) / 1000));
  const stale = ctx.evidence.filter(e => (ctx.now - e.at) / 1000 > (ENGINE.freshness[e.sourceKey] || 900));
  stale.length ? fail('Every input is fresh', stale.map(s => s.source + ' is ' + Math.round((ctx.now - s.at) / 1000) + 's old').join('; '))
    : pass('Every input is fresh', 'oldest input ' + (ages.length ? Math.max.apply(null, ages) : 0) + 's');

  // 3. hard rules on the winner
  const refails = hardFilter(ctx.campaignById[proposal.campaignId], ctx);
  refails.length ? fail('Hard rules pass on re-check', refails.join('; '))
    : pass('Hard rules pass on re-check', Object.keys(ctx.campaignById[proposal.campaignId].hard || {}).length + ' conditions re-evaluated');

  // 4. score reproduces from the logged inputs
  const recomputed = scoreCampaign(ctx.campaignById[proposal.campaignId], ctx);
  const same = Math.abs(recomputed.final - proposal.final) < 0.0001;
  same ? pass('Score reproduces from logged inputs', 'recomputed ' + recomputed.final.toFixed(2))
    : fail('Score reproduces from logged inputs', 'recomputed ' + recomputed.final.toFixed(2) + ' ≠ proposed ' + proposal.final.toFixed(2));

  // 5. creative is approved and renderable
  const cre = world.creatives.find(c => c.campaignId === proposal.campaignId);
  cre && cre.approval === 'approved' ? pass('Creative approved and renderable', cre.id + ' · ' + cre.template)
    : fail('Creative approved and renderable', 'creative missing or unapproved');

  return { checks, ok: checks.every(c => c.pass) };
}

/* =========================================================================
   The decision: run per screen, per slot
   ========================================================================= */
export function decide(world: World, adapters: any, state: any, screen: Screen, now: number): Decision {
  const ctx = buildScreenProfile(world, screen, now, adapters.zone);
  const campaignById = Object.fromEntries(world.campaigns.map(c => [c.id, c]));

  if (ctx.empty) {
    return {
      screenId: screen.id, at: now, empty: true, winner: null, fallback: true,
      reason: 'No flight is within the catchment window for this screen',
      candidates: [], filtered: [], verification: { checks: [], ok: true }, evidence: []
    };
  }

  const boardingFlight = ctx.parts.find(p => p.t <= 0 && p.t > -25);
  const evidence = [
    ...ctx.parts.map(p => ({
      source: 'AODB/AIDX', sourceKey: 'aidx',
      ref: p.flight.id, at: now - 20000,
      detail: p.flight.id + ' → ' + p.flight.destination + ' · gate ' + p.flight.gate +
        ' · ' + p.flight.pax + ' pax · ' + (p.flight.delayMin ? 'delayed ' + p.flight.delayMin + ' min' : 'on time') +
        ' · boards ' + hhmm(p.flight.boardingTs)
    })),
    ctx.queueMeasurement ? {
      source: 'ACRIS', sourceKey: 'acris', ref: screen.zone, at: ctx.queueMeasurement.at,
      detail: 'QueueMeasurement peopleCount=' + ctx.queueMeasurement.people +
        ' averageWaitingTime=' + ctx.queueMeasurement.waitSec + 's'
    } : null,
    {
      source: 'Screen telemetry', sourceKey: 'telemetry', ref: screen.id, at: now - 5000,
      detail: screen.id + ' ' + screen.status + ' · ' + screen.latencyMs + ' ms · ' + screen.playsToday + ' plays today'
    }
  ].filter(Boolean);

  const full = Object.assign({}, ctx, {
    screen, now, campaignById, evidence, boardingFlight: boardingFlight && boardingFlight.flight,
    boardingNow: !!boardingFlight, gateChanged: !!state.gateChanges[screen.zone],
    festival: state.festival, confidence: 1
  });
  full.profile = ctx.profile;

  // confidence from feed freshness
  const oldest = Math.max.apply(null, evidence.map(e => (now - e.at) / 1000));
  full.confidence = oldest > 600 ? 0.8 : 1;

  /* --- 1. filter --------------------------------------------------------- */
  const filtered = [], eligible = [];
  world.campaigns.forEach(c => {
    const fails = hardFilter(c, full);
    if (fails.length) filtered.push({ campaignId: c.id, name: c.name, advertiser: c.advertiser, reasons: fails });
    else eligible.push(c);
  });

  /* --- 2. score ---------------------------------------------------------- */
  const scored = eligible.map(c => scoreCampaign(c, full));

  /* --- 3. business rules ------------------------------------------------- */
  applyBusinessRules(scored, full, state);

  /* --- 4. choose --------------------------------------------------------- */
  scored.sort((a, b) => b.adjusted - a.adjusted);
  // every filtered campaign still gets a transparency score (what it would have scored)
  const filteredScored = filtered.map(f => {
    const s = scoreCampaign(campaignById[f.campaignId], full);
    return Object.assign({}, f, { match: s.match, final: s.final, terms: s.terms });
  });

  let winner = scored.find(s => !s.excluded) || null;
  let fallback = false, fallbackReason = null, verification = { checks: [], ok: true };

  if (winner) {
    verification = verifyDecision(winner, full, world, adapters);
    if (!verification.ok) {
      fallback = true;
      fallbackReason = 'Verification failed: ' + verification.checks.filter(c => !c.pass).map(c => c.name).join(', ');
      // rule-based default: highest priority approved campaign placed here with budget left
      const def = eligible.filter(c => c.approval === 'approved' && c.spent < c.budget)
        .sort((a, b) => (a.priority - b.priority) || (b.cpm - a.cpm))[0];
      winner = def ? scored.find(s => s.campaignId === def.id) || scoreCampaign(def, full) : null;
    }
  } else {
    fallback = true;
    fallbackReason = 'No campaign passed the hard rules for this screen';
  }

  const c = winner ? campaignById[winner.campaignId] : null;
  const rule = !winner ? 'No eligible campaign — screen shows airport content'
    : winner.pinned ? 'Manual pin by media manager'
      : winner.firedTriggers && winner.firedTriggers.length
        ? winner.firedTriggers[0].label + ' → ×' + winner.boost + ' boost'
        : (winner.rules || []).find(r => r.rule === 'Airline priority')
          ? 'Airline priority in own boarding window'
          : 'Highest audience match for this crowd';

  return {
    id: screen.id + '@' + now,
    screenId: screen.id, screenName: screen.name, zone: screen.zone, at: now,
    empty: false, crowdNow: ctx.crowdNow, crowdNext30: ctx.crowdNext30,
    dwellMedian: ctx.dwellMedian, maxDelay: ctx.maxDelay,
    profile: ctx.profile, parts: ctx.parts.map(p => ({
      id: p.flight.id, dest: p.flight.destination, gate: p.flight.gate, pax: p.flight.pax,
      delay: p.flight.delayMin, t: Math.round(p.t), weight: round2(p.weight), present: p.present
    })),
    winner, winnerCampaign: c, rule, candidates: scored.slice(0, 6), filtered: filteredScored,
    fallback, fallbackReason, verification, evidence, confidence: full.confidence,
    modelVersion: ENGINE.version
  };
}

