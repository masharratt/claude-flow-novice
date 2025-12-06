# Math Intelligence Platform - Separation Plan

**Purpose**: Extract math-focused components into a standalone project (`math-intelligence-platform`) following the successful SEO separation pattern.

**Status**: PLANNING
**Date**: 2025-12-04

---

## Executive Summary

Create a standalone `math-intelligence-platform` project that:
- Depends on CFN for orchestration loops, agent spawning, and coordination
- Contains math-specific agents, skills, commands, and workflows
- Shares Trigger.dev and RuVector infrastructure with CFN
- Reuses CFN environment variables for seamless integration

---

## 1. Project Structure

### Target Directory Structure

```
C:\Users\masha\Documents\math-intelligence-platform\
├── .claude/
│   ├── agents/
│   │   └── math-team/                    # Math-specific agents
│   │       ├── algebra-specialist.md
│   │       ├── calculus-specialist.md
│   │       ├── statistics-specialist.md
│   │       ├── linear-algebra-specialist.md
│   │       ├── discrete-math-specialist.md
│   │       ├── numerical-analyst.md
│   │       ├── proof-validator.md
│   │       └── math-tutor.md
│   ├── skills/
│   │   └── math-*/                       # Math-specific skills
│   │       ├── equation-solver/
│   │       ├── symbolic-computation/
│   │       ├── graph-visualizer/
│   │       ├── proof-assistant/
│   │       ├── latex-formatter/
│   │       └── problem-generator/
│   ├── commands/
│   │   └── math/                         # Math-specific commands
│   │       ├── solve.md
│   │       ├── prove.md
│   │       ├── visualize.md
│   │       └── explain.md
│   └── hooks/                            # Inherited from CFN
├── config/
│   ├── math.config.ts                    # Math-specific settings
│   └── providers.ts                      # AI provider overrides (optional)
├── docker/
│   └── trigger-dev/                      # Math-specific Trigger.dev tasks
│       ├── src/
│       │   ├── trigger/
│       │   │   ├── math-solver.ts
│       │   │   ├── math-prover.ts
│       │   │   ├── math-visualizer.ts
│       │   │   └── index.ts
│       │   └── lib/
│       │       ├── math-engine.ts
│       │       ├── symbolic-parser.ts
│       │       └── latex-renderer.ts
│       ├── package.json
│       └── trigger.config.ts
├── knowledge-store/
│   └── math/                             # Math domain knowledge
│       ├── formulas/
│       ├── theorems/
│       └── worked-examples/
├── src/
│   ├── engines/                          # Core math computation
│   │   ├── symbolic.ts
│   │   ├── numeric.ts
│   │   └── graphing.ts
│   └── validators/
│       └── proof-checker.ts
├── tests/
│   ├── unit/
│   ├── integration/
│   └── math-specific/
├── docs/
│   ├── GETTING_STARTED.md
│   ├── ARCHITECTURE.md
│   └── API_REFERENCE.md
├── .env.example
├── package.json
├── tsconfig.json
├── CLAUDE.md                             # Math-specific CLAUDE.md
└── README.md
```

---

## 2. CFN Dependency Relationship

### Dependency Architecture

