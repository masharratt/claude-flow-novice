# Intermediate Tier Commands

> **10 additional commands for experienced users with growing confidence**

Welcome to the Intermediate tier! You've mastered the basics and are ready for more direct control over Claude Flow's AI agents and advanced features.

## 🎯 Intermediate Philosophy

- **Direct Control**: Manage agents and workflows explicitly
- **Advanced Features**: Testing, deployment, and optimization tools
- **Safety Nets**: More power with intelligent guardrails
- **Quality Focus**: Code review, performance, and best practices

## 📋 Command Overview

| Command | Purpose | Complexity | Prerequisites |
|---------|---------|------------|---------------|
| `agents` | Direct agent management | ⭐⭐⭐ | Novice mastery |
| `test` | AI-powered testing | ⭐⭐⭐ | Basic project setup |
| `deploy` | Intelligent deployment | ⭐⭐⭐⭐ | Working application |
| `optimize` | Performance tuning | ⭐⭐⭐⭐ | Code to optimize |
| `review` | Code quality analysis | ⭐⭐⭐ | Code to review |
| `monitor` | Real-time monitoring | ⭐⭐ | Active project |
| `workflow` | Custom workflows | ⭐⭐⭐⭐ | Advanced understanding |
| `config` | Advanced configuration | ⭐⭐ | System familiarity |
| `migrate` | Migration assistance | ⭐⭐⭐⭐ | Legacy code |
| `enterprise` | Enterprise features | ⭐⭐⭐ | Team environment |

---

## 1. `claude-flow agents`

### Purpose
Direct management and control of AI agents, giving you explicit control over who does what.

### Syntax
```bash
claude-flow agents <action> [options]
```

### Actions
- `list` - Show available and active agents
- `spawn <type>` - Create a specific agent
- `status` - Check agent health and activity
- `metrics` - View agent performance data
- `stop <id>` - Stop a specific agent
- `restart <id>` - Restart an agent

### Options
- `--type <agent-type>` - Filter by agent type
- `--active` - Show only active agents
- `--detailed` - Include detailed metrics
- `--watch` - Monitor in real-time

### Available Agent Types

#### Core Development Agents
- **researcher** - Requirements analysis and planning
- **coder** - Code implementation and features
- **tester** - Test creation and validation
- **reviewer** - Code review and quality checks
- **optimizer** - Performance improvements

#### Specialized Agents
- **architect** - System design and structure
- **documenter** - Documentation creation
- **security** - Security analysis and fixes
- **ui-designer** - User interface design
- **devops** - Deployment and infrastructure

#### Framework-Specific Agents
- **react-specialist** - React expertise
- **api-expert** - REST/GraphQL APIs
- **database-expert** - Database optimization
- **mobile-dev** - Mobile development
- **ml-engineer** - Machine learning

### Examples

#### List Available Agents
```bash
claude-flow agents list

# Output:
# 🤖 Available Agents
#
# Core Agents:
#   researcher    - Requirements analysis (available)
#   coder        - Code implementation (available)
#   tester       - Test creation (available)
#   reviewer     - Code review (available)
#   optimizer    - Performance tuning (available)
#
# Specialized Agents:
#   architect    - System design (available)
#   security     - Security analysis (available)
#   devops       - Deployment (available)
#
# Active Agents: 0
# Memory Usage: 15MB
```

#### Spawn Specific Agent
```bash
claude-flow agents spawn coder

# Output:
# 🚀 Spawning coder agent...
# Agent ID: coder-a1b2c3
# Status: Active
# Capabilities: TypeScript, React, Node.js, Testing
# Ready for tasks!
#
# Use: claude-flow agents status coder-a1b2c3 to monitor
```

