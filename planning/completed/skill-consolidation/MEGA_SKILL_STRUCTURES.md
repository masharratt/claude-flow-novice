# Mega-Skill Directory Structures

Detailed directory structures for each of the 12 mega-skills.

---

## 1. agent-lifecycle

Unified agent management from selection through completion.

```
agent-lifecycle/
├── SKILL.md
├── package.json
├── tsconfig.json
├── lib/
│   ├── index.ts                    # Main exports
│   ├── selection/                  # From cfn-agent-selector + fallback
│   │   ├── index.ts
│   │   ├── classifier.ts           # Task → agent type mapping
│   │   ├── fallback.ts             # Fallback behavior
│   │   ├── confidence.ts           # Confidence scoring
│   │   └── mappings.json           # Agent mappings config
│   ├── spawning/                   # From cfn-agent-spawning
│   │   ├── index.ts
│   │   ├── spawn-agent.sh          # Bash spawner
│   │   ├── token-manager.ts        # Token allocation
│   │   └── health-monitor.ts       # Agent health checks
│   ├── output/                     # From cfn-agent-output-processing
│   │   ├── index.ts
│   │   ├── parser.ts               # Output parsing
│   │   ├── patterns.ts             # Extraction patterns
│   │   └── confidence-extractor.ts
│   ├── injection/                  # From cfn-specialist-injection
│   │   ├── specialist-injector.sh
│   │   └── context-builder.ts
│   └── audit/                      # From agent-lifecycle
│       ├── lifecycle-tracker.ts
│       ├── sqlite-store.ts
│       └── queries.sql
├── types/
│   ├── index.ts
│   ├── selection.ts
│   ├── spawning.ts
│   └── audit.ts
├── cli/
│   ├── select-agent.sh
│   ├── spawn-agent.sh
│   ├── process-output.sh
│   └── audit.sh
├── __tests__/
│   ├── selection.test.ts
│   ├── spawning.test.ts
│   └── output.test.ts
└── docs/
    ├── MIGRATION.md
    └── API.md
```

---

## 2. task-planning

Complete task analysis: classification, complexity, scope, and decomposition.

```
task-planning/
├── SKILL.md
├── package.json
├── tsconfig.json
├── lib/
│   ├── index.ts
│   ├── classifier/                 # From task-classifier
│   │   ├── index.ts
│   │   ├── domains.ts              # software/content/research/design/infra/data
│   │   ├── keywords.ts             # Keyword matching rules
│   │   └── config.json
│   ├── complexity/                 # From cfn-complexity-estimator
│   │   ├── index.ts
│   │   ├── estimator.ts            # Iteration estimation
│   │   └── factors.ts              # Complexity factors
│   ├── scope/                      # From cfn-scope-simplifier
│   │   ├── index.ts
│   │   ├── simplifier.ts           # Scope reduction logic
│   │   └── boundaries.ts           # Scope boundary detection
│   ├── config/                     # From cfn-task-config-init
│   │   ├── index.ts
│   │   ├── initializer.ts          # Config initialization
│   │   └── templates/
│   ├── decomposition/              # From cfn-task-decomposition
│   │   ├── index.ts
│   │   ├── decomposer.ts           # Task breakdown
│   │   └── dependency-graph.ts
│   └── audit/                      # From cfn-task-audit
│       ├── index.ts
│       └── tracker.ts
├── types/
│   └── index.ts
├── cli/
│   ├── classify-task.sh
│   ├── estimate-complexity.sh
│   └── decompose-task.sh
└── docs/
    └── MIGRATION.md
```

---

## 3. error-management

Unified error handling: capture, batching, logging, and operations.

