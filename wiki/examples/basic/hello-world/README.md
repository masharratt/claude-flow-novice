# Hello World - Claude Flow Introduction

**Complexity**: 🟢 Beginner (15 minutes)
**Agents**: 1 (coder)
**Technologies**: JavaScript, Node.js

A simple introduction to claude-flow-novice that creates a basic "Hello World" application with file operations and basic automation.

## What You'll Learn

- Basic claude-flow-novice CLI commands
- Agent spawning and coordination
- File creation and manipulation
- SPARC methodology basics
- Memory management fundamentals

## Quick Start

```bash
# Clone and run the example
npx claude-flow@alpha template download hello-world my-hello-world
cd my-hello-world
npm install
npm start
```

## Step-by-Step Tutorial

### 1. Initialize Project

```bash
# Create new directory
mkdir hello-world-claude-flow
cd hello-world-claude-flow

# Initialize with claude-flow
npx claude-flow@alpha init --type basic
```

### 2. Spawn Your First Agent

```bash
# Using CLI approach
npx claude-flow@alpha agent spawn coder \
  --capability "JavaScript development" \
  --task "Create a Hello World application"
```

Or using the Task tool pattern:

```javascript
// Using Claude Code's Task tool (recommended)
Task("JavaScript Developer",
     "Create a Hello World Node.js application with package.json, main script, and basic documentation. Include error handling and logging.",
     "coder")
```

### 3. Agent Coordination Hooks

The agent will automatically run coordination hooks:

```bash
# Pre-task setup
npx claude-flow@alpha hooks pre-task --description "Hello World application"

# During development (agent runs automatically)
npx claude-flow@alpha hooks post-edit --file "app.js" --memory-key "hello-world/main"
npx claude-flow@alpha hooks notify --message "Created main application file"

# Post-task completion
npx claude-flow@alpha hooks post-task --task-id "hello-world-app"
```

## Generated Files

The agent will create a complete project structure:

```
hello-world-claude-flow/
├── package.json          # Project configuration
├── app.js               # Main application
├── README.md            # Documentation
├── .gitignore           # Git ignore rules
├── .claude-flow.json    # Claude-flow configuration
└── logs/
    └── app.log          # Application logs
```

### package.json
```json
{
  "name": "hello-world-claude-flow",
  "version": "1.0.0",
  "description": "A simple Hello World application demonstrating claude-flow-novice basics",
  "main": "app.js",
  "scripts": {
    "start": "node app.js",
    "dev": "nodemon app.js",
    "test": "echo \"No tests yet\" && exit 0"
  },
  "dependencies": {
    "chalk": "^4.1.2",
    "winston": "^3.8.2"
  },
  "devDependencies": {
    "nodemon": "^2.0.20"
  },
  "keywords": ["claude-flow", "hello-world", "nodejs"],
  "author": "Claude Flow Agent",
  "license": "MIT"
}
```

### app.js
```javascript
const chalk = require('chalk');
const winston = require('winston');
const fs = require('fs');
const path = require('path');

// Configure logging
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} [${level.toUpperCase()}]: ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/app.log' })
  ]
});

// Ensure logs directory exists
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Main application function
async function main() {
  try {
    // Welcome message
    console.log(chalk.blue.bold('🚀 Claude Flow Hello World Application'));
    console.log(chalk.green('Welcome to your first claude-flow-novice application!'));

    logger.info('Application started successfully');

    // Demonstrate basic functionality
    const greeting = generateGreeting();
    console.log(chalk.yellow(greeting));

    // Show agent coordination info
    displayAgentInfo();

    // Demonstrate file operations
    await createSampleFile();

    console.log(chalk.green.bold('✅ Application completed successfully!'));
    logger.info('Application completed successfully');

  } catch (error) {
    console.error(chalk.red('❌ Application error:'), error.message);
    logger.error(`Application error: ${error.message}`);
    process.exit(1);
  }
}

function generateGreeting() {
  const messages = [
    'Hello, World! 🌍',
    'Welcome to Claude Flow! 🤖',
    'Your first agent is working! ⚡',
    'Multi-agent coordination made simple! 🔄'
  ];

  return messages[Math.floor(Math.random() * messages.length)];
}

function displayAgentInfo() {
  console.log(chalk.cyan('\n📊 Agent Information:'));
  console.log(chalk.white('- Agent Type: Coder'));
  console.log(chalk.white('- Capability: JavaScript development'));
  console.log(chalk.white('- Coordination: Single agent (basic example)'));
  console.log(chalk.white('- Memory: Local file system'));
  console.log(chalk.white('- Hooks: Pre/post task coordination'));
}

async function createSampleFile() {
  try {
    const sampleData = {
      project: 'hello-world-claude-flow',
      agent: 'coder',
      timestamp: new Date().toISOString(),
      status: 'completed',
      features: [
        'Basic Node.js application',
        'Logging with Winston',
        'Colorized console output',
        'Error handling',
        'File operations'
      ]
    };

    const filePath = path.join(__dirname, 'project-info.json');
    await fs.promises.writeFile(filePath, JSON.stringify(sampleData, null, 2));

    console.log(chalk.blue(`📄 Created sample file: ${filePath}`));
    logger.info(`Created sample file: ${filePath}`);

  } catch (error) {
    logger.error(`Failed to create sample file: ${error.message}`);
    throw error;
  }
}

// Handle process termination gracefully
process.on('SIGINT', () => {
  console.log(chalk.yellow('\n👋 Goodbye! Thanks for trying Claude Flow!'));
  logger.info('Application terminated by user');
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  logger.error(`Uncaught exception: ${error.message}`);
  console.error(chalk.red('Fatal error:'), error.message);
  process.exit(1);
});

// Run the application
if (require.main === module) {
  main();
}

module.exports = { main, generateGreeting };
```

