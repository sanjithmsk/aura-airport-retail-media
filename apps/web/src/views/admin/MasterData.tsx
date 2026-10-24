/* Master data. Five tabs over everything the platform owns: screens and
   their catchments, outlets, airlines, locations and hardware vendors.
   Screens and outlets are editable; the other three are seeded reference
   data and say so rather than offering a button that does nothing. */

import { useState } from 'react';
import { useApp } from '../../lib/app-state';
import { AIRLINES, CATEGORIES, categoryOf } from '../../lib/reference';
import {
  useFlights, useOutletMutations, useOutlets, useScreenMutations, useScreens, useVendors, useZones
} from '../../lib/queries';
import { Modal } from '../../components/Modal';
import {
  DataTable, Field, Grid, Note, PageHead, Pad, Panel, ScreenStatusChip, Stack, Chip, type Column
} from '../../components/primitives';
import type { Airline } from '../../lib/reference';
import type { Flight, Outlet, Screen, Vendor, Zone } from '../../lib/types';

type Tab = 'screens' | 'outlets' | 'airlines' | 'locations' | 'vendors';
const TABS: Tab[] = ['screens', 'outlets', 'airlines', 'locations', 'vendors'];

/** Only the two tabs the API can write back. */
const EDITABLE: Tab[] = ['screens', 'outlets'];

const SCREEN_SIZES = ['49"', '55"', '75"', '86"', '98"', '2x3'];
const ORIENTATIONS: Array<Screen['orientation']> = ['landscape', 'portrait'];

export function AdminMasterData(): JSX.Element {
  const { fmt } = useApp();
  const [tab, setTab] = useState<Tab>('screens');
  const [screenEdit, setScreenEdit] = useState<Screen | null>(null);
  const [outletEdit, setOutletEdit] = useState<Outlet | null>(null);
  const [creating, setCreating] = useState(false);

  const screens = useScreens();
  const outlets = useOutlets();
  const zones = useZones();
  const vendors = useVendors();
  const flights = useFlights({ direction: 'D', limit: 1000 });

  const editable = EDITABLE.includes(tab);
  const singular = tab.replace(/s$/, '');

  const openNew = (): void => {
    setCreating(true);
    if (tab === 'screens') setScreenEdit(null);
    else setOutletEdit(null);
  };

  return (
    <Stack>
      <PageHead
        title="Master data"
        lead="Everything the platform owns: screens and their catchments, outlets and F&B tenants, airlines, locations and hardware vendors. Edits take effect on the next decision slot."
      />

      <Panel>
        <div>
          <Pad tight>
            <div className="between">
              <div className="row tight">
                {TABS.map((x) => (
                  <button
                    key={x}
                    className="btn sm"
                    type="button"
                    aria-pressed={tab === x}
                    onClick={() => setTab(x)}
                  >
                    {x[0].toUpperCase() + x.slice(1)}
                  </button>
                ))}
              </div>
              {editable ? (
                <button className="btn sm primary" type="button" onClick={openNew}>
                  + New {singular}
                </button>
              ) : (
                <Chip tone="muted" title="Seeded reference data — read-only in this deployment">
                  read-only reference data
                </Chip>
              )}
            </div>
          </Pad>

          {tab === 'screens' && (
            <DataTable<Screen>
              cols={screenCols(fmt.money2, (s) => {
                setCreating(false);
                setScreenEdit(s);
              })}
              rows={screens.data ?? []}
              rowKey={(s) => s.id}
              scroll
              empty="No screens"
            />
          )}

          {tab === 'outlets' && (
            <DataTable<Outlet>
              cols={outletCols((o) => {
                setCreating(false);
                setOutletEdit(o);
              })}
              rows={outlets.data ?? []}
              rowKey={(o) => o.id}
              scroll
              empty="No outlets"
            />
          )}

          {tab === 'airlines' && (
            <DataTable<Airline>
              cols={airlineCols(flights.data ?? [], fmt.n, fmt.pct)}
              rows={AIRLINES}
              rowKey={(a) => a.code}
              scroll
            />
          )}

          {tab === 'locations' && (
            <DataTable<Zone>
              cols={zoneCols(screens.data ?? [])}
              rows={zones.data ?? []}
              rowKey={(z) => z.id}
              scroll
            />
          )}

          {tab === 'vendors' && (
            <DataTable<Vendor>
              cols={vendorCols}
              rows={vendors.data ?? []}
              rowKey={(v) => v.id}
              scroll
              empty="No vendors"
            />
          )}

          {!editable && (
            <Pad tight>
              <Note>
                Airlines, locations and vendors are seeded reference data in this deployment. They arrive
                with the schedule and the terminal model, so there is nothing here to edit.
              </Note>
            </Pad>
          )}
        </div>
      </Panel>

      {(screenEdit || (creating && tab === 'screens')) && (
        <ScreenForm
          screen={screenEdit}
          zones={zones.data ?? []}
          vendors={vendors.data ?? []}
          onClose={() => {
            setScreenEdit(null);
            setCreating(false);
          }}
        />
      )}

      {(outletEdit || (creating && tab === 'outlets')) && (
        <OutletForm
          outlet={outletEdit}
          zones={zones.data ?? []}
          onClose={() => {
            setOutletEdit(null);
            setCreating(false);
          }}
        />
      )}
    </Stack>
  );
}

