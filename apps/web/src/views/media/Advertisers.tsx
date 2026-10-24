/* Advertisers: spend, delivery, and the campaigns falling behind their
   budget pace. A pin writes its reason into the decision log, so an
   override is auditable rather than invisible. */

import { useMemo, useState } from 'react';
import { useApp } from '../../lib/app-state';
import { useLive } from '../../lib/events';
import {
  useCampaignMetrics, useCampaignMutations, useCampaigns, useCreatives, useHistory,
  useNetworkMetrics, useSim
} from '../../lib/queries';
import { Modal } from '../../components/Modal';
import {
  Cap, Chip, DataTable, Field, Grid, Kpi, Kpis, Loading, Note, PageHead, Pad, Panel, Stack,
  type Column
} from '../../components/primitives';
import type { HistoryRow } from '../../lib/api';
import type { Campaign } from '../../lib/types';

interface DeliveryRow {
  campaign: Campaign;
  pace: number;
  dayPace: number;
  under: boolean;
}

interface AdvertiserRow {
  advertiser: string;
  campaigns: number;
  campaignIds: string[];
  spend: number;
  budget: number;
  live: number;
}

export function MediaAdvertisers(): JSX.Element {
  const { fmt } = useApp();
  const { now } = useLive();
  const sim = useSim();
  const campaigns = useCampaigns();
  const creatives = useCreatives();
  const metrics = useNetworkMetrics();
  const [pinning, setPinning] = useState<Campaign | null>(null);
  const [packages, setPackages] = useState(false);
  const [report, setReport] = useState<AdvertiserRow | null>(null);

  const dayStart = sim.data?.dayStart ?? now;
  const dayEnd = sim.data?.dayEnd ?? now + 1;
  const dayPace = Math.min(1, Math.max(0, ((sim.data?.now ?? now) - dayStart) / Math.max(1, dayEnd - dayStart)));

  const rows = useMemo<DeliveryRow[]>(() => {
    return (campaigns.data ?? [])
      .map((c) => {
        const pace = c.budget ? c.spent / c.budget : 0;
        return { campaign: c, pace, dayPace, under: pace < dayPace - 0.2 && c.status === 'live' };
      })
      .sort((a, b) => b.campaign.spent - a.campaign.spent);
  }, [campaigns.data, dayPace]);

  const byAdvertiser = useMemo<AdvertiserRow[]>(() => {
    const map = new Map<string, AdvertiserRow>();
    (campaigns.data ?? []).forEach((c) => {
      const row = map.get(c.advertiser) ?? {
        advertiser: c.advertiser, campaigns: 0, campaignIds: [], spend: 0, budget: 0, live: 0
      };
      row.campaigns++;
      row.campaignIds.push(c.id);
      row.spend += c.spent;
      row.budget += c.budget;
      if (c.status === 'live') row.live++;
      map.set(c.advertiser, row);
    });
    return Array.from(map.values()).sort((a, b) => b.spend - a.spend);
  }, [campaigns.data]);

  const under = rows.filter((r) => r.under);
  const pendingCreatives = (creatives.data ?? []).filter((c) => c.approval === 'pending').length;
  const avgCpm = (campaigns.data ?? []).length
    ? (campaigns.data ?? []).reduce((s, c) => s + c.cpm, 0) / (campaigns.data ?? []).length
    : 0;

  return (
    <Stack>
      <PageHead
        title="Advertisers"
        lead="Spend, delivery and the campaigns that are falling behind their budget pace."
      />

      <Kpis>
        <Kpi
          label="Advertisers"
          value={fmt.n(byAdvertiser.length)}
          sub={<span className="muted">with a campaign in the book</span>}
        />
        <Kpi
          label="Booked spend"
          value={fmt.money(rows.reduce((s, r) => s + r.campaign.spent, 0))}
          sub={<span className="muted">today</span>}
        />
        <Kpi
          label="Under-delivering"
          value={fmt.n(under.length)}
          tone={under.length ? 'warn' : 'ok'}
          sub={<span className="muted">behind pace</span>}
        />
        <Kpi label="Pending approval" value={fmt.n(pendingCreatives)} sub={<span className="muted">creatives</span>} />
        <Kpi label="Avg CPM" value={fmt.money2(avgCpm)} sub={<span className="muted">across the book</span>} />
        <Kpi
          label="Redemptions"
          value={fmt.n(metrics.data?.redemptions)}
          tone="ok"
          sub={<span className="muted">claimed today</span>}
        />
      </Kpis>

      <Grid cols="2">
        <Panel
          title="Top advertisers by spend"
          right={
            <button className="btn sm" type="button" onClick={() => setPackages(true)}>
              Package builder
            </button>
          }
        >
          <Pad tight>
            <DataTable<AdvertiserRow>
              cols={[
                { label: 'Advertiser', render: (r) => r.advertiser },
                { label: 'Campaigns', n: true, render: (r) => r.campaigns },
                { label: 'Live', n: true, render: (r) => r.live },
                { label: 'Spend', n: true, render: (r) => fmt.money(r.spend) },
                { label: 'Budget', n: true, render: (r) => fmt.money(r.budget) },
                {
                  label: '',
                  render: (r) => (
                    <button className="btn sm ghost" type="button" onClick={() => setReport(r)}>
                      Report
                    </button>
                  )
                }
              ]}
              rows={byAdvertiser.slice(0, 12)}
              rowKey={(r) => r.advertiser}
              scroll
            />
          </Pad>
        </Panel>

        <Panel
          title="Delivery"
          right={<Chip tone={under.length ? 'warn' : 'ok'}>{under.length} flagged</Chip>}
        >
          <Pad tight>
            <DataTable<DeliveryRow>
              cols={deliveryCols(fmt.money, setPinning)}
              rows={rows.slice(0, 14)}
              rowKey={(r) => r.campaign.id}
              scroll
            />
          </Pad>
        </Panel>
      </Grid>

      {pinning && <PinDialog campaign={pinning} onClose={() => setPinning(null)} />}
      {packages && <PackageDialog onClose={() => setPackages(false)} />}
      {report && (
        <AdvertiserReport
          row={report}
          campaigns={campaigns.data ?? []}
          onClose={() => setReport(null)}
        />
      )}
    </Stack>
  );
}

