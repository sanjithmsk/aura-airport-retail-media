/* The campaign builder's live preview. It mirrors the engine's scoring
   formula so the number moves as you drag a weight, without a round-trip
   per keystroke; the authoritative score is always the one the engine logs. */

import { SEGMAP } from './reference';
import type { CrowdProfile, ScoreTerm, Trigger } from './types';

export interface PreviewContext {
  profile: CrowdProfile;
  confidence: number;
  maxDelay: number;
  boardingNow?: boolean;
  gateChanged?: boolean;
  festival?: boolean;
}

export interface PreviewScore {
  terms: ScoreTerm[];
  coverage: number;
  match: number;
  lift: number;
  boost: number;
  boostMultiplier: number;
  final: number;
  firedTriggers: Trigger[];
  formula: string;
}

export interface EngineConstants {
  conversionLiftCap: number;
  conversionLiftScale: number;
  triggerBoostWeight: number;
}

const DEFAULT_ENGINE: EngineConstants = {
  conversionLiftCap: 0.1,
  conversionLiftScale: 0.1,
  triggerBoostWeight: 0.33
};

function readPath(profile: CrowdProfile, path: string): number {
  const value = path.split('.').reduce<unknown>(
    (o, k) => (o == null || typeof o !== 'object' ? undefined : (o as Record<string, unknown>)[k]),
    profile as unknown
  );
  return typeof value === 'number' ? value : 0;
}

export function segmentShare(profile: CrowdProfile, segId: string): number {
  const seg = SEGMAP[segId];
  if (!seg) return 0;
  return readPath(profile, seg.path);
}

export function previewScore(
  input: { weights: Record<string, number>; cvrIndex: number; triggers: Trigger[] },
  ctx: PreviewContext,
  engine: EngineConstants = DEFAULT_ENGINE
): PreviewScore {
  const terms: ScoreTerm[] = [];
  let prod = 1;

  for (const [segId, weight] of Object.entries(input.weights ?? {})) {
    const share = segmentShare(ctx.profile, segId);
    const reach = weight * share;
    prod *= 1 - reach;
    const seg = SEGMAP[segId];
    terms.push({
      segId,
      label: seg?.label ?? segId,
      weight,
      share,
      reach,
      index: seg?.base ? share / seg.base : null
    });
  }

  const coverage = 1 - prod;
  const match = coverage * ctx.confidence;
  const lift = Math.max(
    0,
    Math.min(engine.conversionLiftCap, ((input.cvrIndex || 1) - 1) * engine.conversionLiftScale)
  );

  let boost = 1;
  const firedTriggers: Trigger[] = [];
  (input.triggers ?? []).forEach((tr) => {
    const fired =
      (tr.type === 'delay' && ctx.maxDelay >= (tr.overMin ?? 0)) ||
      (tr.type === 'gateChange' && !!ctx.gateChanged) ||
      (tr.type === 'boarding' && !!ctx.boardingNow) ||
      (tr.type === 'festival' && !!ctx.festival);
    if (fired) {
      boost = Math.max(boost, tr.boost);
      firedTriggers.push(tr);
    }
  });

  const boostMultiplier = 1 + (boost - 1) * engine.triggerBoostWeight;
  const final = Math.round((match + lift) * boostMultiplier * 100) / 100;

  return {
    terms,
    coverage,
    match,
    lift,
    boost,
    boostMultiplier,
    final,
    firedTriggers,
    formula:
      `(${(match * 100).toFixed(1)}% + ${lift.toFixed(3)}) × ` +
      `${boostMultiplier.toFixed(3)} = ${final.toFixed(2)}`
  };
}
