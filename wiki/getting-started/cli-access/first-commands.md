# Your First CLI Commands

**Get hands-on experience** with Claude Flow Novice CLI through these beginner-friendly commands. Perfect for your first 15 minutes!

## 🎯 Prerequisites

Ensure you have Claude Flow Novice installed:

```bash
# Check if installed
claude-flow-novice --version

# Or use npx (no installation needed)
npx claude-flow-novice@latest --version
```

## 🚀 Command 1: Check System Health

**Goal:** Verify everything is working correctly

```bash
# Check system status
npx claude-flow-novice@latest doctor

# Expected output:
✅ Node.js version: 20.x.x
✅ CLI installation: OK
✅ Configuration: Default settings loaded
✅ Dependencies: All packages available
🎉 System ready for agent orchestration!
```

**What this does:**
- Verifies your Node.js version compatibility
- Checks CLI installation integrity
- Validates configuration files
- Tests dependency availability

## 🤖 Command 2: List Available Agents

**Goal:** See what AI agents you can work with

```bash
# List all available agent types
npx claude-flow-novice@latest agents list

# Expected output:
🎭 Available Agents (54 total):

Core Development:
  • coder          - Write and refactor code
  • reviewer       - Code quality and security review
  • tester         - Test automation and coverage
  • architect      - System design and planning

Specialized:
  • github         - Repository management
  • api-docs       - API documentation
  • performance    - Performance optimization
  • security       - Security analysis

[... and 46 more agents]
```

**What this does:**
- Shows all 54+ available agent types
- Displays each agent's specialization
- Groups agents by category
- Helps you choose the right agent for your task

## 🌟 Command 3: Spawn Your First Agent

**Goal:** Create your first AI agent to help with a simple task

```bash
# Spawn a coder agent to create a simple function
npx claude-flow-novice@latest agent spawn coder "Create a JavaScript function that adds two numbers"

# Expected output:
🚀 Spawning Agent...
Agent Type: coder
Task: Create a JavaScript function that adds two numbers
Agent ID: coder-001-20241126

🤖 Agent coder-001 is working...
📝 Creating function implementation...
✅ Task completed successfully!

📁 Output saved to: ./output/coder-001/add-numbers.js
```

**What this does:**
- Spawns a specialized "coder" agent
- Gives it a specific programming task
- Shows real-time progress updates
- Saves the generated code to a file

**Check the result:**
```bash
# View the generated code
cat ./output/coder-001/add-numbers.js

# Should contain something like:
/**
 * Adds two numbers together
 * @param {number} a - First number
 * @param {number} b - Second number
 * @returns {number} Sum of a and b
 */
function addNumbers(a, b) {
  return a + b;
}

module.exports = { addNumbers };
```

## ⚡ Command 4: Initialize a Swarm

**Goal:** Create a group of agents working together

```bash
# Initialize a simple mesh swarm with 3 agents
npx claude-flow-novice@latest swarm init mesh --agents 3

# Expected output:
🕸️ Initializing Mesh Swarm...
├── Agent 1: coordinator-001 (Coordination)
├── Agent 2: analyst-002 (Analysis)
└── Agent 3: optimizer-003 (Optimization)

✅ Swarm initialized successfully!
Swarm ID: mesh-swarm-001
Topology: mesh (all agents connected)
Status: Ready for tasks
```

**What this does:**
- Creates a "mesh" topology where all agents can communicate
- Spawns 3 different specialized agents automatically
- Sets up coordination channels between agents
- Prepares the swarm for collaborative tasks

## 🔄 Command 5: Run a Simple SPARC Workflow

**Goal:** Experience the SPARC methodology for structured development

```bash
# Run a simple specification workflow
npx claude-flow-novice@latest sparc run spec "Build a todo list application"

# Expected output:
📋 Running SPARC Specification Phase...

🎯 Analyzing Requirements...
✅ User Stories: 5 identified
✅ Acceptance Criteria: 12 defined
✅ Technical Requirements: 8 specified
✅ Architecture Constraints: 3 noted

📝 Specification Complete!
Output: ./sparc-output/spec-todo-app.md

⏭️ Next Phase: Run 'sparc run pseudocode' to continue
```

**What this does:**
- Runs the "Specification" phase of SPARC methodology
- Analyzes requirements for a todo application
- Generates user stories and acceptance criteria
- Creates a foundation for the next development phases

**View the specification:**
```bash
# Check the generated specification
cat ./sparc-output/spec-todo-app.md
```

## 📊 Command 6: Monitor Agent Activity

**Goal:** Watch your agents work in real-time

