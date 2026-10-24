/* My flights. Departures today with the aggregated profile of the
   passengers behind them — no boarding-pass, identity or device data,
   only shares of a flight, a zone and a time window. */

import { useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { useApp } from '../../lib/app-state';
import { useLive } from '../../lib/events';
import { hhmm } from '../../lib/format';
import { useZoneAggregate } from '../../lib/footfall';
import { previewScore } from '../../lib/preview-score';
import { airlineOf, cityOf } from '../../lib/reference';
import {
  useCampaigns, useDecisions, useFlights, useInvalidateAfterInjection, useScreens, useZones
} from '../../lib/queries';
import { Modal } from '../../components/Modal';
import { WhyBody } from '../../components/WhyPanel';
import {
  BarRow, Bars, Cap, Chip, DataTable, FlightStatusChip, Grid, Kpi, Kpis, Note,
  PageHead, Pad, Panel, ProfileBars, Stack, type Column
} from '../../components/primitives';
import type { Campaign, CrowdProfile, Decision, Flight } from '../../lib/types';

export function AirlineFlights(): JSX.Element {
  const { fmt, airlineCode, pushToast } = useApp();
  const { now } = useLive();
  const airline = airlineOf(airlineCode);
  const flightsQ = useFlights({ direction: 'D', airline: airlineCode, limit: 400 });
  const zones = useZones();
  const campaigns = useCampaigns();
  const invalidate = useInvalidateAfterInjection();

  const all = useMemo(
    () => (flightsQ.data ?? []).slice().sort((a, b) => a.etdTs - b.etdTs),
    [flightsQ.data]
  );
  const live = useMemo(
    () => all.filter((f) => f.etdTs > now - 30 * 60_000 && f.etdTs < now + 8 * 3_600_000),
    [all, now]
  );
  const delayed = all.filter((f) => f.delayMin >= 15);
  const seats = all.reduce((s, f) => s + f.pax, 0);

  /* The passenger mix is read off the zones my live gates sit in, which is
     how the engine sees them too. */
  const myGates = useMemo(() => Array.from(new Set(live.map((f) => f.gate))), [live]);
  const myZones = useMemo(() => {
    const gates = new Set(myGates);
    return Array.from(
      new Set(
        (zones.data ?? [])
          .filter((z) => z.gates.some((g) => gates.has(g)))
          .map((z) => z.id)
      )
    );
  }, [myGates, zones.data]);
  const crowd = useZoneAggregate(myZones);

  const delay45 = async (flightId: string): Promise<void> => {
    await api.injectDelay(flightId, 45);
    invalidate();
    pushToast('Delay published', `${flightId} +45 min`);
  };

  return (
    <Stack>
      <PageHead
        title={airline?.name ?? airlineCode}
        lead="Departures today, with the aggregated profile of your passengers. No boarding-pass, identity or device data — every figure is a share of a flight, a zone and a time window."
      />

      <Kpis>
        <Kpi
          label="Departures today"
          value={fmt.n(all.length)}
          sub={<span className="muted">{live.length} in the next 8 hours</span>}
        />
        <Kpi label="Seats sold" value={fmt.n(seats)} sub={<span className="muted">across the day</span>} />
        <Kpi
          label="Average load"
          value={fmt.pct(all.length ? all.reduce((s, f) => s + f.loadFactor, 0) / all.length : 0, 1)}
          sub={<span className="muted">load factor</span>}
        />
        <Kpi
          label="Delayed"
          value={fmt.n(delayed.length)}
          tone={delayed.length > 3 ? 'warn' : 'ok'}
          sub={<span className="muted">over 15 minutes</span>}
        />
        <Kpi
          label="Premium mix"
          value={crowd.profile ? fmt.pct(crowd.profile.premiumCabin) : '—'}
          sub={<span className="muted">of passengers in terminal</span>}
        />
        <Kpi
          label="In the catchment"
          value={fmt.n(crowd.pax)}
          tone="amber"
          sub={<span className="muted">at my gates now</span>}
        />
      </Kpis>

      <Panel title="Timeline" right={<span className="note">next eight hours · the marker is simulation time</span>}>
        <Pad>
          <FlightTimeline flights={live.slice(0, 16)} now={now} />
        </Pad>
      </Panel>

      <Grid cols="23">
        <Panel title="My flights" right={<Chip>{live.length} live</Chip>}>
          <Pad tight>
            <DataTable<Flight>
              cols={flightCols(fmt.n, fmt.pct, (id) => void delay45(id))}
              rows={live.slice(0, 20)}
              rowKey={(f) => f.id}
              scroll
              empty="No departures in the window"
            />
          </Pad>
        </Panel>

        <Stack>
          <Panel title="Who is flying with me">
            <Pad>
              {crowd.profile ? (
                <Stack>
                  <ProfileBars profile={crowd.profile} />
                  <Cap style={{ marginTop: '6px' }}>Top destinations</Cap>
                  <Bars>
                    {(crowd.profile.topDestinations ?? []).map(([d, v]) => (
                      <BarRow key={d} label={d} value={v} tone="info" />
                    ))}
                  </Bars>
                </Stack>
              ) : (
                <Note>No live departures.</Note>
              )}
            </Pad>
          </Panel>

          <Panel title="Partner offers ranked for my passengers">
            <Pad tight>
              {crowd.profile ? (
                <PartnerOffers campaigns={campaigns.data ?? []} profile={crowd.profile} />
              ) : (
                <Note>No live departures.</Note>
              )}
            </Pad>
          </Panel>
        </Stack>
      </Grid>

      <PlayedAtMyGates gates={myGates} />
    </Stack>
  );
}

/* ---- what played at my gates, and why --------------------------------- */

interface PlayedRow {
  key: string;
  decision: Decision;
  gate: string;
  screenName: string;
  advertiser: string;
  score: number | null;
  rule: string;
}

function PlayedAtMyGates({ gates }: { gates: string[] }): JSX.Element {
  const { fmt } = useApp();
  const screens = useScreens();
  const decisions = useDecisions(undefined, 60);
  const campaigns = useCampaigns();
  const [open, setOpen] = useState<Decision | null>(null);

  /* My gates come from my live departures; the screens that serve them are
     the ones whose catchment includes one of those gates. */
  const myScreens = useMemo(() => {
    if (!gates.length) return new Map<string, { name: string; gate: string }>();
    const gateSet = new Set(gates);
    const out = new Map<string, { name: string; gate: string }>();
    (screens.data ?? []).forEach((s) => {
      const hit = s.nearGates.find((g) => gateSet.has(g));
      if (hit) out.set(s.id, { name: s.name, gate: hit });
    });
    return out;
  }, [gates, screens.data]);

  const rows = useMemo<PlayedRow[]>(() => {
    return (decisions.data ?? [])
      .filter((d) => myScreens.has(d.screenId) && !d.empty)
      .slice(0, 14)
      .map((d, i) => {
        const screen = myScreens.get(d.screenId);
        return {
          key: `${d.screenId}-${d.at}-${i}`,
          decision: d,
          gate: screen?.gate ?? '—',
          screenName: d.screenName ?? screen?.name ?? d.screenId,
          advertiser:
            d.winnerCampaign?.advertiser ??
            d.winner?.campaignId ??
            'house content',
          score: d.winner ? d.winner.final : null,
          rule: d.rule ?? (d.fallback ? 'rule-based fallback' : '—')
        };
      });
  }, [decisions.data, myScreens]);

  const cols: Array<Column<PlayedRow>> = [
    { label: 'Time', render: (r) => <span className="mono">{hhmm(r.decision.at)}</span> },
    { label: 'Screen', render: (r) => r.screenName },
    { label: 'Gate', render: (r) => r.gate },
    { label: 'What played', render: (r) => r.advertiser },
    {
      label: 'Score',
      n: true,
      render: (r) => (r.score != null ? <Chip tone="amber">{r.score.toFixed(2)}</Chip> : <span className="muted">—</span>)
    },
    { label: 'Winning rule', render: (r) => <span className="note">{r.rule}</span> },
    {
      /* The whole row opens the explanation; the button is the visible
         affordance for it, so it must not fire the row handler as well. */
      label: '',
      render: (r) => (
        <button
          className="btn sm ghost"
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setOpen(r.decision);
          }}
        >
          Why
        </button>
      )
    }
  ];

  return (
    <Panel
      title="What played at my gates, and why"
      right={<Chip>{myScreens.size} screens · {gates.length} gates</Chip>}
    >
      <Pad tight>
        <Stack>
          <DataTable<PlayedRow>
            cols={cols}
            rows={rows}
            rowKey={(r) => r.key}
            onRow={(r) => setOpen(r.decision)}
            scroll
            empty="Nothing has played at your gates in the last few slots — press play on the simulation bar."
          />
          <Note>
            Every row is one decision the engine logged for a screen in your gates&rsquo; catchment, with the
            score it won on. Open one to see the crowd it was built from, the candidates it beat and the
            evidence behind it — {fmt.n(rows.length)} shown from the last 60 decisions.
          </Note>
        </Stack>
      </Pad>

      {open && (
        <Modal title={`Why this played · ${open.screenName ?? open.screenId}`} onClose={() => setOpen(null)} wide>
          <WhyBody decision={open} campaigns={campaigns.data ?? []} />
        </Modal>
      )}
    </Panel>
  );
}

