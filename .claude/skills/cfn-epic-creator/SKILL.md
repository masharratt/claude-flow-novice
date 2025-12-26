---
name: cfn-epic-creator
description: "Creates comprehensive epic definitions with sequential reviews from 10 key personas. Use when you need to analyze requirements from multiple perspectives and generate structured epic documentation with cost estimates and risk assessments."
version: 1.0.0
tags: [epic, creator, personas, analysis, cost-estimation, requirements]
status: production
---

# CFN Epic Creator

## Overview

The cfn-epic-creator skill provides orchestration for creating comprehensive epic definitions through sequential reviews from ten key personas: Product Manager, Architect, Security Specialist, Test Specialist, Strategic Alignment Reviewer, Code Standards Reviewer, DevOps Engineer, Backend Developer, Frontend Developer, and Simplifier.

## Usage

The epic creator is a **main chat workflow** - not a standalone script. Main chat:
1. Creates base JSON
2. Spawns 10 persona agents sequentially
3. Each persona edits the epic file directly
4. Simplifier runs last and returns recommendations (no edits)
5. User approves which simplifications to apply

See **Main Chat Execution Process** below for details.

## Output Structure

The generated JSON follows this structure:

```json
{
  "epic": {
    "id": "EPIC-XXXXXX",
    "title": "Extracted from description",
    "description": "Full epic description",
    "status": "in-review",
    "priority": "high",
    "estimatedDuration": "TBD",
    "budget": "TBD",
    "owner": "TBD",
    "metadata": {
      "createdAt": "2024-01-01T00:00:00.000Z",
      "reviewMode": "standard|enterprise|mvp",
      "devopsEnforced": true|false
    },
    "personas": [
      {
        "name": "product-owner",
        "reviewOrder": 1,
        "status": "completed",
        "insights": [
          "Strategic insight 1",
          "Strategic insight 2"
        ],
        "recommendations": [
          {
            "id": "PO-001",
            "title": "Recommendation title",
            "type": "blocking|suggested",
            "priority": "critical|high|medium|low",
            "estimatedCost": "$X,XXX",
            "description": "Detailed description"
          }
        ],
        "costAnalysis": {
          "category1": "$X,XXX",
          "category2": "$X,XXX"
        }
      },
      {
        "name": "architect",
        "reviewOrder": 2,
        "...": "..."
      },
      {
        "name": "security-specialist",
        "reviewOrder": 3,
        "...": "..."
      },
      {
        "name": "test-specialist",
        "reviewOrder": 4,
        "...": "..."
      },
      {
        "name": "strategic-alignment-reviewer",
        "reviewOrder": 5,
        "...": "..."
      },
      {
        "name": "code-standards-reviewer",
        "reviewOrder": 6,
        "...": "..."
      },
      {
        "name": "devops-engineer",
        "reviewOrder": 7,
        "...": "..."
      },
      {
        "name": "backend-developer",
        "reviewOrder": 8,
        "...": "..."
      },
      {
        "name": "frontend-developer",
        "reviewOrder": 9,
        "...": "..."
      }
    ],
    "implementationRoadmap": [],
    "totalCostBreakdown": {},
    "riskAssessment": {}
  }
}
```

## Persona Review Order

1. **Product Manager** - Business value, user stories, market fit
2. **Architect** - System design, technology choices, scalability
3. **Security Specialist** - Security posture, vulnerabilities, compliance
4. **Test Specialist** - Production readiness, test coverage, quality gates, integration verification
5. **Strategic Alignment Reviewer** - High-level coherence, plan consistency, integration completeness, dead code detection
6. **Code Standards Reviewer** - Type alignment, naming conventions, API contract consistency
7. **DevOps Engineer** - Deployment, operations, infrastructure
8. **Backend Developer** - API design, data structures, business logic
9. **Frontend Developer** - User interface, experience, client-side logic
10. **Simplifier** - Complexity reduction, scope minimization, over-engineering prevention

## Main Chat Execution Process

The epic creator uses a sequential persona review process. Main chat spawns each persona agent one at a time, and each agent edits the epic file directly.

### Step 1: Create Base Epic JSON

Main chat creates the base JSON directly:

```json
{
  "epic_id": "unique-id",
  "description": "Your epic description",
  "mode": "standard",
  "created_at": "2025-01-01T00:00:00Z",
  "personas": [
    {"name": "Product Manager", "focus": "business value, user stories"},
    {"name": "Architect", "focus": "system design, scalability"},
    {"name": "Security Specialist", "focus": "threats, compliance"},
    {"name": "Test Specialist", "focus": "test strategy, coverage"},
    {"name": "Strategic Alignment Reviewer", "focus": "integration gaps, dead code"},
    {"name": "Code Standards Reviewer", "focus": "types, naming, contracts"},
    {"name": "DevOps Engineer", "focus": "deployment, monitoring"},
    {"name": "Backend Developer", "focus": "APIs, data models"},
    {"name": "Frontend Developer", "focus": "UI/UX, components"},
    {"name": "Simplifier", "focus": "complexity reduction"}
  ],
  "reviews": [],
  "userStories": [],
  "technicalRequirements": {},
  "implementationRoadmap": [],
  "riskAssessment": {}
}
```

Write this to a file (e.g., `docs/epics/my-epic.json`).

### Step 2: Spawn Personas Sequentially

For each persona, spawn a Task agent that reads the epic, analyzes it, and adds their review:

