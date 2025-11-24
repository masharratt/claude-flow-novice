# Planners

Architecture, design, and strategic planning agents.

## Active Agents (7)

**Architecture:**
- `architect.md` - System architecture and design decisions
- `system-architect.md` - Large-scale system design
- `system-architect-persona.md` - Persona-based architecture approach

**Analysis & Research:**
- `analyst.md` - Requirements analysis and research
- `planner.md` - Project planning and task breakdown

**Specialized Planning:**
- `api-designer-persona.md` - API design and specification
- `security-architect-persona.md` - Security architecture and threat modeling

## Purpose

Planners work upstream of implementation:
- Define system architecture
- Design component interactions
- Plan technical approach
- Research solutions
- Create specifications
- Identify risks and constraints

## Planning Workflow

**1. Requirements Analysis**
- Understand business needs
- Identify technical constraints
- Research existing solutions
- Propose approaches

**2. Architecture Design**
- Define system components
- Plan data flow
- Design APIs and interfaces
- Consider scalability
- Address security

**3. Implementation Planning**
- Break down into tasks
- Estimate complexity
- Identify dependencies
- Create specifications
- Define success criteria

## Usage Pattern

**Epic Planning:**
```bash
npx claude-flow-novice agent-spawn architect --task-id "epic-planning"
```

**Feature Design:**
```bash
npx claude-flow-novice agent-spawn api-designer-persona --task-id "api-design"
```

**Security Review:**
```bash
npx claude-flow-novice agent-spawn security-architect-persona --task-id "threat-model"
```

## Deliverables

Planners produce:
- Architecture diagrams
- API specifications
- Task breakdowns
- Risk assessments
- Implementation guidance
- Success criteria

## Collaboration

Planners work with:
- **Product Owner:** Validate business alignment
- **Developers:** Provide specifications
- **Reviewers:** Define quality standards
- **Security Specialists:** Address threats

## Output Format

Planning documents with:
- Clear architectural decisions
- Justification for choices
- Implementation guidance
- Risk mitigation strategies
- Success metrics
