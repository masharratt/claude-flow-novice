---
name: cfn-epic-creator-v2
description: "Hybrid AISP epic creation: formal API contracts plus natural language content. Use when epic needs AISP (AI Symbolic Protocol) type definitions and agent binding contracts alongside human-readable descriptions."
version: 2.0.0
tags: [epic, creator, aisp, contracts, types, hybrid]
status: production
---

# CFN Epic Creator v2 (AISP Hybrid)

> Supersedes **cfn-epic-creator** (v1, deprecated). For full tiered planning with the verifiable-done + haiku-executable gates, **cfn-megaplan** is the canonical entry point; use cfn-epic-creator-v2 directly when you specifically need AISP formal contracts in an epic doc. Output feeds cfn-epic-parser.

## Overview

Epic Creator v2 integrates AISP (AI Symbolic Protocol) for **formal API contracts** while keeping **natural language for user-facing content**. This hybrid approach:

- Eliminates type drift between backend/frontend agents (97x improvement in multi-agent pipelines)
- Preserves human readability for user approval checkpoints
- Adds formal binding contracts for agent handoffs

## What Changed from v1

| Aspect | v1 | v2 |
|--------|----|----|
| API types | Prose in JSON (`"type: string"`) | AISP formal types (`Type≜⟨A\|B\|C⟩`) |
| Agent handoffs | Implicit | Explicit AISP binding contracts |
| Database schema | SQL comments | AISP formal constraints |
| Error handling | Scattered strings | AISP typed errors |
| UI flows | Prose descriptions | AISP state machines |
| Acceptance criteria | Prose | AISP predicates (testable) |
| Feature flags | Ad-hoc | AISP with dependency rules |
| Migrations | File naming | AISP dependency graph |
| Descriptions | Natural language | Natural language (unchanged) |
| User stories | Natural language | Natural language (unchanged) |
| Risks | Natural language | Natural language (unchanged) |
| Validation | JSON schema | AISP `Ambig(D)<0.02` invariant |

## Natural Language vs AISP

| Use AISP | Keep Natural Language |
|----------|----------------------|
| API types & contracts | Epic title & description |
| Database schemas | User stories |
| Error definitions | Risk descriptions |
| State machines | Architecture prose |
| Acceptance predicates | Mitigation strategies |
| Feature flags | Persona recommendations |
| Migration ordering | Implementation notes |
| Agent bindings | UI copy & microcopy |

## AISP Integration Points

### 1. Technical Requirements Types (MANDATORY)

The `technicalRequirements.contracts` section uses AISP format:

```aisp
⟦Σ:Types⟧{
  ;; Enums with explicit variants
  FamilyType≜⟨Core|Extended|Chosen⟩
  Privacy≜⟨public|private⟩
  MemberRole≜⟨owner|member|editor⟩

  ;; Constrained primitives
  UUID≜𝕊:len(36)
  InviteCode≜𝕊:len(6)∧uppercase
  FamilyName≜𝕊:len(n)∧3≤n≤50

  ;; Request/Response pairs
  CreateFamilyRequest≜⟨
    name:FamilyName,
    type:FamilyType,
    privacy:Privacy
  ⟩

  CreateFamilyResponse≜⟨
    id:UUID,
    name:FamilyName,
    type:FamilyType,      ;; Same enum - no string drift
    privacy:Privacy,
    inviteCode:InviteCode,
    createdAt:ISO8601
  ⟩
}

⟦Γ:Rules⟧{
  ;; Validation constraints
  ∀req:CreateFamilyRequest:
    len(req.name)≥3∧len(req.name)≤50

  ;; Response guarantees
  ∀res:CreateFamilyResponse:
    res.type∈FamilyType∧res.privacy∈Privacy
}

⟦Λ:Funcs⟧{
  createFamily:CreateFamilyRequest→CreateFamilyResponse
  POST /api/family
  auth:JWT

  getMyFamilies:Unit→List⟨FamilyWithCount⟩
  GET /api/family/my-families
  auth:JWT
}
```

### 2. Agent Binding Contracts (NEW)

Each persona handoff has formal pre/post conditions:

