# Getting Started with Claude Flow Novice

Welcome to Claude Flow Novice! This guide will help you get up and running with AI agent orchestration.

## Prerequisites

- Node.js 20.0.0 or higher
- npm 9.0.0 or higher
- Basic knowledge of JavaScript/TypeScript

## Installation

### 1. Install the Package

```bash
npm install claude-flow-novice
```

### 2. Initialize Your Project

```bash
# Create a new project directory
mkdir my-ai-project
cd my-ai-project

# Initialize npm project
npm init -y

# Install Claude Flow Novice
npm install claude-flow-novice
```

## Your First Agent

### Basic Agent Example

Create a file called `my-first-agent.js`:

```javascript
import { ClaudeFlowNovice } from 'claude-flow-novice';

// Initialize Claude Flow Novice
const flow = new ClaudeFlowNovice();

// Create a simple greeting agent
const greetingAgent = flow.createAgent({
  name: 'greeter',
  description: 'A friendly greeting agent',
  handler: async (input) => {
    const { name, language = 'english' } = input;
    
    const greetings = {
      english: `Hello, ${name}!`,
      spanish: `¡Hola, ${name}!`,
      french: `Bonjour, ${name}!`,
      german: `Hallo, ${name}!`
    };
    
    return greetings[language] || greetings.english;
  }
});

// Test the agent
async function testAgent() {
  try {
    const result = await greetingAgent.execute({
      name: 'Alice',
      language: 'spanish'
    });
    
    console.log(result); // Output: ¡Hola, Alice!
  } catch (error) {
    console.error('Agent execution failed:', error);
  }
}

testAgent();
```

### Run Your Agent

```bash
node my-first-agent.js
```

## Agent Types

### 1. Simple Handler Agent

```javascript
const calculator = flow.createAgent({
  name: 'calculator',
  description: 'Performs basic calculations',
  handler: async (input) => {
    const { operation, a, b } = input;
    
    switch (operation) {
      case 'add':
        return a + b;
      case 'subtract':
        return a - b;
      case 'multiply':
        return a * b;
      case 'divide':
        return b !== 0 ? a / b : 'Error: Division by zero';
      default:
        return 'Error: Unknown operation';
    }
  }
});
```

### 2. Stateful Agent

```javascript
const counter = flow.createAgent({
  name: 'counter',
  description: 'Counts interactions',
  initialState: { count: 0 },
  handler: async (input, state) => {
    state.count += 1;
    return {
      message: `This is interaction #${state.count}`,
      count: state.count
    };
  }
});
```

### 3. Conditional Agent

```javascript
const validator = flow.createAgent({
  name: 'validator',
  description: 'Validates input data',
  handler: async (input) => {
    const { email, age } = input;
    const errors = [];
    
    // Validate email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      errors.push('Invalid email format');
    }
    
    // Validate age
    if (age < 0 || age > 150) {
      errors.push('Age must be between 0 and 150');
    }
    
    return {
      valid: errors.length === 0,
      errors,
      input
    };
  }
});
```

## Creating Workflows

### Sequential Workflow

```javascript
// Create multiple agents
const extractor = flow.createAgent({
  name: 'extractor',
  handler: async (text) => {
    // Extract key information from text
    return {
      words: text.split(' ').length,
      characters: text.length,
      sentences: text.split('.').length
    };
  }
});

const analyzer = flow.createAgent({
  name: 'analyzer',
  handler: async (data) => {
    // Analyze extracted data
    return {
      averageWordsPerSentence: Math.round(data.words / data.sentences),
      complexity: data.characters > 100 ? 'high' : 'low'
    };
  }
});

// Create a workflow
const workflow = flow.createWorkflow()
  .addAgent(extractor)
  .addAgent(analyzer);

// Execute workflow
const text = "This is a sample text. It has multiple sentences.";
const result = await workflow.execute(text);

console.log(result);
// Output: { averageWordsPerSentence: 4, complexity: 'low' }
```

### Conditional Workflow

```javascript
const router = flow.createAgent({
  name: 'router',
  handler: async (input) => {
    const { type } = input;
    return { nextAgent: type === 'urgent' ? 'urgent-handler' : 'normal-handler' };
  }
});

const urgentHandler = flow.createAgent({
  name: 'urgent-handler',
  handler: async (input) => {
    return { priority: 'high', response: 'Handling urgent request...' };
  }
});

const normalHandler = flow.createAgent({
  name: 'normal-handler',
  handler: async (input) => {
    return { priority: 'normal', response: 'Processing normal request...' };
  }
});

// Create conditional workflow
const conditionalWorkflow = flow.createWorkflow()
  .addAgent(router)
  .branch((result) => result.nextAgent === 'urgent-handler' ? urgentHandler : normalHandler);
```

## Error Handling

```javascript
const robustAgent = flow.createAgent({
  name: 'robust-agent',
  description: 'Handles errors gracefully',
  handler: async (input) => {
    try {
      // Your agent logic here
      if (!input.required) {
        throw new Error('Missing required field');
      }
      
      return { success: true, data: processInput(input) };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  },
  onError: async (error, input) => {
    console.error(`Agent failed for input:`, input);
    console.error(`Error:`, error.message);
    
    // Log error or send notification
    await logError(error, input);
  }
});
```

## Configuration

### Environment Variables

Create a `.env` file:

```env
# Claude Flow Novice Configuration
NODE_ENV=development
LOG_LEVEL=info
PORT=3000

# Database
DATABASE_URL=./data/claude-flow.db

# Agent Settings
MAX_AGENTS=10
AGENT_TIMEOUT=30000

# Security
API_KEY=your-api-key-here
ENABLE_AUTH=false
```

### Programmatic Configuration

```javascript
const flow = new ClaudeFlowNovice({
  logLevel: 'debug',
  maxAgents: 20,
  timeout: 60000,
  database: {
    type: 'sqlite',
    path: './my-data.db'
  },
  monitoring: {
    enabled: true,
    metricsInterval: 5000
  }
});
```

## Testing Your Agents

### Unit Testing

```javascript
import { ClaudeFlowNovice } from 'claude-flow-novice';

describe('My Agent Tests', () => {
  let flow;
  let testAgent;
  
  beforeEach(() => {
    flow = new ClaudeFlowNovice();
    testAgent = flow.createAgent({
      name: 'test-agent',
      handler: async (input) => {
        return { result: input.value * 2 };
      }
    });
  });
  
  test('should double the input value', async () => {
    const result = await testAgent.execute({ value: 5 });
    expect(result.result).toBe(10);
  });
  
  test('should handle invalid input', async () => {
    const result = await testAgent.execute({ value: 'invalid' });
    expect(result.error).toBeDefined();
  });
});
```

## Next Steps

1. **Explore Examples**: Check out the `examples/` directory for more advanced use cases
2. **Read the API Reference**: Learn about all available methods and options
3. **Build Your First Project**: Create a simple AI assistant or automation tool
4. **Join the Community**: Participate in discussions and contribute to the project

## Troubleshooting

### Common Issues

**Agent not responding:**
- Check if the agent handler is properly defined
- Verify input parameters match expected format
- Check timeout settings

**Memory issues:**
- Monitor agent state size
- Implement cleanup procedures
- Use streaming for large data

**Performance problems:**
- Profile your agent handlers
- Optimize database queries
- Consider using worker threads for CPU-intensive tasks

### Getting Help

- 📖 Check the [Documentation](docs/)
- 🐛 [Report Issues](https://github.com/masharratt/claude-flow-novice/issues)
- 💬 [Join Discussions](https://github.com/masharratt/claude-flow-novice/discussions)

Happy coding with Claude Flow Novice! 🚀