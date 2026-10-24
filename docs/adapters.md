# Writing a real adapter

All airport data in this build is mocked, but every mock emits exactly what a real source sends. The point of that discipline is this document: going live should mean writing one class and changing one config value, with no change to the decision engine, the API or the client.

This guide covers the contract, what the canonical model expects of you, where freshness is enforced, and how to prove a new adapter is correct before it touches a screen.

---

## The shape of the thing

Three interfaces, in `packages/core/src/types.ts`:

```ts
export interface AodbSource {
  readonly name: string;
  readonly format: string;
  snapshot(): Flight[] | Promise<Flight[]>;
}

export interface FlightSource {
  readonly name: string;
  readonly format: string;
  stream(): AsyncIterable<FlightEvent>;
}

export interface ZoneSource {
  readonly name: string;
  readonly format: string;
  read(zoneId: string): QueueMeasurement | null;
}
```

`name` and `format` are not decoration. They are shown to the operator under **Platform Admin → Feed health**, and they are how someone looking at a live incident at 03:00 finds out which integration is actually running.

Implementations are registered in one place, `buildAdapters` in `packages/core/src/adapters.ts`:

```ts
export function buildAdapters(world: World) {
  const flight = ADAPTER_CONFIG.FLIGHT_SOURCE === 'mock-aidx'
    ? new MockAidxFlightSource(world)
    : new VendorApiFlightSource(ADAPTER_CONFIG);
  // …zone and aodb the same way
  return { flight, zone, aodb };
}
```

and selected by environment:

```env
FLIGHT_SOURCE=mock-aidx     # | vendor-api
ZONE_SOURCE=mock-acris      # | acris-live
AODB_SOURCE=mock-file       # | vendor-rest
```

The stubs (`VendorApiFlightSource`, `AcrisLiveZoneSource`, `AodbVendorRestAdapter`) exist and throw a message naming the variables they need. Replace the body; leave the signature.

---

## 1 · AODB — the daily snapshot

An AODB export is one row per flight leg. The sample format here is 33 columns, in the order most vendor exports use:

```
FLIGHT_KEY, AIRLINE_IATA, AIRLINE_ICAO, FLIGHT_NUMBER, SUFFIX, MOVEMENT_TYPE,
SERVICE_TYPE, SCHEDULED_DATE, STD_UTC, ETD_UTC, ATD_UTC, STA_UTC, ETA_UTC,
ATA_UTC, TOBT, TSAT, AIBT, AOBT, ORIGIN_IATA, DESTINATION_IATA, VIA_IATA,
TERMINAL, GATE, STAND, CHECKIN_DESKS, BAGGAGE_BELT, AIRCRAFT_TYPE_IATA,
AIRCRAFT_REG, SEAT_CAPACITY, PAX_TOTAL, LOAD_FACTOR, FLIGHT_STATUS, DELAY_CODE_1
```

See a live sample at `GET /api/feeds/aodb.csv`.

Your adapter's only job is `toCanonical(row) → Flight`. The mock implementation (`AodbFileAdapter.toCanonical`) is the reference; a REST-backed one differs only in where the rows come from.

**What the canonical `Flight` needs from you, and why.**

| Field | Why the engine needs it |
| --- | --- |
| `gate` | Decides which screens see this flight at all. Everything else follows from the catchment. |
| `pax` | The weight of this flight in the crowd profile. A 320-passenger widebody should not count the same as a 78-seat turboprop. |
| `stdTs`, `etdTs` | Scheduled and estimated departure. The gap between them is the delay the trigger rules fire on. |
| `schedBoardingTs` | **Boarding as scheduled, and it must never move when a flight is delayed.** Passengers arrive for the time on their boarding pass, so the arrival curve follows this field while the tail follows the actual one. Get this wrong and a delay will appear to empty the gate instead of filling it. |
| `boardingTs`, `gateCloseTs` | The actual window. Drives the boarding and final-call states, the airline priority rule, and the promo-code expiry. |
| `status`, `delayCode` | Shown on the FIDS strip and written into the evidence trail. |
| `profile` | The per-flight crowd profile. See below. |

If your AODB publishes boarding times, map them. If it publishes only STD and ETD, derive them the way the generator does (`boardingTs = etdTs − 25 min`, `gateCloseTs = etdTs − 10 min`) and keep `schedBoardingTs` pinned to `stdTs − 25 min`. Put the derivation in the adapter, not in the engine.

**The crowd profile is the part you will have to source.** `Flight.profile` holds aggregated shares: trip purpose, party type, age bands, cabin mix, nationality and language, region. In this build they are generated from route, day of week, time of day and aircraft configuration. In production they come from airline aggregated booking mix, anonymised PNR statistics, APIS aggregates for international legs and survey data — never from anything that identifies a passenger. The engine does not care where the shares come from, only that they are shares. Start with the same route-and-time rules and replace them source by source; the `CrowdProfile` type will not change.

---

## 2 · AIDX — the real-time feed

`IATA_AIDX_FlightLegNotifRQ` messages push changes: status, gate, delay. The mock emits conformant XML; see `aidxMessage` in `packages/core/src/adapters.ts` and a live one at `GET /api/feeds/aidx/recent`.