#### Check Agent Status
```bash
claude-flow agents status

# Output:
# 🤖 Agent Status Report
#
# Active Agents (2):
#
# coder-a1b2c3
#   Type: coder
#   Status: 🟢 Active
#   Current Task: "implementing user authentication"
#   Progress: 67%
#   ETA: 5 minutes
#   Memory: 8MB
#
# tester-x7y8z9
#   Type: tester
#   Status: 🟡 Waiting
#   Queue: 2 pending tests
#   Memory: 4MB
```

#### Agent Metrics
```bash
claude-flow agents metrics --detailed

# Output:
# 📊 Agent Performance Metrics
#
# Overall Stats:
#   Total Tasks Completed: 47
#   Average Task Time: 3.2 minutes
#   Success Rate: 94.3%
#   Resource Efficiency: 87%
#
# By Agent Type:
#   coder:      23 tasks, 3.1min avg, 96% success
#   tester:     15 tasks, 2.8min avg, 93% success
#   reviewer:   9 tasks,  4.2min avg, 91% success
#
# Recent Performance:
#   Last Hour: 🟢 Excellent (avg 2.1min)
#   Last Day:  🟢 Good (avg 3.4min)
#   Last Week: 🟡 Fair (avg 4.1min)
```

#### Real-time Monitoring
```bash
claude-flow agents status --watch

# Live updating display:
# 🔄 Live Agent Monitor (updates every 2s)
#
# coder-a1b2c3: [████████░░] 80% - Adding form validation
# tester-x7y8z9: [██░░░░░░░░] 20% - Writing integration tests
#
# System Load: 34% CPU, 127MB RAM
# Task Queue: 3 pending, 2 active
# ETA: 8 minutes to completion
```

### Advanced Agent Management

#### Agent Coordination
```bash
# Spawn coordinated team
claude-flow agents spawn researcher
claude-flow agents spawn coder
claude-flow agents spawn tester

# They automatically coordinate through Claude Flow's neural network
```

#### Custom Agent Workflows
```bash
# Create specialized workflow
claude-flow agents spawn security --for "authentication review"
claude-flow agents spawn coder --for "implementing OAuth"
claude-flow agents spawn tester --for "security testing"
```

#### Performance Optimization
```bash
# Monitor resource usage
claude-flow agents metrics --type coder

# Optimize agent allocation
claude-flow agents optimize --target "response-time"
```

### Common Use Cases

#### Parallel Development
```bash
# Multiple features simultaneously
claude-flow agents spawn coder --task "user profiles"
claude-flow agents spawn coder --task "notification system"
claude-flow agents spawn tester --task "integration tests"
```

#### Quality Assurance
```bash
# Dedicated QA pipeline
claude-flow agents spawn reviewer --focus "security"
claude-flow agents spawn tester --focus "edge-cases"
claude-flow agents spawn optimizer --focus "performance"
```

#### Debugging and Analysis
```bash
# Problem investigation team
claude-flow agents spawn researcher --task "bug analysis"
claude-flow agents spawn security --task "vulnerability scan"
claude-flow agents spawn coder --task "bug fixes"
```

---

## 2. `claude-flow test`

### Purpose
AI-powered testing with intelligent test generation, execution, and analysis.

### Syntax
```bash
claude-flow test [test-type] [options]
```

### Test Types
- `unit` - Unit tests for individual functions
- `integration` - Integration tests for components
- `e2e` - End-to-end user workflow tests
- `performance` - Performance and load tests
- `security` - Security vulnerability tests
- `api` - API endpoint tests
- `visual` - Visual regression tests

### Options
- `--generate` - Generate new tests
- `--run` - Execute existing tests
- `--coverage` - Generate coverage report
- `--fix` - Automatically fix failing tests
- `--watch` - Continuous testing mode
- `--parallel` - Run tests in parallel

### Examples

