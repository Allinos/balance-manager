import { useEffect, useRef, useState } from 'react';

/**
 * Small "?" beside a field label. Click shows a short explanation; click
 * again, click elsewhere or Esc closes it.
 */
export default function HelpTip({ text, label = 'What is this?' }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => root.current && !root.current.contains(e.target) && setOpen(false);
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  return (
    <span className="help-tip" ref={root}>
      <button
        type="button"
        className="help-tip-btn"
        aria-label={label}
        aria-expanded={open}
        onClick={(e) => {
          // Inside a <label>: do not move focus to the field.
          e.preventDefault();
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        data-testid="help-tip"
      >
        ?
      </button>
      {open && (
        <span className="help-tip-pop" role="tooltip">
          {text}
        </span>
      )}
    </span>
  );
}