```aisp
⟦Γ:Binding⟧{
  ;; Architect → Backend handoff
  Δ⊗λ(Architect,Backend)≜case[
    Post(Architect.interfaces)⊆Pre(Backend.implementation) → 3,  ;; zero-cost
    Type(Architect.types)≠Type(Backend.types) → 2,               ;; adapt needed
    _ → 1                                                         ;; null - fail
  ]

  ;; Backend → Frontend handoff
  Δ⊗λ(Backend,Frontend)≜case[
    Post(Backend.api)⊆Pre(Frontend.calls) → 3,
    _ → 2  ;; Frontend must adapt to backend contract
  ]

  ;; Invariant: exactly one binding state
  ∀A,B:|{Δ⊗λ(A,B)}|≡1
}
```

### 3. Database Schema Contracts (HIGH VALUE)

Formal schema definitions eliminate interpretation variance:

```aisp
⟦Σ:Tables⟧{
  families≜⟨
    id:UUID:primary_key:default(gen_random_uuid()),
    name:VARCHAR(100):not_null:check(len(name)≥3),
    type:family_type_enum:not_null:default('core'),
    invite_code:VARCHAR(6):unique:not_null,
    created_by:UUID:not_null:references(auth.users.id)
  ⟩
}

⟦Γ:RLS⟧{
  policy_families_select≜
    ∀user,f:families:
      canSelect(user,f)⇔
        ∃m:family_members:m.family_id≡f.id∧m.user_id≡user.id
}
```

**Template:** `templates/database-schema.aisp`

### 4. Error Handling Contracts (HIGH VALUE)

Type-safe errors with consistent messaging:

```aisp
⟦Σ:Errors⟧{
  FAMILY_NOT_FOUND≜⟨
    code:1001,
    status:404,
    technical:"Family with ID {id} not found",
    user_friendly:"We couldn't find that family.",
    senior_friendly:"The family you're looking for doesn't exist. Try checking your family list.",
    retryable:false
  ⟩
}

⟦Γ:Precedence⟧{
  priority:[AUTHENTICATION,AUTHORIZATION,NOT_FOUND,VALIDATION,SERVER]
}
```

**Template:** `templates/error-handling.aisp`

### 5. State Machine / UI Flows (HIGH VALUE)

Formal navigation flows with guards and actions:

```aisp
⟦Γ:Transitions⟧{
  Dashboard→FamilyCreate:onClick("Create Family")
  FamilyCreate→FamilyShowInvite:onSuccess(createFamily)
  FamilyCreate→FamilyCreate:onError(validation)

  ;; Auth-triggered transitions
  ∀s:ViewState:s→Login:onAuthExpired
}

⟦Γ:Guards⟧{
  canEnter(FamilySettings)⇔
    AuthState≡authenticated∧
    ∃m:family_members:m.user_id≡currentUser.id∧m.role≡'owner'
}
```

**Template:** `templates/state-machine.aisp`

### 6. Acceptance Criteria as Predicates (HIGH VALUE)

Testable acceptance criteria with auto-generated tests:

```aisp
⟦Σ:Criteria⟧{
  AC_FAMILY_001≜⟨
    feature:FamilyCreate,
    scenario:"User creates family with valid name",
    given:⟨AuthState≡authenticated, FamilyName.valid⟩,
    when:submit(CreateFamilyRequest),
    then:⟨
      ∃f:families:f.name≡input.name,
      ∃m:family_members:m.user_id≡user.id∧m.role≡'owner',
      response.status≡201
    ⟩
  ⟩
}

⟦Λ:TestGen⟧{
  toVitest(AC_FAMILY_001)≜"
    test('creates family with valid name', async () => {
      await createFamily({ name: 'Test Family' });
      expect(response.status).toBe(201);
    })
  "
}
```

**Template:** `templates/acceptance-criteria.aisp`

### 7. Feature Flags / Configuration (MEDIUM VALUE)

Typed flags with dependency validation:

```aisp
⟦Σ:Flags⟧{
  flag_family_invites≜⟨
    key:"ENABLE_FAMILY_INVITES",
    type:boolean,
    environments:{
      development → enabled:true,
      production → percentage:25
    },
    dependencies:["ENABLE_FAMILY_CREATION"]
  ⟩
}

⟦Γ:Rules⟧{
  ;; Dependencies must be enabled first
  ∀f:FeatureFlag:
    enabled(f)⇔∀d∈f.dependencies:enabled(d)

  ;; Rollout progression
  isEnabled(f,production)⇒isEnabled(f,staging)
}
```

**Template:** `templates/config-feature-flags.aisp`

### 8. Migration Ordering (MEDIUM VALUE)

Dependency-ordered migrations with rollback chains:

