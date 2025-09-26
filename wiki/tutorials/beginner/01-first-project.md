# Tutorial: Your First Project - Todo App in 30 Minutes

**🎯 Goal:** Build a complete, tested web application using Claude Flow's AI-powered development

**⏱ Time:** 30 minutes
**📊 Difficulty:** Beginner
**🛠 Tech Stack:** React, Node.js, Express

## Overview

In this tutorial, you'll create a full-stack todo application from scratch using Claude Flow. You'll learn how to coordinate multiple AI agents to handle frontend, backend, testing, and deployment tasks simultaneously.

### What You'll Build
- ✅ React frontend with modern UI
- ✅ Express.js REST API backend
- ✅ Comprehensive test suite (90%+ coverage)
- ✅ Deployment-ready application
- ✅ Documentation and README

### What You'll Learn
- How to spawn and coordinate multiple agents
- CLI vs MCP approaches to agent management
- Quality assurance automation
- Real-time progress monitoring
- Best practices for agent coordination

## Prerequisites

- ✅ Node.js 18+ installed
- ✅ Git command line tools
- ✅ Basic JavaScript knowledge
- ✅ Text editor or IDE

## Step 1: Environment Setup (5 minutes)

### 🛠️ Setup Decision Flow
```
                    🔧 ENVIRONMENT SETUP WORKFLOW

    Start → Prerequisites Check
              │
              ▼
    ┌─────────────────────┐         ┌─────────────────────┐
    │  Node.js 18+ ?     │   NO    │  Install Node.js    │
    │  ✅ node --version │ ─────→  │  From nodejs.org    │
    └─────────────────────┘         │  Choose LTS version │
              │ YES                 └─────────────────────┘
              ▼                              │
    ┌─────────────────────┐                 ▼
    │  Git Available ?   │         ┌─────────────────────┐
    │  ✅ git --version  │   NO    │  Install Git        │
    └─────────────────────┘ ─────→  │  From git-scm.com  │
              │ YES                 └─────────────────────┘
              ▼                              │
    ┌─────────────────────┐                 ▼
    │ NPX Available ?    │         ┌─────────────────────┐
    │ ✅ npx --version   │   NO    │ Comes with Node.js  │
    └─────────────────────┘ ─────→  │ Reinstall Node.js   │
              │ YES                 └─────────────────────┘
              ▼                              │
    ┌─────────────────────┐                 ▼
    │ Claude Flow Test   │         ┌─────────────────────┐
    │ npx claude-flow@   │  FAIL   │ Check Network       │
    │ latest --version   │ ─────→  │ Try npx --clear-cache│
    └─────────────────────┘         └─────────────────────┘
              │ SUCCESS              │
              ▼                      ▼
    ┌─────────────────────┐ ←────────┘
    │ ✅ READY TO START  │
    │ Continue to Step 2  │
    └─────────────────────┘
```

### Check Your Setup
```bash
# Verify prerequisites
node --version  # Should be 18+
git --version   # Any recent version
npx --version   # Should be available

# Check Claude Flow access
npx claude-flow@latest --version
```

### Create Project Directory
```bash
# Create and enter project directory
mkdir my-first-app
cd my-first-app

# Initialize git repository
git init
echo "node_modules/" > .gitignore
echo ".env" >> .gitignore
```

**💡 Expected Output:**
```
Initialized empty Git repository in /path/to/my-first-app/.git/
```

## Step 2: Initialize Claude Flow Project (5 minutes)

### CLI Approach
```bash
# Initialize with smart defaults
npx claude-flow@latest init --project-type=fullstack --template=todo-app

# This automatically:
# ✓ Detects optimal agent team
# ✓ Sets up project structure
# ✓ Configures quality gates
# ✓ Prepares coordination hooks
```

### MCP Approach (Alternative)
If you have Claude Code with MCP integration:

```bash
# Initialize swarm topology
npx claude-flow@latest mcp swarm_init '{"topology": "mesh", "maxAgents": 4}'

# Define agent capabilities
npx claude-flow@latest mcp agent_spawn '{"type": "coder", "capabilities": ["react", "nodejs"]}'
npx claude-flow@latest mcp agent_spawn '{"type": "tester", "capabilities": ["jest", "e2e"]}'
npx claude-flow@latest mcp agent_spawn '{"type": "reviewer", "capabilities": ["security", "performance"]}'
```

