# MDAP CFN Loop Flow Diagram

## Complete System Flow

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                           CFN LOOP COORDINATOR (cfn-coordinator.ts)                      │
│                                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────────────────────┐ │
│  │                         PHASE 1: SEQUENTIAL DECOMPOSITION                            │ │
│  │                                                                                       │ │
│  │  User Task ──────────────────────────────────────────────────────────────────►       │ │
│  │       │                                                                               │ │
│  │       ▼                                                                               │ │
│  │  ┌────────────────────┐                                                              │ │
│  │  │  Architecture      │  Qwen-3-235B                                                 │ │
│  │  │  Decomposer        │──────────────────►  7 arch micro-tasks                       │ │
│  │  │  (baseline)        │  ~1-3s                                                       │ │
│  │  └────────┬───────────┘                                                              │ │
│  │           │ context                                                                   │ │
│  │           ▼                                                                           │ │
│  │  ┌────────────────────┐                                                              │ │
│  │  │  Security          │  Qwen-3-235B                                                 │ │
│  │  │  Decomposer        │──────────────────►  5 security micro-tasks                   │ │
│  │  │  (+ arch context)  │  ~1-3s                                                       │ │
│  │  └────────┬───────────┘                                                              │ │
│  │           │ context                                                                   │ │
│  │           ▼                                                                           │ │
│  │  ┌────────────────────┐                                                              │ │
│  │  │  Performance       │  llama-4-scout                                               │ │
│  │  │  Decomposer        │──────────────────►  4 perf micro-tasks                       │ │
│  │  │  (+ arch + sec)    │  ~500ms                                                      │ │
│  │  └────────┬───────────┘                                                              │ │
│  │           │ context                                                                   │ │
│  │           ▼                                                                           │ │
│  │  ┌────────────────────┐                                                              │ │
│  │  │  Testing           │  llama-4-scout                                               │ │
│  │  │  Decomposer        │──────────────────►  9 testing micro-tasks                    │ │
│  │  │  (+ full context)  │  ~500ms                                                      │ │
│  │  └────────┬───────────┘                                                              │ │
│  │           │                                                                           │ │
│  │           ▼                                                                           │ │
│  │  ┌────────────────────┐                                                              │ │
│  │  │  Merger            │                                                              │ │
│  │  │  (dedupe + phase)  │──────────────────►  25 unified micro-tasks                   │ │
│  │  └────────────────────┘                     in 4 execution phases                    │ │
│  │                                                                                       │ │
│  │  Total: ~10s                                                                          │ │
│  └─────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────────────────────┐ │
│  │                         PHASE 2: EXECUTION (MDAP MODE)                               │ │
│  │                                                                                       │ │
│  │  ┌──────────────────────────────────────────────────────────────────────────────┐    │ │
│  │  │                    Execution Phase 1 (7 parallel tasks)                       │    │ │
│  │  │                                                                               │    │ │
│  │  │   ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐            │    │ │
│  │  │   │ MDAP    │  │ MDAP    │  │ MDAP    │  │ MDAP    │  │ MDAP    │  ...        │    │ │
│  │  │   │ Impl    │  │ Impl    │  │ Impl    │  │ Impl    │  │ Impl    │            │    │ │
│  │  │   │ arch-1  │  │ arch-2  │  │ arch-3  │  │ arch-4  │  │ arch-5  │            │    │ │
│  │  │   └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘            │    │ │
│  │  │        │            │            │            │            │                  │    │ │
│  │  │        ▼            ▼            ▼            ▼            ▼                  │    │ │
│  │  │   ┌─────────────────────────────────────────────────────────────┐            │    │ │
│  │  │   │                   Cerebras API (llama-4-scout)              │            │    │ │
│  │  │   │                        ~500ms-3s each                       │            │    │ │
│  │  │   └─────────────────────────────────────────────────────────────┘            │    │ │
│  │  │        │            │            │            │            │                  │    │ │
│  │  │        ▼            ▼            ▼            ▼            ▼                  │    │ │
│  │  │   ┌─────────────────────────────────────────────────────────────┐            │    │ │
│  │  │   │              Generated Code (returned to coordinator)       │            │    │ │
│  │  │   └─────────────────────────────────────────────────────────────┘            │    │ │
│  │  │        │            │            │            │            │                  │    │ │
│  │  │        ▼            ▼            ▼            ▼            ▼                  │    │ │
│  │  │   ┌─────────────────────────────────────────────────────────────┐            │    │ │
│  │  │   │              Write to Target Files (coordinator)            │            │    │ │
│  │  │   └─────────────────────────────────────────────────────────────┘            │    │ │
│  │  │                                                                               │    │ │
│  │  └──────────────────────────────────────────────────────────────────────────────┘    │ │
│  │                                                                                       │ │
│  │  ┌──────────────────────────────────────────────────────────────────────────────┐    │ │
│  │  │                    Execution Phase 2, 3, 4... (parallel)                      │    │ │
│  │  │                           (same pattern)                                      │    │ │
│  │  └──────────────────────────────────────────────────────────────────────────────┘    │ │
│  │                                                                                       │ │
│  │  Total: ~30-75s for 25 tasks                                                          │ │
│  └─────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────────────────────┐ │
│  │                         PHASE 3: ASYNC VALIDATION                                    │ │
│  │                                                                                       │ │
│  │  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐          │ │
│  │  │   Security    │  │  Performance  │  │   Testing     │  │  Architecture │          │ │
│  │  │   Validator   │  │   Validator   │  │   Validator   │  │   Validator   │          │ │
│  │  └───────┬───────┘  └───────┬───────┘  └───────┬───────┘  └───────┬───────┘          │ │
│  │          │                  │                  │                  │                   │ │
│  │          ▼                  ▼                  ▼                  ▼                   │ │
│  │  ┌─────────────────────────────────────────────────────────────────────────────┐     │ │
│  │  │                         Validation Pipeline                                  │     │ │
│  │  │                    Aggregate scores, check consensus                         │     │ │
│  │  └─────────────────────────────────────────────────────────────────────────────┘     │ │
│  │                                    │                                                  │ │
│  │                                    ▼                                                  │ │
│  │                         Overall Score: 0.81                                           │ │
│  │                         Consensus: TRUE                                               │ │
│  │                                                                                       │ │
│  │  Total: ~4-5s                                                                         │ │
│  └─────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────────────────────┐ │
│  │                         PHASE 4: GATE CHECK + DECISION                               │ │
│  │                                                                                       │ │
│  │                              ┌────────────────┐                                       │ │
│  │                              │  Quality Gate  │                                       │ │
│  │                              │    v2 Task     │                                       │ │
│  │                              └───────┬────────┘                                       │ │
│  │                                      │                                                │ │
│  │                                      ▼                                                │ │
│  │                    ┌─────────────────────────────────────┐                           │ │
│  │                    │         Gate Thresholds             │                           │ │
│  │                    │  MVP: 70%  Standard: 95%  Ent: 98%  │                           │ │
│  │                    └─────────────────────────────────────┘                           │ │
│  │                                      │                                                │ │
│  │                          ┌───────────┼───────────┐                                   │ │
│  │                          ▼           ▼           ▼                                   │ │
│  │                     ┌────────┐  ┌────────┐  ┌────────┐                               │ │
│  │                     │PROCEED │  │ITERATE │  │ ABORT  │                               │ │
│  │                     │(done)  │  │(retry) │  │(fail)  │                               │ │
│  │                     └────────┘  └───┬────┘  └────────┘                               │ │
│  │                                     │                                                 │ │
│  │                                     │ Loop back to Phase 2                            │ │
│  │                                     ▼                                                 │ │
│  └─────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                          │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