```aisp
⟦Σ:Migrations⟧{
  m_002_families≜⟨
    id:"20240115_002_create_families",
    category:schema,
    dependencies:["20240115_001_create_enums"],
    rollback:auto,
    breaking:false
  ⟩
}

⟦Γ:Rules⟧{
  ;; All dependencies must complete first
  ∀m:Migration:
    canExecute(m)⇔∀d∈m.dependencies:state(d)≡completed

  ;; Rollback in reverse order
  canRollback(m)⇔∀d:Migration:
    m∈d.dependencies⇒state(d)∈{pending,rolledback}
}
```

**Template:** `templates/migration-ordering.aisp`

### 9. Evidence Block (REQUIRED)

Every epic must include validation evidence:

```aisp
⟦Ε⟧⟨
  δ≜0.78              ;; Density score (≥0.75 for ◊⁺⁺)
  φ≜96                ;; Completeness %
  τ≜◊⁺⁺               ;; Quality tier
  ⊢Ambig(D)<0.02      ;; Ambiguity invariant
  ⊢Binding:all_zero   ;; All handoffs are zero-cost
⟩
```

## Output Structure (v2)

```json
{
  "epic": {
    "id": "EPIC-XXXXXX",
    "title": "Natural language title",
    "description": "Natural language description for user review",
    "status": "in-review",
    "contracts": {
      "aisp_version": "5.1",
      "types": "⟦Σ:Types⟧{...}",
      "rules": "⟦Γ:Rules⟧{...}",
      "functions": "⟦Λ:Funcs⟧{...}",
      "evidence": "⟦Ε⟧⟨...⟩"
    },
    "bindings": {
      "architect_to_backend": { "state": 3, "symbol": "⊤" },
      "backend_to_frontend": { "state": 3, "symbol": "⊤" },
      "frontend_to_tester": { "state": 3, "symbol": "⊤" }
    },
    "personas": [
      {
        "name": "architect",
        "reviewOrder": 3,
        "outputs": {
          "natural": "System uses modular architecture with...",
          "aisp": "⟦Σ:Types⟧{Module≜⟨Auth|Family|Stories⟩...}"
        }
      }
    ],
    "userStories": [
      "As a senior, I want to create a family so I can invite relatives"
    ],
    "riskAssessment": {
      "technical": [{"risk": "Natural language description", "mitigation": "Natural language"}]
    }
  }
}
```

## Persona Review Order (v2)

| Order | Agent | Outputs Natural | Outputs AISP |
|-------|-------|-----------------|--------------|
| 1 | `simplifier` | Scope recommendations | - |
| 2 | `product-owner` | User stories, acceptance | - |
| 3 | `system-architect` | Architecture description | **Types, Interfaces** |
| 4 | `security-specialist` | Threat model | **Safety constraints** |
| 5 | `backend-developer` | Implementation notes | **API contracts** |
| 6 | `react-frontend-engineer` | UI components | **Consumes backend AISP** |
| 7 | `devops-engineer` | Infrastructure | - |
| 8 | `tester` | Test strategy | **Test predicates** |
| 9 | `code-standards-reviewer` | Naming conventions | **Type alignment check** |
| 10 | `strategic-alignment-reviewer` | Integration gaps | **Binding validation** |
| 11 | `simplifier` | Final review | - |

## AISP Symbol Quick Reference

| Symbol | Meaning | Example |
|--------|---------|---------|
| `≜` | Definition | `Type≜⟨A\|B⟩` |
| `⟨⟩` | Tuple/Record | `⟨name:𝕊,age:ℕ⟩` |
| `→` | Function type | `f:A→B` |
| `∀` | For all | `∀x:P(x)` |
| `∧` | Logical AND | `a∧b` |
| `∈` | Element of | `x∈Set` |
| `⊆` | Subset | `Post(A)⊆Pre(B)` |
| `𝕊` | String type | `name:𝕊` |
| `ℕ` | Natural number | `count:ℕ` |
| `⊤` | Zero-cost bind | `Δ⊗λ=3` |
| `⊥` | Crash bind | `Δ⊗λ=0` |
| `◊⁺⁺` | Platinum tier | `δ≥0.75` |

## Binding States

| State | Code | Symbol | Meaning |
|-------|:----:|:------:|---------|
| Zero-cost | 3 | `⊤` | Perfect compatibility |
| Adapt | 2 | `λ` | Type mismatch, adaptation possible |
| Null | 1 | `∅` | Socket mismatch, connection fails |
| Crash | 0 | `⊥` | Logical contradiction |

