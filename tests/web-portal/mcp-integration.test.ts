/**
 * @file MCP Integration Tests
 * @description Comprehensive tests for MCP system integration with Claude Flow and ruv-swarm
 */

import { describe, beforeEach, afterEach, it, expect, jest } from '@jest/globals';
import { WebSocket } from 'ws';
import { MCPIntegrationService } from '../../src/services/mcp-integration';
import { ClaudeFlowMCP } from '../../src/services/claude-flow-mcp';
import { RuvSwarmMCP } from '../../src/services/ruv-swarm-mcp';
import { mockMCPResponses } from './fixtures/mcp-responses';
import { createMockWebSocket } from './mocks/websocket-mock';

describe('MCP Integration Tests', () => {
  let mcpService: MCPIntegrationService;
  let claudeFlowMCP: ClaudeFlowMCP;
  let ruvSwarmMCP: RuvSwarmMCP;
  let mockWebSocket: WebSocket;

  beforeEach(async () => {
    // Initialize mock WebSocket
    mockWebSocket = createMockWebSocket();

    // Initialize MCP services
    claudeFlowMCP = new ClaudeFlowMCP({
      endpoint: 'ws://localhost:8080/claude-flow',
      timeout: 5000
    });

    ruvSwarmMCP = new RuvSwarmMCP({
      endpoint: 'ws://localhost:8081/ruv-swarm',
      timeout: 5000
    });

    mcpService = new MCPIntegrationService({
      claudeFlow: claudeFlowMCP,
      ruvSwarm: ruvSwarmMCP,
      webSocket: mockWebSocket
    });

    await mcpService.initialize();
  });

  afterEach(async () => {
    await mcpService.shutdown();
    jest.clearAllMocks();
  });

  describe('Claude Flow MCP Command Execution', () => {
    it('should execute swarm initialization successfully', async () => {
      // Mock successful swarm init response
      jest.spyOn(claudeFlowMCP, 'executeCommand').mockResolvedValue(
        mockMCPResponses.swarmInit.success
      );

      const result = await mcpService.executeClaudeFlowCommand('swarm_init', {
        topology: 'hierarchical',
        maxAgents: 3,
        strategy: 'auto'
      });

      expect(result.success).toBe(true);
      expect(result.data.swarmId).toBeDefined();
      expect(result.data.topology).toBe('hierarchical');
      expect(claudeFlowMCP.executeCommand).toHaveBeenCalledWith('swarm_init', {
        topology: 'hierarchical',
        maxAgents: 3,
        strategy: 'auto'
      });
    });

    it('should handle swarm initialization failure gracefully', async () => {
      // Mock failed swarm init response
      jest.spyOn(claudeFlowMCP, 'executeCommand').mockResolvedValue(
        mockMCPResponses.swarmInit.failure
      );

      const result = await mcpService.executeClaudeFlowCommand('swarm_init', {
        topology: 'invalid-topology',
        maxAgents: 3
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid topology');
      expect(result.retryable).toBe(true);
    });

    it('should execute agent spawning with proper coordination', async () => {
      // Mock agent spawn responses
      jest.spyOn(claudeFlowMCP, 'executeCommand')
        .mockResolvedValueOnce(mockMCPResponses.agentSpawn.researcher)
        .mockResolvedValueOnce(mockMCPResponses.agentSpawn.coder)
        .mockResolvedValueOnce(mockMCPResponses.agentSpawn.reviewer);

      const agents = [
        { type: 'researcher', name: 'Research Agent' },
        { type: 'coder', name: 'Code Agent' },
        { type: 'reviewer', name: 'Review Agent' }
      ];

      const results = await mcpService.spawnAgentSwarm(agents);

      expect(results.success).toBe(true);
      expect(results.agents).toHaveLength(3);
      expect(results.agents[0].type).toBe('researcher');
      expect(results.agents[1].type).toBe('coder');
      expect(results.agents[2].type).toBe('reviewer');
    });

    it('should execute task orchestration with dependency tracking', async () => {
      // Mock task orchestration response
      jest.spyOn(claudeFlowMCP, 'executeCommand').mockResolvedValue(
        mockMCPResponses.taskOrchestrate.success
      );

      const task = {
        description: 'Build authentication system',
        strategy: 'sequential',
        dependencies: ['research-phase', 'design-phase'],
        priority: 'high'
      };

      const result = await mcpService.orchestrateTask(task);

      expect(result.success).toBe(true);
      expect(result.taskId).toBeDefined();
      expect(result.estimatedDuration).toBeDefined();
      expect(result.assignedAgents).toHaveLength(3);
    });

    it('should handle command timeout and retry logic', async () => {
      // Mock timeout scenario
      jest.spyOn(claudeFlowMCP, 'executeCommand')
        .mockRejectedValueOnce(new Error('Connection timeout'))
        .mockResolvedValueOnce(mockMCPResponses.swarmStatus.success);

      const result = await mcpService.executeWithRetry('swarm_status', {}, 3);

      expect(result.success).toBe(true);
      expect(result.retryCount).toBe(1);
      expect(claudeFlowMCP.executeCommand).toHaveBeenCalledTimes(2);
    });
  });

  describe('ruv-swarm MCP Coordination', () => {
    it('should initialize ruv-swarm coordination successfully', async () => {
      jest.spyOn(ruvSwarmMCP, 'executeCommand').mockResolvedValue(
        mockMCPResponses.ruvSwarm.init.success
      );

      const result = await mcpService.initializeRuvSwarm({
        topology: 'mesh',
        maxAgents: 5,
        strategy: 'adaptive'
      });

      expect(result.success).toBe(true);
      expect(result.swarmId).toBeDefined();
      expect(result.capabilities).toContain('neural_patterns');
      expect(result.capabilities).toContain('daa_agents');
    });

    it('should coordinate neural pattern training', async () => {
      jest.spyOn(ruvSwarmMCP, 'executeCommand').mockResolvedValue(
        mockMCPResponses.ruvSwarm.neuralTrain.success
      );

      const trainingConfig = {
        iterations: 10,
        pattern: 'convergent',
        agentId: 'agent-researcher-001'
      };

      const result = await mcpService.trainNeuralPatterns(trainingConfig);

      expect(result.success).toBe(true);
      expect(result.trainingMetrics.accuracy).toBeGreaterThan(0.8);
      expect(result.trainingMetrics.convergenceRate).toBeDefined();
    });

    it('should handle DAA agent creation and adaptation', async () => {
      jest.spyOn(ruvSwarmMCP, 'executeCommand')
        .mockResolvedValueOnce(mockMCPResponses.ruvSwarm.daaCreate.success)
        .mockResolvedValueOnce(mockMCPResponses.ruvSwarm.daaAdapt.success);

      // Create DAA agent
      const createResult = await mcpService.createDAAAgent({
        id: 'daa-adaptive-001',
        cognitivePattern: 'adaptive',
        capabilities: ['code_analysis', 'pattern_recognition'],
        enableMemory: true,
        learningRate: 0.1
      });

      expect(createResult.success).toBe(true);

      // Adapt agent based on feedback
      const adaptResult = await mcpService.adaptDAAAgent('daa-adaptive-001', {
        feedback: 'Excellent pattern recognition in previous task',
        performanceScore: 0.92,
        suggestions: ['Increase learning rate', 'Add memory optimization']
      });

      expect(adaptResult.success).toBe(true);
      expect(adaptResult.adaptationMetrics.learningRateAdjustment).toBeDefined();
    });

    it('should manage knowledge sharing between agents', async () => {
      jest.spyOn(ruvSwarmMCP, 'executeCommand').mockResolvedValue(
        mockMCPResponses.ruvSwarm.knowledgeShare.success
      );

      const knowledgeTransfer = {
        sourceAgent: 'agent-researcher-001',
        targetAgents: ['agent-coder-001', 'agent-reviewer-001'],
        knowledgeDomain: 'authentication_patterns',
        knowledgeContent: {
          patterns: ['JWT', 'OAuth2', 'Session-based'],
          bestPractices: ['Token expiration', 'Secure storage', 'CSRF protection'],
          codeExamples: ['jwt-implementation.js', 'oauth-flow.js']
        }
      };

      const result = await mcpService.shareKnowledge(knowledgeTransfer);

      expect(result.success).toBe(true);
      expect(result.transferredAgents).toHaveLength(2);
      expect(result.knowledgeIntegration.compatibility).toBeGreaterThan(0.9);
    });
  });

  describe('WebSocket Message Routing', () => {
    it('should route MCP responses to correct WebSocket clients', async () => {
      const mockSend = jest.fn();
      mockWebSocket.send = mockSend;

      // Execute command that should trigger WebSocket notification
      jest.spyOn(claudeFlowMCP, 'executeCommand').mockResolvedValue(
        mockMCPResponses.agentSpawn.researcher
      );

      await mcpService.executeClaudeFlowCommand('agent_spawn', {
        type: 'researcher',
        name: 'Research Agent'
      });

      // Verify WebSocket message was sent
      expect(mockSend).toHaveBeenCalledWith(
        expect.stringContaining('"type":"agent_spawned"')
      );

      const sentMessage = JSON.parse(mockSend.mock.calls[0][0]);
      expect(sentMessage.data.agentType).toBe('researcher');
      expect(sentMessage.data.agentName).toBe('Research Agent');
    });

    it('should broadcast swarm status updates to all connected clients', async () => {
      const mockClients = [
        { send: jest.fn(), readyState: WebSocket.OPEN },
        { send: jest.fn(), readyState: WebSocket.OPEN },
        { send: jest.fn(), readyState: WebSocket.CLOSED }
      ];

      mcpService.setWebSocketClients(mockClients);

      jest.spyOn(claudeFlowMCP, 'executeCommand').mockResolvedValue(
        mockMCPResponses.swarmStatus.success
      );

      await mcpService.broadcastSwarmStatus();

      // Verify only open connections received the broadcast
      expect(mockClients[0].send).toHaveBeenCalled();
      expect(mockClients[1].send).toHaveBeenCalled();
      expect(mockClients[2].send).not.toHaveBeenCalled();
    });

    it('should handle WebSocket connection errors gracefully', async () => {
      const mockSend = jest.fn().mockImplementation(() => {
        throw new Error('Connection closed');
      });
      mockWebSocket.send = mockSend;

      // Should not throw error when WebSocket fails
      await expect(
        mcpService.sendWebSocketMessage({ type: 'test', data: {} })
      ).resolves.toEqual({
        success: false,
        error: 'Failed to send WebSocket message: Connection closed'
      });
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle MCP service unavailability', async () => {
      jest.spyOn(claudeFlowMCP, 'executeCommand').mockRejectedValue(
        new Error('Service unavailable')
      );

      const result = await mcpService.executeClaudeFlowCommand('swarm_status');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Service unavailable');
      expect(result.fallbackExecuted).toBe(true);
    });

    it('should implement circuit breaker pattern for failing services', async () => {
      // Simulate multiple consecutive failures
      jest.spyOn(claudeFlowMCP, 'executeCommand').mockRejectedValue(
        new Error('Service error')
      );

      // Execute multiple commands to trigger circuit breaker
      for (let i = 0; i < 5; i++) {
        await mcpService.executeClaudeFlowCommand('test_command');
      }

      // Circuit breaker should be open
      expect(mcpService.isCircuitBreakerOpen('claude-flow')).toBe(true);

      // Next call should fail fast without executing
      const result = await mcpService.executeClaudeFlowCommand('another_command');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Circuit breaker is open');
    });

    it('should recover from transient network issues', async () => {
      let callCount = 0;
      jest.spyOn(claudeFlowMCP, 'executeCommand').mockImplementation(async () => {
        callCount++;
        if (callCount <= 2) {
          throw new Error('Network timeout');
        }
        return mockMCPResponses.swarmStatus.success;
      });

      const result = await mcpService.executeWithExponentialBackoff(
        'swarm_status',
        {},
        { maxRetries: 3, baseDelay: 100 }
      );

      expect(result.success).toBe(true);
      expect(result.retryCount).toBe(2);
      expect(callCount).toBe(3);
    });

    it('should validate MCP response integrity', async () => {
      // Mock malformed response
      jest.spyOn(claudeFlowMCP, 'executeCommand').mockResolvedValue({
        // Missing required fields
        data: { incomplete: true }
      });

      const result = await mcpService.executeClaudeFlowCommand('swarm_init', {
        topology: 'hierarchical'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid response format');
      expect(result.validationErrors).toBeDefined();
    });

    it('should handle concurrent command execution safely', async () => {
      jest.spyOn(claudeFlowMCP, 'executeCommand').mockImplementation(
        async () => {
          // Simulate processing delay
          await new Promise(resolve => setTimeout(resolve, 100));
          return mockMCPResponses.swarmStatus.success;
        }
      );

      // Execute multiple commands concurrently
      const promises = Array.from({ length: 5 }, () =>
        mcpService.executeClaudeFlowCommand('concurrent_test')
      );

      const results = await Promise.all(promises);

      // All should succeed
      results.forEach(result => {
        expect(result.success).toBe(true);
      });

      // Verify no race conditions in internal state
      expect(mcpService.getInternalState().commandQueue.length).toBe(0);
    });
  });

  describe('Performance and Monitoring', () => {
    it('should track command execution metrics', async () => {
      jest.spyOn(claudeFlowMCP, 'executeCommand').mockResolvedValue(
        mockMCPResponses.swarmStatus.success
      );

      const startTime = Date.now();
      await mcpService.executeClaudeFlowCommand('swarm_status');

      const metrics = mcpService.getExecutionMetrics();
      expect(metrics.totalCommands).toBe(1);
      expect(metrics.successRate).toBe(1.0);
      expect(metrics.averageLatency).toBeLessThan(1000);
    });

    it('should monitor WebSocket connection health', async () => {
      const healthCheck = await mcpService.performHealthCheck();

      expect(healthCheck.claudeFlow).toBeDefined();
      expect(healthCheck.ruvSwarm).toBeDefined();
      expect(healthCheck.webSocket).toBeDefined();
      expect(healthCheck.overall.status).toMatch(/^(healthy|degraded|unhealthy)$/);
    });

    it('should handle memory management for long-running sessions', async () => {
      // Simulate long-running session with many commands
      for (let i = 0; i < 100; i++) {
        jest.spyOn(claudeFlowMCP, 'executeCommand').mockResolvedValue(
          mockMCPResponses.swarmStatus.success
        );
        await mcpService.executeClaudeFlowCommand(`command_${i}`);
      }

      const memoryUsage = mcpService.getMemoryUsage();
      expect(memoryUsage.totalCommands).toBe(100);
      expect(memoryUsage.memoryLeaks).toBe(false);
      expect(memoryUsage.garbageCollectionCount).toBeGreaterThan(0);
    });
  });
});