# ACE System Phase 3.2 - Negative Context Formatter Examples

## Overview
Phase 3.2 implements anti-pattern formatting for agent context injection. The formatter retrieves anti-patterns from the ACE database and presents them in a visually distinct, human-readable format with severity indicators, security redaction, and relevance filtering.

## Example Outputs

### Example 1: Security Domain (Critical Anti-Patterns)

```bash
./.claude/skills/cfn-ace-system/format-negative-context.sh --domain security --limit 3
```

**Output:**
```markdown
### ⚠️ Anti-Patterns to Avoid

1. **Long-lived access tokens** (🚫 CRITICAL, failed in 3 sprints)
   - Issue: Long-lived access tokens
   - Sprint: `session-management-001` (ITERATE x3, final confidence: 0.45)
   - Solution: Use 15-min access tokens + refresh token rotation
   - Tags: security,JWT,session

2. **API key exposed as [REDACTED_API_KEY]** (🚫 CRITICAL, failed in 1 sprint)
   - Issue: API key exposed as [REDACTED_API_KEY]
   - Sprint: `security-audit-001` (ITERATE x1, final confidence: 0.3)
   - Solution: Not yet determined (investigate before implementing)
   - Tags: security,credentials
```

**Key Features:**
- Critical severity emoji (🚫) for urgent issues
- Iteration count shows how many times the pattern caused failure
- Security redaction (sk_live_XXX → [REDACTED_API_KEY])
- Solution provided when available, otherwise "Not yet determined"

---

### Example 2: Tag-Based Filtering (JWT Relevance)

```bash
./.claude/skills/cfn-ace-system/format-negative-context.sh --task-tags "JWT,auth,session" --limit 5
```

**Output:**
```markdown
### ⚠️ Anti-Patterns to Avoid

1. **Long-lived access tokens** (🚫 CRITICAL, failed in 3 sprints)
   - Issue: Long-lived access tokens
   - Sprint: `session-management-001` (ITERATE x3, final confidence: 0.45)
   - Solution: Use 15-min access tokens + refresh token rotation
   - Tags: security,JWT,session
```

**Use Case:**
When assigning an agent to implement JWT authentication, inject anti-patterns tagged with "JWT,auth,session" to prevent known failure patterns. Agent receives context specific to their task domain.

---

### Example 3: Frontend Domain (High Severity Warnings)

```bash
./.claude/skills/cfn-ace-system/format-negative-context.sh --domain frontend --limit 3
```

**Output:**
```markdown
### ⚠️ Anti-Patterns to Avoid

1. **Missing error boundaries** (⚠️ HIGH, failed in 2 sprints)
   - Issue: Missing error boundaries
   - Sprint: `dashboard-ui-002` (ITERATE x2, final confidence: 0.65)
   - Solution: Wrap components in React ErrorBoundary
   - Tags: frontend,React,error-handling
```

**Key Features:**
- High severity emoji (⚠️) for important but not critical issues
- Domain-specific filtering (only frontend anti-patterns)
- Actionable solutions for known problems

---

### Example 4: Testing Domain (Medium Severity)

```bash
./.claude/skills/cfn-ace-system/format-negative-context.sh --domain testing --limit 3
```

**Output:**
```markdown
### ⚠️ Anti-Patterns to Avoid

1. **Insufficient test coverage** (⚡ MEDIUM, failed in 1 sprint)
   - Issue: Insufficient test coverage
   - Sprint: `api-implementation-003` (ITERATE x1, final confidence: 0.68)
   - Solution: Add integration tests for edge cases
   - Tags: testing,coverage
```

**Key Features:**
- Medium severity emoji (⚡) for moderate issues
- Sprint reference enables linking back to historical failure
- Clear solution guidance

---

### Example 5: No Results (Empty Domain)

```bash
./.claude/skills/cfn-ace-system/format-negative-context.sh --domain nonexistent --limit 5
```

**Output:**
```markdown
### ⚠️ Anti-Patterns to Avoid

No anti-patterns found matching criteria.
- Domain filter: nonexistent

Consider broadening search criteria or checking database status.
```

**Use Case:**
When no anti-patterns exist for a domain, the formatter provides helpful guidance rather than failing silently.

---

## Security Redaction Examples

### Redaction Patterns Implemented

