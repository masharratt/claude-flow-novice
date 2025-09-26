# CLI Complete Tutorial: Build a Todo Application

**Build a real application** using Claude Flow Novice CLI with AI agents. You'll create a complete Todo application with backend, frontend, tests, and documentation in under 30 minutes!

## 🎯 What You'll Build

A complete Todo application featuring:
- **Backend**: Express.js REST API with authentication
- **Frontend**: React application with modern UI
- **Database**: SQLite with proper schema
- **Tests**: Comprehensive test suite (90+ coverage)
- **Documentation**: API docs and README

**Technologies**: Node.js, Express.js, React, SQLite, Jest

## 📋 Prerequisites

- **Node.js 18+** installed
- **Basic JavaScript knowledge** (beginner-friendly)
- **Terminal access**
- **15-30 minutes** of your time

## 🚀 Step 1: Project Setup (2 minutes)

### Create Project Directory
```bash
# Create project directory
mkdir todo-app-ai && cd todo-app-ai

# Verify Node.js version
node --version  # Should be 18+

# Initialize project
npm init -y
```

### Install Claude Flow Novice
```bash
# Global installation (optional)
npm install -g claude-flow-novice

# Or use npx throughout (recommended for beginners)
npx claude-flow-novice@latest --version

# Expected output:
claude-flow-novice v1.0.0
AI Agent Orchestration for Beginners
```

### Initialize Claude Flow Project
```bash
# Initialize claude-flow in project
npx claude-flow-novice@latest init

# Expected output:
🚀 Initializing Claude Flow Novice project...
✅ Created .claude-flow/ directory
✅ Generated config.json
✅ Created agents/ directory
✅ Created memory/ directory
✅ Created logs/ directory
🎉 Project ready for AI agent orchestration!
```

**Your project structure:**
```
todo-app-ai/
├── .claude-flow/
│   ├── config.json          # Claude Flow configuration
│   ├── agents/              # Agent definitions
│   ├── memory/              # Agent memory storage
│   └── logs/               # Execution logs
├── package.json            # Project dependencies
└── README.md (coming soon) # Generated documentation
```

## 🏗️ Step 2: Spawn Your Development Team (3 minutes)

### Spawn the Backend Developer
```bash
# Create Express.js API with authentication
npx claude-flow-novice@latest agent spawn coder \
  --specialty backend \
  --context \"Express.js, REST API, JWT authentication\" \
  \"Build a Todo API with user authentication, CRUD operations, and proper error handling\"

# Expected output:
🤖 Spawning Agent: coder-backend-001
📋 Task: Build Todo API with authentication
🏷️ Specialty: backend
📂 Context: Express.js, REST API, JWT authentication

🚀 Agent working...
├── 📝 Analyzing requirements...
├── 🏗️ Setting up Express.js server...
├── 🔐 Implementing JWT authentication...
├── 📊 Creating database schema...
├── 🛠️ Building CRUD endpoints...
└── ✅ Task completed!

📁 Files created:
├── backend/server.js
├── backend/routes/auth.js
├── backend/routes/todos.js
├── backend/models/User.js
├── backend/models/Todo.js
├── backend/middleware/auth.js
└── backend/database/schema.sql
```

### Spawn the Frontend Developer
```bash
# Create React frontend
npx claude-flow-novice@latest agent spawn coder \
  --specialty frontend \
  --context \"React, Modern UI, Todo application\" \
  \"Build a React Todo frontend with authentication, responsive design, and state management\"

# Expected output:
🤖 Spawning Agent: coder-frontend-002
📋 Task: Build React Todo frontend
🏷️ Specialty: frontend
📂 Context: React, Modern UI, Todo application

🚀 Agent working...
├── ⚛️ Setting up React application...
├── 🎨 Creating modern UI components...
├── 🔐 Implementing authentication flow...
├── 📱 Adding responsive design...
├── 🗂️ Setting up state management...
└── ✅ Task completed!

📁 Files created:
├── frontend/src/App.jsx
├── frontend/src/components/TodoList.jsx
├── frontend/src/components/TodoItem.jsx
├── frontend/src/components/AuthForm.jsx
├── frontend/src/hooks/useTodos.js
├── frontend/src/context/AuthContext.jsx
└── frontend/public/index.html
```

### Spawn the Test Engineer
```bash
# Create comprehensive tests
npx claude-flow-novice@latest agent spawn tester \
  --coverage 90 \
  --types \"unit,integration,e2e\" \
  \"Create comprehensive test suite for Todo application with 90% coverage\"

# Expected output:
🧪 Spawning Agent: tester-001
📋 Task: Create comprehensive test suite
🎯 Coverage Target: 90%
🧪 Test Types: unit, integration, e2e

🚀 Agent working...
├── 🧪 Setting up Jest testing framework...
├── 🔬 Writing unit tests...
├── 🔗 Creating integration tests...
├── 🌐 Building e2e tests...
├── 📊 Configuring coverage reports...
└── ✅ Task completed!

📁 Files created:
├── tests/unit/auth.test.js
├── tests/unit/todos.test.js
├── tests/integration/api.test.js
├── tests/e2e/user-flow.test.js
├── tests/setup.js
└── jest.config.js
```

