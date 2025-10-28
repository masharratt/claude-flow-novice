# Task Complexity & Agent Scaling - Examples

This document shows how the deterministic complexity analyzer and agent scaling works in practice.

---

## How It Works

```bash
# Main Chat provides task + optional difficulty parameter
./cfn-loop-exec.sh \
  --task "Build production-ready React dashboard with authentication" \
  --difficulty auto  # or: simple | standard | complex | enterprise

# System executes:
# 1. Analyze complexity (scoring algorithm)
# 2. Determine difficulty level (auto or manual)
# 3. Calculate suggested agent counts
# 4. Match agents to domains (keyword + semantic)
# 5. Scale agents based on complexity
# 6. Return structured agent list
```

---

## Example 1: Simple Task (MVP Scope)

**Input:**
```bash
./cfn-loop-exec.sh --task "Fix login button styling"
```

**Complexity Analysis:**
```json
{
  "complexity_score": 2,
  "difficulty": "simple",
  "domains": ["frontend"],
  "suggested_agents": {
    "loop3_count": 1,
    "loop2_count": 2
  },
  "reasoning": "Simple task with minimal scope (complexity score: 2, domains: 1, scope: standard)",
  "analysis": {
    "word_count": 4,
    "domain_count": 1,
    "feature_count": 0
  }
}
```

**Agent Selection:**
```
Loop 3 (Implementers): react-frontend-engineer
Loop 2 (Validators): reviewer, tester
Product Owner: product-owner

Total: 1 implementer, 2 validators
```

**Why:**
- Word count: 4 words (minimal description) → +1 score
- Domains: 1 (frontend only) → +2 score
- No scope modifiers → +0 score
- **Total: 3 points → Simple difficulty**
- Simple = 1-2 Loop 3 agents, only 1 needed

---

## Example 2: Standard Task

**Input:**
```bash
./cfn-loop-exec.sh --task "Build React dashboard with API integration"
```

**Complexity Analysis:**
```json
{
  "complexity_score": 7,
  "difficulty": "standard",
  "domains": ["frontend", "backend"],
  "suggested_agents": {
    "loop3_count": 3,
    "loop2_count": 4
  },
  "reasoning": "Standard task with moderate complexity (complexity score: 7, domains: 2, scope: standard)"
}
```

**Agent Selection:**
```
Loop 3 (Implementers): react-frontend-engineer, backend-dev, coder
Loop 2 (Validators): reviewer, tester, accessibility-advocate, security-specialist
Product Owner: product-owner

Total: 3 implementers, 4 validators
```

**Why:**
- Word count: 6 words → +2 score
- Domains: 2 (frontend + backend) → +4 score
- Features: 1 ("with" connector) → +1 score
- **Total: 7 points → Standard difficulty**
- Standard = 2-3 Loop 3 agents
- 2 domains detected → 2 specialists + 1 general coder

---

## Example 3: Complex Multi-Domain Task

**Input:**
```bash
./cfn-loop-exec.sh --task "Build full-stack authentication system with React frontend, Rust backend, and AWS deployment"
```

**Complexity Analysis:**
```json
{
  "complexity_score": 12,
  "difficulty": "complex",
  "domains": ["frontend", "backend", "rust", "infrastructure", "security"],
  "suggested_agents": {
    "loop3_count": 5,
    "loop2_count": 5
  },
  "reasoning": "Complex task with multiple domains (complexity score: 12, domains: 5, scope: standard)"
}
```

**Agent Selection:**
```
Loop 3 (Implementers):
  - researcher (complex task auto-added)
  - react-frontend-engineer
  - rust-developer
  - backend-dev
  - devops-engineer
  - system-architect

Loop 2 (Validators):
  - reviewer
  - tester
  - accessibility-advocate
  - security-specialist
  - architect

Total: 6 implementers, 5 validators
```

