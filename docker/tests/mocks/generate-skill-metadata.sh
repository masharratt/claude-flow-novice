#!/bin/bash
# Generate Mock Skill Metadata for Testing
# Creates realistic skill metadata for Phase 4 testing

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_DIR="${1:-${SCRIPT_DIR}/data}"

mkdir -p "$OUTPUT_DIR"

# Generate skill metadata
cat > "$OUTPUT_DIR/skill-metadata.json" <<'EOF'
{
  "skills": [
    {
      "skill_id": "skill-deploy-frontend-v1",
      "name": "Deploy Frontend Build",
      "version": "1.0.0",
      "pattern_id": "pattern-001",
      "created_at": "2025-11-15T10:00:00Z",
      "status": "active",
      "expert_approved": true,
      "executions": 145,
      "success_rate": 0.97,
      "avg_duration": 405,
      "cost_avoided_per_execution": 2.50,
      "total_cost_avoided": 362.50
    },
    {
      "skill_id": "skill-database-migration-v1",
      "name": "Database Migration Workflow",
      "version": "1.0.0",
      "pattern_id": "pattern-002",
      "created_at": "2025-11-15T11:00:00Z",
      "status": "active",
      "expert_approved": true,
      "executions": 32,
      "success_rate": 1.0,
      "avg_duration": 490,
      "cost_avoided_per_execution": 5.00,
      "total_cost_avoided": 160.00
    },
    {
      "skill_id": "skill-provision-team-v1",
      "name": "Team Provisioning Workflow",
      "version": "1.0.0",
      "pattern_id": "pattern-003",
      "created_at": "2025-11-15T12:00:00Z",
      "status": "pending_expert_review",
      "expert_approved": false,
      "executions": 0,
      "success_rate": null,
      "avg_duration": null,
      "cost_avoided_per_execution": 15.00,
      "total_cost_avoided": 0.00
    }
  ]
}
EOF

echo "Generated skill metadata: $OUTPUT_DIR/skill-metadata.json"
