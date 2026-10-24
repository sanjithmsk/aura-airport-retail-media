/* Re-export of the canonical model, plus the few shapes the API adds that
   @aura/core does not own (incidents, goodwill, gate messages). Views import
   from here so there is a single place where the domain surface is named. */

export type {
  Approval,
  Campaign,
  CampaignScore,
  CrowdProfile,
  Creative,
  Decision,
  Direction,
  EvidenceItem,
  Flight,
  FlightEvent,
  FlightStatus,
  Gate,
  HardFilters,
  Impression,
  Outlet,
  PromoCode,
  QueueMeasurement,
  Redemption,
  ScoreTerm,
  Screen,
  ScreenStatus,
  Terminal,
  Trigger,
  Vendor,
  VerificationCheck,
  World,
  Zone,
  ZoneKind,
  ZonePresence
} from '@aura/core';

export type IncidentSeverity = 'critical' | 'major' | 'minor';
export type IncidentStatus = 'open' | 'investigating' | 'resolved';

export interface Incident {
  id: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  kind: string;
  ref: string;
  title: string;
  detail: string;
  owner: string;
  at: number;
}

export interface GoodwillRecord {
  id: string;
  flightId: string;
  airline: string;
  airlineCode: string;
  gate: string;
  delayMin: number;
  pax: number;
  at: number;
  voucher: string;
  partner: string;
  coFund: string;
  cost: number;
  status: string;
}

export interface GateMessage {
  campaignId: string;
  airlineCode: string;
  flightId: string;
  gate: string;
  message: string;
  window: string;
  status: string;
}

export interface CoMarketingDeal {
  campaignId: string;
  airlineCode: string;
  advertiser: string;
  offer: string;
  at: string;
}

/** The named roles of the product shell. */
export type RoleId = 'admin' | 'retailer' | 'media' | 'airline' | 'screen';
export type Surface = 'dark' | 'light';
