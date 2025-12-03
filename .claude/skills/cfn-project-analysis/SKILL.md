---
name: cfn-project-analysis
description: AI-powered project analysis with prioritized improvement recommendations
version: 1.0.0
tags: [analysis, recommendations, code-quality, security, performance]
status: production
---

# Project Analysis Skill

Intelligent, prioritized recommendations for improving codebase based on AI analysis.

## Purpose

Provides comprehensive project analysis across multiple dimensions:
- Security vulnerabilities and best practices
- Performance bottlenecks and optimizations
- Code quality, readability, and maintainability
- Test coverage, quality, and missing scenarios

## Usage

```bash
# Quick analysis (top 3-5 recommendations)
./.claude/skills/cfn-project-analysis/analyze.sh --quick

# Security focus
./.claude/skills/cfn-project-analysis/analyze.sh --focus=security

# Performance analysis
./.claude/skills/cfn-project-analysis/analyze.sh --focus=performance

# Detailed comprehensive analysis
./.claude/skills/cfn-project-analysis/analyze.sh --detailed

# Maintainability focus
./.claude/skills/cfn-project-analysis/analyze.sh --focus=maintainability
```

## Analysis Categories

### Security Analysis
- Dependency vulnerability scanning
- Code security pattern detection
- Authentication/authorization review
- Input validation and sanitization

### Performance Analysis
- Bundle size optimization opportunities
- Database query optimization
- Caching strategy improvements
- Resource usage patterns

### Code Quality Analysis
- Design pattern recommendations
- Refactoring opportunities
- Documentation gaps
- Type safety improvements

### Testing Analysis
- Test coverage gaps
- Test quality assessment
- Missing test scenarios
- Flaky test detection

## Features

### Framework-Aware
- Leverages 98.5% accurate framework detection
- Language-specific recommendations
- Context-aware suggestions

### Risk Assessment
- Prioritizes by impact and effort
- ROI scoring for improvements
- Critical vs nice-to-have classification

### Actionable Output
- Specific code locations
- Implementation guides
- Priority ranking
- Estimated effort

## Output Format

```
═══════════════════════════════════════════════════════
   Project Analysis Results
═══════════════════════════════════════════════════════

[CRITICAL] Security: Unvalidated user input in API endpoints
  Impact: High | Effort: Medium | Priority: 1
  Files: src/api/users.ts:42, src/api/posts.ts:67
  Recommendation: Add Joi/Zod validation schemas
  
[HIGH] Performance: N+1 query in user dashboard
  Impact: High | Effort: Low | Priority: 2
  Files: src/controllers/dashboard.ts:28
  Recommendation: Use DataLoader or eager loading

[MEDIUM] Code Quality: Complex function needs refactoring
  Impact: Medium | Effort: Medium | Priority: 3
  Files: src/services/auth.ts:145
  Recommendation: Extract helper functions
```

## Integration

Works with MCP tools for enhanced analysis:
- `mcp__claude-flow__framework_detect` - Framework detection
- `mcp__claude-flow__language_detect` - Language detection
- `mcp__claude-flow__dependency_analyze` - Dependency analysis

