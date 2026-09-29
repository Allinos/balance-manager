//! Communication with the DocGen server.
//!
//! Only three kinds of requests exist:
//!  * configuration check (ads, help videos, check interval) — anonymous;
//!  * anonymous ad counters ({event, adId});
//!  * licensing (sign-in / activation code / refresh / release) — sends only the
//!    account email+password or the activation code, an anonymous device id,
//!    the computer name, platform and app version.
//!
//! Business data (documents, customers, products, company details, the
//! database) is never sent. Every server response is validated strictly and
//! nothing received is ever executed.

use crate::db::{log_error, AppError, AppResult};
use serde_json::{json, Map, Value};
use std::io::Read;
use std::time::Duration;

const MAX_BODY_BYTES: u64 = 256 * 1024;

#[derive(Debug, Clone)]
pub struct RemoteSettings {
    pub server_url: String,
    pub portal_url: String,
    pub website_url: String,
    pub license_public_key: String,
    pub timeout_secs: u64,
}

fn raw_settings() -> Value {
    serde_json::from_str(include_str!("../remote-config.json")).unwrap_or(Value::Null)
}

/// Debug builds accept environment overrides (for local testing); release builds never do.
fn debug_env(name: &str) -> Option<String> {
    if cfg!(debug_assertions) {
        std::env::var(name).ok().filter(|s| !s.trim().is_empty())
    } else {
        None
    }
}

pub fn settings() -> RemoteSettings {
    let raw = raw_settings();
    let get = |k: &str| raw.get(k).and_then(|v| v.as_str()).unwrap_or("").trim().trim_end_matches('/').to_string();
    let server = debug_env("DOCGEN_SERVER_URL").unwrap_or_else(|| get("serverUrl"));
    let clean = |url: String| if is_https(&url) || is_local_dev_url(&url) { url.trim_end_matches('/').to_string() } else { String::new() };
    RemoteSettings {
        server_url: clean(server),
        portal_url: clean(debug_env("DOCGEN_PORTAL_URL").unwrap_or_else(|| get("portalUrl"))),
        website_url: clean(get("websiteUrl")),
        license_public_key: debug_env("DOCGEN_LICENSE_PUBLIC_KEY").unwrap_or_else(|| get("licensePublicKey")),
        timeout_secs: raw.get("requestTimeoutSecs").and_then(|v| v.as_u64()).unwrap_or(10).clamp(3, 30),
    }
}

pub fn is_https(url: &str) -> bool {
    let lower = url.to_ascii_lowercase();
    lower.starts_with("https://")
        && url.len() > 8
        && url.len() <= 2048
        && !url.chars().any(|c| c.is_whitespace() || c == '"' || c == '<' || c == '>' || c.is_control())
}

/// Plain-HTTP localhost URLs are accepted in debug builds only, to test with a local server.
pub fn is_local_dev_url(url: &str) -> bool {
    cfg!(debug_assertions)
        && (url.starts_with("http://localhost:") || url.starts_with("http://127.0.0.1:"))
        && !url.chars().any(|c| c.is_whitespace())
}

fn agent(timeout: u64) -> ureq::Agent {
    ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(timeout))
        .redirects(3)
        .user_agent(&format!("DocGen/{}", env!("CARGO_PKG_VERSION")))
        .build()
}

fn read_body(response: ureq::Response) -> AppResult<Value> {
    let mut body = String::new();
    response.into_reader().take(MAX_BODY_BYTES).read_to_string(&mut body).map_err(|e| {
        log_error("remote", &e.to_string());
        AppError::new("The server response could not be read.")
    })?;
    if body.trim().is_empty() {
        return Ok(Value::Null);
    }
    serde_json::from_str(&body).map_err(|e| {
        log_error("remote", &format!("invalid json: {e}"));
        AppError::new("The server returned invalid data.")
    })
}

