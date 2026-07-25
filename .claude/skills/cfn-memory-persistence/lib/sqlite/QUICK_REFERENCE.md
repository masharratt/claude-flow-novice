# SQLite Memory CLI - Quick Reference Card

**Status:** OPERATIONAL | **Version:** 1.3.0 | **Location:** `.claude/skills/sqlite-memory/memory-cli.sh`

---

## Quick Commands

```bash
# Store agent state
./memory-cli.sh set --key "agent/$AGENT_ID/state" --value '{"progress":50}' --acl 1

# Retrieve agent state
./memory-cli.sh get --key "agent/$AGENT_ID/state"

# Delete agent state
./memory-cli.sh delete --key "agent/$AGENT_ID/state"

# Store swarm coordination data
./memory-cli.sh set --key "swarm/phase-1/status" --value '{"complete":true}' --acl 3

# Get swarm status
./memory-cli.sh get --key "swarm/phase-1/status"
```

---

## ACL Levels (Quick Reference)

| Level | Name | Use For |
|-------|------|---------|
| 1 | AGENT | Private agent state |
| 2 | TEAM | Team coordination |
| 3 | SWARM | Swarm coordination |
| 4 | PROJECT | Project-wide data |
| 5 | SYSTEM | System operations |

---

## Common Patterns

### Pattern 1: Persistent Agent State
```bash
# Get previous state (or null if new)
STATE=$(./memory-cli.sh get --key "agent/$AGENT_ID/state" | jq -r '.value')

# Update and store
./memory-cli.sh set --key "agent/$AGENT_ID/state" --value "$NEW_STATE" --acl 1
```

### Pattern 2: Swarm Phase Tracking
```bash
# Check if phase complete
COMPLETE=$(./memory-cli.sh get --key "swarm/$PHASE_ID/status" | jq -r '.value.complete')

if [ "$COMPLETE" != "true" ]; then
  # Mark as complete
  ./memory-cli.sh set --key "swarm/$PHASE_ID/status" --value '{"complete":true}' --acl 3
fi
```

### Pattern 3: Team Context Sharing
```bash
# Share context with team
./memory-cli.sh set --key "team/$TEAM_ID/context" --value "$CONTEXT_JSON" --acl 2

# Read team context
CONTEXT=$(./memory-cli.sh get --key "team/$TEAM_ID/context" | jq -r '.value')
```

---

## Parsing JSON Output

All commands return JSON. Use `jq` to parse:

```bash
# Get value only
VALUE=$(./memory-cli.sh get --key "key" | jq -r '.value')

# Check success
SUCCESS=$(./memory-cli.sh set --key "key" --value "val" --acl 1 | jq -r '.success')

# Get specific field from value
PROGRESS=$(./memory-cli.sh get --key "agent/$AGENT_ID/state" | jq -r '.value.progress')
```

---

## Error Handling

```bash
# Check if operation succeeded
RESULT=$(./memory-cli.sh get --key "key")
SUCCESS=$(echo "$RESULT" | jq -r '.success')

if [ "$SUCCESS" = "true" ]; then
  VALUE=$(echo "$RESULT" | jq -r '.value')
  echo "Retrieved: $VALUE"
else
  ERROR=$(echo "$RESULT" | jq -r '.error')
  echo "Error: $ERROR"
fi
```

---

## Key Naming Conventions

Use hierarchical keys for organization:

```
agent/<agent-id>/<property>     # Agent-specific data
team/<team-id>/<property>       # Team-shared data
swarm/<swarm-id>/<property>     # Swarm coordination
project/<property>              # Project-wide data
system/<property>               # System-level data
```

**Examples:**
- `agent/worker-1/state`
- `agent/worker-1/progress`
- `team/alpha/context`
- `swarm/phase-1/status`
- `project/config`
- `system/backup_info`

---

## Common Operations

### Store Complex JSON
```bash
./memory-cli.sh set --key "agent/$AGENT_ID/state" \
  --value '{"progress":75,"status":"working","lastUpdate":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"}' \
  --acl 1
```

### Increment a Counter
```bash
# Get current count
COUNT=$(./memory-cli.sh get --key "swarm/counter" | jq -r '.value.count // 0')

# Increment
NEW_COUNT=$((COUNT + 1))

# Store
./memory-cli.sh set --key "swarm/counter" --value "{\"count\":$NEW_COUNT}" --acl 3
```

### Update Nested Value
```bash
# Get current state
STATE=$(./memory-cli.sh get --key "agent/$AGENT_ID/state" | jq -r '.value')

# Update nested field
UPDATED=$(echo "$STATE" | jq '.metadata.lastCheck = "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"')

# Store updated state
./memory-cli.sh set --key "agent/$AGENT_ID/state" --value "$UPDATED" --acl 1
```

---

## Tips & Best Practices

1. **Always check success:** Parse `.success` field before using `.value`
2. **Use appropriate ACL:** Match ACL level to data sensitivity
3. **Use hierarchical keys:** Organize keys with `/` separators
4. **Store timestamps:** Include `lastUpdate` or `timestamp` fields
5. **Handle missing keys:** Use `jq -r '.value // null'` for defaults
6. **Clean up old data:** Delete temporary keys when done

---

## Troubleshooting

**Issue:** "Key not found"
```bash
# Solution: Check if key exists and handle null case
VALUE=$(./memory-cli.sh get --key "key" | jq -r '.value // "default"')
```

**Issue:** CLI not found
```bash
# Solution: Build project first
cd /path/to/project && npm run build
```

**Issue:** Permission denied
```bash
# Solution: Make script executable
chmod +x ./.claude/skills/sqlite-memory/memory-cli.sh
```

---

## Full Documentation

See `.claude/skills/sqlite-memory/SKILL.md` for complete documentation.

---

**Last Updated:** 2025-10-18 | **Status:** OPERATIONAL
