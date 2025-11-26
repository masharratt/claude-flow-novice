#!/usr/bin/env bash
# Transparency Middleware Wrapper
# Wraps agent execution with automatic memory capture

# Strict error handling
set -euo pipefail

# Logging configuration
LOG_DIR="/var/log/claude-flow/transparency-middleware"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

# Validate input arguments
if [[ $# -lt 3 ]]; then
    echo "Error: Insufficient arguments" >&2
    echo "Usage: $0 <AGENT_ROLE> <AGENT_ID> <TASK_ID> [ADDITIONAL_ARGS...]" >&2
    exit 1
fi

# Parse arguments
AGENT_ROLE="$1"
AGENT_ID="$2"
TASK_ID="$3"
shift 3  # Remove first three arguments, leaving any additional args

# Create log directory if it doesn't exist
mkdir -p "${LOG_DIR}/${TASK_ID}"

# Initialize middleware and pre-execution hooks
initialize_middleware() {
    node -e "
    import {TransparencyMiddleware} from '.claude/skills/cfn-cfn-.claude/skills/cfn-cfn-.claude/skills/cfn-cfn-src/middleware/transparency-middleware.js';
    const middleware = new TransparencyMiddleware();
    await middleware.initialize({
        agentRole: '${AGENT_ROLE}',
        agentId: '${AGENT_ID}',
        taskId: '${TASK_ID}'
    });
    await middleware.preExecutionHook();
    " || {
        echo "Middleware initialization failed" >&2
        exit 2
    }
}

# Capture execution metrics
execute_agent() {
    local log_file="${LOG_DIR}/${TASK_ID}/${AGENT_ID}_${TIMESTAMP}.log"
    local metrics_file="${LOG_DIR}/${TASK_ID}/${AGENT_ID}_${TIMESTAMP}_metrics.json"

    # Start time capture
    local start_time=$(date +%s.%N)

    # Execute the actual agent command with all remaining arguments
    # Redirect output to log file
    if ! "$@" 2>&1 | tee "${log_file}"; then
        local exit_code=${PIPESTATUS[0]}

        # Capture error metrics
        node -e "
        import fs from 'fs';
        import {TransparencyMiddleware} from '.claude/skills/cfn-cfn-.claude/skills/cfn-cfn-.claude/skills/cfn-cfn-src/middleware/transparency-middleware.js';
        const middleware = new TransparencyMiddleware();

        const metrics = {
            taskId: '${TASK_ID}',
            agentId: '${AGENT_ID}',
            agentRole: '${AGENT_ROLE}',
            startTime: ${start_time},
            endTime: $(date +%s.%N),
            exitCode: ${exit_code},
            status: 'FAILED'
        };

        await middleware.postExecutionHook(metrics);
        fs.writeFileSync('${metrics_file}', JSON.stringify(metrics, null, 2));
        " || echo "Error tracking failed"

        return ${exit_code}
    fi

    # Capture successful execution metrics
    node -e "
    import fs from 'fs';
    import {TransparencyMiddleware} from '.claude/skills/cfn-cfn-.claude/skills/cfn-cfn-.claude/skills/cfn-cfn-src/middleware/transparency-middleware.js';
    const middleware = new TransparencyMiddleware();

    const metrics = {
        taskId: '${TASK_ID}',
        agentId: '${AGENT_ID}',
        agentRole: '${AGENT_ROLE}',
        startTime: ${start_time},
        endTime: $(date +%s.%N),
        exitCode: 0,
        status: 'SUCCESS'
    };

    await middleware.postExecutionHook(metrics);
    fs.writeFileSync('${metrics_file}', JSON.stringify(metrics, null, 2));
    " || echo "Metrics tracking failed"
}

# Main execution flow
main() {
    # Initialize middleware before execution
    initialize_middleware

    # Execute agent with remaining arguments
    execute_agent "$@"
}

# Execute main function and capture its exit status
main "$@"
exit_status=$?

# Signal completion to Redis coordination
redis-cli lpush "swarm:${TASK_ID}:${AGENT_ID}:done" "complete" > /dev/null

# Invoke waiting mode report
./.claude/skills/cfn-redis-coordination/invoke-waiting-mode.sh report \
  --task-id "${TASK_ID}" \
  --agent-id "${AGENT_ID}" \
  --confidence 0.80 \
  --iteration 1

# Enter waiting mode
./.claude/skills/cfn-redis-coordination/invoke-waiting-mode.sh enter \
  --task-id "${TASK_ID}" \
  --agent-id "${AGENT_ID}" \
  --context "iteration-1-complete"

# Exit with original command's exit status
exit ${exit_status}