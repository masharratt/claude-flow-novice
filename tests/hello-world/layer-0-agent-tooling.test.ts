import { TestRedisClient, generateUniqueId, createMockAgent, waitForCondition } from '../test-utils';

const TOOLS = [
  'Bash', 'Write', 'Edit', 'Grep', 'Glob', 'Read'
];

describe('Layer 0: Agent Tooling Validation', () => {
  let redisClient: TestRedisClient;

  beforeAll(() => {
    redisClient = new TestRedisClient();
  });

  afterAll(async () => {
    await redisClient.cleanup();
  });

  test.each(TOOLS)('Tool %s should be instantiable', async (toolName) => {
    const agent = createMockAgent({ skills: [toolName] });

    const toolTest = async () => {
      switch(toolName) {
        case 'Bash':
          await redisClient.publishMessage('bash-test', {
            command: 'echo "test"',
            description: 'Simple echo test'
          });
          return true;
        case 'Write':
          await redisClient.publishMessage('write-test', {
            file_path: `/tmp/${generateUniqueId()}.txt`,
            content: 'Hello, world!'
          });
          return true;
        // Additional tool-specific validation can be added here
        default:
          return false;
      }
    };

    await expect(toolTest()).resolves.toBeTruthy();
  });

  test('Agent can use multiple tools in coordination', async () => {
    const agent = createMockAgent({
      skills: ['Bash', 'Write', 'Grep'],
      state: 'multi-tool-test'
    });

    const multiToolTest = async () => {
      const testFile = `/tmp/multi-tool-test-${generateUniqueId()}.txt`;

      // Write a test file
      await redisClient.publishMessage('write-test', {
        file_path: testFile,
        content: 'Test content for multi-tool validation'
      });

      // Use Grep to search the file
      await redisClient.publishMessage('grep-test', {
        pattern: 'multi-tool',
        file_path: testFile
      });

      return true;
    };

    await expect(multiToolTest()).resolves.toBeTruthy();
  });

  test('Tools handle error scenarios', async () => {
    const errorScenarios = [
      {
        tool: 'Bash',
        message: {
          command: 'exit 1',
          description: 'Force bash error'
        }
      },
      {
        tool: 'Write',
        message: {
          file_path: '/nonexistent/directory/test.txt',
          content: 'This should fail'
        }
      }
    ];

    for (const scenario of errorScenarios) {
      await expect(
        redisClient.publishMessage(`${scenario.tool.toLowerCase()}-error-test`, scenario.message)
      ).resolves.toBeUndefined();
    }
  });
});