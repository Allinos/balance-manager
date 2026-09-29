//! Licensing: account sign-in, activation codes, 30-day trial.
//!
//! * The server returns a license token `base64url(json).base64url(ed25519 signature)`.
//!   It is verified offline with the public key built into the app, so editing the
//!   local database cannot fake a license.
//! * Tokens are bound to this computer's device id (a salted hash of the OS machine id).
//! * The trial start is stored in the database *and* in a small file outside the
//!   database; the earliest value wins, so restoring an old backup does not reset it.
//! * The clock never moves backwards for licensing purposes (last seen time is kept).

use crate::db::{kv_get_all, log_error, AppError, AppResult, Db};
use crate::remote;
use base64::Engine;
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use rusqlite::Connection;
use serde_json::{json, Map, Value};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};

pub const TRIAL_DAYS: i64 = 30;
const DAY_MS: i64 = 86_400_000;

fn state_get(conn: &Connection, key: &str) -> Option<String> {
    conn.query_row("SELECT value FROM license_state WHERE key = ?1", [key], |r| r.get::<_, String>(0)).ok()
}

fn state_set(conn: &Connection, key: &str, value: &str) -> AppResult<()> {
    conn.execute(
        "INSERT INTO license_state (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        rusqlite::params![key, value],
    )?;
    Ok(())
}

fn state_del(conn: &Connection, key: &str) -> AppResult<()> {
    conn.execute("DELETE FROM license_state WHERE key = ?1", [key])?;
    Ok(())
}

/// Debug-only clock offset (DOCGEN_CLOCK_OFFSET_DAYS) used by automated tests.
pub fn clock_offset_ms() -> i64 {
    if cfg!(debug_assertions) {
        std::env::var("DOCGEN_CLOCK_OFFSET_DAYS")
            .ok()
            .and_then(|v| v.parse::<f64>().ok())
            .map(|d| (d * DAY_MS as f64) as i64)
            .unwrap_or(0)
    } else {
        0
    }
}

pub fn system_now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis() + clock_offset_ms()
}

/// Current time for licensing: never earlier than the last time seen (clock rollback guard).
fn effective_now(conn: &Connection) -> AppResult<i64> {
    let now = system_now_ms();
    let last: i64 = state_get(conn, "last_seen_ms").and_then(|v| v.parse().ok()).unwrap_or(0);
    let effective = now.max(last);
    if effective > last {
        state_set(conn, "last_seen_ms", &effective.to_string())?;
    }
    Ok(effective)
}

/// Stable, anonymous id for this computer.
pub fn device_id(conn: &Connection) -> String {
    let machine = machine_uid::get().ok().filter(|s| !s.trim().is_empty());
    let seed = match machine {
        Some(m) => m,
        None => {
            // No OS machine id available: fall back to a random id stored locally.
            if let Some(v) = state_get(conn, "device_fallback") {
                v
            } else {
                let v = format!("{:x}", Sha256::digest(format!("{}-{:?}", system_now_ms(), std::thread::current().id())));
                let _ = state_set(conn, "device_fallback", &v);
                v
            }
        }
    };
    let hash = Sha256::digest(format!("docgen-device-v1:{seed}"));
    let hex: String = hash.iter().map(|b| format!("{b:02x}")).collect();
    format!("dg-{}", &hex[..32])
}

pub fn device_name() -> String {
    let name = std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .ok()
        .or_else(|| std::fs::read_to_string("/etc/hostname").ok())
        .unwrap_or_default();
    let name: String = name.trim().chars().filter(|c| !c.is_control()).take(60).collect();
    if name.is_empty() {
        "Computer".into()
    } else {
        name
    }
}

fn install_marker(data_dir: &Path) -> PathBuf {
    data_dir.join(".docgen-install")
}

/// Trial start (ms): earliest of the database value and the marker file; created on first use.
fn trial_start(conn: &Connection, data_dir: &Path, now: i64) -> AppResult<i64> {
    let db_value: Option<i64> = state_get(conn, "trial_started_ms").and_then(|v| v.parse().ok());
    let file_value: Option<i64> = std::fs::read_to_string(install_marker(data_dir)).ok().and_then(|v| v.trim().parse().ok());
    let start = [db_value, file_value].into_iter().flatten().min().unwrap_or(now);
    if db_value != Some(start) {
        state_set(conn, "trial_started_ms", &start.to_string())?;
    }
    if file_value != Some(start) {
        if let Err(e) = std::fs::write(install_marker(data_dir), start.to_string()) {
            log_error("license", &format!("install marker: {e}"));
        }
    }
    Ok(start)
}

