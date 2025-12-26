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

### Basic Epic Creation

```bash
# Create epic with default settings
./.claude/skills/cfn-epic-creator/invoke.sh "Build a customer-facing analytics dashboard"

# Create epic with specific output file
./.claude/skills/cfn-epic-creator/invoke.sh "Develop mobile banking app" \
    --output=banking-epic.json

# Create epic in enterprise mode
./.claude/skills/cfn-epic-creator/invoke.sh "Implement AI-powered fraud detection" \
    --mode=enterprise
```

### Advanced Usage

```bash
# Enterprise mode with DevOps enforcement
./invoke.sh "Global supply chain management system" \
    --mode=enterprise \
    --enforce-devops \
    --output=supply-chain-epic.json \
    --verbose

# MVP mode for rapid prototyping
./invoke.sh "Simple proof-of-concept for AR furniture placement" \
    --mode=mvp

# Validate without creating file
./invoke.sh "Complex multi-region deployment strategy" \
    --validate-only \
    --verbose
```

### Command Line Options

- `<epic-description>`: Detailed description of the epic to be analyzed (required)
- `-m, --mode <mode>`: Review thoroughness level
  - `mvp`: Basic reviews, focus on critical items only (~60% fewer recommendations)
  - `standard`: Full comprehensive reviews (default)
  - `enterprise`: Deep dive with compliance and governance focus
- `-e, --enforce-devops`: Make DevOps recommendations blocking instead of suggested
- `-o, --output <path>`: Output JSON file path (default: auto-generated with timestamp)
- `-v, --verbose`: Enable verbose logging
- `--validate-only`: Validate generated epic JSON without creating file
- `-h, --help`: Show help message

## Supporting Scripts

### validate-epic.sh

Validates generated epic JSON structure and content.

```bash
# Basic validation
./validate-epic.sh epic.json

# Verbose validation with details
./validate-epic.sh epic.json --verbose

# Strict validation (treat warnings as errors)
./validate-epic.sh epic.json --strict
```

Options:
- `-v, --verbose`: Show detailed validation output
- `-s, --strict`: Enable strict validation (fails on warnings)
- `-h, --help`: Show help message

### parse-personas.sh

Extracts specific persona insights from generated epic JSON.

```bash
# Show all persona insights
./parse-personas.sh epic.json

# Extract specific persona
./parse-personas.sh epic.json --persona=architect

# Filter by recommendation type
./parse-personas.sh epic.json --type=blocking

# Export as markdown
./parse-personas.sh epic.json --format=markdown --output=personas.md

# Show counts only
./parse-personas.sh epic.json --count
```

Options:
- `-p, --persona <name>`: Filter by specific persona
- `-t, --type <type>`: Filter by recommendation type (blocking/suggested)
- `-r, --priority <prio>`: Filter by priority (critical/high/medium/low)
- `-f, --format <fmt>`: Output format (text/json/markdown)
- `-c, --count`: Show only counts per persona
- `-s, --summary`: Show summarized insights only
- `-o, --output <file>`: Write output to file

### estimate-costs.sh

Aggregates cost estimates from all personas in epic JSON.

```bash
# Show cost summary
./estimate-costs.sh epic.json

# Detailed breakdown by persona
./estimate-costs.sh epic.json --format=detailed

# Export as CSV
./estimate-costs.sh epic.json --format=csv --output=costs.csv

# Filter by blocking recommendations only
./estimate-costs.sh epic.json --type=blocking

# Sort by highest cost
./estimate-costs.sh epic.json --sort-by=total
```

Options:
- `-p, --persona <name>`: Show costs for specific persona only
- `-t, --type <type>`: Filter by recommendation type (blocking/suggested)
- `-r, --priority <prio>`: Filter by priority
- `-f, --format <fmt>`: Output format (summary/detailed/csv/json)
- `-c, --currency <curr>`: Currency symbol for display (default: $)
- `-s, --sort-by <field>`: Sort personas by field (total/blocking/suggested/name)
- `-o, --output <file>`: Write output to file

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

```bash
./.claude/skills/cfn-epic-creator/invoke.sh "Your epic description" --output=/tmp/epic.json
```

