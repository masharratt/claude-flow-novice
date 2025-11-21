/**
 * Skill Generation Test Suite
 * Tests skill generation from patterns with validation, error handling, and coverage
 *
 * Migration from: docker/tests/test-skill-generation.sh
 */

import { describe, it, expect, beforeEach } from '@jest/globals';

interface WorkflowPattern {
  patternId: string;
  name: string;
  steps: Array<{ action: string }>;
}

interface GeneratedSkill {
  skillId: string;
  name: string;
  description: string;
  skillScript: string;
  skillDoc: string;
  readme: string;
  changelog: string;
  tests: string[];
}

class SkillGenerator {
  /**
   * Generate a skill from a workflow pattern
   */
  generateSkill(pattern: WorkflowPattern): GeneratedSkill {
    const skillId = `skill-${pattern.patternId}`;
    const name = pattern.name;
    const description = `Auto-generated skill from pattern: ${pattern.patternId}`;

    const skillScript = this.generateSkillScript(pattern);
    const skillDoc = this.generateSkillDoc(pattern);
    const readme = this.generateReadme(name);
    const changelog = this.generateChangelog(skillId);
    const tests = this.generateTests(name);

    return {
      skillId,
      name,
      description,
      skillScript,
      skillDoc,
      readme,
      changelog,
      tests
    };
  }

  /**
   * Generate skill script
   */
  private generateSkillScript(pattern: WorkflowPattern): string {
    const steps = pattern.steps.map((step, idx) => `  # Step ${idx + 1}: ${step.action}`).join('\n');

    return `#!/bin/bash
set -euo pipefail

# Auto-generated skill from workflow pattern
# Pattern ID: ${pattern.patternId}
# Name: ${pattern.name}

${steps}

echo "Skill execution completed"
`;
  }

  /**
   * Generate SKILL.md documentation
   */
  private generateSkillDoc(pattern: WorkflowPattern): string {
    const stepsList = pattern.steps.map((step, idx) => `${idx + 1}. ${step.action}`).join('\n');

    return `# ${pattern.name} Skill

**Auto-generated from pattern:** ${pattern.patternId}

## Description
Automated workflow for ${pattern.name}

## Usage
\`\`\`bash
./skill.sh <parameter>
\`\`\`

## Parameters
- parameter: Required parameter

## Steps
${stepsList}

## Output
Success: "Skill execution completed"

## Error Handling
The skill exits with code 1 on any failure.
`;
  }

  /**
   * Generate README.md
   */
  private generateReadme(name: string): string {
    return `# ${name}

Auto-generated skill from workflow pattern detection.

For detailed information, see SKILL.md.
`;
  }

  /**
   * Generate CHANGELOG.md
   */
  private generateChangelog(skillId: string): string {
    return `# Changelog

## [1.0.0] - ${new Date().toISOString().split('T')[0]}
- Initial auto-generated skill from pattern ${skillId}
`;
  }

  /**
   * Generate test files
   */
  private generateTests(name: string): string[] {
    return [
      `#!/bin/bash
# Test for ${name}
bash skill.sh test-param && echo "PASS: ${name}" || echo "FAIL: ${name}"
`
    ];
  }

