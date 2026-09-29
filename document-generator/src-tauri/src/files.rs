//! Folders and external (uploaded) documents.
//!
//! Uploaded files are stored inside the SQLite database (table `file_blobs`,
//! de-duplicated by SHA-256) so that a backup always contains everything and no
//! loose files can go missing. Copies share the same stored content.

use crate::db::{log_error, now, query_json, AppError, AppResult, Db};
use rusqlite::types::Value as SqlValue;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

pub const MAX_FILE_BYTES: u64 = 25 * 1024 * 1024;

/// Document formats users can attach. Executables and scripts are never accepted.
const ALLOWED: &[(&str, &str)] = &[
    ("pdf", "application/pdf"),
    ("png", "image/png"),
    ("jpg", "image/jpeg"),
    ("jpeg", "image/jpeg"),
    ("webp", "image/webp"),
    ("gif", "image/gif"),
    ("tif", "image/tiff"),
    ("tiff", "image/tiff"),
    ("doc", "application/msword"),
    ("docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    ("xls", "application/vnd.ms-excel"),
    ("xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
    ("ppt", "application/vnd.ms-powerpoint"),
    ("pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"),
    ("odt", "application/vnd.oasis.opendocument.text"),
    ("ods", "application/vnd.oasis.opendocument.spreadsheet"),
    ("csv", "text/csv"),
    ("txt", "text/plain"),
    ("rtf", "application/rtf"),
    ("xml", "application/xml"),
    ("json", "application/json"),
    ("zip", "application/zip"),
];

pub fn extensions() -> Vec<&'static str> {
    ALLOWED.iter().map(|(e, _)| *e).collect()
}

fn mime_for(ext: &str) -> Option<&'static str> {
    ALLOWED.iter().find(|(e, _)| *e == ext).map(|(_, m)| *m)
}

/// Debug-only test hooks so automated tests can bypass native file dialogs.
fn e2e_pick() -> Option<Vec<PathBuf>> {
    if !cfg!(debug_assertions) {
        return None;
    }
    std::env::var("DOCGEN_E2E_PICK").ok().filter(|s| !s.is_empty()).map(|s| s.split(';').map(PathBuf::from).collect())
}

pub fn e2e_save(file_name: &str) -> Option<PathBuf> {
    if !cfg!(debug_assertions) {
        return None;
    }
    std::env::var("DOCGEN_E2E_SAVE_DIR").ok().filter(|s| !s.is_empty()).map(|d| PathBuf::from(d).join(file_name))
}

fn clean_name(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| if c.is_control() || r#"\/:*?"<>|"#.contains(c) { '-' } else { c })
        .collect::<String>()
        .trim()
        .chars()
        .take(150)
        .collect();
    if cleaned.is_empty() { "document".into() } else { cleaned }
}

// ------------------------------------------------------------------ folders

#[tauri::command]
pub fn folders_list(db: State<'_, Db>) -> AppResult<Vec<Value>> {
    db.with(|c| {
        query_json(
            c,
            "SELECT f.id, f.name, f.color,
                (SELECT COUNT(*) FROM documents d WHERE d.folder_id = f.id AND d.deleted_at IS NULL) AS document_count,
                (SELECT COUNT(*) FROM external_documents e WHERE e.folder_id = f.id AND e.deleted_at IS NULL) AS file_count
             FROM folders f ORDER BY f.name COLLATE NOCASE",
            &[],
        )
    })
}

#[tauri::command]
pub fn folder_save(db: State<'_, Db>, id: Option<i64>, name: String) -> AppResult<i64> {
    let name = clean_name(&name);
    if name.len() > 80 {
        return Err(AppError::new("Folder names can have at most 80 characters."));
    }
    db.with(|c| {
        let exists: bool = c.query_row(
            "SELECT EXISTS(SELECT 1 FROM folders WHERE name = ?1 COLLATE NOCASE AND id != ?2)",
            rusqlite::params![name, id.unwrap_or(0)],
            |r| r.get(0),
        )?;
        if exists {
            return Err(AppError::new("A folder with this name already exists."));
        }
        match id {
            Some(id) => {
                c.execute("UPDATE folders SET name = ?1 WHERE id = ?2", rusqlite::params![name, id])?;
                Ok(id)
            }
            None => {
                c.execute("INSERT INTO folders (name) VALUES (?1)", [name])?;
                Ok(c.last_insert_rowid())
            }
        }
    })
}

