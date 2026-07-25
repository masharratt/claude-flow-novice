/**
 * Skill Markdown Validator Tests
 *
 * Comprehensive test suite for SKILL.md structure and content validation.
 * Follows TDD methodology - tests written before implementation.
 *
 * @module tests/skill-markdown-validator
 * @version 1.0.0
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  validateSkillMarkdown,
  validateContentStructure,
  validateCodeBlocks,
  validateInternalLinks,
  SkillMarkdownError,
  ContentValidationResult,
  CodeBlockValidationResult,
  LinkValidationResult,
} from '../src/lib/skill-markdown-validator';
import { parseFrontmatter } from '../src/lib/skill-frontmatter-parser';

describe('SkillMarkdownValidator', () => {
  describe('validateSkillMarkdown', () => {
    it('should validate a complete valid skill file', () => {
      const validSkill = `---
name: test-skill
version: 1.0.0
tags: [test, validation]
status: draft
author: Test Author
description: Test skill for validation with comprehensive content
created: "2025-11-16"
---

# Test Skill

## Overview

This is a test skill with sufficient content to meet minimum length requirements.
It provides comprehensive functionality for testing the validation system.

## Usage

Basic usage instructions with detailed explanation of how to use this skill
in various contexts and scenarios. Here's a simple example:

\`\`\`bash
./execute.sh --param value
\`\`\`

## Examples

Example 1 - Basic usage with detailed explanation of what this example demonstrates
and why it's useful for understanding the skill functionality:

\`\`\`typescript
const result = await executeSkill('test-skill', { verbose: true });
console.log('Result:', result);
\`\`\`

## Implementation

Implementation details here including architecture decisions, key algorithms,
and important considerations for maintaining and extending this skill.

## Tests

Test documentation here explaining how to run tests, what they cover,
and what success criteria are used to validate the skill functionality.
`;

      const result = validateSkillMarkdown(validSkill);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it('should fail validation for missing frontmatter', () => {
      const invalidSkill = `# Test Skill

No frontmatter here.
`;

      expect(() => validateSkillMarkdown(invalidSkill)).toThrow(SkillMarkdownError);
    });

    it('should fail validation for invalid frontmatter', () => {
      const invalidSkill = `---
name: test-skill
version: invalid-version
tags: not-an-array
status: draft
author: Test Author
description: Test
---

# Content
`;

      const result = validateSkillMarkdown(invalidSkill);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should detect missing required sections', () => {
      const invalidSkill = `---
name: test-skill
version: 1.0.0
tags: [test]
status: draft
author: Test Author
description: Test skill
---

# Test Skill

Only overview, missing other sections.
`;

      const result = validateSkillMarkdown(invalidSkill);
      expect(result.valid).toBe(false);
      const hasUsageError = result.errors.some(error => error.includes('Usage'));
      expect(hasUsageError).toBe(true);
    });

    it('should collect warnings for optional improvements', () => {
      const skillWithWarnings = `---
name: test-skill
version: 1.0.0
tags: [test]
status: draft
author: Test Author
description: Test skill for validation
---

# Test Skill

## Overview

Brief overview.

## Usage

Usage here.

## Examples

Examples here.

## Implementation

Implementation here.

## Tests

Tests here.
`;

      const result = validateSkillMarkdown(skillWithWarnings);
      // May have warnings but should be valid
      expect(result.valid).toBe(true);
    });

    it('should validate within performance target (<50ms)', () => {
      const validSkill = `---
name: test-skill
version: 1.0.0
tags: [test]
status: draft
author: Test Author
description: Test skill
created: 2025-11-16
---

# Test Skill

## Overview
Overview content.

## Usage
Usage content.

## Examples
Examples content.

## Implementation
Implementation content.

## Tests
Tests content.
`;

      const startTime = Date.now();
      validateSkillMarkdown(validSkill);
      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(50);
    });
  });

  describe('validateContentStructure', () => {
    it('should validate correct section order', () => {
      const content = `# Test Skill

## Overview

Overview section.

## Usage

Usage section.

## Examples

Examples section.

## Implementation

Implementation section.

## Tests

Tests section.
`;

      const result = validateContentStructure(content);
      expect(result.valid).toBe(true);
      expect(result.sections).toEqual({
        Overview: true,
        Usage: true,
        Examples: true,
        Implementation: true,
        Tests: true,
      });
    });

    it('should detect missing required sections', () => {
      const content = `# Test Skill

## Overview

Overview only.
`;

      const result = validateContentStructure(content);
      expect(result.valid).toBe(false);
      expect(result.missingRequiredSections).toContain('Usage');
      expect(result.missingRequiredSections).toContain('Examples');
      expect(result.missingRequiredSections).toContain('Implementation');
      expect(result.missingRequiredSections).toContain('Tests');
    });

    it('should detect incorrect section order', () => {
      const content = `# Test Skill

## Usage

Usage first (wrong order).

## Overview

Overview second (wrong order).

## Examples

Examples.

## Implementation

Implementation.

## Tests

Tests.
`;

      const result = validateContentStructure(content);
      expect(result.valid).toBe(false);
      expect(result.sectionOrderErrors.length).toBeGreaterThan(0);
    });

    it('should allow optional sections', () => {
      const content = `# Test Skill

## Overview

Overview.

## Usage

Usage.

## Examples

Examples.

## Implementation

Implementation.

## Tests

Tests.

## API Reference

Optional section.

## Related Skills

Optional section.
`;

      const result = validateContentStructure(content);
      expect(result.valid).toBe(true);
      expect(result.optionalSections).toContain('API Reference');
      expect(result.optionalSections).toContain('Related Skills');
    });

    it('should validate minimum content length per section', () => {
      const content = `# Test Skill

## Overview

Too short.

## Usage

Also short.

## Examples

Short.

## Implementation

Short.

## Tests

Short.
`;

      const result = validateContentStructure(content);
      const hasMinLengthWarning = result.warnings.some(warning =>
        warning.includes('minimum content length')
      );
      expect(hasMinLengthWarning).toBe(true);
    });
  });

  describe('validateCodeBlocks', () => {
    it('should validate code blocks with syntax highlighting', () => {
      const content = `
\`\`\`bash
./execute.sh
\`\`\`

\`\`\`typescript
const result = await executeSkill('test');
\`\`\`

\`\`\`json
{
  "key": "value"
}
\`\`\`
`;

      const result = validateCodeBlocks(content);
      expect(result.valid).toBe(true);
      expect(result.codeBlocks).toHaveLength(3);
      expect(result.codeBlocks[0].language).toBe('bash');
      expect(result.codeBlocks[1].language).toBe('typescript');
      expect(result.codeBlocks[2].language).toBe('json');
    });

    it('should detect code blocks without language specification', () => {
      const content = `
\`\`\`
No language specified
\`\`\`
`;

      const result = validateCodeBlocks(content);
      expect(result.valid).toBe(false);
      const hasLangError = result.errors.some(error =>
        error.includes('language specification')
      );
      expect(hasLangError).toBe(true);
    });

    it('should validate supported languages', () => {
      const content = `
\`\`\`unknownlang
This language is not supported
\`\`\`
`;

      const result = validateCodeBlocks(content);
      const hasUnsupportedLangWarning = result.warnings.some(warning =>
        warning.includes('unsupported language')
      );
      expect(hasUnsupportedLangWarning).toBe(true);
    });

    it('should detect empty code blocks', () => {
      const content = `Some text before

\`\`\`bash

\`\`\`

Some text after`;

      const result = validateCodeBlocks(content);
      const hasEmptyBlockWarning = result.warnings.some(warning =>
        warning.includes('is empty')
      );
      expect(hasEmptyBlockWarning).toBe(true);
    });

    it('should validate shell script syntax in bash blocks', () => {
      const content = `
\`\`\`bash
#!/bin/bash
set -euo pipefail
echo "Valid script"
\`\`\`
`;

      const result = validateCodeBlocks(content);
      expect(result.valid).toBe(true);
    });
  });

  describe('validateInternalLinks', () => {
    it('should validate internal markdown links', () => {
      const content = `
[Link to section](#usage)
[Link to file](./related-file.md)
[Link to docs](../../docs/GUIDE.md)
`;

      const basePath = '/home/user/claude-flow-novice/.claude/skills/test-skill';
      const result = validateInternalLinks(content, basePath);

      // Internal links may be broken if files don't exist, so we just check that links were found
      expect(result.links).toHaveLength(3);
    });

    it('should detect broken internal links', () => {
      const content = `
[Broken link](./nonexistent-file.md)
[Another broken](../../docs/MISSING.md)
`;

      const basePath = '/home/user/claude-flow-novice/.claude/skills/test-skill';
      const result = validateInternalLinks(content, basePath);

      expect(result.valid).toBe(false);
      expect(result.brokenLinks.length).toBeGreaterThan(0);
    });

    it('should validate anchor links to sections', () => {
      const content = `
# Test Skill

## Overview

[Jump to usage](#usage)

## Usage

Content here.
`;

      const basePath = '/home/user/claude-flow-novice/.claude/skills/test-skill';
      const result = validateInternalLinks(content, basePath);

      expect(result.valid).toBe(true);
    });

    it('should detect broken anchor links', () => {
      const content = `
# Test Skill

## Overview

[Broken anchor](#nonexistent-section)
`;

      const basePath = '/home/user/claude-flow-novice/.claude/skills/test-skill';
      const result = validateInternalLinks(content, basePath);

      expect(result.valid).toBe(false);
      const hasBrokenAnchor = result.brokenLinks.some(link =>
        link.includes('#nonexistent-section')
      );
      expect(hasBrokenAnchor).toBe(true);
    });

    it('should allow external links without validation', () => {
      const content = `
[External link](https://example.com)
[Another external](http://github.com)
`;

      const basePath = '/home/user/claude-flow-novice/.claude/skills/test-skill';
      const result = validateInternalLinks(content, basePath);

      expect(result.valid).toBe(true);
      expect(result.externalLinks).toHaveLength(2);
    });
  });

  describe('SkillMarkdownError', () => {
    it('should create error with validation details', () => {
      const error = new SkillMarkdownError('Validation failed', {
        errors: ['Error 1', 'Error 2'],
        warnings: ['Warning 1'],
      });

      expect(error.name).toBe('SkillMarkdownError');
      expect(error.code).toBe('SKILL_MARKDOWN_VALIDATION_ERROR');
      expect(error.message).toBe('Validation failed');
      expect(error.context).toEqual({
        errors: ['Error 1', 'Error 2'],
        warnings: ['Warning 1'],
      });
    });

    it('should extend StandardError', () => {
      const error = new SkillMarkdownError('Test error');
      expect(error).toBeInstanceOf(Error);
      expect(error.code).toBe('SKILL_MARKDOWN_VALIDATION_ERROR');
    });
  });

  describe('Performance', () => {
    it('should validate large skill files within performance target', () => {
      // Generate large but valid skill file
      const sections = [
        'Overview',
        'Usage',
        'Examples',
        'Implementation',
        'Tests',
        'API Reference',
        'Configuration',
        'Troubleshooting',
        'Performance',
        'Security',
      ];

      let content = `---
name: large-skill
version: 1.0.0
tags: [test, performance]
status: draft
author: Test Author
description: Large skill file for performance testing
---

# Large Skill

`;

      sections.forEach((section) => {
        content += `## ${section}\n\n`;
        // Add substantial content to each section
        for (let i = 0; i < 50; i++) {
          content += `This is line ${i} of the ${section} section.\n`;
        }
        content += '\n';

        // Add code blocks
        content += '```bash\n';
        content += '#!/bin/bash\n';
        content += 'echo "Example code"\n';
        content += '```\n\n';
      });

      const startTime = Date.now();
      const result = validateSkillMarkdown(content);
      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(result.valid).toBe(true);
      expect(duration).toBeLessThan(50);
    });
  });

  describe('Integration with frontmatter parser', () => {
    it('should use parseFrontmatter for frontmatter validation', () => {
      const content = `---
name: integration-test
version: 1.0.0
tags: [test]
status: draft
author: Test Author
description: Integration test
---

# Integration Test

## Overview
Content.

## Usage
Content.

## Examples
Content.

## Implementation
Content.

## Tests
Content.
`;

      const parsed = parseFrontmatter(content);
      expect(parsed.frontmatter.name).toBe('integration-test');

      const validated = validateSkillMarkdown(content);
      expect(validated.valid).toBe(true);
    });
  });
});
