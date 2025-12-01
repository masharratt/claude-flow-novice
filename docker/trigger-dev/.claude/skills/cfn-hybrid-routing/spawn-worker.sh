#!/usr/bin/env bash
set -euo pipefail

# Hybrid Routing Worker Spawner
# Dynamically configures and launches routing workers

CONFIG_PATH="$(dirname "$0")/config.json"

# Load configuration
SKILL_NAME=$(jq -r '.skill_name' "$CONFIG_PATH")
PRIMARY_CHANNEL=$(jq -r '.routing_strategies.primary.type' "$CONFIG_PATH")
SECONDARY_CHANNEL=$(jq -r '.routing_strategies.secondary.type' "$CONFIG_PATH")

# Worker spawning function
spawn_routing_worker() {
    local channel_type="$1"
    local worker_id="$2"

    case "$channel_type" in
        "redis-pubsub")
            ./.claude/skills/cfn-redis-coordination/spawn-agent.sh \
                --skill-id "$SKILL_NAME" \
                --agent-id "routing-worker-$worker_id" \
                --strategy "$channel_type"
            ;;
        "websocket")
            ./.claude/skills/cfn-agent-spawning/spawn-agent.sh \
                --skill-id "$SKILL_NAME" \
                --agent-id "routing-worker-$worker_id" \
                --strategy "$channel_type"
            ;;
        *)
            echo "Unsupported channel type: $channel_type"
            exit 1
            ;;
    esac
}

# Spawn primary and secondary workers
spawn_routing_worker "$PRIMARY_CHANNEL" "primary"
spawn_routing_worker "$SECONDARY_CHANNEL" "secondary"

# Final status report
echo "Hybrid Routing Workers Spawned Successfully"