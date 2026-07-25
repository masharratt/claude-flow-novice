# MemPalace Issues Index — Quick Reference

**Last Updated:** April 7, 2026
**Total Issues Tracked:** 60+

---

## Quick Navigation

- [Critical Issues (Blocks Production)](#critical-issues-blocks-production)
- [High-Priority Issues (Requires Fix)](#high-priority-issues-requires-fix)
- [Moderate Issues (Should Fix)](#moderate-issues-should-fix)
- [Low-Priority Issues (Nice to Have)](#low-priority-issues-nice-to-have)
- [By Category](#by-category)
- [Closed Issues (Reference)](#closed-issues-reference)

---

## Critical Issues (Blocks Production)

These issues cause data loss, security vulnerabilities, or system crashes.

| # | Title | Type | Status | Impact |
|---|-------|------|--------|--------|
| 72 | Palace corruption after interrupted mining | Data Loss | Open | Users lose hours of indexing work; requires manual recovery |
| 111 | Claude Code JSONL mining drops user messages | Data Loss | Open | ~312 sessions silently lose user turns; search quality degraded |
| 110 | Shell injection in hook scripts | Security | Open | MCP server vulnerable to code execution via crafted paths |
| 96 | Segmentation fault during mining | Crash | Open | Mining unreliable; affects multiple platforms |
| 100 | Unpinned chromadb dependency | Dependency | Open | Segfaults on installation; version chaos across user bases |
| 71 | Crash during mining leaves palace unreadable | Data Loss | Closed | Mining crashes corrupt persistent state |

### Action Required
**Before any production use**, fix all six critical issues:
- Pin chromadb to `<2.0` (issue #100)
- Fix JSONL type checking: accept both `"human"` and `"user"` (issue #111)
- Fix shell variable interpolation (issue #110)
- Add mining checkpoints and recovery (issues #72, #96)

---

## High-Priority Issues (Requires Fix)

These issues impair core functionality or reliability.

| # | Title | Type | Status | Affected Users |
|---|-------|------|--------|-----------------|
| 108 | Room naming mismatch between init and mine | Routing | Open | All users; file organization broken |
| 97 | Entity detection ignores directory structure | Detection | Open | Users with many git repos |
| 89 | Hardcoded column indices in knowledge graph | Fragility | Open | Any schema migration fails silently |
| 88 | MCP server crashes on search error | Reliability | Open | Claude Code integration broken |
| 90 | Unsolicited Wikipedia HTTP calls | Privacy | Open | Air-gapped/offline users; breaks stated design |
| 27 | README claims don't match code | Documentation | Open | All new users; expectations misaligned |
| 19 | Windows mining 41-hour completion time | Performance | Open | Windows 11 users |

### Root Causes
- **#108**: Metadata discarded during config serialization
- **#97**: Content-based detection prioritized over filesystem signals
- **#89**: No schema abstraction layer; magic numbers throughout
- **#88**: Uses `sys.exit()` instead of exceptions
- **#90**: No opt-in gate for network access
- **#27**: Seven separate false claims in README
- **#19**: Vector embedding bottleneck on Windows filesystem

---

## Moderate Issues (Should Fix)

These issues limit features or require workarounds.

| # | Title | Type | Status | Category |
|---|-------|------|--------|----------|
| 11 | Knowledge graph doesn't auto-resolve conflicts | Architecture | Open | Query accuracy |
| 10 | No episodic memory tracking (learning) | Architecture | Open | Agentic use cases |
| 7 | No multi-device sync | Architecture | Open | Team adoption |
| 102 | Missing .mempalace-ignore support | UX | Open | Index bloat |
| 8 | No non-interactive mode | CI/Automation | Open | Agent integration |
| 14 | Config path documentation wrong | Documentation | Open | Setup confusion |
| 43 | Token count inaccuracy | Metrics | Open | Cost estimation wrong |
| 63 | Split command argument parsing broken | CLI | Open | Drawer distribution wrong |

---

## Low-Priority Issues (Nice to Have)

Feature requests and enhancements.

| # | Title | Type | Status | Category |
|---|-------|------|--------|----------|
| 101 | Multipass – multi-hop paths | Feature | Open | Visualization |
| 98 | Git log miner mode | Feature | Open | Data source expansion |
| 92 | Multilingual support (100+ languages) | Feature | Open | Localization |
| 94 | PHP file support (.php, .twig) | Feature | Open | Language support |
| 93 | Burgess Principle + Hermes Agent | Feature | Open | Integration |
| 103 | Beginner-friendly hooks tutorial | Documentation | Open | Onboarding |
| 106 | Gemini CLI setup guide | Documentation | Open | Integration |
| 107 | Gemini CLI integration + hooks | Documentation | Open | Integration |
| 109 | MCP configuration guide + uvx | Documentation | Open | Setup |
| 99 | Non-technical example/quickstart | Documentation | Open | Onboarding |
| 104 | Prior art attribution (Sara Brain) | Attribution | Open | Academic honesty |
| 105 | Clone repository clarification | Confusion | Open | Repo clarity |

---

## By Category

### Data Integrity (6 issues)
- **#72**: Palace corruption (High)
- **#111**: Message drop (Critical)
- **#71**: Mining crash corruption (High)
- **#100**: Dependency crash (Critical)
- **#89**: Silent schema corruption (High)
- **#43**: Token count error (Moderate)

### Security (1 issue)
- **#110**: Shell injection (Critical)

### Architecture (5 issues)
- **#108**: Room routing (High)
- **#97**: Entity detection (High)
- **#88**: MCP crash (High)
- **#11**: Conflict resolution (Moderate)
- **#10**: Episodic memory (Moderate)

### Documentation (5 issues)
- **#27**: README false claims (High)
- **#14**: Config path wrong (Moderate)
- **#105**: Clone confusion (Low)
- **#103, 106, 107, 109, 99**: Setup guides (Low)

### Performance (2 issues)
- **#19**: Windows slow mining (High)
- **#63**: Split command broken (Moderate)

### Feature Completeness (4 issues)
- **#8**: Non-interactive mode (Moderate)
- **#102**: File filtering (Moderate)
- **#90**: Wikipedia gating (High)
- **#7**: Multi-device sync (Moderate)

### Metrics (1 issue)
- **#43**: Token counting (Moderate)

### Feature Requests (8 issues)
- **#101, #98, #92, #94, #93**: Features (Low)
- **#104**: Attribution (Low)

---

## Closed Issues (Reference)

Issues that have been resolved or are no longer relevant.

| # | Title | Resolution | Status |
|---|-------|-----------|--------|
| 5 | OpenAI Codex JSONL parser | Implemented | Closed |
| 31 | Runtime bug triage docs | Documentation added | Closed |
| 32 | Product intent triage docs | Documentation added | Closed |
| 41 | Dead code cleanup | Fixed (ruff B033) | Closed |
| 1 | Collaboration inquiry (OpenWren) | Acknowledged | Closed |

---

## Issue Metrics

### Open vs. Closed
- **Open:** 54+ issues
- **Closed:** 6 issues
- **Resolution Rate:** ~10%

### Severity Distribution
- **Critical:** 6 (10%)
- **High:** 14 (23%)
- **Moderate:** 16 (27%)
- **Low:** 18 (30%)
- **Not classified:** 6 (10%)

### Category Distribution
- **Data Integrity:** 6 (10%)
- **Architecture:** 5 (8%)
- **Performance:** 2 (3%)
- **Security:** 1 (2%)
- **Documentation:** 5 (8%)
- **Features:** 8 (13%)
- **Other:** 33 (55%)

### Activity Timeline
- **All issues created:** April 7, 2026
- **All issues updated:** April 7, 2026
- **Average comments per open issue:** 0.5

---

## Triage Recommendations

### For Maintainers
1. **Assign owners** to all critical issues (#72, #111, #110, #96, #100)
2. **Create milestones**:
   - v3.0.1 (hotfix): #100, #111, #110
   - v3.1.0 (stability): #72, #96, #108, #97, #89, #88
   - v3.2.0 (features): #11, #10, #8, #102, #90
3. **Add issue templates** to standardize reports
4. **Require regression tests** for all bug fixes

### For Users
1. **Do not use** for production until critical issues fixed
2. **If using**, pin chromadb to `<2.0` immediately
3. **Expect instability** on Windows and large projects
4. **Verify mining** by spot-checking retrieval quality
5. **Don't trust** token counts or compression claims

### For Contributors
1. **Focus on critical issues first** (data loss, security)
2. **Add tests before fixes** (catch regressions)
3. **Update README** when implementing features
4. **Add error handling** instead of using `sys.exit()`
5. **Use schema abstractions** instead of magic numbers

---

## Related Documentation

- **Main Research:** `MEMPALACE_GITHUB_ISSUES_RESEARCH.md`
- **Architecture Discussion:** See issue #104 (Sara Brain prior art)
- **Runtime Bugs:** See closed PR #31 (6 documented bugs)
- **Product Intent:** See closed PR #32 (maintainer decisions)

---

## Legend

- **Status:** Open/Closed
- **Type:** Bug, Feature, Documentation, Architecture, Performance, Security, Data Loss, etc.
- **Impact:** Critical (blocks), High (degrades), Moderate (limits), Low (nice to have)
- **Affected:** User groups or use cases impacted

---

**Last Updated:** April 7, 2026
**Maintenance Note:** Update this index whenever new critical issues are opened.
