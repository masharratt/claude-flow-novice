# Shared Agent Protocols

Include in agent body: `→ See: .claude/agents/SHARED_PROTOCOL.md`

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

## 2. RuVector Semantic Search

**When:** Finding code patterns, implementations, or "where is X?"

```bash
./.claude/skills/cfn-ruvector-codebase-index/search.sh "query" --top 5
```

Query past errors before similar work:
```bash
./.claude/skills/cfn-ruvector-codebase-index/query-error-patterns.sh "task description"
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

*Version: 1.1.0*