```
error-management/
├── SKILL.md
├── package.json
├── tsconfig.json
├── lib/
│   ├── index.ts
│   ├── capture/                    # From cfn-standardized-error-handling
│   │   ├── index.ts
│   │   ├── categorizer.ts          # TIMEOUT, CRASH, VALIDATION, etc.
│   │   ├── patterns.ts             # Error detection patterns
│   │   └── recovery.ts             # Recovery strategies
│   ├── batching/                   # From cfn-error-batching-strategy
│   │   ├── index.ts
│   │   ├── batcher.ts              # Group errors for agents
│   │   ├── tiers.ts                # Batching tier logic
│   │   └── templates/
│   │       └── default-tiers.json
│   ├── logging/                    # From cfn-error-logging
│   │   ├── index.ts
│   │   ├── logger.ts               # Error logging
│   │   ├── formatter.ts            # Log formatting
│   │   └── storage.ts              # Log persistence
│   └── operations/                 # From cfn-log-operations
│       ├── index.ts
│       ├── search.ts               # Log search
│       ├── aggregate.ts            # Log aggregation
│       └── rotate.ts               # Log rotation
├── types/
│   └── index.ts
├── cli/
│   ├── capture-error.sh
│   ├── batch-errors.sh
│   ├── search-logs.sh
│   └── rotate-logs.sh
└── docs/
    └── MIGRATION.md
```

---

## 4. loop-orchestration

CFN Loop coordination: orchestration, output processing, validation.

```
loop-orchestration/
├── SKILL.md
├── package.json
├── tsconfig.json
├── lib/
│   ├── index.ts
│   ├── orchestrator/               # From cfn-loop-orchestration
│   │   ├── index.ts
│   │   ├── orchestrate.sh          # Main orchestrator script
│   │   ├── gate-check.ts           # Pass rate gates
│   │   └── iteration-manager.ts
│   ├── output/                     # From cfn-loop-output-processing
│   │   ├── index.ts
│   │   ├── loop3-parser.ts         # Implementer output
│   │   ├── loop2-parser.ts         # Validator output
│   │   └── consensus.ts            # Consensus calculation
│   ├── validation/                 # From cfn-loop-validation
│   │   ├── index.ts
│   │   ├── layer-validators/
│   │   │   ├── coordinator.ts
│   │   │   ├── orchestrator.ts
│   │   │   ├── consensus.ts
│   │   │   └── decision.ts
│   │   └── evidence-chain.sql
│   └── coordination/               # From cfn-coordination
│       ├── index.ts
│       ├── patterns/
│       │   ├── chain.ts
│       │   ├── broadcast.ts
│       │   ├── mesh.ts
│       │   └── consensus.ts
│       └── signals.ts
├── types/
│   └── index.ts
├── cli/
│   ├── orchestrate.sh
│   ├── parse-output.sh
│   └── validate.sh
└── docs/
    └── MIGRATION.md
```

---

## 5. validation-framework

Multi-layer validation: templates, defense-in-depth, deliverables.

```
validation-framework/
├── SKILL.md
├── package.json
├── tsconfig.json
├── lib/
│   ├── index.ts
│   ├── templates/                  # From cfn-validation-templates
│   │   ├── index.ts
│   │   ├── content.json
│   │   ├── software.json
│   │   ├── design.json
│   │   ├── infrastructure.json
│   │   ├── research.json
│   │   └── data.json
│   ├── layers/                     # From cfn-defense-in-depth
│   │   ├── index.ts
│   │   ├── layer1-coordinator.ts
│   │   ├── layer2-orchestrator.ts
│   │   ├── layer3-consensus.ts
│   │   └── layer4-decision.ts
│   ├── deliverables/               # From cfn-deliverable-validation
│   │   ├── index.ts
│   │   ├── file-validator.ts
│   │   └── content-validator.ts
│   ├── instrumentation/            # From cfn-validation-runner-instrumentation
│   │   ├── index.ts
│   │   └── runner.ts
│   └── json/                       # From json-validation
│       ├── index.ts
│       ├── schema-validator.ts
│       ├── sanitizer.ts
│       └── schemas/
├── types/
│   └── index.ts
├── cli/
│   ├── validate.sh
│   └── check-deliverables.sh
└── docs/
    └── MIGRATION.md
```

---

## 6. docker-runtime

Docker container orchestration: spawning, coordination, waves.

