# Agent Prompt Guidelines

## Overview

This document establishes guidelines for creating and maintaining effective agent prompts that focus on behavioral instructions and dynamic adaptation rather than static code examples.

## Core Principles

### 1. Behavioral Focus Over Code Examples

**✅ Do:**
- Describe how agents should think and approach problems
- Provide high-level strategies and methodologies
- Focus on decision-making processes and problem-solving approaches
- Emphasize adaptation to existing project patterns

**❌ Don't:**
- Include extensive code examples or implementations
- Provide specific configuration files or templates
- Hard-code technology-specific solutions
- Create documentation-style content

### 2. Dynamic Adaptation

**✅ Do:**
- Instruct agents to analyze existing codebase patterns
- Reference CLAUDE.md for project-specific context
- Encourage agents to adapt to the current technology stack
- Promote consistency with existing project conventions

**❌ Don't:**
- Assume specific technology stacks or frameworks
- Provide rigid, one-size-fits-all solutions
- Ignore existing project patterns and conventions
- Create agents that can't adapt to different contexts

### 3. Strategic Guidance

**✅ Do:**
- Provide strategic approaches to problem-solving
- Outline methodologies and best practices
- Describe quality standards and evaluation criteria
- Include collaboration patterns with other agents

**❌ Don't:**
- Get lost in implementation details
- Provide step-by-step coding instructions
- Focus on syntax rather than strategy
- Create agent prompts that read like technical documentation

## Agent Prompt Structure

### 1. Agent Identity Section
```markdown
## Core Responsibilities
- Clear, high-level responsibility statements
- Focus on outcomes rather than methods
- Define the agent's role in the ecosystem

## Core Identity & Expertise
- Who the agent is (role, expertise level)
- What domains they specialize in
- How they approach problem-solving
```

### 2. Methodology Section
```markdown
## [Domain] Methodology
- Strategic approaches to the domain
- Decision-making frameworks
- Quality standards and principles
- Best practices for the domain
```

### 3. Implementation Approach
```markdown
## Implementation Standards
- High-level principles (not code)
- Quality criteria and evaluation methods
- Integration patterns and considerations
- Adaptation strategies for different contexts
```

### 4. Collaboration Framework
```markdown
## Collaboration with Other Agents
- How to work with other agents
- Information sharing patterns
- Handoff protocols and expectations
```

## Refactoring Examples

### Before (Code-Heavy)
```markdown
```typescript
// Example implementation
const analyzeComplexity = async (filePath: string): Promise<ComplexityReport> => {
  const code = await readFile(filePath);
  const ast = parseAST(code);
  return {
    cyclomaticComplexity: calculateCyclomaticComplexity(ast),
    // ... more implementation details
  };
};
```

### After (Behavior-Focused)
```markdown
**Complexity Analysis Methods:**
- **Cyclomatic Complexity**: Measure code complexity through control flow analysis
- **Cognitive Complexity**: Assess mental overhead required to understand code
- **Maintainability Index**: Calculate overall maintainability scores
- **Adaptation Approach**: Analyze existing codebase to determine appropriate complexity tools and thresholds
```

## Quality Checklist

Before finalizing any agent prompt, ensure:

### Content Quality
- [ ] Focuses on behavior and approach rather than implementation
- [ ] Provides strategic guidance without prescriptive code
- [ ] Includes clear quality standards and evaluation criteria
- [ ] Emphasizes adaptation to project-specific context

### Structure Quality
- [ ] Clear agent identity and responsibilities
- [ ] Logical organization of methodologies and approaches
- [ ] Comprehensive collaboration guidelines
- [ ] No embedded code examples or configuration files

### Adaptability Quality
- [ ] Technology-agnostic where possible
- [ ] References CLAUDE.md for project-specific patterns
- [ ] Encourages analysis of existing codebase
- [ ] Promotes consistency with project conventions

## Best Practices

### 1. Use Action-Oriented Language
- "Analyze existing patterns and adapt accordingly"
- "Evaluate options based on project requirements"
- "Apply appropriate design patterns for the context"

### 2. Provide Decision Frameworks
- Offer criteria for making choices
- Explain when to use different approaches
- Guide agents on evaluating trade-offs

### 3. Emphasize Context Awareness
- Always consider existing project patterns
- Reference established conventions in CLAUDE.md
- Adapt recommendations to the current technology stack

### 4. Include Collaboration Guidance
- How to work effectively with other agents
- What information to share and request
- How to coordinate on complex tasks

## Common Anti-Patterns to Avoid

### 1. The Documentation Trap
- **Problem**: Agents read like technical documentation
- **Solution**: Focus on decision-making and approach guidance

### 2. The Copy-Paste Template
- **Problem**: Agents provide copy-paste code solutions
- **Solution**: Provide principles and let agents implement contextually

### 3. The One-Size-Fits-All Agent
- **Problem**: Agents assume specific technology stacks
- **Solution**: Create adaptable agents that analyze context first

### 4. The Implementation Tutorial
- **Problem**: Agents provide step-by-step coding instructions
- **Solution**: Focus on strategy, principles, and quality standards

## Maintenance Guidelines

### Regular Review Process
1. **Quarterly Review**: Assess agent effectiveness and adaptation capabilities
2. **Context Updates**: Update agents when project patterns change significantly
3. **Collaboration Optimization**: Refine inter-agent collaboration based on usage patterns
4. **Quality Assessment**: Evaluate whether agents maintain behavioral focus

### Update Triggers
- Major technology stack changes in the project
- New quality standards or best practices adoption
- Feedback indicating agents are too prescriptive
- Discovery of agents providing outdated or irrelevant guidance

## Implementation Roadmap

### Phase 1: Core Agent Refactoring ✓
- Refactor coder.md ✓
- Refactor analyst.md ✓
- Refactor architect.md ✓

### Phase 2: Remaining Agent Refactoring
- Refactor devops-engineer.md
- Refactor github-specialist.md
- Refactor neural-pattern-agent.md

### Phase 3: Validation and Optimization
- Test refactored agents with real tasks
- Gather feedback on agent effectiveness
- Optimize collaboration patterns
- Update guidelines based on learnings

### Phase 4: Documentation and Training
- Create agent usage guides
- Document collaboration patterns
- Establish maintenance procedures
- Train team on new agent approach

## Success Metrics

### Qualitative Metrics
- Agents adapt effectively to different project contexts
- Agents provide relevant, actionable guidance
- Agents collaborate effectively with each other
- Agents maintain focus on outcomes rather than implementation details

### Quantitative Metrics
- Reduction in agent prompt lengths (code removal)
- Increase in agent reusability across projects
- Reduction in agent updates needed for technology changes
- Improvement in user satisfaction with agent responses

## Conclusion

Effective agent prompts focus on behavioral guidance and dynamic adaptation rather than static code examples. By following these guidelines, we create agents that are more flexible, reusable, and effective across different project contexts while maintaining high-quality outcomes.

The key is to transform agents from being technical documentation repositories into intelligent, adaptive problem-solving assistants that can analyze context and provide relevant, strategic guidance for any situation.