//! Tauri commands exposed to the React frontend.
//!
//! The frontend never receives filesystem access or raw SQL. Each command does
//! one well-defined job with parameterised statements and allow-listed columns.

use crate::db::{
    as_object, get_id, kv_get_all, kv_set_many, log_error, now, query_json, query_one, str_field, upsert,
    AppError, AppResult, Db,
};
use crate::{numbering, remote};
use base64::Engine;
use rusqlite::types::Value as SqlValue;
use rusqlite::TransactionBehavior;
use serde_json::{json, Map, Value};
use std::path::PathBuf;
use tauri::{AppHandle, Manager, State, WebviewWindow};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

const COMPANY_COLUMNS: &[&str] = &[
    "name", "legal_name", "trade_name", "address", "city", "state", "state_code", "pin", "country", "phone",
    "email", "website", "gstin", "pan", "vat_number", "logo", "stamp", "signature", "bank_name", "account_holder",
    "account_number", "ifsc", "swift", "iban", "branch", "upi_id", "currency",
];

const CATEGORY_COLUMNS: &[&str] = &["name", "is_demo"];

const PRODUCT_COLUMNS: &[&str] = &[
    "type", "name", "sku", "category_id", "description", "hsn_sac", "unit", "selling_price", "purchase_price",
    "tax_rate", "tax_type", "barcode", "notes", "is_demo",
];

const PARTY_COLUMNS: &[&str] = &[
    "name", "company_name", "phone", "email", "address", "shipping_address", "state", "gstin", "tax_id", "is_demo",
];

const DOCUMENT_COLUMNS: &[&str] = &[
    "document_type", "document_number", "status", "party_id", "party_name", "party_company", "party_address",
    "party_phone", "party_email", "party_gstin", "party_tax_id", "party_state", "shipping_address",
    "place_of_supply", "reference", "issue_date", "due_date", "currency", "currency_symbol", "currency_decimals",
    "exchange_rate", "tax_mode", "tax_label", "subtotal", "discount", "taxable", "tax", "cgst", "sgst", "igst",
    "shipping", "other_charges", "other_charges_label", "round_off", "grand_total", "notes", "terms", "meta",
    "parent_document_id", "is_demo", "folder_id", "template",
];

const ITEM_COLUMNS: &[&str] = &[
    "document_id", "position", "product_id", "name", "description", "hsn_sac", "quantity", "unit", "unit_price",
    "discount_value", "discount_type", "discount_amount", "tax_rate", "taxable_amount", "tax_amount",
    "cgst_amount", "sgst_amount", "igst_amount", "total_amount", "package_info",
];

const TAX_COLUMNS: &[&str] = &["document_id", "tax_rate", "taxable_amount", "cgst", "sgst", "igst", "tax_amount"];

/// All statuses a document can have. Each document type uses a subset (defined in the UI registry).
const STATUSES: &[&str] = &["DRAFT", "ISSUED", "ACCEPTED", "REJECTED", "PARTIAL", "PAID", "COMPLETED", "CANCELLED", "VOID"];

/// Append an entry to a document's history (audit trail).
fn add_history(conn: &rusqlite::Connection, doc_id: i64, action: &str, from: &str, to: &str, note: &str) -> AppResult<()> {
    let note: String = note.chars().take(500).collect();
    conn.execute(
        "INSERT INTO document_history (document_id, action, from_status, to_status, note, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![doc_id, action, from, to, note, now()],
    )?;
    Ok(())
}

const MAX_IMAGE_BYTES: u64 = 2 * 1024 * 1024;

fn text(v: &str) -> SqlValue {
    SqlValue::Text(v.to_string())
}

fn valid_doc_type(t: &str) -> AppResult<()> {
    if t.is_empty() || t.len() > 40 || !t.chars().all(|c| c.is_ascii_uppercase() || c == '_') {
        return Err(AppError::new("Unknown document type."));
    }
    Ok(())
}

