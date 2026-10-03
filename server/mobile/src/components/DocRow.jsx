import Icon from './Icon.jsx';
import { go } from './ui.jsx';
import { STATUS_LABELS, money, shortDate, typeOf } from '../lib/docs.js';
import { typeIcon } from './TypeChooser.jsx';

export default function DocRow({ doc }) {
  const type = typeOf(doc.type);
  return (
    <button className="list-item" onClick={() => go(`/doc/${doc.id}`)} data-testid={`doc-${doc.number}`}>
      <span className="avatar">
        <Icon name={typeIcon(doc.type)} size={19} />
      </span>
      <span className="list-main">
        <strong>{doc.party?.name || '—'}</strong>
        <span className="small muted">
          {doc.number} · {type.short} · {shortDate(doc.date)}
        </span>
      </span>
      <span className="list-end">
        {type.prices !== false && <strong>{money(doc.totals?.grand_total)}</strong>}
        <span className={`pill ${doc.status}`}>{STATUS_LABELS[doc.status] || doc.status}</span>
      </span>
    </button>
  );
}
