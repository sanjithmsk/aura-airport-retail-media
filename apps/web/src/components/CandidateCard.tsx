/* One scored campaign with its weighted terms spelled out. This is the
   unit the "Why this ad?" panel, the decision modal and the media
   manager's conflict view all reuse. */

import type { Campaign, CampaignScore } from '../lib/types';
import { useApp } from '../lib/app-state';
import { BarRow, Bars, Chip } from './primitives';

export function CandidateCard({
  score, campaign, winner
}: {
  score: CampaignScore;
  campaign?: Campaign | null;
  winner?: boolean;
}): JSX.Element {
  const { fmt } = useApp();
  return (
    <div
      style={{
        border: `1px solid ${winner ? 'var(--accent)' : 'var(--line)'}`,
        borderRadius: 'var(--r-s)',
        padding: '10px 12px',
        background: winner ? 'color-mix(in srgb, var(--accent) 9%, transparent)' : 'var(--panel-2)'
      }}
    >
      <div className="between">
        <b style={{ fontSize: '12.5px' }}>
          {campaign ? `${campaign.advertiser} — ${campaign.name}` : score.campaignId}
        </b>
        <span className="row tight">
          {score.boost > 1 && (
            <Chip tone="warn">×{score.boost} {score.firedTriggers[0]?.label ?? 'boost'}</Chip>
          )}
          <Chip tone="amber">{score.final.toFixed(2)}</Chip>
        </span>
      </div>

      <div style={{ marginTop: '7px' }}>
        <Bars>
          {score.terms.map((term) => (
            <BarRow
              key={term.segId}
              label={`${term.label} ×${term.weight}`}
              value={term.share}
              tone="muted"
              index={term.index != null ? `idx ${term.index.toFixed(2)}` : undefined}
            />
          ))}
        </Bars>
      </div>

      <div className="note" style={{ marginTop: '6px' }}>
        Audience match {fmt.pct(score.match, 1)} · {score.formula}
      </div>

      {score.rules && score.rules.length > 0 && (
        <div className="row tight" style={{ marginTop: '5px' }}>
          {score.rules.map((r, i) => (
            <Chip key={`${r.rule}-${i}`} tone={r.effect === 'excluded' ? 'crit' : 'info'}>
              {r.rule} {r.effect}
            </Chip>
          ))}
        </div>
      )}

      {score.excluded && (
        <div className="note" style={{ color: 'var(--crit)' }}>{score.excluded}</div>
      )}
    </div>
  );
}
