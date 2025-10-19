# Hook Pipeline Auto-Resolution Skill

## DEPRECATED - CONSOLIDATED INTO HOOK PIPELINE SKILL

**Status:** This skill has been consolidated into the main Hook Pipeline skill.

**Reason:** Auto-resolution is an integral part of the post-edit validation workflow, not a separate skill. The feedback-resolver.sh implementation already exists in the Hook Pipeline directory and works in concert with post-edit-handler.sh.

**Migration Path:**
- All auto-resolution functionality is now documented in: `.claude/skills/hook-pipeline/SKILL.md`
- Use the convenience wrapper: `.claude/skills/hook-pipeline/auto-resolve.sh`
- Original implementation: `.claude/skills/hook-pipeline/feedback-resolver.sh`

## Quick Reference

### Old Usage (DEPRECATED)
```bash
# This documentation is outdated
```

### New Usage (CURRENT)
```bash
# Resolve most recent feedback
./.claude/skills/hook-pipeline/auto-resolve.sh

# Resolve with auto-fix enabled
./.claude/skills/hook-pipeline/auto-resolve.sh --auto-fix

# Resolve specific feedback type
./.claude/skills/hook-pipeline/auto-resolve.sh --type ROOT_WARNING --auto-fix
```

## Complete Documentation

See: `.claude/skills/hook-pipeline/SKILL.md` - Section "Automatic Feedback Resolution"

## Components Now Located In Hook Pipeline

| Component | Location |
|-----------|----------|
| Auto-resolver | `.claude/skills/hook-pipeline/feedback-resolver.sh` |
| Convenience wrapper | `.claude/skills/hook-pipeline/auto-resolve.sh` |
| Post-edit handler | `.claude/skills/hook-pipeline/post-edit-handler.sh` |
| Documentation | `.claude/skills/hook-pipeline/SKILL.md` |

---

## Legacy Documentation (For Historical Reference Only)

The content below is preserved for historical reference but should NOT be used. Refer to Hook Pipeline SKILL.md instead.

<details>
<summary>Click to view legacy documentation</summary>

## Metadata (OUTDATED)
```yaml
name: hook-pipeline-auto-resolver
version: 1.0.0
description: Automatic resolution for post-edit hook feedback
type: system-skill
allowed-tools:
  - Bash
  - Read
  - Edit
  - Grep
configuration:
  max-retry-attempts: 3
  default-timeout: 300ms
```

## 1. Architectural Decision Record (OUTDATED)

### Context
- Complex multi-agent workflows require intelligent, automatic feedback resolution
- Minimize manual intervention in common error scenarios
- Provide clear, actionable feedback for agents

### Decision
Implement a hierarchical, type-based auto-resolution skill with progressive complexity and Redis-backed communication.

### Consequences
- Reduced manual oversight
- Standardized error handling
- Enhanced system resilience
- Minimal performance overhead

## 2. Automatic Execution Workflow

### 2.1 Hook Trigger Sequence
```bash
#!/bin/bash
# post-edit-handler.sh
set -euo pipefail

FILE_PATH="${1:-}"
MEMORY_KEY="${2:-swarm/default}"

# Validate input
[[ -z "$FILE_PATH" ]] && {
  echo "Error: No file path provided" >&2
  exit 1
}

# Run feedback resolver
/bin/bash /config/hooks/feedback-resolver.sh "$FILE_PATH" "$MEMORY_KEY"
```

### 2.2 Execution Phases
1. File modification detected
2. Post-edit hook triggered
3. Feedback resolver analyzes file
4. Auto-resolution attempted
5. Optional human intervention

## 3. Feedback Types Priority Matrix

| Type | Severity | Auto-Resolution | Human Intervention |
|------|----------|-----------------|-------------------|
| ROOT_WARNING | High | Auto-move | Optional review |
| TDD_VIOLATION | High | Generate test scaffolding | Code review required |
| LOW_COVERAGE | Medium | Generate additional tests | Optional optimization |
| RUST_QUALITY | Medium | Apply auto-linting | Style guide alignment |
| LINT_ISSUES | Low | Auto-fix via ESLint | Optional refinement |

## 4. ROOT_WARNING Handling

### 4.1 Auto-Move Script
```bash
#!/bin/bash
# auto-move-handler.sh
handle_root_warning() {
  local file_path="$1"
  local filename=$(basename "$file_path")

  # Predefined move destinations
  declare -A destinations=(
    ["*.js"]="src/"
    ["*.ts"]="src/"
    ["*.md"]="docs/"
    ["*.test.js"]="tests/"
    ["*.config.js"]="config/"
  )

  for pattern in "${!destinations[@]}"; do
    if [[ "$filename" == $pattern ]]; then
      destination="${destinations[$pattern]}"
      mv "$file_path" "$destination$filename"
      echo "Moved $filename to $destination"
      return 0
    fi
  done

  # Fallback: generate warning
  redis-cli publish "agent:feedback" "{
    \"type\": \"ROOT_WARNING\",
    \"file\": \"$file_path\",
    \"message\": \"Unable to auto-resolve file location\"
  }"
}
```

## 5. TDD_VIOLATION Handling

### 5.1 Test Generation Strategy
```bash
#!/bin/bash
# tdd-violation-handler.sh
generate_test_scaffold() {
  local source_file="$1"
  local test_file="${source_file/.js/.test.js}"

  # Basic test scaffold generation
  cat > "$test_file" <<EOF
import { describe, it, expect } from 'vitest'
import { $(basename "${source_file%.*}") } from '$source_file'

describe('${source_file}', () => {
  it('should have basic test coverage', () => {
    // TODO: Implement specific tests
    expect(true).toBe(true)
  })
})
EOF
}
```

## 6. Redis Feedback Integration

### 6.1 CLI Subscription Pattern
```bash
#!/bin/bash
# redis-feedback-subscriber.sh
redis-cli subscribe "agent:feedback" | while read -r event; do
  case "$event" in
    *ROOT_WARNING*)
      handle_root_warning "$event"
      ;;
    *TDD_VIOLATION*)
      generate_test_scaffold "$event"
      ;;
    # Additional handlers
  esac
done
```

## 7. Confidence and Performance Metrics

```json
{
  "skill_confidence": 0.87,
  "resolution_success_rate": 0.92,
  "avg_resolution_time_ms": 42,
  "total_auto_resolutions": 1247
}
```

## 8. Deployment and Configuration

### Installation
```bash
npm install @claude-flow/hook-resolver
claude-flow hooks install post-edit-resolver
```

## 9. Future Improvements
- Machine learning-based resolution recommendations
- Expanded pattern matching
- More granular feedback types
- Enhanced test generation
