/* Feed health. Three external standards, three adapters, one canonical
   model — and the raw messages behind each, so the claim is checkable. */

import { useState } from 'react';
import { useApp } from '../../lib/app-state';
import { useLive } from '../../lib/events';
import { hhmm } from '../../lib/format';
import {
  useAcrisEntities, useAidxRecent, useAodbCsv, useConfig, useFeeds, useNetworkMetrics
} from '../../lib/queries';
import { Modal } from '../../components/Modal';
import { AidxDialog } from '../../components/SimBar';
import {
  Chip, DataTable, Grid, Kpi, KvRow, Loading, Note, PageHead, Pad, Panel, Row, Stack, type Column
} from '../../components/primitives';
import type { FeedHealth } from '../../lib/api';
import type { FlightEvent } from '../../lib/types';

export function AdminFeeds(): JSX.Element {
  const feeds = useFeeds();
  const config = useConfig();
  const aidx = useAidxRecent(8);
  const acris = useAcrisEntities();
  const [showAodb, setShowAodb] = useState(false);
  const [showAcris, setShowAcris] = useState(false);
  const [raw, setRaw] = useState<FlightEvent | null>(null);
  const aodb = useAodbCsv(showAodb);
  const metrics = useNetworkMetrics();

  const adapters = config.data?.adapters;
  const freshness = config.data?.engine.freshness ?? {};
  const perf = metrics.data?.perf;

  return (
    <Stack>
      <PageHead
        title="Data feed health"
        lead="Three external standards, three adapters, one canonical model. Switching to a live source is one config value — no business logic changes."
      />

      <Grid cols="3">
        <FeedCard
          name="AODB"
          standard="AODB flight movements · 33 columns"
          adapter={adapters?.AODB_SOURCE ?? '—'}
          health={feeds.data?.aodb}
          budget={freshness.aodb}
          note="Snapshot of every flight leg for the day. Produces the canonical Flight, GateAssignment and AircraftType entities."
        />
        <FeedCard
          name="AIDX"
          standard="IATA_AIDX_FlightLegNotifRQ v16.1"
          adapter={adapters?.FLIGHT_SOURCE ?? '—'}
          health={feeds.data?.aidx}
          budget={freshness.aidx}
          note="Real-time leg updates pushed on the feed: status changes, gate changes, delays. Produces FlightEvent."
        />
        <FeedCard
          name="ACRIS"
          standard="ACI ACRIS / FIWARE NGSI-LD"
          adapter={adapters?.ZONE_SOURCE ?? '—'}
          health={feeds.data?.acris}
          budget={freshness.acris}
          note="Terminals, zones, checkpoints and QueueMeasurement entities, swept every 5 simulated minutes."
        />
      </Grid>

      <Panel title="Adapter contract">
        <Pad>
          <Stack>
            <pre className="xml">
{`interface FlightSource {
  stream(): AsyncIterable<FlightEvent>
}

// mock implementation, used by this playground
class MockAidxFlightSource implements FlightSource { … }

// stub, the one class a go-live writes
class VendorApiFlightSource implements FlightSource { … }

// switching is one config value
FLIGHT_SOURCE = ${adapters?.FLIGHT_SOURCE ?? 'mock-aidx'}   // | vendor-api
ZONE_SOURCE   = ${adapters?.ZONE_SOURCE ?? 'mock-acris'}  // | acris-live
AODB_SOURCE   = ${adapters?.AODB_SOURCE ?? 'mock-file'}   // | vendor-rest`}
            </pre>
            <Row>
              <button className="btn sm" type="button" onClick={() => setShowAodb(true)}>
                View AODB sample rows
              </button>
              <button className="btn sm" type="button" onClick={() => setShowAcris(true)}>
                View ACRIS entities
              </button>
            </Row>
          </Stack>
        </Pad>
      </Panel>

      <Grid cols="2">
        <Panel
          title="AIDX message stream"
          right={<Chip>{feeds.data?.aidx.messages ?? 0} total</Chip>}
        >
          <Pad tight>
            <div className="scrolly">
              <Stack>
                {(aidx.data ?? []).length === 0 && (
                  <Note>No messages yet — press play, or inject an event from the bar above.</Note>
                )}
                {(aidx.data ?? []).map((ev) => (
                  <div key={ev.id} style={{ borderBottom: '1px solid var(--line-soft)', paddingBottom: '7px' }}>
                    <div className="between">
                      <b style={{ fontSize: '12.5px' }}>{ev.flightId} · {ev.kind}</b>
                      <span className="row tight">
                        <Chip>{hhmm(ev.at)}</Chip>
                        <button className="btn sm ghost" type="button" onClick={() => setRaw(ev)}>XML</button>
                      </span>
                    </div>
                    <div className="note">
                      gate {ev.gate} · {ev.pax} pax · ETD {hhmm(ev.etdTs)}
                      {ev.delayMin ? ` · ${ev.delayMin} min late` : ''}
                    </div>
                  </div>
                ))}
              </Stack>
            </div>
          </Pad>
        </Panel>

        <Panel
          title="ACRIS NGSI-LD entity catalogue"
          right={<Chip>{feeds.data?.acris.messages ?? 0} readings swept</Chip>}
        >
          <Pad tight>
            <DataTable<AcrisRow>
              cols={acrisCols}
              rows={acrisRows(acris.data ?? [])}
              rowKey={(r) => r.id}
              empty="Sweeping on the next 5-minute boundary"
              scroll
            />
          </Pad>
        </Panel>
      </Grid>

      <Panel title="Platform performance">
        <Pad>
          <Grid cols="3">
            <Kpi
              label="API p95"
              value={`${perf?.apiP95 ?? '—'} ms`}
              tone={(perf?.apiP95 ?? 0) < 250 ? 'ok' : 'warn'}
              sub={<span className="muted">target under 250 ms</span>}
            />
            <Kpi
              label="Playlist build"
              value={`${perf?.playlistMs ?? '—'} ms`}
              tone="ok"
              sub={<span className="muted">per screen per slot</span>}
            />
            <Kpi
              label="Uptime 7 days"
              value={`${perf?.uptime7d ?? '—'}%`}
              tone="ok"
              sub={<span className="muted">rolling</span>}
            />
          </Grid>
        </Pad>
      </Panel>

      {showAodb && (
        <Modal title="AODB snapshot · 33 columns" onClose={() => setShowAodb(false)} wide>
          <Stack>
            <Note>
              One row per flight leg, exactly as a vendor AODB export delivers it. The adapter maps these
              columns onto the canonical Flight entity; nothing downstream knows which vendor produced them.
            </Note>
            {aodb.isLoading ? <Loading what="the CSV" /> : <pre className="xml">{aodb.data ?? ''}</pre>}
          </Stack>
        </Modal>
      )}

      {showAcris && (
        <Modal title="ACRIS NGSI-LD entities" onClose={() => setShowAcris(false)} wide>
          <Stack>
            <Note>
              ACI ACRIS entities in FIWARE Smart Data Model form: Terminal, Zone, Checkpoint, and the
              QueueMeasurement readings that feed ZonePresence.
            </Note>
            <pre className="xml">{JSON.stringify((acris.data ?? []).slice(0, 6), null, 2)}</pre>
          </Stack>
        </Modal>
      )}

      {raw && <AidxDialog event={raw} onClose={() => setRaw(null)} />}
    </Stack>
  );
}

