---
description: "Execute container-based CFN Loop in Task mode for debugging, development, and learning with full visibility"
argument-hint: "[task-description] --mode=mvp|standard|enterprise --debug --verbose"
allowed-tools: ["Bash", "Read", "TodoWrite", "Task"]
---

# CFN Docker Loop Task - Development & Debugging Mode

Execute container-based CFN Loop in Task mode for development, debugging, and learning with full visibility into agent execution and decision-making processes.

**Task Description:** $ARGUMENTS

## When to Use Task Mode

### 🐛 Development and Debugging
- **Code Development**: When building and testing new features
- **Bug Investigation**: When debugging issues in existing code
- **Algorithm Testing**: When testing new approaches or algorithms
- **Integration Testing**: When testing system integrations

### 📚 Learning and Training
- **CFN Loop Education**: When learning how CFN Loop works
- **Agent Behavior Study**: When studying agent decision-making
- **Tool Usage Training**: When learning to use specialized tools
- **Best Practice Learning**: When understanding development patterns

### 🔍 Analysis and Investigation
- **Code Review**: When performing detailed code analysis
- **Architecture Review**: When evaluating system design
- **Performance Analysis**: When investigating performance issues
- **Security Analysis**: When conducting security assessments

### 🧪 Experimentation
- **Prototype Development**: When building quick prototypes
- **Proof of Concepts**: When validating technical approaches
- **Tool Testing**: When evaluating new tools or libraries
- **Workflow Optimization**: When testing new development workflows

## Key Differences from CLI Mode

| Feature | Task Mode | CLI Mode |
|---------|-----------|----------|
| **Agent Spawning** | Main Chat spawns all agents via Task() | Coordinator spawns via CLI |
| **Cost** | $0.150/iteration (higher) | $0.054/iteration (95% savings) |
| **Visibility** | Full agent output visible | Coordinator summary only |
| **Debugging** | Complete agent transparency | Limited debugging info |
| **Performance** | Slower due to Main Chat overhead | Faster CLI execution |
| **Use Case** | Development, learning, debugging | Production, cost-sensitive |

## Usage Examples

### Basic Development Tasks
```bash
# Simple development task
/cfn-docker-loop-task "Fix authentication bug in login service"

# Standard complexity task
/cfn-docker-loop-task "Implement user registration with email verification" --mode=standard

# Complex development task
/cfn-docker-loop-task "Build complete microservice with database integration" --mode=enterprise
```

### Debugging and Investigation
```bash
# Debug with full visibility
/cfn-docker-loop-task "Investigate memory leak in data processing module" --debug --verbose

# Code review and analysis
/cfn-docker-loop-task "Review and optimize database query performance" --mode=standard

# Security investigation
/cfn-docker-loop-task "Analyze security vulnerabilities in authentication system" --mode=enterprise --security-focus
```

### Learning and Training
```bash
# Learn CFN Loop process
/cfn-docker-loop-task "Build a simple todo API to understand CFN Loop" --mode=mvp --learning-mode

# Study agent behavior
/cfn-docker-loop-task "Compare frontend vs backend approaches to user authentication" --mode=standard --agent-study

# Tool usage training
/cfn-docker-loop-task "Practice using Playwright for automated testing" --tools=playwright --verbose
```

### Experimentation and Prototyping
```bash
# Quick prototype
/cfn-docker-loop-task "Prototype real-time chat with WebSockets" --mode=mvp --experimental

# Technology evaluation
/cfn-docker-loop-task "Evaluate GraphQL vs REST for new API" --mode=standard --tech-evaluation

# Workflow testing
/cfn-docker-loop-task "Test new development workflow with automated testing" --mode=enterprise --workflow-test
```

## Command Options

### Core Options
```bash
# Basic execution
/cfn-docker-loop-task "Task description"

# Mode selection
/cfn-docker-loop-task "Task description" --mode=standard|mvp|enterprise

# Debugging options
/cfn-docker-loop-task "Task description" --debug --verbose --step-by-step

# Resource constraints
/cfn-docker-loop-task "Task description" --memory-limit=2g --timeout=3600
```

### Learning and Analysis Options
```bash
# Educational mode
/cfn-docker-loop-task "Task description" --learning-mode --explain-decisions

# Agent behavior study
/cfn-docker-loop-task "Task description" --agent-study --track-reasoning

# Tool usage analysis
/cfn-docker-loop-task "Task description" --tool-analysis --track-usage

# Performance analysis
/cfn-docker-loop-task "Task description" --performance-analysis --resource-tracking
```

### Experimentation Options
```bash
# Experimental features
/cfn-docker-loop-task "Task description" --experimental --allow-risky-operations

# Prototyping mode
/cfn-docker-loop-task "Task description" --prototype --rapid-iteration

# Technology comparison
/cfn-docker-loop-task "Task description" --tech-comparison --compare-approaches

# Workflow testing
/cfn-docker-loop-task "Task description" --workflow-test --process-analysis
```