```
┌─────────────────────────────────────────────────────────┐
│          math-intelligence-platform                      │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Math Agents, Skills, Commands                   │   │
│  │  (math-solver, proof-validator, etc.)           │   │
│  └─────────────────────────────────────────────────┘   │
│                          │                               │
│                          ▼                               │
│  ┌─────────────────────────────────────────────────┐   │
│  │  CFN Integration Layer                           │   │
│  │  - Import CFN skills                            │   │
│  │  - Extend CFN agents                            │   │
│  │  - Use CFN coordination patterns                │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│              claude-flow-novice (CFN)                    │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Core Framework (NEVER modified by math project) │   │
│  │  - cfn-loop-orchestration                       │   │
│  │  - cfn-agent-lifecycle                          │   │
│  │  - cfn-redis-coordination                       │   │
│  │  - cfn-docker-runtime                           │   │
│  │  - cfn-ruvector-codebase-index                  │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Shared Infrastructure                          │   │
│  │  - docker/trigger-dev-v4/                       │   │
│  │  - docker/trigger-dev/                          │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### package.json Dependency

```json
{
  "name": "math-intelligence-platform",
  "version": "1.0.0",
  "description": "AI-powered mathematical computation and tutoring platform",
  "type": "module",
  "devDependencies": {
    "claude-flow-novice": "^2.18.1"
  },
  "dependencies": {
    "@trigger.dev/sdk": "^4.1.2",
    "@ruvector/core": "^0.1.15",
    "mathjs": "^12.4.0",
    "nerdamer": "^1.1.13",
    "katex": "^0.16.9",
    "d3": "^7.8.5"
  }
}
```

### What CFN Provides (DO NOT DUPLICATE)

| Category | Items | Usage Pattern |
|----------|-------|---------------|
| **Loop Orchestration** | `/cfn-loop-cli`, `/cfn-loop-task` | Execute math tasks via CFN loops |
| **Agent Lifecycle** | `cfn-agent-lifecycle`, `cfn-agent-spawning` | Spawn math agents using CFN patterns |
| **Coordination** | `cfn-redis-coordination`, `cfn-memory-persistence` | Task queue, agent coordination |
| **Docker Runtime** | `cfn-docker-runtime`, `cfn-docker-wave-execution` | Container-based execution |
| **Hooks** | `cfn-invoke-pre-edit.sh`, `cfn-invoke-post-edit.sh` | Pre/post edit validation |
| **Validation** | `cfn-validation-framework`, `cfn-test-framework` | Quality gates |

### What Math Creates (NEW)

| Category | Items | Purpose |
|----------|-------|---------|
| **Math Agents** | `algebra-specialist`, `calculus-specialist`, etc. | Domain-specific expertise |
| **Math Skills** | `equation-solver`, `proof-assistant`, etc. | Computation capabilities |
| **Math Commands** | `/math solve`, `/math prove`, etc. | User-facing commands |
| **Trigger Tasks** | `math-solver`, `math-prover`, etc. | Async computation jobs |
| **Knowledge Store** | Formulas, theorems, worked examples | Reference data |

---

## 3. RuVector Integration

### Shared RuVector Infrastructure

RuVector is managed at the CFN level. Math project uses the same infrastructure:

```
CFN RuVector Database
├── Codebase Index (CFN files)
├── Learning Storage (CFN patterns)
├── Error Patterns (CFN learnings)
└── Math Collections (NEW - math-specific)
    ├── math-formulas
    ├── math-theorems
    ├── math-worked-examples
    └── math-error-patterns
```

### RuVector Collections for Math

```typescript
// docker/trigger-dev/src/lib/ruvector-math-collections.ts

import { RuVector } from '@ruvector/core';

// Math-specific collection schemas
export const MATH_COLLECTIONS = {
  formulas: {
    name: 'math-formulas',
    description: 'Mathematical formulas and identities',
    schema: {
      formula: 'string',      // LaTeX representation
      domain: 'string',       // algebra, calculus, etc.
      complexity: 'number',   // 1-5 scale
      prerequisites: 'array', // Required knowledge
      embedding: 'vector'     // Semantic embedding
    }
  },
  theorems: {
    name: 'math-theorems',
    description: 'Mathematical theorems and proofs',
    schema: {
      statement: 'string',
      proof: 'string',
      domain: 'string',
      importance: 'number',
      embedding: 'vector'
    }
  },
  examples: {
    name: 'math-worked-examples',
    description: 'Step-by-step problem solutions',
    schema: {
      problem: 'string',
      solution: 'string',
      steps: 'array',
      domain: 'string',
      difficulty: 'number',
      embedding: 'vector'
    }
  }
};
```

### Semantic Search for Math

```typescript
// Query similar formulas
const similar = await ruvector.query('math-formulas', {
  vector: embed("quadratic formula"),
  topK: 5,
  filter: { domain: 'algebra' }
});

// Find relevant theorems for a proof
const theorems = await ruvector.query('math-theorems', {
  vector: embed("prove continuity implies integrability"),
  topK: 3
});

