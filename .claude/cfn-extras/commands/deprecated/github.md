---
description: "GitHub integration for repository management, PR automation, and collaboration"
argument-hint: "<action> [repository] [options]"
allowed-tools: ["Bash", "Read", "Write", "Grep", "mcp__claude-flow__github_repo_analyze", "mcp__claude-flow__github_pr_manage", "mcp__claude-flow__github_release_coord", "mcp__claude-flow__github_issue_track", "mcp__claude-flow__github_workflow_auto", "mcp__claude-flow__github_metrics", "mcp__claude-flow__agent_spawn", "mcp__claude-flow__memory_usage"]
---

# GitHub Integration & Automation

Comprehensive GitHub integration for repository management, automated workflows, and team collaboration.

**Action**: $ARGUMENTS

## Available Actions

### Repository Management
- `analyze <repo>` - Comprehensive repository analysis
- `metrics <repo>` - Repository health and activity metrics
- `security-scan <repo>` - Security vulnerability scanning
- `performance-audit <repo>` - Performance and quality assessment

### Pull Request Management
- `pr create <title>` - Create PR with AI-generated description
- `pr review <number>` - Automated code review with suggestions
- `pr merge <number>` - Smart merge with conflict resolution
- `pr status` - Show all open PRs with analysis

### Issue Management
- `issue create <title>` - Create issue with templates
- `issue triage` - AI-powered issue triage and labeling
- `issue assign` - Smart assignment based on expertise
- `issue close <number>` - Close issue with summary

### Release Management
- `release create <version>` - Create release with changelog
- `release notes <version>` - Generate release notes
- `release deploy <version>` - Coordinate deployment

### Workflow Automation
- `workflow setup` - Configure GitHub Actions workflows
- `workflow status` - Monitor workflow runs
- `workflow optimize` - Optimize CI/CD performance

## Key Features

### 🔍 AI-Powered Repository Analysis

#### Code Quality Assessment
- **Architecture Analysis**: Design patterns, SOLID principles compliance
- **Code Complexity**: Cyclomatic complexity, maintainability index
- **Technical Debt**: Identification and prioritization
- **Documentation Quality**: README, API docs, inline comments

#### Security Analysis
- **Vulnerability Scanning**: Dependencies, code patterns, configurations
- **Secret Detection**: API keys, passwords, certificates
- **Access Control**: Repository permissions and branch protection
- **Supply Chain**: Dependency risk assessment

#### Performance Metrics
- **Build Performance**: CI/CD execution times, bottlenecks
- **Code Performance**: Static analysis, performance patterns
- **Repository Health**: Commit frequency, contributor activity
- **Issue Resolution**: Response times, resolution rates

### 🤖 Automated Code Review

#### Intelligent PR Analysis
- **Change Impact**: Affected components and systems
- **Risk Assessment**: Breaking changes, security implications
- **Test Coverage**: Missing tests, coverage impact
- **Documentation**: Required documentation updates

#### Review Automation
- **Style Compliance**: Code formatting, naming conventions
- **Best Practices**: Language-specific recommendations
- **Performance Impact**: Bundle size, runtime performance
- **Security Review**: Vulnerability patterns, secure coding

### 📈 Advanced Metrics & Insights

#### Team Productivity
- **Contributor Analysis**: Activity patterns, expertise areas
- **Collaboration Metrics**: PR review patterns, response times
- **Knowledge Sharing**: Documentation contributions, mentoring
- **Burnout Detection**: Workload analysis, health indicators

#### Project Health
- **Velocity Tracking**: Feature delivery, sprint performance
- **Quality Trends**: Bug rates, test coverage over time
- **Maintenance Load**: Technical debt, refactoring needs
- **Community Growth**: Star/fork growth, issue engagement

## Usage Examples

### Repository Analysis
```bash
# Comprehensive repository analysis
/github analyze myorg/myrepo

# Output includes:
# - Code quality score (1-10)
# - Security vulnerability count
# - Performance bottlenecks
# - Improvement recommendations
# - Contributor activity analysis
```

### PR Management
```bash
# Create PR with AI description
/github pr create "Add user authentication"

# Automated code review
/github pr review 123

# Output:
# - Code quality assessment
# - Security review
# - Performance impact
# - Test coverage analysis
# - Suggested improvements
```

### Issue Triage
```bash
# AI-powered issue triage
/github issue triage

# Automatically:
# - Labels issues by type/priority
# - Assigns to appropriate team members
# - Estimates effort/complexity
# - Suggests related issues
```

### Release Management
```bash
# Create release with changelog
/github release create v2.1.0

# Automatically:
# - Generates changelog from commits
# - Identifies breaking changes
# - Creates release notes
# - Tags version and triggers deployment
```

## Sample Analysis Output

```markdown
# Repository Analysis: myorg/awesome-project

## 🏆 Overall Health Score: 8.7/10

### 🔍 Code Quality (9.2/10)
- **Architecture**: Well-structured, follows SOLID principles
- **Complexity**: Low average complexity (2.3/10)
- **Documentation**: Comprehensive README, 85% API coverage
- **Testing**: 94% code coverage, good test quality

### 🛡️ Security (7.8/10)
- **Vulnerabilities**: 2 medium-risk dependencies
- **Secrets**: No exposed secrets detected
- **Permissions**: Appropriate branch protection rules
- **Recommendations**: Update lodash to v4.17.21

### 🚀 Performance (8.5/10)
- **Build Time**: 3.2 minutes (good)
- **Bundle Size**: 245KB (acceptable)
- **CI Efficiency**: 95% success rate
- **Bottlenecks**: Database tests could be optimized

### 📈 Team Metrics
- **Active Contributors**: 12 (last 30 days)
- **PR Response Time**: 4.2 hours average
- **Issue Resolution**: 89% within SLA
- **Knowledge Distribution**: Good (no single points of failure)

## 📝 Recommendations
1. **Security**: Update 2 vulnerable dependencies
2. **Performance**: Optimize database test suite
3. **Process**: Consider automated dependency updates
4. **Documentation**: Add contribution guidelines
```

## Workflow Automation

### CI/CD Optimization
- **Pipeline Analysis**: Identify bottlenecks and optimization opportunities
- **Parallel Execution**: Suggest parallelization strategies
- **Caching**: Optimize build caches and artifact storage
- **Resource Usage**: Monitor and optimize runner usage

### Quality Gates
- **Automated Testing**: Ensure comprehensive test coverage
- **Security Scanning**: Integrate security checks into pipelines
- **Performance Testing**: Monitor performance regressions
- **Documentation**: Ensure documentation stays up-to-date

## Multi-Repository Management

### Organization Overview
- **Repository Health Dashboard**: Cross-repo metrics and trends
- **Dependency Management**: Shared dependency updates
- **Security Compliance**: Organization-wide security policies
- **Knowledge Sharing**: Cross-team learning and best practices

### Release Coordination
- **Multi-Repo Releases**: Coordinate releases across services
- **Dependency Tracking**: Monitor inter-service dependencies
- **Rollback Management**: Coordinate rollbacks across systems
- **Communication**: Automated stakeholder notifications

## Integration with Claude Flow

- **Agent Coordination**: Deploy specialized GitHub agents
- **Memory Persistence**: Remember repository context across sessions
- **Learning**: Improve recommendations based on team patterns
- **Automation**: Custom workflows based on team preferences

Streamline your GitHub workflow with AI-powered automation and insights.