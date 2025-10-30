DELETE FROM context_reflections WHERE id LIKE 'ap-format-%';
INSERT INTO context_reflections (
    id, reflection_type, task_id, swarm_id,
    execution_trace, feedback_signals, extracted_lessons, metadata,
    confidence, created_at, success_count, total_count
) VALUES
(
    'ap-format-001',
    'anti-pattern',
    'test-task-001',
    'test-swarm-001',
    json('{"iterations": 3, "loops": ["loop3", "loop2"], "timeline": []}'),
    json('{"loop2_feedback": ["Security vulnerability detected"], "product_owner_decision": "ITERATE"}'),
    json('{"anti_pattern": "Long-lived JWT tokens without rotation", "solution": "Use 15-min access tokens + refresh rotation", "impact": "Security vulnerability"}'),
    json('{"severity": "critical", "domain": "security", "sprint_ref": "auth-session-001", "keywords": ["security", "jwt", "session"]}'),
    0.45,
    datetime('now'),
    0,
    3
),
(
    'ap-format-002',
    'warning',
    'test-task-002',
    'test-swarm-001',
    json('{"iterations": 2, "loops": ["loop3"], "timeline": []}'),
    json('{"loop2_feedback": ["Add error boundaries"], "product_owner_decision": "ITERATE"}'),
    json('{"anti_pattern": "Missing error boundaries in React components", "solution": "Wrap components in React ErrorBoundary", "impact": "Runtime crashes"}'),
    json('{"severity": "warning", "domain": "frontend", "sprint_ref": "dashboard-ui-002", "keywords": ["frontend", "react", "error-handling"]}'),
    0.65,
    datetime('now'),
    1,
    3
),
(
    'ap-format-003',
    'anti-pattern',
    'test-task-003',
    'test-swarm-001',
    json('{"iterations": 1, "loops": ["loop3"], "timeline": []}'),
    json('{"loop2_feedback": ["Critical security issue"], "product_owner_decision": "ITERATE"}'),
    json('{"anti_pattern": "API key exposed in configuration", "solution": null, "impact": "Critical security breach"}'),
    json('{"severity": "critical", "domain": "security", "sprint_ref": "config-security-001", "keywords": ["security", "credentials"]}'),
    0.38,
    datetime('now'),
    0,
    1
),
(
    'ap-format-004',
    'failure',
    'test-task-004',
    'test-swarm-001',
    json('{"iterations": 2, "loops": ["loop3", "loop2"], "timeline": []}'),
    json('{"loop2_feedback": ["Performance issue"], "product_owner_decision": "ITERATE"}'),
    json('{"anti_pattern": "N+1 query problem in ORM without eager loading", "solution": "Use .includes() or .preload() for associations", "impact": "Performance degradation"}'),
    json('{"severity": "medium", "domain": "backend", "sprint_ref": "api-performance-001", "keywords": ["backend", "database", "performance"]}'),
    0.72,
    datetime('now'),
    2,
    4
);