/// Delete a folder. Its documents and files are kept and become "unfiled".
#[tauri::command]
pub fn folder_delete(db: State<'_, Db>, id: i64) -> AppResult<()> {
    db.with(|c| {
        let tx = c.transaction()?;
        tx.execute("UPDATE documents SET folder_id = NULL WHERE folder_id = ?1", [id])?;
        tx.execute("UPDATE external_documents SET folder_id = NULL WHERE folder_id = ?1", [id])?;
        tx.execute("DELETE FROM folders WHERE id = ?1", [id])?;
        tx.commit()?;
        Ok(())
    })
}

/// Move generated documents into a folder (None = unfiled).
#[tauri::command]
pub fn documents_move(db: State<'_, Db>, ids: Vec<i64>, folder_id: Option<i64>) -> AppResult<()> {
    db.with(|c| {
        let tx = c.transaction()?;
        for id in ids {
            tx.execute("UPDATE documents SET folder_id = ?1, updated_at = ?2 WHERE id = ?3", rusqlite::params![folder_id, now(), id])?;
        }
        tx.commit()?;
        Ok(())
    })
}

// ------------------------------------------------------------- external docs

fn import_path(conn: &mut rusqlite::Connection, path: &Path, folder_id: Option<i64>) -> AppResult<i64> {
    let file_name = path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_else(|| "document".into());
    let ext = path.extension().map(|e| e.to_string_lossy().to_ascii_lowercase()).unwrap_or_default();
    let mime = mime_for(&ext).ok_or_else(|| AppError::new(format!("\"{file_name}\" is not a supported document type.")))?;
    let size = std::fs::metadata(path)?.len();
    if size > MAX_FILE_BYTES {
        return Err(AppError::new(format!("\"{file_name}\" is larger than 25 MB.")));
    }
    let bytes = std::fs::read(path)?;
    let sha: String = Sha256::digest(&bytes).iter().map(|b| format!("{b:02x}")).collect();
    let display = clean_name(path.file_stem().map(|s| s.to_string_lossy().to_string()).as_deref().unwrap_or("document"));
    let tx = conn.transaction()?;
    tx.execute(
        "INSERT OR IGNORE INTO file_blobs (sha256, size, data) VALUES (?1, ?2, ?3)",
        rusqlite::params![sha, bytes.len() as i64, bytes],
    )?;
    tx.execute(
        "INSERT INTO external_documents (name, original_name, extension, mime, size, sha256, folder_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![display, clean_name(&file_name), ext, mime, size as i64, sha, folder_id],
    )?;
    let id = tx.last_insert_rowid();
    tx.commit()?;
    Ok(id)
}

/// Let the user pick one or more files and store them. Returns how many were added and any problems.
#[tauri::command]
pub async fn files_import(app: AppHandle, folder_id: Option<i64>) -> AppResult<Value> {
    let paths: Vec<PathBuf> = match e2e_pick() {
        Some(p) => p,
        None => {
            let picked = app
                .dialog()
                .file()
                .set_title("Add external documents")
                .add_filter("Documents", &extensions())
                .blocking_pick_files();
            match picked {
                Some(files) => files.into_iter().filter_map(|f| f.into_path().ok()).collect(),
                None => return Ok(json!({ "added": 0, "errors": [] })),
            }
        }
    };
    let db = app.state::<Db>();
    let mut added = Vec::new();
    let mut errors = Vec::new();
    for path in paths.iter().take(100) {
        match db.with(|c| import_path(c, path, folder_id)) {
            Ok(id) => added.push(id),
            Err(e) => errors.push(e.message),
        }
    }
    Ok(json!({ "added": added.len(), "ids": added, "errors": errors }))
}