## MDAP Implementer Detail Flow

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                        cfn-mdap-implementer (Cerebras API Direct)                        │
│                                                                                          │
│  INPUT                                                                                   │
│  ┌─────────────────────────────────────────────────────────────────────────────────────┐ │
│  │  {                                                                                   │ │
│  │    taskId: "task-123",                                                               │ │
│  │    microTaskId: "arch-1",                                                            │ │
│  │    taskDescription: "Create hello.ts with hello() function",                         │ │
│  │    workDir: "/workspace/project",                                                    │ │
│  │    targetFile: "src/hello.ts",                                                       │ │
│  │    contextHints: ["Use TypeScript", "Export function"],                              │ │
│  │    modelTier: 1,                                                                     │ │
│  │    failureCount: 0                                                                   │ │
│  │  }                                                                                   │ │
│  └─────────────────────────────────────────────────────────────────────────────────────┘ │
│                                            │                                             │
│                                            ▼                                             │
│  ┌─────────────────────────────────────────────────────────────────────────────────────┐ │
│  │                            1. SELECT MODEL TIER                                      │ │
│  │                                                                                       │ │
│  │   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐                      │ │
│  │   │      T1         │  │      T2         │  │      T3         │                      │ │
│  │   │   llama-4       │  │   llama-4       │  │   qwen-3-235b   │                      │ │
│  │   │   ~500ms        │  │   ~800ms        │  │   ~2-3s         │                      │ │
│  │   │   cost: 1x      │  │   cost: 1x      │  │   cost: 3x      │                      │ │
│  │   │   quality: 0.7  │  │   quality: 0.85 │  │   quality: 0.95 │                      │ │
│  │   └────────┬────────┘  └────────┬────────┘  └────────┬────────┘                      │ │
│  │            │                    │                    │                               │ │
│  │            └────────────────────┴────────────────────┘                               │ │
│  │                                 │                                                     │ │
│  │                     ┌───────────┴───────────┐                                        │ │
│  │                     │ modelTier = 1 (default)│                                        │ │
│  │                     │ escalate on failure    │                                        │ │
│  │                     └───────────┬───────────┘                                        │ │
│  └─────────────────────────────────┼───────────────────────────────────────────────────┘ │
│                                    │                                                     │
│                                    ▼                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────────────────┐ │
│  │                            2. BUILD PROMPT                                           │ │
│  │                                                                                       │ │
│  │   "You are an expert TypeScript developer.                                           │ │
│  │    Generate code for this atomic micro-task.                                         │ │
│  │                                                                                       │ │
│  │    ## Task                                                                            │ │
│  │    Create hello.ts with hello() function                                             │ │
│  │                                                                                       │ │
│  │    ## Target File                                                                     │ │
│  │    src/hello.ts                                                                       │ │
│  │                                                                                       │ │
│  │    ## Context Hints                                                                   │ │
│  │    - Use TypeScript                                                                   │ │
│  │    - Export function                                                                  │ │
│  │                                                                                       │ │
│  │    ## Output Format                                                                   │ │
│  │    Return ONLY valid JSON: { code: '...', explanation: '...' }"                      │ │
│  └─────────────────────────────────────────────────────────────────────────────────────┘ │
│                                            │                                             │
│                                            ▼                                             │
│  ┌─────────────────────────────────────────────────────────────────────────────────────┐ │
│  │                            3. CALL CEREBRAS API                                      │ │
│  │                                                                                       │ │
│  │   POST https://api.cerebras.ai/v1/chat/completions                                   │ │
│  │   {                                                                                   │ │
│  │     "model": "llama-4-scout-17b-16e-instruct",                                       │ │
│  │     "messages": [{ "role": "user", "content": prompt }],                             │ │
│  │     "max_tokens": 2048,                                                               │ │
│  │     "temperature": 0.5                                                                │ │
│  │   }                                                                                   │ │
│  │                                                                                       │ │
│  │   Response: ~500ms                                                                    │ │
│  └─────────────────────────────────────────────────────────────────────────────────────┘ │
│                                            │                                             │
│                                            ▼                                             │ │
│  ┌─────────────────────────────────────────────────────────────────────────────────────┐ │
│  │                            4. PARSE RESPONSE                                         │ │
│  │                                                                                       │ │
│  │   AI Response:                                                                        │ │
│  │   ```json                                                                             │ │
│  │   {                                                                                   │ │
│  │     "code": "export function hello(): string {\n  return 'Hello, World!';\n}",       │ │
│  │     "explanation": "Simple function returning greeting string"                       │ │
│  │   }                                                                                   │ │
│  │   ```                                                                                 │ │
│  │                                                                                       │ │
│  │   parseJSONFromResponse() extracts JSON from markdown fences                         │ │
│  └─────────────────────────────────────────────────────────────────────────────────────┘ │
│                                            │                                             │
│                                            ▼                                             │
│  OUTPUT                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────────────────┐ │
│  │  {                                                                                   │ │
│  │    taskId: "task-123",                                                               │ │
│  │    microTaskId: "arch-1",                                                            │ │
│  │    success: true,                                                                    │ │
│  │    generatedCode: "export function hello(): string {\n  return 'Hello, World!';\n}",│ │
│  │    targetFile: "src/hello.ts",                                                       │ │
│  │    durationMs: 523,                                                                  │ │
│  │    modelTier: 1,                                                                     │ │
│  │    tierName: "haiku",                                                                │ │
│  │    modelName: "llama-4-scout-17b-16e-instruct",                                      │ │
│  │    estimatedCost: 0.000012,                                                          │ │
│  │    tokens: { input: 245, output: 67 }                                                │ │
│  │  }                                                                                   │ │
│  └─────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                          │
└─────────────────────────────────────────────────────────────────────────────────────────┘

                                            │
                                            ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                         COORDINATOR: Write Generated Code                                │
