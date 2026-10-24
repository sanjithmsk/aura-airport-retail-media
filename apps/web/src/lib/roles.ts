/* The shell's navigation model: five roles, each with its surface and its
   left-rail sub-pages. Routing is /:role/:page, so these ids are the URL. */

import type { RoleId, Surface } from './types';

export interface RolePage {
  id: string;
  key: string;
}

export interface RoleDef {
  id: RoleId;
  key: string;
  surface: Surface;
  pages: RolePage[];
}

export const ROLES: RoleDef[] = [
  {
    id: 'admin', key: 'role.admin', surface: 'dark',
    pages: [
      { id: 'overview', key: 'nav.overview' },
      { id: 'masterdata', key: 'nav.masterdata' },
      { id: 'feeds', key: 'nav.feeds' },
      { id: 'rules', key: 'nav.rules' }
    ]
  },
  {
    id: 'retailer', key: 'role.retailer', surface: 'light',
    pages: [
      { id: 'dashboard', key: 'nav.dashboard' },
      { id: 'flow', key: 'nav.flow' },
      { id: 'builder', key: 'nav.builder' },
      { id: 'campaigns', key: 'nav.campaigns' }
    ]
  },
  {
    id: 'media', key: 'role.media', surface: 'light',
    pages: [
      { id: 'inventory', key: 'nav.inventory' },
      { id: 'yield', key: 'nav.yield' },
      { id: 'approvals', key: 'nav.approvals' },
      { id: 'advertisers', key: 'nav.advertisers' }
    ]
  },
  {
    id: 'airline', key: 'role.airline', surface: 'light',
    pages: [
      { id: 'flights', key: 'nav.flights' },
      { id: 'gatemsg', key: 'nav.gatemsg' },
      { id: 'goodwill', key: 'nav.goodwill' },
      { id: 'comarketing', key: 'nav.comarketing' }
    ]
  },
  {
    id: 'screen', key: 'role.screen', surface: 'dark',
    pages: [
      { id: 'screen', key: 'nav.screen' },
      { id: 'demo', key: 'nav.demo' }
    ]
  }
];

export function roleDef(id: string): RoleDef {
  return ROLES.find((r) => r.id === id) ?? ROLES[0];
}

export function isRoleId(id: string | undefined): id is RoleId {
  return !!id && ROLES.some((r) => r.id === id);
}

export function defaultPage(role: RoleId): string {
  return roleDef(role).pages[0].id;
}
