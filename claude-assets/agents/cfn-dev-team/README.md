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
  - `backend-developer`: Backend system design and implementation
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