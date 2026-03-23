# Google Sheets Specialized Agents

This directory contains 10 highly specialized Google Sheets agents designed to handle specific aspects of Google Sheets expertise and functionality.

## Agent Overview

### 1. **google-sheets-design-layout-specialist**
- **Focus**: UI/UX design, formatting, visual hierarchy, and spreadsheet structure
- **Tools**: [Read, Write, Edit, Grep, Glob]
- **Model**: haiku
- **ACL Level**: 1

### 2. **google-sheets-formula-engineering-specialist**
- **Focus**: Complex formulas, array formulas, custom functions, and formula optimization
- **Tools**: [Read, Write, Edit, Grep, Glob, TodoWrite]
- **Model**: haiku
- **ACL Level**: 1

### 3. **google-sheets-data-visualization-specialist**
- **Focus**: Charts, dashboards, visual storytelling, and interactive visualizations
- **Tools**: [Read, Write, Edit, Grep, Glob, TodoWrite]
- **Model**: haiku
- **ACL Level**: 1

### 4. **google-sheets-automation-scripting-specialist**
- **Focus**: Apps Script development, automation, macros, and workflow optimization
- **Tools**: [Read, Write, Edit, Bash, Grep, Glob, TodoWrite]
- **Model**: sonnet
- **ACL Level**: 2

### 5. **google-sheets-data-validation-quality-specialist**
- **Focus**: Data validation, quality control, error detection, and data hygiene
- **Tools**: [Read, Write, Edit, Grep, Glob, TodoWrite]
- **Model**: haiku
- **ACL Level**: 1

### 6. **google-sheets-integration-api-specialist**
- **Focus**: API integrations, external data sources, webhooks, and data pipelines
- **Tools**: [Read, Write, Edit, Bash, Grep, Glob, TodoWrite]
- **Model**: sonnet
- **ACL Level**: 2

### 7. **google-sheets-collaboration-security-specialist**
- **Focus**: Permission management, team workflows, security compliance, and access control
- **Tools**: [Read, Write, Edit, Grep, Glob, TodoWrite]
- **Model**: sonnet
- **ACL Level**: 3

### 8. **google-sheets-performance-optimization-specialist**
- **Focus**: Speed optimization, large dataset handling, efficiency tuning, and resource management
- **Tools**: [Read, Write, Edit, Grep, Glob, TodoWrite]
- **Model**: haiku
- **ACL Level**: 1

### 9. **google-sheets-advanced-analytics-specialist**
- **Focus**: Statistical analysis, predictive modeling, business intelligence, and data science
- **Tools**: [Read, Write, Edit, Grep, Glob, TodoWrite]
- **Model**: sonnet
- **ACL Level**: 2

### 10. **google-sheets-template-architecture-specialist**
- **Focus**: Template design, reusable patterns, scalability planning, and architecture frameworks
- **Tools**: [Read, Write, Edit, Grep, Glob, TodoWrite]
- **Model**: haiku
- **ACL Level**: 1

## Usage Guidelines

### Agent Selection
- Use specific agents for their specialized expertise areas
- Consider ACL levels when coordinating between agents
- Match tool requirements to task complexity

### Coordination Patterns
- **Simple Tasks**: Use single specialized agents
- **Complex Projects**: Combine multiple specialists with a coordinator
- **Multi-Phase Workflows**: Sequence specialists based on project phases

### Common Combinations
- **Full Spreadsheet Development**: design-layout → formula-engineering → data-visualization
- **Enterprise Implementation**: collaboration-security → integration-api → performance-optimization
- **Analytics Pipeline**: data-validation-quality → advanced-analytics → data-visualization
- **Template Creation**: template-architecture → design-layout → formula-engineering

## Agent Architecture Standards

All agents follow consistent patterns:
- **YAML Frontmatter**: Standardized metadata and capability definitions
- **Single-Line Descriptions**: Optimal tokenization with clear usage triggers
- **Comma-Separated Lists**: Tools and capabilities in bracket format
- **Completion Protocol**: Structured response format with confidence scoring
- **Success Metrics**: Clear quality standards and performance criteria

## Quality Assurance

- Filename consistency validated against frontmatter `name:` fields
- YAML structure verified for proper formatting
- Tool selections appropriate for specialization areas
- ACL levels aligned with security and complexity requirements
- Model choices optimized for task complexity and cost efficiency

## Integration with CFN Loop

These agents are designed to work within CFN Loop workflows:
- **Loop 3 (Implementation)**: Design, engineering, visualization, automation specialists
- **Loop 2 (Validation)**: Data validation, security, performance specialists
- **Product Owner**: Analytics and template architecture for strategic decisions

## Maintenance

- Regular updates to keep pace with Google Sheets feature changes
- Performance monitoring and optimization of agent responses
- Documentation updates based on user feedback and usage patterns
- Continuous improvement of agent capabilities and success criteria