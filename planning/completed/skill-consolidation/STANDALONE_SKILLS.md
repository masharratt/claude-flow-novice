# Standalone Skills (Keep As-Is)

These 26 skills have distinct, non-overlapping purposes and should remain as separate skills.

---

## List of Standalone Skills

| # | Skill | Purpose | Category |
|---|-------|---------|----------|
| 1 | `docker-build/` | WSL2 build optimization | Infrastructure |
| 2 | `pre-edit-backup/` | File safety before edits | Safety |
| 3 | `cfn-utilities/` | Bash utility library | Foundation |
| 4 | `cfn-file-operations/` | Atomic file writes | File System |
| 5 | `cfn-process-lifecycle/` | Process management | Infrastructure |
| 6 | `cfn-parameterized-queries/` | SQL injection prevention | Security |
| 7 | `cfn-dependency-extractor/` | Dependency graphs | Analysis |
| 8 | `cfn-dependency-ingestion/` | Context loading (20,000x speedup) | Performance |
| 9 | `cfn-backlog-management/` | Work tracking | Project Management |
| 10 | `cfn-changelog-management/` | Release notes | Documentation |
| 11 | `cfn-playbook/` | Pattern storage (merged with auto-update) | Knowledge |
| 12 | `cfn-product-owner-decision/` | Decision parsing | Workflow |
| 13 | `cfn-wave-checkpoint/` | Crash recovery | Reliability |
| 14 | `cfn-transparency-middleware/` | Audit logging | Compliance |
| 15 | `cfn-node-heap-sizer/` | Memory sizing | Performance |
| 16 | `cfn-environment-sanitization/` | Env cleanup | Security |
| 17 | `cfn-vision-analysis/` | Image analysis | AI/ML |
| 18 | `agent-template-generator/` | Agent creation | Development |
| 19 | `agent-validation-linter/` | Agent compliance | Quality |
| 20 | `workflow-codification/` | Skill ROI tracking | Analytics |
| 21 | `firecrawl-integration/` | Web scraping | Integration |
| 22 | `ruvector-codebase-index/` | Semantic search | Search |
| 23 | `conversation-sync/` | Session preservation | Context |
| 24 | `mdap-context-injection/` | MDAP context | Context |
| 25 | `cfn-seo/` | SEO toolkit | Content |
| 26 | `cfn-expert-update/` | Expert agent updates | Maintenance |

---

## Detailed Descriptions

### Infrastructure & Foundation

#### 1. docker-build/
**Purpose:** Optimizes Docker builds for WSL2 environments (builds from Linux storage instead of Windows mounts - 755s → <20s)

**Why Keep Separate:** Critical performance optimization with unique WSL2-specific logic. Used by all Docker-related operations.

#### 2. cfn-utilities/
**Purpose:** Foundational bash utility functions (logging, error handling, retry logic, file operations)

**Why Keep Separate:** Used by all bash scripts. Changing this affects everything.

#### 3. cfn-process-lifecycle/
**Purpose:** Process management with dependency-aware orchestration and Redis-based health tracking

**Why Keep Separate:** Distinct from memory management - handles process groups, signals, zombie prevention.

#### 4. cfn-file-operations/
**Purpose:** Atomic file writes with locking and backup/rollback capability

**Why Keep Separate:** Complements pre-edit-backup but focuses on concurrent write safety.

---

### Security & Safety

#### 5. pre-edit-backup/
**Purpose:** Creates file backups before edit operations with rollback capability

**Why Keep Separate:** Critical safety feature. Referenced in CLAUDE.md as mandatory workflow.

#### 6. cfn-parameterized-queries/
**Purpose:** Secure SQL execution with parameter binding (prevents SQL injection - CVSS 8.2)

**Why Keep Separate:** Security-critical. Used by all SQLite operations.

#### 7. cfn-environment-sanitization/
**Purpose:** Cleans environment variables, prevents leakage

**Why Keep Separate:** Security boundary. Must remain isolated.

---

### Performance & Reliability

#### 8. cfn-dependency-ingestion/
**Purpose:** Atomic context loading with 20,000x speedup (60s → 3ms)

**Why Keep Separate:** Critical performance skill. Used by all Task tool agents.