/* ---- screen form ------------------------------------------------------ */

interface ScreenDraft {
  name: string;
  zone: string;
  size: string;
  orientation: Screen['orientation'];
  vendor: string;
  floorPrice: number;
  nearGates: string;
}

function screenDraft(s: Screen | null, zones: Zone[], vendors: Vendor[]): ScreenDraft {
  return {
    name: s?.name ?? 'New screen',
    zone: s?.zone ?? zones[0]?.id ?? '',
    size: s?.size ?? '75"',
    orientation: s?.orientation ?? 'landscape',
    vendor: s?.vendor ?? vendors[0]?.name ?? 'Lumen Displays',
    floorPrice: s?.floorPrice ?? 12,
    nearGates: (s?.nearGates ?? []).join(', ')
  };
}

function parseGates(value: string): string[] {
  return value.split(',').map((x) => x.trim()).filter(Boolean);
}

function ScreenForm({
  screen, zones, vendors, onClose
}: {
  screen: Screen | null;
  zones: Zone[];
  vendors: Vendor[];
  onClose: () => void;
}): JSX.Element {
  const { pushToast } = useApp();
  const { create, update } = useScreenMutations();
  const [d, setD] = useState<ScreenDraft>(() => screenDraft(screen, zones, vendors));
  const patch = (next: Partial<ScreenDraft>): void => setD({ ...d, ...next });
  const hardware = vendors.filter((v) => v.type === 'Screen hardware');
  const pending = create.isPending || update.isPending;

  const save = (): void => {
    const body: Partial<Screen> = {
      name: d.name,
      zone: d.zone,
      size: d.size,
      orientation: d.orientation,
      vendor: d.vendor,
      floorPrice: d.floorPrice,
      nearGates: parseGates(d.nearGates)
    };
    const done = (s: Screen): void => {
      pushToast(
        screen ? 'Screen updated' : 'Screen created',
        `${s.id} · catchment and format take effect next slot`
      );
      onClose();
    };
    if (screen) update.mutate({ id: screen.id, patch: body }, { onSuccess: done });
    else create.mutate(body, { onSuccess: done });
  };

  return (
    <Modal
      title={screen ? `Edit ${screen.id}` : 'New screen'}
      onClose={onClose}
      actions={
        <>
          <button className="btn primary" type="button" disabled={pending} onClick={save}>
            Save
          </button>
          <button className="btn ghost" type="button" onClick={onClose}>Cancel</button>
        </>
      }
    >
      <Stack>
        <Grid cols="2">
          <Field label="Name">
            <input className="input" value={d.name} onChange={(e) => patch({ name: e.target.value })} />
          </Field>
          <Field label="Zone">
            <select className="input" value={d.zone} onChange={(e) => patch({ zone: e.target.value })}>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>{z.id} · {z.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Size">
            <select className="input" value={d.size} onChange={(e) => patch({ size: e.target.value })}>
              {SCREEN_SIZES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="Orientation">
            <select
              className="input"
              value={d.orientation}
              onChange={(e) => patch({ orientation: e.target.value as Screen['orientation'] })}
            >
              {ORIENTATIONS.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </Field>
          <Field label="Vendor">
            <select className="input" value={d.vendor} onChange={(e) => patch({ vendor: e.target.value })}>
              {(hardware.length ? hardware : vendors).map((v) => (
                <option key={v.id} value={v.name}>{v.name}</option>
              ))}
              {!vendors.length && <option value={d.vendor}>{d.vendor}</option>}
            </select>
          </Field>
          <Field label="Floor price per slot">
            <input
              className="input"
              type="number"
              step={0.5}
              value={d.floorPrice}
              onChange={(e) => patch({ floorPrice: Number(e.target.value) })}
            />
          </Field>
          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="scr-gates">Nearest gates (comma separated)</label>
            <input
              id="scr-gates"
              className="input"
              value={d.nearGates}
              onChange={(e) => patch({ nearGates: e.target.value })}
            />
          </div>
        </Grid>
        <Note>
          The nearest gates are this screen&rsquo;s catchment: the engine blends the passenger profile of
          every flight at those gates to decide what plays. Changing them changes the crowd the screen is
          scored against, and therefore its next decision.
        </Note>
      </Stack>
    </Modal>
  );
}

/* ---- outlet form ------------------------------------------------------ */

interface OutletDraft {
  name: string;
  category: string;
  zone: string;
  unit: string;
  sqm: number;
  nearGates: string;
}

function outletDraft(o: Outlet | null, zones: Zone[]): OutletDraft {
  return {
    name: o?.name ?? 'New outlet',
    category: o?.category ?? Object.keys(CATEGORIES)[0] ?? 'coffee',
    zone: o?.zone ?? zones[0]?.id ?? '',
    unit: o?.unit ?? 'C-900',
    sqm: o?.sqm ?? 60,
    nearGates: (o?.nearGates ?? []).join(', ')
  };
}

function OutletForm({
  outlet, zones, onClose
}: {
  outlet: Outlet | null;
  zones: Zone[];
  onClose: () => void;
}): JSX.Element {
  const { pushToast } = useApp();
  const { create, update } = useOutletMutations();
  const [d, setD] = useState<OutletDraft>(() => outletDraft(outlet, zones));
  const patch = (next: Partial<OutletDraft>): void => setD({ ...d, ...next });
  const pending = create.isPending || update.isPending;

  const save = (): void => {
    const body: Partial<Outlet> = {
      name: d.name,
      category: d.category,
      zone: d.zone,
      unit: d.unit,
      sqm: d.sqm,
      nearGates: parseGates(d.nearGates)
    };
    const done = (o: Outlet): void => {
      pushToast(outlet ? 'Outlet updated' : 'Outlet created', `${o.id} · ${o.name}`);
      onClose();
    };
    if (outlet) update.mutate({ id: outlet.id, patch: body }, { onSuccess: done });
    else create.mutate(body, { onSuccess: done });
  };

  return (
    <Modal
      title={outlet ? `Edit ${outlet.id}` : 'New outlet'}
      onClose={onClose}
      actions={
        <>
          <button className="btn primary" type="button" disabled={pending} onClick={save}>
            Save
          </button>
          <button className="btn ghost" type="button" onClick={onClose}>Cancel</button>
        </>
      }
    >
      <Stack>
        <Grid cols="2">
          <Field label="Name">
            <input className="input" value={d.name} onChange={(e) => patch({ name: e.target.value })} />
          </Field>
          <Field label="Category">
            <select
              className="input"
              value={d.category}
              onChange={(e) => patch({ category: e.target.value })}
            >
              {Object.keys(CATEGORIES).map((k) => (
                <option key={k} value={k}>{categoryOf(k).label}</option>
              ))}
            </select>
          </Field>
          <Field label="Zone">
            <select className="input" value={d.zone} onChange={(e) => patch({ zone: e.target.value })}>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>{z.id} · {z.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Unit">
            <input className="input" value={d.unit} onChange={(e) => patch({ unit: e.target.value })} />
          </Field>
          <Field label="Floor area m²">
            <input
              className="input"
              type="number"
              step={5}
              value={d.sqm}
              onChange={(e) => patch({ sqm: Number(e.target.value) })}
            />
          </Field>
          <Field label="Nearest gates (comma separated)">
            <input
              className="input"
              value={d.nearGates}
              onChange={(e) => patch({ nearGates: e.target.value })}
            />
          </Field>
        </Grid>
        <Note>
          The nearest gates decide which departures count as footfall for this tenant, which is what the
          retailer dashboard and the campaign builder read.
        </Note>
      </Stack>
    </Modal>
  );
}

/* ---- columns ---------------------------------------------------------- */

function screenCols(
  money2: (v: number) => string,
  onEdit: (s: Screen) => void
): Array<Column<Screen>> {
  return [
    { label: 'ID', render: (s) => <span className="mono">{s.id}</span> },
    { label: 'Name', render: (s) => s.name },
    { label: 'Zone', render: (s) => `${s.zone} · ${s.terminal}` },
    { label: 'Near gates', render: (s) => s.nearGates.join(', ') },
    { label: 'Format', render: (s) => `${s.size} ${s.orientation}` },
    { label: 'Vendor', render: (s) => s.vendor },
    { label: 'Floor / slot', n: true, render: (s) => money2(s.floorPrice) },
    { label: 'Status', render: (s) => <ScreenStatusChip status={s.status} /> },
    {
      label: '',
      render: (s) => (
        <button className="btn sm ghost" type="button" onClick={() => onEdit(s)}>Edit</button>
      )
    }
  ];
}

function outletCols(onEdit: (o: Outlet) => void): Array<Column<Outlet>> {
  return [
    { label: 'ID', render: (o) => <span className="mono">{o.id}</span> },
    { label: 'Outlet', render: (o) => o.name },
    { label: 'Category', render: (o) => categoryOf(o.category).label },
    { label: 'Zone', render: (o) => o.zone },
    { label: 'Unit', render: (o) => o.unit },
    { label: 'm²', n: true, render: (o) => o.sqm },
    { label: 'Near gates', render: (o) => o.nearGates.join(', ') },
    { label: 'Hours', render: (o) => `${o.opens}–${o.closes}` },
    {
      label: '',
      render: (o) => (
        <button className="btn sm ghost" type="button" onClick={() => onEdit(o)}>Edit</button>
      )
    }
  ];
}

function airlineCols(
  flights: Flight[],
  n: (v: number) => string,
  pct: (v: number) => string
): Array<Column<Airline>> {
  const byCode = new Map<string, Flight[]>();
  flights.forEach((f) => {
    const list = byCode.get(f.airlineCode) ?? [];
    list.push(f);
    byCode.set(f.airlineCode, list);
  });
  return [
    { label: 'Code', render: (a) => <span className="mono">{a.code}</span> },
    { label: 'Airline', render: (a) => a.name },
    { label: 'Type', render: (a) => a.type },
    { label: 'Flights today', n: true, render: (a) => n((byCode.get(a.code) ?? []).length) },
    {
      label: 'Seats today',
      n: true,
      render: (a) => n((byCode.get(a.code) ?? []).reduce((s, f) => s + f.pax, 0))
    },
    { label: 'Premium mix', n: true, render: (a) => pct(a.premium) },
    {
      label: 'Based here',
      render: (a) => (a.home ? <Chip tone="ok">home carrier</Chip> : <Chip>visiting</Chip>)
    }
  ];
}

function zoneCols(screens: Screen[]): Array<Column<Zone>> {
  return [
    { label: 'Zone', render: (z) => <span className="mono">{z.id}</span> },
    { label: 'Name', render: (z) => z.name },
    { label: 'Terminal', render: (z) => z.terminal },
    { label: 'Kind', render: (z) => z.kind },
    {
      label: 'Gates',
      render: (z) =>
        z.gates.length
          ? `${z.gates[0]}–${z.gates[z.gates.length - 1]} (${z.gates.length})`
          : <span className="muted">no gates</span>
    },
    { label: 'Screens', n: true, render: (z) => screens.filter((s) => s.zone === z.id).length }
  ];
}

const vendorCols: Array<Column<Vendor>> = [
  { label: 'ID', render: (v) => <span className="mono">{v.id}</span> },
  { label: 'Vendor', render: (v) => v.name },
  { label: 'Type', render: (v) => v.type },
  { label: 'Contact', render: (v) => v.contact },
  { label: 'SLA', render: (v) => v.sla },
  { label: 'Screens', n: true, render: (v) => v.screens }
];
