# MDAP Library - Modular Decomposition and Processing

Standalone library for AI-powered task decomposition, processing, and validation. Extracted from Trigger.dev to provide reusable utilities for working with GLM 4.6 and common validation patterns.

## Installation

```bash
npm install @cfn/mdap
```

## Features

- **GLM 4.6 Client**: Optimized interface for Cerebras GLM 4.6 API with thinking/reasoning control
- **Validation Utilities**: JSON parsing, extraction, and validation helpers
- **Decomposer Functions**: Standalone functions for task analysis from multiple perspectives
- **Type Definitions**: Comprehensive TypeScript interfaces for MDAP tasks
- **Zero Dependencies**: Pure TypeScript implementation with no external runtime dependencies

## Quick Start

### Using the GLM Client

```typescript
import { callGLM, DECOMPOSER_PRESET, IMPLEMENTER_PRESET } from '@cfn/mdap';

// For decomposition tasks (with reasoning)
const decompositionResult = await callGLM(
  "Decompose this task into micro-tasks...",
  DECOMPOSER_PRESET
);

// For implementation tasks (fast, no reasoning)
const implementationResult = await callGLMFast(
  "Implement this function...",
  IMPLEMENTER_PRESET
);
```

### Validating Task Inputs

```typescript
import { validateDecomposerInput } from '@cfn/mdap';

const input = {
  taskId: 'task-123',
  taskDescription: 'Build a user authentication system',
  workDir: '/workspace/project'
};

const validation = validateDecomposerInput(input);
if (!validation.success) {
  console.error('Validation errors:', validation.errors);
}
```

### Parsing JSON from AI Responses

```typescript
import { parseJSONFromResponse } from '@cfn/mdap';

const aiResponse = `
Here's the decomposed tasks:
{
  "microTasks": [
    { "id": "1", "title": "Create user model", "priority": "high" }
  ]
}
`;

const tasks = parseJSONFromResponse(aiResponse, 'decomposer');
console.log(tasks.microTasks);
```

### Using Decomposer Functions

```typescript
import {
  decomposeArchitecture,
  decomposeTesting,
  decomposePerformance,
  decomposeSecurity
} from '@cfn/mdap';

// Decompose from architectural perspective (baseline)
const architectureResult = await decomposeArchitecture({
  taskId: 'task-123',
  taskDescription: 'Build a user authentication system',
  workDir: '/workspace/project'
});

// Decompose with context from previous analysis
const securityResult = await decomposeSecurity({
  taskId: 'task-123',
  taskDescription: 'Build a user authentication system',
  workDir: '/workspace/project',
  previousContext: {
    architecture: architectureResult
  }
});

console.log('Architecture micro-tasks:', architectureResult.microTasks);
console.log('Security risk level:', securityResult.riskLevel);
```

## API Reference

### Types

- `CompilerError`: Represents a compiler error with line/column info
- `FixInstruction`: Instruction for fixing a specific error
- `DecomposedTask`: A task decomposition result
- `MDAPResult`: Task execution result with confidence score
- `AIProvider`: Supported AI providers (zai, kimi, anthropic, etc.)

### GLM Client Functions

- `callGLM(prompt, options)`: Main GLM API call with configurable options
- `callGLMWithThinking(prompt, options)`: GLM call with reasoning enabled
- `callGLMFast(prompt, options)`: GLM call optimized for speed (no reasoning)

### Decomposer Functions

- `decomposeArchitecture(payload)`: Analyze task from architectural perspective (baseline)
- `decomposeSecurity(payload)`: Analyze task for security implications
- `decomposePerformance(payload)`: Analyze task for performance considerations
- `decomposeTesting(payload)`: Analyze task for testing requirements
- `getDecomposer(perspective)`: Get decomposer function by name
- `getAvailablePerspectives()`: Get list of available perspectives

### Validation Functions

- `validateDecomposerInput(input)`: Validates decomposer task inputs
- `validateCerebrasResponse(data)`: Validates Cerebras API response structure
- `validateDecompositionOutput(data)`: Validates decomposition result format
- `extractJSONFromResponse(content, context)`: Extracts JSON from AI response text
- `parseJSONFromResponse(content, context)`: Parses JSON with multiple recovery strategies

## Configuration

```typescript
import { configureMDAP } from '@cfn/mdap';

configureMDAP({
  defaultProvider: 'zai',
  defaultTimeout: 60000,
  debug: true
});
```

## Presets

The library includes optimized presets for different use cases:

- `DECOMPOSER_PRESET`: For complex reasoning tasks (4096 tokens, thinking enabled)
- `IMPLEMENTER_PRESET`: For code implementation (2048 tokens, no thinking)
- `VALIDATOR_PRESET`: For validation tasks (1024 tokens, low temperature)

## Environment Variables

- `CEREBRAS_API_KEY`: Required API key for Cerebras GLM 4.6 access

## License

UNLICENSED - Internal use only

## Version History

- **1.0.0**: Initial release with GLM client, validation utilities, and type definitions
- **1.1.0**: Added decomposer functions for architecture, security, performance, and testing perspectives