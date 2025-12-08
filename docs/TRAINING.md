# Training and Onboarding

Consolidated training materials for CFN platform users and operators.

## Team Onboarding (1 Day)

Prerequisites: Basic git, Docker, CI/CD familiarity

### Morning Session (3 hours)

1. CFN Platform Introduction (60 min)
- What is CFN? AI agent orchestration platform
- Benefits: Automated code generation, self-validating loops, cost optimization
- Architecture: Task → CFN Loop → Agents → Code/Tests → Validation → Delivery

2. Getting Started (90 min)
- Access setup: Platform access, Slack channels, documentation location
- First CFN Loop: Execute simple task, monitor progress, review results
- Agent types: backend, frontend, tester, validator, product-owner, devops, security

3. Hands-on Exercise (30 min)
# Execute simple task
/cfn-loop-cli "Create hello-world.py with greeting" --mode=standard

# Monitor progress
watch -n 5 'docker ps | grep cfn'

# Review results
cat hello-world.py

### Afternoon Session (4 hours)

1. Advanced Features (90 min)
- Mode selection: CLI (production) vs Task (debugging)
- Provider routing: cost vs quality trade-offs
- Custom skills development

2. Best Practices (60 min)
- Task formulation: Clear, specific requirements
- Success criteria definition
- Error handling patterns

3. Team Scenarios (90 min)
- Feature development workflow
- Bug fixing procedures
- Code review processes

## Operator Training (2 Days)

### Day 1: System Operations

1. Architecture Deep Dive
- Service components and interactions
- Data flow and coordination patterns
- Security model and isolation

2. Deployment Procedures
- Environment setup
- Service installation
- Configuration management
- Health verification

3. Monitoring and Alerting
- Key metrics dashboard
- Alert configuration
- Log aggregation
- Performance tuning

### Day 2: Advanced Operations

1. Troubleshooting
- Common issues and solutions
- Debugging techniques
- Root cause analysis
- Incident response

2. Maintenance
- Daily/weekly/monthly tasks
- Backup procedures
- Disaster recovery
- Capacity planning

3. Security
- Access control
- Audit procedures
- Security scanning
- Compliance requirements

## Core Skills Development

### 1. Task Formulation

Good Task Example:
"Create a REST API endpoint POST /api/users that:
- Validates email format
- Checks for duplicate emails
- Returns 201 with user object
- Handles errors with proper status codes
- Includes unit tests with 90% coverage"

Poor Task Example:
"Add user management"

### 2. Agent Selection

Understanding which agents to use:
- Backend-developer: Server-side logic, databases, APIs
- Frontend-developer: UI components, user experience
- Tester: Test creation, validation, quality assurance
- Validator: Code review, best practices verification
- Product-owner: Requirements validation, acceptance decisions
- Devops-specialist: Infrastructure, deployment, CI/CD
- Security-specialist: Vulnerability assessment, security review

### 3. Quality Gates

Loop 3 Gate (Implementation):
- Must pass tests based on mode:
  - MVP: ≥70% pass rate
  - Standard: ≥95% pass rate
  - Enterprise: ≥98% pass rate

Loop 2 Consensus (Validation):
- Validators review and score work
- Consensus thresholds by mode:
  - MVP: ≥80% agreement
  - Standard: ≥90% agreement
  - Enterprise: ≥95% agreement

### 4. Error Recovery

Common Patterns:
- Timeouts: Increase timeout or optimize code
- Failures: Check logs, fix issues, retry
- Quality gates: Iterate on implementation
- Consensus failure: Address validator concerns

## Advanced Training Topics

### 1. Custom Agent Development

Creating specialized agents:
class CustomAgent extends BaseAgent {
  readonly agentType = "custom-specialist";
  readonly capabilities = ["specialized-task"];
  
  async execute(context: TaskContext): Promise<AgentResult> {
    // Custom implementation
  }
}

### 2. Skill Creation

Develop reusable skills:
#!/bin/bash
# SKILL_NAME: "custom-analysis"
# OUTPUT_FORMAT: "json"
# REQUIRED_ENVIRONMENT: ["INPUT_PATH"]
set -euo pipefail

# Custom logic
result=$(analyze "$INPUT_PATH")

# Return structured output
echo "{\"result\": \"$result\"}"

### 3. Integration Patterns

- API integration
- Database connections
- External service calls
- Event handling

## Assessment and Certification

### 1. Practical Exercises

- Basic: Execute simple CFN loop
- Intermediate: Handle failed loop, iterate to success
- Advanced: Custom agent/skill development
- Expert: System troubleshooting and optimization

### 2. Knowledge Check

- Architecture understanding
- Best practices application
- Troubleshooting capability
- Security awareness

### 3. Certification Levels

- CFN User: Basic task execution
- CFN Developer: Advanced feature usage
- CFN Operator: System administration
- CFN Expert: Architecture and optimization

## Ongoing Learning

### Resources

- Documentation: /docs directory
- Examples: /examples directory
- Community: Slack channels
- Updates: Release notes

### Continuous Improvement

- Monthly training sessions
- Quarterly platform updates
- Annual architecture review
- Community contributions

### Support

- Help desk: platform-team@company.com
- Emergency: on-call rotation
- Documentation: Confluence/Wiki
- Issues: JIRA/ServiceNow