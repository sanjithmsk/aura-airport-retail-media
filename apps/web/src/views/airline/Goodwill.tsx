/* Delay goodwill automation. When a flight goes past the threshold the
   platform pushes a voucher to the screens at that gate, co-funded with an
   F&B partner. No one has to be watching for it to happen. */

import { useMemo, useState } from 'react';
import { useApp } from '../../lib/app-state';
import { useLive } from '../../lib/events';
import { hhmm } from '../../lib/format';
import { cityOf } from '../../lib/reference';
import { useFlights, useOutlets } from '../../lib/queries';
import {
  Chip, DataTable, Field, Grid, Note, PageHead, Pad, Panel, Row, Stack, type Column
} from '../../components/primitives';
import type { Flight, Outlet } from '../../lib/types';

interface Voucher {
  id: string;
  flightId: string;
  destination: string;
  gate: string;
  delayMin: number;
  pax: number;
  voucher: string;
  partner: string;
  coFund: string;
  cost: number;
  status: string;
}

export function AirlineGoodwill(): JSX.Element {
  const { fmt, airlineCode, pushToast } = useApp();
  const { now } = useLive();
  const [threshold, setThreshold] = useState(60);
  const [voucherKind, setVoucherKind] = useState('auto');
  const [split, setSplit] = useState('50 / 50');
  const [pushed, setPushed] = useState<Voucher[]>([]);

  const flightsQ = useFlights({ direction: 'D', airline: airlineCode, limit: 400 });
  const outlets = useOutlets();

  const delayed = useMemo(
    () =>
      (flightsQ.data ?? [])
        .filter((f) => f.delayMin >= threshold && f.status !== 'departed' && f.etdTs > now - 60 * 60_000)
        .sort((a, b) => b.delayMin - a.delayMin),
    [flightsQ.data, threshold, now]
  );

  const runNow = (): void => {
    const existing = new Set(pushed.map((g) => g.flightId));
    const added = delayed
      .filter((f) => !existing.has(f.id))
      .map((f) => buildVoucher(f, outlets.data ?? [], pushed.length, voucherKind, split));
    if (!added.length) {
      pushToast('Rule evaluated', 'Nothing new past the threshold');
      return;
    }
    setPushed([...added, ...pushed]);
    pushToast('Vouchers pushed', `${added.length} flight${added.length === 1 ? '' : 's'} covered`);
  };

  const committed = pushed.reduce((s, g) => s + g.cost, 0);

  return (
    <Stack>
      <PageHead
        title="Delay goodwill automation"
        lead="When one of your flights goes past the threshold, the platform pushes a voucher to the screens at that gate, co-funded with an F&B partner. No one has to be watching for it to happen."
      />

      <Panel title="Rule" right={<Chip tone="ok">armed</Chip>}>
        <Pad>
          <Row>
            <Field label="Trigger when delay exceeds">
              <input
                className="input"
                type="number"
                min={15}
                step={15}
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
              />
            </Field>
            <Field label="Voucher">
              <select className="input" value={voucherKind} onChange={(e) => setVoucherKind(e.target.value)}>
                <option value="auto">Automatic by delay length</option>
                <option value="meal">Meal voucher €12</option>
                <option value="lounge">Lounge pass</option>
              </select>
            </Field>
            <Field label="Co-funding split">
              <select className="input" value={split} onChange={(e) => setSplit(e.target.value)}>
                <option>50 / 50</option>
                <option>60 / 40</option>
              </select>
            </Field>
            <Field label=" ">
              <button className="btn" type="button" onClick={runNow}>Run now</button>
            </Field>
          </Row>
        </Pad>
      </Panel>

      <Grid cols="2">
        <Panel
          title="Flights past the threshold"
          right={<Chip tone={delayed.length ? 'warn' : 'ok'}>{delayed.length} flights</Chip>}
        >
          <Pad tight>
            <DataTable<Flight>
              cols={[
                { label: 'Flight', render: (f) => <span className="mono">{f.id}</span> },
                { label: 'To', render: (f) => `${f.destination} · ${cityOf(f.destination)}` },
                { label: 'Gate', render: (f) => f.gate },
                { label: 'Delay', n: true, render: (f) => <Chip tone="warn">+{f.delayMin} min</Chip> },
                { label: 'Pax', n: true, render: (f) => fmt.n(f.pax) },
                { label: 'ETD', render: (f) => <span className="mono">{hhmm(f.etdTs)}</span> }
              ]}
              rows={delayed.slice(0, 10)}
              rowKey={(f) => f.id}
              empty="Nothing delayed past the threshold right now"
            />
          </Pad>
        </Panel>

        <Panel
          title="Vouchers pushed"
          right={<Chip tone="amber">{fmt.money(committed)} committed</Chip>}
        >
          <Pad tight>
            <DataTable<Voucher>
              cols={voucherCols(fmt.n, fmt.money)}
              rows={pushed}
              rowKey={(g) => g.id}
              empty="None yet. Inject a delay over the threshold, then run the rule."
            />
          </Pad>
        </Panel>
      </Grid>

      <Note>
        A deployment arms this rule server-side so it fires without the page open. Here it evaluates on
        demand against the same delayed-flight list the engine's delay triggers read.
      </Note>
    </Stack>
  );
}

function buildVoucher(
  flight: Flight,
  outlets: Outlet[],
  seq: number,
  kind: string,
  split: string
): Voucher {
  const partner =
    outlets.find((o) => o.category === 'coffee' && o.nearGates.includes(flight.gate)) ??
    outlets.find((o) => o.category === 'coffee');
  const lounge = kind === 'lounge' || (kind === 'auto' && flight.delayMin >= 120);
  return {
    id: `GW-${String(seq + 1).padStart(3, '0')}`,
    flightId: flight.id,
    destination: flight.destination,
    gate: flight.gate,
    delayMin: flight.delayMin,
    pax: flight.pax,
    voucher: lounge ? 'Lounge pass' : 'Meal voucher €12',
    partner: partner?.name ?? 'Brew & Bloom Coffee',
    coFund: kind === 'auto' ? (lounge ? '60 / 40' : '50 / 50') : split,
    cost: Math.round(flight.pax * (lounge ? 4.2 : 2.6) * 100) / 100,
    status: 'auto-pushed'
  };
}

function voucherCols(
  n: (v: number) => string,
  money: (v: number) => string
): Array<Column<Voucher>> {
  return [
    { label: 'Flight', render: (g) => <span className="mono">{g.flightId}</span> },
    { label: 'Voucher', render: (g) => g.voucher },
    { label: 'Partner', render: (g) => g.partner },
    { label: 'Split', render: (g) => g.coFund },
    { label: 'Pax', n: true, render: (g) => n(g.pax) },
    { label: 'Cost', n: true, render: (g) => money(g.cost) },
    { label: 'Status', render: (g) => <Chip tone="ok">{g.status}</Chip> }
  ];
}
