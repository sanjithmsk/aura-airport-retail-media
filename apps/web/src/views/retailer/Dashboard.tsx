/* Retailer dashboard: what the shop earned today, who is about to walk
   past it, and which campaigns are carrying the result. */

import { useNavigate } from 'react-router-dom';
import { useApp } from '../../lib/app-state';
import { useLive } from '../../lib/events';
import { hhmm } from '../../lib/format';
import { useFootfall, useZoneAggregate } from '../../lib/footfall';
import { SEGMAP } from '../../lib/reference';
import { useCampaignMutations, useSim } from '../../lib/queries';
import { FootfallChart } from '../../components/FootfallChart';
import {
  BarRow, Bars, Cap, Chip, DataTable, Grid, Kpi, Kpis, Note, PageHead, Pad, Panel,
  ProfileBars, Sparkline, Stack, dayCurve, type Column
} from '../../components/primitives';
import { useOutletScope } from './use-outlet';
import type { Campaign } from '../../lib/types';

export function RetailerDashboard(): JSX.Element {
  const { fmt, outletName, pushToast } = useApp();
  const { now } = useLive();
  const navigate = useNavigate();
  const sim = useSim();
  const scope = useOutletScope(60);
  const { series } = useFootfall(scope.zones, 120, 15);
  const near = useZoneAggregate(scope.zones);
  const { update } = useCampaignMutations();

  /* Out of stock is a hard filter: the engine drops the campaign from the
     candidate set entirely until the shop says it is back. */
  const toggleStock = (c: Campaign): void => {
    const paused = !c.hard.stockPaused;
    update.mutate(
      { id: c.id, patch: { hard: { ...c.hard, stockPaused: paused } } },
      {
        onSuccess: () =>
          pushToast(
            paused ? 'Offer paused — out of stock' : 'Offer resumed — back in stock',
            paused
              ? `${c.name} is filtered out of every slot until stock returns`
              : `${c.name} is back in the running from the next slot`
          ),
        onError: () => pushToast('Could not update stock', c.name)
      }
    );
  };

  const cvr = scope.totals.scans ? scope.totals.redemptions / scope.totals.scans : 0;
  const hoursIn = Math.max(1, ((sim.data?.now ?? now) - (sim.data?.dayStart ?? now)) / 3_600_000);

  // The bar is the share of targeting weight this segment carries across the
  // retailer's live campaigns; the figure beside it is the conversion index
  // those same campaigns record, weighted the same way. Both move per segment
  // — an average taken over every campaign would print one number four times.
  const segPerf = ['family', 'holiday', 'business', 'couple']
    .map((k) => ({
      key: k,
      seg: SEGMAP[k]?.label ?? k,
      weight: segmentWeight(scope.campaigns, k),
      index: segmentCvrIndex(scope.campaigns, k)
    }))
    .sort((a, b) => b.weight - a.weight || b.index - a.index);
  const segWeightTotal = Math.max(
    0.0001,
    segPerf.reduce((t, x) => t + x.weight, 0)
  );

  return (
    <Stack>
      <PageHead
        title={outletName}
        lead={
          `${scope.outlets.length} unit${scope.outlets.length === 1 ? '' : 's'} airside · ` +
          `${scope.zones.join(', ') || '—'} · near gates ${scope.gates.slice(0, 8).join(', ') || '—'}`
        }
      />

      <Kpis>
        <Kpi
          label="Impressions today"
          value={fmt.n(scope.totals.impressions)}
          sub={<Sparkline values={dayCurve(scope.totals.impressions, hoursIn)} />}
        />
        <Kpi label="Scans" value={fmt.n(scope.totals.scans)} sub={<span className="muted">QR opens from screens</span>} />
        <Kpi label="Redemptions" value={fmt.n(scope.totals.redemptions)} tone="ok" sub={<span className="muted">claimed in store</span>} />
        <Kpi label="Conversion" value={fmt.pct(cvr, 1)} sub={<span className="muted">scan → redemption</span>} />
        <Kpi
          label="Revenue attributed"
          value={fmt.money(scope.totals.revenue)}
          tone="amber"
          sub={<Sparkline values={dayCurve(scope.totals.revenue, hoursIn)} tone="ok" />}
        />
        <Kpi
          label="Live campaigns"
          value={fmt.n(scope.campaigns.filter((c) => c.status === 'live').length)}
          sub={<span className="muted">{scope.campaigns.length} total</span>}
        />
      </Kpis>

      <Grid cols="23">
        <Panel
          title="Passenger flow near my store · next 60 minutes"
          right={
            <button className="btn sm ghost" type="button" onClick={() => navigate('/retailer/flow')}>
              Full view
            </button>
          }
        >
          <Pad>
            {near.profile ? (
              <Stack>
                <div className="row">
                  <Chip tone="amber">{fmt.n(near.pax)} pax</Chip>
                  <Chip tone="info">{fmt.pct(near.international)} international</Chip>
                  <Chip>{near.flights} {near.flights === 1 ? 'departure' : 'departures'}</Chip>
                  {near.profile.topDestinations && (
                    <Chip>top: {near.profile.topDestinations.slice(0, 3).map((d) => d[0]).join(', ')}</Chip>
                  )}
                </div>
                <FootfallChart series={series} />
                <Grid cols="2">
                  <div>
                    <Cap>Crowd mix</Cap>
                    <ProfileBars profile={near.profile} limit={5} />
                  </div>
                  <div>
                    <Cap>Top nationalities and languages</Cap>
                    <Bars>
                      {(near.profile.topNationalities ?? []).map(([n, v]) => (
                        <BarRow key={`nat-${n}`} label={n} value={v} tone="info" />
                      ))}
                      {(near.profile.topLanguages ?? []).slice(0, 2).map(([n, v]) => (
                        <BarRow key={`lang-${n}`} label={n} value={v} tone="muted" />
                      ))}
                    </Bars>
                  </div>
                </Grid>
              </Stack>
            ) : (
              <Note>No departures near this store in the next hour.</Note>
            )}
          </Pad>
        </Panel>

        <Stack>
          <Panel title="Performance by segment">
            <Pad>
              <Bars>
                {segPerf.map((s) => (
                  <BarRow
                    key={s.seg}
                    label={s.seg}
                    value={s.weight / segWeightTotal}
                    tone={s.index > 1.15 ? 'ok' : 'muted'}
                    index={`${s.index.toFixed(2)}×`}
                  />
                ))}
              </Bars>
              <Note style={{ marginTop: '8px' }}>
                {segPerf[0] && segPerf[0].weight > 0
                  ? `${segPerf[0].seg} carries the most weight in your live campaigns, and converts at ` +
                    `${segPerf[0].index.toFixed(2)}× the network average. Raising a segment's weight sends ` +
                    `more of your slots to the gates where it shows up.`
                  : 'No segment is weighted yet. Set weights in the campaign builder to steer where your slots land.'}
              </Note>
            </Pad>
          </Panel>

          <Panel title="Trigger rules">
            <Pad tight>
              <Stack>
                {scope.campaigns.flatMap((c) =>
                  (c.triggers ?? []).map((tr, i) => (
                    <div
                      className="between"
                      key={`${c.id}-${i}`}
                      style={{ padding: '6px 0', borderBottom: '1px solid var(--line-soft)' }}
                    >
                      <div>
                        <b style={{ fontSize: '12.5px' }}>{tr.label}</b>
                        <div className="note">
                          {c.name} · ×{tr.boost} boost on {(c.hard.zones ?? []).join(', ') || 'any zone'}
                        </div>
                      </div>
                      <button
                        className="btn sm ghost"
                        type="button"
                        onClick={() =>
                          update.mutate({
                            id: c.id,
                            patch: { triggers: c.triggers.filter((_x, xi) => xi !== i) }
                          })
                        }
                      >
                        Remove
                      </button>
                    </div>
                  ))
                )}
                {scope.campaigns.every((c) => !(c.triggers ?? []).length) && (
                  <Note>
                    No trigger rules yet. A rule like “if a flight at my gates is delayed over 30 minutes,
                    boost my offer” is what makes the screen react to the airport instead of the clock.
                  </Note>
                )}
              </Stack>
            </Pad>
          </Panel>
        </Stack>
      </Grid>

      <Grid cols="2">
        <Panel title="Departures feeding my store" right={<Chip>{scope.nearFlights.length} flights</Chip>}>
          <Pad tight>
            <DataTable
              cols={[
                { label: 'Flight', render: (f) => <span className="mono">{f.id}</span> },
                { label: 'To', render: (f) => f.destination },
                { label: 'Gate', render: (f) => f.gate },
                { label: 'Boards', render: (f) => <span className="mono">{hhmm(f.boardingTs)}</span> },
                { label: 'Pax', n: true, render: (f) => fmt.n(f.pax) }
              ]}
              rows={scope.nearFlights.slice(0, 10)}
              rowKey={(f) => f.id}
              empty="Nothing boarding at your gates in the window"
              scroll
            />
          </Pad>
        </Panel>

        <Panel
          title="My campaigns"
          right={
            <button className="btn sm primary" type="button" onClick={() => navigate('/retailer/builder')}>
              + New campaign
            </button>
          }
        >
          <Pad tight>
            <DataTable<Campaign>
              cols={campaignCols(fmt.n, fmt.money, toggleStock)}
              rows={scope.campaigns}
              rowKey={(c) => c.id}
              empty="No campaigns for this outlet yet"
              scroll
            />
          </Pad>
        </Panel>
      </Grid>
    </Stack>
  );
}

