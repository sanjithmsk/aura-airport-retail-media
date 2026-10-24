/* One typed wrapper over the @aura/api surface. Every response shape here
   either comes straight from @aura/core or is the small envelope the API
   adds on top of it; nothing in the views talks to fetch directly. */

import type {
  Campaign, Creative, Decision, Flight, FlightEvent, Incident, Outlet,
  PromoCode, Redemption, Screen, Vendor, Zone, ZonePresence
} from './types';

export const API_BASE: string = import.meta.env.VITE_API_URL ?? '/api';

export interface AppConfig {
  theme: {
    productName: string;
    productTagline: string;
    operator: string;
    airport: { iata: string; icao: string; name: string; city: string };
    currency: { code: string; symbol: string; rate: number };
    locales: string[];
    defaultLocale: string;
    mark: string;
  };
  engine: Record<string, unknown> & {
    version: string;
    slotSeconds: number;
    windowMinutes: number;
    triggerBoostWeight: number;
    conversionLiftCap: number;
    conversionLiftScale: number;
    explorationPct: number;
    frequencyCapPerHour: number;
    competitorSeparation: number;
    freshness: Record<string, number>;
  };
  adapters: { FLIGHT_SOURCE: string; ZONE_SOURCE: string; AODB_SOURCE: string };
  locales: string[];
}

export interface SimState {
  now: number;
  playing: boolean;
  speed: 1 | 10 | 60;
  dayStart: number;
  dayEnd: number;
  sceneTime: number;
}

export interface NetworkMetrics {
  screens: {
    total: number;
    online: number;
    degraded: number;
    offline: number;
    onlinePct: number;
    avgLatency: number;
  };
  plays: number;
  impressions: number;
  revenue: number;
  scans: number;
  redemptions: number;
  activeCampaigns: number;
  perf?: { apiP95: number; playlistMs: number; uptime7d: number };
}

export interface OutletMetrics {
  impressions: number;
  scans: number;
  redemptions: number;
  revenue: number;
}

/** Today's measured delivery for one campaign. */
export interface CampaignMetrics {
  live: {
    plays: number;
    impressions: number;
    scans: number;
    redemptions: number;
    revenue: number;
    segments: Record<string, number>;
  };
}

export interface InventorySlot {
  hour: number;
  state: 'booked' | 'available' | 'blocked';
  premium: boolean;
  price: number;
  pax: number;
}
export interface InventoryRow { screen: Screen; slots: InventorySlot[] }
export interface Inventory { hours: number[]; rows: InventoryRow[] }

export interface FeedHealth {
  standard: string;
  adapter: string;
  messages: number;
  lastAt: number | null;
  rate: number;
  /** Seconds an input may age before the engine calls it stale. */
  freshnessBudgetSec: number;
  /** Canonical entities this feed produces. */
  entities?: string[];
}
export interface FeedsHealth {
  aodb: FeedHealth;
  aidx: FeedHealth;
  acris: FeedHealth;
}

export interface PromoDetail {
  promo: PromoCode;
  campaign: Campaign | null;
  creative: Creative | null;
}

export interface FlightQuery {
  direction?: 'D' | 'A';
  airline?: string;
  gate?: string;
  limit?: number;
}

/** One day of delivery for one campaign, as /api/history returns it. */
export interface HistoryRow {
  date: string;
  campaignId: string;
  advertiser: string;
  impressions: number;
  scans: number;
  redemptions: number;
  spend: number;
  revenue: number;
  plays: number;
}

class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

