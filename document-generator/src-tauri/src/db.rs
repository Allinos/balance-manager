//! SQLite connection management, migrations, error mapping and small JSON helpers.
//!
//! The database lives in the OS application-data directory as a single file.
//! Every query is parameterised; column names used for dynamic INSERT/UPDATE
//! statements always come from static allow-lists, never from the frontend.

use rusqlite::types::{Value as SqlValue, ValueRef};
use rusqlite::{params_from_iter, Connection, OpenFlags};
use serde::Serialize;
use serde_json::{Map, Value};
use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

/// Ordered list of embedded migrations. Append new files here; never edit old ones.
pub const MIGRATIONS: &[(i64, &str, &str)] = &[
    (1, "migration_001_initial", include_str!("../migrations/001_initial.sql")),
    (
        2,
        "migration_002_add_document_settings",
        include_str!("../migrations/002_add_document_settings.sql"),
    ),
    (3, "migration_003_add_ad_state", include_str!("../migrations/003_add_ad_state.sql")),
];

/// User-facing error. `message` is always friendly; technical detail goes to the log file.
#[derive(Debug, Serialize)]
pub struct AppError {
    pub message: String,
}

pub type AppResult<T> = Result<T, AppError>;

impl AppError {
    pub fn new(message: impl Into<String>) -> Self {
        AppError { message: message.into() }
    }
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.message)
    }
}

static LOG_PATH: Mutex<Option<PathBuf>> = Mutex::new(None);

pub fn set_log_path(path: PathBuf) {
    if let Ok(mut guard) = LOG_PATH.lock() {
        *guard = Some(path);
    }
}

/// Append a technical error to `docgen.log` in the app data directory.
pub fn log_error(context: &str, detail: &str) {
    let line = format!("[{}] {}: {}\n", now(), context, detail);
    eprint!("{line}");
    if let Ok(guard) = LOG_PATH.lock() {
        if let Some(path) = guard.as_ref() {
            if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
                let _ = file.write_all(line.as_bytes());
            }
        }
    }
}

impl From<rusqlite::Error> for AppError {
    fn from(err: rusqlite::Error) -> Self {
        log_error("sqlite", &err.to_string());
        let text = err.to_string();
        let message = match &err {
            rusqlite::Error::SqliteFailure(e, _) => match e.code {
                rusqlite::ErrorCode::ConstraintViolation => {
                    if text.contains("FOREIGN KEY") {
                        "This record could not be changed because it is linked to another record."
                    } else if text.contains("UNIQUE") {
                        "A record with the same name or number already exists."
                    } else {
                        "Some of the entered values are not valid."
                    }
                }
                rusqlite::ErrorCode::DatabaseBusy | rusqlite::ErrorCode::DatabaseLocked => {
                    "The database is busy. Please try again in a moment."
                }
                rusqlite::ErrorCode::DiskFull => "Your disk is full. Free some space and try again.",
                rusqlite::ErrorCode::ReadOnly | rusqlite::ErrorCode::CannotOpen => {
                    "The data file could not be written. Check folder permissions."
                }
                rusqlite::ErrorCode::NotADatabase | rusqlite::ErrorCode::DatabaseCorrupt => {
                    "The data file is damaged or is not a valid DocGen file."
                }
                _ => "Something went wrong while saving your data. Please try again.",
            },
            rusqlite::Error::QueryReturnedNoRows => "The requested record was not found.",
            _ => "Something went wrong while reading your data. Please try again.",
        };
        AppError::new(message)
    }
}

impl From<std::io::Error> for AppError {
    fn from(err: std::io::Error) -> Self {
        log_error("io", &err.to_string());
        AppError::new("A file could not be read or written. Please check the location and try again.")
    }
}

impl From<serde_json::Error> for AppError {
    fn from(err: serde_json::Error) -> Self {
        log_error("json", &err.to_string());
        AppError::new("Some data had an unexpected format.")
    }
}

pub fn now() -> String {
    chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

/// Shared application database state.
pub struct Db {
    pub conn: Mutex<Option<Connection>>,
    pub path: PathBuf,
}

impl Db {
    pub fn open(path: PathBuf) -> AppResult<Self> {
        let conn = open_connection(&path)?;
        Ok(Db { conn: Mutex::new(Some(conn)), path })
    }

    /// Run `f` with the live connection.
    pub fn with<T>(&self, f: impl FnOnce(&mut Connection) -> AppResult<T>) -> AppResult<T> {
        let mut guard = self
            .conn
            .lock()
            .map_err(|_| AppError::new("The database is busy. Please restart the application."))?;
        match guard.as_mut() {
            Some(conn) => f(conn),
            None => Err(AppError::new("The database is not available right now. Please restart the application.")),
        }
    }
}

pub fn open_connection(path: &Path) -> AppResult<Connection> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let mut conn = Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_CREATE | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )?;
    conn.busy_timeout(std::time::Duration::from_secs(5))?;
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA synchronous = NORMAL;
         PRAGMA foreign_keys = ON;
         PRAGMA temp_store = MEMORY;",
    )?;
    migrate(&mut conn)?;
    Ok(conn)
}

