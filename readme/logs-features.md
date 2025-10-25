# Claude Flow Novice - Features Matrix (v2.9.1)

### Namespace Isolation

**Purpose**: Prevent file collision when installing CFN package

**Strategy**:
- Agents in `.claude/agents/cfn-dev-team/` subfolder
- Skills prefixed with `cfn-*`
- Hooks prefixed with `cfn-*`
- Commands in `.claude/commands/cfn/` subdirectory

**Collision risk**: ~0.01%

**Installation**:
```bash
npm install claude-flow-novice
npx cfn-init  # Copies namespace-isolated files
```

**Benefits**:
- User custom agents/skills/hooks preserved
- Safe updates (only cfn-* files overwritten)
- Can run cfn-init multiple times safely

### Agent Statistics (v2.9.1)
- **Development Team**: 23 agents in cfn-dev-team
- **Production Agents**: 23 agents
- **Package Metrics**:
  - Size: 2.4 MB unpacked (573 KB tarball)
  - Files: 303 files (68% reduction)

[... rest of previous content remains unchanged ...]

### 8. CFN Loop v3 Dual-Mode Architecture

#### Purpose
Flexible agent spawning with architectural optimization and context management

#### Modes of Operation
1. **CLI Mode (Default)**
   - Routing: Main Chat → Coordinator → Orchestrator Script → CLI Agents
   - Context Management: Redis-based storage
   - Cost Optimization: 95-98% savings

2. **Task Mode**
   - Routing: Main Chat → Coordinator → JSON Config → Task Agent Spawning
   - Routing Provider: Anthropic native routing
   - Detailed Tracking: Direct JSON configuration

#### Core Features
- **Redis Context Storage**
  - Eliminates CLI JSON escaping complexities
  - Enables stateful agent coordination
  - Supports swarm recovery after interruptions

- **Enhanced CLI Context Parsing (v2.9.0)**
  - Automatic JSON-to-markdown conversion
  - Converts file lists to bullet points
  - Converts requirements to numbered lists
  - Maintains Task agent clarity with CLI efficiency
  - Supported fields: task, files, requirements, deliverables, instructions, acceptanceCriteria, batch, directory
  - Fallback: Plain text if not valid JSON

- **Domain-Specific Validation**
  - 6 Structured Validation Templates:
    1. Software Development
    2. Content Creation
    3. Research Analysis
    4. Design Workflows
    5. Infrastructure Management
    6. Data Processing

- **Advanced Monitoring Capabilities**
  - Intervention Detection Mechanisms
    * Confidence plateau tracking
    * Recurring feedback identification
    * Stuck deliverable recognition

- **Adaptive Learning**
  - Playbook Pattern Extraction
    * SQLite-based pattern storage
    * Automatic agent selection based on historical performance
  - Retrospective Analysis (Loop 5 Post-Sprint)
    * Pattern identification
    * Performance optimization recommendations

#### Integration Points
- Seamless compatibility with:
  - `/cfn-loop`
  - `/cfn-loop-single`
  - `/cfn-loop-epic`

#### Configuration
- Mode toggling via `/cfn-mode` command
- Granular control over spawning behavior
- Zero-configuration default settings

[... rest of previous content remains unchanged ...]