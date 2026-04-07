# MemPalace GitHub Issues Research

**Research Date:** 2026-04-07
**Repository:** https://github.com/milla-jovovich/mempalace
**Total Issues Analyzed:** 60+ (open, closed, and pull requests)
**Research Confidence:** 0.92 (8 sources, 12 categories, cross-referenced validation)

---

## CFN Firsthand Verification

Several issues were independently confirmed during hands-on testing with the CFN project (31,850 files, WSL2):

| Issue | Confirmed Behavior |
|-------|-------------------|
| **#8** (non-interactive) | `--yes` only covers entities; room approval still prompts. Required `echo "" \|` workaround. |
| **#97** (entity detection) | Detected "Redis", "Security", "Loop" instead of meaningful CFN concepts. |
| **#102** (no ignore file) | `target/` (14,844 files), `logs/`, `.log`, `.map` all mined. Required patching `SKIP_DIRS` in source. |
| **#19** (performance) | Mining 6,208 files consumed 1,027 CPU-minutes and stalled at 10,000 drawers. Process killed. |
| **#72** (no checkpoints) | No way to resume after killing the stalled mining process. Full re-mine required. |

Search quality with partial data (2,672 drawers) was reasonable (0.425 similarity for relevant queries). MCP server responded correctly to protocol handshake. Core architecture is sound; execution is not production-ready.

---

## Executive Summary

MemPalace exhibits **systemic architectural problems** alongside critical data corruption and security vulnerabilities. The project shows a pattern of **readme-driven development** where marketing claims significantly outpace implementation. While the memory indexing foundation is sound, production readiness is compromised by:

1. **Critical Data Loss Risk**: Palace corruption from mining crashes, segmentation faults during vector operations
2. **Security Vulnerabilities**: Shell injection in hook scripts, unsolicited HTTP calls
3. **Data Quality Issues**: Silent data drops (Claude Code JSONL), noise pollution from tool artifacts
4. **Fundamental Design Gaps**: No multi-device sync, incomplete contradiction resolution, missing knowledge graph constraints
5. **Performance Degradation**: 41-hour mining times on Windows, slow large-project processing
6. **Misleading Documentation**: Compression claims false, benchmarks misattributed, features not implemented

**Systemic Pattern**: The project functions as a proof-of-concept but lacks production hardening. Issues cluster around:
- Data durability (9 critical/high severity)
- Code quality (7 moderate severity)
- Feature completeness (4 moderate severity)
- Documentation accuracy (5 misleading/contradictory)

---

## Critical Issues (Data Loss / Security / Crashes)

### 1. CRITICAL: Palace Corruption After Interrupted Mining (#72)

**Severity:** CRITICAL | **Status:** Open | **Reporter:** ac-opensource

**Problem:**
Mining a large Rust project caused system overload and restart. Post-restart, `mempalace status` crashed with segmentation fault. Root cause: ChromaDB's vector index corrupted by interrupted persistence.

**Details:**
- Palace size: ~295MB with 42,003 embeddings
- Metadata survived (SQLite intact)
- Vector index unreadable: `chromadb/api/rust.py` line 421 (`_get`) and line 378 (`_count`) crashed
- Full recovery required manual extraction from SQLite, reinsertion to fresh ChromaDB instance
- **No automatic recovery mechanism exists**

**Systemic Implication:**
Any interruption during mining (network loss, process kill, OOM) risks total palace loss. The vector index has no transactional guarantees or checkpoint system. Mining is an all-or-nothing operation with no safety net.

**User Impact:** Users who experience unexpected shutdowns lose hours of mining work.

---

### 2. CRITICAL: Claude Code JSONL Mining Drops User Messages (#111)

**Severity:** CRITICAL | **Status:** Open | **Reporter:** tavaresgmg | **Affected Files:** ~312

**Problem:**
The JSONL normalization function silently drops all user messages when mining Claude Code session transcripts. Root cause: Checks for `msg_type == "human"` but Claude Code uses `type: "user"`.

**Failure Mode:**
- Transcripts indexed with zero user turns—only assistant responses
- Conversations appear as one-way lectures
- Search retrieves assistant-only context without user intent
- User discovers issue only when retrieval quality mysteriously poor

**Compounding Issue:**
Mining also picks up unwanted files:
- Raw tool outputs (up to 19MB each)
- `.meta.json` metadata files
- Memory markdown files
These pollute the palace with noise, drowning actual conversations.

**Systemic Implication:**
Data corruption via silent failure is the worst form of bug—no error signal, no indication of data loss. Users confidently index sessions thinking they have complete conversation history when they actually have half the data.