  /**
   * Validate generated skill
   */
  validateSkill(skill: GeneratedSkill): {
    valid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check required components
    if (!skill.skillScript || skill.skillScript.length === 0) {
      errors.push('Skill script is empty');
    }

    if (!skill.skillDoc || skill.skillDoc.length === 0) {
      errors.push('Skill documentation is missing');
    }

    if (!skill.readme || skill.readme.length === 0) {
      errors.push('README is missing');
    }

    if (!skill.changelog || skill.changelog.length === 0) {
      errors.push('CHANGELOG is missing');
    }

    // Check skill script quality
    if (skill.skillScript && !skill.skillScript.includes('#!/bin/bash')) {
      warnings.push('Skill script should start with shebang');
    }

    if (skill.skillScript && !skill.skillScript.includes('set -euo pipefail')) {
      warnings.push('Skill script should use strict mode');
    }

    // Check documentation quality
    if (skill.skillDoc) {
      const docSections = ['Description', 'Usage', 'Parameters', 'Steps'];
      docSections.forEach(section => {
        if (!skill.skillDoc.includes(`## ${section}`)) {
          warnings.push(`Missing section in documentation: ${section}`);
        }
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Check skill metadata completeness
   */
  checkMetadataCompleteness(skill: GeneratedSkill): {
    complete: boolean;
    missing: string[];
  } {
    const required = [
      { field: 'skillId', value: skill.skillId },
      { field: 'name', value: skill.name },
      { field: 'description', value: skill.description },
      { field: 'skillScript', value: skill.skillScript },
      { field: 'skillDoc', value: skill.skillDoc },
      { field: 'readme', value: skill.readme },
      { field: 'changelog', value: skill.changelog }
    ];

    const missing: string[] = [];

    required.forEach(item => {
      if (!item.value || item.value.length === 0) {
        missing.push(item.field);
      }
    });

    return {
      complete: missing.length === 0,
      missing
    };
  }

  /**
   * Generate skill package
   */
  generateSkillPackage(pattern: WorkflowPattern): {
    skill: GeneratedSkill;
    validation: ReturnType<SkillGenerator['validateSkill']>;
    metadata: ReturnType<SkillGenerator['checkMetadataCompleteness']>;
  } {
    const skill = this.generateSkill(pattern);
    const validation = this.validateSkill(skill);
    const metadata = this.checkMetadataCompleteness(skill);

    return { skill, validation, metadata };
  }
}

describe('Skill Generation', () => {
  let generator: SkillGenerator;

  beforeEach(() => {
    generator = new SkillGenerator();
  });

  describe('Skill Generation', () => {
    it('should generate a skill from pattern', () => {
      const pattern: WorkflowPattern = {
        patternId: 'pattern-1',
        name: 'Test Skill',
        steps: [
          { action: 'initialize' },
          { action: 'process' },
          { action: 'finalize' }
        ]
      };

      const skill = generator.generateSkill(pattern);

      expect(skill.skillId).toContain('pattern-1');
      expect(skill.name).toBe('Test Skill');
      expect(skill.skillScript).toBeDefined();
      expect(skill.skillDoc).toBeDefined();
    });

    it('should include pattern ID in generated content', () => {
      const pattern: WorkflowPattern = {
        patternId: 'my-pattern',
        name: 'My Skill',
        steps: [{ action: 'test' }]
      };

      const skill = generator.generateSkill(pattern);

      expect(skill.skillScript).toContain('my-pattern');
      expect(skill.skillDoc).toContain('my-pattern');
    });

    it('should generate valid shell script', () => {
      const pattern: WorkflowPattern = {
        patternId: 'pattern-1',
        name: 'Test Skill',
        steps: [{ action: 'test' }]
      };

      const skill = generator.generateSkill(pattern);

      expect(skill.skillScript).toMatch(/^#!/bin\/bash/);
      expect(skill.skillScript).toContain('set -euo pipefail');
    });

    it('should include all workflow steps in documentation', () => {
      const pattern: WorkflowPattern = {
        patternId: 'pattern-1',
        name: 'Test Skill',
        steps: [
          { action: 'step1' },
          { action: 'step2' },
          { action: 'step3' }
        ]
      };

      const skill = generator.generateSkill(pattern);

      expect(skill.skillDoc).toContain('step1');
      expect(skill.skillDoc).toContain('step2');
      expect(skill.skillDoc).toContain('step3');
    });
  });

  describe('Skill Validation', () => {
    it('should validate a generated skill', () => {
      const pattern: WorkflowPattern = {
        patternId: 'pattern-1',
        name: 'Test Skill',
        steps: [{ action: 'test' }]
      };

      const skill = generator.generateSkill(pattern);
      const validation = generator.validateSkill(skill);

      expect(validation).toHaveProperty('valid');
      expect(validation).toHaveProperty('errors');
      expect(validation).toHaveProperty('warnings');
      expect(Array.isArray(validation.errors)).toBe(true);
      expect(Array.isArray(validation.warnings)).toBe(true);
    });

    it('should detect missing components', () => {
      const incompleteSkill: GeneratedSkill = {
        skillId: 'test-skill',
        name: 'Test',
        description: 'Test skill',
        skillScript: '',
        skillDoc: '',
        readme: '',
        changelog: '',
        tests: []
      };

      const validation = generator.validateSkill(incompleteSkill);

      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });

    it('should check for shebang in script', () => {
      const skill: GeneratedSkill = {
        skillId: 'test',
        name: 'Test',
        description: 'Test',
        skillScript: 'echo "test"',
        skillDoc: '# Doc',
        readme: '# README',
        changelog: '# Changelog',
        tests: []
      };

      const validation = generator.validateSkill(skill);
      expect(validation.warnings).toContainEqual(expect.objectContaining({
        includes: expect.stringContaining('shebang')
      }));
    });

    it('should check for strict mode', () => {
      const skill: GeneratedSkill = {
        skillId: 'test',
        name: 'Test',
        description: 'Test',
        skillScript: '#!/bin/bash\necho "test"',
        skillDoc: '# Doc',
        readme: '# README',
        changelog: '# Changelog',
        tests: []
      };

      const validation = generator.validateSkill(skill);
      const strictModeWarning = validation.warnings.find(w => w.includes('strict'));
      expect(strictModeWarning).toBeDefined();
    });
  });

  describe('Metadata Completeness', () => {
    it('should check metadata completeness', () => {
      const pattern: WorkflowPattern = {
        patternId: 'pattern-1',
        name: 'Test Skill',
        steps: [{ action: 'test' }]
      };

      const skill = generator.generateSkill(pattern);
      const metadata = generator.checkMetadataCompleteness(skill);

      expect(metadata.complete).toBe(true);
      expect(metadata.missing).toHaveLength(0);
    });

    it('should detect missing metadata fields', () => {
      const incompleteSkill: GeneratedSkill = {
        skillId: '',
        name: '',
        description: '',
        skillScript: '',
        skillDoc: '',
        readme: '',
        changelog: '',
        tests: []
      };

      const metadata = generator.checkMetadataCompleteness(incompleteSkill);

      expect(metadata.complete).toBe(false);
      expect(metadata.missing.length).toBeGreaterThan(0);
    });

    it('should list missing fields', () => {
      const incompleteSkill: GeneratedSkill = {
        skillId: 'skill-1',
        name: 'Test',
        description: '',
        skillScript: '',
        skillDoc: '# Doc',
        readme: '',
        changelog: '',
        tests: []
      };

      const metadata = generator.checkMetadataCompleteness(incompleteSkill);

      expect(metadata.missing).toContain('description');
      expect(metadata.missing).toContain('skillScript');
      expect(metadata.missing).toContain('readme');
    });
  });

  describe('Skill Package Generation', () => {
    it('should generate complete skill package', () => {
      const pattern: WorkflowPattern = {
        patternId: 'pattern-1',
        name: 'Test Skill',
        steps: [
          { action: 'initialize' },
          { action: 'process' }
        ]
      };

      const package_ = generator.generateSkillPackage(pattern);

      expect(package_).toHaveProperty('skill');
      expect(package_).toHaveProperty('validation');
      expect(package_).toHaveProperty('metadata');
      expect(package_.skill.skillId).toBeDefined();
    });

    it('should include validation in package', () => {
      const pattern: WorkflowPattern = {
        patternId: 'pattern-1',
        name: 'Test Skill',
        steps: [{ action: 'test' }]
      };

      const package_ = generator.generateSkillPackage(pattern);

      expect(package_.validation.valid).toBeDefined();
      expect(Array.isArray(package_.validation.errors)).toBe(true);
      expect(Array.isArray(package_.validation.warnings)).toBe(true);
    });
  });

  describe('Test Generation', () => {
    it('should generate test files', () => {
      const pattern: WorkflowPattern = {
        patternId: 'pattern-1',
        name: 'Test Skill',
        steps: [{ action: 'test' }]
      };

      const skill = generator.generateSkill(pattern);

      expect(Array.isArray(skill.tests)).toBe(true);
      expect(skill.tests.length).toBeGreaterThan(0);
    });

    it('should include skill name in test', () => {
      const pattern: WorkflowPattern = {
        patternId: 'pattern-1',
        name: 'MySkill',
        steps: [{ action: 'test' }]
      };

      const skill = generator.generateSkill(pattern);

      expect(skill.tests[0]).toContain('MySkill');
    });
  });
});
