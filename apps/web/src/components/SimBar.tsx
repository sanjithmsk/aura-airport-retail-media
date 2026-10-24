/* The simulation transport. Everything here is a POST to /api/sim or
   /api/sim/inject; the SSE stream brings the consequences back. */

import { useState } from 'react';
import { api } from '../lib/api';
import { useApp } from '../lib/app-state';
import { hhmm } from '../lib/format';
import { useFlights, useInvalidateAfterInjection, useScreens, useSim, useSimControls } from '../lib/queries';
import { useLive } from '../lib/events';
import { Modal } from './Modal';
import { Field, Note, Row } from './primitives';
import type { FlightEvent } from '../lib/types';

type InjectKind = 'delay' | 'gate' | 'screen' | null;

export function SimBar(): JSX.Element {
  const { t, pushToast } = useApp();
  const { now } = useLive();
  const sim = useSim();
  const { play, pause, speed, jump } = useSimControls();
  const [open, setOpen] = useState<InjectKind>(null);
  const [aidx, setAidx] = useState<FlightEvent | null>(null);

  const playing = sim.data?.playing ?? false;
  const currentSpeed = sim.data?.speed ?? 10;
  const clock = sim.data?.now ?? now;
  const dayStart = sim.data?.dayStart ?? clock;
  const sceneTime = sim.data?.sceneTime ?? clock;

  const jumpToTime = (value: string): void => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(value);
    if (!m) return;
    const base = new Date(dayStart);
    const midnight = Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate());
    jump.mutate(midnight + (Number(m[1]) * 60 + Number(m[2])) * 60_000);
  };

  return (
    <div className="transport">
      <div className="grp">
        <button
          className={playing ? 'btn on' : 'btn'}
          type="button"
          onClick={() => (playing ? pause.mutate() : play.mutate())}
        >
          {playing ? `⏸ ${t('sim.pause')}` : `▶ ${t('sim.play')}`}
        </button>
      </div>

      <div className="grp">
        <span className="lbl">{t('sim.speed')}</span>
        {([1, 10, 60] as const).map((s) => (
          <button
            key={s}
            className="btn sm"
            type="button"
            aria-pressed={currentSpeed === s}
            onClick={() => speed.mutate(s)}
          >
            {s}×
          </button>
        ))}
      </div>

      <div className="grp">
        <span className="lbl">{t('sim.jump')}</span>
        <input
          className="input"
          type="time"
          step={300}
          value={hhmm(clock)}
          onChange={(e) => jumpToTime(e.target.value)}
        />
        <button className="btn sm" type="button" onClick={() => jump.mutate(sceneTime)}>
          Gate 42 scene
        </button>
      </div>

      <div className="spacer" />

      <div className="grp">
        <span className="lbl">{t('sim.inject')}</span>
        <button className="btn sm" type="button" onClick={() => setOpen('delay')}>⏱ Delay a flight</button>
        <button className="btn sm" type="button" onClick={() => setOpen('gate')}>⇄ Gate change</button>
        <button className="btn sm" type="button" onClick={() => setOpen('screen')}>⚡ Screen offline</button>
      </div>

      {open === 'delay' && (
        <InjectDelayDialog
          onClose={() => setOpen(null)}
          onDone={(ev) => { setOpen(null); setAidx(ev); }}
        />
      )}
      {open === 'gate' && (
        <InjectGateDialog
          onClose={() => setOpen(null)}
          onDone={(ev) => { setOpen(null); setAidx(ev); }}
        />
      )}
      {open === 'screen' && (
        <InjectScreenDialog
          onClose={() => setOpen(null)}
          onDone={(name, status) => { setOpen(null); pushToast(`Screen ${status}`, name); }}
        />
      )}
      {aidx && <AidxDialog event={aidx} onClose={() => setAidx(null)} />}
    </div>
  );
}

/* ---- dialogs ---------------------------------------------------------- */

function InjectDelayDialog({
  onClose, onDone
}: {
  onClose: () => void;
  onDone: (ev: FlightEvent) => void;
}): JSX.Element {
  const flights = useFlights({ direction: 'D', limit: 60 });
  const invalidate = useInvalidateAfterInjection();
  const { pushToast } = useApp();
  const list = flights.data ?? [];
  const preferred = list.find((f) => f.id === 'XY501') ?? list[0];
  const [flightId, setFlightId] = useState<string>('');
  const [minutes, setMinutes] = useState(45);
  const [busy, setBusy] = useState(false);
  const selected = flightId || preferred?.id || '';

  const publish = async (): Promise<void> => {
    if (!selected) return;
    setBusy(true);
    try {
      const ev = await api.injectDelay(selected, minutes);
      invalidate();
      pushToast('Delay published', `${selected} +${minutes} min`);
      onDone(ev);
    } catch {
      pushToast('Could not publish', 'The API did not accept the delay');
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Inject an AIDX delay"
      onClose={onClose}
      actions={
        <>
          <button className="btn primary" type="button" disabled={busy || !selected} onClick={() => void publish()}>
            Publish delay message
          </button>
          <button className="btn ghost" type="button" onClick={onClose}>Cancel</button>
        </>
      }
    >
      <div className="stack">
        <Note>
          This publishes a real IATA_AIDX_FlightLegNotifRQ message on the simulated feed. Every role reacts to
          it: the airline view, the gate screens, retailer delay rules and the zone passenger count.
        </Note>
        <Row>
          <Field label="Flight leg">
            <select
              className="input"
              style={{ minWidth: '260px' }}
              value={selected}
              onChange={(e) => setFlightId(e.target.value)}
            >
              {list.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.id} → {f.destination} · gate {f.gate} · {hhmm(f.etdTs)} · {f.pax} pax
                </option>
              ))}
            </select>
          </Field>
          <Field label="Extra minutes">
            <input
              className="input"
              type="number"
              min={5}
              max={240}
              step={5}
              style={{ width: '90px' }}
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
            />
          </Field>
        </Row>
      </div>
    </Modal>
  );
}

