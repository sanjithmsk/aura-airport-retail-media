/* The mobile claim page. No shell: this is what a traveller's phone opens
   after scanning the QR on a screen, and it has to work at 390px. */

import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApp, useSurface } from '../../lib/app-state';
import { useLive } from '../../lib/events';
import { shade } from '../../lib/format';
import { categoryOf } from '../../lib/reference';
import { useClaimPromo, usePromo } from '../../lib/queries';
import { Cap, Chip, Loading, Note, Row, Stack } from '../../components/primitives';

export function ClaimPage(): JSX.Element {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { t, fmt, locale, productName, airportIata } = useApp();
  const { now } = useLive();
  const detail = usePromo(code);
  const claim = useClaimPromo();

  useSurface('dark');
  useEffect(() => {
    document.title = `${productName} · ${t('claim.title')}`;
  }, [productName, t]);

  if (detail.isLoading) {
    return (
      <div className="claimpage">
        <div className="claimwrap">
          <Loading what="your offer" />
        </div>
      </div>
    );
  }

  const promo = detail.data?.promo ?? null;
  const campaign = detail.data?.campaign ?? null;
  const creative = detail.data?.creative ?? null;
  const tint = campaign ? categoryOf(campaign.category).tint : '#C8A24B';
  const claimed = claim.isSuccess;
  const headline = creative ? creative.headline[locale] ?? creative.headline.en : campaign?.name ?? '';
  const shareCode = promo ? promo.code.replace(/-(\d+)$/, (_m, n: string) => `-${Number(n) + 41}`) : '';
  const expiresIn = Math.max(0, now + 22 * 60_000 - now);

  return (
    <div className="claimpage">
      <div className="claimwrap">
        <Row tight style={{ justifyContent: 'center', marginTop: '6px' }}>
          <svg viewBox="0 0 28 28" aria-hidden="true" className="brandmark" style={{ width: '22px' }}>
            <path d="M14 2.6 25.4 24a1 1 0 0 1-1.25 1.4L14 21.2 3.85 25.4A1 1 0 0 1 2.6 24Z" />
            <path d="M14 2.6 14 21.2" className="mk2" />
          </svg>
          <b style={{ letterSpacing: '.08em' }}>{productName}</b>
          <span className="note">{airportIata}</span>
        </Row>

        {promo && campaign ? (
          <>
            <div
              className="claimcard"
              style={{ background: `linear-gradient(140deg, ${tint}, ${shade(tint, -42)})` }}
            >
              <div className="qrcap" style={{ opacity: 0.85 }}>{campaign.advertiser}</div>
              <h2 style={{ marginTop: '8px' }}>{headline}</h2>
              <p style={{ marginTop: '8px', opacity: 0.9, fontSize: '13px' }}>{promo.terms}</p>
            </div>

            <div className="panel">
              <div className="pad">
                <Stack>
                  <Cap>{claimed ? t('claim.claimed') : t('claim.title')}</Cap>
                  <div className="bigcode">{promo.code}</div>

                  <div className="between">
                    <span className="note">{t('claim.expires')}</span>
                    <span className="mono">{fmt.dur(expiresIn)}</span>
                  </div>

                  {claimed ? (
                    <Stack>
                      <Row tight>
                        <Chip tone="ok">✓ {t('claim.claimed')}</Chip>
                        <span className="note">Show this code at {campaign.advertiser}</span>
                      </Row>
                      {promo.shareEnabled && (
                        <Stack>
                          <Cap>{t('claim.share')}</Cap>
                          <div className="bigcode" style={{ fontSize: '20px' }}>{shareCode}</div>
                          <Note>
                            A second code for someone travelling with you. Same offer, same expiry.
                          </Note>
                        </Stack>
                      )}
                    </Stack>
                  ) : (
                    <button
                      className="btn primary"
                      type="button"
                      disabled={claim.isPending}
                      style={{ width: '100%', justifyContent: 'center', padding: '12px' }}
                      onClick={() => claim.mutate({ code: promo.code, via: 'phone' })}
                    >
                      {t('claim.cta')}
                    </button>
                  )}

                  {claim.isError && <Note>That claim did not go through. Try again in a moment.</Note>}
                </Stack>
              </div>
            </div>
          </>
        ) : (
          <div className="panel">
            <div className="pad">
              <Note>That code is not live right now.</Note>
            </div>
          </div>
        )}

        <div className="panel">
          <div className="pad">
            <Stack>
              <Cap>Why you are seeing this</Cap>
              <Note>
                This offer was chosen for the crowd at your gate — destination, time to boarding and delay.
                Nothing about you personally was used: no boarding pass, no identity, no device tracking.
              </Note>
              <button className="btn sm ghost" type="button" onClick={() => navigate('/screen/screen')}>
                Back to the playground
              </button>
            </Stack>
          </div>
        </div>
      </div>
    </div>
  );
}