#### 9. cfn-wave-checkpoint/
**Purpose:** Crash recovery and orphan container detection for Docker orchestration

**Why Keep Separate:** Reliability-focused. Different from memory persistence.

#### 10. cfn-node-heap-sizer/
**Purpose:** Node.js memory sizing and heap optimization

**Why Keep Separate:** Specialized performance tuning. Complements memory-management but focuses on heap sizing.

---

### Project Management & Documentation

#### 11. cfn-backlog-management/
**Purpose:** Captures and tracks deferred work items during sprints

**Why Keep Separate:** Project management tool. Different from sprint-execution.

#### 12. cfn-changelog-management/
**Purpose:** Structured changelog entries for release notes

**Why Keep Separate:** Documentation workflow. Used at release time, not during development.

#### 13. cfn-playbook/
**Purpose:** Stores and queries execution patterns (merged with auto-update)

**Why Keep Separate:** Knowledge base. Serves different purpose than sprint planning.

---

### Workflow & Compliance

#### 14. cfn-product-owner-decision/
**Purpose:** Parses PROCEED/ITERATE/ABORT decisions with consensus-on-vapor detection

**Why Keep Separate:** Critical decision parsing. Must remain reliable and testable.

#### 15. cfn-transparency-middleware/
**Purpose:** Comprehensive audit trail for agent interactions

**Why Keep Separate:** Compliance requirement. Captures all Edit/Write/Bash/Task operations.

---

### Analysis & Search

#### 16. cfn-dependency-extractor/
**Purpose:** Analyzes acceptance criteria to map task dependencies

**Why Keep Separate:** Analysis tool used before sprint planning.

#### 17. ruvector-codebase-index/
**Purpose:** Semantic codebase indexing and search using vector database

**Why Keep Separate:** Unique capability. Different from grep/glob text search.

---

### Context & Integration

#### 18. conversation-sync/
**Purpose:** Syncs conversation history for cross-session context preservation

**Why Keep Separate:** Context management. Works with but different from memory-persistence.

#### 19. mdap-context-injection/
**Purpose:** Injects MDAP/Trigger workflow context for troubleshooting

**Why Keep Separate:** Specialized for MDAP debugging.

#### 20. firecrawl-integration/
**Purpose:** Self-hosted Firecrawl API for web scraping and AI extraction

**Why Keep Separate:** External integration. Used by SEO and research workflows.

---

### Development Tools

#### 21. agent-template-generator/
**Purpose:** Generates new agent profiles with consistent structure (75% time reduction)

**Why Keep Separate:** Development tool. Creates agents, doesn't manage their lifecycle.

#### 22. agent-validation-linter/
**Purpose:** Enforces validation pattern compliance across agent profiles

**Why Keep Separate:** Quality assurance. CI/CD integration.

#### 23. workflow-codification/
**Purpose:** Tracks edge cases and cost metrics for skills

**Why Keep Separate:** Analytics and improvement tracking.

---

### Specialized Domains

#### 24. cfn-vision-analysis/
**Purpose:** Image analysis capabilities

**Why Keep Separate:** AI/ML domain. Specialized multimodal functionality.

#### 25. cfn-seo/
**Purpose:** Comprehensive SEO toolkit (already consolidated internally)

**Why Keep Separate:** Domain-specific with internal subfolders already organized.

#### 26. cfn-expert-update/
**Purpose:** Updates expert agent profiles with git commit context

**Why Keep Separate:** Maintenance utility. Specialized function.

---

## Rationale Summary

These skills remain standalone because they are:

1. **Security-critical** - Cannot risk breaking changes (parameterized-queries, environment-sanitization)
2. **Foundation libraries** - Used by many other skills (utilities, file-operations)
3. **Specialized domains** - Unique functionality (seo, vision-analysis, ruvector)
4. **External integrations** - Interface with external systems (firecrawl)
5. **Compliance requirements** - Audit and transparency needs (transparency-middleware)
6. **Development tools** - Agent/workflow creation (template-generator, validation-linter)
7. **Project management** - Different lifecycle than sprint execution (backlog, changelog)

No consolidation is recommended for these 26 skills.