/// Verify a server-signed license token for this device. Returns the payload.
pub fn verify_token(token: &str, device: &str, public_key_b64: &str) -> Option<Value> {
    let key_bytes = base64::engine::general_purpose::STANDARD.decode(public_key_b64.trim()).ok()?;
    let key = VerifyingKey::from_bytes(&key_bytes.try_into().ok()?).ok()?;
    let (body, sig) = token.split_once('.')?;
    let sig_bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(sig.trim_end_matches('=')).ok()?;
    let signature = Signature::from_slice(&sig_bytes).ok()?;
    key.verify(body.as_bytes(), &signature).ok()?;
    let payload_bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(body.trim_end_matches('=')).ok()?;
    let payload: Value = serde_json::from_slice(&payload_bytes).ok()?;
    if payload["did"].as_str() != Some(device) {
        return None;
    }
    Some(payload)
}

/// Full license/trial state shown by the app.
pub fn status(conn: &Connection, data_dir: &Path) -> AppResult<Value> {
    let now = effective_now(conn)?;
    let settings = remote::settings();
    let device = device_id(conn);
    let start = trial_start(conn, data_dir, now)?;
    let trial_ends = start + TRIAL_DAYS * DAY_MS;
    let trial_days_left = ((trial_ends - now) as f64 / DAY_MS as f64).ceil().max(0.0) as i64;

    let mut license = Value::Null;
    let mut license_problem = Value::Null;
    if let Some(token) = state_get(conn, "license_token") {
        match verify_token(&token, &device, &settings.license_public_key) {
            Some(p) => {
                let expires_ms = p["expiresAt"]
                    .as_str()
                    .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
                    .map(|d| d.timestamp_millis());
                let mut st = p["status"].as_str().unwrap_or("active").to_string();
                if st == "active" && expires_ms.map(|e| e < now).unwrap_or(false) {
                    st = "expired".into();
                }
                if st != "active" {
                    license_problem = Value::String(st.clone());
                }
                let days_left = expires_ms.map(|e| ((e - now) as f64 / DAY_MS as f64).ceil() as i64);
                license = json!({
                    "status": st,
                    "email": p["email"], "name": p["name"], "business": p["business"],
                    "plan": p["plan"], "planName": p["planName"], "code": p["code"],
                    "activatedAt": p["activatedAt"], "expiresAt": p["expiresAt"], "daysLeft": days_left,
                    "maxDevices": p["maxDevices"], "issuedAt": p["iat"], "licenseId": p["lid"],
                });
            }
            None => license_problem = Value::String("invalid".into()),
        }
    }
    let licensed = license["status"] == "active";
    let mode = if licensed {
        "licensed"
    } else if now < trial_ends {
        "trial"
    } else {
        "expired"
    };
    let register_url = if settings.portal_url.is_empty() { String::new() } else { format!("{}/register", settings.portal_url) };
    Ok(json!({
        "mode": mode,
        "licensed": licensed,
        "trialDays": TRIAL_DAYS,
        "trialStartedAt": chrono::DateTime::from_timestamp_millis(start).map(|d| d.to_rfc3339()),
        "trialEndsAt": chrono::DateTime::from_timestamp_millis(trial_ends).map(|d| d.to_rfc3339()),
        "trialDaysLeft": trial_days_left,
        "license": license,
        "licenseProblem": license_problem,
        "deviceId": device,
        "deviceName": device_name(),
        "serverConfigured": !settings.server_url.is_empty(),
        "portalUrl": settings.portal_url,
        "registerUrl": register_url,
        "websiteUrl": settings.website_url,
        "lastRefreshAt": state_get(conn, "last_refresh_at"),
        "nowMs": now,
    }))
}

fn device_payload(conn: &Connection) -> Map<String, Value> {
    let mut m = Map::new();
    m.insert("deviceId".into(), Value::String(device_id(conn)));
    m.insert("deviceName".into(), Value::String(device_name()));
    m.insert("platform".into(), Value::String(remote::platform().into()));
    m.insert("appVersion".into(), Value::String(env!("CARGO_PKG_VERSION").into()));
    m
}