```bash
# Monitor all active agents
npx claude-flow-novice@latest monitor

# Expected output:
📊 Agent Activity Monitor (Press Ctrl+C to exit)

Active Agents: 1
┌─────────────┬──────────┬────────────┬─────────────────┐
│ Agent ID    │ Type     │ Status     │ Current Task    │
├─────────────┼──────────┼────────────┼─────────────────┤
│ coder-001   │ coder    │ Working    │ Adding numbers  │
└─────────────┴──────────┴────────────┴─────────────────┘

Memory Usage: 45.2 MB
Task Queue: 0 pending
Last Update: 2024-11-26 10:30:15
```

**What this does:**
- Shows all currently active agents
- Displays their current status and tasks
- Monitors system resource usage
- Updates information in real-time

## 🎭 Command 7: Multi-Agent Collaboration

**Goal:** See multiple agents working together on a complex task

```bash
# Orchestrate a task across your swarm
npx claude-flow-novice@latest task orchestrate "Create a simple web server with tests"

# Expected output:
🎯 Orchestrating Task Across Swarm...

Swarm Analysis:
├── Breaking down task into subtasks...
├── Assigning agents based on expertise...
└── Setting up coordination protocols...

Agent Assignments:
🤖 coder-001: Implement Express.js server
🧪 tester-002: Write unit and integration tests
👀 reviewer-003: Review code quality and security

🚀 Task execution started...
[Live updates will show progress]
```

**What this does:**
- Automatically breaks down complex tasks
- Assigns subtasks to specialized agents
- Coordinates work between multiple agents
- Provides real-time progress updates

## 💾 Command 8: Check Memory and Results

**Goal:** Review what your agents have learned and created

```bash
# View agent memory
npx claude-flow-novice@latest memory show

# Check recent outputs
npx claude-flow-novice@latest results list

# Expected output:
🧠 Agent Memory Contents:
├── api-patterns/
├── code-examples/
├── test-strategies/
└── project-configs/

📂 Recent Results (last 24h):
├── add-numbers.js (coder-001)
├── spec-todo-app.md (sparc-spec)
├── server-tests.js (tester-002)
└── security-review.md (reviewer-003)
```

**What this does:**
- Shows what information agents have stored
- Lists recent outputs and generated files
- Helps you track progress across sessions
- Demonstrates persistent memory capabilities

## 🎉 Success! What You Just Learned

Congratulations! You've just completed your first Claude Flow Novice session. Here's what you accomplished:

### ✅ Core Skills Gained:
- **System verification** - Checking CLI health
- **Agent discovery** - Finding the right AI agents for tasks
- **Single agent spawning** - Creating specialized AI workers
- **Swarm coordination** - Orchestrating multiple agents
- **SPARC methodology** - Structured development approach
- **Real-time monitoring** - Watching agents work
- **Task orchestration** - Complex multi-agent collaboration
- **Memory management** - Accessing agent knowledge and outputs

### 🎯 Key Concepts Mastered:
- **Agents**: Specialized AI workers (coder, tester, reviewer, etc.)
- **Swarms**: Groups of agents working together
- **SPARC**: Systematic development methodology
- **Orchestration**: Coordinating complex tasks across agents
- **Memory**: Persistent storage of agent knowledge and outputs

## 🚀 Next Steps

Now that you've mastered the basics, here's your learning progression:

### Immediate Next Steps (Today):
1. **[Try the Quick Start Tutorial](../quick-start/cli-tutorial.md)** - Build a real project
2. **[Explore SPARC Methodology](../../core-concepts/sparc-methodology/README.md)** - Learn structured development
3. **[Practice with Examples](../../examples/basic-projects/README.md)** - Hands-on projects

### This Week:
1. **[Learn Advanced CLI Commands](../../command-reference/cli/README.md)** - Master all features
2. **[Understand Agent Specializations](../../core-concepts/agents/README.md)** - Choose the right agents
3. **[Try Complex Workflows](../../tutorials/intermediate/README.md)** - Multi-step projects

### This Month:
1. **[GitHub Integration](../../tutorials/advanced/github-integration/README.md)** - Automate repository workflows
2. **[CI/CD Pipelines](../../tutorials/advanced/ci-cd/README.md)** - Production automation
3. **[Custom Agents](../../tutorials/expert/custom-agents/README.md)** - Build specialized agents

## 🆘 Need Help?

- **Stuck on a command?** Check [Troubleshooting](../../troubleshooting/cli-issues.md)
- **Want more examples?** Browse [Command Reference](../../command-reference/cli/README.md)
- **Ready for projects?** Try [Quick Start Tutorial](../quick-start/cli-tutorial.md)

---

**🎊 Congratulations! You're now ready to orchestrate AI agents like a pro!**

**Next:** [Try the Complete Quick Start Tutorial →](../quick-start/cli-tutorial.md)