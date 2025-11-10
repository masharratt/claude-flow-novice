# Documentation Index for Claude Flow Novice (v2.6.0)

## V2 Core Documentation

### 🎯 v2.6.0 - CLI Agent Context Enhancement (2025-10-20)
- **Major Feature**: CLI agent context parity with Task agents
- **Implementation**: Three-sprint enhancement (iteration feedback, system prompts, iteration history)
- **Impact**: CLI agents achieve feature parity with Task agents
- **Test Coverage**: 42/42 tests passing

### 🚀 v2.0.0 Release Overview (2025-10-18)
- **Release Date**: 2025-10-18
- **Architecture**: Skills-First Coordination
- **Key Changes**:
  - Zero-token Redis coordination
  - CFN Loop dependency enforcement
  - Mandatory parallel agent spawning
  - 9 new production skills
  - CLI spawning with Redis coordination

### Key Documentation Links
- [README.md](./README.md) - v2 system overview
- [cli-agent-context-implementation.md](./cli-agent-context-implementation.md) - v2.6.0 context enhancement
- [log-skills.md](./log-skills.md) - Skills system fundamentals
- [CHANGELOG.md](./CHANGELOG.md) - Complete release history
- [CFN_LOOP_CHEATSHEET.md](./CFN_LOOP_CHEATSHEET.md) - Quick reference

## Documentation Categories

### V2 Core Documentation
1. **[README.md](./README.md)**
   - v2 system overview
   - Skills-first architecture
   - Zero-token coordination
   - Migration guide from v1

2. **[log-skills.md](./log-skills.md)**
   - Skills system documentation
   - Available skills
   - Skill development guidelines
   - Coordination patterns

### CFN Loop Documentation
1. **[CFN_LOOP_CHEATSHEET.md](./CFN_LOOP_CHEATSHEET.md)**
   - CFN Loop quick reference
   - Loop structures and mode selection
   - Iteration limits and strategies

2. **[cfn-loop-flow-diagram.md](./cfn-loop-flow-diagram.md)**
   - Visual representation of CFN Loop
   - Loop transitions and validator coordination

3. **[cfn-loop-modes.md](./cfn-loop-modes.md)**
   - Mode comparison (MVP/Standard/Enterprise)
   - Task Mode vs CLI Mode execution and cost optimization
   - Performance and resource considerations

4. **[CFN_LOOP_TASK_MODE.md](../.claude/commands/cfn/CFN_LOOP_TASK_MODE.md)**
   - Task mode execution guide
   - Agent specialization rules
   - Adaptive validator scaling
   - Sprint workflow and backlog management

5. **[CFN_LOOP_FRONTEND.md](../.claude/commands/cfn/CFN_LOOP_FRONTEND.md)**
   - Frontend CFN Loop with visual iteration
   - Mockup integration and brand guidelines
   - Dual validation (screenshot + video)
   - Playwright integration for UI testing

### System Features
1. **[logs-features.md](./logs-features.md)**
   - Complete feature catalog
   - Configuration options
   - Performance metrics
   - Testing frameworks
   - CFN Loop forgiveness mechanisms (17 features)
   - CFN Error logging skill

2. **[additional-commands.md](./additional-commands.md)**
   - Specialized commands
   - Fullstack development tools
   - Enterprise operations

3. **CFN Loop Reliability**
   - **[../docs/CFN_FORGIVENESS_MECHANISMS_COMPLETE.md](../docs/CFN_FORGIVENESS_MECHANISMS_COMPLETE.md)** - Forgiveness implementation details
   - **[../docs/CFN_FORGIVENESS_TESTING_GUIDE.md](../docs/CFN_FORGIVENESS_TESTING_GUIDE.md)** - CLI testing guide
   - **[../docs/DOCKER_FORGIVENESS_TESTING_GUIDE.md](../docs/DOCKER_FORGIVENESS_TESTING_GUIDE.md)** - Docker testing guide
   - **[../docs/DOCKER_FORGIVENESS_IMPLEMENTATION_SUMMARY.md](../docs/DOCKER_FORGIVENESS_IMPLEMENTATION_SUMMARY.md)** - Docker implementation summary

