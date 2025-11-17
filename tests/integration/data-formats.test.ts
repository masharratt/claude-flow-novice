/**
 * Integration Test Suite: Data Formats & Validation
 *
 * Tests integration points from:
 * - Task 5.1: Edge Case Analyzer Integration
 * - Task 5.2: Markdown Validation
 * - Task 5.3: Reflection Data Persistence
 * - Task 5.4: JSON Output Parsing
 *
 * Coverage: 8 integration points
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { EdgeCaseAnalyzer } from '../../src/lib/edge-case-analyzer';
import { SkillMarkdownValidator } from '../../src/lib/skill-markdown-validator';
import { ReflectionLogger } from '../../src/lib/reflection-logger';
import { SkillOutputParser } from '../../src/lib/skill-output-parser';
import { PatchValidator } from '../../src/lib/patch-validator';
import { PatchGenerator } from '../../src/lib/patch-generator';

describe('Data Formats Integration', () => {
  let edgeAnalyzer: EdgeCaseAnalyzer;
  let markdownValidator: SkillMarkdownValidator;
  let reflectionLogger: ReflectionLogger;
  let outputParser: SkillOutputParser;
  let patchValidator: PatchValidator;
  let patchGenerator: PatchGenerator;

  beforeAll(async () => {
    edgeAnalyzer = new EdgeCaseAnalyzer();
    markdownValidator = new SkillMarkdownValidator();
    reflectionLogger = new ReflectionLogger({
      storage: 'sqlite',
      dbPath: ':memory:',
    });
    outputParser = new SkillOutputParser();
    patchValidator = new PatchValidator();
    patchGenerator = new PatchGenerator();

    await reflectionLogger.initialize();
  });

  afterAll(async () => {
    await reflectionLogger.close();
  });

  describe('Task 5.1: Edge Case Analyzer Integration', () => {
    it('should detect edge cases in input data', () => {
      const testInputs = [
        { value: null, expected: ['null_value'] },
        { value: undefined, expected: ['undefined_value'] },
        { value: '', expected: ['empty_string'] },
        { value: [], expected: ['empty_array'] },
        { value: {}, expected: ['empty_object'] },
        { value: Number.MAX_SAFE_INTEGER + 1, expected: ['unsafe_integer'] },
        { value: '\n\n\n', expected: ['whitespace_only'] },
      ];

      for (const { value, expected } of testInputs) {
        const result = edgeAnalyzer.analyzeInput(value);
        expect(result.edgeCases).toEqual(expect.arrayContaining(expected));
      }
    });

    it('should analyze execution output for anomalies', () => {
      const executionResults = [
        {
          output: null,
          status: 'success',
          expected: ['null_output'],
        },
        {
          output: { data: [] },
          status: 'success',
          expected: ['empty_result_set'],
        },
        {
          output: { confidence: 0.1 },
          status: 'success',
          expected: ['low_confidence'],
        },
        {
          output: { duration: 30000 },
          status: 'success',
          expected: ['slow_execution'],
        },
      ];

      for (const { output, status, expected } of executionResults) {
        const result = edgeAnalyzer.analyzeOutput({ output, status });
        expect(result.anomalies).toEqual(expect.arrayContaining(expected));
      }
    });

    it('should provide actionable recommendations for edge cases', () => {
      const edgeCase = {
        type: 'null_value',
        context: { field: 'api_key', operation: 'authentication' },
      };

      const recommendations = edgeAnalyzer.getRecommendations(edgeCase);

      expect(recommendations).toContain('add_null_check');
      expect(recommendations).toContain('provide_default_value');
    });

    it('should track edge case patterns across executions', async () => {
      // Simulate multiple executions with similar edge cases
      for (let i = 0; i < 5; i++) {
        edgeAnalyzer.recordEdgeCase({
          type: 'timeout',
          timestamp: Date.now(),
          context: { operation: 'api_call' },
        });
      }

      const patterns = edgeAnalyzer.getPatterns();
      const timeoutPattern = patterns.find(p => p.type === 'timeout');

      expect(timeoutPattern).toBeTruthy();
      expect(timeoutPattern.frequency).toBeGreaterThanOrEqual(5);
    });
  });

  describe('Task 5.2: Markdown Validation', () => {
    it('should validate skill markdown structure', () => {
      const validMarkdown = `# Skill Name

## Description
This is a valid skill description.

## Usage
\`\`\`bash
./skill.sh
\`\`\`

## Parameters
- param1: Description
- param2: Description
`;

      const result = markdownValidator.validate(validMarkdown);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing required sections', () => {
      const invalidMarkdown = `# Skill Name

Some content here.
`;

      const result = markdownValidator.validate(invalidMarkdown);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ code: 'MISSING_SECTION', section: 'Description' })
      );
    });

    it('should validate code block syntax', () => {
      const invalidCodeBlock = `# Skill

## Usage
\`\`\`bash
echo "unclosed code block
`;

      const result = markdownValidator.validate(invalidCodeBlock);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ code: 'INVALID_CODE_BLOCK' })
      );
    });

    it('should validate frontmatter metadata', () => {
      const markdownWithFrontmatter = `---
id: test-skill
version: 1.0.0
author: test
category: testing
---

# Test Skill

Content here.
`;

      const result = markdownValidator.validate(markdownWithFrontmatter);
      expect(result.valid).toBe(true);
      expect(result.metadata).toEqual({
        id: 'test-skill',
        version: '1.0.0',
        author: 'test',
        category: 'testing',
      });
    });

    it('should support custom validation rules', () => {
      markdownValidator.addRule('require-examples', (content) => {
        if (!content.includes('## Examples')) {
          return {
            code: 'MISSING_EXAMPLES',
            message: 'Skill must include examples section',
            severity: 'warning',
          };
        }
        return null;
      });

      const markdown = `# Skill

## Description
Test skill
`;

      const result = markdownValidator.validate(markdown);
      expect(result.warnings).toContainEqual(
        expect.objectContaining({ code: 'MISSING_EXAMPLES' })
      );
    });
  });

  describe('Task 5.3: Reflection Data Persistence', () => {
    it('should store reflection entries', async () => {
      const reflection = {
        agentId: 'agent-001',
        taskId: 'task-001',
        iteration: 1,
        timestamp: new Date().toISOString(),
        content: {
          observations: ['Processed 100 items', 'Confidence improving'],
          decisions: ['Continue with current approach'],
          learnings: ['Pattern X works well for this task type'],
        },
      };

      await reflectionLogger.log(reflection);

      const retrieved = await reflectionLogger.query({
        agentId: 'agent-001',
        taskId: 'task-001',
      });

      expect(retrieved).toHaveLength(1);
      expect(retrieved[0].content.observations).toEqual(reflection.content.observations);
    });

    it('should support reflection queries with filters', async () => {
      // Create multiple reflections
      for (let i = 1; i <= 5; i++) {
        await reflectionLogger.log({
          agentId: `agent-${i}`,
          taskId: 'task-001',
          iteration: i,
          timestamp: new Date().toISOString(),
          content: {
            confidence: 0.5 + (i * 0.1),
          },
        });
      }

      // Query high confidence reflections
      const highConfidence = await reflectionLogger.query({
        taskId: 'task-001',
        'content.confidence': { $gte: 0.8 },
      });

      expect(highConfidence.length).toBeGreaterThan(0);
      highConfidence.forEach(r => {
        expect(r.content.confidence).toBeGreaterThanOrEqual(0.8);
      });
    });

    it('should aggregate reflection data across iterations', async () => {
      const taskId = 'aggregation-test';

      for (let i = 1; i <= 10; i++) {
        await reflectionLogger.log({
          agentId: 'agent-001',
          taskId,
          iteration: i,
          content: {
            confidence: 0.6 + (i * 0.03),
            itemsProcessed: i * 10,
          },
        });
      }

      const aggregated = await reflectionLogger.aggregate({
        taskId,
        fields: ['content.confidence', 'content.itemsProcessed'],
        operations: ['avg', 'max', 'min'],
      });

      expect(aggregated.confidence.avg).toBeCloseTo(0.75, 1);
      expect(aggregated.itemsProcessed.max).toBe(100);
    });

    it('should support temporal reflection queries', async () => {
      const now = Date.now();

      await reflectionLogger.log({
        agentId: 'agent-001',
        taskId: 'temporal-test',
        timestamp: new Date(now - 3600000).toISOString(), // 1 hour ago
        content: { message: 'old' },
      });

      await reflectionLogger.log({
        agentId: 'agent-001',
        taskId: 'temporal-test',
        timestamp: new Date(now - 60000).toISOString(), // 1 minute ago
        content: { message: 'recent' },
      });

      const recentReflections = await reflectionLogger.query({
        taskId: 'temporal-test',
        timestamp: { $gte: new Date(now - 120000).toISOString() },
      });

      expect(recentReflections).toHaveLength(1);
      expect(recentReflections[0].content.message).toBe('recent');
    });
  });

  describe('Task 5.4: JSON Output Parsing', () => {
    it('should parse structured JSON output from skills', () => {
      const skillOutput = `
Some text before JSON...

\`\`\`json
{
  "status": "success",
  "confidence": 0.92,
  "deliverables": ["file1.ts", "file2.ts"],
  "metrics": {
    "duration": 1234,
    "linesChanged": 45
  }
}
\`\`\`

Some text after JSON...
`;

      const parsed = outputParser.parse(skillOutput);

      expect(parsed.status).toBe('success');
      expect(parsed.confidence).toBe(0.92);
      expect(parsed.deliverables).toEqual(['file1.ts', 'file2.ts']);
      expect(parsed.metrics.duration).toBe(1234);
    });

    it('should handle malformed JSON gracefully', () => {
      const malformedOutput = `
\`\`\`json
{
  "status": "success",
  "confidence": 0.92,
  // Missing closing brace
\`\`\`
`;

      const result = outputParser.parse(malformedOutput, { strict: false });

      expect(result.parseError).toBeTruthy();
      expect(result.rawContent).toContain('Missing closing brace');
    });

    it('should extract multiple JSON blocks', () => {
      const multiBlockOutput = `
First result:
\`\`\`json
{"iteration": 1, "confidence": 0.75}
\`\`\`

Second result:
\`\`\`json
{"iteration": 2, "confidence": 0.85}
\`\`\`
`;

      const blocks = outputParser.extractAllJsonBlocks(multiBlockOutput);

      expect(blocks).toHaveLength(2);
      expect(blocks[0].iteration).toBe(1);
      expect(blocks[1].iteration).toBe(2);
    });

    it('should validate output against schema', () => {
      const schema = {
        required: ['status', 'confidence', 'deliverables'],
        properties: {
          status: { type: 'string', enum: ['success', 'failure'] },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          deliverables: { type: 'array' },
        },
      };

      const validOutput = {
        status: 'success',
        confidence: 0.85,
        deliverables: ['file1.ts'],
      };

      const invalidOutput = {
        status: 'unknown',
        confidence: 1.5,
      };

      expect(outputParser.validateSchema(validOutput, schema).valid).toBe(true);
      expect(outputParser.validateSchema(invalidOutput, schema).valid).toBe(false);
    });

    it('should support patch format parsing and validation', () => {
      const patchOutput = `
\`\`\`patch
--- file.ts
+++ file.ts
@@ -1,3 +1,4 @@
 function test() {
+  console.log('debug');
   return true;
 }
\`\`\`
`;

      const patch = patchGenerator.parseFromOutput(patchOutput);
      expect(patch).toBeTruthy();

      const validation = patchValidator.validate(patch);
      expect(validation.valid).toBe(true);
    });
  });

  describe('Cross-Format Data Pipeline', () => {
    it('should handle complete data transformation pipeline', async () => {
      // 1. Receive raw skill output
      const rawOutput = `
# Execution Results

## Status
\`\`\`json
{
  "status": "success",
  "confidence": 0.88,
  "edgeCasesHandled": ["null_check", "empty_array"]
}
\`\`\`

## Reflection
- Successfully processed all inputs
- Identified 2 edge cases and handled gracefully
- Confidence is within acceptable range

## Deliverables
- Created backup before modification
- Applied changes successfully
- Validated output format
`;

      // 2. Parse JSON output
      const parsed = outputParser.parse(rawOutput);
      expect(parsed.status).toBe('success');

      // 3. Validate markdown structure
      const mdValidation = markdownValidator.validate(rawOutput);
      expect(mdValidation.valid).toBe(true);

      // 4. Analyze for edge cases
      const edgeAnalysis = edgeAnalyzer.analyzeOutput(parsed);
      expect(edgeAnalysis.edgeCases).toContain('null_check');

      // 5. Store reflection
      await reflectionLogger.log({
        agentId: 'pipeline-agent',
        taskId: 'pipeline-task',
        timestamp: new Date().toISOString(),
        content: {
          status: parsed.status,
          confidence: parsed.confidence,
          edgeCases: parsed.edgeCasesHandled,
        },
      });

      // 6. Query reflection
      const reflections = await reflectionLogger.query({
        agentId: 'pipeline-agent',
      });

      expect(reflections[0].content.confidence).toBe(0.88);
    });
  });

  describe('Data Format Error Handling', () => {
    it('should handle corrupted data gracefully', () => {
      const corruptedData = '\x00\x01\x02\x03Invalid UTF-8';

      const result = outputParser.parse(corruptedData, {
        strict: false,
        sanitize: true,
      });

      expect(result.parseError).toBeTruthy();
      expect(result.sanitized).toBe(true);
    });

    it('should detect and report format inconsistencies', () => {
      const inconsistentMarkdown = `
# Heading 1
### Heading 3 (skipped level 2)

## Code Block
\`\`\`
No language specified
\`\`\`

[Broken link](
`;

      const result = markdownValidator.validate(inconsistentMarkdown);

      expect(result.warnings).toContainEqual(
        expect.objectContaining({ code: 'SKIPPED_HEADING_LEVEL' })
      );
      expect(result.warnings).toContainEqual(
        expect.objectContaining({ code: 'NO_CODE_LANGUAGE' })
      );
    });

    it('should support backward compatibility with old formats', () => {
      // Old format (snake_case keys)
      const oldFormat = {
        task_id: 'task-001',
        agent_type: 'backend-developer',
        confidence_score: 0.85,
      };

      // New format (camelCase keys)
      const converted = outputParser.convertFormat(oldFormat, 'v2');

      expect(converted.taskId).toBe('task-001');
      expect(converted.agentType).toBe('backend-developer');
      expect(converted.confidenceScore).toBe(0.85);
    });
  });

  describe('Performance & Reliability', () => {
    it('should parse large JSON outputs efficiently', () => {
      const largeOutput = {
        results: Array(1000).fill(null).map((_, i) => ({
          id: i,
          data: `item-${i}`,
          metadata: { processed: true },
        })),
      };

      const jsonString = `\`\`\`json\n${JSON.stringify(largeOutput, null, 2)}\n\`\`\``;

      const start = Date.now();
      const parsed = outputParser.parse(jsonString);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(100); // Should parse in <100ms
      expect(parsed.results).toHaveLength(1000);
    });

    it('should validate markdown files within SLA', () => {
      const longMarkdown = `# Skill\n\n${'\n## Section\n\nContent.\n\n'.repeat(100)}`;

      const start = Date.now();
      const result = markdownValidator.validate(longMarkdown);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(200); // <200ms for validation
      expect(result.valid).toBe(true);
    });

    it('should handle concurrent reflection logging', async () => {
      const promises = [];

      for (let i = 0; i < 50; i++) {
        promises.push(
          reflectionLogger.log({
            agentId: `concurrent-${i}`,
            taskId: 'concurrent-test',
            content: { index: i },
          })
        );
      }

      await Promise.all(promises);

      const reflections = await reflectionLogger.query({
        taskId: 'concurrent-test',
      });

      expect(reflections).toHaveLength(50);
    });
  });
});
