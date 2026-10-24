/* The fifteen-minute demo script. Each step carries the buttons that put
   the product in the state the step describes, so the run of show is
   executable rather than a document. */

import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { useApp } from '../../lib/app-state';
import {
  useCampaigns, useFlights, useInvalidateAfterInjection, useNetworkMetrics,
  useOutlets, useScreens, useSim, useSimControls, useZones
} from '../../lib/queries';
import { AIRLINES } from '../../lib/reference';
import {
  Chip, Grid, Note, PageHead, Pad, Panel, Row, Stack
} from '../../components/primitives';
import type { ReactNode } from 'react';

export function DemoScript(): JSX.Element {
  const { fmt, pushToast, setSplit, setSplitRole, setScreenId } = useApp();
  const navigate = useNavigate();
  const sim = useSim();
  const { play, pause, speed, jump } = useSimControls();
  const invalidate = useInvalidateAfterInjection();

  const screens = useScreens();
  const outlets = useOutlets();
  const campaigns = useCampaigns();
  const zones = useZones();
  const flights = useFlights({ limit: 1000 });
  const metrics = useNetworkMetrics();

  const go = (path: string, label: string): ReactNode => (
    <button className="btn sm" type="button" onClick={() => navigate(path)}>{label}</button>
  );

  const jumpToScene = (): void => {
    const sceneTime = sim.data?.sceneTime;
    if (sceneTime) jump.mutate(sceneTime);
    const totem = (screens.data ?? []).find((s) => s.name === 'Gate 42 totem');
    if (totem) setScreenId(totem.id);
    navigate('/screen/screen');
  };

  const injectXy501 = async (): Promise<void> => {
    try {
      await api.injectDelay('XY501', 45);
      invalidate();
      pushToast('Delay published', 'XY501 +45 min');
    } catch {
      pushToast('Could not inject', 'Is @aura/api running?');
    }
  };

  const gateCount = new Set((flights.data ?? []).map((f) => f.gate)).size;

  return (
    <Stack>
      <PageHead
        title="Fifteen-minute demo script"
        lead="The whole argument in four moves: the data is real-shaped, the decision is explainable, the chain of cause and effect is visible across roles, and money lands on a dashboard."
      />

      <Grid cols="2">
        <Panel title="Run of show" right={<Chip tone="amber">15 min</Chip>}>
          <Pad>
            <ol className="steps">
              <Step
                title="Set the scene · 2 min"
                body="Open the operator console. Screens on a live floor plan, heat overlay from ZonePresence, KPIs ticking. Point out that the heat and every KPI come from the same signal the ad engine scores against."
                actions={
                  <>
                    {go('/admin/overview', 'Operator console')}
                    <button
                      className="btn sm ghost"
                      type="button"
                      onClick={() => {
                        speed.mutate(10);
                        play.mutate();
                        pushToast('Simulation running', '10× speed');
                      }}
                    >
                      Play at 10×
                    </button>
                  </>
                }
              />

              <Step
                title="Show the feeds · 2 min"
                body="AODB, AIDX and ACRIS, each behind an adapter. Open a raw 33-column AODB row and an IATA_AIDX_FlightLegNotifRQ message. Say the line: going live is one new adapter class and one config value."
                actions={go('/admin/feeds', 'Feed health')}
              />

              <Step
                title="The worked example · 3 min"
                body="Jump to 14:10 and open the Gate 42 totem. Flight XY501 to Dubai, 240 passengers, 45 minutes late, plus ZQ88 to Navaro with 180. Open “Why this ad?”: the perfume campaign matches the crowd, takes a delay boost and plays; toys sit behind it; the lounge is filtered because it is not placed on Pier C."
                actions={
                  <button className="btn sm primary" type="button" onClick={jumpToScene}>
                    Jump to the scene
                  </button>
                }
              />

              <Step
                title="Cause and effect · 4 min"
                body="Split-screen: passenger screen on the left, retailer on the right. Inject another 45-minute delay on XY501. Within one slot the airline view updates, the gate screens re-plan, the retailer’s delay rule fires and the zone passenger count rises."
                actions={
                  <>
                    <button
                      className="btn sm"
                      type="button"
                      onClick={() => {
                        setSplitRole('retailer');
                        setSplit(true);
                      }}
                    >
                      Split screen
                    </button>
                    <button className="btn sm" type="button" onClick={() => void injectXy501()}>
                      Inject +45 min on XY501
                    </button>
                  </>
                }
              />

              <Step
                title="Money lands · 2 min"
                body="Scan the QR on the passenger screen with a phone — it opens the claim page on this same URL. Claim it. The redemption appears on the retailer dashboard, and the campaign’s learned conversion index moves, which changes the next decision."
                actions={go('/retailer/dashboard', 'Retailer dashboard')}
              />

              <Step
                title="Close on control · 2 min"
                body="Media manager: inventory priced off predicted presence, an approval queue nothing bypasses, and a conflict view that explains why campaign A beat campaign B, with a pin that writes its reason into the log."
                actions={
                  <>
                    {go('/media/inventory', 'Inventory')}
                    {go('/admin/rules', 'Decision log')}
                  </>
                }
              />
            </ol>
          </Pad>
        </Panel>

        <Stack>
          <Panel title="What to say about the AI">
            <Pad>
              <Stack>
                <p style={{ fontSize: '13px' }}>
                  The scorer ranks campaigns against the crowd. It never gets the last word. Before anything
                  reaches a screen, five deterministic checks run:
                </p>
                <Stack gap={4}>
                  {[
                    'Every input it cites exists in a trusted feed',
                    'Every input is inside its freshness budget',
                    'Every hard rule passes on re-check',
                    'The score reproduces exactly from the logged inputs',
                    'The creative is approved and renderable'
                  ].map((x) => (
                    <Row tight key={x}>
                      <Chip tone="ok">✓</Chip>
                      <span style={{ fontSize: '12.5px' }}>{x}</span>
                    </Row>
                  ))}
                </Stack>
                <Note>
                  If any check fails the proposal is rejected and the screen falls back to a rule-based
                  default. Nothing the model asserts is used unless it traces back to a recorded data point,
                  so a hallucinated fact cannot reach a screen. Every decision is logged with its evidence
                  trail.
                </Note>
              </Stack>
            </Pad>
          </Panel>

          <Panel title="Numbers worth quoting">
            <Pad>
              <Stack gap={6}>
                {([
                  ['Flight legs in the simulated day', fmt.n(flights.data?.length ?? 0)],
                  ['Screens on the network', fmt.n(metrics.data?.screens.total ?? screens.data?.length ?? 0)],
                  ['Outlets and F&B tenants', fmt.n(outlets.data?.length ?? 0)],
                  ['Airlines', fmt.n(AIRLINES.length)],
                  ['Campaigns in the book', fmt.n(campaigns.data?.length ?? 0)],
                  ['Zones across two terminals', fmt.n(zones.data?.length ?? 0)],
                  ['Gates in service today', fmt.n(gateCount)],
                  ['Decision latency budget', 'under 2 s from feed event to dashboard']
                ] as Array<[string, string]>).map(([k, v]) => (
                  <div className="between" key={k}>
                    <span className="note">{k}</span>
                    <b className="mono">{v}</b>
                  </div>
                ))}
              </Stack>
            </Pad>
          </Panel>

          <Panel title="Reset">
            <Pad>
              <Row>
                <button
                  className="btn"
                  type="button"
                  onClick={() => {
                    const dayStart = sim.data?.dayStart;
                    const scene = sim.data?.sceneTime;
                    if (scene) jump.mutate(scene - 5 * 60_000);
                    else if (dayStart) jump.mutate(dayStart);
                    pause.mutate();
                    speed.mutate(10);
                    setSplit(false);
                    pushToast('Reset', 'Back to the opening state, paused');
                  }}
                >
                  Reset to the opening state
                </button>
                <button
                  className="btn ghost"
                  type="button"
                  onClick={() => {
                    speed.mutate(60);
                    play.mutate();
                  }}
                >
                  Run at 60×
                </button>
              </Row>
            </Pad>
          </Panel>
        </Stack>
      </Grid>
    </Stack>
  );
}

function Step({
  title, body, actions
}: {
  title: string;
  body: string;
  actions?: ReactNode;
}): JSX.Element {
  return (
    <li>
      <div>
        <b>{title}</b>
        <div className="note" style={{ marginTop: '2px' }}>{body}</div>
        {actions && <div className="row tight" style={{ marginTop: '5px' }}>{actions}</div>}
      </div>
    </li>
  );
}
