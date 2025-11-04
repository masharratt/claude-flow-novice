# Task Type Classifier Skill

**Version:** 1.0.0
**Purpose:** Detect task type from task description for CFN Loop v3

## Overview

Analyzes task description keywords to classify into one of 6 domains:
- software-development
- content-creation
- research
- design
- infrastructure
- data-engineering

## Usage

```bash
TASK_TYPE=$(./.claude/skills/task-classifier/classify-task.sh "$TASK_DESCRIPTION")
echo "$TASK_TYPE"  # → "software-development"
```

## Classification Keywords

### Software Development
- implement, build, code, develop, create API
- backend, frontend, full-stack, web app
- REST, GraphQL, database, authentication
- bug fix, refactor, optimize code

### Content Creation
- write, article, blog post, copy, content
- documentation, guide, tutorial, whitepaper
- SEO, marketing copy, product description
- technical writing, user manual

### Research
- research, analyze, study, investigate
- data analysis, statistical analysis
- literature review, market research
- competitive analysis, feasibility study

### Design
- design, UI, UX, mockup, wireframe
- prototype, user interface, user experience
- visual design, branding, style guide
- accessibility, responsive design

### Infrastructure
- deploy, infrastructure, DevOps, cloud
- Kubernetes, Docker, Terraform, AWS
- CI/CD, monitoring, logging, scaling
- networking, security configuration

### Data Engineering
- ETL, pipeline, data warehouse, data lake
- streaming, real-time processing, batch
- data quality, schema, data model
- Apache Spark, Airflow, data integration

## Algorithm

1. Convert task description to lowercase
2. Check for keyword matches per category
3. Return category with most matches
4. Default to software-development if ambiguous

## Examples

```bash
classify-task.sh "Implement JWT authentication for REST API"
# → software-development

classify-task.sh "Write SEO-optimized blog post about AI trends"
# → content-creation

classify-task.sh "Research market opportunities for SaaS product"
# → research

classify-task.sh "Design mobile app onboarding flow with wireframes"
# → design

classify-task.sh "Deploy microservices to Kubernetes cluster"
# → infrastructure

classify-task.sh "Build ETL pipeline for customer data warehouse"
# → data-engineering
```

## Integration

Used by:
- `.claude/agents/cfn-v3-coordinator.md` - Task analysis
- `.claude/skills/cfn-agent-selector/select-agents.sh` - Agent recommendation