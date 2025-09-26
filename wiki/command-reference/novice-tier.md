# Novice Tier Commands

> **5 essential commands to get started with Claude Flow**

The Novice tier is designed for newcomers to Claude Flow. These commands provide a simple, natural language interface with intelligent defaults and guided assistance.

## 🎯 Core Philosophy

- **Natural Language First**: Describe what you want in plain English
- **Intelligent Defaults**: System makes smart choices for you
- **Guided Learning**: Each command teaches you something new
- **Safety First**: Built-in protection against common mistakes

## 📋 Command Overview

| Command | Purpose | Complexity | Usage Frequency |
|---------|---------|------------|-----------------|
| `init` | Project initialization | ⭐ | Once per project |
| `build` | Feature development | ⭐⭐ | Daily |
| `status` | Check project health | ⭐ | Multiple times daily |
| `help` | Get assistance | ⭐ | As needed |
| `learn` | Unlock new features | ⭐ | Weekly |

---

## 1. `claude-flow init`

### Purpose
Initialize a new project with intelligent project detection and setup.

### Syntax
```bash
claude-flow init [project-type] [options]
```

### Options
- `--template <name>` - Use a specific project template
- `--interactive` / `-i` - Interactive setup wizard
- `--skip-git` - Skip Git repository initialization
- `--help` - Show command help

### How It Works
1. **Detects Context**: Analyzes current directory for existing projects
2. **Smart Inference**: Guesses project type from files and dependencies
3. **Creates Structure**: Sets up appropriate folder structure
4. **Configures Environment**: Adds necessary config files
5. **Initializes Git**: Sets up version control (unless skipped)
6. **Generates Starter Code**: Creates basic working examples

### Examples

#### Basic Initialization
```bash
# Let Claude Flow detect and setup everything automatically
claude-flow init

# Output:
# 🚀 Initializing new Claude Flow project...
# 📁 Created web project structure
# ⚙️ Configured development environment
# 🔄 Initialized Git repository
# 🎨 Generating starter code...
# ✅ Successfully initialized web project!
```

#### Specify Project Type
```bash
# Create a specific type of project
claude-flow init react
claude-flow init "API server"
claude-flow init "mobile app"

# Natural language works too!
claude-flow init "create a todo application"
```

#### Interactive Setup
```bash
# Get guided setup with questions and choices
claude-flow init --interactive

# Example interaction:
# ? What type of project? (Use arrow keys)
# ❯ Web Application (React/Vue/Angular)
#   API/Backend (Express/FastAPI)
#   Mobile App
#   Desktop App
#   Machine Learning
```

### Project Types Supported
- **Web**: React, Vue, Angular applications
- **API**: REST APIs, GraphQL servers
- **Mobile**: React Native, Expo apps
- **Desktop**: Electron applications
- **ML**: Python data science projects

### Common Use Cases

#### 1. Starting Fresh
```bash
# In an empty directory
mkdir my-new-project
cd my-new-project
claude-flow init

# System will ask what you want to build
```

#### 2. Existing Project Enhancement
```bash
# In a project with some files
cd existing-project
claude-flow init

# Detects existing structure and enhances it
```

#### 3. Template-Based Start
```bash
# Use a proven template
claude-flow init --template "e-commerce"
claude-flow init --template "blog"
claude-flow init --template "dashboard"
```

### Troubleshooting

#### Permission Errors
```bash
# If you get permission errors:
sudo claude-flow init --skip-git
# Then initialize git manually later
```

#### Directory Not Empty
```bash
# System will ask before overwriting files
# Choose 'enhance' to add to existing project
# Choose 'backup' to backup and replace
```

#### Git Issues
```bash
# Skip git if having issues
claude-flow init --skip-git
# Initialize git manually later: git init
```

### Success Indicators
- ✅ Project structure created
- ✅ Package.json/requirements.txt created
- ✅ Basic config files added
- ✅ Starter code generated
- ✅ Git repository initialized

### Next Steps After Init
```bash
# Check what was created
claude-flow status

# Start building features
claude-flow build "user authentication"

# Learn more about the system
claude-flow learn
```

---

## 2. `claude-flow build`

### Purpose
Build features using AI agents with natural language descriptions. The heart of Claude Flow development.

### Syntax
```bash
claude-flow build [feature-description] [options]
```

### Options
- `--agent <type>` - Prefer specific agent type
- `--parallel` - Enable parallel execution
- `--dry-run` - Show planned execution without running
- `--interactive` - Interactive feature planning
- `--help` - Show command help

