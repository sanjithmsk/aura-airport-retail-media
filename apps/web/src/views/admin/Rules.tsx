/* Rule engine and decision log. The engine constants are read from
   /api/config; the log is searchable and every row opens its full evidence
   trail, which is the same panel the passenger screen shows. */

import { useState } from 'react';
import { useApp } from '../../lib/app-state';
import { hhmm } from '../../lib/format';
import { SEGMENTS, type Segment } from '../../lib/reference';
import { useCampaigns, useConfig, useDecisions } from '../../lib/queries';
import { Modal } from '../../components/Modal';
import { WhyBody } from '../../components/WhyPanel';
import {
  Chip, DataTable, Grid, Note, PageHead, Pad, Panel, Stack, type Column
} from '../../components/primitives';
import type { Decision } from '../../lib/types';

const SETTINGS: Array<{ key: string; label: string; help: string }> = [
  {
    key: 'triggerBoostWeight', label: 'Trigger boost weight',
    help: 'How much of a campaign trigger boost is applied. A ×1.5 trigger at 0.33 multiplies the score by 1.165.'
  },
  {
    key: 'conversionLiftCap', label: 'Conversion lift cap',
    help: 'Ceiling on the additive lift a campaign earns from measured scans and redemptions.'
  },
  {
    key: 'explorationPct', label: 'Exploration %',
    help: 'Share of slots given to lower-ranked campaigns so the model keeps learning.'
  },
  {
    key: 'frequencyCapPerHour', label: 'Frequency cap per hour',
    help: 'Maximum plays of one campaign on one screen in a rolling hour.'
  },
  {
    key: 'competitorSeparation', label: 'Competitor separation',
    help: 'Slots that must pass before another brand in the same category can play.'
  },
  {
    key: 'slotSeconds', label: 'Slot length (seconds)',
    help: 'How often each screen re-decides.'
  }
];

export function AdminRules(): JSX.Element {
  const { fmt } = useApp();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Decision | null>(null);

  const config = useConfig();
  const decisions = useDecisions(query || undefined, 60);
  const campaigns = useCampaigns();

  const engine = config.data?.engine;

  return (
    <Stack>
      <PageHead
        title="Rule engine and decision log"
        lead="Global weights and guardrails, plus a searchable record of every decision with the evidence it was built from. Changes apply from the next slot."
      />

      <Grid cols="2">
        <Panel
          title="Engine settings"
          right={engine && <Chip tone="amber">{engine.version}</Chip>}
        >
          <Pad>
            <Grid cols="2">
              {SETTINGS.map((s) => (
                <div className="field" key={s.key}>
                  <label>{s.label}</label>
                  <div className="mono" style={{ fontSize: '14px', fontWeight: 600 }}>
                    {engine ? String((engine as unknown as Record<string, unknown>)[s.key] ?? '—') : '—'}
                  </div>
                  <span className="note">{s.help}</span>
                </div>
              ))}
            </Grid>
            <Note style={{ marginTop: '10px' }}>
              The engine is configured server-side so every client sees the same guardrails. A deployment
              edits them through @aura/api; the values above are what the running engine is using now.
            </Note>
          </Pad>
        </Panel>

        <Panel title="Segment model" right={<Chip>{SEGMENTS.length} segments</Chip>}>
          <Pad tight>
            <DataTable<Segment>
              cols={segmentCols(fmt.pct)}
              rows={SEGMENTS}
              rowKey={(s) => s.id}
              scroll
            />
          </Pad>
        </Panel>
      </Grid>

      <Panel
        title="Decision log"
        right={
          <input
            className="input"
            placeholder="Search screen, advertiser, rule…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        }
      >
        <Pad tight>
          <DataTable<Decision>
            cols={logCols(fmt.n, setOpen)}
            rows={decisions.data ?? []}
            /* The log can hold several decisions for one screen at one
               timestamp, so the index is part of the key, not a fallback. */
            rowKey={(d, i) => `${d.id ?? `${d.screenId}@${d.at}`}#${i}`}
            scroll
            empty="No decisions match that search"
          />
        </Pad>
      </Panel>

      {open && (
        <Modal
          title={`Decision · ${open.screenName ?? open.screenId} at ${hhmm(open.at)}`}
          onClose={() => setOpen(null)}
          wide
        >
          <Stack>
            <div className="row tight">
              {open.modelVersion && <Chip tone="amber">{open.modelVersion}</Chip>}
              {open.fallback
                ? <Chip tone="warn">rule-based fallback</Chip>
                : <Chip tone="ok">verified</Chip>}
              {open.confidence != null && <Chip>confidence {fmt.pct(open.confidence)}</Chip>}
            </div>
            {open.fallbackReason && <Note>{open.fallbackReason}</Note>}
            <WhyBody decision={open} campaigns={campaigns.data ?? []} />
          </Stack>
        </Modal>
      )}
    </Stack>
  );
}

function segmentCols(pct: (v: number, d?: number) => string): Array<Column<Segment>> {
  return [
    { label: 'Segment', render: (s) => s.label },
    { label: 'Group', render: (s) => s.group },
    { label: 'Read from', render: (s) => <span className="mono">{s.path}</span> },
    { label: 'Network baseline', n: true, render: (s) => pct(s.base, 1) }
  ];
}

function logCols(
  n: (v: number | null | undefined) => string,
  open: (d: Decision) => void
): Array<Column<Decision>> {
  return [
    { label: 'Time', render: (d) => <span className="mono">{hhmm(d.at)}</span> },
    { label: 'Screen', render: (d) => d.screenName ?? d.screenId },
    { label: 'Zone', render: (d) => <span className="mono">{d.zone ?? '—'}</span> },
    { label: 'Crowd', n: true, render: (d) => n(d.crowdNow) },
    {
      label: 'Candidates', n: true,
      render: (d) => `${d.candidates.length} / ${d.candidates.length + d.filtered.length}`
    },
    {
      label: 'Played',
      render: (d) =>
        d.winnerCampaign ? d.winnerCampaign.advertiser : <span className="muted">airport content</span>
    },
    { label: 'Score', n: true, render: (d) => (d.winner ? d.winner.final.toFixed(2) : '—') },
    {
      label: 'Verified',
      render: (d) => (d.fallback ? <Chip tone="warn">fallback</Chip> : <Chip tone="ok">verified</Chip>)
    },
    {
      label: '',
      render: (d) => (
        <button className="btn sm ghost" type="button" onClick={() => open(d)}>Evidence</button>
      )
    }
  ];
}
