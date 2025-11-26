import TransparencyMiddleware from '@claude-flow/transparency-middleware';

interface AgentFilter {
  ignoreSensitiveCommands: boolean;
  maxEventSizeBytes: number;
  agentWhitelist: string[];
}

async function customFilteringExample() {
  const filterConfig: AgentFilter = {
    ignoreSensitiveCommands: true,
    maxEventSizeBytes: 5120,  // 5KB limit
    agentWhitelist: ['backend-dev', 'devops', 'security-audit']
  };

  const config = TransparencyMiddleware.loadConfig('./config.json');
  config.filters = filterConfig;

  const middleware = new TransparencyMiddleware(config);

  await middleware.initialize();

  const sensitiveOutput = {
    type: 'bash_command',
    command: 'aws configure',  // Sensitive command
    agentId: 'rogue-agent'     // Not in whitelist
  };

  const allowedOutput = {
    type: 'code_generation',
    command: 'implement user authentication',
    agentId: 'backend-dev'
  };

  try {
    // This should be filtered out
    const sensitiveResult = await middleware.captureAgentExecution(
      sensitiveOutput.agentId,
      sensitiveOutput,
      'task-sensitive'
    );

    // This should be captured
    const allowedResult = await middleware.captureAgentExecution(
      allowedOutput.agentId,
      allowedOutput,
      'task-allowed'
    );

    console.log('Filtering Results:', {
      sensitiveResult,
      allowedResult
    });
  } catch (error) {
    console.error('Filtering Error:', error);
  } finally {
    await middleware.cleanup();
  }
}

export default customFilteringExample;