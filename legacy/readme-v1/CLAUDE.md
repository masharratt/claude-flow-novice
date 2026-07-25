# Documentation Guidelines for Claude Flow

## Core Principles

### Language Style
- **Sparse, concise language** - maximum information, minimum words
- **Active voice** - "Use this function" not "This function is used"
- **Present tense** - "Returns data" not "Will return data"
- **No fluff** - Remove introductory phrases, opinions, unnecessary context

### Structure
- **Logical hierarchy** - clear sections, subsections
- **Consistent patterns** - repeatable formats across documentation
- **Scannable** - headings, bullet points, code blocks
- **Practical focus** - what developers need, not what we think they want

### Technical Content
- **Accurate** - code examples must work
- **Complete** - include parameters, return values, errors
- **Contextual** - explain when/why to use features
- **Cross-referenced** - link to related documentation

## Documentation Categories

### CFN Loop Documentation

**[CFN_LOOP_CHEATSHEET.md](./CFN_LOOP_CHEATSHEET.md)**
- Quick reference for CFN Loop operations
- Loop structure (Loops 0-4), mode selection (MVP/Standard/Enterprise), iteration limits
- Redis coordination patterns, telemetry templates, retry strategies

**[cfn-loop-flow-diagram.md](./cfn-loop-flow-diagram.md)**
- Visual representation of CFN Loop execution flow
- Loop transitions, gate checks, validator coordination

**[cfn-loop-modes.md](./cfn-loop-modes.md)**
- MVP mode (0.70/0.80), Standard mode (0.75/0.90), Enterprise mode (0.75/0.95)
- Mode comparison, performance impacts, resource usage

### System Features Documentation

**[logs-features.md](./logs-features.md)**
- Complete feature catalog: CFN Loop, swarm coordination, SQLite memory
- Configuration options, usage patterns, performance metrics
- Testing frameworks and monitoring capabilities

**[additional-commands.md](./additional-commands.md)**
- Specialized and infrequent commands
- Fullstack development, SPARC methodology, fleet management, event bus
- Enterprise-scale operations, testing, recovery operations

**[COMPONENT_NPM_STATUS.md](./COMPONENT_NPM_STATUS.md)**
- Complete inventory of all components available in the npm package
- NPM package status for 200+ components across all categories
- Implementation verification and coverage analysis

### API and Integration Documentation

**[logs-api.md](./logs-api.md)**
- REST API, MCP Server APIs (30 essential tools), CLI APIs
- Web portal API (REST + WebSocket), authentication/authorization
- Endpoint documentation, request/response formats, error handling

**[logs-slash-commands.md](./logs-slash-commands.md)**
- Comprehensive slash command reference
- CFN Loop, fullstack, SPARC, swarm management, agent lifecycle
- Command syntax, parameters, usage examples

### System Configuration and Integration

**[logs-hooks.md](./logs-hooks.md)**
- Automation hooks and integration points
- Post-edit pipeline (TDD validation, security scanning, formatting)
- Lifecycle hooks, git integration, event-driven automation

**[logs-functions.md](./logs-functions.md)**
- Utility functions and helper APIs
- Memory management utilities, coordination helpers, performance optimization

**[deprecated-logs-mcp.md](./deprecated-logs-mcp.md)** - ⚠️ DEPRECATED
- Historical MCP documentation (removed in v2.0.0)
- Migration guide to CLI-based architecture

**[logs-cli-redis.md](./logs-cli-redis.md)**
- Redis CLI integration and command reference
- State management, coordination patterns, pub/sub messaging, swarm recovery

### Indexes and Meta-Documentation

**[logs-documentation-index.md](./logs-documentation-index.md)**
- Master index of all logging and system documentation
- Quick start guides, architecture overview, integration patterns
- Document catalog with purpose/audience matrix

**[COMPONENT_INVENTORY_TABLE.md](./COMPONENT_INVENTORY_TABLE.md)**
- Comprehensive table of all features, slash commands, hooks, and agents
- Component categorization with descriptions and NPM package planning
- Complete system inventory for project management and planning