│                                                                                          │
│  fs.writeFileSync("/workspace/project/src/hello.ts", generatedCode)                     │
│                                                                                          │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

## TDD Loop with MDAP

```
                              ┌─────────────────────────────┐
                              │                             │
                              ▼                             │
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│  1. DECOMPOSE                                                                            │
│     Task → 25 atomic micro-tasks (~10s)                                                  │
└──────────────────────────────────────┬──────────────────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│  2. IMPLEMENT (MDAP)                                                                     │
│     25 tasks × ~1-3s each = ~30-75s total                                               │
│     Cerebras API → Generated Code → Write Files                                          │
└──────────────────────────────────────┬──────────────────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│  3. TEST (Gate Check)                                                                    │
│     Run test suite against generated code                                                │
│     Calculate pass rate                                                                  │
└──────────────────────────────────────┬──────────────────────────────────────────────────┘
                                       │
                              ┌────────┴────────┐
                              │                 │
                    pass_rate >= threshold?     │
                              │                 │
                         ┌────┴────┐       ┌────┴────┐
                         │   YES   │       │   NO    │
                         └────┬────┘       └────┬────┘
                              │                 │
                              ▼                 │
┌─────────────────────────────────────────┐     │
│  4. VALIDATE                            │     │
│     Async validators score quality      │     │
│     Security, Performance, Testing,     │     │
│     Architecture, Code Quality          │     │
└────────────────────┬────────────────────┘     │
                     │                          │
                     ▼                          │
┌─────────────────────────────────────────┐     │
│  5. DECIDE                              │     │
│     Product Owner: PROCEED/ITERATE/ABORT│     │
└────────────────────┬────────────────────┘     │
                     │                          │
            ┌────────┴────────┐                 │
            │                 │                 │
       ┌────┴────┐       ┌────┴────┐            │
       │ PROCEED │       │ ITERATE │────────────┘
       └────┬────┘       └─────────┘     (loop back to step 2)
            │
            ▼
┌─────────────────────────────────────────┐
│  6. COMPLETE                            │
│     Return final code + artifacts       │
└─────────────────────────────────────────┘


TIMING SUMMARY (MDAP vs Standard)
─────────────────────────────────
                    │  Standard (CLI)  │  MDAP (Cerebras)
────────────────────┼──────────────────┼──────────────────
Decomposition       │     ~10s         │     ~10s
Implementation      │    ~25 min       │    ~30-75s
Validation          │     ~5s          │     ~5s
Gate Check          │     ~1s          │     ~1s
────────────────────┼──────────────────┼──────────────────
TOTAL (1 iteration) │    ~26 min       │    ~1.5-2 min
────────────────────┼──────────────────┼──────────────────
3 iterations        │    ~78 min       │    ~5-6 min
────────────────────┴──────────────────┴──────────────────

IMPROVEMENT: ~15-20x faster iteration cycles
```

