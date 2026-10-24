/* The explanation. Everything in here is read off a Decision: the crowd it
   was built from, the top three scored candidates with their weighted
   terms, the winning rule, the evidence trail and the verification checks. */

import type { Campaign, Decision } from '../lib/types';
import { useApp } from '../lib/app-state';
import { CandidateCard } from './CandidateCard';
import { Cap, Chip, Grid, Note, ProfileBars, Row, Stack } from './primitives';

export function WhyBody({
  decision, campaigns
}: {
  decision: Decision;
  campaigns: Campaign[];
}): JSX.Element {
  const { t, fmt } = useApp();
  const byId = new Map(campaigns.map((c) => [c.id, c]));

  if (decision.empty) {
    return <Note>{decision.reason ?? 'Nothing in the catchment.'}</Note>;
  }

  return (
    <Stack>
      <Row tight>
        {decision.modelVersion && <Chip tone="amber">{decision.modelVersion}</Chip>}
        {decision.fallback
          ? <Chip tone="warn">rule-based fallback</Chip>
          : <Chip tone="ok">verified against the feeds</Chip>}
        <Chip>{fmt.n(decision.crowdNow)} pax now</Chip>
        <Chip>{fmt.n(decision.crowdNext30)} in 30 min</Chip>
        <Chip>dwell {decision.dwellMedian} min</Chip>
        {!!decision.maxDelay && <Chip tone="warn">delay {decision.maxDelay} min</Chip>}
      </Row>

      <Grid cols="2">
        <div>
          <Cap>{t('why.profile')}</Cap>
          {decision.profile
            ? <ProfileBars profile={decision.profile} />
            : <Note>No crowd in the catchment</Note>}

          <Cap style={{ marginTop: '10px' }}>Built from</Cap>
          <Stack gap={4}>
            {(decision.parts ?? []).map((p) => (
              <div className="note" key={p.id}>
                <span className="mono">{p.id}</span>
                {` → ${p.dest} · gate ${p.gate} · ${fmt.n(p.pax)} pax · `}
                {p.delay ? `${p.delay} min late · ` : ''}
                {`boards in ${p.t} min · weight ${p.weight}`}
              </div>
            ))}
          </Stack>
        </div>

        <div>
          <Cap>{t('why.candidates')}</Cap>
          <Stack>
            {decision.candidates.slice(0, 3).map((c, i) => (
              <CandidateCard
                key={c.campaignId}
                score={c}
                campaign={byId.get(c.campaignId) ?? null}
                winner={i === 0 && !decision.fallback}
              />
            ))}
          </Stack>

          {decision.filtered.length > 0 && (
            <details style={{ marginTop: '8px' }}>
              <summary className="note">{decision.filtered.length} filtered out</summary>
              <Stack gap={3} style={{ marginTop: '6px' }}>
                {decision.filtered.slice(0, 6).map((f) => (
                  <div className="note" key={f.campaignId}>
                    <b>{f.advertiser}</b>
                    {` — ${fmt.pct(f.match ?? 0)} · ${f.reasons[0]}`}
                  </div>
                ))}
              </Stack>
            </details>
          )}
        </div>
      </Grid>

      <div>
        <Cap>{t('why.rule')}</Cap>
        <p style={{ fontSize: '13.5px' }}>{decision.rule}</p>
      </div>

      <div>
        <Cap>{t('why.evidence')}</Cap>
        <Stack gap={4}>
          {decision.evidence.map((e, i) => (
            <Row tight key={`${e.sourceKey}-${i}`}>
              <Chip tone="info">{e.source}</Chip>
              <span className="note">{e.detail}</span>
              <Chip>{Math.round((decision.at - e.at) / 1000)}s</Chip>
            </Row>
          ))}
        </Stack>
      </div>

      <div>
        <Cap>Verification</Cap>
        <Stack gap={4}>
          {decision.verification.checks.map((c) => (
            <Row tight key={c.name}>
              <Chip tone={c.pass ? 'ok' : 'crit'}>{c.pass ? '✓' : '✗'}</Chip>
              <span style={{ fontSize: '12.5px' }}>{c.name}</span>
              <span className="note">{c.detail}</span>
            </Row>
          ))}
        </Stack>
      </div>
    </Stack>
  );
}
