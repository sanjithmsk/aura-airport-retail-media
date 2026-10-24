/* Query keys and the hooks over them. Keys are built in one place so the
   SSE provider can invalidate the same key a view subscribed with. */

import {
  useMutation, useQueries, useQuery, useQueryClient,
  type UseMutationResult, type UseQueryResult
} from '@tanstack/react-query';
import {
  api, type AppConfig, type CampaignMetrics, type FeedsHealth, type FlightQuery, type HistoryRow,
  type Inventory, type NetworkMetrics, type OutletMetrics, type PromoDetail, type SimState
} from './api';
import type {
  Campaign, Creative, Decision, Flight, FlightEvent, Incident, Outlet,
  PromoCode, Screen, Vendor, Zone, ZonePresence
} from './types';

export const qk = {
  config: () => ['config'] as const,
  sim: () => ['sim'] as const,
  flights: (q?: FlightQuery) => (q ? (['flights', q] as const) : (['flights'] as const)),
  zones: () => ['zones'] as const,
  presence: (id: string, at?: number) => ['presence', id, at ?? null] as const,
  screens: (zone?: string) => (zone ? (['screens', zone] as const) : (['screens'] as const)),
  decision: (id: string) => ['decision', id] as const,
  outlets: () => ['outlets'] as const,
  vendors: () => ['vendors'] as const,
  campaigns: () => ['campaigns'] as const,
  history: (advertiser?: string) =>
    (advertiser ? (['history', advertiser] as const) : (['history'] as const)),
  creatives: () => ['creatives'] as const,
  promos: () => ['promos'] as const,
  promo: (code: string) => ['promo', code] as const,
  networkMetrics: () => ['metrics', 'network'] as const,
  outletMetricsRoot: () => ['metrics', 'outlet'] as const,
  outletMetrics: (id: string) => ['metrics', 'outlet', id] as const,
  campaignMetrics: (id: string) => ['metrics', 'campaign', id] as const,
  incidents: () => ['incidents'] as const,
  decisions: (q?: string) => (q ? (['decisions', q] as const) : (['decisions'] as const)),
  inventory: (zone: string) => ['inventory', zone] as const,
  feeds: () => ['feeds'] as const,
  aidxRecent: (limit?: number) => ['feeds', 'aidx', limit ?? 10] as const,
  acrisEntities: () => ['feeds', 'acris'] as const,
  aodbCsv: () => ['feeds', 'aodb-csv'] as const
};

/* ---- reads ------------------------------------------------------------ */

export function useConfig(): UseQueryResult<AppConfig> {
  return useQuery({ queryKey: qk.config(), queryFn: api.config, staleTime: Infinity });
}

/* The SSE `hello` and `transport` frames write this cache directly, so the
   poll is only a fallback for a dropped stream. */
export function useSim(): UseQueryResult<SimState> {
  return useQuery({ queryKey: qk.sim(), queryFn: api.sim, refetchInterval: 15_000 });
}

export function useFlights(q: FlightQuery = {}): UseQueryResult<Flight[]> {
  return useQuery({ queryKey: qk.flights(q), queryFn: () => api.flights(q) });
}

export function useZones(): UseQueryResult<Zone[]> {
  return useQuery({ queryKey: qk.zones(), queryFn: api.zones, staleTime: 5 * 60_000 });
}

export function useZonePresence(id: string | null, at?: number): UseQueryResult<ZonePresence> {
  return useQuery({
    queryKey: qk.presence(id ?? '', at),
    queryFn: () => api.zonePresence(id as string, at),
    enabled: !!id
  });
}

export function useScreens(zone?: string): UseQueryResult<Screen[]> {
  return useQuery({ queryKey: qk.screens(zone), queryFn: () => api.screens(zone) });
}

export function useDecision(screenId: string | null): UseQueryResult<Decision> {
  return useQuery({
    queryKey: qk.decision(screenId ?? ''),
    queryFn: () => api.decision(screenId as string),
    enabled: !!screenId
  });
}

export function useOutlets(): UseQueryResult<Outlet[]> {
  return useQuery({ queryKey: qk.outlets(), queryFn: api.outlets, staleTime: 5 * 60_000 });
}

export function useVendors(): UseQueryResult<Vendor[]> {
  return useQuery({ queryKey: qk.vendors(), queryFn: api.vendors, staleTime: 5 * 60_000 });
}

/** Delivery by day. `enabled` keeps the advertiser report from fetching
    until its dialog is open. */
export function useHistory(advertiser?: string, enabled = true): UseQueryResult<HistoryRow[]> {
  return useQuery({
    queryKey: qk.history(advertiser),
    queryFn: () => api.history(advertiser),
    enabled,
    staleTime: 60_000
  });
}

