# Sprint Execution Skill

## Purpose
Provide a focused wrapper for executing individual sprints within a multi-sprint epic.

## Key Capabilities
- Inject sprint-specific context
- Manage CFN Loop execution
- Enforce scope boundaries
- Validate sprint deliverables
- Report sprint results

## Input Requirements
- Sprint configuration JSON
- Execution mode (standard/safety)

## Output Specification
Produces result:
- PROCEED
- ITERATE
- ABORT

## Execution Principles
- Strict scope management
- Minimal context injection
- Deliverable-focused validation
- Adaptive iteration support
