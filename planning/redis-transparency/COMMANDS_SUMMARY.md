# Redis Transparency Enhancement - Commands Summary

## Epic Execution Commands

### Execute Complete Epic
```bash
# Execute full 4-phase epic with autonomous CFN Loop coordination
/cfn-loop-epic '/mnt/c/Users/masha/Documents/claude-flow-novice/planning/redis-transparency/epic-config.json'
```

### Execute Individual Sprint
```bash
# Sprint 1: Enhanced Message Structure Foundation
/cfn-loop-sprints "Redis transparency sprint 1: Message foundation" \
  --sprint-config=planning/redis-transparency/sprint-plan.json \
  --sprint-id=sprint-1-message-foundation \
  --mode=standard

# Sprint 2: Interactive Observation System
/cfn-loop-sprints "Redis transparency sprint 2: Interactive observation" \
  --sprint-config=planning/redis-transparency/sprint-plan.json \
  --sprint-id=sprint-2-interactive-system \
  --mode=standard

# Sprint 3: Enhanced Dashboard Integration
/cfn-loop-sprints "Redis transparency sprint 3: Dashboard integration" \
  --sprint-config=planning/redis-transparency/sprint-plan.json \
  --sprint-id=sprint-3-dashboard-integration \
  --mode=standard

# Sprint 4: Advanced Features
/cfn-loop-sprints "Redis transparency sprint 4: Advanced features" \
  --sprint-config=planning/redis-transparency/sprint-plan.json \
  --sprint-id=sprint-4-advanced-features \
  --mode=standard
```

### Parse Epic Configuration
```bash
# Parse epic configuration for CFN mode auto-detection
/parse-epic ./planning/redis-transparency/epic-config.json --cfn-mode=standard
```

### Update Documentation
```bash
# Generate documentation after epic completion
/cfn-loop-document --epic=redis-transparency-enhancement
```

---

## Transparency System Commands (Post-Implementation)

### Launch Transparency Dashboard
```bash
# Launch the Redis transparency web dashboard
/transparency

# Launch with specific configuration
/transparency --mode=standard --refresh-rate=1000
```

### Agent Observation Commands
```bash
# Query specific agent state
/agent-observe coder-1 --state

# Get agent activity history
/agent-observe coder-1 --activity --limit=50

# Monitor agent progress
/agent-observe coder-1 --progress --real-time

# Query all active agents
/agent-observe --all --summary
```

### Agent Intervention Commands
```bash
# Pause agent execution
/agent-intervene coder-1 --action=pause --reason="Debugging required"

# Resume agent execution
/agent-intervene coder-1 --action=resume

# Redirect agent focus
/agent-intervene coder-1 --action=redirect --target="src/auth/rate-limiting.js"

# Get intervention suggestions
/agent-intervene coder-1 --action=suggest
```

### Redis Transparency Monitoring
```bash
# Monitor transparency channels
redis-cli subscribe "swarm:agent:progress"
redis-cli subscribe "swarm:agent:tool-usage"
redis-cli subscribe "swarm:agent:reasoning"

# Query agent state via Redis
redis-cli get "agent:coder-1:state"
redis-cli get "agent:coder-1:progress"

# Monitor transparency performance
redis-cli get "transparency:performance:metrics"
```

### CLI Integration Commands
```bash
# Check transparency system status
node src/cli/commands/transparency.js --status

# Generate transparency report
node src/cli/commands/transparency.js --report --format=json

# Validate transparency configuration
node src/cli/commands/transparency.js --validate

# Export transparency data
node src/cli/commands/transparency.js --export --output=transparency-data.json
```

---

## Development Commands

### Build and Test Transparency System
```bash
# Build transparency components
npm run build:transparency

# Run transparency tests
npm test -- --grep="transparency"

# Run performance benchmarks
npm run benchmark:transparency

# Validate transparency implementation
npm run validate:transparency
```

### Redis Development Commands
```bash
# Start Redis for transparency development
redis-server --port 6379 --appendonly yes

# Monitor Redis transparency channels
redis-cli monitor | grep "swarm:agent"

# Clean up transparency data
redis-cli --scan --pattern "transparency:*" | xargs redis-cli del
redis-cli --scan --pattern "agent:*" | xargs redis-cli del
```

