# Adaptive Specialization Guide

## Overview

The Adaptive Specialization system enhances CFN Loop robustness by automatically selecting specialist agents based on feedback types and content analysis. This ensures that iteration N+1 work is performed by agents with the right expertise for addressing specific issues.

**Version:** 1.0.0  
**Last Updated:** 2025-06-17  
**Component:** CFN Loop Robustness & Validation Enhancement

---

## 🎯 Purpose

Traditional CFN Loops use the same agents across iterations, which can be inefficient when feedback requires specialized knowledge (e.g., security vulnerabilities, performance bottlenecks). Adaptive Specialization solves this by:

1. **Analyzing feedback content** to categorize issue types
2. **Mapping categories to specialist agents** with appropriate expertise
3. **Spawning specialists for iteration N+1** based on feedback analysis
4. **Maintaining backward compatibility** with default agents when no specialization is needed

---

## 🏗️ Architecture

### Core Components

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Feedback      │    │   Select-        │    │   Specialist    │
│   Analysis      │───▶│   Specialist     │───▶│   Agent         │
│   Engine        │    │   Agent Script   │    │   Registry      │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│ Feedback Text   │    │ JSON Registry    │    │ Agent Spawning  │
│ Pattern Matching│    │ with Mappings    │    │ via CLI         │
│ & Keywords      │    │ & Confidence     │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

### Data Flow

1. **Input:** Feedback text or direct feedback type from CFN Loop validators
2. **Analysis:** Text categorization using keyword patterns and severity indicators
3. **Selection:** Registry lookup for appropriate specialist agent
4. **Validation:** Confidence threshold checking and fallback logic
5. **Execution:** Specialist agent spawning for iteration N+1

---

## 📋 Specialist Registry

### Supported Specialist Types

| Specialist | Agent Name | Feedback Types | Confidence Threshold | Key Capabilities |
|------------|------------|----------------|---------------------|------------------|
| **Security** | `security-specialist` | SECURITY, CRITICAL | 0.8 | Security analysis, vulnerability assessment, authentication/authorization |
| **Performance** | `performance-specialist` | PERFORMANCE | 0.75 | Performance profiling, memory optimization, caching strategies |
| **Architecture** | `architecture-specialist` | ARCHITECTURE, WARNING | 0.7 | System design, pattern implementation, refactoring |
| **Testing** | `testing-specialist` | TESTING | 0.75 | Test design, test automation, coverage analysis |
| **Documentation** | `documentation-specialist` | DOCUMENTATION | 0.65 | Technical writing, API documentation, user guides |

### Registry Structure

```json
{
  "specialists": {
    "security": {
      "agent": "security-specialist",
      "keywords": ["security", "vulnerability", "auth", "password", ...],
      "feedback_types": ["SECURITY", "CRITICAL"],
      "capabilities": ["Security analysis", "Vulnerability assessment", ...],
      "confidence_threshold": 0.8
    }
  },
  "fallback_mappings": {
    "CRITICAL": "security",
    "WARNING": "architecture", 
    "SUGGESTION": "general"
  },
  "version": "1.0.0"
}
```

---

## 🔧 Configuration

### Environment Setup

1. **Install Dependencies:**
   ```bash
   # Ensure jq is available for JSON processing
   sudo apt-get install jq  # Ubuntu/Debian
   brew install jq         # macOS
   ```

2. **File Permissions:**
   ```bash
   chmod +x .claude/skills/redis-coordination/select-specialist-agent.sh
   chmod +x tests/test-agent-specialization.sh
   ```

3. **Registry Initialization:**
   ```bash
   # Registry is auto-created on first run
   .claude/skills/redis-coordination/select-specialist-agent.sh --help
   ```

### Custom Specialist Configuration

To add a new specialist type:

1. **Edit Registry:**
   ```bash
   # Open registry file
   nano .claude/skills/redis-coordination/specialist-registry.json
   ```

2. **Add Specialist Entry:**
   ```json
   {
     "specialists": {
       "ui-specialist": {
         "agent": "ui-specialist",
         "keywords": ["ui", "frontend", "css", "javascript", "react", "vue"],
         "feedback_types": ["UI", "FRONTEND"],
         "capabilities": ["UI design", "Frontend optimization", "Component development"],
         "confidence_threshold": 0.7
       }
     }
   }
   ```

3. **Create Agent Definition:**
   ```bash
   # Create new agent file
   nano .claude/agents/ui-specialist.md
   ```

---

## 📖 Usage Guide

### Command Line Interface

#### Basic Usage

