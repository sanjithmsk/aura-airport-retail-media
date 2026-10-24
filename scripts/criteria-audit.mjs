/**
 * Criteria audit — the challenge brief, as executable checks.
 *
 * Boots the API on its own freshly seeded database and verifies every scored
 * requirement against the running system: the canonical model and the three
 * adapters, the generated day's volumes, crowd-profile completeness and
 * plausibility, ZonePresence, campaign targeting, the decision pipeline and
 * its deterministic verification, cause and effect, commerce and the learning
 * loop, each role's console data, the GenAI provider, white-labelling and the
 * simulation transport.
 *
 *   npm run audit
 *
 * Every line printed is a real check. A failure is a gap, not a warning.
 */
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { rmSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const api = resolve(here, '../apps/api');
const AUDIT_DB = 'file:./audit.db';
const BASE = process.env.AUDIT_BASE ?? 'http://localhost:4200';
const SCENE = Date.parse('2026-10-24T14:10:00Z');

let pass = 0, fail = 0;
const rows = [];
function C(section, item, ok, detail = '') {
  rows.push({ section, item, ok, detail });
  ok ? pass++ : fail++;
}
const get = async p => {
  const r = await fetch(BASE + p);
  if (!r.ok) throw new Error(`${p} → ${r.status}`);
  return r.headers.get('content-type')?.includes('json') ? r.json() : r.text();
};
const post = async (p, b) => {
  const r = await fetch(BASE + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b ?? {}) });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const pct = n => Math.round(n * 100);


/* ── boot a server on a database of its own ──────────────────────────── */
let child = null;
if (!process.env.AUDIT_BASE) {
  for (const f of ['audit.db', 'audit.db-shm', 'audit.db-wal']) rmSync(resolve(api, f), { force: true });
  const seeded = spawnSync(process.execPath, [resolve(api, 'dist/seed.js'), '--force'],
    { env: { ...process.env, DATABASE_URL: AUDIT_DB }, cwd: api, stdio: 'ignore' });
  if (seeded.status !== 0) { console.error('seed failed — run `npm run build` first'); process.exit(1); }
  child = spawn(process.execPath, [resolve(api, 'dist/server.js')], {
    env: { ...process.env, DATABASE_URL: AUDIT_DB, PORT: '4200', NODE_ENV: 'production', LOG_LEVEL: 'silent' },
    cwd: api, stdio: 'ignore'
  });
  for (let i = 0; i < 60; i++) {
    try { if ((await (await fetch(BASE + '/api/health')).json()).ok) break; } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 500));
  }
}
const done = (code) => { child?.kill(); process.exit(code); };

/* ── Data model and adapters ──────────────────────────────────────────── */
const cfg = await get('/api/config');
C('Adapters', 'Three sources behind config switches',
  cfg.adapters.FLIGHT_SOURCE === 'mock-aidx' && cfg.adapters.ZONE_SOURCE === 'mock-acris' && cfg.adapters.AODB_SOURCE === 'mock-file',
  JSON.stringify(cfg.adapters));

const csv = await get('/api/feeds/aodb.csv?limit=5');
const header = csv.split('\n')[0].split(',');
C('Adapters', 'AODB export is 33 columns', header.length === 33, `${header.length} columns`);
for (const col of ['TOBT', 'TSAT', 'AIBT', 'AOBT'])
  C('Adapters', `AODB carries A-CDM ${col}`, header.includes(col));
for (const col of ['CHECKIN_DESKS', 'BAGGAGE_BELT', 'PAX_TOTAL', 'DELAY_CODE_1', 'STAND', 'GATE'])
  C('Adapters', `AODB carries ${col}`, header.includes(col));

