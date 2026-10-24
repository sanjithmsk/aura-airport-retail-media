/* The toast stack. Injection events arriving over SSE raise one too, so a
   delay published from another tab still announces itself here. */

import { useEffect } from 'react';
import { useApp } from '../lib/app-state';
import { useLive } from '../lib/events';

export function Toasts(): JSX.Element | null {
  const { toasts, dismissToast, pushToast } = useApp();
  const { notice, clearNotice } = useLive();

  useEffect(() => {
    if (!notice) return;
    pushToast(notice.title, notice.detail);
    clearNotice();
  }, [notice, pushToast, clearNotice]);

  if (!toasts.length) return null;
  const top = toasts[toasts.length - 1];
  return (
    <div className="toast" role="status" onClick={() => dismissToast(top.id)}>
      <b>{top.title}</b>
      {top.detail && <span className="fg2">{top.detail}</span>}
    </div>
  );
}