### API and Integration
1. **[logs-api.md](./logs-api.md)**
   - REST API reference
   - MCP Server APIs
   - Web portal API

2. **[logs-slash-commands.md](./logs-slash-commands.md)**
   - Comprehensive command reference
   - CFN Loop, Docker, and agent management commands
   - Task Mode vs CLI Mode execution commands

### System Configuration
1. **[logs-hooks.md](./logs-hooks.md)**
   - Automation hooks
   - Post-edit pipeline
   - Lifecycle integration

2. **[logs-tools.md](./logs-tools.md)**
   - Complexity analysis tools
   - Simple bash analyzer (~23ms)
   - Multi-language Lizard integration
   - Automated refactoring via cyclomatic-complexity-reducer agent

3. **[logs-functions.md](./logs-functions.md)**
   - Utility functions
   - Coordination helpers
   - Performance optimization tools
   - Feedback management (CFN Loop)

4. **[logs-cli-redis.md](./logs-cli-redis.md)**
   - Redis CLI integration
   - State management patterns
   - Feedback storage (CFN Loop iterations)
   - Pub/sub messaging

### Skills Documentation
1. **Redis Coordination Skill**
   - [redis-coordination/SKILL.md](../.claude/skills/redis-coordination/SKILL.md)
   - Coordination patterns
   - Blocking primitives
   - Swarm management

2. **Agent Spawning Skill**
   - [agent-spawning/SKILL.md](../.claude/skills/agent-spawning/SKILL.md)
   - Agent lifecycle management
   - Dependency injection
   - Spawning strategies

3. **CFN Loop Validation Skill**
   - [cfn-loop-validation/SKILL.md](../.claude/skills/cfn-loop-validation/SKILL.md)
   - Consensus validation
   - Gate checking
   - Iteration management

### Indexes and Meta-Documentation
1. **[COMPONENT_INVENTORY_TABLE.md](./COMPONENT_INVENTORY_TABLE.md)**
   - Complete system inventory
   - Component categorization

2. **[COMPONENT_NPM_STATUS.md](./COMPONENT_NPM_STATUS.md)**
   - NPM package status
   - Implementation verification

3. **[CHANGELOG.md](./CHANGELOG.md)**
   - Version history
   - Release notes
   - Migration guides

### Legacy Documentation
1. **[deprecated-logs-mcp.md](./deprecated-logs-mcp.md)**
   - Historical MCP documentation
   - Migration guide to v2

2. **[legacy/readme-v1/](../legacy/readme-v1/)**
   - Complete v1 documentation archive

## Additional Resources
- **Main Configuration**: [../CLAUDE.md](../CLAUDE.md)
- **Planning Documents**: [../planning/](../planning/)
- **Test Reports**: [../reports/](../reports/)
- **Configuration Files**: [../config/](../config/)

## Migration Guidance
### From v1.x to v2.0.0
1. Update package dependencies
2. Migrate to skills-based architecture
3. Replace MCP calls with CLI/skills
4. Implement Redis coordination
5. Update agent spawning patterns
6. Verify CFN Loop configuration

### Breaking Changes
- ❌ MCP protocol removed
- ❌ Manual Task() spawning deprecated
- ❌ Implicit coordination no longer supported
- ✅ Redis BLPOP as primary coordination mechanism
- ✅ Mandatory parallel agent spawning

## Support and Community
- **Documentation Issues**: Submit GitHub issue
- **Feature Requests**: Open discussion in Discussions tab
- **Community Support**: [Community Slack Channel](https://join.slack.com/t/claude-flow/shared_invite/example)

*Last Updated: 2025-10-21 (v2.7.0 - CFN Loop Feedback Accumulation)*