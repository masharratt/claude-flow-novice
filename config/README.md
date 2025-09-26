# Configuration Directory Structure

This directory contains all configuration files organized by tool/purpose to improve maintainability and clarity.

## Directory Structure

```
config/
├── typescript/     # TypeScript configuration files
├── jest/          # Jest testing configuration
├── linting/       # ESLint, Prettier, and other linting tools
├── build/         # Build tool configurations (Babel, SWC, etc.)
└── apps/          # Application-specific configurations
```

## Purpose

The config directory centralizes all configuration files to:
- Improve project organization
- Make configurations easier to find and maintain
- Enable better sharing of configurations across projects
- Separate concerns by tool type
- Prepare for potential monorepo structure

## Subdirectory Details

### typescript/
Contains TypeScript compiler configurations:
- Base TypeScript configs
- Environment-specific tsconfig files
- Shared TypeScript project references

### jest/
Contains Jest testing framework configurations:
- Base Jest configuration
- Environment-specific test configs
- Custom test setups and utilities

### linting/
Contains code quality and formatting configurations:
- ESLint rules and configurations
- Prettier formatting rules
- Other linting tools (stylelint, etc.)

### build/
Contains build tool configurations:
- Babel configurations for transpilation
- SWC configurations for fast compilation
- Webpack or other bundler configurations
- Build optimization settings

### apps/
Contains application-specific configurations:
- App-specific overrides
- Environment configurations
- Feature flags and app settings

## Migration Plan

Future phases will move existing configuration files into these directories:
1. TypeScript configs → config/typescript/
2. Jest configs → config/jest/
3. Linting configs → config/linting/
4. Build tool configs → config/build/
5. App configs → config/apps/ (if approved)

## Benefits

- **Organization**: Clear separation of configuration concerns
- **Maintainability**: Easier to locate and update specific configurations
- **Reusability**: Configurations can be shared across projects
- **Scalability**: Structure supports growth to monorepo if needed
- **Developer Experience**: Reduced cognitive load when working with configs