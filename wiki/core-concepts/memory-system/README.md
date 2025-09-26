# Memory System: Persistent Intelligence

Understand how Claude Flow Novice's memory system enables agents to learn, remember, and share knowledge across sessions for continuous improvement.

## 🧠 Memory System Overview

The memory system provides persistent intelligence that enables agents to:
- **Remember context** across development sessions
- **Learn from experience** and improve over time
- **Share knowledge** between agents and projects
- **Maintain continuity** in long-term projects

### Core Benefits
- **Faster startup** with preserved context
- **Improved accuracy** through learned patterns
- **Knowledge accumulation** across projects
- **Collaborative intelligence** between agents

## 🏗️ Memory System Architecture

### 📊 Memory Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    CLAUDE FLOW MEMORY SYSTEM                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │   SESSION    │    │   PROJECT    │    │    AGENT     │      │
│  │   MEMORY     │    │   MEMORY     │    │   MEMORY     │      │
│  │              │    │              │    │              │      │
│  │ • Workflow   │    │ • Patterns   │    │ • Learning   │      │
│  │ • Context    │    │ • Decisions  │    │ • Preferences│      │
│  │ • Progress   │    │ • Standards  │    │ • Metrics    │      │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘      │
│         │                   │                   │              │
│         └───────────────────┼───────────────────┘              │
│                             │                                  │
│                    ┌────────▼────────┐                         │
│                    │  SHARED MEMORY  │                         │
│                    │                 │                         │
│                    │ • Best Practices│                         │
│                    │ • Common Patterns│                        │
│                    │ • Knowledge Base│                         │
│                    │ • Cross-Agent   │                         │
│                    │   Intelligence  │                         │
│                    └─────────────────┘                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 🔄 Memory Data Flow

```
Agent Activity → Memory Creation → Storage & Indexing → Retrieval & Learning

┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   AGENT     │    │   HOOKS     │    │  MEMORY     │    │   FUTURE    │
│  ACTIONS    │───►│ EXTRACTION  │───►│  STORAGE    │───►│   AGENTS    │
│             │    │             │    │             │    │             │
│ • Code edits│    │ • Pattern   │    │ • Indexed   │    │ • Context   │
│ • Decisions │    │   detection │    │ • Tagged    │    │   aware     │
│ • Outcomes  │    │ • Success   │    │ • Semantic  │    │ • Pattern   │
│ • Learning  │    │   metrics   │    │   search    │    │   guided    │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
```

## 🗄️ Memory Types

### Session Memory
**Scope**: Current development session (TTL: 24 hours)
**Lifespan**: Until session ends or timeout
**Purpose**: Immediate context and workflow state
**Storage**: Fast RAM-based cache

```javascript
// Store session context
mcp__claude-flow__memory_store({
  key: "session/current-task",
  data: {
    task: "implement user authentication",
    progress: "API endpoints complete",
    nextSteps: ["add JWT validation", "write tests"]
  },
  scope: "session"
})
```

### Project Memory
**Scope**: Specific project
**Lifespan**: Project lifetime
**Purpose**: Project-specific knowledge and patterns

```javascript
// Store project knowledge
mcp__claude-flow__memory_store({
  key: "project/auth-service/architecture",
  data: {
    framework: "Express.js",
    database: "PostgreSQL",
    authentication: "JWT",
    patterns: ["middleware", "error-handling", "validation"]
  },
  scope: "project"
})
```

### Agent Memory
**Scope**: Individual agent
**Lifespan**: Agent lifecycle
**Purpose**: Agent-specific learning and preferences

```javascript
// Store agent learning
mcp__claude-flow__memory_store({
  key: "agent/coder-001/preferences",
  data: {
    codeStyle: "functional",
    testingFramework: "jest",
    successPatterns: ["small-functions", "clear-naming"],
    learningMetrics: { successRate: 0.92, improvementRate: 0.15 }
  },
  scope: "agent"
})
```

### Shared Memory
**Scope**: Cross-agent knowledge
**Lifespan**: Global
**Purpose**: Knowledge sharing and coordination

```javascript
// Store shared knowledge
mcp__claude-flow__memory_store({
  key: "shared/security-patterns",
  data: {
    patterns: ["input-validation", "sql-injection-prevention", "xss-protection"],
    implementations: {
      "input-validation": "joi, express-validator",
      "sql-injection": "parameterized queries, ORM"
    },
    bestPractices: ["principle-of-least-privilege", "defense-in-depth"]
  },
  scope: "shared"
})
```

## 🔍 Memory Operations