#[tauri::command]
pub fn files_list(db: State<'_, Db>, filter: Option<Value>) -> AppResult<Value> {
    let f = filter.unwrap_or(json!({}));
    let mut sql = String::from(
        "SELECT e.id, e.name, e.original_name, e.extension, e.mime, e.size, e.folder_id, e.notes, e.deleted_at,
                e.created_at, e.updated_at, fo.name AS folder_name
         FROM external_documents e LEFT JOIN folders fo ON fo.id = e.folder_id WHERE ",
    );
    let mut params: Vec<SqlValue> = Vec::new();
    sql.push_str(if f["deleted"].as_bool().unwrap_or(false) { "e.deleted_at IS NOT NULL" } else { "e.deleted_at IS NULL" });
    if let Some(folder) = f["folderId"].as_i64() {
        sql.push_str(" AND e.folder_id = ?");
        params.push(SqlValue::Integer(folder));
    } else if f["unfiled"].as_bool().unwrap_or(false) {
        sql.push_str(" AND e.folder_id IS NULL");
    }
    if let Some(q) = f["search"].as_str().map(str::trim).filter(|s| !s.is_empty()) {
        let pat = format!("%{}%", q.replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_"));
        sql.push_str(" AND (e.name LIKE ? ESCAPE '\\' OR e.original_name LIKE ? ESCAPE '\\' OR e.notes LIKE ? ESCAPE '\\')");
        for _ in 0..3 {
            params.push(SqlValue::Text(pat.clone()));
        }
    }
    let limit = f["limit"].as_i64().unwrap_or(100).clamp(1, 500);
    let offset = f["offset"].as_i64().unwrap_or(0).max(0);
    db.with(|c| {
        let total: i64 = c.query_row(
            &format!("SELECT COUNT(*) FROM ({sql})"),
            rusqlite::params_from_iter(params.iter()),
            |r| r.get(0),
        )?;
        let mut page = params.clone();
        page.push(SqlValue::Integer(limit));
        page.push(SqlValue::Integer(offset));
        let rows = query_json(c, &format!("{sql} ORDER BY e.created_at DESC, e.id DESC LIMIT ? OFFSET ?"), &page)?;
        Ok(json!({ "total": total, "rows": rows }))
    })
}

fn file_row(conn: &rusqlite::Connection, id: i64) -> AppResult<(String, String, String, Option<i64>, String)> {
    conn.query_row(
        "SELECT name, extension, sha256, folder_id, original_name FROM external_documents WHERE id = ?1",
        [id],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)),
    )
    .map_err(|_| AppError::new("This file could not be found."))
}

fn blob(conn: &rusqlite::Connection, sha: &str) -> AppResult<Vec<u8>> {
    Ok(conn.query_row("SELECT data FROM file_blobs WHERE sha256 = ?1", [sha], |r| r.get(0))?)
}

/// Open a stored file with the default program (a temporary copy is written first).
#[tauri::command]
pub fn file_open(app: AppHandle, db: State<'_, Db>, id: i64) -> AppResult<String> {
    let (name, ext, sha, _, _) = db.with(|c| file_row(c, id))?;
    let bytes = db.with(|c| blob(c, &sha))?;
    let dir = app.path().app_cache_dir().map_err(|_| AppError::new("No temporary folder is available."))?.join("open");
    std::fs::create_dir_all(&dir)?;
    let path = dir.join(format!("{}-{}.{}", id, clean_name(&name), ext));
    std::fs::write(&path, bytes)?;
    if !cfg!(debug_assertions) || std::env::var("DOCGEN_E2E_SAVE_DIR").is_err() {
        app.opener().open_path(path.to_string_lossy().to_string(), None::<&str>).map_err(|e| {
            log_error("open-file", &e.to_string());
            AppError::new("No program is installed to open this type of file.")
        })?;
    }
    Ok(path.to_string_lossy().to_string())
}

/// Save a copy of a stored file to a location chosen by the user.
#[tauri::command]
pub async fn file_export(app: AppHandle, id: i64) -> AppResult<Option<String>> {
    let db = app.state::<Db>();
    let (name, ext, sha, _, _) = db.with(|c| file_row(c, id))?;
    let file_name = format!("{}.{}", clean_name(&name), ext);
    let target = match e2e_save(&file_name) {
        Some(p) => p,
        None => {
            let picked = app.dialog().file().set_title("Save a copy").set_file_name(&file_name).blocking_save_file();
            let Some(p) = picked else { return Ok(None) };
            p.into_path().map_err(|_| AppError::new("This location cannot be used."))?
        }
    };
    let bytes = db.with(|c| blob(c, &sha))?;
    std::fs::write(&target, bytes)?;
    Ok(Some(target.to_string_lossy().to_string()))
}

#[tauri::command]
pub fn file_update(db: State<'_, Db>, id: i64, name: Option<String>, notes: Option<String>) -> AppResult<()> {
    db.with(|c| {
        if let Some(n) = name {
            c.execute("UPDATE external_documents SET name = ?1, updated_at = ?2 WHERE id = ?3", rusqlite::params![clean_name(&n), now(), id])?;
        }
        if let Some(n) = notes {
            let n: String = n.chars().take(1000).collect();
            c.execute("UPDATE external_documents SET notes = ?1, updated_at = ?2 WHERE id = ?3", rusqlite::params![n, now(), id])?;
        }
        Ok(())
    })
}