/// Apply every pending migration, each in its own transaction.
pub fn migrate(conn: &mut Connection) -> AppResult<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_migrations (
            version     INTEGER PRIMARY KEY,
            name        TEXT NOT NULL,
            applied_at  TEXT NOT NULL
        );",
    )?;
    for (version, name, sql) in MIGRATIONS {
        let applied: bool = conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version = ?1)",
            [version],
            |r| r.get(0),
        )?;
        if applied {
            continue;
        }
        let tx = conn.transaction()?;
        tx.execute_batch(sql)?;
        tx.execute(
            "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?1, ?2, ?3)",
            rusqlite::params![version, name, now()],
        )?;
        tx.commit()?;
    }
    Ok(())
}

/// Convert a JSON value coming from the UI into an SQLite value.
pub fn json_to_sql(v: &Value) -> SqlValue {
    match v {
        Value::Null => SqlValue::Null,
        Value::Bool(b) => SqlValue::Integer(i64::from(*b)),
        Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                SqlValue::Integer(i)
            } else {
                // Decimal values are sent as strings; plain numbers are stored as text
                // to avoid binary floating-point surprises.
                SqlValue::Text(n.to_string())
            }
        }
        Value::String(s) => SqlValue::Text(s.clone()),
        other => SqlValue::Text(other.to_string()),
    }
}

fn sql_ref_to_json(v: ValueRef<'_>) -> Value {
    match v {
        ValueRef::Null => Value::Null,
        ValueRef::Integer(i) => Value::from(i),
        ValueRef::Real(f) => Value::from(f),
        ValueRef::Text(t) => Value::String(String::from_utf8_lossy(t).into_owned()),
        ValueRef::Blob(_) => Value::Null,
    }
}

/// Run a SELECT and return each row as a JSON object keyed by column name.
pub fn query_json(conn: &Connection, sql: &str, params: &[SqlValue]) -> AppResult<Vec<Value>> {
    let mut stmt = conn.prepare(sql)?;
    let names: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
    let rows = stmt.query_map(params_from_iter(params.iter()), |row| {
        let mut obj = Map::with_capacity(names.len());
        for (i, name) in names.iter().enumerate() {
            obj.insert(name.clone(), sql_ref_to_json(row.get_ref(i)?));
        }
        Ok(Value::Object(obj))
    })?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

pub fn query_one(conn: &Connection, sql: &str, params: &[SqlValue]) -> AppResult<Option<Value>> {
    Ok(query_json(conn, sql, params)?.into_iter().next())
}

/// Insert (id = None) or update (id = Some) a row using only allow-listed columns.
/// Missing keys are left untouched on update and fall back to column defaults on insert.
pub fn upsert(
    conn: &Connection,
    table: &str,
    id: Option<i64>,
    data: &Map<String, Value>,
    allowed: &[&str],
    touch_updated_at: bool,
) -> AppResult<i64> {
    let mut cols: Vec<&str> = Vec::new();
    let mut vals: Vec<SqlValue> = Vec::new();
    for col in allowed {
        if let Some(v) = data.get(*col) {
            cols.push(col);
            vals.push(json_to_sql(v));
        }
    }
    match id {
        Some(id) => {
            let mut sets: Vec<String> = cols.iter().map(|c| format!("{c} = ?")).collect();
            if touch_updated_at {
                sets.push("updated_at = ?".into());
                vals.push(SqlValue::Text(now()));
            }
            if sets.is_empty() {
                return Ok(id);
            }
            vals.push(SqlValue::Integer(id));
            let sql = format!("UPDATE {table} SET {} WHERE id = ?", sets.join(", "));
            let changed = conn.execute(&sql, params_from_iter(vals.iter()))?;
            if changed == 0 {
                return Err(AppError::new("The record you are editing no longer exists."));
            }
            Ok(id)
        }
        None => {
            let sql = if cols.is_empty() {
                format!("INSERT INTO {table} DEFAULT VALUES")
            } else {
                let marks = vec!["?"; cols.len()].join(", ");
                format!("INSERT INTO {table} ({}) VALUES ({marks})", cols.join(", "))
            };
            conn.execute(&sql, params_from_iter(vals.iter()))?;
            Ok(conn.last_insert_rowid())
        }
    }
}

pub fn get_id(data: &Map<String, Value>) -> Option<i64> {
    data.get("id").and_then(|v| v.as_i64()).filter(|id| *id > 0)
}

pub fn as_object(v: &Value) -> AppResult<&Map<String, Value>> {
    v.as_object().ok_or_else(|| AppError::new("Invalid data received."))
}

pub fn str_field<'a>(data: &'a Map<String, Value>, key: &str) -> &'a str {
    data.get(key).and_then(|v| v.as_str()).unwrap_or("")
}

/// Read a JSON value stored in a key/value table.
pub fn kv_get_all(conn: &Connection, table: &str) -> AppResult<Map<String, Value>> {
    let mut stmt = conn.prepare(&format!("SELECT key, value FROM {table}"))?;
    let rows = stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?;
    let mut out = Map::new();
    for row in rows {
        let (k, v) = row?;
        out.insert(k, serde_json::from_str(&v).unwrap_or(Value::String(v)));
    }
    Ok(out)
}

pub fn kv_set_many(conn: &mut Connection, table: &str, values: &Map<String, Value>) -> AppResult<()> {
    let tx = conn.transaction()?;
    {
        let mut stmt = tx.prepare(&format!(
            "INSERT INTO {table} (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value"
        ))?;
        for (k, v) in values {
            if k.is_empty() || k.len() > 100 {
                return Err(AppError::new("Invalid setting name."));
            }
            stmt.execute(rusqlite::params![k, serde_json::to_string(v)?])?;
        }
    }
    tx.commit()?;
    Ok(())
}
