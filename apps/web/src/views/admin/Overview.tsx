/* Operator console. Network health, revenue, the live floor plan, the
   incident tracker and the latest decisions — all off the same signals the
   ad engine scores against. */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { useApp } from '../../lib/app-state';
import { hhmm } from '../../lib/format';
import { useLive } from '../../lib/events';
import {
  useCampaigns, useDecision, useDecisions, useIncidentMutation, useIncidents,
  useInvalidateAfterInjection, useNetworkMetrics, useScreens, useSim, useZones
} from '../../lib/queries';
import { TerminalMap } from '../../components/TerminalMap';
import {
  Chip, DataTable, ErrorNote, Grid, Kpi, Kpis, KvRow, Loading, Note, PageHead,
  Pad, Panel, Row, ScreenStatusChip, Sparkline, Stack, dayCurve, type Column
} from '../../components/primitives';
import type { Decision, Incident, Screen } from '../../lib/types';

export function AdminOverview(): JSX.Element {
  const { t, fmt, airportName, setScreenId, pushToast } = useApp();
  const { now } = useLive();
  const navigate = useNavigate();
  const [picked, setPicked] = useState<string | null>(null);

  const metrics = useNetworkMetrics();
  const zones = useZones();
  const screens = useScreens();
  const incidents = useIncidents();
  const decisions = useDecisions(undefined, 14);
  const campaigns = useCampaigns();
  const sim = useSim();

  if (metrics.isError) return <ErrorNote what="the operator console" />;

  const m = metrics.data;
  const s = m?.screens;
  const total = s?.total ?? 0;
  const onlinePct = s?.onlinePct ?? (total ? (s?.online ?? 0) / total : 0);
  const hoursIn = Math.max(1, ((sim.data?.now ?? now) - (sim.data?.dayStart ?? now)) / 3_600_000);

  const pickedScreen = (screens.data ?? []).find((x) => x.id === picked) ?? null;

  return (
    <Stack>
      <PageHead
        title="Operator console"
        lead={`Network health, revenue and the state of every screen at ${airportName}. The heat overlay and every KPI are computed from the same ZonePresence signal the ad engine uses.`}
      />

      <Kpis>
        <Kpi
          label={t('kpi.screensOnline')}
          value={fmt.pct(onlinePct, 1)}
          tone={onlinePct > 0.97 ? 'ok' : onlinePct > 0.93 ? 'warn' : 'crit'}
          sub={
            <>
              <Chip tone="ok">{s?.online ?? 0} online</Chip>
              {!!s?.degraded && <Chip tone="warn">{s.degraded} degraded</Chip>}
              {!!s?.offline && <Chip tone="crit">{s.offline} offline</Chip>}
            </>
          }
        />
        <Kpi label={t('kpi.plays')} value={fmt.n(m?.plays)} sub={<span className="muted">across {total} screens</span>} />
        <Kpi
          label={t('kpi.impressions')}
          value={fmt.n(m?.impressions)}
          sub={<Sparkline values={dayCurve(m?.impressions ?? 0, hoursIn)} />}
        />
        <Kpi
          label={t('kpi.revenue')}
          value={fmt.money(m?.revenue)}
          tone="amber"
          sub={<Sparkline values={dayCurve(m?.revenue ?? 0, hoursIn)} tone="ok" />}
        />
        <Kpi
          label={t('kpi.campaigns')}
          value={fmt.n(m?.activeCampaigns)}
          sub={<span className="muted">{campaigns.data?.length ?? 0} in the book</span>}
        />
        <Kpi
          label={t('kpi.latency')}
          value={`${s?.avgLatency ?? 0} ms`}
          tone={(s?.avgLatency ?? 0) < 150 ? 'ok' : 'warn'}
          sub={<span className="muted">target under 250 ms</span>}
        />
      </Kpis>

      <Panel
        title={`Live network · ${airportName}`}
        right={
          <div className="row tight">
            <Chip tone="ok" dot>online</Chip>
            <Chip tone="warn" dot>degraded</Chip>
            <Chip tone="crit" dot>offline</Chip>
          </div>
        }
      >
        <div>
          <div className="mapwrap">
            {zones.data && screens.data ? (
              <TerminalMap
                zones={zones.data}
                screens={screens.data}
                selected={picked}
                onPick={setPicked}
              />
            ) : (
              <Loading what="the floor plan" />
            )}
          </div>
          <div className="maplegend">
            <span>
              Heat overlay = ZonePresence, passengers estimated in each zone for the current 5-minute window
            </span>
            <div className="spacer" />
            {pickedScreen ? (
              <span className="mono">
                {pickedScreen.id} · {pickedScreen.name} · {pickedScreen.status} · {pickedScreen.latencyMs} ms
              </span>
            ) : (
              <span className="muted">Select a screen dot for detail</span>
            )}
          </div>
        </div>
      </Panel>

      {pickedScreen && (
        <ScreenDetail
          screen={pickedScreen}
          onClear={() => setPicked(null)}
          onOpenPassengerView={() => {
            setScreenId(pickedScreen.id);
            navigate('/screen/screen');
          }}
          onToggled={(status) => pushToast(`Screen ${status}`, pickedScreen.name)}
        />
      )}

      <Grid cols="23">
        <Panel
          title="Latest decisions"
          right={
            <button className="btn sm ghost" type="button" onClick={() => navigate('/admin/rules')}>
              Open decision log
            </button>
          }
        >
          <Pad tight>
            <DataTable<Decision>
              cols={decisionColumns(fmt.n)}
              rows={decisions.data ?? []}
              rowKey={(d, i) => `${d.id ?? `${d.screenId}@${d.at}`}#${i}`}
              scroll
              empty="No decisions yet — press play on the transport bar"
            />
          </Pad>
        </Panel>

        <IncidentTracker incidents={incidents.data ?? []} />
      </Grid>
    </Stack>
  );
}

