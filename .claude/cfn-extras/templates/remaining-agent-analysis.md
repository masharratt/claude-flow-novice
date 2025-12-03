# Remaining Agent Analysis

**Total Agents:** 81 actual agent files
**Optimized (Batches 1 & 2):** 31 files
**Remaining:** 50 files

---

## Batch 3: High Priority (>500 lines, 9 files)

**Target: Reduce from ~6,500 lines to ~1,800 lines (72% reduction)**

1. `cfn-loop/cfn-coordinator-unified.md` - 974 lines
2. `swarm/mesh-coordinator.md` - 936 lines
3. `goal/goal-planner.md` - 832 lines
4. `swarm/blocking-coordinator-example.md` - 776 lines
5. `core-agents/task-coordinator.md` - 681 lines
6. `swarm/adaptive-coordinator.md` - 660 lines
7. `architecture/system-architect.md` - 642 lines
8. `swarm/hierarchical-coordinator.md` - 608 lines
9. `specialized/mobile/mobile-dev.md` - 548 lines

**Categories:**
- Coordinators (6 files): unified, mesh, blocking-example, adaptive, hierarchical, task-coordinator
- Goal planning (1 file): goal-planner
- Architecture (1 file): system-architect
- Mobile (1 file): mobile-dev

---

## Batch 4: Medium Priority (300-500 lines, 18 files)

**Target: Reduce from ~7,400 lines to ~2,700 lines (64% reduction)**

1. `swarm/test-coordinator.md` - 500 lines
2. `github/github-commit-agent.md` - 490 lines
3. `frontend/state-architect.md` - 484 lines
4. `specialized/rust-enterprise-developer.md` - 469 lines
5. `frontend/ui-designer.md` - 462 lines
6. `devops/devops-engineer.md` - 453 lines (may be duplicate)
7. `consensus/byzantine-coordinator.md` - 447 lines
8. `development/backend/dev-backend-api.md` - 434 lines
9. `testing/playwright-tester.md` - 414 lines
10. `documentation/api-docs/docs-api-openapi.md` - 412 lines
11. `security/security-specialist-existing.md` - 383 lines
12. `consensus/consensus-builder.md` - 366 lines
13. `core-agents/planner.md` - 351 lines
14. `product-owner-team/product-owner-agent.md` - 328 lines
15. `product-owner-team/accessibility-advocate-persona.md` - 320 lines
16. `product-owner-team/power-user-persona.md` - 318 lines
17. `testing/e2e/playwright-agent.md` - 314 lines
18. `consensus/quorum-manager.md` - 306 lines

**Categories:**
- Testing (3 files): test-coordinator, playwright-tester, playwright-agent
- Frontend (2 files): state-architect, ui-designer
- Security (1 file): security-specialist-existing
- Backend (1 file): dev-backend-api
- DevOps (1 file): devops-engineer (check for duplicate)
- GitHub (1 file): github-commit-agent
- Documentation (1 file): docs-api-openapi
- Product Owner Team (3 files): product-owner-agent, accessibility-advocate, power-user
- Consensus (3 files): byzantine-coordinator, consensus-builder, quorum-manager
- Core (1 file): planner
- Rust (1 file): rust-enterprise-developer

---

## Batch 5: Low Priority (<300 lines, ~23 files)

**Estimated: ~4,500 lines → ~2,000 lines (56% reduction)**

Files already below 300 lines - may only need template references added and minor cleanup.

**Sample files:**
- `specialized/rust-mvp-developer.md` - 255 lines
- `code-booster.md` - 242 lines
- `analysis/perf-analyzer.md` - 234 lines
- `core-agents/coordinator-hybrid.md` - 220 lines
- `sparc/architecture.md` - 203 lines
- `sparc/refinement.md` - 200 lines
- `core-agents/reviewer.md` - 185 lines
- `core-agents/coordinator.md` - 174 lines
- And ~15 more files

---

## Summary Statistics

### Completed (Batches 1 & 2)
- Files: 31
- Lines removed: ~10,716

### Remaining (Batches 3-5)
- Files: 50
- Estimated lines: ~18,400
- Target lines: ~6,500
- Expected savings: ~11,900 lines (65% reduction)

### Total Project
- Total files: 81 agents
- Starting lines: ~38,000 (estimated)
- Target lines: ~16,200
- Total expected savings: ~21,800 lines (57% overall reduction)

---

## Recommended Approach for Batch 3

**Spawn 3 code-booster agents in parallel:**

**Agent 1: Coordinators (6 files, ~4,700 lines)**
- cfn-coordinator-unified, mesh-coordinator, adaptive-coordinator, hierarchical-coordinator, task-coordinator, blocking-coordinator-example

**Agent 2: Architecture/Planning (2 files, ~1,474 lines)**
- system-architect, goal-planner

**Agent 3: Specialized (1 file, ~548 lines)**
- mobile-dev

Expected Batch 3 total: 9 files, ~6,722 lines → ~1,800 lines (73% reduction, 4,922 lines saved)