#### Generate Comprehensive Tests
```bash
claude-flow test --generate

# Output:
# 🧪 AI Test Generation
#
# 🔍 Analyzing codebase...
# Found: 12 components, 8 functions, 3 API endpoints
#
# 🎯 Test Plan:
# • Unit Tests: 28 tests for individual functions
# • Integration Tests: 15 tests for component interactions
# • API Tests: 12 tests for endpoint validation
# • E2E Tests: 6 tests for user workflows
#
# ⚡ Generating tests...
# ✅ Generated 61 tests in 2.3 minutes
# 📊 Estimated coverage: 87%
```

#### Run Specific Test Type
```bash
claude-flow test unit

# Output:
# 🧪 Running Unit Tests
#
# ✅ UserService.createUser() - 4 tests passed
# ✅ AuthHelper.validateToken() - 3 tests passed
# ✅ DataFormatter.sanitize() - 5 tests passed
# ❌ ValidationUtils.isEmail() - 1 test failed
#    Expected: true, Received: false
#    Input: "user@domain"
#
# Results: 11/12 passed (91.7%)
# Coverage: 84%
# Time: 1.2s
```

#### Performance Testing
```bash
claude-flow test performance

# Output:
# ⚡ Performance Test Suite
#
# 🎯 Testing Scenarios:
# • Homepage load time
# • API response times
# • Database query performance
# • Memory usage patterns
#
# 📊 Results:
# Homepage: 1.2s (target: <2s) ✅
# API /users: 145ms (target: <200ms) ✅
# DB queries: 89ms avg (target: <100ms) ✅
# Memory: 34MB (target: <50MB) ✅
#
# Overall Performance Score: A-
```

#### Security Testing
```bash
claude-flow test security

# Output:
# 🔒 Security Test Suite
#
# 🛡️ Scanning for vulnerabilities...
#
# Authentication Tests:
# ✅ Password hashing verified
# ✅ JWT token validation secure
# ✅ Session management proper
#
# Input Validation:
# ✅ SQL injection prevention
# ✅ XSS protection active
# ❌ CSRF token missing on form
#
# Security Score: B+ (1 issue found)
# Recommendation: Add CSRF protection
```

#### Continuous Testing
```bash
claude-flow test --watch

# Output:
# 👀 Continuous Testing Mode
#
# Watching for file changes...
#
# 15:32:04 - File changed: src/UserService.js
# 15:32:05 - Running related tests...
# 15:32:07 - ✅ 4 tests passed
#
# 15:35:12 - File changed: src/components/Login.jsx
# 15:35:13 - Running related tests...
# 15:35:15 - ❌ 1 test failed (Login form validation)
# 15:35:15 - 🔧 Auto-fixing test...
# 15:35:17 - ✅ Test fixed and passing
```

### Advanced Testing Features

#### AI-Generated Edge Cases
```bash
claude-flow test unit --edge-cases

# AI automatically generates edge case tests:
# • Empty inputs
# • Null values
# • Boundary conditions
# • Unexpected data types
# • Race conditions
# • Memory limits
```

#### Visual Regression Testing
```bash
claude-flow test visual

# Compares UI screenshots:
# • Baseline images stored
# • Pixel-perfect comparisons
# • Automatic difference highlighting
# • Cross-browser testing
# • Responsive design validation
```

#### Test Data Generation
```bash
claude-flow test --generate-data

# Creates realistic test data:
# • User profiles
# • Product catalogs
# • Transaction histories
# • Real-world scenarios
# • Localized content
```

---

## 3. `claude-flow deploy`

### Purpose
Intelligent deployment with environment detection, CI/CD setup, and rollback capabilities.

### Syntax
```bash
claude-flow deploy [environment] [options]
```

### Environments
- `development` - Local development deployment
- `staging` - Staging environment for testing
- `production` - Production deployment
- `preview` - Preview deployment for reviews

### Options
- `--auto-setup` - Automatically configure CI/CD
- `--rollback` - Rollback to previous version
- `--dry-run` - Show deployment plan without executing
- `--monitor` - Enable monitoring after deployment
- `--zero-downtime` - Use blue-green deployment