### Advanced Debugging
```bash
# Step-by-step execution
/cfn-docker-loop-task "Task description" --step-by-step --pause-between-loops

# Detailed agent logging
/cfn-docker-loop-task "Task description" --agent-logging --full-context

# Error injection testing
/cfn-docker-loop-task "Task description" --error-injection --failure-analysis

# Resource monitoring
/cfn-docker-loop-task "Task description" --resource-monitoring --real-time-stats
```

## Development Workflow Examples

### 1. Bug Fixing Workflow
```bash
# Start with bug investigation
/cfn-docker-loop-task "Investigate login redirect issue after authentication" \
  --mode=standard \
  --debug \
  --verbose

# Follow up with fix implementation
/cfn-docker-loop-task "Fix authentication redirect loop in session handling" \
  --mode=standard \
  --learning-mode

# Validate the fix
/cfn-docker-loop-task "Test authentication flow with multiple user scenarios" \
  --mode=standard \
  --comprehensive-testing
```

### 2. Feature Development Workflow
```bash
# Analyze requirements
/cfn-docker-loop-task "Analyze requirements for user profile management system" \
  --mode=standard \
  --requirements-analysis

# Design and implement
/cfn-docker-loop-task "Implement user profile system with avatar upload and privacy settings" \
  --mode=enterprise \
  --step-by-step

# Test and validate
/cfn-docker-loop-task "Create comprehensive test suite for user profile functionality" \
  --mode=standard \
  --testing-focus
```

### 3. Learning Workflow
```bash
# Learn basic concepts
/cfn-docker-loop-task "Build a simple REST API to understand backend development patterns" \
  --mode=mvp \
  --learning-mode \
  --explain-decisions

# Advance to more complex topics
/cfn-docker-loop-task "Extend REST API with database integration and authentication" \
  --mode=standard \
  --learning-mode \
  --track-reasoning

# Study best practices
/cfn-docker-loop-task "Refactor API to follow industry best practices and security standards" \
  --mode=standard \
  --best-practices-focus \
  --code-quality-analysis
```

## Debugging Features

### Agent Transparency
- **Full Agent Output**: See everything agents think and do
- **Decision Process**: Understand why agents make specific choices
- **Tool Usage**: Track which tools agents use and how
- **Confidence Scoring**: See how confident agents are in their work

### Step-by-Step Execution
```bash
# Execute with detailed step tracking
/cfn-docker-loop-task "Task description" \
  --step-by-step \
  --pause-between-loops \
  --decision-analysis
```

### Error Analysis
```bash
# Investigate failures with detailed analysis
/cfn-docker-loop-task "Task description" \
  --error-analysis \
  --failure-injection \
  --recovery-strategies
```

### Performance Monitoring
```bash
# Monitor performance in real-time
/cfn-docker-loop-task "Task description" \
  --performance-monitoring \
  --resource-tracking \
  --timing-analysis
```

## Learning Features

### Educational Mode
```bash
# Learn with explanations
/cfn-docker-loop-task "Build a web scraper" \
  --learning-mode \
  --explain-decisions \
  --concept-explanations
```

### Agent Behavior Study
```bash
# Study how different agents approach problems
/cfn-docker-loop-task "Compare frontend vs backend approaches to data visualization" \
  --agent-study \
  --comparative-analysis \
  --approach-explanation
```

### Tool Usage Analysis
```bash
# Understand how agents use specialized tools
/cfn-docker-loop-task "Create automated tests using Playwright" \
  --tool-analysis \
  --track-usage \
  --technique-demonstration
```

## Experimentation Features

### Rapid Prototyping
```bash
# Build quick prototypes with iterative feedback
/cfn-docker-loop-task "Prototype real-time collaboration feature" \
  --prototype \
  --rapid-iteration \
  --feedback-driven
```

### Technology Comparison
```bash
# Compare different technical approaches
/cfn-docker-loop-task "Compare GraphQL vs REST for API design" \
  --tech-comparison \
  --implement-both \
  --comparative-analysis
```

### Workflow Testing
```bash
# Test new development workflows
/cfn-docker-loop-task "Test test-driven development workflow" \
  --workflow-test \
  --process-analysis \
  --efficiency-measurement
```

## Advanced Usage Patterns

### Multi-Agent Coordination Study
```bash
# Study how agents coordinate complex tasks
/cfn-docker-loop-task "Build a complete e-commerce checkout flow" \
  --mode=enterprise \
  --coordination-study \
  --communication-analysis \
  --decision-tracking
```

### Security Analysis
```bash
# Security-focused development and analysis
/cfn-docker-loop-task "Implement secure payment processing with PCI compliance" \
  --mode=enterprise \
  --security-focus \
  --vulnerability-analysis \
  --compliance-checking
```

### Performance Optimization
```bash
# Performance-focused development
/cfn-docker-loop-task "Optimize database queries for large-scale data processing" \
  --mode=standard \
  --performance-optimization \
  --benchmarking \
  --profiling
```

## Best Practices for Task Mode