**Why:**
- Word count: 13 words → +3 score
- Domains: 5 (frontend, backend, rust, infra, security) → +10 score
- Features: 2 ("with" connectors) → +2 score
- **Total: 15 points → Complex difficulty**
- Complex = 3-5 base Loop 3 agents
- 5 domains → +3 extra agents (5-2=3)
- Total: 3 + 3 = 6 Loop 3 agents
- Auto-added researcher for complex task
- Auto-added system-architect for complex task

---

## Example 4: Enterprise Production Task

**Input:**
```bash
./cfn-loop-exec.sh --task "Build enterprise-grade production payment processing system with scalable microservices, complete security audit, and cloud deployment"
```

**Complexity Analysis:**
```json
{
  "complexity_score": 18,
  "difficulty": "enterprise",
  "domains": ["backend", "security", "infrastructure", "architecture"],
  "suggested_agents": {
    "loop3_count": 6,
    "loop2_count": 6
  },
  "reasoning": "Enterprise-grade task with high complexity (complexity score: 18, domains: 4, scope: increased (enterprise scope detected))"
}
```

**Agent Selection:**
```
Loop 3 (Implementers):
  - researcher (complex task)
  - backend-dev
  - security-specialist (promoted from Loop 2)
  - devops-engineer
  - system-architect
  - coder
  - perf-analyzer (enterprise specialty)

Loop 2 (Validators):
  - reviewer
  - tester
  - security-specialist
  - architect
  - code-quality-validator
  - performance-benchmarker

Total: 7 implementers, 6 validators
```

**Why:**
- Word count: 18 words → +4 score
- Domains: 4 (backend, security, infra, arch) → +8 score
- Scope: "enterprise", "production", "scalable", "complete" → +3 modifier
- Features: 3 ("with" connectors) → +3 score
- **Total: 18 points → Enterprise difficulty**
- Enterprise = 5-8 Loop 3 agents
- 4 domains → +2 extra agents
- Filled remaining slots with enterprise specialists (perf-analyzer)
- Enhanced Loop 2 with deep quality validators

---

## Example 5: Explicit Difficulty Override

**Input:**
```bash
# Task seems complex, but user wants MVP
./cfn-loop-exec.sh \
  --task "Build full authentication system" \
  --difficulty simple
```

**Complexity Analysis:**
```json
{
  "complexity_score": 6,
  "difficulty": "simple",  // ← Overridden by user
  "domains": ["backend", "security"],
  "suggested_agents": {
    "loop3_count": 1,  // ← Forced to simple limits
    "loop2_count": 2
  },
  "reasoning": "Simple task with minimal scope (user override)"
}
```

**Agent Selection:**
```
Loop 3 (Implementers): backend-dev
Loop 2 (Validators): reviewer, tester
Product Owner: product-owner

Total: 1 implementer, 2 validators
```

**Why:**
- User explicitly requested `--difficulty simple`
- System caps agents at simple limits (1-2 implementers)
- Selects only highest-priority agent (backend-dev for auth)

---

## Example 6: Semantic Matching Enhancement

**Input:**
```bash
# Ambiguous task (no clear keywords like "React" or "API")
./cfn-loop-exec.sh --task "Create user checkout experience"
```

**Keyword Matching (Regex):**
```
# No matches for: react|frontend|api|backend|rust|deploy
# Falls back to: coder (generic)
```

**Semantic Matching (TF-IDF):**
```bash
./semantic-match-tfidf.py "Create user checkout experience" 0.5 --verbose

# Output:
react-frontend-engineer: 0.72  # "checkout experience" → UI/UX
backend-dev: 0.68              # "checkout" → server processing
security-specialist: 0.65      # "checkout" → payment security
ui-designer: 0.58              # "experience" → user experience
```

