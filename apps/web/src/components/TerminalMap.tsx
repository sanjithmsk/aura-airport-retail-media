/* The terminal floor plan: zone rectangles, a heat overlay from
   ZonePresence, and one dot per screen coloured by status. Coordinates are
   the floor-plan coordinates the zones and screens carry. */

import { useQueries } from '@tanstack/react-query';
import { api } from '../lib/api';
import { qk } from '../lib/queries';
import { useApp } from '../lib/app-state';
import type { Screen, Zone, ZonePresence } from '../lib/types';

const W = 1000;
const H = 560;

function heatColour(level: number): string {
  if (level > 0.72) return 'var(--heat-4)';
  if (level > 0.45) return 'var(--heat-3)';
  if (level > 0.2) return 'var(--heat-2)';
  return 'var(--heat-1)';
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
      aria-label="Terminal floor plan with screen status and passenger heat"
    >
      <rect x={0} y={0} width={W} height={H} fill="transparent" />

      {zones.map((z) => {
        const pax = paxByZone.get(z.id) ?? 0;
        const level = pax / maxPax;
        return (
          <g key={z.id}>
            <rect className="zoneShape" x={z.x} y={z.y} width={z.w} height={z.h} rx={7} />
            <rect
              className="heatcell"
              x={z.x}
              y={z.y}
              width={z.w}
              height={z.h}
              rx={7}
              fill={heatColour(level)}
              opacity={(0.16 + level * 0.52).toFixed(2)}
            />
            <text className="zoneLabel" x={z.x + 9} y={z.y + 15}>{z.name}</text>
            <text
              className="zoneLabel"
              x={z.x + 9}
              y={z.y + 29}
              fill="var(--fg-2)"
              fontFamily="var(--mono)"
            >
              {fmt.n(pax)} pax
            </text>
          </g>
        );
      })}

      <text x={46} y={26} fill="var(--fg-2)" fontSize={13} fontFamily="var(--board)" letterSpacing={2}>
        TERMINAL 1 · DOMESTIC &amp; REGIONAL
      </text>
      <text x={430} y={26} fill="var(--fg-2)" fontSize={13} fontFamily="var(--board)" letterSpacing={2}>
        TERMINAL 2 · INTERNATIONAL
      </text>

      <path d="M350 270 L470 270" stroke="var(--line)" strokeWidth={10} strokeLinecap="round" opacity={0.7} />
      <text x={372} y={262} className="zoneLabel">transfer link</text>

      {screens.map((s) => {
        const picked = selected === s.id;
        return (
          <circle
            key={s.id}
            className={`scr ${s.status}${picked ? ' pick' : ''}`}
            cx={s.x}
            cy={s.y}
            r={picked ? 5.4 : 3.1}
            onClick={onPick ? () => onPick(s.id) : undefined}
          >
            <title>{`${s.name} · ${s.status} · ${s.latencyMs}ms · ${s.playsToday} plays`}</title>
          </circle>
        );
      })}
    </svg>
  );
}
