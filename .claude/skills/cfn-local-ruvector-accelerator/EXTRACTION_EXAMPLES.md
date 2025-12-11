# RuVector Extraction Examples

This document demonstrates what the TypeScript/JavaScript and text-based fallback extractors capture from different file types.

## TypeScript Extraction Example

### Input File: `hello.ts`

```typescript
/**
 * Simple hello module
 */

export function sayHello(name: string): void {
  console.log(`Hello, ${name}!`);
}

export interface Greeter {
  greet(name: string): void;
}

export class SimpleGreeter implements Greeter {
  greet(name: string): void {
    sayHello(name);
  }
}

export type GreetingFunction = (name: string) => void;

import { Logger } from './logger';
```

### Extracted Entities

| Name | Kind | Line | Visibility | Metadata |
|------|------|------|------------|----------|
| `sayHello` | Function | 6 | Public | exported: true |
| `Greeter` | Interface | 10 | Public | exported: true |
| `SimpleGreeter` | Class | 14 | Public | exported: true, implements: Greeter |
| `GreetingFunction` | TypeAlias | 22 | Public | exported: true, type_definition: "(name: string) => void" |

### Extracted References

| Target | Type | File | Line |
|--------|------|------|------|
| `Logger` | Import | ./logger | 24 |

## JSON Extraction Example

### Input File: `package.json`

```json
{
  "name": "hello-world",
  "version": "1.0.0",
  "description": "Simple greeting library",
  "main": "dist/hello.js",
  "scripts": {
    "build": "tsc",
    "test": "jest"
  },
  "dependencies": {
    "typescript": "^5.0.0",
    "jest": "^29.0.0"
  }
}
```

### Extracted Entities

| Name | Kind | Data Type | Metadata |
|------|------|-----------|----------|
| `name` | Variable | string | chunk_type: json |
| `version` | Variable | string | chunk_type: json |
| `description` | Variable | string | chunk_type: json |
| `main` | Variable | string | chunk_type: json |
| `scripts` | Variable | object | chunk_type: json |
| `dependencies` | Variable | object | chunk_type: json |

**Benefit**: All top-level keys are indexed for semantic search, enabling queries like "find configuration with name hello-world" or "locate all JSON files with dependencies".

## YAML Extraction Example

### Input File: `config.yaml`

```yaml
version: 1.0.0
name: hello-app
environments:
  development:
    debug: true
    port: 3000
  production:
    debug: false
    port: 8080
features:
  logging: enabled
  caching: enabled
```

### Extracted Entities

| Name | Line | Indent Level | Metadata |
|------|------|--------------|----------|
| `version` | 1 | 0 | chunk_type: yaml |
| `name` | 2 | 0 | chunk_type: yaml |
| `environments` | 3 | 0 | chunk_type: yaml |
| `development` | 4 | 1 | chunk_type: yaml |
| `debug` | 5 | 2 | chunk_type: yaml |
| `port` | 6 | 2 | chunk_type: yaml |
| `production` | 7 | 1 | chunk_type: yaml |
| `debug` | 8 | 2 | chunk_type: yaml |
| `port` | 9 | 2 | chunk_type: yaml |
| `features` | 10 | 0 | chunk_type: yaml |
| `logging` | 11 | 1 | chunk_type: yaml |
| `caching` | 12 | 1 | chunk_type: yaml |

**Benefit**: Configuration structure is indexed with indentation levels, enabling hierarchical searches and environment-specific queries.

## Markdown Extraction Example

### Input File: `README.md`

```markdown
# Getting Started

This guide helps you set up the project.

## Installation

```bash
npm install
npm run build
```

## Configuration

Edit the config.yaml file to customize settings.

### Advanced Setup

For advanced users, use environment variables.
```

### Extracted Entities

| Name | Type | Line | Metadata |
|------|------|------|----------|
| `Getting Started` | Module | 1 | chunk_type: markdown, heading_level: 1 |
| `Installation` | Namespace | 5 | chunk_type: markdown, heading_level: 2 |
| `code_bash` | Variable | 7 | chunk_type: markdown_code, language: bash |
| `Configuration` | Namespace | 12 | chunk_type: markdown, heading_level: 2 |
| `Advanced Setup` | Namespace | 15 | chunk_type: markdown, heading_level: 3 |