// Get worked examples for learning
const examples = await ruvector.query('math-worked-examples', {
  vector: embed("solve differential equation"),
  filter: { difficulty: { $lte: 3 } }
});
```

---

## 4. Trigger.dev Integration

### Shared Trigger.dev v4 Infrastructure

**DO NOT duplicate** the Trigger.dev infrastructure. Math project registers tasks with the existing CFN Trigger.dev instance.

### Architecture

```
CFN Trigger.dev v4 Instance (http://localhost:8030)
├── Project: CFN (proj_uuvpcrkpfruhlpbpzlov)
│   ├── hello-world
│   ├── claude-agent
│   ├── cfn-implementer
│   └── ... (existing CFN tasks)
│
└── Project: Math (proj_math_xxxxx) ← NEW
    ├── math-solver
    ├── math-prover
    ├── math-visualizer
    ├── math-tutor
    └── problem-generator
```

### Math Trigger.dev Tasks

```typescript
// docker/trigger-dev/src/trigger/math-solver.ts

import { task, tasks } from "@trigger.dev/sdk/v3";
import { execa } from "execa";

export const mathSolverTask = task({
  id: "math-solver",
  retry: { maxAttempts: 3 },
  run: async (payload: {
    problem: string;
    domain: 'algebra' | 'calculus' | 'statistics' | 'linear-algebra';
    outputFormat: 'latex' | 'plain' | 'json';
    showSteps: boolean;
  }) => {
    // 1. Spawn math agent via CFN
    const result = await execa("claude", [
      "--agent", "algebra-specialist",
      "--prompt", `Solve: ${payload.problem}`,
      "--output-format", payload.outputFormat,
      payload.showSteps ? "--show-steps" : ""
    ].filter(Boolean));

    // 2. Parse and structure result
    return {
      success: true,
      problem: payload.problem,
      solution: result.stdout,
      domain: payload.domain,
      format: payload.outputFormat
    };
  }
});

export const mathProverTask = task({
  id: "math-prover",
  retry: { maxAttempts: 2 },
  run: async (payload: {
    theorem: string;
    proofMethod: 'direct' | 'contradiction' | 'induction' | 'constructive';
    domain: string;
  }) => {
    const result = await execa("claude", [
      "--agent", "proof-validator",
      "--prompt", `Prove: ${payload.theorem} using ${payload.proofMethod}`
    ]);

    return {
      success: true,
      theorem: payload.theorem,
      proof: result.stdout,
      method: payload.proofMethod,
      validated: true
    };
  }
});
```

### trigger.config.ts (Math Project)

```typescript
// math-intelligence-platform/docker/trigger-dev/trigger.config.ts

import type { TriggerConfig } from "@trigger.dev/sdk/v3";

export const config: TriggerConfig = {
  project: "proj_math_xxxxx", // Separate project ID
  triggerUrl: process.env.TRIGGER_API_URL || "http://localhost:8030",
  maxDuration: 600, // Longer for complex computations
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 3,
      factor: 2,
      minTimeoutInMs: 2000,
      maxTimeoutInMs: 30000
    },
  },
  dirs: ["./src/trigger"],
};
```

### Creating the Math Trigger.dev Project

```bash
# 1. Navigate to math project
cd /mnt/c/Users/masha/Documents/math-intelligence-platform

# 2. Login to shared Trigger.dev instance
npx trigger.dev@latest login -a http://localhost:8030 --profile math-platform

# 3. Initialize project (creates new project ID)
npx trigger.dev@latest init --project-name "Math Intelligence Platform"

# 4. Start dev server
npx trigger.dev@latest dev --profile math-platform
```

---

## 5. Environment Variables

### Strategy: Inheritance with Overrides

Math project inherits all CFN environment variables and adds math-specific ones.

### .env.example (Math Project)

```bash
# ============================================
# INHERITED FROM CFN (copy from CFN .env)
# ============================================

# Core CFN Runtime
CFN_TASK_ID=                          # Auto-generated
CFN_TASK_TIMEOUT=3600                 # Default timeout
CFN_ITERATION_LIMIT=10                # Max iterations

# Coordinator Resources
CFN_MEMORY_BUDGET=40g                 # Memory for agents
CFN_CPU_LIMIT=4                       # CPU cores
CFN_MAX_PARALLEL_AGENTS=4             # Concurrent agents
CFN_SPAWN_INTERVAL_MS=500             # Spawn delay

# Redis Coordination
CFN_REDIS_HOST=redis                  # Service name in Docker
CFN_REDIS_PORT=6379                   # Default port
CFN_REDIS_PASSWORD=                   # Required in production

# Docker Configuration
CFN_DOCKER_SOCKET=/var/run/docker.sock
CFN_NETWORK_NAME=cfn-network
CFN_CONTAINER_MODE=false

