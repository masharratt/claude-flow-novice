# CFN Dev Team Agent Structure

## Overview

The CFN (Claude Flow Novice) development team comprises 23 production agents organized into 4 strategic categories, designed to provide comprehensive software development and workflow management capabilities.

## Directory Structure

### Coordinators
- **Purpose**: CFN Loop orchestration and workflow management
- **Key Agents**:
  - `cfn-v3-coordinator`: Primary workflow orchestrator

### Developers
- **Purpose**: Core implementation and creative problem-solving
- **Key Agents**:
  - `coder`: Production code implementation
  - `backend-dev`: Backend system design and implementation
  - `researcher`: Technical research and solution exploration
  - `architect`: System design and architectural planning
  - `agent-builder`: Agent template and workflow design

### Reviewers
- **Purpose**: Quality assurance and code validation
- **Key Agents**:
  - `reviewer`: Code review and quality assessment
  - `code-analyzer`: Static code analysis
  - `code-quality-validator`: Comprehensive code quality checks
  - `security-specialist`: Security vulnerability detection

### Testers
- **Purpose**: Comprehensive testing and validation
- **Key Agents**:
  - `tester`: General test strategy and implementation
  - `playwright-tester`: Web interaction testing
  - `interaction-tester`: User interaction validation
  - `production-validator`: Production readiness checks
  - `perf-analyzer`: Performance testing and optimization

## Agent Selection Guide

### When to Use Each Category

1. **Coordinators**
   - Complex workflow orchestration
   - Multi-agent collaboration scenarios
   - CFN Loop management

2. **Developers**
   - Initial implementation
   - Feature development
   - Technical problem-solving
   - Prototype creation

3. **Reviewers**
   - Post-implementation code review
   - Quality gate validation
   - Security and performance analysis
   - Refactoring recommendations

4. **Testers**
   - Comprehensive test strategy
   - Automated testing
   - Production validation
   - Performance optimization

## CFN Loop Integration

### Loop Participation Levels

- **Loop 2**: Preliminary design and research
- **Loop 3**: Implementation and initial validation
- **Loop 4**: Advanced testing and production readiness

## Naming Conventions

- All agents follow the `cfn-dev-team` namespace
- Naming format: `category-specific-role`
  - Example: `developer-backend-specialist`

## Agent Template Requirements

Each agent MUST include:

1. **Name**: Unique, descriptive identifier
2. **Description**: Clear purpose and capabilities
3. **Tools**: Permitted interaction tools
4. **Model**: Assigned AI model
5. **Capabilities**: Specific functional areas
6. **Lifecycle Hooks**:
   - SQLite tracking
   - Redis coordination
7. **ACL Level**: Access control level (1-5)

## Multi-Worktree Coordination

### Environment Variables Provided by Coordinator

When coordinators spawn agents in multi-worktree environments, the following environment variables are automatically injected:

```bash
COMPOSE_PROJECT_NAME="cfn-feature-auth"           # Unique project name per branch
CFN_REDIS_PORT=6421                               # Redis port (6379 + offset)
CFN_POSTGRES_PORT=5474                            # Postgres port (5432 + offset)
WORKTREE_BRANCH="feature-auth"                    # Git branch name
```

### Service Discovery Pattern

Agents use Docker service names for internal communication:

```bash
# Redis connection (within Docker network)
redis-cli -h redis -p 6379

# PostgreSQL connection (within Docker network)
PGHOST=postgres PGPORT=5432 psql -U postgres

# HTTP connections
curl http://orchestrator:3001/health
```

**Important**: Service names are resolved by Docker's internal DNS within the network. Container names (e.g., `cfn-redis-1`) will NOT resolve.

### Multi-Worktree Examples

#### Scenario 1: Feature Development (Feature-Auth Branch)

```bash
# Branch: feature-auth
# Offset: ~42 (calculated from branch name)
# Ports: Redis=6421, Postgres=5474, Orchestrator=3043

# Coordinator injects:
export COMPOSE_PROJECT_NAME="cfn-feature-auth"
export CFN_REDIS_PORT=6421
export CFN_POSTGRES_PORT=5474

# Agent connects to correct worktree services
redis-cli -h redis -p 6421
psql -h postgres -p 5474
```

#### Scenario 2: Bugfix Work (Bugfix-Validation Branch)

```bash
# Branch: bugfix-validation
# Offset: ~78 (calculated from branch name)
# Ports: Redis=6457, Postgres=5510, Orchestrator=3079

# Coordinator injects:
export COMPOSE_PROJECT_NAME="cfn-bugfix-validation"
export CFN_REDIS_PORT=6457
export CFN_POSTGRES_PORT=5510

# Agent connects to correct worktree services
redis-cli -h redis -p 6457
psql -h postgres -p 5510
```

#### Scenario 3: Main Branch (Production Ready)

```bash
# Branch: main/master
# Offset: 0 (main gets priority)
# Ports: Redis=6379, Postgres=5432, Orchestrator=3001

# Coordinator injects:
export COMPOSE_PROJECT_NAME="cfn-main"
export CFN_REDIS_PORT=6379
export CFN_POSTGRES_PORT=5432

# Standard ports - no offset
redis-cli -h redis -p 6379
psql -h postgres -p 5432
```

### Running Multiple Worktrees Simultaneously

Team members can develop in parallel without conflicts:

```bash
# Developer 1: Feature branch
worktree_1/feature-auth$ ./scripts/docker/run-in-worktree.sh up -d
# Ports: Redis=6421, Postgres=5474

# Developer 2: Bugfix branch (same machine)
worktree_2/bugfix-validation$ ./scripts/docker/run-in-worktree.sh up -d
# Ports: Redis=6457, Postgres=5510

# Developer 3: Main branch
worktree_3/main$ ./scripts/docker/run-in-worktree.sh up -d
# Ports: Redis=6379, Postgres=5432

# All three run simultaneously without port conflicts!
```

## Adding New Agents

### Process

1. Use `agent-builder` for initial template creation
2. Follow agent template structure
3. Validate against CFN Loop coordination patterns
4. Submit for team review
5. Integrate into appropriate category

### Validation Checklist

- [ ] Unique name and purpose
- [ ] Defined capabilities
- [ ] Appropriate tool selection
- [ ] Lifecycle hook configuration
- [ ] ACL level assignment
- [ ] Category alignment

## Contributing

Agents are critical to our workflow. Propose new agents or improvements via pull request to the CFN development team.