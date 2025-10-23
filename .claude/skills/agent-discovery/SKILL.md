# Agent Discovery Skill

## Purpose
Automatically discover and catalog available agents in the Claude Flow Novice system by scanning the `.claude/agents/` directory and extracting metadata from agent definition files.

## Key Features
- Scan `.claude/agents/*.md` files
- Extract metadata: name, description, type, keywords/tags
- Generate structured JSON registry
- Categorize agents by loop (Loop 3 or Loop 2)

## Agent Categorization
- **Loop 3 (Implementers)**:
  - Types: coder, developer, backend-dev, frontend-dev, architect, researcher, designer, writer, analyst
- **Loop 2 (Validators)**:
  - Types: reviewer, tester, security-auditor, performance-analyzer, validator
- **Coordinators**: Separate category, not included in agent selection

## Usage
```bash
./.claude/skills/agent-discovery/discover-agents.sh
```

## Output
Generates `.claude/skills/agent-discovery/agents-registry.json` with comprehensive agent metadata.

## Error Handling
- Robust parsing of agent files
- Handles missing or malformed frontmatter
- Generates sensible defaults for missing metadata

## Performance
- Optimized for quick scanning of agent files
- Minimal computational overhead
- Periodic refresh recommended

## Best Practices
- Keep agent definition files well-structured
- Include comprehensive frontmatter
- Use consistent metadata across agent definitions