### Examples

#### First-Time Production Deployment
```bash
claude-flow deploy production --auto-setup

# Output:
# 🚀 Production Deployment Setup
#
# 🔍 Analyzing application...
# Type: React SPA with Node.js API
# Database: PostgreSQL
# Dependencies: 23 packages
#
# 🛠️ Setting up infrastructure...
# ✅ Created production database
# ✅ Configured environment variables
# ✅ Set up SSL certificates
# ✅ Configured CDN
# ✅ Set up monitoring
#
# 📦 Building application...
# ✅ Optimized bundle (2.1MB → 847KB)
# ✅ Generated source maps
# ✅ Compressed assets
#
# 🌐 Deploying...
# ✅ Deployed to https://your-app.com
# ✅ Health checks passing
# ✅ Performance metrics: A+
#
# 🔄 Setting up CI/CD...
# ✅ GitHub Actions configured
# ✅ Automatic testing enabled
# ✅ Deployment hooks created
```

#### Staging Deployment
```bash
claude-flow deploy staging

# Output:
# 🧪 Staging Deployment
#
# 🔄 Preparing staging environment...
# ✅ Database migrated
# ✅ Test data seeded
# ✅ Feature flags configured
#
# 📦 Deploying build #47...
# ✅ Application deployed
# ✅ Health checks passed
# ✅ Integration tests passed
#
# 🌐 Available at: https://staging.your-app.com
# 🔗 Preview link: https://staging.your-app.com/preview/47
```

#### Rollback Deployment
```bash
claude-flow deploy --rollback

# Output:
# ⏪ Deployment Rollback
#
# Current: v1.2.3 (deployed 2 hours ago)
# Previous versions:
# • v1.2.2 (stable, 2 days ago)
# • v1.2.1 (stable, 1 week ago)
# • v1.2.0 (stable, 2 weeks ago)
#
# ? Select version to rollback to: v1.2.2
#
# 🔄 Rolling back to v1.2.2...
# ✅ Database migrations reverted
# ✅ Application rolled back
# ✅ Health checks passing
# ✅ Rollback completed in 1.2 minutes
```

#### Zero-Downtime Deployment
```bash
claude-flow deploy production --zero-downtime

# Output:
# 🔄 Zero-Downtime Deployment (Blue-Green)
#
# 🔵 Blue Environment (current):
# • Version: v1.2.3
# • Status: Active
# • Traffic: 100%
#
# 🟢 Green Environment (new):
# • Version: v1.3.0
# • Status: Preparing...
#
# 📦 Deploying to green environment...
# ✅ Application built and deployed
# ✅ Health checks passed
# ✅ Smoke tests passed
#
# 🔄 Switching traffic...
# • 0% → 10% → 50% → 100%
# ✅ Traffic switched successfully
# ✅ Zero downtime achieved
```

### Advanced Deployment Features

#### Environment Management
```bash
# Auto-detect optimal deployment strategy
claude-flow deploy --analyze

# Configure multiple environments
claude-flow deploy setup --environments "dev,staging,prod"

# Environment-specific configurations
claude-flow deploy staging --config "staging.env"
```

#### Performance Optimization
```bash
# Deploy with optimizations
claude-flow deploy production --optimize

# Results:
# • Code splitting enabled
# • Tree shaking applied
# • Images compressed
# • CDN configured
# • Caching optimized
```

#### Monitoring Integration
```bash
# Deploy with monitoring
claude-flow deploy production --monitor

# Sets up:
# • Error tracking
# • Performance monitoring
# • Uptime monitoring
# • User analytics
# • Alert notifications
```

---

## 4. `claude-flow optimize`

### Purpose
AI-powered performance optimization for code, databases, and infrastructure.

### Syntax
```bash
claude-flow optimize [target] [options]
```