### Development Best Practices
1. **Start with Clear Requirements**: Define specific, measurable goals
2. **Use Learning Mode**: When exploring new technologies or patterns
3. **Enable Verbose Logging**: For complete visibility into agent decisions
4. **Iterate incrementally**: Build complexity gradually
5. **Review Agent Outputs**: Understand how agents approach problems

### Debugging Best Practices
1. **Isolate the Problem**: Focus on specific issues first
2. **Use Step-by-Step Mode**: For detailed problem analysis
3. **Enable Error Injection**: Test error handling and recovery
4. **Track Resource Usage**: Monitor memory and performance
5. **Document Findings**: Keep track of discoveries and solutions

### Learning Best Practices
1. **Choose Appropriate Complexity**: Start simple and build up
2. **Use Explanatory Modes**: Leverage decision explanations
3. **Experiment with Different Agents**: Compare approaches
4. **Focus on Patterns**: Look for recurring patterns and best practices
5. **Practice Regularly**: Build skills through consistent practice

### Experimentation Best Practices
1. **Define Clear Hypotheses**: Know what you're testing
2. **Use Prototyping Mode**: For rapid iteration and feedback
3. **Compare Approaches**: Implement multiple solutions when possible
4. **Measure Results**: Track performance and quality metrics
5. **Document Experiments**: Keep records of what works and what doesn't

## Monitoring and Analysis

### Agent Performance Analysis
```bash
# Track how agents perform over time
/cfn-docker-loop-task "Task description" \
  --agent-performance-tracking \
  --efficiency-analysis \
  --quality-measurement
```

### Decision Quality Assessment
```bash
# Analyze the quality of agent decisions
/cfn-docker-loop-task "Task description" \
  --decision-quality-analysis \
  --outcome-tracking \
  --improvement-suggestions
```

### Resource Usage Optimization
```bash
# Optimize resource usage patterns
/cfn-docker-loop-task "Task description" \
  --resource-optimization \
  --usage-analysis \
  --efficiency-recommendations
```

## Integration with Development Tools

### IDE Integration
```bash
# Generate IDE-friendly configurations
/cfn-docker-loop-task "Set up development environment for new project" \
  --ide-integration \
  --config-generation \
  --environment-setup
```

### Testing Integration
```bash
# Integrate with testing frameworks
/cfn-docker-loop-task "Create comprehensive test suite for existing application" \
  --testing-integration \
  --framework-setup \
  --coverage-analysis
```

### Documentation Generation
```bash
# Generate documentation while developing
/cfn-docker-loop-task "Implement API with automatic documentation generation" \
  --documentation-generation \
  --api-docs \
  --code-examples
```

## Configuration for Development

### Development Environment Setup
```bash
# Enable development-specific features
export CFN_DOCKER_DEVELOPMENT_MODE=true
export CFN_DOCKER_DEBUG_LEVEL=verbose
export CFN_DOCKER_AGENT_LOGGING=detailed
export CFN_DOCKER_STEP_TIMEOUT=300
```

### Learning Mode Configuration
```bash
# Optimize for learning and education
export CFN_DOCKER_LEARNING_MODE=true
export CFN_DOCKER_EXPLAIN_DECISIONS=true
export CFN_DOCKER_SHOW_REASONING=true
export CFN_DOCKER_EDUCATIONAL_COMMENTS=true
```

### Experimental Features
```bash
# Enable experimental capabilities
export CFN_DOCKER_EXPERIMENTAL_MODE=true
export CFN_DOCKER_ALLOW_RISKY_OPERATIONS=true
export CFN_DOCKER_BETA_FEATURES=true
export CFN_DOCKER_INNOVATION_MODE=true
```

## Troubleshooting Task Mode Issues

### Common Development Issues
1. **Agent Confusion**: When agents misunderstand requirements
   - Solution: Use more specific task descriptions and learning mode
2. **Tool Usage Problems**: When agents struggle with specialized tools
   - Solution: Use tool-analysis mode and provide examples
3. **Quality Variations**: When code quality is inconsistent
   - Solution: Enable step-by-step mode and review each iteration

### Performance Issues
1. **Slow Execution**: When tasks take too long
   - Solution: Use performance monitoring and resource optimization
2. **Memory Usage**: When memory consumption is high
   - Solution: Enable resource tracking and adjust limits
3. **Timeout Issues**: When agents timeout on complex tasks
   - Solution: Increase timeouts or break down tasks

### Learning Challenges
1. **Concept Understanding**: When agents don't grasp new concepts
   - Solution: Use learning mode with detailed explanations
2. **Pattern Recognition**: When agents miss important patterns
   - Solution: Use agent-study mode with comparative analysis
3. **Best Practice Application**: When agents don't follow best practices
   - Solution: Use best-practices-focus mode with code quality analysis

Task mode provides unparalleled visibility into the CFN Loop process, making it ideal for development, learning, and debugging scenarios where understanding agent behavior and decision-making is more important than cost optimization.