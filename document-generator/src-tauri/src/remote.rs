//! Remote advertisement configuration.
//!
//! This is the only part of DocGen that talks to the internet. It downloads a
//! small JSON document from the server configured in `remote-config.json`,
//! validates it strictly and returns a sanitised copy. Only plain values
//! (booleans, numbers, dates, HTTPS URLs, short texts) survive validation;
//! nothing received from the server is ever executed.
//!
//! No business data is ever sent. Event pings contain only the event name,
//! the ad version, the app version and the operating system name.

use crate::db::{log_error, AppError, AppResult};
use serde_json::{json, Map, Value};
use std::io::Read;
use std::time::Duration;

const MAX_CONFIG_BYTES: u64 = 64 * 1024;

#[derive(Debug, Clone)]
pub struct RemoteSettings {
    pub config_url: String,
    pub events_url: String,
    pub timeout_secs: u64,
}

pub fn settings() -> RemoteSettings {
    let raw: Value = serde_json::from_str(include_str!("../remote-config.json")).unwrap_or(Value::Null);
    let get = |k: &str| raw.get(k).and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
    let config_url = std::env::var("DOCGEN_CONFIG_URL").ok().filter(|s| !s.is_empty()).unwrap_or_else(|| get("configUrl"));
    let events_url = std::env::var("DOCGEN_EVENTS_URL").ok().filter(|s| !s.is_empty()).unwrap_or_else(|| get("eventsUrl"));
    RemoteSettings {
        config_url: if is_https(&config_url) || is_local_dev_url(&config_url) { config_url } else { String::new() },
        events_url: if is_https(&events_url) || is_local_dev_url(&events_url) { events_url } else { String::new() },
        timeout_secs: raw.get("requestTimeoutSecs").and_then(|v| v.as_u64()).unwrap_or(8).clamp(2, 30),
    }
}

pub fn is_https(url: &str) -> bool {
    let lower = url.to_ascii_lowercase();
    lower.starts_with("https://") && url.len() > 8 && url.len() <= 2048 && !url.chars().any(|c| c.is_whitespace() || c == '"' || c == '<' || c == '>')
}

