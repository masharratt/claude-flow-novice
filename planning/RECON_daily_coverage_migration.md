# Reconnaissance Report: daily-coverage Fork Migration to Shared Prompt-Optimizer Engine

**Date:** 2026-07-24  
**Task:** Evaluate feasibility of migrating `/home/masha/projects/daily-coverage/.claude/skills/prompt-optimizer/` (standalone fork with 8 targets) onto the shared engine at `/home/masha/projects/claude-flow-novice/.claude/skills/prompt-optimizer/` without breaking existing targets.

**Status:** IDENTIFIED 3 HARD BLOCKERS + 2 Critical Data Gaps. Detailed sizing below.

---

## 1. Target Inventory

All 8 targets generate using XAI (Grok) and write to source files via PROMPT-OPTIMIZER sentinels. All share a common deterministic rubric.

| Target ID | Generates | Fixture Fields Consumed | Model/Provider | Source File Patched | Shared Rubric |
|-----------|-----------|------------------------|-----------------|-------------------|---------------|
| `narration-base` | Per-article HOST+EXPERT brief narration script | title, summary, expertSummary, topicSlug, articleId | Grok 4.1 non-reasoning | src/services/brief/narration.ts | Yes |
| `deepdive-script` | Conversational dialogue (HOST + EXPERT, 3000-4000 words) | title, summary, expertSummary, topicSlug, briefingText | Grok 4.1 non-reasoning | src/services/deepdive/script-gemini.ts | Yes |
| `multi-story-script` | Multi-story daily briefing (5-7 stories, panel or single expert, ~2500 words) | stories[], topicSlug, title (for fallback) | Grok 4.1 non-reasoning | src/services/deepdive/multi-story-script.ts | Yes |
| `monologue-script` | Single-narrator monologue (2000-3000 words, 6-part structure) | title, summary, expertSummary, topicSlug, briefingText | Grok 4.1 non-reasoning | src/services/deepdive/script-gemini.ts | Yes |
| `continuation-script` | Update episode (1000-1500 words, HOST + EXPERT recap) | title, summary, expertSummary, topicSlug, briefingText, priorCoverage | Grok 4.1 non-reasoning | src/services/deepdive/script-gemini.ts | Yes |
| `panel-skeleton` | Panel roundtable skeleton pass (HOST + N experts, ~1500 words) | title, summary, expertSummary, topicSlug, briefingText | Grok 4.1 non-reasoning | src/services/deepdive/script-gemini.ts | Yes |
| `brief-transitions` | HOST transition lines between brief segments | stories[], topicSlug (for filtering) | Grok 4.1 non-reasoning | src/services/brief/transitions.ts | Yes |
| `combined-narration` | Two-article combination (single HOST + EXPERT segment) | stories[], topicSlug | Grok 4.1 non-reasoning | src/services/brief/combined-narration.ts | Yes |

