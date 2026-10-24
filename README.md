# AURA — Airport Retail Media

Ads and promotions on airport screens, chosen for the passengers actually standing in front of them.

Flight data says who is where and for how long. A delayed Dubai flight at Gate 42 means 240 international passengers with 45 extra minutes near duty-free, and the perfume shop should get that slot — not the toy shop, and not whoever booked it a fortnight ago. This repository is a working platform that does that, with every decision traceable back to the feed that justified it.

It runs on a clean laptop with one command, offline, with no cloud services and no API keys.

```bash
docker compose up
# → http://localhost:4000
```

---

## Contents

- [What it does](#what-it-does)
- [Running it](#running-it)
- [The demo in fifteen minutes](#the-demo-in-fifteen-minutes)
- [The worked example](#the-worked-example)
- [How a decision is made](#how-a-decision-is-made)
- [Data sources and the adapter layer](#data-sources-and-the-adapter-layer)
- [Architecture](#architecture)
- [Why this stack](#why-this-stack)
- [Project layout](#project-layout)
- [Configuration](#configuration)
- [Tests](#tests)
- [Privacy and scope](#privacy-and-scope)

---

## What it does

The platform sells airport digital-screen inventory to retailers, F&B outlets and airlines, and times each ad to the crowd in front of the screen. Five roles share one simulated day at a fictional airport:

| Role | What they get |
| --- | --- |
| **Platform Admin** | Live terminal map with every screen and a passenger-presence heat overlay, network KPIs, an incident tracker that raises itself, master data for screens, outlets, airlines, locations and vendors, feed health, the rule-engine settings and a searchable decision log |
| **Retailer** | Live impressions, scans, redemptions and attributed revenue; passenger flow near the store for the next two hours; a campaign builder with a live audience-match preview; a creative library with a generative assistant; time-boxed promo codes; campaign history with ROI and one-click relaunch |
| **Media Manager** | Inventory calendar of every screen by hour, yield and pricing driven by predicted presence, an approval queue with a brand-safety checklist, advertiser delivery with under-delivery flagged, and a conflict view explaining why campaign A beat campaign B |
| **Airline Representative** | Today's departures with gate, status, delay and load factor; the aggregated profile of their own passengers; gate-area messaging for their boarding windows; delay-goodwill automation co-funded with an F&B partner; a co-marketing marketplace |
| **Passenger screen** | The screen a traveller actually sees: FIDS strip, the ad, a QR with a live countdown, and a "Why this ad?" overlay showing the crowd profile, the top three candidate scores and the winning rule |

There is no login. A role switcher in the header changes persona; the retailer and airline views also switch between sample companies.

The whole airport is fictional — Aurelia International (AUR), ten invented airlines, forty invented outlets — and the product is white-label: name, mark, colours and currency all come from one `THEME` object in `packages/core/src/reference.ts`.

---

## Running it

### One command

```bash
docker compose up
```

Builds the workspace, applies the SQL migrations, seeds one full day, and serves the API and the client together on **http://localhost:4000**. The database is an embedded SQLite file on a named volume. Nothing else is required.

### Without Docker

Node 20 or newer.

```bash
npm run setup   # install, build the shared domain package, migrate and seed one day
npm run dev     # API on :4000, client on :5173
```

`npm run dev` runs both with hot reload. The client proxies `/api` to the API, so open **http://localhost:5173**.

To run the production build locally:

```bash
npm run build && npm start      # everything on :4000
```

### Useful scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | API and client with hot reload |
| `npm run build` | Build core, API and client |
| `npm start` | Build, then serve everything on one port |
| `npm test` | Both suites: the domain tests and the API integration test |
| `npm run db:reset` | Drop and regenerate the day |
| `npm run audit` | Run the challenge criteria as executable checks (see below) |
| `npm -w @aura/api run db:generate` | Generate a new SQL migration after a schema change |

### Deploying it

`render.yaml` is a Render Blueprint: in the Render dashboard, **New → Blueprint**,
pick this repo, and it builds the Dockerfile and runs the one container.

There is nothing else to provision. The day is generated from a fixed seed at
boot, so the service needs no database add-on and no persistent disk — if the
filesystem resets, the next boot rebuilds the same airport, down to the Gate 42
worked example. The same property makes the app portable to Fly, Railway, Cloud
Run or a plain VM: one image, one port, no external state.

Two things to know before demoing from a free instance. It spins down after
15 minutes without traffic and takes about a minute to wake, so open the URL a
few minutes beforehand. And Render may restart a free instance at any time,
which resets the simulation clock to 14:05 — harmless between runs, awkward
mid-demo. A paid instance removes both.

---

## The demo in fifteen minutes

The app has the script built in, under **Passenger Screen → Demo script**, with a button beside each step that takes you there. The argument runs in four moves.

**1 · Set the scene (2 min).** Open the operator console. 178 screens on a live floor plan, the heat overlay, KPIs ticking. Say the line that matters: the heat and every KPI are computed from the same ZonePresence signal the ad engine scores against. It is one number, not two systems that happen to agree.

**2 · Show the feeds (2 min).** AODB, IATA AIDX and ACI ACRIS, each behind an adapter. Open a raw 33-column AODB row and a real `IATA_AIDX_FlightLegNotifRQ` message. Going live is one new adapter class and one config value; no business logic moves.

**3 · The worked example (3 min).** Press "Gate 42 scene". Flight XY501 to Dubai, 240 passengers, 45 minutes late, plus ZQ88 to Navaro with 180. Open "Why this ad?" and read the numbers off the screen — they are in the table below, and they are asserted by a test.

**4 · Cause and effect (4 min).** Split-screen: passenger screen on the left, retailer dashboard on the right. Inject another 45-minute delay on XY501. Inside one slot the airline view updates, the gate screens re-plan, the retailer's delay rule fires and the zone passenger count rises — because a delay holds a crowd at the gate instead of dispersing it.

**5 · Money lands (2 min).** Scan the QR on the passenger screen with a phone. It opens the claim page on the same deployment. Claim it; the redemption appears on the retailer dashboard and the campaign's learned conversion index moves, which changes the next decision.

If you have been experimenting before the demo, press **Reset to the opening state** on the demo-script page first. Injections are destructive by design — a gate change really does move a flight out of a screen's catchment — so the reset rebuilds the seeded day and parks the clock back at 14:05.

**6 · Close on control (2 min).** Media manager: inventory priced off predicted presence, an approval queue nothing bypasses, and a conflict view that explains why campaign A beat campaign B — with a manual pin that writes its reason into the decision log.

---

## The worked example

Gate 42 at 14:10. The crowd is flight **XY501** to DXB (240 pax, delayed 45 min) plus **ZQ88** to QNV (180 pax).

**Profile:** holiday 58% · family 31% · business 22% · international 57% · median dwell 52 min

| Candidate | Targets | Audience match | Boost | Final | Result |
| --- | --- | ---: | ---: | ---: | --- |
| Duty-free perfume, 15% off | International, holiday, adults 25–54 | 71% | ×1.5 (delay rule) | **0.86** | Plays |
| Toy store, buy 2 get 1 | Family with children | 49% | — | 0.52 | Next in rotation |
| Business lounge day pass | Business, premium cabin | 18% | — | 0.21 | Filtered — not placed on Pier C |

These are not illustrations. `packages/core/test/worked-example.test.ts` asserts every one of them, so if a change to the generator or the scoring model moves any number, the build fails and the demo stops being reproducible. The generator is seeded, so every reviewer sees the same airport.

Reproduce it from a terminal:

```bash
curl -X POST localhost:4000/api/sim/jump -H 'content-type: application/json' \
     -d '{"ts":1792851000000}'
curl -s localhost:4000/api/screens/SCR-061/decision | jq '{dwell:.dwellMedian, winner:.winner.campaignId, rule:.rule}'
```

---

## How a decision is made

Every screen re-decides on its own slot, about every fifteen seconds. The pipeline is the same every time.

**1 · Profile.** Build the crowd in front of this screen. Flights at the gates in the screen's catchment are weighted by how close the gate is and how long until boarding, then their per-flight profiles are blended into one set of aggregated shares, with a crowd size, a median dwell and the largest delay in the catchment.

One detail matters more than it looks: passengers arrive for the time printed on their boarding pass, so the build-up follows the *scheduled* boarding time, while the tail follows the *actual* one. That is why a delay holds a crowd at the gate instead of dispersing it, and why the injected-delay demo makes the zone count go up rather than down.

**2 · Filter.** Drop every campaign that fails a hard rule: schedule, placement, approval status, brand safety, domestic or international, destination region, minimum crowd size, minimum dwell, budget exhausted, out of stock. Filtered campaigns keep a transparency score, so the UI can show what they *would* have scored and why they were dropped.

**3 · Score.** `match` is the expected share of this crowd the campaign's targeting reaches — a weighted noisy-OR over the targeted segments, which is why it can exceed any single segment's share. Then:

```
lift  = clamp((cvrIndex − 1) × 0.10, 0, 0.10)     // learned from real scans and redemptions
final = (match + lift) × (1 + (boost − 1) × 0.33) // triggers apply through a tunable weight
```

Every constant in that expression is editable by the Platform Admin under **Rule engine**, and every term is shown with its arithmetic in the "Why this ad?" overlay.

A campaign's limits are hard rules too: the total budget, a **daily cap** (`dailyCap`, null for none) and a frequency cap per screen per hour. A campaign past its daily cap is filtered with the reason stated, exactly like one that fails a placement rule.

**4 · Business rules.** Airline priority inside its own boarding window, competitor separation (no two perfume brands back to back), frequency cap per screen per hour, budget pacing, and manual pins from the media manager — each one logged with the reason it fired.

**5 · Verify.** This is the part that matters for an AI-driven system. The scorer proposes; it never gets the last word. Five deterministic checks run before anything reaches a screen:

- every input the decision cites exists in a trusted feed;
- every input is inside its freshness budget;
- every hard rule passes on re-check;
- the score reproduces exactly from the logged inputs;
- the creative is approved and renderable.

If any check fails, the proposal is rejected and the screen falls back to a rule-based default. Nothing the model asserts is used unless it traces back to a recorded data point, so a hallucinated fact cannot reach a screen. Every decision is stored with its full evidence trail, which any role can audit.

**6 · Learn.** Scans and redemptions per segment move each campaign's conversion index, which feeds the `lift` term in the very next decision.

---

## Data sources and the adapter layer

All airport data is mocked, but every mock looks exactly like what a real source sends. The app core only ever sees the canonical model; adapters translate.

| Source standard | Supplies | Mock format here | Canonical entities |
| --- | --- | --- | --- |
| AODB flight movements | Schedule, estimated and actual times (A-CDM: TOBT, TSAT, AIBT, AOBT), stand, gate, check-in counters, belt, aircraft, pax count, status, delay codes | CSV or JSON, one row per flight leg, 33 columns | `Flight`, `GateAssignment`, `AircraftType` |
| IATA AIDX XML | Real-time flight-leg updates: status changes, gate changes, delays | `IATA_AIDX_FlightLegNotifRQ` v16.1 pushed on a simulated feed | `FlightEvent` |
| ACI ACRIS (FIWARE Smart Data Models) | Terminals, concourses, checkpoints, zones, queues | NGSI-LD JSON entities | `Terminal`, `Zone`, `Checkpoint`, `QueueMeasurement` |
| Platform-owned | Screens, outlets, campaigns, creatives, promo codes, impressions, redemptions | SQLite tables | `Screen`, `Outlet`, `Campaign`, `Creative`, `PromoCode`, `Impression`, `Redemption` |

Each source sits behind an interface with a mock implementation and a stub live one:

```ts
interface FlightSource {
  stream(): AsyncIterable<FlightEvent>;
}

class MockAidxFlightSource implements FlightSource { … }   // used by this build
class VendorApiFlightSource implements FlightSource { … }  // the one class a go-live writes
```

Switching is a single config value per source:

```env
FLIGHT_SOURCE=mock-aidx     # | vendor-api
ZONE_SOURCE=mock-acris      # | acris-live
AODB_SOURCE=mock-file       # | vendor-rest
```

**[docs/adapters.md](docs/adapters.md)** is the guide to writing a real one: the contract, what the canonical model expects, where freshness is enforced, and how to verify a new adapter against the same tests the mocks pass.

You can see the raw feeds without leaving the app, under **Platform Admin → Feed health**, or straight from the API:

```bash
curl localhost:4000/api/feeds/aodb.csv        # 33-column AODB rows
curl localhost:4000/api/feeds/aidx/recent     # AIDX messages with their XML
curl localhost:4000/api/feeds/acris/entities  # NGSI-LD entities
```

---

## Architecture

```
External standards        Adapter layer          Canonical model        Product
─────────────────         ─────────────          ───────────────        ───────
AODB (33-col CSV)   ──▶   AodbFileAdapter   ──▶  Flight                 Platform Admin
IATA AIDX XML       ──▶   MockAidxSource    ──▶  FlightEvent            Retailer
ACI ACRIS NGSI-LD   ──▶   MockAcrisSource   ──▶  QueueMeasurement       Media Manager
                                                      │                 Airline Rep
                                                      ▼                 Passenger screen
                                                 ZonePresence                 ▲
                                                      │                       │
                                                      ▼                       │
                                            Crowd profile per screen          │
                                                      │                       │
                                                      ▼                       │
                                   filter → score → rules → verify ───────────┘
                                                      │
                                                      ▼
                                          Decision + evidence trail
```

Separate frontend and backend, REST plus Server-Sent Events for live updates, and the adapter layer isolated from business logic. **[docs/architecture.md](docs/architecture.md)** has the full diagrams, the runtime data flow and the performance notes. **[openapi.yaml](openapi.yaml)** is the API specification.

---

## Why this stack

**TypeScript end to end.** The domain — the canonical model, the generator, the adapters and the decision engine — is a single package, `@aura/core`, with no HTTP, no React and no database in it. The API and the client both import it, so the crowd profile the engine scores against and the one the "Why this ad?" overlay renders are the same type, checked by the compiler. That is the main reason to use one language here, and it is worth more than any individual framework choice.

**Fastify** for the API: fast, small, first-class TypeScript, and its plugin model keeps the SSE stream, static serving and CORS as three independent registrations rather than middleware stacked by convention.

**Drizzle ORM with better-sqlite3** for storage. The brief asks for an embedded database with migrations and a seed script, and no paid or cloud services. Drizzle's schema is TypeScript, so the row types and the domain types are checked against each other; its migrations are plain SQL files on disk that you can read, review and apply without the tool. better-sqlite3 is synchronous and in-process, which suits a read-mostly workload where the whole day is loaded into memory at boot. There is no database server to provision, which is what makes `docker compose up` the whole story.

**React with Vite** for the client: the dominant component model, instant hot reload in development, and a static bundle in production that the API serves itself, so one container and one port is the whole product.

**Server-Sent Events, not WebSocket.** Every live update in this system flows one way, from the simulation to the clients: the clock tick, a decision, a play, a redemption, an incident, an injected event. SSE is one HTTP response that proxies and load balancers already understand, it reconnects on its own, and it needs no second protocol or handshake. A WebSocket would buy bidirectional messaging the product never uses.

---

## Project layout

```
.
├── packages/core/          The domain. Canonical model, generator, adapters,
│   ├── src/                presence, crowd profile and the decision engine.
│   └── test/               The worked example, asserted.
├── apps/api/               Fastify + Drizzle. REST, SSE, the simulation clock.
│   ├── src/schema.ts       The SQLite schema, in TypeScript.
│   ├── src/sim.ts          The clock, the feeds it drives, the running state.
│   ├── src/store.ts        Every write the platform makes, in one place.
│   ├── src/seed-world.ts   Generate one day and write it to the database.
│   ├── src/smoke.ts        API integration test: boots a server, walks it.
│   └── drizzle/            Generated SQL migrations.
├── apps/web/               React + Vite client. One shell, five role surfaces.
├── scripts/                The challenge criteria as executable checks.
├── docs/architecture.md    Diagrams, runtime data flow, performance, privacy.
├── docs/adapters.md        How to write a real adapter.
├── openapi.yaml            API specification.
└── docker-compose.yml      One command.
```

---

## Configuration

Copy `.env.example` to `apps/api/.env`. Every value has a working default; nothing in the file is a secret.

| Variable | Default | Meaning |
| --- | --- | --- |
| `DATABASE_URL` | `file:./aura.db` | Embedded SQLite file |
| `PORT` / `HOST` | `4000` / `0.0.0.0` | API and static client |
| `FLIGHT_SOURCE` | `mock-aidx` | `vendor-api` for a real AIDX bus |
| `ZONE_SOURCE` | `mock-acris` | `acris-live` for a real ACRIS broker |
| `AODB_SOURCE` | `mock-file` | `vendor-rest` for a vendor AODB |
| `AI_PROVIDER` | `mock` | Offline template engine; set `openai` or `anthropic` plus a key for a live model |
| `VITE_API_URL` | `/api` | Where the client looks for the API |
| `PUBLIC_BASE_URL` | unset | What the QR codes encode. See below. |

**Scanning a QR with a real phone.** The code on a passenger screen encodes the claim page, so the phone has to be able to reach the machine running the demo. The API binds to `0.0.0.0`, so if you open the app from the laptop's LAN address (`http://192.168.1.24:4000`) the client uses that origin and the QR works with no configuration. Set `PUBLIC_BASE_URL` to pin it explicitly — useful behind a tunnel or a reverse proxy.

The creative assistant defaults to a template engine that runs with no API key, so the demo always works. `apps/api/src/ai.ts` has the provider interface; a live model is one `fetch` in `HostedCreativeProvider.generate`.

White-labelling is one object. `THEME` in `packages/core/src/reference.ts` carries the product name, the operator, the airport, the mark (inline SVG), the currency and the locale list. The UI ships in English plus one configurable second language — Arabic here, including right-to-left layout.

---

## Tests

```bash
npm test          # both suites
npm run test:domain
npm run test:api
```

**The domain suite.** `packages/core/test/worked-example.test.ts` asserts the brief's worked example end to end: that exactly the two scripted flights land in the Gate 42 catchment, that the crowd profile comes out at 58/31/22/57 with a 52-minute dwell, that the three candidates score 71%/0.86, 49%/0.52 and 18%/0.21, that the lounge is filtered for placement, that the perfume campaign wins on the delay rule, that the decision verifies, and that every piece of evidence it cites is fresh. It also checks the generated day is the size the brief asks for and that two runs produce an identical airport.

**The API integration test.** `apps/api/src/smoke.ts` boots the server on its own freshly seeded database and runs 31 checks over live HTTP: the same worked example through `GET /api/screens/:id/decision`, injecting a delay and confirming it publishes conformant `IATA_AIDX_FlightLegNotifRQ` XML with a `DelayReason`, that the delay holds the crowd at the gate rather than dispersing it, the claim flow moving a redemption onto the retailer's numbers, the 33-column AODB export, the NGSI-LD entities, the creative assistant producing a bilingual page, the approval queue, the inventory grid and the SSE stream. It found two bugs worth having: arrivals were missing their canonical boarding fields, and the API rejected empty-body POSTs, which would have broken play, pause, approve and reject for most HTTP clients.

**The criteria audit.** `npm run audit` boots the API on its own freshly seeded database and runs **126 checks** covering every scored requirement: the three adapters and their wire formats (including that the AODB export really is 33 columns and carries the A-CDM milestones), the generated day's volumes, crowd-profile completeness and plausibility, ZonePresence, every campaign-targeting field, each step of the decision pipeline, the five deterministic verification checks, cause and effect inside two seconds, the commerce and learning loop, each role's console data, the GenAI provider, white-labelling and the simulation transport. It prints one line per check and exits non-zero on any failure, so it is a checklist a reviewer can run rather than read.

Both suites and the audit run in CI on every push, along with a Docker build that starts the container and re-checks the worked example through it.

---

## Privacy and scope

Targeting is aggregated by flight, zone and time window only. The `CrowdProfile` type is the enforcement point: it holds shares and nothing else, so there is no shape in the model that could carry a boarding pass, an identity or a device identifier. No per-passenger data is collected, stored or inferred anywhere in the system, and the passenger claim page says so in plain words to the traveller reading it.

Out of scope, by design: real authentication, payments, real screen hardware and CMS players, and production hosting.

---

MIT licensed. The airport, the airlines, the retailers and every brand in this repository are fictional.
