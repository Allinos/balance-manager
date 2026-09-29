/**
 * Searchable select for long lists (states, units, categories, customers,
 * vendors, products, brands…).
 *
 * - Opening shows the first 10 options (recently used ones first).
 * - With more than `searchThreshold` options (or when options are loaded from
 *   the database) a search box appears; results are limited to keep it fast.
 * - `creatable` lets the user keep a value that is not in the list.
 * - Full keyboard support: ↑/↓, Enter, Esc, type to search.
 *
 * @typedef {{value: string, label?: string, hint?: string, data?: any}} Option
 * @typedef {{group: string, options: Array<string|Option>}} OptionGroup
 *
 * @param {{
 *   value: string,
 *   onChange: (value: string, option?: Option) => void,
 *   options?: Array<string|Option|OptionGroup>,
 *   loadOptions?: (query: string) => Promise<Option[]>,
 *   placeholder?: string,
 *   creatable?: boolean,
 *   searchThreshold?: number,
 *   maxVisible?: number,
 *   recentKey?: string,
 *   disabled?: boolean,
 *   emptyLabel?: string,
 *   className?: string,
 *   testId?: string,
 *   ariaLabel?: string,
 *   clearable?: boolean,
 * }} props
 */

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import Icon from './Icon.jsx';

const toOption = (o) => (typeof o === 'string' ? { value: o, label: o } : { label: o.value, ...o });

function flatten(options = []) {
  const out = [];
  for (const o of options) {
    if (o && typeof o === 'object' && Array.isArray(o.options)) {
      for (const x of o.options) out.push({ ...toOption(x), group: o.group });
    } else if (o !== null && o !== undefined) {
      out.push(toOption(o));
    }
  }
  return out;
}

function readRecent(key) {
  if (!key) return [];
  try {
    return JSON.parse(localStorage.getItem(`docgen.recent.${key}`) || '[]');
  } catch {
    return [];
  }
}

function pushRecent(key, value) {
  if (!key || !value) return;
  try {
    const list = [value, ...readRecent(key).filter((v) => v !== value)].slice(0, 5);
    localStorage.setItem(`docgen.recent.${key}`, JSON.stringify(list));
  } catch {
    /* storage unavailable */
  }
}

export default function SearchSelect({
  value,
  onChange,
  options,
  loadOptions,
  placeholder = 'Select…',
  creatable = false,
  searchThreshold = 10,
  maxVisible = 10,
  recentKey,
  disabled = false,
  emptyLabel = 'No matches',
  className = '',
  testId,
  ariaLabel,
  clearable = false,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [remote, setRemote] = useState([]);
  const [loading, setLoading] = useState(false);
  const root = useRef(null);
  const searchRef = useRef(null);
  const listId = useId();

  const all = useMemo(() => flatten(options), [options]);
  const showSearch = !!loadOptions || creatable || all.length > searchThreshold;
  const selected = all.find((o) => o.value === value) || (value ? { value, label: value } : null);

  // Async options (products, customers…) are loaded as the user types.
  useEffect(() => {
    if (!open || !loadOptions) return undefined;
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const result = await loadOptions(query.trim());
        if (!cancelled) setRemote(result.map(toOption));
      } catch {
        if (!cancelled) setRemote([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [open, query, loadOptions]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list;
    if (loadOptions) list = remote;
    else if (q) {
      list = all.filter((o) => `${o.label} ${o.hint || ''} ${o.value}`.toLowerCase().includes(q));
      // Prefix matches first.
      list.sort((a, b) => Number(!a.label.toLowerCase().startsWith(q)) - Number(!b.label.toLowerCase().startsWith(q)));
    } else {
      const recent = readRecent(recentKey);
      const recentOpts = recent.map((v) => all.find((o) => o.value === v)).filter(Boolean).map((o) => ({ ...o, group: 'Recent' }));
      list = [...recentOpts, ...all.filter((o) => !recent.includes(o.value))];
    }
    const limit = q ? Math.max(maxVisible, 30) : maxVisible;
    const shown = list.slice(0, limit);
    if (creatable && q && !all.some((o) => o.label.toLowerCase() === q) && !shown.some((o) => o.label.toLowerCase() === q)) {
      shown.push({ value: query.trim(), label: `Use “${query.trim()}”`, create: true });
    }
    return { items: shown, more: Math.max(0, list.length - shown.length) };
  }, [all, remote, query, loadOptions, maxVisible, creatable, recentKey]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (root.current && !root.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  useEffect(() => {
    if (open) {
      setActive(0);
      setTimeout(() => searchRef.current?.focus(), 0);
    } else {
      setQuery('');
    }
  }, [open]);

  const choose = (opt) => {
    pushRecent(recentKey, opt.value);
    onChange(opt.value, opt.create ? undefined : opt);
    setOpen(false);
    root.current?.querySelector('.ss-control')?.focus();
  };

  const onKeyDown = (e) => {
    if (!open && ['ArrowDown', 'Enter', ' '].includes(e.key) && e.target.classList.contains('ss-control')) {
      e.preventDefault();
      setOpen(true);
      return;
    }
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(visible.items.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (visible.items[active]) choose(visible.items[active]);
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      setOpen(false);
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  let lastGroup = null;
  return (
    <div className={`ss ${open ? 'open' : ''} ${className}`} ref={root} onKeyDown={onKeyDown}>
      <button
        type="button"
        className="input ss-control"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        data-testid={testId}
      >
        <span className={selected ? 'ss-value' : 'ss-placeholder'}>{selected ? selected.label : placeholder}</span>
        {clearable && selected ? (
          <span
            className="ss-clear"
            role="button"
            aria-label="Clear"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onChange('', undefined);
            }}
          >
            <Icon name="x" size={13} />
          </span>
        ) : (
          <Icon name="chevronDown" size={14} className="ss-chevron" />
        )}
      </button>
      {open && (
        <div className="ss-pop" role="presentation">
          {showSearch && (
            <div className="ss-search">
              <Icon name="search" size={14} />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                placeholder={creatable ? 'Search or type a new value…' : 'Search…'}
                aria-label="Search options"
                data-testid={testId ? `${testId}-search` : undefined}
              />
            </div>
          )}
          <ul className="ss-list" id={listId} role="listbox">
            {loading && visible.items.length === 0 && <li className="ss-empty">Searching…</li>}
            {!loading && visible.items.length === 0 && <li className="ss-empty">{emptyLabel}</li>}
            {visible.items.map((o, i) => {
              const header = o.group && o.group !== lastGroup ? o.group : null;
              lastGroup = o.group || lastGroup;
              return [
                header && (
                  <li key={`g-${header}-${i}`} className="ss-group" role="presentation">
                    {header}
                  </li>
                ),
                <li
                  key={`${o.value}-${i}`}
                  role="option"
                  aria-selected={o.value === value}
                  className={`ss-option ${i === active ? 'active' : ''} ${o.value === value ? 'selected' : ''} ${o.create ? 'create' : ''}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choose(o);
                  }}
                  onMouseEnter={() => setActive(i)}
                >
                  <span className="ss-label">{o.label}</span>
                  {o.hint && <small className="ss-hint">{o.hint}</small>}
                  {o.value === value && <Icon name="check" size={14} className="ss-check" />}
                </li>,
              ];
            })}
            {visible.more > 0 && <li className="ss-more">{query ? `${visible.more} more — refine your search` : `${visible.more} more — type to search`}</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