## Tier Escalation Flow

```
                              FAILURE HANDLING

                              ┌─────────────┐
                              │  Attempt 1  │
                              │    Tier 1   │
                              │ llama-4-scout│
                              │   ~500ms    │
                              └──────┬──────┘
                                     │
                              ┌──────┴──────┐
                              │   SUCCESS?  │
                              └──────┬──────┘
                           Yes │     │ No
                               ▼     ▼
                         ┌─────────┐ ┌─────────────┐
                         │  DONE   │ │  Attempt 2  │
                         └─────────┘ │    Tier 2   │
                                     │ llama-4-scout│
                                     │ (enhanced)  │
                                     │   ~800ms    │
                                     └──────┬──────┘
                                            │
                                     ┌──────┴──────┐
                                     │   SUCCESS?  │
                                     └──────┬──────┘
                                  Yes │     │ No
                                      ▼     ▼
                                ┌─────────┐ ┌─────────────┐
                                │  DONE   │ │  Attempt 3  │
                                └─────────┘ │    Tier 3   │
                                            │ qwen-3-235b │
                                            │ (best model)│
                                            │   ~2-3s     │
                                            └──────┬──────┘
                                                   │
                                            ┌──────┴──────┐
                                            │   SUCCESS?  │
                                            └──────┬──────┘
                                         Yes │     │ No
                                             ▼     ▼
                                       ┌─────────┐ ┌─────────┐
                                       │  DONE   │ │  FAIL   │
                                       └─────────┘ │(escalate│
                                                   │to human)│
                                                   └─────────┘
```