### How It Works
1. **Parse Intent**: Understands what you want to build
2. **Analyze Context**: Examines your existing project
3. **Plan Workflow**: Breaks down the task into steps
4. **Select Agents**: Chooses appropriate AI agents
5. **Execute Workflow**: Runs the planned steps
6. **Integrate Results**: Ensures everything works together

### Natural Language Patterns

#### Adding Features
```bash
claude-flow build "add user authentication"
claude-flow build "create a contact form"
claude-flow build "implement dark mode"
claude-flow build "add search functionality"
```

#### Creating Components
```bash
claude-flow build "create a navigation bar"
claude-flow build "build a product carousel"
claude-flow build "make a responsive footer"
```

#### Backend Development
```bash
claude-flow build "create REST API for users"
claude-flow build "add database integration"
claude-flow build "implement JWT authentication"
claude-flow build "create payment processing"
```

#### Testing & Quality
```bash
claude-flow build "add unit tests"
claude-flow build "implement error handling"
claude-flow build "optimize performance"
claude-flow build "add logging system"
```

### Examples

#### Simple Feature Addition
```bash
claude-flow build "add user login"

# Output:
# 🧠 Analyzing task requirements...
# 🎯 Task Analysis:
#    Intent: authentication
#    Domain: frontend
#    Complexity: ★★★ (3/5)
#    Estimated Time: 15-20 minutes
#    Confidence: 92%
#
# 🤖 Recommended Agents:
#    • researcher (requirements) - 3 minutes
#    • coder (implementation) - 12 minutes
#    • tester (validation) - 5 minutes
#
# 📋 Workflow Steps:
#    1. 🔄 Research authentication patterns
#    2. ⚡ Create login component
#    3. ⚡ Implement authentication logic
#    4. 🔄 Add form validation
#    5. 🔄 Create tests
```

#### Complex Multi-Feature Build
```bash
claude-flow build "create a complete e-commerce product page with cart, reviews, and recommendations"

# System breaks this down into multiple coordinated agents
```

#### Interactive Planning
```bash
claude-flow build --interactive

# Guided conversation:
# 🤔 What would you like to build?
# > I want to add user profiles
#
# 🎯 I understand you want user profiles. Let me clarify:
# ? Should this include:
#   ✓ Profile creation/editing
#   ✓ Avatar upload
#   ✓ Privacy settings
#   ? Social features (friends, followers)?
```

#### Dry Run (Planning Mode)
```bash
claude-flow build "add shopping cart" --dry-run

# Shows the complete plan without executing:
# 🔍 Dry run completed - showing planned execution
#
# Planned Workflow:
# 1. Research cart patterns (2 min)
# 2. Create cart component (8 min)
# 3. Implement cart logic (10 min)
# 4. Add persistence (5 min)
# 5. Create tests (7 min)
#
# Total estimated time: 32 minutes
# Required files: 6 new, 3 modified
```

### Agent Types Used

#### 🔍 Researcher
- Analyzes requirements
- Studies best practices
- Plans implementation approach
- Identifies potential issues

#### 💻 Coder
- Writes clean, maintainable code
- Follows project conventions
- Implements features efficiently
- Handles edge cases

#### 🧪 Tester
- Creates comprehensive tests
- Validates functionality
- Checks edge cases
- Ensures quality standards

#### 👀 Reviewer
- Reviews code quality
- Checks security issues
- Ensures best practices
- Suggests improvements

### Common Patterns

#### "I need..."
```bash
claude-flow build "I need a way for users to reset their password"
claude-flow build "I need to display data in a table"
claude-flow build "I need to validate form inputs"
```

#### "How do I..."
```bash
claude-flow build "How do I add authentication to my API?"
claude-flow build "How do I make my site responsive?"
claude-flow build "How do I optimize my database queries?"
```

#### "Create/Add/Build"
```bash
claude-flow build "Create a dashboard with charts"
claude-flow build "Add real-time notifications"
claude-flow build "Build a comment system"
```

### Troubleshooting

#### Vague Descriptions
```bash
# ❌ Too vague
claude-flow build "make it better"

# ✅ Be specific
claude-flow build "improve page loading speed by optimizing images and adding caching"
```

#### Context Missing
```bash
# ❌ No context
claude-flow build "add login"

# ✅ With context
claude-flow build "add user login with email and password for my React app"
```

