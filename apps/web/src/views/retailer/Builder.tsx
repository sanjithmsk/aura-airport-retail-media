/* Campaign builder. Pick who you want in front of the screen, where and
   when; the match preview on the right recomputes against the live crowd
   as you change anything. */

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueries } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useApp } from '../../lib/app-state';
import { useZoneAggregate } from '../../lib/footfall';
import { previewScore, type EngineConstants } from '../../lib/preview-score';
import { REGION_LIST, SEGMENTS, type Segment } from '../../lib/reference';
import {
  qk, useCampaignMutations, useConfig, useCreativeMutations, useScreens, useSim, useZones
} from '../../lib/queries';
import { AdPage, draftCreative } from '../../components/AdPage';
import { Modal } from '../../components/Modal';
import {
  BarRow, Bars, Cap, Chip, DataTable, Field, Grid, Note, PageHead, Pad, Panel, Row, Stack,
  type Column
} from '../../components/primitives';
import { useOutletScope } from './use-outlet';
import type { Campaign, Creative, HardFilters, ZonePresence } from '../../lib/types';

interface Draft {
  id: string;
  name: string;
  advertiser: string;
  outletId: string | null;
  category: string;
  weights: Record<string, number>;
  hard: HardFilters;
  budget: number;
  dailyCap: number | null;
  cpm: number;
  cvrIndex: number;
  creative: string | null;
  schedule: { from: string; to: string };
}

function newDraft(advertiser: string, outletId: string | null, category: string, zone: string): Draft {
  return {
    id: `CMP-${300 + Math.floor(Math.random() * 600)}`,
    name: 'New offer',
    advertiser,
    outletId,
    category,
    weights: { holiday: 0.6, family: 0.5 },
    hard: { zones: zone ? [zone] : [], minCrowd: 50, minDwell: 10 },
    budget: 6000,
    dailyCap: 1200,
    cpm: 8.5,
    cvrIndex: 1,
    creative: null,
    schedule: { from: '06:00', to: '22:00' }
  };
}

