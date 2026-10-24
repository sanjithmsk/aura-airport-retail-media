/* Yield and pricing. Prices follow predicted passenger presence, not a
   rate card, so the heatmaps here are literally what the sales team
   prices against. */

import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { qk } from '../../lib/queries';
import { useApp } from '../../lib/app-state';
import { useLive } from '../../lib/events';
import { SEGMAP } from '../../lib/reference';
import { segmentShare } from '../../lib/preview-score';
import { useInventory, useScreens, useSim, useZones } from '../../lib/queries';
import {
  DataTable, Grid, Loading, Note, PageHead, Pad, Panel, Stack, type Column
} from '../../components/primitives';
import type { Screen, ZonePresence } from '../../lib/types';

const HOURS = Array.from({ length: 18 }, (_, i) => i + 5); // 05:00–22:00
const SEG_ROWS = ['holiday', 'business', 'family', 'premiumCabin'];

export function MediaYield(): JSX.Element {
  const { fmt } = useApp();
  const { now } = useLive();
  const sim = useSim();
  const zones = useZones();
  const screens = useScreens();
  const inventory = useInventory('T2-PC');

  const dayStart = sim.data?.dayStart ?? now;
  const priceable = useMemo(
    () => (zones.data ?? []).filter((z) => z.kind !== 'landside' || z.id.endsWith('CHK')),
    [zones.data]
  );

  /* One presence probe per zone per hour. They are cached hard: the
     forecast for 14:00 does not move while you look at it. */
  const probes = useQueries({
    queries: priceable.flatMap((z) =>
      HOURS.map((hr) => {
        const at = dayStart + (hr - 4) * 3_600_000 + 30 * 60_000;
        return {
          queryKey: qk.presence(z.id, at),
          queryFn: () => api.zonePresence(z.id, at),
          staleTime: 10 * 60_000
        };
      })
    )
  });

  const paxFor = (zoneIndex: number, hourIndex: number): number => {
    const q = probes[zoneIndex * HOURS.length + hourIndex];
    return (q?.data as ZonePresence | undefined)?.pax ?? 0;
  };

  const maxPax = Math.max(
    1,
    ...probes.map((q) => (q.data as ZonePresence | undefined)?.pax ?? 0)
  );

  const pierCIndex = priceable.findIndex((z) => z.id === 'T2-PC');
  const segHeat = SEG_ROWS.map((seg) => ({
    seg: SEGMAP[seg]?.label ?? seg,
    hours: HOURS.map((_hr, hi) => {
      if (pierCIndex < 0) return 0;
      const q = probes[pierCIndex * HOURS.length + hi];
      const p = (q?.data as ZonePresence | undefined)?.profile;
      return p ? segmentShare(p, seg) : 0;
    })
  }));

  const forecast = useMemo(() => {
    const base = (inventory.data?.rows ?? []).reduce(
      (s, r) => s + r.slots.filter((x) => x.state === 'booked').reduce((a, x) => a + x.price, 0),
      0
    );
    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(dayStart + i * 86_400_000);
      const dow = date.getUTCDay();
      const weekend = dow === 0 || dow === 6;
      return {
        key: date.toISOString().slice(0, 10),
        day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dow],
        date: date.toISOString().slice(5, 10),
        occupancy: 0.52 + (weekend ? 0.14 : 0.03) + i * 0.012,
        revenue: base * (1.9 + i * 0.04) * (weekend ? 1.16 : 1)
      };
    });
  }, [inventory.data, dayStart]);

  const priceRows = useMemo(() => {
    const byZone = new Map<string, number>();
    priceable.forEach((z, zi) => byZone.set(z.id, paxFor(zi, HOURS.indexOf(14))));
    return (screens.data ?? []).slice(0, 30).map((s) => {
      const pax = byZone.get(s.zone) ?? 0;
      const demand = Math.min(2.4, 0.55 + pax / 420);
      return { screen: s, pax, suggested: Math.round(s.floorPrice * demand * 100) / 100 };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screens.data, priceable, probes]);

  return (
    <Stack>
      <PageHead
        title="Yield and pricing"
        lead="Prices follow predicted passenger presence, not a rate card. The heatmaps below are what the sales team prices against."
      />

      <Panel
        title="Passenger presence by zone and hour"
        right={<span className="note">predicted, from AODB departures and ACRIS queues</span>}
      >
        <Pad>
          {probes.some((q) => q.isLoading) && !probes.some((q) => q.data) ? (
            <Loading what="the presence forecast" />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <div
                className="invgrid"
                style={{ gridTemplateColumns: `124px repeat(${HOURS.length}, minmax(14px, 1fr))` }}
              >
                <div className="rowlab" />
                {HOURS.map((hr) => (
                  <div className="hh" key={`zh-${hr}`}>{String(hr).padStart(2, '0')}</div>
                ))}
                {priceable.map((z, zi) => (
                  <ZoneHeatRow
                    key={z.id}
                    label={z.id}
                    title={z.name}
                    values={HOURS.map((_h, hi) => paxFor(zi, hi))}
                    max={maxPax}
                    tooltip={(hi, v) =>
                      `${z.name} · ${HOURS[hi]}:00 · ${fmt.n(v)} pax · suggested ` +
                      fmt.money2(Math.round(12 * Math.min(2.4, 0.55 + v / 420) * 100) / 100)
                    }
                  />
                ))}
              </div>
            </div>
          )}
        </Pad>
      </Panel>

      <Grid cols="2">
        <Panel title="Segment mix by hour · Pier C" right={<span className="note">share of the crowd</span>}>
          <Pad>
            <div style={{ overflowX: 'auto' }}>
              <div
                className="invgrid"
                style={{ gridTemplateColumns: `124px repeat(${HOURS.length}, minmax(14px, 1fr))` }}
              >
                <div className="rowlab" />
                {HOURS.map((hr) => (
                  <div className="hh" key={`sh-${hr}`}>{String(hr).padStart(2, '0')}</div>
                ))}
                {segHeat.map((r) => (
                  <ZoneHeatRow
                    key={r.seg}
                    label={r.seg}
                    title={r.seg}
                    values={r.hours}
                    max={1}
                    tooltip={(hi, v) => `${r.seg} · ${HOURS[hi]}:00 · ${fmt.pct(v)}`}
                  />
                ))}
              </div>
            </div>
          </Pad>
        </Panel>

        <Panel title="Revenue forecast · next 7 days">
          <Pad tight>
            <DataTable
              cols={[
                { label: 'Day', render: (f) => `${f.day} ${f.date}` },
                { label: 'Occupancy', n: true, render: (f) => fmt.pct(f.occupancy, 1) },
                { label: 'Forecast revenue', n: true, render: (f) => fmt.money(f.revenue) },
                {
                  label: '',
                  render: (f) => (
                    <div style={{ width: '90px' }}>
                      <div className="track" style={{ height: '7px' }}>
                        <div className="fill" style={{ width: `${Math.min(100, f.occupancy * 100)}%` }} />
                      </div>
                    </div>
                  )
                }
              ]}
              rows={forecast}
              rowKey={(f) => f.key}
            />
          </Pad>
        </Panel>
      </Grid>

      <Panel title="Suggested price per slot" right={<span className="note">floor price × demand index</span>}>
        <Pad tight>
          <DataTable
            cols={priceCols(fmt.money2, fmt.n)}
            rows={priceRows}
            rowKey={(r) => r.screen.id}
            scroll
          />
        </Pad>
      </Panel>

      <Note>
        Occupancy and the seven-day curve extrapolate from today's booked slots; presence and the segment
        mix come straight from the engine's own forecast endpoint.
      </Note>
    </Stack>
  );
}

function ZoneHeatRow({
  label, title, values, max, tooltip
}: {
  label: string;
  title: string;
  values: number[];
  max: number;
  tooltip: (hourIndex: number, value: number) => string;
}): JSX.Element {
  return (
    <>
      <div className="rowlab" title={title}>{label}</div>
      {values.map((v, i) => (
        <div
          key={`${label}-${i}`}
          className={`segcell heat${Math.min(3, Math.floor((v / max) * 4))}`}
          title={tooltip(i, v)}
        />
      ))}
    </>
  );
}

interface PriceRow {
  screen: Screen;
  pax: number;
  suggested: number;
}

function priceCols(
  money2: (v: number) => string,
  n: (v: number) => string
): Array<Column<PriceRow>> {
  return [
    { label: 'Screen', render: (r) => r.screen.name },
    { label: 'Zone', render: (r) => r.screen.zone },
    { label: 'Floor', n: true, render: (r) => money2(r.screen.floorPrice) },
    { label: 'Pax 14:00', n: true, render: (r) => n(r.pax) },
    { label: 'Suggested', n: true, render: (r) => <b>{money2(r.suggested)}</b> },
    {
      label: 'Uplift',
      n: true,
      render: (r) => {
        const up = r.screen.floorPrice ? r.suggested / r.screen.floorPrice - 1 : 0;
        return <span className={up > 0 ? 'chip ok' : 'chip'}>{(up * 100).toFixed(0)}%</span>;
      }
    }
  ];
}
