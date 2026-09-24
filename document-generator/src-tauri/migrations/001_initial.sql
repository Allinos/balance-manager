-- DocGen initial schema.
-- Money/quantity values are stored as exact decimal TEXT (e.g. '1180.00') and
-- are only ever calculated with the deterministic decimal engine in the UI.

CREATE TABLE companies (
    id              INTEGER PRIMARY KEY,
    name            TEXT NOT NULL DEFAULT '',
    legal_name      TEXT NOT NULL DEFAULT '',
    trade_name      TEXT NOT NULL DEFAULT '',
    address         TEXT NOT NULL DEFAULT '',
    city            TEXT NOT NULL DEFAULT '',
    state           TEXT NOT NULL DEFAULT '',
    state_code      TEXT NOT NULL DEFAULT '',
    pin             TEXT NOT NULL DEFAULT '',
    country         TEXT NOT NULL DEFAULT 'India',
    phone           TEXT NOT NULL DEFAULT '',
    email           TEXT NOT NULL DEFAULT '',
    website         TEXT NOT NULL DEFAULT '',
    gstin           TEXT NOT NULL DEFAULT '',
    pan             TEXT NOT NULL DEFAULT '',
    vat_number      TEXT NOT NULL DEFAULT '',
    logo            TEXT NOT NULL DEFAULT '',
    stamp           TEXT NOT NULL DEFAULT '',
    signature       TEXT NOT NULL DEFAULT '',
    bank_name       TEXT NOT NULL DEFAULT '',
    account_holder  TEXT NOT NULL DEFAULT '',
    account_number  TEXT NOT NULL DEFAULT '',
    ifsc            TEXT NOT NULL DEFAULT '',
    swift           TEXT NOT NULL DEFAULT '',
    iban            TEXT NOT NULL DEFAULT '',
    branch          TEXT NOT NULL DEFAULT '',
    upi_id          TEXT NOT NULL DEFAULT '',
    currency        TEXT NOT NULL DEFAULT 'INR',
    created_at      TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE categories (
    id          INTEGER PRIMARY KEY,
    name        TEXT NOT NULL COLLATE NOCASE UNIQUE,
    is_demo     INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE products (
    id              INTEGER PRIMARY KEY,
    type            TEXT NOT NULL DEFAULT 'PRODUCT' CHECK (type IN ('PRODUCT', 'SERVICE')),
    name            TEXT NOT NULL,
    sku             TEXT NOT NULL DEFAULT '',
    category_id     INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    description     TEXT NOT NULL DEFAULT '',
    hsn_sac         TEXT NOT NULL DEFAULT '',
    unit            TEXT NOT NULL DEFAULT 'Nos',
    selling_price   TEXT NOT NULL DEFAULT '0',
    purchase_price  TEXT NOT NULL DEFAULT '0',
    tax_rate        TEXT NOT NULL DEFAULT '0',
    tax_type        TEXT NOT NULL DEFAULT 'EXCLUSIVE' CHECK (tax_type IN ('EXCLUSIVE', 'INCLUSIVE', 'EXEMPT')),
    barcode         TEXT NOT NULL DEFAULT '',
    notes           TEXT NOT NULL DEFAULT '',
    is_demo         INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
CREATE INDEX idx_products_name ON products(name COLLATE NOCASE);
CREATE INDEX idx_products_category ON products(category_id);

CREATE TABLE parties (
    id                INTEGER PRIMARY KEY,
    name              TEXT NOT NULL,
    company_name      TEXT NOT NULL DEFAULT '',
    phone             TEXT NOT NULL DEFAULT '',
    email             TEXT NOT NULL DEFAULT '',
    address           TEXT NOT NULL DEFAULT '',
    shipping_address  TEXT NOT NULL DEFAULT '',
    state             TEXT NOT NULL DEFAULT '',
    gstin             TEXT NOT NULL DEFAULT '',
    tax_id            TEXT NOT NULL DEFAULT '',
    is_demo           INTEGER NOT NULL DEFAULT 0,
    created_at        TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at        TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
CREATE INDEX idx_parties_name ON parties(name COLLATE NOCASE);

CREATE TABLE documents (
    id                    INTEGER PRIMARY KEY,
    document_type         TEXT NOT NULL,
    document_number       TEXT NOT NULL,
    status                TEXT NOT NULL DEFAULT 'DRAFT'
                          CHECK (status IN ('DRAFT', 'ISSUED', 'PAID', 'CANCELLED', 'VOID')),
    party_id              INTEGER REFERENCES parties(id) ON DELETE SET NULL,
    -- Party snapshot: a document keeps exactly what was printed on it.
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
    is_demo               INTEGER NOT NULL DEFAULT 0,
    issued_at             TEXT,
    deleted_at            TEXT,
    created_at            TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at            TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
CREATE UNIQUE INDEX ux_documents_number
    ON documents(document_type, document_number) WHERE deleted_at IS NULL;
CREATE INDEX idx_documents_type ON documents(document_type);
CREATE INDEX idx_documents_issue_date ON documents(issue_date);
CREATE INDEX idx_documents_status ON documents(status);
CREATE INDEX idx_documents_party_name ON documents(party_name COLLATE NOCASE);
CREATE INDEX idx_documents_parent ON documents(parent_document_id);

CREATE TABLE document_items (
    id               INTEGER PRIMARY KEY,
    document_id      INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    position         INTEGER NOT NULL DEFAULT 0,
    product_id       INTEGER REFERENCES products(id) ON DELETE SET NULL,
    name             TEXT NOT NULL DEFAULT '',
    description      TEXT NOT NULL DEFAULT '',
    hsn_sac          TEXT NOT NULL DEFAULT '',
    quantity         TEXT NOT NULL DEFAULT '1',
    unit             TEXT NOT NULL DEFAULT '',
    unit_price       TEXT NOT NULL DEFAULT '0',
    discount_value   TEXT NOT NULL DEFAULT '0',
    discount_type    TEXT NOT NULL DEFAULT 'PERCENT' CHECK (discount_type IN ('PERCENT', 'AMOUNT')),
    discount_amount  TEXT NOT NULL DEFAULT '0',
    tax_rate         TEXT NOT NULL DEFAULT '0',
    taxable_amount   TEXT NOT NULL DEFAULT '0',
    tax_amount       TEXT NOT NULL DEFAULT '0',
    cgst_amount      TEXT NOT NULL DEFAULT '0',
    sgst_amount      TEXT NOT NULL DEFAULT '0',
    igst_amount      TEXT NOT NULL DEFAULT '0',
    total_amount     TEXT NOT NULL DEFAULT '0',
    package_info     TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_document_items_document ON document_items(document_id);
CREATE INDEX idx_document_items_name ON document_items(name COLLATE NOCASE);

CREATE TABLE tax_breakdowns (
    id              INTEGER PRIMARY KEY,
    document_id     INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    tax_rate        TEXT NOT NULL,
    taxable_amount  TEXT NOT NULL DEFAULT '0',
    cgst            TEXT NOT NULL DEFAULT '0',
    sgst            TEXT NOT NULL DEFAULT '0',
    igst            TEXT NOT NULL DEFAULT '0',
    tax_amount      TEXT NOT NULL DEFAULT '0'
);
CREATE INDEX idx_tax_breakdowns_document ON tax_breakdowns(document_id);

CREATE TABLE document_sequences (
    doc_type      TEXT PRIMARY KEY,
    prefix        TEXT NOT NULL,
    next_number   INTEGER NOT NULL DEFAULT 1,
    start_number  INTEGER NOT NULL DEFAULT 1,
    padding       INTEGER NOT NULL DEFAULT 5,
    format        TEXT NOT NULL DEFAULT '{PREFIX}-{NUM}',
    reset_yearly  INTEGER NOT NULL DEFAULT 0,
    last_period   TEXT NOT NULL DEFAULT ''
);

INSERT INTO document_sequences (doc_type, prefix) VALUES
    ('QUOTATION', 'QTN'),
    ('PROFORMA_INVOICE', 'PI'),
    ('SALES_ORDER', 'SO'),
    ('PURCHASE_ORDER', 'PO'),
    ('TAX_INVOICE', 'INV'),
    ('DELIVERY_CHALLAN', 'DC'),
    ('GOODS_RECEIPT', 'GRN'),
    ('CREDIT_NOTE', 'CN'),
    ('DEBIT_NOTE', 'DN'),
    ('PAYMENT_RECEIPT', 'RCT');

CREATE TABLE app_settings (
    key    TEXT PRIMARY KEY,
    value  TEXT NOT NULL
);