```bash
# Direct feedback type selection
./select-specialist-agent.sh --feedback-type SECURITY --task-id "task-123"

# Automatic feedback text analysis
./select-specialist-agent.sh --feedback-text "SQL injection vulnerability found"

# Dry run (no agent spawning)
./select-specialist-agent.sh --feedback-text "Performance issue" --dry-run
```

#### Advanced Usage

```bash
# With full context
./select-specialist-agent.sh \
  --feedback-text "Memory leak detected in authentication module" \
  --task-id "auth-refactor-456" \
  --iteration 2 \
  --confidence 0.8 \
  --verbose

# Custom fallback agent
./select-specialist-agent.sh \
  --feedback-type "UNKNOWN_TYPE" \
  --default-agent "expert-dev" \
  --dry-run
```

### Integration with CFN Loop

The specialist selector integrates seamlessly with CFN Loop orchestration:

```bash
# Orchestrator calls specialist selector
SPECIALIST_RESULT=$(./select-specialist-agent.sh \
  --feedback-text "$FEEDBACK_TEXT" \
  --task-id "$TASK_ID" \
  --iteration "$((ITERATION + 1))" \
  --dry-run)

# Parse result
SELECTED_AGENT=$(echo "$SPECIALIST_RESULT" | jq -r '.selected_agent')
CONFIDENCE=$(echo "$SPECIALIST_RESULT" | jq -r '.confidence')

# Spawn specialist if confidence is sufficient
if (( $(echo "$CONFIDENCE >= 0.7" | bc -l) )); then
  npx claude-flow-novice spawn agent "$SELECTED_AGENT" \
    --task-id "$TASK_ID" \
    --iteration "$((ITERATION + 1))"
fi
```

---

## 🎯 Feedback Categorization

### Automatic Text Analysis

The system analyzes feedback text using pattern matching:

#### Security Indicators
```bash
# Keywords: security, vulnerability, auth, password, token, injection, xss, csrf
"SQL injection vulnerability in login form" → SECURITY
"Authentication token is not validated" → SECURITY
"XSS attack possible in user input" → SECURITY
```

#### Performance Indicators
```bash
# Keywords: performance, slow, memory, leak, cpu, optimization, cache
"Memory leak detected in service" → PERFORMANCE
"Database query is too slow" → PERFORMANCE
"High CPU usage during processing" → PERFORMANCE
```

#### Architecture Indicators
```bash
# Keywords: architecture, design, pattern, structure, modular, coupling
"Tight coupling between components" → ARCHITECTURE
"Needs better separation of concerns" → ARCHITECTURE
"Refactor to use singleton pattern" → ARCHITECTURE
```

#### Testing Indicators
```bash
# Keywords: test, testing, coverage, unit, integration, e2e, tdd
"Unit test coverage is below 80%" → TESTING
"Missing integration tests for API" → TESTING
"Implement test-driven development" → TESTING
```

#### Documentation Indicators
```bash
# Keywords: documentation, doc, readme, guide, manual, comment
"API documentation is incomplete" → DOCUMENTATION
"Code comments are missing" → DOCUMENTATION
"User guide needs updating" → DOCUMENTATION
```

### Severity-Based Fallback

When explicit categorization fails, severity indicators guide selection:

```bash
"CRITICAL: System crashes" → SECURITY (specialist for critical issues)
"WARNING: Potential risk" → ARCHITECTURE (specialist for warnings)
"SUGGESTION: Consider refactoring" → GENERAL (default for suggestions)
```

---

## 🔄 Integration Patterns

### CFN Loop Integration

#### Pattern 1: Post-Consensus Specialization

```bash
# After Loop 2 consensus, analyze feedback
FEEDBACK_TEXT=$(redis-cli lrange "swarm:${TASK_ID}:feedback" 0 -1 | tr '\n' ';')

# Select specialist for iteration N+1
SPECIALIST_AGENT=$(./select-specialist-agent.sh \
  --feedback-text "$FEEDBACK_TEXT" \
  --task-id "$TASK_ID" \
  --iteration "$((ITERATION + 1))" \
  --dry-run | jq -r '.selected_agent')

# Spawn specialist for next iteration
npx claude-flow-novice spawn agent "$SPECIALIST_AGENT" \
  --task-id "$TASK_ID" \
  --iteration "$((ITERATION + 1))"
```

#### Pattern 2: Feedback-Type Routing

