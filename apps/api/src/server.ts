/** Fastify entry point: load the world from SQLite, start the clock, serve. */
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fstatic from '@fastify/static';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { THEME, hhmm } from '@aura/core';
import { loadWorld, runMigrations, sqlite } from './db.js';
import { seedDatabase } from './seed-world.js';
import { store } from './store.js';
import { initSim, sim, stop } from './sim.js';
import { registerRoutes } from './routes.js';

const PORT = Number(process.env.PORT ?? 4000);
const HOST = process.env.HOST ?? '0.0.0.0';
const here = dirname(fileURLToPath(import.meta.url));

const app = Fastify({
  logger: { level: process.env.LOG_LEVEL ?? 'info', transport: process.env.NODE_ENV === 'production' ? undefined : { target: 'pino-pretty' } },
  bodyLimit: 2 * 1024 * 1024
});

// Several endpoints take no body at all (play, pause, approve, reject).
// Fastify rejects those by default when a JSON content-type is sent with an
// empty body, which is what most HTTP clients do. Treat it as `{}`.
app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
  const raw = typeof body === 'string' ? body.trim() : '';
  if (!raw) return done(null, {});
  try { done(null, JSON.parse(raw)); } catch (err) { done(err as Error, undefined); }
});

async function main() {
  await app.register(cors, { origin: true });
  await registerRoutes(app);

  // In production the API also serves the built client, so one container and
  // one port is the whole product.
  const webDist = resolve(here, '../../web/dist');
  if (existsSync(webDist)) {
    await app.register(fstatic, { root: webDist, wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api')) return reply.code(404).send({ error: 'not found' });
      return reply.sendFile('index.html');
    });
    app.log.info(`serving client from ${webDist}`);
  }

  runMigrations();
  // Hosts with an ephemeral filesystem (Render, Fly, a fresh container) start
  // every boot with no database. The day is generated from a fixed seed, so
  // rebuilding it here is deterministic and takes about a second — far better
  // than refusing to start and leaving a demo URL dead.
  if (!store.flightCount()) {
    app.log.info('no database found — generating the seeded day…');
    seedDatabase({ force: true });
  }

  app.log.info('loading the day from SQLite…');
  const world = loadWorld();
  await initSim(world);
  app.log.info(
    `${THEME.productName} ready · ${world.flights.length} flight legs · ${world.screens.length} screens · ` +
    `${world.campaigns.length} campaigns · simulation at ${hhmm(sim.now)}`
  );

  await app.listen({ port: PORT, host: HOST });
}

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => { stop(); await app.close(); sqlite.close(); process.exit(0); });
}

main().catch(err => { app.log.error(err); process.exit(1); });
