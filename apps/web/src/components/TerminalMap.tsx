/* The terminal floor plan, drawn the way an apron chart is drawn: hairline
   outlines at every crowd level, with density carried by diagonal hatch
   that tightens and brightens as a zone fills. A tinted block hides the
   plan and turns the map to mud; hatch keeps the geometry readable and
   keeps the whole chart in one hue, so the only real colour on the field
   is screen status — which is the thing that must be seen across a room.

   Coordinates are the floor-plan coordinates the zones and screens carry. */

import { useQueries } from '@tanstack/react-query';
import { api } from '../lib/api';
import { qk } from '../lib/queries';
import { useApp } from '../lib/app-state';
import type { Screen, Zone, ZonePresence } from '../lib/types';

const W = 1000;
const H = 560;

/* Four steps, not a continuous ramp: a reader can name the level they are
   looking at and match it to the legend. */
const BANDS = [
  { id: 'd1', gap: 13, width: 0.85, opacity: 0.16 },
  { id: 'd2', gap: 9, width: 1.0, opacity: 0.38 },
  { id: 'd3', gap: 6, width: 1.1, opacity: 0.64 },
  { id: 'd4', gap: 3.8, width: 1.25, opacity: 0.95 }
] as const;

function band(level: number): 0 | 1 | 2 | 3 {
  if (level > 0.72) return 3;
  if (level > 0.45) return 2;
  if (level > 0.2) return 1;
  return 0;
}

export function TerminalMap({
  zones, screens, selected, onPick, at
}: {
  zones: Zone[];
  screens: Screen[];
  selected?: string | null;
  onPick?: (screenId: string) => void;
  at?: number;
}): JSX.Element {
  const { fmt } = useApp();

  const presences = useQueries({
    queries: zones.map((z) => ({
      queryKey: qk.presence(z.id, at),
      queryFn: () => api.zonePresence(z.id, at),
      staleTime: 10_000
    }))
  });

  const paxByZone = new Map<string, number>();
  presences.forEach((q, i) => {
    const data = q.data as ZonePresence | undefined;
    if (data) paxByZone.set(zones[i].id, data.pax);
  });
  const maxPax = Math.max(1, ...Array.from(paxByZone.values()));

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="Terminal floor plan with screen status and passenger density"
    >
      <defs>
        {BANDS.map((b) => (
          <pattern
            key={b.id}
            id={`hatch-${b.id}`}
            width={b.gap}
            height={b.gap}
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <line
              x1={0}
              y1={0}
              x2={0}
              y2={b.gap}
              stroke="var(--d-ink)"
              strokeWidth={b.width}
              strokeOpacity={b.opacity}
            />
          </pattern>
        ))}
      </defs>

      <text className="termLabel" x={46} y={26}>Terminal 1 — domestic and regional</text>
      <text className="termLabel" x={530} y={26}>Terminal 2 — international</text>

      {zones.map((z) => {
        const pax = paxByZone.get(z.id) ?? 0;
        const b = band(pax / maxPax);
        return (
          <g key={z.id}>
            <rect className="zoneShape" x={z.x} y={z.y} width={z.w} height={z.h} rx={4} />
            <rect
              className="zoneHatch"
              x={z.x}
              y={z.y}
              width={z.w}
              height={z.h}
              rx={4}
              fill={`url(#hatch-${BANDS[b].id})`}
            />
            <text className="zoneLabel" x={z.x + 9} y={z.y + 15}>{z.name}</text>
            <text className="zonePax" x={z.x + 9} y={z.y + 26}>{fmt.n(pax)} pax</text>
          </g>
        );
      })}

      <path className="transferLink" d="M350 270 L470 270" />
      <text className="zonePax" x={366} y={263}>transfer link</text>

      {screens.map((s) => {
        const picked = selected === s.id;
        return (
          <g key={s.id} className={`scr ${s.status}${picked ? ' pick' : ''}`}>
            {picked && <circle className="halo" cx={s.x} cy={s.y} r={7} />}
            {/* A tick, like a stand marker on an apron chart — reads as a
                fitted screen rather than a scattered dot. */}
            <rect
              x={s.x - 1.2}
              y={s.y - (s.status === 'online' ? 3 : 5)}
              width={2.4}
              height={s.status === 'online' ? 6 : 10}
              rx={1.2}
              onClick={onPick ? () => onPick(s.id) : undefined}
            >
              <title>{`${s.name} · ${s.status} · ${s.latencyMs}ms · ${s.playsToday} plays`}</title>
            </rect>
          </g>
        );
      })}
    </svg>
  );
}

/** The density key. Separate from the map so it can sit in the panel footer. */
export function DensityKey(): JSX.Element {
  return (
    <div className="dkey">
      <span className="cap">Passengers in zone</span>
      {/* Self-contained: the key carries its own patterns so it never
          depends on the map SVG being mounted beside it. */}
      <svg width={120} height={14} className="dkey-ramp" aria-hidden="true">
        <defs>
          {BANDS.map((b) => (
            <pattern
              key={b.id}
              id={`key-${b.id}`}
              width={b.gap}
              height={b.gap}
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <line x1={0} y1={0} x2={0} y2={b.gap} stroke="var(--d-ink)" strokeWidth={b.width} strokeOpacity={b.opacity} />
            </pattern>
          ))}
        </defs>
        {BANDS.map((b, i) => (
          <g key={b.id}>
            <rect x={i * 30} y={0} width={26} height={14} rx={2} className="dkey-cell" />
            <rect x={i * 30} y={0} width={26} height={14} rx={2} fill={`url(#key-${b.id})`} />
          </g>
        ))}
      </svg>
      <span className="cap">low to high</span>
    </div>
  );
}
