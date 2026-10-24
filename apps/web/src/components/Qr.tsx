/* A QR canvas drawn by the `qrcode` package. The encoded text is always a
   claim URL on this origin, so scanning with a phone lands on /claim/:code. */

import { useEffect, useRef } from 'react';
import { drawQr } from '../lib/qr';

export function Qr({ text, size = 104, className }: { text: string; size?: number; className?: string }): JSX.Element {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let cancelled = false;
    void drawQr(canvas, text, { size }).catch(() => {
      if (cancelled) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      canvas.width = size;
      canvas.height = size;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, size, size);
    });
    return () => {
      cancelled = true;
    };
  }, [text, size]);

  return (
    <canvas
      ref={ref}
      className={className}
      width={size}
      height={size}
      style={{ width: `${size}px`, height: `${size}px`, display: 'block' }}
      aria-label="QR code to claim this offer"
      role="img"
    />
  );
}