function flightCols(
  n: (v: number) => string,
  pct: (v: number) => string,
  onDelay: (id: string) => void
): Array<Column<Flight>> {
  return [
    { label: 'Flight', render: (f) => <span className="mono">{f.id}</span> },
    { label: 'To', render: (f) => `${f.destination} · ${cityOf(f.destination)}` },
    { label: 'Gate', render: (f) => f.gate },
    { label: 'STD', render: (f) => <span className="mono">{hhmm(f.stdTs)}</span> },
    { label: 'ETD', render: (f) => <span className="mono">{hhmm(f.etdTs)}</span> },
    {
      label: 'Delay',
      n: true,
      render: (f) => (f.delayMin ? <Chip tone="warn">+{f.delayMin} min</Chip> : <span className="muted">—</span>)
    },
    { label: 'Pax', n: true, render: (f) => n(f.pax) },
    { label: 'Load', n: true, render: (f) => pct(f.loadFactor) },
    { label: 'Status', render: (f) => <FlightStatusChip status={f.status} /> },
    {
      label: '',
      render: (f) => (
        <button className="btn sm ghost" type="button" onClick={() => onDelay(f.id)}>Delay 45</button>
      )
    }
  ];
}

export function rankedPartnerOffers(
  campaigns: Campaign[],
  profile: CrowdProfile
): Array<{ campaign: Campaign; match: number }> {
  return campaigns
    .filter((c) => c.status === 'live' && c.category !== 'airline')
    .map((c) => ({
      campaign: c,
      match: previewScore(
        { weights: c.weights, cvrIndex: c.cvrIndex, triggers: [] },
        { profile, confidence: 1, maxDelay: 0 }
      ).match
    }))
    .sort((a, b) => b.match - a.match);
}

