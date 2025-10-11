# Agent Token Usage Analysis Report

## Executive Summary

This analysis examines the token usage across 77 agent description fields in the `.claude/agents` directory to understand the context overhead when Claude Code loads agent descriptions for selection.

### Key Findings

- **Total Token Usage**: 2,362 tokens across all agent descriptions
- **Average per Agent**: 30.68 tokens per description
- **Estimated Context Overhead**: 2,834 tokens (including selection logic)
- **Context Window Impact**: 35% of an 8K window, 9% of a 32K window

## Token Distribution Analysis

### Distribution by Token Range

| Token Range | Agent Count | Percentage |
|-------------|-------------|------------|
| 11-20 tokens | 29 agents | 38% |
| 21-30 tokens | 25 agents | 32% |
| 31-50 tokens | 19 agents | 25% |
| 51-100 tokens | 3 agents | 4% |
| 100+ tokens | 1 agent | 1% |

**Key Insights:**
- 70% of agents have descriptions between 11-30 tokens
- Only 5% have descriptions over 50 tokens
- The distribution follows a normal pattern with most agents having concise descriptions

### Description Length Extremes

**Shortest Description** (11 tokens):
- Agent: `reviewer`
- Description: "Code review and quality assurance specialist"

**Longest Description** (322 tokens):
- Agent: `base-template-generator`
- Description: Contains detailed usage examples and commentary, including XML-style examples explaining when to use the agent

## Context Complexity Analysis

### Components Contributing to Token Count

| Component | Average per Agent | Notes |
|-----------|------------------|-------|
| Technical Terms | 0.94 | Byzantine, CRDT, API, etc. |
| Sentences | 1.31 | Most descriptions are 1-2 sentences |
| Words per Sentence | 10.29 | Concise, technical language |
| Domain-Specific Words | 1.45 | Agent, coordination, management, etc. |
| Code Examples | 0% | No inline code in descriptions |
| List Items | 0 | No bullet points in descriptions |

### What Makes Descriptions Context-Heavy

1. **Detailed Examples**: The `base-template-generator` agent includes XML examples explaining usage contexts
2. **Technical Terminology**: Consensus, Byzantine, CRDT, neural network terms
3. **Multi-functionality**: Agents with multiple capabilities require longer explanations
4. **Integration Context**: Descriptions explaining how agents work with other systems

## Top 10 Most Token-Heavy Agents

| Rank | Agent | Tokens | Category |
|------|-------|--------|----------|
| 1 | base-template-generator | 322 | Template Generation |
| 2 | safla-neural | 98 | Neural/AI |
| 3 | goal-planner | 81 | Planning |
| 4 | sublinear | 81 | Mathematical |
| 5 | workflow | 43 | Automation |
| 6 | sync-coordinator | 43 | Coordination |
| 7 | neural-network | 42 | Neural/AI |
| 8 | authentication | 41 | Security |
| 9 | swarm | 41 | Orchestration |
| 10 | workflow-automation | 41 | Automation |

## Claude Code Context Impact Analysis

### Current Impact
When Claude Code loads all agent descriptions for selection:

- **Base Description Tokens**: 2,362 tokens
- **With Selection Logic Overhead**: ~2,834 tokens (20% overhead)
- **Percentage of 8K Context Window**: 35%
- **Percentage of 32K Context Window**: 9%

### Optimization Recommendations

1. **Short-term Optimizations**:
   - Reduce the `base-template-generator` description by removing verbose examples
   - Standardize description format to 15-25 tokens per agent
   - Use abbreviations for common technical terms

2. **Medium-term Optimizations**:
   - Implement lazy loading of detailed descriptions
   - Use semantic search to pre-filter relevant agents
   - Cache frequently used agent selections

3. **Long-term Optimizations**:
   - Implement hierarchical agent selection (category → specific agent)
   - Use embeddings for similarity-based agent matching
   - Create agent recommendation system based on task context

### Projected Impact After Optimization

If descriptions are standardized to 20 tokens average:
- **Total Tokens**: ~1,540 tokens (35% reduction)
- **With Overhead**: ~1,848 tokens
- **8K Window Impact**: 23% (down from 35%)
- **32K Window Impact**: 6% (down from 9%)

## Agent Categories by Token Usage

### High Token Usage (40+ tokens)
- Template generators with examples
- Neural/AI specialists with complex explanations
- Multi-functional workflow agents

### Medium Token Usage (20-39 tokens)
- Specialized technical agents
- Coordination and management agents
- GitHub integration agents

### Low Token Usage (11-19 tokens)
- Core development agents (coder, tester, reviewer)
- Single-purpose utility agents
- SPARC methodology agents

## Recommendations for New Agents

1. **Target Description Length**: 15-25 tokens
2. **Format**: "Function + Specialization + Key capability"
3. **Avoid**: Verbose examples, redundant terminology
4. **Include**: Core purpose, primary domain, key differentiator

### Example Templates

**Good** (22 tokens):
```
"Advanced React component generator with TypeScript integration and testing scaffolding"
```

**Too Verbose** (45+ tokens):
```
"This agent specializes in creating comprehensive React components with full TypeScript definitions, integrated testing suites, styling solutions, and proper documentation following industry best practices and team conventions"
```

**Too Brief** (8 tokens):
```
"React component generator"
```

## Conclusion

The current token usage for agent descriptions is manageable but could be optimized. The 35% context window usage for an 8K model is significant but not prohibitive. The main optimization opportunity lies in standardizing the `base-template-generator` agent description, which alone accounts for 14% of all description tokens.

Future agent additions should follow the recommended 15-25 token guideline to maintain efficient context usage while preserving necessary descriptive information for accurate agent selection.