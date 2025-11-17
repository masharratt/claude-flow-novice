# Documentation Folder Organization

This document describes the reorganized folder structure for the `/docs` directory.

## Overview
- Total folders: 20 (including root)
- Total files: 594
- Organization date: 2025-11-17

## Folder Structure

### 1. ace-system/ (11 files)
ACE (Adaptive Context Engine) system documentation including analytics, anti-pattern detection, context injection, and reflection systems.

### 2. architecture/ (110 files)
System architecture documentation including:
- Agent lifecycle and consolidation
- CFN Loop architecture
- Complexity analysis
- Context validation
- Epic and phase implementations
- Redis key consistency
- State persistence models
- Schema definitions (Agent Output, Approval, Artifact Registry)

### 3. bugs/ (63 files)
Bug tracking and remediation documentation including:
- Product Owner decision fixes
- Memory leak analysis
- ACE schema fixes
- Consensus on vapor issues
- Waiting mode fixes

### 4. cfn-system/ (16 files)
CFN (Claude Flow Novice) system documentation including:
- Integration summaries
- Stabilization reports
- CLI mode gap analysis
- Mode comparison reports
- System fixes

### 5. database/ (9 files)
Database-related documentation including:
- Authentication
- Query abstraction
- Migration and rollback
- Cross-database transactions
- Redis transactions
- Testing distributed transactions

### 6. deployment/ (9 files)
Deployment and rollout documentation including:
- Deployment guides
- Rollout plans
- Rollback procedures
- Production readiness verification
- Promotion pipeline implementation

### 7. docker/ (46 files)
Docker containerization documentation including:
- Feature matrices
- Comparison analyses (QUDAG, DAA)
- Playwright solutions
- Container CFN implementations
- MCP integration

### 8. examples/ (1 file)
Code examples and reference implementations.

### 9. features/ (2 files)
Feature documentation and matrices.

### 10. guides/ (45 files)
User and developer guides including:
- Quick start guide
- Integration FAQ
- API reference
- Protocol reference
- Skill guides (deployment, content standards, markdown format)
- Artifact registry
- Backup/restore
- Centralized logging
- Distributed logging
- File operations
- Health checks
- Monitoring setup
- Performance optimization
- Workspace management
- Configuration management
- Execution model reference
- OpenAPI specifications

### 11. implementation/ (40 files)
Implementation reports and summaries including:
- Phase completions
- Sprint deliverables
- Task summaries
- CFN Docker implementations
- MCP tools reports
- Playbook configurations
- Workflow codification

### 12. migration/ (19 files)
Migration guides and reports including:
- Configuration migration
- Agent output migration
- Skill migration
- General migration guides
- Rollback procedures

### 13. operations/ (50 files)
Operational documentation including:
- Monitoring and metrics
- Health checks
- Error handling and fixes
- Circuit breakers and retry logic
- Distributed locking
- Credential management
- Incident response
- Operational runbooks
- Troubleshooting guides
- Edge case feedback loops
- Connection pool fixes
- Branch protection rules
- Critical fixes
- Coordinator issues
- Cost analysis
- Product Owner backlog integration
- Reflection validation

### 14. quality-assurance/ (15 files)
Quality assurance documentation including:
- Code quality analysis and reviews
- Code coverage reports
- QA consensus scores
- Validation reports
- Performance benchmarking
- Performance testing
- Test coverage analysis

### 15. reports/ (39 files)
Various reports including:
- Analysis reports
- Validation reports
- Implementation summaries
- Loop 5 reflection reports
- MCP browser automation results
- Playwright fixes
- Session documentation
- Test validation reports
- Changelog analysis and index

### 16. reviews/ (8 files)
Code and architecture reviews including:
- Phase reviews
- PR comprehensive reviews
- CTO executive decisions
- Phase 4 iteration reviews

### 17. roadmap/ (10 files)
Strategic planning documentation including:
- 18-month strategic roadmap
- 2028-2029 forecasts
- Enterprise future-proofing
- Executive briefs
- Implementation quickstarts
- Alignment analyses

### 18. security/ (61 files)
Security documentation including:
- Security audits (multiple phases)
- Security clearance reports
- Deep scan reports
- Findings summaries
- Fix summaries
- Hardening guides
- Implementation guides
- Remediation guides and recommendations
- Response plans
- Risk assessments
- Review checklists
- Validation reports
- SQL injection prevention and fixes
- SQLite parameter binding
- Command injection fixes

### 19. testing/ (32 files)
Testing documentation including:
- Testing guides
- Integration test reports
- Test coverage analysis
- TDD validation reports
- CLI handler tests
- Regression test generator API
- Integration test execution summaries

## Organization Principles

Files were organized based on the following principles:

1. **Functional Grouping**: Related documents grouped by primary purpose
2. **Flat Structure**: Avoided deep nesting (max 1 level of subdirectories)
3. **Clear Naming**: Folder names clearly indicate content type
4. **Logical Separation**: Development, operations, security, and quality concerns separated
5. **Consolidation**: Merged overlapping categories (e.g., SQL security into security/, transactions into database/)

## Usage Notes

- All documentation is now easier to locate based on functional area
- Root folder contains only this organization guide
- Each folder focuses on a specific aspect of the system
- Related documents are co-located for easier reference
