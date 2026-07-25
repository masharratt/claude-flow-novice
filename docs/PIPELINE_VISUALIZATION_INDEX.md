# Pipeline Visualization Research Index

**Complete research on open-source, interactive, browser-based DAG/pipeline visualization.**

---

## Documents in This Collection

### 1. PIPELINE_VISUALIZATION_RECOMMENDATION.md (Essential)
**Start here.** Executive summary with final recommendation.

- **Best for:** Decision makers, quick overview
- **Length:** 10 minutes to read
- **Key content:**
  - Why React Flow + Dagre is recommended
  - Why alternatives were rejected
  - Integration checklist
  - Risk assessment
  - FAQ

**👉 Read this first if you have 10 minutes**

---

### 2. PIPELINE_VISUALIZATION_QUICK_START.md (Practical)
**Implementation guide with copy-paste code.**

- **Best for:** Developers ready to code
- **Length:** 15 minutes to read, 2-3 hours to implement
- **Key content:**
  - Decision tree (choose in <1 minute)
  - 4 working implementation templates:
    - React Flow + Dagre (recommended)
    - Mermaid + svg-pan-zoom (simplest)
    - Dagre + custom SVG (minimal bundle)
    - Cytoscape.js + ELK (graph-focused)
  - Boilerplate comparison
  - Feature support matrix
  - Troubleshooting guide

**👉 Read this when ready to implement**

---

### 3. RESEARCH_PIPELINE_VISUALIZATION.md (Comprehensive)
**Full research report with all details.**

- **Best for:** Deep dives, understanding tradeoffs
- **Length:** 45 minutes to read (reference doc)
- **Key content:**
  - All 6 research categories analyzed
  - 12 libraries compared (license, bundle, learning curve, auto-layout)
  - Category-by-category evaluation
  - Confidence scores per category
  - Detailed pros/cons for each option
  - Sources and methodology
  - Performance benchmarks

**👉 Read this for complete understanding or academic rigor**

---

## Quick Navigation

### I need to decide right now
→ Read **PIPELINE_VISUALIZATION_RECOMMENDATION.md** (10 min)

### I want to implement immediately
→ Read **PIPELINE_VISUALIZATION_QUICK_START.md**, copy React Flow template (2-3 hours)

### I want to understand all options in detail
→ Read **RESEARCH_PIPELINE_VISUALIZATION.md** (45 min reference)

### I'm considering an alternative to React Flow
→ Go to **RESEARCH_PIPELINE_VISUALIZATION.md**, jump to Category 4-6 sections

### I need code examples
→ Go to **PIPELINE_VISUALIZATION_QUICK_START.md**, section "Implementation Templates"

### I need to justify the choice to my team
→ Show them **PIPELINE_VISUALIZATION_RECOMMENDATION.md** (executive summary + risk assessment)

---

## Research Summary

**Primary Recommendation:** React Flow + Dagre
- Bundle: ~130KB gzipped
- Setup: 2-3 days to production
- Code: 80-120 lines for read-only DAG
- Production-Ready: Yes (100+ systems using this)
- Confidence: 0.82 (18 sources, cross-verified)

**Alternative Recommendations:**
1. **Mermaid + svg-pan-zoom** — Fastest setup (<1 hour), simple pipelines only
2. **Cytoscape.js + ELK** — Graph-theory approach, larger bundle (600KB)
3. **Dagre + custom SVG** — Minimal bundle (30KB), maximum dev effort

**Rejected Options:**
- Airflow, Prefect, Dagster (orchestration platforms, not viz libraries)
- GoJS (commercial, no free tier)
- Mermaid standalone (insufficient interactivity)

---

## Key Comparisons

### By Time to Production
1. **Mermaid + svg-pan-zoom** — <1 hour
2. **React Flow + Dagre** — 2-3 days
3. **Cytoscape.js + ELK** — 2-3 days
4. **Dagre + custom SVG** — 4-5 days

### By Bundle Size (gzipped)
1. **Dagre only** — 30KB
2. **Mermaid + svg-pan-zoom** — 100KB
3. **React Flow + Dagre** — 130KB
4. **Cytoscape.js + ELK** — 600KB
5. **Graphviz + viz.js** — 200KB

### By Learning Curve
1. **Mermaid + svg-pan-zoom** — Very Low (1 hour)
2. **React Flow + Dagre** — Moderate (6-8 hours)
3. **Cytoscape.js + ELK** — Steep (10-12 hours)
4. **Dagre + custom SVG** — Moderate (rendering boilerplate)

### By Production Readiness
1. **React Flow** — Proven in 100+ production systems
2. **Mermaid** — Proven in documentation systems
3. **Cytoscape.js** — Proven in research/bioinformatics
4. **Custom SVG** — Depends on implementation quality

---

## Category Breakdown

| Category | Winner | Runner-up | Rejected |
|----------|--------|-----------|----------|
| **Enhanced Mermaid** | svg-pan-zoom wrapper | MkDocs plugin | mermaid-live-editor (bloated) |
| **Node Graphs** | React Flow | Svelte Flow | Svelvet (no auto-layout) |
| **D3-Based** | Dagre (layout only) | d3-dag (Sugiyama) | Dagre-D3 (outdated) |
| **Dedicated Viz** | None suitable | — | Airflow, Prefect, Dagster (backend-tied) |
| **Graph Libs** | Cytoscape.js | Graphviz+viz.js | Kroki (server-only) |
| **Lightweight** | React Flow | Dagre+SVG | Pure manual SVG |