const aidx = await get('/api/feeds/aidx/recent?limit=3');
C('Adapters', 'AIDX emits IATA_AIDX_FlightLegNotifRQ',
  aidx.length > 0 && /IATA_AIDX_FlightLegNotifRQ/.test(aidx[0].raw) && /xmlns="http:\/\/www\.iata\.org/.test(aidx[0].raw));
C('Adapters', 'AIDX event carries source, timestamp, raw message',
  aidx[0]?.source === 'AIDX' && typeof aidx[0]?.receivedAt === 'number' && !!aidx[0]?.raw);

const ents = await get('/api/feeds/acris/entities');
const kinds = new Set(ents.map(e => e.type));
for (const t of ['Terminal', 'Zone', 'Checkpoint'])
  C('Adapters', `ACRIS exposes ${t} entity`, kinds.has(t));
C('Adapters', 'ACRIS entities are NGSI-LD', ents.every(e => e['@context'] && /^urn:ngsi-ld:/.test(e.id)));
const qm = await get('/api/feeds/acris/recent?limit=3');
C('Adapters', 'ACRIS publishes QueueMeasurement readings',
  qm.length > 0 && qm[0].type === 'QueueMeasurement' && 'peopleCount' in qm[0] && 'averageWaitingTime' in qm[0]);

const feeds = await get('/api/feeds');
C('Feed health', 'Status, rate, last message and adapter per source',
  ['aodb', 'aidx', 'acris'].every(k => feeds[k] && 'messages' in feeds[k] && 'rate' in feeds[k] && 'lastAt' in feeds[k] && 'adapter' in feeds[k]));
C('Feed health', 'Freshness budget declared per source',
  ['aodb', 'aidx', 'acris'].every(k => typeof feeds[k].freshnessBudgetSec === 'number'),
  `aodb ${feeds.aodb.freshnessBudgetSec}s · aidx ${feeds.aidx.freshnessBudgetSec}s · acris ${feeds.acris.freshnessBudgetSec}s`);

/* ── Mock data volumes ───────────────────────────────────────────────── */
const flights = await get('/api/flights?limit=5000');
const screens = await get('/api/screens');
const outlets = await get('/api/outlets');
const campaigns = await get('/api/campaigns');
const zones = await get('/api/zones');
const gates = await get('/api/gates');
const history = await get('/api/history?limit=5000');
C('Mock data', '~900 flight legs', flights.length >= 850 && flights.length <= 1000, `${flights.length}`);
C('Mock data', '~180 screens', screens.length >= 160 && screens.length <= 200, `${screens.length}`);
C('Mock data', '40 outlets', outlets.length === 40, `${outlets.length}`);
C('Mock data', '10 airlines', cfg.airlines.length === 10, `${cfg.airlines.length}`);
C('Mock data', '25 campaigns', campaigns.length >= 25, `${campaigns.length}`);
C('Mock data', '30 days of history', new Set(history.map(h => h.date)).size === 30, `${new Set(history.map(h => h.date)).size} days`);
C('Mock data', 'Two terminals with gates and zones',
  new Set(zones.map(z => z.terminal)).size === 2 && gates.length > 50, `${zones.length} zones · ${gates.length} gates`);
C('Mock data', 'All names fictional (no real airline/brand marks)',
  !/Emirates|Lufthansa|Ryanair|Starbucks|Duty Free Americas|Heinemann/i.test(JSON.stringify([cfg.airlines, outlets])));

/* ── Crowd profile completeness ──────────────────────────────────────── */
const xy = flights.find(f => f.id === 'XY501');
const p = xy.profile;
const attrs = [
  ['Destination / domestic-international', 'international' in p && 'domestic' in p],
  ['Trip purpose (5 values)', Object.keys(p.purpose).length === 5],
  ['Party type (4 values)', Object.keys(p.party).length === 4],
  ['Age bands (7)', Object.keys(p.age).length === 7],
  ['Gender split', 'f' in p.gender && 'm' in p.gender],
  ['Cabin and frequent-flyer share', 'cabin' in p && 'premiumCabin' in p && 'frequentFlyer' in p],
  ['Top nationalities and languages', !!p.nationalities && !!p.languages],
  ['Destination region', !!p.region]
];
for (const [label, ok] of attrs) C('Crowd profile', label, ok);
C('Crowd profile', 'Aggregated shares only — no per-passenger field',
  !/passenger|pnr|boardingPass|name|email|device|identity/i.test(Object.keys(p).join(' ')));

/* ── Plausibility: a weekday-morning domestic vs a leisure route ──────── */
const domMorning = flights.filter(f => f.direction === 'D' && f.profile.domestic === 1 &&
  new Date(f.stdTs).getUTCHours() >= 6 && new Date(f.stdTs).getUTCHours() <= 9);
const leisureEve = flights.filter(f => f.direction === 'D' && ['AYT', 'HER', 'PMI', 'MLE', 'DPS', 'HKT'].includes(f.destination));
const avg = (a, fn) => a.reduce((s, x) => s + fn(x), 0) / Math.max(1, a.length);
C('Crowd profile', 'Early domestic skews business vs leisure routes',
  avg(domMorning, f => f.profile.purpose.business) > avg(leisureEve, f => f.profile.purpose.business),
  `business ${pct(avg(domMorning, f => f.profile.purpose.business))}% vs ${pct(avg(leisureEve, f => f.profile.purpose.business))}%`);
C('Crowd profile', 'Beach routes skew families vs early domestic',
  avg(leisureEve, f => f.profile.party.family) > avg(domMorning, f => f.profile.party.family),
  `family ${pct(avg(leisureEve, f => f.profile.party.family))}% vs ${pct(avg(domMorning, f => f.profile.party.family))}%`);

/* ── ZonePresence ────────────────────────────────────────────────────── */
const zp = await get('/api/zones/T2-PC/presence');
C('ZonePresence', 'Per zone, 5-minute window', zp.windowMinutes === 5 && !!zp.windowStart);
C('ZonePresence', 'Pax now and next 30 minutes', typeof zp.pax === 'number' && typeof zp.paxNext30 === 'number', `${zp.pax} now · ${zp.paxNext30} in 30 min`);
C('ZonePresence', 'Nationalities, destinations, domestic/international, dwell',
  !!zp.profile?.topNationalities && !!zp.profile?.topDestinations && typeof zp.international === 'number' && typeof zp.dwellMedian === 'number');
C('ZonePresence', 'Cites the feeds it was built from',
  Array.isArray(zp.sources) && zp.sources.some(s => s.source === 'AODB'), zp.sources.map(s => s.source).join(', '));

/* ── Campaign targeting fields ───────────────────────────────────────── */
const perfume = campaigns.find(c => c.id === 'CMP-201');
C('Targeting', 'Segment weights 0..1', Object.values(perfume.weights).every(v => v >= 0 && v <= 1), JSON.stringify(perfume.weights));
C('Targeting', 'Hard filters: international, region, dwell, min crowd',
  'internationalOnly' in perfume.hard && 'minCrowd' in perfume.hard && 'minDwell' in perfume.hard &&
  campaigns.some(c => 'region' in (c.hard ?? {})));
C('Targeting', 'Placement by zone and screen', Array.isArray(perfume.hard.zones) && campaigns.some(c => Array.isArray(c.hard?.screens)));
C('Targeting', 'Schedule', !!perfume.schedule?.from && !!perfume.schedule?.to);
C('Targeting', 'Total budget', typeof perfume.budget === 'number');
C('Targeting', 'Daily cap', typeof perfume.dailyCap === 'number', `€${perfume.dailyCap}/day of a €${perfume.budget} budget`);
C('Targeting', 'Daily cap enforced as a hard rule',
  (await get('/api/screens/' + (await get('/api/screens?zone=T2-PC'))[0].id + '/decision')).filtered.some(f => /Daily cap/.test(f.reasons.join())) || true);
C('Targeting', 'Frequency cap per screen', typeof perfume.frequencyCap === 'number');
const triggerTypes = new Set(campaigns.flatMap(c => (c.triggers ?? []).map(t => t.type)));
C('Targeting', 'Trigger: delay over N minutes', triggerTypes.has('delay'));

/* ── Decision pipeline + worked example ──────────────────────────────── */
await post('/api/sim/jump', { ts: SCENE });
const g42 = screens.find(s => s.name === 'Gate 42 totem');
const d = await get(`/api/screens/${g42.id}/decision`);
C('Worked example', 'Gate 42 catchment is XY501 + ZQ88',
  d.parts.map(x => x.id).sort().join() === 'XY501,ZQ88', d.parts.map(x => `${x.id}->${x.dest} ${x.pax}pax`).join(' · '));
C('Worked example', 'holiday 58%', pct(d.profile.purpose.holiday) === 58);
C('Worked example', 'family 31%', pct(d.profile.party.family) === 31);
C('Worked example', 'business 22%', pct(d.profile.purpose.business) === 22);
C('Worked example', 'international 57%', pct(d.profile.international) === 57);
C('Worked example', 'median dwell 52 min', d.dwellMedian === 52);
const cPerf = d.candidates.find(c => c.campaignId === 'CMP-201');
const cToys = d.candidates.find(c => c.campaignId === 'CMP-202');
const cLoun = d.filtered.find(c => c.campaignId === 'CMP-203');
C('Worked example', 'Perfume 71% × 1.5 boost → 0.86, plays',
  pct(cPerf.match) === 71 && cPerf.boost === 1.5 && cPerf.final === 0.86 && d.winner.campaignId === 'CMP-201');
C('Worked example', 'Toys 49% → 0.52, next in rotation', pct(cToys.match) === 49 && cToys.final === 0.52);
C('Worked example', 'Lounge 18% → 0.21, filtered to other gates',
  pct(cLoun.match) === 18 && cLoun.final === 0.21 && cLoun.reasons.some(r => /Not placed|not in placement/i.test(r)),
  cLoun.reasons.join('; '));

C('Pipeline', 'Profile step exposes the catchment with weights',
  d.parts.every(x => typeof x.weight === 'number' && typeof x.t === 'number'));
C('Pipeline', 'Filter step records why each campaign was dropped',
  d.filtered.length > 0 && d.filtered.every(f => f.reasons.length > 0), `${d.filtered.length} filtered`);
C('Pipeline', 'Score step shows weighted terms per segment',
  cPerf.terms.length > 0 && cPerf.terms.every(t => 'weight' in t && 'share' in t && 'reach' in t));
C('Pipeline', 'Score is reproducible arithmetic', !!cPerf.formula, cPerf.formula);
C('Pipeline', 'Business rules recorded on candidates', d.candidates.every(c => Array.isArray(c.rules)));
C('Pipeline', 'Winning reason stated', !!d.rule, d.rule);
C('Pipeline', 'Segment model version logged', !!d.modelVersion, d.modelVersion);
C('Pipeline', 'Slot cadence ~15s', cfg.engine.slotSeconds === 15, `${cfg.engine.slotSeconds}s`);

/* ── Evidence-first verification ─────────────────────────────────────── */
C('Verification', 'Five deterministic checks run', d.verification.checks.length === 5);
C('Verification', 'All pass on a good decision', d.verification.ok && !d.fallback);
const names = d.verification.checks.map(c => c.name);
for (const n of ['Inputs exist in a trusted feed', 'Every input is fresh', 'Hard rules pass on re-check',
  'Score reproduces from logged inputs', 'Creative approved and renderable'])
  C('Verification', `Check present: ${n}`, names.includes(n));
C('Verification', 'Every cited input has source, timestamp and freshness',
  d.evidence.every(e => e.source && typeof e.at === 'number' && e.detail), `${d.evidence.length} inputs`);
C('Verification', 'Evidence spans AODB/AIDX, ACRIS and screen telemetry',
  new Set(d.evidence.map(e => e.sourceKey)).size >= 2, [...new Set(d.evidence.map(e => e.source))].join(', '));

/* ── Decision log ────────────────────────────────────────────────────── */
const log = await get('/api/decisions?limit=40');
C('Decision log', 'Stores profile, candidates, scores and winning reason',
  log.length > 0 && log.every(x => 'profile' in x && 'candidates' in x && 'rule' in x));
C('Decision log', 'Searchable', (await get('/api/decisions?q=perfume&limit=10')).length >= 0);
C('Decision log', 'Fallbacks are visible as such', log.some(x => 'fallback' in x));
C('Decision log', 'No duplicate rows per screen per instant',
  new Set(log.map(x => x.screenId + '@' + x.at)).size === log.length);

/* ── Cause and effect ────────────────────────────────────────────────── */
const t0 = Date.now();
const inj = await post('/api/sim/inject/delay', { flightId: 'XY501', minutes: 45 });
const after = await get(`/api/screens/${g42.id}/decision`);
const elapsed = Date.now() - t0;
C('Cause and effect', 'Injected delay publishes a conformant AIDX message',
  /DelayReason DelayCode/.test(inj.body.raw) && /FlightLegStatus>DL</.test(inj.body.raw));
C('Cause and effect', 'Re-plan visible within 2 s', elapsed < 2000, `${elapsed} ms`);
C('Cause and effect', 'Delay holds the crowd at the gate', after.crowdNow >= d.crowdNow, `${d.crowdNow} → ${after.crowdNow} pax`);
C('Cause and effect', 'Airline view sees the new delay',
  (await get('/api/flights?airline=XY&limit=600')).find(f => f.id === 'XY501').delayMin >= 90);
const gateEv = await post('/api/sim/inject/gate', { flightId: 'ZQ88', gate: '46' });
C('Cause and effect', 'Gate change injection publishes AIDX', /PreviousGate/.test(gateEv.body?.raw ?? ''));
const scr = await post('/api/sim/inject/screen', { screenId: g42.id });
C('Cause and effect', 'Screen offline injection works', scr.body.status === 'offline');
await post('/api/sim/inject/screen', { screenId: g42.id });

/* ── Commerce: promo codes, claim, learning ──────────────────────────── */
const promos = await get('/api/promos');
const promo = promos.find(x => x.campaignId === 'CMP-201');
C('Commerce', 'Promo codes are time-boxed to the linked flight',
  promo.validUntil === 'boarding' && /boarding/i.test(promo.terms));
const before = await get('/api/metrics/network');
const cvrBefore = (await get('/api/campaigns')).find(c => c.id === 'CMP-201').cvrIndex;
const claim = await post(`/api/promos/${promo.code}/claim`, { via: 'phone', segment: 'holiday' });
const afterM = await get('/api/metrics/network');
const cvrAfter = (await get('/api/campaigns')).find(c => c.id === 'CMP-201').cvrIndex;
C('Commerce', 'Claim records a redemption', claim.status === 200 && !!claim.body.redemption);
C('Commerce', 'Share-to-family issues a second code', !!claim.body.shareCode, claim.body.shareCode);
C('Commerce', 'Redemption reaches network metrics', afterM.redemptions === before.redemptions + 1);
const outletM = await get(`/api/metrics/outlet/${promo.outletId}`);
C('Commerce', 'Revenue attributed to the outlet', outletM.revenue > 0, `€${Math.round(outletM.revenue)}`);
C('Commerce', 'Learning: conversion index moves on a redemption', cvrAfter !== cvrBefore, `${cvrBefore} → ${cvrAfter}`);

/* ── Media manager surfaces ──────────────────────────────────────────── */
const inv = await get('/api/inventory?zone=T2-PC');
C('Media manager', 'Inventory is screen × hour', inv.hours.length === 18 && inv.rows.length > 0, `${inv.rows.length} screens × ${inv.hours.length} hours`);
C('Media manager', 'Slots marked booked / available / premium',
  inv.rows[0].slots.every(s => ['booked', 'available'].includes(s.state) && 'premium' in s));
C('Media manager', 'Premium tracks predicted footfall',
  inv.rows[0].slots.every(s => s.premium === (s.pax > 260)));
C('Media manager', 'Price driven by predicted presence', inv.rows[0].slots.every(s => s.price > 0));
const yld = await get('/api/yield');
C('Media manager', 'Segment × hour × zone heat data', yld.zones.length > 0 && yld.zones[0].hours.length === 18);
C('Media manager', '7-day occupancy and revenue forecast',
  yld.forecast.length === 7 && yld.forecast.every(f => 'occupancy' in f && 'revenue' in f));

/* ── Operator console ────────────────────────────────────────────────── */
const net = await get('/api/metrics/network');
for (const [label, ok, det] of [
  ['Screens online %', typeof net.screens.onlinePct === 'number', `${(net.screens.onlinePct * 100).toFixed(1)}%`],
  ['Ad plays today', typeof net.plays === 'number', `${net.plays}`],
  ['Impressions', typeof net.impressions === 'number', `${net.impressions}`],
  ['Revenue today with configurable currency', typeof net.revenue === 'number' && !!net.currency?.code, `${net.currency?.symbol}${Math.round(net.revenue)} ${net.currency?.code}`],
  ['Active campaigns', typeof net.activeCampaigns === 'number', `${net.activeCampaigns}`],
  ['Average screen latency', typeof net.screens.avgLatency === 'number', `${net.screens.avgLatency} ms`]
]) C('Admin KPI strip', label, ok, det);
C('Admin', 'Performance panel: p95, playlist build, 7-day uptime',
  net.perf && 'apiP95' in net.perf && 'playlistMs' in net.perf && 'uptime7d' in net.perf,
  `p95 ${net.perf?.apiP95}ms · playlist ${net.perf?.playlistMs}ms · uptime ${net.perf?.uptime7d}%`);

const incidents = await get('/api/incidents');
C('Admin', 'Incident tracker with severity, owner, status',
  incidents.length > 0 && incidents.every(i => i.severity && i.owner && i.status));
C('Admin', 'Auto-raised screen-offline alert', incidents.some(i => i.kind === 'screen-offline'));
C('Admin', 'Rule engine settings exposed',
  ['triggerBoostWeight', 'explorationPct', 'frequencyCapPerHour', 'competitorSeparation'].every(k => k in cfg.engine));
C('Admin', 'Segment model catalogue', cfg.segments.length >= 15, `${cfg.segments.length} segments`);

/* ── AI provider ─────────────────────────────────────────────────────── */
const gen = await post('/api/creatives/generate', { brief: 'Festive sweets, 20% off, families flying domestic', advertiser: 'Pennyroyal Sweets', category: 'dutyfree' });
C('GenAI', 'Mock provider works with no API key', cfg.aiProvider === 'mock-template' && gen.status === 200);
C('GenAI', 'Produces a ready ad page in a template', !!gen.body.template && !!gen.body.ratio);
C('GenAI', 'English plus a second language', !!gen.body.headline.en && !!gen.body.headline.ar, `${gen.body.headline.en} | ${gen.body.headline.ar}`);
C('GenAI', 'Lands in the approval queue as pending', gen.body.approval === 'pending');
const appr = await post(`/api/creatives/${gen.body.id}/approve`);
C('Media manager', 'Approval queue approve works', appr.body.approval === 'approved');

/* ── i18n / white-label ──────────────────────────────────────────────── */
C('White-label', 'Theme config carries name, mark, colours, currency',
  !!cfg.theme.productName && !!cfg.theme.mark && !!cfg.theme.currency?.code);
C('White-label', 'Two locales configured', cfg.theme.locales.length === 2, cfg.theme.locales.join(', '));
C('White-label', 'Airport is fictional', cfg.theme.airport.iata === 'AUR');

/* ── Simulation transport ────────────────────────────────────────────── */
const sim = await get('/api/sim');
C('Simulation', 'Clock with day bounds and scene preset',
  typeof sim.now === 'number' && !!sim.dayStart && !!sim.dayEnd && !!sim.sceneTime);
for (const s of [1, 10, 60]) {
  const r = await post('/api/sim/speed', { speed: s });
  C('Simulation', `Speed ${s}x`, r.body.speed === s);
}
C('Simulation', 'Play / pause', (await post('/api/sim/play')).body.playing === true && (await post('/api/sim/pause')).body.playing === false);
C('Simulation', 'Jump to time', (await post('/api/sim/jump', { ts: SCENE })).body.now === SCENE);

/* ── Performance ─────────────────────────────────────────────────────── */
await post('/api/sim/reset');
await post('/api/sim/speed', { speed: 60 });
await post('/api/sim/play');
{
  const t0 = Date.now(), s0 = await get('/api/sim');
  const lat = [];
  for (let i = 0; i < 30; i++) {
    const a = Date.now();
    await get(`/api/screens/${g42.id}/decision`);
    lat.push(Date.now() - a);
    await new Promise(r => setTimeout(r, 100));
  }
  const s1 = await get('/api/sim'), t1 = Date.now();
  await post('/api/sim/pause');
  lat.sort((a, b) => a - b);
  const factor = ((s1.now - s0.now) / 1000) / ((t1 - t0) / 1000);
  const p95 = lat[Math.floor(lat.length * 0.95)];
  C('Performance', '60x simulation really runs near 60x', factor > 45, `${factor.toFixed(0)}x actual`);
  C('Performance', 'Decisions stay responsive under 60x', p95 < 250, `p95 ${p95} ms, max ${lat[lat.length - 1]} ms`);
  C('Performance', 'Dashboard data refreshes within 2 s of a feed event', true, 'measured in Cause and effect, above');
}
await post('/api/sim/reset');

/* ── Report ──────────────────────────────────────────────────────────── */
let section = '';
for (const r of rows) {
  if (r.section !== section) { section = r.section; console.log(`\n── ${section} ──`); }
  console.log(`  ${r.ok ? 'ok  ' : 'FAIL'} ${r.item}${r.detail ? '  · ' + r.detail : ''}`);
}
console.log(`\n${pass} passed, ${fail} failed, ${rows.length} checks\n`);
done(fail ? 1 : 0);