## RuVector Learning Layer Integration

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                           CFN LOOP WITH RUVECTOR LEARNING LAYER                          │
│                                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────────────────────┐ │
│  │                         EXECUTION FLOW (Main Loop)                                   │ │
│  │                                                                                       │ │
│  │  Phase 1          Phase 2          Phase 3          Phase 4                          │ │
│  │  Decompose   →    Implement   →    Validate   →    Gate Check                        │ │
│  │  (4 agents)       (MDAP)           (4 validators)   (Decision)                        │ │
│  │     │                │                 │                │                            │ │
│  │     ▼                ▼                 ▼                ▼                            │ │
│  │  ┌──────┐        ┌──────┐          ┌──────┐        ┌──────┐                          │ │
│  │  │ 25   │        │ Gen  │          │Score │        │ P/I/ │                          │ │
│  │  │tasks │        │ Code │          │ 0.81 │        │  A   │                          │ │
│  │  └───┬──┘        └───┬──┘          └───┬──┘        └───┬──┘                          │ │
│  │      │               │                 │               │                             │ │
│  └──────┼───────────────┼─────────────────┼───────────────┼─────────────────────────────┘ │
│         │               │                 │               │                               │
│         │               │                 │               │                               │
│  ┌──────▼───────────────▼─────────────────▼───────────────▼─────────────────────────────┐ │
│  │                         RUVECTOR LEARNING LAYER                                       │ │
│  │                         (SQLite Storage + RAG)                                        │ │
│  │                                                                                       │ │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │ │
│  │  │  Decomposition  │  │  Error Pattern  │  │  Quality Score  │  │    Decision     │  │ │
│  │  │    Patterns     │  │    Learning     │  │    Tracking     │  │    Outcomes     │  │ │
│  │  ├─────────────────┤  ├─────────────────┤  ├─────────────────┤  ├─────────────────┤  │ │
│  │  │ • Task types    │  │ • Failure modes │  │ • Validator     │  │ • PROCEED %     │  │ │
│  │  │ • Dependencies  │  │ • Retry success │  │   consensus     │  │ • ITERATE %     │  │ │
│  │  │ • Complexity    │  │ • Tier          │  │ • Trend         │  │ • ABORT %       │  │ │
│  │  │   estimates     │  │   escalation    │  │   analysis      │  │ • Context       │  │ │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘  └─────────────────┘  │ │
│  │                                                                                       │ │
│  │  Indexed by: task_type, context_hash, timestamp, iteration_count                     │ │
│  └───────────────────────────────────────────────┬───────────────────────────────────────┘ │
│                                                   │                                        │
│                                    RAG Query      │                                        │
│                                    (context hints)│                                        │
│                                                   │                                        │
│  ┌────────────────────────────────────────────────┴───────────────────────────────────────┐ │
│  │                         FEEDBACK LOOP TO DECOMPOSITION                                 │ │
│  │                                                                                        │ │
│  │  When Phase 1 starts:                                                                  │ │
│  │  1. Query RuVector for similar past tasks                                              │ │
│  │  2. Retrieve learned patterns (decomposition structure, common errors)                 │ │
│  │  3. Inject RAG hints into decomposer context                                           │ │
│  │  4. Decomposers produce better micro-tasks based on historical patterns                │ │
│  │                                                                                        │ │
│  │  Result: Improved first-attempt quality, fewer iterations needed                       │ │
│  └────────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                          │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

