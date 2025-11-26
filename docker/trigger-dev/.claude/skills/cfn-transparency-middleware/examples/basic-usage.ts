import TransparencyMiddleware from '@claude-flow/transparency-middleware';

async function basicUsageExample() {
  // Load configuration from config file
  const config = TransparencyMiddleware.loadConfig('./config.json');

  // Initialize the middleware
  const middleware = new TransparencyMiddleware(config);

  try {
    // Initialize the middleware (connects to storage, sets up event listeners)
    await middleware.initialize();

    // Capture an agent's execution
    const agentOutput = {
      type: 'bash_command',
      command: 'npm install',
      result: 'Installed 42 packages',
      timestamp: new Date().toISOString()
    };

    await middleware.captureAgentExecution(
      'backend-dev',
      agentOutput,
      'task-dependency-installation'
    );

    // Optional: Retrieve recent memories for the task
    const taskMemories = await middleware.queryMemories('task-dependency-installation');
    console.log('Task Memories:', taskMemories);
  } catch (error) {
    console.error('Middleware error:', error);
  } finally {
    // Always clean up to release resources
    await middleware.cleanup();
  }
}

export default basicUsageExample;