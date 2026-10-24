/* One EventSource for the whole app. `tick` moves the clock without going
   near the query cache; everything else invalidates exactly the queries that
   depend on it, so a redemption does not re-fetch the flight board. */

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { API_BASE } from './api';
import { qk } from './queries';

export interface TickEvent { now: number; playing?: boolean; speed?: number }
/** The engine re-decides a batch of screens per slot, not one at a time. */
export interface DecisionEvent { at: number; screens: string[] }
export interface PlayEvent { screenId: string; campaignId: string; advertiser?: string; at?: number }
export interface RedemptionEvent { campaignId?: string; screenId?: string | null; code?: string; via?: string }
export interface IncidentEvent { id?: string; title?: string; severity?: string }
export interface InjectionEvent { title: string; detail?: string; at?: number }
export interface TransportEvent {
  now: number; playing: boolean; speed: 1 | 10 | 60;
  dayStart: number; dayEnd: number; sceneTime: number;
}

export type LiveEventName =
  | 'hello' | 'tick' | 'transport' | 'decision' | 'play'
  | 'scan' | 'redemption' | 'incident' | 'injection' | 'goodwill';

export interface LiveState {
  /** Simulation clock in epoch ms, pushed by the `tick` event. */
  now: number;
  connected: boolean;
  /** Last injection notice, for the toast. */
  notice: InjectionEvent | null;
  clearNotice: () => void;
  /** Screens whose decision changed, so a mounted screen view can re-fetch. */
  lastDecisionScreen: string | null;
}

const LiveContext = createContext<LiveState | null>(null);

function parse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function LiveProvider({ children }: { children: ReactNode }): JSX.Element {
  const qc = useQueryClient();
  const [now, setNow] = useState<number>(() => Date.now());
  const [connected, setConnected] = useState(false);
  const [notice, setNotice] = useState<InjectionEvent | null>(null);
  const [lastDecisionScreen, setLastDecisionScreen] = useState<string | null>(null);
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const es = new EventSource(`${API_BASE}/events`);
    sourceRef.current = es;

    const onOpen = (): void => setConnected(true);
    const onError = (): void => setConnected(false);

    const onTick = (e: MessageEvent<string>): void => {
      const data = parse<TickEvent>(e.data);
      if (data && typeof data.now === 'number') setNow(data.now);
      setConnected(true);
    };

    /* `hello` is the opening frame and `transport` follows play / pause /
       speed / jump — both carry a full SimState, so they seed the cache
       the transport bar reads instead of waiting for its poll. */
    const onTransport = (e: MessageEvent<string>): void => {
      const data = parse<TransportEvent>(e.data);
      if (!data || typeof data.now !== 'number') return;
      setNow(data.now);
      setConnected(true);
      qc.setQueryData(qk.sim(), data);
    };

    const onDecision = (e: MessageEvent<string>): void => {
      const data = parse<DecisionEvent>(e.data);
      const screens = data?.screens ?? [];
      if (screens.length) {
        setLastDecisionScreen(screens[screens.length - 1]);
        screens.forEach((id) => void qc.invalidateQueries({ queryKey: qk.decision(id) }));
      }
      void qc.invalidateQueries({ queryKey: qk.decisions() });
    };

    const onPlay = (e: MessageEvent<string>): void => {
      const data = parse<PlayEvent>(e.data);
      if (data?.screenId) void qc.invalidateQueries({ queryKey: qk.decision(data.screenId) });
      void qc.invalidateQueries({ queryKey: qk.networkMetrics() });
      void qc.invalidateQueries({ queryKey: qk.screens() });
    };

    const onRedemption = (): void => {
      void qc.invalidateQueries({ queryKey: qk.networkMetrics() });
      void qc.invalidateQueries({ queryKey: qk.outletMetricsRoot() });
      void qc.invalidateQueries({ queryKey: qk.promos() });
      void qc.invalidateQueries({ queryKey: qk.campaigns() });
    };

    /* A scan is measured before any redemption follows it, and it is what
       moves a campaign's learned conversion index. */
    const onScan = (): void => {
      void qc.invalidateQueries({ queryKey: qk.networkMetrics() });
      void qc.invalidateQueries({ queryKey: qk.outletMetricsRoot() });
    };

    const onGoodwill = (): void => {
      void qc.invalidateQueries({ queryKey: qk.flights() });
      void qc.invalidateQueries({ queryKey: qk.campaigns() });
    };

    const onIncident = (): void => {
      void qc.invalidateQueries({ queryKey: qk.incidents() });
      void qc.invalidateQueries({ queryKey: qk.screens() });
      void qc.invalidateQueries({ queryKey: qk.networkMetrics() });
    };

    const onInjection = (e: MessageEvent<string>): void => {
      const data = parse<InjectionEvent>(e.data);
      if (data?.title) setNotice(data);
      void qc.invalidateQueries({ queryKey: qk.flights() });
      void qc.invalidateQueries({ queryKey: qk.screens() });
      void qc.invalidateQueries({ queryKey: qk.feeds() });
      void qc.invalidateQueries({ queryKey: qk.aidxRecent() });
      void qc.invalidateQueries({ queryKey: qk.decisions() });
      void qc.invalidateQueries({ queryKey: qk.incidents() });
    };

    const listeners: Array<[string, EventListener]> = [
      ['open', onOpen],
      ['error', onError],
      ['hello', onTransport as EventListener],
      ['transport', onTransport as EventListener],
      ['tick', onTick as EventListener],
      ['decision', onDecision as EventListener],
      ['play', onPlay as EventListener],
      ['scan', onScan],
      ['redemption', onRedemption],
      ['goodwill', onGoodwill],
      ['incident', onIncident],
      ['injection', onInjection as EventListener]
    ];
    listeners.forEach(([name, fn]) => es.addEventListener(name, fn));

    return () => {
      listeners.forEach(([name, fn]) => es.removeEventListener(name, fn));
      es.close();
      sourceRef.current = null;
    };
  }, [qc]);

  const value = useMemo<LiveState>(
    () => ({ now, connected, notice, clearNotice: () => setNotice(null), lastDecisionScreen }),
    [now, connected, notice, lastDecisionScreen]
  );

  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}

export function useLive(): LiveState {
  const ctx = useContext(LiveContext);
  if (!ctx) throw new Error('useLive must be used inside <LiveProvider>');
  return ctx;
}