/** How much of this retailer's targeting weight sits on one segment. */
function segmentWeight(campaigns: Campaign[], seg: string): number {
  return campaigns.reduce((t, c) => t + (c.weights?.[seg] ?? 0), 0);
}

/** Conversion index for one segment: the campaigns that target it, weighted
 *  by how hard they target it. Returns 1 — the network average — when the
 *  segment carries no weight, which is the honest answer rather than a
 *  borrowed figure from campaigns that never aimed at it. */
function segmentCvrIndex(campaigns: Campaign[], seg: string): number {
  let num = 0;
  let den = 0;
  for (const c of campaigns) {
    const w = c.weights?.[seg] ?? 0;
    if (w <= 0) continue;
    num += (c.cvrIndex || 1) * w;
    den += w;
  }
  return den > 0 ? num / den : 1;
}

function campaignCols(
  n: (v: number) => string,
  money: (v: number) => string,
  onToggleStock: (c: Campaign) => void
): Array<Column<Campaign>> {
  return [
    { label: 'Campaign', render: (c) => c.name },
    {
      label: 'Status',
      render: (c) => (
        <Chip tone={c.status === 'live' ? 'ok' : c.status === 'pending' ? 'warn' : undefined}>{c.status}</Chip>
      )
    },
    { label: 'CPM', n: true, render: (c) => money(c.cpm) },
    { label: 'Priority', n: true, render: (c) => c.priority },
    { label: 'Budget', n: true, render: (c) => `${money(c.spent)} / ${money(c.budget)}` },
    { label: 'Conversion index', n: true, render: (c) => `${n(c.cvrIndex * 100) }%` },
    {
      /* A paused offer wears the critical chip, because that is what the
         engine does with it: filtered out, not merely deprioritised. */
      label: 'Stock',
      render: (c) => (
        <button
          className={c.hard.stockPaused ? 'chip crit' : 'chip ok'}
          type="button"
          aria-pressed={!c.hard.stockPaused}
          style={{ cursor: 'pointer' }}
          title={
            c.hard.stockPaused
              ? 'Out of stock — the engine filters this campaign out of every slot. Click to resume.'
              : 'In stock — eligible for every slot. Click to pause while the shelf is empty.'
          }
          onClick={() => onToggleStock(c)}
        >
          <span className="dot" />
          {c.hard.stockPaused ? 'Out of stock' : 'In stock'}
        </button>
      )
    }
  ];
}
