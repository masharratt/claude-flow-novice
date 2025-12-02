---
description: "Execute CFN Loop via trigger.dev (replaces Redis coordination)"
argument-hint: "<task description> [--mode=mvp|standard|enterprise] [--test-command=<cmd>] [--pass-rate=<0.0-1.0>]"
allowed-tools: ["Bash", "TodoWrite", "Read"]
---

# CFN Loop trigger.dev Mode - Production Execution

**IMPORTANT: This slash command MUST auto-execute the trigger.dev workflow via Bash tool.**

**DO NOT just show instructions. EXECUTE the bash command immediately after reading this.**

---

## Pre-requisites

Trigger.dev must be installed via: `npx cfn-init --trigger`

This installs:
- @trigger.dev/sdk
- trigger-dev/ workflow directory
- .env.local template with API key placeholders

---

## Execution Instructions (AUTO-EXECUTE)

**Step 1: Parse Arguments**
```
TASK_DESCRIPTION: $ARGUMENTS (extract task, remove flags)
MODE: Parse from --mode flag or default to "standard"
TEST_COMMAND: Parse from --test-command flag or default to "npm test"
PASS_RATE: Parse from --pass-rate flag or default based on mode (mvp=0.70, standard=0.95, enterprise=0.98)
```

**Step 2: Verify trigger.dev Environment**
```bash
# Check TRIGGER_API_KEY is set
if [ -z "$TRIGGER_API_KEY" ]; then
  # Try loading from project .env.local
  if [ -f ".env.local" ]; then
    export $(grep -E '^TRIGGER_' .env.local | xargs)
    echo "✅ Loaded trigger.dev credentials from .env.local"
  else
    echo "❌ ERROR: TRIGGER_API_KEY not set"
    echo "   Run: npx cfn-init --trigger"
    echo "   Then edit .env.local with your API keys"
    exit 1
  fi
fi

export TRIGGER_API_URL="${TRIGGER_API_URL:-http://localhost:3040}"
echo "✅ trigger.dev API: $TRIGGER_API_URL"
```

**Step 3: Generate Task ID**
```bash
TASK_ID="cfn-trigger-$(date +%s%N | tail -c 7)-${RANDOM}"
echo "📋 Task ID: $TASK_ID"
```

**Step 4: Trigger CFN Loop Workflow (REQUIRED - Execute via Bash)**
```bash
# Use project-local trigger-dev directory
cd trigger-dev && \
TRIGGER_API_KEY="$TRIGGER_API_KEY" \
TRIGGER_API_URL="$TRIGGER_API_URL" \
npx tsx src/cli/trigger-cfn-loop.ts \
  --task-id "$TASK_ID" \
  --description "$TASK_DESCRIPTION" \
  --mode "$MODE" \
  --test-command "$TEST_COMMAND" \
  --pass-rate "$PASS_RATE"
```

**Step 5: Inform User**
After triggering workflow, tell user:
- ✅ CFN Loop triggered via trigger.dev with task ID: $TASK_ID
- 📊 Monitor in dashboard: http://localhost:3040
- 🔍 Check status: `npx tsx trigger-dev/src/cli/index.ts cfn-loop status <event-id>`

---

## Background Information (DO NOT show unless asked)

**Task**: $ARGUMENTS

## What is trigger.dev Mode?

**trigger.dev Mode Architecture:**
- Main Chat triggers workflow via trigger.dev SDK event
- trigger.dev orchestrates Loop 3 agents, gate checks, Loop 2 validators
- No Redis required - uses trigger.dev's built-in job coordination
- Dashboard visibility at http://localhost:3040
- Automatic retries and error handling built-in

**Advantages over CLI/Redis mode:**
- ✅ No Redis dependency or BLPOP coordination issues
- ✅ Visual dashboard for job monitoring
- ✅ Built-in retry logic and error handling
- ✅ Event-driven architecture (no polling)
- ✅ Persistent job history and logs

**Mode Thresholds:**
| Mode | Pass Rate | Consensus | Max Iterations |
|------|-----------|-----------|----------------|
| MVP | 0.70 | 0.80 | 5 |
| Standard | 0.95 | 0.90 | 10 |
| Enterprise | 0.98 | 0.95 | 15 |

---

## Troubleshooting

**trigger.dev not installed:**
```bash
npx cfn-init --trigger
```

**trigger.dev not running:**
```bash
docker-compose -f docker/trigger.dev/docker-compose.yml up -d
```

**Check service health:**
```bash
curl http://localhost:3040/api/v1/health
```

**View job logs:**
- Dashboard: http://localhost:3040
- Or: `npx tsx trigger-dev/src/cli/index.ts cfn-loop status <event-id> --poll`