# Provider Configuration
CFN_CUSTOM_ROUTING=true               # Enable custom providers
CFN_DEFAULT_PROVIDER=zai              # Cost-optimized default

# AI Provider Keys (same as CFN)
ANTHROPIC_API_KEY=                    # Anthropic direct
ZAI_API_KEY=                          # Z.ai (cost-optimized)
KIMI_API_KEY=                         # Kimi (balanced)
OPENROUTER_API_KEY=                   # OpenRouter (flexible)
GEMINI_API_KEY=                       # Google Gemini
XAI_API_KEY=                          # X.ai Grok

# Trigger.dev (shared instance)
TRIGGER_API_URL=http://localhost:8030
TRIGGER_SECRET_KEY=tr_dev_xxxx        # Dev environment key

# RuVector
RUVECTOR_DB_PATH=./.claude/skills/cfn-ruvector-codebase-index/data/
OPENAI_API_KEY=                       # For embeddings

# ============================================
# MATH-SPECIFIC EXTENSIONS
# ============================================

# Math Project Identification
MATH_PROJECT_ID=math-intelligence-platform
MATH_VERSION=1.0.0

# Math Trigger.dev Project (separate from CFN)
TRIGGER_MATH_PROJECT_ID=proj_math_xxxxx
TRIGGER_MATH_PROFILE=math-platform

# Math Computation Settings
MATH_PRECISION=15                     # Decimal precision
MATH_TIMEOUT_SYMBOLIC=30000           # Symbolic computation timeout (ms)
MATH_TIMEOUT_NUMERIC=10000            # Numeric computation timeout (ms)
MATH_MAX_ITERATIONS=1000              # Iterative solver limit

# Math Knowledge Store
MATH_KNOWLEDGE_PATH=./knowledge-store/math/
MATH_FORMULAS_COLLECTION=math-formulas
MATH_THEOREMS_COLLECTION=math-theorems
MATH_EXAMPLES_COLLECTION=math-worked-examples

# LaTeX Rendering
KATEX_STRICT=false                    # LaTeX parsing mode
KATEX_THROW_ON_ERROR=false            # Continue on render error

# Visualization
MATH_GRAPH_BACKEND=d3                 # d3 | plotly | matplotlib
MATH_GRAPH_RESOLUTION=high            # low | medium | high

# Optional: Math-specific provider override
# MATH_PREFERRED_PROVIDER=anthropic   # Force premium for complex proofs
```

### Environment Variable Loading

```typescript
// math-intelligence-platform/src/config/env.ts

import dotenv from 'dotenv';
import path from 'path';

// Load math-specific .env first
dotenv.config({ path: path.join(process.cwd(), '.env') });

// Inherit CFN variables if not set (optional fallback)
const CFN_ENV_PATH = path.join(process.cwd(), '..', 'claude-flow-novice', '.env');
if (fs.existsSync(CFN_ENV_PATH)) {
  dotenv.config({ path: CFN_ENV_PATH, override: false });
}

export const config = {
  // CFN inherited
  cfn: {
    redisHost: process.env.CFN_REDIS_HOST || 'redis',
    redisPort: parseInt(process.env.CFN_REDIS_PORT || '6379'),
    memoryBudget: process.env.CFN_MEMORY_BUDGET || '40g',
    provider: process.env.CFN_DEFAULT_PROVIDER || 'zai',
  },

  // Math specific
  math: {
    precision: parseInt(process.env.MATH_PRECISION || '15'),
    symbolicTimeout: parseInt(process.env.MATH_TIMEOUT_SYMBOLIC || '30000'),
    numericTimeout: parseInt(process.env.MATH_TIMEOUT_NUMERIC || '10000'),
    knowledgePath: process.env.MATH_KNOWLEDGE_PATH || './knowledge-store/math/',
    graphBackend: process.env.MATH_GRAPH_BACKEND || 'd3',
  },

  // Trigger.dev
  trigger: {
    apiUrl: process.env.TRIGGER_API_URL || 'http://localhost:8030',
    mathProjectId: process.env.TRIGGER_MATH_PROJECT_ID,
    secretKey: process.env.TRIGGER_SECRET_KEY,
  },

  // RuVector collections
  ruvector: {
    formulas: process.env.MATH_FORMULAS_COLLECTION || 'math-formulas',
    theorems: process.env.MATH_THEOREMS_COLLECTION || 'math-theorems',
    examples: process.env.MATH_EXAMPLES_COLLECTION || 'math-worked-examples',
  }
};
```

---

## 6. CLAUDE.md for Math Project

```markdown
# Math Intelligence Platform - Operating Guide

