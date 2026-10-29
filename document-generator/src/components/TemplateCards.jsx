import { FEATURED_TEMPLATES, MORE_TEMPLATES } from '../config/documentTypes.js';

/**
 * Template choice: the four featured templates, then "More templates" (GST, B2B, retail…).
 * The page shows a live preview of the chosen template next to it, so it can be seen before saving.
 */
export default function TemplateCards({ value, onChange, testPrefix = 'settings-template', optionClass = 'style-option', compact = false }) {
  const card = (t) => (
    <button type="button" key={t.id} className={`${optionClass} ${value === t.id ? 'active' : ''}`} onClick={() => onChange(t.id)} data-testid={`${testPrefix}-${t.id}`}>
      <strong>
        {t.label} <span className="template-kind">{t.kind}</span>
      </strong>
      <span className="muted small">{t.description}</span>
    </button>
  );
  return (
    <div className="template-cards">
      <div className={`template-options ${compact ? 'compact' : ''}`}>{FEATURED_TEMPLATES.map(card)}</div>
      <div className="template-more-label">More templates</div>
      <div className={`template-options ${compact ? 'compact' : ''}`} data-testid="more-templates">
        {MORE_TEMPLATES.map(card)}
      </div>
    </div>
  );
}

/** Native select with featured and more templates in two groups (document screen). */
export function TemplateSelect({ value, onChange, ...rest }) {
  return (
    <select className="input input-sm" value={value} onChange={(e) => onChange(e.target.value)} {...rest}>
      <optgroup label="Featured">
        {FEATURED_TEMPLATES.map((t) => (
          <option key={t.id} value={t.id}>
            {t.label}
          </option>
        ))}
      </optgroup>
      <optgroup label="More templates">
        {MORE_TEMPLATES.map((t) => (
          <option key={t.id} value={t.id}>
            {t.label} ({t.kind})
          </option>
        ))}
      </optgroup>
    </select>
  );
}
