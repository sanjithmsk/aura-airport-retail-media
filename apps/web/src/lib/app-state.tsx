/* Everything the shell owns that is not server state: the locale and its
   direction, which company the retailer and airline switchers are pointed
   at, the split-screen flag, the selected screen, and the toast queue. */

import {
  createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode
} from 'react';
import { I18N, translate, type Dir, type Locale } from './i18n';
import { makeFormatter, type Formatter } from './format';
import type { RoleId, Surface } from './types';
import { useConfig } from './queries';

export interface Toast {
  id: number;
  title: string;
  detail?: string;
}

export interface AppState {
  locale: Locale;
  dir: Dir;
  setLocale: (l: Locale) => void;
  toggleLocale: () => void;
  t: (key: string) => string;
  fmt: Formatter;

  /** Brand the retailer switcher is pointed at, by outlet name. */
  outletName: string;
  setOutletName: (name: string) => void;
  /** IATA code the airline switcher is pointed at. */
  airlineCode: string;
  setAirlineCode: (code: string) => void;

  screenId: string | null;
  setScreenId: (id: string | null) => void;

  split: boolean;
  setSplit: (on: boolean) => void;
  splitRole: RoleId;
  setSplitRole: (r: RoleId) => void;

  toasts: Toast[];
  pushToast: (title: string, detail?: string) => void;
  dismissToast: (id: number) => void;

  currencySymbol: string;
  productName: string;
  airportName: string;
  airportIata: string;
}

const AppContext = createContext<AppState | null>(null);

let toastSeq = 0;

export function AppStateProvider({ children }: { children: ReactNode }): JSX.Element {
  const config = useConfig();
  const [locale, setLocaleRaw] = useState<Locale>('en');
  const [outletName, setOutletName] = useState('Lumière Parfums');
  const [airlineCode, setAirlineCode] = useState('XY');
  const [screenId, setScreenId] = useState<string | null>(null);
  const [split, setSplit] = useState(false);
  const [splitRole, setSplitRole] = useState<RoleId>('retailer');
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dir = I18N[locale].dir;

  useEffect(() => {
    document.documentElement.setAttribute('lang', locale);
    document.documentElement.setAttribute('dir', dir);
    document.body.setAttribute('dir', dir);
  }, [locale, dir]);

  const setLocale = useCallback((l: Locale) => setLocaleRaw(l), []);
  const toggleLocale = useCallback(() => setLocaleRaw((l) => (l === 'en' ? 'ar' : 'en')), []);

  const t = useCallback((key: string) => translate(locale, key), [locale]);

  const currencySymbol = config.data?.theme.currency.symbol ?? '€';
  const productName = config.data?.theme.productName ?? 'AURA';
  const airportName = config.data?.theme.airport.name ?? 'Aurelia International Airport';
  const airportIata = config.data?.theme.airport.iata ?? 'AUR';

  const fmt = useMemo(
    () => makeFormatter(locale, currencySymbol, translate(locale, 'common.min')),
    [locale, currencySymbol]
  );

  const pushToast = useCallback((title: string, detail?: string) => {
    const id = ++toastSeq;
    setToasts((prev) => [...prev.slice(-2), { id, title, detail }]);
    window.setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 4200);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const value = useMemo<AppState>(
    () => ({
      locale, dir, setLocale, toggleLocale, t, fmt,
      outletName, setOutletName,
      airlineCode, setAirlineCode,
      screenId, setScreenId,
      split, setSplit, splitRole, setSplitRole,
      toasts, pushToast, dismissToast,
      currencySymbol, productName, airportName, airportIata
    }),
    [
      locale, dir, setLocale, toggleLocale, t, fmt, outletName, airlineCode, screenId,
      split, splitRole, toasts, pushToast, dismissToast,
      currencySymbol, productName, airportName, airportIata
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside <AppStateProvider>');
  return ctx;
}

/** Sets data-surface on <html> for the lifetime of the component. */
export function useSurface(surface: Surface): void {
  useEffect(() => {
    document.documentElement.setAttribute('data-surface', surface);
  }, [surface]);
}
