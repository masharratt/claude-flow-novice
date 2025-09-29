---
description: "Advanced workflow automation with event-driven triggers and AI coordination"
argument-hint: "<action> [workflow-name] [options]"
allowed-tools: ["Bash", "Read", "Write", "Edit", "Grep", "mcp__claude-flow__workflow_create", "mcp__claude-flow__workflow_execute", "mcp__claude-flow__automation_setup", "mcp__claude-flow__pipeline_create", "mcp__claude-flow__scheduler_manage", "mcp__claude-flow__trigger_setup", "mcp__claude-flow__agent_spawn", "mcp__claude-flow__task_orchestrate", "mcp__claude-flow__memory_usage"]
---

# Workflow Automation & Orchestration

Create, manage, and execute sophisticated automated workflows with AI-powered orchestration and event-driven triggers.

**Action**: $ARGUMENTS

## Workflow Actions

### Workflow Management
- `create <name>` - Create new workflow with AI assistance
- `list` - Show all available workflows
- `execute <name>` - Run workflow with real-time monitoring
- `status [name]` - Check workflow execution status
- `stop <name>` - Gracefully stop running workflow

### Automation Setup
- `triggers setup` - Configure event-driven triggers
- `schedule <name> <cron>` - Schedule workflow execution
- `pipeline create <name>` - Create CI/CD pipeline
- `hooks enable` - Enable automation hooks
- `monitor <name>` - Real-time workflow monitoring

### Template Management
- `template list` - Show workflow templates
- `template create <name>` - Create reusable template
- `template apply <name>` - Apply template to project
- `export <name>` - Export workflow definition
- `import <file>` - Import workflow from file

## Workflow Types

### 🚀 Development Workflows

#### Full-Stack Feature Development
```yaml
name: "feature-development"
trigger: "branch-created"
steps:
  - name: "analyze-requirements"
    agent: "researcher"
    action: "analyze-feature-requirements"
  
  - name: "design-architecture"
    agent: "system-architect"
    depends: ["analyze-requirements"]
    action: "design-system-architecture"
  
  - name: "backend-implementation"
    agent: "backend-dev"
    depends: ["design-architecture"]
    parallel: true
    action: "implement-backend-services"
  
  - name: "frontend-implementation"
    agent: "coder"
    depends: ["design-architecture"]
    parallel: true
    action: "implement-frontend-components"
  
  - name: "integration-testing"
    agent: "tester"
    depends: ["backend-implementation", "frontend-implementation"]
    action: "run-integration-tests"
```

#### Code Quality Pipeline
```yaml
name: "code-quality"
trigger: "pull-request"
steps:
  - name: "static-analysis"
    tools: ["eslint", "typescript", "rust-clippy"]
    parallel: true
  
  - name: "security-scan"
    tools: ["npm-audit", "cargo-audit", "snyk"]
    parallel: true
  
  - name: "test-execution"
    agents: ["tester"]
    coverage_threshold: 85
  
  - name: "performance-test"
    agents: ["perf-analyzer"]
    benchmarks: ["load", "stress", "memory"]
```

### 🔄 CI/CD Workflows

#### Deployment Pipeline
```yaml
name: "deployment-pipeline"
trigger: "tag-created"
environments: ["staging", "production"]
steps:
  - name: "build"
    parallel_matrix:
      - target: "linux-x64"
      - target: "darwin-arm64"
      - target: "windows-x64"
  
  - name: "test-suite"
    depends: ["build"]
    types: ["unit", "integration", "e2e"]
  
  - name: "security-audit"
    depends: ["build"]
    scans: ["dependencies", "containers", "infrastructure"]
  
  - name: "deploy-staging"
    depends: ["test-suite", "security-audit"]
    environment: "staging"
    approval: false
  
  - name: "deploy-production"
    depends: ["deploy-staging"]
    environment: "production"
    approval: true
    rollback_strategy: "blue-green"
```

### 📅 Scheduled Workflows

#### Maintenance Tasks
```yaml
name: "weekly-maintenance"
schedule: "0 2 * * 1"  # Every Monday at 2 AM
steps:
  - name: "dependency-updates"
    agent: "dependency-analyzer"
    action: "check-updates"
    auto_pr: true
  
  - name: "security-scan"
    agent: "security-specialist"
    action: "vulnerability-scan"
    report: "weekly-security-report"
  
  - name: "performance-analysis"
    agent: "perf-analyzer"
    action: "benchmark-comparison"
    retention: "6-months"
  
  - name: "cleanup-artifacts"
    action: "cleanup-old-builds"
    retention: "30-days"
```

## Event-Driven Triggers

### Git Triggers
- **Push Events**: Branch pushes, tag creation, force pushes
- **PR Events**: Created, updated, merged, closed
- **Issue Events**: Opened, commented, labeled, closed
- **Release Events**: Published, edited, deleted