/// Store a token received from the server after verifying it.
fn accept_token(conn: &Connection, response: &Value) -> AppResult<()> {
    let token = response["token"].as_str().unwrap_or("");
    let settings = remote::settings();
    if settings.license_public_key.is_empty() {
        return Err(AppError::new("This copy of DocGen has no license verification key. Please install the official version."));
    }
    if verify_token(token, &device_id(conn), &settings.license_public_key).is_none() {
        log_error("license", "server token failed verification");
        return Err(AppError::new("The license returned by the server could not be verified. Please contact support."));
    }
    state_set(conn, "license_token", token)?;
    state_set(conn, "last_refresh_at", &chrono::Utc::now().to_rfc3339())?;
    Ok(())
}

/// Strip the "CODE|" prefix used between remote.rs and here.
fn friendly(e: AppError) -> AppError {
    match e.message.split_once('|') {
        Some((_, msg)) => AppError::new(msg.to_string()),
        None => e,
    }
}

fn error_code(e: &AppError) -> &str {
    e.message.split_once('|').map(|(c, _)| c).unwrap_or("")
}

pub fn normalise_code(input: &str) -> Option<String> {
    let raw: String = input.chars().filter(|c| !c.is_whitespace() && *c != '-').collect::<String>().to_ascii_uppercase();
    if raw.len() != 12 || !raw.chars().all(|c| c.is_ascii_uppercase() || c.is_ascii_digit()) {
        return None;
    }
    Some(format!("{}-{}-{}", &raw[0..4], &raw[4..8], &raw[8..12]))
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

fn data_dir(db: &Db) -> PathBuf {
    db.path.parent().map(Path::to_path_buf).unwrap_or_else(|| PathBuf::from("."))
}

#[tauri::command]
pub fn license_status(db: tauri::State<'_, Db>) -> AppResult<Value> {
    let dir = data_dir(&db);
    db.with(|c| status(c, &dir))
}

async fn blocking<T: Send + 'static>(f: impl FnOnce() -> AppResult<T> + Send + 'static) -> AppResult<T> {
    tauri::async_runtime::spawn_blocking(f).await.map_err(|_| AppError::new("The request was interrupted."))?
}

#[tauri::command]
pub async fn license_login(app: tauri::AppHandle, email: String, password: String) -> AppResult<Value> {
    use tauri::Manager;
    let email = email.trim().to_lowercase();
    if email.is_empty() || !email.contains('@') || password.is_empty() {
        return Err(AppError::new("Please enter your email and password."));
    }
    let db = app.state::<Db>();
    let mut body = db.with(|c| Ok(device_payload(c)))?;
    body.insert("email".into(), Value::String(email));
    body.insert("password".into(), Value::String(password));
    let response = blocking(move || remote::call("POST", "/api/app/login", Some(Value::Object(body)))).await.map_err(friendly)?;
    let dir = data_dir(&db);
    db.with(|c| {
        accept_token(c, &response)?;
        status(c, &dir)
    })
}

#[tauri::command]
pub async fn license_activate(app: tauri::AppHandle, code: String) -> AppResult<Value> {
    use tauri::Manager;
    let code = normalise_code(&code).ok_or_else(|| AppError::new("Activation codes have 12 letters or numbers, like AB12-CD34-EF56."))?;
    let db = app.state::<Db>();
    let mut body = db.with(|c| Ok(device_payload(c)))?;
    body.insert("code".into(), Value::String(code));
    let response = blocking(move || remote::call("POST", "/api/app/activate", Some(Value::Object(body)))).await.map_err(friendly)?;
    let dir = data_dir(&db);
    db.with(|c| {
        accept_token(c, &response)?;
        status(c, &dir)
    })
}

/// Refresh the stored license from the server (renewals, extensions, suspensions).
#[tauri::command]
pub async fn license_refresh(app: tauri::AppHandle) -> AppResult<Value> {
    use tauri::Manager;
    let db = app.state::<Db>();
    let dir = data_dir(&db);
    let token = db.with(|c| Ok(state_get(c, "license_token")))?;
    let Some(token) = token else { return db.with(|c| status(c, &dir)) };
    let device = db.with(|c| Ok(device_id(c)))?;
    let body = json!({ "token": token, "deviceId": device });
    match blocking(move || remote::call("POST", "/api/app/license/refresh", Some(body))).await {
        Ok(response) => db.with(|c| {
            accept_token(c, &response)?;
            status(c, &dir)
        }),
        Err(e) => {
            let code = error_code(&e).to_string();
            if ["DEVICE_RELEASED", "INVALID_TOKEN", "LICENSE_NOT_FOUND"].contains(&code.as_str()) {
                db.with(|c| state_del(c, "license_token"))?;
                db.with(|c| status(c, &dir))
            } else {
                Err(friendly(e))
            }
        }
    }
}