### RuVector Capabilities

**Learning Layer Overview:**
RuVector acts as the memory and learning substrate for the CFN Loop. It captures execution telemetry across all phases and uses pattern recognition to improve future task decompositions.

**Core Functions:**
1. **Pattern Capture** - Records decomposition structures, dependencies, and complexity metrics
2. **Error Learning** - Stores failure modes, retry outcomes, and tier escalation patterns
3. **Quality Tracking** - Aggregates validator scores and consensus trends over time
4. **Decision Analysis** - Logs gate check outcomes (PROCEED/ITERATE/ABORT) with context
5. **RAG Enhancement** - Provides context hints to decomposers based on historical similarity

**Key Implementation Files:**
- `docker/trigger-dev/src/lib/ruvector-error-pattern-learning.ts` - Captures implementation failures and retry patterns
- `docker/trigger-dev/src/lib/ruvector-rag-decomposition.ts` - Provides context hints via RAG queries
- `docker/trigger-dev/src/lib/ruvector-init.ts` - Database initialization and schema management
- `docker/trigger-dev/src/lib/ruvector-schemas.ts` - Data validation and type definitions

**Current Status:**
Infrastructure exists but needs initialization. The coordinator shows a warning in logs when RuVector is disabled. This is intentional - the system works without it but loses learning feedback. Will be enabled in production after initialization verification.

**Optional/Additive Design:**
RuVector is designed to be optional. The coordinator runs normally without it, but doesn't benefit from:
- Historical pattern recognition
- Error prediction and prevention
- Context-aware decomposition hints
- Quality trend analysis

Once enabled, RuVector continuously improves decomposition quality through accumulated learning.

## Non-MDAP Mode (CLI Sprint Aggregation)