## 🔄 Step 3: Run SPARC Methodology (5 minutes)

SPARC ensures systematic, high-quality development. Let's run the complete cycle:

### Specification Phase
```bash
# Analyze and document requirements
npx claude-flow-novice@latest sparc run spec \
  \"Complete Todo application with user authentication\"

# Expected output:
📋 SPARC Specification Phase
🎯 Analyzing requirements...

✅ User Stories Generated (8 total):
├── User registration and login
├── Create, read, update, delete todos
├── Mark todos as complete/incomplete
├── Filter todos by status
├── Search todos by text
├── User session management
├── Data persistence
└── Responsive mobile design

✅ Acceptance Criteria Defined (24 criteria)
✅ Technical Requirements Specified
✅ Non-functional Requirements Listed

📝 Output: .claude-flow/sparc/specification.md
```

### Pseudocode Phase
```bash
# Design algorithms and data flow
npx claude-flow-novice@latest sparc run pseudocode \
  \"Todo application based on generated specification\"

# Expected output:
📝 SPARC Pseudocode Phase
🧠 Designing algorithms...

✅ API Endpoints Pseudocode:
├── POST /auth/register
├── POST /auth/login
├── GET /todos
├── POST /todos
├── PUT /todos/:id
└── DELETE /todos/:id

✅ Frontend Component Logic:
├── TodoList rendering algorithm
├── Authentication flow
├── State management patterns
└── Event handling logic

📝 Output: .claude-flow/sparc/pseudocode.md
```

### Architecture Phase
```bash
# Design system architecture
npx claude-flow-novice@latest sparc run architecture \
  \"Full-stack Todo application architecture\"

# Expected output:
🏗️ SPARC Architecture Phase
🎯 Designing system architecture...

✅ System Architecture Defined:
├── Client-Server Architecture
├── RESTful API Design
├── Database Schema
├── Authentication Strategy
├── State Management
└── Deployment Strategy

✅ Component Diagrams Created
✅ Database ERD Generated
✅ API Documentation Structure

📝 Output: .claude-flow/sparc/architecture.md
```

### Refinement Phase (TDD)
```bash
# Implement with Test-Driven Development
npx claude-flow-novice@latest sparc run refinement \
  --mode tdd \
  --coverage 90 \
  \"Implement Todo application following TDD principles\"

# Expected output:
🔄 SPARC Refinement Phase (TDD Mode)
🧪 Following Test-Driven Development...

✅ TDD Cycle 1: Authentication
├── ❌ Write failing auth tests
├── ✅ Implement auth functionality
├── ♻️ Refactor for clarity
└── 📊 Coverage: 95%

✅ TDD Cycle 2: Todo CRUD
├── ❌ Write failing CRUD tests
├── ✅ Implement CRUD operations
├── ♻️ Refactor for performance
└── 📊 Coverage: 92%

✅ TDD Cycle 3: Frontend Components
├── ❌ Write component tests
├── ✅ Implement React components
├── ♻️ Refactor for reusability
└── 📊 Coverage: 94%

📝 Output: .claude-flow/sparc/refinement.md
```

## 🧪 Step 4: Run Tests and Verify Quality (3 minutes)

### Run All Tests
```bash
# Execute test suite
npm test

# Expected output:
🧪 Running Test Suite...

 PASS  tests/unit/auth.test.js
 PASS  tests/unit/todos.test.js
 PASS  tests/integration/api.test.js
 PASS  tests/e2e/user-flow.test.js

Test Suites: 4 passed, 4 total
Tests:       47 passed, 47 total
Snapshots:   0 total
Time:        8.432 s
Coverage:    94.2% Statements
             91.8% Branches
             95.1% Functions
             94.7% Lines

🎉 All tests passed with excellent coverage!
```

### Quality Check with Review Agent
```bash
# Spawn code reviewer for quality assessment
npx claude-flow-novice@latest agent spawn reviewer \
  --focus \"security,performance,maintainability\" \
  \"Comprehensive code review of Todo application\"

# Expected output:
👀 Spawning Agent: reviewer-001
🔍 Focus Areas: security, performance, maintainability

🚀 Agent reviewing...
├── 🔒 Security analysis...
├── ⚡ Performance evaluation...
├── 🛠️ Maintainability assessment...
├── 📏 Code style review...
└── ✅ Review completed!

📊 Quality Score: 9.2/10

✅ Strengths:
├── Excellent test coverage (94.2%)
├── Proper authentication implementation
├── Clean, modular code structure
├── Good error handling
└── Responsive design patterns

⚠️ Suggestions:
├── Add rate limiting to API endpoints
├── Implement input sanitization
└── Consider adding API versioning

📝 Full report: .claude-flow/reviews/quality-report.md
```

