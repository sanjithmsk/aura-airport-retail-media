/* role:page → view. The shell and the split pane both render through
   this, so adding a page is one entry plus one line in roles.ts. */

import type { ReactNode } from 'react';
import type { RoleId } from '../lib/types';

import { AdminOverview } from './admin/Overview';
import { AdminMasterData } from './admin/MasterData';
import { AdminFeeds } from './admin/Feeds';
import { AdminRules } from './admin/Rules';

import { RetailerDashboard } from './retailer/Dashboard';
import { RetailerFlow } from './retailer/Flow';
import { RetailerBuilder } from './retailer/Builder';
import { RetailerCampaigns } from './retailer/Campaigns';

import { MediaInventory } from './media/Inventory';
import { MediaYield } from './media/Yield';
import { MediaApprovals } from './media/Approvals';
import { MediaAdvertisers } from './media/Advertisers';

import { AirlineFlights } from './airline/Flights';
import { AirlineGateMessaging } from './airline/GateMessaging';
import { AirlineGoodwill } from './airline/Goodwill';
import { AirlineCoMarketing } from './airline/CoMarketing';

import { PassengerScreen } from './screen/PassengerScreen';
import { DemoScript } from './screen/DemoScript';

const VIEWS: Record<string, () => JSX.Element> = {
  'admin:overview': AdminOverview,
  'admin:masterdata': AdminMasterData,
  'admin:feeds': AdminFeeds,
  'admin:rules': AdminRules,

  'retailer:dashboard': RetailerDashboard,
  'retailer:flow': RetailerFlow,
  'retailer:builder': RetailerBuilder,
  'retailer:campaigns': RetailerCampaigns,

  'media:inventory': MediaInventory,
  'media:yield': MediaYield,
  'media:approvals': MediaApprovals,
  'media:advertisers': MediaAdvertisers,

  'airline:flights': AirlineFlights,
  'airline:gatemsg': AirlineGateMessaging,
  'airline:goodwill': AirlineGoodwill,
  'airline:comarketing': AirlineCoMarketing,

  'screen:demo': DemoScript
};

export function renderView(role: RoleId, page: string, compact = false): ReactNode {
  if (role === 'screen' && page === 'screen') {
    return <PassengerScreen compact={compact} />;
  }
  const View = VIEWS[`${role}:${page}`];
  if (!View) return <div className="note">View not found</div>;
  return <View />;
}