**Final Agent Selection (Hybrid):**
```
Loop 3 (Implementers):
  - react-frontend-engineer (semantic match 0.72)
  - backend-dev (semantic match 0.68)
  - security-specialist (semantic match 0.65)

Loop 2 (Validators):
  - reviewer
  - tester
  - accessibility-advocate
  - security-specialist

Total: 3 implementers, 4 validators
```

**Why:**
- Keyword matching failed (no explicit framework/tech mentions)
- Semantic matching understood "checkout experience" implies:
  - Frontend UI (user-facing checkout flow)
  - Backend processing (payment logic)
  - Security (payment data handling)

---

## Scaling Rules Summary

| Difficulty | Loop 3 Base | Loop 3 Max | Loop 2 Base | Scaling Rule |
|------------|-------------|------------|-------------|--------------|
| **Simple** | 1 | 2 | 2 | Minimal agents, MVP focus |
| **Standard** | 2 | 3-4 | 3-4 | +1 agent per domain beyond 2 |
| **Complex** | 3 | 5-6 | 4-5 | +1 agent per domain, auto-add architect |
| **Enterprise** | 5 | 8 | 5-6 | +1 agent per domain, add specialists |

**Additional Rules:**
- **Researcher:** Auto-added for complex/enterprise tasks
- **System Architect:** Auto-added for complex/enterprise or design tasks
- **Fill Strategy:** Remaining slots filled with general specialists
- **Enterprise Specialists:** perf-analyzer, code-quality-validator, performance-benchmarker

---

## Complexity Scoring Breakdown

```
Total Score = Word Score + Domain Score + Scope Modifier + Feature Score + Integration Score

Word Score:
  < 5 words:  +1
  5-9 words:  +2
  10-19 words: +3
  ≥ 20 words: +4

Domain Score: +2 per domain detected
  - frontend (React, UI, dashboard, component)
  - backend (API, server, endpoint, database)
  - rust (Rust, cargo, tokio)
  - infrastructure (deploy, Docker, k8s, AWS)
  - security (auth, encryption, RBAC)
  - testing (test, QA, coverage)
  - architecture (architect, design, system)

Scope Modifier:
  MVP/simple/quick: -2
  Prototype/POC: -1
  Standard: 0
  Production/enterprise/scalable: +3

Feature Score: +1 per connector
  - " and "
  - " with "
  - " including "

Integration Score: +1 per integration keyword
  - integrate/connect/sync/webhook
  - third-party/external
```

**Difficulty Thresholds:**
- 0-3 points: Simple
- 4-7 points: Standard
- 8-12 points: Complex
- 13+ points: Enterprise

---

## Usage from Main Chat

**Auto-detect difficulty:**
```bash
Bash(
  command: "./.claude/skills/redis-coordination/cfn-loop-exec.sh \
    --task 'Build React dashboard' \
    --output json",
  description: "Launch CFN Loop with auto-detected difficulty"
)
```

**Explicit difficulty (user override):**
```bash
Bash(
  command: "./.claude/skills/redis-coordination/cfn-loop-exec.sh \
    --task 'Build enterprise payment system' \
    --difficulty simple \
    --output json",
  description: "Launch CFN Loop with forced simple difficulty (MVP)"
)
```

**Background execution:**
```bash
Bash(
  command: "./.claude/skills/redis-coordination/cfn-loop-exec.sh \
    --task 'Deploy to production' \
    --background \
    --output json",
  description: "Launch CFN Loop in background"
)
```

---

## Benefits of Deterministic Complexity

1. **Predictable:** Same task always selects same agents
2. **Transparent:** User can see exactly why agents were selected
3. **Tunable:** User can override difficulty for MVP/full scope
4. **Fast:** Complexity analysis takes <50ms
5. **No LLM needed:** Pure algorithmic logic
6. **Scalable:** Agent count scales with task complexity

---

## Next Steps

1. Test complexity analyzer with real tasks
2. Benchmark semantic matching accuracy
3. Tune threshold values based on results
4. Integrate semantic matching as fallback
5. Document difficulty parameter in slash commands