```
docker-runtime/
├── SKILL.md
├── package.json
├── tsconfig.json
├── lib/
│   ├── index.ts
│   ├── spawning/                   # From cfn-docker-agent-spawning
│   │   ├── index.ts
│   │   ├── spawn-container.sh
│   │   ├── resource-manager.ts
│   │   └── token-generator.ts
│   ├── coordination/               # From cfn-docker-coordination
│   │   ├── index.ts
│   │   ├── redis-state.ts
│   │   └── container-registry.ts
│   ├── logging/                    # From cfn-docker-logging
│   │   ├── index.ts
│   │   ├── log-collector.ts
│   │   └── schema.sql
│   ├── orchestration/              # From cfn-docker-loop-orchestration
│   │   ├── index.ts
│   │   └── loop-runner.ts
│   ├── mcp/                        # From cfn-docker-skill-mcp-selection + cfn-mcp-container-selector
│   │   ├── index.ts
│   │   ├── selector.ts
│   │   ├── mappings.json
│   │   └── frontend.json
│   │   └── backend.json
│   │   └── testing.json
│   └── waves/                      # From cfn-docker-wave-execution
│       ├── index.ts
│       ├── wave-executor.ts
│       └── memory-tiers.ts
├── types/
│   └── index.ts
├── cli/
│   ├── spawn-container.sh
│   ├── wave-execute.sh
│   └── collect-logs.sh
└── docs/
    └── MIGRATION.md
```

---

## 7. memory-persistence

Data persistence: SQLite, Redis, auto-persistence.

```
memory-persistence/
├── SKILL.md
├── package.json
├── tsconfig.json
├── lib/
│   ├── index.ts
│   ├── sqlite/                     # From cfn-sqlite-memory + cfn-sqlite-cfn-loop
│   │   ├── index.ts
│   │   ├── client.ts
│   │   ├── acl.ts                  # 5-level ACL
│   │   ├── queries.ts
│   │   └── schema.sql
│   ├── redis/                      # From cfn-redis-coordination
│   │   ├── index.ts
│   │   ├── client.ts
│   │   ├── patterns.ts             # Pub/sub patterns
│   │   └── coordination.ts
│   ├── auto/                       # From cfn-automatic-memory-persistence
│   │   ├── index.ts
│   │   ├── auto-persist.ts
│   │   └── confidence-tracker.ts
│   └── management/                 # From cfn-memory-management
│       ├── index.ts
│       ├── heap-profiler.ts
│       └── limits.ts
├── types/
│   └── index.ts
├── cli/
│   ├── query-memory.sh
│   ├── persist-output.sh
│   └── profile-heap.sh
└── docs/
    └── MIGRATION.md
```

---

## 8. sprint-execution

Sprint lifecycle: planning, execution, epic decomposition.

```
sprint-execution/
├── SKILL.md
├── package.json
├── tsconfig.json
├── lib/
│   ├── index.ts
│   ├── planner/                    # From cfn-sprint-planner
│   │   ├── index.ts
│   │   ├── planner.ts
│   │   └── config-generator.ts
│   ├── executor/                   # From cfn-sprint-execution
│   │   ├── index.ts
│   │   ├── executor.ts
│   │   └── loop-integration.ts
│   ├── epic/                       # From cfn-epic-decomposer
│   │   ├── index.ts
│   │   ├── decomposer.ts
│   │   └── topological-sort.ts
│   └── multi-coordinator/          # From cfn-multi-coordinator-planning
│       ├── index.ts
│       └── zone-manager.ts
├── types/
│   └── index.ts
├── cli/
│   ├── plan-sprint.sh
│   ├── execute-sprint.sh
│   └── decompose-epic.sh
└── docs/
    └── MIGRATION.md
```

---

## 9. skill-management

Skill lifecycle: building, loading, promotion, deployment.