export function useCampaigns(): UseQueryResult<Campaign[]> {
  return useQuery({ queryKey: qk.campaigns(), queryFn: api.campaigns });
}

export function useCreatives(): UseQueryResult<Creative[]> {
  return useQuery({ queryKey: qk.creatives(), queryFn: api.creatives });
}

export function usePromos(): UseQueryResult<PromoCode[]> {
  return useQuery({ queryKey: qk.promos(), queryFn: api.promos });
}

export function usePromo(code: string | undefined): UseQueryResult<PromoDetail> {
  return useQuery({
    queryKey: qk.promo(code ?? ''),
    queryFn: () => api.promo(code as string),
    enabled: !!code,
    retry: false
  });
}

export function useNetworkMetrics(): UseQueryResult<NetworkMetrics> {
  return useQuery({ queryKey: qk.networkMetrics(), queryFn: api.networkMetrics });
}

export function useOutletMetrics(id: string | null): UseQueryResult<OutletMetrics> {
  return useQuery({
    queryKey: qk.outletMetrics(id ?? ''),
    queryFn: () => api.outletMetrics(id as string),
    enabled: !!id
  });
}

/** Today's measured delivery for a set of campaigns, in one batch. Used
    where a table needs impressions and redemptions per advertiser. */
export function useCampaignMetrics(ids: string[]): Record<string, CampaignMetrics['live']> {
  const results = useQueries({
    queries: ids.map((id) => ({
      queryKey: qk.campaignMetrics(id),
      queryFn: () => api.campaignMetrics(id),
      staleTime: 30_000
    }))
  });
  const out: Record<string, CampaignMetrics['live']> = {};
  ids.forEach((id, i) => {
    const data = results[i]?.data as CampaignMetrics | undefined;
    if (data) out[id] = data.live;
  });
  return out;
}

export function useIncidents(): UseQueryResult<Incident[]> {
  return useQuery({ queryKey: qk.incidents(), queryFn: api.incidents });
}

export function useDecisions(q?: string, limit = 50): UseQueryResult<Decision[]> {
  return useQuery({ queryKey: qk.decisions(q), queryFn: () => api.decisions(q, limit) });
}

export function useInventory(zone: string): UseQueryResult<Inventory> {
  return useQuery({ queryKey: qk.inventory(zone), queryFn: () => api.inventory(zone) });
}

export function useFeeds(): UseQueryResult<FeedsHealth> {
  return useQuery({ queryKey: qk.feeds(), queryFn: api.feeds, refetchInterval: 10_000 });
}

export function useAidxRecent(limit = 10): UseQueryResult<FlightEvent[]> {
  return useQuery({ queryKey: qk.aidxRecent(limit), queryFn: () => api.aidxRecent(limit) });
}

export function useAcrisEntities(): UseQueryResult<unknown[]> {
  return useQuery({ queryKey: qk.acrisEntities(), queryFn: api.acrisEntities });
}

export function useAodbCsv(enabled: boolean): UseQueryResult<string> {
  return useQuery({ queryKey: qk.aodbCsv(), queryFn: api.aodbCsv, enabled });
}

/* ---- writes ----------------------------------------------------------- */

export function useSimControls(): {
  play: UseMutationResult<SimState, Error, void>;
  pause: UseMutationResult<SimState, Error, void>;
  speed: UseMutationResult<SimState, Error, 1 | 10 | 60>;
  jump: UseMutationResult<SimState, Error, number>;
} {
  const qc = useQueryClient();
  const settle = (s: SimState): void => {
    qc.setQueryData(qk.sim(), s);
    void qc.invalidateQueries({ queryKey: qk.decisions() });
    void qc.invalidateQueries({ queryKey: qk.networkMetrics() });
  };
  return {
    play: useMutation({ mutationFn: api.simPlay, onSuccess: settle }),
    pause: useMutation({ mutationFn: api.simPause, onSuccess: settle }),
    speed: useMutation({ mutationFn: (s: 1 | 10 | 60) => api.simSpeed(s), onSuccess: settle }),
    jump: useMutation({
      mutationFn: (ts: number) => api.simJump(ts),
      onSuccess: (s) => {
        settle(s);
        void qc.invalidateQueries({ queryKey: qk.flights() });
        void qc.invalidateQueries({ queryKey: qk.screens() });
        void qc.invalidateQueries({ queryKey: ['decision'] });
        void qc.invalidateQueries({ queryKey: ['presence'] });
      }
    })
  };
}

