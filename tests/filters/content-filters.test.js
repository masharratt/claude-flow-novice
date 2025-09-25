/**
 * TDD Tests for Content Filtering Integration - Checkpoint 1.2
 *
 * SUCCESS CRITERIA:
 * - Blocks 95% of unnecessary .md generation
 * - Maintains <50ms processing overhead
 * - Must pass 100% before implementation
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { ContentFilters } from '../../src/filters/content-filters.js';

describe('Content Filtering Integration - Checkpoint 1.2', () => {
  let contentFilters;

  beforeEach(() => {
    contentFilters = new ContentFilters();
    jest.clearAllMocks();
  });

  describe('Performance Requirements', () => {
    test('should process filtering in less than 50ms', async () => {
      const startTime = performance.now();

      const requests = [
        { type: 'write', path: 'README.md', content: 'Auto-generated docs' },
        { type: 'write', path: 'CHANGELOG.md', content: 'Auto-generated changelog' },
        { type: 'write', path: 'src/component.js', content: 'const component = {}' },
        { type: 'write', path: 'docs/api.md', content: 'Auto-generated API docs' },
        { type: 'write', path: 'test/component.test.js', content: 'describe("test")' }
      ];

      const results = await contentFilters.filterRequests(requests);

      const processingTime = performance.now() - startTime;
      expect(processingTime).toBeLessThan(50);
      expect(results).toBeDefined();
    });

    test('should handle large batches efficiently', async () => {
      const largeRequests = Array(100).fill(null).map((_, i) => ({
        type: 'write',
        path: `file${i}.md`,
        content: `Auto-generated content ${i}`
      }));

      const startTime = performance.now();
      await contentFilters.filterRequests(largeRequests);
      const processingTime = performance.now() - startTime;

      expect(processingTime).toBeLessThan(200); // Allow more time for large batches
    });
  });

  describe('Markdown File Blocking', () => {
    test('should block 95% of unnecessary .md files', async () => {
      const requests = [
        // Should be blocked (unnecessary)
        { type: 'write', path: 'README.md', content: 'Auto-generated readme', trigger: 'auto' },
        { type: 'write', path: 'CHANGELOG.md', content: 'Auto-generated changelog', trigger: 'auto' },
        { type: 'write', path: 'docs/generated.md', content: 'Auto-generated docs', trigger: 'auto' },
        { type: 'write', path: 'API.md', content: 'Auto-generated API', trigger: 'auto' },
        { type: 'write', path: 'GUIDE.md', content: 'Auto-generated guide', trigger: 'auto' },
        { type: 'write', path: 'TUTORIAL.md', content: 'Auto-generated tutorial', trigger: 'auto' },
        { type: 'write', path: 'DOCS.md', content: 'Auto-generated documentation', trigger: 'auto' },
        { type: 'write', path: 'HELP.md', content: 'Auto-generated help', trigger: 'auto' },
        { type: 'write', path: 'USAGE.md', content: 'Auto-generated usage', trigger: 'auto' },
        { type: 'write', path: 'EXAMPLES.md', content: 'Auto-generated examples', trigger: 'auto' },

        // Should be allowed (necessary/explicit)
        { type: 'write', path: 'src/component.js', content: 'const component = {}' },
        { type: 'write', path: 'test/component.test.js', content: 'describe("test")' },
        { type: 'write', path: 'config/settings.json', content: '{}' },
        { type: 'write', path: 'package.json', content: '{}' },
        { type: 'write', path: 'important-notes.md', content: 'User requested content', trigger: 'explicit' }
      ];

      const results = await contentFilters.filterRequests(requests);

      const blockedMdFiles = requests.filter(r =>
        r.path.endsWith('.md') &&
        r.trigger === 'auto' &&
        !results.allowed.some(allowed => allowed.path === r.path)
      ).length;

      const blockingRate = blockedMdFiles / requests.filter(r => r.path.endsWith('.md') && r.trigger === 'auto').length;

      expect(blockingRate).toBeGreaterThanOrEqual(0.95); // 95% blocking rate
    });

    test('should allow explicitly requested markdown files', async () => {
      const explicitRequests = [
        { type: 'write', path: 'user-requested.md', content: 'User content', trigger: 'explicit' },
        { type: 'write', path: 'IMPORTANT.md', content: 'Critical content', trigger: 'explicit' }
      ];

      const results = await contentFilters.filterRequests(explicitRequests);

      expect(results.allowed).toHaveLength(2);
      expect(results.blocked).toHaveLength(0);
    });
  });
});