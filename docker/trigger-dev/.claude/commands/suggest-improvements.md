---
description: "AI-powered project analysis with prioritized improvement recommendations"
argument-hint: "[--focus=<area>|--quick|--detailed|--security]"
allowed-tools: ["Read", "Bash", "Glob", "Grep", "mcp__claude-flow__language_detect", "mcp__claude-flow__framework_detect", "mcp__claude-flow__dependency_analyze", "mcp__claude-flow__rust_quality_analyze", "mcp__claude-flow__typescript_validate", "mcp__claude-flow__memory_usage", "mcp__claude-flow__agent_spawn"]
---

# AI Project Analysis & Improvement Suggestions

Provide intelligent, prioritized recommendations for improving your codebase based on AI analysis.

**Focus Area**: $ARGUMENTS

## Analysis Options

- `--focus=security` - Focus on security vulnerabilities and best practices
- `--focus=performance` - Analyze performance bottlenecks and optimizations
- `--focus=maintainability` - Code quality, readability, and maintainability
- `--focus=testing` - Test coverage, quality, and missing test scenarios
- `--quick` - Fast analysis with top 3-5 recommendations
- `--detailed` - Comprehensive analysis with implementation guides
- `--security` - Security-focused analysis with CVE scanning

## What This Command Does

### 🔍 Intelligent Codebase Analysis
- **Framework-Aware**: Leverages 98.5% accurate framework detection
- **Language-Specific**: Tailored recommendations for detected languages
- **Context-Aware**: Understands project structure and patterns
- **Risk Assessment**: Prioritizes improvements by impact and effort

### 🎦 Analysis Categories

#### Security Analysis
- Dependency vulnerability scanning
- Code security pattern detection
- Authentication/authorization review
- Input validation and sanitization

#### Performance Analysis
- Bundle size optimization opportunities
- Database query optimization
- Caching strategy improvements
- Resource usage patterns

#### Code Quality Analysis
- Design pattern recommendations
- Refactoring opportunities
- Documentation gaps
- Type safety improvements

#### Testing Analysis
- Coverage gap identification
- Missing test scenarios
- Test quality assessment
- E2E testing opportunities

## Sample Output

```markdown
## 🚨 High Priority (Security)
1. **Update lodash dependency** - CVE-2021-23337 (Risk: High)
   Command: `npm update lodash@^4.17.21`
   
2. **Add input validation** - Missing sanitization in user routes
   Files: `src/routes/user.js`

## 🚀 Medium Priority (Performance)
1. **Implement code splitting** - Bundle size: 2.3MB
   Framework: React with dynamic imports
   
2. **Add Redis caching** - Database queries: 150ms avg
   Impact: 60% performance improvement

## 🛠️ Low Priority (Maintenance)
1. **Add TypeScript** - 89% of codebase would benefit
2. **Update documentation** - API docs outdated
```

## Educational Focus

Every recommendation includes:
- **Why**: Explanation of the problem/opportunity
- **Impact**: Expected improvement metrics
- **How**: Specific implementation steps
- **Resources**: Links to best practices and tutorials

## Framework-Specific Recommendations

- **Rust**: Clippy suggestions, unsafe code review, performance optimization
- **JavaScript/Node.js**: NPM audit, bundle analysis, async/await patterns
- **TypeScript**: Type coverage, strict mode opportunities
- **Python**: Virtual environment setup, type hints, security scanning
- **React**: Component optimization, state management, accessibility

Get actionable, prioritized recommendations to improve your project's security, performance, and maintainability.