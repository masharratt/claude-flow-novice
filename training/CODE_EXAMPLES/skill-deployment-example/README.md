# Skill Deployment Example

Complete working example demonstrating standardized skill lifecycle management.

## Overview

- Deploy and validate skills
- Manage skill versions
- Implement rollback capabilities
- Test skill content integrity

## Key Patterns

### 1. Validated Deployment

```typescript
import { SkillLoader } from './skill-loader';

const loader = new SkillLoader({ skillsPath: './.claude/skills' });

// Deploy with validation
await loader.deploySkill({
  name: 'cfn-custom-skill',
  content: skillMarkdown,
  version: '1.2.0',
  metadata: {
    author: 'team@company.com',
    dependencies: ['cfn-coordination'],
    changelog: 'Added new parameters'
  }
});
```

### 2. Content Validation

```typescript
// Validate before deployment
const result = await loader.validateSkill(content);

if (!result.valid) {
  console.error('Validation errors:', result.errors);
  // [
  //   'Missing required section: ## Usage',
  //   'Invalid version format: must be semver',
  //   'Content exceeds max size: 50KB'
  // ]
}
```

### 3. Version Management

```typescript
// Get deployment history
const history = await loader.getHistory('cfn-coordination');
// [
//   { version: '2.1.0', deployedAt: '2025-11-16', status: 'active' },
//   { version: '2.0.0', deployedAt: '2025-11-10', status: 'superseded' }
// ]

// Rollback to previous version
await loader.rollbackSkill('cfn-coordination', '2.0.0');
```

## Best Practices

1. Validate content before deployment
2. Use semantic versioning
3. Include comprehensive metadata
4. Test skills after deployment
5. Maintain deployment history

See full implementation in files.