/// Sign out: release this computer on the server (best effort) and forget the license.
#[tauri::command]
pub async fn license_logout(app: tauri::AppHandle) -> AppResult<Value> {
    use tauri::Manager;
    let db = app.state::<Db>();
    let dir = data_dir(&db);
    let token = db.with(|c| Ok(state_get(c, "license_token")))?;
    if let Some(token) = token {
        let device = db.with(|c| Ok(device_id(c)))?;
        let body = json!({ "token": token, "deviceId": device });
        let _ = blocking(move || remote::call("POST", "/api/app/license/release", Some(body))).await;
    }
    db.with(|c| {
        state_del(c, "license_token")?;
        status(c, &dir)
    })
}

/// Everything in license_state except secrets (for diagnostics in About).
#[tauri::command]
pub fn license_debug_state(db: tauri::State<'_, Db>) -> AppResult<Map<String, Value>> {
    db.with(|c| {
        let mut all = kv_get_all(c, "license_state")?;
        all.remove("license_token");
        Ok(all)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};

    fn signed(payload: &Value, key: &SigningKey) -> String {
        let body = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(payload.to_string());
        let sig = key.sign(body.as_bytes());
        format!("{body}.{}", base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(sig.to_bytes()))
    }

    #[test]
    fn verifies_tokens_and_rejects_tampering() {
        let key = SigningKey::from_bytes(&[7u8; 32]);
        let public = base64::engine::general_purpose::STANDARD.encode(key.verifying_key().to_bytes());
        let token = signed(&json!({ "did": "dg-1", "status": "active", "maxDevices": 1 }), &key);
        assert!(verify_token(&token, "dg-1", &public).is_some());
        assert!(verify_token(&token, "dg-2", &public).is_none(), "bound to device");
        let (_, sig) = token.split_once('.').unwrap();
        let forged_body = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(json!({ "did": "dg-1", "status": "active", "maxDevices": 99 }).to_string());
        assert!(verify_token(&format!("{forged_body}.{sig}"), "dg-1", &public).is_none(), "tampered payload");
        let other = SigningKey::from_bytes(&[9u8; 32]);
        let other_pub = base64::engine::general_purpose::STANDARD.encode(other.verifying_key().to_bytes());
        assert!(verify_token(&token, "dg-1", &other_pub).is_none(), "wrong key");
    }

    #[test]
    fn normalises_activation_codes() {
        assert_eq!(normalise_code("ab12 cd34 ef56").as_deref(), Some("AB12-CD34-EF56"));
        assert_eq!(normalise_code("AB12-CD34-EF56").as_deref(), Some("AB12-CD34-EF56"));
        assert!(normalise_code("AB12-CD34").is_none());
        assert!(normalise_code("AB12-CD34-EF5!").is_none());
    }

    #[test]
    fn trial_survives_database_reset_via_marker_file() {
        let dir = tempfile::tempdir().unwrap();
        let conn = crate::db::open_connection(&dir.path().join("a.sqlite")).unwrap();
        let s1 = status(&conn, dir.path()).unwrap();
        assert_eq!(s1["mode"], "trial");
        assert_eq!(s1["trialDaysLeft"], 30);
        // Pretend the trial started 40 days ago in the marker file only (DB freshly restored).
        let old = system_now_ms() - 40 * DAY_MS;
        std::fs::write(dir.path().join(".docgen-install"), old.to_string()).unwrap();
        let s2 = status(&conn, dir.path()).unwrap();
        assert_eq!(s2["mode"], "expired");
        assert_eq!(s2["trialDaysLeft"], 0);
    }

    #[test]
    fn clock_rollback_does_not_extend_trial() {
        let dir = tempfile::tempdir().unwrap();
        let conn = crate::db::open_connection(&dir.path().join("a.sqlite")).unwrap();
        status(&conn, dir.path()).unwrap();
        let future = system_now_ms() + 31 * DAY_MS;
        state_set(&conn, "last_seen_ms", &future.to_string()).unwrap();
        assert_eq!(status(&conn, dir.path()).unwrap()["mode"], "expired");
    }
}
