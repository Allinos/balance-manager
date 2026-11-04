/**
 * A date field with a modern calendar sheet, instead of the phone's own date dialog (dated on Android WebView).
 *
 * Drop-in for <input type="date">: value is "YYYY-MM-DD" (or ''), onChange gets an event-like { target: { value } }.
 * A real date input stays in the page (invisible, not tappable) so forms, labels and automated tests still work.
 */

import { useContext, useMemo, useState } from 'react';
import Icon from './Icon.jsx';
import { FieldLabel, Sheet } from './ui.jsx';

const pad = (n) => String(n).padStart(2, '0');
const isoOf = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const todayIso = () => {
  const t = new Date();
  return isoOf(t.getFullYear(), t.getMonth(), t.getDate());
};
const parse = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(iso || '') ? new Date(`${iso}T00:00:00`) : null);
const shift = (iso, days) => {
  const d = parse(iso) || new Date();
  d.setDate(d.getDate() + days);
  return isoOf(d.getFullYear(), d.getMonth(), d.getDate());
};
export const prettyDate = (iso, opts = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) => {
  const d = parse(iso);
  return d ? d.toLocaleDateString('en-IN', opts) : '';
};

const WEEK = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** The calendar sheet. `quick`: shortcut chips [{ label, value }]. */
export function CalendarSheet({ title = 'Select date', value, min, max, clearable, quick, onPick, onClose, testId }) {
  const start = parse(value) || parse(min && min > todayIso() ? min : '') || new Date();
  const [view, setView] = useState({ y: start.getFullYear(), m: start.getMonth() });
  const [years, setYears] = useState(false);
  const today = todayIso();
  const allowed = (iso) => (!min || iso >= min) && (!max || iso <= max);

  const cells = useMemo(() => {
    const first = new Date(view.y, view.m, 1).getDay();
    const days = new Date(view.y, view.m + 1, 0).getDate();
    return [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  }, [view]);

  const move = (n) => setView(({ y, m }) => ({ y: m + n < 0 ? y - 1 : m + n > 11 ? y + 1 : y, m: (m + n + 12) % 12 }));
  const chips = (quick || [
    { label: 'Today', value: today },
    { label: 'Yesterday', value: shift(today, -1) },
  ]).filter((q) => allowed(q.value));
  const thisYear = new Date().getFullYear();
  const yearList = Array.from({ length: 16 }, (_, i) => thisYear + 5 - i);

  return (
    <Sheet title={title} onClose={onClose} testId={testId}>
      <div className="cal" data-testid="calendar">
        <div className="cal-picked">
          <span className="small muted">{value ? 'Selected' : 'No date selected'}</span>
          <strong>{value ? prettyDate(value) : '—'}</strong>
        </div>
        {chips.length > 0 && (
          <div className="cal-quick">
            {chips.map((q) => (
              <button type="button" key={q.label} className={`chip ${q.value === value ? 'active' : ''}`} onClick={() => onPick(q.value)} data-testid={`cal-quick-${q.label.toLowerCase().replace(/\W+/g, '-')}`}>
                {q.label}
              </button>
            ))}
          </div>
        )}
        <div className="cal-nav">
          <button type="button" className="icon-btn" onClick={() => move(-1)} aria-label="Previous month" data-testid="cal-prev">
            <Icon name="chevronLeft" size={20} />
          </button>
          <button type="button" className="cal-month" onClick={() => setYears((y) => !y)} aria-label="Choose the year" data-testid="cal-month">
            {MONTHS[view.m]} {view.y} <Icon name="chevronDown" size={15} />
          </button>
          <button type="button" className="icon-btn" onClick={() => move(1)} aria-label="Next month" data-testid="cal-next">
            <Icon name="chevronRight" size={20} />
          </button>
        </div>
        {years ? (
          <div className="cal-years">
            {yearList.map((y) => (
              <button
                type="button"
                key={y}
                className={y === view.y ? 'on' : ''}
                onClick={() => {
                  setView((v) => ({ ...v, y }));
                  setYears(false);
                }}
              >
                {y}
              </button>
            ))}
          </div>
        ) : (
          <div className="cal-grid" role="grid">
            {WEEK.map((w, i) => (
              <span key={`w${i}`} className="cal-week">
                {w}
              </span>
            ))}
            {cells.map((d, i) => {
              if (!d) return <span key={`e${i}`} />;
              const iso = isoOf(view.y, view.m, d);
              const ok = allowed(iso);
              return (
                <button
                  type="button"
                  key={iso}
                  className={`cal-day${iso === value ? ' on' : ''}${iso === today ? ' today' : ''}`}
                  disabled={!ok}
                  onClick={() => onPick(iso)}
                  aria-label={prettyDate(iso, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                  aria-pressed={iso === value}
                  data-testid={`cal-day-${iso}`}
                >
                  {d}
                </button>
              );
            })}
          </div>
        )}
        {clearable && value && (
          <button type="button" className="btn btn-block btn-ghost" onClick={() => onPick('')} data-testid="cal-clear">
            Clear date
          </button>
        )}
      </div>
    </Sheet>
  );
}

export default function DateInput({ value = '', onChange, min, max, required, placeholder = 'Select date', title, quick, className = '', disabled, 'data-testid': testId, 'aria-label': ariaLabel, ...rest }) {
  const [open, setOpen] = useState(false);
  const fieldLabel = useContext(FieldLabel);
  const emit = (v) => onChange?.({ target: { value: v } });
  return (
    <span className={`date-input ${className.replace(/\binput\b/, '')}`}>
      <button type="button" className={`input date-btn ${value ? '' : 'placeholder'}`} onClick={() => setOpen(true)} disabled={disabled} aria-label={ariaLabel ? `${ariaLabel}: ${value ? prettyDate(value) : placeholder}` : undefined} data-testid={testId ? `${testId}-button` : undefined}>
        <Icon name="calendar" size={17} />
        <span>{value ? prettyDate(value) : placeholder}</span>
      </button>
      {/* The real field: keeps the value in forms (required, min, max) and for tests. Not tappable. */}
      <input type="date" className="date-native" tabIndex={-1} aria-hidden="true" value={value || ''} min={min} max={max} required={required} disabled={disabled} onChange={(e) => onChange?.(e)} data-testid={testId} {...rest} />
      {open && (
        <CalendarSheet
          title={title || ariaLabel || fieldLabel || placeholder}
          value={value}
          min={min}
          max={max}
          clearable={!required}
          quick={quick}
          onClose={() => setOpen(false)}
          onPick={(v) => {
            setOpen(false);
            emit(v);
          }}
          testId={testId ? `${testId}-sheet` : 'calendar-sheet'}
        />
      )}
    </span>
  );
}
