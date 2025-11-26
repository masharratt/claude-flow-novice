---
description: "Contextual code templates based on detected project patterns and frameworks"
argument-hint: "[<component-type>|--list|--search=<pattern>|--category=<type>]"
allowed-tools: ["Read", "Write", "Bash", "Glob", "Grep", "mcp__claude-flow__language_detect", "mcp__claude-flow__framework_detect", "mcp__claude-flow__memory_usage", "mcp__shadcn_mcp__generate_component"]
---

# Contextual Code Templates

Generate relevant code templates based on your project's detected frameworks, patterns, and current context.

**Template Type**: $ARGUMENTS

## Template Options

- `--list` - Show all available templates for detected framework
- `--search=<pattern>` - Search templates by keyword or pattern
- `--category=<type>` - Filter by category (component, service, test, config)
- `<component-type>` - Generate specific component (e.g., "api-route", "react-component")

## What This Command Does

### 🎯 Smart Template Selection
- **Framework Detection**: Automatically detects React, Express, FastAPI, Axum, etc.
- **Pattern Recognition**: Analyzes existing code patterns and conventions
- **Context-Aware**: Suggests templates relevant to current file/directory
- **Best Practices**: Templates follow industry standards and conventions

### 📋 Template Categories

#### Frontend Templates
- **React Components**: Functional components, hooks, context providers
- **Vue Components**: Composition API, reactive patterns
- **Angular Components**: Services, modules, guards
- **Styling**: CSS modules, styled-components, Tailwind patterns

#### Backend Templates
- **REST APIs**: Express routes, FastAPI endpoints, Axum handlers
- **Database**: Models, migrations, queries, repositories
- **Authentication**: JWT middleware, OAuth flows, session management
- **Testing**: Unit tests, integration tests, mocks

#### Configuration Templates
- **Build Tools**: Webpack, Vite, Rollup configurations
- **CI/CD**: GitHub Actions, Docker, deployment scripts
- **Environment**: .env templates, config management
- **Documentation**: README patterns, API docs, changelogs

## Framework-Specific Examples

### React Project Detected
```bash
# Available templates:
/suggest-templates --list
# Output: react-component, react-hook, context-provider, test-component

# Generate a React component
/suggest-templates react-component
# Creates: functional component with TypeScript, props interface, styling
```

### Express.js Project Detected
```bash
# Generate API route template
/suggest-templates api-route
# Creates: Express route with validation, error handling, documentation

# Generate middleware template
/suggest-templates middleware
# Creates: Express middleware with proper error handling and logging
```

### Rust Project Detected
```bash
# Generate Axum handler
/suggest-templates axum-handler
# Creates: Async handler with proper error handling and serialization

# Generate test module
/suggest-templates rust-test
# Creates: Test module with common test patterns and mocks
```

## Template Features

### 🛠️ Smart Generation
- **Project Conventions**: Follows your existing naming and structure patterns
- **Dependency Integration**: Uses libraries already in your project
- **Type Safety**: Generates TypeScript/Rust types when applicable
- **Error Handling**: Includes proper error handling patterns

### 📚 Educational Comments
- **Best Practice Explanations**: Comments explain why patterns are used
- **Common Pitfalls**: Warnings about potential issues
- **Extension Points**: Suggestions for how to extend the template
- **Performance Tips**: Optimization recommendations

### 🔄 Template Customization
- **Variable Substitution**: Replaces placeholders with project-specific values
- **Conditional Sections**: Includes/excludes code based on project setup
- **Style Matching**: Matches your existing code style (spaces/tabs, naming)

## Sample Template Output

```typescript
// React Functional Component Template
import React, { useState, useEffect } from 'react';
import styles from './MyComponent.module.css';

interface MyComponentProps {
  // TODO: Define your props here
  title?: string;
}

/**
 * MyComponent - Brief description
 * 
 * Best Practices:
 * - Use functional components with hooks
 * - Keep components small and focused
 * - Extract custom hooks for complex logic
 */
const MyComponent: React.FC<MyComponentProps> = ({ title = 'Default Title' }) => {
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // TODO: Add your effect logic here
  }, []);

  return (
    <div className={styles.container}>
      <h2>{title}</h2>
      {/* TODO: Add your component content */}
    </div>
  );
};

export default MyComponent;
```

## Integration with Tools

- **shadcn/ui Integration**: Generate beautiful UI components when shadcn is detected
- **Testing Framework**: Include appropriate test templates (Jest, Vitest, pytest)
- **Documentation**: Generate component documentation and usage examples
- **Storybook**: Include Storybook stories when detected

Get contextual, educational code templates that follow your project's patterns and best practices.