### .claude-flow.json
```json
{
  "version": "2.0.0",
  "project": {
    "name": "hello-world-claude-flow",
    "type": "basic",
    "complexity": "beginner"
  },
  "agents": {
    "coder": {
      "type": "coder",
      "capabilities": ["JavaScript development"],
      "memory": {
        "scope": "project",
        "persistence": "local"
      }
    }
  },
  "workflows": {
    "development": {
      "steps": [
        "Initialize project structure",
        "Create main application",
        "Add error handling",
        "Implement logging",
        "Create documentation"
      ]
    }
  },
  "hooks": {
    "enabled": true,
    "pre_task": true,
    "post_edit": true,
    "post_task": true
  }
}
```

## Running the Example

```bash
# Install dependencies
npm install

# Run the application
npm start

# Expected output:
# 🚀 Claude Flow Hello World Application
# Welcome to your first claude-flow-novice application!
# Hello, World! 🌍
#
# 📊 Agent Information:
# - Agent Type: Coder
# - Capability: JavaScript development
# - Coordination: Single agent (basic example)
# - Memory: Local file system
# - Hooks: Pre/post task coordination
#
# 📄 Created sample file: /path/to/project-info.json
# ✅ Application completed successfully!
```

## Understanding the Workflow

### 1. Agent Initialization
The coder agent is spawned with specific capabilities and receives the task description.

### 2. Project Structure Creation
The agent creates a well-organized project structure following Node.js best practices.

### 3. Code Generation
Clean, documented code is generated with:
- Error handling
- Logging
- Configuration
- Documentation

### 4. Coordination Hooks
The agent automatically runs coordination hooks for:
- Task preparation
- File change notifications
- Task completion

## Key Concepts Demonstrated

### SPARC Methodology
- **S**pecification: Clear task definition
- **P**seudocode: Logical flow planning
- **A**rchitecture: Project structure design
- **R**efinement: Code implementation
- **C**ompletion: Testing and documentation

### Memory Management
```javascript
// Agent stores information in memory for coordination
npx claude-flow@alpha hooks post-edit --memory-key "hello-world/main"
```

### Error Handling
```javascript
// Robust error handling patterns
try {
  await operation();
} catch (error) {
  logger.error(`Operation failed: ${error.message}`);
  throw error;
}
```

## Next Steps

After completing this example, try:

1. **[CLI Basics](../cli-basics/README.md)** - Learn more CLI commands
2. **[REST API](../../projects/rest-api/README.md)** - Multi-agent coordination
3. **[React App](../../projects/react-app/README.md)** - Frontend development

## Customization Options

### Add More Agents
```bash
# Add a tester agent
npx claude-flow@alpha agent spawn tester \
  --capability "Node.js testing" \
  --task "Create tests for the Hello World application"
```

### Extend Functionality
```javascript
// Add web server capability
Task("Backend Developer",
     "Convert Hello World to Express.js web application with routes and middleware",
     "backend-dev")
```

### Add Database
```javascript
// Add database integration
Task("Database Architect",
     "Add SQLite database for storing greeting messages and user interactions",
     "database-architect")
```

## Troubleshooting

### Common Issues

**Issue**: Agent not spawning
```bash
# Check claude-flow-novice installation
npx claude-flow@alpha --version

# Reinstall if needed
npm install -g claude-flow@alpha
```

**Issue**: Dependencies not installing
```bash
# Clear npm cache
npm cache clean --force

# Delete node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

**Issue**: Hooks not working
```bash
# Verify hooks configuration
npx claude-flow@alpha hooks status

# Reset hooks if needed
npx claude-flow@alpha hooks reset
```

## Performance Metrics

- **Setup Time**: ~2 minutes
- **Code Generation**: ~30 seconds
- **Total Completion**: ~3 minutes
- **Lines of Code**: ~150
- **Test Coverage**: N/A (basic example)

## Resources

- [Claude Flow Documentation](../../../README.md)
- [SPARC Methodology](../../learning/beginner/sparc-basics/README.md)
- [Agent Types Guide](../../utilities/agent-types/README.md)
- [Memory Management](../../learning/intermediate/memory/README.md)

---

**Congratulations!** 🎉 You've completed your first claude-flow-novice example. This foundation will help you understand more complex multi-agent workflows and coordination patterns.