-- Customers & Vendors: each saved party is a customer, a vendor or both, and can be archived.
-- Archiving hides a party from lists and suggestions; documents keep their own copy of the
-- party's details (party_name, party_address …), so no invoice, receipt or history changes.

ALTER TABLE parties ADD COLUMN kind TEXT NOT NULL DEFAULT 'customer';
ALTER TABLE parties ADD COLUMN notes TEXT NOT NULL DEFAULT '';
ALTER TABLE parties ADD COLUMN archived_at TEXT;

-- Existing parties: vendors are those used on purchase-side documents, "both" when used on both sides.
UPDATE parties SET kind = 'vendor'
 WHERE id IN (SELECT party_id FROM documents WHERE party_id IS NOT NULL AND document_type IN
              ('REVERSE_QUOTATION', 'PURCHASE_ORDER', 'GOODS_RECEIPT', 'PURCHASE_INVOICE', 'PAYMENT_VOUCHER', 'WORK_ORDER'));
UPDATE parties SET kind = 'both'
 WHERE kind = 'vendor'
   AND id IN (SELECT party_id FROM documents WHERE party_id IS NOT NULL AND document_type NOT IN
              ('REVERSE_QUOTATION', 'PURCHASE_ORDER', 'GOODS_RECEIPT', 'PURCHASE_INVOICE', 'PAYMENT_VOUCHER', 'WORK_ORDER'));

CREATE INDEX idx_parties_kind ON parties(kind, archived_at);
