import Icon from './Icon.jsx';
import { Sheet, go } from './ui.jsx';
import { TYPES } from '../lib/docs.js';

const ICONS = { TAX_INVOICE: 'invoice', QUOTATION: 'quote', PROFORMA_INVOICE: 'invoice', ESTIMATE: 'calculator', DELIVERY_CHALLAN: 'truck', BILL_OF_SUPPLY: 'invoice', CREDIT_NOTE: 'docs', PURCHASE_ORDER: 'box' };
export const typeIcon = (id) => ICONS[id] || 'docs';

/** "New document" bottom sheet. */
export default function TypeChooser({ onClose }) {
  return (
    <Sheet title="New document" onClose={onClose}>
      <div className="type-grid" data-testid="type-chooser">
        {TYPES.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              onClose();
              go(`/doc/new/${t.id}`);
            }}
            data-testid={`new-${t.id}`}
          >
            <span className="avatar">
              <Icon name={typeIcon(t.id)} size={19} />
            </span>
            {t.label}
          </button>
        ))}
      </div>
    </Sheet>
  );
}
