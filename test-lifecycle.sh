#!/bin/bash

echo "=== TESTING SQLITE LIFECYCLE HOOKS ==="

# Create test database
DB_PATH="./test-agent-lifecycle.db"

echo "1. Creating database..."
sqlite3 "$DB_PATH" << 'EOF'
CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'spawned',
    confidence REAL,
    spawned_at TEXT NOT NULL,
    completed_at TEXT,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS lifecycle_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    confidence REAL,
    reasoning TEXT,
    timestamp TEXT NOT NULL,
    FOREIGN KEY (agent_id) REFERENCES agents(id)
);
EOF

echo "2. Testing agent spawn..."
AGENT_ID="test-docker-$(date +%s)"
sqlite3 "$DB_PATH" << EOF
INSERT INTO agents (
    id, name, type, status, spawned_at, updated_at
) VALUES (
    '$AGENT_ID',
    'Test Docker Specialist',
    'docker-specialist',
    'spawned',
    datetime('now'),
    datetime('now')
);

INSERT INTO lifecycle_events (
    agent_id, event_type, reasoning, timestamp
) VALUES (
    '$AGENT_ID',
    'spawn',
    'Agent spawned via lifecycle hook',
    datetime('now')
);
EOF

echo "3. Testing confidence update..."
sqlite3 "$DB_PATH" << EOF
UPDATE agents
SET confidence = 0.85, updated_at = datetime('now')
WHERE id = '$AGENT_ID';

INSERT INTO lifecycle_events (
    agent_id, event_type, confidence, reasoning, timestamp
) VALUES (
    '$AGENT_ID',
    'confidence_update',
    0.85,
    'Implementation complete, all tests passing',
    datetime('now')
);
EOF

echo "4. Testing agent completion..."
sqlite3 "$DB_PATH" << EOF
UPDATE agents
SET status = 'completed',
    confidence = 0.90,
    completed_at = datetime('now'),
    updated_at = datetime('now')
WHERE id = '$AGENT_ID';

INSERT INTO lifecycle_events (
    agent_id, event_type, confidence, reasoning, timestamp
) VALUES (
    '$AGENT_ID',
    'complete',
    0.90,
    'Docker setup complete with monitoring configured',
    datetime('now')
);
EOF

echo "5. Querying results..."
echo ""
echo "=== Agent Record ==="
sqlite3 "$DB_PATH" "SELECT * FROM agents WHERE id = '$AGENT_ID';"

echo ""
echo "=== Lifecycle Events ==="
sqlite3 "$DB_PATH" "SELECT * FROM lifecycle_events WHERE agent_id = '$AGENT_ID' ORDER BY timestamp;"

echo ""
echo "6. CFN Loop Gate Check..."
CONFIDENCE=$(sqlite3 "$DB_PATH" "SELECT confidence FROM agents WHERE id = '$AGENT_ID';")
if (( $(echo "$CONFIDENCE >= 0.75" | bc -l) )); then
    echo "✅ CFN Loop 3 Gate: PASS (confidence: $CONFIDENCE)"
else
    echo "❌ CFN Loop 3 Gate: FAIL (confidence: $CONFIDENCE)"
fi

echo ""
echo "✅ SQLite lifecycle hook test complete!"
echo "Database: $DB_PATH"
echo "Agent ID: $AGENT_ID"