### Optimization Targets
- `code` - Code-level optimizations
- `bundle` - Bundle size optimization
- `database` - Database query optimization
- `images` - Image compression and optimization
- `api` - API response time optimization
- `memory` - Memory usage optimization
- `startup` - Application startup time

### Options
- `--analyze` - Analyze without making changes
- `--apply` - Apply suggested optimizations
- `--benchmark` - Run performance benchmarks
- `--report` - Generate optimization report

### Examples

#### Comprehensive Performance Analysis
```bash
claude-flow optimize --analyze

# Output:
# ⚡ Performance Analysis Report
#
# 🎯 Overall Performance Score: C+ (68/100)
#
# 📊 Optimization Opportunities:
#
# High Impact (estimated 40% improvement):
# • Bundle size: 3.2MB → 1.1MB (code splitting)
# • Database queries: 89 N+1 queries found
# • Images: 2.1MB → 445KB (compression)
#
# Medium Impact (estimated 15% improvement):
# • API endpoints: 3 slow queries (>500ms)
# • Memory leaks: 2 components not unmounting properly
# • CSS: 67% unused styles
#
# Low Impact (estimated 5% improvement):
# • Async loading: 12 synchronous operations
# • Caching: 15 cacheable resources
# • Code: 23 performance anti-patterns
#
# 🚀 Estimated total improvement: 60% faster
# ⏱️ Optimization time: 15-20 minutes
```

#### Bundle Size Optimization
```bash
claude-flow optimize bundle

# Output:
# 📦 Bundle Size Optimization
#
# 🔍 Analyzing bundle composition...
# Current size: 3.2MB (uncompressed)
#
# 📊 Size breakdown:
# • React: 42KB (1.3%)
# • Lodash: 487KB (15.2%) ⚠️
# • Moment.js: 234KB (7.3%) ⚠️
# • Your code: 892KB (27.8%)
# • Dependencies: 1.5MB (46.9%)
# • Assets: 67KB (2.1%)
#
# 🎯 Optimization plan:
# • Replace Lodash with native methods: -234KB
# • Replace Moment.js with date-fns: -178KB
# • Code splitting by routes: -892KB lazy loaded
# • Tree shaking unused code: -156KB
# • Image optimization: -45KB
#
# ⚡ Applying optimizations...
# ✅ Lodash functions replaced
# ✅ Moment.js replaced with date-fns
# ✅ Route-based code splitting added
# ✅ Unused code removed
# ✅ Images compressed
#
# 📈 Results:
# Before: 3.2MB
# After: 1.1MB (65% reduction)
# Initial load: 445KB (86% reduction)
```

#### Database Optimization
```bash
claude-flow optimize database

# Output:
# 🗄️ Database Optimization
#
# 🔍 Analyzing query patterns...
# • Total queries analyzed: 1,247
# • Slow queries found: 23
# • N+1 queries found: 89
# • Missing indexes: 12
#
# 🎯 High impact optimizations:
#
# 1. Add database indexes:
#    • users.email (used in 45% of queries)
#    • posts.created_at (used in 67% of queries)
#    • comments.post_id (N+1 query source)
#
# 2. Fix N+1 queries:
#    • User posts loading (89 queries → 1 query)
#    • Comment authors (67 queries → 1 query)
#
# 3. Query optimization:
#    • getUsersWithPosts: 2.3s → 45ms
#    • getPostComments: 1.1s → 23ms
#
# ⚡ Applying optimizations...
# ✅ Database indexes created
# ✅ N+1 queries fixed with eager loading
# ✅ Slow queries optimized
#
# 📈 Results:
# • Average query time: 234ms → 67ms (71% faster)
# • Database load: -89%
# • User-perceived performance: +156%
```

