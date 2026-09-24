-- Local advertisement / remote-configuration state. Nothing here is business data.
CREATE TABLE ad_state (
    key    TEXT PRIMARY KEY,
    value  TEXT NOT NULL
);

CREATE TABLE ad_events (
    id          INTEGER PRIMARY KEY,
    event       TEXT NOT NULL CHECK (event IN ('AD_SHOWN', 'AD_CLICKED', 'AD_CLOSED')),
    ad_version  TEXT NOT NULL DEFAULT '',
    sent        INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