#### Too Complex
```bash
# ❌ Too much at once
claude-flow build "rebuild the entire application with new framework and database"

# ✅ Break it down
claude-flow build "migrate user authentication from session to JWT"
```

### Success Indicators
- ✅ Task successfully analyzed
- ✅ Appropriate agents selected
- ✅ Workflow executed without errors
- ✅ Tests passing
- ✅ Code integrated into project

---

## 3. `claude-flow status`

### Purpose
Check your project status, agent activity, and overall system health.

### Syntax
```bash
claude-flow status [options]
```

### Options
- `--detailed` / `-d` - Show comprehensive information
- `--watch` / `-w` - Monitor status in real-time
- `--format <type>` - Output format (table, json, summary)
- `--help` - Show command help

### What It Shows

#### Project Information
- Project type and framework
- Languages and technologies used
- Git status and branch information
- Dependencies and packages

#### Your Progress
- Current tier level
- Commands used and experience
- Available commands
- Next tier requirements

#### System Status
- Active agents and their status
- Memory usage and performance
- Recent activity and logs
- Error conditions

#### Health Indicators
- Project configuration health
- Dependency status
- Test coverage
- Performance metrics

### Examples

#### Basic Status Check
```bash
claude-flow status

# Output:
# 📊 Project Status Dashboard
#
# 🏗️  Project Type: Web Application
# ⚡ Framework: React
# 📝 Languages: TypeScript, CSS
#
# 👤 Your Progress:
#    Current Tier: NOVICE
#    Commands Used: 8
#    Available Commands: 5
#    Next Tier: Use 2 more commands and try 1 different command
#
# 🤖 System Status:
#    Active Agents: 0
#    Memory Usage: 12MB
#    Avg Response: 1.2s
```

#### Detailed Status
```bash
claude-flow status --detailed

# Additional information:
# 📈 Detailed Metrics:
#    Git Initialized: ✅
#    Has Tests: ✅
#    Has CI/CD: ❌
#    Dependencies: 24
#    Bundle Size: 2.1MB
#    Test Coverage: 67%
#    Performance Score: B+
```

#### Watch Mode (Real-time)
```bash
claude-flow status --watch

# Updates every 2 seconds with live information
# Press Ctrl+C to exit
#
# 🔄 Live Status (updates every 2s)
# Active Agents: 2 (coder, tester)
# Current Task: "implementing user authentication"
# Progress: 45% complete
# ETA: 8 minutes
```

#### JSON Format
```bash
claude-flow status --format json

# Returns machine-readable JSON for scripting
{
  "project": {
    "type": "web",
    "framework": "react",
    "languages": ["typescript", "css"]
  },
  "progress": {
    "tier": "novice",
    "commandsUsed": 8,
    "availableCommands": 5
  },
  "system": {
    "activeAgents": 0,
    "memoryUsage": "12MB",
    "avgResponseTime": "1.2s"
  }
}
```

### Status Indicators

#### 🟢 Healthy
- All systems operational
- No blocking issues
- Good performance

#### 🟡 Warning
- Minor issues detected
- Performance degradation
- Recommendations available

#### 🔴 Error
- Critical issues present
- Blocking problems
- Immediate attention needed

### Common Use Cases

#### Daily Health Check
```bash
# Quick morning check
claude-flow status

# Look for any issues that developed overnight
```

#### Before Building
```bash
# Check if system is ready
claude-flow status

# Ensure no blocking issues before starting work
```

#### Debugging Issues
```bash
# When something's not working
claude-flow status --detailed

# Look for error indicators and recent activity
```

#### Progress Tracking
```bash
# See how close you are to tier upgrade
claude-flow status

# Track your learning journey
```

### Understanding Output

#### Project Health
- **Git Initialized**: Version control setup
- **Has Tests**: Testing framework configured
- **Has CI/CD**: Continuous integration setup
- **Dependencies**: Package count and status

#### Performance Metrics
- **Memory Usage**: System resource consumption
- **Avg Response**: Command execution speed
- **Bundle Size**: Application size
- **Test Coverage**: Code coverage percentage

#### Agent Activity
- **Active Agents**: Currently running AI agents
- **Recent Tasks**: Latest completed operations
- **Queue Status**: Pending operations

### Troubleshooting

#### No Project Detected
```bash
# If status shows "Unknown" project:
cd your-project-directory
claude-flow init  # Initialize if needed
```

#### Poor Performance
```bash
# If response times are slow:
claude-flow status --detailed
# Look for memory issues or too many active agents
```

