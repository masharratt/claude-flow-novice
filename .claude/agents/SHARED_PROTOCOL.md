# Shared Agent Protocols

> **Include after frontmatter**: Add `→ See: .claude/agents/SHARED_PROTOCOL.md` in agent body

---

## 1. Cerebras MCP Usage (when `mcp__cerebras-mcp__write` in tools)

**RULE: Prompt must be SHORTER than expected output.**

Use STRUCTURED BLUEPRINTS, not prose:

```
Function: validateEmail(email: string): boolean
Steps:
- Regex test /^[^@]+@[^@]+\.[^@]+$/
- Return boolean result
Errors: none (pure validation)
Imports: none
```

**BAD** (verbose prose):
```
I need you to create a function that validates email addresses.
The function should take an email string as input and return true
if valid or false if invalid. Please use a regex pattern...
```

**GOOD** (structured blueprint):
```
Function: validateEmail(email: string): boolean
- Regex: /^[^@]+@[^@]+\.[^@]+$/
- Return: true if match, false otherwise
```

**Always provide `context_files`** when the code needs imports from existing files.

---

## 2. Context Discovery Protocol

**Priority order** (fastest to slowest):

1. **RuVector semantic search** (for "where is X?" queries):
   ```bash
   /codebase-search "authentication middleware pattern"
   # Or direct:
   ./.claude/skills/cfn-ruvector-codebase-index/search.sh "query" --top 5
   ```

2. **Query past errors** before similar work:
   ```bash
   ./.claude/skills/cfn-ruvector-codebase-index/query-error-patterns.sh \
     --task-description "implement auth middleware"
   ```

3. **Query learnings** for best practices:
   ```bash
   ./.claude/skills/cfn-ruvector-codebase-index/query-learnings.sh \
     --task-description "implement auth middleware" --category PATTERN
   ```

4. **Grep** only for exact string/symbol matches (class names, function calls)

5. **Glob** only for known file patterns (`**/*.test.ts`)

---

## 3. MDAP Execution Context (when `enableMDAP=true`)

**Applies only in Trigger.dev MDAP mode. Skip if running in CLI/Task mode.**

**Constraints:**
- Single file only (path provided by decomposer)
- Target: <50 lines of code
- Atomic: one responsibility, no cross-file dependencies
- No file discovery (context pre-injected)

**Return format:**
```json
{
  "success": true,
  "filePath": "/path/to/file.ts",
  "linesWritten": 42,
  "confidence": 0.92
}
```

**Atomicity check before execution:**
- [ ] Single function/class/module
- [ ] No imports from files not in context
- [ ] Self-contained implementation
- [ ] Testable in isolation

---

## 4. Post-Edit Validation

After ANY file modification (Edit, Write, or Cerebras MCP):

```bash
./.claude/hooks/cfn-invoke-post-edit.sh "$EDITED_FILE" --agent-id "$AGENT_ID"
```

**Note:** Pre-edit backup is automatic via hooks for Edit/Write. For Cerebras MCP on new files, backup is not needed.

---

*Version: 1.0.0 | Last Updated: 2025-12-05*
