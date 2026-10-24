/* The ad itself. Five templates, each a background treatment over the same
   headline / sub / CTA structure, so a creative renders identically in the
   bezel, in the builder preview and in the approval queue. */

import type { CSSProperties, ReactNode } from 'react';
import type { Creative, PromoCode } from '../lib/types';
import { shade } from '../lib/format';
import { I18N, type Locale } from '../lib/i18n';
import { categoryOf } from '../lib/reference';
import { useApp } from '../lib/app-state';
import { Qr } from './Qr';
import { claimUrl } from '../lib/qr';

interface Treatment {
  background: string;
  ink: string;
  decor?: ReactNode;
}

function treatmentFor(template: string, tint: string): Treatment {
  if (template === 'bold-offer') {
    return {
      background: `linear-gradient(135deg, ${tint} 0%, ${shade(tint, -38)} 100%)`,
      ink: '#fff',
      decor: (
        <svg
          viewBox="0 0 400 300"
          preserveAspectRatio="none"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.16 }}
          aria-hidden="true"
        >
          <circle cx={330} cy={60} r={150} fill="#fff" />
          <circle cx={60} cy={260} r={110} fill="#000" />
        </svg>
      )
    };
  }
  if (template === 'lifestyle-split') {
    const dark = shade(tint, -52);
    return {
      background: `linear-gradient(100deg, ${dark} 0%, ${dark} 52%, ${tint} 52%, ${shade(tint, 12)} 100%)`,
      ink: '#fff'
    };
  }
  if (template === 'countdown-deal') {
    return {
      background: '#0C1218',
      ink: '#fff',
      decor: (
        <svg
          viewBox="0 0 400 300"
          preserveAspectRatio="none"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
          aria-hidden="true"
        >
          <rect x={0} y={0} width={400} height={300} fill="#0C1218" />
          <rect x={0} y={0} width={400} height={7} fill={tint} />
          <rect x={0} y={293} width={400} height={7} fill={tint} />
        </svg>
      )
    };
  }
  if (template === 'minimal-type') {
    return { background: '#F3F0EA', ink: '#14110C' };
  }
  return {
    background: `linear-gradient(180deg, #07090C 0%, ${shade(tint, -60)} 100%)`,
    ink: '#fff'
  };
}

export function AdPage({
  creative, promo, expiresInMs, onScan, localeOverride, preview
}: {
  creative: Creative;
  promo?: PromoCode | null;
  expiresInMs?: number;
  onScan?: () => void;
  localeOverride?: Locale;
  preview?: boolean;
}): JSX.Element {
  const { locale, fmt, t } = useApp();
  const loc = localeOverride ?? locale;
  const tint = categoryOf(creative.category).tint;
  const { background, ink, decor } = treatmentFor(creative.template, tint);

  const head = creative.headline[loc] ?? creative.headline.en;
  const sub = creative.sub[loc] ?? creative.sub.en;
  const cta = creative.cta[loc] ?? creative.cta.en;

  const style: CSSProperties = {
    background,
    color: ink,
    direction: I18N[loc].dir,
    fontFamily: loc === 'ar' ? 'var(--ar)' : 'var(--ui)'
  };

  const showQr = !!promo && !preview;

  return (
    <div className="adpage" style={style}>
      {decor && <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>{decor}</div>}

      <div style={{ position: 'relative' }}>
        <div className="brandrow">
          <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: ink, opacity: 0.7 }} />
          {creative.advertiser}
        </div>
        <h1 style={{ marginTop: '10px' }}>{head}</h1>
        <div className="sub">{sub}</div>
      </div>

      <div className="footrow" style={{ position: 'relative' }}>
        <div>
          <div className="qrcap">{cta}</div>
          {promo && expiresInMs != null && (
            <>
              <div className="countdown">⏱ {fmt.dur(Math.max(0, expiresInMs))}</div>
              <div style={{ fontSize: '11px', opacity: 0.8, marginTop: '2px' }}>{t('ad.validUntil')}</div>
            </>
          )}
        </div>

        {showQr && promo && (
          <div
            className="qrbox"
            role={onScan ? 'button' : undefined}
            tabIndex={onScan ? 0 : undefined}
            title="Scan with a phone, or click to simulate a scan"
            onClick={onScan}
            onKeyDown={(e) => {
              if (onScan && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                onScan();
              }
            }}
          >
            <Qr text={claimUrl(promo.code)} size={104} />
            <div className="cd">{promo.code}</div>
          </div>
        )}
      </div>
    </div>
  );
}

/** A creative stub for the builder preview, before one has been generated. */
export function draftCreative(opts: {
  id: string;
  advertiser: string;
  category: string;
  headline: string;
}): Creative {
  return {
    id: 'draft',
    campaignId: opts.id,
    advertiser: opts.advertiser,
    category: opts.category,
    template: 'bold-offer',
    headline: { en: opts.headline, ar: opts.headline },
    sub: { en: opts.advertiser, ar: opts.advertiser },
    cta: { en: 'Scan to claim', ar: 'امسح للحصول' },
    ratio: '16:9',
    approval: 'pending',
    generatedBy: 'draft',
    updated: '',
    checks: { brandSafety: true, legibility: true, duration: true, languages: true }
  };
}