## 1. Project Identity
- **Name**: math-intelligence-platform
- **Purpose**: AI-powered mathematical computation, tutoring, and proof assistance
- **Dependency**: claude-flow-novice (CFN) for orchestration

## 2. CFN Integration
- Execute math tasks via CFN loops: `/cfn-loop-cli`, `/cfn-loop-task`
- Spawn math agents using CFN's `cfn-agent-lifecycle` skill
- Use CFN's Redis coordination for task queuing
- Hooks inherited from CFN (pre-edit backup, post-edit validation)

## 3. Math-Specific Agents
| Agent | Purpose |
|-------|---------|
| `algebra-specialist` | Equation solving, factoring, simplification |
| `calculus-specialist` | Derivatives, integrals, series |
| `statistics-specialist` | Distributions, hypothesis testing |
| `linear-algebra-specialist` | Matrices, vectors, transformations |
| `proof-validator` | Theorem validation, proof construction |
| `math-tutor` | Explanations, step-by-step guidance |

## 4. Slash Commands
- `/math solve <equation>` - Solve mathematical problems
- `/math prove <theorem>` - Construct proofs
- `/math visualize <function>` - Graph functions
- `/math explain <concept>` - Tutorial explanations

## 5. Environment
Copy CFN `.env` and add math extensions from `.env.example`.

## 6. Testing
```bash
npm test                    # Unit tests
npm run test:integration    # Integration tests
npm run test:math          # Math-specific validation
```

## 7. Key Paths
- Math agents: `.claude/agents/math-team/`
- Math skills: `.claude/skills/math-*/`
- Math commands: `.claude/commands/math/`
- Knowledge store: `./knowledge-store/math/`
```

---

## 7. Implementation Steps

### Phase 1: Project Initialization (Week 1)

```bash
# 1. Create project directory
mkdir -p /mnt/c/Users/masha/Documents/math-intelligence-platform
cd /mnt/c/Users/masha/Documents/math-intelligence-platform

# 2. Initialize npm project
npm init -y

# 3. Create directory structure
mkdir -p .claude/{agents/math-team,skills,commands/math,hooks}
mkdir -p config docker/trigger-dev/src/{trigger,lib}
mkdir -p knowledge-store/math/{formulas,theorems,worked-examples}
mkdir -p src/{engines,validators} tests/{unit,integration,math-specific}
mkdir -p docs

# 4. Copy CFN hooks (symbolic links or copies)
cp -r ../claude-flow-novice/.claude/hooks/cfn-* .claude/hooks/

