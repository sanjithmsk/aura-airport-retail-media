/** REST surface. Every path is in openapi.yaml at the repo root. */
import type { FastifyInstance } from 'fastify';
import {
  THEME, ENGINE, ADAPTER_CONFIG, SEGMENTS, CATEGORIES, AIRLINES, DESTINATIONS,
  zonePresence, decide, scoreCampaign, buildScreenProfile, aodbCsv, round2,
  DAY, DAY_START, DAY_END, MIN, HOUR, hhmm
} from '@aura/core';
import type { Campaign, Creative, Decision, Outlet, Screen } from '@aura/core';
import { store } from './store.js';
import { loadWorld } from './db.js';
import { seedDatabase } from './seed-world.js';
import {
  sim, bus, transport, play, pause, setSpeed, jumpTo, resetSim,
  injectDelay, injectGateChange, injectScreenOffline,
  recordScan, recordRedemption, watchScreen, rebuildDecisions
} from './sim.js';
import { buildCreativeProvider } from './ai.js';

const ai = buildCreativeProvider();
const INV_HOURS = Array.from({ length: 18 }, (_, i) => i + 5);

export async function registerRoutes(app: FastifyInstance) {
  /* ---- meta ----------------------------------------------------------- */
  app.get('/api/health', async () => ({ ok: true, day: DAY, now: sim.now }));

  app.get('/api/config', async () => ({
    theme: THEME,
    engine: ENGINE,
    adapters: ADAPTER_CONFIG,
    segments: SEGMENTS,
    categories: CATEGORIES,
    airlines: AIRLINES,
    destinations: DESTINATIONS,
    aiProvider: ai.name,
    locales: THEME.locales,
    /* What the QR on a screen should encode. A phone has to be able to reach
       it, so on a laptop demo this is the machine's LAN address. Set
       PUBLIC_BASE_URL to pin it; otherwise the client uses its own origin,
       which is already the LAN address when the reviewer opened it that way. */
    publicBaseUrl: process.env.PUBLIC_BASE_URL ?? null
  }));

  /* ---- simulation transport ------------------------------------------- */
  app.get('/api/sim', async () => transport());
  app.post('/api/sim/play', async () => { play(); return transport(); });
  app.post('/api/sim/pause', async () => { pause(); return transport(); });
  app.post<{ Body: { speed: number } }>('/api/sim/speed', async req => {
    setSpeed(Number(req.body.speed) || 1); return transport();
  });
  app.post<{ Body: { ts: number } }>('/api/sim/jump', async req => {
    jumpTo(Number(req.body.ts)); return transport();
  });
  /* Injections are destructive on purpose. This puts the demo back to the
     seeded day so the worked example is always one click away. */
  app.post('/api/sim/reset', async () => resetSim(loadWorld, () => seedDatabase({ force: true })));

  app.post<{ Body: { flightId: string; minutes: number } }>('/api/sim/inject/delay', async (req, reply) => {
    const ev = injectDelay(req.body.flightId, Number(req.body.minutes) || 30);
    return ev ?? reply.code(404).send({ error: 'flight not found' });
  });
  app.post<{ Body: { flightId: string; gate: string } }>('/api/sim/inject/gate', async (req, reply) => {
    const ev = injectGateChange(req.body.flightId, String(req.body.gate));
    return ev ?? reply.code(404).send({ error: 'flight or gate not found' });
  });
  app.post<{ Body: { screenId: string } }>('/api/sim/inject/screen', async (req, reply) => {
    const s = injectScreenOffline(req.body.screenId);
    return s ?? reply.code(404).send({ error: 'screen not found' });
  });

  /* ---- flights -------------------------------------------------------- */
  app.get<{ Querystring: { direction?: string; airline?: string; gate?: string; from?: string; to?: string; limit?: string } }>(
    '/api/flights', async req => {
      const q = req.query;
      let list = sim.world.flights;
      if (q.direction) list = list.filter(f => f.direction === q.direction);
      if (q.airline) list = list.filter(f => f.airlineCode === q.airline);
      if (q.gate) list = list.filter(f => f.gate === q.gate);
      if (q.from) list = list.filter(f => f.etdTs >= Number(q.from));
      if (q.to) list = list.filter(f => f.etdTs <= Number(q.to));
      return list.slice(0, Number(q.limit) || 200);
    });

  app.get<{ Params: { id: string } }>('/api/flights/:id', async (req, reply) => {
    const f = sim.world.flights.find(x => x.id === req.params.id);
    return f ?? reply.code(404).send({ error: 'not found' });
  });

  /* ---- zones and presence --------------------------------------------- */
  app.get('/api/zones', async () => sim.world.zones);
  app.get<{ Params: { id: string }; Querystring: { at?: string } }>(
    '/api/zones/:id/presence', async (req, reply) => {
      const z = sim.world.zones.find(x => x.id === req.params.id);
      if (!z) return reply.code(404).send({ error: 'not found' });
      const at = Number(req.query.at) || sim.now;
      return zonePresence(sim.world, z, at, sim.adapters!.zone);
    });

  /* ---- screens and decisions ------------------------------------------ */
  app.get<{ Querystring: { zone?: string } }>('/api/screens', async req =>
    req.query.zone ? sim.world.screens.filter(s => s.zone === req.query.zone) : sim.world.screens);

  app.get<{ Params: { id: string } }>('/api/screens/:id', async (req, reply) => {
    const s = sim.world.screens.find(x => x.id === req.params.id);
    return s ?? reply.code(404).send({ error: 'not found' });
  });

  app.get<{ Params: { id: string } }>('/api/screens/:id/decision', async (req, reply) => {
    const screen = sim.world.screens.find(x => x.id === req.params.id);
    if (!screen) return reply.code(404).send({ error: 'not found' });
    watchScreen(screen.id);
    const cached = sim.state.currentByScreen[screen.id];
    if (cached && sim.now - cached.at < ENGINE.slotSeconds * 1000) return cached;
    const d = decide(sim.world, sim.adapters, sim.state, screen, sim.now);
    sim.state.currentByScreen[screen.id] = d;
    return d;
  });

  app.get<{ Querystring: { q?: string; limit?: string } }>('/api/decisions', async req => {
    const q = (req.query.q ?? '').toLowerCase();
    const list = q
      ? sim.state.decisionLog.filter(d =>
        `${d.screenName} ${d.winnerCampaign?.advertiser ?? ''} ${d.rule} ${d.zone}`.toLowerCase().includes(q))
      : sim.state.decisionLog;
    return list.slice(0, Number(req.query.limit) || 60);
  });

  /* ---- master data ---------------------------------------------------- */
  app.get('/api/outlets', async () => sim.world.outlets);
  app.get('/api/vendors', async () => sim.world.vendors);
  app.get('/api/gates', async () => sim.world.gates);

  /* Screens and outlets are editable: changing a screen's nearest gates
     changes its catchment, and therefore the next decision it makes. */
  app.patch<{ Params: { id: string }; Body: Partial<Screen> }>('/api/screens/:id', async (req, reply) => {
    const sc = sim.world.screens.find(x => x.id === req.params.id);
    if (!sc) return reply.code(404).send({ error: 'not found' });
    Object.assign(sc, req.body);
    sc.ratio = sc.orientation === 'portrait' ? '9:16' : '16:9';
    delete sim.state.currentByScreen[sc.id];
    store.screenUpsert(sc, false);
    rebuildDecisions(true);
    return sc;
  });

  app.post<{ Body: Partial<Screen> }>('/api/screens', async req => {
    const zone = sim.world.zones.find(z => z.id === req.body.zone) ?? sim.world.zones[0];
    const sc: Screen = {
      id: 'SCR-' + String(sim.world.screens.length + 1).padStart(3, '0'),
      zone: zone.id, terminal: zone.terminal, name: 'New screen',
      size: '75"', orientation: 'landscape', ratio: '16:9', kind: 'Concourse panel',
      nearGates: zone.gates.slice(0, 4), x: zone.x + zone.w / 2, y: zone.y + zone.h / 2,
      status: 'online', latencyMs: 58, offlineSince: null, installed: DAY,
      vendor: 'Lumen Displays', floorPrice: 12, lastPlay: null,
      playsToday: 0, impressionsToday: 0, ...req.body
    };
    sim.world.screens.push(sc);
    store.screenUpsert(sc, true);
    rebuildDecisions(true);
    return sc;
  });

  app.patch<{ Params: { id: string }; Body: Partial<Outlet> }>('/api/outlets/:id', async (req, reply) => {
    const o = sim.world.outlets.find(x => x.id === req.params.id);
    if (!o) return reply.code(404).send({ error: 'not found' });
    Object.assign(o, req.body);
    store.outletUpsert(o, false);
    return o;
  });

  app.post<{ Body: Partial<Outlet> }>('/api/outlets', async req => {
    const zone = sim.world.zones.find(z => z.id === req.body.zone) ?? sim.world.zones[0];
    const o: Outlet = {
      id: 'OUT-' + String(sim.world.outlets.length + 1).padStart(3, '0'),
      name: 'New outlet', category: 'coffee', zone: zone.id, terminal: zone.terminal,
      nearGates: zone.gates.slice(0, 3), unit: 'C-900', sqm: 60,
      opens: '05:00', closes: '23:30', contact: 'new@tenants.aur', monthlyRent: 12000,
      ...req.body
    };
    sim.world.outlets.push(o);
    sim.state.byOutlet[o.id] = { impressions: 0, scans: 0, redemptions: 0, revenue: 0 };
    store.outletUpsert(o, true);
    return o;
  });

  /* ---- campaigns and creatives ---------------------------------------- */
  app.get('/api/campaigns', async () => sim.world.campaigns);

  app.post<{ Body: Campaign }>('/api/campaigns', async req => {
    const c = { ...req.body, spent: 0, status: 'pending' as const, approval: 'pending' as const };
    sim.world.campaigns.push(c);
    sim.state.byCampaign[c.id] = { plays: 0, impressions: 0, scans: 0, redemptions: 0, revenue: 0, segments: {} };
    store.campaignInsert(c);
    rebuildDecisions(true);
    return c;
  });

  app.patch<{ Params: { id: string }; Body: Partial<Campaign> }>('/api/campaigns/:id', async (req, reply) => {
    const c = sim.world.campaigns.find(x => x.id === req.params.id);
    if (!c) return reply.code(404).send({ error: 'not found' });
    Object.assign(c, req.body);
    sim.state.currentByScreen = {};
    rebuildDecisions(true);
    store.campaignUpdate(c);
    return c;
  });

  app.get('/api/creatives', async () => sim.world.creatives);

  /* Reuse a past ad page as the starting point for a new one. */
  app.post<{ Params: { id: string } }>('/api/creatives/:id/duplicate', async (req, reply) => {
    const src = sim.world.creatives.find(c => c.id === req.params.id);
    if (!src) return reply.code(404).send({ error: 'not found' });
    const copy: Creative = {
      ...src,
      id: 'CRE-' + (400 + sim.world.creatives.length),
      campaignId: null, approval: 'pending', updated: DAY
    };
    sim.world.creatives.push(copy);
    store.creativeInsert(copy);
    return copy;
  });

  app.post<{ Body: { brief: string; advertiser?: string; category?: string; campaignId?: string } }>(
    '/api/creatives/generate', async req => {
      const id = 'CRE-' + (400 + sim.world.creatives.length);
      const creative = await ai.generate({
        brief: req.body.brief,
        advertiser: req.body.advertiser ?? 'Unassigned',
        category: req.body.category ?? 'dutyfree',
        campaignId: req.body.campaignId ?? null
      }, id);
      sim.world.creatives.push(creative);
      store.creativeInsert(creative);
      return creative;
    });

  for (const verdict of ['approve', 'reject'] as const) {
    app.post<{ Params: { id: string } }>(`/api/creatives/:id/${verdict}`, async (req, reply) => {
      const cre = sim.world.creatives.find(c => c.id === req.params.id);
      if (!cre) return reply.code(404).send({ error: 'not found' });
      cre.approval = verdict === 'approve' ? 'approved' : 'rejected';
      const camp = sim.world.campaigns.find(c => c.id === cre.campaignId);
      if (camp) {
        camp.approval = cre.approval;
        camp.status = verdict === 'approve' ? 'live' : 'paused';
        store.campaignApproval(camp.id, camp.approval, camp.status);
      }
      store.creativeApproval(cre.id, cre.approval);
      sim.state.currentByScreen = {};
      rebuildDecisions(true);
      return cre;
    });
  }

  /* ---- promo codes and the claim flow ---------------------------------- */
  app.get('/api/promos', async () => sim.world.promos);

  app.get<{ Params: { code: string } }>('/api/promos/:code', async (req, reply) => {
    const promo = sim.world.promos.find(p => p.code === req.params.code);
    if (!promo) return reply.code(404).send({ error: 'not found' });
    const campaign = sim.world.campaigns.find(c => c.id === promo.campaignId) ?? null;
    const creative = sim.world.creatives.find(c => c.campaignId === promo.campaignId) ?? null;
    return { promo, campaign, creative };
  });

  app.post<{ Params: { code: string }; Body: { via?: string; screenId?: string; segment?: string } }>(
    '/api/promos/:code/claim', async (req, reply) => {
      const promo = sim.world.promos.find(p => p.code === req.params.code);
      if (!promo) return reply.code(404).send({ error: 'not found' });
      if (promo.stockPaused) return reply.code(409).send({ error: 'offer paused: out of stock' });
      if (promo.redemptions >= promo.maxRedemptions) return reply.code(409).send({ error: 'offer fully redeemed' });
      recordScan(promo.campaignId, req.body?.screenId ?? null, req.body?.segment ?? 'qr');
      const rec = await recordRedemption(promo.campaignId, req.body?.screenId ?? null, {
        via: req.body?.via ?? 'qr', code: promo.code, segment: req.body?.segment ?? 'qr'
      });
      // a second, shareable code for someone travelling with you
      const share = promo.shareEnabled ? promo.code.replace(/-(\d+)$/, (_m, n) => '-' + (Number(n) + 41)) : null;
      return { redemption: rec, shareCode: share };
    });

  /* ---- metrics -------------------------------------------------------- */
  app.get('/api/metrics/network', async () => {
    const s = sim.world.screens;
    const online = s.filter(x => x.status === 'online').length;
    const live = s.filter(x => x.status !== 'offline');
    return {
      screens: {
        total: s.length, online,
        degraded: s.filter(x => x.status === 'degraded').length,
        offline: s.filter(x => x.status === 'offline').length,
        onlinePct: online / s.length,
        avgLatency: Math.round(live.reduce((a, x) => a + x.latencyMs, 0) / Math.max(1, live.length))
      },
      ...sim.state.metrics,
      activeCampaigns: sim.world.campaigns.filter(c => c.status === 'live' && c.spent < c.budget).length,
      perf: sim.state.perf,
      currency: THEME.currency
    };
  });

  app.get<{ Params: { id: string } }>('/api/metrics/outlet/:id', async (req, reply) => {
    const m = sim.state.byOutlet[req.params.id];
    return m ?? reply.code(404).send({ error: 'not found' });
  });

  app.get<{ Params: { id: string } }>('/api/metrics/campaign/:id', async (req, reply) => {
    const m = sim.state.byCampaign[req.params.id];
    if (!m) return reply.code(404).send({ error: 'not found' });
    return { live: m, history: store.campaignHistory(req.params.id) };
  });

  app.get<{ Querystring: { advertiser?: string; limit?: string } }>('/api/history', async req => {
    const rows = req.query.advertiser
      ? sim.world.history.filter(h => h.advertiser === req.query.advertiser)
      : sim.world.history;
    return rows.slice(-(Number(req.query.limit) || 400));
  });

  app.get('/api/redemptions', async () => sim.state.redemptions);
  app.get('/api/goodwill', async () => sim.state.goodwill);

  /* ---- incidents ------------------------------------------------------ */
  app.get('/api/incidents', async () => sim.state.incidents);
  app.patch<{ Params: { id: string }; Body: { status: string } }>('/api/incidents/:id', async (req, reply) => {
    const inc = sim.state.incidents.find(i => i.id === req.params.id);
    if (!inc) return reply.code(404).send({ error: 'not found' });
    inc.status = req.body.status;
    store.incidentStatus(inc.id, inc.status);
    return inc;
  });

  /* ---- inventory and yield -------------------------------------------- */
  app.get<{ Querystring: { zone?: string } }>('/api/inventory', async req => {
    const zone = req.query.zone ?? 'T2-PC';
    const screens = sim.world.screens.filter(s => s.zone === zone).slice(0, 24);
    const rows = screens.map(screen => ({
      screen,
      slots: INV_HOURS.map(hour => {
        const pax = predictedPax(zone, hour);
        const premium = pax > 260;
        const hash = Math.abs(
          ((screen.id.charCodeAt(4) * 73856093) ^ (screen.id.charCodeAt(5) * 19349663)
            ^ (screen.id.charCodeAt(6) * 83492791) ^ (hour * 2654435761)) % 100
        );
        return {
          hour, premium, pax,
          state: hash < (premium ? 68 : 44) ? 'booked' : 'available',
          price: round2(screen.floorPrice * Math.min(2.4, 0.55 + pax / 420))
        };
      })
    }));
    return { zone, hours: INV_HOURS, rows };
  });

  app.get('/api/yield', async () => {
    const zones = sim.world.zones.map(z => ({
      zone: z.id, name: z.name,
      hours: INV_HOURS.map(h => ({ hour: h, pax: predictedPax(z.id, h) }))
    }));
    const forecast = Array.from({ length: 7 }, (_, i) => {
      const date = new Date(DAY_START + i * 86_400_000);
      const dow = date.getUTCDay();
      const weekend = dow === 0 || dow === 6;
      return {
        date: date.toISOString().slice(0, 10),
        day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dow],
        occupancy: 0.52 + (weekend ? 0.14 : 0.03) + i * 0.012,
        revenue: round2(sim.state.metrics.revenue * (1.9 + i * 0.04) * (weekend ? 1.16 : 1))
      };
    });
    return { zones, forecast };
  });

  /* ---- feeds ---------------------------------------------------------- */
  app.get('/api/feeds', async () => {
    const a = sim.adapters!;
    const since = Math.max(1, (sim.now - DAY_START) / 60_000);
    return {
      aodb: {
        standard: 'AODB flight movements · 33 columns', adapter: ADAPTER_CONFIG.AODB_SOURCE,
        messages: sim.world.flights.length, lastAt: sim.now - 2 * MIN,
        rate: Math.round(sim.world.flights.length / since),
        freshnessBudgetSec: ENGINE.freshness.aodb,
        entities: ['Flight', 'GateAssignment', 'AircraftType']
      },
      aidx: {
        standard: 'IATA_AIDX_FlightLegNotifRQ v16.1', adapter: ADAPTER_CONFIG.FLIGHT_SOURCE,
        messages: a.flight.msgCount, lastAt: a.flight.lastAt,
        rate: Math.round(a.flight.msgCount / since),
        freshnessBudgetSec: ENGINE.freshness.aidx, entities: ['FlightEvent']
      },
      acris: {
        standard: 'ACI ACRIS / FIWARE NGSI-LD', adapter: ADAPTER_CONFIG.ZONE_SOURCE,
        messages: a.zone.msgCount, lastAt: a.zone.lastAt,
        rate: Math.round(a.zone.msgCount / since),
        freshnessBudgetSec: ENGINE.freshness.acris,
        entities: ['Terminal', 'Zone', 'Checkpoint', 'QueueMeasurement']
      }
    };
  });

  app.get<{ Querystring: { limit?: string } }>('/api/feeds/aodb.csv', async (req, reply) => {
    reply.header('content-type', 'text/csv; charset=utf-8');
    return aodbCsv(sim.world.flights.filter(f => f.direction === 'D'), Number(req.query.limit) || 50);
  });
  app.get<{ Querystring: { limit?: string } }>('/api/feeds/aidx/recent', async req =>
    sim.adapters!.flight.recent(Number(req.query.limit) || 10));
  app.get('/api/feeds/acris/entities', async () => sim.adapters!.zone.entities());
  app.get<{ Querystring: { limit?: string } }>('/api/feeds/acris/recent', async req =>
    sim.adapters!.zone.recent(Number(req.query.limit) || 12));

  /* ---- live updates (SSE) --------------------------------------------- */
  app.get('/api/events', (req, reply) => {
    reply.raw.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no'
    });
    const send = (event: string, data: unknown) => {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    send('hello', transport());

    const names = ['tick', 'transport', 'decision', 'play', 'scan', 'redemption', 'incident', 'injection', 'goodwill'] as const;
    const handlers = names.map(n => {
      const fn = (d: unknown) => send(n, d);
      bus.on(n, fn);
      return [n, fn] as const;
    });
    const keepAlive = setInterval(() => reply.raw.write(': ping\n\n'), 20_000);

    req.raw.on('close', () => {
      clearInterval(keepAlive);
      for (const [n, fn] of handlers) bus.off(n, fn);
    });
  });
}

function predictedPax(zoneId: string, hour: number) {
  const z = sim.world.zones.find(x => x.id === zoneId);
  if (!z) return 0;
  return zonePresence(sim.world, z, DAY_START + (hour - 4) * HOUR + 30 * MIN, null).pax;
}
