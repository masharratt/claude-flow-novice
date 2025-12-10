---
name: cfn-epic-creator
description: "Creates comprehensive epic definitions with sequential reviews from 6 key personas. Use when you need to analyze requirements from multiple perspectives and generate structured epic documentation with cost estimates and risk assessments."
version: 1.0.0
tags: [epic, creator, personas, analysis, cost-estimation, requirements]
status: production
---

# CFN Epic Creator

## Overview

The cfn-epic-creator skill provides orchestration for creating comprehensive epic definitions through sequential reviews from six key personas: Product Owner, Architect, Security Specialist, Performance Specialist, Accessibility Advocate, and DevOps Engineer.

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
        "name": "performance-specialist",
        "reviewOrder": 4,
        "...": "..."
      },
      {
        "name": "accessibility-advocate",
        "reviewOrder": 5,
        "...": "..."
      },
      {
        "name": "devops-engineer",
        "reviewOrder": 6,
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

1. **Product Owner** - Business value, user stories, market fit
2. **Architect** - System design, technology choices, scalability
3. **Security Specialist** - Security posture, vulnerabilities, compliance
4. **Performance Specialist** - Performance metrics, optimization, monitoring
5. **Accessibility Advocate** - WCAG compliance, inclusive design
6. **DevOps Engineer** - Deployment, operations, infrastructure

## Integration with CFN Loop

The epic creator integrates seamlessly with CFN Loop workflows:

```bash
# Using with CFN Loop
/cfn-loop-task "Analyze epic for user authentication system" \
  --agent epic-creator-v2 \
  --context epic-description="Implement OAuth 2.0 with social login providers" \
  --context mode=enterprise

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
