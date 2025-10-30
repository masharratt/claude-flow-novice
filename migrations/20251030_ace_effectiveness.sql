-- ACE System Effectiveness Tracking Schema

CREATE TABLE IF NOT EXISTS ace_effectiveness (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    ace_enabled BOOLEAN DEFAULT FALSE,
    iterations INTEGER DEFAULT 1,
    first_confidence REAL DEFAULT 0.0,
    final_confidence REAL DEFAULT 0.0,
    domain TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ace_performance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT NOT NULL,
    context_injection_time REAL DEFAULT 0.0,
    iteration_time REAL DEFAULT 0.0,
    roi_score REAL DEFAULT 0.0,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_task_timestamp ON ace_effectiveness(task_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_perf_task_timestamp ON ace_performance(task_id, timestamp);
