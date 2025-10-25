-- Skill Invocation Logging Schema
-- ACL Level 4: Project-wide Visibility

-- Skill Invocations Table
CREATE TABLE skill_invocations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    skill_name TEXT NOT NULL,
    user_prompt_hash TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    outcome TEXT NOT NULL,
    input_tokens INTEGER,
    output_tokens INTEGER,
    confidence_score REAL,
    context_reduction_percentage REAL
);

-- Skill Accuracy Summary Table
CREATE TABLE skill_accuracy_summary (
    skill_name TEXT PRIMARY KEY,
    total_invocations INTEGER DEFAULT 0,
    successful_invocations INTEGER DEFAULT 0,
    average_confidence REAL DEFAULT 0.0,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Context Reduction Metrics Table
CREATE TABLE context_reduction_metrics (
    skill_name TEXT,
    initial_context_tokens INTEGER,
    final_context_tokens INTEGER,
    reduction_percentage REAL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (skill_name, timestamp)
);

-- Indexes for Performance
CREATE INDEX idx_skill_invocations_timestamp ON skill_invocations(timestamp);
CREATE INDEX idx_skill_invocations_outcome ON skill_invocations(outcome);
CREATE INDEX idx_skill_accuracy_summary_success_rate ON skill_accuracy_summary(successful_invocations * 1.0 / total_invocations);

-- Triggers for Automatic Summary Updates
CREATE TRIGGER update_skill_accuracy_summary
AFTER INSERT ON skill_invocations
BEGIN
    INSERT OR REPLACE INTO skill_accuracy_summary (
        skill_name,
        total_invocations,
        successful_invocations,
        average_confidence,
        last_updated
    ) VALUES (
        NEW.skill_name,
        (SELECT COALESCE(total_invocations, 0) + 1 FROM skill_accuracy_summary WHERE skill_name = NEW.skill_name),
        (SELECT COALESCE(successful_invocations, 0) + (CASE WHEN NEW.outcome = 'success' THEN 1 ELSE 0 END) FROM skill_accuracy_summary WHERE skill_name = NEW.skill_name),
        (SELECT (COALESCE(average_confidence, 0) * COALESCE(total_invocations, 0) + NEW.confidence_score) / (COALESCE(total_invocations, 0) + 1) FROM skill_accuracy_summary WHERE skill_name = NEW.skill_name),
        CURRENT_TIMESTAMP
    );
END;