This creates the base JSON with persona metadata and an empty `reviews: []` array.

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
1. Create base: invoke.sh "Build payment system" --output=/tmp/epic.json
2. Task(product-owner, "Review /tmp/epic.json from business perspective...")
3. Task(system-architect, "Review /tmp/epic.json from architecture perspective...")
4. Task(security-specialist, "Review /tmp/epic.json from security perspective...")
5. Task(tester, "Review /tmp/epic.json from testing perspective...")
6. Task(strategic-alignment-reviewer, "Review /tmp/epic.json for integration gaps...")
7. Task(code-standards-reviewer, "Review /tmp/epic.json for code consistency...")
8. Task(devops-engineer, "Review /tmp/epic.json from operations perspective...")
9. Task(backend-developer, "Review /tmp/epic.json from backend perspective...")
10. Task(react-frontend-engineer, "Review /tmp/epic.json from frontend perspective...")
11. Read /tmp/epic.json - full epic with all reviews
```

## Integration with CFN Loop

The epic creator integrates seamlessly with CFN Loop workflows:

```bash
# Direct integration
./invoke.sh "Implement real-time data processing pipeline" \
  --mode=standard \
  --output=pipeline-epic.json

# Parse and validate in pipeline
./validate-epic.sh pipeline-epic.json
./parse-personas.sh pipeline-epic.json --format=markdown --output=pipeline-personas.md
./estimate-costs.sh pipeline-epic.json --format=csv --output=pipeline-costs.csv
```

## Testing

Run the comprehensive test suite:

```bash
# Run all tests
./test-invoke.sh

# Run specific test
./test-invoke.sh --test generation

# Keep logs for debugging
./test-invoke.sh --keep-logs
```

The test suite validates:
- Help functionality and error handling
- Argument parsing and validation
- Epic generation in all modes
- JSON structure validation
- Persona parsing and filtering
- Cost estimation and formatting
- Integration scenarios
- Error handling edge cases

## Dependencies

- `jq`: Required for JSON processing
  - Ubuntu/Debian: `sudo apt-get install jq`
  - macOS: `brew install jq`
- `bc`: Required for cost calculations (in estimate-costs.sh)
  - Ubuntu/Debian: `sudo apt-get install bc`
  - macOS: Pre-installed

## Exit Codes

- `0`: Success
- `1`: General error
- `2`: Validation error
- `3`: Missing required arguments
- `4`: Invalid mode specified
- `5`: Agent execution failed

## Best Practices

1. **Clear Epic Descriptions**: Provide detailed, specific descriptions including:
   - Business objectives
   - Technical requirements
   - Target users/stakeholders
   - Success criteria
   - Constraints and assumptions

2. **Choose Appropriate Mode**:
   - Use `mvp` for rapid prototyping and early validation
   - Use `standard` for most production projects
   - Use `enterprise` for regulated industries or large-scale systems

3. **DevOps Considerations**:
   - Enable `--enforce-devops` for production systems
   - Review DevOps recommendations carefully for operational impact

4. **Cost Analysis**:
   - Use cost estimates for budget planning
   - Prioritize blocking recommendations
   - Consider total cost of ownership, not just implementation

5. **Follow-up Actions**:
   - Validate generated epics before proceeding
   - Extract persona insights for stakeholder review
   - Use cost breakdowns for financial planning
   - Track implementation against recommendations

## Examples

### E-commerce Platform Epic

```bash
./invoke.sh \
  "Build a scalable e-commerce platform with product catalog, shopping cart, payment processing, order management, and admin dashboard. Must support 100,000 concurrent users, multiple currencies, and real-time inventory updates." \
  --mode=enterprise \
  --enforce-devops \
  --output=ecommerce-epic.json
```

### API Integration Epic

```bash
./invoke.sh \
  "Integrate third-party payment gateways (Stripe, PayPal, Square) with existing order processing system. Include webhook handling, error retry logic, and comprehensive logging." \
  --mode=standard \
  --output=payment-integration-epic.json
```

### Data Migration Epic

```bash
./invoke.sh \
  "Migrate legacy customer database from Oracle to PostgreSQL with zero downtime. Include data validation, rollback procedures, and performance optimization." \
  --mode=enterprise \
  --enforce-devops
```

## Troubleshooting

### Common Issues

1. **Invalid JSON output**
   - Run validate-epic.sh to check structure
   - Check agent logs for errors
   - Ensure epic description is clear and complete

2. **Missing recommendations**
   - Try enterprise mode for comprehensive analysis
   - Check if keywords trigger specific persona insights
   - Review epic description for missing context

3. **Cost estimation shows $0**
   - Check if estimatedCost fields are populated
   - Verify currency format is recognized
   - Run with --verbose to see parsing details

4. **DevOps recommendations not blocking**
   - Use --enforce-devops flag
   - Check DevOps persona status in output
   - Review deployment-related keywords in description

### Debug Mode

Enable verbose logging to debug issues:

```bash
./invoke.sh "Your epic description" \
    --verbose \
    --output=debug-epic.json

# Then validate with details
./validate-epic.sh debug-epic.json --verbose
```