## 📚 Step 5: Generate Documentation (2 minutes)

### API Documentation
```bash
# Generate API documentation
npx claude-flow-novice@latest agent spawn api-docs \
  \"Generate comprehensive API documentation for Todo application\"

# Expected output:
📚 Spawning Agent: api-docs-001
📋 Task: Generate API documentation

🚀 Agent working...
├── 📖 Analyzing API endpoints...
├── 📝 Creating OpenAPI specification...
├── 💡 Adding usage examples...
├── 🎯 Writing integration guide...
└── ✅ Documentation completed!

📁 Files created:
├── docs/api/openapi.yaml
├── docs/api/README.md
├── docs/api/authentication.md
├── docs/api/endpoints.md
└── docs/api/examples.md
```

### Project Documentation
```bash
# Generate README and setup instructions
npx claude-flow-novice@latest agent spawn documenter \
  \"Create project README with setup, usage, and deployment instructions\"

# Expected output:
📚 Spawning Agent: documenter-001
📋 Task: Create project documentation

🚀 Agent working...
├── 📖 Creating comprehensive README...
├── ⚙️ Writing setup instructions...
├── 🚀 Adding deployment guide...
├── 🤝 Creating contribution guidelines...
└── ✅ Documentation completed!

📁 Files created:
├── README.md
├── SETUP.md
├── DEPLOYMENT.md
├── CONTRIBUTING.md
└── docs/user-guide.md
```

## 🚀 Step 6: Build and Run Your Application (5 minutes)

### Install Dependencies
```bash
# Install backend dependencies
cd backend && npm install
cd ../frontend && npm install
cd ..

# Expected packages installed:
# Backend: express, jsonwebtoken, bcryptjs, sqlite3, cors, helmet
# Frontend: react, react-dom, axios, react-router-dom
```

### Start the Application
```bash
# Start backend server (Terminal 1)
cd backend
npm start

# Expected output:
🚀 Todo API Server starting...
✅ Database connected
✅ Server running on http://localhost:3001
🔐 JWT authentication enabled
📊 API endpoints ready

# Start frontend (Terminal 2 - new terminal)
cd frontend
npm start

# Expected output:
📱 React Todo App starting...
✅ Development server running
🌐 App available at http://localhost:3000
🔗 Connected to API at http://localhost:3001
```

### Test Your Application

**Visit http://localhost:3000** and verify:

1. **Registration/Login Flow** ✅
   - Create new user account
   - Login with credentials
   - JWT token stored securely

2. **Todo Functionality** ✅
   - Create new todos
   - Mark todos as complete
   - Edit existing todos
   - Delete todos
   - Filter by status (all/active/completed)

3. **Responsive Design** ✅
   - Works on mobile devices
   - Clean, modern interface
   - Smooth user experience

## 📊 Step 7: Monitor and Analyze (2 minutes)

### Check Agent Performance
```bash
# View agent metrics
npx claude-flow-novice@latest metrics show

# Expected output:
📊 Agent Performance Metrics:

┌─────────────────┬─────────────┬─────────────┬──────────────┐
│ Agent           │ Tasks       │ Success     │ Avg Time     │
├─────────────────┼─────────────┼─────────────┼──────────────┤
│ coder-backend   │ 1           │ 100%        │ 3m 42s       │
│ coder-frontend  │ 1           │ 100%        │ 4m 18s       │
│ tester          │ 1           │ 100%        │ 2m 55s       │
│ reviewer        │ 1           │ 100%        │ 1m 33s       │
│ api-docs        │ 1           │ 100%        │ 1m 28s       │
│ documenter      │ 1           │ 100%        │ 1m 45s       │
└─────────────────┴─────────────┴─────────────┴──────────────┘

Total Time: 15m 41s
Code Generated: 2,847 lines
Test Coverage: 94.2%
Quality Score: 9.2/10
```

### View Project Structure
```bash
# See what was created
tree -I node_modules

# Expected structure:
todo-app-ai/
├── .claude-flow/
│   ├── config.json
│   ├── agents/
│   ├── memory/
│   ├── logs/
│   ├── sparc/
│   └── reviews/
├── backend/
│   ├── server.js
│   ├── package.json
│   ├── routes/
│   ├── models/
│   ├── middleware/
│   └── database/
├── frontend/
│   ├── src/
│   ├── public/
│   └── package.json
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── docs/
│   ├── api/
│   └── user-guide.md
├── README.md
├── SETUP.md
└── package.json
```

