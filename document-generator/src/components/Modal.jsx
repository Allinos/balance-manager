import { useEffect, useRef } from 'react';
import Icon from './Icon.jsx';

/**
 * Accessible modal dialog. Closes on Esc and backdrop click.
 * @param {{title?: string, onClose: () => void, size?: 'sm'|'md'|'lg', children: any, footer?: any, className?: string}} props
 */
export default function Modal({ title, onClose, size = 'md', children, footer, className = '' }) {
  const panel = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      // An open dropdown, suggestion list, help tip or menu inside the dialog closes first.
      if (panel.current?.querySelector('.ss.open, .autocomplete-list, .help-tip-pop, details.menu[open], .status-pop')) return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    const previous = document.activeElement;
    // Keep a field that focused itself (autoFocus); otherwise start in the first field, then the first button.
    if (!panel.current?.contains(document.activeElement)) {
      const first =
        panel.current?.querySelector('[autofocus], input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])') ||
        panel.current?.querySelector('button:not(.modal-close)');
      first?.focus();
    }
    return () => {
      window.removeEventListener('keydown', onKey, true);
      if (previous && previous.focus) previous.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="modal-backdrop no-print" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal modal-${size} ${className}`} role="dialog" aria-modal="true" aria-label={title} ref={panel}>
        {title && (
          <div className="modal-header">
            <h2>{title}</h2>
            <button className="icon-btn modal-close" onClick={onClose} aria-label="Close">
              <Icon name="x" />
            </button>
          </div>
        )}
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}
