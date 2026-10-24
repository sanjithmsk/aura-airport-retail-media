/* The approval queue. Nothing reaches a screen until every brand-safety
   box is ticked — the decision engine treats an unapproved creative as a
   hard filter, so this queue is a real gate, not a formality. */

import { useState } from 'react';
import { useApp } from '../../lib/app-state';
import { useCampaigns, useCreatives, useCreativeMutations } from '../../lib/queries';
import { AdPage } from '../../components/AdPage';
import { Chip, Grid, Note, PageHead, Pad, Panel, Row, Stack } from '../../components/primitives';
import type { Creative } from '../../lib/types';

const CHECKS: Array<[keyof Creative['checks'], string]> = [
  ['brandSafety', 'No competitor marks, no alcohol or tobacco where restricted'],
  ['legibility', 'Legible at six metres, minimum type size met'],
  ['duration', 'Fits the 15-second slot with no animation overrun'],
  ['languages', 'English plus the second configured language present']
];

export function MediaApprovals(): JSX.Element {
  const creatives = useCreatives();
  const campaigns = useCampaigns();
  const pending = (creatives.data ?? []).filter((c) => c.approval === 'pending');

  return (
    <Stack>
      <PageHead
        title="Approval queue"
        lead={
          `${pending.length} creative${pending.length === 1 ? '' : 's'} waiting. Nothing reaches a screen ` +
          'until every brand-safety box is ticked — the decision engine treats an unapproved creative as a ' +
          'hard filter.'
        }
      />

      {pending.length ? (
        <Grid cols="2">
          {pending.map((c) => (
            <ApprovalCard
              key={c.id}
              creative={c}
              campaignName={
                (campaigns.data ?? []).find((x) => x.id === c.campaignId)?.name ?? c.headline.en
              }
            />
          ))}
        </Grid>
      ) : (
        <Panel>
          <Pad>
            <Note>The queue is clear. New submissions from the retailer builder land here.</Note>
          </Pad>
        </Panel>
      )}
    </Stack>
  );
}

function ApprovalCard({
  creative, campaignName
}: {
  creative: Creative;
  campaignName: string;
}): JSX.Element {
  const { pushToast } = useApp();
  const { approve, reject } = useCreativeMutations();
  /* The ticks are the reviewer's own sign-off on this visit; the creative's
     stored checks are the starting state. */
  const [ticks, setTicks] = useState<Record<string, boolean>>({ ...creative.checks });
  const allTicked = CHECKS.every(([k]) => ticks[k]);

  return (
    <Panel title={creative.advertiser} right={<Chip tone="warn">pending</Chip>}>
      <Pad>
        <Stack>
          <div className="adprev">
            <AdPage creative={creative} preview />
          </div>

          <div className="between">
            <b>{campaignName}</b>
            <Chip>{creative.id}</Chip>
          </div>
          <div className="note">
            {creative.template} · {creative.ratio}
            {creative.brief ? ` · brief: "${creative.brief}"` : ''}
          </div>

          <Stack gap={4}>
            {CHECKS.map(([k, label]) => (
              <div className="row tight" key={String(k)}>
                <input
                  type="checkbox"
                  id={`ck-${creative.id}-${String(k)}`}
                  checked={!!ticks[k]}
                  onChange={(e) => setTicks({ ...ticks, [k]: e.target.checked })}
                />
                <label htmlFor={`ck-${creative.id}-${String(k)}`} style={{ fontSize: '12px' }}>
                  {label}
                </label>
              </div>
            ))}
          </Stack>

          <Row>
            <button
              className="btn primary"
              type="button"
              disabled={!allTicked || approve.isPending}
              onClick={() =>
                approve.mutate(creative.id, {
                  onSuccess: () =>
                    pushToast('Approved', `${creative.advertiser} · ${creative.id} is live from the next slot`)
                })
              }
            >
              Approve
            </button>
            <button
              className="btn danger"
              type="button"
              disabled={reject.isPending}
              onClick={() =>
                reject.mutate(creative.id, {
                  onSuccess: () => pushToast('Rejected', `${creative.id} returned to ${creative.advertiser}`)
                })
              }
            >
              Reject
            </button>
          </Row>
        </Stack>
      </Pad>
    </Panel>
  );
}
