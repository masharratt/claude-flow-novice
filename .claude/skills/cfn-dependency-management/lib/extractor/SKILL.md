# Dependency Extractor Skill

## Purpose
Analyze acceptance criteria to identify and map task dependencies, enabling intelligent sprint sequencing.

## Key Functions
- Parse detailed acceptance criteria
- Identify explicit and implicit dependencies
- Generate dependency graph
- Compute topological execution order

## Input Requirements
- Detailed acceptance criteria
- Optional: Technology stack context
- Optional: Domain-specific constraints

## Output Specification
Produces JSON with:
- Direct dependencies
- Indirect dependencies
- Execution order
- Parallel opportunities
- Critical path

## Usage
```bash
extract-dependencies.sh \
  --criteria "OAuth2 login working,Session tokens expire,2FA enrollment"
```

## Dependency Analysis Principles
- Explicit dependency extraction
- Implicit relationship detection
- Layered dependency resolution
- Parallel execution optimization