/// Call the server. Maps server error bodies (`{error: {code, message}}`) to friendly errors
/// whose message is prefixed with the code: "CODE|message".
pub fn call(method: &str, path: &str, body: Option<Value>) -> AppResult<Value> {
    let s = settings();
    if s.server_url.is_empty() {
        return Err(AppError::new("OFFLINE_BUILD|This copy of DocGen is not connected to a DocGen server."));
    }
    let url = format!("{}{}", s.server_url, path);
    let req = agent(s.timeout_secs).request(method, &url);
    let result = match body {
        Some(b) => req.set("Content-Type", "application/json").send_string(&b.to_string()),
        None => req.call(),
    };
    match result {
        Ok(resp) => read_body(resp),
        Err(ureq::Error::Status(code, resp)) => {
            let v = read_body(resp).unwrap_or(Value::Null);
            let err_code = v["error"]["code"].as_str().unwrap_or("SERVER_ERROR");
            let message: String = v["error"]["message"]
                .as_str()
                .unwrap_or("The server could not process the request.")
                .chars()
                .filter(|c| !c.is_control())
                .take(300)
                .collect();
            log_error("remote", &format!("{method} {path} -> {code} {err_code}"));
            Err(AppError::new(format!("{err_code}|{message}")))
        }
        Err(e) => {
            log_error("remote", &format!("{method} {path}: {e}"));
            Err(AppError::new("NETWORK|Could not reach the DocGen server. Check your internet connection and try again."))
        }
    }
}

// ---------------------------------------------------------------------------
// Configuration validation
// ---------------------------------------------------------------------------

fn clamp_i64(v: Option<&Value>, default: i64, min: i64, max: i64) -> i64 {
    v.and_then(|x| x.as_i64().or_else(|| x.as_f64().map(|f| f as i64)))
        .unwrap_or(default)
        .clamp(min, max)
}

fn short_text(v: Option<&Value>, max: usize) -> String {
    v.and_then(|x| x.as_str())
        .map(|s| s.chars().filter(|c| !c.is_control() || *c == '\n').take(max).collect())
        .unwrap_or_default()
}

fn https_or_empty(v: Option<&Value>) -> String {
    match v.and_then(|x| x.as_str()) {
        Some(url) if is_https(url) || is_local_dev_url(url) => url.to_string(),
        _ => String::new(),
    }
}

fn opt_date(v: Option<&Value>) -> Value {
    match v.and_then(|x| x.as_str()) {
        Some(s) => chrono::DateTime::parse_from_rfc3339(s).map(|d| Value::String(d.to_rfc3339())).unwrap_or(Value::Null),
        None => Value::Null,
    }
}

fn validate_ad(ad: &Value) -> Option<Value> {
    let id = ad.get("id").and_then(|v| v.as_i64())?;
    let title = short_text(ad.get("title"), 80);
    if title.is_empty() {
        return None;
    }
    let target = ad.get("target").cloned().unwrap_or(json!({}));
    let license_status = match target.get("licenseStatus").and_then(|v| v.as_str()) {
        Some("trial") => "trial",
        Some("licensed") => "licensed",
        _ => "all",
    };
    let platforms: Vec<Value> = target
        .get("platforms")
        .and_then(|v| v.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|p| p.as_str())
                .filter(|p| ["windows", "macos", "linux"].contains(p))
                .map(|p| Value::String(p.to_string()))
                .collect()
        })
        .unwrap_or_default();
    let html: String = ad.get("html").and_then(|v| v.as_str()).unwrap_or("").chars().take(20_000).collect();
    Some(json!({
        "id": id,
        "version": clamp_i64(ad.get("version"), 1, 0, 1_000_000),
        "title": title,
        "description": short_text(ad.get("description"), 300),
        "imageUrl": https_or_empty(ad.get("imageUrl")),
        "linkUrl": https_or_empty(ad.get("linkUrl")),
        "html": html,
        "ctaText": short_text(ad.get("ctaText"), 30),
        "frequencyDays": clamp_i64(ad.get("frequencyDays"), 7, 0, 365),
        "maxPerMonth": clamp_i64(ad.get("maxPerMonth"), 4, 0, 31),
        "priority": clamp_i64(ad.get("priority"), 0, -100, 100),
        "startAt": opt_date(ad.get("startAt")),
        "endAt": opt_date(ad.get("endAt")),
        "target": {
            "licenseStatus": license_status,
            "platforms": platforms,
            "minVersion": short_text(target.get("minVersion"), 20),
            "maxVersion": short_text(target.get("maxVersion"), 20),
        },
    }))
}