**💡 Expected Output:**
```
🚀 Claude Flow Project Initialized!
📁 Project structure created
🤖 Optimal team selected: Frontend Dev, Backend Dev, Tester, Reviewer
⚙️  Configuration complete
✅ Ready to build!
```

## Step 3: Build the Application (15 minutes)

### 🏗️ Agent Coordination Build Flow
```
                        🤖 MULTI-AGENT BUILD WORKFLOW

    Build Command Input → Agent Team Assembly
                              │
                              ▼
                    ┌─────────────────────┐
                    │   MESH TOPOLOGY     │
                    │   COORDINATION      │
                    │                     │
                    │  4-6 Agents Working │
                    │  in Parallel        │
                    └─────────────────────┘
                              │
            ┌─────────────────┼─────────────────┐
            │                 │                 │
            ▼                 ▼                 ▼
    ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
    │ FRONTEND    │  │ BACKEND     │  │ DATABASE    │
    │ DEVELOPER   │  │ DEVELOPER   │  │ ARCHITECT   │
    │             │  │             │  │             │
    │ React Setup │  │ Express API │  │ Schema      │
    │ Components  │  │ Routes      │  │ Models      │
    │ State Mgmt  │  │ Middleware  │  │ Validation  │
    │ Styling     │  │ Error Hand. │  │ Relations   │
    └─────────────┘  └─────────────┘  └─────────────┘
            │                 │                 │
            └─────────────────┼─────────────────┘
                              │
            ┌─────────────────┼─────────────────┐
            │                 │                 │
            ▼                 ▼                 ▼
    ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
    │ SECURITY    │  │ TEST        │  │ CODE        │
    │ MANAGER     │  │ ENGINEER    │  │ REVIEWER    │
    │             │  │             │  │             │
    │ Auth/Auth   │  │ Unit Tests  │  │ Quality     │
    │ Validation  │  │ Integration │  │ Security    │
    │ Sanitize    │  │ E2E Tests   │  │ Performance │
    │ HTTPS       │  │ Coverage    │  │ Standards   │
    └─────────────┘  └─────────────┘  └─────────────┘
                              │
                              ▼
                    ┌─────────────────────┐
                    │   COORDINATION      │
                    │   HUB              │
                    │                     │
                    │ • Shared Memory     │
                    │ • Conflict Resolution│
                    │ • Progress Tracking │
                    │ • Quality Gates     │
                    └─────────────────────┘
                              │
                              ▼
                    ┌─────────────────────┐
                    │ ✅ BUILD COMPLETE   │
                    │                     │
                    │ • All Tests Pass    │
                    │ • Quality Gates Met │
                    │ • Security Verified │
                    │ • 90%+ Coverage     │
                    └─────────────────────┘
```

### Single Command Development
```bash
# Describe what you want to build
npx claude-flow@latest build "Create a modern todo application with:
- React frontend with add, edit, delete, and mark complete functionality
- Node.js/Express backend with REST API
- In-memory data storage
- Responsive design that works on mobile
- Form validation and error handling
- Comprehensive test suite with 90%+ coverage"

# Watch the magic happen!
```

### Understanding the Process
While building, you'll see real-time updates:

```
🤖 Agent Coordination:
├── Frontend Developer: Creating React components...
├── Backend Developer: Building Express API...
├── Test Engineer: Writing test suites...
└── Code Reviewer: Checking quality gates...

📊 Progress Tracking:
├── Components: 4/4 complete ✅
├── API Endpoints: 5/5 complete ✅
├── Tests: 23/25 complete 🔄
└── Quality Score: 9.2/10 ✅
```

### Behind the Scenes
The agents work concurrently:

1. **Frontend Agent** creates:
   - `src/App.js` - Main application component
   - `src/components/TodoList.js` - Todo list display
   - `src/components/TodoItem.js` - Individual todo item
   - `src/components/AddTodo.js` - Add new todo form
   - `src/styles/` - CSS styling

2. **Backend Agent** creates:
   - `server/app.js` - Express server setup
   - `server/routes/todos.js` - Todo API routes
   - `server/middleware/` - Validation and error handling
   - `server/models/Todo.js` - Todo data model

