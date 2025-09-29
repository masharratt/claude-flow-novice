---
description: "Smart dependency analysis with security scanning and performance-focused updates"
argument-hint: "[--security|--performance|--outdated|--audit|--interactive]"
allowed-tools: ["Bash", "Read", "Grep", "mcp__claude-flow__dependency_analyze", "mcp__claude-flow__language_detect", "mcp__claude-flow__framework_detect", "mcp__claude-flow__memory_usage"]
---

# Smart Dependency Recommendations

Analyze your project dependencies and provide intelligent recommendations for updates, security fixes, and performance improvements.

**Analysis Type**: $ARGUMENTS

## Analysis Options

- `--security` - Focus on security vulnerabilities and CVE scanning
- `--performance` - Analyze bundle size and performance impact
- `--outdated` - Show outdated packages with safe update paths
- `--audit` - Comprehensive security audit with risk assessment
- `--interactive` - Interactive update wizard with explanations

## What This Command Does

### 🔍 Intelligent Dependency Analysis
- **Multi-Language Support**: npm, Cargo, pip, composer, bundler
- **Security Scanning**: CVE database integration and vulnerability detection
- **Performance Impact**: Bundle size analysis and optimization opportunities
- **Breaking Change Detection**: Semantic version analysis and migration guides
- **License Compliance**: License compatibility and legal risk assessment

### 🛡️ Security Analysis

#### Vulnerability Scanning
- **CVE Database**: Real-time vulnerability scanning
- **Severity Assessment**: Critical, High, Medium, Low risk classification
- **Exploit Availability**: Known exploits and proof-of-concept detection
- **Patch Availability**: Available fixes and update recommendations

#### Security Best Practices
- **Minimal Dependencies**: Suggest lighter alternatives
- **Trusted Sources**: Verify package maintainer reputation
- **License Scanning**: Identify problematic licenses
- **Supply Chain**: Analyze dependency chains for risks

### 🚀 Performance Optimization

#### Bundle Analysis
- **Size Impact**: Before/after size comparison
- **Tree Shaking**: Dead code elimination opportunities
- **Alternative Packages**: Lighter alternatives with same functionality
- **Lazy Loading**: Code splitting recommendations

#### Runtime Performance
- **Startup Time**: Dependency impact on application startup
- **Memory Usage**: Memory footprint analysis
- **CPU Impact**: Performance benchmarks and comparisons

## Language-Specific Features

### JavaScript/Node.js (npm/yarn/pnpm)
```bash
# Security audit with fix suggestions
/dependency-recommendations --security
# Output: npm audit fix, specific CVE details, manual update guides

# Performance analysis
/dependency-recommendations --performance
# Output: Bundle analyzer results, tree-shaking opportunities
```

### Rust (Cargo)
```bash
# Cargo audit with vulnerability scanning
/dependency-recommendations --audit
# Output: cargo audit, rustsec advisory database

# Outdated crates analysis
/dependency-recommendations --outdated
# Output: cargo outdated, semver compatibility, feature changes
```

### Python (pip/poetry/pipenv)
```bash
# Security scanning with safety
/dependency-recommendations --security
# Output: safety check, known vulnerabilities, update commands

# Performance and compatibility
/dependency-recommendations --performance
# Output: Wheel vs source installs, Python version compatibility
```

## Sample Recommendation Output

```markdown
## 🚨 Critical Security Issues (2)

### 1. lodash@4.17.15 → 4.17.21
- **CVE-2021-23337**: Prototype pollution vulnerability
- **Risk**: High - Remote code execution possible
- **Fix**: `npm update lodash@^4.17.21`
- **Breaking Changes**: None
- **Affected Files**: src/utils/helpers.js, src/components/

### 2. express@4.17.1 → 4.18.2
- **Multiple CVEs**: Security vulnerabilities in older versions
- **Risk**: Medium - Information disclosure
- **Fix**: `npm install express@^4.18.2`
- **Migration Guide**: Check middleware compatibility

## 🚀 Performance Opportunities (3)

### 1. moment.js → date-fns
- **Bundle Size**: 67KB → 13KB (80% reduction)
- **Tree Shaking**: Full support vs none
- **Migration**: Auto-migration available
- **Effort**: Medium (2-3 hours)

### 2. lodash → Native ES6+ / lodash-es
- **Bundle Size**: 71KB → 15KB (selective imports)
- **Performance**: 15% faster with native methods
- **Migration**: Gradual replacement possible

## 🔄 Recommended Updates (5)

### Safe Updates (No Breaking Changes)
- react@18.2.0 → 18.2.45 (patch updates)
- typescript@4.9.4 → 4.9.5 (bug fixes)
- jest@29.3.1 → 29.5.0 (new features)

### Major Version Updates (Review Required)
- webpack@4.46.0 → 5.88.2
  - **Breaking Changes**: Module federation, asset modules
  - **Migration Guide**: https://webpack.js.org/migrate/5/
  - **Estimated Effort**: 1-2 days
```

## Interactive Update Wizard

```bash
/dependency-recommendations --interactive
```

Provides step-by-step guidance:
1. **Prioritization**: Security first, then performance, then features
2. **Impact Assessment**: Explains what each update affects
3. **Testing Strategy**: Suggests test scenarios after updates
4. **Rollback Plan**: Provides rollback commands if issues occur
5. **Documentation**: Updates package.json comments and documentation

## Educational Features

### Why Updates Matter
- **Security**: Explains specific vulnerabilities and their impact
- **Performance**: Shows measurable improvements with benchmarks
- **Maintenance**: Discusses long-term maintenance benefits
- **Ecosystem**: Explains how updates affect the broader ecosystem

### Best Practices
- **Update Strategy**: Guidance on when and how to update
- **Testing**: Recommendations for testing after updates
- **Monitoring**: Tools for tracking dependency health
- **Documentation**: Keeping dependency decisions documented

## Integration Features

- **CI/CD Integration**: Generate update PRs with full analysis
- **Team Notifications**: Share recommendations with team members
- **Scheduled Analysis**: Regular dependency health checks
- **Custom Policies**: Configure update policies and approval workflows

Get intelligent, actionable dependency recommendations that balance security, performance, and stability.