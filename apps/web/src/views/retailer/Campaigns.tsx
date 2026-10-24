/* Everything this outlet has run: the campaign book, the creatives behind
   it, the codes travellers claim, and how the budget is pacing. */

import { useState } from 'react';
import { useApp } from '../../lib/app-state';
import { useCampaignMutations, useCreativeMutations } from '../../lib/queries';
import { AdPage } from '../../components/AdPage';
import { Modal } from '../../components/Modal';
import { Qr } from '../../components/Qr';
import { claimUrl } from '../../lib/qr';
import {
  BarRow, Bars, Cap, Chip, DataTable, Grid, Note, PageHead, Pad, Panel, Row, Stack, type Column
} from '../../components/primitives';
import { useOutletScope } from './use-outlet';
import type { Campaign, Creative, PromoCode } from '../../lib/types';

type Tab = 'history' | 'creatives' | 'promos' | 'ab';

const TABS: Array<[Tab, string]> = [
  ['history', 'Campaign history'],
  ['creatives', 'Creative library'],
  ['promos', 'Promo codes'],
  ['ab', 'A/B and pacing']
];

export function RetailerCampaigns(): JSX.Element {
  const { outletName } = useApp();
  const [tab, setTab] = useState<Tab>('history');
  const scope = useOutletScope(120);
  const [promo, setPromo] = useState<PromoCode | null>(null);

  return (
    <Stack>
      <PageHead
        title="Campaigns"
        lead={`Everything ${outletName} has run, the creatives behind it, and the codes travellers claim.`}
      />

      <Panel>
        <div>
          <Pad tight>
            <div className="row tight">
              {TABS.map(([id, label]) => (
                <button
                  key={id}
                  className="btn sm"
                  type="button"
                  aria-pressed={tab === id}
                  onClick={() => setTab(id)}
                >
                  {label}
                </button>
              ))}
            </div>
          </Pad>

          {tab === 'history' && <HistoryTab campaigns={scope.campaigns} />}
          {tab === 'creatives' && <CreativesTab creatives={scope.creatives} />}
          {tab === 'promos' && <PromosTab promos={scope.promos} onOpen={setPromo} />}
          {tab === 'ab' && <AbTab campaigns={scope.campaigns} creatives={scope.creatives} />}
        </div>
      </Panel>

      {promo && (
        <PromoDialog
          promo={promo}
          campaign={scope.campaigns.find((c) => c.id === promo.campaignId) ?? null}
          onClose={() => setPromo(null)}
        />
      )}
    </Stack>
  );
}

/* ---- history ---------------------------------------------------------- */

function HistoryTab({ campaigns }: { campaigns: Campaign[] }): JSX.Element {
  const { fmt, pushToast } = useApp();
  const { update } = useCampaignMutations();

  const cols: Array<Column<Campaign>> = [
    { label: 'Campaign', render: (c) => c.name },
    {
      label: 'Status',
      render: (c) => (
        <Chip tone={c.status === 'live' ? 'ok' : c.status === 'pending' ? 'warn' : undefined}>{c.status}</Chip>
      )
    },
    { label: 'Approval', render: (c) => <Chip tone={c.approval === 'approved' ? 'ok' : 'warn'}>{c.approval}</Chip> },
    { label: 'Spend', n: true, render: (c) => `${fmt.money(c.spent)} / ${fmt.money(c.budget)}` },
    { label: 'CPM', n: true, render: (c) => fmt.money2(c.cpm) },
    {
      label: 'Conversion index',
      n: true,
      render: (c) => (
        <Chip tone={c.cvrIndex > 1.2 ? 'ok' : undefined}>{c.cvrIndex.toFixed(2)}×</Chip>
      )
    },
    {
      label: '',
      render: (c) => (
        <button
          className="btn sm"
          type="button"
          onClick={() => {
            update.mutate({ id: c.id, patch: { status: 'live', approval: 'approved', spent: 0 } });
            pushToast('Campaign relaunched', `${c.name} is live again with a fresh budget`);
          }}
        >
          Run again
        </button>
      )
    }
  ];

  return (
    <DataTable<Campaign>
      cols={cols}
      rows={campaigns}
      rowKey={(c) => c.id}
      scroll
      empty="No history for this outlet"
    />
  );
}

/* ---- creative library ------------------------------------------------- */

function CreativesTab({ creatives }: { creatives: Creative[] }): JSX.Element {
  const { pushToast } = useApp();
  const { duplicate } = useCreativeMutations();

  /* A copy comes back unapproved and unattached, so it is a starting point
     for the next offer rather than a second live ad. */
  const onDuplicate = (c: Creative): void => {
    duplicate.mutate(c.id, {
      onSuccess: (copy) =>
        pushToast('Creative duplicated', `${copy.id} · a pending copy of ${c.id}`),
      onError: () => pushToast('Could not duplicate', c.id)
    });
  };

  return (
    <Pad>
      <Grid cols="3">
        {creatives.map((c) => (
          <div className="creativetile" key={c.id}>
            <div className="adprev">
              <AdPage creative={c} preview />
            </div>
            <div className="between">
              <b style={{ fontSize: '12.5px' }}>{c.id}</b>
              <Chip tone={c.approval === 'approved' ? 'ok' : c.approval === 'rejected' ? 'crit' : 'warn'}>
                {c.approval}
              </Chip>
            </div>
            <div className="between">
              <span className="note">
                {c.template} · {c.ratio}
                {c.generatedBy !== 'studio' ? ' · generated' : ''}
              </span>
              <button
                className="btn sm ghost"
                type="button"
                disabled={duplicate.isPending}
                onClick={() => onDuplicate(c)}
              >
                Duplicate
              </button>
            </div>
          </div>
        ))}
        {!creatives.length && <Note>No creatives for this outlet yet.</Note>}
      </Grid>
    </Pad>
  );
}