| Order | Agent | Focus |
|-------|-------|-------|
| 1 | `product-owner` | Business value, user stories, market fit |
| 2 | `system-architect` | System design, scalability, technical constraints |
| 3 | `security-specialist` | Threats, vulnerabilities, compliance |
| 4 | `tester` | Test strategy, coverage, production readiness |
| 5 | `strategic-alignment-reviewer` | Integration gaps, dead code, misalignments |
| 6 | `code-standards-reviewer` | Types, naming, API contracts |
| 7 | `devops-engineer` | Deployment, monitoring, infrastructure |
| 8 | `backend-developer` | API design, data models, services |
| 9 | `react-frontend-engineer` | UI/UX, client architecture |
| 10 | `simplifier` | Complexity reduction, scope minimization (REVIEW ONLY - does not edit epic) |

### Step 3: Persona Task Template

Each persona agent receives this task - they both review AND contribute to the epic:

```
Read /tmp/epic.json and analyze the epic description from your perspective.

YOUR JOB: Review the epic AND add your contributions to it.

1. ADD YOUR REVIEW to the reviews array:
{
  "persona": "<your-name>",
  "reviewOrder": <number>,
  "status": "completed",
  "insights": ["insight 1", "insight 2", ...],
  "recommendations": [
    {
      "id": "<PERSONA>-001",
      "title": "recommendation title",
      "type": "blocking|suggested",
      "priority": "critical|high|medium|low",
      "description": "details"
    }
  ],
  "risks": ["risk 1", "risk 2"]
}

2. ADD YOUR CONTRIBUTIONS to the epic itself:
   - Product Owner: Add user stories, acceptance criteria, success metrics
   - Architect: Add technical requirements, system components, data models
   - Security: Add security requirements, threat mitigations, compliance needs
   - Tester: Add test cases, quality gates, validation criteria
   - Alignment Reviewer: Flag integration gaps, add missing connections
   - Code Standards: Add naming conventions, type requirements, API contracts
   - DevOps: Add deployment requirements, monitoring needs, infrastructure specs
   - Backend: Add API endpoints, services, database schemas
   - Frontend: Add UI components, user flows, client requirements
   - Simplifier: **REVIEW ONLY** - see Step 5 below

3. UPDATE these epic sections based on your expertise:
   - implementationRoadmap: Add phases/tasks from your domain
   - totalCostBreakdown: Add cost estimates for your area
   - riskAssessment: Add risks you've identified

Write the updated JSON back to /tmp/epic.json
```

### Step 4: Result (After 9 Personas)

After personas 1-9 complete, `/tmp/epic.json` contains the full epic with contributions and reviews.

### Step 5: Simplifier (Final Review - No Edits)

The Simplifier runs LAST and does NOT edit the epic. Instead:

```
Read /tmp/epic.json and analyze for unnecessary complexity.

DO NOT edit the epic. Instead:

1. ADD your review to the reviews array only
2. RETURN your findings to main chat for user review:

{
  "persona": "simplifier",
  "status": "completed",
  "simplifications": [
    {
      "target": "component/feature",
      "issue": "why it's over-engineered",
      "suggestion": "simpler alternative",
      "defer_to_v2": true/false
    }
  ],
  "features_to_remove": ["feature 1", "feature 2"],
  "features_to_defer": ["feature 3", "feature 4"],
  "consolidations": [
    {"merge": ["A", "B"], "into": "single feature"}
  ],
  "complexity_reduction": "estimated % reduction"
}

Write review to /tmp/epic.json reviews array.
Return full findings to main chat - USER DECIDES what to apply.
```

Main chat presents Simplifier's recommendations to the user. User chooses which simplifications to accept, then main chat applies approved changes.

### Example Main Chat Flow

```
1. Create base JSON and write to docs/epics/my-epic.json
2. Task(product-owner, "Review docs/epics/my-epic.json from business perspective...")
3. Task(system-architect, "Review docs/epics/my-epic.json from architecture perspective...")
4. Task(security-specialist, "Review docs/epics/my-epic.json from security perspective...")
5. Task(tester, "Review docs/epics/my-epic.json from testing perspective...")
6. Task(strategic-alignment-reviewer, "Review docs/epics/my-epic.json for integration gaps...")
7. Task(code-standards-reviewer, "Review docs/epics/my-epic.json for code consistency...")
8. Task(devops-engineer, "Review docs/epics/my-epic.json from operations perspective...")
9. Task(backend-developer, "Review docs/epics/my-epic.json from backend perspective...")
10. Task(react-frontend-engineer, "Review docs/epics/my-epic.json from frontend perspective...")
11. Task(simplifier, "Review docs/epics/my-epic.json for complexity...") → returns recommendations
12. Present simplifier recommendations to user
13. Apply approved simplifications
```

## Best Practices

1. **Clear Epic Descriptions**: Provide detailed, specific descriptions including:
   - Business objectives
   - Technical requirements
   - Target users/stakeholders
   - Success criteria
   - Constraints and assumptions

2. **Review Simplifier Recommendations**: The Simplifier runs last and identifies:
   - Features to remove (not needed for v1)
   - Features to defer to v2
   - Consolidation opportunities
   - Simpler alternatives
   - AI/LLM opportunities

3. **Iterate Based on Feedback**: After reviewing, you can:
   - Accept all simplifications
   - Accept some, reject others
   - Ask personas to revise based on new constraints