#### Tier Not Progressing
```bash
# If stuck at current tier:
claude-flow learn  # See specific requirements
# Try using different commands to gain variety
```

---

## 4. `claude-flow help`

### Purpose
Get contextual, intelligent help that adapts to your current tier and project context.

### Syntax
```bash
claude-flow help [command] [options]
```

### Options
- `--interactive` / `-i` - Interactive help system
- `--examples` - Show practical examples
- `--new-features` - Show recently unlocked features
- `--help` - Meta help (help about help)

### Types of Help

#### General Help
Shows available commands for your current tier with usage examples.

#### Command-Specific Help
Detailed information about a specific command, including examples and troubleshooting.

#### Interactive Help
Guided assistance with questions and contextual recommendations.

#### Contextual Help
Help that understands your project type and current situation.

### Examples

#### General Help
```bash
claude-flow help

# Output:
# 🎯 Claude Flow - AI-Powered Development CLI
#
# Your current tier: NOVICE (5 commands available)
#
# Available Commands:
#   init         Initialize a new project with intelligent defaults
#   build        Build features using AI agents with natural language
#   status       Check project status, agents, and recent activity
#   help         Get contextual help and learn new commands
#   learn        Learn advanced features and unlock new commands
#
# Tip: Use natural language with build command!
# Example: claude-flow build "add user login with JWT"
```

#### Command-Specific Help
```bash
claude-flow help build

# Output:
# 📖 Help: build
#
# Description: Build features using AI agents with natural language
# Usage: claude-flow build [feature-description] [options]
# Category: development
# Complexity: ★★
#
# Examples:
#    claude-flow build "add user authentication"
#    claude-flow build "create REST API"
#    claude-flow build
```

#### Interactive Help
```bash
claude-flow help --interactive

# Starts guided help session:
# 🤔 Interactive Help - What would you like to learn about?
#
# 1. Getting started with Claude Flow
# 2. Building your first feature
# 3. Understanding the tier system
# 4. Project setup and configuration
# 5. Troubleshooting common issues
# 6. Natural language tips
#
# Choose a topic (1-6):
```

#### Help with Examples
```bash
claude-flow help build --examples

# Shows extensive examples:
# Examples:
#    claude-flow build "add user authentication"
#    claude-flow build "create REST API"
#    claude-flow build "implement dark mode"
#    claude-flow build "add search functionality"
#    claude-flow build "create responsive navigation"
#    claude-flow build "add form validation"
#    claude-flow build "implement error handling"
#    claude-flow build "optimize performance"
```

#### New Features Help
```bash
claude-flow help --new-features

# Shows recently unlocked features:
# 🆕 New Features Available
#
# ✨ agents
#    Direct agent management and spawning
#    Usage: claude-flow agents <action> [options]
#    Example: claude-flow agents spawn coder
```

### Contextual Intelligence

#### Project-Aware Help
```bash
# In a React project
claude-flow help build

# Shows React-specific examples:
# Examples for React projects:
#    claude-flow build "add React Router navigation"
#    claude-flow build "create reusable components"
#    claude-flow build "add state management with Redux"
```

#### Tier-Aware Help
```bash
# As a novice user
claude-flow help

# Shows only novice commands and simple examples

# As expert user (later)
claude-flow help

# Shows all 112 commands with advanced options
```

#### Situation-Aware Help
```bash
# When an error just occurred
claude-flow help

# Includes troubleshooting section:
# 🚨 Recent Issues Detected:
#    • Build failed due to missing dependency
#    • Suggestion: Run 'npm install' or use 'claude-flow build "fix dependencies"'
```

### Help Categories

#### Getting Started
```bash
claude-flow help init      # Project setup
claude-flow help build     # Feature development
claude-flow help status    # Monitoring
```

#### Learning & Growth
```bash
claude-flow help learn     # Tier progression
claude-flow help --new-features  # Recently unlocked
```

#### Troubleshooting
```bash
claude-flow help --interactive  # Guided problem solving
# Select "Troubleshooting" for step-by-step help
```

### Common Help Patterns

#### "How do I..."
```bash
# Natural language help works!
claude-flow help "how do I add authentication"
claude-flow help "how to deploy my app"
claude-flow help "how to improve performance"
```

#### Specific Situations
```bash
claude-flow help error      # Help with recent errors
claude-flow help deploy     # Deployment guidance
claude-flow help testing    # Testing strategies
```