#### Memory Optimization
```bash
claude-flow optimize memory

# Output:
# 🧠 Memory Optimization
#
# 🔍 Memory usage analysis...
# Current usage: 127MB average, 203MB peak
#
# 🎯 Memory issues found:
#
# Memory Leaks:
# • UserProfile component: Event listeners not cleaned up
# • DataTable component: State not clearing on unmount
# • WebSocket connection: Not closing properly
#
# Inefficient Patterns:
# • Large objects in state: 23MB user cache
# • Unnecessary re-renders: 67 components
# • Heavy computations: 12 non-memoized calculations
#
# ⚡ Applying fixes...
# ✅ Added cleanup in useEffect hooks
# ✅ Implemented proper component unmounting
# ✅ Added memoization for expensive calculations
# ✅ Optimized state management
# ✅ Added virtual scrolling for large lists
#
# 📈 Results:
# • Memory usage: 127MB → 54MB (57% reduction)
# • Peak usage: 203MB → 89MB (56% reduction)
# • Garbage collection frequency: -73%
```

### Advanced Optimization Features

#### AI-Powered Code Analysis
```bash
claude-flow optimize code --deep-analysis

# Analyzes:
# • Algorithm complexity
# • Code patterns
# • Performance bottlenecks
# • Best practice violations
# • Framework-specific optimizations
```

#### Continuous Optimization
```bash
claude-flow optimize --monitor

# Sets up:
# • Performance monitoring
# • Automatic optimization alerts
# • Regression detection
# • Performance budgets
# • Optimization recommendations
```

---

## 5. `claude-flow review`

### Purpose
AI-powered code review with security analysis, best practices, and quality metrics.

### Syntax
```bash
claude-flow review [scope] [options]
```

### Review Scopes
- `all` - Complete codebase review
- `changes` - Review recent changes only
- `security` - Security-focused review
- `performance` - Performance analysis
- `style` - Code style and conventions
- `architecture` - System design review

### Options
- `--fix` - Automatically fix issues where possible
- `--report` - Generate detailed review report
- `--severity <level>` - Filter by issue severity
- `--interactive` - Interactive review mode

### Examples

#### Comprehensive Code Review
```bash
claude-flow review all

# Output:
# 👀 Comprehensive Code Review
#
# 📊 Review Summary:
# Files analyzed: 47
# Lines of code: 8,234
# Issues found: 23
# Auto-fixable: 15
#
# 🚨 Critical Issues (2):
# • SQL injection vulnerability in UserService.js:45
# • Hardcoded API key in config.js:12
#
# ⚠️ Warning Issues (8):
# • Unused imports (5 files)
# • Console.log statements in production code
# • Missing error handling in async functions
# • Deprecated API usage (React.createClass)
#
# 💡 Suggestions (13):
# • Extract magic numbers to constants
# • Add JSDoc comments to public methods
# • Consider using TypeScript for better type safety
# • Implement proper logging instead of console
#
# 🎯 Code Quality Score: B- (73/100)
# 🔒 Security Score: C+ (68/100)
# ⚡ Performance Score: A- (87/100)
```

#### Security-Focused Review
```bash
claude-flow review security

# Output:
# 🔒 Security Review Report
#
# 🛡️ Security Analysis Complete
#
# 🚨 Critical Vulnerabilities (2):
#
# 1. SQL Injection Risk
#    File: src/services/UserService.js:45
#    Code: `SELECT * FROM users WHERE id = ${userId}`
#    Risk: High
#    Fix: Use parameterized queries
#
# 2. Hardcoded Credentials
#    File: src/config.js:12
#    Code: `API_KEY = "sk_live_12345..."`
#    Risk: Critical
#    Fix: Move to environment variables
#
# ⚠️ Medium Risk Issues (5):
# • Missing CSRF protection on forms
# • Weak password validation (no complexity requirements)
# • JWT tokens not validated properly
# • User input not sanitized before display
# • Missing rate limiting on API endpoints
#
# 💡 Security Recommendations:
# • Implement Content Security Policy
# • Add input validation middleware
# • Use HTTPS-only cookies
# • Enable security headers
# • Add dependency vulnerability scanning
#
# 🎯 Security Score: D+ (45/100)
# 📋 Action Items: 7 critical, 5 medium, 8 low priority
```

