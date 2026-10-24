/* Inventory calendar. Every screen by hour, with the premium slots marked
   where predicted presence is highest — the same forecast that sets the
   price. Below it, why campaign A beat campaign B in a real slot. */

import { useState } from 'react';
import { useApp } from '../../lib/app-state';
import { hhmm } from '../../lib/format';
import {
  useCampaignMutations, useCampaigns, useDecisions, useInventory, useScreens, useZones
} from '../../lib/queries';
import { CandidateCard } from '../../components/CandidateCard';
import { Modal } from '../../components/Modal';
import {
  Chip, ErrorNote, Field, Grid, Kpi, Kpis, Loading, Note, PageHead, Pad, Panel, Stack
} from '../../components/primitives';
import type { InventoryRow, InventorySlot } from '../../lib/api';
import type { Campaign } from '../../lib/types';

export function MediaInventory(): JSX.Element {
  const { fmt, pushToast } = useApp();
  const zones = useZones();
  const screens = useScreens();
  const [zone, setZone] = useState('T2-PC');
  const inventory = useInventory(zone);
  /* Bookings are a local overlay: the API owns the forecast, the sales desk
     toggles availability on top of it until a booking is committed. */
  const [overlay, setOverlay] = useState<Record<string, 'booked' | 'available'>>({});

  if (inventory.isError) return <ErrorNote what="the inventory calendar" />;

  const hours = inventory.data?.hours ?? [];
  const rows = inventory.data?.rows ?? [];

  const stateOf = (row: InventoryRow, slot: InventorySlot): 'booked' | 'available' | 'blocked' => {
    const key = `${row.screen.id}:${slot.hour}`;
    if (overlay[key]) return overlay[key];
    return slot.state;
  };

  let booked = 0;
  let total = 0;
  let revenue = 0;
  rows.forEach((row) =>
    row.slots.forEach((slot) => {
      total++;
      if (stateOf(row, slot) === 'booked') {
        booked++;
        revenue += slot.price;
      }
    })
  );
  const premium = rows.reduce((s, r) => s + r.slots.filter((x) => x.premium).length, 0);

  const toggle = (row: InventoryRow, slot: InventorySlot): void => {
    const key = `${row.screen.id}:${slot.hour}`;
    const next = stateOf(row, slot) === 'booked' ? 'available' : 'booked';
    setOverlay({ ...overlay, [key]: next });
    pushToast(
      next === 'booked' ? 'Slot booked' : 'Slot released',
      `${row.screen.name} · ${String(slot.hour).padStart(2, '0')}:00 · ${fmt.money2(slot.price)}`
    );
  };

  return (
    <Stack>
      <PageHead
        title="Inventory calendar"
        lead="Every screen by hour. Premium slots are the ones where predicted passenger presence is highest — the same forecast that sets the price."
      >
        <div className="spacer" />
        <select className="input" value={zone} onChange={(e) => setZone(e.target.value)} aria-label="Zone">
          {(zones.data ?? []).map((z) => (
            <option key={z.id} value={z.id}>{z.name}</option>
          ))}
        </select>
      </PageHead>

      <Kpis>
        <Kpi
          label="Occupancy"
          value={fmt.pct(total ? booked / total : 0, 1)}
          tone={total && booked / total > 0.6 ? 'ok' : 'warn'}
          sub={<span className="muted">{fmt.n(booked)} of {fmt.n(total)} slots</span>}
        />
        <Kpi label="Booked revenue" value={fmt.money(revenue)} tone="amber" sub={<span className="muted">in {zone}</span>} />
        <Kpi
          label="Available slots"
          value={fmt.n(total - booked)}
          sub={<span className="muted">across {rows.length} screens</span>}
        />
        <Kpi
          label="Premium share"
          value={fmt.pct(total ? premium / total : 0)}
          sub={<span className="muted">predicted footfall above the premium threshold</span>}
        />
        <Kpi
          label="Avg price / slot"
          value={fmt.money2(booked ? revenue / booked : 0)}
          sub={<span className="muted">demand-weighted</span>}
        />
        <Kpi
          label="Network screens"
          value={fmt.n(screens.data?.length ?? 0)}
          sub={<span className="muted">all zones</span>}
        />
      </Kpis>

      <Panel
        title={`Screens in ${zone}`}
        right={
          <div className="row tight">
            <Chip tone="info" dot>booked</Chip>
            <Chip tone="amber" dot>premium</Chip>
            <Chip dot>available</Chip>
          </div>
        }
      >
        <Pad>
          {inventory.isLoading ? (
            <Loading what="the calendar" />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <div
                className="invgrid"
                style={{ gridTemplateColumns: `124px repeat(${hours.length}, minmax(14px, 1fr))` }}
              >
                <div className="rowlab" />
                {hours.map((hr) => (
                  <div className="hh" key={`h-${hr}`}>{String(hr).padStart(2, '0')}</div>
                ))}

                {rows.map((row) => (
                  <SlotRow key={row.screen.id} row={row} stateOf={stateOf} onToggle={toggle} />
                ))}
              </div>
            </div>
          )}
        </Pad>
      </Panel>

      <ConflictPanel />
    </Stack>
  );
}