/* ---- the one-click report --------------------------------------------- */

function AdvertiserReport({
  row, campaigns, onClose
}: {
  row: AdvertiserRow;
  campaigns: Campaign[];
  onClose: () => void;
}): JSX.Element {
  const { fmt } = useApp();
  const history = useHistory(row.advertiser);
  const live = useCampaignMetrics(row.campaignIds);

  const today = Object.values(live).reduce(
    (acc, m) => ({
      impressions: acc.impressions + m.impressions,
      redemptions: acc.redemptions + m.redemptions
    }),
    { impressions: 0, redemptions: 0 }
  );

  const nameById = new Map(campaigns.map((c) => [c.id, c.name]));
  /* /api/history is ordered oldest first; the report reads newest first. */
  const rows = (history.data ?? []).slice(-30).reverse();

  const cols: Array<Column<HistoryRow>> = [
    { label: 'Date', render: (h) => <span className="mono">{h.date}</span> },
    { label: 'Campaign', render: (h) => nameById.get(h.campaignId) ?? h.campaignId },
    { label: 'Impressions', n: true, render: (h) => fmt.n(h.impressions) },
    { label: 'Redemptions', n: true, render: (h) => fmt.n(h.redemptions) },
    { label: 'Spend', n: true, render: (h) => fmt.money2(h.spend) }
  ];

  return (
    <Modal title={`Advertiser report · ${row.advertiser}`} onClose={onClose} wide>
      <Stack>
        <Kpis columns={3}>
          <Kpi
            label="Spend today"
            value={fmt.money(row.spend)}
            sub={<span className="muted">{row.campaigns} campaigns</span>}
          />
          <Kpi
            label="Impressions"
            value={fmt.n(today.impressions)}
            sub={<span className="muted">today</span>}
          />
          <Kpi
            label="Redemptions"
            value={fmt.n(today.redemptions)}
            tone="ok"
            sub={<span className="muted">today</span>}
          />
        </Kpis>

        <Cap>Last 30 days</Cap>
        {history.isLoading ? (
          <Loading what="the delivery history" />
        ) : (
          <DataTable<HistoryRow>
            cols={cols}
            rows={rows}
            rowKey={(h, i) => `${h.date}-${h.campaignId}-${i}`}
            scroll
            empty={`No recorded delivery for ${row.advertiser} yet`}
          />
        )}

        <Note>
          A real deployment renders this as a PDF or a shareable link for the advertiser. In the
          playground it is the same data, on screen.
        </Note>
      </Stack>
    </Modal>
  );
}

