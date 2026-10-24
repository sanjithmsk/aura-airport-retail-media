/* The shared vocabulary of the design system, as components. Every class
   name here is from 20-components.css — nothing new is invented. */

import type { CSSProperties, ReactNode } from 'react';
import type { CrowdProfile, FlightStatus, ScreenStatus } from '../lib/types';
import { useApp } from '../lib/app-state';

export type Tone = 'ok' | 'warn' | 'crit' | 'info' | 'amber' | 'muted';

/* ---- panel ------------------------------------------------------------ */

export function Panel({
  title, right, children, className
}: {
  title?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <section className={className ? `panel ${className}` : 'panel'}>
      {title != null && (
        <header>
          {typeof title === 'string' ? <h3>{title}</h3> : title}
          <div className="spacer" />
          {right}
        </header>
      )}
      {children}
    </section>
  );
}

export function Pad({
  children, tight, style
}: {
  children: ReactNode;
  tight?: boolean;
  style?: CSSProperties;
}): JSX.Element {
  return <div className={tight ? 'pad tight' : 'pad'} style={style}>{children}</div>;
}

export function PageHead({
  title, lead, children
}: {
  title: string;
  lead?: string;
  children?: ReactNode;
}): JSX.Element {
  return (
    <div className="pagehead">
      <div>
        <h2>{title}</h2>
        {lead && <p>{lead}</p>}
      </div>
      {children}
    </div>
  );
}

/* ---- kpi -------------------------------------------------------------- */

export function Kpi({
  label, value, sub, tone
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: Tone;
}): JSX.Element {
  return (
    <div className="kpi">
      <div className="k">{label}</div>
      <div className={tone ? `v ${tone}` : 'v'}>{value}</div>
      {sub != null && <div className="s">{sub}</div>}
    </div>
  );
}

export function Kpis({ children, columns }: { children: ReactNode; columns?: number }): JSX.Element {
  const style: CSSProperties | undefined = columns
    ? { gridTemplateColumns: `repeat(${columns}, minmax(0,1fr))` }
    : undefined;
  return <div className="kpis" style={style}>{children}</div>;
}

/* ---- chips ------------------------------------------------------------ */

export function Chip({
  tone, children, dot, mono, title
}: {
  tone?: Tone;
  children: ReactNode;
  dot?: boolean;
  mono?: boolean;
  title?: string;
}): JSX.Element {
  const cls = ['chip', tone, mono ? 'mono' : null].filter(Boolean).join(' ');
  return (
    <span className={cls} title={title}>
      {dot && <span className="dot" />}
      {children}
    </span>
  );
}

const SCREEN_TONE: Record<ScreenStatus, Tone> = { online: 'ok', degraded: 'warn', offline: 'crit' };

export function ScreenStatusChip({ status }: { status: ScreenStatus }): JSX.Element {
  return <Chip tone={SCREEN_TONE[status]} dot>{status}</Chip>;
}

export function FlightStatusChip({ status }: { status: FlightStatus }): JSX.Element {
  const { t } = useApp();
  const tone: Tone | undefined =
    status === 'boarding' ? 'ok'
      : status === 'delayed' ? 'warn'
        : status === 'final' ? 'amber'
          : status === 'cancelled' ? 'crit'
            : undefined;
  const label =
    status === 'boarding' ? t('common.boarding')
      : status === 'delayed' ? t('common.delayed')
        : status === 'final' ? t('common.final')
          : status === 'departed' ? t('common.departed')
            : status === 'cancelled' ? t('common.cancelled')
              : status === 'scheduled' ? t('common.scheduled')
                : 'Landed';
  return <Chip tone={tone}>{label}</Chip>;
}

/* ---- bars ------------------------------------------------------------- */

export function BarRow({
  label, value, tone, index
}: {
  label: ReactNode;
  value: number;
  tone?: 'info' | 'ok' | 'muted';
  index?: ReactNode;
}): JSX.Element {
  const { fmt } = useApp();
  const pct = Math.max(0, Math.min(100, value * 100));
  return (
    <div className="bar">
      <div className="lb">{label}</div>
      <div className="track">
        <div className={tone ? `fill ${tone}` : 'fill'} style={{ width: `${pct}%` }} />
      </div>
      <div className="pc">
        {fmt.pct(value)}
        {index != null && <span className="idx"> {index}</span>}
      </div>
    </div>
  );
}

export function Bars({ children }: { children: ReactNode }): JSX.Element {
  return <div className="bars">{children}</div>;
}

export function ProfileBars({ profile, limit }: { profile: CrowdProfile; limit?: number }): JSX.Element {
  const rows: Array<[string, number, 'info' | 'ok' | 'muted' | undefined]> = [
    ['International', profile.international, 'info'],
    ['Holiday', profile.purpose.holiday, undefined],
    ['Business', profile.purpose.business, 'muted'],
    ['Family with children', profile.party.family, 'ok'],
    ['Couples', profile.party.couple, 'muted'],
    ['Adults 25–54', profile.age2554, 'muted'],
    ['Children under 12', profile.age.u12, 'muted'],
    ['Premium cabin', profile.premiumCabin, 'muted']
  ];
  return (
    <Bars>
      {rows.slice(0, limit ?? rows.length).map(([label, value, tone]) => (
        <BarRow key={label} label={label} value={value} tone={tone} />
      ))}
    </Bars>
  );
}