3. **Test Agent** creates:
   - `tests/unit/` - Component unit tests
   - `tests/integration/` - API integration tests
   - `tests/e2e/` - End-to-end user flow tests
   - `jest.config.js` - Test configuration

4. **Reviewer Agent** ensures:
   - Security best practices
   - Performance optimization
   - Code quality standards
   - Documentation completeness

## Step 4: Verify and Test (3 minutes)

### Run the Application
```bash
# Start the backend server
npm run server &

# Start the frontend development server
npm run dev

# View your app at http://localhost:3000
```

### Test the Functionality
```bash
# Run the complete test suite
npm test

# Check test coverage
npm run test:coverage

# Run security audit
npm audit
```

**💡 Expected Results:**
```
Test Suites: 8 passed, 8 total
Tests:       42 passed, 42 total
Coverage:    92.3% statements, 89.7% branches
Security:    No vulnerabilities found
Performance: All metrics within targets
```

### Manual Testing Checklist
- [ ] Add a new todo item
- [ ] Mark a todo as complete
- [ ] Edit an existing todo
- [ ] Delete a todo item
- [ ] Check mobile responsiveness
- [ ] Test form validation

## Step 5: Understanding the Code (2 minutes)

### Frontend Architecture
```javascript
// src/App.js - Main component structure
function App() {
  return (
    <div className="app">
      <Header />
      <AddTodo onAdd={handleAddTodo} />
      <TodoList
        todos={todos}
        onToggle={handleToggle}
        onDelete={handleDelete}
        onEdit={handleEdit}
      />
    </div>
  );
}
```

### Backend API Structure
```javascript
// server/routes/todos.js - RESTful API
router.get('/api/todos', getAllTodos);        // GET all todos
router.post('/api/todos', createTodo);        // CREATE new todo
router.put('/api/todos/:id', updateTodo);     // UPDATE todo
router.delete('/api/todos/:id', deleteTodo);  // DELETE todo
```

### Test Coverage Strategy
```javascript
// tests/integration/api.test.js - API testing
describe('Todo API', () => {
  test('should create new todo', async () => {
    const response = await request(app)
      .post('/api/todos')
      .send({ text: 'Learn Claude Flow' });

    expect(response.status).toBe(201);
    expect(response.body.text).toBe('Learn Claude Flow');
  });
});
```

## Concepts Explained

### Agent Coordination
Claude Flow uses **mesh topology** for this project:
- Agents work in parallel on different aspects
- Shared memory for coordination
- Automatic conflict resolution
- Quality gates prevent broken builds

### Quality Automation
Every build includes:
- **Linting**: Code style consistency
- **Testing**: Functional correctness
- **Security**: Vulnerability scanning
- **Performance**: Load time optimization

### Why This Works
1. **Specialization**: Each agent focuses on their expertise
2. **Parallel Execution**: Multiple tasks happen simultaneously
3. **Quality Gates**: Automated checks prevent issues
4. **Coordination**: Shared context prevents conflicts

## Common Pitfalls & Solutions

### 🚨 Troubleshooting Decision Tree
```
                        🔧 PROBLEM RESOLUTION WORKFLOW

    Build/Run Issue Detected
              │
              ▼
    ┌─────────────────────┐
    │ What type of error? │
    └─────────────────────┘
              │
    ┌─────────┼─────────┐
    │         │         │
    ▼         ▼         ▼
┌─────────┐ ┌─────────┐ ┌─────────┐
│DEPENDENCY│ │ TESTS   │ │ PORT    │
│CONFLICTS │ │ FAILING │ │ CONFLICT│
└─────────┘ └─────────┘ └─────────┘
    │         │         │
    ▼         ▼         ▼
┌─────────┐ ┌─────────┐ ┌─────────┐
│Clean    │ │Update   │ │Change   │
│& Rebuild│ │Snapshots│ │Port     │
└─────────┘ └─────────┘ └─────────┘
    │         │         │
    ▼         ▼         ▼
┌─────────┐ ┌─────────┐ ┌─────────┐
│rm -rf   │ │npx      │ │PORT=3001│
│node_mod │ │claude-  │ │npm run  │
│reinstall│ │flow test│ │dev      │
└─────────┘ └─────────┘ └─────────┘
    │         │         │
    └─────────┼─────────┘
              ▼
    ┌─────────────────────┐
    │ Issue Resolved?     │
    └─────────────────────┘
              │
        YES   │   NO
              ▼
    ┌─────────────────────┐
    │ Check Docs/Support  │
    │ • Troubleshooting   │
    │ • Community Forum   │
    │ • GitHub Issues     │
    └─────────────────────┘
```