### File System Triggers
- **File Changes**: Specific file/directory modifications
- **Pattern Matching**: Glob patterns for selective triggering
- **Dependency Changes**: package.json, Cargo.toml, requirements.txt
- **Configuration Changes**: Environment files, CI configs

### External Triggers
- **Webhooks**: External service notifications
- **API Calls**: RESTful trigger endpoints
- **Scheduled**: Cron-based scheduling
- **Manual**: User-initiated execution

## Workflow Features

### 🦾 AI-Powered Orchestration

#### Intelligent Task Distribution
- **Agent Selection**: Choose optimal agents based on task requirements
- **Load Balancing**: Distribute work across available agents
- **Failure Recovery**: Automatic retry with different agents
- **Resource Management**: Monitor and allocate system resources

#### Dynamic Workflow Adaptation
- **Context Awareness**: Adapt based on project type and complexity
- **Performance Learning**: Optimize workflows based on execution history
- **Error Patterns**: Learn from failures to prevent future issues
- **Team Preferences**: Adapt to team coding styles and preferences

### 📊 Real-Time Monitoring

#### Execution Tracking
- **Step Progress**: Real-time step execution status
- **Agent Activity**: Monitor agent resource usage and performance
- **Bottleneck Detection**: Identify and resolve workflow bottlenecks
- **Performance Metrics**: Track execution times and success rates

#### Notifications & Alerts
- **Slack Integration**: Send notifications to team channels
- **Email Alerts**: Critical failure and success notifications
- **Dashboard Updates**: Real-time web dashboard updates
- **Mobile Notifications**: Push notifications for mobile apps

### 🔒 Security & Compliance

#### Access Control
- **Role-Based Permissions**: Workflow execution permissions
- **Secret Management**: Secure handling of API keys and credentials
- **Audit Logging**: Complete audit trail of workflow executions
- **Compliance Checks**: Ensure workflows meet security standards

#### Safe Execution
- **Sandbox Isolation**: Isolate workflow execution environments
- **Resource Limits**: Prevent resource exhaustion
- **Rollback Capabilities**: Quick rollback for failed deployments
- **Validation Gates**: Pre-execution validation and safety checks

## Usage Examples

### Create Development Workflow
```bash
# Create new feature development workflow
/workflow create feature-pipeline

# AI will prompt for:
# - Project type (detected automatically)
# - Testing requirements
# - Deployment targets
# - Team preferences

# Generated workflow includes:
# - Appropriate agents for detected tech stack
# - Testing strategy based on project type
# - Security scans relevant to framework
# - Deployment steps for target platform
```

### Execute Workflow with Monitoring
```bash
# Execute workflow with real-time monitoring
/workflow execute feature-pipeline --monitor

# Output:
# 🚀 Starting workflow: feature-pipeline
# ✅ [1/5] Requirements Analysis (researcher) - 2.3s
# 🔄 [2/5] Architecture Design (system-architect) - Running...
# ⏸️ [3/5] Backend Implementation (backend-dev) - Waiting
# ⏸️ [4/5] Frontend Implementation (coder) - Waiting
# ⏸️ [5/5] Integration Testing (tester) - Waiting
```

### Schedule Maintenance Workflow
```bash
# Schedule weekly maintenance
/workflow schedule maintenance-pipeline "0 2 * * 1"

# Output:
# 📋 Scheduled: maintenance-pipeline
# ⏰ Next run: Monday, 2:00 AM UTC
# 🔄 Tasks: dependency-updates, security-scan, cleanup
# 📊 Estimated duration: 15-20 minutes
```

## Template Library

### Pre-Built Workflows
- **Feature Development**: Full-stack feature implementation
- **Bug Fix Pipeline**: Issue triage, fix, test, deploy
- **Security Audit**: Comprehensive security scanning
- **Performance Testing**: Load testing and optimization
- **Documentation**: Auto-generate and update docs
- **Dependency Management**: Regular updates and security patches

### Custom Templates
- **Team-Specific**: Workflows tailored to team processes
- **Project-Specific**: Workflows adapted to project requirements
- **Industry-Specific**: Workflows for specific domains (fintech, healthcare)
- **Compliance**: Workflows ensuring regulatory compliance

## Integration Capabilities

### Development Tools
- **GitHub/GitLab**: Git workflow integration
- **Jira/Linear**: Issue tracking integration
- **Slack/Teams**: Communication integration
- **Docker/Kubernetes**: Container orchestration

### Cloud Platforms
- **AWS/Azure/GCP**: Cloud deployment integration
- **Terraform**: Infrastructure as code
- **Monitoring**: Datadog, New Relic, Prometheus
- **Security**: Snyk, Veracode, SonarQube

Create powerful, intelligent workflows that adapt to your team's needs and automate your entire development lifecycle.