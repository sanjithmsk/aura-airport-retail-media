/* What a traveller actually sees: the bezel, the FIDS strip above the ad,
   the ad with its QR and countdown, and the "Why this ad?" panel that
   opens the whole decision up. */

import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { useApp } from '../../lib/app-state';
import { useLive } from '../../lib/events';
import { hhmm } from '../../lib/format';
import { cityOf } from '../../lib/reference';
import {
  useCampaigns, useCreatives, useDecision, useFlights, useInvalidateAfterInjection,
  usePromos, useScreens, useZones
} from '../../lib/queries';
import { useClaimPromo } from '../../lib/queries';
import { AdPage } from '../../components/AdPage';
import { WhyBody } from '../../components/WhyPanel';
import {
  Chip, ErrorNote, Field, Loading, PageHead, Pad, Panel, Row, Stack
} from '../../components/primitives';
import type { Flight, Screen } from '../../lib/types';

export function PassengerScreen({ compact }: { compact?: boolean }): JSX.Element {
  const { t, fmt, screenId, setScreenId, setSplit, split, pushToast, airportName } = useApp();
  const { now } = useLive();
  const screensQ = useScreens();
  const zones = useZones();
  const flightsQ = useFlights({ direction: 'D', limit: 400 });
  const creatives = useCreatives();
  const campaigns = useCampaigns();
  const promos = usePromos();
  const invalidate = useInvalidateAfterInjection();
  const claim = useClaimPromo();
  const [why, setWhy] = useState(false);

  const screens = screensQ.data ?? [];

  /* Default to the Gate 42 totem, which is the screen the worked example
     in the demo script is about. */
  const resolvedId = useMemo(() => {
    if (screenId && screens.some((s) => s.id === screenId)) return screenId;
    return screens.find((s) => s.name === 'Gate 42 totem')?.id ?? screens[0]?.id ?? null;
  }, [screenId, screens]);

  useEffect(() => {
    if (resolvedId && resolvedId !== screenId) setScreenId(resolvedId);
  }, [resolvedId, screenId, setScreenId]);

  const decisionQ = useDecision(resolvedId);
  const screen = screens.find((s) => s.id === resolvedId) ?? null;

  if (screensQ.isError) return <ErrorNote what="the screen network" />;
  if (!screen) return <Loading what="the screen" />;

  const decision = decisionQ.data ?? null;
  const offline = screen.status === 'offline';
  const winner = decision?.winnerCampaign ?? null;
  const creative = winner
    ? (creatives.data ?? []).find((c) => c.campaignId === winner.id) ?? null
    : null;
  const promo = winner ? (promos.data ?? []).find((p) => p.campaignId === winner.id) ?? null : null;

  const firstPart = decision?.parts?.[0];
  const linkedFlight = firstPart
    ? (flightsQ.data ?? []).find((f) => f.id === firstPart.id) ?? null
    : null;
  const expiresAt = linkedFlight ? linkedFlight.gateCloseTs : now + 25 * 60_000;

  const toggleHeartbeat = async (): Promise<void> => {
    const updated = await api.injectScreen(screen.id);
    invalidate();
    pushToast(`Screen ${updated.status}`, updated.name);
  };

  const simulateScan = (): void => {
    if (!promo) return;
    claim.mutate(
      { code: promo.code, via: 'qr' },
      {
        onSuccess: () =>
          pushToast(
            'Code claimed',
            `${promo.code} · ${winner?.advertiser ?? ''} — now on the retailer dashboard`
          ),
        onError: () => pushToast('Could not claim', promo.code)
      }
    );
  };

  const bezel = (
    <div className={`bezel ${screen.orientation === 'portrait' ? 'portrait' : 'landscape'}`}>
      <div className="screeninner">
        <FidsStrip screen={screen} flights={flightsQ.data ?? []} now={now} />
        <div className="adstage">
          {offline ? (
            <div
              className="adpage"
              style={{
                background: '#07090C', color: '#5A6B7C',
                alignItems: 'center', justifyContent: 'center'
              }}
            >
              <div style={{ textAlign: 'center' }}>
                <h1 style={{ fontSize: '22px' }}>No signal</h1>
                <div className="sub">
                  {screen.id} lost its heartbeat at{' '}
                  {screen.offlineSince ? hhmm(screen.offlineSince) : '—'}
                </div>
              </div>
            </div>
          ) : creative ? (
            <AdPage
              creative={creative}
              promo={promo}
              expiresInMs={expiresAt - now}
              onScan={simulateScan}
            />
          ) : (
            <div className="adpage" style={{ background: '#07090C', color: '#8FA3B8' }}>
              <div />
              <div>
                <h1 style={{ fontSize: '24px' }}>{airportName}</h1>
                <div className="sub">No campaign matches this crowd — showing airport content</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const picker = (
    <Row>
      <Field label="Pick a screen">
        <select
          className="input"
          style={{ minWidth: '260px' }}
          value={screen.id}
          onChange={(e) => {
            setScreenId(e.target.value);
            setWhy(false);
          }}
        >
          {(zones.data ?? []).map((z) => (
            <optgroup key={z.id} label={z.name}>
              {screens
                .filter((s) => s.zone === z.id)
                .map((s) => (
                  <option key={s.id} value={s.id}>{s.name} · {s.size} {s.ratio}</option>
                ))}
            </optgroup>
          ))}
        </select>
      </Field>

      <Field label="Jump to a gate">
        <select
          className="input"
          value=""
          onChange={(e) => {
            const target = screens.find((s) => s.nearGates.includes(e.target.value));
            if (target) setScreenId(target.id);
          }}
        >
          <option value="">—</option>
          {Array.from(new Set(screens.flatMap((s) => s.nearGates)))
            .sort((a, b) => Number(a) - Number(b))
            .map((g) => (
              <option key={g} value={g}>Gate {g}</option>
            ))}
        </select>
      </Field>

      <Field label=" ">
        <div className="row tight">
          <button className="btn sm" type="button" onClick={() => setWhy(!why)}>{t('why.title')}</button>
          <button className="btn sm" type="button" onClick={() => setSplit(!split)}>Split screen</button>
          <button className="btn sm" type="button" onClick={() => void toggleHeartbeat()}>
            {offline ? 'Restore' : 'Take offline'}
          </button>
        </div>
      </Field>
    </Row>
  );

  const stage = (
    <Stack>
      {!compact && picker}
      <div className="screenstage">{bezel}</div>
      <Row tight>
        {!offline && decision && (
          <button className="btn sm" type="button" onClick={() => setWhy(!why)}>{t('why.title')}</button>
        )}
        <Chip mono>{screen.id}</Chip>
        <Chip>{screen.size} · {screen.ratio}</Chip>
        <Chip>{screen.zone}</Chip>
        <Chip>gates {screen.nearGates.join(', ')}</Chip>
        {decision && !decision.empty && <Chip tone="amber">{fmt.n(decision.crowdNow)} pax in front</Chip>}
        {decision?.maxDelay ? <Chip tone="warn">delay {decision.maxDelay} min</Chip> : null}
        {decision
          ? decision.fallback
            ? <Chip tone="warn">rule-based fallback</Chip>
            : <Chip tone="ok">verified</Chip>
          : null}
      </Row>

      {compact && why && decision && (
        <div
          style={{
            background: 'var(--panel)', border: '1px solid var(--line)',
            borderRadius: 'var(--r)', padding: '12px', maxHeight: '340px', overflowY: 'auto'
          }}
        >
          <WhyBody decision={decision} campaigns={campaigns.data ?? []} />
        </div>
      )}
    </Stack>
  );

  if (compact) return stage;

  return (
    <Stack>
      <PageHead
        title="Passenger screen"
        lead="What a traveller actually sees. The ad changes as flights board, delay and depart. Scan the QR with a real phone — it opens the claim page on this same deployment and the redemption lands on the retailer dashboard."
      />
      {stage}
      {why && decision && (
        <Panel
          title={t('why.title')}
          right={<button className="btn sm ghost" type="button" onClick={() => setWhy(false)}>Hide</button>}
        >
          <Pad>
            <WhyBody decision={decision} campaigns={campaigns.data ?? []} />
          </Pad>
        </Panel>
      )}
    </Stack>
  );
}

/* ---- FIDS strip ------------------------------------------------------- */

function FidsStrip({
  screen, flights, now
}: {
  screen: Screen;
  flights: Flight[];
  now: number;
}): JSX.Element {
  const { t } = useApp();
  const list = flights
    .filter(
      (f) =>
        screen.nearGates.includes(f.gate) &&
        f.etdTs > now - 15 * 60_000 &&
        f.etdTs < now + 4 * 3_600_000
    )
    .sort((a, b) => a.etdTs - b.etdTs)
    .slice(0, 3);

  const statusText = (f: Flight): string => {
    if (f.status === 'delayed') return `${t('common.delayed')} ${hhmm(f.etdTs)}`;
    if (f.status === 'boarding') return t('common.boarding');
    if (f.status === 'final') return t('common.final');
    if (f.status === 'departed') return t('common.departed');
    return t('common.scheduled');
  };

  return (
    <div className="fids">
      {list.length ? (
        list.map((f) => (
          <div className="row" key={f.id}>
            <span className="fl">{f.id}</span>
            <span className="ds">{cityOf(f.destination)} {f.destination}</span>
            <span className="gt">{t('common.gate')} {f.gate} · {hhmm(f.etdTs)}</span>
            <span className={`st ${f.status}`}>{statusText(f)}</span>
          </div>
        ))
      ) : (
        <div className="row">
          <span className="gt">No departures at gates {screen.nearGates.join(', ')}</span>
        </div>
      )}
    </div>
  );
}