```
skill-management/
├── SKILL.md
├── package.json
├── tsconfig.json
├── lib/
│   ├── index.ts
│   ├── builder/                    # From cfn-skill-builder
│   │   ├── index.ts
│   │   ├── generator.ts
│   │   └── templates/
│   ├── loader/                     # From cfn-skill-loader
│   │   ├── index.ts
│   │   ├── loader.ts
│   │   └── cache.ts                # LRU cache
│   ├── propagation/                # From cfn-skill-propagation
│   │   ├── index.ts
│   │   └── propagator.ts
│   ├── promotion/                  # From cfn-promotion
│   │   ├── index.ts
│   │   ├── promote.sh
│   │   └── validator.ts
│   └── deployment/                 # From cfn-deployment
│       ├── index.ts
│       └── deployer.ts
├── types/
│   └── index.ts
├── cli/
│   ├── build-skill.sh
│   ├── load-skill.sh
│   ├── promote-skill.sh
│   └── deploy-skill.sh
└── docs/
    └── MIGRATION.md
```

---

## 10. test-framework

Unified testing: runner, execution, webapp testing.

```
test-framework/
├── SKILL.md
├── package.json
├── tsconfig.json
├── lib/
│   ├── index.ts
│   ├── runner/                     # From cfn-test-runner
│   │   ├── index.ts
│   │   ├── runner.sh
│   │   ├── suite-orchestrator.ts
│   │   └── benchmark-storage.ts
│   ├── execution/                  # From cfn-test-execution
│   │   ├── index.ts
│   │   ├── coordinator-pattern.ts
│   │   └── cache-reader.ts
│   └── webapp/                     # From cfn-webapp-testing
│       ├── index.ts
│       ├── playwright-runner.ts
│       └── screenshot-diff.ts
├── types/
│   └── index.ts
├── cli/
│   ├── run-tests.sh
│   ├── run-webapp-tests.sh
│   └── compare-screenshots.sh
└── docs/
    └── MIGRATION.md
```

---

## 11. intervention-system

Intervention lifecycle: hooks, detection, orchestration.

```
intervention-system/
├── SKILL.md
├── package.json
├── tsconfig.json
├── lib/
│   ├── index.ts
│   ├── hooks/                      # From cfn-hook-pipeline
│   │   ├── index.ts
│   │   ├── post-edit.ts
│   │   ├── security-scanner.ts
│   │   └── config.json
│   ├── detection/                  # From cfn-intervention-detector
│   │   ├── index.ts
│   │   ├── stall-detector.ts
│   │   └── patterns.ts
│   └── orchestration/              # From cfn-intervention-orchestrator
│       ├── index.ts
│       ├── strategies/
│       │   ├── agent-swap.ts
│       │   ├── specialist-inject.ts
│       │   └── scope-reduce.ts
│       └── executor.ts
├── types/
│   └── index.ts
├── cli/
│   ├── run-hooks.sh
│   ├── detect-intervention.sh
│   └── execute-intervention.sh
└── docs/
    └── MIGRATION.md
```

---

## 12. routing-config

Provider routing and configuration management.

```
routing-config/
├── SKILL.md
├── package.json
├── tsconfig.json
├── lib/
│   ├── index.ts
│   ├── provider/                   # From cfn-provider-routing
│   │   ├── index.ts
│   │   ├── router.ts
│   │   ├── model-mapper.ts
│   │   └── providers/
│   │       ├── zai.ts
│   │       ├── kimi.ts
│   │       ├── anthropic.ts
│   │       └── openrouter.ts
│   ├── hybrid/                     # From cfn-hybrid-routing
│   │   ├── index.ts
│   │   ├── channel-selector.ts
│   │   └── fallback.ts
│   └── config/                     # From cfn-config-management
│       ├── index.ts
│       ├── manager.ts
│       ├── validator.ts
│       └── config.json
├── types/
│   └── index.ts
├── cli/
│   ├── route-request.sh
│   └── manage-config.sh
└── docs/
    └── MIGRATION.md
```

---

## Notes

1. **All mega-skills follow the same pattern:**
   - Single SKILL.md at root
   - `lib/` for implementation modules
   - `types/` for TypeScript definitions
   - `cli/` for bash command wrappers
   - `docs/` for migration and API docs

2. **Internal module organization:**
   - Each absorbed skill becomes a subdirectory in `lib/`
   - Maintains clear separation of concerns
   - Enables gradual migration

3. **CLI compatibility:**
   - Old CLI commands can be symlinked to new locations
   - Wrapper scripts maintain backwards compatibility