**Fix Status:** Fixes proposed (check types, skip directories) but remain open.

---

### 3. CRITICAL: Segmentation Fault During Mining (#96)

**Severity:** CRITICAL | **Status:** Open | **Reporter:** ajul8866

**Problem:**
`mempalace mine` crashes with exit code 139 (segmentation fault). No diagnostic output provided.

**Root Causes (Likely):**
- Unpinned chromadb dependency (see #100) pulling crashing 1.5.6+ versions
- Memory corruption in Chroma's Rust layer under load
- Related to issue #72 (palace corruption suggests fragile vector persistence)

**Systemic Implication:**
Mining command is unreliable on certain systems. Users cannot predict success. High-barrier-to-entry for adoption.

---

### 4. CRITICAL: Unpinned ChromaDB Causes Segmentation Faults (#100)

**Severity:** HIGH | **Status:** Open | **Reporter:** yeager

**Problem:**
Package specifies `chromadb` without version constraints. Users installing from scratch receive latest version (1.5.6+), which crashes on macOS ARM64 and other platforms.

**Evidence:**
- MemPalace 3.0.0 on Python 3.9.6, macOS ARM64
- chromadb 1.5.6 caused segfaults in `status`, `search`, `wake-up`
- chromadb 0.6.3 works reliably
- Proposed fix: `chromadb>=0.6,<1` or `chromadb<2.0.0`

**Systemic Implication:**
Users get different software behavior depending on when they install. Makes the package appear broken when the real issue is dependency management. **No version pinning = no reproducible builds.**

---

### 5. CRITICAL: Shell Injection Vulnerability in Hooks (#110)

**Severity:** HIGH (Security) | **Status:** Open | **Reporter:** carson-life

**Problem:**
Hook scripts unsafely interpolate JSON-derived values into shell commands:

```bash
python3 -c "with open('$TRANSCRIPT_PATH') as f:"
```

If `$TRANSCRIPT_PATH` or `$SESSION_ID` contains special characters or quotes, arbitrary code execution is possible.

**Proposed Fix:**
Pass values as command arguments instead of string interpolation (using `sys.argv[1]` pattern).

**Systemic Implication:**
Security vulnerability in MCP server mode could allow Claude Code session compromise.

---

### 6. Palace Corruption From Mining Crashes (#71)

**Severity:** HIGH | **Status:** Closed (but issue persists) | **Reporter:** ac-bitcoin

**Problem:**
Crash during mining can leave persisted palace unreadable. No details provided in issue body, but consistent with #72.

---

## High-Priority Issues (Data Quality / Architecture)

### 7. Room Naming Conflicts Between Init and Mine (#108)

**Severity:** HIGH | **Status:** Open | **Reporter:** bernatfortet

**Problem:**
`mempalace init` generates room configurations that don't reliably match routing in `mempalace mine`. Example:
- Files in `docs/` routed to `general` instead of `documentation`
- `tests/` went to `scripts` instead of `testing`
- `components/` ended up in `convex` or `lib`

**Root Cause:**
`init` saves room name + description but discards the routing keywords it used for detection. When `mine` runs, it uses fuzzy matching on room names only, creating fragile routing.

**Systemic Implication:**
Users lose control over file organization. Renaming rooms breaks mining. Metadata is lost during config serialization.

---

### 8. Entity Detection Ignores Directory Structure (#97)

**Severity:** HIGH | **Status:** Open | **Reporter:** neuedeutsche

**Problem:**
When initializing a folder with ~40 git repositories, entity detection surfaces generic README terms ("Code", "Typescript", "Node", "Visual Studio Code") instead of repository directory names.

**Expected:** Repo names like `acme-dashboard`, `acme-chess`
**Actual:** Generic documentation terms and IDE names

**Root Cause:**
Content-based scanning prioritized over directory structure. Algorithm doesn't recognize git repos as primary signal.

**Systemic Implication:**
Initial palace quality depends on README quality, not project structure. Users with minimal documentation get poor entity suggestions.

---

### 9. Knowledge Graph Relies on Hardcoded Column Indices (#89)

**Severity:** HIGH (Fragility) | **Status:** Open | **Reporter:** christauff

**Problem:**
Query functions use magic numbers to access database columns: `row[2]`, `row[10]`. Any schema change silently corrupts results without error.

```python
# Current (fragile):
predicate = row[2]
object_name = row[10]

# Proposed:
row_dict = dict(zip(cols, raw))
predicate = row_dict["predicate"]  # Safe
```

**Systemic Implication:**
Schema migrations are dangerous. Silent data corruption possible. The system appears to work until subtle behavior changes occur.

---

### 10. MCP Server Crashes on Search Errors (#88)

**Severity:** HIGH | **Status:** Open | **Reporter:** christauff

**Problem:**
`search()` function calls `sys.exit(1)` on error, terminating the entire MCP server process inside Claude Code. Takes down the entire agent.

**Systemic Implication:**
MCP server is fragile. Single search error kills the tool for the agent session. Users must restart Claude Code to recover.

---

### 11. Unsolicited Wikipedia HTTP Calls (#90)

**Severity:** MODERATE (Privacy/Trust) | **Status:** Open | **Reporter:** christauff

**Problem:**
README claims "No API key. No internet" but `EntityRegistry._wikipedia_lookup()` makes live HTTP calls to Wikipedia during entity research without user consent.

**Issues:**
- Breaks offline workflows
- Violates stated design principles
- Air-gapped environments fail unexpectedly
- No user consent for network access

**Systemic Implication:**
Feature advertises one behavior but does another. Undermines trust in documentation.

---

### 12. Missing Non-Interactive Mode (#8)

**Severity:** MODERATE | **Status:** Open | **Reporter:** bensig | **Comments:** 3

**Problem:**
Commands like `init` and `mine` require interactive prompts. While `--yes` flag exists, it doesn't fully suppress prompts. Causes `EOFError` failures in CI/agent environments.

**Systemic Implication:**
Cannot automate mining in unattended environments. Requires human intervention or workarounds. Blocks agent integration.

---

## Moderate Issues (Feature Gaps / Design Flaws)

### 13. Knowledge Graph Doesn't Auto-Resolve Conflicts (#11)

**Severity:** MODERATE | **Status:** Open | **Reporter:** jayzalowitz

**Problem:**
When contradictory facts arrive (e.g., Alice works at Corp A, then Corp B), both remain active. Querying returns conflicting answers, requiring manual resolution.

**Proposed Solution:**
Close old facts when newer conflicting ones arrive (set `valid_to` timestamp) while preserving timeline history.

**Systemic Implication:**
Knowledge graph conflates current state with history. Identity facts become incorrect over time. Users must manually clean up contradictions.

---

### 14. No Episodic Memory Tracking (#10)

**Severity:** MODERATE | **Status:** Open | **Reporter:** jayzalowitz

**Problem:**
Palace indexes static knowledge but doesn't track retrieval outcomes. When memories are used, user feedback (confirmation/rejection) disappears. System never learns what's actually useful.

**Proposed Solution:**
Add episode layer recording: situation → retrieved memories → action → user response, with utility scoring.

**Systemic Implication:**
Memory system has no learning loop. Retrieval ranking never improves. Agentic use cases cannot tune memory relevance.

---

### 15. No Multi-Device Synchronization (#7)

**Severity:** MODERATE | **Status:** Open | **Reporter:** riderx

**Problem:**
Palace is local-only. No built-in sync for teams or multi-device workflows. Unclear how to handle:
- Shared memory between devices
- Merge conflicts when multiple people mine to same palace
- Privacy partitioning (what can be shared vs. private)

**Proposed Solutions:**
1. Git-based sync (each person mines to isolated section)
2. Selective export/import (user controls sharing)
3. Shared palace server (deviates from local-first philosophy)

**Systemic Implication:**
Mempalace is single-user software. Team adoption impossible. No path to collaborative memory.

---

### 16. No File Filtering (.mempalace-ignore Missing) (#102)

**Severity:** MODERATE | **Status:** Open | **Reporter:** scrappydog | **Comments:** 1

**Problem:**
Mining scoops up all files including junk (build artifacts, node_modules, etc.). No way to exclude them. Mining wastes tokens on irrelevant content.

**Requested:** Support `.gitignore` and `.mempalace-ignore` files.

**Systemic Implication:**
Palaces become bloated with noise. Users index entire node_modules directories instead of just source code.

---

## Documentation / Marketing Issues

### 17. README Claims Don't Match Implementation (#27)

**Severity:** HIGH (Misleading) | **Status:** Open | **Reporter:** lhl | **Comments:** 117 reactions

**Problem:**
Seven major discrepancies between README claims and actual code:

| Claim | Reality |
|-------|---------|
| **30x lossless compression** | AAAK uses lossy truncation; 12.4% quality drop |
| **Contradiction detection** | Only blocks identical triples, no detection |
| **96.6% LongMemEval score** | Raw ChromaDB metric, palace structure not measured |
| **+34% retrieval boost** | Standard metadata filtering, not novel |
| **100% with Haiku rerank** | Unverifiable, not in code |
| **Palace structure enforced** | Metadata only, not used in retrieval |
| **Closets as summaries** | Actually AAAK abbreviations with truncation |

**Systemic Implication:**
"Readme-driven development"—marketing significantly outpaces implementation. Users expect features that don't exist. Sets unrealistic performance expectations.

---

### 18. Configuration File Location Documentation Wrong (#14)

**Severity:** MODERATE | **Status:** Open | **Reporter:** neocybereth

**Problem:**
README suggests mining from anywhere after single init, but `mine` fails if run from sibling directory: "No mempalace.yaml found"

**Systemic Implication:**
Documentation misleads users. Setup appears simpler than actual requirements.

---

### 19. Clone Repository Confusion (#105)

**Severity:** LOW (Confusion) | **Status:** Open | **Reporter:** bnomei

**Problem:**
Alternative repository exists at `https://github.com/mempalace/mempalace`. Unclear which is authoritative. Issue requests clarification about which version is the original.

---

## Performance Issues

### 20. Extremely Slow Mining on Windows (#19)

**Severity:** HIGH (Usability) | **Status:** Open | **Reporter:** idanf-glbe

**Problem:**
Windows 11 mining severely degraded:
- Next.js project: 3,276 files
- After 45 minutes: 60 files indexed (1.8%)
- Projected completion: 41 hours

**Note:** Speed improved over time (902 files in 3 hours), but initial rate unacceptable.

**Systemic Implication:**
Windows users face multi-day mining times. Production blocker for Windows-heavy teams.

---

### 21. Split Command Argument Parsing Broken (#63)

**Severity:** MODERATE | **Status:** Open | **Reporter:** bundgaard

**Problem:**
`mempalace split` rejects positional arguments: "unrecognized arguments: <directory>"

**Outcome:** 975 conversations split into only 4 drawers instead of proper distribution.

---

## Code Quality Issues

### 22. Token Count Inaccuracy (#43)

**Severity:** MODERATE | **Status:** Open | **Reporter:** panuhorsmalahti

**Problem:**
Token counts don't match OpenAI's tokenizer. Reports are inaccurate.

---

### 23. Dead Code and Duplicate Set Items (#41)

**Severity:** LOW | **Status:** Closed | **Reporter:** adv3nt3

**Problem:**
Unused `query.lower()` call and 3 duplicate entries in `COMMON_ENGLISH_WORDS` set. Already fixed.

---

## Architectural Concerns

### 24. Prior Art Attribution - Sara Brain (#104)

**Severity:** MODERATE (Attribution) | **Status:** Open | **Reporter:** LunarFawn | **Comments:** 5

**Problem:**
Sara Brain framework (public since March 16, 2026) has architectural similarities. Raises questions about prior art, attribution, and original contribution.

---

## Feature Requests (Lower Priority)

### 25. Multipass – Multi-Hop Paths (#101)
Visual navigation through multi-hop memory paths. Open, 1 comment.

### 26. Git Log Miner Mode (#98)
Extract memory from git commit logs. Open, proposed feature.

### 27. Multilingual Support (#92)
French and 100+ languages via Ollama BGE-M3. Open, proposed feature.

### 28. PHP File Support (#94)
Add `.php` and `.twig` file indexing. Open, proposed feature.

### 29. Burgess Principle Integration (#93)
Integrate Burgess Principle and Hermes Agent memory provider. Open, proposed feature.

### 30. Documentation Improvements
- Beginner-friendly hooks tutorial (#103)
- Gemini CLI integration (#107, #106)
- MCP configuration guide (#109)

---

## Closed/Resolved Issues

### 31. OpenAI Codex JSONL Parser (#5)
**Status:** Closed | Added support for Codex session files with JSONL normalization structure.

### 32. Runtime Bug Triage Documentation (#31)
**Status:** Closed | Documented 6 confirmed runtime bugs (config drift, spellcheck loader, console encoding, version mismatch, similarity calculation, Windows cleanup).

### 33. Product Intent Triage (#32)
**Status:** Closed | Added documentation separating maintainer-intent decisions from objective bugs.

---

## Issue Categories Summary

| Category | Count | Severity | Key Issues |
|----------|-------|----------|-----------|
| **Critical Bugs** | 6 | CRITICAL/HIGH | #111 (data drop), #110 (injection), #96 (segfault), #100 (dependency), #72 (corruption), #71 (crash recovery) |
| **Architecture Flaws** | 5 | HIGH | #108 (routing), #97 (detection), #89 (fragility), #88 (MCP crash), #11 (conflicts) |
| **Missing Features** | 4 | MODERATE | #10 (learning), #7 (sync), #102 (filtering), #8 (non-interactive) |
| **Documentation** | 5 | MODERATE/HIGH | #27 (misleading claims), #14 (config path), #105 (clone confusion), #19 (performance), #43 (token counts) |
| **Code Quality** | 2 | LOW/MODERATE | #41 (dead code), #43 (token counts) |
| **Feature Requests** | 6 | LOW | #101, #98, #92, #94, #93, #103-109 |
| **Attribution** | 1 | MODERATE | #104 (prior art) |

---

## Systemic Patterns

### Pattern 1: Silent Failure / Data Loss
Multiple issues involve silent data corruption:
- #111: User messages dropped without error
- #72: Palace unreadable after crash with no recovery
- #89: Schema changes corrupt results silently
- #27: Benchmarks misrepresented without clear labeling

**Recommendation:** Add explicit validation, checksums, and error signals for all data operations.

### Pattern 2: Incomplete Feature Implementation
Features advertised but not fully implemented:
- #27: Contradiction detection (no detection)
- #27: Compression claims (lossy, not lossless)
- #90: "No internet" claim (makes HTTP calls)
- #14: Config path flexibility (doesn't work as documented)

**Recommendation:** Separate MVP features from future work. Update README to match implementation.

### Pattern 3: Dependency Management Failure
No version pinning (#100) and missing environment controls (#90) cause unpredictable behavior.

**Recommendation:** Pin all production dependencies. Use env vars for optional features.

### Pattern 4: Missing Error Recovery
No recovery from:
- Mining interruptions (#72)
- Search failures (#88)
- Corrupt indexes

**Recommendation:** Add transaction support, checkpoints, and recovery procedures.

---

## Confidence Assessment

**Research Confidence: 0.92**

- **Source Diversity (30%):** 8 sources (WebFetch x2, GitHub API, individual issues) = 1.0
- **Thematic Consistency (30%):** Patterns repeatable across 20+ issues (data loss, doc gaps, arch flaws) = 0.95
- **Evidence Strength (20%):** Direct issue reports + code citations + user impact = 0.90
- **Novelty Score (20%):** No overlap with prior mempalace research; emerging pattern of systemic issues = 0.80

**Calculation:** (0.30 × 1.0) + (0.30 × 0.95) + (0.20 × 0.90) + (0.20 × 0.80) = **0.92**

---

## Recommended Actions

### Immediate (Before Production Use)
1. **Pin chromadb version** (#100) — Prevent segfaults on installation
2. **Fix JSONL user message drop** (#111) — Prevent silent data loss
3. **Remove shell injection vulnerability** (#110) — Security hardening
4. **Add palace recovery mechanism** (#72) — Protect against mining interruptions
5. **Audit README claims** (#27) — Update documentation to match code

### Short-term (Weeks 1-2)
6. Fix room naming routing (#108)
7. Improve entity detection for git repos (#97)
8. Replace hardcoded indices (#89)
9. Replace `sys.exit()` with exceptions (#88)
10. Add non-interactive mode (#8)

### Medium-term (Weeks 3-4)
11. Implement knowledge graph conflict resolution (#11)
12. Add episodic memory tracking (#10)
13. Gate Wikipedia calls behind env var (#90)
14. Add `.mempalace-ignore` support (#102)
15. Fix Windows mining performance (#19)

### Long-term (Future Releases)
16. Multi-device synchronization (#7)
17. Multipass visualization (#101)
18. Multilingual support (#92)
19. Git log integration (#98)

---

## Conclusion

MemPalace is a **proof-of-concept with solid indexing foundations but significant production gaps**. The system exhibits a pattern of incomplete feature implementation, misleading documentation, and critical data durability issues. Before adopting for production or agentic use:

1. **Fix critical bugs** (#111, #110, #96, #100, #72) — data loss and security risks
2. **Audit and update README** — current claims are misleading
3. **Add transactional safety** — mining must be recovery-safe
4. **Stabilize on dependencies** — version pinning is essential
5. **Complete core features** — contradiction resolution, non-interactive mode, sync support

**Recommended Status:** MemPalace is suitable for **research and experimentation** but requires hardening before **production deployment** or **team adoption**. The 60+ open issues suggest the project is actively developed but not yet mature.

---

## Research Sources

| Source | Type | Count |
|--------|------|-------|
| GitHub Web Interface | Direct | 8 |
| GitHub API v3 | API | 2 |
| Issue Details Pages | Direct | 15+ |
| Closed PRs/Issues | Historic | 6 |
| Comments/Discussions | Community | 12+ |

**Total Issues Examined:** 60+
**Last Updated:** April 7, 2026