#### Performance Review
```bash
claude-flow review performance

# Output:
# ⚡ Performance Review
#
# 🔍 Performance Analysis Complete
#
# 🐌 Performance Issues Found:
#
# Critical (3):
# • Heavy computation in render function (UserList.jsx:34)
#   Impact: Blocks UI for 200ms on each render
#   Fix: Move to useMemo or useCallback
#
# • Synchronous API call in component mount (Dashboard.jsx:12)
#   Impact: 1.2s delay in page rendering
#   Fix: Use async/await with loading state
#
# • Large bundle loaded synchronously (App.js:5)
#   Impact: 3.2MB initial download
#   Fix: Implement code splitting
#
# Warning (7):
# • Non-optimized images (average 2.1MB each)
# • Inline styles causing re-renders
# • Missing React.memo on pure components
# • Expensive operations in useEffect without dependencies
#
# 📊 Performance Metrics:
# • First Contentful Paint: 2.1s (target: <1.5s)
# • Largest Contentful Paint: 3.4s (target: <2.5s)
# • Time to Interactive: 4.2s (target: <3.5s)
# • Cumulative Layout Shift: 0.15 (target: <0.1)
#
# 🎯 Performance Score: C+ (67/100)
# 📈 Potential improvement: 45% faster with fixes
```

#### Interactive Review Mode
```bash
claude-flow review --interactive

# Starts interactive session:
# 👀 Interactive Code Review
#
# Issue 1 of 23:
# 🚨 Critical: SQL Injection Vulnerability
# File: src/services/UserService.js:45
# Code: SELECT * FROM users WHERE id = ${userId}
#
# 🔧 Suggested fix:
# const query = 'SELECT * FROM users WHERE id = ?';
# const result = await db.query(query, [userId]);
#
# Options:
# 1. Apply fix automatically
# 2. Show more context
# 3. Skip this issue
# 4. Mark as false positive
# 5. Exit review
#
# Choose (1-5): 1
# ✅ Fix applied successfully
#
# Issue 2 of 23:
# [Continue with next issue...]
```

### Auto-Fix Capabilities

#### Automatic Issue Resolution
```bash
claude-flow review --fix

# Automatically fixes:
# • Unused imports
# • Missing semicolons
# • Inconsistent indentation
# • Simple security issues
# • Code style violations
# • Deprecated API usage
```

#### Smart Suggestions
```bash
claude-flow review changes --fix

# For recent changes:
# • Suggests better patterns
# • Fixes common mistakes
# • Applies coding standards
# • Optimizes new code
# • Maintains consistency
```

---

## 🎓 Intermediate Tier Mastery Path

### Month 1: Agent Management
**Week 1**: Learn direct agent control
- Spawn different agent types
- Monitor agent performance
- Understand agent capabilities

**Week 2**: Agent coordination
- Use multiple agents together
- Create agent workflows
- Optimize agent performance

### Month 2: Quality & Testing
**Week 3**: Master testing
- Generate comprehensive tests
- Run different test types
- Use continuous testing

**Week 4**: Code quality focus
- Use review for all changes
- Fix security issues
- Optimize performance

### Month 3: Deployment & Operations
**Week 5**: Deployment mastery
- Deploy to different environments
- Set up CI/CD pipelines
- Handle rollbacks

**Week 6**: Performance optimization
- Analyze and fix bottlenecks
- Optimize databases
- Monitor performance

### Graduation to Expert
After mastering intermediate commands:
- ✅ Used 25+ commands total
- ✅ Tried 10+ different commands
- ✅ 85%+ success rate
- ✅ Comfortable with direct agent management
- ✅ Understanding of advanced Claude Flow concepts

**Next**: [Expert Tier Commands](./expert-tier.md) - Full access to 112+ MCP tools