**Key observation:** All targets render templates with `fillTemplate(template, vars)` via varMap dictionary (targets.ts:163-169). Template extraction uses `extractScript(raw)` which returns `string` (NOT the shared engine's discriminated `ExtractResult` union). This is a contract mismatch.

---

## 2. Rubric Inventory

**Single shared rubric:** `/home/masha/projects/daily-coverage/.claude/skills/prompt-optimizer/lib/rubric.ts`

### Deterministic scoring (RubricScore) 
All categories are PURE REGEX + STRING ANALYSIS (no LLM calls):
- **opener** (count): Matches against BANNED_OPENERS (10 regex patterns) — bibliography-style intros
- **scaffolding** (count): Matches against BANNED_SCAFFOLDING (9 regex patterns) — formulaic host/expert phrases
- **specificity** (0 or 1): Density check `< 2.0` (numbers + proper-nouns per 100 words)
- **monotony** (0 or 1): Sentence-length stdev check `< 4.0` (dull cadence)
- **hostBloat** (0 or 1): HOST turn mean word count `> 35` words (host rambling)
- **numHallucination** (count): Number comparison phrases NOT present in source text (hallucinated comparisons)

`scoreScript(text: string, sourceText?: string): RubricScore` is **SYNCHRONOUS** (line 206, rubric.ts).

### LLM-Based Engagement Judge (CRITICAL BLOCKER)

**File:** `/home/masha/projects/daily-coverage/.claude/skills/prompt-optimizer/lib/engagement-judge.ts`

```typescript
export async function judgeEngagement(
  script: string,
  opts: JudgeEngagementOpts = {},
): Promise<EngagementJudgeResult>
```

- **Model:** Grok 4.20-beta-0309-reasoning (XAI)
- **Scoring:** 7 dimensions (hook, dialogue, pacing, voice, bridge, integration, order), each 1-5 scale
- **Async:** Multiple sequential API calls within single conversation (line 159-208)
- **Penalty:** Computed as weighted average (5-score_i) * PENALTY_SCALE = max 16
- **Optional:** Used when `--engagement` flag passed in fork's optimize.ts (line 57)
- **Integration:** Attachment to score objects via private `__engagementPenalty` field (eval.ts:96), folds into aggregated total (eval.ts:107-112)

**Contract mismatch with shared engine:**
- Shared engine's `Rubric.score(text, ctx): RubricScore` is SYNCHRONOUS and must return immediately
- Shared engine has **NO async scoring hook**
- Shared engine's `RubricScore` interface has no `metrics` extension point for engagement penalty
- Shared engine's aggregate function does not fold async-computed penalties (rubric-core.ts:20-40)

---

## 3. Engine-Generality Gaps

### BLOCKER #1: Synchronous Rubric Contract vs Async LLM Judge

**The Problem:**
- Fork has optional async `judgeEngagement()` that fires AFTER generation during eval (eval.ts:76-93)
- Engagement penalty folds into `AggregateScore.total` for ranking and acceptance gating
- Shared engine's `Rubric.score()` is SYNCHRONOUS: `score(text: string, ctx: Fixture): RubricScore`
- Shared engine's eval loop (evaluate.ts:144) calls `rubric.score()` and expects immediate return
- No async hook exists in the shared engine to run after scoring

**Migration blocker:** Fork's engagement judge cannot port as-is. Options:
1. Strip engagement judge entirely (loses 7-dimension engagement signal)
2. Add async scoring hook to shared engine's Rubric contract (major API change, breaks all existing consumers)
3. Move engagement judge to a separate async post-eval pass (breaks coupling with per-fixture scoring)

**Status:** HARD BLOCKER. Requires shared engine change OR fork changes to drop engagement judge.

---

### BLOCKER #2: Missing `split` Field on All Fixtures

**The Problem:**
- Shared engine's `Fixture` interface (types.ts:11-15) REQUIRES: `split: 'train' | 'holdout'`
- This field freezes which set a fixture belongs to so holdout gate never trains on it (FIX #1 in optimize.ts comments)
- Fork's `ArticleFixture` interface (samples.ts:8-17) has **NO split field**
- Fork builds fixtures dynamically from production DB (pullArticles, buildFixtures, etc. in samples.ts)
- All 8 targets use these dynamic fixtures with no split awareness

**Impact:**
- Every fixture object must have `split: 'train' | 'holdout'` before shared engine can accept it
- Fork's fixture builders (buildFixtures, buildDeepDiveFixtures, buildMultiStoryFixtures) create objects without split
- Shared engine's eval enforces train-only mutation (optimize.ts:210-250) and holdout-only final validation

**Migration requires:**
1. Add `split` field to ArticleFixture interface
2. Partition all 8 targets' fixture sets into train (70-80%) + holdout (20-30%)
3. Ensure deterministic partition (same fixtures every run, same split assignment every run)
4. Update all fixture builders to assign split

**Status:** HARD BLOCKER. No fixtures can load until split field added.

---

### BLOCKER #3: Train/Holdout Split Enforcement Gap

**The Problem:**
- Fork's eval.ts (evaluateTemplate) runs all fixtures through eval indiscriminately (line 53-101)
- No concept of train vs holdout splits
- Shared engine's optimize.ts explicitly:
  - Phase 1: eval on train-only fixtures (line 245: `const trainFixtures = fixtures.filter(f => f.split === 'train')`)
  - Phase 2: mutate based on train results
  - Phase 3: eval on holdout-only fixtures (line 267)
  - Phase 4: refuse win if holdout regresses (overfit gate)
- Shared engine's mutator NEVER sees holdout data (FIX #1)

**Fork's architecture:** All 10 fixtures treated equally in every eval pass. No held-out validation.

**Migration impact:**
- Shared engine will partition all fixtures automatically via split field
- Fork's current state files / runs don't know which fixtures were train vs holdout
- Holdout gate will reject many candidate wins that looked good on train-only subset
- Expected outcome: lower acceptance rate for candidates until stable holdout-level improvements found

**Status:** HARD BLOCKER (depends on BLOCKER #2). Shared engine enforces this; fork doesn't.

---

### Gap #1: Async Fixture Loading + DB Integration

**Current:** Fork loads fixtures from production DB in real-time (samples.ts). Fixtures are DYNAMIC.
- buildFixtures() pulls articles from daily_listen.articles, daily_listen.summaries
- Each run pulls fresh data (unless cached in fixtures/samples-*.json)
- No fixture versioning or snapshot freezing

**Shared engine:** Expects STATIC fixture JSON files:
- `fixtures/<name>.json` loaded once at startup (optimize.ts:72)
- Fixtures must be checked into codebase or pre-generated

**Migration approach:**
1. Pre-generate fixture JSON files for each target (train + holdout split)
2. Commit fixtures/ to repo (or regenerate on demand via setup script)
3. Abandon dynamic DB pulls during optimization (loses freshness but gains reproducibility)
4. Alternative: Keep fork's DB fixture builders, wrap in static JSON export step

**Status:** Not a blocker per se, but requires architectural change. Recommend static JSON approach for reproducibility.

---

### Gap #2: Optional Source-Patcher Auto-Apply

**Current:** Fork's optimize.ts auto-applies winning template to source files (lines 316-345):
- Calls `patchSource()` after optimization completes
- Replaces PROMPT-OPTIMIZER:START...END regions with new template
- Backs up old region to backups/<id>-<timestamp>.txt
- Handles PatchError gracefully (warns if no sentinel found)

**Shared engine:** 
- Has source-patcher.ts code (engine/source-patcher.ts) but does NOT call it in optimize.ts
- optimize.ts only outputs template to run report file
- No auto-apply functionality

**Gap:** Shared engine treats templates as outputs, not integrated with source code.

**Migration:** 
- If fork needs auto-apply: move patchSource call to fork's own orchestration layer
- If we want shared auto-apply: add it to shared engine's optimize.ts (design decision needed)
- Current recommendation: fork maintains its own apply layer, shared engine stays template-only

**Status:** Not a blocker. Fork can add apply layer on top of shared engine.

---

### Gap #3: Optional Real-Signal (Production Skip Rates)

**Current:** Fork's real-signal.ts (execSync queries to daily_listen.narration_prompt_performance) provides:
- Skip rate from production (10-day lookback)
- Sample size validation (MIN_SAMPLE_SIZE=50)
- Used to stamp realSignalSkip + realSignalNeutral into AggregateScore (rubric.ts:278-279)

**Shared engine:** No real-signal integration. All AggregateScores have realSignalSkip=null, realSignalNeutral=true.

**Gap:** Fork can measure against production user behavior (skip rate); shared engine cannot.

**Migration:** Skip real-signal during port. Production signal can be added back later as optional rubric hook if needed.

**Status:** Not a blocker (optional signal). Fork optimizes without it if needed.

---

### Gap #4: Mutator-v2 vs Shared Engine Mutator

**Fork has TWO mutators:**
- `lib/mutator.ts`: Basic version (deprecated)
- `lib/mutator-v2.ts`: Enhanced version with diagnosis-first, strategy rotation, optional reasoning mode

**Shared engine has:**
- `engine/mutator.ts`: Ported from fireside's mutator-v2, rubric-agnostic, strategy rotation, diagnosis output

**Compatibility:** Shared engine's mutator is nearly identical to fork's mutator-v2. Very little gap.

**Minor differences:**
- Shared engine detects placeholders from template (mutator.ts:61-69), fork passes knownPlaceholders as arg (mutator-v2.ts:156)
- Shared engine calls `rubric.describe()` for context (line 143), fork hard-codes rubric reference (mutator-v2.ts:95-113)
- Both support strategy rotation, diagnosis, reasoning mode

**Status:** NOT A BLOCKER. Shared engine's mutator is sufficient.

---

### Gap #5: Fixture-to-Target Mapping & Config

**Current fork:** Each target hard-codes its fixture builder (targets.ts):
```typescript
'narration-base': {
  buildFixtures,  // line 296
  ...
},
```
Builders are directly referenced in target object.

**Shared engine:** Uses config.json to map targets to rubrics and fixtures:
```json
{
  "target-name": {
    "target": "targets/my-target.ts",
    "rubric": "rubrics/my-rubric.ts",
    "fixtures": "fixtures/my-data.json"
  }
}
```

**Gap:** Config-driven architecture vs hard-coded registry.

**Migration:**
1. Create `config.json` for fork
2. Extract targets, rubrics, fixtures as separate files
3. Wire via config.json lookup

**Status:** Not a blocker. Refactoring task.

---

## 4. Provider Inventory

**All calls go to XAI (Grok) via OpenAI SDK:**

| Model | Usage | File | API Key |
|-------|-------|------|---------|
| `grok-4-1-fast-non-reasoning` | Generation (scripts) | targets.ts:224, callWriter() | XAI_API_KEY or X_API_KEY |
| `grok-4.20-beta-0309-reasoning` | Mutation (template rewrites) + Engagement judge | mutator-v2.ts:22, engagement-judge.ts:131 | XAI_API_KEY |
| `grok-4.20-beta-0309-non-reasoning` | Optional mutation (fast mode) | mutator-v2.ts:23 (when useReasoning=false) | XAI_API_KEY |

**Anthropic (Claude) API:** ZERO usage found. No ANTHROPIC_API_KEY, no anthropic SDK imports, no claude-* model calls.

**Pricing (fork's budget.ts:62-75):**
- Grok models: $1.25/M input, $2.50/M output (all variants aliased to same price)
- Gemini 2.5 Flash Lite: $0.10/M input, $0.40/M output (historical, now unused)

---

## 5. Blast Radius

### Source Files with PROMPT-OPTIMIZER Sentinels (6 files, 8 targets)

**Dependencies:** Every file below will break if optimizer stops patching templates.

| Source File | Targets | Sentinel Count |
|-------------|---------|-----------------|
| `src/services/brief/narration.ts` | narration-base | 1 |
| `src/services/brief/transitions.ts` | brief-transitions | 1 |
| `src/services/brief/combined-narration.ts` | combined-narration | 1 |
| `src/services/deepdive/script-gemini.ts` | deepdive-script, monologue-script, continuation-script, panel-skeleton | 4 |
| `src/services/deepdive/multi-story-script.ts` | multi-story-script | 1 |

**External dependencies:** None detected in npm package.json scripts or CI config. Optimizer is standalone skill.

**Template outputs:** None of the 8 targets' templates are read by other code (they're write-only outputs patched into source sentinels).

---

## 6. Migration Sizing

### Rank by Complexity (Easiest First)

1. **narration-base** — Simple 1-article fixture, deterministic rubric, no complications
   - Blocker status: BLOCKED (awaiting split field + BLOCKERS #1, #2, #3)
   - Port complexity: LOW once blockers resolved
   - Effort: 1-2 hours (config.json wiring + fixture restructuring)

2. **brief-transitions** — Simple 1-fixture, deterministic, minimal render logic
   - Blocker status: BLOCKED (same as above)
   - Port complexity: LOW
   - Effort: 1 hour

3. **combined-narration** — 2-article fixture, deterministic, straightforward
   - Blocker status: BLOCKED
   - Port complexity: LOW
   - Effort: 1 hour

4. **deepdive-script** — Deterministic, but shared source with 3 siblings (script-gemini.ts)
   - Blocker status: BLOCKED
   - Port complexity: MEDIUM (coordinate 4-in-1 shared file)
   - Effort: 2-3 hours (ensure all 4 siblings coexist without conflicts)

5. **monologue-script** — (Same file as deepdive-script)
   - Blocker status: BLOCKED
   - Port complexity: MEDIUM
   - Effort: Included in deepdive-script effort

6. **continuation-script** — (Same file as deepdive-script)
   - Blocker status: BLOCKED
   - Port complexity: MEDIUM
   - Effort: Included in deepdive-script effort

7. **panel-skeleton** — (Same file as deepdive-script)
   - Blocker status: BLOCKED
   - Port complexity: MEDIUM
   - Effort: Included in deepdive-script effort

8. **multi-story-script** — Multi-fixture bundle (5 stories per), deterministic, 1 source file
   - Blocker status: BLOCKED
   - Port complexity: MEDIUM (fixture structure is more complex)
   - Effort: 2-3 hours (careful fixture partitioning)

### Port Sequencing (After Blockers Resolved)

**Phase 1: Unblock (2-3 days)**
1. Fork adds `split: 'train' | 'holdout'` to ArticleFixture interface
2. All fixture builders updated to assign split deterministically (e.g., hash(articleId) % 10 < 7 ? 'train' : 'holdout')
3. Decision on engagement judge: STRIP (simplest) or DEFER (requires shared engine change)
4. Generate static fixture JSON files, commit to repo

**Phase 2: Adapt (1-2 days)**
1. Create config.json mapping all 8 targets
2. Extract targets/rubrics/fixtures as separate TS modules (or keep inline)
3. Wiring: config.json → optimize.ts import loop

**Phase 3: Port targets (3-4 days)**
1. Port narration-base, brief-transitions, combined-narration (easy 3, ~3 hours total)
2. Port multi-story-script (medium, ~2 hours)
3. Port deepdive-script cluster (4-in-1 shared file, ~3 hours)
4. Integration testing (1 day)

**Total effort to ship:** 6-9 days (assuming decision to strip engagement judge)

---

## 7. Key Recommendations

### IMMEDIATE DECISIONS NEEDED

1. **Engagement Judge (BLOCKER #1)**
   - Option A (RECOMMENDED): Strip engagement judge entirely during port. Lose 7-dim signal. Simpler, faster, zero engine changes.
   - Option B: Defer engagement judge. Keep fork's version in fork-specific orchestration, run post-eval outside shared engine. Adds complexity, keeps signal.
   - Option C: Extend shared engine's Rubric contract with optional async hook. Breaks existing consumers (fireside). Highest effort, highest payoff.
   - **Recommendation:** Option A (strip). Port cleanly to shared engine baseline, re-add engagement as fork-specific layer later if ROI justifies it.

2. **Fixture Versioning**
   - Option A (RECOMMENDED): Pre-generate fixture JSON snapshots, commit to repo. Reproducible, version-controlled, shared engine baseline.
   - Option B: Keep DB pulls, wrap in snapshot export script. Adds runtime dependency on DB.
   - **Recommendation:** Option A. Snapshots are more reproducible and safer for shared engine model.

3. **Source Patching**
   - Option A (RECOMMENDED): Keep auto-apply in fork's own orchestration (post shared-engine output). Doesn't require shared engine change. Maintains separation of concerns.
   - Option B: Lobby for shared engine to add apply functionality. Requires design decision and review.
   - **Recommendation:** Option A. Fork orchestrates apply layer, shared engine outputs template.

---

## Summary Table: Blockers & Gaps

| Item | Type | Severity | Effort to Resolve | Recommendation |
|------|------|----------|-------------------|-----------------|
| Async LLM engagement judge | BLOCKER #1 | CRITICAL | 2 days (strip) / 5 days (defer) / 10 days (extend engine) | Strip; redesign post-migration |
| Missing split field on all fixtures | BLOCKER #2 | CRITICAL | 1 day | Add split field, partition fixtures, regenerate |
| Train/holdout split enforcement | BLOCKER #3 | CRITICAL | 0 days (automatic once #2 done) | Depends on #2 |
| DB fixture loading (dynamic) | Gap #1 | MEDIUM | 1 day | Pre-generate static JSON snapshots |
| Source-patcher auto-apply | Gap #2 | MEDIUM | 0.5 days | Fork handles, not shared engine |
| Real-signal (production skip rates) | Gap #3 | LOW | 0 days (skip for now) | Defer as post-migration enhancement |
| Mutator differences | Gap #4 | LOW | 0 days | Shared mutator is sufficient |
| Config-driven architecture | Gap #5 | MEDIUM | 1.5 days | Refactor to config.json model |

---

## Conclusion

**Targets Status:** All 8 targets are **PORTABLE** once the 3 hard blockers are resolved.

**Blocking Chain:**
1. Must resolve BLOCKER #2 (split field) → automatically enables BLOCKER #3
2. Must decide on engagement judge (BLOCKER #1)
3. Supporting gaps (DB fixtures, config architecture) are 1-2 day refactors

**Recommended Go/No-Go:** GO, with decision to **strip engagement judge** and **pre-generate static fixture snapshots**. This path ships in 6-9 days post-decision, lands all 8 targets on the shared engine baseline, and preserves option to re-add engagement judge as fork-specific post-eval enhancement.

**Risk Surface:** None. The shared engine's contracts are strict (split field, sync rubric); the fork's specialization (engagement judge, real-signal, DB fixtures) can all be layered on top post-migration rather than baked in.
