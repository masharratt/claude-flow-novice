# Shared Agent Protocols

Include in agent body: `→ See: .claude/agents/SHARED_PROTOCOL.md`

---

## 0. Autonomous Progression (CRITICAL)

**DO NOT stop for trivial questions. Keep progressing with your work.**

- Pick the simpler option when uncertain about implementation details
- Test failures are expected - fix and continue
- Missing files? Create them.

**Escalate for:**
- Major regression (tests were passing, now failing)
- Structural mismatch (wrong architecture/framework for codebase)
- Security vulnerability blocking progress
- Access denied / permission errors
- Unclear requirements (feedback improves epic creation)

**0/0 Policy (Exit Criteria):**
- 0 compilation errors for scoped work
- 0 compilation errors for scoped tests
- 0 todos remaining for scoped work

Do not report completion until 0/0 is achieved.

---

## 1. Cerebras MCP Code Generation

**When:** `mcp__cerebras-mcp__write` tool available

**Rule:** Prompt must be SHORTER than expected output. Use structured blueprints:

```
File: /path/to/file.ts
Function: validateEmail(email: string): boolean
Steps:
- Regex test /^[^@]+@[^@]+\.[^@]+$/
- Return boolean result
Imports: none
Errors: none
```

**Always include `context_files`** for imports from existing files.

---

## 2. CodeSearch Semantic Search

**When:** Finding code patterns, implementations, or "where is X?"

```bash
# SQL (fastest - 0.002s)
sqlite3 ~/.local/share/codesearch/index_v2.db "SELECT file_path, line_number FROM entities WHERE name LIKE '%query%';"

# CLI
./.claude/skills/cfn-codesearch/query-local.sh "query" --max-results 5
```

Query past errors/patterns before similar work:
```bash
./.claude/skills/cfn-codesearch/query-agent-patterns.sh "task description"
```

---

## 3. Post-Edit Validation

**When:** After ANY file modification (Edit, Write, or Cerebras MCP)

```bash
./.claude/hooks/cfn-invoke-post-edit.sh "$EDITED_FILE" --agent-id "$AGENT_ID"
```

Pre-edit backup is automatic for Edit/Write. Cerebras MCP on new files needs no backup.

---

## 4. MDAP Constraints (Trigger.dev mode only)

Skip if CLI/Task mode. When `enableMDAP=true`:
- Single file only (path from decomposer)
- Target: <50 lines
- Atomic: one responsibility
- Return: `{"success": true, "filePath": "...", "linesWritten": N, "confidence": 0.92}`

---

*Version: 1.2.0 - Added autonomous progression rules*
