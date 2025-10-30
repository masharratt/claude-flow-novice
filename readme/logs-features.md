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

### 7. Cyclomatic Complexity Analysis

#### Purpose
Automatic code complexity monitoring integrated into post-edit pipeline

#### Features
- **Automatic Analysis**: Triggers on files >200 lines
- **Two-Tier Warnings**:
  - Complexity 30-39: Warning (exit code 8)
  - Complexity ≥40: Critical + detailed Lizard analysis (exit code 7)
- **Multi-Language Support**: Bash, JavaScript, TypeScript, Python
- **Performance**: ~23ms overhead per file

#### Tools
- **simple-complexity.sh**: Fast bash-native analyzer
- **Lizard**: Professional multi-language analyzer (auto-installed)
- **cyclomatic-complexity-reducer agent**: Automated refactoring

#### Integration
- Post-edit hook runs automatically
- GitHub Actions workflow (manual trigger)
- Real-time feedback during development

#### Configuration
```bash
# Disable in .claude/hooks/post-edit.config.json
"complexityChecks": { "enabled": false }

# Adjust thresholds in config/hooks/post-edit-pipeline.js
if (complexity >= 30) { /* warning */ }
if (complexity >= 40) { /* critical */ }
```

#### Output
**Warning (30-39)**:
```json
{
  "status": "COMPLEXITY_WARNING",
  "metrics": { "cyclomaticComplexity": 35 },
  "recommendations": [{
    "type": "complexity",
    "priority": "medium",
    "message": "Cyclomatic complexity is 35 (threshold: 30)",
    "action": "Consider refactoring to reduce complexity"
  }]
}
```

**Critical (≥40)**:
```json
{
  "status": "COMPLEXITY_CRITICAL",
  "metrics": { "cyclomaticComplexity": 74 },
  "complexityAnalysis": {
    "tool": "lizard",
    "detailedReport": "NLOC  CCN  token  PARAM  length  location\n..."
  },
  "recommendations": [{
    "priority": "critical",
    "action": "Run cyclomatic-complexity-reducer agent"
  }]
}
```

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

### 9. Frontend CFN Loop (Visual Iteration Workflow)

#### Purpose
Specialized CFN Loop for frontend development with visual validation and brand consistency enforcement

#### Key Features
- **Design-First Approach**
  - Mockup integration (PNG/JPG images)
  - Brand guideline extraction from mockups
  - Design token management (colors, typography, spacing)

- **Dual Validation System**
  - Screenshot analysis: Visual fidelity (colors, layout, spacing)
  - Video analysis: Interaction quality (animations, loading states, error handling)
  - Combined score threshold: ≥85% required

- **Visual Iteration Loop**
  - Playwright screenshot capture
  - Playwright video recording (`video: 'on'` in config)
  - Image analysis via `mcp__zai-mcp-server__analyze_image`
  - Video analysis via `mcp__zai-mcp-server__analyze_video`
  - Structured feedback: static discrepancies + interaction issues

- **Coordinator Orchestration**
  - Coordinator orchestrates only (does NOT implement code)
  - Spawns frontend specialists (react-frontend-engineer, accessibility-advocate-persona)
  - Manages iteration cycles based on combined visual + interaction score

#### Integration
- Works in both CLI and Task modes
- Supports `/cfn-loop` with `--spawn-mode` parameter
- Brand guidelines stored in `.claude/brand-guidelines.json`

#### Configuration
```bash
# Task Mode (full visibility)
/cfn-loop-frontend "Build login UI" \
  --mockup=/path/to/mockup.png \
  --brand-guidelines=/path/to/brand.json \
  --spawn-mode=task

# CLI Mode (production)
/cfn-loop-frontend "Build dashboard" \
  --mockup=/path/to/dashboard.png \
  --mode=enterprise
```

#### Output Artifacts
- Screenshots: `tests/screenshots/*.png`
- Videos: `test-results/**/video.webm`
- Brand guidelines: `.claude/brand-guidelines.json`
- Sprint docs: `docs/SPRINT_*.md`