/// Move files into a folder (None = unfiled).
#[tauri::command]
pub fn files_move(db: State<'_, Db>, ids: Vec<i64>, folder_id: Option<i64>) -> AppResult<()> {
    db.with(|c| {
        let tx = c.transaction()?;
        for id in ids {
            tx.execute("UPDATE external_documents SET folder_id = ?1, updated_at = ?2 WHERE id = ?3", rusqlite::params![folder_id, now(), id])?;
        }
        tx.commit()?;
        Ok(())
    })
}

/// Copy files into a folder. The copy is an independent entry (own name/notes/folder)
/// that shares the stored content, so no extra disk space is used.
#[tauri::command]
pub fn files_copy(db: State<'_, Db>, ids: Vec<i64>, folder_id: Option<i64>) -> AppResult<Vec<i64>> {
    db.with(|c| {
        let tx = c.transaction()?;
        let mut out = Vec::new();
        for id in ids {
            tx.execute(
                "INSERT INTO external_documents (name, original_name, extension, mime, size, sha256, folder_id, notes)
                 SELECT name, original_name, extension, mime, size, sha256, ?1, notes FROM external_documents WHERE id = ?2",
                rusqlite::params![folder_id, id],
            )?;
            out.push(tx.last_insert_rowid());
        }
        tx.commit()?;
        Ok(out)
    })
}

/// Move files to "Deleted" (restorable).
#[tauri::command]
pub fn files_delete(db: State<'_, Db>, ids: Vec<i64>) -> AppResult<()> {
    db.with(|c| {
        let tx = c.transaction()?;
        for id in ids {
            tx.execute("UPDATE external_documents SET deleted_at = ?1 WHERE id = ?2 AND deleted_at IS NULL", rusqlite::params![now(), id])?;
        }
        tx.commit()?;
        Ok(())
    })
}

#[tauri::command]
pub fn files_restore(db: State<'_, Db>, ids: Vec<i64>) -> AppResult<()> {
    db.with(|c| {
        let tx = c.transaction()?;
        for id in ids {
            tx.execute("UPDATE external_documents SET deleted_at = NULL, updated_at = ?1 WHERE id = ?2", rusqlite::params![now(), id])?;
        }
        tx.commit()?;
        Ok(())
    })
}

/// Permanently remove deleted files and any stored content no longer referenced.
#[tauri::command]
pub fn files_purge(db: State<'_, Db>, ids: Vec<i64>) -> AppResult<()> {
    db.with(|c| {
        let tx = c.transaction()?;
        for id in ids {
            tx.execute("DELETE FROM external_documents WHERE id = ?1 AND deleted_at IS NOT NULL", [id])?;
        }
        tx.execute("DELETE FROM file_blobs WHERE sha256 NOT IN (SELECT sha256 FROM external_documents)", [])?;
        tx.commit()?;
        Ok(())
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn import_copy_purge_deduplicates_storage() {
        let dir = tempfile::tempdir().unwrap();
        let mut conn = crate::db::open_connection(&dir.path().join("a.sqlite")).unwrap();
        let file = dir.path().join("Supplier Bill.pdf");
        std::fs::write(&file, b"%PDF-1.4 test").unwrap();
        let id = import_path(&mut conn, &file, None).unwrap();
        let again = import_path(&mut conn, &file, None).unwrap();
        assert_ne!(id, again);
        let blobs: i64 = conn.query_row("SELECT COUNT(*) FROM file_blobs", [], |r| r.get(0)).unwrap();
        assert_eq!(blobs, 1, "identical content is stored once");
        let (name, ext, _, _, _) = file_row(&conn, id).unwrap();
        assert_eq!((name.as_str(), ext.as_str()), ("Supplier Bill", "pdf"));

        let bad = dir.path().join("setup.exe");
        std::fs::write(&bad, b"MZ").unwrap();
        assert!(import_path(&mut conn, &bad, None).is_err(), "executables are rejected");

        conn.execute("UPDATE external_documents SET deleted_at = 'x'", []).unwrap();
        conn.execute("DELETE FROM external_documents WHERE deleted_at IS NOT NULL", []).unwrap();
        conn.execute("DELETE FROM file_blobs WHERE sha256 NOT IN (SELECT sha256 FROM external_documents)", []).unwrap();
        let blobs: i64 = conn.query_row("SELECT COUNT(*) FROM file_blobs", [], |r| r.get(0)).unwrap();
        assert_eq!(blobs, 0);
    }
}