```bash
# Route feedback to specific specialists
case "$FEEDBACK_TYPE" in
  "SECURITY"|"CRITICAL")
    AGENT="security-specialist"
    ;;
  "PERFORMANCE")
    AGENT="performance-specialist"
    ;;
  "ARCHITECTURE"|"WARNING")
    AGENT="architecture-specialist"
    ;;
  *)
    AGENT="general-dev"
    ;;
esac

npx claude-flow-novice spawn agent "$AGENT" \
  --task-id "$TASK_ID" \
  --iteration "$((ITERATION + 1))"
```

### Orchestrator Integration

The specialist selector is designed to work with the CFN Loop orchestrator:

```bash
# In orchestrate-cfn-loop.sh
select_and_spawn_specialist() {
  local task_id="$1"
  local iteration="$2"
  local feedback_text="$3"
  
  # Get specialist recommendation
  local specialist_result=$(./select-specialist-agent.sh \
    --feedback-text "$feedback_text" \
    --task-id "$task_id" \
    --iteration "$iteration" \
    --dry-run)
  
  # Extract agent information
  local selected_agent=$(echo "$specialist_result" | jq -r '.selected_agent')
  local confidence=$(echo "$specialist_result" | jq -r '.confidence')
  
  # Spawn specialist if confidence threshold met
  if (( $(echo "$confidence >= 0.7" | bc -l) )); then
    log "Spawning specialist: $selected_agent (confidence: $confidence)"
    npx claude-flow-novice spawn agent "$selected_agent" \
      --task-id "$task_id" \
      --iteration "$iteration"
  else
    log "Confidence too low ($confidence), using default agent"
    npx claude-flow-novice spawn agent "general-dev" \
      --task-id "$task_id" \
      --iteration "$iteration"
  fi
}
```

---

## 🧪 Testing

### Running Tests

```bash
# Run full test suite
./tests/test-agent-specialization.sh

# Run specific test categories
./tests/test-agent-specialization.sh | grep "Direct feedback"
./tests/test-agent-specialization.sh | grep "Text analysis"
```

### Test Coverage

The test suite validates:

1. **Direct Feedback Type Selection** (5 tests)
   - SECURITY → security-specialist
   - PERFORMANCE → performance-specialist
   - ARCHITECTURE → architecture-specialist
   - TESTING → testing-specialist
   - DOCUMENTATION → documentation-specialist

2. **Feedback Text Analysis** (7 tests)
   - Security-related text patterns
   - Performance-related text patterns
   - Architecture-related text patterns
   - Testing-related text patterns
   - Documentation-related text patterns
   - Critical issue fallback mapping
   - Warning fallback mapping

3. **Registry Functionality** (3 tests)
   - Registry file creation
   - JSON validity
   - Specialist count validation

4. **Fallback Mechanisms** (3 tests)
   - Unknown feedback type handling
   - Empty feedback text handling
   - Low confidence threshold handling

5. **Command Line Interface** (3 tests)
   - Help flag functionality
   - Invalid argument rejection
   - Missing argument validation

6. **Integration Scenarios** (3 tests)
   - Task ID and iteration handling
   - Confidence threshold logic
   - Verbose output mode

7. **Edge Cases** (3 tests)
   - Case insensitivity
   - Special character handling
   - Long text handling

8. **Output Format** (5+ tests)
   - Valid JSON output
   - Required fields presence

### Expected Test Results

```
Test Summary
========================================
Total Tests: 32
Passed: 32
Failed: 0
Success Rate: 100%

🎉 ALL TESTS PASSED! 🎉
Agent specialization system is fully functional
```

---

## 🔧 Troubleshooting

### Common Issues

#### Issue: Specialist Not Found
```bash
Error: No specialist found for feedback type 'UNKNOWN_TYPE'
```

**Solution:** Check the specialist registry and fallback mappings:
```bash
# Verify registry exists
ls -la .claude/skills/redis-coordination/specialist-registry.json

# Check registry content
jq '.specialists | keys' .claude/skills/redis-coordination/specialist-registry.json

# Use default agent explicitly
./select-specialist-agent.sh --feedback-type UNKNOWN_TYPE --default-agent general-dev
```

#### Issue: JSON Parsing Errors
```bash
Error: Invalid JSON in specialist registry
```

**Solution:** Validate and fix registry JSON:
```bash
# Validate JSON
jq empty .claude/skills/redis-coordination/specialist-registry.json

# If corrupted, recreate registry
rm .claude/skills/redis-coordination/specialist-registry.json
./select-specialist-agent.sh --help  # Recreates registry
```

#### Issue: Agent Spawning Fails
```bash
Error: Failed to spawn specialist agent
```

**Solution:** Check agent availability and CLI installation:
```bash
# Check if agent exists
ls -la .claude/agents/security-specialist.md

# Check CLI installation
npx claude-flow-novice --help

# Test agent spawning manually
npx claude-flow-novice spawn agent security-specialist --task-id test-123
```

