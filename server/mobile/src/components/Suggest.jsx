import { useMemo, useState } from 'react';

/** Text input with suggestions from saved records (customers, products). */
export default function Suggest({ value, onChange, onPick, items, render, placeholder, testid, ...rest }) {
  const [open, setOpen] = useState(false);
  const term = (value || '').trim().toLowerCase();
  const matches = useMemo(
    () => (term.length < 1 ? [] : items.filter((i) => i.nameLower?.includes(term) && i.nameLower !== term).slice(0, 6)),
    [items, term],
  );
  return (
    <div className="suggest">
      <input
        className="input"
        value={value ?? ''}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        autoComplete="off"
        data-testid={testid}
        {...rest}
      />
      {open && matches.length > 0 && (
        <div className="suggest-list">
          {matches.map((m) => (
            <button
              key={m.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onPick(m);
                setOpen(false);
              }}
            >
              {render(m)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