## 🎉 Congratulations! What You've Accomplished

In just 30 minutes, you've built a production-ready Todo application with:

### ✅ Complete Feature Set:
- **User Authentication**: Secure registration and login
- **Todo Management**: Full CRUD operations
- **Modern UI**: Responsive React interface
- **Data Persistence**: SQLite database
- **Real-time Updates**: Dynamic UI updates

### ✅ Professional Quality:
- **94.2% Test Coverage**: Comprehensive test suite
- **9.2/10 Quality Score**: Professional code quality
- **Security Best Practices**: JWT auth, input validation
- **Complete Documentation**: API docs, setup guides
- **Modern Architecture**: Clean, scalable structure

### ✅ AI-Driven Development:
- **6 Specialized Agents**: Each focused on their expertise
- **SPARC Methodology**: Systematic development approach
- **Automated Quality Assurance**: Built-in code review
- **Documentation Generation**: Automatic docs creation

## 🚀 Next Steps - Expand Your Skills

### Immediate Enhancements (Today):
```bash
# Add deployment configuration
npx claude-flow-novice@latest agent spawn devops \
  \"Add Docker configuration and deployment scripts\"

# Enhance security
npx claude-flow-novice@latest agent spawn security \
  \"Add rate limiting, input validation, and security headers\"

# Performance optimization
npx claude-flow-novice@latest agent spawn optimizer \
  \"Optimize database queries and add caching\"
```

### This Week - Advanced Features:
1. **Real-time Updates**: Add WebSocket support
2. **User Collaboration**: Multi-user todo sharing
3. **Advanced UI**: Dark mode, animations, drag-and-drop
4. **PWA Features**: Offline support, push notifications
5. **CI/CD Pipeline**: Automated testing and deployment

### Learning Path:
1. **[Understanding SPARC](../../core-concepts/sparc-methodology/README.md)** - Deep dive into methodology
2. **[Agent Specializations](../../core-concepts/agents/README.md)** - Learn about all 54+ agents
3. **[Advanced Tutorials](../../tutorials/advanced/README.md)** - Complex orchestration patterns
4. **[Language Guides](../../languages/README.md)** - Technology-specific examples

## 🛠️ Customization Ideas

### Backend Enhancements:
```bash
# Add GraphQL API
npx claude-flow-novice@latest agent spawn coder \
  --specialty graphql \
  \"Add GraphQL API alongside REST endpoints\"

# Add database migrations
npx claude-flow-novice@latest agent spawn coder \
  --specialty database \
  \"Create database migration system with version control\"
```

### Frontend Improvements:
```bash
# Add advanced state management
npx claude-flow-novice@latest agent spawn coder \
  --specialty react \
  \"Implement Redux Toolkit for advanced state management\"

# Create component library
npx claude-flow-novice@latest agent spawn coder \
  --specialty ui \
  \"Create reusable component library with Storybook\"
```

## 🆘 Troubleshooting

### Common Issues:

**Port Already in Use:**
```bash
# Change backend port
cd backend
PORT=3002 npm start

# Update frontend API URL
# Edit frontend/src/config.js
```

**Tests Failing:**
```bash
# Run specific test
npm test -- auth.test.js

# Debug with verbose output
npm test -- --verbose

# Check agent logs
npx claude-flow-novice@latest logs show --agent tester
```

**Build Errors:**
```bash
# Clean and reinstall
rm -rf node_modules package-lock.json
npm install

# Check agent memory for solutions
npx claude-flow-novice@latest memory show --key troubleshooting
```

## 📋 Project Checklist

Verify your project has all these components:

### Backend ✅
- [ ] Express.js server running on port 3001
- [ ] JWT authentication working
- [ ] Todo CRUD operations functional
- [ ] Database schema created
- [ ] Error handling implemented
- [ ] Tests passing (unit + integration)

### Frontend ✅
- [ ] React app running on port 3000
- [ ] Authentication flow working
- [ ] Todo management interface functional
- [ ] Responsive design working
- [ ] State management implemented
- [ ] Component tests passing

### Quality ✅
- [ ] Test coverage > 90%
- [ ] Code quality score > 9.0
- [ ] Security review completed
- [ ] Documentation generated
- [ ] All agents completed successfully

---

**🎊 Excellent work! You've just built a professional-grade application using AI agent orchestration!**

**What's Next?**
- **Build something bigger**: [Intermediate Tutorials](../../tutorials/intermediate/README.md)
- **Learn advanced patterns**: [Advanced Tutorials](../../tutorials/advanced/README.md)
- **Explore other technologies**: [Language Guides](../../languages/README.md)
- **Join the community**: [Discussions](../../community/discussions/README.md)