/* ---- promo codes ------------------------------------------------------ */

function PromosTab({
  promos, onOpen
}: {
  promos: PromoCode[];
  onOpen: (p: PromoCode) => void;
}): JSX.Element {
  const { fmt } = useApp();
  const cols: Array<Column<PromoCode>> = [
    { label: 'Code', render: (p) => <span className="mono">{p.code}</span> },
    { label: 'Offer', render: (p) => p.offer },
    { label: 'Valid until', render: () => <Chip tone="amber">linked flight closes boarding</Chip> },
    {
      label: 'Redeemed',
      n: true,
      render: (p) => `${fmt.n(p.redemptions)} / ${fmt.n(p.maxRedemptions)}`
    },
    {
      label: 'Share to family',
      render: (p) => <Chip tone={p.shareEnabled ? 'ok' : undefined}>{p.shareEnabled ? 'on' : 'off'}</Chip>
    },
    {
      label: '',
      render: (p) => (
        <button className="btn sm ghost" type="button" onClick={() => onOpen(p)}>QR and terms</button>
      )
    }
  ];
  return (
    <DataTable<PromoCode>
      cols={cols}
      rows={promos}
      rowKey={(p) => p.id}
      empty="No promo codes for this outlet"
      scroll
    />
  );
}

function PromoDialog({
  promo, campaign, onClose
}: {
  promo: PromoCode;
  campaign: Campaign | null;
  onClose: () => void;
}): JSX.Element {
  const { fmt } = useApp();
  return (
    <Modal title={`Promo code ${promo.code}`} onClose={onClose}>
      <Grid cols="2">
        <Stack>
          <Cap>Scan target</Cap>
          <div style={{ background: '#fff', padding: '10px', borderRadius: '8px', width: 'fit-content' }}>
            <Qr text={claimUrl(promo.code)} size={150} />
          </div>
          <Note>
            The QR opens the mobile claim page on this same deployment, so a reviewer can scan it with a real
            phone.
          </Note>
        </Stack>
        <Stack>
          <Cap>Terms</Cap>
          <p style={{ fontSize: '13px' }}>{promo.terms}</p>
          <div className="bigcode">{promo.code}</div>
          <Row tight>
            <Chip>{fmt.n(promo.redemptions)} claimed</Chip>
            <Chip>cap {fmt.n(promo.maxRedemptions)}</Chip>
            {promo.shareEnabled && <Chip tone="ok">share to family on</Chip>}
          </Row>
          {campaign && <Note>{campaign.advertiser} — {campaign.name}</Note>}
        </Stack>
      </Grid>
    </Modal>
  );
}

/* ---- A/B and pacing --------------------------------------------------- */

function AbTab({
  campaigns, creatives
}: {
  campaigns: Campaign[];
  creatives: Creative[];
}): JSX.Element {
  const { fmt } = useApp();
  const { approve } = useCreativeMutations();

  return (
    <Pad>
      <Grid cols="2">
        <Stack>
          <Cap>Budget pacing</Cap>
          <Bars>
            {campaigns.map((c) => (
              <BarRow
                key={c.id}
                label={c.name}
                value={Math.min(1, c.spent / Math.max(1, c.budget))}
                tone={c.spent / Math.max(1, c.budget) > 0.8 ? 'muted' : 'ok'}
                index={fmt.money(c.spent)}
              />
            ))}
          </Bars>
          {!campaigns.length && <Note>No campaigns to pace.</Note>}
        </Stack>

        <Stack>
          <Cap>A/B creative comparison</Cap>
          <DataTable<Creative>
            cols={[
              { label: 'Creative', render: (c) => c.id },
              { label: 'Template', render: (c) => c.template },
              { label: 'Ratio', render: (c) => c.ratio },
              {
                label: 'State',
                render: (c) => (
                  <Chip tone={c.approval === 'approved' ? 'ok' : 'warn'}>{c.approval}</Chip>
                )
              },
              {
                label: '',
                render: (c) =>
                  c.approval === 'pending' ? (
                    <button className="btn sm ghost" type="button" onClick={() => approve.mutate(c.id)}>
                      Approve
                    </button>
                  ) : null
              }
            ]}
            rows={creatives.slice(0, 6)}
            rowKey={(c) => c.id}
            empty="No creatives to compare"
          />
        </Stack>
      </Grid>
    </Pad>
  );
}
