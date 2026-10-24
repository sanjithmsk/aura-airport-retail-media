/**
 * The brief's worked example, asserted exactly.
 *
 *   Gate 42 at 14:10. XY501 to DXB (240 pax, 45 min late) plus ZQ88 to QNV
 *   (180 pax). Profile: holiday 58%, family 31%, business 22%,
 *   international 57%, median dwell 52 min.
 *
 *   Duty-free perfume   71% match, x1.5 delay boost -> 0.86  plays
 *   Toy store           49% match, no boost         -> 0.52  next in rotation
 *   Business lounge     18% match                   -> 0.21  filtered
 *
 * If a change to the generator or the scoring model moves any of these, this
 * test fails and the demo stops being reproducible.
 */
import { describe, it, expect } from 'vitest';
import { buildWorld, buildCreatives, buildAdapters, decide, rngFrom, SCENE_TIME } from '../src/index.js';

const pct = (n: number) => Math.round(n * 100);

describe('Gate 42 at 14:10', () => {
  const world = buildWorld();
  world.creatives = buildCreatives(rngFrom(7), world.campaigns);
  const adapters = buildAdapters(world);
  adapters.zone.publish('T2-PC', 412, 180, SCENE_TIME - 40_000);

  const screen = world.screens.find(s => s.name === 'Gate 42 totem')!;
  const d = decide(world, adapters, { playsByScreen: {}, gateChanges: {}, festival: false }, screen, SCENE_TIME);

  it('puts exactly the two scripted flights in the catchment', () => {
    expect(d.parts!.map(p => p.id).sort()).toEqual(['XY501', 'ZQ88']);
    expect(d.parts!.find(p => p.id === 'XY501')).toMatchObject({ dest: 'DXB', pax: 240, delay: 45 });
    expect(d.parts!.find(p => p.id === 'ZQ88')).toMatchObject({ pax: 180, delay: 0 });
  });

  it('builds the crowd profile from the brief', () => {
    expect(pct(d.profile!.purpose.holiday)).toBe(58);
    expect(pct(d.profile!.party.family)).toBe(31);
    expect(pct(d.profile!.purpose.business)).toBe(22);
    expect(pct(d.profile!.international)).toBe(57);
    expect(d.dwellMedian).toBe(52);
    expect(d.maxDelay).toBe(45);
  });

  it('scores the three candidates as the brief does', () => {
    const perfume = d.candidates.find(c => c.campaignId === 'CMP-201')!;
    const toys = d.candidates.find(c => c.campaignId === 'CMP-202')!;
    const lounge = d.filtered.find(c => c.campaignId === 'CMP-203')!;

    expect(pct(perfume.match)).toBe(71);
    expect(perfume.boost).toBe(1.5);
    expect(perfume.final).toBe(0.86);

    expect(pct(toys.match)).toBe(49);
    expect(toys.final).toBe(0.52);

    expect(pct(lounge.match!)).toBe(18);
    expect(lounge.final).toBe(0.21);
    expect(lounge.reasons[0]).toMatch(/Not placed in T2-PC/);
  });

  it('plays the perfume campaign on the delay rule, and verifies it', () => {
    expect(d.winner!.campaignId).toBe('CMP-201');
    expect(d.rule).toMatch(/delayed > 30 min/);
    expect(d.fallback).toBe(false);
    expect(d.verification.ok).toBe(true);
    expect(d.verification.checks.every(c => c.pass)).toBe(true);
  });

  it('cites only evidence that exists in a feed, with its age', () => {
    expect(d.evidence.length).toBeGreaterThanOrEqual(3);
    for (const e of d.evidence) {
      expect(e.source).toBeTruthy();
      expect(SCENE_TIME - e.at).toBeLessThan(15 * 60_000);
    }
  });
});

describe('generated day', () => {
  const world = buildWorld();
  it('is the size the brief asks for', () => {
    expect(world.flights.length).toBeGreaterThan(850);
    expect(world.screens.length).toBeGreaterThan(170);
    expect(world.outlets.length).toBe(40);
    expect(world.campaigns.length).toBe(25);
    expect(new Set(world.history.map(h => h.date)).size).toBe(30);
  });
  it('is deterministic', () => {
    const again = buildWorld();
    expect(again.flights.map(f => f.id).join()).toBe(world.flights.map(f => f.id).join());
  });
});