function SlotRow({
  row, stateOf, onToggle
}: {
  row: InventoryRow;
  stateOf: (row: InventoryRow, slot: InventorySlot) => 'booked' | 'available' | 'blocked';
  onToggle: (row: InventoryRow, slot: InventorySlot) => void;
}): JSX.Element {
  const { fmt } = useApp();
  return (
    <>
      <div className="rowlab" title={row.screen.name}>{row.screen.name.replace(/^Gate /, 'G')}</div>
      {row.slots.map((slot) => {
        const state = stateOf(row, slot);
        const cls =
          state === 'blocked' ? 'slot blocked'
            : state === 'booked' ? (slot.premium ? 'slot premium' : 'slot booked')
              : 'slot';
        return (
          <div
            key={`${row.screen.id}-${slot.hour}`}
            className={cls}
            role="button"
            tabIndex={0}
            title={
              `${row.screen.name} · ${slot.hour}:00 · ${state}` +
              `${slot.premium ? ' · premium' : ''} · ${fmt.money2(slot.price)}/slot · ` +
              `${fmt.n(slot.pax)} pax predicted`
            }
            onClick={() => onToggle(row, slot)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onToggle(row, slot);
              }
            }}
          />
        );
      })}
    </>
  );
}

/* ---- conflicts -------------------------------------------------------- */

function ConflictPanel(): JSX.Element {
  const { fmt } = useApp();
  const decisions = useDecisions(undefined, 40);
  const campaigns = useCampaigns();
  const [pinning, setPinning] = useState<{ campaign: Campaign; screenId: string } | null>(null);

  const d =
    (decisions.data ?? []).find((x) => x.candidates && x.candidates.length > 1) ??
    (decisions.data ?? [])[0];

  if (!d || !d.candidates || d.candidates.length < 2) {
    return (
      <Panel title="Conflicts · why campaign A beat campaign B">
        <Pad>
          <Note>Waiting for a slot with more than one eligible campaign.</Note>
        </Pad>
      </Panel>
    );
  }

  const [a, b] = d.candidates;
  const byId = new Map((campaigns.data ?? []).map((c) => [c.id, c]));
  const ca = byId.get(a.campaignId) ?? null;
  const cb = byId.get(b.campaignId) ?? null;

  return (
    <Panel title="Conflicts · why campaign A beat campaign B">
      <Pad>
        <Stack>
          <Note>
            {d.screenName ?? d.screenId} at {hhmm(d.at)} · {fmt.n(d.crowdNow)} passengers ·{' '}
            {d.candidates.length} campaigns eligible
          </Note>
          <Grid cols="2">
            <CandidateCard score={a} campaign={ca} winner />
            <CandidateCard score={b} campaign={cb} />
          </Grid>
          <div className="between">
            <p style={{ fontSize: '13px', margin: 0 }}>
              <b>{ca ? ca.advertiser : a.campaignId}</b> won by{' '}
              <b>{(a.final - b.final).toFixed(2)}</b> points:{' '}
              {a.boost > 1
                ? `a trigger boost of ×${a.boost} on top of a ${fmt.pct(a.match)} audience match.`
                : `a higher audience match (${fmt.pct(a.match)} against ${fmt.pct(b.match)}).`}
            </p>
            {cb && (
              <button
                className="btn sm"
                type="button"
                onClick={() => setPinning({ campaign: cb, screenId: d.screenId })}
              >
                Pin {cb.advertiser} instead
              </button>
            )}
          </div>
        </Stack>
      </Pad>

      {pinning && (
        <PinInsteadDialog
          campaign={pinning.campaign}
          screenId={pinning.screenId}
          onClose={() => setPinning(null)}
        />
      )}
    </Panel>
  );
}

/* An override is only defensible if it is written down, so the reason
   travels with the pin into the decision log. */
function PinInsteadDialog({
  campaign, screenId, onClose
}: {
  campaign: Campaign;
  screenId: string;
  onClose: () => void;
}): JSX.Element {
  const { pushToast } = useApp();
  const { update } = useCampaignMutations();
  const [reason, setReason] = useState('Make-good for under-delivery');

  return (
    <Modal
      title={`Pin ${campaign.advertiser}`}
      onClose={onClose}
      actions={
        <>
          <button
            className="btn primary"
            type="button"
            disabled={update.isPending || !reason.trim()}
            onClick={() =>
              update.mutate(
                { id: campaign.id, patch: { pinned: true, pinReason: reason } },
                {
                  onSuccess: () => {
                    pushToast('Campaign pinned', `${campaign.advertiser} · ${reason}`);
                    onClose();
                  },
                  onError: () => pushToast('Could not pin', 'The API rejected the override')
                }
              )
            }
          >
            Pin
          </button>
          <button className="btn ghost" type="button" onClick={onClose}>Cancel</button>
        </>
      }
    >
      <Stack>
        <Note>
          A pin forces {campaign.advertiser} to win the slot regardless of score, starting at{' '}
          {screenId}. The reason you give here is written into the decision log beside the winning rule,
          so the override is auditable rather than invisible.
        </Note>
        <Field label="Reason">
          <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </Stack>
    </Modal>
  );
}