fn require_name(data: &Map<String, Value>, what: &str) -> AppResult<()> {
    if str_field(data, "name").trim().is_empty() {
        return Err(AppError::new(format!("Please enter a {what} name.")));
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Application
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn app_info(app: AppHandle, db: State<'_, Db>) -> Value {
    json!({
        "name": app.package_info().name,
        "version": app.package_info().version.to_string(),
        "platform": std::env::consts::OS,
        "dataFile": db.path.to_string_lossy(),
        "remoteConfigured": !remote::settings().server_url.is_empty(),
        "fileExtensions": crate::files::extensions(),
        "clockOffsetMs": crate::license::clock_offset_ms(),
    })
}

#[tauri::command]
pub fn print_window(window: WebviewWindow) -> AppResult<()> {
    window.print().map_err(|e| {
        log_error("print", &e.to_string());
        AppError::new("The print dialog could not be opened.")
    })
}

/// Open a link in the user's default browser / mail / phone app. Only safe schemes are allowed.
#[tauri::command]
pub fn open_external(app: AppHandle, url: String) -> AppResult<()> {
    let lower = url.to_ascii_lowercase();
    let allowed = remote::is_https(&url) || lower.starts_with("mailto:") || lower.starts_with("tel:");
    if !allowed || url.len() > 2048 {
        return Err(AppError::new("This link cannot be opened."));
    }
    app.opener().open_url(url, None::<&str>).map_err(|e| {
        log_error("open-url", &e.to_string());
        AppError::new("The link could not be opened.")
    })
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn settings_get_all(db: State<'_, Db>) -> AppResult<Map<String, Value>> {
    db.with(|c| kv_get_all(c, "app_settings"))
}

#[tauri::command]
pub fn settings_set(db: State<'_, Db>, values: Map<String, Value>) -> AppResult<()> {
    db.with(|c| kv_set_many(c, "app_settings", &values))
}

#[tauri::command]
pub fn company_get(db: State<'_, Db>) -> AppResult<Option<Value>> {
    db.with(|c| query_one(c, "SELECT * FROM companies ORDER BY id LIMIT 1", &[]))
}

#[tauri::command]
pub fn company_save(db: State<'_, Db>, company: Value) -> AppResult<Value> {
    let data = as_object(&company)?;
    require_name(data, "company")?;
    db.with(|c| {
        let existing: Option<i64> = c
            .query_row("SELECT id FROM companies ORDER BY id LIMIT 1", [], |r| r.get(0))
            .ok();
        let id = upsert(c, "companies", existing, data, COMPANY_COLUMNS, true)?;
        query_one(c, "SELECT * FROM companies WHERE id = ?1", &[SqlValue::Integer(id)])?
            .ok_or_else(|| AppError::new("The company could not be saved."))
    })
}

#[tauri::command]
pub fn doc_settings_get_all(db: State<'_, Db>) -> AppResult<Map<String, Value>> {
    db.with(|c| {
        let rows = query_json(c, "SELECT doc_type, settings FROM document_settings", &[])?;
        let mut out = Map::new();
        for row in rows {
            let key = row["doc_type"].as_str().unwrap_or_default().to_string();
            let val = serde_json::from_str(row["settings"].as_str().unwrap_or("{}")).unwrap_or(json!({}));
            out.insert(key, val);
        }
        Ok(out)
    })
}

#[tauri::command]
pub fn doc_settings_save(db: State<'_, Db>, doc_type: String, settings: Value) -> AppResult<()> {
    valid_doc_type(&doc_type)?;
    if !settings.is_object() {
        return Err(AppError::new("Invalid settings."));
    }
    db.with(|c| {
        c.execute(
            "INSERT INTO document_settings (doc_type, settings, updated_at) VALUES (?1, ?2, ?3)
             ON CONFLICT(doc_type) DO UPDATE SET settings = excluded.settings, updated_at = excluded.updated_at",
            rusqlite::params![doc_type, settings.to_string(), now()],
        )?;
        Ok(())
    })
}

// ---------------------------------------------------------------------------
// Numbering
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn sequences_list(db: State<'_, Db>) -> AppResult<Vec<Value>> {
    db.with(|c| query_json(c, "SELECT * FROM document_sequences ORDER BY doc_type", &[]))
}

#[tauri::command]
pub fn sequence_save(db: State<'_, Db>, sequence: Value) -> AppResult<()> {
    let data = as_object(&sequence)?;
    let doc_type = str_field(data, "doc_type").to_string();
    valid_doc_type(&doc_type)?;
    let prefix = str_field(data, "prefix").trim().to_string();
    let format = str_field(data, "format").trim().to_string();
    if prefix.len() > 20 || format.len() > 60 {
        return Err(AppError::new("The prefix or format is too long."));
    }
    if !format.contains("{NUM}") {
        return Err(AppError::new("The number format must contain {NUM}."));
    }
    let next = data.get("next_number").and_then(|v| v.as_i64()).unwrap_or(1).max(1);
    let start = data.get("start_number").and_then(|v| v.as_i64()).unwrap_or(1).max(1);
    let padding = data.get("padding").and_then(|v| v.as_i64()).unwrap_or(5).clamp(1, 12);
    let reset = data.get("reset_yearly").and_then(|v| v.as_bool()).unwrap_or(false);
    db.with(|c| {
        c.execute(
            "INSERT INTO document_sequences (doc_type, prefix, next_number, start_number, padding, format, reset_yearly)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
             ON CONFLICT(doc_type) DO UPDATE SET prefix = excluded.prefix, next_number = excluded.next_number,
               start_number = excluded.start_number, padding = excluded.padding, format = excluded.format,
               reset_yearly = excluded.reset_yearly",
            rusqlite::params![doc_type, prefix, next, start, padding, format, reset as i64],
        )?;
        Ok(())
    })
}

#[tauri::command]
pub fn sequence_preview(db: State<'_, Db>, doc_type: String, default_prefix: String, date: String) -> AppResult<String> {
    valid_doc_type(&doc_type)?;
    db.with(|c| numbering::preview(c, &doc_type, &default_prefix, &date))
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn categories_list(db: State<'_, Db>) -> AppResult<Vec<Value>> {
    db.with(|c| {
        query_json(
            c,
            "SELECT c.id, c.name, c.is_demo, COUNT(p.id) AS product_count
             FROM categories c LEFT JOIN products p ON p.category_id = c.id
             GROUP BY c.id ORDER BY c.name COLLATE NOCASE",
            &[],
        )
    })
}

#[tauri::command]
pub fn category_save(db: State<'_, Db>, category: Value) -> AppResult<i64> {
    let data = as_object(&category)?;
    require_name(data, "category")?;
    db.with(|c| {
        upsert(c, "categories", get_id(data), data, CATEGORY_COLUMNS, false).map_err(|e| {
            if e.message.contains("already exists") {
                AppError::new("A category with this name already exists.")
            } else {
                e
            }
        })
    })
}

#[tauri::command]
pub fn category_delete(db: State<'_, Db>, id: i64) -> AppResult<()> {
    db.with(|c| {
        c.execute("DELETE FROM categories WHERE id = ?1", [id])?;
        Ok(())
    })
}

// ---------------------------------------------------------------------------
// Products & services
// ---------------------------------------------------------------------------

fn like_pattern(q: &str) -> String {
    let escaped = q.trim().replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_");
    format!("%{escaped}%")
}

#[tauri::command]
pub fn products_list(db: State<'_, Db>, filter: Option<Value>) -> AppResult<Vec<Value>> {
    let filter = filter.unwrap_or(json!({}));
    let search = filter["search"].as_str().unwrap_or("").trim().to_string();
    let category = filter["category_id"].as_i64();
    let kind = filter["type"].as_str().unwrap_or("").to_string();
    let limit = filter["limit"].as_i64().unwrap_or(500).clamp(1, 5000);
    let mut sql = String::from(
        "SELECT p.*, c.name AS category_name FROM products p
         LEFT JOIN categories c ON c.id = p.category_id WHERE 1 = 1",
    );
    let mut params: Vec<SqlValue> = Vec::new();
    if !search.is_empty() {
        sql.push_str(
            " AND (p.name LIKE ? ESCAPE '\\' OR p.sku LIKE ? ESCAPE '\\' OR p.hsn_sac LIKE ? ESCAPE '\\'
               OR p.barcode LIKE ? ESCAPE '\\' OR c.name LIKE ? ESCAPE '\\')",
        );
        let pat = like_pattern(&search);
        for _ in 0..5 {
            params.push(text(&pat));
        }
    }
    if let Some(cat) = category {
        sql.push_str(" AND p.category_id = ?");
        params.push(SqlValue::Integer(cat));
    }
    if kind == "PRODUCT" || kind == "SERVICE" {
        sql.push_str(" AND p.type = ?");
        params.push(text(&kind));
    }
    sql.push_str(" ORDER BY p.name COLLATE NOCASE LIMIT ?");
    params.push(SqlValue::Integer(limit));
    db.with(|c| query_json(c, &sql, &params))
}

#[tauri::command]
pub fn product_save(db: State<'_, Db>, product: Value) -> AppResult<i64> {
    let data = as_object(&product)?;
    require_name(data, "product or service")?;
    db.with(|c| upsert(c, "products", get_id(data), data, PRODUCT_COLUMNS, true))
}

#[tauri::command]
pub fn product_delete(db: State<'_, Db>, id: i64) -> AppResult<()> {
    db.with(|c| {
        c.execute("DELETE FROM products WHERE id = ?1", [id])?;
        Ok(())
    })
}

// ---------------------------------------------------------------------------
// Parties (customers / vendors)
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn parties_list(db: State<'_, Db>, search: Option<String>) -> AppResult<Vec<Value>> {
    let search = search.unwrap_or_default();
    db.with(|c| {
        if search.trim().is_empty() {
            query_json(c, "SELECT * FROM parties ORDER BY name COLLATE NOCASE LIMIT 1000", &[])
        } else {
            let pat = text(&like_pattern(&search));
            query_json(
                c,
                "SELECT * FROM parties WHERE name LIKE ?1 ESCAPE '\\' OR company_name LIKE ?1 ESCAPE '\\'
                 OR phone LIKE ?1 ESCAPE '\\' OR gstin LIKE ?1 ESCAPE '\\'
                 ORDER BY name COLLATE NOCASE LIMIT 50",
                &[pat],
            )
        }
    })
}

#[tauri::command]
pub fn party_save(db: State<'_, Db>, party: Value) -> AppResult<i64> {
    let data = as_object(&party)?;
    require_name(data, "customer")?;
    db.with(|c| upsert(c, "parties", get_id(data), data, PARTY_COLUMNS, true))
}

#[tauri::command]
pub fn party_delete(db: State<'_, Db>, id: i64) -> AppResult<()> {
    db.with(|c| {
        c.execute("DELETE FROM parties WHERE id = ?1", [id])?;
        Ok(())
    })
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

const LIST_COLUMNS: &str = "d.id, d.document_type, d.document_number, d.status, d.party_name, d.party_company,
    d.issue_date, d.due_date, d.grand_total, d.currency, d.currency_symbol, d.currency_decimals,
    d.parent_document_id, d.is_demo, d.deleted_at, d.created_at, d.updated_at, d.folder_id, d.cancelled_at";

#[tauri::command]
pub fn documents_list(db: State<'_, Db>, filter: Option<Value>) -> AppResult<Value> {
    let f = filter.unwrap_or(json!({}));
    let mut where_sql = vec![];
    let mut params: Vec<SqlValue> = Vec::new();

    if f["deleted"].as_bool().unwrap_or(false) {
        where_sql.push("d.deleted_at IS NOT NULL".to_string());
    } else {
        where_sql.push("d.deleted_at IS NULL".to_string());
    }
    if let Some(types) = f["types"].as_array() {
        let types: Vec<&str> = types.iter().filter_map(|t| t.as_str()).collect();
        if !types.is_empty() {
            where_sql.push(format!("d.document_type IN ({})", vec!["?"; types.len()].join(",")));
            params.extend(types.iter().map(|t| text(t)));
        }
    }
    if let Some(status) = f["status"].as_str().filter(|s| STATUSES.contains(s)) {
        where_sql.push("d.status = ?".into());
        params.push(text(status));
    }
    if let Some(folder) = f["folderId"].as_i64() {
        where_sql.push("d.folder_id = ?".into());
        params.push(SqlValue::Integer(folder));
    } else if f["unfiled"].as_bool().unwrap_or(false) {
        where_sql.push("d.folder_id IS NULL".into());
    }
    if let Some(from) = f["from"].as_str().filter(|s| !s.is_empty()) {
        where_sql.push("d.issue_date >= ?".into());
        params.push(text(from));
    }
    if let Some(to) = f["to"].as_str().filter(|s| !s.is_empty()) {
        where_sql.push("d.issue_date <= ?".into());
        params.push(text(to));
    }
    let search = f["search"].as_str().unwrap_or("").trim().to_string();
    if !search.is_empty() {
        let pat = like_pattern(&search);
        let mut clause = String::from(
            "(d.document_number LIKE ? ESCAPE '\\' OR d.party_name LIKE ? ESCAPE '\\'
              OR d.party_company LIKE ? ESCAPE '\\' OR d.reference LIKE ? ESCAPE '\\'
              OR EXISTS (SELECT 1 FROM document_items i WHERE i.document_id = d.id AND i.name LIKE ? ESCAPE '\\')",
        );
        for _ in 0..5 {
            params.push(text(&pat));
        }
        // Document-type names matching the search (resolved by the UI from labels).
        if let Some(types) = f["searchTypes"].as_array() {
            let types: Vec<&str> = types.iter().filter_map(|t| t.as_str()).collect();
            if !types.is_empty() {
                clause.push_str(&format!(" OR d.document_type IN ({})", vec!["?"; types.len()].join(",")));
                params.extend(types.iter().map(|t| text(t)));
            }
        }
        clause.push(')');
        where_sql.push(clause);
    }

    let limit = f["limit"].as_i64().unwrap_or(100).clamp(1, 1000);
    let offset = f["offset"].as_i64().unwrap_or(0).max(0);
    let where_clause = where_sql.join(" AND ");

    db.with(|c| {
        let total: i64 = c.query_row(
            &format!("SELECT COUNT(*) FROM documents d WHERE {where_clause}"),
            rusqlite::params_from_iter(params.iter()),
            |r| r.get(0),
        )?;
        let mut page_params = params.clone();
        page_params.push(SqlValue::Integer(limit));
        page_params.push(SqlValue::Integer(offset));
        let rows = query_json(
            c,
            &format!(
                "SELECT {LIST_COLUMNS} FROM documents d WHERE {where_clause}
                 ORDER BY d.issue_date DESC, d.id DESC LIMIT ? OFFSET ?"
            ),
            &page_params,
        )?;
        Ok(json!({ "total": total, "rows": rows }))
    })
}

#[tauri::command]
pub fn document_get(db: State<'_, Db>, id: i64) -> AppResult<Value> {
    db.with(|c| {
        let doc = query_one(c, "SELECT * FROM documents WHERE id = ?1", &[SqlValue::Integer(id)])?
            .ok_or_else(|| AppError::new("This document could not be found."))?;
        let items = query_json(
            c,
            "SELECT * FROM document_items WHERE document_id = ?1 ORDER BY position, id",
            &[SqlValue::Integer(id)],
        )?;
        let taxes = query_json(
            c,
            "SELECT * FROM tax_breakdowns WHERE document_id = ?1 ORDER BY CAST(tax_rate AS REAL)",
            &[SqlValue::Integer(id)],
        )?;
        let parent = match doc["parent_document_id"].as_i64() {
            Some(pid) => query_one(
                c,
                "SELECT id, document_type, document_number, deleted_at FROM documents WHERE id = ?1",
                &[SqlValue::Integer(pid)],
            )?,
            None => None,
        };
        let children = query_json(
            c,
            "SELECT id, document_type, document_number, status FROM documents
             WHERE parent_document_id = ?1 AND deleted_at IS NULL ORDER BY id",
            &[SqlValue::Integer(id)],
        )?;
        let history = query_json(
            c,
            "SELECT id, action, from_status, to_status, note, created_at FROM document_history
             WHERE document_id = ?1 ORDER BY id DESC LIMIT 100",
            &[SqlValue::Integer(id)],
        )?;
        let folder = match doc["folder_id"].as_i64() {
            Some(fid) => query_one(c, "SELECT id, name FROM folders WHERE id = ?1", &[SqlValue::Integer(fid)])?,
            None => None,
        };
        Ok(json!({
            "document": doc, "items": items, "taxes": taxes, "parent": parent, "children": children,
            "history": history, "folder": folder,
        }))
    })
}

/// Save a document with its items and tax breakdown in one IMMEDIATE transaction.
/// When `document_number` is empty a number is allocated from the sequence.
#[tauri::command]
pub fn document_save(db: State<'_, Db>, payload: Value) -> AppResult<Value> {
    let root = as_object(&payload)?;
    let doc = root
        .get("document")
        .and_then(|d| d.as_object())
        .ok_or_else(|| AppError::new("Invalid document."))?;
    let items = root.get("items").and_then(|v| v.as_array()).cloned().unwrap_or_default();
    let taxes = root.get("taxes").and_then(|v| v.as_array()).cloned().unwrap_or_default();
    let default_prefix = root.get("defaultPrefix").and_then(|v| v.as_str()).unwrap_or("").to_string();

    let doc_type = str_field(doc, "document_type").to_string();
    valid_doc_type(&doc_type)?;
    let status = str_field(doc, "status");
    if !STATUSES.contains(&status) {
        return Err(AppError::new("Unknown document status."));
    }
    let issue_date = str_field(doc, "issue_date").to_string();
    if chrono::NaiveDate::parse_from_str(&issue_date, "%Y-%m-%d").is_err() {
        return Err(AppError::new("Please enter a valid document date."));
    }
    if items.len() > 2000 {
        return Err(AppError::new("A document can have at most 2000 items."));
    }

    db.with(|c| {
        let tx = c.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let id = get_id(doc);
        let mut data = doc.clone();
        let mut number = str_field(doc, "document_number").trim().to_string();

        let mut previous_status = String::new();
        if let Some(id) = id {
            previous_status = tx
                .query_row("SELECT status FROM documents WHERE id = ?1 AND deleted_at IS NULL", [id], |r| r.get(0))
                .map_err(|_| AppError::new("This document no longer exists."))?;
        }
        if number.is_empty() {
            match id {
                Some(id) => {
                    number = tx.query_row("SELECT document_number FROM documents WHERE id = ?1", [id], |r| r.get(0))?;
                }
                None => number = numbering::allocate(&tx, &doc_type, &default_prefix, &issue_date)?,
            }
        } else {
            if number.len() > 60 {
                return Err(AppError::new("The document number is too long."));
            }
            numbering::ensure_unique(&tx, &doc_type, &number, id)?;
        }
        data.insert("document_number".into(), Value::String(number.clone()));
        if let Some(meta) = data.get("meta") {
            if !meta.is_string() {
                let serialized = meta.to_string();
                data.insert("meta".into(), Value::String(serialized));
            }
        }

        let doc_id = upsert(&tx, "documents", id, &data, DOCUMENT_COLUMNS, true)?;
        match id {
            None => add_history(&tx, doc_id, "CREATED", "", status, "")?,
            Some(_) if previous_status != status => add_history(&tx, doc_id, "UPDATED", &previous_status, status, "")?,
            Some(_) => add_history(&tx, doc_id, "UPDATED", "", "", "")?,
        }
        if status == "CANCELLED" && previous_status != "CANCELLED" {
            tx.execute("UPDATE documents SET cancelled_at = COALESCE(cancelled_at, ?1) WHERE id = ?2", rusqlite::params![now(), doc_id])?;
        }
        if status == "ISSUED" || status == "PAID" {
            tx.execute(
                "UPDATE documents SET issued_at = COALESCE(issued_at, ?1) WHERE id = ?2",
                rusqlite::params![now(), doc_id],
            )?;
        }

        tx.execute("DELETE FROM document_items WHERE document_id = ?1", [doc_id])?;
        tx.execute("DELETE FROM tax_breakdowns WHERE document_id = ?1", [doc_id])?;
        for (pos, item) in items.iter().enumerate() {
            let mut row = as_object(item)?.clone();
            row.insert("document_id".into(), json!(doc_id));
            row.insert("position".into(), json!(pos as i64));
            upsert(&tx, "document_items", None, &row, ITEM_COLUMNS, false)?;
        }
        for tax in &taxes {
            let mut row = as_object(tax)?.clone();
            row.insert("document_id".into(), json!(doc_id));
            upsert(&tx, "tax_breakdowns", None, &row, TAX_COLUMNS, false)?;
        }
        tx.commit()?;
        Ok(json!({ "id": doc_id, "document_number": number }))
    })
}

#[tauri::command]
pub fn document_set_status(db: State<'_, Db>, id: i64, status: String, note: Option<String>) -> AppResult<()> {
    if !STATUSES.contains(&status.as_str()) {
        return Err(AppError::new("Unknown document status."));
    }
    let note = note.unwrap_or_default();
    db.with(|c| {
        let tx = c.transaction()?;
        let ts = now();
        let previous: String = tx
            .query_row("SELECT status FROM documents WHERE id = ?1 AND deleted_at IS NULL", [id], |r| r.get(0))
            .map_err(|_| AppError::new("This document could not be found."))?;
        if previous == status {
            return Ok(());
        }
        tx.execute(
            "UPDATE documents SET status = ?1, updated_at = ?2,
               issued_at = CASE WHEN ?1 IN ('ISSUED', 'PAID', 'PARTIAL', 'ACCEPTED', 'COMPLETED') THEN COALESCE(issued_at, ?2) ELSE issued_at END,
               cancelled_at = CASE WHEN ?1 IN ('CANCELLED', 'VOID') THEN ?2 ELSE NULL END,
               cancel_reason = CASE WHEN ?1 IN ('CANCELLED', 'VOID') THEN ?4 ELSE '' END
             WHERE id = ?3",
            rusqlite::params![status, ts, id, note.chars().take(500).collect::<String>()],
        )?;
        add_history(&tx, id, "STATUS", &previous, &status, &note)?;
        tx.commit()?;
        Ok(())
    })
}

/// Choose the print template for one document ('' = use the default).
#[tauri::command]
pub fn document_set_template(db: State<'_, Db>, id: i64, template: String) -> AppResult<()> {
    if template.len() > 40 || !template.chars().all(|c| c.is_ascii_lowercase() || c == '-') {
        return Err(AppError::new("Unknown template."));
    }
    db.with(|c| {
        c.execute("UPDATE documents SET template = ?1 WHERE id = ?2", rusqlite::params![template, id])?;
        add_history(c, id, "TEMPLATE", "", "", &template)?;
        Ok(())
    })
}

/// Soft delete: the row is kept and can be restored from "Deleted documents".
#[tauri::command]
pub fn document_delete(db: State<'_, Db>, id: i64) -> AppResult<()> {
    db.with(|c| {
        let n = c.execute(
            "UPDATE documents SET deleted_at = ?1 WHERE id = ?2 AND deleted_at IS NULL",
            rusqlite::params![now(), id],
        )?;
        if n > 0 {
            add_history(c, id, "DELETED", "", "", "")?;
        }
        Ok(())
    })
}

#[tauri::command]
pub fn document_restore(db: State<'_, Db>, id: i64) -> AppResult<()> {
    db.with(|c| {
        let (doc_type, number): (String, String) = c.query_row(
            "SELECT document_type, document_number FROM documents WHERE id = ?1",
            [id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )?;
        numbering::ensure_unique(c, &doc_type, &number, Some(id)).map_err(|_| {
            AppError::new(format!(
                "Cannot restore: another document already uses number \"{number}\". Rename that document first."
            ))
        })?;
        c.execute("UPDATE documents SET deleted_at = NULL, updated_at = ?1 WHERE id = ?2", rusqlite::params![now(), id])?;
        add_history(c, id, "RESTORED", "", "", "")?;
        Ok(())
    })
}

#[tauri::command]
pub fn dashboard_stats(db: State<'_, Db>) -> AppResult<Value> {
    db.with(|c| {
        let by_type = query_json(
            c,
            "SELECT document_type, COUNT(*) AS count FROM documents WHERE deleted_at IS NULL GROUP BY document_type",
            &[],
        )?;
        let by_status = query_json(
            c,
            "SELECT status, COUNT(*) AS count FROM documents WHERE deleted_at IS NULL GROUP BY status",
            &[],
        )?;
        let month_start = chrono::Local::now().format("%Y-%m-01").to_string();
        let this_month: i64 = c.query_row(
            "SELECT COUNT(*) FROM documents WHERE deleted_at IS NULL AND issue_date >= ?1",
            [month_start],
            |r| r.get(0),
        )?;
        let total: i64 =
            c.query_row("SELECT COUNT(*) FROM documents WHERE deleted_at IS NULL", [], |r| r.get(0))?;
        let drafts: i64 = c.query_row(
            "SELECT COUNT(*) FROM documents WHERE deleted_at IS NULL AND status = 'DRAFT'",
            [],
            |r| r.get(0),
        )?;
        let recent = query_json(
            c,
            &format!(
                "SELECT {LIST_COLUMNS} FROM documents d WHERE d.deleted_at IS NULL
                 ORDER BY d.updated_at DESC, d.id DESC LIMIT 10"
            ),
            &[],
        )?;
        let demo: i64 = c.query_row(
            "SELECT (SELECT COUNT(*) FROM documents WHERE is_demo = 1) + (SELECT COUNT(*) FROM products WHERE is_demo = 1)
                  + (SELECT COUNT(*) FROM parties WHERE is_demo = 1)",
            [],
            |r| r.get(0),
        )?;
        Ok(json!({
            "total": total, "thisMonth": this_month, "drafts": drafts,
            "byType": by_type, "byStatus": by_status, "recent": recent, "hasDemoData": demo > 0,
        }))
    })
}

/// Remove every record created by "Load demo data". Real data is never touched.
#[tauri::command]
pub fn demo_remove(db: State<'_, Db>) -> AppResult<()> {
    db.with(|c| {
        let tx = c.transaction()?;
        tx.execute("UPDATE documents SET parent_document_id = NULL WHERE parent_document_id IN (SELECT id FROM documents WHERE is_demo = 1)", [])?;
        tx.execute("DELETE FROM documents WHERE is_demo = 1", [])?;
        tx.execute("DELETE FROM products WHERE is_demo = 1", [])?;
        tx.execute("DELETE FROM parties WHERE is_demo = 1", [])?;
        tx.execute(
            "DELETE FROM categories WHERE is_demo = 1 AND id NOT IN (SELECT category_id FROM products WHERE category_id IS NOT NULL)",
            [],
        )?;
        tx.commit()?;
        Ok(())
    })
}

// ---------------------------------------------------------------------------
// Images (logo, stamp, signature)
// ---------------------------------------------------------------------------

/// Let the user pick an image; it is returned as a data URL and stored inside the database
/// so that backups contain everything.
#[tauri::command]
pub async fn pick_image(app: AppHandle) -> AppResult<Option<String>> {
    let picked = app
        .dialog()
        .file()
        .set_title("Choose an image")
        .add_filter("Images", &["png", "jpg", "jpeg", "webp"])
        .blocking_pick_file();
    let Some(file) = picked else { return Ok(None) };
    let path = file.into_path().map_err(|_| AppError::new("This file cannot be used."))?;
    let size = std::fs::metadata(&path)?.len();
    if size > MAX_IMAGE_BYTES {
        return Err(AppError::new("The image is larger than 2 MB. Please choose a smaller image."));
    }
    let bytes = std::fs::read(&path)?;
    let mime = match &bytes[..bytes.len().min(12)] {
        [0x89, b'P', b'N', b'G', ..] => "image/png",
        [0xFF, 0xD8, 0xFF, ..] => "image/jpeg",
        [b'R', b'I', b'F', b'F', _, _, _, _, b'W', b'E', b'B', b'P'] => "image/webp",
        _ => return Err(AppError::new("Please choose a PNG, JPG or WEBP image.")),
    };
    let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
    Ok(Some(format!("data:{mime};base64,{encoded}")))
}

// ---------------------------------------------------------------------------
// Backup / restore
// ---------------------------------------------------------------------------

fn backups_dir(db: &Db) -> PathBuf {
    db.path.parent().map(|p| p.join("backups")).unwrap_or_else(|| PathBuf::from("backups"))
}

pub fn backup_to(conn: &rusqlite::Connection, target: &std::path::Path) -> AppResult<()> {
    if target.exists() {
        std::fs::remove_file(target)?;
    }
    conn.execute("VACUUM INTO ?1", [target.to_string_lossy().to_string()])?;
    Ok(())
}

/// Check that a file is a healthy DocGen database before it replaces the live one.
pub fn validate_backup(path: &std::path::Path) -> AppResult<()> {
    let invalid = || AppError::new("This file is not a valid DocGen backup.");
    let conn = rusqlite::Connection::open_with_flags(path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|_| invalid())?;
    let check: String = conn.query_row("PRAGMA quick_check", [], |r| r.get(0)).map_err(|_| invalid())?;
    if check != "ok" {
        return Err(AppError::new("This backup file is damaged and cannot be restored."));
    }
    for table in ["schema_migrations", "documents", "document_items", "companies"] {
        let found: bool = conn
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1)",
                [table],
                |r| r.get(0),
            )
            .map_err(|_| invalid())?;
        if !found {
            return Err(invalid());
        }
    }
    let newest: i64 = conn
        .query_row("SELECT COALESCE(MAX(version), 0) FROM schema_migrations", [], |r| r.get(0))
        .map_err(|_| invalid())?;
    let supported = crate::db::MIGRATIONS.last().map(|m| m.0).unwrap_or(0);
    if newest > supported {
        return Err(AppError::new(
            "This backup was made with a newer version of DocGen. Please update the application first.",
        ));
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Sales data download (CSV for Excel / your accountant)
// ---------------------------------------------------------------------------

/// One CSV field: quoted when needed; text that a spreadsheet would run as a formula is prefixed with '.
fn csv_field(value: &str, text: bool) -> String {
    let v = if text && value.starts_with(['=', '+', '-', '@']) { format!("'{value}") } else { value.to_string() };
    if v.contains([',', '"', '\n', '\r']) {
        format!("\"{}\"", v.replace('"', "\"\""))
    } else {
        v
    }
}

/// Sales register between two dates (inclusive): one row per document, with the party's GST details.
/// Deleted documents are left out; every other one is listed with its status (Draft, Paid, Cancelled …).
/// Returns the CSV text (UTF-8 with BOM so Excel shows ₹ and Indian scripts) and the number of rows.
pub fn sales_csv(conn: &rusqlite::Connection, types: &[String], labels: &Map<String, Value>, from: &str, to: &str) -> AppResult<(String, usize)> {
    if types.is_empty() {
        return Ok((String::new(), 0));
    }
    let sql = format!(
        "SELECT issue_date, document_number, document_type, status, party_name, party_company, party_gstin, party_state,
                place_of_supply, tax_mode, taxable, cgst, sgst, igst, tax, grand_total, currency
         FROM documents
         WHERE deleted_at IS NULL AND document_type IN ({}) AND issue_date >= ? AND issue_date <= ?
         ORDER BY issue_date, document_number",
        vec!["?"; types.len()].join(",")
    );
    let mut params: Vec<SqlValue> = types.iter().map(|t| SqlValue::Text(t.clone())).collect();
    params.push(SqlValue::Text(from.to_string()));
    params.push(SqlValue::Text(to.to_string()));
    let mut out = String::from("\u{feff}");
    out.push_str(
        "Date,Document No.,Document Type,Status,Party Name,Party Company,Party GSTIN,Party State,Place of Supply,Supply Type,\
         Taxable Value,CGST,SGST,IGST,Total Tax,Grand Total,Currency\r\n",
    );
    let mut stmt = conn.prepare(&sql)?;
    let mut rows = stmt.query(rusqlite::params_from_iter(params.iter()))?;
    let mut count = 0;
    while let Some(r) = rows.next()? {
        let get = |i: usize| -> String { r.get::<_, String>(i).unwrap_or_default() };
        let doc_type = get(2);
        let label = labels.get(&doc_type).and_then(|v| v.as_str()).unwrap_or(&doc_type).to_string();
        let supply = match get(9).as_str() {
            "INTRA" => "Intra-state",
            "INTER" => "Inter-state",
            "NONE" => "No tax",
            _ => "",
        };
        let fields = [
            (get(0), false),
            (get(1), true),
            (label, true),
            (get(3), true),
            (get(4), true),
            (get(5), true),
            (get(6), true),
            (get(7), true),
            (get(8), true),
            (supply.to_string(), false),
            (get(10), false),
            (get(11), false),
            (get(12), false),
            (get(13), false),
            (get(14), false),
            (get(15), false),
            (get(16), false),
        ];
        out.push_str(&fields.iter().map(|(v, t)| csv_field(v, *t)).collect::<Vec<_>>().join(","));
        out.push_str("\r\n");
        count += 1;
    }
    Ok((out, count))
}

/// Download the sales register as a CSV file. `types`: document types to include; `labels`: their names.
#[tauri::command]
pub async fn sales_export(app: AppHandle, types: Vec<String>, labels: Map<String, Value>, from: String, to: String) -> AppResult<Option<Value>> {
    let valid_date = |d: &str| chrono::NaiveDate::parse_from_str(d, "%Y-%m-%d").is_ok();
    if !valid_date(&from) || !valid_date(&to) || from > to {
        return Err(AppError::new("Please choose a valid period."));
    }
    let db = app.state::<Db>();
    let (csv, count) = db.with(|c| sales_csv(c, &types, &labels, &from, &to))?;
    if count == 0 {
        return Err(AppError::new("There are no invoices or notes in this period."));
    }
    let file_name = format!("DocGen-Sales-{from}-to-{to}.csv");
    let path = match crate::files::e2e_save(&file_name) {
        Some(p) => p,
        None => {
            let picked = app
                .dialog()
                .file()
                .set_title("Save sales data")
                .set_file_name(&file_name)
                .add_filter("CSV (opens in Excel)", &["csv"])
                .blocking_save_file();
            let Some(file) = picked else { return Ok(None) };
            file.into_path().map_err(|_| AppError::new("This location cannot be used."))?
        }
    };
    let path = if path.extension().is_none() { path.with_extension("csv") } else { path };
    std::fs::write(&path, csv)?;
    Ok(Some(json!({ "path": path.to_string_lossy(), "count": count })))
}

#[tauri::command]
pub async fn backup_export(app: AppHandle) -> AppResult<Option<String>> {
    let file_name = format!("DocGen-Backup-{}.docgen", chrono::Local::now().format("%Y-%m-%d"));
    let picked = app
        .dialog()
        .file()
        .set_title("Save backup")
        .set_file_name(&file_name)
        .add_filter("DocGen backup", &["docgen", "sqlite", "db"])
        .blocking_save_file();
    let Some(file) = picked else { return Ok(None) };
    let path = file.into_path().map_err(|_| AppError::new("This location cannot be used."))?;
    let db = app.state::<Db>();
    db.with(|c| backup_to(c, &path))?;
    Ok(Some(path.to_string_lossy().to_string()))
}

/// Replace the live database with a backup. The current data is first saved to
/// `<app data>/backups/before-restore-*.docgen` so a restore can always be undone.
#[tauri::command]
pub async fn backup_restore(app: AppHandle) -> AppResult<Option<Value>> {
    let picked = app
        .dialog()
        .file()
        .set_title("Choose a backup to restore")
        .add_filter("DocGen backup", &["docgen", "sqlite", "db"])
        .blocking_pick_file();
    let Some(file) = picked else { return Ok(None) };
    let source = file.into_path().map_err(|_| AppError::new("This file cannot be used."))?;
    validate_backup(&source)?;
    let db = app.state::<Db>();
    let safety = restore_from(&db, &source)?;
    Ok(Some(json!({ "restoredFrom": source.to_string_lossy(), "safetyCopy": safety.to_string_lossy() })))
}

pub fn restore_from(db: &Db, source: &std::path::Path) -> AppResult<PathBuf> {
    let dir = backups_dir(db);
    std::fs::create_dir_all(&dir)?;
    let safety = dir.join(format!("before-restore-{}.docgen", chrono::Local::now().format("%Y%m%d-%H%M%S")));
    // Stage a copy first so a failure never leaves the live database half-written.
    let staged = dir.join("restore-staging.tmp");
    std::fs::copy(source, &staged)?;

    let mut guard = db.conn.lock().map_err(|_| AppError::new("The database is busy. Please try again."))?;
    if let Some(conn) = guard.as_ref() {
        backup_to(conn, &safety)?;
    }
    // Close the live connection before replacing the file.
    if let Some(conn) = guard.take() {
        let _ = conn.close();
    }
    let result = (|| -> AppResult<()> {
        for suffix in ["-wal", "-shm"] {
            let side = PathBuf::from(format!("{}{suffix}", db.path.to_string_lossy()));
            if side.exists() {
                std::fs::remove_file(side)?;
            }
        }
        std::fs::copy(&staged, &db.path)?;
        Ok(())
    })();
    let _ = std::fs::remove_file(&staged);
    if let Err(e) = result {
        // Put the safety copy back so the app keeps working with the previous data.
        let _ = std::fs::copy(&safety, &db.path);
        *guard = Some(crate::db::open_connection(&db.path)?);
        return Err(e);
    }
    *guard = Some(crate::db::open_connection(&db.path)?);
    Ok(safety)
}

// ---------------------------------------------------------------------------
// Advertisement / remote configuration
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn ad_state_get(db: State<'_, Db>) -> AppResult<Map<String, Value>> {
    db.with(|c| kv_get_all(c, "ad_state"))
}

#[tauri::command]
pub fn ad_state_set(db: State<'_, Db>, values: Map<String, Value>) -> AppResult<()> {
    db.with(|c| kv_set_many(c, "ad_state", &values))
}

#[tauri::command]
pub async fn remote_config_fetch() -> AppResult<Value> {
    tauri::async_runtime::spawn_blocking(remote::fetch_config)
        .await
        .map_err(|_| AppError::new("Could not reach the configuration server."))?
}

/// Record an ad event locally and send an anonymous counter ({event, adId}) to the server.
/// `ad_id` 0 = the built-in DocGen message.
#[tauri::command]
pub fn ad_event_record(db: State<'_, Db>, event: String, ad_id: i64, ad_version: String) -> AppResult<()> {
    if !["AD_SHOWN", "AD_CLICKED", "AD_CLOSED"].contains(&event.as_str()) {
        return Err(AppError::new("Unknown event."));
    }
    let ad_version: String = format!("{ad_id}:{}", ad_version.chars().take(30).collect::<String>());
    let online = !remote::settings().server_url.is_empty() && ad_id > 0;
    db.with(|c| {
        c.execute(
            "INSERT INTO ad_events (event, ad_version, sent) VALUES (?1, ?2, ?3)",
            rusqlite::params![event, ad_version, online as i64],
        )?;
        // Keep the local event log small.
        c.execute("DELETE FROM ad_events WHERE id <= (SELECT MAX(id) - 500 FROM ad_events)", [])?;
        Ok(())
    })?;
    if online {
        remote::send_event(&event, ad_id);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::open_connection;

    fn temp_db() -> (tempfile::TempDir, Db) {
        let dir = tempfile::tempdir().unwrap();
        let db = Db::open(dir.path().join("docgen.sqlite")).unwrap();
        (dir, db)
    }

    #[test]
    fn migrations_are_idempotent() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("a.sqlite");
        drop(open_connection(&path).unwrap());
        let conn = open_connection(&path).unwrap();
        let n: i64 = conn.query_row("SELECT COUNT(*) FROM schema_migrations", [], |r| r.get(0)).unwrap();
        assert_eq!(n as usize, crate::db::MIGRATIONS.len());
    }

    #[test]
    fn upgrade_from_version_1_keeps_documents_items_and_links() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("old.sqlite");
        {
            // Build a database as version 1.0 left it (migrations 1-3 only).
            let conn = rusqlite::Connection::open(&path).unwrap();
            conn.execute_batch("PRAGMA foreign_keys = ON; CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL);").unwrap();
            for (v, name, sql) in &crate::db::MIGRATIONS[..3] {
                conn.execute_batch(sql).unwrap();
                conn.execute("INSERT INTO schema_migrations VALUES (?1, ?2, 'x')", rusqlite::params![v, name]).unwrap();
            }
            conn.execute_batch(
                "INSERT INTO documents (id, document_type, document_number, issue_date, status, grand_total) VALUES (1, 'QUOTATION', 'QTN-00001', '2026-09-01', 'ISSUED', '1180.00');
                 INSERT INTO documents (id, document_type, document_number, issue_date, parent_document_id) VALUES (2, 'TAX_INVOICE', 'INV-00001', '2026-09-02', 1);
                 INSERT INTO document_items (document_id, name, quantity, unit_price) VALUES (2, 'Chair', '2', '500');",
            )
            .unwrap();
        }
        let conn = open_connection(&path).unwrap();
        let (number, parent): (String, i64) = conn
            .query_row("SELECT document_number, parent_document_id FROM documents WHERE id = 2", [], |r| Ok((r.get(0)?, r.get(1)?)))
            .unwrap();
        assert_eq!((number.as_str(), parent), ("INV-00001", 1));
        let items: i64 = conn.query_row("SELECT COUNT(*) FROM document_items WHERE document_id = 2", [], |r| r.get(0)).unwrap();
        assert_eq!(items, 1);
        let history: i64 = conn.query_row("SELECT COUNT(*) FROM document_history", [], |r| r.get(0)).unwrap();
        assert_eq!(history, 2, "existing documents get a CREATED history entry");
        // New statuses are accepted now that the CHECK constraint is gone.
        conn.execute("UPDATE documents SET status = 'ACCEPTED' WHERE id = 1", []).unwrap();
        // Foreign keys still enforced after the rebuild: deleting a document cascades to its items.
        conn.execute("DELETE FROM documents WHERE id = 2", []).unwrap();
        let orphan: i64 = conn.query_row("SELECT COUNT(*) FROM document_items", [], |r| r.get(0)).unwrap();
        assert_eq!(orphan, 0);
    }

    #[test]
    fn sales_csv_lists_invoices_with_party_gst_details() {
        let (_dir, db) = temp_db();
        db.with(|c| {
            c.execute_batch(
                "INSERT INTO documents (document_type, document_number, issue_date, status, party_name, party_gstin, party_state, place_of_supply, tax_mode, taxable, cgst, sgst, igst, tax, grand_total)
                   VALUES ('TAX_INVOICE', 'INV-00001', '2026-09-05', 'ISSUED', 'ABC Constructions, Pune', '27ABCDE1234F1Z5', 'Maharashtra', 'Maharashtra', 'INTRA', '1000.00', '90.00', '90.00', '0', '180.00', '1180.00');
                 INSERT INTO documents (document_type, document_number, issue_date, status, party_name, party_gstin, tax_mode, taxable, igst, tax, grand_total)
                   VALUES ('TAX_INVOICE', 'INV-00002', '2026-09-20', 'PAID', '=HYPERLINK(\"x\")', '29ABCDE1234F1Z5', 'INTER', '500.00', '90.00', '90.00', '590.00');
                 INSERT INTO documents (document_type, document_number, issue_date, status, party_name) VALUES ('TAX_INVOICE', 'INV-00003', '2026-09-21', 'DRAFT', 'Draft Co');
                 INSERT INTO documents (document_type, document_number, issue_date, status, party_name) VALUES ('QUOTATION', 'QTN-00001', '2026-09-21', 'ISSUED', 'Not a sale');
                 INSERT INTO documents (document_type, document_number, issue_date, status, party_name) VALUES ('TAX_INVOICE', 'INV-00004', '2026-10-01', 'ISSUED', 'Next month');",
            )?;
            let mut labels = Map::new();
            labels.insert("TAX_INVOICE".into(), json!("Tax Invoice"));
            let (csv, count) = sales_csv(c, &["TAX_INVOICE".to_string()], &labels, "2026-09-01", "2026-09-30")?;
            assert_eq!(count, 3, "other types and other months are left out");
            assert!(csv.contains("INV-00003,Tax Invoice,DRAFT,Draft Co"), "drafts are listed with their status");
            assert!(csv.starts_with('\u{feff}'));
            assert!(csv.contains("2026-09-05,INV-00001,Tax Invoice,ISSUED,\"ABC Constructions, Pune\",,27ABCDE1234F1Z5,Maharashtra,Maharashtra,Intra-state,1000.00,90.00,90.00,0,180.00,1180.00,INR\r\n"));
            assert!(csv.contains("\"'=HYPERLINK(\"\"x\"\")\""), "formulas are neutralised");
            assert!(csv.contains("Inter-state,500.00,0,0,90.00,90.00,590.00"));
            Ok(())
        })
        .unwrap();
    }

    #[test]
    fn numbering_allocates_sequentially_and_skips_taken_numbers() {
        let (_dir, db) = temp_db();
        db.with(|c| {
            let tx = c.transaction().unwrap();
            assert_eq!(numbering::allocate(&tx, "TAX_INVOICE", "INV", "2026-09-24").unwrap(), "INV-00001");
            tx.execute(
                "INSERT INTO documents (document_type, document_number, issue_date) VALUES ('TAX_INVOICE', 'INV-00002', '2026-09-24')",
                [],
            )
            .unwrap();
            assert_eq!(numbering::allocate(&tx, "TAX_INVOICE", "INV", "2026-09-24").unwrap(), "INV-00003");
            assert_eq!(numbering::preview(&tx, "TAX_INVOICE", "INV", "2026-09-24").unwrap(), "INV-00004");
            assert!(numbering::ensure_unique(&tx, "TAX_INVOICE", "INV-00002", None).is_err());
            // Unknown types get a sequence on first use.
            assert_eq!(numbering::allocate(&tx, "WORK_ORDER", "WO", "2026-09-24").unwrap(), "WO-00001");
            tx.commit().unwrap();
            Ok(())
        })
        .unwrap();
    }

    #[test]
    fn yearly_reset_restarts_numbering_in_a_new_fiscal_year() {
        let (_dir, db) = temp_db();
        db.with(|c| {
            c.execute(
                "UPDATE document_sequences SET format = '{PREFIX}/{FY}/{NUM}', padding = 4, reset_yearly = 1 WHERE doc_type = 'TAX_INVOICE'",
                [],
            )
            .unwrap();
            assert_eq!(numbering::allocate(c, "TAX_INVOICE", "INV", "2027-03-31").unwrap(), "INV/2026-27/0001");
            assert_eq!(numbering::allocate(c, "TAX_INVOICE", "INV", "2027-03-31").unwrap(), "INV/2026-27/0002");
            assert_eq!(numbering::allocate(c, "TAX_INVOICE", "INV", "2027-04-01").unwrap(), "INV/2027-28/0001");
            Ok(())
        })
        .unwrap();
    }

    #[test]
    fn upsert_ignores_unknown_columns() {
        let (_dir, db) = temp_db();
        db.with(|c| {
            let mut data = Map::new();
            data.insert("name".into(), json!("Chair"));
            data.insert("selling_price".into(), json!("4500.00"));
            data.insert("evil; DROP TABLE products".into(), json!("x"));
            let id = upsert(c, "products", None, &data, PRODUCT_COLUMNS, true).unwrap();
            let price: String = c.query_row("SELECT selling_price FROM products WHERE id = ?1", [id], |r| r.get(0)).unwrap();
            assert_eq!(price, "4500.00");
            Ok(())
        })
        .unwrap();
    }

    #[test]
    fn backup_and_restore_round_trip() {
        let (dir, db) = temp_db();
        db.with(|c| {
            c.execute("INSERT INTO parties (name) VALUES ('Before backup')", [])?;
            Ok(())
        })
        .unwrap();
        let backup = dir.path().join("backup.docgen");
        db.with(|c| backup_to(c, &backup)).unwrap();
        validate_backup(&backup).unwrap();

        db.with(|c| {
            c.execute("INSERT INTO parties (name) VALUES ('After backup')", [])?;
            Ok(())
        })
        .unwrap();
        let safety = restore_from(&db, &backup).unwrap();
        assert!(safety.exists());
        let names: Vec<String> = db
            .with(|c| {
                let mut st = c.prepare("SELECT name FROM parties ORDER BY id")?;
                let rows = st.query_map([], |r| r.get(0))?.collect::<Result<Vec<String>, _>>()?;
                Ok(rows)
            })
            .unwrap();
        assert_eq!(names, vec!["Before backup".to_string()]);

        // The safety copy still holds the data from before the restore.
        validate_backup(&safety).unwrap();
        let conn = rusqlite::Connection::open(&safety).unwrap();
        let n: i64 = conn.query_row("SELECT COUNT(*) FROM parties", [], |r| r.get(0)).unwrap();
        assert_eq!(n, 2);
    }

    #[test]
    fn restore_rejects_non_docgen_files() {
        let dir = tempfile::tempdir().unwrap();
        let junk = dir.path().join("junk.docgen");
        std::fs::write(&junk, b"definitely not sqlite").unwrap();
        assert!(validate_backup(&junk).is_err());
        let other = dir.path().join("other.sqlite");
        rusqlite::Connection::open(&other).unwrap().execute_batch("CREATE TABLE t (x)").unwrap();
        assert!(validate_backup(&other).is_err());
    }
}
