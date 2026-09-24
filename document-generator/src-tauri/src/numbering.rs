//! Automatic document numbering.
//!
//! Format tokens:
//!   {PREFIX}  sequence prefix (e.g. INV)
//!   {NUM}     running number padded to `padding` digits
//!   {FY}      fiscal year, e.g. 2026-27
//!   {FYS}     short fiscal year, e.g. 26-27
//!   {YYYY}    calendar year of the document date
//!   {YY}      two-digit calendar year
//!   {MM}      month of the document date
//!
//! Numbers are generated inside the same IMMEDIATE transaction that saves the
//! document, so two saves can never receive the same number.

use crate::db::{AppError, AppResult};
use rusqlite::{Connection, OptionalExtension};

#[derive(Debug, Clone)]
pub struct Sequence {
    pub prefix: String,
    pub next_number: i64,
    pub start_number: i64,
    pub padding: i64,
    pub format: String,
    pub reset_yearly: bool,
    pub last_period: String,
}

/// Parse `YYYY-MM-DD` into (year, month). Falls back to today.
fn year_month(date: &str) -> (i32, u32) {
    let parts: Vec<&str> = date.split('-').collect();
    if parts.len() >= 2 {
        if let (Ok(y), Ok(m)) = (parts[0].parse::<i32>(), parts[1].parse::<u32>()) {
            if (1..=12).contains(&m) && (1900..=9999).contains(&y) {
                return (y, m);
            }
        }
    }
    let today = chrono::Local::now().date_naive();
    use chrono::Datelike;
    (today.year(), today.month())
}

/// Fiscal year label (e.g. "2026-27") for a date and fiscal-year start month.
pub fn fiscal_year(date: &str, start_month: u32) -> (String, String) {
    let (y, m) = year_month(date);
    let start_month = start_month.clamp(1, 12);
    if start_month == 1 {
        return (format!("{y}"), format!("{:02}", y % 100));
    }
    let start_year = if m >= start_month { y } else { y - 1 };
    let end = (start_year + 1) % 100;
    (
        format!("{start_year}-{end:02}"),
        format!("{:02}-{end:02}", start_year % 100),
    )
}

pub fn format_number(seq: &Sequence, n: i64, date: &str, fy_start: u32) -> String {
    let (y, m) = year_month(date);
    let (fy, fys) = fiscal_year(date, fy_start);
    let width = seq.padding.clamp(1, 12) as usize;
    let format = if seq.format.trim().is_empty() { "{PREFIX}-{NUM}" } else { seq.format.as_str() };
    format
        .replace("{PREFIX}", &seq.prefix)
        .replace("{FYS}", &fys)
        .replace("{FY}", &fy)
        .replace("{YYYY}", &format!("{y}"))
        .replace("{YY}", &format!("{:02}", y % 100))
        .replace("{MM}", &format!("{m:02}"))
        .replace("{NUM}", &format!("{n:0width$}"))
}

/// The period key used to decide when a yearly-reset sequence restarts.
fn period_for(seq: &Sequence, date: &str, fy_start: u32) -> String {
    if seq.format.contains("{FY") {
        fiscal_year(date, fy_start).0
    } else {
        year_month(date).0.to_string()
    }
}

pub fn load_sequence(conn: &Connection, doc_type: &str, default_prefix: &str) -> AppResult<Sequence> {
    let prefix = if default_prefix.trim().is_empty() {
        doc_type.chars().take(3).collect::<String>()
    } else {
        default_prefix.to_string()
    };
    conn.execute(
        "INSERT OR IGNORE INTO document_sequences (doc_type, prefix) VALUES (?1, ?2)",
        rusqlite::params![doc_type, prefix],
    )?;
    let seq = conn.query_row(
        "SELECT prefix, next_number, start_number, padding, format, reset_yearly, last_period
         FROM document_sequences WHERE doc_type = ?1",
        [doc_type],
        |r| {
            Ok(Sequence {
                prefix: r.get(0)?,
                next_number: r.get(1)?,
                start_number: r.get(2)?,
                padding: r.get(3)?,
                format: r.get(4)?,
                reset_yearly: r.get::<_, i64>(5)? != 0,
                last_period: r.get(6)?,
            })
        },
    )?;
    Ok(seq)
}

