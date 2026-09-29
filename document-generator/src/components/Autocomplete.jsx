import { useEffect, useId, useRef, useState } from 'react';
import { advance } from '../utils/keynav.js';

/**
 * Text input with an async suggestion list (keyboard friendly).
 *
 * @param {{
 *   value: string,
 *   onChange: (v: string) => void,
 *   fetchOptions: (q: string) => Promise<any[]>,
 *   onSelect: (option: any) => void,
 *   renderOption: (option: any) => any,
 *   placeholder?: string,
 *   minChars?: number,
 *   className?: string,
 *   inputProps?: Object,
 * }} props
 */
export default function Autocomplete({
  value,
  onChange,
  fetchOptions,
  onSelect,
  renderOption,
  placeholder,
  minChars = 1,
  className = '',
  inputProps = {},
}) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState([]);
  const [active, setActive] = useState(0);
  const focused = useRef(false);
  const listId = useId();
  const seq = useRef(0);
  /** Value set by choosing an option: must not trigger a new search (that re-opened the list). */
  const chosen = useRef(null);

  useEffect(() => {
    if (!focused.current) return undefined;
    if (chosen.current !== null && value === chosen.current) return undefined;
    chosen.current = null;
    const q = (value || '').trim();
    if (q.length < minChars) {
      setOptions([]);
      return undefined;
    }
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      try {
        const result = await fetchOptions(q);
        if (mine === seq.current) {
          setOptions(result);
          // Nothing highlighted, so Enter keeps what was typed — unless it matches a suggestion exactly.
          setActive(result.findIndex((o) => String(o.name || '').trim().toLowerCase() === q.toLowerCase()));
          setOpen(result.length > 0);
        }
      } catch {
        setOptions([]);
      }
    }, 150);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, minChars]);

  const input = useRef(null);
  /** @param {boolean} [byKeyboard] Enter moves on to the next field of the form (utils/keynav.js). */
  const choose = (opt, byKeyboard = false) => {
    seq.current += 1; // ignore any search still in flight
    setOpen(false);
    setOptions([]);
    chosen.current = opt?.name ?? null;
    onSelect(opt);
    if (byKeyboard && input.current) setTimeout(() => advance(input.current), 0);
  };

  const onKeyDown = (e) => {
    if (!open || options.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(options.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(-1, a - 1));
    } else if (e.key === 'Enter') {
      if (active < 0) {
        // Keep the typed text; form navigation moves to the next field.
        setOpen(false);
        return;
      }
      e.preventDefault();
      choose(options[active], true);
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      setOpen(false);
    }
  };

  return (
    <div className={`autocomplete ${className}`}>
      <input
        ref={input}
        className="input"
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => {
          focused.current = true;
          if (options.length) setOpen(true);
        }}
        onBlur={() => {
          focused.current = false;
          setTimeout(() => setOpen(false), 150);
        }}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        {...inputProps}
      />
      {open && options.length > 0 && (
        <ul className="autocomplete-list" id={listId} role="listbox">
          {options.map((opt, i) => (
            <li
              key={opt.id ?? i}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'active' : ''}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(opt);
              }}
              onMouseEnter={() => setActive(i)}
            >
              {renderOption(opt)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