function FeedCard({
  name, standard, adapter, health, budget, note
}: {
  name: string;
  standard: string;
  adapter: string;
  health?: FeedHealth;
  budget?: number;
  note: string;
}): JSX.Element {
  const { fmt } = useApp();
  const { now } = useLive();
  /* A feed is healthy while its last message is inside its own freshness
     budget — the same test the engine's verification step applies. */
  const healthy =
    health?.lastAt != null && now - health.lastAt < (health.freshnessBudgetSec ?? 900) * 1000;
  return (
    <Panel
      title={name}
      right={<Chip tone={healthy ? 'ok' : 'warn'} dot>{healthy ? 'healthy' : 'idle'}</Chip>}
    >
      <Pad>
        <Stack>
          <Grid cols="2">
            <KvRow k="Standard" v={standard} />
            <KvRow k="Adapter in use" v={adapter} />
            <KvRow k="Messages" v={fmt.n(health?.messages ?? 0)} />
            <KvRow k="Last message" v={health?.lastAt ? hhmm(health.lastAt) : '—'} />
            <KvRow k="Rate" v={`${health?.rate ?? 0} msg/min`} />
            <KvRow k="Freshness budget" v={`${health?.freshnessBudgetSec ?? budget ?? 900} s`} />
          </Grid>
          {health?.entities?.length ? (
            <Row tight>
              {health.entities.map((e) => (
                <Chip key={e} tone="info">{e}</Chip>
              ))}
            </Row>
          ) : null}
          <Note>{note}</Note>
        </Stack>
      </Pad>
    </Panel>
  );
}

/* ---- ACRIS entity rows ------------------------------------------------
   /api/feeds/acris/entities returns the FIWARE Smart Data Model catalogue
   the adapter publishes: Terminal, Zone and Checkpoint. The readings that
   feed ZonePresence are counted in the feed header, not listed here.      */

interface AcrisRow {
  id: string;
  type: string;
  name: string;
  detail: string;
}

interface NgsiProperty {
  type?: string;
  value?: unknown;
  object?: string;
}

interface AcrisEntity {
  id?: string;
  type?: string;
  name?: NgsiProperty;
  category?: NgsiProperty;
  checkpointType?: NgsiProperty;
  refZone?: NgsiProperty;
  refTerminal?: NgsiProperty;
  servedGates?: NgsiProperty;
}

function shortId(urn: string | undefined): string {
  if (!urn) return '—';
  return urn.split(':').slice(3).join(':') || urn;
}

function acrisRows(entities: unknown[]): AcrisRow[] {
  return entities
    .filter((e): e is AcrisEntity => typeof e === 'object' && e !== null)
    .slice(0, 40)
    .map((e) => {
      const gates = Array.isArray(e.servedGates?.value) ? (e.servedGates.value as unknown[]) : [];
      const detail =
        e.type === 'Zone'
          ? `${String(e.category?.value ?? '')}${gates.length ? ` · ${gates.length} gates` : ''}`
          : e.type === 'Checkpoint'
            ? `${String(e.checkpointType?.value ?? '')} · ${shortId(e.refZone?.object)}`
            : shortId(e.refTerminal?.object) || 'terminal';
      return {
        id: e.id ?? String(Math.random()),
        type: e.type ?? '—',
        name: String(e.name?.value ?? '—'),
        detail
      };
    });
}

const acrisCols: Array<Column<AcrisRow>> = [
  { label: 'Entity', render: (r) => <span className="mono">{shortId(r.id)}</span> },
  { label: 'Type', render: (r) => <Chip tone="info">{r.type}</Chip> },
  { label: 'Name', render: (r) => r.name },
  { label: 'Detail', render: (r) => <span className="note">{r.detail}</span> }
];
