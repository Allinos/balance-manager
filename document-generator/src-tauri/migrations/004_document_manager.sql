-- Document Manager: folders, uploaded (external) documents stored inside the
-- database (so backups contain everything), document history/audit trail,
-- per-document template, cancellation details and license state.
--
-- The documents table is rebuilt to drop the fixed status CHECK constraint:
-- statuses are now defined per document type in the app (validated in Rust).
-- Runs with foreign_keys OFF (see db::migrate), following SQLite's
-- documented table-rebuild procedure.

CREATE TABLE folders (
    id          INTEGER PRIMARY KEY,
    name        TEXT NOT NULL COLLATE NOCASE UNIQUE,
    color       TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE documents_new (
    id                    INTEGER PRIMARY KEY,
    document_type         TEXT NOT NULL,
    document_number       TEXT NOT NULL,
    status                TEXT NOT NULL DEFAULT 'DRAFT',
    party_id              INTEGER REFERENCES parties(id) ON DELETE SET NULL,
    party_name            TEXT NOT NULL DEFAULT '',
    party_company         TEXT NOT NULL DEFAULT '',
    party_address         TEXT NOT NULL DEFAULT '',
    party_phone           TEXT NOT NULL DEFAULT '',
    party_email           TEXT NOT NULL DEFAULT '',
    party_gstin           TEXT NOT NULL DEFAULT '',
    party_tax_id          TEXT NOT NULL DEFAULT '',
    party_state           TEXT NOT NULL DEFAULT '',
    shipping_address      TEXT NOT NULL DEFAULT '',
    place_of_supply       TEXT NOT NULL DEFAULT '',
    reference             TEXT NOT NULL DEFAULT '',
    issue_date            TEXT NOT NULL,
    due_date              TEXT NOT NULL DEFAULT '',
    currency              TEXT NOT NULL DEFAULT 'INR',
    currency_symbol       TEXT NOT NULL DEFAULT '₹',
    currency_decimals     INTEGER NOT NULL DEFAULT 2,
    exchange_rate         TEXT NOT NULL DEFAULT '1',
    tax_mode              TEXT NOT NULL DEFAULT 'INTRA'
                          CHECK (tax_mode IN ('INTRA', 'INTER', 'SIMPLE', 'NONE')),
    tax_label             TEXT NOT NULL DEFAULT 'GST',
    subtotal              TEXT NOT NULL DEFAULT '0',
    discount              TEXT NOT NULL DEFAULT '0',
    taxable               TEXT NOT NULL DEFAULT '0',
    tax                   TEXT NOT NULL DEFAULT '0',
    cgst                  TEXT NOT NULL DEFAULT '0',
    sgst                  TEXT NOT NULL DEFAULT '0',
    igst                  TEXT NOT NULL DEFAULT '0',
    shipping              TEXT NOT NULL DEFAULT '0',
    other_charges         TEXT NOT NULL DEFAULT '0',
    other_charges_label   TEXT NOT NULL DEFAULT '',
    round_off             TEXT NOT NULL DEFAULT '0',
    grand_total           TEXT NOT NULL DEFAULT '0',
    notes                 TEXT NOT NULL DEFAULT '',
    terms                 TEXT NOT NULL DEFAULT '',
    meta                  TEXT NOT NULL DEFAULT '{}',
    parent_document_id    INTEGER REFERENCES documents(id) ON DELETE SET NULL,
    folder_id             INTEGER REFERENCES folders(id) ON DELETE SET NULL,
    template              TEXT NOT NULL DEFAULT '',
    cancelled_at          TEXT,
    cancel_reason         TEXT NOT NULL DEFAULT '',
    is_demo               INTEGER NOT NULL DEFAULT 0,
    issued_at             TEXT,
    deleted_at            TEXT,
    created_at            TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at            TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

INSERT INTO documents_new (
    id, document_type, document_number, status, party_id, party_name, party_company, party_address, party_phone,
    party_email, party_gstin, party_tax_id, party_state, shipping_address, place_of_supply, reference, issue_date,
    due_date, currency, currency_symbol, currency_decimals, exchange_rate, tax_mode, tax_label, subtotal, discount,
    taxable, tax, cgst, sgst, igst, shipping, other_charges, other_charges_label, round_off, grand_total, notes,
    terms, meta, parent_document_id, is_demo, issued_at, deleted_at, created_at, updated_at
)
SELECT
    id, document_type, document_number, status, party_id, party_name, party_company, party_address, party_phone,
    party_email, party_gstin, party_tax_id, party_state, shipping_address, place_of_supply, reference, issue_date,
    due_date, currency, currency_symbol, currency_decimals, exchange_rate, tax_mode, tax_label, subtotal, discount,
    taxable, tax, cgst, sgst, igst, shipping, other_charges, other_charges_label, round_off, grand_total, notes,
    terms, meta, parent_document_id, is_demo, issued_at, deleted_at, created_at, updated_at
FROM documents;

DROP TABLE documents;
ALTER TABLE documents_new RENAME TO documents;

CREATE UNIQUE INDEX ux_documents_number
    ON documents(document_type, document_number) WHERE deleted_at IS NULL;
CREATE INDEX idx_documents_type ON documents(document_type);
CREATE INDEX idx_documents_issue_date ON documents(issue_date);
CREATE INDEX idx_documents_status ON documents(status);
CREATE INDEX idx_documents_party_name ON documents(party_name COLLATE NOCASE);
CREATE INDEX idx_documents_parent ON documents(parent_document_id);
CREATE INDEX idx_documents_folder ON documents(folder_id);
CREATE INDEX idx_documents_list ON documents(deleted_at, issue_date DESC, id DESC);

CREATE TABLE file_blobs (
    sha256  TEXT PRIMARY KEY,
    size    INTEGER NOT NULL,
    data    BLOB NOT NULL
);

CREATE TABLE external_documents (
    id             INTEGER PRIMARY KEY,
    name           TEXT NOT NULL,
    original_name  TEXT NOT NULL,
    extension      TEXT NOT NULL DEFAULT '',
    mime           TEXT NOT NULL DEFAULT 'application/octet-stream',
    size           INTEGER NOT NULL,
    sha256         TEXT NOT NULL REFERENCES file_blobs(sha256),
    folder_id      INTEGER REFERENCES folders(id) ON DELETE SET NULL,
    notes          TEXT NOT NULL DEFAULT '',
    deleted_at     TEXT,
    created_at     TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at     TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
CREATE INDEX idx_external_folder ON external_documents(folder_id, deleted_at);
CREATE INDEX idx_external_name ON external_documents(name COLLATE NOCASE);
CREATE INDEX idx_external_sha ON external_documents(sha256);

CREATE TABLE document_history (
    id           INTEGER PRIMARY KEY,
    document_id  INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    action       TEXT NOT NULL,
    from_status  TEXT NOT NULL DEFAULT '',
    to_status    TEXT NOT NULL DEFAULT '',
    note         TEXT NOT NULL DEFAULT '',
    created_at   TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
CREATE INDEX idx_document_history_doc ON document_history(document_id, id);

-- Existing documents get a "created" entry so every document has a history.
INSERT INTO document_history (document_id, action, to_status, created_at)
SELECT id, 'CREATED', status, created_at FROM documents;

CREATE TABLE license_state (
    key    TEXT PRIMARY KEY,
    value  TEXT NOT NULL
);