### Dashboard Development
```bash
# Start transparency dashboard in development
npm run dev:dashboard

# Build dashboard for production
npm run build:dashboard

# Test dashboard functionality
npm run test:dashboard

# Deploy dashboard
npm run deploy:dashboard
```

---

## Configuration Commands

### Transparency Configuration
```bash
# Set transparency level (minimal, standard, detailed, verbose)
node src/config/transparency-config.js set level standard

# Configure performance thresholds
node src/config/transparency-config.js set response-time-threshold 500

# Enable/disable features
node src/config/transparency-config.js enable predictive-modeling
node src/config/transparency-config.js disable anomaly-detection

# Validate configuration
node src/config/transparency-config.js validate
```

### Redis Configuration
```bash
# Configure Redis for transparency
redis-cli CONFIG SET timeout 3600
redis-cli CONFIG SET maxmemory 2gb
redis-cli CONFIG SET maxmemory-policy allkeys-lru

# Set up transparency pub/sub channels
redis-cli PUBLISH "transparency:config" '{"level": "standard", "real-time": true}'
```

---

## Monitoring and Debugging Commands

### System Monitoring
```bash
# Monitor transparency system performance
/performance --component=transparency

# Check system health
/health:check transparency

# Monitor memory usage
/memory:usage transparency

# View active transparency channels
redis-cli PUBSUB CHANNELS "swarm:*"
```

### Debugging Commands
```bash
# Debug transparency system
node src/debug/transparency-debug.js --verbose

# Check Redis connectivity
node src/debug/redis-connection-check.js

# Validate message schemas
node src/debug/schema-validator.js --schema=transparency

# Test API endpoints
node src/debug/api-test.js --endpoint=/api/v1/agents/state
```

### Log Analysis
```bash
# View transparency logs
tail -f logs/transparency.log

# Filter logs by agent
grep "agent:coder-1" logs/transparency.log

# Analyze performance logs
node src/analysis/performance-analyzer.js --source=logs/transparency.log

# Generate transparency report
node src/analysis/report-generator.js --type=transparency --format=html
```

---

## Integration Commands

### CFN Loop Integration
```bash
# Check epic progress
mcp__claude-flow-novice__memory_usage retrieve --namespace=epic-progress --key=redis-transparency-enhancement

# View phase results
mcp__claude-flow-novice__memory_usage retrieve --namespace=phase-results --key=phase-*

# Validate epic completion
/cfn-loop-validate --epic=redis-transparency-enhancement
```

### Git Integration
```bash
# Commit transparency implementation
/github-commit --chat --message="feat: Complete Redis Transparency Enhancement Epic"

# Create documentation PR
/github-pr create --title="Documentation: Redis Transparency Enhancement" --body="Add comprehensive transparency system documentation"

# Tag epic completion
git tag -a v1.0.0-transparency -m "Redis Transparency Enhancement Epic Complete"
git push origin v1.0.0-transparency
```

---

## Quick Reference

### Epic Execution Flow
1. **Parse Epic**: `/parse-epic ./planning/redis-transparency/epic-config.json`
2. **Execute Epic**: `/cfn-loop-epic './planning/redis-transparency/epic-config.json'`
3. **Document Results**: `/cfn-loop-document --epic=redis-transparency-enhancement`

### Daily Operations
1. **Launch Dashboard**: `/transparency`
2. **Monitor Agents**: `/agent-observe --all --summary`
3. **Intervene if Needed**: `/agent-intervene <agent-id> --action=<action>`
4. **Check Performance**: `/performance --component=transparency`

### Development Workflow
1. **Build**: `npm run build:transparency`
2. **Test**: `npm test -- --grep="transparency"`
3. **Validate**: `npm run validate:transparency`
4. **Deploy**: `npm run deploy:dashboard`

This command summary provides comprehensive reference for executing, monitoring, and maintaining the Redis Transparency Enhancement system.