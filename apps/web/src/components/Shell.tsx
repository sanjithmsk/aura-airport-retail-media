/* The product shell: brand, role switcher, company switcher, language and
   split toggles, the clock, the transport bar, and the left rail. Role and
   page come from the URL, so every view is linkable. */

import { useMemo } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useApp, useSurface } from '../lib/app-state';
import { useLive } from '../lib/events';
import { hhmm } from '../lib/format';
import { I18N } from '../lib/i18n';
import { useOutlets, useSim } from '../lib/queries';
import { ROLES, defaultPage, isRoleId, roleDef } from '../lib/roles';
import type { RoleId } from '../lib/types';
import { AIRLINES } from '../lib/reference';
import { SimBar } from './SimBar';
import { Toasts } from './Toasts';
import { renderView } from '../views/registry';

const BRAND_MARK = (
  <svg viewBox="0 0 28 28" aria-hidden="true" className="brandmark">
    <path d="M14 2.6 25.4 24a1 1 0 0 1-1.25 1.4L14 21.2 3.85 25.4A1 1 0 0 1 2.6 24Z" />
    <path d="M14 2.6 14 21.2" className="mk2" />
  </svg>
);

export function Shell(): JSX.Element {
  const params = useParams<{ role?: string; page?: string }>();
  const navigate = useNavigate();
  const app = useApp();
  const { t, split, setSplit, locale, toggleLocale, productName, airportIata } = app;
  const { now, connected } = useLive();
  const sim = useSim();
  const outlets = useOutlets();

  const role: RoleId = isRoleId(params.role) ? params.role : 'admin';
  const def = roleDef(role);
  const page = params.page && def.pages.some((p) => p.id === params.page) ? params.page : def.pages[0].id;

  useSurface(def.surface);

  const brands = useMemo(() => {
    const names = new Set<string>();
    (outlets.data ?? []).forEach((o) => names.add(o.name));
    return Array.from(names).sort();
  }, [outlets.data]);

  if (!isRoleId(params.role) || !params.page || params.page !== page) {
    return <Navigate to={`/${role}/${page}`} replace />;
  }

  const clock = sim.data?.now ?? now;
  const playing = sim.data?.playing ?? false;

  return (
    <div id="app">
      <header className="topbar">
        <div className="brand">{BRAND_MARK}</div>
        <div className="brand">
          <div>
            <b>{productName}</b>
            <small>{airportIata} · Airport Retail Media</small>
          </div>
        </div>

        <nav className="roles" aria-label="Role">
          {ROLES.map((r) => (
            <button
              key={r.id}
              type="button"
              aria-pressed={role === r.id}
              onClick={() => navigate(`/${r.id}/${defaultPage(r.id)}`)}
            >
              {t(r.key)}
            </button>
          ))}
        </nav>

        <div>
          {role === 'retailer' && (
            <select
              className="input"
              aria-label="Company"
              value={app.outletName}
              onChange={(e) => app.setOutletName(e.target.value)}
            >
              {(brands.length ? brands : [app.outletName]).map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          )}
          {role === 'airline' && (
            <select
              className="input"
              aria-label="Airline"
              value={app.airlineCode}
              onChange={(e) => app.setAirlineCode(e.target.value)}
            >
              {AIRLINES.map((a) => (
                <option key={a.code} value={a.code}>{a.code} · {a.name}</option>
              ))}
            </select>
          )}
        </div>

        <div className="spacer" />

        <button className="btn sm ghost" type="button" onClick={toggleLocale} title="Switch language">
          {I18N[locale === 'en' ? 'ar' : 'en'].label}
        </button>
        <button
          className="btn sm ghost"
          type="button"
          aria-pressed={split}
          onClick={() => setSplit(!split)}
        >
          Split screen
        </button>

        <div className="simclock">
          <span className={playing && connected ? 'pulse' : 'pulse off'} />
          <span className="t">{hhmm(clock)}</span>
          <span className="d">{t('sim.live')}</span>
        </div>
      </header>

      <SimBar />

      <div className="body">
        <nav className="rail" aria-label="Pages">
          <div className="cap">{t(def.key)}</div>
          {def.pages.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-current={page === p.id ? 'page' : undefined}
              onClick={() => navigate(`/${role}/${p.id}`)}
            >
              {t(p.key)}
            </button>
          ))}
        </nav>

        <main className="canvas">
          <div className="wrap">
            {split ? <SplitView /> : renderView(role, page)}
          </div>
        </main>
      </div>

      <Toasts />
    </div>
  );
}

/* ---- split screen ----------------------------------------------------- */

function SplitView(): JSX.Element {
  const { t, splitRole, setSplitRole, setSplit } = useApp();
  const others = ROLES.filter((r) => r.id !== 'screen');
  const other = roleDef(splitRole);

  return (
    <div className="stack">
      <div className="between">
        <div className="row">
          <span className="cap">Split-screen demo mode</span>
          <select
            className="input"
            aria-label="Role shown beside the passenger screen"
            value={splitRole}
            onChange={(e) => setSplitRole(e.target.value as RoleId)}
          >
            {others.map((r) => (
              <option key={r.id} value={r.id}>{t(r.key)}</option>
            ))}
          </select>
        </div>
        <button className="btn sm ghost" type="button" onClick={() => setSplit(false)}>
          Exit split screen
        </button>
      </div>

      <div className="grid g2">
        <div
          data-surface="dark"
          style={{
            background: '#06090C', borderRadius: 'var(--r)', padding: '12px',
            border: '1px solid var(--line)'
          }}
        >
          {renderView('screen', 'screen', true)}
        </div>
        <div
          data-surface={other.surface}
          style={{
            background: 'var(--bg)', borderRadius: 'var(--r)', padding: '12px',
            border: '1px solid var(--line)'
          }}
        >
          {renderView(other.id, other.pages[0].id)}
        </div>
      </div>
    </div>
  );
}
