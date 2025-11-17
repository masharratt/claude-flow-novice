# Skill Migration Plan v1.0

**Created:** 2025-11-16
**Status:** Active
**Priority:** High
**Estimated Effort:** 2-4 hours

## Executive Summary

**Current State:**
- Total Skills: 57
- Compliant: 3 skills (5%)
- Non-Compliant: 54 skills (95%)
- **Compliance Rate: 5%**

**Target State:**
- 100% compliance with Skill Markdown Format Specification v1.0
- All skills validated with automated tooling
- CI/CD integration for ongoing compliance

**Timeline:** 1 week from approval

---

## Table of Contents

- [Migration Scope](#migration-scope)
- [Compliance Analysis](#compliance-analysis)
- [Migration Strategy](#migration-strategy)
- [Implementation Plan](#implementation-plan)
- [Risk Mitigation](#risk-mitigation)
- [Validation Process](#validation-process)
- [Success Criteria](#success-criteria)

---

## Migration Scope

### In Scope

1. **Frontmatter Addition**
   - Add YAML frontmatter to 54 skills
   - Include required fields: name, version, category, status
   - Add optional fields where appropriate: author, tags

2. **Section Validation**
   - Ensure all required sections exist:
     - Overview
     - Usage
     - Examples
     - Implementation
     - Testing
   - Add missing sections with appropriate content

3. **Code Block Fixes**
   - Add language specifiers to unlabeled code blocks
   - Standardize on supported languages

4. **Content Quality**
   - Ensure sections meet minimum length (10 characters)
   - Fix heading hierarchy issues
   - Repair broken internal links

### Out of Scope

1. **Content Rewriting**
   - Not rewriting existing content
   - Not restructuring skill logic
   - Not changing skill functionality

2. **New Skills**
   - Focus on existing 57 skills only
   - New skills will follow specification from start

---

## Compliance Analysis

### Currently Compliant Skills (3)

These skills already have frontmatter and likely meet most requirements:

1. Skill 1 (check manually which 3 have frontmatter)
2. Skill 2
3. Skill 3

**Action:** Validate these against full schema, fix minor issues

### Non-Compliant Skills (54)

**Common Issues:**

| Issue | Count | Severity | Auto-Fixable |
|-------|-------|----------|--------------|
| Missing frontmatter | 54 | High | No |
| Missing sections | ~40 | Medium | No |
| Code blocks without language | ~150 | Low | Yes |
| Sections too short | ~30 | Low | No |
| Broken links | ~10 | Low | Yes |

### Migration Priority

**High Priority** (Breaking Issues - 54 skills):
- Missing frontmatter
- Missing required sections
- Invalid skill structure

**Medium Priority** (Warnings - ~40 skills):
- Short sections (<10 chars)
- Heading hierarchy issues
- Missing optional frontmatter fields

**Low Priority** (Nice-to-Have - ~30 skills):
- Code blocks without language
- Broken internal links
- Whitespace/formatting

---

## Migration Strategy

### Approach: Phased Semi-Automated Migration

**Phase 1: Automated Fixes (Week 1, Day 1-2)**
- Run auto-fix for simple issues:
  - Code block language specifiers
  - Line ending normalization
  - Trailing whitespace removal

**Phase 2: Frontmatter Generation (Week 1, Day 3-4)**
- Generate frontmatter for all 54 non-compliant skills
- Use skill directory name for `name` field
- Set version to `1.0.0` (initial)
- Infer category from skill content/location
- Set status to `active` by default

**Phase 3: Section Validation (Week 1, Day 5)**
- Identify missing required sections
- Add placeholder sections where missing
- Flag for manual content review

**Phase 4: Manual Review (Week 1, Day 6-7)**
- Human review of auto-generated content
- Fill in placeholders
- Verify categorization
- Add tags and metadata

**Phase 5: Validation & Testing (Week 2, Day 1)**
- Run full validation suite
- Generate compliance report
- Fix remaining issues

---

## Implementation Plan

### Pre-Migration Checklist

- [x] Create JSON Schema (schemas/skill-markdown-v1.schema.json)
- [x] Create specification document (docs/SKILL_MARKDOWN_FORMAT_SPECIFICATION.md)
- [x] Create validation utility (scripts/validate-all-skills.ts)
- [x] Create linting config (.markdownlint-skill.json)
- [ ] Test validation utility on sample skills
- [ ] Backup all skills (via pre-edit hooks)
- [ ] Get stakeholder approval for migration

### Step-by-Step Execution

#### Step 1: Backup All Skills

```bash
#!/bin/bash

# Create timestamped backup
BACKUP_DIR=".backups/skill-migration-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

# Copy all skills
cp -r .claude/skills "$BACKUP_DIR/"

echo "Backup created: $BACKUP_DIR"
```

#### Step 2: Generate Frontmatter

Create automated frontmatter generator:

```typescript
// scripts/add-skill-frontmatter.ts

import fs from 'fs';
import path from 'path';
import { glob } from 'glob';
import yaml from 'js-yaml';

async function addFrontmatter(skillFile: string) {
  const content = fs.readFileSync(skillFile, 'utf-8');

  // Skip if already has frontmatter
  if (content.startsWith('---')) {
    console.log(`Skipping ${skillFile} - already has frontmatter`);
    return;
  }

  const skillDir = path.basename(path.dirname(skillFile));

  // Generate frontmatter
  const frontmatter = {
    name: skillDir,
    version: '1.0.0',
    category: inferCategory(skillDir, content),
    status: 'active',
    author: 'CFN Team',
    tags: inferTags(skillDir, content)
  };

  const yamlFrontmatter = yaml.dump(frontmatter);
  const newContent = `---\n${yamlFrontmatter}---\n\n${content}`;

  fs.writeFileSync(skillFile, newContent, 'utf-8');
  console.log(`✓ Added frontmatter to ${skillDir}`);
}

function inferCategory(skillName: string, content: string): string {
  // Categorization logic
  if (skillName.includes('coord')) return 'coordination';
  if (skillName.includes('test')) return 'testing';
  if (skillName.includes('deploy')) return 'infrastructure';
  if (skillName.includes('agent')) return 'agent-management';
  if (content.includes('Redis')) return 'coordination';
  if (content.includes('docker')) return 'infrastructure';

  return 'utility'; // Default
}

function inferTags(skillName: string, content: string): string[] {
  const tags: string[] = [];

  if (content.includes('Redis')) tags.push('redis');
  if (content.includes('Docker')) tags.push('docker');
  if (content.includes('SQLite')) tags.push('sqlite');
  if (content.includes('CLI')) tags.push('cli');
  if (content.includes('test')) tags.push('testing');

  return tags.slice(0, 5); // Max 5 tags
}

// Execute
(async () => {
  const skills = await glob('.claude/skills/*/SKILL.md');

  for (const skill of skills) {
    await addFrontmatter(skill);
  }

  console.log(`\n✓ Processed ${skills.length} skills`);
})();
```

Usage:
```bash
npx ts-node scripts/add-skill-frontmatter.ts
```

#### Step 3: Add Missing Sections

```typescript
// scripts/add-missing-sections.ts

import fs from 'fs';
import { glob } from 'glob';

const REQUIRED_SECTIONS = ['Overview', 'Usage', 'Examples', 'Implementation', 'Testing'];

async function addMissingSections(skillFile: string) {
  const content = fs.readFileSync(skillFile, 'utf-8');
  const skillName = path.basename(path.dirname(skillFile));

  let updatedContent = content;

  REQUIRED_SECTIONS.forEach(section => {
    const regex = new RegExp(`##\\s+${section}`, 'i');

    if (!regex.test(content)) {
      console.log(`Adding missing section: ${section} to ${skillName}`);

      const placeholder = `\n\n## ${section}\n\n[TODO: Add ${section.toLowerCase()} content]\n`;
      updatedContent += placeholder;
    }
  });

  if (updatedContent !== content) {
    fs.writeFileSync(skillFile, updatedContent, 'utf-8');
    console.log(`✓ Updated ${skillName}`);
  }
}

// Execute
(async () => {
  const skills = await glob('.claude/skills/*/SKILL.md');

  for (const skill of skills) {
    await addMissingSections(skill);
  }
})();
```

#### Step 4: Auto-Fix Simple Issues

```bash
# Run validation with auto-fix
npm run validate-skills -- --fix

# This will:
# - Add language specifiers to code blocks
# - Fix line endings
# - Remove trailing whitespace
```

#### Step 5: Validate All Skills

```bash
# Generate compliance report
npm run validate-skills -- --report=html

# Check exit code
if [ $? -eq 0 ]; then
  echo "✅ All skills compliant!"
else
  echo "❌ Some skills need manual attention"
  npm run validate-skills -- --report=text
fi
```

#### Step 6: Manual Review

For each skill flagged in validation:

1. Open skill file
2. Review auto-generated frontmatter
3. Fill in [TODO] placeholders
4. Verify categorization is correct
5. Add appropriate tags
6. Ensure sections have meaningful content (>10 chars)
7. Re-run validation

#### Step 7: CI/CD Integration

Add to `.github/workflows/validate-skills.yml`:

```yaml
name: Validate Skills

on:
  push:
    paths:
      - '.claude/skills/**/*.md'
  pull_request:
    paths:
      - '.claude/skills/**/*.md'

jobs:
  validate:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm install

      - name: Validate skills
        run: npm run validate-skills

      - name: Generate compliance report
        if: failure()
        run: npm run validate-skills -- --report=html

      - name: Upload report
        if: failure()
        uses: actions/upload-artifact@v3
        with:
          name: skill-compliance-report
          path: skill-compliance-report.html
```

---

## Risk Mitigation

### Risk 1: Breaking Existing Skills

**Impact:** High
**Probability:** Medium

**Mitigation:**
- Create complete backup before migration
- Test validation utility on sample skills first
- Phase rollout (5 skills → 10 skills → all)
- Manual review of auto-generated content
- Version control all changes

### Risk 2: Incorrect Categorization

**Impact:** Medium
**Probability:** High

**Mitigation:**
- Human review required for all categories
- Document categorization rationale
- Create category mapping guide
- Allow recategorization post-migration

### Risk 3: Content Loss

**Impact:** High
**Probability:** Low

**Mitigation:**
- Use pre-edit backup hooks
- Never delete existing content
- Add sections, don't replace
- Git version control
- Backup before each migration step

### Risk 4: Time Overrun

**Impact:** Medium
**Probability:** Medium

**Mitigation:**
- Automated tooling for 80% of work
- Clear prioritization (high → medium → low)
- Can deploy partially (critical skills first)
- Incremental migration acceptable

---

## Validation Process

### Automated Validation

```bash
# Full validation suite
npm run validate-skills

# Expected output:
# ✅ 57/57 skills compliant
# Compliance: 100%
```

### Manual Spot Checks

Sample 10 random skills and verify:
- [ ] Frontmatter is accurate
- [ ] Category is appropriate
- [ ] Tags are relevant
- [ ] All sections have meaningful content
- [ ] Code blocks render correctly
- [ ] Links are not broken

### Regression Testing

Ensure no functionality broken:
- [ ] Skills load correctly in agents
- [ ] Agent spawning still works
- [ ] Skill imports functional
- [ ] Documentation renders properly

---

## Success Criteria

### Must Have (Required for Completion)

- [x] JSON Schema created and documented
- [x] Specification document published
- [x] Validation utility implemented
- [x] Linting configuration ready
- [ ] **100% of skills have frontmatter**
- [ ] **100% of skills have required sections**
- [ ] **≥95% compliance with full schema**
- [ ] CI/CD validation pipeline active

### Should Have (Target for Completion)

- [ ] All code blocks have language specifiers
- [ ] No broken internal links
- [ ] All sections >10 characters
- [ ] Appropriate tags on all skills
- [ ] HTML compliance report generated

### Nice to Have (Post-Migration)

- [ ] Rich metadata (dependencies, related skills)
- [ ] Skill categorization refined
- [ ] Usage analytics integration
- [ ] Auto-generated skill index

---

## Rollout Plan

### Week 1

**Day 1-2:**
- Get stakeholder approval
- Create complete backup
- Test tools on 5 sample skills

**Day 3-4:**
- Run automated frontmatter generation
- Run auto-fix for simple issues
- Generate initial compliance report

**Day 5:**
- Add missing sections (placeholders)
- Categorize skills
- Generate tags

**Day 6-7:**
- Manual review of all skills
- Fill in placeholders
- Verify accuracy
- Fix validation errors

### Week 2

**Day 1:**
- Final validation run
- Generate compliance reports
- Deploy CI/CD pipeline

**Day 2+:**
- Monitor compliance
- Address edge cases
- Documentation updates

---

## Migration Commands

### Quick Reference

```bash
# 1. Backup
./scripts/backup-skills.sh

# 2. Add frontmatter
npx ts-node scripts/add-skill-frontmatter.ts

# 3. Add missing sections
npx ts-node scripts/add-missing-sections.ts

# 4. Auto-fix
npm run validate-skills -- --fix

# 5. Validate
npm run validate-skills

# 6. Generate report
npm run validate-skills -- --report=html

# 7. Manual review
# Open skill-compliance-report.html
# Fix issues listed
# Re-run validation
```

---

## Appendix A: Skills Requiring Attention

Based on initial analysis, these skills need manual review:

**High Priority** (Missing critical sections):
- [List will be generated from validation report]

**Medium Priority** (Short sections, minor issues):
- [List will be generated from validation report]

**Low Priority** (Formatting only):
- [List will be generated from validation report]

---

## Appendix B: Category Mapping

Suggested categories for skills:

| Category | Description | Example Skills |
|----------|-------------|----------------|
| coordination | Agent coordination and communication | cfn-coordination, cfn-redis-coordination |
| testing | Testing and validation | cfn-test-runner, cfn-validation-templates |
| documentation | Documentation generation | cfn-changelog-management |
| security | Security and compliance | cfn-defense-in-depth |
| infrastructure | Infrastructure and deployment | docker-build, cfn-deployment |
| agent-management | Agent lifecycle and spawning | agent-lifecycle, cfn-agent-spawning |
| data | Data processing and analysis | cfn-dependency-extractor |
| utility | General utilities | cfn-utilities, cfn-file-operations |

---

## Approval

**Prepared By:** Backend Development Team
**Date:** 2025-11-16
**Status:** Awaiting Approval

**Sign-Off Required:**
- [ ] Technical Lead
- [ ] Product Owner
- [ ] QA Lead

---

## Metadata

**Document Version:** 1.0.0
**Last Updated:** 2025-11-16
**Related Documents:**
- `docs/SKILL_MARKDOWN_FORMAT_SPECIFICATION.md`
- `schemas/skill-markdown-v1.schema.json`
- `scripts/validate-all-skills.ts`

**Contact:** CFN Team
