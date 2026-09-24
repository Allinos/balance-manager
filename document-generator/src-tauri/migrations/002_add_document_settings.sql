-- Per document-type settings (title, visibility toggles, default terms...).
-- Stored as JSON so new options never need a schema change.
CREATE TABLE document_settings (
    doc_type    TEXT PRIMARY KEY,
    settings    TEXT NOT NULL DEFAULT '{}',
    updated_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
