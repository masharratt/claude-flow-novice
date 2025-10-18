-- Evidence Chain Schema for CFN Loop Validation
CREATE TABLE validation_evidence (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT NOT NULL,
    validation_mode TEXT NOT NULL,
    confidence REAL,
    consensus_score REAL,
    gate_score REAL,
    iteration INTEGER,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT CHECK(status IN ('pending', 'success', 'retry', 'escalate', 'failure'))
);

CREATE INDEX idx_task_validation ON validation_evidence(task_id, validation_mode);

-- Stored Procedure for Inserting Validation Evidence
CREATE PROCEDURE insert_validation_evidence(
    p_task_id TEXT,
    p_validation_mode TEXT,
    p_confidence REAL,
    p_consensus_score REAL,
    p_gate_score REAL,
    p_iteration INTEGER,
    p_status TEXT
)
BEGIN
    INSERT INTO validation_evidence (
        task_id,
        validation_mode,
        confidence,
        consensus_score,
        gate_score,
        iteration,
        status
    ) VALUES (
        p_task_id,
        p_validation_mode,
        p_confidence,
        p_consensus_score,
        p_gate_score,
        p_iteration,
        p_status
    );
END;

-- Function for Calculating Validation Success Rate
CREATE FUNCTION calculate_validation_success_rate(p_task_id TEXT)
RETURNS REAL
BEGIN
    DECLARE total_attempts INTEGER;
    DECLARE successful_attempts INTEGER;

    SELECT COUNT(*) INTO total_attempts
    FROM validation_evidence
    WHERE task_id = p_task_id;

    SELECT COUNT(*) INTO successful_attempts
    FROM validation_evidence
    WHERE task_id = p_task_id AND status = 'success';

    RETURN CASE
        WHEN total_attempts > 0
        THEN (successful_attempts * 1.0) / total_attempts
        ELSE 0.0
    END;
END;