function InjectGateDialog({
  onClose, onDone
}: {
  onClose: () => void;
  onDone: (ev: FlightEvent) => void;
}): JSX.Element {
  const flights = useFlights({ direction: 'D', limit: 60 });
  const invalidate = useInvalidateAfterInjection();
  const { pushToast } = useApp();
  const list = flights.data ?? [];
  const [flightId, setFlightId] = useState('');
  const [gate, setGate] = useState('46');
  const [busy, setBusy] = useState(false);
  const selected = flightId || list[0]?.id || '';
  const gates = Array.from(new Set(list.map((f) => f.gate))).sort((a, b) => Number(a) - Number(b));

  const publish = async (): Promise<void> => {
    if (!selected) return;
    setBusy(true);
    try {
      const ev = await api.injectGate(selected, gate);
      invalidate();
      pushToast('Gate change published', `${selected} → gate ${gate}`);
      onDone(ev);
    } catch {
      pushToast('Could not publish', 'The API did not accept the gate change');
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Inject a gate change"
      onClose={onClose}
      actions={
        <>
          <button className="btn primary" type="button" disabled={busy || !selected} onClick={() => void publish()}>
            Publish gate change
          </button>
          <button className="btn ghost" type="button" onClick={onClose}>Cancel</button>
        </>
      }
    >
      <div className="stack">
        <Note>
          Moves the flight to a new stand and republishes the leg. Screens at the old gate drop it from their
          catchment within one slot; screens at the new gate pick it up.
        </Note>
        <Row>
          <Field label="Flight leg">
            <select
              className="input"
              style={{ minWidth: '260px' }}
              value={selected}
              onChange={(e) => setFlightId(e.target.value)}
            >
              {list.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.id} → {f.destination} · gate {f.gate} · {hhmm(f.etdTs)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="New gate">
            <select className="input" value={gate} onChange={(e) => setGate(e.target.value)}>
              {gates.map((g) => (
                <option key={g} value={g}>Gate {g}</option>
              ))}
            </select>
          </Field>
        </Row>
      </div>
    </Modal>
  );
}

function InjectScreenDialog({
  onClose, onDone
}: {
  onClose: () => void;
  onDone: (name: string, status: string) => void;
}): JSX.Element {
  const screens = useScreens();
  const invalidate = useInvalidateAfterInjection();
  const { screenId } = useApp();
  const list = screens.data ?? [];
  const preferred = screenId ?? list.find((s) => s.name === 'Gate 42 totem')?.id ?? list[0]?.id ?? '';
  const [picked, setPicked] = useState('');
  const [busy, setBusy] = useState(false);
  const selected = picked || preferred;

  const toggle = async (): Promise<void> => {
    if (!selected) return;
    setBusy(true);
    try {
      const s = await api.injectScreen(selected);
      invalidate();
      onDone(s.name, s.status);
    } catch {
      setBusy(false);
      onClose();
    }
  };

  return (
    <Modal
      title="Take a screen offline"
      onClose={onClose}
      actions={
        <>
          <button className="btn primary" type="button" disabled={busy || !selected} onClick={() => void toggle()}>
            Toggle heartbeat
          </button>
          <button className="btn ghost" type="button" onClick={onClose}>Cancel</button>
        </>
      }
    >
      <div className="stack">
        <Note>
          Drops the heartbeat. After five minutes the incident tracker raises a critical alert, the network map
          turns the dot red, and the screen’s inventory is released back to the pool. Run it again to restore
          the screen.
        </Note>
        <Field label="Screen">
          <select
            className="input"
            style={{ minWidth: '300px' }}
            value={selected}
            onChange={(e) => setPicked(e.target.value)}
          >
            {list.map((s) => (
              <option key={s.id} value={s.id}>{s.id} · {s.name} · {s.status}</option>
            ))}
          </select>
        </Field>
      </div>
    </Modal>
  );
}

export function AidxDialog({ event, onClose }: { event: FlightEvent; onClose: () => void }): JSX.Element {
  return (
    <Modal title="Published on the AIDX feed" onClose={onClose} wide>
      <div className="stack">
        <Note>
          Canonical FlightEvent: {event.kind} · {event.flightId} · gate {event.gate} · received{' '}
          {hhmm(event.receivedAt)}
        </Note>
        <pre className="xml">{event.raw}</pre>
      </div>
    </Modal>
  );
}