### Storing Information
```bash
# CLI memory storage
npx claude-flow@alpha memory store \
  --key "project/api-design" \
  --data "REST API with JWT authentication" \
  --scope project

# Store with metadata
npx claude-flow@alpha memory store \
  --key "patterns/successful-implementations" \
  --data "microservices with event sourcing" \
  --tags "architecture,scalability,events" \
  --scope shared
```

### Retrieving Information
```bash
# Retrieve specific memory
npx claude-flow@alpha memory get "project/api-design"

# Search memory by tags
npx claude-flow@alpha memory search --tags "architecture"

# List all memories for scope
npx claude-flow@alpha memory list --scope project
```

### Memory Queries
```javascript
// Complex memory queries via MCP
mcp__claude-flow__memory_query({
  scope: "project",
  filters: {
    tags: ["authentication", "security"],
    dateRange: "last-30-days",
    relevance: 0.8
  },
  limit: 10
})
```

## 🚀 Intelligent Memory Features

### Automatic Memory Creation
Agents automatically create memory entries during work:

```bash
# Hooks automatically store context
npx claude-flow@alpha hooks post-edit \
  --file "src/auth.js" \
  --memory-key "project/auth/implementation" \
  --auto-extract-patterns

# Automatic pattern recognition
npx claude-flow@alpha hooks post-task \
  --task-id "auth-implementation" \
  --extract-success-patterns \
  --update-agent-memory
```

### Memory-Driven Suggestions
```javascript
// Get memory-based suggestions
mcp__claude-flow__memory_suggest({
  context: "implementing authentication",
  previousExperience: true,
  successPatterns: true,
  similarProjects: true
})

// Expected suggestions:
// - "Based on previous success, consider JWT with refresh tokens"
// - "Similar projects used express-validator for input validation"
// - "Security pattern: implement rate limiting for auth endpoints"
```

### Learning and Adaptation
```javascript
// Agent learning from memory
mcp__claude-flow__neural_train({
  agentId: "coder-001",
  memorySource: "successful-implementations",
  focusAreas: ["code-quality", "performance", "security"]
})

// Track learning progress
mcp__claude-flow__daa_learning_status({
  agentId: "coder-001",
  detailed: true
})
```

## 🔄 Memory-Driven Workflows

### Context-Aware Agent Spawning
```javascript
// Spawn agents with memory context
Task("Authentication Expert",
  "Implement JWT auth using learned patterns from memory",
  "coder",
  { memoryContext: "project/auth-patterns" })

// Agent automatically retrieves:
// - Previous authentication implementations
// - Success patterns from similar projects
// - Security best practices
// - Performance considerations
```

### Progressive Learning
```javascript
// Memory enables progressive improvement
Session 1: Basic implementation → Store patterns
Session 2: Improved implementation using learned patterns
Session 3: Optimized implementation with accumulated knowledge
Session N: Expert-level implementation with extensive memory
```

### Cross-Project Knowledge Transfer
```javascript
// Transfer knowledge between projects
mcp__claude-flow__memory_transfer({
  sourceProject: "e-commerce-auth",
  targetProject: "banking-api",
  knowledgeDomains: ["authentication", "security", "performance"],
  transferMode: "adaptive"
})
```

## 📊 Memory Analytics

### Memory Usage Metrics
```bash
# Memory usage statistics
npx claude-flow@alpha memory stats

# Output:
# Total entries: 1,247
# Session memory: 23 entries (45MB)
# Project memory: 89 entries (156MB)
# Agent memory: 67 entries (89MB)
# Shared memory: 1,068 entries (234MB)
```

### Memory Effectiveness
```javascript
// Track memory impact on performance
mcp__claude-flow__memory_analytics({
  metrics: ["recall-accuracy", "suggestion-relevance", "learning-velocity"],
  timeRange: "30-days"
})

// Results:
// - 89% accuracy in pattern recall
// - 92% relevance in suggestions
// - 34% improvement in task completion speed
```

### Knowledge Graph Analysis
```javascript
// Analyze knowledge relationships
mcp__claude-flow__memory_graph({
  focus: "authentication-domain",
  includeRelationships: true,
  visualize: true
})
```

## 🔧 Memory Configuration

### Memory Storage Settings
```json
{
  "memory": {
    "storage": {
      "type": "hybrid",
      "persistence": "disk",
      "compression": true,
      "encryption": true
    },
    "retention": {
      "session": "24-hours",
      "project": "1-year",
      "agent": "permanent",
      "shared": "permanent"
    },
    "indexing": {
      "enabled": true,
      "algorithm": "semantic-search",
      "similarity-threshold": 0.8
    }
  }
}
```