function deliveryCols(
  money: (v: number) => string,
  onPin: (c: Campaign) => void
): Array<Column<DeliveryRow>> {
  return [
    { label: 'Campaign', render: (r) => `${r.campaign.advertiser} — ${r.campaign.name}` },
    { label: 'Spend', n: true, render: (r) => `${money(r.campaign.spent)} / ${money(r.campaign.budget)}` },
    {
      label: 'Pace',
      n: true,
      render: (r) => (
        <Chip tone={r.under ? 'warn' : 'ok'}>
          {(r.pace * 100).toFixed(0)}% at {(r.dayPace * 100).toFixed(0)}% of day
        </Chip>
      )
    },
    {
      label: '',
      render: (r) =>
        r.under || r.campaign.pinned ? (
          <button className="btn sm" type="button" onClick={() => onPin(r.campaign)}>
            {r.campaign.pinned ? 'Re-pin' : 'Boost'}
          </button>
        ) : null
    }
  ];
}

function PinDialog({ campaign, onClose }: { campaign: Campaign; onClose: () => void }): JSX.Element {
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
            disabled={update.isPending}
            onClick={() =>
              update.mutate(
                { id: campaign.id, patch: { pinned: true, pinReason: reason } },
                {
                  onSuccess: () => {
                    pushToast('Campaign pinned', `${campaign.advertiser} · ${reason}`);
                    onClose();
                  }
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
          A pin forces this campaign to win the slot regardless of score. The reason is written into the
          decision log so the override is auditable.
        </Note>
        <Field label="Reason">
          <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </Stack>
    </Modal>
  );
}

const PACKAGES = [
  {
    name: 'International departures premium',
    zones: ['T2-DF', 'T2-PC'],
    note: 'Duty-free hall and Pier C, 06:00–22:00'
  },
  {
    name: 'Morning business bank',
    zones: ['T1-PLZ', 'T1-PA'],
    note: 'T1 airside, 05:00–10:00'
  },
  {
    name: 'Family holiday corridor',
    zones: ['T2-PC', 'T2-PD'],
    note: 'Both international piers, weekends'
  }
];

function PackageDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const { fmt, pushToast } = useApp();
  return (
    <Modal title="Package builder" onClose={onClose}>
      <Stack>
        <Note>
          Bundle screens into a product the sales team can quote. Reach and price come from the same presence
          forecast as the inventory calendar.
        </Note>
        {PACKAGES.map((p) => (
          <div
            className="between"
            key={p.name}
            style={{ padding: '10px 0', borderBottom: '1px solid var(--line-soft)' }}
          >
            <div>
              <b>{p.name}</b>
              <div className="note">{p.note} · {p.zones.join(', ')}</div>
            </div>
            <div className="row tight">
              <Chip tone="info">{p.zones.length} zones</Chip>
              <Chip tone="amber">{fmt.money(p.zones.length * 14 * 11)} / day</Chip>
              <button
                className="btn sm"
                type="button"
                onClick={() => pushToast('Package quoted', p.name)}
              >
                Quote
              </button>
            </div>
          </div>
        ))}
      </Stack>
    </Modal>
  );
}