/// Validate and normalise the server configuration. Invalid parts are dropped.
pub fn validate_config(raw: &Value) -> AppResult<Value> {
    let root = raw.as_object().ok_or_else(|| AppError::new("The configuration has an unexpected format."))?;
    let empty = Map::new();
    let policy = root.get("adPolicy").and_then(|v| v.as_object()).unwrap_or(&empty);
    let help = root.get("help").and_then(|v| v.as_object()).unwrap_or(&empty);
    let app = root.get("app").and_then(|v| v.as_object()).unwrap_or(&empty);
    let ads: Vec<Value> = root
        .get("ads")
        .and_then(|v| v.as_array())
        .map(|a| a.iter().take(20).filter_map(validate_ad).collect())
        .unwrap_or_default();
    let videos: Vec<Value> = help
        .get("videos")
        .and_then(|v| v.as_array())
        .map(|a| {
            a.iter()
                .take(50)
                .filter_map(|v| {
                    let url = https_or_empty(v.get("url"));
                    let title = short_text(v.get("title"), 100);
                    if url.is_empty() || title.is_empty() {
                        return None;
                    }
                    Some(json!({
                        "title": title,
                        "url": url,
                        "description": short_text(v.get("description"), 200),
                        "duration": short_text(v.get("duration"), 10),
                    }))
                })
                .collect()
        })
        .unwrap_or_default();
    let interval = clamp_i64(root.get("configIntervalDays"), 30, 1, 365);
    Ok(json!({
        "version": clamp_i64(root.get("version"), 1, 0, 1_000_000),
        "configIntervalDays": interval,
        "nextCheckAt": opt_date(root.get("nextCheckAt")),
        "adPolicy": {
            "minDaysBetweenAds": clamp_i64(policy.get("minDaysBetweenAds"), 7, 0, 365),
            "maxPerMonth": clamp_i64(policy.get("maxPerMonth"), 4, 0, 31),
            "firstOpenDelayDays": clamp_i64(policy.get("firstOpenDelayDays"), 3, 0, 365),
        },
        "defaultAdEnabled": root.get("defaultAdEnabled").and_then(|v| v.as_bool()).unwrap_or(true),
        "ads": ads,
        "help": { "youtubeChannel": https_or_empty(help.get("youtubeChannel")), "videos": videos },
        "app": {
            "latestVersion": short_text(app.get("latestVersion"), 20),
            "downloadUrl": https_or_empty(app.get("downloadUrl")),
            "message": short_text(app.get("message"), 300),
        },
    }))
}

pub fn fetch_config() -> AppResult<Value> {
    let path = format!(
        "/api/app/config?platform={}&version={}",
        platform(),
        env!("CARGO_PKG_VERSION")
    );
    validate_config(&call("GET", &path, None)?)
}

pub fn platform() -> &'static str {
    match std::env::consts::OS {
        "windows" => "windows",
        "macos" => "macos",
        _ => "linux",
    }
}

/// Fire-and-forget anonymous ad counter. Never blocks the UI.
pub fn send_event(event: &str, ad_id: i64) {
    if settings().server_url.is_empty() {
        return;
    }
    let payload = json!({ "event": event, "adId": ad_id.max(0) });
    std::thread::spawn(move || {
        let _ = call("POST", "/api/app/events", Some(payload));
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_config_and_drops_unsafe_values() {
        let cfg = validate_config(&json!({
            "version": 3,
            "configIntervalDays": 999,
            "ads": [
                { "id": 1, "title": "Offer", "imageUrl": "https://cdn.test/a.png", "linkUrl": "javascript:alert(1)",
                  "html": "<b>x</b>", "target": { "licenseStatus": "trial", "platforms": ["windows", "dos"] } },
                { "id": 2, "title": "" },
                { "title": "no id" }
            ],
            "help": { "videos": [ { "title": "Intro", "url": "https://www.youtube.com/watch?v=abc" }, { "title": "Bad", "url": "http://x" } ] },
            "app": { "downloadUrl": "ftp://x" }
        }))
        .unwrap();
        assert_eq!(cfg["configIntervalDays"], 365);
        assert_eq!(cfg["ads"].as_array().unwrap().len(), 1);
        assert_eq!(cfg["ads"][0]["linkUrl"], "");
        assert_eq!(cfg["ads"][0]["imageUrl"], "https://cdn.test/a.png");
        assert_eq!(cfg["ads"][0]["target"]["platforms"], json!(["windows"]));
        assert_eq!(cfg["help"]["videos"].as_array().unwrap().len(), 1);
        assert_eq!(cfg["app"]["downloadUrl"], "");
        assert!(validate_config(&json!([1])).is_err());
    }
}
