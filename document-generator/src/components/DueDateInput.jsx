import { DUE_TERMS, addDays, dueTermOf } from '../utils/dates.js';

const termLabel = (d) => (d === 0 ? 'On receipt' : `${d} days`);

/**
 * Due date with a "Due in" choice: picking 7 / 15 / 30 … days sets the date from the document date;
 * picking a date shows "Custom". Shared by the desktop and phone editors.
 */
export default function DueDateInput({ issue, value, onChange }) {
  const term = dueTermOf(issue, value);
  const choice = value ? (DUE_TERMS.includes(term) ? String(term) : 'custom') : '';
  return (
    <div className="due-input">
      <select
        className="input"
        value={choice}
        onChange={(e) => {
          const v = e.target.value;
          if (v === '') onChange('');
          else if (v !== 'custom') onChange(addDays(issue, Number(v)));
        }}
        aria-label="Due in"
        data-testid="doc-due-term"
      >
        <option value="">No due date</option>
        {DUE_TERMS.map((d) => (
          <option key={d} value={String(d)}>
            {termLabel(d)}
          </option>
        ))}
        {choice === 'custom' && <option value="custom">{term > 0 ? `${term} days` : 'Custom'}</option>}
      </select>
      <input className="input" type="date" value={value || ''} onChange={(e) => onChange(e.target.value)} aria-label="Due date" data-testid="doc-due" />
    </div>
  );
}