function PartnerOffers({
  campaigns, profile
}: {
  campaigns: Campaign[];
  profile: CrowdProfile;
}): JSX.Element {
  const { fmt } = useApp();
  const offers = rankedPartnerOffers(campaigns, profile).slice(0, 6);
  return (
    <DataTable
      cols={[
        { label: 'Offer', render: (r) => `${r.campaign.advertiser} — ${r.campaign.name}` },
        {
          label: 'Fit',
          n: true,
          render: (r) => <Chip tone={r.match > 0.5 ? 'ok' : undefined}>{fmt.pct(r.match)}</Chip>
        }
      ]}
      rows={offers}
      rowKey={(r) => r.campaign.id}
      empty="No live campaigns to rank"
    />
  );
}

/* ---- timeline --------------------------------------------------------- */

function FlightTimeline({ flights, now }: { flights: Flight[]; now: number }): JSX.Element {
  const span = 8 * 3_600_000;
  const start = now - 30 * 60_000;

  if (!flights.length) return <p className="note">No departures in the window.</p>;

  return (
    <Stack gap={4}>
      {flights.map((f) => {
        const left = Math.max(0, ((f.boardingTs - start) / span) * 100);
        const width = Math.max(2, ((f.etdTs - f.boardingTs) / span) * 100);
        const colour =
          f.delayMin >= 15 ? 'var(--warn)' : f.status === 'boarding' ? 'var(--ok)' : 'var(--accent)';
        return (
          <div
            key={f.id}
            style={{ display: 'grid', gridTemplateColumns: '92px 1fr', gap: '8px', alignItems: 'center' }}
          >
            <span className="mono" style={{ fontSize: '11.5px' }}>{f.id} {f.gate}</span>
            <div className="tl">
              <div
                className="blk"
                style={{ left: `${left}%`, width: `${width}%`, background: colour }}
                title={`${f.id} → ${f.destination} · boards ${hhmm(f.boardingTs)} · ETD ${hhmm(f.etdTs)}`}
              >
                {f.destination} {hhmm(f.etdTs)}
              </div>
              <div className="nowline" style={{ left: `${((now - start) / span) * 100}%` }} />
            </div>
          </div>
        );
      })}
    </Stack>
  );
}
