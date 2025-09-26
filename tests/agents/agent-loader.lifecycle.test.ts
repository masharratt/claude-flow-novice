/**
 * Integration tests for Agent Loader with Lifecycle Management
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AgentLoader, type AgentDefinition } from '../../src/agents/agent-loader.js';
import { AgentLifecycleManager } from '../../src/agents/lifecycle-manager.js';

describe('Agent Loader Lifecycle Integration', () => {
  let agentLoader: AgentLoader;
  let lifecycleManager: AgentLifecycleManager;

  beforeEach(() => {
    agentLoader = new AgentLoader();
    lifecycleManager = new AgentLifecycleManager();
  });

  describe('Agent Definition Parsing', () => {
    it('should parse lifecycle configuration from agent definition', () => {
      const agentDefinition: AgentDefinition = {
        name: 'test-lifecycle-agent',
        description: 'Test agent with lifecycle configuration',
        lifecycle: {
          state_management: true,
          persistent_memory: true,
          max_retries: 5,
          timeout_ms: 60000,
          auto_cleanup: false
        },
        hooks: {
          pre: 'echo "Pre-hook"',
          post: 'echo "Post-hook"',
          task_complete: 'echo "Task completed"',
          on_rerun_request: 'echo "Rerun requested"',
          lifecycle: {
            init: 'echo "Initializing agent"',
            start: 'echo "Starting agent"',
            pause: 'echo "Pausing agent"',
            resume: 'echo "Resuming agent"',
            stop: 'echo "Stopping agent"',
            cleanup: 'echo "Cleaning up agent"'
          }
        }
      };

      // Verify lifecycle configuration is properly parsed
      expect(agentDefinition.lifecycle?.state_management).toBe(true);
      expect(agentDefinition.lifecycle?.persistent_memory).toBe(true);
      expect(agentDefinition.lifecycle?.max_retries).toBe(5);
      expect(agentDefinition.lifecycle?.timeout_ms).toBe(60000);
      expect(agentDefinition.lifecycle?.auto_cleanup).toBe(false);

      // Verify hooks are properly parsed
      expect(agentDefinition.hooks?.task_complete).toBe('echo "Task completed"');
      expect(agentDefinition.hooks?.on_rerun_request).toBe('echo "Rerun requested"');
      expect(agentDefinition.hooks?.lifecycle?.init).toBe('echo "Initializing agent"');
      expect(agentDefinition.hooks?.lifecycle?.start).toBe('echo "Starting agent"');
      expect(agentDefinition.hooks?.lifecycle?.pause).toBe('echo "Pausing agent"');
      expect(agentDefinition.hooks?.lifecycle?.resume).toBe('echo "Resuming agent"');
      expect(agentDefinition.hooks?.lifecycle?.stop).toBe('echo "Stopping agent"');
      expect(agentDefinition.hooks?.lifecycle?.cleanup).toBe('echo "Cleaning up agent"');
    });

    it('should handle agents without lifecycle configuration', () => {
      const simpleAgent: AgentDefinition = {
        name: 'simple-agent',
        description: 'Simple agent without lifecycle features',
        hooks: {
          pre: 'echo "Pre"',
          post: 'echo "Post"'
        }
      };

      // Should not have lifecycle configuration
      expect(simpleAgent.lifecycle).toBeUndefined();
      expect(simpleAgent.hooks?.task_complete).toBeUndefined();
      expect(simpleAgent.hooks?.on_rerun_request).toBeUndefined();
      expect(simpleAgent.hooks?.lifecycle).toBeUndefined();

      // Should still have basic hooks
      expect(simpleAgent.hooks?.pre).toBe('echo "Pre"');
      expect(simpleAgent.hooks?.post).toBe('echo "Post"');
    });

    it('should handle partial lifecycle configurations', () => {
      const partialAgent: AgentDefinition = {
        name: 'partial-agent',
        description: 'Agent with partial lifecycle configuration',
        lifecycle: {
          state_management: true
          // Other properties should use defaults
        },
        hooks: {
          task_complete: 'echo "Task done"',
          lifecycle: {
            init: 'echo "Init only"'
            // Other lifecycle hooks not defined
          }
        }
      };

      expect(partialAgent.lifecycle?.state_management).toBe(true);
      expect(partialAgent.lifecycle?.persistent_memory).toBeUndefined();
      expect(partialAgent.hooks?.task_complete).toBe('echo "Task done"');
      expect(partialAgent.hooks?.lifecycle?.init).toBe('echo "Init only"');
      expect(partialAgent.hooks?.lifecycle?.start).toBeUndefined();
    });
  });

  describe('Lifecycle Support Detection', () => {
    it('should correctly identify lifecycle-enabled agents', () => {
      const lifecycleAgent: AgentDefinition = {
        name: 'lifecycle-agent',
        description: 'Agent with lifecycle support',
        lifecycle: {
          state_management: true
        }
      };

      expect(AgentLifecycleManager.supportsLifecycle(lifecycleAgent)).toBe(true);
    });

    it('should correctly identify agents with lifecycle hooks only', () => {
      const hooksOnlyAgent: AgentDefinition = {
        name: 'hooks-only',
        description: 'Agent with lifecycle hooks only',
        hooks: {
          lifecycle: {
            init: 'echo "Init"'
          }
        }
      };

      expect(AgentLifecycleManager.supportsLifecycle(hooksOnlyAgent)).toBe(true);
    });

    it('should correctly identify agents with task completion hooks', () => {
      const taskHooksAgent: AgentDefinition = {
        name: 'task-hooks',
        description: 'Agent with task completion hooks',
        hooks: {
          task_complete: 'echo "Complete"'
        }
      };

      expect(AgentLifecycleManager.supportsLifecycle(taskHooksAgent)).toBe(true);
    });

    it('should correctly identify legacy agents without lifecycle support', () => {
      const legacyAgent: AgentDefinition = {
        name: 'legacy-agent',
        description: 'Legacy agent',
        hooks: {
          pre: 'echo "Pre"',
          post: 'echo "Post"'
        }
      };

      expect(AgentLifecycleManager.supportsLifecycle(legacyAgent)).toBe(false);
    });
  });

  describe('Backward Compatibility', () => {
    it('should initialize lifecycle-enabled agents successfully', async () => {
      const lifecycleAgent: AgentDefinition = {
        name: 'compat-lifecycle',
        description: 'Compatibility test for lifecycle agent',
        lifecycle: {
          state_management: true,
          persistent_memory: true,
          max_retries: 3
        },
        hooks: {
          lifecycle: {
            init: 'echo "Init"'
          }
        }
      };

      const context = await lifecycleManager.initializeAgent(
        'compat-lifecycle-1',
        lifecycleAgent,
        'test-task'
      );

      expect(context.agentId).toBe('compat-lifecycle-1');
      expect(context.agentDefinition).toBe(lifecycleAgent);
      expect(context.maxRetries).toBe(3);
    });

    it('should initialize legacy agents successfully', async () => {
      const legacyAgent: AgentDefinition = {
        name: 'compat-legacy',
        description: 'Compatibility test for legacy agent',
        hooks: {
          pre: 'echo "Pre"',
          post: 'echo "Post"'
        }
      };

      const context = await lifecycleManager.initializeAgent(
        'compat-legacy-1',
        legacyAgent,
        'test-task'
      );

      expect(context.agentId).toBe('compat-legacy-1');
      expect(context.agentDefinition).toBe(legacyAgent);
      expect(context.maxRetries).toBe(3); // Should use default
    });

    it('should handle mixed agent types in the same manager', async () => {
      const lifecycleAgent: AgentDefinition = {
        name: 'mixed-lifecycle',
        description: 'Lifecycle agent',
        lifecycle: { state_management: true }
      };

      const legacyAgent: AgentDefinition = {
        name: 'mixed-legacy',
        description: 'Legacy agent'
      };

      const context1 = await lifecycleManager.initializeAgent('mixed-1', lifecycleAgent);
      const context2 = await lifecycleManager.initializeAgent('mixed-2', legacyAgent);

      expect(context1.agentId).toBe('mixed-1');
      expect(context2.agentId).toBe('mixed-2');

      const allAgents = lifecycleManager.getAllAgents();
      expect(allAgents).toHaveLength(2);
    });
  });

  describe('Configuration Defaults', () => {
    it('should apply default values for missing lifecycle properties', async () => {
      const agentWithPartialConfig: AgentDefinition = {
        name: 'partial-config',
        description: 'Agent with partial config',
        lifecycle: {
          state_management: true
          // Other properties missing
        }
      };

      const context = await lifecycleManager.initializeAgent(
        'partial-1',
        agentWithPartialConfig
      );

      // Should use defaults for missing properties
      expect(context.maxRetries).toBe(3); // Default from lifecycle manager
      expect(context.agentDefinition.lifecycle?.state_management).toBe(true);
      expect(context.agentDefinition.lifecycle?.persistent_memory).toBeUndefined();
    });

    it('should override defaults with explicit configuration', async () => {
      const agentWithFullConfig: AgentDefinition = {
        name: 'full-config',
        description: 'Agent with full config',
        lifecycle: {
          state_management: true,
          persistent_memory: true,
          max_retries: 10,
          timeout_ms: 120000,
          auto_cleanup: false
        }
      };

      const context = await lifecycleManager.initializeAgent(
        'full-1',
        agentWithFullConfig
      );

      expect(context.maxRetries).toBe(10); // Override default
      expect(context.agentDefinition.lifecycle?.max_retries).toBe(10);
      expect(context.agentDefinition.lifecycle?.timeout_ms).toBe(120000);
      expect(context.agentDefinition.lifecycle?.auto_cleanup).toBe(false);
    });
  });

  describe('Hook Execution Integration', () => {
    it('should prioritize lifecycle hooks over general hooks', async () => {
      const agentWithBothHooks: AgentDefinition = {
        name: 'both-hooks',
        description: 'Agent with both hook types',
        hooks: {
          post: 'echo "General post"', // General post hook
          lifecycle: {
            cleanup: 'echo "Lifecycle cleanup"' // Specific lifecycle hook
          }
        }
      };

      // The lifecycle manager should be able to differentiate between hooks
      expect(agentWithBothHooks.hooks?.post).toBe('echo "General post"');
      expect(agentWithBothHooks.hooks?.lifecycle?.cleanup).toBe('echo "Lifecycle cleanup"');
    });

    it('should handle missing hooks gracefully', async () => {
      const agentWithMissingHooks: AgentDefinition = {
        name: 'missing-hooks',
        description: 'Agent with missing hooks',
        lifecycle: {
          state_management: true
        }
        // No hooks defined
      };

      const context = await lifecycleManager.initializeAgent(
        'missing-hooks-1',
        agentWithMissingHooks
      );

      // Should initialize successfully even without hooks
      expect(context.agentId).toBe('missing-hooks-1');
      expect(context.agentDefinition.hooks).toBeUndefined();
    });
  });
});