function qs(params: Record<string, string | number | boolean | undefined>): string {
  const out = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === '') continue;
    out.set(k, String(v));
  }
  const s = out.toString();
  return s ? `?${s}` : '';
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: init?.body ? { 'content-type': 'application/json' } : undefined,
    ...init
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new ApiError(res.status, text || `${res.status} on ${path}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

async function requestText(path: string): Promise<string> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new ApiError(res.status, `${res.status} on ${path}`);
  return res.text();
}

function post<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
}

function patch<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
}

export const api = {
  config: (): Promise<AppConfig> => request<AppConfig>('/config'),

  sim: (): Promise<SimState> => request<SimState>('/sim'),
  simPlay: (): Promise<SimState> => post<SimState>('/sim/play'),
  simPause: (): Promise<SimState> => post<SimState>('/sim/pause'),
  simSpeed: (speed: 1 | 10 | 60): Promise<SimState> => post<SimState>('/sim/speed', { speed }),
  simJump: (ts: number): Promise<SimState> => post<SimState>('/sim/jump', { ts }),

  injectDelay: (flightId: string, minutes: number): Promise<FlightEvent> =>
    post<FlightEvent>('/sim/inject/delay', { flightId, minutes }),
  injectGate: (flightId: string, gate: string): Promise<FlightEvent> =>
    post<FlightEvent>('/sim/inject/gate', { flightId, gate }),
  injectScreen: (screenId: string): Promise<Screen> =>
    post<Screen>('/sim/inject/screen', { screenId }),

  flights: (q: FlightQuery = {}): Promise<Flight[]> => request<Flight[]>(`/flights${qs({ ...q })}`),

  zones: (): Promise<Zone[]> => request<Zone[]>('/zones'),
  zonePresence: (id: string, at?: number): Promise<ZonePresence> =>
    request<ZonePresence>(`/zones/${encodeURIComponent(id)}/presence${qs({ at })}`),

  screens: (zone?: string): Promise<Screen[]> => request<Screen[]>(`/screens${qs({ zone })}`),
  decision: (screenId: string): Promise<Decision> =>
    request<Decision>(`/screens/${encodeURIComponent(screenId)}/decision`),

  /* Screens and outlets are editable master data. Changing a screen's
     nearest gates changes its catchment, and therefore its next decision. */
  createScreen: (body: Partial<Screen>): Promise<Screen> => post<Screen>('/screens', body),
  updateScreen: (id: string, body: Partial<Screen>): Promise<Screen> =>
    patch<Screen>(`/screens/${encodeURIComponent(id)}`, body),

  outlets: (): Promise<Outlet[]> => request<Outlet[]>('/outlets'),
  createOutlet: (body: Partial<Outlet>): Promise<Outlet> => post<Outlet>('/outlets', body),
  updateOutlet: (id: string, body: Partial<Outlet>): Promise<Outlet> =>
    patch<Outlet>(`/outlets/${encodeURIComponent(id)}`, body),

  vendors: (): Promise<Vendor[]> => request<Vendor[]>('/vendors'),

  campaigns: (): Promise<Campaign[]> => request<Campaign[]>('/campaigns'),
  createCampaign: (body: Campaign): Promise<Campaign> => post<Campaign>('/campaigns', body),
  updateCampaign: (id: string, body: Partial<Campaign>): Promise<Campaign> =>
    patch<Campaign>(`/campaigns/${encodeURIComponent(id)}`, body),

  creatives: (): Promise<Creative[]> => request<Creative[]>('/creatives'),
  generateCreative: (brief: string, category: string): Promise<Creative> =>
    post<Creative>('/creatives/generate', { brief, category }),
  approveCreative: (id: string): Promise<Creative> =>
    post<Creative>(`/creatives/${encodeURIComponent(id)}/approve`),
  rejectCreative: (id: string): Promise<Creative> =>
    post<Creative>(`/creatives/${encodeURIComponent(id)}/reject`),
  duplicateCreative: (id: string): Promise<Creative> =>
    post<Creative>(`/creatives/${encodeURIComponent(id)}/duplicate`),

  promos: (): Promise<PromoCode[]> => request<PromoCode[]>('/promos'),
  promo: (code: string): Promise<PromoDetail> => request<PromoDetail>(`/promos/${encodeURIComponent(code)}`),
  claimPromo: (code: string, via: string): Promise<Redemption> =>
    post<Redemption>(`/promos/${encodeURIComponent(code)}/claim`, { via }),

  networkMetrics: (): Promise<NetworkMetrics> => request<NetworkMetrics>('/metrics/network'),
  outletMetrics: (id: string): Promise<OutletMetrics> =>
    request<OutletMetrics>(`/metrics/outlet/${encodeURIComponent(id)}`),
  campaignMetrics: (id: string): Promise<CampaignMetrics> =>
    request<CampaignMetrics>(`/metrics/campaign/${encodeURIComponent(id)}`),

  incidents: (): Promise<Incident[]> => request<Incident[]>('/incidents'),
  updateIncident: (id: string, status: Incident['status']): Promise<Incident> =>
    patch<Incident>(`/incidents/${encodeURIComponent(id)}`, { status }),

  decisions: (q?: string, limit = 50): Promise<Decision[]> =>
    request<Decision[]>(`/decisions${qs({ q, limit })}`),

  history: (advertiser?: string, limit?: number): Promise<HistoryRow[]> =>
    request<HistoryRow[]>(`/history${qs({ advertiser, limit })}`),

  inventory: (zone: string): Promise<Inventory> => request<Inventory>(`/inventory${qs({ zone })}`),

  feeds: (): Promise<FeedsHealth> => request<FeedsHealth>('/feeds'),
  aodbCsv: (): Promise<string> => requestText('/feeds/aodb.csv'),
  aidxRecent: (limit = 10): Promise<FlightEvent[]> =>
    request<FlightEvent[]>(`/feeds/aidx/recent${qs({ limit })}`),
  acrisEntities: (): Promise<unknown[]> => request<unknown[]>('/feeds/acris/entities')
};

export { ApiError };