## Main Chat Execution (v2)

### Step 1: Create Base Epic with AISP Scaffold

```json
{
  "epic_id": "unique-id",
  "description": "Natural language epic description",
  "contracts": {
    "aisp_version": "5.1",
    "types": "",
    "rules": "",
    "functions": "",
    "evidence": ""
  },
  "bindings": {},
  "personas": []
}
```

### Step 2: Architect Persona Adds AISP Types

The Architect is the first persona to output AISP. Their task:

```
Read the epic description and existing codebase.

OUTPUT BOTH:
1. Natural language architecture description
2. AISP contracts block:

⟦Σ:Types⟧{
  ;; Define all domain types with explicit variants
  ;; Use enums instead of strings where values are constrained
  ;; Define request/response pairs for each API
}

⟦Γ:Rules⟧{
  ;; Add validation constraints
  ;; Add invariants that must hold
}

⟦Λ:Funcs⟧{
  ;; Define API signatures: Method Path
  ;; Include auth requirements
}

Write AISP to epic.contracts.types, .rules, .functions
```

### Step 3: Backend Consumes Architect AISP

Backend developer reads the AISP contracts and implements:

```
Read epic.contracts (AISP types and functions).

Your implementation MUST:
1. Use exact types from ⟦Σ:Types⟧
2. Implement functions from ⟦Λ:Funcs⟧
3. Enforce rules from ⟦Γ:Rules⟧

Add your implementation details (natural language).
Validate binding: Δ⊗λ(Architect,Backend) should be 3 (⊤).
```

### Step 4: Frontend Consumes Backend AISP

Frontend reads the same AISP contracts:

```
Read epic.contracts (AISP types and functions).

Your implementation MUST:
1. Use exact types from ⟦Σ:Types⟧ for API calls
2. Call functions defined in ⟦Λ:Funcs⟧
3. Handle errors per AISP contract

Binding state Δ⊗λ(Backend,Frontend) should be 3 (⊤).
```

### Step 5: Validate All Bindings

Strategic Alignment Reviewer validates:

```
Check all binding states in epic.bindings:

∀(A,B)∈Handoffs: Δ⊗λ(A,B)≥2

If any binding is 0 (crash) or 1 (null):
- Flag as blocking issue
- Identify type mismatches
- Recommend fixes
```

### Step 6: Add Evidence Block

Final step before completion:

```aisp
⟦Ε⟧⟨
  δ≜<calculated_density>
  φ≜<completeness_percent>
  τ≜<quality_tier>
  ⊢Ambig(D)<0.02
  ⊢Binding:⟨arch_back:3,back_front:3,front_test:3⟩
⟩
```

## Benefits Over v1

| Metric | v1 (Prose) | v2 (AISP Hybrid) |
|--------|:----------:|:----------------:|
| API type drift | Common | Eliminated |
| Agent interpretation variance | 40-65% | <2% |
| 10-agent pipeline success | ~1% | ~82% |
| Backend/Frontend mismatch | Frequent | Detected at bind |
| Human readability | Good | Good (unchanged) |

## Files

| File | Purpose |
|------|---------|
| `SKILL.md` | This documentation |
| `reference/aisp-spec.md` | Full AISP 5.1 specification |
| `reference/aisp-reference.md` | Symbol reference and examples |
| `templates/api-contract.aisp` | Template for API contracts |
| `templates/binding-contract.aisp` | Template for agent bindings |
| `templates/database-schema.aisp` | Database tables, RLS, indexes |
| `templates/error-handling.aisp` | Typed errors with multilingual messages |
| `templates/state-machine.aisp` | UI states, transitions, guards |
| `templates/acceptance-criteria.aisp` | Testable criteria with auto-gen tests |
| `templates/config-feature-flags.aisp` | Feature flags, rollout rules |
| `templates/migration-ordering.aisp` | Migration dependencies, rollback chains |
| `lib/validate-aisp.sh` | AISP validation helper |

## When to Use v2

Use Epic Creator v2 when:
- Epic has API contracts between backend/frontend
- Multiple agents will implement from the same spec
- Type consistency is critical (TypeScript, Rust)
- You want compile-time detection of integration issues

Stick with v1 when:
- Simple single-domain epic
- No API boundaries
- Quick prototype without formal contracts
