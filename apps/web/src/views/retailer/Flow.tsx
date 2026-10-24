/* Passenger flow near the store: the same ZonePresence estimate the ad
   engine scores against, forecast forward two hours. */

import { useApp } from '../../lib/app-state';
import { hhmm } from '../../lib/format';
import { useFootfall, useZoneAggregate } from '../../lib/footfall';
import { cityOf } from '../../lib/reference';
import { FootfallChart } from '../../components/FootfallChart';
import {
  BarRow, Bars, Cap, Chip, DataTable, FlightStatusChip, Grid, Kpi, Kpis, Note,
  PageHead, Pad, Panel, ProfileBars, Stack
} from '../../components/primitives';
import { useOutletScope } from './use-outlet';

export function RetailerFlow(): JSX.Element {
  const { fmt } = useApp();
  const scope = useOutletScope(120);
  const { series } = useFootfall(scope.zones, 120, 15);
  const near = useZoneAggregate(scope.zones);

  const peak = series.reduce(
    (a, b) => (b.pax > a.pax ? b : a),
    series[0] ?? { ts: 0, pax: 0, international: 0 }
  );
  const next60 = series.slice(0, 4).reduce((s, p) => Math.max(s, p.pax), 0);
  const topDest = near.profile?.topDestinations?.[0];

  return (
    <Stack>
      <PageHead
        title="Passenger flow near my store"
        lead={
          `Derived from departures at gates ${scope.gates.slice(0, 8).join(', ') || '—'} plus ACRIS queue ` +
          `readings for ${scope.zones.join(' and ') || '—'}. This is the same ZonePresence estimate the ad ` +
          'engine scores against.'
        }
      />

      <Kpis>
        <Kpi label="Next 60 min" value={fmt.n(next60)} sub={<span className="muted">passengers in the catchment</span>} />
        <Kpi
          label="Next 2 hours"
          value={fmt.n(near.pax)}
          sub={<span className="muted">{scope.nearFlights.length} departures</span>}
        />
        <Kpi label="International" value={fmt.pct(near.international)} sub={<span className="muted">share of the crowd</span>} />
        <Kpi
          label="Busiest window"
          value={peak.ts ? hhmm(peak.ts) : '—'}
          tone="amber"
          sub={<span className="muted">{peak.ts ? `${fmt.n(peak.pax)} pax` : ''}</span>}
        />
        <Kpi label="Median dwell" value={`${near.dwellMedian} min`} sub={<span className="muted">to boarding</span>} />
        <Kpi
          label="Top destination"
          value={topDest ? topDest[0] : '—'}
          sub={<span className="muted">{topDest ? `${fmt.pct(topDest[1])} of the crowd` : ''}</span>}
        />
      </Kpis>

      <Panel title="Footfall, next two hours" right={<span className="note">15-minute windows</span>}>
        <Pad>
          <FootfallChart series={series} />
        </Pad>
      </Panel>

      <Grid cols="2">
        <Panel title="Who is coming">
          <Pad>
            {near.profile ? (
              <Stack>
                <ProfileBars profile={near.profile} />
                <Grid cols="2">
                  <div>
                    <Cap>Top destinations</Cap>
                    <Bars>
                      {(near.profile.topDestinations ?? []).map(([d, v]) => (
                        <BarRow key={d} label={d} value={v} tone="info" />
                      ))}
                    </Bars>
                  </div>
                  <div>
                    <Cap>Top nationalities</Cap>
                    <Bars>
                      {(near.profile.topNationalities ?? []).map(([n, v]) => (
                        <BarRow key={n} label={n} value={v} tone="muted" />
                      ))}
                    </Bars>
                  </div>
                </Grid>
              </Stack>
            ) : (
              <Note>No departures in the window.</Note>
            )}
          </Pad>
        </Panel>

        <Panel
          title="Departures feeding my zone"
          right={<Chip>{scope.nearFlights.length} flights</Chip>}
        >
          <Pad tight>
            <DataTable
              cols={[
                { label: 'Flight', render: (f) => <span className="mono">{f.id}</span> },
                { label: 'To', render: (f) => `${f.destination} ${cityOf(f.destination)}` },
                { label: 'Gate', render: (f) => f.gate },
                { label: 'Boards', render: (f) => <span className="mono">{hhmm(f.boardingTs)}</span> },
                { label: 'Pax', n: true, render: (f) => fmt.n(f.pax) },
                { label: 'Status', render: (f) => <FlightStatusChip status={f.status} /> }
              ]}
              rows={scope.nearFlights.slice(0, 14)}
              rowKey={(f) => f.id}
              scroll
              empty="No departures at your gates in the window"
            />
          </Pad>
        </Panel>
      </Grid>
    </Stack>
  );
}