### Issue: "Build failed with dependency conflicts"
**Solution:**
```bash
# Clean and reinstall dependencies
rm -rf node_modules package-lock.json
npx claude-flow@latest build --fix-dependencies
```

### Issue: "Tests failing after changes"
**Solution:**
```bash
# Regenerate tests based on current code
npx claude-flow@latest test --update-snapshots
```

### Issue: "Port 3000 already in use"
**Solution:**
```bash
# Use different port
PORT=3001 npm run dev
```

## Extensions & Challenges

### Easy Extensions (5-10 minutes each)
1. **Add Categories**: Organize todos by category
2. **Due Dates**: Add deadline functionality
3. **Priority Levels**: High/Medium/Low priorities
4. **Search Feature**: Filter todos by text

### Intermediate Challenges (15-30 minutes each)
1. **Data Persistence**: Add database storage
2. **User Authentication**: Multi-user support
3. **Real-time Updates**: WebSocket integration
4. **PWA Features**: Offline functionality

### Advanced Challenges (1-2 hours each)
1. **Microservices**: Split into multiple services
2. **Docker Deployment**: Containerized application
3. **CI/CD Pipeline**: Automated deployment
4. **Performance Optimization**: Sub-second loading

## Next Steps

### Immediate Next Tutorials
- [Basic Workflows](02-basic-workflows.md) - Understanding CLI vs MCP
- [Simple Automation](03-simple-automation.md) - Automate repetitive tasks
- [Quality & Testing](04-quality-testing.md) - Deep dive into testing

### Skill Development
- **JavaScript/React**: Strengthen frontend skills
- **Node.js/Express**: Backend development patterns
- **Testing**: Jest, Cypress, testing strategies
- **DevOps**: Deployment and monitoring

### Community Resources
- Share your todo app in the [showcase forum](https://community.claude-flow.dev/showcase)
- Get help in [beginner questions](https://community.claude-flow.dev/beginners)
- Find project ideas in [inspiration board](https://community.claude-flow.dev/ideas)

## Success Checklist

### Core Achievements ✅
- [ ] Application runs without errors
- [ ] All tests pass with 90%+ coverage
- [ ] No security vulnerabilities
- [ ] Mobile-responsive design
- [ ] Code meets quality standards

### Learning Achievements 🎓
- [ ] Understand agent coordination concepts
- [ ] Can explain CLI vs MCP approaches
- [ ] Know how to run tests and check quality
- [ ] Comfortable with Claude Flow basic commands
- [ ] Can troubleshoot common issues

### Next Level Preparation 🚀
- [ ] Try one extension challenge
- [ ] Read through generated code to understand patterns
- [ ] Experiment with different build descriptions
- [ ] Share your project and get feedback
- [ ] Ready for intermediate tutorials

## Summary

**🎉 Congratulations!** You've successfully built a complete web application using AI-powered development.

### What You Accomplished
- ✅ **Built a full-stack app** in 30 minutes
- ✅ **Learned agent coordination** fundamentals
- ✅ **Automated quality assurance** integration
- ✅ **Hands-on experience** with both CLI and MCP approaches

### Key Takeaways
1. **AI agents can work together** effectively with proper coordination
2. **Quality is automated**, not an afterthought
3. **Both CLI and MCP approaches** have their place
4. **Real projects are achievable** in short timeframes

### Your Next Adventure
You're now ready to tackle more complex projects and learn advanced coordination patterns. The todo app you built is a solid foundation for understanding how Claude Flow orchestrates AI-powered development.

**Ready for the next challenge?** Continue with [Basic Workflows](02-basic-workflows.md) to master the fundamental patterns you'll use in every project.

---

**Questions or stuck?**
- Check [Troubleshooting Guide](../troubleshooting/setup-issues.md)
- Ask in [Community Forums](https://community.claude-flow.dev)
- Review [Common Errors](../troubleshooting/error-messages.md)