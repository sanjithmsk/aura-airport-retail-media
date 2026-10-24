/* The retailer role is scoped to one brand, which may hold several units
   airside. Everything the four retailer pages need about that brand is
   derived here, once. */

import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { qk } from '../../lib/queries';
import { useApp } from '../../lib/app-state';
import { useLive } from '../../lib/events';
import { useCampaigns, useCreatives, useFlights, useOutlets, usePromos } from '../../lib/queries';
import type { OutletMetrics } from '../../lib/api';
import type { Campaign, Creative, Flight, Outlet, PromoCode } from '../../lib/types';

export interface OutletScope {
  outlets: Outlet[];
  outletIds: string[];
  zones: string[];
  gates: string[];
  campaigns: Campaign[];
  creatives: Creative[];
  promos: PromoCode[];
  totals: OutletMetrics;
  nearFlights: Flight[];
  loading: boolean;
}

const EMPTY_TOTALS: OutletMetrics = { impressions: 0, scans: 0, redemptions: 0, revenue: 0 };

export function useOutletScope(withinMinutes = 120): OutletScope {
  const { outletName } = useApp();
  const { now } = useLive();
  const outletsQ = useOutlets();
  const campaignsQ = useCampaigns();
  const creativesQ = useCreatives();
  const promosQ = usePromos();
  const flightsQ = useFlights({ direction: 'D', limit: 400 });

  const outlets = useMemo(
    () => (outletsQ.data ?? []).filter((o) => o.name === outletName),
    [outletsQ.data, outletName]
  );
  const outletIds = useMemo(() => outlets.map((o) => o.id), [outlets]);

  const metricQueries = useQueries({
    queries: outletIds.map((id) => ({
      queryKey: qk.outletMetrics(id),
      queryFn: () => api.outletMetrics(id)
    }))
  });

  const totals = useMemo<OutletMetrics>(() => {
    const t = { ...EMPTY_TOTALS };
    metricQueries.forEach((q) => {
      const d = q.data as OutletMetrics | undefined;
      if (!d) return;
      t.impressions += d.impressions;
      t.scans += d.scans;
      t.redemptions += d.redemptions;
      t.revenue += d.revenue;
    });
    return t;
  }, [metricQueries]);

  const zones = useMemo(() => Array.from(new Set(outlets.map((o) => o.zone))), [outlets]);
  const gates = useMemo(() => {
    const g = new Set<string>();
    outlets.forEach((o) => o.nearGates.forEach((x) => g.add(x)));
    return Array.from(g);
  }, [outlets]);

  const campaigns = useMemo(
    () => (campaignsQ.data ?? []).filter((c) => c.outletId != null && outletIds.includes(c.outletId)),
    [campaignsQ.data, outletIds]
  );
  const creatives = useMemo(
    () => (creativesQ.data ?? []).filter((c) => c.advertiser === outletName),
    [creativesQ.data, outletName]
  );
  const promos = useMemo(
    () => (promosQ.data ?? []).filter((p) => p.outletId != null && outletIds.includes(p.outletId)),
    [promosQ.data, outletIds]
  );

  const nearFlights = useMemo(() => {
    const within = withinMinutes * 60_000;
    const flights = flightsQ.data ?? [];
    if (!flights.length || !gates.length) return [];
    return flights
      .filter(
        (f) =>
          f.status !== 'departed' &&
          gates.includes(f.gate) &&
          f.boardingTs > now - 20 * 60_000 &&
          f.boardingTs < now + within
      )
      .sort((a, b) => a.boardingTs - b.boardingTs);
  }, [flightsQ.data, gates, withinMinutes, now]);

  return {
    outlets,
    outletIds,
    zones,
    gates,
    campaigns,
    creatives,
    promos,
    totals,
    nearFlights,
    loading: outletsQ.isLoading || campaignsQ.isLoading
  };
}