**[CHANGELOG.md](./CHANGELOG.md)**
- Version history and release notes
- Sprint summaries, feature releases, bug fixes, migration guides

## Documentation Templates

### Function Documentation
```markdown
## functionName

**Purpose**: Brief statement of what the function does

**Signature**: `function(param1, param2) -> returnType`

**Parameters**:
- `param1` (type): Description
- `param2` (type): Description, optional

**Returns**: Return type and description

**Example**:
```javascript
const result = functionName(value1, value2);
```

**Use Cases**: When to use this function
```

### API Endpoint Documentation
```markdown
### METHOD /endpoint

**Purpose**: What this endpoint does

**Parameters**:
- `param` (type, in: query/body): Description

**Request**:
```json
{
  "field": "value"
}
```

**Response**:
```json
{
  "status": "success"
}
```

**Status Codes**: 200, 400, 401, 500

**Example**:
```bash
curl -X POST /endpoint -d '{"field":"value"}'
```
```

### Feature Documentation
```markdown
## Feature Name

**Purpose**: What problem this solves

**Usage**: How to use it

**Configuration**: Available settings

**Examples**: Practical implementations

**Integration**: How it connects to other systems
```

### Command Documentation Template
```markdown
### /command-name [options]

**Purpose**: Single sentence describing what it does

**Usage**:
```bash
/command-name --flag value
```

**Flags**:
- `--flag`: Description (type, default)

**Output**: What the command returns

**Example**:
```bash
/command-name --example input
# Output: result
```
```

## What NOT to Include

### ❌ Marketing Language
```markdown
❌ "This revolutionary feature provides incredible 97% cost savings!"
❌ "Our amazing CFN Loop system offers unparalleled performance!"
❌ "The best-in-class coordination framework for enterprise teams!"
```

### ❌ Cost Optimization Details
```markdown
❌ "Worker agents cost $0.50 per phase versus $15 with pure Claude"
❌ "Save 97% on coordination costs using hybrid routing"
❌ "Token usage drops from 2M to 200K per phase"
```

**Why**: Agents don't need ongoing cost awareness. This information belongs in:
- Project planning documents
- Business case presentations
- Architecture decision records (ADRs)
- Pricing documentation for customers

### ❌ Comparative Benchmarks
```markdown
❌ "40x faster than traditional approaches"
❌ "Outperforms competitor X by 200%"
❌ "Industry-leading throughput of 398,373 events/sec"
```

**Exception**: Internal performance metrics for optimization decisions are acceptable:
```markdown
✅ "Event Bus: 398,373 events/sec, 2.5μs latency, 99.87% cache hit rate"
```

### ❌ Verbose Explanations
```markdown
❌ "This function can be used to initialize the swarm. It will create a
    new swarm instance that is configured with the topology you specify.
    You should use this before spawning any agents."
```

**Use instead**:
```markdown
✅ Initialize swarm with specified topology. Required before agent spawning.

   **Signature**: `swarmInit(topology, maxAgents) -> swarmId`

   **Example**:
   ```javascript
   const id = swarmInit('mesh', 5);
   ```
```

### ❌ Motivational Content
```markdown
❌ "With this powerful feature, you'll be able to accomplish..."
❌ "This exciting capability enables teams to..."
❌ "Unlock the potential of your workflow by..."
```

### ❌ Future Promises
```markdown
❌ "Coming soon: distributed consensus across regions"
❌ "Planned enhancements include..."
❌ "Future versions will support..."
```

### ❌ Opinions and Recommendations Without Context
```markdown
❌ "Always use Enterprise mode for best results"
❌ "MVP mode is not recommended"
❌ "This is the preferred approach for most use cases"
```

