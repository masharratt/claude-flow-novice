import TransparencyMiddleware from '@claude-flow/transparency-middleware';

async function batchProcessingExample() {
  const config = TransparencyMiddleware.loadConfig('./batch-config.json');
  const middleware = new TransparencyMiddleware(config);

  await middleware.initialize();

  const tasks = [
    {
      agentId: 'backend-dev',
      output: {
        type: 'code_generation',
        context: 'Authentication service',
        result: 'Generated JWT token handler'
      },
      taskId: 'task-auth-service'
    },
    {
      agentId: 'frontend-dev',
      output: {
        type: 'ui_implementation',
        context: 'Login screen',
        result: 'Created responsive login form'
      },
      taskId: 'task-login-ui'
    }
  ];

  // Batch processing of multiple agent executions
  const processingResults = await Promise.all(
    tasks.map(task =>
      middleware.captureAgentExecution(
        task.agentId,
        task.output,
        task.taskId
      )
    )
  );

  // Aggregate and analyze batch results
  const batchAnalytics = {
    totalTasks: processingResults.length,
    successfulCaptures: processingResults.filter(result => result.status === 'success').length
  };

  console.log('Batch Processing Analytics:', batchAnalytics);

  await middleware.cleanup();
}

export default batchProcessingExample;