export function RetailerBuilder(): JSX.Element {
  const { fmt, outletName, pushToast, currencySymbol } = useApp();
  const navigate = useNavigate();
  const scope = useOutletScope(120);
  const zones = useZones();
  const screens = useScreens();
  const config = useConfig();
  const { create } = useCampaignMutations();

  const first = scope.outlets[0];
  const [draft, setDraft] = useState<Draft | null>(null);
  const [genOpen, setGenOpen] = useState(false);

  const d: Draft = draft ?? newDraft(outletName, first?.id ?? null, first?.category ?? 'dutyfree', first?.zone ?? '');
  const patch = (next: Partial<Draft>): void => setDraft({ ...d, ...next });
  const patchHard = (next: Partial<HardFilters>): void => setDraft({ ...d, hard: { ...d.hard, ...next } });

  const targetZones = d.hard.zones ?? [];
  const aggregate = useZoneAggregate(targetZones);
  const targetScreens = useMemo(
    () => (screens.data ?? []).filter((s) => targetZones.includes(s.zone)),
    [screens.data, targetZones]
  );

  const engine = config.data?.engine;
  const engineConstants = useMemo<EngineConstants | undefined>(
    () =>
      engine
        ? {
            conversionLiftCap: engine.conversionLiftCap,
            conversionLiftScale: engine.conversionLiftScale,
            triggerBoostWeight: engine.triggerBoostWeight
          }
        : undefined,
    [engine]
  );
  const score = aggregate.profile
    ? previewScore(
        { weights: d.weights, cvrIndex: d.cvrIndex, triggers: [] },
        { profile: aggregate.profile, confidence: 1, maxDelay: 0 },
        engineConstants
      )
    : null;

  const avgMatch = score?.match ?? 0;
  const reachPax = aggregate.pax;
  const expImpressions = Math.round(reachPax * 0.42 * 6);
  const expRedemptions = Math.round(expImpressions * 0.0025 * d.cvrIndex);

  const grouped = useMemo(() => {
    const g = new Map<string, Segment[]>();
    SEGMENTS.forEach((s) => {
      const list = g.get(s.group) ?? [];
      list.push(s);
      g.set(s.group, list);
    });
    return Array.from(g.entries());
  }, []);

  const chosenCreative = scope.creatives.find((c) => c.id === d.creative);
  const previewCreative: Creative =
    chosenCreative ??
    draftCreative({ id: d.id, advertiser: d.advertiser, category: d.category, headline: d.name });

  const submit = (): void => {
    if (!d.creative) {
      setGenOpen(true);
      return;
    }
    const campaign: Campaign = {
      id: d.id,
      name: d.name,
      advertiser: d.advertiser,
      outletId: d.outletId,
      category: d.category,
      weights: d.weights,
      hard: d.hard,
      triggers: [],
      budget: d.budget,
      dailyCap: d.dailyCap,
      spent: 0,
      cpm: d.cpm,
      cvrIndex: d.cvrIndex,
      creative: d.creative,
      promo: null,
      priority: 1,
      schedule: d.schedule,
      status: 'pending',
      approval: 'pending',
      brandSafety: 'passed',
      frequencyCap: 4,
      pinned: false
    };
    create.mutate(campaign, {
      onSuccess: () => {
        pushToast('Submitted for approval', `${d.name} is now in the media manager’s queue`);
        setDraft(null);
        navigate('/retailer/campaigns');
      },
      onError: () => pushToast('Could not submit', 'The API rejected the campaign')
    });
  };

  return (
    <Stack>
      <PageHead
        title="Campaign builder"
        lead="Pick who you want in front of the screen, where and when. The match preview on the right recomputes against the live crowd as you change anything."
      >
        <div className="spacer" />
        <Row>
          <button className="btn ghost" type="button" onClick={() => setDraft(null)}>Reset</button>
          <button className="btn primary" type="button" onClick={submit} disabled={create.isPending}>
            Submit for approval
          </button>
        </Row>
      </PageHead>

      <Grid cols="23">
        <Stack>
          <Panel title="Offer">
            <Pad>
              <Grid cols="2">
                <Field label="Campaign name">
                  <input className="input" value={d.name} onChange={(e) => patch({ name: e.target.value })} />
                </Field>
                <Field label="Creative">
                  <div className="row tight">
                    <select
                      className="input"
                      style={{ flex: '1 1 auto' }}
                      value={d.creative ?? ''}
                      onChange={(e) => patch({ creative: e.target.value || null })}
                    >
                      <option value="">Choose a template…</option>
                      {scope.creatives.map((c) => (
                        <option key={c.id} value={c.id}>{c.id} · {c.template}</option>
                      ))}
                    </select>
                    <button className="btn sm" type="button" onClick={() => setGenOpen(true)}>✨ Generate</button>
                  </div>
                </Field>
                <Field label={`Total budget (${currencySymbol})`}>
                  <input
                    className="input"
                    type="number"
                    step={500}
                    value={d.budget}
                    onChange={(e) => patch({ budget: Number(e.target.value) })}
                  />
                </Field>
                <Field label={`Daily cap (${currencySymbol}, blank for none)`}>
                  <input
                    className="input"
                    type="number"
                    step={100}
                    value={d.dailyCap ?? ''}
                    placeholder="no cap"
                    onChange={(e) =>
                      patch({ dailyCap: e.target.value === '' ? null : Number(e.target.value) })
                    }
                  />
                </Field>
                <Field label="Price per thousand impressions">
                  <input
                    className="input"
                    type="number"
                    step={0.5}
                    value={d.cpm}
                    onChange={(e) => patch({ cpm: Number(e.target.value) })}
                  />
                </Field>
                <Field label="Runs from">
                  <input
                    className="input"
                    type="time"
                    value={d.schedule.from}
                    onChange={(e) => patch({ schedule: { ...d.schedule, from: e.target.value } })}
                  />
                </Field>
                <Field label="Runs until">
                  <input
                    className="input"
                    type="time"
                    value={d.schedule.to}
                    onChange={(e) => patch({ schedule: { ...d.schedule, to: e.target.value } })}
                  />
                </Field>
              </Grid>
            </Pad>
          </Panel>

          <Panel title="Audience weights" right={<span className="note">0 = ignore, 1 = this is who I want</span>}>
            <Pad>
              <div className="scrolly">
                <Stack>
                  {grouped.map(([group, segs]) => (
                    <div key={group}>
                      <Cap>{group}</Cap>
                      <Stack gap={4}>
                        {segs.map((s) => {
                          const on = d.weights[s.id] != null;
                          return (
                            <div className="segrow" key={s.id}>
                              <input
                                type="checkbox"
                                id={`sg-${s.id}`}
                                checked={on}
                                onChange={(e) => {
                                  const next = { ...d.weights };
                                  if (e.target.checked) next[s.id] = 0.5;
                                  else delete next[s.id];
                                  patch({ weights: next });
                                }}
                              />
                              <label htmlFor={`sg-${s.id}`}>{s.label}</label>
                              <input
                                type="range"
                                min={0}
                                max={1}
                                step={0.05}
                                disabled={!on}
                                value={on ? d.weights[s.id] : 0.5}
                                onChange={(e) =>
                                  patch({ weights: { ...d.weights, [s.id]: Number(e.target.value) } })
                                }
                              />
                              <span className="mono" style={{ fontSize: '11.5px' }}>
                                {on ? d.weights[s.id].toFixed(2) : '—'}
                              </span>
                            </div>
                          );
                        })}
                      </Stack>
                    </div>
                  ))}
                </Stack>
              </div>
            </Pad>
          </Panel>

          <Panel
            title="Hard filters"
            right={<span className="note">must be true, or the campaign does not play</span>}
          >
            <Pad>
              <Grid cols="2">
                <Field label="Journey">
                  <select
                    className="input"
                    value={d.hard.internationalOnly ? 'intl' : d.hard.domesticOnly ? 'dom' : 'any'}
                    onChange={(e) =>
                      patchHard({
                        internationalOnly: e.target.value === 'intl',
                        domesticOnly: e.target.value === 'dom'
                      })
                    }
                  >
                    <option value="any">Any</option>
                    <option value="intl">International only</option>
                    <option value="dom">Domestic only</option>
                  </select>
                </Field>
                <Field label="Destination region">
                  <select
                    className="input"
                    value={d.hard.region ?? ''}
                    onChange={(e) => patchHard({ region: e.target.value || undefined })}
                  >
                    <option value="">Any region</option>
                    {REGION_LIST.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Minimum passengers in zone">
                  <input
                    className="input"
                    type="number"
                    step={10}
                    value={d.hard.minCrowd ?? 0}
                    onChange={(e) => patchHard({ minCrowd: Number(e.target.value) })}
                  />
                </Field>
                <Field label="Minimum dwell (minutes)">
                  <input
                    className="input"
                    type="number"
                    step={5}
                    value={d.hard.minDwell ?? 0}
                    onChange={(e) => patchHard({ minDwell: Number(e.target.value) })}
                  />
                </Field>
                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <label>Placement — zones</label>
                  <div className="row tight">
                    {(zones.data ?? []).map((z) => {
                      const on = targetZones.includes(z.id);
                      return (
                        <button
                          key={z.id}
                          className="btn sm"
                          type="button"
                          aria-pressed={on}
                          onClick={() =>
                            patchHard({
                              zones: on ? targetZones.filter((x) => x !== z.id) : [...targetZones, z.id]
                            })
                          }
                        >
                          {z.id}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </Grid>
            </Pad>
          </Panel>
        </Stack>

        <Stack>
          <Panel title="Live audience match" right={<Chip tone="amber">{fmt.pct(avgMatch)}</Chip>}>
            <Pad>
              <Stack>
                <p style={{ fontSize: '13px' }}>
                  Matches <b>{fmt.pct(avgMatch)}</b> of the crowd on <b>{targetScreens.length} screens</b> in{' '}
                  <b>{targetZones.join(', ') || 'no zone yet'}</b> right now. Expected{' '}
                  <b>{fmt.n(expImpressions)} impressions</b> and <b>{fmt.n(expRedemptions)} redemptions</b>{' '}
                  over a two-hour run.
                </p>

                {score && score.terms.length > 0 ? (
                  <Bars>
                    {score.terms.map((term) => (
                      <BarRow
                        key={term.segId}
                        label={`${term.label} ×${term.weight}`}
                        value={term.share}
                        tone={term.index != null && term.index > 1.2 ? 'ok' : 'muted'}
                        index={term.index != null ? `idx ${term.index.toFixed(2)}` : undefined}
                      />
                    ))}
                  </Bars>
                ) : (
                  <Note>Pick at least one zone and one segment to see the match.</Note>
                )}

                <Row tight>
                  <Chip>crowd {fmt.n(reachPax)}</Chip>
                  <Chip>cost {fmt.money((expImpressions / 1000) * d.cpm)}</Chip>
                  {score && <Chip tone="amber">score {score.final.toFixed(2)}</Chip>}
                </Row>
                {score && <Note>{score.formula}</Note>}
              </Stack>
            </Pad>
          </Panel>

          <BestSlotsPanel zones={targetZones} weights={d.weights} cvrIndex={d.cvrIndex} engine={engineConstants} />

          <Panel title="Screens in the placement" right={<Chip>{targetScreens.length}</Chip>}>
            <Pad tight>
              <div className="scrolly" style={{ maxHeight: '220px' }}>
                <Stack gap={4}>
                  {targetScreens.slice(0, 12).map((s) => (
                    <div className="between" key={s.id} style={{ fontSize: '12px' }}>
                      <span>{s.name}</span>
                      <span className="mono muted">{s.zone} · {s.ratio}</span>
                    </div>
                  ))}
                  {!targetScreens.length && <Note>No screens in the chosen zones.</Note>}
                </Stack>
              </div>
            </Pad>
          </Panel>

          <Panel title="Preview on a screen" right={<span className="note">{d.creative ?? 'no creative yet'}</span>}>
            <Pad>
              <div className="adprev">
                <AdPage creative={previewCreative} preview />
              </div>
            </Pad>
          </Panel>
        </Stack>
      </Grid>

      {genOpen && (
        <GenerateDialog
          category={d.category}
          initialBrief={d.name !== 'New offer' ? d.name : 'Festive sweets, 20% off, families flying domestic'}
          onClose={() => setGenOpen(false)}
          onUse={(c) => {
            patch({ creative: c.id, name: c.headline.en ?? d.name });
            setGenOpen(false);
            pushToast('Creative generated', `${c.id} · ${c.template}`);
          }}
        />
      )}
    </Stack>
  );
}

/* ---- best three slots ------------------------------------------------- */

/* The forecast stands in for tomorrow: /api/zones/:id/presence takes an
   `at`, so asking it for each hour of the simulated day gives the same
   predicted curve the inventory calendar prices against. */

const SLOT_FROM_HOUR = 6;
const SLOT_TO_HOUR = 21;
/** A placement wider than this would put more probes in flight than the
    panel can justify; the busiest four zones carry the answer. */
const MAX_PROBE_ZONES = 4;

interface SlotRow {
  key: string;
  window: string;
  zone: string;
  pax: number;
  match: number;
  impressions: number;
  score: number;
}

function BestSlotsPanel({
  zones, weights, cvrIndex, engine
}: {
  zones: string[];
  weights: Record<string, number>;
  cvrIndex: number;
  engine: EngineConstants | undefined;
}): JSX.Element {
  const { fmt } = useApp();
  const sim = useSim();

  /* Midnight UTC of the simulated day, so every probe lands on the same
     day the rest of the client is showing. */
  const dayStart = sim.data?.dayStart ?? null;
  const midnight = useMemo(() => {
    if (dayStart == null) return null;
    const d = new Date(dayStart);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }, [dayStart]);

  const probeZones = useMemo(() => zones.slice(0, MAX_PROBE_ZONES), [zones]);

  const probes = useMemo(() => {
    if (midnight == null || !probeZones.length) return [];
    const out: Array<{ zoneId: string; hour: number; at: number }> = [];
    for (let hour = SLOT_FROM_HOUR; hour <= SLOT_TO_HOUR; hour++) {
      probeZones.forEach((zoneId) => out.push({ zoneId, hour, at: midnight + hour * 3_600_000 }));
    }
    return out;
  }, [midnight, probeZones]);

  const results = useQueries({
    queries: probes.map(({ zoneId, at }) => ({
      queryKey: qk.presence(zoneId, at),
      queryFn: () => api.zonePresence(zoneId, at),
      staleTime: 5 * 60_000
    }))
  });

  const rows = useMemo<SlotRow[]>(() => {
    const out: SlotRow[] = [];
    probes.forEach((p, i) => {
      const presence = results[i]?.data as ZonePresence | undefined;
      if (!presence || !presence.profile || presence.pax <= 0) return;
      const match = previewScore(
        { weights, cvrIndex, triggers: [] },
        { profile: presence.profile, confidence: 1, maxDelay: 0 },
        engine
      ).match;
      out.push({
        key: `${p.zoneId}-${p.hour}`,
        window:
          `${String(p.hour).padStart(2, '0')}:00–${String(p.hour + 1).padStart(2, '0')}:00`,
        zone: p.zoneId,
        pax: presence.pax,
        match,
        impressions: Math.round(presence.pax * 0.42 * 4),
        score: presence.pax * match
      });
    });
    return out.sort((a, b) => b.score - a.score).slice(0, 3);
  }, [probes, results, weights, cvrIndex, engine]);

  const loading = results.some((r) => r.isLoading);

  const cols: Array<Column<SlotRow>> = [
    { label: 'Window', render: (s) => <span className="mono">{s.window}</span> },
    { label: 'Zone', render: (s) => s.zone },
    { label: 'Predicted pax', n: true, render: (s) => fmt.n(s.pax) },
    {
      label: 'Match',
      n: true,
      render: (s) => <Chip tone={s.match > 0.5 ? 'ok' : undefined}>{fmt.pct(s.match)}</Chip>
    },
    { label: 'Expected impressions', n: true, render: (s) => fmt.n(s.impressions) }
  ];

  return (
    <Panel title="Best 3 slots tomorrow" right={<span className="note">predicted</span>}>
      <Pad tight>
        <Stack>
          <DataTable<SlotRow>
            cols={cols}
            rows={rows}
            rowKey={(s) => s.key}
            empty={
              !zones.length
                ? 'Pick at least one zone to rank its windows.'
                : loading
                  ? 'Scoring every hour from 06:00 to 21:00…'
                  : 'No predicted presence in these zones today.'
            }
          />
          <Note>
            Ranked by predicted passengers × audience match for each hour from 06:00 to 21:00, from the
            same presence model that prices the inventory calendar. Tomorrow is predicted from today&rsquo;s
            schedule, so the windows move as the schedule does.
            {probeZones.length < zones.length &&
              ` Showing the first ${probeZones.length} of ${zones.length} zones in the placement.`}
          </Note>
        </Stack>
      </Pad>
    </Panel>
  );
}

/* ---- the creative assistant ------------------------------------------- */

function GenerateDialog({
  category, initialBrief, onClose, onUse
}: {
  category: string;
  initialBrief: string;
  onClose: () => void;
  onUse: (creative: Creative) => void;
}): JSX.Element {
  const [brief, setBrief] = useState(initialBrief);
  const { generate } = useCreativeMutations();
  const result = generate.data ?? null;

  return (
    <Modal
      title="Creative assistant"
      onClose={onClose}
      wide
      actions={
        result ? (
          <>
            <button className="btn primary" type="button" onClick={() => onUse(result)}>
              Use this creative
            </button>
            <button
              className="btn ghost"
              type="button"
              onClick={() => generate.mutate({ brief, category })}
            >
              Try another template
            </button>
          </>
        ) : undefined
      }
    >
      <Stack>
        <Note>
          A pluggable provider behind /api/creatives/generate. The playground ships a template engine;
          pointing it at a live model is a config change, and the interface is identical.
        </Note>
        <Field label="Brief">
          <textarea
            className="input"
            rows={2}
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
          />
        </Field>
        <Row>
          <button
            className="btn primary"
            type="button"
            disabled={generate.isPending}
            onClick={() => generate.mutate({ brief, category })}
          >
            ✨ Generate ad page
          </button>
          <span className="note">Produces a ready page in the template, in English and العربية</span>
        </Row>

        {generate.isError && <Note>The generator did not respond. Is @aura/api running?</Note>}

        {result && (
          <Grid cols="2">
            <div>
              <Cap>English</Cap>
              <div className="adprev">
                <AdPage creative={result} preview localeOverride="en" />
              </div>
            </div>
            <div>
              <Cap>العربية</Cap>
              <div className="adprev" dir="rtl">
                <AdPage creative={result} preview localeOverride="ar" />
              </div>
            </div>
          </Grid>
        )}
      </Stack>
    </Modal>
  );
}