**Use instead**:
```markdown
✅ **Mode Selection**:
   - MVP: Prototypes, fast iteration (Gate: 0.70, Consensus: 0.80)
   - Standard: General features (Gate: 0.75, Consensus: 0.90)
   - Enterprise: Production systems (Gate: 0.75, Consensus: 0.95)
```

## Sparse Language Rules

### Active Voice (Required)
- ✅ "Returns data from Redis"
- ❌ "Data is returned from Redis"

### Present Tense (Required)
- ✅ "Initializes swarm"
- ❌ "Will initialize swarm"

### No Fluff (Required)
- ✅ "Monitor CI/CD pipeline status"
- ❌ "This command can be used to monitor your CI/CD pipeline status"

### Minimal Examples (Required)
- ✅ `swarmInit('mesh', 5)`
- ❌ Long multi-line examples with excessive comments

### Direct Description (Required)
- ✅ "Execute autonomous workflow"
- ❌ "This feature allows you to execute a workflow autonomously"

## File Naming Convention

- **kebab-case** for all markdown files
- **Prefix with category** (logs-, api-, cli-, etc.)
- **Descriptive names** that clearly indicate content

## Code Examples

- **Minimal** - show only what's necessary
- **Working** - all examples must be tested
- **Contextual** - include imports/dependencies if needed
- **Commented** - explain non-obvious parts

## Cross-References

- Use relative paths: `[API](./logs-api.md)`
- Reference specific sections: `[Functions](./logs-functions.md#core-functions)`
- Link external resources with full URLs

## Quick Navigation by Use Case

### Getting Started with CFN Loop
1. [CFN_LOOP_CHEATSHEET.md](./CFN_LOOP_CHEATSHEET.md) - Quick reference
2. [cfn-loop-modes.md](./cfn-loop-modes.md) - Mode selection
3. [cfn-loop-flow-diagram.md](./cfn-loop-flow-diagram.md) - Visual flow

### System Administration
1. [logs-slash-commands.md](./logs-slash-commands.md) - CLI operations
2. [logs-cli-redis.md](./logs-cli-redis.md) - Redis operations
3. [additional-commands.md](./additional-commands.md) - Advanced commands
4. [COMPONENT_NPM_STATUS.md](./COMPONENT_NPM_STATUS.md) - Package implementation verification

### API Integration
1. [logs-api.md](./logs-api.md) - REST/MCP/CLI APIs
2. [logs-mcp.md](./logs-mcp.md) - MCP protocol
3. [logs-hooks.md](./logs-hooks.md) - Hook integration

### Feature Discovery
1. [logs-features.md](./logs-features.md) - Complete feature catalog
2. [logs-documentation-index.md](./logs-documentation-index.md) - Documentation map
3. [COMPONENT_INVENTORY_TABLE.md](./COMPONENT_INVENTORY_TABLE.md) - Complete system inventory
4. [COMPONENT_NPM_STATUS.md](./COMPONENT_NPM_STATUS.md) - NPM package implementation status
5. [CHANGELOG.md](./CHANGELOG.md) - Recent additions

## Maintenance

- **Version tracking** - update examples with API changes
- **Deprecation notices** - clearly mark outdated information
- **Testing** - verify code examples work
- **Reviews** - regular accuracy checks

## Related Resources

- **Main Documentation**: [../CLAUDE.md](../CLAUDE.md) - Critical Rules and core workflows
- **Planning Docs**: [../planning/](../planning/) - Epic configurations and CFN Loop strategies
- **Reports**: [../reports/](../reports/) - Testing and security validation reports
- **Configuration**: [../config/](../config/) - CFN Loop criteria and hook configurations
- **Component Inventory**: [./COMPONENT_INVENTORY_TABLE.md](./COMPONENT_INVENTORY_TABLE.md) - Complete system component catalog
- **Package Status**: [./COMPONENT_NPM_STATUS.md](./COMPONENT_NPM_STATUS.md) - NPM implementation verification

---

*All documentation follows sparse, concise language philosophy: practical examples over theory, minimal direct explanations, code snippets for common operations.*