/// Plain-HTTP localhost URLs are accepted in debug builds only, to test a local ad server.
fn is_local_dev_url(url: &str) -> bool {
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

/// Download and validate the remote configuration.
pub fn fetch_config() -> AppResult<Value> {
    let s = settings();
    if s.config_url.is_empty() {
        return Err(AppError::new("Remote configuration is not set up."));
    }
    let response = agent(s.timeout_secs).get(&s.config_url).call().map_err(|e| {
        log_error("remote-config", &e.to_string());
        AppError::new("Could not reach the configuration server.")
    })?;
    let mut body = String::new();
    response
        .into_reader()
        .take(MAX_CONFIG_BYTES)
        .read_to_string(&mut body)
        .map_err(|e| {
            log_error("remote-config", &e.to_string());
            AppError::new("Could not read the configuration.")
        })?;
    let raw: Value = serde_json::from_str(&body).map_err(|e| {
        log_error("remote-config", &format!("invalid json: {e}"));
        AppError::new("The configuration server returned invalid data.")
    })?;
    validate_config(&raw)
}

fn clamp_u64(v: Option<&Value>, default: u64, min: u64, max: u64) -> u64 {
    v.and_then(|x| x.as_u64().or_else(|| x.as_f64().map(|f| f.max(0.0) as u64)))
        .unwrap_or(default)
        .clamp(min, max)
}

fn short_text(v: Option<&Value>, max: usize) -> String {
    v.and_then(|x| x.as_str())
        .map(|s| s.chars().filter(|c| !c.is_control()).take(max).collect())
        .unwrap_or_default()
}

fn valid_date(v: Option<&Value>) -> AppResult<Option<String>> {
    match v.and_then(|x| x.as_str()) {
        None => Ok(None),
        Some("") => Ok(None),
        Some(s) => chrono::DateTime::parse_from_rfc3339(s)
            .map(|d| Some(d.to_rfc3339()))
            .map_err(|_| AppError::new("The configuration contains an invalid date.")),
    }
}

fn optional_https(v: Option<&Value>) -> AppResult<String> {
    match v.and_then(|x| x.as_str()) {
        None | Some("") => Ok(String::new()),
        Some(url) if is_https(url) || is_local_dev_url(url) => Ok(url.to_string()),
        Some(_) => Err(AppError::new("The configuration contains a non-HTTPS URL.")),
    }
}

/// Validate and normalise both supported shapes:
///  * `{ version, fetchIntervalDays, ads: { enabled, monthlyLimit, ... } }`
///  * legacy `{ adsEnabled, monthlyLimit, minimumDaysBetweenAds, ad: { ... } }`
pub fn validate_config(raw: &Value) -> AppResult<Value> {
    let root = raw.as_object().ok_or_else(|| AppError::new("The configuration has an unexpected format."))?;
    let empty = Map::new();

    let (ads, legacy_ad) = match (root.get("ads"), root.get("ad")) {
        (Some(Value::Object(a)), _) => (a, None),
        (_, Some(Value::Object(ad))) => (root, Some(ad)),
        _ => (&empty, None),
    };
    let pick = |key: &str| -> Option<&Value> { legacy_ad.and_then(|a| a.get(key)).or_else(|| ads.get(key)) };

    let enabled = match legacy_ad {
        Some(ad) => {
            root.get("adsEnabled").and_then(|v| v.as_bool()).unwrap_or(false)
                && ad.get("enabled").and_then(|v| v.as_bool()).unwrap_or(true)
        }
        None => ads.get("enabled").and_then(|v| v.as_bool()).unwrap_or(false),
    };

    let content_url = optional_https(pick("contentUrl"))?;
    let click_url = optional_https(pick("clickUrl"))?;
    let start_at = valid_date(pick("startAt"))?;
    let end_at = valid_date(pick("endAt"))?;
    if let (Some(s), Some(e)) = (&start_at, &end_at) {
        let s = chrono::DateTime::parse_from_rfc3339(s).map_err(|_| AppError::new("Invalid date"))?;
        let e = chrono::DateTime::parse_from_rfc3339(e).map_err(|_| AppError::new("Invalid date"))?;
        if e < s {
            return Err(AppError::new("The configuration has an end date before its start date."));
        }
    }
    let ad_type = short_text(pick("type"), 10).to_ascii_uppercase();
    if !ad_type.is_empty() && ad_type != "HTML" {
        return Err(AppError::new("Unsupported advertisement type."));
    }
    let ad_version = pick("version")
        .or_else(|| pick("id"))
        .map(|v| match v {
            Value::String(s) => s.chars().take(40).collect::<String>(),
            other => other.to_string().chars().take(40).collect(),
        })
        .unwrap_or_default();
    let probability = pick("probability").and_then(|v| v.as_f64()).unwrap_or(1.0).clamp(0.0, 1.0);

    Ok(json!({
        "version": clamp_u64(root.get("version"), 1, 0, 1_000_000),
        "fetchIntervalDays": clamp_u64(root.get("fetchIntervalDays").or_else(|| root.get("configFetchInterval")), 7, 1, 90),
        "ads": {
            "enabled": enabled && !content_url.is_empty(),
            "monthlyLimit": clamp_u64(pick("monthlyLimit"), 4, 0, 31),
            "minimumDaysBetweenAds": clamp_u64(pick("minimumDaysBetweenAds"), 7, 0, 365),
            "firstOpenDelayDays": clamp_u64(pick("firstOpenDelayDays"), 0, 0, 365),
            "randomize": pick("randomize").and_then(|v| v.as_bool()).unwrap_or(false),
            "probability": probability,
            "contentUrl": content_url,
            "clickUrl": click_url,
            "title": short_text(pick("title"), 60),
            "ctaText": short_text(pick("ctaText"), 30),
            "startAt": start_at,
            "endAt": end_at,
            "adVersion": ad_version,
        }
    }))
}

/// Fire-and-forget anonymous event ping. Never blocks the UI and never fails loudly.
pub fn send_event(event: &str, ad_version: &str) {
    let s = settings();
    if s.events_url.is_empty() {
        return;
    }
    let payload = json!({
        "event": event,
        "adVersion": ad_version,
        "appVersion": env!("CARGO_PKG_VERSION"),
        "os": std::env::consts::OS,
    });
    std::thread::spawn(move || {
        if let Err(e) = agent(s.timeout_secs).post(&s.events_url)
            .set("Content-Type", "application/json")
            .send_string(&payload.to_string())
        {
            log_error("ad-event", &e.to_string());
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_new_format() {
        let cfg = validate_config(&json!({
            "version": 3,
            "ads": {
                "enabled": true, "monthlyLimit": 4, "minimumDaysBetweenAds": 7,
                "contentUrl": "https://example.com/ad.html", "clickUrl": "https://example.com",
                "startAt": "2026-01-01T00:00:00Z", "endAt": "2026-12-31T23:59:59Z"
            }
        }))
        .unwrap();
        assert_eq!(cfg["ads"]["enabled"], true);
        assert_eq!(cfg["ads"]["monthlyLimit"], 4);
        assert_eq!(cfg["fetchIntervalDays"], 7);
    }

    #[test]
    fn validates_legacy_format() {
        let cfg = validate_config(&json!({
            "adsEnabled": true, "monthlyLimit": 99, "minimumDaysBetweenAds": 7,
            "ad": { "enabled": true, "type": "HTML", "contentUrl": "https://example.com/ad.html", "version": 3 }
        }))
        .unwrap();
        assert_eq!(cfg["ads"]["enabled"], true);
        assert_eq!(cfg["ads"]["monthlyLimit"], 31);
        assert_eq!(cfg["ads"]["adVersion"], "3");
    }

    #[test]
    fn rejects_insecure_urls_and_scripts() {
        assert!(validate_config(&json!({ "ads": { "enabled": true, "contentUrl": "http://evil.test/x" } })).is_err());
        assert!(validate_config(&json!({ "ads": { "enabled": true, "contentUrl": "javascript:alert(1)" } })).is_err());
        assert!(validate_config(&json!({ "ad": { "type": "SCRIPT", "contentUrl": "https://a.test" }, "adsEnabled": true })).is_err());
        assert!(validate_config(&json!([1, 2])).is_err());
    }
}