```xml
<IATA_AIDX_FlightLegNotifRQ xmlns="http://www.iata.org/IATA/2007/00" Version="16.1"
    TimeStamp="2026-10-24T14:10:00Z" CorrelationID="XY501-1792851000000">
  <Originator CompanyShortName="AUR AODB"/>
  <FlightLeg>
    <LegIdentifier>
      <Airline CodeContext="3">XY</Airline>
      <FlightNumber>501</FlightNumber>
      <DepartureAirport CodeContext="3">AUR</DepartureAirport>
      <ArrivalAirport CodeContext="3">DXB</ArrivalAirport>
      <OriginDate>2026-10-24</OriginDate>
    </LegIdentifier>
    <LegData>
      <AirportResources Usage="Departure">
        <Resource DepartureTerminal="T2" DepartureGate="42" AircraftParkingPosition="C42"/>
      </AirportResources>
      <PaxCount Qualifier="TTL" Count="240"/>
      <OperationTime OperationQualifier="TDN" CodeContext="5">2026-10-24T15:25:00Z</OperationTime>
      <FlightLegStatus>DL</FlightLegStatus>
      <DelayReason DelayCode="93" DelayDuration="PT45M"/>
    </LegData>
  </FlightLeg>
</IATA_AIDX_FlightLegNotifRQ>
```

Your adapter parses that into a canonical `FlightEvent` and yields it from `stream()`. Three rules:

**Keep the raw message.** `FlightEvent.raw` carries the wire format verbatim. It is written to the `flight_events` table and surfaced in the UI, because when an operator asks why a screen changed, "here is the message that changed it" ends the conversation. Do not normalise it away.

**Set `receivedAt` to when *you* received it, not the message's `TimeStamp`.** Freshness is judged against local receipt; a vendor clock skew should show up as a stale feed, not as a fresh one.

**`stream()` must not end.** The engine treats the end of the iterable as the feed dying. For a polling source, loop with a delay inside the generator. For a push source, buffer and yield; `MockAidxFlightSource` shows the pattern with a queue and listeners.

Events flow from the adapter into `catchUpFlights`/`emitAidx` in `apps/api/src/sim.ts`, which updates the canonical `Flight` and broadcasts over SSE. A gate change clears the decision cache for the affected zone; the next slot re-plans.

---

## 3 · ACRIS — zones and queues

ACI ACRIS entities in FIWARE Smart Data Model form. The adapter deals in four: `Terminal`, `Zone`, `Checkpoint` and `QueueMeasurement`. Only the last one changes at runtime.

```json
{
  "id": "urn:ngsi-ld:QueueMeasurement:AUR:T2-SEC:1792851000000",
  "type": "QueueMeasurement",
  "refZone": { "type": "Relationship", "object": "urn:ngsi-ld:Zone:AUR:T2-SEC" },
  "peopleCount": { "type": "Property", "value": 412, "observedAt": "2026-10-24T14:10:00Z" },
  "averageWaitingTime": { "type": "Property", "value": 180, "unitCode": "SEC", "observedAt": "2026-10-24T14:10:00Z" },
  "occupancy": { "type": "Property", "value": 0.46, "observedAt": "2026-10-24T14:10:00Z" }
}
```

`read(zoneId)` returns the latest measurement for a zone as a canonical `QueueMeasurement`, or `null` when there is none. Returning `null` is a legitimate answer and the engine handles it: a zone with no sensor is estimated from flights alone.

**How the measurement is used.** `zonePresence` builds a flight-derived estimate first, then corrects it with the sensor reading — but only when the reading is within ten minutes of the window being asked about. Forecast windows get the model alone, because a queue count is a measurement, not a prediction. If your broker publishes forecasts as well, add them as a separate source rather than letting them in through `read`.

---

## Freshness, and why the engine will ignore you

Every input a decision cites carries its source, its reference and its timestamp. Before anything reaches a screen, `verifyDecision` checks each one against a budget:

```ts
ENGINE.freshness = { aodb: 900, aidx: 180, acris: 300, telemetry: 120 }  // seconds
```

If any cited input is older than its budget, the whole decision is rejected and the screen falls back to a rule-based default — and the rejection is logged with the stale source named. This is deliberate. A broken feed should visibly degrade the system, not silently keep serving yesterday's crowd.

So the adapter's job is not only to translate correctly, it is to be honest about time. Three failure modes to avoid:

- **Backfilling with a current timestamp.** If you replay a gap, stamp events with when they happened, not when you caught up.
- **Reusing the last good value.** Returning a stale measurement as if it were fresh defeats the check. Return the stale value *with its real timestamp*, or return `null`.
- **Swallowing errors.** If the source is unreachable, let the feed go quiet. The feed-health view and the freshness check will both show it within one budget window.

---

## Verifying a new adapter

Work in this order.

**1 · Shape.** Point the adapter at a recorded sample and assert the canonical output field by field. The three mock adapters are themselves the reference implementations; the quickest check is that a round trip through your adapter and the engine produces the same `ZonePresence` as the mock does for the same inputs.

**2 · The worked example still holds.** `packages/core/test/worked-example.test.ts` asserts the Gate 42 scene end to end. It runs against the generator, not against your feed, so it should be untouched by an adapter change — if it breaks, you have changed the engine, not the adapter.

**3 · Freshness behaves.** Feed a deliberately stale input and confirm the decision falls back rather than playing. `GET /api/screens/:id/decision` returns `fallback: true` with `fallbackReason` naming the failed check.

**4 · Watch it live.** `GET /api/feeds` reports messages, rate, last message time and the adapter in use for all three sources. Run the simulation at 60× and confirm your rate and last-message time stay sane under load.

---

## A note on what not to put in an adapter

The adapter translates. It does not decide.

Resist putting targeting logic, business rules or scoring into the translation layer, however convenient the vendor's extra fields look. The engine's guarantee is that a decision reproduces from its logged inputs; that only holds while the inputs are plain data. If a vendor field genuinely improves targeting, add it to the canonical model and to `CrowdProfile`, and let every adapter decide how to populate it — including with nothing.
