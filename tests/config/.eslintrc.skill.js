/**
 * ESLint Configuration for Skill Markdown Files
 *
 * Integrates skill markdown validation into the build process.
 * Uses custom plugin for SKILL.md linting.
 *
 * @module .eslintrc.skill
 * @version 1.0.0
 */

module.exports = {
  extends: ['./.eslintrc.js'],
  plugins: ['markdown'],
  overrides: [
    {
      files: ['**/*.md'],
      processor: 'markdown/markdown',
    },
    {
      files: ['**/*.md/*.js', '**/*.md/*.ts'],
      rules: {
        'no-console': 'off',
        'import/no-unresolved': 'off',
        'no-unused-vars': 'warn',
      },
    },
    {
      // Specific rules for SKILL.md files
      files: ['**/.claude/skills/*/SKILL.md'],
      rules: {
        // Custom rule to validate skill markdown structure
        'skill-markdown-structure': 'error',
      },
    },
  ],
};