**Benefit**: Documentation structure is preserved, enabling navigation and contextual search across documentation files.

## Shell Script Extraction Example

### Input File: `setup.sh`

```bash
#!/bin/bash

DATABASE_URL="postgres://localhost:5432/mydb"
API_KEY="secret-key-123"
DEBUG_MODE=true

function setup_environment() {
  echo "Setting up environment..."
  export DATABASE_URL
  export API_KEY
}

function cleanup() {
  rm -rf /tmp/cache
  unset DEBUG_MODE
}

setup_environment
```

### Extracted Entities

| Name | Kind | Type | Line |
|------|------|------|------|
| `DATABASE_URL` | Variable | shell_variable | 3 |
| `API_KEY` | Variable | shell_variable | 4 |
| `DEBUG_MODE` | Variable | shell_variable | 5 |
| `setup_environment` | Function | shell_function | 7 |
| `cleanup` | Function | shell_function | 12 |

**Benefit**: Shell script structure is indexed, enabling queries like "find all setup functions" or "locate database configuration variables".

## Extraction Statistics

### Coverage by File Type

| File Type | Extractor | Entity Types | References | Support Level |
|-----------|-----------|--------------|------------|----------------|
| `.ts, .tsx, .js, .jsx, .mjs, .cjs` | TypeScript | Functions, Classes, Interfaces, Types | Imports | Full |
| `.json` | JSON | Top-level keys | None | Full |
| `.yaml, .yml` | YAML | Keys (hierarchical) | None | Full |
| `.md, .markdown` | Markdown | Headings, Code Blocks | None | Full |
| `.sh, .bash` | Shell | Functions, Variables | None | Full |
| `.rs` | Rust | Functions, Structs, Traits, Imports | References | Full |
| Others | Text Fallback | Meaningful text chunks | None | Partial |

## Indexing Results

When you run `local-ruvector index`, the system:

1. **Scans** all files in the project
2. **Routes** files to appropriate extractors based on extension
3. **Extracts** entities and references using language-specific logic
4. **Generates** embeddings for all extracted entities
5. **Stores** results in SQLite database with vector search capability

### Example Output

```
Starting index process
File types: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".rs", ".json", ".yaml", ".yml", ".md", ".markdown", ".sh", ".bash", ".txt", ".config", ".conf", ".env"]

Processing 1000 files...
✓ hello.ts: 4 entities, 1 reference, 4 embeddings
✓ package.json: 6 entities, 0 references, 6 embeddings
✓ config.yaml: 11 entities, 0 references, 11 embeddings
✓ setup.sh: 5 entities, 0 references, 5 embeddings
...

Index complete: 1000 files processed
- Entities extracted: 12,345
- References extracted: 2,108
- Embeddings generated: 12,345
```

## Semantic Search Capabilities

After indexing, you can search for:

### TypeScript/JavaScript Specific
- Functions: "Find all exported functions that handle authentication"
- Classes: "Locate all classes that implement Observable"
- Interfaces: "Find all interfaces defined in the API layer"
- Types: "Search for union types used in state management"
- Imports: "Show all files importing from react"

### JSON Configuration
- "Find all configuration files with database settings"
- "Locate package.json files with specific dependencies"
- "Search for API endpoint definitions"

### YAML Configuration
- "Find all environment-specific configurations"
- "Locate service definitions in docker-compose files"
- "Search for feature flag configurations"

### Markdown Documentation
- "Find installation guides"
- "Locate API documentation sections"
- "Search for code examples in specific languages"

### Shell Scripts
- "Find all setup functions"
- "Locate scripts with specific environment variables"
- "Search for database initialization scripts"

## Performance Notes

- **TypeScript files**: <1ms per file (regex-based)
- **JSON files**: <0.5ms per file (native parsing)
- **YAML files**: <1ms per file (line-based)
- **Markdown files**: <1ms per file (pattern-based)
- **Shell files**: <1ms per file (regex-based)

Complete project indexing (10,000 files): ~30-50 seconds depending on file types and complexity.

## Next Steps

After indexing:

1. **Query** using `local-ruvector query`
2. **Export** results using `local-ruvector export`
3. **Analyze** dependencies using `local-ruvector refs`
4. **Monitor** with `local-ruvector stats`

See the main README for detailed usage instructions.
