# Documentation Style Guidelines

## Core Principles

### Language Style
- **Sparse, concise language** - maximum information, minimum words
- **Active voice** - "Use this function" not "This function is used"
- **Present tense** - "Returns data" not "Will return data"
- **No fluff** - Remove introductory phrases, opinions, unnecessary context

### Structure
- **Logical hierarchy** - clear sections, subsections
- **Consistent patterns** - repeatable formats across documentation
- **Scannable** - headings, bullet points, code blocks
- **Practical focus** - what developers need, not what we think they want

### Technical Content
- **Accurate** - code examples must work
- **Complete** - include parameters, return values, errors
- **Contextual** - explain when/why to use features
- **Cross-referenced** - link to related documentation

## Section Templates

### Function Documentation
```markdown
## functionName

**Purpose**: Brief statement of what the function does

**Signature**: \`function(param1, param2) -> returnType\`

**Parameters**:
- \`param1\` (type): Description
- \`param2\` (type): Description, optional

**Returns**: Return type and description

**Example**:
\`\`\`javascript
const result = functionName(value1, value2);
\`\`\`

**Use Cases**: When to use this function
```

### API Endpoint Documentation
```markdown
### METHOD /endpoint

**Purpose**: What this endpoint does

**Parameters**:
- \`param\` (type, in: query/body): Description

**Request**:
\`\`\`json
{
  "field": "value"
}
\`\`\`

**Response**:
\`\`\`json
{
  "status": "success"
}
\`\`\`

**Status Codes**: 200, 400, 401, 500

**Example**:
\`\`\`bash
curl -X POST /endpoint -d '{"field":"value"}'
\`\`\`
```

### Feature Documentation
```markdown
## Feature Name

**Purpose**: What problem this solves

**Usage**: How to use it

**Configuration**: Available settings

**Examples**: Practical implementations

**Integration**: How it connects to other systems
```

## File Naming Convention

- **kebab-case** for all markdown files
- **Prefix with category** (logs-, api-, cli-, etc.)
- **Descriptive names** that clearly indicate content

## Code Examples

- **Minimal** - show only what's necessary
- **Working** - all examples must be tested
- **Contextual** - include imports/dependencies if needed
- **Commented** - explain non-obvious parts

## Cross-References

- Use relative paths: \`[API](./logs-api.md)\`
- Reference specific sections: \`[Functions](./logs-functions.md#core-functions)\`
- Link external resources with full URLs

## Maintenance

- **Version tracking** - update examples with API changes
- **Deprecation notices** - clearly mark outdated information
- **Testing** - verify code examples work
- **Reviews** - regular accuracy checks