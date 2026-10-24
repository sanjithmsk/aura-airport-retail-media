/* Footfall in 15-minute windows. Built from ZonePresence samples, which is
   the same signal the engine prices and scores against. */

import { useApp } from '../lib/app-state';
import { hhmm } from '../lib/format';

export interface FootfallPoint {
  ts: number;
  pax: number;
  international: number;
}

export function FootfallChart({ series }: { series: FootfallPoint[] }): JSX.Element {
  const { fmt } = useApp();
  const W = 620;
  const H = 120;
  const pad = 46;

  if (!series.length) return <p className="note">No window to chart yet.</p>;

  const max = Math.max(1, ...series.map((s) => s.pax));
  const bw = (W - pad * 2) / series.length;
  const plotH = H - pad - 16;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: '100%', height: 'auto' }}
      role="img"
      aria-label="Footfall in the next two hours"
    >
      {[0.5, 1].map((f) => {
        const y = H - pad - f * plotH;
        return (
          <g key={f}>
            <line x1={pad} x2={W - pad} y1={y} y2={y} stroke="var(--line-soft)" strokeWidth={1} />
            <text x={4} y={y + 3} fill="var(--muted)" fontSize={9} fontFamily="monospace">
              {fmt.n(max * f)}
            </text>
          </g>
        );
      })}

      {series.map((s, i) => {
        const bh = (s.pax / max) * plotH;
        const x = pad + i * bw;
        return (
          <rect
            key={s.ts}
            x={x + 1.5}
            y={H - pad - bh}
            width={Math.max(1, bw - 3)}
            height={Math.max(1, bh)}
            rx={2}
            fill="var(--accent)"
            opacity={(0.45 + 0.5 * (s.pax / max)).toFixed(2)}
          >
            <title>{`${hhmm(s.ts)} · ${fmt.n(s.pax)} pax · ${fmt.pct(s.international)} international`}</title>
          </rect>
        );
      })}

      {series.map((s, i) =>
        i % 2 === 0 ? (
          <text
            key={`t-${s.ts}`}
            x={pad + i * bw + bw / 2}
            y={H - 8}
            fill="var(--muted)"
            fontSize={9}
            textAnchor="middle"
            fontFamily="monospace"
          >
            {hhmm(s.ts)}
          </text>
        ) : null
      )}
    </svg>
  );
}