#### Documentation
- Guide: `.claude/commands/cfn/CFN_LOOP_FRONTEND.md`
- Covers: Phase 0 planning, brand guidelines, visual iteration, validator coordination

### 10. Task Mode Execution (CFN Loop)

#### Purpose
Simplified CFN Loop execution with direct agent spawning and full visibility

#### Key Differences from CLI Mode
- **No coordinator agent**: Main Chat coordinates directly
- **Task() spawning**: Agents spawned via Task tool (not CLI)
- **Direct context injection**: Context passed to each agent spawn
- **Anthropic routing**: All agents use Main Chat provider

#### Agent Specialization
- **Loop 3 (Implementation)**: backend-dev, researcher, mobile-dev, devops, rust-developer
- **Loop 2 (Validation)**: reviewer, tester, architect, security-specialist, accessibility-advocate-persona
- **Loop 4 (Product Owner)**: product-owner, product-owner-agent

#### Adaptive Validator Scaling
| Complexity | Files | LOC | Validators | Agents | Threshold |
|------------|-------|-----|------------|--------|-----------|
| Simple | 1-2 | <200 | 2 | reviewer, tester | 0.85 |
| Standard | 3-5 | 200-500 | 4 | +architect, +security-specialist | 0.90 |
| Complex/Enterprise | >5 | >500 | 5+ | +code-analyzer, +perf/ada | 0.92-0.95 |

#### Sprint Workflow
- Main Chat reads guide: `.claude/commands/cfn/CFN_LOOP_TASK_MODE.md`
- Spawns agents in parallel (Loop 3)
- Collects confidence scores, checks gate threshold
- Spawns validators (Loop 2)
- Product Owner makes PROCEED/ITERATE/ABORT decision
- Git commit + push on PROCEED

#### Backlog Management
- **P1 (critical)**: Blocking issues, security fixes
- **P2 (high)**: Important features, performance improvements
- **P3 (background)**: Nice-to-have features, cleanup tasks

#### Documentation
- Guide: `.claude/commands/cfn/CFN_LOOP_TASK_MODE.md`
- Covers: Agent selection, adaptive scaling, sprint completion, backlog mechanism

### 11. n8n MCP Integration

#### Purpose
Execute marketing workflows via n8n webhooks, enabling multi-platform automation

#### Architecture
- CFN Skills invoke n8n workflows via HTTP webhooks
- n8n workflows serve as MCP servers
- Bash operation scripts handle webhook authentication (N8N_BASE_URL + N8N_API_KEY)
- JSON payloads constructed with jq for type safety

#### Implementation Pattern
```bash
#!/bin/bash
set -euo pipefail

# Call n8n webhook
curl -X POST "$N8N_BASE_URL/webhook/endpoint" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD"
```

#### Platform Integrations
**34 platforms across 6 categories:**
- **Email**: Mailchimp, SendGrid, HubSpot
- **Social**: Meta, LinkedIn, Twitter/X, TikTok
- **Analytics**: Google Analytics 4, HubSpot CRM, Salesforce
- **Paid Ads**: Google Ads, Meta Ads, LinkedIn Ads
- **Conversational**: Intercom, Drift, Twilio, Plivo
- **Intelligence**: BuzzSumo, SEMrush, Ahrefs, Unbounce, Instapage
- **PR/Media**: PR Newswire, Business Wire, Muck Rack, HARO, Meltwater, Brandwatch

#### Compliance Frameworks
- **TCPA**: Opt-in verification, DNC registry check, consent logging (exit code 3 for violations)
- **A/B Testing**: 95% confidence, 100 min conversions, 7-day minimum duration
- **Crisis Detection**: <15 min alert latency, 2-hour response SLA
- **Budget Validation**: Hard-coded spend limits, multi-tier approval

#### Skills Created
- **12 skills**: 65 operations total
- **12 workflows**: Across 5 marketing phases
- **Exit Code Pattern**: 1=params, 2=API/network, 3=validation/compliance

#### Use Cases
- Marketing department automation (email, social, ads, analytics)
- Multi-platform campaign orchestration
- Compliance-enforced communications (TCPA, BANT)
- Real-time crisis monitoring and alerting

[... rest of previous content remains unchanged ...]