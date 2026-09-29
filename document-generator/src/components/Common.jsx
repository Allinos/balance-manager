import Icon from './Icon.jsx';
import { STATUS_LABELS, statusLabel } from '../config/documentTypes.js';

export function StatusBadge({ status, deleted, type }) {
  if (deleted) return <span className="badge badge-deleted">Deleted</span>;
  const label = type ? statusLabel(type, status) : STATUS_LABELS[status] || status;
  return <span className={`badge badge-${(status || 'DRAFT').toLowerCase()}`}>{label}</span>;
}

export function EmptyState({ icon = 'documents', title, message, action }) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon name={icon} size={28} />
      </div>
      <h3>{title}</h3>
      {message && <p>{message}</p>}
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, back }) {
  return (
    <div className="page-header">
      <div className="page-title">
        {back}
        <div>
          <h1>{title}</h1>
          {subtitle && <p className="muted">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

export function Spinner({ label = 'Loading…' }) {
  return (
    <div className="spinner-wrap" role="status">
      <span className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

/** Dropdown menu button. */
export function Menu({ label, icon = 'more', items, align = 'right', className = 'btn' }) {
  return (
    <details
      className={`menu menu-${align}`}
      onToggle={(e) => {
        // Open upwards when there is not enough room below (e.g. last table rows).
        const el = e.currentTarget;
        if (el.open) el.classList.toggle('menu-up', el.getBoundingClientRect().bottom + 280 > window.innerHeight);
      }}
    >
      <summary className={className}>
        <Icon name={icon} />
        {label && <span>{label}</span>}
      </summary>
      <div className="menu-list" onClick={(e) => e.currentTarget.parentElement.removeAttribute('open')}>
        {items
          .filter(Boolean)
          .map((it) =>
            it.divider ? (
              <hr key={it.key} />
            ) : (
              <button key={it.label} className={`menu-item ${it.danger ? 'danger' : ''}`} onClick={it.onClick} disabled={it.disabled}>
                {it.icon && <Icon name={it.icon} size={16} />}
                <span>{it.label}</span>
              </button>
            ),
          )}
      </div>
    </details>
  );
}