pub fn fiscal_start_month(conn: &Connection) -> u32 {
    conn.query_row(
        "SELECT value FROM app_settings WHERE key = 'fiscalYearStartMonth'",
        [],
        |r| r.get::<_, String>(0),
    )
    .optional()
    .ok()
    .flatten()
    .and_then(|v| v.trim_matches('"').parse::<u32>().ok())
    .filter(|m| (1..=12).contains(m))
    .unwrap_or(4)
}

fn number_taken(conn: &Connection, doc_type: &str, number: &str, exclude_id: Option<i64>) -> AppResult<bool> {
    let taken: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM documents
          WHERE document_type = ?1 AND document_number = ?2 AND deleted_at IS NULL AND id != ?3)",
        rusqlite::params![doc_type, number, exclude_id.unwrap_or(0)],
        |r| r.get(0),
    )?;
    Ok(taken)
}

/// Starting number for the next document, respecting yearly resets.
fn effective_next(seq: &Sequence, period: &str) -> i64 {
    if seq.reset_yearly && !seq.last_period.is_empty() && seq.last_period != period {
        seq.start_number.max(1)
    } else {
        seq.next_number.max(1)
    }
}

/// Preview the number the next saved document would receive (does not consume it).
pub fn preview(conn: &Connection, doc_type: &str, default_prefix: &str, date: &str) -> AppResult<String> {
    let seq = load_sequence(conn, doc_type, default_prefix)?;
    let fy_start = fiscal_start_month(conn);
    let period = period_for(&seq, date, fy_start);
    let mut n = effective_next(&seq, &period);
    for _ in 0..10_000 {
        let candidate = format_number(&seq, n, date, fy_start);
        if !number_taken(conn, doc_type, &candidate, None)? {
            return Ok(candidate);
        }
        n += 1;
    }
    Err(AppError::new("Could not find a free document number. Please check numbering settings."))
}

/// Allocate the next free number and advance the sequence. Must be called inside a transaction.
pub fn allocate(conn: &Connection, doc_type: &str, default_prefix: &str, date: &str) -> AppResult<String> {
    let seq = load_sequence(conn, doc_type, default_prefix)?;
    let fy_start = fiscal_start_month(conn);
    let period = period_for(&seq, date, fy_start);
    let mut n = effective_next(&seq, &period);
    for _ in 0..10_000 {
        let candidate = format_number(&seq, n, date, fy_start);
        if !number_taken(conn, doc_type, &candidate, None)? {
            conn.execute(
                "UPDATE document_sequences SET next_number = ?1, last_period = ?2 WHERE doc_type = ?3",
                rusqlite::params![n + 1, period, doc_type],
            )?;
            return Ok(candidate);
        }
        n += 1;
    }
    Err(AppError::new("Could not find a free document number. Please check numbering settings."))
}

pub fn ensure_unique(conn: &Connection, doc_type: &str, number: &str, exclude_id: Option<i64>) -> AppResult<()> {
    if number_taken(conn, doc_type, number, exclude_id)? {
        return Err(AppError::new(format!(
            "Document number \"{number}\" is already used. Please choose a different number."
        )));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn seq(format: &str, padding: i64) -> Sequence {
        Sequence {
            prefix: "INV".into(),
            next_number: 1,
            start_number: 1,
            padding,
            format: format.into(),
            reset_yearly: false,
            last_period: String::new(),
        }
    }

    #[test]
    fn formats_simple_numbers() {
        assert_eq!(format_number(&seq("{PREFIX}-{NUM}", 5), 1, "2026-09-24", 4), "INV-00001");
        assert_eq!(format_number(&seq("{PREFIX}-{NUM}", 5), 124, "2026-09-24", 4), "INV-00124");
    }

    #[test]
    fn formats_fiscal_year_numbers() {
        assert_eq!(format_number(&seq("{PREFIX}/{FY}/{NUM}", 4), 1, "2026-09-24", 4), "INV/2026-27/0001");
        assert_eq!(format_number(&seq("{PREFIX}/{FY}/{NUM}", 4), 7, "2027-02-10", 4), "INV/2026-27/0007");
        assert_eq!(format_number(&seq("{PREFIX}/{FYS}/{NUM}", 3), 7, "2027-04-01", 4), "INV/27-28/007");
        assert_eq!(fiscal_year("2026-12-31", 1).0, "2026");
    }
}
