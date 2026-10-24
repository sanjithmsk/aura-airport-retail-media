/* QR rendering through the `qrcode` package — no CDN, no network. The code
   always encodes a claim URL on this same origin so a reviewer can scan it
   with a real phone and land on /claim/:code. */

import QRCode from 'qrcode';

export function claimUrl(code: string): string {
  const clean = String(code ?? '').replace(/[^A-Za-z0-9-]/g, '');
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  return `${origin}/claim/${clean}`;
}

export interface QrOptions {
  size?: number;
  margin?: number;
}

/** Draws into an existing canvas; returns a promise so callers can await. */
export function drawQr(canvas: HTMLCanvasElement, text: string, opts: QrOptions = {}): Promise<void> {
  return QRCode.toCanvas(canvas, text, {
    width: opts.size ?? 104,
    margin: opts.margin ?? 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#000000ff', light: '#ffffffff' }
  });
}

export function qrDataUrl(text: string, opts: QrOptions = {}): Promise<string> {
  return QRCode.toDataURL(text, {
    width: opts.size ?? 104,
    margin: opts.margin ?? 1,
    errorCorrectionLevel: 'M'
  });
}