# 5. Create initial package.json with dependencies
# 6. Create tsconfig.json
# 7. Create .env.example
# 8. Create CLAUDE.md
```

### Phase 2: Agent Development (Week 2)

1. Create `algebra-specialist.md` agent
2. Create `calculus-specialist.md` agent
3. Create `proof-validator.md` agent
4. Create `math-tutor.md` agent
5. Test agents via CFN loop execution

### Phase 3: Skill Development (Week 3)

1. Create `equation-solver` skill
2. Create `symbolic-computation` skill
3. Create `latex-formatter` skill
4. Create `proof-assistant` skill
5. Integration tests with CFN coordination

### Phase 4: Trigger.dev Integration (Week 4)

1. Create new Trigger.dev project via webapp
2. Implement `math-solver` task
3. Implement `math-prover` task
4. Implement `math-visualizer` task
5. Deploy tasks and test orchestration

### Phase 5: RuVector Collections (Week 5)

1. Define math collection schemas
2. Seed formulas collection
3. Seed theorems collection
4. Seed worked-examples collection
5. Test semantic search queries

### Phase 6: Documentation & Testing (Week 6)

1. Complete GETTING_STARTED.md
2. Complete ARCHITECTURE.md
3. Write unit tests for math engines
4. Write integration tests
5. Create example workflows

---

## 8. Migration Checklist

### Before Starting
- [ ] Confirm CFN is stable at version 2.18.1+
- [ ] Trigger.dev v4 infrastructure running
- [ ] RuVector database accessible
- [ ] All API keys configured in CFN .env

### Project Setup
- [ ] Create math-intelligence-platform directory
- [ ] Initialize package.json with CFN devDependency
- [ ] Create directory structure per plan
- [ ] Copy/link CFN hooks
- [ ] Create .env from CFN with math extensions

### Agent Development
- [ ] Create math agent markdown files
- [ ] Test agent spawning via CFN
- [ ] Validate agent outputs

### Skill Development
- [ ] Create math skill directories
- [ ] Implement skill scripts
- [ ] Test skill invocation

### Trigger.dev
- [ ] Create new project in Trigger.dev webapp
- [ ] Implement math tasks
- [ ] Deploy and test via SDK

### RuVector
- [ ] Define collection schemas
- [ ] Create initialization scripts
- [ ] Seed initial data
- [ ] Test semantic queries

### Documentation
- [ ] Complete CLAUDE.md
- [ ] Complete README.md
- [ ] Complete GETTING_STARTED.md
- [ ] Create usage examples

### Validation
- [ ] All tests passing
- [ ] CFN loop execution verified
- [ ] Trigger.dev tasks functional
- [ ] RuVector queries working
- [ ] No CFN modifications required

---

## 9. Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **CFN Relationship** | devDependency | Math uses CFN, doesn't modify it |
| **Trigger.dev** | Separate project ID | Isolation while sharing infrastructure |
| **RuVector** | Shared database, separate collections | Efficiency, no duplication |
| **Env Variables** | Inherit + extend | Reuse all CFN config, add math-specific |
| **Hooks** | Copy/link from CFN | Consistent validation behavior |
| **Agents** | New math-specific | Specialized domain expertise |

---

## 10. Success Criteria

1. **Zero CFN Modifications**: Math project works without changing CFN
2. **Full Loop Support**: Can execute `/cfn-loop-cli "math task"` successfully
3. **Agent Spawning**: Math agents spawn via CFN lifecycle
4. **Trigger.dev Tasks**: Math tasks execute on shared infrastructure
5. **RuVector Queries**: Semantic search across math collections
6. **Environment Reuse**: All CFN env vars work in math project
7. **Clean Separation**: Like SEO, ~0 CFN references after setup

---

## Appendix A: File Templates

### A.1 Agent Template

```markdown
---
name: Algebra Specialist
description: Expert in algebraic equation solving and manipulation
extends: claude-code-expert
tools:
  - equation-solver
  - symbolic-computation
  - latex-formatter
---

# Algebra Specialist

You are an expert algebraist specializing in equation solving,
factoring, simplification, and algebraic manipulation.

## Capabilities
- Solve polynomial equations
- Factor expressions
- Simplify complex fractions
- Work with inequalities
- Handle systems of equations

## Output Format
- Show step-by-step solution
- Use LaTeX for mathematical expressions
- Explain reasoning at each step
```

### A.2 Skill SKILL.md Template

```markdown
# Equation Solver Skill

## Purpose
Solve mathematical equations with step-by-step explanations.

## Usage
```bash
./.claude/skills/equation-solver/solve.sh "x^2 + 5x + 6 = 0"
```

## Inputs
- `equation`: The equation to solve (LaTeX or plain text)
- `domain`: Optional domain constraint (real, complex, integer)
- `format`: Output format (latex, plain, json)

## Outputs
- Solutions with verification
- Step-by-step work
- LaTeX-formatted result
```

---

## Appendix B: Quick Reference

### Start Math Project with CFN Loop

```bash
# From math project directory
cd /mnt/c/Users/masha/Documents/math-intelligence-platform

# Execute via CFN (CFN is in parent directory or globally installed)
npx cfn-loop "Solve the equation x^2 - 4 = 0" --mode=standard --provider=zai
```

### Trigger Math Task Programmatically

```typescript
import { tasks } from "@trigger.dev/sdk/v3";

const result = await tasks.trigger("math-solver", {
  problem: "∫ x² dx from 0 to 1",
  domain: "calculus",
  outputFormat: "latex",
  showSteps: true
});
```

### Query Math Knowledge

```typescript
import { ruvector } from './lib/ruvector-init';

const formulas = await ruvector.query('math-formulas', {
  vector: embed("integration by parts"),
  topK: 5
});
```

---

**Next Steps**:
1. Review this plan
2. Confirm project name and location
3. Decide which math domains to prioritize
4. Begin Phase 1 implementation
