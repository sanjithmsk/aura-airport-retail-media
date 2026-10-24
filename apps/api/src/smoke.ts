/**
 * API integration smoke test.
 *
 * Starts the server, walks the endpoints a demo actually uses, and asserts
 * the brief's worked example over HTTP — not just in the domain package.
 * Run with `npm -w @aura/api test` (the server is started and stopped here).
 */
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { rmSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.SMOKE_BASE ?? 'http://localhost:4100';
/** Its own database, seeded fresh, so the test is hermetic and repeatable. */
const SMOKE_DB = 'file:./smoke.db';
const SCENE = Date.parse('2026-10-24T14:10:00Z');

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? '  ok  ' : '  FAIL '}${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures++;
}
const get = async (p: string): Promise<any> => {
  const r = await fetch(BASE + p);
  if (!r.ok) throw new Error(`${p} → ${r.status}`);
  return r.headers.get('content-type')?.includes('json') ? r.json() : r.text();
};
const post = async (p: string, body?: unknown): Promise<{ status: number; body: any }> => {
  const r = await fetch(BASE + p, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const patch = async (p: string, body: unknown): Promise<any> =>
  fetch(BASE + p, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    .then(r => r.json());
const pct = (n: number) => Math.round(n * 100);

async function waitForServer(tries = 40): Promise<void> {
  for (let i = 0; i < tries; i++) {
    try { const h = await get('/api/health'); if ((h as any).ok) return; } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error('server did not come up');
}

async function run() {
  console.log(`\nAPI smoke test against ${BASE}\n`);

  const config = await get('/api/config');
  check('config serves the white-label theme', config.theme?.productName === 'AURA', config.theme?.airport?.name);
  check('three adapters are declared', Object.keys(config.adapters).length === 3, JSON.stringify(config.adapters));

  /* ---- the worked example, over HTTP ---------------------------------- */
  await post('/api/sim/jump', { ts: SCENE });
  const screens: any[] = await get('/api/screens?zone=T2-PC');
  const gate42 = screens.find(s => s.name === 'Gate 42 totem');
  check('gate 42 totem exists', !!gate42, gate42?.id);

  const d = await get(`/api/screens/${gate42.id}/decision`);
  check('catchment is exactly the two scripted flights',
    d.parts.map((p: any) => p.id).sort().join() === 'XY501,ZQ88',
    d.parts.map((p: any) => `${p.id}->${p.dest} ${p.pax}pax`).join(' · '));
  check('holiday 58%', pct(d.profile.purpose.holiday) === 58);
  check('family 31%', pct(d.profile.party.family) === 31);
  check('business 22%', pct(d.profile.purpose.business) === 22);
  check('international 57%', pct(d.profile.international) === 57);
  check('median dwell 52 min', d.dwellMedian === 52);

  const perfume = d.candidates.find((c: any) => c.campaignId === 'CMP-201');
  const toys = d.candidates.find((c: any) => c.campaignId === 'CMP-202');
  const lounge = d.filtered.find((c: any) => c.campaignId === 'CMP-203');
  check('perfume 71% × 1.5 → 0.86 plays',
    pct(perfume.match) === 71 && perfume.boost === 1.5 && perfume.final === 0.86 && d.winner.campaignId === 'CMP-201');
  check('toys 49% → 0.52 in rotation', pct(toys.match) === 49 && toys.final === 0.52);
  check('lounge 18% → 0.21 filtered off Pier C',
    pct(lounge.match) === 18 && lounge.final === 0.21 && /Not placed in T2-PC/.test(lounge.reasons[0]));
  check('decision verifies against the feeds',
    d.verification.ok && d.verification.checks.length === 5 && !d.fallback);
  check('every cited input is inside its freshness budget',
    d.evidence.length >= 3 && d.evidence.every((e: any) => SCENE - e.at < 15 * 60_000));

  /* ---- cause and effect ------------------------------------------------ */
  const before = d.crowdNow;
  const inject = await post('/api/sim/inject/delay', { flightId: 'XY501', minutes: 45 });
  check('injecting a delay publishes AIDX XML',
    inject.status === 200 && /IATA_AIDX_FlightLegNotifRQ/.test(inject.body.raw) && /DelayReason/.test(inject.body.raw),
    `delayMin now ${inject.body?.delayMin}`);
  const after = await get(`/api/screens/${gate42.id}/decision`);
  check('a delay holds the crowd at the gate rather than dispersing it',
    after.crowdNow >= before, `${before} → ${after.crowdNow} pax`);
  check('the delay rule still wins the slot', after.winner?.campaignId === 'CMP-201');

  /* ---- money lands ----------------------------------------------------- */
  const promos: any[] = await get('/api/promos');
  const promo = promos.find(p => p.campaignId === 'CMP-201');
  const m0 = await get('/api/metrics/network');
  const claim = await post(`/api/promos/${promo.code}/claim`, { via: 'phone', segment: 'holiday' });
  check('claiming a code records a redemption', claim.status === 200 && !!claim.body.redemption,
    `${claim.body?.redemption?.advertiser} ${claim.body?.redemption?.code}`);
  check('share-to-family issues a second code', !!claim.body.shareCode, claim.body?.shareCode);
  const m1 = await get('/api/metrics/network');
  check('the redemption reaches the network metrics', m1.redemptions === m0.redemptions + 1,
    `${m0.redemptions} → ${m1.redemptions}`);
  const outlet = await get(`/api/metrics/outlet/${promo.outletId}`);
  check('and is attributed to the outlet', outlet.redemptions > 0, `${outlet.redemptions} redemptions`);

  /* ---- feeds ----------------------------------------------------------- */
  const csv = await get('/api/feeds/aodb.csv?limit=3') as string;
  check('AODB export has all 33 columns', csv.split('\n')[0].split(',').length === 33);
  const aidx: any[] = await get('/api/feeds/aidx/recent?limit=5');
  check('AIDX feed is carrying messages', aidx.length > 0 && /FlightLegNotifRQ/.test(aidx[0].raw));
  const acris: any[] = await get('/api/feeds/acris/entities');
  check('ACRIS entities are NGSI-LD', acris.length > 0 && acris[0]['@context'] && /urn:ngsi-ld/.test(acris[0].id));
  const feeds = await get('/api/feeds');
  check('feed health reports all three sources',
    !!feeds.aodb && !!feeds.aidx && !!feeds.acris,
    `${feeds.aidx.adapter} · ${feeds.acris.adapter}`);

  /* ---- operations ------------------------------------------------------ */
  const gen = await post('/api/creatives/generate', {
    brief: 'Festive sweets, 20% off, families flying domestic', advertiser: 'Pennyroyal Sweets', category: 'dutyfree'
  });
  check('creative assistant produces a bilingual page',
    gen.status === 200 && !!gen.body.headline.en && !!gen.body.headline.ar,
    `${gen.body?.headline?.en} · ${gen.body?.template}`);
  const approved = await post(`/api/creatives/${gen.body.id}/approve`);
  check('approval queue approves it', approved.body?.approval === 'approved',
    `status ${approved.status} · ${JSON.stringify(approved.body)?.slice(0, 90)}`);

  const offline = await post('/api/sim/inject/screen', { screenId: gate42.id });
  check('a screen can be taken offline', offline.body.status === 'offline');
  await post('/api/sim/inject/screen', { screenId: gate42.id });

  const inventory = await get('/api/inventory?zone=T2-PC');
  check('inventory grid is screen × hour', inventory.hours.length === 18 && inventory.rows.length > 0,
    `${inventory.rows.length} screens × ${inventory.hours.length} hours`);

  const log: any[] = await get('/api/decisions?limit=5');
  check('decision log is populated with evidence', log.length > 0 && log[0].evidence.length > 0);

  /* ---- limits, master data and the way home ---------------------------- */
  const campaigns: any[] = await get('/api/campaigns');
  const capped = campaigns.find(c => c.dailyCap);
  check('campaigns carry a daily cap alongside the total budget', !!capped,
    `${capped?.id} capped at ${capped?.dailyCap} of ${capped?.budget}`);
  await patch(`/api/campaigns/${toys.campaignId}`, { dailyCap: 1 });
  const capsFiltered: any = await get(`/api/screens/${gate42.id}/decision`);
  check('a campaign past its daily cap is filtered, with the reason stated',
    capsFiltered.filtered.some((f: any) => /Daily cap/.test(f.reasons.join())),
    capsFiltered.filtered.find((f: any) => /Daily cap/.test(f.reasons.join()))?.reasons[0]);

  const edited = await post('/api/screens', { zone: 'T2-DF', name: 'Smoke test screen' });
  check('a screen can be onboarded', edited.status === 200 && !!edited.body.id, edited.body?.id);
  const patched = await patch(`/api/screens/${gate42.id}`, { floorPrice: 19 });
  check('a screen can be edited', patched.floorPrice === 19);
  const dup = await post(`/api/creatives/${d.winnerCampaign!.creative}/duplicate`);
  check('a creative can be duplicated for reuse', dup.status === 200 && dup.body.approval === 'pending', dup.body?.id);

  const reset = await post('/api/sim/reset');
  check('reset returns the clock to the opening state', reset.body.now === Date.parse('2026-10-24T14:05:00Z') && !reset.body.playing);
  await post('/api/sim/jump', { ts: SCENE });
  const restored: any = await get(`/api/screens/${gate42.id}/decision`);
  check('reset restores the Gate 42 scene after destructive injections',
    restored.parts.map((p: any) => p.id).sort().join() === 'XY501,ZQ88' &&
    restored.dwellMedian === 52 && restored.winner?.campaignId === 'CMP-201',
    `${restored.parts.map((p: any) => p.id).join()} · dwell ${restored.dwellMedian} · ${restored.winner?.campaignId}`);

  /* ---- live updates ---------------------------------------------------- */
  await post('/api/sim/play');
  const seen = await collectSse(4000);
  check('SSE stream delivers live updates', seen.has('tick') && seen.has('decision'), [...seen].join(', '));
  await post('/api/sim/pause');

  console.log(`\n${failures ? `${failures} FAILED` : 'all checks passed'}\n`);
  return failures;
}

async function collectSse(ms: number): Promise<Set<string>> {
  const seen = new Set<string>();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(BASE + '/api/events', { signal: ctl.signal });
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      for (const line of dec.decode(value).split('\n')) {
        if (line.startsWith('event: ')) seen.add(line.slice(7).trim());
      }
    }
  } catch { /* aborted on purpose */ }
  clearTimeout(timer);
  return seen;
}

/* ---- boot a server unless one was given ------------------------------- */
let child: ReturnType<typeof spawn> | null = null;
if (!process.env.SMOKE_BASE) {
  for (const f of ['smoke.db', 'smoke.db-shm', 'smoke.db-wal']) rmSync(resolve(here, '../', f), { force: true });
  const seeded = spawnSync(process.execPath, [resolve(here, '../dist/seed.js')], {
    env: { ...process.env, DATABASE_URL: SMOKE_DB }, stdio: 'ignore'
  });
  if (seeded.status !== 0) { console.error('seed failed'); process.exit(1); }
  child = spawn(process.execPath, [resolve(here, '../dist/server.js')], {
    env: { ...process.env, DATABASE_URL: SMOKE_DB, PORT: '4100', NODE_ENV: 'production', LOG_LEVEL: 'silent' },
    stdio: 'ignore'
  });
}

try {
  await waitForServer();
  const failed = await run();
  child?.kill();
  process.exit(failed ? 1 : 0);
} catch (e) {
  console.error((e as Error).message);
  child?.kill();
  process.exit(1);
}