#### Quick References
```bash
claude-flow help syntax     # Command syntax reference
claude-flow help examples   # Example library
claude-flow help shortcuts  # Keyboard shortcuts
```

### Pro Tips

#### Use Context
```bash
# Help understands your situation
cd react-project
claude-flow help build  # Shows React-specific help

cd api-project
claude-flow help build  # Shows API-specific help
```

#### Combine with Other Commands
```bash
claude-flow status && claude-flow help
# Check status first, then get contextual help
```

#### Progressive Learning
```bash
# Help evolves as you grow
claude-flow help          # Shows current tier help
claude-flow learn         # Unlock new features
claude-flow help          # Now shows new options
```

---

## 5. `claude-flow learn`

### Purpose
Learn advanced features, unlock new commands, and track your progression through the tier system.

### Syntax
```bash
claude-flow learn [topic] [options]
```

### Options
- `--level <beginner|intermediate|advanced>` - Set learning level
- `--interactive` / `-i` - Interactive learning modules
- `--topic <name>` - Focus on specific topic
- `--help` - Show learning system help

### Learning Dashboard

When you run `claude-flow learn` without arguments, you see your personal learning dashboard:

```bash
claude-flow learn

# Output:
# 🎓 Learning Dashboard
#
# Current Level: NOVICE
# Progress: 8 commands used
# Next Goal: Use 2 more commands and try 1 different command to unlock Intermediate tier
#
# 📚 Learning Topics:
# • agents - Learn about AI agent types and capabilities
# • testing - Understand testing strategies and TDD
# • deployment - Master deployment and DevOps
# • optimization - Performance and code optimization
#
# 🎯 Recommended Next Steps:
# • Try the 'status' command to track your progress
# • Use 'build' with different types of features
# • Explore 'help --interactive' for guided learning
```

### Learning Topics

#### Agents
```bash
claude-flow learn agents

# Output:
# 🤖 Learning: AI Agents
#
# Claude Flow uses specialized AI agents for different tasks:
# • Researcher: Analyzes requirements and plans
# • Coder: Implements features and writes code
# • Tester: Creates and runs tests
# • Reviewer: Reviews code quality and security
#
# 🎯 How Agents Work:
# 1. You describe what you want in natural language
# 2. System analyzes your request and selects appropriate agents
# 3. Agents work together to complete the task
# 4. Results are integrated into your project
#
# 💡 Pro Tip: Let the system choose agents automatically for best results
```

#### Testing
```bash
claude-flow learn testing

# Output:
# 🧪 Learning: Testing Strategies
#
# Testing best practices with Claude Flow:
# • Write tests first (TDD approach)
# • Use the tester agent for comprehensive coverage
# • Integration tests ensure components work together
# • AI-generated tests cover edge cases you might miss
#
# 🎯 Test Types:
# • Unit Tests: Individual functions and components
# • Integration Tests: How parts work together
# • E2E Tests: Complete user workflows
# • Performance Tests: Speed and responsiveness
#
# 💡 Try: claude-flow build "add comprehensive tests for my auth system"
```

#### Deployment
```bash
claude-flow learn deployment

# Output:
# 🚀 Learning: Deployment
#
# Deployment options with Claude Flow:
# • Local development server
# • Staging environment for testing
# • Production deployment with CI/CD
# • Automatic rollback on failures
#
# 🎯 Deployment Strategies:
# • Blue-Green: Zero downtime deployments
# • Rolling: Gradual rollout
# • Canary: Test with small user group first
#
# 💡 Available at Intermediate tier: claude-flow deploy
```

#### Optimization
```bash
claude-flow learn optimization

# Output:
# ⚡ Learning: Performance Optimization
#
# Optimization techniques:
# • Bundle size optimization
# • Database query optimization
# • Caching strategies
# • Code splitting and lazy loading
# • Image and asset optimization
#
# 🎯 AI-Powered Optimization:
# • Automatic performance analysis
# • Intelligent suggestions
# • Code-level optimizations
# • Architecture improvements
#
# 💡 Try: claude-flow build "optimize my app's loading speed"
```

### Interactive Learning

```bash
claude-flow learn --interactive

# Starts guided learning experience:
# 🎓 Interactive Learning - Choose your path!
#
# What interests you most?
# 1. 🤖 Understanding AI Agents
# 2. 🏗️ Project Architecture
# 3. 🧪 Testing & Quality
# 4. 🚀 Deployment & DevOps
# 5. ⚡ Performance & Optimization
# 6. 🔒 Security Best Practices
#
# Choose (1-6): 1
#
# 🤖 AI Agent Deep Dive
#
# Let's explore how AI agents work together...
# [Interactive tutorial continues]
```