### Agent Memory Preferences
```json
{
  "agents": {
    "coder": {
      "memory": {
        "autoStore": true,
        "learningRate": 0.3,
        "retentionFocus": ["successful-patterns", "error-solutions"],
        "sharingPolicy": "selective"
      }
    },
    "reviewer": {
      "memory": {
        "autoStore": true,
        "learningRate": 0.2,
        "retentionFocus": ["quality-issues", "best-practices"],
        "sharingPolicy": "aggressive"
      }
    }
  }
}
```

## 🎯 Memory Best Practices

### Effective Memory Usage

#### Store Meaningful Context
```javascript
// Good: Specific, actionable memory
mcp__claude-flow__memory_store({
  key: "project/auth/jwt-implementation",
  data: {
    library: "jsonwebtoken",
    secretManagement: "environment-variable",
    tokenExpiry: "15-minutes-access-24-hours-refresh",
    securityConsiderations: ["HTTPS-only", "secure-cookies", "CSRF-protection"]
  }
})

// Poor: Vague, unusable memory
mcp__claude-flow__memory_store({
  key: "project/something",
  data: "did some auth stuff"
})
```

#### Use Appropriate Scope
- **Session**: Temporary workflow state
- **Project**: Project-specific patterns and decisions
- **Agent**: Learning and preferences
- **Shared**: Reusable patterns and best practices

#### Tag Strategically
```bash
# Use consistent, searchable tags
npx claude-flow@alpha memory store \
  --key "patterns/microservice-auth" \
  --tags "authentication,microservices,jwt,security,scalability"
```

### Memory Maintenance

#### Regular Cleanup
```bash
# Clean up stale session memory
npx claude-flow@alpha memory cleanup --scope session --older-than 24h

# Archive old project memory
npx claude-flow@alpha memory archive --scope project --completed-projects
```

#### Memory Optimization
```bash
# Optimize memory indexes
npx claude-flow@alpha memory optimize --rebuild-indexes

# Compress memory storage
npx claude-flow@alpha memory compress --threshold 100MB
```

## 🎮 Interactive Memory Management

### Memory Explorer
```bash
# Interactive memory browser
npx claude-flow@alpha memory explore

# Available features:
# 1. Browse by scope and tags
# 2. Search with semantic similarity
# 3. Visualize knowledge graphs
# 4. Export memory collections
# 5. Import from other projects
```

### Memory Insights
```bash
# Generate memory insights report
npx claude-flow@alpha memory insights --project current

# Report includes:
# - Most valuable memory entries
# - Learning patterns and trends
# - Knowledge gaps identification
# - Optimization recommendations
```

## 🔒 Memory Security and Privacy

### Data Protection
- **Encryption at rest** for sensitive information
- **Access control** based on agent permissions
- **Audit logging** for memory access and changes
- **Data anonymization** for shared memories

### Privacy Controls
```json
{
  "memory": {
    "privacy": {
      "sensitiveDataDetection": true,
      "autoRedaction": true,
      "accessLogging": true,
      "shareableByDefault": false
    }
  }
}
```

## 🚨 Memory Troubleshooting

### Common Issues

#### Memory Not Persisting
```bash
# Check memory configuration
npx claude-flow@alpha memory config show

# Verify storage permissions
npx claude-flow@alpha memory diagnose --check-storage
```

#### Poor Memory Recall
```bash
# Rebuild memory indexes
npx claude-flow@alpha memory rebuild-indexes

# Update similarity algorithms
npx claude-flow@alpha memory update-algorithms
```

#### Memory Conflicts
```javascript
// Resolve memory conflicts
mcp__claude-flow__memory_resolve_conflicts({
  scope: "project",
  strategy: "merge-with-timestamp"
})
```

## 📚 Further Reading

- **[Agents](../agents/README.md)** - How agents use memory for learning
- **[Swarm Coordination](../swarm-coordination/README.md)** - Shared memory in coordination
- **[Hooks Lifecycle](../hooks-lifecycle/README.md)** - Automatic memory creation
- **[Advanced Tutorials](../../tutorials/advanced/README.md)** - Advanced memory patterns

---

**Ready to leverage memory?**
- **Start simple**: Store project context and see agents improve
- **Expand gradually**: Add more detailed patterns and learning
- **Monitor impact**: Track how memory improves agent performance
- **Share knowledge**: Use shared memory for team-wide improvements