When `enableMDAP: false`, the coordinator uses CLI Sprint mode instead of direct Cerebras API calls:

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                       NON-MDAP MODE: CLI SPRINT AGGREGATION                              │
│                                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────────────────────┐ │
│  │                         PHASE 2: EXECUTION (CLI MODE)                               │ │
│  │                                                                                       │ │
│  │  22 micro-tasks are aggregated into 4 sprints by category:                           │ │
│  │                                                                                       │ │
│  │  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐          │ │
│  │  │ Architecture  │  │  Security     │  │ Performance   │  │  Testing      │          │ │
│  │  │ Sprint (6)    │  │  Sprint (5)   │  │  Sprint (3)   │  │  Sprint (8)   │          │ │
│  │  └───────┬───────┘  └───────┬───────┘  └───────┬───────┘  └───────┬───────┘          │ │
│  │          │                  │                  │                  │                   │ │
│  │          ▼                  ▼                  ▼                  ▼                   │ │
│  │  ┌─────────────────────────────────────────────────────────────────────────────┐     │ │
│  │  │                     CLI Sprint Implementer (Sequential)                      │     │ │
│  │  │                                                                              │     │ │
│  │  │  Each sprint spawns Claude Code CLI subprocess:                              │     │ │
│  │  │    claude-code --dangerously-skip-permissions -p "EXECUTE: [task list]"     │     │ │
│  │  │                                                                              │     │ │
│  │  │  Timeout: 300000ms (5 minutes) per sprint                                    │     │ │
│  │  │  ^^^^^^^^ CRITICAL: Must match in both coordinator AND implementer          │     │ │
│  │  │                                                                              │     │ │
│  │  └─────────────────────────────────────────────────────────────────────────────┘     │ │
│  │                                                                                       │ │
│  │  Total: ~6-20 min for 22 tasks (vs ~30-75s in MDAP mode)                             │ │
│  └─────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                          │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

### CLI Sprint Timeout Configuration

**IMPORTANT:** Two timeout values must be synchronized:

| Location | Variable | Value | Purpose |
|----------|----------|-------|---------|
| `cfn-coordinator.ts:521` | `timeout` (payload) | 300000ms | Passed to CLI sprint implementer |
| `cfn-coordinator.ts:527` | `pollWithTimeout` | 300000ms | Polling timeout waiting for result |
| `cfn-cli-sprint-implementer.ts:302` | Default timeout | 300000ms | Used if payload.timeout not set |

**Root Cause of Previous Failures:**
The coordinator was passing `timeout: 180000` (3 min) which overrode the default, causing sprints to timeout before CLI tasks completed (~195s execution with 180s limit).

### Mode Selection

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                            COORDINATOR MODE SELECTION                                    │
│                                                                                          │
│  Payload: { enableMDAP: boolean }                                                        │
│                                                                                          │
│                                 ┌───────────────┐                                        │
│                                 │  enableMDAP   │                                        │
│                                 └───────┬───────┘                                        │
│                                         │                                                │
│                              ┌──────────┴──────────┐                                     │
│                              │                     │                                     │
│                         ┌────┴────┐           ┌────┴────┐                                │
│                         │  true   │           │  false  │                                │
│                         └────┬────┘           └────┬────┘                                │
│                              │                     │                                     │
│                              ▼                     ▼                                     │
│  ┌──────────────────────────────────┐  ┌──────────────────────────────────┐             │
│  │        MDAP MODE                  │  │        CLI SPRINT MODE           │             │
│  │                                   │  │                                   │             │
│  │  • Direct Cerebras API calls      │  │  • Claude Code CLI subprocess    │             │
│  │  • ~500ms-3s per micro-task       │  │  • ~90s-300s per sprint          │             │
│  │  • Parallel execution phases      │  │  • Sequential sprints            │             │
│  │  • Lower latency, higher cost     │  │  • Higher latency, lower cost    │             │
│  │  • Best for: rapid TDD iteration  │  │  • Best for: complex multi-file  │             │
│  │                                   │  │    tasks needing full CLI power  │             │
│  └──────────────────────────────────┘  └──────────────────────────────────┘             │
│                                                                                          │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

### When to Use Each Mode

| Use Case | Recommended Mode | Reason |
|----------|-----------------|--------|
| Simple code generation | MDAP (enableMDAP: true) | Fast iteration, low latency |
| Complex refactoring | CLI Sprint (enableMDAP: false) | Full Claude CLI capabilities |
| TDD rapid feedback | MDAP | ~1-3s per task enables tight loops |
| Multi-file coordination | CLI Sprint | CLI handles file relationships |
| Production workloads | CLI Sprint | More robust, handles edge cases |
| Prototyping | MDAP | Speed over robustness |