### Tier Progression

#### Understanding Tiers
```bash
claude-flow learn tiers

# Explains the tier system:
# 🎯 Tier System
#
# NOVICE (Current)
# • 5 essential commands
# • Natural language interface
# • Intelligent defaults
# • Guided learning
#
# INTERMEDIATE (Next Goal)
# • +10 commands (15 total)
# • Direct agent management
# • Testing & deployment tools
# • Performance optimization
#
# EXPERT (Ultimate Goal)
# • 112+ total commands
# • Full MCP tool access
# • Advanced neural features
# • Custom workflows
```

#### Tracking Progress
```bash
claude-flow learn progress

# Shows detailed progression metrics:
# 📈 Your Learning Journey
#
# Commands Mastered: 4/5 novice commands
# • ✅ init - Used 3 times
# • ✅ build - Used 4 times
# • ✅ status - Used 1 time
# • ❌ help - Not used yet
# • ❌ learn - Using now!
#
# Variety Score: 3/4 (need 1 more different command)
# Success Rate: 87% (need 80%+)
#
# 🎯 To unlock Intermediate:
# • Use 2 more commands total
# • Try the 'help' command
```

### Practical Learning Exercises

#### Beginner Exercises
```bash
claude-flow learn exercises

# Suggests hands-on activities:
# 🎯 Recommended Exercises
#
# For Novice Tier:
# 1. Initialize 3 different project types
# 2. Build a simple feature in each project
# 3. Check status before and after changes
# 4. Use help to learn about each command
# 5. Track your progress with learn
#
# Try this: claude-flow init "practice project"
```

#### Progressive Challenges
```bash
claude-flow learn challenges

# Shows tier-appropriate challenges:
# 🏆 Learning Challenges
#
# Novice Challenges:
# • 📝 "Hello World Plus" - Add a contact form to a basic website
# • 🔐 "Simple Auth" - Implement basic user login
# • 🎨 "Style Master" - Create a responsive design
# • 🧪 "Test Explorer" - Add tests to an existing feature
#
# Complete challenges to gain experience and unlock new tiers!
```

### Learning Tips

#### Effective Usage Patterns
```bash
# Daily learning routine:
claude-flow status     # Check your progress
claude-flow learn      # See learning opportunities
claude-flow build "something new"  # Apply knowledge
claude-flow help build # Deepen understanding
```

#### Experimentation
```bash
# Try different build patterns:
claude-flow build "create a simple blog"
claude-flow build "add a shopping cart"
claude-flow build "implement user profiles"
claude-flow build "optimize database queries"
```

#### Knowledge Retention
```bash
# Use help to reinforce learning:
claude-flow help build --examples
claude-flow learn testing
claude-flow build "add comprehensive tests"
```

### Common Questions

#### "How do I unlock new commands?"
Use commands regularly and try different types of features. The system tracks your usage and automatically upgrades your tier when ready.

#### "What should I learn first?"
Focus on the `build` command - it's the most powerful and teaches you the most about how Claude Flow works.

#### "How do I know what's available?"
Use `claude-flow help` to see your current capabilities and `claude-flow learn` to see what's coming next.

#### "Can I speed up progression?"
Quality over quantity - focus on successfully completing diverse tasks rather than repeating the same commands.

---

## 🎓 Novice Tier Success Path

### Week 1: Foundation
1. **Day 1**: `claude-flow init` your first project
2. **Day 2**: `claude-flow build` a simple feature
3. **Day 3**: `claude-flow status` to understand your project
4. **Day 4**: `claude-flow help` to explore options
5. **Day 5**: `claude-flow learn` to see your progress

### Week 2: Exploration
1. Try different project types with `init`
2. Build various features with `build`
3. Monitor your progress with `status`
4. Use `help` for different commands
5. Track learning with `learn`

### Week 3: Mastery
1. Build complex features that require multiple agents
2. Use natural language effectively
3. Understand project health indicators
4. Know when to use each command
5. Ready for Intermediate tier!

### Graduation Indicators
- ✅ Used 10+ commands total
- ✅ Tried 4+ different commands
- ✅ 80%+ success rate
- ✅ Comfortable with natural language interface
- ✅ Understanding of basic Claude Flow concepts

**Next**: [Intermediate Tier Commands](./intermediate-tier.md) - Direct agent control and advanced features