#### Issue: Low Confidence Selection
```bash
Warning: Confidence score (0.6) below threshold (0.7), using default agent
```

**Solution:** Adjust confidence thresholds or feedback analysis:
```bash
# Lower confidence threshold
./select-specialist-agent.sh --feedback-text "Minor issue" --confidence 0.5

# Use more specific feedback text
./select-specialist-agent.sh --feedback-text "SECURITY: Authentication bypass vulnerability"
```

### Debug Mode

Enable verbose output for troubleshooting:
```bash
./select-specialist-agent.sh \
  --feedback-text "Your feedback here" \
  --verbose \
  --dry-run
```

### Log Analysis

Check test logs for detailed information:
```bash
# View test results
cat tests/results/test-report.md

# Check test log
cat tests/results/agent-specialization-test.log
```

---

## 📈 Performance Considerations

### Optimization Strategies

1. **Registry Caching:** The specialist registry is loaded once per execution
2. **Pattern Matching:** Uses efficient grep-based text analysis
3. **JSON Processing:** Leverages jq for fast JSON operations
4. **Lazy Loading:** Agents are spawned only when needed

### Benchmarks

- **Text Analysis:** <10ms for typical feedback (100-500 chars)
- **Registry Lookup:** <5ms for JSON parsing and matching
- **Agent Spawning:** 1-3 seconds depending on agent complexity
- **Total Selection Time:** <50ms (excluding agent spawn)

---

## 🔄 Backward Compatibility

The adaptive specialization system maintains full backward compatibility:

### Default Agent Fallback
- When no specialist match is found, falls back to default agent
- Existing CFN Loop workflows continue to work unchanged
- Gradual adoption possible - can enable per-task or per-project

### Configuration Options
```bash
# Disable specialization (use default behavior)
export CFN_SPECIALIZATION_ENABLED=false

# Use custom default agent
export CFN_DEFAULT_AGENT=expert-dev

# Adjust confidence threshold globally
export CFN_CONFIDENCE_THRESHOLD=0.8
```

### Migration Path
1. **Phase 1:** Install specialist selector alongside existing workflow
2. **Phase 2:** Enable in dry-run mode to observe selections
3. **Phase 3:** Gradually enable for specific task types
4. **Phase 4:** Full deployment across all CFN Loops

---

## 🔮 Future Enhancements

### Planned Features

1. **Machine Learning Classification:** Advanced NLP for feedback categorization
2. **Dynamic Specialist Registry:** Runtime specialist registration
3. **Performance-Based Selection:** Agent performance history influencing selection
4. **Multi-Specialist Coordination:** Multiple specialists for complex issues
5. **Feedback Loop Learning:** Continuous improvement of selection accuracy

### Extension Points

```bash
# Custom analysis plugins
export CFN_ANALYSIS_PLUGIN=/path/to/custom-analyzer.sh

# External specialist registry
export CFN_REGISTRY_URL=https://registry.example.com/specialists.json

# Integration with agent marketplaces
export CFN_AGENT_MARKETPLACE=https://agents.example.com/api
```

---

## 📚 Reference

### Quick Reference Commands

```bash
# Select specialist for security issue
./select-specialist-agent.sh --feedback-type SECURITY --task-id task-123

# Analyze feedback text automatically  
./select-specialist-agent.sh --feedback-text "Performance bottleneck in database"

# Dry run with verbose output
./select-specialist-agent.sh --feedback-text "Memory leak" --dry-run --verbose

# Run test suite
./tests/test-agent-specialization.sh

# View test report
cat tests/results/test-report.md
```

### File Locations

- **Specialist Selector:** `.claude/skills/redis-coordination/select-specialist-agent.sh`
- **Specialist Registry:** `.claude/skills/redis-coordination/specialist-registry.json`
- **Test Suite:** `tests/test-agent-specialization.sh`
- **Test Results:** `tests/results/`
- **Documentation:** `docs/ADAPTIVE_SPECIALIZATION_GUIDE.md`

### Support

For issues or questions:

1. Check the troubleshooting section above
2. Run the test suite to validate functionality
3. Review test logs for detailed error information
4. Consult the CFN Loop documentation for integration details

---

## 📄 License

This adaptive specialization system is part of the CFN Loop Robustness & Validation Enhancement and follows the same licensing terms as the Claude Flow Novice project.

---

**Last Updated:** 2025-06-17  
**Document Version:** 1.0.0  
**Component:** Adaptive Specialization System