/* ---- sparkline -------------------------------------------------------- */

export function Sparkline({ values, tone }: { values: number[]; tone?: 'ok' | 'crit' }): JSX.Element | null {
  if (!values.length) return null;
  const w = 120;
  const h = 26;
  const max = Math.max(...values, 1);
  const min = Math.min(...values);
  const span = Math.max(1e-6, max - min);
  const pts = values.map((v, i) => [
    (i / Math.max(1, values.length - 1)) * w,
    h - 2 - ((v - min) / span) * (h - 5)
  ] as const);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const area = `${d} L${w} ${h} L0 ${h} Z`;
  const col = tone === 'ok' ? 'var(--ok)' : tone === 'crit' ? 'var(--crit)' : 'var(--accent)';
  const last = pts[pts.length - 1];
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={area} fill={col} opacity="0.14" />
      <path d={d} fill="none" stroke={col} strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx={last[0].toFixed(1)} cy={last[1].toFixed(1)} r="2.2" fill={col} />
    </svg>
  );
}

/** The 14-point curve the KPI tiles use; shaped from a running total. */
export function dayCurve(total: number, hoursIn: number): number[] {
  const out: number[] = [];
  for (let i = 1; i <= 14; i++) {
    const frac = i / 14;
    out.push(total * Math.pow(frac, 1.25) * (0.94 + 0.12 * Math.sin(i * 1.7 + hoursIn)));
  }
  return out;
}

/* ---- table ------------------------------------------------------------ */

export interface Column<T> {
  label: string;
  n?: boolean;
  render: (row: T) => ReactNode;
}

export function DataTable<T>({
  cols, rows, rowKey, scroll, empty, onRow, selectedKey
}: {
  cols: Array<Column<T>>;
  rows: T[];
  rowKey: (row: T, index: number) => string;
  scroll?: boolean;
  empty?: string;
  onRow?: (row: T) => void;
  selectedKey?: string | null;
}): JSX.Element {
  return (
    <div className={scroll ? 'tablewrap scrolly' : 'tablewrap'}>
      <table className="t">
        <thead>
          <tr>
            {cols.map((c, i) => (
              <th key={`${c.label}-${i}`} className={c.n ? 'n' : undefined}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((r, ri) => {
              const key = rowKey(r, ri);
              return (
                <tr
                  key={key}
                  className={selectedKey && selectedKey === key ? 'sel' : undefined}
                  onClick={onRow ? () => onRow(r) : undefined}
                  style={onRow ? { cursor: 'pointer' } : undefined}
                >
                  {cols.map((c, ci) => (
                    <td key={`${key}-${ci}`} className={c.n ? 'n' : undefined}>{c.render(r)}</td>
                  ))}
                </tr>
              );
            })
          ) : (
            <tr>
              <td
                colSpan={cols.length}
                style={{ color: 'var(--muted)', padding: '18px', textAlign: 'center' }}
              >
                {empty ?? 'Nothing here yet'}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/* ---- small layout helpers --------------------------------------------- */

export function Stack({ children, gap, style }: { children: ReactNode; gap?: number; style?: CSSProperties }): JSX.Element {
  return <div className="stack" style={gap != null ? { gap: `${gap}px`, ...style } : style}>{children}</div>;
}

export function Row({ children, tight, style }: { children: ReactNode; tight?: boolean; style?: CSSProperties }): JSX.Element {
  return <div className={tight ? 'row tight' : 'row'} style={style}>{children}</div>;
}

export function Between({ children, style }: { children: ReactNode; style?: CSSProperties }): JSX.Element {
  return <div className="between" style={style}>{children}</div>;
}

export function Grid({
  cols, children, style
}: {
  cols: '2' | '3' | '4' | '23' | '32';
  children: ReactNode;
  style?: CSSProperties;
}): JSX.Element {
  return <div className={`grid g${cols}`} style={style}>{children}</div>;
}

export function Field({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
    </div>
  );
}

export function Note({ children, style }: { children: ReactNode; style?: CSSProperties }): JSX.Element {
  return <p className="note" style={style}>{children}</p>;
}

export function Cap({ children, style }: { children: ReactNode; style?: CSSProperties }): JSX.Element {
  return <div className="cap" style={style}>{children}</div>;
}

export function KvRow({ k, v }: { k: string; v: ReactNode }): JSX.Element {
  return (
    <div>
      <div className="cap">{k}</div>
      <div className="mono" style={{ fontSize: '12.5px' }}>{v}</div>
    </div>
  );
}

export function Loading({ what }: { what: string }): JSX.Element {
  return <p className="note" style={{ padding: '14px' }}>Loading {what}…</p>;
}

export function ErrorNote({ what }: { what: string }): JSX.Element {
  return (
    <p className="note" style={{ padding: '14px', color: 'var(--crit)' }}>
      Could not reach the API for {what}. Start @aura/api on port 4000 and this fills in.
    </p>
  );
}
