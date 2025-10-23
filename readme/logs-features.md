# Claude Flow Novice - Features Matrix (v2)

[... previous content remains unchanged ...]

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