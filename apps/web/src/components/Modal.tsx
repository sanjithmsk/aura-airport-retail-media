/* A dialog over the canvas. Click the scrim or press Escape to close; the
   .modal / .panel classes come straight from the design system. */

import { useEffect, type ReactNode } from 'react';

export function Modal({
  title, children, actions, onClose, wide
}: {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  onClose: () => void;
  wide?: boolean;
}): JSX.Element {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="modal"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="panel" style={wide ? { maxWidth: '980px' } : undefined}>
        <header>
          <h3>{title}</h3>
          <div className="spacer" />
          <button className="btn sm ghost" onClick={onClose} type="button">Close</button>
        </header>
        <div className="pad">{children}</div>
        {actions && (
          <div className="pad tight" style={{ borderTop: '1px solid var(--line-soft)' }}>
            <div className="row">{actions}</div>
          </div>
        )}
      </div>
    </div>
  );
}