1. **Stripe API Keys:**
   - Pattern: `sk_live_XXXX` or `sk_test_XXXX`
   - Redacted to: `[REDACTED_API_KEY]`

2. **Generic Long Tokens:**
   - Pattern: 32+ alphanumeric characters with underscores/hyphens
   - Redacted to: `[REDACTED]`

3. **Password/Token Fields:**
   - Pattern: `password: XXX` or `token=XXX`
   - Redacted to: `password: [REDACTED]`

4. **JWT Tokens:**
   - Pattern: `eyJXXX.YYYY.ZZZZ` (base64 encoded)
   - Redacted to: `[REDACTED_JWT]`

### Before Redaction:
```
Anti-pattern: "Hardcoded API key sk_live_abc123def456ghi789jkl"
Issue: "Password stored as password=mySecretP@ssw0rd"
```

### After Redaction:
```
Anti-pattern: "Hardcoded API key [REDACTED_API_KEY]"
Issue: "Password stored as password: [REDACTED]"
```

---

## Integration with CFN Loop

### Scenario: Agent Assigned to Implement Authentication

**Coordinator Context Injection:**
```bash
# Retrieve security anti-patterns for authentication task
NEGATIVE_CONTEXT=$(./.claude/skills/cfn-ace-system/format-negative-context.sh \
  --task-tags "JWT,auth,session,security" \
  --limit 5)

# Inject into agent prompt
npx claude-flow-novice spawn agent backend-dev --context "
Task: Implement JWT authentication system

$NEGATIVE_CONTEXT

Deliverables:
- JWT token generation (15-min expiry)
- Refresh token rotation
- Error boundary for auth failures
"
```

**Benefit:**
Agent receives historical failure patterns BEFORE implementation, preventing repetition of known anti-patterns. Reduces iteration cycles from 3 (session-management-001) to 1.

---

## Severity Priority (Ordering)

Anti-patterns are ordered by severity, then recency:

1. **CRITICAL** (🚫) - Security vulnerabilities, data loss, system crashes
2. **HIGH** (⚠️) - Major functionality issues, performance degradation
3. **MEDIUM** (⚡) - Quality issues, technical debt, maintainability
4. **LOW** (ℹ️) - Minor issues, style inconsistencies

Within each severity level, most recent failures appear first (learning from latest sprint experiences).

---

## Command Reference

### Basic Usage
```bash
./.claude/skills/cfn-ace-system/format-negative-context.sh [OPTIONS]
```

### Options
- `--domain <domain>`: Filter by domain (security, frontend, backend, testing)
- `--task-tags <tags>`: Filter by comma-separated tags for relevance scoring
- `--limit <N>`: Maximum anti-patterns to return (1-20, default 5)

### Examples
```bash
# Security anti-patterns only
format-negative-context.sh --domain security --limit 3

# JWT-related anti-patterns
format-negative-context.sh --task-tags "JWT,auth,session"

# Top 10 anti-patterns across all domains
format-negative-context.sh --limit 10
```

---

## Testing Validation

All functionality validated by **10 passing tests**:

1. ✅ Basic output formatting (header, structure)
2. ✅ Severity emojis (🚫 ⚠️ ⚡ ℹ️)
3. ✅ Domain filtering (security, frontend, testing)
4. ✅ Tag filtering (relevance scoring)
5. ✅ Security redaction (API keys, passwords, JWTs)
6. ✅ Null solution handling ("Not yet determined")
7. ✅ Iteration count display ("failed in N sprints")
8. ✅ SQL injection prevention (input sanitization)
9. ✅ Boundary validation (limit 1-20)
10. ✅ No results handling (empty domain)

**Test Suite:** `/mnt/c/Users/masha/Documents/claude-flow-novice/tests/ace-integration/test-negative-formatter-quick.sh`

---

## Next Steps (Phase 3.3)

**Integration with Context Injection Skill:**
- Merge positive context (strategies/patterns) + negative context (anti-patterns) into unified agent prompt
- Implement relevance scoring (0.0-1.0) based on task tags
- Add adaptive context limit (high relevance = more context, low relevance = less)
- Enable A/B testing (agents with ACE context vs control group)

**Success Metrics:**
- Reduced iteration cycles (3 → 1 for known anti-patterns)
- Higher first-iteration confidence (0.45 → 0.75+)
- Fewer ABORT decisions (security failures caught preemptively)
