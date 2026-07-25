-- Decision Log Schema: SQLite + FTS5
-- Messages table stores user and assistant conversation messages

CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    project TEXT NOT NULL,
    uuid TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    timestamp TEXT NOT NULL
);

-- FTS5 with porter stemmer for better recall (e.g. "testing" matches "test")
CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
    content,
    content='messages',
    content_rowid='id',
    tokenize='porter unicode61'
);

-- Keep FTS in sync via triggers
CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
    INSERT INTO messages_fts(rowid, content) VALUES (new.id, new.content);
END;

CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
    INSERT INTO messages_fts(messages_fts, rowid, content) VALUES('delete', old.id, old.content);
END;

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_uuid ON messages(uuid);
CREATE INDEX IF NOT EXISTS idx_messages_project ON messages(project);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);

-- Track ingestion progress per session file
CREATE TABLE IF NOT EXISTS ingest_state (
    session_file TEXT PRIMARY KEY,
    last_line INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
);

-- Structured decision records (option 2): curated plan-time decisions,
-- distinct from the raw `messages` conversation index. Written by record.sh
-- (called from the cfn-decide phase), read by decisions.sh. Survives sessions,
-- queryable per-project, separate from conversation noise.
CREATE TABLE IF NOT EXISTS decisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project TEXT NOT NULL,
    slug TEXT NOT NULL,            -- plan slug (matches planning/DECISIONS_<slug>.md)
    decision_id TEXT NOT NULL,     -- stable id within a plan (D1, D2, ...)
    title TEXT NOT NULL,
    chosen TEXT NOT NULL,          -- the option selected
    rationale TEXT NOT NULL DEFAULT '',
    alternatives TEXT NOT NULL DEFAULT '',  -- considered-but-rejected
    status TEXT NOT NULL DEFAULT 'accepted'
        CHECK(status IN ('proposed','accepted','superseded')),
    blocking INTEGER NOT NULL DEFAULT 0,    -- 1 = blocked the build until answered
    session_id TEXT NOT NULL DEFAULT '',
    superseded_by TEXT NOT NULL DEFAULT '', -- decision_id that replaced this one
    timestamp TEXT NOT NULL,
    UNIQUE(project, slug, decision_id)
);

CREATE INDEX IF NOT EXISTS idx_decisions_project ON decisions(project);
CREATE INDEX IF NOT EXISTS idx_decisions_slug ON decisions(project, slug);
CREATE INDEX IF NOT EXISTS idx_decisions_status ON decisions(status);

-- FTS5 mirror for search over decision text
CREATE VIRTUAL TABLE IF NOT EXISTS decisions_fts USING fts5(
    title, chosen, rationale, alternatives,
    content='decisions', content_rowid='id',
    tokenize='porter unicode61'
);

CREATE TRIGGER IF NOT EXISTS decisions_ai AFTER INSERT ON decisions BEGIN
    INSERT INTO decisions_fts(rowid, title, chosen, rationale, alternatives)
    VALUES (new.id, new.title, new.chosen, new.rationale, new.alternatives);
END;

CREATE TRIGGER IF NOT EXISTS decisions_ad AFTER DELETE ON decisions BEGIN
    INSERT INTO decisions_fts(decisions_fts, rowid, title, chosen, rationale, alternatives)
    VALUES('delete', old.id, old.title, old.chosen, old.rationale, old.alternatives);
END;

CREATE TRIGGER IF NOT EXISTS decisions_au AFTER UPDATE ON decisions BEGIN
    INSERT INTO decisions_fts(decisions_fts, rowid, title, chosen, rationale, alternatives)
    VALUES('delete', old.id, old.title, old.chosen, old.rationale, old.alternatives);
    INSERT INTO decisions_fts(rowid, title, chosen, rationale, alternatives)
    VALUES (new.id, new.title, new.chosen, new.rationale, new.alternatives);
END;
