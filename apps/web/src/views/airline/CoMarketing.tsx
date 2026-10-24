/* Co-marketing marketplace. Retailers offer deals to this airline's
   passengers; accepting one puts the airline's name on the creative and
   lifts the campaign at its gates. */

import { useMemo, useState } from 'react';
import { useApp } from '../../lib/app-state';
import { useLive } from '../../lib/events';
import { hhmm } from '../../lib/format';
import { useZoneAggregate } from '../../lib/footfall';
import { airlineOf } from '../../lib/reference';
import { useCampaignMutations, useCampaigns, useFlights, useZones } from '../../lib/queries';
import { rankedPartnerOffers } from './Flights';
import {
  Chip, DataTable, Grid, Kpi, Kpis, Note, PageHead, Pad, Panel, Stack, type Column
} from '../../components/primitives';
import type { Campaign } from '../../lib/types';

interface Partnership {
  campaignId: string;
  advertiser: string;
  offer: string;
  at: string;
}

export function AirlineCoMarketing(): JSX.Element {
  const { fmt, airlineCode, pushToast } = useApp();
  const { now } = useLive();
  const airline = airlineOf(airlineCode);
  const flightsQ = useFlights({ direction: 'D', airline: airlineCode, limit: 200 });
  const zones = useZones();
  const campaigns = useCampaigns();
  const { update } = useCampaignMutations();
  const [accepted, setAccepted] = useState<Partnership[]>([]);

  const live = useMemo(
    () => (flightsQ.data ?? []).filter((f) => f.etdTs > now - 30 * 60_000 && f.etdTs < now + 8 * 3_600_000),
    [flightsQ.data, now]
  );
  const myZones = useMemo(() => {
    const gates = new Set(live.map((f) => f.gate));
    return Array.from(
      new Set((zones.data ?? []).filter((z) => z.gates.some((g) => gates.has(g))).map((z) => z.id))
    );
  }, [live, zones.data]);
  const crowd = useZoneAggregate(myZones);

  const offers = crowd.profile
    ? rankedPartnerOffers(campaigns.data ?? [], crowd.profile).slice(0, 10)
    : [];

  const acceptedIds = new Set(accepted.map((a) => a.campaignId));

  const accept = (c: Campaign): void => {
    if (acceptedIds.has(c.id)) return;
    update.mutate(
      {
        id: c.id,
        patch: {
          coBrand: airline?.name ?? airlineCode,
          weights: { ...c.weights, frequentFlyer: Math.max(c.weights.frequentFlyer ?? 0, 0.4) }
        }
      },
      {
        onSuccess: () => {
          setAccepted((prev) => [
            { campaignId: c.id, advertiser: c.advertiser, offer: c.name, at: hhmm(now) },
            ...prev
          ]);
          pushToast(
            'Partnership accepted',
            `${airline?.name ?? airlineCode} × ${c.advertiser} — co-branded from the next slot`
          );
        },
        onError: () => pushToast('Could not accept', 'The API rejected the partnership')
      }
    );
  };

  const partneredSpend = accepted.reduce((s, a) => {
    const c = (campaigns.data ?? []).find((x) => x.id === a.campaignId);
    return s + (c?.spent ?? 0);
  }, 0);

  return (
    <Stack>
      <PageHead
        title="Co-marketing marketplace"
        lead="Retailers offer deals to your passengers. Accepting one adds your name to the creative and gives it a lift at your gates."
      />

      <Grid cols="2">
        <Panel
          title="Offers from retailers"
          right={<span className="note">ranked by fit with your passenger mix</span>}
        >
          <Pad tight>
            <DataTable
              cols={offerCols(fmt.pct, acceptedIds, accept)}
              rows={offers}
              rowKey={(r) => r.campaign.id}
              empty="No live departures to rank against"
              scroll
            />
          </Pad>
        </Panel>

        <Panel
          title="Performance among my passengers"
          right={<Chip>{accepted.length} partnerships</Chip>}
        >
          <Pad>
            <Stack>
              <Kpis columns={2}>
                <Kpi
                  label="Partnered spend"
                  value={fmt.money(partneredSpend)}
                  sub={<span className="muted">across accepted campaigns</span>}
                />
                <Kpi
                  label="In the catchment"
                  value={fmt.n(crowd.pax)}
                  tone="ok"
                  sub={<span className="muted">at my gates now</span>}
                />
              </Kpis>

              {accepted.length ? (
                <DataTable<Partnership>
                  cols={[
                    { label: 'Partner', render: (a) => a.advertiser },
                    { label: 'Offer', render: (a) => a.offer },
                    { label: 'Accepted', render: (a) => <span className="mono">{a.at}</span> }
                  ]}
                  rows={accepted}
                  rowKey={(a) => a.campaignId}
                />
              ) : (
                <Note>Accept an offer to start a partnership.</Note>
              )}
            </Stack>
          </Pad>
        </Panel>
      </Grid>
    </Stack>
  );
}

function offerCols(
  pct: (v: number) => string,
  acceptedIds: Set<string>,
  accept: (c: Campaign) => void
): Array<Column<{ campaign: Campaign; match: number }>> {
  return [
    { label: 'Retailer', render: (r) => r.campaign.advertiser },
    { label: 'Offer', render: (r) => r.campaign.name },
    {
      label: 'Fit',
      n: true,
      render: (r) => <Chip tone={r.match > 0.5 ? 'ok' : undefined}>{pct(r.match)}</Chip>
    },
    { label: 'Zone', render: (r) => (r.campaign.hard.zones ?? []).join(', ') || '—' },
    {
      label: '',
      render: (r) =>
        acceptedIds.has(r.campaign.id) || r.campaign.coBrand ? (
          <Chip tone="ok">accepted</Chip>
        ) : (
          <button className="btn sm" type="button" onClick={() => accept(r.campaign)}>Accept</button>
        )
    }
  ];
}
