#!/usr/bin/env bash

# Playbook Auto-Update Script

set -euo pipefail

# Repo root, derived from this script's own location so the script
# works from any checkout on any machine.
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../../../../.." && pwd -P)"

# Validate input
[[ $# -ne 2 ]] && { echo "Usage: $0 --retrospective-json JSON --task-id TASK_ID"; exit 1; }

# Parse arguments
while [[ $# -gt 0 ]]; do
    key="$1"
    case $key in
        --retrospective-json)
            RETROSPECTIVE_JSON="$2"
            shift 2
            ;;
        --task-id)
            TASK_ID="$2"
            shift 2
            ;;
        *)
            echo "Unknown parameter: $1"
            exit 1
            ;;
    esac
done

# Validate required parameters
[[ -z "${RETROSPECTIVE_JSON:-}" ]] && { echo "Error: retrospective-json is required"; exit 1; }
[[ -z "${TASK_ID:-}" ]] && { echo "Error: task-id is required"; exit 1; }

# Playbook path
PLAYBOOK_PATH="$PROJECT_ROOT/docs/PLAYBOOK.json"
BACKUP_PATH="$PROJECT_ROOT/docs/playbook-backups/PLAYBOOK_${TASK_ID}_$(date +%Y%m%d_%H%M%S).json"

# Ensure backup directory exists
mkdir -p "$(dirname "$BACKUP_PATH")"

# Backup current playbook
cp "$PLAYBOOK_PATH" "$BACKUP_PATH"

# Update playbook with jq
updated_playbook=$(echo "$RETROSPECTIVE_JSON" | jq '
    # Update or create tasks record
    .tasks //= [] |
    .tasks += [{
        "task_id": env.TASK_ID,
        "sprint_metrics": {
            "total_iterations": .velocity.total_iterations,
            "confidence_trajectory": .confidence_trajectory,
            "final_confidence": .confidence_trajectory["iteration_3"] // 0
        },
        "agent_performance": .agent_performance,
        "patterns_identified": .patterns_identified
    }] |

    # Update agent performance tracking
    .agent_performance_history //= {} |
    reduce .agent_performance.top_performers[] as $agent (
        .;
        .agent_performance_history[$agent.agent] //= {
            "total_tasks": 0,
            "avg_confidence": 0
        } |
        .agent_performance_history[$agent.agent].total_tasks += 1 |
        .agent_performance_history[$agent.agent].avg_confidence =
            ((.agent_performance_history[$agent.agent].avg_confidence *
              (.agent_performance_history[$agent.agent].total_tasks - 1) +
              $agent.avg_confidence) /
             .agent_performance_history[$agent.agent].total_tasks)
    ) |

    # Track successful strategies
    .successful_strategies //= [] |
    .successful_strategies += .lessons_learned |

    # Remove redundant data to keep playbook lean
    del(.feedback_themes, .bottlenecks)
')

# Write updated playbook
echo "$updated_playbook" | jq . > "$PLAYBOOK_PATH"

# Log update
echo "Playbook updated for task $TASK_ID: $BACKUP_PATH → $PLAYBOOK_PATH"