function decisionColumns(n: (v: number | null | undefined) => string): Array<Column<Decision>> {
  return [
    { label: 'Time', render: (d) => <span className="mono">{hhmm(d.at)}</span> },
    { label: 'Screen', render: (d) => d.screenName ?? d.screenId },
    {
      label: 'Played',
      render: (d) =>
        d.winnerCampaign ? d.winnerCampaign.advertiser : <span className="muted">airport content</span>
    },
    { label: 'Crowd', n: true, render: (d) => n(d.crowdNow) },
    { label: 'Score', n: true, render: (d) => (d.winner ? d.winner.final.toFixed(2) : '—') },
    { label: 'Why', render: (d) => <span className="note">{d.rule}</span> }
  ];
}

/* ---- screen detail ---------------------------------------------------- */

function ScreenDetail({
  screen, onClear, onOpenPassengerView, onToggled
}: {
  screen: Screen;
  onClear: () => void;
  onOpenPassengerView: () => void;
  onToggled: (status: string) => void;
}): JSX.Element {
  const { fmt } = useApp();
  const decision = useDecision(screen.id);
  const invalidate = useInvalidateAfterInjection();

  const toggle = async (): Promise<void> => {
    const updated = await api.injectScreen(screen.id);
    invalidate();
    onToggled(updated.status);
  };

  const d = decision.data;

  return (
    <Panel
      title="Screen detail"
      right={<button className="btn sm ghost" type="button" onClick={onClear}>Clear</button>}
    >
      <Pad>
        <Stack>
          <div className="between">
            <b>{screen.name}</b>
            <ScreenStatusChip status={screen.status} />
          </div>

          <Grid cols="2">
            <KvRow k="Zone" v={`${screen.zone} · ${screen.terminal}`} />
            <KvRow k="Nearest gates" v={screen.nearGates.join(', ')} />
            <KvRow k="Format" v={`${screen.size} · ${screen.orientation} · ${screen.ratio}`} />
            <KvRow k="Vendor" v={screen.vendor} />
            <KvRow k="Plays today" v={fmt.n(screen.playsToday)} />
            <KvRow k="Impressions today" v={fmt.n(screen.impressionsToday)} />
          </Grid>

          {!d ? (
            <Note>No decision cached for this screen yet — it refreshes on the next slot.</Note>
          ) : !d.winnerCampaign ? (
            <Note>{d.reason ?? d.fallbackReason ?? 'Showing airport content'}</Note>
          ) : (
            <div
              style={{
                background: 'var(--panel-2)',
                border: '1px solid var(--line-soft)',
                borderRadius: 'var(--r-s)',
                padding: '9px 11px'
              }}
            >
              <div className="cap">Playing now</div>
              <div className="between">
                <b>{d.winnerCampaign.name}</b>
                {d.winner && <Chip tone="amber">{d.winner.final.toFixed(2)}</Chip>}
              </div>
              <div className="note">{d.winnerCampaign.advertiser} · {d.rule}</div>
            </div>
          )}

          <Row>
            <button className="btn sm" type="button" onClick={onOpenPassengerView}>
              Open passenger view
            </button>
            <button className="btn sm" type="button" onClick={() => void toggle()}>
              Toggle heartbeat
            </button>
          </Row>
        </Stack>
      </Pad>
    </Panel>
  );
}

/* ---- incidents -------------------------------------------------------- */

function IncidentTracker({ incidents }: { incidents: Incident[] }): JSX.Element {
  const { pushToast } = useApp();
  const mutate = useIncidentMutation();
  const open = incidents.filter((i) => i.status !== 'resolved');

  return (
    <Panel
      title="Incidents and bugs"
      right={
        <div className="row tight">
          <Chip tone="crit">{open.filter((i) => i.severity === 'critical').length} critical</Chip>
          <Chip tone="warn">{open.filter((i) => i.severity === 'major').length} major</Chip>
        </div>
      }
    >
      <Pad tight>
        <div className="scrolly">
          <Stack>
            {incidents.length === 0 && <Note>No incidents raised today.</Note>}
            {incidents.map((i) => (
              <div
                className="row"
                key={i.id}
                style={{
                  alignItems: 'stretch', gap: '9px', padding: '8px 0',
                  borderBottom: '1px solid var(--line-soft)'
                }}
              >
                <span className={`sev ${i.severity}`} />
                <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                  <div className="between">
                    <b style={{ fontSize: '12.5px' }}>{i.title}</b>
                    <Chip tone={i.status === 'resolved' ? 'ok' : i.status === 'investigating' ? 'warn' : 'crit'}>
                      {i.status}
                    </Chip>
                  </div>
                  <div className="note">{i.detail}</div>
                  <div className="row tight" style={{ marginTop: '4px' }}>
                    <Chip>{i.id}</Chip>
                    <Chip>{i.owner}</Chip>
                    <Chip>{hhmm(i.at)}</Chip>
                    {i.status !== 'resolved' && (
                      <button
                        className="btn sm ghost"
                        type="button"
                        onClick={() => {
                          mutate.mutate({ id: i.id, status: 'resolved' });
                          pushToast('Incident resolved', i.id);
                        }}
                      >
                        Resolve
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </Stack>
        </div>
      </Pad>
    </Panel>
  );
}
