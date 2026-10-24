/* Sampling ZonePresence forward in time. /api/zones/:id/presence takes an
   `at`, so a forecast is just the same endpoint asked at each window. */

import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { api } from './api';
import { qk } from './queries';
import { useLive } from './events';
import type { CrowdProfile, ZonePresence } from './types';
import type { FootfallPoint } from '../components/FootfallChart';

export function useFootfall(
  zoneIds: string[],
  minutes = 120,
  stepMinutes = 15
): { series: FootfallPoint[]; loading: boolean } {
  const { now } = useLive();
  const anchor = Math.floor(now / 60_000) * 60_000;

  const steps = useMemo(() => {
    const out: number[] = [];
    for (let m = 0; m < minutes; m += stepMinutes) out.push(anchor + m * 60_000);
    return out;
  }, [anchor, minutes, stepMinutes]);

  const pairs = useMemo(
    () => steps.flatMap((ts) => zoneIds.map((zoneId) => ({ zoneId, ts }))),
    [steps, zoneIds]
  );

  const results = useQueries({
    queries: pairs.map(({ zoneId, ts }) => ({
      queryKey: qk.presence(zoneId, ts),
      queryFn: () => api.zonePresence(zoneId, ts),
      staleTime: 60_000
    }))
  });

  const series = useMemo<FootfallPoint[]>(() => {
    const byTs = new Map<number, { pax: number; intlMass: number }>();
    pairs.forEach(({ ts }, i) => {
      const data = results[i]?.data as ZonePresence | undefined;
      if (!data) return;
      const acc = byTs.get(ts) ?? { pax: 0, intlMass: 0 };
      acc.pax += data.pax;
      acc.intlMass += data.international * data.pax;
      byTs.set(ts, acc);
    });
    return steps.map((ts) => {
      const acc = byTs.get(ts) ?? { pax: 0, intlMass: 0 };
      return { ts, pax: acc.pax, international: acc.pax ? acc.intlMass / acc.pax : 0 };
    });
  }, [pairs, results, steps]);

  return { series, loading: results.some((r) => r.isLoading) };
}

/** Present-moment presence across a set of zones, with a blended profile. */
export function useZoneAggregate(zoneIds: string[], at?: number): {
  pax: number;
  paxNext30: number;
  international: number;
  dwellMedian: number;
  flights: number;
  profile: CrowdProfile | null;
  loading: boolean;
} {
  const results = useQueries({
    queries: zoneIds.map((zoneId) => ({
      queryKey: qk.presence(zoneId, at),
      queryFn: () => api.zonePresence(zoneId, at),
      staleTime: 15_000
    }))
  });

  return useMemo(() => {
    let pax = 0;
    let paxNext30 = 0;
    let intlMass = 0;
    let dwellMass = 0;
    let flights = 0;
    const candidates: Array<{ mass: number; profile: CrowdProfile }> = [];

    results.forEach((r) => {
      const d = r.data as ZonePresence | undefined;
      if (!d) return;
      pax += d.pax;
      paxNext30 += d.paxNext30;
      intlMass += d.international * d.pax;
      dwellMass += d.dwellMedian * d.pax;
      flights += d.flights;
      if (d.profile) candidates.push({ mass: d.pax, profile: d.profile });
    });

    // the busiest zone's profile stands for the catchment
    const chosen = candidates.reduce<{ mass: number; profile: CrowdProfile } | null>(
      (acc, c) => (!acc || c.mass > acc.mass ? c : acc), null);
    return {
      pax,
      paxNext30,
      international: pax ? intlMass / pax : 0,
      dwellMedian: pax ? Math.round(dwellMass / pax) : 0,
      flights,
      profile: chosen ? chosen.profile : null,
      loading: results.some((r) => r.isLoading)
    };
  }, [results]);
}
