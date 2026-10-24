/* Gate-area messaging. A message scheduled here becomes a campaign with
   airline priority on the screens whose catchment includes that gate, from
   boarding start until the gate closes. */

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../lib/app-state';
import { useLive } from '../../lib/events';
import { hhmm } from '../../lib/format';
import { airlineOf, cityOf } from '../../lib/reference';
import { useCampaignMutations, useCampaigns, useFlights, useScreens, useZones } from '../../lib/queries';
import {
  Chip, DataTable, Field, Grid, Note, PageHead, Pad, Panel, Stack, type Column
} from '../../components/primitives';
import type { Campaign, Flight, Screen } from '../../lib/types';

export function AirlineGateMessaging(): JSX.Element {
  const { airlineCode, setScreenId } = useApp();
  const { now } = useLive();
  const navigate = useNavigate();
  const airline = airlineOf(airlineCode);

  const flightsQ = useFlights({ direction: 'D', airline: airlineCode, limit: 200 });
  const screensQ = useScreens();
  const campaigns = useCampaigns();

  const live = useMemo(
    () =>
      (flightsQ.data ?? [])
        .filter((f) => f.etdTs > now - 30 * 60_000 && f.etdTs < now + 8 * 3_600_000)
        .sort((a, b) => a.etdTs - b.etdTs)
        .slice(0, 12),
    [flightsQ.data, now]
  );

  const myGates = useMemo(() => new Set(live.map((f) => f.gate)), [live]);
  const myScreens = useMemo(
    () => (screensQ.data ?? []).filter((s) => s.nearGates.some((g) => myGates.has(g))),
    [screensQ.data, myGates]
  );

  /* A scheduled message is an airline-category campaign; reading them back
     out of the campaign book keeps one source of truth. */
  const scheduled = useMemo(
    () => (campaigns.data ?? []).filter((c) => c.category === 'airline' && c.airlineCode === airlineCode),
    [campaigns.data, airlineCode]
  );

  return (
    <Stack>
      <PageHead
        title="Gate-area messaging"
        lead="Schedule your own content on screens at your gates during your boarding windows: upgrades, lounge passes, destination partners. Airline priority means your message wins its own boarding window outright."
      />

      <Grid cols="23">
        <Panel title="Schedule a message">
          <Pad>
            <GateMessageForm flights={live} airlineName={airline?.name ?? airlineCode} />
          </Pad>
        </Panel>

        <Panel title="My screens" right={<Chip>{myScreens.length} screens</Chip>}>
          <Pad tight>
            <DataTable<Screen>
              cols={[
                { label: 'Screen', render: (s) => s.name },
                { label: 'Zone', render: (s) => s.zone },
                { label: 'Gates', render: (s) => s.nearGates.join(', ') },
                {
                  label: '',
                  render: (s) => (
                    <button
                      className="btn sm ghost"
                      type="button"
                      onClick={() => {
                        setScreenId(s.id);
                        navigate('/screen/screen');
                      }}
                    >
                      View
                    </button>
                  )
                }
              ]}
              rows={myScreens.slice(0, 14)}
              rowKey={(s) => s.id}
              scroll
              empty="No screens at your live gates right now"
            />
          </Pad>
        </Panel>
      </Grid>

      <Panel title="Scheduled messages">
        <Pad tight>
          <DataTable<Campaign>
            cols={scheduledCols()}
            rows={scheduled}
            rowKey={(c) => c.id}
            empty="Nothing scheduled. A message created here becomes a campaign with airline priority at your gates."
          />
        </Pad>
      </Panel>
    </Stack>
  );
}

function scheduledCols(): Array<Column<Campaign>> {
  return [
    { label: 'Message', render: (c) => c.name },
    { label: 'Zones', render: (c) => (c.hard.zones ?? []).join(', ') || '—' },
    { label: 'Screens', n: true, render: (c) => (c.hard.screens ?? []).length },
    {
      label: 'Window',
      render: (c) => <span className="mono">{c.schedule.from}–{c.schedule.to}</span>
    },
    {
      label: 'Status',
      render: (c) => <Chip tone={c.status === 'live' ? 'ok' : 'warn'}>{c.status}</Chip>
    }
  ];
}

const PRESETS = [
  'Upgrade to Business from €149 at the gate',
  'Lounge access €29 — ask at the desk',
  'Extra legroom seats available now'
];

function GateMessageForm({
  flights, airlineName
}: {
  flights: Flight[];
  airlineName: string;
}): JSX.Element {
  const { airlineCode, pushToast } = useApp();
  const zones = useZones();
  const screensQ = useScreens();
  const { create } = useCampaignMutations();
  const [flightId, setFlightId] = useState('');
  const [message, setMessage] = useState(PRESETS[0]);

  const selected = flights.find((f) => f.id === (flightId || flights[0]?.id));
  const presets = useMemo(() => {
    if (!selected) return PRESETS;
    return [...PRESETS, `Welcome to ${cityOf(selected.destination)} — partner offers inside`];
  }, [selected]);

  const schedule = (): void => {
    if (!selected) return;
    const zone =
      selected.zone ??
      (zones.data ?? []).find((z) => z.gates.includes(selected.gate))?.id ??
      '';
    const screenIds = (screensQ.data ?? [])
      .filter((s) => s.nearGates.includes(selected.gate))
      .map((s) => s.id);

    const campaign: Campaign = {
      id: `CMP-A${Date.now().toString().slice(-6)}`,
      name: message,
      advertiser: airlineName,
      airlineCode,
      outletId: null,
      category: 'airline',
      weights: { premiumCabin: 0.6, frequentFlyer: 0.5, business: 0.4 },
      hard: { zones: zone ? [zone] : [], screens: screenIds },
      triggers: [{ type: 'boarding', boost: 1.4, label: `Boarding window at gate ${selected.gate}` }],
      budget: 2000,
      dailyCap: null,
      spent: 0,
      cpm: 6,
      cvrIndex: 1.1,
      creative: null,
      promo: null,
      priority: 0,
      status: 'live',
      approval: 'approved',
      brandSafety: 'passed',
      schedule: { from: hhmm(selected.boardingTs), to: hhmm(selected.gateCloseTs) },
      frequencyCap: 20,
      pinned: false
    };

    create.mutate(campaign, {
      onSuccess: () => pushToast('Message scheduled', `${message} · gate ${selected.gate}`),
      onError: () => pushToast('Could not schedule', 'The API rejected the message')
    });
  };

  return (
    <Stack>
      <Field label="Flight">
        <select
          className="input"
          value={flightId || flights[0]?.id || ''}
          onChange={(e) => setFlightId(e.target.value)}
        >
          {flights.map((f) => (
            <option key={f.id} value={f.id}>
              {f.id} → {f.destination} · gate {f.gate} · boards {hhmm(f.boardingTs)}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Message">
        <select className="input" value={message} onChange={(e) => setMessage(e.target.value)}>
          {presets.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </Field>

      <Note>
        The message runs on every screen whose catchment includes that gate, from boarding start until the
        gate closes.
      </Note>

      <button
        className="btn primary"
        type="button"
        disabled={!selected || create.isPending}
        onClick={schedule}
      >
        Schedule on my gate screens
      </button>
    </Stack>
  );
}
