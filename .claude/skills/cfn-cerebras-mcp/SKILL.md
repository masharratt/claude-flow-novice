# Cerebras MCP Code Generation

Fast code generation via `mcp__cerebras-mcp__write` tool.

## When to Use

Use for generating or modifying code files when speed matters. Prompt must be SHORTER than expected output.

## Usage

```
mcp__cerebras-mcp__write:
  file_path: /absolute/path/to/file.ts
  prompt: |
    Function: validateEmail(email: string): boolean
    Steps:
    - Regex test /^[^@]+@[^@]+\.[^@]+$/
    - Return boolean result
    Imports: none
    Errors: none
  context_files:
    - /path/to/related/file.ts
```

## Prompt Format (Blueprint Style)

```
File: /path/to/file.ts
Function: functionName(params): returnType
Steps:
- Step 1
- Step 2
Imports: import { X } from './y'
Errors: throw new Error("message")
```

## Rules

1. **Prompt < Output**: Blueprint must be shorter than generated code
2. **Always include context_files**: When code needs imports from existing files
3. **Absolute paths only**: Use full paths, not relative
4. **One file per call**: Generate/modify single file

## Bad vs Good

**Bad** (verbose):
```
I need you to create a function that validates email addresses.
The function should take an email string as input and return true
if valid or false if invalid...
```

**Good** (blueprint):
```
Function: validateEmail(email: string): boolean
- Regex: /^[^@]+@[^@]+\.[^@]+$/
- Return: true if match, false otherwise
```
