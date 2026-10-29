-- Payments & ledger: each customer's / vendor's documents are read by party (ledger, balances).
-- Only an index is added; no data is changed.
CREATE INDEX IF NOT EXISTS idx_documents_party ON documents(party_id, deleted_at, issue_date);