export function useInvalidateAfterInjection(): () => void {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: qk.flights() });
    void qc.invalidateQueries({ queryKey: qk.screens() });
    void qc.invalidateQueries({ queryKey: qk.incidents() });
    void qc.invalidateQueries({ queryKey: qk.feeds() });
    void qc.invalidateQueries({ queryKey: qk.aidxRecent() });
    void qc.invalidateQueries({ queryKey: qk.decisions() });
    void qc.invalidateQueries({ queryKey: ['decision'] });
  };
}

export function useCampaignMutations(): {
  create: UseMutationResult<Campaign, Error, Campaign>;
  update: UseMutationResult<Campaign, Error, { id: string; patch: Partial<Campaign> }>;
} {
  const qc = useQueryClient();
  const after = (): void => {
    void qc.invalidateQueries({ queryKey: qk.campaigns() });
    void qc.invalidateQueries({ queryKey: ['decision'] });
    void qc.invalidateQueries({ queryKey: qk.decisions() });
  };
  return {
    create: useMutation({ mutationFn: (c: Campaign) => api.createCampaign(c), onSuccess: after }),
    update: useMutation({
      mutationFn: ({ id, patch }: { id: string; patch: Partial<Campaign> }) => api.updateCampaign(id, patch),
      onSuccess: after
    })
  };
}

export function useCreativeMutations(): {
  generate: UseMutationResult<Creative, Error, { brief: string; category: string }>;
  approve: UseMutationResult<Creative, Error, string>;
  reject: UseMutationResult<Creative, Error, string>;
  duplicate: UseMutationResult<Creative, Error, string>;
} {
  const qc = useQueryClient();
  const after = (): void => {
    void qc.invalidateQueries({ queryKey: qk.creatives() });
    void qc.invalidateQueries({ queryKey: qk.campaigns() });
    void qc.invalidateQueries({ queryKey: ['decision'] });
  };
  return {
    generate: useMutation({
      mutationFn: ({ brief, category }: { brief: string; category: string }) =>
        api.generateCreative(brief, category),
      onSuccess: after
    }),
    approve: useMutation({ mutationFn: (id: string) => api.approveCreative(id), onSuccess: after }),
    reject: useMutation({ mutationFn: (id: string) => api.rejectCreative(id), onSuccess: after }),
    duplicate: useMutation({ mutationFn: (id: string) => api.duplicateCreative(id), onSuccess: after })
  };
}

/* Master data. A screen edit changes a catchment, so the decision caches
   go with it; an outlet edit only moves the tenant record. */
export function useScreenMutations(): {
  create: UseMutationResult<Screen, Error, Partial<Screen>>;
  update: UseMutationResult<Screen, Error, { id: string; patch: Partial<Screen> }>;
} {
  const qc = useQueryClient();
  const after = (): void => {
    void qc.invalidateQueries({ queryKey: qk.screens() });
    void qc.invalidateQueries({ queryKey: qk.vendors() });
    void qc.invalidateQueries({ queryKey: ['decision'] });
    void qc.invalidateQueries({ queryKey: qk.decisions() });
  };
  return {
    create: useMutation({ mutationFn: (body: Partial<Screen>) => api.createScreen(body), onSuccess: after }),
    update: useMutation({
      mutationFn: ({ id, patch }: { id: string; patch: Partial<Screen> }) => api.updateScreen(id, patch),
      onSuccess: after
    })
  };
}

export function useOutletMutations(): {
  create: UseMutationResult<Outlet, Error, Partial<Outlet>>;
  update: UseMutationResult<Outlet, Error, { id: string; patch: Partial<Outlet> }>;
} {
  const qc = useQueryClient();
  const after = (): void => {
    void qc.invalidateQueries({ queryKey: qk.outlets() });
  };
  return {
    create: useMutation({ mutationFn: (body: Partial<Outlet>) => api.createOutlet(body), onSuccess: after }),
    update: useMutation({
      mutationFn: ({ id, patch }: { id: string; patch: Partial<Outlet> }) => api.updateOutlet(id, patch),
      onSuccess: after
    })
  };
}

export function useIncidentMutation(): UseMutationResult<
  Incident,
  Error,
  { id: string; status: Incident['status'] }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: Incident['status'] }) => api.updateIncident(id, status),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.incidents() });
    }
  });
}

export function useClaimPromo(): UseMutationResult<
  import('./types').Redemption,
  Error,
  { code: string; via: string }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ code, via }: { code: string; via: string }) => api.claimPromo(code, via),
    onSuccess: (_r, vars) => {
      void qc.invalidateQueries({ queryKey: qk.promo(vars.code) });
      void qc.invalidateQueries({ queryKey: qk.promos() });
      void qc.invalidateQueries({ queryKey: qk.networkMetrics() });
      void qc.invalidateQueries({ queryKey: qk.outletMetricsRoot() });
    }
  });
}