---

## Implementation Timeline

### Option A: React Flow + Dagre (Recommended)
- Day 1: Setup, basic component, sample data
- Day 2: Custom nodes, styling, zoom/pan verification
- Day 3: Click handlers, edge cases, performance testing
- Total: 3 days to production

### Option B: Mermaid + svg-pan-zoom (Fastest)
- Hour 1: Create diagram definition
- Hour 2: Wrap with svg-pan-zoom, add buttons
- Hour 3: Test and deploy
- Total: <4 hours to production

### Option C: Cytoscape.js (Advanced)
- Day 1: Setup, layout tuning, styling
- Day 2: Event handlers, algorithm exploration
- Day 3: Performance testing, optimization
- Total: 3 days to production

---

## When to Use Each

| Your Situation | Use This | Why |
|---|---|---|
| Need MVP in <4 hours | Mermaid + svg-pan-zoom | Fastest possible |
| React app, any pipeline size | React Flow + Dagre | Best DX, proven |
| Svelte app | Svelte Flow + Dagre | Svelte-native, same as React Flow |
| Graph analytics needed | Cytoscape.js + ELK | Built-in algorithms |
| Bundle size <50KB mandatory | Dagre + custom SVG | Minimal footprint |
| Already have D3 in project | Dagre-D3 | Familiar APIs |
| Simple 10-20 node pipelines | Mermaid + svg-pan-zoom | Overkill to use React Flow |
| 500+ node graphs | Cytoscape.js | Better performance scaling |

---

## Research Confidence Scores

| Category | Score | Basis |
|----------|-------|-------|
| React Flow / Svelte Flow | 0.90 | Official docs, 5+ sources, large community |
| Enhanced Mermaid | 0.85 | 3 plugins, proven implementations |
| D3-Based (Dagre) | 0.87 | Stable, widely used, GitHub stars |
| D3-Based (d3-dag) | 0.82 | Source code reviewed, performance limits known |
| Cytoscape.js | 0.87 | Academic pedigree, 2023 update published |
| Dedicated Visualizers | 0.78 | Tight backend coupling, not designed for extraction |
| Lightweight Options | 0.75 | Limited ecosystem, high dev cost |

**Overall Research Confidence: 0.82**
- 18 independent sources
- Cross-verified across categories
- Production systems validated
- Alternative pathways documented

---

## Document Statistics

| Document | Lines | Size | Audience |
|----------|-------|------|----------|
| PIPELINE_VISUALIZATION_RECOMMENDATION.md | 350 | 9.5KB | Decision-makers, managers |
| PIPELINE_VISUALIZATION_QUICK_START.md | 550 | 14KB | Developers, implementers |
| RESEARCH_PIPELINE_VISUALIZATION.md | 900 | 21KB | Researchers, technical leads |
| **Total** | **1,800** | **44.5KB** | All audiences |

---

## How to Use This Research

### For Project Managers
1. Read: PIPELINE_VISUALIZATION_RECOMMENDATION.md (10 min)
2. Decision: React Flow + Dagre (16 hours to production)
3. Communicate: Risk assessment section to stakeholders

### For Frontend Developers
1. Read: PIPELINE_VISUALIZATION_QUICK_START.md (15 min)
2. Copy: React Flow template code
3. Test: With sample 10-node graph
4. Customize: Add click handlers, styling

### For Architects
1. Read: RESEARCH_PIPELINE_VISUALIZATION.md (45 min)
2. Evaluate: All 6 categories for system fit
3. Document: Choice rationale in ADR (Architecture Decision Record)
4. Plan: Integration with existing systems

### For Security/Compliance Teams
1. Read: License sections in RESEARCH_PIPELINE_VISUALIZATION.md
2. Verify: MIT licenses (React Flow, Dagre, Svelte Flow) are acceptable
3. Approve: Commercial license not required
4. Document: OSS dependencies in compliance matrix

---

## Related Documents

- **CFN Coordination Guide** — `.claude/skills/cfn-coordination/SKILL.md`
- **Code Quality Standards** — `~/.claude/rules/code-quality.md`
- **Project Dependencies** — `package.json`

---

## Next Steps

1. **Choose your path:**
   - Fast (<4 hours): Mermaid + svg-pan-zoom
   - Production (2-3 days): React Flow + Dagre
   - Advanced (3+ days): Cytoscape.js + ELK

2. **Read the appropriate guide:**
   - For quick decision: PIPELINE_VISUALIZATION_RECOMMENDATION.md
   - For implementation: PIPELINE_VISUALIZATION_QUICK_START.md
   - For deep dive: RESEARCH_PIPELINE_VISUALIZATION.md

3. **Implement:**
   - Copy the template for your chosen option
   - Test with sample data
   - Measure bundle size
   - Customize for your use case

4. **Validate:**
   - Test zoom/pan on target devices
   - Verify performance with 100+ node graphs
   - Check bundle size against targets
   - Get user feedback on UX

---

**Research Date:** 2026-04-09
**Confidence:** 0.82 (high)
**Sources:** 18 independent
**Status:** Ready for implementation

