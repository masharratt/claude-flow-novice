# Epic Decomposer Skill

## Purpose
Break down large epics into manageable, sequenced sprints with clear dependencies and scope boundaries.

## Key Capabilities
- Parse complex epic descriptions
- Extract acceptance criteria
- Identify component dependencies
- Generate multi-sprint execution plan

## Decomposition Algorithm
1. Parse epic description and acceptance criteria
2. Identify logical components
3. Analyze inter-component dependencies
4. Create topologically sorted sprint sequence
5. Assign deliverables to sprints
6. Estimate iterations per sprint

## Input Requirements
- Epic description
- Acceptance criteria
- Optional: Complexity hints

## Output Specification
Produces JSON with:
- Total sprints
- Sprint-level details
- Dependency graph
- Execution order
- Critical path

## Usage
```bash
decompose-epic.sh \
  --description "Build authentication system" \
  --acceptance-criteria "OAuth2 login,2FA,Session management"
```

## Complexity Factors
- Technological dependencies
- Integration requirements
- Security considerations
- Testing needs
